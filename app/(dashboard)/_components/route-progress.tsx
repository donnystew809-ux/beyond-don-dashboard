"use client";

// Slim gold route-progress bar. Starts trickling the moment any internal
// link is clicked (capture-phase listener — fires before React handlers),
// completes + fades when the pathname actually changes. Gives the "the app
// heard you" cue during server-rendered navigations. Dependency-free.

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

export function RouteProgress() {
  const pathname = usePathname();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const timers = useRef<number[]>([]);

  // Start on any internal-link click (or nav-button click marked data-nav).
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
        return;
      const el = (e.target as HTMLElement)?.closest?.("a[href], [data-nav]");
      if (!el) return;
      if (el instanceof HTMLAnchorElement) {
        const href = el.getAttribute("href") ?? "";
        if (!href.startsWith("/") || el.target === "_blank") return;
        // Same-page (or hash) clicks don't navigate.
        if (href === window.location.pathname) return;
      }
      setState("loading");
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // Complete when the route actually changes.
  useEffect(() => {
    setState((s) => (s === "loading" ? "done" : s));
    const t = window.setTimeout(() => setState("idle"), 260);
    timers.current.push(t);
    return () => timers.current.forEach(clearTimeout);
  }, [pathname]);

  // Safety: never trickle forever (e.g. click that didn't navigate).
  useEffect(() => {
    if (state !== "loading") return;
    const t = window.setTimeout(() => setState("idle"), 8000);
    return () => clearTimeout(t);
  }, [state]);

  if (state === "idle") return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[2px]"
    >
      <div
        className={`h-full origin-left bg-gradient-to-r from-gold-500 via-gold-400 to-gold-300 shadow-[0_0_8px_rgba(212,175,55,0.6)] ${
          state === "loading" ? "route-progress-trickle" : "route-progress-done"
        }`}
      />
    </div>
  );
}
