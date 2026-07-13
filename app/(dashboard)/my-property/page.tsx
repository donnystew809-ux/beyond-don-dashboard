import Link from "next/link";
import { ArrowRight, DoorOpen } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { GlassCard } from "@/components/glass-card";

export const dynamic = "force-dynamic";

// Cleaner / owner home: the properties they've been granted, RLS-scoped so a
// cleaner sees only theirs. Staff (who see everything) won't land here from
// nav, but if they do, RLS returns the full list — harmless.
export default async function MyPropertiesPage() {
  const supabase = await createClient();
  const { data: properties } = await supabase
    .from("properties")
    .select("id, name, address")
    .order("name");

  const rows = (properties ?? []) as Array<{
    id: string;
    name: string;
    address: string | null;
  }>;

  return (
    <div>
      <PageHeader
        title="My properties"
        description="Everything you need on site — access codes, wifi, house notes, and your cleaning checklist."
      />

      {rows.length === 0 ? (
        <GlassCard className="p-10 text-center text-sm text-cream-200/60">
          You don&apos;t have access to any properties yet. Ask Donovan to add you.
        </GlassCard>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {rows.map((p) => (
            <Link key={p.id} href={`/my-property/${p.id}`} className="block">
              <GlassCard interactive className="flex items-center gap-4 p-5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-gold-500/15 text-gold-300">
                  <DoorOpen className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-cream-50">{p.name}</div>
                  {p.address && (
                    <div className="truncate text-xs text-cream-200/60">{p.address}</div>
                  )}
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-cream-200/40" />
              </GlassCard>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
