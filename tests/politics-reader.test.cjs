const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = name => JSON.parse(fs.readFileSync(path.join(__dirname, '../data/politics', name), 'utf8'));
let createPoliticsProgress, validatePoliticsProgress, validateReadingEdition, searchPoliticsItems, renderPoliticsBlock;
test.before(async () => {
  ({ createPoliticsProgress, validatePoliticsProgress } = await import('../src/services/politics-progress.js'));
  ({ validateReadingEdition, searchPoliticsItems } = await import('../src/services/politics-library.js'));
  ({ renderPoliticsBlock } = await import('../src/features/politics-content.js'));
});
function setup(memory = new Map()) {
  return createPoliticsProgress({ storage: () => ({ getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) }), now: () => new Date('2026-10-20T12:00:00+08:00') });
}

test('two questions on the same PDF page are separate check-ins and old page records survive', () => {
  const memory = new Map(), progress = setup(memory);
  progress.confirm('upper', 10, '旧版页记录', '马原');
  progress.confirm('upper', 10, '基本特征', '马原', 'upper-s1-t1-q2');
  progress.confirm('upper', 10, '哲学基本问题', '马原', 'upper-s1-t2-q1');
  assert.equal(progress.confirm('upper', 10, '基本特征', '马原', 'upper-s1-t1-q2').already, true);
  assert.equal(progress.summary().length, 3);
  assert.equal(progress.summary().filter(x => x.unitId).length, 2);
  assert.equal(setup(memory).summary().length, 3);
});

test('unit bookmarks, positions and mixed legacy backups round-trip without losing old keys', () => {
  const progress = setup();
  progress.bookmark('upper', 10, '旧书签', '马原');
  progress.bookmark('upper', 10, '基本特征', '马原', 'upper-s1-t1-q2');
  progress.bookmark('upper', 10, '哲学问题', '马原', 'upper-s1-t2-q1');
  progress.remember('upper', 10, 'upper-s1-t2-q1');
  const restored = setup(); restored.importBackup(progress.exportBackup()); restored.importBackup(progress.exportBackup());
  assert.equal(Object.keys(restored.data.bookmarks.upper).length, 3);
  assert.equal(restored.data.positions.upper.unitId, 'upper-s1-t2-q1');
  restored.bookmark('upper', 10, '基本特征', '马原', 'upper-s1-t1-q2');
  assert.equal(Object.keys(restored.data.bookmarks.upper).length, 2);
  const bad = progress.exportBackup(); bad.positions.upper.unitId = '__proto__';
  assert.throws(() => validatePoliticsProgress(bad));
});

test('new reading font defaults to 16 even when legacy page-reader font was 18', () => {
  const old = { version: 1, positions: {}, bookmarks: {}, days: {}, fontSize: 18 };
  assert.equal(validatePoliticsProgress(old).readerFontSize, 16);
  const progress = setup(); progress.setFontSize(20);
  assert.equal(validatePoliticsProgress(progress.exportBackup()).readerFontSize, 20);
});

test('continuous editions cover all study pages, use unique source-addressable IDs, and exclude front matter', () => {
  for (const id of ['upper', 'lower']) {
    const book = read(`${id}.json`), edition = read(`${id}-reader.json`);
    const topics = validateReadingEdition(edition, book);
    const actual = [...new Set(topics.flatMap(t => t.items.flatMap(q => q.sourcePages)))].sort((a, b) => a-b);
    assert.deepEqual(actual, book.pages.filter(p => p.isStudyContent).map(p => p.pdfPage));
    assert.equal(edition.audit.inputLines, edition.audit.assignedLines);
    for (const topic of topics) for (const item of topic.items) for (const block of item.blocks) {
      if (block.text) { assert.equal(block.text.includes('\n'), false); assert.equal(block.text.includes('===== PDF'), false); }
    }
  }
});

test('an opening table continues across PDF pages and a philosophy statement keeps its wrapped sentence', () => {
  const book = read('upper-reader.json');
  const works = book.topics[0].items[0];
  assert.deepEqual(works.sourcePages, [9, 10]);
  assert.equal(works.blocks[1].rows.find(row => row[0] === '《哥达纲领批判》')[1].includes('未来社会'), true);
  const philosophy = book.topics[1].items[0];
  assert.deepEqual(philosophy.sourcePages, [10, 11]);
  assert.ok(philosophy.blocks.some(block => block.text?.includes('人能否认识或彻底认识世界的问题。')));
  const origin = book.topics[0].items[0].blocks[0];
  assert.equal(origin.rows[1][1], '无产阶级在反抗资产阶级剥削和压迫的斗争中逐步走向自觉，并迫切渴望科学的理论指导');
});

test('MCQ options use left-to-right A B C D reading order and search targets questions', () => {
  const lower = { ...read('lower.json'), topics: read('lower-reader.json').topics };
  const first = lower.topics.find(t => t.sectionNumber === 2).items[0];
  assert.deepEqual(first.blocks.filter(b => b.type === 'option').map(b => b.text[0]), ['A', 'B', 'C', 'D']);
  const found = searchPoliticsItems(lower, '无可比拟的优秀特质');
  assert.ok(found.some(result => result.item.id === first.id));
  assert.equal(searchPoliticsItems(lower, ' ').length, 0);
});

test('reviewed table rows retain their correct relationships and merge the cross-page quotations', () => {
  const blocks = read('upper-reader.json').topics.flatMap(t => t.items.flatMap(q => q.blocks));
  const movement = blocks.find(b => b.type === 'table' && b.sourcePages[0] === 167);
  assert.equal(movement.rows.find(row => row[0] === '辛亥革命')[1], '推动了中国人民的思想解放');
  const treaties = blocks.find(b => b.type === 'table' && b.sourcePages[0] === 152);
  assert.ok(treaties.rows.find(row => row[0].includes('五口通商章程'))[1].includes('领事裁判权'));
  const quotes = blocks.filter(b => b.type === 'table' && b.sourcePages.some(p => p === 207 || p === 208));
  assert.equal(quotes.length, 1); assert.deepEqual(quotes[0].sourcePages, [207, 208]);
  assert.equal(quotes[0].rows.length, 3);
});

test('independent conference panels do not interleave two columns into one sentence', () => {
  const topic = read('lower-reader.json').topics.find(t => t.title === '重要会议');
  const blocks = topic.items.flatMap(q => q.blocks);
  const first = blocks.findIndex(b => b.type === 'heading' && b.text === '中共一大');
  const next = blocks.findIndex((b, i) => i > first && b.type === 'heading');
  const content = blocks.slice(first + 1, next).map(b => b.text).join('');
  assert.ok(content.includes('成立中国共产党，通过中国共产党的第一个纲领和决议。'));
  assert.equal(content.includes('大会明确提出了反帝反封'), false);
});

test('reading-edition validation rejects stale sources and invalid references', () => {
  const book = read('upper.json'), edition = read('upper-reader.json');
  const stale = structuredClone(edition); stale.sourceSha256 = 'wrong';
  assert.throws(() => validateReadingEdition(stale, book));
  const invalid = structuredClone(edition); invalid.topics[0].items[0].sourcePages = [0];
  assert.throws(() => validateReadingEdition(invalid, book));
});

test('formatted paragraphs and tables escape source HTML before emphasizing text', () => {
  const rendered = renderPoliticsBlock({ type: 'point', text: '① 定义：<img src=x onerror=alert(1)>' });
  assert.ok(rendered.includes('&lt;img')); assert.equal(rendered.includes('<img'), false);
  const table = renderPoliticsBlock({ type: 'table', caption: '<script>', rows: [['<b>', '<img>\n第二行']] });
  assert.ok(table.includes('&lt;script&gt;')); assert.ok(table.includes('<br>第二行'));
});
