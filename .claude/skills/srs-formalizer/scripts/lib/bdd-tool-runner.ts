import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export interface ToolResult {
  passed: boolean;
  output: string;
  tool: string;
}

const GHERKIN_LINTRC = path.join(process.cwd(), '.gherkin-lintrc-strict');

export function runGherkinLint(featuresDir: string): ToolResult {
  if (!fs.existsSync(featuresDir)) {
    return {
      passed: false,
      output: `Features directory not found: ${featuresDir}`,
      tool: 'gherkin-lint',
    };
  }

  const featureFiles = fs.readdirSync(featuresDir)
    .filter(f => f.endsWith('.feature'));

  if (featureFiles.length === 0) {
    return { passed: true, output: 'No feature files to lint', tool: 'gherkin-lint' };
  }

  try {
    const args = fs.existsSync(GHERKIN_LINTRC)
      ? `-c ${GHERKIN_LINTRC} ${featuresDir}`
      : featuresDir;
    const output = execSync(`npx gherkin-lint ${args}`, {
      encoding: 'utf-8',
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { passed: true, output: output.trim() || 'OK', tool: 'gherkin-lint' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stderr = (err as { stderr?: string }).stderr;
    return {
      passed: false,
      output: stderr || message,
      tool: 'gherkin-lint',
    };
  }
}

export async function runGherklin(featuresDir: string): Promise<ToolResult> {
  if (!fs.existsSync(featuresDir)) {
    return {
      passed: false,
      output: `Features directory not found: ${featuresDir}`,
      tool: 'gherklin',
    };
  }

  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gherklin-'));
  try {
    const configPath = path.join(configDir, 'gherklin.config.ts');
    const resolvedFeatures = path.resolve(featuresDir);
    fs.writeFileSync(configPath, `
const config = {
  configDirectory: '${configDir.replace(/'/g, "\\'")}',
  featureDirectory: '${resolvedFeatures.replace(/'/g, "\\'")}',
  rules: { indentation: 'off' },
  reporter: { type: 'json', configDirectory: '${configDir.replace(/'/g, "\\'")}' },
  maxErrors: Infinity,
};
export default config;
`, 'utf-8');

    const output = execSync(`npx tsx ${path.join(process.cwd(), 'node_modules', 'gherklin', 'bin', 'gherklin')}`, {
      encoding: 'utf-8',
      timeout: 30000,
      cwd: configDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const trimmed = output.trim();
    return { passed: true, output: trimmed || 'OK', tool: 'gherklin' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stderr = (err as { stderr?: string }).stderr;
    return {
      passed: false,
      output: stderr || message,
      tool: 'gherklin',
    };
  } finally {
    try { fs.rmSync(configDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}
