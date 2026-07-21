/**
 * checks-r3.ts — R3 stage verification checks
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { readJsonl, listJsonlFiles } from '../jsonl.js';
import { Graph, type GraphData } from '../graph.js';
import { checkConnectivity, analyzeAtomicTree } from '../middle-end/connectivity-checker.js';
import type { SRSIR } from '../../types/srs-ir.js';
import type { CheckResult } from './shared.js';

function loadIR(workDir: string): SRSIR | null {
  const irPath = path.join(workDir, 'srs-ir.json');
  if (!fs.existsSync(irPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(irPath, 'utf-8')) as SRSIR;
  } catch {
    return null;
  }
}

export function checkAllJsonlDirsHaveFiles(workDir: string): CheckResult {
  const jsonlDirs = ['2_extract/r1-explicit', '2_extract/r2-implicit', '2_extract/r3-relational'];
  const results: string[] = [];
  let allHaveFiles = true;

  for (const subdir of jsonlDirs) {
    const dirPath = path.join(workDir, subdir);
    if (!fs.existsSync(dirPath)) {
      results.push(`${subdir}: directory not found`);
      allHaveFiles = false;
      continue;
    }
    try {
      const files = listJsonlFiles(dirPath, workDir);
      if (files.length === 0) {
        results.push(`${subdir}: 0 files`);
        allHaveFiles = false;
      } else {
        results.push(`${subdir}: ${files.length} file(s)`);
      }
    } catch {
      results.push(`${subdir}: error reading`);
      allHaveFiles = false;
    }
  }

  return {
    name: 'JSONL existence (all subdirectories)',
    passed: allHaveFiles,
    detail: results.join('; '),
  };
}

export function checkIdUniqueness(workDir: string): CheckResult {
  const jsonlDirs = ['2_extract/r1-explicit', '2_extract/r2-implicit', '2_extract/r3-relational'];
  const seenIds = new Set<string>();
  const duplicateIds: string[] = [];

  for (const subdir of jsonlDirs) {
    const dirPath = path.join(workDir, subdir);
    if (!fs.existsSync(dirPath)) continue;
    try {
      const files = listJsonlFiles(dirPath, workDir);
      for (const filePath of files) {
        const records = readJsonl(filePath, workDir);
        for (const record of records) {
          if (seenIds.has(record.id)) {
            duplicateIds.push(record.id);
          } else {
            seenIds.add(record.id);
          }
        }
      }
    } catch { /* skip unreadable dirs */ }
  }

  const isUnique = duplicateIds.length === 0;
  return {
    name: 'ID uniqueness (no duplicates across files)',
    passed: isUnique,
    detail: isUnique ? 'All IDs unique' : `Duplicate IDs found: ${[...new Set(duplicateIds)].join(', ')}`,
  };
}

export function checkGraphLoadable(workDir: string): CheckResult {
  const mergedPath = path.join(workDir, '3_graph', 'graph', 'graph.merged.json');
  const basePath = path.join(workDir, '3_graph', 'graph', 'graph.json');
  let graphFile: string | null = null;

  if (fs.existsSync(mergedPath)) {
    graphFile = mergedPath;
  } else if (fs.existsSync(basePath)) {
    graphFile = basePath;
  }

  if (!graphFile) {
    return {
      name: 'Graph loadable',
      passed: false,
      detail: 'No graph file found (tried graph/graph.merged.json and graph/graph.json)',
    };
  }

  try {
    const raw = fs.readFileSync(graphFile, 'utf-8');
    const graphData = JSON.parse(raw) as GraphData;
    Graph.fromJSON(graphData);
    return {
      name: 'Graph loadable',
      passed: true,
      detail: `Loaded from graph/${path.basename(graphFile)}`,
    };
  } catch (err) {
    return {
      name: 'Graph loadable',
      passed: false,
      detail: `Failed to load graph: ${(err as Error).message}`,
    };
  }
}

export function checkNodeCountVsR1(workDir: string): CheckResult {
  // Count R1 explicit JSONL records
  let r1Count = 0;
  const r1Dir = path.join(workDir, '2_extract', 'r1-explicit');
  if (fs.existsSync(r1Dir)) {
    try {
      const files = listJsonlFiles(r1Dir, workDir);
      for (const filePath of files) {
        const records = readJsonl(filePath, workDir);
        r1Count += records.length;
      }
    } catch { /* ignore */ }
  }

  // Get node count from graph
  const mergedPath = path.join(workDir, '3_graph', 'graph', 'graph.merged.json');
  const basePath = path.join(workDir, '3_graph', 'graph', 'graph.json');
  const graphFile = fs.existsSync(mergedPath) ? mergedPath : (fs.existsSync(basePath) ? basePath : null);

  if (!graphFile) {
    return {
      name: 'Node count >= R1 explicit requirements',
      passed: false,
      detail: 'Cannot check: no graph file found',
    };
  }

  let nodeCount = 0;
  try {
    const raw = fs.readFileSync(graphFile, 'utf-8');
    const graphData = JSON.parse(raw) as GraphData;
    nodeCount = graphData.nodes.length;
  } catch (err) {
    return {
      name: 'Node count >= R1 explicit requirements',
      passed: false,
      detail: `Cannot check: ${(err as Error).message}`,
    };
  }

  const ok = nodeCount >= r1Count;
  return {
    name: 'Node count >= R1 explicit requirements',
    passed: ok,
    detail: ok
      ? `${nodeCount} nodes >= ${r1Count} R1 requirements`
      : `Only ${nodeCount} nodes but ${r1Count} R1 requirements (missing ${r1Count - nodeCount})`,
  };
}

/** R3: 验证架构 JSONL 文件存在且非空 */
export function checkArchitectureExists(workDir: string): CheckResult {
  try {
    const archDir = path.join(workDir, '2_extract', 'architecture');
    if (!fs.existsSync(archDir)) {
      return { name: 'Architecture JSONL exists', passed: false, detail: 'architecture/ directory not found' };
    }
    const files = fs.readdirSync(archDir).filter(f => f.endsWith('.jsonl'));
    if (files.length === 0) {
      return { name: 'Architecture JSONL exists', passed: false, detail: 'No architecture JSONL files' };
    }
    const empty: string[] = [];
    for (const f of files) {
      const stat = fs.statSync(path.join(archDir, f));
      if (stat.size === 0) empty.push(f);
    }
    return {
      name: 'Architecture JSONL exists',
      passed: true,
      detail: `${files.length} file(s)${empty.length > 0 ? ` (empty: ${empty.join(',')})` : ''}`,
    };
  } catch {
    return { name: 'Architecture JSONL exists', passed: false, detail: 'Could not check architecture' };
  }
}

/** 最大允许孤儿率（无任何边的节点占比）。超过即阻塞（proposal §P1-1）。 */
export const ORPHAN_RATIO_THRESHOLD = 0.1;

/**
 * R3: 孤儿率门禁（proposal §P1-1）。统计图谱中不参与任何边（既非 source 也非
 * target）的节点占比，超过 ORPHAN_RATIO_THRESHOLD 即判为 error，避免 R2/R3
 * 关系需求悬空被带入后端。空图（0 节点）视为通过，交由其它检查处理。
 */
export function checkOrphanRatio(workDir: string): CheckResult {
  try {
    const graphPaths = [
      path.join(workDir, '3_graph', 'graph', 'graph.merged.json'),
      path.join(workDir, '3_graph', 'graph', 'graph.structure_fixed.json'),
      path.join(workDir, '3_graph', 'graph', 'graph.json'),
    ];
    let graphData: { nodes: { id: string }[]; edges: { source: string; target: string }[] } | null = null;
    for (const gp of graphPaths) {
      if (fs.existsSync(gp)) { graphData = JSON.parse(fs.readFileSync(gp, 'utf-8')); break; }
    }
    if (!graphData) return { name: 'Orphan ratio within threshold', passed: false, detail: 'No graph file found' };
    const total = graphData.nodes.length;
    if (total === 0) return { name: 'Orphan ratio within threshold', passed: true, detail: 'Empty graph (0 nodes)' };
    const connected = new Set<string>();
    for (const e of graphData.edges) { connected.add(e.source); connected.add(e.target); }
    const orphans = graphData.nodes.filter(n => !connected.has(n.id)).map(n => n.id);
    const ratio = orphans.length / total;
    const passed = ratio <= ORPHAN_RATIO_THRESHOLD;
    return {
      name: 'Orphan ratio within threshold',
      passed,
      detail: passed
        ? `orphan_ratio ${ratio.toFixed(3)} <= ${ORPHAN_RATIO_THRESHOLD} (${orphans.length}/${total})`
        : `orphan_ratio ${ratio.toFixed(3)} > ${ORPHAN_RATIO_THRESHOLD} (${orphans.length}/${total} orphans); e.g. ${orphans.slice(0, 5).join(', ')}`,
    };
  } catch {
    return { name: 'Orphan ratio within threshold', passed: false, detail: 'Could not compute orphan ratio' };
  }
}

/** R3: 验证图谱中每条边的 source 和 target 节点存在 */
export function checkGraphEdgeIntegrity(workDir: string): CheckResult {
  try {
    const graphPaths = [
      path.join(workDir, '3_graph', 'graph', 'graph.merged.json'),
      path.join(workDir, '3_graph', 'graph', 'graph.structure_fixed.json'),
      path.join(workDir, '3_graph', 'graph', 'graph.json'),
    ];
    let graphData: { nodes: {id:string}[], edges: {id:string,source:string,target:string,type:string}[] } | null = null;
    for (const gp of graphPaths) {
      if (fs.existsSync(gp)) {
        graphData = JSON.parse(fs.readFileSync(gp, 'utf-8'));
        break;
      }
    }
    if (!graphData) {
      return { name: 'Graph edge integrity', passed: false, detail: 'No graph file found' };
    }
    const nodeIds = new Set(graphData.nodes.map(n => n.id));
    const danglingEdges: string[] = [];
    for (const e of graphData.edges) {
      if (!nodeIds.has(e.source)) danglingEdges.push(`${e.id}: source "${e.source}" not found`);
      if (!nodeIds.has(e.target)) danglingEdges.push(`${e.id}: target "${e.target}" not found`);
    }
    return {
      name: 'Graph edge integrity',
      passed: danglingEdges.length === 0,
      detail: danglingEdges.length === 0
        ? `All ${graphData.edges.length} edges reference existing nodes`
        : danglingEdges.slice(0, 5).join('; '),
    };
  } catch {
    return { name: 'Graph edge integrity', passed: false, detail: 'Could not verify edges' };
  }
}

/** 分层深度收敛判据：架构树最大链长至少 2（即至少一层子系统嵌套）。 */
export const MIN_HIERARCHY_DEPTH = 2;

/**
 * R3 分层深度闸门（多轮提取循环·层次性收敛判据）。
 * 架构树塌缩成平铺一层（≥3 架构节点但无 contains 层级），或最大链长 < 2，即失败。
 */
export function checkHierarchyDepth(workDir: string): CheckResult {
  const ir = loadIR(workDir);
  if (!ir) {
    return { name: 'Architecture hierarchy depth', passed: true, detail: 'No srs-ir.json (skipped)' };
  }
  const report = checkConnectivity(ir);
  if (report.architectureNodes === 0) {
    return { name: 'Architecture hierarchy depth', passed: true, detail: 'No architecture nodes (skipped)' };
  }
  if (report.flatTree) {
    return {
      name: 'Architecture hierarchy depth',
      passed: false,
      detail: `architecture tree is flat (${report.architectureNodes} nodes, no contains hierarchy); hierarchy collapsed`,
    };
  }
  if (report.hierarchyDepth < MIN_HIERARCHY_DEPTH) {
    return {
      name: 'Architecture hierarchy depth',
      passed: false,
      detail: `no subsystem hierarchy detected (depth ${report.hierarchyDepth} < ${MIN_HIERARCHY_DEPTH})`,
    };
  }
  return {
    name: 'Architecture hierarchy depth',
    passed: true,
    detail: `hierarchy depth ${report.hierarchyDepth} over ${report.architectureNodes} architecture nodes`,
  };
}

interface OrphanAdjudication {
  shardId: string;
  standalone: boolean;
  reason: string;
}

function loadAdjudications(workDir: string): Map<string, OrphanAdjudication> {
  const map = new Map<string, OrphanAdjudication>();
  const p = path.join(workDir, '_ctx', 'orphan_adjudications.json');
  if (!fs.existsSync(p)) return map;
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf-8')) as unknown;
    if (Array.isArray(raw)) {
      for (const item of raw) {
        const a = item as OrphanAdjudication;
        if (
          a && typeof a === 'object' &&
          typeof a.shardId === 'string' &&
          a.standalone === true &&
          typeof a.reason === 'string' && a.reason.trim().length > 0
        ) {
          map.set(a.shardId, a);
        }
      }
    }
  } catch { /* malformed treated as empty */ }
  return map;
}

/**
 * R3 孤儿裁决闸门（多轮提取循环·连通性收敛判据）。
 * 每个孤儿分片必须在 _ctx/orphan_adjudications.json 中被显式裁决为 standalone
 * （附非空 reason），或有被接受的桥接边；否则失败。
 */
export function checkOrphanAdjudication(workDir: string): CheckResult {
  const ir = loadIR(workDir);
  if (!ir) {
    return { name: 'Orphan shard adjudication', passed: true, detail: 'No srs-ir.json (skipped)' };
  }
  const report = checkConnectivity(ir);
  const orphans = report.orphanShards;
  if (orphans.length === 0) {
    return {
      name: 'Orphan shard adjudication',
      passed: true,
      detail: `connectedComponents=${report.connectedComponents}; no orphan shards`,
    };
  }
  const adjudications = loadAdjudications(workDir);
  const bridged = new Set<string>();
  for (const b of report.bridges) {
    const src = ir.nodes.find(n => n.id === b.sourceNode)?.source.shardId;
    const tgt = ir.nodes.find(n => n.id === b.targetNode)?.source.shardId;
    if (src) bridged.add(src);
    if (tgt) bridged.add(tgt);
  }
  const unadjudicated = orphans.filter(o => !adjudications.has(o) && !bridged.has(o));
  if (unadjudicated.length > 0) {
    return {
      name: 'Orphan shard adjudication',
      passed: false,
      detail: `${unadjudicated.length} orphan shard(s) unadjudicated: ${unadjudicated.slice(0, 5).join(', ')} (declare standalone+reason in _ctx/orphan_adjudications.json or add a bridge)`,
    };
  }
  return {
    name: 'Orphan shard adjudication',
    passed: true,
    detail: `${orphans.length} orphan(s) all adjudicated (standalone or bridged)`,
  };
}

/**
 * R3 原子操作树闸门（建模完整性判据）。
 *
 * 以顶层系统为根，沿 `contains` 边逐层展开子系统、叶子挂载原子需求，必须构成
 * 一棵良构树：恰单根、无游离子系统、contains 无环、无空壳叶子、需求全覆盖。
 * 这比无向连通分量更强——它抓住"连通但不成树"的病态建模（多根、成环、
 * 游离子系统），也是多层有限状态机抽象的静态骨架（arch 节点=子状态机，
 * contains=层次精化，叶子=执行原子操作的最底层状态机）。
 *
 * 无 architecture 节点时跳过（判据不适用）。
 */
export function checkAtomicTree(workDir: string): CheckResult {
  const ir = loadIR(workDir);
  if (!ir) {
    return { name: 'Atomic-operation tree well-formed', passed: true, detail: 'No srs-ir.json (skipped)' };
  }
  const report = analyzeAtomicTree(ir);
  if (report.architectureNodes === 0) {
    return { name: 'Atomic-operation tree well-formed', passed: true, detail: 'No architecture nodes (skipped)' };
  }
  if (report.wellFormed) {
    return {
      name: 'Atomic-operation tree well-formed',
      passed: true,
      detail: `single-root tree over ${report.architectureNodes} subsystem(s), ${report.requirementNodes} requirement(s) all attached`,
    };
  }

  const problems: string[] = [];
  if (report.roots.length !== 1) {
    problems.push(
      report.roots.length === 0
        ? 'no top-level system (contains graph has no root — cyclic or empty)'
        : `${report.roots.length} top-level roots (expected exactly 1): ${report.roots.slice(0, 5).join(', ')}`,
    );
  }
  if (report.cyclicContains) {
    problems.push('contains hierarchy has a cycle (not a tree)');
  }
  if (report.unreachableArchitecture.length > 0) {
    problems.push(`${report.unreachableArchitecture.length} subsystem(s) unreachable from root: ${report.unreachableArchitecture.slice(0, 5).join(', ')}`);
  }
  if (report.emptyLeafSubsystems.length > 0) {
    problems.push(`${report.emptyLeafSubsystems.length} leaf subsystem(s) carry no atomic requirement: ${report.emptyLeafSubsystems.slice(0, 5).join(', ')}`);
  }
  if (report.uncoveredRequirements.length > 0) {
    problems.push(`${report.uncoveredRequirements.length} requirement(s) not attached to any subsystem: ${report.uncoveredRequirements.slice(0, 5).join(', ')}`);
  }

  return {
    name: 'Atomic-operation tree well-formed',
    passed: false,
    detail: problems.join('; '),
  };
}

/** 最大允许 contains 边占比。超过即判为 error——意味着 R3-relational 的
 *  depends_on/refines/conflicts_with 关系未被 ingest 到 IR edges。 */
export const MAX_CONTAINS_RATIO = 0.95;

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
      if (fs.existsSync(gp)) {
        graphData = JSON.parse(fs.readFileSync(gp, 'utf-8')) as { edges: { type: string }[] };
        break;
      }
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
  } catch (err) {
    return { name: 'Edge type diversity', passed: false, detail: `Could not compute edge type diversity: ${(err as Error).message}` };
  }
}
