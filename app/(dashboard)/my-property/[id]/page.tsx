import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft, KeyRound, Wifi, Car, Trash2, ShieldAlert } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { GlassCard } from "@/components/glass-card";
import { OpsPanel } from "./ops-panel";

export const dynamic = "force-dynamic";

// Ordered, labelled access facts we know how to render prominently. Anything
// else in access_info is shown generically below.
const ACCESS_FIELDS: Array<{ key: string; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: "lockbox_code", label: "Lockbox code", icon: KeyRound },
  { key: "gate_code", label: "Gate code", icon: KeyRound },
  { key: "wifi_network", label: "WiFi network", icon: Wifi },
  { key: "wifi_password", label: "WiFi password", icon: Wifi },
  { key: "parking_notes", label: "Parking", icon: Car },
  { key: "trash_day", label: "Trash day", icon: Trash2 },
  { key: "alarm_notes", label: "Alarm", icon: ShieldAlert },
];

export default async function MyPropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: property } = await supabase
    .from("properties")
    .select("id, name, address")
    .eq("id", id)
    .maybeSingle();
  if (!property) notFound();

  const db = supabase as any; // ops tables predate generated types
  const [{ data: profile }, { data: cleanings }, { data: template }, { data: inventory }, { data: tasks }] =
    await Promise.all([
      db
        .from("property_profiles")
        .select("access_info, house_rules_md, quirks_md, cleaning_notes_md")
        .eq("property_id", id)
        .maybeSingle(),
      supabase
        .from("cleanings")
        .select("id, scheduled_for, status")
        .eq("property_id", id)
        .gte("scheduled_for", format(new Date(), "yyyy-MM-dd"))
        .order("scheduled_for")
        .limit(5),
      db.from("checklist_templates").select("id").eq("property_id", id).maybeSingle(),
      db
        .from("inventory_items")
        .select("id, name, unit, par_level, current_qty")
        .eq("property_id", id)
        .order("name"),
      db
        .from("maintenance_tasks")
        .select("id, title, due_on")
        .eq("property_id", id)
        .eq("status", "pending")
        .order("due_on")
        .limit(10),
    ]);

  const nextCleaning =
    (cleanings ?? []).find((c: { status: string }) => c.status !== "completed") ??
    (cleanings ?? [])[0] ??
    null;
  const { data: existingChecklist } = nextCleaning
    ? await db
        .from("cleaning_checklists")
        .select("id, items, status")
        .eq("cleaning_id", nextCleaning.id)
        .maybeSingle()
    : { data: null };

  const access: Record<string, string> = profile?.access_info ?? {};
  const knownKeys = new Set(ACCESS_FIELDS.map((f) => f.key));
  const shownAccess = ACCESS_FIELDS.filter((f) => access[f.key]);
  const extraAccess = Object.entries(access).filter(
    ([k, v]) => v && !knownKeys.has(k),
  );

  const cleaningRows = (cleanings ?? []) as Array<{
    id: string;
    scheduled_for: string;
    status: string;
  }>;

  return (
    <div className="max-w-2xl">
      <Link
        href="/my-property"
        className="mb-3 inline-flex items-center gap-1.5 text-xs text-cream-200/60 hover:text-cream-50"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        My properties
      </Link>

      <PageHeader title={property.name} description={property.address ?? undefined} />

      {/* Access & facts — the codes you need on arrival */}
      {shownAccess.length > 0 || extraAccess.length > 0 ? (
        <div className="mb-6 grid grid-cols-2 gap-3">
          {shownAccess.map((f) => (
            <GlassCard key={f.key} className="p-4">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-cream-200/60">
                <f.icon className="h-3.5 w-3.5" />
                {f.label}
              </div>
              <div className="mt-1 select-all break-words font-mono text-lg font-semibold text-cream-50">
                {access[f.key]}
              </div>
            </GlassCard>
          ))}
          {extraAccess.map(([k, v]) => (
            <GlassCard key={k} className="p-4">
              <div className="text-[11px] uppercase tracking-wider text-cream-200/60">
                {k.replace(/_/g, " ")}
              </div>
              <div className="mt-1 select-all break-words text-sm text-cream-50">{v}</div>
            </GlassCard>
          ))}
        </div>
      ) : (
        <GlassCard tone="amber" className="mb-6 p-4 text-sm text-cream-100">
          No access details have been added for this property yet. Ask Donovan
          to fill in the lockbox code, wifi, and notes.
        </GlassCard>
      )}

      {/* Working surface: checklist, inventory, maintenance */}
      <div className="mb-8">
        <OpsPanel
          propertyId={id}
          nextCleaning={nextCleaning}
          checklist={existingChecklist}
          hasTemplate={Boolean(template)}
          inventory={(inventory ?? []) as never[]}
          tasks={(tasks ?? []) as never[]}
        />
      </div>

      {/* Notes */}
      <NoteSection title="Cleaning notes" body={profile?.cleaning_notes_md} />
      <NoteSection title="House quirks" body={profile?.quirks_md} />
      <NoteSection title="House rules" body={profile?.house_rules_md} />

      {/* Upcoming cleanings */}
      <section className="mt-8">
        <h3 className="gold-underline mb-3 text-sm font-semibold uppercase tracking-wider text-cream-100">
          Upcoming cleanings
        </h3>
        {cleaningRows.length === 0 ? (
          <GlassCard className="p-4 text-sm text-cream-200/60">
            No upcoming cleanings scheduled.
          </GlassCard>
        ) : (
          <div className="space-y-2">
            {cleaningRows.map((c) => (
              <GlassCard key={c.id} className="flex items-center justify-between gap-3 p-3">
                <span className="text-sm text-cream-50">
                  {format(new Date(c.scheduled_for), "EEE, MMM d")}
                </span>
                <span className="rounded-full bg-navy-700/40 px-2 py-0.5 text-[10px] uppercase tracking-wide text-cream-200/70">
                  {c.status}
                </span>
              </GlassCard>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function NoteSection({ title, body }: { title: string; body?: string | null }) {
  if (!body) return null;
  return (
    <section className="mb-4">
      <h3 className="gold-underline mb-2 text-sm font-semibold uppercase tracking-wider text-cream-100">
        {title}
      </h3>
      <GlassCard className="p-4">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-cream-100">{body}</p>
      </GlassCard>
    </section>
  );
}
