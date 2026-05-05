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
