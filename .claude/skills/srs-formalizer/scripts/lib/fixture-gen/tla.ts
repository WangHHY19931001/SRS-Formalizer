/**
 * TLA+ fixture generator.
 * Parses .tla files to extract variables, constants, invariants,
 * and generates framework-specific integration test skeletons.
 */

import type { Framework, FixtureFile, ParsedTlaSpec } from './types.js';

/** Parse a TLA+ spec to extract key elements */
export function parseTlaSpec(content: string): ParsedTlaSpec {
  const specNameMatch = content.match(/----\s*MODULE\s+(\w+)\s+----/);
  const specName = specNameMatch?.[1] ?? 'UnknownSpec';

  const variables: string[] = [];
  const varMatch = content.match(/VARIABLES\s+([^\n]+)/);
  if (varMatch?.[1]) {
    variables.push(...varMatch[1].split(',').map(v => v.trim()).filter(Boolean));
  }

  const constants: string[] = [];
  const constMatch = content.match(/CONSTANTS\s+([^\n]+)/);
  if (constMatch?.[1]) {
    constants.push(...constMatch[1].split(',').map(c => c.trim()).filter(Boolean));
  }

  const invariants: string[] = [];
  const invRegex = /^(\w+)\s*==/gm;
  let m: RegExpExecArray | null;
  while ((m = invRegex.exec(content)) !== null) {
    if (m[1] && m[1] !== 'Init' && m[1] !== 'Next' && m[1] !== specName) {
      invariants.push(m[1]);
    }
  }

  const initMatch = content.match(/Init\s*==\s*(.+)/);
  const nextMatch = content.match(/Next\s*==\s*(.+)/);

  return {
    specName,
    variables,
    constants,
    invariants,
    init: initMatch?.[1]?.trim() ?? '',
    next: nextMatch?.[1]?.trim() ?? '',
  };
}

/** Generate fixture files for a given framework */
export function generateTlaFixtures(tlaContent: string, framework: Framework): FixtureFile[] {
  const spec = parseTlaSpec(tlaContent);
  const safeName = spec.specName.replace(/[/\\?%*:|"<>]/g, '_');

  switch (framework) {
    case 'pytest': return generatePytest(spec, safeName);
    case 'junit': return generateJunit(spec, safeName);
    case 'fast-check': return generateFastCheck(spec, safeName);
    default: throw new Error(`Unsupported framework for TLA+: ${String(framework)}. Use pytest, junit, or fast-check.`);
  }
}

function generatePytest(spec: ParsedTlaSpec, name: string): FixtureFile[] {
  const fixtures = spec.variables.map(v =>
    `@pytest.fixture\ndef ${v}():\n    # LLM_FILL: generate valid ${v} values\n    return 0`
  ).join('\n\n');

  const tests = spec.invariants.map(inv => {
    const asserts = spec.variables.map(v =>
      `    # LLM_FILL: assert ${inv} holds for ${v}`
    ).join('\n');
    return `def test_invariant_${inv.toLowerCase()}(${spec.variables.join(', ')}):\n${asserts}\n    pass`;
  }).join('\n\n');

  const content = `"""${name} invariant tests — generated from TLA+ spec"""\n\nimport pytest\n\n${fixtures}\n\n${tests}\n`;
  return [{ path: `tests/test_${name}_invariants.py`, content }];
}

function generateJunit(spec: ParsedTlaSpec, name: string): FixtureFile[] {
  const className = name + 'InvariantTest';
  const fields = spec.variables.map(v =>
    `    // LLM_FILL: define ${v} fixture`
  ).join('\n');
  const tests = spec.invariants.map(inv =>
    `    @Test\n    void ${inv.toLowerCase()}_holds() {\n        // LLM_FILL: assert invariant ${inv}\n    }`
  ).join('\n\n');

  const content = `import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class ${className} {
${fields}

${tests}
}
`;
  return [{ path: `src/test/java/${className}.java`, content }];
}

function generateFastCheck(spec: ParsedTlaSpec, name: string): FixtureFile[] {
  const arbitraries = spec.variables.map(v =>
    `  const ${v}Arb = fc.integer();  // LLM_FILL: refine`
  ).join('\n');
  const props = spec.invariants.map(inv =>
    `describe('${inv}', () => {\n  it('holds under all transitions', () => {\n${arbitraries}\n\n    fc.assert(\n      fc.property(fc.tuple(/* LLM_FILL */), (${spec.variables.join(', ')}) => {\n        // LLM_FILL: check ${inv}\n        return true;\n      })\n    );\n  });\n});`
  ).join('\n\n');

  const content = `import * as fc from 'fast-check';\n\ndescribe('${name}', () => {\n\n${props}\n\n});\n`;
  return [{ path: `properties/${name}.property.ts`, content }];
}
