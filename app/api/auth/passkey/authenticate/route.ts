// Sign in with a passkey (Face ID / Touch ID / Windows Hello).
//
// No session required — this IS the sign-in. Trust comes from the device
// having been enrolled earlier while authenticated, plus the authenticator's
// own user verification (biometric or device passcode). The signature counter
// is checked to catch cloned credentials.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
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
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const db = createServiceClient();
  const { origin, rpID } = rpConfig(req.headers.get("origin"));

  const { data: device } = await (db as any)
    .from("auth_devices")
    .select("id, user_id, passkey_cred_id, passkey_pubkey, passkey_counter, passkey_transports")
    .eq("device_id", body.device_id)
    .maybeSingle();

  if (!device?.passkey_cred_id) {
    return NextResponse.json({ error: "no passkey on this device" }, { status: 404 });
  }

  if (body.step === "options") {
    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: "required",
      allowCredentials: [
        {
          id: device.passkey_cred_id,
          transports: device.passkey_transports ?? undefined,
        },
      ],
    });

    await (db as any).from("auth_challenges").insert({
      device_id: body.device_id,
      user_id: device.user_id,
      challenge: options.challenge,
      purpose: "authenticate",
      expires_at: new Date(Date.now() + CHALLENGE_TTL_MS).toISOString(),
    });

    return NextResponse.json(options);
  }

  const { data: rows } = await (db as any)
    .from("auth_challenges")
    .select("id, challenge, expires_at")
    .eq("device_id", body.device_id)
    .eq("purpose", "authenticate")
    .order("created_at", { ascending: false })
    .limit(1);
  const challenge = rows?.[0];
  if (!challenge || new Date(challenge.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "challenge expired — try again" }, { status: 400 });
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: body.response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: device.passkey_cred_id,
        publicKey: Buffer.from(device.passkey_pubkey, "base64url"),
        counter: Number(device.passkey_counter ?? 0),
        transports: device.passkey_transports ?? undefined,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "verification failed" },
      { status: 401 },
    );
  }

  await (db as any).from("auth_challenges").delete().eq("id", challenge.id);

  if (!verification.verified) {
    return NextResponse.json({ error: "verification failed" }, { status: 401 });
  }

  const { data: userRow } = await (db as any).auth.admin.getUserById(device.user_id);
  const email = userRow?.user?.email;
  if (!email) return NextResponse.json({ error: "verification failed" }, { status: 401 });

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
    .update({
      passkey_counter: verification.authenticationInfo.newCounter,
      last_used_at: new Date().toISOString(),
      failed_attempts: 0,
      locked_until: null,
    })
    .eq("id", device.id);

  return NextResponse.json({ ok: true });
}
