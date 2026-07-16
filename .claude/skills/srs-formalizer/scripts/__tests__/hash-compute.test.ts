import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { main } from '../commands/hash-compute.js';

test('hash-compute 返回文件 SHA-256', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hash-'));
  const f = path.join(tmp, 'a.txt');
  fs.writeFileSync(f, 'hello');
  const res = await main(['--file', f]);
  assert.equal(res.status, 'ok');
  const expected = createHash('sha256').update('hello').digest('hex');
  assert.equal((res.data as { hash: string }).hash, expected);
});

test('hash-compute --compare 匹配返回 ok', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hash-'));
  const f = path.join(tmp, 'a.txt');
  fs.writeFileSync(f, 'hello');
  const expected = createHash('sha256').update('hello').digest('hex');
  const res = await main(['--file', f, '--compare', expected]);
  assert.equal(res.status, 'ok');
  assert.equal((res.data as { match: boolean }).match, true);
});

test('hash-compute --compare 不匹配返回 error', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hash-'));
  const f = path.join(tmp, 'a.txt');
  fs.writeFileSync(f, 'hello');
  const res = await main(['--file', f, '--compare', 'deadbeef']);
  assert.equal(res.status, 'error');
  assert.equal((res.data as { match: boolean }).match, false);
});

test('hash-compute 缺少 --file 报错', async () => {
  const res = await main([]);
  assert.equal(res.status, 'error');
});
