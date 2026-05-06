import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";

import { PasteForm } from "./_components/paste-form";

export const dynamic = "force-dynamic";

export default async function NewMessagePage() {
  const supabase = await createClient();
  const { data: properties } = await supabase
    .from("properties")
    .select("id, name")
    .eq("status", "active")
    .order("name");

  return (
    <div>
      <PageHeader
        title="Paste new message"
        description="Paste what the guest just sent on Airbnb. Claude drafts a reply in Donovan's voice."
      />
      <PasteForm properties={properties ?? []} />
    </div>
  );
}
