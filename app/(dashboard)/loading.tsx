// Instant loading skeleton for every dashboard route.
//
// Because all dashboard pages are server-rendered per-request
// (force-dynamic + cookie auth), a client navigation used to show NOTHING
// until the server finished — reading as lag. This file renders in the very
// next frame after a nav click: a branded shimmer skeleton in the dark-glass
// aesthetic, swapped for the real page as it streams in. Paired with the
// route progress bar + the template.tsx fade for a click → shimmer → fade-in
// sequence that always feels responsive.

export default function DashboardLoading() {
  return (
    <div className="animate-pulse-subtle" aria-busy="true" aria-live="polite">
      {/* Title block */}
      <div className="mb-8">
        <div className="skeleton h-7 w-48 rounded-md" />
        <div className="skeleton mt-3 h-3.5 w-72 max-w-full rounded" />
      </div>

      {/* Stat row */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-navy-700/40 bg-navy-900/60 p-4 backdrop-blur-sm"
          >
            <div className="skeleton h-2.5 w-20 rounded" />
            <div className="skeleton mt-3 h-6 w-16 rounded-md" />
          </div>
        ))}
      </div>

      {/* Content cards */}
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-navy-700/40 bg-navy-900/60 p-5 backdrop-blur-sm"
          >
            <div className="skeleton h-4 w-36 rounded" />
            <div className="mt-4 space-y-3">
              <div className="skeleton h-3 w-full rounded" />
              <div className="skeleton h-3 w-5/6 rounded" />
              <div className="skeleton h-3 w-4/6 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
