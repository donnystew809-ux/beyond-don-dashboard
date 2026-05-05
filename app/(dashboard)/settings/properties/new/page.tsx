import { PageHeader } from "@/components/page-header";

import { PropertyForm } from "../_components/property-form";

export default function NewPropertyPage() {
  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Add property"
        description="Connect an Airbnb listing's iCal feed and (optionally) its PriceLabs and Turno IDs."
      />
      <PropertyForm />
    </div>
  );
}
