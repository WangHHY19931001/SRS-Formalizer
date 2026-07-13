import * as path from 'node:path';

export type ArtifactLifecycle = 'draft' | 'verified' | 'deterministic';

export const ARTIFACT_PATHS = {
  bddDraft: path.join('outputs', 'bdd', 'draft'),
  bddVerified: path.join('outputs', 'bdd', 'verified'),
  bddValidation: path.join('outputs', 'bdd', 'validation'),
  tlaDraft: path.join('outputs', 'tlaplus', 'draft'),
  tlaVerified: path.join('outputs', 'tlaplus', 'verified'),
  tlaValidation: path.join('outputs', 'tlaplus', 'validation'),
  leanDraft: path.join('outputs', 'lean4', 'draft'),
  leanVerified: path.join('outputs', 'lean4', 'verified'),
  leanValidation: path.join('outputs', 'lean4', 'validation'),
  graphs: path.join('outputs', 'graphs'),
  fixtures: path.join('outputs', 'fixtures'),
  reports: path.join('outputs', 'reports'),
} as const;

export const ARTIFACT_DIRECTORIES = Object.values(ARTIFACT_PATHS);

export function artifactPath(workdir: string, relativePath: string): string {
  return path.join(workdir, relativePath);
}
