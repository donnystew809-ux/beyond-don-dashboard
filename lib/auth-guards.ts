// Server-side page guards. Nav hides links by role, but pages are always
// reachable by URL — these enforce it, redirecting to the visitor's own
// home (never a dead-end outside their nav).

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { homeForRole } from "@/lib/nav";
import type { UserRole } from "@/lib/supabase/types";

async function currentRole(): Promise<UserRole | null> {
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
  return (roleRow?.role as UserRole | undefined) ?? null;
}

/** Allow admin/operator; others land on their own home. Returns the role. */
export async function requireStaff(): Promise<UserRole> {
  const role = await currentRole();
  if (role !== "admin" && role !== "operator") redirect(homeForRole(role));
  return role;
}

/** Allow admin only; others land on their own home. */
export async function requireAdmin(): Promise<"admin"> {
  const role = await currentRole();
  if (role !== "admin") redirect(homeForRole(role));
  return role;
}
