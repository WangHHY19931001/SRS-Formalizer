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
import { safeParseArg, validateWorkDir } from '../lib/cli.js';

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

function checkShardIndex(workDir: string): CheckResult {
  const indexPath = path.join(workDir, '_ctx', 'shard_index.json');
  const exists = fs.existsSync(indexPath);
  return {
    name: '_ctx/shard_index.json exists',
    passed: exists,
    detail: exists ? 'Found' : `shard_index.json not found at ${indexPath}`,
  };
}

function checkR1HasJsonlFiles(workDir: string): CheckResult {
  const r1Dir = path.join(workDir, '2_extract', 'r1-explicit');
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
  const jsonlDirs = ['2_extract/r1-explicit', '2_extract/r2-implicit', '2_extract/r3-relational'];
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
  const jsonlDirs = ['2_extract/r1-explicit', '2_extract/r2-implicit', '2_extract/r3-relational'];
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
  const mergedPath = path.join(workDir, '3_graph', 'graph', 'graph.merged.json');
  const basePath = path.join(workDir, '3_graph', 'graph', 'graph.json');
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
  const r1Dir = path.join(workDir, '2_extract', 'r1-explicit');
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
  const mergedPath = path.join(workDir, '3_graph', 'graph', 'graph.merged.json');
  const basePath = path.join(workDir, '3_graph', 'graph', 'graph.json');
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
  const featuresDir = path.join(workDir, '4_bdd', 'features');
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
  const mergedPath = path.join(workDir, '3_graph', 'graph', 'graph.merged.json');
  const exists = fs.existsSync(mergedPath);
  return {
    name: 'graph.merged.json exists',
    passed: exists,
    detail: exists ? 'Found' : `graph.merged.json not found at ${mergedPath}`,
  };
}

function checkSchemaCypherExists(workDir: string): CheckResult {
  const cypherPath = path.join(workDir, '6_outputs', 'knowledge_graph', 'schema.cypher');
  const exists = fs.existsSync(cypherPath);
  return {
    name: 'outputs/knowledge_graph/schema.cypher exists',
    passed: exists,
    detail: exists ? 'Found' : `schema.cypher not found at ${cypherPath}`,
  };
}

function checkBrainstormContextExists(workDir: string): CheckResult {
  const bsPath = path.join(workDir, '6_outputs', 'brainstorming', 'brainstorm_context.json');
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

/** 读取 CHECKLIST.md 并验证所有 checkbox 已打勾 */
function checkChecklistComplete(stageDir: string, workDir: string): CheckResult {
  try {
    const checklistPath = path.join(workDir, stageDir, 'CHECKLIST.md');
    if (!fs.existsSync(checklistPath)) {
      return {
        name: `${stageDir}/CHECKLIST.md complete`,
        passed: false,
        detail: `CHECKLIST.md not found in ${stageDir}/`,
      };
    }
    const content = fs.readFileSync(checklistPath, 'utf-8');
    const lines = content.split('\n');
    let total = 0;
    let checked = 0;
    const unchecked: string[] = [];
    for (const line of lines) {
      if (line.match(/^-\s*\[x\]/i)) { total++; checked++; }
      else if (line.match(/^-\s*\[\s*\]/)) {
        total++;
        unchecked.push(line.replace(/^-\s*\[\s*\]\s*/, '').trim().substring(0, 80));
      }
    }
    const allChecked = total > 0 && unchecked.length === 0;
    return {
      name: `${stageDir}/CHECKLIST.md complete`,
      passed: allChecked,
      detail: allChecked
        ? `All ${total}/${total} checked`
        : `${checked}/${total} checked, ${unchecked.length} unchecked: ${unchecked.slice(0, 3).join('; ')}${unchecked.length > 3 ? '...' : ''}`,
    };
  } catch {
    return { name: `${stageDir}/CHECKLIST.md complete`, passed: false, detail: 'Could not read CHECKLIST.md' };
  }
}

/** S1: 验证 shard_index.json 中每个分片的 source_path 实际存在 */
function checkShardCompleteness(workDir: string): CheckResult {
  try {
    const indexPath = path.join(workDir, '_ctx', 'shard_index.json');
    if (!fs.existsSync(indexPath)) {
      return { name: 'Shard completeness', passed: false, detail: 'shard_index.json not found' };
    }
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    const shards = index.shards || [];
    const missingSources: string[] = [];
    const seenSources = new Set<string>();

    for (const shard of shards) {
      const key = shard.source_path;
      if (seenSources.has(key)) continue;
      seenSources.add(key);
      if (!fs.existsSync(shard.source_path)) {
        missingSources.push(shard.source_path);
      }
    }

    return {
      name: 'Shard completeness',
      passed: missingSources.length === 0,
      detail: missingSources.length === 0
        ? `All ${shards.length} shards reference existing source files`
        : `Missing source files: ${missingSources.slice(0, 3).join(', ')}`,
    };
  } catch {
    return { name: 'Shard completeness', passed: false, detail: 'Could not verify shards' };
  }
}

function checkGlossaryExists(workDir: string): CheckResult {
  const glossaryMd = path.join(workDir, 'GLOSSARY.md');
  const ctxDir = path.join(workDir, '_ctx');
  const batchFiles = fs.existsSync(ctxDir)
    ? fs.readdirSync(ctxDir).filter(f => /^glossary-B\d{2}\.json$/.test(f))
    : [];

  if (fs.existsSync(glossaryMd)) {
    return { name: 'GLOSSARY.md exists', passed: true, detail: 'Found (merged output)' };
  }
  if (batchFiles.length > 0) {
    return {
      name: 'GLOSSARY.md exists',
      passed: false,
      detail: `Not merged — ${batchFiles.length} batch file(s) in _ctx/ awaiting merge`,
    };
  }
  return { name: 'GLOSSARY.md exists', passed: false, detail: 'Not found — run S1 step 4 glossary extraction' };
}

function checkBehaviorGraphExists(workDir: string): CheckResult {
  const graphPath = path.join(workDir, '4_bdd', 'behavior-graph.json');
  const cypherPath = path.join(workDir, '6_outputs', 'knowledge_graph', 'behavior.cypher');
  const hasGraph = fs.existsSync(graphPath);
  const hasCypher = fs.existsSync(cypherPath);

  if (hasGraph && hasCypher) {
    try {
      const g = JSON.parse(fs.readFileSync(graphPath, 'utf-8'));
      const nodes = g.nodes?.length ?? 0;
      const edges = g.edges?.length ?? 0;
      return { name: 'Behavior graph exists', passed: true, detail: `${nodes} nodes, ${edges} edges` };
    } catch {
      return { name: 'Behavior graph exists', passed: false, detail: 'Corrupt JSON' };
    }
  }
  const missing = [!hasGraph && 'behavior-graph.json', !hasCypher && 'behavior.cypher'].filter(Boolean);
  return { name: 'Behavior graph exists', passed: false, detail: `Missing: ${missing.join(', ')}` };
}

function checkTlaGraphExists(workDir: string): CheckResult {
  const graphPath = path.join(workDir, '5_formal', 'tla-interaction-graph.json');
  const cypherPath = path.join(workDir, '6_outputs', 'knowledge_graph', 'tla-interaction.cypher');
  const specsDir = path.join(workDir, '5_formal', 'specs');
  const hasTlaSpecs = fs.existsSync(specsDir) && fs.readdirSync(specsDir).some(f => f.endsWith('.tla'));

  if (!hasTlaSpecs) {
    return { name: 'TLA interaction graph exists', passed: true, detail: 'N/A (TLA+ not triggered)' };
  }

  const hasGraph = fs.existsSync(graphPath);
  const hasCypher = fs.existsSync(cypherPath);
  if (hasGraph && hasCypher) {
    try {
      const g = JSON.parse(fs.readFileSync(graphPath, 'utf-8'));
      const nodes = g.nodes?.length ?? 0;
      const edges = g.edges?.length ?? 0;
      const depth = g.metadata?.max_hierarchy_depth ?? 0;
      return { name: 'TLA interaction graph exists', passed: true, detail: `${nodes} nodes, ${edges} edges, depth ${depth}` };
    } catch {
      return { name: 'TLA interaction graph exists', passed: false, detail: 'Corrupt JSON' };
    }
  }
  const missing = [!hasGraph && 'tla-interaction-graph.json', !hasCypher && 'tla-interaction.cypher'].filter(Boolean);
  return { name: 'TLA interaction graph exists', passed: false, detail: `Missing: ${missing.join(', ')}` };
}

function checkLeanGraphExists(workDir: string): CheckResult {
  const graphPath = path.join(workDir, '5_formal', 'lean-proof-graph.json');
  const cypherPath = path.join(workDir, '6_outputs', 'knowledge_graph', 'lean-proof.cypher');
  const proofsDir = path.join(workDir, '5_formal', 'proofs');
  const hasLeanProofs = fs.existsSync(proofsDir) && fs.readdirSync(proofsDir).some(f => f.endsWith('.lean'));

  if (!hasLeanProofs) {
    return { name: 'Lean proof graph exists', passed: true, detail: 'N/A (Lean 4 not triggered)' };
  }

  const hasGraph = fs.existsSync(graphPath);
  const hasCypher = fs.existsSync(cypherPath);
  if (hasGraph && hasCypher) {
    try {
      const g = JSON.parse(fs.readFileSync(graphPath, 'utf-8'));
      const nodes = g.nodes?.length ?? 0;
      const edges = g.edges?.length ?? 0;
      const depth = g.metadata?.max_proof_depth ?? 0;
      const axiomWarn = g.metadata?.axiom_count > 0 ? ` ⚠ ${g.metadata.axiom_count} axioms` : '';
      return { name: 'Lean proof graph exists', passed: true, detail: `${nodes} nodes, ${edges} edges, depth ${depth}${axiomWarn}` };
    } catch {
      return { name: 'Lean proof graph exists', passed: false, detail: 'Corrupt JSON' };
    }
  }
  const missing = [!hasGraph && 'lean-proof-graph.json', !hasCypher && 'lean-proof.cypher'].filter(Boolean);
  return { name: 'Lean proof graph exists', passed: false, detail: `Missing: ${missing.join(', ')}` };
}

function checkSystemArchitectureExists(workDir: string): CheckResult {
  const graphPath = path.join(workDir, '6_outputs', 'system-architecture.json');
  if (!fs.existsSync(graphPath)) {
    return { name: 'System architecture graph exists', passed: false, detail: 'Not found — run build-system-architecture' };
  }
  try {
    const g = JSON.parse(fs.readFileSync(graphPath, 'utf-8'));
    const nodes = g.nodes?.length ?? 0;
    const edges = g.edges?.length ?? 0;
    const cross = g.metadata?.total_cross_edges ?? 0;
    const converged = g.consistency ? g.consistency.filter((c: {passed: boolean; severity: string}) => c.severity === 'error' && !c.passed).length === 0 : false;
    return {
      name: 'System architecture graph exists',
      passed: converged,
      detail: `${nodes} nodes, ${edges} edges, ${cross} cross-layer${converged ? ' ✓ converged' : ' ✗ not converged'}`,
    };
  } catch {
    return { name: 'System architecture graph exists', passed: false, detail: 'Corrupt JSON' };
  }
}

/** R3: 验证架构 JSONL 文件存在且非空 */
function checkArchitectureExists(workDir: string): CheckResult {
  try {
    const archDir = path.join(workDir, '2_extract', 'architecture');
    if (!fs.existsSync(archDir)) {
      return { name: 'Architecture JSONL exists', passed: false, detail: 'architecture/ directory not found' };
    }
    const files = fs.readdirSync(archDir).filter(f => f.endsWith('.jsonl'));
    if (files.length === 0) {
      return { name: 'Architecture JSONL exists', passed: false, detail: 'No architecture JSONL files' };
    }
    const empty: string[] = [];
    for (const f of files) {
      const stat = fs.statSync(path.join(archDir, f));
      if (stat.size === 0) empty.push(f);
    }
    return {
      name: 'Architecture JSONL exists',
      passed: true,
      detail: `${files.length} file(s)${empty.length > 0 ? ` (empty: ${empty.join(',')})` : ''}`,
    };
  } catch {
    return { name: 'Architecture JSONL exists', passed: false, detail: 'Could not check architecture' };
  }
}

/** R3: 验证图谱中每条边的 source 和 target 节点存在 */
function checkGraphEdgeIntegrity(workDir: string): CheckResult {
  try {
    const graphPaths = [
      path.join(workDir, '3_graph', 'graph', 'graph.merged.json'),
      path.join(workDir, '3_graph', 'graph', 'graph.structure_fixed.json'),
      path.join(workDir, '3_graph', 'graph', 'graph.json'),
    ];
    let graphData: { nodes: {id:string}[], edges: {id:string,source:string,target:string,type:string}[] } | null = null;
    for (const gp of graphPaths) {
      if (fs.existsSync(gp)) {
        graphData = JSON.parse(fs.readFileSync(gp, 'utf-8'));
        break;
      }
    }
    if (!graphData) {
      return { name: 'Graph edge integrity', passed: false, detail: 'No graph file found' };
    }
    const nodeIds = new Set(graphData.nodes.map(n => n.id));
    const danglingEdges: string[] = [];
    for (const e of graphData.edges) {
      if (!nodeIds.has(e.source)) danglingEdges.push(`${e.id}: source "${e.source}" not found`);
      if (!nodeIds.has(e.target)) danglingEdges.push(`${e.id}: target "${e.target}" not found`);
    }
    return {
      name: 'Graph edge integrity',
      passed: danglingEdges.length === 0,
      detail: danglingEdges.length === 0
        ? `All ${graphData.edges.length} edges reference existing nodes`
        : danglingEdges.slice(0, 5).join('; '),
    };
  } catch {
    return { name: 'Graph edge integrity', passed: false, detail: 'Could not verify edges' };
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function main(args: string[]): Promise<CliResult> {
  let workDirArg: string | null;
  let stageArg: string | null;
  try {
    workDirArg = safeParseArg(args, '--workdir');
    stageArg = safeParseArg(args, '--stage');
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

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
  allChecks.push(checkShardIndex(workDir));
  allChecks.push(checkR1HasJsonlFiles(workDir));
  allChecks.push(checkShardCompleteness(workDir));
  allChecks.push(checkGlossaryExists(workDir));

  // === Stage checklist gates (S1/R3/FINAL) ===
  if (stageArg === 'S1' || stageArg === 'R3' || stageArg === 'FINAL') {
    allChecks.push(checkChecklistComplete('S0', workDir));
  }
  if (stageArg === 'R3' || stageArg === 'FINAL') {
    allChecks.push(checkChecklistComplete('2_extract', workDir));
    allChecks.push(checkChecklistComplete('3_graph', workDir));
  }

  // === R3 / FINAL additional checks ===
  if (stageArg !== 'S1') {
    allChecks.push(checkAllJsonlDirsHaveFiles(workDir));
    allChecks.push(checkArchitectureExists(workDir));
    allChecks.push(checkIdUniqueness(workDir));
    allChecks.push(checkGraphLoadable(workDir));
    allChecks.push(checkGraphEdgeIntegrity(workDir));
    allChecks.push(checkNodeCountVsR1(workDir));
  }

  // === FINAL-only checks ===
  if (stageArg === 'FINAL') {
    allChecks.push(checkChecklistComplete('4_bdd', workDir));
    allChecks.push(checkChecklistComplete('5_formal', workDir));
    allChecks.push(checkChecklistComplete('6_outputs', workDir));
    allChecks.push(checkValidateBddPasses(workDir));
    allChecks.push(checkMergedGraphExists(workDir));
    allChecks.push(checkSchemaCypherExists(workDir));
    allChecks.push(checkBrainstormContextExists(workDir));
    allChecks.push(checkMindmapModules(workDir));
    allChecks.push(checkBehaviorGraphExists(workDir));
    allChecks.push(checkTlaGraphExists(workDir));
    allChecks.push(checkLeanGraphExists(workDir));
    allChecks.push(checkSystemArchitectureExists(workDir));
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
