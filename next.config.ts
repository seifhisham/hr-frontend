import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
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
