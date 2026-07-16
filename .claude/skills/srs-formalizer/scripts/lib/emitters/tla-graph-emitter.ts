import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SRSIR } from '../../types/srs-ir.js';
import type { Emitter, EmitResult } from './types.js';
import { exportGraphToCypher, type CypherNode, type CypherEdge } from '../cypher.js';
import { scanTlaSourceForPlaceholders } from '../verify-gate/shared.js';
import { ARTIFACT_PATHS, artifactPath } from '../artifacts/paths.js';
import { buildTlaGraphFromDir } from '../tla-graph/builder.js';
import type { TlaGraph } from '../tla-graph/types.js';

export class TlaGraphEmitter implements Emitter {
  readonly name = 'tlaGraph';
  readonly description = 'Build system interaction graph from TLA+ specs';
  readonly outputDir = ARTIFACT_PATHS.graphs;

  emit(_ir: SRSIR, workdir: string): EmitResult {
    const specsDir = artifactPath(workdir, ARTIFACT_PATHS.tlaVerified);
    if (!fs.existsSync(specsDir)) {
      return { files: [], fileCount: 0, metadata: { skipped: 'verified TLA+ specs not found' } };
    }

    const graph: TlaGraph = buildTlaGraphFromDir(specsDir, workdir);
    const placeholders = scanTlaSourceForPlaceholders(specsDir);

    const outputDir = artifactPath(workdir, this.outputDir);
    const jsonFile = path.join(outputDir, 'tla-interaction-graph.json');
    const cypherFile = path.join(outputDir, 'tla-interaction.cypher');

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
      title: 'TLA+ System Interaction Graph',
      headerLines: [
        `Generated: ${graph.metadata.generated_at}`,
        `Specs: ${graph.metadata.spec_count}`,
        `Actions: ${graph.metadata.total_actions}`,
        `Invariants: ${graph.metadata.total_invariants}`,
        `Max hierarchy depth: ${graph.metadata.max_hierarchy_depth}`,
        ...(placeholders.length > 0 ? [`⚠ Placeholders: ${placeholders.map(p => `${p.file}:${p.marker}`).join(', ')}`] : []),
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
