import {
  startOfMonth,
  endOfMonth,
  startOfYear,
  startOfWeek,
  addDays,
  format,
  differenceInDays,
  getDaysInMonth,
} from "date-fns";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatPercent } from "@/lib/utils";
import {
  adr,
  nightsBookedInRange,
  occupancyRate,
  totalRevenueInRange,
} from "@/lib/kpi";

import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { GlassCard } from "@/components/glass-card";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const now = new Date();

  const ranges = {
    week: { start: startOfWeek(now, { weekStartsOn: 1 }), end: addDays(now, 1) },
    month: { start: startOfMonth(now), end: addDays(endOfMonth(now), 1) },
    ytd: { start: startOfYear(now), end: addDays(now, 1) },
  };

  const [
    { data: properties },
    { data: reservations },
    { data: cleanings },
    { data: pendingDrafts },
    { data: syncLogs },
    { data: alerts30 },
  ] = await Promise.all([
    supabase.from("properties").select("id, name, status").eq("status", "active"),
    supabase
      .from("reservations")
      .select("property_id, check_in, check_out, gross_revenue, guest_name, source")
      .gte("check_out", format(ranges.ytd.start, "yyyy-MM-dd")),
    supabase
      .from("cleanings")
      .select("id, property_id, scheduled_for, cleaner_name, status")
      .gte("scheduled_for", now.toISOString())
      .order("scheduled_for", { ascending: true })
      .limit(5),
    supabase.from("message_drafts").select("id").eq("status", "pending"),
    supabase
      .from("sync_log")
      .select("source, status, started_at")
      .order("started_at", { ascending: false })
      .limit(10),
    // Reservations in next 30 days for gap detection
    supabase
      .from("reservations")
      .select("property_id, check_in, check_out")
      .gte("check_out", format(now, "yyyy-MM-dd"))
      .lte("check_in", format(addDays(now, 30), "yyyy-MM-dd")),
  ]);

  const propertyCount = properties?.length ?? 0;
  const reservationsList = reservations ?? [];

  const revenueMTD = totalRevenueInRange(reservationsList, ranges.month);
  const revenueYTD = totalRevenueInRange(reservationsList, ranges.ytd);
  const nightsMTD = nightsBookedInRange(reservationsList, ranges.month);
  const occMTD = occupancyRate(reservationsList, ranges.month, propertyCount);
  const adrMTD = adr(revenueMTD, nightsMTD);

  // ── Revenue forecast for current month ──────────────────────────────────────
  // Booked nights remaining (check_in in future) × ADR
  const daysInMonth = getDaysInMonth(now);
  const daysRemaining = daysInMonth - now.getDate();
  const futureRes = reservationsList.filter(
    (r) =>
      new Date(r.check_in) >= now &&
      new Date(r.check_in) <= endOfMonth(now),
  );
  const futureNights = nightsBookedInRange(futureRes, {
    start: now,
    end: addDays(endOfMonth(now), 1),
  });
  const forecastIncrement = adrMTD > 0 ? futureNights * adrMTD : 0;
  const revenueForecast = revenueMTD + forecastIncrement;

  // ── Property health scores ──────────────────────────────────────────────────
  const propMap = new Map((properties ?? []).map((p) => [p.id, p.name]));
  const in14 = format(addDays(now, 14), "yyyy-MM-dd");
  const todayStr = format(now, "yyyy-MM-dd");

  type HealthScore = { id: string; name: string; score: number; status: string; issues: string[] };
  const healthScores: HealthScore[] = (properties ?? []).map((prop) => {
    const issues: string[] = [];
    let score = 100;

    const propRes = (alerts30 ?? []).filter((r) => r.property_id === prop.id);
    const hasBookingNext14 = propRes.some(
      (r) => r.check_in <= in14 && r.check_out >= todayStr,
    );
    if (!hasBookingNext14) { issues.push("No bookings next 14 days"); score -= 25; }

    // Check for recent sync errors
    const latestSync = (syncLogs ?? []).find((s) => s.source === "airbnb-ical");
    if (latestSync?.status === "error") { issues.push("iCal sync failing"); score -= 20; }

    // Vacancy gap check
    const sorted = propRes.sort((a, b) => new Date(a.check_in).getTime() - new Date(b.check_in).getTime());
    for (let i = 0; i < sorted.length - 1; i++) {
      const gap = differenceInDays(new Date(sorted[i + 1].check_in), new Date(sorted[i].check_out));
      if (gap >= 1 && gap <= 2) { issues.push(`${gap}-night gap detected`); score -= 10; break; }
    }

    const status = score >= 80 ? "healthy" : score >= 60 ? "fair" : "needs attention";
    return { id: prop.id, name: prop.name, score: Math.max(0, score), status, issues };
  });

  const upcomingCheckins = reservationsList
    .filter((r) => new Date(r.check_in) >= now)
    .sort((a, b) => new Date(a.check_in).getTime() - new Date(b.check_in).getTime())
    .slice(0, 5);

  const draftsCount = pendingDrafts?.length ?? 0;

  // ── Sync health ─────────────────────────────────────────────────────────────
  const sourceLatest = new Map<string, { status: string; started_at: string }>();
  for (const log of syncLogs ?? []) {
    if (!sourceLatest.has(log.source)) sourceLatest.set(log.source, log);
  }
  const anySyncError = [...sourceLatest.values()].some((l) => l.status === "error");

  return (
    <div>
      <PageHeader
        title="Portfolio overview"
        description={`${propertyCount} active ${propertyCount === 1 ? "property" : "properties"} · ${format(now, "EEEE, MMM d")}`}
      />

      {/* Alert banners */}
      {draftsCount > 0 && (
        <Link
          href="/messages"
          className="mb-4 flex items-center gap-3 rounded-lg border border-gold-500/50 bg-gold-500/15 p-3 text-sm text-cream-50 backdrop-blur-sm transition hover:bg-gold-500/25"
        >
          <span className="text-lg">💬</span>
          <span>
            <strong>{draftsCount} AI draft{draftsCount > 1 ? "s" : ""}</strong> waiting for your review
          </span>
          <span className="ml-auto text-xs">Review →</span>
        </Link>
      )}
      {anySyncError && (
        <Link
          href="/settings"
          className="mb-4 flex items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300 backdrop-blur-sm transition hover:bg-red-500/20"
        >
          <span className="text-lg">🚨</span>
          <span>A sync source is failing — data may be stale</span>
          <span className="ml-auto text-xs">View →</span>
        </Link>
      )}

      {/* KPI stat cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Revenue MTD" value={formatCurrency(revenueMTD)} />
        <StatCard
          label="Forecast (month-end)"
          value={formatCurrency(revenueForecast)}
          hint={`+${formatCurrency(forecastIncrement)} projected`}
        />
        <StatCard
          label="Occupancy MTD"
          value={formatPercent(occMTD, 1)}
          hint={`${nightsMTD} booked nights`}
        />
        <StatCard label="ADR MTD" value={formatCurrency(adrMTD)} />
      </div>

      {/* Second row */}
      <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Revenue YTD" value={formatCurrency(revenueYTD)} />
        <StatCard label="Active properties" value={String(propertyCount)} />
        <StatCard label="Days remaining (month)" value={String(daysRemaining)} />
        <StatCard
          label="Pending drafts"
          value={String(draftsCount)}
          hint={draftsCount > 0 ? "Needs review" : "All clear"}
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {/* Upcoming check-ins */}
        <GlassCard>
          <h2 className="text-sm font-semibold text-cream-50">Upcoming check-ins</h2>
          {upcomingCheckins.length === 0 ? (
            <p className="mt-3 text-sm text-cream-200/60">No upcoming reservations synced yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-navy-700/40">
              {upcomingCheckins.map((r, i) => (
                <li key={i} className="flex items-center justify-between py-2">
                  <div>
                    <div className="text-sm font-medium text-cream-50">
                      {propMap.get(r.property_id) ?? "Unknown property"}
                    </div>
                    <div className="text-xs text-cream-200/60">
                      {r.guest_name ?? "Reserved"} · {r.source}
                    </div>
                  </div>
                  <div className="text-right text-xs text-cream-200/80">
                    <div>{format(new Date(r.check_in), "MMM d")}</div>
                    <div className="text-cream-200/50">→ {format(new Date(r.check_out), "MMM d")}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>

        {/* Next cleanings */}
        <GlassCard>
          <h2 className="text-sm font-semibold text-cream-50">Next cleanings</h2>
          {!cleanings || cleanings.length === 0 ? (
            <p className="mt-3 text-sm text-cream-200/60">No cleanings on the schedule.</p>
          ) : (
            <ul className="mt-3 divide-y divide-navy-700/40">
              {cleanings.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2">
                  <div>
                    <div className="text-sm font-medium text-cream-50">
                      {propMap.get(c.property_id) ?? "—"}
                    </div>
                    <div className="text-xs text-cream-200/60">
                      {c.cleaner_name ?? "Unassigned"} ·{" "}
                      <span
                        className={c.status === "issue" ? "text-red-400 font-semibold" : ""}
                      >
                        {c.status}
                      </span>
                    </div>
                  </div>
                  <div className="text-right text-xs text-cream-200/80">
                    {format(new Date(c.scheduled_for), "EEE MMM d, h:mma")}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
      </div>

      {/* Property health scores */}
      {healthScores.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold">Property health</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {healthScores.map((h) => {
              const color =
                h.status === "healthy"
                  ? { bar: "bg-emerald-500", badge: "bg-emerald-500/15 text-emerald-300", border: "border-emerald-500/30" }
                  : h.status === "fair"
                  ? { bar: "bg-amber-400", badge: "bg-amber-500/15 text-amber-300", border: "border-amber-500/30" }
                  : { bar: "bg-red-400", badge: "bg-red-500/15 text-red-300", border: "border-red-500/30" };
              return (
                <GlassCard key={h.id} interactive className={`p-4 ${color.border}`}>
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium text-cream-50 truncate pr-2">{h.name}</div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${color.badge}`}>
                      {h.score}
                    </span>
                  </div>
                  {/* Score bar */}
                  <div className="mt-2 h-1.5 w-full rounded-full bg-navy-800/60">
                    <div
                      className={`h-1.5 rounded-full transition-all ${color.bar}`}
                      style={{ width: `${h.score}%` }}
                    />
                  </div>
                  {h.issues.length > 0 && (
                    <ul className="mt-2 space-y-0.5">
                      {h.issues.map((issue, i) => (
                        <li key={i} className="text-[10px] text-cream-200/60">· {issue}</li>
                      ))}
                    </ul>
                  )}
                </GlassCard>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
