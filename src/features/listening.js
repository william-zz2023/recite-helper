import { S } from '../app/state.js';
import { studyStore } from '../app/store.js';
import { exitToHome } from '../app/navigation.js';
import { createSpeechController } from '../services/speech.js';
import { $, el, escHtml, toast } from '../shared/dom.js';
import { renderSidebar } from './sidebar.js';
import { readBlocks } from './reading.js';

const speech = createSpeechController({
  state: S, getBlocks: readBlocks, environment: window,
  onActivity: (question, kind) => studyStore.record(question, kind),
  onRender: () => renderListen(), onStatusChange: () => updateListenControls(),
  onVoicesChange: () => refreshListenVoices(),
});
const { supportsSpeech, chineseVoices, pickVoice, stopListening, speakCur } = speech;
const listenSpeech = speech.state;

function refreshListenVoices(){
  const sel=$('#listenVoice');
  if(!sel)return;
  sel.innerHTML='';
  const auto=document.createElement('option');
  auto.value='';auto.textContent='自动选择普通话';sel.appendChild(auto);
  chineseVoices().forEach(v=>{
    const opt=document.createElement('option');
    opt.value=v.name;opt.textContent=v.name+' · '+v.lang;sel.appendChild(opt);
  });
  if(listenSpeech.voiceName&&![...sel.options].some(o=>o.value===listenSpeech.voiceName))listenSpeech.voiceName='';
  sel.value=listenSpeech.voiceName;
}
function updateListenControls(){
  if(S.screen!=='listen')return;
  const pb=$('#listenPlay'),info=$('#listenStatus');
  if(pb){
    pb.textContent=S.listen.playing?'⏸':'▶';
    pb.setAttribute('aria-label',S.listen.playing?'停止朗读':'开始朗读');
    pb.setAttribute('aria-pressed',String(S.listen.playing));
  }
  if(info){
    const messages={idle:'点击 ▶ 开始朗读',starting:'正在启动语音…',playing:'正在朗读，点击卡片可跳转',done:'本轮朗读完成'};
    info.textContent=!supportsSpeech()?'当前浏览器不支持语音朗读':listenSpeech.error||messages[listenSpeech.status];
    info.classList.toggle('listen-error',listenSpeech.status==='error');
  }
}
function startListen(){
  if(!readBlocks().length){toast('请先选择需要听读的章节');return;}
  stopListening();S.screen='listen';S.listen.i=0;renderListen();
}
function renderListen(){
  renderSidebar();
  const blocks=readBlocks(),i=Math.min(S.listen.i,blocks.length-1);
  if(!blocks.length){exitToHome();return;}
  S.listen.i=i;
  const m=$('#main');m.innerHTML='';
  const sc=el('div','screen fade');
  sc.appendChild(el('div','read-head',`<span>听读模式</span><div class="prog" style="flex:1"><div class="prog-val" style="width:${(i+1)/blocks.length*100}%"></div></div><span>${i+1} / ${blocks.length}</span>`));
  const listWrap=el('div','blk-list');
  blocks.forEach((b,k)=>{
    const node=el('div','blk'+(k===i?' active':''),`
      <div class="blk-src">${escHtml(b.ch)} · 题干</div>
      <div class="blk-title">${escHtml(b.src)}</div>
      <div class="blk-ans">${escHtml(b.ans)}</div>`);
    node.id='blk-'+k;
    node.style.marginBottom='12px';
    node.onclick=()=>{S.listen.i=k;renderListen();if(S.listen.playing)speakCur();};
    listWrap.appendChild(node);
  });
  sc.appendChild(listWrap);
  const bar=el('div','ctrl-bar');
  bar.appendChild(el('button','ctrl-btn small','⏮')).onclick=()=>{S.listen.i=Math.max(0,S.listen.i-1);renderListen();if(S.listen.playing)speakCur();};
  const pb=el('button','ctrl-btn',S.listen.playing?'⏸':'▶');
  pb.id='listenPlay';pb.disabled=!supportsSpeech();
  pb.onclick=()=>{
    if(S.listen.playing){stopListening();updateListenControls();}
    // Start synchronously in the tap handler; do not await voices or rebuild the page first.
    else speakCur();
  };
  bar.appendChild(pb);
  bar.appendChild(el('button','ctrl-btn small','⏭')).onclick=()=>{S.listen.i=Math.min(blocks.length-1,S.listen.i+1);renderListen();if(S.listen.playing)speakCur();};
  bar.appendChild(el('div','ctrl-info',`<b>${escHtml(blocks[i].src)}</b><span id="listenStatus" role="status" aria-live="polite"></span>`));
  const sel=document.createElement('select');
  sel.className='rate';
  sel.setAttribute('aria-label','朗读速度');
  sel.innerHTML='<option value="0.75">0.75×</option><option value="1" selected>1.0×</option><option value="1.25">1.25×</option>';
  sel.value=String(S.listen.rate);
  sel.onchange=()=>{S.listen.rate=+sel.value;if(S.listen.playing)speakCur();};
  bar.appendChild(sel);
  sc.appendChild(bar);
  const options=el('div','listen-options');
  const label=el('label','','朗读声音');label.htmlFor='listenVoice';options.appendChild(label);
  const voiceSelect=document.createElement('select');voiceSelect.id='listenVoice';voiceSelect.className='rate';
  voiceSelect.onchange=()=>{listenSpeech.voiceName=voiceSelect.value;pickVoice();if(S.listen.playing)speakCur();};
  options.appendChild(voiceSelect);sc.insertBefore(options,listWrap);
  const help=el('p','listen-help','iPhone 无声时，请检查媒体音量、静音模式和蓝牙输出；也可以切换上方中文声音后再次点击播放。停止后再播放会从本题开头开始。');
  help.style.marginBottom='12px';sc.insertBefore(help,listWrap);
  m.appendChild(sc);
  refreshListenVoices();updateListenControls();
  const cur=$('#blk-'+i);
  if(cur)cur.scrollIntoView({block:'center',behavior:'smooth'});
}

export function selectListenQuestion(index) {
  S.listen.i = index; renderListen();
  if (S.listen.playing) speakCur();
}
export { startListen, renderListen, stopListening };
