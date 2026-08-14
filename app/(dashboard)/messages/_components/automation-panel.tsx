"use client";

// Automation panel — the pilot's controls for the messaging pipeline.
// Shows pipeline status and gives the admin the big red switch.
// Kill-switch ON = pipeline still ingests + drafts, but nothing auto-sends.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function AutomationPanel({
  isAdmin,
  killSwitchOn,
  autoSendCount,
  propertyCount,
}: {
  isAdmin: boolean;
  killSwitchOn: boolean;
  autoSendCount: number;
  propertyCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleKillSwitch() {
    if (busy) return; // no double-fire on the safety switch
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/messages/automation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "kill_switch", enabled: !killSwitchOn }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setError(j?.error ?? res.statusText ?? "Failed to update");
        return;
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update — check connection");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`rounded-lg border p-4 backdrop-blur-sm ${
        killSwitchOn
          ? "border-red-500/50 bg-red-500/10"
          : "border-navy-700/40 bg-navy-900/60"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-cream-200/70">
            Auto-pilot
          </div>
          <div className="mt-1 text-sm text-cream-50">
            {killSwitchOn ? (
              <span className="font-semibold text-red-300">
                HALTED — kill-switch is on. Drafting continues, nothing sends.
              </span>
            ) : (
              <>
                Auto-send live on{" "}
                <span className="font-semibold text-gold-300">
                  {autoSendCount} of {propertyCount}
                </span>{" "}
                properties · routine replies only · everything else queues for review
              </>
            )}
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={toggleKillSwitch}
            disabled={busy || pending}
            className={`rounded-md px-4 py-2 text-xs font-semibold uppercase tracking-wider transition disabled:opacity-50 ${
              killSwitchOn
                ? "bg-gold-gradient text-navy-950 hover:brightness-110"
                : "border border-red-500/50 text-red-300 hover:bg-red-500/15"
            }`}
          >
            {busy || pending ? "…" : killSwitchOn ? "Resume auto-send" : "Halt all sends"}
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
    </div>
  );
}
