/**
 * convergence-log.ts — structured convergence/weakening audit log (§P2-2).
 *
 * The review found convergence-log only recorded pass/skip, hiding high-risk
 * "invariant weakened" edits. This module defines the record schema and a pure
 * validator so every weakening action (invariant body diff, threshold relaxed,
 * scope reduced) is auditable. Records are appended to
 * `outputs/reports/convergence-log.jsonl` (one JSON object per line).
 */

export type ConvergenceAction =
  | 'pass'
  | 'skip'
  | 'invariant_weakened'
  | 'threshold_relaxed'
  | 'scope_reduced'
  | 'proof_simplified'
  | 'rework';

export interface ConvergenceLogEntry {
  timestamp: string;
  stage: string;
  action: ConvergenceAction;
  subject: string;
  /** REQUIRED for weakening actions: before/after body or value diff. */
  before?: string;
  after?: string;
  /** Human/agent justification — required for weakening actions. */
  reason?: string;
}

/** Actions that materially reduce guarantee strength and therefore require a diff + reason. */
export const WEAKENING_ACTIONS: ReadonlySet<ConvergenceAction> = new Set([
  'invariant_weakened', 'threshold_relaxed', 'scope_reduced', 'proof_simplified',
]);

export function isWeakeningAction(action: string): boolean {
  return WEAKENING_ACTIONS.has(action as ConvergenceAction);
}

/** Validate a single entry. Weakening actions must carry before/after + reason. */
export function validateEntry(entry: Partial<ConvergenceLogEntry>): string[] {
  const errors: string[] = [];
  if (!entry.timestamp) errors.push('missing timestamp');
  if (!entry.stage) errors.push('missing stage');
  if (!entry.action) errors.push('missing action');
  if (!entry.subject) errors.push('missing subject');
  if (entry.action && isWeakeningAction(entry.action)) {
    if (!entry.before || !entry.after) errors.push(`${entry.action} requires before/after diff`);
    if (!entry.reason || entry.reason.trim().length < 4) errors.push(`${entry.action} requires a substantive reason`);
  }
  return errors;
}

/** Parse a JSONL convergence log into entries, tolerating blank lines. */
export function parseConvergenceLog(content: string): ConvergenceLogEntry[] {
  const entries: ConvergenceLogEntry[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    entries.push(JSON.parse(trimmed) as ConvergenceLogEntry);
  }
  return entries;
}
