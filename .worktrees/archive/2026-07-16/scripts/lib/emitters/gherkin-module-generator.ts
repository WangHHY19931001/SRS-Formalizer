import type { SRSIR, IRNode } from '../../types/srs-ir.js';
import type { BddFeature, BddScenario } from '../bdd.js';

export function generateModuleFeatures(ir: SRSIR): BddFeature[] {
  const reqNodes = ir.nodes.filter(n => n.type === 'requirement');
  if (reqNodes.length === 0) return [];

  const moduleMap = new Map<string, typeof reqNodes>();
  for (const node of reqNodes) {
    const existing = moduleMap.get(node.module);
    if (existing) {
      existing.push(node);
    } else {
      moduleMap.set(node.module, [node]);
    }
  }

  const features: BddFeature[] = [];
  for (const [moduleName, nodes] of moduleMap) {
    const scenarios: BddScenario[] = [];
    for (const node of nodes) {
      const scenario = buildScenario(node);
      if (scenario) scenarios.push(scenario);
    }
    if (scenarios.length > 0) {
      const feature: BddFeature = {
        system: 'SRS',
        trace: nodes[0]?.id ?? 'UNKNOWN',
        module: moduleName,
        scenarios,
      };
      features.push(feature);
    }
  }

  return features;
}

function buildScenario(node: IRNode): BddScenario | null {
  const stmt = node.properties.statement;
  if (!stmt || stmt.trim() === '') return null;

  const name = `Req ${node.id}`;
  const given: string[] = [];
  const when: string[] = [];
  const then: string[] = ['<THEN_PLACEHOLDER>'];

  const clauses = stmt.split(/[,，;；]/).map((c: string) => c.trim()).filter((c: string) => c.length > 0);

  for (const clause of clauses) {
    if (/[当在]/.test(clause) || /when|\bif\b/i.test(clause)) {
      when.push(clause);
    } else {
      given.push(clause);
    }
  }

  if (when.length === 0) {
    when.push(node.module + ' 功能被执行');
  }

  return {
    name,
    requirementId: node.id,
    given,
    when,
    then,
    verification_method: 'api_check',
  };
}
