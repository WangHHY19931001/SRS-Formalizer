/**
 * Lean 4 graph builder — assembles LeanGraph from parsed Lean files.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { sanitizeId } from '../id-utils.js';
import type { LeanNode, LeanEdge, LeanGraph } from './types.js';
import { parseLeanFile, type ParsedLeanFile } from './parser.js';

export function buildLeanGraphFromDir(proofsDir: string, workDir: string): LeanGraph {
  const files = fs.readdirSync(proofsDir).filter(f => f.endsWith('.lean')).sort();
  const allParsed: ParsedLeanFile[] = [];

  for (const file of files) {
    const parsed = parseLeanFile(path.join(proofsDir, file));
    if (parsed) allParsed.push(parsed);
  }

  const nodes: LeanNode[] = [];
  const edges: LeanEdge[] = [];
  let totalTheorems = 0;
  let totalLemmas = 0;
  let totalAxioms = 0;
  let totalImports = 0;
  let totalSorry = 0;
  const allImportNames = new Set<string>();

  // Collect all lemma names across files for cross-file dependency detection
  const allLemmaNames = new Set<string>();
  for (const pf of allParsed) {
    for (const l of pf.lemmas) allLemmaNames.add(l.name);
  }

  for (const pf of allParsed) {
    const fileNodeId = `File-${sanitizeId(pf.fileName)}`;

    if (pf.hasSorry) totalSorry++;

    // Imports
    for (const imp of pf.imports) {
      const impId = `Import-${sanitizeId(imp)}`;
      if (!allImportNames.has(imp)) {
        allImportNames.add(imp);
        nodes.push({
          id: impId,
          labels: ['Import'],
          properties: { name: imp, module: imp },
        });
        totalImports++;
      }
      edges.push({ source: fileNodeId, target: impId, type: 'IMPORTS' });
    }

    // Theorems
    for (const thm of pf.theorems) {
      const thmId = `Theorem-${sanitizeId(pf.fileName)}-${sanitizeId(thm.name)}`;
      totalTheorems++;
      nodes.push({
        id: thmId,
        labels: ['Theorem'],
        properties: {
          name: thm.name,
          file: pf.fileName,
          statement: thm.statement.slice(0, 300),
          lemma_deps: thm.usedLemmas.length,
        },
      });

      // Theorem depends on lemmas it uses
      for (const lemmaName of thm.usedLemmas) {
        const lemmaId = `Lemma-${sanitizeId(pf.fileName)}-${sanitizeId(lemmaName)}`;
        edges.push({ source: thmId, target: lemmaId, type: 'DEPENDS_ON' });
        edges.push({ source: lemmaId, target: thmId, type: 'PROVES' });
      }

      // Theorem uses imports
      for (const imp of pf.imports) {
        edges.push({ source: thmId, target: `Import-${sanitizeId(imp)}`, type: 'USES' });
      }
    }

    // Lemmas
    for (const lemma of pf.lemmas) {
      const lemmaId = `Lemma-${sanitizeId(pf.fileName)}-${sanitizeId(lemma.name)}`;
      totalLemmas++;
      nodes.push({
        id: lemmaId,
        labels: ['Lemma'],
        properties: {
          name: lemma.name,
          file: pf.fileName,
          statement: lemma.statement.slice(0, 300),
        },
      });
    }

    // Axioms (quality flag)
    for (const ax of pf.axioms) {
      const axId = `Axiom-${sanitizeId(pf.fileName)}-${sanitizeId(ax.name)}`;
      totalAxioms++;
      nodes.push({
        id: axId,
        labels: ['Axiom'],
        properties: {
          name: ax.name,
          file: pf.fileName,
          statement: ax.statement.slice(0, 300),
          warning: 'Axiom detected — proof may be incomplete',
        },
      });
    }
  }

  // Cross-file dependencies: if lemma in file A is used by theorem in file B
  for (const pf of allParsed) {
    for (const thm of pf.theorems) {
      const body = thm.statement;
      for (const lemmaName of allLemmaNames) {
        if (body.includes(lemmaName) && !thm.usedLemmas.includes(lemmaName)) {
          // Find which file defines this lemma
          for (const otherPf of allParsed) {
            if (otherPf.lemmas.some(l => l.name === lemmaName)) {
              const thmId = `Theorem-${sanitizeId(pf.fileName)}-${sanitizeId(thm.name)}`;
              const lemmaId = `Lemma-${sanitizeId(otherPf.fileName)}-${sanitizeId(lemmaName)}`;
              edges.push({ source: thmId, target: lemmaId, type: 'DEPENDS_ON',
                properties: { cross_file: 'true' } });
              break;
            }
          }
        }
      }
    }
  }

  // Compute max depth (longest chain of DEPENDS_ON)
  const maxDepth = computeMaxDepth(nodes, edges);

  return {
    version: '1.0',
    nodes,
    edges,
    metadata: {
      generated_at: new Date().toISOString(),
      file_count: files.length,
      theorem_count: totalTheorems,
      lemma_count: totalLemmas,
      axiom_count: totalAxioms,
      sorry_count: totalSorry,
      import_count: totalImports,
      max_proof_depth: maxDepth,
      source_workdir: workDir,
    },
  };
}

function computeMaxDepth(nodes: LeanNode[], edges: LeanEdge[]): number {
  // Simple BFS from theorems to find longest DEPENDS_ON chain
  const depths = new Map<string, number>();
  const theoremNodes = nodes.filter(n => n.labels.includes('Theorem'));
  for (const t of theoremNodes) depths.set(t.id, 1);

  let changed = true;
  let iterations = 0;
  while (changed && iterations < 100) {
    changed = false;
    iterations++;
    for (const edge of edges) {
      if (edge.type !== 'DEPENDS_ON') continue;
      const srcDepth = depths.get(edge.source);
      if (srcDepth !== undefined) {
        const newDepth = srcDepth + 1;
        if (!depths.has(edge.target) || depths.get(edge.target)! < newDepth) {
          depths.set(edge.target, newDepth);
          changed = true;
        }
      }
    }
  }

  return Math.max(1, ...Array.from(depths.values()));
}
