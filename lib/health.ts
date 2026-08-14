// Property health v2 — PURE composite scorer (mirrors kpi.ts / pricing-
// signals.ts style: no I/O, trivially testable). Pages assemble the inputs
// from their own queries and get back a 0–100 score with per-pillar
// breakdowns for drill-down UI.
//
// Pillars (weights sum to 1):
//   reviews      0.35 — average guest rating + recency of the last review
//   pricing      0.25 — open pricing signals (warnings hurt most)
//   maintenance  0.25 — overdue maintenance tasks
//   inventory    0.15 — items below par level

export type HealthInput = {
  /** Guest ratings 1–5, newest first (empty = unknown). */
  ratings: number[];
  /** Days since the most recent review, or null if none. */
  daysSinceLastReview: number | null;
  /** Open pricing signals by severity. */
  pricingWarnings: number;
  pricingOpportunities: number;
  /** Maintenance tasks past due. */
  overdueTasks: number;
  /** Inventory items currently below par. */
  itemsBelowPar: number;
};

export type PillarScore = {
  key: "reviews" | "pricing" | "maintenance" | "inventory";
  label: string;
  /** 0..100 */
  score: number;
  weight: number;
  detail: string;
};

export type HealthResult = {
  /** 0..100 weighted composite. */
  score: number;
  grade: "A" | "B" | "C" | "D";
  pillars: PillarScore[];
};

export function computeHealth(input: HealthInput): HealthResult {
  const pillars: PillarScore[] = [];

  // ── Reviews ────────────────────────────────────────────────────────────
  {
    let score: number;
    let detail: string;
    if (input.ratings.length === 0) {
      score = 70; // unknown ≠ bad — neutral-ish prior
      detail = "No reviews ingested yet.";
    } else {
      const avg = input.ratings.reduce((s, r) => s + r, 0) / input.ratings.length;
      // 5.0 → 100, 4.0 → 60, 3.0 → 20 (Airbnb reality: <4.5 is a warning sign)
      score = clamp(((avg - 2.5) / 2.5) * 100);
      // Staleness: >180 days since last review decays up to -15.
      if (input.daysSinceLastReview != null && input.daysSinceLastReview > 180) {
        score = clamp(score - Math.min(15, (input.daysSinceLastReview - 180) / 12));
      }
      detail = `${avg.toFixed(2)}★ over ${input.ratings.length} review${input.ratings.length === 1 ? "" : "s"}`;
    }
    pillars.push({ key: "reviews", label: "Guest reviews", score, weight: 0.35, detail });
  }

  // ── Pricing ────────────────────────────────────────────────────────────
  {
    const score = clamp(
      100 - input.pricingWarnings * 25 - input.pricingOpportunities * 8,
    );
    const total = input.pricingWarnings + input.pricingOpportunities;
    pillars.push({
      key: "pricing",
      label: "Pricing signals",
      score,
      weight: 0.25,
      detail:
        total === 0
          ? "No open signals."
          : `${input.pricingWarnings} warning(s), ${input.pricingOpportunities} opportunit${input.pricingOpportunities === 1 ? "y" : "ies"}.`,
    });
  }

  // ── Maintenance ────────────────────────────────────────────────────────
  {
    const score = clamp(100 - input.overdueTasks * 30);
    pillars.push({
      key: "maintenance",
      label: "Maintenance",
      score,
      weight: 0.25,
      detail:
        input.overdueTasks === 0
          ? "Nothing overdue."
          : `${input.overdueTasks} overdue task(s).`,
    });
  }

  // ── Inventory ──────────────────────────────────────────────────────────
  {
    const score = clamp(100 - input.itemsBelowPar * 20);
    pillars.push({
      key: "inventory",
      label: "Inventory",
      score,
      weight: 0.15,
      detail:
        input.itemsBelowPar === 0
          ? "All items at or above par."
          : `${input.itemsBelowPar} item(s) below par.`,
    });
  }

  const score = Math.round(
    pillars.reduce((s, p) => s + p.score * p.weight, 0),
  );
  const grade = score >= 85 ? "A" : score >= 70 ? "B" : score >= 50 ? "C" : "D";
  return { score, grade, pillars };
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}
