# ADR-0005: One-Shot Pipeline with Session Persistence

| Status | Date | Author |
|:------:|:----:|:------:|
| Accepted | 2026-07-16 | SRS-Formalizer Team |

## Context

Issues #11 and #14 requested a more streamlined user experience:
- Users had to run 8+ separate commands for a complete formalization
- AI agents had to orchestrate multiple commands manually, increasing error rates
- No way to resume a paused pipeline (e.g., after guided-extract requires human/agent input)
- The validation flow (validate + promote + verify-gate) was cumbersome and error-prone

The previous workflow required: init → manifest → guided-extract → build-ir → tag-nfr → check-connectivity → score-risk → emit → validate-bdd → verify-gate (10 commands minimum).

## Decision

Implement a unified `pipeline` command that:

1. **Orchestrates all stages** automatically:
   - `init` → `manifest` → (pause for guided-extract) → `build-ir` → Middle-end passes → `emit` → (optional auto-validation)

2. **Session persistence** via `_ctx/session.json`:
   - Records current step, step statuses, next actions
   - `--skip-init` flag resumes from last saved state
   - Enables multi-turn conversations with AI agents

3. **Three execution modes**:
   - Default: Runs through emit, pauses for manual validation
   - `--auto-validate`: Runs BDD validation + R3 gate after emit
   - `--strict`: Full strict validation (alias for auto-validate)
   - `--full`: Complete mode with detailed progress, recovery hints, and all validations

4. **Complete Middle-end pass execution**:
   - Includes `analyze-structure` and `analyze-graph` (previously missing from auto-pipeline)
   - Non-blocking warnings for analysis steps (structure/graph issues are warnings, not hard errors)

5. **Enhanced reporting**:
   - Per-step timing via `ProgressReporter`
   - Resource usage metrics (memory) in report
   - Next actions clearly listed after pause/completion
   - Recovery hints for failed steps

## Consequences

### Positive
- 90% reduction in commands users need to remember (1 command vs 10+)
- AI agents can drive the entire workflow with minimal orchestration
- Resumable sessions prevent lost work when pausing for guided-extract
- Better error recovery with context-specific hints
- Consistent progress reporting across all stages

### Negative
- Larger command file (~290 lines, approaching the 300-line limit)
- Slightly more complex logic to handle pause/resume
- Session state requires careful versioning for future changes

### Risks/Mitigations
- **Risk**: Session state format changes breaking resume → Mitigation: Add version field to session.json, handle older formats gracefully
- **Risk**: Auto-validation giving false sense of completeness → Mitigation: TLA+/Lean validation still require manual module naming; R3/FINAL gates enforce completeness
- **Risk**: Non-blocking analysis passes hiding critical issues → Mitigation: Analysis warnings are still reported; `--strict` mode enforces stricter checks

## Alternatives Considered

| Alternative | Pros | Cons | Reason for Rejection |
|------------|------|------|---------------------|
| Keep separate commands | Maximum flexibility, simplest code | Poor UX, high learning curve, agent-unfriendly | Does not address issues #11, #14 |
| Makefile/shell script wrapper | Simple to implement | Platform-dependent (Windows issues), doesn't integrate with session state, hard to pass structured data | Doesn't solve multi-turn/resume needs |
| Config-file driven pipeline | Declarative, flexible | More complex to implement initially, overkill for v1 | Can be added later as extension |
| Full auto-pipeline without pauses | Simplest code path | guided-extract requires LLM/HITL; can't be fully automated | Guided-extract is inherently interactive |

## Related Documents

- [DESIGN.md](../DESIGN.md) §3 Compiler Pipeline
- [Issue #11](https://github.com/WangHHY19931001/SRS-Formalizer/issues/11) - CLI & UX (P0: one-click pipeline)
- [Issue #14](https://github.com/WangHHY19931001/SRS-Formalizer/issues/14) - Agent experience (multi-turn support)
- [commands/pipeline.ts](../../.claude/skills/srs-formalizer/scripts/commands/pipeline.ts)
