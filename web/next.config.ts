import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { resolve } from "node:path";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // The verifier is imported as TypeScript source from ts/verifier, so the
  // hosted pages run the same modules the offline pages and the test suite do.
  transpilePackages: ["canton-solvency-verifier"],
  // The verifier is a sibling package reached through a file: symlink, so the
  // bundler's root is the repository, not web/.
  turbopack: { root: resolve(import.meta.dirname, "..") },
  outputFileTracingRoot: resolve(import.meta.dirname, ".."),
  output: "standalone",
  serverExternalPackages: ["@prisma/client", "nodemailer"],
  experimental: {
    serverActions: { bodySizeLimit: "64mb" },
  },
};

export default withNextIntl(nextConfig);
