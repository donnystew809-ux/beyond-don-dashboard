// POST /api/ops/inventory — inventory management.
//
//   upsert_item { property_id, id?, name, unit?, par_level, current_qty, notes? } (admin)
//   delete_item { id }                                                            (admin)
//   adjust      { item_id, qty }  — set the current count (cleaner report)        (scoped)
//
// `adjust` runs on the user's client so RLS enforces property scoping; the
// usage delta is recorded in inventory_log and low stock raises a
// notification for staff.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createClient, createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("upsert_item"),
    property_id: z.string().uuid(),
    id: z.string().uuid().optional(),
    name: z.string().min(1).max(120),
    unit: z.string().min(1).max(20).default("ct"),
    par_level: z.number().int().min(0).max(9999),
    current_qty: z.number().int().min(0).max(9999),
    notes: z.string().max(500).nullish(),
  }),
  z.object({ action: z.literal("delete_item"), id: z.string().uuid() }),
  z.object({
    action: z.literal("adjust"),
    item_id: z.string().uuid(),
    qty: z.number().int().min(0).max(9999),
  }),
]);

async function isAdmin(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.role === "admin";
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "bad request" },
      { status: 400 },
    );
  }

  if (body.action === "upsert_item" || body.action === "delete_item") {
    if (!(await isAdmin(supabase, user.id))) {
      return NextResponse.json({ error: "admin only" }, { status: 403 });
    }
    const service = createServiceClient() as any;
    if (body.action === "delete_item") {
      const { error } = await service.from("inventory_items").delete().eq("id", body.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }
    const { error } = await service.from("inventory_items").upsert({
      ...(body.id ? { id: body.id } : {}),
      property_id: body.property_id,
      name: body.name,
      unit: body.unit,
      par_level: body.par_level,
      current_qty: body.current_qty,
      notes: body.notes ?? null,
      updated_at: new Date().toISOString(),
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // adjust — user client, RLS-scoped
  const db = supabase as any;
  const { data: item } = await db
    .from("inventory_items")
    .select("id, property_id, name, unit, par_level, current_qty")
    .eq("id", body.item_id)
    .maybeSingle();
  if (!item) return NextResponse.json({ error: "item not found" }, { status: 404 });

  const delta = body.qty - item.current_qty;
  const { error } = await db
    .from("inventory_items")
    .update({ current_qty: body.qty, updated_at: new Date().toISOString() })
    .eq("id", body.item_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await db.from("inventory_log").insert({
    item_id: body.item_id,
    delta,
    qty_after: body.qty,
    reported_by: user.id,
  });

  if (body.qty < item.par_level) {
    const service = createServiceClient() as any;
    await service.from("notification_events").insert({
      type: "low_stock",
      property_id: item.property_id,
      ref_id: item.id,
      title: `Low stock: ${item.name}`,
      body: `${body.qty} ${item.unit} on hand — par level is ${item.par_level}.`,
      severity: "warning",
    });
  }
  return NextResponse.json({ ok: true, low: body.qty < item.par_level });
}
