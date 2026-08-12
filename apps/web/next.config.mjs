import path from "node:path";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  turbopack: {
    // Without this, Turbopack infers the workspace root by walking up from
    // this file looking for a lockfile — and stops at the *first* one it
    // finds, not necessarily this monorepo's own. A stray lockfile
    // anywhere above the checkout (e.g. an unrelated `pnpm-lock.yaml`
    // sitting directly in a contributor's home directory, one level above
    // wherever they cloned this repo) gets picked instead, silently
    // pointing every module path at the wrong root. The visible symptom
    // is unrelated-looking: "Could not find the module ... in the React
    // Client Manifest" on every route, because Turbopack's build graph and
    // Next's manifest disagree about where "the project" is. Pinning this
    // explicitly to the actual monorepo root removes the guesswork.
    root: path.join(import.meta.dirname, "../.."),
    rules: {
      "*.svg": {
        loaders: ["@svgr/webpack"],
        as: "*.js",
      },
    },
  },
  webpack: (config) => {
    config.module.rules.push({
      test: /\.svg$/,
      use: ["@svgr/webpack"],
    });
    return config;
  },
  async headers() {
    return [
      {
        // Routes this applies to
        source: "/api/(.*)",
        // Headers
        headers: [
          // Allow for specific domains to have access or * for all
          {
            key: "Access-Control-Allow-Origin",
            value: "*",
          },
          // Allows for specific methods accepted
          {
            key: "Access-Control-Allow-Methods",
            value: "GET, POST, PUT, PATCH, DELETE, OPTIONS",
          },
          // Allows for specific headers accepted (These are a few standard ones)
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type, Authorization",
          },
          {
            key: "Access-Control-Allow-Credentials",
            value: "true",
          },
        ],
      },
    ];
  },

  // transpilePackages: ["@karakeep/shared", "@karakeep/db", "@karakeep/trpc"],

  /** We already do linting and typechecking as separate tasks in CI */
  typescript: { ignoreBuildErrors: true },

  allowedDevOrigins: process.env.ALLOWED_DEV_ORIGINS?.split(","),
};

export default withBundleAnalyzer(nextConfig);
