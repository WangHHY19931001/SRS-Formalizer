import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { SRSIR } from '../types/srs-ir.js';

const TMP = path.join(os.tmpdir(), `srs-formalizer-analyze-graph-test-${Date.now()}`);

function mkMeta(): SRSIR['meta'] {
  return { sourcePath: '/tmp/test.md', sourceHash: 'abc', language: 'zh', totalChars: 100, totalShards: 1, totalNodes: 0, totalEdges: 0, buildTimestamp: new Date().toISOString() };
}

function mkNode(id: string, type: SRSIR['nodes'][number]['type'] = 'requirement', props?: Partial<SRSIR['nodes'][number]['properties']>): SRSIR['nodes'][number] {
  return { id, type, module: 'mod', labels: [], properties: props ?? {}, source: { filePath: '/tmp/test.md', startLine: 1, endLine: 2, shardId: 'shard-1', chapter: '§1' } };
}

function mkIR(nodes: SRSIR['nodes'], edges: SRSIR['edges'] = []): SRSIR {
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

function readJsonlRecords<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf-8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as T);
}

describe('analyze-graph command (SRSIR port with NFR isolation)', () => {
  before(() => { fs.mkdirSync(TMP, { recursive: true }); });
  after(() => { fs.rmSync(TMP, { recursive: true, force: true }); });

  it('detects duplicate requirements via Jaccard similarity (>0.7)', async () => {
    const workDir = createWorkDir('jaccard-dupes');
    writeIR(workDir, mkIR([
      mkNode('R1-REQ-0001', 'requirement', { statement: '用户可以通过邮箱登录系统' }),
      mkNode('R1-REQ-0002', 'requirement', { statement: '用户可用邮箱登录系统' }),
      mkNode('R1-REQ-0003', 'requirement', { statement: '系统需要支持支付功能' }),
    ]));

    const { main } = await import('../commands/analyze-graph.js');
    const result = await main(['--workdir', workDir]);
    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.ok((data.duplicate_pairs as number) >= 1);

    const dupPath = path.join(workDir, '3_graph', 'analysis', 'suspected_duplicates.jsonl');
    const dups = readJsonlRecords<{ pairId: string; nodeA: string; nodeB: string; similarity: number }>(dupPath);
    assert.ok(dups.length >= 1);
    const loginPair = dups.find(d => d.nodeA === 'R1-REQ-0001' && d.nodeB === 'R1-REQ-0002');
    assert.ok(loginPair, 'Should find duplicate pair for login requirements');
    assert.ok(loginPair!.similarity > 0.7);
  });

  it('returns zero duplicates when all pairs below threshold', async () => {
    const workDir = createWorkDir('no-dupes');
    writeIR(workDir, mkIR([
      mkNode('R1-REQ-0001', 'requirement', { statement: '用户可以通过邮箱登录系统' }),
      mkNode('R1-REQ-0002', 'requirement', { statement: '系统需要支持支付功能' }),
    ]));

    const { main } = await import('../commands/analyze-graph.js');
    const result = await main(['--workdir', workDir]);
    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.duplicate_pairs, 0);
  });

  it('detects antonym pairs (conflicts) from negation patterns', async () => {
    const workDir = createWorkDir('antonyms');
    writeIR(workDir, mkIR([
      mkNode('R1-REQ-0001', 'requirement', { statement: '系统应记录用户操作日志' }),
      mkNode('R1-REQ-0002', 'requirement', { statement: '系统不应记录用户操作日志' }),
      mkNode('R1-REQ-0003', 'requirement', { statement: '用户可以进行支付' }),
    ]));

    const { main } = await import('../commands/analyze-graph.js');
    const result = await main(['--workdir', workDir]);
    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.ok((data.conflict_pairs as number) >= 1);

    const conPath = path.join(workDir, '3_graph', 'analysis', 'suspected_conflicts.jsonl');
    const conflicts = readJsonlRecords<{ pairId: string; nodeA: string; nodeB: string; negationInA: boolean; negationInB: boolean }>(conPath);
    assert.ok(conflicts.length >= 1);
    const antonymPair = conflicts.find(c => c.nodeA === 'R1-REQ-0001' && c.nodeB === 'R1-REQ-0002');
    assert.ok(antonymPair, 'Should find conflict pair');
    assert.equal(antonymPair!.negationInA, false);
    assert.equal(antonymPair!.negationInB, true);
  });

  it('detects same-aspect clusters from shared bigrams', async () => {
    const workDir = createWorkDir('same-aspect');
    writeIR(workDir, mkIR([
      mkNode('R1-REQ-0001', 'requirement', { statement: '用户可以通过邮箱登录系统' }),
      mkNode('R1-REQ-0002', 'requirement', { statement: '用户需要完成实名认证' }),
      mkNode('R1-REQ-0003', 'requirement', { statement: '用户信息应加密存储' }),
    ]));

    const { main } = await import('../commands/analyze-graph.js');
    const result = await main(['--workdir', workDir]);
    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.ok((data.aspect_clusters as number) >= 1);

    const aspPath = path.join(workDir, '3_graph', 'analysis', 'same_aspect_clusters.jsonl');
    const clusters = readJsonlRecords<{ clusterId: string; object: string; nodes: string[]; nfrNodes: string[] }>(aspPath);
    const userCluster = clusters.find(c => c.nodes.includes('R1-REQ-0001'));
    assert.ok(userCluster, 'Should find cluster containing R1-REQ-0001');
    assert.ok(userCluster!.nodes.includes('R1-REQ-0002'));
    assert.ok(userCluster!.nodes.includes('R1-REQ-0003'));
    assert.equal(userCluster!.nfrNodes.length, 0);
  });

  it('isolates NFR nodes in same-aspect clusters', async () => {
    const workDir = createWorkDir('nfr-isolation');
    writeIR(workDir, mkIR([
      mkNode('REQ-0001', 'requirement', { statement: '用户登录响应时间应小于200ms' }),
      mkNode('REQ-0002', 'requirement', { statement: '用户认证应高效完成' }),
      mkNode('NFR-0001', 'nfr', { statement: '系统响应时间不得超过500ms', nfrCategory: 'performance' }),
    ]));

    const { main } = await import('../commands/analyze-graph.js');
    const result = await main(['--workdir', workDir]);
    assert.equal(result.status, 'ok');

    const aspPath = path.join(workDir, '3_graph', 'analysis', 'same_aspect_clusters.jsonl');
    const clusters = readJsonlRecords<{ nodes: string[]; nfrNodes: string[]; hasNFR: boolean }>(aspPath);
    const clusterWithNFR = clusters.find(c => c.nodes.includes('NFR-0001'));
    if (clusterWithNFR) {
      assert.ok(clusterWithNFR.nfrNodes.includes('NFR-0001'));
      assert.equal(clusterWithNFR.hasNFR, true);
    }
  });

  it('generates sub-agent prompt markdown files', async () => {
    const workDir = createWorkDir('prompts');
    writeIR(workDir, mkIR([
      mkNode('R1-REQ-0001', 'requirement', { statement: '用户可以通过邮箱登录' }),
      mkNode('R1-REQ-0002', 'requirement', { statement: '用户可用邮箱登录' }),
      mkNode('R1-REQ-0003', 'requirement', { statement: '系统不应记录日志' }),
      mkNode('R1-REQ-0004', 'requirement', { statement: '用户应实名认证' }),
    ]));

    const { main } = await import('../commands/analyze-graph.js');
    const result = await main(['--workdir', workDir]);
    assert.equal(result.status, 'ok');

    const promptsDir = path.join(workDir, '3_graph', 'analysis', 'subagent_prompts');
    assert.ok(fs.existsSync(path.join(promptsDir, 'duplicate_analysis.md')));
    assert.ok(fs.existsSync(path.join(promptsDir, 'conflict_analysis.md')));
    assert.ok(fs.existsSync(path.join(promptsDir, 'aspect_analysis.md')));

    const dupContent = fs.readFileSync(path.join(promptsDir, 'duplicate_analysis.md'), 'utf-8');
    assert.ok(dupContent.includes('疑似重复需求分析'));
    assert.ok(dupContent.includes('DUP-001'));

    const conContent = fs.readFileSync(path.join(promptsDir, 'conflict_analysis.md'), 'utf-8');
    assert.ok(conContent.includes('疑似语义冲突分析'));

    const aspContent = fs.readFileSync(path.join(promptsDir, 'aspect_analysis.md'), 'utf-8');
    assert.ok(aspContent.includes('同对象多侧面分析'));
  });

  it('returns error when srs-ir.json does not exist', async () => {
    const workDir = createWorkDir('no-ir');
    const { main } = await import('../commands/analyze-graph.js');
    const result = await main(['--workdir', workDir]);
    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('SRSIR file not found'));
  });

  it('rejects non-.srs_formalizer workdir', async () => {
    const badDir = path.join(TMP, 'bad_dir_graph');
    fs.mkdirSync(badDir, { recursive: true });
    const { main } = await import('../commands/analyze-graph.js');
    const result = await main(['--workdir', badDir]);
    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('.srs_formalizer'));
  });

  it('handles IR with no requirement nodes (zero output)', async () => {
    const workDir = createWorkDir('no-reqs');
    writeIR(workDir, mkIR([
      mkNode('R2-IMPL-0001', 'architecture', { statement: 'Session expires' }),
    ]));

    const { main } = await import('../commands/analyze-graph.js');
    const result = await main(['--workdir', workDir]);
    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.duplicate_pairs, 0);
    assert.equal(data.conflict_pairs, 0);
    assert.equal(data.aspect_clusters, 0);

    const dupPath = path.join(workDir, '3_graph', 'analysis', 'suspected_duplicates.jsonl');
    const content = fs.readFileSync(dupPath, 'utf-8').trim();
    assert.equal(content, '');
  });

  it('returns error when missing --workdir argument', async () => {
    const { main } = await import('../commands/analyze-graph.js');
    const result = await main([]);
    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('Missing required argument'));
  });
});
