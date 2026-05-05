import { format, addDays, subDays } from "date-fns";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import {
  adr,
  nightsBookedInRange,
  occupancyRate,
  totalRevenueInRange,
} from "@/lib/kpi";
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

  const [{ data: reservations }, { data: prices }, { data: cleanings }] =
    await Promise.all([
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
    ]);

  const reservationsList = reservations ?? [];
  const revenue30 = totalRevenueInRange(reservationsList, last30);
  const nights30 = nightsBookedInRange(reservationsList, last30);
  const occ30 = occupancyRate(reservationsList, last30, 1);

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

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-neutral-200 bg-white p-5">
          <h2 className="text-sm font-semibold">Upcoming reservations</h2>
          {reservationsList.filter((r) => new Date(r.check_in) >= now).length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500">No upcoming reservations.</p>
          ) : (
            <ul className="mt-3 divide-y divide-neutral-100">
              {reservationsList
                .filter((r) => new Date(r.check_in) >= now)
                .slice(0, 8)
                .map((r, i) => (
                  <li key={i} className="flex items-center justify-between py-2 text-sm">
                    <div>
                      <div className="font-medium">{r.guest_name ?? "Reserved"}</div>
                      <div className="text-xs text-neutral-500">{r.source}</div>
                    </div>
                    <div className="text-right text-xs text-neutral-600">
                      {format(new Date(r.check_in), "MMM d")} →{" "}
                      {format(new Date(r.check_out), "MMM d")}
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-neutral-200 bg-white p-5">
          <h2 className="text-sm font-semibold">Pricing (next 30 days)</h2>
          {!prices || prices.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500">
              No PriceLabs data synced yet.
            </p>
          ) : (
            <ul className="mt-3 max-h-72 divide-y divide-neutral-100 overflow-y-auto">
              {prices.map((p) => (
                <li key={p.date} className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-neutral-700">{format(new Date(p.date), "EEE MMM d")}</span>
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

        <section className="rounded-lg border border-neutral-200 bg-white p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold">Cleanings</h2>
          {!cleanings || cleanings.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500">No cleanings on the schedule.</p>
          ) : (
            <ul className="mt-3 divide-y divide-neutral-100">
              {cleanings.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <div className="font-medium">{c.cleaner_name ?? "Unassigned"}</div>
                    <div className="text-xs uppercase tracking-wide text-neutral-500">{c.status}</div>
                  </div>
                  <div className="text-right text-xs text-neutral-600">
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
