/* 文本朗读器（text_reader_aloud）- 纯前端本地朗读
 * 浏览器 speechSynthesis 本地发声，不上传文本、不发起任何网络请求、
 * 不生成音频文件（无音频导出）。
 * 分句 / 钳制 / 发音人回退 / 队列推进均为纯函数，经 module.exports 暴露，
 * 供 node 单元测试 require；浏览器里则走 DOM。
 * 分句为启发式：英文缩写（Dr./Mr./Mrs./Ms./St./Prof. 等）与小数点（v1.2）
 * 不误切；连续标点（？！/……）视为同一句的句末。 */
(function () {
'use strict';

/* ---------- 分句 ---------- */
var ABBREVIATIONS = ['Dr', 'Mr', 'Mrs', 'Ms', 'St', 'Prof', 'Sr', 'Jr', 'vs', 'etc', 'e.g', 'i.e'];
var PLACEHOLDER_DOT = '\u0001';
var CLOSERS = '」』”"\'';

function protectAbbreviationsAndDecimals(text) {
  var out = text;
  var i, abbr, re;
  for (i = 0; i < ABBREVIATIONS.length; i++) {
    abbr = ABBREVIATIONS[i];
    re = new RegExp('(^|[^A-Za-z])(' + abbr.replace(/\./g, '\\.') + ')\\.', 'gi');
    out = out.replace(re, function (m, pre, word) { return pre + word + PLACEHOLDER_DOT; });
  }
  out = out.replace(/(\d)\.(\d)/g, '$1' + PLACEHOLDER_DOT + '$2');
  return out;
}
function restorePlaceholders(text) {
  return text.split(PLACEHOLDER_DOT).join('.');
}
/* 按中文句末标点（。！？；…）与英文句末标点（.!?）＋换行切分；
 * 连续空白与空句丢弃；句末后的右引号/右书名号并入该句。 */
function splitSentences(input) {
  var text = (input === null || input === undefined) ? '' : String(input);
  if (!text.trim()) return [];
  var protectedText = protectAbbreviationsAndDecimals(text);
  var results = [];
  var lines = protectedText.split(/\r\n|\r|\n/);
  var li, line, parts, pi, part, sentence;
  for (li = 0; li < lines.length; li++) {
    line = lines[li];
    if (!line.trim()) continue;
    parts = line.match(/[^。！？；…\.!?]+[。！？；…\.!?]+[」』”"']*|[^。！？；…\.!?]+/g);
    if (!parts) continue;
    for (pi = 0; pi < parts.length; pi++) {
      part = parts[pi].trim();
      if (!part) continue;
      sentence = restorePlaceholders(part);
      results.push(sentence);
    }
  }
  return results;
}

/* ---------- 语速 / 音调钳制 ---------- */
function clampRatePitch(value) {
  var n = Number(value);
  if (!isFinite(n)) return 1.0;
  if (n < 0.5) return 0.5;
  if (n > 2.0) return 2.0;
  return n;
}

/* ---------- 发音人回退链 ---------- */
/* 回退链：指定名称的 voice → 首个含 zh 的 voice → 默认 voice → 第一个可用 voice；
 * 无 voice 时返回 null，调用方不崩溃。 */
function pickVoice(voices, preferredName) {
  var list = Array.isArray(voices) ? voices : [];
  if (!list.length) return null;
  var i, v;
  if (preferredName) {
    for (i = 0; i < list.length; i++) {
      if (list[i] && list[i].name === preferredName) return list[i];
    }
  }
  for (i = 0; i < list.length; i++) {
    v = list[i];
    if (v && typeof v.lang === 'string' && /^zh/i.test(v.lang)) return v;
  }
  for (i = 0; i < list.length; i++) {
    if (list[i] && list[i].default) return list[i];
  }
  return list[0];
}

/* ---------- 队列推进 ---------- */
/* 返回下一句下标；读完返回 -1（调用方据此提示「朗读完成」并清除高亮）。 */
function nextSentenceIndex(current, total) {
  var c = Number(current), t = Number(total);
  if (!isFinite(c) || !isFinite(t) || t <= 0) return -1;
  return (c + 1 < t) ? c + 1 : -1;
}
function sentencesFrom(sentences, startIndex) {
  var list = Array.isArray(sentences) ? sentences : [];
  var s = Number(startIndex);
  if (!isFinite(s) || s < 0) s = 0;
  return list.slice(s);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    splitSentences: splitSentences,
    clampRatePitch: clampRatePitch,
    pickVoice: pickVoice,
    nextSentenceIndex: nextSentenceIndex,
    sentencesFrom: sentencesFrom
  };
}

/* ---------- 浏览器 DOM 逻辑 ---------- */
if (typeof document === 'undefined') return;

function $(id) { return document.getElementById(id); }
var textEl, sentListEl, progressEl, statusEl, voiceEl, rateEl, pitchEl,
    rateValEl, pitchValEl, toastTimer;
var sentences = [];
var currentIndex = -1;
var speaking = false;
var supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

function toast(msg) {
  var el = $('tra-toast');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.style.display = 'none'; }, 3200);
}
function setStatus(msg) { if (statusEl) statusEl.textContent = msg; }
function refreshProgress() {
  if (!progressEl) return;
  if (!speaking || currentIndex < 0) {
    progressEl.textContent = sentences.length
      ? '共 ' + sentences.length + ' 句，点击任一句从该句开始朗读'
      : '粘贴文本后点「分句」或直接点「朗读」';
    return;
  }
  progressEl.textContent = '正在朗读第 ' + (currentIndex + 1) + ' / 共 ' + sentences.length + ' 句';
}
function renderSentences() {
  if (!sentListEl) return;
  sentListEl.innerHTML = '';
  sentences.forEach(function (s, idx) {
    var p = document.createElement('p');
    p.className = 'tra-sent';
    p.textContent = s;
    p.setAttribute('data-index', String(idx));
    p.setAttribute('tabindex', '0');
    p.setAttribute('role', 'button');
    p.setAttribute('aria-label', '从第 ' + (idx + 1) + ' 句开始朗读');
    p.addEventListener('click', function () { startFrom(idx); });
    p.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startFrom(idx); }
    });
    sentListEl.appendChild(p);
  });
}
function highlight(idx) {
  var items = sentListEl ? sentListEl.querySelectorAll('.tra-sent') : [];
  var i;
  for (i = 0; i < items.length; i++) {
    items[i].classList.toggle('tra-active', i === idx);
  }
  if (idx >= 0 && items[idx] && items[idx].scrollIntoView) {
    items[idx].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}
function clearHighlight() { highlight(-1); }

function buildSentences() {
  sentences = splitSentences(textEl ? textEl.value : '');
  renderSentences();
  currentIndex = -1;
  refreshProgress();
  return sentences.length;
}
function stopReading(silent) {
  if (supported) window.speechSynthesis.cancel();
  speaking = false;
  currentIndex = -1;
  clearHighlight();
  refreshProgress();
  if (!silent) setStatus('已停止');
}
function speakSentence(idx) {
  if (!supported || idx < 0 || idx >= sentences.length) return;
  currentIndex = idx;
  highlight(idx);
  refreshProgress();
  setStatus('正在朗读第 ' + (idx + 1) + ' 句');
  var utter = new SpeechSynthesisUtterance(sentences[idx]);
  utter.rate = clampRatePitch(rateEl ? rateEl.value : 1);
  utter.pitch = clampRatePitch(pitchEl ? pitchEl.value : 1);
  var voices = window.speechSynthesis.getVoices();
  var voice = pickVoice(voices, voiceEl ? voiceEl.value : '');
  if (voice) utter.voice = voice;
  utter.onend = function () {
    if (!speaking) return;
    var next = nextSentenceIndex(currentIndex, sentences.length);
    if (next === -1) {
      speaking = false;
      currentIndex = -1;
      clearHighlight();
      refreshProgress();
      setStatus('朗读完成');
      toast('朗读完成');
    } else {
      speakSentence(next);
    }
  };
  utter.onerror = function () {
    if (!speaking) return;
    speaking = false;
    setStatus('朗读出错，已停止');
  };
  window.speechSynthesis.speak(utter);
}
function startFrom(idx) {
  if (!supported) { setStatus('当前浏览器不支持本地朗读'); return; }
  if (!sentences.length) buildSentences();
  if (!sentences.length) {
    setStatus('请先粘贴文本');
    toast('请先粘贴文本再朗读');
    return;
  }
  window.speechSynthesis.cancel();
  speaking = true;
  speakSentence(idx);
}
function refreshVoiceList() {
  if (!supported || !voiceEl) return;
  var previous = voiceEl.value;
  var voices = window.speechSynthesis.getVoices();
  voiceEl.innerHTML = '';
  if (!voices.length) {
    var opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = '系统默认发音人（暂未加载到语音列表）';
    voiceEl.appendChild(opt0);
    return;
  }
  voices.forEach(function (v) {
    var o = document.createElement('option');
    o.value = v.name;
    o.textContent = v.name + (v.lang ? '（' + v.lang + '）' : '');
    voiceEl.appendChild(o);
  });
  var picked = pickVoice(voices, previous);
  if (picked) voiceEl.value = picked.name;
}
function disableUnsupported() {
  var banner = $('tra-unsupported');
  if (banner) banner.style.display = 'block';
  var ids = ['tra-speak', 'tra-pause', 'tra-resume', 'tra-stop', 'tra-split'];
  ids.forEach(function (id) {
    var el = $(id);
    if (el) el.disabled = true;
  });
  setStatus('当前浏览器不支持本地朗读，请用桌面版 Chrome/Edge');
}
function init() {
  textEl = $('tra-text');
  sentListEl = $('tra-sentences');
  progressEl = $('tra-progress');
  statusEl = $('tra-status');
  voiceEl = $('tra-voice');
  rateEl = $('tra-rate');
  pitchEl = $('tra-pitch');
  rateValEl = $('tra-rate-val');
  pitchValEl = $('tra-pitch-val');
  if (!supported) { disableUnsupported(); return; }
  refreshVoiceList();
  if ('onvoiceschanged' in window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = refreshVoiceList;
  }
  function bind(id, fn) {
    var el = $(id);
    if (el) el.addEventListener('click', fn);
  }
  bind('tra-split', function () {
    if (!buildSentences()) { setStatus('请先粘贴文本'); toast('请先粘贴文本再分句'); }
    else setStatus('已分出 ' + sentences.length + ' 句，点击任一句可从该句起读');
  });
  bind('tra-clear', function () {
    stopReading(true);
    if (textEl) textEl.value = '';
    sentences = [];
    renderSentences();
    refreshProgress();
    setStatus('已清空');
  });
  bind('tra-sample', function () {
    stopReading(true);
    if (textEl) textEl.value = '校对长文时，眼睛最容易漏错。把文章听一遍，语病和错别字往往自己跳出来。This tool reads aloud locally in your browser. No audio file is exported, and your text never leaves this page.';
    buildSentences();
    setStatus('已填入示例短文');
  });
  bind('tra-speak', function () { startFrom(0); });
  bind('tra-pause', function () {
    if (speaking) { window.speechSynthesis.pause(); setStatus('已暂停'); }
  });
  bind('tra-resume', function () {
    if (speaking) { window.speechSynthesis.resume(); setStatus('继续朗读'); }
  });
  bind('tra-stop', function () { stopReading(false); });
  if (rateEl) rateEl.addEventListener('input', function () {
    if (rateValEl) rateValEl.textContent = clampRatePitch(rateEl.value).toFixed(1) + '×';
  });
  if (pitchEl) pitchEl.addEventListener('input', function () {
    if (pitchValEl) pitchValEl.textContent = clampRatePitch(pitchEl.value).toFixed(1);
  });
  buildSentences();
  refreshProgress();
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
})();
