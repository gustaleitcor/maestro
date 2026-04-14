import type { NextConfig } from "next";

const basePath = process.env.BASE_PATH?.replace(/\/$/, "") ?? "";

const nextConfig: NextConfig = {
  ...(basePath
    ? {
        basePath,
      }
    : {}),
};

export default nextConfig;
