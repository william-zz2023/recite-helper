export const STUDY_STORAGE_KEY='recite-helper.music-overview.study.v1';
export const STUDY_KINDS={blank:'填空练习',qa:'问答练习',full:'全文默写',read:'阅读确认',listen:'听读完成'};

// Storage and clock are injected so persistence can be tested without a browser.
export function createStudyStore({ key = STUDY_STORAGE_KEY, storage = () => globalThis.localStorage, now = () => new Date() } = {}) {
  let studyStorageError='',studyStorageLocked=false,studyUnreadableOriginal=null;
  function studyDateKey(date=now()){
    return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
  }
  function isStudyDate(key){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(key))return false;
    const [y,m,d]=key.split('-').map(Number),date=new Date(y,m-1,d,12);
    return date.getFullYear()===y&&date.getMonth()===m-1&&date.getDate()===d;
  }
  function shiftStudyDate(key,offset){
    const [y,m,d]=key.split('-').map(Number);return studyDateKey(new Date(y,m-1,d+offset,12));
  }
  function emptyStudyHistory(){return {version:1,days:{}};}
  function validateStudyHistory(value){
    const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
    if(!object(value)||value.version!==1||!object(value.days))throw new Error('备份格式不正确');
    const clean=emptyStudyHistory();
    for(const [day,entry] of Object.entries(value.days)){
      if(!isStudyDate(day)||!object(entry)||!object(entry.items))throw new Error('日期记录格式不正确');
      const items={};
      for(const [id,item] of Object.entries(entry.items)){
        if(!/^(0|[1-9]\d*)$/.test(id)||!object(item)||item.id!==Number(id)||typeof item.title!=='string'||typeof item.chapter!=='string'||!object(item.activities))throw new Error('题目记录格式不正确');
        const activities={};
        for(const [kind,activity] of Object.entries(item.activities)){
          if(!Object.hasOwn(STUDY_KINDS,kind)||!object(activity)||!Number.isSafeInteger(activity.count)||activity.count<1||typeof activity.lastAt!=='string'||!Number.isFinite(Date.parse(activity.lastAt)))throw new Error('学习次数格式不正确');
          const a={count:activity.count,lastAt:activity.lastAt};
          if(['blank','qa','full'].includes(kind)){
            if(!Number.isSafeInteger(activity.passed)||activity.passed<0||activity.passed>activity.count||!Number.isInteger(activity.lastScore)||activity.lastScore<0||activity.lastScore>100)throw new Error('练习成绩格式不正确');
            a.passed=activity.passed;a.lastScore=activity.lastScore;
          }
          activities[kind]=a;
        }
        if(Object.keys(activities).length)items[id]={id:item.id,title:item.title,chapter:item.chapter,activities};
      }
      if(Object.keys(items).length)clean.days[day]={items};
    }
    return clean;
  }
  function loadStudyHistory(){
    let raw=null;
    try{raw=storage().getItem(key);return raw?validateStudyHistory(JSON.parse(raw)):emptyStudyHistory();}
    catch(error){
      studyStorageLocked=raw!==null;studyUnreadableOriginal=raw;
      studyStorageError=raw!==null?'原有记录无法读取，已保留原数据；本次学习暂存在内存中，请先导出备份。':'此浏览器暂时不能保存记录；本次学习仅在当前页面保留，请导出备份。';
      return emptyStudyHistory();
    }
  }
  let studyHistory=loadStudyHistory();
  function saveStudyHistory(){
    if(studyStorageLocked)return false;
    try{storage().setItem(key,JSON.stringify(studyHistory));studyStorageError='';return true;}
    catch(error){studyStorageError='浏览器未能保存最新记录，请先导出备份；关闭页面后未保存的记录会丢失。';return false;}
  }
  function recordStudyActivity(q,kind,{score=0,ok=false}={}){
    if(!q||!Object.hasOwn(STUDY_KINDS,kind))return;
    const instant=now(),day=studyDateKey(instant),id=String(q.id);
    const entry=studyHistory.days[day]||(studyHistory.days[day]={items:{}});
    const item=entry.items[id]||(entry.items[id]={id:q.id,title:q.src,chapter:q.ch,activities:{}});
    if(kind==='read'&&item.activities.read)return;
    const activity=item.activities[kind]||(item.activities[kind]={count:0,lastAt:instant.toISOString()});
    activity.count++;activity.lastAt=instant.toISOString();
    if(['blank','qa','full'].includes(kind)){
      activity.passed=(activity.passed||0)+(ok?1:0);activity.lastScore=Math.max(0,Math.min(100,Math.round(score*100)));
    }
    saveStudyHistory();
  }
  function studyDaySummary(day){
    const items=Object.values(studyHistory.days[day]?.items||{});
    const practiced=items.filter(q=>['blank','qa','full'].some(k=>q.activities[k]));
    const attempts=practiced.flatMap(q=>['blank','qa','full'].map(k=>q.activities[k]).filter(Boolean));
    return {items,total:items.length,practiced:practiced.length,read:items.filter(q=>q.activities.read).length,listen:items.filter(q=>q.activities.listen).length,
      attempts:attempts.reduce((n,a)=>n+a.count,0),passed:attempts.reduce((n,a)=>n+a.passed,0)};
  }
  function studyStreak(today=studyDateKey()){
    let day=studyDaySummary(today).total?today:shiftStudyDate(today,-1),count=0;
    while(studyDaySummary(day).total){count++;day=shiftStudyDate(day,-1);}
    return count;
  }
  function mergeStudyHistory(first,second){
    const merged=validateStudyHistory(first),incoming=validateStudyHistory(second);
    for(const [date,day] of Object.entries(incoming.days)){
      const target=merged.days[date]||(merged.days[date]={items:{}});
      for(const [id,item] of Object.entries(day.items)){
        if(!target.items[id]){target.items[id]=item;continue;}
        for(const [kind,activity] of Object.entries(item.activities)){
          const old=target.items[id].activities[kind];
          if(!old){target.items[id].activities[kind]=activity;continue;}
          const latest=Date.parse(activity.lastAt)>Date.parse(old.lastAt)?activity:old;
          target.items[id].activities[kind]={...latest,count:Math.max(old.count,activity.count)};
          if(['blank','qa','full'].includes(kind))target.items[id].activities[kind].passed=Math.max(old.passed,activity.passed);
        }
      }
    }
    return merged;
  }

  function exportBackup() {
    const backup = { ...studyHistory, exportedAt: now().toISOString() };
    if (studyUnreadableOriginal !== null) backup.unreadableOriginal = studyUnreadableOriginal;
    return JSON.parse(JSON.stringify(backup));
  }
  function importBackup(value) {
    const incoming = validateStudyHistory(value);
    studyHistory = mergeStudyHistory(studyHistory, incoming);
    return saveStudyHistory();
  }
  return {
    get history() { return studyHistory; },
    get error() { return studyStorageError; },
    get unreadableOriginal() { return studyUnreadableOriginal; },
    dateKey: studyDateKey, isDate: isStudyDate, shiftDate: shiftStudyDate,
    validate: validateStudyHistory, record: recordStudyActivity,
    summary: studyDaySummary, streak: studyStreak, merge: mergeStudyHistory,
    exportBackup, importBackup,
  };
}
