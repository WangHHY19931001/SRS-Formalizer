/**
 * types.ts — Shared types for health-check module
 */

export interface HealthCheck {
  name: string;
  status: 'ok' | 'warn' | 'error' | 'skip';
  message: string;
  details?: unknown;
}

export interface WorkDirStatus {
  initialized: boolean;
  current_stage?: string;
  artifacts?: Record<string, string[]>;
}

export interface HealthReport {
  version: string;
  timestamp: string;
  node_version: string;
  platform: string;
  cwd: string;
  checks: HealthCheck[];
  capabilities: {
    tla_plus: boolean;
    lean4: boolean;
    bdd_validation: boolean;
    full_pipeline: boolean;
  };
  workdir_status?: WorkDirStatus | undefined;
  summary: {
    total: number;
    ok: number;
    warn: number;
    error: number;
    skip: number;
  };
  recommendations: string[];
}

export interface PackageJson {
  version?: string;
  devDependencies?: Record<string, string>;
}
