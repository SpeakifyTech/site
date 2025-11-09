// next.config.ts
import type { NextConfig } from "next";

// Enable getCloudflareContext() during `next dev`
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
  // Keep Prisma out of the Worker bundle (works with @prisma/client/edge, too)
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
};

export default nextConfig;