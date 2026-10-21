const test = require('node:test');
const assert = require('node:assert/strict');
process.env.TZ = 'Asia/Shanghai';

let createReadingReview, validateReadingReview, READING_REVIEW_KEY, createStudyStore;
let syncReadingReviewHistory, exportMusicBackup, importMusicBackup, analyze, diffScore;
let sequence = 0;
const questions = Array.from({ length: 20 }, (_, id) => ({ id, ch: id < 10 ? '第一章' : '第二章', src: `第 ${id + 1} 题`, ans: '音乐是听觉艺术', kw: ['听觉'] }));
test.before(async () => {
  ({ createReadingReview, validateReadingReview, READING_REVIEW_KEY } = await import('../src/services/reading-review.js'));
  ({ createStudyStore } = await import('../src/services/study-history.js'));
  ({ syncReadingReviewHistory } = await import('../src/services/reading-review-history.js'));
  ({ exportMusicBackup, importMusicBackup } = await import('../src/services/music-backup.js'));
  ({ analyze, diffScore } = await import('../src/services/scoring.js'));
});

function setup(storage = new Map()) {
  let instant = '2026-10-21T10:00:00+08:00', failReview = false, failStudy = false;
  const api = {
    getItem: key => storage.get(key) ?? null,
    setItem(key, value) {
      if (key === READING_REVIEW_KEY ? failReview : failStudy) throw new Error('Quota');
      storage.set(key, value);
    },
  };
  const options = { storage: () => api, now: () => new Date(instant) };
  const review = createReadingReview({ ...options, makeId: () => `test-${++sequence}` });
  const study = createStudyStore(options);
  const sync = () => syncReadingReviewHistory(review, study, questions);
  return {
    review, study, storage, sync,
    at: value => { instant = value; },
    fail: (r, s = false) => { failReview = r; failStudy = s; },
    read(id) { study.record(questions[id], 'read'); return review.add(id); },
    oral(rating = 'remembered') { review.reveal(); const result = review.submit({ rating }); sync(); review.advance(); return result; },
  };
}

test('browsing saves a stable question ID and chapter scope without creating a check-in', () => {
  const e = setup();e.review.remember(4, 5, ['第一章']);
  assert.deepEqual(e.review.data.pending, []);
  assert.equal(e.study.summary(e.study.dateKey()).total, 0);
  assert.equal(setup(e.storage).review.data.reading.id, 4);
  assert.deepEqual(setup(e.storage).review.data.reading.chapters, ['第一章']);
});

test('one question is enough; repeated read confirmations do not duplicate queue or daily count', () => {
  const e = setup();e.read(0);e.read(0);
  assert.deepEqual(e.review.data.pending, [0]);
  assert.equal(e.study.summary(e.study.dateKey()).read, 1);
  assert.deepEqual(e.review.begin().ids, [0]);
});

test('queue edits apply before starting while an active snapshot is protected', () => {
  const e = setup();[0, 1, 2].forEach(id => e.read(id));e.review.remove(1);
  assert.deepEqual(e.review.begin().ids, [0, 2]);
  assert.throws(() => e.review.remove(0), /本轮题目已固定/);
  e.read(3);e.review.remove(3);assert.deepEqual(e.review.data.pending, [0, 2]);
  assert.equal(e.study.summary(e.study.dateKey()).read, 4);
});

test('a completed question can enter another round on the same day', () => {
  const e = setup();e.read(0);e.review.begin();e.oral();e.read(0);e.review.begin();e.oral();
  const summary = e.study.summary(e.study.dateKey());
  assert.equal(summary.read, 1);assert.equal(summary.recall, 1);
  assert.equal(summary.items[0].activities.recall.count, 2);
});

test('five-question snapshot excludes later reads and returns to the next reading question', () => {
  const e = setup();for (let id = 0; id < 5; id++) e.read(id);
  e.review.remember(4, 5, ['第一章']);e.review.begin();e.oral();
  e.read(8);e.review.mode('full');
  assert.deepEqual(e.review.begin().ids, [0, 1, 2, 3, 4]);
  assert.equal(e.review.data.round.mode, 'oral');
  for (let n = 0; n < 4; n++) e.oral();
  assert.deepEqual(e.review.data.pending, [8]);
  assert.equal(e.review.returnPosition(true).id, 5);
  assert.deepEqual(e.review.begin().ids, [8]);
  assert.equal(e.review.data.round.mode, 'full');
});

test('pausing preserves the reading position; finishing the last question never moves out of range', () => {
  const e = setup();e.read(19);e.review.remember(19, null, ['第二章']);e.review.begin();
  assert.equal(e.review.returnPosition(false).id, 19);e.oral();
  assert.equal(e.review.returnPosition(true).id, 19);
});

test('oral recall requires revealing the answer and keeps hinted self-assessment out of automatic scores', () => {
  const e = setup();e.read(0);e.review.begin();
  assert.throws(() => e.review.submit({ rating: 'remembered' }), /先查看答案/);
  e.review.hint();e.oral('unsure');
  const summary = e.study.summary(e.study.dateKey()), a = summary.items[0].activities.recall;
  assert.equal(summary.recall, 1);assert.equal(summary.practiced, 0);assert.equal(summary.passed, 0);assert.equal(summary.attempts, 0);
  assert.equal(a.lastRating, 'unsure');assert.equal(a.lastAssisted, true);assert.equal(a.lastScore, undefined);
  assert.deepEqual(e.review.data.weak, [0]);
});

test('refresh restores revealed answers, hints, and oral progress without repeating submissions', () => {
  const e = setup();e.read(0);e.read(1);e.review.begin();e.oral();e.review.hint();e.review.reveal();
  const loaded = setup(e.storage);
  assert.equal(loaded.review.data.round.index, 1);assert.equal(loaded.review.data.round.hinted, true);assert.equal(loaded.review.data.round.revealed, true);
  loaded.sync();loaded.sync();
  assert.equal(loaded.study.summary(loaded.study.dateKey()).items[0].activities.recall.count, 1);
});

test('a crash after submit but before advance resumes feedback instead of counting the answer twice', () => {
  const e = setup();e.read(0);e.review.begin();e.review.reveal();e.review.submit({ rating: 'forgot' });
  const loaded = setup(e.storage);loaded.sync();loaded.sync();loaded.review.submit({ rating: 'remembered' });
  assert.equal(loaded.review.data.round.results[0].rating, 'forgot');
  assert.equal(loaded.study.summary(loaded.study.dateKey()).items[0].activities.recall.count, 1);
  loaded.review.advance();assert.equal(loaded.review.data.round.phase, 'complete');
});

test('a crash between the history write and progress acknowledgment is idempotent across midnight', () => {
  const e = setup();e.at('2026-10-21T23:59:00+08:00');e.read(0);e.review.begin();e.review.reveal();e.review.submit({ rating: 'remembered' });
  const diskBeforeAck = e.storage.get(READING_REVIEW_KEY);e.sync();
  e.storage.set(READING_REVIEW_KEY, diskBeforeAck);
  const loaded = setup(e.storage);loaded.at('2026-10-22T00:01:00+08:00');loaded.sync();
  assert.equal(loaded.study.summary('2026-10-21').items[0].activities.recall.count, 1);
  assert.equal(loaded.study.summary('2026-10-22').recall, 0);
  assert.equal(loaded.review.data.round.results[0].recorded, true);
});

test('written drafts and scored feedback survive refresh, with the real mode recorded once', () => {
  for (const mode of ['qa', 'full']) {
    const e = setup();e.read(0);e.review.mode(mode);e.review.begin();e.review.draft('音乐，是听觉艺术。');
    const loaded = setup(e.storage), round = loaded.review.data.round;
    assert.equal(round.draft, '音乐，是听觉艺术。');
    const score = diffScore(analyze(round.draft), analyze(questions[0].ans)).f1;
    loaded.review.submit({ score });loaded.sync();loaded.sync();
    const feedback = setup(e.storage);feedback.sync();
    assert.equal(feedback.review.data.round.results[0].score, 1);
    const activity = feedback.study.summary(feedback.study.dateKey()).items[0].activities[mode];
    assert.equal(activity.count, 1);assert.equal(activity.lastScore, 100);assert.equal(activity.passed, 1);
    assert.equal(feedback.study.summary(feedback.study.dateKey()).recall, 0);
  }
});

test('written mode rejects empty submissions and a second submit cannot replace the first score', () => {
  const e = setup();e.read(0);e.review.mode('full');e.review.begin();
  assert.throws(() => e.review.submit({ score: 1 }), /输入有效作答/);
  e.review.draft('没记住');e.review.submit({ score: 0.1 });e.review.submit({ score: 1 });
  assert.equal(e.review.data.round.results[0].score, 0.1);
  assert.deepEqual(e.review.data.weak, [0]);
});

test('more than ten questions retain exactly their selected IDs and do not expand into a chapter', () => {
  const e = setup();const selected = [0, 2, 4, 6, 8, 10, 11, 12, 13, 14, 15, 19];
  selected.forEach(id => e.read(id));e.review.begin();
  while (e.review.data.round.phase === 'review') e.oral();
  assert.deepEqual(e.review.data.round.results.map(r => r.questionId), selected);
  assert.equal(e.study.summary(e.study.dateKey()).recall, 12);
});

test('retrying this round’s weak questions does not bring in older weak questions', () => {
  const e = setup();e.read(9);e.review.begin();e.oral('forgot');
  [0, 1, 2].forEach(id => e.read(id));e.review.begin();e.oral('remembered');e.oral('unsure');e.oral('forgot');
  const retryIds = e.review.data.round.results.filter(r => r.rating !== 'remembered').map(r => r.questionId);
  assert.deepEqual(e.review.begin('weak', retryIds).ids, [1, 2]);
  e.oral();e.oral();assert.deepEqual(e.review.data.weak, [9]);
});

test('questions deliberately re-added while a round is paused remain for the next round and survive backup', () => {
  const e = setup();e.read(0);e.read(1);e.review.begin();e.oral();e.read(0);
  const backup = e.review.exportBackup();e.review.importBackup(backup);
  assert.deepEqual(e.review.data.pending, [1, 0]);
  e.oral();assert.deepEqual(e.review.data.pending, [0]);
  assert.deepEqual(e.review.begin().ids, [0]);
});

test('reading again on a later day confirms the new day while queue IDs stay deduplicated', () => {
  const e = setup();e.read(0);e.at('2026-10-22T10:00:00+08:00');e.read(0);
  assert.deepEqual(e.review.data.pending, [0]);
  assert.equal(e.study.summary('2026-10-21').read, 1);assert.equal(e.study.summary('2026-10-22').read, 1);
});

test('combined backup restores drafts and history, and importing invalid review data changes neither', () => {
  const e = setup();e.read(0);e.read(1);e.review.mode('full');e.review.begin();e.review.draft('我的草稿');
  const backup = exportMusicBackup(e.study, e.review), other = setup();
  assert.equal(importMusicBackup(backup, other.study, other.review), true);
  assert.equal(other.review.data.round.draft, '我的草稿');
  assert.equal(other.study.summary(other.study.dateKey()).read, 2);
  const before = exportMusicBackup(other.study, other.review);
  const broken = structuredClone(backup);broken.readingReview.round.index = 100;
  assert.throws(() => importMusicBackup(broken, other.study, other.review), /进度/);
  assert.deepEqual(exportMusicBackup(other.study, other.review), before);
});

test('legacy history-only backups work and importing another round preserves the unfinished local round', () => {
  const e = setup();e.read(0);e.review.begin();
  const other = setup();other.read(1);other.review.mode('full');other.review.begin();
  assert.equal(importMusicBackup(other.study.exportBackup(), e.study, e.review), true);
  const localId = e.review.data.round.id;e.review.importBackup(other.review.exportBackup());
  assert.equal(e.review.data.round.id, localId);assert.deepEqual(e.review.data.round.ids, [0]);
  assert.deepEqual(e.review.data.pending, [0, 1]);
});

test('storage failure retains current work, recovers without duplicate history, and exports progress', () => {
  const e = setup();e.read(0);e.review.begin();e.fail(true, true);e.review.reveal();e.review.submit({ rating: 'unsure' });e.sync();
  assert.match(e.review.error, /导出备份/);assert.equal(e.review.data.round.results[0].recorded, false);
  assert.equal(exportMusicBackup(e.study, e.review).readingReview.round.results.length, 1);
  e.fail(false, false);e.sync();
  assert.equal(e.review.data.round.results[0].recorded, true);
  assert.equal(setup(e.storage).study.summary('2026-10-21').items[0].activities.recall.count, 1);
});

test('corrupt stored progress is preserved and can be exported alongside new in-memory work', () => {
  const storage = new Map([[READING_REVIEW_KEY, '{old-broken-progress']]);const e = setup(storage);e.review.add(0);
  assert.equal(storage.get(READING_REVIEW_KEY), '{old-broken-progress');
  assert.equal(e.review.exportBackup().unreadableOriginal, '{old-broken-progress');
  assert.deepEqual(e.review.data.pending, [0]);assert.match(e.review.error, /原复习进度/);
});

test('material changes recover known unanswered questions without substituting another question', () => {
  const e = setup();[0, 1, 2].forEach(id => e.read(id));e.review.begin();e.oral();
  assert.equal(e.review.reconcile(questions.filter(q => q.id !== 1)), true);
  assert.equal(e.review.data.round, null);assert.deepEqual(e.review.data.pending, [2]);
});

test('backup validation rejects duplicate IDs, false completion, invalid scores and prototype mode names', () => {
  const e = setup();e.read(0);e.review.mode('full');e.review.begin();e.review.draft('答案');e.review.submit({ score: 0.5 });
  const original = e.review.exportBackup();
  for (const mutate of [
    b => { b.pending = [0, 0]; }, b => { b.mode = 'constructor'; },
    b => { b.round.phase = 'complete'; }, b => { b.round.results[0].ok = true; },
    b => { b.round.results[0].eventId = 'other-event'; }, b => { b.round.draft = 'x'.repeat(10001); },
  ]) {
    const bad = structuredClone(original);mutate(bad);assert.throws(() => validateReadingReview(bad));
  }
  assert.deepEqual(validateReadingReview(original), e.review.data);
});

test('newer self-assessment survives replay of an earlier event and repeated backup imports', () => {
  const e = setup();const q = questions[0];
  e.study.record(q, 'recall', { eventId: 'new', at: '2026-10-21T11:00:00+08:00', rating: 'remembered' });
  e.study.record(q, 'recall', { eventId: 'old', at: '2026-10-21T10:00:00+08:00', rating: 'forgot' });
  const backup = e.study.exportBackup();e.study.importBackup(backup);e.study.importBackup(backup);
  e.study.record(q, 'recall', { eventId: 'old', at: '2026-10-21T10:00:00+08:00', rating: 'forgot' });
  const activity = e.study.summary(e.study.dateKey()).items[0].activities.recall;
  assert.equal(activity.lastRating, 'remembered');assert.equal(activity.count, 2);assert.deepEqual(activity.eventIds, ['new', 'old']);
});
