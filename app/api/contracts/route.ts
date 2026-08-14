// Contracts API.
//   POST { signer_name, signer_email, title?, message?, property_id? }
//     → sends the management agreement for signature (admin only)
//   GET → list contracts (staff)
//
// The agreement template comes from Supabase Storage bucket `contracts`,
// object `templates/management-agreement.pdf` (upload once via dashboard).
// Gated: returns 503 with a setup note until DROPBOX_SIGN_API_KEY is set.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  dropboxSignConfigured,
  sendSignatureRequest,
} from "@/lib/integrations/dropbox-sign";

export const runtime = "nodejs";
export const maxDuration = 60;

const TEMPLATE_PATH = "templates/management-agreement.pdf";

const Body = z.object({
  signer_name: z.string().min(1).max(120),
  signer_email: z.string().email(),
  title: z.string().min(1).max(160).default("BEYOND DON Management Agreement"),
  message: z.string().max(1000).default(
    "Please review and sign the management agreement. Reach out with any questions — Donovan",
  ),
  property_id: z.string().uuid().nullish(),
});

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "unauthorized" as const, status: 401 };
  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (roleRow?.role !== "admin") return { error: "admin only" as const, status: 403 };
  return { user };
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  if (!dropboxSignConfigured()) {
    return NextResponse.json(
      {
        error:
          "E-sign not configured yet. Add DROPBOX_SIGN_API_KEY (and DROPBOX_SIGN_TEST_MODE=1 while testing) in Vercel, and upload the agreement template to Storage: contracts/templates/management-agreement.pdf",
      },
      { status: 503 },
    );
  }

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "bad request" },
      { status: 400 },
    );
  }

  const service = createServiceClient() as any;

  // Pull the agreement template from Storage.
  const { data: file, error: dlErr } = await service.storage
    .from("contracts")
    .download(TEMPLATE_PATH);
  if (dlErr || !file) {
    return NextResponse.json(
      { error: `Agreement template missing — upload it to Storage at contracts/${TEMPLATE_PATH}` },
      { status: 503 },
    );
  }
  const buffer = Buffer.from(await file.arrayBuffer());

  // Record first (status draft), then send, then update — so a send failure
  // still leaves an auditable row.
  const { data: row, error: insErr } = await service
    .from("contracts")
    .insert({
      title: body.title,
      signer_name: body.signer_name,
      signer_email: body.signer_email.toLowerCase(),
      property_id: body.property_id ?? null,
      message: body.message,
      created_by: gate.user.id,
    })
    .select("id")
    .single();
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  try {
    const sr = await sendSignatureRequest({
      title: body.title,
      subject: body.title,
      message: body.message,
      signerName: body.signer_name,
      signerEmail: body.signer_email,
      fileBuffer: buffer,
      fileName: "BeyondDon-Management-Agreement.pdf",
    });
    await service
      .from("contracts")
      .update({
        status: "sent",
        envelope_id: sr.signature_request_id,
        sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    return NextResponse.json({ ok: true, contract_id: row.id });
  } catch (err) {
    await service
      .from("contracts")
      .update({ status: "error", updated_at: new Date().toISOString() })
      .eq("id", row.id);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "send failed" },
      { status: 502 },
    );
  }
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data } = await (supabase as any)
    .from("contracts")
    .select("id, title, signer_name, signer_email, status, sent_at, completed_at, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  return NextResponse.json({ contracts: data ?? [] });
}
