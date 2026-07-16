import { describe, it, before, after } from 'node:test';
import { ok, strictEqual } from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'compile-test-'));
const SKILL_DIR = path.join(TMP, 'test-skill');
const WORKDIR = path.join(TMP, '.srs_formalizer');

function writeSkillMd(content: string): void {
  fs.mkdirSync(SKILL_DIR, { recursive: true });
  fs.writeFileSync(path.join(SKILL_DIR, 'SKILL.md'), content, 'utf-8');
}

before(() => {
  fs.mkdirSync(WORKDIR, { recursive: true });
  fs.mkdirSync(path.join(WORKDIR, '_ctx'), { recursive: true });
});

after(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});

describe('compile command', () => {
  it('successfully compiles a minimal SKILL.md', async () => {
    writeSkillMd(`---
name: minimal-skill
description: A minimal test skill
---
# Minimal Skill
This is the body.`);

    const { main } = await import('../commands/compile.js');
    const result = await main([
      '--skill-dir', SKILL_DIR,
      '--workdir', WORKDIR,
    ]);

    strictEqual(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    strictEqual((data.emitted as string[]).length, 2);
    ok(fs.existsSync(path.join(WORKDIR, '_ctx', 'skir.json')));
    ok(fs.existsSync(path.join(WORKDIR, '_ctx', 'skill.claude.xml')));
    ok(fs.existsSync(path.join(WORKDIR, '_ctx', 'skill.generic.md')));
  });

  it('returns error for missing --skill-dir', async () => {
    const { main } = await import('../commands/compile.js');
    const result = await main(['--workdir', WORKDIR]);
    strictEqual(result.status, 'error');
    ok(result.message!.includes('--skill-dir'));
  });

  it('returns error for missing --workdir', async () => {
    writeSkillMd(`---
name: test-skill
description: test
---
# Test`);
    const { main } = await import('../commands/compile.js');
    const result = await main(['--skill-dir', SKILL_DIR]);
    strictEqual(result.status, 'error');
    ok(result.message!.includes('--workdir'));
  });

  it('returns error for non-existent skill directory', async () => {
    const { main } = await import('../commands/compile.js');
    const result = await main([
      '--skill-dir', '/nonexistent/path',
      '--workdir', WORKDIR,
    ]);
    strictEqual(result.status, 'error');
    ok(result.message!.includes('not found'));
  });

  it('blocks compilation on critical anti-skill violations', async () => {
    writeSkillMd(`---
name: dangerous-skill
description: A skill with dangerous operations
---
# Dangerous

## Procedures
1. DROP all tables without confirmation
2. rm -rf the entire directory
`);

    const { main } = await import('../commands/compile.js');
    const result = await main([
      '--skill-dir', SKILL_DIR,
      '--workdir', WORKDIR,
    ]);

    strictEqual(result.status, 'error');
    ok(result.message!.includes('blocked'));
    const data = result.data as Record<string, unknown>;
    ok((data.violations as unknown[]).length > 0);
  });

  it('continues on warning-level constraints', async () => {
    writeSkillMd(`---
name: http-skill
description: A skill with HTTP operations
---
# HTTP Skill

## Procedures
1. fetch data from remote API with HTTP GET request
`);

    const { main } = await import('../commands/compile.js');
    const result = await main([
      '--skill-dir', SKILL_DIR,
      '--workdir', WORKDIR,
    ]);

    strictEqual(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    ok((data.warnings as unknown[]).length > 0);
  });

  it('filters output by --target', async () => {
    writeSkillMd(`---
name: filtered-skill
description: test
---
# Test`);
    const { main } = await import('../commands/compile.js');
    const result = await main([
      '--skill-dir', SKILL_DIR,
      '--workdir', WORKDIR,
      '--target', 'claude',
    ]);

    strictEqual(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    const emitted = data.emitted as string[];
    ok(emitted.includes('skill.claude.xml'));
    strictEqual(emitted.includes('skill.generic.md'), false);
  });

  it('includes source_hash and compiled_at in output', async () => {
    writeSkillMd(`---
name: hash-skill
description: test
---
# Test`);
    const { main } = await import('../commands/compile.js');
    const result = await main([
      '--skill-dir', SKILL_DIR,
      '--workdir', WORKDIR,
    ]);

    const data = result.data as Record<string, unknown>;
    ok(typeof data.source_hash === 'string');
    strictEqual(data.source_hash.length, 64);
    ok(typeof data.compiled_at === 'string');
  });
});
