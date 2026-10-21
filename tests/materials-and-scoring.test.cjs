const assert = require('node:assert/strict');
const test = require('node:test');
let loadQuestions, norm, analyze, diffScore, renderDiff;

test.before(async () => {
  ({ loadQuestions } = await import('../src/services/materials.js'));
  ({ norm, analyze, diffScore, renderDiff } = await import('../src/services/scoring.js'));
});

test('loading a question bank preserves stable IDs and reports fetch and format errors', async () => {
  const data = { questions: [{ id: 7, ch: '章节', src: '题目', ans: '答案' }] };
  const loaded = await loadQuestions('questions.json', async () => ({ ok: true, json: async () => data }));
  assert.equal(loaded.questions[0].id, 7);
  await assert.rejects(loadQuestions('missing.json', async () => ({ ok: false, status: 404 })), /404/);
  await assert.rejects(loadQuestions('bad.json', async () => ({ ok: true, json: async () => ({ questions: [] }) })), /格式/);
  await assert.rejects(loadQuestions('bad.json', async () => ({ ok: true, json: async () => ({ questions: [...data.questions, ...data.questions] }) })), /编号/);
});

test('scoring still ignores punctuation, spaces, and letter case', () => {
  const answer = '音乐 Art 2026';
  const input = ' 音乐，ART！2026。';
  assert.equal(norm(input), norm(answer));
  assert.equal(diffScore(analyze(input), analyze(answer)).f1, 1);
  assert.equal(diffScore(analyze('音乐'), analyze('音乐艺术')).f1, 2 / 3);
  assert.equal(diffScore(analyze('完全错误'), analyze('音乐艺术')).f1, 0);
});

test('answer differences retain source text while escaping HTML', () => {
  const analysis = analyze('<音乐&>');
  const marked = renderDiff(analysis, [true, false], 'm');
  assert.equal(marked, '&lt;<span class="m">音</span>乐&amp;&gt;');
});
