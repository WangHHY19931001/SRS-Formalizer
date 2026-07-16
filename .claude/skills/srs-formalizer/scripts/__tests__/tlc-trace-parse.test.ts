import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { main } from '../commands/tlc-trace-parse.js';

const SAMPLE_TRACE = `@!@!@STARTMSG 2193:1 @!@!@
The behavior is blocked at state 1.
@!@!@ENDMSG 2193 @!@!@
@!@!@STARTMSG 2110:1 @!@!@
1: <Init line 5, col 3 to line 5, col 10 of module M>
/\\ x = 1
/\\ y = FALSE
@!@!@ENDMSG 2110 @!@!@
@!@!@STARTMSG 2110:2 @!@!@
2: <Next line 8, col 3 to line 8, col 20 of module M>
/\\ x = 2
/\\ y = TRUE
@!@!@ENDMSG 2110 @!@!@
`;

test('tlc-trace-parse 解析状态序列', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tlc-'));
  const f = path.join(tmp, 'trace.txt');
  fs.writeFileSync(f, SAMPLE_TRACE);
  const res = await main(['--trace', f]);
  assert.equal(res.status, 'ok');
  const data = res.data as { states: Array<{ index: number; action: string; variables: Record<string, string> }> };
  assert.equal(data.states.length, 2);
  assert.equal(data.states[0]!.index, 1);
  assert.equal(data.states[0]!.variables.x, '1');
  assert.equal(data.states[1]!.index, 2);
  assert.equal(data.states[1]!.variables.y, 'TRUE');
});

test('tlc-trace-parse 缺少 --trace 报错', async () => {
  const res = await main([]);
  assert.equal(res.status, 'error');
});

test('tlc-trace-parse 空文件返回空状态', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tlc-'));
  const f = path.join(tmp, 'empty.txt');
  fs.writeFileSync(f, '');
  const res = await main(['--trace', f]);
  assert.equal(res.status, 'ok');
  assert.equal((res.data as { states: unknown[] }).states.length, 0);
});
