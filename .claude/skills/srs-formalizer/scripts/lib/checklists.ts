/**
 * lib/checklists.ts — 共享的 CHECKLIST.md 定义和操作
 *
 * 用于 init.ts（初始化时写入）和 validate-checklist.ts（校验+修复）。
 * 单一数据源，保证模板和校验规则一致。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// CHECKLIST 内容（每个阶段目录下的 CHECKLIST.md 全文）
// ---------------------------------------------------------------------------

export const CHECKLISTS: Record<string, string> = {
  'S0': `# S0 发现与确认 — 清单

- [ ] SRS 文件路径确认且可读
- [ ] 文件格式识别（.md / .html / 多目录）
- [ ] §7 未解决问题已扫描
- [ ] 术语表检测（存在 / 缺失）
- [ ] TLA+ 触发条件已检测
- [ ] Lean 4 触发条件已检测
- [ ] 用户已确认阶段触发方案
- [ ] 用户已确认语言偏好（zh/en）
`,
  '2_extract': `# S2 需求提取 — 验收清单

## R1 (S2.1)
- [ ] r1-explicit/ 下文件数 == total_shards
- [ ] validate-jsonl 全部 PASS（id 格式、category 枚举、metadata 存在）
- [ ] 空分片输出空文件

## Arch-1 (S2.2)
- [ ] architecture/arch-1.jsonl 存在且非空
- [ ] validate-architecture PASS
- [ ] 全部 R1 id 被恰好一个 arch 条目 contains
- [ ] type 仅 module/actor/constraint，无循环

## R2 (S2.3)
- [ ] r2-implicit/ 下文件数 == total_shards
- [ ] validate-jsonl 全部 PASS
- [ ] 每条 metadata.derived_from 存在且引用真实 R1 id

## Arch-2 (S2.4)
- [ ] architecture/arch-2.jsonl 存在
- [ ] validate-architecture PASS

## R3-1 (S2.5)
- [ ] r3-relational/ 下有 JSONL 文件
- [ ] validate-jsonl 全部 PASS
- [ ] metadata.relation ∈ {DEPENDS_ON,REFINES,CONFLICTS_WITH}

## Arch-3 (S2.6)
- [ ] architecture/arch-3.jsonl 存在
- [ ] validate-architecture PASS

## R3-2 (S2.7)
- [ ] r3-relational/ 最终文件完整
- [ ] validate-jsonl 全部 PASS
`,
  '3_graph': `# S3 图谱构建 — 验收清单

- [ ] build-ir 成功：srs-ir.json 存在，节点数 ≥ JSONL 记录数
- [ ] build-architecture 成功：Module/Actor/Constraint 节点存在
- [ ] analyze-structure 完成：orphan/dangling/island/cross-file 报告
- [ ] analyze-graph 完成：duplicate/conflict/cluster 报告
- [ ] emit --name cypher 成功：srs-graph.cypher 非空
- [ ] validate-cypher PASS
- [ ] tag-nfr 完成：NFR 节点标注 + 阈值提取
- [ ] verify-gate R3 PASS（边完整性检查）
`,
  '4_bdd': `# S4 BDD 生成 — 验收清单

- [ ] emit --name gherkin 成功：feature 文件数 ≥ 模块数
- [ ] 每个 .feature 含 # SYSTEM: # TRACE: 头部
- [ ] 每个 Scenario 含 Given/When/Then
- [ ] 无 <THEN_PLACEHOLDER> 残留
- [ ] 每个 Then 含 # verification_method:
- [ ] validate-bdd --strict PASS
`,
  '5_formal': `# S5 形式化 — 验收清单

## TLA+（条件触发）
- [ ] 触发条件已确认（S0 Discovery）
- [ ] 工具链 Java+TLC 就绪
- [ ] TLC 验证：无死锁/无不变量违反/无状态爆炸
- [ ] SPECS.md 索引已更新

## Lean 4（条件触发）
- [ ] 触发条件已确认
- [ ] 工具链 elan+lake 就绪
- [ ] lake build 通过：无 sorry/无告警/无 axiom
- [ ] PROOFS.md 索引已更新
`,
  '6_outputs': `# S6 验收闸门 — 最终清单

- [ ] verify-gate --stage FINAL：全部 PASS
- [ ] STATE.md 所有阶段 ✅
- [ ] MINDMAP.md 全部模块 ✅
- [ ] srs-graph.cypher 可导入 Neo4j
- [ ] brainstorm_context.json 存在
- [ ] 全链路 S1→S6 完整
`,
};

// ---------------------------------------------------------------------------
// 结构完整性定义（与 CHECKLISTS 内容严格对应）
// ---------------------------------------------------------------------------

export interface CanonicalDef {
  expected_count: number;
  required_headers: string[];
  required_phrases: string[];
}

export const CANONICAL: Record<string, CanonicalDef> = {
  'S0': {
    expected_count: 8,
    required_headers: ['S0', '发现', '确认'],
    required_phrases: ['SRS', '文件路径', '格式识别', 'TLA+', 'Lean', '触发', '用户', '确认'],
  },
  '2_extract': {
    expected_count: 23,
    required_headers: ['S2', '需求提取', 'R1', 'Arch-1', 'R2', 'Arch-2', 'R3-1', 'Arch-3', 'R3-2'],
    required_phrases: ['validate-jsonl', 'validate-architecture', 'category', 'metadata', 'derived_from', 'DEPENDS_ON', 'REFINES', 'CONFLICTS_WITH'],
  },
  '3_graph': {
    expected_count: 7,
    required_headers: ['S3', '图谱构建', '验收清单'],
    required_phrases: ['build-ir', 'build-architecture', 'analyze-structure', 'emit --name cypher', 'validate-cypher', '边完整性'],
  },
  '4_bdd': {
    expected_count: 6,
    required_headers: ['S4', 'BDD', '验收清单'],
    required_phrases: ['emit --name gherkin', '# SYSTEM:', 'Given', 'When', 'Then', 'THEN_PLACEHOLDER', 'verification_method', 'validate-bdd --strict'],
  },
  '5_formal': {
    expected_count: 8,
    required_headers: ['S5', '形式化', 'TLA+', 'Lean'],
    required_phrases: ['触发条件', '工具链', 'TLC', 'lake build', 'sorry', 'PROOFS.md'],
  },
  '6_outputs': {
    expected_count: 6,
    required_headers: ['S6', '验收闸门', '最终清单'],
    required_phrases: ['verify-gate', 'STATE.md', 'MINDMAP.md', 'srs-graph.cypher', 'brainstorm_context.json', '全链路'],
  },
};

// ---------------------------------------------------------------------------
// 操作
// ---------------------------------------------------------------------------

/** 将 CHECKLISTS 写入工作目录的各阶段子目录 */
export function writeChecklists(workDir: string): void {
  const stageDirs = ['S0', '2_extract', '3_graph', '4_bdd', '5_formal', '6_outputs'];
  for (const dir of stageDirs) {
    const content = CHECKLISTS[dir];
    if (content) {
      fs.writeFileSync(path.join(workDir, dir, 'CHECKLIST.md'), content, 'utf-8');
    }
  }
}

/** 从模板重建单个阶段的 CHECKLIST.md（删除旧文件，写入全新模板） */
export function repairChecklist(workDir: string, stage: string): { repaired: boolean; message: string } {
  const content = CHECKLISTS[stage];
  if (!content) {
    return { repaired: false, message: `Unknown stage: ${stage}` };
  }
  const filePath = path.join(workDir, stage, 'CHECKLIST.md');
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return { repaired: true, message: `Regenerated ${stage}/CHECKLIST.md from template` };
  } catch (err) {
    return { repaired: false, message: `Failed to write: ${(err as Error).message}` };
  }
}

/** 根据文件路径推断阶段名 */
export function inferStage(filePath: string): string | null {
  const parentDir = path.basename(path.dirname(filePath));
  if (CANONICAL[parentDir]) return parentDir;
  const base = path.basename(filePath, path.extname(filePath));
  for (const stage of Object.keys(CANONICAL)) {
    if (base.includes(stage)) return stage;
  }
  return null;
}
