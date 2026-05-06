// Rebuilds the tone_brain markdown from all of Donovan's outbound messages
// in the database. Run after ingest-airbnb-export.mjs:
//
//   node scripts/build-tone-brain.mjs
//
// What it does:
//   1) Pulls every outbound message body from Supabase (Donovan's actual
//      replies across all threads).
//   2) Samples up to N messages (token budget) — random + recency-weighted.
//   3) Sends to Claude Opus 4.7 with a system prompt asking it to distill the
//      voice signature into a markdown tone-brain doc following the v0 shape.
//   4) Upserts into tone_brain (id=1, source=corpus_full).
//
// Cost: ~$0.50–$2.00 depending on corpus size.

import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const envPath = resolve(root, ".env.local");
if (existsSync(envPath)) {
  const env = readFileSync(envPath, "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) process.env[m[1]] = m[2];
  }
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

console.log("Pulling outbound messages…");
const { data: outbound, error } = await sb
  .from("messages")
  .select("body, sent_at, thread_id, message_threads(guest_first_name, check_in)")
  .eq("direction", "outbound")
  .not("body", "is", null)
  .order("sent_at", { ascending: false })
  .limit(2000);
if (error) {
  console.error(error);
  process.exit(1);
}
console.log(`  → ${outbound.length} outbound messages.`);

if (outbound.length < 5) {
  console.error(
    "Not enough corpus to build tone brain (<5 messages). Did the ingest run?",
  );
  process.exit(1);
}

// Sample: keep most recent 200, random sample of 200 from the rest
const recent = outbound.slice(0, 200);
const rest = outbound.slice(200);
const sampled = recent.concat(
  rest.sort(() => Math.random() - 0.5).slice(0, 200),
);

const corpus = sampled
  .map((m, i) => `### Reply ${i + 1} (${m.sent_at})\n${m.body}`)
  .join("\n\n");

console.log(`Sending ${sampled.length} samples to Claude…`);

const SYSTEM_PROMPT = `You are a voice analyst. You will be given a corpus of real outbound Airbnb host messages written by Donovan, owner of BEYOND DON LLC. Your job: produce a tone-brain markdown document that captures his voice precisely so another AI can imitate it accurately.

Output requirements:
- Markdown only.
- Sections: # Donovan's Host Voice (Tone Brain v1) / ## Voice signature / ## Recurring patterns by message type (with concrete quoted examples) / ## Style rules for AI drafts (numbered) / ## Edge cases & failure modes.
- Quote real phrases verbatim with attribution to keep examples concrete.
- Be specific — "uses we/us" beats "first-person plural".
- Capture quirks: typos, punctuation patterns, emoji use, signature phrases.
- Identify message types: pre-arrival welcome, mid-stay check-in, issue acknowledgment, issue resolution, positive ack, review request, refund/refusal, late check-in approval, etc.
- Note what NOT to do: never sign off, never invent facts, never commit refunds without admin.
- Keep under 4000 words.`;

const response = await anthropic.messages.create({
  model: "claude-opus-4-7",
  max_tokens: 8000,
  thinking: { type: "adaptive", display: "summarized" },
  system: SYSTEM_PROMPT,
  messages: [
    {
      role: "user",
      content: `Here is the corpus of ${sampled.length} real outbound messages from Donovan.\n\n${corpus}\n\nProduce the tone-brain markdown.`,
    },
  ],
});

const textBlock = response.content.find((b) => b.type === "text");
const md = textBlock?.text;
if (!md) {
  console.error("Claude returned no text block.");
  process.exit(1);
}

const outPath = resolve(root, ".tone-brain/tone-brain-v1.md");
writeFileSync(outPath, md, "utf8");
console.log(`Wrote ${outPath} (${md.length} chars).`);

const cost =
  (response.usage.input_tokens * 5) / 1_000_000 +
  (response.usage.output_tokens * 25) / 1_000_000;
console.log(
  `Tokens: in=${response.usage.input_tokens} out=${response.usage.output_tokens} cost=$${cost.toFixed(2)}`,
);

const { error: upsertErr } = await sb
  .from("tone_brain")
  .upsert({
    id: 1,
    body_md: md,
    source: "corpus_full",
    updated_at: new Date().toISOString(),
  });
if (upsertErr) {
  console.error("DB upsert failed:", upsertErr.message);
  process.exit(1);
}
console.log("✓ tone_brain row updated to v1.");
