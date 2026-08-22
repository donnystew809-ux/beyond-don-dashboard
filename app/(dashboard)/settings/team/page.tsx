import { redirect } from "next/navigation";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { homeForRole } from "@/lib/nav";
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
  if (roleRow?.role !== "admin") redirect(homeForRole(roleRow?.role ?? null));

  const service = createServiceClient() as any;
  const [{ data: properties }, { data: invites }, { data: profiles }, { data: authUsers }] =
    await Promise.all([
      service.from("properties").select("id, name").eq("status", "active").order("name"),
      service
        .from("invites")
        .select("id, email, role, property_ids, access_level, status, expires_at, accepted_at, created_at")
        .order("created_at", { ascending: false })
        .limit(100),
      service.from("user_profiles").select("user_id, phone"),
      service.auth.admin.listUsers({ page: 1, perPage: 200 }),
    ]);

  // Phone lives against the user id; invites are keyed by email. Join them here
  // so the admin sees a contact number next to each accepted invite.
  const phoneByUserId = new Map(
    ((profiles ?? []) as Array<{ user_id: string; phone: string | null }>).map((p) => [
      p.user_id,
      p.phone,
    ]),
  );
  const phoneByEmail = new Map<string, string>();
  for (const u of (authUsers?.users ?? []) as Array<{ id: string; email?: string }>) {
    const phone = u.email ? phoneByUserId.get(u.id) : null;
    if (u.email && phone) phoneByEmail.set(u.email.toLowerCase(), phone);
  }
  const invitesWithPhone = ((invites ?? []) as InviteRow[]).map((i) => ({
    ...i,
    phone: phoneByEmail.get(String(i.email).toLowerCase()) ?? null,
  }));

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Team & access"
        description="Invite cleaners, owners, or partners and scope them to specific properties. Invites are single-use and nothing is granted until accepted."
      />
      <InviteManager
        properties={(properties ?? []) as Array<{ id: string; name: string }>}
        initialInvites={invitesWithPhone}
      />
    </div>
  );
}

export type InviteRow = {
  id: string;
  email: string;
  /** Joined from user_profiles once the invite is accepted. */
  phone?: string | null;
  role: string;
  property_ids: string[];
  access_level: string;
  status: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
};
