const assert = require('node:assert/strict');
const test = require('node:test');
process.env.TZ = 'Asia/Shanghai';
let createPoliticsProgress, validatePoliticsProgress, POLITICS_STORAGE_KEY, createPoliticsLibrary, searchPoliticsPages;
test.before(async () => {
  ({ createPoliticsProgress, validatePoliticsProgress, POLITICS_STORAGE_KEY } = await import('../src/services/politics-progress.js'));
  ({ createPoliticsLibrary, searchPoliticsPages } = await import('../src/services/politics-library.js'));
});

function setup({ memory = new Map(), failWrites = false, at = '2026-10-20T18:00:00+08:00' } = {}) {
  let instant = at;
  const progress = createPoliticsProgress({ now: () => new Date(instant), storage: () => ({
    getItem: key => memory.get(key) ?? null,
    setItem(key, value) { if (failWrites) throw Error('quota'); memory.set(key, value); },
  }) });
  return { progress, memory, at: value => { instant = value; } };
}

test('reading position and bookmarks persist without creating a check-in', () => {
  const env = setup();
  env.progress.remember('upper', 9);
  env.progress.bookmark('upper', 9, '导论', '马克思主义基本原理');
  assert.equal(env.progress.summary().length, 0);
  const reloaded = setup({ memory: env.memory }).progress;
  assert.equal(reloaded.data.positions.upper.page, 9);
  assert.equal(reloaded.data.bookmarks.upper['9'].title, '导论');
  reloaded.bookmark('upper', 9, '导论', '马克思主义基本原理');
  assert.equal(reloaded.data.bookmarks.upper['9'], undefined);
  assert.equal(env.memory.has('recite-helper.music-overview.study.v1'), false);
});

test('confirmation deduplicates within a day and keeps the two books separate', () => {
  const env = setup();
  env.progress.confirm('upper', 9, '导论', '马原');
  assert.equal(env.progress.confirm('upper', 9, '导论', '马原').already, true);
  env.progress.confirm('lower', 9, '专题二', '特别专题');
  assert.equal(env.progress.summary().length, 2);
  assert.equal(env.progress.streak(), 1);
  env.at('2026-10-21T00:00:01+08:00');
  assert.equal(env.progress.summary().length, 0);
  env.progress.confirm('upper', 9, '导论', '马原');
  assert.equal(env.progress.streak(), 2);
});

test('backups merge pages and use the newer position without double-counting', () => {
  const env = setup();
  env.progress.remember('upper', 9);
  env.progress.confirm('upper', 9, '导论', '马原');
  const old = env.progress.exportBackup();
  env.at('2026-10-20T19:00:00+08:00');
  env.progress.remember('upper', 10);
  env.progress.confirm('upper', 10, '世界的物质性', '马原');
  env.progress.importBackup(old); env.progress.importBackup(old);
  assert.equal(env.progress.summary().length, 2);
  assert.equal(env.progress.data.positions.upper.page, 10);
  const invalid = structuredClone(old); invalid.days['2026-10-20']['upper:9'].page = 0;
  const snapshot = structuredClone(env.progress.data);
  assert.throws(() => env.progress.importBackup(invalid));
  assert.deepEqual(env.progress.data, snapshot);
  invalid.positions = { constructor: { page: 1, at: '2026-10-20T00:00:00Z' } };
  assert.throws(() => validatePoliticsProgress(invalid));
});

test('unreadable storage is preserved and quota failures keep in-memory records', () => {
  const memory = new Map([[POLITICS_STORAGE_KEY, '{broken']]);
  const corrupt = setup({ memory }).progress;
  corrupt.confirm('upper', 9, '导论', '马原');
  assert.equal(memory.get(POLITICS_STORAGE_KEY), '{broken');
  assert.equal(corrupt.exportBackup().unreadableOriginal, '{broken');
  const quota = setup({ failWrites: true }).progress;
  assert.equal(quota.confirm('lower', 8, '专题一', '特别专题').saved, false);
  assert.equal(quota.summary().length, 1);
  assert.match(quota.error, /未能保存/);
});

test('search finds Chinese words across OCR line breaks and retains PDF page numbers', () => {
  const book = { pages: [{ pdfPage: 9, bookPage: 2, title: '导论', section: '马原', text: '马克思主\n义与实践。' }] };
  assert.equal(searchPoliticsPages(book, '马克思主义')[0].pdfPage, 9);
  assert.equal(searchPoliticsPages(book, '不存在').length, 0);
  assert.equal(searchPoliticsPages(book, ' ').length, 0);
});

test('library loads relative subdirectory resources and retries after a failed request', async () => {
  const requests = []; let fail = true;
  const catalog = { schemaVersion: 1, books: [{ id: 'upper', title: '上册', volume: '上册', pdfPageCount: 1, dataFile: 'upper.json', textFile: '../../output/text/upper.txt' }] };
  const book = { schemaVersion: 1, id: 'upper', firstContentPage: 1, sections: [{ title: '章节', pdfPage: 1, startPage: 1 }], pages: [{ pdfPage: 1, title: '标题', section: '章节', text: '内容' }] };
  const library = createPoliticsLibrary({ catalogUrl: new URL('https://example.com/recite-helper/data/politics/catalog.json'), fetcher: async url => {
    requests.push(String(url));
    if (String(url).endsWith('catalog.json')) return { ok: true, json: async () => catalog };
    if (fail) { fail = false; return { ok: false, status: 503 }; }
    return { ok: true, json: async () => book };
  } });
  await assert.rejects(library.load('upper'), /503/);
  const loaded = await library.load('upper');
  assert.equal(loaded.pages[0].text, '内容');
  assert.equal(String(loaded.textUrl), 'https://example.com/recite-helper/output/text/upper.txt');
  assert.equal(requests[1], 'https://example.com/recite-helper/data/politics/upper.json');
});

test('the real two-volume corpus includes every PDF page and preserves the printed-page discontinuity', async () => {
  const fs = require('node:fs'); const path = require('node:path');
  const root = path.join(__dirname, '..');
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data/politics/catalog.json'), 'utf8'));
  const library = createPoliticsLibrary({ catalogUrl: new URL('https://example.com/recite-helper/data/politics/catalog.json'), fetcher: async url => {
    const file = path.join(root, 'data/politics', new URL(url).pathname.split('/').at(-1));
    return { ok: true, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) };
  } });
  assert.equal(catalog.books.length, 2);
  const upper = await library.load('upper'), lower = await library.load('lower');
  assert.equal(upper.pages.length, 238); assert.equal(lower.pages.length, 168);
  assert.equal(upper.pages[199].bookPage, 193);
  assert.equal(upper.pages[200].bookPage, 195);
  assert.equal(upper.sections.at(-1).startPage, 201);
  assert.equal(lower.sections.length, 6);
  for (const book of [upper, lower]) {
    const entry = catalog.books.find(item => item.id === book.id);
    const text = fs.readFileSync(path.join(root, 'data/politics', entry.textFile), 'utf8');
    assert.equal([...text.matchAll(/^===== PDF 第 \d+ 页 \/ /gm)].length, book.pages.length);
    for (const page of book.pages) assert.ok(text.includes(page.text));
    assert.equal(book.ocrUnreviewed, true);
  }
});
