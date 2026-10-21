function splitSpeechText(text,maxLength=100){
  const parts=text.match(/[^。！？；\n]+[。！？；\n]*|[。！？；\n]+/g)||[];
  const chunks=[];let current='';
  for(const part of parts){
    for(const char of Array.from(part)){
      if(Array.from(current).length>=maxLength){chunks.push(current);current='';}
      current+=char;
    }
    if(current){chunks.push(current);current='';}
  }
  return chunks.filter(t=>t.trim());
}

export { splitSpeechText };

// The controller owns speech sessions; the view owns DOM rendering and status text.
export function createSpeechController({
  state: S, getBlocks: readBlocks, onActivity: recordStudyActivity = () => {},
  onRender: renderListen = () => {}, onStatusChange: updateListenControls = () => {},
  onVoicesChange: refreshListenVoices = () => {}, environment: window = globalThis,
  setTimer: setTimeout = globalThis.setTimeout, clearTimer: clearTimeout = globalThis.clearTimeout,
}) {
  const speechSynthesis = window.speechSynthesis;
  const SpeechSynthesisUtterance = window.SpeechSynthesisUtterance;
  let zhVoice=null;
  // Retain utterances until completion and ignore callbacks from cancelled sessions.
  const listenSpeech={generation:0,utterances:[],startTimer:null,status:'idle',error:'',voiceName:''};
  function supportsSpeech(){return !!window.speechSynthesis&&typeof window.SpeechSynthesisUtterance==='function';}
  function chineseVoices(){
    if(!supportsSpeech())return [];
    return speechSynthesis.getVoices().filter(v=>/^(zh|cmn)([-_]|$)/i.test(v.lang));
  }
  function pickVoice(){
    const vs=chineseVoices();
    const rank=v=>(/^zh[-_]CN$/i.test(v.lang)?100:/^cmn/i.test(v.lang)?90:50)+(v.localService?10:0)+(v.default?1:0);
    zhVoice=vs.find(v=>v.name===listenSpeech.voiceName)||vs.sort((a,b)=>rank(b)-rank(a))[0]||null;
  }
  if(supportsSpeech()){
    speechSynthesis.addEventListener('voiceschanged',()=>{pickVoice();refreshListenVoices();});
    pickVoice();
  }
  function clearSpeechTimer(){clearTimeout(listenSpeech.startTimer);listenSpeech.startTimer=null;}
  function stopListening(){
    ++listenSpeech.generation;
    clearSpeechTimer();
    const hadUtterances=listenSpeech.utterances.length>0;
    listenSpeech.utterances=[];
    S.listen.playing=false;listenSpeech.status='idle';listenSpeech.error='';
    // Avoid cancel() immediately before the first speak() on an idle iOS engine.
    if(supportsSpeech()&&(hadUtterances||speechSynthesis.speaking||speechSynthesis.pending||speechSynthesis.paused))speechSynthesis.cancel();
  }
  function failListening(message){
    stopListening();listenSpeech.status='error';listenSpeech.error=message;
    updateListenControls();
  }
  function speakCur(){
    stopListening();
    if(!supportsSpeech()){failListening('当前浏览器不支持语音朗读');return;}
    if(!readBlocks()[S.listen.i])return;
    pickVoice();
    S.listen.playing=true;listenSpeech.error='';
    // Some engines remain paused after cancellation; resume while the tap is active.
    if(speechSynthesis.paused)speechSynthesis.resume();
    queueSpeechBlock(listenSpeech.generation);
  }
  function queueSpeechBlock(generation){
    if(generation!==listenSpeech.generation||!S.listen.playing||S.screen!=='listen')return;
    const blocks=readBlocks(),i=S.listen.i;
    const b=blocks[i];
    if(!b){stopListening();updateListenControls();return;}
    const texts=splitSpeechText(b.src+'。'+b.ans);
    listenSpeech.status='starting';updateListenControls();
    const isCurrent=()=>generation===listenSpeech.generation&&S.listen.playing&&S.screen==='listen';
    const errors={
      'not-allowed':'Safari 未允许朗读，请再次点击播放。',
      'language-unavailable':'当前设备没有可用的中文语音，请检查系统中文语音或切换朗读声音。',
      'voice-unavailable':'所选声音不可用，请切换为自动选择普通话后重试。',
      'audio-busy':'声音输出正被占用，请关闭其他音频后重试。',
      'audio-hardware':'无法使用声音输出，请检查媒体音量和蓝牙设备。',
      'network':'语音服务连接失败，请切换其他中文声音或检查网络。'
    };
    listenSpeech.utterances=texts.map((text,index)=>{
      const u=new SpeechSynthesisUtterance(text);
      let started=false;
      u.lang=zhVoice?zhVoice.lang:'zh-CN';u.rate=S.listen.rate;u.volume=1;
      if(zhVoice)u.voice=zhVoice;
      u.onstart=()=>{
        if(!isCurrent())return;
        started=true;
        clearSpeechTimer();listenSpeech.status='playing';updateListenControls();
      };
      u.onerror=event=>{
        if(!isCurrent())return;
        failListening(errors[event.error]||'语音播放失败（'+(event.error||'unknown')+'），请切换声音后重试。');
      };
      u.onend=()=>{
        if(!isCurrent())return;
        if(!started){failListening('系统语音未能开始播放，请切换中文声音，并检查媒体音量和静音模式后重试。');return;}
        if(index!==texts.length-1)return;
        clearSpeechTimer();listenSpeech.utterances=[];
        recordStudyActivity(b,'listen');
        if(S.listen.i<readBlocks().length-1){
          S.listen.i++;renderListen();
          // Natural completion needs no cancel(), which can discard the next utterance on WebKit.
          queueSpeechBlock(generation);
        }else{
          S.listen.playing=false;listenSpeech.status='done';updateListenControls();
        }
      };
      return u;
    });
    clearSpeechTimer();
    listenSpeech.startTimer=setTimeout(()=>{
      if(isCurrent())failListening('语音未能启动，请检查音量、静音模式，切换中文声音后再次点击播放。');
    },12000);
    try{
      // Queue all short segments during the user's tap rather than starting each from a timer.
      for(const u of listenSpeech.utterances){
        if(!isCurrent())break;
        speechSynthesis.speak(u);
      }
    }catch(error){
      if(isCurrent())failListening('语音启动失败，请切换声音后再次点击播放。');
    }
  }
  window.addEventListener('pagehide',stopListening);

  return { state: listenSpeech, supportsSpeech, chineseVoices, pickVoice, stopListening, speakCur };
}
