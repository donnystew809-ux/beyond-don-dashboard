import { cn } from "@/lib/utils";

/**
 * KeyIcon — BEYOND DON LLC brand mark.
 *
 * A skeleton-key silhouette in the brand's gold gradient, with a navy
 * chevron stamp inside the bow (echoing the gold chevrons on the business
 * card). Vector-based, so it stays sharp at any size and never 404s the
 * way a PNG can.
 *
 * Color story:
 *   - tone="dark"  → gold key + navy chevron stamp. Use on cream / light
 *     surfaces where both colors read well.
 *   - tone="light" → gold key + cream chevron stamp. Use on navy / dark
 *     surfaces where navy would disappear.
 *
 * Geometry is laid out on a 64×64 grid:
 *   bow: r=13 ring centered at (32, 20), with a 5.5 inner cutout
 *   shaft: 4×22 from y=33 down to y=55
 *   teeth: 8×3.5 ward + 5×3.5 ward on the right side of the shaft
 */
export function KeyIcon({
  tone = "dark",
  size = 36,
  className,
}: {
  tone?: "dark" | "light";
  size?: number;
  className?: string;
}) {
  const chevron = tone === "light" ? "#f5f1e8" /* cream-100 */ : "#0f2350" /* navy-800 */;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      <defs>
        <linearGradient
          id="bd-key-gold"
          x1="6"
          y1="6"
          x2="58"
          y2="58"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#E5C77E" />
          <stop offset="50%" stopColor="#C9A96A" />
          <stop offset="100%" stopColor="#8B6E34" />
        </linearGradient>
        <mask id="bd-key-bow-mask">
          <rect width="64" height="64" fill="white" />
          <circle cx="32" cy="20" r="5.5" fill="black" />
        </mask>
      </defs>

      {/* Bow — gold ring (full circle with center cut out by the mask) */}
      <circle
        cx="32"
        cy="20"
        r="13"
        fill="url(#bd-key-gold)"
        mask="url(#bd-key-bow-mask)"
      />

      {/* Shaft */}
      <rect x="30" y="33" width="4" height="22" fill="url(#bd-key-gold)" />

      {/* Teeth (warding cuts on the right) */}
      <rect x="34" y="44" width="8" height="3.5" fill="url(#bd-key-gold)" />
      <rect x="34" y="50" width="5" height="3.5" fill="url(#bd-key-gold)" />

      {/* Navy/cream chevron stamp inside the bow — brand signature */}
      <path
        d="M28.5 20 L32 16.5 L35.5 20 L32 23.5 Z"
        fill={chevron}
      />
    </svg>
  );
}
