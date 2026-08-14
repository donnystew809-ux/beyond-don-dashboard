// 90-day pricing calendar — pure server render. Month-blocked 7-col grids.
// Each cell shows the live price and encodes state:
//   booked   → gold fill (no action needed, it's sold)
//   override → emerald ring (a price is pinned)
//   out-of-guardrail → red price text (below floor / above ceiling)
//   today    → gold ring
//
// Read-only by design — actions live in the signals panel and guardrail
// controls, so the calendar stays a fast, glanceable picture of the book.

import { formatCurrency } from "@/lib/utils";
import { livePrice } from "@/lib/revenue";
import type { DayState } from "@/lib/pricing-signals";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

export function RevenueCalendar({
  days,
  today,
  currency = "USD",
  minBound,
  maxBound,
}: {
  days: DayState[];
  today: string;
  currency?: string;
  minBound?: number | null;
  maxBound?: number | null;
}) {
  // Group day states into months.
  const months = new Map<string, DayState[]>();
  for (const d of days) {
    const key = d.date.slice(0, 7); // yyyy-mm
    (months.get(key) ?? months.set(key, []).get(key)!).push(d);
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {[...months.entries()].map(([month, monthDays]) => (
        <div key={month}>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-cream-200/70">
            {monthLabel(month)}
          </h4>
          <div className="grid grid-cols-7 gap-1">
            {WEEKDAYS.map((w, i) => (
              <div key={i} className="text-center text-[9px] text-cream-200/60">
                {w}
              </div>
            ))}
            {leadingBlanks(monthDays[0].date).map((_, i) => (
              <div key={`b${i}`} />
            ))}
            {monthDays.map((d) => (
              <Cell
                key={d.date}
                d={d}
                isToday={d.date === today}
                currency={currency}
                minBound={minBound}
                maxBound={maxBound}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Cell({
  d,
  isToday,
  currency,
  minBound,
  maxBound,
}: {
  d: DayState;
  isToday: boolean;
  currency: string;
  minBound?: number | null;
  maxBound?: number | null;
}) {
  const price = livePrice(d);
  const dayNum = Number(d.date.slice(8, 10));

  const outOfBounds =
    price != null &&
    ((minBound != null && price < minBound) ||
      (maxBound != null && price > maxBound));

  const base =
    "relative flex aspect-square flex-col items-center justify-center rounded-md border text-center";
  const state = d.booked
    ? "border-gold-500/40 bg-gold-500/20"
    : d.override != null
      ? "border-emerald-500/40 bg-emerald-500/10"
      : "border-navy-700/40 bg-navy-900/40";
  const ring = isToday ? " ring-1 ring-gold-400" : "";

  return (
    <div className={`${base} ${state}${ring}`} title={titleFor(d, price, currency)}>
      <span className="absolute left-1 top-0.5 text-[8px] text-cream-200/65">
        {dayNum}
      </span>
      {price != null ? (
        <span
          className={`text-[10px] font-medium leading-none ${
            outOfBounds
              ? "text-red-300"
              : d.booked
                ? "text-gold-200"
                : "text-cream-100"
          }`}
        >
          {formatCurrency(price, currency).replace(/\.00$/, "")}
        </span>
      ) : (
        <span className="text-[10px] text-cream-200/50">—</span>
      )}
    </div>
  );
}

function titleFor(d: DayState, price: number | null, currency: string): string {
  const parts = [d.date];
  if (d.booked) parts.push("booked");
  if (price != null) parts.push(formatCurrency(price, currency));
  if (d.override != null) parts.push("override");
  else if (d.suggested != null) parts.push("suggested");
  return parts.join(" · ");
}

function leadingBlanks(firstDate: string): unknown[] {
  const [y, m, d] = firstDate.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun
  return Array.from({ length: weekday });
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
