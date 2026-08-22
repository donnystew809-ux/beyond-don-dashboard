// WebAuthn (Face ID / Touch ID / Windows Hello) configuration.
//
// rpID must be the bare hostname and the origin must match exactly, or the
// browser refuses the ceremony. Both are derived from the request so the same
// code works on localhost during verification and on the deployed domain.

export function rpConfig(originHeader: string | null) {
  const origin = originHeader ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const rpID = new URL(origin).hostname;
  return { origin, rpID, rpName: "BEYOND DON LLC" };
}

export const CHALLENGE_TTL_MS = 5 * 60_000;
