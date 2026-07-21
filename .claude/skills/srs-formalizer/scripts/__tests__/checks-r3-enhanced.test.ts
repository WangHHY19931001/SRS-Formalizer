import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { checkEdgeTypeDiversity, checkContainsEdgeDirection, checkR2R3Ingest } from '../lib/verify-gate/checks-r3.js';

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

  it('should pass at exactly 95% contains (boundary)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'r3-edge-div-boundary-'));
    try {
      const graphDir = path.join(tmpDir, '3_graph', 'graph');
      fs.mkdirSync(graphDir, { recursive: true });
      // 19 contains + 1 depends_on = 95% contains → 应通过
      const nodes = [{ id: 'ARCH-1', labels: [':Architecture'] }];
      const edges: { id: string; source: string; target: string; type: string }[] = [];
      for (let i = 0; i < 19; i++) {
        nodes.push({ id: `R-${i}`, labels: [':Requirement'] });
        edges.push({ id: `c${i}`, source: 'ARCH-1', target: `R-${i}`, type: 'contains' });
      }
      edges.push({ id: 'd1', source: 'R-0', target: 'R-1', type: 'depends_on' });
      fs.writeFileSync(
        path.join(graphDir, 'graph.merged.json'),
        JSON.stringify({ nodes, edges })
      );
      const result = checkEdgeTypeDiversity(tmpDir);
      assert.equal(result.passed, true, '95% contains (19/20) should pass at boundary');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should fail when graph file is missing', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'r3-edge-div-nofile-'));
    try {
      // 不创建 graph 文件
      const result = checkEdgeTypeDiversity(tmpDir);
      assert.equal(result.passed, false, 'missing graph file should fail');
      assert.match(result.detail ?? '', /No graph file/i);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should fail safely when edges field is missing', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'r3-edge-div-noedges-'));
    try {
      const graphDir = path.join(tmpDir, '3_graph', 'graph');
      fs.mkdirSync(graphDir, { recursive: true });
      // graph 文件只有 nodes，无 edges 字段
      fs.writeFileSync(
        path.join(graphDir, 'graph.merged.json'),
        JSON.stringify({ nodes: [{ id: 'N1', labels: [] }] })
      );
      const result = checkEdgeTypeDiversity(tmpDir);
      assert.equal(result.passed, false, 'missing edges field should fail safely');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('R3 contains edge direction (P1-3)', () => {
  it('should fail when contains edges go Requirement→Architecture (reversed)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'r3-edge-dir-'));
    try {
      const graphDir = path.join(tmpDir, '3_graph', 'graph');
      fs.mkdirSync(graphDir, { recursive: true });
      fs.writeFileSync(
        path.join(graphDir, 'graph.merged.json'),
        JSON.stringify({
          nodes: [
            { id: 'ARCH-1', labels: [':Architecture'] },
            { id: 'R1-S001-0001', labels: [':Requirement'] },
          ],
          edges: [
            // 反向：Requirement → Architecture（错误）
            { id: 'e1', source: 'R1-S001-0001', target: 'ARCH-1', type: 'contains' },
          ],
        })
      );
      const result = checkContainsEdgeDirection(tmpDir);
      assert.equal(result.passed, false, 'reversed contains edges should fail');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should pass when contains edges go Architecture→Requirement', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'r3-edge-dir-ok-'));
    try {
      const graphDir = path.join(tmpDir, '3_graph', 'graph');
      fs.mkdirSync(graphDir, { recursive: true });
      fs.writeFileSync(
        path.join(graphDir, 'graph.merged.json'),
        JSON.stringify({
          nodes: [
            { id: 'ARCH-1', labels: [':Architecture'] },
            { id: 'R1-S001-0001', labels: [':Requirement'] },
          ],
          edges: [
            { id: 'e1', source: 'ARCH-1', target: 'R1-S001-0001', type: 'contains' },
          ],
        })
      );
      const result = checkContainsEdgeDirection(tmpDir);
      assert.equal(result.passed, true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // 边界测试（从 Task 4 审查反馈学习）
  it('should pass when there are no contains edges', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'r3-edge-dir-nocontains-'));
    try {
      const graphDir = path.join(tmpDir, '3_graph', 'graph');
      fs.mkdirSync(graphDir, { recursive: true });
      fs.writeFileSync(
        path.join(graphDir, 'graph.merged.json'),
        JSON.stringify({
          nodes: [
            { id: 'R1-S001-0001', labels: [':Requirement'] },
            { id: 'R1-S002-0001', labels: [':Requirement'] },
          ],
          edges: [
            { id: 'e1', source: 'R1-S002-0001', target: 'R1-S001-0001', type: 'depends_on' },
          ],
        })
      );
      const result = checkContainsEdgeDirection(tmpDir);
      assert.equal(result.passed, true, 'no contains edges should pass (skip)');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should pass for Architecture→Architecture contains (subsystem nesting)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'r3-edge-dir-archarch-'));
    try {
      const graphDir = path.join(tmpDir, '3_graph', 'graph');
      fs.mkdirSync(graphDir, { recursive: true });
      fs.writeFileSync(
        path.join(graphDir, 'graph.merged.json'),
        JSON.stringify({
          nodes: [
            { id: 'ARCH-1', labels: [':Architecture'] },
            { id: 'ARCH-2', labels: [':Architecture'] },
          ],
          edges: [
            { id: 'e1', source: 'ARCH-1', target: 'ARCH-2', type: 'contains' },
          ],
        })
      );
      const result = checkContainsEdgeDirection(tmpDir);
      assert.equal(result.passed, true, 'Architecture→Architecture contains (subsystem nesting) should pass');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should fail when graph file is missing', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'r3-edge-dir-nofile-'));
    try {
      const result = checkContainsEdgeDirection(tmpDir);
      assert.equal(result.passed, false);
      assert.match(result.detail ?? '', /No graph file/i);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('R3 R2/R3 ingest check (P1-4)', () => {
  it('should fail when R2 JSONL records are not in IR', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'r3-r2r3-ingest-'));
    try {
      // 创建 R2 JSONL（有 2 条记录）
      fs.mkdirSync(path.join(tmpDir, '2_extract', 'r2-implicit'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, '2_extract', 'r2-implicit', 'test.jsonl'),
        JSON.stringify({ id: 'R2-S001-0001', category: 'implicit', statement: 'implicit req 1', source_file: 'test.md', confidence: 'medium', metadata: { derived_from: 'R1-S001-0001', provenance: 'doc-derived' } }) + '\n' +
        JSON.stringify({ id: 'R2-S001-0002', category: 'implicit', statement: 'implicit req 2', source_file: 'test.md', confidence: 'medium', metadata: { derived_from: 'R1-S001-0001', provenance: 'doc-derived' } }) + '\n'
      );
      // IR 中没有 R2 节点
      fs.mkdirSync(path.join(tmpDir, '3_graph', 'graph'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, '3_graph', 'graph', 'graph.merged.json'),
        JSON.stringify({ nodes: [{ id: 'R1-S001-0001', labels: [':Requirement'] }], edges: [] })
      );
      const result = checkR2R3Ingest(tmpDir);
      assert.equal(result.passed, false, 'R2 records missing from IR should fail');
      assert.match(result.detail ?? '', /R2/i);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should pass when all R2/R3 records are in IR', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'r3-r2r3-ingest-ok-'));
    try {
      fs.mkdirSync(path.join(tmpDir, '2_extract', 'r2-implicit'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, '2_extract', 'r2-implicit', 'test.jsonl'),
        JSON.stringify({ id: 'R2-S001-0001', category: 'implicit', statement: 'implicit req 1', source_file: 'test.md', confidence: 'medium', metadata: { provenance: 'doc-derived' } }) + '\n'
      );
      // IR 中包含 R2 节点
      fs.mkdirSync(path.join(tmpDir, '3_graph', 'graph'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, '3_graph', 'graph', 'graph.merged.json'),
        JSON.stringify({ nodes: [{ id: 'R2-S001-0001', labels: [':Requirement'] }], edges: [] })
      );
      const result = checkR2R3Ingest(tmpDir);
      assert.equal(result.passed, true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should skip needs-clarification records (not expected in IR)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'r3-r2r3-ingest-skip-'));
    try {
      fs.mkdirSync(path.join(tmpDir, '2_extract', 'r2-implicit'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, '2_extract', 'r2-implicit', 'test.jsonl'),
        JSON.stringify({ id: 'R2-S001-0001', category: 'implicit', statement: 'needs clarification', source_file: 'test.md', confidence: 'low', metadata: { provenance: 'needs-clarification' } }) + '\n'
      );
      // IR 中没有该节点（因为是 needs-clarification，不进 IR 是正常的）
      fs.mkdirSync(path.join(tmpDir, '3_graph', 'graph'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, '3_graph', 'graph', 'graph.merged.json'),
        JSON.stringify({ nodes: [{ id: 'R1-S001-0001', labels: [':Requirement'] }], edges: [] })
      );
      const result = checkR2R3Ingest(tmpDir);
      assert.equal(result.passed, true, 'needs-clarification records should be skipped');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should fail when graph file is missing', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'r3-r2r3-ingest-nofile-'));
    try {
      const result = checkR2R3Ingest(tmpDir);
      assert.equal(result.passed, false);
      assert.match(result.detail ?? '', /No graph file/i);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should pass when R2/R3 directories do not exist', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'r3-r2r3-ingest-nodir-'));
    try {
      // 只有 graph 文件，无 2_extract/r2-implicit 和 r3-relational
      fs.mkdirSync(path.join(tmpDir, '3_graph', 'graph'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, '3_graph', 'graph', 'graph.merged.json'),
        JSON.stringify({ nodes: [{ id: 'R1-S001-0001', labels: [':Requirement'] }], edges: [] })
      );
      const result = checkR2R3Ingest(tmpDir);
      assert.equal(result.passed, true, 'no R2/R3 dirs should pass');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
