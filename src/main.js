import { MATERIAL } from './app/config.js';
import { DATA, ALL_CHAPS, initializeMaterial } from './app/state.js';
import { registerScreens, renderScreen, startScreen } from './app/navigation.js';
import { loadQuestions } from './services/materials.js';
import { renderHome } from './features/home.js';
import { renderSidebar } from './features/sidebar.js';
import { startRead, renderRead, selectReadQuestion } from './features/reading.js';
import { startListen, renderListen, stopListening, selectListenQuestion } from './features/listening.js';
import { startPractice, renderQ, renderResult } from './features/practice.js';
import { openStudyHistory, renderStudyHistory } from './features/history.js';
import { startPolitics, renderPolitics } from './features/politics.js';

registerScreens({
  home: { render: renderHome },
  sidebar: { render: renderSidebar },
  read: { start: startRead, render: renderRead, select: selectReadQuestion },
  listen: { start: startListen, render: renderListen, select: selectListenQuestion, stop: stopListening },
  practice: { start: startPractice, render: renderQ },
  history: { start: openStudyHistory, render: renderStudyHistory },
  result: { render: renderResult },
  politics: { start: startPolitics, render: renderPolitics },
});

async function start() {
  try {
    initializeMaterial(await loadQuestions(MATERIAL.questionsUrl));
    document.querySelector('#matInfo').textContent = `${MATERIAL.title} · ${DATA.questions.length} 题 · ${ALL_CHAPS.length} 章`;
    if(window.location.hash==='#politics')startScreen('politics');
    else renderScreen('home');
  } catch (error) {
    console.error(error);
    const message = document.createElement('p');
    message.setAttribute('role', 'alert');
    message.textContent = '资料未能加载，请检查网络后刷新页面。';
    document.querySelector('#main').replaceChildren(message);
  }
}

start();
