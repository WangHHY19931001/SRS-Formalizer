# SRS-Formalizer 架构反转重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 srs-formalizer 技能重构为"脚本只做门禁校验 + 专用算法，语义工作全部由 Agent 经提示词完成"的架构（DESIGN.md v2.0.0）。

**Architecture:** 命令数 39→17（10 门禁 + 7 工具，含 2 个新增）。归档 24 个语义/生成/编排命令、对应 lib 与测试；`build-ir` 改名瘦身为 `assemble-ir`；新增 `hash-compute`、`tlc-trace-parse` 两个独立工具；重写 SKILL.md；新增 8 个执行者提示词与 5 个参考文档。

**Tech Stack:** TypeScript (strict)、Node.js ESM、node:test、tsx、内置 tla2tools-1.7.4.jar、gherkin-lint、gherklin。

**SSOT:** `docs/DESIGN.md` v2.0.0。本计划与 DESIGN.md 冲突时以 DESIGN.md 为准。

---

## 关键约束（每个任务都必须遵守）

- **严格 TS**：`strict`、`noUnusedLocals`、`noUnusedParameters`、`exactOptionalPropertyTypes`、`noUncheckedIndexedAccess`、`noFallthroughCasesInSwitch`。
- **零运行时依赖**；禁止 `any`，错误用 `unknown` + `instanceof Error`。
- **≤300 行/文件**；`path.join()` 强制；毒值入口拦截。
- **所有命令经 `index.ts`**，命令文件末尾必须有 `refuseDirectInvocation(import.meta.url)`。
- **提交前** `npm run typecheck`、`npm test`、`npm run evals` 必须全绿。
- **路径根**：所有 scripts 内相对路径基于 `/workspace/.claude/skills/srs-formalizer/scripts/`。命令在该目录执行。

## 归档目录约定

归档目标：`/workspace/.worktrees/archive/2026-07-16/`。归档 = `git mv` 到该目录下保持原相对结构，便于回溯。先 `mkdir -p` 再批量 `git mv`。

---

## 阶段总览

| 阶段 | 任务 | 目标 |
|:----:|------|------|
| A | Task 1-3 | 归档移除的命令/测试/lib，保持 typecheck 绿 |
| B | Task 4-5 | `build-ir` 改名瘦身为 `assemble-ir` |
| C | Task 6 | 新增 `hash-compute` 工具 |
| D | Task 7 | 新增 `tlc-trace-parse` 工具 |
| E | Task 8-9 | 更新 `index.ts` 注册表与帮助文本、package.json |
| F | Task 10 | 清理 lib 中遗留的孤立模块 |
| G | Task 11-12 | 新增 5 个参考文档、更新提示词（新增 8、移除 5） |
| H | Task 13 | 重写 SKILL.md |
| I | Task 14 | 规格一致性测试更新 |
| J | Task 15 | 最终验证与提交 |

---

## Task 1: 归档移除的命令文件与对应测试

**Files:**
- Archive (git mv): 24 个 `commands/*.ts` + 对应 `__tests__/*.test.ts`
- Keep: `commands/` 保留 15 个（10 门禁 + assemble-ir(暂留 build-ir) + check-connectivity + query-graph + verify-skill-integrity + pack-skill）

**移除命令清单（24 个）— Frontend(5)：**
`init.ts`、`manifest.ts`、`guided-extract.ts`、`inject-prompt.ts`、`build-architecture.ts`

**移除命令清单 — Middle-end(6)：**
`analyze-structure.ts`、`merge-structure.ts`、`analyze-graph.ts`、`merge-analysis.ts`、`tag-nfr.ts`、`score-risk.ts`

**移除命令清单 — Backend(5)：**
`emit.ts`、`generate-test-fixtures.ts`、`generate-counterexample-fixtures.ts`、`generate-vmodel-matrix.ts`、`fixture-coverage.ts`

**移除命令清单 — 编排/元(8)：**
`pipeline.ts`、`status.ts`、`health-check.ts`、`export-audit.ts`、`tools-schema.ts`、`compile.ts`、`capability-probe.ts`、`stability-test.ts`

**对应测试文件（随命令归档）：**
`init.test.ts`、`manifest.test.ts`、`guided-extract.test.ts`、`inject-prompt.test.ts`、`build-architecture.test.ts`、`analyze-structure.test.ts`、`merge-structure.test.ts`、`analyze-graph.test.ts`、`merge-analysis.test.ts`、`pipeline-middle-end-runner.test.ts`、`pack-skill.test.ts`（保留！pack-skill 不移除）、`compile.test.ts`、`capability-probe.test.ts`、`emitter.test.ts`、`generate-test-fixtures.test.ts`、`generate-counterexample-fixtures.test.ts`、`generate-vmodel-matrix.test.ts`、`fixture-coverage.test.ts`。

注意：`pack-skill.test.ts` 与 `verify-skill-integrity.test.ts` **保留**。

- [ ] **Step 1: 创建归档目录结构**

Run（在 `/workspace`）:
```bash
mkdir -p .worktrees/archive/2026-07-16/scripts/commands
mkdir -p .worktrees/archive/2026-07-16/scripts/__tests__
```

- [ ] **Step 2: 归档 24 个命令文件**

Run（在 `/workspace`）:
```bash
git mv .claude/skills/srs-formalizer/scripts/commands/init.ts .worktrees/archive/2026-07-16/scripts/commands/init.ts
git mv .claude/skills/srs-formalizer/scripts/commands/manifest.ts .worktrees/archive/2026-07-16/scripts/commands/manifest.ts
git mv .claude/skills/srs-formalizer/scripts/commands/guided-extract.ts .worktrees/archive/2026-07-16/scripts/commands/guided-extract.ts
git mv .claude/skills/srs-formalizer/scripts/commands/inject-prompt.ts .worktrees/archive/2026-07-16/scripts/commands/inject-prompt.ts
git mv .claude/skills/srs-formalizer/scripts/commands/build-architecture.ts .worktrees/archive/2026-07-16/scripts/commands/build-architecture.ts
git mv .claude/skills/srs-formalizer/scripts/commands/analyze-structure.ts .worktrees/archive/2026-07-16/scripts/commands/analyze-structure.ts
git mv .claude/skills/srs-formalizer/scripts/commands/merge-structure.ts .worktrees/archive/2026-07-16/scripts/commands/merge-structure.ts
git mv .claude/skills/srs-formalizer/scripts/commands/analyze-graph.ts .worktrees/archive/2026-07-16/scripts/commands/analyze-graph.ts
git mv .claude/skills/srs-formalizer/scripts/commands/merge-analysis.ts .worktrees/archive/2026-07-16/scripts/commands/merge-analysis.ts
git mv .claude/skills/srs-formalizer/scripts/commands/tag-nfr.ts .worktrees/archive/2026-07-16/scripts/commands/tag-nfr.ts
git mv .claude/skills/srs-formalizer/scripts/commands/score-risk.ts .worktrees/archive/2026-07-16/scripts/commands/score-risk.ts
git mv .claude/skills/srs-formalizer/scripts/commands/emit.ts .worktrees/archive/2026-07-16/scripts/commands/emit.ts
git mv .claude/skills/srs-formalizer/scripts/commands/generate-test-fixtures.ts .worktrees/archive/2026-07-16/scripts/commands/generate-test-fixtures.ts
git mv .claude/skills/srs-formalizer/scripts/commands/generate-counterexample-fixtures.ts .worktrees/archive/2026-07-16/scripts/commands/generate-counterexample-fixtures.ts
git mv .claude/skills/srs-formalizer/scripts/commands/generate-vmodel-matrix.ts .worktrees/archive/2026-07-16/scripts/commands/generate-vmodel-matrix.ts
git mv .claude/skills/srs-formalizer/scripts/commands/fixture-coverage.ts .worktrees/archive/2026-07-16/scripts/commands/fixture-coverage.ts
git mv .claude/skills/srs-formalizer/scripts/commands/pipeline.ts .worktrees/archive/2026-07-16/scripts/commands/pipeline.ts
git mv .claude/skills/srs-formalizer/scripts/commands/status.ts .worktrees/archive/2026-07-16/scripts/commands/status.ts
git mv .claude/skills/srs-formalizer/scripts/commands/health-check.ts .worktrees/archive/2026-07-16/scripts/commands/health-check.ts
git mv .claude/skills/srs-formalizer/scripts/commands/export-audit.ts .worktrees/archive/2026-07-16/scripts/commands/export-audit.ts
git mv .claude/skills/srs-formalizer/scripts/commands/tools-schema.ts .worktrees/archive/2026-07-16/scripts/commands/tools-schema.ts
git mv .claude/skills/srs-formalizer/scripts/commands/compile.ts .worktrees/archive/2026-07-16/scripts/commands/compile.ts
git mv .claude/skills/srs-formalizer/scripts/commands/capability-probe.ts .worktrees/archive/2026-07-16/scripts/commands/capability-probe.ts
git mv .claude/skills/srs-formalizer/scripts/commands/stability-test.ts .worktrees/archive/2026-07-16/scripts/commands/stability-test.ts
```

- [ ] **Step 3: 归档对应测试文件**

Run（在 `/workspace`）:
```bash
git mv .claude/skills/srs-formalizer/scripts/__tests__/init.test.ts .worktrees/archive/2026-07-16/scripts/__tests__/init.test.ts
git mv .claude/skills/srs-formalizer/scripts/__tests__/manifest.test.ts .worktrees/archive/2026-07-16/scripts/__tests__/manifest.test.ts
git mv .claude/skills/srs-formalizer/scripts/__tests__/guided-extract.test.ts .worktrees/archive/2026-07-16/scripts/__tests__/guided-extract.test.ts
git mv .claude/skills/srs-formalizer/scripts/__tests__/inject-prompt.test.ts .worktrees/archive/2026-07-16/scripts/__tests__/inject-prompt.test.ts
git mv .claude/skills/srs-formalizer/scripts/__tests__/build-architecture.test.ts .worktrees/archive/2026-07-16/scripts/__tests__/build-architecture.test.ts
git mv .claude/skills/srs-formalizer/scripts/__tests__/analyze-structure.test.ts .worktrees/archive/2026-07-16/scripts/__tests__/analyze-structure.test.ts
git mv .claude/skills/srs-formalizer/scripts/__tests__/merge-structure.test.ts .worktrees/archive/2026-07-16/scripts/__tests__/merge-structure.test.ts
git mv .claude/skills/srs-formalizer/scripts/__tests__/analyze-graph.test.ts .worktrees/archive/2026-07-16/scripts/__tests__/analyze-graph.test.ts
git mv .claude/skills/srs-formalizer/scripts/__tests__/merge-analysis.test.ts .worktrees/archive/2026-07-16/scripts/__tests__/merge-analysis.test.ts
git mv .claude/skills/srs-formalizer/scripts/__tests__/pipeline-middle-end-runner.test.ts .worktrees/archive/2026-07-16/scripts/__tests__/pipeline-middle-end-runner.test.ts
git mv .claude/skills/srs-formalizer/scripts/__tests__/compile.test.ts .worktrees/archive/2026-07-16/scripts/__tests__/compile.test.ts
git mv .claude/skills/srs-formalizer/scripts/__tests__/capability-probe.test.ts .worktrees/archive/2026-07-16/scripts/__tests__/capability-probe.test.ts
git mv .claude/skills/srs-formalizer/scripts/__tests__/emitter.test.ts .worktrees/archive/2026-07-16/scripts/__tests__/emitter.test.ts
git mv .claude/skills/srs-formalizer/scripts/__tests__/generate-test-fixtures.test.ts .worktrees/archive/2026-07-16/scripts/__tests__/generate-test-fixtures.test.ts
git mv .claude/skills/srs-formalizer/scripts/__tests__/generate-counterexample-fixtures.test.ts .worktrees/archive/2026-07-16/scripts/__tests__/generate-counterexample-fixtures.test.ts
git mv .claude/skills/srs-formalizer/scripts/__tests__/generate-vmodel-matrix.test.ts .worktrees/archive/2026-07-16/scripts/__tests__/generate-vmodel-matrix.test.ts
git mv .claude/skills/srs-formalizer/scripts/__tests__/fixture-coverage.test.ts .worktrees/archive/2026-07-16/scripts/__tests__/fixture-coverage.test.ts
```

- [ ] **Step 4: 临时注释 index.ts 中已归档命令的注册行**

此时 `index.ts` 仍 import 已归档命令会导致 typecheck 失败。先临时编辑 `index.ts`，删除 COMMANDS 注册表中对应 24 行（保留 `build-ir` 行，下个 Task 再改名）。删除这些键值对：`init`、`health-check`、`manifest`、`inject-prompt`、`guided-extract`、`analyze-structure`、`merge-structure`、`analyze-graph`、`merge-analysis`、`build-architecture`、`capability-probe`、`stability-test`、`pipeline`、`compile`、`generate-test-fixtures`、`generate-counterexample-fixtures`、`fixture-coverage`、`generate-vmodel-matrix`、`tag-nfr`、`score-risk`、`emit`、`tools-schema`、`status`、`export-audit`。

- [ ] **Step 5: 运行 typecheck，预期仍有 lib 孤立引用错误**

Run（在 `/workspace/.claude/skills/srs-formalizer/scripts`）:
```bash
npm run typecheck
```
预期：失败，错误来自保留下来的命令/lib 对已归档 lib 的引用。记录错误清单，下一 Task 处理。提交本任务的归档（此时不要求全绿，但要提交进度）。

- [ ] **Step 6: 提交**

Run（在 `/workspace`）:
```bash
git add -A
git -c user.name="WangHHY19931001" -c user.email="wanghhy@163.com" commit -m "refactor: 归档 24 个移除命令与对应测试 (Task 1)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: 归档移除的 lib 模块

**Files:**
- Archive: 移除命令依赖的 lib 子目录与散落文件
- Keep: DESIGN.md §3.3 列出的保留 lib

**移除 lib 目录（整体归档）：**
`lib/frontend/`（builder.ts 逻辑将在 Task 4 迁入 assemble-ir，先整体归档，Task 4 重新提取）、`lib/emitters/`、`lib/fixture-gen/`（含 `nfr/`）、`lib/architecture/`（含 `processors/`）、`lib/behavior-graph/`、`lib/lean-graph/`、`lib/tla-graph/`、`lib/system-architecture/`、`lib/traceability/`、`lib/cross-graph/`、`lib/skir/`、`lib/probe/`（含 `questions/`、`scorer/`）、`lib/llm/`（含 `stability/`）、`lib/health/`、`lib/pipeline/`、`lib/semantic/`

**移除 lib 散落文件：**
`lib/anti-skill.ts`、`lib/bdd.ts`、`lib/behavior-graph.ts`、`lib/compile-validator.ts`、`lib/cross-graph-verifier.ts`、`lib/emitter-claude-xml.ts`、`lib/emitter-generic-md.ts`、`lib/lean-graph.ts`、`lib/progress.ts`、`lib/prompt-templates.ts`、`lib/skir-builder.ts`、`lib/system-architecture.ts`、`lib/tla-graph.ts`

**保留 lib（DESIGN.md §3.3）：**
`lib/verify-gate/`（4 文件）、`lib/bdd-validator.ts`、`lib/bdd-tool-runner.ts`、`lib/tla-validator.ts`、`lib/artifacts/`（paths.ts、promotion.ts、validation-report.ts、index.ts；**emitter-registry.ts 归档**）、`lib/middle-end/connectivity-checker.ts`（其余 3 个归档）、`lib/graph.ts`、`lib/graph-algorithms.ts`、`lib/graph-operations.ts`、`lib/cypher.ts`、`lib/security.ts`、`lib/cli.ts`、`lib/fs-utils.ts`、`lib/jsonl.ts`、`lib/id-utils.ts`、`lib/skill-integrity.ts`、`lib/text-analysis.ts`、`lib/checklists.ts`

- [ ] **Step 1: 创建归档子目录结构**

Run（在 `/workspace`）:
```bash
mkdir -p .worktrees/archive/2026-07-16/scripts/lib/{frontend,emitters,fixture-gen/nfr,architecture/processors,behavior-graph,lean-graph,tla-graph,system-architecture,traceability,cross-graph,skir,probe/questions,probe/scorer,llm/stability,health,pipeline,semantic}
```

- [ ] **Step 2: 归档整个子目录（用 git mv 逐文件，shell 循环）**

Run（在 `/workspace`）:
```bash
# 归档子目录内所有 .ts
for d in frontend emitters fixture-gen architecture behavior-graph lean-graph tla-graph system-architecture traceability cross-graph skir probe llm health pipeline semantic; do
  for f in .claude/skills/srs-formalizer/scripts/lib/$d/*.ts; do
    [ -f "$f" ] || continue
    rel="${f#.claude/skills/srs-formalizer/scripts/lib/$d/}"
    # 保留子目录结构
    subdir=""
    case "$f" in
      */processors/*) subdir="/processors" ;;
      */nfr/*) subdir="/nfr" ;;
      */questions/*) subdir="/questions" ;;
      */scorer/*) subdir="/scorer" ;;
      */stability/*) subdir="/stability" ;;
    esac
    mkdir -p ".worktrees/archive/2026-07-16/scripts/lib/$d$subdir"
    git mv "$f" ".worktrees/archive/2026-07-16/scripts/lib/$d$subdir/$rel"
  done
done
```

- [ ] **Step 3: 归档散落的 lib 文件**

Run（在 `/workspace`）:
```bash
for f in anti-skill bdd behavior-graph compile-validator cross-graph-verifier emitter-claude-xml emitter-generic-md lean-graph progress prompt-templates skir-builder system-architecture tla-graph; do
  git mv ".claude/skills/srs-formalizer/scripts/lib/$f.ts" ".worktrees/archive/2026-07-16/scripts/lib/$f.ts"
done
```

- [ ] **Step 4: 归档 middle-end 中 3 个非保留文件，保留 connectivity-checker.ts**

Run（在 `/workspace`）:
```bash
mkdir -p .worktrees/archive/2026-07-16/scripts/lib/middle-end
git mv .claude/skills/srs-formalizer/scripts/lib/middle-end/nfr-tagger.ts .worktrees/archive/2026-07-16/scripts/lib/middle-end/nfr-tagger.ts
git mv .claude/skills/srs-formalizer/scripts/lib/middle-end/nfr-thresholds.ts .worktrees/archive/2026-07-16/scripts/lib/middle-end/nfr-thresholds.ts
git mv .claude/skills/srs-formalizer/scripts/lib/middle-end/risk-scorer.ts .worktrees/archive/2026-07-16/scripts/lib/middle-end/risk-scorer.ts
```

- [ ] **Step 5: 归档 artifacts/emitter-registry.ts（保留其余 4 个）**

Run（在 `/workspace`）:
```bash
mkdir -p .worktrees/archive/2026-07-16/scripts/lib/artifacts
git mv .claude/skills/srs-formalizer/scripts/lib/artifacts/emitter-registry.ts .worktrees/archive/2026-07-16/scripts/lib/artifacts/emitter-registry.ts
```

- [ ] **Step 6: 归档 __tests__/fixture-gen/ 与孤立测试**

Run（在 `/workspace`）:
```bash
mkdir -p .worktrees/archive/2026-07-16/scripts/__tests__/fixture-gen
for f in .claude/skills/srs-formalizer/scripts/__tests__/fixture-gen/*.test.ts; do
  [ -f "$f" ] || continue
  rel="${f##*/}"
  git mv "$f" ".worktrees/archive/2026-07-16/scripts/__tests__/fixture-gen/$rel"
done
# 归档孤立测试
git mv .claude/skills/srs-formalizer/scripts/__tests__/anti-skill.test.ts .worktrees/archive/2026-07-16/scripts/__tests__/anti-skill.test.ts
git mv .claude/skills/srs-formalizer/scripts/__tests__/bdd.test.ts .worktrees/archive/2026-07-16/scripts/__tests__/bdd.test.ts
git mv .claude/skills/srs-formalizer/scripts/__tests__/emitter-claude-xml.test.ts .worktrees/archive/2026-07-16/scripts/__tests__/emitter-claude-xml.test.ts
git mv .claude/skills/srs-formalizer/scripts/__tests__/frontend-builder.test.ts .worktrees/archive/2026-07-16/scripts/__tests__/frontend-builder.test.ts
git mv .claude/skills/srs-formalizer/scripts/__tests__/frontend-nfr-keywords.test.ts .worktrees/archive/2026-07-16/scripts/__tests__/frontend-nfr-keywords.test.ts
git mv .claude/skills/srs-formalizer/scripts/__tests__/frontend-parser.test.ts .worktrees/archive/2026-07-16/scripts/__tests__/frontend-parser.test.ts
git mv .claude/skills/srs-formalizer/scripts/__tests__/frontend-round-calculator.test.ts .worktrees/archive/2026-07-16/scripts/__tests__/frontend-round-calculator.test.ts
git mv .claude/skills/srs-formalizer/scripts/__tests__/frontend-sharder.test.ts .worktrees/archive/2026-07-16/scripts/__tests__/frontend-sharder.test.ts
git mv .claude/skills/srs-formalizer/scripts/__tests__/middle-end-nfr-tagger.test.ts .worktrees/archive/2026-07-16/scripts/__tests__/middle-end-nfr-tagger.test.ts
git mv .claude/skills/srs-formalizer/scripts/__tests__/middle-end-nfr-thresholds.test.ts .worktrees/archive/2026-07-16/scripts/__tests__/middle-end-nfr-thresholds.test.ts
git mv .claude/skills/srs-formalizer/scripts/__tests__/middle-end-risk-scorer.test.ts .worktrees/archive/2026-07-16/scripts/__tests__/middle-end-risk-scorer.test.ts
git mv .claude/skills/srs-formalizer/scripts/__tests__/semantic-consistency-checker.test.ts .worktrees/archive/2026-07-16/scripts/__tests__/semantic-consistency-checker.test.ts
git mv .claude/skills/srs-formalizer/scripts/__tests__/skir-builder.test.ts .worktrees/archive/2026-07-16/scripts/__tests__/skir-builder.test.ts
```

- [ ] **Step 7: 运行 typecheck，修复保留代码对已归档 lib 的引用**

Run（在 `/workspace/.claude/skills/srs-formalizer/scripts`）:
```bash
npm run typecheck 2>&1 | head -60
```
对每个错误：若是保留命令/门禁引用了已归档 lib，则按 DESIGN.md 判断该引用是否应删除。门禁（validate-*、verify-gate）只做确定性校验，不应依赖 emitter/analyzer。删除违规 import 与对应代码。若 `lib/artifacts/index.ts` re-export 了 `emitter-registry`，移除该 re-export 行。

- [ ] **Step 8: 运行测试，归档因 lib 移除而失败的测试**

Run:
```bash
npm test 2>&1 | tail -40
```
对失败的测试：若其测试对象已归档，归档该测试；若测试保留命令，修复使其通过。

- [ ] **Step 9: 提交**

Run（在 `/workspace`）:
```bash
git add -A
git -c user.name="WangHHY19931001" -c user.email="wanghhy@163.com" commit -m "refactor: 归档移除的 lib 模块与孤立测试 (Task 2)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: 修复 typecheck 至全绿

**Files:**
- Modify: 保留命令/lib 中残留的对已归档模块的引用

- [ ] **Step 1: 反复运行 typecheck 直到 0 error**

Run（在 `/workspace/.claude/skills/srs-formalizer/scripts`）:
```bash
npm run typecheck
```
逐个修复：删除违规 import、删除引用已归档类型的代码、调整 `lib/artifacts/index.ts` 的 re-export。保留命令中不应再出现 emitter/analyzer/fixture-gen 的引用。

- [ ] **Step 2: 运行测试至通过**

Run:
```bash
npm test 2>&1 | tail -30
```
保留的测试必须全绿。失败的保留测试若因依赖被归档，按 DESIGN.md 重写为不依赖被归档模块的版本，或归档该测试（若其测试对象本身已归档）。

- [ ] **Step 3: 提交**

Run（在 `/workspace`）:
```bash
git add -A
git -c user.name="WangHHY19931001" -c user.email="wanghhy@163.com" commit -m "fix: 修复归档后的 typecheck 与测试引用 (Task 3)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: 将 build-ir 改名瘦身为 assemble-ir

**Files:**
- Create: `commands/assemble-ir.ts`
- Archive: `commands/build-ir.ts` + `__tests__/build-ir.test.ts`
- Create: `__tests__/assemble-ir.test.ts`
- Modify: `index.ts`（`build-ir` → `assemble-ir`）

`assemble-ir` 职责（DESIGN.md §8.1）：读 JSONL → 去重 → 装配 `srs-ir.json` + 引用完整性校验（悬挂边/重复 ID/版本号/buildTimestamp）。**禁止分析、发射、修改 JSONL**。原 `buildIR` 中的分析/发射逻辑全部删除，仅保留节点/边装配与完整性校验。

- [ ] **Step 1: 写失败测试**

Create `/workspace/.claude/skills/srs-formalizer/scripts/__tests__/assemble-ir.test.ts`:

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { main } from '../commands/assemble-ir.js';

function setupWorkdir(): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'srs-asm-'));
  const wd = path.join(tmp, '.srs_formalizer');
  fs.mkdirSync(path.join(wd, '2_extract', 'r1-explicit'), { recursive: true });
  fs.mkdirSync(path.join(wd, '2_extract', 'r2-implicit'), { recursive: true });
  fs.mkdirSync(path.join(wd, '2_extract', 'r3-relational'), { recursive: true });
  fs.mkdirSync(path.join(wd, '2_extract', 'architecture'), { recursive: true });
  fs.mkdirSync(path.join(wd, '_ctx'), { recursive: true });
  return wd;
}

test('assemble-ir 装配 IR 并通过完整性校验', async () => {
  const wd = setupWorkdir();
  fs.writeFileSync(
    path.join(wd, '2_extract', 'r1-explicit', 'a.jsonl'),
    JSON.stringify({ id: 'R1-S001-0001', category: 'explicit', statement: '需求A', source_file: 'srs.md', confidence: 'high', metadata: { shard_id: 'S001', chapter: '1', start_line: 1, end_line: 2 } }) + '\n',
  );
  const res = await main(['--workdir', wd]);
  assert.equal(res.status, 'ok');
  const ir = JSON.parse(fs.readFileSync(path.join(wd, 'srs-ir.json'), 'utf-8'));
  assert.equal(ir.version, '2.0.0');
  assert.equal(ir.meta.totalNodes, 1);
  assert.ok(ir.meta.buildTimestamp);
});

test('assemble-ir 检测重复 ID 失败', async () => {
  const wd = setupWorkdir();
  const dup = JSON.stringify({ id: 'R1-S001-0001', category: 'explicit', statement: 'x', source_file: 'srs.md', confidence: 'high', metadata: { shard_id: 'S001', chapter: '1', start_line: 1, end_line: 1 } }) + '\n';
  fs.writeFileSync(path.join(wd, '2_extract', 'r1-explicit', 'a.jsonl'), dup);
  fs.writeFileSync(path.join(wd, '2_extract', 'r2-implicit', 'b.jsonl'), dup);
  const res = await main(['--workdir', wd]);
  assert.equal(res.status, 'error');
  assert.match(res.message ?? '', /重复 ID|duplicate/i);
});

test('assemble-ir 缺少 --workdir 报错', async () => {
  const res = await main([]);
  assert.equal(res.status, 'error');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run（在 `/workspace/.claude/skills/srs-formalizer/scripts`）:
```bash
npx tsx --test __tests__/assemble-ir.test.ts 2>&1 | tail -15
```
预期：FAIL（模块不存在）。

- [ ] **Step 3: 实现 assemble-ir.ts**

Create `/workspace/.claude/skills/srs-formalizer/scripts/commands/assemble-ir.ts`:

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliResult } from '../types/index.js';
import type { SRSIR, IRNode, IREdge, IRMeta } from '../types/srs-ir.js';
import { safeParseArg, validateWorkDir } from '../lib/cli.js';
import { listJsonlFiles, readJsonl } from '../lib/jsonl.js';
import type { JsonlRecord } from '../types/index.js';

const EXTRACT_SUBDIRS = ['r1-explicit', 'r2-implicit', 'r3-relational', 'architecture'] as const;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function toIRNode(record: JsonlRecord): IRNode {
  const meta = isRecord(record.metadata) ? record.metadata : null;
  return {
    id: record.id,
    type: 'requirement',
    module: record.source_file,
    labels: [':Requirement'],
    properties: {
      statement: record.statement,
      category: record.category,
      confidence: record.confidence,
    },
    source: {
      filePath: record.source_file,
      startLine: typeof meta?.['start_line'] === 'number' ? meta['start_line'] : 1,
      endLine: typeof meta?.['end_line'] === 'number' ? meta['end_line'] : 1,
      shardId: typeof meta?.['shard_id'] === 'string' ? meta['shard_id'] : record.id,
      chapter: typeof meta?.['chapter'] === 'string' ? meta['chapter'] : '',
    },
  };
}

function checkIntegrity(ir: SRSIR): string[] {
  const errors: string[] = [];
  if (ir.version !== '2.0.0') errors.push(`版本号必须为 2.0.0，实际为 ${ir.version}`);
  if (!ir.meta.buildTimestamp) errors.push('buildTimestamp 不能为空');
  const nodeIds = new Set(ir.nodes.map((n) => n.id));
  // 重复 ID
  const seen = new Set<string>();
  for (const n of ir.nodes) {
    if (seen.has(n.id)) errors.push(`重复节点 ID: ${n.id}`);
    seen.add(n.id);
  }
  // 悬挂边
  for (const e of ir.edges) {
    if (!nodeIds.has(e.source)) errors.push(`悬挂边 source: ${e.source} (edge ${e.id})`);
    if (!nodeIds.has(e.target)) errors.push(`悬挂边 target: ${e.target} (edge ${e.id})`);
  }
  return errors;
}

export async function main(args: string[]): Promise<CliResult> {
  let workDirArg: string | null;
  try { workDirArg = safeParseArg(args, '--workdir'); }
  catch (err) { return { status: 'error', message: (err as Error).message }; }

  if (!workDirArg) return { status: 'error', message: 'Missing required argument: --workdir' };

  let workDir: string;
  try { workDir = validateWorkDir(workDirArg); }
  catch (err) { return { status: 'error', message: (err as Error).message }; }

  try {
    // 1. 读取所有 JSONL
    const records: JsonlRecord[] = [];
    for (const sub of EXTRACT_SUBDIRS) {
      const dir = path.join(workDir, '2_extract', sub);
      if (!fs.existsSync(dir)) continue;
      for (const file of listJsonlFiles(dir)) {
        records.push(...readJsonl(file));
      }
    }

    // 2. 去重 + 构建 nodes
    const nodes: IRNode[] = [];
    const idSet = new Set<string>();
    for (const r of records) {
      if (idSet.has(r.id)) {
        return { status: 'error', message: `重复 ID: ${r.id}，无法装配 IR` };
      }
      idSet.add(r.id);
      nodes.push(toIRNode(r));
    }

    // 3. 装配 IR（edges/crossRefs/nfrProfile/gaps/glossary 由 Middle-end Agent 填充）
    const ir: SRSIR = {
      version: '2.0.0',
      meta: {
        sourcePath: '',
        sourceHash: '',
        language: 'zh',
        totalChars: 0,
        totalShards: 0,
        totalNodes: nodes.length,
        totalEdges: 0,
        buildTimestamp: new Date().toISOString(),
      },
      nodes,
      edges: [],
      crossRefs: [],
      nfrProfile: { detectedCategories: [], weightedShards: [], overallCoverage: 0, blindSpots: [] },
      gaps: [],
      glossary: [],
    };

    // 4. 完整性校验
    const errors = checkIntegrity(ir);
    if (errors.length > 0) {
      return { status: 'error', message: `IR 完整性校验失败: ${errors.join('; ')}` };
    }

    // 5. 写出
    const irPath = path.join(workDir, 'srs-ir.json');
    fs.writeFileSync(irPath, JSON.stringify(ir, null, 2), 'utf-8');

    return { status: 'ok', data: { nodes: ir.meta.totalNodes, edges: ir.meta.totalEdges, ir_path: irPath } };
  } catch (err) {
    return { status: 'error', message: `IR assembly failed: ${(err as Error).message}` };
  }
}

import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
```

- [ ] **Step 4: 归档旧 build-ir.ts 与其测试，更新 index.ts**

Run（在 `/workspace`）:
```bash
git mv .claude/skills/srs-formalizer/scripts/commands/build-ir.ts .worktrees/archive/2026-07-16/scripts/commands/build-ir.ts
git mv .claude/skills/srs-formalizer/scripts/__tests__/build-ir.test.ts .worktrees/archive/2026-07-16/scripts/__tests__/build-ir.test.ts
```

编辑 `index.ts`：将 `"build-ir": () => import("./commands/build-ir.js"),` 改为 `"assemble-ir": () => import("./commands/assemble-ir.js"),`。

- [ ] **Step 5: 运行测试确认通过**

Run:
```bash
npx tsx --test __tests__/assemble-ir.test.ts 2>&1 | tail -15
npm run typecheck
```
预期：3 个测试 PASS，typecheck 0 error。

- [ ] **Step 6: 提交**

Run（在 `/workspace`）:
```bash
git add -A
git -c user.name="WangHHY19931001" -c user.email="wanghhy@163.com" commit -m "refactor: build-ir 改名瘦身为 assemble-ir (Task 4)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: 确保 assemble-ir 不依赖已归档 frontend/builder

- [ ] **Step 1: 确认 assemble-ir.ts 只 import 保留 lib**

检查 `commands/assemble-ir.ts` 的 import：应仅来自 `../types/*`、`../lib/cli.js`、`../lib/jsonl.js`。不得 import `frontend/builder`。若 Step 3 已正确实现则满足。

- [ ] **Step 2: 运行完整测试**

Run（在 `/workspace/.claude/skills/srs-formalizer/scripts`）:
```bash
npm test 2>&1 | tail -20
```
预期：全部保留测试通过。

- [ ] **Step 3: 提交（若有修复）**

仅在 Step 1-2 有修改时提交：
```bash
git add -A && git -c user.name="WangHHY19931001" -c user.email="wanghhy@163.com" commit -m "fix: assemble-ir 清理遗留 frontend 依赖 (Task 5)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 6: 新增 hash-compute 工具

**Files:**
- Create: `commands/hash-compute.ts`
- Create: `__tests__/hash-compute.test.ts`
- Modify: `index.ts`（注册 `hash-compute`）

职责（DESIGN.md §8.4）：计算/比对 SHA-256 sourceHash。无 `--compare` → 返回 hash；有 `--compare` → 返回 match/mismatch。

- [ ] **Step 1: 写失败测试**

Create `/workspace/.claude/skills/srs-formalizer/scripts/__tests__/hash-compute.test.ts`:

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { main } from '../commands/hash-compute.js';

test('hash-compute 返回文件 SHA-256', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hash-'));
  const f = path.join(tmp, 'a.txt');
  fs.writeFileSync(f, 'hello');
  const res = await main(['--file', f]);
  assert.equal(res.status, 'ok');
  const expected = createHash('sha256').update('hello').digest('hex');
  assert.equal((res.data as { hash: string }).hash, expected);
});

test('hash-compute --compare 匹配返回 ok', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hash-'));
  const f = path.join(tmp, 'a.txt');
  fs.writeFileSync(f, 'hello');
  const expected = createHash('sha256').update('hello').digest('hex');
  const res = await main(['--file', f, '--compare', expected]);
  assert.equal(res.status, 'ok');
  assert.equal((res.data as { match: boolean }).match, true);
});

test('hash-compute --compare 不匹配返回 error', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hash-'));
  const f = path.join(tmp, 'a.txt');
  fs.writeFileSync(f, 'hello');
  const res = await main(['--file', f, '--compare', 'deadbeef']);
  assert.equal(res.status, 'error');
  assert.equal((res.data as { match: boolean }).match, false);
});

test('hash-compute 缺少 --file 报错', async () => {
  const res = await main([]);
  assert.equal(res.status, 'error');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:
```bash
npx tsx --test __tests__/hash-compute.test.ts 2>&1 | tail -10
```
预期：FAIL（模块不存在）。

- [ ] **Step 3: 实现 hash-compute.ts**

Create `/workspace/.claude/skills/srs-formalizer/scripts/commands/hash-compute.ts`:

```typescript
import * as fs from 'node:fs';
import { createHash } from 'node:crypto';
import type { CliResult } from '../types/index.js';
import { safeParseArg } from '../lib/cli.js';

export async function main(args: string[]): Promise<CliResult> {
  let fileArg: string | null;
  let compareArg: string | null;
  try {
    fileArg = safeParseArg(args, '--file');
    compareArg = safeParseArg(args, '--compare');
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  if (!fileArg) return { status: 'error', message: 'Missing required argument: --file' };

  try {
    const content = fs.readFileSync(fileArg);
    const hash = createHash('sha256').update(content).digest('hex');

    if (compareArg !== null) {
      const match = hash === compareArg;
      if (match) {
        return { status: 'ok', data: { hash, match: true } };
      }
      return { status: 'error', message: `Hash mismatch: expected ${compareArg}, got ${hash}`, data: { hash, match: false } };
    }

    return { status: 'ok', data: { hash } };
  } catch (err) {
    return { status: 'error', message: `Hash compute failed: ${(err as Error).message}` };
  }
}

import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
```

- [ ] **Step 4: 注册到 index.ts**

在 `index.ts` 的 COMMANDS 中添加（按字母序插入合适位置）：
```typescript
"hash-compute": () => import("./commands/hash-compute.js"),
```

- [ ] **Step 5: 运行测试确认通过**

Run:
```bash
npx tsx --test __tests__/hash-compute.test.ts 2>&1 | tail -10
npm run typecheck
```
预期：4 个测试 PASS，typecheck 0 error。

- [ ] **Step 6: 提交**

Run（在 `/workspace`）:
```bash
git add -A
git -c user.name="WangHHY19931001" -c user.email="wanghhy@163.com" commit -m "feat: 新增 hash-compute 独立工具 (Task 6)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 7: 新增 tlc-trace-parse 工具

**Files:**
- Create: `commands/tlc-trace-parse.ts`
- Create: `__tests__/tlc-trace-parse.test.ts`
- Modify: `index.ts`（注册 `tlc-trace-parse`）

职责（DESIGN.md §8.5）：解析 TLC 反例 trace 为结构化状态序列 JSON。

- [ ] **Step 1: 写失败测试**

Create `/workspace/.claude/skills/srs-formalizer/scripts/__tests__/tlc-trace-parse.test.ts`:

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { main } from '../commands/tlc-trace-parse.js';

const SAMPLE_TRACE = `@!@!@STARTMSG 2193:1 @!@!@
The behavior is blocked at state 1.
@!@!@ENDMSG 2193 @!@!@
@!@!@STARTMSG 2110:1 @!@!@
1: <Init line 5, col 3 to line 5, col 10 of module M>
/\\ x = 1
/\\ y = FALSE
@!@!@ENDMSG 2110 @!@!@
@!@!@STARTMSG 2110:2 @!@!@
2: <Next line 8, col 3 to line 8, col 20 of module M>
/\\ x = 2
/\\ y = TRUE
@!@!@ENDMSG 2110 @!@!@
`;

test('tlc-trace-parse 解析状态序列', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tlc-'));
  const f = path.join(tmp, 'trace.txt');
  fs.writeFileSync(f, SAMPLE_TRACE);
  const res = await main(['--trace', f]);
  assert.equal(res.status, 'ok');
  const data = res.data as { states: Array<{ index: number; action: string; variables: Record<string, string> }> };
  assert.equal(data.states.length, 2);
  assert.equal(data.states[0].index, 1);
  assert.equal(data.states[0].variables.x, '1');
  assert.equal(data.states[1].index, 2);
  assert.equal(data.states[1].variables.y, 'TRUE');
});

test('tlc-trace-parse 缺少 --trace 报错', async () => {
  const res = await main([]);
  assert.equal(res.status, 'error');
});

test('tlc-trace-parse 空文件返回空状态', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tlc-'));
  const f = path.join(tmp, 'empty.txt');
  fs.writeFileSync(f, '');
  const res = await main(['--trace', f]);
  assert.equal(res.status, 'ok');
  assert.equal((res.data as { states: unknown[] }).states.length, 0);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:
```bash
npx tsx --test __tests__/tlc-trace-parse.test.ts 2>&1 | tail -10
```
预期：FAIL（模块不存在）。

- [ ] **Step 3: 实现 tlc-trace-parse.ts**

Create `/workspace/.claude/skills/srs-formalizer/scripts/commands/tlc-trace-parse.ts`:

```typescript
import * as fs from 'node:fs';
import type { CliResult } from '../types/index.js';
import { safeParseArg } from '../lib/cli.js';

interface TraceState {
  index: number;
  action: string;
  variables: Record<string, string>;
}

function parseTrace(content: string): TraceState[] {
  const states: TraceState[] = [];
  // TLC 状态消息块以 2110 标记，格式："<stateNum>: <action>\n/\\ var = val\n..."
  const blocks = content.split(/@!@!@STARTMSG 2110:\d+ @!@!@/);
  for (const block of blocks) {
    const endIdx = block.indexOf('@!@!@ENDMSG 2110');
    if (endIdx === -1) continue;
    const body = block.slice(0, endIdx).trim();
    if (!body) continue;

    const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    // 第一行："1: <Init line ...>"
    const headerMatch = lines[0].match(/^(\d+):\s*(.*)$/);
    if (!headerMatch) continue;
    const index = parseInt(headerMatch[1], 10);
    const action = headerMatch[2];

    const variables: Record<string, string> = {};
    for (let i = 1; i < lines.length; i++) {
      // 形如 "/\\ x = 1" 或 "/\\ x = 1 /\\ y = 2"
      const parts = lines[i].split('/\\').map((s) => s.trim()).filter(Boolean);
      for (const part of parts) {
        const eq = part.match(/^(\w+)\s*=\s*(.+)$/);
        if (eq) {
          variables[eq[1]] = eq[2].trim();
        }
      }
    }

    states.push({ index, action, variables });
  }
  return states;
}

export async function main(args: string[]): Promise<CliResult> {
  let traceArg: string | null;
  try { traceArg = safeParseArg(args, '--trace'); }
  catch (err) { return { status: 'error', message: (err as Error).message }; }

  if (!traceArg) return { status: 'error', message: 'Missing required argument: --trace' };

  try {
    const content = fs.readFileSync(traceArg, 'utf-8');
    const states = parseTrace(content);
    return { status: 'ok', data: { states } };
  } catch (err) {
    return { status: 'error', message: `TLC trace parse failed: ${(err as Error).message}` };
  }
}

import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
```

- [ ] **Step 4: 注册到 index.ts**

在 COMMANDS 中添加：
```typescript
"tlc-trace-parse": () => import("./commands/tlc-trace-parse.js"),
```

- [ ] **Step 5: 运行测试确认通过**

Run:
```bash
npx tsx --test __tests__/tlc-trace-parse.test.ts 2>&1 | tail -10
npm run typecheck
```
预期：3 个测试 PASS，typecheck 0 error。

- [ ] **Step 6: 提交**

Run（在 `/workspace`）:
```bash
git add -A
git -c user.name="WangHHY19931001" -c user.email="wanghhy@163.com" commit -m "feat: 新增 tlc-trace-parse 独立工具 (Task 7)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 8: 更新 index.ts 注册表与帮助文本

**Files:**
- Modify: `index.ts`（COMMANDS 注册表 + printUsage 帮助文本）

最终注册表应为 17 个命令（10 门禁 + 7 工具）。`printUsage` 帮助文本需移除已归档命令的说明，按 DESIGN.md §3 重新组织为"门禁校验器"与"独立工具"两组。

- [ ] **Step 1: 确认 COMMANDS 注册表为 17 项**

Run（在 `/workspace/.claude/skills/srs-formalizer/scripts`）:
```bash
node -e "import('./index.ts').catch(()=>{});" 2>/dev/null; grep -c 'import("./commands/' index.ts
```
预期计数 17。应为：`validate-jsonl`、`validate-semantics`、`validate-architecture`、`validate-cypher`、`validate-bdd`、`validate-tla`、`validate-lean`、`validate-glossary`、`validate-checklist`、`verify-gate`、`assemble-ir`、`check-connectivity`、`query-graph`、`hash-compute`、`tlc-trace-parse`、`verify-skill-integrity`、`pack-skill`。

- [ ] **Step 2: 重写 printUsage 帮助文本**

编辑 `index.ts` 的 `printUsage` 函数，替换为按门禁/工具分组的版本：

```typescript
function printUsage(_command?: string): void {
  console.log(`SRS-Formalizer v2.0.0 — Agent-driven SRS formalization skill
脚本只做门禁校验与专用算法，语义工作由 Agent 经 SKILL.md + prompts 完成。

Gate Validators (门禁校验器，只做确定性校验):
  validate-jsonl          校验 JSONL 记录格式 (6 项)
  validate-semantics      校验 srs-ir.json 语义一致性 [--strict]
  validate-architecture   校验架构 JSONL (6 项)
  validate-cypher         校验 .cypher 语法 (4 项)
  validate-bdd            校验 .feature (Phase1-4) [--strict --promote]
  validate-tla            校验 .tla + .cfg (SANY+TLC) [--strict --promote]
  validate-lean           校验 Lake 项目 (lake build) [--strict --promote]
  validate-glossary       校验术语 JSON (8 项)
  validate-checklist      校验 CHECKLIST.md 完整性
  verify-gate             三级门禁 (S1|R3|FINAL)

Independent Tools (独立工具，处理 LLM 不便操作的数据结构/算法):
  assemble-ir             JSONL → srs-ir.json 装配 + 完整性校验
  check-connectivity      图连通性/SCC/孤岛检测
  query-graph             IR 查询接口 (node/neighbors/module/path)
  hash-compute            计算/比对 SHA-256 sourceHash
  tlc-trace-parse         解析 TLC 反例 trace 为状态序列
  verify-skill-integrity  技能完整性校验 [--repair]
  pack-skill              加密备份 (仅人类 --force)

Usage: npx tsx index.ts <command> [options]
All commands output JSON { status, message?, data? }.

For full spec see: docs/DESIGN.md
`);
}
```

- [ ] **Step 3: 运行 typecheck 与测试**

Run:
```bash
npm run typecheck
npm test 2>&1 | tail -20
```
预期：0 error，测试通过。注意 `index.test.ts` 若校验注册表数量，需更新预期值。

- [ ] **Step 4: 提交**

Run（在 `/workspace`）:
```bash
git add -A
git -c user.name="WangHHY19931001" -c user.email="wanghhy@163.com" commit -m "refactor: 更新 index.ts 注册表为 17 命令与帮助文本 (Task 8)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 9: 更新 package.json 与 evals

**Files:**
- Modify: `package.json`（移除 `benchmark` 脚本，因 benchmark-middle-end.ts 引用已归档 middle-end）
- Archive: `benchmark-middle-end.ts`
- Modify: `evals.ts`（移除对已归档命令的评估，保留 hash 绑定/TLA+/artifact 契约评估）

- [ ] **Step 1: 归档 benchmark**

Run（在 `/workspace`）:
```bash
mkdir -p .worktrees/archive/2026-07-16/scripts
git mv .claude/skills/srs-formalizer/scripts/benchmark-middle-end.ts .worktrees/archive/2026-07-16/scripts/benchmark-middle-end.ts
```

- [ ] **Step 2: 更新 package.json scripts**

编辑 `package.json`，移除 `benchmark` 行，保留 `test`、`evals`、`typecheck`：

```json
"scripts": {
  "test": "npx tsx --test __tests__/*.test.ts",
  "evals": "npx tsx evals.ts",
  "typecheck": "tsc --noEmit"
}
```

- [ ] **Step 3: 修复 evals.ts 对已归档模块的引用**

Run:
```bash
cd /workspace/.claude/skills/srs-formalizer/scripts && npm run evals 2>&1 | tail -20
```
若失败，编辑 `evals.ts` 移除对已归档命令（emit、generate-*、pipeline、compile 等）的评估套件，保留：hash 绑定、TLA+ SANY/TLC 正反例、artifact registry、文档契约。evals 必须通过。

- [ ] **Step 4: 运行三件套验证**

Run:
```bash
npm run typecheck && npm test && npm run evals
```
预期：全部通过。

- [ ] **Step 5: 提交**

Run（在 `/workspace`）:
```bash
git add -A
git -c user.name="WangHHY19931001" -c user.email="wanghhy@163.com" commit -m "refactor: 更新 package.json 与 evals，移除 benchmark (Task 9)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 10: 清理 lib 中遗留孤立模块

**Files:**
- Audit & archive: 保留 lib 中实际已无被引用的模块

- [ ] **Step 1: 检查保留 lib 的引用关系**

Run（在 `/workspace/.claude/skills/srs-formalizer/scripts`）:
```bash
for f in lib/*.ts; do
  base=$(basename "$f" .ts)
  cnt=$(grep -rl "lib/$base" commands/ lib/ __tests__/ types/ 2>/dev/null | wc -l)
  echo "$base: $cnt refs"
done
```
对引用数为 0 的散落 lib 文件，判断是否仍被 DESIGN.md §3.3 列为保留。若未列出且无引用，归档。

- [ ] **Step 2: 归档确认无引用且未列保留的文件**

按 Step 1 结果，对每个孤立文件执行 `git mv` 到归档目录。常见候选：`lib/progress.ts`（若 pipeline 已归档则无引用）、`lib/checklists.ts`（若 validate-checklist 已自包含）。**但** DESIGN.md §3.3 显式保留 `text-analysis.ts`、`checklists.ts`，故这两个保留。仅归档真正无引用且未列保留的。

- [ ] **Step 3: 验证三件套**

Run:
```bash
npm run typecheck && npm test && npm run evals
```
预期：全绿。

- [ ] **Step 4: 提交**

Run（在 `/workspace`）:
```bash
git add -A
git -c user.name="WangHHY19931001" -c user.email="wanghhy@163.com" commit -m "refactor: 清理 lib 孤立模块 (Task 10)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 11: 新增 5 个参考文档

**Files:**
- Create: `references/ir-schema-reference.md`
- Create: `references/cypher-generation-guide.md`
- Create: `references/shard-index-format.md`
- Create: `references/nfr-threshold-extraction-guide.md`
- Create: `references/risk-scoring-formula.md`

每个文档从 DESIGN.md 对应章节派生，供 Agent 子代理按需加载（L3）。

- [ ] **Step 1: 创建 ir-schema-reference.md**

Create `/workspace/.claude/skills/srs-formalizer/references/ir-schema-reference.md`，内容为 DESIGN.md §5 SRS-IR Schema 的完整拷贝（顶层结构、节点、边、辅助类型、不可变性契约），加前言说明"本文件是 SRS-IR schema 的权威参考，Agent 构建 IR 时依据此文档"。

- [ ] **Step 2: 创建 cypher-generation-guide.md**

Create `/workspace/.claude/skills/srs-formalizer/references/cypher-generation-guide.md`，内容：节点/边的 Cypher 生成规范（节点 label 映射、边 type 映射、属性序列化、`MERGE` 用法、注入防护），引用 DESIGN.md §4.4 B1 与 §7.5。

- [ ] **Step 3: 创建 shard-index-format.md**

Create `/workspace/.claude/skills/srs-formalizer/references/shard-index-format.md`，内容为 DESIGN.md §6.2 ShardIndex 格式规范 + §4.2 分片算法（MAX_SHARD_LINES=200、递归策略、Token 估算、shard ID 规则）。

- [ ] **Step 4: 创建 nfr-threshold-extraction-guide.md**

Create `/workspace/.claude/skills/srs-formalizer/references/nfr-threshold-extraction-guide.md`，内容：六类 NFR 各 5 个正则模式（performance/security/availability/compatibility/maintainability/compliance），正则优先 → 启发式回退 → 跳过不报错流程，引用 DESIGN.md §4.3。

- [ ] **Step 5: 创建 risk-scoring-formula.md**

Create `/workspace/.claude/skills/srs-formalizer/references/risk-scoring-formula.md`，内容：`riskScore = orphanRate × 0.2 + crossFileCoverage × 0.3 + nfrCoverage × 0.3 + gapWeight × 0.2` 各项定义、计算方法、highRiskShards 判定阈值。

- [ ] **Step 6: 提交**

Run（在 `/workspace`）:
```bash
git add -A
git -c user.name="WangHHY19931001" -c user.email="wanghhy@163.com" commit -m "docs: 新增 5 个 Agent 参考文档 (Task 11)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 12: 更新提示词（新增 8、移除 5）

**Files:**
- Create: 8 个 executor 提示词
- Archive: 5 个移除的 executor 提示词

**移除（5）：** `executor-frontend-extract.md`、`executor-frontend-clarify.md`、`executor-frontend-arch.md`、`executor-glossary.md`、`executor-middle-end-contradiction.md`

**新增（8）：** `executor-frontend-parse.md`、`executor-middle-end-structure.md`、`executor-middle-end-semantic.md`、`executor-middle-end-nfr.md`、`executor-middle-end-risk.md`、`executor-backend-cypher.md`、`executor-backend-fixture.md`、`executor-backend-traceability.md`

- [ ] **Step 1: 归档 5 个移除提示词**

Run（在 `/workspace`）:
```bash
mkdir -p .worktrees/archive/2026-07-16/prompts
for f in executor-frontend-extract executor-frontend-clarify executor-frontend-arch executor-glossary executor-middle-end-contradiction; do
  git mv ".claude/skills/srs-formalizer/prompts/$f.md" ".worktrees/archive/2026-07-16/prompts/$f.md"
done
```

- [ ] **Step 2: 创建 executor-frontend-parse.md**

Create `/workspace/.claude/skills/srs-formalizer/prompts/executor-frontend-parse.md`，内容：执行者角色定义 + 任务（读 SRS → 识别章节层级/术语/跨章引用 → 按 references/shard-index-format.md 分片 → NFR 关键词扫描 → 产出 `_ctx/shard_index.json`）+ 约束（禁止编造、shard ID 规则、MAX_SHARD_LINES=200）+ 产出格式（ShardIndex schema）+ 完成后调用 `validate-checklist --stage S1`。

- [ ] **Step 3: 创建 executor-middle-end-structure.md**

Create `/workspace/.claude/skills/srs-formalizer/prompts/executor-middle-end-structure.md`，内容：读 srs-ir.json → 判断孤儿节点/悬挂边/概念孤岛/跨文件孤岛 → 产出 `3_graph/analysis/structure.json` → 调用 `validate-semantics --strict`。引用 references/ir-schema-reference.md。

- [ ] **Step 4: 创建 executor-middle-end-semantic.md**

Create `/workspace/.claude/skills/srs-formalizer/prompts/executor-middle-end-semantic.md`，内容：读 IR → Jaccard 重复检测（阈值）+ 反义词冲突 + 同侧面聚类 → 产出 `3_graph/analysis/semantic.json`。

- [ ] **Step 5: 创建 executor-middle-end-nfr.md**

Create `/workspace/.claude/skills/srs-formalizer/prompts/executor-middle-end-nfr.md`，内容：读 IR → NFR 节点分类（六类）+ 阈值正则提取（引用 references/nfr-threshold-extraction-guide.md）+ 盲点检测 → 写回 IR 的 `nfrProfile` → 调用 `validate-semantics --strict`。

- [ ] **Step 6: 创建 executor-middle-end-risk.md**

Create `/workspace/.claude/skills/srs-formalizer/prompts/executor-middle-end-risk.md`，内容：读 IR → 按公式计算 riskScore（引用 references/risk-scoring-formula.md）→ 写回 `meta.riskScore`。

- [ ] **Step 7: 创建 executor-backend-cypher.md**

Create `/workspace/.claude/skills/srs-formalizer/prompts/executor-backend-cypher.md`，内容：读 IR → 生成 Cypher 知识图谱（引用 references/cypher-generation-guide.md）→ 产出 `outputs/graphs/srs-graph.cypher` → 调用 `validate-cypher --file`。

- [ ] **Step 8: 创建 executor-backend-fixture.md**

Create `/workspace/.claude/skills/srs-formalizer/prompts/executor-backend-fixture.md`，内容：读 IR + verified 形式化产物 → 生成测试夹具（pytest/JUnit/Cucumber/Playwright/fast-check）→ 产出 `outputs/fixtures/**`。

- [ ] **Step 9: 创建 executor-backend-traceability.md**

Create `/workspace/.claude/skills/srs-formalizer/prompts/executor-backend-traceability.md`，内容：读 IR + 所有 verified 产物 → 生成追溯矩阵 → 产出 `outputs/reports/traceability.{md,cypher}`。

- [ ] **Step 10: 提交**

Run（在 `/workspace`）:
```bash
git add -A
git -c user.name="WangHHY19931001" -c user.email="wanghhy@163.com" commit -m "docs: 新增 8 个执行者提示词，归档 5 个移除提示词 (Task 12)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 13: 重写 SKILL.md

**Files:**
- Modify: `SKILL.md`（437 行 → 整体重写）

按 DESIGN.md §9.1 重写要点重写 SKILL.md：移除编译器阶段脚本承担部分，改为"Agent 工作流 + 门禁拦截 + 工具调用"；新增 Bootstrap 段；每阶段明确 Agent 做什么 → 调用哪个门禁/工具。

- [ ] **Step 1: 重写 SKILL.md**

整体替换 `/workspace/.claude/skills/srs-formalizer/SKILL.md`，结构：
1. 元数据头（name/description/version 2.0.0/安全等级 high）
2. 核心原则：脚本只做门禁校验与专用算法，语义工作全部由 Agent 经提示词完成
3. 渐进式披露（L1/L2/L3）
4. Bootstrap 段（替代 init）：Agent 创建工作目录结构的精确指令（DESIGN.md §4.1 目录树）+ 复制 templates/checklists 与 templates/*.template
5. Frontend 阶段（F1-F5 表，DESIGN.md §4.2）
6. Middle-end 阶段（M1-M6 表，DESIGN.md §4.3）
7. Backend 阶段（B1-B7 表，DESIGN.md §4.4）
8. 跨图一致性验证（DESIGN.md §4.5）
9. 门禁/工具速查表（17 命令一句话说明 + 调用时机）
10. 安全约束（路径安全、毒值、技能完整性、HITL）

正文 ≤5,000 token。详细规范引用 references/ 与 DESIGN.md。

- [ ] **Step 2: 提交**

Run（在 `/workspace`）:
```bash
git add -A
git -c user.name="WangHHY19931001" -c user.email="wanghhy@163.com" commit -m "docs: 重写 SKILL.md 为 Agent 驱动架构 (Task 13)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 14: 规格一致性测试更新

**Files:**
- Modify: `__tests__/index.test.ts`（命令清单一致性）
- Modify: `__tests__/artifact-contracts.test.ts`（路径契约）

按 DESIGN.md §14.4，一致性测试需验证：index.ts 注册表与 §3 一致、工作目录结构与 §4.1/§6.3 一致、NFR 六类、门禁失败语义、草稿不可消费。

- [ ] **Step 1: 更新 index.test.ts 命令清单**

编辑 `/workspace/.claude/skills/srs-formalizer/scripts/__tests__/index.test.ts`，将期望命令清单更新为 17 个：
```typescript
const EXPECTED_COMMANDS = [
  'validate-jsonl', 'validate-semantics', 'validate-architecture', 'validate-cypher',
  'validate-bdd', 'validate-tla', 'validate-lean', 'validate-glossary',
  'validate-checklist', 'verify-gate',
  'assemble-ir', 'check-connectivity', 'query-graph', 'hash-compute',
  'tlc-trace-parse', 'verify-skill-integrity', 'pack-skill',
];
```
测试：注册表 keys 必须等于该集合（无多无少）。

- [ ] **Step 2: 更新 artifact-contracts.test.ts 路径契约**

编辑 `__tests__/artifact-contracts.test.ts`，确保校验的路径契约与 DESIGN.md §4.1/§6.3 一致：`outputs/bdd/{draft,verified,validation}`、`outputs/tlaplus/{draft,verified,validation}`、`outputs/lean4/{draft,verified,validation}`、`outputs/graphs`、`outputs/fixtures`、`outputs/reports`、`2_extract/{r1-explicit,r2-implicit,r3-relational,architecture}`、`_ctx`、`3_graph/{graph,analysis}`。移除对已归档命令路径的断言。

- [ ] **Step 3: 运行测试**

Run（在 `/workspace/.claude/skills/srs-formalizer/scripts`）:
```bash
npm test 2>&1 | tail -20
```
预期：全绿。

- [ ] **Step 4: 提交**

Run（在 `/workspace`）:
```bash
git add -A
git -c user.name="WangHHY19931001" -c user.email="wanghhy@163.com" commit -m "test: 更新规格一致性测试为 17 命令与新路径契约 (Task 14)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 15: 最终验证与提交

- [ ] **Step 1: 运行三件套**

Run（在 `/workspace/.claude/skills/srs-formalizer/scripts`）:
```bash
npm install
npm run typecheck
npm test
npm run evals
```
全部必须通过。typecheck 0 error，test 0 failures，evals 通过。

- [ ] **Step 2: 验证命令清单**

Run:
```bash
npx tsx index.ts --help 2>&1 | head -40
```
确认输出 17 个命令，分"Gate Validators"与"Independent Tools"两组。

- [ ] **Step 3: 验证归档完整性**

Run（在 `/workspace`）:
```bash
ls .worktrees/archive/2026-07-16/scripts/commands/ | wc -l
```
预期：25（24 个移除命令 + build-ir 旧版）。

- [ ] **Step 4: 验证文件行数 ≤300**

Run（在 `/workspace/.claude/skills/srs-formalizer/scripts`）:
```bash
find commands/ lib/ -name '*.ts' -exec sh -c 'lines=$(wc -l < "$1"); [ "$lines" -gt 300 ] && echo "$1: $lines"' _ {} \;
```
预期：无输出（所有文件 ≤300 行）。

- [ ] **Step 5: 最终提交（若有遗留改动）**

Run（在 `/workspace`）:
```bash
git add -A
git -c user.name="WangHHY19931001" -c user.email="wanghhy@163.com" commit -m "chore: 架构反转重构最终验证通过 (Task 15)

39→17 命令，10 门禁 + 7 工具。typecheck/test/evals 全绿。
DESIGN.md v2.0.0 契约满足。

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## 自审清单（plan self-review）

**Spec coverage（DESIGN.md 章节覆盖）：**
- §2 核心理念 → Task 13 SKILL.md 重写 ✓
- §3 脚本清单（17 命令）→ Task 1-2 归档 24、Task 4 assemble-ir、Task 6-7 新工具、Task 8 注册表 ✓
- §4 Agent 工作流 → Task 13 SKILL.md + Task 12 提示词 ✓
- §5 SRS-IR Schema → Task 11 ir-schema-reference.md ✓
- §6 数据契约 → Task 14 一致性测试 ✓
- §7 门禁规则 → 保留（Task 3 修复引用）✓
- §8 独立工具契约 → Task 4/6/7 实现 ✓
- §9 Agent 载体 → Task 11/12/13 ✓
- §10 形式化建模约束 → 保留（提示词 executor-bdd/tlaplus/lean4 增强在 Task 12 范围外，标注为后续）
- §11 安全设计 → 保留 ✓
- §12 CLI 约定 → Task 8 ✓
- §13 核心约束 → 全程遵守 ✓
- §14 测试策略 → Task 14/15 ✓
- §16 演化历史 → DESIGN.md 已更新（brainstorming 阶段完成）

**Placeholder scan：** 无 TBD/TODO；所有代码步骤含完整代码。

**Type consistency：** `assemble-ir`/`hash-compute`/`tlc-trace-parse` 的 main 签名统一为 `(args: string[]) => Promise<CliResult>`；CliResult 类型贯穿一致；TraceState/IRNode 等类型定义一致。

**注意：** executor-bdd/tlaplus/lean4.md 的"从零生成不依赖 emitter 草稿"增强属语义增强，非本次脚本重构硬性要求，可在 Task 12 后单独迭代，不影响三件套验证。
