import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["@napi-rs/canvas", "pdf-parse", "pdfjs-dist"],
  turbopack: {
    root: process.cwd(),
  },
  async redirects() {
    // Short, shareable sign-in URL (clopen.2stack.com/login).
    return [{ source: "/login", destination: "/auth/login", permanent: false }];
  },
};

export default nextConfig;
