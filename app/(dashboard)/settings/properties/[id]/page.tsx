import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { PageHeader } from "@/components/page-header";

import { PropertyForm } from "../_components/property-form";
import { ProfileForm, type ProfileInitial } from "../_components/profile-form";
import {
  OpsEditor,
  type TemplateInitial,
  type InventoryInitial,
  type ScheduleInitial,
} from "../_components/ops-editor";

export const dynamic = "force-dynamic";

export default async function EditPropertyPage(
  props: PageProps<"/settings/properties/[id]">,
) {
  const { id } = await props.params;
  const supabase = await createClient();
  const db = supabase as any; // ops tables predate generated types

  const [
    { data: property },
    { data: profile },
    { data: template },
    { data: inventory },
    { data: schedules },
  ] = await Promise.all([
    supabase
      .from("properties")
      .select(
        "id, name, nickname, address, airbnb_listing_id, ical_url, pricelabs_listing_id, turno_property_id, owner_name, owner_email, status",
      )
      .eq("id", id)
      .maybeSingle(),
    db
      .from("property_profiles")
      .select("access_info, house_rules_md, quirks_md, host_preferences_md, cleaning_notes_md")
      .eq("property_id", id)
      .maybeSingle(),
    db.from("checklist_templates").select("title, items").eq("property_id", id).maybeSingle(),
    db
      .from("inventory_items")
      .select("id, name, unit, par_level, current_qty")
      .eq("property_id", id)
      .order("name"),
    db
      .from("maintenance_schedules")
      .select("id, title, cadence_days, last_done_on, active")
      .eq("property_id", id)
      .order("title"),
  ]);

  if (!property) notFound();

  return (
    <div className="max-w-2xl">
      <PageHeader title={`Edit · ${property.name}`} />
      <PropertyForm property={property} />
      <ProfileForm propertyId={property.id} initial={profile as ProfileInitial} />
      <OpsEditor
        propertyId={property.id}
        template={(template ?? null) as TemplateInitial}
        inventory={(inventory ?? []) as InventoryInitial}
        schedules={(schedules ?? []) as ScheduleInitial}
      />
    </div>
  );
}
