# B3 安全修复实施计划：verify-gate 重扫 sorry/axiom 源

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 堵住 verify-gate FINAL 的安全盲区——当 .lean 源含 `sorry` 或 `axiom` 时，即使残留旧 graph.json，门禁也必须 fail。

**Architecture:** 在 `lib/verify-gate/shared.ts` 新增一个去注释后按词边界匹配 `sorry`/`axiom` 的 helper；`checkLeanGraphExists` 与 `checkTlaGraphExists` 除文件存在检查外，重扫源目录并在命中时 `passed:false`；把 axiom 从 warn 升为 fail；同步修 `build-lean-graph.ts` 的朴素 `.includes` 误报并删死代码。

**Tech Stack:** TypeScript (strict, ESM)、Node.js `node:test`、tsx。零运行时 npm 依赖。

## Global Constraints

- 零运行时 npm 依赖（仅 `typescript` + `@types/node` 为 devDeps）— 逐字来自 CLAUDE.md 约束 #1
- strict TS：`noUnusedLocals`/`noUnusedParameters`/`exactOptionalPropertyTypes`/`noUncheckedIndexedAccess`/`noFallthroughCasesInSwitch` — 约束 #2
- 0 `any`：错误类型用 `unknown` + `instanceof Error` — 约束 #3
- 文件 ≤300 行（目标）、≤500 行（硬上限）— 约束 #4
- 路径用 `path.join()`，禁止字符串拼接 — 约束 #5
- 所有命令经 `index.ts`，命令文件末尾保留 `refuseDirectInvocation` — 约束 #7
- 提交前：`npx tsc --noEmit` 0 errors + `npx tsx --test __tests__/*.test.ts` 全绿
- 所有命令 cwd：`.claude/skills/srs-formalizer/scripts`
- Commit：Conventional Commits + `Co-Authored-By: Claude <noreply@anthropic.com>`

---

### Task 1: 新增 sorry/axiom 源扫描 helper

**Files:**
- Modify: `.claude/skills/srs-formalizer/scripts/lib/verify-gate/shared.ts`（在文件末尾 append）
- Test: `.claude/skills/srs-formalizer/scripts/__tests__/verify-gate-source-scan.test.ts`（新建）

**Interfaces:**
- Consumes: 无（仅 `node:fs`/`node:path`）
- Produces:
  - `scanLeanSourceForPlaceholders(proofsDir: string): { file: string; kind: 'sorry' | 'axiom' }[]` — 扫描目录下所有 `.lean`，返回命中项（去注释后按词边界匹配 `sorry` 与 `axiom`）。目录不存在或无 `.lean` 时返回 `[]`。
  - `stripLeanComments(src: string): string` — 移除 Lean 单行注释 `-- ...` 与块注释 `/- ... -/`，供匹配前净化，导出以便单测。

- [ ] **Step 1: 写失败测试**

新建 `__tests__/verify-gate-source-scan.test.ts`：

```typescript
import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { scanLeanSourceForPlaceholders, stripLeanComments } from '../lib/verify-gate/shared.js';

const TMP = path.join(os.tmpdir(), `srs-scan-test-${Date.now()}`);

function mkProofs(name: string, files: Record<string, string>): string {
  const dir = path.join(TMP, name, '5_formal', 'proofs');
  fs.mkdirSync(dir, { recursive: true });
  for (const [f, c] of Object.entries(files)) fs.writeFileSync(path.join(dir, f), c, 'utf-8');
  return dir;
}

describe('scanLeanSourceForPlaceholders', () => {
  after(() => fs.rmSync(TMP, { recursive: true, force: true }));

  it('detects real sorry', () => {
    const dir = mkProofs('real-sorry', { 'A.lean': 'theorem t : True := by\n  sorry\n' });
    const hits = scanLeanSourceForPlaceholders(dir);
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.kind, 'sorry');
    assert.equal(hits[0]?.file, 'A.lean');
  });

  it('detects axiom', () => {
    const dir = mkProofs('has-axiom', { 'B.lean': 'axiom foo : True\n' });
    const hits = scanLeanSourceForPlaceholders(dir);
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.kind, 'axiom');
  });

  it('ignores sorry inside a line comment (no false positive)', () => {
    const dir = mkProofs('comment', { 'C.lean': 'theorem t : True := trivial -- no sorry here\n' });
    assert.deepEqual(scanLeanSourceForPlaceholders(dir), []);
  });

  it('ignores sorry as a substring of an identifier', () => {
    const dir = mkProofs('ident', { 'D.lean': 'def notsorryish : Nat := 0\n' });
    assert.deepEqual(scanLeanSourceForPlaceholders(dir), []);
  });

  it('returns [] when dir missing', () => {
    assert.deepEqual(scanLeanSourceForPlaceholders(path.join(TMP, 'nope', 'proofs')), []);
  });

  it('stripLeanComments removes block comments', () => {
    assert.equal(stripLeanComments('a /- sorry -/ b').includes('sorry'), false);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx tsx --test __tests__/verify-gate-source-scan.test.ts`
Expected: FAIL — `scanLeanSourceForPlaceholders is not a function`（尚未导出）

- [ ] **Step 3: 实现 helper（append 到 shared.ts 末尾）**

```typescript
// ---------------------------------------------------------------------------
// Lean/TLA source placeholder scanning (security gate — do not trust stale JSON)
// ---------------------------------------------------------------------------

/** 移除 Lean 注释：块注释 /- ... -/ 与单行注释 -- ... */
export function stripLeanComments(src: string): string {
  const noBlock = src.replace(/\/-[\s\S]*?-\//g, ' ');
  return noBlock
    .split('\n')
    .map(line => {
      const idx = line.indexOf('--');
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join('\n');
}

/** 扫描 proofs 目录下所有 .lean，去注释后按词边界匹配 sorry / axiom */
export function scanLeanSourceForPlaceholders(
  proofsDir: string,
): { file: string; kind: 'sorry' | 'axiom' }[] {
  if (!fs.existsSync(proofsDir)) return [];
  const hits: { file: string; kind: 'sorry' | 'axiom' }[] = [];
  const files = fs.readdirSync(proofsDir).filter(f => f.endsWith('.lean')).sort();
  for (const file of files) {
    const clean = stripLeanComments(fs.readFileSync(path.join(proofsDir, file), 'utf-8'));
    if (/\bsorry\b/.test(clean)) hits.push({ file, kind: 'sorry' });
    if (/\baxiom\b/.test(clean)) hits.push({ file, kind: 'axiom' });
  }
  return hits;
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npx tsx --test __tests__/verify-gate-source-scan.test.ts`
Expected: PASS（6 个用例全绿）

- [ ] **Step 5: typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 6: 提交**

```bash
git add .claude/skills/srs-formalizer/scripts/lib/verify-gate/shared.ts \
        .claude/skills/srs-formalizer/scripts/__tests__/verify-gate-source-scan.test.ts
git commit -m "feat(verify-gate): add sorry/axiom source scanner helper

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: checkLeanGraphExists 重扫源，命中 sorry/axiom 即 fail

**Files:**
- Modify: `.claude/skills/srs-formalizer/scripts/lib/verify-gate/checks-final.ts:183-209`
- Test: `.claude/skills/srs-formalizer/scripts/__tests__/verify-gate-lean-source.test.ts`（新建）

**Interfaces:**
- Consumes: `scanLeanSourceForPlaceholders` from Task 1；`CheckResult` from `shared.ts`
- Produces: `checkLeanGraphExists(workDir: string): CheckResult`（签名不变，行为增强）

- [ ] **Step 1: 写失败测试**

新建 `__tests__/verify-gate-lean-source.test.ts`：

```typescript
import { describe, it, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { checkLeanGraphExists } from '../lib/verify-gate/checks-final.js';

const TMP = path.join(os.tmpdir(), `srs-lean-src-${Date.now()}`);

function setup(name: string, leanContent: string): string {
  const wd = path.join(TMP, name, '.srs_formalizer');
  fs.mkdirSync(path.join(wd, '5_formal', 'proofs'), { recursive: true });
  fs.mkdirSync(path.join(wd, '6_outputs', 'knowledge_graph'), { recursive: true });
  fs.writeFileSync(path.join(wd, '5_formal', 'proofs', 'P.lean'), leanContent, 'utf-8');
  // stale but present artifacts — the bug is that these alone made it pass
  fs.writeFileSync(path.join(wd, '5_formal', 'lean-proof-graph.json'),
    '{"nodes":[],"edges":[],"metadata":{}}', 'utf-8');
  fs.writeFileSync(path.join(wd, '6_outputs', 'knowledge_graph', 'lean-proof.cypher'), '// x', 'utf-8');
  return wd;
}

describe('checkLeanGraphExists re-scans source', () => {
  after(() => fs.rmSync(TMP, { recursive: true, force: true }));

  it('FAILS when a .lean has sorry despite stale graph.json present', () => {
    const wd = setup('sorry', 'theorem t : True := by\n  sorry\n');
    const r = checkLeanGraphExists(wd);
    assert.equal(r.passed, false);
    assert.match(r.detail ?? '', /sorry/);
  });

  it('FAILS when a .lean has axiom', () => {
    const wd = setup('axiom', 'axiom foo : True\n');
    const r = checkLeanGraphExists(wd);
    assert.equal(r.passed, false);
    assert.match(r.detail ?? '', /axiom/);
  });

  it('PASSES when .lean is clean and artifacts present', () => {
    const wd = setup('clean', 'theorem t : True := trivial\n');
    const r = checkLeanGraphExists(wd);
    assert.equal(r.passed, true);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx tsx --test __tests__/verify-gate-lean-source.test.ts`
Expected: FAIL — 前两个用例 `passed` 实际为 `true`（当前 bug）

- [ ] **Step 3: 修改 checkLeanGraphExists**

在 `checks-final.ts` 顶部 import（若已 import `CheckResult`，改为合并导入）：

```typescript
import { scanLeanSourceForPlaceholders } from './shared.js';
```

将第 183–209 行的 `checkLeanGraphExists` 整体替换为：

```typescript
export function checkLeanGraphExists(workDir: string): CheckResult {
  const graphPath = path.join(workDir, '5_formal', 'lean-proof-graph.json');
  const cypherPath = path.join(workDir, '6_outputs', 'knowledge_graph', 'lean-proof.cypher');
  const proofsDir = path.join(workDir, '5_formal', 'proofs');
  const hasLeanProofs = fs.existsSync(proofsDir) && fs.readdirSync(proofsDir).some(f => f.endsWith('.lean'));

  if (!hasLeanProofs) {
    return { name: 'Lean proof graph exists', passed: true, detail: 'N/A (Lean 4 not triggered)' };
  }

  // SECURITY: re-scan source — never trust a possibly-stale graph.json.
  const placeholders = scanLeanSourceForPlaceholders(proofsDir);
  if (placeholders.length > 0) {
    const detail = placeholders.map(p => `${p.file}:${p.kind}`).join(', ');
    return { name: 'Lean proof graph exists', passed: false, detail: `Forbidden placeholders in .lean source: ${detail}` };
  }

  const hasGraph = fs.existsSync(graphPath);
  const hasCypher = fs.existsSync(cypherPath);
  if (hasGraph && hasCypher) {
    try {
      const g = JSON.parse(fs.readFileSync(graphPath, 'utf-8'));
      const nodes = g.nodes?.length ?? 0;
      const edges = g.edges?.length ?? 0;
      const depth = g.metadata?.max_proof_depth ?? 0;
      return { name: 'Lean proof graph exists', passed: true, detail: `${nodes} nodes, ${edges} edges, depth ${depth}` };
    } catch {
      return { name: 'Lean proof graph exists', passed: false, detail: 'Corrupt JSON' };
    }
  }
  const missing = [!hasGraph && 'lean-proof-graph.json', !hasCypher && 'lean-proof.cypher'].filter(Boolean);
  return { name: 'Lean proof graph exists', passed: false, detail: `Missing: ${missing.join(', ')}` };
}
```

注：删除了原 L201 的 `axiomWarn`（axiom 现由 `scanLeanSourceForPlaceholders` 判为硬失败，不再是 warn）。

- [ ] **Step 4: 运行测试验证通过**

Run: `npx tsx --test __tests__/verify-gate-lean-source.test.ts`
Expected: PASS（3 用例全绿）

- [ ] **Step 5: 回归 + typecheck**

Run: `npx tsc --noEmit && npx tsx --test __tests__/verify-gate.test.ts`
Expected: 0 errors；verify-gate 原有测试全绿（若原测试有 Lean fixture 含裸 "sorry" 注释导致新失败，更新该 fixture 为 clean proof）

- [ ] **Step 6: 提交**

```bash
git add .claude/skills/srs-formalizer/scripts/lib/verify-gate/checks-final.ts \
        .claude/skills/srs-formalizer/scripts/__tests__/verify-gate-lean-source.test.ts
git commit -m "fix(verify-gate): re-scan .lean source for sorry/axiom, fail on hit

Closes gate blind spot where stale lean-proof-graph.json let a proof with
sorry pass FINAL. Axiom promoted from warn to hard fail per DESIGN §4.5.2.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: build-lean-graph.ts 消除 sorry 误报并删死代码

**Files:**
- Modify: `.claude/skills/srs-formalizer/scripts/commands/build-lean-graph.ts:45-71`
- Test: `.claude/skills/srs-formalizer/scripts/__tests__/build-lean-graph.test.ts`（追加用例）

**Interfaces:**
- Consumes: `scanLeanSourceForPlaceholders` from Task 1
- Produces: 无新导出（命令行为增强）

- [ ] **Step 1: 追加失败测试**

在 `__tests__/build-lean-graph.test.ts` 的 describe 块内追加（沿用该文件已有的 workdir 建造辅助；若无则用与 Task 2 相同的 setup 模式内联）：

```typescript
it('does NOT error on sorry inside a comment (no false positive)', async () => {
  const { main } = await import('../commands/build-lean-graph.js');
  // workdir with a clean proof that merely mentions "sorry" in a comment
  // (reuse this file's existing workdir helper; write P.lean below)
  // Expected: status 'ok', not 'error'
  // -> assert result.status === 'ok'
});
```

（实现者：套用本文件既有的 `createWorkDir`/临时目录写法创建 `5_formal/proofs/P.lean`，内容 `theorem t : True := trivial -- sorry mentioned\n`，调用 `main(['--workdir', wd])`，断言 `result.status === 'ok'`。若文件无现成 helper，则内联 Task 2 的 setup。）

- [ ] **Step 2: 运行测试验证失败**

Run: `npx tsx --test __tests__/build-lean-graph.test.ts`
Expected: FAIL — 当前 `.includes('sorry')` 误判注释，返回 `status:'error'`

- [ ] **Step 3: 修改 build-lean-graph.ts**

顶部 import 追加：

```typescript
import { scanLeanSourceForPlaceholders } from '../lib/verify-gate/shared.js';
```

将第 45–55 行的 sorry 检测块替换为：

```typescript
  // Check for unresolved sorry/axiom (comment-aware; should have been caught by lake build)
  const placeholders = scanLeanSourceForPlaceholders(proofsDir);
  if (placeholders.length > 0) {
    const detail = placeholders.map(p => `${p.file}:${p.kind}`).join(', ');
    return { status: 'error', message: `Forbidden placeholders found (${detail}) — run debug-lean and fix before building graph` };
  }
```

删除第 71 行死代码：

```typescript
  if (graph.metadata.sorry_count > 0) warnings.push(`${graph.metadata.sorry_count} files contain sorry`);
```

（该行在 L54 提前 return 后永不可达；sorry 现已在上方硬失败。保留 L70 的 axiom_count warning 不变——build 阶段 axiom 仍先警告，硬门禁由 verify-gate Task 2 负责。）

- [ ] **Step 4: 运行测试验证通过**

Run: `npx tsx --test __tests__/build-lean-graph.test.ts`
Expected: PASS（含新用例 + 原有用例）

- [ ] **Step 5: 全量回归 + typecheck**

Run: `npx tsc --noEmit && npx tsx --test __tests__/*.test.ts`
Expected: 0 errors；全部测试通过（299 + 新增）

- [ ] **Step 6: 提交**

```bash
git add .claude/skills/srs-formalizer/scripts/commands/build-lean-graph.ts \
        .claude/skills/srs-formalizer/scripts/__tests__/build-lean-graph.test.ts
git commit -m "fix(build-lean-graph): comment-aware sorry/axiom scan, drop dead code

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: 更新 DESIGN.md（SSOT）记录门禁增强

**Files:**
- Modify: `docs/DESIGN.md`（§4.5.2 Lean 硬门禁、§4.2 已知差距/或 §5.2 AST09 治理处）

**Interfaces:** 无代码接口。

- [ ] **Step 1: 更新 DESIGN.md §4.5.2**

在 §4.5.2 硬门禁表后补一段（说明 verify-gate FINAL 现在会重扫 .lean 源，sorry/axiom 命中即 fail，不再依赖 graph.json 存在性；axiom 由 warn 升为 fail）。同时在 §14/相关处若提到"sorry 由 lake build 捕获"，补充"verify-gate 作为第二道防线重扫源"。

- [ ] **Step 2: 提交**

```bash
git add docs/DESIGN.md
git commit -m "docs(design): record verify-gate source re-scan for sorry/axiom

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage（对照 Part B B3）：**
- ✅ B3「verify-gate 重扫源」→ Task 2（Lean）。**注意缺口**：spec B3 也要求对称修 `checkTlaGraphExists`（TLA+ 的占位/简化），本计划暂只覆盖 Lean。TLA+ 的"占位实现"检测语义与 sorry/axiom 不同（无单一关键字），需独立设计——**列为后续计划，不塞进本计划**（避免任务失焦）。已在此显式声明该边界。
- ✅ B3「build-lean-graph 误报 + 删死代码」→ Task 3
- ✅ axiom warn→fail → Task 2 Step 3
- ✅ DESIGN.md 同步（SSOT）→ Task 4

**Placeholder scan：** Task 3 Step 1 的测试为叙述式引导（因需套用该文件既有 helper，无法预知其确切签名）——已明确给出内容、断言、回退方案，非空占位。其余步骤均含完整代码。

**Type consistency：** `scanLeanSourceForPlaceholders` / `stripLeanComments` / `CheckResult` 在 Task 1 定义，Task 2/3 引用一致；返回类型 `{file,kind}[]` 全程一致。

**范围外（后续计划，不在本计划）：** B1（需求映射边）、B2（PROVES 显式标注）、B4（build-glossary 命令名）、B3 的 TLA+ 对称部分。这些将各自成计划。
