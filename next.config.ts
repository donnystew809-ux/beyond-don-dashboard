import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the workspace root to silence the "multiple lockfiles" warning
    root: __dirname,
  },
};

export default nextConfig;
