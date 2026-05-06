// Toggle auto-accept pricing on/off for a property + adjust guardrails.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createClient, createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const Body = z.object({
  property_id: z.string().uuid(),
  auto_accept_pricing: z.boolean().optional(),
  auto_accept_max_deviation_pct: z.number().int().min(5).max(100).optional(),
  auto_accept_horizon_days: z.number().int().min(7).max(180).optional(),
  auto_accept_min_price: z.number().nullable().optional(),
  auto_accept_max_price: z.number().nullable().optional(),
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
  type PropUpdate = {
    auto_accept_pricing?: boolean;
    auto_accept_max_deviation_pct?: number;
    auto_accept_horizon_days?: number;
    auto_accept_min_price?: number | null;
    auto_accept_max_price?: number | null;
  };
  const update: PropUpdate = {};
  if (body.auto_accept_pricing !== undefined)
    update.auto_accept_pricing = body.auto_accept_pricing;
  if (body.auto_accept_max_deviation_pct !== undefined)
    update.auto_accept_max_deviation_pct = body.auto_accept_max_deviation_pct;
  if (body.auto_accept_horizon_days !== undefined)
    update.auto_accept_horizon_days = body.auto_accept_horizon_days;
  if (body.auto_accept_min_price !== undefined)
    update.auto_accept_min_price = body.auto_accept_min_price;
  if (body.auto_accept_max_price !== undefined)
    update.auto_accept_max_price = body.auto_accept_max_price;

  const { data, error } = await service
    .from("properties")
    .update(update)
    .eq("id", body.property_id)
    .select(
      "id, name, auto_accept_pricing, auto_accept_max_deviation_pct, auto_accept_horizon_days, auto_accept_min_price, auto_accept_max_price",
    )
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
