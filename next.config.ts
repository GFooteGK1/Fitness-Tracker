import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/api/meals/photo-pilot/canary': ['./app/lib/nutrition/fixtures/nutrition-canary-source.jpg'],
  },
};

export default withSerwist(nextConfig);
