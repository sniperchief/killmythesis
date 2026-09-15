import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The thesis workspace moved from / to /thesis. Older handoff links (/?thesis=…&narrative=…)
  // are forwarded with their query string intact.
  async redirects() {
    return ["thesis", "narrative"].map((key) => ({
      source: "/",
      has: [{ type: "query" as const, key }],
      destination: "/thesis",
      permanent: false,
    }));
  },
};

export default nextConfig;
