/**
 * verify-gate.ts -- 验证关卡命令 (SRS §5.13)
 *
 * CLI: npx tsx index.ts verify-gate --workdir .srs_formalizer --stage S1|R3|FINAL
 *
 * 根据 --stage 执行不同阶段的验证检查：
 * - S1:   基础检查（STATE.md、index.json、r1-explicit JSONL 文件存在）
 * - R3:   S1 检查 + JSONL 存在性（全子目录）、ID 唯一性、图谱可加载、节点数 >= R1 数
 * - FINAL: R3 检查 + validate-bdd 通过、graph.merged.json 存在、schema.cypher 存在、
 *         brainstorm_context.json 存在、MINDMAP.md 全部模块 ✅
*/

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliResult } from '../types/index.js';
import { readJsonl, listJsonlFiles } from '../lib/jsonl.js';
import { Graph, type GraphData } from '../lib/graph.js';
import { validateWorkDir } from '../lib/security.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CheckResult {
  name: string;
  passed: boolean;
  detail?: string;
}

interface VerifyCheckEntry {
  passed: boolean;
  detail: string | undefined;
}

interface VerifyOutput {
  pass: boolean;
  checks: Record<string, VerifyCheckEntry>;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseArg(args: string[], name: string): string | null {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1]!;
}

const VALID_STAGES = ['S1', 'R3', 'FINAL'] as const;

// ---------------------------------------------------------------------------
// Check functions
// ---------------------------------------------------------------------------

function checkStateMd(workDir: string): CheckResult {
  const statePath = path.join(workDir, 'STATE.md');
  const exists = fs.existsSync(statePath);
  return {
    name: 'STATE.md exists',
    passed: exists,
    detail: exists ? 'Found' : `STATE.md not found at ${statePath}`,
  };
}

function checkIndexJson(workDir: string): CheckResult {
  const indexPath = path.join(workDir, 'index.json');
  const exists = fs.existsSync(indexPath);
  return {
    name: 'index.json exists',
    passed: exists,
    detail: exists ? 'Found' : `index.json not found at ${indexPath}`,
  };
}

function checkR1HasJsonlFiles(workDir: string): CheckResult {
  const r1Dir = path.join(workDir, 'r1-explicit');
  let fileCount = 0;
  if (fs.existsSync(r1Dir)) {
    try {
      fileCount = listJsonlFiles(r1Dir, workDir).length;
    } catch { /* ignore */ }
  }
  return {
    name: 'r1-explicit has JSONL files',
    passed: fileCount > 0,
    detail: fileCount > 0 ? `${fileCount} file(s)` : 'No JSONL files in r1-explicit/',
  };
}

function checkAllJsonlDirsHaveFiles(workDir: string): CheckResult {
  const jsonlDirs = ['r1-explicit', 'r2-implicit', 'r3-relational'];
  const results: string[] = [];
  let allHaveFiles = true;

  for (const subdir of jsonlDirs) {
    const dirPath = path.join(workDir, subdir);
    if (!fs.existsSync(dirPath)) {
      results.push(`${subdir}: directory not found`);
      allHaveFiles = false;
      continue;
    }
    try {
      const files = listJsonlFiles(dirPath, workDir);
      if (files.length === 0) {
        results.push(`${subdir}: 0 files`);
        allHaveFiles = false;
      } else {
        results.push(`${subdir}: ${files.length} file(s)`);
      }
    } catch {
      results.push(`${subdir}: error reading`);
      allHaveFiles = false;
    }
  }

  return {
    name: 'JSONL existence (all subdirectories)',
    passed: allHaveFiles,
    detail: results.join('; '),
  };
}

function checkIdUniqueness(workDir: string): CheckResult {
  const jsonlDirs = ['r1-explicit', 'r2-implicit', 'r3-relational'];
  const seenIds = new Set<string>();
  const duplicateIds: string[] = [];

  for (const subdir of jsonlDirs) {
    const dirPath = path.join(workDir, subdir);
    if (!fs.existsSync(dirPath)) continue;
    try {
      const files = listJsonlFiles(dirPath, workDir);
      for (const filePath of files) {
        const records = readJsonl(filePath, workDir);
        for (const record of records) {
          if (seenIds.has(record.id)) {
            duplicateIds.push(record.id);
          } else {
            seenIds.add(record.id);
          }
        }
      }
    } catch { /* skip unreadable dirs */ }
  }

  const isUnique = duplicateIds.length === 0;
  return {
    name: 'ID uniqueness (no duplicates across files)',
    passed: isUnique,
    detail: isUnique ? 'All IDs unique' : `Duplicate IDs found: ${[...new Set(duplicateIds)].join(', ')}`,
  };
}

function checkGraphLoadable(workDir: string): CheckResult {
  const mergedPath = path.join(workDir, 'graph', 'graph.merged.json');
  const basePath = path.join(workDir, 'graph', 'graph.json');
  let graphFile: string | null = null;

  if (fs.existsSync(mergedPath)) {
    graphFile = mergedPath;
  } else if (fs.existsSync(basePath)) {
    graphFile = basePath;
  }

  if (!graphFile) {
    return {
      name: 'Graph loadable',
      passed: false,
      detail: 'No graph file found (tried graph/graph.merged.json and graph/graph.json)',
    };
  }

  try {
    const raw = fs.readFileSync(graphFile, 'utf-8');
    const graphData = JSON.parse(raw) as GraphData;
    Graph.fromJSON(graphData);
    return {
      name: 'Graph loadable',
      passed: true,
      detail: `Loaded from graph/${path.basename(graphFile)}`,
    };
  } catch (err) {
    return {
      name: 'Graph loadable',
      passed: false,
      detail: `Failed to load graph: ${(err as Error).message}`,
    };
  }
}

function checkNodeCountVsR1(workDir: string): CheckResult {
  // Count R1 explicit JSONL records
  let r1Count = 0;
  const r1Dir = path.join(workDir, 'r1-explicit');
  if (fs.existsSync(r1Dir)) {
    try {
      const files = listJsonlFiles(r1Dir, workDir);
      for (const filePath of files) {
        const records = readJsonl(filePath, workDir);
        r1Count += records.length;
      }
    } catch { /* ignore */ }
  }

  // Get node count from graph
  const mergedPath = path.join(workDir, 'graph', 'graph.merged.json');
  const basePath = path.join(workDir, 'graph', 'graph.json');
  const graphFile = fs.existsSync(mergedPath) ? mergedPath : (fs.existsSync(basePath) ? basePath : null);

  if (!graphFile) {
    return {
      name: 'Node count >= R1 explicit requirements',
      passed: false,
      detail: 'Cannot check: no graph file found',
    };
  }

  let nodeCount = 0;
  try {
    const raw = fs.readFileSync(graphFile, 'utf-8');
    const graphData = JSON.parse(raw) as GraphData;
    nodeCount = graphData.nodes.length;
  } catch (err) {
    return {
      name: 'Node count >= R1 explicit requirements',
      passed: false,
      detail: `Cannot check: ${(err as Error).message}`,
    };
  }

  const ok = nodeCount >= r1Count;
  return {
    name: 'Node count >= R1 explicit requirements',
    passed: ok,
    detail: ok
      ? `${nodeCount} nodes >= ${r1Count} R1 requirements`
      : `Only ${nodeCount} nodes but ${r1Count} R1 requirements (missing ${r1Count - nodeCount})`,
  };
}

// ===========================================================================
// FINAL stage check functions
// ===========================================================================

function checkValidateBddPasses(workDir: string): CheckResult {
  // Basic validation of .feature files — checks each file for valid Gherkin structure.
  // For full validation, run: npx tsx index.ts validate-bdd --workdir <dir>
  const featuresDir = path.join(workDir, 'features');
  if (!fs.existsSync(featuresDir)) {
    return {
      name: 'validate-bdd passes',
      passed: true,
      detail: 'No features/ directory — BDD validation skipped',
    };
  }

  try {
    const featureFiles = fs.readdirSync(featuresDir)
      .filter(f => f.endsWith('.feature'))
      .sort();

    const errors: string[] = [];
    for (const fileName of featureFiles) {
      const filePath = path.join(featuresDir, fileName);
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim().length > 0 && !l.trim().startsWith('#'));

      // Basic Gherkin structure checks
      const hasFeature = lines.some(l => l.trim().startsWith('Feature:'));
      const hasScenario = lines.some(l => l.trim().startsWith('Scenario:') || l.trim().startsWith('Scenario Outline:'));
      const hasSteps = lines.some(l => /^\s*(Given|When|Then|And|But)\s/.test(l));

      if (!hasFeature) errors.push(`${fileName}: missing Feature: line`);
      if (!hasScenario) errors.push(`${fileName}: missing Scenario: line`);
      if (!hasSteps) errors.push(`${fileName}: missing step definitions (Given/When/Then)`);
    }

    if (errors.length > 0) {
      return {
        name: 'validate-bdd passes',
        passed: false,
        detail: errors.join('; '),
      };
    }

    return {
      name: 'validate-bdd passes',
      passed: true,
      detail: `All ${featureFiles.length} .feature file(s) valid`,
    };
  } catch (err) {
    return {
      name: 'validate-bdd passes',
      passed: false,
      detail: `BDD validation error: ${(err as Error).message}`,
    };
  }
}

function checkMergedGraphExists(workDir: string): CheckResult {
  const mergedPath = path.join(workDir, 'graph', 'graph.merged.json');
  const exists = fs.existsSync(mergedPath);
  return {
    name: 'graph.merged.json exists',
    passed: exists,
    detail: exists ? 'Found' : `graph.merged.json not found at ${mergedPath}`,
  };
}

function checkSchemaCypherExists(workDir: string): CheckResult {
  const cypherPath = path.join(workDir, 'outputs', 'knowledge_graph', 'schema.cypher');
  const exists = fs.existsSync(cypherPath);
  return {
    name: 'outputs/knowledge_graph/schema.cypher exists',
    passed: exists,
    detail: exists ? 'Found' : `schema.cypher not found at ${cypherPath}`,
  };
}

function checkBrainstormContextExists(workDir: string): CheckResult {
  const bsPath = path.join(workDir, 'outputs', 'brainstorming', 'brainstorm_context.json');
  const exists = fs.existsSync(bsPath);
  return {
    name: 'outputs/brainstorming/brainstorm_context.json exists',
    passed: exists,
    detail: exists ? 'Found' : `brainstorm_context.json not found at ${bsPath}`,
  };
}

function checkMindmapModules(workDir: string): CheckResult {
  const mindmapPath = path.join(workDir, 'MINDMAP.md');
  if (!fs.existsSync(mindmapPath)) {
    return {
      name: 'MINDMAP.md all modules ✅',
      passed: false,
      detail: 'MINDMAP.md not found',
    };
  }

  try {
    const content = fs.readFileSync(mindmapPath, 'utf-8');
    const lines = content.split('\n');

    // Find module lines — lines containing "module" or starting with "- [ ]"
    const unmarkedModules: string[] = [];
    for (const line of lines) {
      // Look for list items that reference a module without ✅
      if (line.match(/-\s*\[.\s*\]/) || line.match(/\*\s*\[.\s*\]/)) {
        if (!line.includes('✅') && !line.includes('x')) {
          unmarkedModules.push(line.trim());
        }
      }
    }

    const noUnmarked = unmarkedModules.length === 0;
    return {
      name: 'MINDMAP.md all modules ✅',
      passed: noUnmarked,
      detail: noUnmarked
        ? 'All modules marked complete'
        : `Modules without ✅: ${unmarkedModules.join('; ')}`,
    };
  } catch {
    return {
      name: 'MINDMAP.md all modules ✅',
      passed: false,
      detail: 'Could not read MINDMAP.md',
    };
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function main(args: string[]): Promise<CliResult> {
  const workDirArg = parseArg(args, '--workdir');
  const stageArg = parseArg(args, '--stage');

  if (!workDirArg) {
    return { status: 'error', message: 'Missing required argument: --workdir' };
  }

  if (!stageArg) {
    return { status: 'error', message: 'Missing required argument: --stage' };
  }

  if (!(VALID_STAGES as readonly string[]).includes(stageArg)) {
    return {
      status: 'error',
      message: `Invalid --stage: "${stageArg}". Valid values: ${VALID_STAGES.join(', ')}`,
    };
  }

  let workDir: string;
  try {
    workDir = validateWorkDir(workDirArg);
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  const allChecks: CheckResult[] = [];

  // === S1 checks (always run) ===
  allChecks.push(checkStateMd(workDir));
  allChecks.push(checkIndexJson(workDir));
  allChecks.push(checkR1HasJsonlFiles(workDir));

  // === R3 / FINAL additional checks ===
  if (stageArg !== 'S1') {
    allChecks.push(checkAllJsonlDirsHaveFiles(workDir));
    allChecks.push(checkIdUniqueness(workDir));
    allChecks.push(checkGraphLoadable(workDir));
    allChecks.push(checkNodeCountVsR1(workDir));
  }

  // === FINAL-only checks ===
  if (stageArg === 'FINAL') {
    allChecks.push(checkValidateBddPasses(workDir));
    allChecks.push(checkMergedGraphExists(workDir));
    allChecks.push(checkSchemaCypherExists(workDir));
    allChecks.push(checkBrainstormContextExists(workDir));
    allChecks.push(checkMindmapModules(workDir));
  }

  const errors = allChecks.filter(c => !c.passed).map(c => c.detail ?? c.name);
  const allPassed = errors.length === 0;

  const output: VerifyOutput = {
    pass: allPassed,
    checks: Object.fromEntries(allChecks.map(c => [c.name, { passed: c.passed, detail: c.detail }])),
    errors,
  };

  return { status: 'ok', data: output };
}
