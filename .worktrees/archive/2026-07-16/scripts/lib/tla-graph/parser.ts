/**
 * TLA+ parser — reads a .tla file and produces a ParsedTlaModule.
 */

import * as fs from 'node:fs';

export interface ParsedTlaModule {
  name: string;
  parent?: string;
  siblings: string[];
  children: string[];
  constants: string[];
  variables: string[];
  actions: Array<{ name: string; body: string }>;
  invariants: Array<{ name: string; body: string }>;
  rawText: string;
}

export function parseTlaFile(filePath: string): ParsedTlaModule | null {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n');

  const mod: ParsedTlaModule = {
    name: '',
    siblings: [],
    children: [],
    constants: [],
    variables: [],
    actions: [],
    invariants: [],
    rawText: raw,
  };

  // Extract module name
  const moduleMatch = raw.match(/----\s*MODULE\s+(\w+)\s*----/);
  if (!moduleMatch) return null;
  mod.name = moduleMatch[1]!;

  // Extract hierarchical annotations from header comments
  for (const line of lines) {
    const parentMatch = line.match(/\\\*\s*上级:\s*(.+)/);
    const siblingMatch = line.match(/\\\*\s*同级:\s*(.+)/);
    const childMatch = line.match(/\\\*\s*下级:\s*(.+)/);

    if (parentMatch) mod.parent = parentMatch[1]!.trim();
    if (siblingMatch) mod.siblings = siblingMatch[1]!.trim().split(/\s+/).filter(Boolean);
    if (childMatch) mod.children = childMatch[1]!.trim().split(/\s+/).filter(Boolean);
  }

  // Extract CONSTANTS
  const constMatch = raw.match(/CONSTANTS?\s+([\s\S]*?)(?=\n\S|\n\s*VARIABLE|\n\s*ASSUME|$)/i);
  if (constMatch) {
    mod.constants = constMatch[1]!.split(',').map(s => s.trim()).filter(s => s.length > 0 && !s.startsWith('\\'));
  }

  // Extract VARIABLES
  const varMatch = raw.match(/VARIABLES?\s+([\s\S]*?)(?=\n\S|\n\s*$)/i);
  if (varMatch) {
    mod.variables = varMatch[1]!.split(',').map(s => s.trim()).filter(s => s.length > 0 && !s.startsWith('\\'));
  }

  // Extract named actions (definitions with ==)
  const actionRe = /^(\w+)\s*==\s*(.+)$/gm;
  let am: RegExpExecArray | null;
  while ((am = actionRe.exec(raw)) !== null) {
    const name = am[1]!;
    const body = am[2]!.trim();
    // Skip built-in operators and type invariants
    if (name === 'TypeOK' || name === 'Init' || name === 'Next') {
      if (name === 'TypeOK') {
        mod.invariants.push({ name: 'TypeOK', body });
      }
      mod.actions.push({ name, body });
      continue;
    }
    // Heuristic: if definition contains /\ or \/ it's an invariant candidate
    if (body.includes('/\\') || body.includes('\\/')) {
      if (name.match(/^(Inv|Invariant|Prop)/i) || body.toLowerCase().includes('invariant')) {
        mod.invariants.push({ name, body });
      }
    }
    mod.actions.push({ name, body });
  }

  // Also check for explicit INVARIANT declarations
  const invRe = /INVARIANT\s+(\w+)/gi;
  let im: RegExpExecArray | null;
  while ((im = invRe.exec(raw)) !== null) {
    const invName = im[1]!;
    if (!mod.invariants.some(i => i.name === invName)) {
      mod.invariants.push({ name: invName, body: '' });
    }
  }

  // Extract INSTANCE (subsystem imports)
  const instRe = /INSTANCE\s+(\w+)/gi;
  let insm: RegExpExecArray | null;
  while ((insm = instRe.exec(raw)) !== null) {
    mod.children.push(insm[1]!);
  }

  return mod;
}
