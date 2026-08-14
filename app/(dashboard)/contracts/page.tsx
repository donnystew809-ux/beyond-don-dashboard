import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { dropboxSignConfigured } from "@/lib/integrations/dropbox-sign";
import { homeForRole } from "@/lib/nav";
import { PageHeader } from "@/components/page-header";
import { GlassCard } from "@/components/glass-card";

import { ContractSender } from "./_components/contract-sender";

export const dynamic = "force-dynamic";

export default async function ContractsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (roleRow?.role !== "admin") redirect(homeForRole(roleRow?.role ?? null));

  const db = supabase as any;
  const [{ data: contracts }, { data: properties }] = await Promise.all([
    db
      .from("contracts")
      .select("id, title, signer_name, signer_email, status, sent_at, completed_at, created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("properties").select("id, name").order("name"),
  ]);

  const configured = dropboxSignConfigured();

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Contracts"
        description="Send the management agreement for e-signature and track it to a stored, signed PDF."
      />

      {!configured && (
        <GlassCard tone="amber" className="mb-6 p-4 text-sm text-cream-100">
          <strong className="text-amber-300">Setup needed:</strong> add
          <code className="mx-1">DROPBOX_SIGN_API_KEY</code> in Vercel (a
          Dropbox Sign account — Essentials plan — provides it) and upload the
          agreement template to Storage at
          <code className="mx-1">contracts/templates/management-agreement.pdf</code>.
          Sending is disabled until then; everything else is ready.
        </GlassCard>
      )}

      <ContractSender
        disabled={!configured}
        properties={(properties ?? []) as Array<{ id: string; name: string }>}
        contracts={(contracts ?? []) as ContractRow[]}
      />
    </div>
  );
}

export type ContractRow = {
  id: string;
  title: string;
  signer_name: string;
  signer_email: string;
  status: string;
  sent_at: string | null;
  completed_at: string | null;
  created_at: string;
};
