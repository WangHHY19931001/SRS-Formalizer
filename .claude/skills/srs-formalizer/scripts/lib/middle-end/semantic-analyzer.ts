import type { SRSIR, IRNode } from '../../types/srs-ir.js';

export interface SemanticReport {
  duplicatePairs: { a: string; b: string; jaccard: number }[];
  conflictPairs: { a: string; b: string; reason: string }[];
  sameAspectClusters: { module: string; nodes: string[] }[];
  stats: {
    totalAnalyzed: number;
    duplicateCount: number;
    conflictCount: number;
  };
}

const ANTONYM_PAIRS: [RegExp, RegExp][] = [
  [/\bmust\b/i, /\bmust not\b/i],
  [/\bshall\b/i, /\bshall not\b/i],
  [/必须/, /不得/],
  [/必须/, /禁止/],
  [/应当/, /不应/],
];

export function analyzeSemantics(ir: SRSIR): SemanticReport {
  const reqNodes = ir.nodes.filter(n => n.type === 'requirement');
  const duplicatePairs = findDuplicatePairs(reqNodes);
  const conflictPairs = findConflictPairs(reqNodes);
  const sameAspectClusters = findSameAspectClusters(reqNodes);
  return {
    duplicatePairs,
    conflictPairs,
    sameAspectClusters,
    stats: {
      totalAnalyzed: reqNodes.length,
      duplicateCount: duplicatePairs.length,
      conflictCount: conflictPairs.length,
    },
  };
}

function tokenize(statement: string): Set<string> {
  return new Set(
    statement.toLowerCase()
      .replace(/[^\w\u4e00-\u9fff]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 1)
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  const intersection = [...a].filter(x => b.has(x));
  const union = new Set([...a, ...b]);
  return union.size > 0 ? intersection.length / union.size : 0;
}

function findDuplicatePairs(nodes: IRNode[]): { a: string; b: string; jaccard: number }[] {
  const pairs: { a: string; b: string; jaccard: number }[] = [];
  const tokens = nodes.map(n => ({ id: n.id, tokens: tokenize(n.properties.statement ?? '') }));
  for (let i = 0; i < tokens.length; i++) {
    const ti = tokens[i]!;
    for (let j = i + 1; j < tokens.length; j++) {
      const tj = tokens[j]!;
      const sim = jaccard(ti.tokens, tj.tokens);
      if (sim >= 0.8) pairs.push({ a: ti.id, b: tj.id, jaccard: sim });
    }
  }
  return pairs;
}

function findConflictPairs(nodes: IRNode[]): { a: string; b: string; reason: string }[] {
  const pairs: { a: string; b: string; reason: string }[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const ni = nodes[i]!;
    for (let j = i + 1; j < nodes.length; j++) {
      const nj = nodes[j]!;
      const sa = ni.properties.statement ?? '';
      const sb = nj.properties.statement ?? '';
      for (const [p1, p2] of ANTONYM_PAIRS) {
        if ((p1.test(sa) && p2.test(sb)) || (p2.test(sa) && p1.test(sb))) {
          pairs.push({ a: ni.id, b: nj.id, reason: `antonym conflict: ${p1.source} vs ${p2.source}` });
          break;
        }
      }
    }
  }
  return pairs;
}

function findSameAspectClusters(nodes: IRNode[]): { module: string; nodes: string[] }[] {
  const byModule = new Map<string, string[]>();
  for (const n of nodes) {
    const mod = n.module;
    if (!byModule.has(mod)) byModule.set(mod, []);
    byModule.get(mod)!.push(n.id);
  }
  return [...byModule.entries()]
    .filter(([, ids]) => ids.length >= 3)
    .map(([module, ids]) => ({ module, nodes: ids }));
}
