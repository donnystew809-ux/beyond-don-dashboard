"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Sun,
  CalendarDays,
  Building2,
  MessageSquare,
  MoreHorizontal,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/supabase/types";
import { setMobileDrawerOpen } from "@/lib/mobile-drawer-store";

type Tab = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

// Four primary tabs + a "More" overflow button.
// "More" opens the MoreSheet bottom-sheet (slides up from the bottom)
// via the shared mobile-drawer-store. The MoreSheet renders every
// non-primary nav item in a grid of tiles.
const TABS: Tab[] = [
  { href: "/today", label: "Today", icon: Sun },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/properties", label: "Properties", icon: Building2 },
  { href: "/messages", label: "Messages", icon: MessageSquare },
];

export function BottomNav({ role: _role }: { role: UserRole | null }) {
  const router = useRouter();
  const pathname = usePathname();

  // useTransition gives us `isPending` while Next.js is fetching/rendering
  // the new route. We use it to drive an "optimistic active" state on the
  // tab that was just tapped, so the user gets instant gold-accent
  // feedback even before the new page mounts.
  const [isPending, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  // Clear pending state once the real pathname catches up.
  useEffect(() => {
    if (!isPending) setPendingHref(null);
  }, [isPending, pathname]);

  function handleNav(href: string) {
    if (href === pathname) return;
    setPendingHref(href);
    startTransition(() => {
      router.push(href);
    });
  }

  function isActive(href: string) {
    // Show the tapped tab as active immediately (pendingHref), falling
    // back to the real pathname once navigation completes.
    const target = pendingHref ?? pathname;
    return target === href || target.startsWith(`${href}/`);
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-navy-700/40 bg-navy-900/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      aria-label="Primary navigation"
      // translateZ(0) forces its own compositing layer so iOS Safari
      // doesn't repaint it on every scroll frame.
      style={{ transform: "translateZ(0)" }}
    >
      <div className="grid grid-cols-5">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <button
              key={href}
              type="button"
              onClick={() => handleNav(href)}
              className={cn(
                "group relative flex flex-col items-center justify-center gap-1 py-2.5 transition-colors duration-150 active:scale-95 active:opacity-80",
                active
                  ? "text-gold-300"
                  : "text-cream-200/65 hover:text-cream-50",
              )}
              aria-current={active ? "page" : undefined}
              aria-label={label}
            >
              {active && (
                <span
                  aria-hidden
                  className="absolute inset-x-3 top-0 h-[2px] rounded-b bg-gold-500"
                />
              )}
              <Icon
                className={cn(
                  "h-5 w-5 transition-transform duration-150",
                  active && "scale-110",
                )}
              />
              <span
                className={cn(
                  "text-[10px] uppercase tracking-[0.12em]",
                  active && "font-semibold",
                )}
              >
                {label}
              </span>
            </button>
          );
        })}

        {/* More — opens the slide-out drawer with every nav item */}
        <button
          type="button"
          onClick={() => setMobileDrawerOpen(true)}
          className="group relative flex flex-col items-center justify-center gap-1 py-2.5 text-cream-200/65 transition-colors duration-150 hover:text-cream-50 active:scale-95 active:opacity-80"
          aria-label="More navigation options"
        >
          <MoreHorizontal className="h-5 w-5 transition-transform duration-150" />
          <span className="text-[10px] uppercase tracking-[0.12em]">
            More
          </span>
        </button>
      </div>
    </nav>
  );
}
