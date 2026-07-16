/**
 * Lean 4 fixture generator.
 * Parses .lean files and generates property-based test skeletons via template-engine.
 */

import type { Framework, FixtureFile, ParsedTheorem } from './types.js';
import { loadTemplate, renderTemplate } from './template-engine.js';

/** Detailed parse result for a single theorem */
export interface TheoremDetail {
  name: string;
  tactics: string[];
  hypothesisVars: string[];
}

/** Parse a Lean 4 file to extract theorems */
export function parseLeanFile(content: string): ParsedTheorem[] {
  const theorems: ParsedTheorem[] = [];
  const imports: string[] = [];

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('import ')) {
      imports.push(trimmed.slice(7).trim());
    }
  }

  const theoremRegex = /^(?:private\s+|protected\s+)?theorem\s+(\w+)([^:]*?):\s*(.+?)(?=\s*:=|$)/gm;
  let match: RegExpExecArray | null;
  while ((match = theoremRegex.exec(content)) !== null) {
    if (match[1] && match[3]) {
      theorems.push({
        name: match[1],
        typeSignature: (match[2] + match[3]).trim(),
        imports: [...imports],
        hypothesisVars: [],
      });
    }
  }

  return theorems;
}

/** Parse a single theorem and extract detailed information */
export function parseTheorem(content: string): TheoremDetail {
  const nameMatch = content.match(/theorem\s+(\w+)/);
  const name = nameMatch?.[1] ?? 'unknown';

  const tactics: string[] = [];
  const hypothesisVars: string[] = [];

  const tacticKeywords = ['induction', 'simp', 'exact', 'rfl', 'omega', 'decide', 'ring', 'norm_num', 'aesop'];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    const lower = trimmed.toLowerCase();
    for (const kw of tacticKeywords) {
      if (lower.startsWith(kw) || lower.includes(kw + ' ')) {
        if (!tactics.includes(kw)) tactics.push(kw);
      }
    }
  }

  const paramRegex = /\((\w+)\s*:\s*([^)]+)\)/g;
  let paramMatch: RegExpExecArray | null;
  while ((paramMatch = paramRegex.exec(content)) !== null) {
    if (paramMatch[1] && paramMatch[2]) {
      hypothesisVars.push(`${paramMatch[1]} : ${paramMatch[2]}`);
    }
  }

  const inductionMatch = content.match(/induction\s+(\w+)/);
  if (inductionMatch?.[1]) {
    const varName = inductionMatch[1];
    if (!hypothesisVars.some(h => h.startsWith(varName + ' '))) {
      const typeMatch = content.match(new RegExp(`\\(${varName}\\s*:\\s*([^)]+)\\)`));
      if (typeMatch?.[1]) {
        hypothesisVars.unshift(`${varName} : ${typeMatch[1]}`);
      }
    }
  }

  const patternArmRegex = /\|\s*\w+\s+((?:\w+\s*)+)=>\s/g;
  let armMatch: RegExpExecArray | null;
  while ((armMatch = patternArmRegex.exec(content)) !== null) {
    if (armMatch[1]) {
      const vars = armMatch[1].trim().split(/\s+/);
      for (const v of vars) {
        if (v && !hypothesisVars.some(h => h.startsWith(v + ' ')) && !hypothesisVars.includes(v)) {
          hypothesisVars.push(v);
        }
      }
    }
  }

  return { name, tactics, hypothesisVars };
}

/** Generate fixture files for a given framework */
export function generateLeanFixtures(leanContent: string, framework: Framework): FixtureFile[] {
  const theorems = parseLeanFile(leanContent);
  const safeName = theorems[0]?.name
    ? theorems[0].name.replace(/[/\\?%*:|"<>]/g, '_')
    : 'lean_proof';

  switch (framework) {
    case 'pytest': return generateFromTemplate(theorems, safeName, 'pytest');
    case 'junit': return generateFromTemplate(theorems, safeName, 'junit');
    case 'fast-check': return generateFromTemplate(theorems, safeName, 'fast-check');
    default: throw new Error(`Unsupported framework for Lean 4: ${framework}. Use pytest, junit, or fast-check.`);
  }
}

function generateFromTemplate(
  theorems: ParsedTheorem[],
  name: string,
  framework: 'pytest' | 'junit' | 'fast-check',
): FixtureFile[] {
  const template = loadTemplate(framework, 'theorem');
  const vars: Record<string, string> = { MODULE: name };

  if (framework === 'pytest') {
    vars['TESTS'] = theorems.map(t => {
      const params = extractParams(t.typeSignature);
      const args = params.map(p => `    ${p} = 0  # LLM_FILL: generate valid input`).join('\n');
      return `def test_${t.name}():\n${args}\n    # LLM_FILL: verify ${t.name}\n    pass`;
    }).join('\n\n');
    const content = renderTemplate(template, vars);
    return [{ path: `tests/test_${name}_properties.py`, content }];
  }

  if (framework === 'junit') {
    const className = name.charAt(0).toUpperCase() + name.slice(1).replace(/[^\w]/g, '') + 'PropertyTest';
    vars['CLASS_NAME'] = className;
    vars['METHODS'] = theorems.map(t =>
      `    @Test\n    void ${t.name}_holds() {\n        // LLM_FILL: verify ${t.name}\n    }`
    ).join('\n\n');
    const content = renderTemplate(template, vars);
    return [{ path: `src/test/java/${className}.java`, content }];
  }

  // fast-check
  vars['PROPERTIES'] = theorems.map(t => {
    const params = extractParams(t.typeSignature);
    const arbitraries = params.map(p => `  const ${p}Arb = fc.integer();  // LLM_FILL: refine`).join('\n');
    return `describe('${t.name}', () => {
  it('property holds', () => {
${arbitraries}

    fc.assert(
      fc.property(fc.tuple(/* LLM_FILL */), (${params.join(', ')}) => {
        // LLM_FILL: check ${t.name}
        return true;
      })
    );
  });
});`;
  }).join('\n\n');
  const content = renderTemplate(template, vars);
  return [{ path: `properties/${name}.property.ts`, content }];
}

/** Extract parameter names from a Lean type signature like `(n : Nat) → n + 0 = n` */
export function extractParams(sig: string): string[] {
  const params: string[] = [];
  const paramRegex = /\((\w+)\s*:/g;
  let m: RegExpExecArray | null;
  while ((m = paramRegex.exec(sig)) !== null) {
    if (m[1]) params.push(m[1]);
  }
  return params;
}
