/**
 * validate-lean.ts — Lean 4 proof validation (S5)
 *
 * CLI: npx tsx index.ts validate-lean --file <path>
 *
 * Platform restrictions:
 *   ✅ Linux x86_64 (lean + lake available via elan)
 *   ✅ macOS ARM64 (lean + lake available via elan)
 *   ❌ Windows (no convenient Lean 4 distribution)
 */

import * as fs from "node:fs";
import * as os from "node:os";
import { execSync } from "node:child_process";
import type { CliResult } from "../types/index.js";
import { safeParseArg } from "../lib/cli.js";

function checkPlatform(): string | null {
  const platform = os.platform();
  const arch = os.arch();

  if (platform === "win32") {
    return "Windows is not supported for Lean 4. Use Linux x86_64 or macOS ARM64.";
  }
  if (platform === "linux" && arch !== "x64") {
    return `Linux ${arch} is not supported. Lean 4 requires x86_64 on Linux.`;
  }
  if (platform === "darwin" && arch !== "arm64") {
    return `macOS ${arch} is not supported. Lean 4 requires Apple Silicon (ARM64) on macOS.`;
  }
  return null; // supported
}

export async function main(args: string[]): Promise<CliResult> {
  // Platform gate
  const platformError = checkPlatform();
  if (platformError) {
    return { status: "error", message: platformError };
  }

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

  // Check lake is available
  try {
    execSync("lake --version 2>&1", { stdio: "pipe" });
  } catch {
    return {
      status: "error",
      message:
        "Lean 4 (lake) not found. Install from: https://github.com/leanprover/elan\n" +
        "  Linux:   curl https://raw.githubusercontent.com/leanprover/elan/master/elan-init.sh -sSf | sh -s -- -y\n" +
        "  macOS:   curl https://raw.githubusercontent.com/leanprover/elan/master/elan-init.sh -sSf | sh -s -- -y",
    };
  }

  // Find the Lean project root (look for lakefile.lean upward)
  let projectDir = fileArg;
  const stat = fs.statSync(fileArg);
  if (stat.isFile()) {
    projectDir = fileArg.substring(0, fileArg.lastIndexOf("/"));
  }

  // Search upward for lakefile.lean
  let searchDir = projectDir;
  while (searchDir !== "/" && searchDir !== ".") {
    if (fs.existsSync(`${searchDir}/lakefile.lean`) || fs.existsSync(`${searchDir}/lakefile.toml`)) {
      projectDir = searchDir;
      break;
    }
    searchDir = searchDir.substring(0, searchDir.lastIndexOf("/"));
  }

  // Run lake build
  try {
    const output = execSync("lake build 2>&1", {
      cwd: projectDir,
      stdio: "pipe",
      encoding: "utf-8",
      timeout: 120000,
      maxBuffer: 10 * 1024 * 1024,
    });
    return {
      status: "ok",
      data: {
        platform: `${os.platform()}-${os.arch()}`,
        project_dir: projectDir,
        output: output.slice(0, 1000),
      },
    };
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string };
    return {
      status: "error",
      message: "lake build failed",
      data: {
        platform: `${os.platform()}-${os.arch()}`,
        project_dir: projectDir,
        output: err.stdout?.toString() || err.stderr?.toString() || String(e),
      },
    };
  }
}

// Guard
import { refuseDirectInvocation } from "../lib/cli.js";
refuseDirectInvocation(import.meta.url);
