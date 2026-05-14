type TitleSuggestion = { title: string; rationale: string };
type AmenityGap = {
  amenity: string;
  rationale: string;
  estimated_roi: "high" | "medium" | "low";
};
type Description = { headline: string; body: string };

export function AnalysisView({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  optimization,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  optimization: any;
}) {
  const titles: TitleSuggestion[] = optimization.titles ?? [];
  const description: Description | null = optimization.description ?? null;
  const amenityGaps: AmenityGap[] = optimization.amenity_gaps ?? [];
  const positioning: string | null = optimization.positioning ?? null;
  const pricingNotes: string | null =
    optimization.pricing_notes?.text ?? null;

  return (
    <div className="space-y-8">
      {positioning && (
        <section className="overflow-hidden rounded-lg border border-navy-700/40 bg-navy-900/60 backdrop-blur-sm p-6">
          <h2 className="gold-underline mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-cream-100">
            Positioning
          </h2>
          <p className="text-sm leading-relaxed text-cream-50">{positioning}</p>
        </section>
      )}

      <section className="overflow-hidden rounded-lg border border-navy-700/40 bg-navy-900/60 backdrop-blur-sm p-6">
        <h2 className="gold-underline mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-cream-100">
          Title alternatives
        </h2>
        {titles.length === 0 ? (
          <p className="text-sm text-cream-200/60">None generated.</p>
        ) : (
          <ol className="space-y-4">
            {titles.map((t, i) => (
              <li key={i} className="flex gap-4">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold-500/20 text-xs font-semibold text-gold-300">
                  {i + 1}
                </span>
                <div>
                  <div className="font-semibold text-cream-50">{t.title}</div>
                  <div className="mt-1 text-xs text-cream-200/80">{t.rationale}</div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {description && (
        <section className="overflow-hidden rounded-lg border border-navy-700/40 bg-navy-900/60 backdrop-blur-sm p-6">
          <h2 className="gold-underline mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-cream-100">
            Suggested description
          </h2>
          <p className="text-base font-medium text-cream-50">
            {description.headline}
          </p>
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-cream-50">
            {description.body}
          </p>
        </section>
      )}

      <section className="overflow-hidden rounded-lg border border-navy-700/40 bg-navy-900/60 backdrop-blur-sm p-6">
        <h2 className="gold-underline mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-cream-100">
          Amenity gaps
        </h2>
        {amenityGaps.length === 0 ? (
          <p className="text-sm text-cream-200/60">None identified.</p>
        ) : (
          <ul className="space-y-4">
            {amenityGaps.map((a, i) => (
              <li
                key={i}
                className="flex flex-col gap-1 border-b border-navy-700/40 pb-4 last:border-b-0 last:pb-0 md:flex-row md:items-start md:justify-between md:gap-6"
              >
                <div>
                  <div className="font-semibold text-cream-50">{a.amenity}</div>
                  <div className="mt-1 text-xs text-cream-200/80">{a.rationale}</div>
                </div>
                <RoiPill roi={a.estimated_roi} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {pricingNotes && (
        <section className="overflow-hidden rounded-lg border border-navy-700/40 bg-navy-900/60 backdrop-blur-sm p-6">
          <h2 className="gold-underline mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-cream-100">
            Pricing notes
          </h2>
          <p className="text-sm leading-relaxed text-cream-50">
            {pricingNotes}
          </p>
        </section>
      )}
    </div>
  );
}

function RoiPill({ roi }: { roi: "high" | "medium" | "low" }) {
  const styles = {
    high: "border-gold-500 bg-gold-500/15 text-gold-300",
    medium: "border-navy-400/50 bg-navy-800/40 text-cream-100",
    low: "border-navy-700/50 bg-navy-800/50 text-cream-200/60",
  } as const;
  return (
    <span
      className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${styles[roi]}`}
    >
      ROI: {roi}
    </span>
  );
}
