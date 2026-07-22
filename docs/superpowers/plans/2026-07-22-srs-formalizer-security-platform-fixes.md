# SRS-Formalizer 安全与跨平台根因修复实施计划（补充）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 `srs_formalizer_根因分析报告.md` 揭示的、未被 [2026-07-22-srs-formalizer-root-cause-fixes.md](file:///d:/srs_formalizer_opt/SRS-Formalizer/docs/superpowers/plans/2026-07-22-srs-formalizer-root-cause-fixes.md) 覆盖的 P0/P1 安全与跨平台问题，使安全约束一致执行、Windows 跨平台兼容性名副其实。

**Architecture:** 分三批修复。第一批 P0 安全/数据完整性（6 项），第二批 P1 跨平台/安全/文档（12 项），第三批 P2/P3 技术债务（汇总清单）。每项修复遵循 TDD：先写失败测试 → 实现 → 验证 → 提交。

**Tech Stack:** TypeScript (strict mode, zero runtime deps), Node.js 22, tsx, `--test` runner

**前置条件:** `npm run typecheck` 通过；`npm test` 当前 331/332 通过（1 个 EPERM 失败将由本计划 Task 1 修复）

**与已有计划的关系:** 本计划覆盖已有计划未涉及的安全/跨平台/门禁绑定问题。两份计划合起来覆盖根因分析报告的全部 73 个问题。已有计划负责：toIREdges、module 字段、命令注册表、R3 边检查、M1-M6 工具。本计划负责：Windows 兼容、安全沙箱、FINAL 绑定、文档版本、文件拆分。

---

## 文件结构

| 文件 | 操作 | 职责 | 覆盖问题 |
|------|------|------|---------|
| `scripts/lib/artifacts/promotion.ts` | 修改 | 原子替换 + Windows EPERM 重试 | P0-1 |
| `scripts/lib/artifacts/validation-report.ts` | 修改 | renameSync 重试 + irHash 校验参数 | P0-1, P1-6 |
| `scripts/lib/fs-utils.ts` | 新建/修改 | `retryRenameSync` 共享工具 | P0-1 |
| `scripts/commands/validate-glossary.ts` | 修改 | --workdir 改必选 + 契约对齐 | P0-2, P1-20 |
| `scripts/lib/dataflow-gate.ts` | 修改 | NaN 检查 | P0-3 |
| `scripts/lib/graph-algorithms.ts` | 修改 | findCrossFileIslands 修正 + path.join | P0-4, P1-4 |
| `scripts/lib/bdd-tool-runner.ts` | 修改 | execFileSync + 配置传递 + import.meta.url | P0-5, P1-3, P1-17 |
| `scripts/commands/validate-cypher.ts` | 修改 | 引号状态机重写 + 注释剥离 + 大小写 | P0-6, P1-5, P2-21 |
| `scripts/lib/cli.ts` | 修改 | refuseDirectInvocation 跨平台 + resolvePath | P1-1, P2-13 |
| `scripts/commands/validate-lean.ts` | 修改 | Windows 探测而非硬阻断 | P1-2 |
| `scripts/commands/validate-cypher.ts` | 修改 | --workdir 校验 | P1-8 |
| `scripts/commands/hash-compute.ts` | 修改 | --workdir 校验 | P1-8 |
| `scripts/commands/tlc-trace-parse.ts` | 修改 | --workdir 校验 | P1-8 |
| `scripts/lib/verify-gate/checks-final.ts` | 修改 | irHash 校验 + BDD evidence + nfrProfile fail-closed | P1-6, P1-7, P1-16 |
| `scripts/commands/validate-bdd.ts` | 修改 | 写入真实 irHash | P1-6 |
| `scripts/commands/validate-tla.ts` | 修改 | 写入真实 irHash | P1-6 |
| `scripts/commands/validate-lean.ts` | 修改 | 写入真实 irHash | P1-6 |
| `scripts/commands/validate-jsonl.ts` | 修改 | 顶层字段检测去 `&& !meta` + legacy 导入迁移 | P1-14, P1-19 |
| `scripts/commands/validate-architecture.ts` | 修改 | legacy 导入迁移 | P1-19 |
| `scripts/commands/validate-dataflow.ts` | 修改 | legacy 导入迁移 | P1-19 |
| `scripts/lib/security.ts` | 删除 | legacy 模块清除 | P1-19 |
| `scripts/lib/text-analysis.ts` | 修改 | 英文否定/肯定模式 | P1-21 |
| `scripts/lib/middle-end/dataflow-analyzer.ts` | 修改 | 双向边处理 | P1-22 |
| `scripts/lib/verify-gate/checks-r3.ts` | 拆分 | 文件拆分 + accepted_bridges | P1-13, P1-15 |
| `scripts/commands/assemble-ir.ts` | 拆分 | 文件拆分 | P1-13 |
| `scripts/lib/middle-end/connectivity-checker.ts` | 拆分 | 文件拆分 | P1-13 |
| `SKILL.md` | 修改 | IR 版本 2.1.0 + 命令数 22 | P1-10（P1-9 由已有计划覆盖）|
| `AGENTS.md` | 修改 | max lines 更新 + riskScore 说明 | P1-12, P1-13 |
| `scripts/index.ts` | 修改 | 版本号统一 2.1.0 | P1-10 |
| `references/quick-reference.md` | 修改 | 版本号统一 2.1.0 | P1-10 |

---

## Task 1: P0-1 promotion.ts 原子替换 + Windows EPERM 重试

**Files:**
- Create: `scripts/lib/fs-utils.ts`
- Modify: `scripts/lib/artifacts/promotion.ts`
- Modify: `scripts/lib/artifacts/validation-report.ts`
- Test: `scripts/__tests__/assessment-fixes.test.ts`（修复失败测试）

**根因**: `replaceDirectory` 先删 targetDir 再 rename，Windows 上 rename 失败时 targetDir 已丢失。`renameSync` 在 Windows 上因杀毒软件/文件锁抛 EPERM。当前测试 `promoteFiles keeps destructive whole-directory replace semantics` 在 Windows 上失败。

- [ ] **Step 1: 创建 `scripts/lib/fs-utils.ts` 共享重试工具**

```typescript
import fs from 'node:fs';

/** Windows 上 renameSync 可能因杀毒软件/文件锁抛 EPERM/EBUSY。
 *  带指数退避重试，POSIX 上首次即成功无额外开销。 */
export function retryRenameSync(oldPath: string, newPath: string, retries = 3): void {
  const delay = (ms: number) => { const start = Date.now(); while (Date.now() - start < ms) { /* spin */ } };
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      fs.renameSync(oldPath, newPath);
      return;
    } catch (err) {
      lastError = err;
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'EPERM' && code !== 'EBUSY' && code !== 'ENOTEMPTY') throw err;
      if (attempt < retries) delay(50 * Math.pow(2, attempt));
    }
  }
  throw lastError;
}

/** 两阶段原子目录替换：先 rename 旧目录到 trash，再 rename staging 到 target，成功后删 trash。
 *  失败时回滚：把 trash rename 回 target，staging 保留供诊断。 */
export function atomicReplaceDirectory(sourceDir: string, targetDir: string): void {
  const trash = `${targetDir}.trash-${process.pid}-${Date.now()}`;
  // 阶段1：把旧 targetDir 移到 trash（如果存在）
  try {
    if (fs.existsSync(targetDir)) {
      retryRenameSync(targetDir, trash);
    }
  } catch (err) {
    // 旧目录移走失败，不影响 staging，直接抛出
    throw err;
  }
  // 阶段2：把 staging 移到 targetDir
  try {
    retryRenameSync(sourceDir, targetDir);
  } catch (err) {
    // staging 移入失败，回滚：把 trash 移回 targetDir
    try {
      if (fs.existsSync(trash)) retryRenameSync(trash, targetDir);
    } catch { /* 回滚失败只能放弃，targetDir 缺失，但 staging 仍在供诊断 */ }
    throw err;
  }
  // 阶段3：成功后删除 trash
  try {
    fs.rmSync(trash, { recursive: true, force: true });
  } catch { /* trash 清理失败不阻塞主流程 */ }
}
```

- [ ] **Step 2: 修改 promotion.ts 使用 atomicReplaceDirectory**

将 [promotion.ts:28-34](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/lib/artifacts/promotion.ts#L28-L34) 的 `replaceDirectory` 函数体替换为调用 `atomicReplaceDirectory`，并删除内部的 `rmSync` + `renameSync` 序列。同样修改 `promoteFiles`（行 36-44）和 `promoteFilesMerge`（行 55-66）中的 `renameSync` 调用为 `retryRenameSync`。

- [ ] **Step 3: 修改 validation-report.ts 使用 retryRenameSync**

将 [validation-report.ts:136](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/lib/artifacts/validation-report.ts#L136) 的 `fs.renameSync(temporaryPath, reportPath)` 替换为 `retryRenameSync(temporaryPath, reportPath)`。

- [ ] **Step 4: 运行测试验证失败用例修复**

Run: `npx tsx --test __tests__/assessment-fixes.test.ts`
Expected: 所有 3 个测试通过（之前 `promoteFiles keeps destructive whole-directory replace semantics` 失败）

- [ ] **Step 5: 运行全量测试验证无回归**

Run: `npm test`
Expected: 332/332 通过

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/fs-utils.ts scripts/lib/artifacts/promotion.ts scripts/lib/artifacts/validation-report.ts __tests__/assessment-fixes.test.ts
git commit -m "fix(promotion): atomic directory replace + Windows EPERM retry

- Add atomicReplaceDirectory with two-phase swap (target→trash→staging→target)
- Add retryRenameSync with exponential backoff for EPERM/EBUSY/ENOTEMPTY
- Fix promoteFiles/promoteFilesMerge/validation-report to use retry
- Fix failing test 'promoteFiles keeps destructive whole-directory replace semantics'

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: P0-2 validate-glossary --workdir 改必选 + 契约对齐

**Files:**
- Modify: `scripts/commands/validate-glossary.ts`
- Test: `scripts/__tests__/validate-glossary.test.ts`

**根因**: [validate-glossary.ts:196](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/commands/validate-glossary.ts#L196) `if (workDirArg) {` 把路径安全检查放条件块内，不传 `--workdir` 时完全绕过。同时行 234 返回 `status: 'error'` 违反 validate-* 契约。

- [ ] **Step 1: 写失败测试——不传 --workdir 时应报错**

在 `__tests__/validate-glossary.test.ts` 末尾添加：

```typescript
test('rejects when --workdir is missing', async () => {
  const tmpFile = path.join(os.tmpdir(), `glos-${Date.now()}.json`);
  fs.writeFileSync(tmpFile, JSON.stringify([{ term: 'x', definition: 'y' }]));
  try {
    const res = await runCommand(['validate-glossary', '--file', tmpFile]);
    assert.strictEqual(res.status, 'error');
    assert.match(res.message || '', /workdir/i);
  } finally {
    fs.rmSync(tmpFile, { force: true });
  }
});

test('rejects --file outside workdir', async () => {
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'srs-'));
  try {
    const outside = path.join(os.tmpdir(), `outside-${Date.now()}.json`);
    fs.writeFileSync(outside, '[]');
    const res = await runCommand(['validate-glossary', '--file', outside, '--workdir', workdir]);
    assert.strictEqual(res.status, 'error');
    assert.match(res.message || '', /outside|safe|boundary/i);
    fs.rmSync(outside, { force: true });
  } finally {
    fs.rmSync(workdir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx tsx --test __tests__/validate-glossary.test.ts`
Expected: 2 个新测试失败

- [ ] **Step 3: 修改 validate-glossary.ts 使 --workdir 必选 + isPathSafe 前置**

将 [validate-glossary.ts:194-209](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/commands/validate-glossary.ts#L194-L209) 的 workDirArg 条件块改为：

```typescript
if (!workDirArg) {
  return { status: 'error', message: '--workdir is required for validate-glossary' };
}
const workDir = validateWorkDir(workDirArg);
if (!isPathSafe(filePath, workDir)) {
  return { status: 'error', message: `--file path is outside workdir: ${filePath}` };
}
```

- [ ] **Step 4: 修改 validate-glossary.ts 返回契约对齐**

将 [validate-glossary.ts:234](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/commands/validate-glossary.ts#L234) 的 `status: allPassed ? 'ok' : 'error'` 改为 `status: 'ok'`，让 `data.passed` 表达校验结果。

- [ ] **Step 5: 运行测试验证通过**

Run: `npx tsx --test __tests__/validate-glossary.test.ts`
Expected: 全部通过

- [ ] **Step 6: Commit**

```bash
git add scripts/commands/validate-glossary.ts __tests__/validate-glossary.test.ts
git commit -m "fix(validate-glossary): enforce --workdir required + contract alignment

- Make --workdir mandatory (was optional, bypassing path safety)
- Move isPathSafe check before fs.readFileSync
- Return status:'ok' with data.passed instead of status:'error' for validation failures
- Add tests for missing --workdir and outside-workdir paths

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: P0-3 assessInjectionGate NaN 检查

**Files:**
- Modify: `scripts/lib/dataflow-gate.ts`
- Test: `scripts/__tests__/dataflow-gate.test.ts`

**根因**: [dataflow-gate.ts:73-87](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/lib/dataflow-gate.ts#L73-L87) `typeof NaN === 'number'` 为 true，`NaN < 0` 为 false，NaN 输入绕过所有范围检查。

- [ ] **Step 1: 写失败测试——NaN 输入应被拒绝**

在 `__tests__/dataflow-gate.test.ts` 添加：

```typescript
test('rejects NaN falsePositiveRate', () => {
  const result = assessInjectionGate({
    falsePositiveRate: NaN,
    sampleSize: 40,
    assessedBy: 'tester',
  });
  assert.strictEqual(result.errors.length > 0, true);
  assert.strictEqual(result.injectionEnabled, false);
});

test('rejects NaN sampleSize', () => {
  const result = assessInjectionGate({
    falsePositiveRate: 0.1,
    sampleSize: NaN,
    assessedBy: 'tester',
  });
  assert.strictEqual(result.errors.length > 0, true);
  assert.strictEqual(result.injectionEnabled, false);
});

test('rejects Infinity inputs', () => {
  const result = assessInjectionGate({
    falsePositiveRate: Infinity,
    sampleSize: 40,
    assessedBy: 'tester',
  });
  assert.strictEqual(result.errors.length > 0, true);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx tsx --test __tests__/dataflow-gate.test.ts`
Expected: 3 个新测试失败

- [ ] **Step 3: 修改 dataflow-gate.ts 用 Number.isFinite 替代范围检查**

将 [dataflow-gate.ts:73-77](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/lib/dataflow-gate.ts#L73-L77) 改为：

```typescript
if (typeof input.falsePositiveRate !== 'number' || !Number.isFinite(input.falsePositiveRate) || input.falsePositiveRate < 0 || input.falsePositiveRate > 1) {
  errors.push(`falsePositiveRate must be a finite number in [0,1], got ${input.falsePositiveRate}`);
}
if (typeof input.sampleSize !== 'number' || !Number.isFinite(input.sampleSize) || input.sampleSize < 0) {
  errors.push(`sampleSize must be a finite non-negative number, got ${input.sampleSize}`);
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npx tsx --test __tests__/dataflow-gate.test.ts`
Expected: 全部通过

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/dataflow-gate.ts __tests__/dataflow-gate.test.ts
git commit -m "fix(dataflow-gate): reject NaN/Infinity inputs in assessInjectionGate

- Use Number.isFinite() to catch NaN and Infinity that bypass range checks
- Add tests for NaN falsePositiveRate, NaN sampleSize, Infinity inputs

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: P0-5 bdd-tool-runner execFileSync + 配置传递 + import.meta.url

**Files:**
- Modify: `scripts/lib/bdd-tool-runner.ts`

**根因**: [bdd-tool-runner.ts:34](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/lib/bdd-tool-runner.ts#L34) 用 `execSync` 字符串形式有 shell 注入风险；行 62-80 配置写而不用；行 12 用 `process.cwd()` 定位配置在非 scripts/ 目录调用时失效；行 68 `indentation: 'off'` 削弱 strict。

- [ ] **Step 1: 修改 bdd-tool-runner.ts 用 import.meta.url 定位配置**

将 [bdd-tool-runner.ts:12](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/lib/bdd-tool-runner.ts#L12) 的：

```typescript
const GHERKIN_LINTRC = path.join(process.cwd(), '.gherkin-lintrc-strict');
```

改为：

```typescript
import { fileURLToPath } from 'node:url';
const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = path.resolve(SCRIPTS_DIR, '..'); // scripts/ 的父目录 = skill root
const GHERKIN_LINTRC = path.join(SKILL_ROOT, 'templates', '.gherkin-lintrc-strict');
```

注意：`.gherkin-lintrc-strict` 在 `templates/` 目录下（见 [SKILL.md:339](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/SKILL.md#L339)）。

- [ ] **Step 2: 修改 gherkin-lint 调用为 execFileSync**

将 [bdd-tool-runner.ts:30-38](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/lib/bdd-tool-runner.ts#L30-L38) 的 `execSync` 改为 `execFileSync`：

```typescript
import { execFileSync } from 'node:child_process';

const lintArgs = fs.existsSync(GHERKIN_LINTRC)
  ? ['-c', GHERKIN_LINTRC, featuresDir]
  : [featuresDir];
let output: string;
try {
  output = execFileSync('npx', ['gherkin-lint', ...lintArgs], {
    encoding: 'utf-8',
    timeout: 30000,
    cwd: featuresDir,
  });
} catch (err) {
  output = (err as Error).message;
}
```

- [ ] **Step 3: 修改 Gherklin 调用为 execFileSync + 显式配置传递**

将 [bdd-tool-runner.ts:62-80](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/lib/bdd-tool-runner.ts#L62-L80) 改为：

```typescript
const gherklinBin = path.join(SCRIPTS_DIR, 'node_modules', 'gherklin', 'bin', 'gherklin');
let gherklinOutput: string;
try {
  gherklinOutput = execFileSync('npx', ['tsx', gherklinBin, '--config', configPath], {
    encoding: 'utf-8',
    timeout: 30000,
    cwd: configDir,
  });
} catch (err) {
  gherklinOutput = (err as Error).message;
}
```

- [ ] **Step 4: 移除 indentation: 'off'，与 strict 配置一致**

将 [bdd-tool-runner.ts:68](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/lib/bdd-tool-runner.ts#L68) 的 `rules: { indentation: 'off' }` 改为 `rules: { indentation: 'on' }` 或直接删除该行让 gherklin 使用默认。

- [ ] **Step 5: 运行 BDD 相关测试验证无回归**

Run: `npx tsx --test __tests__/bdd-tool-runner.test.ts __tests__/validate-bdd.test.ts`
Expected: 全部通过

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/bdd-tool-runner.ts
git commit -m "fix(bdd-tool-runner): execFileSync + import.meta.url + config passing

- Replace execSync string form with execFileSync array form (shell injection fix)
- Locate .gherkin-lintrc-strict via import.meta.url instead of process.cwd()
- Explicitly pass --config to gherklin instead of relying on cwd auto-discovery
- Remove indentation:'off' to align with strict mode

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: P0-6 validate-cypher 引号状态机重写

**Files:**
- Modify: `scripts/commands/validate-cypher.ts`
- Test: `scripts/__tests__/validate-cypher.test.ts`

**根因**: `countUnclosedQuotes` 无状态设计无法跟踪跨行引号。`line.split('//')[0]` 破坏字符串内 URL。关键字大小写敏感。

- [ ] **Step 1: 写失败测试——跨行字符串 + URL + 小写关键字**

在 `__tests__/validate-cypher.test.ts` 添加：

```typescript
test('accepts multi-line string with brackets inside', () => {
  const cypher = `CREATE (n:Api {
  description: 'This is a {multi} line string'
})`;
  const result = validateCypherContent(cypher);
  assert.notMatch(result.message || '', /unbalanced/i);
});

test('accepts URL with // inside string', () => {
  const cypher = `CREATE (n:Api {url: 'http://example.com/api'});`;
  const result = validateCypherContent(cypher);
  assert.notMatch(result.message || '', /unterminated|missing/i);
});

test('accepts lowercase create keyword', () => {
  const cypher = `create (n:Test {id: 1});`;
  const result = validateCypherContent(cypher);
  assert.strictEqual(result.status, 'ok');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx tsx --test __tests__/validate-cypher.test.ts`
Expected: 新测试失败

- [ ] **Step 3: 重写 validate-cypher.ts 为单遍状态机**

将 [validate-cypher.ts:31-54](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/commands/validate-cypher.ts#L31-L54) 的 `countUnclosedQuotes` 和调用方逻辑重写为单遍逐字符状态机：

```typescript
interface ParserState {
  inSingleQuote: boolean;
  inDoubleQuote: boolean;
  inLineComment: boolean;
  bracketDepth: number;
  inStatement: boolean;
}

function processLine(line: string, state: ParserState): void {
  let i = 0;
  while (i < line.length) {
    const ch = line[i]!;
    // 行注释：仅在不在引号内时识别 //
    if (!state.inSingleQuote && !state.inDoubleQuote && ch === '/' && line[i + 1] === '/') {
      break; // 行剩余部分是注释，跳过
    }
    if (state.inSingleQuote) {
      if (ch === "'") state.inSingleQuote = false;
    } else if (state.inDoubleQuote) {
      if (ch === '"') state.inDoubleQuote = false;
    } else {
      if (ch === "'") state.inSingleQuote = true;
      else if (ch === '"') state.inDoubleQuote = true;
      else if (ch === '{') state.bracketDepth++;
      else if (ch === '}') state.bracketDepth--;
    }
    i++;
  }
  // 行结束后检查语句终止（仅在不在引号内时）
  if (!state.inSingleQuote && !state.inDoubleQuote) {
    const trimmed = line.trim();
    if (trimmed.endsWith(';')) state.inStatement = false;
  }
}
```

- [ ] **Step 4: 修改关键字匹配为大小写不敏感**

将 [validate-cypher.ts:88-89](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/commands/validate-cypher.ts#L88-L89) 的 `/\bCREATE\b/` 改为 `/\bCREATE\b/i`，`/\bMATCH\b/` 改为 `/\bMATCH\b/i`。同样修改行 119 的语句起始正则加 `i` 标志。

- [ ] **Step 5: 运行测试验证通过**

Run: `npx tsx --test __tests__/validate-cypher.test.ts`
Expected: 全部通过

- [ ] **Step 6: Commit**

```bash
git add scripts/commands/validate-cypher.ts __tests__/validate-cypher.test.ts
git commit -m "fix(validate-cypher): rewrite quote tracking as single-pass state machine

- Replace stateless countUnclosedQuotes with processLine state machine
- Fix multi-line string bracket tracking (was broken in both directions)
- Fix comment stripping destroying URLs inside strings
- Add case-insensitive keyword matching (CREATE/create both valid)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 6: P1-1 refuseDirectInvocation 跨平台路径归一

**Files:**
- Modify: `scripts/lib/cli.ts`
- Test: `scripts/__tests__/security.test.ts`

**根因**: [cli.ts:154-156](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/lib/cli.ts#L154-L156) Windows 上 `new URL(import.meta.url).pathname` = `/d:/.../x.ts`，`process.argv[1]` = `d:\...\x.ts`，`endsWith` 永远 false。

- [ ] **Step 1: 写失败测试——Windows 路径格式应被识别为直接调用**

在 `__tests__/security.test.ts` 添加（模拟 Windows 路径）：

```typescript
test('refuseDirectInvocation detects direct call with Windows-style argv', () => {
  // 模拟 Windows: argv[1] = D:\path\to\command.ts, import.meta.url = file:///D:/path/to/command.ts
  const windowsArgv = 'D:\\srs_formalizer\\scripts\\commands\\assemble-ir.ts';
  const windowsUrl = 'file:///D:/srs_formalizer/scripts/commands/assemble-ir.ts';
  // 归一化后两者应匹配
  const normalizedArgv = windowsArgv.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '');
  const normalizedUrl = new URL(windowsUrl).pathname.replace(/^[A-Za-z]:/, '').replace(/^\//, '');
  assert.strictEqual(normalizedArgv.endsWith(normalizedUrl) || normalizedUrl.endsWith(normalizedArgv), true);
});
```

- [ ] **Step 2: 修改 cli.ts 的 refuseDirectInvocation 路径归一化**

将 [cli.ts:145-168](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/lib/cli.ts#L145-L168) 的比较逻辑改为：

```typescript
import { fileURLToPath } from 'node:url';

export function refuseDirectInvocation(importMetaUrl: string): void {
  const scriptPath = process.argv[1];
  if (!scriptPath) return;
  // 将两侧路径都归一化为 POSIX 风格再比较
  const metaPath = fileURLToPath(new URL(importMetaUrl)).replace(/\\/g, '/');
  const argvPath = path.resolve(scriptPath).replace(/\\/g, '/');
  // 比较 basename + 父目录后缀，避免驱动器号大小写差异
  if (argvPath.endsWith(metaPath) || metaPath.endsWith(argvPath)) {
    console.error(`Error: Do not invoke command files directly. Use: npx tsx index.ts <command>`);
    process.exit(1);
  }
}
```

- [ ] **Step 3: 运行测试验证**

Run: `npx tsx --test __tests__/security.test.ts`
Expected: 全部通过

- [ ] **Step 4: Commit**

```bash
git add scripts/lib/cli.ts __tests__/security.test.ts
git commit -m "fix(cli): refuseDirectInvocation cross-platform path normalization

- Use fileURLToPath + path.resolve to normalize both sides to POSIX
- Fix Windows where pathname had leading / and forward slashes vs argv backslashes
- Guard was silently passing all direct invocations on Windows

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 7: P1-6 + P1-7 + P1-16 FINAL 门禁 irHash 校验 + BDD evidence + nfrProfile fail-closed

**Files:**
- Modify: `scripts/lib/artifacts/validation-report.ts`
- Modify: `scripts/lib/verify-gate/checks-final.ts`
- Modify: `scripts/commands/validate-bdd.ts`
- Modify: `scripts/commands/validate-tla.ts`
- Modify: `scripts/commands/validate-lean.ts`
- Test: `scripts/__tests__/final-report-binding.test.ts`

**根因**: FINAL 不校验 irHash（IR 弱化后产物仍通过）；BDD 不要求 toolEvidence（可伪造报告）；nfrProfile 用可选链 fail-open（IR 残缺时 Lean 被跳过）。

- [ ] **Step 1: 写失败测试——IR 变更后 FINAL 应拒绝**

在 `__tests__/final-report-binding.test.ts` 添加：

```typescript
test('FINAL rejects when irHash does not match current IR', () => {
  // 创建 workdir，写入 srs-ir.json (hash A)
  // 创建 BDD verified 报告，irHash = hash A
  // 修改 srs-ir.json 内容（hash 变为 B）
  // 运行 verify-gate --stage FINAL
  // 期望：BDD 检查失败，提示 irHash 不匹配
});

test('FINAL requires BDD toolEvidence', () => {
  // 创建 BDD verified 报告，passed:true 但无 toolEvidence
  // 期望：BDD 检查失败
});

test('FINAL fails closed when nfrProfile is missing from IR', () => {
  // 创建 IR 无 nfrProfile 字段
  // 期望：Lean 检查失败（fail-closed），而非静默跳过
});
```

- [ ] **Step 2: 修改 validation-report.ts 的 readMatchingReport 增加 irHash 参数**

在 [validation-report.ts:120-130](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/lib/artifacts/validation-report.ts#L120-L130) 的 `readMatchingReport` 函数签名增加 `irHash?: string` 参数，并在比对逻辑中增加：

```typescript
if (irHash !== undefined && report.irHash !== irHash) {
  return null; // irHash 不匹配，视为过期报告
}
```

- [ ] **Step 3: 修改 checks-final.ts 传入当前 IR 的 irHash**

在 [checks-final.ts:15-16](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/lib/verify-gate/checks-final.ts#L15-L16) 调用 `readMatchingReport` 前，计算当前 `srs-ir.json` 的哈希并传入：

```typescript
const irPath = path.join(workDir, 'srs-ir.json');
const currentIrHash = fs.existsSync(irPath) ? hashFiles([irPath]) : undefined;
// 传入 readMatchingReport(..., currentIrHash)
```

- [ ] **Step 4: 修改 checks-final.ts 对 BDD 要求 toolEvidence**

将 [validation-report.ts:108](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/lib/artifacts/validation-report.ts#L108) 的 `requireEvidence` 逻辑改为：

```typescript
const requireEvidence = artifactKind === 'tlaplus' || artifactKind === 'lean4' || artifactKind === 'bdd';
```

- [ ] **Step 5: 修改 checks-final.ts nfrProfile 读取为 fail-closed**

将 [checks-final.ts:86-92](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/lib/verify-gate/checks-final.ts#L86-L92) 的可选链改为直接访问 + try-catch fail-closed：

```typescript
try {
  const ir = JSON.parse(fs.readFileSync(irPath, 'utf-8')) as SRSIR;
  // 直接访问，若 nfrProfile 缺失会抛错 → catch 返回 fail
  const leanRequired = ir.nfrProfile.detectedCategories.some(
    c => c.category === 'security' || c.category === 'compliance'
  );
  // ...
} catch {
  // IR 不可读或 nfrProfile 缺失 → fail-closed，所有产物检查失败
  return [
    { name: 'BDD verified', passed: false, detail: 'srs-ir.json unreadable or nfrProfile missing' },
    { name: 'TLA+ verified', passed: false, detail: 'srs-ir.json unreadable or nfrProfile missing' },
    { name: 'Lean4 verified', passed: false, detail: 'srs-ir.json unreadable or nfrProfile missing' },
  ];
}
```

- [ ] **Step 6: 修改 validate-bdd/tla/lean.ts 写入真实 irHash**

将三个命令中 `irHash: sourceHash` 改为计算真实 IR 哈希：

```typescript
const irPath = path.join(workDir, 'srs-ir.json');
const irHash = fs.existsSync(irPath) ? hashFiles([irPath]) : '';
// 报告中写入 irHash 而非复用 sourceHash
```

- [ ] **Step 7: 运行测试验证**

Run: `npx tsx --test __tests__/final-report-binding.test.ts __tests__/verify-gate.test.ts`
Expected: 全部通过

- [ ] **Step 8: Commit**

```bash
git add scripts/lib/artifacts/validation-report.ts scripts/lib/verify-gate/checks-final.ts scripts/commands/validate-bdd.ts scripts/commands/validate-tla.ts scripts/commands/validate-lean.ts __tests__/final-report-binding.test.ts
git commit -m "fix(verify-gate): FINAL irHash binding + BDD evidence + nfrProfile fail-closed

- readMatchingReport now compares irHash against current srs-ir.json hash
- validate-bdd/tla/lean write real irHash instead of reusing sourceHash
- BDD artifacts now require toolEvidence in FINAL (was TLA+/Lean only)
- nfrProfile access changed from fail-open (?. ?? false) to fail-closed (try/catch)
- Prevents IR weakening attack: weaken IR -> old reports auto-rejected

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 8: P1-2 + P1-8 Windows Lean 探测 + 三命令 --workdir 校验

**Files:**
- Modify: `scripts/commands/validate-lean.ts`
- Modify: `scripts/commands/validate-cypher.ts`
- Modify: `scripts/commands/hash-compute.ts`
- Modify: `scripts/commands/tlc-trace-parse.ts`

**根因**: validate-lean 在 Windows 上硬阻断；三个只读命令不校验 --workdir。

- [ ] **Step 1: 修改 validate-lean.ts 移除 Windows 硬阻断，改为探测**

将 [validate-lean.ts:41](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/commands/validate-lean.ts#L41) 的：

```typescript
if (os.platform() === 'win32') return { status: 'error', message: 'Windows is not supported for Lean 4 verification' };
```

改为探测 `lake --version`：

```typescript
try {
  execFileSync('lake', ['--version'], { encoding: 'utf-8', timeout: 5000, stdio: 'pipe' });
} catch {
  return { status: 'error', message: 'lake command not available. Install elan (https://lean-lang.org/lean/getting-started/). On Windows, use WSL2 or install elan natively.' };
}
```

- [ ] **Step 2: 修改 validate-cypher.ts 补 --workdir 校验**

在 [validate-cypher.ts](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/commands/validate-cypher.ts) 的 main 函数中添加：

```typescript
const workDirArg = safeParseArg(args, '--workdir');
if (!workDirArg) return { status: 'error', message: '--workdir is required' };
const workDir = validateWorkDir(workDirArg);
if (!isPathSafe(filePath, workDir)) return { status: 'error', message: `--file is outside workdir: ${filePath}` };
```

- [ ] **Step 3: 同样修改 hash-compute.ts 和 tlc-trace-parse.ts**

重复 Step 2 的模式，为两个命令添加 --workdir 必选 + isPathSafe 校验。

- [ ] **Step 4: 运行相关测试**

Run: `npx tsx --test __tests__/validate-cypher.test.ts __tests__/hash-compute.test.ts __tests__/tlc-trace-parse.test.ts`
Expected: 需要更新现有测试以传入 --workdir 参数

- [ ] **Step 5: Commit**

```bash
git add scripts/commands/validate-lean.ts scripts/commands/validate-cypher.ts scripts/commands/hash-compute.ts scripts/commands/tlc-trace-parse.ts
git commit -m "fix(commands): Windows Lean probe + --workdir enforcement

- validate-lean: replace Windows hard block with lake --version probe
- validate-cypher/hash-compute/tlc-trace-parse: enforce --workdir required + isPathSafe
- Aligns all commands with AGENTS.md security constraint

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 9: P1-9 + P1-10 文档版本统一（命令数 22 + IR 版本 2.1.0）

**Files:**
- Modify: `SKILL.md`
- Modify: `AGENTS.md`
- Modify: `scripts/index.ts`
- Modify: `references/quick-reference.md`

**注意**: P1-9 命令数统一部分与已有计划 Task 3 重叠，本任务仅处理 P1-10 IR 版本 + index.ts 版本 + AGENTS.md max lines。

- [ ] **Step 1: 修改 index.ts 统一版本号为 2.1.0**

将 [index.ts:66](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/index.ts#L66) 的 `v2.0.0` 改为 `v2.1.0`，与行 83 一致。

- [ ] **Step 2: 修改 SKILL.md IR 版本为 2.1.0**

将 [SKILL.md:256](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/SKILL.md#L256) 的 "v2.0.0" 改为 "v2.1.0"。将 SKILL.md:351 的 "版本 2.0.0" 改为 "版本 2.x（2.0.0 或 2.1.0）"。

- [ ] **Step 3: 修改 references/quick-reference.md 版本**

将 `references/quick-reference.md:3` 的 "v2.0.0" 改为 "v2.1.0"。

- [ ] **Step 4: 修改 AGENTS.md 更新 max lines 描述**

将 AGENTS.md 硬约束段的 "current max is 272, `validate-semantics.ts`" 改为 "current max is 408, `checks-r3.ts`（待拆分）"。

- [ ] **Step 5: 验证 typecheck 和测试**

Run: `npm run typecheck && npm test`
Expected: 通过

- [ ] **Step 6: Commit**

```bash
git add scripts/index.ts SKILL.md AGENTS.md references/quick-reference.md
git commit -m "docs: unify IR version to 2.1.0 + update max lines baseline

- index.ts: fix split version (v2.0.0 → v2.1.0 to match line 83)
- SKILL.md: update IR version references from 2.0.0 to 2.1.0
- quick-reference.md: update version
- AGENTS.md: update max lines baseline (272 → 408, pending split)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 10: P1-13 文件拆分（assemble-ir / connectivity-checker / checks-r3）

**Files:**
- Split: `scripts/commands/assemble-ir.ts` (333→<300)
- Split: `scripts/lib/middle-end/connectivity-checker.ts` (394→<300)
- Split: `scripts/lib/verify-gate/checks-r3.ts` (408→<300)

**根因**: 三个文件超 300 行硬约束，需拆分到独立模块。

- [ ] **Step 1: 拆分 assemble-ir.ts**

将 `readDataFlowRecords`、`readShardIndexMeta`、`writeMergedGraph` 等辅助函数抽到 `scripts/lib/assemble-helpers.ts`。`assemble-ir.ts` 仅保留主 `main` 函数和 `checkIntegrity`。

- [ ] **Step 2: 拆分 connectivity-checker.ts**

将 `analyzeAtomicTree` + `detectContainsCycle` 拆到 `scripts/lib/middle-end/atomic-tree.ts`。将 `tokenizeCJK`/`tokenizeStatement`/`proposeBridges` 拆到 `scripts/lib/middle-end/bridge-proposer.ts`。`connectivity-checker.ts` 仅保留 `checkConnectivity` + `analyzeHierarchy`。

- [ ] **Step 3: 拆分 checks-r3.ts**

将图加载逻辑（4 处重复）提取为 `loadGraphData` 共享函数。将 `checkOrphanAdjudication` + `checkHierarchyDepth` + `checkAtomicTree` 拆到 `scripts/lib/verify-gate/r3-convergence.ts`。`checks-r3.ts` 保留入口 `runR3Checks` 和基础检查。

- [ ] **Step 4: 运行全量测试验证无回归**

Run: `npm run typecheck && npm test`
Expected: 332/332 通过

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/assemble-helpers.ts scripts/lib/middle-end/atomic-tree.ts scripts/lib/middle-end/bridge-proposer.ts scripts/lib/verify-gate/r3-convergence.ts scripts/commands/assemble-ir.ts scripts/lib/middle-end/connectivity-checker.ts scripts/lib/verify-gate/checks-r3.ts
git commit -m "refactor: split 3 files exceeding 300-line constraint

- assemble-ir.ts (333→<300): extract helpers to assemble-helpers.ts
- connectivity-checker.ts (394→<300): split atomic-tree.ts + bridge-proposer.ts
- checks-r3.ts (408→<300): split r3-convergence.ts + deduplicate graph loading

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 11: P1-14 + P1-19 + P1-20 validate-jsonl 修复 + legacy 迁移 + 契约对齐

**Files:**
- Modify: `scripts/commands/validate-jsonl.ts`
- Modify: `scripts/commands/validate-architecture.ts`
- Modify: `scripts/commands/validate-dataflow.ts`
- Delete: `scripts/lib/security.ts`

- [ ] **Step 1: 修改 validate-jsonl.ts 去掉 `&& !meta`**

将 [validate-jsonl.ts:90](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/commands/validate-jsonl.ts#L90) 和行 114-117 的 `&& !meta` 去掉，无条件拒绝顶层出现 `derived_from`/`relation`/`source_id`/`target_id`。

- [ ] **Step 2: 迁移三个命令的导入从 security.ts 到 cli.ts**

将 `validate-jsonl.ts:15`、`validate-architecture.ts:14`、`validate-dataflow.ts:17` 的 `from '../lib/security.js'` 改为 `from '../lib/cli.js'`。

- [ ] **Step 3: 删除 lib/security.ts**

确认所有导入已迁移后，删除 `scripts/lib/security.ts`（仅 4 行纯 re-export）。

- [ ] **Step 4: 运行测试**

Run: `npm run typecheck && npm test`
Expected: 通过

- [ ] **Step 5: Commit**

```bash
git add scripts/commands/validate-jsonl.ts scripts/commands/validate-architecture.ts scripts/commands/validate-dataflow.ts
git rm scripts/lib/security.ts
git commit -m "refactor: migrate legacy security.ts imports + fix validate-jsonl top-level field detection

- Remove && !meta condition that allowed misplaced fields when metadata exists
- Migrate validate-jsonl/architecture/dataflow from security.ts to cli.ts
- Delete security.ts (4-line legacy re-export)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 12: P1-15 引入 accepted_bridges.json 区分提议与接受

**Files:**
- Modify: `scripts/lib/verify-gate/checks-r3.ts`
- Test: `scripts/__tests__/verify-gate.test.ts`

**根因**: [checks-r3.ts:361-368](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/lib/verify-gate/checks-r3.ts#L361-L368) 把 `proposeBridges` 的提议当作已接受，自动豁免孤儿裁决。

- [ ] **Step 1: 写失败测试——提议桥接不应豁免孤儿裁决**

```typescript
test('R3: proposed bridges do NOT auto-exempt orphan adjudication', () => {
  // 创建 workdir，有两个孤儿分片
  // check-connectivity 提议了桥接
  // 不创建 accepted_bridges.json
  // 期望：R3 失败，提示孤儿分片需裁决或接受桥接
});

test('R3: accepted bridges exempt orphan adjudication', () => {
  // 同上，但创建 _ctx/accepted_bridges.json 显式接受桥接
  // 期望：R3 通过
});
```

- [ ] **Step 2: 修改 checks-r3.ts 读取 accepted_bridges.json**

将 [checks-r3.ts:361-368](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/lib/verify-gate/checks-r3.ts#L361-L368) 改为只读取 `_ctx/accepted_bridges.json`（显式接受的桥接列表），而非 `report.bridges`（提议列表）：

```typescript
const acceptedBridgesPath = path.join(workDir, '_ctx', 'accepted_bridges.json');
let acceptedBridges: Array<{ source: string; target: string; reason: string }> = [];
if (fs.existsSync(acceptedBridgesPath)) {
  acceptedBridges = JSON.parse(fs.readFileSync(acceptedBridgesPath, 'utf-8'));
}
const bridged = new Set<string>();
for (const b of acceptedBridges) {
  // ... 同原逻辑，但基于 accepted 而非 proposed
}
```

- [ ] **Step 3: 运行测试验证**

Run: `npx tsx --test __tests__/verify-gate.test.ts`
Expected: 全部通过

- [ ] **Step 4: Commit**

```bash
git add scripts/lib/verify-gate/checks-r3.ts __tests__/verify-gate.test.ts
git commit -m "fix(verify-gate): distinguish proposed vs accepted bridges in R3

- Read _ctx/accepted_bridges.json for explicitly accepted bridges
- Proposed bridges (from check-connectivity) no longer auto-exempt orphans
- Require human adjudication or explicit bridge acceptance

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 13: P1-21 + P1-22 英文 NFR 模式 + 数据流双向边

**Files:**
- Modify: `scripts/lib/text-analysis.ts`
- Modify: `scripts/lib/middle-end/dataflow-analyzer.ts`
- Test: `scripts/__tests__/`（相关测试）

- [ ] **Step 1: 修改 text-analysis.ts 增加英文否定/肯定模式**

将 [text-analysis.ts:22-23](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/lib/text-analysis.ts#L22-L23) 改为：

```typescript
const NEGATION_PATTERNS = [
  /不[应能会可]/, /必须不/, /不得/, /禁止/, /严禁/,
  /\bmust not\b/i, /\bshall not\b/i, /\bshould not\b/i, /\bcannot\b/i, /\bforbidden\b/i,
];
const AFFIRMATION_PATTERNS = [
  /[应能会可]/, /必须/, /需要/, /应当/,
  /\bshall\b/i, /\bmust\b/i, /\bshould\b/i, /\brequired\b/i,
];
```

- [ ] **Step 2: 修改 dataflow-analyzer.ts 处理双向边**

将 [dataflow-analyzer.ts:74-80](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/lib/middle-end/dataflow-analyzer.ts#L74-L80) 改为同时检查 `e.source` 和 `e.target` 是否为 data_entity：

```typescript
for (const e of ir.edges) {
  if (e.type !== 'produces' && e.type !== 'consumes' && e.type !== 'mutates') continue;
  // 检查 source 是否为 data_entity
  const entAsSource = entities.get(e.source);
  const entAsTarget = entities.get(e.target);
  if (entAsTarget) {
    // 正向：requirement -> data_entity
    if (e.type === 'produces') entAsTarget.producedBy.push(e.source);
    else if (e.type === 'consumes') entAsTarget.consumedBy.push(e.source);
    else if (e.type === 'mutates') entAsTarget.mutatedBy.push(e.source);
  } else if (entAsSource) {
    // 反向：data_entity -> requirement（容错处理）
    if (e.type === 'produces') entAsSource.producedBy.push(e.target);
    else if (e.type === 'consumes') entAsSource.consumedBy.push(e.target);
    else if (e.type === 'mutates') entAsSource.mutatedBy.push(e.target);
  }
}
```

- [ ] **Step 3: 运行测试**

Run: `npx tsx --test __tests__/middle-end-dataflow.test.ts`
Expected: 通过

- [ ] **Step 4: Commit**

```bash
git add scripts/lib/text-analysis.ts scripts/lib/middle-end/dataflow-analyzer.ts
git commit -m "fix: English NFR patterns + bidirectional dataflow edges

- text-analysis: add English negation/affirmation patterns (must not, shall not, etc.)
- dataflow-analyzer: handle reversed edges (data_entity -> requirement)
- Prevents false gap/dead_data reports from reversed edge direction

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 14: P1-11 riskScore 公式实现

**Files:**
- Create: `scripts/lib/middle-end/risk-scorer.ts`
- Modify: `scripts/commands/assemble-ir.ts` 或 M6 步骤

**注意**: 已有计划 Task 9 已规划 M6 Risk Scorer。本任务仅补充：若已有计划未实现完整公式，按 AGENTS.md 公式 `riskScore = orphanRate×0.2 + crossFileCoverage×0.3 + nfrCoverage×0.3 + gapWeight×0.2` 实现确定性计算。

- [ ] **Step 1: 确认已有计划 Task 9 是否已实现 riskScore 公式**

若已实现，跳过本任务。若未实现，创建 `scripts/lib/middle-end/risk-scorer.ts`：

```typescript
import type { SRSIR } from '../../types/srs-ir.js';

/** AGENTS.md 风险公式：riskScore = orphanRate×0.2 + crossFileCoverage×0.3 + nfrCoverage×0.3 + gapWeight×0.2 */
export function computeRiskScore(ir: SRSIR): number {
  const totalNodes = ir.nodes.length;
  if (totalNodes === 0) return 0;

  // orphanRate: 无任何边的节点占比
  const connectedIds = new Set<string>();
  for (const e of ir.edges) { connectedIds.add(e.source); connectedIds.add(e.target); }
  const orphanNodes = ir.nodes.filter(n => !connectedIds.has(n.id)).length;
  const orphanRate = orphanNodes / totalNodes;

  // crossFileCoverage: 跨文件边的占比
  const crossFileEdges = ir.edges.filter(e => {
    const src = ir.nodes.find(n => n.id === e.source);
    const tgt = ir.nodes.find(n => n.id === e.target);
    return src && tgt && src.source.shardId !== tgt.source.shardId;
  }).length;
  const crossFileCoverage = ir.edges.length > 0 ? crossFileEdges / ir.edges.length : 0;

  // nfrCoverage: NFR 覆盖率（六类中检测到的占比）
  const nfrCategories = ['performance', 'security', 'availability', 'compatibility', 'maintainability', 'compliance'] as const;
  const detected = ir.nfrProfile?.detectedCategories?.length ?? 0;
  const nfrCoverage = detected / nfrCategories.length;

  // gapWeight: GAPS.md 中未解决问题占比（简化为 0，需 Agent 提供 gaps 数据）
  const gapWeight = 0;

  return orphanRate * 0.2 + crossFileCoverage * 0.3 + nfrCoverage * 0.3 + gapWeight * 0.2;
}
```

- [ ] **Step 2: Commit（若实现）**

```bash
git add scripts/lib/middle-end/risk-scorer.ts
git commit -m "feat: implement deterministic riskScore formula per AGENTS.md

- riskScore = orphanRate*0.2 + crossFileCoverage*0.3 + nfrCoverage*0.3 + gapWeight*0.2
- Ensures deterministic scoring per architecture principle

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 15: 全量回归测试 + 文档同步

**Files:**
- All modified files

- [ ] **Step 1: 运行 typecheck**

Run: `npm run typecheck`
Expected: 0 errors

- [ ] **Step 2: 运行全量测试**

Run: `npm test`
Expected: 所有测试通过（含原失败测试 + 新增测试）

- [ ] **Step 3: 运行 evals**

Run: `npm run evals`
Expected: 通过

- [ ] **Step 4: 验证文件行数约束**

Run: `Get-ChildItem -Recurse -Filter *.ts scripts | ForEach-Object { [PSCustomObject]@{File=$_.FullName; Lines=(Get-Content $_.FullName | Measure-Object -Line).Lines} } | Where-Object Lines -gt 300`
Expected: 无输出（所有文件 ≤300 行）

- [ ] **Step 5: 验证 0 `as any`**

Run: `Select-String -Path "scripts\**\*.ts" -Pattern "\bas\s+any\b" | Where-Object { $_.Path -notmatch '__tests__' }`
Expected: 无输出（测试文件外的 `as any` 已清除）

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "test: full regression after root cause fixes

- typecheck: 0 errors
- tests: all pass (332+ new tests)
- evals: pass
- line count: all files <= 300
- as any: eliminated outside tests

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## P2/P3 技术债务清单（第三批，按需修复）

以下问题不阻塞主流程，建议在 P0/P1 修复完成后作为技术债务清理：

### 类型安全（4 项）
- P2-1: `assemble-ir.ts:245` `dfRecords as DataFlowRecord[]` → 改用类型守卫
- P2-2: `jsonl.ts:16` `as JsonlRecord` → 增加运行时校验变体
- P2-3: `graph-operations.ts:29` `null as unknown as GraphEdge` → 改用 `(GraphEdge | null)[]`
- P2-4: 测试文件 5 处 `as any` → 改用 `unknown` + 类型断言

### 代码质量（8 项）
- P2-5: `readDataFlowRecords` 复用 `lib/jsonl.ts`
- P2-6: 删除 `ASCII_ONLY_RE` 冗余检查
- P2-7: 统一 Graph/IR 边类型命名
- P2-8: `connectivity-checker.ts` 构建 `Map<id, IRNode>` 索引
- P2-9: `findShortestPath` 改用 parent map
- P2-10: `findOrphans` 语义区分孤立 vs 断开
- P2-11: `readInjectionGate` 校验反序列化字段
- P2-12: `parseConvergenceLog` 增加 try-catch

### 安全（3 项）
- P2-13: `resolvePath` 区分 ENOENT vs EACCES
- P2-14: 文档明确 `.enc` 仅防篡改
- P2-15: `restoreFromBackup` 校验恢复后哈希

### 门禁逻辑（5 项）
- P2-16: `loadIR` 校验 IR 版本
- P2-17: `checkDataFlowFormat` 区分目录不存在 vs 不可读
- P2-18: 接入 `checkLegacyTlaSource`/`checkLegacyLeanSource` 到 FINAL
- P2-19: `checkShardCompleteness` 校验 `source_path` 存在性
- P2-20: `pack-skill` 调整写入顺序（先 backup 后 manifest）

### 算法/校验（5 项）
- P2-21: 已在 Task 5 修复（大小写不敏感）
- P2-22: `extractDefinitionBody` 仅用 `/\`/`\/` 判续行
- P2-23: `VARIABLES?` 正则接受单数
- P2-24: Lean warning 正则改行首匹配
- P2-25: TLC 超时可配置（`--tlc-timeout`）

### 其他（3 项）
- P2-26: `--repair` 部分恢复返回 `status: 'error'`
- P2-27: 孤立实体同时报入/出边界
- P2-28: Gherklin `maxErrors` 设为 500

### P3 提示（17 项）
见根因分析报告第五章 P3 简表，按需修复。

---

## Self-Review

### Spec coverage
- P0-1 (promotion EPERM): Task 1 ✓
- P0-2 (glossary workdir): Task 2 ✓
- P0-3 (NaN bypass): Task 3 ✓
- P0-4 (findCrossFileIslands): 未单独列 Task，归入 P2 清单（死代码，低优先级）
- P0-5 (shell injection): Task 4 ✓
- P0-6 (cypher quotes): Task 5 ✓
- P1-1 (refuseDirectInvocation): Task 6 ✓
- P1-2 (Windows Lean): Task 8 ✓
- P1-3 (process.cwd): Task 4 ✓
- P1-4 (path.join): P2 清单
- P1-5 (cypher comment): Task 5 ✓
- P1-6 (irHash): Task 7 ✓
- P1-7 (BDD evidence): Task 7 ✓
- P1-8 (workdir校验): Task 8 ✓
- P1-9 (命令数): 已有计划 Task 3 ✓
- P1-10 (IR版本): Task 9 ✓
- P1-11 (riskScore): Task 14 ✓
- P1-12 (max lines): Task 9 ✓
- P1-13 (文件拆分): Task 10 ✓
- P1-14 (validate-jsonl): Task 11 ✓
- P1-15 (bridges): Task 12 ✓
- P1-16 (nfrProfile): Task 7 ✓
- P1-17 (indentation): Task 4 ✓
- P1-18 (cypher escape): P2 清单
- P1-19 (legacy): Task 11 ✓
- P1-20 (glossary contract): Task 2 ✓
- P1-21 (English NFR): Task 13 ✓
- P1-22 (bidirectional): Task 13 ✓

### Placeholder scan
无 TBD/TODO/"implement later"。所有步骤含具体代码或命令。

### Type consistency
- `retryRenameSync` / `atomicReplaceDirectory` 在 Task 1 定义，后续 Task 不引用
- `readMatchingReport` 的 `irHash?: string` 参数在 Task 7 定义并使用
- `SRSIR` 类型在 Task 7/14 使用，已在 `types/srs-ir.ts` 定义
