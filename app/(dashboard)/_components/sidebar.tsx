"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  Home,
  Building2,
  DollarSign,
  Sparkles,
  Settings,
  Wand2,
  MessageSquare,
  Sun,
  Bell,
  Receipt,
  Zap,
  KeyRound,
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
  { href: "/today", label: "Today", icon: Sun },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/suggestions", label: "Suggestions", icon: Zap, adminOnly: true },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/properties", label: "Properties", icon: Building2 },
  { href: "/revenue", label: "Revenue", icon: DollarSign, adminOnly: true },
  { href: "/cleaning", label: "Cleaning", icon: Sparkles },
  { href: "/messages", label: "Messages", icon: MessageSquare },
  { href: "/expenses", label: "Expenses", icon: Receipt, adminOnly: true },
  { href: "/optimizer", label: "Listing Optimizer", icon: Wand2, adminOnly: true },
  { href: "/account", label: "Account", icon: KeyRound },
  { href: "/settings", label: "Settings", icon: Settings, adminOnly: true },
];

export function Sidebar({ role }: { role: UserRole | null }) {
  const pathname = usePathname();
  const items = NAV.filter((item) => !item.adminOnly || role === "admin");

  return (
    <aside className="hidden w-60 shrink-0 bg-navy-gradient text-cream-100 md:flex md:flex-col">
      <Link href="/" className="flex items-center gap-3 px-5 py-6">
        <BrandMark tone="light" size="md" showWordmark />
      </Link>

      <div className="mx-5 mb-4 h-px bg-gold-500/40" />

      <nav className="flex-1 space-y-1 px-3">
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
                "group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition",
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
