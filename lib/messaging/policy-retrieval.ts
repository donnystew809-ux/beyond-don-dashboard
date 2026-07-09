// Policy retrieval — picks which policy_brain docs to inject into the
// drafter's context for a given guest message.
//
// Deterministic keyword routing (no model call): cheap, fast, and easy to
// audit. When a guest message touches a policy area, the CURRENT official
// Airbnb policy text rides along in the prompt, so answers stay
// policy-correct even after Airbnb changes the rules — the weekly
// policy-sync cron refreshes the docs, the next draft picks them up.

import type { SupabaseClient } from "@supabase/supabase-js";

const KEYWORD_MAP: Array<{ category: string; re: RegExp }> = [
  { category: "service_animals", re: /\bservice (animal|dog)|emotional support|esa\b|assistance animal/i },
  { category: "pets", re: /\bpets?\b|\bdogs?\b|\bcats?\b|pet fee|pet friendly/i },
  { category: "cancellations", re: /cancel|calling off|can't make it|cannot make it/i },
  { category: "refunds", re: /refund|money back|reimburse|partial credit/i },
  { category: "fees", re: /\bfees?\b|cleaning fee|extra charge|deposit/i },
  { category: "parties_events", re: /part(y|ies)|event|gathering|celebration|guests? over/i },
  { category: "safety", re: /camera|smoke detector|carbon monoxide|unsafe|emergency|injur/i },
  { category: "discrimination", re: /discriminat|accessib|wheelchair|disabilit/i },
  { category: "extenuating", re: /extenuating|natural disaster|hurricane|evacuat|family emergency/i },
  { category: "guest_standards", re: /house rules|quiet hours|smoking|check[- ]?out time/i },
];

export type PolicyDoc = { category: string; title: string | null; content_md: string };

/** Categories mentioned in the message (may be empty). */
export function classifyPolicyCategories(messageBody: string): string[] {
  const hits = new Set<string>();
  for (const { category, re } of KEYWORD_MAP) {
    if (re.test(messageBody)) hits.add(category);
  }
  return [...hits];
}

/** Fetch current policy docs for the matched categories (max 3, keeps prompt lean). */
export async function retrievePolicyDocs(
  supabase: SupabaseClient,
  messageBody: string,
): Promise<PolicyDoc[]> {
  const categories = classifyPolicyCategories(messageBody).slice(0, 3);
  if (categories.length === 0) return [];
  const { data } = await (supabase as any)
    .from("policy_brain")
    .select("category, title, content_md")
    .in("category", categories)
    .not("content_md", "is", null);
  return (data ?? []) as PolicyDoc[];
}

/** Render policy docs as a prompt section. */
export function formatPolicyContext(docs: PolicyDoc[]): string | null {
  if (docs.length === 0) return null;
  return docs
    .map(
      (d) =>
        `## Current official Airbnb policy — ${d.title ?? d.category}\n${truncate(d.content_md, 4000)}`,
    )
    .join("\n\n");
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + "\n[…truncated]";
}
