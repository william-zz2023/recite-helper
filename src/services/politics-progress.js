export const POLITICS_STORAGE_KEY = 'recite-helper.politics.reading.v1';

const object = value => value && typeof value === 'object' && !Array.isArray(value);
const bookIdOK = value => typeof value === 'string' && /^[a-z][a-z0-9-]{0,40}$/.test(value)
  && !['constructor', 'prototype', '__proto__'].includes(value);
const pageOK = value => Number.isSafeInteger(value) && value > 0 && value <= 10000;
const unitOK = value => typeof value === 'string' && /^[a-z][a-z0-9-]{0,100}$/.test(value);
const timeOK = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const shiftDay = (key, offset) => { const [y, m, d] = key.split('-').map(Number); return dateKey(new Date(y, m - 1, d + offset, 12)); };
const dayOK = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && shiftDay(value, 0) === value;
const empty = () => ({ version: 1, positions: {}, bookmarks: {}, days: {}, fontSize: 18, readerFontSize: 16 });

export function validatePoliticsProgress(value) {
  if (!object(value) || value.version !== 1 || !object(value.positions) || !object(value.bookmarks) || !object(value.days)) throw new Error('政治备份格式不正确');
  const clean = empty();
  const position = item => {
    if (!object(item) || !pageOK(item.page) || !timeOK(item.at)) throw new Error('阅读位置不正确');
    if (item.unitId !== undefined && !unitOK(item.unitId)) throw new Error('知识点编号不正确');
    return { page: item.page, at: item.at, ...(item.unitId ? { unitId: item.unitId } : {}) };
  };
  const detail = item => {
    const base = position(item);
    if (typeof item.title !== 'string' || item.title.length > 400 || typeof item.section !== 'string' || item.section.length > 200) throw new Error('阅读内容不正确');
    return { ...base, title: item.title, section: item.section };
  };
  for (const [id, item] of Object.entries(value.positions)) {
    if (!bookIdOK(id)) throw new Error('分册编号不正确');
    clean.positions[id] = position(item);
  }
  for (const [id, entries] of Object.entries(value.bookmarks)) {
    if (!bookIdOK(id) || !object(entries)) throw new Error('书签格式不正确');
    clean.bookmarks[id] = {};
    for (const [page, item] of Object.entries(entries)) {
      if (String(item?.unitId || item?.page) !== page) throw new Error('书签位置不正确');
      clean.bookmarks[id][page] = detail(item);
    }
  }
  for (const [day, entries] of Object.entries(value.days)) {
    if (!dayOK(day) || !object(entries)) throw new Error('学习日期不正确');
    clean.days[day] = {};
    for (const [key, item] of Object.entries(entries)) {
      if (!bookIdOK(item?.bookId) || key !== `${item.bookId}:${item.unitId || item.page}`) throw new Error('学习位置不正确');
      clean.days[day][key] = { ...detail(item), bookId: item.bookId };
    }
  }
  if (value.fontSize !== undefined) {
    if (!Number.isInteger(value.fontSize) || value.fontSize < 16 || value.fontSize > 24) throw new Error('字号设置不正确');
    clean.fontSize = value.fontSize;
  }
  if (value.readerFontSize !== undefined) {
    if (!Number.isInteger(value.readerFontSize) || value.readerFontSize < 16 || value.readerFontSize > 24) throw new Error('阅读字号不正确');
    clean.readerFontSize = value.readerFontSize;
  }
  return clean;
}

export function createPoliticsProgress({ storage = () => globalThis.localStorage, now = () => new Date() } = {}) {
  let data = empty(), error = '', unreadableOriginal = null, locked = false;
  try {
    const raw = storage().getItem(POLITICS_STORAGE_KEY);
    if (raw !== null) {
      unreadableOriginal = raw;
      data = validatePoliticsProgress(JSON.parse(raw));
      unreadableOriginal = null;
    }
  } catch {
    locked = unreadableOriginal !== null;
    error = locked ? '原政治记录无法读取，已保留；请先导出备份。' : '当前浏览器无法保存记录，请及时导出备份。';
  }
  function save() {
    if (locked) return false;
    try { storage().setItem(POLITICS_STORAGE_KEY, JSON.stringify(data)); error = ''; return true; }
    catch { error = '记录暂存在本页，浏览器未能保存；关闭前请导出备份。'; return false; }
  }
  function check(id, page) { if (!bookIdOK(id) || !pageOK(page)) throw new Error('分册或页码不正确'); }
  function metadata(page, title, section, unitId) {
    if (typeof title !== 'string' || typeof section !== 'string') throw new Error('阅读内容不正确');
    if (unitId !== undefined && !unitOK(unitId)) throw new Error('知识点编号不正确');
    return { page, title: title.slice(0, 400), section: section.slice(0, 200), at: now().toISOString(), ...(unitId ? { unitId } : {}) };
  }
  function remember(id, page, unitId) {
    check(id, page);
    if (unitId !== undefined && !unitOK(unitId)) throw new Error('知识点编号不正确');
    data.positions[id] = { page, at: now().toISOString(), ...(unitId ? { unitId } : {}) }; return save();
  }
  function confirm(id, page, title, section, unitId) {
    check(id, page);
    const entry = metadata(page, title, section, unitId);
    const day = dateKey(now()), key = `${id}:${unitId || page}`;
    const entries = data.days[day] ||= {};
    const already = Object.hasOwn(entries, key);
    if (!already) entries[key] = { ...entry, bookId: id };
    return { already, saved: save() };
  }
  function bookmark(id, page, title, section, unitId) {
    check(id, page);
    const entry = metadata(page, title, section, unitId), key = unitId || page;
    const entries = data.bookmarks[id] ||= {};
    if (Object.hasOwn(entries, key)) delete entries[key];
    else entries[key] = entry;
    save();
    return Object.hasOwn(entries, key);
  }
  function importBackup(value) {
    const incoming = validatePoliticsProgress(value);
    const merged = validatePoliticsProgress(data);
    const newer = (a, b) => !a || Date.parse(b.at) > Date.parse(a.at) ? b : a;
    for (const [id, item] of Object.entries(incoming.positions)) merged.positions[id] = newer(merged.positions[id], item);
    for (const [id, entries] of Object.entries(incoming.bookmarks)) {
      const target = merged.bookmarks[id] ||= {};
      for (const [page, item] of Object.entries(entries)) target[page] = newer(target[page], item);
    }
    for (const [day, entries] of Object.entries(incoming.days)) {
      const target = merged.days[day] ||= {};
      for (const [key, item] of Object.entries(entries)) target[key] = newer(target[key], item);
    }
    data = merged;
    return save();
  }
  function summary(day = dateKey(now())) { return Object.values(data.days[day] || {}); }
  function streak() {
    let day = dateKey(now()), count = 0;
    if (!summary(day).length) day = shiftDay(day, -1);
    while (summary(day).length) { count++; day = shiftDay(day, -1); }
    return count;
  }
  return {
    get data() { return data; }, get error() { return error; },
    today: () => dateKey(now()), remember, confirm, bookmark, summary, streak, importBackup,
    setFontSize(size) { data.readerFontSize = data.fontSize = Math.max(16, Math.min(24, Math.round(Number(size)) || 16)); save(); },
    exportBackup() {
      return JSON.parse(JSON.stringify({ ...data, app: 'recite-helper-politics', exportedAt: now().toISOString(),
        ...(unreadableOriginal !== null ? { unreadableOriginal } : {}) }));
    },
  };
}
