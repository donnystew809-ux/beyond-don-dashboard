import { NextRequest, NextResponse } from "next/server";
import { addDays } from "date-fns";

import { createServiceClient } from "@/lib/supabase/server";
import { fetchTurnoCleanings } from "@/lib/integrations/turno";
import {
  isAuthorizedSync,
  recordSyncFinish,
  recordSyncStart,
} from "@/lib/sync";

export const runtime = "nodejs";

async function handle(req: NextRequest) {
  if (!isAuthorizedSync(req)) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const syncId = await recordSyncStart("turno");
  const supabase = createServiceClient();

  try {
    const { data: properties } = await supabase
      .from("properties")
      .select("id, turno_property_id")
      .not("turno_property_id", "is", null);

    const now = new Date();
    const from = addDays(now, -7).toISOString();
    const to = addDays(now, 60).toISOString();

    const cleanings = await fetchTurnoCleanings(from, to);

    // Map by Turno's external property id back to ours.
    const externalToInternal = new Map<string, string>();
    for (const p of properties ?? []) {
      if (p.turno_property_id) {
        externalToInternal.set(p.turno_property_id, p.id);
      }
    }

    const rows = cleanings
      .map((c) => {
        const propertyId =
          c.property_external_id &&
          externalToInternal.get(c.property_external_id);
        if (!propertyId) return null;
        return {
          property_id: propertyId,
          turno_project_id: c.turno_project_id,
          scheduled_for: c.scheduled_for,
          cleaner_name: c.cleaner_name,
          status: c.status,
          notes: c.notes,
          synced_at: new Date().toISOString(),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (rows.length === 0) {
      await recordSyncFinish(syncId, { ok: true, records: 0 });
      return NextResponse.json({ records: 0 });
    }

    const { error: upsertError } = await supabase
      .from("cleanings")
      .upsert(rows, { onConflict: "turno_project_id" });

    if (upsertError) {
      await recordSyncFinish(syncId, {
        ok: false,
        error: upsertError.message,
      });
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    await recordSyncFinish(syncId, { ok: true, records: rows.length });
    return NextResponse.json({ records: rows.length });
  } catch (err) {
    await recordSyncFinish(syncId, {
      ok: false,
      error: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
