/**
 * Shared ID sanitization utility.
 *
 * Replaces characters outside the safe set with hyphens, collapses consecutive
 * hyphens, and strips leading/trailing hyphens.  The safe set is the union of
 * what the three graph modules need:
 *   - ASCII alphanumeric, underscore, hyphen (all modules)
 *   - dot (Lean identifiers such as `Nat.add`)
 *   - CJK unified ideographs (BDD scenario / feature names)
 */

export function sanitizeId(name: string): string {
  return name
    .replace(/[^A-Za-z0-9一-鿿_.-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
