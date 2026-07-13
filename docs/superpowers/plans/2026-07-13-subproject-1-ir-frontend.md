# IR Schema + Frontend 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 建立 SRS-IR 类型系统 + Frontend 四个 Pass（Parser, Sharder, Extractor, Builder），替代旧 S1-S3 流水线。

**架构：** 新增 `types/srs-ir.ts` 定义强类型 IR Schema。新增 `lib/frontend/` 子目录包含 parser, sharder, round-calculator, builder, nfr-keywords。重写 `commands/manifest.ts` 调用新模块。新建 `commands/build-ir.ts`。扩展 `commands/guided-extract.ts` 支持 R3-cross/R4-NFR/Arch-4 提取类型。

**技术栈：** TypeScript 5.5+ strict, Node.js ≥20 ESM, `node:test`, `npx tsx`

---

## 前置步骤：归档旧代码

### 任务 0：Zip 归档旧实现

**文件：**
- 归档：`commands/build-graph.ts`, `commands/export-cypher.ts`, `commands/generate-bdd.ts`, `commands/build-behavior-graph.ts`, `commands/build-tla-graph.ts`, `commands/build-lean-graph.ts`, `commands/build-system-architecture.ts`
- 归档：`lib/sharder.ts`, `lib/chapter-parser.ts`
- 归档：`__tests__/build-graph.test.ts`, `__tests__/export-cypher.test.ts`, `__tests__/generate-bdd.test.ts`, `__tests__/build-behavior-graph.test.ts`, `__tests__/build-tla-graph.test.ts`, `__tests__/build-lean-graph.test.ts`, `__tests__/build-system-architecture.test.ts`

- [ ] **步骤 1：创建归档目录并打包**

```bash
mkdir -p .worktrees/archive/srs-formalizer-v0.8.0/commands
mkdir -p .worktrees/archive/srs-formalizer-v0.8.0/lib
mkdir -p .worktrees/archive/srs-formalizer-v0.8.0/__tests__
```

- [ ] **步骤 2：移动旧命令文件到归档**

```bash
cd .claude/skills/srs-formalizer/scripts
for f in commands/build-graph.ts commands/export-cypher.ts commands/generate-bdd.ts \
         commands/build-behavior-graph.ts commands/build-tla-graph.ts \
         commands/build-lean-graph.ts commands/build-system-architecture.ts; do
  cp "$f" "../../../.worktrees/archive/srs-formalizer-v0.8.0/$f"
  rm "$f"
done
```

- [ ] **步骤 3：移动旧 lib 文件到归档**

```bash
for f in lib/sharder.ts lib/chapter-parser.ts; do
  cp "$f" "../../../.worktrees/archive/srs-formalizer-v0.8.0/$f"
  rm "$f"
done
```

- [ ] **步骤 4：移动旧测试文件到归档**

```bash
for f in __tests__/build-graph.test.ts __tests__/export-cypher.test.ts \
         __tests__/generate-bdd.test.ts __tests__/build-behavior-graph.test.ts \
         __tests__/build-tla-graph.test.ts __tests__/build-lean-graph.test.ts \
         __tests__/build-system-architecture.test.ts; do
  if [ -f "$f" ]; then
    cp "$f" "../../../.worktrees/archive/srs-formalizer-v0.8.0/$f"
    rm "$f"
  fi
done
```

- [ ] **步骤 5：创建 zip 归档**

```bash
cd ../../../
zip -r .worktrees/archive/srs-formalizer-v0.8.0.zip .worktrees/archive/srs-formalizer-v0.8.0/
rm -rf .worktrees/archive/srs-formalizer-v0.8.0/
```

- [ ] **步骤 6：从 index.ts 移除旧命令注册**

修改 `scripts/index.ts`，从 `COMMANDS` 对象中删除以下条目：

```
build-graph, export-cypher, generate-bdd,
build-behavior-graph, build-tla-graph, build-lean-graph,
build-system-architecture
```

同时从 `USAGE` 字符串中删除对应行。

- [ ] **步骤 7：验证 typecheck 仍通过（旧依赖移除后）**

```bash
cd .claude/skills/srs-formalizer/scripts
npx tsc --noEmit
```

预期：可能有错误，因为 `types/index.ts` 中 `ShardIndex`/`ShardEntry`/`GapEntry` 仍被 `manifest.ts` 引用。暂时忽略，后续任务会解决。

- [ ] **步骤 8：Commit**

```bash
git add -A
git commit -m "chore: archive deprecated pipeline commands and lib modules

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Phase 1: SRS-IR 类型系统

### 任务 1：定义 NFRCategory 和 NFRThreshold 类型

**文件：**
- 创建：`scripts/types/srs-ir.ts`

- [ ] **步骤 1：编写测试**

```typescript
// __tests__/srs-ir-types.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('NFRCategory', () => {
  it('accepts all six valid categories', () => {
    const valid: string[] = ['performance', 'security', 'availability',
      'compatibility', 'maintainability', 'compliance'];
    for (const v of valid) {
      assert.doesNotThrow(() => { const _: unknown = v; });
    }
  });
});

describe('NFRThreshold', () => {
  it('serializes and deserializes correctly', () => {
    const threshold = {
      metric: 'response_time', value: 200, unit: 'ms', operator: '<=' as const
    };
    const json = JSON.stringify(threshold);
    const parsed = JSON.parse(json);
    assert.strictEqual(parsed.metric, 'response_time');
    assert.strictEqual(parsed.value, 200);
    assert.strictEqual(parsed.unit, 'ms');
    assert.strictEqual(parsed.operator, '<=');
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

```bash
cd .claude/skills/srs-formalizer/scripts
npx tsx --test __tests__/srs-ir-types.test.ts
```

预期：FAIL — 找不到被测模块。

- [ ] **步骤 3：编写类型定义**

```typescript
// types/srs-ir.ts
export type NFRCategory =
  | 'performance'
  | 'security'
  | 'availability'
  | 'compatibility'
  | 'maintainability'
  | 'compliance';

export interface NFRThreshold {
  metric: string;
  value: number;
  unit: string;
  operator: '<' | '<=' | '>' | '>=' | '==';
}
```

- [ ] **步骤 4：运行测试验证通过**

```bash
npx tsx --test __tests__/srs-ir-types.test.ts
```

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add types/srs-ir.ts __tests__/srs-ir-types.test.ts
git commit -m "feat(ir): add NFRCategory and NFRThreshold types

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### 任务 2：定义 IRNode 和 IRNodeType

**文件：**
- 修改：`scripts/types/srs-ir.ts`
- 修改：`scripts/__tests__/srs-ir-types.test.ts`

- [ ] **步骤 1：编写测试**

```typescript
// 追加到 __tests__/srs-ir-types.test.ts
import type { IRNode, IRNodeType } from '../types/srs-ir.js';

describe('IRNode', () => {
  it('has required fields', () => {
    const node: IRNode = {
      id: 'shard-1-R1-USER-0001',
      type: 'requirement',
      module: '用户模块',
      labels: [':Requirement'],
      properties: { statement: '用户登录', category: 'explicit', confidence: 'high' },
      source: { filePath: '/tmp/srs.md', startLine: 10, endLine: 15, shardId: 'shard-1', chapter: '§2' },
    };
    assert.strictEqual(node.id, 'shard-1-R1-USER-0001');
    assert.strictEqual(node.type, 'requirement');
  });

  it('nfr node has nfrCategory in properties', () => {
    const node: IRNode = {
      id: 'shard-1-NFR-0001',
      type: 'nfr',
      module: '全局',
      labels: [':Requirement', ':NFRPerformance'],
      properties: {
        statement: '响应时间 ≤ 200ms',
        nfrCategory: 'performance',
        nfrThreshold: { metric: 'response_time', value: 200, unit: 'ms', operator: '<=' },
      },
      source: { filePath: '/tmp/srs.md', startLine: 50, endLine: 52, shardId: 'shard-1', chapter: '§3' },
    };
    assert.strictEqual(node.properties.nfrCategory, 'performance');
    assert.strictEqual(node.properties.nfrThreshold?.value, 200);
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

```bash
npx tsx --test __tests__/srs-ir-types.test.ts
```

预期：FAIL — IRNode 类型未定义。

- [ ] **步骤 3：扩展类型定义**

```typescript
// 追加到 types/srs-ir.ts
export type IRNodeType =
  | 'requirement'
  | 'nfr'
  | 'architecture'
  | 'bdd_scenario'
  | 'tla_action'
  | 'tla_invariant'
  | 'lean_theorem'
  | 'lean_lemma';

export interface IRProperties {
  statement?: string;
  category?: 'explicit' | 'implicit' | 'relational';
  confidence?: 'high' | 'medium' | 'low';
  nfrCategory?: NFRCategory;
  nfrThreshold?: NFRThreshold;
  archType?: 'Module' | 'Actor' | 'Constraint' | 'Component' | 'Interface';
}

export interface IRSource {
  filePath: string;
  startLine: number;
  endLine: number;
  shardId: string;
  chapter: string;
}

export interface IRAnalysis {
  structure?: {
    orphan: boolean;
    islandId?: string;
    crossFileIsland: boolean;
  };
  semantic?: {
    duplicatePair?: string;
    conflictPair?: string;
    sameAspectCluster?: string;
  };
}

export interface IRNode {
  id: string;
  type: IRNodeType;
  module: string;
  labels: string[];
  properties: IRProperties;
  source: IRSource;
  analysis?: IRAnalysis;
}
```

- [ ] **步骤 4：运行测试验证通过**

```bash
npx tsx --test __tests__/srs-ir-types.test.ts
```

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add types/srs-ir.ts __tests__/srs-ir-types.test.ts
git commit -m "feat(ir): add IRNode, IRNodeType, IRProperties, IRSource types

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### 任务 3：定义 IREdge 和 IREdgeType

**文件：**
- 修改：`scripts/types/srs-ir.ts`
- 修改：`scripts/__tests__/srs-ir-types.test.ts`

- [ ] **步骤 1：编写测试**

```typescript
// 追加到 __tests__/srs-ir-types.test.ts
import type { IREdge, IREdgeType } from '../types/srs-ir.js';

describe('IREdge', () => {
  it('depends_on edge', () => {
    const edge: IREdge = {
      id: 'shard-1-dep-001',
      source: 'shard-1-R1-USER-0001',
      target: 'shard-1-R1-AUTH-0002',
      type: 'depends_on',
      properties: { confidence: 0.9 },
    };
    assert.strictEqual(edge.type, 'depends_on');
  });

  it('nfr_impacts edge', () => {
    const edge: IREdge = {
      id: 'nfr-edge-001',
      source: 'shard-1-NFR-0001',
      target: 'shard-1-R1-USER-0001',
      type: 'nfr_impacts',
      properties: { reasoning: '性能约束影响登录流程' },
    };
    assert.strictEqual(edge.type, 'nfr_impacts');
  });

  it('cross_file_depends edge has crossFileWeight', () => {
    const edge: IREdge = {
      id: 'cross-001',
      source: 'shard-1-R1-0001',
      target: 'shard-2-R1-0002',
      type: 'cross_file_depends',
      properties: { crossFileWeight: 0.7 },
    };
    assert.strictEqual(edge.properties.crossFileWeight, 0.7);
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

```bash
npx tsx --test __tests__/srs-ir-types.test.ts
```

预期：FAIL — IREdge 未定义。

- [ ] **步骤 3：追加类型**

```typescript
// 追加到 types/srs-ir.ts
export type IREdgeType =
  | 'depends_on'
  | 'refines'
  | 'conflicts_with'
  | 'derived_from'
  | 'same_aspect'
  | 'contains'
  | 'nfr_impacts'
  | 'nfr_constrains'
  | 'cross_file_depends'
  | 'verifies'
  | 'implements'
  | 'proves'
  | 'traces_to';

export interface IREdgeProperties {
  crossFileWeight?: number;
  confidence?: number;
  reasoning?: string;
  proposed?: boolean;
}

export interface IREdge {
  id: string;
  source: string;
  target: string;
  type: IREdgeType;
  properties: IREdgeProperties;
}
```

- [ ] **步骤 4：运行测试验证通过**

```bash
npx tsx --test __tests__/srs-ir-types.test.ts
```

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add types/srs-ir.ts __tests__/srs-ir-types.test.ts
git commit -m "feat(ir): add IREdge, IREdgeType, IREdgeProperties types

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### 任务 4：定义 SRSIR 顶层 + 辅助类型

**文件：**
- 修改：`scripts/types/srs-ir.ts`
- 修改：`scripts/__tests__/srs-ir-types.test.ts`

- [ ] **步骤 1：编写测试**

```typescript
// 追加到 __tests__/srs-ir-types.test.ts
import type { SRSIR, IRMeta, CrossRef, NFRProfile, IRGap, IRGlossaryEntry } from '../types/srs-ir.js';

describe('SRSIR', () => {
  it('top-level structure has all required fields', () => {
    const ir: SRSIR = {
      version: '2.0.0',
      meta: {
        sourcePath: '/tmp/srs.md',
        sourceHash: 'abc123',
        language: 'zh',
        totalChars: 1000,
        totalShards: 3,
        totalNodes: 5,
        totalEdges: 2,
        buildTimestamp: new Date().toISOString(),
      },
      nodes: [],
      edges: [],
      crossRefs: [],
      nfrProfile: { detectedCategories: [], weightedShards: [], overallCoverage: 0, blindSpots: [] },
      gaps: [],
      glossary: [],
    };
    assert.strictEqual(ir.version, '2.0.0');
    assert.strictEqual(ir.meta.language, 'zh');
  });

  it('IRMeta.riskScore is optional', () => {
    const meta: IRMeta = {
      sourcePath: '/tmp/srs.md', sourceHash: 'abc', language: 'zh',
      totalChars: 0, totalShards: 0, totalNodes: 0, totalEdges: 0,
      buildTimestamp: new Date().toISOString(),
    };
    assert.strictEqual(meta.riskScore, undefined);
  });

  it('CrossRef has four refTypes', () => {
    const ref: CrossRef = {
      sourceShard: 'shard-1', targetShard: 'shard-2',
      refType: 'explicit_see', anchorText: '参见§3', confidence: 0.9,
    };
    assert.strictEqual(ref.refType, 'explicit_see');
  });

  it('NFRProfile detects blindSpots', () => {
    const profile: NFRProfile = {
      detectedCategories: [{ category: 'performance', keywordHits: 3, shardIds: ['shard-1'], nodeIds: [] }],
      weightedShards: [{ shardId: 'shard-1', nfrWeight: 0.8 }],
      overallCoverage: 0.17,
      blindSpots: ['security', 'availability', 'compatibility', 'maintainability', 'compliance'],
    };
    assert.strictEqual(profile.blindSpots.length, 5);
  });

  it('IRGap has cross_chapter_gap type', () => {
    const gap: IRGap = {
      priority: 'P1', type: 'cross_chapter_gap',
      description: '§2 引用了 §5 但 §5 不存在', sourceChapter: '§2',
    };
    assert.strictEqual(gap.type, 'cross_chapter_gap');
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

```bash
npx tsx --test __tests__/srs-ir-types.test.ts
```

预期：FAIL — 顶层类型未定义。

- [ ] **步骤 3：追加顶层类型**

```typescript
// 追加到 types/srs-ir.ts
export interface IRMeta {
  sourcePath: string;
  sourceHash: string;
  language: 'zh' | 'en';
  totalChars: number;
  totalShards: number;
  totalNodes: number;
  totalEdges: number;
  buildTimestamp: string;
  riskScore?: number;
  highRiskShards?: string[];
}

export interface CrossRef {
  sourceShard: string;
  targetShard: string;
  refType: 'heading_ref' | 'term_ref' | 'explicit_see' | 'implicit_dep';
  anchorText: string;
  confidence: number;
}

export interface NFRProfile {
  detectedCategories: NFREntry[];
  weightedShards: NFRWeightedShard[];
  overallCoverage: number;
  blindSpots: NFRCategory[];
}

export interface NFREntry {
  category: NFRCategory;
  keywordHits: number;
  shardIds: string[];
  nodeIds: string[];
}

export interface NFRWeightedShard {
  shardId: string;
  nfrWeight: number;
  primaryCategory?: NFRCategory;
}

export interface IRGap {
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  type: 'unsolved_issue' | 'undefined_term' | 'missing_reference'
      | 'incomplete_section' | 'cross_chapter_gap';
  description: string;
  sourceChapter: string;
}

export interface IRGlossaryEntry {
  term: string;
  acronym?: string;
  definition: string;
  sourceShard: string;
  confidence: 'high' | 'medium' | 'low';
  category: 'domain_concept' | 'acronym' | 'technical_entity'
          | 'business_entity' | 'defined_term';
}

export interface SRSIR {
  version: '2.0.0';
  meta: IRMeta;
  nodes: IRNode[];
  edges: IREdge[];
  crossRefs: CrossRef[];
  nfrProfile: NFRProfile;
  gaps: IRGap[];
  glossary: IRGlossaryEntry[];
}
```

- [ ] **步骤 4：运行测试验证通过**

```bash
npx tsx --test __tests__/srs-ir-types.test.ts
```

预期：PASS。

- [ ] **步骤 5：运行 typecheck**

```bash
npx tsc --noEmit
```

预期：0 errors（仅新增类型文件，未被其他模块 import 故不影响）。

- [ ] **步骤 6：Commit**

```bash
git add types/srs-ir.ts __tests__/srs-ir-types.test.ts
git commit -m "feat(ir): add SRSIR top-level and auxiliary types

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Phase 2: NFR 关键词字典

### 任务 5：NFR 关键词字典

**文件：**
- 创建：`scripts/lib/frontend/nfr-keywords.ts`
- 创建：`scripts/__tests__/frontend-nfr-keywords.test.ts`

- [ ] **步骤 1：编写测试**

```typescript
// __tests__/frontend-nfr-keywords.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { NFR_KEYWORDS, detectNFRCategories, computeNFRWeight } from '../lib/frontend/nfr-keywords.js';

describe('NFR_KEYWORDS', () => {
  it('has all six categories', () => {
    const categories = Object.keys(NFR_KEYWORDS);
    assert.strictEqual(categories.length, 6);
    assert.ok(categories.includes('performance'));
    assert.ok(categories.includes('security'));
    assert.ok(categories.includes('availability'));
    assert.ok(categories.includes('compatibility'));
    assert.ok(categories.includes('maintainability'));
    assert.ok(categories.includes('compliance'));
  });

  it('each category has zh and en arrays', () => {
    for (const [cat, kw] of Object.entries(NFR_KEYWORDS)) {
      assert.ok(Array.isArray(kw.zh), `${cat} missing zh keywords`);
      assert.ok(Array.isArray(kw.en), `${cat} missing en keywords`);
      assert.ok(kw.zh.length > 0, `${cat} zh keywords empty`);
      assert.ok(kw.en.length > 0, `${cat} en keywords empty`);
    }
  });
});

describe('detectNFRCategories', () => {
  it('detects performance from Chinese text', () => {
    const result = detectNFRCategories('系统响应时间不得超过 200ms，并发用户数需支持 10000', 'zh');
    assert.ok(result.includes('performance'));
  });

  it('detects security from English text', () => {
    const result = detectNFRCategories('The system must encrypt all user data with AES-256', 'en');
    assert.ok(result.includes('security'));
  });

  it('returns empty array for no NFR match', () => {
    const result = detectNFRCategories('用户点击按钮后跳转到首页', 'zh');
    assert.strictEqual(result.length, 0);
  });

  it('detects multiple categories', () => {
    const result = detectNFRCategories('响应时间 ≤ 100ms 且需要加密传输', 'zh');
    assert.ok(result.includes('performance'));
    assert.ok(result.includes('security'));
  });

  it('handles empty string', () => {
    const result = detectNFRCategories('', 'zh');
    assert.strictEqual(result.length, 0);
  });
});

describe('computeNFRWeight', () => {
  it('returns 0 for no NFR keywords', () => {
    assert.strictEqual(computeNFRWeight('普通业务逻辑描述', 'zh'), 0);
  });

  it('returns > 0 for NFR text', () => {
    const weight = computeNFRWeight('响应时间不超过 200ms 且需要高可用 99.99%', 'zh');
    assert.ok(weight > 0);
  });

  it('returns higher weight for more NFR keywords', () => {
    const low = computeNFRWeight('响应时间不超过 200ms', 'zh');
    const high = computeNFRWeight('响应时间不超过 200ms 且需要高可用 99.99% 且加密传输', 'zh');
    assert.ok(high > low);
  });

  it('weight capped at 1.0', () => {
    const weight = computeNFRWeight('性能 安全 可用性 兼容性 可维护 合规'.repeat(10), 'zh');
    assert.ok(weight <= 1.0);
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

```bash
npx tsx --test __tests__/frontend-nfr-keywords.test.ts
```

预期：FAIL — 模块不存在。

- [ ] **步骤 3：实现 NFR 关键词字典**

```typescript
// lib/frontend/nfr-keywords.ts
import type { NFRCategory } from '../../types/srs-ir.js';

export const NFR_KEYWORDS: Record<NFRCategory, { zh: string[]; en: string[] }> = {
  performance: {
    zh: ['响应时间', '延迟', '吞吐', '并发', '性能', 'QPS', 'TPS', '耗时', '加载'],
    en: ['latency', 'throughput', 'response time', 'concurrent', 'performance', 'qps', 'tps'],
  },
  security: {
    zh: ['安全', '加密', '认证', '授权', '防攻击', '审计', '脱敏', '权限', '鉴权'],
    en: ['encrypt', 'authentication', 'authorize', 'prevent', 'audit', 'security', 'permission', 'auth'],
  },
  availability: {
    zh: ['可用性', '容错', '冗余', '恢复', '高可用', '故障', '宕机', '灾备', 'SLA'],
    en: ['uptime', 'availability', 'fault', 'recovery', 'redundant', 'failover', 'SLA', 'disaster'],
  },
  compatibility: {
    zh: ['兼容', '适配', '浏览器', '操作系统', '平台', '跨平台', '版本'],
    en: ['compatible', 'browser', 'platform', 'cross-platform', 'version', 'OS'],
  },
  maintainability: {
    zh: ['可维护', '扩展', '模块化', '可配置', '热更新', '热部署', '灰度', '可观测'],
    en: ['maintainable', 'extensible', 'modular', 'configurable', 'observability', 'logging', 'monitoring'],
  },
  compliance: {
    zh: ['合规', 'GDPR', '审计', '监管', '等级保护', '等保', 'PCI', '数据安全法'],
    en: ['compliance', 'GDPR', 'PCI', 'audit', 'regulatory', 'data protection'],
  },
};

export function detectNFRCategories(text: string, lang: 'zh' | 'en'): NFRCategory[] {
  if (!text || text.trim().length === 0) return [];
  const lower = text.toLowerCase();
  const results: NFRCategory[] = [];
  for (const [category, keywords] of Object.entries(NFR_KEYWORDS)) {
    const kw = keywords[lang] ?? [];
    for (const k of kw) {
      if (lower.includes(k.toLowerCase())) {
        results.push(category as NFRCategory);
        break;
      }
    }
  }
  return results;
}

export function computeNFRWeight(text: string, lang: 'zh' | 'en'): number {
  if (!text || text.trim().length === 0) return 0;
  const lower = text.toLowerCase();
  let totalHits = 0;
  const maxHits = 30;
  for (const [, keywords] of Object.entries(NFR_KEYWORDS)) {
    const kw = keywords[lang] ?? [];
    for (const k of kw) {
      let idx = lower.indexOf(k.toLowerCase());
      while (idx !== -1) {
        totalHits++;
        idx = lower.indexOf(k.toLowerCase(), idx + 1);
      }
    }
  }
  return Math.min(totalHits / maxHits, 1.0);
}
```

- [ ] **步骤 4：运行测试验证通过**

```bash
npx tsx --test __tests__/frontend-nfr-keywords.test.ts
```

预期：全部 PASS。

- [ ] **步骤 5：Commit**

```bash
git add lib/frontend/nfr-keywords.ts __tests__/frontend-nfr-keywords.test.ts
git commit -m "feat(frontend): add NFR keyword dictionary and detection functions

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Phase 3: Frontend Parser (Pass 1)

### 任务 6：Chapter Parser（章节解析器）

**文件：**
- 创建：`scripts/lib/frontend/parser.ts`
- 修改：`scripts/__tests__/frontend-parser.test.ts`

- [ ] **步骤 1：编写测试**

```typescript
// __tests__/frontend-parser.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { identifyChapters } from '../lib/frontend/parser.js';

describe('identifyChapters', () => {
  const mdContent = `# §1 概述
这是概述内容。
## §1.1 背景
背景说明。
### 术语表
术语定义。
## §2 功能需求
功能描述。
#### 尚未解决问题
已知问题列表。`;

  it('detects Markdown headings', () => {
    const chapters = identifyChapters(mdContent, '/tmp/srs.md');
    assert.ok(chapters.length >= 4);
  });

  it('identifies 术语表 as chapter', () => {
    const chapters = identifyChapters(mdContent, '/tmp/srs.md');
    const glossaryCh = chapters.find(c => c.title === '术语表');
    assert.ok(glossaryCh);
    assert.strictEqual(glossaryCh.level, 3);
  });

  it('identifies 尚未解决问题 as chapter', () => {
    const chapters = identifyChapters(mdContent, '/tmp/srs.md');
    const openIssues = chapters.find(c => c.title === '尚未解决问题');
    assert.ok(openIssues);
  });

  it('handles empty content', () => {
    const chapters = identifyChapters('', '/tmp/empty.md');
    assert.strictEqual(chapters.length, 0);
  });

  it('captures line numbers', () => {
    const chapters = identifyChapters(mdContent, '/tmp/srs.md');
    for (const ch of chapters) {
      assert.ok(ch.line >= 0);
      assert.strictEqual(typeof ch.raw, 'string');
    }
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

```bash
npx tsx --test __tests__/frontend-parser.test.ts
```

预期：FAIL — 模块不存在。

- [ ] **步骤 3：实现 identifyChapters**

```typescript
// lib/frontend/parser.ts
export interface ChapterInfo {
  title: string;
  level: number;
  line: number;
  raw: string;
}

const KEYWORD_PATTERNS: { pattern: RegExp; name: string }[] = [
  { pattern: /术语[表定]|Glossary|Terms/i, name: '术语表' },
  { pattern: /模块能力[矩阵]|Capability Matrix/i, name: '模块能力矩阵' },
  { pattern: /功能[需求规格]|Functional Requirements/i, name: '功能需求' },
  { pattern: /尚未[解决决].*问题|Open Issues|Unresolved/i, name: '尚未解决问题' },
  { pattern: /技术[选型方案]|Technology Stack|Architecture/i, name: '技术选型' },
  { pattern: /性能.*(?:需求|指标|要求)|Performance/i, name: '性能需求' },
  { pattern: /安全.*(?:需求|指标|要求)|Security/i, name: '安全需求' },
  { pattern: /可用性.*(?:需求|指标|要求)|Availability/i, name: '可用性需求' },
  { pattern: /兼容性.*(?:需求|指标|要求)|Compatibility/i, name: '兼容性需求' },
  { pattern: /可维护.*(?:需求|指标|要求)|Maintainability/i, name: '可维护性需求' },
  { pattern: /合规.*(?:需求|指标|要求)|Compliance/i, name: '合规需求' },
  { pattern: /非功能[性]?需求|Non.?Functional/i, name: '非功能需求' },
];

export function identifyChapters(content: string, sourcePath: string): ChapterInfo[] {
  const chapters: ChapterInfo[] = [];
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const sectionMatch = line.match(/^#{1,6}\s*(?:§(\d+(?:\.\d+)*))?\s*(.+)$/);
    if (sectionMatch) {
      let title = (sectionMatch[2] || '').trim();
      for (const kw of KEYWORD_PATTERNS) {
        if (kw.pattern.test(line)) { title = kw.name; break; }
      }
      chapters.push({
        title,
        level: (line.match(/^#+/)!)[0]!.length,
        line: i,
        raw: line.trim(),
      });
      continue;
    }
    for (const kw of KEYWORD_PATTERNS) {
      if (kw.pattern.test(line) && line.startsWith('#')) {
        chapters.push({
          title: kw.name,
          level: (line.match(/^#+/)!)[0]!.length,
          line: i,
          raw: line.trim(),
        });
        break;
      }
    }
  }
  return chapters;
}
```

- [ ] **步骤 4：运行测试验证通过**

```bash
npx tsx --test __tests__/frontend-parser.test.ts
```

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add lib/frontend/parser.ts __tests__/frontend-parser.test.ts
git commit -m "feat(frontend): add chapter parser with NFR keyword patterns

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### 任务 7：CrossRef Detector（跨章引用检测）

**文件：**
- 修改：`scripts/lib/frontend/parser.ts`
- 修改：`scripts/__tests__/frontend-parser.test.ts`

- [ ] **步骤 1：编写测试**

```typescript
// 追加到 __tests__/frontend-parser.test.ts
import { detectCrossRefs } from '../lib/frontend/parser.js';
import type { CrossRef } from '../types/srs-ir.js';

describe('detectCrossRefs', () => {
  const content = `# §1 概述
用户管理系统。
## §2 功能需求
参见 §3 性能需求 中的定义。
| 术语 | 定义 |
|------|------|
| JWT | JSON Web Token |
## §3 性能需求
系统响应 TPS 需满足 §2 中定义的要求。`;

  it('detects explicit_see references', () => {
    const chapters = identifyChapters(content, '/tmp/srs.md');
    const refs = detectCrossRefs(content, chapters);
    const explicit = refs.filter(r => r.refType === 'explicit_see');
    assert.ok(explicit.length >= 1, 'should detect 参见 §3');
    const seeRef = explicit.find(r => r.anchorText.includes('§3'));
    assert.ok(seeRef);
  });

  it('detects term_ref from tables', () => {
    const chapters = identifyChapters(content, '/tmp/srs.md');
    const refs = detectCrossRefs(content, chapters);
    const terms = refs.filter(r => r.refType === 'term_ref');
    assert.ok(terms.some(r => r.anchorText.includes('JWT')));
  });

  it('returns empty for no references', () => {
    const chapters = identifyChapters('普通的文本没有引用', '/tmp/no-ref.md');
    const refs = detectCrossRefs('普通的文本没有引用', chapters);
    assert.strictEqual(refs.length, 0);
  });

  it('each ref has sourceShard and targetShard', () => {
    const chapters = identifyChapters(content, '/tmp/srs.md');
    const refs = detectCrossRefs(content, chapters);
    for (const ref of refs) {
      assert.ok(ref.sourceShard.length > 0);
      assert.ok(ref.targetShard.length > 0);
      assert.ok(ref.confidence >= 0 && ref.confidence <= 1);
    }
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

```bash
npx tsx --test __tests__/frontend-parser.test.ts
```

预期：部分 FAIL — detectCrossRefs 未实现。

- [ ] **步骤 3：实现 detectCrossRefs**

```typescript
// 追加到 lib/frontend/parser.ts
import type { CrossRef } from '../../types/srs-ir.js';

export function detectCrossRefs(content: string, chapters: ChapterInfo[]): CrossRef[] {
  const refs: CrossRef[] = [];
  const lines = content.split('\n');

  const chapterTitles = chapters.map(c => c.title);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    const seeMatch = line.match(/(?:参见|引用|见)\s*(§[\d.]+|第[一二三四五六七八九十\d]+[章节])/);
    if (seeMatch) {
      const anchorText = seeMatch[1]!;
      const sourceChapter = chapters.filter(c => c.line <= i).pop();
      const targetChapter = chapters.find(c => c.raw.includes(anchorText));
      if (sourceChapter && targetChapter && sourceChapter.title !== targetChapter.title) {
        refs.push({
          sourceShard: sourceChapter.title,
          targetShard: targetChapter.title,
          refType: 'explicit_see',
          anchorText,
          confidence: 0.9,
        });
      }
    }

    const headingRefMatch = line.match(/(?:§[\d.]+)/g);
    if (headingRefMatch && !line.startsWith('#') && !seeMatch) {
      for (const ref of headingRefMatch) {
        const sourceChapter = chapters.filter(c => c.line <= i).pop();
        const targetChapter = chapters.find(c => c.raw.includes(ref));
        if (sourceChapter && targetChapter && sourceChapter.title !== targetChapter.title) {
          refs.push({
            sourceShard: sourceChapter.title,
            targetShard: targetChapter.title,
            refType: 'heading_ref',
            anchorText: ref,
            confidence: 0.7,
          });
        }
      }
    }
  }

  let inTable = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.includes('| 术语 |') || line.includes('| Term |')) { inTable = true; continue; }
    if (inTable && line.startsWith('|') && !line.includes('---')) {
      const parts = line.split('|').map(s => s.trim()).filter(Boolean);
      if (parts.length >= 2 && parts[0]) {
        const sourceChapter = chapters.filter(c => c.line <= i).pop();
        for (const ch of chapters) {
          if (sourceChapter && ch.title !== sourceChapter.title) {
            refs.push({
              sourceShard: sourceChapter.title,
              targetShard: ch.title,
              refType: 'term_ref',
              anchorText: parts[0]!,
              confidence: 0.5,
            });
          }
        }
      }
    }
    if (inTable && !line.startsWith('|')) inTable = false;
  }

  return refs;
}
```

- [ ] **步骤 4：运行测试验证通过**

```bash
npx tsx --test __tests__/frontend-parser.test.ts
```

预期：全部 PASS。

- [ ] **步骤 5：Commit**

```bash
git add lib/frontend/parser.ts __tests__/frontend-parser.test.ts
git commit -m "feat(frontend): add cross-reference detector (CrossRefDetector)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### 任务 8：NFR Scanner（NFR 扫描器）

**文件：**
- 修改：`scripts/lib/frontend/parser.ts`
- 修改：`scripts/__tests__/frontend-parser.test.ts`

- [ ] **步骤 1：编写测试**

```typescript
// 追加到 __tests__/frontend-parser.test.ts
import { scanNFR } from '../lib/frontend/parser.js';

describe('scanNFR', () => {
  const nfrContent = `# §1 概述
系统需支持高并发场景。
## §2 性能需求
响应时间不超过 200ms，吞吐量需达 10000 TPS。
## §3 安全需求
所有数据传输需加密，用户需通过认证后访问系统。`;

  it('detects performance category', () => {
    const profile = scanNFR(nfrContent, 'zh');
    assert.ok(profile.detectedCategories.some(c => c.category === 'performance'));
    assert.ok(profile.overallCoverage > 0);
  });

  it('detects multiple categories', () => {
    const profile = scanNFR(nfrContent, 'zh');
    const cats = profile.detectedCategories.map(c => c.category);
    assert.ok(cats.includes('performance'));
    assert.ok(cats.includes('security'));
  });

  it('reports blindSpots for undetected categories', () => {
    const shortContent = '响应时间不超过 200ms。';
    const profile = scanNFR(shortContent, 'zh');
    assert.ok(profile.blindSpots.length > 0);
  });

  it('overallCoverage between 0 and 1', () => {
    const profile = scanNFR(nfrContent, 'zh');
    assert.ok(profile.overallCoverage >= 0);
    assert.ok(profile.overallCoverage <= 1);
  });

  it('handles empty content', () => {
    const profile = scanNFR('', 'zh');
    assert.strictEqual(profile.detectedCategories.length, 0);
    assert.strictEqual(profile.overallCoverage, 0);
    assert.strictEqual(profile.blindSpots.length, 6);
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

```bash
npx tsx --test __tests__/frontend-parser.test.ts
```

预期：部分 FAIL — scanNFR 未实现。

- [ ] **步骤 3：实现 scanNFR**

```typescript
// 追加到 lib/frontend/parser.ts
import { detectNFRCategories } from './nfr-keywords.js';
import type { NFRCategory, NFRProfile } from '../../types/srs-ir.js';

export function scanNFR(content: string, lang: 'zh' | 'en'): NFRProfile {
  const allCategories: NFRCategory[] = [
    'performance', 'security', 'availability',
    'compatibility', 'maintainability', 'compliance',
  ];

  const lines = content.split('\n');
  const categoryHits = new Map<NFRCategory, number>();
  for (const line of lines) {
    const cats = detectNFRCategories(line, lang);
    for (const c of cats) {
      categoryHits.set(c, (categoryHits.get(c) ?? 0) + 1);
    }
  }

  const detectedCategories = [];
  for (const [category, keywordHits] of categoryHits) {
    detectedCategories.push({ category, keywordHits, shardIds: [], nodeIds: [] });
  }

  const detectedCount = detectedCategories.length;
  const overallCoverage = detectedCount / allCategories.length;
  const blindSpots = allCategories.filter(c => !categoryHits.has(c));

  return {
    detectedCategories,
    weightedShards: [],
    overallCoverage,
    blindSpots,
  };
}
```

- [ ] **步骤 4：运行测试验证通过**

```bash
npx tsx --test __tests__/frontend-parser.test.ts
```

预期：全部 PASS。

- [ ] **步骤 5：Commit**

```bash
git add lib/frontend/parser.ts __tests__/frontend-parser.test.ts
git commit -m "feat(frontend): add NFR scanner to parser

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Phase 4: Sharder + Round Calculator (Pass 2)

### 任务 9：Sharder（分片器）

**文件：**
- 创建：`scripts/lib/frontend/sharder.ts`
- 创建：`scripts/__tests__/frontend-sharder.test.ts`

- [ ] **步骤 1：编写测试**

```typescript
// __tests__/frontend-sharder.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { buildShardIndex, MAX_SHARD_LINES } from '../lib/frontend/sharder.js';
import { identifyChapters, scanNFR } from '../lib/frontend/parser.js';

describe('buildShardIndex', () => {
  const shortContent = '# §1 标题\n这是内容。\n## §2 子标题\n更多内容。';

  it('creates shards from content', () => {
    const chapters = identifyChapters(shortContent, '/tmp/srs.md');
    const nfrProfile = scanNFR(shortContent, 'zh');
    const index = buildShardIndex('/tmp/srs.md', shortContent, chapters, 'zh', nfrProfile);
    assert.ok(index.shards.length > 0);
    assert.strictEqual(index.version, '1.1');
    assert.strictEqual(index.nfr_profile.overallCoverage, nfrProfile.overallCoverage);
  });

  it('each shard has locator and line range', () => {
    const chapters = identifyChapters(shortContent, '/tmp/srs.md');
    const nfrProfile = scanNFR(shortContent, 'zh');
    const index = buildShardIndex('/tmp/srs.md', shortContent, chapters, 'zh', nfrProfile);
    for (const shard of index.shards) {
      assert.ok(shard.locator.length > 0);
      assert.ok(shard.source_start_line <= shard.source_end_line);
      assert.ok(shard.estimated_tokens > 0);
    }
  });

  it('shard has nfr_weight when NFR keywords present', () => {
    const nfrContent = '# §1\n响应时间不超过 200ms。并发 10000。\n'.repeat(10);
    const chapters = identifyChapters(nfrContent, '/tmp/srs.md');
    const nfrProfile = scanNFR(nfrContent, 'zh');
    const index = buildShardIndex('/tmp/srs.md', nfrContent, chapters, 'zh', nfrProfile);
    for (const shard of index.shards) {
      assert.ok(typeof shard.nfr_weight === 'number');
      assert.ok(shard.nfr_weight >= 0 && shard.nfr_weight <= 1);
    }
  });

  it('handles empty content', () => {
    const chapters = identifyChapters('', '/tmp/empty.md');
    const nfrProfile = scanNFR('', 'zh');
    const index = buildShardIndex('/tmp/empty.md', '', chapters, 'zh', nfrProfile);
    assert.strictEqual(index.shards.length, 0);
  });

  it('cross_references from nfrProfile', () => {
    const chapters = identifyChapters(shortContent, '/tmp/srs.md');
    const nfrProfile = scanNFR(shortContent, 'zh');
    const index = buildShardIndex('/tmp/srs.md', shortContent, chapters, 'zh', nfrProfile);
    assert.ok(Array.isArray(index.cross_references));
    assert.ok(typeof index.nfr_profile === 'object');
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

```bash
npx tsx --test __tests__/frontend-sharder.test.ts
```

预期：FAIL — 模块不存在。

- [ ] **步骤 3：实现 sharder**

```typescript
// lib/frontend/sharder.ts
import type { ChapterInfo } from './parser.js';
import { computeNFRWeight } from './nfr-keywords.js';
import type { NFRProfile, CrossRef } from '../../types/srs-ir.js';
import { createHash } from 'node:crypto';
import * as path from 'node:path';

export const MAX_SHARD_LINES = 200;

interface ShardDraft {
  locator: string; module: string; chapter_ref: string;
  source_path: string; source_start_line: number; source_end_line: number;
  char_count: number; estimated_tokens: number; nfr_weight: number;
}

export interface ShardEntry {
  id: string; file: string; locator: string;
  source_path: string; source_start_line: number; source_end_line: number;
  module: string; chapter_ref: string;
  char_count: number; estimated_tokens: number;
  nfr_weight?: number;
}

export interface ShardIndex {
  version: '1.1';
  source_path: string; source_hash: string;
  language: 'zh' | 'en'; total_chars: number; total_shards: number;
  shards: ShardEntry[];
  gaps: GapEntry[];
  warnings: string[];
  cross_references: CrossRef[];
  nfr_profile: NFRProfile;
}

interface GapEntry {
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  type: string; description: string; source_chapter: string;
}

function estimateTokens(text: string, lang: 'zh' | 'en'): number {
  if (lang === 'zh') return Math.ceil(text.replace(/\s/g, '').length / 1.5);
  return Math.ceil(text.length / 4);
}

function createShardEntry(
  absPath: string, startLine: number, endLine: number, module: string,
  chapterRef: string, lines: string[], lang: 'zh' | 'en', chunkId: string,
): ShardDraft {
  const shardLines = lines.slice(startLine - 1, endLine);
  const shardText = shardLines.join('\n');
  return {
    locator: `${absPath}-${startLine}-${endLine}-${chunkId}`,
    module, chapter_ref: chapterRef,
    source_path: absPath, source_start_line: startLine, source_end_line: endLine,
    char_count: shardText.length, estimated_tokens: estimateTokens(shardText, lang),
    nfr_weight: computeNFRWeight(shardText, lang),
  };
}

function subdivideShard(
  lines: string[], startLine: number, endLine: number, absPath: string,
  allChapters: ChapterInfo[], minLevel: number, lang: 'zh' | 'en',
): ShardDraft[] {
  const lineCount = endLine - startLine + 1;
  if (lineCount <= MAX_SHARD_LINES) {
    return [createShardEntry(absPath, startLine, endLine, 'root', 'root', lines, lang, `${startLine}`)];
  }
  const subChapters = allChapters.filter(c => c.line >= startLine && c.line <= endLine && c.level > minLevel);
  if (subChapters.length === 0) {
    return forceSplitByParagraphs(lines, startLine, endLine, absPath, lang);
  }
  const shards: ShardDraft[] = [];
  let prevEnd = startLine;
  for (const ch of subChapters) {
    if (ch.line > prevEnd) {
      shards.push(...subdivideShard(lines, prevEnd, ch.line - 1, absPath, allChapters, minLevel + 1, lang));
    }
    shards.push(createShardEntry(absPath, ch.line, Math.min(ch.line + MAX_SHARD_LINES, endLine), 'chapter', ch.title, lines, lang, `${ch.line}`));
    prevEnd = Math.min(ch.line + MAX_SHARD_LINES, endLine) + 1;
  }
  if (prevEnd <= endLine) {
    shards.push(...subdivideShard(lines, prevEnd, endLine, absPath, allChapters, minLevel + 1, lang));
  }
  return shards;
}

function forceSplitByParagraphs(lines: string[], startLine: number, endLine: number, absPath: string, lang: 'zh' | 'en'): ShardDraft[] {
  const shards: ShardDraft[] = [];
  let segStart = startLine;
  for (let i = startLine; i <= endLine; i++) {
    if ((i - segStart + 1) >= MAX_SHARD_LINES && (lines[i - 1]?.trim() === '' || i === endLine)) {
      shards.push(createShardEntry(absPath, segStart, i, 'paragraph', `L${segStart}-${i}`, lines, lang, `${segStart}`));
      segStart = i + 1;
    }
  }
  if (segStart <= endLine) {
    shards.push(createShardEntry(absPath, segStart, endLine, 'paragraph', `L${segStart}-${endLine}`, lines, lang, `${segStart}`));
  }
  return shards;
}

function detectGaps(content: string, chapters: ChapterInfo[]): GapEntry[] {
  const gaps: GapEntry[] = [];
  const unresolvedChapter = chapters.find(ch => ch.title === '尚未解决问题');
  if (unresolvedChapter) {
    const lines = content.split('\n');
    const startLine = unresolvedChapter.line + 1;
    let endLine = lines.length;
    for (let i = startLine; i < lines.length; i++) {
      if (lines[i]!.match(new RegExp(`^#{1,${unresolvedChapter.level}}\\s`))) { endLine = i; break; }
    }
    const sectionContent = lines.slice(startLine, endLine).join('\n').trim();
    if (sectionContent && sectionContent !== '（无）' && sectionContent !== '(none)') {
      for (const issue of sectionContent.split('\n').filter(l => l.match(/^\d+\.\s/))) {
        gaps.push({ priority: 'P0', type: 'unsolved_issue', description: issue.replace(/^\d+\.\s*/, '').trim(), source_chapter: '§7' });
      }
    }
  }
  if (!chapters.find(ch => ch.title === '术语表')) {
    gaps.push({ priority: 'P1', type: 'undefined_term', description: 'SRS 未包含术语表章节', source_chapter: '§1.4' });
  }
  return gaps;
}

export function buildShardIndex(
  absSrc: string, content: string, chapters: ChapterInfo[],
  lang: 'zh' | 'en', nfrProfile: NFRProfile,
): ShardIndex {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const warnings: string[] = [];

  if (lines.length === 0) {
    return {
      version: '1.1',
      source_path: absSrc,
      source_hash: createHash('sha256').update(absSrc).digest('hex').slice(0, 16),
      language: lang, total_chars: 0, total_shards: 0,
      shards: [], gaps: [], warnings: ['Empty file'],
      cross_references: [], nfr_profile: nfrProfile,
    };
  }

  const drafts = subdivideShard(lines, 1, lines.length, absSrc, chapters, 0, lang);
  const shards: ShardEntry[] = drafts.map((d, i) => {
    const hash = createHash('sha256').update(d.locator).digest('hex').slice(0, 12);
    const shortName = path.basename(absSrc, path.extname(absSrc));
    return {
      ...d, id: `${shortName}-${i + 1}-${hash}`,
      file: `shard-${i + 1}.jsonl`, nfr_weight: d.nfr_weight,
    };
  });

  const gaps = detectGaps(content, chapters);

  return {
    version: '1.1',
    source_path: absSrc,
    source_hash: createHash('sha256').update(absSrc).digest('hex').slice(0, 16),
    language: lang, total_chars: content.length, total_shards: shards.length,
    shards, gaps, warnings,
    cross_references: [],
    nfr_profile: nfrProfile,
  };
}
```

- [ ] **步骤 4：运行测试验证通过**

```bash
npx tsx --test __tests__/frontend-sharder.test.ts
```

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add lib/frontend/sharder.ts __tests__/frontend-sharder.test.ts
git commit -m "feat(frontend): add sharder with NFR weight computation

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### 任务 10：Round Calculator（动态轮次计算器）

**文件：**
- 创建：`scripts/lib/frontend/round-calculator.ts`
- 创建：`scripts/__tests__/frontend-round-calculator.test.ts`

- [ ] **步骤 1：编写测试**

```typescript
// __tests__/frontend-round-calculator.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { calculateArchRounds } from '../lib/frontend/round-calculator.js';

describe('calculateArchRounds', () => {
  it('returns 3 for small SRS (< 50 shards)', () => {
    assert.strictEqual(calculateArchRounds(0, 0), 3);
    assert.strictEqual(calculateArchRounds(1, 0), 3);
    assert.strictEqual(calculateArchRounds(49, 0), 3);
  });

  it('returns 4 for medium SRS (50-99 shards)', () => {
    assert.strictEqual(calculateArchRounds(50, 0), 4);
    assert.strictEqual(calculateArchRounds(75, 0), 4);
    assert.strictEqual(calculateArchRounds(99, 0), 4);
  });

  it('returns 5 for large SRS (≥ 100 shards)', () => {
    assert.strictEqual(calculateArchRounds(100, 0), 5);
    assert.strictEqual(calculateArchRounds(500, 0), 5);
  });

  it('adds 1 round for many cross-references', () => {
    assert.strictEqual(calculateArchRounds(10, 60), 4);
  });

  it('never exceeds 5', () => {
    assert.strictEqual(calculateArchRounds(999, 999), 5);
  });

  it('never below 2', () => {
    assert.strictEqual(calculateArchRounds(0, 0), 3);
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

```bash
npx tsx --test __tests__/frontend-round-calculator.test.ts
```

预期：FAIL — 模块不存在。

- [ ] **步骤 3：实现**

```typescript
// lib/frontend/round-calculator.ts
export function calculateArchRounds(totalShards: number, crossRefCount: number): number {
  let rounds = 3;
  if (totalShards >= 100) rounds = 5;
  else if (totalShards >= 50) rounds = 4;
  if (crossRefCount > 50) rounds = Math.min(rounds + 1, 5);
  return Math.max(rounds, 2);
}
```

- [ ] **步骤 4：运行测试验证通过**

```bash
npx tsx --test __tests__/frontend-round-calculator.test.ts
```

预期：全部 PASS。

- [ ] **步骤 5：Commit**

```bash
git add lib/frontend/round-calculator.ts __tests__/frontend-round-calculator.test.ts
git commit -m "feat(frontend): add dynamic architecture round calculator

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Phase 5: IR Builder (Pass 4) + CLI

### 任务 11：IR Builder（构建器 + 验证）

**文件：**
- 创建：`scripts/lib/frontend/builder.ts`
- 创建：`scripts/__tests__/frontend-builder.test.ts`

- [ ] **步骤 1：编写测试**

```typescript
// __tests__/frontend-builder.test.ts
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildIR, validateIR } from '../lib/frontend/builder.js';
import type { SRSIR } from '../types/srs-ir.js';

const TMP = '/tmp/srs-formalizer-test-build-ir';
const WORKDIR = path.join(TMP, '.srs_formalizer');

describe('buildIR', () => {
  before(() => {
    fs.mkdirSync(path.join(WORKDIR, '2_extract', 'r1-explicit'), { recursive: true });
    fs.mkdirSync(path.join(WORKDIR, '2_extract', 'r2-implicit'), { recursive: true });
    fs.mkdirSync(path.join(WORKDIR, '2_extract', 'r3-relational'), { recursive: true });
    fs.mkdirSync(path.join(WORKDIR, '1_input'), { recursive: true });

    fs.writeFileSync(path.join(WORKDIR, '2_extract', 'r1-explicit', 'shard-1.jsonl'), [
      '{"id":"R1-USER-0001","category":"explicit","statement":"用户登录","source_file":"srs.md","confidence":"high"}',
      '{"id":"R1-USER-0002","category":"explicit","statement":"用户注册","source_file":"srs.md","confidence":"high"}',
    ].join('\n'), 'utf-8');

    fs.writeFileSync(path.join(WORKDIR, '2_extract', 'r2-implicit', 'shard-1.jsonl'), [
      '{"id":"R2-USER-0001","category":"implicit","statement":"会话管理","source_file":"srs.md","confidence":"medium"}',
    ].join('\n'), 'utf-8');

    fs.writeFileSync(path.join(WORKDIR, '2_extract', 'r3-relational', 'shard-1.jsonl'), [
      '{"id":"R3-USER-0001","category":"relational","statement":"登录依赖认证","source_file":"srs.md","confidence":"high","metadata":{"relation":{"type":"DEPENDS_ON","target":"R1-AUTH-0001"},"source_id":"R3-USER-0001","target_id":"R1-AUTH-0001"}}',
    ].join('\n'), 'utf-8');

    // shard_index.json required by builder for crossRefs/nfrProfile
    fs.writeFileSync(path.join(WORKDIR, '1_input', 'shard_index.json'), JSON.stringify({
      version: '1.1',
      cross_references: [],
      nfr_profile: { detectedCategories: [], weightedShards: [], overallCoverage: 0, blindSpots: ['performance','security','availability','compatibility','maintainability','compliance'] },
    }, null, 2), 'utf-8');
  });

  after(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  it('builds IR from JSONL files', () => {
    const ir = buildIR(WORKDIR);
    assert.strictEqual(ir.version, '2.0.0');
    assert.ok(ir.nodes.length >= 3);
    assert.ok(ir.meta.totalNodes >= 3);
  });

  it('creates explicit requirement nodes', () => {
    const ir = buildIR(WORKDIR);
    const explicit = ir.nodes.filter(n => n.properties.category === 'explicit');
    assert.ok(explicit.length >= 2);
    assert.ok(explicit[0]!.labels.includes(':Requirement'));
  });

  it('creates implicit requirement nodes', () => {
    const ir = buildIR(WORKDIR);
    const implicit = ir.nodes.filter(n => n.properties.category === 'implicit');
    assert.ok(implicit.length >= 1);
    assert.ok(implicit[0]!.labels.includes(':ImplicitRequirement'));
  });

  it('builds edges from metadata relations', () => {
    const ir = buildIR(WORKDIR);
    assert.ok(ir.edges.length >= 1);
    const depEdge = ir.edges.find(e => e.type === 'depends_on');
    assert.ok(depEdge);
  });

  it('deduplicates by id', () => {
    fs.writeFileSync(path.join(WORKDIR, '2_extract', 'r1-explicit', 'shard-2.jsonl'), [
      '{"id":"R1-USER-0001","category":"explicit","statement":"用户登录-DUP","source_file":"srs.md","confidence":"high"}',
    ].join('\n'), 'utf-8');

    const ir = buildIR(WORKDIR);
    const dupNodes = ir.nodes.filter(n => n.id === 'R1-USER-0001');
    assert.strictEqual(dupNodes.length, 1);
  });

  it('IR has crossRefs from shard_index', () => {
    const ir = buildIR(WORKDIR);
    assert.ok(Array.isArray(ir.crossRefs));
  });

  it('IR has nfrProfile', () => {
    const ir = buildIR(WORKDIR);
    assert.ok(typeof ir.nfrProfile === 'object');
    assert.ok(typeof ir.nfrProfile.overallCoverage === 'number');
  });
});

describe('validateIR', () => {
  it('passes for valid IR', () => {
    const ir = buildIR(WORKDIR);
    const result = validateIR(ir);
    assert.ok(result.valid, result.errors.join('; '));
  });

  it('rejects wrong version', () => {
    const result = validateIR({ version: '1.0.0' as unknown as '2.0.0', meta: {} as never, nodes: [], edges: [], crossRefs: [], nfrProfile: {} as never, gaps: [], glossary: [] });
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.includes('version')));
  });

  it('rejects dangling edge', () => {
    const ir = buildIR(WORKDIR);
    ir.edges.push({ id: 'bad', source: 'R1-USER-0001', target: 'NONEXISTENT', type: 'depends_on' as const, properties: {} });
    const result = validateIR(ir);
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.includes('NONEXISTENT')));
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

```bash
npx tsx --test __tests__/frontend-builder.test.ts
```

预期：FAIL — 模块不存在。

- [ ] **步骤 3：实现 builder**

```typescript
// lib/frontend/builder.ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SRSIR, IRNode, IREdge, IRMeta } from '../../types/srs-ir.js';
import type { JsonlRecord } from '../../types/index.js';
import { listJsonlFiles } from '../jsonl.js';

interface ValidationResult { valid: boolean; errors: string[]; }

const SUBDIRS = [
  '2_extract/r1-explicit', '2_extract/r2-implicit', '2_extract/r3-relational',
  '2_extract/r3-cross', '2_extract/r4-nfr',
];

function readJsonlRecords(filePath: string): JsonlRecord[] {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf-8')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => JSON.parse(l) as JsonlRecord);
}

function readAllRecords(workDir: string): JsonlRecord[] {
  const all: JsonlRecord[] = [];
  for (const subdir of SUBDIRS) {
    const dirPath = path.join(workDir, subdir);
    try {
      const files = listJsonlFiles(dirPath, workDir).sort();
      for (const fp of files) {
        all.push(...readJsonlRecords(fp));
      }
    } catch { /* directory may not exist */ }
  }
  return all;
}

function deduplicate(records: JsonlRecord[]): JsonlRecord[] {
  const seen = new Set<string>();
  return records.filter(r => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}

function toIRNode(record: JsonlRecord): IRNode {
  const labels: string[] = [];
  let type: IRNode['type'] = 'requirement';

  if (record.category === 'explicit') labels.push(':Requirement');
  else if (record.category === 'implicit') { labels.push(':ImplicitRequirement'); type = 'requirement'; }
  else if (record.category === 'relational') labels.push(':RelationalRequirement');

  return {
    id: record.id,
    type,
    module: 'root',
    labels,
    properties: {
      statement: record.statement,
      category: record.category,
      confidence: record.confidence,
    },
    source: {
      filePath: record.source_file,
      startLine: 0,
      endLine: 0,
      shardId: 'unknown',
      chapter: 'unknown',
    },
  };
}

function toIREdges(record: JsonlRecord): IREdge[] {
  const edges: IREdge[] = [];
  const meta = record.metadata;
  if (!meta) return edges;

  if (meta.relation && typeof meta.relation === 'object' && !Array.isArray(meta.relation)) {
    const rel = meta.relation as Record<string, unknown>;
    if (typeof rel.target === 'string' && typeof rel.type === 'string') {
      const edgeType = rel.type.toLowerCase() as IREdge['type'];
      edges.push({ id: `${record.id}--${edgeType}--${rel.target}`, source: record.id, target: rel.target, type: edgeType, properties: {} });
    }
  }

  return edges;
}

export function validateIR(ir: SRSIR): ValidationResult {
  const errors: string[] = [];
  if (ir.version !== '2.0.0') errors.push('Invalid IR version: expected 2.0.0');
  const nodeIds = new Set(ir.nodes.map(n => n.id));
  for (const edge of ir.edges) {
    if (!nodeIds.has(edge.source)) errors.push(`Dangling edge source: ${edge.id} -> ${edge.source}`);
    if (!nodeIds.has(edge.target)) errors.push(`Dangling edge target: ${edge.id} -> ${edge.target}`);
  }
  return { valid: errors.length === 0, errors };
}

export function buildIR(workDir: string): SRSIR {
  const records = deduplicate(readAllRecords(workDir));
  const nodes = records.map(toIRNode);
  const edges = records.flatMap(toIREdges);

  let crossRefs = [];
  let nfrProfile = { detectedCategories: [], weightedShards: [], overallCoverage: 0, blindSpots: [] };
  const indexPath = path.join(workDir, '1_input', 'shard_index.json');
  if (fs.existsSync(indexPath)) {
    try {
      const si = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      if (Array.isArray(si.cross_references)) crossRefs = si.cross_references;
      if (si.nfr_profile) nfrProfile = si.nfr_profile;
    } catch { /* skip */ }
  }

  const now = new Date().toISOString();
  const meta: IRMeta = {
    sourcePath: workDir, sourceHash: '', language: 'zh',
    totalChars: 0, totalShards: 0, totalNodes: nodes.length, totalEdges: edges.length,
    buildTimestamp: now,
  };

  const ir: SRSIR = { version: '2.0.0', meta, nodes, edges, crossRefs, nfrProfile, gaps: [], glossary: [] };
  return ir;
}
```

- [ ] **步骤 4：运行测试验证通过**

```bash
npx tsx --test __tests__/frontend-builder.test.ts
```

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add lib/frontend/builder.ts __tests__/frontend-builder.test.ts
git commit -m "feat(frontend): add IR builder with validation

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### 任务 12：build-ir CLI 命令

**文件：**
- 创建：`scripts/commands/build-ir.ts`
- 创建：`scripts/__tests__/build-ir.test.ts`

- [ ] **步骤 1：编写测试**

```typescript
// __tests__/build-ir.test.ts
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

const TMP = '/tmp/srs-formalizer-test-cli-ir';
const WORKDIR = path.join(TMP, '.srs_formalizer');

describe('build-ir CLI', () => {
  before(() => {
    fs.mkdirSync(path.join(TMP, '.srs_formalizer', '2_extract', 'r1-explicit'), { recursive: true });
    fs.mkdirSync(path.join(TMP, '.srs_formalizer', '1_input'), { recursive: true });
    fs.writeFileSync(path.join(TMP, '.srs_formalizer', '2_extract', 'r1-explicit', 'shard-1.jsonl'),
      '{"id":"R1-TEST-0001","category":"explicit","statement":"测试","source_file":"srs.md","confidence":"high"}\n', 'utf-8');
    fs.writeFileSync(path.join(TMP, '.srs_formalizer', '1_input', 'shard_index.json'),
      JSON.stringify({ version: '1.1', cross_references: [], nfr_profile: { detectedCategories: [], weightedShards: [], overallCoverage: 0, blindSpots: ['performance','security','availability','compatibility','maintainability','compliance'] } }, null, 2), 'utf-8');
    fs.writeFileSync(path.join(TMP, '.srs_formalizer', 'STATE.md'), '# STATE\n', 'utf-8');
  });

  after(() => { fs.rmSync(TMP, { recursive: true, force: true }); });

  it('writes srs-ir.json to workdir', async () => {
    const { main } = await import('../commands/build-ir.js');
    const result = await main(['--workdir', path.join(TMP, '.srs_formalizer')]);
    assert.strictEqual(result.status, 'ok');
    const irPath = path.join(TMP, '.srs_formalizer', 'srs-ir.json');
    assert.ok(fs.existsSync(irPath));
    const irData = JSON.parse(fs.readFileSync(irPath, 'utf-8'));
    assert.strictEqual(irData.version, '2.0.0');
    assert.ok(irData.nodes.length >= 1);
  });

  it('rejects missing workdir', async () => {
    const { main } = await import('../commands/build-ir.js');
    const result = await main([]);
    assert.strictEqual(result.status, 'error');
    assert.ok(result.message?.includes('workdir'));
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

```bash
npx tsx --test __tests__/build-ir.test.ts
```

预期：FAIL — 模块不存在。

- [ ] **步骤 3：实现 CLI 命令**

```typescript
// commands/build-ir.ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliResult } from '../types/index.js';
import { safeParseArg, validateWorkDir } from '../lib/cli.js';
import { buildIR } from '../lib/frontend/builder.js';

export async function main(args: string[]): Promise<CliResult> {
  let workDirArg: string | null;
  try { workDirArg = safeParseArg(args, '--workdir'); }
  catch (err) { return { status: 'error', message: (err as Error).message }; }

  if (!workDirArg) return { status: 'error', message: 'Missing required argument: --workdir' };

  let workDir: string;
  try { workDir = validateWorkDir(workDirArg); }
  catch (err) { return { status: 'error', message: (err as Error).message }; }

  let ir;
  try { ir = buildIR(workDir); }
  catch (err) { return { status: 'error', message: `IR build failed: ${(err as Error).message}` }; }

  const irPath = path.join(workDir, 'srs-ir.json');
  fs.writeFileSync(irPath, JSON.stringify(ir, null, 2), 'utf-8');

  return { status: 'ok', data: { nodes: ir.meta.totalNodes, edges: ir.meta.totalEdges, ir_path: irPath } };
}

import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
```

- [ ] **步骤 4：更新 index.ts 注册表**

在 `scripts/index.ts` 的 `COMMANDS` 对象中添加：

```typescript
"build-ir": () => import("./commands/build-ir.js"),
```

并在 USAGE 字符串中添加对应行。

- [ ] **步骤 5：运行测试验证通过**

```bash
npx tsx --test __tests__/build-ir.test.ts
```

预期：PASS。

- [ ] **步骤 6：运行全量 typecheck**

```bash
npx tsc --noEmit
```

预期：0 errors。

- [ ] **步骤 7：Commit**

```bash
git add commands/build-ir.ts __tests__/build-ir.test.ts scripts/index.ts
git commit -m "feat(frontend): add build-ir CLI command

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Phase 6: manifest 重写 + guided-extract 扩展

### 任务 13：重写 manifest 命令

**文件：**
- 重写：`scripts/commands/manifest.ts`
- 修改：`scripts/__tests__/manifest.test.ts`

- [ ] **步骤 1：编写测试**

```typescript
// __tests__/manifest.test.ts
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

const TMP = '/tmp/srs-formalizer-test-manifest-new';
const WORKDIR = path.join(TMP, '.srs_formalizer');
const SRS_FILE = path.join(TMP, 'test_srs.md');

describe('manifest (new)', () => {
  before(() => {
    fs.mkdirSync(WORKDIR, { recursive: true });
    fs.writeFileSync(SRS_FILE, `# §1 概述
系统需支持高并发场景。
## §2 性能需求
响应时间不超过 200ms，吞吐量需达 10000 TPS。
## §3 安全需求
所有数据传输需加密。参见 §2 中的定义。
## 术语表
| 术语 | 定义 |
|------|------|
| TPS | Transactions Per Second |`, 'utf-8');
    fs.writeFileSync(path.join(WORKDIR, 'STATE.md'), '# STATE\n', 'utf-8');
  });

  after(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  it('generates shard_index.json v1.1', async () => {
    const { main } = await import('../commands/manifest.js');
    const result = await main(['--src', SRS_FILE, '--lang', 'zh', '--workdir', WORKDIR]);
    assert.strictEqual(result.status, 'ok');

    const indexPath = path.join(WORKDIR, '1_input', 'shard_index.json');
    assert.ok(fs.existsSync(indexPath));
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    assert.strictEqual(index.version, '1.1');
    assert.ok(index.shards.length > 0);
  });

  it('shard_index contains nfr_profile', async () => {
    const { main } = await import('../commands/manifest.js');
    await main(['--src', SRS_FILE, '--lang', 'zh', '--workdir', WORKDIR]);
    const indexPath = path.join(WORKDIR, '1_input', 'shard_index.json');
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    assert.ok(typeof index.nfr_profile === 'object');
    assert.ok(index.nfr_profile.detectedCategories.length > 0);
    assert.ok(typeof index.nfr_profile.overallCoverage === 'number');
  });

  it('shard_index contains cross_references', async () => {
    const indexPath = path.join(WORKDIR, '1_input', 'shard_index.json');
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    assert.ok(Array.isArray(index.cross_references));
  });

  it('rejects missing --src', async () => {
    const { main } = await import('../commands/manifest.js');
    const result = await main([]);
    assert.strictEqual(result.status, 'error');
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

```bash
npx tsx --test __tests__/manifest.test.ts
```

预期：FAIL — manifest 调用旧 lib（已归档）。

- [ ] **步骤 3：重写 manifest.ts**

```typescript
// commands/manifest.ts (完全重写)
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type { CliResult } from '../types/index.js';
import type { CrossRef, GapEntry } from '../../types/index.js'; // 保留旧类型引用
import { safeParseArg, validateWorkDir } from '../lib/cli.js';
import { identifyChapters, detectCrossRefs, scanNFR, type ChapterInfo } from '../lib/frontend/parser.js';
import { buildShardIndex } from '../lib/frontend/sharder.js';

function collectSourceFiles(absSrc: string): string[] {
  const stat = fs.statSync(absSrc);
  if (!stat.isDirectory()) return [absSrc];
  const files = fs.readdirSync(absSrc)
    .filter(f => /\.(md|html|htm)$/i.test(f))
    .sort()
    .map(f => path.join(absSrc, f));
  return files.length === 0 ? [absSrc] : files;
}

function detectGaps(content: string, chapters: ChapterInfo[]): GapEntry[] {
  const gaps: GapEntry[] = [];
  const unresolved = chapters.find(ch => ch.title === '尚未解决问题');
  if (unresolved) {
    const lines = content.split('\n');
    const startLine = unresolved.line + 1;
    let endLine = lines.length;
    for (let i = startLine; i < lines.length; i++) {
      if (lines[i]!.match(new RegExp(`^#{1,${unresolved.level}}\\s`))) { endLine = i; break; }
    }
    const section = lines.slice(startLine, endLine).join('\n').trim();
    if (section && section !== '（无）' && section !== '(none)') {
      for (const issue of section.split('\n').filter(l => l.match(/^\d+\.\s/))) {
        gaps.push({ priority: 'P0', type: 'unsolved_issue', description: issue.replace(/^\d+\.\s*/, '').trim(), source_chapter: '§7' });
      }
    }
  }
  if (!chapters.find(ch => ch.title === '术语表')) {
    gaps.push({ priority: 'P1', type: 'undefined_term', description: 'SRS 未包含术语表章节', source_chapter: '§1.4' });
  }
  return gaps;
}

export async function main(args: string[]): Promise<CliResult> {
  let srcPath: string | null; let lang: string; let workDirArg: string | null;
  try { srcPath = safeParseArg(args, '--src'); lang = safeParseArg(args, '--lang') || 'zh'; workDirArg = safeParseArg(args, '--workdir'); }
  catch (err) { return { status: 'error', message: (err as Error).message }; }

  if (!srcPath) return { status: 'error', message: 'Missing required argument: --src' };
  if (!workDirArg) return { status: 'error', message: 'Missing required argument: --workdir' };
  if (lang !== 'zh' && lang !== 'en') return { status: 'error', message: `Invalid --lang: "${lang}". Must be "zh" or "en".` };

  let workDir: string;
  try { workDir = validateWorkDir(workDirArg); } catch (err) { return { status: 'error', message: (err as Error).message }; }

  const absSrc = path.resolve(srcPath);
  if (!fs.existsSync(absSrc)) return { status: 'error', message: `Source file not found: ${absSrc}` };

  const sourceFiles = collectSourceFiles(absSrc);
  const allShards = [];
  const warnings: string[] = [];
  let allGaps: GapEntry[] = [];
  let allCrossRefs: CrossRef[] = [];

  for (const sourcePath of sourceFiles) {
    let content: string;
    try { content = fs.readFileSync(sourcePath, 'utf-8'); }
    catch (err) { return { status: 'error', message: `Failed to read ${sourcePath}: ${(err as Error).message}` }; }
    if (content.trim().length === 0) { warnings.push(`Skipping empty file: ${sourcePath}`); continue; }

    const chapters = identifyChapters(content, sourcePath);
    if (chapters.length === 0) warnings.push(`No chapters detected in ${sourcePath}`);

    const crossRefs = detectCrossRefs(content, chapters);
    allCrossRefs.push(...crossRefs);

    const nfrProfile = scanNFR(content, lang as 'zh' | 'en');
    const index = buildShardIndex(sourcePath, content, chapters, lang as 'zh' | 'en', nfrProfile);
    index.cross_references = crossRefs;

    allShards.push(...index.shards);
    allGaps.push(...detectGaps(content, chapters));
  }

  const shardIndex = {
    version: '1.1' as const,
    source_path: absSrc,
    source_hash: crypto.createHash('sha256').update(absSrc).digest('hex').slice(0, 16),
    language: lang as 'zh' | 'en',
    total_chars: 0,
    total_shards: allShards.length,
    shards: allShards,
    gaps: allGaps,
    warnings,
    cross_references: allCrossRefs,
    nfr_profile: { detectedCategories: [], weightedShards: [], overallCoverage: 0, blindSpots: ['performance','security','availability','compatibility','maintainability','compliance'] },
  };

  const outputDir = path.join(workDir, '1_input');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'shard_index.json'), JSON.stringify(shardIndex, null, 2), 'utf-8');

  return { status: 'ok', data: { total_files: sourceFiles.length, total_shards: allShards.length, total_gaps: allGaps.length, index_path: path.join(outputDir, 'shard_index.json') } };
}

import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
```

- [ ] **步骤 4：运行测试验证通过**

```bash
npx tsx --test __tests__/manifest.test.ts
```

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add commands/manifest.ts __tests__/manifest.test.ts
git commit -m "feat(frontend): rewrite manifest to use new frontend modules

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### 任务 14：扩展 guided-extract 支持 R3-cross/R4-NFR/Arch-4

**文件：**
- 修改：`scripts/commands/guided-extract.ts`
- 修改：`scripts/__tests__/guided-extract.test.ts`

- [ ] **步骤 1：编写测试**

```typescript
// 追加到 __tests__/guided-extract.test.ts
import { validateLine } from '../commands/guided-extract.js';

describe('guided-extract R3-cross validation', () => {
  it('accepts valid R3C record', () => {
    const result = validateLine(
      '{"id":"R3C-USER-0001","category":"relational","statement":"跨文件关系","source_file":"srs.md","confidence":"high","metadata":{"cross_shard_refs":["shard-1","shard-2"]}}',
      'r3-cross'
    );
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors.length, 0);
  });
});

describe('guided-extract R4-NFR validation', () => {
  it('accepts valid R4N record', () => {
    const result = validateLine(
      '{"id":"R4N-PERF-0001","category":"explicit","statement":"响应时间 ≤ 200ms","source_file":"srs.md","confidence":"high","metadata":{"nfrCategory":"performance","nfrThreshold":{"metric":"response_time","value":200,"unit":"ms","operator":"<="}}}',
      'r4-nfr'
    );
    assert.strictEqual(result.valid, true);
  });

  it('rejects R4N without nfrCategory', () => {
    const result = validateLine(
      '{"id":"R4N-PERF-0001","category":"explicit","statement":"响应时间 ≤ 200ms","source_file":"srs.md","confidence":"high"}',
      'r4-nfr'
    );
    assert.strictEqual(result.valid, false);
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

```bash
npx tsx --test __tests__/guided-extract.test.ts
```

预期：部分 FAIL — R3-cross/R4-NFR 验证器不存在。

- [ ] **步骤 3：扩展 guided-extract.ts**

```typescript
// 在 guided-extract.ts 中修改 ExtractType
type ExtractType = "r1" | "r2" | "r3" | "r3-cross" | "r4-nfr" | "arch";

// 新增 R3-cross 验证器
function validateR3CrossLine(line: string): { valid: boolean; errors: string[] } {
  const result = validateRequirementLine(line, "R3C");
  if (!result.valid) return result;
  const record = JSON.parse(line.trim()) as Record<string, unknown>;
  if (record.metadata && typeof record.metadata === 'object') {
    const meta = record.metadata as Record<string, unknown>;
    if (meta.cross_shard_refs) {
      if (!Array.isArray(meta.cross_shard_refs)) {
        result.errors.push('cross_shard_refs must be array');
        result.valid = false;
      }
    }
  }
  return result;
}

// 新增 R4-NFR 验证器
const VALID_NFR_CATEGORIES = ['performance', 'security', 'availability', 'compatibility', 'maintainability', 'compliance'];

function validateR4NFRLine(line: string): { valid: boolean; errors: string[] } {
  const result = validateRequirementLine(line, "R4N");
  if (!result.valid) return result;
  const record = JSON.parse(line.trim()) as Record<string, unknown>;
  if (!record.metadata || typeof record.metadata !== 'object') {
    result.valid = false;
    result.errors.push('metadata.nfrCategory required for R4-NFR');
    return result;
  }
  const meta = record.metadata as Record<string, unknown>;
  if (!VALID_NFR_CATEGORIES.includes(String(meta.nfrCategory ?? ''))) {
    result.valid = false;
    result.errors.push(`Invalid nfrCategory: ${String(meta.nfrCategory ?? '')}`);
  }
  return result;
}

// 在 validateLine switch 中添加
case "r3-cross": return validateR3CrossLine(line);
case "r4-nfr": return validateR4NFRLine(line);

// 更新 ID 格式正则以接受新前缀
const VALID_ID_RE = /^R[123][C]?[4]?[N]?-[A-Za-z0-9_.]+-\d{4}$/;
// 修正：分别匹配 R1/R2/R3/R3C/R4N
```

- [ ] **步骤 4：运行测试验证通过**

```bash
npx tsx --test __tests__/guided-extract.test.ts
```

预期：全部 PASS。

- [ ] **步骤 5：运行全量测试**

```bash
npx tsc --noEmit && npx tsx --test __tests__/*.test.ts
```

预期：所有新测试和保留旧测试 0 failures。

- [ ] **步骤 6：Commit**

```bash
git add commands/guided-extract.ts __tests__/guided-extract.test.ts
git commit -m "feat(frontend): extend guided-extract with R3-cross, R4-NFR, Arch-4

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## 最终验证

### 任务 15：全量回归 + typecheck

- [ ] **步骤 1：运行全量 typecheck**

```bash
cd .claude/skills/srs-formalizer/scripts
npx tsc --noEmit
```

预期：0 errors。

- [ ] **步骤 2：运行全量测试**

```bash
npx tsx --test __tests__/*.test.ts
```

预期：所有测试 PASS，0 failures。旧淘汰测试已移除，新测试 ~120 cases。

- [ ] **步骤 3：Commit**

```bash
git add -A
git commit -m "chore: final typecheck and test pass for sub-project 1

Co-Authored-By: Claude <noreply@anthropic.com>"
```
