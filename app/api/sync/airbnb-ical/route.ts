import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";
import { fetchAirbnbIcal } from "@/lib/integrations/airbnb-ical";
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

  const syncId = await recordSyncStart("airbnb-ical");
  const supabase = createServiceClient();

  try {
    const { data: properties } = await supabase
      .from("properties")
      .select("id, ical_url, airbnb_listing_id")
      .not("ical_url", "is", null);

    if (!properties || properties.length === 0) {
      await recordSyncFinish(syncId, { ok: true, records: 0 });
      return NextResponse.json({ records: 0, properties: 0 });
    }

    let totalRecords = 0;
    const errors: string[] = [];

    for (const property of properties) {
      if (!property.ical_url) continue;
      try {
        const events = await fetchAirbnbIcal(property.ical_url);
        if (events.length === 0) continue;

        const rows = events.map((e) => ({
          property_id: property.id,
          source: "airbnb" as const,
          guest_name: e.guest_name,
          check_in: e.check_in,
          check_out: e.check_out,
          gross_revenue: null,
          reservation_code: e.reservation_code,
          ical_uid: e.ical_uid,
          status: e.status,
          raw: e.raw,
          synced_at: new Date().toISOString(),
        }));

        const { error: upsertError } = await supabase
          .from("reservations")
          .upsert(rows, { onConflict: "property_id,ical_uid" });

        if (upsertError) {
          errors.push(`${property.id}: ${upsertError.message}`);
        } else {
          totalRecords += rows.length;
        }
      } catch (err) {
        errors.push(
          `${property.id}: ${err instanceof Error ? err.message : "unknown"}`,
        );
      }
    }

    if (errors.length > 0) {
      await recordSyncFinish(syncId, {
        ok: false,
        error: errors.join("; "),
      });
      return NextResponse.json(
        { records: totalRecords, errors },
        { status: 207 },
      );
    }

    await recordSyncFinish(syncId, { ok: true, records: totalRecords });
    return NextResponse.json({ records: totalRecords });
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
