import { DATA, S } from '../app/state.js';

function inScope(q){return S.chaps.has(q.ch);}
function modeAvail(mode){
  return DATA.questions.filter(q=>inScope(q)&&(mode==='blank'?!!q['b'+S.density]:true)).length;
}
function buildPracticeList(){
  let list=DATA.questions.filter(q=>inScope(q)&&(S.mode==='blank'?!!q['b'+S.density]:true));
  if(S.shuffle){list=[...list];for(let i=list.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[list[i],list[j]]=[list[j],list[i]];}}
  return list;
}
function chunk(arr,n){const out=[];for(let i=0;i<arr.length;i+=n)out.push(arr.slice(i,i+n));return out;}

export function recordPracticeResult(state, history, question, score, ok) {
  state.results.push({ q: question, score, ok });
  history.record(question, state.mode, { score, ok });
}

export { inScope, modeAvail, buildPracticeList, chunk };
