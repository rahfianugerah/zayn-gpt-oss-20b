import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The chat is one client-side page, so it ships as static files and needs no Node server
  output: "export",
  reactCompiler: true,
};

export default nextConfig;
