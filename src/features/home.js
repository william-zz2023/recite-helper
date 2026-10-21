import { DATA, ALL_CHAPS, S } from '../app/state.js';
import { readingReviewStore } from '../app/store.js';
import { MATERIAL, MODES, modeName } from '../app/config.js';
import { startScreen, stopActiveAudio } from '../app/navigation.js';
import { inScope, modeAvail, buildPracticeList, chunk } from '../services/practice.js';
import { $, el, toast } from '../shared/dom.js';
import { renderSidebar } from './sidebar.js';
import { studyHomeMarkup } from './history.js';
import { subjectTabs } from '../shared/subject-tabs.js';

function renderHome(rerenderSidebar=true){
  if(S.screen==='listen')stopActiveAudio();
  S.screen='home';
  if(['#politics','#music-reading','#music-review'].includes(window.location.hash))window.history.replaceState(null,'',window.location.pathname+window.location.search);
  $('#matInfo').textContent=`${MATERIAL.title} · ${DATA.questions.length} 题 · ${ALL_CHAPS.length} 章`;
  if(rerenderSidebar!==false)renderSidebar();
  const m=$('#main');m.innerHTML='';
  const sc=el('div','screen fade');
  sc.appendChild(subjectTabs('music',()=>renderHome(),()=>startScreen('politics')));
  const nAll=DATA.questions.filter(inScope).length;
  sc.appendChild(el('div','hero',`
    <h1>准备好开始背诵了吗？</h1>
    <p>当前范围 <b style="color:var(--accent-deep)">${nAll}</b> 题（左侧可改）。先选一种练习模式，或先读一读、听一听。</p>
    <div class="mode-grid" id="modeGrid">${MODES.map(mk=>`
      <div class="mode-card${S.mode===mk.key?' on':''}" data-mode="${mk.key}">
        <b>${mk.name}</b><span>${mk.desc}</span><i>可用 ${modeAvail(mk.key)} 题</i>
      </div>`).join('')}
    </div>
    <div class="density-row" id="densityRow" style="${S.mode==='blank'?'':'display:none'}">
      挖空密度
      <span class="seg">
        <button data-d="30" class="${S.density===30?'on':''}">30%·初记</button>
        <button data-d="50" class="${S.density===50?'on':''}">50%·强化</button>
      </span>
    </div>`));
  sc.appendChild(el('div','entry-row',`
    <div class="entry" id="entryRead"><div class="ic">📖</div><div><b>阅读模式</b><span>分块浏览原文，先熟悉内容</span></div></div>
    <div class="entry" id="entryListen"><div class="ic">🎧</div><div><b>听读模式</b><span>朗读原文，边听边看跟读</span></div></div>`));
  if(readingReviewStore.data.round?.phase==='review'||readingReviewStore.data.pending.length){
    const active=readingReviewStore.data.round?.phase==='review';
    const resume=el('button','btn-ghost rr-home-resume',active?'继续上次的读后复习 →':`读后复习 · ${readingReviewStore.data.pending.length} 题待回忆 →`);
    resume.onclick=()=>startScreen('reading-review');sc.appendChild(resume);
  }
  sc.appendChild(el('section','study-card',studyHomeMarkup()));
  const n=S.mode?modeAvail(S.mode):0;
  const nb=n?chunk(Array(n).fill(0),10).length:0;
  sc.appendChild(el('div','start-wrap',
    `<button class="btn-primary${n?'':' disabled'}" id="btnStartHero" style="padding:15px;font-size:16px">${n?`开始练习：${modeName(S.mode)} · ${n} 题 · 分 ${nb} 批`:'请先选择练习模式'}</button>`));
  sc.appendChild(el('div','tips',`
    <div class="tip"><i>1</i><b>判分规则</b><span>只比对内容，忽略标点与空格；相似度 ≥80 分判定通过。</span></div>
    <div class="tip"><i>2</i><b>操作提示</b><span>挖空题 Enter 跳下一空；默写题 ⌘/Ctrl+Enter 提交；阅读用 ← → 翻页。</span></div>
    <div class="tip"><i>3</i><b>节奏与错题</b><span>每 10 题一批，批间小结；未通过的题自动进错题本，可一键重练。</span></div>`));
  m.appendChild(sc);
  sc.querySelectorAll('[data-mode]').forEach(c=>{
    c.onclick=()=>{S.mode=c.dataset.mode;renderHome(false);};
  });
  sc.querySelectorAll('[data-d]').forEach(b=>{
    b.onclick=()=>{S.density=+b.dataset.d;renderHome(false);};
  });
  $('#entryRead').onclick=()=>startScreen('read');
  $('#entryListen').onclick=()=>startScreen('listen');
  $('#entryHistory').onclick=()=>startScreen('history');
  const go=()=>{if(!S.mode){toast('请先选择一种练习模式');return;}const list=buildPracticeList();if(list.length)startScreen('practice', list);};
  $('#btnStartHero').onclick=go;
  const bs=$('#btnStartSide');
  if(bs)bs.onclick=go;
  document.onkeydown=e=>{
    if(S.screen==='home'&&e.key==='Enter'&&!/INPUT|TEXTAREA/.test(document.activeElement.tagName))go();
  };
}

export { renderHome };
