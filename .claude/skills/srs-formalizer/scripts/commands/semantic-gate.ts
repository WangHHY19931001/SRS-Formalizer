/**
 * semantic-gate.ts — 二级语义验证闸门（P2-12）
 *
 * CLI: npx tsx index.ts semantic-gate --workdir <wd> --kind <bdd|tlaplus|lean4> [--generate-template]
 *
 * 脚本只做两件事（不调用 LLM）：
 * 1. --generate-template: 扫描 draft 产物，生成评分模板 JSON（供 LLM Verifier 填写）
 * 2. 无 --generate-template: 校验对应 semantic-report 存在且 verdict=APPROVED
 *
 * 语义评分本身由 Agent（LLM Verifier 子代理）完成，脚本只做格式校验与存在性检查。
 * 在 validate-* --strict --promote 之前必须先通过本闸门。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliResult } from '../types/index.js';
import { safeParseArg, validateWorkDir, refuseDirectInvocation } from '../lib/cli.js';
import { ARTIFACT_PATHS, artifactPath } from '../lib/artifacts/paths.js';
import { collectByExtension } from '../lib/artifacts/validation-report.js';

const KIND_CONFIG: Record<string, { draftPath: keyof typeof ARTIFACT_PATHS; ext: string; scoringCriteria: string[] }> = {
  bdd: {
    draftPath: 'bddDraft',
    ext: '.feature',
    scoringCriteria: [
      'Then 为可观测断言（非需求复述）',
      'When 绑定具体触发事件',
      '约束域含否定场景',
      '每个 SRS 需求至少一个可执行场景',
    ],
  },
  tlaplus: {
    draftPath: 'tlaDraft',
    ext: '.tla',
    scoringCriteria: [
      'Next 为显式转换对（非 var\' \\in TypeSet）',
      '6 类 NFR 不变式非平凡且互不相同',
      'TypeOK 覆盖所有状态变量',
      '每个 SRS 状态转换与至少一个 Action 追溯',
    ],
  },
  lean4: {
    draftPath: 'leanDraft',
    ext: '.lean',
    scoringCriteria: [
      '每条定理后件为实质命题（非 True/→ True）',
      '证明体非同义反复（非 := h / := by exact h）',
      '可追溯到 IR-NODE id',
      '无 sorry/admit/axiom',
    ],
  },
};

export async function main(args: string[]): Promise<CliResult> {
  let workDirArg: string | null;
  let kindArg: string | null;
  try {
    workDirArg = safeParseArg(args, '--workdir');
    kindArg = safeParseArg(args, '--kind');
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }
  if (!workDirArg) return { status: 'error', message: 'Missing required argument: --workdir' };
  if (!kindArg) return { status: 'error', message: 'Missing required argument: --kind' };

  const config = KIND_CONFIG[kindArg];
  if (!config) {
    return { status: 'error', message: `Invalid --kind: "${kindArg}". Valid: ${Object.keys(KIND_CONFIG).join(', ')}` };
  }

  let workDir: string;
  try { workDir = validateWorkDir(workDirArg); } catch (err) { return { status: 'error', message: (err as Error).message }; }
  const generateTemplate = args.includes('--generate-template');
  const draftDir = artifactPath(workDir, ARTIFACT_PATHS[config.draftPath]);
  const reportDir = path.join(workDir, 'outputs', 'semantic-reports');
  fs.mkdirSync(reportDir, { recursive: true });

  if (!fs.existsSync(draftDir)) {
    return { status: 'error', message: `Draft directory not found: ${draftDir}` };
  }

  const draftFiles = collectByExtension(draftDir, config.ext).sort();
  if (draftFiles.length === 0) {
    return { status: 'error', message: `No ${config.ext} draft files found in ${draftDir}` };
  }

  if (generateTemplate) {
    // Generate scoring template JSON for each draft file
    const templates: string[] = [];
    for (const file of draftFiles) {
      const baseName = path.basename(file, config.ext);
      const templatePath = path.join(reportDir, `${kindArg}-${baseName}.json`);
      const template = {
        artifactKind: kindArg,
        artifactPath: path.relative(workDir, file),
        verdict: 'PENDING' as const,
        score: 0,
        issues: [] as string[],
        scoringCriteria: config.scoringCriteria,
        reviewedAt: null as string | null,
        reviewer: null as string | null,
      };
      fs.writeFileSync(templatePath, JSON.stringify(template, null, 2), 'utf-8');
      templates.push(templatePath);
    }
    return { status: 'ok', data: { templatePath: templates[0], allTemplates: templates, count: templates.length } };
  }

  // Validate: each draft file must have a matching APPROVED report
  const failures: string[] = [];
  for (const file of draftFiles) {
    const baseName = path.basename(file, config.ext);
    const reportPath = path.join(reportDir, `${kindArg}-${baseName}.json`);
    if (!fs.existsSync(reportPath)) {
      failures.push(`${baseName}: no semantic report (run with --generate-template first, have LLM Verifier fill it, then re-run)`);
      continue;
    }
    try {
      const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as { verdict?: string; issues?: string[] };
      if (report.verdict !== 'APPROVED') {
        const issues = report.issues?.length ? ` (${report.issues.length} issue(s): ${report.issues.slice(0, 3).join('; ')})` : '';
        failures.push(`${baseName}: verdict=${report.verdict}${issues}`);
      }
    } catch {
      failures.push(`${baseName}: semantic report is not valid JSON`);
    }
  }

  if (failures.length > 0) {
    return { status: 'error', message: `Semantic gate failed for ${failures.length}/${draftFiles.length} artifact(s): ${failures.join('; ')}` };
  }

  return { status: 'ok', data: { checked: draftFiles.length, allApproved: true } };
}

refuseDirectInvocation(import.meta.url);
