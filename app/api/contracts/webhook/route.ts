// POST /api/contracts/webhook — Dropbox Sign event callback.
//
// Dropbox Sign POSTs multipart form data with a `json` field containing the
// event + signature_request. We verify the event HMAC, update the contract
// row, and on completion download + store the signed PDF in the private
// `contracts` Storage bucket. Must respond with the literal string
// "Hello API Event Received" for Dropbox Sign to mark delivery successful.

import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyEventHash, downloadSignedPdf } from "@/lib/integrations/dropbox-sign";

export const runtime = "nodejs";
export const maxDuration = 60;

const ACK = "Hello API Event Received";

export async function POST(req: NextRequest) {
  let payload: any;
  try {
    const form = await req.formData();
    payload = JSON.parse(String(form.get("json") ?? "{}"));
  } catch {
    return NextResponse.json({ error: "bad payload" }, { status: 400 });
  }

  const event = payload?.event;
  if (
    !event?.event_hash ||
    !verifyEventHash({
      event_time: String(event.event_time ?? ""),
      event_type: String(event.event_type ?? ""),
      event_hash: String(event.event_hash),
    })
  ) {
    return NextResponse.json({ error: "invalid event hash" }, { status: 401 });
  }

  const db = createServiceClient() as any;
  const srId: string | undefined =
    payload?.signature_request?.signature_request_id;

  const type = String(event.event_type ?? "");
  if (srId) {
    const statusMap: Record<string, string> = {
      signature_request_viewed: "viewed",
      signature_request_signed: "signed",
      signature_request_all_signed: "signed",
      signature_request_declined: "declined",
      signature_request_canceled: "voided",
    };
    const status = statusMap[type];
    if (status) {
      const update: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString(),
      };
      if (status === "signed") update.completed_at = new Date().toISOString();
      await db.from("contracts").update(update).eq("envelope_id", srId);

      // On full completion, archive the signed PDF into Storage.
      if (type === "signature_request_all_signed") {
        try {
          const pdf = await downloadSignedPdf(srId);
          const path = `signed/${srId}.pdf`;
          await db.storage
            .from("contracts")
            .upload(path, pdf, { contentType: "application/pdf", upsert: true });
          await db
            .from("contracts")
            .update({ signed_pdf_path: path, updated_at: new Date().toISOString() })
            .eq("envelope_id", srId);
          await db.from("notification_events").insert({
            type: "contract_signed",
            title: "Contract fully signed",
            body: `Signed PDF archived (${path}).`,
            severity: "info",
          });
        } catch {
          // PDF may not be ready instantly; Dropbox Sign retries events.
        }
      }
    }
  }

  return new NextResponse(ACK, { status: 200 });
}
