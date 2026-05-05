"use client";

import { useState } from "react";

const SYNCS = [
  { id: "airbnb-ical", label: "Airbnb iCal" },
  { id: "pricelabs", label: "PriceLabs" },
  { id: "turno", label: "Turno" },
];

export function SyncControls() {
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, string>>({});

  async function runSync(id: string) {
    setRunning(id);
    setResults((r) => ({ ...r, [id]: "running…" }));
    try {
      const res = await fetch(`/api/sync/${id}`, { method: "POST" });
      const text = await res.text();
      setResults((r) => ({
        ...r,
        [id]: res.ok ? `ok · ${text}` : `error · ${text}`,
      }));
    } catch (err) {
      setResults((r) => ({
        ...r,
        [id]: `error · ${err instanceof Error ? err.message : "unknown"}`,
      }));
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="space-y-2">
      {SYNCS.map((s) => (
        <div
          key={s.id}
          className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-3"
        >
          <div>
            <div className="text-sm font-medium">{s.label}</div>
            {results[s.id] && (
              <div className="text-xs text-neutral-500">{results[s.id]}</div>
            )}
          </div>
          <button
            onClick={() => runSync(s.id)}
            disabled={running !== null}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:bg-neutral-50 disabled:opacity-50"
          >
            {running === s.id ? "Running…" : "Run sync"}
          </button>
        </div>
      ))}
    </div>
  );
}
