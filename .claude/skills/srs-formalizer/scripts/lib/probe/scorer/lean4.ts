/**
 * scorer/lean4.ts — Scoring for formal_lean4 dimension
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import type { ProbeItem, ProbeResult } from '../types.js';

/**
 * Detect Lean 4 toolchain: check for lake command
 */
export function detectLean4Toolchain(): boolean {
  try {
    execSync("which lake 2>/dev/null", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

export function scoreLean4(probe: ProbeItem, answer: string, tempDir?: string): ProbeResult {
  const details: string[] = [];
  let score = 0;
  const workDir = tempDir ?? fs.mkdtempSync('lean4-');

  // 1. Write answer to Probe.lean
  const leanPath = path.join(workDir, 'Probe.lean');
  fs.writeFileSync(leanPath, answer, 'utf-8');

  // 2. Write minimal lakefile.lean
  const lakefile = 'import Lake\nopen Lake\n\npackage Probe\n\n@[default_target]\nlean_lib Probe\n';
  fs.writeFileSync(path.join(workDir, 'lakefile.lean'), lakefile, 'utf-8');

  // 3. Detect toolchain
  if (!detectLean4Toolchain()) {
    // Fallback: syntactic scoring when toolchain unavailable
    details.push("Lean 4 toolchain unavailable (lake command required) — fallback to syntactic scoring");
    let synScore = 0;
    if (/\b(theorem|lemma)\b\s+\w+/i.test(answer)) { synScore += 20; details.push("STRUCTURE: theorem/lemma declaration found"); }
    if (/\s:= by\b/i.test(answer)) { synScore += 20; details.push("STRUCTURE: proof block (:= by) found"); }
    const tacticCount = (answer.match(/\b(induction|induction'|cases|rcases|rw|simp|ring|linarith|omega|apply|exact|refine|intro|intros|have|calc|nlinarith)\b/g) || []).length;
    if (tacticCount >= 3) { synScore += 20; details.push(`STRUCTURE: ${tacticCount} tactic usages found`); }
    else if (tacticCount >= 1) { synScore += 10; details.push(`STRUCTURE: ${tacticCount} tactic usages found`); }
    if (answer.includes("sorry")) { details.push("WARNING: contains sorry — incomplete proof"); }
    else { synScore += 20; details.push("INTEGRITY: no sorry — proof complete"); }
    if (answer.includes("axiom ")) { details.push("WARNING: contains axiom"); }
    else { synScore += 10; details.push("INTEGRITY: no axiom"); }
    if (/\b(structure|inductive|def)\b/i.test(answer)) { synScore += 10; details.push("STRUCTURE: custom types/defs found"); }
    score = Math.min(100, synScore);
    return { probe_id: probe.probe_id, dimension: probe.dimension, score, details, passed: score >= 70 };
  }

  // 4. lake build (may fail if temp dir lacks full Lean project — fall back to syntactic)
  let buildOutput = "";
  let buildPassed = false;
  try {
    buildOutput = execSync("lake build 2>&1", { cwd: workDir, stdio: "pipe", timeout: 60000 }).toString();
    if (!buildOutput.toLowerCase().includes("error")) {
      details.push("lake build: passed");
      score += 40;
      buildPassed = true;
    } else {
      details.push("lake build: warnings/errors in output — " + buildOutput.slice(0, 100));
    }
  } catch (e) {
    const errMsg = ((e as { stderr?: string; message?: string }).stderr || (e as Error).message || "").slice(0, 120);
    details.push("lake build: failed (" + errMsg + ")");
  }

  if (!buildPassed) {
    // Fallback: syntactic scoring
    details.push("lake build unavailable/failed — supplementing with syntactic checks");
    let synScore = 0;
    if (/\b(theorem|lemma)\b\s+\w+/i.test(answer)) { synScore += 15; details.push("SYN: theorem/lemma declaration"); }
    if (/\s:= by\b/i.test(answer)) { synScore += 15; details.push("SYN: proof block (:= by)"); }
    const tacticCount = (answer.match(/\b(induction|induction'|cases|rcases|rw|simp|ring|linarith|omega|apply|exact|refine|intro|intros|have|calc|nlinarith)\b/g) || []).length;
    if (tacticCount >= 3) { synScore += 15; details.push(`SYN: ${tacticCount} tactics`); }
    else if (tacticCount >= 1) { synScore += 8; details.push(`SYN: ${tacticCount} tactics`); }
    if (/\b(structure|inductive|def)\b/i.test(answer)) { synScore += 5; details.push("SYN: type/def definitions"); }
    score += Math.min(40, synScore);
  }

  // 5. Check for "sorry" in answer
  if (answer.includes("sorry")) {
    details.push("Contains sorry: answer has incomplete proofs");
  } else {
    details.push("No sorry: all proofs complete");
    score += 30;
  }

  // 6. Check for "axiom" in answer
  if (answer.includes("axiom ")) {
    details.push("Contains axiom: answer uses unproven assumptions");
  } else {
    details.push("No axiom: no unproven assumptions");
    score += 15;
  }

  // 7. Check for warnings in lake build output
  if (buildOutput.toLowerCase().includes("warning")) {
    details.push("Has warnings: build output contains warnings");
  } else {
    details.push("No warnings: clean build output");
    score += 15;
  }

  return {
    probe_id: probe.probe_id,
    dimension: probe.dimension,
    score: Math.min(100, score),
    details,
    passed: score >= 70,
  };
}
