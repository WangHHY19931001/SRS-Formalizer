/**
 * inject-prompt.ts — 模板注入命令
 *
 * CLI: npx tsx index.ts inject-prompt --template <path> --params <json>
 *
 * 将模板中的 {{KEY}} 替换为实际值，用户输入中的 {{}} 不会被二次处理
 * （替换已知 key 后，任何剩余的 {{}} 都是用户输入，不再处理）。
 *
 * 安全约束：
 *   - 模板路径的 dirname 必须以 "prompts" 结尾
 *   - 纯字符串替换，无文件写入副作用
 *   - stdout 输出 JSON 结果
 */
import type { CliResult } from '../types/index.js';
export declare function main(args: string[]): Promise<CliResult>;
