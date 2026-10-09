import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets a second server run from its own build directory, so the test suites
  // can start parallel instances without fighting over `.next` or disturbing
  // the dev server a developer already has running.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
