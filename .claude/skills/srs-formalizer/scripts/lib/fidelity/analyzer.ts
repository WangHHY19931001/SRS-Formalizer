/**
 * fidelity/analyzer.ts — cross-artifact anti-weakening analysis.
 *
 * Answers the three review questions by treating each layer as a semantic
 * refinement of the one above it and flagging where the downstream artifact
 * carries fewer constraints than its source:
 *
 *   Q1 需求→BDD  : coverage / dilution / negation-drop / threshold-drop
 *   Q2 需求+BDD→TLA+ : anti-weakening / anti-simplification / anti-de-hierarchization
 *   Q3 需求+BDD+TLA→Lean4 : anti-drift / anti-simplification for triggered proofs
 *
 * Pure functions over already-parsed inputs; file IO lives in the command
 * (commands/analyze-fidelity.ts). Deterministic — no LLM, no network.
 */

import type { NFRCategory, SRSIR } from '../../types/srs-ir.js';
import { tokenize, jaccardSimilarity, hasNegation } from '../text-analysis.js';

export type FidelitySeverity = 'error' | 'warning';

export interface FidelityFinding {
  layer: 'req->bdd' | 'req+bdd->tla' | 'req+bdd+tla->lean';
  kind: string;
  severity: FidelitySeverity;
  subject: string;
  detail: string;
}

export interface FidelityReport {
  generatedAt: string;
  findings: FidelityFinding[];
  summary: { errors: number; warnings: number; passed: boolean };
}

// ---------------------------------------------------------------------------
// Parsed artifact shapes (populated by the command from disk)
// ---------------------------------------------------------------------------

export interface BddScenario {
  feature: string;
  name: string;
  rids: string[];
  text: string;        // full scenario body (Given/When/Then lines)
  hasNegation: boolean;
  numbers: string[];   // numeric literals appearing in the scenario
}

export interface TlaModule {
  name: string;
  invariantNames: string[];
  actionCount: number;
  constants: string[];       // names/values from the .cfg CONSTANT lines
  numbers: string[];         // numeric literals in the .tla body
  body: string;
}

export interface LeanTheorem {
  file: string;
  name: string;
  signature: string;
  tokens: Set<string>;
}

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

/** Below this Jaccard score a scenario is considered to have drifted from its
 *  requirement (dilution). Deliberately low: BDD phrasing differs from prose,
 *  we only want to catch near-total loss of shared vocabulary. */
export const DILUTION_FLOOR = 0.08;

const NEGATION_DOMAIN = /security|approval|governance|audit|complian|授权|审批|治理|审计|合规|安全|不得|禁止|拒绝/i;

/** Extract standalone numeric literals (thresholds like 200, 500, 15) from text. */
export function extractNumbers(text: string): string[] {
  return [...new Set((text.match(/\d+(?:\.\d+)?/g) ?? []))];
}

// ---------------------------------------------------------------------------
// Q1: 需求 → BDD fidelity (coverage / dilution / negation-drop / threshold-drop)
// ---------------------------------------------------------------------------

/** Map: requirement/nfr node id → scenarios that reference it (via RID map or
 *  direct id tag). Built by the command; keys are IR node ids. */
export type NodeScenarioIndex = Map<string, BddScenario[]>;

export function analyzeReqToBdd(ir: SRSIR, index: NodeScenarioIndex): FidelityFinding[] {
  const findings: FidelityFinding[] = [];
  const reqNodes = ir.nodes.filter(n => n.type === 'requirement' || n.type === 'nfr');

  for (const node of reqNodes) {
    const statement = node.properties.statement ?? '';
    const scenarios = index.get(node.id) ?? [];
    const priority = node.properties.formalizationPriority ?? 'standard';
    const safetyCritical = priority === 'safety-critical';

    // (a) coverage: every requirement needs at least one scenario; a
    // safety-critical gap is an error, others a warning.
    if (scenarios.length === 0) {
      findings.push({
        layer: 'req->bdd', kind: 'coverage-gap',
        severity: safetyCritical ? 'error' : 'warning',
        subject: node.id,
        detail: `requirement has no mapped BDD scenario${safetyCritical ? ' (safety-critical)' : ''}`,
      });
      continue;
    }

    const reqTokens = tokenize(statement);
    const combined = scenarios.map(s => s.text).join(' ');
    const scenarioTokens = tokenize(combined);

    // (b) dilution: shared vocabulary between requirement and its scenarios is
    // near zero → the scenario likely does not verify this requirement.
    if (reqTokens.size > 0) {
      const sim = jaccardSimilarity(reqTokens, scenarioTokens);
      if (sim < DILUTION_FLOOR) {
        findings.push({
          layer: 'req->bdd', kind: 'dilution',
          severity: safetyCritical ? 'error' : 'warning',
          subject: node.id,
          detail: `scenario/requirement token similarity ${sim.toFixed(3)} < ${DILUTION_FLOOR}; behaviour may have drifted from the requirement`,
        });
      }
    }

    // (c) negation-drop: a prohibition ("不得/must not") whose scenarios carry
    // no negative assertion has lost its boundary constraint.
    if (hasNegation(statement) || NEGATION_DOMAIN.test(statement)) {
      if (!scenarios.some(s => s.hasNegation)) {
        findings.push({
          layer: 'req->bdd', kind: 'negation-drop',
          severity: 'error',
          subject: node.id,
          detail: 'requirement is a prohibition/boundary but no mapped scenario contains a negative assertion (不得/must not/is denied)',
        });
      }
    }

    // (d) threshold-drop: an NFR numeric threshold absent from every scenario.
    const threshold = node.properties.nfrThreshold;
    if (threshold) {
      const value = String(threshold.value);
      if (!scenarios.some(s => s.numbers.includes(value))) {
        findings.push({
          layer: 'req->bdd', kind: 'threshold-drop',
          severity: 'error',
          subject: node.id,
          detail: `NFR threshold ${threshold.metric} ${threshold.operator} ${threshold.value}${threshold.unit} not asserted in any mapped scenario`,
        });
      }
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Q2: 需求 + BDD → TLA+ (anti-weakening / anti-simplification / anti-de-hierarchization)
// ---------------------------------------------------------------------------

/** NFR category → the invariant name expected to carry its constraint. */
const NFR_TO_INVARIANT: Record<NFRCategory, string> = {
  performance: 'PerfLatencyInv',
  security: 'SecurityInv',
  availability: 'AvailInv',
  compatibility: 'CompatInv',
  maintainability: 'MaintInv',
  compliance: 'ComplianceInv',
};

/**
 * @param modules parsed TLA+ modules (verified)
 * @param bddNumbers numeric literals collected across all verified scenarios,
 *   used as the source-of-truth thresholds that TLA+ must not drop.
 * @param archLayerCount number of architecture layers/subsystems the IR claims,
 *   used to detect de-hierarchization (many subsystems collapsed to one model).
 */
export function analyzeReqBddToTla(
  ir: SRSIR,
  modules: TlaModule[],
  bddNumbers: Set<string>,
  archLayerCount: number,
): FidelityFinding[] {
  const findings: FidelityFinding[] = [];
  const detected = new Set(ir.nfrProfile.detectedCategories.map(e => e.category));
  const allInvariants = new Set(modules.flatMap(m => m.invariantNames));

  // (a) anti-weakening: each NFR category present upstream must have its named
  // invariant somewhere in the verified TLA+ corpus.
  for (const category of detected) {
    const invName = NFR_TO_INVARIANT[category];
    if (!allInvariants.has(invName)) {
      findings.push({
        layer: 'req+bdd->tla', kind: 'nfr-invariant-missing',
        severity: 'error', subject: category,
        detail: `NFR category "${category}" is present in the requirement graph but no ${invName} exists in any verified TLA+ module`,
      });
    }
  }

  // (b) anti-simplification: threshold constants that appear in requirements/BDD
  // must survive into the model (as a .cfg CONSTANT or a literal in the .tla).
  const tlaNumbers = new Set(modules.flatMap(m => [...m.numbers, ...m.constants.flatMap(extractNumbers)]));
  const irThresholds = ir.nodes
    .map(n => n.properties.nfrThreshold?.value)
    .filter((v): v is number => typeof v === 'number')
    .map(String);
  for (const value of new Set([...irThresholds, ...bddNumbers])) {
    // ignore trivial small-model bounds (0/1/2) that are modelling artefacts
    if (Number(value) <= 2) continue;
    if (!tlaNumbers.has(value)) {
      findings.push({
        layer: 'req+bdd->tla', kind: 'threshold-simplified-away',
        severity: 'warning', subject: value,
        detail: `threshold constant ${value} from requirements/BDD does not appear in any verified TLA+ module or its CONSTANTS (possible over-abstraction)`,
      });
    }
  }

  // (c) anti-de-hierarchization: if the architecture declares many layers but the
  // TLA+ corpus collapsed into very few actions, the multi-layer behaviour was
  // flattened into one bounded state model.
  const totalActions = modules.reduce((sum, m) => sum + m.actionCount, 0);
  if (archLayerCount >= 3 && modules.length > 0 && totalActions < archLayerCount) {
    findings.push({
      layer: 'req+bdd->tla', kind: 'de-hierarchization',
      severity: 'warning', subject: `${modules.length} module(s)`,
      detail: `architecture declares ${archLayerCount} layers/subsystems but TLA+ models only ${totalActions} action(s) across ${modules.length} module(s); hierarchy may have been flattened`,
    });
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Q3: 需求 + BDD + TLA → Lean4 (anti-drift / anti-simplification)
// ---------------------------------------------------------------------------

/** Keywords that trigger Lean 4 proof obligations (mirrors strict-modes.md). */
const LEAN_TRIGGER = /security|encryption|authentication|authorization|cryptography|compliance|gdpr|hipaa|soc2|iso27001|regulat|audit|traceability|non-repudiation|加密|认证|授权|合规|审计|监管/i;

/**
 * Each requirement that triggered Lean (security/compliance/audit) must have at
 * least one theorem whose signature shares vocabulary with the requirement —
 * otherwise the proof drifted away from what it was meant to prove. `minShared`
 * guards against a theorem that merely name-matches but proves something else.
 */
export function analyzeToLean(
  ir: SRSIR,
  theorems: LeanTheorem[],
  leanRequired: boolean,
): FidelityFinding[] {
  const findings: FidelityFinding[] = [];
  if (!leanRequired) return findings;

  const triggered = ir.nodes.filter(
    n => (n.type === 'requirement' || n.type === 'nfr') && LEAN_TRIGGER.test(n.properties.statement ?? ''),
  );

  if (triggered.length > 0 && theorems.length === 0) {
    findings.push({
      layer: 'req+bdd+tla->lean', kind: 'proof-missing',
      severity: 'error', subject: `${triggered.length} triggered requirement(s)`,
      detail: 'security/compliance requirements triggered Lean 4 but no theorem was found in the verified project',
    });
    return findings;
  }

  for (const node of triggered) {
    const reqTokens = tokenize(node.properties.statement ?? '');
    if (reqTokens.size === 0) continue;
    let best = 0;
    for (const thm of theorems) {
      const shared = [...reqTokens].filter(t => thm.tokens.has(t)).length;
      best = Math.max(best, shared);
    }
    if (best < 1) {
      findings.push({
        layer: 'req+bdd+tla->lean', kind: 'proof-drift',
        severity: node.properties.formalizationPriority === 'safety-critical' ? 'error' : 'warning',
        subject: node.id,
        detail: 'no Lean theorem signature shares any vocabulary with this triggered requirement; the proof may not correspond to the obligation',
      });
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Aggregate
// ---------------------------------------------------------------------------

export function buildFidelityReport(findings: FidelityFinding[]): FidelityReport {
  const errors = findings.filter(f => f.severity === 'error').length;
  const warnings = findings.filter(f => f.severity === 'warning').length;
  return {
    generatedAt: new Date().toISOString(),
    findings,
    summary: { errors, warnings, passed: errors === 0 },
  };
}
