"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  X,
  Menu,
  CalendarDays,
  Home,
  Building2,
  DollarSign,
  Sparkles,
  Settings,
  Wand2,
  MessageSquare,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/supabase/types";
import { BrandMark } from "@/components/brand-mark";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
};

const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/properties", label: "Properties", icon: Building2 },
  { href: "/pricing", label: "Pricing", icon: DollarSign, adminOnly: true },
  { href: "/cleaning", label: "Cleaning", icon: Sparkles },
  { href: "/messages", label: "Messages", icon: MessageSquare },
  { href: "/optimizer", label: "Listing Optimizer", icon: Wand2, adminOnly: true },
  { href: "/settings", label: "Settings", icon: Settings, adminOnly: true },
];

export function MobileMenuButton({ role }: { role: UserRole | null }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close when navigating
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const items = NAV.filter((item) => !item.adminOnly || role === "admin");

  return (
    <>
      {/* Hamburger button — only visible on mobile */}
      <button
        onClick={() => setOpen(true)}
        className="flex h-10 w-10 items-center justify-center rounded-md text-navy-700 hover:bg-cream-200 md:hidden"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Drawer overlay + panel */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-navy-950/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Slide-in panel */}
          <div className="absolute bottom-0 left-0 top-0 flex w-[280px] flex-col bg-navy-gradient text-cream-100 shadow-2xl">
            {/* Logo + close */}
            <div className="flex items-center justify-between px-5 py-5">
              <Link href="/" onClick={() => setOpen(false)}>
                <BrandMark tone="light" size="md" showWordmark />
              </Link>
              <button
                onClick={() => setOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-md text-cream-100/70 hover:bg-navy-950/40 hover:text-cream-50"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mx-5 mb-4 h-px bg-gold-500/40" />

            {/* Nav items — bigger touch targets on mobile */}
            <nav className="flex-1 space-y-1 overflow-y-auto px-3">
              {items.map(({ href, label, icon: Icon }) => {
                const isActive =
                  href === "/"
                    ? pathname === "/"
                    : pathname === href || pathname.startsWith(`${href}/`);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-md px-3 py-3.5 text-sm transition",
                      isActive
                        ? "bg-navy-950/60 text-cream-50"
                        : "text-cream-100/70 hover:bg-navy-950/30 hover:text-cream-50",
                    )}
                  >
                    {isActive && (
                      <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-gold-500" />
                    )}
                    <Icon
                      className={cn(
                        "h-5 w-5 shrink-0",
                        isActive
                          ? "text-gold-400"
                          : "text-cream-100/60 group-hover:text-gold-300",
                      )}
                    />
                    <span className={cn("text-base", isActive && "font-medium")}>
                      {label}
                    </span>
                  </Link>
                );
              })}
            </nav>

            <div className="border-t border-navy-700/60 px-5 py-4">
              <p className="text-[10px] uppercase tracking-[0.22em] text-cream-100/40">
                Beyond Don, LLC
              </p>
              <p className="mt-1 text-[10px] text-cream-100/40">
                Maximize Your Property&apos;s Potential.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
