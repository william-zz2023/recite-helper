import { DATA, ALL_CHAPS, S } from '../app/state.js';
import { MATERIAL, modeName } from '../app/config.js';
import { studyStore } from '../app/store.js';
import { exitToHome, jumpToQ, renderScreen } from '../app/navigation.js';
import { inScope, modeAvail } from '../services/practice.js';
import { $, escHtml } from '../shared/dom.js';

function renderSidebar(){
  const sb=$('#sidebar');
  let html=`<div class="mat-card"><div class="doc-badge">${escHtml(MATERIAL.badge)}</div>
    <div><div class="mat-title">${escHtml(MATERIAL.title)}</div><div class="mat-sub">${DATA.questions.length} 题 · ${ALL_CHAPS.length} 章</div></div></div>`;

  // 辅助：取当前 screen 下的当前题目（用于高亮）
  function curQid(){
    if(S.screen==='practice')return S.list[S.pos]?.id;
    if(S.screen==='read'){const b=DATA.questions.filter(inScope);return b[S.read.i]?.id;}
    if(S.screen==='listen'){const b=DATA.questions.filter(inScope);return b[S.listen.i]?.id;}
    return null;
  }
  const cur=curQid();
  // 搜索过滤
  const qf=S.sidebarQuery.trim();
  const chapFilter = ch => !qf || ch.includes(qf) || DATA.questions.filter(x=>x.ch===ch).some(x=>x.src.includes(qf));

  if(S.screen==='home'){
    html+=`<input class="side-search" id="sbSearch" placeholder="搜索章节或题目…" value="${escHtml(S.sidebarQuery)}">`;
    html+=`<div class="chap-actions">
      <button id="btnSelAll">全选</button>
      <button id="btnSelNone">全不选</button>
      <button id="btnSelOne">仅本章</button>
    </div>`;
    ALL_CHAPS.forEach(ch=>{
      if(!chapFilter(ch))return;
      const qs=DATA.questions.filter(q=>q.ch===ch);
      const c=qs.length;
      const isOn=S.chaps.has(ch);
      const open=S.expandedChaps.has(ch) || (qf && qs.some(x=>x.src.includes(qf)));
      html+=`<div class="chap-group${open?' open':''}" data-chap="${escHtml(ch)}">
        <div class="chap-head${isOn?' on':''}">
          <span class="cbx">✓</span>
          <span class="chap-name">${escHtml(ch)}</span>
          <span class="chap-cnt">${c}</span>
          <button class="chap-toggle">▶</button>
        </div>
        <div class="chap-body">`;
      qs.forEach(q=>{
        if(qf && !(q.src||'').includes(qf))return;
        const active=cur!=null && cur===q.id;
        const tag=((q.src||'').match(/^(简述|论述|说明|分析|比较|评论)/)||[''])[0];
        const p=q.src||'（无题干）';
        const promptShort=p.length>20?p.slice(0,20)+'…':p;
        html+=`<div class="qrow${active?' active':''}" data-qid="${q.id}">
          <span class="qdot"></span>
          ${tag?`<span class="qtag">${tag}</span>`:''}
          <span class="qtxt">${escHtml(promptShort)}</span>
          <span class="qlen">${q.ans.length}</span>
        </div>`;
      });
      html+=`</div></div>`;
    });
    html+=`<div class="row" style="margin-top:8px"><input type="checkbox" id="optShuffle" style="accent-color:var(--accent);width:16px;height:16px">打乱出题顺序</div>`;
    html+=`<div class="side-foot"><button class="btn-primary${S.mode&&modeAvail(S.mode)?'':' disabled'}" id="btnStartSide">${S.mode?`开始练习（${modeName(S.mode)}）`:'先在右侧选择练习模式'}</button></div>`;
  }else if(S.screen==='read'||S.screen==='listen'){
    const total=DATA.questions.filter(inScope).length;
    const cur2=S.screen==='read'?S.read.i:S.listen.i;
    html+=`<h3 class="sec">${S.screen==='read'?'阅读进度':'听读进度'}</h3>
      <div style="padding:4px 4px 0">
        <div class="pr-big">${cur2+1}<small> / ${total}</small></div>
        <div class="pr-label">${S.screen==='read'?'按 ← → 键翻页':'朗读当前块，自动连播'}</div>
        <div class="pr-bar"><div class="pr-val" style="width:${(cur2+1)/total*100}%"></div></div>
      </div>`;
    // 目录跳转
    html+=`<h3 class="sec">目录（点击跳转）</h3>`;
    ALL_CHAPS.forEach(ch=>{
      if(!S.chaps.has(ch))return;
      const qs=DATA.questions.filter(q=>q.ch===ch && inScope(q));
      if(!qs.length)return;
      const open=S.expandedChaps.has(ch);
      html+=`<div class="chap-group${open?' open':''}" data-chap="${escHtml(ch)}">
        <div class="chap-head on">
          <span class="cbx">✓</span>
          <span class="chap-name">${escHtml(ch)}</span>
          <span class="chap-cnt">${qs.length}</span>
          <button class="chap-toggle">▶</button>
        </div>
        <div class="chap-body">`;
      qs.forEach(q=>{
        const active=cur!=null && cur===q.id;
        const p=q.src||'（无题干）';
        const promptShort=p.length>20?p.slice(0,20)+'…':p;
        html+=`<div class="qrow${active?' active':''}" data-qid="${q.id}">
          <span class="qdot"></span>
          <span class="qtxt">${escHtml(promptShort)}</span>
        </div>`;
      });
      html+=`</div></div>`;
    });
    html+=`<div class="side-foot"><button class="btn-ghost" id="btnExit">退出，返回首页</button></div>`;
  }else if(S.screen==='practice'){
    const done=S.results.length,pass=S.results.filter(r=>r.ok).length;
    html+=`<h3 class="sec">练习进度</h3>
      <div style="padding:4px 4px 0">
        <div class="pr-big">${done+1}<small> / ${S.list.length}</small></div>
        <div class="pr-label">第 ${S.batchIdx+1}/${S.batches.length} 批 · ${modeName(S.mode)}${S.mode==='blank'?` · ${S.density}%`:''}</div>
        <div class="pr-bar"><div class="pr-val" style="width:${done/S.list.length*100}%"></div></div>
        <div class="pr-stats"><span><b>${done}</b>已答</span><span><b style="color:var(--accent-deep)">${pass}</b>通过</span><span><b style="color:var(--danger)">${done-pass}</b>待巩固</span></div>
      </div>`;
    // 练习中目录
    html+=`<h3 class="sec">当前练习目录</h3>`;
    // 按章节分组 S.list
    const byChap={};
    S.list.forEach((q,i)=>{byChap[q.ch]=byChap[q.ch]||[];byChap[q.ch].push({q,i});});
    Object.keys(byChap).forEach(ch=>{
      const items=byChap[ch];
      const open=S.expandedChaps.has(ch);
      html+=`<div class="chap-group${open?' open':''}" data-chap="${escHtml(ch)}">
        <div class="chap-head on">
          <span class="cbx">✓</span>
          <span class="chap-name">${escHtml(ch)}</span>
          <span class="chap-cnt">${items.length}</span>
          <button class="chap-toggle">▶</button>
        </div>
        <div class="chap-body">`;
      items.forEach(({q,i})=>{
        const active=cur!=null && cur===q.id;
        const answered=i<done;
        const passed=answered && S.results[i]?.ok;
        const p=q.src||'（无题干）';
        const promptShort=p.length>18?p.slice(0,18)+'…':p;
        html+=`<div class="qrow${active?' active':''}" data-qidx="${i}" title="${escHtml(p)}">
          <span class="qdot" style="background:${answered?(passed?'var(--accent)':'var(--danger)'):'var(--border)'}"></span>
          <span class="qtxt">${escHtml(promptShort)}</span>
        </div>`;
      });
      html+=`</div></div>`;
    });
    html+=`<div class="side-foot"><button class="btn-ghost" id="btnExit">结束练习</button></div>`;
  }else if(S.screen==='history'){
    const today=studyStore.summary(studyStore.dateKey());
    html+=`<h3 class="sec">今天的学习</h3><div style="padding:4px"><div class="pr-big">${today.total}<small> 题</small></div><div class="pr-label">练习 ${today.practiced} · 阅读 ${today.read} · 听读 ${today.listen}</div><div class="pr-stats">累计学习 ${Object.keys(studyStore.history.days).length} 天</div></div><div class="side-foot"><button class="btn-ghost" id="btnExit">返回首页</button></div>`;
  }else{
    const pass=S.results.filter(r=>r.ok).length;
    html+=`<h3 class="sec">本轮结果</h3>
      <div style="padding:4px 4px 0">
        <div class="pr-big">${S.results.length}<small> 题</small></div>
        <div class="pr-stats"><span><b style="color:var(--accent-deep)">${pass}</b>通过</span><span><b style="color:var(--danger)">${S.results.length-pass}</b>待巩固</span></div>
      </div>
      <div class="side-foot"><button class="btn-ghost" id="btnExit">返回首页</button></div>`;
  }

  // Keep the music reading directory available without pushing the article far
  // below the first phone viewport. Desktop keeps the existing full sidebar.
  if(S.screen==='read'){
    const details=document.createElement('details');details.className='rr-reading-directory';
    details.open=window.matchMedia('(min-width: 921px)').matches;
    const summary=document.createElement('summary');summary.textContent='音乐阅读 · 展开目录与章节';
    const content=document.createElement('div');content.innerHTML=html;
    details.append(summary,content);sb.replaceChildren(details);
  }else sb.innerHTML=html;

  // ---------- 事件绑定 ----------
  // 搜索
  const srch=$('#sbSearch');
  if(srch){
    srch.value=S.sidebarQuery;
    srch.oninput=e=>{S.sidebarQuery=e.target.value;renderSidebar();};
  }
  // 全选 / 全不选 / 仅本章
  const selAll=$('#btnSelAll'),selNone=$('#btnSelNone'),selOne=$('#btnSelOne');
  if(selAll)selAll.onclick=()=>{S.chaps=new Set(ALL_CHAPS);renderScreen('home');};
  if(selNone)selNone.onclick=()=>{S.chaps=new Set();renderScreen('home');};
  if(selOne)selOne.onclick=()=>{const first=ALL_CHAPS.find(ch=>DATA.questions.some(q=>q.ch===ch&&q.src.includes(S.sidebarQuery)))||ALL_CHAPS[0];S.chaps=new Set([first]);S.expandedChaps.add(first);renderScreen('home');};

  // 章节组：勾选 / 展开分离
  sb.querySelectorAll('.chap-group').forEach(grp=>{
    const ch=grp.dataset.chap;
    const head=grp.querySelector('.chap-head');
    const cbx=grp.querySelector('.cbx');
    const tgl=grp.querySelector('.chap-toggle');
    // 勾选：点 .cbx 切换（同时重渲 sidebar + main）
    cbx.onclick=e=>{e.stopPropagation();S.chaps.has(ch)?S.chaps.delete(ch):S.chaps.add(ch);renderScreen('home');};
    // 展开：点头部（cbx 除外）或箭头（只重渲 sidebar）
    const toggle=()=>{S.expandedChaps.has(ch)?S.expandedChaps.delete(ch):S.expandedChaps.add(ch);renderSidebar();};
    head.onclick=e=>{if(e.target===cbx)return;toggle();};
    tgl.onclick=e=>{e.stopPropagation();toggle();};
  });

  // 题目行点击跳转
  sb.querySelectorAll('.qrow').forEach(r=>{
    const qid=r.dataset.qid, qidx=r.dataset.qidx;
    r.onclick=()=>jumpToQ(qid!=null?+qid:null, qidx!=null?+qidx:null);
  });

  // shuffle / exit
  const sh=$('#optShuffle');
  if(sh){sh.checked=S.shuffle;sh.onchange=e=>{S.shuffle=e.target.checked;};}
  const ex=$('#btnExit');
  if(ex)ex.onclick=exitToHome;
}

export { renderSidebar };
