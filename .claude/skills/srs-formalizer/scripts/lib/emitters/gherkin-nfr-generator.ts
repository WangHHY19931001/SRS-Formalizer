import type { SRSIR, IRNode, NFRCategory } from '../../types/srs-ir.js';
import type { BddFeature, BddScenario } from '../bdd.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface NFRScenarioTemplate {
  name: string;
  given: string[];
  when: string[];
  then: string[];
}

interface NFRCategoryTemplate {
  feature_name: string;
  scenarios: NFRScenarioTemplate[];
}

type NFRTemplates = Record<string, NFRCategoryTemplate>;

function resolveTemplatePath(): string {
  const candidates = [
    path.join(import.meta.dirname, '..', '..', 'templates', 'bdd-nfr-scenarios.json'),
    path.join(process.cwd(), 'templates', 'bdd-nfr-scenarios.json'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('bdd-nfr-scenarios.json template not found');
}

function loadTemplates(): NFRTemplates {
  const templatePath = resolveTemplatePath();
  const raw = fs.readFileSync(templatePath, 'utf-8');
  return JSON.parse(raw) as NFRTemplates;
}

function fillPlaceholders(value: string, replacements: Record<string, string>): string {
  return value.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    return replacements[key] ?? `{{${key}}}`;
  });
}

function fillScenario(template: NFRScenarioTemplate, replacements: Record<string, string>): BddScenario {
  const verMethod = extractVerificationMethod(template.then);
  const result: BddScenario = {
    name: fillPlaceholders(template.name, replacements),
    requirementId: replacements['requirementId'] ?? 'NFR-UNKNOWN',
    given: template.given.map(g => fillPlaceholders(g, replacements)),
    when: template.when.map(w => fillPlaceholders(w, replacements)),
    then: template.then.filter(t => !t.startsWith('#')).map(t => fillPlaceholders(t, replacements)),
  };
  if (verMethod) {
    result.verification_method = verMethod;
  }
  return result;
}

function extractVerificationMethod(thenSteps: string[]): string | undefined {
  for (const step of thenSteps) {
    if (step.startsWith('# verification_method:')) {
      return step.slice('# verification_method:'.length).trim();
    }
  }
  return undefined;
}

const CATEGORY_ORDER: NFRCategory[] = [
  'performance', 'security', 'availability',
  'compatibility', 'maintainability', 'compliance',
];

export function generateNFRFeatures(ir: SRSIR): BddFeature[] {
  const nfrNodes = ir.nodes.filter(n => n.type === 'nfr' && n.properties.nfrCategory);
  if (nfrNodes.length === 0) return [];

  const templates = loadTemplates();
  const features: BddFeature[] = [];

  for (const category of CATEGORY_ORDER) {
    const catTemplate = templates[category];
    if (!catTemplate) continue;

    const catNodes = nfrNodes.filter(n => n.properties.nfrCategory === category);
    for (const node of catNodes) {
      const feature = buildNFRFeature(node, catTemplate, category);
      features.push(feature);
    }
  }

  return features;
}

function buildNFRFeature(
  node: IRNode,
  catTemplate: NFRCategoryTemplate,
  _category: string,
): BddFeature {
  const threshold = node.properties.nfrThreshold;
  const replacements: Record<string, string> = {
    module: node.module,
    requirementId: node.id,
    value: threshold ? String(threshold.value) : 'N/A',
    unit: threshold?.unit ?? 'ms',
    operator: threshold?.operator ?? '<',
  };
  if (threshold) {
    replacements['metric'] = threshold.metric;
  }

  const scenarios = catTemplate.scenarios.map(s => fillScenario(s, replacements));

  return {
    system: 'SRS-NFR',
    trace: node.id,
    module: fillPlaceholders(catTemplate.feature_name, replacements),
    scenarios,
  };
}
