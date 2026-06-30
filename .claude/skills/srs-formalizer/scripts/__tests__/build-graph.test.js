import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
const TMP = path.join(os.tmpdir(), `srs-formalizer-build-graph-test-${Date.now()}`);
/**
 * Create a temporary .srs_formalizer workdir with 2_extract/r1-explicit/, 2_extract/r2-implicit/, 2_extract/r3-relational/ subdirs.
 * The basename is always ".srs_formalizer" to satisfy validateWorkDir().
 */
function createWorkDir(name) {
    const workDir = path.join(TMP, name, '.srs_formalizer');
    const subdirs = ['2_extract/r1-explicit', '2_extract/r2-implicit', '2_extract/r3-relational', '3_graph/graph'];
    for (const sub of subdirs) {
        fs.mkdirSync(path.join(workDir, sub), { recursive: true });
    }
    return workDir;
}
/**
 * Write a JSONL file with the given records.
 */
function writeJsonl(dir, filename, records) {
    const content = records.map(r => JSON.stringify(r)).join('\n') + '\n';
    fs.writeFileSync(path.join(dir, filename), content, 'utf-8');
}
describe('build-graph command', () => {
    before(() => {
        fs.mkdirSync(TMP, { recursive: true });
    });
    after(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });
    it('builds graph from multiple JSONL files with correct node count', async () => {
        const workDir = createWorkDir('multi_file');
        // R1 explicit records
        writeJsonl(path.join(workDir, '2_extract', 'r1-explicit'), 'a.jsonl', [
            { id: 'R1-REQ-0001', category: 'explicit', statement: 'User can login', source_file: 'srs.md', confidence: 'high' },
            { id: 'R1-REQ-0002', category: 'explicit', statement: 'User can register', source_file: 'srs.md', confidence: 'high' },
        ]);
        // R2 implicit records
        writeJsonl(path.join(workDir, '2_extract', 'r2-implicit'), 'b.jsonl', [
            { id: 'R2-IMPL-0001', category: 'implicit', statement: 'Session expires', source_file: 'srs.md', confidence: 'medium' },
        ]);
        // R3 relational records
        writeJsonl(path.join(workDir, '2_extract', 'r3-relational'), 'c.jsonl', [
            { id: 'R3-REL-0001', category: 'relational', statement: 'Login depends on auth', source_file: 'srs.md', confidence: 'medium' },
        ]);
        const { main } = await import('../commands/build-graph.js');
        const result = await main(['--workdir', workDir]);
        assert.equal(result.status, 'ok');
        const data = result.data;
        assert.equal(data.nodes.length, 4);
        assert.equal(data.edges.length, 0);
        // Verify output graph.json file
        const graphPath = path.join(workDir, '3_graph', 'graph', 'graph.json');
        assert.ok(fs.existsSync(graphPath), 'graph/graph.json should exist');
        const fileContent = JSON.parse(fs.readFileSync(graphPath, 'utf-8'));
        assert.equal(fileContent.nodes.length, 4);
        assert.equal(fileContent.edges.length, 0);
    });
    it('creates DERIVED_FROM edges from R2 records', async () => {
        const workDir = createWorkDir('derived_from');
        writeJsonl(path.join(workDir, '2_extract', 'r1-explicit'), 'a.jsonl', [
            { id: 'R1-REQ-0001', category: 'explicit', statement: 'User can login', source_file: 'srs.md', confidence: 'high' },
        ]);
        writeJsonl(path.join(workDir, '2_extract', 'r2-implicit'), 'b.jsonl', [
            { id: 'R2-IMPL-0001', category: 'implicit', statement: 'Session expires', source_file: 'srs.md', confidence: 'medium', metadata: { derived_from: 'R1-REQ-0001' } },
        ]);
        const { main } = await import('../commands/build-graph.js');
        const result = await main(['--workdir', workDir]);
        assert.equal(result.status, 'ok');
        const data = result.data;
        assert.equal(data.nodes.length, 2);
        assert.equal(data.edges.length, 1);
        assert.equal(data.edges[0].source, 'R2-IMPL-0001');
        assert.equal(data.edges[0].target, 'R1-REQ-0001');
        assert.equal(data.edges[0].type, ':DERIVED_FROM');
    });
    it('creates DEPENDS_ON and REFINES edges from R3 records', async () => {
        const workDir = createWorkDir('relations');
        writeJsonl(path.join(workDir, '2_extract', 'r1-explicit'), 'a.jsonl', [
            { id: 'R1-REQ-0001', category: 'explicit', statement: 'User can login', source_file: 'srs.md', confidence: 'high' },
            { id: 'R1-REQ-0002', category: 'explicit', statement: 'User can register', source_file: 'srs.md', confidence: 'high' },
        ]);
        writeJsonl(path.join(workDir, '2_extract', 'r3-relational'), 'c.jsonl', [
            { id: 'R3-REL-0001', category: 'relational', statement: 'Login depends on auth', source_file: 'srs.md', confidence: 'medium', metadata: { relation: { target: 'R1-REQ-0001', type: 'DEPENDS_ON' } } },
            { id: 'R3-REL-0002', category: 'relational', statement: 'Login refines registration', source_file: 'srs.md', confidence: 'medium', metadata: { relation: { target: 'R1-REQ-0002', type: 'REFINES' } } },
        ]);
        const { main } = await import('../commands/build-graph.js');
        const result = await main(['--workdir', workDir]);
        assert.equal(result.status, 'ok');
        const data = result.data;
        assert.equal(data.nodes.length, 4);
        assert.equal(data.edges.length, 2);
        const dependsOn = data.edges.find(e => e.type === ':DEPENDS_ON');
        assert.ok(dependsOn, 'Should have a DEPENDS_ON edge');
        assert.equal(dependsOn.source, 'R3-REL-0001');
        assert.equal(dependsOn.target, 'R1-REQ-0001');
        const refines = data.edges.find(e => e.type === ':REFINES');
        assert.ok(refines, 'Should have a REFINES edge');
        assert.equal(refines.source, 'R3-REL-0002');
        assert.equal(refines.target, 'R1-REQ-0002');
    });
    it('deduplicates records with same id (first occurrence wins)', async () => {
        const workDir = createWorkDir('dedup');
        // First file with original statement
        writeJsonl(path.join(workDir, '2_extract', 'r1-explicit'), 'a.jsonl', [
            { id: 'R1-REQ-0001', category: 'explicit', statement: 'Original statement', source_file: 'srs.md', confidence: 'high' },
        ]);
        // Second file with duplicate id but different statement
        writeJsonl(path.join(workDir, '2_extract', 'r1-explicit'), 'b.jsonl', [
            { id: 'R1-REQ-0001', category: 'explicit', statement: 'Duplicate statement', source_file: 'srs.md', confidence: 'low' },
        ]);
        const { main } = await import('../commands/build-graph.js');
        const result = await main(['--workdir', workDir]);
        assert.equal(result.status, 'ok');
        const data = result.data;
        assert.equal(data.nodes.length, 1);
        assert.equal(data.nodes[0].id, 'R1-REQ-0001');
        assert.equal(data.nodes[0].properties.statement, 'Original statement');
    });
    it('returns empty graph when no JSONL files exist in subdirectories', async () => {
        const workDir = createWorkDir('empty');
        const { main } = await import('../commands/build-graph.js');
        const result = await main(['--workdir', workDir]);
        assert.equal(result.status, 'ok');
        const data = result.data;
        assert.equal(data.nodes.length, 0);
        assert.equal(data.edges.length, 0);
        // Verify output graph.json also has empty graph
        const graphPath = path.join(workDir, '3_graph', 'graph', 'graph.json');
        assert.ok(fs.existsSync(graphPath), '3_graph/graph/graph.json should exist even with no data');
        const fileContent = JSON.parse(fs.readFileSync(graphPath, 'utf-8'));
        assert.equal(fileContent.nodes.length, 0);
        assert.equal(fileContent.edges.length, 0);
    });
    it('rejects non-.srs_formalizer workdir', async () => {
        const workDir = path.join(TMP, 'not_formalizer');
        fs.mkdirSync(workDir, { recursive: true });
        const { main } = await import('../commands/build-graph.js');
        const result = await main(['--workdir', workDir]);
        assert.equal(result.status, 'error');
        assert.ok(result.message.includes('.srs_formalizer'), 'Error message should mention .srs_formalizer');
    });
    it('outputs deterministic results for identical JSONL input', async () => {
        const workDirA = createWorkDir('deterministic_a');
        const workDirB = createWorkDir('deterministic_b');
        // Identical JSONL in both workdirs
        const records = [
            { id: 'R1-REQ-0001', category: 'explicit', statement: 'User can login', source_file: 'srs.md', confidence: 'high' },
            { id: 'R1-REQ-0002', category: 'explicit', statement: 'User can register', source_file: 'srs.md', confidence: 'high' },
            { id: 'R2-IMPL-0001', category: 'implicit', statement: 'Session expires', source_file: 'srs.md', confidence: 'medium', metadata: { derived_from: 'R1-REQ-0001' } },
            { id: 'R3-REL-0001', category: 'relational', statement: 'Login depends on auth', source_file: 'srs.md', confidence: 'medium', metadata: { relation: { target: 'R1-REQ-0001', type: 'DEPENDS_ON' } } },
        ];
        for (const wd of [workDirA, workDirB]) {
            writeJsonl(path.join(wd, '2_extract', 'r1-explicit'), 'a.jsonl', records.slice(0, 2));
            writeJsonl(path.join(wd, '2_extract', 'r2-implicit'), 'b.jsonl', records.slice(2, 3));
            writeJsonl(path.join(wd, '2_extract', 'r3-relational'), 'c.jsonl', records.slice(3, 4));
        }
        const { main } = await import('../commands/build-graph.js');
        const resultA = await main(['--workdir', workDirA]);
        const resultB = await main(['--workdir', workDirB]);
        assert.equal(resultA.status, 'ok');
        assert.equal(resultB.status, 'ok');
        const dataA = JSON.stringify(resultA.data);
        const dataB = JSON.stringify(resultB.data);
        assert.equal(dataA, dataB, 'Same input should produce identical graph output');
    });
});
//# sourceMappingURL=build-graph.test.js.map