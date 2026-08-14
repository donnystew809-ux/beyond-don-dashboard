"use client";

// Cleaner ops panel — the working surface on a property page:
//   • Cleaning checklist for the next cleaning (start → check off → submit)
//   • Inventory quick-count (set current stock; low-stock alerts staff)
//   • Maintenance tasks due (complete/skip)
// All mutations go through /api/ops/* which run under the cleaner's own
// session, so RLS guarantees they can only touch this property.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckSquare, Package, Wrench } from "lucide-react";

import { GlassCard } from "@/components/glass-card";

type ChecklistItem = { text: string; checked: boolean };
export type OpsChecklist = {
  id: string;
  items: ChecklistItem[];
  status: string;
} | null;
export type OpsCleaning = { id: string; scheduled_for: string } | null;
export type OpsInventoryItem = {
  id: string;
  name: string;
  unit: string;
  par_level: number;
  current_qty: number;
};
export type OpsTask = { id: string; title: string; due_on: string };

export function OpsPanel({
  propertyId,
  nextCleaning,
  checklist: initialChecklist,
  hasTemplate,
  inventory,
  tasks,
}: {
  propertyId: string;
  nextCleaning: OpsCleaning;
  checklist: OpsChecklist;
  hasTemplate: boolean;
  inventory: OpsInventoryItem[];
  tasks: OpsTask[];
}) {
  const router = useRouter();
  const [checklist, setChecklist] = useState<OpsChecklist>(initialChecklist);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; kind: "ok" | "err" } | null>(null);
  // Serialize checklist toggles: the API does a read-modify-write of the
  // whole items array, so two in-flight toggles would clobber each other.
  const toggleChain = useRef<Promise<void>>(Promise.resolve());

  // Resync when the server-provided checklist changes (e.g. after refresh).
  useEffect(() => {
    if (initialChecklist?.id !== checklist?.id) setChecklist(initialChecklist);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialChecklist?.id]);

  async function call(payload: object): Promise<any> {
    const res = await fetch(`/api/ops/${(payload as any).__route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, __route: undefined }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? "request failed");
    return json;
  }

  const fail = (e: unknown, fallback: string) =>
    setMsg({ text: e instanceof Error ? e.message : fallback, kind: "err" });

  async function startChecklist() {
    if (!nextCleaning) return;
    setBusy("start");
    setMsg(null);
    try {
      const json = await call({
        __route: "checklist",
        action: "start",
        cleaning_id: nextCleaning.id,
        property_id: propertyId,
      });
      setChecklist(json.checklist);
    } catch (e) {
      fail(e, "Could not start the checklist");
    } finally {
      setBusy(null);
    }
  }

  function toggle(index: number, checked: boolean) {
    if (!checklist) return;
    // Optimistic (functional, so rapid taps compose correctly)…
    setChecklist((cur) =>
      cur
        ? { ...cur, items: cur.items.map((it, i) => (i === index ? { ...it, checked } : it)) }
        : cur,
    );
    // …while the server writes run strictly one-at-a-time.
    const id = checklist.id;
    toggleChain.current = toggleChain.current.then(async () => {
      try {
        await call({ __route: "checklist", action: "toggle", checklist_id: id, index, checked });
      } catch {
        // Revert just this item on failure.
        setChecklist((cur) =>
          cur
            ? { ...cur, items: cur.items.map((it, i) => (i === index ? { ...it, checked: !checked } : it)) }
            : cur,
        );
        setMsg({ text: "A checkbox didn't save — try it again", kind: "err" });
      }
    });
  }

  async function submit() {
    if (!checklist) return;
    setMsg(null);
    const unchecked = checklist.items.filter((i) => !i.checked).length;
    if (
      unchecked > 0 &&
      !confirm(`${unchecked} item(s) are unchecked. Submit anyway?`)
    )
      return;
    setBusy("submit");
    try {
      await toggleChain.current; // let any in-flight toggles land first
      await call({ __route: "checklist", action: "submit", checklist_id: checklist.id });
      setChecklist((cur) => (cur ? { ...cur, status: "submitted" } : cur));
      setMsg({ text: "Checklist submitted — thank you!", kind: "ok" });
      router.refresh();
    } catch (e) {
      fail(e, "Submit failed");
    } finally {
      setBusy(null);
    }
  }

  async function setQty(itemId: string, qty: number) {
    setBusy(itemId);
    setMsg(null);
    try {
      await call({ __route: "inventory", action: "adjust", item_id: itemId, qty });
      router.refresh();
    } catch (e) {
      fail(e, "Count didn't save");
    } finally {
      setBusy(null);
    }
  }

  async function finishTask(taskId: string, done: boolean) {
    setBusy(taskId);
    setMsg(null);
    try {
      await call({
        __route: "maintenance",
        action: done ? "complete_task" : "skip_task",
        task_id: taskId,
      });
      router.refresh();
    } catch (e) {
      fail(e, "Task update failed");
    } finally {
      setBusy(null);
    }
  }

  const doneCount = checklist?.items.filter((i) => i.checked).length ?? 0;

  return (
    <div className="space-y-6">
      {/* ── Checklist ── */}
      <section>
        <h3 className="gold-underline mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-cream-100">
          <CheckSquare className="h-4 w-4 text-gold-300" />
          Cleaning checklist
        </h3>
        {!nextCleaning ? (
          <GlassCard className="p-4 text-sm text-cream-200/60">
            No upcoming cleaning — the checklist unlocks when one is scheduled.
          </GlassCard>
        ) : !hasTemplate && !checklist ? (
          <GlassCard tone="amber" className="p-4 text-sm text-cream-100">
            No checklist template yet for this property — ask Donovan to add one.
          </GlassCard>
        ) : !checklist ? (
          <GlassCard className="flex items-center justify-between gap-3 p-4">
            <span className="text-sm text-cream-100">
              Cleaning on {nextCleaning.scheduled_for.slice(0, 10)} — ready to start?
            </span>
            <button
              onClick={startChecklist}
              disabled={busy === "start"}
              className="rounded-md bg-gold-gradient px-4 py-2 text-xs font-semibold uppercase tracking-wider text-navy-950 hover:brightness-110 disabled:opacity-50"
            >
              {busy === "start" ? "…" : "Start checklist"}
            </button>
          </GlassCard>
        ) : (
          <GlassCard className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs text-cream-200/60">
                {doneCount}/{checklist.items.length} done
              </span>
              {checklist.status === "submitted" ? (
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-emerald-300">
                  Submitted
                </span>
              ) : (
                <button
                  onClick={submit}
                  disabled={busy === "submit"}
                  className="rounded-md bg-gold-gradient px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-navy-950 hover:brightness-110 disabled:opacity-50"
                >
                  {busy === "submit" ? "…" : "Submit"}
                </button>
              )}
            </div>
            <ul className="space-y-2">
              {checklist.items.map((item, i) => (
                <li key={i}>
                  <label className="flex cursor-pointer items-start gap-3 rounded-md border border-navy-700/40 bg-navy-950/40 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={item.checked}
                      disabled={checklist.status === "submitted"}
                      onChange={(e) => toggle(i, e.target.checked)}
                      className="mt-0.5 h-4 w-4"
                    />
                    <span
                      className={`text-sm ${item.checked ? "text-cream-200/50 line-through" : "text-cream-50"}`}
                    >
                      {item.text}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </GlassCard>
        )}
      </section>

      {/* ── Inventory ── */}
      {inventory.length > 0 && (
        <section>
          <h3 className="gold-underline mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-cream-100">
            <Package className="h-4 w-4 text-gold-300" />
            Inventory count
          </h3>
          <GlassCard className="divide-y divide-navy-700/30 p-2">
            {inventory.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 px-2 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm text-cream-50">{item.name}</div>
                  <div className="text-[11px] text-cream-200/50">
                    par {item.par_level} {item.unit}
                    {item.current_qty < item.par_level && (
                      <span className="ml-2 text-amber-300">low</span>
                    )}
                  </div>
                </div>
                <input
                  // key includes the server value so a refresh remounts the
                  // input and resyncs it (defaultValue alone never updates).
                  key={`${item.id}:${item.current_qty}`}
                  type="number"
                  min={0}
                  defaultValue={item.current_qty}
                  disabled={busy === item.id}
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v) && v !== item.current_qty) setQty(item.id, v);
                  }}
                  className="w-20 rounded-md border border-navy-700/50 bg-navy-950/60 px-2 py-1.5 text-right text-sm text-cream-50"
                />
              </div>
            ))}
          </GlassCard>
          <p className="mt-1.5 text-[11px] text-cream-200/70">
            Update counts as you restock — low items alert Donovan automatically.
          </p>
        </section>
      )}

      {/* ── Maintenance ── */}
      {tasks.length > 0 && (
        <section>
          <h3 className="gold-underline mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-cream-100">
            <Wrench className="h-4 w-4 text-gold-300" />
            Maintenance due
          </h3>
          <div className="space-y-2">
            {tasks.map((t) => (
              <GlassCard key={t.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm text-cream-50">{t.title}</div>
                  <div className="text-[11px] text-cream-200/70">due {t.due_on}</div>
                </div>
                <button
                  onClick={() => finishTask(t.id, true)}
                  disabled={busy === t.id}
                  className="shrink-0 rounded-md border border-emerald-500/40 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50"
                >
                  Done
                </button>
              </GlassCard>
            ))}
          </div>
        </section>
      )}

      {msg && (
        <p className={`text-xs ${msg.kind === "err" ? "text-red-300" : "text-gold-300"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
