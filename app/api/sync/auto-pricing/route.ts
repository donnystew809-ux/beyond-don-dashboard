// Daily cron: for every property with auto_accept_pricing=true, push the
// PriceLabs suggested prices for the next N days as overrides.
// Guardrails (deviation %, min/max price) are enforced inside applySuggestedPrices.

import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";
import { applySuggestedPrices } from "@/lib/pricing";
import {
  isAuthorizedSync,
  recordSyncFinish,
  recordSyncStart,
} from "@/lib/sync";

export const runtime = "nodejs";
export const maxDuration = 300;

async function handle(req: NextRequest) {
  if (!isAuthorizedSync(req)) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const syncId = await recordSyncStart("auto-pricing");
  const service = createServiceClient();

  try {
    const { data: properties, error } = await service
      .from("properties")
      .select(
        "id, name, pricelabs_listing_id, auto_accept_pricing, auto_accept_max_deviation_pct, auto_accept_horizon_days, auto_accept_min_price, auto_accept_max_price",
      )
      .eq("auto_accept_pricing", true)
      .not("pricelabs_listing_id", "is", null)
      .eq("status", "active");

    if (error) throw error;

    if (!properties || properties.length === 0) {
      await recordSyncFinish(syncId, { ok: true, records: 0 });
      return NextResponse.json({ records: 0, properties: 0 });
    }

    const today = new Date();
    const startDate = today.toISOString().slice(0, 10);

    const summaries = [];
    let totalPushed = 0;
    for (const p of properties) {
      const days = (p as { auto_accept_horizon_days?: number }).auto_accept_horizon_days ?? 30;
      const end = new Date(today);
      end.setDate(end.getDate() + days);
      const endDate = end.toISOString().slice(0, 10);

      try {
        const result = await applySuggestedPrices({
          service,
          property: p as Parameters<typeof applySuggestedPrices>[0]["property"],
          startDate,
          endDate,
          source: "auto_cron",
        });
        totalPushed += result.pushed;
        summaries.push({
          property: result.property_name,
          pushed: result.pushed,
          skipped: result.skipped,
          errors: result.errors,
        });
      } catch (err) {
        summaries.push({
          property: (p as { name: string }).name,
          pushed: 0,
          skipped: 0,
          errors: [err instanceof Error ? err.message : "unknown error"],
        });
      }
    }

    await recordSyncFinish(syncId, { ok: true, records: totalPushed });
    return NextResponse.json({
      properties: properties.length,
      records: totalPushed,
      summaries,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    await recordSyncFinish(syncId, { ok: false, error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
