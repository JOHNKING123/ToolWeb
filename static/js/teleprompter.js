/* 在线提词器（Teleprompter）：大字滚动提词 / 镜像模式 / 全屏深色提词 / localStorage 暂存
*
* 功能：
*  1) 左侧编辑区：文案 textarea ＋ 字号 / 行距 / 滚动速度 / 镜像 / 进度条显示设置，
*     字数统计＋预计朗读时长（180 字/分钟），示例演讲稿一键载入。
*  2) 右侧播放区：大字平滑滚动（rAF 驱动），速度 1x–5x，暂停/继续，
*     快捷键：空格 播放/暂停，↑/↓ 微调速度（±0.5x），F 全屏，Esc 显式退出全屏（页面监听兜底，2026-10-21 修复）。
*  3) 进度条点击跳转，当前行（基准线所在段落）高亮。
*  4) 镜像模式：内容水平翻转（scaleX(-1)），适配物理提词镜面。
*  5) 全屏：Fullscreen API，深色高对比，Esc 页面显式监听＋浏览器原生双保险退出。
*  6) localStorage 自动暂存（tw_teleprompter_v1），刷新不丢。
* 纯函数全部经 module.exports 暴露，node tests/teleprompter.test.js 自测；
* 浏览器内 init 挂 DOMContentLoaded；无网络请求（零上传）。
*/
(function () {
"use strict";

/* ---------- 1. 基础 ---------- */
var LS_KEY = "tw_teleprompter_v1";
var READ_CPM = 180;            /* 预计朗读：180 字/分钟 */
var BASE_PX_PER_SEC = 60;      /* 1x 速度基准：60 px/秒 */
var MARKER_FRAC = 0.35;        /* 读稿基准线位于视口高度 35% 处 */

function clampNum(v, def, min, max) {
  var x = parseFloat(v);
  if (!isFinite(x)) return def;
  if (x < min) return min;
  if (x > max) return max;
  return x;
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function defaultSettings() {
  return {fontSize: 56, lineHeight: 1.8, speed: 1, mirror: false, showProgress: true};
}

/* ---------- 2. 文案解析与统计 ---------- */
/* parseScript：按行切分，跳过空行；返回 [{i, text, chars}] */
function parseScript(text) {
  var lines = String(text == null ? "" : text).split(/\r?\n/);
  var paras = [], i = 0;
  for (var k = 0; k < lines.length; k++) {
    var t = lines[k].trim();
    if (!t) continue;
    paras.push({i: i, text: t, chars: t.replace(/\s/g, "").length});
    i++;
  }
  return paras;
}

/* countChars：去掉空白后的字符数（中英统一按字计） */
function countChars(text) {
  return String(text == null ? "" : text).replace(/\s/g, "").length;
}

/* estimateSeconds：按 cpm 字/分钟估算朗读秒数 */
function estimateSeconds(chars, cpm) {
  cpm = clampNum(cpm, READ_CPM, 1, 100000);
  if (chars <= 0) return 0;
  return Math.round(chars / cpm * 60);
}

/* formatDur：秒 → "M分S秒" */
function formatDur(sec) {
  sec = Math.max(0, Math.round(sec));
  var m = Math.floor(sec / 60), s = sec % 60;
  return m + "分" + s + "秒";
}

/* scriptStats：{paras 段数, chars 字数, seconds 预计秒数, label 展示文案} */
function scriptStats(text, cpm) {
  var paras = parseScript(text);
  var chars = countChars(text);
  var seconds = estimateSeconds(chars, cpm == null ? READ_CPM : cpm);
  return {
    paras: paras.length,
    chars: chars,
    seconds: seconds,
    label: "共 " + paras.length + " 段 · " + chars + " 字 · 预计朗读约 " + formatDur(seconds) + "（按 180 字/分钟）"
  };
}

/* ---------- 3. 速度 ---------- */
/* clampSpeed：钳制到 1..5，步进对齐到 0.5 */
function clampSpeed(v) {
  var x = clampNum(v, 1, 1, 5);
  return Math.round(x * 2) / 2;
}

/* adjustSpeed：按 delta 调速（↑/↓ 传入 ±0.5），返回钳制后的新速度 */
function adjustSpeed(v, delta) {
  return clampSpeed(clampNum(v, 1, 1, 5) + delta);
}

/* pxPerSecond：x 倍速 → 每秒像素数 */
function pxPerSecond(speed, base) {
  return clampSpeed(speed) * clampNum(base, BASE_PX_PER_SEC, 1, 100000);
}

/* ---------- 4. 进度映射 ---------- */
function clamp01(x) {
  if (!isFinite(x)) return 0;
  return x < 0 ? 0 : (x > 1 ? 1 : x);
}

/* progressFromScroll：scrollTop/maxScroll → 0..1 进度 */
function progressFromScroll(scrollTop, maxScroll) {
  if (!(maxScroll > 0)) return 0;
  return clamp01(scrollTop / maxScroll);
}

/* scrollTopFromProgress：0..1 进度 → scrollTop（进度条点击跳转用） */
function scrollTopFromProgress(p, maxScroll) {
  if (!(maxScroll > 0)) return 0;
  return clamp01(p) * maxScroll;
}

/* ---------- 5. 当前行判定 ---------- */
/* tops: [{top, bottom}]（内容坐标，升序）；markerY: 基准线在内容中的 y。
* 返回基准线所在的段落下标；超出末尾取最后一段；空数组返回 -1。 */
function findCurrentLine(tops, markerY) {
  if (!tops || !tops.length) return -1;
  if (markerY < tops[0].top) return 0;
  for (var i = 0; i < tops.length; i++) {
    if (markerY >= tops[i].top && markerY < tops[i].bottom) return i;
  }
  return tops.length - 1;
}

/* ---------- 6. 快捷键与镜像 ---------- */
/* keyAction：键盘事件 key → 动作；返回 null 表示不处理。
* 注意：Esc 显式映射为 exitfs——此前完全依赖浏览器原生 Esc 退出全屏，
* 2026-10-21 真机冒烟发现原生处理在部分环境下不触发，改为页面显式监听兜底。 */
function keyAction(key) {
  if (key === " " || key === "Spacebar") return "toggle";
  if (key === "ArrowUp") return "faster";
  if (key === "ArrowDown") return "slower";
  if (key === "f" || key === "F") return "fullscreen";
  if (key === "Escape" || key === "Esc") return "exitfs";
  return null;
}

/* mirrorTransform：镜像开关 → CSS transform */
function mirrorTransform(on) {
  return on ? "scaleX(-1)" : "";
}

/* ---------- 7. 示例演讲稿（≥50 行） ---------- */
var SAMPLE_LINES = [
"各位朋友，大家好！",
"今天，我想和大家聊一聊“坚持”这两个字。",
"坚持，听起来很普通。",
"可真正能做到的人，并不多。",
"我曾经也是一个三分钟热度的人。",
"学画画，画了三天，笔就扔进了抽屉。",
"学吉他，手指起了茧，就再也没有碰过。",
"跑步，跑了两公里，就觉得全世界都欠我一个拥抱。",
"直到有一年，我陪父亲去爬山。",
"那座山不高，海拔只有八百米。",
"可父亲六十多岁了，走得很慢。",
"走五十米，歇一会儿。",
"再走五十米，再歇一会儿。",
"我在旁边急得直跺脚。",
"我说，爸，要不咱们下山吧。",
"父亲摆摆手，说，来都来了。",
"就这样，走走停停，三个小时。",
"我们居然登顶了。",
"站在山顶的那一刻，风很大。",
"父亲笑着说，你看，慢一点，也到得了。",
"这句话，我记了很多年。",
"后来我开始写作。",
"每天五百字，不多，但不断。",
"有时候加班到半夜，困得睁不开眼。",
"我就告诉自己，写完这五百字再睡。",
"一年下来，我写了十八万字。",
"十八万字，听起来很多。",
"其实不过是每天五百字，乘以三百六十五天。",
"坚持，就是把一件小事，重复到极致。",
"有人问我，怎样才能找到热爱？",
"我的答案是，先开始，再谈热爱。",
"很多热爱，都是在坚持里长出来的。",
"就像跑步，跑过最难的前三公里。",
"身体才会分泌快乐，脚步才会变轻。",
"学习一门技能，也是如此。",
"前一百个小时，笨拙又煎熬。",
"熬过去，才会尝到甜头。",
"不要害怕慢，慢，也是一种节奏。",
"不要害怕小，小，也可以积累。",
"最怕的，是站在原地，想太多，做太少。",
"你可以每天早起十分钟，读几页书。",
"你可以每天花二十分钟，练习口语。",
"你可以每周写一篇复盘，记录成长。",
"时间从不辜负每一个认真的人。",
"它只是把答案，藏在了未来。",
"三年后，你会感谢今天开始的自己。",
"五年后，你会和现在的自己，判若两人。",
"当然，坚持的路上，也会有想放弃的时刻。",
"那很正常，说明你在走上坡路。",
"累了，就歇一会儿。",
"歇好了，再继续走。",
"停下来休息，不叫放弃。",
"只有转身下山，才叫放弃。",
"今天站在这里，我想把父亲的那句话送给大家。",
"慢一点，也到得了。",
"愿我们都能在热爱里赶路。",
"在赶路里，找到属于自己的节奏。",
"把每一个平凡的日子，过成想要的样子。",
"谢谢大家！"
];
var SAMPLE_TEXT = SAMPLE_LINES.join("\n");

/* ---------- 8. 浏览器应用 ---------- */
function hasDOM() {
  return typeof document !== "undefined" && typeof window !== "undefined";
}

function $(id) { return document.getElementById(id); }

function toast(msg) {
  var el = $("tp-toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(function () { el.classList.remove("show"); }, 2200);
}

var state = {
  text: "", fontSize: 56, lineHeight: 1.8, speed: 1,
  mirror: false, showProgress: true,
  playing: false, scrollPx: 0, lastT: 0, raf: 0,
  lineTops: [], curLine: -1, lastLineCheck: 0
};

function saveState() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      v: 1, text: state.text, fontSize: state.fontSize,
      lineHeight: state.lineHeight, speed: state.speed,
      mirror: state.mirror, showProgress: state.showProgress
    }));
  } catch (e) { /* 隐私模式等写入失败时静默忽略 */ }
}

function loadState() {
  try {
    var raw = localStorage.getItem(LS_KEY);
    if (!raw) return false;
    var d = JSON.parse(raw);
    if (!d || d.v !== 1) return false;
    var def = defaultSettings();
    state.text = typeof d.text === "string" ? d.text : "";
    state.fontSize = clampNum(d.fontSize, def.fontSize, 24, 120);
    state.lineHeight = clampNum(d.lineHeight, def.lineHeight, 1.2, 2.5);
    state.speed = clampSpeed(d.speed);
    state.mirror = !!d.mirror;
    state.showProgress = d.showProgress !== false;
    return true;
  } catch (e) { return false; }
}

function maxScroll() {
  var view = $("tp-viewport");
  return Math.max(0, view.scrollHeight - view.clientHeight);
}

/* 渲染提词内容；keepFrac=true 时按播放进度比例恢复位置 */
function renderContent(keepFrac) {
  var frac = 0;
  if (keepFrac) frac = progressFromScroll(state.scrollPx, maxScroll());
  var paras = parseScript(state.text);
  var html = [];
  for (var i = 0; i < paras.length; i++) {
    html.push('<p class="tp-line" data-i="' + i + '">' + esc(paras[i].text) + "</p>");
  }
  var content = $("tp-content");
  content.style.transform = mirrorTransform(state.mirror);
  content.style.fontSize = state.fontSize + "px";
  content.style.lineHeight = state.lineHeight;
  content.innerHTML = html.join("");
  $("tp-empty").style.display = paras.length ? "none" : "flex";
  /* 首尾留白：让第一行能到达基准线、最后一行能滚过基准线 */
  var view = $("tp-viewport");
  var mh = view.clientHeight;
  content.style.paddingTop = Math.round(mh * MARKER_FRAC) + "px";
  content.style.paddingBottom = Math.round(mh * (1 - MARKER_FRAC)) + "px";
  refreshLineTops();
  state.scrollPx = scrollTopFromProgress(frac, maxScroll());
  view.scrollTop = state.scrollPx;
  state.curLine = -1;
  updateProgress();
  updateLineHighlight(true);
}

function refreshLineTops() {
  var content = $("tp-content");
  var nodes = content.querySelectorAll(".tp-line");
  var tops = [];
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    tops.push({top: n.offsetTop, bottom: n.offsetTop + n.offsetHeight});
  }
  state.lineTops = tops;
}

function markerContentY() {
  var view = $("tp-viewport");
  return view.scrollTop + view.clientHeight * MARKER_FRAC;
}

function updateLineHighlight(force) {
  var idx = findCurrentLine(state.lineTops, markerContentY());
  if (!force && idx === state.curLine) return;
  var content = $("tp-content");
  var nodes = content.querySelectorAll(".tp-line");
  if (state.curLine >= 0 && nodes[state.curLine]) nodes[state.curLine].classList.remove("tp-cur");
  if (idx >= 0 && nodes[idx]) nodes[idx].classList.add("tp-cur");
  state.curLine = idx;
}

function updateProgress() {
  var fill = $("tp-progress-fill");
  if (fill) fill.style.width = (progressFromScroll(state.scrollPx, maxScroll()) * 100).toFixed(2) + "%";
}

function setSpeed(v, silent) {
  state.speed = clampSpeed(v);
  $("tp-speed").value = state.speed;
  $("tp-speed-label").textContent = state.speed.toFixed(1) + "x";
  if (!silent) saveState();
}

function setPlaying(on) {
  var btn = $("tp-play");
  if (on && !parseScript(state.text).length) { toast("请先在左侧输入文案"); return; }
  state.playing = !!on;
  if (state.playing) {
    if (state.scrollPx >= maxScroll() - 1) { /* 上次播到底：从头开始 */ state.scrollPx = 0; $("tp-viewport").scrollTop = 0; }
    state.lastT = performance.now();
    cancelAnimationFrame(state.raf);
    state.raf = requestAnimationFrame(tick);
  } else {
    cancelAnimationFrame(state.raf);
  }
  btn.innerHTML = state.playing
    ? '<i class="material-icons">pause</i> 暂停'
    : '<i class="material-icons">play_arrow</i> 播放';
}

function tick(now) {
  if (!state.playing) return;
  var dt = Math.min(100, now - state.lastT) / 1000;
  state.lastT = now;
  state.scrollPx += pxPerSecond(state.speed, BASE_PX_PER_SEC) * dt;
  var ms = maxScroll();
  if (state.scrollPx >= ms) {
    state.scrollPx = ms;
    $("tp-viewport").scrollTop = ms;
    updateProgress();
    updateLineHighlight(true);
    setPlaying(false);
    toast("播放完毕");
    return;
  }
  $("tp-viewport").scrollTop = state.scrollPx;
  updateProgress();
  if (now - state.lastLineCheck > 150) {
    state.lastLineCheck = now;
    updateLineHighlight(false);
  }
  state.raf = requestAnimationFrame(tick);
}

function seekToFraction(frac) {
  state.scrollPx = scrollTopFromProgress(frac, maxScroll());
  $("tp-viewport").scrollTop = state.scrollPx;
  updateProgress();
  updateLineHighlight(true);
}

function toggleFullscreen() {
  var wrap = $("tp-player-wrap");
  if (document.fullscreenElement) {
    exitFullscreenExplicit();
  } else if (wrap.requestFullscreen) {
    wrap.requestFullscreen().catch(function () { toast("浏览器拒绝了全屏请求"); });
  } else {
    toast("当前浏览器不支持全屏 API");
  }
}

/* exitFullscreenExplicit：显式退出全屏（2026-10-21 新增）。
* 背景：Esc 原生退出全屏在部分真机环境下不触发（如远程键入路径吞掉按键），
* 此处做页面级兜底：只要当前处于全屏，就主动调 exitFullscreen()。
* 未在全屏时返回 false、无任何副作用；原生已退出时 guard 使其成为空操作。 */
function exitFullscreenExplicit() {
  if (typeof document === "undefined") return false;
  if (!document.fullscreenElement) return false;
  try {
    var p = document.exitFullscreen();
    if (p && typeof p.catch === "function") p.catch(function () {});
  } catch (e) { /* 忽略 */ }
  return true;
}

function refreshStats() {
  $("tp-stats").textContent = scriptStats(state.text).label;
}

function syncControlsFromState() {
  $("tp-text").value = state.text;
  $("tp-fontsize").value = state.fontSize;
  $("tp-fontsize-label").textContent = state.fontSize + "px";
  $("tp-lineheight").value = state.lineHeight;
  $("tp-lineheight-label").textContent = Number(state.lineHeight).toFixed(1);
  $("tp-mirror").checked = state.mirror;
  $("tp-showprogress").checked = state.showProgress;
  $("tp-progress").style.display = state.showProgress ? "block" : "none";
  setSpeed(state.speed, true);
  refreshStats();
}

var saveT = 0;
function saveSoon() {
  clearTimeout(saveT);
  saveT = setTimeout(saveState, 500);
}

function init() {
  var had = loadState();
  if (!had) state.text = SAMPLE_TEXT;

  syncControlsFromState();
  renderContent(false);

  /* —— 编辑区事件 —— */
  $("tp-text").addEventListener("input", function (e) {
    state.text = e.target.value;
    refreshStats();
    renderContent(true);
    saveSoon();
  });
  $("tp-fontsize").addEventListener("input", function (e) {
    state.fontSize = clampNum(e.target.value, 56, 24, 120);
    $("tp-fontsize-label").textContent = state.fontSize + "px";
    renderContent(true);
    saveSoon();
  });
  $("tp-lineheight").addEventListener("input", function (e) {
    state.lineHeight = clampNum(e.target.value, 1.8, 1.2, 2.5);
    $("tp-lineheight-label").textContent = Number(state.lineHeight).toFixed(1);
    renderContent(true);
    saveSoon();
  });
  $("tp-speed").addEventListener("input", function (e) {
    setSpeed(e.target.value);
  });
  $("tp-mirror").addEventListener("change", function (e) {
    state.mirror = e.target.checked;
    $("tp-content").style.transform = mirrorTransform(state.mirror);
    saveSoon();
  });
  $("tp-showprogress").addEventListener("change", function (e) {
    state.showProgress = e.target.checked;
    $("tp-progress").style.display = state.showProgress ? "block" : "none";
    saveSoon();
  });
  $("tp-sample").addEventListener("click", function () {
    state.text = SAMPLE_TEXT;
    $("tp-text").value = SAMPLE_TEXT;
    refreshStats();
    renderContent(false);
    saveState();
    toast("已载入示例演讲稿（" + SAMPLE_LINES.length + " 行）");
  });
  $("tp-clear").addEventListener("click", function () {
    state.text = "";
    $("tp-text").value = "";
    setPlaying(false);
    refreshStats();
    renderContent(false);
    saveState();
  });

  /* —— 播放区事件 —— */
  $("tp-play").addEventListener("click", function () { setPlaying(!state.playing); });
  $("tp-restart").addEventListener("click", function () {
    setPlaying(false);
    seekToFraction(0);
  });
  $("tp-slower").addEventListener("click", function () { setSpeed(adjustSpeed(state.speed, -0.5)); });
  $("tp-faster").addEventListener("click", function () { setSpeed(adjustSpeed(state.speed, 0.5)); });
  $("tp-fullscreen").addEventListener("click", toggleFullscreen);
  document.addEventListener("fullscreenchange", function () {
    var on = !!document.fullscreenElement;
    $("tp-fullscreen").innerHTML = on
      ? '<i class="material-icons">fullscreen_exit</i> 退出全屏'
      : '<i class="material-icons">fullscreen</i> 全屏';
    setTimeout(function () { renderContent(true); }, 60);
  });

  /* 进度条点击跳转 */
  $("tp-progress").addEventListener("click", function (e) {
    var r = e.currentTarget.getBoundingClientRect();
    if (r.width <= 0) return;
    seekToFraction((e.clientX - r.left) / r.width);
  });

  /* 视口手动滚动时同步内部 scrollPx（避免续播跳变） */
  $("tp-viewport").addEventListener("scroll", function () {
    state.scrollPx = $("tp-viewport").scrollTop;
    updateProgress();
    updateLineHighlight(false);
  });

  /* 快捷键：输入框内不拦截，保证正常打字 */
  document.addEventListener("keydown", function (e) {
    var tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    var act = keyAction(e.key);
    if (!act) return;
    e.preventDefault();
    if (act === "toggle") setPlaying(!state.playing);
    else if (act === "faster") setSpeed(adjustSpeed(state.speed, 0.5));
    else if (act === "slower") setSpeed(adjustSpeed(state.speed, -0.5));
    else if (act === "fullscreen") toggleFullscreen();
    else if (act === "exitfs") exitFullscreenExplicit();
  });

  /* 点击按钮后失焦，避免空格键重复触发按钮 */
  var btns = document.querySelectorAll("#tp-player-wrap button, .tp-panel button");
  for (var i = 0; i < btns.length; i++) {
    btns[i].addEventListener("click", function () { this.blur(); });
  }

  window.addEventListener("resize", function () { renderContent(true); });

  saveState();
}

if (hasDOM()) {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    LS_KEY: LS_KEY, READ_CPM: READ_CPM, BASE_PX_PER_SEC: BASE_PX_PER_SEC, MARKER_FRAC: MARKER_FRAC,
    clampNum: clampNum, esc: esc, defaultSettings: defaultSettings,
    parseScript: parseScript, countChars: countChars,
    estimateSeconds: estimateSeconds, formatDur: formatDur, scriptStats: scriptStats,
    clampSpeed: clampSpeed, adjustSpeed: adjustSpeed, pxPerSecond: pxPerSecond,
    progressFromScroll: progressFromScroll, scrollTopFromProgress: scrollTopFromProgress,
    findCurrentLine: findCurrentLine,
    keyAction: keyAction, mirrorTransform: mirrorTransform,
    exitFullscreenExplicit: exitFullscreenExplicit,
    SAMPLE_LINES: SAMPLE_LINES, SAMPLE_TEXT: SAMPLE_TEXT
  };
}
})();
