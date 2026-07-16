/**
 * Consistency checks for the system architecture graph.
 * R1–R5: requirement coverage, placeholder detection, TLA action check,
 * axiom check, and cross-layer edge check.
 */

import type { GenericGraph, ConsistencyCheck } from './types.js';

export function runConsistencyChecks(
  reqGraph: GenericGraph | null,
  behaviorGraph: GenericGraph | null,
  tlaGraph: GenericGraph | null,
  leanGraph: GenericGraph | null,
  totalCrossEdges: number,
): ConsistencyCheck[] {
  const checks: ConsistencyCheck[] = [];

  // R1: Requirement coverage
  if (reqGraph && behaviorGraph) {
    const reqScenarioNodes = reqGraph.nodes.filter(
      n => n.labels.includes('Requirement') || n.labels.some((l: string) => l.toLowerCase().includes('requirement'))
    );
    const verifiedReqs = new Set(behaviorGraph.edges.filter(e => e.type === 'VERIFIES').map(e => e.target));
    const covered = reqScenarioNodes.filter(n => verifiedReqs.has(n.id)).length;
    const uncovered = reqScenarioNodes.length - covered;
    checks.push({
      name: 'requirement_coverage',
      passed: reqScenarioNodes.length === 0 || uncovered === 0,
      detail: reqScenarioNodes.length === 0
        ? 'N/A (no requirement nodes)'
        : uncovered === 0
          ? `✓ All ${reqScenarioNodes.length} requirements have behavior coverage`
          : `${uncovered}/${reqScenarioNodes.length} requirements lack behavior coverage`,
      severity: uncovered > 0 ? 'error' : 'error',
    });
  } else {
    checks.push({ name: 'requirement_coverage', passed: true, detail: 'N/A (missing req or behavior graph)', severity: 'error' });
  }

  // R2: No unresolved placeholders
  if (behaviorGraph) {
    const placeholderScenarios = behaviorGraph.nodes.filter(
      n => n.labels.includes('Scenario') && n.properties.has_placeholder === true
    );
    checks.push({
      name: 'no_placeholder_scenarios',
      passed: placeholderScenarios.length === 0,
      detail: placeholderScenarios.length === 0
        ? '✓ No unresolved <THEN_PLACEHOLDER> in behaviors'
        : `${placeholderScenarios.length} scenarios with unresolved placeholders`,
      severity: 'error',
    });
  }

  // R3: TLA systems have actions
  if (tlaGraph) {
    const sysNodes = tlaGraph.nodes.filter(n => n.labels.includes('System'));
    const noActions = sysNodes.filter(n => (n.properties.action_count as number || 0) === 0);
    checks.push({
      name: 'tla_systems_have_actions',
      passed: noActions.length === 0,
      detail: noActions.length === 0
        ? `✓ All ${sysNodes.length} systems have actions`
        : `${noActions.length} systems have no actions defined`,
      severity: 'warning',
    });
  }

  // R4: No axioms in Lean proofs
  if (leanGraph) {
    const axiomCount = leanGraph.metadata && typeof leanGraph.metadata === 'object' && 'axiom_count' in leanGraph.metadata
      ? (leanGraph.metadata as Record<string, unknown>).axiom_count as number
      : 0;
    checks.push({
      name: 'lean_no_axioms',
      passed: axiomCount === 0,
      detail: axiomCount === 0 ? '✓ No axioms in proofs' : `${axiomCount} axioms detected — proofs may be incomplete`,
      severity: 'error',
    });
  }

  // R5: Cross-layer edge check
  const anyGraph = reqGraph || behaviorGraph || tlaGraph || leanGraph;
  checks.push({
    name: 'cross_layer_edges',
    passed: totalCrossEdges > 0 || !anyGraph,
    detail: totalCrossEdges > 0
      ? `✓ ${totalCrossEdges} cross-layer edges established`
      : 'No cross-layer edges — graphs may be disconnected',
    severity: totalCrossEdges > 0 ? 'warning' : 'error',
  });

  return checks;
}
