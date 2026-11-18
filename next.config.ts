import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Keep the dev-only badge off the sidebar profile in the bottom-left corner.
  devIndicators: { position: "bottom-right" },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.HR_API_URL ?? "http://127.0.0.1:3002"}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
