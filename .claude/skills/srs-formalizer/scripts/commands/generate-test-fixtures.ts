/**
 * generate-test-fixtures.ts -- 从源产物生成测试夹具文件
 *
 * CLI: npx tsx index.ts generate-test-fixtures --level <level> --framework <fw> [--workdir <dir>] [--source <src>]
 *
 * 读取 BDD/TLA+/Lean 源文件 → 调用 fixture-gen 生成器 →
 * 写入 test_fixtures/<level>/<framework>/。
 *
 * level→source auto 映射: acceptance→bdd, integration→tla, unit→bdd, property→lean
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliResult } from '../types/index.js';
import type { Framework, FixtureLevel, FixtureSource, FixtureFile } from '../lib/fixture-gen/types.js';
import { generateBddFixtures } from '../lib/fixture-gen/bdd.js';
import { generateTlaFixtures } from '../lib/fixture-gen/tla.js';
import { generateLeanFixtures } from '../lib/fixture-gen/lean.js';
import { safeParseArg, validateWorkDir, assertSafePath } from '../lib/cli.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_LEVELS: readonly FixtureLevel[] = ['acceptance', 'integration', 'unit', 'property'];
const VALID_FRAMEWORKS: readonly Framework[] = ['cucumber', 'playwright', 'pytest', 'junit', 'fast-check'];
const VALID_SOURCES: readonly FixtureSource[] = ['bdd', 'tla', 'lean', 'auto'];

const LEVEL_SOURCE_MAP: Record<FixtureLevel, Exclude<FixtureSource, 'auto'>> = {
  acceptance: 'bdd',
  integration: 'tla',
  unit: 'bdd',
  property: 'lean',
};

const SOURCE_DIR_MAP: Record<Exclude<FixtureSource, 'auto'>, string[]> = {
  bdd: ['4_bdd', 'features'],
  tla: ['5_formal', 'specs'],
  lean: ['5_formal', 'proofs'],
};

const TLA_LEAN_FRAMEWORKS: readonly Framework[] = ['pytest', 'junit', 'fast-check'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isValidEnum<T extends string>(value: string, valid: readonly T[]): value is T {
  return (valid as readonly string[]).includes(value);
}

function collectSourceFiles(workDir: string, source: Exclude<FixtureSource, 'auto'>): string[] {
  const segments = SOURCE_DIR_MAP[source];
  const dir = path.join(workDir, ...segments);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => {
      if (source === 'bdd') return f.endsWith('.feature');
      if (source === 'tla') return f.endsWith('.tla');
      return f.endsWith('.lean');
    })
    .sort()
    .map(f => path.join(dir, f));
}

function generateFixturesFromSource(
  source: Exclude<FixtureSource, 'auto'>,
  fileContent: string,
  moduleName: string,
  framework: Framework,
): FixtureFile[] {
  switch (source) {
    case 'bdd': return generateBddFixtures(fileContent, moduleName, framework);
    case 'tla': return generateTlaFixtures(fileContent, framework);
    case 'lean': return generateLeanFixtures(fileContent, framework);
  }
}

function writeFixtureFiles(
  workDir: string,
  level: FixtureLevel,
  framework: Framework,
  files: FixtureFile[],
): string[] {
  const outputDir = path.join(workDir, 'test_fixtures', level, framework);
  assertSafePath(outputDir, workDir);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const written: string[] = [];
  for (const file of files) {
    const filePath = path.join(outputDir, file.path);
    const fileDir = path.dirname(filePath);
    if (!fs.existsSync(fileDir)) {
      fs.mkdirSync(fileDir, { recursive: true });
    }
    assertSafePath(filePath, outputDir);
    fs.writeFileSync(filePath, file.content, 'utf-8');
    written.push(file.path);
  }
  return written;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function main(args: string[]): Promise<CliResult> {
  let levelArg: string | null;
  let frameworkArg: string | null;
  let sourceArg: string | null;
  let workDirArg: string | null;

  try {
    levelArg = safeParseArg(args, '--level');
    frameworkArg = safeParseArg(args, '--framework');
    sourceArg = safeParseArg(args, '--source');
    workDirArg = safeParseArg(args, '--workdir');
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  if (!levelArg) {
    return { status: 'error', message: 'Missing required argument: --level (acceptance|integration|unit|property)' };
  }
  if (!frameworkArg) {
    return { status: 'error', message: 'Missing required argument: --framework (cucumber|playwright|pytest|junit|fast-check)' };
  }

  if (!isValidEnum(levelArg, VALID_LEVELS)) {
    return { status: 'error', message: `Invalid --level "${levelArg}". Must be one of: ${VALID_LEVELS.join(', ')}` };
  }
  if (!isValidEnum(frameworkArg, VALID_FRAMEWORKS)) {
    return { status: 'error', message: `Invalid --framework "${frameworkArg}". Must be one of: ${VALID_FRAMEWORKS.join(', ')}` };
  }
  if (sourceArg && !isValidEnum(sourceArg, VALID_SOURCES)) {
    return { status: 'error', message: `Invalid --source "${sourceArg}". Must be one of: ${VALID_SOURCES.join(', ')}` };
  }

  const workDirCandidate = workDirArg ?? process.cwd();
  let workDir: string;
  try {
    workDir = validateWorkDir(workDirCandidate);
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  const level = levelArg as FixtureLevel;
  const framework = frameworkArg as Framework;
  const source: Exclude<FixtureSource, 'auto'> = sourceArg && sourceArg !== 'auto'
    ? sourceArg as Exclude<FixtureSource, 'auto'>
    : LEVEL_SOURCE_MAP[level];

  const compatibleFrameworks = (source === 'bdd') ? VALID_FRAMEWORKS : TLA_LEAN_FRAMEWORKS;
  if (!isValidEnum(framework, compatibleFrameworks)) {
    return {
      status: 'error',
      message: `Framework "${framework}" is not compatible with source "${source}" (derived from level "${level}"). Compatible: ${compatibleFrameworks.join(', ')}`,
    };
  }

  const sourceFiles = collectSourceFiles(workDir, source);
  if (sourceFiles.length === 0) {
    const dir = path.join(workDir, ...SOURCE_DIR_MAP[source]);
    return { status: 'error', message: `No ${source} source files found in ${dir}` };
  }

  const allWritten: string[] = [];
  const sourceFilesUsed: string[] = [];

  for (const filePath of sourceFiles) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const moduleName = path.basename(filePath, path.extname(filePath));

    let fixtures: FixtureFile[];
    try {
      fixtures = generateFixturesFromSource(source, content, moduleName, framework);
    } catch (err) {
      return { status: 'error', message: `Generation failed for ${path.basename(filePath)}: ${(err as Error).message}` };
    }

    const written = writeFixtureFiles(workDir, level, framework, fixtures);
    allWritten.push(...written);
    sourceFilesUsed.push(path.basename(filePath));
  }

  return {
    status: 'ok',
    data: {
      files_created: allWritten.length,
      output_dir: path.join('test_fixtures', level, framework),
      source_files_used: sourceFilesUsed,
      files: allWritten,
    },
  };
}

// Guard: refuse direct invocation (must go through index.ts)
import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
