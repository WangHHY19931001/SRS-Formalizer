import type { SRSIR } from '../../types/srs-ir.js';

export interface EmitResult {
  files: string[];
  fileCount: number;
  metadata: Record<string, unknown>;
}

export interface Emitter {
  readonly name: string;
  readonly description: string;
  readonly outputDir: string;
  emit(ir: SRSIR, workdir: string): EmitResult;
}
