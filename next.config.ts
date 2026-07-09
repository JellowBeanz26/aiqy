import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Route handlers spawn `eve dev` child processes and proxy to them; they run on
  // the Node.js runtime (the default for route handlers).
  devIndicators: false,
};

export default nextConfig;
