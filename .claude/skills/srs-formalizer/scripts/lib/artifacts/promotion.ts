import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * TLC intermediate products that must never be promoted into verified/
 * (proposal §3.4 / §P2-9). A TLC run leaves error-trace specs, the states/
 * fingerprint store, and various binary scratch files in the draft directory;
 * promoting them pollutes verified/ and corrupts the sourceHash computed over
 * the verified tree.
 */
function isTlcIntermediate(candidate: string): boolean {
  const base = path.basename(candidate);
  return (
    /_TTrace_.*\.tla$/.test(base) ||
    candidate.includes(`${path.sep}states${path.sep}`) ||
    /\.(bin|st|fp)$/.test(base)
  );
}

function isExcludedArtifact(candidate: string): boolean {
  return (
    candidate.includes(`${path.sep}.lake${path.sep}`) ||
    candidate.includes(`${path.sep}build${path.sep}`) ||
    isTlcIntermediate(candidate)
  );
}

function replaceDirectory(sourceDir: string, targetDir: string): void {
  const staging = `${targetDir}.staging-${process.pid}-${Date.now()}`;
  fs.rmSync(staging, { recursive: true, force: true });
  fs.cpSync(sourceDir, staging, { recursive: true, filter: candidate => !isExcludedArtifact(candidate) });
  // Windows NTFS 不支持原子替换非空目录（renameSync EPERM），
  // rmSync 整个 targetDir 后立即重建也可能因句柄延迟导致旧文件残留。
  // 改为：保留 targetDir 目录本身，清除其内容，再复制 staging 内容。
  clearDirectoryContents(targetDir);
  fs.cpSync(staging, targetDir, { recursive: true });
  fs.rmSync(staging, { recursive: true, force: true });
}

/** 清除目录内容但保留目录本身（避免 Windows rmSync+mkdir 竞态）。 */
function clearDirectoryContents(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    return;
  }
  for (const entry of fs.readdirSync(dir)) {
    fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
  }
}

export function promoteFiles(sourceDir: string, targetDir: string, fileNames: string[]): string[] {
  const staging = `${targetDir}.staging-${process.pid}-${Date.now()}`;
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });
  for (const fileName of fileNames) fs.copyFileSync(path.join(sourceDir, fileName), path.join(staging, fileName));
  // 同 replaceDirectory：避免 Windows EPERM
  clearDirectoryContents(targetDir);
  fs.cpSync(staging, targetDir, { recursive: true });
  fs.rmSync(staging, { recursive: true, force: true });
  return fileNames.map(fileName => path.join(targetDir, fileName));
}

/**
 * Promote the named files into targetDir with ACCUMULATE (merge) semantics
 * (proposal §P0-1). Unlike promoteFiles (which wipes the whole target), this
 * preserves files already in targetDir and only overwrites same-named files.
 * Used by multi-module verification (validate-tla) where each module is promoted
 * in a separate invocation; the destructive replace previously left only the
 * last-promoted module in verified/, letting one module masquerade as full
 * coverage. TLC intermediate products are never promoted (proposal §3.4/§P2-9).
 */
export function promoteFilesMerge(sourceDir: string, targetDir: string, fileNames: string[]): string[] {
  fs.mkdirSync(targetDir, { recursive: true });
  for (const fileName of fileNames) {
    if (isTlcIntermediate(fileName)) continue;
    const destination = path.join(targetDir, fileName);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const temporary = `${destination}.staging-${process.pid}-${Date.now()}`;
    fs.copyFileSync(path.join(sourceDir, fileName), temporary);
    fs.renameSync(temporary, destination);
  }
  return fileNames.map(fileName => path.join(targetDir, fileName));
}

export function promoteDirectory(sourceDir: string, targetDir: string): string {
  replaceDirectory(sourceDir, targetDir);
  return targetDir;
}
