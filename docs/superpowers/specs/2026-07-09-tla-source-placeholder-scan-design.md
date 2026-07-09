# 设计文档：verify-gate 重扫 .tla 源占位标记（B3-TLA+ 对称）

> **日期**: 2026-07-09 | **状态**: 待审阅
> **方法学**: superpowers:brainstorming → writing-plans
> **前置**: Part B B3 已完成 Lean 侧源重扫（commits e57f882→af0c114，merge 96eb870）。本 spec 补齐 `docs/superpowers/specs/2026-07-09-bdd-positive-contract-design.md` Part B B3 中显式延后的 **TLA+ 对称部分**（`checkTlaGraphExists` 从不重扫源）。
> **改动范围**: `lib/verify-gate/shared.ts`、`lib/verify-gate/checks-final.ts`、`commands/build-tla-graph.ts`、`docs/DESIGN.md`、`__tests__/*`

---

## 1. 问题陈述

B3 修复了 Lean 侧的安全盲区：verify-gate FINAL 的 `checkLeanGraphExists` 现在重扫 `.lean` 源，命中 `sorry`/`axiom` 即 `passed:false`，不再仅凭 `lean-proof-graph.json` 文件存在放行。

对称缺陷仍在 TLA+ 侧未修：`checks-final.ts:157 checkTlaGraphExists` 仅检查 `tla-interaction-graph.json` 与 `tla-interaction.cypher` 存在即 `passed:true`，**从不重扫 `.tla` 源**。若存在上一次成功遗留的 graph.json，即使当前 `.tla` 含占位/未完成标记，门禁照过。

B3 计划的 Self-Review 已显式声明此为延后项，原因：**TLA+ 的"占位实现"检测语义与 `sorry`/`axiom` 不同——没有单一语言关键字**（TLA+ 里占位/简化通常是弱不变式、缩状态空间、伪代码，属语义问题，由 SANY/TLC/人工审查捕获，见 DESIGN §4.4.3 门禁 #8「人工 + 自动化审查」）。

## 2. 范围界定（关键，先划边界）

本 spec **只做可确定性文本检测的那一半**——占位**标记**（marker），即 DESIGN behavior 门禁行 1 列的 `GAP / TODO / FIXME / TBD / 待定 / 未定义 / 待实现`。

**明确排除**（属 TLC/人工审查，不在本 spec）：
- 弱化/vacuous 不变式（如 `Inv == TRUE`）
- 缩小到不真实的状态空间
- 空动作（仅 `UNCHANGED vars`）
- 伪代码代替真实 TLA+

排除理由：这些无单一文本特征，正则检测会产生**假阳性**（如正当的 `TypeOK` 辅助定义、合理的 `CONSTANT` 边界），违背"markers only、假阳性趋零"的设计目标。DESIGN §4.4.3 #8 本就将其归为"人工 + 自动化审查"，本 spec 落地的是其中"自动化"可确定性的子集。

## 3. 核心设计决策：只扫注释区域

Lean 的 `sorry`/`axiom` 是**代码 token**，故 `stripLeanComments` 先去注释再匹配（避免注释里的 "sorry" 误伤）。
TLA+ 的占位标记按惯例写在**注释里**（`\* TODO: ...`），因此机制**相反**——提取注释区域，只在注释内匹配。

| 方案 | 机制 | 假阳性 | 采纳 |
|---|---|---|---|
| **A. 提取注释区域后匹配** | 抽取 `\* 行注释` 与 `(* 块注释 *)`，仅在其中匹配 | 最低——忽略 `CONSTANT GAP`、变量名、字符串字面量等代码 | **✅** |
| B. 全文按词边界匹配 | 全文匹配 | 误伤代码里的 `CONSTANT GAP`、字符串 | ✗ |
| C. 去注释后匹配（照搬 Lean） | 去注释再匹配 | **把标记本身删掉**→检测不到，逻辑错误 | ✗ |

**匹配规则：**
- ASCII 标记：**大写、词边界** `/\b(TODO|FIXME|TBD|GAP)\b/`。只捞惯例的大写注记；散文里的小写 `gap`/`tbd` 不触发（进一步压假阳性）。
- CJK 标记：`待定` / `未定义` / `待实现` 字面子串匹配（CJK 无词边界概念）。

**已知限制**（写入代码注释与本文档）：
- 嵌套块注释 `(* (* *) *)` 用非贪婪 `\(\*[\s\S]*?\*\)` 只匹配到第一个 `*)`，不追内层。TLA+ 中极罕见，可接受。
- 注释里正当出现大写 `GAP`（如 "\* the GAP between L1/L2"）会误报。因用户明确要求 DESIGN 行 1 全集含 `GAP`，作为已知权衡保留；实践中形式化 spec 注释少有此写法。

## 4. 组件设计

### 4.1 新 helper（`lib/verify-gate/shared.ts` 末尾 append，与 Lean scanner 对称并置）

```typescript
/** 提取 TLA+ 注释区域（\* 行注释 + (* 块注释 *)），供匹配前净化；导出以便单测。 */
export function stripTlaCode(src: string): string;

/** 扫描 specsDir 下所有 .tla，仅在注释内匹配禁止标记。dir 不存在或无 .tla → []。 */
export function scanTlaSourceForPlaceholders(
  specsDir: string,
): { file: string; marker: string }[];
```

- `stripTlaCode`：先抽块注释 `(* ... *)`（非贪婪），再逐行抽 `\*` 之后内容，拼接返回。命名沿用"strip*"family 但语义是"保留注释、丢弃代码"，以 doc-comment 说明。
- `scanTlaSourceForPlaceholders`：`existsSync` 守卫 → `readdirSync` 取 `.tla` 排序 → 逐文件 `readFileSync` → `stripTlaCode` → 依次测试各标记，命中 push `{file, marker}`（同一文件多标记多条）。
- 复用文件顶部已 import 的 `node:fs` / `node:path`；不新增依赖、不新建文件。

### 4.2 `checkTlaGraphExists`（`checks-final.ts:157`）

在 `hasTlaSpecs` 守卫之后、`hasGraph`/`hasCypher` 检查之前插入源重扫（与 `checkLeanGraphExists:185-209` 完全对称）：

```typescript
// SECURITY: re-scan source — never trust a possibly-stale graph.json.
const placeholders = scanTlaSourceForPlaceholders(specsDir);
if (placeholders.length > 0) {
  const detail = placeholders.map(p => `${p.file}:${p.marker}`).join(', ');
  return { name: 'TLA interaction graph exists', passed: false, detail: `Forbidden placeholders in .tla source: ${detail}` };
}
```

顶部 import 合并：`import { scanLeanSourceForPlaceholders, scanTlaSourceForPlaceholders } from './shared.js';`（现为单 import Lean scanner，扩为二者）。既有 JSON 存在/解析逻辑保持不变。

### 4.3 `build-tla-graph.ts`

在 `tlaFiles.length === 0` 守卫之后、`buildTlaGraphFromDir` 之前插入（与 `build-lean-graph.ts:47-51` 对称）：

```typescript
// Check for unresolved placeholder markers (comment-aware; should have been caught by review)
const placeholders = scanTlaSourceForPlaceholders(specsDir);
if (placeholders.length > 0) {
  const detail = placeholders.map(p => `${p.file}:${p.marker}`).join(', ');
  return { status: 'error', message: `Forbidden placeholders found (${detail}) — resolve markers before building graph` };
}
```

顶部新增 `import { scanTlaSourceForPlaceholders } from '../lib/verify-gate/shared.js';`。

### 4.4 DESIGN.md §4.4.3（SSOT 同步）

在门禁表后补一段：verify-gate FINAL 现重扫 `.tla` 源，注释内命中 `GAP/TODO/FIXME/TBD/待定/未定义/待实现` 即 fail，构成门禁 #8「自动化审查」可确定性的那一半；语义型简化（弱不变式/缩状态空间/伪代码）仍由 SANY/TLC/人工审查负责。同步说明与 Lean 侧 §4.5.2 源重扫对称。

## 5. 数据流

```
.tla 源 ──readFileSync──▶ stripTlaCode（留注释）──正则──▶ {file,marker}[]
                                                              │
                    ┌─────────────────────────────────────────┤
                    ▼                                          ▼
     build-tla-graph（S5 构建期早失败）        checkTlaGraphExists（FINAL 门禁第二道防线）
```
两处共用同一 helper，单一事实来源，避免 B3 曾出现的"两处各写一份 `.includes` 逻辑不一致"。

## 6. 错误处理

- helper：`existsSync` 守卫；`readFileSync` 沿用 Lean scanner 同款（不逐文件 try/catch——proofs/specs 目录已过前序阶段校验）。
- 命令/门禁：均走既有 `CliResult` / `CheckResult` 返回，不抛异常。

## 7. 测试计划（沿用 B3 结构）

- `__tests__/verify-gate-source-scan.test.ts`（B3 既有，追加 describe）：
  - 检出 `\* TODO: fix`；检出 `待定`
  - **忽略** `CONSTANT GAP`（代码，不在注释）→ `[]`
  - **忽略**散文小写 `\* mind the gap` → `[]`
  - dir 缺失 → `[]`
  - `stripTlaCode` 能抽出块注释内容、丢弃代码
- `__tests__/verify-gate-tla-source.test.ts`（新建，镜像 `verify-gate-lean-source.test.ts`）：
  - 残留 `tla-interaction-graph.json` + `.cypher` 仍在时，`.tla` 含 `TODO` → `passed:false` 且 detail 含标记
  - `.tla` clean + 产物齐全 → `passed:true`
- `__tests__/build-tla-graph.test.ts`（追加用例）：
  - `.tla` 含标记 → `status:'error'`
  - clean → `status:'ok'`
- 回归：`npx tsc --noEmit` 0 errors + `npx tsx --test __tests__/*.test.ts` 全绿（现 309 + 新增）。**须核查**既有 verify-gate/build-tla fixture 的 `.tla` 注释是否含上述标记，若含则改 fixture 为 clean。

## 8. 影响面与约束

- 3 处代码 + 1 处文档 + 3 处测试；helper 追加进 `shared.ts`（当前行数留意 ≤300/≤500）。
- 遵守 CLAUDE.md：strict TS、0 `any`（错误用 `unknown`+`instanceof`）、`path.join`、经 `index.ts`、命令末 `refuseDirectInvocation` 不动。
- 无跨阶段/无 executor 提示词改动、无 `pack-skill --force`——本 spec 自包含（区别于 B1/B2）。
- 顺序：TDD 逐任务（helper → checkTla → build-tla → DESIGN），每步 RED→GREEN→typecheck→commit。

## 9. 范围外（后续，不在本 spec）

- B1（TLA/Lean → :Requirement 需求映射边）
- B2（PROVES 边改显式 `proves_invariant` 标注）
- B4（`orchestrator_stage_S1.md:88` `build-glossary` 命令名修正）
- TLA+ 语义型简化检测（弱不变式/缩状态空间/伪代码）——需 TLC 或独立设计
