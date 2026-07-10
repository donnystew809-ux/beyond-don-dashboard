import Link from "next/link";
import { notFound } from "next/navigation";
import { format, addDays } from "date-fns";
import { ArrowLeft } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatPercent } from "@/lib/utils";
import {
  forwardOccupancy,
  paceVsTarget,
  totalRevenueInRange,
} from "@/lib/kpi";
import { buildDayStates } from "@/lib/revenue";
import { computeSignals } from "@/lib/pricing-signals";

import { PageHeader } from "@/components/page-header";
import { GlassCard } from "@/components/glass-card";
import { AutoPricingControls } from "../../pricing/_components/auto-pricing-controls";
import { RevenueCalendar } from "./_components/revenue-calendar";
import { SignalsPanel } from "./_components/signals-panel";
import { HeatmapLegend } from "../_components/price-heatmap";

export const dynamic = "force-dynamic";

const HORIZON = 90;

export default async function RevenueDetailPage(
  props: PageProps<"/revenue/[id]">,
) {
  const { id } = await props.params;
  const supabase = await createClient();
  const today = new Date();
  const from = today;
  const to = addDays(today, HORIZON);
  const fromStr = format(from, "yyyy-MM-dd");
  const toStr = format(to, "yyyy-MM-dd");

  const [{ data: property }, { data: prices }, { data: reservations }] =
    await Promise.all([
      supabase
        .from("properties")
        .select(
          "id, name, pricelabs_listing_id, auto_accept_pricing, auto_accept_max_deviation_pct, auto_accept_horizon_days, auto_accept_min_price, auto_accept_max_price",
        )
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("prices")
        .select("date, base_price, suggested_price, override_price, currency")
        .eq("property_id", id)
        .gte("date", fromStr)
        .lte("date", toStr)
        .order("date"),
      supabase
        .from("reservations")
        .select("check_in, check_out, gross_revenue")
        .eq("property_id", id)
        .gte("check_out", fromStr)
        .lte("check_in", toStr),
    ]);

  if (!property) notFound();

  const priceRows = (prices ?? []) as Array<{
    date: string;
    base_price: number | null;
    suggested_price: number | null;
    override_price: number | null;
    currency: string | null;
  }>;
  const resRows = (reservations ?? []) as Array<{
    check_in: string;
    check_out: string;
    gross_revenue: number | null;
  }>;

  const days = buildDayStates(priceRows, resRows, from, HORIZON);
  const occ30 = forwardOccupancy(resRows, from, 30, 1);
  const occ90 = forwardOccupancy(resRows, from, 90, 1);
  const pace = paceVsTarget(occ30);
  const onBooks = totalRevenueInRange(resRows, { start: from, end: to });
  const signals = computeSignals({
    days,
    forwardOccupancy: occ30,
    today: fromStr,
  });

  // Guardrail bounds for the calendar's out-of-range highlighting — mirrors
  // lib/pricing.ts: explicit min/max, else base ± deviation%.
  const base = priceRows.find((r) => r.base_price)?.base_price ?? null;
  const dev = property.auto_accept_max_deviation_pct ?? 25;
  const minBound =
    property.auto_accept_min_price ?? (base ? base * (1 - dev / 100) : null);
  const maxBound =
    property.auto_accept_max_price ?? (base ? base * (1 + dev / 100) : null);
  const currency = priceRows.find((r) => r.currency)?.currency ?? "USD";

  return (
    <div>
      <Link
        href="/revenue"
        className="mb-3 inline-flex items-center gap-1.5 text-xs text-cream-200/60 hover:text-cream-50"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All properties
      </Link>

      <PageHeader
        title={property.name}
        description="90-day pricing calendar, forward pacing, and one-click signal actions."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="30-day occupancy" value={formatPercent(occ30)} />
        <Stat label="90-day occupancy" value={formatPercent(occ90)} />
        <Stat label="On the books (90d)" value={formatCurrency(onBooks)} />
        <Stat
          label="Pace vs target"
          value={
            pace.status === "ahead"
              ? "Ahead"
              : pace.status === "behind"
                ? "Behind"
                : "On track"
          }
          tone={pace.status === "behind" ? "red" : pace.status === "ahead" ? "emerald" : "default"}
        />
      </div>

      {/* Guardrails / auto / manual apply — reuse the pricing controls */}
      <GlassCard className="mb-6 flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="text-sm text-cream-100">
          <span className="font-medium">Auto-pricing & guardrails</span>
          <span className="ml-2 text-xs text-cream-200/60">
            Floor {minBound != null ? formatCurrency(minBound, currency).replace(/\.00$/, "") : "—"} ·
            Ceiling {maxBound != null ? formatCurrency(maxBound, currency).replace(/\.00$/, "") : "—"}
          </span>
        </div>
        <AutoPricingControls property={property} />
      </GlassCard>

      {/* Signals */}
      <section className="mb-8">
        <h3 className="gold-underline mb-3 text-sm font-semibold uppercase tracking-wider text-cream-100">
          Signals
        </h3>
        <SignalsPanel
          propertyId={property.id}
          signals={signals}
          currentMinBound={property.auto_accept_min_price ?? null}
        />
      </section>

      {/* Calendar */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="gold-underline text-sm font-semibold uppercase tracking-wider text-cream-100">
            90-day calendar
          </h3>
        </div>
        <div className="mb-3">
          <HeatmapLegend />
        </div>
        <GlassCard className="p-4">
          <RevenueCalendar
            days={days}
            today={fromStr}
            currency={currency}
            minBound={minBound}
            maxBound={maxBound}
          />
        </GlassCard>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "red" | "emerald";
}) {
  return (
    <GlassCard tone={tone} className="p-4">
      <div className="text-[11px] uppercase tracking-wider text-cream-200/60">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold text-cream-50">{value}</div>
    </GlassCard>
  );
}
