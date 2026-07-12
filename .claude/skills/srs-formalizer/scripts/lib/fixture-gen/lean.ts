/**
 * Lean 4 fixture generator.
 * Parses .lean files to extract theorems and type signatures,
 * and generates property-based test skeletons.
 */

import type { Framework, FixtureFile, ParsedTheorem } from './types.js';

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

/** Parse a single theorem and extract detailed information including hypothesis pattern */
export function parseTheorem(content: string): TheoremDetail {
  const nameMatch = content.match(/theorem\s+(\w+)/);
  const name = nameMatch?.[1] ?? 'unknown';

  const tactics: string[] = [];
  const hypothesisVars: string[] = [];

  const tacticKeywords = ['induction', 'simp', 'exact', 'rfl', 'omega', 'decide', 'ring', 'norm_num', 'aesop'];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    for (const kw of tacticKeywords) {
      if (trimmed.toLowerCase().startsWith(kw) || trimmed.toLowerCase().includes(kw + ' ')) {
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

  return { name, tactics, hypothesisVars };
}

/** Generate fixture files for a given framework */
export function generateLeanFixtures(leanContent: string, framework: Framework): FixtureFile[] {
  const theorems = parseLeanFile(leanContent);
  const safeName = theorems[0]?.name
    ? theorems[0].name.replace(/[/\\?%*:|"<>]/g, '_')
    : 'lean_proof';

  switch (framework) {
    case 'pytest': return generatePytest(theorems, safeName);
    case 'junit': return generateJunit(theorems, safeName);
    case 'fast-check': return generateFastCheck(theorems, safeName);
    default: throw new Error(`Unsupported framework for Lean 4: ${framework}. Use pytest, junit, or fast-check.`);
  }
}

function generatePytest(theorems: ParsedTheorem[], name: string): FixtureFile[] {
  const tests = theorems.map(t => {
    const params = extractParams(t.typeSignature);
    const args = params.map(p => `    ${p} = 0  # LLM_FILL: generate valid input`).join('\n');
    return `def test_${t.name}():\n${args}\n    # LLM_FILL: verify ${t.name}\n    pass`;
  }).join('\n\n');

  const content = `"""${name} property tests — generated from Lean 4 proofs"""\n\n${tests}\n`;
  return [{ path: `tests/test_${name}_properties.py`, content }];
}

function generateJunit(theorems: ParsedTheorem[], name: string): FixtureFile[] {
  const className = name.charAt(0).toUpperCase() + name.slice(1).replace(/[^\w]/g, '') + 'PropertyTest';
  const tests = theorems.map(t =>
    `    @Test\n    void ${t.name}_holds() {\n        // LLM_FILL: verify ${t.name}\n    }`
  ).join('\n\n');

  const content = `import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class ${className} {

${tests}

}
`;
  return [{ path: `src/test/java/${className}.java`, content }];
}

function generateFastCheck(theorems: ParsedTheorem[], name: string): FixtureFile[] {
  const props = theorems.map(t => {
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

  const content = `import * as fc from 'fast-check';\n\ndescribe('${name}', () => {\n\n${props}\n\n});\n`;
  return [{ path: `properties/${name}.property.ts`, content }];
}

/** Extract parameter names from a Lean type signature like `(n : Nat) → n + 0 = n` */
function extractParams(sig: string): string[] {
  const params: string[] = [];
  const paramRegex = /\((\w+)\s*:/g;
  let m: RegExpExecArray | null;
  while ((m = paramRegex.exec(sig)) !== null) {
    if (m[1]) params.push(m[1]);
  }
  return params;
}
