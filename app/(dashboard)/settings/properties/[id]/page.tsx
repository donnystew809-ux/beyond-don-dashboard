import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { PageHeader } from "@/components/page-header";

import { PropertyForm } from "../_components/property-form";

export const dynamic = "force-dynamic";

export default async function EditPropertyPage(
  props: PageProps<"/settings/properties/[id]">,
) {
  const { id } = await props.params;
  const supabase = await createClient();

  const { data: property } = await supabase
    .from("properties")
    .select(
      "id, name, nickname, address, airbnb_listing_id, ical_url, pricelabs_listing_id, turno_property_id, owner_name, owner_email, status",
    )
    .eq("id", id)
    .maybeSingle();

  if (!property) notFound();

  return (
    <div className="max-w-2xl">
      <PageHeader title={`Edit · ${property.name}`} />
      <PropertyForm property={property} />
    </div>
  );
}
