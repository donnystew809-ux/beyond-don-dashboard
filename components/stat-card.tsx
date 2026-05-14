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
        "relative overflow-hidden rounded-lg border bg-navy-900/60 p-5 shadow-lg backdrop-blur-sm transition",
        highlight
          ? "border-gold-500/40 ring-1 ring-gold-500/20"
          : "border-navy-700/50 hover:border-gold-500/30",
        className,
      )}
    >
      {/* gold accent bar — top of card */}
      <span
        aria-hidden
        className={cn(
          "absolute left-0 right-0 top-0 h-[3px]",
          highlight ? "bg-gold-gradient" : "bg-gold-500/20",
        )}
      />
      <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-cream-200/70">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-cream-50">
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-cream-200/60">{hint}</div>}
    </div>
  );
}
