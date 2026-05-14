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
    <header className="flex h-14 items-center justify-between border-b border-navy-700/40 bg-navy-900/60 px-4 backdrop-blur-sm md:px-6">
      <div className="flex items-center gap-2">
        {/* Hamburger — visible on mobile only (bottom-nav More also opens drawer) */}
        <MobileMenuButton role={role} />

        <div className="text-sm text-cream-100">
          <span className="hidden text-cream-200/60 sm:inline">Signed in as </span>
          <span className="font-medium text-cream-50">
            <span className="hidden sm:inline">{email}</span>
            <span className="inline sm:hidden">{email.split("@")[0]}</span>
          </span>
          {role && (
            <span
              className={
                role === "admin"
                  ? "ml-2 rounded-full border border-gold-500/60 bg-gold-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-gold-300"
                  : "ml-2 rounded-full border border-navy-400/60 bg-navy-700/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-cream-200"
              }
            >
              {role}
            </span>
          )}
        </div>
      </div>

      <button
        onClick={handleSignOut}
        className="rounded-md border border-cream-200/30 px-3 py-2 text-xs font-medium uppercase tracking-wider text-cream-100 transition hover:border-gold-400 hover:bg-gold-500/10 hover:text-gold-200"
      >
        Sign out
      </button>
    </header>
  );
}
