import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { SRSIR } from '../types/srs-ir.js';

const TMP = path.join(os.tmpdir(), `srs-formalizer-analyze-structure-test-${Date.now()}`);

function mkMeta(): SRSIR['meta'] {
  return { sourcePath: '/tmp/test.md', sourceHash: 'abc', language: 'zh', totalChars: 100, totalShards: 1, totalNodes: 0, totalEdges: 0, buildTimestamp: new Date().toISOString() };
}

function mkNode(id: string, type: SRSIR['nodes'][number]['type'] = 'requirement', props?: Partial<SRSIR['nodes'][number]['properties']>): SRSIR['nodes'][number] {
  return { id, type, module: 'mod', labels: [], properties: props ?? {}, source: { filePath: '/tmp/test.md', startLine: 1, endLine: 2, shardId: 'shard-1', chapter: '§1' } };
}

function mkEdge(id: string, source: string, target: string, type: SRSIR['edges'][number]['type'] = 'depends_on'): SRSIR['edges'][number] {
  return { id, source, target, type, properties: {} };
}

function mkIR(nodes: SRSIR['nodes'], edges: SRSIR['edges']): SRSIR {
  return { version: '2.0.0', meta: { ...mkMeta(), totalNodes: nodes.length, totalEdges: edges.length }, nodes, edges, crossRefs: [], nfrProfile: { detectedCategories: [], weightedShards: [], overallCoverage: 0, blindSpots: [] }, gaps: [], glossary: [] };
}

function createWorkDir(name: string): string {
  const workDir = path.join(TMP, name, '.srs_formalizer');
  fs.mkdirSync(workDir, { recursive: true });
  return workDir;
}

function writeIR(workDir: string, ir: SRSIR): void {
  fs.writeFileSync(path.join(workDir, 'srs-ir.json'), JSON.stringify(ir, null, 2), 'utf-8');
}

describe('analyze-structure command (SRSIR port)', () => {
  before(() => { fs.mkdirSync(TMP, { recursive: true }); });
  after(() => { fs.rmSync(TMP, { recursive: true, force: true }); });

  it('finds orphan nodes (no incoming or outgoing edges)', async () => {
    const workDir = createWorkDir('orphans');
    writeIR(workDir, mkIR([
      mkNode('R1-REQ-0001', 'requirement', { statement: 'User can login', category: 'explicit', confidence: 'high' }),
      mkNode('R1-REQ-0002', 'requirement', { statement: 'User can register', category: 'explicit', confidence: 'high' }),
      mkNode('R2-IMPL-0001', 'requirement', { statement: 'Session expires', category: 'implicit', confidence: 'medium' }),
    ], [
      mkEdge('R2-IMPL-0001--dep--R1-REQ-0001', 'R2-IMPL-0001', 'R1-REQ-0001', 'depends_on'),
    ]));

    const { main } = await import('../commands/analyze-structure.js');
    const result = await main(['--workdir', workDir]);
    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.orphan_count, 1);

    const orphanPath = path.join(workDir, '3_graph', 'analysis', 'orphan_nodes.jsonl');
    assert.ok(fs.existsSync(orphanPath));
    const lines = fs.readFileSync(orphanPath, 'utf-8').trim().split('\n');
    assert.equal(lines.length, 1);
    const orphan = JSON.parse(lines[0]!);
    assert.equal(orphan.id, 'R1-REQ-0002');
    assert.equal(orphan.statement, 'User can register');
  });

  it('finds dangling edges (target node does not exist)', async () => {
    const workDir = createWorkDir('dangling');
    writeIR(workDir, mkIR([
      mkNode('R1-REQ-0001', 'requirement', { statement: 'User can login' }),
    ], [
      mkEdge('E01', 'R3-REL-0001', 'NONEXISTENT', 'depends_on'),
      mkEdge('E02', 'R3-REL-0002', 'MISSING', 'refines'),
    ]));

    const { main } = await import('../commands/analyze-structure.js');
    const result = await main(['--workdir', workDir]);
    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.dangling_count, 2);

    const dangPath = path.join(workDir, '3_graph', 'analysis', 'dangling_edges.jsonl');
    assert.ok(fs.existsSync(dangPath));
    const lines = fs.readFileSync(dangPath, 'utf-8').trim().split('\n');
    assert.equal(lines.length, 2);
    const e1 = JSON.parse(lines[0]!);
    assert.equal(e1.edge_id, 'E01');
    assert.equal(e1.target_id, 'NONEXISTENT');
    const e2 = JSON.parse(lines[1]!);
    assert.equal(e2.edge_id, 'E02');
    assert.equal(e2.target_id, 'MISSING');
  });

  it('finds concept islands (disconnected components)', async () => {
    const workDir = createWorkDir('islands');
    writeIR(workDir, mkIR([
      mkNode('R1-REQ-0001', 'requirement', { statement: 'Login' }),
      mkNode('R1-REQ-0002', 'requirement', { statement: 'Auth' }),
      mkNode('R1-REQ-0003', 'requirement', { statement: 'Payment' }),
      mkNode('R1-REQ-0004', 'requirement', { statement: 'Refund' }),
    ], [
      mkEdge('E1', 'R1-REQ-0001', 'R1-REQ-0002', 'depends_on'),
      mkEdge('E2', 'R1-REQ-0003', 'R1-REQ-0004', 'depends_on'),
    ]));

    const { main } = await import('../commands/analyze-structure.js');
    const result = await main(['--workdir', workDir]);
    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.island_count, 2);

    const islandPath = path.join(workDir, '3_graph', 'analysis', 'concept_islands.jsonl');
    assert.ok(fs.existsSync(islandPath));
    const lines = fs.readFileSync(islandPath, 'utf-8').trim().split('\n');
    assert.equal(lines.length, 2);
    const i0 = JSON.parse(lines[0]!);
    assert.equal(i0.size, 2);
    assert.ok(i0.nodes.includes('R1-REQ-0001'));
    assert.ok(i0.nodes.includes('R1-REQ-0002'));
  });

  it('generates structure_gap_analysis.md with correct table', async () => {
    const workDir = createWorkDir('gap-md');
    writeIR(workDir, mkIR([
      mkNode('R1-REQ-0001', 'requirement', { statement: 'User can login' }),
      mkNode('R1-REQ-0002', 'requirement', { statement: 'Orphaned requirement' }),
    ], [
      mkEdge('DE01', 'R3-REL-0001', 'MISSING', 'depends_on'),
    ]));

    const { main } = await import('../commands/analyze-structure.js');
    const result = await main(['--workdir', workDir]);
    assert.equal(result.status, 'ok');

    const mdPath = path.join(workDir, '3_graph', 'analysis', 'subagent_prompts', 'structure_gap_analysis.md');
    assert.ok(fs.existsSync(mdPath));
    const md = fs.readFileSync(mdPath, 'utf-8');
    assert.ok(md.includes('| 缺陷ID | 类型 | 节点/边ID | 上下文 | SRS原文引用 |'));
    assert.ok(md.includes('ORPHAN-001'));
    assert.ok(md.includes('孤立需求'));
    assert.ok(md.includes('R1-REQ-0002'));
    assert.ok(md.includes('DANGLE-001'));
    assert.ok(md.includes('MISSING'));
  });

  it('generates cross_file_islands.jsonl', async () => {
    const workDir = createWorkDir('cross-file');
    writeIR(workDir, mkIR([
      mkNode('N1', 'requirement', { statement: 'A' }),
      mkNode('N2', 'requirement', { statement: 'B' }),
    ], [
      mkEdge('E1', 'N1', 'N2', 'depends_on'),
    ]));

    const { main } = await import('../commands/analyze-structure.js');
    const result = await main(['--workdir', workDir]);
    assert.equal(result.status, 'ok');

    const cfPath = path.join(workDir, '3_graph', 'analysis', 'cross_file_islands.jsonl');
    assert.ok(fs.existsSync(cfPath));
    const cf = JSON.parse(fs.readFileSync(cfPath, 'utf-8').trim().split('\n')[0]!);
    assert.equal(cf.island_count, 1);
  });

  it('returns error when srs-ir.json does not exist', async () => {
    const workDir = createWorkDir('missing-ir');
    const { main } = await import('../commands/analyze-structure.js');
    const result = await main(['--workdir', workDir]);
    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('SRSIR file not found'));
  });

  it('rejects non-.srs_formalizer workdir', async () => {
    const badDir = path.join(TMP, 'bad_dir_structure');
    fs.mkdirSync(badDir, { recursive: true });
    const { main } = await import('../commands/analyze-structure.js');
    const result = await main(['--workdir', badDir]);
    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('.srs_formalizer'));
  });

  it('handles empty IR (no nodes, no edges)', async () => {
    const workDir = createWorkDir('empty');
    writeIR(workDir, mkIR([], []));
    const { main } = await import('../commands/analyze-structure.js');
    const result = await main(['--workdir', workDir]);
    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.orphan_count, 0);
    assert.equal(data.dangling_count, 0);
    assert.equal(data.island_count, 0);
  });

  it('returns error when missing --workdir argument', async () => {
    const { main } = await import('../commands/analyze-structure.js');
    const result = await main([]);
    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('Missing required argument'));
  });
});
