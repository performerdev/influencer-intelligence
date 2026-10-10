import path from "node:path";

import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The pipeline packages are TypeScript sources shared with the CLI.
  transpilePackages: ["@ii/db", "@ii/brain-core", "@ii/stats"],
  outputFileTracingRoot: path.join(__dirname, "../.."),
  turbopack: { root: path.join(__dirname, "../..") },
  serverExternalPackages: ["postgres"],
};

export default config;
