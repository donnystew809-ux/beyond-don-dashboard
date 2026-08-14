import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { Sidebar } from "./_components/sidebar";
import { Header } from "./_components/header";
import { BottomNav } from "./_components/bottom-nav";
import { MoreSheet } from "./_components/more-sheet";
import { RouteProgress } from "./_components/route-progress";
import { MagneticFieldBackground } from "@/components/magnetic-field-background";

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
    <div className="relative flex min-h-dvh">
      <RouteProgress />
      <MagneticFieldBackground tone="dark" transparent />
      <Sidebar role={role} />
      <div className="flex flex-1 flex-col">
        <Header email={user.email ?? ""} role={role} />
        {/* Bottom padding on mobile leaves room for BottomNav (h ~64px + safe-area) */}
        <main className="flex-1 overflow-y-auto px-4 pb-24 pt-6 md:px-6 md:pb-8 md:pt-8">
          {children}
        </main>
      </div>
      <BottomNav role={role} />
      <MoreSheet role={role} />
    </div>
  );
}
