"use client";

// Property profile editor — the per-property operational brain.
// Access facts (lockbox, wifi…) power the AI drafter's factual answers and
// the cleaner-facing property view (Phase 3). Freeform sections hold the
// "this host likes it done this way" knowledge.

import { useState } from "react";
import { useRouter } from "next/navigation";

const ACCESS_FIELDS: Array<{ key: string; label: string; placeholder?: string }> = [
  { key: "lockbox_code", label: "Lockbox code", placeholder: "e.g. 4321#" },
  { key: "gate_code", label: "Gate code" },
  { key: "wifi_network", label: "WiFi network" },
  { key: "wifi_password", label: "WiFi password" },
  { key: "parking_notes", label: "Parking notes" },
  { key: "trash_day", label: "Trash day" },
  { key: "alarm_notes", label: "Alarm notes" },
];

const MD_SECTIONS: Array<{ key: string; label: string; hint: string }> = [
  { key: "house_rules_md", label: "House rules", hint: "Rules the AI may quote to guests." },
  { key: "quirks_md", label: "House quirks", hint: "The tricky thermostat, the sticky door…" },
  { key: "host_preferences_md", label: "Host preferences", hint: "How this owner likes things handled." },
  { key: "cleaning_notes_md", label: "Cleaning notes", hint: "Shown to the cleaner on this property." },
];

export type ProfileInitial = {
  access_info?: Record<string, string> | null;
  house_rules_md?: string | null;
  quirks_md?: string | null;
  host_preferences_md?: string | null;
  cleaning_notes_md?: string | null;
} | null;

export function ProfileForm({
  propertyId,
  initial,
}: {
  propertyId: string;
  initial: ProfileInitial;
}) {
  const router = useRouter();
  const [access, setAccess] = useState<Record<string, string>>(
    () => ({ ...(initial?.access_info ?? {}) }) as Record<string, string>,
  );
  const [sections, setSections] = useState<Record<string, string>>(() => ({
    house_rules_md: initial?.house_rules_md ?? "",
    quirks_md: initial?.quirks_md ?? "",
    host_preferences_md: initial?.host_preferences_md ?? "",
    cleaning_notes_md: initial?.cleaning_notes_md ?? "",
  }));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    const res = await fetch("/api/properties/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        property_id: propertyId,
        access_info: Object.fromEntries(
          Object.entries(access).filter(([, v]) => v?.trim()),
        ),
        house_rules_md: sections.house_rules_md || null,
        quirks_md: sections.quirks_md || null,
        host_preferences_md: sections.host_preferences_md || null,
        cleaning_notes_md: sections.cleaning_notes_md || null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      setMessage(j?.error ?? "Save failed");
      return;
    }
    setMessage("Profile saved — the AI now answers with these facts.");
    router.refresh();
  }

  const inputCls =
    "mt-1 block w-full rounded-md border border-navy-700/50 bg-navy-950/60 px-3 py-2 text-sm text-cream-50 placeholder:text-cream-200/40 focus:border-gold-500 focus:outline-none";
  const labelCls =
    "text-[11px] font-medium uppercase tracking-wider text-cream-200/70";

  return (
    <form
      onSubmit={handleSave}
      className="mt-10 rounded-lg border border-navy-700/40 bg-navy-900/60 p-5 backdrop-blur-sm"
    >
      <h2 className="gold-underline text-lg font-semibold text-cream-50">
        Property profile
      </h2>
      <p className="mt-3 text-xs text-cream-200/60">
        The operational brain for this property. The AI drafter uses these
        facts to answer guests (never guessing), and your cleaner sees them
        instead of texting you.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {ACCESS_FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className={labelCls}>{f.label}</span>
            <input
              type="text"
              value={access[f.key] ?? ""}
              placeholder={f.placeholder}
              onChange={(e) => setAccess((a) => ({ ...a, [f.key]: e.target.value }))}
              className={inputCls}
            />
          </label>
        ))}
      </div>

      <div className="mt-6 space-y-5">
        {MD_SECTIONS.map((s) => (
          <label key={s.key} className="block">
            <span className={labelCls}>{s.label}</span>
            <span className="ml-2 text-[10px] normal-case tracking-normal text-cream-200/40">
              {s.hint}
            </span>
            <textarea
              rows={3}
              value={sections[s.key]}
              onChange={(e) =>
                setSections((sec) => ({ ...sec, [s.key]: e.target.value }))
              }
              className={inputCls}
            />
          </label>
        ))}
      </div>

      <div className="mt-6 flex items-center gap-4">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-gold-gradient px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-navy-950 hover:brightness-110 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save profile"}
        </button>
        {message && <p className="text-xs text-gold-300">{message}</p>}
      </div>
    </form>
  );
}
