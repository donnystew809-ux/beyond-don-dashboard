// POST /api/ops/checklist — checklist lifecycle.
//
// Actions:
//   save_template { property_id, title?, items: [{text}] }        (admin)
//   start        { cleaning_id, property_id }                      (scoped)
//   toggle       { checklist_id, index, checked }                  (scoped)
//   submit       { checklist_id }                                  (scoped)
//
// Scoped actions run on the USER's client, so RLS (has_property_access)
// enforces that a cleaner can only touch their granted property — the route
// adds no trust of its own. Admin template writes go through the service
// client after an explicit admin check.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createClient, createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save_template"),
    property_id: z.string().uuid(),
    title: z.string().min(1).max(120).default("Cleaning checklist"),
    items: z.array(z.object({ text: z.string().min(1).max(300) })).max(100),
  }),
  z.object({
    action: z.literal("start"),
    cleaning_id: z.string().uuid(),
    property_id: z.string().uuid(),
  }),
  z.object({
    action: z.literal("toggle"),
    checklist_id: z.string().uuid(),
    index: z.number().int().min(0).max(199),
    checked: z.boolean(),
  }),
  z.object({ action: z.literal("submit"), checklist_id: z.string().uuid() }),
]);

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

  const db = supabase as any; // ops tables predate generated types

  if (body.action === "save_template") {
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();
    if (roleRow?.role !== "admin") {
      return NextResponse.json({ error: "admin only" }, { status: 403 });
    }
    const service = createServiceClient() as any;
    const { error } = await service.from("checklist_templates").upsert(
      {
        property_id: body.property_id,
        title: body.title,
        items: body.items,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "property_id" },
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "start") {
    // Copy the property's template items into a working checklist for this
    // cleaning. RLS: insert allowed only when has_property_access.
    const { data: template } = await db
      .from("checklist_templates")
      .select("id, items")
      .eq("property_id", body.property_id)
      .maybeSingle();
    const items = ((template?.items ?? []) as Array<{ text: string }>).map(
      (i) => ({ text: i.text, checked: false }),
    );
    const { data, error } = await db
      .from("cleaning_checklists")
      .upsert(
        {
          cleaning_id: body.cleaning_id,
          property_id: body.property_id,
          template_id: template?.id ?? null,
          items,
          status: "in_progress",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "cleaning_id" },
      )
      .select("id, items, status")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, checklist: data });
  }

  if (body.action === "toggle") {
    const { data: cl, error: readErr } = await db
      .from("cleaning_checklists")
      .select("id, items, status")
      .eq("id", body.checklist_id)
      .maybeSingle();
    if (readErr || !cl)
      return NextResponse.json({ error: "checklist not found" }, { status: 404 });
    if (cl.status === "submitted")
      return NextResponse.json({ error: "already submitted" }, { status: 409 });
    const items = [...(cl.items as Array<{ text: string; checked: boolean }>)];
    if (!items[body.index])
      return NextResponse.json({ error: "bad item index" }, { status: 400 });
    items[body.index] = { ...items[body.index], checked: body.checked };
    const { error } = await db
      .from("cleaning_checklists")
      .update({ items, updated_at: new Date().toISOString() })
      .eq("id", body.checklist_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // submit
  const { data: cl } = await db
    .from("cleaning_checklists")
    .select("id, items, cleaning_id, property_id")
    .eq("id", body.checklist_id)
    .maybeSingle();
  if (!cl) return NextResponse.json({ error: "checklist not found" }, { status: 404 });
  const items = (cl.items ?? []) as Array<{ checked: boolean }>;
  const done = items.filter((i) => i.checked).length;
  const { error } = await db
    .from("cleaning_checklists")
    .update({
      status: "submitted",
      submitted_by: user.id,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", body.checklist_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Notify staff — flag incomplete submissions.
  const service = createServiceClient() as any;
  await service.from("notification_events").insert({
    type: "checklist_submitted",
    property_id: cl.property_id,
    ref_id: cl.id,
    title: `Cleaning checklist submitted (${done}/${items.length})`,
    body:
      done === items.length
        ? "All items complete."
        : `${items.length - done} item(s) left unchecked — review before turnover.`,
    severity: done === items.length ? "info" : "warning",
  });
  return NextResponse.json({ ok: true, complete: done === items.length });
}
