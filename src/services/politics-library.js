export const POLITICS_CATALOG_URL = new URL('../../data/politics/catalog.json', import.meta.url);

export function searchPoliticsPages(book, query) {
  const normalize = text => text.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
  const needle = normalize(query.trim());
  if (!needle) return [];
  return book.pages.flatMap(page => {
    const haystack = normalize(page.text), index = haystack.indexOf(needle);
    if (index < 0) return [];
    const start = Math.max(0, index - 28), end = Math.min(haystack.length, index + needle.length + 58);
    return [{ ...page, snippet: `${start ? '…' : ''}${haystack.slice(start, end)}${end < haystack.length ? '…' : ''}` }];
  });
}

export function searchPoliticsItems(book, query) {
  const normalize = text => text.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
  const needle = normalize(query.trim());
  if (!needle) return [];
  return book.topics.flatMap(topic => topic.items.flatMap(item => {
    const text = [item.title, ...item.blocks.map(block => block.type === 'table'
      ? `${block.caption} ${block.rows.flat().join(' ')}` : block.text)].join(' ');
    const haystack = normalize(text), index = haystack.indexOf(needle);
    if (index < 0) return [];
    const start = Math.max(0, index - 25), end = Math.min(haystack.length, index + needle.length + 55);
    return [{ topic, item, snippet: `${start ? '…' : ''}${haystack.slice(start, end)}${end < haystack.length ? '…' : ''}` }];
  }));
}

export function validateReadingEdition(data, book) {
  if (data.schemaVersion !== 1 || data.bookId !== book.id || data.sourceSha256 !== book.sourceSha256
    || !Array.isArray(data.topics) || !data.topics.length) throw new Error('连续阅读资料格式不正确');
  const ids = new Set(), types = new Set(['paragraph', 'point', 'option', 'note', 'heading', 'table']);
  const sources = value => Array.isArray(value) && value.length && value.every(p => Number.isSafeInteger(p) && book.pages[p - 1]?.isStudyContent);
  function identity(value) {
    if (typeof value.id !== 'string' || !/^[a-z][a-z0-9-]{0,100}$/.test(value.id) || ids.has(value.id)) throw new Error('知识点编号不正确');
    ids.add(value.id);
  }
  for (const topic of data.topics) {
    identity(topic);
    if (typeof topic.title !== 'string' || typeof topic.section !== 'string' || !sources(topic.sourcePages)
      || !Array.isArray(topic.items) || !topic.items.length) throw new Error('专题内容不完整');
    for (const item of topic.items) {
      identity(item);
      if (typeof item.title !== 'string' || !sources(item.sourcePages) || !Array.isArray(item.blocks)) throw new Error('题目内容不完整');
      for (const block of item.blocks) {
        if (!types.has(block.type) || !sources(block.sourcePages)) throw new Error('正文结构不正确');
        if (block.type === 'table') {
          if (typeof block.caption !== 'string' || !Array.isArray(block.rows)
            || !block.rows.every(row => Array.isArray(row) && row.length === 2 && row.every(cell => typeof cell === 'string'))) throw new Error('表格结构不正确');
        } else if (typeof block.text !== 'string') throw new Error('正文文字不完整');
      }
    }
  }
  return data.topics;
}

export function createPoliticsLibrary({ fetcher = globalThis.fetch, catalogUrl = POLITICS_CATALOG_URL } = {}) {
  let catalogPromise;
  const books = new Map();
  async function read(url) {
    const response = await fetcher(url);
    if (!response.ok) throw new Error(`资料加载失败（${response.status}）`);
    return response.json();
  }
  async function catalog() {
    if (!catalogPromise) catalogPromise = read(catalogUrl).then(data => {
      if (data.schemaVersion !== 1 || !Array.isArray(data.books) || !data.books.length) throw new Error('政治目录格式不正确');
      const ids = new Set();
      return data.books.map(book => {
        if (typeof book.id !== 'string' || !/^[a-z][a-z0-9-]{0,40}$/.test(book.id) || ids.has(book.id)
          || ['constructor', 'prototype', '__proto__'].includes(book.id)
          || typeof book.title !== 'string' || typeof book.volume !== 'string'
          || !Number.isSafeInteger(book.pdfPageCount) || book.pdfPageCount < 1
          || typeof book.dataFile !== 'string' || typeof book.textFile !== 'string') throw new Error('政治分册格式不正确');
        ids.add(book.id);
        return { ...book, dataUrl: new URL(book.dataFile, catalogUrl), textUrl: new URL(book.textFile, catalogUrl) };
      });
    }).catch(error => { catalogPromise = undefined; throw error; });
    return catalogPromise;
  }
  async function load(id) {
    if (!books.has(id)) {
      const pending = (async () => {
        const entry = (await catalog()).find(book => book.id === id);
        if (!entry) throw new Error('找不到这册资料');
        const book = await read(entry.dataUrl);
        if (book.schemaVersion !== 1 || book.id !== id || !Array.isArray(book.pages) || book.pages.length !== entry.pdfPageCount
          || !Array.isArray(book.sections) || !Number.isInteger(book.firstContentPage)) throw new Error('政治正文格式不正确');
        book.pages.forEach((page, index) => {
          if (page.pdfPage !== index + 1 || typeof page.text !== 'string' || typeof page.title !== 'string' || typeof page.section !== 'string') throw new Error('政治页码或文字不完整');
        });
        for (const section of book.sections) {
          if (typeof section.title !== 'string' || !Number.isInteger(section.pdfPage) || section.pdfPage < 1 || section.pdfPage > book.pages.length
            || !Number.isInteger(section.startPage) || section.startPage < section.pdfPage || section.startPage > book.pages.length) throw new Error('政治章节位置不正确');
        }
        if (book.firstContentPage < 1 || book.firstContentPage > book.pages.length) throw new Error('政治起始页码不正确');
        const topics = entry.readerFile ? validateReadingEdition(await read(new URL(entry.readerFile, catalogUrl)), book) : [];
        return { ...book, topics, textUrl: entry.textUrl };
      })().catch(error => { books.delete(id); throw error; });
      books.set(id, pending);
    }
    return books.get(id);
  }
  return { catalog, load };
}
