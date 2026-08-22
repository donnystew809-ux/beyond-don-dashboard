// Exchange (device secret + PIN) for a real Supabase session.
//
// Both halves are required. The secret proves "this browser was enrolled by
// someone holding a valid session"; the PIN proves "the person at the keyboard
// is the owner". Failures are counted per device and lock the device after
// MAX_FAILED_ATTEMPTS, which caps the 10,000-combination PIN space long before
// it can be walked.
//
// Error messages are deliberately uniform: revealing "wrong PIN" vs "unknown
// device" would tell an attacker which half they already hold.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  hashSecret,
  verifyPin,
  constantTimeEqual,
  isLocked,
  lockoutUntil,
  MAX_FAILED_ATTEMPTS,
  LOCKOUT_MINUTES,
} from "@/lib/auth/device";

export const runtime = "nodejs";

const Body = z.object({
  device_id: z.string().min(8),
  device_secret: z.string().min(8),
  pin: z.string().min(4).max(6),
});

const GENERIC = "That PIN doesn't match this device.";

export async function POST(req: NextRequest) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const db = createServiceClient();
  const { data: device } = await (db as any)
    .from("auth_devices")
    .select("id, user_id, secret_hash, pin_hash, pin_salt, failed_attempts, locked_until")
    .eq("device_id", body.device_id)
    .maybeSingle();

  if (!device) return NextResponse.json({ error: GENERIC }, { status: 401 });

  if (isLocked(device.locked_until)) {
    const mins = Math.ceil(
      (new Date(device.locked_until).getTime() - Date.now()) / 60_000,
    );
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`, locked: true },
      { status: 429 },
    );
  }

  const secretOk = constantTimeEqual(hashSecret(body.device_secret), device.secret_hash);
  const pinOk =
    device.pin_hash && device.pin_salt
      ? await verifyPin(body.pin, device.pin_hash, device.pin_salt)
      : false;

  if (!secretOk || !pinOk) {
    const attempts = (device.failed_attempts ?? 0) + 1;
    const locking = attempts >= MAX_FAILED_ATTEMPTS;
    await (db as any)
      .from("auth_devices")
      .update({
        failed_attempts: locking ? 0 : attempts,
        locked_until: locking ? lockoutUntil() : null,
      })
      .eq("id", device.id);

    return NextResponse.json(
      {
        error: locking
          ? `Too many attempts. This device is locked for ${LOCKOUT_MINUTES} minutes.`
          : GENERIC,
        attempts_remaining: locking ? 0 : MAX_FAILED_ATTEMPTS - attempts,
        locked: locking,
      },
      { status: locking ? 429 : 401 },
    );
  }

  // Both halves check out — mint a genuine Supabase session for this user.
  const { data: userRow } = await (db as any).auth.admin.getUserById(device.user_id);
  const email = userRow?.user?.email;
  if (!email) return NextResponse.json({ error: GENERIC }, { status: 401 });

  const { data: link, error: linkErr } = await (db as any).auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkErr || !tokenHash) {
    return NextResponse.json({ error: "could not start session" }, { status: 500 });
  }

  const ssr = await createClient();
  const { error: verifyErr } = await ssr.auth.verifyOtp({
    token_hash: tokenHash,
    type: "magiclink",
  });
  if (verifyErr) {
    return NextResponse.json({ error: "could not start session" }, { status: 500 });
  }

  await (db as any)
    .from("auth_devices")
    .update({ failed_attempts: 0, locked_until: null, last_used_at: new Date().toISOString() })
    .eq("id", device.id);

  return NextResponse.json({ ok: true });
}
