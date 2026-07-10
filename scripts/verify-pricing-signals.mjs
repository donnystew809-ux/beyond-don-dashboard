// Verification for the PURE pricing logic (lib/pricing-signals, lib/kpi,
// lib/revenue). No test runner needed — run with:
//
//   npm run test:signals
//
// Guards the money-affecting engine: which signals fire, when they're
// suppressed, and that the price/booked calendar grid aligns to dates.

import { computeSignals } from "@/lib/pricing-signals.ts";
import { paceVsTarget } from "@/lib/kpi.ts";
import { buildDayStates, bookedNights } from "@/lib/revenue.ts";
import { format, addDays } from "date-fns";

let pass = 0,
  fail = 0;
const ok = (c, m) => {
  if (c) pass++;
  else {
    fail++;
    console.log("  FAIL:", m);
  }
};

const today = "2026-07-10";
const d = (n) => {
  const dt = new Date(Date.UTC(2026, 6, 10));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
};

// gap_fill — orphan free night between two booked nights.
{
  const days = [
    { date: d(0), base: 100, suggested: 100, override: null, booked: true },
    { date: d(1), base: 100, suggested: 100, override: null, booked: false },
    { date: d(2), base: 100, suggested: 100, override: null, booked: true },
  ];
  const g = computeSignals({ days, forwardOccupancy: 0.5, today }).find((x) => x.type === "gap_fill");
  ok(g, "gap_fill fires on orphan night");
  ok(g && g.action?.kind === "discount" && g.action.price === 85, "gap_fill suggests 15% off (85)");
}

// lower_overpriced — unbooked, near-term, priced above suggestion, pacing behind.
{
  const days = [{ date: d(3), base: 100, suggested: 100, override: 150, booked: false }];
  const lo = computeSignals({ days, forwardOccupancy: 0.3, today }).find((x) => x.type === "lower_overpriced");
  ok(lo, "lower_overpriced fires when above suggestion + behind pace");
  ok(lo && lo.action?.kind === "set_price" && lo.action.price === 100, "lower_overpriced sets suggestion (100)");
  ok(
    !computeSignals({ days, forwardOccupancy: 0.65, today }).find((x) => x.type === "lower_overpriced"),
    "lower_overpriced suppressed when on-track",
  );
}

// raise_floor — very high forward occupancy.
{
  const days = [
    { date: d(1), base: 100, suggested: 200, override: null, booked: false },
    { date: d(2), base: 100, suggested: 220, override: null, booked: false },
  ];
  const rf = computeSignals({ days, forwardOccupancy: 0.95, today }).find((x) => x.type === "raise_floor");
  ok(rf, "raise_floor fires at 95% occupancy");
  ok(rf && rf.action?.kind === "raise_floor", "raise_floor has raise_floor action");
}

// no_suggestion — unbooked date with no price at all.
{
  const days = [{ date: d(5), base: null, suggested: null, override: null, booked: false }];
  ok(
    computeSignals({ days, forwardOccupancy: 0.5, today }).find((x) => x.type === "no_suggestion"),
    "no_suggestion fires on empty date",
  );
}

// pace thresholds (8pt dead-band around the 65% default target).
ok(paceVsTarget(0.3).status === "behind", "pace 0.30 -> behind");
ok(paceVsTarget(0.65).status === "on_track", "pace 0.65 -> on_track");
ok(paceVsTarget(0.95).status === "ahead", "pace 0.95 -> ahead");

// buildDayStates + bookedNights — mirror the app's local-date path.
{
  const from = new Date();
  from.setHours(12, 0, 0, 0);
  const L = (n) => format(addDays(from, n), "yyyy-MM-dd");
  const res = [{ check_in: L(1), check_out: L(3) }]; // nights L(1),L(2) booked; L(3) not
  const booked = bookedNights(res, from, addDays(from, 10));
  ok(booked.has(L(1)) && booked.has(L(2)) && !booked.has(L(3)), "bookedNights marks [check-in, check-out)");
  const prices = [{ date: L(1), base_price: 120, suggested_price: 130, override_price: null }];
  const grid = buildDayStates(prices, res, from, 5);
  ok(
    grid.length === 5 && grid[1].date === L(1) && grid[1].booked === true && grid[1].suggested === 130,
    "buildDayStates aligns price + booked to date",
  );
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
