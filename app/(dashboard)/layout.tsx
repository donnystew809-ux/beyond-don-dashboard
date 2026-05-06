import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { Sidebar } from "./_components/sidebar";
import { Header } from "./_components/header";
import { BlueprintBackground } from "@/components/blueprint-background";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  const role = roleRow?.role ?? null;

  return (
    <div className="relative flex min-h-screen">
      <BlueprintBackground />
      <Sidebar role={role} />
      <div className="flex flex-1 flex-col">
        <Header email={user.email ?? ""} role={role} />
        <main className="flex-1 overflow-y-auto px-4 py-6 md:px-6 md:py-8">{children}</main>
      </div>
    </div>
  );
}
