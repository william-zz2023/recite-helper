import { el } from './dom.js';

export function subjectTabs(current, onMusic, onPolitics) {
  const nav = el('nav', 'subject-tabs');
  nav.setAttribute('aria-label', '学习学科');
  for (const [id, title, action] of [['music', '音乐背诵', onMusic], ['politics', '政治复习', onPolitics]]) {
    const button = el('button', 'subject-tab', title);
    button.type = 'button'; button.id = id === 'politics' ? 'entryPolitics' : 'entryMusic';
    if (id === current) button.setAttribute('aria-current', 'page');
    button.onclick = action;
    nav.appendChild(button);
  }
  return nav;
}
