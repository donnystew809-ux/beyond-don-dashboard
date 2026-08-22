// Send a proactive message to a current guest through Airbnb's reply relay.
//
// Airbnb has no send API, and driving their UI is against their ToS. The one
// sanctioned channel is the r+<token>@reply.airbnb.com address they mint per
// conversation: mail sent there lands in the guest's Airbnb inbox, exactly as
// if the host had replied from their own mail client.
//
// So a relay address is a hard prerequisite. We hold one only for threads that
// have received at least one Airbnb notification since intake began storing
// them — this route reports that plainly rather than pretending to send.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendMailgunEmail } from "@/lib/integrations/mailgun";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  reservation_id: z.string().uuid(),
  message: z.string().trim().min(1).max(4000),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const db = createServiceClient() as any;

  const { data: resv } = await db
    .from("reservations")
    .select("id, property_id, reservation_code, check_in, check_out")
    .eq("id", body.reservation_id)
    .maybeSingle();
  if (!resv) {
    return NextResponse.json({ error: "reservation not found" }, { status: 404 });
  }

  // Find the conversation this reservation belongs to. Reservation code is the
  // reliable key; property + overlapping stay dates is the fallback for
  // threads created before a code was known.
  let thread: { id: string; reply_relay: string | null } | null = null;

  if (resv.reservation_code) {
    const { data } = await db
      .from("message_threads")
      .select("id, reply_relay")
      .eq("reservation_code", resv.reservation_code)
      .maybeSingle();
    thread = data ?? null;
  }
  if (!thread?.reply_relay && resv.property_id) {
    const { data } = await db
      .from("message_threads")
      .select("id, reply_relay")
      .eq("property_id", resv.property_id)
      .not("reply_relay", "is", null)
      .gte("last_message_at", resv.check_in)
      .order("last_message_at", { ascending: false })
      .limit(1);
    if (data?.length) thread = data[0];
  }

  if (!thread?.reply_relay) {
    return NextResponse.json(
      {
        error: "no_relay",
        message:
          "No Airbnb reply address for this guest yet. Airbnb only gives us one inside a notification email about this conversation — forward one to airbnb@mg.beyonddon.com, or send this first message from Airbnb and replies after that can go from here.",
      },
      { status: 409 },
    );
  }

  try {
    await sendMailgunEmail({
      to: thread.reply_relay,
      subject: "Message from your host",
      text: body.message,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "send failed" },
      { status: 502 },
    );
  }

  const now = new Date().toISOString();
  await db.from("messages").insert({
    thread_id: thread.id,
    direction: "outbound",
    sender: "Donovan",
    body: body.message,
    sent_at: now,
    sent_via: "dashboard_checkin",
    raw: { via: "checkin_page", reservation_code: resv.reservation_code },
  });
  await db
    .from("message_threads")
    .update({ last_message_at: now, last_message_preview: body.message.slice(0, 200) })
    .eq("id", thread.id);

  return NextResponse.json({ ok: true, thread_id: thread.id });
}
