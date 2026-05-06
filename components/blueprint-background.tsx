"use client";

import { useEffect, useRef } from "react";

/**
 * BlueprintBackground — mobile-only (md:hidden)
 *
 * Renders three layered CSS grid overlays on the cream background,
 * giving a faint architectural-blueprint feel. On devices with a
 * gyroscope (iOS / Android) the layers shift at different speeds for
 * a subtle parallax effect. On desktop / no-gyro it falls back to a
 * gentle CSS drift animation.
 *
 * Layer 1 (slowest, 0.28×)  — large 100 px grid, 5 % navy opacity
 * Layer 2 (mid,    0.55×)   — medium 20 px grid, 3 % navy opacity
 * Layer 3 (fastest, 0.90×)  — tiny gold dot accent, 8 % opacity
 */

export function BlueprintBackground() {
  const layer1 = useRef<HTMLDivElement>(null);
  const layer2 = useRef<HTMLDivElement>(null);
  const layer3 = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let rafId = 0;

    // Lerp targets
    let tx1 = 0, ty1 = 0;
    let tx2 = 0, ty2 = 0;
    let tx3 = 0, ty3 = 0;

    // Smoothed positions
    let sx1 = 0, sy1 = 0;
    let sx2 = 0, sy2 = 0;
    let sx3 = 0, sy3 = 0;

    const LERP = 0.06; // smoothing factor (lower = lazier)
    const MAX_SHIFT = 18; // max pixel travel at full tilt

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    function onOrientation(e: DeviceOrientationEvent) {
      // beta = front/back tilt (-180..180), gamma = left/right (-90..90)
      const bNorm = Math.max(-45, Math.min(45, e.beta ?? 0)) / 45;
      const gNorm = Math.max(-45, Math.min(45, e.gamma ?? 0)) / 45;

      tx1 = gNorm * MAX_SHIFT * 0.28;
      ty1 = bNorm * MAX_SHIFT * 0.28;
      tx2 = gNorm * MAX_SHIFT * 0.55;
      ty2 = bNorm * MAX_SHIFT * 0.55;
      tx3 = gNorm * MAX_SHIFT * 0.90;
      ty3 = bNorm * MAX_SHIFT * 0.90;
    }

    function animate() {
      sx1 = lerp(sx1, tx1, LERP);
      sy1 = lerp(sy1, ty1, LERP);
      sx2 = lerp(sx2, tx2, LERP);
      sy2 = lerp(sy2, ty2, LERP);
      sx3 = lerp(sx3, tx3, LERP);
      sy3 = lerp(sy3, ty3, LERP);

      if (layer1.current) layer1.current.style.transform = `translate(${sx1}px, ${sy1}px)`;
      if (layer2.current) layer2.current.style.transform = `translate(${sx2}px, ${sy2}px)`;
      if (layer3.current) layer3.current.style.transform = `translate(${sx3}px, ${sy3}px)`;

      rafId = requestAnimationFrame(animate);
    }

    const hasGyro = typeof DeviceOrientationEvent !== "undefined";

    if (hasGyro) {
      // iOS 13+ requires permission
      const DOE = DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<string>;
      };
      if (typeof DOE.requestPermission === "function") {
        DOE.requestPermission()
          .then((state) => {
            if (state === "granted") {
              window.addEventListener("deviceorientation", onOrientation);
              rafId = requestAnimationFrame(animate);
            }
          })
          .catch(() => {/* silently fall back to CSS animation */});
      } else {
        window.addEventListener("deviceorientation", onOrientation);
        rafId = requestAnimationFrame(animate);
      }
    }

    return () => {
      window.removeEventListener("deviceorientation", onOrientation);
      cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden md:hidden"
      aria-hidden="true"
    >
      {/* Layer 1 — large grid (100 px), slowest parallax */}
      <div
        ref={layer1}
        className="blueprint-layer absolute inset-[-30px]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(10,31,68,0.045) 1px, transparent 1px),
            linear-gradient(90deg, rgba(10,31,68,0.045) 1px, transparent 1px)
          `,
          backgroundSize: "100px 100px",
          animationName: "blueprintDrift1",
        }}
      />

      {/* Layer 2 — fine grid (20 px), mid-speed parallax */}
      <div
        ref={layer2}
        className="blueprint-layer absolute inset-[-30px]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(10,31,68,0.028) 1px, transparent 1px),
            linear-gradient(90deg, rgba(10,31,68,0.028) 1px, transparent 1px)
          `,
          backgroundSize: "20px 20px",
          animationName: "blueprintDrift2",
        }}
      />

      {/* Layer 3 — gold accent dots, fastest parallax */}
      <div
        ref={layer3}
        className="blueprint-layer absolute inset-[-30px]"
        style={{
          backgroundImage: `radial-gradient(circle, rgba(201,169,106,0.10) 1.5px, transparent 1.5px)`,
          backgroundSize: "100px 100px",
          animationName: "blueprintDrift3",
        }}
      />

      {/* Subtle vignette so content reads cleanly over the grid */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 50%, transparent 40%, rgba(251,249,243,0.55) 100%)",
        }}
      />
    </div>
  );
}
