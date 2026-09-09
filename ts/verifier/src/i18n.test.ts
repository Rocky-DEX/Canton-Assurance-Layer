import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { PAGES } from "../scripts/build-offline.mjs";
import {
  DEFAULT_LOCALE,
  LOCALES,
  detectLocale,
  interpolate,
  makeTranslator,
  resolveLocale,
  splitRich,
  type Catalog,
} from "./i18n/core";
import { DESIGNER_MESSAGES, designerTranslator } from "./i18n/designer-messages";
import { VERIFIER_MESSAGES, verifierTranslator } from "./i18n/verifier-messages";
import { verifyFromText } from "./offline";
import { buildConsole, flowOf } from "./console";
import { buildDesigner } from "./publisher";
import type { Manifest, Report, SignedReport } from "./report";

const fixture = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../fixtures/${name}`, import.meta.url)), "utf8");

const KEY = "8a88e3dd7409f195fd52db2d3cba5d72ca6709bf1d94121bf3748801b40f6f5c";

const placeholders = (text: string): string[] =>
  [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

const CATALOGS: Array<[string, Catalog<string>]> = [
  ["verifier", VERIFIER_MESSAGES as Catalog<string>],
  ["designer", DESIGNER_MESSAGES as Catalog<string>],
];

/**
 * A translation table is only as good as its weakest locale. Every locale
 * must say everything English says, with the same placeholders, so the page
 * never shows a blank, an English fallback, or a literal `{count}`.
 */
describe.each(CATALOGS)("%s catalog", (_name, catalog) => {
  const english = catalog[DEFAULT_LOCALE];
  const keys = Object.keys(english).sort();

  it("defines every locale the switcher offers", () => {
    for (const { code } of LOCALES) expect(catalog[code], code).toBeDefined();
  });

  it.each(LOCALES.map((l) => l.code))("%s carries every key, non-empty", (code) => {
    const table = catalog[code];
    expect(Object.keys(table).sort()).toEqual(keys);
    for (const key of keys) expect(table[key].trim(), key).not.toBe("");
  });

  it.each(LOCALES.map((l) => l.code))("%s uses the same placeholders as English", (code) => {
    for (const key of keys) {
      expect(placeholders(catalog[code][key]), key).toEqual(placeholders(english[key]));
    }
  });

  it.each(LOCALES.map((l) => l.code))("%s only uses the inline tags the renderer knows", (code) => {
    for (const key of keys) {
      const tags = [...catalog[code][key].matchAll(/<\/?(\w+)>/g)].map((m) => m[1]);
      for (const tag of tags) expect(["code", "strong"], `${key} uses <${tag}>`).toContain(tag);
      // Every tag opened is closed, in the form splitRich recognises.
      const stripped = splitRich(catalog[code][key]).map((p) => p.text).join("");
      expect(stripped, key).not.toMatch(/<\/?(code|strong)>/);
    }
  });
});

describe("designer vocabulary", () => {
  /**
   * The built designer page is tested not to contain the provenance words,
   * because it verifies nothing. That test is only meaningful if no locale of
   * its catalog smuggles them in.
   */
  it("speaks no provenance vocabulary in any locale", () => {
    for (const { code } of LOCALES) {
      const text = Object.values(DESIGNER_MESSAGES[code]).join("\n");
      expect(text).not.toContain(VERIFIER_MESSAGES[code]["badge.verified"]);
      expect(text).not.toContain(VERIFIER_MESSAGES[code]["badge.disclosed"]);
    }
  });

  it("keeps the two provenance terms distinct in every locale", () => {
    for (const { code } of LOCALES) {
      const table = VERIFIER_MESSAGES[code];
      expect(table["badge.verified"]).not.toBe(table["badge.disclosed"]);
      // The footer explains the badges in the badges' own words.
      expect(table["footer.provenance"]).toContain(table["badge.verified"]);
      expect(table["footer.provenance"]).toContain(table["badge.disclosed"]);
    }
  });
});

describe("templates", () => {
  const catalogFor = (entry: string) =>
    entry.includes("publisher") ? DESIGNER_MESSAGES : VERIFIER_MESSAGES;

  for (const page of PAGES) {
    const template = readFileSync(
      fileURLToPath(new URL(`../${page.template.replace("../", "")}`, import.meta.url)),
      "utf8"
    );
    const english = catalogFor(page.entry).en as Record<string, string>;

    it(`${page.name}: every data-i18n key exists in its catalog`, () => {
      const keys = [
        ...template.matchAll(/data-i18n(?:-placeholder)?="([^"]+)"/g),
        ...template.matchAll(/data-what="([^"]+)"/g),
      ].map((m) => m[1]);
      expect(keys.length).toBeGreaterThan(5);
      for (const key of keys) expect(english, key).toHaveProperty(key);
    });

    it(`${page.name}: the English fallback text in the markup matches the catalog`, () => {
      // The markup reads correctly before the script runs; it must say what
      // the script would say, or the two drift and nobody notices.
      for (const m of template.matchAll(/<(\w+)[^>]*\sdata-i18n="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g)) {
        const [, , key, inner] = m;
        const expected = english[key].replace(/\s+/g, " ").trim();
        const actual = inner.replace(/\s+/g, " ").trim();
        expect(actual, key).toBe(expected);
      }
    });

    it(`${page.name}: offers a language switch`, () => {
      expect(template).toContain('id="lang"');
    });
  }
});

describe("locale detection", () => {
  it("prefers an explicit URL parameter over everything", () => {
    expect(
      detectLocale({ query: "?lang=zh-CN", stored: "en", languages: ["en-US"] })
    ).toBe("zh-CN");
    expect(detectLocale({ hash: "#lang=zh-CN", stored: "en" })).toBe("zh-CN");
  });

  it("then a remembered choice, then the browser, then English", () => {
    expect(detectLocale({ stored: "zh-CN", languages: ["en-US"] })).toBe("zh-CN");
    expect(detectLocale({ languages: ["fr-FR", "zh-TW", "en"] })).toBe("zh-CN");
    expect(detectLocale({ languages: ["fr-FR", "de"] })).toBe("en");
    expect(detectLocale({})).toBe("en");
  });

  it("maps regional variants onto the nearest supported locale", () => {
    expect(resolveLocale("zh")).toBe("zh-CN");
    expect(resolveLocale("zh-Hant-TW")).toBe("zh-CN");
    expect(resolveLocale("EN-gb")).toBe("en");
    expect(resolveLocale("klingon")).toBeNull();
    expect(resolveLocale("")).toBeNull();
    expect(resolveLocale(undefined)).toBeNull();
  });

  it("ignores garbage in the URL rather than failing", () => {
    expect(detectLocale({ query: "?lang=<script>", languages: ["zh-CN"] })).toBe("zh-CN");
  });
});

describe("translator", () => {
  it("interpolates what it is given and leaves the rest visible", () => {
    expect(interpolate("{a} and {b}", { a: 1, b: "two" })).toBe("1 and two");
    expect(interpolate("{a} and {b}", { a: 1 })).toBe("1 and {b}");
    expect(interpolate("plain", undefined)).toBe("plain");
  });

  it("falls back to English, then to the key, never to a blank", () => {
    const catalog = {
      en: { greeting: "hello", only: "english only" },
      "zh-CN": { greeting: "你好" },
    } as unknown as Catalog<"greeting" | "only" | "missing">;
    const t = makeTranslator(catalog, "zh-CN");
    expect(t("greeting")).toBe("你好");
    expect(t("only")).toBe("english only");
    expect(t("missing")).toBe("missing");
    expect(t.locale).toBe("zh-CN");
  });

  it("splits rich text into the two tags it supports and nothing else", () => {
    expect(splitRich("the <code>report.json</code> file")).toEqual([
      { tag: null, text: "the " },
      { tag: "code", text: "report.json" },
      { tag: null, text: " file" },
    ]);
    expect(splitRich("<strong>a</strong>")).toEqual([{ tag: "strong", text: "a" }]);
    expect(splitRich("no tags")).toEqual([{ tag: null, text: "no tags" }]);
    // An unsupported tag is text, and is rendered as text, never as markup.
    expect(splitRich("<em>x</em>")).toEqual([{ tag: null, text: "<em>x</em>" }]);
  });
});

/**
 * The pure modules take a translator and default to English, so everything
 * the existing tests assert about English wording still holds. These check
 * that handing in another language actually changes what the reader sees,
 * and changes all of it.
 */
describe("localised view models", () => {
  const zh = verifierTranslator("zh-CN");
  const report = () => fixture("report.golden.json");
  const proof = () => fixture("proof.golden.json");
  const hasChinese = (s: string) => /[一-鿿]/.test(s);

  it("verifies in Chinese with every label translated", async () => {
    const vm = await verifyFromText(report(), proof(), KEY, undefined, zh);
    expect(vm.status).toBe("verified");
    expect(vm.headline).toContain("已验证");
    expect(hasChinese(vm.detail)).toBe(true);
    for (const f of vm.facts) expect(hasChinese(f.label), f.label).toBe(true);
    expect(JSON.stringify(vm)).not.toMatch(/\{\w+\}/);
  });

  it("explains a failure in Chinese, with the asset name still legible", async () => {
    const tampered = proof().replace("0.250000000000000000", "9.250000000000000000");
    const vm = await verifyFromText(report(), tampered, KEY, undefined, zh);
    expect(vm.status).toBe("failed");
    expect(vm.headline).toBe("未通过验证");
    expect(hasChinese(vm.detail)).toBe(true);

    const wrongKey = await verifyFromText(report(), proof(), "abc", undefined, zh);
    expect(wrongKey.status).toBe("error");
    expect(wrongKey.headline).toBe("无法完成检查");
    expect(wrongKey.detail).toContain("64");
  });

  it("still speaks English when no language is given", async () => {
    const vm = await verifyFromText(report(), proof(), KEY);
    expect(vm.headline).toContain("Verified");
  });

  it("localises the console's data-flow view and coverage table", async () => {
    const parsed = (JSON.parse(report()) as SignedReport).report;
    const flow = flowOf(parsed, zh);
    expect(flow.find((n) => n.id === "total:USDA")?.detail).toContain("加总");
    expect(flow.find((n) => n.id === "snapshot")?.label).toBe("账本偏移量");

    const model = await buildConsole({
      reportText: report(),
      proofText: proof(),
      trustedKeyHex: KEY,
      custodyText: fixture("custody-report.golden.json"),
      t: zh,
    });
    expect(model.verification.headline).toContain("已验证");
    expect(model.coverage?.length).toBeGreaterThan(0);
  });

  it("localises the designer's problems and warnings", () => {
    const zhDesigner = designerTranslator("zh-CN");
    const draft = (JSON.parse(fixture("report-v2.golden.json")) as SignedReport).report as Report;
    const manifest = { audience: "  ", fields: { root_sums: "withheld" } } as unknown as Manifest;
    const before = { audience: "public", fields: { root_sums: "published", mark_prices: "published" } } as Manifest;
    const model = buildDesigner(draft, manifest, before, zhDesigner);

    expect(model.problems.some((p) => p.includes("不披露") && p.includes("root_sums"))).toBe(true);
    expect(model.problems.some((p) => p.includes("未指明受众"))).toBe(true);
    expect(model.warnings.some((w) => w.includes("mark_prices") && w.includes("完全未声明"))).toBe(true);
    expect(JSON.stringify(model)).not.toMatch(/\{\w+\}/);
  });
});
