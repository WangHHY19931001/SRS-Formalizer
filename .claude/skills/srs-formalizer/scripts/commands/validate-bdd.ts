/**
 * validate-bdd.ts -- 四级 BDD 校验 (SRS §5.12)
 *
 * CLI: npx tsx index.ts validate-bdd --workdir .srs_formalizer [--strict]
 *
 * Phase 1 (TS basic): Feature/Scenario/Given/When/Then 结构 + placeholder + LLM_FILL 残留
 * Phase 2 (TS NFR): 阈值数值正则、认证前置、Feature 文件名规范
 * Phase 3 (gherkin-lint): 通过 execSync 调用
 * Phase 4 (Gherklin): 通过 execSync 调用
 *
 * --strict: 启用全部四级，任一失败即打回 (exit 1)
 * 默认: 仅 Phase 1
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliResult } from '../types/index.js';
import { safeParseArg, validateWorkDir } from '../lib/cli.js';
import {
  validateFeatureBasic,
  validateFeatureNFR,
  type BddValidationResult,
} from '../lib/bdd-validator.js';
import { runGherkinLint, runGherklin, type ToolResult } from '../lib/bdd-tool-runner.js';

interface FileResult {
  file: string;
  phases: {
    phase1: BddValidationResult;
    phase2?: BddValidationResult;
  };
}

function collectPhaseErrors(fileResults: FileResult[], phase: 'phase1' | 'phase2'): string[] {
  const out: string[] = [];
  for (const fr of fileResults) {
    const result = fr.phases[phase];
    if (!result) continue;
    for (const err of result.errors) {
      out.push(`[${fr.file}] ${err}`);
    }
  }
  return out;
}

function collectPhaseWarnings(fileResults: FileResult[], phase: 'phase1' | 'phase2'): string[] {
  const out: string[] = [];
  for (const fr of fileResults) {
    const result = fr.phases[phase];
    if (!result) continue;
    for (const warn of result.warnings) {
      out.push(`[${fr.file}] ${warn}`);
    }
  }
  return out;
}

export async function main(args: string[]): Promise<CliResult> {
  let workDirArg: string | null;
  let strict: boolean;
  try {
    workDirArg = safeParseArg(args, '--workdir');
    strict = args.includes('--strict');
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  if (!workDirArg) {
    return { status: 'error', message: 'Missing required argument: --workdir' };
  }

  let workDir: string;
  try {
    workDir = validateWorkDir(workDirArg);
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  const featuresDir = path.join(workDir, '4_bdd', 'features');

  if (!fs.existsSync(featuresDir)) {
    return {
      status: 'ok',
      data: {
        valid: true,
        errors: [],
        warnings: [],
        files_checked: 0,
        phases: {},
        file_results: [],
      },
    };
  }

  let featureFiles: string[];
  try {
    featureFiles = fs.readdirSync(featuresDir)
      .filter(f => f.endsWith('.feature'))
      .sort();
  } catch (err) {
    return {
      status: 'ok',
      data: {
        valid: true,
        errors: [],
        warnings: [`Failed to read features dir: ${(err as Error).message}`],
        files_checked: 0,
        phases: {},
        file_results: [],
      },
    };
  }

  const fileResults: FileResult[] = [];
  let phase1Valid = true;
  let phase2Valid = true;
  let phase3Result: ToolResult | undefined;
  let phase4Result: ToolResult | undefined;

  for (const fileName of featureFiles) {
    const filePath = path.join(featuresDir, fileName);
    const content = fs.readFileSync(filePath, 'utf-8');

    const p1 = validateFeatureBasic(content);

    let p2: BddValidationResult | undefined;
    if (strict) {
      p2 = validateFeatureNFR(content, fileName);
    }

    fileResults.push({
      file: fileName,
      phases: { phase1: p1, ...(p2 !== undefined ? { phase2: p2 } : {}) },
    });

    if (!p1.valid) phase1Valid = false;
    if (p2 && !p2.valid) phase2Valid = false;
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  errors.push(...collectPhaseErrors(fileResults, 'phase1'));
  warnings.push(...collectPhaseWarnings(fileResults, 'phase1'));

  let phase3Passed: boolean | undefined;
  let phase4Passed: boolean | undefined;

  if (strict) {
    errors.push(...collectPhaseErrors(fileResults, 'phase2'));
    warnings.push(...collectPhaseWarnings(fileResults, 'phase2'));

    phase3Result = runGherkinLint(featuresDir);
    phase3Passed = phase3Result.passed;
    if (!phase3Passed) {
      errors.push(`[gherkin-lint] Phase 3 failed: ${phase3Result.output.slice(0, 500)}`);
    }

    phase4Result = await runGherklin(featuresDir);
    phase4Passed = phase4Result.passed;
    if (!phase4Passed) {
      errors.push(`[gherklin] Phase 4 failed: ${phase4Result.output.slice(0, 500)}`);
    }
  }

  const allValid =
    phase1Valid &&
    (!strict || (phase2Valid && phase3Passed === true && phase4Passed === true));

  return {
    status: 'ok',
    data: {
      valid: allValid,
      errors,
      warnings,
      files_checked: featureFiles.length,
      phases: {
        phase1: { passed: phase1Valid },
        ...(strict ? {
          phase2: { passed: phase2Valid },
          phase3: { passed: phase3Passed, output: phase3Result?.output },
          phase4: { passed: phase4Passed, output: phase4Result?.output },
        } : {}),
      },
      file_results: fileResults,
    },
  };
}

import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
