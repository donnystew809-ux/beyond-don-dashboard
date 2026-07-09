// Mailgun integration — inbound webhook verification + outbound send.
//
// Inbound: Mailgun receives Airbnb notification emails forwarded to
// inbox@<MAILGUN_DOMAIN> and POSTs the parsed message to
// /api/messages/intake. Every webhook carries a signature we MUST verify
// (timestamp + token HMAC-SHA256'd with the signing key) or anyone could
// inject fake "guest messages" into the pipeline.
//
// Outbound: replies go back through the Airbnb relay address
// (*@reply.airbnb.com) found in the notification's Reply-To header —
// replying to that address posts the text into the Airbnb thread.

import crypto from "node:crypto";

const API_BASE = "https://api.mailgun.net/v3";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} not set`);
  return v;
}

/** Verify a Mailgun webhook signature. Reject the request when false. */
export function verifyMailgunSignature(params: {
  timestamp: string;
  token: string;
  signature: string;
}): boolean {
  const signingKey = process.env.MAILGUN_SIGNING_KEY;
  if (!signingKey) return false;
  const digest = crypto
    .createHmac("sha256", signingKey)
    .update(params.timestamp + params.token)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(digest, "hex"),
      Buffer.from(params.signature, "hex"),
    );
  } catch {
    return false;
  }
}

/**
 * Send an email via Mailgun. Used to post replies back into Airbnb threads
 * via the notification's reply-relay address.
 */
export async function sendMailgunEmail(params: {
  to: string;
  subject: string;
  text: string;
  /** Defaults to MAILGUN_REPLY_FROM (the address Airbnb knows as the host). */
  from?: string;
  inReplyTo?: string; // Message-Id of the notification, keeps threading intact
}): Promise<{ id: string }> {
  const domain = env("MAILGUN_DOMAIN");
  const apiKey = env("MAILGUN_API_KEY");
  const from = params.from ?? env("MAILGUN_REPLY_FROM");

  const form = new URLSearchParams();
  form.set("from", from);
  form.set("to", params.to);
  form.set("subject", params.subject);
  form.set("text", params.text);
  if (params.inReplyTo) {
    form.set("h:In-Reply-To", params.inReplyTo);
    form.set("h:References", params.inReplyTo);
  }

  const res = await fetch(`${API_BASE}/${domain}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Mailgun send failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as { id?: string };
  return { id: json.id ?? "" };
}
