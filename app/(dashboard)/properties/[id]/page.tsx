import { format, addDays, subDays } from "date-fns";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import {
  adr,
  forwardOccupancy,
  nightsBookedInRange,
  occupancyRate,
  totalRevenueInRange,
} from "@/lib/kpi";
import { computeHealth } from "@/lib/health";
import { computeSignals } from "@/lib/pricing-signals";
import { buildDayStates } from "@/lib/revenue";
import { formatCurrency, formatPercent } from "@/lib/utils";

import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";

export const dynamic = "force-dynamic";

export default async function PropertyDetailPage(
  props: PageProps<"/properties/[id]">,
) {
  const { id } = await props.params;
  const supabase = await createClient();

  const { data: property } = await supabase
    .from("properties")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!property) notFound();

  const now = new Date();
  const last30 = { start: subDays(now, 30), end: now };

  const db = supabase as any; // health tables predate generated types
  const [
    { data: reservations },
    { data: prices },
    { data: cleanings },
    { data: reviews },
    { data: overdueTasks },
    { data: inventoryItems },
  ] = await Promise.all([
    supabase
      .from("reservations")
      .select("check_in, check_out, gross_revenue, guest_name, source")
      .eq("property_id", id)
      .gte("check_out", format(subDays(now, 90), "yyyy-MM-dd"))
      .order("check_in"),
    supabase
      .from("prices")
      .select("date, base_price, suggested_price, override_price")
      .eq("property_id", id)
      .gte("date", format(now, "yyyy-MM-dd"))
      .lte("date", format(addDays(now, 30), "yyyy-MM-dd"))
      .order("date"),
    supabase
      .from("cleanings")
      .select("id, scheduled_for, cleaner_name, status")
      .eq("property_id", id)
      .gte("scheduled_for", subDays(now, 14).toISOString())
      .order("scheduled_for")
      .limit(20),
    db
      .from("property_reviews")
      .select("rating, submitted_at")
      .eq("property_id", id)
      .order("submitted_at", { ascending: false })
      .limit(200),
    db
      .from("maintenance_tasks")
      .select("id")
      .eq("property_id", id)
      .eq("status", "pending")
      .lt("due_on", format(now, "yyyy-MM-dd")),
    db
      .from("inventory_items")
      .select("par_level, current_qty")
      .eq("property_id", id),
  ]);

  const reservationsList = reservations ?? [];
  const revenue30 = totalRevenueInRange(reservationsList, last30);
  const nights30 = nightsBookedInRange(reservationsList, last30);
  const occ30 = occupancyRate(reservationsList, last30, 1);

  // ── Health v2 composite ─────────────────────────────────────────────────
  const reviewRows = (reviews ?? []) as Array<{ rating: number | null; submitted_at: string | null }>;
  const ratings = reviewRows.map((r) => r.rating).filter((r): r is number => r != null);
  const lastReviewAt = reviewRows.find((r) => r.submitted_at)?.submitted_at ?? null;
  const daysSinceLastReview = lastReviewAt
    ? Math.floor((now.getTime() - new Date(lastReviewAt).getTime()) / 86400000)
    : null;
  const dayStates = buildDayStates(prices ?? [], reservationsList, now, 30);
  const signals = computeSignals({
    days: dayStates,
    forwardOccupancy: forwardOccupancy(reservationsList, now, 30, 1),
    today: format(now, "yyyy-MM-dd"),
  });
  const invRows = (inventoryItems ?? []) as Array<{ par_level: number; current_qty: number }>;
  const health = computeHealth({
    ratings,
    daysSinceLastReview,
    pricingWarnings: signals.filter((s) => s.severity === "warning").length,
    pricingOpportunities: signals.filter((s) => s.severity === "opportunity").length,
    overdueTasks: (overdueTasks ?? []).length,
    itemsBelowPar: invRows.filter((i) => i.current_qty < i.par_level).length,
  });

  return (
    <div>
      <PageHeader
        title={property.name}
        description={property.address ?? property.nickname ?? undefined}
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Revenue (last 30d)" value={formatCurrency(revenue30)} />
        <StatCard label="Nights booked (30d)" value={nights30} />
        <StatCard label="Occupancy (30d)" value={formatPercent(occ30, 1)} />
        <StatCard label="ADR (30d)" value={formatCurrency(adr(revenue30, nights30))} />
      </div>

      {/* Health v2 — composite with pillar drill-down */}
      <section className="mt-8 rounded-lg border border-navy-700/40 bg-navy-900/60 p-5 backdrop-blur-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Property health</h2>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-2xl font-bold ${
                health.grade === "A"
                  ? "text-emerald-300"
                  : health.grade === "B"
                    ? "text-gold-300"
                    : "text-red-300"
              }`}
            >
              {health.score}
            </span>
            <span className="text-xs uppercase tracking-wider text-cream-200/60">
              grade {health.grade}
            </span>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {health.pillars.map((p) => (
            <div
              key={p.key}
              className="rounded-md border border-navy-700/40 bg-navy-950/40 p-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wider text-cream-200/60">
                  {p.label}
                </span>
                <span
                  className={`text-sm font-semibold ${
                    p.score >= 85
                      ? "text-emerald-300"
                      : p.score >= 60
                        ? "text-gold-300"
                        : "text-red-300"
                  }`}
                >
                  {p.score}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-navy-800">
                <div
                  className={`h-full rounded-full ${
                    p.score >= 85
                      ? "bg-emerald-400/70"
                      : p.score >= 60
                        ? "bg-gold-400/70"
                        : "bg-red-400/70"
                  }`}
                  style={{ width: `${p.score}%` }}
                />
              </div>
              <p className="mt-1.5 text-[11px] leading-snug text-cream-200/60">{p.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-navy-700/40 bg-navy-900/60 backdrop-blur-sm p-5">
          <h2 className="text-sm font-semibold">Upcoming reservations</h2>
          {reservationsList.filter((r) => new Date(r.check_in) >= now).length === 0 ? (
            <p className="mt-3 text-sm text-cream-200/60">No upcoming reservations.</p>
          ) : (
            <ul className="mt-3 divide-y divide-navy-700/40">
              {reservationsList
                .filter((r) => new Date(r.check_in) >= now)
                .slice(0, 8)
                .map((r, i) => (
                  <li key={i} className="flex items-center justify-between py-2 text-sm">
                    <div>
                      <div className="font-medium">{r.guest_name ?? "Reserved"}</div>
                      <div className="text-xs text-cream-200/60">{r.source}</div>
                    </div>
                    <div className="text-right text-xs text-cream-200/80">
                      {format(new Date(r.check_in), "MMM d")} →{" "}
                      {format(new Date(r.check_out), "MMM d")}
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-navy-700/40 bg-navy-900/60 backdrop-blur-sm p-5">
          <h2 className="text-sm font-semibold">Pricing (next 30 days)</h2>
          {!prices || prices.length === 0 ? (
            <p className="mt-3 text-sm text-cream-200/60">
              No PriceLabs data synced yet.
            </p>
          ) : (
            <ul className="mt-3 max-h-72 divide-y divide-navy-700/40 overflow-y-auto">
              {prices.map((p) => (
                <li key={p.date} className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-cream-100">{format(new Date(p.date), "EEE MMM d")}</span>
                  <span className="font-medium">
                    {formatCurrency(
                      p.override_price ?? p.suggested_price ?? p.base_price ?? 0,
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-navy-700/40 bg-navy-900/60 backdrop-blur-sm p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold">Cleanings</h2>
          {!cleanings || cleanings.length === 0 ? (
            <p className="mt-3 text-sm text-cream-200/60">No cleanings on the schedule.</p>
          ) : (
            <ul className="mt-3 divide-y divide-navy-700/40">
              {cleanings.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <div className="font-medium">{c.cleaner_name ?? "Unassigned"}</div>
                    <div className="text-xs uppercase tracking-wide text-cream-200/60">{c.status}</div>
                  </div>
                  <div className="text-right text-xs text-cream-200/80">
                    {format(new Date(c.scheduled_for), "EEE MMM d, h:mma")}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
