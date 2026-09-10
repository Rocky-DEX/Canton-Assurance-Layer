import { readFileSync } from "node:fs";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { describe, expect, it } from "vitest";

import { DiagnosisView, ReportView } from "@/app/app/[slug]/simulator/report-view";
import type { SimulationReport } from "@/lib/simulator";

/**
 * The simulator page renders reports the Rust server produced, so the two
 * checked-in reports (`fixtures/simulator/reports/`, written by
 * `rust/sim-server/tests/http.rs` against a mock participant) are rendered
 * here in both locales. A wire-type drift between the crates and
 * `src/lib/simulator.ts` shows up as a missing field in the markup.
 */
function fixture(name: string): SimulationReport {
  return JSON.parse(readFileSync(new URL(`../../../fixtures/simulator/reports/${name}.json`, import.meta.url), "utf8")) as SimulationReport;
}

function messages(locale: string): Record<string, unknown> {
  return JSON.parse(readFileSync(new URL(`../../messages/${locale}.json`, import.meta.url), "utf8")) as Record<string, unknown>;
}

function render(locale: string, element: ReactElement): string {
  // The provider's props type requires `children`, and the lint rule wants
  // children passed positionally; a props object satisfies both.
  const props = { locale, messages: messages(locale) as AbstractIntlMessages, children: element };
  return renderToStaticMarkup(createElement(NextIntlClientProvider, props));
}

describe("simulator report rendering", () => {
  const succeed = fixture("would-succeed");
  const fail = fixture("would-fail");

  it("renders a successful simulation with its effects and traffic quote", () => {
    const html = render("en", createElement(ReportView, { report: succeed }));
    expect(html).toContain("Would succeed");
    expect(html).toContain("exercise (consuming)");
    expect(html).toContain(".Debit");
    expect(html).toContain("PerpCustody:PlatformAccount");
    expect(html).toContain("1 creates");
    expect(html).toContain("1 archives");
    expect(html).toContain("5,000");
    expect(html).toContain("splice-defaults");
    expect(html).toContain("consumed");
    expect(html).not.toContain("Why it would fail");
  });

  it("renders a rejection with the diagnosis, hints and contract state", () => {
    const html = render("en", createElement(ReportView, { report: fail }));
    expect(html).toContain("Would fail");
    expect(html).toContain("CONTRACT_NOT_FOUND");
    expect(html).toContain("interpretation");
    expect(html).toContain("ARCHIVED at offset 123");
    expect(html).toContain("archived");
    expect(html).toContain("@ 123");
    expect(html).toContain("Canton&#x27;s explanation");
    expect(html).not.toContain("Ledger effects");
  });

  it("renders in Simplified Chinese with the same data", () => {
    const html = render("zh-CN", createElement(ReportView, { report: fail }));
    expect(html).toContain("将会失败");
    expect(html).toContain("为什么会失败");
    expect(html).toContain("CONTRACT_NOT_FOUND");
    const ok = render("zh-CN", createElement(ReportView, { report: succeed }));
    expect(ok).toContain("将会成功");
    expect(ok).toContain("账本效果");
  });

  it("renders a diagnosis on its own, as the Explain tab does", () => {
    const html = render("en", createElement(DiagnosisView, { diagnosis: fail.diagnosis! }));
    expect(html).toContain("Facts from the error");
    expect(html).toContain("What to check next");
    expect(html).toContain("not retryable");
  });
});
