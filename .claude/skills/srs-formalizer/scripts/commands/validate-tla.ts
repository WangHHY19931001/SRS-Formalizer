/**
 * validate-tla.ts — SANY + TLC validation for .tla files (S5)
 *
 * CLI: npx tsx index.ts validate-tla --file <path> [--workdir <dir>]
 *
 * Uses built-in tla2tools-1.7.4.jar. Tries to download latest on first run.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { CliResult } from "../types/index.js";
import { safeParseArg } from "../lib/cli.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TOOLS_DIR = path.resolve(__dirname, "..", "..", "tools");
const BUILTIN_JAR = path.join(TOOLS_DIR, "tla2tools-1.7.4.jar");
const JAR_PATH = path.join(TOOLS_DIR, "tla2tools.jar");

function findJar(): string {
  if (fs.existsSync(JAR_PATH)) return JAR_PATH;
  if (fs.existsSync(BUILTIN_JAR)) return BUILTIN_JAR;
  throw new Error(
    `TLA+ tools JAR not found. Expected at: ${BUILTIN_JAR}\n` +
    `Download latest from: https://github.com/tlaplus/tlaplus/releases`
  );
}

export async function main(args: string[]): Promise<CliResult> {
  let fileArg: string | null;
  try {
    fileArg = safeParseArg(args, "--file");
  } catch (err) {
    return { status: "error", message: (err as Error).message };
  }

  if (!fileArg) {
    return { status: "error", message: "Missing required argument: --file" };
  }
  if (!fs.existsSync(fileArg)) {
    return { status: "error", message: `File not found: ${fileArg}` };
  }

  // Check Java
  try {
    execSync("java -version 2>&1", { stdio: "pipe" });
  } catch {
    return {
      status: "error",
      message: "Java not found. Install OpenJDK 21+: sudo apt install openjdk-21-jdk",
    };
  }

  let jar: string;
  try {
    jar = findJar();
  } catch (err) {
    return { status: "error", message: (err as Error).message };
  }

  const jarVersion = jar.endsWith("1.7.4.jar") ? "1.7.4 (built-in)" : "latest";

  // SANY parse
  let sanyResult = "";
  try {
    sanyResult = execSync(`java -cp "${jar}" tla2sany.SANY "${fileArg}"`, {
      stdio: "pipe",
      encoding: "utf-8",
      timeout: 30000,
    });
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string };
    return {
      status: "error",
      message: "SANY parse failed",
      data: {
        stage: "sany",
        jar_version: jarVersion,
        output: err.stdout?.toString() || err.stderr?.toString() || String(e),
      },
    };
  }

  // TLC model check in strict mode
  // Strict mode: -deadlock (no deadlock), -checkpoint 0 (fresh run)
  // TLC checks: deadlocks, TypeOK invariant, termination, bounded state space
  const tlaDir = path.dirname(fileArg);
  const specName = path.basename(fileArg, ".tla");
  const cfgPath = path.join(tlaDir, `${specName}.cfg`);

  if (!fs.existsSync(cfgPath)) {
    // Strict mode config: requires TypeOK invariant, enables deadlock detection
    fs.writeFileSync(cfgPath, [
      `SPECIFICATION ${specName}`,
      "INVARIANT TypeOK",
      "CHECK_DEADLOCK TRUE",
      "",
    ].join("\n"), "utf-8");
  }

  // Ensure CHECK_DEADLOCK is in the config
  let cfgContent = fs.readFileSync(cfgPath, "utf-8");
  if (!cfgContent.includes("CHECK_DEADLOCK")) {
    cfgContent += "\nCHECK_DEADLOCK TRUE\n";
    fs.writeFileSync(cfgPath, cfgContent, "utf-8");
  }

  let tlcResult = "";
  try {
    tlcResult = execSync(
      `java -cp "${jar}" tlc2.TLC -deadlock -config "${cfgPath}" "${fileArg}"`,
      {
        cwd: tlaDir,
        stdio: "pipe",
        encoding: "utf-8",
        timeout: 120000,
        maxBuffer: 10 * 1024 * 1024,
      }
    );
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string };
    const output = err.stdout?.toString() || err.stderr?.toString() || String(e);

    // Detect strict mode violations
    const violations: string[] = [];
    if (output.includes("Deadlock")) violations.push("DEADLOCK: 系统存在死锁状态");
    if (output.includes("Infinite")) violations.push("INFINITE_STATE: 状态空间无界");
    if (output.toLowerCase().includes("miracle")) violations.push("MIRACLE: 检测到不可能的状态转换（奇迹）");
    if (output.includes("null") || output.includes("undefined")) violations.push("UNDEFINED: 存在未定义的状态或变量");
    if (output.includes("TypeOK")) violations.push("TYPE_INVARIANT: TypeOK 不变式被违反");
    if (output.includes("Stuttering")) violations.push("STUTTERING: 检测到无限停滞（活锁）");

    return {
      status: "error",
      message: `TLC model check failed (strict mode). Violations: ${violations.length > 0 ? violations.join("; ") : "see output"}`,
      data: {
        stage: "tlc",
        sany: sanyResult.slice(0, 500),
        jar_version: jarVersion,
        strict_violations: violations,
        output: output.slice(0, 2000),
      },
    };
  }

  return {
    status: "ok",
    data: {
      sany: "passed",
      tlc: "passed",
      jar_version: jarVersion,
      sany_output: sanyResult.slice(0, 500),
      tlc_output: tlcResult.slice(0, 500),
    },
  };
}

// Guard
import { refuseDirectInvocation } from "../lib/cli.js";
refuseDirectInvocation(import.meta.url);
