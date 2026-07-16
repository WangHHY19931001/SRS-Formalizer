/**
 * guided-extract.ts — 逐行 JSONL 提取（双模式）
 *
 * 模式一（生成提示词）:
 *   npx tsx index.ts guided-extract --template <path> --shard-id <id> --type r1 --workdir <path>
 *   返回 filled template + guided system prompt，由 agent 发给 LLM。
 *
 * 模式二（处理单行，agent 可直接调用）:
 *   npx tsx index.ts guided-extract --line '<json>' --shard-id <id> --type r1 --workdir <path>
 *   校验单行 JSON，合法则追加到输出文件，返回 "OK" / "ERR: ..." / "DONE"。
 *   agent 用 run_command 逐行调用，无需交互式 I/O。
 *
 * LLM 协议不变：
 *   - 每次输出一行 JSON
 *   - OK → 继续下一条
 *   - ERR → 修正后重试
 *   - DONE → 结束
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import type { CliResult } from "../types/index.js";
import { safeParseArg, validateWorkDir } from "../lib/cli.js";
import { validateR3CrossLine, validateR4NFRLine } from "../lib/frontend/extract-validators.js";

type ExtractType = "r1" | "r2" | "r3" | "r3-cross" | "r4-nfr" | "arch";
const VALID_ID_RE = /^R(?:[123]|3C|4N)-[A-Za-z0-9_.]+-\d{4}$/;
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
    !["Module", "Actor", "Constraint", "Component", "Interface", "module", "actor", "constraint", "component", "interface"].includes(
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
    case "r3-cross":
      return validateR3CrossLine(line);
    case "r4-nfr":
      return validateR4NFRLine(line);
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
  if (type === "r3-cross") {
    return `你是跨文件关系提取器。逐行输出 JSONL，每次一行。
格式: {"id":"R3C-TOPIC-0001","category":"relational","statement":"关系描述","source_file":"srs.md","confidence":"high","metadata":{"cross_shard_refs":["shard-1","shard-2"],"relation":{"type":"DEPENDS_ON","target":"R1-OTHER-0001"}}}
系统回复 OK 或 ERR。完成后输出 DONE。`;
  }
  if (type === "r4-nfr") {
    return `你是 NFR 提取器。逐行输出 JSONL，每次一行。
格式: {"id":"R4N-PERF-0001","category":"explicit","statement":"非功能需求描述","source_file":"srs.md","confidence":"high","metadata":{"nfrCategory":"performance","nfrThreshold":{"metric":"response_time","value":200,"unit":"ms","operator":"<="}}}
nfrCategory: performance|security|availability|compatibility|maintainability|compliance。
系统回复 OK 或 ERR。完成后输出 DONE。`;
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
 * Resolve the output path for a given shard ID and extract type.
 */
function resolveOutputPath(workDir: string, shardId: string, etype: ExtractType): string {
  const outSubdir =
    etype === "arch"
      ? "architecture"
      : etype === "r2"
        ? "r2-implicit"
        : etype === "r3"
          ? "r3-relational"
          : etype === "r3-cross"
            ? "r3-cross"
            : etype === "r4-nfr"
              ? "r4-nfr"
              : "r1-explicit";
  return path.join(workDir, "2_extract", outSubdir, `${shardId}.jsonl`);
}

const VALID_TYPES = ["r1", "r2", "r3", "r3-cross", "r4-nfr", "arch"];

/** Dual-mode entry: --template for prompt gen (Mode A) or --line for validation (Mode B). */
export async function main(args: string[]): Promise<CliResult> {
  let templatePath: string | null;
  let shardId: string | null;
  let workDirArg: string | null;
  let extractType: string | null;
  let lineInput: string | null;

  try {
    templatePath = safeParseArg(args, "--template");
    shardId = safeParseArg(args, "--shard-id");
    workDirArg = safeParseArg(args, "--workdir");
    extractType = safeParseArg(args, "--type") || "r1";
    lineInput = safeParseArg(args, "--line");
  } catch (err) {
    return { status: "error", message: (err as Error).message };
  }

  // ── Mode B: process a single line ──
  if (lineInput !== null) {
    if (!shardId) return { status: "error", message: "Missing --shard-id" };
    if (!workDirArg) return { status: "error", message: "Missing --workdir" };
    if (!VALID_TYPES.includes(extractType)) {
      return { status: "error", message: `Invalid --type: ${extractType}. Must be ${VALID_TYPES.join("|")}` };
    }
    const etype = extractType as ExtractType;

    let workDir: string;
    try { workDir = validateWorkDir(workDirArg); } catch (err) { return { status: "error", message: (err as Error).message }; }

    const outputPath = resolveOutputPath(workDir, shardId, etype);
    const feedback = processLine(lineInput, outputPath, etype);
    return { status: "ok", data: feedback };
  }

  // ── Mode A: generate guided prompt ──
  if (!templatePath) return { status: "error", message: "Missing --template" };
  if (!shardId) return { status: "error", message: "Missing --shard-id" };
  if (!workDirArg) return { status: "error", message: "Missing --workdir" };
  if (!VALID_TYPES.includes(extractType)) {
    return { status: "error", message: `Invalid --type: ${extractType}. Must be ${VALID_TYPES.join("|")}` };
  }
  const etype = extractType as ExtractType;

  let workDir: string;
  try { workDir = validateWorkDir(workDirArg); } catch (err) { return { status: "error", message: (err as Error).message }; }

  // 1. Fill template via inject-prompt
  let filled: string;
  try {
    const result = execSync(
      `npx tsx index.ts inject-prompt --template ${templatePath} --shard-id ${shardId} --workdir ${workDir} --params '{}'`,
      { cwd: path.dirname(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?=\w:)/, ''))), stdio: "pipe", timeout: 30000, env: { ...process.env } },
    ).toString().trim();
    const parsed = JSON.parse(result);
    if (parsed.status !== "ok") return { status: "error", message: `inject-prompt failed: ${parsed.message}` };
    filled = parsed.data as string;
  } catch (err) {
    return { status: "error", message: `inject-prompt error: ${(err as Error).message}` };
  }

  // 2. Generate guided prompt
  const guidedPrompt = generateGuidedPrompt(filled, etype);
  const outputPath = resolveOutputPath(workDir, shardId, etype);

  return {
    status: "ok",
    data: {
      guided_prompt: guidedPrompt,
      output_path: outputPath,
      shard_id: shardId,
      type: etype,
      usage: `Send guided_prompt to LLM. For each LLM output line, call:
  npx tsx index.ts guided-extract --line '<json>' --shard-id ${shardId} --type ${etype} --workdir ${workDirArg}
Response: "OK" (appended) / "ERR: ..." (retry) / "DONE" (complete).`,
    },
  };
}

// Exported for agent use
export { processLine, validateLine, guidedSystemPrompt };

// Guard
import { refuseDirectInvocation } from "../lib/cli.js";
refuseDirectInvocation(import.meta.url);
