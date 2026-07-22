import * as fs from 'node:fs';
import * as path from 'node:path';
import { type CheckResult } from './shared.js';
import { ARTIFACT_PATHS, artifactPath } from '../artifacts/paths.js';
import { collectByExtension, collectFiles, hashFiles, hashText, readPassingReports } from '../artifacts/validation-report.js';

/** A TLA+ module = a `<name>.tla` + matching `<name>.cfg` pair. */
export function tlaModulesInVerified(root: string): Map<string, string[]> {
  const modules = new Map<string, string[]>();
  for (const tla of collectByExtension(root, '.tla')) {
    const cfg = tla.replace(/\.tla$/, '.cfg');
    if (fs.existsSync(cfg)) modules.set(path.basename(tla, '.tla'), [tla, cfg]);
  }
  return modules;
}

/** P0: 报告真实性检测 — startedAt≠completedAt (0ms假报告) + irHash匹配srs-ir.json (过期产物) */
export function checkReportAuthenticity(workDir: string, kind: 'bdd' | 'tlaplus' | 'lean4'): CheckResult {
  const name = `${kind} report authenticity`;
  const config = { bdd: ARTIFACT_PATHS.bddValidation, tlaplus: ARTIFACT_PATHS.tlaValidation, lean4: ARTIFACT_PATHS.leanValidation }[kind];
  const reportDir = artifactPath(workDir, config);
  if (!fs.existsSync(reportDir)) return { name, passed: true, detail: 'no validation reports (nothing to check)' };
  let currentIrHash: string | null = null;
  try { currentIrHash = hashText(fs.readFileSync(path.join(workDir, 'srs-ir.json'), 'utf-8')); }
  catch { /* srs-ir.json missing — irHash check skipped, 0ms check still runs. */ }
  const issues: string[] = [];
  for (const file of fs.readdirSync(reportDir).filter(f => f.endsWith('.json'))) {
    try {
      const report = JSON.parse(fs.readFileSync(path.join(reportDir, file), 'utf-8')) as {
        artifactKind?: string; passed?: boolean; startedAt?: string; completedAt?: string; irHash?: string;
      };
      if (report.artifactKind !== kind || report.passed !== true) continue;
      if (report.startedAt === report.completedAt) issues.push(`${file}: startedAt === completedAt (0ms — likely forged)`);
      if (currentIrHash !== null && report.irHash !== currentIrHash) issues.push(`${file}: irHash mismatch (artifact validated against stale IR)`);
    } catch { /* skip malformed */ }
  }
  if (issues.length === 0 && currentIrHash === null) return { name, passed: false, detail: 'srs-ir.json cannot be read (irHash check skipped)' };
  return { name, passed: issues.length === 0, detail: issues.length === 0 ? 'all reports authentic' : issues.join('; ') };
}

/** P0: verified:validation = 1:1 — 每个 verified 产物单元必须有对应 passed validation 报告 */
export function checkReportArtifactRatio(workDir: string, kind: 'bdd' | 'tlaplus' | 'lean4'): CheckResult {
  const name = `${kind} verified:validation ratio`;
  const config = {
    bdd: { verified: ARTIFACT_PATHS.bddVerified, validation: ARTIFACT_PATHS.bddValidation },
    tlaplus: { verified: ARTIFACT_PATHS.tlaVerified, validation: ARTIFACT_PATHS.tlaValidation },
    lean4: { verified: ARTIFACT_PATHS.leanVerified, validation: ARTIFACT_PATHS.leanValidation },
  }[kind];
  const verifiedRoot = artifactPath(workDir, config.verified);
  const validationDir = artifactPath(workDir, config.validation);
  if (!fs.existsSync(verifiedRoot)) return { name, passed: true, detail: 'no verified artifacts (nothing to check)' };
  let artifactUnits: string[][];
  if (kind === 'tlaplus') artifactUnits = [...tlaModulesInVerified(verifiedRoot).values()];
  else if (kind === 'bdd') {
    const features = collectByExtension(verifiedRoot, '.feature');
    artifactUnits = features.length > 0 ? [features] : [];
  } else {
    const projectFiles = [...collectByExtension(verifiedRoot, '.lean'), ...collectFiles(verifiedRoot, ['lakefile.lean', 'lakefile.toml', 'lean-toolchain'])];
    artifactUnits = projectFiles.length > 0 ? [projectFiles] : [];
  }
  if (artifactUnits.length === 0) return { name, passed: true, detail: 'no verified files' };
  if (!fs.existsSync(validationDir)) return { name, passed: false, detail: `${artifactUnits.length} verified artifact(s) but no validation report directory` };
  const reports = readPassingReports(validationDir, kind);
  if (reports.length === 0) return { name, passed: false, detail: `${artifactUnits.length} verified artifact(s) but no passing validation report` };
  const reportHashes = new Set<string>();
  for (const report of reports) reportHashes.add(report.sourceHash);
  const missing: string[] = [];
  for (const unit of artifactUnits) {
    const unitHash = hashFiles(unit);
    if (!reportHashes.has(unitHash)) missing.push(path.basename(unit[0] ?? 'unknown'));
  }
  if (missing.length > 0) return { name, passed: false, detail: `${missing.length} verified artifact(s) with no matching report: ${missing.join(', ')}` };
  return { name, passed: true, detail: `${artifactUnits.length} verified artifact(s) all have matching reports` };
}

/**
 * P0: 反模式检测——检测 Agent 主动绕过门禁的行为模式。
 * 1. draft/ 中的 .cfg 文件（.cfg 应由 validate-tla 从模板复制，不应在 draft 中手写）
 * 2. /tmp 或 tmp/ 脚本目录（绕过工作目录约束）
 * 3. CHECKLIST 全勾但引用的产物文件不存在
 */
export function checkAntiPatterns(workDir: string): CheckResult {
  const name = 'anti-pattern detection';
  const issues: string[] = [];

  // 1. draft/ 中的 .cfg 文件
  const tlaDraftDir = artifactPath(workDir, ARTIFACT_PATHS.tlaDraft);
  if (fs.existsSync(tlaDraftDir)) {
    for (const file of collectByExtension(tlaDraftDir, '.cfg')) {
      issues.push(`manual .cfg in draft/ (bypassing validate-tla): ${path.basename(file)}`);
    }
  }

  // 2. /tmp 或 tmp/ 脚本目录
  const tmpDir = path.join(workDir, 'tmp');
  if (fs.existsSync(tmpDir) && fs.statSync(tmpDir).isDirectory()) {
    const scripts = fs.readdirSync(tmpDir).filter(f => /\.(sh|ps1|bat|py|js|ts)$/.test(f));
    if (scripts.length > 0) {
      issues.push(`tmp/ directory contains scripts (bypassing workdir scope): ${scripts.join(', ')}`);
    }
  }

  // 3. CHECKLIST 全勾但引用的产物文件不存在
  const checklistDirs = ['6_outputs'];
  for (const dir of checklistDirs) {
    const checklistPath = path.join(workDir, dir, 'CHECKLIST.md');
    if (!fs.existsSync(checklistPath)) continue;
    const content = fs.readFileSync(checklistPath, 'utf-8');
    const checkedRefs = content.matchAll(/-\s*\[x\]\s*`([^`]+)`/g);
    for (const match of checkedRefs) {
      const refPath = match[1];
      if (!refPath) continue;
      if (refPath.includes(' ') || !(/[./]/.test(refPath))) continue;
      const fullPath = path.join(workDir, refPath);
      if (!fs.existsSync(fullPath)) {
        issues.push(`CHECKLIST checked but file missing: ${refPath}`);
      }
    }
  }

  return { name, passed: issues.length === 0, detail: issues.length === 0 ? 'no anti-patterns detected' : issues.join('; ') };
}
