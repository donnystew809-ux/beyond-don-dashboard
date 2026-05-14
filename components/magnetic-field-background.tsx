"use client";

import { useEffect, useRef } from "react";

/**
 * MagneticFieldBackground — animated canvas backdrop.
 *
 * 300 nodes drift through 7 honeycomb attractor zones, connected by
 * proximity lines. Spatial grid keeps the per-frame neighbor check O(n).
 *
 * Ported from magnetic-300-7.html and re-themed for the Beyond Don
 * palette. Two tones:
 *   - "dark"  → light blue + gold on deep navy (login / splash)
 *   - "light" → navy + gold on cream (dashboard surfaces)
 *
 * Honors `prefers-reduced-motion: reduce` by rendering a single static
 * frame and skipping the rAF loop.
 *
 * Drops node count on small screens (<768px) for battery / perf.
 */
export function MagneticFieldBackground({
  tone = "dark",
  className,
}: {
  tone?: "dark" | "light";
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    let W = 0;
    let H = 0;
    let rafId = 0;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    function resize() {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas!.width = W * dpr;
      canvas!.height = H * dpr;
      canvas!.style.width = W + "px";
      canvas!.style.height = H + "px";
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();

    function hash(n: number) {
      return (Math.sin(n * 127.1 + 311.7) * 43758.5453) % 1;
    }
    function noise1D(x: number, seed: number) {
      const xi = Math.floor(x);
      const xf = x - xi;
      const a = hash(xi + seed * 13.7);
      const b = hash(xi + 1 + seed * 13.7);
      const t = xf * xf * (3 - 2 * xf);
      return (a * (1 - t) + b * t) * 2 - 1;
    }

    // ── palette ────────────────────────────────────────────────────────
    type Palette = {
      bgInner: string;
      bgOuter: string;
      linkBlue: (a: number) => string;
      linkGold: (a: number) => string;
      linkMixed: (a: number) => string;
      nodeRegularFill: string;
      nodeRegularShadow: string;
      goldHaloInner: string;
      goldHaloMid: string;
      goldHaloOuter: string;
      goldCore: string;
      goldPin: string;
      goldShadow: string;
    };

    const palettes: Record<"dark" | "light", Palette> = {
      dark: {
        bgInner: "#0a1230",
        bgOuter: "#04081a",
        linkBlue: (a) => `rgba(80, 130, 240, ${a * 0.6})`,
        linkGold: (a) => `rgba(212, 168, 87, ${a * 0.7})`,
        linkMixed: (a) => `rgba(150, 160, 200, ${a * 0.55})`,
        nodeRegularFill: "rgba(170, 200, 255, 0.95)",
        nodeRegularShadow: "#3a66e8",
        goldHaloInner: "rgba(240, 200, 110, 0.55)",
        goldHaloMid: "rgba(212, 168, 87, 0.18)",
        goldHaloOuter: "rgba(212, 168, 87, 0)",
        goldCore: "rgba(255, 230, 170, 1)",
        goldPin: "rgba(255, 245, 220, 1)",
        goldShadow: "#f4c870",
      },
      light: {
        // Subtle gradient over cream — the field is the accent, not the focus.
        bgInner: "#fbf9f3", // cream-50
        bgOuter: "#f5f1e8", // cream-100
        linkBlue: (a) => `rgba(26, 50, 99, ${a * 0.32})`, // navy-700 lines
        linkGold: (a) => `rgba(176, 140, 74, ${a * 0.55})`, // gold-600 lines
        linkMixed: (a) => `rgba(90, 124, 175, ${a * 0.28})`, // navy-400 lines
        nodeRegularFill: "rgba(26, 50, 99, 0.72)",
        nodeRegularShadow: "#294476",
        goldHaloInner: "rgba(212, 168, 87, 0.42)",
        goldHaloMid: "rgba(176, 140, 74, 0.14)",
        goldHaloOuter: "rgba(176, 140, 74, 0)",
        goldCore: "rgba(176, 140, 74, 0.95)",
        goldPin: "rgba(139, 110, 52, 1)",
        goldShadow: "#c9a96a",
      },
    };
    const P = palettes[tone];

    // ── nodes + attractors ────────────────────────────────────────────
    const COUNT = window.innerWidth < 768 ? 180 : 300;
    const MAX_DIST = 70;

    type Node = {
      hx: number;
      hy: number;
      x: number;
      y: number;
      driftSeedX: number;
      driftSeedY: number;
      driftAmp: number;
      driftSpeed: number;
      isGold: boolean;
    };
    const nodes: Node[] = [];

    type Attractor = {
      cellX: number;
      cellY: number;
      wanderX: number;
      wanderY: number;
      seedX: number;
      seedY: number;
      x: number;
      y: number;
    };
    const attractors: Attractor[] = [
      { cellX: 0.18, cellY: 0.20, wanderX: 0.10, wanderY: 0.12, seedX: 10,  seedY: 20,  x: 0, y: 0 },
      { cellX: 0.50, cellY: 0.20, wanderX: 0.10, wanderY: 0.12, seedX: 30,  seedY: 40,  x: 0, y: 0 },
      { cellX: 0.82, cellY: 0.20, wanderX: 0.10, wanderY: 0.12, seedX: 50,  seedY: 60,  x: 0, y: 0 },
      { cellX: 0.50, cellY: 0.50, wanderX: 0.12, wanderY: 0.10, seedX: 130, seedY: 140, x: 0, y: 0 },
      { cellX: 0.18, cellY: 0.78, wanderX: 0.10, wanderY: 0.14, seedX: 70,  seedY: 80,  x: 0, y: 0 },
      { cellX: 0.50, cellY: 0.78, wanderX: 0.10, wanderY: 0.14, seedX: 90,  seedY: 100, x: 0, y: 0 },
      { cellX: 0.82, cellY: 0.78, wanderX: 0.10, wanderY: 0.14, seedX: 110, seedY: 120, x: 0, y: 0 },
    ];

    function initNodes() {
      nodes.length = 0;
      for (let i = 0; i < COUNT; i++) {
        nodes.push({
          hx: Math.random() * W,
          hy: Math.random() * H,
          x: 0,
          y: 0,
          driftSeedX: Math.random() * 1000,
          driftSeedY: Math.random() * 1000,
          driftAmp: 8 + Math.random() * 14,
          driftSpeed: 0.15 + Math.random() * 0.25,
          isGold: Math.random() < 0.12,
        });
      }
    }
    initNodes();

    function onResize() {
      resize();
      initNodes();
    }
    window.addEventListener("resize", onResize);

    // ── render ────────────────────────────────────────────────────────
    let t = 0;

    function drawFrame() {
      const c = ctx!;
      // background
      const bgGrad = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H));
      bgGrad.addColorStop(0, P.bgInner);
      bgGrad.addColorStop(1, P.bgOuter);
      c.fillStyle = bgGrad;
      c.fillRect(0, 0, W, H);

      // attractors
      for (const a of attractors) {
        a.x = W * (a.cellX + noise1D(t * 0.35, a.seedX) * a.wanderX);
        a.y = H * (a.cellY + noise1D(t * 0.35, a.seedY) * a.wanderY);
      }

      // nodes
      for (const n of nodes) {
        const idleX = noise1D(t * n.driftSpeed, n.driftSeedX) * n.driftAmp;
        const idleY = noise1D(t * n.driftSpeed, n.driftSeedY) * n.driftAmp;
        let pullX = 0;
        let pullY = 0;
        for (const a of attractors) {
          const ddx = a.x - n.hx;
          const ddy = a.y - n.hy;
          const d = Math.sqrt(ddx * ddx + ddy * ddy) + 0.001;
          const pull = 20 / (1 + d / 55);
          pullX += (ddx / d) * pull;
          pullY += (ddy / d) * pull;
        }
        n.x = n.hx + idleX + pullX;
        n.y = n.hy + idleY + pullY;
      }

      // spatial-grid neighbor lookup
      const cellSize = MAX_DIST;
      const cols = Math.ceil(W / cellSize) + 1;
      const rows = Math.ceil(H / cellSize) + 1;
      const grid: number[][] = new Array(cols * rows);
      for (let i = 0; i < grid.length; i++) grid[i] = [];
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const cx = Math.max(0, Math.min(cols - 1, Math.floor(n.x / cellSize)));
        const cy = Math.max(0, Math.min(rows - 1, Math.floor(n.y / cellSize)));
        grid[cy * cols + cx].push(i);
      }

      c.lineWidth = 0.8;
      const maxD2 = MAX_DIST * MAX_DIST;
      for (let cy = 0; cy < rows; cy++) {
        for (let cx = 0; cx < cols; cx++) {
          const bucket = grid[cy * cols + cx];
          const neighbors: (number[] | null)[] = [
            bucket,
            cx + 1 < cols ? grid[cy * cols + cx + 1] : null,
            cy + 1 < rows ? grid[(cy + 1) * cols + cx] : null,
            cx + 1 < cols && cy + 1 < rows ? grid[(cy + 1) * cols + cx + 1] : null,
            cx - 1 >= 0 && cy + 1 < rows ? grid[(cy + 1) * cols + cx - 1] : null,
          ];
          for (let k = 0; k < bucket.length; k++) {
            const i = bucket[k];
            const ni = nodes[i];
            for (let nb = 0; nb < neighbors.length; nb++) {
              const list = neighbors[nb];
              if (!list) continue;
              const startIdx = nb === 0 ? k + 1 : 0;
              for (let m = startIdx; m < list.length; m++) {
                const j = list[m];
                const nj = nodes[j];
                const dx = ni.x - nj.x;
                const dy = ni.y - nj.y;
                const d2 = dx * dx + dy * dy;
                if (d2 < maxD2) {
                  const a = 1 - Math.sqrt(d2) / MAX_DIST;
                  if (ni.isGold && nj.isGold) {
                    c.strokeStyle = P.linkGold(a);
                  } else if (ni.isGold || nj.isGold) {
                    c.strokeStyle = P.linkMixed(a);
                  } else {
                    c.strokeStyle = P.linkBlue(a);
                  }
                  c.beginPath();
                  c.moveTo(ni.x, ni.y);
                  c.lineTo(nj.x, nj.y);
                  c.stroke();
                }
              }
            }
          }
        }
      }

      // regular nodes
      c.shadowColor = P.nodeRegularShadow;
      c.shadowBlur = 6;
      c.fillStyle = P.nodeRegularFill;
      for (const n of nodes) {
        if (n.isGold) continue;
        c.beginPath();
        c.arc(n.x, n.y, 1.4, 0, Math.PI * 2);
        c.fill();
      }

      // gold nodes (multi-layer glow)
      for (const n of nodes) {
        if (!n.isGold) continue;
        const halo = c.createRadialGradient(n.x, n.y, 0, n.x, n.y, 14);
        halo.addColorStop(0, P.goldHaloInner);
        halo.addColorStop(0.5, P.goldHaloMid);
        halo.addColorStop(1, P.goldHaloOuter);
        c.fillStyle = halo;
        c.beginPath();
        c.arc(n.x, n.y, 14, 0, Math.PI * 2);
        c.fill();

        c.shadowColor = P.goldShadow;
        c.shadowBlur = 18;
        c.fillStyle = P.goldCore;
        c.beginPath();
        c.arc(n.x, n.y, 2.2, 0, Math.PI * 2);
        c.fill();

        c.shadowBlur = 0;
        c.fillStyle = P.goldPin;
        c.beginPath();
        c.arc(n.x, n.y, 0.9, 0, Math.PI * 2);
        c.fill();
      }
      c.shadowBlur = 0;
    }

    function loop() {
      t += 0.014;
      drawFrame();
      rafId = requestAnimationFrame(loop);
    }

    if (reducedMotion) {
      // One static frame, no rAF.
      t = 5;
      drawFrame();
    } else {
      rafId = requestAnimationFrame(loop);
    }

    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(rafId);
    };
  }, [tone]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={
        "pointer-events-none fixed inset-0 z-0 h-full w-full" +
        (className ? " " + className : "")
      }
    />
  );
}
