import type { Graph, GraphNode, GraphEdge } from './graph.js';
import { sanitizeId } from './id-utils.js';

/** 生成 CREATE 节点语句 */
export function generateCreateNode(node: GraphNode): string {
  const labels = node.labels.map(l => `:${l}`).join('');
  const props = Object.entries(node.properties)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join(', ');
  return `CREATE (${labels} {${props}})`;
}

/** 生成 CREATE 边语句 */
export function generateCreateEdge(edge: GraphEdge): string {
  // MATCH (a), (b) WHERE a.id = 'source' AND b.id = 'target' CREATE (a)-[:TYPE]->(b)
  return `MATCH (a), (b) WHERE a.id = '${edge.source}' AND b.id = '${edge.target}' CREATE (a)-[:${edge.type}]->(b)`;
}

/** 生成唯一性约束 */
export function generateConstraints(): string[] {
  return [
    'CREATE CONSTRAINT IF NOT EXISTS FOR (n:Requirement) REQUIRE n.id IS UNIQUE',
    'CREATE CONSTRAINT IF NOT EXISTS FOR (n:Module) REQUIRE n.id IS UNIQUE',
    'CREATE CONSTRAINT IF NOT EXISTS FOR (n:Actor) REQUIRE n.id IS UNIQUE',
  ];
}

// ===========================================================================
// 通用图谱 Cypher 导出（0.5.7 收敛 4 个图谱模块的重复 CREATE 逻辑）
// ===========================================================================

export interface CypherNode {
  id: string;
  labels: string[];
  properties: Record<string, string | number | boolean>;
}

export interface CypherEdge {
  source: string;
  target: string;
  type: string;
  properties?: Record<string, string>;
}

export interface CypherExportOptions {
  title: string;
  headerLines: string[];
  /** 可选：每节点插入额外属性字段（如 system-architecture 的 layer） */
  nodeExtraFields?: (node: CypherNode) => string;
}

/**
 * 通用图谱 → Neo4j Cypher 导出。
 *
 * 4 个图谱模块（tla / lean / behavior / system-architecture）收敛为
 * 此基函数 + 薄封装。处理：注释头 → CREATE 节点 → CREATE 边。
 */
export function exportGraphToCypher(
  nodes: CypherNode[],
  edges: CypherEdge[],
  opts: CypherExportOptions,
): string {
  const lines: string[] = [
    '// ============================================================',
    `// ${opts.title} — Neo4j Cypher Export`,
    ...opts.headerLines.map(l => `// ${l}`),
    '// ============================================================',
    '',
  ];

  for (const node of nodes) {
    const labels = node.labels.map(l => `:${l}`).join('');
    const extra = opts.nodeExtraFields ? opts.nodeExtraFields(node) : '';
    const props = Object.entries(node.properties)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => typeof v === 'string' ? `${k}: ${JSON.stringify(v)}` : `${k}: ${v}`)
      .join(', ');
    const sid = sanitizeId(node.id);
    lines.push(`CREATE (${sid}${labels} {id: "${node.id}", ${props}${extra ? `, ${extra}` : ''}});`);
  }

  lines.push('');

  for (const edge of edges) {
    const src = sanitizeId(edge.source);
    const tgt = sanitizeId(edge.target);
    const eProps = edge.properties
      ? Object.entries(edge.properties).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ')
      : '';
    const eStr = eProps ? ` {${eProps}}` : '';
    lines.push(`CREATE (${src})-[:${edge.type}${eStr}]->(${tgt});`);
  }

  return lines.join('\n');
}

// ===========================================================================
// 旧版 MATCH-based 导出（保留）
// ===========================================================================

/** 生成完整 Cypher 脚本 */
export function generateFullScript(graph: Graph): string {
  const lines: string[] = [
    '// SRS-Formalizer Knowledge Graph',
    '// Auto-generated Cypher script',
    '',
    '// === Constraints ===',
    ...generateConstraints(),
    '',
    '// === Nodes ===',
    ...graph.getAllNodes().map(generateCreateNode),
    '',
    '// === Edges ===',
    ...graph.getAllEdges().map(generateCreateEdge),
  ];
  return lines.join(';\n') + ';\n';
}
