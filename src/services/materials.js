export async function loadQuestions(url, fetcher = globalThis.fetch) {
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`资料加载失败（${response.status}）`);
  const data = await response.json();
  if (!Array.isArray(data.questions) || !data.questions.length) {
    throw new Error('题库格式不正确');
  }
  const ids = new Set();
  for (const question of data.questions) {
    if (!Number.isSafeInteger(question.id) || question.id < 0 || ids.has(question.id)
      || typeof question.ch !== 'string' || typeof question.src !== 'string'
      || typeof question.ans !== 'string') {
      throw new Error('题目编号或内容格式不正确');
    }
    ids.add(question.id);
  }
  return data;
}
