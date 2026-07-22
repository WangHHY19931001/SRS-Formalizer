# SRS-Formalizer 补充修复计划（门禁增强 + Skill/提示词强化）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复第一轮根因分析后遗留的 14 个问题（6 P0 + 5 P1 + 3 P2），覆盖 Backend 门禁缺失、Lean4 同义反复漏检、TLA+ 覆盖率门禁缺失、SKILL.md 触发条件矛盾与 HITL 规则缺失、S0 时序错误、STATE.md 同步缺口、二级语义验证闸门未脚本化等。

**Architecture:** 分 10 个任务实施。代码修改遵循 TDD（先写失败测试 → 实现 → 验证通过 → 提交）；文档修改（SKILL.md / 模板 / prompts）以精确替换块呈现。所有修改在 Windows + WSL2 Linux 双环境通过全量回归测试。

**Tech Stack:** TypeScript 5.5 + Node.js 20+（`node:test` + `node:assert/strict`），零运行时依赖，strict 全开。

**前置条件：**
- 分支 `main` 已合并第一轮 12 任务修复（merge commit e37e110）
- 全量测试 383/383 通过（Windows + WSL2）
- 从 `main` 创建新分支 `fix/srs-formalizer-supplementary-fixes`

**约定：**
- 工作目录：`d:\srs_formalizer_opt\SRS-Formalizer`（Windows）/ `/mnt/d/srs_formalizer_opt/SRS-Formalizer`（WSL2）
- 脚本目录：`.claude/skills/srs-formalizer/scripts/`
- 单测命令：`cd .claude/skills/srs-formalizer/scripts && npx tsx --test __tests__/<file>.test.ts`
- 全量回归：`cd .claude/skills/srs-formalizer/scripts && npx tsx --test __tests__/*.test.ts`
- WSL2 全量回归：`cd .claude/skills/srs-formalizer/scripts && ./node_modules/.bin/tsx --test __tests__/*.test.ts`
- 提交命令：`git -c commit.gpgsign=false commit -m "type: message"`（GPG 签名禁用，PowerShell 多 `-m` 参数）
- 文件 ≤300 行（SKILL.md 安全约束第 6 条）

---

## 任务与遗漏项映射

| 任务 | 覆盖遗漏项 | 优先级 |
|------|-----------|--------|
| Task 1 | P0-1: Backend B2/B3/B4 门禁 stage 未实现 | P0 |
| Task 2 | P0-2: Lean4 同义反复未检测 + P1-8: `:= simp`/`:= trivial` 未告警 | P0+P1 |
| Task 3 | P0-3: TLA+ 覆盖率门禁缺失 + P1-7: FINAL 缺 arch-1 覆盖率校验 | P0+P1 |
| Task 4 | P0-4: TLA+ 触发条件矛盾 | P0 |
| Task 5 | P0-5: 模块跳过无 HITL / 工具 bug 无 STOP + P1-10: 失败计数碎片化 | P0+P1 |
| Task 6 | P0-6: S0_CHECKLIST 时序错误 | P0 |
| Task 7 | P1-9: orchestrator_frontend 阈值条款与默认全量冲突 | P1 |
| Task 8 | P1-11: STATE.md 与 verify-gate 无交叉校验 + P2-14: STATE.md.template 字段不足 | P1+P2 |
| Task 9 | P2-12: 二级语义验证闸门未脚本化 | P2 |
| Task 10 | P2-13: orchestrator_backend.md 缺 Backend 专属 HITL 章节 | P2 |

---

## Task 1: Backend B2/B3/B4 门禁 stage 实现（P0-1）

**问题：** `VALID_STAGES` 仅 `['S1', 'R3', 'FINAL']`，Backend 阶段 B2（BDD）/B3（TLA+）/B4（Lean4）各自完成 promote 后无独立门禁检查点，只能等 FINAL 统一校验。导致单个 Backend 产物质量缺陷延迟发现。

**Files:**
- Modify: `.claude/skills/srs-formalizer/scripts/lib/verify-gate/shared.ts:33`
- Modify: `.claude/skills/srs-formalizer/scripts/commands/verify-gate.ts:44-100`
- Test: `.claude/skills/srs-formalizer/scripts/__tests__/verify-gate.test.ts`

- [ ] **Step 1: 创建分支**

```bash
cd d:\srs_formalizer_opt\SRS-Formalizer
git checkout main
git pull
git checkout -b fix/srs-formalizer-supplementary-fixes
```

- [ ] **Step 2: 写失败测试（B2/B3/B4 stage 验证）**

在 `scripts/__tests__/verify-gate.test.ts` 末尾追加（在最后一个 `});` 之前）：

```typescript
  // ===========================================================================
  // B2/B3/B4 Backend stage checks
  // ===========================================================================

  it('B2 stage: accepts valid BDD verified artifacts', async () => {
    const workDir = createWorkDir('b2-pass');
    // Provide minimal R3-passing artifacts
    writeJsonl(path.join(workDir, '2_extract', 'r1-explicit'), 'a.jsonl', [
      { id: 'R1-REQ-0001', category: 'explicit', statement: '用户登录', source_file: 'srs.md', confidence: 'high' },
    ]);
    writeJsonl(path.join(workDir, '2_extract', 'architecture'), 'arch.jsonl', [
      { id: 'ARCH-SYS-001', name: 'AuthService', level: 1, parent: null, source_shard: 'S001' },
    ]);
    fs.writeFileSync(path.join(workDir, 'srs-ir.json'), JSON.stringify({
      version: '2.1.0', nodes: [], edges: [], crossRefs: [], nfrProfile: { detectedCategories: [] },
      gaps: [], glossary: {}, meta: { buildTimestamp: new Date().toISOString() },
    }), 'utf-8');

    const { main } = await import('../commands/verify-gate.js');
    const result = await main(['--workdir', workDir, '--stage', 'B2']);
    // B2 should at least not error on invalid stage
    assert.notStrictEqual(result.status, 'error');
  });

  it('rejects invalid stage B5', async () => {
    const workDir = createWorkDir('b5-invalid');
    const { main } = await import('../commands/verify-gate.js');
    const result = await main(['--workdir', workDir, '--stage', 'B5']);
    assert.strictEqual(result.status, 'error');
    assert.ok(result.message?.includes('Invalid --stage'));
  });

  it('B3 stage: accepts when TLA+ not required (no performance NFR)', async () => {
    const workDir = createWorkDir('b3-pass');
    writeJsonl(path.join(workDir, '2_extract', 'r1-explicit'), 'a.jsonl', [
      { id: 'R1-REQ-0001', category: 'explicit', statement: '用户登录', source_file: 'srs.md', confidence: 'high' },
    ]);
    fs.writeFileSync(path.join(workDir, 'srs-ir.json'), JSON.stringify({
      version: '2.1.0', nodes: [], edges: [], crossRefs: [],
      nfrProfile: { detectedCategories: [] },
      gaps: [], glossary: {}, meta: { buildTimestamp: new Date().toISOString() },
    }), 'utf-8');

    const { main } = await import('../commands/verify-gate.js');
    const result = await main(['--workdir', workDir, '--stage', 'B3']);
    assert.notStrictEqual(result.status, 'error');
  });

  it('B4 stage: skips Lean when no security/compliance NFR', async () => {
    const workDir = createWorkDir('b4-skip-lean');
    writeJsonl(path.join(workDir, '2_extract', 'r1-explicit'), 'a.jsonl', [
      { id: 'R1-REQ-0001', category: 'explicit', statement: '用户登录', source_file: 'srs.md', confidence: 'high' },
    ]);
    fs.writeFileSync(path.join(workDir, 'srs-ir.json'), JSON.stringify({
      version: '2.1.0', nodes: [], edges: [], crossRefs: [],
      nfrProfile: { detectedCategories: [{ category: 'performance' }] },
      gaps: [], glossary: {}, meta: { buildTimestamp: new Date().toISOString() },
    }), 'utf-8');

    const { main } = await import('../commands/verify-gate.js');
    const result = await main(['--workdir', workDir, '--stage', 'B4']);
    // B4 with no security/compliance → Lean not required → should pass
    assert.notStrictEqual(result.status, 'error');
  });
```

- [ ] **Step 3: 运行测试确认失败**

```bash
cd .claude/skills/srs-formalizer/scripts && npx tsx --test __tests__/verify-gate.test.ts
```

Expected: FAIL — `Invalid --stage: "B2"`（VALID_STAGES 不含 B2/B3/B4）

- [ ] **Step 4: 修改 shared.ts — VALID_STAGES 增加 B2/B3/B4**

文件 `scripts/lib/verify-gate/shared.ts` 第 33 行：

```typescript
// 旧：
export const VALID_STAGES = ['S1', 'R3', 'FINAL'] as const;

// 新：
export const VALID_STAGES = ['S1', 'R3', 'B2', 'B3', 'B4', 'FINAL'] as const;
```

- [ ] **Step 5: 修改 verify-gate.ts — 增加 B2/B3/B4 stage 分支**

文件 `scripts/commands/verify-gate.ts`，在 `// === FINAL-only checks ===` 块之前（第 95 行前）插入：

```typescript
  // === Backend stage gates (B2/B3/B4) ===
  // B2: BDD verified artifacts exist and match sourceHash
  if (stageArg === 'B2' || stageArg === 'FINAL') {
    allChecks.push(verifiedArtifactCheck(workDir, 'bdd', true));
  }
  // B3: TLA+ verified artifacts (module set coverage checked at FINAL)
  if (stageArg === 'B3' || stageArg === 'FINAL') {
    allChecks.push(tlaVerifiedCheck(workDir));
  }
  // B4: Lean4 verified artifacts (only if security/compliance NFR present)
  if (stageArg === 'B4' || stageArg === 'FINAL') {
    allChecks.push(leanVerifiedCheck(workDir));
  }
```

同时在文件顶部 import 中增加：

```typescript
// 旧第 18 行：
import { checkFormalArtifacts } from '../lib/verify-gate/checks-final.js';

// 新：
import { checkFormalArtifacts, verifiedArtifactCheck, tlaVerifiedCheck, leanVerifiedCheck } from '../lib/verify-gate/checks-final.js';
```

修改 `checks-final.ts` — 导出 `verifiedArtifactCheck` 和新增 `leanVerifiedCheck`：

文件 `scripts/lib/verify-gate/checks-final.ts`，将 `verifiedArtifactCheck` 改为 `export function`（第 7 行）：

```typescript
// 旧：
function verifiedArtifactCheck(workDir: string, kind: 'bdd' | 'lean4', required: boolean): CheckResult {

// 新：
export function verifiedArtifactCheck(workDir: string, kind: 'bdd' | 'lean4', required: boolean): CheckResult {
```

在 `tlaVerifiedCheck` 函数前增加 `export`（第 40 行）：

```typescript
// 旧：
function tlaVerifiedCheck(workDir: string): CheckResult {

// 新：
export function tlaVerifiedCheck(workDir: string): CheckResult {
```

在 `checkFormalArtifacts` 函数之前增加 `leanVerifiedCheck`：

```typescript
/** B4/FINAL: Lean4 verified artifacts — required only when IR has security/compliance NFR */
export function leanVerifiedCheck(workDir: string): CheckResult {
  try {
    const ir = JSON.parse(fs.readFileSync(path.join(workDir, 'srs-ir.json'), 'utf8')) as { nfrProfile?: { detectedCategories?: Array<{ category: string }> } };
    const leanRequired = ir.nfrProfile?.detectedCategories?.some(entry => entry.category === 'security' || entry.category === 'compliance') ?? false;
    return verifiedArtifactCheck(workDir, 'lean4', leanRequired);
  } catch {
    return { name: 'lean4 verified artifacts', passed: false, detail: 'srs-ir.json cannot be read' };
  }
}
```

修改 `checkFormalArtifacts` 复用导出的函数（第 86-92 行）：

```typescript
export function checkFormalArtifacts(workDir: string): CheckResult[] {
  try {
    // Read IR to determine lean requirement; if IR unreadable, fail.
    JSON.parse(fs.readFileSync(path.join(workDir, 'srs-ir.json'), 'utf8'));
    return [verifiedArtifactCheck(workDir, 'bdd', true), tlaVerifiedCheck(workDir), leanVerifiedCheck(workDir)];
  } catch { return [{ name: 'SRS IR available for artifact requirements', passed: false, detail: 'srs-ir.json cannot be read' }]; }
}
```

- [ ] **Step 6: 运行测试确认通过**

```bash
cd .claude/skills/srs-formalizer/scripts && npx tsx --test __tests__/verify-gate.test.ts
```

Expected: PASS

- [ ] **Step 7: 提交**

```bash
cd d:\srs_formalizer_opt\SRS-Formalizer
git add .claude/skills/srs-formalizer/scripts/lib/verify-gate/shared.ts .claude/skills/srs-formalizer/scripts/commands/verify-gate.ts .claude/skills/srs-formalizer/scripts/lib/verify-gate/checks-final.ts .claude/skills/srs-formalizer/scripts/__tests__/verify-gate.test.ts
git -c commit.gpgsign=false commit -m "feat(verify-gate): add B2/B3/B4 Backend stage gates" -m "P0-1: VALID_STAGES now includes B2 (BDD), B3 (TLA+), B4 (Lean4)." -m "Each Backend stage has its own checkpoint instead of waiting for FINAL." -m "Exports verifiedArtifactCheck/tlaVerifiedCheck/leanVerifiedCheck for reuse."
```

---

## Task 2: Lean4 同义反复与过度简化检测（P0-2 + P1-8）

**问题：** `auditLean` 检测 `sorry`/`admit`/`axiom`/`: True`/`→ True`/`↔ True`，但不检测以下同义反复模式——这些模式语法合规但语义空洞，能通过 `lake build` 却不提供实质证明：
- `:= h`（假设即结论）
- `:= by exact h`（同上，用 exact 引用假设）
- `:= by simp`（仅用 simp，安全关键定理不足）
- `:= trivial`（trivial 策略，过于简化）
- `:= rfl`（自反性，标记为可疑）

**Files:**
- Modify: `.claude/skills/srs-formalizer/scripts/commands/validate-lean.ts:12-27`
- Test: `.claude/skills/srs-formalizer/scripts/__tests__/validate-lean.test.ts`

- [ ] **Step 1: 写失败测试**

在 `scripts/__tests__/validate-lean.test.ts` 的 `describe` 块末尾追加：

```typescript
  it('flags := h tautology (assumption-as-conclusion)', () => {
    const src = 'theorem eq_refl (h : a = a) : a = a := h';
    const errors = auditLean(src);
    assert.ok(errors.some(e => e.includes('assumption-as-conclusion')), `expected tautology flag, got: ${JSON.stringify(errors)}`);
  });

  it('flags := by exact h tautology', () => {
    const src = 'theorem eq_refl (h : a = a) : a = a := by exact h';
    const errors = auditLean(src);
    assert.ok(errors.some(e => e.includes('assumption-as-conclusion')), `expected tautology flag, got: ${JSON.stringify(errors)}`);
  });

  it('flags := by simp oversimplified', () => {
    const src = 'theorem add_zero (n : Nat) : n + 0 = n := by simp';
    const errors = auditLean(src);
    assert.ok(errors.some(e => e.includes('over-simplified')), `expected over-simplified flag, got: ${JSON.stringify(errors)}`);
  });

  it('flags := trivial oversimplified', () => {
    const src = 'theorem trivial_proof : True := trivial';
    const errors = auditLean(src);
    assert.ok(errors.some(e => e.includes('over-simplified')), `expected over-simplified flag, got: ${JSON.stringify(errors)}`);
  });

  it('flags := rfl as suspicious', () => {
    const src = 'theorem eq_refl (n : Nat) : n = n := rfl';
    const errors = auditLean(src);
    assert.ok(errors.some(e => e.includes('rfl')), `expected rfl flag, got: ${JSON.stringify(errors)}`);
  });

  it('does NOT flag := by exact (constructive proof)', () => {
    const src = 'theorem add_comm (n m : Nat) : n + m = m + n := by\n  induction n with\n  | zero => simp\n  | succ _ _ => simp';
    const errors = auditLean(src);
    // multi-line proof with induction is NOT a bare `by simp`
    assert.ok(!errors.some(e => e.includes('over-simplified')), `should not flag multi-line proof: ${JSON.stringify(errors)}`);
  });

  it('does NOT flag := h.foo (method call, not bare hypothesis)', () => {
    const src = 'theorem foo (h : Nat) : Nat := h.val';
    const errors = auditLean(src);
    assert.ok(!errors.some(e => e.includes('assumption-as-conclusion')), `should not flag method access: ${JSON.stringify(errors)}`);
  });
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd .claude/skills/srs-formalizer/scripts && npx tsx --test __tests__/validate-lean.test.ts
```

Expected: FAIL — 新增测试用例未通过（auditLean 未检测这些模式）

- [ ] **Step 3: 修改 auditLean 增加同义反复检测**

文件 `scripts/commands/validate-lean.ts`，替换 `auditLean` 函数（第 12-27 行）：

```typescript
export function auditLean(source: string): string[] {
  const clean = stripLeanComments(source);
  const checks: Array<[RegExp, string]> = [
    [/\b(sorry|admit|axiom)\b/, 'unfinished proof or axiom found'],
    [/^\s*import\s+Mathlib\s*$/m, 'full Mathlib import is forbidden'],
    [/\b(theorem|lemma)\s+\w+[^\n]*:\s*True\b/, 'semantically weakened : True theorem found'],
    [/(?:->|→)\s*True\b/, 'theorem with True consequent is vacuous (→ True)'],
    [/(?:<->|↔)\s*True\b/, 'theorem with True consequent is vacuous (↔ True)'],
    // P0-2: tautology — proof body is a bare hypothesis reference (assumption-as-conclusion).
    // Matches `:= h` / `:= h1` / `:= hyp` where the entire proof is a single identifier
    // that is a hypothesis name. Does NOT match `:= h.val` or `:= h <;> foo` (method/tactic).
    [/:=\s*[a-z]\w*\s*$/m, 'tautology: proof body is a bare hypothesis reference (assumption-as-conclusion)'],
    // P0-2: tautology — `:= by exact <hypothesis>` discharges via assumption, no real proof.
    [/:=\s*by\s+exact\s+[a-z]\w*\s*$/m, 'tautology: proof is `by exact <hypothesis>` (assumption-as-conclusion)'],
    // P1-8: over-simplified — `:= by simp` alone is insufficient for security-critical theorems.
    [/:=\s*by\s+simp\s*$/m, 'over-simplified proof: `by simp` alone is insufficient for security-critical theorems'],
    // P1-8: over-simplified — `:= trivial` discharges any True-like goal.
    [/:=\s*trivial\s*$/m, 'over-simplified proof: `trivial` alone is insufficient for security-critical theorems'],
    // P1-8: suspicious — `:= rfl` proves only definitional equality, flag for review.
    [/:=\s*rfl\s*$/m, 'suspicious: `rfl` proves only definitional equality — review if theorem claims substantive property'],
  ];
  return checks.filter(([pattern]) => pattern.test(clean)).map(([, message]) => message);
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd .claude/skills/srs-formalizer/scripts && npx tsx --test __tests__/validate-lean.test.ts
```

Expected: PASS

- [ ] **Step 5: 全量回归（确认不误报已有合法 Lean 产物）**

```bash
cd .claude/skills/srs-formalizer/scripts && npx tsx --test __tests__/*.test.ts
```

Expected: 全部 PASS（如出现 final-report-binding.test.ts 误报，检查其 mock Lean 源是否含 `:= rfl` 等模式，更新 mock 使其使用实质证明）

- [ ] **Step 6: 提交**

```bash
cd d:\srs_formalizer_opt\SRS-Formalizer
git add .claude/skills/srs-formalizer/scripts/commands/validate-lean.ts .claude/skills/srs-formalizer/scripts/__tests__/validate-lean.test.ts
git -c commit.gpgsign=false commit -m "feat(validate-lean): detect tautology and over-simplified proofs" -m "P0-2: flag := h / := by exact h (assumption-as-conclusion tautology)." -m "P1-8: flag := by simp / := trivial / := rfl (over-simplified proofs)." -m "These pass lake build but provide no substantive proof for security-critical theorems."
```

---

## Task 3: TLA+ 覆盖率与 arch-1 覆盖率门禁（P0-3 + P1-7）

**问题：**
- P0-3: `tlaVerifiedCheck` 仅检查 validated 模块集仍在 verified/ 中，但不检查 TLA+ 模块数 ≥ IR 中 arch-1 子系统数量（覆盖率）
- P1-7: FINAL 缺少 arch-1 覆盖率校验——每个 arch-1 子系统都应有对应的形式化产物

**Files:**
- Modify: `.claude/skills/srs-formalizer/scripts/lib/verify-gate/checks-final.ts`
- Test: `.claude/skills/srs-formalizer/scripts/__tests__/checks-final-coverage.test.ts`（新建）

- [ ] **Step 1: 写失败测试（新建测试文件）**

创建 `scripts/__tests__/checks-final-coverage.test.ts`：

```typescript
import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const TMP = path.join(os.tmpdir(), `srs-formalizer-coverage-test-${Date.now()}`);

function createWorkDir(name: string): string {
  const workDir = path.join(TMP, name, '.srs_formalizer');
  const dirs = ['outputs/tlaplus/verified', 'outputs/tlaplus/validation', 'outputs/bdd/verified', 'outputs/bdd/validation', 'outputs/lean4/verified', 'outputs/lean4/validation'];
  for (const d of dirs) fs.mkdirSync(path.join(workDir, d), { recursive: true });
  return workDir;
}

function writeIr(workDir: string, arch1Subsystems: string[]): void {
  const nodes = arch1Subsystems.map((name, i) => ({
    id: `ARCH-${name.toUpperCase()}-${String(i + 1).padStart(4, '0')}`,
    kind: 'architecture',
    statement: name,
    source: { filePath: 'srs.md', shardId: 'S001', locator: 'srs.md:1-10' },
    metadata: { archLevel: 1, archName: name },
  }));
  fs.writeFileSync(path.join(workDir, 'srs-ir.json'), JSON.stringify({
    version: '2.1.0', nodes, edges: [], crossRefs: [],
    nfrProfile: { detectedCategories: [] },
    gaps: [], glossary: {}, meta: { buildTimestamp: new Date().toISOString() },
  }), 'utf-8');
}

function writeTlaModule(workDir: string, moduleName: string): void {
  const verifiedDir = path.join(workDir, 'outputs', 'tlaplus', 'verified');
  const validationDir = path.join(workDir, 'outputs', 'tlaplus', 'validation');
  fs.writeFileSync(path.join(verifiedDir, `${moduleName}.tla`), `---- MODULE ${moduleName} ----\n----\n`, 'utf-8');
  fs.writeFileSync(path.join(verifiedDir, `${moduleName}.cfg`), 'SPECIFICATION Spec\n', 'utf-8');
  // Write a passing validation report
  const files = [path.join(verifiedDir, `${moduleName}.tla`), path.join(verifiedDir, `${moduleName}.cfg`)];
  const crypto = require('node:crypto');
  const sourceHash = crypto.createHash('sha256').update(files.map(f => fs.readFileSync(f)).join('')).digest('hex');
  fs.writeFileSync(path.join(validationDir, `${sourceHash}.json`), JSON.stringify({
    artifactKind: 'tlaplus', lifecycle: 'verified', sourcePaths: files, sourceHash,
    irHash: sourceHash, tools: [{ name: 'tla2tools', version: '1.7.4' }],
    startedAt: new Date().toISOString(), completedAt: new Date().toISOString(),
    passed: true, checks: [{ name: 'SANY', passed: true }, { name: 'TLC', passed: true }],
    toolEvidence: [{ tool: 'tla2tools', exitCode: 0, stdoutHash: sourceHash }],
  }), 'utf-8');
}

describe('TLA+ coverage and arch-1 coverage gates', () => {
  before(() => fs.mkdirSync(TMP, { recursive: true }));
  after(() => fs.rmSync(TMP, { recursive: true, force: true }));

  it('checkTlaCoverage passes when all arch-1 subsystems have TLA+ modules', async () => {
    const workDir = createWorkDir('tla-coverage-pass');
    writeIr(workDir, ['AuthService', 'PaymentService']);
    writeTlaModule(workDir, 'AuthService');
    writeTlaModule(workDir, 'PaymentService');

    const { checkTlaCoverage } = await import('../lib/verify-gate/checks-final.js');
    const result = checkTlaCoverage(workDir);
    assert.ok(result.passed, `expected pass, got: ${result.detail}`);
  });

  it('checkTlaCoverage fails when an arch-1 subsystem is missing TLA+ module', async () => {
    const workDir = createWorkDir('tla-coverage-fail');
    writeIr(workDir, ['AuthService', 'PaymentService']);
    writeTlaModule(workDir, 'AuthService');
    // PaymentService missing

    const { checkTlaCoverage } = await import('../lib/verify-gate/checks-final.js');
    const result = checkTlaCoverage(workDir);
    assert.ok(!result.passed, 'expected fail for missing PaymentService');
    assert.ok(result.detail?.includes('PaymentService'), `detail should name missing module: ${result.detail}`);
  });

  it('checkTlaCoverage passes when no arch-1 subsystems exist (empty IR)', async () => {
    const workDir = createWorkDir('tla-coverage-empty');
    writeIr(workDir, []);

    const { checkTlaCoverage } = await import('../lib/verify-gate/checks-final.js');
    const result = checkTlaCoverage(workDir);
    assert.ok(result.passed, 'empty arch-1 should pass (nothing to cover)');
  });

  it('checkArch1Coverage passes when all arch-1 subsystems have BDD features', async () => {
    const workDir = createWorkDir('arch1-coverage-pass');
    writeIr(workDir, ['AuthService']);
    // Write BDD verified
    const bddVerified = path.join(workDir, 'outputs', 'bdd', 'verified');
    fs.writeFileSync(path.join(bddVerified, 'auth.feature'), 'Feature: Auth\n', 'utf-8');

    const { checkArch1Coverage } = await import('../lib/verify-gate/checks-final.js');
    const result = checkArch1Coverage(workDir);
    assert.ok(result.passed, `expected pass, got: ${result.detail}`);
  });

  it('checkArch1Coverage warns when arch-1 subsystems exist but no BDD/TLA+/Lean at all', async () => {
    const workDir = createWorkDir('arch1-coverage-fail');
    writeIr(workDir, ['AuthService', 'PaymentService']);
    // No verified artifacts at all

    const { checkArch1Coverage } = await import('../lib/verify-gate/checks-final.js');
    const result = checkArch1Coverage(workDir);
    assert.ok(!result.passed, 'expected fail when no artifacts for arch-1 subsystems');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd .claude/skills/srs-formalizer/scripts && npx tsx --test __tests__/checks-final-coverage.test.ts
```

Expected: FAIL — `checkTlaCoverage` / `checkArch1Coverage` 未导出（函数不存在）

- [ ] **Step 3: 实现 checkTlaCoverage 和 checkArch1Coverage**

文件 `scripts/lib/verify-gate/checks-final.ts`，在 `checkFormalArtifacts` 之前插入：

```typescript
/** IR node 的最小内联类型（避免依赖外部类型文件，保持脚本自包含） */
interface IrNodeLike {
  id: string;
  kind?: string;
  statement?: string;
  metadata?: { archLevel?: number; archName?: string } & Record<string, unknown>;
}

/** 从 IR nodes 中提取 arch-1 (level=1) 子系统名称列表 */
function extractArch1Subsystems(ir: unknown): string[] {
  const irObj = ir as { nodes?: IrNodeLike[] };
  const nodes = irObj?.nodes;
  if (!Array.isArray(nodes)) return [];
  return nodes
    .filter(n => n.kind === 'architecture' && n.metadata?.archLevel === 1)
    .map(n => n.metadata?.archName ?? n.statement ?? n.id)
    .filter((name): name is string => typeof name === 'string' && name.length > 0);
}

/**
 * P0-3: TLA+ 覆盖率门禁。
 * 检查 verified/ 中的 TLA+ 模块集是否覆盖 IR 中所有 arch-1 子系统。
 * 每个 arch-1 子系统应有同名 TLA+ 模块（或用户显式裁剪记录在 STATE.md）。
 */
export function checkTlaCoverage(workDir: string): CheckResult {
  const name = 'tlaplus arch-1 coverage';
  try {
    const ir = JSON.parse(fs.readFileSync(path.join(workDir, 'srs-ir.json'), 'utf8'));
    const arch1Subsystems = extractArch1Subsystems(ir);
    if (arch1Subsystems.length === 0) {
      return { name, passed: true, detail: 'no arch-1 subsystems in IR (nothing to cover)' };
    }
    const verifiedRoot = artifactPath(workDir, ARTIFACT_PATHS.tlaVerified);
    const modules = tlaModulesInVerified(verifiedRoot);
    const moduleNames = new Set(modules.keys());
    const missing = arch1Subsystems.filter(sub => !moduleNames.has(sub)).sort();
    if (missing.length > 0) {
      return {
        name,
        passed: false,
        detail: `${missing.length}/${arch1Subsystems.length} arch-1 subsystem(s) missing TLA+ module: ${missing.join(', ')} (if intentionally skipped, record in STATE.md with reason + residual risk)`,
      };
    }
    return { name, passed: true, detail: `${arch1Subsystems.length}/${arch1Subsystems.length} arch-1 subsystem(s) covered by TLA+ modules` };
  } catch {
    return { name, passed: false, detail: 'srs-ir.json cannot be read' };
  }
}

/**
 * P1-7: arch-1 覆盖率校验。
 * 检查每个 arch-1 子系统至少在 BDD、TLA+、Lean4（若需要）之一中有 verified 产物。
 * 完全无产物的子系统意味着该子系统未被任何形式化方法覆盖。
 */
export function checkArch1Coverage(workDir: string): CheckResult {
  const name = 'arch-1 formalization coverage';
  try {
    const ir = JSON.parse(fs.readFileSync(path.join(workDir, 'srs-ir.json'), 'utf8'));
    const arch1Subsystems = extractArch1Subsystems(ir);
    if (arch1Subsystems.length === 0) {
      return { name, passed: true, detail: 'no arch-1 subsystems in IR' };
    }
    // Collect all verified artifact names (basenames without extension)
    const verifiedDirs = [
      artifactPath(workDir, ARTIFACT_PATHS.bddVerified),
      artifactPath(workDir, ARTIFACT_PATHS.tlaVerified),
      artifactPath(workDir, ARTIFACT_PATHS.leanVerified),
    ];
    const artifactNames = new Set<string>();
    for (const dir of verifiedDirs) {
      if (!fs.existsSync(dir)) continue;
      for (const file of fs.readdirSync(dir)) {
        const base = path.basename(file).replace(/\.(feature|tla|lean)$/, '');
        artifactNames.add(base);
      }
    }
    const uncovered = arch1Subsystems.filter(sub => !artifactNames.has(sub)).sort();
    if (uncovered.length > 0) {
      return {
        name,
        passed: false,
        detail: `${uncovered.length}/${arch1Subsystems.length} arch-1 subsystem(s) have no verified artifact in BDD/TLA+/Lean4: ${uncovered.join(', ')}`,
      };
    }
    return { name, passed: true, detail: `${arch1Subsystems.length}/${arch1Subsystems.length} arch-1 subsystem(s) covered` };
  } catch {
    return { name, passed: false, detail: 'srs-ir.json cannot be read' };
  }
}
```

- [ ] **Step 4: 修改 checkFormalArtifacts 增加覆盖率检查**

文件 `scripts/lib/verify-gate/checks-final.ts`，修改 `checkFormalArtifacts`：

```typescript
export function checkFormalArtifacts(workDir: string): CheckResult[] {
  try {
    JSON.parse(fs.readFileSync(path.join(workDir, 'srs-ir.json'), 'utf8'));
    return [
      verifiedArtifactCheck(workDir, 'bdd', true),
      tlaVerifiedCheck(workDir),
      leanVerifiedCheck(workDir),
      // P0-3: TLA+ module set must cover all arch-1 subsystems
      checkTlaCoverage(workDir),
      // P1-7: each arch-1 subsystem must have at least one verified artifact
      checkArch1Coverage(workDir),
    ];
  } catch { return [{ name: 'SRS IR available for artifact requirements', passed: false, detail: 'srs-ir.json cannot be read' }]; }
}
```

- [ ] **Step 5: 运行测试确认通过**

```bash
cd .claude/skills/srs-formalizer/scripts && npx tsx --test __tests__/checks-final-coverage.test.ts
```

Expected: PASS

- [ ] **Step 6: 全量回归**

```bash
cd .claude/skills/srs-formalizer/scripts && npx tsx --test __tests__/*.test.ts
```

Expected: 全部 PASS（如 `verify-gate.test.ts` 中 FINAL 相关测试因新增覆盖率检查失败，需在测试 mock 中补全 arch-1 节点和对应产物）

- [ ] **Step 7: 提交**

```bash
cd d:\srs_formalizer_opt\SRS-Formalizer
git add .claude/skills/srs-formalizer/scripts/lib/verify-gate/checks-final.ts .claude/skills/srs-formalizer/scripts/__tests__/checks-final-coverage.test.ts .claude/skills/srs-formalizer/scripts/__tests__/verify-gate.test.ts
git -c commit.gpgsign=false commit -m "feat(checks-final): add TLA+ coverage and arch-1 coverage gates" -m "P0-3: checkTlaCoverage ensures TLA+ modules cover all arch-1 subsystems." -m "P1-7: checkArch1Coverage ensures each arch-1 subsystem has at least one verified artifact." -m "Both checks integrated into checkFormalArtifacts for FINAL stage."
```

---

## Task 4: TLA+ 触发条件统一（P0-4）

**问题：** SKILL.md 中 TLA+ 触发条件存在三处矛盾：
- L276："TLA+ 默认覆盖所有模块"
- L378-380："performance≥5 且 shards≥100 才强制 TLA+"
- L404："TLA+ 全模块覆盖"

需统一为单一真值表，消除"默认全量"与"条件触发"的歧义。

**Files:**
- Modify: `.claude/skills/srs-formalizer/SKILL.md:276,378-380,404`

- [ ] **Step 1: 修改 L276 — 统一为"默认全模块覆盖，条件触发强制 promote"**

文件 `SKILL.md` 第 276 行，将：

```markdown
3. **默认全量**：用户要求"形式化全部"或未指定产物时执行 B1-B7；TLA+ 默认覆盖所有模块，Lean 按 security/compliance 触发。
```

替换为：

```markdown
3. **默认全量**：用户要求"形式化全部"或未指定产物时执行 B1-B7。TLA+ 默认生成所有 arch-1 子系统模块草稿；**是否强制 `--promote` 由下方「TLA+/Lean4 触发真值表」统一裁决**，不再在此处另行声明。Lean 按 security/compliance 触发。
```

- [ ] **Step 2: 修改 L377-380 — 将条件触发改为"真值表"单一来源**

文件 `SKILL.md` 第 377-380 行，将：

```markdown
**NFR 条件触发 TLA+/Lean 4**（Agent 按以下规则判断，禁止模糊决策）：
- `performance` 关键词 ≥5 且 `total_shards ≥100` → **强制 TLA+**，必须 `--promote`
- `security`/`compliance` 关键词 ≥1 → **强制 Lean 4**，必须 `--promote`
- `availability` 关键词 ≥3 → 生成 TLA+ 草稿；若 `total_shards ≥50` 或 `performance ≥5` → **强制 `--promote`**；仅当 `total_shards < 50` 且 `performance < 5` 时可跳过 `--promote`，但须在 STATE.md 记录跳过理由、风险与责任人，且须经 🛑 **STOP** 人类确认
```

替换为：

```markdown
**TLA+/Lean4 触发真值表**（全系统唯一裁决来源，Agent 按此表判断，禁止在其他章节另行声明触发条件）：

> **核心原则**：TLA+ 默认为所有 arch-1 子系统生成草稿（draft）；下表决定是否**强制 `--promote`**（即是否必须通过 SANY+TLC 验证并提升到 verified）。草稿不等于已验证交付。

| NFR 类别 | 关键词数 | total_shards | TLA+ 草稿 | TLA+ `--promote` | Lean4 草稿 | Lean4 `--promote` |
|---------|---------|-------------|----------|-----------------|-----------|-----------------|
| `performance` | ≥5 | ≥100 | ✅ 全 arch-1 | **强制** | — | — |
| `performance` | ≥5 | <100 | ✅ 全 arch-1 | 推荐（可经 HITL 裁剪） | — | — |
| `performance` | <5 | 任意 | ✅ 全 arch-1 | 推荐（可经 HITL 裁剪） | — | — |
| `security` | ≥1 | 任意 | ✅ 全 arch-1 | **强制** | ✅ | **强制** |
| `compliance` | ≥1 | 任意 | ✅ 全 arch-1 | **强制** | ✅ | **强制** |
| `availability` | ≥3 | ≥50 或 perf≥5 | ✅ 全 arch-1 | **强制** | — | — |
| `availability` | ≥3 | <50 且 perf<5 | ✅ 全 arch-1 | 可跳过（须 HITL 确认 + STATE.md 记录理由/风险/责任人） | — | — |
| `availability` | <3 | 任意 | ✅ 全 arch-1 | 推荐（可经 HITL 裁剪） | — | — |
| 无 NFR | — | 任意 | ✅ 全 arch-1 | 推荐（可经 HITL 裁剪） | — | — |

**跳过 `--promote` 的强制条件**（不可省略）：① 在 STATE.md 记录跳过模块、跳过理由、残余风险、责任人；② 🛑 **STOP · 等待人类确认**；③ FINAL 门禁会标记该模块为 `partial_convergence`。
```

- [ ] **Step 3: 修改 L404 — 移除"全模块覆盖"措辞，引用真值表**

文件 `SKILL.md` 第 404 行，将：

```markdown
**TLA+ 全模块覆盖**（`validate-tla --name <module> --strict --promote`）：仅使用内置 `tools/tla2tools-1.7.4.jar` 执行 SANY + TLC（启用死锁检测），不联网、不下载 JAR、不创建 cfg。
```

替换为：

```markdown
**TLA+ 模块验证**（`validate-tla --name <module> --strict --promote`）：每个 arch-1 子系统生成独立 TLA+ 模块草稿；是否 `--promote` 由上方「TLA+/Lean4 触发真值表」裁决。仅使用内置 `tools/tla2tools-1.7.4.jar` 执行 SANY + TLC（启用死锁检测），不联网、不下载 JAR、不创建 cfg。
```

- [ ] **Step 4: 提交**

```bash
cd d:\srs_formalizer_opt\SRS-Formalizer
git add .claude/skills/srs-formalizer/SKILL.md
git -c commit.gpgsign=false commit -m "fix(skill): unify TLA+ trigger conditions into single truth table" -m "P0-4: resolve contradiction between L276 (default full coverage), L378-380 (conditional trigger), L404 (full module coverage)." -m "Now: TLA+ draft always generated for all arch-1 subsystems; --promote decided by truth table." -m "Truth table is the single source of truth — no other section may declare trigger conditions."
```

---

## Task 5: HITL 强制规则 + 失败计数统一（P0-5 + P1-10）

**问题：**
- P0-5: 失败模式表缺"模块跳过→HITL"和"工具异常→STOP"两条强制规则
- P1-10: 失败计数碎片化——S1/R3/FINAL 各"连续 2 次"，JSONL"连续 3 次"，收敛循环"max_iterations 3/5/8"，缺乏统一阈值

**Files:**
- Modify: `.claude/skills/srs-formalizer/SKILL.md:292-302`

- [ ] **Step 1: 修改失败模式表 — 统一失败计数为 N=3，增加 HITL/STOP 规则**

文件 `SKILL.md` 第 292-302 行，将整个表格替换为：

```markdown
| 触发条件 | 一线修复 | 仍失败兜底 |
|---------|---------|-----------|
| `verify-gate --stage S1` 未通过 | 检查 `validate-jsonl` / `validate-architecture` / `validate-glossary` 报错 → 修复对应 JSONL 后重跑 F2-F4 → 重新 `assemble-ir` | 连续 **3** 次修复失败 → 🛑 **STOP**：将错误报告与当前 shard_index 打包，等待人类确认是否跳过或重建 |
| `verify-gate --stage R3` 未通过 | 检查 `validate-semantics --strict` 具体字段 → 修复结构/语义/NFR/连通性/冲突/风险中对应项 → 重跑 M1-M6 | 连续 **3** 次修复失败 → 🛑 **STOP**：输出 `3_graph/analysis/` 全量快照，等待人类决策 |
| `verify-gate --stage B2` 未通过 | 检查 BDD verified 产物缺失/sourceHash 不匹配 → 回退 B2 executor 重做 → 重新 `validate-bdd --strict --promote` | 连续 **3** 次修复失败 → 🛑 **STOP**：等待人类确认是否跳过该模块 |
| `verify-gate --stage B3` 未通过 | 检查 TLA+ verified 模块集/覆盖率缺失 → 回退 B3 executor 重做 → 重新 `validate-tla --strict --promote` | 连续 **3** 次修复失败 → 🛑 **STOP**：等待人类确认是否裁剪模块 |
| `verify-gate --stage B4` 未通过 | 检查 Lean4 verified 产物/sourceHash/同义反复 → 回退 B4 executor 重做 → 重新 `validate-lean --strict --promote` | 连续 **3** 次修复失败 → 🛑 **STOP**：等待人类确认是否跳过 Lean |
| `verify-gate --stage FINAL` 未通过 | 检查 `sourceHash` 不匹配项 → 定位过期/草稿/跨类型产物 → 回退至对应 Backend 步骤重新生成 → 重新 `--strict --promote` | 连续 **3** 次修复失败 → 🛑 **STOP**：禁止提交草稿或过期报告，等待人类确认是否加轮或收工 |
| `assemble-ir` 装配失败 | 保留上一阶段有效 JSONL 产物 → 检查去重冲突与悬挂边 → 修复后重跑 | 仍失败 → 回退到 F2 重新提取，不删除已有校验数据 |
| B3 TLA+ SANY/TLC 报错 | 根据错误行定位模块 → 检查 TypeOK/Init/Next/Spec 完整性 → 修复后重跑 `validate-tla --strict --promote` | 仍失败 → 检查是否需 L2→L3 拆分；若状态爆炸则加 `--promote` 前必须先拆分 |
| B4 Lean 4 `lake build` 失败 | 检查 `sorry`/`admit`/`axiom`/`: True`/全量 `import Mathlib`/同义反复 → 逐项消除后重跑 | 仍失败 → 若为 Windows 工具链不可用，生成 `S5_SKIP_REPORT.md`，标记 `platform_unsupported`、受影响需求、替代验证与残余风险；不得把跳过宣称为 Lean verified |
| B7 收敛循环超限（>max_iterations） | 检查当前 high-confidence 比例与 NFR 覆盖率 → 若 ≥7/13 且 NFR≥60% → 允许标记 `partial_convergence`；否则 → 苏格拉底拷问当前最大分歧点 | 仍无法收敛 → 🛑 **STOP**：强制人类确认是否加轮或收工 |
| 文件写入冲突/越界 | `isPathSafe` + `assertSafePath` 拦截 → 改用 `path.join()` 修正路径 → 原子 temp-file + rename 重试 | 仍失败 → 中止当前操作并告警，不继续写入 |
| 子代理输出 JSONL 校验失败 | `validate-jsonl` 返回具体行号与字段 → 重派子代理修正该批次 → 不通过则整批重跑 | 连续 **3** 次子代理修正失败 → 降级为人工提取该 shard |
| 🆕 **模块跳过请求**（用户或 Agent 提议跳过某 arch-1 子系统的形式化） | 不得自行跳过 → 必须在 STATE.md 记录：跳过模块名、跳过理由、残余风险、责任人 → 🛑 **STOP · 等待人类确认** | 人类确认后方可跳过；FINAL 门禁标记 `partial_convergence`，交付报告必须列明跳过范围与残余风险 |
| 🆕 **工具异常/崩溃**（`validate-*` / `assemble-ir` / `verify-gate` 等脚本非零退出且非已知失败模式） | 立即 🛑 **STOP** → 不得重试或绕过 → 收集错误日志、stack trace、工作目录快照 → 报告人类 | 人类确认工具修复后方可继续；禁止将工具异常降级为"环境限制"或"跳过" |
```

- [ ] **Step 2: 在失败模式表后增加统一失败计数说明**

文件 `SKILL.md` 第 304 行（`> **Agent 自检**` 行之前），插入：

```markdown
> **统一失败计数**：全管线所有"连续 N 次修复失败"阈值统一为 **N=3**（S1/R3/B2/B3/B4/FINAL/JSONL 均如此）。收敛循环的 `max_iterations` 按规模自适应（≤50→3, 51-100→5, >100→8），不属于"修复失败"计数，而是收敛上限。Agent 不得自行调整 N 值。
```

- [ ] **Step 3: 提交**

```bash
cd d:\srs_formalizer_opt\SRS-Formalizer
git add .claude/skills/srs-formalizer/SKILL.md
git -c commit.gpgsign=false commit -m "fix(skill): add HITL/STOP rules and unify failure count to N=3" -m "P0-5: add 'module skip → HITL' and 'tool crash → STOP' rows to failure mode table." -m "P1-10: unify all 'consecutive N failures' thresholds to N=3 (was fragmented 2/3)." -m "Add B2/B3/B4 stage rows to failure mode table."
```

---

## Task 6: S0_CHECKLIST 时序修正（P0-6）

**问题：** S0_CHECKLIST.md 要求检测 TLA+/Lean4 触发条件，但 `total_shards` 要等 F1 分片后才已知，NFR 分类要等 M3 才完成。S0 阶段无法获取这些数据，导致检查项不可执行。

**Files:**
- Modify: `.claude/skills/srs-formalizer/templates/checklists/S0_CHECKLIST.md`

- [ ] **Step 1: 修改 S0_CHECKLIST — 将触发条件检测改为"预测"**

文件 `templates/checklists/S0_CHECKLIST.md`，将全文替换为：

```markdown
# S0 发现与确认 — 清单

- [ ] SRS 文件路径确认且可读
- [ ] 文件格式识别（.md / .html / 多目录）
- [ ] §7 未解决问题已扫描（___条，P0）
- [ ] 术语表检测（存在 / 缺失）
- [ ] TLA+/Lean4 触发条件**预测**已完成（基于 SRS 关键词粗扫，非最终裁决）
- [ ] 用户已确认阶段触发**预测**方案（最终裁决在 F1/M3 后据实际数据执行）
- [ ] 用户已确认语言偏好（zh/en）

> **时序说明**：S0 阶段仅做触发条件**预测**——基于 SRS 文本关键词粗扫给出初步判断。`total_shards` 须等 F1 分片完成、NFR 分类须等 M3 标注完成后方可做最终裁决。最终触发裁决在 M3 完成后由 Agent 依据「TLA+/Lean4 触发真值表」（SKILL.md）执行，并回写 STATE.md。
```

- [ ] **Step 2: 提交**

```bash
cd d:\srs_formalizer_opt\SRS-Formalizer
git add .claude/skills/srs-formalizer/templates/checklists/S0_CHECKLIST.md
git -c commit.gpgsign=false commit -m "fix(checklist): correct S0 temporal dependency for TLA+/Lean4 triggers" -m "P0-6: S0 cannot detect final trigger conditions (total_shards needs F1, NFR needs M3)." -m "Changed to 'prediction' based on keyword scan; final adjudication after M3." -m "Added temporal note explaining when final trigger decision is made."
```

---

## Task 7: orchestrator_frontend 阈值条款对齐（P1-9）

**问题：** `orchestrator_frontend.md` 中可能包含与 SKILL.md 真值表冲突的 TLA+/Lean4 触发阈值条款，需对齐为引用 SKILL.md 真值表。

**Files:**
- Modify: `.claude/skills/srs-formalizer/prompts/orchestrator_frontend.md`

- [ ] **Step 1: 读取 orchestrator_frontend.md 查找阈值条款**

```bash
cd .claude/skills/srs-formalizer
# 搜索阈值相关内容
```

用 Grep 工具搜索 `orchestrator_frontend.md` 中的 `performance`、`shards`、`TLA+`、`Lean`、`触发` 关键词，定位阈值条款。

- [ ] **Step 2: 修改阈值条款 — 引用 SKILL.md 真值表**

在 `orchestrator_frontend.md` 的内容扫描章节（阶段 1.2），将任何硬编码的阈值条款（如"performance≥5 且 shards≥100 才强制 TLA+"）替换为：

```markdown
- [ ] TLA+/Lean4 触发条件**预测**：基于 SRS 关键词粗扫给出初步判断（最终裁决在 M3 后据「TLA+/Lean4 触发真值表」SKILL.md 执行，本阶段不做最终裁决）
```

如果 `orchestrator_frontend.md` 中没有硬编码阈值条款，则在阶段 1.2 末尾增加上述条款，并添加注释：

```markdown
> **注意**：TLA+/Lean4 的最终触发裁决由 SKILL.md 中的「TLA+/Lean4 触发真值表」统一裁定。Frontend 阶段仅做预测，不自行声明阈值。
```

- [ ] **Step 3: 提交**

```bash
cd d:\srs_formalizer_opt\SRS-Formalizer
git add .claude/skills/srs-formalizer/prompts/orchestrator_frontend.md
git -c commit.gpgsign=false commit -m "fix(prompt): align orchestrator_frontend TLA+/Lean4 thresholds with truth table" -m "P1-9: remove any hardcoded threshold clauses that conflict with SKILL.md truth table." -m "Frontend stage only predicts triggers; final adjudication after M3 per truth table."
```

---

## Task 8: STATE.md 交叉校验与字段增强（P1-11 + P2-14）

**问题：**
- P1-11: `checkChecklistComplete` 只读 CHECKLIST.md checkbox 完整性，不与 STATE.md 交叉比对（如 STATE.md 标记阶段 ✅ 但 CHECKLIST 未完成，或反之）
- P2-14: STATE.md.template 字段不足——缺 `last_verify_gate`、`skipped_modules`、`tool_failures`、`partial_convergence` 等运维必需字段

**Files:**
- Modify: `.claude/skills/srs-formalizer/scripts/lib/verify-gate/shared.ts:40-73`
- Modify: `.claude/skills/srs-formalizer/templates/STATE.md.template`
- Test: `.claude/skills/srs-formalizer/scripts/__tests__/verify-gate.test.ts`

- [ ] **Step 1: 写失败测试**

在 `scripts/__tests__/verify-gate.test.ts` 末尾追加：

```typescript
  // ===========================================================================
  // STATE.md cross-validation (P1-11)
  // ===========================================================================

  it('checkChecklistComplete warns when STATE.md says stage complete but CHECKLIST unchecked', async () => {
    const workDir = createWorkDir('state-cross-fail');
    // STATE.md says S1 is done
    fs.writeFileSync(path.join(workDir, 'STATE.md'),
      '# State\n| 当前阶段 | R3 |\n| S1 预处理 | ✅ |\n', 'utf-8');
    // But S0 CHECKLIST has unchecked items
    fs.writeFileSync(path.join(workDir, 'S0', 'CHECKLIST.md'),
      '# S0 checklist\n\n- [ ] Not done yet\n', 'utf-8');

    const { checkChecklistComplete } = await import('../lib/verify-gate/shared.js');
    const result = checkChecklistComplete('S0', workDir);
    assert.ok(!result.passed, 'should fail when CHECKLIST unchecked');
    assert.ok(result.detail?.includes('unchecked'), `detail should mention unchecked: ${result.detail}`);
  });

  it('checkStateMdCrossCheck detects STATE.md missing last_verify_gate', async () => {
    const workDir = createWorkDir('state-missing-gate');
    fs.writeFileSync(path.join(workDir, 'STATE.md'),
      '# State\n| 当前阶段 | S1 |\n', 'utf-8');

    const { checkStateMdCrossCheck } = await import('../lib/verify-gate/shared.js');
    const result = checkStateMdCrossCheck(workDir);
    assert.ok(!result.passed, 'should warn when last_verify_gate missing');
    assert.ok(result.detail?.includes('last_verify_gate'), `detail should mention last_verify_gate: ${result.detail}`);
  });

  it('checkStateMdCrossCheck passes when STATE.md has all required fields', async () => {
    const workDir = createWorkDir('state-complete');
    fs.writeFileSync(path.join(workDir, 'STATE.md'),
      '# State\n| 当前阶段 | FINAL |\n| last_verify_gate | FINAL:pass |\n| skipped_modules | (none) |\n| tool_failures | 0 |\n', 'utf-8');

    const { checkStateMdCrossCheck } = await import('../lib/verify-gate/shared.js');
    const result = checkStateMdCrossCheck(workDir);
    assert.ok(result.passed, `should pass with all fields: ${result.detail}`);
  });
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd .claude/skills/srs-formalizer/scripts && npx tsx --test __tests__/verify-gate.test.ts
```

Expected: FAIL — `checkStateMdCrossCheck` 未导出（函数不存在）

- [ ] **Step 3: 实现 checkStateMdCrossCheck**

文件 `scripts/lib/verify-gate/shared.ts`，在 `checkChecklistComplete` 函数之后（第 73 行后）插入：

```typescript
// ---------------------------------------------------------------------------
// STATE.md cross-validation (P1-11)
// ---------------------------------------------------------------------------

/**
 * P1-11: 交叉校验 STATE.md 与 CHECKLIST.md 的一致性。
 * 检查 STATE.md 中标记为 ✅ 的阶段，其对应 CHECKLIST.md 是否也已完成。
 * 同时检查 STATE.md 是否包含运维必需字段（last_verify_gate / skipped_modules / tool_failures）。
 */
export function checkStateMdCrossCheck(workDir: string): CheckResult {
  const name = 'STATE.md cross-validation';
  const statePath = path.join(workDir, 'STATE.md');
  if (!fs.existsSync(statePath)) {
    return { name, passed: false, detail: 'STATE.md not found' };
  }
  const content = fs.readFileSync(statePath, 'utf-8');
  const issues: string[] = [];

  // Check required fields
  const requiredFields = ['last_verify_gate', 'skipped_modules', 'tool_failures'];
  for (const field of requiredFields) {
    if (!content.includes(field)) {
      issues.push(`missing field: ${field}`);
    }
  }

  // Cross-check: if STATE.md marks a stage as ✅, its CHECKLIST should be complete
  const stageMap: Record<string, string> = {
    'S1 预处理': 'S0',
    'S2 需求提取': '2_extract',
    'S3 图谱构建': '3_graph',
    'S4 BDD 生成': '4_bdd',
    'S5 形式化': '5_formal',
    'S6 验收闸门': '6_outputs',
  };
  for (const [stageLabel, checklistDir] of Object.entries(stageMap)) {
    const stageDoneRegex = new RegExp(`\\|\\s*${stageLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\|\\s*✅`);
    if (stageDoneRegex.test(content)) {
      const checklistPath = path.join(workDir, checklistDir, 'CHECKLIST.md');
      if (fs.existsSync(checklistPath)) {
        const checklistContent = fs.readFileSync(checklistPath, 'utf-8');
        const hasUnchecked = /^-\s*\[\s*\]/m.test(checklistContent);
        if (hasUnchecked) {
          issues.push(`STATE.md marks ${stageLabel} as ✅ but ${checklistDir}/CHECKLIST.md has unchecked items`);
        }
      }
    }
  }

  return {
    name,
    passed: issues.length === 0,
    detail: issues.length === 0
      ? 'STATE.md fields present and consistent with CHECKLISTs'
      : issues.join('; '),
  };
}
```

- [ ] **Step 4: 修改 verify-gate.ts — 在 S1/R3/FINAL 检查中调用交叉校验**

文件 `scripts/commands/verify-gate.ts`，在 import 中增加 `checkStateMdCrossCheck`：

```typescript
// 旧第 20 行：
import { VALID_STAGES, checkChecklistComplete, type CheckResult, type VerifyOutput } from '../lib/verify-gate/shared.js';

// 新：
import { VALID_STAGES, checkChecklistComplete, checkStateMdCrossCheck, type CheckResult, type VerifyOutput } from '../lib/verify-gate/shared.js';
```

在 S1 检查块之后（第 67 行 `checkDataFlowFormat(workDir)` 之后）增加：

```typescript
  // P1-11: STATE.md cross-validation (always run)
  allChecks.push(checkStateMdCrossCheck(workDir));
```

- [ ] **Step 5: 修改 STATE.md.template — 增加运维必需字段**

文件 `templates/STATE.md.template`，将全文替换为：

```markdown
# SRS Formalizer — 状态追踪

| 字段 | 值 |
|------|-----|
| 当前阶段 | S1 |
| 开始时间 | {{TIMESTAMP}} |
| 状态 | 进行中 |
| SRS 源 | {{SRS_PATH}} |
| 工作目录 | {{WORKDIR}} |
| last_verify_gate | — |
| skipped_modules | (none) |
| tool_failures | 0 |
| partial_convergence | (none) |

## 阶段完成度

| 阶段 | 状态 | 完成时间 |
|------|------|----------|
| S1 预处理 | 🔄 | — |
| S2 需求提取 | ⏳ | — |
| S3 图谱构建 | ⏳ | — |
| S4 BDD 生成 | ⏳ | — |
| S5 形式化 | ⏳ | — |
| S6 验收闸门 | ⏳ | — |

## TLA+/Lean4 触发裁决记录

| NFR 类别 | 关键词数 | total_shards | 裁决结果 | 裁决时间 |
|---------|---------|-------------|---------|---------|
| (M3 完成后填写) | | | | |

## 决策记录
| ID | 时间 | 决策 | 原因 |
|----|------|------|------|

## 阻塞点
（无）

## 跳过模块记录

| 模块名 | 跳过理由 | 残余风险 | 责任人 | 人类确认时间 |
|--------|---------|---------|--------|------------|
| (none) | | | | |

## 工具失败记录

| 工具 | 失败时间 | 错误摘要 | 处置 | 是否 STOP |
|------|---------|---------|------|-----------|
| (none) | | | | |
```

- [ ] **Step 6: 运行测试确认通过**

```bash
cd .claude/skills/srs-formalizer/scripts && npx tsx --test __tests__/verify-gate.test.ts
```

Expected: PASS（如已有测试因 STATE.md 缺少新字段失败，需更新测试 mock 中的 STATE.md 内容）

- [ ] **Step 7: 全量回归**

```bash
cd .claude/skills/srs-formalizer/scripts && npx tsx --test __tests__/*.test.ts
```

Expected: 全部 PASS

- [ ] **Step 8: 提交**

```bash
cd d:\srs_formalizer_opt\SRS-Formalizer
git add .claude/skills/srs-formalizer/scripts/lib/verify-gate/shared.ts .claude/skills/srs-formalizer/scripts/commands/verify-gate.ts .claude/skills/srs-formalizer/templates/STATE.md.template .claude/skills/srs-formalizer/scripts/__tests__/verify-gate.test.ts
git -c commit.gpgsign=false commit -m "feat(verify-gate): add STATE.md cross-validation and enhance template" -m "P1-11: checkStateMdCrossCheck verifies STATE.md fields and consistency with CHECKLISTs." -m "P2-14: STATE.md.template adds last_verify_gate, skipped_modules, tool_failures, partial_convergence." -m "Adds TLA+/Lean4 trigger adjudication record and skip module log sections."
```

---

## Task 9: 二级语义验证闸门脚本化（P2-12）

**问题：** `orchestrator_backend.md` 已描述"二级语义验证闸门"（promote 前由 LLM Verifier 做语义评分），但无对应脚本。Agent 可能跳过语义评分直接 promote。需脚本化：生成评分模板 + 校验评分报告存在且 APPROVED。

**Files:**
- Create: `.claude/skills/srs-formalizer/scripts/commands/semantic-gate.ts`
- Modify: `.claude/skills/srs-formalizer/scripts/index.ts`（注册新命令）
- Test: `.claude/skills/srs-formalizer/scripts/__tests__/semantic-gate.test.ts`（新建）

- [ ] **Step 1: 写失败测试（新建测试文件）**

创建 `scripts/__tests__/semantic-gate.test.ts`：

```typescript
import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const TMP = path.join(os.tmpdir(), `srs-formalizer-semantic-gate-test-${Date.now()}`);

function createWorkDir(name: string): string {
  const workDir = path.join(TMP, name, '.srs_formalizer');
  fs.mkdirSync(path.join(workDir, 'outputs', 'bdd', 'draft'), { recursive: true });
  fs.mkdirSync(path.join(workDir, 'outputs', 'semantic-reports'), { recursive: true });
  return workDir;
}

describe('semantic-gate command', () => {
  before(() => fs.mkdirSync(TMP, { recursive: true }));
  after(() => fs.rmSync(TMP, { recursive: true, force: true }));

  it('generates scoring template for BDD draft', async () => {
    const workDir = createWorkDir('template-gen');
    fs.writeFileSync(path.join(workDir, 'outputs', 'bdd', 'draft', 'auth.feature'),
      'Feature: Auth\n  Scenario: Login\n    Given user\n    When login\n    Then success\n', 'utf-8');

    const { main } = await import('../commands/semantic-gate.js');
    const result = await main(['--workdir', workDir, '--kind', 'bdd', '--generate-template']);
    assert.strictEqual(result.status, 'ok');
    assert.ok(result.data?.templatePath, 'should return template path');
    assert.ok(fs.existsSync(result.data.templatePath), 'template file should exist');
  });

  it('passes when APPROVED report exists', async () => {
    const workDir = createWorkDir('approved');
    fs.writeFileSync(path.join(workDir, 'outputs', 'bdd', 'draft', 'auth.feature'),
      'Feature: Auth\n', 'utf-8');
    const reportPath = path.join(workDir, 'outputs', 'semantic-reports', 'bdd-auth.json');
    fs.writeFileSync(reportPath, JSON.stringify({
      artifactKind: 'bdd',
      artifactPath: 'outputs/bdd/draft/auth.feature',
      verdict: 'APPROVED',
      score: 8,
      issues: [],
      reviewedAt: new Date().toISOString(),
    }), 'utf-8');

    const { main } = await import('../commands/semantic-gate.js');
    const result = await main(['--workdir', workDir, '--kind', 'bdd']);
    assert.strictEqual(result.status, 'ok');
  });

  it('fails when REJECTED report exists', async () => {
    const workDir = createWorkDir('rejected');
    fs.writeFileSync(path.join(workDir, 'outputs', 'bdd', 'draft', 'auth.feature'),
      'Feature: Auth\n', 'utf-8');
    const reportPath = path.join(workDir, 'outputs', 'semantic-reports', 'bdd-auth.json');
    fs.writeFileSync(reportPath, JSON.stringify({
      artifactKind: 'bdd',
      artifactPath: 'outputs/bdd/draft/auth.feature',
      verdict: 'REJECTED',
      score: 3,
      issues: ['Then clause restates requirement instead of observable assertion'],
      reviewedAt: new Date().toISOString(),
    }), 'utf-8');

    const { main } = await import('../commands/semantic-gate.js');
    const result = await main(['--workdir', workDir, '--kind', 'bdd']);
    assert.strictEqual(result.status, 'error');
    assert.ok(result.message?.includes('REJECTED'));
  });

  it('fails when no report exists (semantic gate not run)', async () => {
    const workDir = createWorkDir('no-report');
    fs.writeFileSync(path.join(workDir, 'outputs', 'bdd', 'draft', 'auth.feature'),
      'Feature: Auth\n', 'utf-8');

    const { main } = await import('../commands/semantic-gate.js');
    const result = await main(['--workdir', workDir, '--kind', 'bdd']);
    assert.strictEqual(result.status, 'error');
    assert.ok(result.message?.includes('no semantic report'));
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd .claude/skills/srs-formalizer/scripts && npx tsx --test __tests__/semantic-gate.test.ts
```

Expected: FAIL — `../commands/semantic-gate.js` 不存在

- [ ] **Step 3: 实现 semantic-gate.ts**

创建 `scripts/commands/semantic-gate.ts`：

```typescript
/**
 * semantic-gate.ts — 二级语义验证闸门（P2-12）
 *
 * CLI: npx tsx index.ts semantic-gate --workdir <wd> --kind <bdd|tlaplus|lean4> [--generate-template]
 *
 * 脚本只做两件事（不调用 LLM）：
 * 1. --generate-template: 扫描 draft 产物，生成评分模板 JSON（供 LLM Verifier 填写）
 * 2. 无 --generate-template: 校验对应 semantic-report 存在且 verdict=APPROVED
 *
 * 语义评分本身由 Agent（LLM Verifier 子代理）完成，脚本只做格式校验与存在性检查。
 * 在 validate-* --strict --promote 之前必须先通过本闸门。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliResult } from '../types/index.js';
import { safeParseArg, validateWorkDir } from '../lib/cli.js';
import { ARTIFACT_PATHS, artifactPath } from '../lib/artifacts/paths.js';
import { collectByExtension } from '../lib/artifacts/validation-report.js';
import { refuseDirectInvocation } from '../lib/cli.js';

const KIND_CONFIG: Record<string, { draftPath: keyof typeof ARTIFACT_PATHS; ext: string; scoringCriteria: string[] }> = {
  bdd: {
    draftPath: 'bddDraft',
    ext: '.feature',
    scoringCriteria: [
      'Then 为可观测断言（非需求复述）',
      'When 绑定具体触发事件',
      '约束域含否定场景',
      '每个 SRS 需求至少一个可执行场景',
    ],
  },
  tlaplus: {
    draftPath: 'tlaDraft',
    ext: '.tla',
    scoringCriteria: [
      'Next 为显式转换对（非 var\' \\in TypeSet）',
      '6 类 NFR 不变式非平凡且互不相同',
      'TypeOK 覆盖所有状态变量',
      '每个 SRS 状态转换与至少一个 Action 追溯',
    ],
  },
  lean4: {
    draftPath: 'leanDraft',
    ext: '.lean',
    scoringCriteria: [
      '每条定理后件为实质命题（非 True/→ True）',
      '证明体非同义反复（非 := h / := by exact h）',
      '可追溯到 IR-NODE id',
      '无 sorry/admit/axiom',
    ],
  },
};

export async function main(args: string[]): Promise<CliResult> {
  let workDirArg: string | null;
  let kindArg: string | null;
  try {
    workDirArg = safeParseArg(args, '--workdir');
    kindArg = safeParseArg(args, '--kind');
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }
  if (!workDirArg) return { status: 'error', message: 'Missing required argument: --workdir' };
  if (!kindArg) return { status: 'error', message: 'Missing required argument: --kind' };
  if (!(kindArg in KIND_CONFIG)) {
    return { status: 'error', message: `Invalid --kind: "${kindArg}". Valid: ${Object.keys(KIND_CONFIG).join(', ')}` };
  }

  let workDir: string;
  try { workDir = validateWorkDir(workDirArg); } catch (err) { return { status: 'error', message: (err as Error).message }; }

  const config = KIND_CONFIG[kindArg];
  const generateTemplate = args.includes('--generate-template');
  const draftDir = artifactPath(workDir, ARTIFACT_PATHS[config.draftPath]);
  const reportDir = path.join(workDir, 'outputs', 'semantic-reports');
  fs.mkdirSync(reportDir, { recursive: true });

  if (!fs.existsSync(draftDir)) {
    return { status: 'error', message: `Draft directory not found: ${draftDir}` };
  }

  const draftFiles = collectByExtension(draftDir, config.ext).sort();
  if (draftFiles.length === 0) {
    return { status: 'error', message: `No ${config.ext} draft files found in ${draftDir}` };
  }

  if (generateTemplate) {
    // Generate scoring template JSON for each draft file
    const templates: string[] = [];
    for (const file of draftFiles) {
      const baseName = path.basename(file, config.ext);
      const templatePath = path.join(reportDir, `${kindArg}-${baseName}.json`);
      const template = {
        artifactKind: kindArg,
        artifactPath: path.relative(workDir, file),
        verdict: 'PENDING' as const,
        score: 0,
        issues: [] as string[],
        scoringCriteria: config.scoringCriteria,
        reviewedAt: null as string | null,
        reviewer: null as string | null,
      };
      fs.writeFileSync(templatePath, JSON.stringify(template, null, 2), 'utf-8');
      templates.push(templatePath);
    }
    return { status: 'ok', data: { templatePath: templates[0], allTemplates: templates, count: templates.length } };
  }

  // Validate: each draft file must have a matching APPROVED report
  const failures: string[] = [];
  for (const file of draftFiles) {
    const baseName = path.basename(file, config.ext);
    const reportPath = path.join(reportDir, `${kindArg}-${baseName}.json`);
    if (!fs.existsSync(reportPath)) {
      failures.push(`${baseName}: no semantic report (run with --generate-template first, have LLM Verifier fill it, then re-run)`);
      continue;
    }
    try {
      const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as { verdict?: string; issues?: string[] };
      if (report.verdict !== 'APPROVED') {
        const issues = report.issues?.length ? ` (${report.issues.length} issue(s): ${report.issues.slice(0, 3).join('; ')})` : '';
        failures.push(`${baseName}: verdict=${report.verdict}${issues}`);
      }
    } catch {
      failures.push(`${baseName}: semantic report is not valid JSON`);
    }
  }

  if (failures.length > 0) {
    return { status: 'error', message: `Semantic gate failed for ${failures.length}/${draftFiles.length} artifact(s): ${failures.join('; ')}` };
  }

  return { status: 'ok', data: { checked: draftFiles.length, allApproved: true } };
}

refuseDirectInvocation(import.meta.url);
```

- [ ] **Step 4: 确认 ARTIFACT_PATHS 包含所需路径**

读取 `scripts/lib/artifacts/paths.ts`，确认 `ARTIFACT_PATHS` 包含 `bddDraft`、`tlaDraft`、`leanDraft`。如不存在，增加：

```typescript
// 在 ARTIFACT_PATHS 对象中增加（如缺失）：
bddDraft: ['outputs', 'bdd', 'draft'],
tlaDraft: ['outputs', 'tlaplus', 'draft'],
leanDraft: ['outputs', 'lean4', 'draft'],
```

- [ ] **Step 5: 注册 semantic-gate 命令到 index.ts**

读取 `scripts/index.ts`，在命令注册表中增加：

```typescript
// 在命令映射中增加：
'.semantic-gate': () => import('./commands/semantic-gate.js'),
```

同时在 SKILL.md 的 `stage_gates` 列表 Independent Tools 中增加 `semantic-gate`（第 192-203 行附近）。

- [ ] **Step 6: 运行测试确认通过**

```bash
cd .claude/skills/srs-formalizer/scripts && npx tsx --test __tests__/semantic-gate.test.ts
```

Expected: PASS

- [ ] **Step 7: 全量回归**

```bash
cd .claude/skills/srs-formalizer/scripts && npx tsx --test __tests__/*.test.ts
```

Expected: 全部 PASS

- [ ] **Step 8: 提交**

```bash
cd d:\srs_formalizer_opt\SRS-Formalizer
git add .claude/skills/srs-formalizer/scripts/commands/semantic-gate.ts .claude/skills/srs-formalizer/scripts/__tests__/semantic-gate.test.ts .claude/skills/srs-formalizer/scripts/index.ts .claude/skills/srs-formalizer/SKILL.md
git -c commit.gpgsign=false commit -m "feat(semantic-gate): script the second-level semantic verification gate" -m "P2-12: semantic-gate command generates scoring templates and validates APPROVED reports." -m "Script does NOT call LLM — only formats and checks existence/verdict." -m "LLM Verifier fills the template; script ensures gate is not skipped before promote."
```

---

## Task 10: Backend 专属 HITL 章节（P2-13）

**问题：** `orchestrator_backend.md` 缺少 Backend 阶段专属的 HITL 章节。Frontend/Middle-end 的 HITL 规则已在 SKILL.md 通用章节定义，但 Backend 有其独特的 HITL 场景（模块跳过、工具崩溃、Lean4 平台不支持、收敛超限、SRS 补丁应用）需要明确列出。

**Files:**
- Modify: `.claude/skills/srs-formalizer/prompts/orchestrator_backend.md`

- [ ] **Step 1: 在 orchestrator_backend.md 末尾增加 Backend HITL 章节**

文件 `prompts/orchestrator_backend.md`，在文件末尾追加：

```markdown
## Backend 专属 HITL 规则（P2-13）

> **原则**：Backend 阶段涉及形式化产物生成与验证，任何"跳过"、"降级"、"工具不可用"都必须经人类确认。以下场景必须 🛑 **STOP · 等待人类确认**后方可继续。

### 必须 HITL 的场景

| 场景 | 触发条件 | Agent 动作 | 禁止行为 |
|------|---------|-----------|---------|
| **模块跳过** | 用户或 Agent 提议跳过某 arch-1 子系统的 TLA+/Lean4 生成 | ① 在 STATE.md 记录：跳过模块名、跳过理由、残余风险、责任人；② 🛑 STOP 等待人类确认；③ 确认后 FINAL 标记 `partial_convergence` | 自行跳过、静默忽略、伪造 verified |
| **工具崩溃** | `validate-*` / `lake build` / `tla2tools.jar` 非零退出且非已知失败模式 | ① 立即 🛑 STOP；② 收集错误日志、stack trace、工作目录快照；③ 报告人类 | 重试超过 3 次、降级为"环境限制"、绕过门禁 |
| **Lean4 平台不支持** | `validate-lean` 在 Windows 上返回 `platform_unsupported` | ① 生成 `S5_SKIP_REPORT.md`，标记受影响需求、替代验证、残余风险；② 🛑 STOP 等待人类确认是否在 Linux 环境重做或接受跳过 | 将跳过宣称为 Lean verified、不生成 SKIP_REPORT |
| **收敛循环超限** | B7 超过 `max_iterations`（≤50→3, 51-100→5, >100→8） | ① 检查 high-confidence 比例与 NFR 覆盖率；② 若 ≥7/13 且 NFR≥60% → 允许 `partial_convergence`；否则苏格拉底拷问；③ 仍无法收敛 → 🛑 STOP | 自行加轮、伪造收敛、跳过 13 问 |
| **SRS 补丁应用** | 形式化符合 SRS 但发现 SRS 本身有问题 → 写入 `SRS_PATCHES.md` | ① 记录矛盾描述 + SRS 引用 + 可选项 A/B/C + 事实依据；② 🛑 STOP 等待人类确认；③ 涉及安全关键需求时 `security_level` 提升至 `critical` | 直接修改代码绕过、不记录补丁、未经确认应用 |
| **二级语义验证 REJECTED** | `semantic-gate` 返回 REJECTED | ① 携带具体 issue 回退对应 executor 重做；② 连续 3 次 REJECTED → 🛑 STOP 等待人类确认是否调整评分标准或接受降级 | 跳过语义闸门直接 promote、忽略 REJECTED |

### HITL 记录规范

每次 HITL 确认必须在 STATE.md 的「决策记录」和对应章节记录：

```
## 决策记录
| ID | 时间 | 决策 | 原因 |
|----|------|------|------|
| D001 | 2026-07-22T10:30:00Z | 跳过 PaymentService 的 TLA+ 生成 | 用户裁剪，仅需 AuthService 形式化 | 
```

如果涉及模块跳过，还需在「跳过模块记录」章节填写完整信息（模块名/理由/残余风险/责任人/人类确认时间）。

### Backend 失败计数

全管线统一失败计数 **N=3**（见 SKILL.md 失败模式表）。Backend 各 stage（B2/B3/B4/FINAL）连续 3 次修复失败 → 🛑 STOP。收敛循环的 `max_iterations` 不属于"修复失败"计数。
```

- [ ] **Step 2: 提交**

```bash
cd d:\srs_formalizer_opt\SRS-Formalizer
git add .claude/skills/srs-formalizer/prompts/orchestrator_backend.md
git -c commit.gpgsign=false commit -m "feat(prompt): add Backend-specific HITL section to orchestrator_backend" -m "P2-13: document 6 mandatory HITL scenarios for Backend (module skip, tool crash, platform unsupported, convergence overflow, SRS patch, semantic REJECTED)." -m "Includes HITL recording format and failure count alignment."
```

---

## 全量回归测试

- [ ] **Step 1: Windows 全量测试**

```bash
cd d:\srs_formalizer_opt\SRS-Formalizer\.claude\skills\srs-formalizer\scripts
npx tsx --test __tests__/*.test.ts
```

Expected: 全部 PASS（预期测试总数约 390+，含新增 ~15 个测试用例）

- [ ] **Step 2: WSL2 Linux 全量测试**

```bash
cd /mnt/d/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts
./node_modules/.bin/tsx --test __tests__/*.test.ts
```

Expected: 全部 PASS（如 WSL2 缺少 `@esbuild/linux-x64`，先运行 `npm install --no-save @esbuild/linux-x64 tsx`）

- [ ] **Step 3: TypeScript 类型检查**

```bash
cd d:\srs_formalizer_opt\SRS-Formalizer\.claude\skills\srs-formalizer\scripts
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 4: 最终提交（如有修复）**

```bash
cd d:\srs_formalizer_opt\SRS-Formalizer
git add -A
git -c commit.gpgsign=false commit -m "test: fix regressions from supplementary fixes" -m "Resolve any test failures discovered during full regression."
```

---

## 合并到 main

- [ ] **Step 1: 确认分支状态**

```bash
cd d:\srs_formalizer_opt\SRS-Formalizer
git log --oneline main..fix/srs-formalizer-supplementary-fixes
```

Expected: 10 个 commits（每个 Task 一个）

- [ ] **Step 2: 合并到 main**

```bash
cd d:\srs_formalizer_opt\SRS-Formalizer
git checkout main
git merge fix/srs-formalizer-supplementary-fixes
```

- [ ] **Step 3: 合并后验证**

```bash
cd d:\srs_formalizer_opt\SRS-Formalizer\.claude\skills\srs-formalizer\scripts
npx tsx --test __tests__/*.test.ts
```

Expected: 全部 PASS

- [ ] **Step 4: 删除分支**

```bash
cd d:\srs_formalizer_opt\SRS-Formalizer
git branch -d fix/srs-formalizer-supplementary-fixes
```
