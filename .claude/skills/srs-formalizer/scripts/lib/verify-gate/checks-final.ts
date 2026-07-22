import * as fs from 'node:fs';
import * as path from 'node:path';
import { scanLeanSourceForPlaceholders, scanTlaSourceForPlaceholders, type CheckResult } from './shared.js';
import { ARTIFACT_PATHS, artifactPath } from '../artifacts/paths.js';
import { collectByExtension, collectFiles, hashFiles, hashText, readMatchingReport, readPassingReports } from '../artifacts/validation-report.js';

export function verifiedArtifactCheck(workDir: string, kind: 'bdd' | 'lean4', required: boolean): CheckResult {
  const config = {
    bdd: { verified: ARTIFACT_PATHS.bddVerified, validation: ARTIFACT_PATHS.bddValidation, files: (root: string) => collectByExtension(root, '.feature') },
    lean4: { verified: ARTIFACT_PATHS.leanVerified, validation: ARTIFACT_PATHS.leanValidation, files: (root: string) => [...collectByExtension(root, '.lean'), ...collectFiles(root, ['lakefile.lean', 'lakefile.toml', 'lean-toolchain'])] },
  }[kind];
  if (!required) return { name: `${kind} verified artifacts`, passed: true, detail: 'Not required by IR' };
  const files = config.files(artifactPath(workDir, config.verified));
  if (files.length === 0) return { name: `${kind} verified artifacts`, passed: false, detail: 'verified source missing' };
  const passing = readMatchingReport(artifactPath(workDir, config.validation), kind, hashFiles(files));
  return { name: `${kind} verified artifacts`, passed: passing, detail: passing ? `${files.length} verified input(s) match a successful validation report` : 'current verified content has no matching successful validation report' };
}

/** A TLA+ module = a `<name>.tla` + matching `<name>.cfg` pair. */
function tlaModulesInVerified(root: string): Map<string, string[]> {
  const modules = new Map<string, string[]>();
  for (const tla of collectByExtension(root, '.tla')) {
    const cfg = tla.replace(/\.tla$/, '.cfg');
    if (fs.existsSync(cfg)) modules.set(path.basename(tla, '.tla'), [tla, cfg]);
  }
  return modules;
}

/**
 * FINAL check for TLA+ by MODULE SET rather than file count (proposal §P0-2).
 *
 * The old check passed as long as `.tla`+`.cfg` file count ≥ 1 and *some* report
 * matched, so a single surviving module (after the destructive promote wiped the
 * rest) counted as full coverage. Here we reconstruct the module set that was
 * actually validated from the passing reports and require, module-by-module,
 * that its files are still present in verified/ AND that the current bytes match
 * a passing report. Any validated module missing from verified/ (the drop the
 * destructive promote caused) fails the gate with the missing module named.
 */
export function tlaVerifiedCheck(workDir: string): CheckResult {
  const name = 'tlaplus verified artifacts';
  const verifiedRoot = artifactPath(workDir, ARTIFACT_PATHS.tlaVerified);
  const validationDir = artifactPath(workDir, ARTIFACT_PATHS.tlaValidation);
  const modules = tlaModulesInVerified(verifiedRoot);
  const reports = readPassingReports(validationDir, 'tlaplus');

  if (reports.length === 0) {
    return { name, passed: false, detail: 'no passing TLA+ validation report with tool evidence found' };
  }

  const validatedModules = new Set<string>();
  for (const report of reports) {
    for (const sourcePath of report.sourcePaths) {
      if (sourcePath.endsWith('.tla')) validatedModules.add(path.basename(sourcePath, '.tla'));
    }
  }

  const missingFromVerified = [...validatedModules].filter(module => !modules.has(module)).sort();
  if (missingFromVerified.length > 0) {
    return {
      name,
      passed: false,
      detail: `${missingFromVerified.length} validated module(s) missing from verified/ (promote likely overwrote them): ${missingFromVerified.join(', ')}`,
    };
  }

  if (modules.size === 0) {
    return { name, passed: false, detail: 'verified source missing (no <module>.tla + <module>.cfg pair)' };
  }

  const unmatched: string[] = [];
  for (const [module, files] of modules) {
    if (!readMatchingReport(validationDir, 'tlaplus', hashFiles(files))) unmatched.push(module);
  }
  if (unmatched.length > 0) {
    return {
      name,
      passed: false,
      detail: `${unmatched.length} verified module(s) with no matching passing report (content changed after validation): ${unmatched.sort().join(', ')}`,
    };
  }

  return { name, passed: true, detail: `${modules.size} TLA+ module(s) verified and matched: ${[...modules.keys()].sort().join(', ')}` };
}

/** B4/FINAL: Lean4 verified artifacts — required only when IR has security/compliance NFR */
export function leanVerifiedCheck(workDir: string): CheckResult {
  try {
    const ir = JSON.parse(fs.readFileSync(path.join(workDir, 'srs-ir.json'), 'utf8')) as { nfrProfile?: { detectedCategories?: Array<{ category: string }> } };
    const leanRequired = ir.nfrProfile?.detectedCategories?.some(entry => entry.category === 'security' || entry.category === 'compliance') ?? false;
    return verifiedArtifactCheck(workDir, 'lean4', leanRequired);
  } catch {
    return { name: 'lean4 verified artifacts', passed: false, detail: 'srs-ir.json cannot be read' };
  }
}

/** IR node 的最小内联类型（避免依赖外部类型文件，保持脚本自包含） */
interface IrNodeLike {
  id: string;
  kind?: string;
  statement?: string;
  metadata?: { archLevel?: number; archName?: string } & Record<string, unknown>;
}

/** 从 IR nodes 中提取 arch-1 (level=1) 子系统名称列表 */
function extractArch1Subsystems(ir: unknown): string[] {
  const irObj = ir as { nodes?: IrNodeLike[] };
  const nodes = irObj?.nodes;
  if (!Array.isArray(nodes)) return [];
  return nodes
    .filter(n => n.kind === 'architecture' && n.metadata?.archLevel === 1)
    .map(n => n.metadata?.archName ?? n.statement ?? n.id)
    .filter((name): name is string => typeof name === 'string' && name.length > 0);
}

/**
 * P0-3: TLA+ 覆盖率门禁。
 * 检查 verified/ 中的 TLA+ 模块集是否覆盖 IR 中所有 arch-1 子系统。
 * 每个 arch-1 子系统应有同名 TLA+ 模块（或用户显式裁剪记录在 STATE.md）。
 */
export function checkTlaCoverage(workDir: string): CheckResult {
  const name = 'tlaplus arch-1 coverage';
  try {
    const ir = JSON.parse(fs.readFileSync(path.join(workDir, 'srs-ir.json'), 'utf8'));
    const arch1Subsystems = extractArch1Subsystems(ir);
    if (arch1Subsystems.length === 0) {
      return { name, passed: true, detail: 'no arch-1 subsystems in IR (nothing to cover)' };
    }
    const verifiedRoot = artifactPath(workDir, ARTIFACT_PATHS.tlaVerified);
    const modules = tlaModulesInVerified(verifiedRoot);
    const moduleNames = new Set(modules.keys());
    const missing = arch1Subsystems.filter(sub => !moduleNames.has(sub)).sort();
    if (missing.length > 0) {
      return {
        name,
        passed: false,
        detail: `${missing.length}/${arch1Subsystems.length} arch-1 subsystem(s) missing TLA+ module: ${missing.join(', ')} (if intentionally skipped, record in STATE.md with reason + residual risk)`,
      };
    }
    return { name, passed: true, detail: `${arch1Subsystems.length}/${arch1Subsystems.length} arch-1 subsystem(s) covered by TLA+ modules` };
  } catch {
    return { name, passed: false, detail: 'srs-ir.json cannot be read' };
  }
}

/**
 * P1-7: arch-1 覆盖率校验。
 * 检查每个 arch-1 子系统至少在 BDD、TLA+、Lean4（若需要）之一中有 verified 产物。
 * 完全无产物的子系统意味着该子系统未被任何形式化方法覆盖。
 */
export function checkArch1Coverage(workDir: string): CheckResult {
  const name = 'arch-1 formalization coverage';
  try {
    const ir = JSON.parse(fs.readFileSync(path.join(workDir, 'srs-ir.json'), 'utf8'));
    const arch1Subsystems = extractArch1Subsystems(ir);
    if (arch1Subsystems.length === 0) {
      return { name, passed: true, detail: 'no arch-1 subsystems in IR' };
    }
    // Collect all verified artifact names (basenames without extension)
    const verifiedDirs = [
      artifactPath(workDir, ARTIFACT_PATHS.bddVerified),
      artifactPath(workDir, ARTIFACT_PATHS.tlaVerified),
      artifactPath(workDir, ARTIFACT_PATHS.leanVerified),
    ];
    const artifactNames = new Set<string>();
    for (const dir of verifiedDirs) {
      if (!fs.existsSync(dir)) continue;
      for (const file of fs.readdirSync(dir)) {
        const base = path.basename(file).replace(/\.(feature|tla|lean)$/, '');
        artifactNames.add(base);
      }
    }
    const uncovered = arch1Subsystems.filter(sub => !artifactNames.has(sub)).sort();
    if (uncovered.length > 0) {
      return {
        name,
        passed: false,
        detail: `${uncovered.length}/${arch1Subsystems.length} arch-1 subsystem(s) have no verified artifact in BDD/TLA+/Lean4: ${uncovered.join(', ')}`,
      };
    }
    return { name, passed: true, detail: `${arch1Subsystems.length}/${arch1Subsystems.length} arch-1 subsystem(s) covered` };
  } catch {
    return { name, passed: false, detail: 'srs-ir.json cannot be read' };
  }
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

export function checkFormalArtifacts(workDir: string): CheckResult[] {
  try {
    // Read IR to determine lean requirement; if IR unreadable, fail.
    JSON.parse(fs.readFileSync(path.join(workDir, 'srs-ir.json'), 'utf8'));
    return [
      verifiedArtifactCheck(workDir, 'bdd', true),
      tlaVerifiedCheck(workDir),
      leanVerifiedCheck(workDir),
      // P0-3: TLA+ module set must cover all arch-1 subsystems
      checkTlaCoverage(workDir),
      // P1-7: each arch-1 subsystem must have at least one verified artifact
      checkArch1Coverage(workDir),
      // P0: 伪造报告检测
      checkReportAuthenticity(workDir, 'bdd'),
      checkReportAuthenticity(workDir, 'tlaplus'),
      checkReportAuthenticity(workDir, 'lean4'),
      checkReportArtifactRatio(workDir, 'bdd'),
      checkReportArtifactRatio(workDir, 'tlaplus'),
      checkReportArtifactRatio(workDir, 'lean4'),
    ];
  } catch { return [{ name: 'SRS IR available for artifact requirements', passed: false, detail: 'srs-ir.json cannot be read' }]; }
}

export function checkLegacyTlaSource(workDir: string): CheckResult {
  const hits = scanTlaSourceForPlaceholders(path.join(workDir, '5_formal', 'specs'));
  return { name: 'legacy TLA source scan', passed: hits.length === 0, detail: hits.length ? `Forbidden placeholders: ${hits.map(hit => `${hit.file}:${hit.marker}`).join(', ')}` : 'Legacy source scan clean' };
}

export function checkLegacyLeanSource(workDir: string): CheckResult {
  const hits = scanLeanSourceForPlaceholders(path.join(workDir, '5_formal', 'proofs'));
  return { name: 'legacy Lean source scan', passed: hits.length === 0, detail: hits.length ? `Forbidden placeholders: ${hits.map(hit => `${hit.file}:${hit.kind}`).join(', ')}` : 'Legacy source scan clean' };
}

export const checkTlaGraphExists = checkLegacyTlaSource;
export const checkLeanGraphExists = checkLegacyLeanSource;
