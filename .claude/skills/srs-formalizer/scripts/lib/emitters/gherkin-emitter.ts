import type { SRSIR } from '../../types/srs-ir.js';
import type { Emitter, EmitResult } from './types.js';
import { generateModuleFeatures } from './gherkin-module-generator.js';
import { generateNFRFeatures } from './gherkin-nfr-generator.js';
import { generateFeature } from '../bdd.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { ARTIFACT_PATHS, artifactPath } from '../artifacts/paths.js';

export class GherkinEmitter implements Emitter {
  readonly name = 'gherkin';
  readonly description = 'Generate Gherkin .feature files from SRS-IR';
  readonly outputDir = ARTIFACT_PATHS.bddDraft;

  emit(ir: SRSIR, workdir: string): EmitResult {
    const features = [
      ...generateModuleFeatures(ir),
      ...generateNFRFeatures(ir),
    ];
    const outDir = artifactPath(workdir, this.outputDir);
    fs.mkdirSync(outDir, { recursive: true });
    const files: string[] = [];
    for (const feat of features) {
      const content = generateFeature(feat);
      const safeName = feat.module.replace(/[/\\?%*:|"<>]/g, '_') + '.feature';
      const fp = path.join(outDir, safeName);
      fs.writeFileSync(fp, content, 'utf-8');
      files.push(fp);
    }
    return {
      files,
      fileCount: files.length,
      metadata: { moduleCount: features.length, lifecycle: 'draft', requiresCompletion: true },
    };
  }
}
