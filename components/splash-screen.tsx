"use client";

import { useEffect, useState } from "react";

import { BrandMark } from "@/components/brand-mark";
import { MagneticFieldBackground } from "@/components/magnetic-field-background";

const SESSION_KEY = "bd_splash_shown_v1";
const HOLD_MS = 1400; // how long the brand sits on screen
const FADE_MS = 520; // exit fade duration (must match CSS animation below)

/**
 * SplashScreen — shows once per session, then auto-dismisses with a fade.
 *
 * Sits above everything else (z-50). After it fades it returns null, so
 * once dismissed it has zero render cost.
 *
 * Honors prefers-reduced-motion: skips the splash entirely if set.
 */
export function SplashScreen() {
  const [phase, setPhase] = useState<"hidden" | "visible" | "leaving">(
    "hidden",
  );

  useEffect(() => {
    // Skip if we've already shown this session.
    let seen = false;
    try {
      seen = sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      // Safari private mode / storage disabled — show every time, harmless.
    }
    if (seen) return;

    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // ignore
    }

    if (reducedMotion) {
      // Skip the animation entirely.
      return;
    }

    setPhase("visible");
    const exitTimer = window.setTimeout(() => setPhase("leaving"), HOLD_MS);
    const offTimer = window.setTimeout(
      () => setPhase("hidden"),
      HOLD_MS + FADE_MS,
    );

    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(offTimer);
    };
  }, []);

  if (phase === "hidden") return null;

  return (
    <div
      aria-hidden="true"
      className={
        "fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-navy-950 text-cream-50" +
        (phase === "leaving" ? " splash-leaving" : " splash-entering")
      }
      style={{
        // Keep pointer events on while visible so it intercepts taps,
        // but disable them during the leaving fade so users can interact early.
        pointerEvents: phase === "leaving" ? "none" : "auto",
      }}
    >
      <MagneticFieldBackground tone="dark" />

      <div className="splash-content relative z-10 flex flex-col items-center gap-6">
        <BrandMark tone="light" size="lg" showWordmark={false} />
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-4xl font-light tracking-tight text-cream-50">
            Beyond Don
          </h1>
          <p className="text-xs font-medium uppercase tracking-[0.32em] text-gold-400">
            Operations Dashboard
          </p>
        </div>
        <div className="splash-bar h-px w-12 bg-gold-500" />
      </div>
    </div>
  );
}
