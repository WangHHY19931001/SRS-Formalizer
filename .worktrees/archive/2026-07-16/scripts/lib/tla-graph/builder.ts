/**
 * TLA+ graph builder — assembles TlaGraph from parsed TLA+ modules.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { sanitizeId } from '../id-utils.js';
import type { TlaNode, TlaEdge, TlaGraph } from './types.js';
import { parseTlaFile, type ParsedTlaModule } from './parser.js';

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
