---
alwaysApply: true
---

# 项目级基础规则

## 构建与验证命令

*   **Lint**: npm run lint
*   **TypeCheck**: npm run typecheck
*   **Test**: npm run test
*   **Build**: npm run build

## Git 规范

*   **Commit**: 遵循 Conventional Commits
*   **Branch**: feature/*, fix/*, docs/*, refactor/*

## 项目结构

*   代码组织遵循功能模块划分
*   测试文件与源代码文件放在同一目录，以 `.test.ts` 或 `.spec.ts` 结尾
*   配置文件统一放在项目根目录

## 安全规范

*   严禁硬编码敏感信息（密码、密钥等）
*   所有外部依赖需在中国可用