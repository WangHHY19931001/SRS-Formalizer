/**
 * behavior-graph.ts — System Behavior Graph (S4 行为图谱)
 *
 * Builds a structured graph from validated BDD .feature files.
 * The behavior graph is the formal representation of system behaviors,
 * analogous to the requirement knowledge graph (S3) but for behaviors.
 *
 * Node types:
 *   :Feature         — a feature/module grouping scenarios
 *   :Scenario        — a single BDD scenario (behavior)
 *   :Action          — a given/when/then step within a scenario
 *
 * Edge types:
 *   BELONGS_TO       — Scenario → Feature
 *   HAS_STEP          — Scenario → Action
 *   DEPENDS_ON        — Scenario A requires Scenario B to complete first
 *   VERIFIES          — Scenario → Requirement (via requirementId trace)
 *   PRECONDITION      — Action (Given) → Scenario
 *   POSTCONDITION     — Action (Then) → Scenario
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ===================== Types =====================

export interface BehaviorNode {
  id: string;                    // e.g. "Feature-Auth", "Scenario-Auth-001", "Action-given-auth-001"
  labels: string[];              // ["Feature"] | ["Scenario"] | ["Action"]
  properties: Record<string, string | number | boolean>;
}

export interface BehaviorEdge {
  source: string;
  target: string;
  type: 'BELONGS_TO' | 'HAS_STEP' | 'DEPENDS_ON' | 'VERIFIES' | 'PRECONDITION' | 'POSTCONDITION';
  properties?: Record<string, string>;
}

export interface BehaviorGraph {
  version: '1.0';
  nodes: BehaviorNode[];
  edges: BehaviorEdge[];
  metadata: {
    generated_at: string;
    feature_count: number;
    scenario_count: number;
    action_count: number;
    source_workdir: string;
  };
}

// ===================== Parser =====================

interface ParsedScenario {
  name: string;
  requirementRefs: string[];  // from "# verification: R1-xxx" comments
  givens: string[];
  whens: string[];
  thens: string[];
  rawText: string;
}

interface ParsedFeature {
  name: string;       // from "Feature: XXX"
  system: string;     // from "# SYSTEM: XXX"
  trace: string;      // from "# TRACE: XXX"
  scenarios: ParsedScenario[];
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

    // Header comments
    if (trimmed.startsWith('# SYSTEM:')) system = trimmed.replace('# SYSTEM:', '').trim();
    if (trimmed.startsWith('# TRACE:')) trace = trimmed.replace('# TRACE:', '').trim();

    // Feature declaration
    if (trimmed.startsWith('Feature:')) {
      featureName = trimmed.replace('Feature:', '').trim();
    }

    // Scenario declaration
    if (trimmed.startsWith('Scenario:')) {
      if (currentScenario) scenarios.push(currentScenario);
      currentScenario = {
        name: trimmed.replace('Scenario:', '').trim(),
        requirementRefs: [],
        givens: [],
        whens: [],
        thens: [],
        rawText: '',
      };
      currentSection = null;
      continue;
    }

    if (!currentScenario) continue;

    // Collect requirement refs from comments
    if (trimmed.startsWith('# verification:')) {
      const refs = trimmed.replace('# verification:', '').trim().split(',').map(s => s.trim());
      currentScenario.requirementRefs.push(...refs);
      continue;
    }

    // Step detection
    const givenMatch = trimmed.match(/^Given\s+(.+)/);
    const whenMatch = trimmed.match(/^When\s+(.+)/);
    const thenMatch = trimmed.match(/^Then\s+(.+)/);

    if (givenMatch) { currentSection = 'given'; currentScenario.givens.push(givenMatch[1]!); continue; }
    if (whenMatch) { currentSection = 'when'; currentScenario.whens.push(whenMatch[1]!); continue; }
    if (thenMatch) { currentSection = 'then'; currentScenario.thens.push(thenMatch[1]!); continue; }

    // Continuation lines for multi-line steps
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

// ===================== Graph Builder =====================

function sanitizeId(name: string): string {
  return name.replace(/[^A-Za-z0-9一-鿿_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

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

// ===================== Cypher Export =====================

export function exportBehaviorToCypher(graph: BehaviorGraph): string {
  const lines: string[] = [
    '// ============================================================',
    '// System Behavior Graph — Neo4j Cypher Export',
    `// Generated: ${graph.metadata.generated_at}`,
    `// Features: ${graph.metadata.feature_count}`,
    `// Scenarios: ${graph.metadata.scenario_count}`,
    `// Actions: ${graph.metadata.action_count}`,
    '// ============================================================',
    '',
  ];

  // Create nodes
  for (const node of graph.nodes) {
    const labels = node.labels.map(l => `:${l}`).join('');
    const props = Object.entries(node.properties)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => {
        if (typeof v === 'string') return `${k}: ${JSON.stringify(v)}`;
        return `${k}: ${v}`;
      })
      .join(', ');
    lines.push(`CREATE (${sanitizeId(node.id)}${labels} {id: "${node.id}", ${props}});`);
  }

  lines.push('');

  // Create edges
  for (const edge of graph.edges) {
    const sourceVar = sanitizeId(edge.source);
    const targetVar = sanitizeId(edge.target);
    const edgeProps = edge.properties
      ? Object.entries(edge.properties)
          .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
          .join(', ')
      : '';
    const propsStr = edgeProps ? ` {${edgeProps}}` : '';
    lines.push(`CREATE (${sourceVar})-[:${edge.type}${propsStr}]->(${targetVar});`);
  }

  return lines.join('\n');
}
