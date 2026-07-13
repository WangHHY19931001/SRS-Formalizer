import * as fs from 'node:fs';
import * as path from 'node:path';

export function promoteFiles(sourceDir: string, targetDir: string, fileNames: string[]): string[] {
  const staging = `${targetDir}.staging-${process.pid}-${Date.now()}`;
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });
  for (const fileName of fileNames) fs.copyFileSync(path.join(sourceDir, fileName), path.join(staging, fileName));
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.renameSync(staging, targetDir);
  return fileNames.map(fileName => path.join(targetDir, fileName));
}
