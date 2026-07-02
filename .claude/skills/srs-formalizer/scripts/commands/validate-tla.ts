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
import type { CliResult } from "../types/index.js";
import { safeParseArg } from "../lib/cli.js";

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
  let workDirArg: string | null;
  try {
    fileArg = safeParseArg(args, "--file");
    workDirArg = safeParseArg(args, "--workdir");
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

  // TLC model check (if .cfg exists or create minimal)
  const cfgPath = fileArg.replace(/\.tla$/, ".cfg");
  if (!fs.existsSync(cfgPath)) {
    const specName = path.basename(fileArg, ".tla");
    const dir = path.dirname(fileArg);
    fs.writeFileSync(cfgPath, `SPECIFICATION ${specName}\nINVARIANT TypeOK\n`, "utf-8");
  }

  let tlcResult = "";
  try {
    tlcResult = execSync(`java -cp "${jar}" tlc2.TLC -config "${cfgPath}" "${fileArg}"`, {
      stdio: "pipe",
      encoding: "utf-8",
      timeout: 120000,
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string };
    return {
      status: "error",
      message: "TLC model check failed",
      data: {
        stage: "tlc",
        sany: sanyResult.slice(0, 500),
        jar_version: jarVersion,
        output: err.stdout?.toString() || err.stderr?.toString() || String(e),
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
