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
    <header className="flex h-14 items-center justify-between border-b border-neutral-200 bg-white px-6">
      <div className="text-sm text-neutral-600">
        Signed in as <span className="font-medium text-neutral-900">{email}</span>
        {role && (
          <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs uppercase tracking-wide text-neutral-600">
            {role}
          </span>
        )}
      </div>
      <button
        onClick={handleSignOut}
        className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-100"
      >
        Sign out
      </button>
    </header>
  );
}
