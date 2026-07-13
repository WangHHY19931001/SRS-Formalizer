import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SRSIR } from '../../types/srs-ir.js';
import type { Emitter, EmitResult } from './types.js';
import { sanitizeId } from '../id-utils.js';
import { exportGraphToCypher, type CypherNode, type CypherEdge } from '../cypher.js';

interface ParsedScenario {
  name: string;
  requirementRefs: string[];
  givens: string[];
  whens: string[];
  thens: string[];
}

interface ParsedFeature {
  name: string;
  system: string;
  trace: string;
  scenarios: ParsedScenario[];
}

interface BehaviorNode {
  id: string;
  labels: string[];
  properties: Record<string, string | number | boolean>;
}

interface BehaviorEdge {
  source: string;
  target: string;
  type: string;
  properties?: Record<string, string>;
}

interface BehaviorGraph {
  version: string;
  nodes: BehaviorNode[];
  edges: BehaviorEdge[];
  metadata: Record<string, unknown>;
}

function parseFeatureFile(filePath: string): ParsedFeature | null {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n');

  let system = '';
  let trace = '';
  let featureName = '';
  const scenarios: ParsedScenario[] = [];
  let currentScenario: ParsedScenario | null = null;
  let currentSection: 'given' | 'when' | 'then' | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('# SYSTEM:')) system = trimmed.replace('# SYSTEM:', '').trim();
    if (trimmed.startsWith('# TRACE:')) trace = trimmed.replace('# TRACE:', '').trim();

    if (trimmed.startsWith('Feature:')) {
      featureName = trimmed.replace('Feature:', '').trim();
    }

    if (trimmed.startsWith('Scenario:')) {
      if (currentScenario) scenarios.push(currentScenario);
      currentScenario = {
        name: trimmed.replace('Scenario:', '').trim(),
        requirementRefs: [],
        givens: [],
        whens: [],
        thens: [],
      };
      continue;
    }

    if (!currentScenario) continue;

    if (trimmed.startsWith('# verification:')) {
      const refs = trimmed.replace('# verification:', '').trim().split(',').map(s => s.trim());
      currentScenario.requirementRefs.push(...refs);
      continue;
    }

    const givenMatch = trimmed.match(/^Given\s+(.+)/);
    const whenMatch = trimmed.match(/^When\s+(.+)/);
    const thenMatch = trimmed.match(/^Then\s+(.+)/);

    if (givenMatch) { currentSection = 'given'; currentScenario.givens.push(givenMatch[1]!); continue; }
    if (whenMatch) { currentSection = 'when'; currentScenario.whens.push(whenMatch[1]!); continue; }
    if (thenMatch) { currentSection = 'then'; currentScenario.thens.push(thenMatch[1]!); continue; }

    if (currentSection && trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('Feature:') && !trimmed.startsWith('Scenario:')) {
      const arr = currentSection === 'given' ? currentScenario.givens
        : currentSection === 'when' ? currentScenario.whens
        : currentScenario.thens;
      if (arr.length > 0) {
        arr[arr.length - 1] += ' ' + trimmed;
      }
    }
  }

  if (currentScenario) scenarios.push(currentScenario);

  if (!featureName) return null;
  return { name: featureName, system, trace, scenarios };
}

function buildBehaviorGraph(featuresDir: string, _ir: SRSIR): BehaviorGraph {
  const files = fs.readdirSync(featuresDir).filter(f => f.endsWith('.feature')).sort();
  const nodes: BehaviorNode[] = [];
  const edges: BehaviorEdge[] = [];
  let totalScenarios = 0;
  let totalActions = 0;

  for (const file of files) {
    const parsed = parseFeatureFile(path.join(featuresDir, file));
    if (!parsed) continue;

    const featureId = `Feature-${sanitizeId(parsed.name)}`;

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

      nodes.push({
        id: scenarioId,
        labels: ['Scenario'],
        properties: {
          name: scen.name,
          feature: parsed.name,
          given_count: scen.givens.length,
          when_count: scen.whens.length,
          then_count: scen.thens.length,
        },
      });

      edges.push({ source: scenarioId, target: featureId, type: 'BELONGS_TO' });

      for (const reqRef of scen.requirementRefs) {
        edges.push({
          source: scenarioId,
          target: reqRef,
          type: 'VERIFIES',
          properties: { note: 'Scenario verifies this requirement' },
        });
      }

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

    const featureScenarios = nodes.filter(
      n => n.labels.includes('Scenario') && (n.properties.feature as string) === parsed.name
    );
    for (let i = 1; i < featureScenarios.length; i++) {
      edges.push({
        source: featureScenarios[i]!.id,
        target: featureScenarios[i - 1]!.id,
        type: 'DEPENDS_ON',
        properties: { note: 'Sequential scenario dependency within feature' },
      });
    }
  }

  // Link IR requirement nodes to scenarios
  const irReqIds = new Set(_ir.nodes.filter(n => n.type === 'requirement').map(n => n.id));
  for (const node of nodes) {
    if (node.labels.includes('Scenario')) {
      const refs = edges.filter(e => e.source === node.id && e.type === 'VERIFIES').map(e => e.target);
      for (const nfrNode of _ir.nodes.filter(n => n.type === 'nfr')) {
        const nfrRefs = edges.filter(e => e.source === nfrNode.id && e.type === 'nfr_impacts');
        for (const nfrEdge of nfrRefs) {
          if (refs.includes(nfrEdge.target) || irReqIds.has(nfrEdge.target)) {
            edges.push({
              source: node.id,
              target: nfrNode.id,
              type: 'NFR_VERIFIES',
              properties: { note: 'Scenario addresses NFR requirement' },
            });
          }
        }
      }
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
    },
  };
}

import { ARTIFACT_PATHS, artifactPath } from '../artifacts/paths.js';

export class BehaviorGraphEmitter implements Emitter {
  readonly name = 'behaviorGraph';
  readonly description = 'Build behavior graph from BDD feature files and SRS IR';
  readonly outputDir = ARTIFACT_PATHS.graphs;

  emit(ir: SRSIR, workdir: string): EmitResult {
    const featuresDir = artifactPath(workdir, ARTIFACT_PATHS.bddVerified);
    if (!fs.existsSync(featuresDir)) {
      return { files: [], fileCount: 0, metadata: { skipped: 'verified BDD features not found' } };
    }

    const graph = buildBehaviorGraph(featuresDir, ir);

    const jsonFile = path.join(artifactPath(workdir, this.outputDir), 'behavior-graph.json');
    const cypherFile = path.join(artifactPath(workdir, this.outputDir), 'behavior-graph.cypher');

    fs.mkdirSync(artifactPath(workdir, this.outputDir), { recursive: true });
    fs.writeFileSync(jsonFile, JSON.stringify(graph, null, 2), 'utf-8');

    const cypherNodes: CypherNode[] = graph.nodes.map(n => ({
      id: n.id,
      labels: n.labels,
      properties: n.properties,
    }));
    const cypherEdges: CypherEdge[] = graph.edges.map(e => ({
      source: e.source,
      target: e.target,
      type: e.type,
      ...(e.properties ? { properties: e.properties } : {}),
    }));
    const cypher = exportGraphToCypher(cypherNodes, cypherEdges, {
      title: 'System Behavior Graph',
      headerLines: [
        `Generated: ${graph.metadata.generated_at as string}`,
        `Features: ${graph.metadata.feature_count as number}`,
        `Scenarios: ${graph.metadata.scenario_count as number}`,
        `Actions: ${graph.metadata.action_count as number}`,
      ],
    });
    fs.writeFileSync(cypherFile, cypher, 'utf-8');

    return {
      files: [jsonFile, cypherFile],
      fileCount: 2,
      metadata: graph.metadata,
    };
  }
}
