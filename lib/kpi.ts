import { differenceInCalendarDays, isBefore, isAfter, max, min } from "date-fns";

import type { Database } from "@/lib/supabase/types";

type Reservation = Database["public"]["Tables"]["reservations"]["Row"];

export type DateRange = { start: Date; end: Date };

export function nightsBookedInRange(
  reservations: Pick<Reservation, "check_in" | "check_out">[],
  range: DateRange,
): number {
  let total = 0;
  for (const r of reservations) {
    const ci = new Date(r.check_in);
    const co = new Date(r.check_out);
    const overlapStart = max([ci, range.start]);
    const overlapEnd = min([co, range.end]);
    if (isBefore(overlapStart, overlapEnd)) {
      total += differenceInCalendarDays(overlapEnd, overlapStart);
    }
  }
  return total;
}

export function totalRevenueInRange(
  reservations: Pick<
    Reservation,
    "check_in" | "check_out" | "gross_revenue"
  >[],
  range: DateRange,
): number {
  let total = 0;
  for (const r of reservations) {
    if (!r.gross_revenue) continue;
    const ci = new Date(r.check_in);
    const co = new Date(r.check_out);
    const stayNights = differenceInCalendarDays(co, ci);
    if (stayNights <= 0) continue;
    const overlapStart = max([ci, range.start]);
    const overlapEnd = min([co, range.end]);
    const overlapNights = isAfter(overlapEnd, overlapStart)
      ? differenceInCalendarDays(overlapEnd, overlapStart)
      : 0;
    total += (Number(r.gross_revenue) * overlapNights) / stayNights;
  }
  return Math.round(total * 100) / 100;
}

export function occupancyRate(
  reservations: Pick<Reservation, "check_in" | "check_out">[],
  range: DateRange,
  propertyCount: number,
): number {
  const totalNights = nightsBookedInRange(reservations, range);
  const availableNights =
    Math.max(differenceInCalendarDays(range.end, range.start), 0) *
    Math.max(propertyCount, 1);
  if (availableNights === 0) return 0;
  return totalNights / availableNights;
}

export function adr(revenue: number, nights: number): number {
  if (nights === 0) return 0;
  return Math.round((revenue / nights) * 100) / 100;
}

// ── Forward-looking pacing (pricing cockpit) ─────────────────────────────
// "Pacing" = how full the calendar is for an upcoming window relative to a
// target occupancy. Low pacing → we may be priced too high; high pacing →
// room to raise the floor. There is no per-property revenue/occupancy target
// stored yet, so callers pass a target (default DEFAULT_OCCUPANCY_TARGET).

export const DEFAULT_OCCUPANCY_TARGET = 0.65;

/**
 * Occupancy for a forward window starting at `from` and spanning `days`,
 * across `propertyCount` listings. 0..1.
 */
export function forwardOccupancy(
  reservations: Pick<Reservation, "check_in" | "check_out">[],
  from: Date,
  days: number,
  propertyCount = 1,
): number {
  const end = new Date(from);
  end.setDate(end.getDate() + days);
  return occupancyRate(reservations, { start: from, end }, propertyCount);
}

export type PaceStatus = "behind" | "on_track" | "ahead";

export type Pace = {
  occupancy: number; // 0..1
  target: number; // 0..1
  /** occupancy − target, in occupancy points (e.g. +0.12 = 12pts ahead). */
  delta: number;
  status: PaceStatus;
};

/**
 * Compare an occupancy figure to a target. The ±8pt dead-band keeps small
 * wobbles from flipping the status every sync.
 */
export function paceVsTarget(
  occupancy: number,
  target: number = DEFAULT_OCCUPANCY_TARGET,
): Pace {
  const delta = occupancy - target;
  const status: PaceStatus =
    delta < -0.08 ? "behind" : delta > 0.08 ? "ahead" : "on_track";
  return { occupancy, target, delta, status };
}
