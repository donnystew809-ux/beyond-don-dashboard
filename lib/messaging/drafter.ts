// Message Drafter — uses Claude Opus 4.7 to generate guest-message replies in
// Donovan's voice based on the tone-brain markdown stored in Supabase.
//
// Cost: ~$0.01–0.05 per draft (much cheaper than the listing optimizer because
// the input is shorter — single thread, not whole-property data).
//
// All sends remain MANUAL — Jasmin (or Donovan) approves the draft and pastes
// it into Airbnb's host inbox by hand. We never auto-send.

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const DraftSchema = z.object({
  draft_body: z
    .string()
    .describe(
      "The reply text Jasmin will paste into Airbnb. 1–4 short sentences. Match Donovan's voice exactly — never sign off, no 'Best,' or 'Donovan'.",
    ),
  reasoning: z
    .string()
    .describe(
      "1–2 sentence rationale: which guest signal you're responding to and which tone-brain pattern you applied.",
    ),
  confidence: z
    .enum(["high", "medium", "low"])
    .describe(
      "high = template-style routine reply; medium = needs human eyes; low = sensitive/ambiguous, recommend Donovan handles personally.",
    ),
});

export type DraftOutput = z.infer<typeof DraftSchema>;

export type ThreadContext = {
  guest_first_name: string;
  property_name?: string | null;
  property_status_note?: string | null; // e.g. "subleased, lease ending Jun 30"
  check_in?: string | null;
  check_out?: string | null;
  city?: string | null;
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
- NEVER invent facts about the property, the listing, the cleaning team, or operational details. If you don't have the info, ask the guest for it OR offer to follow up.
- Stay short. 1–4 sentences. Donovan does not write paragraphs.
- Match the tone-brain patterns exactly: "Hey [Name],", "we"/"us" first-person plural, smiley emoji on friendly check-ins (not on issues).
- For issue threads: empathy → action → consent → check-in.
- For ambiguous/sensitive situations (refunds, complaints, legal-adjacent, party violations, neighbor complaints), set confidence="low" and write a holding reply that buys Donovan time to handle personally. Never commit to refunds or policy changes.

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
