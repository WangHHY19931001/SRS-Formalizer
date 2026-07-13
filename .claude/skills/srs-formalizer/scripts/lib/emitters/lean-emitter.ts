import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SRSIR, IRNode } from '../../types/srs-ir.js';
import type { Emitter, EmitResult } from './types';

function sanitizeLeanName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^(\d)/, '_$1');
}

function extractStatement(node: IRNode): string {
  const stmt = node.properties.statement;
  if (stmt) return stmt;
  const cat = node.properties.nfrCategory;
  if (cat) return `${cat} requirement for module ${node.module}`;
  return `Property of module ${node.module}`;
}

function isTriggered(ir: SRSIR): boolean {
  for (const entry of ir.nfrProfile.detectedCategories) {
    if (entry.category === 'security' || entry.category === 'compliance') {
      return true;
    }
  }
  return false;
}

function filterSecurityComplianceNfrs(nodes: IRNode[]): IRNode[] {
  return nodes.filter(n =>
    n.type === 'nfr' &&
    (n.properties.nfrCategory === 'security' || n.properties.nfrCategory === 'compliance'),
  );
}

interface ModuleGroup {
  module: string;
  nfrs: IRNode[];
}

function groupByModule(nodes: IRNode[]): Map<string, ModuleGroup> {
  const map = new Map<string, ModuleGroup>();
  for (const node of nodes) {
    let group = map.get(node.module);
    if (!group) {
      group = { module: node.module, nfrs: [] };
      map.set(node.module, group);
    }
    group.nfrs.push(node);
  }
  return map;
}

function generateTheoremSignature(node: IRNode): string {
  const stmt = extractStatement(node);
  const words = stmt.split(/\s+/).filter(w => w.length > 0);
  const capWords = words.map((w, i) =>
    i === 0
      ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
      : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
  );
  const theoremName = sanitizeLeanName(capWords.join('')).slice(0, 60);
  return theoremName || 'Property';
}

function generateLemmaSuggestions(node: IRNode): string[] {
  const cat = node.properties.nfrCategory;
  const suggestions: string[] = [];
  if (cat === 'security') {
    suggestions.push('auth_lemma');
    suggestions.push('confidentiality_lemma');
    suggestions.push('integrity_lemma');
  } else if (cat === 'compliance') {
    suggestions.push('regulatory_lemma');
    suggestions.push('audit_lemma');
    suggestions.push('traceability_lemma');
  }
  return suggestions;
}

function generateLeanModule(group: ModuleGroup): string {
  const lines: string[] = [];
  lines.push('import Mathlib');
  lines.push('');
  lines.push(`/-! Module: ${group.module}`);
  lines.push('');
  lines.push('Generated from SRS IR NFR nodes (security/compliance).');
  lines.push('Proofs are skeletal — each `sorry` must be filled by a Lean 4 proof.');
  lines.push('-/');
  lines.push('');

  for (const nfr of group.nfrs) {
    const description = extractStatement(nfr);
    const theoremName = generateTheoremSignature(nfr);
    lines.push(`/-- ${description} --/`);
    lines.push(`theorem ${theoremName} : True := by`);
    lines.push('  sorry  -- LLM_FILL: 构造性证明策略');
    lines.push('');

    const lemmas = generateLemmaSuggestions(nfr);
    if (lemmas.length > 0) {
      lines.push(`-- Suggested lemma decomposition for ${theoremName}:`);
      for (const lemma of lemmas) {
        lines.push(`--   lemma ${lemma} : True := by`);
        lines.push('--     sorry');
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

export class LeanEmitter implements Emitter {
  readonly name = 'leanProof';
  readonly description = 'Generate Lean 4 proof skeletons from SRS-IR';
  readonly outputDir = '5_formal/proofs';

  emit(ir: SRSIR, workdir: string): EmitResult {
    if (!isTriggered(ir)) {
      return { files: [], fileCount: 0, metadata: { triggered: false } };
    }

    const securityComplianceNfrs = filterSecurityComplianceNfrs(ir.nodes);
    if (securityComplianceNfrs.length === 0) {
      return { files: [], fileCount: 0, metadata: { triggered: false, reason: 'no security/compliance NFR nodes' } };
    }

    const groups = groupByModule(securityComplianceNfrs);
    const outDir = path.join(workdir, this.outputDir);
    fs.mkdirSync(outDir, { recursive: true });
    const files: string[] = [];

    for (const [, group] of groups) {
      const content = generateLeanModule(group);
      const safeName = sanitizeLeanName(group.module);
      const fp = path.join(outDir, `${safeName}.lean`);
      fs.writeFileSync(fp, content, 'utf-8');
      files.push(fp);
    }

    return {
      files,
      fileCount: files.length,
      metadata: {
        triggered: true,
        moduleCount: groups.size,
        nfrCount: securityComplianceNfrs.length,
      },
    };
  }
}
