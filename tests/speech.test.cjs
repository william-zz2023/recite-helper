const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
let createSpeechController, splitSpeechText;
test.before(async () => {
  ({ createSpeechController, splitSpeechText } = await import('../src/services/speech.js'));
});
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data/music/questions.json'), 'utf8'));

function setup({ voices = [], blocks = [{ src: '题目', ans: '第一句。第二句。' }], supported = true } = {}) {
  const timers = new Map(), spoken = [], events = [], handlers = {}, studyActivities = [];
  const state = { screen: 'listen', listen: { i: 0, playing: false, rate: 1 } };
  const controls = {
    '#listenPlay': { textContent: '', setAttribute() {} },
    '#listenStatus': { textContent: '', classList: { toggle() {} } }
  };
  let timerId = 0;
  const synth = {
    speaking: false, pending: false, paused: false,
    getVoices: () => voices,
    addEventListener: (name, callback) => { handlers[name] = callback; },
    speak(utterance) { events.push('speak'); spoken.push(utterance); this.pending = true; },
    cancel() {
      events.push('cancel'); this.speaking = false; this.pending = false;
      // Safari may deliver old cancellation events after another tap has started.
      for (const utterance of spoken) utterance.onerror?.({ error: 'canceled' });
    },
    resume() { events.push('resume'); this.paused = false; }
  };
  class Utterance { constructor(text) { this.text = text; } }
  let controller;
  function updateControls() {
    const status = controller.state;
    const messages = { idle: '点击播放', starting: '正在启动', playing: '正在朗读', done: '完成' };
    controls['#listenPlay'].textContent = state.listen.playing ? '⏸' : '▶';
    controls['#listenStatus'].textContent = status.error || messages[status.status];
  }
  controller = createSpeechController({
    state, getBlocks: () => blocks,
    environment: {
      speechSynthesis: supported ? synth : undefined,
      SpeechSynthesisUtterance: supported ? Utterance : undefined,
      addEventListener: (name, callback) => { handlers[name] = callback; }
    },
    onActivity(question, kind) { studyActivities.push({ question, kind }); },
    onRender: updateControls, onStatusChange: updateControls,
    setTimer(callback) { const id = ++timerId; timers.set(id, callback); return id; },
    clearTimer(id) { timers.delete(id); }
  });
  return {
    state, synth, spoken, events, controls, handlers, timers, studyActivities, controller,
    start(utterance = spoken[0]) { synth.speaking = true; utterance.onstart(); },
    end(utterance) { synth.speaking = false; synth.pending = false; utterance.onend(); },
    timeout() { for (const callback of [...timers.values()]) callback(); }
  };
}

test('every supplied question is spoken in short segments without losing text', () => {
  for (const question of data.questions) {
    const text = question.src + '。' + question.ans;
    const chunks = splitSpeechText(text);
    assert.equal(chunks.join(''), text);
    assert.ok(chunks.every(chunk => Array.from(chunk).length <= 100));
  }
  const unicodeText = '甲'.repeat(99) + '🎵'.repeat(4) + '乙。';
  const chunks = splitSpeechText(unicodeText);
  assert.equal(chunks.join(''), unicodeText);
  assert.ok(chunks.every(chunk => Array.from(chunk).length <= 100));
});

test('first tap queues speech synchronously, retains utterances, and waits for onstart', () => {
  const env = setup();
  env.controller.speakCur();
  assert.ok(env.spoken.length > 0);
  assert.deepEqual(env.events, env.spoken.map(() => 'speak'));
  assert.equal(env.controller.state.utterances.length, env.spoken.length);
  assert.equal(env.controller.state.status, 'starting');
  env.start();
  assert.equal(env.controller.state.status, 'playing');
  assert.equal(env.timers.size, 0);
  assert.equal(env.studyActivities.length, 0);
});

test('automatic voice selection prefers local Mandarin over other Chinese voices', () => {
  const cantonese = { name: '粤语', lang: 'zh-HK', localService: true };
  const remote = { name: '网络普通话', lang: 'zh-CN', localService: false };
  const local = { name: '本地普通话', lang: 'zh-CN', localService: true };
  const env = setup({ voices: [cantonese, remote, local] });
  env.controller.speakCur();
  assert.equal(env.spoken[0].voice, local);
  assert.equal(env.spoken[0].lang, 'zh-CN');
  assert.equal(env.spoken[0].volume, 1);
});

test('late voice loading is refreshed on the next tap without delaying speech', () => {
  const voices = [], env = setup({ voices });
  env.controller.speakCur();
  assert.equal(env.spoken[0].voice, undefined);
  assert.equal(env.spoken[0].lang, 'zh-CN');
  voices.push({ name: '普通话', lang: 'zh-CN', localService: true });
  env.handlers.voiceschanged();
  env.controller.stopListening(); env.controller.speakCur();
  assert.equal(env.spoken.at(-1).voice.name, '普通话');
});

test('natural completion advances to the next question without canceling it', () => {
  const blocks = [{ src: '第一题', ans: '甲。乙。' }, { src: '第二题', ans: '丙。' }];
  const env = setup({ blocks });
  env.controller.speakCur();
  const first = [...env.spoken];
  for (const utterance of first) { env.start(utterance); env.end(utterance); }
  assert.equal(env.state.listen.i, 1);
  assert.equal(env.state.listen.playing, true);
  assert.equal(env.events.includes('cancel'), false);
  const second = env.spoken.slice(first.length);
  assert.equal(second.map(u => u.text).join(''), '第二题。丙。');
  for (const utterance of second) { env.start(utterance); env.end(utterance); }
  assert.equal(env.state.listen.playing, false);
  assert.equal(env.controller.state.status, 'done');
  assert.equal(env.controller.state.utterances.length, 0);
  assert.equal(env.timers.size, 0);
  assert.equal(env.studyActivities.length, 2);
  assert.ok(env.studyActivities.every(activity => activity.kind === 'listen'));
});

test('old callbacks cannot interrupt playback after a rapid restart', () => {
  const env = setup();
  env.controller.speakCur();
  const oldUtterance = env.spoken[0];
  env.controller.speakCur();
  const freshUtterance = env.spoken.at(-1);
  oldUtterance.onstart(); oldUtterance.onend(); oldUtterance.onerror({ error: 'interrupted' });
  assert.equal(env.state.listen.playing, true);
  assert.equal(env.controller.state.status, 'starting');
  env.start(freshUtterance);
  assert.equal(env.controller.state.status, 'playing');
  assert.equal(env.timers.size, 0);
});

test('reported errors and a missing start event reset the play button with an explanation', () => {
  for (const failure of ['not-allowed', 'language-unavailable', 'voice-unavailable', 'synthesis-failed', 'timeout']) {
    const env = setup(); env.controller.speakCur();
    if (failure === 'timeout') env.timeout();
    else env.spoken[0].onerror({ error: failure });
    assert.equal(env.state.listen.playing, false);
    assert.equal(env.controller.state.status, 'error');
    assert.ok(env.controls['#listenStatus'].textContent.length > 0);
    assert.equal(env.controls['#listenPlay'].textContent, '▶');
    assert.equal(env.timers.size, 0);
  }
});

test('a silent end event without a start event does not skip through the questions', () => {
  const blocks = [{ src: '第一题', ans: '甲。' }, { src: '第二题', ans: '乙。' }];
  const env = setup({ blocks }); env.controller.speakCur();
  env.end(env.spoken[0]);
  assert.equal(env.state.listen.i, 0);
  assert.equal(env.state.listen.playing, false);
  assert.equal(env.controller.state.status, 'error');
  assert.match(env.controls['#listenStatus'].textContent, /未能开始播放/);
  assert.equal(env.studyActivities.length, 0);
});

test('a paused synthesis engine is resumed before speech is submitted', () => {
  const env = setup(); env.synth.paused = true;
  env.controller.speakCur();
  assert.deepEqual(env.events.slice(0, 3), ['cancel', 'resume', 'speak']);
});

test('leaving the page cancels playback and invalidates delayed end events', () => {
  const env = setup(); env.controller.speakCur();
  const utterance = env.spoken.at(-1);
  env.handlers.pagehide(); utterance.onend();
  assert.equal(env.state.listen.playing, false);
  assert.equal(env.controller.state.status, 'idle');
  assert.equal(env.timers.size, 0);
});

test('unsupported speech APIs and empty chapter selections do not throw', () => {
  const unsupported = setup({ supported: false });
  unsupported.controller.speakCur();
  assert.equal(unsupported.state.listen.playing, false);
  assert.equal(unsupported.controller.state.status, 'error');
  const empty = setup({ blocks: [] });
  empty.controller.speakCur();
  assert.equal(empty.spoken.length, 0);
});
