/**
 * Lean 4 parser — reads a .lean file and produces a ParsedLeanFile.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface ParsedLeanFile {
  fileName: string;
  imports: string[];
  theorems: Array<{ name: string; statement: string; usedLemmas: string[] }>;
  lemmas: Array<{ name: string; statement: string }>;
  axioms: Array<{ name: string; statement: string }>;
  hasSorry: boolean;
}

export function parseLeanFile(filePath: string): ParsedLeanFile | null {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const fileName = path.basename(filePath);

  const parsed: ParsedLeanFile = {
    fileName,
    imports: [],
    theorems: [],
    lemmas: [],
    axioms: [],
    hasSorry: false,
  };

  // Extract imports
  const importRe = /^import\s+(.+)$/gm;
  let im: RegExpExecArray | null;
  while ((im = importRe.exec(raw)) !== null) {
    parsed.imports.push(im[1]!.trim());
  }

  // Detect sorry
  if (raw.includes('sorry')) {
    parsed.hasSorry = true;
  }

  // Extract theorem declarations (top-level entries)
  // Pattern: theorem name (params) : type := proof
  const theoremRe = /^theorem\s+(\w+)\s*(\([^)]*\))?\s*:\s*(.+?)(?::=|$)/gm;
  let tm: RegExpExecArray | null;
  while ((tm = theoremRe.exec(raw)) !== null) {
    const name = tm[1]!;
    const statement = (tm[3] || '').trim();

    // Find lemmas referenced in the proof body
    const proofBody = extractProofBody(raw, tm.index);
    const usedLemmas = findReferencedNames(proofBody, parsed.lemmas.map(l => l.name));

    parsed.theorems.push({ name, statement, usedLemmas });
  }

  // Extract lemma declarations
  const lemmaRe = /^lemma\s+(\w+)\s*(\([^)]*\))?\s*:\s*(.+?)(?::=|$)/gm;
  let lm: RegExpExecArray | null;
  while ((lm = lemmaRe.exec(raw)) !== null) {
    parsed.lemmas.push({
      name: lm[1]!,
      statement: (lm[3] || '').trim(),
    });
  }

  // Detect axioms (quality issue)
  const axiomRe = /^axiom\s+(\w+)\s*(\([^)]*\))?\s*:\s*(.+?)(?::=|$)/gm;
  let am: RegExpExecArray | null;
  while ((am = axiomRe.exec(raw)) !== null) {
    parsed.axioms.push({
      name: am[1]!,
      statement: (am[3] || '').trim(),
    });
  }

  return parsed;
}

function extractProofBody(raw: string, startIndex: number): string {
  // Extract from := to end of proof block
  const afterDecl = raw.slice(startIndex);
  const colonEq = afterDecl.indexOf(':=');
  if (colonEq === -1) return '';
  return afterDecl.slice(colonEq + 2);
}

function findReferencedNames(body: string, knownLemmas: string[]): string[] {
  return knownLemmas.filter(name => body.includes(name));
}
