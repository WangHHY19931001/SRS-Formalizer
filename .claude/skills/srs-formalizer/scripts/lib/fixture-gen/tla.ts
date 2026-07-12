/**
 * TLA+ fixture generator.
 * Parses .tla files and generates framework-specific test skeletons via template-engine.
 */

import type { Framework, FixtureFile, ParsedTlaSpec } from './types.js';
import { loadTemplate, renderTemplate } from './template-engine.js';

/** Parse a TLA+ spec to extract key elements */
export function parseTlaSpec(content: string): ParsedTlaSpec {
  const specNameMatch = content.match(/----\s*MODULE\s+(\w+)\s+----/);
  const specName = specNameMatch?.[1] ?? 'UnknownSpec';

  const variables: string[] = [];
  const varMatch = content.match(/VARIABLES\s+([\s\S]*?)(?=\n\w)/);
  if (varMatch?.[1]) {
    variables.push(...varMatch[1].split(',').map(v => v.trim()).filter(Boolean));
  }

  const constants: string[] = [];
  const constMatch = content.match(/CONSTANTS\s+([^\n]+)/);
  if (constMatch?.[1]) {
    constants.push(...constMatch[1].split(',').map(c => c.trim()).filter(Boolean));
  }

  const invariants: string[] = [];
  const invRegex = /^(\w*(?:Inv|TypeOK|Safety|Liveness)\w*)\s*==/gm;
  let m: RegExpExecArray | null;
  while ((m = invRegex.exec(content)) !== null) {
    if (m[1] && m[1] !== 'Init' && m[1] !== 'Next' && m[1] !== specName) {
      invariants.push(m[1]);
    }
  }

  const initMatch = content.match(/Init\s*==\s*([\s\S]*?)(?=\n(?:Next|VARIABLES|====|\w+\s*==))/);
  const nextMatch = content.match(/Next\s*==\s*([\s\S]*?)(?=\n(?:Init|VARIABLES|====|\w+\s*==))/);

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
    case 'pytest': return generateFromTemplate(spec, safeName, 'pytest');
    case 'junit': return generateFromTemplate(spec, safeName, 'junit');
    case 'fast-check': return generateFromTemplate(spec, safeName, 'fast-check');
    default: throw new Error(`Unsupported framework for TLA+: ${String(framework)}. Use pytest, junit, or fast-check.`);
  }
}

function generateFromTemplate(
  spec: ParsedTlaSpec,
  name: string,
  framework: 'pytest' | 'junit' | 'fast-check',
): FixtureFile[] {
  const template = loadTemplate(framework, 'invariant');
  const vars: Record<string, string> = { MODULE: name };

  if (framework === 'pytest') {
    vars['FIXTURES'] = spec.variables.map(v =>
      `@pytest.fixture\ndef ${v}():\n    # LLM_FILL: generate valid ${v} values\n    return 0`
    ).join('\n\n');
    vars['TESTS'] = spec.invariants.map(inv => {
      const asserts = spec.variables.map(v =>
        `    # LLM_FILL: assert ${inv} holds for ${v}`
      ).join('\n');
      return `def test_invariant_${inv.toLowerCase()}(${spec.variables.join(', ')}):\n${asserts}\n    pass`;
    }).join('\n\n');
    const content = renderTemplate(template, vars);
    return [{ path: `tests/test_${name}_invariants.py`, content }];
  }

  if (framework === 'junit') {
    const className = name + 'InvariantTest';
    vars['CLASS_NAME'] = className;
    vars['FIELDS'] = spec.variables.map(v =>
      `    // LLM_FILL: define ${v} fixture`
    ).join('\n');
    vars['METHODS'] = spec.invariants.map(inv =>
      `    @Test\n    void ${inv.toLowerCase()}_holds() {\n        // LLM_FILL: assert invariant ${inv}\n    }`
    ).join('\n\n');
    const content = renderTemplate(template, vars);
    return [{ path: `src/test/java/${className}.java`, content }];
  }

  // fast-check
  vars['ARBITRARIES'] = spec.variables.map(v =>
    `  const ${v}Arb = fc.integer();  // LLM_FILL: refine`
  ).join('\n');
  vars['PROPERTIES'] = spec.invariants.map(inv =>
    `describe('${inv}', () => {\n  it('holds under all transitions', () => {\n${vars['ARBITRARIES']}\n\n    fc.assert(\n      fc.property(fc.tuple(/* LLM_FILL */), (${spec.variables.join(', ')}) => {\n        // LLM_FILL: check ${inv}\n        return true;\n      })\n    );\n  });\n});`
  ).join('\n\n');
  const content = renderTemplate(template, vars);
  return [{ path: `properties/${name}.property.ts`, content }];
}
