import type { NextConfig } from "next";

const e2eDist = process.env.HIKARI_E2E_DIST === "1";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  // Keep repository-owned agent instructions unchanged during local development.
  agentRules: false,
  poweredByHeader: false,
  ...(e2eDist ? {
    distDir: ".next-e2e",
    typescript: { tsconfigPath: "tsconfig.e2e.json" },
  } : {}),
};

export default nextConfig;
