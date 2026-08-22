// Register a passkey against an already-enrolled device.
//
// Requires a live session: adding a biometric credential is a privileged act,
// so it is gated the same way PIN enrolment is. The passkey becomes a faster
// alternative to the PIN on this device, never a replacement for enrolment.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { rpConfig, CHALLENGE_TTL_MS } from "@/lib/auth/webauthn";

export const runtime = "nodejs";

const Body = z.object({
  step: z.enum(["options", "verify"]),
  device_id: z.string().min(8),
  response: z.any().optional(),
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

  const db = createServiceClient();
  const { origin, rpID, rpName } = rpConfig(req.headers.get("origin"));

  const { data: device } = await (db as any)
    .from("auth_devices")
    .select("id, user_id")
    .eq("device_id", body.device_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!device) return NextResponse.json({ error: "unknown device" }, { status: 404 });

  if (body.step === "options") {
    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userName: user.email ?? "host",
      userDisplayName: user.email ?? "host",
      attestationType: "none",
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "required",
        authenticatorAttachment: "platform", // built-in biometrics, not a USB key
      },
    });

    await (db as any).from("auth_challenges").insert({
      device_id: body.device_id,
      user_id: user.id,
      challenge: options.challenge,
      purpose: "register",
      expires_at: new Date(Date.now() + CHALLENGE_TTL_MS).toISOString(),
    });

    return NextResponse.json(options);
  }

  // verify
  const { data: rows } = await (db as any)
    .from("auth_challenges")
    .select("id, challenge, expires_at")
    .eq("device_id", body.device_id)
    .eq("purpose", "register")
    .order("created_at", { ascending: false })
    .limit(1);
  const challenge = rows?.[0];
  if (!challenge || new Date(challenge.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "challenge expired — try again" }, { status: 400 });
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "verification failed" },
      { status: 400 },
    );
  }

  // Single-use challenge.
  await (db as any).from("auth_challenges").delete().eq("id", challenge.id);

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: "verification failed" }, { status: 400 });
  }

  const cred = verification.registrationInfo.credential;
  await (db as any)
    .from("auth_devices")
    .update({
      passkey_cred_id: cred.id,
      passkey_pubkey: Buffer.from(cred.publicKey).toString("base64url"),
      passkey_counter: cred.counter,
      passkey_transports: cred.transports ?? null,
    })
    .eq("id", device.id);

  return NextResponse.json({ ok: true });
}
