import {
  startOfMonth,
  endOfMonth,
  startOfYear,
  startOfWeek,
  addDays,
  format,
} from "date-fns";

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

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const now = new Date();

  const ranges = {
    week: { start: startOfWeek(now, { weekStartsOn: 1 }), end: addDays(now, 1) },
    month: { start: startOfMonth(now), end: addDays(endOfMonth(now), 1) },
    ytd: { start: startOfYear(now), end: addDays(now, 1) },
  };

  const [{ data: properties }, { data: reservations }, { data: cleanings }] =
    await Promise.all([
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
    ]);

  const propertyCount = properties?.length ?? 0;
  const reservationsList = reservations ?? [];

  const revenueMTD = totalRevenueInRange(reservationsList, ranges.month);
  const revenueYTD = totalRevenueInRange(reservationsList, ranges.ytd);
  const nightsMTD = nightsBookedInRange(reservationsList, ranges.month);
  const occMTD = occupancyRate(reservationsList, ranges.month, propertyCount);
  const adrMTD = adr(revenueMTD, nightsMTD);

  const upcomingCheckins = reservationsList
    .filter((r) => new Date(r.check_in) >= now)
    .sort(
      (a, b) =>
        new Date(a.check_in).getTime() - new Date(b.check_in).getTime(),
    )
    .slice(0, 5);

  const propertyNames = new Map(
    (properties ?? []).map((p) => [p.id, p.name] as const),
  );

  return (
    <div>
      <PageHeader
        title="Portfolio overview"
        description={`${propertyCount} active ${propertyCount === 1 ? "property" : "properties"} • ${format(now, "EEEE, MMM d")}`}
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Revenue MTD" value={formatCurrency(revenueMTD)} />
        <StatCard label="Revenue YTD" value={formatCurrency(revenueYTD)} />
        <StatCard
          label="Occupancy MTD"
          value={formatPercent(occMTD, 1)}
          hint={`${nightsMTD} booked nights`}
        />
        <StatCard label="ADR MTD" value={formatCurrency(adrMTD)} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-cream-200 bg-white p-5">
          <h2 className="text-sm font-semibold">Upcoming check-ins</h2>
          {upcomingCheckins.length === 0 ? (
            <p className="mt-3 text-sm text-navy-500">
              No upcoming reservations synced yet.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-cream-200">
              {upcomingCheckins.map((r, i) => (
                <li key={i} className="flex items-center justify-between py-2">
                  <div>
                    <div className="text-sm font-medium">
                      {propertyNames.get(r.property_id) ?? "Unknown property"}
                    </div>
                    <div className="text-xs text-navy-500">
                      {r.guest_name ?? "Reserved"} · {r.source}
                    </div>
                  </div>
                  <div className="text-right text-xs text-navy-600">
                    <div>{format(new Date(r.check_in), "MMM d")}</div>
                    <div className="text-navy-400">
                      → {format(new Date(r.check_out), "MMM d")}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-cream-200 bg-white p-5">
          <h2 className="text-sm font-semibold">Next cleanings</h2>
          {!cleanings || cleanings.length === 0 ? (
            <p className="mt-3 text-sm text-navy-500">
              No cleanings on the schedule.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-cream-200">
              {cleanings.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2">
                  <div>
                    <div className="text-sm font-medium">
                      {propertyNames.get(c.property_id) ?? "—"}
                    </div>
                    <div className="text-xs text-navy-500">
                      {c.cleaner_name ?? "Unassigned"} · {c.status}
                    </div>
                  </div>
                  <div className="text-right text-xs text-navy-600">
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
