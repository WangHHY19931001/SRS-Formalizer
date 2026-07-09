# verify-gate 重扫 .tla 源占位标记（B3-TLA+ 对称）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 堵住 verify-gate FINAL 的 TLA+ 侧安全盲区——当 `.tla` 源注释含占位标记（GAP/TODO/FIXME/TBD/待定/未定义/待实现）时，即使残留旧 `tla-interaction-graph.json`，门禁也必须 fail；构建期 `build-tla-graph` 同样早失败。

**Architecture:** 在 `lib/verify-gate/shared.ts` 新增两个 helper：`stripTlaCode`（提取 TLA+ 注释区域）与 `scanTlaSourceForPlaceholders`（仅在注释内按 ASCII 大写词边界 + CJK 字面匹配禁止标记）。`checkTlaGraphExists`（FINAL 门禁）与 `build-tla-graph.ts`（构建期）复用该 helper 重扫源，命中即失败。这是 B3 Lean 侧源重扫的对称补齐——注意机制相反：Lean 去注释后匹配代码 token，TLA+ 保留注释匹配标记。

**Tech Stack:** TypeScript (strict, ESM)、Node.js `node:test`、tsx。零运行时 npm 依赖。

## Global Constraints

- 零运行时 npm 依赖（仅 `typescript` + `@types/node` 为 devDeps）— CLAUDE.md 约束 #1
- strict TS：`noUnusedLocals`/`noUnusedParameters`/`exactOptionalPropertyTypes`/`noUncheckedIndexedAccess`/`noFallthroughCasesInSwitch` — 约束 #2
- 0 `any`：错误类型用 `unknown` + `instanceof Error` — 约束 #3
- 文件 ≤300 行（目标）、≤500 行（硬上限）— 约束 #4（`shared.ts` 现 104 行，加 ~30 行后 ~134 行，安全）
- 路径用 `path.join()`，禁止字符串拼接 — 约束 #5
- 所有命令经 `index.ts`，命令文件末尾保留 `refuseDirectInvocation` — 约束 #7（本计划不动 build-tla-graph 末尾的 guard）
- **测试/typecheck 命令 cwd**：`.claude/skills/srs-formalizer/scripts`
- **git 命令 cwd**：仓库根 `/home/celebi/openspec_skill_create_dir`（下文 commit step 的路径以仓库根为基准）
- 当前分支：`feat/verify-gate-tla-source-scan`（spec 已提交于 commit 079e5f0）
- Commit：Conventional Commits + `Co-Authored-By: Claude <noreply@anthropic.com>`
- 提交前每任务：`npx tsc --noEmit` 0 errors + 相关测试全绿

---

### Task 1: 新增 TLA+ 占位标记源扫描 helper

**Files:**
- Modify: `.claude/skills/srs-formalizer/scripts/lib/verify-gate/shared.ts`（在文件末尾 append，即现 `scanLeanSourceForPlaceholders` 之后）
- Test: `.claude/skills/srs-formalizer/scripts/__tests__/verify-gate-source-scan.test.ts`（追加 import + describe 块）

**Interfaces:**
- Consumes: 无（仅文件顶部已 import 的 `node:fs`/`node:path`）
- Produces:
  - `stripTlaCode(src: string): string` — 返回 TLA+ 注释区域（`(* 块 *)` + `\* 行`）拼接文本，丢弃代码；导出以便单测。
  - `scanTlaSourceForPlaceholders(specsDir: string): { file: string; marker: string }[]` — 扫描目录下所有 `.tla`，仅在注释内匹配禁止标记。目录不存在或无 `.tla` 时返回 `[]`。

- [ ] **Step 1: 写失败测试**

在 `__tests__/verify-gate-source-scan.test.ts` 顶部，把现有 import 行

```typescript
import { scanLeanSourceForPlaceholders, stripLeanComments } from '../lib/verify-gate/shared.js';
```

替换为（合并新符号）：

```typescript
import {
  scanLeanSourceForPlaceholders,
  stripLeanComments,
  scanTlaSourceForPlaceholders,
  stripTlaCode,
} from '../lib/verify-gate/shared.js';
```

在文件末尾（最后一个 `});` 之后）追加一个 `mkSpecs` 辅助与新 describe 块：

```typescript
function mkSpecs(name: string, files: Record<string, string>): string {
  const dir = path.join(TMP, name, '5_formal', 'specs');
  fs.mkdirSync(dir, { recursive: true });
  for (const [f, c] of Object.entries(files)) fs.writeFileSync(path.join(dir, f), c, 'utf-8');
  return dir;
}

describe('scanTlaSourceForPlaceholders', () => {
  it('detects TODO in a line comment', () => {
    const dir = mkSpecs('tla-todo', { 'A.tla': 'VARIABLE x\n\\* TODO: strengthen invariant\nInit == x = 0\n' });
    const hits = scanTlaSourceForPlaceholders(dir);
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.marker, 'TODO');
    assert.equal(hits[0]?.file, 'A.tla');
  });

  it('detects CJK marker 待定 in a comment', () => {
    const dir = mkSpecs('tla-cjk', { 'B.tla': '\\* 状态转换待定\nInit == TRUE\n' });
    const hits = scanTlaSourceForPlaceholders(dir);
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.marker, '待定');
  });

  it('ignores GAP as a code identifier (not in a comment)', () => {
    const dir = mkSpecs('tla-code', { 'C.tla': 'CONSTANT GAP\nInit == x = GAP\n' });
    assert.deepEqual(scanTlaSourceForPlaceholders(dir), []);
  });

  it('ignores lowercase "gap" in a prose comment (case-sensitive)', () => {
    const dir = mkSpecs('tla-prose', { 'D.tla': '\\* mind the gap between states\nInit == TRUE\n' });
    assert.deepEqual(scanTlaSourceForPlaceholders(dir), []);
  });

  it('returns [] when specs dir missing', () => {
    assert.deepEqual(scanTlaSourceForPlaceholders(path.join(TMP, 'nope', 'specs')), []);
  });

  it('stripTlaCode keeps block comment text and drops code', () => {
    const out = stripTlaCode('Init == x = 0 (* TODO fix *)\nNext == TRUE');
    assert.equal(out.includes('TODO'), true);
    assert.equal(out.includes('Next'), false);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx tsx --test __tests__/verify-gate-source-scan.test.ts`
Expected: FAIL — `scanTlaSourceForPlaceholders is not a function` / `stripTlaCode is not a function`（尚未导出）

- [ ] **Step 3: 实现 helper（append 到 shared.ts 末尾）**

在 `shared.ts` 现有 `scanLeanSourceForPlaceholders` 之后追加：

```typescript
// ---------------------------------------------------------------------------
// TLA+ source placeholder-marker scanning (security gate — do not trust stale JSON)
// ---------------------------------------------------------------------------

/**
 * 保留 TLA+ 注释区域（块注释 (* ... *) + 行注释 \* ...）、丢弃代码，供匹配前净化。
 * 导出以便单测。注：嵌套块注释 (* (* *) *) 用非贪婪匹配，不追内层（TLA+ 中罕见）。
 */
export function stripTlaCode(src: string): string {
  const parts: string[] = [];
  for (const block of src.match(/\(\*[\s\S]*?\*\)/g) ?? []) parts.push(block);
  for (const line of src.split('\n')) {
    const idx = line.indexOf('\\*');
    if (idx !== -1) parts.push(line.slice(idx));
  }
  return parts.join('\n');
}

/** CJK 禁止占位标记（DESIGN behavior 门禁行 1）。ASCII 标记在下方按大写词边界匹配。 */
const TLA_CJK_MARKERS = ['待定', '未定义', '待实现'] as const;

/**
 * 扫描 specsDir 下所有 .tla，仅在注释区域匹配禁止占位标记。
 * ASCII：大写、词边界（散文小写 gap/tbd 不触发）；CJK：字面子串。
 * 目录不存在或无 .tla 时返回 []。
 */
export function scanTlaSourceForPlaceholders(
  specsDir: string,
): { file: string; marker: string }[] {
  if (!fs.existsSync(specsDir)) return [];
  const hits: { file: string; marker: string }[] = [];
  const files = fs.readdirSync(specsDir).filter(f => f.endsWith('.tla')).sort();
  for (const file of files) {
    const comments = stripTlaCode(fs.readFileSync(path.join(specsDir, file), 'utf-8'));
    const ascii = comments.match(/\b(TODO|FIXME|TBD|GAP)\b/)?.[0];
    if (ascii) hits.push({ file, marker: ascii });
    for (const cjk of TLA_CJK_MARKERS) {
      if (comments.includes(cjk)) hits.push({ file, marker: cjk });
    }
  }
  return hits;
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npx tsx --test __tests__/verify-gate-source-scan.test.ts`
Expected: PASS（原有 Lean 用例 + 新增 6 个 TLA 用例全绿）

- [ ] **Step 5: typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors（注意 `noUncheckedIndexedAccess`：`?.[0]` 已返回 `string | undefined`，`if (ascii)` 已 narrow；`for...of` 迭代 `string[]` 元素为 `string`）

- [ ] **Step 6: 提交**（git 命令 cwd = 仓库根）

```bash
git add .claude/skills/srs-formalizer/scripts/lib/verify-gate/shared.ts \
        .claude/skills/srs-formalizer/scripts/__tests__/verify-gate-source-scan.test.ts
git commit -m "feat(verify-gate): add .tla placeholder-marker source scanner

Comment-region-only scan for GAP/TODO/FIXME/TBD/待定/未定义/待实现.
Symmetric to the Lean sorry/axiom scanner (B3), but inverted: keeps
comments and matches markers there instead of stripping them.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: checkTlaGraphExists 重扫源，命中标记即 fail

**Files:**
- Modify: `.claude/skills/srs-formalizer/scripts/lib/verify-gate/checks-final.ts`（第 7 行 import + `checkTlaGraphExists` 第 157–183 行）
- Test: `.claude/skills/srs-formalizer/scripts/__tests__/verify-gate-tla-source.test.ts`（新建）

**Interfaces:**
- Consumes: `scanTlaSourceForPlaceholders` from Task 1；`CheckResult` from `shared.ts`
- Produces: `checkTlaGraphExists(workDir: string): CheckResult`（签名不变，行为增强）

- [ ] **Step 1: 写失败测试**

新建 `__tests__/verify-gate-tla-source.test.ts`：

```typescript
import { describe, it, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { checkTlaGraphExists } from '../lib/verify-gate/checks-final.js';

const TMP = path.join(os.tmpdir(), `srs-tla-src-${Date.now()}`);

function setup(name: string, tlaContent: string): string {
  const wd = path.join(TMP, name, '.srs_formalizer');
  fs.mkdirSync(path.join(wd, '5_formal', 'specs'), { recursive: true });
  fs.mkdirSync(path.join(wd, '6_outputs', 'knowledge_graph'), { recursive: true });
  fs.writeFileSync(path.join(wd, '5_formal', 'specs', 'S.tla'), tlaContent, 'utf-8');
  // stale but present artifacts — the bug is that these alone made it pass
  fs.writeFileSync(path.join(wd, '5_formal', 'tla-interaction-graph.json'),
    '{"nodes":[],"edges":[],"metadata":{}}', 'utf-8');
  fs.writeFileSync(path.join(wd, '6_outputs', 'knowledge_graph', 'tla-interaction.cypher'), '// x', 'utf-8');
  return wd;
}

describe('checkTlaGraphExists re-scans source', () => {
  after(() => fs.rmSync(TMP, { recursive: true, force: true }));

  it('FAILS when a .tla has TODO despite stale graph.json present', () => {
    const wd = setup('todo', 'VARIABLE x\n\\* TODO: finish\nInit == x = 0\n');
    const r = checkTlaGraphExists(wd);
    assert.equal(r.passed, false);
    assert.match(r.detail ?? '', /TODO/);
  });

  it('PASSES when .tla is clean and artifacts present', () => {
    const wd = setup('clean', 'VARIABLE x\nInit == x = 0\nNext == x\' = x + 1\n');
    const r = checkTlaGraphExists(wd);
    assert.equal(r.passed, true);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx tsx --test __tests__/verify-gate-tla-source.test.ts`
Expected: FAIL — 第一个用例 `passed` 实际为 `true`（当前 bug：仅凭残留 json 放行）

- [ ] **Step 3: 修改 checkTlaGraphExists**

将 `checks-final.ts` 第 7 行

```typescript
import { scanLeanSourceForPlaceholders } from './shared.js';
```

改为：

```typescript
import { scanLeanSourceForPlaceholders, scanTlaSourceForPlaceholders } from './shared.js';
```

在 `checkTlaGraphExists` 的 `hasTlaSpecs` 守卫之后（即 `if (!hasTlaSpecs) { ... }` 块的 `}` 之后）、`const hasGraph = ...` 之前，插入：

```typescript
  // SECURITY: re-scan source — never trust a possibly-stale graph.json.
  const placeholders = scanTlaSourceForPlaceholders(specsDir);
  if (placeholders.length > 0) {
    const detail = placeholders.map(p => `${p.file}:${p.marker}`).join(', ');
    return { name: 'TLA interaction graph exists', passed: false, detail: `Forbidden placeholders in .tla source: ${detail}` };
  }
```

（`specsDir` 已在函数内定义于 `checks-final.ts:160`；无需新增变量。既有 JSON 存在/解析逻辑保持不变。）

- [ ] **Step 4: 运行测试验证通过**

Run: `npx tsx --test __tests__/verify-gate-tla-source.test.ts`
Expected: PASS（2 用例全绿）

- [ ] **Step 5: 回归 + typecheck**

Run: `npx tsc --noEmit && npx tsx --test __tests__/verify-gate.test.ts`
Expected: 0 errors；verify-gate 原有测试全绿（该测试仅建 `5_formal/specs` 空目录、不写 `.tla`，故 `hasTlaSpecs=false` 走 N/A 分支，不受影响）

- [ ] **Step 6: 提交**（git 命令 cwd = 仓库根）

```bash
git add .claude/skills/srs-formalizer/scripts/lib/verify-gate/checks-final.ts \
        .claude/skills/srs-formalizer/scripts/__tests__/verify-gate-tla-source.test.ts
git commit -m "fix(verify-gate): re-scan .tla source for placeholder markers, fail on hit

Closes the TLA+ gate blind spot symmetric to B3's Lean fix: a stale
tla-interaction-graph.json could let a .tla with TODO/待定/etc. pass FINAL.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: build-tla-graph.ts 构建期重扫源

**Files:**
- Modify: `.claude/skills/srs-formalizer/scripts/commands/build-tla-graph.ts`（顶部 import + `tlaFiles` 守卫之后）
- Test: `.claude/skills/srs-formalizer/scripts/__tests__/build-tla-graph.test.ts`（追加用例）

**Interfaces:**
- Consumes: `scanTlaSourceForPlaceholders` from Task 1
- Produces: 无新导出（命令行为增强）

- [ ] **Step 1: 追加失败测试**

在 `__tests__/build-tla-graph.test.ts` 的 `describe('build-tla-graph command', ...)` 块内（沿用文件已有的 `createWorkDir`/`writeTla` 辅助），追加：

```typescript
  it('returns error when a .tla contains a TODO marker in a comment', async () => {
    const workDir = createWorkDir('marker');
    writeTla(workDir, 'Bad.tla', '---- MODULE Bad ----\nVARIABLE x\n\\* TODO: finish this\nInit == x = 0\n====\n');

    const { main } = await import('../commands/build-tla-graph.js');
    const result = await main(['--workdir', workDir]);

    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('Forbidden placeholders'));
  });
```

（clean → `status:'ok'` 已由文件首个用例 `'builds TLA interaction graph from a valid .tla file'`（`MINIMAL_TLA` 无注释标记）覆盖，无需重复。）

- [ ] **Step 2: 运行测试验证失败**

Run: `npx tsx --test __tests__/build-tla-graph.test.ts`
Expected: FAIL — 新用例得到 `status:'ok'`（当前无标记检测），断言 `status:'error'` 失败

- [ ] **Step 3: 修改 build-tla-graph.ts**

顶部 import（在现有 `import { safeParseArg, validateWorkDir } from '../lib/cli.js';` 之后）追加：

```typescript
import { scanTlaSourceForPlaceholders } from '../lib/verify-gate/shared.js';
```

在 `tlaFiles.length === 0` 守卫之后（即 `if (tlaFiles.length === 0) { ... }` 块的 `}` 之后）、`// Build graph` 注释之前，插入：

```typescript
  // Check for unresolved placeholder markers (comment-aware; should have been caught by review)
  const placeholders = scanTlaSourceForPlaceholders(specsDir);
  if (placeholders.length > 0) {
    const detail = placeholders.map(p => `${p.file}:${p.marker}`).join(', ');
    return { status: 'error', message: `Forbidden placeholders found (${detail}) — resolve markers before building graph` };
  }
```

（`specsDir` 已在 `main` 内定义于 `build-tla-graph.ts:35`；`refuseDirectInvocation` guard 保持在文件末尾不动。）

- [ ] **Step 4: 运行测试验证通过**

Run: `npx tsx --test __tests__/build-tla-graph.test.ts`
Expected: PASS（含新用例 + 原有用例）

- [ ] **Step 5: 全量回归 + typecheck**

Run: `npx tsc --noEmit && npx tsx --test __tests__/*.test.ts`
Expected: 0 errors；全部测试通过（现 309 + 本计划新增 9 个用例）

- [ ] **Step 6: 提交**（git 命令 cwd = 仓库根）

```bash
git add .claude/skills/srs-formalizer/scripts/commands/build-tla-graph.ts \
        .claude/skills/srs-formalizer/scripts/__tests__/build-tla-graph.test.ts
git commit -m "fix(build-tla-graph): reject placeholder markers in .tla before building

Symmetric to build-lean-graph's sorry/axiom guard; reuses the shared
comment-aware scanner so build-time and FINAL gate agree.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: 更新 DESIGN.md（SSOT）记录 TLA+ 源重扫

**Files:**
- Modify: `docs/DESIGN.md`（§4.4.3 质量门禁表后）

**Interfaces:** 无代码接口。

- [ ] **Step 1: 更新 DESIGN.md §4.4.3**

定位 §4.4.3 质量门禁表后的 `正常系统不允许死锁。死锁或矛盾分支需定位根因修正。` 这一句（约 `docs/DESIGN.md:379`）。在该句之后、`#### 4.4.4 工具链条件` 之前，插入一段：

```markdown
> **源重扫（门禁 #8「自动化审查」落地）**: verify-gate FINAL 的 `checkTlaGraphExists` 与构建期 `build-tla-graph` 会重新读取 `5_formal/specs/*.tla`，**仅在注释区域**匹配禁止占位标记 `GAP / TODO / FIXME / TBD / 待定 / 未定义 / 待实现`，命中即 fail——不再仅凭 `tla-interaction-graph.json` 存在放行。这落地了门禁 #8 中可确定性检测的那一半；语义型简化（弱不变式、缩小状态空间、伪代码代替 .tla）无单一文本特征，仍由 SANY/TLC 与人工审查负责。与 Lean 侧 §4.5.2 源重扫机制对称（Lean 去注释匹配 `sorry`/`axiom`，TLA+ 保留注释匹配标记）。
```

- [ ] **Step 2: 提交**（git 命令 cwd = 仓库根）

```bash
git add docs/DESIGN.md
git commit -m "docs(design): record verify-gate .tla source re-scan for placeholder markers

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage（对照 spec §4）：**
- ✅ §4.1 新 helper `stripTlaCode` + `scanTlaSourceForPlaceholders` → Task 1
- ✅ §4.2 `checkTlaGraphExists` 重扫源 → Task 2
- ✅ §4.3 `build-tla-graph.ts` 重扫源 → Task 3
- ✅ §4.4 DESIGN.md §4.4.3 同步 → Task 4
- ✅ §7 测试计划：helper 6 用例（Task 1）+ checkTla 2 用例（Task 2）+ build-tla 1 用例（Task 3）+ 回归核查（Task 2 Step 5 / Task 3 Step 5，已确认无 fixture 需改）

**Placeholder scan：** 无 TBD/TODO 占位；所有 code step 含完整代码；命令含预期输出。（计划正文出现的 `TODO`/`待定` 等词均为**测试夹具内容**，非计划占位。）

**Type consistency：** `scanTlaSourceForPlaceholders(specsDir): {file,marker}[]` 与 `stripTlaCode(src): string` 在 Task 1 定义，Task 2/3 引用一致；返回类型 `{file,marker}[]` 与 `.map(p => \`${p.file}:${p.marker}\`)` 全程一致。`CheckResult`（Task 2）/`CliResult`（Task 3）沿用现有类型。

**范围外（不在本计划，各自成计划）：** B1（需求映射边）、B2（PROVES 显式标注）、B4（build-glossary 命令名）、TLA+ 语义型简化检测。
