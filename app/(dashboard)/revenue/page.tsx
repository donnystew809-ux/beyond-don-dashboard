import Link from "next/link";
import { format, addDays } from "date-fns";
import { ArrowRight, TrendingUp, TrendingDown, Minus } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatPercent } from "@/lib/utils";
import {
  forwardOccupancy,
  paceVsTarget,
  totalRevenueInRange,
  type PaceStatus,
} from "@/lib/kpi";
import { buildDayStates } from "@/lib/revenue";
import { computeSignals } from "@/lib/pricing-signals";

import { PageHeader } from "@/components/page-header";
import { GlassCard } from "@/components/glass-card";
import { PriceHeatmap, HeatmapLegend } from "./_components/price-heatmap";

export const dynamic = "force-dynamic";

const HORIZON = 90;

export default async function RevenuePage() {
  const supabase = await createClient();
  const today = new Date();
  const from = today;
  const to = addDays(today, HORIZON);
  const fromStr = format(from, "yyyy-MM-dd");
  const toStr = format(to, "yyyy-MM-dd");

  const [{ data: properties }, { data: prices }, { data: reservations }] =
    await Promise.all([
      supabase
        .from("properties")
        .select("id, name, pricelabs_listing_id, auto_accept_pricing")
        .eq("status", "active")
        .order("name"),
      supabase
        .from("prices")
        .select("property_id, date, base_price, suggested_price, override_price")
        .gte("date", fromStr)
        .lte("date", toStr),
      supabase
        .from("reservations")
        .select("property_id, check_in, check_out, gross_revenue")
        .gte("check_out", fromStr)
        .lte("check_in", toStr),
    ]);

  type Prop = {
    id: string;
    name: string;
    pricelabs_listing_id: string | null;
    auto_accept_pricing: boolean | null;
  };
  const props = (properties ?? []) as Prop[];
  const priceRows = (prices ?? []) as Array<{
    property_id: string;
    date: string;
    base_price: number | null;
    suggested_price: number | null;
    override_price: number | null;
  }>;
  const resRows = (reservations ?? []) as Array<{
    property_id: string;
    check_in: string;
    check_out: string;
    gross_revenue: number | null;
  }>;

  // Group by property.
  const pricesByProp = new Map<string, typeof priceRows>();
  for (const p of priceRows) {
    (pricesByProp.get(p.property_id) ?? pricesByProp.set(p.property_id, []).get(p.property_id)!).push(p);
  }
  const resByProp = new Map<string, typeof resRows>();
  for (const r of resRows) {
    (resByProp.get(r.property_id) ?? resByProp.set(r.property_id, []).get(r.property_id)!).push(r);
  }

  // Per-property rollup.
  const cards = props.map((p) => {
    const pPrices = pricesByProp.get(p.id) ?? [];
    const pRes = resByProp.get(p.id) ?? [];
    const days = buildDayStates(pPrices, pRes, from, HORIZON);
    const occ30 = forwardOccupancy(pRes, from, 30, 1);
    const pace = paceVsTarget(occ30);
    const signals = computeSignals({
      days,
      forwardOccupancy: occ30,
      today: fromStr,
    });
    const onBooks = totalRevenueInRange(
      pRes.map((r) => ({ ...r })),
      { start: from, end: to },
    );
    return { property: p, days, occ30, pace, signals, onBooks };
  });

  // Portfolio totals.
  const propertyCount = props.length || 1;
  const portfolioOcc30 = forwardOccupancy(resRows, from, 30, propertyCount);
  const portfolioOcc90 = forwardOccupancy(resRows, from, 90, propertyCount);
  const portfolioPace = paceVsTarget(portfolioOcc30);
  const portfolioRevenue = totalRevenueInRange(resRows, { start: from, end: to });
  const totalSignals = cards.reduce((n, c) => n + c.signals.length, 0);

  return (
    <div>
      <PageHeader
        title="Revenue"
        description="Your pricing cockpit — forward pacing, the 90-day calendar, and signals that flag where to move price. Powered by PriceLabs, built to run itself."
      />

      {/* Portfolio pacing strip */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatBlock
          label="30-day occupancy"
          value={formatPercent(portfolioOcc30)}
          sub={<PaceBadge status={portfolioPace.status} />}
        />
        <StatBlock label="90-day occupancy" value={formatPercent(portfolioOcc90)} />
        <StatBlock
          label="On the books (90d)"
          value={formatCurrency(portfolioRevenue)}
        />
        <StatBlock
          label="Open signals"
          value={String(totalSignals)}
          tone={totalSignals > 0 ? "gold" : "default"}
        />
      </div>

      <div className="mb-4">
        <HeatmapLegend />
      </div>

      {cards.length === 0 ? (
        <GlassCard className="p-10 text-center text-sm text-cream-200/60">
          No active properties. Add one with a PriceLabs listing ID to start.
        </GlassCard>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {cards.map(({ property, days, occ30, pace, signals, onBooks }) => (
            <Link key={property.id} href={`/revenue/${property.id}`} className="block">
              <GlassCard interactive className="p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-semibold text-cream-50">
                        {property.name}
                      </h3>
                      {property.auto_accept_pricing && (
                        <span className="shrink-0 rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-emerald-300">
                          auto
                        </span>
                      )}
                      {!property.pricelabs_listing_id && (
                        <span className="shrink-0 rounded-full bg-gold-500/20 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-gold-300">
                          not connected
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-cream-200/60">
                      <span>{formatPercent(occ30)} occ (30d)</span>
                      <PaceBadge status={pace.status} />
                      <span>{formatCurrency(onBooks)} booked</span>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-cream-200/40" />
                </div>

                <PriceHeatmap days={days} />

                {signals.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {signals.slice(0, 3).map((s, i) => (
                      <span
                        key={i}
                        className={`rounded-md px-2 py-0.5 text-[10px] ${
                          s.severity === "warning"
                            ? "bg-red-500/15 text-red-300"
                            : s.severity === "opportunity"
                              ? "bg-gold-500/15 text-gold-300"
                              : "bg-navy-700/40 text-cream-200/70"
                        }`}
                      >
                        {s.title}
                      </span>
                    ))}
                    {signals.length > 3 && (
                      <span className="rounded-md bg-navy-700/40 px-2 py-0.5 text-[10px] text-cream-200/60">
                        +{signals.length - 3} more
                      </span>
                    )}
                  </div>
                )}
              </GlassCard>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function StatBlock({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  tone?: "default" | "gold";
}) {
  return (
    <GlassCard tone={tone} className="p-4">
      <div className="text-[11px] uppercase tracking-wider text-cream-200/60">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-xl font-semibold text-cream-50">{value}</span>
        {sub}
      </div>
    </GlassCard>
  );
}

function PaceBadge({ status }: { status: PaceStatus }) {
  const map = {
    behind: { c: "text-red-300", Icon: TrendingDown, label: "behind" },
    on_track: { c: "text-cream-200/70", Icon: Minus, label: "on track" },
    ahead: { c: "text-emerald-300", Icon: TrendingUp, label: "ahead" },
  } as const;
  const { c, Icon, label } = map[status];
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${c}`}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}
