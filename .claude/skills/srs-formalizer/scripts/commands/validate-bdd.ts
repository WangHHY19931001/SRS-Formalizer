/**
 * validate-bdd.ts -- 校验 Gherkin BDD 文件 (SRS §5.12)
 *
 * CLI: npx tsx index.ts validate-bdd --workdir .srs_formalizer
 *
 * 遍历 features/ 下所有 .feature 文件，调用 lib/bdd.ts 的 validateFeature
 * 逐文件校验并汇总结果。
 *
 * 输出格式: {"status":"ok","data":{"valid":true/false,"errors":[...],"warnings":[...]}}
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliResult } from '../types/index.js';
import { validateFeature, type BddValidationResult } from '../lib/bdd.js';
import { safeParseArg, validateWorkDir } from '../lib/cli.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface FeatureValidationResult {
  file: string;
  result: BddValidationResult;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function main(args: string[]): Promise<CliResult> {
  let workDirArg: string | null;
  try {
    workDirArg = safeParseArg(args, '--workdir');
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

  // If features/ doesn't exist, return empty success
  if (!fs.existsSync(featuresDir)) {
    return {
      status: 'ok',
      data: {
        valid: true,
        errors: [],
        warnings: [],
        files_checked: 0,
        file_results: [],
      },
    };
  }

  // Collect all .feature files, sorted for determinism
  let featureFiles: string[];
  try {
    featureFiles = fs.readdirSync(featuresDir)
      .filter(f => f.endsWith('.feature'))
      .sort();
  } catch (err) {
    return { status: 'ok', data: { valid: true, errors: [], warnings: [`Failed to read features dir: ${(err as Error).message}`], files_checked: 0, file_results: [] } };
  }

  // Validate each file
  const fileResults: FeatureValidationResult[] = [];
  let globalValid = true;
  const globalErrors: string[] = [];
  const globalWarnings: string[] = [];

  for (const fileName of featureFiles) {
    const filePath = path.join(featuresDir, fileName);
    const content = fs.readFileSync(filePath, 'utf-8');
    const result = validateFeature(content);

    fileResults.push({ file: fileName, result });

    if (!result.valid) {
      globalValid = false;
      for (const err of result.errors) {
        globalErrors.push(`[${fileName}] ${err}`);
      }
    }

    for (const warn of result.warnings) {
      globalWarnings.push(`[${fileName}] ${warn}`);
    }
  }

  return {
    status: 'ok',
    data: {
      valid: globalValid,
      errors: globalErrors,
      warnings: globalWarnings,
      files_checked: featureFiles.length,
      file_results: fileResults,
    },
  };
}

// Guard: refuse direct invocation (must go through index.ts)
import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
