/**
 * Chapter parser — identifies chapter boundaries from HTML and Markdown SRS documents.
 */

export interface ChapterInfo { title: string; level: number; line: number; raw: string; }

const KEYWORD_PATTERNS: { pattern: RegExp; name: string }[] = [
  { pattern: /术语[表定]|Glossary|Terms/i, name: '术语表' },
  { pattern: /模块能力[矩阵]|Capability Matrix/i, name: '模块能力矩阵' },
  { pattern: /功能[需求规格]|Functional Requirements/i, name: '功能需求' },
  { pattern: /尚未[解决决].*问题|Open Issues|Unresolved/i, name: '尚未解决问题' },
  { pattern: /技术[选型方案]|Technology Stack|Architecture/i, name: '技术选型' },
];

export function identifyChaptersHtml(content: string): ChapterInfo[] {
  const chapters: ChapterInfo[] = [];
  const lines = content.split('\n');
  const headingRe = /<h([1-6])(?:\s+[^>]*?\bid\s*=\s*["']([^"']+)["'])?[^>]*>(.*?)<\/h\1>/gi;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    headingRe.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = headingRe.exec(line)) !== null) {
      const level = parseInt(match[1]!, 10);
      const idAttr = match[2] || undefined;
      const title = match[3]!.replace(/<[^>]+>/g, '').trim();
      chapters.push({ title: title || (idAttr || `h${level}`), level, line: i, raw: line.trim() });
    }
  }
  return chapters;
}

export function identifyChapters(content: string, sourcePath: string): ChapterInfo[] {
  if (sourcePath.endsWith('.html') || sourcePath.endsWith('.htm')) return identifyChaptersHtml(content);
  const chapters: ChapterInfo[] = [];
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const sectionMatch = line.match(/^#{1,6}\s*(?:§(\d+(?:\.\d+)*))?\s*(.+)$/);
    if (sectionMatch) {
      let title = (sectionMatch[2] || '').trim();
      for (const kw of KEYWORD_PATTERNS) { if (kw.pattern.test(line)) { title = kw.name; break; } }
      chapters.push({ title, level: line.match(/^#+/)![0]!.length, line: i, raw: line.trim() });
      continue;
    }
    for (const kw of KEYWORD_PATTERNS) {
      if (kw.pattern.test(line) && line.startsWith('#')) {
        chapters.push({ title: kw.name, level: line.match(/^#+/)![0]!.length, line: i, raw: line.trim() });
        break;
      }
    }
  }
  return chapters;
}
