/**
 * checks-r3-relational.ts — R3 relational-stage verification checks
 *
 * 从 checks-r3.ts 拆出：与 r2-implicit / r3-relational JSONL ingest 相关的检查。
 * loadIR 由 shared.ts 共享，避免与 checks-r3.ts 形成循环依赖。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { readJsonl, listJsonlFiles } from '../jsonl.js';
import { loadIR, type CheckResult } from './shared.js';

/**
 * R3: R2/R3 节点入 IR 检查。
 *
 * 统计 r2-implicit 和 r3-relational JSONL 中的记录数，与 IR/graph 中的
 * R2 / R3 节点数比对。如果 JSONL 有记录但 IR 中无对应节点，说明
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
      path.join(workDir, '3_graph', 'graph', 'graph.structure_fixed.json'),
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
          const provenance = r.metadata?.['provenance'];
          if (typeof provenance === 'string' && provenance === 'needs-clarification') continue;
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
  } catch (err) {
    return { name: 'R2/R3 ingest into IR', passed: false, detail: `Could not check R2/R3 ingest: ${(err as Error).message}` };
  }
}

/**
 * P1: R3 关系 ingest 直接检查。
 * 扫描 2_extract/r3-relational/*.jsonl 中的 metadata.relation，
 * 验证每条 relation 是否在 srs-ir.json 的 edges 中有对应项。
 * 100% 缺失或 >50% 丢失意味着 R3 关系提取结果未进入 IR。
 */
export function checkR3RelationIngest(workDir: string): CheckResult {
  const name = 'r3-relation ingest';
  try {
    const ir = loadIR(workDir);
    if (!ir) return { name, passed: true, detail: 'No srs-ir.json (skipped)' };
    const r3Dir = path.join(workDir, '2_extract', 'r3-relational');
    if (!fs.existsSync(r3Dir)) return { name, passed: true, detail: 'no r3-relational directory (nothing to check)' };
    // 构建 IR edge 集合 (source, type, target)
    const edgeSet = new Set<string>();
    for (const edge of ir.edges) {
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
  } catch (err) {
    return { name, passed: false, detail: `Could not check r3-relation ingest: ${(err as Error).message}` };
  }
}

/**
 * P1: r3-relational 最低阈值。
 * 当 R1 记录数 > 10 时，r3-relational 至少应有 3 条记录。
 * 阈值以下意味着关系提取不充分（大量需求但很少关系）。
 */
export function checkR3RelationalThreshold(workDir: string): CheckResult {
  const name = 'r3-relational minimum threshold';
  try {
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
  } catch (err) {
    return { name, passed: false, detail: `Could not check r3-relational minimum threshold: ${(err as Error).message}` };
  }
}
