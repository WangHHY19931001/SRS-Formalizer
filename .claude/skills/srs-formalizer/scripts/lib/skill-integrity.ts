/**
 * Shared skill integrity utilities — used by pack-skill and verify-skill-integrity.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import * as zlib from 'node:zlib';

/** AES-256-GCM key shared between pack-skill and verify-skill-integrity. */
export const ENCRYPTION_KEY = crypto
  .createHash('sha256')
  .update('srs-formalizer-skill-integrity-v1')
  .digest();

/** Excluded directory names for file collection. */
export const EXCLUDED_DIRS = new Set(['node_modules', '.srs_formalizer', 'dist']);

/** High-risk file patterns. */
export const HIGH_RISK_PATTERNS = [/^SKILL\.md$/, /^prompts\/.*\.md$/, /^templates\/.*/, /^references\/.*/];

/** Text file extensions — CRLF→LF normalization applied before hashing. */
const TEXT_EXTENSIONS = new Set([
  '.ts', '.md', '.json', '.txt', '.yaml', '.yml', '.template', '.tsv',
]);

/** Files without extension that are still text. */
const TEXT_NO_EXT = new Set(['.gitkeep', '.gherkin-lintrc', '.gherkin-lintrc-strict']);

/** Returns true for text files where CRLF→LF normalization is safe. */
function isTextFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  if (TEXT_EXTENSIONS.has(ext)) return true;
  const base = path.basename(filePath).toLowerCase();
  return TEXT_NO_EXT.has(base);
}

/** Reads file content and normalizes CRLF→LF for text files (platform-independent hashing). */
function readForHashing(filePath: string): Buffer {
  const buf = fs.readFileSync(filePath);
  if (!isTextFile(filePath)) return buf;
  return Buffer.from(buf.toString('utf-8').replace(/\r\n/g, '\n'), 'utf-8');
}

export interface Manifest { skill_name: string; packed_at: string; total_files: number; files: Record<string, string>; }

export interface VerifyResult {
  valid: boolean; total: number; matched: number;
  mismatched: Array<{ file: string; expected: string; actual: string; risk: 'high' | 'low' }>;
  missing: Array<{ file: string; risk: 'high' | 'low' }>;
  extra: Array<{ file: string; risk: 'low' }>;
}

export function classifyRisk(relPath: string): 'high' | 'low' {
  for (const pattern of HIGH_RISK_PATTERNS) { if (pattern.test(relPath)) return 'high'; }
  return 'low';
}

export function sha256Of(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return crypto.createHash('sha256').update(readForHashing(filePath)).digest('hex');
  } catch { return null; }
}

export function sha256OfFile(filePath: string): string {
  return crypto.createHash('sha256').update(readForHashing(filePath)).digest('hex');
}

export function readManifest(skillDir: string): Manifest {
  const manifestPath = path.join(skillDir, 'MANIFEST.json');
  if (!fs.existsSync(manifestPath)) throw new Error(`MANIFEST.json not found in: ${skillDir}`);
  return JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as Manifest;
}

export function collectCurrentFiles(skillDir: string): Set<string> {
  const files = new Set<string>();

  function walk(dir: string, relPrefix: string): void {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) { if (!EXCLUDED_DIRS.has(entry.name)) walk(fullPath, relPath); }
      else if (entry.isFile()) { if (!relPath.endsWith('.enc') && relPath !== 'MANIFEST.json') files.add(relPath); }
    }
  }

  walk(skillDir, '');
  return files;
}

export function collectFiles(skillDir: string): string[] {
  const files: string[] = [];

  // Relative paths use forward slashes on ALL platforms so the manifest/backup
  // keys are portable and match collectCurrentFiles + HIGH_RISK_PATTERNS (which
  // are forward-slash). Using path.join here produced `prompts\file.md` on
  // Windows, so every nested file appeared simultaneously missing (manifest key
  // never matched) and extra (verify key never matched), and repair could not
  // map files back to backup entries.
  function walk(dir: string, prefix: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) { if (!EXCLUDED_DIRS.has(entry.name)) walk(fullPath, rel); }
      else if (entry.isFile()) {
        if (!rel.endsWith('.enc') && rel !== 'MANIFEST.json') files.push(rel);
      }
    }
  }

  walk(skillDir, '');
  return files.sort();
}

export function readFileContent(filePath: string): string { return fs.readFileSync(filePath, 'utf-8'); }

export function encryptAesGcm(plaintext: Buffer): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${encrypted.toString('hex')}`;
}

export function verify(skillDir: string): VerifyResult {
  const manifest = readManifest(skillDir);
  const manifestFiles = manifest.files;
  const currentFiles = collectCurrentFiles(skillDir);

  const result: VerifyResult = { valid: true, total: Object.keys(manifestFiles).length, matched: 0, mismatched: [], missing: [], extra: [] };

  for (const [relFile, expectedHash] of Object.entries(manifestFiles)) {
    const actualHash = sha256Of(path.join(skillDir, relFile));
    if (actualHash === null) { result.missing.push({ file: relFile, risk: classifyRisk(relFile) }); result.valid = false; }
    else if (actualHash !== expectedHash) { result.mismatched.push({ file: relFile, expected: expectedHash, actual: actualHash, risk: classifyRisk(relFile) }); result.valid = false; }
    else { result.matched++; }
  }

  for (const relFile of currentFiles) {
    if (!(relFile in manifestFiles)) { result.extra.push({ file: relFile, risk: 'low' }); result.valid = false; }
  }

  return result;
}

export function decryptAndDecompress(backupPath: string): Record<string, string> {
  if (!fs.existsSync(backupPath)) throw new Error(`Backup file not found: ${backupPath}. Run pack-skill first to create it.`);
  const encContent = fs.readFileSync(backupPath, 'utf-8').trim();
  const parts = encContent.split(':');
  if (parts.length < 3) throw new Error('Invalid backup file format: expected <iv_hex>:<auth_tag_hex>:<ciphertext_hex>');

  const iv = Buffer.from(parts[0]!, 'hex');
  const authTag = Buffer.from(parts[1]!, 'hex');
  const ciphertext = Buffer.from(parts.slice(2).join(':'), 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const decompressed = zlib.inflateSync(decrypted);
  const payload = JSON.parse(decompressed.toString('utf-8')) as { files: Record<string, string> };
  if (!payload.files || typeof payload.files !== 'object') throw new Error('Invalid backup file format: missing "files" key');
  return payload.files;
}

export function restoreFromBackup(skillDir: string, backupFiles: Record<string, string>, filesToRestore: string[]): { restored: string[]; errors: string[] } {
  const restored: string[] = [];
  const errors: string[] = [];
  for (const relFile of filesToRestore) {
    const content = backupFiles[relFile];
    if (content === undefined) { errors.push(`Failed to restore: ${relFile} (not found in backup)`); continue; }
    const fullPath = path.join(skillDir, relFile);
    try { fs.mkdirSync(path.dirname(fullPath), { recursive: true }); fs.writeFileSync(fullPath, content, 'utf-8'); restored.push(relFile); }
    catch (err: unknown) { errors.push(`Failed to restore ${relFile}: ${err instanceof Error ? err.message : String(err)}`); }
  }
  return { restored, errors };
}

export function performRepair(skillDir: string, result: VerifyResult): { repaired: string[]; errors: string[] } {
  const toRestore = [...result.mismatched.map(m => m.file), ...result.missing.map(m => m.file)];
  if (toRestore.length === 0) return { repaired: [], errors: [] };

  const backupPath = path.join(skillDir, 'srs-formalizer-backup.enc');
  let backupFiles: Record<string, string>;
  try { backupFiles = decryptAndDecompress(backupPath); }
  catch (err) { return { repaired: [], errors: [`Backup restoration failed: ${err instanceof Error ? err.message : String(err)}`] }; }

  const { restored, errors } = restoreFromBackup(skillDir, backupFiles, toRestore);
  return { repaired: restored, errors };
}
