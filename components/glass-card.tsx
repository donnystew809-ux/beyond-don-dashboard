import { cn } from "@/lib/utils";

/**
 * GlassCard — the shared dark-glass surface primitive.
 *
 * Canonicalizes the pattern already used across the dashboard
 * (bg-navy-900/60 + backdrop-blur + navy-700/40 border) so every page
 * composes the same surface instead of re-typing the class string.
 *
 * Variants:
 *  - accent: gold top bar (matches StatCard's accent treatment)
 *  - interactive: hover lift + gold border glow + press feedback,
 *    tuned to the same 150–200ms feel as the page-enter transition.
 *  - tone: semantic tint for status surfaces (gold callouts, red/emerald
 *    alert cards) so banners stop hand-rolling light-mode colors.
 */
export function GlassCard({
  children,
  accent = false,
  interactive = false,
  tone = "default",
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  accent?: boolean;
  interactive?: boolean;
  tone?: "default" | "gold" | "red" | "emerald" | "amber";
}) {
  const tones = {
    default: "border-navy-700/40 bg-navy-900/60",
    gold: "border-gold-500/50 bg-gold-500/15",
    red: "border-red-500/30 bg-red-500/10",
    emerald: "border-emerald-500/30 bg-emerald-500/10",
    amber: "border-amber-500/30 bg-amber-500/10",
  } as const;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border p-5 shadow-lg backdrop-blur-sm",
        tones[tone],
        interactive &&
          "transition duration-200 ease-out hover:-translate-y-0.5 hover:border-gold-500/40 hover:shadow-xl active:translate-y-0 active:opacity-90",
        className,
      )}
      {...props}
    >
      {accent && (
        <span
          aria-hidden
          className="absolute left-0 right-0 top-0 h-[3px] bg-gold-gradient"
        />
      )}
      {children}
    </div>
  );
}
