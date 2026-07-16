/**
 * Cypher export for Lean 4 proof dependency graph.
 */

import type { LeanGraph } from './types.js';
import { exportGraphToCypher } from '../cypher.js';

export function exportLeanToCypher(graph: LeanGraph): string {
  return exportGraphToCypher(graph.nodes, graph.edges, {
    title: 'Lean 4 Proof Dependency Graph',
    headerLines: [
      `Generated: ${graph.metadata.generated_at}`,
      `Files: ${graph.metadata.file_count}`,
      `Theorems: ${graph.metadata.theorem_count}`,
      `Lemmas: ${graph.metadata.lemma_count}`,
      `Axioms: ${graph.metadata.axiom_count}`,
      `Imports: ${graph.metadata.import_count}`,
      `Max proof depth: ${graph.metadata.max_proof_depth}`,
      ...(graph.metadata.axiom_count > 0 ? ['⚠ WARNING: axioms detected!'] : []),
      ...(graph.metadata.sorry_count > 0 ? ['⚠ WARNING: sorry detected!'] : []),
    ],
  });
}
