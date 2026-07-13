import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

interface EvalSuite { name: string; command: string[]; }
const suites: EvalSuite[] = [
  { name: 'lifecycle-and-report-binding', command: ['--test', '__tests__/final-report-binding.test.ts'] },
  { name: 'tla-toolchain', command: ['--test', '__tests__/tla-validator.test.ts'] },
  { name: 'artifact-contracts', command: ['--test', '__tests__/artifact-contracts.test.ts'] },
];
const started = Date.now();
const results = suites.map(suite => {
  const suiteStarted = Date.now();
  try {
    execFileSync('npx', ['tsx', ...suite.command], { stdio: 'pipe', encoding: 'utf8', timeout: 180_000 });
    return { name: suite.name, passed: true, durationMs: Date.now() - suiteStarted };
  } catch (error) {
    const result = error as { stdout?: string | Buffer; stderr?: string | Buffer };
    return { name: suite.name, passed: false, durationMs: Date.now() - suiteStarted, output: `${result.stdout?.toString() ?? ''}\n${result.stderr?.toString() ?? ''}`.slice(0, 2_000) };
  }
});
const summary = { suite: 'srs-formalizer-deterministic-evals', total: results.length, passed: results.filter(result => result.passed).length, failed: results.filter(result => !result.passed).length, durationMs: Date.now() - started, gitCommit: (() => { try { return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { return undefined; } })(), results };
const output = path.resolve('eval-results.json');
fs.writeFileSync(output, JSON.stringify(summary, null, 2), 'utf8');
console.log(JSON.stringify(summary));
if (summary.failed > 0) process.exit(1);
