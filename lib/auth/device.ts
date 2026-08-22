// Device-bound credential helpers for PIN + passkey sign-in.
//
// The security rests on a simple split: the browser holds a 256-bit random
// secret, the server holds only its SHA-256. Unlocking requires the secret AND
// the PIN, so neither half is useful alone — a stolen database cannot be
// replayed as a device, and a guessed PIN is worthless without the secret.

import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LEN = 64;

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 15;

export function newDeviceId(): string {
  return randomBytes(16).toString("hex");
}

export function newDeviceSecret(): string {
  return randomBytes(32).toString("base64url");
}

/** Server stores only this. A cheap hash is fine: the input is 256 bits. */
export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/** PINs are low-entropy, so they get a slow KDF and a per-device salt. */
export async function hashPin(pin: string): Promise<{ hash: string; salt: string }> {
  const salt = randomBytes(16).toString("hex");
  const buf = await scrypt(pin, salt, KEY_LEN);
  return { hash: buf.toString("hex"), salt };
}

export async function verifyPin(
  pin: string,
  hash: string,
  salt: string,
): Promise<boolean> {
  const buf = await scrypt(pin, salt, KEY_LEN);
  const expected = Buffer.from(hash, "hex");
  if (expected.length !== buf.length) return false;
  return timingSafeEqual(buf, expected);
}

export function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** 4-6 digits. Rejects the sequences and repeats people reach for first. */
export function validatePin(pin: string): string | null {
  if (!/^\d{4,6}$/.test(pin)) return "PIN must be 4 to 6 digits.";
  if (/^(\d)\1+$/.test(pin)) return "Avoid a PIN that repeats one digit.";
  if ("0123456789".includes(pin) || "9876543210".includes(pin)) {
    return "Avoid sequential digits.";
  }
  return null;
}

export function isLocked(lockedUntil: string | null): boolean {
  return !!lockedUntil && new Date(lockedUntil).getTime() > Date.now();
}

export function lockoutUntil(): string {
  return new Date(Date.now() + LOCKOUT_MINUTES * 60_000).toISOString();
}
