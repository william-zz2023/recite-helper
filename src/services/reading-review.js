export const READING_REVIEW_KEY = 'recite-helper.music-overview.reading-review.v1';
export const RECALL_LABELS = { remembered: '记住了', unsure: '还不熟', forgot: '没背出' };
export const REVIEW_MODES = { oral: '口头背诵＋自评', qa: '关键词提示＋输入作答', full: '全文默写' };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const idOK = id => Number.isSafeInteger(id) && id >= 0 && id <= 1e9;
const instantOK = at => typeof at === 'string' && Number.isFinite(Date.parse(at));
const tokenOK = id => typeof id === 'string' && /^[a-zA-Z0-9-]{1,150}$/.test(id);
const unique = values => [...new Set(values)];
const clone = value => JSON.parse(JSON.stringify(value));
const empty = () => ({ version: 1, pending: [], weak: [], mode: 'oral', reading: null, round: null });

export function validateReadingReview(value) {
  if (!object(value) || value.version !== 1) throw new Error('读后复习备份格式不正确');
  function ids(values) {
    if (!Array.isArray(values) || values.length > 10000 || !values.every(idOK) || unique(values).length !== values.length) throw new Error('复习题目编号不正确');
    return [...values];
  }
  const clean = empty(); clean.pending = ids(value.pending); clean.weak = ids(value.weak);
  if (!Object.hasOwn(REVIEW_MODES, value.mode)) throw new Error('复习方式不正确');
  clean.mode = value.mode;
  if (value.reading !== null) {
    const r = value.reading;
    if (!object(r) || !idOK(r.id) || (r.nextId !== null && !idOK(r.nextId)) || !Array.isArray(r.chapters)
      || !r.chapters.length || !r.chapters.every(ch => typeof ch === 'string' && ch.length <= 200) || !instantOK(r.at)) throw new Error('阅读位置不正确');
    clean.reading = { id: r.id, nextId: r.nextId, chapters: unique(r.chapters), at: r.at };
  }
  if (value.round !== null) {
    const r = value.round;
    if (!object(r) || !tokenOK(r.id) || !Object.hasOwn(REVIEW_MODES, r.mode) || !['pending', 'weak'].includes(r.source)
      || !['review', 'complete'].includes(r.phase) || !instantOK(r.startedAt) || !instantOK(r.updatedAt)) throw new Error('本轮复习格式不正确');
    const questions = ids(r.ids);
    if (!questions.length || !Number.isSafeInteger(r.index) || r.index < 0 || r.index > questions.length
      || (r.phase === 'complete') !== (r.index === questions.length) || !Array.isArray(r.results)
      || r.results.length < r.index || r.results.length > Math.min(questions.length, r.index + 1)
      || typeof r.draft !== 'string' || r.draft.length > 10000 || typeof r.hinted !== 'boolean' || typeof r.revealed !== 'boolean') throw new Error('复习进度不正确');
    const results = r.results.map((result, index) => {
      if (!object(result) || result.questionId !== questions[index] || result.eventId !== `${r.id}-${index}`
        || !instantOK(result.at) || typeof result.hinted !== 'boolean' || typeof result.recorded !== 'boolean') throw new Error('复习结果不正确');
      if (r.mode === 'oral') {
        if (!Object.hasOwn(RECALL_LABELS, result.rating)) throw new Error('背诵自评不正确');
        return { questionId: result.questionId, eventId: result.eventId, at: result.at, hinted: result.hinted, recorded: result.recorded, rating: result.rating };
      }
      if (!Number.isFinite(result.score) || result.score < 0 || result.score > 1 || typeof result.ok !== 'boolean'
        || result.ok !== (Math.round(result.score * 100) >= 80)) throw new Error('作答成绩不正确');
      return { questionId: result.questionId, eventId: result.eventId, at: result.at, hinted: result.hinted, recorded: result.recorded, score: result.score, ok: result.ok };
    });
    if (r.phase === 'complete' && results.length !== questions.length) throw new Error('本轮完成状态不正确');
    clean.round = { id: r.id, ids: questions, source: r.source, mode: r.mode, phase: r.phase, index: r.index,
      results, draft: r.draft, hinted: r.hinted, revealed: r.revealed, startedAt: r.startedAt, updatedAt: r.updatedAt };
  }
  return clean;
}

export function createReadingReview({ storage = () => globalThis.localStorage, now = () => new Date(),
  makeId = () => globalThis.crypto?.randomUUID?.() || `rr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}` } = {}) {
  let data = empty(), error = '', original = null, locked = false;
  try {
    const raw = storage().getItem(READING_REVIEW_KEY);
    if (raw !== null) { original = raw; data = validateReadingReview(JSON.parse(raw)); original = null; }
  } catch {
    locked = original !== null;
    error = locked ? '原复习进度无法读取，已保留。请先导出进度备份。' : '当前浏览器无法保存复习进度，请及时导出备份。';
  }
  function save() {
    if (locked) return false;
    try { storage().setItem(READING_REVIEW_KEY, JSON.stringify(data)); error = ''; return true; }
    catch { error = '复习进度暂存在本页，关闭前请导出备份。'; return false; }
  }
  const at = () => now().toISOString();
  function current() { if (!data.round || data.round.phase !== 'review') throw new Error('当前没有进行中的复习'); return data.round; }
  function add(id) {
    if (!idOK(id)) throw new Error('题目编号不正确');
    const added = !data.pending.includes(id);
    if (added) data.pending.push(id);
    return { added, saved: save() };
  }
  function remove(id) {
    if (data.round?.phase === 'review' && data.round.ids.slice(data.round.results.length).includes(id)) throw new Error('本轮题目已固定，完成后可调整下一轮');
    data.pending = data.pending.filter(value => value !== id);return save();
  }
  function remember(id, nextId, chapters) {
    const candidate = { ...data, reading: { id, nextId, chapters: [...chapters], at: at() } };
    data.reading = validateReadingReview(candidate).reading; return save();
  }
  function begin(source = 'pending', selectedIds) {
    if (data.round?.phase === 'review') return data.round;
    if (!['pending', 'weak'].includes(source)) throw new Error('复习范围不正确');
    const ids = selectedIds === undefined ? [...data[source]] : unique(selectedIds);
    if (!ids.every(id => idOK(id) && data[source].includes(id))) throw new Error('复习范围不正确');
    if (!ids.length) throw new Error(source === 'weak' ? '还没有待巩固的题目' : '请先把读完的题目加入复习');
    const id = makeId(); if (!tokenOK(id)) throw new Error('本轮编号不正确');
    data.round = { id, source, ids, mode: data.mode, phase: 'review', index: 0, results: [], draft: '',
      hinted: data.mode === 'qa', revealed: false, startedAt: at(), updatedAt: at() };
    save(); return data.round;
  }
  function update(fields) { const round = current(); Object.assign(round, fields, { updatedAt: at() }); return save(); }
  function submit(value) {
    const round = current();
    if (round.results[round.index]) return round.results[round.index];
    let result = { questionId: round.ids[round.index], eventId: `${round.id}-${round.index}`, at: at(), hinted: round.hinted, recorded: false };
    if (round.mode === 'oral') {
      if (!round.revealed || !Object.hasOwn(RECALL_LABELS, value.rating)) throw new Error('请先查看答案，再进行自评');
      result.rating = value.rating;
    } else {
      if (!round.draft.trim() || !Number.isFinite(value.score) || value.score < 0 || value.score > 1) throw new Error('请先输入有效作答');
      result = { ...result, score: value.score, ok: Math.round(value.score * 100) >= 80 };
    }
    round.results.push(result); round.revealed = true; round.updatedAt = at();
    data.pending = data.pending.filter(id => id !== result.questionId);
    const needsWork = round.mode === 'oral' ? result.rating !== 'remembered' : !result.ok;
    data.weak = data.weak.filter(id => id !== result.questionId);
    if (needsWork) data.weak.push(result.questionId);
    save(); return result;
  }
  function advance() {
    const round = current(); if (!round.results[round.index]) throw new Error('请先完成本题复习');
    round.index++; round.draft = ''; round.revealed = false; round.hinted = round.mode === 'qa'; round.updatedAt = at();
    if (round.index === round.ids.length) round.phase = 'complete';
    save(); return round.phase;
  }
  function markRecorded(eventId) {
    const result = data.round?.results.find(value => value.eventId === eventId);
    if (result) { result.recorded = true; save(); }
  }
  function returnPosition(completed = false) {
    const position = data.reading; if (!position) return null;
    const wasRead = data.pending.includes(position.id) || data.round?.ids.includes(position.id);
    return { ...position, id: completed && wasRead && position.nextId !== null ? position.nextId : position.id };
  }
  function reconcile(questions) {
    const available = new Set(questions.map(q => q.id));
    const missing = data.round?.ids.some(id => !available.has(id));
    const before = JSON.stringify(data);
    data.pending = data.pending.filter(id => available.has(id)); data.weak = data.weak.filter(id => available.has(id));
    if (missing) {
      data.pending = unique([...data.round.ids.filter(id => available.has(id) && !data.round.results.some(r => r.questionId === id)), ...data.pending]);
      data.round = null;
    }
    if (JSON.stringify(data) !== before) save();
    return Boolean(missing);
  }
  function importBackup(value) {
    const incoming = validateReadingReview(value);
    const merged = validateReadingReview(data);
    merged.pending = unique([...merged.pending, ...incoming.pending]); merged.weak = unique([...merged.weak, ...incoming.weak]);
    if (incoming.reading && (!merged.reading || Date.parse(incoming.reading.at) > Date.parse(merged.reading.at))) merged.reading = incoming.reading;
    // Keep an unfinished local round. Importing a backup must not replace it silently.
    if (incoming.round && merged.round?.phase !== 'review' && (!merged.round || Date.parse(incoming.round.updatedAt) > Date.parse(merged.round.updatedAt))) merged.round = incoming.round;
    // Pending can deliberately include a question answered earlier in this round:
    // the reader may have added it again while this round was paused.
    data = merged; return save();
  }
  return {
    get data() { return data; }, get error() { return error; }, add, remove, remember, begin, submit, advance, markRecorded, returnPosition, reconcile, save,
    hint() { return update({ hinted: true }); }, reveal() { return update({ revealed: true }); },
    draft(value) { if (typeof value !== 'string' || value.length > 10000) throw new Error('答案最长为 10000 字符'); return update({ draft: value }); },
    mode(value) { if (!Object.hasOwn(REVIEW_MODES, value)) throw new Error('复习方式不正确'); data.mode = value; return save(); },
    validate: validateReadingReview, importBackup,
    exportBackup() { return clone({ ...data, app: 'recite-helper-reading-review', ...(original !== null ? { unreadableOriginal: original } : {}) }); },
  };
}
