import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { pushPriceLabsOverride } from "@/lib/integrations/pricelabs";

export const runtime = "nodejs";

const Body = z.object({
  property_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  price: z.number().positive(),
});

export async function POST(req: NextRequest) {
  // Auth: require an admin user (writes from the UI go through normal session)
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
  const { data: property } = await service
    .from("properties")
    .select("id, pricelabs_listing_id")
    .eq("id", body.property_id)
    .maybeSingle();

  if (!property?.pricelabs_listing_id) {
    return NextResponse.json(
      { error: "Property has no PriceLabs listing ID" },
      { status: 400 },
    );
  }

  try {
    await pushPriceLabsOverride(
      property.pricelabs_listing_id,
      body.date,
      body.price,
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "PriceLabs error" },
      { status: 502 },
    );
  }

  await service.from("prices").upsert(
    {
      property_id: body.property_id,
      date: body.date,
      override_price: body.price,
      synced_at: new Date().toISOString(),
    },
    { onConflict: "property_id,date" },
  );

  return NextResponse.json({ ok: true });
}
