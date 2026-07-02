/**
 * init.ts — 初始化 .srs_formalizer 工作目录
 *
 * CLI: npx tsx index.ts init --output .srs_formalizer
 * 幂等操作 + 路径安全校验。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliResult } from '../types/index.js';
import { safeParseArg, validateWorkDir } from '../lib/cli.js';

const SUBDIRS = [
  // S0: 发现与确认
  'S0',
  // S1: 预处理 — shards tracked via shard_index.json
  '_ctx',
  // S2: 需求提取 + 架构分解
  '2_extract/r1-explicit',
  '2_extract/r2-implicit',
  '2_extract/r3-relational',
  '2_extract/architecture',
  // S3: 图谱构建
  '3_graph/graph',
  '3_graph/analysis/subagent_prompts',
  // S4: BDD
  '4_bdd/features',
  // S5: 形式化
  '5_formal/specs',
  '5_formal/proofs',
  // S6: 输出
  '6_outputs/knowledge_graph',
  '6_outputs/brainstorming',
  // 备份
  'backups',
];

import { writeChecklists } from '../lib/checklists.js';

function generateStateTemplate(): string {
  const now = new Date().toISOString();
  return `# SRS Formalizer — 状态追踪

| 字段 | 值 |
|------|-----|
| 当前阶段 | S0 |
| 开始时间 | ${now} |
| 状态 | 🔄 |

## 阶段完成度

| 阶段 | 状态 | 完成时间 |
|------|------|----------|
| S0 发现确认 | 🔄 | — |
| S1 预处理 | 🔄 | — |
| S2 需求提取 | ⏳ | — |
| S3 图谱构建 | ⏳ | — |
| S4 BDD 生成 | ⏳ | — |
| S5 形式化 | ⏳ | — |
| S6 验收闸门 | ⏳ | — |

## 形式化触发标志

| 模块 | TLA+ | Lean 4 | 判定依据 |
|------|:----:|:------:|----------|
| — | — | — | S0 分析报告 |

> 注：S0 阶段根据 SRS 内容自动判定。TLA+ 触发条件：微服务协作/并行进程/分布式锁/共识协议/跨服务状态机。Lean 4 触发条件：非常见算法/安全关键/密码学协议/金融核心/自定义数据结构。

## 决策记录

| ID | 时间 | 决策 | 原因 |
|----|------|------|------|

## 阻塞点

| 阻塞ID | 时间 | 原因 | 迭代次数 | 状态 |
|--------|------|------|:-------:|------|
（无）

## 收敛状态

| 字段 | 值 |
|------|-----|
| 当前迭代 | 0/5 |
| 最后一致性检查 | — |
| 未通过检查 | — |
| 收敛状态 | 待开始 |
`;
}

export async function main(args: string[]): Promise<CliResult> {
  let outputArg: string | null;
  try {
    outputArg = safeParseArg(args, '--output');
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  if (!outputArg) {
    return { status: 'error', message: 'Missing required argument: --output' };
  }

  let workDir: string;
  try {
    workDir = validateWorkDir(outputArg);
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  if (fs.existsSync(workDir)) {
    return { status: 'ok', message: '目录已存在，跳过创建' };
  }

  fs.mkdirSync(workDir, { recursive: true });
  for (const sub of SUBDIRS) {
    fs.mkdirSync(path.join(workDir, sub), { recursive: true });
  }

  fs.writeFileSync(path.join(workDir, 'STATE.md'), generateStateTemplate(), 'utf-8');
  writeChecklists(workDir);

  return { status: 'ok' };
}

// Guard: refuse direct invocation (must go through index.ts)
import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
