// Compact booking/price heatmap strip. Pure server render — one thin bar per
// forward night. Colour encodes state at a glance:
//   gold  = booked (sold)
//   emerald = unbooked but has a manual/auto override
//   navy-mid = unbooked, engine suggestion only
//   faint = no price at all
//
// Used on the /revenue overview cards (compact) and can be widened on detail.

import type { DayState } from "@/lib/pricing-signals";

function cellClass(d: DayState): string {
  if (d.booked) return "bg-gold-500/70";
  if (d.override != null) return "bg-emerald-500/45";
  if (d.suggested != null) return "bg-navy-500/40";
  return "bg-navy-800/40";
}

export function PriceHeatmap({
  days,
  className = "",
}: {
  days: DayState[];
  className?: string;
}) {
  return (
    <div className={`flex items-end gap-px overflow-hidden ${className}`}>
      {days.map((d) => (
        <span
          key={d.date}
          title={`${d.date} · ${d.booked ? "booked" : d.override != null ? `set $${Math.round(d.override)}` : d.suggested != null ? `suggested $${Math.round(d.suggested)}` : "no price"}`}
          className={`h-6 flex-1 rounded-[1px] ${cellClass(d)}`}
        />
      ))}
    </div>
  );
}

export function HeatmapLegend() {
  const items = [
    { c: "bg-gold-500/70", label: "Booked" },
    { c: "bg-emerald-500/45", label: "Override" },
    { c: "bg-navy-500/40", label: "Suggested" },
    { c: "bg-navy-800/40", label: "No price" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-cream-200/60">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-[1px] ${i.c}`} />
          {i.label}
        </span>
      ))}
    </div>
  );
}
