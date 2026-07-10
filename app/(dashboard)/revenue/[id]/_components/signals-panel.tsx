"use client";

// Signals panel — renders the pure engine's output with one-click actions.
//   set_price / discount → POST /api/pricing/override (pushes to PriceLabs)
//   raise_floor          → POST /api/pricing/auto-toggle (updates guardrail)
// Each action confirms, calls the API, then refreshes the server data so the
// calendar and pacing reflect the change immediately.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Sparkles, Info, Check } from "lucide-react";

import { GlassCard } from "@/components/glass-card";
import { formatCurrency } from "@/lib/utils";
import type { PricingSignal } from "@/lib/pricing-signals";

export function SignalsPanel({
  propertyId,
  signals,
  currentMinBound,
}: {
  propertyId: string;
  signals: PricingSignal[];
  currentMinBound: number | null;
}) {
  if (signals.length === 0) {
    return (
      <GlassCard tone="emerald" className="p-4 text-sm text-cream-100">
        <span className="inline-flex items-center gap-2">
          <Check className="h-4 w-4 text-emerald-300" />
          No pricing signals — the calendar looks healthy.
        </span>
      </GlassCard>
    );
  }
  return (
    <div className="space-y-2">
      {signals.map((s, i) => (
        <SignalRow
          key={i}
          propertyId={propertyId}
          signal={s}
          currentMinBound={currentMinBound}
        />
      ))}
    </div>
  );
}

function SignalRow({
  propertyId,
  signal,
  currentMinBound,
}: {
  propertyId: string;
  signal: PricingSignal;
  currentMinBound: number | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const Icon =
    signal.severity === "warning"
      ? AlertTriangle
      : signal.severity === "opportunity"
        ? Sparkles
        : Info;
  const tone =
    signal.severity === "warning"
      ? "red"
      : signal.severity === "opportunity"
        ? "gold"
        : "default";
  const iconColor =
    signal.severity === "warning"
      ? "text-red-300"
      : signal.severity === "opportunity"
        ? "text-gold-300"
        : "text-cream-200/60";

  async function runAction() {
    const a = signal.action;
    if (!a) return;
    const label = actionLabel(a);
    if (!confirm(`${label}\n\nThis pushes to PriceLabs / Airbnb now. Continue?`)) return;
    setBusy(true);
    setErr(null);
    try {
      if (a.kind === "set_price" || a.kind === "discount") {
        const res = await fetch("/api/pricing/override", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ property_id: propertyId, date: a.date, price: a.price }),
        });
        if (!res.ok) throw new Error((await res.text()) || "override failed");
      } else if (a.kind === "raise_floor") {
        const res = await fetch("/api/pricing/auto-toggle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ property_id: propertyId, auto_accept_min_price: a.price }),
        });
        if (!res.ok) throw new Error((await res.text()) || "guardrail update failed");
      }
      setDone(true);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <GlassCard tone={tone as "red" | "gold" | "default"} className="p-3">
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconColor}`} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-cream-50">{signal.title}</div>
          <p className="mt-0.5 text-xs text-cream-200/70">{signal.detail}</p>
          {err && <p className="mt-1 text-xs text-red-300">{err}</p>}
        </div>
        {signal.action && (
          <button
            onClick={runAction}
            disabled={busy || done}
            className="shrink-0 rounded-md bg-gold-gradient px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-navy-950 hover:brightness-110 disabled:opacity-50"
          >
            {done ? "Done" : busy ? "…" : actionButtonLabel(signal.action, currentMinBound)}
          </button>
        )}
      </div>
    </GlassCard>
  );
}

function actionButtonLabel(
  a: NonNullable<PricingSignal["action"]>,
  _min: number | null,
): string {
  if (a.kind === "set_price") return `Set ${formatCurrency(a.price).replace(/\.00$/, "")}`;
  if (a.kind === "discount") return `Discount ${formatCurrency(a.price).replace(/\.00$/, "")}`;
  return `Floor ${formatCurrency(a.price).replace(/\.00$/, "")}`;
}

function actionLabel(a: NonNullable<PricingSignal["action"]>): string {
  if (a.kind === "set_price") return `Set ${a.date} to ${formatCurrency(a.price)}`;
  if (a.kind === "discount") return `Discount ${a.date} to ${formatCurrency(a.price)}`;
  return `Raise the price floor to ${formatCurrency(a.price)}`;
}
