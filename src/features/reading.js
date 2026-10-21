import { DATA, S } from '../app/state.js';
import { studyStore } from '../app/store.js';
import { exitToHome } from '../app/navigation.js';
import { inScope } from '../services/practice.js';
import { $, el, escHtml, toast } from '../shared/dom.js';
import { renderSidebar } from './sidebar.js';

function readBlocks(){return DATA.questions.filter(inScope);}
function startRead(){if(!readBlocks().length){toast('请先选择需要阅读的章节');return;}S.screen='read';S.read.i=0;renderRead();}
function renderRead(){
  renderSidebar();
  document.onkeydown=e=>{
    if(S.screen!=='read')return;
    if(e.key==='ArrowRight')navRead(1);
    if(e.key==='ArrowLeft')navRead(-1);
  };
  const blocks=readBlocks(),i=Math.min(S.read.i,blocks.length-1);
  if(!blocks.length){exitToHome();return;}
  const m=$('#main');m.innerHTML='';
  const sc=el('div','screen fade');
  sc.appendChild(el('div','read-head',`<span>阅读模式</span><div class="prog" style="flex:1"><div class="prog-val" style="width:${(i+1)/blocks.length*100}%"></div></div><span>${i+1} / ${blocks.length}</span>`));
  const b=blocks[i];
  sc.appendChild(el('div','blk',`
    <div class="blk-src">${escHtml(b.ch)} · 题干</div>
    <div class="blk-title">${escHtml(b.src)}</div>
    <div class="blk-ans">${escHtml(b.ans)}</div>`));
  const nav=el('div','nav-row');
  nav.appendChild(el('button','btn-ghost','← 上一块')).onclick=()=>navRead(-1);
  nav.appendChild(el('div','pos',i+1+' / '+blocks.length));
  const nb=el('button','btn-ghost',i>=blocks.length-1?'已是最后一块':'下一块 →');
  nb.onclick=()=>navRead(1);
  nav.appendChild(nb);
  sc.appendChild(nav);
  const confirm=el('button','btn-ghost',studyStore.history.days[studyStore.dateKey()]?.items[String(b.id)]?.activities.read?'今天已确认阅读':'本题已读，记入今日打卡');
  confirm.style.marginTop='14px';
  confirm.onclick=()=>{studyStore.record(b,'read');renderRead();toast(studyStore.error?'已记入本页，请导出备份':'已记入今日阅读记录');};
  sc.appendChild(confirm);
  sc.appendChild(el('p','study-note','浏览原文不会自动计入打卡；读完后请点击上方按钮确认。重复确认同一题，当天只记录一次。'));
  m.appendChild(sc);
}
function navRead(d){
  const blocks=readBlocks();
  S.read.i=Math.max(0,Math.min(blocks.length-1,S.read.i+d));
  renderRead();
}

export function selectReadQuestion(index) { S.read.i = index; renderRead(); }
export { readBlocks, startRead, renderRead };
