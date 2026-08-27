import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // PGlite resolves its WASM and Node filesystem assets relative to its own
  // package. Keep it external so Next does not rewrite those URL-based paths
  // when serving local API routes in development or production Node runtime.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
