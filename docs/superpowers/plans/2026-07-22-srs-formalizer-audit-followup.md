# SRS-Formalizer 审计后续修复计划（11 项遗漏）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复二次审计发现的 11 项遗漏（2 P0 + 3 P1 + 6 P2），覆盖伪造报告检测、反模式检测、R3 关系 ingest 直接检查、AGENTS.md/SKILL.md 计数漂移、executor-bdd 语义指导缺失、参考文档覆盖空白、模板 Backend 章节缺失等。

**Architecture:** 分 8 个任务实施。代码修改遵循 TDD（先写失败测试 → 实现 → 验证通过 → 提交）；文档修改以精确替换块呈现。所有修改在 Windows + WSL2 Linux 双环境通过全量回归测试。

**Tech Stack:** TypeScript 5.5 + Node.js 20+（`node:test` + `node:assert/strict`），零运行时依赖，strict 全开。

**前置条件：**
- 分支 `main` 已合并补充修复（merge commit 后 HEAD）
- 全量测试 404/404 通过（Windows + WSL2）
- 从 `main` 创建新分支 `fix/srs-formalizer-audit-followup`

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
| Task 1 | 遗漏 1: 伪造报告检测（irHash=sourceHash bug + startedAt=completedAt + verified:validation 1:1） | P0 |
| Task 2 | 遗漏 2: 反模式检测（手动 .cfg + /tmp 脚本 + CHECKLIST-文件不一致） | P0 |
| Task 3 | 遗漏 3: R3 关系 ingest 直接检查 + r3-relational 最低阈值 | P1 |
| Task 4 | 遗漏 4+5: AGENTS.md 命令计数（22→23）+ SKILL.md L519 计数漂移（22→23） | P1 |
| Task 5 | 遗漏 10: executor-bdd.md @RID 标签规范 + 状态转换建模 + NFR 阈值设计事实 | P1 |
| Task 6 | 遗漏 6+7: artifact-contract-cheatsheet.md + ir-schema-reference.md 文档化 startLine/endLine 粒度与 module 语义 | P2 |
| Task 7 | 遗漏 8+9: GAPS.md.template Backend 章节 + 6_outputs_CHECKLIST.md 路径前缀统一 | P2 |
| Task 8 | 遗漏 11: bdd-coding-guide.md 补充 @RID/状态建模/复述检测 | P2 |

---

## Task 1: 伪造报告检测（遗漏 1，P0）

**问题：** 三个 validator（`validate-bdd.ts:63`、`validate-tla.ts:188`、`validate-lean.ts:86`）均设 `irHash: sourceHash`，使 irHash 字段形同虚设——irHash 应为 `srs-ir.json` 的 hash，用于检测"产物未随 IR 更新而过期"。此外 `checks-final.ts` 无三项伪造报告检测：`startedAt ≠ completedAt`（0ms 假报告）、`irHash` 匹配当前 IR（过期产物）、`verified:validation = 1:1`（缺报告）。

**Files:**
- Modify: `.claude/skills/srs-formalizer/scripts/commands/validate-bdd.ts:60-67`
- Modify: `.claude/skills/srs-formalizer/scripts/commands/validate-tla.ts:185-199`
- Modify: `.claude/skills/srs-formalizer/scripts/commands/validate-lean.ts:83-92`
- Modify: `.claude/skills/srs-formalizer/scripts/lib/verify-gate/checks-final.ts`（新增 3 个检查函数）
- Test: `.claude/skills/srs-formalizer/scripts/__tests__/checks-final-coverage.test.ts`

- [ ] **Step 1: 创建分支**

```bash
cd d:\srs_formalizer_opt\SRS-Formalizer
git checkout main
git pull
git checkout -b fix/srs-formalizer-audit-followup
```

- [ ] **Step 2: 写失败测试（伪造报告检测）**

在 `scripts/__tests__/checks-final-coverage.test.ts` 末尾追加（在最后一个 `});` 之前）：

```typescript
  // ===========================================================================
  // P0: Fake-report detection (irHash / startedAt=completedAt / 1:1 ratio)
  // ===========================================================================

  it('flags report with startedAt === completedAt (0ms fake report)', () => {
    const workDir = createWorkDir('fake-zero-ms');
    const verifiedDir = artifactPath(workDir, ARTIFACT_PATHS.bddVerified);
    const validationDir = artifactPath(workDir, ARTIFACT_PATHS.bddValidation);
    fs.mkdirSync(verifiedDir, { recursive: true });
    fs.mkdirSync(validationDir, { recursive: true });
    fs.writeFileSync(path.join(verifiedDir, 'Login.feature'), 'Feature: Login\n', 'utf-8');
    const sameTime = '2026-07-22T10:00:00.000Z';
    const report = {
      artifactKind: 'bdd', lifecycle: 'verified', passed: true,
      sourcePaths: [path.join(verifiedDir, 'Login.feature')],
      sourceHash: hashFiles([path.join(verifiedDir, 'Login.feature')]),
      irHash: '0'.repeat(64),
      tools: [], startedAt: sameTime, completedAt: sameTime,
      checks: [{ name: 'BDD structure', passed: true }],
    };
    fs.writeFileSync(path.join(validationDir, `${report.sourceHash}.json`), JSON.stringify(report), 'utf-8');
    const result = checkReportAuthenticity(workDir, 'bdd');
    assert.strictEqual(result.passed, false, `expected 0ms report to fail, got: ${result.detail}`);
    assert.ok(result.detail.includes('0ms'), `detail should mention 0ms: ${result.detail}`);
  });

  it('flags report with irHash not matching current srs-ir.json (stale artifact)', () => {
    const workDir = createWorkDir('fake-stale-ir');
    const verifiedDir = artifactPath(workDir, ARTIFACT_PATHS.bddVerified);
    const validationDir = artifactPath(workDir, ARTIFACT_PATHS.bddValidation);
    fs.mkdirSync(verifiedDir, { recursive: true });
    fs.mkdirSync(validationDir, { recursive: true });
    fs.writeFileSync(path.join(verifiedDir, 'Login.feature'), 'Feature: Login\n', 'utf-8');
    // Write a REAL srs-ir.json so its hash is deterministic
    const irContent = JSON.stringify({ version: '2.1.0', nodes: [], edges: [] });
    fs.writeFileSync(path.join(workDir, 'srs-ir.json'), irContent, 'utf-8');
    const realIrHash = hashText(irContent);
    const report = {
      artifactKind: 'bdd', lifecycle: 'verified', passed: true,
      sourcePaths: [path.join(verifiedDir, 'Login.feature')],
      sourceHash: hashFiles([path.join(verifiedDir, 'Login.feature')]),
      irHash: 'deadbeef'.repeat(8), // wrong irHash — does NOT match current IR
      tools: [],
      startedAt: '2026-07-22T10:00:00.000Z', completedAt: '2026-07-22T10:00:05.000Z',
      checks: [{ name: 'BDD structure', passed: true }],
    };
    fs.writeFileSync(path.join(validationDir, `${report.sourceHash}.json`), JSON.stringify(report), 'utf-8');
    const result = checkReportAuthenticity(workDir, 'bdd');
    assert.strictEqual(result.passed, false, `expected stale-ir report to fail, got: ${result.detail}`);
    assert.ok(result.detail.includes('irHash'), `detail should mention irHash mismatch: ${result.detail}`);
  });

  it('passes when irHash matches current srs-ir.json', () => {
    const workDir = createWorkDir('authentic-ir');
    const verifiedDir = artifactPath(workDir, ARTIFACT_PATHS.bddVerified);
    const validationDir = artifactPath(workDir, ARTIFACT_PATHS.bddValidation);
    fs.mkdirSync(verifiedDir, { recursive: true });
    fs.mkdirSync(validationDir, { recursive: true });
    fs.writeFileSync(path.join(verifiedDir, 'Login.feature'), 'Feature: Login\n', 'utf-8');
    const irContent = JSON.stringify({ version: '2.1.0', nodes: [], edges: [] });
    fs.writeFileSync(path.join(workDir, 'srs-ir.json'), irContent, 'utf-8');
    const realIrHash = hashText(irContent);
    const artifactHash = hashFiles([path.join(verifiedDir, 'Login.feature')]);
    const report = {
      artifactKind: 'bdd', lifecycle: 'verified', passed: true,
      sourcePaths: [path.join(verifiedDir, 'Login.feature')],
      sourceHash: artifactHash, irHash: realIrHash,
      tools: [],
      startedAt: '2026-07-22T10:00:00.000Z', completedAt: '2026-07-22T10:00:05.000Z',
      checks: [{ name: 'BDD structure', passed: true }],
    };
    fs.writeFileSync(path.join(validationDir, `${artifactHash}.json`), JSON.stringify(report), 'utf-8');
    const result = checkReportAuthenticity(workDir, 'bdd');
    assert.strictEqual(result.passed, true, `expected authentic report to pass, got: ${result.detail}`);
  });

  it('flags verified artifacts with no matching validation report (1:1 ratio)', () => {
    const workDir = createWorkDir('missing-report');
    const verifiedDir = artifactPath(workDir, ARTIFACT_PATHS.bddVerified);
    const validationDir = artifactPath(workDir, ARTIFACT_PATHS.bddValidation);
    fs.mkdirSync(verifiedDir, { recursive: true });
    fs.mkdirSync(validationDir, { recursive: true });
    // verified file exists but NO report file
    fs.writeFileSync(path.join(verifiedDir, 'Login.feature'), 'Feature: Login\n', 'utf-8');
    const irContent = JSON.stringify({ version: '2.1.0', nodes: [], edges: [] });
    fs.writeFileSync(path.join(workDir, 'srs-ir.json'), irContent, 'utf-8');
    const result = checkReportArtifactRatio(workDir, 'bdd');
    assert.strictEqual(result.passed, false, `expected missing-report to fail, got: ${result.detail}`);
    assert.ok(result.detail.includes('report'), `detail should mention missing report: ${result.detail}`);
  });
```

注意：测试文件顶部需增加导入 `hashText`：

```typescript
// 旧：
import { hashFiles } from '../lib/artifacts/validation-report.js';
// 新：
import { hashFiles, hashText } from '../lib/artifacts/validation-report.js';
```

并在测试文件顶部增加被测函数导入：

```typescript
import { checkReportAuthenticity, checkReportArtifactRatio } from '../lib/verify-gate/checks-final.js';
```

- [ ] **Step 3: 运行测试确认失败**

```bash
cd .claude/skills/srs-formalizer/scripts && npx tsx --test __tests__/checks-final-coverage.test.ts
```

Expected: FAIL — `checkReportAuthenticity` / `checkReportArtifactRatio` 未导出

- [ ] **Step 4: 修复 validators — irHash 改为 srs-ir.json 的真实 hash**

文件 `scripts/commands/validate-bdd.ts`，将第 60-67 行的 report 写入块中 `irHash: sourceHash` 改为真实 IR hash：

```typescript
// 旧（第 60-67 行）：
  const sourceHash = hashFiles(verifiedFiles);
  const reportPath = path.join(artifactPath(workDir, ARTIFACT_PATHS.bddValidation), `${sourceHash}.json`);
  writeValidationReport(reportPath, {
    artifactKind: 'bdd', lifecycle: 'verified', sourcePaths: verifiedFiles, sourceHash, irHash: sourceHash,
    tools: strict ? [{ name: 'gherkin-lint', version: 'configured' }, { name: 'gherklin', version: 'configured' }] : [],
    startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), passed: true,
    checks: [{ name: 'BDD structure', passed: true }, { name: 'strict validation', passed: strict }],
  });

// 新：
  const sourceHash = hashFiles(verifiedFiles);
  // P0 修复：irHash 必须是 srs-ir.json 的真实 hash，而非 sourceHash 的副本。
  // 旧代码设 irHash: sourceHash 使该字段形同虚设——无法检测"产物未随 IR 更新而过期"。
  const irHash = hashText(fs.readFileSync(path.join(workDir, 'srs-ir.json'), 'utf-8'));
  const startedAt = new Date().toISOString();
  const reportPath = path.join(artifactPath(workDir, ARTIFACT_PATHS.bddValidation), `${sourceHash}.json`);
  writeValidationReport(reportPath, {
    artifactKind: 'bdd', lifecycle: 'verified', sourcePaths: verifiedFiles, sourceHash, irHash,
    tools: strict ? [{ name: 'gherkin-lint', version: 'configured' }, { name: 'gherklin', version: 'configured' }] : [],
    startedAt, completedAt: new Date().toISOString(), passed: true,
    checks: [{ name: 'BDD structure', passed: true }, { name: 'strict validation', passed: strict }],
  });
```

需在文件顶部增加导入 `hashText`：

```typescript
// 旧：
import { hashFiles, writeValidationReport } from '../lib/artifacts/validation-report.js';
// 新：
import { hashFiles, hashText, writeValidationReport } from '../lib/artifacts/validation-report.js';
```

（若 `fs` 未导入则增加 `import * as fs from 'node:fs';`、`import * as path from 'node:path';`——通常已存在）

文件 `scripts/commands/validate-tla.ts`，将第 185-199 行类似修改：将 `irHash: sourceHash` 改为 `irHash: hashText(fs.readFileSync(path.join(workDir, 'srs-ir.json'), 'utf-8'))`，并确保 `startedAt` 变量已在该位置之前定义（当前代码 `startedAt` 在第 168 行附近已定义，可复用）。

文件 `scripts/commands/validate-lean.ts`，将第 83-92 行类似修改：将 `irHash: sourceHash` 改为真实 IR hash。注意 `startedAt` 在该文件第 73 行附近已定义。

- [ ] **Step 5: 在 checks-final.ts 增加伪造报告检测函数**

在 `scripts/lib/verify-gate/checks-final.ts` 的 `checkFormalArtifacts` 函数之前（约第 187 行）插入两个新函数：

```typescript
/**
 * P0: 报告真实性检测。
 * 1. startedAt ≠ completedAt（0ms 假报告——真实工具运行至少有数毫秒延迟）
 * 2. irHash 匹配当前 srs-ir.json（产物未随 IR 更新而过期）
 * 只检查 passed=true 的 verified 报告。
 */
export function checkReportAuthenticity(workDir: string, kind: 'bdd' | 'tlaplus' | 'lean4'): CheckResult {
  const name = `${kind} report authenticity`;
  try {
    const config = {
      bdd: ARTIFACT_PATHS.bddValidation,
      tlaplus: ARTIFACT_PATHS.tlaValidation,
      lean4: ARTIFACT_PATHS.leanValidation,
    }[kind];
    const reportDir = artifactPath(workDir, config);
    if (!fs.existsSync(reportDir)) return { name, passed: true, detail: 'no validation reports (nothing to check)' };
    const currentIrHash = hashText(fs.readFileSync(path.join(workDir, 'srs-ir.json'), 'utf-8'));
    const issues: string[] = [];
    for (const file of fs.readdirSync(reportDir).filter(f => f.endsWith('.json'))) {
      try {
        const report = JSON.parse(fs.readFileSync(path.join(reportDir, file), 'utf-8')) as {
          artifactKind?: string; passed?: boolean; startedAt?: string; completedAt?: string; irHash?: string;
        };
        if (report.artifactKind !== kind || report.passed !== true) continue;
        if (report.startedAt === report.completedAt) {
          issues.push(`${file}: startedAt === completedAt (0ms — likely forged)`);
        }
        if (report.irHash !== currentIrHash) {
          issues.push(`${file}: irHash mismatch (artifact validated against stale IR)`);
        }
      } catch { /* skip malformed */ }
    }
    return { name, passed: issues.length === 0, detail: issues.length === 0 ? 'all reports authentic' : issues.join('; ') };
  } catch {
    return { name, passed: false, detail: 'srs-ir.json cannot be read' };
  }
}

/**
 * P0: verified:validation = 1:1 比例检查。
 * 每个 verified 产物文件必须对应一个 passed=true 的 validation 报告。
 * 缺报告意味着产物被提升但验证报告丢失或从未生成。
 */
export function checkReportArtifactRatio(workDir: string, kind: 'bdd' | 'tlaplus' | 'lean4'): CheckResult {
  const name = `${kind} verified:validation ratio`;
  const config = {
    bdd: { verified: ARTIFACT_PATHS.bddVerified, validation: ARTIFACT_PATHS.bddValidation, ext: '.feature' },
    tlaplus: { verified: ARTIFACT_PATHS.tlaVerified, validation: ARTIFACT_PATHS.tlaValidation, ext: '.tla' },
    lean4: { verified: ARTIFACT_PATHS.leanVerified, validation: ARTIFACT_PATHS.leanValidation, ext: '.lean' },
  }[kind];
  const verifiedRoot = artifactPath(workDir, config.verified);
  const validationDir = artifactPath(workDir, config.validation);
  if (!fs.existsSync(verifiedRoot)) return { name, passed: true, detail: 'no verified artifacts (nothing to check)' };
  const verifiedFiles = collectByExtension(verifiedRoot, config.ext);
  if (verifiedFiles.length === 0) return { name, passed: true, detail: 'no verified files' };
  if (!fs.existsSync(validationDir)) {
    return { name, passed: false, detail: `${verifiedFiles.length} verified file(s) but no validation report directory` };
  }
  const reports = readPassingReports(validationDir, kind);
  if (reports.length === 0) {
    return { name, passed: false, detail: `${verifiedFiles.length} verified file(s) but no passing validation report` };
  }
  // 每个 verified 文件的 sourceHash 应能在某个报告中找到
  const reportHashes = new Set<string>();
  for (const report of reports) reportHashes.add(report.sourceHash);
  const missing: string[] = [];
  for (const file of verifiedFiles) {
    const fileHash = hashFiles([file]);
    if (!reportHashes.has(fileHash)) missing.push(path.basename(file));
  }
  if (missing.length > 0) {
    return { name, passed: false, detail: `${missing.length} verified file(s) with no matching report: ${missing.join(', ')}` };
  }
  return { name, passed: true, detail: `${verifiedFiles.length} verified file(s) all have matching reports` };
}
```

需在 `checks-final.ts` 顶部增加导入 `hashText`：

```typescript
// 旧（第 5 行）：
import { collectByExtension, collectFiles, hashFiles, readMatchingReport, readPassingReports } from '../artifacts/validation-report.js';
// 新：
import { collectByExtension, collectFiles, hashFiles, hashText, readMatchingReport, readPassingReports } from '../artifacts/validation-report.js';
```

修改 `checkFormalArtifacts` 函数，在返回数组中增加两个新检查：

```typescript
// 旧（第 191-199 行）：
    return [
      verifiedArtifactCheck(workDir, 'bdd', true),
      tlaVerifiedCheck(workDir),
      leanVerifiedCheck(workDir),
      checkTlaCoverage(workDir),
      checkArch1Coverage(workDir),
    ];

// 新：
    return [
      verifiedArtifactCheck(workDir, 'bdd', true),
      tlaVerifiedCheck(workDir),
      leanVerifiedCheck(workDir),
      checkTlaCoverage(workDir),
      checkArch1Coverage(workDir),
      // P0: 伪造报告检测
      checkReportAuthenticity(workDir, 'bdd'),
      checkReportAuthenticity(workDir, 'tlaplus'),
      checkReportAuthenticity(workDir, 'lean4'),
      checkReportArtifactRatio(workDir, 'bdd'),
      checkReportArtifactRatio(workDir, 'tlaplus'),
      checkReportArtifactRatio(workDir, 'lean4'),
    ];
```

**注意文件行数**：当前 214 行 + 新增约 80 行 = 约 294 行，仍在 300 行限制内。如超出，将 `checkReportAuthenticity` 和 `checkReportArtifactRatio` 拆到新文件 `checks-authenticity.ts`。

- [ ] **Step 6: 运行测试确认通过**

```bash
cd .claude/skills/srs-formalizer/scripts && npx tsx --test __tests__/checks-final-coverage.test.ts
```

Expected: PASS

- [ ] **Step 7: 全量回归**

```bash
cd .claude/skills/srs-formalizer/scripts && npx tsx --test __tests__/*.test.ts
```

Expected: 全部通过。注意：现有测试中如有 mock report 使用 `irHash: sourceHash`，需更新为 `irHash: hashText(irContent)` 或移除该字段（`readMatchingReport` 不检查 irHash，仅 `checkReportAuthenticity` 检查）。若回归失败，定位失败测试并修复 mock。

- [ ] **Step 8: tsc 类型检查**

```bash
cd .claude/skills/srs-formalizer/scripts && npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 9: 提交**

```bash
cd d:\srs_formalizer_opt\SRS-Formalizer
git add .claude/skills/srs-formalizer/scripts/commands/validate-bdd.ts .claude/skills/srs-formalizer/scripts/commands/validate-tla.ts .claude/skills/srs-formalizer/scripts/commands/validate-lean.ts .claude/skills/srs-formalizer/scripts/lib/verify-gate/checks-final.ts .claude/skills/srs-formalizer/scripts/__tests__/checks-final-coverage.test.ts
git -c commit.gpgsign=false commit -m "fix(validators): irHash must be real srs-ir.json hash, not sourceHash copy" -m "P0: validate-bdd/tla/lean now set irHash to hashText(srs-ir.json content)." -m "Adds checkReportAuthenticity (0ms + irHash mismatch) and checkReportArtifactRatio (1:1) to checks-final." -m "Wires both into checkFormalArtifacts so FINAL gate rejects forged/stale reports."
```

---

## Task 2: 反模式检测（遗漏 2，P0）

**问题：** `verify-gate` 无反模式检测：手动 `.cfg` 文件（绕过 validate-tla）、`/tmp` 临时脚本（绕过工作目录约束）、CHECKLIST 全勾但对应文件不存在。这些是报告 §3 指出的 Agent 主动破坏行为模式。

**Files:**
- Modify: `.claude/skills/srs-formalizer/scripts/lib/verify-gate/checks-final.ts`（新增 `checkAntiPatterns`）
- Modify: `.claude/skills/srs-formalizer/scripts/commands/verify-gate.ts`（FINAL 分支调用）
- Test: `.claude/skills/srs-formalizer/scripts/__tests__/checks-final-coverage.test.ts`

- [ ] **Step 1: 写失败测试**

在 `scripts/__tests__/checks-final-coverage.test.ts` 末尾追加：

```typescript
  // ===========================================================================
  // P0: Anti-pattern detection
  // ===========================================================================

  it('flags manual .cfg file in tlaplus/draft (bypassing validate-tla)', () => {
    const workDir = createWorkDir('manual-cfg');
    const draftDir = artifactPath(workDir, ARTIFACT_PATHS.tlaDraft);
    fs.mkdirSync(draftDir, { recursive: true });
    fs.writeFileSync(path.join(draftDir, 'Module.cfg'), 'INIT Init\n', 'utf-8');
    fs.writeFileSync(path.join(draftDir, 'Module.tla'), '---- MODULE Module ----\n====\n', 'utf-8');
    const result = checkAntiPatterns(workDir);
    assert.strictEqual(result.passed, false, `expected manual .cfg to fail, got: ${result.detail}`);
    assert.ok(result.detail.includes('cfg'), `detail should mention .cfg: ${result.detail}`);
  });

  it('flags /tmp script in workdir (bypassing path safety)', () => {
    const workDir = createWorkDir('tmp-script');
    fs.mkdirSync(path.join(workDir, 'tmp'), { recursive: true });
    fs.writeFileSync(path.join(workDir, 'tmp', 'hack.sh'), '#!/bin/bash\necho hacked\n', 'utf-8');
    const result = checkAntiPatterns(workDir);
    assert.strictEqual(result.passed, false, `expected /tmp script to fail, got: ${result.detail}`);
    assert.ok(result.detail.includes('tmp'), `detail should mention tmp: ${result.detail}`);
  });

  it('flags CHECKLIST all-checked but referenced file missing', () => {
    const workDir = createWorkDir('checklist-file-missing');
    // CHECKLIST says file exists (checked) but the actual file does NOT
    fs.mkdirSync(path.join(workDir, '6_outputs'), { recursive: true });
    fs.writeFileSync(path.join(workDir, '6_outputs', 'CHECKLIST.md'),
      '# S6\n- [x] `outputs/graphs/srs-graph.cypher` exists\n', 'utf-8');
    // Note: outputs/graphs/srs-graph.cypher does NOT exist
    const result = checkAntiPatterns(workDir);
    assert.strictEqual(result.passed, false, `expected missing file to fail, got: ${result.detail}`);
    assert.ok(result.detail.includes('cypher') || result.detail.includes('CHECKLIST'),
      `detail should mention the missing file or checklist: ${result.detail}`);
  });

  it('passes when no anti-patterns detected', () => {
    const workDir = createWorkDir('clean-workdir');
    fs.mkdirSync(path.join(workDir, '6_outputs'), { recursive: true });
    fs.writeFileSync(path.join(workDir, '6_outputs', 'CHECKLIST.md'),
      '# S6\n- [ ] pending\n', 'utf-8');
    const result = checkAntiPatterns(workDir);
    assert.strictEqual(result.passed, true, `expected clean workdir to pass, got: ${result.detail}`);
  });
```

并在测试文件顶部导入增加 `checkAntiPatterns`：

```typescript
import { checkReportAuthenticity, checkReportArtifactRatio, checkAntiPatterns } from '../lib/verify-gate/checks-final.js';
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd .claude/skills/srs-formalizer/scripts && npx tsx --test __tests__/checks-final-coverage.test.ts
```

Expected: FAIL — `checkAntiPatterns` 未导出

- [ ] **Step 3: 实现 checkAntiPatterns**

在 `scripts/lib/verify-gate/checks-final.ts` 的 `checkReportArtifactRatio` 之后插入：

```typescript
/**
 * P0: 反模式检测——检测 Agent 主动绕过门禁的行为模式。
 * 1. draft/ 中的 .cfg 文件（.cfg 应由 validate-tla 从模板复制，不应在 draft 中手写）
 * 2. /tmp 或 tmp/ 脚本目录（绕过工作目录约束）
 * 3. CHECKLIST 全勾但引用的产物文件不存在
 */
export function checkAntiPatterns(workDir: string): CheckResult {
  const name = 'anti-pattern detection';
  const issues: string[] = [];

  // 1. draft/ 中的 .cfg 文件
  const tlaDraftDir = artifactPath(workDir, ARTIFACT_PATHS.tlaDraft);
  if (fs.existsSync(tlaDraftDir)) {
    for (const file of collectByExtension(tlaDraftDir, '.cfg')) {
      issues.push(`manual .cfg in draft/ (bypassing validate-tla): ${path.basename(file)}`);
    }
  }

  // 2. /tmp 或 tmp/ 脚本目录
  const tmpDir = path.join(workDir, 'tmp');
  if (fs.existsSync(tmpDir) && fs.statSync(tmpDir).isDirectory()) {
    const scripts = fs.readdirSync(tmpDir).filter(f => /\.(sh|ps1|bat|py|js|ts)$/.test(f));
    if (scripts.length > 0) {
      issues.push(`tmp/ directory contains scripts (bypassing workdir scope): ${scripts.join(', ')}`);
    }
  }

  // 3. CHECKLIST 全勾但引用的产物文件不存在
  const checklistDirs = ['6_outputs'];
  for (const dir of checklistDirs) {
    const checklistPath = path.join(workDir, dir, 'CHECKLIST.md');
    if (!fs.existsSync(checklistPath)) continue;
    const content = fs.readFileSync(checklistPath, 'utf-8');
    // 匹配 `- [x] \`path\`` 模式
    const checkedRefs = content.matchAll(/-\s*\[x\]\s*`([^`]+)`/g);
    for (const match of checkedRefs) {
      const refPath = match[1];
      // 跳过非文件引用（如命令名）
      if (refPath.includes(' ') || !(/[./]/.test(refPath))) continue;
      const fullPath = path.join(workDir, refPath);
      if (!fs.existsSync(fullPath)) {
        issues.push(`CHECKLIST checked but file missing: ${refPath}`);
      }
    }
  }

  return { name, passed: issues.length === 0, detail: issues.length === 0 ? 'no anti-patterns detected' : issues.join('; ') };
}
```

修改 `checkFormalArtifacts` 函数，在数组末尾增加：

```typescript
      checkReportArtifactRatio(workDir, 'lean4'),
      // P0: 反模式检测
      checkAntiPatterns(workDir),
    ];
```

**注意文件行数**：Task 1 后约 294 行 + 本次约 45 行 = 约 339 行，超出 300 行限制。

**解决方案**：将 `checkReportAuthenticity`、`checkReportArtifactRatio`、`checkAntiPatterns` 三个函数从 `checks-final.ts` 拆到新文件 `scripts/lib/verify-gate/checks-authenticity.ts`，并在 `checks-final.ts` 中 re-export。

拆分步骤：
1. 创建 `scripts/lib/verify-gate/checks-authenticity.ts`，将三个函数及其依赖导入移入
2. 在 `checks-final.ts` 顶部增加 `export { checkReportAuthenticity, checkReportArtifactRatio, checkAntiPatterns } from './checks-authenticity.js';`
3. 删除 `checks-final.ts` 中这三个函数的原始定义

- [ ] **Step 4: 运行测试确认通过**

```bash
cd .claude/skills/srs-formalizer/scripts && npx tsx --test __tests__/checks-final-coverage.test.ts
```

Expected: PASS

- [ ] **Step 5: 全量回归 + tsc**

```bash
cd .claude/skills/srs-formalizer/scripts && npx tsx --test __tests__/*.test.ts
cd .claude/skills/srs-formalizer/scripts && npx tsc --noEmit
```

Expected: 全部通过，0 errors

- [ ] **Step 6: 提交**

```bash
cd d:\srs_formalizer_opt\SRS-Formalizer
git add .claude/skills/srs-formalizer/scripts/lib/verify-gate/checks-final.ts .claude/skills/srs-formalizer/scripts/lib/verify-gate/checks-authenticity.ts .claude/skills/srs-formalizer/scripts/__tests__/checks-final-coverage.test.ts
git -c commit.gpgsign=false commit -m "feat(verify-gate): add anti-pattern detection (manual .cfg, /tmp scripts, CHECKLIST-file mismatch)" -m "P0: checks-final now detects 3 Agent bypass patterns." -m "Extracts authenticity + anti-pattern checks to checks-authenticity.ts to stay under 300-line limit."
```

---

## Task 3: R3 关系 ingest 直接检查 + r3-relational 最低阈值（遗漏 3，P1）

**问题：** `checks-r3.ts` 有 `checkR2R3Ingest`（节点级）和 `checkEdgeTypeDiversity`（间接），但无直接检查 R3-relational JSONL 的 `metadata.relation` 是否转化为 IR edges，也无 r3-relational 记录数最低阈值（仅有"目录非空"检查）。

**Files:**
- Modify: `.claude/skills/srs-formalizer/scripts/lib/verify-gate/checks-r3.ts`（新增 `checkR3RelationIngest` + `checkR3RelationalThreshold`）
- Modify: `.claude/skills/srs-formalizer/scripts/commands/verify-gate.ts`（R3 分支调用）
- Test: `.claude/skills/srs-formalizer/scripts/__tests__/verify-gate.test.ts`

- [ ] **Step 1: 写失败测试**

在 `scripts/__tests__/verify-gate.test.ts` 末尾追加（在最后一个 `});` 之前）：

```typescript
  // ===========================================================================
  // P1: R3 relation ingest + r3-relational threshold
  // ===========================================================================

  it('flags R3 relations not ingested into IR edges', () => {
    const workDir = createWorkDir('r3-relations-missing');
    // r3-relational JSONL has 3 relations
    writeJsonl(path.join(workDir, '2_extract', 'r3-relational'), 'a.jsonl', [
      { id: 'R3-REL-0001', category: 'relational', statement: 'A depends on B',
        source_file: 'srs.md', confidence: 'high',
        metadata: { relation: { type: 'depends_on', target: 'R1-REQ-0002' }, source_id: 'R1-REQ-0001' } },
      { id: 'R3-REL-0002', category: 'relational', statement: 'C refines D',
        source_file: 'srs.md', confidence: 'high',
        metadata: { relation: { type: 'refines', target: 'R1-REQ-0004' }, source_id: 'R1-REQ-0003' } },
    ]);
    // IR has NO edges — relations were not ingested
    fs.writeFileSync(path.join(workDir, 'srs-ir.json'), JSON.stringify({
      version: '2.1.0', nodes: [
        { id: 'R1-REQ-0001', kind: 'requirement', statement: 'A', module: 'S001' },
        { id: 'R1-REQ-0002', kind: 'requirement', statement: 'B', module: 'S001' },
        { id: 'R1-REQ-0003', kind: 'requirement', statement: 'C', module: 'S001' },
        { id: 'R1-REQ-0004', kind: 'requirement', statement: 'D', module: 'S001' },
      ], edges: [], crossRefs: [], nfrProfile: { detectedCategories: [] },
      gaps: [], glossary: {}, meta: { buildTimestamp: new Date().toISOString() },
    }), 'utf-8');
    const { checkR3RelationIngest } = await import('../lib/verify-gate/checks-r3.js');
    const result = checkR3RelationIngest(workDir);
    assert.strictEqual(result.passed, false, `expected missing relations to fail, got: ${result.detail}`);
    assert.ok(result.detail.includes('relation'), `detail should mention relations: ${result.detail}`);
  });

  it('passes when R3 relations are in IR edges', () => {
    const workDir = createWorkDir('r3-relations-present');
    writeJsonl(path.join(workDir, '2_extract', 'r3-relational'), 'a.jsonl', [
      { id: 'R3-REL-0001', category: 'relational', statement: 'A depends on B',
        source_file: 'srs.md', confidence: 'high',
        metadata: { relation: { type: 'depends_on', target: 'R1-REQ-0002' }, source_id: 'R1-REQ-0001' } },
    ]);
    fs.writeFileSync(path.join(workDir, 'srs-ir.json'), JSON.stringify({
      version: '2.1.0', nodes: [
        { id: 'R1-REQ-0001', kind: 'requirement', statement: 'A', module: 'S001' },
        { id: 'R1-REQ-0002', kind: 'requirement', statement: 'B', module: 'S001' },
      ], edges: [
        { id: 'e1', type: 'depends_on', source: 'R1-REQ-0001', target: 'R1-REQ-0002' },
      ], crossRefs: [], nfrProfile: { detectedCategories: [] },
      gaps: [], glossary: {}, meta: { buildTimestamp: new Date().toISOString() },
    }), 'utf-8');
    const { checkR3RelationIngest } = await import('../lib/verify-gate/checks-r3.js');
    const result = checkR3RelationIngest(workDir);
    assert.strictEqual(result.passed, true, `expected present relations to pass, got: ${result.detail}`);
  });

  it('flags r3-relational below minimum threshold (< 3 records when R1 has > 10)', () => {
    const workDir = createWorkDir('r3-threshold-fail');
    // R1 has 15 records
    const r1Records = Array.from({ length: 15 }, (_, i) => ({
      id: `R1-REQ-${String(i + 1).padStart(4, '0')}`, category: 'explicit',
      statement: `req ${i}`, source_file: 'srs.md', confidence: 'high',
    }));
    writeJsonl(path.join(workDir, '2_extract', 'r1-explicit'), 'a.jsonl', r1Records);
    // r3-relational has only 1 record (< 3 threshold)
    writeJsonl(path.join(workDir, '2_extract', 'r3-relational'), 'a.jsonl', [
      { id: 'R3-REL-0001', category: 'relational', statement: 'A depends on B',
        source_file: 'srs.md', confidence: 'high',
        metadata: { relation: { type: 'depends_on', target: 'R1-REQ-0002' }, source_id: 'R1-REQ-0001' } },
    ]);
    const { checkR3RelationalThreshold } = await import('../lib/verify-gate/checks-r3.js');
    const result = checkR3RelationalThreshold(workDir);
    assert.strictEqual(result.passed, false, `expected low r3 count to fail, got: ${result.detail}`);
  });
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd .claude/skills/srs-formalizer/scripts && npx tsx --test __tests__/verify-gate.test.ts
```

Expected: FAIL — `checkR3RelationIngest` / `checkR3RelationalThreshold` 未导出

- [ ] **Step 3: 实现两个新检查函数**

在 `scripts/lib/verify-gate/checks-r3.ts` 末尾（最后一个 `export function` 之后）追加：

```typescript
/**
 * P1: R3 关系 ingest 直接检查。
 * 扫描 2_extract/r3-relational/*.jsonl 中的 metadata.relation，
 * 验证每条 relation 是否在 srs-ir.json 的 edges 中有对应项。
 * 100% 缺失或 >50% 丢失意味着 R3 关系提取结果未进入 IR。
 */
export function checkR3RelationIngest(workDir: string): CheckResult {
  const name = 'r3-relation ingest';
  try {
    const r3Dir = path.join(workDir, '2_extract', 'r3-relational');
    if (!fs.existsSync(r3Dir)) return { name, passed: true, detail: 'no r3-relational directory (nothing to check)' };
    const ir = JSON.parse(fs.readFileSync(path.join(workDir, 'srs-ir.json'), 'utf8')) as { edges?: Array<{ type?: string; source?: string; target?: string }> };
    const irEdges = Array.isArray(ir.edges) ? ir.edges : [];
    // 构建 IR edge 集合 (source, type, target)
    const edgeSet = new Set<string>();
    for (const edge of irEdges) {
      if (edge.source && edge.target && edge.type) {
        edgeSet.add(`${edge.source}|${edge.type}|${edge.target}`);
      }
    }
    let totalRelations = 0;
    let missingRelations = 0;
    for (const file of listJsonlFiles(r3Dir, workDir)) {
      for (const record of readJsonl(file, workDir)) {
        const relation = (record as { metadata?: { relation?: { type?: string; target?: string }; source_id?: string } }).metadata?.relation;
        if (!relation || !relation.type || !relation.target) continue;
        const sourceId = (record as { metadata?: { source_id?: string } }).metadata?.source_id ?? (record as { id?: string }).id;
        if (!sourceId) continue;
        totalRelations++;
        const key = `${sourceId}|${relation.type}|${relation.target}`;
        if (!edgeSet.has(key)) missingRelations++;
      }
    }
    if (totalRelations === 0) return { name, passed: true, detail: 'no relations in r3-relational JSONL' };
    if (missingRelations === totalRelations) {
      return { name, passed: false, detail: `all ${totalRelations} r3 relation(s) missing from IR edges (ingest completely failed)` };
    }
    const lossRate = missingRelations / totalRelations;
    if (lossRate > 0.5) {
      return { name, passed: false, detail: `${missingRelations}/${totalRelations} r3 relation(s) missing from IR edges (${(lossRate * 100).toFixed(1)}% loss)` };
    }
    return { name, passed: true, detail: `${totalRelations - missingRelations}/${totalRelations} r3 relation(s) ingested into IR edges` };
  } catch {
    return { name, passed: false, detail: 'srs-ir.json cannot be read' };
  }
}

/**
 * P1: r3-relational 最低阈值。
 * 当 R1 记录数 > 10 时，r3-relational 至少应有 3 条记录。
 * 阈值以下意味着关系提取不充分（大量需求但很少关系）。
 */
export function checkR3RelationalThreshold(workDir: string): CheckResult {
  const name = 'r3-relational minimum threshold';
  const r1Dir = path.join(workDir, '2_extract', 'r1-explicit');
  const r3Dir = path.join(workDir, '2_extract', 'r3-relational');
  let r1Count = 0;
  if (fs.existsSync(r1Dir)) {
    for (const file of listJsonlFiles(r1Dir, workDir)) {
      r1Count += readJsonl(file, workDir).length;
    }
  }
  if (r1Count <= 10) return { name, passed: true, detail: `R1 has ${r1Count} records (threshold check skipped for small sets)` };
  let r3Count = 0;
  if (fs.existsSync(r3Dir)) {
    for (const file of listJsonlFiles(r3Dir, workDir)) {
      r3Count += readJsonl(file, workDir).length;
    }
  }
  const minThreshold = 3;
  if (r3Count < minThreshold) {
    return { name, passed: false, detail: `r3-relational has only ${r3Count} record(s) but R1 has ${r1Count} (minimum ${minThreshold} relations expected for >10 R1 records)` };
  }
  return { name, passed: true, detail: `r3-relational has ${r3Count} record(s) (≥ ${minThreshold} threshold)` };
}
```

注意：需确认 `listJsonlFiles` 和 `readJsonl` 已在 `checks-r3.ts` 中导入（通常从 `../jsonl.js` 导入）。若未导入，在文件顶部增加：

```typescript
import { listJsonlFiles, readJsonl } from '../jsonl.js';
```

- [ ] **Step 4: 在 verify-gate.ts 的 R3 分支中调用新检查**

文件 `scripts/commands/verify-gate.ts`，找到 R3 检查块（约第 82-94 行的 `if (stageArg === 'R3' || stageArg === 'FINAL')` 块），在现有 R3 检查之后增加：

```typescript
  // P1: R3 relation ingest + threshold
  if (stageArg === 'R3' || stageArg === 'FINAL') {
    allChecks.push(checkR3RelationIngest(workDir));
    allChecks.push(checkR3RelationalThreshold(workDir));
  }
```

并在文件顶部导入增加：

```typescript
import { checkR3RelationIngest, checkR3RelationalThreshold } from '../lib/verify-gate/checks-r3.js';
```

（具体导入行号需查看现有 `checks-r3.ts` 导入语句）

- [ ] **Step 5: 运行测试确认通过**

```bash
cd .claude/skills/srs-formalizer/scripts && npx tsx --test __tests__/verify-gate.test.ts
```

Expected: PASS

- [ ] **Step 6: 全量回归 + tsc + 提交**

```bash
cd .claude/skills/srs-formalizer/scripts && npx tsx --test __tests__/*.test.ts
cd .claude/skills/srs-formalizer/scripts && npx tsc --noEmit
cd d:\srs_formalizer_opt\SRS-Formalizer
git add .claude/skills/srs-formalizer/scripts/lib/verify-gate/checks-r3.ts .claude/skills/srs-formalizer/scripts/commands/verify-gate.ts .claude/skills/srs-formalizer/scripts/__tests__/verify-gate.test.ts
git -c commit.gpgsign=false commit -m "feat(verify-gate): add R3 relation ingest check + r3-relational threshold" -m "P1: checkR3RelationIngest directly verifies r3-relational JSONL relations appear in IR edges." -m "checkR3RelationalThreshold requires ≥3 r3 records when R1 has >10 records."
```

---

## Task 4: AGENTS.md + SKILL.md 计数漂移修复（遗漏 4+5，P1）

**问题：** `AGENTS.md` 仍写 "22 commands (11+11)"，缺 `semantic-gate`；SKILL.md 正文 L519 写 "22 命令清单" 但 frontmatter 已是 23。

**Files:**
- Modify: `AGENTS.md:7,50,51,76`
- Modify: `.claude/skills/srs-formalizer/SKILL.md:519`

- [ ] **Step 1: 修复 AGENTS.md**

文件 `AGENTS.md`：

```typescript
// 旧（第 7 行）：
An AI agent skill that formalizes SRS documents into Cypher graphs, Gherkin BDD, TLA+ specs, and Lean 4 proofs. The actual code lives under `.claude/skills/srs-formalizer/scripts/`. The root is mostly docs and config.

**Architecture**: Agent-driven (Agent 驱动 + 脚本门禁). Scripts only do deterministic gate validation + specialized algorithms; all semantic work (parsing/extraction/analysis/generation) is done by Agent via SKILL.md + prompts + references. 22 commands: 11 Gate Validators + 11 Independent Tools. All artifacts derive from a single SRS-IR (`srs-ir.json`, v2.1.0).

// 新：
An AI agent skill that formalizes SRS documents into Cypher graphs, Gherkin BDD, TLA+ specs, and Lean 4 proofs. The actual code lives under `.claude/skills/srs-formalizer/scripts/`. The root is mostly docs and config.

**Architecture**: Agent-driven (Agent 驱动 + 脚本门禁). Scripts only do deterministic gate validation + specialized algorithms; all semantic work (parsing/extraction/analysis/generation) is done by Agent via SKILL.md + prompts + references. 23 commands: 11 Gate Validators + 12 Independent Tools. All artifacts derive from a single SRS-IR (`srs-ir.json`, v2.1.0).
```

```typescript
// 旧（第 50 行）：
├── index.ts             # CLI entrypoint (registry pattern, 22 commands)
├── commands/            # 22 commands (11 gate validators + 11 tools), all ≤300 lines

// 新：
├── index.ts             # CLI entrypoint (registry pattern, 23 commands)
├── commands/            # 23 commands (11 gate validators + 12 tools), all ≤300 lines
```

```typescript
// 旧（第 76 行）：
| Independent Tools | `assemble-ir`, `check-connectivity`, `analyze-dataflow`, `build-rid-mapping`, `analyze-fidelity`, `validate-convergence-log`, `query-graph`, `hash-compute`, `tlc-trace-parse`, `verify-skill-integrity`, `pack-skill` |

// 新：
| Independent Tools | `assemble-ir`, `check-connectivity`, `analyze-dataflow`, `build-rid-mapping`, `analyze-fidelity`, `validate-convergence-log`, `query-graph`, `hash-compute`, `tlc-trace-parse`, `verify-skill-integrity`, `pack-skill`, `semantic-gate` |
```

- [ ] **Step 2: 修复 SKILL.md L519**

文件 `.claude/skills/srs-formalizer/SKILL.md`：

```typescript
// 旧（第 519 行）：
> **Agent 注意**：所有命令必须通过 `npx tsx index.ts <command>` 调用。参数值禁止使用 `undefined`、`null`、`NaN` 等占位符。所有 22 命令清单以 `index.ts` 注册表为唯一来源。

// 新：
> **Agent 注意**：所有命令必须通过 `npx tsx index.ts <command>` 调用。参数值禁止使用 `undefined`、`null`、`NaN` 等占位符。所有 23 命令清单以 `index.ts` 注册表为唯一来源。
```

- [ ] **Step 3: 提交**

```bash
cd d:\srs_formalizer_opt\SRS-Formalizer
git add AGENTS.md .claude/skills/srs-formalizer/SKILL.md
git -c commit.gpgsign=false commit -m "docs: fix command count drift (22→23) in AGENTS.md and SKILL.md" -m "P1: AGENTS.md now lists 23 commands (11+12) including semantic-gate." -m "SKILL.md L519 body text aligned with frontmatter stage_gates."
```

---

## Task 5: executor-bdd.md 语义指导强化（遗漏 10，P1）

**问题：** `executor-bdd.md` 无状态转换建模指导、@RID 标签无生成规范、NFR 阈值未显式要求"可追溯到 SRS 设计事实"。

**Files:**
- Modify: `.claude/skills/srs-formalizer/prompts/executor-bdd.md`

- [ ] **Step 1: 在 executor-bdd.md 适当位置（复述检测章节之后）追加三个新章节**

在文件中找到「Then 铁律」章节之后（约第 108 行后），追加：

```markdown
## 状态转换建模（P2-15）

BDD 不只是需求复述——每个 Scenario 应描述一个**状态转换**：从初始状态（Given）经触发事件（When）到达终态（Then）。

### 建模规则

1. **Given 枚举影响当前场景的全部系统状态变量**——不仅是前置条件，还包括相关数据实体的初始值、权限状态、并发状态
2. **When 绑定具体触发事件**——不是"用户操作"而是"用户点击提交按钮"或"系统收到外部回调"
3. **Then 断言终态**——转换后的系统状态，而非需求原文复述
4. **跨 Scenario 的状态延续**——若 Scenario B 依赖 Scenario A 的副作用，用 `# TRACE: depends-on <ScenarioA>` 标注

### 状态机视角

每个 arch-1 子系统应有一组 Scenario 覆盖其状态机的：
- 正常转换（happy path）
- 守卫失败（precondition 不满足）
- 状态不变（idempotent 操作）
- 异常转换（错误恢复）

## @RID 追溯标签规范（P2-15）

每个 Scenario 必须标注 @RID 标签，建立 BDD → IR 需求的双向追溯。

### 标签格式

```
@RID-BDD-<子系统名>-<需求编号>-<场景序号>
```

示例：
- `@RID-BDD-AuthService-REQ-0001-001`（AuthService 子系统 REQ-0001 的第 1 个场景）
- `@RID-BDD-PaymentService-REQ-0003-002`（PaymentService 子系统 REQ-0003 的第 2 个场景）

### 标注规则

1. **每个 Scenario 至少一个 @RID 标签**——对应其覆盖的 IR 需求节点 id
2. **一个 Scenario 覆盖多个需求时**——用多个 @RID 标签
3. **否定场景（边界/异常）**——标注其验证的需求编号 + `-NEG` 后缀
4. **Feature 文件头部**——用 `# TRACE: <IR-NODE id>` 标注该 Feature 覆盖的 arch-1 子系统

### 生成时机

@RID 标签在 B2 executor 生成 .feature 文件时写入，不是事后补录。`validate-bdd --strict` 会检查 @RID 标签存在性。

## NFR 阈值设计事实溯源（P2-15）

NFR 场景中的数值阈值**必须可追溯到 SRS 原始设计事实**，禁止凭空发明具体数字。

### 规则

1. **阈值来源优先级**：
   - SRS 原文显式数值（如"响应时间 ≤ 200ms"）→ 直接引用
   - IR-NODE statement 中的数值 → 引用并标注 `# SOURCE: IR-NODE <id>`
   - SRS 未定义阈值 → 用 `<THRESHOLD>` 标记待补，**禁止自行编造数字**

2. **禁止的凭空数字**（反例）：
   - ❌ `Then 响应时间 ≤ 2000ms`（SRS 未提及 2000ms，Agent 编造）
   - ❌ `Then 超时时间为 30000ms`（SRS 未提及 30000ms，Agent 编造）
   - ✅ `Then 响应时间 ≤ 200ms`（SRS 原文有此数值）
   - ✅ `Then 响应时间 ≤ <THRESHOLD>ms`（SRS 未定义，标记待补）

3. **反向验证**：当 IR-NODE statement 中已含某数字时，executor 必须验证该数字是否真有 SRS 设计依据。若该数字来自 LLM 推测而非 SRS 原文，用 `<THRESHOLD>` 标记并记录在 GAPS.md。
```

- [ ] **Step 2: 提交**

```bash
cd d:\srs_formalizer_opt\SRS-Formalizer
git add .claude/skills/srs-formalizer/prompts/executor-bdd.md
git -c commit.gpgsign=false commit -m "feat(prompt): add state-transition modeling, @RID tags, NFR threshold traceability to executor-bdd" -m "P1: adds 3 sections — state-transition modeling rules, @RID tag format/generation, NFR threshold design-fact tracing." -m "Prohibits invented numbers (e.g. 2000ms/30000ms) without SRS source."
```

---

## Task 6: 参考文档覆盖空白（遗漏 6+7，P2）

**问题：** `artifact-contract-cheatsheet.md` 和 `ir-schema-reference.md` 均未文档化 `startLine`/`endLine` 应为行级（非整分片范围）和 IR `module` 字段应为子系统名（非源文件路径）。

**Files:**
- Modify: `.claude/skills/srs-formalizer/references/artifact-contract-cheatsheet.md`
- Modify: `.claude/skills/srs-formalizer/references/ir-schema-reference.md`

- [ ] **Step 1: 在 artifact-contract-cheatsheet.md 的「易混淆点警示」章节追加两项**

找到文件中 §5「易混淆点警示」章节（约第 103-108 行），在现有 4 项之后追加：

```markdown
5. **`startLine`/`endLine` 应为行级精度**——指向 SRS 源文件中该需求所在的**具体行号**（如 `startLine: 42, endLine: 45`），不是整个 shard 的行范围（如 `startLine: 1, endLine: 200`）。整分片范围会使多个需求共享同一 source，无法精确定位。

6. **IR 节点 `module` 字段应为子系统名**——填写 arch-1 子系统名（如 `AuthService`、`PaymentService`），不是源文件路径（如 `srs.md`）或 shard id（如 `S005`）。子系统名来源：architecture JSONL 的 `contains` 关系或 shard_index 的 module 映射。`assemble-ir` 在无 architecture 信息时用 `shard_id` 作为占位，Middle-end M5 应替换为真实子系统名。
```

- [ ] **Step 2: 在 ir-schema-reference.md 的 IRNode 定义处补充语义说明**

找到 IRNode 接口定义（约第 29-37 行），在 `module` 字段后增加注释：

```markdown
### IRNode

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 唯一标识（R1-REQ-NNNN / R2-IMP-NNNN / R3-REL-NNNN / ARCH-SYS-NNN） |
| kind | string | `requirement` / `architecture` / `data_entity` / `glossary` |
| statement | string | 需求/架构陈述文本 |
| module | string | **arch-1 子系统名**（如 `AuthService`），不是源文件路径。来源：architecture JSONL 的 `contains` 关系。`assemble-ir` 在无 architecture 信息时用 `shard_id` 占位 |
| ... | ... | ... |
```

在 IRSource 接口定义处（约第 63-66 行）补充：

```markdown
### IRSource

| 字段 | 类型 | 说明 |
|------|------|------|
| filePath | string | SRS 源文件相对路径 |
| startLine | number | **行级精度**——该需求在源文件中的起始行号（非 shard 起始行） |
| endLine | number | **行级精度**——该需求在源文件中的结束行号（非 shard 结束行） |
| shardId | string | 所属 shard id（SNNN） |
| chapter | string | 所属章节标题 |
```

- [ ] **Step 3: 提交**

```bash
cd d:\srs_formalizer_opt\SRS-Formalizer
git add .claude/skills/srs-formalizer/references/artifact-contract-cheatsheet.md .claude/skills/srs-formalizer/references/ir-schema-reference.md
git -c commit.gpgsign=false commit -m "docs: document startLine/endLine granularity and module field semantics" -m "P2: artifact-contract-cheatsheet adds 2 confusion-point warnings." -m "ir-schema-reference annotates module=startsystem name, startLine/endLine=line-level precision."
```

---

## Task 7: GAPS.md.template Backend 章节 + 6_outputs_CHECKLIST.md 路径统一（遗漏 8+9，P2）

**问题：** `GAPS.md.template` 仅通用缺口表，无 Backend 专属缺口类型；`6_outputs_CHECKLIST.md` 混用 `outputs/` 和 `6_outputs/` 两种路径前缀。

**Files:**
- Modify: `.claude/skills/srs-formalizer/templates/GAPS.md.template`
- Modify: `.claude/skills/srs-formalizer/templates/checklists/6_outputs_CHECKLIST.md`

- [ ] **Step 1: 在 GAPS.md.template 追加 Backend gaps 章节**

在文件末尾追加：

```markdown

## Backend 缺口（形式化阶段专属）

Backend 阶段的缺口类型与 Frontend 不同——前者关注形式化产物的完整性与一致性。

| 类型 | 描述 | 检测时机 |
|------|------|---------|
| `lean-unverified` | security/compliance 需求触发了 Lean4 但 `lake build` 失败或平台不支持 | B4 `validate-lean` |
| `tla-coverage-gap` | arch-1 子系统缺少同名 TLA+ 模块 | B3 `verify-gate --stage B3` |
| `convergence-log-missing` | B7 收敛循环未记录日志或日志不完整 | B7 `validate-convergence-log` |
| `semantic-rejected` | `semantic-gate` 返回 REJECTED 但未修复 | B2/B3/B4 `semantic-gate` |
| `fidelity-weak` | `analyze-fidelity` 检测到跨产物弱化（需求→BDD→TLA→Lean 链路断裂） | B6 `analyze-fidelity --strict` |
| `partial-convergence` | 收敛循环超限后标记部分收敛 | B7 收敛循环 |

### 记录规范

Backend 缺口记录时必须包含：
- 受影响的 arch-1 子系统名
- 受影响的 IR 需求节点 id 列表
- 缺口类型（上表枚举）
- 残余风险描述
- 替代验证方案（如有）
- 责任人与确认时间
```

- [ ] **Step 2: 统一 6_outputs_CHECKLIST.md 路径前缀**

将 `6_outputs/` 前缀的 3 个引用改为 `outputs/`：

```markdown
// 旧（第 26-28 行）：
- [ ] `6_outputs/brainstorming/brainstorm_context.json` 存在
- [ ] `6_outputs/deliverables.md` 存在
- [ ] `6_outputs/convergence-log.jsonl` 记录完整（每次迭代均有日志）

// 新：
- [ ] `outputs/brainstorming/brainstorm_context.json` 存在
- [ ] `outputs/reports/deliverables.md` 存在
- [ ] `outputs/reports/convergence-log.jsonl` 记录完整（每次迭代均有日志）
```

**注意**：需确认 `outputs/brainstorming/` 和 `outputs/reports/` 是否为正确路径。根据 SKILL.md Bootstrap 章节，`outputs/` 下有 `reports/` 子目录，brainstorming 产物应放在 `outputs/brainstorming/` 或 `outputs/reports/brainstorming/`。以 SKILL.md 的 Bootstrap 目录结构为准。

- [ ] **Step 3: 提交**

```bash
cd d:\srs_formalizer_opt\SRS-Formalizer
git add .claude/skills/srs-formalizer/templates/GAPS.md.template .claude/skills/srs-formalizer/templates/checklists/6_outputs_CHECKLIST.md
git -c commit.gpgsign=false commit -m "feat(template): add Backend gaps section to GAPS.md + unify 6_outputs paths" -m "P2: GAPS.md.template adds 6 Backend gap types (lean-unverified, tla-coverage-gap, etc.)." -m "6_outputs_CHECKLIST.md paths unified to outputs/ prefix (was mixing outputs/ and 6_outputs/)."
```

---

## Task 8: bdd-coding-guide.md 补充语义指导（遗漏 11，P2）

**问题：** `bdd-coding-guide.md` 是纯 Gherkin 语法教程，无 @RID 追溯标签、状态转换建模、复述检测——这些是 executor-bdd.md 的高级指导但参考文档中缺失。

**Files:**
- Modify: `.claude/skills/srs-formalizer/references/bdd-coding-guide.md`

- [ ] **Step 1: 在 bdd-coding-guide.md 末尾追加「语义质量」章节**

在文件末尾追加：

```markdown

## 语义质量指导（SRS-Formalizer 专属）

本节是 SRS-Formalizer 技能在标准 Gherkin 语法之上增加的语义质量要求。`validate-bdd --strict` 会检查这些规则。

### @RID 追溯标签

SRS-Formalizer 要求每个 Scenario 标注 @RID 标签，建立 BDD → IR 需求的双向追溯。

**格式**：`@RID-BDD-<子系统名>-<需求编号>-<场景序号>`

```gherkin
@RID-BDD-AuthService-REQ-0001-001
Scenario: 用户使用有效凭证登录
  Given 用户在登录页面
  When 用户输入有效的用户名和密码并点击登录
  Then 系统显示用户主页
```

**规则**：
- 每个 Scenario 至少一个 @RID 标签
- 否定场景用 `-NEG` 后缀：`@RID-BDD-AuthService-REQ-0001-NEG-001`
- Feature 文件头部用 `# TRACE: <IR-NODE id>` 标注覆盖的子系统

### 状态转换建模

每个 Scenario 应描述一个状态转换：初始状态（Given）→ 触发事件（When）→ 终态（Then）。

**规则**：
- Given 枚举影响当前场景的全部系统状态变量
- When 绑定具体触发事件（不是"用户操作"而是"点击提交按钮"）
- Then 断言转换后的系统状态（不是需求原文复述）
- 跨 Scenario 依赖用 `# TRACE: depends-on <ScenarioA>` 标注

### 复述检测（Then 铁律）

`validate-bdd --strict` 会检测 Then 步骤是否复述需求原文。

**禁止**：
```gherkin
# ❌ 复述——Then 含「必须/应当/shall/must」且无否定
Then 系统必须支持用户登录
```

**正确**：
```gherkin
# ✅ 可观测断言——描述转换后的系统状态
Then 系统显示用户主页
And 用户会话已创建
```

**转换规则**：
- 「必须 X」/「shall X」→ `Then <X 发生后可观测的结果/状态/输出>`
- 「不得 Y」/「must not Y」→ `Then the system does not <Y>`
- 数值约束 → 精确数值断言（阈值必须来自 SRS 设计事实，禁止编造）

### NFR 阈值溯源

NFR 场景中的数值阈值必须可追溯到 SRS 原始设计事实：

- ✅ `Then 响应时间 ≤ 200ms`（SRS 原文有此数值）
- ✅ `Then 响应时间 ≤ <THRESHOLD>ms`（SRS 未定义，标记待补）
- ❌ `Then 响应时间 ≤ 2000ms`（SRS 未提及 2000ms，Agent 编造）
```

- [ ] **Step 2: 提交**

```bash
cd d:\srs_formalizer_opt\SRS-Formalizer
git add .claude/skills/srs-formalizer/references/bdd-coding-guide.md
git -c commit.gpgsign=false commit -m "docs(bdd-guide): add semantic quality section (@RID, state modeling, restatement, NFR)" -m "P2: bdd-coding-guide.md adds SRS-Formalizer-specific semantic guidance." -m "Aligns reference doc with executor-bdd.md prompt requirements."
```

---

## 全量回归与合并

- [ ] **Step 1: Windows 全量回归**

```bash
cd d:\srs_formalizer_opt\SRS-Formalizer\.claude\skills\srs-formalizer\scripts
npx tsx --test __tests__\*.test.ts
```

Expected: 全部通过（预期 404 + Task 1 新增 4 + Task 2 新增 4 + Task 3 新增 3 = 415 测试）

- [ ] **Step 2: tsc 类型检查**

```bash
cd .claude\skills\srs-formalizer\scripts
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 3: WSL2 全量回归**

```bash
wsl bash -c "cd /mnt/d/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts && ./node_modules/.bin/tsx --test __tests__/*.test.ts"
```

Expected: 全部通过

- [ ] **Step 4: 合并到 main**

```bash
cd d:\srs_formalizer_opt\SRS-Formalizer
git checkout main
git merge fix/srs-formalizer-audit-followup --no-ff -m "merge: SRS-Formalizer 审计后续修复（11 项遗漏：2 P0 + 3 P1 + 6 P2）" -m "Task 1-8 覆盖伪造报告检测、反模式检测、R3 关系 ingest、计数漂移、BDD 语义指导、参考文档、模板、路径统一。" -m "全量回归通过（Windows + WSL2），tsc 0 errors。"
```

- [ ] **Step 5: 合并后验证**

```bash
cd .claude\skills\srs-formalizer\scripts
npx tsx --test __tests__\*.test.ts
```

Expected: 全部通过
