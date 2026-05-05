import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  highlight,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border bg-white p-5 shadow-sm transition",
        highlight
          ? "border-gold-300 ring-1 ring-gold-200"
          : "border-cream-200 hover:border-cream-300",
        className,
      )}
    >
      {/* gold accent bar — top of card */}
      <span
        aria-hidden
        className={cn(
          "absolute left-0 right-0 top-0 h-[3px]",
          highlight ? "bg-gold-gradient" : "bg-cream-200",
        )}
      />
      <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-navy-500">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-navy-900">
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-navy-500">{hint}</div>}
    </div>
  );
}
