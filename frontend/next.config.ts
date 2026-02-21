import type { NextConfig } from "next";

const backendUrl = process.env.BACKEND_URL || "http://localhost:8000";

// Generate a build ID at build time so the client can detect stale caches
const buildId = process.env.NEXT_PUBLIC_BUILD_ID || Date.now().toString();
process.env.NEXT_PUBLIC_BUILD_ID = buildId;

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [
      {
        // Prevent browser from caching HTML pages — ensures fresh deploys load immediately
        source: "/((?!_next/static|_next/image|favicon.ico).*)",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Pragma", value: "no-cache" },
          { key: "Expires", value: "0" },
        ],
      },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [
        {
          // Proxy all API routes EXCEPT auth to FastAPI backend
          source: "/api/:path((?!auth).*)",
          destination: `${backendUrl}/api/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
