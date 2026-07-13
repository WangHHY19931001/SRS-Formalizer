import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SRSIR, IRNode, IREdge } from '../../types/srs-ir.js';
import type { Emitter, EmitResult } from './types.js';
import { sanitizeId } from '../id-utils.js';

function escapeCypherIdentifier(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function nfrLabel(category: string): string {
  return `NFR${category.charAt(0).toUpperCase()}${category.slice(1)}`;
}

function nodeProperties(node: IRNode): string {
  const parts: string[] = [];
  if (node.properties.statement) {
    parts.push(`statement: ${JSON.stringify(node.properties.statement)}`);
  }
  if (node.properties.confidence) {
    parts.push(`confidence: "${node.properties.confidence}"`);
  }
  if (node.properties.category) {
    parts.push(`category: "${node.properties.category}"`);
  }
  if (node.properties.nfrCategory) {
    parts.push(`nfrCategory: "${node.properties.nfrCategory}"`);
  }
  if (node.properties.archType) {
    parts.push(`archType: "${node.properties.archType}"`);
  }
  if (node.properties.nfrThreshold) {
    parts.push(
      `threshold: ${JSON.stringify(node.properties.nfrThreshold)}`.replace(/"/g, '\\"')
    );
  }
  parts.push(`sourceFile: "${node.source.filePath}"`);
  parts.push(`chapter: "${node.source.chapter}"`);
  return parts.join(', ');
}

function nodeLabels(node: IRNode): string {
  const labels: string[] = [];
  for (const label of node.labels) {
    const clean = label.startsWith(':') ? label.slice(1) : label;
    if (clean) labels.push(clean);
  }
  if (node.type === 'nfr' && node.properties.nfrCategory) {
    labels.push(nfrLabel(node.properties.nfrCategory));
  }
  if (node.type === 'requirement') labels.push('Requirement');
  return labels.map(l => `:${l}`).join('');
}

function edgeProperties(edge: IREdge): string {
  const parts: string[] = [];
  if (edge.type === 'cross_file_depends' && edge.properties.crossFileWeight !== undefined) {
    parts.push(`crossFileWeight: ${edge.properties.crossFileWeight}`);
  }
  if (edge.properties.confidence !== undefined) {
    parts.push(`confidence: ${edge.properties.confidence}`);
  }
  if (edge.properties.proposed === true) {
    parts.push('proposed: true');
  }
  return parts.join(', ');
}

function sanitizeEdgeRelType(type: string): string {
  return type.replace(/[^A-Za-z0-9_]/g, '');
}

export class CypherEmitter implements Emitter {
  readonly name = 'cypher';
  readonly description = 'Export SRS IR to Cypher knowledge graph (Neo4j)';
  readonly outputDir = '2_graph';

  emit(ir: SRSIR, workdir: string): EmitResult {
    const lines: string[] = [
      '// ============================================================',
      '// SRS Knowledge Graph — Neo4j Cypher Export',
      `// Nodes: ${ir.nodes.length}, Edges: ${ir.edges.length}`,
      `// Generated: ${new Date().toISOString()}`,
      '// ============================================================',
      '',
      '// === Nodes ===',
    ];

    for (const node of ir.nodes) {
      const sid = sanitizeId(node.id);
      const labels = nodeLabels(node);
      const safeId = escapeCypherIdentifier(node.id);
      const props = nodeProperties(node);
      lines.push(`CREATE (${sid}${labels} {id: "${safeId}", ${props}});`);
    }

    lines.push('');
    lines.push('// === Edges ===');

    for (const edge of ir.edges) {
      const src = sanitizeId(edge.source);
      const tgt = sanitizeId(edge.target);
      const rel = sanitizeEdgeRelType(edge.type);
      const eProps = edgeProperties(edge);
      const eStr = eProps ? ` {${eProps}}` : '';
      lines.push(`CREATE (${src})-[:${rel}${eStr}]->(${tgt});`);
    }

    lines.push('');

    const outputDir = path.join(workdir, this.outputDir);
    fs.mkdirSync(outputDir, { recursive: true });
    const cypherFile = path.join(outputDir, 'srs-graph.cypher');
    fs.writeFileSync(cypherFile, lines.join('\n'), 'utf-8');

    return {
      files: [cypherFile],
      fileCount: 1,
      metadata: {
        nodes: ir.nodes.length,
        edges: ir.edges.length,
        nfr_nodes: ir.nodes.filter(n => n.type === 'nfr').length,
      },
    };
  }
}
