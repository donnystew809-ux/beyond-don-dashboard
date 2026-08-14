"use client";

// Admin ops editor — per-property configuration for the cleaner working
// surface: checklist template, inventory items + par levels, maintenance
// cadences. Lives on settings/properties/[id] below the profile form.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { GlassCard } from "@/components/glass-card";
import { confirmSheet } from "@/components/confirm-sheet";

export type TemplateInitial = { title: string; items: Array<{ text: string }> } | null;
export type InventoryInitial = Array<{
  id: string;
  name: string;
  unit: string;
  par_level: number;
  current_qty: number;
}>;
export type ScheduleInitial = Array<{
  id: string;
  title: string;
  cadence_days: number;
  last_done_on: string | null;
  active: boolean;
}>;

const inputCls =
  "mt-1 block w-full rounded-md border border-navy-700/50 bg-navy-950/60 px-3 py-2 text-sm text-cream-50 placeholder:text-cream-200/40 focus:border-gold-500 focus:outline-none";
const labelCls = "text-[11px] font-medium uppercase tracking-wider text-cream-200/70";
const btnCls =
  "rounded-md bg-gold-gradient px-4 py-2 text-xs font-semibold uppercase tracking-wider text-navy-950 hover:brightness-110 disabled:opacity-50";

async function post(route: string, payload: object) {
  const res = await fetch(`/api/ops/${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "request failed");
  return json;
}

export function OpsEditor({
  propertyId,
  template,
  inventory,
  schedules,
}: {
  propertyId: string;
  template: TemplateInitial;
  inventory: InventoryInitial;
  schedules: ScheduleInitial;
}) {
  return (
    <div className="mt-10 space-y-8">
      <TemplateEditor propertyId={propertyId} initial={template} />
      <InventoryEditor propertyId={propertyId} initial={inventory} />
      <ScheduleEditor propertyId={propertyId} initial={schedules} />
    </div>
  );
}

// ── Checklist template ─────────────────────────────────────────────────────
function TemplateEditor({
  propertyId,
  initial,
}: {
  propertyId: string;
  initial: TemplateInitial;
}) {
  const router = useRouter();
  const [text, setText] = useState(
    (initial?.items ?? []).map((i) => i.text).join("\n"),
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const items = text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((t) => ({ text: t }));
      await post("checklist", {
        action: "save_template",
        property_id: propertyId,
        title: initial?.title ?? "Cleaning checklist",
        items,
      });
      setMsg(`Saved — ${items.length} items.`);
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <GlassCard className="p-5">
      <h3 className="gold-underline text-base font-semibold text-cream-50">
        Cleaning checklist template
      </h3>
      <p className="mt-2 text-xs text-cream-200/60">
        One item per line. The cleaner checks these off each turnover and
        submits — incomplete submissions flag a warning to you.
      </p>
      <textarea
        rows={8}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"Strip and remake all beds\nRun + empty dishwasher\nCheck lockbox has key…"}
        className={inputCls}
      />
      <div className="mt-3 flex items-center gap-3">
        <button onClick={save} disabled={busy} className={btnCls}>
          {busy ? "Saving…" : "Save template"}
        </button>
        {msg && <span className="text-xs text-gold-300">{msg}</span>}
      </div>
    </GlassCard>
  );
}

// ── Inventory ──────────────────────────────────────────────────────────────
function InventoryEditor({
  propertyId,
  initial,
}: {
  propertyId: string;
  initial: InventoryInitial;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [par, setPar] = useState(2);
  const [qty, setQty] = useState(0);
  const [unit, setUnit] = useState("ct");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy("add");
    setMsg(null);
    try {
      await post("inventory", {
        action: "upsert_item",
        property_id: propertyId,
        name: name.trim(),
        unit,
        par_level: par,
        current_qty: qty,
      });
      setName("");
      router.refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    if (
      !(await confirmSheet({
        title: "Remove this inventory item?",
        body: "Its stock history goes with it. This can't be undone.",
        confirmLabel: "Remove",
        tone: "danger",
      }))
    )
      return;
    setBusy(id);
    try {
      await post("inventory", { action: "delete_item", id });
      router.refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <GlassCard className="p-5">
      <h3 className="gold-underline text-base font-semibold text-cream-50">Inventory</h3>
      <p className="mt-2 text-xs text-cream-200/60">
        Track consumables with a par level — when the cleaner reports stock
        below par, you get a low-stock alert.
      </p>

      {initial.length > 0 && (
        <div className="mt-4 divide-y divide-navy-700/30 rounded-md border border-navy-700/40">
          {initial.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <span className="text-sm text-cream-50">{item.name}</span>
                <span className="ml-2 text-[11px] text-cream-200/50">
                  {item.current_qty}/{item.par_level} {item.unit}
                </span>
                {item.current_qty < item.par_level && (
                  <span className="ml-2 text-[11px] text-amber-300">low</span>
                )}
              </div>
              <button
                onClick={() => remove(item.id)}
                disabled={busy === item.id}
                className="shrink-0 rounded p-1.5 text-cream-200/50 hover:bg-red-500/10 hover:text-red-300"
                title="Remove"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={add} className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <label className="col-span-2 block">
          <span className={labelCls}>Item</span>
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Toilet paper" className={inputCls} />
        </label>
        <label className="block">
          <span className={labelCls}>Unit</span>
          <input value={unit} onChange={(e) => setUnit(e.target.value)} className={inputCls} />
        </label>
        <label className="block">
          <span className={labelCls}>Par</span>
          <input type="number" min={0} value={par} onChange={(e) => setPar(Number(e.target.value))} className={inputCls} />
        </label>
        <label className="block">
          <span className={labelCls}>On hand</span>
          <input type="number" min={0} value={qty} onChange={(e) => setQty(Number(e.target.value))} className={inputCls} />
        </label>
        <div className="col-span-2 sm:col-span-5">
          <button type="submit" disabled={busy === "add"} className={btnCls}>
            {busy === "add" ? "Adding…" : "Add item"}
          </button>
          {msg && <span className="ml-3 text-xs text-red-300">{msg}</span>}
        </div>
      </form>
    </GlassCard>
  );
}

// ── Maintenance schedules ──────────────────────────────────────────────────
function ScheduleEditor({
  propertyId,
  initial,
}: {
  propertyId: string;
  initial: ScheduleInitial;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [cadence, setCadence] = useState(90);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy("add");
    setMsg(null);
    try {
      await post("maintenance", {
        action: "save_schedule",
        property_id: propertyId,
        title: title.trim(),
        cadence_days: cadence,
      });
      setTitle("");
      router.refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    if (
      !(await confirmSheet({
        title: "Delete this maintenance schedule?",
        body: "Future tasks will stop generating. This can't be undone.",
        confirmLabel: "Delete",
        tone: "danger",
      }))
    )
      return;
    setBusy(id);
    try {
      await post("maintenance", { action: "delete_schedule", id });
      router.refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <GlassCard className="p-5">
      <h3 className="gold-underline text-base font-semibold text-cream-50">
        Recurring maintenance
      </h3>
      <p className="mt-2 text-xs text-cream-200/60">
        e.g. &quot;Replace air filters&quot; every 90 days. Tasks generate
        automatically and overdue ones alert you.
      </p>

      {initial.length > 0 && (
        <div className="mt-4 divide-y divide-navy-700/30 rounded-md border border-navy-700/40">
          {initial.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <span className="text-sm text-cream-50">{s.title}</span>
                <span className="ml-2 text-[11px] text-cream-200/50">
                  every {s.cadence_days}d
                  {s.last_done_on ? ` · last ${s.last_done_on}` : " · never done"}
                </span>
              </div>
              <button
                onClick={() => remove(s.id)}
                disabled={busy === s.id}
                className="shrink-0 rounded p-1.5 text-cream-200/50 hover:bg-red-500/10 hover:text-red-300"
                title="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={add} className="mt-4 grid grid-cols-3 gap-3">
        <label className="col-span-2 block">
          <span className={labelCls}>Task</span>
          <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Replace air filters" className={inputCls} />
        </label>
        <label className="block">
          <span className={labelCls}>Every (days)</span>
          <input type="number" min={1} value={cadence} onChange={(e) => setCadence(Number(e.target.value))} className={inputCls} />
        </label>
        <div className="col-span-3">
          <button type="submit" disabled={busy === "add"} className={btnCls}>
            {busy === "add" ? "Adding…" : "Add schedule"}
          </button>
          {msg && <span className="ml-3 text-xs text-red-300">{msg}</span>}
        </div>
      </form>
    </GlassCard>
  );
}
