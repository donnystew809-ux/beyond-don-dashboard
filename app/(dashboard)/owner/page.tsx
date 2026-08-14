import { format, subMonths, addDays, startOfMonth } from "date-fns";

import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatPercent } from "@/lib/utils";
import {
  totalRevenueInRange,
  nightsBookedInRange,
  occupancyRate,
  adr,
} from "@/lib/kpi";
import { PageHeader } from "@/components/page-header";
import { GlassCard } from "@/components/glass-card";

export const dynamic = "force-dynamic";

// Owner portal — full-transparency P&L for the properties this owner has
// been granted (RLS owner_view scoping via has_owner_access). Staff see all
// properties here, which is harmless (they have richer pages elsewhere).
export default async function OwnerPortalPage() {
  const supabase = await createClient();
  const db = supabase as any;
  const now = new Date();
  const trailingStart = startOfMonth(subMonths(now, 11)); // trailing 12 months
  const upcomingEnd = addDays(now, 60);

  const [{ data: properties }, { data: reservations }, { data: expenses }] =
    await Promise.all([
      supabase.from("properties").select("id, name").order("name"),
      supabase
        .from("reservations")
        .select("property_id, guest_name, check_in, check_out, gross_revenue, net_to_owner")
        .gte("check_out", format(trailingStart, "yyyy-MM-dd"))
        .lte("check_in", format(upcomingEnd, "yyyy-MM-dd")),
      // expenses predates generated types; RLS-scoped to owner grants (0010)
      db
        .from("expenses")
        .select("property_id, amount, category, date")
        .gte("date", format(trailingStart, "yyyy-MM-dd")),
    ]);

  const props = (properties ?? []) as Array<{ id: string; name: string }>;
  type Res = {
    property_id: string;
    guest_name: string | null;
    check_in: string;
    check_out: string;
    gross_revenue: number | null;
    net_to_owner: number | null;
  };
  const resRows = (reservations ?? []) as Res[];
  const expRows = (expenses ?? []) as Array<{
    property_id: string;
    amount: number | null;
    category: string | null;
    date: string;
  }>;

  if (props.length === 0) {
    return (
      <div>
        <PageHeader title="Earnings" />
        <GlassCard className="p-10 text-center text-sm text-cream-200/60">
          You don&apos;t have owner access to any properties yet. Ask Donovan to
          set up your access.
        </GlassCard>
      </div>
    );
  }

  const trailingRange = { start: trailingStart, end: now };

  // Portfolio (their slice) rollup
  const totalRevenue = totalRevenueInRange(resRows, trailingRange);
  const totalNights = nightsBookedInRange(resRows, trailingRange);
  const occ = occupancyRate(resRows, trailingRange, props.length);
  const totalExpenses = expRows.reduce((s, e) => s + Number(e.amount ?? 0), 0);

  // Per-property
  const cards = props.map((p) => {
    const pres = resRows.filter((r) => r.property_id === p.id);
    const pexp = expRows.filter((e) => e.property_id === p.id);
    const revenue = totalRevenueInRange(pres, trailingRange);
    const nights = nightsBookedInRange(pres, trailingRange);
    const spend = pexp.reduce((s, e) => s + Number(e.amount ?? 0), 0);
    return {
      property: p,
      revenue,
      nights,
      occupancy: occupancyRate(pres, trailingRange, 1),
      adr: adr(revenue, nights),
      expenses: spend,
      net: revenue - spend,
    };
  });

  // Upcoming stays across their properties
  const todayStr = format(now, "yyyy-MM-dd");
  const upcoming = resRows
    .filter((r) => r.check_in >= todayStr)
    .sort((a, b) => a.check_in.localeCompare(b.check_in))
    .slice(0, 8);
  const nameById = new Map(props.map((p) => [p.id, p.name]));

  return (
    <div>
      <PageHeader
        title="Earnings"
        description="Trailing 12 months across your properties — full transparency."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Gross revenue (12mo)" value={formatCurrency(totalRevenue)} />
        <Stat label="Expenses (12mo)" value={formatCurrency(totalExpenses)} />
        <Stat label="Occupancy" value={formatPercent(occ)} />
        <Stat label="Nights booked" value={String(totalNights)} />
      </div>

      <section className="mb-8">
        <h3 className="gold-underline mb-3 text-sm font-semibold uppercase tracking-wider text-cream-100">
          By property
        </h3>
        <div className="grid gap-4 lg:grid-cols-2">
          {cards.map((c) => (
            <GlassCard key={c.property.id} className="p-4">
              <div className="mb-3 font-semibold text-cream-50">{c.property.name}</div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <Row k="Gross revenue" v={formatCurrency(c.revenue)} />
                <Row k="Expenses" v={formatCurrency(c.expenses)} />
                <Row k="Net" v={formatCurrency(c.net)} strong />
                <Row k="Occupancy" v={formatPercent(c.occupancy)} />
                <Row k="ADR" v={formatCurrency(c.adr)} />
                <Row k="Nights" v={String(c.nights)} />
              </dl>
            </GlassCard>
          ))}
        </div>
      </section>

      <section>
        <h3 className="gold-underline mb-3 text-sm font-semibold uppercase tracking-wider text-cream-100">
          Upcoming stays
        </h3>
        {upcoming.length === 0 ? (
          <GlassCard className="p-4 text-sm text-cream-200/60">
            No upcoming bookings in the next 60 days.
          </GlassCard>
        ) : (
          <div className="space-y-2">
            {upcoming.map((r, i) => (
              <GlassCard key={i} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm text-cream-50">
                    {r.guest_name ?? "Guest"} · {nameById.get(r.property_id)}
                  </div>
                  <div className="text-[11px] text-cream-200/50">
                    {r.check_in} → {r.check_out}
                  </div>
                </div>
                {r.gross_revenue != null && (
                  <span className="shrink-0 text-sm font-medium text-gold-300">
                    {formatCurrency(Number(r.gross_revenue))}
                  </span>
                )}
              </GlassCard>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <GlassCard className="p-4">
      <div className="text-[11px] uppercase tracking-wider text-cream-200/60">{label}</div>
      <div className="mt-1 text-xl font-semibold text-cream-50">{value}</div>
    </GlassCard>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <>
      <dt className="text-cream-200/60">{k}</dt>
      <dd className={`text-right ${strong ? "font-semibold text-gold-300" : "text-cream-50"}`}>
        {v}
      </dd>
    </>
  );
}
