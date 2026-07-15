# SRS-Formalizer Examples

This directory contains example SRS documents and walkthroughs to help you get started quickly.

## Available Examples

| File | Language | Domain | Description |
|------|----------|--------|-------------|
| [online-store-srs.md](online-store-srs.md) | Chinese (bilingual headers) | E-Commerce | Complete online shopping system SRS with functional/non-functional requirements |
| [end-to-end-walkthrough.md](end-to-end-walkthrough.md) | English | — | Step-by-step guide for the complete formalization pipeline |

## Quick Start

```bash
# Navigate to scripts directory
cd .claude/skills/srs-formalizer/scripts

# First, check your environment
npx tsx index.ts health-check

# Run pipeline on the example SRS (first pass: init + manifest)
npx tsx index.ts pipeline \
  --src ../examples/online-store-srs.md \
  --lang zh \
  --workdir .srs_formalizer

# After guided-extract completes (requires AI agent), continue:
npx tsx index.ts pipeline --skip-init --workdir .srs_formalizer --strict
```

## What to Expect

1. **First run**: Initializes workdir and parses SRS → stops at guided-extract (needs LLM)
2. **After extraction**: Builds IR, runs analysis, emits all draft artifacts
3. **With --strict**: Runs BDD validation and R3 verification gate

For complete TLA+/Lean validation and FINAL gate, follow the [end-to-end walkthrough](end-to-end-walkthrough.md).

## Creating Your Own SRS

Your SRS documents should follow these conventions for best results:

1. Use numbered sections (§1, §2, §3.1, etc.)
2. Include a glossary/terminology table early in the document
3. Separate functional (FR) and non-functional requirements (NFR)
4. Use clear, measurable language for NFRs (e.g., "response time < 200ms")
5. Include business rules and constraints explicitly
