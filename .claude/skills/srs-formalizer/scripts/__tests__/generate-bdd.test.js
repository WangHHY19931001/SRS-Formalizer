import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
const TMP = path.join(os.tmpdir(), `srs-formalizer-generate-bdd-test-${Date.now()}`);
/**
 * Create a temporary .srs_formalizer workdir with graph/ subdir.
 */
function createWorkDir(name) {
    const workDir = path.join(TMP, name, '.srs_formalizer');
    fs.mkdirSync(path.join(workDir, '3_graph', 'graph'), { recursive: true });
    return workDir;
}
/**
 * Write a graph JSON file to the workdir's graph/ subdirectory.
 */
function writeGraphFile(workDir, filename, data) {
    const filePath = path.join(workDir, '3_graph', 'graph', filename);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}
describe('generate-bdd command', () => {
    before(() => {
        fs.mkdirSync(TMP, { recursive: true });
    });
    after(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });
    // ---------------------------------------------------------------------------
    it('generates .feature files from graph data', async () => {
        const workDir = createWorkDir('basic');
        writeGraphFile(workDir, 'graph.merged.json', {
            nodes: [
                {
                    id: 'R1-REQ-0001',
                    labels: [':Requirement'],
                    properties: { statement: '用户登录', module: '用户模块', source_file: 'srs.md', confidence: 'high', category: 'explicit' },
                },
                {
                    id: 'R1-REQ-0002',
                    labels: [':Requirement'],
                    properties: { statement: '用户注册', module: '用户模块', source_file: 'srs.md', confidence: 'high', category: 'explicit' },
                },
            ],
            edges: [],
        });
        const { main } = await import('../commands/generate-bdd.js');
        const result = await main(['--workdir', workDir]);
        assert.equal(result.status, 'ok');
        const data = result.data;
        assert.equal(data.features_created, 1);
        // Verify output file exists
        const featurePath = path.join(workDir, '4_bdd', 'features', '用户模块.feature');
        assert.ok(fs.existsSync(featurePath), 'Feature file should exist');
        const content = fs.readFileSync(featurePath, 'utf-8');
        assert.ok(content.includes('Feature: 用户模块'));
        assert.ok(content.includes('R1-REQ-0001'));
        assert.ok(content.includes('R1-REQ-0002'));
    });
    // ---------------------------------------------------------------------------
    it('groups nodes by module into separate feature files', async () => {
        const workDir = createWorkDir('group-by-module');
        writeGraphFile(workDir, 'graph.merged.json', {
            nodes: [
                {
                    id: 'R1-REQ-0001',
                    labels: [':Requirement'],
                    properties: { statement: '用户登录', module: '用户模块', source_file: 'srs.md', confidence: 'high', category: 'explicit' },
                },
                {
                    id: 'R1-REQ-0002',
                    labels: [':Requirement'],
                    properties: { statement: '创建订单', module: '订单模块', source_file: 'srs.md', confidence: 'high', category: 'explicit' },
                },
                {
                    id: 'R1-REQ-0003',
                    labels: [':Requirement'],
                    properties: { statement: '支付订单', module: '订单模块', source_file: 'srs.md', confidence: 'high', category: 'explicit' },
                },
            ],
            edges: [],
        });
        const { main } = await import('../commands/generate-bdd.js');
        const result = await main(['--workdir', workDir]);
        assert.equal(result.status, 'ok');
        const data = result.data;
        assert.equal(data.features_created, 2);
        // Verify both feature files exist
        const userFeature = path.join(workDir, '4_bdd', 'features', '用户模块.feature');
        const orderFeature = path.join(workDir, '4_bdd', 'features', '订单模块.feature');
        assert.ok(fs.existsSync(userFeature), 'User module feature should exist');
        assert.ok(fs.existsSync(orderFeature), 'Order module feature should exist');
        const userContent = fs.readFileSync(userFeature, 'utf-8');
        const orderContent = fs.readFileSync(orderFeature, 'utf-8');
        assert.ok(userContent.includes('用户登录'));
        assert.ok(orderContent.includes('创建订单'));
        assert.ok(orderContent.includes('支付订单'));
    });
    // ---------------------------------------------------------------------------
    it('generated scenarios contain <THEN_PLACEHOLDER>', async () => {
        const workDir = createWorkDir('placeholder');
        writeGraphFile(workDir, 'graph.merged.json', {
            nodes: [
                {
                    id: 'R1-REQ-0001',
                    labels: [':Requirement'],
                    properties: { statement: '用户登录', module: '测试模块', source_file: 'srs.md', confidence: 'high', category: 'explicit' },
                },
            ],
            edges: [],
        });
        const { main } = await import('../commands/generate-bdd.js');
        const result = await main(['--workdir', workDir]);
        assert.equal(result.status, 'ok');
        const featurePath = path.join(workDir, '4_bdd', 'features', '测试模块.feature');
        const content = fs.readFileSync(featurePath, 'utf-8');
        assert.ok(content.includes('<THEN_PLACEHOLDER>'), 'Should contain THEN_PLACEHOLDER');
    });
    // ---------------------------------------------------------------------------
    it('generated feature files have correct header annotations', async () => {
        const workDir = createWorkDir('headers');
        writeGraphFile(workDir, 'graph.merged.json', {
            nodes: [
                {
                    id: 'R1-REQ-0001',
                    labels: [':Requirement'],
                    properties: { statement: '用户登录', module: '测试模块', source_file: 'srs.md', confidence: 'high', category: 'explicit' },
                },
            ],
            edges: [],
        });
        const { main } = await import('../commands/generate-bdd.js');
        const result = await main(['--workdir', workDir]);
        assert.equal(result.status, 'ok');
        const featurePath = path.join(workDir, '4_bdd', 'features', '测试模块.feature');
        const content = fs.readFileSync(featurePath, 'utf-8');
        assert.ok(content.includes('# SYSTEM:'));
        assert.ok(content.includes('# TRACE:'));
        assert.ok(content.includes('# TLA_REFS: PENDING'));
        assert.ok(content.includes('# LEAN_REFS: PENDING'));
    });
    // ---------------------------------------------------------------------------
    it('handles empty graph (no nodes, no edges)', async () => {
        const workDir = createWorkDir('empty-graph');
        writeGraphFile(workDir, 'graph.merged.json', { nodes: [], edges: [] });
        const { main } = await import('../commands/generate-bdd.js');
        const result = await main(['--workdir', workDir]);
        assert.equal(result.status, 'ok');
        const data = result.data;
        assert.equal(data.features_created, 0);
    });
    // ---------------------------------------------------------------------------
    it('rejects non-.srs_formalizer workdir', async () => {
        const badDir = path.join(TMP, 'bad_workdir');
        fs.mkdirSync(badDir, { recursive: true });
        const { main } = await import('../commands/generate-bdd.js');
        const result = await main(['--workdir', badDir]);
        assert.equal(result.status, 'error');
        assert.ok(result.message.includes('.srs_formalizer'));
    });
});
//# sourceMappingURL=generate-bdd.test.js.map