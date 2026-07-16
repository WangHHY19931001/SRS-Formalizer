/**
 * Coverage report generator.
 * Scans test_fixtures/ and compares against source outputs to compute coverage.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CoverageReport, MissingEntry } from './types.js';

/** Count Scenario lines in a .feature file */
function countScenarios(featurePath: string): number {
  try {
    const content = fs.readFileSync(featurePath, 'utf-8');
    return (content.match(/^\s+Scenario(?:\s+Outline)?:/gm) ?? []).length;
  } catch {
    return 0;
  }
}

/** Count .tla files in a directory */
function countTlaFiles(dir: string): number {
  try {
    return fs.readdirSync(dir).filter(f => f.endsWith('.tla')).length;
  } catch {
    return 0;
  }
}

/** Count .lean files in a directory */
function countLeanFiles(dir: string): number {
  try {
    return fs.readdirSync(dir).filter(f => f.endsWith('.lean')).length;
  } catch {
    return 0;
  }
}

/** Check if any fixture files exist for a given level/framework */
function hasFixtures(fixturesDir: string, level: string, framework: string): boolean {
  const dir = path.join(fixturesDir, level, framework);
  try {
    const files = fs.readdirSync(dir);
    return files.length > 0;
  } catch {
    return false;
  }
}

/** Compute coverage report for a workdir */
export function computeCoverage(workDir: string): CoverageReport {
  const featDir = path.join(workDir, '4_bdd', 'features');
  const tlaDir = path.join(workDir, '5_formal', 'specs');
  const leanDir = path.join(workDir, '5_formal', 'proofs');
  const fixturesDir = path.join(workDir, 'test_fixtures');

  // Count BDD scenarios
  let totalRequirements = 0;
  if (fs.existsSync(featDir)) {
    const features = fs.readdirSync(featDir).filter(f => f.endsWith('.feature'));
    for (const f of features) {
      totalRequirements += countScenarios(path.join(featDir, f));
    }
  }

  // Count TLA+ and Lean sources
  const tlaCount = countTlaFiles(tlaDir);
  const leanCount = countLeanFiles(leanDir);
  totalRequirements += tlaCount + leanCount;

  // Count fixtures generated
  let bddFixtures = 0;
  let tlaFixtures = 0;
  let leanFixtures = 0;

  if (fs.existsSync(fixturesDir)) {
    const frameworks = ['cucumber', 'playwright', 'pytest', 'junit', 'fast-check'];
    for (const fw of frameworks) {
      if (hasFixtures(fixturesDir, 'acceptance', fw)) bddFixtures++;
      if (hasFixtures(fixturesDir, 'unit', fw)) bddFixtures++;
      if (hasFixtures(fixturesDir, 'integration', fw)) tlaFixtures++;
      if (hasFixtures(fixturesDir, 'property', fw)) leanFixtures++;
    }
  }

  const covered = bddFixtures + tlaFixtures + leanFixtures;
  const coveragePct = totalRequirements > 0
    ? Math.round((covered / totalRequirements) * 100)
    : 0;

  const missing: MissingEntry[] = [];
  if (bddFixtures === 0 && totalRequirements > 0) {
    missing.push({ requirement: 'BDD', reason: 'no BDD fixtures generated' });
  }
  if (tlaCount > 0 && tlaFixtures === 0) {
    missing.push({ requirement: 'TLA+', reason: 'no TLA+ fixtures generated' });
  }
  if (leanCount > 0 && leanFixtures === 0) {
    missing.push({ requirement: 'Lean 4', reason: 'no Lean 4 fixtures generated' });
  }

  return {
    total_requirements: totalRequirements,
    bdd_fixtures_generated: bddFixtures,
    tla_fixtures_generated: tlaFixtures,
    lean_fixtures_generated: leanFixtures,
    coverage_pct: coveragePct,
    missing,
  };
}
