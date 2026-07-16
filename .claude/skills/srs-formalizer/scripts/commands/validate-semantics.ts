/**
 * validate-semantics.ts — SRS-IR 语义一致性校验命令
 *
 * CLI: npx tsx index.ts validate-semantics --workdir .srs_formalizer [--strict]
 *
 * 保留门禁校验器：4 类确定性校验，逻辑内联自原 lib/semantic/consistency-checker.ts
 * （该模块在重构中归档）。不重复 analyze-graph 的语义冲突/重复检测（LLM 域）。
 *   A. 类型一致性（IRNodeType/IREdgeType/NFRCategory 等枚举）
 *   B. 引用完整性（边端点、ID 唯一性、meta 计数、nfrProfile 引用）
 *   C. 属性完整性（各类节点必填字段）
 *   D. 阈值合法性（operator 枚举、value 有限数值）
 *
 * --strict: 发现错误时返回 status 'error'（用于流水线门禁）。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliResult } from '../types/index.js';
import type { SRSIR, NFRCategory, IRNodeType, IREdgeType } from '../types/srs-ir.js';
import { safeParseArg, validateWorkDir, refuseDirectInvocation } from '../lib/cli.js';

interface ValidationFinding {
  severity: 'error' | 'warning';
  category: 'type' | 'reference' | 'property' | 'threshold';
  message: string;
  path: string;
}

interface SemanticConsistencyReport {
  valid: boolean;
  errors: number;
  warnings: number;
  findings: ValidationFinding[];
  summary: {
    typeErrors: number;
    referenceErrors: number;
    propertyErrors: number;
    thresholdErrors: number;
  };
}

const VALID_NODE_TYPES: readonly IRNodeType[] = [
  'requirement', 'nfr', 'architecture', 'bdd_scenario',
  'tla_action', 'tla_invariant', 'lean_theorem', 'lean_lemma',
];
const VALID_EDGE_TYPES: readonly IREdgeType[] = [
  'depends_on', 'refines', 'conflicts_with', 'derived_from',
  'same_aspect', 'contains', 'nfr_impacts', 'nfr_constrains',
  'cross_file_depends', 'verifies', 'implements', 'proves', 'traces_to',
];
const VALID_NFR_CATEGORIES: readonly NFRCategory[] = [
  'performance', 'security', 'availability', 'compatibility', 'maintainability', 'compliance',
];
const VALID_OPERATORS = ['<', '<=', '>', '>=', '=='] as const;

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function checkTypeValidity(ir: SRSIR, findings: ValidationFinding[]): void {
  const validTypes = new Set<string>(VALID_NODE_TYPES);
  const validEdges = new Set<string>(VALID_EDGE_TYPES);
  const validCats = new Set<string>(VALID_NFR_CATEGORIES);
  const validConfidence = new Set(['high', 'medium', 'low']);
  const validCategory = new Set(['explicit', 'implicit', 'relational']);
  const validArchType = new Set(['Module', 'Actor', 'Constraint', 'Component', 'Interface']);
  const validLang = new Set(['zh', 'en']);

  if (!validLang.has(ir.meta.language)) {
    findings.push({ severity: 'error', category: 'type', message: `Invalid language "${ir.meta.language}"`, path: 'meta.language' });
  }

  for (let i = 0; i < ir.nodes.length; i++) {
    const n = ir.nodes[i]!;
    const p = `nodes[${i}]`;
    if (!validTypes.has(n.type)) {
      findings.push({ severity: 'error', category: 'type', message: `Invalid node type "${n.type}"`, path: `${p}.type` });
    }
    if (n.properties.category !== undefined && !validCategory.has(n.properties.category)) {
      findings.push({ severity: 'error', category: 'type', message: `Invalid category "${n.properties.category}"`, path: `${p}.properties.category` });
    }
    if (n.properties.confidence !== undefined && !validConfidence.has(n.properties.confidence)) {
      findings.push({ severity: 'error', category: 'type', message: `Invalid confidence "${n.properties.confidence}"`, path: `${p}.properties.confidence` });
    }
    if (n.properties.nfrCategory !== undefined && !validCats.has(n.properties.nfrCategory)) {
      findings.push({ severity: 'error', category: 'type', message: `Invalid nfrCategory "${n.properties.nfrCategory}"`, path: `${p}.properties.nfrCategory` });
    }
    if (n.properties.archType !== undefined && !validArchType.has(n.properties.archType)) {
      findings.push({ severity: 'error', category: 'type', message: `Invalid archType "${n.properties.archType}"`, path: `${p}.properties.archType` });
    }
  }

  for (let i = 0; i < ir.edges.length; i++) {
    const e = ir.edges[i]!;
    if (!validEdges.has(e.type)) {
      findings.push({ severity: 'error', category: 'type', message: `Invalid edge type "${e.type}"`, path: `edges[${i}].type` });
    }
  }
}

function checkReferenceIntegrity(ir: SRSIR, findings: ValidationFinding[]): void {
  const nodeIds = new Set(ir.nodes.map(n => n.id));
  const nodeIdsSeen = new Map<string, number>();
  const edgeIdsSeen = new Map<string, number>();

  for (let i = 0; i < ir.nodes.length; i++) {
    const n = ir.nodes[i]!;
    const idx = nodeIdsSeen.get(n.id);
    if (idx !== undefined) {
      findings.push({ severity: 'error', category: 'reference', message: `Duplicate node ID "${n.id}" (also at nodes[${idx}])`, path: `nodes[${i}].id` });
    } else {
      nodeIdsSeen.set(n.id, i);
    }
  }

  for (let i = 0; i < ir.edges.length; i++) {
    const e = ir.edges[i]!;
    const p = `edges[${i}]`;
    const idx = edgeIdsSeen.get(e.id);
    if (idx !== undefined) {
      findings.push({ severity: 'error', category: 'reference', message: `Duplicate edge ID "${e.id}" (also at edges[${idx}])`, path: `${p}.id` });
    } else {
      edgeIdsSeen.set(e.id, i);
    }
    if (!nodeIds.has(e.source)) {
      findings.push({ severity: 'error', category: 'reference', message: `Edge source "${e.source}" not in nodes`, path: `${p}.source` });
    }
    if (!nodeIds.has(e.target)) {
      findings.push({ severity: 'error', category: 'reference', message: `Edge target "${e.target}" not in nodes`, path: `${p}.target` });
    }
  }

  if (ir.meta.totalNodes !== ir.nodes.length) {
    findings.push({ severity: 'error', category: 'reference', message: `meta.totalNodes (${ir.meta.totalNodes}) != nodes.length (${ir.nodes.length})`, path: 'meta.totalNodes' });
  }
  if (ir.meta.totalEdges !== ir.edges.length) {
    findings.push({ severity: 'error', category: 'reference', message: `meta.totalEdges (${ir.meta.totalEdges}) != edges.length (${ir.edges.length})`, path: 'meta.totalEdges' });
  }

  for (let i = 0; i < ir.nfrProfile.detectedCategories.length; i++) {
    const dc = ir.nfrProfile.detectedCategories[i]!;
    for (const nid of dc.nodeIds) {
      if (!nodeIds.has(nid)) {
        findings.push({ severity: 'warning', category: 'reference', message: `NFR detectedCategory[${i}].nodeId "${nid}" not in nodes`, path: `nfrProfile.detectedCategories[${i}].nodeIds` });
      }
    }
  }
}

function checkPropertyCompleteness(ir: SRSIR, findings: ValidationFinding[]): void {
  for (let i = 0; i < ir.nodes.length; i++) {
    const n = ir.nodes[i]!;
    const p = `nodes[${i}]`;
    if (!n.source.filePath || n.source.filePath.trim() === '') {
      findings.push({ severity: 'error', category: 'property', message: 'Missing source.filePath', path: `${p}.source.filePath` });
    }
    if (!n.source.shardId || n.source.shardId.trim() === '') {
      findings.push({ severity: 'error', category: 'property', message: 'Missing source.shardId', path: `${p}.source.shardId` });
    }
    if (n.type === 'requirement' || n.type === 'nfr') {
      const stmt = n.properties.statement;
      if (!stmt || stmt.trim() === '') {
        findings.push({ severity: 'error', category: 'property', message: `Missing statement on ${n.type} node`, path: `${p}.properties.statement` });
      }
    }
    if (n.type === 'nfr' && n.properties.nfrCategory === undefined) {
      findings.push({ severity: 'error', category: 'property', message: 'Missing nfrCategory on nfr node', path: `${p}.properties.nfrCategory` });
    }
    if (n.type === 'architecture' && n.properties.archType === undefined) {
      findings.push({ severity: 'warning', category: 'property', message: 'Missing archType on architecture node', path: `${p}.properties.archType` });
    }
  }
}

function checkThresholdValidity(ir: SRSIR, findings: ValidationFinding[]): void {
  const validOps = new Set<string>(VALID_OPERATORS);
  for (let i = 0; i < ir.nodes.length; i++) {
    const n = ir.nodes[i]!;
    const t = n.properties.nfrThreshold;
    if (!t) continue;
    const p = `nodes[${i}].properties.nfrThreshold`;
    if (!isFiniteNumber(t.value)) {
      findings.push({ severity: 'error', category: 'threshold', message: `Invalid threshold value (non-finite: ${String(t.value)})`, path: `${p}.value` });
    }
    if (!validOps.has(t.operator)) {
      findings.push({ severity: 'error', category: 'threshold', message: `Invalid operator "${t.operator}"`, path: `${p}.operator` });
    }
    if (!t.unit || t.unit.trim() === '') {
      findings.push({ severity: 'error', category: 'threshold', message: 'Missing unit', path: `${p}.unit` });
    }
    if (!t.metric || t.metric.trim() === '') {
      findings.push({ severity: 'error', category: 'threshold', message: 'Missing metric', path: `${p}.metric` });
    }
    if (n.properties.nfrCategory === undefined) {
      findings.push({ severity: 'warning', category: 'threshold', message: 'Threshold present but nfrCategory missing', path: `${p}` });
    }
  }
  const cov = ir.nfrProfile.overallCoverage;
  if (!isFiniteNumber(cov) || cov < 0 || cov > 1) {
    findings.push({ severity: 'error', category: 'threshold', message: `overallCoverage ${cov} out of range [0, 1]`, path: 'nfrProfile.overallCoverage' });
  }
}

function checkSemanticConsistency(ir: SRSIR): SemanticConsistencyReport {
  const findings: ValidationFinding[] = [];
  checkTypeValidity(ir, findings);
  checkReferenceIntegrity(ir, findings);
  checkPropertyCompleteness(ir, findings);
  checkThresholdValidity(ir, findings);

  const errors = findings.filter(f => f.severity === 'error').length;
  const warnings = findings.filter(f => f.severity === 'warning').length;

  return {
    valid: errors === 0,
    errors,
    warnings,
    findings,
    summary: {
      typeErrors: findings.filter(f => f.category === 'type' && f.severity === 'error').length,
      referenceErrors: findings.filter(f => f.category === 'reference' && f.severity === 'error').length,
      propertyErrors: findings.filter(f => f.category === 'property' && f.severity === 'error').length,
      thresholdErrors: findings.filter(f => f.category === 'threshold' && f.severity === 'error').length,
    },
  };
}

export async function main(args: string[]): Promise<CliResult> {
  let workDirArg: string | null;
  let strictMode = false;
  try {
    workDirArg = safeParseArg(args, '--workdir');
    strictMode = args.includes('--strict');
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  if (!workDirArg) return { status: 'error', message: 'Missing required argument: --workdir' };

  let workDir: string;
  try { workDir = validateWorkDir(workDirArg); }
  catch (err) { return { status: 'error', message: (err as Error).message }; }

  const irPath = path.join(workDir, 'srs-ir.json');
  if (!fs.existsSync(irPath)) {
    return { status: 'error', message: `srs-ir.json not found at ${irPath}` };
  }

  let ir: SRSIR;
  try { ir = JSON.parse(fs.readFileSync(irPath, 'utf-8')) as SRSIR; }
  catch (err) {
    return { status: 'error', message: `Failed to parse srs-ir.json: ${(err as Error).message}` };
  }

  const report = checkSemanticConsistency(ir);

  if (strictMode && !report.valid) {
    return {
      status: 'error',
      message: `Semantic validation failed: ${report.errors} error(s), ${report.warnings} warning(s)`,
      data: report,
    };
  }

  return {
    status: 'ok',
    message: `Semantic validation complete: ${report.errors} error(s), ${report.warnings} warning(s)`,
    data: report,
  };
}

refuseDirectInvocation(import.meta.url);
