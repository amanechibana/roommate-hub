import type { NextConfig } from "next";

const config: NextConfig = {
  devIndicators: false,
  // The browser tests drive the dev server over 127.0.0.1, which Next blocks
  // as a cross-origin dev host by default. Development only.
  allowedDevOrigins: ["127.0.0.1"],
};
export default config;
