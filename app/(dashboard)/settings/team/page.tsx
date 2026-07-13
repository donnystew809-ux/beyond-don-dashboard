import { redirect } from "next/navigation";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";

import { InviteManager } from "./_components/invite-manager";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
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
  if (roleRow?.role !== "admin") redirect("/today");

  const service = createServiceClient() as any;
  const [{ data: properties }, { data: invites }] = await Promise.all([
    service.from("properties").select("id, name").eq("status", "active").order("name"),
    service
      .from("invites")
      .select("id, email, role, property_ids, access_level, status, expires_at, accepted_at, created_at")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Team & access"
        description="Invite cleaners, owners, or partners and scope them to specific properties. Invites are single-use and nothing is granted until accepted."
      />
      <InviteManager
        properties={(properties ?? []) as Array<{ id: string; name: string }>}
        initialInvites={(invites ?? []) as InviteRow[]}
      />
    </div>
  );
}

export type InviteRow = {
  id: string;
  email: string;
  role: string;
  property_ids: string[];
  access_level: string;
  status: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
};
