import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

import { SecurityPanel } from "./_components/security-panel";

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Sign-in & security"
        description="Set a PIN so this device unlocks without an email round-trip, and turn on Face ID or fingerprint if your device supports it."
      />
      <SecurityPanel email={user.email ?? ""} />
    </div>
  );
}
