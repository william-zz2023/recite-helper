import { S } from '../app/state.js';
import { exitToHome, startScreen } from '../app/navigation.js';
import { createPoliticsLibrary, searchPoliticsItems } from '../services/politics-library.js';
import { createPoliticsProgress } from '../services/politics-progress.js';
import { renderPoliticsBlock } from './politics-content.js';
import { $, el, escHtml, toast } from '../shared/dom.js';
import { subjectTabs } from '../shared/subject-tabs.js';

const library = createPoliticsLibrary(), progress = createPoliticsProgress();
const view = { book: null, books: [], topic: null, active: null, query: '', hidden: new Set(), history: false, day: progress.today(), request: 0 };
const items = () => view.book.topics.flatMap(t => t.items);
const topic = () => view.book.topics.find(t => t.id === view.topic);
const activeItem = () => items().find(item => item.id === view.active);
const confirmed = item => Boolean(progress.data.days[progress.today()]?.[`${view.book.id}:${item.id}`]);
const marked = item => Boolean(progress.data.bookmarks[view.book.id]?.[item.id]);
const sourceLabel = page => `PDF 第 ${page.pdfPage} 页${page.bookPage === null ? '' : ` · 原书第 ${page.bookPage} 页`}`;
let directoryDialog, sourceDialog;
const closeDirectory = () => { if (directoryDialog?.open) directoryDialog.close(); };
function leavePolitics() { closeDirectory(); sourceDialog?.close(); exitToHome(); }

function renderHeader() {
  let header = $('#politicsHeader');
  if (!header) {
    header = el('div', 'politics-header'); header.id = 'politicsHeader';
    header.innerHTML = '<button type="button" class="politics-menu" aria-label="打开学习目录" aria-haspopup="dialog">☰</button><span class="politics-mobile-title">政治复习</span><div class="politics-header-tabs"></div><button type="button" class="politics-header-history">打卡记录</button>';
    $('.topbar').appendChild(header);
  }
  header.querySelector('.politics-header-tabs').replaceChildren(subjectTabs('politics', leavePolitics, () => { view.history = false; view.query = ''; renderPolitics(); }));
  header.querySelector('.politics-menu').onclick = openDirectory;
  header.querySelector('.politics-header-history').onclick = () => { view.history = !view.history; view.query = ''; renderPolitics(); window.scrollTo(0, 0); };
}

function placeholder(message, retry = false) {
  const container = el('section', 'study-card politics-loading');
  container.innerHTML = `<h1>政治复习</h1><p role="${retry ? 'alert' : 'status'}">${escHtml(message)}</p>`;
  const back = el('button', 'study-link', '返回音乐背诵'); back.onclick = leavePolitics; container.appendChild(back);
  if (retry) { const button = el('button', 'study-link', '重新加载'); button.onclick = () => startPolitics(view.book?.id); container.appendChild(button); }
  $('#sidebar').replaceChildren(el('p', 'study-note', '学习目录')); $('#main').replaceChildren(container);
}

function resolveItem(record = {}) {
  const all = items();
  return all.find(item => item.id === record.unitId) || all.find(item => item.sourcePages.includes(record.page))
    || all.find(item => item.sourcePages[0] >= record.page) || all[0];
}

export async function startPolitics(id) {
  S.screen = 'politics'; document.body.dataset.screen = 'politics'; document.onkeydown = null;
  window.history.replaceState(null, '', '#politics'); closeDirectory();
  const generation = ++view.request; renderHeader(); placeholder('正在加载背诵手册…');
  try {
    const books = await library.catalog();
    const latest = Object.entries(progress.data.positions).filter(([key]) => books.some(b => b.id === key)).sort((a, b) => Date.parse(b[1].at) - Date.parse(a[1].at))[0]?.[0];
    const book = await library.load(id || view.book?.id || latest || books[0].id);
    if (generation !== view.request || S.screen !== 'politics') return false;
    if (!book.topics.length) throw new Error('连续阅读资料尚未准备好，请刷新后重试。');
    view.books = books; view.book = book;
    const item = resolveItem(progress.data.positions[book.id]);
    view.active = item.id; view.topic = book.topics.find(t => t.items.includes(item)).id;
    view.query = ''; view.history = false; view.hidden.clear(); view.day = progress.today();
    progress.remember(book.id, item.sourcePages[0], item.id); renderPolitics();
    if (item !== topic().items[0]) scrollToItem(item.id);
    return true;
  } catch (error) { if (generation === view.request && S.screen === 'politics') placeholder(error.message, true); return false; }
}

function scrollToItem(id, focus = false) {
  requestAnimationFrame(() => {
    const target = document.getElementById(`item-${id}`); if (!target || S.screen !== 'politics') return;
    window.scrollTo({ top: Math.max(0, target.getBoundingClientRect().top + window.scrollY - $('.topbar').offsetHeight - 16), behavior: 'instant' });
    if (focus) target.querySelector('h2').focus({ preventScroll: true });
    setActive(id);
  });
}

function jumpToItem(id) {
  const selected = view.book.topics.find(t => t.items.some(item => item.id === id)); if (!selected) return;
  closeDirectory(); view.active = id; view.topic = selected.id; view.history = false; view.query = '';
  const item = selected.items.find(q => q.id === id); progress.remember(view.book.id, item.sourcePages[0], id);
  renderPolitics(); scrollToItem(id, true);
}
function showTopic(id) { const selected = view.book.topics.find(t => t.id === id); if (selected) jumpToItem(selected.items[0].id); }

function directoryContents() {
  const book = view.book, bookmarks = Object.values(progress.data.bookmarks[book.id] || {}).sort((a, b) => a.page - b.page);
  return `<div class="politics-directory-body"><h2>学习目录</h2><div class="politics-volumes">${view.books.map(b => `<button type="button" data-volume="${b.id}" aria-pressed="${b.id === book.id}">${escHtml(b.volume)}</button>`).join('')}</div>
    <form class="politics-search" role="search"><label><span class="visually-hidden">搜索本册知识点</span><input name="query" type="search" placeholder="搜索知识点" value="${escHtml(view.query)}" required></label><button type="submit" aria-label="搜索">搜索</button></form>
    <nav aria-label="政治学习目录">${book.sections.map(section => `<details class="politics-section" ${topic()?.sectionNumber === section.number ? 'open' : ''}><summary>${escHtml(section.title)}</summary>${book.topics.filter(t => t.sectionNumber === section.number).map(t => `<details class="politics-topic" ${t.id === view.topic ? 'open' : ''}><summary class="${t.id === view.topic ? 'selected' : ''}">${escHtml(t.label ? `${t.label} ${t.title}` : t.title)}</summary><div>${t.items.map(item => `<button type="button" class="politics-toc-item${item.id === view.active ? ' active' : ''}" data-jump="${item.id}" ${item.id === view.active ? 'aria-current="location"' : ''}>${escHtml(item.number ? `${item.number}. ${item.title}` : item.title)}</button>`).join('')}</div></details>`).join('')}</details>`).join('')}</nav>
    <details class="politics-bookmarks"><summary>我的书签 <span>${bookmarks.length || ''}</span></summary>${bookmarks.length ? bookmarks.map(entry => `<button type="button" class="politics-toc-item" data-jump="${resolveItem(entry).id}">${escHtml(entry.title)}${entry.unitId ? '' : '（旧版页书签）'}</button>`).join('') : '<p class="study-note">在题目下方点击“收藏本题”。</p>'}</details>
    <div class="politics-directory-foot"><a href="${escHtml(book.textUrl.href)}" download>下载逐页 TXT</a><button type="button" data-back-music>返回音乐背诵</button></div></div>`;
}

function bindDirectory(container) {
  container.querySelectorAll('[data-volume]').forEach(button => { button.onclick = () => { closeDirectory(); startScreen('politics', button.dataset.volume); }; });
  container.querySelectorAll('[data-jump]').forEach(button => { button.onclick = () => jumpToItem(button.dataset.jump); });
  container.querySelector('[data-back-music]').onclick = leavePolitics;
  container.querySelector('.politics-search').onsubmit = event => {
    event.preventDefault(); view.query = new FormData(event.target).get('query').trim(); if (!view.query) return;
    closeDirectory(); view.history = false; renderPolitics(); window.scrollTo(0, 0);
  };
}
function renderSidebar() { $('#sidebar').innerHTML = directoryContents(); bindDirectory($('#sidebar')); }

function openDirectory() {
  if (!view.book) return;
  if (!directoryDialog) {
    directoryDialog = el('dialog', 'politics-directory-dialog'); directoryDialog.setAttribute('aria-label', '学习目录'); document.body.appendChild(directoryDialog);
    directoryDialog.addEventListener('click', event => { if (event.target === directoryDialog) directoryDialog.close(); });
  }
  directoryDialog.innerHTML = '<button type="button" class="politics-dialog-close" aria-label="关闭目录">×</button>' + directoryContents();
  directoryDialog.querySelector('.politics-dialog-close').onclick = closeDirectory;
  bindDirectory(directoryDialog); directoryDialog.showModal();
}

function openSource(item) {
  if (!sourceDialog) {
    sourceDialog = el('dialog', 'politics-source-dialog'); sourceDialog.setAttribute('aria-labelledby', 'politicsSourceTitle'); document.body.appendChild(sourceDialog);
    sourceDialog.addEventListener('click', event => { if (event.target === sourceDialog) sourceDialog.close(); });
  }
  sourceDialog.innerHTML = `<button type="button" class="politics-dialog-close" aria-label="关闭原文出处">×</button><h2 id="politicsSourceTitle">原文出处</h2><p>${escHtml(view.book.title)} · ${escHtml(item.title)}</p><p class="study-note">以下为逐页识别文字，保留识别行序，供查找来源；仍需结合原 PDF 校对字词、公式与图表关系。</p>${item.sourcePages.map((page, i) => `<details ${i === 0 ? 'open' : ''}><summary>${escHtml(sourceLabel(view.book.pages[page - 1]))}</summary><pre>${escHtml(view.book.pages[page - 1].text)}</pre></details>`).join('')}`;
  sourceDialog.querySelector('.politics-dialog-close').onclick = () => sourceDialog.close(); sourceDialog.showModal();
}

function itemMarkup(item) {
  const read = confirmed(item), hidden = view.hidden.has(item.id);
  return `<section id="item-${item.id}" data-unit="${item.id}" class="politics-item${item.id === view.active ? ' current' : ''}" aria-labelledby="heading-${item.id}"><div class="politics-question-head"><h2 id="heading-${item.id}" tabindex="-1" class="${item.title.length > 65 ? 'long-question' : ''}">${item.number ? `<span class="question-number">${escHtml(item.number.padStart(2, '0'))}</span>` : ''}${escHtml(item.title)}</h2></div>
    ${item.keywords ? `<div class="politics-keywords">${item.keywords.map(word => `<span>${escHtml(word)}</span>`).join('')}</div>` : ''}
    ${item.title.startsWith('干扰项') ? '<p class="politics-trap-label">易错辨析 · 下列为教材中的干扰项，请结合辨析阅读</p>' : ''}
    <div class="politics-answer" id="answer-${item.id}" ${hidden ? 'hidden' : ''}>${item.blocks.map(renderPoliticsBlock).join('')}</div><p class="politics-recall" ${hidden ? '' : 'hidden'}>答案已遮住，先回忆，再展开核对。</p>
    ${item.layoutReview ? '<p class="politics-layout-note">含图表识别内容，关系与符号请核对原文。</p>' : ''}
    <div class="politics-item-actions"><button type="button" data-action="mask" aria-controls="answer-${item.id}" aria-expanded="${!hidden}">${hidden ? '显示答案' : '遮住答案'}</button><button type="button" data-action="confirm" class="politics-item-confirm" ${read ? 'disabled' : ''}>${read ? '✓ 今日已背' : '本题已背'}</button><button type="button" data-action="bookmark" aria-pressed="${marked(item)}">${marked(item) ? '已收藏' : '收藏本题'}</button><button type="button" data-action="source" class="politics-source-link">原文出处 ↗</button></div></section>`;
}

function renderReader(container) {
  const currentTopic = topic(), index = view.book.topics.indexOf(currentTopic), article = el('article', 'politics-reader');
  article.style.setProperty('--reader-font', `${progress.data.readerFontSize}px`);
  article.innerHTML = `<div class="politics-reader-top"><p class="politics-breadcrumb">${escHtml(view.book.volume)} / ${escHtml(currentTopic.section)}${currentTopic.label ? ` / ${escHtml(currentTopic.label)}` : ''}</p><div class="politics-font"><span>字号</span><button type="button" data-font="-1" aria-label="缩小正文" ${progress.data.readerFontSize <= 16 ? 'disabled' : ''}>A−</button><button type="button" data-font="1" aria-label="放大正文" ${progress.data.readerFontSize >= 24 ? 'disabled' : ''}>A+</button></div></div>
    <header class="politics-topic-head"><h1>${escHtml(currentTopic.title)}</h1><p>按知识点连续阅读 <span>· ${currentTopic.items.length} 个知识点</span></p></header><div class="politics-reading-status"><span id="politicsTodayCount"></span><span>识别文本待校对</span></div>
    ${currentTopic.items.map(itemMarkup).join('')}<nav class="politics-topic-nav" aria-label="专题翻阅"><button type="button" data-topic="${view.book.topics[index - 1]?.id || ''}" ${index === 0 ? 'disabled' : ''}>← 上一专题</button><button type="button" data-topic="${view.book.topics[index + 1]?.id || ''}" ${index === view.book.topics.length - 1 ? 'disabled' : ''}>下一专题 →</button></nav>`;
  container.appendChild(article);
  const bar = el('div', 'politics-mobile-actions');
  bar.innerHTML = '<p id="politicsCurrentLabel"></p><div><button type="button" id="politicsMobileMask">遮住答案</button><button type="button" id="politicsMobileConfirm">本题已背</button></div>'; container.appendChild(bar);
  article.addEventListener('click', event => {
    const button = event.target.closest('[data-action]'); if (button) act(button.dataset.action, items().find(item => item.id === button.closest('[data-unit]').dataset.unit));
  });
  article.querySelectorAll('[data-topic]').forEach(button => { button.onclick = () => showTopic(button.dataset.topic); });
  article.querySelectorAll('[data-font]').forEach(button => { button.onclick = () => {
    const id = view.active, offset = document.getElementById(`item-${id}`).getBoundingClientRect().top;
    progress.setFontSize(progress.data.readerFontSize + Number(button.dataset.font)); renderPolitics();
    window.scrollBy(0, document.getElementById(`item-${id}`).getBoundingClientRect().top - offset);
  }; });
  bar.querySelector('#politicsMobileMask').onclick = () => act('mask', activeItem());
  bar.querySelector('#politicsMobileConfirm').onclick = () => act('confirm', activeItem());
}

function act(action, item) {
  if (!item) return;
  if (action === 'source') { openSource(item); return; }
  if (action === 'bookmark') { progress.bookmark(view.book.id, item.sourcePages[0], item.title, topic().section, item.id); renderSidebar(); }
  if (action === 'mask') { if (view.hidden.has(item.id)) view.hidden.delete(item.id); else view.hidden.add(item.id); }
  if (action === 'confirm') {
    const result = progress.confirm(view.book.id, item.sourcePages[0], item.title, topic().section, item.id);
    toast(result.saved ? (result.already ? '今天已记录这道题' : '已记入今日政治打卡') : '记录暂存本页，请导出备份');
  }
  updateItem(item); updateStatus();
  if (action === 'mask') scrollToItem(item.id);
}

function updateItem(item) {
  const section = document.getElementById(`item-${item.id}`); if (!section) return;
  const hidden = view.hidden.has(item.id), read = confirmed(item);
  section.querySelector('.politics-answer').hidden = hidden; section.querySelector('.politics-recall').hidden = !hidden;
  const mask = section.querySelector('[data-action="mask"]'); mask.textContent = hidden ? '显示答案' : '遮住答案'; mask.setAttribute('aria-expanded', String(!hidden));
  const confirm = section.querySelector('[data-action="confirm"]'); confirm.disabled = read; confirm.textContent = read ? '✓ 今日已背' : '本题已背';
  const bookmark = section.querySelector('[data-action="bookmark"]'); bookmark.textContent = marked(item) ? '已收藏' : '收藏本题'; bookmark.setAttribute('aria-pressed', String(marked(item)));
}

function updateStatus() {
  const item = activeItem(); if (!item || view.history || view.query) return;
  const count = progress.summary().filter(record => record.unitId).length;
  $('#politicsTodayCount').textContent = `今日已背 ${count} 个知识点 · 连续 ${progress.streak()} 天`;
  $('#politicsCurrentLabel').textContent = `当前：${item.number ? `${item.number}. ` : ''}${item.title}`;
  const mask = $('#politicsMobileMask'); mask.textContent = view.hidden.has(item.id) ? '显示答案' : '遮住答案'; mask.setAttribute('aria-controls', `answer-${item.id}`); mask.setAttribute('aria-expanded', String(!view.hidden.has(item.id)));
  const confirm = $('#politicsMobileConfirm'); confirm.disabled = confirmed(item); confirm.textContent = confirmed(item) ? '✓ 今日已背' : '本题已背';
  let alert = $('#politicsStorageError');
  if (progress.error && !alert) { alert = el('p', 'study-alert'); alert.id = 'politicsStorageError'; alert.setAttribute('role', 'status'); $('.politics-reader').prepend(alert); }
  if (alert) { alert.textContent = progress.error; alert.hidden = !progress.error; }
}

function setActive(id) {
  const changed = view.active !== id; view.active = id; const item = activeItem(); if (!item) return;
  if (changed) progress.remember(view.book.id, item.sourcePages[0], item.id);
  document.querySelectorAll('.politics-item').forEach(section => section.classList.toggle('current', section.dataset.unit === id));
  document.querySelectorAll('.politics-toc-item[data-jump]').forEach(button => {
    const selected = button.dataset.jump === id; button.classList.toggle('active', selected);
    if (selected) button.setAttribute('aria-current', 'location'); else button.removeAttribute('aria-current');
  });
  updateStatus();
}

let scrollFrame = 0;
window.addEventListener('scroll', () => {
  if (S.screen !== 'politics' || view.history || view.query || scrollFrame || !view.book) return;
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0; if (S.screen !== 'politics' || view.history || view.query) return;
    const sections = [...document.querySelectorAll('.politics-item')];
    const selected = sections.filter(section => section.getBoundingClientRect().top <= $('.topbar').offsetHeight + 100).at(-1) || sections[0];
    if (selected && selected.dataset.unit !== view.active) setActive(selected.dataset.unit);
  });
}, { passive: true });

function renderSearch(container) {
  const matches = searchPoliticsItems(view.book, view.query), panel = el('section', 'politics-panel');
  panel.innerHTML = `<div class="study-head"><h1>搜索结果</h1><button type="button" class="study-link" data-return-reader>返回正文</button></div><p class="study-note">“${escHtml(view.query)}” · ${matches.length} 个知识点</p>`;
  if (!matches.length) panel.appendChild(el('p', 'study-empty', '没有找到匹配内容，可以尝试较短的关键词。'));
  for (const result of matches) {
    const button = el('button', 'politics-result'); button.type = 'button';
    button.innerHTML = `<small>${escHtml(result.topic.section)} / ${escHtml(result.topic.title)}</small><b>${escHtml(result.item.title)}</b><span>${escHtml(result.snippet)}</span>`;
    button.onclick = () => jumpToItem(result.item.id); panel.appendChild(button);
  }
  panel.querySelector('[data-return-reader]').onclick = () => { view.query = ''; renderPolitics(); scrollToItem(view.active); }; container.appendChild(panel);
}

function exportProgress() {
  const url = URL.createObjectURL(new Blob([JSON.stringify(progress.exportBackup(), null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `政治复习记录-${progress.today()}.json`; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function historyPanel() {
  const panel = el('section', 'politics-panel');
  panel.innerHTML = `<div class="study-head"><h1>政治打卡记录</h1><button type="button" class="study-link" data-return-reader>返回正文</button></div><label class="politics-day-label">查看日期 <input type="date" id="politicsDay" value="${escHtml(view.day)}" max="${progress.today()}"></label><p class="study-note">主动点击“本题已背”才会打卡。记录保存在当前浏览器，换设备请导出备份。</p><div class="study-tools"><button type="button" class="study-link" id="politicsExport">导出政治备份</button><button type="button" class="study-link" id="politicsImport">导入政治备份</button><input id="politicsImportFile" type="file" accept=".json,application/json" hidden></div>`;
  if (progress.error) panel.appendChild(el('p', 'study-alert', escHtml(progress.error)));
  const records = progress.summary(view.day);
  if (!records.length) panel.appendChild(el('p', 'study-empty', '这一天还没有政治打卡记录。'));
  for (const record of records) {
    const row = el('button', 'politics-result'); row.type = 'button'; const volume = view.books.find(book => book.id === record.bookId)?.volume || record.bookId;
    row.innerHTML = `<small>${escHtml(volume)} / ${escHtml(record.section)}${record.unitId ? '' : ` / 旧版页记录 · PDF ${record.page}`}</small><b>${escHtml(record.title)}</b>`;
    row.onclick = async () => { const loaded = await startPolitics(record.bookId); if (loaded && S.screen === 'politics' && view.book?.id === record.bookId) jumpToItem(resolveItem(record).id); }; panel.appendChild(row);
  }
  panel.querySelector('[data-return-reader]').onclick = () => { view.history = false; renderPolitics(); scrollToItem(view.active); };
  panel.querySelector('#politicsDay').onchange = event => { if (event.target.value) { view.day = event.target.value; renderPolitics(); } };
  panel.querySelector('#politicsExport').onclick = exportProgress; panel.querySelector('#politicsImport').onclick = () => $('#politicsImportFile').click();
  panel.querySelector('#politicsImportFile').onchange = async event => {
    const file = event.target.files[0]; if (!file) return;
    try { const saved = progress.importBackup(JSON.parse(await file.text())); renderPolitics(); toast(saved ? '政治备份已合并' : '已合并到本页，请导出备份'); } catch (error) { toast(`未导入：${error.message}`); }
  };
  return panel;
}

export function renderPolitics() {
  if (S.screen !== 'politics' || !view.book) return;
  document.body.dataset.screen = 'politics'; $('#matInfo').textContent = `政治背诵手册 · ${view.book.volume}`; renderHeader(); renderSidebar();
  const container = el('div', 'screen politics-screen');
  if (view.history) container.appendChild(historyPanel()); else if (view.query) renderSearch(container); else renderReader(container);
  $('#main').replaceChildren(container); if (!view.history && !view.query) setActive(view.active);
  document.onkeydown = event => {
    if (S.screen !== 'politics' || view.query || view.history || directoryDialog?.open || sourceDialog?.open || /INPUT|TEXTAREA|SELECT|BUTTON|SUMMARY/.test(document.activeElement.tagName)) return;
    const index = view.book.topics.indexOf(topic());
    if (event.key === 'ArrowLeft' && index > 0) { event.preventDefault(); showTopic(view.book.topics[index - 1].id); }
    if (event.key === 'ArrowRight' && index < view.book.topics.length - 1) { event.preventDefault(); showTopic(view.book.topics[index + 1].id); }
  };
}
