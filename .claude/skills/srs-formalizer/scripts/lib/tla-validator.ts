/**
 * tla-validator.ts — TLA+ SANY parser + TLC model checker runner
 *
 * Uses the built-in tla2tools.jar in ../../tools/.
 * Tries to download the latest version on first run; falls back to built-in.
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOOLS_DIR = path.resolve(__dirname, "..", "..", "tools");
const BUILTIN_JAR = path.join(TOOLS_DIR, "tla2tools-1.7.4.jar");
const LATEST_JAR = path.join(TOOLS_DIR, "tla2tools.jar");
const TLA_RELEASES_URL = "https://github.com/tlaplus/tlaplus/releases";

/** Ensure Java is available. */
function checkJava(): string {
  try {
    const out = execSync("java -version 2>&1", { stdio: "pipe", encoding: "utf-8" });
    const match = out.match(/(?:openjdk|java) version "([\d.]+)/);
    if (match) return match[1]!;
    return "unknown";
  } catch {
    throw new Error(
      "Java not found. Install OpenJDK 21+: sudo apt install openjdk-21-jdk (Linux) or brew install openjdk (macOS)"
    );
  }
}

/** Try to download the latest tla2tools.jar. Returns path to use. */
async function ensureJar(): Promise<string> {
  // Use built-in as immediate fallback
  if (!fs.existsSync(LATEST_JAR)) {
    try {
      // Attempt to fetch latest release info
      const apiResp = await fetch(
        "https://api.github.com/repos/tlaplus/tlaplus/releases/latest",
        { signal: AbortSignal.timeout(10000) }
      );
      if (apiResp.ok) {
        const release = (await apiResp.json()) as { tag_name: string; assets: Array<{ browser_download_url: string }> };
        const jarAsset = release.assets.find((a) => a.browser_download_url.endsWith(".jar"));
        if (jarAsset) {
          const jarResp = await fetch(jarAsset.browser_download_url, { signal: AbortSignal.timeout(120000) });
          if (jarResp.ok) {
            const buffer = Buffer.from(await jarResp.arrayBuffer());
            fs.writeFileSync(LATEST_JAR, buffer);
            return LATEST_JAR;
          }
        }
      }
    } catch {
      // Download failed — use built-in
    }
  }
  if (fs.existsSync(LATEST_JAR)) return LATEST_JAR;
  if (fs.existsSync(BUILTIN_JAR)) return BUILTIN_JAR;
  throw new Error(
    `TLA+ tools JAR not found. Expected at: ${BUILTIN_JAR}\n` +
    `Download from: ${TLA_RELEASES_URL}`
  );
}

/** Run SANY parser on a .tla file. Returns stdout or throws on parse errors. */
export async function sanyCheck(tlaFile: string): Promise<string> {
  checkJava();
  const jar = await ensureJar();

  const result = execSync(`java -cp "${jar}" tla2sany.SANY "${tlaFile}"`, {
    cwd: path.dirname(tlaFile),
    stdio: "pipe",
    encoding: "utf-8",
    timeout: 30000,
  });
  return result;
}

/** Run TLC model checker on a .tla file. Returns stdout with model checking results. */
export async function tlcCheck(tlaFile: string, configFile?: string): Promise<string> {
  checkJava();
  const jar = await ensureJar();

  const cfg = configFile || tlaFile.replace(/\.tla$/, ".cfg");
  if (!fs.existsSync(cfg)) {
    // Create a minimal config if none exists
    const specName = path.basename(tlaFile, ".tla");
    fs.writeFileSync(cfg, [
      `SPECIFICATION ${specName}`,
      `INVARIANT TypeOK`,
      "",
    ].join("\n"), "utf-8");
  }

  const result = execSync(`java -cp "${jar}" tlc2.TLC -config "${cfg}" "${tlaFile}"`, {
    cwd: path.dirname(tlaFile),
    stdio: "pipe",
    encoding: "utf-8",
    timeout: 60000,
    maxBuffer: 10 * 1024 * 1024,
  });
  return result;
}

/** Full validation: SANY → TLC. Returns {status, sany_output, tlc_output}. */
export async function validateTla(tlaFile: string): Promise<{
  status: "ok" | "error";
  sany_output: string;
  tlc_output: string;
  jar_version: string;
  java_version: string;
}> {
  const javaVersion = checkJava();

  let sanyOutput = "";
  let tlcOutput = "";

  try {
    sanyOutput = await sanyCheck(tlaFile);
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    sanyOutput = err.stdout?.toString() || err.stderr?.toString() || err.message || "SANY error";
    return { status: "error", sany_output: sanyOutput, tlc_output: "", jar_version: "1.7.4+", java_version: javaVersion };
  }

  try {
    tlcOutput = await tlcCheck(tlaFile);
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    tlcOutput = err.stdout?.toString() || err.stderr?.toString() || err.message || "TLC error";
    return { status: "error", sany_output: sanyOutput, tlc_output: tlcOutput, jar_version: "1.7.4+", java_version: javaVersion };
  }

  return { status: "ok", sany_output: sanyOutput, tlc_output: tlcOutput, jar_version: "1.7.4+", java_version: javaVersion };
}
