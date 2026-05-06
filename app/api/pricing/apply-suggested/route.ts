// Manual one-click "apply suggested prices for next N days" endpoint.
// Admin only — this writes to PriceLabs (which propagates to Airbnb).

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { applySuggestedPrices } from "@/lib/pricing";

export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.object({
  property_id: z.string().uuid(),
  days: z.number().int().min(1).max(180).default(30),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("unauthorized", { status: 401 });
  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (roleRow?.role !== "admin") {
    return new NextResponse("forbidden", { status: 403 });
  }

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "bad request" },
      { status: 400 },
    );
  }

  const service = createServiceClient();
  const { data: property, error: pErr } = await service
    .from("properties")
    .select(
      "id, name, pricelabs_listing_id, auto_accept_max_deviation_pct, auto_accept_min_price, auto_accept_max_price",
    )
    .eq("id", body.property_id)
    .maybeSingle();
  if (pErr || !property) {
    return NextResponse.json(
      { error: pErr?.message ?? "property not found" },
      { status: 404 },
    );
  }

  const today = new Date();
  const startDate = today.toISOString().slice(0, 10);
  const end = new Date(today);
  end.setDate(end.getDate() + body.days);
  const endDate = end.toISOString().slice(0, 10);

  const result = await applySuggestedPrices({
    service,
    property: property as Parameters<typeof applySuggestedPrices>[0]["property"],
    startDate,
    endDate,
    source: "manual",
    userId: user.id,
  });

  return NextResponse.json(result);
}
