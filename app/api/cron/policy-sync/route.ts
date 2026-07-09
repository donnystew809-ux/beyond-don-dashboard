// GET/POST /api/cron/policy-sync — weekly Airbnb policy refresh.
//
// Fetches a curated list of official, public Airbnb Help Center policy
// pages, extracts their text, and hash-diffs against what's stored in
// policy_brain. On change: Claude writes a short "what changed" summary,
// the row is updated, and a notification_event alerts Donovan — so both
// he AND the guest-message drafter always work from current policy.
//
// Read-only fetches of public help pages; no logged-in platform access.
// A fetch failure for any category never clobbers previously stored
// policy text — stale-but-real beats empty.

import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

import { createServiceClient } from "@/lib/supabase/server";
import { isAuthorizedSync, recordSyncStart, recordSyncFinish } from "@/lib/sync";

export const maxDuration = 300;

// Curated sources. If Airbnb moves an article, the fetch fails safely and
// the failure shows up in the sync result — update the URL here.
const POLICY_SOURCES: Array<{ category: string; url: string; title: string }> = [
  { category: "service_animals", url: "https://www.airbnb.com/help/article/1869", title: "Service & assistance animals" },
  { category: "pets", url: "https://www.airbnb.com/help/article/3086", title: "Pets policy for stays" },
  { category: "cancellations", url: "https://www.airbnb.com/help/article/149", title: "Cancellation policies" },
  { category: "refunds", url: "https://www.airbnb.com/help/article/2868", title: "Rebooking & refund policy" },
  { category: "fees", url: "https://www.airbnb.com/help/article/1857", title: "Service fees" },
  { category: "parties_events", url: "https://www.airbnb.com/help/article/2704", title: "Party & events policy" },
  { category: "safety", url: "https://www.airbnb.com/help/article/3252", title: "Safety practices" },
  { category: "discrimination", url: "https://www.airbnb.com/help/article/1405", title: "Nondiscrimination policy" },
  { category: "extenuating", url: "https://www.airbnb.com/help/article/1320", title: "Major disruptive events" },
  { category: "guest_standards", url: "https://www.airbnb.com/help/article/3061", title: "Ground rules for guests" },
];

export async function GET(request: NextRequest) {
  return run(request);
}
export async function POST(request: NextRequest) {
  return run(request);
}

async function run(request: NextRequest) {
  if (!isAuthorizedSync(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = createServiceClient() as any;
  const syncId = await recordSyncStart("policy-sync");

  const results: Array<{ category: string; status: string }> = [];
  let changed = 0;

  for (const source of POLICY_SOURCES) {
    try {
      const text = await fetchArticleText(source.url);
      if (!text) {
        results.push({ category: source.category, status: "fetch_failed" });
        continue;
      }
      const hash = crypto.createHash("sha256").update(text).digest("hex");

      const { data: existing } = await db
        .from("policy_brain")
        .select("id, content_md, content_hash")
        .eq("category", source.category)
        .maybeSingle();

      if (existing?.content_hash === hash) {
        await db
          .from("policy_brain")
          .update({ fetched_at: new Date().toISOString() })
          .eq("id", existing.id);
        results.push({ category: source.category, status: "unchanged" });
        continue;
      }

      // Changed (or first fetch). Summarize the delta only when we had a
      // previous version — first ingestion is not a "policy change".
      let changeSummary: string | null = null;
      if (existing?.content_md) {
        changeSummary = await summarizeChange(source.title, existing.content_md, text);
        changed++;
        await db.from("notification_events").insert({
          type: "policy_changed",
          title: `Airbnb policy changed: ${source.title}`,
          body: changeSummary?.slice(0, 300) ?? "Policy text changed — review the update.",
          severity: "warning",
        });
      }

      await db.from("policy_brain").upsert(
        {
          category: source.category,
          source_url: source.url,
          title: source.title,
          content_md: text,
          content_hash: hash,
          fetched_at: new Date().toISOString(),
          ...(existing?.content_md
            ? { last_changed_at: new Date().toISOString(), change_summary_md: changeSummary }
            : {}),
        },
        { onConflict: "category" },
      );
      results.push({
        category: source.category,
        status: existing?.content_md ? "changed" : "seeded",
      });
    } catch (err) {
      results.push({ category: source.category, status: `error: ${String(err).slice(0, 120)}` });
    }
  }

  const okCount = results.filter((r) => r.status !== "fetch_failed" && !r.status.startsWith("error")).length;
  await recordSyncFinish(
    syncId,
    okCount > 0 ? { ok: true, records: okCount } : { ok: false, error: "all policy fetches failed" },
  );

  return NextResponse.json({ ok: true, changed, results });
}

async function fetchArticleText(url: string): Promise<string | null> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; BeyondDonPolicyBot/1.0)" },
    redirect: "follow",
  });
  if (!res.ok) return null;
  const html = await res.text();
  const text = htmlToText(html);
  // Guard against consent walls / JS shells masquerading as content.
  return text.length > 500 ? text.slice(0, 20000) : null;
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

async function summarizeChange(title: string, before: string, after: string): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 500,
      system:
        "You compare two versions of an Airbnb policy page and report what materially changed for a short-term-rental host. Be concise: 2-5 bullet points. Ignore formatting/navigation noise. If nothing material changed, say 'No material policy change detected.'",
      messages: [
        {
          role: "user",
          content: `Policy: ${title}\n\n# PREVIOUS VERSION\n${before.slice(0, 12000)}\n\n# NEW VERSION\n${after.slice(0, 12000)}\n\nWhat changed that a host must know?`,
        },
      ],
    });
    const block = response.content.find((b) => b.type === "text");
    return block && "text" in block ? block.text : null;
  } catch {
    return null;
  }
}
