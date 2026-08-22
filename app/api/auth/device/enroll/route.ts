// Enrol the current browser as a trusted device and set its PIN.
//
// Requires a real, already-authenticated session (magic link): that is the
// moment we know the person is legitimate. Everything the PIN later unlocks
// derives its trust from this step.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  newDeviceId,
  newDeviceSecret,
  hashSecret,
  hashPin,
  validatePin,
} from "@/lib/auth/device";

export const runtime = "nodejs";

const Body = z.object({
  pin: z.string(),
  label: z.string().trim().max(60).optional(),
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

  const pinError = validatePin(body.pin);
  if (pinError) return NextResponse.json({ error: pinError }, { status: 400 });

  const deviceId = newDeviceId();
  const secret = newDeviceSecret();
  const { hash, salt } = await hashPin(body.pin);

  const db = createServiceClient();
  const { error } = await (db as any).from("auth_devices").insert({
    user_id: user.id,
    device_id: deviceId,
    secret_hash: hashSecret(secret),
    pin_hash: hash,
    pin_salt: salt,
    label: body.label ?? null,
    last_used_at: new Date().toISOString(),
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // The secret is returned exactly once and only ever lives in this browser.
  return NextResponse.json({ device_id: deviceId, device_secret: secret });
}
