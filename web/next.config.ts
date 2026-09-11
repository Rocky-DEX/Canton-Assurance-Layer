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
  // Defaults a self-hoster gets without a reverse proxy in front. The CSP
  // allows inline script and style because Next's own bootstrap and the
  // self-contained offline verifier page served at /verify need them; it
  // still forbids every third-party origin, framing, and form posts
  // elsewhere. HSTS is ignored by browsers over plain http, so it is safe to
  // send unconditionally.
  async headers() {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; ");
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
