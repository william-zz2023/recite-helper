import { DATA, S } from '../app/state.js';
import { studyStore } from '../app/store.js';
import { exitToHome, startScreen, stopActiveAudio } from '../app/navigation.js';
import { STUDY_KINDS } from '../services/study-history.js';
import { $, el, escHtml, toast } from '../shared/dom.js';
import { renderSidebar } from './sidebar.js';

const studyView = { selected: studyStore.dateKey(), month: studyStore.dateKey().slice(0, 7) };

function exportStudyHistory() {
  const url = URL.createObjectURL(new Blob([JSON.stringify(studyStore.exportBackup(), null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = '背诵打卡-' + studyStore.dateKey() + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function importStudyHistory(file) {
  if (!file) return;
  try {
    const saved = studyStore.importBackup(JSON.parse(await file.text()));
    if (S.screen === 'history') renderStudyHistory();
    toast(saved ? '备份已合并' : '记录已合并到当前页面，请导出备份');
  } catch (error) { toast('未导入：' + error.message); }
}

function studyHomeMarkup(){
  const today=studyStore.dateKey(),summary=studyStore.summary(today);
  return `<div class="study-head"><div><h2>${summary.total?'今天已打卡':'今日背诵打卡'}</h2><p>${today} · ${summary.total?'已记录今天学过的内容':'完成练习或确认阅读后，自动记录当天学习'}</p></div>
    <button class="study-link" id="entryHistory">查看打卡记录</button></div>
    <div class="study-metrics"><div class="study-metric"><b>${summary.practiced}</b><span>练习题目</span></div><div class="study-metric"><b>${summary.read}</b><span>确认已读</span></div><div class="study-metric"><b>${summary.listen}</b><span>完整听读</span></div><div class="study-metric"><b>${studyStore.streak(today)}</b><span>连续学习天数</span></div></div>
    <p class="study-note">练习提交后自动记录，同一道题每天去重统计；阅读、听读与背诵练习分开记录。</p>${studyStore.error?`<p class="study-alert" role="status">${escHtml(studyStore.error)}</p>`:''}`;
}
function openStudyHistory(){
  stopActiveAudio();S.screen='history';document.onkeydown=null;
  studyView.selected=studyStore.dateKey();studyView.month=studyView.selected.slice(0,7);renderStudyHistory();
}
function moveStudyMonth(offset){
  const [y,m]=studyView.month.split('-').map(Number),date=new Date(y,m-1+offset,1,12);
  studyView.month=studyStore.dateKey(date).slice(0,7);
  const days=Object.keys(studyStore.history.days).filter(d=>d.startsWith(studyView.month)).sort();
  studyView.selected=days.at(-1)||studyView.month+'-01';renderStudyHistory();
}
function renderStudyHistory(){
  S.screen='history';renderSidebar();
  const today=studyStore.dateKey(),summary=studyStore.summary(studyView.selected),sc=el('div','screen fade');
  const intro=el('section','study-card');intro.style.marginTop='0';
  intro.innerHTML=`<div class="study-head"><div><h2>背诵打卡记录</h2><p>累计学习 ${Object.keys(studyStore.history.days).length} 天 · 当前连续 ${studyStore.streak(today)} 天</p></div><button class="study-link" id="studyBack">返回首页</button></div>
    <p class="study-note">记录仅保存在当前浏览器，不会在不同设备间自动同步；清理网站数据或使用无痕浏览可能丢失记录。可导出备份后，在另一浏览器导入。</p>
    <div class="study-tools"><button class="study-link" id="studyExport">导出备份</button><button class="study-link" id="studyImport">导入备份</button><input id="studyImportFile" type="file" accept="application/json,.json" hidden></div>
    <p class="study-note">导入时合并日期与题目；同日同题同模式的次数取较大值，最近成绩取较新记录，重复导入不会累加。</p>${studyStore.error?`<p class="study-alert" role="status">${escHtml(studyStore.error)}</p>`:''}`;
  sc.appendChild(intro);
  const calendar=el('section','study-card');
  const [year,month]=studyView.month.split('-').map(Number),first=new Date(year,month-1,1,12),total=new Date(year,month,0,12).getDate();
  calendar.innerHTML=`<div class="calendar-nav"><button class="study-link" id="studyPrev" aria-label="上个月">←</button><h3>${year} 年 ${month} 月</h3><button class="study-link" id="studyNext" aria-label="下个月">→</button><button class="study-link" id="studyToday">今天</button></div>`;
  const grid=el('div','calendar-grid');
  ['一','二','三','四','五','六','日'].forEach(d=>grid.appendChild(el('div','calendar-week',d)));
  for(let i=0;i<(first.getDay()+6)%7;i++)grid.appendChild(el('div'));
  for(let d=1;d<=total;d++){
    const key=studyView.month+'-'+String(d).padStart(2,'0'),n=studyStore.summary(key).total;
    const button=el('button','calendar-day'+(n?' has-study':'')+(key===today?' today':'')+(key===studyView.selected?' selected':''),`${d}${n?`<small>${n} 题</small>`:''}`);
    button.setAttribute('aria-label',`${key}，${n?'学习 '+n+' 题':'暂无记录'}`);button.setAttribute('aria-pressed',String(key===studyView.selected));
    if(key===today)button.setAttribute('aria-current','date');
    button.onclick=()=>{studyView.selected=key;renderStudyHistory();};grid.appendChild(button);
  }
  calendar.appendChild(grid);calendar.appendChild(el('p','study-note','绿色表示当天有学习记录；题数按当天学过的题目去重，并不代表全部掌握。'));sc.appendChild(calendar);
  const details=el('section','study-card');
  details.innerHTML=`<div class="study-head"><h2>${studyView.selected} 的学习内容</h2><span class="tag">${summary.total} 题</span></div>
    <p class="study-note">练习 ${summary.practiced} 题，提交 ${summary.attempts} 次，通过 ${summary.passed} 次；确认阅读 ${summary.read} 题，完整听读 ${summary.listen} 题。</p>`;
  const lastTime=item=>Math.max(...Object.values(item.activities).map(a=>Date.parse(a.lastAt)));
  for(const item of [...summary.items].sort((a,b)=>lastTime(b)-lastTime(a))){
    const row=el('article','study-item');
    row.innerHTML=`<div class="study-head"><div><h3>${escHtml(item.title)}</h3><p class="study-note">${escHtml(item.chapter)}</p></div></div>`;
    const question=DATA.questions.find(q=>q.id===item.id&&q.src===item.title);
    if(question){
      const retry=el('button','study-link','再练这题');
      retry.onclick=()=>{const practiced=Object.keys(item.activities).find(k=>['blank','qa','full'].includes(k));S.mode=practiced||'qa';S.chaps.add(question.ch);startScreen('practice', [question]);};
      row.querySelector('.study-head').appendChild(retry);
    }
    const tags=el('div','study-tags');
    for(const [kind,activity] of Object.entries(item.activities)){
      const label=STUDY_KINDS[kind]+' · '+activity.count+' 次'+(['blank','qa','full'].includes(kind)?` · 最近 ${activity.lastScore} 分`:'' );
      tags.appendChild(el('span','tag soft',escHtml(label)));
    }
    row.appendChild(tags);details.appendChild(row);
  }
  if(!summary.total)details.appendChild(el('p','study-empty',studyView.selected===today?'今天还没有学习记录。<br>提交一道练习，或在阅读页确认“本题已读”，就能开始记录。':'这一天还没有学习记录。'));
  sc.appendChild(details);$('#main').replaceChildren(sc);
  $('#studyBack').onclick=exitToHome;$('#studyExport').onclick=exportStudyHistory;
  $('#studyImport').onclick=()=>$('#studyImportFile').click();
  $('#studyImportFile').onchange=e=>importStudyHistory(e.target.files[0]);
  $('#studyPrev').onclick=()=>moveStudyMonth(-1);$('#studyNext').onclick=()=>moveStudyMonth(1);$('#studyToday').onclick=openStudyHistory;
}

export { studyHomeMarkup, openStudyHistory, renderStudyHistory };
