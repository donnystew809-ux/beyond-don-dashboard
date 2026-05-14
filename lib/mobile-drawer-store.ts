// Tiny module-level store for the mobile More-sheet's open state.
//
// Two components need to control the same boolean:
//   - MoreSheet (renders the bottom-sheet panel + does the slide-up animation)
//   - BottomNav (the "More" tab on the mobile bottom nav)
//
// We tried a window CustomEvent first but the listener wasn't reliably
// attached by the time users tapped More on first paint. A subscribe/
// publish store sidesteps the hydration race entirely — the producer can
// call `setOpen` before the consumer subscribes; the consumer just reads
// the current value when it mounts.
//
// No context provider needed (works across React trees), no external
// dependency.

import { useEffect, useState } from "react";

type Listener = (open: boolean) => void;

let currentOpen = false;
const listeners = new Set<Listener>();

export function setMobileDrawerOpen(next: boolean) {
  if (currentOpen === next) return;
  currentOpen = next;
  listeners.forEach((l) => l(next));
}

export function useMobileDrawer(): readonly [boolean, (next: boolean) => void] {
  const [open, setLocal] = useState(currentOpen);

  useEffect(() => {
    listeners.add(setLocal);
    // Sync once in case the store changed before we mounted.
    setLocal(currentOpen);
    return () => {
      listeners.delete(setLocal);
    };
  }, []);

  return [open, setMobileDrawerOpen] as const;
}
