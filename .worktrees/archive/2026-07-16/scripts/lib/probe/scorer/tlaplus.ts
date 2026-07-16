/**
 * scorer/tlaplus.ts — Scoring for formal_tlaplus dimension
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { ProbeItem, ProbeResult } from '../types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOOLS_DIR = path.resolve(__dirname, '..', '..', '..', '..', 'tools');
const BUILTIN_JAR = path.join(TOOLS_DIR, 'tla2tools-1.7.4.jar');
const LATEST_JAR = path.join(TOOLS_DIR, 'tla2tools.jar');

/** Resolve the TLA+ tools JAR or throw. */
function findJar(): string {
  if (fs.existsSync(LATEST_JAR)) return LATEST_JAR;
  if (fs.existsSync(BUILTIN_JAR)) return BUILTIN_JAR;
  throw new Error('tla2tools.jar not found');
}

/**
 * Detect TLA+ toolchain: need java + tla2tools.jar (built-in or downloaded)
 */
export function detectTlaPlusToolchain(): boolean {
  try {
    execSync("java -version 2>&1", { stdio: "pipe" });
  } catch {
    return false;
  }
  try {
    findJar();
    return true;
  } catch {
    return false;
  }
}

export function scoreTlaPlus(probe: ProbeItem, answer: string, tempDir?: string): ProbeResult {
  const details: string[] = [];
  let score = 0;
  const workDir = tempDir ?? fs.mkdtempSync('tlaplus-');

  // 1. Write answer to probe.tla
  const tlaPath = path.join(workDir, 'probe.tla');
  fs.writeFileSync(tlaPath, answer, "utf-8");

  // Resolve JAR path (may throw if missing, handled by toolchain check below)
  let jarPath: string;
  try { jarPath = findJar(); } catch { jarPath = 'tla2tools.jar'; }

  // 2. Detect toolchain
  if (!detectTlaPlusToolchain()) {
    // Fallback: syntactic scoring when toolchain unavailable
    details.push("TLA+ toolchain unavailable (java + tla2tools.jar required) — fallback to syntactic scoring");
    let synScore = 0;
    if (/----\s*MODULE\s+\w+/i.test(answer)) { synScore += 15; details.push("STRUCTURE: MODULE header found"); }
    if (/EXTENDS\s+/i.test(answer)) { synScore += 10; details.push("STRUCTURE: EXTENDS found"); }
    if (/VARIABLE\S*\s+\w+/i.test(answer)) { synScore += 15; details.push("STRUCTURE: VARIABLE declaration found"); }
    if (/Init\s*==/i.test(answer)) { synScore += 20; details.push("SPEC: Init definition found"); }
    if (/Next\s*==/i.test(answer)) { synScore += 20; details.push("SPEC: Next definition found"); }
    if (/Spec\s*==/i.test(answer)) { synScore += 10; details.push("SPEC: Spec definition found"); }
    if (/TypeInvariant|INVARIANT/i.test(answer)) { synScore += 10; details.push("SAFETY: invariant defined"); }
    score = Math.min(100, synScore);
    return { probe_id: probe.probe_id, dimension: probe.dimension, score, details, passed: score >= 70 };
  }

  // 3. Run SANY
  try {
    execSync(`java -cp "${jarPath}" tla2sany.SANY probe.tla`, { cwd: workDir, stdio: "pipe" });
    details.push("SANY: syntax check passed");
    score += 30;
  } catch {
    details.push("SANY: syntax error");
    return { probe_id: probe.probe_id, dimension: probe.dimension, score, details, passed: false };
  }

  // 4. Run TLC
  try {
    execSync(`java -cp "${jarPath}" tlc2.TLC probe.tla`, { cwd: workDir, stdio: "pipe", timeout: 30000 });
    details.push("TLC: model check passed");
    score += 40;
  } catch {
    details.push("TLC: model check failed or timeout");
    return { probe_id: probe.probe_id, dimension: probe.dimension, score, details, passed: false };
  }

  // 5. Mutation test: inject a known bug into the invariant and verify TLC catches it
  let mutationScore = 0;
  if (answer.includes("INVARIANT")) {
    try {
      const mutated = answer.replace(/INVARIANT\s+\w+/g, "INVARIANT FALSE");
      fs.writeFileSync(tlaPath, mutated, "utf-8");
      try {
        execSync(`java -cp "${jarPath}" tlc2.TLC probe.tla`, { cwd: workDir, stdio: "pipe", timeout: 15000 });
        details.push("Mutation test: TLC passed with FALSE invariant (no effect)");
        mutationScore = 0;
      } catch {
        details.push("Mutation test: invariant caught injected bug");
        mutationScore = 30;
      }
    } catch {
      details.push("Mutation test: could not mutate spec");
      mutationScore = 0;
    }
    // Restore original spec
    fs.writeFileSync(tlaPath, answer, "utf-8");
  } else {
    details.push("Mutation test: no INVARIANT found to mutate");
    mutationScore = 0;
  }
  score += mutationScore;

  return {
    probe_id: probe.probe_id,
    dimension: probe.dimension,
    score: Math.min(100, score),
    details,
    passed: score >= 70,
  };
}
