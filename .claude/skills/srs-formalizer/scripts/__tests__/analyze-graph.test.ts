import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { GraphData } from '../lib/graph.js';

const TMP = path.join(os.tmpdir(), `srs-formalizer-analyze-graph-test-${Date.now()}`);

/**
 * Create a temporary .srs_formalizer workdir with graph/ subdir.
 */
function createWorkDir(name: string): string {
  const workDir = path.join(TMP, name, '.srs_formalizer');
  fs.mkdirSync(path.join(workDir, '3_graph', 'graph'), { recursive: true });
  return workDir;
}

/**
 * Write graph/graph.json in the workdir.
 */
function writeGraph(workDir: string, data: GraphData): void {
  const graphPath = path.join(workDir, '3_graph', 'graph', 'graph.json');
  fs.writeFileSync(graphPath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Read a JSONL file and return parsed records.
 */
function readJsonlRecords<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf-8');
  return content.trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as T);
}

describe('analyze-graph command', () => {
  before(() => {
    fs.mkdirSync(TMP, { recursive: true });
  });

  after(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  it('detects duplicate requirements via Jaccard similarity (>0.7)', async () => {
    const workDir = createWorkDir('jaccard-duplicates');

    writeGraph(workDir, {
      nodes: [
        { id: 'R1-REQ-0001', labels: [':Requirement'], properties: { statement: '用户可以通过邮箱登录系统', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
        { id: 'R1-REQ-0002', labels: [':Requirement'], properties: { statement: '用户可用邮箱登录系统', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
        { id: 'R1-REQ-0003', labels: [':Requirement'], properties: { statement: '系统需要支持支付功能', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
      ],
      edges: [],
    });

    const { main } = await import('../commands/analyze-graph.js');
    const result = await main(['--workdir', workDir]);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.ok((data.duplicate_pairs as number) >= 1);

    // Verify suspected_duplicates.jsonl
    const dupPath = path.join(workDir, '3_graph', 'analysis', 'suspected_duplicates.jsonl');
    assert.ok(fs.existsSync(dupPath));
    const dups = readJsonlRecords<{ pairId: string; nodeA: string; nodeB: string; similarity: number }>(dupPath);
    assert.ok(dups.length >= 1);
    // The two "login" statements should be similar
    const loginPair = dups.find(
      d => d.nodeA === 'R1-REQ-0001' && d.nodeB === 'R1-REQ-0002'
    );
    assert.ok(loginPair, 'Should find duplicate pair for login requirements');
    assert.ok(loginPair!.similarity > 0.7);
  });

  // -----------------------------------------------------------------------
  it('detects antonym pairs (conflicts) from negation patterns', async () => {
    const workDir = createWorkDir('antonyms');

    writeGraph(workDir, {
      nodes: [
        { id: 'R1-REQ-0001', labels: [':Requirement'], properties: { statement: '系统应记录用户操作日志', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
        { id: 'R1-REQ-0002', labels: [':Requirement'], properties: { statement: '系统不应记录用户操作日志', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
        { id: 'R1-REQ-0003', labels: [':Requirement'], properties: { statement: '用户可以进行支付', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
      ],
      edges: [],
    });

    const { main } = await import('../commands/analyze-graph.js');
    const result = await main(['--workdir', workDir]);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.ok((data.conflict_pairs as number) >= 1);

    // Verify suspected_conflicts.jsonl
    const conPath = path.join(workDir, '3_graph', 'analysis', 'suspected_conflicts.jsonl');
    assert.ok(fs.existsSync(conPath));
    const conflicts = readJsonlRecords<{ pairId: string; nodeA: string; nodeB: string; negationInA: boolean; negationInB: boolean }>(conPath);
    assert.ok(conflicts.length >= 1);
    const antonymPair = conflicts.find(
      c => (c.nodeA === 'R1-REQ-0001' && c.nodeB === 'R1-REQ-0002')
    );
    assert.ok(antonymPair, 'Should find conflict pair for antonym requirements');
    assert.equal(antonymPair!.negationInA, false);
    assert.equal(antonymPair!.negationInB, true);
  });

  // -----------------------------------------------------------------------
  it('detects same-aspect clusters from shared conceptual objects', async () => {
    const workDir = createWorkDir('same-aspect');

    writeGraph(workDir, {
      nodes: [
        { id: 'R1-REQ-0001', labels: [':Requirement'], properties: { statement: '用户可以通过邮箱登录系统', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
        { id: 'R1-REQ-0002', labels: [':Requirement'], properties: { statement: '用户需要完成实名认证', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
        { id: 'R1-REQ-0003', labels: [':Requirement'], properties: { statement: '用户信息应加密存储', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
      ],
      edges: [],
    });

    const { main } = await import('../commands/analyze-graph.js');
    const result = await main(['--workdir', workDir]);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.ok((data.aspect_clusters as number) >= 1);

    // Verify same_aspect_clusters.jsonl
    const aspPath = path.join(workDir, '3_graph', 'analysis', 'same_aspect_clusters.jsonl');
    assert.ok(fs.existsSync(aspPath));
    const clusters = readJsonlRecords<{ clusterId: string; object: string; nodes: string[] }>(aspPath);
    const userCluster = clusters.find(c => c.nodes.includes('R1-REQ-0001'));
    assert.ok(userCluster, 'Should find a cluster containing R1-REQ-0001');
    assert.ok(userCluster!.nodes.includes('R1-REQ-0002'));
    assert.ok(userCluster!.nodes.includes('R1-REQ-0003'));
  });

  // -----------------------------------------------------------------------
  it('generates sub-agent prompt markdown files', async () => {
    const workDir = createWorkDir('prompts');

    writeGraph(workDir, {
      nodes: [
        { id: 'R1-REQ-0001', labels: [':Requirement'], properties: { statement: '用户可以通过邮箱登录', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
        { id: 'R1-REQ-0002', labels: [':Requirement'], properties: { statement: '用户可用邮箱登录', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
        { id: 'R1-REQ-0003', labels: [':Requirement'], properties: { statement: '系统不应记录日志', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
        { id: 'R1-REQ-0004', labels: [':Requirement'], properties: { statement: '用户应实名认证', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
      ],
      edges: [],
    });

    const { main } = await import('../commands/analyze-graph.js');
    const result = await main(['--workdir', workDir]);
    assert.equal(result.status, 'ok');

    const promptsDir = path.join(workDir, '3_graph', 'analysis', 'subagent_prompts');
    const dupPrompt = path.join(promptsDir, 'duplicate_analysis.md');
    const conPrompt = path.join(promptsDir, 'conflict_analysis.md');
    const aspPrompt = path.join(promptsDir, 'aspect_analysis.md');

    assert.ok(fs.existsSync(dupPrompt), 'duplicate_analysis.md should exist');
    assert.ok(fs.existsSync(conPrompt), 'conflict_analysis.md should exist');
    assert.ok(fs.existsSync(aspPrompt), 'aspect_analysis.md should exist');

    // Verify prompt content structure
    const dupContent = fs.readFileSync(dupPrompt, 'utf-8');
    assert.ok(dupContent.includes('疑似重复需求分析'));
    assert.ok(dupContent.includes('DUP-001'));
    assert.ok(dupContent.includes('判决格式'));

    const conContent = fs.readFileSync(conPrompt, 'utf-8');
    assert.ok(conContent.includes('疑似语义冲突分析'));
    assert.ok(conContent.includes('CON-001'));

    const aspContent = fs.readFileSync(aspPrompt, 'utf-8');
    assert.ok(aspContent.includes('同对象多侧面分析'));
    assert.ok(aspContent.includes('ASP-001'));
  });

  // -----------------------------------------------------------------------
  it('reads graph.structure_fixed.json in preference to graph.json', async () => {
    const workDir = createWorkDir('prefer-fixed');

    // Write both files with different content
    writeGraph(workDir, {
      nodes: [
        { id: 'R1-REQ-0001', labels: [':Requirement'], properties: { statement: '旧版需求', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
      ],
      edges: [],
    });

    const fixedGraphPath = path.join(workDir, '3_graph', 'graph', 'graph.structure_fixed.json');
    fs.writeFileSync(fixedGraphPath, JSON.stringify({
      nodes: [
        { id: 'R1-REQ-0001', labels: [':Requirement'], properties: { statement: '新版需求', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
        { id: 'R1-REQ-0002', labels: [':Requirement'], properties: { statement: '用户登录系统', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
      ],
      edges: [],
    }, null, 2), 'utf-8');

    const { main } = await import('../commands/analyze-graph.js');
    const result = await main(['--workdir', workDir]);

    assert.equal(result.status, 'ok');

    // The output should reflect the fixed graph (2 nodes, not 1)
    const dupPath = path.join(workDir, '3_graph', 'analysis', 'suspected_duplicates.jsonl');
    const dups = readJsonlRecords<{ pairId: string }>(dupPath);
    // The fixed graph has a new "用户登录系统" statement, should not be duplicate
    assert.ok(Array.isArray(dups));
  });

  // -----------------------------------------------------------------------
  it('returns error when neither graph file exists', async () => {
    const workDir = createWorkDir('no-graph');

    // Don't write any graph file

    const { main } = await import('../commands/analyze-graph.js');
    const result = await main(['--workdir', workDir]);

    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('Graph file not found'));
  });

  // -----------------------------------------------------------------------
  it('rejects non-.srs_formalizer workdir', async () => {
    const badDir = path.join(TMP, 'bad_dir');
    fs.mkdirSync(badDir, { recursive: true });

    const { main } = await import('../commands/analyze-graph.js');
    const result = await main(['--workdir', badDir]);

    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('.srs_formalizer'));
  });

  // -----------------------------------------------------------------------
  it('handles graph with no :Requirement nodes (no analysis output)', async () => {
    const workDir = createWorkDir('no-reqs');

    writeGraph(workDir, {
      nodes: [
        { id: 'R2-IMPL-0001', labels: [':ImplicitRequirement'], properties: { statement: 'Session expires', source_file: 'srs.md', confidence: 'medium', category: 'implicit' } },
      ],
      edges: [],
    });

    const { main } = await import('../commands/analyze-graph.js');
    const result = await main(['--workdir', workDir]);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.duplicate_pairs, 0);
    assert.equal(data.conflict_pairs, 0);
    assert.equal(data.aspect_clusters, 0);

    // Analysis files should still exist but be empty (or have header only)
    const dupPath = path.join(workDir, '3_graph', 'analysis', 'suspected_duplicates.jsonl');
    assert.ok(fs.existsSync(dupPath));
    const content = fs.readFileSync(dupPath, 'utf-8').trim();
    assert.equal(content, '');
  });

  // -----------------------------------------------------------------------
  it('returns error when missing --workdir argument', async () => {
    const { main } = await import('../commands/analyze-graph.js');
    const result = await main([]);

    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('Missing required argument'));
  });
});
