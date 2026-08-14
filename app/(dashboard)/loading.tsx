// Instant-navigation skeleton.
//
// This is the Next.js loading boundary for the dashboard segment. Its job is
// purely perceptual: the instant a nav tab is tapped, Next swaps the page
// content for this skeleton while the server render (auth + queries) streams
// in behind it. Without it, the PREVIOUS page stays frozen on screen for the
// full server round-trip (~0.5–1s), which is the "1–2 second delay" — the app
// looks like it ignored the tap.
//
// It also gives dynamic routes a prefetchable boundary: in production, <Link>
// prefetches "layout → first loading boundary", so the shell for a tab is
// already warm before the tap.
//
// Deliberately a PURE server component with zero client imports and no shell
// chrome (the layout keeps rendering the header/sidebar/bottom-nav around it).
// A previous root-level loading.tsx broke page hydration; this one is kept
// minimal and is verified against a production build before shipping.

function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-cream-100/10 ${className}`} />;
}

function CardSkeleton() {
  return (
    <div className="rounded-xl border border-navy-700/40 bg-navy-900/40 p-4">
      <Bar className="h-4 w-1/3" />
      <Bar className="mt-3 h-8 w-2/3" />
      <Bar className="mt-4 h-3 w-full" />
      <Bar className="mt-2 h-3 w-5/6" />
    </div>
  );
}

export default function DashboardLoading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="mx-auto max-w-5xl">
      {/* Page title */}
      <Bar className="h-7 w-48" />
      <Bar className="mt-2 h-3 w-64" />

      {/* Card grid */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    </div>
  );
}
