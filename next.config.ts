import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["@napi-rs/canvas", "pdf-parse", "pdfjs-dist"],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
