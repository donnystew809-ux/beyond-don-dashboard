"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  X,
  Home,
  Bell,
  Zap,
  DollarSign,
  Sparkles,
  Receipt,
  Wand2,
  KeyRound,
  Settings,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/supabase/types";
import { useMobileDrawer } from "@/lib/mobile-drawer-store";

type SheetItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
};

// Non-primary nav — everything the BottomNav's 4 tabs don't surface.
// BottomNav covers: Today, Calendar, Properties, Messages.
const SHEET_ITEMS: SheetItem[] = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/suggestions", label: "Suggestions", icon: Zap, adminOnly: true },
  { href: "/pricing", label: "Pricing", icon: DollarSign, adminOnly: true },
  { href: "/cleaning", label: "Cleaning", icon: Sparkles },
  { href: "/expenses", label: "Expenses", icon: Receipt, adminOnly: true },
  { href: "/optimizer", label: "Optimizer", icon: Wand2, adminOnly: true },
  { href: "/account", label: "Account", icon: KeyRound },
  { href: "/settings", label: "Settings", icon: Settings, adminOnly: true },
];

/**
 * MoreSheet — the bottom-sheet overflow menu for the mobile BottomNav.
 *
 * Slides up from the bottom edge when the user taps "More" in BottomNav.
 * Shows every nav item that isn't already a primary tab, in a 3-column
 * grid of icon+label tiles. Tap a tile to navigate (and auto-close).
 *
 * Replaces the earlier left-side drawer — the bottom-sheet is more
 * native to mobile and stays in the bottom-of-screen interaction zone
 * the BottomNav already lives in.
 *
 * Wired to the shared module store (lib/mobile-drawer-store) so
 * BottomNav's More button can open it without prop drilling.
 */
export function MoreSheet({ role }: { role: UserRole | null }) {
  const [open, setOpen] = useMobileDrawer();
  const pathname = usePathname();
  const items = SHEET_ITEMS.filter((i) => !i.adminOnly || role === "admin");

  // Close when navigating to a new page.
  useEffect(() => {
    setOpen(false);
  }, [pathname, setOpen]);

  // Prevent the body from scrolling behind the sheet while it's open.
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Close on Escape (rare on mobile, but useful for accessibility).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 md:hidden",
        !open && "pointer-events-none",
      )}
      aria-hidden={!open}
      role="dialog"
      aria-modal="true"
      aria-label="More navigation options"
    >
      {/* Backdrop — semi-transparent so the magnetic field bleeds through */}
      <div
        className={cn(
          "absolute inset-0 bg-navy-950/50 transition-opacity duration-300 ease-out",
          open ? "opacity-100" : "opacity-0",
        )}
        onClick={() => setOpen(false)}
      />

      {/* Sheet — slides up from the bottom edge */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-2xl border-t border-gold-500/20 bg-navy-900/95 backdrop-blur-md transition-transform duration-300 ease-out will-change-transform",
          open ? "translate-y-0" : "translate-y-full",
        )}
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)",
        }}
      >
        {/* Drag-handle indicator */}
        <div className="flex justify-center pb-2 pt-3">
          <span aria-hidden className="h-1 w-10 rounded-full bg-cream-200/30" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.22em] text-cream-200/70">
            More
          </h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-cream-200/70 transition-colors hover:bg-navy-800/60 hover:text-cream-50 active:scale-95"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Gold divider */}
        <div className="mx-5 h-px bg-gold-500/20" />

        {/* Grid of nav items */}
        <div className="grid grid-cols-3 gap-2 px-4 pb-2 pt-4">
          {items.map(({ href, label, icon: Icon }) => {
            const active =
              pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-lg border px-3 py-4 text-center transition-colors duration-150 active:scale-95 active:opacity-80",
                  active
                    ? "border-gold-500/50 bg-gold-500/10 text-gold-300"
                    : "border-navy-700/40 bg-navy-800/40 text-cream-100 hover:border-gold-500/30 hover:bg-navy-800/70 hover:text-cream-50",
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[11px] font-medium uppercase tracking-wider">
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
