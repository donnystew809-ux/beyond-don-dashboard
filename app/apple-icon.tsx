import { ImageResponse } from "next/og";

/**
 * Apple touch icon — what iOS uses for the home-screen tile when a user
 * adds the dashboard to their home screen via Share → Add to Home Screen.
 * iOS doesn't support SVG for apple-touch-icon, so we render the same
 * key/key-tile design to a PNG via next/og.
 *
 * 180×180 is Apple's recommended size; iOS scales as needed.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "linear-gradient(180deg, #1a3263 0%, #0a1e3f 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg
          width="135"
          height="135"
          viewBox="0 0 64 64"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
        >
          <defs>
            <linearGradient
              id="g"
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
          </defs>
          {/* Bow: gold ring via even-odd fill */}
          <path
            d="M32 12 a10 10 0 1 1 0 20 a10 10 0 1 1 0 -20 z M32 18.5 a3.5 3.5 0 1 0 0 7 a3.5 3.5 0 1 0 0 -7 z"
            fill="url(#g)"
            fillRule="evenodd"
          />
          {/* Shaft */}
          <rect x="30.5" y="32" width="3" height="18" fill="url(#g)" />
          {/* Teeth */}
          <rect x="33.5" y="42" width="6" height="2.5" fill="url(#g)" />
          <rect x="33.5" y="47" width="4" height="2.5" fill="url(#g)" />
          {/* Cream chevron stamp */}
          <path d="M29 22 L32 19 L35 22 L32 25 Z" fill="#f5f1e8" />
        </svg>
      </div>
    ),
    size,
  );
}
