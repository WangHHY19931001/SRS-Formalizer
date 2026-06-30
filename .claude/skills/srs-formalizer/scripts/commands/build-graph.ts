/**
 * build-graph.ts — 构建需求知识图谱命令
 *
 * CLI: npx tsx index.ts build-graph --workdir .srs_formalizer
 *
 * 从 r1-explicit/, r2-implicit/, r3-relational/ 下的所有 JSONL 文件构建图谱。
 * 按 id 去重（保留首次出现），根据 category 设置节点标签，
 * 从 metadata 提取边（derived_from → :DERIVED_FROM, relation → :DEPENDS_ON|:REFINES|:CONFLICTS_WITH）。
 * 输出到 graph/graph.json。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliResult, JsonlRecord } from '../types/index.js';
import { readJsonl, listJsonlFiles } from '../lib/jsonl.js';
import { Graph } from '../lib/graph.js';
import { validateWorkDir } from '../lib/security.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseArg(args: string[], name: string): string | null {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1]!;
}

const CATEGORY_LABEL: Record<string, string> = {
  explicit: ':Requirement',
  implicit: ':ImplicitRequirement',
  relational: ':RelationalRequirement',
};

/** 子目录按此顺序处理，保证确定性。 */
const SUBDIRS = ['2_extract/r1-explicit', '2_extract/r2-implicit', '2_extract/r3-relational'];

const VALID_RELATION_TYPES = ['DEPENDS_ON', 'REFINES', 'CONFLICTS_WITH'];

interface RelationMeta {
  target: string;
  type: string;
}

function isRelationMeta(value: unknown): value is RelationMeta {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.target === 'string' && typeof obj.type === 'string';
}

/**
 * 从 metadata.relation 提取关系列表。支持单对象或对象数组。
 */
function extractRelations(relation: unknown): RelationMeta[] {
  if (Array.isArray(relation)) {
    return relation.filter(isRelationMeta);
  }
  if (isRelationMeta(relation)) {
    return [relation];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

/**
 * 读取所有子目录下的 JSONL 文件，返回无序的原始记录列表。
 * 不存在的目录会被静默跳过。
 */
function readAllRecords(workDir: string): JsonlRecord[] {
  const allRecords: JsonlRecord[] = [];

  for (const subdir of SUBDIRS) {
    const dirPath = path.join(workDir, subdir);
    try {
      // Sort file list for deterministic ordering
      const files = listJsonlFiles(dirPath, workDir).sort();
      for (const filePath of files) {
        const records = readJsonl(filePath, workDir);
        allRecords.push(...records);
      }
    } catch {
      // Directory does not exist or is inaccessible — skip silently
    }
  }

  return allRecords;
}

/**
 * 按 id 去重，保留每个 id 的首次出现。
 * 输入顺序决定保留的记录（已按文件排序保证确定性）。
 */
function deduplicateRecords(records: JsonlRecord[]): JsonlRecord[] {
  const seenIds = new Set<string>();
  const unique: JsonlRecord[] = [];

  for (const record of records) {
    if (!seenIds.has(record.id)) {
      seenIds.add(record.id);
      unique.push(record);
    }
  }

  return unique;
}

// ---------------------------------------------------------------------------
// Graph building
// ---------------------------------------------------------------------------

/**
 * 从去重后的记录列表构建需求知识图谱。
 */
function buildGraph(records: JsonlRecord[]): Graph {
  const graph = new Graph();

  // === 1. Create nodes ===
  for (const record of records) {
    const label = CATEGORY_LABEL[record.category];
    graph.addNode({
      id: record.id,
      labels: [label ?? ':Requirement'],
      properties: {
        statement: record.statement,
        source_file: record.source_file,
        confidence: record.confidence,
        category: record.category,
      },
    });
  }

  // === 2. Create edges from metadata ===
  for (const record of records) {
    const meta = record.metadata;
    if (!meta) continue;

    // -- DERIVED_FROM (string or string[]) --
    const derivedFrom = meta.derived_from;
    if (typeof derivedFrom === 'string') {
      const edgeType = ':DERIVED_FROM';
      graph.addEdge({
        id: `${record.id}--${edgeType}--${derivedFrom}`,
        source: record.id, target: derivedFrom, type: edgeType,
      });
    } else if (Array.isArray(derivedFrom)) {
      for (const target of derivedFrom) {
        if (typeof target !== 'string') continue;
        const edgeType = ':DERIVED_FROM';
        graph.addEdge({
          id: `${record.id}--${edgeType}--${target}`,
          source: record.id, target, type: edgeType,
        });
      }
    }

    // -- relation: DEPENDS_ON | REFINES | CONFLICTS_WITH --
    // Format A (prompt): meta.relation is type string, meta.source_id + meta.target_id
    // Format B (legacy): meta.relation is {type, target} object or array of objects
    const rawRelation = meta.relation;
    if (typeof rawRelation === 'string' && VALID_RELATION_TYPES.includes(rawRelation)) {
      // Format A: relation is the type, source_id/target_id are siblings
      const sourceId = meta.source_id;
      const targetId = meta.target_id;
      if (typeof sourceId === 'string' && typeof targetId === 'string') {
        const edgeType = `:${rawRelation}`;
        graph.addEdge({
          id: `${record.id}--${edgeType}--${targetId}`,
          source: sourceId, target: targetId, type: edgeType,
        });
      }
    } else if (rawRelation !== undefined) {
      // Format B: legacy {type, target} object/array
      const relations = extractRelations(rawRelation);
      for (const rel of relations) {
        if (!VALID_RELATION_TYPES.includes(rel.type)) continue;
        const edgeType = `:${rel.type}`;
        graph.addEdge({
          id: `${record.id}--${edgeType}--${rel.target}`,
          source: record.id, target: rel.target, type: edgeType,
        });
      }
    }
  }

  return graph;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function main(args: string[]): Promise<CliResult> {
  const workDirArg = parseArg(args, '--workdir');

  if (!workDirArg) {
    return { status: 'error', message: 'Missing required argument: --workdir' };
  }

  let workDir: string;
  try {
    workDir = validateWorkDir(workDirArg);
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  // Load and deduplicate all records
  const allRecords = readAllRecords(workDir);
  const uniqueRecords = deduplicateRecords(allRecords);

  // Build graph
  const graph = buildGraph(uniqueRecords);

  // Write output file
  const graphDir = path.join(workDir, '3_graph', 'graph');
  if (!fs.existsSync(graphDir)) {
    fs.mkdirSync(graphDir, { recursive: true });
  }
  const graphPath = path.join(graphDir, 'graph.json');
  fs.writeFileSync(graphPath, JSON.stringify(graph.toJSON(), null, 2), 'utf-8');

  return { status: 'ok', data: graph.toJSON() };
}
