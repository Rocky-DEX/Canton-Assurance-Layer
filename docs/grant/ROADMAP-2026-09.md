# Canton Assurance Layer — Grant 路线图（2026-09-09）

**目的：** 把已经交付的 Canton Assurance Layer 拆成若干个单目标、RFP 对齐、以采用率结算的 Canton Development Fund 提案，并给出提交顺序、前置条件和风险应对。
**读者：** Rocky 团队内部。提案正文本身用英文，按 `proposals/_template.md` 写，本文只管「投什么、按什么顺序、凭什么」。
**信息截止：** 2026-09-09。竞品状态来自 `canton-foundation/canton-dev-fund` 的 PR；RFP 原文来自 `2026-2028-strategic-roadmap.md`。

---

## 0. 一页结论

| 事项 | 结论 |
|---|---|
| 主攻 RFP | **RFP 11 Public verifiability**（Financial Markets, Standards & Verification）。RFP 原文把方案分三档，「简单档」= *standardized tooling for asset issuers to publish public aggregates of activity and value*，本项目就是这一档的完整实现，且截至今日**没有任何提案投过 RFP 11**。 |
| 次要 RFP | RFP 12.2（RWA 工作流标准：repo / DvP / fund NAV 的 profile + conformance）、RFP 27（audit trail / compliance evidence / selective disclosure）。 |
| 不投 | RFP 11 的 TEE 档和 ZK 档（内部路线图已定：先投简单档，TEE 作为后续独立提案）；RFP 12.1 身份凭证（会和 Identity & Metadata SIG 的 CIP 撞车）。 |
| 拆分 | **三个提案，串行提交**：A 标准与独立验证工具（RFP 11）→ B 机构 RWA 披露 profile（RFP 12.2）→ C 披露控制台与审计证据交付（RFP 27）。每个 ≤ 6 个月、单目标、≥ 45% 采用率结算。 |
| 最大优势 | 别人交 proposal，我们交**已跑在生产环境的代码 + 冻结的规范 + 61 个 conformance case + 三个实现**。提案形态照搬 `docs/grant/simulator/submission/` 里 fee-estimator 的写法：M1「delivered with this proposal」，grant 只付校准、外部方和采用。 |
| 最大风险 | 1) **Champion 字段无效会被机器人直接关 PR**（#759、#657 都是这样死的）；2) 评审会问「除了 Rocky 还有谁要」（#87 上 hythloda 原话）；3) 单机构受益的观感。三者都要在提交前解决，见 §5。 |

---

## 1. 资产盘点：已经交付什么，还缺什么

按 README 的里程碑对照，grant 提案不是「要钱做」，而是「已做完，要钱把外部方拉进来」。

| 里程碑 | 状态 | 缺口（需要外部方或钱） |
|---|---|---|
| M0 报告与证明文档 | 完成。Ed25519 签名、report/proof v1+v2、golden fixtures、JSON Schema | 无 |
| M1 资产侧（coverage） | 格式、CLI、`canton-reserve-attest` 完成；已对 mainnet participant 只读跑通 4 个真实持仓 | 对 localnet 的端到端 seeded 演示；与 token standard 持仓合约的对接 |
| M2 链上锚定 | 格式、chain 校验、Daml 包完成；已在本地 sandbox 部署三段锚链 | 上到承载真实价值的 synchronizer；public observer party 的治理方案 |
| M3 选择性披露 profile | 6 个 profile + manifest + 层级承诺 + 受众分包全部交付 | `collateral.repo` / `fund.nav` / `settlement.dvp` / `eligibility.holder` **只有我们自己跑过** |
| M4 披露控制台 | designer/viewer/publish CLI 完成；**Hosted console（SaaS）2026-09-09 交付**，可 `docker compose` 自托管 | 浏览器直连 participant；定时发布；KMS 签名；非技术人员的 walkthrough 验证 |
| M5 独立验证工具 | CLI 全部动词、离线验证页、性能基准完成 | crates.io / npm / 预编译二进制的正式发布与维护计划 |
| M6 生态标准化 | conformance 61 case、SPEC v1.2 冻结、spec-audit 第三实现、CIP 草稿、integrator 指南、外联信件全部就绪 | **第二个独立实现方、第三方安全审计、CIP 正式提交**——三件事都需要项目之外的人 |

结论：M6 的三个缺口和 M3 的「只有我们跑过」正是 grant 应该买的东西，也恰好是评审最看重的「adoption」。

---

## 2. RFP 匹配与引用

### 2.1 RFP 11 Public verifiability（主攻）

原文要点及本项目的对应：

| RFP 原文 | 我们的对应 |
|---|---|
| "An aggregate value published by an issuer might not be trusted by the market" | SPEC §16 assurance levels：每个数字标明 `cryptographically-verified` / `ledger-derived` / `third-party-attested` / `issuer-attested` / `claimed-only`，验证器独立判定，超报即失败 |
| "private transaction disclosure defeats confidentiality" | Merkle sum tree + 每快照轮换的 HMAC salt + 披露 manifest：只公布 root 和总量，客户自己在浏览器验证包含性 |
| "Standardized tooling for asset issuers – including decentralized asset issuers" | 冻结的 wire format、三个实现、conformance corpus、compatibility statement、`interop/` 双向互通流程 |
| "public verifiability of key metrics… total supply, volume" | `fund.nav`（units outstanding）、`settlement.dvp`（成交量）、`solvency.liabilities`（负债总额）三个 profile 直接产出这些指标 |

**提交路径：** `rfps/financial-markets-standards-verification/`。
**Label：** `regulatory-compliance`（#759 被机器人自动打的就是这个），备选 `financial-workflows-composability`。
**SIG：** 查 `sig-directory.md` 里对应 Financial Markets / Regulatory 的 SIG，Champion 必须来自 Tech & Ops Committee 认可的名单（CIP-0100）。

### 2.2 RFP 12.2 Daml and Institutional RWA Workflow Standards（第二提案）

原文列出的 "Delivery-versus-payment and settlement-flow patterns"、"Repo, collateral, lending, and servicing workflows"、"Conformance tests and reference implementations"、"support multiple issuers and applications rather than a single proprietary implementation" 与 `collateral.repo` / `settlement.dvp` / `fund.nav` profile 一一对应。先例 `2026-03-DA-token-standard-v2.md` 说明委员会接受「标准 + conformance」形态的提案。

### 2.3 RFP 27 Security Monitoring, Auditability and Evidence（第三提案）

原文要求 "audit trails, compliance evidence… identify the threats being monitored, whether the scope is at the entity or network level, required data sources and how privacy, access controls, and selective disclosure will be handled"。Evidence pack（§15）、anchor chain（§12）、auditor workspace 和 manifest-diff 正是「实体级的合规证据交付」。这条 RFP 的提问格式和 RFP 20 一样，提案里要逐条回答。

### 2.4 顺带可用、但不单独投的

- **RFP 21 独立安全评估：** 申请人应是安全公司而非我们。用法：把 `docs/outreach/security-review-rfp.md` 发给候选审计方时，附上 RFP 21 链接，让**他们**去申请对本项目的审计，或在提案 A 里作为预算子项包进来（推荐后者，责任单一）。
- **RFP 28 Member assurance：** "attestations and assurance processes for Canton participants"，是提案 C 之后的延伸，不现在投。
- **RFP 12.1 身份凭证：** `eligibility.holder` 只在 Motivation 里提一句「可承接凭证标准的输出」，不做承诺。

### 2.5 明确不投

- RFP 11 的 TEE 档、ZK 档：#22（ZK Verification & Anchoring）已关闭，#92 把 ZK 偿付能力验证捆在 agentic wallet 里没有进展。等提案 A 落地、有了外部实现方之后，再以「attested aggregation in a TEE」补 completeness 缺口（§6）。

---

## 3. 竞争格局（2026-09-09）

| PR | 提案 | 状态 | 与我们的关系 |
|---|---|---|---|
| [#759](https://github.com/canton-foundation/canton-dev-fund/pull/759)（及重复的 #756/#757） | Canton Reserve Attestation：用 Daml `ensure` 让提款不能击穿负债，PQS 离线聚合，公开一个 solvent 布尔值 | **2026-09-03 被机器人自动关闭**，原因 Champion 字段无效；label `regulatory-compliance`；独立开发者；320k CC / 14 周 | 思路互补而非竞争：它只覆盖「资产和负债都是 Canton 原生合约」的托管方，且要求托管方重写合约；我们是对任意账本快照的承诺格式。它的 `SolvencyAttestation` 合约可以直接发布我们的 root。它点名的 BitGo、Copper、Dfns、BitSafe 是我们的目标采用方名单 |
| [#87](https://github.com/canton-foundation/canton-dev-fund/pull/87) | ARU 商品储备基础设施，含 Proof-of-Reserves 模块（接外部 PoR 服务 Accountable） | Open，`Needs Revision`；1.4M CC；Champion 写的是 "Canton Foundation" | 评审 hythloda 追问：「除了 ARU 还有谁要？能否泛化？」——这就是我们会被问的问题。它的 PoR 是把第三方证明塞进合约，等于我们的 `third-party-attested` 一档，没有客户自验 |
| [#92](https://github.com/canton-foundation/canton-dev-fund/pull/92) | Agentic wallet + ZK 对手方风险验证 | Open，`wallet-apps`，六个里程碑捆绑 | 违反单目标规则的反例；ZK 档我们不碰 |
| [#22](https://github.com/canton-foundation/canton-dev-fund/pull/22) | ZK Verification & Anchoring Framework | 2026-03-20 关闭 | 说明 ZK 档目前不被买单 |
| [#657](https://github.com/canton-foundation/canton-dev-fund/pull/657) | Proof of Audits（DAR 审计 + Trust Passport） | 2026-08-21 无 Champion 自动关闭 | 又一个死于 Champion 字段的样本 |
| [#3](https://github.com/canton-foundation/canton-dev-fund/pull/3) | CARA 合规助手（跨机构 attestation） | Open，无进展 | 不重叠 |
| [#302](https://github.com/canton-foundation/canton-dev-fund/pull/302) | Hacken 监控与风险评分 | **已批准** | 潜在的 auditor workspace 用户，也是 Champion 候选的参照 |

三点结论：

1. **RFP 11 是空的。** 搜索 "public verifiability" 零结果，`rfps/financial-markets-standards-verification/` 目录下没有可见提案。
2. **没有人有「规范 + conformance + 多实现 + 生产部署」。** 所有竞品都停在 Daml 模板或架构图。
3. **机器人先于人审。** Champion 字段不合法直接关 PR，连评审都见不到。

---

## 4. 提案拆分与时间线

```
2026-09  准备期：Champion、采用方、仓库整理（§5）
2026-10  提交 A ─────────────────┐
2026-11  A 进入 In Review        │ A 的 Champion 确认后再提交 B
2026-12  提交 B                  │
2027-01  A 投票 / B In Review    │
2027-03  A M2-M3 交付            │ B 有 Champion、A 已过票后提交 C
2027-04  提交 C                  │
2027-06  A 结项；B M3            │
2027-09  B 结项；C M2-M3         │
2027-Q4  (可选) D：TEE 档，独立提案
```

依赖关系：B 依赖 A 的第二实现方（profile 必须由别人跑）；C 依赖 A 的安全审计（SaaS 托管签名密钥，没有审计不可能让审计方/监管方用）。

### 提案 A — Canton Verifiable Disclosure Format：标准化与独立验证工具

- **RFP：** 11（简单档）。**Label：** `regulatory-compliance`。
- **单一目标：** 让一个 Canton 机构发布的披露报告，能被**不使用发布方任何软件**的第三方验证。
- **金额与周期：** 500k–600k CC，6 个月，采用率结算 ≥ 45%。参照：#297 450k、#759 320k、fee-estimator 草案 360k；本提案交付量更大且含外部审计预算。
- **里程碑：**
  - M1（随提案交付）：SPEC v1.2、61 case conformance、Rust/TypeScript/Python 三实现、`canton-solvency-verify` CLI、离线验证页、Rocky 生产部署。价值指标：评审自己跑通 `python3 spec-audit/verify_from_spec.py`。
  - M2（+8 周）：**第二个独立实现方**发布 compatibility statement 进 `statements/`，其报告进 `interop/`；发现的规范缺陷全部记入 `spec-audit/README.md`。价值指标：至少 1 家非 Rocky 组织的实现通过 corpus。
  - M3（+8 周）：**第三方安全审计**按 `docs/SECURITY-REVIEW-BRIEF.md` 范围完成，findings 与 remediation 公开进仓库；crates.io / npm / 预编译二进制正式发布。
  - M4（+8 周）：**CIP 正式提交**（`docs/cip/` 草稿已就绪）；≥ 3 家独立组织（目标画像：1 家交易所或托管方发布报告、1 家审计/数据机构运行验证器、1 家钱包或门户集成离线验证页）书面确认使用。维护计划与命名的维护人。
- **Rationale 必答题：** 为什么不扩展 #87 的 PoR 模块 → 它是把第三方证明存进合约，没有客户自验、没有格式、绑定单一 PoR 供应商；为什么不用 #759 的结构式方案 → 只适用 Canton 原生资产且要求托管方改合约，我们的 anchor 可以和它并存。
- **Backward Compatibility 必写：** wire identifier 保留 `rocky-solvency-*`，改名会让已签署文件失效；README「Naming」一节已有现成措辞。

### 提案 B — 机构 RWA 披露 profile：repo、fund NAV、DvP

- **RFP：** 12.2。**Label：** `token-asset-standards` 或 `financial-workflows-composability`。
- **单一目标：** 四个非 solvency profile 各由至少一家真实发行方/平台端到端跑通，成为可引用的 RWA 工作流标准。
- **金额与周期：** 450k–550k CC，6 个月。
- **里程碑：** M1（随提案交付）四个 profile 的格式、golden vector、conformance case；M2 `coverage.custody` 对接 token standard v2 / CIP-56 持仓合约，`canton-reserve-attest` 从「保存的 ACS 响应」升级为直连 participant 读取并绑定同一 offset；M3 与 1 家代币化基金发行方跑 `fund.nav`、1 家 repo/结算平台跑 `collateral.repo` 或 `settlement.dvp`，各自在 `interop/` 留下报告；M4 profile 进入 CIP 的 registry 附录，≥ 2 家发行方持续发布。
- **采用方候选：** #87 的 ARU（他们缺 PoR 格式，我们缺商品发行方）、Broadridge DLR 类 repo 平台、Franklin Templeton Benji 类基金平台的技术合作方、Kaiko（#12 先例，市场数据方是天然的验证器用户）。

### 提案 C — 披露控制台与审计证据交付

- **RFP：** 27。**Label：** `regulatory-compliance`。
- **单一目标：** 合规团队不写代码即可发布、锚定、分发披露；审计方/监管方在浏览器里复验整包证据。
- **金额与周期：** 550k–650k CC，6 个月。
- **里程碑：** M1（随提案交付）hosted console + 自托管 `docker compose`、publisher/customer/auditor 三工作台、公开透明页、中英双语；M2 链上锚定上到真实 synchronizer、public observer party 治理方案文档化、KMS 签名后端、定时发布；M3 非技术操作员 walkthrough 由 ≥ 2 家非 Canton 工程师团队验证通过；M4 ≥ 3 家组织通过控制台发布，≥ 1 家审计机构使用 auditor workspace 复验并出具意见。
- **必须正面回应的观感问题：** 「SaaS 是不是 Rocky 的商业产品」→ Apache-2.0、自托管为一等公民、账单功能明确不在范围、验证永远在客户端、服务器只是分发；「监管方看到什么」→ 逐字段 manifest，减少披露会留下 diff。
- **RFP 27 的四问要逐条答：** 监控什么威胁（发布方改写历史、少报负债、缩减披露、两套账本给两类受众）；范围（实体级）；数据源（发布方自己的账本快照 + participant 的 ACS，全部 node-local）；隐私与选择性披露（manifest + 受众分包 + 锚只带摘要不带金额）。

### 提案 D（可选，2027 H2）— RFP 11 TEE 档

补目前格式承认的 completeness 缺口（一个 inclusion proof 证明不了「所有客户都在树里」）：在 TEE 内从账本快照构树，把 `ledger-derived` 提升为可远程证明的等级。只在 A 落地、有外部实现方、审计完成后再投，且作为独立提案。

---

## 5. 提交前必须完成的事（按阻塞程度排序）

1. **Champion。** 硬阻塞，机器人在人审前就关 PR。行动：向 `grants-discuss@lists.sync.global` 发帖；在对应 SIG 例会上做 10 分钟演示（演示内容就是 §1 的资产盘点 + 现场跑 spec-audit）；#302 Hacken 已批准、#87 的 Champion 是 Foundation，可询问同一批评审。提案文件里的 Champion 字段要么是名单上的合法名字，要么写 `Needs Champion`，不能写「TBD」或个人名字。
2. **采用方名单。** 提交前至少拿到 2 封书面意向（第二实现方 1 封、报告发布方或验证方 1 封）。`docs/outreach/second-implementer.md` 已写好，现在就发；目标依次是 #759 点名的托管方（BitGo、Copper、Dfns、BitSafe）、Hacken、Kaiko、ARU。
3. **需求证据。** RFP 11 原文本身就是需求陈述，但评审还会要外部证据。可引用（引用前核对条文）：美国 GENIUS Act 对稳定币发行方的月度储备报告与会计师审验要求；MiCA 对 EMT/ART 发行方的储备资产报告义务；JPMD、USDCx 已在 Canton 原生发行，两者的发行方都直接落在这些义务下。DevRel 调研不覆盖本方向，不要硬引。
4. **仓库整理。** README 的 CI/spec badge 和 CIP 草稿链接仍指向 `Rocky-exchange/canton-proof-of-solvency`，而远端是 `Rocky-DEX/Canton-Assurance-Layer`；`docs/outreach/` 两封信里写的 "21 conformance cases" 已过时（现为 61）；README「Who Is Using」只有 Rocky。评审会点开每个链接。
5. **每个提案只一个目标。** A 里不要塞 profile，B 里不要塞控制台。模板 §1 和指南 §14.2 都明说了。
6. **验收标准写价值不写产物。** 模板原话："10 dApps adopting this capability by August" 算，"100% of CI tests passing" 不算。每个里程碑至少一条「N 家组织确认」。
7. **资金条款。** 每个提案 ≤ 6 个月，写明 CC/USD 波动条款；采用率结算部分 ≥ 45%，与 #481（41%）、#327（50%）持平。
8. **主动回答隐私四问。** 哪些数据、是否 node-local、metadata 不再公开时是否还能工作、如何处理选择性披露。本项目全部数据都是发布方自有的账本快照，锚只带摘要——这一点是相对 indexer 类提案的优势，要写出来。

---

## 6. 风险与应对

| 风险 | 应对 |
|---|---|
| 「Rocky 是唯一用户，这是单机构受益」 | 格式而非产品；Apache-2.0；三实现；`interop/` 让任何人先于我们验证自己的报告；提案 A 的钱主要付给项目之外的人（实现方、审计方） |
| 「为什么不扩展 #87 / #759」 | §4 提案 A 的 Rationale 已备好；强调可并存：#759 的合约可发布我们的 root，#87 的 PoR 模块可接受我们的 coverage statement |
| completeness 缺口被评审抓住 | 先于评审说出来（SECURITY-ANALYSIS 已写明），并指出 D 是补法；`recompute` 给审计方全量核对 |
| wire identifier 里有 "rocky" 被视为厂商绑定 | Backward Compatibility 一节引用 README「Naming」：改名会让已签署文件失效，格式的全部价值在于上季度的证据今天仍能验证 |
| 独立开发者 / bus factor 观感 | 维护计划里命名维护人和交接方式；Rocky 生产环境本身就是持续维护的证据 |
| CC 价格波动、6 个月上限 | 三个提案各自 ≤ 6 个月，串行而非并行 |
| 与 canton-sim（`rust/sim-*`，提案在 `docs/grant/simulator/`）的两个 DPM 提案撞期 | 不同 RFP、不同 SIG、不同 label，可以并行；但同一周不要开两个 PR，避免评审觉得在刷量 |

---

## 7. 未来 30 天行动清单

- [ ] 修 README 链接与 badge 指向 `Rocky-DEX/Canton-Assurance-Layer`；更新 outreach 信件里的 case 数
- [ ] 发出第二实现方邀请（≥ 4 家）和安全审计询价（≥ 2 家）
- [ ] 找到 RFP 11 对应 SIG 及例会时间，报名演示；发 grants-discuss 帖
- [ ] 核对 GENIUS Act / MiCA 条文，写成提案 Motivation 的两段引用
- [ ] 用 `docs/grant/simulator/submission/` 的格式起草提案 A 英文稿，放 `docs/grant/2026-10-Rocky-verifiable-disclosure-format.md`
- [ ] 准备 5 分钟演示脚本：clone → `python3 spec-audit/verify_from_spec.py` → 打开 `offline/verifier.html` 验一个 Rocky 生产 proof
