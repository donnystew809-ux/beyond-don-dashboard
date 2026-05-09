import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";

import { ChangePasswordForm } from "./_components/change-password-form";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Account"
        description={user?.email ?? "Manage your account."}
      />

      <section>
        <h2 className="mb-3 text-sm font-semibold">Change password</h2>
        <ChangePasswordForm />
      </section>
    </div>
  );
}
