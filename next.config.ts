import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Pin the workspace root so Turbopack ignores stray lockfiles elsewhere.
  turbopack: {
    root: import.meta.dirname,
  },
  // Native/binary deps that must stay external to the server bundle.
  serverExternalPackages: ["postgres", "bcryptjs"],
  experimental: {
    // Keep large binary sync payloads off the RSC path; they go through route handlers.
    serverActions: {
      bodySizeLimit: "1mb",
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
