import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { analyzeListing } from "@/lib/integrations/anthropic";

export const runtime = "nodejs";
// Listing analysis takes ~30–60s with adaptive thinking
export const maxDuration = 300;

const Body = z.object({
  property_id: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  // Auth: admin only — this costs money
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
  const { data: property, error: propErr } = await service
    .from("properties")
    .select("*")
    .eq("id", body.property_id)
    .maybeSingle();
  if (propErr || !property) {
    return NextResponse.json(
      { error: propErr?.message ?? "property not found" },
      { status: 404 },
    );
  }

  const [{ data: reservations }, { data: prices }] = await Promise.all([
    service
      .from("reservations")
      .select("check_in, check_out, gross_revenue, source")
      .eq("property_id", body.property_id)
      .order("check_in", { ascending: false })
      .limit(50),
    service
      .from("prices")
      .select("date, suggested_price, base_price, override_price")
      .eq("property_id", body.property_id)
      .gte("date", new Date().toISOString().slice(0, 10))
      .order("date")
      .limit(60),
  ]);

  // We don't store booking_status separately yet — derive a stub from reservations.
  const bookedDates = new Set<string>();
  for (const r of reservations ?? []) {
    const start = new Date(r.check_in);
    const end = new Date(r.check_out);
    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
      bookedDates.add(d.toISOString().slice(0, 10));
    }
  }
  const pricesWithStatus = (prices ?? []).map((p) => ({
    date: p.date,
    suggested_price: p.suggested_price,
    base_price: p.base_price,
    booking_status: bookedDates.has(p.date)
      ? ("booked" as const)
      : ("free" as const),
  }));

  try {
    const { analysis, usage, cost_usd } = await analyzeListing({
      property: {
        name: property.name,
        nickname: property.nickname,
        address: property.address,
        bedrooms: null, // Not stored on properties table yet
        base_price: prices?.[0]?.base_price ?? null,
      },
      reservations: (reservations ?? []).map((r) => ({
        check_in: r.check_in,
        check_out: r.check_out,
        gross_revenue: Number(r.gross_revenue),
        source: r.source,
      })),
      prices: pricesWithStatus,
    });

    const { data: row, error: insertErr } = await service
      .from("optimizations")
      .insert({
        property_id: body.property_id,
        generated_by: user.id,
        model: "claude-opus-4-7",
        positioning: analysis.positioning,
        titles: analysis.titles,
        description: analysis.description,
        amenity_gaps: analysis.amenity_gaps,
        pricing_notes: { text: analysis.pricing_notes },
        raw: analysis,
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cost_usd,
      })
      .select("id")
      .single();

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({ id: row.id, cost_usd, usage });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "analysis failed" },
      { status: 500 },
    );
  }
}
