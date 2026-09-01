import type { NextConfig } from "next";
import path from "node:path";

const scriptPolicy = process.env.NODE_ENV === "production"
  ? "script-src 'self' 'unsafe-inline'"
  : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  devIndicators: false,
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  transpilePackages: ["@ai-tool-workbench/contracts"],
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        {
          key: "Content-Security-Policy",
          value: [
            "default-src 'self'",
            "base-uri 'self'",
            "connect-src 'self'",
            "font-src 'self' data:",
            "form-action 'self'",
            "frame-ancestors 'none'",
            "img-src 'self' data: blob:",
            "object-src 'none'",
            scriptPolicy,
            "style-src 'self' 'unsafe-inline'",
          ].join("; "),
        },
        { key: "Referrer-Policy", value: "same-origin" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    }];
  },
  webpack(config) {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".js"],
      ".jsx": [".tsx", ".jsx"],
    };
    return config;
  },
  async rewrites() {
    return [{
      source: "/api/backend/:path*",
      destination: `${process.env.API_INTERNAL_URL ?? "http://127.0.0.1:3100"}/:path*`,
    }];
  },
};

export default nextConfig;
