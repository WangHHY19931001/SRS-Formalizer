/**
 * compile.ts — skill compilation command (Phase 1-4 pipeline)
 *
 * CLI: npx tsx index.ts compile --skill-dir <path> --workdir .srs_formalizer
 *
 * Phases:
 *   1. Parse SKILL.md
 *   2. Build SkIR
 *   3. Inject anti-skill constraints
 *   4. Validate SkIR schema
 *   5. Emit platform artifacts
 *
 * Outputs: _ctx/skir.json, skill.claude.xml, skill.generic.md
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type { CliResult } from '../types/index.js';
import type { SkillIR } from '../types/skir.js';
import { safeParseArg, validateWorkDir } from '../lib/cli.js';
import { parseRawSkillMd, buildSkIR } from '../lib/skir-builder.js';
import { inject, getViolationsByLevel } from '../lib/anti-skill.js';
import { validateSkIR, hasBlockingViolations } from '../lib/compile-validator.js';
import { ClaudeXmlEmitter } from '../lib/emitter-claude-xml.js';
import { GenericMarkdownEmitter } from '../lib/emitter-generic-md.js';

interface CompileData {
  skir_path: string;
  emitted: string[];
  constraints_injected: number;
  security_level: string;
  source_hash: string;
  compiled_at: string;
  warnings?: Array<{ rule: string; detail: string }>;
  violations?: Array<{ rule: string; level: string; detail: string; found_in: string }>;
}

export async function main(args: string[]): Promise<CliResult> {
  // ── Parse CLI arguments ──────────────────────────────────────────────
  let skillDirArg: string | null;
  let workDirArg: string | null;
  let targetFilter: string | null;
  try {
    skillDirArg = safeParseArg(args, '--skill-dir');
    workDirArg = safeParseArg(args, '--workdir');
    targetFilter = safeParseArg(args, '--target');
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  if (!skillDirArg) {
    return { status: 'error', message: 'Missing required argument: --skill-dir' };
  }
  if (!workDirArg) {
    return { status: 'error', message: 'Missing required argument: --workdir' };
  }

  // Validate work directory (must end with .srs_formalizer)
  let workDir: string;
  try {
    workDir = validateWorkDir(workDirArg);
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  const skillDir = path.resolve(skillDirArg);
  const skillMdPath = path.join(skillDir, 'SKILL.md');

  if (!fs.existsSync(skillDir) || !fs.statSync(skillDir).isDirectory()) {
    return { status: 'error', message: `Skill directory not found: ${skillDir}` };
  }
  if (!fs.existsSync(skillMdPath)) {
    return { status: 'error', message: `SKILL.md not found in: ${skillDir}` };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Phase 1: Parse SKILL.md
  // ═══════════════════════════════════════════════════════════════════════
  let content: string;
  try {
    content = fs.readFileSync(skillMdPath, 'utf-8');
  } catch (err) {
    return { status: 'error', message: `Failed to read SKILL.md: ${(err as Error).message}` };
  }

  let raw;
  try {
    raw = parseRawSkillMd(content, skillMdPath);
  } catch (err) {
    return { status: 'error', message: `Parse error: ${(err as Error).message}` };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Phase 2: Build SkIR
  // ═══════════════════════════════════════════════════════════════════════
  let ir: SkillIR;
  try {
    ir = buildSkIR(raw);
  } catch (err) {
    return { status: 'error', message: `IR build error: ${(err as Error).message}` };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Phase 3: Inject Anti-Skill Constraints
  // ═══════════════════════════════════════════════════════════════════════
  ir = inject(ir);

  // Check for blocking violations (error/critical)
  const criticals = getViolationsByLevel(ir, 'critical');
  const errors = getViolationsByLevel(ir, 'error');
  const warnings = getViolationsByLevel(ir, 'warning');

  if (criticals.length > 0 || errors.length > 0) {
    const violations = [...criticals, ...errors].map(v => ({
      rule: 'anti-skill',
      level: v.level,
      detail: v.content,
      found_in: 'procedure text',
    }));

    return {
      status: 'error',
      message: `Compilation blocked: ${violations.length} violation(s) require resolution` +
        (criticals.length > 0 ? ' (includes HITL-required critical violations)' : ''),
      data: { violations },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Phase 4: Validate SkIR Schema
  // ═══════════════════════════════════════════════════════════════════════
  const checks = validateSkIR(ir);
  if (hasBlockingViolations(checks)) {
    const failed = checks.filter(c => !c.passed);
    return {
      status: 'error',
      message: `IR validation failed: ${failed.map(c => `${c.name}: ${c.detail}`).join('; ')}`,
      data: { checks: failed },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Phase 5: Emit Platform Artifacts
  // ═══════════════════════════════════════════════════════════════════════
  const emitted: string[] = [];
  const ctxDir = path.join(workDir, '_ctx');
  fs.mkdirSync(ctxDir, { recursive: true });

  // Claude XML: emitted when no target filter (always) or --target claude
  if (!targetFilter || targetFilter === 'claude') {
    const claudeEmitter = new ClaudeXmlEmitter();
    const xmlContent = claudeEmitter.emit(ir);
    fs.writeFileSync(path.join(ctxDir, 'skill.claude.xml'), xmlContent, 'utf-8');
    emitted.push('skill.claude.xml');
  }

  // Generic Markdown: emitted when no target filter (always) or --target generic
  if (!targetFilter || targetFilter === 'generic') {
    const genericEmitter = new GenericMarkdownEmitter();
    const mdContent = genericEmitter.emit(ir);
    fs.writeFileSync(path.join(ctxDir, 'skill.generic.md'), mdContent, 'utf-8');
    emitted.push('skill.generic.md');
  }

  // Write skir.json
  fs.writeFileSync(
    path.join(ctxDir, 'skir.json'),
    JSON.stringify(ir, null, 2),
    'utf-8',
  );

  // Compute source hash from raw content
  const sourceHash = crypto.createHash('sha256')
    .update(content)
    .digest('hex');

  const compileData: CompileData = {
    skir_path: '_ctx/skir.json',
    emitted,
    constraints_injected: ir.anti_skill_constraints.length,
    security_level: ir.security_level,
    source_hash: sourceHash,
    compiled_at: new Date().toISOString(),
  };

  if (warnings.length > 0) {
    compileData.warnings = warnings.map(w => ({
      rule: 'anti-skill',
      detail: w.content,
    }));
  }

  return { status: 'ok', data: compileData };
}
