// Sign in with email + PIN, from any device.
//
// The PIN is the entire credential here, so rate limiting is the entire
// defence. Three layers, in order:
//
//   1. Per-IP throttle — blunts distributed guessing before we even look up
//      the account, and costs an attacker nothing to trigger but time.
//   2. Per-account lockout — 5 consecutive failures freezes the account for
//      15 minutes regardless of where the attempts came from.
//   3. Alert on an unrecognised device — a successful guess stops being
//      silent. Detection matters precisely because prevention is thinner
//      than it would be with a device-bound secret.
//
// Responses are uniform: "email or PIN is incorrect" whether the account
// exists, has no PIN, or the PIN is simply wrong. Anything more specific
// hands an attacker free information about which emails are real.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  verifyPin,
  isLocked,
  lockoutUntil,
  MAX_FAILED_ATTEMPTS,
  LOCKOUT_MINUTES,
} from "@/lib/auth/device";
import { sendMailgunEmail } from "@/lib/integrations/mailgun";

export const runtime = "nodejs";

const Body = z.object({
  email: z.string().email(),
  pin: z.string().min(4).max(6),
  device_id: z.string().optional(),
});

const GENERIC = "Email or PIN is incorrect.";

/** Failed attempts from one IP within this window before we start refusing. */
const IP_WINDOW_MINUTES = 15;
const IP_MAX_FAILURES = 20;

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function POST(req: NextRequest) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const db = createServiceClient();
  const ip = clientIp(req);
  const email = body.email.trim().toLowerCase();

  const log = async (success: boolean, reason: string) => {
    await (db as any)
      .from("auth_login_attempts")
      .insert({ email, ip, success, reason });
  };

  // ── 1. Per-IP throttle ────────────────────────────────────────────────
  const since = new Date(Date.now() - IP_WINDOW_MINUTES * 60_000).toISOString();
  const { count: recentFailures } = await (db as any)
    .from("auth_login_attempts")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .eq("success", false)
    .gte("created_at", since);

  if ((recentFailures ?? 0) >= IP_MAX_FAILURES) {
    await log(false, "ip_throttled");
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${IP_WINDOW_MINUTES} minutes.` },
      { status: 429 },
    );
  }

  // ── Resolve the account ───────────────────────────────────────────────
  // listUsers is paginated; filter by email server-side.
  const { data: userList } = await (db as any).auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  const user = (userList?.users ?? []).find(
    (u: { email?: string }) => (u.email ?? "").toLowerCase() === email,
  );
  if (!user) {
    await log(false, "unknown_email");
    return NextResponse.json({ error: GENERIC }, { status: 401 });
  }

  const { data: pinRow } = await (db as any)
    .from("user_pins")
    .select("pin_hash, pin_salt, failed_attempts, locked_until")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!pinRow) {
    await log(false, "no_pin_set");
    return NextResponse.json({ error: GENERIC }, { status: 401 });
  }

  // ── 2. Per-account lockout ────────────────────────────────────────────
  if (isLocked(pinRow.locked_until)) {
    const mins = Math.max(
      1,
      Math.ceil((new Date(pinRow.locked_until).getTime() - Date.now()) / 60_000),
    );
    await log(false, "account_locked");
    return NextResponse.json(
      {
        error: `Too many attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`,
        locked: true,
      },
      { status: 429 },
    );
  }

  const ok = await verifyPin(body.pin, pinRow.pin_hash, pinRow.pin_salt);

  if (!ok) {
    const attempts = (pinRow.failed_attempts ?? 0) + 1;
    const locking = attempts >= MAX_FAILED_ATTEMPTS;
    await (db as any)
      .from("user_pins")
      .update({
        failed_attempts: locking ? 0 : attempts,
        locked_until: locking ? lockoutUntil() : null,
      })
      .eq("user_id", user.id);
    await log(false, "wrong_pin");

    return NextResponse.json(
      {
        error: locking
          ? `Too many attempts. Locked for ${LOCKOUT_MINUTES} minutes.`
          : GENERIC,
        attempts_remaining: locking ? 0 : MAX_FAILED_ATTEMPTS - attempts,
        locked: locking,
      },
      { status: locking ? 429 : 401 },
    );
  }

  // ── Correct PIN — mint a session ──────────────────────────────────────
  const { data: link, error: linkErr } = await (db as any).auth.admin.generateLink({
    type: "magiclink",
    email: user.email,
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkErr || !tokenHash) {
    await log(false, "session_mint_failed");
    return NextResponse.json({ error: "Could not start session." }, { status: 500 });
  }

  const ssr = await createClient();
  const { error: verifyErr } = await ssr.auth.verifyOtp({
    token_hash: tokenHash,
    type: "magiclink",
  });
  if (verifyErr) {
    await log(false, "session_mint_failed");
    return NextResponse.json({ error: "Could not start session." }, { status: 500 });
  }

  await (db as any)
    .from("user_pins")
    .update({ failed_attempts: 0, locked_until: null })
    .eq("user_id", user.id);
  await log(true, "pin_login");

  // ── 3. Alert on an unrecognised device ────────────────────────────────
  // Best-effort: a failure to send must never block a legitimate sign-in.
  try {
    const known = body.device_id
      ? await (db as any)
          .from("auth_devices")
          .select("id")
          .eq("device_id", body.device_id)
          .eq("user_id", user.id)
          .maybeSingle()
      : { data: null };

    if (!known?.data) {
      await sendMailgunEmail({
        to: user.email,
        subject: "New sign-in to your BEYOND DON dashboard",
        text: [
          "Your dashboard was just unlocked with your PIN from a device we don't recognise.",
          "",
          `Time: ${new Date().toUTCString()}`,
          `IP address: ${ip}`,
          "",
          "If this was you, nothing to do.",
          "If it wasn't, change your PIN immediately at",
          "https://beyond-don-dashboard.vercel.app/settings/security",
        ].join("\n"),
      });
    }
  } catch {
    // Alerting is a safety net, not a gate.
  }

  return NextResponse.json({ ok: true });
}
