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
};

export default nextConfig;
