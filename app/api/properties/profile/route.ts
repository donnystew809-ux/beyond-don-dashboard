// POST /api/properties/profile — upsert a property's operational profile.
// Admin-only. The profile feeds the guest-message drafter (right facts to
// the right guest) and, in Phase 3, the cleaner-facing property view.

import { NextResponse } from "next/server";

import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (roleRow?.role !== "admin") {
    return NextResponse.json({ error: "admin only" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.property_id) {
    return NextResponse.json({ error: "property_id required" }, { status: 400 });
  }

  const service = createServiceClient() as any;
  const { error } = await service.from("property_profiles").upsert(
    {
      property_id: body.property_id,
      access_info: body.access_info ?? {},
      house_rules_md: body.house_rules_md ?? null,
      quirks_md: body.quirks_md ?? null,
      host_preferences_md: body.host_preferences_md ?? null,
      cleaning_notes_md: body.cleaning_notes_md ?? null,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "property_id" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
