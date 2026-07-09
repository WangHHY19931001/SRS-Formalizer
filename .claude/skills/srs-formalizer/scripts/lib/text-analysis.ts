/**
 * Text analysis utilities — tokenization, Jaccard similarity, antonym detection,
 * CJK bigram extraction, and same-aspect clustering for requirement graph analysis.
 */

import { Graph } from './graph.js';
import { jaccardSimilarity } from './graph-algorithms.js';

export { jaccardSimilarity };

export function tokenize(text: string): Set<string> {
  const tokens = new Set<string>();
  const lower = text.toLowerCase();
  const cjkRegex = /[一-鿿㐀-䶿豈-﫿]/g;
  let match: RegExpExecArray | null;
  while ((match = cjkRegex.exec(lower)) !== null) tokens.add(match[0]);
  const wordRegex = /[a-z0-9_]+/g;
  while ((match = wordRegex.exec(lower)) !== null) tokens.add(match[0]);
  return tokens;
}

const NEGATION_PATTERNS = [/不[应能会可]/, /必须不/, /不得/, /禁止/, /严禁/, /不应/];
const AFFIRMATION_PATTERNS = [/[应能会可]/, /必须/, /需要/, /应当/];

export function hasNegation(text: string): boolean { return NEGATION_PATTERNS.some(p => p.test(text)); }

export function hasAffirmation(text: string): boolean {
  if (hasNegation(text)) return false;
  return AFFIRMATION_PATTERNS.some(p => p.test(text));
}

export function isAntonymPair(textA: string, textB: string): boolean {
  const aNeg = hasNegation(textA), bNeg = hasNegation(textB);
  const aAff = hasAffirmation(textA), bAff = hasAffirmation(textB);
  return (aNeg && bAff && !bNeg) || (bNeg && aAff && !aNeg);
}

export function extractCjkBigrams(text: string): string[] {
  const chars = [...text].filter(c => /[一-鿿]/.test(c));
  const bigrams: string[] = [];
  for (let i = 0; i < chars.length - 1; i++) bigrams.push(chars[i]! + chars[i + 1]!);
  return bigrams;
}

const STOPWORD_BIGRAMS = new Set([
  '可以', '需要', '进行', '通过', '使用', '一个', '这个', '那个',
  '这些', '那些', '什么', '如何', '如果', '因为', '所以', '但是',
  '而且', '或者', '不是', '就是', '还是', '没有', '已经', '以及',
  '其中', '之后', '其中', '以上', '以下', '之间', '并且',
]);

export function isMeaningfulBigram(bigram: string): boolean { return !STOPWORD_BIGRAMS.has(bigram); }

export function findSameAspectClusters(
  graph: Graph,
  nodeIds: string[]
): { object: string; nodes: string[]; statements: string[] }[] {
  const nodeBigrams = new Map<string, string[]>();
  const nodeStatements = new Map<string, string>();
  for (const nodeId of nodeIds) {
    const node = graph.getNode(nodeId);
    if (!node) continue;
    const statement = (node.properties.statement as string) ?? '';
    nodeStatements.set(nodeId, statement);
    nodeBigrams.set(nodeId, extractCjkBigrams(statement));
  }

  const bigramNodes = new Map<string, Set<string>>();
  for (const [nodeId, bigrams] of nodeBigrams) {
    for (const bigram of bigrams) {
      if (!isMeaningfulBigram(bigram)) continue;
      if (!bigramNodes.has(bigram)) bigramNodes.set(bigram, new Set());
      bigramNodes.get(bigram)!.add(nodeId);
    }
  }

  const seenNodes = new Set<string>();
  const clusters: { object: string; nodes: string[]; statements: string[] }[] = [];
  const sortedBigrams = [...bigramNodes.entries()].filter(([_, ids]) => ids.size >= 2).sort((a, b) => b[1].size - a[1].size);

  for (const [bigram, nodeIdsSet] of sortedBigrams) {
    const ids = [...nodeIdsSet].filter(id => !seenNodes.has(id));
    if (ids.length >= 2) {
      for (const id of ids) seenNodes.add(id);
      clusters.push({ object: bigram, nodes: ids, statements: ids.map(id => nodeStatements.get(id) ?? '') });
    }
  }

  return clusters;
}
