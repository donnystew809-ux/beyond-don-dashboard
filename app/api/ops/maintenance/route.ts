// POST /api/ops/maintenance — maintenance schedules + tasks.
//
//   save_schedule   { property_id, id?, title, cadence_days, last_done_on?, notes?, active? } (admin)
//   delete_schedule { id }                                                                    (admin)
//   complete_task   { task_id }  — marks done, advances the schedule clock                    (scoped)
//   skip_task       { task_id }                                                               (scoped)

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createClient, createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save_schedule"),
    property_id: z.string().uuid(),
    id: z.string().uuid().optional(),
    title: z.string().min(1).max(160),
    cadence_days: z.number().int().min(1).max(3650),
    last_done_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
    notes: z.string().max(500).nullish(),
    active: z.boolean().default(true),
  }),
  z.object({ action: z.literal("delete_schedule"), id: z.string().uuid() }),
  z.object({ action: z.literal("complete_task"), task_id: z.string().uuid() }),
  z.object({ action: z.literal("skip_task"), task_id: z.string().uuid() }),
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

  if (body.action === "save_schedule" || body.action === "delete_schedule") {
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();
    if (roleRow?.role !== "admin") {
      return NextResponse.json({ error: "admin only" }, { status: 403 });
    }
    const service = createServiceClient() as any;
    if (body.action === "delete_schedule") {
      const { error } = await service.from("maintenance_schedules").delete().eq("id", body.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }
    const { error } = await service.from("maintenance_schedules").upsert({
      ...(body.id ? { id: body.id } : {}),
      property_id: body.property_id,
      title: body.title,
      cadence_days: body.cadence_days,
      last_done_on: body.last_done_on ?? null,
      notes: body.notes ?? null,
      active: body.active,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // complete/skip — user client, RLS-scoped.
  const db = supabase as any;
  const { data: task } = await db
    .from("maintenance_tasks")
    .select("id, schedule_id, status")
    .eq("id", body.task_id)
    .maybeSingle();
  if (!task) return NextResponse.json({ error: "task not found" }, { status: 404 });
  if (task.status !== "pending") {
    return NextResponse.json({ error: `task already ${task.status}` }, { status: 409 });
  }

  const done = body.action === "complete_task";
  const { error } = await db
    .from("maintenance_tasks")
    .update({
      status: done ? "done" : "skipped",
      completed_by: user.id,
      completed_at: new Date().toISOString(),
    })
    .eq("id", body.task_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Advance the schedule clock so the cron generates the next occurrence.
  if (done && task.schedule_id) {
    const service = createServiceClient() as any;
    await service
      .from("maintenance_schedules")
      .update({ last_done_on: new Date().toISOString().slice(0, 10) })
      .eq("id", task.schedule_id);
  }
  return NextResponse.json({ ok: true });
}
