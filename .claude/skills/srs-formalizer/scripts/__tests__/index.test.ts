import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import * as path from 'node:path';

const SCRIPTS_DIR = path.resolve(import.meta.dirname!, '..');

function runCli(args: string): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(`npx tsx index.ts ${args}`, {
      cwd: SCRIPTS_DIR,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { stdout: stdout.trim(), stderr: '', exitCode: 0 };
  } catch (err: any) {
    return {
      stdout: err.stdout?.trim() || '',
      stderr: err.stderr?.trim() || '',
      exitCode: err.status || 1,
    };
  }
}

// DESIGN.md §3 — 23 命令清单（11 门禁 + 12 工具），与 index.ts COMMANDS 注册表一致
const EXPECTED_COMMANDS = [
  'validate-jsonl', 'validate-semantics', 'validate-architecture', 'validate-cypher',
  'validate-bdd', 'validate-tla', 'validate-lean', 'validate-glossary',
  'validate-checklist', 'validate-dataflow', 'verify-gate',
  'assemble-ir', 'check-connectivity', 'analyze-dataflow', 'query-graph', 'hash-compute',
  'tlc-trace-parse', 'verify-skill-integrity', 'pack-skill',
  'build-rid-mapping', 'analyze-fidelity', 'validate-convergence-log', 'semantic-gate',
];

describe('CLI entry (index.ts)', () => {
  it('prints usage on --help', () => {
    const { stdout } = runCli('--help');
    assert.ok(stdout.includes('Usage'));
    assert.ok(/SRS-Formalizer CLI v\d+\.\d+\.\d+/.test(stdout));
  });

  it('prints usage on no args', () => {
    const { stdout } = runCli('');
    assert.ok(stdout.includes('Usage'));
  });

  it('errors on unknown command', () => {
    const { exitCode } = runCli('unknown_command');
    assert.ok(exitCode !== 0);
  });

  it('registers all documented commands in two groups (DESIGN.md §3)', () => {
    const { stdout } = runCli('--help');
    // 每个命令名都应出现在帮助文本中
    for (const cmd of EXPECTED_COMMANDS) {
      assert.ok(stdout.includes(cmd), `帮助文本缺少命令: ${cmd}`);
    }
    // 分组标题存在
    assert.ok(stdout.includes('Gate Validators'));
    assert.ok(stdout.includes('Independent Tools'));
  });

  it('does not register archived commands', () => {
    const { stdout } = runCli('--help');
    const archived = ['init', 'manifest', 'guided-extract', 'inject-prompt', 'build-ir',
      'analyze-structure', 'analyze-graph', 'tag-nfr', 'score-risk', 'emit',
      'pipeline', 'compile', 'build-architecture', 'merge-analysis'];
    for (const cmd of archived) {
      // 已归档命令不应作为独立条目出现在帮助文本的命令列表中
      // 用行首两空格+命令名+空格的精确匹配避免误判子串
      const asListEntry = `\n  ${cmd} `;
      assert.ok(!stdout.includes(asListEntry), `已归档命令仍出现在帮助文本: ${cmd}`);
    }
  });
});
