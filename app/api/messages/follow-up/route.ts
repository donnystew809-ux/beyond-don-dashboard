// Add a new inbound message to an existing thread + re-draft a reply.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { draftReply } from "@/lib/messaging/drafter";

export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.object({
  thread_id: z.string().uuid(),
  inbound_text: z.string().min(1),
});

export async function POST(req: NextRequest) {
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
  const { data: thread } = await service
    .from("message_threads")
    .select("*, properties(name)")
    .eq("id", body.thread_id)
    .maybeSingle();
  if (!thread)
    return NextResponse.json({ error: "thread not found" }, { status: 404 });

  const t = thread as unknown as {
    guest_first_name: string | null;
    guest_name: string | null;
    check_in: string | null;
    check_out: string | null;
    properties: { name: string } | { name: string }[] | null;
  };

  const sentAt = new Date().toISOString();
  await service.from("messages").insert({
    thread_id: body.thread_id,
    direction: "inbound",
    sender: t.guest_first_name ?? t.guest_name ?? "Guest",
    body: body.inbound_text,
    sent_at: sentAt,
  });

  await service
    .from("message_threads")
    .update({
      last_message_at: sentAt,
      last_message_preview: body.inbound_text.slice(0, 140),
      updated_at: sentAt,
    })
    .eq("id", body.thread_id);

  // Tone brain
  const { data: brain } = await service
    .from("tone_brain")
    .select("body_md")
    .eq("id", 1)
    .maybeSingle();
  if (!brain?.body_md) {
    return NextResponse.json({ ok: true, warning: "no tone brain" });
  }

  // History
  const { data: history } = await service
    .from("messages")
    .select("direction, sender, body, sent_at")
    .eq("thread_id", body.thread_id)
    .order("sent_at", { ascending: true })
    .limit(30);

  try {
    const property = Array.isArray(t.properties) ? t.properties[0] : t.properties;
    const { draft, usage, cost_usd } = await draftReply(
      {
        guest_first_name:
          t.guest_first_name ||
          t.guest_name?.split(" ")[0] ||
          "there",
        property_name: property?.name ?? null,
        check_in: t.check_in,
        check_out: t.check_out,
        history: (history ?? []).map((m) => ({
          direction: m.direction,
          sender: m.sender ?? "",
          body: m.body ?? "",
          sent_at: m.sent_at,
        })),
      },
      brain.body_md,
    );

    const { data: row } = await service
      .from("message_drafts")
      .insert({
        thread_id: body.thread_id,
        draft_body: draft.draft_body,
        reasoning: draft.reasoning,
        status: "pending",
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cost_usd,
      })
      .select("id")
      .single();

    return NextResponse.json({ ok: true, draft_id: row?.id });
  } catch (err) {
    return NextResponse.json(
      { ok: true, draft_error: err instanceof Error ? err.message : "draft failed" },
    );
  }
}
