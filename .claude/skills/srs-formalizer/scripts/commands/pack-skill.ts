/**
 * pack-skill.ts - 扫描技能目录，生成 hash 清单和加密压缩备份
 *
 * CLI: npx tsx index.ts pack-skill --skill-dir <path> [--force]
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import type { CliResult } from '../types/index.js';
import { safeParseArg } from '../lib/cli.js';
import { collectFiles, sha256OfFile, readFileContent, encryptAesGcm } from '../lib/skill-integrity.js';

export async function main(args: string[]): Promise<CliResult> {
  let skillDirArg: string | null;
  try { skillDirArg = safeParseArg(args, '--skill-dir'); }
  catch (err) { return { status: 'error', message: (err as Error).message }; }

  if (!skillDirArg) return { status: 'error', message: 'Missing required argument: --skill-dir' };

  const skillDir = path.resolve(skillDirArg);
  if (!fs.existsSync(skillDir)) return { status: 'error', message: `Skill directory not found: ${skillDir}` };
  if (!fs.statSync(skillDir).isDirectory()) return { status: 'error', message: `Not a directory: ${skillDir}` };

  const backupFilename = 'srs-formalizer-backup.enc';
  const backupPath = path.join(skillDir, backupFilename);
  const manifestPath = path.join(skillDir, 'MANIFEST.json');
  const hasForce = args.includes('--force');

  if (fs.existsSync(backupPath) && !hasForce) {
    return { status: 'error', message: `Encrypted backup already exists at ${backupFilename}. The backup is IMMUTABLE — it must not be overwritten by automated processes. To regenerate, a human must explicitly run: npx tsx index.ts pack-skill --skill-dir <path> --force` };
  }
  if (!hasForce && fs.existsSync(manifestPath)) {
    return { status: 'error', message: 'MANIFEST.json already exists. The manifest should only be regenerated together with the backup. To regenerate both, a human must explicitly add --force.' };
  }

  const skillName = path.basename(skillDir);
  const relFiles = collectFiles(skillDir);
  if (relFiles.length === 0) return { status: 'error', message: 'No files found to pack in skill directory' };

  const fileHashes: Record<string, string> = {};
  for (const relFile of relFiles) fileHashes[relFile] = sha256OfFile(path.join(skillDir, relFile));

  const manifest = { skill_name: skillName, packed_at: new Date().toISOString(), total_files: relFiles.length, files: fileHashes };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');

  const filesRecord: Record<string, string> = {};
  for (const relFile of relFiles) filesRecord[relFile] = readFileContent(path.join(skillDir, relFile));

  const compressed = zlib.deflateSync(Buffer.from(JSON.stringify({ files: filesRecord }), 'utf-8'));
  fs.writeFileSync(backupPath, encryptAesGcm(compressed), 'utf-8');

  return { status: 'ok', data: { total_files: relFiles.length, manifest_path: manifestPath, backup_path: backupPath } };
}

import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
