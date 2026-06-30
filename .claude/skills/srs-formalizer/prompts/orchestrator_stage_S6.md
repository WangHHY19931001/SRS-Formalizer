# S6 编排者指令：验收闸门

1. verify-gate --stage FINAL
2. validate-bdd --workdir .srs_formalizer
3. query-graph --query export-brainstorm
4. 校验者子代理最终语义审查
5. 更新 MINDMAP.md 全部模块为 ✅
6. 输出最终交付物清单
