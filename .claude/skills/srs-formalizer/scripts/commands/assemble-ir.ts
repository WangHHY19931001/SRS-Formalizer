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
import type { SRSIR, IRNode } from '../types/srs-ir.js';
import {
  safeParseArg,
  validateWorkDir,
  refuseDirectInvocation,
} from '../lib/cli.js';
import { listJsonlFiles, readJsonl } from '../lib/jsonl.js';

const REQUIREMENT_SUBDIRS = ['r1-explicit', 'r2-implicit', 'r3-relational'] as const;
const ARCHITECTURE_SUBDIR = 'architecture';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function toNum(v: unknown, dflt: number): number {
  return typeof v === 'number' ? v : dflt;
}

function toStr(v: unknown, dflt: string): string {
  return typeof v === 'string' ? v : dflt;
}

function toIRNode(record: JsonlRecord): IRNode {
  const meta = isRecord(record.metadata) ? record.metadata : null;
  return {
    id: record.id,
    type: 'requirement',
    module: record.source_file,
    labels: [':Requirement'],
    properties: {
      statement: record.statement,
      category: record.category,
      confidence: record.confidence,
    },
    source: {
      filePath: record.source_file,
      startLine: toNum(meta?.['start_line'], 1),
      endLine: toNum(meta?.['end_line'], 1),
      shardId: toStr(meta?.['shard_id'], record.id),
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

/** 引用完整性校验：版本号 / buildTimestamp / 重复节点 ID / 悬挂边。 */
function checkIntegrity(ir: SRSIR): string[] {
  const errors: string[] = [];
  if (ir.version !== '2.0.0') errors.push(`版本号必须为 2.0.0，实际为 ${ir.version}`);
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

    const ir: SRSIR = {
      version: '2.0.0',
      meta: {
        sourcePath: '',
        sourceHash: '',
        language: 'zh',
        totalChars: 0,
        totalShards: 0,
        totalNodes: nodes.length,
        totalEdges: 0,
        buildTimestamp: new Date().toISOString(),
      },
      nodes,
      edges: [],
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

    return {
      status: 'ok',
      data: { nodes: ir.meta.totalNodes, edges: ir.meta.totalEdges, ir_path: irPath },
    };
  } catch (err) {
    return { status: 'error', message: `IR assembly failed: ${(err as Error).message}` };
  }
}

refuseDirectInvocation(import.meta.url);
