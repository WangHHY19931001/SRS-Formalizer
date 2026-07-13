import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SRSIR } from '../../types/srs-ir.js';
import type { Emitter, EmitResult } from './types.js';
import { sanitizeId } from '../id-utils.js';
import { exportGraphToCypher, type CypherNode, type CypherEdge } from '../cypher.js';
import { scanLeanSourceForPlaceholders } from '../verify-gate/shared.js';

interface ParsedLeanFile {
  fileName: string;
  imports: string[];
  theorems: Array<{ name: string; statement: string; usedLemmas: string[] }>;
  lemmas: Array<{ name: string; statement: string }>;
  axioms: Array<{ name: string; statement: string }>;
  hasSorry: boolean;
}

interface LeanNode {
  id: string;
  labels: string[];
  properties: Record<string, string | number | boolean>;
}

interface LeanEdge {
  source: string;
  target: string;
  type: string;
  properties?: Record<string, string>;
}

interface LeanGraph {
  version: string;
  nodes: LeanNode[];
  edges: LeanEdge[];
  metadata: Record<string, unknown>;
}

function parseLeanFile(filePath: string): ParsedLeanFile | null {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const fileName = path.basename(filePath);

  const parsed: ParsedLeanFile = {
    fileName,
    imports: [],
    theorems: [],
    lemmas: [],
    axioms: [],
    hasSorry: false,
  };

  const importRe = /^import\s+(.+)$/gm;
  let im: RegExpExecArray | null;
  while ((im = importRe.exec(raw)) !== null) {
    parsed.imports.push(im[1]!.trim());
  }

  if (raw.includes('sorry')) {
    parsed.hasSorry = true;
  }

  const theoremRe = /^theorem\s+(\w+)\s*(\([^)]*\))?\s*:\s*(.+?)(?::=|$)/gm;
  let tm: RegExpExecArray | null;
  while ((tm = theoremRe.exec(raw)) !== null) {
    const name = tm[1]!;
    const statement = (tm[3] || '').trim();
    const proofBody = extractProofBody(raw, tm.index);
    const usedLemmas = findReferencedNames(proofBody, parsed.lemmas.map(l => l.name));
    parsed.theorems.push({ name, statement, usedLemmas });
  }

  const lemmaRe = /^lemma\s+(\w+)\s*(\([^)]*\))?\s*:\s*(.+?)(?::=|$)/gm;
  let lm: RegExpExecArray | null;
  while ((lm = lemmaRe.exec(raw)) !== null) {
    parsed.lemmas.push({
      name: lm[1]!,
      statement: (lm[3] || '').trim(),
    });
  }

  const axiomRe = /^axiom\s+(\w+)\s*(\([^)]*\))?\s*:\s*(.+?)(?::=|$)/gm;
  let am: RegExpExecArray | null;
  while ((am = axiomRe.exec(raw)) !== null) {
    parsed.axioms.push({
      name: am[1]!,
      statement: (am[3] || '').trim(),
    });
  }

  return parsed;
}

function extractProofBody(raw: string, startIndex: number): string {
  const afterDecl = raw.slice(startIndex);
  const colonEq = afterDecl.indexOf(':=');
  if (colonEq === -1) return '';
  return afterDecl.slice(colonEq + 2);
}

function findReferencedNames(body: string, knownLemmas: string[]): string[] {
  return knownLemmas.filter(name => body.includes(name));
}

function computeMaxDepth(nodes: LeanNode[], edges: LeanEdge[]): number {
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

function buildLeanGraph(proofsDir: string): LeanGraph {
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

  const allLemmaNames = new Set<string>();
  for (const pf of allParsed) {
    for (const l of pf.lemmas) allLemmaNames.add(l.name);
  }

  for (const pf of allParsed) {
    const fileNodeId = `File-${sanitizeId(pf.fileName)}`;

    if (pf.hasSorry) totalSorry++;

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

      for (const lemmaName of thm.usedLemmas) {
        const lemmaId = `Lemma-${sanitizeId(pf.fileName)}-${sanitizeId(lemmaName)}`;
        edges.push({ source: thmId, target: lemmaId, type: 'DEPENDS_ON' });
        edges.push({ source: lemmaId, target: thmId, type: 'PROVES' });
      }

      for (const imp of pf.imports) {
        edges.push({ source: thmId, target: `Import-${sanitizeId(imp)}`, type: 'USES' });
      }
    }

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

  for (const pf of allParsed) {
    for (const thm of pf.theorems) {
      const body = thm.statement;
      for (const lemmaName of allLemmaNames) {
        if (body.includes(lemmaName) && !thm.usedLemmas.includes(lemmaName)) {
          for (const otherPf of allParsed) {
            if (otherPf.lemmas.some(l => l.name === lemmaName)) {
              const thmId = `Theorem-${sanitizeId(pf.fileName)}-${sanitizeId(thm.name)}`;
              const lemmaId = `Lemma-${sanitizeId(otherPf.fileName)}-${sanitizeId(lemmaName)}`;
              edges.push({
                source: thmId,
                target: lemmaId,
                type: 'DEPENDS_ON',
                properties: { cross_file: 'true' },
              });
              break;
            }
          }
        }
      }
    }
  }

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
    },
  };
}

export class LeanGraphEmitter implements Emitter {
  readonly name = 'leanGraph';
  readonly description = 'Build proof dependency graph from Lean 4 proof files';
  readonly outputDir = '2_graph';

  emit(_ir: SRSIR, workdir: string): EmitResult {
    const proofsDir = path.join(workdir, '5_formal', 'proofs');
    if (!fs.existsSync(proofsDir)) {
      return { files: [], fileCount: 0, metadata: { error: 'proofs directory not found' } };
    }

    const graph = buildLeanGraph(proofsDir);
    const placeholders = scanLeanSourceForPlaceholders(proofsDir);

    const jsonFile = path.join(workdir, this.outputDir, 'lean-proof-graph.json');
    const cypherFile = path.join(workdir, this.outputDir, 'lean-proof.cypher');

    fs.mkdirSync(path.join(workdir, this.outputDir), { recursive: true });
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
      title: 'Lean 4 Proof Dependency Graph',
      headerLines: [
        `Generated: ${graph.metadata.generated_at as string}`,
        `Files: ${graph.metadata.file_count as number}`,
        `Theorems: ${graph.metadata.theorem_count as number}`,
        `Lemmas: ${graph.metadata.lemma_count as number}`,
        `Axioms: ${graph.metadata.axiom_count as number}`,
        `Imports: ${graph.metadata.import_count as number}`,
        `Max proof depth: ${graph.metadata.max_proof_depth as number}`,
        ...(graph.metadata.axiom_count as number > 0 ? ['⚠ WARNING: axioms detected!'] : []),
        ...(graph.metadata.sorry_count as number > 0 ? ['⚠ WARNING: sorry detected!'] : []),
        ...(placeholders.length > 0 ? [`⚠ Placeholders: ${placeholders.map(p => `${p.file}:${p.kind}`).join(', ')}`] : []),
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
