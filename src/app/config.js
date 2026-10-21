export const MATERIAL = {
  id: 'music-overview',
  subjectId: 'music',
  title: '音乐学概论',
  badge: '乐',
  questionsUrl: new URL('../../data/music/questions.json', import.meta.url),
};

export const MODES = [{key:'blank', name:'挖空填空', desc:'补全被挖空的原文，门槛最低，适合初记'},
  {key:'qa',    name:'问答提示', desc:'关键词提示，引导你回忆完整内容'},
  {key:'full',  name:'全文默写', desc:'无提示完整输出，直接检验背诵效果'}
];
export const modeName = k => MODES.find(m => m.key === k).name;
