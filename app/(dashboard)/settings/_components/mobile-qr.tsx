// Server component — generates QR code via qr-server.com API (no npm dep).
// Phone scans → opens dashboard → "Add to Home Screen" in Safari = native app.

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.VERCEL_PROJECT_PRODUCTION_URL ||
  "https://beyond-don-dashboard.vercel.app";

export function MobileQR() {
  const url = SITE_URL.startsWith("http") ? SITE_URL : `https://${SITE_URL}`;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&color=0a1f44&bgcolor=fbf9f3&data=${encodeURIComponent(url)}&format=png&margin=4`;

  return (
    <div className="grid gap-6 rounded-lg border border-navy-700/40 bg-navy-900/60 backdrop-blur-sm p-6 md:grid-cols-[220px_1fr]">
      <div className="flex flex-col items-center gap-3">
        <div className="rounded-md border border-navy-700/50 bg-navy-800/40 p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrSrc}
            alt="QR code to open Beyond Don dashboard"
            width={220}
            height={220}
            className="rounded"
          />
        </div>
        <a
          href={url}
          className="text-[10px] uppercase tracking-wider text-cream-200/60 hover:text-cream-50"
        >
          {url.replace(/^https?:\/\//, "")}
        </a>
      </div>
      <div className="space-y-3 text-sm text-cream-100">
        <h3 className="text-base font-semibold text-cream-50">
          Add to your iPhone home screen
        </h3>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>
            Open <strong>Camera</strong> on your iPhone, point at the QR code,
            tap the banner that pops up.
          </li>
          <li>
            <strong>Safari opens.</strong> Sign in with your magic link.
          </li>
          <li>
            Tap the <strong>Share</strong> icon (square + arrow) at the bottom.
          </li>
          <li>
            Scroll and tap <strong>Add to Home Screen</strong> →{" "}
            <strong>Add</strong>.
          </li>
        </ol>
        <p className="rounded-md bg-navy-800/40 p-3 text-xs leading-relaxed text-cream-200/80">
          The icon will look like a native app — full-screen, no Safari UI, gold
          + navy theme. Sign-in persists, so after the first magic link you
          won&apos;t need to log in again on that device.
        </p>
      </div>
    </div>
  );
}
