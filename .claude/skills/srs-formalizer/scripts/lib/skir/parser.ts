/**
 * SkIR parser — extracts YAML frontmatter and markdown sections from SKILL.md content.
 */

import type { SectionInfo } from '../../types/skir.js';
import type { RawSkillMd } from './types.js';
import { parseSimpleYaml } from './yaml.js';

export function parseRawSkillMd(content: string, sourcePath: string): RawSkillMd {
  // Extract YAML frontmatter between --- delimiters
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) {
    throw new Error(`No YAML frontmatter found in ${sourcePath}`);
  }

  const fmRaw = fmMatch[1]!;
  const body = content.slice(fmMatch[0].length).trim();

  const frontmatter = parseSimpleYaml(fmRaw) as unknown as RawSkillMd['frontmatter'];

  // Parse sections from markdown body
  const sections = parseSections(body);

  return { frontmatter, body, sections, sourcePath };
}

function parseSections(body: string): SectionInfo[] {
  const sections: SectionInfo[] = [];
  const lines = body.split('\n');
  let currentSection: SectionInfo | null = null;
  let currentContent: string[] = [];

  for (const line of lines) {
    const hMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (hMatch) {
      // Flush previous
      if (currentSection) {
        currentSection.content = currentContent.join('\n').trim();
        sections.push(currentSection);
      }
      currentSection = {
        level: hMatch[1]!.length,
        title: hMatch[2]!.trim(),
        content: '',
      };
      currentContent = [];
    } else if (currentSection) {
      currentContent.push(line);
    }
  }

  if (currentSection) {
    currentSection.content = currentContent.join('\n').trim();
    sections.push(currentSection);
  }

  return sections;
}
