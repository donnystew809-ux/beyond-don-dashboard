"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sun,
  CalendarDays,
  Building2,
  MessageSquare,
  MoreHorizontal,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/supabase/types";

type Tab = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

// Four primary tabs + a "More" overflow button.
// "More" dispatches the bd-open-drawer event so MobileMenuButton's
// drawer (which has every nav item including admin-only) slides open.
const TABS: Tab[] = [
  { href: "/today", label: "Today", icon: Sun },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/properties", label: "Properties", icon: Building2 },
  { href: "/messages", label: "Messages", icon: MessageSquare },
];

export function BottomNav({ role: _role }: { role: UserRole | null }) {
  const pathname = usePathname();

  function openDrawer() {
    window.dispatchEvent(new Event("bd-open-drawer"));
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-navy-700/40 bg-navy-900/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      aria-label="Primary navigation"
    >
      <div className="grid grid-cols-5">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "group relative flex flex-col items-center justify-center gap-1 py-2.5 transition-colors active:scale-95",
                active
                  ? "text-gold-300"
                  : "text-cream-200/65 hover:text-cream-50",
              )}
              aria-current={active ? "page" : undefined}
            >
              {active && (
                <span
                  aria-hidden
                  className="absolute inset-x-3 top-0 h-[2px] rounded-b bg-gold-500"
                />
              )}
              <Icon
                className={cn(
                  "h-5 w-5 transition-transform",
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
            </Link>
          );
        })}

        {/* More — opens the slide-out drawer with every nav item */}
        <button
          type="button"
          onClick={openDrawer}
          className="group relative flex flex-col items-center justify-center gap-1 py-2.5 text-cream-200/65 transition-colors hover:text-cream-50 active:scale-95"
          aria-label="More navigation options"
        >
          <MoreHorizontal className="h-5 w-5 transition-transform" />
          <span className="text-[10px] uppercase tracking-[0.12em]">
            More
          </span>
        </button>
      </div>
    </nav>
  );
}
