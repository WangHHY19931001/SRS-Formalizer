/**
 * validate-architecture.ts — 架构 JSONL 文件校验命令
 *
 * CLI: npx tsx index.ts validate-architecture --file <path> --workdir .srs_formalizer
 *
 * 校验 arch JSONL 记录（arch-1/arch-2/arch-3 通用），执行 6 项检查：
 *   1. type 必须为 module|actor|constraint（arch-1）/ action 必须为枚举值（arch-2/arch-3）
 *   2. id 格式：arch-1=ARCH-SXXX-NNNN, arch-2=ARCH2-SXXX-NNNN, arch-3=ARCH3-SXXX-NNNN
 *   3. contains 引用的 R1/R2 id 格式必须匹配 ^R[12]-[A-Za-z0-9_.]+-\d{4}$
 *   4. parent 非 null 时，必须能在同文件中找到对应的父模块名
 *   5. 检测循环：CONTAINS 关系不能形成环
 *   6. 每条必须含 reasoning 字段（长度 >=10）
 *
 * 输出：{"status":"ok","data":{"valid":true/false,"errors":[...],"warnings":[...],"record_count":N}}
 */
import type { CliResult } from '../types/index.js';
export declare function main(args: string[]): Promise<CliResult>;
