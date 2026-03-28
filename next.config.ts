import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // -------------------------------------------------------------------------
  // Standalone output: bundles only the files needed to run the server.
  // This keeps Docker images lean — target <150MB.
  // The .next/standalone directory is a self-contained Node.js server.
  // -------------------------------------------------------------------------
  output: "standalone",

  // -------------------------------------------------------------------------
  // Streaming: disable nginx buffering for SSR streaming support.
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
