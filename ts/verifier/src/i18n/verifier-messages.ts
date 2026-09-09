/**
 * Every word the offline verifier and the disclosure console show a reader.
 *
 * The English table defines the keys; every other locale is typed against it,
 * so a translation that forgets a key fails `tsc` rather than showing a blank.
 * Keys, not English strings, are what the code refers to, so a change of
 * wording is a change to one table and nothing else.
 *
 * The two provenance terms — "recomputed here" and "publisher says" — are the
 * vocabulary the pages are built around. Each locale must keep them as two
 * distinct, unmistakable phrases: the footer explains them in the same words
 * the badges use.
 */

import { type Catalog, type Locale, type Translator, makeTranslator } from "./core";

const en = {
  // -- shared chrome --------------------------------------------------------
  "ui.language": "Language",
  "section.needed": "What you need",
  "field.report.label": "Report file",
  "field.report.hint": "— the venue's <code>report.json</code>",
  "field.proof.label": "Your proof file",
  "field.proof.hint": "— the <code>proof.json</code> issued to you",
  "field.key.label": "Publisher key",
  "field.key.hint": "— 64 hex characters, obtained from somewhere other than the venue's own page",
  "footer.provenance":
    "<strong>“recomputed here”</strong> means this page derived the value from the " +
    "commitment itself. <strong>“publisher says”</strong> means the value is signed " +
    "but cannot be proven by one inclusion proof — a single proof shows your entry " +
    "is in the tree, not that every other customer is.",
  "footer.key":
    "Getting the publisher key from the same place you got the report proves nothing. " +
    "Obtain it independently.",

  // -- offline verifier page ------------------------------------------------
  "offline.title": "Canton solvency — offline verifier",
  "offline.lede":
    "Check that your balance is inside a venue's published totals. Everything " +
    "happens in this page: it makes no network requests, so you can save it and " +
    "run it with your connection off.",
  "action.verify": "Verify",
  "section.group": "If your venue is part of a group (optional)",
  "section.group.hint":
    "Add these to check that your venue is itself committed inside the group's " +
    "consolidated total, not just that your balance is inside your venue's.",
  "field.groupReport.label": "Group report",
  "field.groupReport.hint": "— the group's <code>report.json</code>",
  "field.membership.label": "Membership file",
  "field.membership.hint": "— your venue's <code>membership.json</code>",
  "field.groupKey.label": "Group publisher key",
  "field.groupKey.hint": "— leave blank if the group signs with the same key",
  "field.groupKey.placeholder": "(same as above)",

  // -- disclosure console page ----------------------------------------------
  "console.title": "Canton solvency — disclosure console",
  "console.lede":
    "Read a venue's published disclosure and see where every figure comes from. " +
    "Everything happens in this page — it makes no network requests. Publishing " +
    "is not here: that needs a live participant node, which a page loaded from a " +
    "file cannot have.",
  "field.custody.label": "Custody report",
  "field.custody.hint": "— optional; adds the asset side",
  "field.history.label": "Anchor history",
  "field.history.hint": "— optional; a JSON array of anchors, oldest first",
  "action.check": "Check",
  "section.flow": "Where these figures come from",
  "section.coverage": "Assets against liabilities",
  "col.asset": "Asset",
  "col.held": "Held",
  "col.owed": "Owed",
  "section.history": "Published history",
  "col.index": "#",
  "col.snapshot": "Snapshot",
  "col.report": "Report",
  "badge.covered": "covered",
  "badge.short": "SHORT",
  "badge.linked": "linked",
  "badge.break": "BREAK",

  // -- page shell: reading inputs --------------------------------------------
  "error.chooseFile": "Choose a {what} first.",
  "what.report": "report file",
  "what.proof": "proof file",
  "what.groupReport": "group report",
  "what.membership": "membership file",
  "what.custody": "custody report",
  "what.history": "anchor history",
  "error.groupPair": "Add both the group report and the membership file, or neither.",

  // -- provenance badges ------------------------------------------------------
  "badge.verified": "recomputed here",
  "badge.verified.title": "This browser recomputed this value from the commitment.",
  "badge.disclosed": "publisher says",
  "badge.disclosed.title": "Signed by the publisher, but one inclusion proof cannot prove it.",

  // -- verification view model -------------------------------------------------
  "headline.error": "Could not check this",
  "headline.failed": "Not verified",
  "headline.verified": "Verified — your balance is in the published totals",
  "headline.verifiedGroup": "Verified — your balance is inside the group's consolidated total",
  "detail.verified":
    "Your entry was recomputed in this browser and folds to the root this report publishes, " +
    "and the totals match what the committed entries add up to.",
  "detail.verifiedGroup":
    "Your entry was recomputed in this browser, folds to the root your venue publishes, " +
    "and that venue is committed inside the group's consolidated total.",
  "error.keyFormat": "The publisher key must be 64 hex characters (32 bytes).",
  "error.groupKeyFormat": "The group publisher key must be 64 hex characters (32 bytes).",
  "error.notJson": "One of these files is not valid JSON.",
  "error.swapped": "Expected one report file and one proof file — they may be swapped.",
  "error.groupNotJson": "One of the group files is not valid JSON.",
  "error.groupSwapped": "Expected one group report and one membership file — they may be swapped.",
  "error.malformedDocument": "This file is not a well-formed report or proof. {detail}",
  "failure.entity_root_mismatch":
    "The group document and this venue's report describe different books. They may be for different subsidiaries.",
  "failure.entity_sums_mismatch":
    "The group document and this venue's report disagree on the venue's totals.",
  "failure.digest_mismatch":
    "This proof belongs to a different report. It may be from another day — ask for the proof issued with this report.",
  "failure.unknown_signer":
    "This report is not signed by the trusted key you supplied. Either the key is wrong, or this report did not come from who you think.",
  "failure.bad_signature": "The signature on this report does not verify. The report has been altered.",
  "failure.root_hash_mismatch":
    "Your entry does not fold to the published root. The balance shown to you is not the one that was committed.",
  "failure.root_sums_mismatch":
    "The published totals disagree with what the committed entries actually add up to.",
  "failure.unsupported_version": "This file uses an unsupported format version ({found}).",
  "failure.malformed": "The document is malformed: {detail}",
  "failure.asset": "{detail} (asset {asset})",
  "value.malformed": "(malformed)",
  "value.none": "(none)",
  "fact.yourBalance": "Your balance",
  "fact.publishedTotals": "Published totals",
  "fact.root": "Root",
  "fact.publisher": "Publisher",
  "fact.snapshotTime": "Snapshot time",
  "fact.ledgerOffset": "Ledger offset",
  "fact.entriesCommitted": "Entries committed",
  "fact.badDebt": "Bad debt disclosed",
  "fact.houseExcluded": "House accounts excluded",
  "fact.withheld": "Withheld from this audience",
  "fact.provenNotShown": "Proven but not shown",
  "fact.entity": "Your entity",
  "fact.groupTotals": "Group consolidated totals",
  "fact.groupPublisher": "Group publisher",

  // -- console data-flow view --------------------------------------------------
  "flow.root.label": "{profile} root",
  "flow.root.detail": "{hash}… over {count} committed entries",
  "flow.total.detail": "{amount} — summed from every committed entry",
  "flow.leaf.label": "{leaf} entries",
  "flow.leaf.labelGeneric": "entries",
  "flow.leaf.detail":
    "{count} of them, committed but not published. " +
    "Each holder can prove their own without revealing the others.",
  "flow.offset.label": "ledger offset",
  "flow.offset.detail": "{offset} — the point in the publisher's event history this is \"as of\"",
} as const satisfies Record<string, string>;

export type VerifierKey = keyof typeof en;

const zhCN: Record<VerifierKey, string> = {
  "ui.language": "语言",
  "section.needed": "你需要准备",
  "field.report.label": "报告文件",
  "field.report.hint": "— 平台发布的 <code>report.json</code>",
  "field.proof.label": "你的证明文件",
  "field.proof.hint": "— 签发给你的 <code>proof.json</code>",
  "field.key.label": "发布方公钥",
  "field.key.hint": "— 64 位十六进制字符，请从平台自己的页面以外的渠道获取",
  "footer.provenance":
    "<strong>“本机重算”</strong>表示本页面从承诺本身推导出了该值。" +
    "<strong>“发布方声称”</strong>表示该值虽已签名，但无法用一份包含证明加以证实——" +
    "一份证明只能表明你的条目在树中，不能表明其他每位客户的条目也在。",
  "footer.key": "从获取报告的同一个地方获取发布方公钥，什么也证明不了。请通过独立渠道获取。",

  "offline.title": "Canton 偿付能力 — 离线验证器",
  "offline.lede":
    "检查你的余额是否包含在平台公布的总额之内。所有计算都在本页面内完成：" +
    "它不发出任何网络请求，你可以把它保存下来，断网后再运行。",
  "action.verify": "验证",
  "section.group": "如果你的平台属于某个集团（可选）",
  "section.group.hint":
    "添加这些文件，可以进一步检查你的平台本身是否被承诺在集团的合并总额之内，" +
    "而不只是你的余额在平台的总额之内。",
  "field.groupReport.label": "集团报告",
  "field.groupReport.hint": "— 集团的 <code>report.json</code>",
  "field.membership.label": "成员关系文件",
  "field.membership.hint": "— 你的平台的 <code>membership.json</code>",
  "field.groupKey.label": "集团发布方公钥",
  "field.groupKey.hint": "— 若集团使用同一把密钥签名，留空即可",
  "field.groupKey.placeholder": "（与上方相同）",

  "console.title": "Canton 偿付能力 — 披露控制台",
  "console.lede":
    "阅读平台已发布的披露，看清每一个数字从何而来。所有计算都在本页面内完成——" +
    "它不发出任何网络请求。发布功能不在这里：那需要一个在线的 participant 节点，" +
    "而从文件打开的页面无法拥有它。",
  "field.custody.label": "托管报告",
  "field.custody.hint": "— 可选；补上资产一侧",
  "field.history.label": "锚定历史",
  "field.history.hint": "— 可选；由锚组成的 JSON 数组，最早的在前",
  "action.check": "检查",
  "section.flow": "这些数字从何而来",
  "section.coverage": "资产对负债",
  "col.asset": "资产",
  "col.held": "持有",
  "col.owed": "应付",
  "section.history": "已发布的历史",
  "col.index": "#",
  "col.snapshot": "快照",
  "col.report": "报告",
  "badge.covered": "已覆盖",
  "badge.short": "不足",
  "badge.linked": "已衔接",
  "badge.break": "断裂",

  "error.chooseFile": "请先选择{what}。",
  "what.report": "报告文件",
  "what.proof": "证明文件",
  "what.groupReport": "集团报告",
  "what.membership": "成员关系文件",
  "what.custody": "托管报告",
  "what.history": "锚定历史",
  "error.groupPair": "集团报告和成员关系文件要么都添加，要么都不添加。",

  "badge.verified": "本机重算",
  "badge.verified.title": "本浏览器从承诺重新计算出了该值。",
  "badge.disclosed": "发布方声称",
  "badge.disclosed.title": "由发布方签名，但一份包含证明无法证实它。",

  "headline.error": "无法完成检查",
  "headline.failed": "未通过验证",
  "headline.verified": "已验证 — 你的余额在已公布的总额之内",
  "headline.verifiedGroup": "已验证 — 你的余额在集团的合并总额之内",
  "detail.verified":
    "你的条目已在本浏览器中重算，折叠后得到本报告公布的根，且总额与已承诺条目的加总一致。",
  "detail.verifiedGroup":
    "你的条目已在本浏览器中重算，折叠后得到你的平台公布的根，且该平台已被承诺在集团的合并总额之内。",
  "error.keyFormat": "发布方公钥必须是 64 位十六进制字符（32 字节）。",
  "error.groupKeyFormat": "集团发布方公钥必须是 64 位十六进制字符（32 字节）。",
  "error.notJson": "其中一个文件不是有效的 JSON。",
  "error.swapped": "需要一份报告文件和一份证明文件——两者可能放反了。",
  "error.groupNotJson": "集团文件中有一个不是有效的 JSON。",
  "error.groupSwapped": "需要一份集团报告和一份成员关系文件——两者可能放反了。",
  "error.malformedDocument": "该文件不是格式良好的报告或证明。{detail}",
  "failure.entity_root_mismatch": "集团文件与该平台的报告描述的是不同的账本，它们可能属于不同的子公司。",
  "failure.entity_sums_mismatch": "集团文件与该平台的报告在该平台的总额上不一致。",
  "failure.digest_mismatch": "这份证明属于另一份报告，可能是另一天的——请索取与这份报告一同签发的证明。",
  "failure.unknown_signer":
    "这份报告不是由你提供的受信任密钥签名的。要么密钥有误，要么这份报告并非来自你以为的那一方。",
  "failure.bad_signature": "这份报告的签名无法验证，报告已被改动。",
  "failure.root_hash_mismatch": "你的条目折叠后得不到已公布的根。展示给你的余额不是被承诺的那一个。",
  "failure.root_sums_mismatch": "已公布的总额与已承诺条目实际加总的结果不一致。",
  "failure.unsupported_version": "该文件使用了不受支持的格式版本（{found}）。",
  "failure.malformed": "文档格式错误：{detail}",
  "failure.asset": "{detail}（资产 {asset}）",
  "value.malformed": "（格式错误）",
  "value.none": "（无）",
  "fact.yourBalance": "你的余额",
  "fact.publishedTotals": "已公布总额",
  "fact.root": "根",
  "fact.publisher": "发布方",
  "fact.snapshotTime": "快照时间",
  "fact.ledgerOffset": "账本偏移量",
  "fact.entriesCommitted": "已承诺条目数",
  "fact.badDebt": "已披露坏账",
  "fact.houseExcluded": "已剔除的自营账户",
  "fact.withheld": "对该受众不披露",
  "fact.provenNotShown": "已证明但不展示",
  "fact.entity": "你所属的实体",
  "fact.groupTotals": "集团合并总额",
  "fact.groupPublisher": "集团发布方",

  "flow.root.label": "{profile} 根",
  "flow.root.detail": "{hash}… 覆盖 {count} 个已承诺条目",
  "flow.total.detail": "{amount} — 由每一个已承诺条目加总得出",
  "flow.leaf.label": "{leaf} 条目",
  "flow.leaf.labelGeneric": "条目",
  "flow.leaf.detail": "共 {count} 个，已承诺但未公布。每位持有人都能证明自己的条目，而不暴露其他人的。",
  "flow.offset.label": "账本偏移量",
  "flow.offset.detail": "{offset} — 发布方事件历史中本报告“截至”的那个点",
};

export const VERIFIER_MESSAGES: Catalog<VerifierKey> = { en, "zh-CN": zhCN };

export type VerifierTranslator = Translator<VerifierKey>;

export const verifierTranslator = (locale: Locale): VerifierTranslator =>
  makeTranslator(VERIFIER_MESSAGES, locale);

/** What the pure modules speak when nobody hands them a language. */
export const englishVerifier: VerifierTranslator = verifierTranslator("en");
