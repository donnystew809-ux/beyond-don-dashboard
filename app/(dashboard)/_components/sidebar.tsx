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
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/supabase/types";

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
  { href: "/settings", label: "Settings", icon: Settings, adminOnly: true },
];

export function Sidebar({ role }: { role: UserRole | null }) {
  const pathname = usePathname();
  const items = NAV.filter((item) => !item.adminOnly || role === "admin");

  return (
    <aside className="hidden w-56 shrink-0 border-r border-neutral-200 bg-white px-4 py-6 md:block">
      <Link href="/" className="mb-8 block px-2">
        <div className="text-sm font-semibold tracking-tight">BEYOND DON</div>
        <div className="text-xs text-neutral-500">Operations</div>
      </Link>

      <nav className="space-y-1">
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
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition",
                isActive
                  ? "bg-neutral-900 text-white"
                  : "text-neutral-700 hover:bg-neutral-100",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
