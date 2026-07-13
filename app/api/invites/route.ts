// Invites API — admin creates an invite for a cleaner / owner / partner and
// gets back a single-use join link to send them.
//
//   POST  { email, role, property_ids[], access_level } → { invite, join_url }
//   GET   → { invites }   (pending + recent, admin only)
//
// Flow: we store an invites row with a random token, then mint a Supabase
// auth link (creates the user if new) whose post-login `next` lands them on
// /invite/accept?token=<our token>, where accepting assigns their role +
// per-property access. Nothing is granted until they accept.

import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createClient, createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://beyond-don-dashboard.vercel.app";

const CreateBody = z.object({
  email: z.string().email(),
  role: z.enum(["operator", "cleaner", "owner", "partner"]),
  property_ids: z.array(z.string().uuid()).default([]),
  access_level: z.enum(["cleaning", "owner_view", "full"]).default("cleaning"),
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

  let body: z.infer<typeof CreateBody>;
  try {
    body = CreateBody.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "bad request" },
      { status: 400 },
    );
  }

  const service = createServiceClient() as any;
  const token = crypto.randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

  const { data: invite, error } = await service
    .from("invites")
    .insert({
      email: body.email.toLowerCase(),
      role: body.role,
      property_ids: body.property_ids,
      access_level: body.access_level,
      token,
      status: "pending",
      invited_by: gate.user.id,
      expires_at: expiresAt,
    })
    .select("id, email, role, property_ids, access_level, status, expires_at, created_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Mint an auth link (creates the user if they don't have an account yet),
  // routing them to the accept page after login. If email delivery is later
  // wired through Mailgun, send join_url there; for now the admin copies it.
  let joinUrl: string | null = null;
  try {
    const next = `/invite/accept?token=${encodeURIComponent(token)}`;
    const { data: link } = await service.auth.admin.generateLink({
      type: "invite",
      email: body.email.toLowerCase(),
      options: { redirectTo: `${SITE_URL}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    const hashed = link?.properties?.hashed_token;
    if (hashed) {
      const url = new URL(`${SITE_URL}/auth/callback`);
      url.searchParams.set("token_hash", hashed);
      url.searchParams.set("type", "invite");
      url.searchParams.set("next", next);
      joinUrl = url.toString();
    }
  } catch {
    // User may already exist → fall back to a magic link.
    try {
      const next = `/invite/accept?token=${encodeURIComponent(token)}`;
      const { data: link } = await service.auth.admin.generateLink({
        type: "magiclink",
        email: body.email.toLowerCase(),
      });
      const hashed = link?.properties?.hashed_token;
      if (hashed) {
        const url = new URL(`${SITE_URL}/auth/callback`);
        url.searchParams.set("token_hash", hashed);
        url.searchParams.set("type", "magiclink");
        url.searchParams.set("next", next);
        joinUrl = url.toString();
      }
    } catch {
      // leave joinUrl null — admin can re-issue
    }
  }

  return NextResponse.json({ invite, join_url: joinUrl });
}

export async function GET() {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const service = createServiceClient() as any;
  const { data: invites } = await service
    .from("invites")
    .select("id, email, role, property_ids, access_level, status, expires_at, accepted_at, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  return NextResponse.json({ invites: invites ?? [] });
}
