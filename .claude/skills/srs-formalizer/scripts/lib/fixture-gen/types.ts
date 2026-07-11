// === Fixture generation shared types ===

/** Supported test frameworks */
export type Framework = 'cucumber' | 'playwright' | 'pytest' | 'junit' | 'fast-check';

/** Fixture generation levels */
export type FixtureLevel = 'acceptance' | 'integration' | 'unit' | 'property';

/** Source type for fixture generation */
export type FixtureSource = 'bdd' | 'tla' | 'lean' | 'auto';

/** A parsed scenario from BDD .feature file */
export interface ParsedScenario {
  name: string;
  requirementId: string;
  given: string[];
  when: string[];
  then: string[];
  params: string[];  // extracted <param_name> placeholders
}

/** A parsed theorem from Lean 4 .lean file */
export interface ParsedTheorem {
  name: string;
  typeSignature: string;
  imports: string[];
}

/** A parsed TLA+ spec structure */
export interface ParsedTlaSpec {
  specName: string;
  variables: string[];
  constants: string[];
  invariants: string[];
  init: string;
  next: string;
}

/** A single generated fixture file */
export interface FixtureFile {
  path: string;       // relative to output dir
  content: string;
}

/** Result of fixture generation */
export interface FixtureGenResult {
  files_created: number;
  output_dir: string;
  source_files_used: string[];
  files: FixtureFile[];
}

/** Coverage report entry for a missing requirement */
export interface MissingEntry {
  requirement: string;
  reason: string;
}

/** Coverage report */
export interface CoverageReport {
  total_requirements: number;
  bdd_fixtures_generated: number;
  tla_fixtures_generated: number;
  lean_fixtures_generated: number;
  coverage_pct: number;
  missing: MissingEntry[];
}
