// Set or change the account PIN. Requires a live session — the PIN is only as
// trustworthy as the moment it was created.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { hashPin, validatePin } from "@/lib/auth/device";

export const runtime = "nodejs";

const Body = z.object({ pin: z.string() });

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

  const problem = validatePin(body.pin);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const { hash, salt } = await hashPin(body.pin);
  const db = createServiceClient();
  const { error } = await (db as any).from("user_pins").upsert(
    {
      user_id: user.id,
      pin_hash: hash,
      pin_salt: salt,
      pin_length: body.pin.length,
      failed_attempts: 0,
      locked_until: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, pin_length: body.pin.length });
}

export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const db = createServiceClient();
  await (db as any).from("user_pins").delete().eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}

/** Whether this account already has a PIN (never returns the hash). */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const db = createServiceClient();
  const { data } = await (db as any)
    .from("user_pins")
    .select("pin_length, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({
    has_pin: !!data,
    pin_length: data?.pin_length ?? null,
    updated_at: data?.updated_at ?? null,
  });
}
