// Dropbox Sign (formerly HelloSign) API client — signature requests for the
// management agreement.
//
// Env:
//   DROPBOX_SIGN_API_KEY   — API key (Settings → API on the Dropbox Sign app)
//   DROPBOX_SIGN_TEST_MODE — "1" while on a free/dev plan (watermarked, free)
//
// The API is a straightforward REST surface with Basic auth (key as
// username, blank password). We send the agreement PDF as a file_url or
// uploaded file; the callback webhook (api/contracts/webhook) receives
// signature_request events verified by an HMAC of the event payload.

import crypto from "node:crypto";

const BASE = "https://api.hellosign.com/v3";

export function dropboxSignConfigured(): boolean {
  return Boolean(process.env.DROPBOX_SIGN_API_KEY);
}

function authHeader(): string {
  const key = process.env.DROPBOX_SIGN_API_KEY;
  if (!key) throw new Error("DROPBOX_SIGN_API_KEY not set");
  return `Basic ${Buffer.from(`${key}:`).toString("base64")}`;
}

export type SignatureRequest = {
  signature_request_id: string;
  signing_url: string | null;
  details_url: string | null;
};

/**
 * Send a signature request using an uploaded PDF.
 * `fileBuffer` is the agreement PDF (e.g. from Supabase Storage or bundled).
 */
export async function sendSignatureRequest(opts: {
  title: string;
  subject: string;
  message: string;
  signerName: string;
  signerEmail: string;
  fileBuffer: Buffer;
  fileName?: string;
}): Promise<SignatureRequest> {
  const form = new FormData();
  form.set("title", opts.title);
  form.set("subject", opts.subject);
  form.set("message", opts.message);
  form.set("signers[0][name]", opts.signerName);
  form.set("signers[0][email_address]", opts.signerEmail);
  if (process.env.DROPBOX_SIGN_TEST_MODE === "1") form.set("test_mode", "1");
  form.set(
    "file[0]",
    new Blob([new Uint8Array(opts.fileBuffer)], { type: "application/pdf" }),
    opts.fileName ?? "agreement.pdf",
  );

  const res = await fetch(`${BASE}/signature_request/send`, {
    method: "POST",
    headers: { Authorization: authHeader() },
    body: form,
  });
  const json = (await res.json()) as any;
  if (!res.ok) {
    throw new Error(
      `Dropbox Sign send failed (${res.status}): ${JSON.stringify(json?.error ?? json).slice(0, 300)}`,
    );
  }
  const sr = json.signature_request;
  return {
    signature_request_id: sr.signature_request_id,
    signing_url: sr.signing_url ?? null,
    details_url: sr.details_url ?? null,
  };
}

/** Download the final signed PDF for a completed request. */
export async function downloadSignedPdf(signatureRequestId: string): Promise<Buffer> {
  const res = await fetch(
    `${BASE}/signature_request/files/${encodeURIComponent(signatureRequestId)}?file_type=pdf`,
    { headers: { Authorization: authHeader() } },
  );
  if (!res.ok) throw new Error(`Dropbox Sign download failed (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Verify a callback event. Dropbox Sign signs events with
 * HMAC-SHA256(api_key, event_time + event_type).
 */
export function verifyEventHash(event: {
  event_time: string;
  event_type: string;
  event_hash: string;
}): boolean {
  const key = process.env.DROPBOX_SIGN_API_KEY;
  if (!key) return false;
  const digest = crypto
    .createHmac("sha256", key)
    .update(event.event_time + event.event_type)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(event.event_hash));
  } catch {
    return false;
  }
}
