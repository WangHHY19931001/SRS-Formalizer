/**
 * dataflow-extract.ts — Frontend F4e 数据流抽取契约（spec 2026-07-21, ADR-0009）
 *
 * 职责：
 *   1. 定义数据流抽取记录类型（DataFlowRecord 判别联合）
 *   2. 校验 `2_extract/data-entities/*.jsonl` 记录
 *   3. 将记录转换为 IR 的 data_entity 节点 + produces/consumes/mutates 边
 *      （toDataFlowGraph，含 canonical 归一去重）
 *
 * 纯函数，无文件 I/O，便于单测。
 */

import type { IRNode, IREdge } from '../types/srs-ir.js';

export type DataFlowAction = 'produces' | 'consumes' | 'mutates';

export interface DataEntityRecord {
  kind: 'entity';
  /** 稳定实体 id，格式 DE-<slug>（如 DE-order）。 */
  id: string;
  /** 归一后的规范名；相同 canonical 的实体记录合并。 */
  canonical: string;
  /** 命中的原始别名。 */
  aliases?: string[];
  /** 溯源分片号 SNNN。 */
  source_shard: string;
}

export interface DataFlowLinkRecord {
  kind: 'flow';
  /** 读写关系的发起需求节点 id（R1/R2/R3-…）。 */
  requirement_id: string;
  /** 被读写的数据实体 id（DataEntityRecord.id）。 */
  entity_id: string;
  action: DataFlowAction;
  source_shard: string;
}

export type DataFlowRecord = DataEntityRecord | DataFlowLinkRecord;

const ID_ENTITY_RE = /^DE-[a-z0-9][a-z0-9_-]*$/;
const ID_REQ_RE = /^R[123]-[A-Za-z0-9_.]+-\d{4}$/;
const SHARD_RE = /^S\d{3}$/;
const ACTIONS = new Set<DataFlowAction>(['produces', 'consumes', 'mutates']);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/**
 * 校验单条数据流记录。返回错误字符串数组，空数组表示通过。
 */
export function validateDataFlowRecord(rec: unknown, index: number): string[] {
  const errors: string[] = [];
  const p = `record[${index}]`;
  if (!isRecord(rec)) return [`${p}: not an object`];

  const kind = rec.kind;
  if (kind !== 'entity' && kind !== 'flow') {
    return [`${p}: kind must be 'entity' or 'flow' (got ${JSON.stringify(kind)})`];
  }

  if (kind === 'entity') {
    if (typeof rec.id !== 'string' || !ID_ENTITY_RE.test(rec.id)) {
      errors.push(`${p}: entity id must match DE-<slug> (got ${JSON.stringify(rec.id)})`);
    }
    if (typeof rec.canonical !== 'string' || rec.canonical.trim() === '') {
      errors.push(`${p}: entity canonical is required and non-empty`);
    }
    if (rec.aliases !== undefined && !Array.isArray(rec.aliases)) {
      errors.push(`${p}: entity aliases must be a string array when present`);
    }
    if (typeof rec.source_shard !== 'string' || !SHARD_RE.test(rec.source_shard)) {
      errors.push(`${p}: entity source_shard must match SNNN (got ${JSON.stringify(rec.source_shard)})`);
    }
  } else {
    if (typeof rec.requirement_id !== 'string' || !ID_REQ_RE.test(rec.requirement_id)) {
      errors.push(`${p}: flow requirement_id must match R[123]-<mod>-NNNN (got ${JSON.stringify(rec.requirement_id)})`);
    }
    if (typeof rec.entity_id !== 'string' || !ID_ENTITY_RE.test(rec.entity_id)) {
      errors.push(`${p}: flow entity_id must match DE-<slug> (got ${JSON.stringify(rec.entity_id)})`);
    }
    if (typeof rec.action !== 'string' || !ACTIONS.has(rec.action as DataFlowAction)) {
      errors.push(`${p}: flow action must be produces|consumes|mutates (got ${JSON.stringify(rec.action)})`);
    }
    if (typeof rec.source_shard !== 'string' || !SHARD_RE.test(rec.source_shard)) {
      errors.push(`${p}: flow source_shard must match SNNN (got ${JSON.stringify(rec.source_shard)})`);
    }
  }
  return errors;
}

export interface DataFlowValidationReport {
  valid: boolean;
  errors: string[];
  warnings: string[];
  entityCount: number;
  flowCount: number;
}

/**
 * 校验整批记录 + 引用完整性：
 *   - entity id 唯一
 *   - flow.entity_id 必须指向已声明的 entity（无悬挂）
 *   - flow.requirement_id 的存在性由 assemble-ir 对全 IR 校验（此处只校验格式）
 */
export function validateDataFlowRecords(records: unknown[]): DataFlowValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const entityIds = new Set<string>();
  const seen = new Map<string, number>();
  let entityCount = 0;
  let flowCount = 0;

  for (let i = 0; i < records.length; i++) {
    const recErrors = validateDataFlowRecord(records[i], i);
    errors.push(...recErrors);
    if (recErrors.length > 0) continue;
    const rec = records[i] as DataFlowRecord;
    if (rec.kind === 'entity') {
      entityCount++;
      const dup = seen.get(rec.id);
      if (dup !== undefined) errors.push(`record[${i}]: duplicate entity id "${rec.id}" (also at record[${dup}])`);
      else { seen.set(rec.id, i); entityIds.add(rec.id); }
    } else {
      flowCount++;
    }
  }

  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    if (isRecord(rec) && rec.kind === 'flow' && typeof rec.entity_id === 'string' && !entityIds.has(rec.entity_id)) {
      errors.push(`record[${i}]: flow references undeclared entity_id "${rec.entity_id}"`);
    }
  }

  return { valid: errors.length === 0, errors, warnings, entityCount, flowCount };
}

export interface DataFlowGraph {
  nodes: IRNode[];
  edges: IREdge[];
}

/**
 * 将数据流记录转为 IR 的 data_entity 节点 + produces/consumes/mutates 边。
 *
 * canonical 归一：相同 `canonical` 的多个 entity 记录合并为一个 data_entity 节点，
 * 保留首个记录的 id 作为节点 id，aliases 汇总去重。flow 边的 entity_id 经归一映射到
 * 合并后的节点 id。边方向统一为 requirement → data_entity。
 */
export function toDataFlowGraph(records: DataFlowRecord[]): DataFlowGraph {
  const canonicalToNodeId = new Map<string, string>();
  const entityIdToNodeId = new Map<string, string>();
  const nodeAliases = new Map<string, Set<string>>();
  const nodeCanonical = new Map<string, string>();
  const nodeShard = new Map<string, string>();

  for (const rec of records) {
    if (rec.kind !== 'entity') continue;
    let nodeId = canonicalToNodeId.get(rec.canonical);
    if (nodeId === undefined) {
      nodeId = rec.id;
      canonicalToNodeId.set(rec.canonical, nodeId);
      nodeCanonical.set(nodeId, rec.canonical);
      nodeShard.set(nodeId, rec.source_shard);
      nodeAliases.set(nodeId, new Set());
    }
    entityIdToNodeId.set(rec.id, nodeId);
    const aliasSet = nodeAliases.get(nodeId)!;
    for (const a of rec.aliases ?? []) aliasSet.add(a);
    aliasSet.add(rec.canonical);
  }

  const nodes: IRNode[] = [];
  for (const [nodeId, canonical] of nodeCanonical) {
    const aliases = [...(nodeAliases.get(nodeId) ?? [])].sort();
    const labels = [':DataEntity', ...aliases.map(a => `alias:${a}`)];
    nodes.push({
      id: nodeId,
      type: 'data_entity',
      module: canonical,
      labels,
      properties: { statement: canonical },
      source: {
        filePath: canonical,
        startLine: 1,
        endLine: 1,
        shardId: nodeShard.get(nodeId) ?? '',
        chapter: '',
      },
    });
  }

  const edges: IREdge[] = [];
  let seq = 0;
  const seenEdge = new Set<string>();
  for (const rec of records) {
    if (rec.kind !== 'flow') continue;
    const targetNode = entityIdToNodeId.get(rec.entity_id);
    if (targetNode === undefined) continue;
    const key = `${rec.requirement_id}|${rec.action}|${targetNode}`;
    if (seenEdge.has(key)) continue;
    seenEdge.add(key);
    seq++;
    edges.push({
      id: `DF-${String(seq).padStart(4, '0')}`,
      source: rec.requirement_id,
      target: targetNode,
      type: rec.action,
      properties: {},
    });
  }

  return { nodes, edges };
}
