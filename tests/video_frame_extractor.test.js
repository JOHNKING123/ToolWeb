/* 视频帧提取器纯逻辑单元测试（零依赖）：node tests/video_frame_extractor.test.js
* 覆盖：
* 1. 时间点解析（parseTimestamp：hh:mm:ss.mmm / mm:ss.mmm / mm:ss / 纯秒小数 / 非法）
* 2. 时间戳格式化（formatTimestamp / formatFileTimestamp）
* 3. 时间点列表解析（parseTimestampList）
* 4. 等间隔抽帧时间点（evenTimepoints：单调递增、覆盖全片、边界）
* 5. 每 X 秒一帧（intervalTimepoints）
* 6. 差异度扫描采样点（scanTimepoints）
* 7. 相邻帧差异度算法（frameDiffScore：相同帧=0、全黑vs全白、归一化、降采样一致性）
* 8. Top K 降序（topKByDiff）
* 9. 帧文件名格式化（buildFileName / cleanStem）
* 10. 导出清单生成（buildExportList）
* 11. 基础工具（clampNum / esc）
* 12. 零上传：脚本内无 fetch/XHR/WebSocket/EventSource
*/
"use strict";
var fs = require("fs");
var M = require("../static/js/video_frame_extractor.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function near(a, b, tol, name) { ok(Math.abs(a - b) <= tol, name + "（期望≈" + b + "，实得 " + a + "）"); }

/* ---------- 1. parseTimestamp ---------- */
eq(M.parseTimestamp("00:01:23.500"), 83.5, "hh:mm:ss.mmm 解析");
eq(M.parseTimestamp("1:02:03"), 3723, "h:mm:ss 解析");
eq(M.parseTimestamp("01:23"), 83, "mm:ss 解析");
eq(M.parseTimestamp("01:23.456"), 83.456, "mm:ss.mmm 解析");
eq(M.parseTimestamp("83.5"), 83.5, "纯秒小数解析");
eq(M.parseTimestamp("90"), 90, "纯秒整数解析");
eq(M.parseTimestamp("  00:00:05  "), 5, "首尾空白容忍");
ok(isNaN(M.parseTimestamp("")), "空字符串非法");
ok(isNaN(M.parseTimestamp("abc")), "纯文本非法");
ok(isNaN(M.parseTimestamp("12:99")), "秒位≥60 非法");
ok(isNaN(M.parseTimestamp("1:2:3:4")), "四段非法");
ok(isNaN(M.parseTimestamp("-5")), "负数非法");
ok(isNaN(M.parseTimestamp("1:2:60")), "秒=60 非法");

/* ---------- 2. formatTimestamp / formatFileTimestamp ---------- */
eq(M.formatTimestamp(83.5), "01:23.500", "83.5s 格式化");
eq(M.formatTimestamp(3723.25), "01:02:03.250", "含小时格式化");
eq(M.formatTimestamp(0), "00:00.000", "0 格式化");
eq(M.formatFileTimestamp(3723.25), "01-02-03-250", "文件名时间戳无冒号点号");
ok(!/[:.]/.test(M.formatFileTimestamp(83.567)), "文件名时间戳无非法字符");

/* ---------- 3. parseTimestampList ---------- */
var pl = M.parseTimestampList("00:01:23.500\n01:23, 83.5；bad-time");
eq(pl.points.length, 3, "列表解析出 3 个有效点");
eq(pl.bad.length, 1, "列表检出 1 个非法项");
eq(pl.bad[0], "bad-time", "非法项原文保留");
var pl2 = M.parseTimestampList("");
eq(pl2.points.length, 0, "空列表 0 有效点");

/* ---------- 4. evenTimepoints ---------- */
var ev = M.evenTimepoints(100, 4);
eq(ev.length, 4, "100s 抽 4 帧");
near(ev[0], 20, 1e-9, "首帧 20s");
near(ev[3], 80, 1e-9, "末帧 80s");
var mono = true;
for (var i = 1; i < ev.length; i++) if (!(ev[i] > ev[i - 1])) mono = false;
ok(mono, "时间戳单调递增");
ok(ev[0] > 0 && ev[ev.length - 1] < 100, "覆盖全片（首>0、末<duration）");
eq(M.evenTimepoints(100, 0).length, 0, "N=0 返回空");
eq(M.evenTimepoints(0, 5).length, 0, "duration=0 返回空");
eq(M.evenTimepoints(100, 1).length, 1, "N=1 返回 1 帧");
near(M.evenTimepoints(100, 1)[0], 50, 1e-9, "N=1 取中点");

/* ---------- 5. intervalTimepoints ---------- */
var iv = M.intervalTimepoints(100, 30);
eq(iv.length, 3, "每 30s 一帧 → 3 帧");
near(iv[0], 30, 1e-9, "首帧 30s");
near(iv[2], 90, 1e-9, "末帧 90s");
eq(M.intervalTimepoints(100, 200).length, 0, "间隔超片长 → 0 帧");

/* ---------- 6. scanTimepoints ---------- */
var sc = M.scanTimepoints(10, 2);
eq(sc[0], 0.05, "扫描首帧 0.05s 兜底");
ok(sc.length >= 5, "10s/2s 采样 ≥5 点");
ok(sc[sc.length - 1] < 10, "采样点不越界");

/* ---------- 7. frameDiffScore ---------- */
function solidRGBA(w, h, r, g, b) {
  var a = new Uint8ClampedArray(w * h * 4);
  for (var i = 0; i < w * h; i++) { a[i * 4] = r; a[i * 4 + 1] = g; a[i * 4 + 2] = b; a[i * 4 + 3] = 255; }
  return a;
}
var black = solidRGBA(64, 64, 0, 0, 0);
var white = solidRGBA(64, 64, 255, 255, 255);
eq(M.frameDiffScore(black, black, 4), 0, "相同帧差异度为 0");
near(M.frameDiffScore(black, white, 4), 1, 0.01, "全黑vs全白差异度≈1");
var halfA = solidRGBA(64, 64, 0, 0, 0), halfB = solidRGBA(64, 64, 0, 0, 0);
for (var px = 0; px < 32 * 64; px++) { halfB[px * 4] = 255; halfB[px * 4 + 1] = 255; halfB[px * 4 + 2] = 255; }
var halfScore = M.frameDiffScore(halfA, halfB, 4);
ok(halfScore > 0.3 && halfScore < 0.7, "半帧变化差异度居中（实得 " + halfScore.toFixed(3) + "）");
ok(M.frameDiffScore(black, white, 4) >= 0 && M.frameDiffScore(black, white, 4) <= 1, "差异度归一化 0..1");
eq(M.frameDiffScore(black, new Uint8ClampedArray(10), 4), 0, "长度不等返回 0");
eq(M.frameDiffScore(black, white, 4), M.frameDiffScore(black, white, 8), "降采样步长不影响纯色帧结果");

/* ---------- 8. topKByDiff ---------- */
var frames = [
  { t: 1, score: 0.2 }, { t: 2, score: 0.9 }, { t: 3, score: 0.5 }, { t: 4, score: 0.7 }
];
var top2 = M.topKByDiff(frames, 2);
eq(top2.length, 2, "Top2 取出 2 帧");
eq(top2[0].t, 2, "首位为差异最大帧");
eq(top2[1].t, 4, "次位为差异次大帧");
eq(frames[0].t, 1, "原数组顺序不被修改");
eq(M.topKByDiff(frames, 99).length, 4, "k 越界钳制到全量");
eq(M.topKByDiff(frames, 0).length, 0, "k=0 返回空");
eq(M.topKByDiff([], 5).length, 0, "空输入返回空");

/* ---------- 9. buildFileName / cleanStem ---------- */
eq(M.buildFileName("我的视频.mp4", 83.5, "png"), "我的视频_frame_01-23-500.png", "文件名格式正确");
eq(M.buildFileName("a:b/c?.mp4", 5, "jpeg"), "a_b_c_frame_00-05-000.jpeg", "非法字符被替换");
eq(M.buildFileName("v", 3723.25, "PNG"), "v_frame_01-02-03-250.png", "扩展名小写归一化");
ok(!/[\\/:*?"<>|\s]/.test(M.buildFileName("x y:z", 1, "png")), "文件名无 Windows 非法字符");

/* ---------- 10. buildExportList ---------- */
var lst = M.buildExportList([{ t: 10, score: 0.8 }, { t: 20, score: 0.3 }], "demo.mp4", "png");
eq(lst.length, 2, "导出清单 2 项");
eq(lst[0].fileName, "demo_frame_00-10-000.png", "清单首项文件名");
eq(lst[1].t, 20, "清单保留时间戳");
eq(lst[0].score, 0.8, "清单保留差异度");

/* ---------- 11. 基础工具 ---------- */
eq(M.clampNum("abc", 12, 1, 200), 12, "clampNum 非法回退默认");
eq(M.clampNum(999, 12, 1, 200), 200, "clampNum 上限钳制");
eq(M.esc('<a href="x">&'), "&lt;a href=&quot;x&quot;&gt;&amp;", "esc 转义");
eq(M.cleanStem("a/b\\c:d.mp4"), "a_b_c_d", "cleanStem 清理");

/* ---------- 12. 零上传 ---------- */
var src = fs.readFileSync(__dirname + "/../static/js/video_frame_extractor.js", "utf8");
["fetch(", "XMLHttpRequest", "WebSocket", "EventSource", "$.ajax", "$.get("].forEach(function (kw) {
  ok(src.indexOf(kw) === -1, "脚本内无 " + kw);
});

console.log("\n通过 " + pass + " / " + (pass + fail) + "，失败 " + fail);
process.exit(fail ? 1 : 0);
