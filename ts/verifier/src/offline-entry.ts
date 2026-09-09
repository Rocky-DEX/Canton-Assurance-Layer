/**
 * DOM shell for the standalone offline verifier. All decision logic lives in
 * `offline.ts` and is tested there; this file only moves text between the DOM
 * and `verifyFromText`, in whichever language the reader chose.
 */

import { verifyFromText, type ViewModel } from "./offline";
import {
  applyTranslations,
  localeFromWindow,
  mountLanguageSwitch,
  storeLocale,
  type Locale,
} from "./i18n/core";
import { verifierTranslator, type VerifierKey, type VerifierTranslator } from "./i18n/verifier-messages";

const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el;
};

let t: VerifierTranslator = verifierTranslator(localeFromWindow(window));

async function readFile(input: HTMLInputElement): Promise<string> {
  const file = input.files?.[0];
  if (!file) {
    // `data-what` names a message key, so the error is in the reader's language.
    throw new Error(t("error.chooseFile", { what: t((input.dataset.what ?? "what.report") as VerifierKey) }));
  }
  return file.text();
}

async function readOptional(input: HTMLInputElement): Promise<string | null> {
  return input.files?.[0] ? input.files[0].text() : null;
}

function render(vm: ViewModel): void {
  const result = $("result");
  result.hidden = false;
  result.className = `result ${vm.status}`;
  $("headline").textContent = vm.headline;
  $("detail").textContent = vm.detail;

  const rows = $("facts");
  rows.innerHTML = "";
  for (const f of vm.facts) {
    const row = document.createElement("tr");

    const label = document.createElement("th");
    label.scope = "row";
    label.textContent = f.label;

    const value = document.createElement("td");
    value.className = "value";
    value.textContent = f.value;

    const provenance = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = `badge ${f.provenance}`;
    badge.textContent = f.provenance === "verified" ? t("badge.verified") : t("badge.disclosed");
    badge.title = f.provenance === "verified" ? t("badge.verified.title") : t("badge.disclosed.title");
    provenance.appendChild(badge);

    row.append(label, value, provenance);
    rows.appendChild(row);
  }
  $("facts-table").hidden = vm.facts.length === 0;
}

async function onVerify(): Promise<void> {
  try {
    const [reportText, proofText] = await Promise.all([
      readFile($("report") as HTMLInputElement),
      readFile($("proof") as HTMLInputElement),
    ]);
    const key = ($("key") as HTMLInputElement).value;

    // The group half is optional; both files are needed or neither.
    const [groupReportText, membershipText] = await Promise.all([
      readOptional($("group-report") as HTMLInputElement),
      readOptional($("membership") as HTMLInputElement),
    ]);
    if ((groupReportText === null) !== (membershipText === null)) {
      throw new Error(t("error.groupPair"));
    }

    const groupKey = ($("group-key") as HTMLInputElement).value.trim();
    const group =
      groupReportText && membershipText
        ? {
            reportText: groupReportText,
            membershipText,
            ...(groupKey ? { keyHex: groupKey } : {}),
          }
        : undefined;

    render(await verifyFromText(reportText, proofText, key, group, t));
  } catch (e) {
    render({
      status: "error",
      headline: t("headline.error"),
      detail: e instanceof Error ? e.message : String(e),
      facts: [],
    });
  }
}

function switchLocale(locale: Locale): void {
  t = verifierTranslator(locale);
  storeLocale(window, locale);
  applyTranslations(document, t);
  // The chosen files are still in their inputs, so a result on screen can be
  // re-derived in the new language rather than left half-translated.
  if (!$("result").hidden) void onVerify();
}

applyTranslations(document, t);
mountLanguageSwitch($("lang") as HTMLSelectElement, t.locale, switchLocale);

$("verify").addEventListener("click", () => {
  void onVerify();
});
