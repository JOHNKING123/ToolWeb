/* SRT 字幕编辑器纯逻辑单元测试（零依赖）：node tests/subtitle_editor.test.js
* 覆盖：
* 1. 时间戳解析（parseTimestamp：SRT 逗号 / VTT 点 / 无小时 / 非法）
* 2. 时间戳格式化（formatTimestamp：SRT/VTT/负值钳制/超长）
* 3. SRT 解析（parseSRT：标准/多行文本/无序号/CRLF/垃圾块跳过/非法时间跳过）
* 4. VTT 解析（parseVTT：WEBVTT 头/序号标识/NOTE 块/时间轴设置参数）
* 5. 格式识别（detectFormat）
* 6. 导出（exportSRT/exportVTT 往返一致性/重编号/空数组）
* 7. 全局平移（shiftAll ±2000 全条目/文本不变/负值钳制/原数组不变）
* 8. 单条微调（nudgeTimes ±0.5s/±1s）
* 9. 拆分（splitItem 中点/文本比例/非法）
* 10. 合并（mergeItems 顺序/文本拼接/空文本）
* 11. 杂项（makeItem/sortByStart/calcStats/formatDurShort/exportFilename/esc）
*/
"use strict";
var M = require("../static/js/subtitle_editor.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function deep(a, b, name) { ok(JSON.stringify(a) === JSON.stringify(b), name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }

/* ---------- 1. parseTimestamp ---------- */
eq(M.parseTimestamp("00:00:01,000"), 1000, "SRT 标准时间戳");
eq(M.parseTimestamp("00:01:23,456"), 83456, "分秒毫秒组合");
eq(M.parseTimestamp("01:02:03,004"), 3723004, "小时位");
eq(M.parseTimestamp("00:00:01.000"), 1000, "VTT 点分隔");
eq(M.parseTimestamp("00:01:23.456"), 83456, "VTT 点分隔分秒");
eq(M.parseTimestamp("01:23,456"), 83456, "无小时 MM:SS,mmm");
eq(M.parseTimestamp("01:23.456"), 83456, "无小时 MM:SS.mmm");
eq(M.parseTimestamp("00:00:00,000"), 0, "零时间戳");
eq(M.parseTimestamp("00:00:01,5"), 1500, "毫秒 1 位补零");
eq(M.parseTimestamp("00:00:01,05"), 1050, "毫秒 2 位补零");
eq(M.parseTimestamp(" 00:00:01,000 "), 1000, "首尾空白容忍");
eq(M.parseTimestamp("abc"), null, "非法字符串 null");
eq(M.parseTimestamp("00:00:01"), null, "缺毫秒 null");
eq(M.parseTimestamp(""), null, "空串 null");
eq(M.parseTimestamp(null), null, "null 输入 null");
eq(M.parseTimestamp("00:99:99,000"), null, "分秒超 59 非法");

/* ---------- 2. formatTimestamp ---------- */
eq(M.formatTimestamp(1000, "srt"), "00:00:01,000", "SRT 格式化");
eq(M.formatTimestamp(1000, "vtt"), "00:00:01.000", "VTT 格式化");
eq(M.formatTimestamp(0, "srt"), "00:00:00,000", "零格式化");
eq(M.formatTimestamp(83456, "srt"), "00:01:23,456", "分秒毫秒格式化");
eq(M.formatTimestamp(3723004, "vtt"), "01:02:03.004", "小时格式化");
eq(M.formatTimestamp(-500, "srt"), "00:00:00,000", "负值钳制为 0");
eq(M.formatTimestamp(1500.6, "srt"), "00:00:01,501", "小数四舍五入");
eq(M.formatTimestamp(36000000, "srt"), "10:00:00,000", "10 小时");
eq(M.formatTimestamp(M.parseTimestamp("02:34:56,789"), "vtt"), "02:34:56.789", "解析→VTT 往返");
eq(M.formatTimestamp(M.parseTimestamp("02:34:56.789"), "srt"), "02:34:56,789", "解析→SRT 往返");

/* ---------- 3. parseSRT ---------- */
var SRT_SAMPLE = "1\r\n00:00:01,000 --> 00:00:04,000\r\n第一条字幕\r\n\r\n" +
  "2\r\n00:00:05,500 --> 00:00:08,000\r\n第二条\r\n多行文本\r\n\r\n" +
  "3\r\n00:00:09,000 --> 00:00:12,500\r\n第三条\r\n";
var ps = M.parseSRT(SRT_SAMPLE);
eq(ps.length, 3, "SRT 3 条（含 CRLF）");
eq(ps[0].start, 1000, "SRT 第 1 条起点");
eq(ps[0].end, 4000, "SRT 第 1 条终点");
eq(ps[0].text, "第一条字幕", "SRT 第 1 条文本");
eq(ps[1].start, 5500, "SRT 第 2 条起点（毫秒）");
eq(ps[1].text, "第二条\n多行文本", "SRT 多行文本保留换行");
eq(ps[2].end, 12500, "SRT 第 3 条终点");

var psNoSeq = M.parseSRT("00:00:01,000 --> 00:00:04,000\n无序号条目\n\n00:00:05,000 --> 00:00:06,000\n另一条\n");
eq(psNoSeq.length, 2, "SRT 无序号仍可解析");

var psJunk = M.parseSRT("这是一段说明文字\n\n1\n00:00:01,000 --> 00:00:04,000\n有效条目\n\n垃圾块没有时间轴\n");
eq(psJunk.length, 1, "SRT 垃圾块被跳过");
eq(psJunk[0].text, "有效条目", "SRT 有效条目文本");

var psBadTime = M.parseSRT("1\n99:99:99,000 --> 00:00:04,000\n坏时间\n\n2\n00:00:05,000 --> 00:00:04,000\n终点早于起点\n");
eq(psBadTime.length, 0, "SRT 非法时间与倒置时间被跳过");
eq(M.parseSRT("").length, 0, "SRT 空输入 0 条");
eq(M.parseSRT("   \n\n  ").length, 0, "SRT 纯空白 0 条");

/* ---------- 4. parseVTT ---------- */
var VTT_SAMPLE = "WEBVTT\n\n" +
  "NOTE 这是注释块\n会被整体跳过\n\n" +
  "cue-1\n00:00:01.000 --> 00:00:04.000\n第一条 VTT\n\n" +
  "00:00:05.500 --> 00:00:08.000 align:start position:0%\n第二条带设置参数\n多行\n\n";
var pv = M.parseVTT(VTT_SAMPLE);
eq(pv.length, 2, "VTT 2 条（NOTE 跳过）");
eq(pv[0].start, 1000, "VTT 第 1 条起点");
eq(pv[0].end, 4000, "VTT 第 1 条终点");
eq(pv[0].text, "第一条 VTT", "VTT 序号标识行被跳过");
eq(pv[1].start, 5500, "VTT 第 2 条起点");
eq(pv[1].end, 8000, "VTT 终点设置参数被忽略");
eq(pv[1].text, "第二条带设置参数\n多行", "VTT 多行文本");
eq(M.parseVTT("WEBVTT\n").length, 0, "VTT 仅头 0 条");
eq(M.parseVTT("").length, 0, "VTT 空输入 0 条");

/* ---------- 5. detectFormat ---------- */
eq(M.detectFormat(SRT_SAMPLE), "srt", "SRT 文本识别为 srt");
eq(M.detectFormat(VTT_SAMPLE), "vtt", "WEBVTT 头识别为 vtt");
eq(M.detectFormat("00:00:01.000 --> 00:00:04.000\n点分隔无头"), "vtt", "点分隔时间轴识别为 vtt");
eq(M.detectFormat("纯文本没有时间轴"), null, "无时间轴识别为 null");
eq(M.detectFormat(""), null, "空识别为 null");

/* ---------- 6. 导出 ---------- */
var ITEMS = [
  {start: 1000, end: 4000, text: "第一条"},
  {start: 5500, end: 8000, text: "第二条\n多行"},
  {start: 9000, end: 12500, text: "第三条"}
];
var srtOut = M.exportSRT(ITEMS);
eq(srtOut, "1\n00:00:01,000 --> 00:00:04,000\n第一条\n\n2\n00:00:05,500 --> 00:00:08,000\n第二条\n多行\n\n3\n00:00:09,000 --> 00:00:12,500\n第三条\n", "SRT 导出格式（序号/时间戳/空行分隔）");
var vttOut = M.exportVTT(ITEMS);
ok(vttOut.indexOf("WEBVTT\n\n") === 0, "VTT 导出以 WEBVTT 头开头");
ok(vttOut.indexOf("00:00:01.000 --> 00:00:04.000") >= 0, "VTT 导出时间戳用点");
ok(vttOut.indexOf(",") < 0, "VTT 导出无逗号时间戳");
eq(M.exportSRT([]), "", "空数组导出 SRT 为空串");
eq(M.exportVTT([]), "WEBVTT\n", "空数组导出 VTT 仅头");

/* 导出→解析往返 */
deep(M.parseSRT(M.exportSRT(ITEMS)), ITEMS, "SRT 导出→解析往返一致");
deep(M.parseVTT(M.exportVTT(ITEMS)), ITEMS, "VTT 导出→解析往返一致");
deep(M.parseVTT(M.exportVTT(M.parseSRT(SRT_SAMPLE))), M.parseSRT(SRT_SAMPLE), "SRT→VTT 互转内容一致");
deep(M.parseSRT(M.exportSRT(M.parseVTT(VTT_SAMPLE))), M.parseVTT(VTT_SAMPLE), "VTT→SRT 互转内容一致");

/* 重编号：乱序序号导出后从 1 开始 */
var renum = M.exportSRT([{start: 0, end: 1000, text: "a"}, {start: 2000, end: 3000, text: "b"}]);
ok(renum.indexOf("1\n00:00:00,000") === 0 && renum.indexOf("\n2\n00:00:02,000") >= 0, "导出自动重编号");

/* ---------- 7. shiftAll 全局平移 ---------- */
var shifted = M.shiftAll(ITEMS, 2000);
deep([shifted[0].start, shifted[0].end, shifted[1].start, shifted[1].end, shifted[2].start, shifted[2].end],
  [3000, 6000, 7500, 10000, 11000, 14500], "全局 +2000ms 全条目时间平移");
deep(shifted.map(function (it) { return it.text; }), ["第一条", "第二条\n多行", "第三条"], "全局平移文本不变");
var shiftedNeg = M.shiftAll(ITEMS, -2000);
deep([shiftedNeg[0].start, shiftedNeg[0].end, shiftedNeg[1].start, shiftedNeg[1].end],
  [0, 2000, 3500, 6000], "全局 −2000ms 全条目时间平移（首条起点钳制 0）");
ok(shiftedNeg[0].end > shiftedNeg[0].start, "钳制后终点仍大于起点");
deep([ITEMS[0].start, ITEMS[0].end], [1000, 4000], "shiftAll 不修改原数组");
var shiftZero = M.shiftAll(ITEMS, 0);
deep(shiftZero, ITEMS, "平移 0 等价原数组（值相等）");
var shiftHuge = M.shiftAll([{start: 500, end: 1500, text: "x"}], -100000);
eq(shiftHuge[0].start, 0, "大幅提前起点钳制 0");
ok(shiftHuge[0].end > 0, "大幅提前终点仍有效");
eq(M.shiftAll([], 2000).length, 0, "空数组平移仍为空");

/* ---------- 8. nudgeTimes 单条微调 ---------- */
var n1 = M.nudgeTimes({start: 1000, end: 4000, text: "t"}, 500);
deep([n1.start, n1.end], [1500, 4500], "单条 +0.5s");
var n2 = M.nudgeTimes({start: 1000, end: 4000, text: "t"}, -500);
deep([n2.start, n2.end], [500, 3500], "单条 −0.5s");
var n3 = M.nudgeTimes({start: 1000, end: 4000, text: "t"}, 1000);
deep([n3.start, n3.end], [2000, 5000], "单条 +1s");
var n4 = M.nudgeTimes({start: 1000, end: 4000, text: "t"}, -1000);
deep([n4.start, n4.end], [0, 3000], "单条 −1s");
var n5 = M.nudgeTimes({start: 300, end: 800, text: "t"}, -1000);
eq(n5.start, 0, "单条提前超界起点钳制 0");
ok(n5.end > n5.start, "单条钳制后终点有效");
eq(M.nudgeTimes({start: 1000, end: 4000, text: "原文"}, 500).text, "原文", "单条微调文本不变");

/* ---------- 9. splitItem 拆分 ---------- */
var sp = M.splitItem({start: 0, end: 4000, text: "abcdefgh"}, 2000);
ok(sp !== null, "中点拆分成功");
deep([sp[0].start, sp[0].end], [0, 2000], "拆分前半时间");
deep([sp[1].start, sp[1].end], [2000, 4000], "拆分后半时间");
eq(sp[0].text + sp[1].text, "abcdefgh", "拆分文本无损拼接");
eq(sp[0].text, "abcd", "按时间比例切分文本（1/2）");
var sp2 = M.splitItem({start: 0, end: 4000, text: "abcdefgh"}, 1000);
eq(sp2[0].text, "ab", "按时间比例切分文本（1/4）");
eq(M.splitItem({start: 0, end: 4000, text: "x"}, 0), null, "切点在起点非法");
eq(M.splitItem({start: 0, end: 4000, text: "x"}, 4000), null, "切点在终点非法");
eq(M.splitItem({start: 0, end: 4000, text: "x"}, 9999), null, "切点越界非法");
var spEmpty = M.splitItem({start: 0, end: 2000, text: ""}, 1000);
ok(spEmpty !== null && spEmpty[0].text === "" && spEmpty[1].text === "", "空文本拆分不报错");

/* ---------- 10. mergeItems 合并 ---------- */
var mg = M.mergeItems({start: 1000, end: 4000, text: "前"}, {start: 5000, end: 8000, text: "后"});
deep([mg.start, mg.end], [1000, 8000], "合并取时间并集");
eq(mg.text, "前\n后", "合并文本换行拼接");
var mgRev = M.mergeItems({start: 5000, end: 8000, text: "后"}, {start: 1000, end: 4000, text: "前"});
eq(mgRev.text, "前\n后", "逆序合并文本仍按时间顺序");
deep([mgRev.start, mgRev.end], [1000, 8000], "逆序合并时间并集");
var mgOne = M.mergeItems({start: 1000, end: 4000, text: ""}, {start: 5000, end: 8000, text: "后"});
eq(mgOne.text, "后", "一方空文本合并不留空行");
var mgBoth = M.mergeItems({start: 1000, end: 4000, text: ""}, {start: 5000, end: 8000, text: ""});
eq(mgBoth.text, "", "双方空文本合并为空");

/* ---------- 11. 杂项 ---------- */
var mi = M.makeItem(5000, 3000, "t");
ok(mi.end > mi.start, "makeItem 终点早于起点自动修正");
eq(M.makeItem(-100, 2000, "t").start, 0, "makeItem 负起点钳制");
var sorted = M.sortByStart([{start: 9000, end: 9500, text: "c"}, {start: 1000, end: 2000, text: "a"}, {start: 5000, end: 6000, text: "b"}]);
deep(sorted.map(function (it) { return it.text; }), ["a", "b", "c"], "按开始时间排序");
var st = M.calcStats(ITEMS);
eq(st.count, 3, "统计条目数");
eq(st.durationMs, 12500, "统计总时长为末条终点");
eq(M.calcStats([]).durationMs, 0, "空数组总时长 0");
eq(M.formatDurShort(125000), "02:05", "时长格式化 MM:SS");
eq(M.formatDurShort(0), "00:00", "零时长格式化");
eq(M.exportFilename("movie.srt", "vtt"), "movie.vtt", "SRT 源导出 VTT 文件名");
eq(M.exportFilename("movie.vtt", "srt"), "movie.srt", "VTT 源导出 SRT 文件名");
eq(M.exportFilename("", "srt"), "subtitle.srt", "无源名默认文件名");
eq(M.esc('<b>&"'), "&lt;b&gt;&amp;&quot;", "HTML 转义");
eq(M.clampMs(-5), 0, "clampMs 负值");
eq(M.clampMs("abc"), 0, "clampMs 非法");
eq(M.normalizeText("a\r\nb\rc"), "a\nb\nc", "换行归一化");
eq(M.LS_KEY, "tw_subtitle_editor_v1", "localStorage 键名");

console.log("通过 " + pass + " / 失败 " + fail);
process.exit(fail === 0 ? 0 : 1);
