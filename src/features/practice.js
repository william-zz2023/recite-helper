import { S } from '../app/state.js';
import { modeName } from '../app/config.js';
import { studyStore } from '../app/store.js';
import { exitToHome } from '../app/navigation.js';
import { chunk, buildPracticeList, recordPracticeResult } from '../services/practice.js';
import { norm, analyze, diffScore, renderDiff } from '../services/scoring.js';
import { $, el, escHtml, toast } from '../shared/dom.js';
import { renderSidebar } from './sidebar.js';

function startPractice(list){
  S.list=list;S.batches=chunk(list,10);S.batchIdx=0;S.pos=0;
  S.results=[];S.t0=Date.now();S.screen='practice';
  document.onkeydown=null;
  renderQ();
}
function record(q,score,ok){
  recordPracticeResult(S, studyStore, q, score, ok);
  const cur=$('#curStat');
  if(cur)cur.textContent=`已通过 ${S.results.filter(r=>r.ok).length}`;
  renderSidebar();
}
function afterJudge(){
  const batch=S.batches[S.batchIdx];
  if(S.pos>=batch.length){
    if(S.batchIdx>=S.batches.length-1)renderResult();
    else renderBatchSummary();
  }else renderQ();
}
function renderQ(){
  renderSidebar();
  const batch=S.batches[S.batchIdx];
  const q=batch[S.pos];
  const m=$('#main');m.innerHTML='';
  const sc=el('div','screen fade');
  sc.appendChild(el('div','progress-row',
    `<span>第 ${S.batchIdx+1}/${S.batches.length} 批 · 第 ${S.pos+1}/${batch.length} 题</span>
     <div class="prog"><div class="prog-val" style="width:${S.results.length/S.list.length*100}%"></div></div>
     <span id="curStat">已通过 ${S.results.filter(r=>r.ok).length}</span>`));
  const card=el('div','qcard');
  const tags=`<span class="tag">${modeName(S.mode)}</span>`+
    (S.mode==='blank'?`<span class="tag soft">挖空密度 ${S.density}%</span>`:'')+
    `<span class="src">${escHtml(q.ch)}</span>`;
  card.appendChild(el('div','qmeta',tags));
  card.appendChild(el('div','qzone'));
  card.appendChild(el('div','actions'));
  sc.appendChild(card);
  if(S.mode==='blank')buildBlank(q,card);
  else buildText(q,card);
  m.appendChild(sc);
}
function addNext(card,label){
  const row=el('div','actions');
  row.appendChild(el('button','btn-primary',label));
  row.querySelector('button').onclick=()=>{S.pos++;afterJudge();};
  card.appendChild(row);
}
const lastOfBatch=()=>S.pos>=S.batches[S.batchIdx].length-1;

function buildBlank(q,card){
  const v=q['b'+S.density];
  const zone=card.querySelector('.qzone');
  zone.appendChild(el('div','prompt-big',escHtml(q.src)));
  const wrap=el('div','blank-text');
  const parts=v.d.split(/⟦(\d+)⟧/);
  parts.forEach((p,i)=>{
    if(i%2===0){wrap.appendChild(document.createTextNode(p));}
    else{
      const n=+p;
      const span=el('span','slot');
      const inp=document.createElement('input');
      inp.type='text';inp.autocomplete='off';inp.spellcheck=false;inp.dataset.idx=n;
      inp.style.width=Math.max(5,v.a[n].length*2+2)+'ch';
      inp.addEventListener('keydown',e=>{
        if(e.key==='Enter'){
          const all=[...zone.querySelectorAll('input')];
          const k=all.indexOf(inp);
          if(k<all.length-1)all[k+1].focus();
          else card.querySelector('.actions .btn-primary').click();
        }
      });
      span.appendChild(inp);wrap.appendChild(span);
    }
  });
  zone.appendChild(wrap);
  const actions=card.querySelector('.actions');
  const hint=el('button','btn-ghost','首字提示');
  hint.onclick=()=>{
    zone.querySelectorAll('input').forEach(inp=>{if(!inp.value)inp.placeholder=v.a[+inp.dataset.idx][0];});
    hint.disabled=true;hint.style.opacity=.5;
  };
  actions.appendChild(hint);
  const sb=el('button','btn-primary','提交');
  sb.onclick=()=>{
    const inputs=[...zone.querySelectorAll('input')];
    if(inputs.some(i=>!i.value.trim())){toast('还有空没填');return;}
    let ok=0;const rows=[];
    inputs.forEach(inp=>{
      const n=+inp.dataset.idx,ans=v.a[n];
      const good=norm(inp.value)===norm(ans);
      inp.disabled=true;
      inp.closest('.slot').classList.add(good?'ok':'bad');
      if(good)ok++;else rows.push({n,mine:inp.value,ans});
    });
    const score=ok/inputs.length;
    record(q,score,score===1);
    const fb=el('div','fb');
    fb.appendChild(el('div','fb-head '+(score===1?'ok':'bad'),score===1?'全部正确':'部分正确'));
    rows.forEach(r=>fb.appendChild(el('div','fb-row',
      `<span class="no">第${r.n+1}空</span><span class="mine">${escHtml(r.mine)}</span><span class="arr">→</span><span class="ans">${escHtml(r.ans)}</span>`)));
    actions.remove();card.appendChild(fb);
    addNext(card,lastOfBatch()?'本批完成':'下一题');
  };
  actions.appendChild(sb);
  zone.querySelector('input').focus();
}

function buildText(q,card){
  const zone=card.querySelector('.qzone');
  if(S.mode==='qa'){
    zone.appendChild(el('div','quote',`<span class="quote-label">题目</span>${escHtml(q.src)}`));
    zone.appendChild(el('div','kw-label','关键词提示'));
    const chips=el('div','kw-chips');
    (q.kw&&q.kw.length?q.kw:[]).forEach(k=>chips.appendChild(el('span','kchip',escHtml(k))));
    if(!chips.children.length)chips.appendChild(el('span','kchip','（本题无关键词提示）'));
    zone.appendChild(chips);
    zone.appendChild(el('div','kw-label','凭提示回忆并写出完整内容'));
  }else{
    zone.appendChild(el('div','prompt-big',`请完整默写「${escHtml(q.src)}」`));
  }
  const ta=document.createElement('textarea');
  ta.placeholder='凭记忆输入…（标点与空格不计分，⌘/Ctrl + Enter 提交）';
  ta.addEventListener('keydown',e=>{
    if(e.key==='Enter'&&(e.metaKey||e.ctrlKey))card.querySelector('.actions .btn-primary').click();
  });
  zone.appendChild(ta);
  const actions=card.querySelector('.actions');
  const sb=el('button','btn-primary','提交');
  sb.onclick=()=>{
    if(!ta.value.trim()){ta.classList.add('shake');setTimeout(()=>ta.classList.remove('shake'),350);toast('先写点内容再提交');return;}
    const A=analyze(ta.value),B=analyze(q.ans);
    const {mA,mB,f1}=diffScore(A,B);
    const score=Math.round(f1*100);
    const pass=score>=80;
    record(q,f1,pass);
    const fb=el('div','fb');
    fb.appendChild(el('div','fb-head '+(pass?'ok':'bad'),`${score} 分 · ${pass?'通过':'未通过'}`));
    const bu=el('div','diffbox',`<div class="diff-label"><span>你的答案</span><span class="legend"><i class="lg-x"></i>多写 / 错写</span></div>`);
    bu.appendChild(el('div','diff-text',renderDiff(A,mA.map(x=>!x),'x')));
    fb.appendChild(bu);
    const bo=el('div','diffbox',`<div class="diff-label"><span>原文</span><span class="legend"><i class="lg-m"></i>漏写</span></div>`);
    bo.appendChild(el('div','diff-text',renderDiff(B,mB.map(x=>!x),'m')));
    fb.appendChild(bo);
    actions.remove();card.appendChild(fb);
    addNext(card,lastOfBatch()?'本批完成':'下一题');
  };
  actions.appendChild(sb);
  ta.focus();
}

/* ---------- batch summary ---------- */
function renderBatchSummary(){
  renderSidebar();
  const batchResults=S.results.slice(S.batchIdx*10);
  const n=batchResults.length;
  const avg=Math.round(batchResults.reduce((s,r)=>s+r.score,0)/n*100);
  const pass=batchResults.filter(r=>r.ok).length;
  const m=$('#main');m.innerHTML='';
  const sc=el('div','screen fade summary-wrap');
  sc.appendChild(el('div','result-card',`
    <div style="font-size:15px;color:var(--muted)">第 ${S.batchIdx+1} 批完成</div>
    <div style="font-size:44px;font-weight:700;margin:10px 0 4px;color:${avg>=80?'var(--accent-deep)':avg>=60?'var(--warn)':'var(--danger)'}">${avg}<span style="font-size:18px;color:var(--muted);font-weight:500"> 分</span></div>
    <div class="stat-row">
      <div class="stat"><b>${n}</b><span>本批题数</span></div>
      <div class="stat"><b style="color:var(--accent-deep)">${pass}</b><span>通过</span></div>
      <div class="stat"><b style="color:var(--danger)">${n-pass}</b><span>待巩固</span></div>
      <div class="stat"><b>${S.batches.length-S.batchIdx-1}</b><span>剩余批次</span></div>
    </div>`));
  const ra=el('div','res-actions');
  const nextB=el('button','btn-primary',`继续第 ${S.batchIdx+2} 批（${S.batches[S.batchIdx+1].length} 题）`);
  nextB.onclick=()=>{S.batchIdx++;S.pos=0;renderQ();};
  ra.appendChild(nextB);
  const quit=el('button','btn-ghost','提前结束，看总结果');
  quit.onclick=renderResult;
  ra.appendChild(quit);
  sc.appendChild(ra);
  m.appendChild(sc);
}

/* ---------- result ---------- */
function renderResult(){
  S.screen='result';renderSidebar();
  const m=$('#main');m.innerHTML='';
  if(!S.results.length){
    const sc=el('div','screen fade summary-wrap');
    sc.appendChild(el('div','result-card','<div style="font-size:16px;color:var(--muted);padding:20px 0">本轮还没有作答记录</div>'));
    sc.appendChild(el('div','res-actions')).querySelector('.res-actions');
    const home=el('button','btn-primary','返回首页');
    home.onclick=exitToHome;
    const wrap=el('div','res-actions');wrap.appendChild(home);sc.appendChild(wrap);
    m.appendChild(sc);return;
  }
  const n=S.results.length;
  const avg=Math.round(S.results.reduce((s,r)=>s+r.score,0)/n*100);
  const wrong=S.results.filter(r=>!r.ok);
  const secs=Math.max(1,Math.round((Date.now()-S.t0)/1000));
  const timeStr=secs>=60?`${Math.floor(secs/60)}分${secs%60}秒`:`${secs}秒`;
  const color=avg>=80?'var(--accent)':avg>=60?'var(--warn)':'var(--danger)';
  const C=2*Math.PI*52;
  const sc=el('div','screen fade summary-wrap');
  sc.appendChild(el('div','result-card',`
    <div class="ring-wrap">
      <svg viewBox="0 0 120 120" class="ring">
        <circle cx="60" cy="60" r="52" class="ring-bg"/>
        <circle cx="60" cy="60" r="52" class="ring-val" id="ringVal" transform="rotate(-90 60 60)"
          style="stroke:${color};stroke-dasharray:${C};stroke-dashoffset:${C}"/>
      </svg>
      <div class="ring-num">${avg}<small>%</small></div>
      <div class="ring-label">平均得分</div>
    </div>
    <div class="stat-row">
      <div class="stat"><b>${n}</b><span>练习题数</span></div>
      <div class="stat"><b>${n-wrong.length}</b><span>通过</span></div>
      <div class="stat"><b>${wrong.length}</b><span>待巩固</span></div>
      <div class="stat"><b style="font-size:15px;padding-top:3px">${timeStr}</b><span>用时</span></div>
    </div>`));
  if(wrong.length){
    const wc=el('div','wrong-card','<h3>错题本</h3>');
    wrong.forEach(r=>{
      wc.appendChild(el('div','wrong-item',
        `<div class="wi-info"><span class="tag soft">${modeName(S.mode)}</span><span class="wi-src">${escHtml(r.q.src)}</span></div>
         <span class="wi-score">${Math.round(r.score*100)}%</span>`));
    });
    sc.appendChild(wc);
  }
  const ra=el('div','res-actions');
  const again=el('button','btn-primary',wrong.length?`错题重练（${wrong.length} 题）`:'再练一轮');
  again.onclick=()=>startPractice(wrong.length?wrong.map(r=>r.q):buildPracticeList());
  ra.appendChild(again);
  const home=el('button','btn-ghost','返回首页');
  home.onclick=exitToHome;
  ra.appendChild(home);
  sc.appendChild(ra);
  m.appendChild(sc);
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    const rv=$('#ringVal');
    if(rv)rv.style.strokeDashoffset=C*(1-avg/100);
  }));
}

export { startPractice, renderQ, renderResult };
