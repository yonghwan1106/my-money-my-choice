import path from "node:path";
import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  turbopack: { root: path.resolve(__dirname) }, // C:\Users\user\package-lock.json 이 있어 필수
  poweredByHeader: false,
};
export default nextConfig;
