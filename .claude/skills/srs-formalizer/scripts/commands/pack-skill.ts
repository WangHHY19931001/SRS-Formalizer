/**
 * pack-skill.ts - 扫描技能目录，生成 hash 清单和加密压缩备份
 *
 * CLI: npx tsx index.ts pack-skill --skill-dir <path>
 *
 * 纯 Node.js 内置模块实现（无 execSync / tar / gzip / openssl 外部依赖）。
 *
 * 流程：
 *   1. 递归扫描技能目录（排除 node_modules/、.srs_formalizer/、dist/、*.enc、MANIFEST.json）
 *   2. 对每个文件计算 SHA256 → 生成 MANIFEST.json
 *   3. 将所有文件序列化为 {"files":{"SKILL.md":"<content>",...}}
 *   4. zlib.deflateSync 压缩 JSON
 *   5. AES-256-GCM 加密（内嵌密钥 + random IV）→ <iv_hex>:<auth_tag_hex>:<ciphertext_hex>
 *   6. 写入 <skill-dir>/srs-formalizer-backup.enc
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import * as zlib from 'node:zlib';
import type { CliResult } from '../types/index.js';
import { safeParseArg } from '../lib/cli.js';

/** AES-256-GCM 密钥（SHA256 派生，内嵌固定） */
const ENCRYPTION_KEY = crypto
  .createHash('sha256')
  .update('srs-formalizer-skill-integrity-v1')
  .digest();

/** 默认排除的目录名称 */
const EXCLUDED_DIRS = new Set(['node_modules', '.srs_formalizer', 'dist']);

/**
 * 递归扫描目录，返回所有需要打包的文件路径（相对于 skillDir）。
 *
 * 排除规则：
 *   - 目录：node_modules/、.srs_formalizer/、dist/
 *   - 文件：*.enc、MANIFEST.json
 */
function collectFiles(skillDir: string): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(skillDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(skillDir, entry.name);
    const relPath = entry.name;

    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      const subFiles = collectFiles(fullPath);
      for (const sf of subFiles) {
        files.push(path.join(relPath, sf));
      }
    } else if (entry.isFile()) {
      // 排除 *.enc 和 MANIFEST.json
      if (relPath.endsWith('.enc')) continue;
      if (relPath === 'MANIFEST.json') continue;
      files.push(relPath);
    }
  }

  return files.sort();
}

/**
 * 计算单个文件的 SHA256 hash（hex 格式）。
 */
function sha256Of(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * 读取文件内容为 UTF-8 字符串。二进制文件也用 UTF-8 表示（保留 base64 编码）。
 * 这里统一以 UTF-8 读取文本文件即可（技能目录通常为纯文本）。
 */
function readFileContent(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * 使用 AES-256-GCM 加密数据。
 * 输出格式：<iv_hex>:<auth_tag_hex>:<ciphertext_hex>
 */
function encryptAesGcm(plaintext: Buffer): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export async function main(args: string[]): Promise<CliResult> {
  let skillDirArg: string | null;
  try {
    skillDirArg = safeParseArg(args, '--skill-dir');
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  if (!skillDirArg) {
    return { status: 'error', message: 'Missing required argument: --skill-dir' };
  }

  const skillDir = path.resolve(skillDirArg);

  if (!fs.existsSync(skillDir)) {
    return { status: 'error', message: `Skill directory not found: ${skillDir}` };
  }

  if (!fs.statSync(skillDir).isDirectory()) {
    return { status: 'error', message: `Not a directory: ${skillDir}` };
  }

  // --force 检查：备份不可变，除非人类显式授权
  const backupFilename = 'srs-formalizer-backup.enc';
  const backupPath = path.join(skillDir, backupFilename);
  const manifestPath = path.join(skillDir, 'MANIFEST.json');
  const hasForce = args.includes('--force');

  if (fs.existsSync(backupPath) && !hasForce) {
    return {
      status: 'error',
      message: `Encrypted backup already exists at ${backupFilename}. The backup is IMMUTABLE — it must not be overwritten by automated processes. To regenerate, a human must explicitly run: npx tsx index.ts pack-skill --skill-dir <path> --force`,
    };
  }

  if (!hasForce && fs.existsSync(manifestPath)) {
    return {
      status: 'error',
      message: `MANIFEST.json already exists. The manifest should only be regenerated together with the backup. To regenerate both, a human must explicitly add --force.`,
    };
  }

  // 提取技能名称（目录名）
  const skillName = path.basename(skillDir);

  // 收集文件
  const relFiles = collectFiles(skillDir);
  if (relFiles.length === 0) {
    return { status: 'error', message: 'No files found to pack in skill directory' };
  }

  // 计算每个文件的 hash
  const fileHashes: Record<string, string> = {};
  for (const relFile of relFiles) {
    fileHashes[relFile] = sha256Of(path.join(skillDir, relFile));
  }

  // 构建 manifest
  const manifest = {
    skill_name: skillName,
    packed_at: new Date().toISOString(),
    total_files: relFiles.length,
    files: fileHashes,
  };

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');

  // === 构建加密压缩备份 ===
  // 1. 读取所有文件内容
  const filesRecord: Record<string, string> = {};
  for (const relFile of relFiles) {
    filesRecord[relFile] = readFileContent(path.join(skillDir, relFile));
  }

  // 2. 序列化为 JSON
  const payload = JSON.stringify({ files: filesRecord });

  // 3. zlib 压缩
  const compressed = zlib.deflateSync(Buffer.from(payload, 'utf-8'));

  // 4. AES-256-GCM 加密
  const encrypted = encryptAesGcm(compressed);

  // 5. 写入备份文件
  fs.writeFileSync(backupPath, encrypted, 'utf-8');

  return {
    status: 'ok',
    data: {
      total_files: relFiles.length,
      manifest_path: manifestPath,
      backup_path: backupPath,
    },
  };
}

// Guard: refuse direct invocation (must go through index.ts)
import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
