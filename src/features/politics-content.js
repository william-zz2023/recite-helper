import { escHtml } from '../shared/dom.js';

function emphasis(text) {
  let result = escHtml(text);
  const label = result.match(/^(.{1,24}?[：:])/u)?.[1];
  if (label) result = `<strong>${label}</strong>${result.slice(label.length)}`;
  for (const phrase of ['科学性与革命性的统一', '人民性是马克思主义的本质属性', '实践观点是马克思主义首要的和基本的观点']) {
    result = result.replaceAll(phrase, `<strong>${phrase}</strong>`);
  }
  return result;
}

export function renderPoliticsBlock(block) {
  if (block.type === 'table') {
    return `<div class="politics-table-wrap"><table class="politics-table">${block.caption ? `<caption>${escHtml(block.caption)}</caption>` : ''}<tbody>${block.rows.map(([label, value]) => value
      ? `<tr${label.length > 12 ? ' class="long-label"' : ''}><th scope="row">${escHtml(label)}</th><td>${value.split('\n').map(emphasis).join('<br>')}</td></tr>`
      : `<tr class="table-group"><th colspan="2">${escHtml(label)}</th></tr>`).join('')}</tbody></table></div>`;
  }
  if (block.type === 'heading') return `<h3 class="politics-subheading">${escHtml(block.text)}</h3>`;
  if (block.type === 'point' || block.type === 'option') {
    const marker = block.text.match(/^(?:[①-⑳❶-❿•·●◎]|[（(]\d+[）)]|[A-D][.．、]|>)/u)?.[0] || '';
    return `<p class="politics-point${block.type === 'option' ? ' politics-option' : ''}"><span class="point-marker">${escHtml(marker)}</span><span>${emphasis(block.text.slice(marker.length).trim())}</span></p>`;
  }
  if (block.type === 'note') return `<p class="politics-note">${emphasis(block.text)}</p>`;
  return `<p>${emphasis(block.text)}</p>`;
}
