/* 在线倒计时/番茄钟（countdown_timer）：倒计时 / 秒表 / 番茄钟 / 闹钟四模式单页计时器
*
* 功能：
*  1) 倒计时：时/分/秒输入＋快捷预设（1/5/10/15/25/30/45/60 分钟），Date.now() 锚点
*     抗 setInterval 漂移；暂停/继续/复位；归零 WebAudio 本地合成音效＋标题栏闪烁。
*  2) 秒表：开始/暂停/复位/计次（lap），圈速表＋最快/最慢圈标色。
*  3) 番茄钟：专注/短休息/长休息分钟数可调，四轮后长休息自动轮转，轮次计数＋
*     今日完成番茄数持久化（localStorage），轮转 toast＋声音提示。
*  4) 闹钟：HH:MM 设定＋每日/工作日/仅一次重复，准点响铃＋标题栏提醒。
*  5) F 键 / 按钮全屏大字数字显示（ESC 退出）；浏览器标题栏实时显示剩余时间；
*     localStorage 命名预设（倒计时/番茄钟参数两类，各存 5 组）；WebAudio 本地
*     合成结束音效（蜂鸣/铃铛/风铃三档＋静音），零音频文件。
* 纯函数全部经 module.exports 暴露，node tests/countdown_timer.test.js 自测；
* 浏览器内 init 挂 DOMContentLoaded；无网络请求（零 fetch/XHR）。
*/
(function () {
"use strict";

/* ---------- 1. 常量 ---------- */
var LS_PRESETS = "tw_countdown_timer_presets_v1";
var LS_POMO = "tw_countdown_timer_pomo_v1";
var LS_ALARM = "tw_countdown_timer_alarm_v1";
var LS_SOUND = "tw_countdown_timer_sound_v1";
var MAX_PRESETS_PER_TYPE = 5;
var BASE_TITLE = "在线倒计时/番茄钟 | 程序员工具箱";

/* ---------- 2. 基础工具 ---------- */
function hasDOM() {
  return typeof document !== "undefined" && typeof window !== "undefined";
}
function pad2(n) {
  n = Math.floor(n);
  return (n < 10 ? "0" : "") + n;
}
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
/* 当日键：2026-10-23 */
function todayKey(d) {
  d = d || new Date();
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}

/* ---------- 3. 时间格式化 ---------- */
/* fmtHMS：65 -> "01:05"；3661 -> "1:01:01"；0 -> "00:00"；负数钳 0 */
function fmtHMS(totalSec) {
  var s = Math.max(0, Math.floor(totalSec));
  var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return h + ":" + pad2(m) + ":" + pad2(sec);
  return pad2(m) + ":" + pad2(sec);
}
/* fmtStopwatch：毫秒 -> "05:03.27"（分:秒.百分秒） */
function fmtStopwatch(ms) {
  ms = Math.max(0, Math.floor(ms));
  var m = Math.floor(ms / 60000);
  var s = Math.floor((ms % 60000) / 1000);
  var c = Math.floor((ms % 1000) / 10);
  return pad2(m) + ":" + pad2(s) + "." + pad2(c);
}
/* 倒计时输入 → 总秒数（小时/分/秒各自钳制） */
function parseCountdownInput(h, m, s) {
  h = clampNum(h, 0, 0, 99); m = clampNum(m, 0, 0, 59); s = clampNum(s, 0, 0, 59);
  return Math.floor(h) * 3600 + Math.floor(m) * 60 + Math.floor(s);
}
/* countdownRemainingMs：锚点法剩余毫秒；nowMs 可注入便于测试 */
function countdownRemainingMs(endAnchorMs, nowMs) {
  nowMs = (nowMs == null) ? Date.now() : nowMs;
  return Math.max(0, endAnchorMs - nowMs);
}

/* ---------- 4. 番茄钟状态机 ---------- */
/* mode: focus | short | long；cyclesCompleted = 已完成专注轮数
 * next：focus 完成 -> cyclesCompleted+1，若 % cyclesBeforeLong == 0 进 long 否则 short；
 * short/long 完成 -> focus（轮数不变）。 */
function pomoNext(mode, cyclesCompleted, cyclesBeforeLong) {
  cyclesBeforeLong = Math.max(1, Math.floor(cyclesBeforeLong || 4));
  cyclesCompleted = Math.max(0, Math.floor(cyclesCompleted || 0));
  if (mode === "focus") {
    var done = cyclesCompleted + 1;
    var next = (done % cyclesBeforeLong === 0) ? "long" : "short";
    return { mode: next, cyclesCompleted: done };
  }
  if (mode === "short" || mode === "long") {
    return { mode: "focus", cyclesCompleted: cyclesCompleted };
  }
  return { mode: "focus", cyclesCompleted: cyclesCompleted };
}
function pomoPhaseLabel(mode) {
  if (mode === "focus") return "专注";
  if (mode === "short") return "短休息";
  if (mode === "long") return "长休息";
  return "未知";
}
function pomoModeDurationSec(mode, focusMin, shortMin, longMin) {
  focusMin = clampNum(focusMin, 25, 1, 180); shortMin = clampNum(shortMin, 5, 1, 120);
  longMin = clampNum(longMin, 15, 1, 120);
  if (mode === "focus") return Math.round(focusMin * 60);
  if (mode === "short") return Math.round(shortMin * 60);
  return Math.round(longMin * 60);
}

/* ---------- 5. 闹钟 ---------- */
/* alarmNextTs(hour, min, repeat, nowMs)：返回下一个触发时间戳（毫秒）
 * repeat: daily | weekdays | once。nowMs 可注入便于测试。
 * once 为“仅一次”：只看今天，今天时间已过 → 返回 null。 */
function alarmNextTs(hour, min, repeat, nowMs) {
  hour = clampNum(hour, 0, 0, 23); min = clampNum(min, 0, 0, 59);
  nowMs = (nowMs == null) ? Date.now() : nowMs;
  var now = new Date(nowMs);
  if (repeat === "once") {
    /* “仅一次”只针对今天：今天时间未到 → 今天触发；已过 → 返回 null 不再排期 */
    var t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate(),
      hour, min, 0, 0).getTime();
    return t0 > nowMs ? t0 : null;
  }
  var dayOffset = 0;
  if (repeat === "weekdays") {
    /* 找下一个工作日（含今天） */
    for (dayOffset = 0; dayOffset < 8; dayOffset++) {
      var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset,
        hour, min, 0, 0);
      var wd = d.getDay();
      if (wd === 0 || wd === 6) continue;
      if (d.getTime() > nowMs) return d.getTime();
      if (dayOffset === 0) continue; /* 今天时间已过 → 继续找 */
    }
    return null;
  }
  for (dayOffset = 0; dayOffset < 366; dayOffset++) {
    var t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset,
      hour, min, 0, 0).getTime();
    if (t > nowMs) return t;
  }
  return null;
}

/* ---------- 6. 秒表圈速 ---------- */
/* laps：毫秒数组；返回 {fastestIdx, slowestIdx}；不足 2 圈则均为 -1 */
function lapStats(laps) {
  laps = laps || [];
  if (laps.length < 2) return { fastestIdx: -1, slowestIdx: -1 };
  var f = 0, s = 0;
  for (var i = 1; i < laps.length; i++) {
    if (laps[i] < laps[f]) f = i;
    if (laps[i] > laps[s]) s = i;
  }
  if (f === s) return { fastestIdx: f, slowestIdx: -1 }; /* 全相等 → 只标最快 */
  return { fastestIdx: f, slowestIdx: s };
}

/* ---------- 7. 命名预设 ---------- */
/* item: {id, name, type: "countdown"|"pomodoro", params}；同类上限 5 组；
 * 名称重复时直接覆盖（更新），超限返回 {ok:false, reason} */
var _presetSeq = 0;
function savePreset(list, item) {
  list = list || [];
  var type = item.type;
  var sameType = list.filter(function (p) { return p.type === type; });
  var exists = list.filter(function (p) { return p.type === type && p.name === item.name; });
  if (!exists.length && sameType.length >= MAX_PRESETS_PER_TYPE) {
    return { ok: false, reason: "over_limit" };
  }
  var out = list.filter(function (p) { return !(p.type === type && p.name === item.name); });
  out.push({ id: item.id || ("p" + Date.now() + "_" + (++_presetSeq)), name: item.name, type: type,
    params: item.params || {}, createdAt: Date.now() });
  return { ok: true, list: out };
}
function deletePreset(list, id) {
  list = list || [];
  return list.filter(function (p) { return p.id !== id; });
}
function presetsByType(list, type) {
  list = list || [];
  return list.filter(function (p) { return p.type === type; });
}
/* 序列化 / 反序列化（localStorage 存取） */
function serializePresets(list) {
  try { return JSON.stringify(list || []); } catch (e) { return "[]"; }
}
function parsePresets(raw) {
  try {
    var v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.filter(function (p) {
      return p && typeof p.name === "string" && (p.type === "countdown" || p.type === "pomodoro");
    });
  } catch (e) { return []; }
}

/* ---------- 8. 标题栏文案 ---------- */
function titleFor(label, timeStr) {
  return "⏱ " + label + " " + timeStr + " | 程序员工具箱";
}
function blinkTitles(label, timeStr) {
  return [titleFor(label, timeStr), "🔔 " + label + " 时间到！ | 程序员工具箱"];
}

/* ---------- 9. 音效序列（WebAudio 本地合成参数，零音频文件） ---------- */
/* 返回 [{freq, dur, gap}]，dur 秒，gap 为下一音前的间隔秒 */
function beepPattern(kind) {
  if (kind === "bell") {
    return [{ freq: 880, dur: 0.35, gap: 0.12 }, { freq: 880, dur: 0.35, gap: 0.12 },
      { freq: 880, dur: 0.6, gap: 0 }];
  }
  if (kind === "chime") {
    return [{ freq: 523, dur: 0.25, gap: 0.06 }, { freq: 659, dur: 0.25, gap: 0.06 },
      { freq: 784, dur: 0.25, gap: 0.06 }, { freq: 1046, dur: 0.55, gap: 0 }];
  }
  /* beep 默认 */
  return [{ freq: 1000, dur: 0.22, gap: 0.10 }, { freq: 1000, dur: 0.22, gap: 0.10 },
    { freq: 1000, dur: 0.22, gap: 0.10 }, { freq: 1000, dur: 0.45, gap: 0 }];
}

/* ---------- 10. node 自测导出 ---------- */
var api = {
  pad2: pad2, clampNum: clampNum, esc: esc, todayKey: todayKey,
  fmtHMS: fmtHMS, fmtStopwatch: fmtStopwatch,
  parseCountdownInput: parseCountdownInput,
  countdownRemainingMs: countdownRemainingMs,
  pomoNext: pomoNext, pomoPhaseLabel: pomoPhaseLabel,
  pomoModeDurationSec: pomoModeDurationSec,
  alarmNextTs: alarmNextTs, lapStats: lapStats,
  savePreset: savePreset, deletePreset: deletePreset, presetsByType: presetsByType,
  serializePresets: serializePresets, parsePresets: parsePresets,
  titleFor: titleFor, blinkTitles: blinkTitles, beepPattern: beepPattern,
  LS_PRESETS: LS_PRESETS, LS_POMO: LS_POMO, LS_ALARM: LS_ALARM, LS_SOUND: LS_SOUND,
  MAX_PRESETS_PER_TYPE: MAX_PRESETS_PER_TYPE, BASE_TITLE: BASE_TITLE
};
if (typeof module !== "undefined" && module.exports) module.exports = api;

/* ---------- 11. 浏览器交互 ---------- */
if (!hasDOM()) return;

/* ---- 11.1 WebAudio 音效 ---- */
var audioCtx = null;
function getAudioCtx() {
  if (audioCtx) return audioCtx;
  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  audioCtx = new AC();
  return audioCtx;
}
function playPattern(kind) {
  if (soundSetting === "mute") return;
  var ctx = getAudioCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") { try { ctx.resume(); } catch (e) {} }
  var t0 = ctx.currentTime + 0.02;
  beepPattern(kind || soundSetting || "beep").forEach(function (p) {
    var osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = "sine"; osc.frequency.value = p.freq;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.5, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + p.dur);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(t0); osc.stop(t0 + p.dur + 0.05);
    t0 += p.dur + p.gap;
  });
}

/* ---- 11.2 通用小组件 ---- */
function $(id) { return document.getElementById(id); }
function showToast(msg, ms) {
  var t = $("ct-toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(function () { t.classList.remove("show"); }, ms || 2600);
}
function setDocTitle(s) { document.title = s; }
function restoreDocTitle() { setDocTitle(BASE_TITLE); }

/* ---- 11.3 全屏 ---- */
function toggleFullscreen() {
  var wrap = $("ct-stage-wrap");
  if (!wrap) return;
  if (document.fullscreenElement) { document.exitFullscreen(); }
  else if (wrap.requestFullscreen) { wrap.requestFullscreen(); }
}
function syncFullscreenClass() {
  var wrap = $("ct-stage-wrap");
  if (wrap) wrap.classList.toggle("is-fullscreen", !!document.fullscreenElement);
}

/* ---- 11.4 倒计时 ---- */
var cd = { state: "idle", durationMs: 0, endAnchorMs: 0, remainingMs: 0, timer: null, blinkTimer: null };
function cdRender() {
  var rem = cd.state === "running" ? countdownRemainingMs(cd.endAnchorMs) : cd.remainingMs;
  if (cd.state === "idle") rem = cd.durationMs;
  var txt = fmtHMS(Math.ceil(rem / 1000));
  $("ct-cd-display").textContent = txt;
  $("ct-cd-status").textContent =
    cd.state === "running" ? "运行中…" : (cd.state === "paused" ? "已暂停" : "就绪");
  $("ct-cd-start").disabled = (cd.state === "running");
  $("ct-cd-pause").disabled = (cd.state !== "running");
  $("ct-cd-reset").disabled = (cd.state === "idle");
  if (cd.state === "running") setDocTitle(titleFor("倒计时", txt));
  else if (cd.state !== "done") restoreDocTitle();
}
function cdTick() {
  var rem = countdownRemainingMs(cd.endAnchorMs);
  cd.remainingMs = rem;
  if (rem <= 0) {
    cdStopTimer();
    cd.state = "done";
    $("ct-cd-display").textContent = "00:00";
    playPattern();
    blinkTitle("倒计时");
    showToast("⏰ 倒计时结束！");
    cdRenderButtonsDone();
    return;
  }
  cdRender();
}
function cdStopTimer() { if (cd.timer) { clearInterval(cd.timer); cd.timer = null; } }
function cdRenderButtonsDone() {
  $("ct-cd-start").disabled = true;
  $("ct-cd-pause").disabled = true;
  $("ct-cd-reset").disabled = false;
}
function cdStart() {
  stopBlink();
  var totalSec = parseCountdownInput($("ct-cd-h").value, $("ct-cd-m").value, $("ct-cd-s").value);
  if (cd.state === "paused") {
    /* 继续：保留剩余 */
  } else {
    if (totalSec <= 0) { showToast("请先设置大于 0 的倒计时时长"); return; }
    cd.durationMs = totalSec * 1000;
    cd.remainingMs = cd.durationMs;
  }
  cd.endAnchorMs = Date.now() + cd.remainingMs;
  cd.state = "running";
  cdStopTimer();
  cd.timer = setInterval(cdTick, 200);
  cdRender();
}
function cdPause() {
  if (cd.state !== "running") return;
  cd.remainingMs = countdownRemainingMs(cd.endAnchorMs);
  cdStopTimer();
  cd.state = "paused";
  cdRender();
  restoreDocTitle();
}
function cdReset() {
  stopBlink();
  cdStopTimer();
  cd.state = "idle";
  cd.remainingMs = 0;
  cd.durationMs = 0;
  cdRender();
  restoreDocTitle();
}
function cdQuick(min) {
  cdReset();
  $("ct-cd-h").value = 0;
  $("ct-cd-m").value = min;
  $("ct-cd-s").value = 0;
  cdStart();
}

/* ---- 11.5 秒表 ---- */
var sw = { state: "idle", baseMs: 0, startAnchorMs: 0, timer: null, laps: [], lapAnchorMs: 0 };
function swElapsed() {
  if (sw.state === "running") return sw.baseMs + (Date.now() - sw.startAnchorMs);
  return sw.baseMs;
}
function swRender() {
  $("ct-sw-display").textContent = fmtStopwatch(swElapsed());
  $("ct-sw-start").disabled = (sw.state === "running");
  $("ct-sw-pause").disabled = (sw.state !== "running");
  $("ct-sw-lap").disabled = (sw.state !== "running");
  $("ct-sw-reset").disabled = (sw.state === "idle" && sw.laps.length === 0 && sw.baseMs === 0);
  if (sw.state === "running") setDocTitle(titleFor("秒表", fmtStopwatch(swElapsed())));
  else restoreDocTitle();
  swRenderLaps();
}
function swRenderLaps() {
  var box = $("ct-sw-laps");
  var st = lapStats(sw.laps);
  if (!sw.laps.length) { box.innerHTML = "<div class=\"ct-emptylap\">暂无计次，点击「计次」记录圈速</div>"; return; }
  var html = "<table class=\"ct-laptable\"><thead><tr><th>圈次</th><th>圈速</th><th>累计</th></tr></thead><tbody>";
  var acc = 0;
  for (var i = 0; i < sw.laps.length; i++) {
    acc += sw.laps[i];
    var cls = "";
    if (i === st.fastestIdx) cls = "fast";
    else if (i === st.slowestIdx) cls = "slow";
    html += "<tr class=\"" + cls + "\"><td>第 " + (i + 1) + " 圈" +
      (i === st.fastestIdx ? " 🏆" : "") + (i === st.slowestIdx ? " 🐢" : "") + "</td>" +
      "<td>" + fmtStopwatch(sw.laps[i]) + "</td><td>" + fmtStopwatch(acc) + "</td></tr>";
  }
  box.innerHTML = html + "</tbody></table>";
}
function swTick() { swRender(); }
function swStart() {
  sw.startAnchorMs = Date.now();
  sw.lapAnchorMs = Date.now();
  sw.state = "running";
  if (sw.timer) clearInterval(sw.timer);
  sw.timer = setInterval(swTick, 47);
  swRender();
}
function swPause() {
  if (sw.state !== "running") return;
  sw.baseMs += Date.now() - sw.startAnchorMs;
  clearInterval(sw.timer); sw.timer = null;
  sw.state = "paused";
  swRender();
}
function swLap() {
  if (sw.state !== "running") return;
  var now = Date.now();
  var lap = now - sw.lapAnchorMs;
  sw.lapAnchorMs = now;
  sw.laps.push(lap);
  swRenderLaps();
}
function swReset() {
  if (sw.timer) { clearInterval(sw.timer); sw.timer = null; }
  sw.state = "idle"; sw.baseMs = 0; sw.laps = [];
  swRender();
  restoreDocTitle();
}

/* ---- 11.6 番茄钟 ---- */
var pomo = {
  mode: "focus", cyclesCompleted: 0, cyclesBeforeLong: 4,
  focusMin: 25, shortMin: 5, longMin: 15,
  state: "idle", endAnchorMs: 0, remainingMs: 0, timer: null,
  todayDone: 0, todayDate: ""
};
function pomoLoadDaily() {
  var raw = null;
  try { raw = localStorage.getItem(LS_POMO); } catch (e) {}
  var today = todayKey();
  if (raw) {
    try {
      var v = JSON.parse(raw);
      if (v && v.date === today) { pomo.todayDone = v.done || 0; }
    } catch (e) {}
  }
  pomo.todayDate = today;
}
function pomoSaveDaily() {
  try {
    localStorage.setItem(LS_POMO, JSON.stringify({ date: todayKey(), done: pomo.todayDone }));
  } catch (e) {}
}
function pomoDurationMs() {
  return pomoModeDurationSec(pomo.mode, pomo.focusMin, pomo.shortMin, pomo.longMin) * 1000;
}
function pomoRender() {
  var rem = pomo.state === "running" ? countdownRemainingMs(pomo.endAnchorMs) : pomo.remainingMs;
  if (pomo.state === "idle") rem = pomoDurationMs();
  var txt = fmtHMS(Math.ceil(rem / 1000));
  $("ct-pomo-display").textContent = txt;
  $("ct-pomo-phase").textContent = pomoPhaseLabel(pomo.mode);
  $("ct-pomo-phase").className = "ct-phase ct-phase-" + pomo.mode;
  $("ct-pomo-cycles").textContent = "已完成专注轮：" + pomo.cyclesCompleted +
    " / 今日番茄：" + pomo.todayDone + " 🍅";
  $("ct-pomo-start").disabled = (pomo.state === "running");
  $("ct-pomo-pause").disabled = (pomo.state !== "running");
  $("ct-pomo-skip").disabled = (pomo.state === "idle");
  $("ct-pomo-reset").disabled = (pomo.state === "idle");
  if (pomo.state === "running") setDocTitle(titleFor("番茄·" + pomoPhaseLabel(pomo.mode), txt));
  else if (pomo.state !== "done") restoreDocTitle();
}
function pomoStopTimer() { if (pomo.timer) { clearInterval(pomo.timer); pomo.timer = null; } }
function pomoReadParams() {
  pomo.focusMin = clampNum($("ct-pomo-focus").value, 25, 1, 180);
  pomo.shortMin = clampNum($("ct-pomo-short").value, 5, 1, 120);
  pomo.longMin = clampNum($("ct-pomo-long").value, 15, 1, 120);
  pomo.cyclesBeforeLong = Math.max(1, Math.floor(clampNum($("ct-pomo-rounds").value, 4, 1, 12)));
}
function pomoStart() {
  stopBlink();
  pomoReadParams();
  if (pomo.state === "paused") { /* 保留剩余继续 */ }
  else pomo.remainingMs = pomoDurationMs();
  pomo.endAnchorMs = Date.now() + pomo.remainingMs;
  pomo.state = "running";
  pomoStopTimer();
  pomo.timer = setInterval(pomoTick, 200);
  pomoRender();
}
function pomoPause() {
  if (pomo.state !== "running") return;
  pomo.remainingMs = countdownRemainingMs(pomo.endAnchorMs);
  pomoStopTimer();
  pomo.state = "paused";
  pomoRender();
  restoreDocTitle();
}
function pomoTick() {
  var rem = countdownRemainingMs(pomo.endAnchorMs);
  pomo.remainingMs = rem;
  if (rem <= 0) { pomoPhaseDone(); return; }
  pomoRender();
}
/* completed：true=自然完成（统计/轮次照常），false=跳过（不计入今日番茄） */
function pomoPhaseDone(completed) {
  completed = (completed !== false);
  pomoStopTimer();
  var finished = pomo.mode;
  var nx = pomoNext(pomo.mode, pomo.cyclesCompleted, pomo.cyclesBeforeLong);
  pomo.mode = nx.mode;
  pomo.cyclesCompleted = nx.cyclesCompleted;
  if (completed && finished === "focus") {
    pomo.todayDone++;
    pomoSaveDaily();
  }
  playPattern();
  pomo.state = "idle";
  pomo.remainingMs = pomoDurationMs();
  pomoRender();
  restoreDocTitle();
  var msg = !completed ? "已跳过本阶段"
    : finished === "focus" ? "🍅 专注完成，休息一下！"
    : "✅ 休息结束，开始下一个专注吧！";
  showToast(msg);
  /* 阶段完成后自动开始下一阶段（默认开启，可取消勾选） */
  var autoBox = $("ct-pomo-auto");
  if (autoBox && autoBox.checked) pomoStart();
}
function pomoSkip() {
  if (pomo.state === "idle") return;
  pomoStopTimer();
  pomoPhaseDone(false);
}
function pomoReset() {
  stopBlink();
  pomoStopTimer();
  pomo.state = "idle";
  pomo.mode = "focus";
  pomo.cyclesCompleted = 0;
  pomo.remainingMs = 0;
  pomoRender();
  restoreDocTitle();
}

/* ---- 11.7 闹钟 ---- */
var alarm = { enabled: false, hour: 7, min: 0, repeat: "daily", nextTs: null, timer: null, ringing: false };
function alarmLoad() {
  var raw = null;
  try { raw = localStorage.getItem(LS_ALARM); } catch (e) {}
  if (raw) {
    try {
      var v = JSON.parse(raw);
      if (v && typeof v.hour === "number") {
        alarm.hour = v.hour; alarm.min = v.min; alarm.repeat = v.repeat || "daily";
        alarm.enabled = !!v.enabled;
      }
    } catch (e) {}
  }
}
function alarmSave() {
  try {
    localStorage.setItem(LS_ALARM, JSON.stringify({
      hour: alarm.hour, min: alarm.min, repeat: alarm.repeat, enabled: alarm.enabled
    }));
  } catch (e) {}
}
function alarmRender() {
  $("ct-al-hour").value = pad2(alarm.hour);
  $("ct-al-min").value = pad2(alarm.min);
  $("ct-al-repeat").value = alarm.repeat;
  $("ct-al-toggle").checked = alarm.enabled;
  var info = $("ct-al-info");
  var big = $("ct-al-display");
  if (alarm.enabled && alarm.nextTs) {
    var d = new Date(alarm.nextTs);
    info.textContent = "下一次响铃：" + (d.getMonth() + 1) + "月" + d.getDate() + "日 " +
      pad2(d.getHours()) + ":" + pad2(d.getMinutes());
    if (big) big.textContent = pad2(alarm.hour) + ":" + pad2(alarm.min);
  } else {
    info.textContent = "闹钟未启用";
    if (big) big.textContent = "--:--";
  }
}
function alarmReschedule() {
  if (!alarm.enabled) { alarm.nextTs = null; return; }
  alarm.nextTs = alarmNextTs(alarm.hour, alarm.min, alarm.repeat, Date.now());
  if (alarm.nextTs === null && alarm.repeat === "once") {
    showToast("设定时间已过，请选择未来的时间");
  }
}
function alarmCheck() {
  if (!alarm.enabled || alarm.ringing || !alarm.nextTs) return;
  var now = Date.now();
  if (now >= alarm.nextTs) alarmRing();
  else setDocTitle(titleFor("闹钟", fmtHMS(Math.ceil((alarm.nextTs - now) / 1000))));
}
function alarmRing() {
  alarm.ringing = true;
  playPattern();
  blinkTitle("闹钟");
  var rt = $("ct-al-ringtime");
  if (rt) rt.textContent = "设定时间 " + pad2(alarm.hour) + ":" + pad2(alarm.min) +
    "（" + ({ daily: "每天", weekdays: "工作日", once: "仅一次" })[alarm.repeat] + "）";
  showToast("🔔 闹钟时间到！", 5000);
  var ov = $("ct-al-overlay");
  if (ov) ov.classList.add("show");
  /* 仅一次 → 自动关闭；每日/工作日 → 安排下一次 */
  if (alarm.repeat === "once") {
    alarm.enabled = false;
    alarm.nextTs = null;
  } else {
    alarm.nextTs = alarmNextTs(alarm.hour, alarm.min, alarm.repeat, Date.now() + 1000);
  }
  alarmSave();
  alarmRender();
}
function alarmDismiss() {
  stopBlink();
  alarm.ringing = false;
  var ov = $("ct-al-overlay");
  if (ov) ov.classList.remove("show");
  if (alarm.repeat === "once") { alarm.enabled = false; alarm.nextTs = null; alarmRender(); }
  restoreDocTitle();
}
function alarmApply() {
  alarm.hour = Math.max(0, Math.min(23, parseInt($("ct-al-hour").value, 10) || 0));
  alarm.min = Math.max(0, Math.min(59, parseInt($("ct-al-min").value, 10) || 0));
  alarm.repeat = $("ct-al-repeat").value;
  alarm.enabled = $("ct-al-toggle").checked;
  alarmReschedule();
  alarmSave();
  alarmRender();
  showToast(alarm.enabled ? "闹钟已设定" : "闹钟已关闭");
  if (!alarm.enabled) restoreDocTitle();
}

/* ---- 11.8 标题栏闪烁 ---- */
var blinkTimer = null;
function blinkTitle(label) {
  stopBlink();
  var frames = blinkTitles(label, "00:00");
  var i = 0;
  blinkTimer = setInterval(function () {
    setDocTitle(frames[i % 2]);
    i++;
    playPattern("beep");
  }, 1500);
}
function stopBlink() {
  if (blinkTimer) { clearInterval(blinkTimer); blinkTimer = null; }
}

/* ---- 11.9 预设（localStorage） ---- */
var presets = [];
function loadPresets() { presets = parsePresets(safeGetLS(LS_PRESETS)); }
function safeGetLS(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function safeSetLS(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
function persistPresets() { safeSetLS(LS_PRESETS, serializePresets(presets)); }
function renderPresets() {
  ["countdown", "pomodoro"].forEach(function (type) {
    var box = $("ct-preset-" + type);
    if (!box) return;
    var items = presetsByType(presets, type);
    if (!items.length) {
      box.innerHTML = "<div class=\"ct-emptylap\">暂无预设，先保存一组吧</div>";
      return;
    }
    var html = "";
    items.forEach(function (p) {
      var desc = type === "countdown"
        ? fmtHMS((p.params.h || 0) * 3600 + (p.params.m || 0) * 60 + (p.params.s || 0))
        : "专注" + (p.params.focus || 25) + "m / 短休" + (p.params.short || 5) +
          "m / 长休" + (p.params.long || 15) + "m ×" + (p.params.rounds || 4);
      html += "<div class=\"ct-preset-item\" data-id=\"" + esc(p.id) + "\">" +
        "<span class=\"ct-preset-name\">" + esc(p.name) + "</span>" +
        "<span class=\"ct-preset-desc\">" + esc(desc) + "</span>" +
        "<button type=\"button\" class=\"ct-mini-btn ct-use\" data-id=\"" + esc(p.id) +
        "\">使用</button>" +
        "<button type=\"button\" class=\"ct-mini-btn ct-del\" data-id=\"" + esc(p.id) +
        "\">删除</button></div>";
    });
    box.innerHTML = html;
  });
}
function bindPresetList() {
  ["countdown", "pomodoro"].forEach(function (type) {
    var box = $("ct-preset-" + type);
    if (!box) return;
    box.addEventListener("click", function (e) {
      var btn = e.target;
      if (!btn.classList || (!btn.classList.contains("ct-use") && !btn.classList.contains("ct-del"))) return;
      var id = btn.getAttribute("data-id");
      var p = null;
      presets.forEach(function (x) { if (x.id === id) p = x; });
      if (!p) return;
      if (btn.classList.contains("ct-del")) {
        presets = deletePreset(presets, id);
        persistPresets(); renderPresets();
        showToast("预设已删除");
        return;
      }
      /* 使用 */
      if (p.type === "countdown") {
        switchMode("countdown");
        cdReset();
        $("ct-cd-h").value = p.params.h || 0;
        $("ct-cd-m").value = p.params.m || 0;
        $("ct-cd-s").value = p.params.s || 0;
        showToast("已载入预设「" + p.name + "」，点击开始计时");
      } else {
        switchMode("pomodoro");
        $("ct-pomo-focus").value = p.params.focus || 25;
        $("ct-pomo-short").value = p.params.short || 5;
        $("ct-pomo-long").value = p.params.long || 15;
        $("ct-pomo-rounds").value = p.params.rounds || 4;
        pomoReset();
        pomoRender();
        showToast("已载入预设「" + p.name + "」，点击开始专注");
      }
    });
  });
}
function saveCountdownPreset() {
  var name = ($("ct-preset-name-cd").value || "").trim();
  if (!name) { showToast("请先给预设起个名字"); return; }
  var r = savePreset(presets, {
    name: name, type: "countdown",
    params: { h: +$("ct-cd-h").value || 0, m: +$("ct-cd-m").value || 0, s: +$("ct-cd-s").value || 0 }
  });
  if (!r.ok) { showToast("倒计时预设已满 5 组，请先删除旧的"); return; }
  presets = r.list;
  persistPresets(); renderPresets();
  $("ct-preset-name-cd").value = "";
  showToast("预设「" + name + "」已保存");
}
function savePomodoroPreset() {
  var name = ($("ct-preset-name-pomo").value || "").trim();
  if (!name) { showToast("请先给预设起个名字"); return; }
  pomoReadParams();
  var r = savePreset(presets, {
    name: name, type: "pomodoro",
    params: { focus: pomo.focusMin, short: pomo.shortMin, long: pomo.longMin, rounds: pomo.cyclesBeforeLong }
  });
  if (!r.ok) { showToast("番茄钟预设已满 5 组，请先删除旧的"); return; }
  presets = r.list;
  persistPresets(); renderPresets();
  $("ct-preset-name-pomo").value = "";
  showToast("预设「" + name + "」已保存");
}

/* ---- 11.10 音效设置 ---- */
var soundSetting = "beep";
function loadSound() {
  var v = safeGetLS(LS_SOUND);
  if (v === "beep" || v === "bell" || v === "chime" || v === "mute") soundSetting = v;
  var sel = $("ct-sound");
  if (sel) sel.value = soundSetting;
}

/* ---- 11.11 模式切换 ---- */
var curMode = "countdown";
function switchMode(mode) {
  curMode = mode;
  var tabs = document.querySelectorAll(".ct-tab");
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].classList.toggle("active", tabs[i].getAttribute("data-mode") === mode);
  }
  var panes = document.querySelectorAll(".ct-pane");
  for (var j = 0; j < panes.length; j++) {
    panes[j].classList.toggle("active", panes[j].getAttribute("data-pane") === mode);
  }
  restoreDocTitle();
  /* 同步大字显示区到当前模式 */
  if (mode === "countdown") cdRender();
  else if (mode === "stopwatch") swRender();
  else if (mode === "pomodoro") pomoRender();
  else if (mode === "alarm") alarmRender();
}

/* ---- 11.12 初始化 ---- */
function init() {
  loadPresets();
  pomoLoadDaily();
  alarmLoad();
  loadSound();

  /* 模式 Tab */
  var tabs = document.querySelectorAll(".ct-tab");
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].addEventListener("click", function () { switchMode(this.getAttribute("data-mode")); });
  }

  /* 倒计时 */
  $("ct-cd-start").addEventListener("click", cdStart);
  $("ct-cd-pause").addEventListener("click", cdPause);
  $("ct-cd-reset").addEventListener("click", cdReset);
  var quicks = document.querySelectorAll(".ct-quick");
  for (var q = 0; q < quicks.length; q++) {
    (function (el) {
      el.addEventListener("click", function () { cdQuick(parseInt(el.getAttribute("data-min"), 10) || 5); });
    })(quicks[q]);
  }
  $("ct-save-preset-cd").addEventListener("click", saveCountdownPreset);

  /* 秒表 */
  $("ct-sw-start").addEventListener("click", swStart);
  $("ct-sw-pause").addEventListener("click", swPause);
  $("ct-sw-lap").addEventListener("click", swLap);
  $("ct-sw-reset").addEventListener("click", swReset);

  /* 番茄钟 */
  $("ct-pomo-start").addEventListener("click", pomoStart);
  $("ct-pomo-pause").addEventListener("click", pomoPause);
  $("ct-pomo-skip").addEventListener("click", pomoSkip);
  $("ct-pomo-reset").addEventListener("click", pomoReset);
  ["ct-pomo-focus", "ct-pomo-short", "ct-pomo-long", "ct-pomo-rounds"].forEach(function (id) {
    $(id).addEventListener("change", function () { pomoReadParams(); pomoRender(); });
  });
  $("ct-save-preset-pomo").addEventListener("click", savePomodoroPreset);

  /* 闹钟 */
  $("ct-al-apply").addEventListener("click", alarmApply);
  $("ct-al-dismiss").addEventListener("click", alarmDismiss);
  setInterval(alarmCheck, 1000);
  alarmReschedule();

  /* 预设列表 */
  bindPresetList();

  /* 音效 */
  $("ct-sound").addEventListener("change", function () {
    soundSetting = this.value;
    safeSetLS(LS_SOUND, soundSetting);
    if (soundSetting !== "mute") playPattern();
  });
  $("ct-test-sound").addEventListener("click", function () { playPattern(); });

  /* 全屏 */
  $("ct-fullscreen").addEventListener("click", toggleFullscreen);
  document.addEventListener("fullscreenchange", syncFullscreenClass);

  /* F 键全屏（输入框内不触发） */
  document.addEventListener("keydown", function (e) {
    var tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (e.key === "f" || e.key === "F" || e.key === "ｆ") toggleFullscreen();
    if (e.key === " " && curMode === "stopwatch") {
      e.preventDefault();
      if (sw.state === "running") swLap(); else swStart();
    }
  });

  switchMode("countdown");
  cdRender(); swRender(); pomoRender(); alarmRender(); renderPresets();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();

})();
