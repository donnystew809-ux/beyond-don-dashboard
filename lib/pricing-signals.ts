// Pricing signal engine — PURE. No I/O, no DB, no fetch. Given a property's
// day-by-day price/booking state and its forward pacing, it emits actionable
// signals ("you're priced above the engine's suggestion on slow dates",
// "occupancy is >90%, raise your floor", "orphan gap night — discount it").
//
// Purity keeps it trivially testable and lets the same logic run in a cron,
// an API route, or server-rendered in a page. The API route feeds it data
// from `prices` (cached engine suggestions) + `reservations` (booked truth).

import { paceVsTarget, DEFAULT_OCCUPANCY_TARGET } from "@/lib/kpi";

/** One day of state the signal engine reasons over. */
export type DayState = {
  date: string; // yyyy-mm-dd
  base: number | null;
  suggested: number | null; // engine suggestion (no override)
  override: number | null; // live price if a human/auto override exists
  booked: boolean;
};

export type SignalType =
  | "lower_overpriced" // priced well above suggestion on an unbooked, slow-pacing date
  | "raise_floor" // occupancy so high the floor is leaving money on the table
  | "gap_fill" // orphan free night wedged between booked nights
  | "no_suggestion"; // engine returned nothing — data/connection gap

export type SignalSeverity = "opportunity" | "warning" | "info";

export type PricingSignal = {
  type: SignalType;
  severity: SignalSeverity;
  date?: string; // the specific date, when the signal is date-scoped
  title: string;
  detail: string;
  /** A one-click action the UI can offer; consumed by the override/guardrail APIs. */
  action?:
    | { kind: "set_price"; date: string; price: number }
    | { kind: "raise_floor"; price: number }
    | { kind: "discount"; date: string; price: number };
};

export type SignalInput = {
  days: DayState[]; // chronological
  /** Forward occupancy for the near window (0..1). */
  forwardOccupancy: number;
  occupancyTarget?: number;
  /** How far out to consider "near-term" for overpricing (default 21). */
  nearTermDays?: number;
  /** today as yyyy-mm-dd (passed in — pure fn can't read the clock). */
  today: string;
};

// Tunables. Conservative on purpose — this drives money decisions.
const OVERPRICE_RATIO = 1.12; // override ≥ 112% of suggestion = "above market"
const GAP_DISCOUNT_RATIO = 0.85; // suggest 15% off to fill an orphan night
const RAISE_FLOOR_OCC = 0.9; // ≥90% forward occupancy → raise the floor
const RAISE_FLOOR_BUMP = 1.1; // nudge floor to 110% of current suggestion median

export function computeSignals(input: SignalInput): PricingSignal[] {
  const { days, today } = input;
  const nearTermDays = input.nearTermDays ?? 21;
  const target = input.occupancyTarget ?? DEFAULT_OCCUPANCY_TARGET;
  const pace = paceVsTarget(input.forwardOccupancy, target);
  const signals: PricingSignal[] = [];

  const nearTermCutoff = addDaysStr(today, nearTermDays);

  // ── Per-day signals ────────────────────────────────────────────────────
  for (let i = 0; i < days.length; i++) {
    const d = days[i];

    // no_suggestion: unbooked date with neither suggestion nor override.
    if (!d.booked && d.suggested == null && d.override == null) {
      signals.push({
        type: "no_suggestion",
        severity: "info",
        date: d.date,
        title: "No price on the books",
        detail: `${d.date} has no suggested or set price — check the PriceLabs connection or run a sync.`,
      });
      continue;
    }

    // lower_overpriced: unbooked + near-term + priced well above suggestion,
    // and the overall calendar is pacing behind. Money-losing combination.
    if (
      !d.booked &&
      d.date <= nearTermCutoff &&
      d.override != null &&
      d.suggested != null &&
      d.suggested > 0 &&
      d.override >= d.suggested * OVERPRICE_RATIO &&
      pace.status === "behind"
    ) {
      const pct = Math.round((d.override / d.suggested - 1) * 100);
      signals.push({
        type: "lower_overpriced",
        severity: "warning",
        date: d.date,
        title: `Priced ${pct}% above suggestion on a slow date`,
        detail: `${d.date} is unbooked, ${nearTermDays}-day pacing is behind target, and it's set at $${round(d.override)} vs the $${round(d.suggested)} suggestion. Consider dropping to the suggestion to win the booking.`,
        action: { kind: "set_price", date: d.date, price: round(d.suggested) },
      });
    }

    // gap_fill: an orphan free night between two booked nights. Hard to sell
    // at full rate; a targeted discount fills an otherwise-dead night.
    const prev = days[i - 1];
    const next = days[i + 1];
    if (
      !d.booked &&
      prev?.booked &&
      next?.booked &&
      d.date >= today
    ) {
      const basis = d.override ?? d.suggested ?? d.base;
      if (basis != null && basis > 0) {
        const discounted = round(basis * GAP_DISCOUNT_RATIO);
        signals.push({
          type: "gap_fill",
          severity: "opportunity",
          date: d.date,
          title: "Orphan gap night — discount to fill",
          detail: `${d.date} sits alone between two booked nights. A ~15% nudge to $${discounted} makes it far more likely to sell.`,
          action: { kind: "discount", date: d.date, price: discounted },
        });
      }
    }
  }

  // ── Portfolio-level signal: raise the floor when demand is hot ──────────
  if (input.forwardOccupancy >= RAISE_FLOOR_OCC) {
    const suggestions = days
      .filter((d) => d.date >= today && d.suggested != null && d.suggested > 0)
      .map((d) => d.suggested as number)
      .sort((a, b) => a - b);
    if (suggestions.length > 0) {
      const median = suggestions[Math.floor(suggestions.length / 2)];
      const newFloor = round(median * RAISE_FLOOR_BUMP);
      signals.push({
        type: "raise_floor",
        severity: "opportunity",
        title: `Occupancy ${Math.round(input.forwardOccupancy * 100)}% — raise your floor`,
        detail: `Forward demand is very strong. Lifting the minimum price to ~$${newFloor} captures more on the remaining nights without risking the ones already booked.`,
        action: { kind: "raise_floor", price: newFloor },
      });
    }
  }

  // Most actionable first: warnings, then opportunities, then info.
  const rank: Record<SignalSeverity, number> = {
    warning: 0,
    opportunity: 1,
    info: 2,
  };
  return signals.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

function round(n: number): number {
  return Math.round(n);
}

/** Add days to a yyyy-mm-dd string without timezone drift (UTC math). */
function addDaysStr(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
