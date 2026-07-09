/**
 * processArch3 — correction operations on the architecture graph.
 */

import { Graph } from '../../graph.js';
import type { Arch3Record } from '../types.js';

export function processArch3(graph: Graph, records: Arch3Record[]): void {
  for (const rec of records) {
    switch (rec.action) {
      case 'add_dependency_layer': {
        if (graph.hasNode(rec.id)) continue;
        graph.addNode({
          id: rec.id,
          labels: [':DependencyLayer'],
          properties: {
            detail: rec.detail,
            target: rec.target ?? '',
            reasoning: rec.reasoning ?? '',
          },
        });
        break;
      }
    }
  }
}
