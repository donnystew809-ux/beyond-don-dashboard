// Paste-to-draft bridge: Jasmin pastes a guest's message + property + guest name,
// the API creates (or finds) a thread, stores the inbound message, and triggers
// a draft. Workflow:
//   1) Guest sends a message in Airbnb.
//   2) Jasmin opens /messages/new, picks the property, types/pastes the guest
//      message + first name, hits "Draft reply".
//   3) Endpoint creates a thread (or reuses by airbnb_thread_id), inserts the
//      inbound message, calls the drafter, returns the new draft.
//
// This is the daily driver until we get the Airbnb data export ingested.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { draftReply } from "@/lib/messaging/drafter";

export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.object({
  property_id: z.string().uuid().optional(),
  airbnb_thread_id: z.string().optional(), // e.g. 2521931233 from /hosting/messages/<id>
  guest_first_name: z.string().min(1),
  guest_full_name: z.string().optional(),
  inbound_text: z.string().min(1),
  check_in: z.string().optional(),
  check_out: z.string().optional(),
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

  // Find or create thread
  let threadId: string | null = null;
  if (body.airbnb_thread_id) {
    const { data: existing } = await service
      .from("message_threads")
      .select("id")
      .eq("airbnb_thread_id", body.airbnb_thread_id)
      .maybeSingle();
    if (existing) threadId = existing.id;
  }
  if (!threadId) {
    const { data: created, error: createErr } = await service
      .from("message_threads")
      .insert({
        property_id: body.property_id ?? null,
        airbnb_thread_id: body.airbnb_thread_id ?? null,
        guest_name: body.guest_full_name ?? body.guest_first_name,
        guest_first_name: body.guest_first_name,
        check_in: body.check_in ?? null,
        check_out: body.check_out ?? null,
        last_message_at: new Date().toISOString(),
        last_message_preview: body.inbound_text.slice(0, 140),
        unread_count: 0,
      })
      .select("id")
      .single();
    if (createErr || !created)
      return NextResponse.json(
        { error: createErr?.message ?? "thread create failed" },
        { status: 500 },
      );
    threadId = created.id;
  }

  // Insert inbound message
  const { error: msgErr } = await service.from("messages").insert({
    thread_id: threadId,
    direction: "inbound",
    sender: body.guest_first_name,
    body: body.inbound_text,
    sent_at: new Date().toISOString(),
  });
  if (msgErr)
    return NextResponse.json({ error: msgErr.message }, { status: 500 });

  // Update thread metadata
  await service
    .from("message_threads")
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: body.inbound_text.slice(0, 140),
      updated_at: new Date().toISOString(),
    })
    .eq("id", threadId);

  // Load tone brain
  const { data: brain } = await service
    .from("tone_brain")
    .select("body_md")
    .eq("id", 1)
    .maybeSingle();
  if (!brain?.body_md) {
    return NextResponse.json(
      { thread_id: threadId, warning: "tone_brain not seeded — skipping draft" },
      { status: 200 },
    );
  }

  // Pull full thread history for the drafter
  const { data: history } = await service
    .from("messages")
    .select("direction, sender, body, sent_at")
    .eq("thread_id", threadId)
    .order("sent_at", { ascending: true })
    .limit(30);

  try {
    const { draft, usage, cost_usd } = await draftReply(
      {
        guest_first_name: body.guest_first_name,
        check_in: body.check_in,
        check_out: body.check_out,
        history: (history ?? []).map((m) => ({
          direction: m.direction,
          sender: m.sender ?? "",
          body: m.body ?? "",
          sent_at: m.sent_at,
        })),
      },
      brain.body_md,
    );

    const { data: draftRow } = await service
      .from("message_drafts")
      .insert({
        thread_id: threadId,
        draft_body: draft.draft_body,
        reasoning: draft.reasoning,
        status: "pending",
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cost_usd,
      })
      .select("id, draft_body, reasoning")
      .single();

    return NextResponse.json({
      thread_id: threadId,
      draft: draftRow,
      confidence: draft.confidence,
      cost_usd,
    });
  } catch (err) {
    return NextResponse.json(
      {
        thread_id: threadId,
        error: err instanceof Error ? err.message : "draft failed",
      },
      { status: 500 },
    );
  }
}
