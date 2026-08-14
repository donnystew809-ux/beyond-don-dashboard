"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type SuggestionAction = {
  type:
    | "apply_prices"
    | "toggle_auto_pricing"
    | "run_sync"
    | "apply_last_minute_discount"
    | "navigate";
  payload?: Record<string, unknown>;
  href?: string;
};

export function InitiateButton({
  action,
  onSuccess,
  disabled,
}: {
  action: SuggestionAction;
  onSuccess?: (msg: string) => void;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function handleClick() {
    if (action.type === "navigate" && action.href) {
      router.push(action.href); // client nav — keeps the app-shell feel
      return;
    }

    setState("loading");
    try {
      const res = await fetch("/api/suggestions/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: action.type, payload: action.payload ?? {} }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setState("done");
      setMsg(json.message ?? "Done!");
      onSuccess?.(json.message ?? "Done!");
    } catch (e) {
      setState("error");
      setMsg(e instanceof Error ? e.message : "Error");
    }
  }

  if (state === "done") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-300">
        ✓ {msg}
      </span>
    );
  }

  if (state === "error") {
    // Keep the button usable so the user can retry without a reload.
    return (
      <span className="inline-flex items-center gap-2">
        <span className="rounded-md bg-red-500/15 px-2 py-1 text-[11px] font-medium text-red-300">
          ✗ {msg}
        </span>
        <button
          onClick={handleClick}
          className="rounded-md border border-navy-700/50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-cream-100 hover:bg-navy-800"
        >
          Retry
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={disabled || state === "loading"}
      className="inline-flex items-center gap-1.5 rounded-md bg-gold-gradient px-3 py-2 text-xs font-bold uppercase tracking-wider text-navy-950 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition"
    >
      {state === "loading" ? (
        <>
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-navy-700 border-t-transparent" />
          Working…
        </>
      ) : (
        <>⚡ Initiate</>
      )}
    </button>
  );
}
