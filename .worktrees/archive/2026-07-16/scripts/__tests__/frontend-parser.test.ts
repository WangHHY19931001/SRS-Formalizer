import { describe, it } from 'node:test';
import assert from 'node:assert';
import { identifyChapters, detectCrossRefs, scanNFR } from '../lib/frontend/parser.js';

describe('identifyChapters', () => {
  const mdContent = `# §1 概述
这是概述内容。
## §1.1 背景
背景说明。
### 术语表
术语定义。
## §2 功能需求
功能描述。
#### 尚未解决问题
已知问题列表。`;

  it('detects Markdown headings', () => {
    const chapters = identifyChapters(mdContent, '/tmp/srs.md');
    assert.ok(chapters.length >= 4);
  });

  it('identifies 术语表 as chapter', () => {
    const chapters = identifyChapters(mdContent, '/tmp/srs.md');
    const glossaryCh = chapters.find(c => c.title === '术语表');
    assert.ok(glossaryCh);
    assert.strictEqual(glossaryCh.level, 3);
  });

  it('identifies 尚未解决问题 as chapter', () => {
    const chapters = identifyChapters(mdContent, '/tmp/srs.md');
    const openIssues = chapters.find(c => c.title === '尚未解决问题');
    assert.ok(openIssues);
  });

  it('handles empty content', () => {
    const chapters = identifyChapters('', '/tmp/empty.md');
    assert.strictEqual(chapters.length, 0);
  });

  it('captures line numbers', () => {
    const chapters = identifyChapters(mdContent, '/tmp/srs.md');
    for (const ch of chapters) {
      assert.ok(ch.line >= 0);
      assert.strictEqual(typeof ch.raw, 'string');
    }
  });
});

describe('detectCrossRefs', () => {
  const content = `# §1 概述
用户管理系统。
## §2 功能需求
参见 §3 性能需求 中的定义。
| 术语 | 定义 |
|------|------|
| JWT | JSON Web Token |
## §3 性能需求
系统响应 TPS 需满足 §2 中定义的要求。`;

  it('detects explicit_see references', () => {
    const chapters = identifyChapters(content, '/tmp/srs.md');
    const refs = detectCrossRefs(content, chapters);
    const explicit = refs.filter(r => r.refType === 'explicit_see');
    assert.ok(explicit.length >= 1, 'should detect 参见 §3');
  });

  it('detects term_ref from tables', () => {
    const chapters = identifyChapters(content, '/tmp/srs.md');
    const refs = detectCrossRefs(content, chapters);
    const terms = refs.filter(r => r.refType === 'term_ref');
    assert.ok(terms.some(r => r.anchorText.includes('JWT')));
  });

  it('returns empty for no references', () => {
    const chapters = identifyChapters('普通的文本没有引用', '/tmp/no-ref.md');
    const refs = detectCrossRefs('普通的文本没有引用', chapters);
    assert.strictEqual(refs.length, 0);
  });

  it('each ref has valid confidence', () => {
    const chapters = identifyChapters(content, '/tmp/srs.md');
    const refs = detectCrossRefs(content, chapters);
    for (const ref of refs) {
      assert.ok(ref.confidence >= 0 && ref.confidence <= 1);
    }
  });
});

describe('scanNFR', () => {
  const nfrContent = `# §1 概述
系统需支持高并发场景。
## §2 性能需求
响应时间不超过 200ms，吞吐量需达 10000 TPS。
## §3 安全需求
所有数据传输需加密，用户需通过认证后访问系统。`;

  it('detects performance category', () => {
    const profile = scanNFR(nfrContent, 'zh');
    assert.ok(profile.detectedCategories.some(c => c.category === 'performance'));
    assert.ok(profile.overallCoverage > 0);
  });

  it('detects multiple categories', () => {
    const profile = scanNFR(nfrContent, 'zh');
    const cats = profile.detectedCategories.map(c => c.category);
    assert.ok(cats.includes('performance'));
    assert.ok(cats.includes('security'));
  });

  it('reports blindSpots for undetected categories', () => {
    const shortContent = '响应时间不超过 200ms。';
    const profile = scanNFR(shortContent, 'zh');
    assert.ok(profile.blindSpots.length > 0);
  });

  it('overallCoverage between 0 and 1', () => {
    const profile = scanNFR(nfrContent, 'zh');
    assert.ok(profile.overallCoverage >= 0);
    assert.ok(profile.overallCoverage <= 1);
  });

  it('handles empty content', () => {
    const profile = scanNFR('', 'zh');
    assert.strictEqual(profile.detectedCategories.length, 0);
    assert.strictEqual(profile.overallCoverage, 0);
    assert.strictEqual(profile.blindSpots.length, 6);
  });
});
