import type { SRSIR } from '../../types/srs-ir.js';
import { analyzeStructure } from './structure-analyzer.js';

export function scoreRisk(ir: SRSIR): SRSIR {
  const structure = analyzeStructure(ir);
  const orphanRate = structure.stats.orphanRate;
  // 预构建 nodeMap 以 O(1) 查找，与 structure-analyzer.ts 风格一致
  const nodeMap = new Map(ir.nodes.map(n => [n.id, n]));
  const crossFileCoverage = ir.edges.length > 0
    ? ir.edges.filter(e => {
        const srcNode = nodeMap.get(e.source);
        const tgtNode = nodeMap.get(e.target);
        return srcNode && tgtNode && srcNode.source.filePath !== tgtNode.source.filePath;
      }).length / ir.edges.length
    : 0;
  const nfrCoverage = ir.nfrProfile.overallCoverage;
  const gapWeight = ir.nodes.length > 0 ? ir.gaps.length / ir.nodes.length : 0;

  const riskScore = orphanRate * 0.2 + crossFileCoverage * 0.3 + nfrCoverage * 0.3 + gapWeight * 0.2;
  const highRiskShards = [...new Set(
    structure.orphans
      .map(id => nodeMap.get(id)?.source.shardId ?? '')
      .filter(s => s)
  )];

  return {
    ...ir,
    meta: { ...ir.meta, riskScore, highRiskShards },
  };
}
