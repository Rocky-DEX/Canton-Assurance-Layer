/**
 * Every word the disclosure designer shows an operator.
 *
 * A separate table from the verifier's on purpose. The designer verifies
 * nothing, and the built page is tested not to contain the provenance
 * vocabulary ("recomputed here"); sharing one catalog would put those words
 * into a page that has no right to them.
 */

import { type Catalog, type Locale, type Translator, makeTranslator } from "./core";

const en = {
  "ui.language": "Language",
  "designer.title": "Canton solvency — disclosure designer",
  "designer.lede":
    "Decide what a report discloses, and see the decision before you make it. " +
    "Everything happens in this page — it makes no network requests. " +
    "<strong>This designs a manifest; it does not publish one.</strong> Publishing " +
    "needs a participant node and the producer's signing key, neither of which a " +
    "page loaded from a file can reach. Export the manifest and hand it to the " +
    "producer.",
  "section.documents": "Documents",
  "field.draft.label": "Draft report",
  "field.draft.hint": "— the report you are about to publish",
  "field.previous.label": "Previous report",
  "field.previous.hint": "— optional; enables the diff",
  "field.audience.label": "Audience",
  "field.audience.hint": "— who this packaging is cut for",
  "section.discloses": "What this report discloses",
  "col.field": "Field",
  "col.state": "State",
  "section.problems": "Problems",
  "hint.problems": "Publishing with any of these would be rejected by a verifier.",
  "section.changes": "Changed since the previous report",
  "section.reduced": "Reduced disclosure",
  "hint.reduced": "Reducing disclosure can be legitimate. It should never be accidental.",
  "section.audience": "What this audience will see",
  "hint.shown": "Shown",
  "hint.proven": "Proven but not shown",
  "hint.withheld": "Withheld",
  "section.manifest": "Manifest",
  "action.export": "Export manifest",
  "footer.manifest":
    "A manifest is bound into the signed report, so a reduction in disclosure is " +
    "on the record whether or not anyone was watching for it. That is the point " +
    "of designing it deliberately rather than discovering it later.",
  "footer.export":
    "The export is a manifest, not a report. The producer signs it into the report " +
    "it belongs to; nothing here holds a signing key.",

  // Display labels for the three wire states. The manifest itself keeps the
  // wire values; only what the operator reads changes with the language.
  "state.published": "published",
  "state.committed": "committed",
  "state.withheld": "withheld",

  "note.carries": "the draft carries data for this",
  "note.notInBody": "not in the report body",
  "empty.problems": "none — this manifest is consistent with the draft",
  "empty.warnings": "no disclosure was reduced",
  "empty.changes": "nothing changed since the previous report",
  "empty.noPrevious": "no previous report loaded",
  "empty.nothing": "nothing",
  "change.row": "{path}: {from} → {to}",
  "change.notDeclared": "not declared",
  "problem.publishedNoData": "declared published but the report carries no data for it",
  "problem.publishesAnyway": "declared {state} but the report publishes it anyway",
  "problem.noAudience": "no audience named: a packaging is for someone in particular",
  "problem.row": "{path}: {problem}",
  "warning.reduced": "{path} was published and is now {to}",
  "warning.notDeclaredAtAll": "not declared at all",
} as const satisfies Record<string, string>;

export type DesignerKey = keyof typeof en;

const zhCN: Record<DesignerKey, string> = {
  "ui.language": "语言",
  "designer.title": "Canton 偿付能力 — 披露设计器",
  "designer.lede":
    "决定一份报告披露什么，并在做出决定之前先看到它。所有计算都在本页面内完成——" +
    "它不发出任何网络请求。<strong>这里只设计披露清单，不做发布。</strong>" +
    "发布需要 participant 节点和生产方的签名密钥，二者都不是从文件打开的页面能触及的。" +
    "导出清单后交给生产方即可。",
  "section.documents": "文档",
  "field.draft.label": "报告草稿",
  "field.draft.hint": "— 你即将发布的报告",
  "field.previous.label": "上一份报告",
  "field.previous.hint": "— 可选；启用差异对比",
  "field.audience.label": "受众",
  "field.audience.hint": "— 这份打包是为谁裁剪的",
  "section.discloses": "这份报告披露的内容",
  "col.field": "字段",
  "col.state": "状态",
  "section.problems": "问题",
  "hint.problems": "带着其中任何一条发布，都会被验证器拒绝。",
  "section.changes": "相对上一份报告的变化",
  "section.reduced": "披露减少",
  "hint.reduced": "减少披露可以是正当的，但绝不应是无意的。",
  "section.audience": "该受众将看到的内容",
  "hint.shown": "展示",
  "hint.proven": "已证明但不展示",
  "hint.withheld": "不披露",
  "section.manifest": "清单",
  "action.export": "导出清单",
  "footer.manifest":
    "清单被绑入已签名的报告，因此披露的减少无论是否有人在留意，都会留在记录上。" +
    "这正是要刻意设计它、而不是事后才发现它的原因。",
  "footer.export": "导出的是一份清单，而不是报告。生产方会把它签进所属的报告；这里不持有任何签名密钥。",

  "state.published": "已公开",
  "state.committed": "仅承诺",
  "state.withheld": "不披露",

  "note.carries": "草稿中含有该字段的数据",
  "note.notInBody": "不在报告正文中",
  "empty.problems": "无 — 该清单与草稿一致",
  "empty.warnings": "没有减少任何披露",
  "empty.changes": "相对上一份报告没有变化",
  "empty.noPrevious": "未加载上一份报告",
  "empty.nothing": "无",
  "change.row": "{path}：{from} → {to}",
  "change.notDeclared": "未声明",
  "problem.publishedNoData": "声明为已公开，但报告中没有该字段的数据",
  "problem.publishesAnyway": "声明为{state}，但报告仍然公开了它",
  "problem.noAudience": "未指明受众：打包总是面向特定对象的",
  "problem.row": "{path}：{problem}",
  "warning.reduced": "{path} 原本已公开，现在为{to}",
  "warning.notDeclaredAtAll": "完全未声明",
};

export const DESIGNER_MESSAGES: Catalog<DesignerKey> = { en, "zh-CN": zhCN };

export type DesignerTranslator = Translator<DesignerKey>;

export const designerTranslator = (locale: Locale): DesignerTranslator =>
  makeTranslator(DESIGNER_MESSAGES, locale);

export const englishDesigner: DesignerTranslator = designerTranslator("en");

/** The wire value's display label, or the value itself when it is not one this format defines. */
export function stateLabel(state: unknown, t: DesignerTranslator): string {
  switch (state) {
    case "published":
    case "committed":
    case "withheld":
      return t(`state.${state}`);
    default:
      return String(state);
  }
}
