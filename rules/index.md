---
alwaysApply: true
---

# 规则体系总览

> 本文件是项目规则体系的入口，提供快速导航和引用索引。

## 目录结构

```
rules/
├── index.md                    # 规则总览（当前文件）
├── superpowers-zh.md           # 技能索引
│
├── project/                    # 项目规范
│   ├── rules.md                # 项目级基础规则
│   │
│   ├── coding/                 # 编码规范
│   │   ├── standards.md        # TypeScript 开发标准
│   │   └── testing.md          # 测试验证方法
│   │
│   └── methodology/            # 开发方法论
│       ├── sop.md              # 标准化执行工作流
│       ├── atdd.md             # ATDD（验收测试驱动开发）
│       ├── bdd.md              # BDD（行为驱动开发）
│       └── sdd.md              # SDD（规格驱动开发）
│
└── skill/                      # Skill 专用规则
    ├── structure.md            # 结构与设计模式
    ├── security.md             # 安全与 HITL
    ├── cross-platform.md       # 跨环境适配
    └── verification.md         # 验证规则
```

## 文件职责索引

### 顶层入口

| 文件 | 职责 |
|------|------|
| `index.md` | 规则体系总览与快速导航 |
| `superpowers-zh.md` | 可用技能列表与触发条件 |

### 项目规范

| 文件 | 职责 |
|------|------|
| `project/rules.md` | 构建命令、Git 规范、安全规范等项目级基础规则 |
| `project/coding/standards.md` | TypeScript 开发标准、代码规范、技术选型 |
| `project/coding/testing.md` | 测试验证方法、验证策略、测试层级定义 |
| `project/methodology/sop.md` | 标准化执行工作流（拷问循环 → 冻结规格书 → 隔离执行） |
| `project/methodology/atdd.md` | 验收测试驱动开发方法指南 |
| `project/methodology/bdd.md` | 行为驱动开发方法指南 |
| `project/methodology/sdd.md` | 规格驱动开发方法指南 |

### Skill 专用规则

| 文件 | 职责 |
|------|------|
| `skill/structure.md` | SKILL.md 结构规范、五种设计模式、编译器思想 |
| `skill/security.md` | Anti-Skill 安全约束、安全等级、HITL 审批、Fail-Fast |
| `skill/cross-platform.md` | 跨操作系统适配、跨协议适配（MCP/A2A）、跨 LLM 适配 |
| `skill/verification.md` | skill 验证规则、Token 预算意识、测试层级定义、局限性说明 |

## 引用映射表

### 主题查找索引

| 主题 | 查找位置 |
|------|----------|
| 构建命令 | `project/rules.md` |
| Git 规范 | `project/rules.md` |
| 安全规范 | `project/rules.md` + `skill/security.md` |
| TypeScript 规范 | `project/coding/standards.md` |
| 文件大小限制 | `project/coding/standards.md` |
| 测试方法 | `project/coding/testing.md` |
| 开发流程 | `project/methodology/sop.md` |
| ATDD/BDD/SDD | `project/methodology/` |
| Skill 设计模式 | `skill/structure.md` |
| Skill 安全 | `skill/security.md` |
| Skill 验证 | `skill/verification.md` |

## 层级关系说明

```
顶层（入口）
├── index.md        ← 规则体系总览
└── superpowers-zh.md ← 技能索引

项目规范
├── rules.md        ← 项目级基础规则
│
├── coding/         ← 编码规范
│   ├── standards.md ← TypeScript 开发标准
│   └── testing.md   ← 测试验证方法
│
└── methodology/    ← 开发方法论
    ├── sop.md       ← 标准化执行工作流（SOP）
    ├── atdd.md      ← 验收测试驱动开发
    ├── bdd.md       ← 行为驱动开发
    └── sdd.md       ← 规格驱动开发

Skill 专用规则
├── structure.md    ← 结构与设计模式
├── security.md     ← 安全与 HITL
├── cross-platform.md ← 跨环境适配
└── verification.md ← 验证规则
```