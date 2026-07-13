import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SRSIR } from '../../types/srs-ir.js';
import type { Emitter, EmitResult } from './types.js';
import { sanitizeId } from '../id-utils.js';
import { exportGraphToCypher, type CypherNode, type CypherEdge } from '../cypher.js';
import { scanTlaSourceForPlaceholders } from '../verify-gate/shared.js';
import { ARTIFACT_PATHS, artifactPath } from '../artifacts/paths.js';

interface ParsedTlaAction {
  name: string;
  body: string;
}

interface ParsedTlaInvariant {
  name: string;
  body: string;
}

interface ParsedTlaModule {
  name: string;
  parent?: string;
  siblings: string[];
  children: string[];
  constants: string[];
  variables: string[];
  actions: ParsedTlaAction[];
  invariants: ParsedTlaInvariant[];
}

interface TlaNode {
  id: string;
  labels: string[];
  properties: Record<string, string | number | boolean>;
}

interface TlaEdge {
  source: string;
  target: string;
  type: string;
  properties?: Record<string, string>;
}

interface TlaGraph {
  version: string;
  nodes: TlaNode[];
  edges: TlaEdge[];
  metadata: Record<string, unknown>;
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
  };

  const moduleMatch = raw.match(/----\s*MODULE\s+(\w+)\s*----/);
  if (!moduleMatch) return null;
  mod.name = moduleMatch[1]!;

  for (const line of lines) {
    const parentMatch = line.match(/\\\*\s*上级:\s*(.+)/);
    const siblingMatch = line.match(/\\\*\s*同级:\s*(.+)/);
    const childMatch = line.match(/\\\*\s*下级:\s*(.+)/);

    if (parentMatch) mod.parent = parentMatch[1]!.trim();
    if (siblingMatch) mod.siblings = siblingMatch[1]!.trim().split(/\s+/).filter(Boolean);
    if (childMatch) mod.children = childMatch[1]!.trim().split(/\s+/).filter(Boolean);
  }

  const constMatch = raw.match(/CONSTANTS?\s+([\s\S]*?)(?=\n\S|\n\s*VARIABLE|\n\s*ASSUME|$)/i);
  if (constMatch) {
    mod.constants = constMatch[1]!.split(',').map(s => s.trim()).filter(s => s.length > 0 && !s.startsWith('\\'));
  }

  const varMatch = raw.match(/VARIABLES?\s+([\s\S]*?)(?=\n\S|\n\s*$)/i);
  if (varMatch) {
    mod.variables = varMatch[1]!.split(',').map(s => s.trim()).filter(s => s.length > 0 && !s.startsWith('\\'));
  }

  const actionRe = /^(\w+)\s*==\s*(.+)$/gm;
  let am: RegExpExecArray | null;
  while ((am = actionRe.exec(raw)) !== null) {
    const aname = am[1]!;
    const body = am[2]!.trim();
    if (aname === 'TypeOK' || aname === 'Init' || aname === 'Next') {
      if (aname === 'TypeOK') {
        mod.invariants.push({ name: 'TypeOK', body });
      }
      mod.actions.push({ name: aname, body });
      continue;
    }
    if (body.includes('/\\') || body.includes('\\/')) {
      if (aname.match(/^(Inv|Invariant|Prop)/i) || body.toLowerCase().includes('invariant')) {
        mod.invariants.push({ name: aname, body });
      }
    }
    mod.actions.push({ name: aname, body });
  }

  const invRe = /INVARIANT\s+(\w+)/gi;
  let im: RegExpExecArray | null;
  while ((im = invRe.exec(raw)) !== null) {
    const invName = im[1]!;
    if (!mod.invariants.some(i => i.name === invName)) {
      mod.invariants.push({ name: invName, body: '' });
    }
  }

  const instRe = /INSTANCE\s+(\w+)/gi;
  let insm: RegExpExecArray | null;
  while ((insm = instRe.exec(raw)) !== null) {
    mod.children.push(insm[1]!);
  }

  return mod;
}

function buildTlaGraph(specsDir: string): TlaGraph {
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

  const moduleMap = new Map<string, string>();

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

    for (const c of mod.constants) {
      const actorId = `External-${sanitizeId(c)}`;
      nodes.push({
        id: actorId,
        labels: ['ExternalActor'],
        properties: { name: c, parameter_of: mod.name },
      });
      edges.push({
        source: sysId,
        target: actorId,
        type: 'INTERACTS_WITH',
        properties: { direction: 'depends_on', note: 'System depends on external constant' },
      });
    }

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

    if (mod.parent) {
      const parentId = `System-${sanitizeId(mod.parent)}`;
      if (moduleMap.has(mod.parent) || modules.some(m => m.name === mod.parent)) {
        edges.push({
          source: sysId,
          target: parentId,
          type: 'DECOMPOSES_INTO',
          properties: { direction: 'child_to_parent' },
        });
        const depth = (mod.parent.split('.').length || 1) + 1;
        maxDepth = Math.max(maxDepth, depth);
        const pn = nodes.find(n => n.id === parentId);
        if (pn) pn.properties.depth = Math.max(Number(pn.properties.depth || 1), depth);
      }
    }

    for (const sib of mod.siblings) {
      const sibId = `System-${sanitizeId(sib)}`;
      edges.push({
        source: sysId,
        target: sibId,
        type: 'INTERACTS_WITH',
        properties: { direction: 'peer', note: 'Sibling system interaction' },
      });
    }

    for (const child of mod.children) {
      const childId = `System-${sanitizeId(child)}`;
      edges.push({
        source: sysId,
        target: childId,
        type: 'DECOMPOSES_INTO',
        properties: { direction: 'parent_to_child', via: 'INSTANCE' },
      });
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
    },
  };
}

export class TlaGraphEmitter implements Emitter {
  readonly name = 'tlaGraph';
  readonly description = 'Build system interaction graph from TLA+ specs';
  readonly outputDir = ARTIFACT_PATHS.graphs;

  emit(_ir: SRSIR, workdir: string): EmitResult {
    const specsDir = artifactPath(workdir, ARTIFACT_PATHS.tlaVerified);
    if (!fs.existsSync(specsDir)) {
      return { files: [], fileCount: 0, metadata: { skipped: 'verified TLA+ specs not found' } };
    }

    const graph = buildTlaGraph(specsDir);
    const placeholders = scanTlaSourceForPlaceholders(specsDir);

    const jsonFile = path.join(artifactPath(workdir, this.outputDir), 'tla-interaction-graph.json');
    const cypherFile = path.join(artifactPath(workdir, this.outputDir), 'tla-interaction.cypher');

    fs.mkdirSync(artifactPath(workdir, this.outputDir), { recursive: true });
    fs.writeFileSync(jsonFile, JSON.stringify(graph, null, 2), 'utf-8');

    const cypherNodes: CypherNode[] = graph.nodes.map(n => ({
      id: n.id,
      labels: n.labels,
      properties: n.properties,
    }));
    const cypherEdges: CypherEdge[] = graph.edges.map(e => ({
      source: e.source,
      target: e.target,
      type: e.type,
      ...(e.properties ? { properties: e.properties } : {}),
    }));
    const cypher = exportGraphToCypher(cypherNodes, cypherEdges, {
      title: 'TLA+ System Interaction Graph',
      headerLines: [
        `Generated: ${graph.metadata.generated_at as string}`,
        `Specs: ${graph.metadata.spec_count as number}`,
        `Actions: ${graph.metadata.total_actions as number}`,
        `Invariants: ${graph.metadata.total_invariants as number}`,
        `Max hierarchy depth: ${graph.metadata.max_hierarchy_depth as number}`,
        ...(placeholders.length > 0 ? [`⚠ Placeholders: ${placeholders.map(p => `${p.file}:${p.marker}`).join(', ')}`] : []),
      ],
    });
    fs.writeFileSync(cypherFile, cypher, 'utf-8');

    return {
      files: [jsonFile, cypherFile],
      fileCount: 2,
      metadata: {
        ...graph.metadata,
        placeholder_count: placeholders.length,
      },
    };
  }
}
