// POST /api/messages/automation — admin controls for the messaging pipeline.
//
// Two actions:
//   { action: "kill_switch", enabled: boolean }
//     Global halt. When enabled, the intake pipeline still ingests + drafts
//     but NEVER auto-sends.
//   { action: "property_auto_send", property_id: string, enabled: boolean }
//     Per-property opt-in for auto-sending routine replies.

import { NextResponse } from "next/server";

import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (roleRow?.role !== "admin") {
    return NextResponse.json({ error: "admin only" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.action) {
    return NextResponse.json({ error: "action required" }, { status: 400 });
  }

  const service = createServiceClient() as any;

  if (body.action === "kill_switch") {
    const enabled = Boolean(body.enabled);
    const { error } = await service.from("app_settings").upsert(
      {
        key: "messaging_kill_switch",
        value: { enabled },
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await service.from("message_audit").insert({
      action: enabled ? "killswitch_enabled" : "killswitch_disabled",
      payload: { by: user.email },
    });
    return NextResponse.json({ ok: true, kill_switch: enabled });
  }

  if (body.action === "property_auto_send") {
    if (!body.property_id) {
      return NextResponse.json({ error: "property_id required" }, { status: 400 });
    }
    const enabled = Boolean(body.enabled);
    const { error } = await service
      .from("properties")
      .update({ auto_send_messages: enabled })
      .eq("id", body.property_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await service.from("message_audit").insert({
      action: enabled ? "property_auto_send_enabled" : "property_auto_send_disabled",
      payload: { property_id: body.property_id, by: user.email },
    });
    return NextResponse.json({ ok: true, property_id: body.property_id, auto_send: enabled });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
