import * as fs from 'node:fs';
import * as path from 'node:path';

function replaceDirectory(sourceDir: string, targetDir: string): void {
  const staging = `${targetDir}.staging-${process.pid}-${Date.now()}`;
  fs.rmSync(staging, { recursive: true, force: true });
  fs.cpSync(sourceDir, staging, { recursive: true, filter: candidate => !candidate.includes(`${path.sep}.lake${path.sep}`) && !candidate.includes(`${path.sep}build${path.sep}`) });
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.renameSync(staging, targetDir);
}

export function promoteFiles(sourceDir: string, targetDir: string, fileNames: string[]): string[] {
  const staging = `${targetDir}.staging-${process.pid}-${Date.now()}`;
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });
  for (const fileName of fileNames) fs.copyFileSync(path.join(sourceDir, fileName), path.join(staging, fileName));
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.renameSync(staging, targetDir);
  return fileNames.map(fileName => path.join(targetDir, fileName));
}

export function promoteDirectory(sourceDir: string, targetDir: string): string {
  replaceDirectory(sourceDir, targetDir);
  return targetDir;
}
