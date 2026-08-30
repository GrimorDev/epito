import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The standalone output contains the minimal production server copied into
  // the final Docker image. vinext continues to use the same application code
  // for the existing Sites deployment.
  output: "standalone",
  typescript: {
    // Cloudflare-only adapters live outside the Next.js application and use a
    // separate runtime type system. The Docker build checks only app sources.
    tsconfigPath: "tsconfig.docker.json",
  },
  async headers() {
    const securityHeaders = [
      { key: "Content-Security-Policy", value: "base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self'" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), usb=()" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
    ];
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;
