# Project Rules

## 构建与验证命令
*   **Lint**: npm run lint
*   **TypeCheck**: npm run typecheck
*   **Test**: npm run test
*   **Build**: npm run build

## TypeScript 运行方式
*   **单文件执行**: 优先使用 `npx tsx` 直接运行 TypeScript 文件
*   **项目级命令**: 构建、测试、lint 等仍通过 `npm run` 脚本入口执行

## 代码规范
*   **函数注释**: 必须添加函数级注释
*   **语言**: 中文注释，英文技术术语
*   **类型**: 严格 TypeScript 模式，禁止使用 `any`
*   **静态检查**: 所有静态检查问题（lint + typecheck）必须修正，零容忍
*   **格式**: 统一使用 Prettier 格式化

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

## 验证策略
*   修改代码后必须运行相关测试
*   提交代码前必须通过 lint 和 typecheck
*   优先修复代码而非修改测试用例
*   静态检查问题与测试失败同等严重，不得以任何理由跳过或降级处理