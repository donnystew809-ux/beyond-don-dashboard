// Proactive guest check-in drafts.
//
// Airbnb gives us no way to message a guest who has not written to us first:
// outbound replies go through the per-thread *@reply.airbnb.com relay, and
// that address only exists once an inbound notification arrives. So this route
// DRAFTS only — the operator copies the text into the Airbnb thread. When a
// relay address is known for the guest, `sendable` is true and the normal
// reply path can take over.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { stayInfo, STAGE_INTENT, type StayStage } from "@/lib/messaging/checkin";

export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.object({
  reservation_id: z.string().uuid(),
  /** Optional — Airbnb hides guest names from every API, so the operator may
   *  supply one from the Airbnb app to personalise the greeting. */
  guest_name: z.string().trim().min(1).max(60).optional(),
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

  const db = createServiceClient();

  const { data: resv } = await db
    .from("reservations")
    .select("id, property_id, check_in, check_out, reservation_code, guest_name")
    .eq("id", body.reservation_id)
    .maybeSingle();
  if (!resv) return NextResponse.json({ error: "reservation not found" }, { status: 404 });

  const { data: property } = await db
    .from("properties")
    .select("name, nickname")
    .eq("id", resv.property_id)
    .maybeSingle();

  const today = new Date().toISOString().slice(0, 10);
  const info = stayInfo(resv.check_in, resv.check_out, today);
  if (info.stage === "not_current") {
    return NextResponse.json({ error: "guest is not currently staying" }, { status: 400 });
  }

  const { data: brain } = await db
    .from("tone_brain")
    .select("body_md")
    .eq("id", 1)
    .maybeSingle();
  if (!brain?.body_md) {
    return NextResponse.json({ error: "no tone brain — run build-tone-brain" }, { status: 500 });
  }

  // Operational context so the draft can reference real amenities.
  // property_profiles predates the generated Supabase types.
  const { data: profile } = (await (db as any)
    .from("property_profiles")
    .select("quirks_md, house_rules_md")
    .eq("property_id", resv.property_id)
    .maybeSingle()) as { data: { quirks_md: string | null } | null };

  const guestName = body.guest_name ?? resv.guest_name ?? null;
  const propertyName = property?.nickname || property?.name || "the property";

  const prompt = `You are drafting a single Airbnb message AS DONOVAN, the host. Match the voice profile below exactly — it was learned from ~11,000 of his real sent messages. His rhythm, warmth, emoji habits and length. Never sound like a template or a corporate auto-reply.

<voice_profile>
${brain.body_md}
</voice_profile>

Property: ${propertyName}
${profile?.quirks_md ? `Property quirks worth knowing: ${profile.quirks_md}\n` : ""}Guest: ${guestName ?? "name unknown — do NOT invent one, write naturally without a name"}
Stay: ${info.label} (${info.nights} nights total, ${info.nightsRemaining} remaining)

WHAT THIS MESSAGE MUST DO: ${STAGE_INTENT[info.stage as Exclude<StayStage, "not_current">]}

Rules:
- 2-4 sentences. Text-message length, not an email.
- Low pressure. Never ask for a review, never create obligation.
- ${guestName ? `Greet them by name (${guestName}) the way Donovan naturally would.` : "No name is known — do not use a placeholder like [Name]."}
- Return ONLY the message text. No subject line, no quotes, no preamble.`;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let text: string;
  try {
    const res = await anthropic.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    });
    const block = res.content.find((c) => c.type === "text");
    text = block && block.type === "text" ? block.text.trim() : "";
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "draft failed" },
      { status: 502 },
    );
  }
  if (!text) return NextResponse.json({ error: "empty draft" }, { status: 502 });

  // Is there a thread we could actually send through?
  const { data: thread } = await db
    .from("message_threads")
    .select("id")
    .eq("reservation_code", resv.reservation_code ?? "___none___")
    .maybeSingle();

  return NextResponse.json({
    draft: text,
    stage: info.stage,
    label: info.label,
    guest_name: guestName,
    thread_id: thread?.id ?? null,
    reservation_code: resv.reservation_code,
  });
}
