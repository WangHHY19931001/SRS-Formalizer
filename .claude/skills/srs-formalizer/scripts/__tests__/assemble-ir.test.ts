import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { main } from '../commands/assemble-ir.js';

function setupWorkdir(): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'srs-asm-'));
  const wd = path.join(tmp, '.srs_formalizer');
  fs.mkdirSync(path.join(wd, '2_extract', 'r1-explicit'), { recursive: true });
  fs.mkdirSync(path.join(wd, '2_extract', 'r2-implicit'), { recursive: true });
  fs.mkdirSync(path.join(wd, '2_extract', 'r3-relational'), { recursive: true });
  fs.mkdirSync(path.join(wd, '2_extract', 'architecture'), { recursive: true });
  fs.mkdirSync(path.join(wd, '_ctx'), { recursive: true });
  return wd;
}

test('assemble-ir 装配 IR 并通过完整性校验', async () => {
  const wd = setupWorkdir();
  fs.writeFileSync(
    path.join(wd, '2_extract', 'r1-explicit', 'a.jsonl'),
    JSON.stringify({ id: 'R1-S001-0001', category: 'explicit', statement: '需求A', source_file: 'srs.md', confidence: 'high', metadata: { shard_id: 'S001', chapter: '1', start_line: 1, end_line: 2 } }) + '\n',
  );
  const res = await main(['--workdir', wd]);
  assert.equal(res.status, 'ok');
  const ir = JSON.parse(fs.readFileSync(path.join(wd, 'srs-ir.json'), 'utf-8'));
  assert.equal(ir.version, '2.1.0');
  assert.equal(ir.meta.totalNodes, 1);
  assert.ok(ir.meta.buildTimestamp);
});

test('assemble-ir 检测重复 ID 失败', async () => {
  const wd = setupWorkdir();
  const dup = JSON.stringify({ id: 'R1-S001-0001', category: 'explicit', statement: 'x', source_file: 'srs.md', confidence: 'high', metadata: { shard_id: 'S001', chapter: '1', start_line: 1, end_line: 1 } }) + '\n';
  fs.writeFileSync(path.join(wd, '2_extract', 'r1-explicit', 'a.jsonl'), dup);
  fs.writeFileSync(path.join(wd, '2_extract', 'r2-implicit', 'b.jsonl'), dup);
  const res = await main(['--workdir', wd]);
  assert.equal(res.status, 'error');
  assert.match(res.message ?? '', /重复 ID|duplicate/i);
});

test('assemble-ir 缺少 --workdir 报错', async () => {
  const res = await main([]);
  assert.equal(res.status, 'error');
});

test('assemble-ir 装配数据流：data_entity 节点 + produces/consumes 边', async () => {
  const wd = setupWorkdir();
  fs.mkdirSync(path.join(wd, '2_extract', 'data-entities'), { recursive: true });
  fs.writeFileSync(
    path.join(wd, '2_extract', 'r1-explicit', 'a.jsonl'),
    JSON.stringify({ id: 'R1-S001-0001', category: 'explicit', statement: '创建订单', source_file: 'srs.md', confidence: 'high', metadata: { shard_id: 'S001', chapter: '1', start_line: 1, end_line: 2 } }) + '\n' +
    JSON.stringify({ id: 'R1-S001-0002', category: 'explicit', statement: '查询订单', source_file: 'srs.md', confidence: 'high', metadata: { shard_id: 'S001', chapter: '1', start_line: 3, end_line: 4 } }) + '\n',
  );
  fs.writeFileSync(
    path.join(wd, '2_extract', 'data-entities', 'df.jsonl'),
    JSON.stringify({ kind: 'entity', id: 'DE-order', canonical: '订单', source_shard: 'S001' }) + '\n' +
    JSON.stringify({ kind: 'flow', requirement_id: 'R1-S001-0001', entity_id: 'DE-order', action: 'produces', source_shard: 'S001' }) + '\n' +
    JSON.stringify({ kind: 'flow', requirement_id: 'R1-S001-0002', entity_id: 'DE-order', action: 'consumes', source_shard: 'S001' }) + '\n',
  );
  const res = await main(['--workdir', wd]);
  assert.equal(res.status, 'ok');
  const ir = JSON.parse(fs.readFileSync(path.join(wd, 'srs-ir.json'), 'utf-8'));
  const de = ir.nodes.find((n: any) => n.id === 'DE-order');
  assert.ok(de, 'data_entity node assembled');
  assert.equal(de.type, 'data_entity');
  assert.equal(ir.edges.length, 2);
  assert.ok(ir.edges.some((e: any) => e.type === 'produces' && e.source === 'R1-S001-0001' && e.target === 'DE-order'));
  assert.ok(ir.edges.some((e: any) => e.type === 'consumes' && e.source === 'R1-S001-0002' && e.target === 'DE-order'));
});

test('assemble-ir 数据流边悬挂 requirement_id → 完整性校验失败', async () => {
  const wd = setupWorkdir();
  fs.mkdirSync(path.join(wd, '2_extract', 'data-entities'), { recursive: true });
  fs.writeFileSync(
    path.join(wd, '2_extract', 'r1-explicit', 'a.jsonl'),
    JSON.stringify({ id: 'R1-S001-0001', category: 'explicit', statement: 'x', source_file: 'srs.md', confidence: 'high', metadata: { shard_id: 'S001', chapter: '1', start_line: 1, end_line: 2 } }) + '\n',
  );
  fs.writeFileSync(
    path.join(wd, '2_extract', 'data-entities', 'df.jsonl'),
    JSON.stringify({ kind: 'entity', id: 'DE-order', canonical: '订单', source_shard: 'S001' }) + '\n' +
    JSON.stringify({ kind: 'flow', requirement_id: 'R1-S999-9999', entity_id: 'DE-order', action: 'produces', source_shard: 'S001' }) + '\n',
  );
  const res = await main(['--workdir', wd]);
  assert.equal(res.status, 'error');
  assert.match(res.message ?? '', /悬挂边|dangling/i);
});

test('assemble-ir 数据流记录非法 → 报错', async () => {
  const wd = setupWorkdir();
  fs.mkdirSync(path.join(wd, '2_extract', 'data-entities'), { recursive: true });
  fs.writeFileSync(
    path.join(wd, '2_extract', 'data-entities', 'df.jsonl'),
    JSON.stringify({ kind: 'entity', id: 'bad-id', canonical: '订单', source_shard: 'S001' }) + '\n',
  );
  const res = await main(['--workdir', wd]);
  assert.equal(res.status, 'error');
  assert.match(res.message ?? '', /数据流记录校验失败/);
});

describe('assemble-ir toIREdges (P0-1)', () => {
  it('should extract depends_on/refines edges from r3-relational JSONL', async () => {
    const wd = setupWorkdir();
    try {
      // 写入 R1 需求
      fs.writeFileSync(
        path.join(wd, '2_extract', 'r1-explicit', 'test.jsonl'),
        JSON.stringify({
          id: 'R1-S001-0001', category: 'explicit', statement: '系统必须支持用户登录',
          source_file: 'frozen/DESIGN.md', confidence: 'high',
          metadata: { shard_id: 'S001', chapter: '1', start_line: 1, end_line: 10, provenance: 'explicit-located' }
        }) + '\n' +
        JSON.stringify({
          id: 'R1-S002-0001', category: 'explicit', statement: '系统必须支持权限管理',
          source_file: 'frozen/DESIGN.md', confidence: 'high',
          metadata: { shard_id: 'S002', chapter: '2', start_line: 11, end_line: 20, provenance: 'explicit-located' }
        }) + '\n'
      );

      // 写入 R3 关系需求（DEPENDS_ON）
      fs.writeFileSync(
        path.join(wd, '2_extract', 'r3-relational', 'test.jsonl'),
        JSON.stringify({
          id: 'R3-S001-0001', category: 'relational', statement: '权限管理依赖于用户登录',
          source_file: 'frozen/DESIGN.md', confidence: 'high',
          metadata: {
            shard_id: 'S001', chapter: '1', provenance: 'doc-derived',
            relation: { type: 'DEPENDS_ON' },
            source_id: 'R1-S002-0001',
            target_id: 'R1-S001-0001'
          }
        }) + '\n'
      );

      // 写入空 shard_index
      fs.writeFileSync(
        path.join(wd, '_ctx', 'shard_index.json'),
        JSON.stringify({ language: 'zh', shards: [], source_path: '', source_hash: '', total_chars: 0, total_shards: 0 })
      );

      // 运行 assemble-ir
      const result = await main(['--workdir', wd]);

      assert.equal(result.status, 'ok', `assemble-ir failed: ${result.message ?? ''}`);

      // 读取生成的 IR
      const ir = JSON.parse(fs.readFileSync(path.join(wd, 'srs-ir.json'), 'utf-8'));

      // 验证 edges 包含 depends_on 关系边
      const dependsOnEdges = ir.edges.filter((e: { type: string }) => e.type === 'depends_on');
      assert.ok(dependsOnEdges.length > 0, 'IR should contain depends_on edges from r3-relational');
      assert.equal(dependsOnEdges[0].source, 'R1-S002-0001');
      assert.equal(dependsOnEdges[0].target, 'R1-S001-0001');
    } finally {
      fs.rmSync(path.dirname(wd), { recursive: true, force: true });
    }
  });
});

describe('assemble-ir module field (P0-2)', () => {
  it('should not fill module with source_file path (P0-2)', async () => {
    const wd = setupWorkdir();
    try {
      fs.writeFileSync(
        path.join(wd, '2_extract', 'r1-explicit', 'test.jsonl'),
        JSON.stringify({
          id: 'R1-S005-0001', category: 'explicit', statement: 'test',
          source_file: 'frozen/DESIGN.md', confidence: 'high',
          metadata: { shard_id: 'S005', chapter: '5', start_line: 1, end_line: 10, provenance: 'explicit-located' }
        }) + '\n'
      );
      fs.writeFileSync(
        path.join(wd, '_ctx', 'shard_index.json'),
        JSON.stringify({ language: 'zh', shards: [], source_path: '', source_hash: '', total_chars: 0, total_shards: 0 })
      );

      const result = await main(['--workdir', wd]);
      assert.equal(result.status, 'ok');

      const ir = JSON.parse(fs.readFileSync(path.join(wd, 'srs-ir.json'), 'utf-8'));
      const node = ir.nodes.find((n: { id: string }) => n.id === 'R1-S005-0001');
      assert.ok(node, 'R1-S005-0001 should be in IR');
      assert.notEqual(node.module, 'frozen/DESIGN.md', 'module should NOT be source_file path');
      assert.equal(node.module, 'S005', 'module should be shard_id');
    } finally {
      fs.rmSync(path.dirname(wd), { recursive: true, force: true });
    }
  });

  it('should fall back to record.id when shard_id is missing (P0-2)', async () => {
    const wd = setupWorkdir();
    try {
      fs.writeFileSync(
        path.join(wd, '2_extract', 'r1-explicit', 'test.jsonl'),
        JSON.stringify({
          id: 'R1-S005-0001', category: 'explicit', statement: 'test',
          source_file: 'frozen/DESIGN.md', confidence: 'high',
          metadata: { chapter: '5', start_line: 1, end_line: 10 }  // 无 shard_id
        }) + '\n'
      );
      fs.writeFileSync(
        path.join(wd, '_ctx', 'shard_index.json'),
        JSON.stringify({ language: 'zh', shards: [], source_path: '', source_hash: '', total_chars: 0, total_shards: 0 })
      );
      const result = await main(['--workdir', wd]);
      assert.equal(result.status, 'ok');
      const ir = JSON.parse(fs.readFileSync(path.join(wd, 'srs-ir.json'), 'utf-8'));
      const node = ir.nodes.find((n: { id: string }) => n.id === 'R1-S005-0001');
      assert.equal(node.module, 'R1-S005-0001', 'module should fall back to record.id');
    } finally {
      fs.rmSync(path.dirname(wd), { recursive: true, force: true });
    }
  });
});

describe('assemble-ir R1 precheck (P0-2 filename + coverage)', () => {
  test('P0-2: rejects R1 interval filename S006-007.jsonl when shard_index has SNNN IDs', async () => {
    const wd = setupWorkdir();
    try {
      fs.writeFileSync(
        path.join(wd, '_ctx', 'shard_index.json'),
        JSON.stringify({ shards: [{ id: 'S001' }, { id: 'S006' }, { id: 'S007' }], total_shards: 3 }),
      );
      fs.writeFileSync(
        path.join(wd, '2_extract', 'r1-explicit', 'S006-007.jsonl'),
        JSON.stringify({ id: 'R1-S006-0001', category: 'explicit', statement: 'x', source_file: 'srs.md', confidence: 'high', metadata: { shard_id: 'S006' } }) + '\n',
      );
      fs.writeFileSync(
        path.join(wd, '2_extract', 'r1-explicit', 'S001.jsonl'),
        JSON.stringify({ id: 'R1-S001-0001', category: 'explicit', statement: 'x', source_file: 'srs.md', confidence: 'high', metadata: { shard_id: 'S001' } }) + '\n',
      );
      fs.writeFileSync(
        path.join(wd, '2_extract', 'r1-explicit', 'S007.jsonl'),
        JSON.stringify({ id: 'R1-S007-0001', category: 'explicit', statement: 'x', source_file: 'srs.md', confidence: 'high', metadata: { shard_id: 'S007' } }) + '\n',
      );
      const res = await main(['--workdir', wd]);
      assert.equal(res.status, 'error');
      assert.match(res.message ?? '', /R1 文件名违规.*S006-007/);
    } finally {
      fs.rmSync(path.dirname(wd), { recursive: true, force: true });
    }
  });

  test('P0-2: rejects R1 shard coverage gap (3 shards in index, only 1 has R1)', async () => {
    const wd = setupWorkdir();
    try {
      fs.writeFileSync(
        path.join(wd, '_ctx', 'shard_index.json'),
        JSON.stringify({ shards: [{ id: 'S001' }, { id: 'S002' }, { id: 'S003' }], total_shards: 3 }),
      );
      fs.writeFileSync(
        path.join(wd, '2_extract', 'r1-explicit', 'S001.jsonl'),
        JSON.stringify({ id: 'R1-S001-0001', category: 'explicit', statement: 'x', source_file: 'srs.md', confidence: 'high', metadata: { shard_id: 'S001' } }) + '\n',
      );
      const res = await main(['--workdir', wd]);
      assert.equal(res.status, 'error');
      assert.match(res.message ?? '', /R1 分片覆盖率不足.*S002.*S003/);
    } finally {
      fs.rmSync(path.dirname(wd), { recursive: true, force: true });
    }
  });

  test('P0-2: accepts _empty_shards.json as coverage declaration', async () => {
    const wd = setupWorkdir();
    try {
      fs.writeFileSync(
        path.join(wd, '_ctx', 'shard_index.json'),
        JSON.stringify({ shards: [{ id: 'S001' }, { id: 'S002' }], total_shards: 2 }),
      );
      fs.writeFileSync(
        path.join(wd, '2_extract', 'r1-explicit', 'S001.jsonl'),
        JSON.stringify({ id: 'R1-S001-0001', category: 'explicit', statement: 'x', source_file: 'srs.md', confidence: 'high', metadata: { shard_id: 'S001' } }) + '\n',
      );
      fs.writeFileSync(
        path.join(wd, '2_extract', 'r1-explicit', '_empty_shards.json'),
        JSON.stringify(['S002']),
      );
      const res = await main(['--workdir', wd]);
      assert.equal(res.status, 'ok');
    } finally {
      fs.rmSync(path.dirname(wd), { recursive: true, force: true });
    }
  });

  test('P0-2: backward compatible — no shard_index means no filename/coverage check', async () => {
    // Existing tests use a.jsonl without shard_index.json — must still work
    const wd = setupWorkdir();
    try {
      fs.writeFileSync(
        path.join(wd, '2_extract', 'r1-explicit', 'a.jsonl'),
        JSON.stringify({ id: 'R1-S001-0001', category: 'explicit', statement: 'x', source_file: 'srs.md', confidence: 'high', metadata: { shard_id: 'S001', chapter: '1', start_line: 1, end_line: 2 } }) + '\n',
      );
      const res = await main(['--workdir', wd]);
      assert.equal(res.status, 'ok');
    } finally {
      fs.rmSync(path.dirname(wd), { recursive: true, force: true });
    }
  });
});
