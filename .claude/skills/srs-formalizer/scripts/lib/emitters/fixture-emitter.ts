import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SRSIR, NFRCategory } from '../../types/srs-ir.js';
import type { Emitter, EmitResult } from './types.js';
import type { Framework, FixtureFile } from '../fixture-gen/types.js';
import { generateBddFixtures } from '../fixture-gen/bdd.js';
import { generateTlaFixtures } from '../fixture-gen/tla.js';
import { generateLeanFixtures } from '../fixture-gen/lean.js';
import { generateNfrFixtures, supportsFramework } from '../fixture-gen/nfr.js';

type FixtureLevel = 'unit' | 'integration' | 'e2e' | 'nfr';
type LevelFramework = 'pytest' | 'junit' | 'cucumber' | 'playwright' | 'fast-check';

interface FixtureEmitterOptions {
  level?: FixtureLevel;
  framework?: LevelFramework;
}

const BDD: Framework[] = ['pytest', 'junit', 'cucumber', 'playwright', 'fast-check'];
const TLA_FW: Framework[] = ['pytest', 'junit', 'fast-check'];

function collectNfrNodes(ir: SRSIR): { module: string; category: NFRCategory }[] {
  const result: { module: string; category: NFRCategory }[] = [];
  for (const node of ir.nodes) {
    if (node.type === 'nfr' && node.properties.nfrCategory) {
      result.push({ module: node.module, category: node.properties.nfrCategory });
    }
  }
  return result;
}

function writeFixtureFiles(files: FixtureFile[], outputDir: string): string[] {
  const written: string[] = [];
  for (const f of files) {
    const fp = path.join(outputDir, f.path);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, f.content, 'utf-8');
    written.push(fp);
  }
  return written;
}

function generateBddAtLevel(workdir: string, framework: Framework, level: FixtureLevel): string[] {
  if (!BDD.includes(framework)) return [];
  const bddDir = path.join(workdir, '4_bdd', 'features');
  if (!fs.existsSync(bddDir)) return [];

  const allFiles: string[] = [];
  const featureFiles = fs.readdirSync(bddDir).filter(f => f.endsWith('.feature'));
  const outputDir = path.join(workdir, 'test_fixtures', level, framework);

  for (const featFile of featureFiles) {
    const content = fs.readFileSync(path.join(bddDir, featFile), 'utf-8');
    const moduleName = featFile.replace(/\.feature$/, '');
    try {
      const fixtures = generateBddFixtures(content, moduleName, framework);
      allFiles.push(...writeFixtureFiles(fixtures, outputDir));
    } catch { /* skip malformed */ }
  }
  return allFiles;
}

function generateTlaAtLevel(workdir: string, framework: Framework, level: FixtureLevel): string[] {
  if (!TLA_FW.includes(framework)) return [];
  const tlaDir = path.join(workdir, '5_formal', 'specs');
  if (!fs.existsSync(tlaDir)) return [];

  const allFiles: string[] = [];
  const tlaFiles = fs.readdirSync(tlaDir).filter(f => f.endsWith('.tla'));
  const outputDir = path.join(workdir, 'test_fixtures', level, framework);

  for (const tlaFile of tlaFiles) {
    const content = fs.readFileSync(path.join(tlaDir, tlaFile), 'utf-8');
    try {
      const fixtures = generateTlaFixtures(content, framework);
      allFiles.push(...writeFixtureFiles(fixtures, outputDir));
    } catch { /* skip malformed */ }
  }
  return allFiles;
}

function generateLeanAtLevel(workdir: string, framework: Framework, level: FixtureLevel): string[] {
  if (!TLA_FW.includes(framework)) return [];
  const leanDir = path.join(workdir, '5_formal', 'proofs');
  if (!fs.existsSync(leanDir)) return [];

  const allFiles: string[] = [];
  const leanFiles = fs.readdirSync(leanDir).filter(f => f.endsWith('.lean'));
  const outputDir = path.join(workdir, 'test_fixtures', level, framework);

  for (const leanFile of leanFiles) {
    const content = fs.readFileSync(path.join(leanDir, leanFile), 'utf-8');
    try {
      const fixtures = generateLeanFixtures(content, framework);
      allFiles.push(...writeFixtureFiles(fixtures, outputDir));
    } catch { /* skip malformed */ }
  }
  return allFiles;
}

function generateNfrAtLevel(
  ir: SRSIR,
  workdir: string,
  framework: LevelFramework,
  level: FixtureLevel,
): string[] {
  const nfrNodes = collectNfrNodes(ir);
  if (nfrNodes.length === 0) return [];

  const allFiles: string[] = [];
  const outputDir = path.join(workdir, 'test_fixtures', level, framework);

  for (const { module, category } of nfrNodes) {
    if (!supportsFramework(category, framework)) continue;
    try {
      const content = generateNfrFixtures(category, framework, module);
      const safeName = module.replace(/[/\\?%*:|"<>]/g, '_');
      const ext = framework === 'junit' ? 'java' : framework === 'fast-check' ? 'ts' : 'py';
      const fp = path.join(outputDir, `test_nfr_${category}_${safeName}.${ext}`);
      fs.mkdirSync(path.dirname(fp), { recursive: true });
      fs.writeFileSync(fp, content, 'utf-8');
      allFiles.push(fp);
    } catch { /* skip unsupported */ }
  }
  return allFiles;
}

export class FixtureEmitter implements Emitter {
  readonly name = 'fixture';
  readonly description = 'Generate V-Model test fixtures from all source artifacts';
  readonly outputDir = 'test_fixtures';

  emit(ir: SRSIR, workdir: string, options?: FixtureEmitterOptions): EmitResult {
    const level = options?.level ?? 'unit';
    const framework = options?.framework ?? 'pytest';
    const allFiles: string[] = [];

    switch (level) {
      case 'unit':
        allFiles.push(...generateBddAtLevel(workdir, framework, level));
        allFiles.push(...generateLeanAtLevel(workdir, framework, level));
        break;
      case 'integration':
        allFiles.push(...generateTlaAtLevel(workdir, framework, level));
        break;
      case 'e2e':
        allFiles.push(...generateBddAtLevel(workdir, framework, level));
        break;
      case 'nfr':
        allFiles.push(...generateNfrAtLevel(ir, workdir, framework, level));
        break;
    }

    return {
      files: allFiles,
      fileCount: allFiles.length,
      metadata: { level, framework, nfrNodes: collectNfrNodes(ir).length },
    };
  }
}
