# srs-formalizer v0.5.1 Documentation & Quality Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add TLA+/Lean 4 coding guides, expand capability-probe from 6 to 50 questions (8 dimensions, toolchain-verified), add end-to-end walkthrough example, and document Golden standards and directory structure in README.

**Architecture:** Three new markdown reference files. Capability-probe expanded with 44 new TS-scored questions + 14 toolchain-verified questions. README restructured with four new documentation sections. Pure docs + TS changes, zero pipeline impact.

**Tech Stack:** TypeScript 5.5+ (strict), Node.js ≥20, ESM, zero external deps. Reference docs: Markdown.

## Global Constraints

- TypeScript strict mode (`noUnusedLocals`, `noUnusedParameters`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`)
- Zero external npm dependencies (only `typescript` + `@types/node`)
- All existing 255 tests must continue passing
- Reference documents follow existing `references/*.md` style and structure
- TLA+/Lean 4 capability probes require toolchain: SANY+TLC (Java) / lake (Lean 4). Toolchain missing → dimension marked `unavailable`, not 0

---

### Task 1: TLA+ Coding Guide

**Files:**
- Create: `.claude/skills/srs-formalizer/references/tlaplus-coding-guide.md`

**Interfaces:**
- Produces: standalone reference document consumed by S5 orchestrator and debug-tlc subagent

- [ ] **Step 1: Write the guide**

Create `.claude/skills/srs-formalizer/references/tlaplus-coding-guide.md`:

```markdown
# TLA+ 编码指南

本指南为 srs-formalizer S5 阶段的 TLA+ 子代理提供编码规范。

---

## 1. 层次化建模方法论

### 1.1 层次定义

- **第一级（L1）**：系统内外交互抽象
- **第二级（L2）**：子系统内部行为 + 上下同级交互抽象
- **第三级（L3）**：原子化子系统行为抽象

可推广至 4 级、5 级、6 级或更多。每个下级子系统可视为独立系统继续拆解。

### 1.2 拆解阈值

先写 TLA+，分析变量组合。组合结果 > 1k 时考虑拆，> 1w 时必须拆。

### 1.3 文件头部标注

每个 TLA+ 文件头部必须标注：
- 自身所属系统
- 实现的追踪号
- 上级/同级/下级 TLA 文件相对路径

```
---- MODULE OrderStateMachine ----
\* 所属系统: 在线商城 — 订单子系统
\* 追踪号: TR-ORDER-003
\* 上级: ../SystemLevel.tla
\* 同级: ./PaymentStateMachine.tla
\* 下级: ./atomic/StockLock.tla
====
```

### 1.4 死锁

正常系统不允许死锁。死锁或矛盾分支需定位根因修正。

### 1.5 调试流程

TLA+ 的轨迹文件、状态文件应先删除再运行 TLC。

### 1.6 编码顺序

先保证通过语法检查（SANY），然后才允许进行 TLC 检查。

### 1.7 质量标准

TLA+ 必须通过工具语法检查、TLC 检查。不允许：
- 死锁
- 状态爆炸
- 违反不变式
- 实现错误

### 1.8 实现要求

TLA+ 不接受占位实现、简化实现、错误实现。

### 1.9 SRS 一致性

TLA+ 建模必须符合 SRS 的设计。对于符合设计仍然有问题的，需要报告人类，提出可选项对 SRS 进行修正。此部分允许联网搜索深度调研，但必须基于事实工作。产出写入 `SRS_PATCHES.md`。

---

## 2. 编码最佳实践

### 2.1 最小化建模

从最小规格开始，只添加必要的组件。删除不应引发焦虑——"删除应该带来愉悦"（Murat Buffalo, 2025）。

### 2.2 TypeOK 不变式

TLA+ 是无类型的。每个 spec 必须包含 TypeOK 不变式覆盖所有变量。TypeOK 既是文档也是可执行检查。

```tla
TypeOK ==
  /\ counter \in 0..100
  /\ status \in {"idle", "processing", "done"}
```

### 2.3 派生优于存储

优先使用状态函数派生值，而不是存储额外变量。每增加一个变量，状态空间指数增长。

```tla
\* 差: VARIABLE count, is_full
\* 好: VARIABLE count
\*     Full == count = MaxCapacity
```

### 2.4 细粒度原子性 + 卫语句风格

将动作推到正确性允许的最细粒度，以暴露真实的并发交错。动作的卫语句（guard）应定义动作的语义。

```tla
Increment ==
  /\ counter < 100       \* guard
  /\ counter' = counter + 1
```

### 2.5 参数化动作 + 分解结构体

将 `\E` 量词移到 Next 层级，传递值给动作以支持复用。分解结构体变量以支持独立更新。

```tla
\* 用两个变量替代一个结构体
VARIABLES worker_queue, worker_online
\* 参数化
Process(w) == ...
Next == \E w \in Worker: Process(w)
```

### 2.6 分离安全性与活性模型

活性检查更慢且不能使用对称集。创建单独的模型配置文件，用小常量仅检查活性。

### 2.7 ASSUME 每一个 CONSTANT

```tla
CONSTANTS MaxRetry, Timeout
ASSUME MaxRetry \in Nat
ASSUME Timeout \in 1..100
```

### 2.8 注入 Bug 验证不变式强度

如果不变量从不失败，它可能太弱。故意注入已知 Bug 验证不变式能否捕获。

### 2.9 使用 `@` 简写

```tla
[f EXCEPT ![key] = @ + 1]  \* 而非 f[key] + 1
```

### 2.10 PlusCal 注意事项

- 避免 `while` 循环——每次迭代创建新状态
- 标签定义原子性——标签之间的所有内容是一个原子步骤
- macros 是语句复用的主要形式

---

## 3. LLM 常见错误

基于 FormaLLM 研究（30 模型，205 规格，语义正确率 8.6%）和 SysMoBench 的发现：

| # | 错误类型 | 说明 | 规避方法 |
|---|---------|------|---------|
| 1 | **教科书建模** | Spec 进入系统永远不会到达的状态。模型按照"教科书"而非实际实现 | 对照 SRS 原文逐行检查每个状态转换 |
| 2 | **过度原子化** | 多个真实操作融合为单个原子守卫，spec 无法到达系统的关键状态 | 每个 SRS 需求对应的操作应是独立的 Next 子句 |
| 3 | **遗漏公平性约束** | 活性属性无意义——TLC 总可以永远 stutter | 使用 `WF_vars` / `SF_vars` |
| 4 | **不变式太弱** | `TRUE` 永远不违反——毫无约束力 | TypeOK 之外至少一个正确性不变式 |
| 5 | **PlusCal while 循环** | 循环展开导致状态爆炸 | 用整体序列重赋值替代 while |

---

## 4. 检查清单

- [ ] SANY 语法检查通过？
- [ ] TLC 模型检查通过？
- [ ] 无死锁？
- [ ] 无状态爆炸？
- [ ] TypeOK 不变式覆盖所有变量？
- [ ] 至少一个正确性不变式？
- [ ] 注入 Bug 能被捕获？
- [ ] 与 SRS 设计一致？
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/srs-formalizer/references/tlaplus-coding-guide.md
git commit -m "docs: add TLA+ coding guide with hierarchical methodology and best practices

9 rules for hierarchical modeling, 10 best practices from Murat Buffalo +
LearnTLA, 5 LLM error patterns from FormaLLM research (arXiv:2606.05792).
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Lean 4 Coding Guide

**Files:**
- Create: `.claude/skills/srs-formalizer/references/lean4-coding-guide.md`

**Interfaces:**
- Produces: standalone reference document consumed by S5 orchestrator and debug-lean subagent

- [ ] **Step 1: Write the guide**

Create `.claude/skills/srs-formalizer/references/lean4-coding-guide.md`:

```markdown
# Lean 4 编码指南

本指南为 srs-formalizer S5 阶段的 Lean 4 子代理提供编码规范。

---

## 1. 拆分证明方法论

### 1.1 Step 1: 编写证明骨架

第一步编写证明骨架（带 `sorry`），清晰标注证明策略。

```lean4
theorem main_property (n : ℕ) : n * 2 = n + n := by
  induction n with
  | zero => rfl
  | succ n ih =>
    -- proof strategy: use induction hypothesis + ring
    sorry
```

### 1.2 Step 2: 拆分 sorry 为独立文件

将每个 `sorry` 变为独立的 `.lean` 文件进行证明。

### 1.3 Step 3: 无法单文件则继续拆分

如果一个 theorem/lemma 无法在单个文件中证明，拆分为多个文件分别进行 theorem/lemma 证明，然后 `import`。

### 1.4 Step 4: 递归循环

如果还有 `sorry`，回到 Step 1 继续拆分。递归至无 `sorry` 残留。

### 1.5 质量标准

Lean 4 必须通过工具检查。不允许：
- 算法实现错误
- 不完整实现
- `sorry`
- 告警（warnings）
- `axiom`

允许使用 `mathlib`。必须使用 `theorem` + 完整 proof。每个 lemma 应独立文件证明。

### 1.6 实现要求

Lean 4 不接受占位实现、简化实现、错误实现。

### 1.7 SRS 一致性

Lean 4 建模必须符合 SRS 的设计。对于符合设计仍然有问题的，需要报告人类，提出可选项对 SRS 进行修正。此部分允许联网搜索深度调研，但必须基于事实工作。产出写入 `SRS_PATCHES.md`。

---

## 2. 编码最佳实践

### 2.1 四阶段工作流

**Phase 1: Structure Before Solving** — 提纲先行。用 `have` 声明和带文档的 `sorry` 勾勒证明策略，然后才写 tactic。

**Phase 2: Helper Lemmas First** — 自下而上构建基础设施。提取可复用组件为独立 lemma。

**Phase 3: Incremental Filling** — 一次填一个 `sorry`，每填一个就 `lake build` 验证。

**Phase 4: Type Class Management** — synthesis 失败时用 `haveI` / `letI` 添加显式实例。

### 2.2 策略级联

按以下顺序尝试自动化策略，每个失败后才尝试下一个：

```
rfl → simp → ring → linarith → nlinarith → omega → exact? → apply? → aesop
```

### 2.3 have vs let 选择

- `have`：用于命题和证明项（值被"遗忘"——视为证明完成）
- `let`：用于数据定义（值被保留以供后续引用）
- 对数据用 `have` 是常见陷阱——丢失了可计算的值

### 2.4 证明结构

单文件 >100 行 → 必须拆分为多个 lemma。
`have` 块 >30 行 → 提取为独立 lemma。

### 2.5 mathlib 导入最小化

只导入实际使用的模块。`import Mathlib`（全量导入）禁止。

### 2.6 lake build 流程

每次修改后立即 `lake build`，不要积攒多个修改一起编译。

---

## 3. LLM 常见错误

基于 FormalMATH（5560 题，最高 16.5%）和 FormalProofBench（33.5%）的发现：

| # | 错误类型 | 说明 | 规避方法 |
|---|---------|------|---------|
| 1 | **单体证明** | >100 行单体 proof 未拆分 | 每个 lemma ≤100 行 |
| 2 | **sorry 残留增长** | 递归拆分时 sorry 越拆越多 | 每轮 lake build 确认 sorry 计数递减 |
| 3 | **simulate 未验证** | 使用 `#eval` 模拟而非 `theorem` 证明 | 禁止 `#eval` 替代 proof |
| 4 | **mathlib 版本不匹配** | 引用当前 mathlib 不存在的 lemma | lake build 报错时检查 mathlib 版本 |

---

## 4. 检查清单

- [ ] lake build 通过？
- [ ] 0 `sorry`？
- [ ] 0 `axiom`？
- [ ] 0 warnings？
- [ ] 每个 lemma 独立文件？
- [ ] proof 使用 theorem + 完整 tactic？
- [ ] 与 SRS 设计一致？
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/srs-formalizer/references/lean4-coding-guide.md
git commit -m "docs: add Lean 4 coding guide with split-proof methodology and best practices

4-step split-proof method, 6 best practices from benchflow-ai + mathlib,
4 LLM error patterns from FormalMATH + FormalProofBench research.
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: End-to-End Walkthrough Example

**Files:**
- Create: `.claude/skills/srs-formalizer/examples/end-to-end-walkthrough.md`

**Interfaces:**
- Produces: standalone example document, referenced from README

- [ ] **Step 1: Write the walkthrough**

Create the complete end-to-end example. Use the existing `tests/fixtures/srs-sample-zh.md` as the SRS input. Show all 8 steps with actual CLI commands and expected outputs.

- [ ] **Step 2: Ensure the example uses the actual fixture file**

Reference `.claude/skills/srs-formalizer/tests/fixtures/srs-sample-zh.md` as the SRS input to ensure the example is reproducible.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/srs-formalizer/examples/end-to-end-walkthrough.md
git commit -m "docs: add end-to-end walkthrough example for srs-formalizer

8-step demo: init → compile → manifest → S2 extraction → graph → BDD → TLA+ → gate.
Uses existing tests/fixtures/srs-sample-zh.md as reproducible input.
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: README Updates

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add four new sections to README**

Insert after the "版本历史" section and before "目录结构":

1. **端到端示例引导** — link to `examples/end-to-end-walkthrough.md`
2. **Golden 标准参考** — table of `tests/golden/` files with descriptions
3. **目录参考** — `references/` (7 files) + `templates/` (9 files) complete tables
4. **S5 形式化质量保障** — explanation of SANY+TLC / lake build automated gates

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add end-to-end example, Golden standards, directory reference to README

Four new sections: walkthrough guide, Golden standards table,
references/ + templates/ directory docs, S5 quality gates explanation.
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: Capability Probe — Expand Existing 6 Dimensions

**Files:**
- Modify: `.claude/skills/srs-formalizer/scripts/commands/capability-probe.ts`
- Modify: `.claude/skills/srs-formalizer/scripts/types/index.ts` (CapabilityProfile)

- [ ] **Step 1: Add new probe generator functions**

Add `generateInstructionFollowingProbes()` returning 8 probes, `generateStructuredOutputProbes()` returning 7, etc. Follow the spec's distribution table. The existing single probes become probe #1 of each dimension.

- [ ] **Step 2: Update scoring functions**

Add scoring logic for each new probe. Use the existing scoring architecture (per-dimension `SCORERS` map). New probes reuse the same scoring functions since they use the same check methodology.

- [ ] **Step 3: Update calculateProfile**

Ensure all 8 dimensions (existing 6 + 2 new) are computed. Tier = min(all dimension scores).

- [ ] **Step 4: Run tests and commit**

```bash
cd .claude/skills/srs-formalizer/scripts && npx tsx --test __tests__/capability-probe.test.ts
```
Expected: existing tests pass with updated probe counts

```bash
git add .claude/skills/srs-formalizer/scripts/commands/capability-probe.ts \
        .claude/skills/srs-formalizer/scripts/types/index.ts
git commit -m "feat(capability-probe): expand 6 dimensions from 6 to 36 questions

instruction_following: 8, structured_output: 7, precision: 6,
hierarchical_reasoning: 5, logical_reasoning: 5, creative_reasoning: 5.
Difficulty-graded (easy/medium/hard), TS-scored like existing probes.
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: Capability Probe — TLA+ Dimension

**Files:**
- Modify: `.claude/skills/srs-formalizer/scripts/commands/capability-probe.ts`

- [ ] **Step 1: Add TLA+ probe generation (7 questions)**

```typescript
function generateTlaPlusProbes(): ProbeItem[] {
  return [
    { probe_id: 'formal_tlaplus-1', dimension: 'formal_tlaplus',
      prompt: 'Write a TLA+ spec for a simple counter...', /* easy */ },
    // ... 7 probes total per spec distribution table
  ];
}
```

- [ ] **Step 2: Add TLA+ scoring with toolchain verification**

```typescript
function scoreTlaPlus(probe: ProbeItem, answer: string, tempDir: string): ProbeResult {
  // 1. Write answer to tempDir/probe.tla
  // 2. Run: java -cp tla2tools.jar tla2.TLC probe.tla
  // 3. Check: SANY pass (30pts) + TLC pass (40pts) + mutation test (30pts)
  // 4. If Java/tla2tools.jar not found → mark unavailable
}
```

- [ ] **Step 3: Add toolchain detection**

```typescript
function detectTlaPlusToolchain(): 'available' | 'unavailable' {
  // Check: which java && (which tlc || test -f tla2tools.jar)
}
```

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/srs-formalizer/scripts/commands/capability-probe.ts
git commit -m "feat(capability-probe): add TLA+ dimension with SANY+TLC verification

7 probes (3 easy, 3 medium, 1 hard). Toolchain-verified via SANY+TLC.
Mutation test validates invariant strength. Toolchain missing → unavailable.
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: Capability Probe — Lean 4 Dimension

**Files:**
- Modify: `.claude/skills/srs-formalizer/scripts/commands/capability-probe.ts`

- [ ] **Step 1: Add Lean 4 probe generation (7 questions, no mathlib)**

```typescript
function generateLean4Probes(): ProbeItem[] {
  return [
    { probe_id: 'formal_lean4-1', dimension: 'formal_lean4',
      prompt: 'Prove: ∀ n:ℕ, even n → even (n²). Do NOT use mathlib.', /* easy */ },
    // ... 7 probes total
  ];
}
```

- [ ] **Step 2: Add Lean 4 scoring with lake build verification**

```typescript
function scoreLean4(probe: ProbeItem, answer: string, tempDir: string): ProbeResult {
  // 1. Write answer to tempDir/Probe.lean
  // 2. Write tempDir/lakefile.lean with basic config
  // 3. Run: cd tempDir && lake build
  // 4. Check: lake build pass (40) + 0 sorry (30) + 0 axiom (15) + 0 warnings (15)
}
```

- [ ] **Step 3: Add toolchain detection**

```typescript
function detectLean4Toolchain(): 'available' | 'unavailable' {
  // Check: which lake && which elan
}
```

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/srs-formalizer/scripts/commands/capability-probe.ts
git commit -m "feat(capability-probe): add Lean 4 dimension with lake build verification

7 probes (3 easy, 3 medium, 1 hard). Toolchain-verified via lake build.
No mathlib allowed in test — evaluates base theorem proving ability.
Toolchain missing → unavailable.
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: SKILL.md + CHANGELOG + CHECKLIST Updates

**Files:**
- Modify: `.claude/skills/srs-formalizer/SKILL.md` — capability_requirements add tlaplus + lean4
- Modify: `.claude/skills/srs-formalizer/CHANGELOG.md` — v0.5.1 entry
- Modify: `.claude/skills/srs-formalizer/templates/checklists/5_formal_CHECKLIST.md` — add toolchain items

- [ ] **Step 1: Update SKILL.md capability_requirements**

Add to frontmatter `capability_requirements`:
```yaml
S5_tlaplus: { formal_tlaplus: 3, state_machine_modeling: 3 }
S5_lean4: { formal_lean4: 3, theorem_proving: 3, dependent_type_understanding: 3 }
```

- [ ] **Step 2: Update CHANGELOG v0.5.1**

```markdown
## [0.5.1] - 2026-07-01

### Added
- TLA+ 编码指南 (`references/tlaplus-coding-guide.md`)
- Lean 4 编码指南 (`references/lean4-coding-guide.md`)
- 端到端使用示例 (`examples/end-to-end-walkthrough.md`)
- capability-probe 50 题扩展（8 维度 × 5~10 题，TLA+/Lean 4 工具链验证）

### Changed
- README 新增 Golden 标准参考、端到端示例引导、目录参考
- 5_formal_CHECKLIST 新增 SANY/TLC/lake build 工具链检查项
```

- [ ] **Step 3: Update 5_formal_CHECKLIST.md**

Add items: SANY 通过、TLC 通过、lake build 通过、0 sorry

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/srs-formalizer/SKILL.md \
        .claude/skills/srs-formalizer/CHANGELOG.md \
        .claude/skills/srs-formalizer/templates/checklists/5_formal_CHECKLIST.md
git commit -m "chore: update SKILL.md, CHANGELOG, CHECKLIST for v0.5.1

Add formal verification dimensions to capability requirements.
Document v0.5.1 changes. Add toolchain items to S5 checklist.
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: Final Verification

- [ ] **Step 1: Full test suite**

```bash
cd .claude/skills/srs-formalizer/scripts && npx tsx --test __tests__/*.test.ts
```
Expected: all 255+ tests pass

- [ ] **Step 2: Typecheck**

```bash
cd .claude/skills/srs-formalizer/scripts && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Capability probe self-test**

```bash
npx tsx index.ts capability-probe --mode generate 2>&1 | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Probes: {len(d[\"data\"])}')"
```
Expected: `Probes: 50`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: final verification — all tests pass, 50 probes generated"
```
