/**
 * recommendations.ts — Generate human-readable recommendations from health checks
 */

import type { HealthCheck, HealthReport } from './types.js';

export function generateRecommendations(checks: HealthCheck[], capabilities: HealthReport['capabilities']): string[] {
  const recs: string[] = [];
  const hasError = checks.some(c => c.status === 'error');

  if (hasError) recs.push('Fix error-level checks before proceeding.');
  if (!capabilities.tla_plus) recs.push('Install Java JRE/JDK (>=11) to enable TLA+ model checking.');
  if (!capabilities.lean4) recs.push('Install Lean 4 (https://lean-lang.org/) for theorem proving support.');
  if (!capabilities.bdd_validation) recs.push('Run "npm install" to install devDependencies.');
  if (!hasError && capabilities.bdd_validation && capabilities.tla_plus) {
    recs.push('Environment ready! Start with: npx tsx index.ts pipeline --src <srs-file> --lang zh --workdir .srs_formalizer');
  }

  return recs;
}
