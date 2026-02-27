import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@repo/contracts",
    "@repo/spec-engine",
    "@repo/renderer-react",
    "@repo/orchestrator",
    "@repo/integrations",
    "@repo/persistence",
    "@repo/client-core"
  ]
};

export default nextConfig;
