import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
const TMP = path.join(os.tmpdir(), `srs-formalizer-analyze-structure-test-${Date.now()}`);
/**
 * Create a temporary .srs_formalizer workdir with graph/ subdir.
 * The basename is always ".srs_formalizer" to satisfy validateWorkDir().
 */
function createWorkDir(name) {
    const workDir = path.join(TMP, name, '.srs_formalizer');
    fs.mkdirSync(path.join(workDir, '3_graph', 'graph'), { recursive: true });
    return workDir;
}
/**
 * Write graph/graph.json in the workdir.
 */
function writeGraph(workDir, data) {
    const graphPath = path.join(workDir, '3_graph', 'graph', 'graph.json');
    fs.writeFileSync(graphPath, JSON.stringify(data, null, 2), 'utf-8');
}
describe('analyze-structure command', () => {
    before(() => {
        fs.mkdirSync(TMP, { recursive: true });
    });
    after(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });
    // -----------------------------------------------------------------------
    it('finds orphan nodes (nodes with no incoming or outgoing edges)', async () => {
        const workDir = createWorkDir('orphans');
        writeGraph(workDir, {
            nodes: [
                { id: 'R1-REQ-0001', labels: [':Requirement'], properties: { statement: 'User can login', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
                { id: 'R1-REQ-0002', labels: [':Requirement'], properties: { statement: 'User can register', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
                { id: 'R2-IMPL-0001', labels: [':ImplicitRequirement'], properties: { statement: 'Session expires', source_file: 'srs.md', confidence: 'medium', category: 'implicit' } },
            ],
            edges: [
                { id: 'R2-IMPL-0001--:DERIVED_FROM--R1-REQ-0001', source: 'R2-IMPL-0001', target: 'R1-REQ-0001', type: ':DERIVED_FROM' },
            ],
        });
        const { main } = await import('../commands/analyze-structure.js');
        const result = await main(['--workdir', workDir]);
        assert.equal(result.status, 'ok');
        const data = result.data;
        assert.equal(data.orphan_count, 1);
        assert.equal(data.dangling_count, 0);
        // Verify orphan_nodes.jsonl contains R1-REQ-0002 (the isolated node)
        const orphanPath = path.join(workDir, '3_graph', 'analysis', 'orphan_nodes.jsonl');
        assert.ok(fs.existsSync(orphanPath));
        const orphanLines = fs.readFileSync(orphanPath, 'utf-8').trim().split('\n');
        assert.equal(orphanLines.length, 1);
        const orphan = JSON.parse(orphanLines[0]);
        assert.equal(orphan.id, 'R1-REQ-0002');
        assert.equal(orphan.statement, 'User can register');
    });
    // -----------------------------------------------------------------------
    it('finds dangling edges (edges whose target node does not exist)', async () => {
        const workDir = createWorkDir('dangling');
        writeGraph(workDir, {
            nodes: [
                { id: 'R1-REQ-0001', labels: [':Requirement'], properties: { statement: 'User can login', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
            ],
            edges: [
                { id: 'R3-REL-0001--:DEPENDS_ON--NONEXISTENT', source: 'R3-REL-0001', target: 'NONEXISTENT', type: ':DEPENDS_ON' },
                { id: 'R3-REL-0002--:REFINES--MISSING', source: 'R3-REL-0002', target: 'MISSING', type: ':REFINES' },
            ],
        });
        const { main } = await import('../commands/analyze-structure.js');
        const result = await main(['--workdir', workDir]);
        assert.equal(result.status, 'ok');
        const data = result.data;
        assert.equal(data.orphan_count, 1); // R1-REQ-0001 is also orphan
        assert.equal(data.dangling_count, 2);
        // Verify dangling_edges.jsonl
        const dangPath = path.join(workDir, '3_graph', 'analysis', 'dangling_edges.jsonl');
        assert.ok(fs.existsSync(dangPath));
        const dangLines = fs.readFileSync(dangPath, 'utf-8').trim().split('\n');
        assert.equal(dangLines.length, 2);
        const edge1 = JSON.parse(dangLines[0]);
        assert.equal(edge1.edge_id, 'R3-REL-0001--:DEPENDS_ON--NONEXISTENT');
        assert.equal(edge1.target_id, 'NONEXISTENT');
        const edge2 = JSON.parse(dangLines[1]);
        assert.equal(edge2.edge_id, 'R3-REL-0002--:REFINES--MISSING');
        assert.equal(edge2.target_id, 'MISSING');
    });
    // -----------------------------------------------------------------------
    it('finds concept islands (disconnected components)', async () => {
        const workDir = createWorkDir('islands');
        writeGraph(workDir, {
            nodes: [
                { id: 'R1-REQ-0001', labels: [':Requirement'], properties: { statement: 'Login', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
                { id: 'R1-REQ-0002', labels: [':Requirement'], properties: { statement: 'Auth', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
                { id: 'R1-REQ-0003', labels: [':Requirement'], properties: { statement: 'Payment', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
                { id: 'R1-REQ-0004', labels: [':Requirement'], properties: { statement: 'Refund', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
            ],
            edges: [
                // Island A: login ↔ auth
                { id: 'E1', source: 'R1-REQ-0001', target: 'R1-REQ-0002', type: ':DEPENDS_ON' },
                // Island B: payment ↔ refund
                { id: 'E2', source: 'R1-REQ-0003', target: 'R1-REQ-0004', type: ':DEPENDS_ON' },
            ],
        });
        const { main } = await import('../commands/analyze-structure.js');
        const result = await main(['--workdir', workDir]);
        assert.equal(result.status, 'ok');
        const data = result.data;
        assert.equal(data.island_count, 2);
        // Verify concept_islands.jsonl
        const islandPath = path.join(workDir, '3_graph', 'analysis', 'concept_islands.jsonl');
        assert.ok(fs.existsSync(islandPath));
        const islandLines = fs.readFileSync(islandPath, 'utf-8').trim().split('\n');
        assert.equal(islandLines.length, 2);
        const island0 = JSON.parse(islandLines[0]);
        assert.equal(island0.size, 2);
        assert.ok(island0.nodes.includes('R1-REQ-0001'));
        assert.ok(island0.nodes.includes('R1-REQ-0002'));
        const island1 = JSON.parse(islandLines[1]);
        assert.equal(island1.size, 2);
    });
    // -----------------------------------------------------------------------
    it('generates structure_gap_analysis.md with correct table format', async () => {
        const workDir = createWorkDir('gap-md');
        writeGraph(workDir, {
            nodes: [
                { id: 'R1-REQ-0001', labels: [':Requirement'], properties: { statement: 'User can login', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
                { id: 'R1-REQ-0002', labels: [':Requirement'], properties: { statement: 'Orphaned requirement', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
            ],
            edges: [
                { id: 'R3-REL-0001--:DEPENDS_ON--MISSING', source: 'R3-REL-0001', target: 'MISSING', type: ':DEPENDS_ON' },
            ],
        });
        const { main } = await import('../commands/analyze-structure.js');
        const result = await main(['--workdir', workDir]);
        assert.equal(result.status, 'ok');
        const mdPath = path.join(workDir, '3_graph', 'analysis', 'subagent_prompts', 'structure_gap_analysis.md');
        assert.ok(fs.existsSync(mdPath));
        const mdContent = fs.readFileSync(mdPath, 'utf-8');
        // Check table header
        assert.ok(mdContent.includes('| 缺陷ID | 类型 | 节点/边ID | 上下文 | SRS原文引用 |'));
        assert.ok(mdContent.includes('|--------|------|-----------|--------|-------------|'));
        // Check orphan row
        assert.ok(mdContent.includes('ORPHAN-001'));
        assert.ok(mdContent.includes('孤立需求'));
        assert.ok(mdContent.includes('R1-REQ-0002'));
        assert.ok(mdContent.includes('Orphaned requirement'));
        // Check dangling edge row
        assert.ok(mdContent.includes('DANGLE-001'));
        assert.ok(mdContent.includes('悬挂边'));
        assert.ok(mdContent.includes('R3-REL-0001--:DEPENDS_ON--MISSING'));
        assert.ok(mdContent.includes('MISSING'));
    });
    // -----------------------------------------------------------------------
    it('returns error when graph/graph.json does not exist', async () => {
        const workDir = createWorkDir('missing-graph');
        const { main } = await import('../commands/analyze-structure.js');
        const result = await main(['--workdir', workDir]);
        assert.equal(result.status, 'error');
        assert.ok(result.message.includes('Graph file not found'));
    });
    // -----------------------------------------------------------------------
    it('rejects non-.srs_formalizer workdir', async () => {
        const badDir = path.join(TMP, 'bad_dir');
        fs.mkdirSync(badDir, { recursive: true });
        const { main } = await import('../commands/analyze-structure.js');
        const result = await main(['--workdir', badDir]);
        assert.equal(result.status, 'error');
        assert.ok(result.message.includes('.srs_formalizer'));
    });
    // -----------------------------------------------------------------------
    it('handles empty graph (no nodes, no edges)', async () => {
        const workDir = createWorkDir('empty');
        writeGraph(workDir, { nodes: [], edges: [] });
        const { main } = await import('../commands/analyze-structure.js');
        const result = await main(['--workdir', workDir]);
        assert.equal(result.status, 'ok');
        const data = result.data;
        assert.equal(data.orphan_count, 0);
        assert.equal(data.dangling_count, 0);
        assert.equal(data.island_count, 0);
    });
    // -----------------------------------------------------------------------
    it('returns error when missing --workdir argument', async () => {
        const { main } = await import('../commands/analyze-structure.js');
        const result = await main([]);
        assert.equal(result.status, 'error');
        assert.ok(result.message.includes('Missing required argument'));
    });
});
//# sourceMappingURL=analyze-structure.test.js.map