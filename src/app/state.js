export const DATA = { questions: [] };
export const ALL_CHAPS = [];

export const S = {screen:'home', mode:null, density:30,
  chaps:new Set(ALL_CHAPS), shuffle:false,
  expandedChaps:new Set(), sidebarQuery:'',
  list:[], batches:[], batchIdx:0, pos:0, results:[], t0:0,
  read:{i:0}, listen:{i:0, playing:false, rate:1}
};

// Keep the same object references for the feature modules; initialize before rendering.
export function initializeMaterial(data) {
  DATA.questions = data.questions;
  ALL_CHAPS.splice(0, ALL_CHAPS.length, ...new Set(data.questions.map(q => q.ch)));
  S.chaps = new Set(ALL_CHAPS);
}
