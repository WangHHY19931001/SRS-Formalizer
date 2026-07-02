/**
 * guided-extract.ts — 交互式逐行 JSONL 提取
 *
 * CLI: npx tsx index.ts guided-extract --template <path> --shard-id <id> --workdir <path>
 *
 * LLM 每次只输出一行 JSON → 脚本验证 → 正确追加，错误反馈重试。
 * 解决一次性输出长 JSONL 易出错的问题（特别是推理模型）。
 *
 * 流程：
 *   1. inject-prompt 填充模板
 *   2. 发送给 LLM（通过 stdin/args 或外部 LLM 调用）
 *   3. 逐行验证 → 正确则追加到输出文件
 *   4. 错误则返回校验失败详情，LLM 重试
 *   5. LLM 输出 DONE 结束
 *
 * 交互协议（LLM 侧）：
 *   - 每次输出一行 JSON（不要换行，不要思考过程）
 *   - 系统回复 "OK" 表示已接受 → 继续下一条
 *   - 系统回复 "ERR: ..." 表示校验失败 → 修正后重新输出
 *   - 所有需求提取完成后输出 "DONE"
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import type { CliResult } from "../types/index.js";
import { safeParseArg, validateWorkDir } from "../lib/cli.js";

// ===================== Validators (3 types) =====================

type ExtractType = "r1" | "r2" | "r3" | "arch";
const VALID_ID_RE = /^R[123]-[A-Za-z0-9_.]+-\d{4}$/;
const VALID_CATEGORIES = ["explicit", "implicit", "relational"];

function validateRequirementLine(
  line: string,
  expectedPrefix: string,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const trimmed = line.trim();
  if (!trimmed) return { valid: false, errors: ["空行"] };
  let record: Record<string, unknown>;
  try {
    record = JSON.parse(trimmed);
  } catch {
    return { valid: false, errors: [`JSON 解析失败: ${trimmed.slice(0, 80)}`] };
  }
  if (typeof record !== "object" || record === null || Array.isArray(record))
    return { valid: false, errors: ["不是 JSON 对象"] };
  if (
    !record.id ||
    !VALID_ID_RE.test(String(record.id)) ||
    !String(record.id).startsWith(expectedPrefix)
  ) {
    errors.push(
      `id 格式: ${String(record.id ?? "缺失")}（须为 ${expectedPrefix}-<TOPIC>-NNNN）`,
    );
  }
  if (!VALID_CATEGORIES.includes(String(record.category ?? "")))
    errors.push(`category: ${String(record.category ?? "缺失")}`);
  if (!record.statement || String(record.statement).trim() === "")
    errors.push("statement 缺失");
  if (!record.source_file) errors.push("source_file 缺失");
  if (!["high", "medium", "low"].includes(String(record.confidence ?? "")))
    errors.push("confidence 非法");
  return { valid: errors.length === 0, errors };
}

function validateArchitectureLine(line: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const trimmed = line.trim();
  if (!trimmed) return { valid: false, errors: ["空行"] };
  let record: Record<string, unknown>;
  try {
    record = JSON.parse(trimmed);
  } catch {
    return { valid: false, errors: [`JSON 解析失败: ${trimmed.slice(0, 80)}`] };
  }
  if (typeof record !== "object" || record === null || Array.isArray(record))
    return { valid: false, errors: ["不是 JSON 对象"] };
  if (!record.name || String(record.name).trim() === "")
    errors.push("name 缺失");
  if (
    !record.type ||
    !["Module", "Actor", "Constraint", "Component", "Interface"].includes(
      String(record.type),
    )
  ) {
    errors.push(
      `type 非法: ${String(record.type ?? "缺失")}（须为 Module|Actor|Constraint|Component|Interface）`,
    );
  }
  if (!record.description || String(record.description).trim() === "")
    errors.push("description 缺失");
  return { valid: errors.length === 0, errors };
}

function validateLine(
  line: string,
  type: ExtractType,
): { valid: boolean; errors: string[] } {
  switch (type) {
    case "r1":
      return validateRequirementLine(line, "R1");
    case "r2":
      return validateRequirementLine(line, "R2");
    case "r3":
      return validateRequirementLine(line, "R3");
    case "arch":
      return validateArchitectureLine(line);
  }
}

// ===================== System Prompts per Type =====================

function guidedSystemPrompt(type: ExtractType): string {
  const reqFormat = (prefix: string) =>
    `{"id":"${prefix}-TOPIC-0001","category":"explicit","statement":"需求描述","source_file":"srs.md","confidence":"high","metadata":{}}`;

  if (type === "arch") {
    return `你是架构分解器。逐行输出 JSONL，每次一行。
格式: {"name":"模块名","type":"Module|Actor|Constraint|Component|Interface","description":"描述","source_file":"srs.md","metadata":{}}
系统回复 OK(已接受) 或 ERR:...(需修正)。完成后输出 DONE。`;
  }
  const prefix = type === "r1" ? "R1" : type === "r2" ? "R2" : "R3";
  return `你是需求提取器。逐行输出 JSONL，每次一行。
格式: ${reqFormat(prefix)}
id: ${prefix}-<TOPIC>-NNNN。category: explicit|implicit|relational。confidence: high|medium|low。
系统回复 OK 或 ERR。完成后输出 DONE。`;
}

/**
 * Generate the guided extraction prompt for the LLM.
 * Returns the filled template wrapped with guided protocol instructions.
 */
export function generateGuidedPrompt(
  filledTemplate: string,
  type: ExtractType = "r1",
): string {
  return `${guidedSystemPrompt(type)}\n\n---\n${filledTemplate}\n---\n\n现在开始逐行输出。只输出 JSON 行，不要思考过程。`;
}

// ===================== Main (used by agent, not standalone) =====================

/**
 * Process a single line from the LLM and return the feedback.
 * If valid, appends to output file and returns "OK".
 * If invalid, returns "ERR: ..." for LLM to retry.
 */
function processLine(
  line: string,
  outputPath: string,
  type: ExtractType = "r1",
): string {
  const trimmed = line.trim();

  // Check for DONE
  if (trimmed.toUpperCase() === "DONE") return "DONE";

  // Validate
  const result = validateLine(trimmed, type);
  if (result.valid) {
    // Ensure directory
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(outputPath, trimmed + "\n", "utf-8");
    return "OK";
  }

  return `ERR: ${result.errors.join("; ")}`;
}

/**
 * Batch process: given a filled template and output path,
 * produce the interactive prompt that an agent can use with the LLM.
 * The agent handles the actual LLM interaction loop.
 */
export async function main(args: string[]): Promise<CliResult> {
  let templatePath: string | null;
  let shardId: string | null;
  let workDirArg: string | null;
  let extractType: string | null;

  try {
    templatePath = safeParseArg(args, "--template");
    shardId = safeParseArg(args, "--shard-id");
    workDirArg = safeParseArg(args, "--workdir");
    extractType = safeParseArg(args, "--type") || "r1";
  } catch (err) {
    return { status: "error", message: (err as Error).message };
  }

  if (!templatePath) return { status: "error", message: "Missing --template" };
  if (!shardId) return { status: "error", message: "Missing --shard-id" };
  if (!workDirArg) return { status: "error", message: "Missing --workdir" };
  if (!["r1", "r2", "r3", "arch"].includes(extractType)) {
    return {
      status: "error",
      message: `Invalid --type: ${extractType}. Must be r1|r2|r3|arch`,
    };
  }
  const etype = extractType as ExtractType;

  let workDir: string;
  try {
    workDir = validateWorkDir(workDirArg);
  } catch (err) {
    return { status: "error", message: (err as Error).message };
  }

  // 1. Fill template via inject-prompt
  let filled: string;
  try {
    const result = execSync(
      `npx tsx index.ts inject-prompt --template ${templatePath} --shard-id ${shardId} --workdir ${workDir} --params '{}'`,
      {
        cwd: path.resolve(__dirname, ".."),
        stdio: "pipe",
        timeout: 30000,
        env: { ...process.env },
      },
    )
      .toString()
      .trim();
    const parsed = JSON.parse(result);
    if (parsed.status !== "ok")
      return {
        status: "error",
        message: `inject-prompt failed: ${parsed.message}`,
      };
    filled = parsed.data as string;
  } catch (err) {
    return {
      status: "error",
      message: `inject-prompt error: ${(err as Error).message}`,
    };
  }

  // 2. Generate guided prompt
  const guidedPrompt = generateGuidedPrompt(filled, etype);

  // Map type to output directory
  const outSubdir =
    etype === "arch"
      ? "architecture"
      : etype === "r2"
        ? "r2-implicit"
        : etype === "r3"
          ? "r3-relational"
          : "r1-explicit";
  const outputPath = path.join(
    workDir,
    "2_extract",
    outSubdir,
    `${shardId}.jsonl`,
  );

  // 3. Return the guided prompt + output path for the agent to use
  return {
    status: "ok",
    data: {
      guided_prompt: guidedPrompt,
      output_path: outputPath,
      shard_id: shardId,
      line_validator: "validateJsonlLine", // function name for the agent to call per line
      instructions:
        'Send guided_prompt to LLM. For each response line, call processLine(line, output_path). If "OK", prompt for next. If "ERR:...", send error back for retry. If "DONE", stop.',
    },
  };
}

// Exported for agent use
export { processLine, validateLine, guidedSystemPrompt };

// Guard
import { refuseDirectInvocation } from "../lib/cli.js";
refuseDirectInvocation(import.meta.url);
