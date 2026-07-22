# SRS-Formalizer 技能根因分析报告

> **生成时间**：2026-07-22
> **分析范围**：`.claude/skills/srs-formalizer/scripts/` 全量代码 + SKILL.md + AGENTS.md + references
> **分析方法**：4 个并行子代理分子系统深度审查 + 跨子系统去重 + 事实核验
> **当前状态**：typecheck 通过；332 测试中 331 通过、1 失败（Windows EPERM）

---

## 一、执行摘要

对 SRS-Formalizer 技能代码库进行了系统性根因分析，共识别 **73 个独立问题**，分布如下：

| 严重程度 | 数量 | 占比 |
|---------|------|------|
| P0 阻塞 | 6 | 8% |
| P1 严重 | 22 | 30% |
| P2 一般 | 28 | 38% |
| P3 提示 | 17 | 23% |

**最严重的三类系统性根因**（影响多个具体问题）：

1. **Windows 跨平台兼容性全面失守**：`refuseDirectInvocation`、`renameSync`、`process.cwd()` 依赖、Lean 硬阻断、路径分隔符等 8+ 个问题共同表明 "verified on both Windows and Linux" 的声明名不副实。
2. **文档与代码严重漂移**：命令数（17/18/19/22 四方不一致）、IR 版本（2.0.0 vs 2.1.0）、文件行数（272 vs 实际 408）、riskScore 公式未实现——反映出文档更新流程缺乏自动化门禁。
3. **安全边界执行不一致**：`validate-glossary` 的 `--workdir` 可选绕过、`validate-cypher`/`hash-compute`/`tlc-trace-parse` 完全不校验工作目录、FINAL 门禁不检查 irHash、BDD 不要求工具执行证据——安全约束在"已实现"和"声明"之间存在系统性差距。

---

## 二、P0 阻塞级问题（6 个）

### P0-1: 产物提升非原子且 Windows 上 renameSync 抛 EPERM 致数据丢失

- **位置**：[promotion.ts](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/lib/artifacts/promotion.ts#L28-L44)（`replaceDirectory` 行 28-34、`promoteFiles` 行 36-44、`promoteFilesMerge` 行 55-66）
- **类别**：跨平台兼容性 / 数据完整性
- **根因分析**：
  `replaceDirectory` 流程是"删除 targetDir → rename staging → targetDir"。在 Windows 上，`fs.rmSync` 返回后 OS/杀毒软件可能仍持有目录句柄，`fs.renameSync` 抛 `EPERM`。此时 **targetDir 已被删除但 staging 未就位**，verified/ 目录直接消失。全代码库对 `process.platform`/`win32`/`EPERM` 的 grep 返回 0 命中，完全没有平台分支或重试逻辑。已知失败测试 `assessment-fixes.test.ts:58` 直接复现此问题。`validation-report.ts:136` 的单文件 renameSync 有同类风险。
- **影响**：所有 `validate-* --strict --promote` 流程在 Windows 上阻塞或丢数据，违反 AGENTS.md "Windows 与 Linux 均已验证" 声明。
- **当前测试**：1 失败（`promoteFiles keeps destructive whole-directory replace semantics`）

### P0-2: validate-glossary 的 --workdir 可选致路径安全检查完全绕过

- **位置**：[validate-glossary.ts](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/commands/validate-glossary.ts#L196-L209)（行 196-209）
- **类别**：安全漏洞 / 约束违反
- **根因分析**：
  行 196 `if (workDirArg) {` 把整个 `validateWorkDir` + `isPathSafe` 检查放在条件块内。不传 `--workdir` 时，整个路径安全检查被跳过，行 209 `fs.readFileSync(filePath, 'utf-8')` 会读取文件系统上任意路径。AGENTS.md 硬约束明确要求 "all remaining commands use --workdir"。`index.ts:29` 帮助文本也标注 `--workdir .srs_formalizer` 为必选。测试文件 `validate-glossary.test.ts` 对 workdir/outside 的 grep 返回 0 命中，安全缺口无测试覆盖。
- **影响**：恶意构造的术语表文件路径可读取 `.srs_formalizer` 外任意文件，违反沙箱边界。

### P0-3: assessInjectionGate 的 NaN 输入绕过校验，可非法开启数据流注入门控

- **位置**：[dataflow-gate.ts](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/lib/dataflow-gate.ts#L73-L87)（行 73-87）
- **类别**：算法正确性 / 安全漏洞
- **根因分析**：
  `typeof NaN === 'number'` 为 true，而 `NaN < 0`、`NaN > 1`、`NaN > threshold` 全部返回 false。因此 `falsePositiveRate: NaN` 和 `sampleSize: NaN` 不触发任何错误，`enabled = errors.length === 0` 变为 true，注入门控被非法开启。虽然 CLI 入口 `analyze-dataflow.ts:99` 有 `Number.isNaN()` 拦截，但 `assessInjectionGate` 是导出的纯函数，可被直接调用，缺少纵深防御。测试未覆盖 NaN 边界。
- **影响**：数据流 Layer-2 注入可能在未签字的情况下被开启，污染 BDD/TLA+ 产物。

### P0-4: findCrossFileIslands 孤儿分片过滤逻辑错误

- **位置**：[graph-algorithms.ts](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/lib/graph-algorithms.ts#L225)（行 225）
- **类别**：算法正确性
- **根因分析**：
  ```typescript
  const orphanShards = [...si.entries()].filter(([, v]) => v === 1).map(([k]) => k);
  ```
  `v` 是分片所属连通分量索引（0-based）。`v === 1` 仅匹配第二个连通分量中的分片，而非所有孤儿分片。若图有 3+ 个连通分量，索引 2、3… 中的孤儿分片被漏检。该函数当前无调用方（死代码），但作为导出 API 存在正确性缺陷。
- **影响**：若未来接入此函数，会漏报孤儿分片，绕过 R3 孤儿裁决门禁。

### P0-5: bdd-tool-runner Shell 命令注入 + Gherklin 配置写而不用

- **位置**：[bdd-tool-runner.ts](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/lib/bdd-tool-runner.ts#L34)（行 34、行 62-80）
- **类别**：安全约束 / 命令注入 / 逻辑缺陷
- **根因分析**：
  两个叠加问题：
  1. **Shell 注入**：行 34 `execSync(\`npx gherkin-lint ${args}\`)` 使用字符串形式而非 `execFileSync` 数组形式。`featuresDir` 来自用户 `--workdir`，虽经 `validateWorkDir` 校验 basename，但完整路径可含空格、分号等 shell 元字符。攻击路径：`--workdir "C:\Users\test;calc.exe;.srs_formalizer"`。
  2. **配置写而不用**：行 62-80 写入 `gherklin.config.ts`，但 gherklin 调用未显式传递配置路径，仅靠 `cwd: configDir` 隐式依赖自动发现。若 gherklin 不自动发现，所有规则失效，Phase 4 形同过场。配置中 `indentation: 'off'` 还主动关闭了缩进检查，与 strict 模式矛盾。
- **影响**：BDD Phase 3+4 校验可被 shell 注入绕过，或因配置失效而形同过场。

### P0-6: validate-cypher 跨行引号跟踪逻辑根本性损坏

- **位置**：[validate-cypher.ts](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/commands/validate-cypher.ts#L31-L54)（`countUnclosedQuotes` 行 31-54、调用方行 134-145）
- **类别**：校验逻辑正确性
- **根因分析**：
  `countUnclosedQuotes` 是无状态函数——始终以 `single=false, double=false` 开始，不接收传入状态。调用方在 `inSingleQuote=true` 时的更新逻辑 `inSingleQuote = quoteState.single > 0` 是错误的：
  - 场景 A（引号跨行关闭）：进入 `true`，当前行含一个 `'`（关闭），函数内部 `false→true` 返回 `single=1`，`inSingleQuote = (1>0) = true` — **错误**，应为 false。
  - 场景 B（引号仍跨行开放）：进入 `true`，当前行无 `'`，函数返回 `single=0`，`inSingleQuote = (0>0) = false` — **错误**，应保持 true。
  后果：跨行字符串中的括号被错误计入/排除，CALL { } IN TRANSACTIONS 括号深度跟踪在含多行字符串的 Cypher 中产生假阳/假阴。
- **影响**：含多行字符串的 Cypher 脚本校验结果不可信。

---

## 三、P1 严重问题（22 个）

### 3.1 跨平台兼容性（5 个）

#### P1-1: refuseDirectInvocation 在 Windows 上完全失效
- **位置**：[cli.ts](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/lib/cli.ts#L145-L168)（行 145-168）
- **根因**：Windows 上 `new URL(import.meta.url).pathname` = `/d:/.../commands/x.ts`（前导 `/`、正斜杠），`process.argv[1]` = `d:\...\commands\x.ts`（反斜杠、无前导）。`String.endsWith` 永远返回 false，守卫永不触发。
- **影响**：Windows 上任何人可绕过 `index.ts` 直接调用命令文件，跳过 `validateNoPoisonArgs` 入口校验。

#### P1-2: validate-lean 在 Windows 上硬阻断
- **位置**：[validate-lean.ts](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/commands/validate-lean.ts#L41)（行 41）
- **根因**：`if (os.platform() === 'win32') return { status: 'error', ... }` 直接拒绝。但 `execFileSync('lake', ...)` 在 Windows 上通过 elan 安装后实际可用。
- **影响**：Windows 用户无法完成完整 Backend 验证，与 AGENTS.md 跨平台声明矛盾。

#### P1-3: bdd-tool-runner 依赖 process.cwd() 定位配置，非 scripts/ 目录调用时失效
- **位置**：[bdd-tool-runner.ts](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/lib/bdd-tool-runner.ts#L12)（行 12、75）
- **根因**：`GHERKIN_LINTRC = path.join(process.cwd(), '.gherkin-lintrc-strict')`。若从项目根目录调用 `npx tsx .claude/skills/srs-formalizer/scripts/index.ts validate-bdd`，cwd 不是 scripts/，配置找不到 → 降级为无配置运行。
- **影响**：BDD Phase 3 gherkin-lint 在非 scripts/ 目录调用时规则失效。

#### P1-4: graph-algorithms.ts 路径字符串拼接，违反 path.join() 硬约束
- **位置**：[graph-algorithms.ts](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/lib/graph-algorithms.ts#L178)（行 178）
- **根因**：`const filePath = \`${workDir}/${graphDir}/${name}\`` 模板字符串拼接，Windows 上生成混合分隔符路径。
- **影响**：违反明确项目约束，Windows 上可能路径解析异常。

#### P1-5: validate-cypher 注释剥离破坏字符串中的 URL
- **位置**：[validate-cypher.ts](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/commands/validate-cypher.ts#L127)（行 127）
- **根因**：`line.split('//')[0]` 不区分字符串字面量内的 `//`。`CREATE (n:Api {url: 'http://example.com'})` 被误截断，语句被误判为未终止。
- **影响**：含 URL 的 Cypher 语句被误报为语法错误。

### 3.2 安全约束（4 个）

#### P1-6: FINAL 门禁从不校验 irHash，IR 变更后产物报告绑定失效
- **位置**：[validation-report.ts](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/lib/artifacts/validation-report.ts#L120-L130)（`readMatchingReport` 行 120-130）、[checks-final.ts](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/lib/verify-gate/checks-final.ts#L15-L16)（行 15-16）
- **根因**：`ArtifactValidationReport` 携带 `irHash`，validate-* 命令写入时 `irHash: sourceHash`，但 FINAL 的 `readMatchingReport` 只比较 `report.sourceHash === sourceHash`，从不读取当前 `srs-ir.json` 哈希比对。攻击路径：用 IR v1 校验 BDD → 弱化 IR 为 v2 → FINAL 只核对 BDD 文件未变 → 通过，但报告绑定的 IR 已过时。
- **影响**：IR 被弱化后，已验证产物仍能通过 FINAL，安全关键需求可能被绕过。

#### P1-7: BDD 产物在 FINAL 门禁不要求工具执行证据
- **位置**：[validation-report.ts](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/lib/artifacts/validation-report.ts#L108)（行 108）、[checks-final.ts](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/lib/verify-gate/checks-final.ts#L7-L17)（行 7-17）
- **根因**：`requireEvidence = artifactKind === 'tlaplus' || artifactKind === 'lean4'`，BDD 不要求 `toolEvidence`。AGENTS.md 声称 BDD 走 "Phase 3+4 (gherkin-lint + Gherklin)"，但 FINAL 接受仅含 `passed: true` 的手写 JSON 就能通过 BDD 校验。
- **影响**：Agent 可伪造 BDD 校验报告绕过 FINAL。

#### P1-8: validate-cypher/hash-compute/tlc-trace-parse 的 --workdir 声明但不校验
- **位置**：[index.ts](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/index.ts#L25)（行 25、45、46 帮助文本）vs 三个命令实现
- **根因**：`index.ts` 帮助文本为这三个命令标注 `--workdir .srs_formalizer`，但代码中完全不接受也不校验 `--workdir`，直接 `fs.readFileSync` 任意路径。
- **影响**：LLM agent 可被提示注入诱导读取工作目录外敏感文件（信息泄露）。

### 3.3 文档与代码不一致（5 个）

#### P1-9: 命令数量在四处文档中互不一致，且都与代码不符
- **位置**：
  - [index.ts](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/index.ts#L108-L134)（实际注册 22 条）
  - [AGENTS.md](file:///d:/srs_formalizer_opt/SRS-Formalizer/AGENTS.md)（声称 19 = 11 + 8）
  - [SKILL.md](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/SKILL.md#L487)（声称 17 = 10 + 7，行 487 还声明"以 index.ts 注册表为唯一来源"）
  - `references/a2a-integration.md`、`references/quick-reference.md`（声称 17）
  - `__tests__/index.test.ts:25`（注释声称 18 = 10 + 8）
- **根因**：`build-rid-mapping`、`analyze-fidelity`、`validate-convergence-log` 三条新增命令未同步到文档。SKILL.md 还停留在更早的 17 条。Gate Validators 数量一致（11），差异在 Independent Tools（声明 8，实际 11）。
- **影响**：Agent 按 SKILL.md 的 17 条清单编排时漏调新增命令，导致门禁绕过。

#### P1-10: IR 版本号在 SKILL.md / assemble-ir.ts / index.ts 之间三方不一致
- **位置**：
  - [assemble-ir.ts:257](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/commands/assemble-ir.ts#L257)（写死 `version: '2.1.0'`）
  - [index.ts:66](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/index.ts#L66)（`v2.0.0`）vs [index.ts:83](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/index.ts#L83)（`v2.1.0`，同文件两行版本不同）
  - [SKILL.md:256](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/SKILL.md#L256)（"v2.0.0"）、SKILL.md:351（"版本 2.0.0"）
  - `references/quick-reference.md:3`（"v2.0.0"）
- **根因**：ADR-0009 引入数据流抽取后 IR 升到 2.1.0，但文档未同步。`index.ts` 同文件出现两个版本号。
- **影响**：Agent 按 SKILL.md 校验时会把合法 2.1.0 IR 误判为版本不符。

#### P1-11: riskScore 评分公式完全未实现
- **位置**：AGENTS.md 声称 vs [types/srs-ir.ts:136](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/types/srs-ir.ts#L136)
- **根因**：AGENTS.md 明确声称 "风险公式：riskScore = orphanRate×0.2 + crossFileCoverage×0.3 + nfrCoverage×0.3 + gapWeight×0.2"。但全局搜索 `riskScore` 仅在类型定义和测试中出现，`orphanRate`/`crossFileCoverage`/`nfrCoverage`/`gapWeight` 四个变量名在整个 `scripts/` 目录下均无出现。IR 的 `meta.riskScore` 字段虽定义但永不被脚本填充，只能依赖 Agent 自行计算——与"脚本做确定性算法"的架构原则矛盾。
- **影响**：风险评分无确定性保证，不同 Agent 运行可能产生不同结果。

#### P1-12: AGENTS.md "current max is 272 lines" 已失真
- **位置**：[AGENTS.md](file:///d:/srs_formalizer_opt/SRS-Formalizer/AGENTS.md) 硬约束段
- **根因**：实际最大行数：`checks-r3.ts` 408 行、`connectivity-checker.ts` 394 行、`assemble-ir.ts` 333 行，均超 300 行硬约束。AGENTS.md 记录的 272 行已严重过时。
- **影响**：约束监控失守，无自动化门禁强制行数检查。

#### P1-13: 文件超过 300 行硬约束（3 个文件）
- **位置**：
  - [assemble-ir.ts](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/commands/assemble-ir.ts)（333 行）
  - [connectivity-checker.ts](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/lib/middle-end/connectivity-checker.ts)（394 行）
  - [checks-r3.ts](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/lib/verify-gate/checks-r3.ts)（408 行）
- **根因**：后续迭代中陆续加入新功能但未拆分模块，且无 CI 门禁强制行数检查。
- **影响**：违反硬约束，文件过大增加维护难度和出错概率。

### 3.4 校验逻辑缺陷（5 个）

#### P1-14: validate-jsonl 顶层字段检测逻辑存在缺陷
- **位置**：[validate-jsonl.ts](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/commands/validate-jsonl.ts#L90)（行 90、114-117）
- **根因**：R2 implicit 检查 `if ((record).derived_from !== undefined && !meta)` 带了 `&& !meta`，意味着只有当 `metadata` 字段同时缺失时才报错。若记录既有 `metadata` 又在顶层冗余写了 `derived_from`（典型错位场景），检查不触发。R3 relational 有相同缺陷。
- **影响**：Agent 提取时字段放错位置会被静默放行，污染下游 IR。

#### P1-15: checkOrphanAdjudication 把"提议桥接"当作"已接受桥接"
- **位置**：[checks-r3.ts](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/lib/verify-gate/checks-r3.ts#L361-L368)（行 361-368）
- **根因**：`checkConnectivity` 的 `proposeBridges` 基于文本相似度自动**提议**桥接边，但 R3 门禁把它们当作**已接受**的桥接，直接豁免孤儿裁决。AGENTS.md 说"或有被接受的桥接边"，但代码没有"接受"机制——任何被提议的桥接都算数。一个完全无关的孤儿分片，只要其某节点与另一分片某节点共享常用词（如"系统"），就会被自动豁免。
- **影响**：孤儿裁决门禁被文本相似度噪音绕过。

#### P1-16: checkFormalArtifacts 用可选链读取 nfrProfile，IR 残缺时 Lean 被静默跳过
- **位置**：[checks-final.ts](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/lib/verify-gate/checks-final.ts#L86-L92)（行 86-92）
- **根因**：`ir.nfrProfile?.detectedCategories?.some(...) ?? false` 使用可选链和 `?? false`。若 `srs-ir.json` 缺少 `nfrProfile`（被截断或手工编辑），`leanRequired` 默认 false，Lean 校验被静默跳过，即使 IR 实际声明了 security/compliance NFR。`SRSIR` 类型定义中 `nfrProfile` 是必填字段，应 fail-closed 而非 fail-open。
- **影响**：IR 残缺时安全关键 NFR 的 Lean 校验被静默跳过。

#### P1-17: Gherklin 配置主动关闭缩进规则，削弱 strict 验证
- **位置**：[bdd-tool-runner.ts](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/lib/bdd-tool-runner.ts#L68)（行 68）
- **根因**：`rules: { indentation: 'off' }` 与 `.gherkin-lintrc-strict` 中 `"indentation": ["on", ...]` 矛盾。Phase 3 检查缩进，Phase 4 不检查，削弱了 strict 模式的严格性。
- **影响**：Gherklin 检测到 gherkin-lint 遗漏的缩进问题不会报错。

#### P1-18: cypher.ts 标签和属性键未转义
- **位置**：[cypher.ts](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/lib/cypher.ts#L25-L29)（行 25-29、93-101）
- **根因**：`node.labels.map(l => \`:${l}\`)` 标签未转义，含特殊字符时生成无效 Cypher 语法。属性键 `${k}:` 直接插入，含特殊字符会导致语法错误或注入。`JSON.stringify` 产生双引号字符串，但 `generateCreateEdge` 用 `escapeCypherString` 产生单引号，风格不一致。
- **影响**：含特殊字符的标签/键生成无效 Cypher 或注入风险。

### 3.5 其他严重问题（3 个）

#### P1-19: legacy security.ts 导入未迁移
- **位置**：[validate-jsonl.ts:15](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/commands/validate-jsonl.ts#L15)、[validate-architecture.ts:14](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/commands/validate-architecture.ts#L14)、[validate-dataflow.ts:17](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/commands/validate-dataflow.ts#L17)
- **根因**：AGENTS.md 约定 "New code uses `cli.ts` for arg parsing and path safety. `security.ts` exists but is legacy." 但三个命令仍从 `security.ts` 导入。`security.ts` 现在仅 4 行纯 re-export，是历史包袱。
- **影响**：两套导入路径让维护者困惑，保留无用 legacy 模块。

#### P1-20: validate-glossary 返回 status:'error' 违反 validate-* 契约
- **位置**：[validate-glossary.ts:234](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/commands/validate-glossary.ts#L234)
- **根因**：其他 validate-* 命令的契约是：校验失败时 `status: 'ok'` + `data: { valid: false, errors: [...] }`。`validate-glossary.ts` 却在 `data.passed === false` 时直接返回 `status: 'error'`，导致 `index.ts:164` 以退出码 1 终止。Agent 框架会当作命令执行失败处理，触发不必要的重试或中止。
- **影响**：术语表格式校验失败被误判为流程错误。

#### P1-21: text-analysis.ts 否定/肯定模式仅支持中文，英文 SRS 不支持
- **位置**：[text-analysis.ts:22-23](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/lib/text-analysis.ts#L22-L23)
- **根因**：`NEGATION_PATTERNS` 和 `AFFIRMATION_PATTERNS` 所有模式均为中文正则。`SRSIR.meta.language` 支持 `'zh' | 'en'`，但 `isAntonymPair`/`hasNegation`/`hasAffirmation` 对英文 SRS 完全失效。英文 "must not"、"shall not" 不会被检测。
- **影响**：英文 SRS 的冲突检测无效。

#### P1-22: dataflow-analyzer 假设边方向，反向边静默丢弃
- **位置**：[dataflow-analyzer.ts:74-80](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/lib/middle-end/dataflow-analyzer.ts#L74-L80)
- **根因**：`entities.get(e.target)` 假设 data_entity 总是 target。若边被错误反向，实体被误报为 `gap`（use-before-def）或 `dead_data`（write-only）。`validate-semantics.ts` 未校验边端点类型方向。
- **影响**：数据流分析产生假阳/假阴。

---

## 四、P2 一般问题（28 个，按类别分组）

### 4.1 类型安全（4 个）

| 编号 | 位置 | 问题 |
|------|------|------|
| P2-1 | `assemble-ir.ts:245` | `dfRecords as DataFlowRecord[]` 强转绕过类型安全 |
| P2-2 | `jsonl.ts:16` | `JSON.parse(line) as JsonlRecord` 无运行时结构校验 |
| P2-3 | `graph-operations.ts:29` | `null as unknown as GraphEdge` 双重断言 |
| P2-4 | 测试文件 5 处 | `as any` 违反 "0 any" 硬约束（`assemble-ir.test.ts:65,69,70`、`jsonl.test.ts:25`、`index.test.ts:16`） |

### 4.2 代码质量（8 个）

| 编号 | 位置 | 问题 |
|------|------|------|
| P2-5 | `assemble-ir.ts:100-110` | `readDataFlowRecords` 绕过 `lib/jsonl.ts`，丢失精确错误定位 |
| P2-6 | `validate-architecture.ts:23,87` | `ASCII_ONLY_RE` 冗余且无测试（id 格式正则已隐含 ASCII 约束） |
| P2-7 | `graph-operations.ts:46-53` vs `srs-ir.ts:97` | Graph 层 `:CONFLICTS_WITH` vs IR 层 `conflicts_with` 命名不一致 |
| P2-8 | `connectivity-checker.ts:243-244,380-384` | O(E×N) `find` 查找，应构建 `Map<id, IRNode>` 索引 |
| P2-9 | `graph-algorithms.ts:101-116` | `findShortestPath` 队列存储完整路径，O(N²) 内存，应用 parent map |
| P2-10 | `connectivity-checker.ts:293-304` | `findOrphans` 语义歧义——两个断开分片均报为 orphan |
| P2-11 | `analyze-dataflow.ts:22-31` | `readInjectionGate` 未校验反序列化字段类型 |
| P2-12 | `convergence-log.ts:56-63` | `parseConvergenceLog` 无 try-catch，单行损坏致全日志不可用 |

### 4.3 安全（3 个）

| 编号 | 位置 | 问题 |
|------|------|------|
| P2-13 | `cli.ts:98-114` | `resolvePath` 在 `realpathSync` 失败时静默回退到未解析路径，符号链接逃逸风险 |
| P2-14 | `skill-integrity.ts:11-14` | `ENCRYPTION_KEY` 硬编码派生，加密备份仅防篡改不防泄露 |
| P2-15 | `skill-integrity.ts:128-145` | `restoreFromBackup` 不校验 backup 内文件哈希 |

### 4.4 门禁逻辑（5 个）

| 编号 | 位置 | 问题 |
|------|------|------|
| P2-16 | `checks-r3.ts:13-21` | `loadIR` 不校验 IR 版本，伪造 IR 可静默通过 R3 |
| P2-17 | `checks-s1.ts:186-188` | `checkDataFlowFormat` 把 I/O 错误降级为 PASS |
| P2-18 | `checks-final.ts:94-105` | `checkLegacyTlaSource`/`checkLegacyLeanSource` 定义但未被 verify-gate 调用 |
| P2-19 | `checks-s1.ts:58-65` | `checkShardCompleteness` 不校验 `shard.source_path` 字段存在性 |
| P2-20 | `pack-skill.ts:44-51` | 写入顺序：先 manifest 后 backup，崩溃时 manifest 存在但 backup 缺失 |

### 4.5 算法/校验（5 个）

| 编号 | 位置 | 问题 |
|------|------|------|
| P2-21 | `validate-cypher.ts:88-89,119` | Cypher 关键字匹配大小写敏感（`CREATE` 不匹配 `create`） |
| P2-22 | `validate-tla.ts:34-40` | `extractDefinitionBody` 续行检测脆弱，缩进启发式误纳注释/其他定义 |
| P2-23 | `validate-tla.ts:147` | `VARIABLES` 正则不接受 `VARIABLE`（单数） |
| P2-24 | `validate-lean.ts:69` | warning 检测正则 `/warning:/i` 可能假阳性（匹配代码中的 "warning:" 字符串） |
| P2-25 | `tla-validator.ts:9` | TLC 超时 60 秒可能不足，复杂模型检查需数分钟 |

### 4.6 其他（3 个）

| 编号 | 位置 | 问题 |
|------|------|------|
| P2-26 | `verify-skill-integrity.ts:39` | `--repair` 部分恢复时仍返回 `status: 'ok'` |
| P2-27 | `dataflow-analyzer.ts:184-196` | 孤立实体既无 producer 又无 consumer 时仅报"入边界"，遗漏"出边界" |
| P2-28 | `bdd-tool-runner.ts:70` | Gherklin `maxErrors: Infinity` 可能导致内存问题 |

---

## 五、P3 提示问题（17 个，简表）

| 编号 | 位置 | 问题 |
|------|------|------|
| P3-1 | `assemble-ir.ts:115` | `checkIntegrity` 接受 2.0.0 但永不产出 2.0.0，半死代码 |
| P3-2 | `validate-glossary.ts:190` | `parseInt` 静默截断非整数输入 |
| P3-3 | `id-utils.ts:11-16` | `sanitizeId` 纯非 ASCII 输入产出空串 |
| P3-4 | `validate-cypher.ts:119` | 语句起始关键字不全（缺 DELETE/REMOVE/SET/RETURN/WITH 等） |
| P3-5 | `bdd-validator.ts:51` | NFR 阈值正则覆盖不全（缺 hours/TB/PB/req/s 等） |
| P3-6 | `text-analysis.ts:22` | `/不应/` 与 `/不[应能会可]/` 重复 |
| P3-7 | `connectivity-checker.ts:379,383` | `proposeBridges` 硬编码 50 节点截断，无注释 |
| P3-8 | `connectivity-checker.ts:43` | `flatTree` 阈值 `>=3` 无注释说明 |
| P3-9 | 多文件 | import 语句位于文件末尾而非顶部 |
| P3-10 | `checks-r3.ts:208-273` | 4 处重复图加载逻辑 |
| P3-11 | `cli.ts:146-147` | `refuseDirectInvocation` 在 `argv[1]` 为空时 fail-open |
| P3-12 | `cli.ts:19-32` | `validateNoPoisonArgs` 只扫描位置参数，不扫描 flag 值的复合毒值 |
| P3-13 | `shared.ts:55-60` | checkbox 正则只识别顶级 `- [x]`，不识别嵌套 |
| P3-14 | `skill-integrity.ts:53-96` | `collectFiles`/`collectCurrentFiles` 两份近似实现 |
| P3-15 | `validation-report.ts:42-54` | `hashFiles` 对超大文件集全量读入内存 |
| P3-16 | `checks-r3.ts:152-247` | `graphData` 类型三处不一致，未统一用 `GraphData` |
| P3-17 | `checks-final.ts:86-92` | IR 读取失败时只返回 1 项检查，掩盖 BDD/TLA+/Lean 缺失 |

---

## 六、系统性根因模式（跨问题归纳）

### 模式 1：Windows 跨平台验证流于形式
**影响问题**：P0-1、P1-1、P1-2、P1-3、P1-4、P1-5（部分）
**根因**：AGENTS.md 声称 "verified on both Windows and Linux"，但实际：
- `refuseDirectInvocation` 的路径比较在 Windows 上永远 false
- `renameSync` 无 EPERM 重试
- Lean 验证硬阻断 Windows
- `process.cwd()` 依赖假设 cwd = scripts/
- 路径拼接用模板字符串而非 `path.join()`

**反映**：跨平台测试覆盖不足，"已验证"声明缺乏自动化验证。

### 模式 2：文档与代码演进不同步
**影响问题**：P1-9、P1-10、P1-11、P1-12、P1-13
**根因**：命令数、IR 版本、行数约束、风险公式等多处文档声明与代码实际不符。文档更新依赖人工，无自动化门禁校验文档与代码一致性。

**反映**：缺乏 "docs as code" 的自动化校验机制。

### 模式 3：安全约束执行不一致
**影响问题**：P0-2、P0-5、P1-6、P1-7、P1-8、P1-15、P1-16、P2-13
**根因**：AGENTS.md 声明统一的安全约束（`--workdir` 必选、isPathSafe 双检查、FINAL 严格绑定），但各命令实现不一致：
- `validate-glossary` 把 `--workdir` 做成可选
- `validate-cypher`/`hash-compute`/`tlc-trace-parse` 完全不校验
- FINAL 不检查 irHash
- BDD 不要求工具证据
- `checkOrphanAdjudication` 把提议当接受
- `nfrProfile` 读取 fail-open

**反映**：安全约束缺乏集中式强制执行点，各命令自行实现导致遗漏。

### 模式 4：测试覆盖盲区
**影响问题**：P0-1（EPERM）、P0-2（glossary workdir）、P0-3（NaN）、P0-4（orphan filter）、P0-5（shell injection）、P0-6（quote tracking）、P1-6（irHash）、P1-14（顶层字段）、P1-15（提议桥接豁免）
**根因**：多个 P0 问题无测试覆盖，尤其跨平台场景、安全边界、NaN/undefined 边界。

**反映**：测试策略偏向"快乐路径"和"已知功能"，缺乏对抗性测试和边界测试。

### 模式 5：硬约束缺乏自动化门禁
**影响问题**：P1-13（300 行）、P2-4（0 any）、P1-19（legacy 导入）
**根因**：300 行约束、0 any 约束、path.join 约束等均依赖人工 review，无 CI 脚本自动检测。`tsconfig.json` 的 `strict` 只能捕获隐式 any，不能捕获显式 `as any`。

**反映**：硬约束 "硬" 在文档里，"软" 在执行上。

---

## 七、修复优先级建议

### 第一批（P0 + 关键 P1，必须立即修复）
1. P0-1：promotion.ts 原子性 + Windows EPERM 重试
2. P0-2：validate-glossary --workdir 改必选
3. P0-3：assessInjectionGate NaN 检查
4. P0-5：bdd-tool-runner execFileSync + 配置传递
5. P0-6：validate-cypher 引号状态机重写
6. P1-1：refuseDirectInvocation 跨平台路径归一
7. P1-6：FINAL irHash 校验
8. P1-7：BDD requireEvidence
9. P1-9：命令数文档统一为 22
10. P1-10：IR 版本文档统一为 2.1.0

### 第二批（剩余 P1 + 高优 P2）
11. P1-2：Windows Lean 探测而非硬阻断
12. P1-3：bdd-tool-runner 用 import.meta.url 定位配置
13. P1-8：三个命令补 --workdir 校验
14. P1-11：riskScore 公式实现或从文档删除
15. P1-13：三个超 300 行文件拆分
16. P1-14：validate-jsonl 顶层字段检测去 `&& !meta`
17. P1-15：引入 accepted_bridges.json
18. P1-16：nfrProfile fail-closed
19. P1-19：legacy security.ts 迁移
20. P1-20：validate-glossary 契约对齐

### 第三批（P2 + P3，技术债务清理）
- 类型安全修复（P2-1 ~ P2-4）
- 算法性能优化（P2-8、P2-9）
- 门禁逻辑补全（P2-16 ~ P2-20）
- 测试覆盖补充
- 文档同步

---

## 八、附录

### 8.1 验证方法
- **typecheck**：`npm run typecheck` 通过（0 errors）
- **测试**：`npm test` 332 测试，331 通过，1 失败（`assessment-fixes.test.ts:58` Windows EPERM）
- **行数核验**：通过 `Get-Content | Measure-Object -Line` 逐文件确认
- **命令数核验**：通过 Grep `index.ts` COMMANDS 注册表确认 22 条

### 8.2 文件行数实测（2026-07-22）

| 文件 | 实际行数 | 超 300? |
|------|---------|---------|
| `lib/verify-gate/checks-r3.ts` | 408 | ✅ |
| `lib/middle-end/connectivity-checker.ts` | 394 | ✅ |
| `commands/assemble-ir.ts` | 333 | ✅ |
| `lib/fidelity/analyzer.ts` | 266 | ❌ |
| `commands/validate-semantics.ts` | 246 | ❌ |
| `lib/cli.ts` | 153 | ❌ |

### 8.3 命令注册表实测（22 条）

**Gate Validators（11）**：validate-jsonl、validate-semantics、verify-gate、validate-bdd、validate-architecture、validate-cypher、validate-glossary、validate-tla、validate-lean、validate-checklist、validate-dataflow

**Independent Tools（11）**：query-graph、pack-skill、verify-skill-integrity、assemble-ir、check-connectivity、analyze-dataflow、build-rid-mapping、analyze-fidelity、validate-convergence-log、hash-compute、tlc-trace-parse
