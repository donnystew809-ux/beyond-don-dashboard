"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Property = {
  id: string;
  name: string;
  pricelabs_listing_id: string | null;
  auto_accept_pricing: boolean | null;
  auto_accept_max_deviation_pct: number | null;
  auto_accept_horizon_days: number | null;
  auto_accept_min_price: number | null;
  auto_accept_max_price: number | null;
};

export function AutoPricingControls({ property }: { property: Property }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [auto, setAuto] = useState(!!property.auto_accept_pricing);
  const [deviation, setDeviation] = useState(
    property.auto_accept_max_deviation_pct ?? 25,
  );
  const [horizon, setHorizon] = useState(
    property.auto_accept_horizon_days ?? 30,
  );
  const [minPrice, setMinPrice] = useState<number | "">(
    property.auto_accept_min_price ?? "",
  );
  const [maxPrice, setMaxPrice] = useState<number | "">(
    property.auto_accept_max_price ?? "",
  );

  if (!property.pricelabs_listing_id) {
    return (
      <span className="text-[10px] uppercase tracking-wide text-navy-400">
        not connected
      </span>
    );
  }

  async function applyNow() {
    if (!confirm(`Push PriceLabs suggested prices for ${property.name} for the next ${horizon} days?`))
      return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/pricing/apply-suggested", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ property_id: property.id, days: horizon }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMsg(`Error: ${json.error ?? res.statusText}`);
        return;
      }
      setMsg(
        `Pushed ${json.pushed} dates · skipped ${json.skipped}${
          json.errors?.length ? ` · ${json.errors.length} errors` : ""
        }`,
      );
      router.refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "unknown error");
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings(nextAuto?: boolean) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/pricing/auto-toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          property_id: property.id,
          auto_accept_pricing: nextAuto ?? auto,
          auto_accept_max_deviation_pct: deviation,
          auto_accept_horizon_days: horizon,
          auto_accept_min_price: minPrice === "" ? null : Number(minPrice),
          auto_accept_max_price: maxPrice === "" ? null : Number(maxPrice),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMsg(`Error: ${json.error ?? res.statusText}`);
        return;
      }
      if (nextAuto !== undefined) setAuto(nextAuto);
      setMsg("Saved.");
      router.refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "unknown error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <button
          onClick={applyNow}
          disabled={busy}
          className="rounded-md border border-navy-700 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-navy-700 hover:bg-navy-700 hover:text-cream-50 disabled:opacity-50"
          title={`Apply suggested prices for next ${horizon} days`}
        >
          {busy ? "…" : "Apply"}
        </button>
        <label className="flex cursor-pointer items-center gap-1 text-[10px] uppercase tracking-wider text-navy-600">
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => saveSettings(e.target.checked)}
            disabled={busy}
            className="h-3 w-3"
          />
          Auto
        </label>
        <button
          onClick={() => setShowConfig((s) => !s)}
          className="text-[10px] uppercase tracking-wider text-navy-500 hover:text-navy-800"
        >
          {showConfig ? "Hide" : "Config"}
        </button>
      </div>
      {showConfig && (
        <div className="mt-1 flex flex-col gap-1 rounded border border-cream-300 bg-cream-50 p-2 text-[10px]">
          <Field label={`Deviation cap: ±${deviation}%`}>
            <input
              type="range"
              min={5}
              max={100}
              step={5}
              value={deviation}
              onChange={(e) => setDeviation(Number(e.target.value))}
            />
          </Field>
          <Field label={`Horizon: ${horizon} days`}>
            <input
              type="range"
              min={7}
              max={90}
              step={7}
              value={horizon}
              onChange={(e) => setHorizon(Number(e.target.value))}
            />
          </Field>
          <Field label="Min $">
            <input
              type="number"
              value={minPrice}
              onChange={(e) =>
                setMinPrice(e.target.value === "" ? "" : Number(e.target.value))
              }
              className="w-16 rounded border border-cream-300 px-1 py-0.5 text-right"
            />
          </Field>
          <Field label="Max $">
            <input
              type="number"
              value={maxPrice}
              onChange={(e) =>
                setMaxPrice(e.target.value === "" ? "" : Number(e.target.value))
              }
              className="w-16 rounded border border-cream-300 px-1 py-0.5 text-right"
            />
          </Field>
          <button
            onClick={() => saveSettings()}
            disabled={busy}
            className="mt-1 rounded bg-navy-700 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-cream-50 hover:bg-navy-800 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      )}
      {msg && <p className="max-w-[200px] text-right text-[9px] text-navy-500">{msg}</p>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-2 text-navy-600">
      <span>{label}</span>
      {children}
    </label>
  );
}
