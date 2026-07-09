import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { PageHeader } from "@/components/page-header";

import { PropertyForm } from "../_components/property-form";
import { ProfileForm, type ProfileInitial } from "../_components/profile-form";

export const dynamic = "force-dynamic";

export default async function EditPropertyPage(
  props: PageProps<"/settings/properties/[id]">,
) {
  const { id } = await props.params;
  const supabase = await createClient();

  const [{ data: property }, { data: profile }] = await Promise.all([
    supabase
      .from("properties")
      .select(
        "id, name, nickname, address, airbnb_listing_id, ical_url, pricelabs_listing_id, turno_property_id, owner_name, owner_email, status",
      )
      .eq("id", id)
      .maybeSingle(),
    (supabase as any)
      .from("property_profiles")
      .select("access_info, house_rules_md, quirks_md, host_preferences_md, cleaning_notes_md")
      .eq("property_id", id)
      .maybeSingle(),
  ]);

  if (!property) notFound();

  return (
    <div className="max-w-2xl">
      <PageHeader title={`Edit · ${property.name}`} />
      <PropertyForm property={property} />
      <ProfileForm propertyId={property.id} initial={profile as ProfileInitial} />
    </div>
  );
}
