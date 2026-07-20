/**
 * rid-mapping.ts — RID ↔ IR node mapping contract (proposal §P1-2).
 *
 * Frozen assets tag scenarios with `@RID-BDD-*`; the skill emits `R1-Sxxx-xxxx`
 * ids. Without an authoritative map the traceability chain breaks. This module
 * builds `_ctx/rid_mapping.json` from two evidence sources, in priority order:
 *   1. explicit `ridRef` carried on an IR node (highest confidence);
 *   2. statement-token Jaccard similarity between a frozen RID's scenario text
 *      and IR requirement statements (heuristic, confidence = similarity).
 *
 * The builder is pure/deterministic; the actual file scan lives in the command.
 */

import type { RidMapping, RidMappingEntry, SRSIR } from '../types/srs-ir.js';
import { tokenize, jaccardSimilarity } from './text-analysis.js';

/** A frozen RID with the natural-language text it was tagged against. */
export interface FrozenRid {
  rid: string;
  text: string;
}

/** Matches `RID-BDD-...` / `RID-...` tokens (with or without a leading `@`). */
export const RID_PATTERN = /@?(RID-[A-Z0-9]+(?:-[A-Z0-9]+)+)/g;

/** Extract unique RID tokens (and the line they appear on) from feature text. */
export function extractFrozenRids(featureText: string): FrozenRid[] {
  const byRid = new Map<string, string>();
  for (const rawLine of featureText.split('\n')) {
    const line = rawLine.trim();
    RID_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = RID_PATTERN.exec(line)) !== null) {
      const rid = match[1]!;
      // Prefer the longest surrounding text seen for this RID (scenario titles
      // carry the RID and the behaviour phrase on the same line).
      const existing = byRid.get(rid) ?? '';
      if (line.length > existing.length) byRid.set(rid, line);
    }
  }
  return [...byRid.entries()].map(([rid, text]) => ({ rid, text }));
}

const SIMILARITY_FLOOR = 0.12;

/**
 * Build the RID → IR mapping. `explicit` wins; otherwise the best
 * similarity-scored requirement node above SIMILARITY_FLOOR is linked.
 */
export function buildRidMapping(
  frozenRids: FrozenRid[],
  ir: SRSIR,
  sourcePath: string,
): RidMapping {
  const requirements = ir.nodes.filter(n => n.type === 'requirement' || n.type === 'nfr');
  const nodeTokens = new Map<string, Set<string>>();
  for (const node of requirements) nodeTokens.set(node.id, tokenize(node.properties.statement ?? ''));

  const entries: RidMappingEntry[] = [];
  const mappedNodeIds = new Set<string>();
  const unmappedRids: string[] = [];

  for (const { rid, text } of frozenRids) {
    // 1. explicit ridRef on any node
    const explicit = requirements.filter(n => n.properties.ridRef === rid).map(n => n.id);
    if (explicit.length > 0) {
      entries.push({ rid, irNodeIds: explicit, matchType: 'explicit-tag', confidence: 1 });
      for (const id of explicit) mappedNodeIds.add(id);
      continue;
    }
    // 2. statement similarity
    const ridTokens = tokenize(text.replace(RID_PATTERN, ' '));
    let best = { id: '', score: 0 };
    for (const node of requirements) {
      const score = jaccardSimilarity(ridTokens, nodeTokens.get(node.id)!);
      if (score > best.score) best = { id: node.id, score };
    }
    if (best.id && best.score >= SIMILARITY_FLOOR) {
      entries.push({ rid, irNodeIds: [best.id], matchType: 'statement-similarity', confidence: Math.round(best.score * 1000) / 1000 });
      mappedNodeIds.add(best.id);
    } else {
      unmappedRids.push(rid);
    }
  }

  const unmappedNodeIds = requirements.filter(n => !mappedNodeIds.has(n.id)).map(n => n.id);

  return {
    version: '1.0',
    sourcePath,
    generatedAt: new Date().toISOString(),
    entries,
    unmappedRids,
    unmappedNodeIds,
  };
}
