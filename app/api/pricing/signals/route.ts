// GET /api/pricing/signals?property_id=&days=  — pricing signals for a property.
//
// Reads cached engine prices + booked reservations, assembles the day grid,
// and runs the pure signal engine. Read-only; any member may call it. The
// signals' `action` payloads map onto /api/pricing/override (set_price /
// discount) and /api/pricing/auto-toggle (raise_floor).

import { NextRequest, NextResponse } from "next/server";
import { format, addDays } from "date-fns";

import { createClient } from "@/lib/supabase/server";
import { buildDayStates } from "@/lib/revenue";
import { computeSignals } from "@/lib/pricing-signals";
import { forwardOccupancy } from "@/lib/kpi";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const propertyId = req.nextUrl.searchParams.get("property_id");
  if (!propertyId) {
    return NextResponse.json({ error: "property_id required" }, { status: 400 });
  }
  const days = Math.min(
    Math.max(Number(req.nextUrl.searchParams.get("days") ?? 90), 30),
    365,
  );

  const today = new Date();
  const from = today;
  const to = addDays(today, days);
  const fromStr = format(from, "yyyy-MM-dd");
  const toStr = format(to, "yyyy-MM-dd");

  const [{ data: prices }, { data: reservations }] = await Promise.all([
    supabase
      .from("prices")
      .select("date, base_price, suggested_price, override_price, currency")
      .eq("property_id", propertyId)
      .gte("date", fromStr)
      .lte("date", toStr)
      .order("date"),
    supabase
      .from("reservations")
      .select("check_in, check_out")
      .eq("property_id", propertyId)
      .gte("check_out", fromStr)
      .lte("check_in", toStr),
  ]);

  const dayStates = buildDayStates(prices ?? [], reservations ?? [], from, days);
  const occ = forwardOccupancy(reservations ?? [], from, Math.min(days, 30), 1);

  const signals = computeSignals({
    days: dayStates,
    forwardOccupancy: occ,
    today: fromStr,
  });

  return NextResponse.json({
    property_id: propertyId,
    forward_occupancy: occ,
    signals,
  });
}
