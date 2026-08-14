// GET/POST /api/cron/daily-ops — daily operations housekeeping (09:40 UTC).
//
//   1. Materialize maintenance tasks: for each active schedule with no open
//      task, create one due (last_done_on + cadence_days), or today if never
//      done. The partial unique index (one pending task per schedule) makes
//      this idempotent.
//   2. Overdue alert: pending tasks past due → notification (once per day is
//      fine; dedupe by skipping if an undismissed notification exists).

import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";
import { isAuthorizedSync, recordSyncStart, recordSyncFinish } from "@/lib/sync";

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  return run(req);
}
export async function POST(req: NextRequest) {
  return run(req);
}

async function run(req: NextRequest) {
  if (!isAuthorizedSync(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = createServiceClient() as any;
  const syncId = await recordSyncStart("daily-ops");
  const today = new Date().toISOString().slice(0, 10);
  let created = 0;
  let overdueAlerts = 0;

  try {
    // ── 1. Materialize due tasks ────────────────────────────────────────
    const { data: schedules } = await db
      .from("maintenance_schedules")
      .select("id, property_id, title, cadence_days, last_done_on")
      .eq("active", true);

    for (const s of schedules ?? []) {
      const { data: open } = await db
        .from("maintenance_tasks")
        .select("id")
        .eq("schedule_id", s.id)
        .eq("status", "pending")
        .limit(1);
      if (open?.length) continue;

      const dueOn = s.last_done_on
        ? addDays(s.last_done_on, s.cadence_days)
        : today;
      const { error } = await db.from("maintenance_tasks").insert({
        schedule_id: s.id,
        property_id: s.property_id,
        title: s.title,
        due_on: dueOn,
      });
      if (!error) created++;
    }

    // ── 2. Overdue alerts ───────────────────────────────────────────────
    const { data: overdue } = await db
      .from("maintenance_tasks")
      .select("id, property_id, title, due_on")
      .eq("status", "pending")
      .lt("due_on", today);

    for (const t of overdue ?? []) {
      const { data: existing } = await db
        .from("notification_events")
        .select("id")
        .eq("type", "maintenance_due")
        .eq("ref_id", t.id)
        .neq("status", "dismissed")
        .limit(1);
      if (existing?.length) continue;
      await db.from("notification_events").insert({
        type: "maintenance_due",
        property_id: t.property_id,
        ref_id: t.id,
        title: `Overdue: ${t.title}`,
        body: `Due ${t.due_on} and still open.`,
        severity: "warning",
      });
      overdueAlerts++;
    }

    await recordSyncFinish(syncId, { ok: true, records: created + overdueAlerts });
    return NextResponse.json({ ok: true, tasks_created: created, overdue_alerts: overdueAlerts });
  } catch (err) {
    await recordSyncFinish(syncId, {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ ok: false, error: "daily-ops failed" }, { status: 500 });
  }
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
