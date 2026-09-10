import { describe, expect, it } from "vitest";

import { checkConfig } from "./config-check";

const good = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://canton:pw@db:5432/canton",
  AUTH_SECRET: "x".repeat(48),
  AUTH_URL: "https://assurance.example.com",
  SERVICE_URL: "http://service:8790",
  SERVICE_TOKEN: "t".repeat(40),
  EMAIL_SERVER: "smtp://user:pass@smtp.example.com:587",
  EMAIL_FROM: "Canton Assurance <no-reply@example.com>",
  SIMULATOR_URL: "http://simulator:8787",
};

describe("checkConfig", () => {
  it("accepts a complete production configuration", () => {
    expect(checkConfig(good)).toEqual({ errors: [], warnings: [] });
  });

  it("names every missing or malformed value", () => {
    const { errors } = checkConfig({ NODE_ENV: "production" });
    expect(errors.join("\n")).toMatch(/DATABASE_URL/);
    expect(errors.join("\n")).toMatch(/AUTH_SECRET/);
    expect(errors.join("\n")).toMatch(/SERVICE_URL/);
    expect(errors.join("\n")).toMatch(/SERVICE_TOKEN/);
    expect(errors.join("\n")).toMatch(/EMAIL_SERVER is not set, so nobody can sign in/);
    expect(checkConfig({ ...good, AUTH_URL: "not a url" }).errors.join()).toMatch(/AUTH_URL is not a URL/);
    expect(checkConfig({ ...good, EMAIL_SERVER: "http://x" }).errors.join()).toMatch(/smtp:\/\//);
    expect(checkConfig({ ...good, AUTH_SECRET: "short" }).errors.join()).toMatch(/shorter than 32/);
    expect(checkConfig({ ...good, AUTH_SECRET: "change-me-change-me-change-me-change-me-1234" }).errors.join()).toMatch(/placeholder/);
  });

  it("allows sign-in links in the log when asked, with a warning", () => {
    const r = checkConfig({ ...good, EMAIL_SERVER: undefined, MAGIC_LINK_LOG: "1" });
    expect(r.errors).toEqual([]);
    expect(r.warnings.join()).toMatch(/printed to the container log/);
  });

  it("is lenient outside production", () => {
    const r = checkConfig({ ...good, NODE_ENV: "development", EMAIL_SERVER: undefined, AUTH_SECRET: "change-me-change-me-change-me-change-me-1234" });
    expect(r.errors).toEqual([]);
  });

  it("warns about plain http in production and a missing simulator", () => {
    const r = checkConfig({ ...good, AUTH_URL: "http://assurance.example.com", SIMULATOR_URL: undefined });
    expect(r.errors).toEqual([]);
    expect(r.warnings.join("\n")).toMatch(/http:\/\/ in production/);
    expect(r.warnings.join("\n")).toMatch(/SIMULATOR_URL is not set/);
  });
});
