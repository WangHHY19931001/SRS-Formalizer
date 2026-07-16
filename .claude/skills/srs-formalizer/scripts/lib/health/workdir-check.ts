/**
 * workdir-check.ts — Verify workdir structure and gather artifact status
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { HealthCheck, WorkDirStatus } from './types.js';

export function checkWorkDir(workDir: string): { status: HealthCheck; workdirStatus?: WorkDirStatus } {
  if (!fs.existsSync(workDir)) {
    return {
      status: {
        name: 'workdir',
        status: 'warn',
        message: `Working directory does not exist: ${workDir}. Run "init --output ${workDir}" first.`,
      },
    };
  }

  const basename = path.basename(workDir);
  if (basename !== '.srs_formalizer') {
    return {
      status: {
        name: 'workdir',
        status: 'error',
        message: `Working directory must be named ".srs_formalizer", got "${basename}"`,
      },
    };
  }

  const stateFile = path.join(workDir, 'STATE.md');
  const irFile = path.join(workDir, 'srs-ir.json');
  let currentStage = 'unknown';
  const artifacts: Record<string, string[]> = {};

  if (fs.existsSync(stateFile)) {
    const stateContent = fs.readFileSync(stateFile, 'utf-8');
    const stageMatch = stateContent.match(/\| 当前阶段 \| ([^|]+) \|/);
    if (stageMatch) {
      currentStage = (stageMatch[1] ?? 'unknown').trim();
    }
  }

  const outputDirs = ['graphs', 'bdd', 'tlaplus', 'lean4', 'fixtures', 'reports'];
  for (const dir of outputDirs) {
    const draftPath = path.join(workDir, 'outputs', dir, 'draft');
    const verifiedPath = path.join(workDir, 'outputs', dir, 'verified');
    const files: string[] = [];

    if (fs.existsSync(draftPath)) {
      const draftFiles = fs.readdirSync(draftPath).filter(f => !f.startsWith('.'));
      for (const f of draftFiles) files.push(`draft/${f}`);
    }
    if (fs.existsSync(verifiedPath)) {
      const verifiedFiles = fs.readdirSync(verifiedPath).filter(f => !f.startsWith('.'));
      for (const f of verifiedFiles) files.push(`verified/${f}`);
    }

    if (files.length > 0) {
      artifacts[dir] = files;
    }
  }

  const irExists = fs.existsSync(irFile);
  const totalArtifacts = Object.values(artifacts).flat().length;

  return {
    status: {
      name: 'workdir',
      status: 'ok',
      message: `Working directory valid. Stage: ${currentStage}${irExists ? ' (IR built)' : ''}`,
      details: { path: workDir, stage: currentStage, ir_built: irExists, artifact_count: totalArtifacts },
    },
    workdirStatus: {
      initialized: true,
      current_stage: currentStage,
      artifacts,
    },
  };
}
