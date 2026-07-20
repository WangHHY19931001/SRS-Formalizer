/**
 * checks-fidelity.ts — FINAL-gate checks for cross-artifact fidelity (§P1-3 + Q1/Q2/Q3).
 *
 * Consumes outputs/reports/fidelity.json (produced by analyze-fidelity) so the
 * FINAL gate blocks when downstream artifacts weakened/drifted from the
 * requirement graph, and enforces that every safety-critical requirement is
 * actually covered.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CheckResult } from './shared.js';
import { ARTIFACT_PATHS, artifactPath } from '../artifacts/paths.js';
import type { FidelityReport } from '../fidelity/analyzer.js';
import type { SRSIR } from '../../types/srs-ir.js';

/** FINAL: the fidelity report must exist and carry no error-severity findings. */
export function checkFidelityReport(workDir: string): CheckResult {
  const reportPath = path.join(artifactPath(workDir, ARTIFACT_PATHS.reports), 'fidelity.json');
  if (!fs.existsSync(reportPath)) {
    return { name: 'Cross-artifact fidelity', passed: false, detail: 'fidelity.json missing — run analyze-fidelity before FINAL' };
  }
  try {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as FidelityReport;
    const errors = report.findings.filter(f => f.severity === 'error');
    if (errors.length === 0) {
      return { name: 'Cross-artifact fidelity', passed: true, detail: `0 errors, ${report.summary.warnings} warning(s)` };
    }
    const sample = errors.slice(0, 5).map(e => `${e.kind}:${e.subject}`).join('; ');
    return { name: 'Cross-artifact fidelity', passed: false, detail: `${errors.length} weakening/drift error(s): ${sample}` };
  } catch (err) {
    return { name: 'Cross-artifact fidelity', passed: false, detail: `Could not read fidelity.json: ${(err as Error).message}` };
  }
}

/**
 * FINAL: every safety-critical requirement must be covered (no coverage-gap /
 * dilution / proof-missing error targeting it). Uses the fidelity report's
 * findings keyed by node id; if the IR declares safety-critical nodes but the
 * report is absent, this fails closed.
 */
export function checkSafetyCriticalCoverage(workDir: string): CheckResult {
  let ir: SRSIR;
  try { ir = JSON.parse(fs.readFileSync(path.join(workDir, 'srs-ir.json'), 'utf8')) as SRSIR; }
  catch { return { name: 'Safety-critical coverage', passed: false, detail: 'srs-ir.json cannot be read' }; }
  const safetyCritical = ir.nodes.filter(n => n.properties.formalizationPriority === 'safety-critical').map(n => n.id);
  if (safetyCritical.length === 0) {
    return { name: 'Safety-critical coverage', passed: true, detail: 'No safety-critical requirements declared' };
  }
  const reportPath = path.join(artifactPath(workDir, ARTIFACT_PATHS.reports), 'fidelity.json');
  if (!fs.existsSync(reportPath)) {
    return { name: 'Safety-critical coverage', passed: false, detail: `${safetyCritical.length} safety-critical requirement(s) but no fidelity report to prove coverage` };
  }
  try {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as FidelityReport;
    const criticalSet = new Set(safetyCritical);
    const uncovered = report.findings
      .filter(f => f.severity === 'error' && criticalSet.has(f.subject) && ['coverage-gap', 'dilution', 'proof-missing', 'proof-drift', 'negation-drop', 'threshold-drop'].includes(f.kind))
      .map(f => f.subject);
    const unique = [...new Set(uncovered)];
    return {
      name: 'Safety-critical coverage',
      passed: unique.length === 0,
      detail: unique.length === 0
        ? `All ${safetyCritical.length} safety-critical requirement(s) covered`
        : `${unique.length} safety-critical requirement(s) with coverage/drift errors: ${unique.slice(0, 5).join(', ')}`,
    };
  } catch (err) {
    return { name: 'Safety-critical coverage', passed: false, detail: `Could not read fidelity.json: ${(err as Error).message}` };
  }
}
