"use client";

import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import type { UserRole } from "@/lib/supabase/types";

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
    <header className="flex h-14 items-center justify-between border-b border-cream-200 bg-cream-50 px-6">
      <div className="text-sm text-navy-700">
        <span className="text-navy-500">Signed in as</span>{" "}
        <span className="font-medium text-navy-900">{email}</span>
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
      <button
        onClick={handleSignOut}
        className="rounded-md border border-navy-200 px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-navy-700 transition hover:border-navy-700 hover:bg-navy-700 hover:text-cream-50"
      >
        Sign out
      </button>
    </header>
  );
}
