import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Both console locales must carry exactly the same keys. A key missing from
 * one locale renders as the raw key path in that language, which nothing
 * else would catch until a reader saw it.
 */
function flatten(value: unknown, prefix = "", out: string[] = []): string[] {
  if (typeof value === "object" && value !== null) {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      flatten(v, prefix ? `${prefix}.${k}` : k, out);
    }
  } else {
    out.push(prefix);
  }
  return out;
}

function load(locale: string): string[] {
  const json = JSON.parse(readFileSync(new URL(`../../messages/${locale}.json`, import.meta.url), "utf8")) as unknown;
  return flatten(json).sort();
}

describe("message catalogs", () => {
  it("have the same keys in English and Simplified Chinese", () => {
    const en = load("en");
    const zh = load("zh-CN");
    expect(zh).toEqual(en);
    expect(en.length).toBeGreaterThan(500);
  });

  it("use the same {placeholders} in both locales", () => {
    const read = (locale: string) =>
      JSON.parse(readFileSync(new URL(`../../messages/${locale}.json`, import.meta.url), "utf8")) as unknown;
    const leaves = (value: unknown, prefix = "", out: Record<string, string> = {}): Record<string, string> => {
      if (typeof value === "object" && value !== null) {
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) leaves(v, prefix ? `${prefix}.${k}` : k, out);
      } else if (typeof value === "string") {
        out[prefix] = value;
      }
      return out;
    };
    const en = leaves(read("en"));
    const zh = leaves(read("zh-CN"));
    const placeholders = (s: string) => (s.match(/\{[a-zA-Z0-9_]+\}/g) ?? []).sort();
    const mismatched = Object.keys(en).filter((k) => k in zh && placeholders(en[k]).join() !== placeholders(zh[k]).join());
    expect(mismatched).toEqual([]);
  });
});
