import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SRSIR } from '../../types/srs-ir.js';
import type { Emitter, EmitResult } from './types.js';
import { parseTlcTrace } from '../fixture-gen/tla-counterexample.js';
import { ARTIFACT_PATHS, artifactPath } from '../artifacts/paths.js';

type CeFramework = 'pytest' | 'junit' | 'fast-check';

interface CounterexampleEmitterOptions {
  framework?: CeFramework;
  tracePath?: string;
}

function inferTlaSourceName(content: string): string {
  const modMatch = content.match(/----\s*MODULE\s+(\w+)/);
  if (modMatch?.[1]) return modMatch[1];
  return 'unknown';
}

const TRACE_STATE_RE = /^State (\d+):(.+)$/m;
const TRACE_VAR_RE = /^\s*(\w+)\s*=\s*(.+)$/;

function extractStates(content: string): { step: number; variables: Map<string, string>; predicate?: string }[] {
  const states: { step: number; variables: Map<string, string>; predicate?: string }[] = [];
  const blocks = content.split(/(?=^State \d+:)/m);

  for (const block of blocks) {
    const headerMatch = TRACE_STATE_RE.exec(block);
    if (!headerMatch?.[1]) continue;
    const step = parseInt(headerMatch[1], 10);
    let predicate: string | undefined;
    if (headerMatch[2]) {
      const pred = headerMatch[2].trim();
      if (pred && pred !== '' && pred !== '\\') predicate = pred;
    }

    const variables = new Map<string, string>();
    const lines = block.split('\n').slice(1);
    for (const line of lines) {
      const m = TRACE_VAR_RE.exec(line);
      if (m?.[1] && m[2] !== undefined) {
        variables.set(m[1], m[2].trim());
      }
    }
    if (predicate !== undefined) {
      states.push({ step, variables, predicate });
    } else {
      states.push({ step, variables });
    }
  }
  return states;
}

function formatPytestFixture(
  states: { step: number; variables: Map<string, string>; predicate?: string }[],
  sourceName: string,
  invariantName: string,
): string {
  const allVars = new Set<string>();
  for (const s of states) {
    for (const v of s.variables.keys()) allVars.add(v);
  }
  const varNames = [...allVars];

  const lines: string[] = [
    `"""Counterexample trace from ${sourceName}.tla — violates ${invariantName}"""`,
    'import pytest',
    '',
    '',
    '@pytest.fixture',
    'def counterexample_trace():',
    '    return [',
  ];

  for (const s of states) {
    const stateObj = varNames.map(v => `"${v}": ${s.variables.get(v) ?? 'None'}`).join(', ');
    lines.push(`        {"step": ${s.step}, ${stateObj}},`);
  }

  lines.push('    ]');
  lines.push('');
  lines.push('');
  lines.push(`def test_counterexample_${invariantName.toLowerCase()}(counterexample_trace):`);
  lines.push(`    """Verify that the counterexample trace from ${sourceName}.tla violates ${invariantName}."""`);
  lines.push('    trace = counterexample_trace');
  lines.push(`    assert len(trace) == ${states.length}`);
  lines.push(`    # LLM_FILL: assert invariant ${invariantName} is violated at final state`);

  for (const v of varNames) {
    const last = states[states.length - 1]?.variables.get(v) ?? 'None';
    lines.push(`    assert trace[-1]["${v}"] == ${last}`);
  }

  lines.push('');
  return lines.join('\n');
}

function formatJunitFixture(
  states: { step: number; variables: Map<string, string>; predicate?: string }[],
  sourceName: string,
  invariantName: string,
): string {
  const allVars = new Set<string>();
  for (const s of states) {
    for (const v of s.variables.keys()) allVars.add(v);
  }
  const varNames = [...allVars];
  const className = `${capitalize(sourceName)}Counterexample${capitalize(invariantName)}Test`;

  const lines: string[] = [
    `// Counterexample trace from ${sourceName}.tla — violates ${invariantName}`,
    'import org.junit.jupiter.api.*;',
    'import static org.junit.jupiter.api.Assertions.*;',
    '',
    `class ${className} {`,
    '',
  ];

  for (const v of varNames) {
    lines.push(`    private ${resolveJavaType(v, states)} get${capitalize(v)}(int step) {`);
    lines.push('        // LLM_FILL: return value for given step');
    lines.push('        return null;');
    lines.push('    }');
    lines.push('');
  }

  lines.push(`    @Test`);
  lines.push(`    @DisplayName("Counterexample trace violates ${invariantName}")`);
  lines.push(`    void counterexample${capitalize(invariantName)}Violated() {`);
  lines.push(`        assertEquals(${states.length}, traceLength());`);
  lines.push(`        // LLM_FILL: assert invariant is violated`);
  lines.push('    }');
  lines.push('');
  lines.push('    private int traceLength() {');
  lines.push(`        return ${states.length};`);
  lines.push('    }');
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

function resolveJavaType(varName: string, states: { step: number; variables: Map<string, string> }[]): string {
  for (const s of states) {
    const val = s.variables.get(varName);
    if (val !== undefined) {
      if (val === 'TRUE' || val === 'FALSE') return 'boolean';
      if (/^\d+$/.test(val)) return 'int';
      if (val.startsWith('"') && val.endsWith('"')) return 'String';
    }
  }
  return 'String';
}

function formatFastCheckFixture(
  states: { step: number; variables: Map<string, string>; predicate?: string }[],
  sourceName: string,
  invariantName: string,
): string {
  const lines: string[] = [
    `// Counterexample trace from ${sourceName}.tla — violates ${invariantName}`,
    "import fc from 'fast-check';",
    '',
    `describe('${sourceName} counterexample: ${invariantName}', () => {`,
    '  const trace = [',
  ];

  for (const s of states) {
    const vars = [...s.variables.entries()].map(([k, v]) => `${k}: ${v}`).join(', ');
    lines.push(`    { step: ${s.step}, ${vars} },`);
  }

  lines.push('  ];');
  lines.push('');
  lines.push(`  test('invariant ${invariantName} is violated', () => {`);
  lines.push(`    expect(trace.length).toBe(${states.length});`);
  lines.push('    // LLM_FILL: assert invariant is violated on final state');
  lines.push('  });');
  lines.push('});');
  lines.push('');

  return lines.join('\n');
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/[^\w]/g, '');
}

export class CounterexampleEmitter implements Emitter {
  readonly name = 'counterexample';
  readonly description = 'Generate reproducible counterexample tests from TLC traces';
  readonly outputDir = ARTIFACT_PATHS.fixtures;

  /**
   * Emit counterexample fixtures.
   * Uses the existing parseTlcTrace + generateCounterexampleFixtures for compatibility.
   * Also supports direct raw trace parsing for enhanced output.
   */
  emit(_ir: SRSIR, workdir: string, options?: CounterexampleEmitterOptions): EmitResult {
    const framework = options?.framework ?? 'pytest';
    const tracePath = options?.tracePath ?? path.join(artifactPath(workdir, ARTIFACT_PATHS.tlaVerified), 'traces');

    const allFiles: string[] = [];
    let traceContent: string | null = null;

    if (fs.existsSync(tracePath) && fs.statSync(tracePath).isFile()) {
      traceContent = fs.readFileSync(tracePath, 'utf-8');
    } else if (fs.existsSync(tracePath)) {
      for (const f of fs.readdirSync(tracePath)) {
        if (f.endsWith('.trace')) {
          traceContent = fs.readFileSync(path.join(tracePath, f), 'utf-8');
          break;
        }
      }
    }

    if (!traceContent || traceContent.trim().length === 0) {
      return { files: [], fileCount: 0, metadata: { framework, reason: 'no trace found' } };
    }

    const entries = parseTlcTrace(traceContent);
    if (entries.length === 0) {
      return { files: [], fileCount: 0, metadata: { framework, reason: 'empty trace' } };
    }

    const sourceName = inferTlaSourceName(traceContent);
    let invariantName = entries[entries.length - 1]?.violatedInvariant;
    if (!invariantName) {
      const inlineMatch = traceContent.match(/<Invariant (\w+) violated>/);
      if (inlineMatch?.[1]) invariantName = inlineMatch[1];
    }
    if (!invariantName) {
      const sentenceMatch = traceContent.match(/Invariant (\w+) is violated/);
      if (sentenceMatch?.[1]) invariantName = sentenceMatch[1];
    }
    if (!invariantName) invariantName = 'UnknownInv';

    const outputDir = path.join(artifactPath(workdir, this.outputDir), 'counterexample', framework);
    fs.mkdirSync(outputDir, { recursive: true });

    if (framework === 'pytest') {
      const states = extractStates(traceContent);
      const content = formatPytestFixture(states, sourceName, invariantName);
      const fp = path.join(outputDir, `test_counterexample_${invariantName.toLowerCase()}.py`);
      fs.writeFileSync(fp, content, 'utf-8');
      allFiles.push(fp);
    } else if (framework === 'junit') {
      const states = extractStates(traceContent);
      const content = formatJunitFixture(states, sourceName, invariantName);
      const fp = path.join(outputDir, `Counterexample${capitalize(invariantName)}Test.java`);
      fs.writeFileSync(fp, content, 'utf-8');
      allFiles.push(fp);
    } else if (framework === 'fast-check') {
      const states = extractStates(traceContent);
      const content = formatFastCheckFixture(states, sourceName, invariantName);
      const fp = path.join(outputDir, `counterexample_${invariantName.toLowerCase()}.test.ts`);
      fs.writeFileSync(fp, content, 'utf-8');
      allFiles.push(fp);
    }

    return {
      files: allFiles,
      fileCount: allFiles.length,
      metadata: { framework, invariantName, traceStates: entries.length },
    };
  }
}
