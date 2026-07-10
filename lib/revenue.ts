// Revenue cockpit data assembly (server-side, no React).
//
// Turns the two sources of truth — cached engine prices (`prices`) and booked
// reservations (`reservations`) — into the `DayState[]` grid the signal engine
// and the calendar UI both consume. Booked state is derived from reservation
// check-in/check-out overlap (a night is "booked" if check_in ≤ night <
// check_out), NOT stored on the price row.

import { format, addDays } from "date-fns";

import type { DayState } from "@/lib/pricing-signals";

export type PriceLike = {
  date: string;
  base_price: number | null;
  suggested_price: number | null;
  override_price: number | null;
  currency?: string | null;
};

export type ReservationLike = {
  check_in: string;
  check_out: string;
};

/** Set of yyyy-mm-dd nights covered by any reservation in [from, to). */
export function bookedNights(
  reservations: ReservationLike[],
  from: Date,
  to: Date,
): Set<string> {
  const booked = new Set<string>();
  const fromStr = format(from, "yyyy-MM-dd");
  const toStr = format(to, "yyyy-MM-dd");
  for (const r of reservations) {
    // Iterate each night of the stay: [check_in, check_out).
    let night = r.check_in.slice(0, 10);
    const end = r.check_out.slice(0, 10);
    // Guard against pathological data (missing/!valid) — cap the loop.
    let guard = 0;
    while (night < end && guard++ < 400) {
      if (night >= fromStr && night < toStr) booked.add(night);
      night = addDaysStr(night, 1);
    }
  }
  return booked;
}

/**
 * Build the chronological DayState grid for `days` nights from `from`,
 * merging cached prices with derived booked state.
 */
export function buildDayStates(
  prices: PriceLike[],
  reservations: ReservationLike[],
  from: Date,
  days: number,
): DayState[] {
  const to = addDays(from, days);
  const booked = bookedNights(reservations, from, to);
  const priceByDate = new Map(prices.map((p) => [p.date.slice(0, 10), p]));

  const out: DayState[] = [];
  for (let i = 0; i < days; i++) {
    const date = format(addDays(from, i), "yyyy-MM-dd");
    const p = priceByDate.get(date);
    out.push({
      date,
      base: p?.base_price ?? null,
      suggested: p?.suggested_price ?? null,
      override: p?.override_price ?? null,
      booked: booked.has(date),
    });
  }
  return out;
}

/** The live price for a day: override wins, else suggestion, else base. */
export function livePrice(d: DayState): number | null {
  return d.override ?? d.suggested ?? d.base ?? null;
}

function addDaysStr(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
