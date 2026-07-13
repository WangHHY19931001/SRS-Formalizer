import type { SRSIR } from '../../types/srs-ir.js';

export interface ConnectivityReport {
  totalShards: number;
  connectedComponents: number;
  bridges: ProposedBridge[];
  orphanShards: string[];
}

export interface ProposedBridge {
  sourceNode: string;
  targetNode: string;
  reason: string;
  confidence: number;
}

function collectShardIds(ir: SRSIR): Set<string> {
  const shardIds = new Set<string>();
  for (const node of ir.nodes) {
    if (node.source.shardId) shardIds.add(node.source.shardId);
  }
  return shardIds;
}

function buildAdjacency(
  ir: SRSIR,
  shardIds: Set<string>,
): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const sid of shardIds) adj.set(sid, new Set());

  for (const edge of ir.edges) {
    const srcNode = ir.nodes.find(n => n.id === edge.source);
    const tgtNode = ir.nodes.find(n => n.id === edge.target);
    if (!srcNode || !tgtNode) continue;
    const srcSid = srcNode.source.shardId;
    const tgtSid = tgtNode.source.shardId;
    if (srcSid && tgtSid && srcSid !== tgtSid) {
      adj.get(srcSid)?.add(tgtSid);
      adj.get(tgtSid)?.add(srcSid);
    }
  }

  for (const ref of ir.crossRefs) {
    if (shardIds.has(ref.sourceShard) && shardIds.has(ref.targetShard)) {
      adj.get(ref.sourceShard)?.add(ref.targetShard);
      adj.get(ref.targetShard)?.add(ref.sourceShard);
    }
  }

  return adj;
}

function findComponents(
  shardIds: Set<string>,
  adj: Map<string, Set<string>>,
): { componentCount: number; componentMap: Map<string, number> } {
  const visited = new Set<string>();
  let componentCount = 0;
  const componentMap = new Map<string, number>();

  for (const sid of shardIds) {
    if (visited.has(sid)) continue;
    const queue = [sid];
    visited.add(sid);
    componentMap.set(sid, componentCount);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const nb of adj.get(cur) ?? []) {
        if (!visited.has(nb)) {
          visited.add(nb);
          queue.push(nb);
          componentMap.set(nb, componentCount);
        }
      }
    }
    componentCount++;
  }

  return { componentCount, componentMap };
}

function findOrphans(
  shardIds: Set<string>,
  adj: Map<string, Set<string>>,
): string[] {
  const orphans: string[] = [];
  for (const sid of shardIds) {
    if ((adj.get(sid)?.size ?? 0) === 0) {
      orphans.push(sid);
    }
  }
  return orphans;
}

function isCJK(c: string): boolean {
  const cp = c.codePointAt(0);
  return cp !== undefined && (
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0xf900 && cp <= 0xfaff)
  );
}

function tokenizeCJK(text: string): Set<string> {
  const chars = [...text.toLowerCase()];
  const tokens = new Set<string>();
  for (let i = 0; i < chars.length; i++) {
    if (isCJK(chars[i]!)) {
      tokens.add(chars[i]!);
      const bigram = chars.slice(i, i + 2).join('');
      if (bigram.length === 2 && [...bigram].every(isCJK)) {
        tokens.add(bigram);
      }
    }
  }
  return tokens;
}

function tokenizeStatement(stmt: string | undefined): Set<string> {
  if (!stmt) return new Set();
  const lower = stmt.toLowerCase();
  const cjk = tokenizeCJK(lower);
  const nonCJK = new Set(
    lower
      .split(/[\s,，。；;:：、\(\)（）\[\]{}「」『』""''\t\n\r]+/)
      .filter(w => w.length > 1 && [...w].every(c => !isCJK(c))),
  );
  return new Set([...cjk, ...nonCJK]);
}

function proposeBridges(
  ir: SRSIR,
  componentMap: Map<string, number>,
  componentCount: number,
): ProposedBridge[] {
  if (componentCount <= 1) return [];

  const componentNodes = new Map<number, string[]>();
  for (const n of ir.nodes) {
    if (n.source.shardId) {
      const comp = componentMap.get(n.source.shardId);
      if (comp !== undefined) {
        const list = componentNodes.get(comp) ?? [];
        list.push(n.id);
        componentNodes.set(comp, list);
      }
    }
  }

  if (componentNodes.size <= 1) return [];

  const bridges: ProposedBridge[] = [];
  const compIds = [...new Set(componentMap.values())];

  for (let i = 0; i < compIds.length; i++) {
    for (let j = i + 1; j < compIds.length; j++) {
      const ci = compIds[i]!;
      const cj = compIds[j]!;
      const nodesI = componentNodes.get(ci);
      const nodesJ = componentNodes.get(cj);
      if (!nodesI || !nodesJ) continue;

      let bestConfidence = 0;
      let bestNodeI = '';
      let bestNodeJ = '';
      let bestShared: string[] = [];

      for (const ni of nodesI.slice(0, 50)) {
        const nodeI = ir.nodes.find(n => n.id === ni);
        const wordsI = tokenizeStatement(nodeI?.properties.statement);
        if (wordsI.size === 0) continue;
        for (const nj of nodesJ.slice(0, 50)) {
          const nodeJ = ir.nodes.find(n => n.id === nj);
          const wordsJ = tokenizeStatement(nodeJ?.properties.statement);
          if (wordsJ.size === 0) continue;
          const shared = [...wordsI].filter(w => wordsJ.has(w));
          const confidence = shared.length / Math.max(wordsI.size, wordsJ.size, 1);
          if (confidence > bestConfidence) {
            bestConfidence = confidence;
            bestNodeI = ni;
            bestNodeJ = nj;
            bestShared = shared;
          }
        }
      }

      if (bestConfidence > 0 && bestNodeI && bestNodeJ) {
        bridges.push({
          sourceNode: bestNodeI,
          targetNode: bestNodeJ,
          reason: `Shared keywords across disconnected components: ${bestShared.slice(0, 5).join(', ')}`,
          confidence: Math.round(bestConfidence * 100) / 100,
        });
      }
    }
  }

  return bridges;
}

export function checkConnectivity(ir: SRSIR): ConnectivityReport {
  const shardIds = collectShardIds(ir);
  const totalShards = shardIds.size;

  if (totalShards === 0) {
    return {
      totalShards: 0,
      connectedComponents: 0,
      bridges: [],
      orphanShards: [],
    };
  }

  const adj = buildAdjacency(ir, shardIds);
  const { componentCount, componentMap } = findComponents(shardIds, adj);
  const orphanShards = totalShards > 1 ? findOrphans(shardIds, adj) : [];
  const bridges = proposeBridges(ir, componentMap, componentCount);

  return {
    totalShards,
    connectedComponents: componentCount,
    bridges,
    orphanShards,
  };
}
