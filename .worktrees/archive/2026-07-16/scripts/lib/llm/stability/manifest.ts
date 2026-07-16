/**
 * Phase 1 manifest generation — produces PromptManifest files for the orchestrator.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { StabilityTestConfig } from '../config.js';
import type { ProbeItem } from '../../probe/types.js';
import type { PromptManifest } from './types.js';

export function generatePromptManifests(
  config: StabilityTestConfig,
  probes: ProbeItem[],
): PromptManifest[] {
  const manifests: PromptManifest[] = [];
  const passes = config.passes ?? 3;

  for (const provider of config.providers) {
    for (let p = 1; p <= passes; p++) {
      const manifestId = `${provider.id}-pass-${p}`;
      const prompts: Record<string, string> = {};
      for (const probe of probes) {
        prompts[probe.probe_id] = probe.prompt;
      }
      manifests.push({ manifestId, provider, pass: p, prompts, outputFormat: 'json' });
    }
  }

  return manifests;
}

export function writePromptManifests(
  manifests: PromptManifest[],
  outputDir: string,
): string {
  const manifestDir = path.join(outputDir, 'manifests');
  fs.mkdirSync(manifestDir, { recursive: true });
  for (const manifest of manifests) {
    const filePath = path.join(manifestDir, `${manifest.manifestId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(manifest, null, 2), 'utf-8');
  }
  fs.writeFileSync(
    path.join(manifestDir, '_index.json'),
    JSON.stringify({
      total: manifests.length,
      providers: [...new Set(manifests.map((m) => m.provider.id))],
      passes: manifests.length / [...new Set(manifests.map((m) => m.provider.id))].length,
      generated_at: new Date().toISOString(),
    }, null, 2),
    'utf-8',
  );
  return manifestDir;
}
