import { DATA, ALL_CHAPS, S } from '../app/state.js';
import { MATERIAL } from '../app/config.js';
import { studyStore, readingReviewStore as review } from '../app/store.js';
import { exitToHome, startScreen } from '../app/navigation.js';
import { REVIEW_MODES } from '../services/reading-review.js';
import { downloadMusicBackup } from '../shared/music-backup.js';
import { inScope } from '../services/practice.js';
import { $, el, escHtml, toast } from '../shared/dom.js';
import { renderSidebar } from './sidebar.js';

function readBlocks(){return DATA.questions.filter(inScope);}
function startRead({restore=false,position=null}={}){
  const saved=position||review.data.reading;
  if(restore&&saved){
    const chapters=saved.chapters.filter(ch=>ALL_CHAPS.includes(ch));
    if(chapters.length)S.chaps=new Set(chapters);
  }
  const blocks=readBlocks();
  if(!blocks.length){toast('请先选择需要阅读的章节');exitToHome();return;}
  S.screen='read';
  S.read.i=Math.max(0,blocks.findIndex(q=>q.id===saved?.id));
  window.history.replaceState(null,'','#music-reading');
  $('#matInfo').textContent=`${MATERIAL.title} · ${DATA.questions.length} 题 · ${ALL_CHAPS.length} 章`;
  renderRead();
}
function renderRead(){
  const blocks=readBlocks();
  if(!blocks.length){exitToHome();return;}
  const i=S.read.i=Math.max(0,Math.min(S.read.i,blocks.length-1)),b=blocks[i];
  review.remember(b.id,blocks[i+1]?.id??null,[...S.chaps]);
  renderSidebar();
  document.onkeydown=e=>{
    if(S.screen!=='read'||/INPUT|TEXTAREA|SELECT|BUTTON/.test(e.target.tagName))return;
    if(e.key==='ArrowRight'){e.preventDefault();navRead(1);}
    if(e.key==='ArrowLeft'){e.preventDefault();navRead(-1);}
  };
  const m=$('#main');m.innerHTML='';
  const sc=el('div','screen fade reading-workspace');
  sc.appendChild(el('div','rr-heading',`<div><p class="rr-eyebrow">音乐 · 阅读与回忆</p><h1>先读一读，再背一遍</h1></div>`));
  sc.appendChild(el('div','read-head',`<span>阅读模式</span><div class="prog" style="flex:1"><div class="prog-val" style="width:${(i+1)/blocks.length*100}%"></div></div><span>${i+1} / ${blocks.length}</span>`));
  sc.appendChild(el('div','blk',`
    <div class="blk-src">${escHtml(b.ch)} · 题干</div>
    <div class="blk-title">${escHtml(b.src)}</div>
    <div class="blk-ans">${escHtml(b.ans)}</div>`));
  const nav=el('div','nav-row');
  const previous=el('button','btn-ghost','← 上一题');previous.disabled=i===0;previous.onclick=()=>navRead(-1);nav.appendChild(previous);
  nav.appendChild(el('div','pos',i+1+' / '+blocks.length));
  const nb=el('button','btn-ghost',i>=blocks.length-1?'最后一题':'下一题 →');nb.disabled=i>=blocks.length-1;
  nb.onclick=()=>navRead(1);
  nav.appendChild(nb);
  sc.appendChild(nav);
  const queued=review.data.pending.includes(b.id);
  const confirm=el('button','btn-primary rr-add',queued?'已加入复习 · 再次确认已读':'读完本题，加入复习');
  confirm.onclick=()=>{
    studyStore.record(b,'read');review.add(b.id);renderRead();
    toast(studyStore.error||review.error?'已暂存本页，请导出备份':queued?'本题已在清单，今日阅读已确认':'已加入复习，也记入今日阅读打卡');
  };
  sc.appendChild(confirm);
  sc.appendChild(el('p','study-note','翻页不会自动加入。当天阅读打卡按题去重；复习完成后，可把同一题再次加入下一轮。'));
  const {pending,round,weak}=review.data,active=round?.phase==='review';
  const unanswered=active?round.ids.slice(round.results.length):[];
  const added=active?pending.filter(id=>!unanswered.includes(id)).length:pending.length;
  const queue=el('section','rr-queue');
  queue.setAttribute('aria-label','读后复习清单');
  queue.innerHTML=`<div class="rr-queue-top"><div><h2>${active?'本轮复习已暂存':`待复习 ${pending.length} 题`}</h2><p class="study-note">${active?`本轮剩 ${unanswered.length} 题 · 另有 ${added} 题留到下一轮`:pending.length>=5?'已读完至少 5 题，可以回忆一下了。':'读完几题就能开始，不必凑够 5 题。'}</p></div><button class="btn-primary" id="readingBeginReview">${active?'继续本轮复习':`复习这 ${pending.length} 题`}</button></div>
    <div class="rr-mode"><label for="readingReviewMode">复习方式</label><select id="readingReviewMode" ${active?'disabled':''}>${Object.entries(REVIEW_MODES).map(([key,label])=>`<option value="${key}" ${(active?round.mode:review.data.mode)===key?'selected':''}>${label}</option>`).join('')}</select></div>`;
  queue.querySelector('#readingBeginReview').disabled=!active&&!pending.length;
  queue.querySelector('#readingBeginReview').onclick=()=>startScreen('reading-review');
  queue.querySelector('select').onchange=e=>review.mode(e.target.value);
  if(pending.length){
    const details=el('details','rr-pending',`<summary>查看待复习题目（${pending.length}）</summary>`),list=el('ol');
    pending.forEach(id=>{
      const title=DATA.questions.find(q=>q.id===id)?.src||'题目已移除';
      const item=el('li'),row=el('div','',`<span>${escHtml(title)}</span>`);
      if(active&&unanswered.includes(id))row.appendChild(el('small','tag soft','本轮'));
      else{
        const remove=el('button','study-link','移出');remove.setAttribute('aria-label','移出复习清单：'+title);
        remove.onclick=()=>{review.remove(id);renderRead();const remaining=$('.rr-pending');if(remaining)remaining.open=true;};row.appendChild(remove);
      }
      item.appendChild(row);list.appendChild(item);
    });
    details.appendChild(list);
    queue.appendChild(details);
  }
  if(weak.length&&!active){
    const retry=el('button','study-link',`复习待巩固题（${weak.length}）`);
    retry.onclick=()=>startScreen('reading-review',{source:'weak'});queue.appendChild(retry);
  }
  sc.appendChild(queue);
  if(review.error||studyStore.error){
    const alert=el('div','study-alert',`<p role="status">${escHtml(review.error||studyStore.error)}</p>`);
    const backup=el('button','study-link','导出记录与进度备份');backup.onclick=downloadMusicBackup;alert.appendChild(backup);sc.appendChild(alert);
  }
  m.appendChild(sc);
}
function navRead(d){
  const blocks=readBlocks();
  S.read.i=Math.max(0,Math.min(blocks.length-1,S.read.i+d));
  renderRead();
}

export function selectReadQuestion(index) { S.read.i = index; renderRead(); }
export { readBlocks, startRead, renderRead };
