// Central navigation config, gated by role. One source of truth for the
// sidebar (desktop), bottom-nav (mobile primary tabs) and more-sheet (mobile
// overflow), so a cleaner/owner never sees a staff-only destination.
//
// `roles` = who sees the item. `primary` = shown as a bottom-nav tab on
// mobile (non-primary items fall into the "More" sheet). Staff (admin/
// operator) keep exactly their current items + the same four primary tabs.

import {
  Home,
  Sun,
  Bell,
  Zap,
  CalendarDays,
  Building2,
  DollarSign,
  Sparkles,
  MessageSquare,
  Receipt,
  Wand2,
  KeyRound,
  Users,
  Settings,
  DoorOpen,
  FileSignature,
} from "lucide-react";

import type { UserRole } from "@/lib/supabase/types";

export type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: UserRole[];
  primary?: boolean; // surfaced as a mobile bottom-nav tab
};

const STAFF: UserRole[] = ["admin", "operator"];
const ADMIN: UserRole[] = ["admin"];
const EVERYONE: UserRole[] = ["admin", "operator", "owner", "cleaner", "partner"];

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: Home, roles: STAFF },
  { href: "/today", label: "Today", icon: Sun, roles: STAFF, primary: true },
  { href: "/alerts", label: "Alerts", icon: Bell, roles: STAFF },
  { href: "/suggestions", label: "Suggestions", icon: Zap, roles: ADMIN },
  { href: "/calendar", label: "Calendar", icon: CalendarDays, roles: STAFF, primary: true },
  { href: "/properties", label: "Properties", icon: Building2, roles: STAFF, primary: true },
  { href: "/revenue", label: "Revenue", icon: DollarSign, roles: ADMIN },
  { href: "/cleaning", label: "Cleaning", icon: Sparkles, roles: STAFF },
  { href: "/messages", label: "Messages", icon: MessageSquare, roles: STAFF, primary: true },
  { href: "/expenses", label: "Expenses", icon: Receipt, roles: ADMIN },
  { href: "/optimizer", label: "Listing Optimizer", icon: Wand2, roles: ADMIN },
  { href: "/contracts", label: "Contracts", icon: FileSignature, roles: ADMIN },

  // Cleaner / owner scoped destinations
  { href: "/my-property", label: "My Properties", icon: DoorOpen, roles: ["cleaner", "owner", "partner"], primary: true },
  { href: "/owner", label: "Earnings", icon: DollarSign, roles: ["owner", "partner"], primary: true },

  // Everyone with an account
  { href: "/account", label: "Account", icon: KeyRound, roles: EVERYONE },
  { href: "/settings/team", label: "Team", icon: Users, roles: ADMIN },
  { href: "/settings", label: "Settings", icon: Settings, roles: ADMIN },
];

export function navForRole(role: UserRole | null): NavItem[] {
  // No role row yet (fresh account, or data hiccup): degrade to a minimal
  // shell instead of a blank app — Account still reachable so the user can
  // see who they're signed in as. Never silently grant staff nav.
  if (!role) return NAV_ITEMS.filter((i) => i.href === "/account");
  return NAV_ITEMS.filter((i) => i.roles.includes(role));
}

/** Up to four primary destinations for the mobile bottom nav. */
export function primaryNavForRole(role: UserRole | null): NavItem[] {
  return navForRole(role)
    .filter((i) => i.primary)
    .slice(0, 4);
}

/** Everything not shown as a primary tab — the mobile "More" sheet. */
export function overflowNavForRole(role: UserRole | null): NavItem[] {
  const primaryHrefs = new Set(primaryNavForRole(role).map((i) => i.href));
  return navForRole(role).filter((i) => !primaryHrefs.has(i.href));
}
