import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { Sidebar } from "./_components/sidebar";
import { Header } from "./_components/header";
import { BottomNav } from "./_components/bottom-nav";
import { MoreSheet } from "./_components/more-sheet";
import { RouteProgress } from "./_components/route-progress";
import { MagneticFieldBackground } from "@/components/magnetic-field-background";
import { ConfirmHost } from "@/components/confirm-sheet";

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
    // App shell: fixed viewport height with `main` as THE scroll container.
    // The bottom nav + header can never move or jitter (even with iOS
    // Safari's collapsing URL bar), and content scrolls beneath them.
    <div className="relative flex h-dvh overflow-hidden">
      <RouteProgress />
      <MagneticFieldBackground tone="dark" transparent />
      <Sidebar role={role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header email={user.email ?? ""} role={role} />
        {/* Mobile bottom padding = nav height (~64px) + breathing room +
            device safe-area, so the last content is never covered at max
            scroll. Desktop has no bottom nav → normal padding. */}
        <main
          id="app-scroll"
          className="flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-6 md:px-6 md:pb-8 md:pt-8"
        >
          {children}
        </main>
      </div>
      <BottomNav role={role} />
      <MoreSheet role={role} />
      <ConfirmHost />
    </div>
  );
}
