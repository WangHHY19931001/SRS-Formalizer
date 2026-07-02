/**
 * lean-graph.ts — Lean 4 Proof Dependency Graph (S5 算法序列图谱)
 *
 * Parses validated Lean 4 proof files and builds a structured graph capturing:
 *   - Theorem/lemma declarations and their dependencies
 *   - The split-proof methodology tree (theorem → sub-lemmas → leaf proofs)
 *   - Import chains and cross-file dependencies
 *
 * Conditional: only applicable when Lean 4 proofs were generated.
 * If no .lean files exist, the graph is skipped.
 *
 * Node types:
 *   :Theorem     — a top-level theorem statement
 *   :Lemma       — a helper lemma used in proofs
 *   :Import      — an imported module
 *   :Axiom       — an axiom declaration (flagged as quality issue)
 *
 * Edge types:
 *   PROVES       — Lemma → Theorem (lemma supports theorem)
 *   DEPENDS_ON   — Theorem → Lemma (theorem depends on lemma)
 *   IMPORTS      — File → Import
 *   USES         — Theorem → Import
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ===================== Types =====================

export interface LeanNode {
  id: string;
  labels: string[];
  properties: Record<string, string | number | boolean>;
}

export interface LeanEdge {
  source: string;
  target: string;
  type: 'PROVES' | 'DEPENDS_ON' | 'IMPORTS' | 'USES';
  properties?: Record<string, string>;
}

export interface LeanGraph {
  version: '1.0';
  nodes: LeanNode[];
  edges: LeanEdge[];
  metadata: {
    generated_at: string;
    file_count: number;
    theorem_count: number;
    lemma_count: number;
    axiom_count: number;
    sorry_count: number;
    import_count: number;
    max_proof_depth: number;
    source_workdir: string;
  };
}

// ===================== Parser =====================

interface ParsedLeanFile {
  fileName: string;
  imports: string[];
  theorems: Array<{ name: string; statement: string; usedLemmas: string[] }>;
  lemmas: Array<{ name: string; statement: string }>;
  axioms: Array<{ name: string; statement: string }>;
  hasSorry: boolean;
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

  // Extract imports
  const importRe = /^import\s+(.+)$/gm;
  let im: RegExpExecArray | null;
  while ((im = importRe.exec(raw)) !== null) {
    parsed.imports.push(im[1]!.trim());
  }

  // Detect sorry
  if (raw.includes('sorry')) {
    parsed.hasSorry = true;
  }

  // Extract theorem declarations (top-level entries)
  // Pattern: theorem name (params) : type := proof
  const theoremRe = /^theorem\s+(\w+)\s*(\([^)]*\))?\s*:\s*(.+?)(?::=|$)/gm;
  let tm: RegExpExecArray | null;
  while ((tm = theoremRe.exec(raw)) !== null) {
    const name = tm[1]!;
    const statement = (tm[3] || '').trim();

    // Find lemmas referenced in the proof body
    const proofBody = extractProofBody(raw, tm.index);
    const usedLemmas = findReferencedNames(proofBody, parsed.lemmas.map(l => l.name));

    parsed.theorems.push({ name, statement, usedLemmas });
  }

  // Extract lemma declarations
  const lemmaRe = /^lemma\s+(\w+)\s*(\([^)]*\))?\s*:\s*(.+?)(?::=|$)/gm;
  let lm: RegExpExecArray | null;
  while ((lm = lemmaRe.exec(raw)) !== null) {
    parsed.lemmas.push({
      name: lm[1]!,
      statement: (lm[3] || '').trim(),
    });
  }

  // Detect axioms (quality issue)
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
  // Extract from := to end of proof block
  const afterDecl = raw.slice(startIndex);
  const colonEq = afterDecl.indexOf(':=');
  if (colonEq === -1) return '';
  return afterDecl.slice(colonEq + 2);
}

function findReferencedNames(body: string, knownLemmas: string[]): string[] {
  return knownLemmas.filter(name => body.includes(name));
}

// ===================== Graph Builder =====================

function sanitizeId(name: string): string {
  return name.replace(/[^A-Za-z0-9_.-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

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

// ===================== Cypher Export =====================

export function exportLeanToCypher(graph: LeanGraph): string {
  const lines: string[] = [
    '// ============================================================',
    '// Lean 4 Proof Dependency Graph — Neo4j Cypher Export',
    `// Generated: ${graph.metadata.generated_at}`,
    `// Files: ${graph.metadata.file_count}`,
    `// Theorems: ${graph.metadata.theorem_count}`,
    `// Lemmas: ${graph.metadata.lemma_count}`,
    `// Axioms: ${graph.metadata.axiom_count}`,
    `// Imports: ${graph.metadata.import_count}`,
    `// Max proof depth: ${graph.metadata.max_proof_depth}`,
    graph.metadata.axiom_count > 0 ? '// ⚠ WARNING: axioms detected!' : '',
    graph.metadata.sorry_count > 0 ? '// ⚠ WARNING: sorry detected!' : '',
    '// ============================================================',
    '',
  ].filter(l => l !== '');

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
