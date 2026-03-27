import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // -------------------------------------------------------------------------
  // Standalone output: bundles only the files needed to run the server.
  // This keeps Docker images lean — target <150MB.
  // The .next/standalone directory is a self-contained Node.js server.
  // -------------------------------------------------------------------------
  output: "standalone",

  // -------------------------------------------------------------------------
  // Disable Next.js telemetry in production builds.
  // -------------------------------------------------------------------------
  // env var alternative: NEXT_TELEMETRY_DISABLED=1

  // -------------------------------------------------------------------------
  // Streaming: disable nginx buffering for SSR streaming support.
  // Pair this with `proxy_buffering off` in your nginx config, or use the
  // X-Accel-Buffering header approach below.
  // -------------------------------------------------------------------------
  async headers() {
    return [
      {
        source: "/:path*{/}?",
        headers: [
          {
            key: "X-Accel-Buffering",
            value: "no",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
