# Architecture Decision Records (ADR)

This directory contains Architecture Decision Records for the SRS-Formalizer project.

## What is an ADR?

An Architecture Decision Record (ADR) is a short document that captures an important architectural decision made along with its context and consequences.

## Format

Each ADR follows the template in [0000-template.md](0000-template.md):
- **Numbered sequentially** starting from 0001
- **Title**: Short descriptive title
- **Status**: Proposed, Accepted, Deprecated, or Superseded
- **Context**: Why this decision was needed
- **Decision**: What we decided
- **Consequences**: Positive, negative, risks
- **Alternatives Considered**: Other options we evaluated

## Index

| ADR | Title | Status | Date |
|-----|-------|:------:|:----:|
| 0001 | Compiler Three-Stage Architecture | Accepted | 2026-07-13 |
| 0002 | Zero Runtime Dependencies | Accepted | 2026-07-13 |
| 0003 | Strict TypeScript Configuration | Accepted | 2026-07-13 |
| 0004 | CLI Progress Reporting & Colored Output | Accepted | 2026-07-16 |
| 0005 | One-Shot Pipeline with Session Persistence | Accepted | 2026-07-16 |
| 0006 | File Splitting and Code Deduplication | Accepted | 2026-07-16 |
| 0007 | Middle-end Passes Parallelization | Accepted | 2026-07-16 |
| 0008 | Semantic Consistency Checker | Accepted | 2026-07-16 |
| 0009 | Data-Flow Signals — Persisted in IR vs. Ephemeral Analysis | Proposed | 2026-07-21 |

## Adding a New ADR

1. Copy `0000-template.md` to `XXXX-your-title.md` (next number)
2. Fill in all sections
3. Submit for review
4. Update this README index when accepted
