import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { draftReply } from "@/lib/messaging/drafter";

export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.object({
  thread_id: z.string().uuid(),
  /** If passed, used instead of the latest tone_brain row (for testing). */
  tone_brain_override: z.string().optional(),
});

export async function POST(req: NextRequest) {
  // Auth: any signed-in member can draft (operators included — Jasmin)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("unauthorized", { status: 401 });

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "bad request" },
      { status: 400 },
    );
  }

  const service = createServiceClient();

  // Load thread + last 30 messages
  const { data: thread, error: threadErr } = await service
    .from("message_threads")
    .select("*, properties(name, nickname, status)")
    .eq("id", body.thread_id)
    .maybeSingle();
  if (threadErr || !thread) {
    return NextResponse.json(
      { error: threadErr?.message ?? "thread not found" },
      { status: 404 },
    );
  }

  const t = thread as unknown as {
    property_id: string | null;
    guest_first_name: string | null;
    guest_name: string | null;
    check_in: string | null;
    check_out: string | null;
    city: string | null;
    properties: { name: string } | { name: string }[] | null;
  };
  const propertyJoin = Array.isArray(t.properties) ? t.properties[0] : t.properties;

  // Property profile — the same ground-truth facts the intake pipeline uses
  // (replaces the old hardcoded PROPERTY_NOTES list).
  let profileContext: string | null = null;
  if (t.property_id) {
    const { data: profile } = await (service as any)
      .from("property_profiles")
      .select("access_info, house_rules_md, quirks_md, host_preferences_md")
      .eq("property_id", t.property_id)
      .maybeSingle();
    if (profile) {
      const parts: string[] = [];
      const entries = Object.entries(
        (profile.access_info ?? {}) as Record<string, string>,
      ).filter(([, v]) => v);
      if (entries.length)
        parts.push(
          "## Access & facts\n" +
            entries.map(([k, v]) => `- ${k.replace(/_/g, " ")}: ${v}`).join("\n"),
        );
      if (profile.house_rules_md) parts.push(`## House rules\n${profile.house_rules_md}`);
      if (profile.quirks_md) parts.push(`## Quirks\n${profile.quirks_md}`);
      if (profile.host_preferences_md)
        parts.push(`## Host preferences\n${profile.host_preferences_md}`);
      profileContext = parts.length ? parts.join("\n\n") : null;
    }
  }

  const { data: msgs, error: msgErr } = await service
    .from("messages")
    .select("direction, sender, body, sent_at")
    .eq("thread_id", body.thread_id)
    .order("sent_at", { ascending: true })
    .limit(30);
  if (msgErr) {
    return NextResponse.json({ error: msgErr.message }, { status: 500 });
  }

  // Load tone brain
  let toneBrain = body.tone_brain_override;
  if (!toneBrain) {
    const { data: brain } = await service
      .from("tone_brain")
      .select("body_md")
      .eq("id", 1)
      .maybeSingle();
    toneBrain = brain?.body_md ?? "";
  }
  if (!toneBrain) {
    return NextResponse.json(
      { error: "no tone_brain row found — seed it first" },
      { status: 500 },
    );
  }

  try {
    const { draft, usage, cost_usd } = await draftReply(
      {
        guest_first_name:
          t.guest_first_name ||
          (t.guest_name?.split(" ")[0] ?? "there"),
        property_name: propertyJoin?.name ?? null,
        property_profile: profileContext,
        check_in: t.check_in,
        check_out: t.check_out,
        city: t.city,
        history: (msgs ?? []).map((m) => ({
          direction: m.direction,
          sender: m.sender ?? "",
          body: m.body ?? "",
          sent_at: m.sent_at,
        })),
      },
      toneBrain,
    );

    const lastInbound = (msgs ?? [])
      .slice()
      .reverse()
      .find((m) => m.direction === "inbound");

    const { data: row, error: insertErr } = await service
      .from("message_drafts")
      .insert({
        thread_id: body.thread_id,
        in_reply_to_message_id: null, // we don't have message ids on the inbound row in this query
        draft_body: draft.draft_body,
        reasoning: draft.reasoning,
        model: "claude-opus-4-7",
        status: "pending",
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cost_usd,
      })
      .select("id, draft_body, reasoning, status, cost_usd")
      .single();

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ...row,
      confidence: draft.confidence,
      // For client-side hint without re-querying:
      last_inbound_at: lastInbound?.sent_at ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "draft failed" },
      { status: 500 },
    );
  }
}

// Per-property notes now live in property_profiles (host_preferences_md /
// quirks_md), editable in Settings → Properties. The old hardcoded
// PROPERTY_NOTES list was removed — it had already gone stale.
