import { DATA, S } from '../app/state.js';
import { studyStore, readingReviewStore as review } from '../app/store.js';
import { startScreen } from '../app/navigation.js';
import { RECALL_LABELS, REVIEW_MODES } from '../services/reading-review.js';
import { syncReadingReviewHistory } from '../services/reading-review-history.js';
import { analyze, diffScore, renderDiff } from '../services/scoring.js';
import { downloadMusicBackup } from '../shared/music-backup.js';
import { $, el, escHtml, toast } from '../shared/dom.js';

const questionFor = id => DATA.questions.find(q => q.id === id);
const needsWork = (round, result) => round.mode === 'oral' ? result.rating !== 'remembered' : !result.ok;
const resultLabel = (round, result) => round.mode === 'oral' ? RECALL_LABELS[result.rating] : `${Math.round(result.score * 100)} 分 · ${result.ok ? '通过' : '待巩固'}`;

function returnToReading(completed = false) {
  startScreen('read', { restore: true, position: review.returnPosition(completed) });
}

function startReadingReview({ source = 'pending', ids } = {}) {
  review.reconcile(DATA.questions);
  syncReadingReviewHistory(review, studyStore, DATA.questions);
  try { review.begin(source, ids); }
  catch (error) { toast(error.message); returnToReading(); return; }
  S.screen = 'reading-review';
  window.history.replaceState(null, '', '#music-review');
  document.onkeydown = null;
  renderReadingReview(true);
}

function sidebar(round) {
  const panel = el('div', 'rr-side');
  panel.innerHTML = `<h2>本轮复习清单</h2><p class="study-note">只复习开始时选定的 ${round.ids.length} 题</p>
    <p class="rr-side-count">${round.results.length}<small> / ${round.ids.length} 已完成</small></p>
    <div class="prog"><div class="prog-val" style="width:${round.results.length / round.ids.length * 100}%"></div></div>`;
  const list = el('ol', 'rr-side-list');
  round.ids.forEach((id, index) => {
    const result = round.results[index];
    const item = el('li', index === round.index ? 'current' : '', `<span>${escHtml(questionFor(id).src)}</span><small>${result ? escHtml(resultLabel(round, result)) : index === round.index ? '正在回忆' : '待复习'}</small>`);
    if (index === round.index) item.setAttribute('aria-current', 'step');
    list.appendChild(item);
  });
  const details = el('details', 'rr-side-details', '<summary>查看本轮题目</summary>');
  details.open = window.matchMedia('(min-width: 921px)').matches;
  details.appendChild(list); panel.appendChild(details);
  const back = el('button', 'btn-ghost', round.phase === 'complete' ? '返回阅读' : '暂存并返回阅读');
  back.onclick = () => returnToReading(round.phase === 'complete');panel.appendChild(back);
  $('#sidebar').replaceChildren(panel);
}

function addStorageMessage(screen) {
  if (!review.error && !studyStore.error) return;
  const notice = el('div', 'study-alert', `<p role="status">${escHtml(review.error || studyStore.error)}</p>`);
  const backup = el('button', 'study-link', '导出记录与进度备份');
  backup.onclick = downloadMusicBackup;notice.appendChild(backup);screen.appendChild(notice);
}

function addHints(card, q) {
  const keywords = Array.isArray(q.kw) ? q.kw : [];
  card.appendChild(el('div', 'rr-hints', `<p class="study-note">关键词提示</p><div class="kw-chips">${keywords.length ? keywords.map(k => `<span class="kchip">${escHtml(k)}</span>`).join('') : '<span class="study-note">本题没有关键词，可直接查看答案。</span>'}</div>`));
}

function addNext(card, round) {
  const next = el('button', 'btn-primary', round.index === round.ids.length - 1 ? '查看本轮小结' : '下一题 →');
  next.onclick = () => { review.advance(); renderReadingReview(true); };
  card.appendChild(next);
}

function renderOral(card, q, round) {
  const result = round.results[round.index];
  card.appendChild(el('p', 'rr-instruction', '先凭题目口头背诵，再展开原文核对。'));
  if (round.hinted) addHints(card, q);
  if (!round.revealed) {
    const actions = el('div', 'rr-actions');
    if (!round.hinted) {
      const hint = el('button', 'btn-ghost', '想不起来，给我提示');
      hint.onclick = () => { review.hint(); renderReadingReview(); };actions.appendChild(hint);
    }
    const reveal = el('button', 'btn-primary', '背完了，查看答案');
    reveal.onclick = () => { review.reveal(); renderReadingReview(); $('#reviewAnswer')?.focus(); };
    actions.appendChild(reveal);card.appendChild(actions);
    card.appendChild(el('p', 'study-note', '这里不会录音，也不会自动判分。想不起来也可以展开答案，再选择“没背出”。'));
    return;
  }
  const answer = el('section', 'rr-answer', `<h3 id="reviewAnswer" tabindex="-1">原文答案</h3><div>${escHtml(q.ans)}</div>`);card.appendChild(answer);
  if (!result) {
    card.appendChild(el('p', 'rr-instruction', '对照原文，这一次背得怎么样？'));
    const ratings = el('div', 'rr-ratings');
    for (const [rating, label] of Object.entries(RECALL_LABELS)) {
      const button = el('button', rating === 'remembered' ? 'btn-primary' : 'btn-ghost', label);
      button.onclick = () => {
        review.submit({ rating });
        syncReadingReviewHistory(review, studyStore, DATA.questions);
        review.advance(); renderReadingReview(true);
      };ratings.appendChild(button);
    }
    card.appendChild(ratings);
    card.appendChild(el('p', 'study-note', `${round.hinted ? '本题用过关键词提示，会一并记下。' : ''}自评仅记录你的掌握感受，不计入自动判分的“通过”。`));
  } else {
    card.appendChild(el('p', 'rr-feedback', `已记录：${escHtml(resultLabel(round, result))}${result.hinted ? '（用过提示）' : ''}`));
    addNext(card, round);
  }
}

function renderWritten(card, q, round) {
  const result = round.results[round.index];
  if (round.mode === 'qa') addHints(card, q);
  card.appendChild(el('p', 'rr-instruction', round.mode === 'qa' ? '凭关键词回忆，并输入完整答案。' : '凭题目回忆，并输入完整答案。'));
  const label = el('label', 'study-note', '我的作答');label.htmlFor = 'readingReviewDraft';card.appendChild(label);
  const input = el('textarea');input.id = 'readingReviewDraft';input.value = round.draft;
  input.maxLength = 10000;input.placeholder = '输入回忆的内容…';input.disabled = Boolean(result);
  input.oninput = () => {
    review.draft(input.value);
    if (review.error && !card.querySelector('.rr-save-error')) {
      const error = el('p', 'study-alert rr-save-error', escHtml(review.error));error.setAttribute('role', 'status');
      const backup = el('button', 'study-link', '导出备份');backup.onclick = downloadMusicBackup;error.appendChild(backup);card.appendChild(error);
    }
  };
  card.appendChild(input);
  if (!result) {
    const submit = el('button', 'btn-primary', '提交并核对答案');
    submit.onclick = () => {
      if (!analyze(input.value).nChars.length) { toast('请先输入答案'); input.focus(); return; }
      review.draft(input.value);
      review.submit({ score: diffScore(analyze(input.value), analyze(q.ans)).f1 });
      syncReadingReviewHistory(review, studyStore, DATA.questions);renderReadingReview();$('#reviewFeedback')?.focus();
    };
    input.onkeydown = e => { if (!e.isComposing && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault();submit.click(); } };
    card.appendChild(submit);
    card.appendChild(el('p', 'study-note', '草稿自动暂存；内容相似度达到 80 分记为通过，忽略标点与空格。此分数仅作文字核对参考。'));
  } else {
    const mine = analyze(round.draft), original = analyze(q.ans), diff = diffScore(mine, original);
    card.appendChild(el('h3', 'rr-feedback', `<span id="reviewFeedback" tabindex="-1">${escHtml(resultLabel(round, result))}</span>`));
    card.appendChild(el('div', 'diffbox', `<p class="diff-label">我的作答 · 红色为未匹配内容</p><div class="diff-text">${renderDiff(mine, diff.mA.map(v => !v), 'x')}</div>`));
    card.appendChild(el('div', 'diffbox', `<p class="diff-label">原文答案 · 黄色为遗漏内容</p><div class="diff-text">${renderDiff(original, diff.mB.map(v => !v), 'm')}</div>`));
    addNext(card, round);
  }
}

function renderSummary(screen, round) {
  const weak = round.results.filter(result => needsWork(round, result)).map(r => r.questionId);
  const section = el('section', 'rr-card');
  section.innerHTML = `<p class="rr-eyebrow">这一轮完成了</p><h1 id="reviewTitle" tabindex="-1">给刚读过的内容一次回忆</h1><p class="rr-instruction">已复习 ${round.ids.length} 题 · ${escHtml(REVIEW_MODES[round.mode])}</p>`;
  const counts = round.mode === 'oral'
    ? Object.entries(RECALL_LABELS).map(([key, label]) => [label, round.results.filter(r => r.rating === key).length])
    : [['通过', round.results.length - weak.length], ['待巩固', weak.length]];
  section.appendChild(el('div', 'rr-stats', counts.map(([label, count]) => `<div><b>${count}</b><span>${label}</span></div>`).join('')));
  section.appendChild(el('p', 'study-note', round.mode === 'oral' ? `以上为你的自评；${round.results.filter(r => r.hinted).length} 题用过提示。` : '分数为文字相似度，不能代替对知识理解的判断。'));
  const list = el('ul', 'rr-results');
  round.results.forEach(result => list.appendChild(el('li', '', `<span>${escHtml(questionFor(result.questionId).src)}</span><b>${escHtml(resultLabel(round, result))}${result.hinted && round.mode === 'oral' ? ' · 用过提示' : ''}</b>`)));
  section.appendChild(list);
  const actions = el('div', 'rr-actions');
  const back = el('button', 'btn-primary', '继续阅读 →');back.onclick = () => returnToReading(true);actions.appendChild(back);
  if (weak.length) {
    const retry = el('button', 'btn-ghost', `再背本轮待巩固的 ${weak.length} 题`);
    retry.onclick = () => { review.mode(round.mode); startReadingReview({ source: 'weak', ids: weak }); };actions.appendChild(retry);
  }
  section.appendChild(actions);
  if (review.data.pending.length) section.appendChild(el('p', 'study-note', `清单里还有 ${review.data.pending.length} 题，返回阅读后可开始下一轮。`));
  screen.appendChild(section);
}

function renderReadingReview(focus = false) {
  syncReadingReviewHistory(review, studyStore, DATA.questions);
  const round = review.data.round;
  if (!round) { returnToReading(); return; }
  S.screen = 'reading-review';document.body.dataset.screen = S.screen;
  sidebar(round);
  const screen = el('div', 'screen fade reading-review-screen');
  if (round.phase === 'complete') renderSummary(screen, round);
  else {
    const q = questionFor(round.ids[round.index]);
    const head = el('div', 'rr-heading', `<div><p class="rr-eyebrow">音乐 · 读后复习</p><h1>第 ${round.index + 1} / ${round.ids.length} 题</h1><p class="study-note">${escHtml(REVIEW_MODES[round.mode])}</p></div>`);
    const pause = el('button', 'study-link', '暂存，返回阅读');pause.onclick = () => returnToReading();head.appendChild(pause);screen.appendChild(head);
    const card = el('section', 'rr-card', `<p class="rr-eyebrow">${escHtml(q.ch)}</p><h2 id="reviewTitle" tabindex="-1">${escHtml(q.src)}</h2>`);
    if (round.mode === 'oral') renderOral(card, q, round);else renderWritten(card, q, round);
    screen.appendChild(card);
  }
  addStorageMessage(screen);$('#main').replaceChildren(screen);
  if (focus) $('#reviewTitle')?.focus();
}

export { startReadingReview, renderReadingReview };
