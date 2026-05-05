import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * BEYOND DON LLC brand mark — the key + wordmark.
 * `tone="dark"` is for use on cream/light backgrounds.
 * `tone="light"` is for use on navy backgrounds.
 */
export function BrandMark({
  tone = "dark",
  size = "md",
  showWordmark = true,
  className,
}: {
  tone?: "dark" | "light";
  size?: "sm" | "md" | "lg";
  showWordmark?: boolean;
  className?: string;
}) {
  const dim =
    size === "sm" ? 28 : size === "lg" ? 56 : 36;

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div
        className={cn(
          "relative shrink-0 overflow-hidden",
          tone === "light" && "[&>img]:invert",
        )}
        style={{ width: dim, height: dim }}
      >
        <Image
          src="/brand/logo.png"
          alt="BEYOND DON LLC"
          width={dim}
          height={dim}
          priority
          className="object-contain"
        />
      </div>
      {showWordmark && (
        <div className="flex flex-col leading-tight">
          <span
            className={cn(
              "text-[11px] font-semibold uppercase tracking-[0.18em]",
              tone === "light" ? "text-cream-100" : "text-navy-900",
            )}
          >
            Beyond Don
          </span>
          <span
            className={cn(
              "text-[9px] font-medium uppercase tracking-[0.22em]",
              tone === "light" ? "text-gold-400" : "text-gold-600",
            )}
          >
            LLC
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Small gold chevron motif from the business card —
 * decorative, used as a divider/accent.
 */
export function GoldChevron({
  size = 16,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M6 4l8 8-8 8"
        stroke="url(#gold-grad)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient id="gold-grad" x1="0" y1="0" x2="24" y2="24">
          <stop offset="0%" stopColor="#E5C77E" />
          <stop offset="50%" stopColor="#C9A96A" />
          <stop offset="100%" stopColor="#8B6E34" />
        </linearGradient>
      </defs>
    </svg>
  );
}
