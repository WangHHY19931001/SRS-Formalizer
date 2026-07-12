// === Fixture generation shared types ===

/** Supported test frameworks */
export type Framework = 'cucumber' | 'playwright' | 'pytest' | 'junit' | 'fast-check';

/** Framework for counterexample fixture generation */
export type CounterexampleFramework = 'tla' | 'lean' | 'pytest';

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
  hypothesisVars: string[];
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

/** A single entry from a TLC counterexample trace */
export interface TlcTraceEntry {
  step: number;
  state: Record<string, string>;
  violatedInvariant?: string;
}

/** A row in the V-Model traceability matrix */
export interface TraceabilityEntry {
  requirementId: string;
  requirementTitle: string;
  graphNodes: string[];
  bddScenarios: string[];
  tlaInvariants: string[];
  leanTheorems: string[];
  fixtureFiles: string[];
  coverageStatus: 'full' | 'partial' | 'none';
}
