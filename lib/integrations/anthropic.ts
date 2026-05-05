// Listing Optimizer — uses Anthropic's Claude Opus 4.7 to analyze a property
// and generate title alternatives, a rewritten description, amenity gaps,
// and a positioning summary.
//
// Cost: ~$0.10–0.50 per analysis at xhigh effort with adaptive thinking.
// Run on demand, not on every sync.

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const ListingTitleSchema = z.object({
  title: z.string().describe("Airbnb title (≤ 50 characters ideal)"),
  rationale: z.string().describe("Why this title would perform well"),
});

const AmenityGapSchema = z.object({
  amenity: z.string().describe("Specific amenity name"),
  rationale: z.string().describe(
    "Why this amenity matters for this property's market and price band",
  ),
  estimated_roi: z
    .enum(["high", "medium", "low"])
    .describe("Estimated ROI on adding this amenity"),
});

const ListingAnalysisSchema = z.object({
  positioning: z
    .string()
    .describe(
      "1-paragraph summary of how this property is currently positioned and the single biggest opportunity to improve. Concise and concrete.",
    ),
  titles: z
    .array(ListingTitleSchema)
    .min(3)
    .max(6)
    .describe("3–6 alternative Airbnb titles, ranked best-first."),
  description: z.object({
    headline: z.string().describe("First sentence that hooks the reader"),
    body: z
      .string()
      .describe(
        "Full rewritten Airbnb description, 200–400 words, scannable, emotional + practical",
      ),
  }),
  amenity_gaps: z
    .array(AmenityGapSchema)
    .min(3)
    .max(8)
    .describe("Amenities likely missing or undersold, ranked by ROI"),
  pricing_notes: z
    .string()
    .describe(
      "1-paragraph thoughts on pricing strategy given the data — base price, weekday/weekend split, length-of-stay discounts, anything that stands out",
    ),
});

export type ListingAnalysis = z.infer<typeof ListingAnalysisSchema>;

export type AnalyzeInput = {
  property: {
    name: string;
    nickname?: string | null;
    address?: string | null;
    bedrooms?: number | null;
    base_price?: number | null;
  };
  /** Recent reservations for this property — used to gauge demand. */
  reservations: Array<{
    check_in: string;
    check_out: string;
    gross_revenue: number | null;
    source: string;
  }>;
  /** Forward-looking prices from PriceLabs — gives a feel for current pricing. */
  prices: Array<{
    date: string;
    suggested_price: number | null;
    base_price: number | null;
    booking_status: "free" | "booked" | "checkin";
  }>;
  /** Optional: PriceLabs neighborhood/comp data, raw JSON. */
  comps?: unknown;
};

export async function analyzeListing(input: AnalyzeInput): Promise<{
  analysis: ListingAnalysis;
  usage: { input_tokens: number; output_tokens: number };
  cost_usd: number;
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set — add it to .env.local and Vercel env vars",
    );
  }
  const client = new Anthropic({ apiKey });

  const summary = summarizeForPrompt(input);

  const response = await client.messages.parse({
    model: "claude-opus-4-7",
    max_tokens: 16000,
    thinking: { type: "adaptive", display: "summarized" },
    output_config: {
      effort: "xhigh",
      format: zodOutputFormat(ListingAnalysisSchema),
    },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: summary,
      },
    ],
  });

  const analysis = response.parsed_output;
  if (!analysis) {
    throw new Error("Claude did not return a valid analysis");
  }

  // Opus 4.7 pricing: $5/1M input, $25/1M output
  const cost_usd =
    (response.usage.input_tokens * 5) / 1_000_000 +
    (response.usage.output_tokens * 25) / 1_000_000;

  return {
    analysis,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
    cost_usd: Math.round(cost_usd * 10000) / 10000,
  };
}

const SYSTEM_PROMPT = `You are a senior short-term-rental strategist hired by BEYOND DON LLC to optimize Airbnb listings.

Your job: take the data the user gives you about a single property and produce a focused, actionable optimization analysis.

Style:
- Practical and concrete. Every suggestion must connect to revenue, ranking, or guest satisfaction.
- Title suggestions: emotional + searchable, ≤ 50 chars when possible. Avoid clichés ("Cozy", "Charming") unless backed by a differentiator.
- Description: 200–400 words. Open with a hook. Use short sentences and scannable structure. Mix emotional appeal with practical info (location, amenities, ideal trip type).
- Amenity gaps: list items the property likely lacks or under-promotes that comparable performers in this price band have. Prioritize by ROI.
- Pricing notes: ground in the data given. Call out specific dates/patterns when you see them.

Output must conform to the JSON schema. Do not invent data — when you don't know something (e.g., specific square footage), reason from what was provided.`;

function summarizeForPrompt(input: AnalyzeInput): string {
  const parts: string[] = [];
  parts.push(`# Property: ${input.property.name}`);
  if (input.property.address) parts.push(`Location: ${input.property.address}`);
  if (input.property.bedrooms) parts.push(`Bedrooms: ${input.property.bedrooms}`);
  if (input.property.base_price)
    parts.push(`Current base price: $${input.property.base_price}/night`);

  // Recent reservations — last 12 months
  const recentRes = input.reservations.slice(0, 50);
  if (recentRes.length > 0) {
    parts.push(`\n# Recent reservations (${recentRes.length})`);
    const totalRev = recentRes.reduce(
      (a, r) => a + (Number(r.gross_revenue) || 0),
      0,
    );
    const totalNights = recentRes.reduce((a, r) => {
      const ms =
        new Date(r.check_out).getTime() - new Date(r.check_in).getTime();
      return a + Math.max(0, Math.round(ms / 86400000));
    }, 0);
    const adr = totalNights > 0 ? totalRev / totalNights : 0;
    parts.push(
      `Total revenue: $${totalRev.toFixed(0)} across ${totalNights} nights (ADR: $${adr.toFixed(0)})`,
    );
    parts.push(`Sample (latest 10):`);
    for (const r of recentRes.slice(0, 10)) {
      parts.push(
        `- ${r.check_in} → ${r.check_out} : $${r.gross_revenue ?? "?"} via ${r.source}`,
      );
    }
  } else {
    parts.push("\n# No recent reservation data available.");
  }

  // Forward-looking prices — next 30 days
  const futurePrices = input.prices.slice(0, 30);
  if (futurePrices.length > 0) {
    parts.push(`\n# Forward-looking nightly prices (next ${futurePrices.length} days)`);
    const avgSuggested =
      futurePrices.reduce((a, p) => a + (p.suggested_price ?? 0), 0) /
      futurePrices.length;
    const bookedNights = futurePrices.filter(
      (p) => p.booking_status !== "free",
    ).length;
    parts.push(
      `Average suggested price: $${avgSuggested.toFixed(0)} | ${bookedNights}/${futurePrices.length} nights booked`,
    );
    parts.push(`Sample:`);
    for (const p of futurePrices.slice(0, 7)) {
      parts.push(
        `- ${p.date}: $${p.suggested_price ?? "?"} (${p.booking_status})`,
      );
    }
  }

  if (input.comps) {
    parts.push(`\n# Neighborhood / comp data`);
    parts.push("```json");
    parts.push(JSON.stringify(input.comps, null, 2).slice(0, 3000));
    parts.push("```");
  }

  parts.push(
    `\n# Task\nProduce the optimization analysis per the schema. Be specific and concrete. Use the data above to ground every suggestion.`,
  );

  return parts.join("\n");
}
