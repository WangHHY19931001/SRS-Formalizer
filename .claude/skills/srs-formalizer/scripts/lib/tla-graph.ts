/**
 * tla-graph.ts — TLA+ System Interaction Graph (S5 系统交互图谱)
 *
 * Parses validated TLA+ spec files and builds a structured graph capturing:
 *   - System boundaries (external actors, internal subsystems)
 *   - Hierarchical decomposition (L1→L2→L3 per the coding guide)
 *   - State transitions and invariants
 *   - Cross-system interactions
 *
 * Node types:
 *   :System        — a TLA+ module (top-level or sub-system)
 *   :ExternalActor — an external system/actor (from CONSTANTS or comments)
 *   :State         — a named state or variable group
 *   :Action        — a named action/transition
 *   :Invariant     — a named invariant property
 *
 * Edge types:
 *   DECOMPOSES_INTO  — System → SubSystem (L1→L2→L3 hierarchy)
 *   INTERACTS_WITH   — System ↔ ExternalActor
 *   TRANSITIONS_TO   — State → Action → State
 *   MAINTAINS         — System → Invariant
 *   REFERENCES        — Action → Variable (reads/writes)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ===================== Types =====================

export interface TlaNode {
  id: string;
  labels: string[];
  properties: Record<string, string | number | boolean>;
}

export interface TlaEdge {
  source: string;
  target: string;
  type: 'DECOMPOSES_INTO' | 'INTERACTS_WITH' | 'TRANSITIONS_TO' | 'MAINTAINS' | 'REFERENCES';
  properties?: Record<string, string>;
}

export interface TlaGraph {
  version: '1.0';
  nodes: TlaNode[];
  edges: TlaEdge[];
  metadata: {
    generated_at: string;
    spec_count: number;
    total_actions: number;
    total_invariants: number;
    max_hierarchy_depth: number;
    source_workdir: string;
  };
}

// ===================== Parser =====================

interface ParsedTlaModule {
  name: string;
  parent?: string;
  siblings: string[];
  children: string[];
  constants: string[];
  variables: string[];
  actions: Array<{ name: string; body: string }>;
  invariants: Array<{ name: string; body: string }>;
  rawText: string;
}

function parseTlaFile(filePath: string): ParsedTlaModule | null {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n');

  const mod: ParsedTlaModule = {
    name: '',
    siblings: [],
    children: [],
    constants: [],
    variables: [],
    actions: [],
    invariants: [],
    rawText: raw,
  };

  // Extract module name
  const moduleMatch = raw.match(/----\s*MODULE\s+(\w+)\s*----/);
  if (!moduleMatch) return null;
  mod.name = moduleMatch[1]!;

  // Extract hierarchical annotations from header comments
  for (const line of lines) {
    const parentMatch = line.match(/\\\*\s*上级:\s*(.+)/);
    const siblingMatch = line.match(/\\\*\s*同级:\s*(.+)/);
    const childMatch = line.match(/\\\*\s*下级:\s*(.+)/);

    if (parentMatch) mod.parent = parentMatch[1]!.trim();
    if (siblingMatch) mod.siblings = siblingMatch[1]!.trim().split(/\s+/).filter(Boolean);
    if (childMatch) mod.children = childMatch[1]!.trim().split(/\s+/).filter(Boolean);
  }

  // Extract CONSTANTS
  const constMatch = raw.match(/CONSTANTS?\s+([\s\S]*?)(?=\n\S|\n\s*VARIABLE|\n\s*ASSUME|$)/i);
  if (constMatch) {
    mod.constants = constMatch[1]!.split(',').map(s => s.trim()).filter(s => s.length > 0 && !s.startsWith('\\'));
  }

  // Extract VARIABLES
  const varMatch = raw.match(/VARIABLES?\s+([\s\S]*?)(?=\n\S|\n\s*$)/i);
  if (varMatch) {
    mod.variables = varMatch[1]!.split(',').map(s => s.trim()).filter(s => s.length > 0 && !s.startsWith('\\'));
  }

  // Extract named actions (definitions with ==)
  const actionRe = /^(\w+)\s*==\s*(.+)$/gm;
  let am: RegExpExecArray | null;
  while ((am = actionRe.exec(raw)) !== null) {
    const name = am[1]!;
    const body = am[2]!.trim();
    // Skip built-in operators and type invariants
    if (name === 'TypeOK' || name === 'Init' || name === 'Next') {
      if (name === 'TypeOK') {
        mod.invariants.push({ name: 'TypeOK', body });
      }
      mod.actions.push({ name, body });
      continue;
    }
    // Heuristic: if definition contains /\ or \/ it's an invariant candidate
    if (body.includes('/\\') || body.includes('\\/')) {
      if (name.match(/^(Inv|Invariant|Prop)/i) || body.toLowerCase().includes('invariant')) {
        mod.invariants.push({ name, body });
      }
    }
    mod.actions.push({ name, body });
  }

  // Also check for explicit INVARIANT declarations
  const invRe = /INVARIANT\s+(\w+)/gi;
  let im: RegExpExecArray | null;
  while ((im = invRe.exec(raw)) !== null) {
    const invName = im[1]!;
    if (!mod.invariants.some(i => i.name === invName)) {
      mod.invariants.push({ name: invName, body: '' });
    }
  }

  // Extract INSTANCE (subsystem imports)
  const instRe = /INSTANCE\s+(\w+)/gi;
  let insm: RegExpExecArray | null;
  while ((insm = instRe.exec(raw)) !== null) {
    mod.children.push(insm[1]!);
  }

  return mod;
}

// ===================== Graph Builder =====================

function sanitizeId(name: string): string {
  return name.replace(/[^A-Za-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

export function buildTlaGraphFromDir(specsDir: string, workDir: string): TlaGraph {
  const files = fs.readdirSync(specsDir).filter(f => f.endsWith('.tla')).sort();
  const modules: ParsedTlaModule[] = [];

  for (const file of files) {
    const parsed = parseTlaFile(path.join(specsDir, file));
    if (parsed) modules.push(parsed);
  }

  const nodes: TlaNode[] = [];
  const edges: TlaEdge[] = [];
  let totalActions = 0;
  let totalInvariants = 0;
  let maxDepth = 1;

  const moduleMap = new Map<string, string>(); // module name → node ID

  for (const mod of modules) {
    const sysId = `System-${sanitizeId(mod.name)}`;
    moduleMap.set(mod.name, sysId);

    nodes.push({
      id: sysId,
      labels: ['System'],
      properties: {
        name: mod.name,
        module: mod.name,
        parent: mod.parent ?? '',
        depth: 1,
        constant_count: mod.constants.length,
        variable_count: mod.variables.length,
        action_count: mod.actions.length,
        invariant_count: mod.invariants.length,
        has_children: mod.children.length > 0,
      },
    });

    // External actors from CONSTANTS
    for (const c of mod.constants) {
      const actorId = `External-${sanitizeId(c)}`;
      nodes.push({
        id: actorId,
        labels: ['ExternalActor'],
        properties: { name: c, parameter_of: mod.name },
      });
      edges.push({ source: sysId, target: actorId, type: 'INTERACTS_WITH',
        properties: { direction: 'depends_on', note: 'System depends on external constant' } });
    }

    // Actions
    for (const act of mod.actions) {
      const actId = `Action-${sanitizeId(mod.name)}-${sanitizeId(act.name)}`;
      totalActions++;
      nodes.push({
        id: actId,
        labels: ['Action'],
        properties: { name: act.name, module: mod.name },
      });
      edges.push({ source: sysId, target: actId, type: 'TRANSITIONS_TO' });
    }

    // Invariants
    for (const inv of mod.invariants) {
      const invId = `Invariant-${sanitizeId(mod.name)}-${sanitizeId(inv.name)}`;
      totalInvariants++;
      nodes.push({
        id: invId,
        labels: ['Invariant'],
        properties: { name: inv.name, module: mod.name, body_preview: inv.body.slice(0, 200) },
      });
      edges.push({ source: sysId, target: invId, type: 'MAINTAINS' });
    }

    // Hierarchy from annotations or INSTANCE
    if (mod.parent) {
      const parentId = `System-${sanitizeId(mod.parent)}`;
      if (moduleMap.has(mod.parent) || modules.some(m => m.name === mod.parent)) {
        edges.push({ source: sysId, target: parentId, type: 'DECOMPOSES_INTO',
          properties: { direction: 'child_to_parent' } });
        // Update parent depth
        const depth = (mod.parent.split('.').length || 1) + 1;
        maxDepth = Math.max(maxDepth, depth);
        const pn = nodes.find(n => n.id === parentId);
        if (pn) pn.properties.depth = Math.max(Number(pn.properties.depth || 1), depth);
      }
    }

    // Cross-system edges from siblings
    for (const sib of mod.siblings) {
      const sibId = `System-${sanitizeId(sib)}`;
      edges.push({ source: sysId, target: sibId, type: 'INTERACTS_WITH',
        properties: { direction: 'peer', note: 'Sibling system interaction' } });
    }

    // Sub-system edges from children
    for (const child of mod.children) {
      const childId = `System-${sanitizeId(child)}`;
      edges.push({ source: sysId, target: childId, type: 'DECOMPOSES_INTO',
        properties: { direction: 'parent_to_child', via: 'INSTANCE' } });
    }
  }

  return {
    version: '1.0',
    nodes,
    edges,
    metadata: {
      generated_at: new Date().toISOString(),
      spec_count: modules.length,
      total_actions: totalActions,
      total_invariants: totalInvariants,
      max_hierarchy_depth: maxDepth,
      source_workdir: workDir,
    },
  };
}

// ===================== Cypher Export =====================

export function exportTlaToCypher(graph: TlaGraph): string {
  const lines: string[] = [
    '// ============================================================',
    '// TLA+ System Interaction Graph — Neo4j Cypher Export',
    `// Generated: ${graph.metadata.generated_at}`,
    `// Specs: ${graph.metadata.spec_count}`,
    `// Actions: ${graph.metadata.total_actions}`,
    `// Invariants: ${graph.metadata.total_invariants}`,
    `// Max hierarchy depth: ${graph.metadata.max_hierarchy_depth}`,
    '// ============================================================',
    '',
  ];

  for (const node of graph.nodes) {
    const labels = node.labels.map(l => `:${l}`).join('');
    const props = Object.entries(node.properties)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => typeof v === 'string' ? `${k}: ${JSON.stringify(v)}` : `${k}: ${v}`)
      .join(', ');
    lines.push(`CREATE (${sanitizeId(node.id)}${labels} {id: "${node.id}", ${props}});`);
  }

  lines.push('');

  for (const edge of graph.edges) {
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
