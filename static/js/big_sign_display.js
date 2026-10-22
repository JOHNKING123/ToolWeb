/* 大字标牌展示器（big_sign_display）：全屏超大字体多屏标牌 / 高对比主题 / 镜像翻转 / localStorage 暂存
*
* 功能：
*  1) 编辑模式：多行文本框输入展示文案，单独一行的 --- 为分页符切多屏；
*     每屏字数统计，示例文案一键载入，一键清空。
*  2) 展示模式：全屏超大字体，字号随单屏字符数自适应（面积法估算字号＋DOM 实测兜底收敛，
*     短文本巨字、长文自动缩小，保证无溢出）。
*  3) 三套高对比主题：黑底白字 / 白底黑字 / 黄底黑字。
*  4) 镜像翻转开关（scaleX(-1)）：店面玻璃由内向外展示时使用。
*  5) 上一页 / 下一页：按钮＋点击展示区＋←/→/空格/PageUp/PageDown/Home/End 快捷键。
*  6) F 键全屏（展示区独占屏幕），Esc 退出全屏 / 返回编辑模式。
*  7) 编辑 / 展示双模式切换；文案＋主题＋镜像＋当前页自动暂存 localStorage。
* 纯函数全部经 module.exports 暴露，node tests/big_sign_display.test.js 自测；
* 浏览器内 init 挂 DOMContentLoaded；无网络请求（零上传）。
*/
(function () {
"use strict";

/* ---------- 1. 基础 ---------- */
var LS_KEY = "tw_big_sign_display_v1";
var FILL = 0.72;       /* 展示区面积利用率（四周留边） */
var LINE_H = 1.28;     /* 展示行高 */
var MIN_FS = 20;       /* 最小字号 px */
var MAX_FS_ABS = 640;  /* 绝对字号上限 px */
var WIDE_FROM = 0x2E80;/* CJK/全角字符起点：按 1em 计宽 */
var NARROW_W = 0.55;   /* 拉丁/数字/半角符号按 0.55em 计宽 */

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

function hasDOM() {
  return typeof document !== "undefined" && typeof window !== "undefined";
}

/* ---------- 2. 文案解析：--- 分页符 ---------- */
var PAGE_BREAK_RE = /^\s*-{3,}\s*$/;

function countChars(text) {
  return String(text == null ? "" : text).replace(/\s/g, "").length;
}

/* effWidthUnits：有效排版宽度单位。CJK/全角计 1，拉丁/数字/半角计 0.55，空白不计。 */
function effWidthUnits(text) {
  var s = String(text == null ? "" : text).replace(/\s/g, "");
  var units = 0;
  for (var i = 0; i < s.length; i++) {
    units += (s.charCodeAt(i) >= WIDE_FROM) ? 1 : NARROW_W;
  }
  return units;
}

/* splitPages：按单独一行的 ---（3 个及以上连字符）切分多屏；
* 跳过全空屏，去除每屏首尾空行；返回 [{i, text, chars, eff}] */
function splitPages(text) {
  var lines = String(text == null ? "" : text).split(/\r?\n/);
  var pages = [], cur = [];
  function flush() {
    while (cur.length && !cur[0].trim()) cur.shift();
    while (cur.length && !cur[cur.length - 1].trim()) cur.pop();
    if (cur.length) {
      var t = cur.join("\n");
      var compact = t.replace(/\s/g, "");
      pages.push({i: pages.length, text: t, chars: compact.length, eff: effWidthUnits(compact)});
    }
    cur = [];
  }
  for (var k = 0; k < lines.length; k++) {
    if (PAGE_BREAK_RE.test(lines[k])) flush();
    else cur.push(lines[k]);
  }
  flush();
  return pages;
}

/* pageStats：编辑区统计文案 —— {pages, chars, perPage:[每屏字数]} */
function pageStats(text) {
  var pages = splitPages(text), chars = 0, perPage = [];
  for (var k = 0; k < pages.length; k++) {
    chars += pages[k].chars;
    perPage.push(pages[k].chars);
  }
  return {pages: pages.length, chars: chars, perPage: perPage};
}

/* ---------- 3. 自适应字号 ---------- */
/* fitFontSize：面积法估算。每个排版单位约占 f(宽)×f*LINE_H(高)，
* eff*f^2*LINE_H ≤ vw*vh*FILL  →  f = sqrt(vw*vh*FILL/(eff*LINE_H))，
* 上限取 min(640px, 92% 视口高)，下限 20px。 */
function fitFontSize(eff, vw, vh) {
  if (!(eff > 0) || !(vw > 0) || !(vh > 0)) return MIN_FS;
  var f = Math.sqrt((vw * vh * FILL) / (eff * LINE_H));
  var cap = Math.min(MAX_FS_ABS, vh * 0.92);
  if (f > cap) f = cap;
  if (f < MIN_FS) f = MIN_FS;
  return Math.round(f);
}

/* ---------- 4. 主题 ---------- */
var THEMES = {
  dark:   {bg: "#000000", fg: "#ffffff", label: "黑底白字"},
  light:  {bg: "#ffffff", fg: "#000000", label: "白底黑字"},
  yellow: {bg: "#ffe600", fg: "#000000", label: "黄底黑字"}
};

function validTheme(name) {
  return THEMES.hasOwnProperty(name) ? name : "dark";
}

function themeColors(name) {
  return THEMES[validTheme(name)];
}

/* ---------- 5. 镜像 ---------- */
function mirrorTransform(on) {
  return on ? "scaleX(-1)" : "none";
}

/* ---------- 6. 分页导航 ---------- */
function clampPage(idx, total) {
  total = Math.max(0, Math.floor(total) || 0);
  if (total === 0) return 0;
  idx = Math.floor(idx) || 0;
  if (idx < 0) return 0;
  if (idx > total - 1) return total - 1;
  return idx;
}

function nextPage(idx, total) { return clampPage(idx + 1, total); }
function prevPage(idx, total) { return clampPage(idx - 1, total); }

function pageLabel(idx, total) {
  if (total <= 0) return "暂无内容";
  return "第 " + (clampPage(idx, total) + 1) + " / " + total + " 页";
}

/* ---------- 7. 快捷键（仅展示模式生效，由调用方判断模式） ---------- */
function keyAction(key) {
  if (key === " " || key === "Spacebar" || key === "ArrowRight" || key === "PageDown") return "next";
  if (key === "ArrowLeft" || key === "PageUp") return "prev";
  if (key === "Home") return "first";
  if (key === "End") return "last";
  if (key === "f" || key === "F") return "fullscreen";
  if (key === "Escape") return "toedit";
  return null;
}

/* ---------- 8. 状态 ---------- */
var SAMPLE_TEXT = "欢迎光临\n---\n今日特价\n全场八折\n---\n请排队等候\n谢谢配合";

function defaultState() {
  return {text: SAMPLE_TEXT, theme: "dark", mirror: false, page: 0, mode: "edit"};
}

function loadState() {
  var st = defaultState();
  if (!hasDOM()) return st;
  try {
    var raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return st;
    var o = JSON.parse(raw);
    if (typeof o.text === "string") st.text = o.text;
    if (typeof o.theme === "string") st.theme = validTheme(o.theme);
    st.mirror = !!o.mirror;
    st.page = Math.max(0, Math.floor(o.page) || 0);
  } catch (e) { /* 损坏的暂存直接丢弃 */ }
  return st;
}

function saveState(st) {
  if (!hasDOM()) return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify({
      text: st.text, theme: st.theme, mirror: st.mirror, page: st.page
    }));
  } catch (e) { /* 配额满等情况静默忽略 */ }
}

/* ---------- 9. 浏览器初始化 ---------- */
var state = null;

function $(id) { return document.getElementById(id); }

function pageTextToHTML(t) {
  return esc(t).split("\n").join("<br>");
}

/* ensureFit：DOM 实测兜底 —— 估算字号后若仍溢出，逐级缩小直到收敛（防长文/多行溢出） */
function ensureFit(el, fs) {
  var guard = 0;
  while (guard++ < 40 && fs > MIN_FS &&
      (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)) {
    fs = Math.max(MIN_FS, Math.floor(fs * 0.94));
    el.style.fontSize = fs + "px";
  }
  return fs;
}

function applyTheme() {
  var c = themeColors(state.theme);
  var vp = $("bsd-viewport");
  vp.style.background = c.bg;
  vp.style.color = c.fg;
  var radios = document.querySelectorAll('input[name="bsd-theme"]');
  for (var i = 0; i < radios.length; i++) radios[i].checked = (radios[i].value === state.theme);
}

function renderStats() {
  var s = pageStats(state.text);
  var per = s.perPage.length ? ("（每屏字数：" + s.perPage.join(" / ") + "）") : "";
  $("bsd-stats").textContent = "共 " + s.pages + " 屏 · " + s.chars + " 字" + per;
}

function currentPages() {
  return splitPages(state.text);
}

function renderDisplay() {
  var pages = currentPages();
  state.page = clampPage(state.page, pages.length);
  var vp = $("bsd-viewport"), txt = $("bsd-text");
  txt.style.transform = mirrorTransform(state.mirror);
  if (!pages.length) {
    txt.innerHTML = '<span style="opacity:.45;font-size:4vw">← 返回编辑，输入展示文案</span>';
    txt.style.fontSize = "";
  } else {
    var p = pages[state.page];
    txt.innerHTML = pageTextToHTML(p.text);
    var fs = fitFontSize(p.eff, vp.clientWidth || window.innerWidth, vp.clientHeight || window.innerHeight);
    txt.style.fontSize = fs + "px";
    ensureFit(txt, fs);
  }
  $("bsd-pagelabel").textContent = pageLabel(state.page, pages.length);
  $("bsd-floatlabel").textContent = pageLabel(state.page, pages.length);
  var atFirst = state.page <= 0, atLast = state.page >= pages.length - 1;
  $("bsd-prev").disabled = atFirst || !pages.length;
  $("bsd-next").disabled = atLast || !pages.length;
}

function setMode(mode) {
  state.mode = (mode === "display") ? "display" : "edit";
  $("bsd-editmode").style.display = state.mode === "edit" ? "" : "none";
  $("bsd-displaymode").style.display = state.mode === "display" ? "" : "none";
  if (state.mode === "display") {
    renderDisplay();
    /* 进入展示后把焦点放到展示区，方便键盘翻页 */
    $("bsd-stage-wrap").setAttribute("tabindex", "-1");
    $("bsd-stage-wrap").focus({preventScroll: true});
  }
  saveState(state);
}

function goPage(idx) {
  var total = currentPages().length;
  var np = clampPage(idx, total);
  if (np !== state.page) {
    state.page = np;
    renderDisplay();
    saveState(state);
  }
}

function toggleFullscreen() {
  var w = $("bsd-stage-wrap");
  if (!document.fullscreenElement) {
    if (w.requestFullscreen) w.requestFullscreen();
  } else {
    if (document.exitFullscreen) document.exitFullscreen();
  }
}

function toast(msg) {
  var t = $("bsd-toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(function () { t.classList.remove("show"); }, 2200);
}

function init() {
  state = loadState();

  var ta = $("bsd-input");
  ta.value = state.text;
  $("bsd-mirror").checked = state.mirror;
  renderStats();
  applyTheme();

  ta.addEventListener("input", function () {
    state.text = ta.value;
    state.page = clampPage(state.page, currentPages().length);
    renderStats();
    saveState(state);
  });

  var radios = document.querySelectorAll('input[name="bsd-theme"]');
  for (var i = 0; i < radios.length; i++) {
    radios[i].addEventListener("change", function () {
      state.theme = validTheme(this.value);
      applyTheme();
      saveState(state);
    });
  }

  $("bsd-mirror").addEventListener("change", function () {
    state.mirror = this.checked;
    saveState(state);
    toast(state.mirror ? "镜像翻转已开启（店面玻璃内向展示用）" : "镜像翻转已关闭");
  });

  $("bsd-sample").addEventListener("click", function () {
    state.text = SAMPLE_TEXT;
    ta.value = SAMPLE_TEXT;
    state.page = 0;
    renderStats();
    saveState(state);
    toast("已载入示例文案");
  });

  $("bsd-clear").addEventListener("click", function () {
    state.text = "";
    ta.value = "";
    state.page = 0;
    renderStats();
    saveState(state);
    toast("已清空");
  });

  $("bsd-enter").addEventListener("click", function () { setMode("display"); });
  $("bsd-back").addEventListener("click", function () { setMode("edit"); });
  $("bsd-prev").addEventListener("click", function () { goPage(state.page - 1); });
  $("bsd-next").addEventListener("click", function () { goPage(state.page + 1); });
  $("bsd-fs").addEventListener("click", toggleFullscreen);

  /* 点击展示区翻到下一页（最后一页则回到第一页，方便循环展示） */
  $("bsd-viewport").addEventListener("click", function () {
    var total = currentPages().length;
    if (!total) return;
    goPage(state.page >= total - 1 ? 0 : state.page + 1);
  });

  /* 快捷键：编辑模式下在输入框内不拦截；展示模式下全局生效 */
  document.addEventListener("keydown", function (e) {
    if (state.mode !== "display") {
      /* 编辑模式：仅 F 进入展示＋全屏（输入框内打字时让路） */
      var tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        setMode("display");
        toggleFullscreen();
      }
      return;
    }
    var tag2 = (e.target && e.target.tagName) || "";
    if (tag2 === "INPUT" || tag2 === "TEXTAREA" || tag2 === "SELECT") return;
    var act = keyAction(e.key);
    if (!act) return;
    e.preventDefault();
    var total = currentPages().length;
    if (act === "next") goPage(state.page >= total - 1 ? 0 : state.page + 1);
    else if (act === "prev") goPage(state.page - 1);
    else if (act === "first") goPage(0);
    else if (act === "last") goPage(total - 1);
    else if (act === "fullscreen") toggleFullscreen();
    else if (act === "toedit") {
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen();
      else setMode("edit");
    }
  });

  /* 全屏变化后重算字号；全屏下显示悬浮页码，鼠标静止 3 秒淡出 */
  var fadeTimer = null;
  document.addEventListener("fullscreenchange", function () {
    var on = !!document.fullscreenElement;
    $("bsd-stage-wrap").classList.toggle("is-fullscreen", on);
    if (state.mode === "display") renderDisplay();
  });
  $("bsd-stage-wrap").addEventListener("mousemove", function () {
    var fl = $("bsd-floatlabel");
    fl.classList.add("show");
    clearTimeout(fadeTimer);
    fadeTimer = setTimeout(function () { fl.classList.remove("show"); }, 3000);
  });

  /* 点击按钮后失焦，避免空格键重复触发按钮 */
  var btns = document.querySelectorAll("#bsd-stage-wrap button, .bsd-panel button");
  for (var j = 0; j < btns.length; j++) {
    btns[j].addEventListener("click", function () { this.blur(); });
  }

  window.addEventListener("resize", function () {
    if (state.mode === "display") renderDisplay();
  });

  setMode("edit");
}

if (hasDOM()) {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    LS_KEY: LS_KEY, FILL: FILL, LINE_H: LINE_H, MIN_FS: MIN_FS, MAX_FS_ABS: MAX_FS_ABS,
    clampNum: clampNum, esc: esc,
    countChars: countChars, effWidthUnits: effWidthUnits,
    splitPages: splitPages, pageStats: pageStats,
    fitFontSize: fitFontSize,
    THEMES: THEMES, validTheme: validTheme, themeColors: themeColors,
    mirrorTransform: mirrorTransform,
    clampPage: clampPage, nextPage: nextPage, prevPage: prevPage, pageLabel: pageLabel,
    keyAction: keyAction,
    defaultState: defaultState, SAMPLE_TEXT: SAMPLE_TEXT
  };
}
})();
