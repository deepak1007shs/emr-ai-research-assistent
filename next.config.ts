import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The reviewer's knowledge base is read from disk at runtime, so it has to be
  // traced into the server bundle explicitly.
  outputFileTracingIncludes: {
    "/api/**": [
      "./src/lib/protocol/knowledge/**/*.md",
      "./src/lib/analysis/*.md",
      "./src/lib/rules/*.md",
      "./src/lib/tables/*.md",
      "./src/lib/crf/*.md",
    ],
  },
};

export default nextConfig;
