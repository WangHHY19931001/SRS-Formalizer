/**
 * validate-bdd.ts -- 校验 Gherkin BDD 文件 (SRS §5.12)
 *
 * CLI: npx tsx index.ts validate-bdd --workdir .srs_formalizer
 *
 * 遍历 features/ 下所有 .feature 文件，调用 lib/bdd.ts 的 validateFeature
 * 逐文件校验并汇总结果。
 *
 * 输出格式: {"status":"ok","data":{"valid":true/false,"errors":[...],"warnings":[...]}}
 */
import type { CliResult } from '../types/index.js';
export declare function main(args: string[]): Promise<CliResult>;
