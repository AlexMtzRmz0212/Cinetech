import path from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  images: { unoptimized: true },
  // A stray package-lock.json in C:\Users\Alex made Next guess the wrong workspace root.
  turbopack: { root: path.resolve(__dirname) },
  experimental: { agentUpgrade: "security" },
};

export default config;
