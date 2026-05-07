"use client";

import { useState } from "react";

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
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function handleClick() {
    if (action.type === "navigate" && action.href) {
      window.location.href = action.href;
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
      <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-100 px-3 py-2 text-xs font-semibold text-emerald-800">
        ✓ {msg}
      </span>
    );
  }

  if (state === "error") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-red-100 px-3 py-2 text-xs font-semibold text-red-700">
        ✗ {msg}
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
