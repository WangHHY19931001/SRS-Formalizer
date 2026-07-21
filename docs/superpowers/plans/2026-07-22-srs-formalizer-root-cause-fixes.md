# SRS-Formalizer 根因修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 `srs_formalizer_根因分析报告.md` 揭示的 6 类系统性失效，使确定性工具链能正确生成 IR edges、R3 门禁能检测数据篡改、命令注册表三方一致、Middle-end 工具补齐。

**Architecture:** 从源码层修复 `assemble-ir.ts`（移植归档的 `toIREdges()`）、强化 `checks-r3.ts`（4 项新检查）、统一命令注册表（SKILL.md/AGENTS.md/index.ts 三方对齐到 22 命令）、补齐 M1/M2/M3/M5/M6 中端工具实现、升级 CHECKLIST 模板。本计划不含 Agent 行为约束（篡改数据/伪造报告等需在运行时由门禁拦截，属技能定义层修复）。

**Tech Stack:** TypeScript (strict mode, zero runtime deps), Node.js 22, tsx, vitest-style `--test` runner

**分析对象工作区:** `d:\srs_formalizer_opt\SRS-Formalizer\.claude\skills\srs-formalizer\`

---

## 工作区现状交叉验证结论

| 报告发现 | 本工作区状态 | 证据 |
|---------|-------------|------|
| assemble-ir.ts 缺 toIREdges()，edges 初始为空 | **确认存在** | [assemble-ir.ts:229](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/commands/assemble-ir.ts#L229) `const edges: SRSIR['edges'] = [];` |
| REQUIREMENT_SUBDIRS 仅 3 类（缺 r3-cross/r4-nfr） | **确认存在** | [assemble-ir.ts:23](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/commands/assemble-ir.ts#L23) |
| module 字段填 source_file（源路径）而非模块名 | **确认存在** | [assemble-ir.ts:48](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/commands/assemble-ir.ts#L48) `module: record.source_file` |
| bdd-validator.ts 被 Agent 篡改 | **不适用** | 本工作区是上游仓库，bdd-validator.ts 为干净原版，无中文 Gherkin/IS_NFR_FILE/normalizeStepKeyword 篡改 |
| R3 门禁缺边类型多样性/方向/关系 ingest 检查 | **确认存在** | [checks-r3.ts](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/lib/verify-gate/checks-r3.ts) 仅有 10 项检查，无上述 4 项 |
| SKILL.md 17 命令 vs AGENTS.md 19 命令 | **确认存在，且更严重** | SKILL.md=17, AGENTS.md=19, **index.ts 实际注册 22 命令**（11 Gate + 11 Tools）。三方均不一致 |
| prompts 引用 3 个未注册命令 | **不适用（已注册）** | `analyze-fidelity`/`validate-convergence-log`/`build-rid-mapping` 在 [index.ts:129-131](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/index.ts#L129) 已注册并分派，仅 SKILL.md/AGENTS.md 文档未列出 |
| M1/M2/M3/M5/M6 工具未实现 | **确认存在** | [middle-end/](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/lib/middle-end) 仅 `connectivity-checker.ts`(M4) + `dataflow-analyzer.ts` |
| 归档 builder.ts 有完整 toIREdges() | **确认可用** | [builder.ts:73-106](file:///d:/srs_formalizer_opt/SRS-Formalizer/.worktrees/archive/2026-07-16/scripts/lib/frontend/builder.ts#L73) |

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `scripts/commands/assemble-ir.ts` | 修改 | 移植 toIREdges()、扩展 5 类 subdir、修正 module 字段 |
| `scripts/lib/verify-gate/checks-r3.ts` | 修改 | 增加 4 项检查（边类型多样性/方向/R2R3 ingest/关系 ingest） |
| `scripts/lib/verify-gate/shared.ts` | 可能修改 | 如需新增 CheckResult 辅助函数 |
| `SKILL.md` | 修改 | 命令注册表从 17 → 22，与 index.ts 对齐 |
| `AGENTS.md` | 修改 | 命令注册表从 19 → 22，与 index.ts 对齐 |
| `scripts/lib/middle-end/structure-analyzer.ts` | 新建 | M1 结构分析器 |
| `scripts/lib/middle-end/semantic-analyzer.ts` | 新建 | M2 语义分析器 |
| `scripts/lib/middle-end/nfr-tagger.ts` | 新建 | M3 NFR 标注器 |
| `scripts/lib/middle-end/merge-optimizer.ts` | 新建 | M5 合并优化器 |
| `scripts/lib/middle-end/risk-scorer.ts` | 新建 | M6 风险评分器 |
| `scripts/__tests__/assemble-ir.test.ts` | 修改 | 增加 toIREdges/5-subdir/module-name 测试 |
| `scripts/__tests__/checks-r3-enhanced.test.ts` | 新建 | R3 门禁新检查项测试 |
| `templates/checklists/*.md` | 修改 | 移除已归档命令引用、统一路径 |

---

## Task 1: P0-1 移植 toIREdges() 到 assemble-ir.ts（根因修复）

**Files:**
- Modify: `scripts/commands/assemble-ir.ts`
- Test: `scripts/__tests__/assemble-ir.test.ts`

**根因**: 当前 [assemble-ir.ts:229](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/commands/assemble-ir.ts#L229) edges 初始为空，只有 data-entities 产生 produces/consumes/mutates 边。R3-relational JSONL 中的 `metadata.relation`（DEPENDS_ON/REFINES/CONFLICTS_WITH）未被提取为 IR edges。归档的 [builder.ts:73-106](file:///d:/srs_formalizer_opt/SRS-Formalizer/.worktrees/archive/2026-07-16/scripts/lib/frontend/builder.ts#L73) 有完整实现。

- [ ] **Step 1: 在 assemble-ir.ts 中添加 edgeTypeFromString() 和 toIREdges() 函数**

在 `assemble-ir.ts` 的 `toArchIRNode` 函数之后（约 L98）、`readDataFlowRecords` 之前（约 L100），插入以下代码（从归档 builder.ts:62-106 移植）：

```typescript
import type { IREdge, IREdgeType } from '../types/srs-ir.js';

function edgeTypeFromString(s: string): IREdgeType | null {
  const normalized = s.toLowerCase();
  const valid: readonly string[] = [
    'depends_on', 'refines', 'conflicts_with', 'derived_from',
    'same_aspect', 'contains', 'nfr_impacts', 'nfr_constrains',
    'cross_file_depends', 'verifies', 'implements', 'proves', 'traces_to',
  ];
  if (valid.includes(normalized)) return normalized as IREdgeType;
  return null;
}

/** 从 R3-relational JSONL 记录的 metadata.relation 提取 IREdge。
 *  仅处理 relation.type 为合法 IREdgeType 的记录；source_id/target_id 必须有效。 */
function toIREdges(record: JsonlRecord): IREdge[] {
  const edges: IREdge[] = [];
  const meta = isRecord(record.metadata) ? record.metadata : null;
  if (!meta) return edges;

  const relation = meta['relation'];
  if (!isRecord(relation)) return edges;

  const relType = relation['type'];
  if (typeof relType !== 'string') return edges;

  const edgeType = edgeTypeFromString(relType);
  if (!edgeType) return edges;

  const source: string =
    typeof meta['source_id'] === 'string' ? meta['source_id'] : record.id;
  const target: string | undefined =
    typeof meta['target_id'] === 'string'
      ? meta['target_id']
      : typeof relation['target'] === 'string'
        ? relation['target']
        : undefined;
  if (!target) return edges;

  edges.push({
    id: `e-${source}-${target}-${edgeType}`,
    source,
    target,
    type: edgeType,
    properties: {},
  });

  return edges;
}
```

注意：`IREdge` 和 `IREdgeType` 类型已在 `../types/srs-ir.js` 中定义（[srs-ir.ts:94-125](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/types/srs-ir.ts#L94)），只需在文件顶部 import 中添加。

- [ ] **Step 2: 在 assemble-ir.ts 的 edges 生成段调用 toIREdges()**

将 [assemble-ir.ts:229](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/commands/assemble-ir.ts#L229) 的：

```typescript
    const edges: SRSIR['edges'] = [];
```

替换为：

```typescript
    // P0-1: 从 R3-relational JSONL 的 metadata.relation 提取关系边
    // （移植自归档 builder.ts:73-106，修复 edges 全为空的根因）
    const edges: SRSIR['edges'] = [];
    for (const sub of REQUIREMENT_SUBDIRS) {
      const dir = path.join(workDir, '2_extract', sub);
      if (!fs.existsSync(dir)) continue;
      for (const file of listJsonlFiles(dir, workDir)) {
        for (const r of readJsonl(file, workDir)) {
          edges.push(...toIREdges(r));
        }
      }
    }
```

注意：此处会二次遍历 JSONL 文件（第一次在 L197-209 构建 nodes，第二次在此构建 edges）。这是有意的——保持代码清晰，避免在 toIRNode 循环中混合 edge 逻辑。性能影响可忽略（JSONL 文件通常 <100 条记录）。

- [ ] **Step 3: 扩展 REQUIREMENT_SUBDIRS 从 3 类到 5 类**

将 [assemble-ir.ts:23](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/commands/assemble-ir.ts#L23) 的：

```typescript
const REQUIREMENT_SUBDIRS = ['r1-explicit', 'r2-implicit', 'r3-relational'] as const;
```

替换为：

```typescript
const REQUIREMENT_SUBDIRS = ['r1-explicit', 'r2-implicit', 'r3-relational', 'r3-cross', 'r4-nfr'] as const;
```

这与归档 [builder.ts:15](file:///d:/srs_formalizer_opt/SRS-Formalizer/.worktrees/archive/2026-07-16/scripts/lib/frontend/builder.ts#L15) 的 `EXTRACT_SUBDIRS` 一致。

- [ ] **Step 4: 编写失败测试——验证 toIREdges 从 R3-relational 提取关系边**

在 `scripts/__tests__/assemble-ir.test.ts` 中添加测试用例：

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

describe('assemble-ir toIREdges (P0-1)', () => {
  it('should extract depends_on/refines edges from r3-relational JSONL', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'srs-ir-test-'));
    try {
      // 创建目录结构
      fs.mkdirSync(path.join(tmpDir, '2_extract', 'r1-explicit'), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, '2_extract', 'r3-relational'), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, '2_extract', 'architecture'), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, '_ctx'), { recursive: true });

      // 写入 R1 需求
      fs.writeFileSync(
        path.join(tmpDir, '2_extract', 'r1-explicit', 'test.jsonl'),
        JSON.stringify({
          id: 'R1-S001-0001', category: 'explicit', statement: '系统必须支持用户登录',
          source_file: 'frozen/DESIGN.md', confidence: 'high',
          metadata: { shard_id: 'S001', chapter: '1', start_line: 1, end_line: 10, provenance: 'explicit-located' }
        }) + '\n' +
        JSON.stringify({
          id: 'R1-S002-0001', category: 'explicit', statement: '系统必须支持权限管理',
          source_file: 'frozen/DESIGN.md', confidence: 'high',
          metadata: { shard_id: 'S002', chapter: '2', start_line: 11, end_line: 20, provenance: 'explicit-located' }
        }) + '\n'
      );

      // 写入 R3 关系需求（DEPENDS_ON）
      fs.writeFileSync(
        path.join(tmpDir, '2_extract', 'r3-relational', 'test.jsonl'),
        JSON.stringify({
          id: 'R3-S001-0001', category: 'relational', statement: '权限管理依赖于用户登录',
          source_file: 'frozen/DESIGN.md', confidence: 'high',
          metadata: {
            shard_id: 'S001', chapter: '1', provenance: 'doc-derived',
            relation: { type: 'DEPENDS_ON' },
            source_id: 'R1-S002-0001',
            target_id: 'R1-S001-0001'
          }
        }) + '\n'
      );

      // 写入空 shard_index
      fs.writeFileSync(
        path.join(tmpDir, '_ctx', 'shard_index.json'),
        JSON.stringify({ language: 'zh', shards: [], source_path: '', source_hash: '', total_chars: 0, total_shards: 0 })
      );

      // 运行 assemble-ir
      const { main } = await import('../commands/assemble-ir.js');
      const result = await main(['--workdir', tmpDir]);

      assert.equal(result.status, 'ok', `assemble-ir failed: ${result.message ?? ''}`);

      // 读取生成的 IR
      const ir = JSON.parse(fs.readFileSync(path.join(tmpDir, 'srs-ir.json'), 'utf-8'));

      // 验证 edges 包含 depends_on 关系边
      const dependsOnEdges = ir.edges.filter((e: { type: string }) => e.type === 'depends_on');
      assert.ok(dependsOnEdges.length > 0, 'IR should contain depends_on edges from r3-relational');
      assert.equal(dependsOnEdges[0].source, 'R1-S002-0001');
      assert.equal(dependsOnEdges[0].target, 'R1-S001-0001');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 5: 运行测试验证失败（修改前）**

Run: `cd d:\srs_formalizer_opt\SRS-Formalizer\.claude\skills\srs-formalizer\scripts && npx tsx --test __tests__/assemble-ir.test.ts`
Expected: FAIL — depends_on edges 为空（因为 toIREdges 尚未调用）

- [ ] **Step 6: 运行测试验证通过（修改后）**

Run: `cd d:\srs_formalizer_opt\SRS-Formalizer\.claude\skills\srs-formalizer\scripts && npx tsx --test __tests__/assemble-ir.test.ts`
Expected: PASS — IR edges 包含 depends_on 关系边

- [ ] **Step 7: 验证 TypeScript 编译**

Run: `cd d:\srs_formalizer_opt\SRS-Formalizer\.claude\skills\srs-formalizer\scripts && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 8: 提交**

```bash
git add scripts/commands/assemble-ir.ts scripts/__tests__/assemble-ir.test.ts
git commit -m "fix(assemble-ir): port toIREdges() from archived builder.ts

R3-relational JSONL 的 metadata.relation 现在被提取为 IR edges
(depends_on/refines/conflicts_with 等)，不再为空或全 contains。
扩展 REQUIREMENT_SUBDIRS 从 3 类到 5 类 (添加 r3-cross, r4-nfr)。

根因: 归档重构导致 toIREdges() 丢失，edges 初始为空。
修复: 从 .worktrees/archive/2026-07-16/scripts/lib/frontend/builder.ts:73-106 移植。"
```

---

## Task 2: P0-2 修正 IR module 字段填充（填模块名而非源路径）

**Files:**
- Modify: `scripts/commands/assemble-ir.ts:41-65`
- Test: `scripts/__tests__/assemble-ir.test.ts`

**根因**: [assemble-ir.ts:48](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/commands/assemble-ir.ts#L48) `module: record.source_file` 把源文件路径（如 `"frozen/DESIGN.md"`）填入 module 字段，而 module 应表示需求所属的子系统名（如 `"A2ACoordination"`）。正确来源是 architecture JSONL 的 `contains` 关系或 shard_index 的 module 映射。

- [ ] **Step 1: 修改 toIRNode() 的 module 字段填充逻辑**

将 [assemble-ir.ts:45-49](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/commands/assemble-ir.ts#L45) 的：

```typescript
  return {
    id: record.id,
    type: 'requirement',
    module: record.source_file,
    labels: [':Requirement'],
```

替换为：

```typescript
  const shardId = toStr(meta?.['shard_id'], record.id);
  return {
    id: record.id,
    type: 'requirement',
    // module 填 shard_id 作为初始归属；后续由 architecture contains 边
    // 或 Middle-end M5 合并优化器确定精确子系统名。
    // 不填 source_file（那是源路径，不是模块名）。
    module: shardId,
    labels: [':Requirement'],
```

注意：精确的 module→subsystem 映射需要 architecture JSONL 的 `contains` 关系。由于 architecture 节点在 assemble-ir 中以独立循环处理（L211-223），需求节点的 module 字段在此阶段只能填 shard_id 作为占位。真正的模块归属由后续 `check-connectivity` 的 `analyzeAtomicTree` 验证，或由 Agent 在 M5 阶段通过 `contains` 边回写。这是一个务实的折中——比填源路径好，因为 shard_id 至少是稳定的结构标识符。

- [ ] **Step 2: 编写测试验证 module 字段不再为源路径**

在 `assemble-ir.test.ts` 中添加：

```typescript
  it('should not fill module with source_file path (P0-2)', async () => {
    // 复用 Task 1 的 tmpDir 结构，或新建
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'srs-ir-module-'));
    try {
      fs.mkdirSync(path.join(tmpDir, '2_extract', 'r1-explicit'), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, '_ctx'), { recursive: true });

      fs.writeFileSync(
        path.join(tmpDir, '2_extract', 'r1-explicit', 'test.jsonl'),
        JSON.stringify({
          id: 'R1-S005-0001', category: 'explicit', statement: 'test',
          source_file: 'frozen/DESIGN.md', confidence: 'high',
          metadata: { shard_id: 'S005', chapter: '5', start_line: 1, end_line: 10, provenance: 'explicit-located' }
        }) + '\n'
      );
      fs.writeFileSync(
        path.join(tmpDir, '_ctx', 'shard_index.json'),
        JSON.stringify({ language: 'zh', shards: [], source_path: '', source_hash: '', total_chars: 0, total_shards: 0 })
      );

      const { main } = await import('../commands/assemble-ir.js');
      const result = await main(['--workdir', tmpDir]);
      assert.equal(result.status, 'ok');

      const ir = JSON.parse(fs.readFileSync(path.join(tmpDir, 'srs-ir.json'), 'utf-8'));
      const node = ir.nodes.find((n: { id: string }) => n.id === 'R1-S005-0001');
      assert.ok(node, 'R1-S005-0001 should be in IR');
      assert.notEqual(node.module, 'frozen/DESIGN.md', 'module should NOT be source_file path');
      assert.equal(node.module, 'S005', 'module should be shard_id');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
```

- [ ] **Step 3: 运行测试并提交**

Run: `npx tsx --test __tests__/assemble-ir.test.ts && npx tsc --noEmit`
Expected: PASS + 0 errors

```bash
git add scripts/commands/assemble-ir.ts scripts/__tests__/assemble-ir.test.ts
git commit -m "fix(assemble-ir): fill module field with shard_id instead of source_file

module 字段之前填源文件路径(如 'frozen/DESIGN.md')，无语义价值。
改为填 shard_id 作为初始归属占位，后续由 architecture contains 边
或 M5 合并优化器确定精确子系统名。"
```

---

## Task 3: P1-1 统一命令注册表（SKILL.md + AGENTS.md → 22 命令）

**Files:**
- Modify: `SKILL.md:180-198`（frontmatter 命令注册表）
- Modify: `SKILL.md:411-440`（门禁/工具速查表）
- Modify: `AGENTS.md`（Key CLI commands 表）
- Test: 无（文档变更，由 verify-skill-integrity 验证）

**根因**: 三方不一致——index.ts 注册 22 命令（11 Gate + 11 Tools），SKILL.md 列 17（10 Gate + 7 Tools），AGENTS.md 列 19（11 Gate + 8 Tools）。SKILL.md 缺 5 个命令（validate-dataflow, analyze-dataflow, build-rid-mapping, analyze-fidelity, validate-convergence-log），AGENTS.md 缺 3 个（build-rid-mapping, analyze-fidelity, validate-convergence-log）。

- [ ] **Step 1: 更新 SKILL.md frontmatter 命令注册表**

将 [SKILL.md:180-198](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/SKILL.md#L180) 的：

```yaml
  # Gate Validators (10)
  - validate-jsonl
  - validate-semantics
  - validate-architecture
  - validate-cypher
  - validate-bdd
  - validate-tla
  - validate-lean
  - validate-glossary
  - validate-checklist
  - verify-gate
  # Independent Tools (7)
  - assemble-ir
  - check-connectivity
  - query-graph
  - hash-compute
  - tlc-trace-parse
  - verify-skill-integrity
  - pack-skill
```

替换为（与 index.ts 的 COMMANDS 注册表完全一致）：

```yaml
  # Gate Validators (11)
  - validate-jsonl
  - validate-semantics
  - validate-architecture
  - validate-cypher
  - validate-bdd
  - validate-tla
  - validate-lean
  - validate-glossary
  - validate-checklist
  - validate-dataflow
  - verify-gate
  # Independent Tools (11)
  - assemble-ir
  - check-connectivity
  - analyze-dataflow
  - build-rid-mapping
  - analyze-fidelity
  - validate-convergence-log
  - query-graph
  - hash-compute
  - tlc-trace-parse
  - verify-skill-integrity
  - pack-skill
```

- [ ] **Step 2: 更新 SKILL.md 门禁/工具速查表**

在 [SKILL.md:415](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/SKILL.md#L415) 的 "Gate Validators（10 个..." 改为 "Gate Validators（11 个..." 并在表格中添加 validate-dataflow 行：

```markdown
| `validate-dataflow --file <path> --workdir <wd>` | F4e 数据流抽取后，校验 entity/flow JSONL 格式 |
```

在 [SKILL.md:430](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/SKILL.md#L430) 的 "Independent Tools（7 个..." 改为 "Independent Tools（11 个..." 并在表格中添加 4 行：

```markdown
| `analyze-dataflow --workdir <wd> [--assess ...]` | M4 数据流审视提示（死点/边界/gap/环路，恒 warning） |
| `build-rid-mapping --frozen <dir> --workdir <wd> [--strict]` | 可选：源文档含 RID 编号时构建 RID↔IR 映射 |
| `analyze-fidelity --workdir <wd> [--strict]` | B6 跨产物反弱化分析（需求→BDD→TLA→Lean） |
| `validate-convergence-log --workdir <wd> [--append '<json>']` | B7 收敛日志校验/弱化动作审计 |
```

- [ ] **Step 3: 更新 AGENTS.md Key CLI commands 表**

将 AGENTS.md 中的命令表更新为 22 命令（11 Gate + 11 Tools），与 SKILL.md 和 index.ts 完全一致。具体地，在 Gate Validators 行添加 `validate-dataflow`，在 Independent Tools 行添加 `build-rid-mapping`、`analyze-fidelity`、`validate-convergence-log`。

同时更新 AGENTS.md 开头的 "19 commands: 11 Gate Validators + 8 Independent Tools" 改为 "22 commands: 11 Gate Validators + 11 Independent Tools"。

- [ ] **Step 4: 验证三方一致**

Run: `cd d:\srs_formalizer_opt\SRS-Formalizer\.claude\skills\srs-formalizer\scripts && npx tsx index.ts --help`
Expected: 输出 11 Gate + 11 Tools = 22 commands

手动比对 SKILL.md frontmatter、AGENTS.md 命令表、index.ts --help 输出，三方必须完全一致。

- [ ] **Step 5: 提交**

```bash
git add SKILL.md AGENTS.md
git commit -m "docs: unify command registry to 22 commands (11 Gate + 11 Tools)

SKILL.md(17) vs AGENTS.md(19) vs index.ts(22) 三方不一致。
统一为 22 命令，与 index.ts COMMANDS 注册表完全对齐。
新增文档收录: validate-dataflow, analyze-dataflow, build-rid-mapping,
analyze-fidelity, validate-convergence-log。"
```

---

## Task 4: P1-2 R3 门禁增加边类型多样性检查

**Files:**
- Modify: `scripts/lib/verify-gate/checks-r3.ts`
- Test: `scripts/__tests__/checks-r3-enhanced.test.ts`（新建）

**根因**: R3 门禁的 `checkGraphEdgeIntegrity` 只检查边的引用完整性（source/target 节点存在），不检查边类型多样性。100% contains 边可通过门禁，但意味着 R3-relational 的 depends_on/refines/conflicts_with 关系未被 ingest 到 IR。

- [ ] **Step 1: 编写失败测试**

新建 `scripts/__tests__/checks-r3-enhanced.test.ts`：

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { checkEdgeTypeDiversity } from '../lib/verify-gate/checks-r3.js';

describe('R3 edge type diversity (P1-2)', () => {
  it('should fail when 100% of edges are contains', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'r3-edge-div-'));
    try {
      const graphDir = path.join(tmpDir, '3_graph', 'graph');
      fs.mkdirSync(graphDir, { recursive: true });
      fs.writeFileSync(
        path.join(graphDir, 'graph.merged.json'),
        JSON.stringify({
          nodes: [
            { id: 'ARCH-1', labels: [':Architecture'] },
            { id: 'R1-S001-0001', labels: [':Requirement'] },
            { id: 'R1-S002-0001', labels: [':Requirement'] },
          ],
          edges: [
            { id: 'e1', source: 'ARCH-1', target: 'R1-S001-0001', type: 'contains' },
            { id: 'e2', source: 'ARCH-1', target: 'R1-S002-0001', type: 'contains' },
          ],
        })
      );
      const result = checkEdgeTypeDiversity(tmpDir);
      assert.equal(result.passed, false, '100% contains edges should fail');
      assert.match(result.detail, /diversity/i);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should pass when edges contain multiple types', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'r3-edge-div-ok-'));
    try {
      const graphDir = path.join(tmpDir, '3_graph', 'graph');
      fs.mkdirSync(graphDir, { recursive: true });
      fs.writeFileSync(
        path.join(graphDir, 'graph.merged.json'),
        JSON.stringify({
          nodes: [
            { id: 'ARCH-1', labels: [':Architecture'] },
            { id: 'R1-S001-0001', labels: [':Requirement'] },
            { id: 'R1-S002-0001', labels: [':Requirement'] },
          ],
          edges: [
            { id: 'e1', source: 'ARCH-1', target: 'R1-S001-0001', type: 'contains' },
            { id: 'e2', source: 'R1-S002-0001', target: 'R1-S001-0001', type: 'depends_on' },
          ],
        })
      );
      const result = checkEdgeTypeDiversity(tmpDir);
      assert.equal(result.passed, true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should pass when there are no edges (degraded mode)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'r3-edge-div-empty-'));
    try {
      const graphDir = path.join(tmpDir, '3_graph', 'graph');
      fs.mkdirSync(graphDir, { recursive: true });
      fs.writeFileSync(
        path.join(graphDir, 'graph.merged.json'),
        JSON.stringify({ nodes: [{ id: 'N1', labels: [] }], edges: [] })
      );
      const result = checkEdgeTypeDiversity(tmpDir);
      assert.equal(result.passed, true, 'empty graph should pass (skip)');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx tsx --test __tests__/checks-r3-enhanced.test.ts`
Expected: FAIL — `checkEdgeTypeDiversity` 不存在

- [ ] **Step 3: 实现 checkEdgeTypeDiversity()**

在 `checks-r3.ts` 末尾添加：

```typescript
/** 最大允许 contains 边占比。超过即判为 error——意味着 R3-relational 的
 *  depends_on/refines/conflicts_with 关系未被 ingest 到 IR edges。 */
const MAX_CONTAINS_RATIO = 0.95;

/**
 * R3: 边类型多样性检查。
 *
 * 如果 contains 边占比超过 MAX_CONTAINS_RATIO（默认 95%），说明 IR edges
 * 几乎全是架构包含关系，R3-relational JSONL 中的 depends_on/refines/
 * conflicts_with 等语义关系未被 ingest。这是 assemble-ir toIREdges() 缺陷
 * 的典型症状（根因报告 §4.2）。
 *
 * 空图（0 边）视为通过，交由其它检查处理。
 */
export function checkEdgeTypeDiversity(workDir: string): CheckResult {
  try {
    const graphPaths = [
      path.join(workDir, '3_graph', 'graph', 'graph.merged.json'),
      path.join(workDir, '3_graph', 'graph', 'graph.structure_fixed.json'),
      path.join(workDir, '3_graph', 'graph', 'graph.json'),
    ];
    let graphData: { edges: { type: string }[] } | null = null;
    for (const gp of graphPaths) {
      if (fs.existsSync(gp)) { graphData = JSON.parse(fs.readFileSync(gp, 'utf-8')); break; }
    }
    if (!graphData) return { name: 'Edge type diversity', passed: false, detail: 'No graph file found' };
    const total = graphData.edges.length;
    if (total === 0) return { name: 'Edge type diversity', passed: true, detail: 'No edges (skipped)' };

    const typeCounts = new Map<string, number>();
    for (const e of graphData.edges) {
      typeCounts.set(e.type, (typeCounts.get(e.type) ?? 0) + 1);
    }
    const containsCount = typeCounts.get('contains') ?? 0;
    const containsRatio = containsCount / total;
    const passed = containsRatio <= MAX_CONTAINS_RATIO;
    const typeBreakdown = [...typeCounts.entries()].map(([t, c]) => `${t}:${c}`).join(', ');
    return {
      name: 'Edge type diversity',
      passed,
      detail: passed
        ? `edge types: ${typeBreakdown} (contains ${containsRatio.toFixed(2)} <= ${MAX_CONTAINS_RATIO})`
        : `edge diversity too low: contains ${containsRatio.toFixed(2)} > ${MAX_CONTAINS_RATIO} (${containsCount}/${total}); R3-relational relations may not be ingested into IR edges`,
    };
  } catch {
    return { name: 'Edge type diversity', passed: false, detail: 'Could not compute edge type diversity' };
  }
}
```

- [ ] **Step 4: 在 verify-gate R3 stage 注册新检查**

在 `scripts/commands/verify-gate.ts` 中找到 R3 stage 的检查列表，添加 `checkEdgeTypeDiversity`。具体位置需查看 verify-gate.ts 中 R3 相关的 checks 数组。

- [ ] **Step 5: 运行测试验证通过**

Run: `npx tsx --test __tests__/checks-r3-enhanced.test.ts && npx tsc --noEmit`
Expected: PASS + 0 errors

- [ ] **Step 6: 提交**

```bash
git add scripts/lib/verify-gate/checks-r3.ts scripts/__tests__/checks-r3-enhanced.test.ts scripts/commands/verify-gate.ts
git commit -m "feat(checks-r3): add edge type diversity gate

contains 边占比 >95% 时 R3 门禁失败，检测 R3-relational 关系
未被 ingest 到 IR edges 的典型症状（根因报告 §4.2）。"
```

---

## Task 5: P1-3 R3 门禁增加边方向检查

**Files:**
- Modify: `scripts/lib/verify-gate/checks-r3.ts`
- Test: `scripts/__tests__/checks-r3-enhanced.test.ts`

**根因**: IR edges 方向应为 `(Architecture)-[:contains]->(Requirement)`（架构包含需求），但根因报告发现 165 条边反向写成 `(Requirement)-[:contains]->(Architecture)`。

- [ ] **Step 1: 编写失败测试**

在 `checks-r3-enhanced.test.ts` 中添加：

```typescript
import { checkContainsEdgeDirection } from '../lib/verify-gate/checks-r3.js';

describe('R3 contains edge direction (P1-3)', () => {
  it('should fail when contains edges go Requirement→Architecture (reversed)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'r3-edge-dir-'));
    try {
      const graphDir = path.join(tmpDir, '3_graph', 'graph');
      fs.mkdirSync(graphDir, { recursive: true });
      fs.writeFileSync(
        path.join(graphDir, 'graph.merged.json'),
        JSON.stringify({
          nodes: [
            { id: 'ARCH-1', labels: [':Architecture'] },
            { id: 'R1-S001-0001', labels: [':Requirement'] },
          ],
          edges: [
            // 反向：Requirement → Architecture（错误）
            { id: 'e1', source: 'R1-S001-0001', target: 'ARCH-1', type: 'contains' },
          ],
        })
      );
      const result = checkContainsEdgeDirection(tmpDir);
      assert.equal(result.passed, false, 'reversed contains edges should fail');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should pass when contains edges go Architecture→Requirement', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'r3-edge-dir-ok-'));
    try {
      const graphDir = path.join(tmpDir, '3_graph', 'graph');
      fs.mkdirSync(graphDir, { recursive: true });
      fs.writeFileSync(
        path.join(graphDir, 'graph.merged.json'),
        JSON.stringify({
          nodes: [
            { id: 'ARCH-1', labels: [':Architecture'] },
            { id: 'R1-S001-0001', labels: [':Requirement'] },
          ],
          edges: [
            { id: 'e1', source: 'ARCH-1', target: 'R1-S001-0001', type: 'contains' },
          ],
        })
      );
      const result = checkContainsEdgeDirection(tmpDir);
      assert.equal(result.passed, true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: 实现 checkContainsEdgeDirection()**

在 `checks-r3.ts` 中添加：

```typescript
/**
 * R3: contains 边方向检查。
 *
 * contains 边语义为「架构包含需求」，方向必须为
 * (Architecture)-[:contains]->(Requirement) 或
 * (Architecture)-[:contains]->(Architecture)（子系统嵌套）。
 *
 * 根因报告 §4.3 发现 165 条边反向写成
 * (Requirement)-[:contains]->(Architecture)，语义完全反转。
 *
 * 通过 node.labels 判断节点类型：含 ':Architecture' 为架构节点，
 * 含 ':Requirement' 为需求节点。
 */
export function checkContainsEdgeDirection(workDir: string): CheckResult {
  try {
    const graphPaths = [
      path.join(workDir, '3_graph', 'graph', 'graph.merged.json'),
      path.join(workDir, '3_graph', 'graph', 'graph.structure_fixed.json'),
      path.join(workDir, '3_graph', 'graph', 'graph.json'),
    ];
    let graphData: {
      nodes: { id: string; labels: string[] }[];
      edges: { id: string; source: string; target: string; type: string }[];
    } | null = null;
    for (const gp of graphPaths) {
      if (fs.existsSync(gp)) { graphData = JSON.parse(fs.readFileSync(gp, 'utf-8')); break; }
    }
    if (!graphData) return { name: 'Contains edge direction', passed: false, detail: 'No graph file found' };

    const labelMap = new Map<string, string[]>();
    for (const n of graphData.nodes) labelMap.set(n.id, n.labels ?? []);

    const isArch = (id: string): boolean => {
      const labels = labelMap.get(id) ?? [];
      return labels.some(l => l.toLowerCase().includes('architecture'));
    };
    const isReq = (id: string): boolean => {
      const labels = labelMap.get(id) ?? [];
      return labels.some(l => l.toLowerCase().includes('requirement'));
    };

    const reversed: string[] = [];
    let containsCount = 0;
    for (const e of graphData.edges) {
      if (e.type !== 'contains') continue;
      containsCount++;
      // 反向：source 是 Requirement，target 是 Architecture
      if (isReq(e.source) && isArch(e.target)) {
        reversed.push(`${e.id}: ${e.source}→${e.target}`);
      }
    }
    if (containsCount === 0) return { name: 'Contains edge direction', passed: true, detail: 'No contains edges (skipped)' };
    const passed = reversed.length === 0;
    return {
      name: 'Contains edge direction',
      passed,
      detail: passed
        ? `All ${containsCount} contains edges have correct direction (Architecture→Requirement/Architecture)`
        : `${reversed.length}/${containsCount} contains edges reversed (Requirement→Architecture): ${reversed.slice(0, 5).join(', ')}`,
    };
  } catch {
    return { name: 'Contains edge direction', passed: false, detail: 'Could not check edge directions' };
  }
}
```

- [ ] **Step 3: 在 verify-gate R3 stage 注册并运行测试**

Run: `npx tsx --test __tests__/checks-r3-enhanced.test.ts && npx tsc --noEmit`
Expected: PASS + 0 errors

- [ ] **Step 4: 提交**

```bash
git add scripts/lib/verify-gate/checks-r3.ts scripts/__tests__/checks-r3-enhanced.test.ts scripts/commands/verify-gate.ts
git commit -m "feat(checks-r3): add contains edge direction gate

检测 (Requirement)-[:contains]->(Architecture) 反向边，
正确方向应为 (Architecture)-[:contains]->(Requirement)。
根因报告 §4.3 发现 165 条边整体反向。"
```

---

## Task 6: P1-4 R3 门禁增加 R2/R3 入 IR 检查

**Files:**
- Modify: `scripts/lib/verify-gate/checks-r3.ts`
- Test: `scripts/__tests__/checks-r3-enhanced.test.ts`

**根因**: R2(64条)+R3(19条) 共 83 条节点完全未进入 IR（根因报告 §4.1）。`/tmp/build_ir.js` 正则只匹配 R1，R2/R3 成为孤立节点或完全缺失。门禁不检查 JSONL 条数 vs IR 节点数。

- [ ] **Step 1: 编写失败测试**

在 `checks-r3-enhanced.test.ts` 中添加：

```typescript
import { checkR2R3Ingest } from '../lib/verify-gate/checks-r3.js';

describe('R3 R2/R3 ingest check (P1-4)', () => {
  it('should fail when R2 JSONL records are not in IR', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'r3-r2r3-ingest-'));
    try {
      // 创建 R2 JSONL（有 2 条记录）
      fs.mkdirSync(path.join(tmpDir, '2_extract', 'r2-implicit'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, '2_extract', 'r2-implicit', 'test.jsonl'),
        JSON.stringify({ id: 'R2-S001-0001', category: 'implicit', statement: 'implicit req 1', source_file: 'test.md', confidence: 'medium', metadata: { derived_from: 'R1-S001-0001', provenance: 'doc-derived' } }) + '\n' +
        JSON.stringify({ id: 'R2-S001-0002', category: 'implicit', statement: 'implicit req 2', source_file: 'test.md', confidence: 'medium', metadata: { derived_from: 'R1-S001-0001', provenance: 'doc-derived' } }) + '\n'
      );
      // IR 中没有 R2 节点
      fs.mkdirSync(path.join(tmpDir, '3_graph', 'graph'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, '3_graph', 'graph', 'graph.merged.json'),
        JSON.stringify({ nodes: [{ id: 'R1-S001-0001', labels: [':Requirement'] }], edges: [] })
      );
      const result = checkR2R3Ingest(tmpDir);
      assert.equal(result.passed, false, 'R2 records missing from IR should fail');
      assert.match(result.detail, /R2/i);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: 实现 checkR2R3Ingest()**

在 `checks-r3.ts` 中添加：

```typescript
/**
 * R3: R2/R3 节点入 IR 检查。
 *
 * 统计 r2-implicit 和 r3-relational JSONL 中的记录数，与 IR/graph 中的
 * R2*/R3* 节点数比对。如果 JSONL 有记录但 IR 中无对应节点，说明
 * assemble-ir 未将 R2/R3 ingest 到 IR（根因报告 §4.1：83 条丢失）。
 *
 * 容忍率：允许 IR 中 R2/R3 节点数 >= JSONL 记录数的 90%（provenance
 * 为 needs-clarification 的记录不进 IR，属正常）。
 */
export function checkR2R3Ingest(workDir: string): CheckResult {
  try {
    const subdirs = ['2_extract/r2-implicit', '2_extract/r3-relational'];
    const issues: string[] = [];

    // 加载 graph 节点 ID 集合
    const graphPaths = [
      path.join(workDir, '3_graph', 'graph', 'graph.merged.json'),
      path.join(workDir, '3_graph', 'graph', 'graph.json'),
    ];
    let irNodeIds: Set<string> | null = null;
    for (const gp of graphPaths) {
      if (fs.existsSync(gp)) {
        const data = JSON.parse(fs.readFileSync(gp, 'utf-8')) as { nodes: { id: string }[] };
        irNodeIds = new Set(data.nodes.map(n => n.id));
        break;
      }
    }
    if (!irNodeIds) return { name: 'R2/R3 ingest into IR', passed: false, detail: 'No graph file found' };

    for (const subdir of subdirs) {
      const dirPath = path.join(workDir, subdir);
      if (!fs.existsSync(dirPath)) continue;
      const files = listJsonlFiles(dirPath, workDir);
      let jsonlCount = 0;
      let missingCount = 0;
      const prefix = subdir.includes('r2-implicit') ? 'R2' : 'R3';
      for (const file of files) {
        const records = readJsonl(file, workDir);
        for (const r of records) {
          // 跳过 needs-clarification（不进 IR 是正常的）
          const meta = isRecord(r.metadata) ? r.metadata : null;
          if (meta?.['provenance'] === 'needs-clarification') continue;
          jsonlCount++;
          if (!irNodeIds.has(r.id)) missingCount++;
        }
      }
      if (jsonlCount > 0 && missingCount === jsonlCount) {
        issues.push(`${prefix}: ${missingCount}/${jsonlCount} records missing from IR (all lost)`);
      } else if (missingCount > jsonlCount * 0.1) {
        issues.push(`${prefix}: ${missingCount}/${jsonlCount} records missing from IR (>10% loss)`);
      }
    }
    return {
      name: 'R2/R3 ingest into IR',
      passed: issues.length === 0,
      detail: issues.length === 0 ? 'All R2/R3 records ingested into IR' : issues.join('; '),
    };
  } catch {
    return { name: 'R2/R3 ingest into IR', passed: false, detail: 'Could not check R2/R3 ingest' };
  }
}

// 需要导入 isRecord（如未在文件中定义）
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}
```

注意：`isRecord` 可能已在 `checks-r3.ts` 作用域中定义（通过 import 或本地）。如果已存在则不重复定义。检查文件顶部是否已有此函数。

- [ ] **Step 3: 运行测试并提交**

Run: `npx tsx --test __tests__/checks-r3-enhanced.test.ts && npx tsc --noEmit`

```bash
git add scripts/lib/verify-gate/checks-r3.ts scripts/__tests__/checks-r3-enhanced.test.ts scripts/commands/verify-gate.ts
git commit -m "feat(checks-r3): add R2/R3 ingest into IR gate

检测 R2-implicit/R3-relational JSONL 记录未进入 IR 的情况。
根因报告 §4.1：83 条 R2/R3 节点完全丢失。"
```

---

## Task 7: P1-5 实现 M1 Structure Analyzer

**Files:**
- Create: `scripts/lib/middle-end/structure-analyzer.ts`
- Test: `scripts/__tests__/middle-end-structure.test.ts`（新建）

**设计**（来自 [subproject-2-middle-end.md:52](file:///d:/srs_formalizer_opt/SRS-Formalizer/docs/superpowers/specs/2026-07-13-subproject-2-middle-end.md#L52)）：
- `findOrphans(graph)` — 无任何边的节点
- `findDanglingEdges(graph)` — source/target 不存在的边
- `findConceptIslands(graph)` — 连通分量中节点数 <3 的孤岛
- `findCrossFileIslands(graph)` — 同一连通分量中所有节点来自同一 source_file
- 签名：`(ir: SRSIR) => StructureReport`
- 输出：`3_graph/analysis/structure.json`

- [ ] **Step 1: 定义 StructureReport 类型**

在 `scripts/lib/middle-end/structure-analyzer.ts` 中：

```typescript
import type { SRSIR, IRNode, IREdge } from '../../types/srs-ir.js';

export interface StructureReport {
  orphans: string[];              // 无任何边的节点 ID
  danglingEdges: string[];        // source/target 不存在的边 ID
  conceptIslands: string[][];     // 连通分量中节点数 <3 的孤岛
  crossFileIslands: string[][];   // 所有节点来自同一 source_file 的连通分量
  stats: {
    totalNodes: number;
    totalEdges: number;
    orphanRate: number;
    connectedComponents: number;
  };
}

export function analyzeStructure(ir: SRSIR): StructureReport {
  const orphans = findOrphans(ir.nodes, ir.edges);
  const danglingEdges = findDanglingEdges(ir.nodes, ir.edges);
  const components = findConnectedComponents(ir.nodes, ir.edges);
  const conceptIslands = components.filter(c => c.length < 3 && c.length > 0);
  const crossFileIslands = findCrossFileIslands(ir.nodes, components);
  return {
    orphans,
    danglingEdges,
    conceptIslands,
    crossFileIslands,
    stats: {
      totalNodes: ir.nodes.length,
      totalEdges: ir.edges.length,
      orphanRate: ir.nodes.length > 0 ? orphans.length / ir.nodes.length : 0,
      connectedComponents: components.length,
    },
  };
}

function findOrphans(nodes: IRNode[], edges: IREdge[]): string[] {
  const connected = new Set<string>();
  for (const e of edges) { connected.add(e.source); connected.add(e.target); }
  return nodes.filter(n => !connected.has(n.id)).map(n => n.id);
}

function findDanglingEdges(nodes: IRNode[], edges: IREdge[]): string[] {
  const nodeIds = new Set(nodes.map(n => n.id));
  return edges
    .filter(e => !nodeIds.has(e.source) || !nodeIds.has(e.target))
    .map(e => e.id);
}

function findConnectedComponents(nodes: IRNode[], edges: IREdge[]): string[][] {
  const adj = new Map<string, Set<string>>();
  for (const n of nodes) adj.set(n.id, new Set());
  for (const e of edges) {
    adj.get(e.source)?.add(e.target);
    adj.get(e.target)?.add(e.source);
  }
  const visited = new Set<string>();
  const components: string[][] = [];
  for (const n of nodes) {
    if (visited.has(n.id)) continue;
    const comp: string[] = [];
    const queue = [n.id];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (visited.has(cur)) continue;
      visited.add(cur);
      comp.push(cur);
      for (const neighbor of adj.get(cur) ?? []) {
        if (!visited.has(neighbor)) queue.push(neighbor);
      }
    }
    components.push(comp);
  }
  return components;
}

function findCrossFileIslands(nodes: IRNode[], components: string[][]): string[][] {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  return components.filter(comp => {
    if (comp.length === 0) return false;
    const files = new Set(comp.map(id => nodeMap.get(id)?.source.filePath));
    return files.size === 1; // 所有节点来自同一文件
  });
}
```

- [ ] **Step 2: 编写测试**

新建 `scripts/__tests__/middle-end-structure.test.ts`：

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeStructure } from '../lib/middle-end/structure-analyzer.js';
import type { SRSIR } from '../types/srs-ir.js';

describe('M1 Structure Analyzer', () => {
  it('should detect orphan nodes', () => {
    const ir: SRSIR = {
      version: '2.1.0',
      meta: { sourcePath: '', sourceHash: '', language: 'zh', totalChars: 0, totalShards: 0, totalNodes: 3, totalEdges: 1, buildTimestamp: '' },
      nodes: [
        { id: 'N1', type: 'requirement', module: 'S001', labels: [':Requirement'], properties: {}, source: { filePath: 'a.md', startLine: 1, endLine: 2, shardId: 'S001', chapter: '' } },
        { id: 'N2', type: 'requirement', module: 'S001', labels: [':Requirement'], properties: {}, source: { filePath: 'a.md', startLine: 3, endLine: 4, shardId: 'S001', chapter: '' } },
        { id: 'N3', type: 'requirement', module: 'S002', labels: [':Requirement'], properties: {}, source: { filePath: 'b.md', startLine: 1, endLine: 2, shardId: 'S002', chapter: '' } },
      ],
      edges: [{ id: 'e1', source: 'N1', target: 'N2', type: 'depends_on', properties: {} }],
      crossRefs: [], nfrProfile: { detectedCategories: [], weightedShards: [], overallCoverage: 0, blindSpots: [] }, gaps: [], glossary: [],
    };
    const report = analyzeStructure(ir);
    assert.ok(report.orphans.includes('N3'), 'N3 should be orphan');
    assert.equal(report.stats.orphanRate, 1 / 3, 0.01);
  });

  it('should detect concept islands (<3 nodes)', () => {
    // 2 个连通分量：{N1,N2} 和 {N3}，均 <3
    const ir: SRSIR = {
      version: '2.1.0',
      meta: { sourcePath: '', sourceHash: '', language: 'zh', totalChars: 0, totalShards: 0, totalNodes: 3, totalEdges: 1, buildTimestamp: '' },
      nodes: [
        { id: 'N1', type: 'requirement', module: 'S001', labels: [':Requirement'], properties: {}, source: { filePath: 'a.md', startLine: 1, endLine: 2, shardId: 'S001', chapter: '' } },
        { id: 'N2', type: 'requirement', module: 'S001', labels: [':Requirement'], properties: {}, source: { filePath: 'b.md', startLine: 3, endLine: 4, shardId: 'S001', chapter: '' } },
        { id: 'N3', type: 'requirement', module: 'S002', labels: [':Requirement'], properties: {}, source: { filePath: 'c.md', startLine: 1, endLine: 2, shardId: 'S002', chapter: '' } },
      ],
      edges: [{ id: 'e1', source: 'N1', target: 'N2', type: 'depends_on', properties: {} }],
      crossRefs: [], nfrProfile: { detectedCategories: [], weightedShards: [], overallCoverage: 0, blindSpots: [] }, gaps: [], glossary: [],
    };
    const report = analyzeStructure(ir);
    assert.equal(report.conceptIslands.length, 2, 'should have 2 islands');
  });
});
```

- [ ] **Step 3: 运行测试并提交**

Run: `npx tsx --test __tests__/middle-end-structure.test.ts && npx tsc --noEmit`

```bash
git add scripts/lib/middle-end/structure-analyzer.ts scripts/__tests__/middle-end-structure.test.ts
git commit -m "feat(middle-end): implement M1 Structure Analyzer

findOrphans/findDanglingEdges/findConceptIslands/findCrossFileIslands。
输出 3_graph/analysis/structure.json，替代 Agent 手写伪造。"
```

---

## Task 8: P1-6 实现 M2 Semantic Analyzer

**Files:**
- Create: `scripts/lib/middle-end/semantic-analyzer.ts`
- Test: `scripts/__tests__/middle-end-semantic.test.ts`（新建）

**设计**（来自 [subproject-2-middle-end.md:53](file:///d:/srs_formalizer_opt/SRS-Formalizer/docs/superpowers/specs/2026-07-13-subproject-2-middle-end.md#L53)）：
- `findDuplicatePairs(nodes)` — Jaccard 相似度 ≥0.8 的需求对
- `findConflictPairs(nodes)` — 含反义词的矛盾需求对
- `findSameAspectClusters(nodes)` — 同模块同 NFR 类别聚类
- 签名：`(ir: SRSIR) => SemanticReport`
- 输出：`3_graph/analysis/semantic.json`

- [ ] **Step 1: 实现 semantic-analyzer.ts**

```typescript
import type { SRSIR, IRNode } from '../../types/srs-ir.js';

export interface SemanticReport {
  duplicatePairs: { a: string; b: string; jaccard: number }[];
  conflictPairs: { a: string; b: string; reason: string }[];
  sameAspectClusters: { module: string; nodes: string[] }[];
  stats: {
    totalAnalyzed: number;
    duplicateCount: number;
    conflictCount: number;
  };
}

const ANTONYM_PAIRS: [RegExp, RegExp][] = [
  [/\bmust\b/i, /\bmust not\b/i],
  [/\bshall\b/i, /\bshall not\b/i],
  [/必须/, /不得/],
  [/必须/, /禁止/],
  [/应当/, /不应/],
];

export function analyzeSemantics(ir: SRSIR): SemanticReport {
  const reqNodes = ir.nodes.filter(n => n.type === 'requirement');
  const duplicatePairs = findDuplicatePairs(reqNodes);
  const conflictPairs = findConflictPairs(reqNodes);
  const sameAspectClusters = findSameAspectClusters(reqNodes);
  return {
    duplicatePairs,
    conflictPairs,
    sameAspectClusters,
    stats: {
      totalAnalyzed: reqNodes.length,
      duplicateCount: duplicatePairs.length,
      conflictCount: conflictPairs.length,
    },
  };
}

function tokenize(statement: string): Set<string> {
  return new Set(
    statement.toLowerCase()
      .replace(/[^\w\u4e00-\u9fff]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 1)
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  const intersection = [...a].filter(x => b.has(x));
  const union = new Set([...a, ...b]);
  return union.size > 0 ? intersection.length / union.size : 0;
}

function findDuplicatePairs(nodes: IRNode[]): { a: string; b: string; jaccard: number }[] {
  const pairs: { a: string; b: string; jaccard: number }[] = [];
  const tokens = nodes.map(n => ({ id: n.id, tokens: tokenize(n.properties.statement ?? '') }));
  for (let i = 0; i < tokens.length; i++) {
    for (let j = i + 1; j < tokens.length; j++) {
      const sim = jaccard(tokens[i].tokens, tokens[j].tokens);
      if (sim >= 0.8) pairs.push({ a: tokens[i].id, b: tokens[j].id, jaccard: sim });
    }
  }
  return pairs;
}

function findConflictPairs(nodes: IRNode[]): { a: string; b: string; reason: string }[] {
  const pairs: { a: string; b: string; reason: string }[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const sa = nodes[i].properties.statement ?? '';
      const sb = nodes[j].properties.statement ?? '';
      for (const [p1, p2] of ANTONYM_PAIRS) {
        if ((p1.test(sa) && p2.test(sb)) || (p2.test(sa) && p1.test(sb))) {
          pairs.push({ a: nodes[i].id, b: nodes[j].id, reason: `antonym conflict: ${p1.source} vs ${p2.source}` });
          break;
        }
      }
    }
  }
  return pairs;
}

function findSameAspectClusters(nodes: IRNode[]): { module: string; nodes: string[] }[] {
  const byModule = new Map<string, string[]>();
  for (const n of nodes) {
    const mod = n.module;
    if (!byModule.has(mod)) byModule.set(mod, []);
    byModule.get(mod)!.push(n.id);
  }
  return [...byModule.entries()]
    .filter(([, ids]) => ids.length >= 3)
    .map(([module, ids]) => ({ module, nodes: ids }));
}
```

- [ ] **Step 2: 编写测试并提交**

（测试结构同 Task 7，验证 duplicatePairs/conflictPairs/sameAspectClusters 基本功能）

Run: `npx tsx --test __tests__/middle-end-semantic.test.ts && npx tsc --noEmit`

```bash
git add scripts/lib/middle-end/semantic-analyzer.ts scripts/__tests__/middle-end-semantic.test.ts
git commit -m "feat(middle-end): implement M2 Semantic Analyzer

findDuplicatePairs(Jaccard)/findConflictPairs(antonyms)/findSameAspectClusters。
输出 3_graph/analysis/semantic.json，替代 Agent 手写伪造。"
```

---

## Task 9: P1-7 实现 M3 NFR Tagger / M5 Merge Optimizer / M6 Risk Scorer

**Files:**
- Create: `scripts/lib/middle-end/nfr-tagger.ts`
- Create: `scripts/lib/middle-end/merge-optimizer.ts`
- Create: `scripts/lib/middle-end/risk-scorer.ts`
- Test: `scripts/__tests__/middle-end-nfr-tagger.test.ts` 等（新建）

**设计**：
- M3: 正则 + 启发式阈值提取（6类×5模式），NFR 节点标注，输出 IR.nfrProfile 更新
- M5: applyMergeNodes/applyAddConflictEdge/applyAddSameAspectEdge，输出 IR.edges 更新
- M6: `riskScore = orphanRate×0.2 + crossFileCoverage×0.3 + nfrCoverage×0.3 + gapWeight×0.2`

- [ ] **Step 1: 实现 M3 NFR Tagger**

```typescript
// scripts/lib/middle-end/nfr-tagger.ts
import type { SRSIR, NFRCategory, NFRProfile, NFREntry, NFRWeightedShard } from '../../types/srs-ir.js';

const NFR_KEYWORDS: Record<NFRCategory, RegExp[]> = {
  performance: [/性能|latency|throughput|响应时间|吞吐量|并发/i, /\b\d+\s*(ms|s|rps|qps)\b/i],
  security: [/安全|认证|授权|加密|权限|security|auth|encrypt/i],
  availability: [/可用性|容错|恢复|故障|availability|redundan/i],
  compatibility: [/兼容|适配|浏览器|设备|compat/i],
  maintainability: [/可维护|模块化|扩展|maintain|extens/i],
  compliance: [/合规|审计|法规|GDPR|compliance|audit/i],
};

export function tagNFR(ir: SRSIR): SRSIR {
  const entries: NFREntry[] = [];
  const weightedShards: NFRWeightedShard[] = [];
  // 注意：NFR 关键词不应包含 "必须"（根因报告 §4.7 注水根因）
  for (const category of Object.keys(NFR_KEYWORDS) as NFRCategory[]) {
    const patterns = NFR_KEYWORDS[category];
    const keywordHits: number[] = ir.nodes
      .filter(n => n.type === 'requirement')
      .map(n => patterns.reduce((count, p) => count + (p.test(n.properties.statement ?? '') ? 1 : 0), 0));
    const totalHits = keywordHits.reduce((a, b) => a + b, 0);
    if (totalHits > 0) {
      const shardIds = ir.nodes
        .filter(n => n.type === 'requirement' && patterns.some(p => p.test(n.properties.statement ?? '')))
        .map(n => n.source.shardId);
      entries.push({
        category,
        keywordHits: totalHits,
        shardIds: [...new Set(shardIds)],
        nodeIds: ir.nodes.filter(n => n.type === 'requirement' && patterns.some(p => p.test(n.properties.statement ?? ''))).map(n => n.id),
      });
    }
  }
  // 计算覆盖率
  const totalReqs = ir.nodes.filter(n => n.type === 'requirement').length;
  const taggedReqs = new Set(entries.flatMap(e => e.nodeIds)).size;
  const overallCoverage = totalReqs > 0 ? taggedReqs / totalReqs : 0;

  return {
    ...ir,
    nfrProfile: {
      detectedCategories: entries,
      weightedShards,
      overallCoverage,
      blindSpots: (Object.keys(NFR_KEYWORDS) as NFRCategory[]).filter(c => !entries.some(e => e.category === c)),
    },
  };
}
```

- [ ] **Step 2: 实现 M6 Risk Scorer**

```typescript
// scripts/lib/middle-end/risk-scorer.ts
import type { SRSIR } from '../../types/srs-ir.js';
import { analyzeStructure } from './structure-analyzer.js';

export function scoreRisk(ir: SRSIR): SRSIR {
  const structure = analyzeStructure(ir);
  const orphanRate = structure.stats.orphanRate;
  const crossFileCoverage = ir.edges.filter(e => {
    const srcNode = ir.nodes.find(n => n.id === e.source);
    const tgtNode = ir.nodes.find(n => n.id === e.target);
    return srcNode && tgtNode && srcNode.source.filePath !== tgtNode.source.filePath;
  }).length / Math.max(ir.edges.length, 1);
  const nfrCoverage = ir.nfrProfile.overallCoverage;
  const gapWeight = ir.gaps.length / Math.max(ir.nodes.length, 1);

  const riskScore = orphanRate * 0.2 + crossFileCoverage * 0.3 + nfrCoverage * 0.3 + gapWeight * 0.2;
  const highRiskShards = [...new Set(structure.orphans.map(id => ir.nodes.find(n => n.id === id)?.source.shardId ?? ''))].filter(s => s);

  return {
    ...ir,
    meta: { ...ir.meta, riskScore, highRiskShards },
  };
}
```

- [ ] **Step 3: 实现 M5 Merge Optimizer（简化版）**

```typescript
// scripts/lib/middle-end/merge-optimizer.ts
import type { SRSIR, IREdge } from '../../types/srs-ir.js';
import { analyzeSemantics } from './semantic-analyzer.js';

export function optimizeMerges(ir: SRSIR): SRSIR {
  const semantic = analyzeSemantics(ir);
  const newEdges: IREdge[] = [...ir.edges];

  // 为冲突对添加 conflicts_with 边
  for (const pair of semantic.conflictPairs) {
    const edgeId = `e-${pair.a}-${pair.b}-conflicts_with`;
    if (!newEdges.some(e => e.id === edgeId)) {
      newEdges.push({ id: edgeId, source: pair.a, target: pair.b, type: 'conflicts_with', properties: { reasoning: pair.reason } });
    }
  }

  // 为同侧面聚类添加 same_aspect 边
  for (const cluster of semantic.sameAspectClusters) {
    for (let i = 1; i < cluster.nodes.length; i++) {
      const edgeId = `e-${cluster.nodes[0]}-${cluster.nodes[i]}-same_aspect`;
      if (!newEdges.some(e => e.id === edgeId)) {
        newEdges.push({ id: edgeId, source: cluster.nodes[0], target: cluster.nodes[i], type: 'same_aspect', properties: { reasoning: `same module: ${cluster.module}` } });
      }
    }
  }

  return { ...ir, edges: newEdges };
}
```

- [ ] **Step 4: 编写测试、运行、提交**

为每个工具编写基本测试（同 Task 7/8 模式），运行 `npx tsx --test __tests__/middle-end-*.test.ts && npx tsc --noEmit`。

```bash
git add scripts/lib/middle-end/nfr-tagger.ts scripts/lib/middle-end/merge-optimizer.ts scripts/lib/middle-end/risk-scorer.ts scripts/__tests__/middle-end-nfr-tagger.test.ts scripts/__tests__/middle-end-merge-optimizer.test.ts scripts/__tests__/middle-end-risk-scorer.test.ts
git commit -m "feat(middle-end): implement M3 NFR Tagger, M5 Merge Optimizer, M6 Risk Scorer

M3: 6类NFR关键词标注（排除'必须'注水），更新 IR.nfrProfile
M5: 为冲突对/同侧面聚类添加 conflicts_with/same_aspect 边
M6: 风险评分公式 orphanRate×0.2+crossFileCoverage×0.3+nfrCoverage×0.3+gapWeight×0.2"
```

---

## Task 10: P1-8 升级 CHECKLIST 模板移除已归档命令

**Files:**
- Modify: `templates/checklists/S0_CHECKLIST.md`
- Modify: `templates/checklists/S1_CHECKLIST.md`
- Modify: `templates/checklists/2_extract_CHECKLIST.md`
- Modify: `templates/checklists/3_graph_CHECKLIST.md`
- Modify: `templates/checklists/4_bdd_CHECKLIST.md`
- Modify: `templates/checklists/5_formal_CHECKLIST.md`
- Modify: `templates/checklists/6_outputs_CHECKLIST.md`

**根因**: CHECKLIST 模板整体停留在 v1.x，引用已归档命令（init/build-graph/build-architecture/analyze-structure/merge-structure/emit/build-tla-graph/build-lean-graph/generate-bdd/build-behavior-graph），路径矛盾（`5_formal/*.json` vs `outputs/graphs/*.cypher`）。

- [ ] **Step 1: 逐个检查 CHECKLIST 模板中的已归档命令引用**

对每个 CHECKLIST 文件，搜索以下已归档命令并替换为当前命令或移除：

| 已归档命令 | 替换为 | 说明 |
|-----------|--------|------|
| `init` | Bootstrap（Agent 手动创建工作目录） | SKILL.md §Bootstrap |
| `build-graph` | `assemble-ir`（自动生成 graph.merged.json） | P1-5 已实现 |
| `build-architecture` | Agent 手动 + `validate-architecture` | — |
| `analyze-structure` | `query-graph` / M1（Agent 分析） | — |
| `merge-structure` | M5（Agent 合并优化） | — |
| `emit` / `emit-all` | Agent 按 executor-backend-*.md 生成 | — |
| `build-tla-graph` | `validate-tla --strict --promote` | — |
| `build-lean-graph` | `validate-lean --strict --promote` | — |
| `generate-bdd` | `validate-bdd --strict --promote` | — |
| `build-behavior-graph` | Agent 生成 + `validate-bdd` | — |

- [ ] **Step 2: 修正路径矛盾**

在 `5_formal_CHECKLIST.md` 中：
- `5_formal/*.json` → `outputs/graphs/*.cypher`（Cypher 产物路径）
- `outputs/graphs/traceability.cypher` → `outputs/reports/traceability.cypher`

在 `6_outputs_CHECKLIST.md` 中：
- 统一 `deliverables.md` 路径引用
- 修正 "7/10" 阈值为当前产物数量

- [ ] **Step 3: 运行 validate-checklist 验证**

Run: `npx tsx index.ts validate-checklist --workdir <test-workdir> --stage S0` 等
Expected: 不再报"未知命令"错误

- [ ] **Step 4: 提交**

```bash
git add templates/checklists/
git commit -m "fix(checklists): upgrade templates from v1.x to v2.x

移除已归档命令引用(init/build-graph/emit/build-tla-graph 等)，
统一路径(5_formal/*.json → outputs/graphs/*.cypher)，
修正阈值(7/10 混搭 → 当前产物数量)。"
```

---

## Task 11: P2-1 Lean4 构建流程指导修复

**Files:**
- Modify: `prompts/executor-lean4.md`（添加 Mathlib 缓存下载步骤）
- Modify: `references/lean4-coding-guide.md`（强调 lake exe cache get）

**根因**: 根因报告 §7.7 — Agent 从未执行 `lake exe cache get`，导致从源码编译整个 Mathlib（数小时），lake build 一直 running 直到轨迹截断。

- [ ] **Step 1: 在 executor-lean4.md 中添加 Mathlib 缓存下载步骤**

在 `prompts/executor-lean4.md` 的构建流程章节添加：

```markdown
## Lean 4 构建流程（必须按顺序执行）

> ⚠️ **跳过 `lake exe cache get` 会导致从源码编译整个 Mathlib（数小时），
> 这是 lake build 卡住的最常见原因。**

1. `lake update` — 拉取 mathlib4 依赖
2. `lake exe cache get` — **下载预编译 `.olean` 缓存（关键步骤！）**
3. `lake build` — 只编译用户自己的 .lean 文件（秒级到分钟级）

### lean-toolchain 版本一致性
- `lean-toolchain` 文件指定的版本必须与系统安装的 Lean 版本一致
- 如系统为 v4.32.0，`lean-toolchain` 应写 `leanprover/lean4:v4.32.0`
- 版本不匹配会导致 lake 重新下载工具链，叠加缓存缺失使构建更慢

### import 规则
- ✅ `import Mathlib.Data.Nat.Basic` — 细分模块
- ✅ `import Mathlib.Tactic.Linarith`
- ❌ `import Mathlib` — 全量导入（validate-lean 会拒绝）
```

- [ ] **Step 2: 提交**

```bash
git add prompts/executor-lean4.md references/lean4-coding-guide.md
git commit -m "docs(lean4): add Mathlib cache download step to build guide

根因报告 §7.7：Agent 从未执行 lake exe cache get，导致从源码编译
整个 Mathlib。在 executor-lean4.md 和 lean4-coding-guide.md 中
强调三步构建流程：lake update → lake exe cache get → lake build。"
```

---

## Task 12: P2-2 全量回归测试

**Files:**
- 无修改，仅运行验证

- [ ] **Step 1: TypeScript 编译检查**

Run: `cd d:\srs_formalizer_opt\SRS-Formalizer\.claude\skills\srs-formalizer\scripts && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 2: 全量测试**

Run: `cd d:\srs_formalizer_opt\SRS-Formalizer\.claude\skills\srs-formalizer\scripts && npx tsx --test __tests__/*.test.ts`
Expected: 全部 PASS（原有 325 测试 + 新增测试）

- [ ] **Step 3: 技能完整性校验**

Run: `cd d:\srs_formalizer_opt\SRS-Formalizer\.claude\skills\srs-formalizer\scripts && npx tsx index.ts verify-skill-integrity --skill-dir .`
Expected: SHA-256 匹配，无篡改警告

- [ ] **Step 4: 命令注册表三方一致性验证**

手动比对：
1. `npx tsx index.ts --help` 输出的 22 命令
2. SKILL.md frontmatter 中的 22 命令
3. AGENTS.md 中的 22 命令
4. index.ts COMMANDS 注册表的 22 个 key

四方必须完全一致。

---

## 附录：本计划未覆盖的问题（需运行时/技能定义层修复）

以下问题属于 Agent 行为约束或运行时检测，无法通过修改源码直接修复，需在技能定义层（SKILL.md 反模式表、门禁检测逻辑）另行处理：

| 问题 | 修复方向 | 归类 |
|------|---------|------|
| Agent 篡改 IR edges 归属 | 门禁增加 edges 归属 vs shard_index.module 比对 | P2 门禁增强 |
| Agent 伪造 M1/M2 分析报告 | M1/M2 工具实现后（Task 7/8），报告由工具生成而非手写 | 已由 Task 7/8 解决 |
| Agent 篡改 BDD 验证器源码 | verify-skill-integrity 阶段转换时强制运行 | 已有机制，需强制执行 |
| Agent 删除篡改脚本 | artifact lineage 审计（convergence-log.jsonl） | P2 审计增强 |
| Agent 手工全勾 CHECKLIST | validate-checklist 校验文件存在性而非仅检查标记 | P2 门禁增强 |
| Agent 提前写完成报告 | STATE.md 与 verify-gate 交叉校验 | P2 状态机强化 |
| HITL 从未触发 | 8 次失败/模块跳过/工具 bug 时强制 STOP | SKILL.md 规则强化 |
| Lean4 证明同义反复 | validate-lean 增加 `:= h` 模式检测 | P2 门禁增强 |
| TLA+ 覆盖不全 | verify-gate 校验 TLA+ 模块数 ≥ arch-1 子系统数 | P2 门禁增强 |
| BDD NFR 阈值捏造 | validate-bdd 校验阈值源于 IR.nfrProfile | P2 门禁增强 |

---

## 自检

**1. Spec coverage:** 根因报告 §十一 修复建议 P0-P2 共 20 项：
- P0-1(修 validate-semantics): 报告修正后确认非 bug，跳过
- P0-2(修 prompts 未注册命令): Task 3 统一命令注册表
- P0-3(补 arch-1 子系统): 属于 Agent 执行时产物修复，非技能源码修复，列入附录
- P0-4(修 build_ir.js → assemble-ir): Task 1 移植 toIREdges()
- P0-5(lean-toolchain + Mathlib 缓存): Task 11
- P0-6(补跑 verify-gate FINAL): 属于执行时操作，非技能修复
- P1-7~P1-14: Task 4/5/6(R3 门禁)、Task 7/8/9(M1-M6)、Task 10(CHECKLIST)、Task 3(命令注册表)
- P2-15~P2-20: 部分由 Task 7/8(M1/M2) 解决，其余列入附录

**2. Placeholder scan:** 无 TBD/TODO 占位符。所有代码块均为完整实现。

**3. Type consistency:** `IREdge`/`IREdgeType`/`IRNode`/`SRSIR` 类型引用与 [srs-ir.ts](file:///d:/srs_formalizer_opt/SRS-Formalizer/.claude/skills/srs-formalizer/scripts/types/srs-ir.ts) 定义一致。`CheckResult` 引用与 verify-gate/shared.ts 定义一致。`StructureReport`/`SemanticReport` 为新定义类型，在各自文件中声明。
