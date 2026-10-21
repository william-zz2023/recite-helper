import { DATA, S } from './state.js';
import { inScope, buildPracticeList, chunk } from '../services/practice.js';
import { toast } from '../shared/dom.js';

// Only the entry point imports every feature. Views navigate by name to avoid circular imports.
let screens;
export function registerScreens(definitions) { screens = definitions; }
export function renderScreen(name, ...args) {
  if (name !== 'sidebar') document.body.dataset.screen = name;
  return screens[name].render(...args);
}
export function stopActiveAudio() { screens.listen.stop(); }
export function startScreen(name, ...args) {
  stopActiveAudio();
  document.onkeydown = null;
  document.body.dataset.screen = name;
  return (screens[name].start || screens[name].render)(...args);
}

function jumpToQ(qid, qidx){
  if(qidx!=null && S.screen==='practice'){
    // 练习态：直接按 list 索引跳
    S.pos=qidx;
    // 如果跨了批，要切 batchIdx
    const totalInBatches=S.batches.reduce((a,b)=>a+b.length,0);
    // 简化：重新算 batchIdx
    let acc=0;
    for(let i=0;i<S.batches.length;i++){acc+=S.batches[i].length;if(qidx<acc){S.batchIdx=i;break;}}
    renderScreen('practice');
    renderScreen('sidebar');
    return;
  }
  if(qid==null)return;
  const q=DATA.questions.find(x=>x.id===qid);
  if(!q)return;
  if(S.screen==='home'){
    // 首页跳练习：先选好章节，用默认模式或问答
    if(!S.mode){S.mode='qa';}
    if(!S.chaps.has(q.ch)){S.chaps=new Set([q.ch]);}
    S.expandedChaps.add(q.ch);
    // 构建 list 找到目标索引
    let list=DATA.questions.filter(x=>inScope(x)&&(S.mode==='blank'?!!x['b'+S.density]:true));
    let targetIdx=list.findIndex(x=>x.id===qid);
    if(targetIdx<0){toast('该题在当前模式下不可用');return;}
    S.list=list;
    S.batches=chunk(list,10);
    S.batchIdx=Math.floor(targetIdx/10);
    S.pos=targetIdx;
    S.results=[];S.t0=Date.now();
    S.screen='practice';
    renderScreen('practice');
    renderScreen('sidebar');
  }else if(S.screen==='practice'){
    // 练习中跳另一题（跨章节）
    let targetIdx=S.list.findIndex(x=>x.id===qid);
    if(targetIdx<0){
      // 不在当前 list 里，重建
      if(!S.chaps.has(q.ch)){S.chaps=new Set([q.ch]);}
      S.list=buildPracticeList();
      S.batches=chunk(S.list,10);
      targetIdx=S.list.findIndex(x=>x.id===qid);
    }
    S.batchIdx=Math.floor(targetIdx/10);
    S.pos=targetIdx;
    renderScreen('practice');
    renderScreen('sidebar');
  }else if(S.screen==='read'||S.screen==='listen'){
    if(!S.chaps.has(q.ch)){S.chaps=new Set([q.ch]);}
    const blocks=DATA.questions.filter(inScope);
    const idx=blocks.findIndex(x=>x.id===qid);
    if(idx>=0){
      screens[S.screen].select(idx);
      renderScreen('sidebar');
    }
  }
}
function exitToHome(){
  stopActiveAudio();
  S.screen='home';S.list=[];S.batches=[];S.results=[];
  document.onkeydown=null;renderScreen('home');
}

export { jumpToQ, exitToHome };
