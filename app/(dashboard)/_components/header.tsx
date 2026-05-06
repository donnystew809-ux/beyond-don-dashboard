"use client";

import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import type { UserRole } from "@/lib/supabase/types";

import { MobileMenuButton } from "./mobile-nav";

export function Header({
  email,
  role,
}: {
  email: string;
  role: UserRole | null;
}) {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-cream-200 bg-cream-50 px-4 md:px-6">
      <div className="flex items-center gap-2">
        {/* Hamburger — visible on mobile only */}
        <MobileMenuButton role={role} />

        <div className="text-sm text-navy-700">
          <span className="hidden text-navy-500 sm:inline">Signed in as </span>
          <span className="font-medium text-navy-900">
            <span className="hidden sm:inline">{email}</span>
            <span className="inline sm:hidden">{email.split("@")[0]}</span>
          </span>
          {role && (
            <span
              className={
                role === "admin"
                  ? "ml-2 rounded-full border border-gold-500 bg-gold-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-gold-700"
                  : "ml-2 rounded-full border border-navy-200 bg-navy-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-navy-700"
              }
            >
              {role}
            </span>
          )}
        </div>
      </div>

      <button
        onClick={handleSignOut}
        className="rounded-md border border-navy-200 px-3 py-2 text-xs font-medium uppercase tracking-wider text-navy-700 transition hover:border-navy-700 hover:bg-navy-700 hover:text-cream-50"
      >
        Sign out
      </button>
    </header>
  );
}
