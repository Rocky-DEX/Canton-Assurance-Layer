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

  it("use braces only for placeholders", () => {
    // next-intl reads ICU syntax, so a stray "{" — a JSON example, say — makes
    // the whole message invalid at render time (INVALID_MESSAGE). Examples
    // that need braces belong in code, not in the catalogs.
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
    const bad: string[] = [];
    for (const locale of ["en", "zh-CN"]) {
      for (const [k, v] of Object.entries(leaves(read(locale)))) {
        if (v.replace(/\{[a-zA-Z0-9_]+\}/g, "").match(/[{}]/)) bad.push(`${locale}: ${k}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

/**
 * Every key a component asks for must exist. `t("x")` under
 * `useTranslations("ns")` must resolve to `ns.x`; a template key such as
 * `t(\`states.${s}\`)` must at least have `ns.states` as an object. The
 * publish wizard shipped asking for `wizard.states.*` when the catalog had
 * `wizard.step3.states.*`, which no type or parity check caught.
 */
describe("translation keys used by components", () => {
  it("all resolve in the English catalog", async () => {
    const { readdirSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const catalog = JSON.parse(readFileSync(new URL("../../messages/en.json", import.meta.url), "utf8")) as Record<string, unknown>;
    const has = (path: string): boolean => {
      let cur: unknown = catalog;
      for (const part of path.split(".")) {
        if (typeof cur !== "object" || cur === null || !(part in (cur as object))) return false;
        cur = (cur as Record<string, unknown>)[part];
      }
      return true;
    };
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(name) && !name.endsWith(".test.ts")) files.push(p);
      }
    };
    walk(new URL("../", import.meta.url).pathname);

    const decl = /const\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*"([^"]+)"\s*\)/g;
    const problems: string[] = [];
    let checked = 0;
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      const decls = [...src.matchAll(decl)];
      decls.forEach((m, i) => {
        const [, name, ns] = m;
        // The variable is in scope until the next declaration of the same name (the next component).
        const next = decls.slice(i + 1).find((n) => n[1] === name);
        const region = src.slice(m.index! + m[0].length, next ? next.index : undefined);
        const escaped = name.replace(/[$]/g, "\\$&");
        for (const k of region.matchAll(new RegExp(`(?<![\\w.])${escaped}\\(\\s*"([^"]+)"`, "g"))) {
          checked += 1;
          if (!has(`${ns}.${k[1]}`)) problems.push(`${file}: ${ns}.${k[1]}`);
        }
        for (const k of region.matchAll(new RegExp(`(?<![\\w.])${escaped}\\(\\s*\`([^\`$]*)\\$\\{`, "g"))) {
          checked += 1;
          const prefix = `${ns}.${k[1]}`.replace(/\.$/, "");
          if (!has(prefix)) problems.push(`${file}: ${prefix}.\${…}`);
        }
      });
    }
    expect(checked).toBeGreaterThan(500);
    expect(problems).toEqual([]);
  });
});
