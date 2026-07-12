/**
 * V-Model traceability matrix builder.
 * Maps requirements to their coverage across all dimensions.
 * Zero dependencies.
 */

import type { TraceabilityEntry } from './types.js';

interface SrsRecord {
  id: string;
  title: string;
  description: string;
  priority: string;
  type: string;
}

interface CoverageData {
  graphNodes?: string[];
  bddScenarios?: string[];
  tlaInvariants?: string[];
  leanTheorems?: string[];
  fixtureFiles?: string[];
}

/**
 * Build traceability matrix from SRS records.
 * Coverage status: 'full' (all dimensions), 'partial' (some), 'none' (empty).
 */
export function buildTraceabilityMatrix(
  records: SrsRecord[],
  coverageData?: Record<string, CoverageData>,
): TraceabilityEntry[] {
  return records.map(record => {
    const data = coverageData?.[record.id];

    const graphNodes = data?.graphNodes ?? [];
    const bddScenarios = data?.bddScenarios ?? [];
    const tlaInvariants = data?.tlaInvariants ?? [];
    const leanTheorems = data?.leanTheorems ?? [];
    const fixtureFiles = data?.fixtureFiles ?? [];

    const filledDimensions = [
      graphNodes.length > 0,
      bddScenarios.length > 0,
      tlaInvariants.length > 0,
      leanTheorems.length > 0,
      fixtureFiles.length > 0,
    ].filter(Boolean).length;

    let coverageStatus: 'full' | 'partial' | 'none' = 'none';
    if (filledDimensions === 5) {
      coverageStatus = 'full';
    } else if (filledDimensions > 0) {
      coverageStatus = 'partial';
    }

    return {
      requirementId: record.id,
      requirementTitle: record.title,
      graphNodes,
      bddScenarios,
      tlaInvariants,
      leanTheorems,
      fixtureFiles,
      coverageStatus,
    };
  });
}
