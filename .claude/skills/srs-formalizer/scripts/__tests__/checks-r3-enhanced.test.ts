import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { checkEdgeTypeDiversity } from '../lib/verify-gate/checks-r3.js';

describe('R3 edge type diversity (P1-2)', () => {
  it('should fail when 100% of edges are contains', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'r3-edge-div-'));
    try {
      const graphDir = path.join(tmpDir, '3_graph', 'graph');
      fs.mkdirSync(graphDir, { recursive: true });
      fs.writeFileSync(
        path.join(graphDir, 'graph.merged.json'),
        JSON.stringify({
          nodes: [
            { id: 'ARCH-1', labels: [':Architecture'] },
            { id: 'R1-S001-0001', labels: [':Requirement'] },
            { id: 'R1-S002-0001', labels: [':Requirement'] },
          ],
          edges: [
            { id: 'e1', source: 'ARCH-1', target: 'R1-S001-0001', type: 'contains' },
            { id: 'e2', source: 'ARCH-1', target: 'R1-S002-0001', type: 'contains' },
          ],
        })
      );
      const result = checkEdgeTypeDiversity(tmpDir);
      assert.equal(result.passed, false, '100% contains edges should fail');
      assert.match(result.detail ?? '', /diversity/i);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should pass when edges contain multiple types', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'r3-edge-div-ok-'));
    try {
      const graphDir = path.join(tmpDir, '3_graph', 'graph');
      fs.mkdirSync(graphDir, { recursive: true });
      fs.writeFileSync(
        path.join(graphDir, 'graph.merged.json'),
        JSON.stringify({
          nodes: [
            { id: 'ARCH-1', labels: [':Architecture'] },
            { id: 'R1-S001-0001', labels: [':Requirement'] },
            { id: 'R1-S002-0001', labels: [':Requirement'] },
          ],
          edges: [
            { id: 'e1', source: 'ARCH-1', target: 'R1-S001-0001', type: 'contains' },
            { id: 'e2', source: 'R1-S002-0001', target: 'R1-S001-0001', type: 'depends_on' },
          ],
        })
      );
      const result = checkEdgeTypeDiversity(tmpDir);
      assert.equal(result.passed, true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should pass when there are no edges (degraded mode)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'r3-edge-div-empty-'));
    try {
      const graphDir = path.join(tmpDir, '3_graph', 'graph');
      fs.mkdirSync(graphDir, { recursive: true });
      fs.writeFileSync(
        path.join(graphDir, 'graph.merged.json'),
        JSON.stringify({ nodes: [{ id: 'N1', labels: [] }], edges: [] })
      );
      const result = checkEdgeTypeDiversity(tmpDir);
      assert.equal(result.passed, true, 'empty graph should pass (skip)');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
