import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the workspace root to silence the "multiple lockfiles" warning
    root: __dirname,
  },
  experimental: {
    // Client-cache visited/prefetched pages so tab-switching feels native.
    // `dynamic: 30` keeps a dynamic page's payload for 30s → navigating back
    // to a recently-seen tab is instant with no server round-trip (30s-stale
    // data is fine for a dashboard that syncs hourly; mutations call
    // router.refresh() which busts the cache anyway). `static` (180s) covers
    // prefetched loading boundaries so the instant skeleton is always warm.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};

export default nextConfig;
