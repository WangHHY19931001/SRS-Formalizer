import type { Emitter } from '../emitters/types.js';
import type { ArtifactLifecycle } from './paths.js';
import { BehaviorGraphEmitter } from '../emitters/behavior-graph-emitter.js';
import { CounterexampleEmitter } from '../emitters/counterexample-emitter.js';
import { CypherEmitter } from '../emitters/cypher-emitter.js';
import { FixtureEmitter } from '../emitters/fixture-emitter.js';
import { GherkinEmitter } from '../emitters/gherkin-emitter.js';
import { LeanEmitter } from '../emitters/lean-emitter.js';
import { LeanGraphEmitter } from '../emitters/lean-graph-emitter.js';
import { TLAEmitter } from '../emitters/tla-emitter.js';
import { TlaGraphEmitter } from '../emitters/tla-graph-emitter.js';
import { TraceabilityMatrixEmitter } from '../emitters/traceability-emitter.js';

export const EMITTER_GROUPS = ['graphs', 'bdd', 'formal', 'vmodel', 'verify'] as const;
export type EmitterGroup = typeof EMITTER_GROUPS[number];

export interface RegisteredEmitter {
  name: string;
  group: EmitterGroup;
  lifecycle: ArtifactLifecycle;
  emitter: Emitter;
}

export const EMITTER_REGISTRY: readonly RegisteredEmitter[] = [
  { name: 'cypher', group: 'graphs', lifecycle: 'deterministic', emitter: new CypherEmitter() },
  { name: 'behaviorGraph', group: 'graphs', lifecycle: 'deterministic', emitter: new BehaviorGraphEmitter() },
  { name: 'tlaGraph', group: 'graphs', lifecycle: 'deterministic', emitter: new TlaGraphEmitter() },
  { name: 'leanGraph', group: 'graphs', lifecycle: 'deterministic', emitter: new LeanGraphEmitter() },
  { name: 'gherkin', group: 'bdd', lifecycle: 'draft', emitter: new GherkinEmitter() },
  { name: 'tlaSpec', group: 'formal', lifecycle: 'draft', emitter: new TLAEmitter() },
  { name: 'leanProof', group: 'formal', lifecycle: 'draft', emitter: new LeanEmitter() },
  { name: 'fixture', group: 'vmodel', lifecycle: 'deterministic', emitter: new FixtureEmitter() },
  { name: 'counterexample', group: 'vmodel', lifecycle: 'deterministic', emitter: new CounterexampleEmitter() },
  { name: 'traceabilityMatrix', group: 'verify', lifecycle: 'deterministic', emitter: new TraceabilityMatrixEmitter() },
];

export function emitterNames(): string[] {
  return EMITTER_REGISTRY.map(entry => entry.name);
}

export function emittersInGroup(group: EmitterGroup): readonly RegisteredEmitter[] {
  return EMITTER_REGISTRY.filter(entry => entry.group === group);
}

export function findEmitter(name: string): RegisteredEmitter | undefined {
  return EMITTER_REGISTRY.find(entry => entry.name === name);
}
