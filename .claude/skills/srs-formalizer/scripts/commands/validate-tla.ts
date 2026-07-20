import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliResult } from '../types/index.js';
import { safeParseArg, validateWorkDir } from '../lib/cli.js';
import { ARTIFACT_PATHS, artifactPath } from '../lib/artifacts/paths.js';
import { hashFiles, hashText, writeValidationReport } from '../lib/artifacts/validation-report.js';
import { promoteFiles } from '../lib/artifacts/promotion.js';
import { validateTla } from '../lib/tla-validator.js';

const PLACEHOLDER = /LLM_FILL|TODO|FIXME|TBD|\bGAP\b|待定|未定义|待实现/i;

/** The six NFR invariant names (must stay in sync with orchestrator_backend.md / executor-tlaplus.md). */
const NFR_INVARIANTS = ['PerfLatencyInv', 'SecurityInv', 'AvailInv', 'CompatInv', 'MaintInv', 'ComplianceInv'] as const;

/** Strip TLA+ comments so definition bodies compare on semantics, not prose. */
function stripTlaComments(src: string): string {
  return src.replace(/\(\*[\s\S]*?\*\)/g, ' ').split('\n').map(line => {
    const idx = line.indexOf('\\*');
    return idx === -1 ? line : line.slice(0, idx);
  }).join('\n');
}

/**
 * Extract the body of a top-level `Name == ...` definition. Captures the first
 * line after `==` plus any following continuation lines (conjunction/disjunction
 * lists starting with /\ or \/), normalising whitespace for comparison.
 */
function extractDefinitionBody(source: string, name: string): string | null {
  const lines = source.split('\n');
  const start = lines.findIndex(line => new RegExp(`^${name}\\s*==`).test(line));
  if (start === -1) return null;
  const first = lines[start]!.replace(new RegExp(`^${name}\\s*==`), '').trim();
  const collected = [first];
  for (let i = start + 1; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    if (/^(\/\\|\\\/)/.test(trimmed) || (trimmed !== '' && /^[\s]/.test(lines[i]!) && !/^\w+\s*==/.test(trimmed))) {
      collected.push(trimmed);
    } else break;
  }
  return collected.join(' ').replace(/\s+/g, ' ').trim();
}

/** `var \in SetName` (a single membership in a named set) is a type-tautology: permanently true given TypeOK. */
const TAUTOLOGY_BODY = /^\w+'?\s*\\in\s+\w+$/;

/**
 * Semantic keyword whitelist per NFR invariant name (proposal §P0-2). A perf
 * invariant that never mentions a latency/time-related variable, a security
 * invariant with no auth/permission/block term, etc. almost certainly does not
 * assert what its name promises. Keywords are matched case-insensitively so both
 * variable names (`latencyMs`) and CJK statements survive stripping.
 */
const NFR_SEMANTIC_KEYWORDS: Record<(typeof NFR_INVARIANTS)[number], RegExp> = {
  PerfLatencyInv: /latency|延迟|响应|response|duration|elapsed|deadline|时延|耗时|ms\b|时间/i,
  SecurityInv: /security|auth|permission|权限|认证|授权|block|拒绝|deny|denied|reject|token|credential|加密|encrypt/i,
  AvailInv: /avail|可用|uptime|health|健康|recover|恢复|failover|降级|degrade|circuit|熔断|retry|重试/i,
  CompatInv: /compat|兼容|version|版本|protocol|协议|schema|interface|接口|migrat|向后|backward/i,
  MaintInv: /maint|维护|budget|预算|complexity|复杂度|attempt|重试|rework|返工|log|日志|observ|可观测/i,
  ComplianceInv: /complianc|合规|audit|审计|gdpr|hipaa|soc2|iso|regulat|监管|retention|留存|consent|授权|severity|S4/i,
};

/**
 * Normalise an invariant body for equivalence comparison (proposal §P0-2):
 * collapse whitespace, unify `=<`→`<=`, strip redundant parentheses/quotes, so
 * `x <= Max` and `( x =<  Max )` are treated as duplicates ("归一化等价"), not
 * just byte-identical bodies.
 */
function normalizeBody(body: string): string {
  return body
    .replace(/=</g, '<=')
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, '')
    .toUpperCase();
}

/**
 * Detect vacuous / near-tautological invariant bodies that the single
 * `var \in TypeSet` rule misses (proposal §P0-2): a bare `TRUE`, a disjunct
 * `\/ TRUE`, or an implication whose consequent is `TRUE` (`=> TRUE`). Each is
 * permanently true regardless of state, so it constrains nothing.
 */
function tautologyReason(body: string): string | null {
  const normalized = body.replace(/\s+/g, ' ').trim();
  if (TAUTOLOGY_BODY.test(normalized)) return '`var \\in TypeSet` form is permanently true, not a real constraint';
  if (/^TRUE$/i.test(normalized)) return 'body is literally TRUE';
  if (/\\\/\s*TRUE\b/i.test(normalized)) return 'a `\\/ TRUE` disjunct makes the whole invariant permanently true';
  if (/(?:=>|\\implies|~>)\s*TRUE\b/i.test(normalized)) return 'an implication with `TRUE` consequent is vacuous';
  return null;
}

/**
 * Non-triviality checks (proposal §2.3 + §P0-2): reject vacuous invariants and
 * template duplication (normalised equivalence). These are unambiguous and block
 * promotion.
 */
function nonTrivialityErrors(source: string): string[] {
  const errors: string[] = [];
  const clean = stripTlaComments(source);
  const presentNfr = NFR_INVARIANTS.filter(name => new RegExp(`^${name}\\s*==`, 'm').test(clean));
  const bodies = new Map<string, string>();
  for (const name of presentNfr) {
    const body = extractDefinitionBody(clean, name);
    if (!body) continue;
    bodies.set(name, body);
    const reason = tautologyReason(body);
    if (reason) errors.push(`${name} is a tautology (${reason})`);
  }
  // Detect template duplication: two NFR invariants that are equal after
  // whitespace/operator normalisation (not merely byte-identical).
  const byBody = new Map<string, string[]>();
  for (const [name, body] of bodies) {
    const key = normalizeBody(body);
    if (!byBody.has(key)) byBody.set(key, []);
    byBody.get(key)!.push(name);
  }
  for (const [, names] of byBody) {
    if (names.length > 1) errors.push(`NFR invariants share an equivalent body (template duplication): ${names.join(', ')}`);
  }
  return errors;
}

/**
 * Naming/content consistency heuristic (proposal §P0-2, non-blocking). An NFR
 * invariant whose body mentions no term consistent with the semantics its name
 * promises is *likely* a weakened placeholder (e.g. a `PerfLatencyInv` that is
 * really `budgetUsed <= MaxBudget`). Emitted as a warning rather than a hard
 * error because legitimate state-machine encodings may not use the keyword.
 */
function nonTrivialityWarnings(source: string): string[] {
  const warnings: string[] = [];
  const clean = stripTlaComments(source);
  const presentNfr = NFR_INVARIANTS.filter(name => new RegExp(`^${name}\\s*==`, 'm').test(clean));
  for (const name of presentNfr) {
    const body = extractDefinitionBody(clean, name);
    if (!body || tautologyReason(body)) continue;
    if (!NFR_SEMANTIC_KEYWORDS[name].test(body)) {
      warnings.push(`${name} body references no ${name}-related term; verify its assertion matches the semantics its name promises (possible naming/content mismatch)`);
    }
  }
  return warnings;
}

function staticErrors(source: string, cfg: string): string[] {
  const errors: string[] = [];
  if (PLACEHOLDER.test(source)) errors.push('forbidden placeholder found');
  if ((source.match(/----\s*MODULE\s+\w+\s*----/g) ?? []).length !== 1) errors.push('exactly one module header is required');
  if (!/VARIABLES\s+\w+/.test(source)) errors.push('non-empty VARIABLES declaration is required');
  for (const operator of ['Init', 'Next', 'TypeOK']) if (!new RegExp(`^${operator}\\s*==\\s*\\S`, 'm').test(source)) errors.push(`non-empty ${operator} definition is required`);
  if (!/^INVARIANT\s+TypeOK/m.test(cfg)) errors.push('cfg must declare TypeOK invariant');
  errors.push(...nonTrivialityErrors(source));
  return errors;
}

export { nonTrivialityErrors, nonTrivialityWarnings, tautologyReason, normalizeBody };

export async function main(args: string[]): Promise<CliResult> {
  let workDirArg: string | null; let name: string | null;
  try { workDirArg = safeParseArg(args, '--workdir'); name = safeParseArg(args, '--name'); }
  catch (err) { return { status: 'error', message: (err as Error).message }; }
  if (!workDirArg || !name) return { status: 'error', message: `Missing required argument: ${!workDirArg ? '--workdir' : '--name'}` };
  let workDir: string;
  try { workDir = validateWorkDir(workDirArg); } catch (err) { return { status: 'error', message: (err as Error).message }; }
  const strict = args.includes('--strict'); const promote = args.includes('--promote');
  if (promote && !strict) return { status: 'error', message: '--promote requires --strict' };
  const sourceDir = artifactPath(workDir, promote ? ARTIFACT_PATHS.tlaDraft : ARTIFACT_PATHS.tlaVerified);
  const tlaFile = path.join(sourceDir, `${name}.tla`); const cfgFile = path.join(sourceDir, `${name}.cfg`);
  if (!fs.existsSync(tlaFile) || !fs.existsSync(cfgFile)) return { status: 'error', message: 'candidate .tla and matching .cfg are required' };
  const startedAt = new Date().toISOString();
  const errors = strict ? staticErrors(fs.readFileSync(tlaFile, 'utf8'), fs.readFileSync(cfgFile, 'utf8')) : [];
  if (errors.length) return { status: 'error', message: 'TLA+ static validation failed', data: { errors } };
  if (!strict) return { status: 'ok', data: { files: [tlaFile, cfgFile] } };
  const warnings = nonTrivialityWarnings(fs.readFileSync(tlaFile, 'utf8'));
  let result;
  try { result = validateTla(tlaFile, cfgFile); }
  catch (err) { return { status: 'error', message: 'TLA+ toolchain unavailable', data: { error: (err as Error).message } }; }
  if (!result.passed) return { status: 'error', message: 'TLA+ SANY or TLC validation failed', data: { sany: result.sany, tlc: result.tlc } };
  // P2-1: TLC must actually run and exit cleanly before promotion. A `null`
  // exit code means TLC was skipped (e.g. SANY-only), which no longer counts as
  // a verified state — reject rather than promote on static checks alone.
  if (result.tlc.exitCode !== 0) return { status: 'error', message: 'TLC did not run to a clean exit (exitCode !== 0); refusing to promote on static checks alone', data: { tlc: result.tlc } };
  // Promote first, then hash the FINAL file locations (verified/ when --promote, draft/ otherwise)
  // so that checks-final.ts (which hashes the verified/ paths) can match the report's sourceHash.
  // Earlier versions hashed draft paths which never matched verified paths.
  const files = promote ? promoteFiles(sourceDir, artifactPath(workDir, ARTIFACT_PATHS.tlaVerified), [`${name}.tla`, `${name}.cfg`]) : [tlaFile, cfgFile];
  const sourceHash = hashFiles(files);
  const reportPath = path.join(artifactPath(workDir, ARTIFACT_PATHS.tlaValidation), `${sourceHash}.json`);
  writeValidationReport(reportPath, {
    artifactKind: 'tlaplus', lifecycle: 'verified', sourcePaths: files, sourceHash, irHash: sourceHash,
    tools: [{ name: 'java', version: result.javaVersion }, { name: 'tla2tools', version: result.jarVersion }],
    startedAt, completedAt: new Date().toISOString(), passed: true,
    checks: [{ name: 'static specification checks', passed: true }, { name: 'SANY', passed: true, detail: result.sany.output.slice(0, 500) }, { name: 'TLC', passed: true, detail: result.tlc.output.slice(0, 500) }],
    // P0-1: bind the report to the real tool runs. checks-final.ts requires a
    // 64-hex stdout hash + exitCode 0 per entry, so this report cannot be forged
    // by hand-writing `passed: true`.
    toolEvidence: [
      { tool: 'SANY', exitCode: result.sany.exitCode, stdoutHash: hashText(result.sany.output), durationMs: result.sany.durationMs },
      { tool: 'TLC', exitCode: result.tlc.exitCode, stdoutHash: hashText(result.tlc.output), durationMs: result.tlc.durationMs },
    ],
  });
  return { status: 'ok', data: { files, report: reportPath, ...(warnings.length ? { warnings } : {}) } };
}

import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
