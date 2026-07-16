import type { SRSIR } from '../../types/srs-ir.js';
import { findOrphansFromIR } from '../graph-algorithms.js';
import { checkConnectivity } from './connectivity-checker.js';

export interface RiskReport {
  riskScore: number;
  highRiskShards: string[];
  breakdown: {
    orphanRate: number;
    crossFileCoverage: number;
    nfrCoverage: number;
    gapWeight: number;
  };
}

const GAP_SCORES: Record<string, number> = { P0: 4, P1: 3, P2: 2, P3: 1 };

export function scoreRisk(ir: SRSIR): RiskReport {
  const totalNodes = ir.nodes.length || 1;
  const orphans = findOrphansFromIR(ir);
  const orphanRate = orphans.length / totalNodes;

  const conn = checkConnectivity(ir);
  const totalShards = conn.totalShards || 1;
  const crossFileCoverage = totalShards === 0
    ? 1
    : (totalShards - conn.connectedComponents + 1) / totalShards;

  const nfrCoverage = ir.nfrProfile.overallCoverage;

  const maxGapScore = ir.gaps.length * 4 || 1;
  const actualGapScore = ir.gaps.reduce((sum, g) => sum + (GAP_SCORES[g.priority] ?? 1), 0);
  const gapWeight = actualGapScore / maxGapScore;

  const riskScore = 1 - (
    crossFileCoverage * 0.3 +
    nfrCoverage * 0.3 +
    (1 - orphanRate) * 0.2 +
    (1 - gapWeight) * 0.2
  );

  const highRiskShards = new Set<string>();
  for (const orphanId of orphans) {
    const node = ir.nodes.find(n => n.id === orphanId);
    if (node?.source.shardId) highRiskShards.add(node.source.shardId);
  }

  ir.meta.riskScore = Math.max(0, Math.min(1, riskScore));
  ir.meta.highRiskShards = [...highRiskShards];

  return {
    riskScore: ir.meta.riskScore,
    highRiskShards: ir.meta.highRiskShards,
    breakdown: { orphanRate, crossFileCoverage, nfrCoverage, gapWeight },
  };
}
