// SkIR Builder — RawSkillMd → SkillIR transformation
//
// Re-export aggregator.  Implementation lives in lib/skir/.

export type { RawFrontmatter, RawSkillMd } from './skir/types.js';
export { parseSimpleYaml, parseYamlValue } from './skir/yaml.js';
export { parseRawSkillMd } from './skir/parser.js';
export { buildSkIR } from './skir/builder.js';
