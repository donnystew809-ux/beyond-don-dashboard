"use client";

// PIN entry for an enrolled device. Deliberately looks like a phone lock
// screen: big targets, no keyboard needed, dots instead of characters.

import { useEffect, useState } from "react";
import { Delete, Fingerprint } from "lucide-react";

export function PinPad({
  length = 4,
  onComplete,
  onBiometric,
  showBiometric = false,
  error,
  busy,
  title,
  subtitle,
}: {
  length?: number;
  onComplete: (pin: string) => void;
  onBiometric?: () => void;
  showBiometric?: boolean;
  error?: string | null;
  busy?: boolean;
  title: string;
  subtitle?: string;
}) {
  const [pin, setPin] = useState("");

  // Fire as soon as the last digit lands, then clear so a failed attempt
  // leaves an empty pad rather than a stale one.
  useEffect(() => {
    if (pin.length === length) {
      onComplete(pin);
      const t = window.setTimeout(() => setPin(""), 250);
      return () => window.clearTimeout(t);
    }
  }, [pin, length, onComplete]);

  // Physical keyboard works too — desktop users should not have to mouse.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (busy) return;
      if (/^\d$/.test(e.key)) setPin((p) => (p.length < length ? p + e.key : p));
      else if (e.key === "Backspace") setPin((p) => p.slice(0, -1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, length]);

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

  return (
    <div className="w-full">
      <h1 className="text-center text-xl font-semibold text-cream-50">{title}</h1>
      {subtitle && (
        <p className="mt-2 text-center text-sm text-cream-200/60">{subtitle}</p>
      )}

      <div className="mt-7 flex justify-center gap-4" aria-live="polite">
        {Array.from({ length }).map((_, i) => (
          <span
            key={i}
            className={`h-3.5 w-3.5 rounded-full border transition-all duration-150 ${
              i < pin.length
                ? "border-gold-400 bg-gold-400 scale-110"
                : "border-cream-200/30 bg-transparent"
            }`}
          />
        ))}
      </div>

      <p className="mt-4 min-h-[1.25rem] text-center text-xs text-red-400">
        {error ?? ""}
      </p>

      <div className="mx-auto mt-4 grid max-w-[15rem] grid-cols-3 gap-3">
        {keys.map((k) => (
          <button
            key={k}
            type="button"
            disabled={busy}
            onClick={() => setPin((p) => (p.length < length ? p + k : p))}
            className="h-16 rounded-full border border-navy-700/50 bg-navy-900/50 text-xl font-medium text-cream-50 transition hover:border-gold-500/40 hover:bg-navy-800/60 active:scale-95 disabled:opacity-40"
          >
            {k}
          </button>
        ))}

        {showBiometric && onBiometric ? (
          <button
            type="button"
            disabled={busy}
            onClick={onBiometric}
            aria-label="Sign in with Face ID or fingerprint"
            className="flex h-16 items-center justify-center rounded-full text-gold-300 transition hover:bg-navy-800/50 active:scale-95 disabled:opacity-40"
          >
            <Fingerprint className="h-6 w-6" />
          </button>
        ) : (
          <span />
        )}

        <button
          type="button"
          disabled={busy}
          onClick={() => setPin((p) => (p.length < length ? p + "0" : p))}
          className="h-16 rounded-full border border-navy-700/50 bg-navy-900/50 text-xl font-medium text-cream-50 transition hover:border-gold-500/40 hover:bg-navy-800/60 active:scale-95 disabled:opacity-40"
        >
          0
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() => setPin((p) => p.slice(0, -1))}
          aria-label="Delete"
          className="flex h-16 items-center justify-center rounded-full text-cream-200/70 transition hover:bg-navy-800/50 active:scale-95 disabled:opacity-40"
        >
          <Delete className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
