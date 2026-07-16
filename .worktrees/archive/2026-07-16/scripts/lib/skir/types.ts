/**
 * SkIR raw types — shared interfaces for skill IR parsing.
 */

import type { SectionInfo } from '../../types/skir.js';

export interface RawFrontmatter {
  name: string;
  version?: string;
  description: string;
  compatibility?: string;
  security_level?: string;
  hitl_required?: boolean;
  mcp_servers?: string[];
  permissions?: Array<{
    kind: string;
    scope: string;
    description?: string;
    read_only?: boolean;
  }>;
  input_schema?: Record<string, unknown>;
  output_schema?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  capability_tiers?: Record<string, { min_capability_score: number; adaptation: string }>;
  platform_activation?: Record<string, Record<string, unknown>>;
}

export interface RawSkillMd {
  frontmatter: RawFrontmatter;
  body: string;
  sections: SectionInfo[];
  sourcePath: string;
}
