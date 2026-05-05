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
        <section className="overflow-hidden rounded-lg border border-cream-200 bg-white p-6">
          <h2 className="gold-underline mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-navy-700">
            Positioning
          </h2>
          <p className="text-sm leading-relaxed text-navy-800">{positioning}</p>
        </section>
      )}

      <section className="overflow-hidden rounded-lg border border-cream-200 bg-white p-6">
        <h2 className="gold-underline mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-navy-700">
          Title alternatives
        </h2>
        {titles.length === 0 ? (
          <p className="text-sm text-navy-500">None generated.</p>
        ) : (
          <ol className="space-y-4">
            {titles.map((t, i) => (
              <li key={i} className="flex gap-4">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold-100 text-xs font-semibold text-gold-800">
                  {i + 1}
                </span>
                <div>
                  <div className="font-semibold text-navy-900">{t.title}</div>
                  <div className="mt-1 text-xs text-navy-600">{t.rationale}</div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {description && (
        <section className="overflow-hidden rounded-lg border border-cream-200 bg-white p-6">
          <h2 className="gold-underline mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-navy-700">
            Suggested description
          </h2>
          <p className="text-base font-medium text-navy-900">
            {description.headline}
          </p>
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-navy-800">
            {description.body}
          </p>
        </section>
      )}

      <section className="overflow-hidden rounded-lg border border-cream-200 bg-white p-6">
        <h2 className="gold-underline mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-navy-700">
          Amenity gaps
        </h2>
        {amenityGaps.length === 0 ? (
          <p className="text-sm text-navy-500">None identified.</p>
        ) : (
          <ul className="space-y-4">
            {amenityGaps.map((a, i) => (
              <li
                key={i}
                className="flex flex-col gap-1 border-b border-cream-200 pb-4 last:border-b-0 last:pb-0 md:flex-row md:items-start md:justify-between md:gap-6"
              >
                <div>
                  <div className="font-semibold text-navy-900">{a.amenity}</div>
                  <div className="mt-1 text-xs text-navy-600">{a.rationale}</div>
                </div>
                <RoiPill roi={a.estimated_roi} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {pricingNotes && (
        <section className="overflow-hidden rounded-lg border border-cream-200 bg-white p-6">
          <h2 className="gold-underline mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-navy-700">
            Pricing notes
          </h2>
          <p className="text-sm leading-relaxed text-navy-800">
            {pricingNotes}
          </p>
        </section>
      )}
    </div>
  );
}

function RoiPill({ roi }: { roi: "high" | "medium" | "low" }) {
  const styles = {
    high: "border-gold-500 bg-gold-50 text-gold-800",
    medium: "border-navy-200 bg-cream-50 text-navy-700",
    low: "border-cream-300 bg-cream-100 text-navy-500",
  } as const;
  return (
    <span
      className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${styles[roi]}`}
    >
      ROI: {roi}
    </span>
  );
}
