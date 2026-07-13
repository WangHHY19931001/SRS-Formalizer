import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SRSIR, IRNode, NFRThreshold, NFRCategory } from '../../types/srs-ir.js';
import type { Emitter, EmitResult } from './types.js';

const INVARIANT_CATEGORIES: NFRCategory[] = [
  'performance',
  'security',
  'availability',
  'compatibility',
  'maintainability',
  'compliance',
];

const NFR_CATEGORY_TO_INV_PREFIX: Record<NFRCategory, string> = {
  performance: 'Perf',
  security: 'Sec',
  availability: 'Avail',
  compatibility: 'Compat',
  maintainability: 'Maint',
  compliance: 'Compl',
};

function formatThresholdInv(threshold: NFRThreshold): string {
  const varName = threshold.metric.replace(/[^a-zA-Z0-9_]/g, '_');
  return `${varName} ${threshold.operator} ${threshold.value}`;
}

function sanitizeTlaName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
}

interface ModuleGroup {
  module: string;
  requirements: IRNode[];
  nfrs: IRNode[];
  architectures: IRNode[];
}

function groupByModule(nodes: IRNode[]): Map<string, ModuleGroup> {
  const map = new Map<string, ModuleGroup>();
  for (const node of nodes) {
    let group = map.get(node.module);
    if (!group) {
      group = { module: node.module, requirements: [], nfrs: [], architectures: [] };
      map.set(node.module, group);
    }
    if (node.type === 'requirement') {
      group.requirements.push(node);
    } else if (node.type === 'nfr') {
      group.nfrs.push(node);
    } else if (node.type === 'architecture') {
      group.architectures.push(node);
    }
  }
  return map;
}

function generateInvariants(nfrs: IRNode[]): string {
  const lines: string[] = [];
  for (const cat of INVARIANT_CATEGORIES) {
    const catNfrs = nfrs.filter(n => n.properties.nfrCategory === cat);
    if (catNfrs.length === 0) continue;
    const prefix = NFR_CATEGORY_TO_INV_PREFIX[cat];
    for (const nfr of catNfrs) {
      const threshold = nfr.properties.nfrThreshold;
      const metric = threshold?.metric ?? nfr.labels.join('_');
      const sanitized = sanitizeTlaName(metric);
      const invName = `${prefix}${sanitized.charAt(0).toUpperCase() + sanitized.slice(1)}Inv`;
      if (threshold) {
        lines.push(`\\* SRS NFR: ${nfr.id}`);
        lines.push(`${invName} == ${formatThresholdInv(threshold)}`);
      } else {
        const maxConst = `Max${sanitized.charAt(0).toUpperCase() + sanitized.slice(1)}`;
        lines.push(`\\* SRS NFR: ${nfr.id}`);
        lines.push(`${invName} == ${sanitizeTlaName(metric)} \\leq ${maxConst}  \\* LLM_FILL: 从 SRS 或行业标准定义阈值`);
      }
      lines.push('');
    }
  }
  return lines.join('\n');
}

function buildConstants(group: ModuleGroup): string[] {
  const consts: Set<string> = new Set<string>();
  for (const nfr of group.nfrs) {
    const threshold = nfr.properties.nfrThreshold;
    if (!threshold) {
      const metric = nfr.labels.join('_');
      const sanitized = sanitizeTlaName(metric);
      consts.add(`Max${sanitized.charAt(0).toUpperCase() + sanitized.slice(1)}`);
    }
  }
  for (const arch of group.architectures) {
    const stmt = arch.properties.statement;
    if (stmt) {
      const words = stmt.split(/\s+/).filter(w => /^[A-Z][a-zA-Z0-9_]*$/.test(w));
      for (const w of words) consts.add(w);
    }
  }
  return Array.from(consts);
}

function hasL2L3Boundary(group: ModuleGroup): boolean {
  return group.architectures.length > 0;
}

function generateTlaModule(group: ModuleGroup): string {
  const safeName = sanitizeTlaName(group.module);
  const constants = buildConstants(group);
  const invariants = generateInvariants(group.nfrs);
  const l2l3Mark = hasL2L3Boundary(group)
    ? '\\* L2->L3 拆解边界 (Architecture nodes detected)'
    : '';
  const componentNote = group.architectures.length > 0
    ? `\\* Arch components: ${group.architectures.map(a => a.properties.archType ?? 'Component').join(', ')}`
    : '';

  const body = `---- MODULE ${safeName} ----
EXTENDS Naturals, Sequences, TLC
CONSTANTS ${constants.length > 0 ? constants.join(', ') : '\\* LLM_FILL: 常量列表'}

VARIABLES \\* LLM_FILL: 系统状态变量列表

Init ==
  \\* LLM_FILL: 初始状态定义

Next ==
  \\* LLM_FILL: 状态转换定义，涵盖所有 Action

\\* Generated from SRS IR NFR nodes
${invariants}
Spec == Init /\\ [][Next]_vars
=============================================================================
---- MODULE \`${safeName}\` ----
${l2l3Mark ? '\n' + l2l3Mark + '\n' : ''}${componentNote ? componentNote + '\n' : ''}`;

  return body;
}

function generateTlaCfg(_group: ModuleGroup): string {
  return `SPECIFICATION Spec
INVARIANT TypeOK
CHECK_DEADLOCK TRUE
`;
}

export class TLAEmitter implements Emitter {
  readonly name = 'tlaSpec';
  readonly description = 'Generate TLA+ specifications from SRS-IR';
  readonly outputDir = '5_formal/specs';

  emit(ir: SRSIR, workdir: string): EmitResult {
    const groups = groupByModule(ir.nodes);
    const outDir = path.join(workdir, this.outputDir);
    fs.mkdirSync(outDir, { recursive: true });
    const files: string[] = [];
    let moduleCount = 0;

    for (const [, group] of groups) {
      if (group.requirements.length === 0 && group.nfrs.length === 0) continue;
      const tlaContent = generateTlaModule(group);
      const cfgContent = generateTlaCfg(group);
      const safeName = sanitizeTlaName(group.module);

      const tlaPath = path.join(outDir, `${safeName}.tla`);
      fs.writeFileSync(tlaPath, tlaContent, 'utf-8');
      files.push(tlaPath);

      const cfgPath = path.join(outDir, `${safeName}.cfg`);
      fs.writeFileSync(cfgPath, cfgContent, 'utf-8');
      files.push(cfgPath);

      moduleCount++;
    }

    return {
      files,
      fileCount: files.length,
      metadata: {
        moduleCount,
        totalNodes: ir.nodes.length,
      },
    };
  }
}
