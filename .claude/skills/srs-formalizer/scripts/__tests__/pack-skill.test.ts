import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const TMP = path.join(os.tmpdir(), `srs-formalizer-pack-skill-test-${Date.now()}`);

function createSkillDir(name: string): string {
  const skillDir = path.join(TMP, name);
  fs.mkdirSync(path.join(skillDir, 'prompts'), { recursive: true });
  fs.mkdirSync(path.join(skillDir, 'references'), { recursive: true });
  return skillDir;
}

describe('pack-skill command', () => {
  before(() => {
    fs.mkdirSync(TMP, { recursive: true });
  });

  after(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  it('packs a skill directory into manifest + encrypted backup', async () => {
    const skillDir = createSkillDir('my-skill');
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Test Skill\nA test skill.\n', 'utf-8');
    fs.writeFileSync(path.join(skillDir, 'prompts', 'main.md'), '# Main prompt\n', 'utf-8');

    const { main } = await import('../commands/pack-skill.js');
    const result = await main(['--skill-dir', skillDir]);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.total_files, 2);
    assert.ok(typeof data.manifest_path === 'string');
    assert.ok(typeof data.backup_path === 'string');

    // Verify files were created
    assert.ok(fs.existsSync(path.join(skillDir, 'MANIFEST.json')));
    assert.ok(fs.existsSync(path.join(skillDir, 'srs-formalizer-backup.enc')));
  });

  it('returns error when missing --skill-dir argument', async () => {
    const { main } = await import('../commands/pack-skill.js');
    const result = await main([]);

    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('Missing required argument'));
  });

  it('returns error when skill directory does not exist', async () => {
    const { main } = await import('../commands/pack-skill.js');
    const result = await main(['--skill-dir', '/tmp/nonexistent-skill-dir-12345']);

    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('Skill directory not found'));
  });

  it('returns error when skill path is a file, not a directory', async () => {
    const filePath = path.join(TMP, 'not-a-dir');
    fs.writeFileSync(filePath, '', 'utf-8');

    const { main } = await import('../commands/pack-skill.js');
    const result = await main(['--skill-dir', filePath]);

    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('Not a directory'));
  });

  it('returns error when no files found to pack', async () => {
    const emptyDir = path.join(TMP, 'empty-dir');
    fs.mkdirSync(emptyDir, { recursive: true });

    const { main } = await import('../commands/pack-skill.js');
    const result = await main(['--skill-dir', emptyDir]);

    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('No files found to pack'));
  });

  it('refuses to overwrite existing backup without --force', async () => {
    const skillDir = createSkillDir('existing-backup');
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Skill\n', 'utf-8');
    // Create existing backup
    fs.writeFileSync(path.join(skillDir, 'srs-formalizer-backup.enc'), 'existing', 'utf-8');

    const { main } = await import('../commands/pack-skill.js');
    const result = await main(['--skill-dir', skillDir]);

    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('backup already exists'));
    assert.ok(result.message!.includes('--force'));
  });

  it('overwrites existing backup with --force', async () => {
    const skillDir = createSkillDir('force-overwrite');
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Skill\n', 'utf-8');
    fs.writeFileSync(path.join(skillDir, 'srs-formalizer-backup.enc'), 'old', 'utf-8');

    const { main } = await import('../commands/pack-skill.js');
    const result = await main(['--skill-dir', skillDir, '--force']);

    assert.equal(result.status, 'ok');
    assert.ok(fs.existsSync(path.join(skillDir, 'srs-formalizer-backup.enc')));
  });

  it('excludes .enc files and MANIFEST.json from the pack', async () => {
    const skillDir = createSkillDir('exclusions');
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Skill\n', 'utf-8');
    fs.writeFileSync(path.join(skillDir, 'existing.enc'), 'existing enc', 'utf-8');
    fs.writeFileSync(path.join(skillDir, 'MANIFEST.json'), '{}', 'utf-8');

    const { main } = await import('../commands/pack-skill.js');
    const result = await main(['--skill-dir', skillDir, '--force']);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    // Only SKILL.md should be packed (not .enc or MANIFEST.json)
    assert.equal(data.total_files, 1);
  });
});
