/**
 * assemble-ir.ts — 装配 SRS-IR (DESIGN.md §8.1)
 *
 * CLI: npx tsx index.ts assemble-ir --workdir .srs_formalizer
 *
 * 职责（严格限定）：读 JSONL → 去重 → 装配 srs-ir.json + 引用完整性校验
 *   （悬挂边 / 重复 ID / 版本号 / buildTimestamp）。
 * 禁止：分析、发射、修改 JSONL、调用 LLM。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliResult, JsonlRecord } from '../types/index.js';
import type { SRSIR, IRNode, IREdge, IREdgeType, FormalizationPriority } from '../types/srs-ir.js';
import {
  safeParseArg,
  validateWorkDir,
  refuseDirectInvocation,
} from '../lib/cli.js';
import { listJsonlFiles, readJsonl } from '../lib/jsonl.js';
import { toDataFlowGraph, validateDataFlowRecords, type DataFlowRecord } from '../lib/dataflow-extract.js';

const R1_FILENAME_REGEX = /^S\d{3}\.jsonl$/;

/**
 * P0-2: 预检 R1 文件名规范（拒绝区间命名如 S006-007.jsonl）。
 * 仅在 shard_index.json 含 SNNN 格式 shard ID 时启用（向后兼容无 shard_index 的测试场景）。
 * 允许：S001.jsonl ~ S999.jsonl + _empty_shards.json。
 */
function checkR1Filenames(r1Dir: string): string[] {
  const errors: string[] = [];
  if (!fs.existsSync(r1Dir)) return errors;
  const files = fs.readdirSync(r1Dir).filter(f => f.endsWith('.jsonl') || f === '_empty_shards.json');
  for (const f of files) {
    if (f === '_empty_shards.json') continue;
    if (!R1_FILENAME_REGEX.test(f)) {
      errors.push(`R1 文件名违规: "${f}"，必须匹配 ^S\\d{3}\\.jsonl$（禁止区间命名）`);
    }
  }
  return errors;
}

/**
 * P0-2: 预检 R1 分片覆盖率。每个 shard 必须在 R1 记录中出现或在 _empty_shards.json 声明。
 * 缺失即拒绝装配，避免编排者跳过分片后谎报 totalExplicitRules。
 */
function checkR1ShardCoverage(
  r1Dir: string,
  workDir: string,
  shardIds: string[],
): string[] {
  const errors: string[] = [];
  const coveredShards = new Set<string>();
  if (fs.existsSync(r1Dir)) {
    for (const file of listJsonlFiles(r1Dir, workDir)) {
      for (const r of readJsonl(file, workDir)) {
        const m = r.id.match(/^R1-(S\d{3})-\d{4}$/);
        if (m) coveredShards.add(m[1]!);
      }
    }
  }
  // _empty_shards.json 显式声明零规范分片
  const emptyPath = path.join(r1Dir, '_empty_shards.json');
  let emptyShards: string[] = [];
  if (fs.existsSync(emptyPath)) {
    try {
      emptyShards = JSON.parse(fs.readFileSync(emptyPath, 'utf-8')) as string[];
    } catch {
      errors.push('_empty_shards.json 解析失败');
    }
  }
  for (const sid of emptyShards) coveredShards.add(sid);
  const missing = shardIds.filter(sid => !coveredShards.has(sid));
  if (missing.length > 0) {
    errors.push(`R1 分片覆盖率不足: 缺失 ${missing.length} 个分片 ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '...' : ''}（无对应 R1 记录且未在 _empty_shards.json 声明）`);
  }
  return errors;
}

const REQUIREMENT_SUBDIRS = ['r1-explicit', 'r2-implicit', 'r3-relational', 'r3-cross', 'r4-nfr'] as const;
const ARCHITECTURE_SUBDIR = 'architecture';
const DATA_ENTITIES_SUBDIR = 'data-entities';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function toNum(v: unknown, dflt: number): number {
  return typeof v === 'number' ? v : dflt;
}

function toStr(v: unknown, dflt: string): string {
  return typeof v === 'string' ? v : dflt;
}

const FORMALIZATION_PRIORITIES = new Set(['safety-critical', 'concurrency', 'standard', 'deferred']);

function toIRNode(record: JsonlRecord): IRNode {
  const meta = isRecord(record.metadata) ? record.metadata : null;
  const rawPriority = toStr(meta?.['formalization_priority'], '');
  const ridRef = toStr(meta?.['rid_ref'], '');
  const shardId = toStr(meta?.['shard_id'], record.id);
  return {
    id: record.id,
    type: 'requirement',
    // module 填 shard_id 作为初始归属；后续由 architecture contains 边
    // 或 Middle-end M5 合并优化器确定精确子系统名。
    // 不填 source_file（那是源路径，不是模块名）。
    module: shardId,
    labels: [':Requirement'],
    properties: {
      statement: record.statement,
      category: record.category,
      confidence: record.confidence,
      ...(FORMALIZATION_PRIORITIES.has(rawPriority) ? { formalizationPriority: rawPriority as FormalizationPriority } : {}),
      ...(ridRef ? { ridRef } : {}),
    },
    source: {
      filePath: record.source_file,
      startLine: toNum(meta?.['start_line'], 1),
      endLine: toNum(meta?.['end_line'], 1),
      shardId,
      chapter: toStr(meta?.['chapter'], ''),
    },
  };
}

/** 将 architecture JSONL 记录映射为 IR architecture 节点。
 *  arch-1 用 type 字段，arch-2/3 用 action 字段；映射为 IRProperties.archType 枚举。 */
function toArchIRNode(record: JsonlRecord): IRNode {
  const meta = isRecord(record.metadata) ? record.metadata : null;
  const raw = record as unknown as Record<string, unknown>;
  const typeOrAction = toStr(raw['type'] ?? raw['action'], '');
  const archType =
    typeOrAction === 'module' || typeOrAction === 'add_module' || typeOrAction === 'merge' ? 'Module'
    : typeOrAction === 'actor' || typeOrAction === 'add_actor' ? 'Actor'
    : typeOrAction === 'constraint' || typeOrAction === 'add_constraint' ? 'Constraint'
    : typeOrAction === 'add_dependency_layer' ? 'Component'
    : 'Module';
  const name = toStr(raw['name'], record.id);
  const reasoning = toStr(raw['reasoning'], '');
  return {
    id: record.id,
    type: 'architecture',
    module: name,
    labels: [':Architecture', `:${archType}`],
    properties: {
      statement: reasoning || `${name} architecture element`,
      archType,
    },
    source: {
      filePath: name,
      startLine: toNum(meta?.['start_line'], 1),
      endLine: toNum(meta?.['end_line'], 1),
      shardId: toStr(meta?.['shard_id'], record.id),
      chapter: toStr(meta?.['chapter'], ''),
    },
  };
}

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
 *  仅处理 relation.type 为合法 IREdgeType 的记录；source_id/target_id 必须有效。
 *  移植自归档 builder.ts:73-106，修复 edges 全为空的根因。 */
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

/** 读取 data-entities/*.jsonl 原始记录（每行一个 JSON 对象）。 */
function readDataFlowRecords(filePath: string): unknown[] {
  const out: unknown[] = [];
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
  for (const line of lines) {
    const t = line.trim();
    if (t === '') continue;
    out.push(JSON.parse(t));
  }
  return out;
}

/** 引用完整性校验：版本号 / buildTimestamp / 重复节点 ID / 悬挂边。 */
function checkIntegrity(ir: SRSIR): string[] {
  const errors: string[] = [];
  if (ir.version !== '2.0.0' && ir.version !== '2.1.0') errors.push(`版本号必须为 2.x（2.0.0 或 2.1.0），实际为 ${ir.version}`);
  if (!ir.meta.buildTimestamp) errors.push('buildTimestamp 不能为空');
  const nodeIds = new Set<string>();
  for (const n of ir.nodes) {
    if (nodeIds.has(n.id)) errors.push(`重复节点 ID: ${n.id}`);
    nodeIds.add(n.id);
  }
  for (const e of ir.edges) {
    if (!nodeIds.has(e.source)) errors.push(`悬挂边 source: ${e.source} (edge ${e.id})`);
    if (!nodeIds.has(e.target)) errors.push(`悬挂边 target: ${e.target} (edge ${e.id})`);
  }
  return errors;
}

interface ShardIndexMeta {
  sourcePath: string;
  sourceHash: string;
  language: 'zh' | 'en';
  totalChars: number;
  totalShards: number;
}

/** P1-5: pull IR meta from `_ctx/shard_index.json`, falling back to safe defaults. */
function readShardIndexMeta(workDir: string): ShardIndexMeta {
  const fallback: ShardIndexMeta = { sourcePath: '', sourceHash: '', language: 'zh', totalChars: 0, totalShards: 0 };
  try {
    const indexPath = path.join(workDir, '_ctx', 'shard_index.json');
    if (!fs.existsSync(indexPath)) return fallback;
    const raw = JSON.parse(fs.readFileSync(indexPath, 'utf-8')) as Record<string, unknown>;
    const language = raw['language'] === 'en' ? 'en' : 'zh';
    return {
      sourcePath: toStr(raw['source_path'], ''),
      sourceHash: toStr(raw['source_hash'], ''),
      language,
      totalChars: toNum(raw['total_chars'], 0),
      totalShards: toNum(raw['total_shards'], Array.isArray(raw['shards']) ? (raw['shards'] as unknown[]).length : 0),
    };
  } catch {
    return fallback;
  }
}

/**
 * P1-5: emit `3_graph/graph/graph.merged.json` directly from the assembled IR so
 * the R3 gate no longer requires a separate manual graph export.
 */
function writeMergedGraph(workDir: string, ir: SRSIR): string {
  const graphData = {
    nodes: ir.nodes.map(node => ({ id: node.id, labels: node.labels, properties: { ...node.properties } })),
    edges: ir.edges.map(edge => ({ id: edge.id, source: edge.source, target: edge.target, type: edge.type, properties: edge.properties })),
  };
  const graphDir = path.join(workDir, '3_graph', 'graph');
  fs.mkdirSync(graphDir, { recursive: true });
  const graphPath = path.join(graphDir, 'graph.merged.json');
  fs.writeFileSync(graphPath, JSON.stringify(graphData, null, 2), 'utf-8');
  return graphPath;
}

export async function main(args: string[]): Promise<CliResult> {
  let workDirArg: string | null;
  try {
    workDirArg = safeParseArg(args, '--workdir');
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  if (!workDirArg) {
    return { status: 'error', message: 'Missing required argument: --workdir' };
  }

  let workDir: string;
  try {
    workDir = validateWorkDir(workDirArg);
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  try {
    // P0-2: R1 文件名 + 分片覆盖率预检（仅在 shard_index.json 含 SNNN shard ID 时启用）
    {
      const r1Dir = path.join(workDir, '2_extract', 'r1-explicit');
      let shardIds: string[] = [];
      try {
        const indexPath = path.join(workDir, '_ctx', 'shard_index.json');
        if (fs.existsSync(indexPath)) {
          const raw = JSON.parse(fs.readFileSync(indexPath, 'utf-8')) as Record<string, unknown>;
          if (Array.isArray(raw['shards'])) {
            shardIds = (raw['shards'] as Array<Record<string, unknown>>)
              .map(s => toStr(s['id'], ''))
              .filter(id => /^S\d{3}$/.test(id));
          }
        }
      } catch {
        // shard_index 损坏由 validate-shard-index 兜底
      }
      // 仅在有 SNNN shard ID 时才启用文件名+覆盖率预检（向后兼容无 shard_index 的场景）
      if (shardIds.length > 0) {
        const filenameErrors = checkR1Filenames(r1Dir);
        if (filenameErrors.length > 0) {
          return { status: 'error', message: `R1 文件名预检失败: ${filenameErrors.join('; ')}` };
        }
        const coverageErrors = checkR1ShardCoverage(r1Dir, workDir, shardIds);
        if (coverageErrors.length > 0) {
          return { status: 'error', message: `R1 覆盖率预检失败: ${coverageErrors.join('; ')}` };
        }
      }
    }

    const nodes: IRNode[] = [];
    const idSet = new Set<string>();

    // Load requirement records (R1/R2/R3) and convert via toIRNode
    for (const sub of REQUIREMENT_SUBDIRS) {
      const dir = path.join(workDir, '2_extract', sub);
      if (!fs.existsSync(dir)) continue;
      for (const file of listJsonlFiles(dir, workDir)) {
        for (const r of readJsonl(file, workDir)) {
          if (idSet.has(r.id)) {
            return { status: 'error', message: `重复 ID: ${r.id}，无法装配 IR` };
          }
          idSet.add(r.id);
          nodes.push(toIRNode(r));
        }
      }
    }

    // Load architecture records and convert via toArchIRNode (type='architecture')
    const archDir = path.join(workDir, '2_extract', ARCHITECTURE_SUBDIR);
    if (fs.existsSync(archDir)) {
      for (const file of listJsonlFiles(archDir, workDir)) {
        for (const r of readJsonl(file, workDir)) {
          if (idSet.has(r.id)) {
            return { status: 'error', message: `重复 ID: ${r.id}，无法装配 IR` };
          }
          idSet.add(r.id);
          nodes.push(toArchIRNode(r));
        }
      }
    }

    // P1-5: derive meta.{sourcePath,sourceHash,language,totalChars,totalShards}
    // from shard_index.json when present so these are no longer manual steps.
    const shardMeta = readShardIndexMeta(workDir);

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

    // Data-flow extraction (spec 2026-07-21): load data-entities/*.jsonl →
    // data_entity nodes + produces/consumes/mutates edges. Frontend-written and
    // optional; absent ⇒ IR stays free of data-flow (analyze-dataflow degrades).
    const dataDir = path.join(workDir, '2_extract', DATA_ENTITIES_SUBDIR);
    if (fs.existsSync(dataDir)) {
      const dfRecords: unknown[] = [];
      for (const file of listJsonlFiles(dataDir, workDir)) {
        dfRecords.push(...readDataFlowRecords(file));
      }
      if (dfRecords.length > 0) {
        const dfReport = validateDataFlowRecords(dfRecords);
        if (!dfReport.valid) {
          return { status: 'error', message: `数据流记录校验失败: ${dfReport.errors.join('; ')}` };
        }
        const dfGraph = toDataFlowGraph(dfRecords as DataFlowRecord[]);
        for (const n of dfGraph.nodes) {
          if (idSet.has(n.id)) {
            return { status: 'error', message: `重复 ID: ${n.id}，数据实体与需求/架构节点冲突` };
          }
          idSet.add(n.id);
          nodes.push(n);
        }
        edges.push(...dfGraph.edges);
      }
    }
    const ir: SRSIR = {
      version: '2.1.0',
      meta: {
        sourcePath: shardMeta.sourcePath,
        sourceHash: shardMeta.sourceHash,
        language: shardMeta.language,
        totalChars: shardMeta.totalChars,
        totalShards: shardMeta.totalShards,
        // P1-5: totalNodes/totalEdges are always computed from the assembled
        // collections, never left for a human to fill in (§P1-5,阻塞点 #6).
        totalNodes: nodes.length,
        totalEdges: edges.length,
        buildTimestamp: new Date().toISOString(),
      },
      nodes,
      edges,
      crossRefs: [],
      nfrProfile: {
        detectedCategories: [],
        weightedShards: [],
        overallCoverage: 0,
        blindSpots: [],
      },
      gaps: [],
      glossary: [],
    };

    const errors = checkIntegrity(ir);
    if (errors.length > 0) {
      return { status: 'error', message: `IR 完整性校验失败: ${errors.join('; ')}` };
    }

    const irPath = path.join(workDir, 'srs-ir.json');
    fs.writeFileSync(irPath, JSON.stringify(ir, null, 2), 'utf-8');

    // P1-5: also emit graph/graph.merged.json so the R3 gate's "graph file
    // found" check no longer needs a manual export step (阻塞点 #8).
    const graphPath = writeMergedGraph(workDir, ir);

    return {
      status: 'ok',
      data: { nodes: ir.meta.totalNodes, edges: ir.meta.totalEdges, ir_path: irPath, graph_path: graphPath },
    };
  } catch (err) {
    return { status: 'error', message: `IR assembly failed: ${(err as Error).message}` };
  }
}

refuseDirectInvocation(import.meta.url);
