// POST /api/invites/accept  { token }
//
// Called by the /invite/accept page once the invitee is authenticated (via the
// auth link in their invite). Validates the invite, then — as the service role
// — creates their user_roles row and per-property access grants, and marks the
// invite accepted. Idempotent: re-accepting a consumed/expired invite is a
// no-op error, and role/access upserts don't duplicate.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { hashPin, validatePin } from "@/lib/auth/device";

export const runtime = "nodejs";

const Body = z.object({
  token: z.string().min(10),
  // Onboarding captures contact details and the PIN in the same step, so an
  // invitee is never left with an account they cannot sign back into.
  phone: z.string().trim().min(7).max(30),
  pin: z.string(),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const pinProblem = validatePin(body.pin);
  if (pinProblem) return NextResponse.json({ error: pinProblem }, { status: 400 });

  const service = createServiceClient() as any;
  const { data: invite } = await service
    .from("invites")
    .select("id, email, role, property_ids, access_level, status, expires_at")
    .eq("token", body.token)
    .maybeSingle();

  if (!invite) return NextResponse.json({ error: "invite not found" }, { status: 404 });
  if (invite.status !== "pending") {
    return NextResponse.json({ error: `invite already ${invite.status}` }, { status: 409 });
  }
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    await service.from("invites").update({ status: "expired" }).eq("id", invite.id);
    return NextResponse.json({ error: "invite expired" }, { status: 410 });
  }
  // The signed-in user's email must match the invite (case-insensitive).
  if ((user.email ?? "").toLowerCase() !== String(invite.email).toLowerCase()) {
    return NextResponse.json(
      { error: "this invite was issued to a different email" },
      { status: 403 },
    );
  }

  // Assign role (never downgrade an existing admin).
  const { data: existing } = await service
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing?.role !== "admin") {
    await service
      .from("user_roles")
      .upsert({ user_id: user.id, role: invite.role }, { onConflict: "user_id" });
  }

  // Contact record + sign-in PIN. Written before the invite is consumed so a
  // failure here cannot strand someone with a used invite and no way in.
  await service.from("user_profiles").upsert(
    { user_id: user.id, phone: body.phone, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );

  const { hash, salt } = await hashPin(body.pin);
  await service.from("user_pins").upsert(
    {
      user_id: user.id,
      pin_hash: hash,
      pin_salt: salt,
      pin_length: body.pin.length,
      failed_attempts: 0,
      locked_until: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  // Per-property access grants.
  const propertyIds: string[] = invite.property_ids ?? [];
  if (propertyIds.length > 0) {
    await service.from("property_access").upsert(
      propertyIds.map((pid) => ({
        user_id: user.id,
        property_id: pid,
        access_level: invite.access_level,
        granted_by: null,
      })),
      { onConflict: "user_id,property_id" },
    );
  }

  await service
    .from("invites")
    .update({ status: "accepted", accepted_at: new Date().toISOString() })
    .eq("id", invite.id);

  // Where to send them next based on the role they just got.
  const home =
    invite.role === "cleaner" || invite.role === "owner" || invite.role === "partner"
      ? "/my-property"
      : "/today";
  return NextResponse.json({ ok: true, role: invite.role, next: home });
}
