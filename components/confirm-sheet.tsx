"use client";

// In-app confirmation sheet — replaces every native confirm() so the app
// never pops a browser/system dialog (which shows the raw domain and breaks
// the native-app feel, especially in the installed PWA).
//
// Usage from any client component:
//   import { confirmSheet } from "@/components/confirm-sheet";
//   if (!(await confirmSheet({ title: "Delete this?", tone: "danger" }))) return;
//
// <ConfirmHost /> is mounted once in the dashboard layout. Module-level
// pub/sub (same idiom as lib/mobile-drawer-store) — no provider needed.
// Mobile: bottom sheet. Desktop: centered dialog. z-[70] sits above the
// bottom nav (40), MoreSheet (50) and RouteProgress (60).

import { useEffect, useState } from "react";

export type ConfirmOptions = {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** danger = red confirm (deletes); default = gold. */
  tone?: "default" | "danger";
};

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

// Store lives on globalThis so it stays a true singleton even if the
// bundler instantiates this module in more than one chunk (layout chunk vs
// page chunk) — otherwise confirmSheet() could publish into a copy of the
// store the mounted ConfirmHost never sees.
type Store = {
  current: Pending | null;
  listeners: Set<(p: Pending | null) => void>;
};
const store: Store = ((globalThis as any).__bd_confirm_store ??= {
  current: null,
  listeners: new Set(),
});

function publish(next: Pending | null) {
  store.current = next;
  store.listeners.forEach((l) => l(next));
}

/** Ask the user to confirm. Resolves false on cancel/backdrop/Escape. */
export function confirmSheet(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    // If something is already open, cancel it first (last caller wins).
    store.current?.resolve(false);
    publish({ ...opts, resolve });
  });
}

export function ConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(store.current);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const l = (p: Pending | null) => {
      setClosing(false);
      setPending(p);
    };
    store.listeners.add(l);
    l(store.current);
    return () => {
      store.listeners.delete(l);
    };
  }, []);

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") settle(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  function settle(ok: boolean) {
    if (!pending) return;
    pending.resolve(ok);
    setClosing(true);
    // Let the exit animation play before unmounting.
    window.setTimeout(() => publish(null), 160);
  }

  if (!pending) return null;

  const danger = pending.tone === "danger";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center"
      role="alertdialog"
      aria-modal="true"
      aria-label={pending.title}
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-navy-950/60 backdrop-blur-[2px] transition-opacity duration-150 ${
          closing ? "opacity-0" : "opacity-100"
        }`}
        onClick={() => settle(false)}
      />

      {/* Panel — bottom sheet on mobile, centered card on sm+ */}
      <div
        className={`relative w-full rounded-t-2xl border-t border-gold-500/25 bg-navy-900/95 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] backdrop-blur-md transition-all duration-200 ease-out sm:max-w-sm sm:rounded-2xl sm:border sm:border-navy-700/50 sm:pb-5 ${
          closing
            ? "translate-y-4 opacity-0 sm:translate-y-2"
            : "translate-y-0 opacity-100 confirm-enter"
        }`}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-cream-200/25 sm:hidden" />
        <h2 className="text-base font-semibold text-cream-50">{pending.title}</h2>
        {pending.body && (
          <p className="mt-2 text-sm leading-relaxed text-cream-200/75">{pending.body}</p>
        )}
        <div className="mt-5 flex gap-3">
          <button
            onClick={() => settle(false)}
            className="flex-1 rounded-md border border-navy-700/60 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-cream-100 transition hover:bg-navy-800/60 active:scale-[0.98]"
          >
            {pending.cancelLabel ?? "Cancel"}
          </button>
          <button
            onClick={() => settle(true)}
            autoFocus
            className={`flex-1 rounded-md px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition active:scale-[0.98] ${
              danger
                ? "bg-red-500/85 text-white hover:bg-red-500"
                : "bg-gold-gradient text-navy-950 hover:brightness-110"
            }`}
          >
            {pending.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
