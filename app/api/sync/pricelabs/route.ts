import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";
import { fetchPriceLabsDays } from "@/lib/integrations/pricelabs";
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

  const syncId = await recordSyncStart("pricelabs");
  const supabase = createServiceClient();

  try {
    const { data: properties } = await supabase
      .from("properties")
      .select("id, pricelabs_listing_id, airbnb_listing_id, ical_url")
      .not("pricelabs_listing_id", "is", null);

    if (!properties || properties.length === 0) {
      await recordSyncFinish(syncId, { ok: true, records: 0 });
      return NextResponse.json({ records: 0 });
    }

    // Build the batch payload — PriceLabs accepts up to many listings in one call
    const batch = properties
      .filter((p) => p.pricelabs_listing_id)
      .map((p) => ({
        id: p.pricelabs_listing_id as string,
        pms: "airbnb" as const,
      }));

    const daysByListing = await fetchPriceLabsDays(batch);

    let priceRows = 0;
    let reservationRows = 0;
    const now = new Date().toISOString();

    for (const property of properties) {
      const listingId = property.pricelabs_listing_id;
      if (!listingId) continue;
      const days = daysByListing.get(listingId);
      if (!days || days.length === 0) continue;

      // 1) Upsert price rows
      const prices = days.map((d) => ({
        property_id: property.id,
        date: d.date,
        base_price: d.base_price,
        suggested_price: d.suggested_price,
        override_price: d.override_price,
        currency: d.currency,
        source: "pricelabs",
        synced_at: now,
      }));

      const { error: priceErr } = await supabase
        .from("prices")
        .upsert(prices, { onConflict: "property_id,date" });
      if (!priceErr) priceRows += prices.length;

      // 2) Derive reservation rows from booking_status runs.
      // PriceLabs returns one row per day; we collapse consecutive booked days
      // into a single reservation. "checkin" marks the first night.
      const blocks = collapseReservations(days);

      // Occupancy source of truth: when a property has an Airbnb iCal feed,
      // that feed is the ONLY source we trust for reservations. PriceLabs
      // reports per-day booked/free and cannot distinguish a real guest
      // booking from a host calendar block — everything unavailable reads as
      // "booked". The iCal feed CAN tell them apart ("Reserved" + confirmation
      // code vs "Airbnb (Not available)"). Deriving reservations from both
      // double-counted every stay and turned host blocks into phantom guests.
      // Properties with no iCal connected still fall back to PriceLabs so they
      // are not left with an empty calendar.
      if (property.ical_url) continue;

      if (blocks.length > 0) {

        const reservations = blocks.map((b) => ({
          property_id: property.id,
          source: "airbnb" as const,
          guest_name: null,
          check_in: b.check_in,
          check_out: b.check_out,
          gross_revenue: b.adr * (daysBetween(b.check_in, b.check_out) || 0) || null,
          reservation_code: null,
          ical_uid: `pl:${property.id}:${b.check_in}`,
          status: "booked",
          raw: { source: "pricelabs", adr: b.adr },
          synced_at: now,
        }));

        const { error: resErr } = await supabase
          .from("reservations")
          .upsert(reservations, { onConflict: "property_id,ical_uid" });
        if (!resErr) reservationRows += reservations.length;
      }
    }

    await recordSyncFinish(syncId, {
      ok: true,
      records: priceRows + reservationRows,
    });
    return NextResponse.json({
      prices: priceRows,
      reservations: reservationRows,
    });
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

function daysBetween(a: string, b: string) {
  return Math.round(
    (new Date(b).getTime() - new Date(a).getTime()) / 86400000,
  );
}

type Block = { check_in: string; check_out: string; adr: number };

function collapseReservations(
  days: Array<{ date: string; booking_status: "free" | "booked" | "checkin"; adr: number | null }>,
): Block[] {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const blocks: Block[] = [];
  let current: { start: string; lastDate: string; adr: number | null } | null = null;

  for (const d of sorted) {
    const isOccupied = d.booking_status !== "free";
    if (isOccupied) {
      if (!current) {
        current = { start: d.date, lastDate: d.date, adr: d.adr };
      } else {
        current.lastDate = d.date;
        if (current.adr == null && d.adr != null) current.adr = d.adr;
      }
    } else if (current) {
      blocks.push({
        check_in: current.start,
        check_out: d.date, // Airbnb checkout = day after last booked night
        adr: current.adr ?? 0,
      });
      current = null;
    }
  }
  if (current) {
    // Trailing block — close at lastDate + 1
    const next = new Date(current.lastDate);
    next.setUTCDate(next.getUTCDate() + 1);
    blocks.push({
      check_in: current.start,
      check_out: next.toISOString().slice(0, 10),
      adr: current.adr ?? 0,
    });
  }
  return blocks;
}

export const GET = handle;
export const POST = handle;
