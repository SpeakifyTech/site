import type { NextConfig } from "next";
import { builtinModules } from "module"; // gives core Node modules

// create dynamic alias map for all node: imports
const nodeAliases = Object.fromEntries(
  builtinModules.map((m) => [`node:${m}`, m])
);

const nextConfig: NextConfig = {
  webpack: (config) => {
    // ensure alias object exists
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      ...nodeAliases,
    };
    return config;
  },
};

export default nextConfig;

// added by create cloudflare to enable calling `getCloudflareContext()` in `next dev`
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
