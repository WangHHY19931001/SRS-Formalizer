import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SRSIR } from '../../types/srs-ir.js';
import type { Emitter, EmitResult } from './types.js';
import { exportGraphToCypher, type CypherNode, type CypherEdge } from '../cypher.js';
import { scanLeanSourceForPlaceholders } from '../verify-gate/shared.js';
import { ARTIFACT_PATHS, artifactPath } from '../artifacts/paths.js';
import { buildLeanGraphFromDir } from '../lean-graph/builder.js';
import type { LeanGraph } from '../lean-graph/types.js';

export class LeanGraphEmitter implements Emitter {
  readonly name = 'leanGraph';
  readonly description = 'Build proof dependency graph from Lean 4 proof files';
  readonly outputDir = ARTIFACT_PATHS.graphs;

  emit(_ir: SRSIR, workdir: string): EmitResult {
    const proofsDir = artifactPath(workdir, ARTIFACT_PATHS.leanVerified);
    if (!fs.existsSync(proofsDir)) {
      return { files: [], fileCount: 0, metadata: { skipped: 'verified Lean proofs not found' } };
    }

    const graph: LeanGraph = buildLeanGraphFromDir(proofsDir, workdir);
    const placeholders = scanLeanSourceForPlaceholders(proofsDir);

    const outputDir = artifactPath(workdir, this.outputDir);
    const jsonFile = path.join(outputDir, 'lean-proof-graph.json');
    const cypherFile = path.join(outputDir, 'lean-proof.cypher');

    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(jsonFile, JSON.stringify(graph, null, 2), 'utf-8');

    const cypherNodes: CypherNode[] = graph.nodes.map(n => ({
      id: n.id,
      labels: n.labels,
      properties: n.properties,
    }));
    const cypherEdges: CypherEdge[] = graph.edges.map(e => ({
      source: e.source,
      target: e.target,
      type: e.type,
      ...(e.properties ? { properties: e.properties } : {}),
    }));
    const cypher = exportGraphToCypher(cypherNodes, cypherEdges, {
      title: 'Lean 4 Proof Dependency Graph',
      headerLines: [
        `Generated: ${graph.metadata.generated_at}`,
        `Files: ${graph.metadata.file_count}`,
        `Theorems: ${graph.metadata.theorem_count}`,
        `Lemmas: ${graph.metadata.lemma_count}`,
        `Axioms: ${graph.metadata.axiom_count}`,
        `Imports: ${graph.metadata.import_count}`,
        `Max proof depth: ${graph.metadata.max_proof_depth}`,
        ...(graph.metadata.axiom_count > 0 ? ['⚠ WARNING: axioms detected!'] : []),
        ...(graph.metadata.sorry_count > 0 ? ['⚠ WARNING: sorry detected!'] : []),
        ...(placeholders.length > 0 ? [`⚠ Placeholders: ${placeholders.map(p => `${p.file}:${p.kind}`).join(', ')}`] : []),
      ],
    });
    fs.writeFileSync(cypherFile, cypher, 'utf-8');

    return {
      files: [jsonFile, cypherFile],
      fileCount: 2,
      metadata: {
        ...graph.metadata,
        placeholder_count: placeholders.length,
      },
    };
  }
}
