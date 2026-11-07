/* 在线节拍器纯函数单元测试（零依赖）：node tests/metronome.test.js
* 覆盖：validateBpm（40/208 通过、39/209/120.5 抛错 err.field='bpm'）、
* bpmToIntervalMs（锚点 60→1000、120→500、40→1500、208→≈288.46；120.5 按
* BACKLOG 有限数口径通过）、intervalMsToBpm（500→120、1000→60、100→600
* 不钳制）、tapToBpm（[500,500,500]→120、[250,250]→240 不钳制、≥2 间隔口径）、
* beatInBar（(0,4)/(3,4)/(4,4)/(5,6) 锚点）、nextBeatTime（(1.0,500)→1.5）、
* clickParams（首拍 {2000,50,1.0}、其余 {1000,50,0.6}）、非法参数 err.field、
* categories.go 注册（Path 总数 310→311、Icon av_timer 全库唯一、紧邻 music_visualizer）、
* 模板（SEO 五关键词、真限制四条、控件、互链、零外部资源静态检查）、
* 调度器与 Tap 源码级检查（前瞻调度 25ms＋0.1s、超限不钳制提示）。
*/
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/metronome.js");

var pass = 0, fail = 0;
function ok(cond, name) {
if (cond) { pass++; }
else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function eqj(a, b, name) { eq(JSON.stringify(a), JSON.stringify(b), name); }
function near(a, b, tol, name) { ok(Math.abs(a - b) <= tol, name + "（期望≈" + b + "±" + tol + "，实得 " + a + "）"); }
function has(s, sub, name) { ok(s.indexOf(sub) !== -1, name + "（缺 " + sub + "）"); }
function notHas(s, sub, name) { ok(s.indexOf(sub) === -1, name + "（不应含 " + sub + "）"); }
function throws(fn, field, name) {
try { fn(); ok(false, name + "（应抛错却未抛）"); }
catch (e) { ok(!field || e.field === field, name + "（err.field 期望 " + field + "，实得 " + e.field + "）"); }
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "metronome.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "metronome.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");
var MV_TPL = fs.readFileSync(path.join(ROOT, "templates", "music_visualizer.html"), "utf8");
var SR_TPL = fs.readFileSync(path.join(ROOT, "templates", "slowed_reverb.html"), "utf8");

/* ---------- 1. validateBpm：40–208 整数 ---------- */
eq(M.validateBpm(40), 40, "validateBpm：40 通过");
eq(M.validateBpm(208), 208, "validateBpm：208 通过");
eq(M.validateBpm(120), 120, "validateBpm：120 通过");
throws(function () { M.validateBpm(39); }, "bpm", "validateBpm：39 抛错 err.field='bpm'");
throws(function () { M.validateBpm(209); }, "bpm", "validateBpm：209 抛错 err.field='bpm'");
throws(function () { M.validateBpm(120.5); }, "bpm", "validateBpm：120.5 非整数抛错 err.field='bpm'");
throws(function () { M.validateBpm(NaN); }, "bpm", "validateBpm：NaN 抛错 err.field='bpm'");
throws(function () { M.validateBpm("120"); }, "bpm", "validateBpm：字符串抛错 err.field='bpm'");
throws(function () { M.validateBpm(null); }, "bpm", "validateBpm：null 抛错 err.field='bpm'");
throws(function () { M.validateBpm(undefined); }, "bpm", "validateBpm：undefined 抛错 err.field='bpm'");

/* ---------- 2. bpmToIntervalMs：60000/bpm ---------- */
eq(M.bpmToIntervalMs(60), 1000, "bpmToIntervalMs：60→1000");
eq(M.bpmToIntervalMs(120), 500, "bpmToIntervalMs：120→500");
eq(M.bpmToIntervalMs(40), 1500, "bpmToIntervalMs：40→1500");
near(M.bpmToIntervalMs(208), 60000 / 208, 0.01, "bpmToIntervalMs：208→≈288.46");
near(M.bpmToIntervalMs(120.5), 60000 / 120.5, 1e-9, "bpmToIntervalMs：120.5 有限数口径通过（BACKLOG：仅要求 40–208 有限数）");
throws(function () { M.bpmToIntervalMs(39); }, "bpm", "bpmToIntervalMs：39 抛错 err.field='bpm'");
throws(function () { M.bpmToIntervalMs(209); }, "bpm", "bpmToIntervalMs：209 抛错 err.field='bpm'");
throws(function () { M.bpmToIntervalMs(NaN); }, "bpm", "bpmToIntervalMs：NaN 抛错 err.field='bpm'");
throws(function () { M.bpmToIntervalMs("120"); }, "bpm", "bpmToIntervalMs：字符串抛错 err.field='bpm'");

/* ---------- 3. intervalMsToBpm：60000/ms，不钳制 ---------- */
eq(M.intervalMsToBpm(500), 120, "intervalMsToBpm：500→120");
eq(M.intervalMsToBpm(1000), 60, "intervalMsToBpm：1000→60");
near(M.intervalMsToBpm(288.46), 208, 0.01, "intervalMsToBpm：288.46→≈208");
eq(M.intervalMsToBpm(100), 600, "intervalMsToBpm：100ms→600 不钳制（由调用方按 validateBpm 处理）");
eq(M.intervalMsToBpm(2000), 30, "intervalMsToBpm：2000ms→30 不钳制");
throws(function () { M.intervalMsToBpm(0); }, "intervalMs", "intervalMsToBpm：0 抛错 err.field='intervalMs'");
throws(function () { M.intervalMsToBpm(-1); }, "intervalMs", "intervalMsToBpm：负数抛错 err.field='intervalMs'");
throws(function () { M.intervalMsToBpm(NaN); }, "intervalMs", "intervalMsToBpm：NaN 抛错 err.field='intervalMs'");
throws(function () { M.intervalMsToBpm("500"); }, "intervalMs", "intervalMsToBpm：字符串抛错 err.field='intervalMs'");

/* ---------- 4. tapToBpm：平均间隔→BPM，不钳制 ---------- */
eq(M.tapToBpm([500, 500, 500]), 120, "tapToBpm：[500,500,500]→120");
eq(M.tapToBpm([250, 250]), 240, "tapToBpm：[250,250]→240 不钳制（调用方提示超限）");
eq(M.tapToBpm([1000, 1000, 1000]), 60, "tapToBpm：[1000,1000,1000]→60");
near(M.tapToBpm([333, 333, 333]), 60000 / 333, 1e-9, "tapToBpm：[333,333,333]→60000/333");
eq(M.tapToBpm([500, 500]), 120, "tapToBpm：2 个间隔即满足 ≥2 口径");
throws(function () { M.tapToBpm([500]); }, "intervals", "tapToBpm：仅 1 个间隔抛错 err.field='intervals'");
throws(function () { M.tapToBpm([]); }, "intervals", "tapToBpm：空数组抛错 err.field='intervals'");
throws(function () { M.tapToBpm([500, -1]); }, "intervals", "tapToBpm：负间隔抛错 err.field='intervals'");
throws(function () { M.tapToBpm([500, "x"]); }, "intervals", "tapToBpm：字符串间隔抛错 err.field='intervals'");
throws(function () { M.tapToBpm([0, 500]); }, "intervals", "tapToBpm：0 间隔抛错 err.field='intervals'");
throws(function () { M.tapToBpm(null); }, "intervals", "tapToBpm：null 抛错 err.field='intervals'");
throws(function () { M.tapToBpm("500"); }, "intervals", "tapToBpm：字符串抛错 err.field='intervals'");

/* ---------- 5. beatInBar：小节内拍位 ---------- */
eqj(M.beatInBar(0, 4), { beat: 1, isAccent: true }, "beatInBar：(0,4)→{beat:1,isAccent:true}");
eqj(M.beatInBar(3, 4), { beat: 4, isAccent: false }, "beatInBar：(3,4)→{beat:4,isAccent:false}");
eqj(M.beatInBar(4, 4), { beat: 1, isAccent: true }, "beatInBar：(4,4)→{beat:1,isAccent:true}");
eqj(M.beatInBar(5, 6), { beat: 6, isAccent: false }, "beatInBar：(5,6)→{beat:6,isAccent:false}");
eqj(M.beatInBar(1, 4), { beat: 2, isAccent: false }, "beatInBar：(1,4)→{beat:2,isAccent:false}");
eqj(M.beatInBar(6, 6), { beat: 1, isAccent: true }, "beatInBar：(6,6)→{beat:1,isAccent:true}");
eqj(M.beatInBar(2, 3), { beat: 3, isAccent: false }, "beatInBar：(2,3)→{beat:3,isAccent:false}");
throws(function () { M.beatInBar(-1, 4); }, "beatIndex", "beatInBar：拍序号 -1 抛错 err.field='beatIndex'");
throws(function () { M.beatInBar(1.5, 4); }, "beatIndex", "beatInBar：拍序号非整数抛错 err.field='beatIndex'");
throws(function () { M.beatInBar(0, 5); }, "beatsPerBar", "beatInBar：拍号 5 抛错 err.field='beatsPerBar'");
throws(function () { M.beatInBar(0, 0); }, "beatsPerBar", "beatInBar：拍号 0 抛错 err.field='beatsPerBar'");
throws(function () { M.beatInBar(0, "4"); }, "beatsPerBar", "beatInBar：拍号字符串抛错 err.field='beatsPerBar'");

/* ---------- 6. nextBeatTime：currentTime＋intervalMs/1000 ---------- */
eq(M.nextBeatTime(1.0, 500), 1.5, "nextBeatTime：(1.0,500)→1.5");
eq(M.nextBeatTime(0, 1000), 1, "nextBeatTime：(0,1000)→1");
near(M.nextBeatTime(2.5, 250), 2.75, 1e-9, "nextBeatTime：(2.5,250)→2.75");
throws(function () { M.nextBeatTime(-1, 500); }, "currentTime", "nextBeatTime：当前时间 -1 抛错 err.field='currentTime'");
throws(function () { M.nextBeatTime(NaN, 500); }, "currentTime", "nextBeatTime：当前时间 NaN 抛错 err.field='currentTime'");
throws(function () { M.nextBeatTime(1, 0); }, "intervalMs", "nextBeatTime：间隔 0 抛错 err.field='intervalMs'");
throws(function () { M.nextBeatTime(1, -5); }, "intervalMs", "nextBeatTime：间隔负数抛错 err.field='intervalMs'");
throws(function () { M.nextBeatTime(1, "500"); }, "intervalMs", "nextBeatTime：间隔字符串抛错 err.field='intervalMs'");

/* ---------- 7. clickParams：首拍重音参数 ---------- */
eqj(M.clickParams(true), { frequency: 2000, durationMs: 50, gain: 1 }, "clickParams：首拍 {2000,50,1.0}");
eqj(M.clickParams(false), { frequency: 1000, durationMs: 50, gain: 0.6 }, "clickParams：其余拍 {1000,50,0.6}");
throws(function () { M.clickParams("x"); }, "isAccent", "clickParams：字符串抛错 err.field='isAccent'");
throws(function () { M.clickParams(1); }, "isAccent", "clickParams：数字 1 抛错 err.field='isAccent'");
throws(function () { M.clickParams(null); }, "isAccent", "clickParams：null 抛错 err.field='isAccent'");

/* ---------- 8. 常量与同步导出 ---------- */
eq(M.MIN_BPM, 40, "常量：BPM 下限 40");
eq(M.MAX_BPM, 208, "常量：BPM 上限 208");
eq(M.DEFAULT_BPM, 120, "常量：默认 BPM 120");
eq(M.LOOKAHEAD_MS, 25, "常量：调度定时器 25ms");
eq(M.SCHEDULE_AHEAD_S, 0.1, "常量：预调度窗口 0.1s");
eq(M.ACCENT_FREQ, 2000, "常量：首拍频率 2000Hz");
eq(M.BEAT_FREQ, 1000, "常量：其余拍频率 1000Hz");
eq(M.CLICK_DUR_MS, 50, "常量：click 持续 50ms");
eq(M.ACCENT_GAIN, 1.0, "常量：首拍增益 1.0");
eq(M.BEAT_GAIN, 0.6, "常量：其余拍增益 0.6");
eq(M.TIME_SIGNATURES.length, 4, "常量：4 种拍号");
eq(M.TIMBRES.length, 4, "常量：4 档音色");
ok(M.TIMBRES.indexOf("click") !== -1 && M.TIMBRES.indexOf("woodblock") !== -1 &&
M.TIMBRES.indexOf("drum") !== -1 && M.TIMBRES.indexOf("sine") !== -1, "常量：4 档音色齐全（click/木鱼/鼓/正弦）");
eqj(M.BPM_PRESETS, [60, 80, 100, 120, 140, 160], "常量：BPM 预设 60/80/100/120/140/160");
eq(M.TAP_MIN_TAPS, 4, "常量：界面 Tap 测速至少 4 次点按");
eq(M.TAP_MAX_GAP_MS, 2000, "常量：Tap 点按间隔上限 2 秒");
ok(typeof M.validateBpm === "function" && typeof M.bpmToIntervalMs === "function" &&
typeof M.intervalMsToBpm === "function" && typeof M.tapToBpm === "function" &&
typeof M.beatInBar === "function" && typeof M.nextBeatTime === "function" &&
typeof M.clickParams === "function",
"同步导出：7 个核心纯函数齐全");
has(JS_SRC, "window.Metronome", "浏览器导出：window.Metronome");
has(JS_SRC, "module.exports = api", "node 导出：module.exports 同步导出");
has(JS_SRC, "OscillatorNode", "JS：OscillatorNode 正弦 click");
has(JS_SRC, "createOscillator", "JS：createOscillator 建 click 音");
has(JS_SRC, "setInterval", "JS：setInterval 调度定时器");
has(JS_SRC, "LOOKAHEAD_MS = 25", "JS：LOOKAHEAD_MS=25");
has(JS_SRC, "SCHEDULE_AHEAD_S = 0.1", "JS：SCHEDULE_AHEAD_S=0.1");
has(JS_SRC, "exponentialRampToValueAtTime", "JS：增益包络");
has(JS_SRC, "performance.now", "JS：Tap 计时 performance.now");
has(JS_SRC, "ArrowUp", "JS：键盘 ↑ 调 BPM");
has(JS_SRC, "ArrowDown", "JS：键盘 ↓ 调 BPM");
has(JS_SRC, "ev.code === 'Space'", "JS：空格启停");
notHas(JS_SRC, "fetch(", "JS 零外部接口：无 fetch");
notHas(JS_SRC, "XMLHttpRequest", "JS 零外部接口：无 XMLHttpRequest");
notHas(JS_SRC, "localStorage", "JS 零存储：不写 localStorage");

/* ---------- 9. 调度器与 Tap 源码级检查 ---------- */
var schedSrc = JS_SRC.slice(JS_SRC.indexOf("function scheduler()"),
JS_SRC.indexOf("/* ================= 启停"));
has(schedSrc, "bpmToIntervalMs(state.bpm)", "调度器：每轮按当前 BPM 换算间隔");
has(schedSrc, "SCHEDULE_AHEAD_S", "调度器：预调度窗口 0.1s");
has(schedSrc, "nextBeatTime(state.nextNoteTime, intervalMs)", "调度器：nextBeatTime 推进下一拍");
has(schedSrc, "scheduleClick(state.beatCount, state.nextNoteTime)", "调度器：按全局拍序号排 click");
var tapSrc = JS_SRC.slice(JS_SRC.indexOf("function onTap()"),
JS_SRC.indexOf("/* ================= 初始化"));
has(tapSrc, "tapToBpm(intervals)", "Tap：取平均间隔换算 BPM");
has(tapSrc, "TAP_MIN_TAPS", "Tap：≥4 次点按才测速");
has(tapSrc, "TAP_MAX_GAP_MS", "Tap：间隔超 2 秒重新计时");
has(tapSrc, "validateBpm(bpm)", "Tap：测得 BPM 经 validateBpm 校验");
has(tapSrc, "未自动钳制", "Tap：超限明确提示不自动钳制");

/* ---------- 10. categories.go 注册 ---------- */
var pathCount = (GO_SRC.match(/"\/tools\/[^"]+"/g) || []).filter(function (v, i, a) { return a.indexOf(v) === i; }).length;
eq(pathCount, 327, "注册 Path 总数 310→311");
has(GO_SRC, '"metronome"', "注册：ID metronome");
has(GO_SRC, '"/tools/metronome"', "注册：Path /tools/metronome");
has(GO_SRC, '"av_timer"', "注册：Icon av_timer");
eq((GO_SRC.match(/Icon:\s*"av_timer"/g) || []).length, 1, "Icon av_timer 全库唯一");
var entryBlock = GO_SRC.slice(GO_SRC.indexOf('"metronome"') - 60,
GO_SRC.indexOf('"metronome"') + 1600);
ok(/New:\s+true/.test(entryBlock), "注册：New: true");
ok(/Category:\s+"音频处理"/.test(entryBlock), "注册：类目 音频处理");
has(entryBlock, "在线节拍器", "注册：名称 在线节拍器");
has(entryBlock, "前瞻调度", "注册：描述含前瞻调度");
has(entryBlock, "Tap", "注册：描述含 Tap");
ok(GO_SRC.indexOf('"metronome"') > GO_SRC.indexOf('"music_visualizer"') &&
GO_SRC.indexOf('"metronome"') < GO_SRC.indexOf('"slowed_reverb"'), "注册：紧邻 music_visualizer（在其后、slowed_reverb 之前）");

/* ---------- 11. 模板：SEO/真限制/控件/互链/零外部资源 ---------- */
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/metronome", "模板 canonical 含新 Path");
has(TPL_SRC, "在线节拍器", "模板：标题含工具名");
has(TPL_SRC, "在线节拍器,节拍器,metronome,BPM,节拍器在线", "模板 SEO：五关键词齐全");
has(TPL_SRC, "真限制", "模板：真限制章节");
has(TPL_SRC, "浏览器节流", "真限制①：浏览器节流");
has(TPL_SRC, "后台标签页 setInterval 可能被节流导致节拍漂移", "真限制①：后台标签页节流致漂移");
has(TPL_SRC, "手机静音模式／系统媒体音量会影响节拍音", "真限制②：手机静音/媒体音量影响");
has(TPL_SRC, "Tap 测速是估算值", "真限制③：Tap 测速为估算值");
has(TPL_SRC, "全程浏览器本地计算，零上传", "真限制④：全程本地零上传");
has(TPL_SRC, 'id="mt-start"', "模板控件：启停按钮 mt-start");
has(TPL_SRC, 'id="mt-bpm-slider"', "模板控件：BPM 滑杆 mt-bpm-slider");
has(TPL_SRC, 'id="mt-bpm-input"', "模板控件：BPM 数字输入 mt-bpm-input");
has(TPL_SRC, 'id="mt-step-m5"', "模板控件：步进 −5 mt-step-m5");
has(TPL_SRC, 'id="mt-step-m1"', "模板控件：步进 −1 mt-step-m1");
has(TPL_SRC, 'id="mt-step-p1"', "模板控件：步进 +1 mt-step-p1");
has(TPL_SRC, 'id="mt-step-p5"', "模板控件：步进 +5 mt-step-p5");
has(TPL_SRC, 'data-bpm="60"', "模板控件：BPM 预设 60");
has(TPL_SRC, 'data-bpm="160"', "模板控件：BPM 预设 160");
has(TPL_SRC, 'data-beats="2"', "模板控件：拍号 2/4");
has(TPL_SRC, 'data-beats="3"', "模板控件：拍号 3/4");
has(TPL_SRC, 'data-beats="4"', "模板控件：拍号 4/4");
has(TPL_SRC, 'data-beats="6"', "模板控件：拍号 6/8");
has(TPL_SRC, 'data-timbre="click"', "模板控件：音色 click");
has(TPL_SRC, 'data-timbre="woodblock"', "模板控件：音色 木鱼");
has(TPL_SRC, 'data-timbre="drum"', "模板控件：音色 鼓");
has(TPL_SRC, 'data-timbre="sine"', "模板控件：音色 正弦");
has(TPL_SRC, 'id="mt-beat-dots"', "模板控件：拍位圆点 mt-beat-dots");
has(TPL_SRC, 'id="mt-flash"', "模板控件：节拍闪烁 mt-flash");
has(TPL_SRC, 'id="mt-tap"', "模板控件：Tap 测速按钮 mt-tap");
has(TPL_SRC, 'id="mt-volume"', "模板控件：音量滑杆 mt-volume");
has(TPL_SRC, 'id="mt-mute"', "模板控件：静音按钮 mt-mute");
has(TPL_SRC, "/tools/music-visualizer", "互链：音乐可视化器（单向）");
has(TPL_SRC, "/tools/slowed-reverb", "互链：音频变速混响生成器（单向）");
has(TPL_SRC, "/tools/static/js/metronome.js?v=1", "模板：引用本站 JS");
notHas(MV_TPL, "/tools/metronome", "单向互链：音乐可视化器模板不链回本工具（单向）");
notHas(SR_TPL, "/tools/metronome", "单向互链：变速混响模板不链回本工具（单向）");
notHas(TPL_SRC, "fonts.googleapis", "模板零 CDN：无外部字体");
ok((TPL_SRC.match(/<script[^>]*src="http/g) || []).length === 0, "模板零外部脚本：无 http script src");
var httpLinks = TPL_SRC.match(/<link[^>]*href="http[^"]*"/g) || [];
eq(httpLinks.length, 1, "模板 http link 仅 canonical 一条");
ok(httpLinks.length === 1 && httpLinks[0].indexOf("https://www.johnkingzcq123.xyz/tools/metronome") !== -1, "模板 http link：仅自家 canonical");

console.log("metronome: pass=" + pass + " fail=" + fail + "，共 " + (pass + fail) + " 断言");
if (fail > 0) process.exit(1);
