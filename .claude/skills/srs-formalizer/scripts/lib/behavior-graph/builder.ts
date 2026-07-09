/**
 * Behavior graph builder — assembles BehaviorGraph from parsed .feature files.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { sanitizeId } from '../id-utils.js';
import type { BehaviorNode, BehaviorEdge, BehaviorGraph } from './types.js';
import { parseFeatureFile } from './parser.js';

export function buildBehaviorGraphFromDir(featuresDir: string, workDir: string): BehaviorGraph {
  const files = fs.readdirSync(featuresDir).filter(f => f.endsWith('.feature')).sort();
  const nodes: BehaviorNode[] = [];
  const edges: BehaviorEdge[] = [];
  let totalScenarios = 0;
  let totalActions = 0;

  for (const file of files) {
    const parsed = parseFeatureFile(path.join(featuresDir, file));
    if (!parsed) continue;

    const featureId = `Feature-${sanitizeId(parsed.name)}`;

    // Feature node
    nodes.push({
      id: featureId,
      labels: ['Feature'],
      properties: {
        name: parsed.name,
        system: parsed.system,
        trace: parsed.trace,
        module: parsed.name,
        scenario_count: parsed.scenarios.length,
      },
    });

    for (const scen of parsed.scenarios) {
      const scenarioId = `Scenario-${sanitizeId(parsed.name)}-${sanitizeId(scen.name)}`;
      totalScenarios++;

      // Scenario node
      nodes.push({
        id: scenarioId,
        labels: ['Scenario'],
        properties: {
          name: scen.name,
          feature: parsed.name,
          given_count: scen.givens.length,
          when_count: scen.whens.length,
          then_count: scen.thens.length,
          has_placeholder: scen.thens.some(t => t.includes('THEN_PLACEHOLDER')),
          text: scen.rawText.slice(0, 500),
        },
      });

      // BELONGS_TO
      edges.push({ source: scenarioId, target: featureId, type: 'BELONGS_TO' });

      // VERIFIES — link scenario to requirements
      for (const reqRef of scen.requirementRefs) {
        edges.push({
          source: scenarioId,
          target: reqRef,
          type: 'VERIFIES',
          properties: { note: 'Scenario verifies this requirement' },
        });
      }

      // Given → PRECONDITION actions
      for (const g of scen.givens) {
        const actionId = `Action-given-${sanitizeId(parsed.name)}-${sanitizeId(scen.name)}-${totalActions}`;
        totalActions++;
        nodes.push({
          id: actionId,
          labels: ['Action'],
          properties: { kind: 'precondition', text: g, scenario: scen.name },
        });
        edges.push({ source: scenarioId, target: actionId, type: 'HAS_STEP' });
        edges.push({ source: actionId, target: scenarioId, type: 'PRECONDITION' });
      }

      // When → Action
      for (const w of scen.whens) {
        const actionId = `Action-when-${sanitizeId(parsed.name)}-${sanitizeId(scen.name)}-${totalActions}`;
        totalActions++;
        nodes.push({
          id: actionId,
          labels: ['Action'],
          properties: { kind: 'action', text: w, scenario: scen.name },
        });
        edges.push({ source: scenarioId, target: actionId, type: 'HAS_STEP' });
      }

      // Then → POSTCONDITION actions
      for (const t of scen.thens) {
        const actionId = `Action-then-${sanitizeId(parsed.name)}-${sanitizeId(scen.name)}-${totalActions}`;
        totalActions++;
        nodes.push({
          id: actionId,
          labels: ['Action'],
          properties: { kind: 'postcondition', text: t, scenario: scen.name },
        });
        edges.push({ source: scenarioId, target: actionId, type: 'HAS_STEP' });
        edges.push({ source: actionId, target: scenarioId, type: 'POSTCONDITION' });
      }
    }

    // Cross-scenario DEPENDS_ON: scenarios within same feature depend on earlier ones
    const featureScenarios = nodes.filter(n => n.labels.includes('Scenario') && (n.properties.feature as string) === parsed.name);
    for (let i = 1; i < featureScenarios.length; i++) {
      edges.push({
        source: featureScenarios[i]!.id,
        target: featureScenarios[i - 1]!.id,
        type: 'DEPENDS_ON',
        properties: { note: 'Sequential scenario dependency within feature' },
      });
    }
  }

  return {
    version: '1.0',
    nodes,
    edges,
    metadata: {
      generated_at: new Date().toISOString(),
      feature_count: files.length,
      scenario_count: totalScenarios,
      action_count: totalActions,
      source_workdir: workDir,
    },
  };
}
