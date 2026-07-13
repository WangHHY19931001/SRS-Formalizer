/**
 * checks-final.ts — FINAL stage verification checks
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { scanLeanSourceForPlaceholders, scanTlaSourceForPlaceholders } from './shared.js';
import type { CheckResult } from './shared.js';

export function checkValidateBddPasses(workDir: string): CheckResult {
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

export function checkMergedGraphExists(workDir: string): CheckResult {
  const mergedPath = path.join(workDir, '3_graph', 'graph', 'graph.merged.json');
  const exists = fs.existsSync(mergedPath);
  return {
    name: 'graph.merged.json exists',
    passed: exists,
    detail: exists ? 'Found' : `graph.merged.json not found at ${mergedPath}`,
  };
}

export function checkSchemaCypherExists(workDir: string): CheckResult {
  const cypherPath = path.join(workDir, '6_outputs', 'knowledge_graph', 'schema.cypher');
  const exists = fs.existsSync(cypherPath);
  return {
    name: 'outputs/knowledge_graph/schema.cypher exists',
    passed: exists,
    detail: exists ? 'Found' : `schema.cypher not found at ${cypherPath}`,
  };
}

export function checkBrainstormContextExists(workDir: string): CheckResult {
  const bsPath = path.join(workDir, '6_outputs', 'brainstorming', 'brainstorm_context.json');
  const exists = fs.existsSync(bsPath);
  return {
    name: 'outputs/brainstorming/brainstorm_context.json exists',
    passed: exists,
    detail: exists ? 'Found' : `brainstorm_context.json not found at ${bsPath}`,
  };
}

export function checkMindmapModules(workDir: string): CheckResult {
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

export function checkBehaviorGraphExists(workDir: string): CheckResult {
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

export function checkTlaGraphExists(workDir: string): CheckResult {
  const graphPath = path.join(workDir, '5_formal', 'tla-interaction-graph.json');
  const cypherPath = path.join(workDir, '6_outputs', 'knowledge_graph', 'tla-interaction.cypher');
  const specsDir = path.join(workDir, '5_formal', 'specs');
  const hasTlaSpecs = fs.existsSync(specsDir) && fs.readdirSync(specsDir).some(f => f.endsWith('.tla'));

  if (!hasTlaSpecs) {
    return { name: 'TLA interaction graph exists', passed: true, detail: 'N/A (TLA+ not triggered)' };
  }

  // SECURITY: re-scan source — never trust a possibly-stale graph.json.
  const placeholders = scanTlaSourceForPlaceholders(specsDir);
  if (placeholders.length > 0) {
    const detail = placeholders.map(p => `${p.file}:${p.marker}`).join(', ');
    return { name: 'TLA interaction graph exists', passed: false, detail: `Forbidden placeholders in .tla source: ${detail}` };
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

export function checkLeanGraphExists(workDir: string): CheckResult {
  const graphPath = path.join(workDir, '5_formal', 'lean-proof-graph.json');
  const cypherPath = path.join(workDir, '6_outputs', 'knowledge_graph', 'lean-proof.cypher');
  const proofsDir = path.join(workDir, '5_formal', 'proofs');
  const hasLeanProofs = fs.existsSync(proofsDir) && fs.readdirSync(proofsDir).some(f => f.endsWith('.lean'));

  if (!hasLeanProofs) {
    return { name: 'Lean proof graph exists', passed: true, detail: 'N/A (Lean 4 not triggered)' };
  }

  // SECURITY: re-scan source — never trust a possibly-stale graph.json.
  const placeholders = scanLeanSourceForPlaceholders(proofsDir);
  if (placeholders.length > 0) {
    const detail = placeholders.map(p => `${p.file}:${p.kind}`).join(', ');
    return { name: 'Lean proof graph exists', passed: false, detail: `Forbidden placeholders in .lean source: ${detail}` };
  }

  const hasGraph = fs.existsSync(graphPath);
  const hasCypher = fs.existsSync(cypherPath);
  if (hasGraph && hasCypher) {
    try {
      const g = JSON.parse(fs.readFileSync(graphPath, 'utf-8'));
      const nodes = g.nodes?.length ?? 0;
      const edges = g.edges?.length ?? 0;
      const depth = g.metadata?.max_proof_depth ?? 0;
      return { name: 'Lean proof graph exists', passed: true, detail: `${nodes} nodes, ${edges} edges, depth ${depth}` };
    } catch {
      return { name: 'Lean proof graph exists', passed: false, detail: 'Corrupt JSON' };
    }
  }
  const missing = [!hasGraph && 'lean-proof-graph.json', !hasCypher && 'lean-proof.cypher'].filter(Boolean);
  return { name: 'Lean proof graph exists', passed: false, detail: `Missing: ${missing.join(', ')}` };
}

export function checkSystemArchitectureExists(workDir: string): CheckResult {
  const graphPath = path.join(workDir, '6_outputs', 'system-architecture.json');
  if (!fs.existsSync(graphPath)) {
    return { name: 'System architecture graph exists', passed: false, detail: 'Not found — run emit --name systemArch' };
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
