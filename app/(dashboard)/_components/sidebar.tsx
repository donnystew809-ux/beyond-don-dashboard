"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/supabase/types";
import { navForRole } from "@/lib/nav";

import { BrandMark } from "@/components/brand-mark";

export function Sidebar({ role }: { role: UserRole | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const items = navForRole(role);

  // Optimistic active state: highlight the clicked item immediately while
  // the server-rendered destination is in flight (same pattern as BottomNav)
  // — the click always visibly "lands" even before navigation completes.
  const [isPending, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  useEffect(() => {
    if (!isPending) setPendingHref(null);
  }, [isPending, pathname]);

  function handleNav(e: React.MouseEvent, href: string) {
    // Let modified clicks (new tab etc.) behave like normal links.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    if (href === pathname) return;
    setPendingHref(href);
    startTransition(() => router.push(href));
  }

  return (
    <aside className="hidden w-60 shrink-0 bg-navy-gradient text-cream-100 md:flex md:flex-col">
      <Link href="/" className="flex items-center gap-3 px-5 py-6">
        <BrandMark tone="light" size="md" showWordmark />
      </Link>

      <div className="mx-5 mb-4 h-px bg-gold-500/40" />

      <nav className="flex-1 space-y-1 px-3">
        {items.map(({ href, label, icon: Icon }) => {
          // Optimistic: the just-clicked item lights up instantly.
          const target = pendingHref ?? pathname;
          const isActive =
            href === "/"
              ? target === "/"
              : target === href || target.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              onClick={(e) => handleNav(e, href)}
              className={cn(
                "group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition active:scale-[0.98]",
                isActive
                  ? "bg-navy-950/60 text-cream-50"
                  : "text-cream-100/70 hover:bg-navy-950/30 hover:text-cream-50",
              )}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-gold-500" />
              )}
              <Icon className={cn(
                "h-4 w-4",
                isActive ? "text-gold-400" : "text-cream-100/60 group-hover:text-gold-300",
              )} />
              <span className={cn(isActive && "font-medium")}>{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-navy-700/60 px-5 py-4">
        <p className="text-[10px] uppercase tracking-[0.22em] text-cream-100/40">
          Beyond Don, LLC
        </p>
        <p className="mt-1 text-[10px] text-cream-100/40">
          Maximize Your Property&apos;s Potential.
        </p>
      </div>
    </aside>
  );
}
