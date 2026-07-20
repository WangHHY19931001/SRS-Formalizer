/**
 * analyze-fidelity.ts — cross-artifact anti-weakening analysis (review Q1/Q2/Q3).
 *
 * Reads srs-ir.json + verified BDD/TLA+/Lean artifacts + optional rid_mapping.json
 * and reports where downstream artifacts weakened, simplified, or drifted from the
 * requirement graph. Deterministic; no LLM, no network.
 *
 * CLI: analyze-fidelity --workdir .srs_formalizer [--strict]
 *   --strict → non-zero exit (status error) when any `error`-severity finding exists.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliResult } from '../types/index.js';
import type { RidMapping, SRSIR } from '../types/srs-ir.js';
import { safeParseArg, validateWorkDir, refuseDirectInvocation } from '../lib/cli.js';
import { ARTIFACT_PATHS, artifactPath } from '../lib/artifacts/paths.js';
import { collectByExtension } from '../lib/artifacts/validation-report.js';
import { extractFrozenRids } from '../lib/rid-mapping.js';
import {
  analyzeReqToBdd, analyzeReqBddToTla, analyzeToLean, buildFidelityReport, extractNumbers,
  type BddScenario, type TlaModule, type LeanTheorem, type NodeScenarioIndex,
} from '../lib/fidelity/analyzer.js';
import { hasNegation } from '../lib/text-analysis.js';

const NEGATION_ASSERTION = /不得|禁止|拒绝|does not|must not|cannot|is denied|is rejected|is blocked|is held/i;

/** Parse `.feature` files into scenarios with their RID tags and negation flag. */
function parseScenarios(bddDir: string): BddScenario[] {
  const scenarios: BddScenario[] = [];
  for (const file of collectByExtension(bddDir, '.feature')) {
    const content = fs.readFileSync(file, 'utf8');
    const feature = path.basename(file);
    const lines = content.split('\n');
    let current: { name: string; buffer: string[] } | null = null;
    const flush = (): void => {
      if (!current) return;
      const text = current.buffer.join('\n');
      const rids = extractFrozenRids(current.name + '\n' + text).map(r => r.rid);
      scenarios.push({ feature, name: current.name.trim(), rids, text, hasNegation: hasNegation(text) || NEGATION_ASSERTION.test(text), numbers: extractNumbers(text) });
      current = null;
    };
    for (const line of lines) {
      if (/^\s*Scenario\b/i.test(line) || /^\s*场景\b/.test(line)) {
        flush();
        current = { name: line.replace(/^\s*Scenario(?: Outline)?:?/i, '').trim(), buffer: [] };
      } else if (current) {
        current.buffer.push(line);
      }
    }
    flush();
  }
  return scenarios;
}

/** Parse a verified TLA+ module + its cfg into the shape the analyzer needs. */
function parseTlaModules(tlaDir: string): TlaModule[] {
  const modules: TlaModule[] = [];
  for (const tlaFile of collectByExtension(tlaDir, '.tla')) {
    const body = fs.readFileSync(tlaFile, 'utf8');
    const name = path.basename(tlaFile, '.tla');
    const cfgFile = tlaFile.replace(/\.tla$/, '.cfg');
    const cfg = fs.existsSync(cfgFile) ? fs.readFileSync(cfgFile, 'utf8') : '';
    const invariantNames = [...body.matchAll(/^(\w*Inv)\s*==/gm)].map(m => m[1]!);
    // Count top-level actions: `Name == ... /\ x' = ...` (definitions with primed vars).
    const actionCount = [...body.matchAll(/^(\w+)\s*==/gm)]
      .map(m => m[1]!)
      .filter(defName => new RegExp(`^${defName}\\s*==[\\s\\S]*?'`, 'm').test(body) && !/Inv$/.test(defName) && !['Init', 'TypeOK', 'Spec', 'Next'].includes(defName)).length;
    const constants = [...cfg.matchAll(/^\s*CONSTANTS?\s+(.+)$/gm)].flatMap(m => m[1]!.split(/[\s,]+/).filter(Boolean));
    modules.push({ name, invariantNames, actionCount, constants, numbers: extractNumbers(body), body });
  }
  return modules;
}

/** Parse Lean `.lean` files into theorem/lemma signatures with their tokens. */
function parseLeanTheorems(leanDir: string): LeanTheorem[] {
  const theorems: LeanTheorem[] = [];
  for (const file of collectByExtension(leanDir, '.lean')) {
    const content = fs.readFileSync(file, 'utf8');
    const rel = path.basename(file);
    for (const m of content.matchAll(/\b(?:theorem|lemma)\s+(\w+)([^:]*:[^:=]*)/g)) {
      const sig = m[2]!.trim();
      const tokens = new Set(sig.toLowerCase().match(/[a-z_][a-z0-9_]+/g) ?? []);
      theorems.push({ file: rel, name: m[1]!, signature: sig, tokens });
    }
  }
  return theorems;
}

/** Build node id → scenarios index from the RID map (preferred) and direct id tags. */
function buildIndex(ir: SRSIR, scenarios: BddScenario[], ridMap: RidMapping | null): NodeScenarioIndex {
  const index: NodeScenarioIndex = new Map();
  const add = (nodeId: string, scenario: BddScenario): void => {
    const list = index.get(nodeId) ?? [];
    if (!list.includes(scenario)) list.push(scenario);
    index.set(nodeId, list);
  };
  const ridToNodes = new Map<string, string[]>();
  for (const entry of ridMap?.entries ?? []) ridToNodes.set(entry.rid, entry.irNodeIds);
  const nodeIds = new Set(ir.nodes.map(n => n.id));
  for (const scenario of scenarios) {
    for (const rid of scenario.rids) {
      // RID map link
      for (const nodeId of ridToNodes.get(rid) ?? []) add(nodeId, scenario);
      // direct id tag (skill emits R1-Sxxx as a scenario tag)
      if (nodeIds.has(rid)) add(rid, scenario);
    }
    // also match any IR node id appearing verbatim in the scenario text
    for (const nodeId of nodeIds) {
      if (scenario.text.includes(nodeId) || scenario.name.includes(nodeId)) add(nodeId, scenario);
    }
  }
  return index;
}

export async function main(args: string[]): Promise<CliResult> {
  let workDirArg: string | null;
  try { workDirArg = safeParseArg(args, '--workdir'); }
  catch (err) { return { status: 'error', message: (err as Error).message }; }
  if (!workDirArg) return { status: 'error', message: 'Missing required argument: --workdir' };
  let workDir: string;
  try { workDir = validateWorkDir(workDirArg); } catch (err) { return { status: 'error', message: (err as Error).message }; }
  const strict = args.includes('--strict');

  const irPath = path.join(workDir, 'srs-ir.json');
  if (!fs.existsSync(irPath)) return { status: 'error', message: `srs-ir.json not found at ${irPath}` };
  let ir: SRSIR;
  try { ir = JSON.parse(fs.readFileSync(irPath, 'utf8')) as SRSIR; }
  catch (err) { return { status: 'error', message: `Failed to parse IR: ${(err as Error).message}` }; }

  const ridMapPath = path.join(workDir, '_ctx', 'rid_mapping.json');
  let ridMap: RidMapping | null = null;
  if (fs.existsSync(ridMapPath)) {
    try { ridMap = JSON.parse(fs.readFileSync(ridMapPath, 'utf8')) as RidMapping; } catch { ridMap = null; }
  }

  const scenarios = parseScenarios(artifactPath(workDir, ARTIFACT_PATHS.bddVerified));
  const modules = parseTlaModules(artifactPath(workDir, ARTIFACT_PATHS.tlaVerified));
  const theorems = parseLeanTheorems(artifactPath(workDir, ARTIFACT_PATHS.leanVerified));

  const index = buildIndex(ir, scenarios, ridMap);
  const bddNumbers = new Set(scenarios.flatMap(s => s.numbers));
  const archLayerCount = ir.nodes.filter(n => n.type === 'architecture').length;
  const leanRequired = ir.nfrProfile.detectedCategories.some(e => e.category === 'security' || e.category === 'compliance');

  const findings = [
    ...analyzeReqToBdd(ir, index),
    ...analyzeReqBddToTla(ir, modules, bddNumbers, archLayerCount),
    ...analyzeToLean(ir, theorems, leanRequired),
  ];
  const report = buildFidelityReport(findings);

  const reportPath = path.join(artifactPath(workDir, ARTIFACT_PATHS.reports), 'fidelity.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

  if (strict && report.summary.errors > 0) {
    return { status: 'error', message: `Fidelity analysis found ${report.summary.errors} weakening/drift error(s)`, data: { report: reportPath, ...report.summary, findings: findings.filter(f => f.severity === 'error') } };
  }
  return { status: 'ok', data: { report: reportPath, ...report.summary, findings } };
}

refuseDirectInvocation(import.meta.url);
