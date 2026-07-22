# SRS-Formalizer 第四轮审计后续修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复第四轮审计发现的 11 项遗漏（2 P0 + 4 P1 + 4 P2 + 1 新发现测试遗漏），消除 MANIFEST.json 失效、lib/checklists.ts 过时、CHECKLIST 模板引用已归档命令、测试期望过时等问题。

**Architecture:** P0 级修复优先——重建 MANIFEST.json 防止 --repair 覆盖代码，同步 lib/checklists.ts 防止 --repair 回退 CHECKLIST。P1 级修复 CHECKLIST 模板中的已归档命令引用和 Q 数量矛盾。P2 级修复死代码接入、测试期望更新、文件拆分。

**Tech Stack:** TypeScript (Node.js 22), node:test, tsx, PowerShell (Windows) + WSL2 (Linux)

---

## File Structure

- Modify: `MANIFEST.json` (重建)
- Modify: `scripts/lib/checklists.ts` (CHECKLISTS + CANONICAL 同步)
- Modify: `scripts/__tests__/index.test.ts` (EXPECTED_COMMANDS 19→23)
- Modify: `scripts/lib/verify-gate/checks-final.ts` (死代码接入)
- Modify: `templates/checklists/6_outputs_CHECKLIST.md` (Q1-Q13 + 移除归档命令)
- Modify: `templates/checklists/3_graph_CHECKLIST.md` (移除归档命令)
- Modify: `templates/checklists/4_bdd_CHECKLIST.md` (移除 behavior-graph)
- Modify: `examples/end-to-end-walkthrough.md` (更新归档命令)
- Create: `scripts/lib/verify-gate/checks-r3-relational.ts` (从 checks-r3.ts 拆分)
- Test: `scripts/__tests__/verify-gate.test.ts` (死代码接入后的回归)

---

## Task 1: 重建 MANIFEST.json（P0-1）

**Files:**
- Modify: `MANIFEST.json` (重建)
- Modify: `scripts/__tests__/verify-skill-integrity.test.ts` (增加 smoke test)

- [ ] **Step 1: 运行 pack-skill 重建 MANIFEST.json**

```bash
cd d:\srs_formalizer_opt\SRS-Formalizer\.claude\skills\srs-formalizer\scripts
npx tsx index.ts pack-skill --skill-dir . --force
```

Expected: MANIFEST.json 的 `packed_at` 更新为当前时间，`files` 数组反映当前磁盘真实文件。

- [ ] **Step 2: 验证 MANIFEST.json 不再含幽灵条目**

```bash
npx tsx index.ts verify-skill-integrity --skill-dir .
```

Expected: `valid: true`，0 missing files。

- [ ] **Step 3: 增加针对实际技能目录的 smoke test**

在 `scripts/__tests__/verify-skill-integrity.test.ts` 末尾（最后一个 `});` 之前）追加：

```typescript
  it('MANIFEST.json matches actual skill directory (smoke test)', () => {
    // 防止 MANIFEST.json 漂移：pack-skill 后应与磁盘一致
    const skillDir = path.resolve(__dirname, '../..');
    const { stdout } = runCli(`verify-skill-integrity --skill-dir "${skillDir}"`);
    const result = JSON.parse(stdout);
    assert.strictEqual(result.status, 'ok', `MANIFEST drift detected: ${result.message || ''}. Run pack-skill --force to rebuild.`);
  });
```

**IMPORTANT:** 检查 `runCli` helper 是否已在测试文件中定义（参考 `index.test.ts` 的 `runCli`）。如果不存在，使用 `execSync` 直接调用。同时确认 `__dirname` 在 ESM 下不可用——用 `import.meta.dirname` 或 `path.resolve(import.meta.dirname, '../..')`。

- [ ] **Step 4: 运行测试确认通过**

```bash
cd d:\srs_formalizer_opt\SRS-Formalizer\.claude\skills\srs-formalizer\scripts
npx tsx --test __tests__\verify-skill-integrity.test.ts
npx tsx --test __tests__\*.test.ts
npx tsc --noEmit
```

Expected: verify-skill-integrity.test.ts 全部通过（含新 smoke test），全量回归 417/417（+1），tsc 0 errors。

- [ ] **Step 5: 提交**

```bash
cd d:\srs_formalizer_opt\SRS-Formalizer
git add MANIFEST.json .claude/skills/srs-formalizer/scripts/__tests__/verify-skill-integrity.test.ts
git -c commit.gpgsign=false commit -m "fix(skill-integrity): rebuild MANIFEST.json + add smoke test" -m "P0: MANIFEST.json was stale (packed_at 2026-07-09, 814/930 ghost entries)." -m "pack-skill --force rebuilt; smoke test prevents future drift."
```

---

## Task 2: 同步 lib/checklists.ts 的 CHECKLISTS + CANONICAL（P0-2 + P2-10）

**Files:**
- Modify: `scripts/lib/checklists.ts` (CHECKLISTS 全部 6 阶段 + CANONICAL 全部 6 阶段)

- [ ] **Step 1: 更新 CHECKLISTS['3_graph'] — 移除已归档命令**

在 `scripts/lib/checklists.ts` 中，将 `CHECKLISTS['3_graph']`（约第 62-72 行）替换为：

```typescript
  '3_graph': `# S3 图谱构建 — 验收清单

- [ ] assemble-ir 成功：节点数 ≥ R1 显式需求数（自动生成 graph.merged.json）
- [ ] Agent 手动构建 + validate-architecture PASS：Module/Actor/Constraint 节点存在
- [ ] query-graph 完成：orphan/dangling/island 报告已生成（M1 Structure Analyzer）
- [ ] M5 Merge Optimizer 完成：补全建议已应用
- [ ] Agent 完成 duplicate/conflict/cluster 分析报告
- [ ] Agent 完成语义判定合并
- [ ] Agent 按 executor-backend-cypher.md 生成：outputs/graphs/srs-graph.cypher 非空
- [ ] validate-cypher PASS
- [ ] verify-gate --stage R3 PASS
- [ ] 图边完整性：每条边的 source/target 节点存在
`,
```

- [ ] **Step 2: 更新 CHECKLISTS['4_bdd'] — 移除已归档命令**

将 `CHECKLISTS['4_bdd']`（约第 73-81 行）替换为：

```typescript
  '4_bdd': `# S4 BDD 生成 — 验收清单（严格模式）

- [ ] validate-bdd --strict --promote 成功：feature 文件数 ≥ 模块数
- [ ] 每个 .feature 文件含 # SYSTEM: # TRACE: 头部标注
- [ ] 每个 Scenario 含 Given / When / Then
- [ ] 无 <THEN_PLACEHOLDER> 残留（gherkin-lint 严格模式）
- [ ] 无 GAP / TODO / FIXME / UNDEFINED 标记
- [ ] 无 TBD / 待定 / 未定义 / 待实现 文本
- [ ] 每个 Then 含 # verification_method: 标注
- [ ] validate-bdd PASS
- [ ] gherkin-lint 严格模式全部通过（20 条规则）
- [ ] Agent 按 executor-bdd.md 生成 + validate-bdd PASS
`,
```

- [ ] **Step 3: 更新 CHECKLISTS['5_formal'] — 补充 lake exe cache get**

将 `CHECKLISTS['5_formal']`（约第 82-95 行）替换为：

```typescript
  '5_formal': `# S5 形式化 — 验收清单

## TLA+（条件触发）
- [ ] 触发条件已确认（S0 Discovery）
- [ ] 工具链 Java+TLC 就绪
- [ ] TLC 验证：无死锁/无不变量违反/无状态爆炸
- [ ] SPECS.md 索引已更新

## Lean 4（条件触发）
- [ ] 触发条件已确认
- [ ] 工具链 elan+lake 就绪
- [ ] lake exe cache get 完成（Mathlib 缓存下载）
- [ ] lake build 通过：无 sorry/无告警/无 axiom
- [ ] validate-lean PASS：无同义反复（:= h / := by exact h / := trivial 等）
- [ ] PROOFS.md 索引已更新
`,
```

- [ ] **Step 4: 更新 CHECKLISTS['6_outputs'] — Q1-Q13 + 移除归档命令**

将 `CHECKLISTS['6_outputs']`（约第 96-104 行）替换为：

```typescript
  '6_outputs': `# S6 验收闸门 — 最终清单（含跨图一致性）

## 硬门禁
- [ ] verify-gate --stage FINAL：全部 PASS
- [ ] cross-graph-report.json: overall_converged: true

## 十三个根本问题（全部可回答）
- [ ] Q1 它是什么？（本质定义、核心定位）— 高置信度
- [ ] Q2 它做什么？（核心功能、主要作用）— 高置信度
- [ ] Q3 它能做什么？（具体能力、应用场景）— 高置信度
- [ ] Q4 它为什么可以这样？（技术原理、论文URL、开源URL，含Lean 4建模）— 中/高置信度
- [ ] Q5 能不能和其他软件/工具联合使用？（集成场景、联动能力）— 中/高置信度
- [ ] Q6 它的内部行为是怎样的（TLA+多层子系统建模）— 中/高置信度
- [ ] Q7 它与其他系统如何交互（BDD+TLA+联合建模）— 中/高置信度
- [ ] Q8 它与外部如何交互（BDD+TLA+联合建模）— 中/高置信度
- [ ] Q9 它的工作边界是什么（联合建模+边界条件）— 中/高置信度
- [ ] Q10 它的兜底方案是什么（降级、回滚、恢复）— 中/高置信度
- [ ] Q11 它的性能约束是什么（吞吐/延迟/资源）— 中/高置信度
- [ ] Q12 它的安全边界是什么（Lean 4 建模）— 中/高置信度
- [ ] Q13 它的容量扩展极限是什么（水平/垂直扩展）— 中/高置信度
- [ ] 高置信度 ≥ 9 / 13

## 产物完整性
- [ ] STATE.md 所有阶段 ✅
- [ ] MINDMAP.md 全部模块 ✅
- [ ] outputs/graphs/ 下 4 个 .cypher 文件存在
- [ ] outputs/reports/traceability.cypher 存在
- [ ] 6_outputs/brainstorming/brainstorm_context.json 存在
- [ ] outputs/reports/deliverables.md 存在
- [ ] outputs/reports/convergence-log.jsonl 记录完整
- [ ] 全链路 S1→S6 完整
`,
```

- [ ] **Step 5: 更新 CANONICAL['3_graph'] — 移除已归档命令的 required_phrases**

将 `CANONICAL['3_graph']`（约第 128-132 行）替换为：

```typescript
  '3_graph': {
    expected_count: 10,
    required_headers: ['S3', '图谱构建', '验收清单'],
    required_phrases: ['assemble-ir', 'validate-architecture', 'query-graph', 'validate-cypher', 'verify-gate', '边完整性'],
  },
```

- [ ] **Step 6: 更新 CANONICAL['4_bdd'] — 移除 emit --name gherkin**

将 `CANONICAL['4_bdd']`（约第 133-137 行）替换为：

```typescript
  '4_bdd': {
    expected_count: 10,
    required_headers: ['S4', 'BDD', '验收清单'],
    required_phrases: ['validate-bdd', '# SYSTEM:', 'Given', 'When', 'Then', 'THEN_PLACEHOLDER', 'verification_method', 'gherkin-lint'],
  },
```

- [ ] **Step 7: 更新 CANONICAL['5_formal'] — 补充 lake exe cache get**

将 `CANONICAL['5_formal']`（约第 138-142 行）替换为：

```typescript
  '5_formal': {
    expected_count: 10,
    required_headers: ['S5', '形式化', 'TLA+', 'Lean'],
    required_phrases: ['触发条件', '工具链', 'TLC', 'lake exe cache get', 'lake build', 'sorry', 'PROOFS.md'],
  },
```

- [ ] **Step 8: 更新 CANONICAL['6_outputs'] — Q1-Q13 + ≥9/13**

将 `CANONICAL['6_outputs']`（约第 143-147 行）替换为：

```typescript
  '6_outputs': {
    expected_count: 23,
    required_headers: ['S6', '验收闸门', '最终清单', '硬门禁', '根本问题', '产物完整性'],
    required_phrases: ['verify-gate', 'cross-graph-report', 'Q1', 'Q13', '≥ 9', 'STATE.md', 'MINDMAP.md', 'traceability.cypher', 'convergence-log'],
  },
```

- [ ] **Step 9: 运行测试确认通过**

```bash
cd d:\srs_formalizer_opt\SRS-Formalizer\.claude\skills\srs-formalizer\scripts
npx tsx --test __tests__\*.test.ts
npx tsc --noEmit
```

Expected: 417/417 pass（+0，因为 checklists.ts 内容变更不影响测试计数），tsc 0 errors。

**IMPORTANT:** 如果 `validate-checklist.test.ts` 因 CANONICAL 变更而失败，需要同步更新该测试的 fixture。读取测试文件，找到引用 `expected_count` 或 `required_phrases` 的断言，更新为新的期望值。

- [ ] **Step 10: 提交**

```bash
cd d:\srs_formalizer_opt\SRS-Formalizer
git add .claude/skills/srs-formalizer/scripts/lib/checklists.ts .claude/skills/srs-formalizer/scripts/__tests__/validate-checklist.test.ts
git -c commit.gpgsign=false commit -m "fix(checklists): sync lib/checklists.ts with templates (remove archived commands)" -m "P0: CHECKLISTS and CANONICAL were stale (v1.x), referenced 6+ archived commands." -m "All 6 stages updated; Q1-Q13 + >=9/13 threshold aligned with SKILL.md."
```

---

## Task 3: 修复 6_outputs_CHECKLIST.md 模板（P1-3 + P1-4）

**Files:**
- Modify: `templates/checklists/6_outputs_CHECKLIST.md`

- [ ] **Step 1: 移除 build-system-architecture 硬门禁**

在 `templates/checklists/6_outputs_CHECKLIST.md` 第 5 行，删除：

```markdown
- [ ] build-system-architecture: `converged: true`
```

保留第 4 行 `verify-gate --stage FINAL` 和第 6 行 `cross-graph-report.json`。

- [ ] **Step 2: 更新 Q1-Q10 → Q1-Q13**

将第 8-19 行（"## 十个根本问题" 到 "高置信度 ≥ 7 / 10"）替换为：

```markdown
## 十三个根本问题（全部可回答）
- [ ] Q1 它是什么？（本质定义、核心定位）— 高置信度
- [ ] Q2 它做什么？（核心功能、主要作用）— 高置信度
- [ ] Q3 它能做什么？（具体能力、应用场景）— 高置信度
- [ ] Q4 它为什么可以这样？（技术原理、论文URL、开源URL，含Lean 4建模）— 中/高置信度
- [ ] Q5 能不能和其他软件/工具联合使用？（集成场景、联动能力）— 中/高置信度
- [ ] Q6 它的内部行为是怎样的（TLA+多层子系统建模）— 中/高置信度
- [ ] Q7 它与其他系统如何交互（BDD+TLA+联合建模）— 中/高置信度
- [ ] Q8 它与外部如何交互（BDD+TLA+联合建模）— 中/高置信度
- [ ] Q9 它的工作边界是什么（联合建模+边界条件）— 中/高置信度
- [ ] Q10 它的兜底方案是什么（降级、回滚、恢复）— 中/高置信度
- [ ] Q11 它的性能约束是什么（吞吐/延迟/资源）— 中/高置信度
- [ ] Q12 它的安全边界是什么（Lean 4 建模）— 中/高置信度
- [ ] Q13 它的容量扩展极限是什么（水平/垂直扩展）— 中/高置信度
- [ ] 高置信度 ≥ 9 / 13
```

- [ ] **Step 3: 运行测试 + 提交**

```bash
cd d:\srs_formalizer_opt\SRS-Formalizer\.claude\skills\srs-formalizer\scripts
npx tsx --test __tests__\*.test.ts
npx tsc --noEmit
cd d:\srs_formalizer_opt\SRS-Formalizer
git add .claude/skills/srs-formalizer/templates/checklists/6_outputs_CHECKLIST.md
git -c commit.gpgsign=false commit -m "fix(checklist): 6_outputs Q1-Q10 -> Q1-Q13 + remove build-system-architecture" -m "P1: aligns with SKILL.md and convergence-loop.md (13Q / >=9/13 threshold)." -m "Removes archived command reference build-system-architecture."
```

---

## Task 4: 修复 3_graph + 4_bdd CHECKLIST 模板（P1-5 + P2-7）

**Files:**
- Modify: `templates/checklists/3_graph_CHECKLIST.md`
- Modify: `templates/checklists/4_bdd_CHECKLIST.md`

- [ ] **Step 1: 3_graph_CHECKLIST.md 移除 analyze-graph/merge-analysis**

将第 7-8 行：

```markdown
- [ ] analyze-graph 完成：duplicate/conflict/cluster 报告已生成
- [ ] merge-analysis 完成：语义判定已合并
```

替换为：

```markdown
- [ ] Agent 完成 duplicate/conflict/cluster 分析报告
- [ ] Agent 完成语义判定合并
```

- [ ] **Step 2: 4_bdd_CHECKLIST.md 移除 behavior-graph**

将第 12 行：

```markdown
- [ ] Agent 生成 + validate-bdd PASS（behavior-graph）
```

替换为：

```markdown
- [ ] Agent 按 executor-bdd.md 生成 + validate-bdd PASS
```

- [ ] **Step 3: 运行测试 + 提交**

```bash
cd d:\srs_formalizer_opt\SRS-Formalizer\.claude\skills\srs-formalizer\scripts
npx tsx --test __tests__\*.test.ts
npx tsc --noEmit
cd d:\srs_formalizer_opt\SRS-Formalizer
git add .claude/skills/srs-formalizer/templates/checklists/3_graph_CHECKLIST.md .claude/skills/srs-formalizer/templates/checklists/4_bdd_CHECKLIST.md
git -c commit.gpgsign=false commit -m "fix(checklist): remove archived command refs from 3_graph + 4_bdd" -m "P1/P2: 3_graph removes analyze-graph/merge-analysis; 4_bdd removes behavior-graph."
```

---

## Task 5: 更新 examples/end-to-end-walkthrough.md（P1-6）

**Files:**
- Modify: `examples/end-to-end-walkthrough.md`

- [ ] **Step 1: 更新第 3 节"Build and analyze SRS-IR"的命令**

读取文件第 69-79 行。将：

```bash
npx tsx index.ts build-ir --workdir .srs_formalizer
npx tsx index.ts analyze-structure --workdir .srs_formalizer
npx tsx index.ts analyze-graph --workdir .srs_formalizer
npx tsx index.ts tag-nfr --workdir .srs_formalizer
npx tsx index.ts check-connectivity --workdir .srs_formalizer
npx tsx index.ts score-risk --workdir .srs_formalizer
npx tsx index.ts verify-gate --workdir .srs_formalizer --stage R3
```

替换为：

```bash
npx tsx index.ts assemble-ir --workdir .srs_formalizer
npx tsx index.ts validate-semantics --workdir .srs_formalizer
npx tsx index.ts check-connectivity --workdir .srs_formalizer
npx tsx index.ts analyze-dataflow --workdir .srs_formalizer
npx tsx index.ts verify-gate --workdir .srs_formalizer --stage R3
```

- [ ] **Step 2: 更新第 4 节"Emit drafts"的 emit 命令**

读取文件第 83-89 行。`emit` 命令已归档。将：

```bash
npx tsx index.ts emit --group graphs --workdir .srs_formalizer
npx tsx index.ts emit --group bdd --workdir .srs_formalizer
npx tsx index.ts emit --group formal --workdir .srs_formalizer
```

替换为说明性文字（因为 emit 已归档，Agent 现在按 prompts 手动生成）：

```markdown
Agent 按 `prompts/executor-backend-cypher.md` 生成图谱产物到 `outputs/graphs/`。
Agent 按 `prompts/executor-bdd.md` 生成 BDD .feature 文件到 `outputs/bdd/draft/`。
Agent 按 `prompts/executor-tla.md` 和 `prompts/executor-lean4.md` 生成形式化产物到 `outputs/tlaplus/draft/` 和 `outputs/lean4/draft/`。
```

- [ ] **Step 3: 更新后续引用 emit 的行（约 130-135 行）**

搜索文件中所有 `emit` 命令引用，全部替换为说明性文字或移除。

- [ ] **Step 4: 更新第 18 行的流程描述**

将：
```
init → manifest → guided extraction → build-ir → analysis → emit
```
替换为：
```
init → manifest → guided extraction → assemble-ir → analysis → Agent 生成产物
```

- [ ] **Step 5: 运行测试 + 提交**

```bash
cd d:\srs_formalizer_opt\SRS-Formalizer\.claude\skills\srs-formalizer\scripts
npx tsx --test __tests__\*.test.ts
npx tsc --noEmit
cd d:\srs_formalizer_opt\SRS-Formalizer
git add .claude/skills/srs-formalizer/examples/end-to-end-walkthrough.md
git -c commit.gpgsign=false commit -m "docs(walkthrough): replace 5+ archived commands with current equivalents" -m "P1: build-ir->assemble-ir, analyze-structure->validate-semantics, emit->Agent prompts."
```

---

## Task 6: 更新 index.test.ts EXPECTED_COMMANDS（新发现）

**Files:**
- Modify: `scripts/__tests__/index.test.ts`

- [ ] **Step 1: 更新 EXPECTED_COMMANDS 数组**

在 `scripts/__tests__/index.test.ts` 中，将第 26-32 行的 `EXPECTED_COMMANDS` 数组替换为（23 个命令）：

```typescript
// DESIGN.md §3 — 23 命令清单（11 门禁 + 12 工具），与 index.ts COMMANDS 注册表一致
const EXPECTED_COMMANDS = [
  'validate-jsonl', 'validate-semantics', 'validate-architecture', 'validate-cypher',
  'validate-bdd', 'validate-tla', 'validate-lean', 'validate-glossary',
  'validate-checklist', 'validate-dataflow', 'verify-gate',
  'assemble-ir', 'check-connectivity', 'analyze-dataflow', 'query-graph', 'hash-compute',
  'tlc-trace-parse', 'verify-skill-integrity', 'pack-skill',
  'build-rid-mapping', 'analyze-fidelity', 'validate-convergence-log', 'semantic-gate',
];
```

- [ ] **Step 2: 更新注释中的命令计数**

将第 25 行注释：
```typescript
// DESIGN.md §3 — 18 命令清单（10 门禁 + 8 工具），与 index.ts COMMANDS 注册表一致
```
替换为：
```typescript
// DESIGN.md §3 — 23 命令清单（11 门禁 + 12 工具），与 index.ts COMMANDS 注册表一致
```

- [ ] **Step 3: 运行测试确认通过**

```bash
cd d:\srs_formalizer_opt\SRS-Formalizer\.claude\skills\srs-formalizer\scripts
npx tsx --test __tests__\index.test.ts
npx tsx --test __tests__\*.test.ts
npx tsc --noEmit
```

Expected: index.test.ts 全部通过（`registers all documented commands` 测试现在验证 23 个命令），全量回归 417/417，tsc 0 errors。

- [ ] **Step 4: 提交**

```bash
cd d:\srs_formalizer_opt\SRS-Formalizer
git add .claude/skills/srs-formalizer/scripts/__tests__/index.test.ts
git -c commit.gpgsign=false commit -m "test(index): update EXPECTED_COMMANDS 19 -> 23 (add 4 missing commands)" -m "Adds build-rid-mapping, analyze-fidelity, validate-convergence-log, semantic-gate."
```

---

## Task 7: 接入 checks-final.ts 死代码到 FINAL 门禁（P2-9）

**Files:**
- Modify: `scripts/lib/verify-gate/checks-final.ts` (checkFormalArtifacts 增加调用)
- Test: `scripts/__tests__/checks-final-coverage.test.ts` (或 verify-gate.test.ts)

- [ ] **Step 1: 写失败测试**

在 `scripts/__tests__/checks-final-coverage.test.ts` 末尾追加测试，验证 `checkFormalArtifacts` 的返回结果中包含 legacy source scan 检查：

```typescript
  it('checkFormalArtifacts includes legacy TLA+ source scan', () => {
    const workDir = createWorkDir('legacy-tla-scan');
    // 创建 5_formal/specs/ 下含占位符的 .tla 文件
    const specsDir = path.join(workDir, '5_formal', 'specs');
    fs.mkdirSync(specsDir, { recursive: true });
    fs.writeFileSync(path.join(specsDir, 'Bad.tla'), '---- MODULE Bad ----\n(* TODO: implement *)\n====', 'utf-8');
    const results = checkFormalArtifacts(workDir);
    const tlaScan = results.find(r => r.name === 'legacy TLA source scan');
    assert.ok(tlaScan, 'checkFormalArtifacts should include legacy TLA source scan');
    assert.strictEqual(tlaScan.passed, false, 'should detect TODO placeholder');
  });

  it('checkFormalArtifacts includes legacy Lean source scan', () => {
    const workDir = createWorkDir('legacy-lean-scan');
    const proofsDir = path.join(workDir, '5_formal', 'proofs');
    fs.mkdirSync(proofsDir, { recursive: true });
    fs.writeFileSync(path.join(proofsDir, 'Bad.lean'), 'theorem bad : True := by sorry', 'utf-8');
    const results = checkFormalArtifacts(workDir);
    const leanScan = results.find(r => r.name === 'legacy Lean source scan');
    assert.ok(leanScan, 'checkFormalArtifacts should include legacy Lean source scan');
    assert.strictEqual(leanScan.passed, false, 'should detect sorry');
  });
```

**IMPORTANT:** 先读取测试文件确认 `checkFormalArtifacts` 和 `createWorkDir` 已导入。如果 `createWorkDir` 不存在，参考现有测试的 work dir 创建方式。注意：`checkFormalArtifacts` 需要读取 `srs-ir.json`——测试 setup 需创建该文件（参考 Task 1 的测试 fixture）。

- [ ] **Step 2: 运行测试确认失败**

```bash
cd d:\srs_formalizer_opt\SRS-Formalizer\.claude\skills\srs-formalizer\scripts
npx tsx --test __tests__\checks-final-coverage.test.ts
```

Expected: FAIL — `checkFormalArtifacts` 返回结果中找不到 `legacy TLA source scan`。

- [ ] **Step 3: 在 checkFormalArtifacts 中接入 legacy source scan**

在 `scripts/lib/verify-gate/checks-final.ts` 的 `checkFormalArtifacts` 函数中，在 `checkAntiPatterns(workDir)` 之前（约第 199 行），追加：

```typescript
      // P2: legacy source placeholder scan (previously dead code)
      checkLegacyTlaSource(workDir),
      checkLegacyLeanSource(workDir),
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd d:\srs_formalizer_opt\SRS-Formalizer\.claude\skills\srs-formalizer\scripts
npx tsx --test __tests__\checks-final-coverage.test.ts
npx tsx --test __tests__\*.test.ts
npx tsc --noEmit
```

Expected: checks-final-coverage.test.ts 全部通过（+2 新测试），全量回归 419/419（+2），tsc 0 errors。

**IMPORTANT:** 如果其他测试因 `checkFormalArtifacts` 现在执行 legacy scan 而失败（例如 fixture 中含占位符），需要更新那些 fixture 清除占位符。

- [ ] **Step 5: 提交**

```bash
cd d:\srs_formalizer_opt\SRS-Formalizer
git add .claude/skills/srs-formalizer/scripts/lib/verify-gate/checks-final.ts .claude/skills/srs-formalizer/scripts/__tests__/checks-final-coverage.test.ts
git -c commit.gpgsign=false commit -m "feat(verify-gate): wire legacy TLA+/Lean source scan into FINAL gate" -m "P2: checkLegacyTlaSource/checkLegacyLeanSource were dead code (never called)." -m "Now included in checkFormalArtifacts so FINAL gate scans for placeholders."
```

---

## Task 8: 拆分 checks-r3.ts（P2-8，可选）

**Files:**
- Create: `scripts/lib/verify-gate/checks-r3-relational.ts` (从 checks-r3.ts 拆出)
- Modify: `scripts/lib/verify-gate/checks-r3.ts` (移除拆出的函数，改为 import)
- Modify: `scripts/__tests__/verify-gate.test.ts` (更新 import 路径)

- [ ] **Step 1: 读取 checks-r3.ts 识别可拆分的函数组**

读取 `scripts/lib/verify-gate/checks-r3.ts`（658 行）。识别以下函数组可拆分到 `checks-r3-relational.ts`：
- `checkR3RelationIngest`（约 627-666 行）
- `checkR3RelationalThreshold`（约 673-699 行）
- `checkR2R3Ingest`（如果与上述函数紧密耦合）
- 相关的辅助函数

- [ ] **Step 2: 创建 checks-r3-relational.ts**

将 `checkR3RelationIngest`、`checkR3RelationalThreshold` 及其依赖的辅助函数（如 `loadIR`、`listJsonlFiles`/`readJsonl` 导入）移动到新文件 `scripts/lib/verify-gate/checks-r3-relational.ts`。

- [ ] **Step 3: 更新 checks-r3.ts 的 import**

在 `checks-r3.ts` 中，将拆出的函数改为从 `checks-r3-relational.js` 导入：

```typescript
import { checkR3RelationIngest, checkR3RelationalThreshold } from './checks-r3-relational.js';
export { checkR3RelationIngest, checkR3RelationalThreshold };
```

- [ ] **Step 4: 更新 verify-gate.ts 的 import（如需要）**

如果 `verify-gate.ts` 直接从 `checks-r3.js` 导入这些函数，无需修改（因为 checks-r3.ts 再导出）。如果改为从 `checks-r3-relational.js` 导入，更新 import 路径。

- [ ] **Step 5: 运行测试 + tsc**

```bash
cd d:\srs_formalizer_opt\SRS-Formalizer\.claude\skills\srs-formalizer\scripts
npx tsx --test __tests__\*.test.ts
npx tsc --noEmit
```

Expected: 419/419 pass，tsc 0 errors。验证 `checks-r3.ts` 行数降至 ≤300，`checks-r3-relational.ts` ≤300。

- [ ] **Step 6: 提交**

```bash
cd d:\srs_formalizer_opt\SRS-Formalizer
git add .claude/skills/srs-formalizer/scripts/lib/verify-gate/checks-r3.ts .claude/skills/srs-formalizer/scripts/lib/verify-gate/checks-r3-relational.ts
git -c commit.gpgsign=false commit -m "refactor(verify-gate): split checks-r3.ts (658 -> <300 lines each)" -m "P2: checks-r3.ts exceeded 300-line SKILL.md constraint." -m "Relational checks moved to checks-r3-relational.ts."
```

---

## Self-Review Checklist

完成所有 Task 后，运行最终验证：

- [ ] MANIFEST.json `packed_at` 为今天，`verify-skill-integrity --skill-dir .` 返回 `valid: true`
- [ ] `lib/checklists.ts` 无已归档命令引用（grep `build-ir|build-architecture|analyze-structure|analyze-graph|merge-analysis|emit --name` 应无匹配）
- [ ] 所有 CHECKLIST 模板无已归档命令引用
- [ ] `6_outputs_CHECKLIST.md` 为 Q1-Q13 + ≥9/13
- [ ] `index.test.ts` EXPECTED_COMMANDS 为 23 个
- [ ] `checks-final.ts` 的 legacy scan 函数被 `checkFormalArtifacts` 调用
- [ ] `checks-r3.ts` ≤300 行
- [ ] Windows 全量回归 pass
- [ ] WSL2 全量回归 pass
- [ ] tsc 0 errors
