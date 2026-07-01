# PLAN: srs-formalizer SkCC 方法论强化 — 编译时安全 + 平台自适应发射

**日期**: 2026-07-01
**版本**: 1.0
**状态**: 待实现
**基于**: SkCC 论文 (arXiv:2605.03353), SkillsBench (arXiv:2602.12670), Snyk ToxicSkills 审计

---

## 0. 决策记录

本节记录所有已敲定的架构决策，作为后续实现的唯一输入源。

| # | 决策点 | 选择 | 理由 |
|---|--------|------|------|
| 1 | 应用深度 | C 级架构（去除 VS Code） | 完整编译器架构，最大长期收益 |
| 2 | SkIR 存储形式 | JSON 持久化 (`_ctx/skir.json`) | 可缓存、可校验、可被 pack-skill/verify-integrity 消费 |
| 3 | 编译触发时机 | 技能加载时编译，产物写入 `.srs_formalizer/_ctx/` | 与 init→manifest 模式一致 |
| 4 | 编译器阶段划分 | 混合：元数据预编译 + Prompt 按需编译（加载时注入） | 保留渐进式上下文控制 + 一次性安全分析 |
| 5 | 安全三层关系 | 顺序级联 + 分级阻断 (文件完整性→IR编译含Anti-Skill→数据门禁) | 对标 SkCC 四级安全模型 |
| 6 | 发射器优先级 | Phase 1: Claude XML + Generic MD (覆盖 Claude Code, Trae, OpenCode + 其余平台) / Phase 2: Kimi, Codex 按需 | Trae 复用 Claude XML（Claude 兼容产品），OpenCode 用 Generic MD 兜底 |
| 7 | 编译产物位置 | `.srs_formalizer/_ctx/` (skir.json, skill.claude.xml, skill.generic.md) | 与 shard_index.json 同目录，语义为"编译上下文" |
| 8 | compile 命令形式 | 独立 CLI 命令 + 编排者自动调用 | 可测试 + 与 init/manifest 模式一致 |
| 9 | compile/pack/verify 三者关系 | 分离：compile 做语义编译，pack-skill 做密码学完整性。编译产物被 pack-skill 自然纳入 MANIFEST | 关注点分离，编译产物受密码学完整性保护 |
| 10 | 编译失败策略 | 分级阻断：warning 继续 / error 阻断 / critical 阻断+HITL | 对标 SkCC + 现有 verify-gate 三级模式 |

---

## 1. 总体架构

```
                         技能加载时触发
                              │
    ┌─────────────────────────▼─────────────────────────┐
    │              compile.ts (新命令 #18)               │
    │                                                    │
    │  Phase 1: Parse ──── YAML frontmatter + MD AST     │
    │  Phase 2: IR Build ─ SkIR 强类型中间表示           │
    │  Phase 3: Inject ─── Anti-Skill 安全约束注入       │
    │  Phase 4: Emit ───── Claude XML / Generic MD       │
    │                                                    │
    │  输出 → .srs_formalizer/_ctx/skir.json             │
    │  输出 → .srs_formalizer/_ctx/skill.claude.xml      │
    │  输出 → .srs_formalizer/_ctx/skill.generic.md      │
    └──────────────────────┬─────────────────────────────┘
                           │
    ┌──────────────────────▼─────────────────────────────┐
    │              现有 S0→S6 流水线                       │
    │                                                    │
    │  编排者加载编译产物（按需）：                          │
    │  - Claude Code 环境 → 使用 skill.claude.xml         │
    │  - Trae/OpenCode/其他 → 使用 skill.generic.md       │
    │  - 所有平台 → 注入 anti_skill_constraints           │
    │  - 所有平台 → verify-skill-integrity 先于阶段转换   │
    └────────────────────────────────────────────────────┘
```

---

## 2. 新增文件清单

| # | 文件路径 | 估计行数 | 职责 |
|---|---------|:-------:|------|
| 1 | `scripts/commands/compile.ts` | ~200 | CLI 入口，四阶段编排，分级阻断逻辑 |
| 2 | `scripts/types/skir.ts` | ~100 | SkIR 完整类型定义（30+ 字段，9 组） |
| 3 | `scripts/lib/skir-builder.ts` | ~150 | RawAST → SkIR 转换 + 校验（对标 SkCC builder.rs） |
| 4 | `scripts/lib/anti-skill.ts` | ~100 | 7 条注入规则 + 分级判定 + inject() 函数 |
| 5 | `scripts/lib/emitter-claude-xml.ts` | ~120 | SkIR → Claude XML 语义分层（对标 claude_xml.j2） |
| 6 | `scripts/lib/emitter-generic-md.ts` | ~100 | SkIR → 标准 Markdown（对标 kimi_md.j2 + gemini_md_v2.j2） |
| 7 | `scripts/lib/compile-validator.ts` | ~80 | 编译级 schema 校验（对标 analyzer/schema.rs） |

| 8 | `scripts/__tests__/compile.test.ts` | ~150 | Phase 1-4 全过程，分级阻断，边界条件 |
| 9 | `scripts/__tests__/anti-skill.test.ts` | ~120 | 7 条规则匹配/不匹配，多触发，空输入 |
| 10 | `scripts/__tests__/emitter.test.ts` | ~150 | XML 结构完整性，MD 结构完整性，permission 表格 |
| 11 | `scripts/__tests__/skir-builder.test.ts` | ~100 | IR 构建，字段映射，默认值 |

| **合计** | **11 文件** | **~1,370 行** | |

---

## 3. 修改文件清单

| # | 文件路径 | 改动量 | 说明 |
|---|---------|:-----:|------|
| 1 | `scripts/index.ts` | +2 行 | 新增 `compile` 命令路由 (case branch) |
| 2 | `SKILL.md` | +30 行 | frontmatter 新增 `security_level`, `permissions`, `compatibility` 三个可选字段；更新 version 到 0.4.0 |
| 3 | `prompts/orchestrator_stage_S1.md` | +8 行 | 新增"步骤 0：compile" |
| 4 | `CHANGELOG.md` | +15 行 | 记录 v0.4.0 变更 |

---

## 4. SkIR 核心类型定义

```typescript
// scripts/types/skir.ts

interface SkillIR {
  // Metadata & Routing
  name: string;                          // kebab-case, 1-64 字符
  version: string;                       // semver
  description: string;                   // ≤1024 字符

  // MCP & Schemas
  mcp_servers: string[];
  input_schema?: object;
  output_schema?: object;

  // Security & Control
  security_level: 'low' | 'medium' | 'high' | 'critical';
  hitl_required: boolean;
  pre_conditions: string[];
  post_conditions: string[];
  fallbacks: string[];
  permissions: Permission[];

  // Execution Logic
  context_gathering: string[];
  procedures: ProcedureStep[];
  approaches: Approach[];
  mode: 'sequential' | 'alternative' | 'toolkit' | 'guideline';
  few_shot_examples: Example[];

  // Compile-time Injection (核心新增)
  anti_skill_constraints: Constraint[];

  // Extra Sections
  extra_sections: SectionInfo[];

  // Format Optimization Flags
  requires_yaml_optimization: boolean;
  nested_data_depth?: number;

  // srs-formalizer 特有扩展
  pipeline_stages: PipelineStage[];
  capability_requirements: Record<string, Record<string, number>>;
  capability_tiers: CapabilityTier[];
  platform_activation: Record<string, PlatformActivation>;
  stage_gates: string[];

  // Meta (不序列化到发射产物)
  source_path: string;
  source_hash: string;
  compiled_at: string;
}
```

完整子类型定义（ProcedureStep, Permission, Constraint, PipelineStage, CapabilityTier, PlatformActivation 等）见第 2 节设计的详细 TypeScript 接口。

---

## 5. Anti-Skill 注入规则（7 条）

### 规则 1-4：移植自 SkCC anti_skill.rs

| # | ID | 触发关键词 | 注入约束 | 级别 |
|---|-----|-----------|---------|:----:|
| 1 | `http-safety` | HTTP, GET, POST, fetch, request, curl, wget | NEVER execute HTTP without timeout (10s). Max 3 retries on 403. | warning |
| 2 | `loop-safety` | while, loop, repeat, for ( | ALL loops must have max iteration limit (1000). Implement counter + break condition. | error |
| 3 | `db-destructive-safety` | DROP, DELETE, TRUNCATE, rm -rf | NO destructive DB/FS operations without user confirmation. Show affected rows/files first. | critical |
| 4 | `parse-safety` | BeautifulSoup, HTML parse, innerHTML, eval( | Do NOT parse raw JS variables with HTML parsers. Fallback to Regex. | warning |

### 规则 5-7：srs-formalizer 特有

| # | ID | 触发关键词 | 注入约束 | 级别 |
|---|-----|-----------|---------|:----:|
| 5 | `srs-writeback-safety` | SRS_PATCHES.md, write to SRS, 修改原始SRS, writeFileSync, fs.write | NEVER modify original SRS file without user explicit confirmation. All writes to .srs_formalizer/ only. | critical |
| 6 | `verifier-isolation` | verifier-R, executor-R, dispatch subagent, new session, 上下文隔离 | Verifiers MUST execute in FRESH session. Executor output MUST NOT influence verifier judgment. Cross-contamination = automatic REJECTED. | error |
| 7 | `integrity-gate-mandatory` | stage transition, stage complete, pipeline, verify-gate | MUST run verify-skill-integrity BEFORE every stage transition. Tampering detected → auto-repair from .enc → BLOCK pipeline → notify human. | critical |

### 注入逻辑

扫描所有 `ProcedureStep.instruction` 文本，关键词匹配 → 注入对应 Constraint 到 `ir.anti_skill_constraints`。

**预期触发率**: 5/7 (83%) — http-safety, loop-safety, srs-writeback, verifier-isolation, integrity-gate 触发；db-destructive, parse-safety 不触发。

### 分级阻断

```
warning  → 注入约束，继续流水线，记录到 STATE.md
error    → 阻断编译，返回 status: error + violations 列表，要求修正
critical → 阻断编译，返回 status: error + HITL 标记，等待人类确认
```

---

## 6. 发射器设计

### 6.1 Claude XML 语义分层

- **对标**: SkCC `claude_xml.j2` (113 行模板)
- **策略**: YAML frontmatter 保留（技能发现），正文包裹在 `<agent_skill>` XML 标签树中
- **关键标签**: `<execution_steps>/<step order="N" critical="true">`, `<strict_constraints>/<anti_pattern source="..." level="...">`, `<permissions>/<permission kind="..." scope="..." read_only="...">`, `<examples>/<example title="...">`
- **学术依据**: Claude 对 XML 标签分层有 +23% 推理准确度提升（SkCC Section 3.3）
- **覆盖平台**: Claude Code, Trae（Trae 是 Claude 兼容产品，共享 XML 增益）
- **产物路径**: `.srs_formalizer/_ctx/skill.claude.xml`

### 6.2 Generic Markdown 兜底

- **对标**: SkCC `kimi_md.j2` (127 行) + `gemini_md_v2.j2` (141 行)
- **策略**: YAML frontmatter 保留 + 标准 Markdown 标题层级。约束以 blockquote 形式（`> **CRITICAL**`, `> **ERROR**`, `> **WARNING**`），权限以 Markdown 表格
- **覆盖平台**: OpenCode, Cursor, Windsurf, Qoder, Codex, Gemini, Kimi, Antigravity — 所有非 Claude 平台
- **产物路径**: `.srs_formalizer/_ctx/skill.generic.md`

### 6.3 发射器选择逻辑

```typescript
function selectEmitters(ir: SkillIR): Emitter[] {
  const targets: Emitter[] = [];
  // Trae 复用 Claude XML (Claude 兼容产品)
  if (ir.platform_activation['claude-code'] || ir.platform_activation['trae']) {
    targets.push(new ClaudeXmlEmitter());
  }
  // Generic MD 始终生成 (兜底所有平台)
  targets.push(new GenericMarkdownEmitter());
  return targets;
}
```

---

## 7. 安全三层级联顺序

```
📦 层 1: 文件完整性 (已有 — verify-skill-integrity)
   │   SHA256 manifest 对比 → 篡改检测 → AES-256-GCM 自修复
   │   失败 → BLOCK 流水线 + 通知人类
   ▼
🔧 层 2: IR 编译 + Anti-Skill (新增 — compile)
   │   解析 → IR 构建 → 安全注入 → 分级阻断
   │   warning: 继续 ｜ error: 阻断 ｜ critical: 阻断 + HITL
   ▼
📐 层 3: 数据门禁 (已有 — validate-* 系列)
    JSONL 格式 / 架构循环 / Cypher 语法 / BDD 结构
    失败 → 阻断阶段转换
```

三层独立，顺序执行。任何一层的 error/critical 失败都阻断后续。

---

## 8. CLI 接口

```
npx tsx index.ts compile --skill-dir <path> --workdir .srs_formalizer [--target <filter>]

参数:
  --skill-dir <path>    技能根目录 (SKILL.md 所在), 必填
  --workdir <path>      工作目录 (必须是 .srs_formalizer), 必填
  --target <platforms>  可选过滤: claude,generic (默认全部)

成功输出:
  {"status":"ok","data":{
    "skir_path":"_ctx/skir.json",
    "emitted":["skill.claude.xml","skill.generic.md"],
    "constraints_injected":5,
    "security_level":"high",
    "compiled_at":"2026-07-01T..."
  }}

警告输出 (有 warning 级别约束):
  {"status":"ok","data":{..."warnings":[{"rule":"http-safety","detail":"..."}]}}

错误输出 (error/critical 阻断):
  {"status":"error","message":"Compilation blocked","violations":[
    {"rule":"loop-safety","level":"error","detail":"...","found_in":"S2.3 R2 implicit derivation"}
  ]}
```

---

## 9. 编排者集成

修改 `prompts/orchestrator_stage_S1.md`，在步骤 1 (init) 之前新增步骤 0:

```markdown
### 步骤 0：编译技能（技能加载时执行一次）
```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts compile \
  --skill-dir .claude/skills/srs-formalizer \
  --workdir .srs_formalizer
```

验证输出为 `{"status":"ok"}`。产物写入 `_ctx/skir.json`, `_ctx/skill.claude.xml`, `_ctx/skill.generic.md`。

若 `status: error` → 暂停流水线，列出 violations，标记 STATE.md BLOCKED，等待人类确认。
若 `status: ok` 但有 warnings → 记录到 STATE.md 决策记录，流水线继续。
```

---

## 10. 与现有基础设施的兼容性

| 现有组件 | 是否需要修改 | 说明 |
|---------|:-----------:|------|
| `init.ts` | ❌ 否 | compile 是独立命令，由编排者调用 |
| `manifest.ts` | ❌ 否 | 无依赖关系 |
| `pack-skill.ts` | ❌ 否 | 编译产物被 collectFiles() 自然扫描纳入 MANIFEST |
| `verify-skill-integrity.ts` | ❌ 否 | 编译产物被篡改时自动从 .enc 恢复 |
| `verify-gate.ts` | ❌ 否 | 不依赖编译产物 |
| `validate-*` 系列 | ❌ 否 | 数据门禁独立于编译层 |
| `inject-prompt.ts` | ❌ 否 | 不受影响 |
| 所有 executor/verifier prompt | ❌ 否 | 不受影响 |
| 所有 orchestrator prompt (S0, S2-S6) | ❌ 否 | 仅 S1 增加步骤 0 |
| `templates/` 下所有文件 | ❌ 否 | 不受影响 |
| `tests/` 下现有 20 个测试文件 | ❌ 否 | 不受影响，新增测试文件 |

唯一修改：`index.ts` (+2 行), `SKILL.md` (+30 行), `orchestrator_stage_S1.md` (+8 行), `CHANGELOG.md` (+15 行)。

---

## 11. 测试策略

| 测试文件 | 用例数(估) | 覆盖内容 |
|---------|:--------:|---------|
| `compile.test.ts` | 8 | Phase 1-4 全过程; 分级阻断(error/critical); warning 不阻断; 空 SKILL.md 错误; 幂等编译 |
| `anti-skill.test.ts` | 7 | 7 条规则独立匹配/不匹配; 多规则同时触发; 空 procedure 无触发 |
| `emitter.test.ts` | 6 | Claude XML 含必选标签(`<agent_skill>`,`<execution_steps>`); Generic MD 无 XML 残留; permission 表格; example 格式; frontmatter 保留 |
| `skir-builder.test.ts` | 6 | name 校验(kebab-case); description 长度; security_level 默认值; pipeline_stages 从 frontmatter 映射; procedures 自动推导; mode 推断 |

新增约 **27 测试用例**。现有 168 测试无变动。总测试数: **195**。

---

## 12. 文件改动汇总

| 类型 | 文件数 | 代码行数(估) |
|------|:-----:|:----------:|
| 新增 TypeScript 源文件 | 7 | ~730 |
| 新增测试文件 | 4 | ~520 |
| 修改现有文件 | 4 | ~55 |
| **合计** | **15** | **~1,425** |

不含测试文件的新增源代码: **~850 行**。

---

## 13. 验收标准

1. ✅ `npx tsx index.ts compile --help` 输出合法帮助文本
2. ✅ 对 srs-formalizer 自身 SKILL.md 执行 `compile`，返回 `status: ok`
3. ✅ `_ctx/skir.json` 含完整的 SkIR（30+ 字段）
4. ✅ `_ctx/skill.claude.xml` 含 `<agent_skill>`, `<execution_steps>`, `<strict_constraints>`, `<permissions>`, `<examples>` 标签
5. ✅ `_ctx/skill.generic.md` 无 XML 标签，使用标准 Markdown 标题
6. ✅ Anti-Skill 注入器对包含 `DROP`, `HTTP`, `while` 的 procedure 正确注入对应约束
7. ✅ 含 `critical` 约束的编译返回 `status: error`
8. ✅ 27 个新测试全部 PASS，现有 168 测试无回归
9. ✅ `typecheck` (`tsc --noEmit`) 通过
10. ✅ CHANGELOG 记录 v0.4.0 变更

---

## 参考文献

- **SkCC 论文**: https://arxiv.org/abs/2605.03353
- **SkCC 源码**: https://github.com/Nexa-Language/Skill-Compiler/ (51,340 行, Rust)
- **SkillsBench**: https://arxiv.org/abs/2602.12670
- **Snyk ToxicSkills 审计**: https://snyk.io/blog/toxicskills-malicious-ai-agent-skills-clawhub/
- **SkCC 项目主页**: https://skcc.nexa-lang.com/
- **Trae 与 Claude Code 兼容性**: https://www.cnblogs.com/wintersun/p/19626496
- **OpenCode Skills 规范**: https://opencode.ai/docs/skills.md
