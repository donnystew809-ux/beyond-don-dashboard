// Message Drafter — uses Claude Opus 4.7 to generate guest-message replies in
// Donovan's voice based on the tone-brain markdown stored in Supabase.
//
// Cost: ~$0.01–0.05 per draft (much cheaper than the listing optimizer because
// the input is shorter — single thread, not whole-property data).
//
// Sends: human-approved by default. The intake pipeline MAY auto-send a
// draft, but only when every gate passes — category is in ROUTINE_CATEGORIES,
// confidence is "high", the property has auto_send_messages enabled, and the
// global kill-switch is off. Everything else lands in the approval queue.

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const DraftSchema = z.object({
  draft_body: z
    .string()
    .describe(
      "The reply text to send to the guest. 1–4 short sentences. Match Donovan's voice exactly — never sign off, no 'Best,' or 'Donovan'.",
    ),
  reasoning: z
    .string()
    .describe(
      "1–2 sentence rationale: which guest signal you're responding to and which tone-brain pattern you applied.",
    ),
  confidence: z
    .enum(["high", "medium", "low"])
    .describe(
      "high = template-style routine reply with all facts available; medium = needs human eyes; low = sensitive/ambiguous, recommend Donovan handles personally.",
    ),
  category: z
    .enum([
      "check_in_access",   // lockbox, codes, directions, parking, early/late check-in ask
      "stay_logistics",    // wifi, amenities, trash, thermostat, how-things-work
      "pleasantry",        // thanks, compliments, arrival ETA, small talk
      "booking_inquiry",   // pre-booking questions, availability, pricing asks
      "policy_question",   // pets/service animals/fees/cancellation policy questions
      "issue_complaint",   // something broken, cleanliness, neighbors, dissatisfaction
      "refund_cancellation", // money-back or cancellation REQUESTS
      "reservation_change",  // extend/shorten/move dates, add guests
      "emergency",         // safety, lockout right now, urgent
      "other",
    ])
    .describe(
      "What the guest's latest message is about. Used for auto-send routing — be conservative: if the message spans categories, pick the most sensitive one.",
    ),
});

export type DraftOutput = z.infer<typeof DraftSchema>;

/**
 * Categories eligible for auto-send. Everything else always escalates,
 * regardless of confidence. Money, changes, complaints, and emergencies
 * are permanently human territory.
 */
export const ROUTINE_CATEGORIES: ReadonlySet<DraftOutput["category"]> = new Set([
  "check_in_access",
  "stay_logistics",
  "pleasantry",
] as const);

export type ThreadContext = {
  guest_first_name: string;
  property_name?: string | null;
  property_status_note?: string | null; // e.g. "subleased, lease ending Jun 30"
  check_in?: string | null;
  check_out?: string | null;
  city?: string | null;
  /**
   * Property profile facts (from property_profiles): access codes, wifi,
   * parking, quirks. When present the drafter may answer factual questions
   * directly; when absent it must never invent them.
   */
  property_profile?: string | null;
  /**
   * Current official Airbnb policy excerpts relevant to this message
   * (from policy_brain via policy-retrieval). Ground truth for policy
   * questions — e.g. no pet fees for service animals.
   */
  policy_context?: string | null;
  /** Last N messages, oldest-first. */
  history: Array<{
    direction: "inbound" | "outbound";
    sender: string;
    body: string;
    sent_at: string;
  }>;
};

export async function draftReply(
  ctx: ThreadContext,
  toneBrain: string,
): Promise<{
  draft: DraftOutput;
  usage: { input_tokens: number; output_tokens: number };
  cost_usd: number;
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  const client = new Anthropic({ apiKey });

  const system = buildSystemPrompt(toneBrain);
  const user = buildUserPrompt(ctx);

  const response = await client.messages.parse({
    model: "claude-opus-4-7",
    max_tokens: 2048,
    thinking: { type: "adaptive", display: "summarized" },
    output_config: {
      effort: "high",
      format: zodOutputFormat(DraftSchema),
    },
    system,
    messages: [{ role: "user", content: user }],
  });

  const draft = response.parsed_output;
  if (!draft) throw new Error("Claude returned no draft");

  // Opus 4.7 pricing: $5/1M input, $25/1M output
  const cost_usd =
    (response.usage.input_tokens * 5) / 1_000_000 +
    (response.usage.output_tokens * 25) / 1_000_000;

  return {
    draft,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
    cost_usd: Math.round(cost_usd * 10000) / 10000,
  };
}

function buildSystemPrompt(toneBrain: string): string {
  return `You are drafting Airbnb host replies for BEYOND DON LLC. You write AS Donovan — match his voice exactly, do not invent your own style.

You will be given:
1. A tone-brain markdown distilling Donovan's actual writing patterns. Treat this as ground truth.
2. The full guest conversation thread.

Your job: write the next reply Donovan would send.

Hard rules:
- NEVER sign off ("Best,", "Donovan", "Cheers", etc.). Donovan doesn't.
- NEVER invent facts about the property, the listing, the cleaning team, or operational details. Use ONLY facts given in the "Property profile" section. If the fact isn't there, ask the guest for patience OR offer to follow up — and set confidence to "medium" at most.
- For policy questions (pets, service animals, fees, cancellations…): answer ONLY from the "Current official Airbnb policy" excerpts when provided. Example: service animals are not pets — no pet fee may be charged. If no policy excerpt covers the question, do not guess; write a holding reply and set confidence="medium".
- Stay short. 1–4 sentences. Donovan does not write paragraphs.
- Match the tone-brain patterns exactly: "Hey [Name],", "we"/"us" first-person plural, smiley emoji on friendly check-ins (not on issues).
- For issue threads: empathy → action → consent → check-in.
- For ambiguous/sensitive situations (refunds, complaints, legal-adjacent, party violations, neighbor complaints), set confidence="low" and write a holding reply that buys Donovan time to handle personally. Never commit to refunds or policy changes.
- Categorize honestly. Your category + confidence decide whether this reply sends WITHOUT human review — when in doubt, choose the more sensitive category and lower confidence.

# Tone Brain (Donovan's voice — GROUND TRUTH)

${toneBrain}

# End of tone brain`;
}

function buildUserPrompt(ctx: ThreadContext): string {
  const parts: string[] = [];
  parts.push(`# Thread context`);
  parts.push(`Guest: ${ctx.guest_first_name}`);
  if (ctx.property_name) parts.push(`Property: ${ctx.property_name}`);
  if (ctx.property_status_note)
    parts.push(`Property status note (DO NOT mention to guest): ${ctx.property_status_note}`);
  if (ctx.check_in && ctx.check_out)
    parts.push(`Stay dates: ${ctx.check_in} → ${ctx.check_out}`);
  if (ctx.city) parts.push(`City: ${ctx.city}`);

  if (ctx.property_profile) {
    parts.push(
      `\n# Property profile (GROUND TRUTH facts for THIS property — use these to answer, never share codes unless the guest has a confirmed reservation for this stay)\n${ctx.property_profile}`,
    );
  }
  if (ctx.policy_context) {
    parts.push(`\n# Airbnb policy context (GROUND TRUTH)\n${ctx.policy_context}`);
  }

  parts.push(`\n# Conversation (oldest first)`);
  for (const m of ctx.history) {
    const who = m.direction === "outbound" ? "Donovan" : m.sender;
    parts.push(`[${m.sent_at}] ${who}: ${m.body}`);
  }

  parts.push(
    `\n# Task\nWrite the next reply Donovan would send. Match his voice from the tone brain. Output the draft + your reasoning + confidence.`,
  );
  return parts.join("\n");
}
