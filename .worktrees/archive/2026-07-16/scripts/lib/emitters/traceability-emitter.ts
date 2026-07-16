import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SRSIR } from '../../types/srs-ir.js';
import type { Emitter, EmitResult } from './types.js';
import { ARTIFACT_PATHS, artifactPath } from '../artifacts/paths.js';
import { buildMatrix, buildCounts } from '../traceability/builder.js';
import { formatMarkdownTable, formatCypherMatrix } from '../traceability/formatters.js';

export class TraceabilityMatrixEmitter implements Emitter {
  readonly name = 'traceabilityMatrix';
  readonly description = 'Build V-Model traceability matrix from requirement nodes and artifacts';
  readonly outputDir = ARTIFACT_PATHS.reports;

  emit(ir: SRSIR, workdir: string): EmitResult {
    const rows = buildMatrix(ir, workdir);
    const counts = buildCounts(rows);

    const outputDir = artifactPath(workdir, this.outputDir);
    fs.mkdirSync(outputDir, { recursive: true });

    const mdContent = formatMarkdownTable(rows);
    const mdPath = path.join(outputDir, 'traceability.md');
    fs.writeFileSync(mdPath, mdContent, 'utf-8');

    const cypherContent = formatCypherMatrix(rows);
    const cypherPath = path.join(outputDir, 'traceability.cypher');
    fs.writeFileSync(cypherPath, cypherContent, 'utf-8');

    return {
      files: [mdPath, cypherPath],
      fileCount: 2,
      metadata: {
        totalRequirements: rows.length,
        coverage: counts,
        dimensions: 5,
      },
    };
  }
}
