/* 在线提词器纯逻辑单元测试（零依赖）：node tests/teleprompter.test.js
* 覆盖：
* 1. 文案解析与统计（parseScript/countChars/estimateSeconds/formatDur/scriptStats）
* 2. 速度（clampSpeed/adjustSpeed/pxPerSecond）
* 3. 进度映射（progressFromScroll/scrollTopFromProgress）
* 4. 当前行判定（findCurrentLine）
* 5. 快捷键与镜像（keyAction/mirrorTransform）
* 6. 示例演讲稿（≥50 行）与默认设置/常量
*/
"use strict";
var M = require("../static/js/teleprompter.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function near(a, b, name) { ok(Math.abs(a - b) < 1e-9, name + "（期望 " + b + "，实得 " + a + "）"); }

/* ---------- 1. 文案解析与统计 ---------- */
var p1 = M.parseScript("第一段\n\n第二段\n   \n第三段");
eq(p1.length, 3, "空行被跳过，3 段");
eq(p1[0].text, "第一段", "首段文本");
eq(p1[2].i, 2, "段序号连续");

var p2 = M.parseScript("");
eq(p2.length, 0, "空输入 0 段");

var p3 = M.parseScript("  hello world  ");
eq(p3.length, 1, "首尾空白被 trim");
eq(p3[0].chars, 10, "英文按去空白字符计数");

eq(M.countChars("你好 世界\n"), 4, "中文去空白计数");
eq(M.countChars(""), 0, "空串 0 字");

eq(M.estimateSeconds(180, 180), 60, "180 字按 180字/分 = 60 秒");
eq(M.estimateSeconds(90, 180), 30, "90 字 = 30 秒");
eq(M.estimateSeconds(0, 180), 0, "0 字 0 秒");
eq(M.estimateSeconds(1, 180), 0, "1 字四舍五入 0 秒");
eq(M.estimateSeconds(181, 180), 60, "181 字约 60 秒");

eq(M.formatDur(0), "0分0秒", "0 秒格式化");
eq(M.formatDur(65), "1分5秒", "65 秒格式化");
eq(M.formatDur(3600), "60分0秒", "3600 秒格式化");

var st = M.scriptStats("第一段\n第二段第三段", 180);
eq(st.paras, 2, "统计段数 2");
eq(st.chars, 9, "统计字数 9");
ok(st.seconds >= 0, "预计秒数非负");
ok(st.label.indexOf("2 段") >= 0 && st.label.indexOf("180 字/分钟") >= 0, "统计文案含段数与语速口径");

var st2 = M.scriptStats(M.SAMPLE_TEXT);
eq(st2.paras, M.SAMPLE_LINES.length, "示例稿段数 = 行数");

/* ---------- 2. 速度 ---------- */
eq(M.clampSpeed(1), 1, "1x 保持");
eq(M.clampSpeed(5), 5, "5x 保持");
eq(M.clampSpeed(0.2), 1, "低于下限钳制 1");
eq(M.clampSpeed(9), 5, "高于上限钳制 5");
eq(M.clampSpeed(2.3), 2.5, "2.3 对齐到 2.5（0.5 步进）");
eq(M.clampSpeed(2.2), 2, "2.2 对齐到 2.0");
eq(M.clampSpeed("abc"), 1, "非法输入取默认 1");

eq(M.adjustSpeed(1, 0.5), 1.5, "1x +0.5 = 1.5x");
eq(M.adjustSpeed(5, 0.5), 5, "5x 再加速仍 5x");
eq(M.adjustSpeed(1, -0.5), 1, "1x 再减速仍 1x");
eq(M.adjustSpeed(2.5, -0.5), 2, "2.5x -0.5 = 2x");

eq(M.pxPerSecond(1, 60), 60, "1x 基准 60px/s");
eq(M.pxPerSecond(5, 60), 300, "5x = 300px/s");
eq(M.pxPerSecond(2.5), 150, "默认基准 2.5x = 150px/s");
eq(M.pxPerSecond(99), 300, "超速输入先钳制再换算");

/* ---------- 3. 进度映射 ---------- */
near(M.progressFromScroll(0, 1000), 0, "顶部进度 0");
near(M.progressFromScroll(500, 1000), 0.5, "一半进度 0.5");
near(M.progressFromScroll(1000, 1000), 1, "底部进度 1");
near(M.progressFromScroll(1200, 1000), 1, "超限钳制 1");
near(M.progressFromScroll(-50, 1000), 0, "负值钳制 0");
eq(M.progressFromScroll(0, 0), 0, "无可滚动高度时进度 0");
eq(M.progressFromScroll(10, -5), 0, "非法 maxScroll 进度 0");

near(M.scrollTopFromProgress(0.5, 1000), 500, "0.5 进度 → 500px");
near(M.scrollTopFromProgress(0, 1000), 0, "0 进度 → 顶部");
near(M.scrollTopFromProgress(1, 1000), 1000, "1 进度 → 底部");
near(M.scrollTopFromProgress(1.5, 1000), 1000, "超限进度钳制底部");
eq(M.scrollTopFromProgress(0.5, 0), 0, "无可滚动高度跳转 0");

/* 往返一致性 */
var rt = M.scrollTopFromProgress(M.progressFromScroll(333, 1000), 1000);
near(rt, 333, "进度往返一致");

/* ---------- 4. 当前行判定 ---------- */
var tops = [{top: 0, bottom: 100}, {top: 100, bottom: 250}, {top: 250, bottom: 300}];
eq(M.findCurrentLine(tops, 50), 0, "基准线在第 1 段内");
eq(M.findCurrentLine(tops, 100), 1, "边界值归属下一段");
eq(M.findCurrentLine(tops, 249.9), 1, "第 2 段末尾");
eq(M.findCurrentLine(tops, 275), 2, "第 3 段内");
eq(M.findCurrentLine(tops, 9999), 2, "超出末尾取最后一段");
eq(M.findCurrentLine(tops, -10), 0, "顶部之前取第 1 段");
eq(M.findCurrentLine([], 50), -1, "空数组返回 -1");

/* ---------- 5. 快捷键与镜像 ---------- */
eq(M.keyAction(" "), "toggle", "空格 = 播放/暂停");
eq(M.keyAction("Spacebar"), "toggle", "老式 Spacebar 兼容");
eq(M.keyAction("ArrowUp"), "faster", "↑ = 加速");
eq(M.keyAction("ArrowDown"), "slower", "↓ = 减速");
eq(M.keyAction("f"), "fullscreen", "f = 全屏");
eq(M.keyAction("F"), "fullscreen", "F = 全屏");
eq(M.keyAction("Escape"), null, "Esc 交给浏览器原生退出全屏");
eq(M.keyAction("Enter"), null, "无关按键不处理");
eq(M.keyAction("a"), null, "字母键不处理");

eq(M.mirrorTransform(true), "scaleX(-1)", "镜像开 = 水平翻转");
eq(M.mirrorTransform(false), "", "镜像关 = 无变换");

/* ---------- 6. 示例稿与常量 ---------- */
ok(M.SAMPLE_LINES.length >= 50, "示例演讲稿 ≥50 行（实得 " + M.SAMPLE_LINES.length + "）");
eq(M.SAMPLE_TEXT, M.SAMPLE_LINES.join("\n"), "示例文本 = 行数组拼接");
ok(M.SAMPLE_LINES.every(function (l) { return l.trim().length > 0; }), "示例稿无空行");
var sampleStats = M.scriptStats(M.SAMPLE_TEXT);
ok(sampleStats.chars > 500, "示例稿字数充足（实得 " + sampleStats.chars + "）");
ok(sampleStats.seconds > 120, "示例稿预计时长超过 2 分钟，可验证滚动");

eq(M.LS_KEY, "tw_teleprompter_v1", "localStorage key");
eq(M.READ_CPM, 180, "朗读语速口径 180 字/分钟");
eq(M.BASE_PX_PER_SEC, 60, "1x 基准像素速度");
eq(M.MARKER_FRAC, 0.35, "基准线位于 35% 高度");

var ds = M.defaultSettings();
eq(ds.fontSize, 56, "默认字号 56px");
eq(ds.lineHeight, 1.8, "默认行距 1.8");
eq(ds.speed, 1, "默认速度 1x");
eq(ds.mirror, false, "默认镜像关");
eq(ds.showProgress, true, "默认显示进度条");

eq(M.clampNum("abc", 56, 24, 120), 56, "非法输入取默认");
eq(M.clampNum(999, 56, 24, 120), 120, "超限取上界");
eq(M.esc('<b>&"'), "&lt;b&gt;&amp;&quot;", "HTML 转义");

console.log("通过 " + pass + " / 失败 " + fail);
process.exit(fail === 0 ? 0 : 1);
