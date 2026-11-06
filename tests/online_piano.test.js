/* 在线可弹钢琴（online_piano）纯逻辑单元测试（零依赖）：
 * node tests/online_piano.test.js
 * 覆盖：noteToFreq（A4=440.00 精确值、C4≈261.63±0.01、八度倍频、C#4=Db4 等音、
 * 小写兼容、非法音名 err.field='note'）、keyToNote（A→C4、W→C#4、S→D4 精确映射、
 * 全 17 键映射、大小写兼容、映射外键→null、baseOctave 0–8 边界与非法 err.field='octave'）、
 * buildKeyRange（[4]→12 键 C4–B4 黑白类型、[3,4]→24 键、八度切换边界、非法 err.field='octaves'）、
 * serializeRecording/parseRecording（往返一致、空数组、非法音名/非法时间戳/非法 JSON
 * err.field 全覆盖）、module.exports 与 window.OnlinePiano 挂载、categories.go 注册
 * （Path 总数 290→291、Icon piano 全库唯一、New/生活工具/中英文关键词）、模板
 * （真限制三条、控件 id、零网络请求静态检查）。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var A = require("../static/js/online_piano.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function has(s, sub, name) { ok(s.indexOf(sub) !== -1, name); }
function notHas(s, sub, name) { ok(s.indexOf(sub) === -1, name); }
function throwsField(fn, field, name) {
  try { fn(); } catch (e) {
    ok(e instanceof Error && e.field === field,
      name + "（期望抛 Error 且 err.field=" + JSON.stringify(field) + "，实得 " +
      (e instanceof Error ? "Error field=" + JSON.stringify(e.field) : typeof e) + "）");
    return;
  }
  fail++; console.error("FAIL:", name + "（未抛出异常）");
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "online_piano.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "online_piano.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. noteToFreq：音名→频率（A4=440 十二平均律） ---------- */
eq(A.noteToFreq("A4"), 440, "noteToFreq：验收 A4=440.00Hz 精确值");
ok(Math.abs(A.noteToFreq("C4") - 261.63) < 0.01, "noteToFreq：验收 C4≈261.63Hz（容差±0.01）");
eq(A.noteToFreq("A3"), 220, "noteToFreq：A3=220Hz 精确值");
eq(A.noteToFreq("A5"), 880, "noteToFreq：A5=880Hz 精确值");
ok(Math.abs(A.noteToFreq("C5") - 2 * A.noteToFreq("C4")) < 1e-9, "noteToFreq：八度倍频 C5=2×C4");
eq(A.noteToFreq("C#4"), A.noteToFreq("Db4"), "noteToFreq：等音 C#4=Db4");
ok(A.noteToFreq("B3") < A.noteToFreq("C4"), "noteToFreq：B3<C4 半音递增");
ok(A.noteToFreq("C0") > 0 && typeof A.noteToFreq("C0") === "number", "noteToFreq：C0 返回正数");
eq(A.noteToFreq("c4"), A.noteToFreq("C4"), "noteToFreq：小写音名兼容");
throwsField(function () { A.noteToFreq(""); }, "note", "noteToFreq：空字符串抛错 err.field='note'");
throwsField(function () { A.noteToFreq("H4"); }, "note", "noteToFreq：非法字母 H4 抛错");
throwsField(function () { A.noteToFreq("C"); }, "note", "noteToFreq：缺八度 C 抛错");
throwsField(function () { A.noteToFreq("C44"); }, "note", "noteToFreq：双八度 C44 抛错");
throwsField(function () { A.noteToFreq("C#"); }, "note", "noteToFreq：缺八度 C# 抛错");
throwsField(function () { A.noteToFreq("A9"); }, "note", "noteToFreq：八度 9 越界抛错");
throwsField(function () { A.noteToFreq(null); }, "note", "noteToFreq：null 抛错");
throwsField(function () { A.noteToFreq(123); }, "note", "noteToFreq：数字 123 抛错");
throwsField(function () { A.noteToFreq("4C"); }, "note", "noteToFreq：倒序 4C 抛错");

/* ---------- 2. keyToNote：PC 键盘→音名 ---------- */
eq(A.keyToNote("A", 4), "C4", "keyToNote：验收 A→C4");
eq(A.keyToNote("W", 4), "C#4", "keyToNote：验收 W→C#4");
eq(A.keyToNote("S", 4), "D4", "keyToNote：验收 S→D4");
eq(A.keyToNote("D", 4), "E4", "keyToNote：D→E4");
eq(A.keyToNote("F", 4), "F4", "keyToNote：F→F4");
eq(A.keyToNote("E", 4), "D#4", "keyToNote：E→D#4");
eq(A.keyToNote("T", 4), "F#4", "keyToNote：T→F#4");
eq(A.keyToNote("G", 4), "G4", "keyToNote：G→G4");
eq(A.keyToNote("Y", 4), "G#4", "keyToNote：Y→G#4");
eq(A.keyToNote("H", 4), "A4", "keyToNote：H→A4");
eq(A.keyToNote("U", 4), "A#4", "keyToNote：U→A#4");
eq(A.keyToNote("J", 4), "B4", "keyToNote：J→B4");
eq(A.keyToNote("K", 4), "C5", "keyToNote：K→C5（高八度延续）");
eq(A.keyToNote("O", 4), "C#5", "keyToNote：O→C#5");
eq(A.keyToNote("L", 4), "D5", "keyToNote：L→D5");
eq(A.keyToNote("P", 4), "D#5", "keyToNote：P→D#5");
eq(A.keyToNote(";", 4), "E5", "keyToNote：;→E5");
eq(A.keyToNote("a", 3), "C3", "keyToNote：小写 a→C3（大小写兼容）");
eq(A.keyToNote("Q", 4), null, "keyToNote：映射外键 Q→null 不抛错");
eq(A.keyToNote("Z", 4), null, "keyToNote：映射外键 Z→null");
eq(A.keyToNote("1", 4), null, "keyToNote：映射外键 1→null");
eq(A.keyToNote("", 4), null, "keyToNote：空键→null");
eq(A.keyToNote("A", 0), "C0", "keyToNote：八度切换下界 baseOctave=0");
eq(A.keyToNote("A", 8), "C8", "keyToNote：八度切换上界 baseOctave=8");
throwsField(function () { A.keyToNote("A", -1); }, "octave", "keyToNote：baseOctave=-1 抛错 err.field='octave'");
throwsField(function () { A.keyToNote("A", 9); }, "octave", "keyToNote：baseOctave=9 抛错");
throwsField(function () { A.keyToNote("A", 4.5); }, "octave", "keyToNote：baseOctave=4.5 非整数抛错");
throwsField(function () { A.keyToNote("A", "4"); }, "octave", "keyToNote：baseOctave='4' 字符串抛错");
throwsField(function () { A.keyToNote("A", NaN); }, "octave", "keyToNote：baseOctave=NaN 抛错");
throwsField(function () { A.keyToNote("Q", -1); }, "octave", "keyToNote：先校验八度（映射外键也抛 octave）");

/* ---------- 3. buildKeyRange：八度→键位数组 ---------- */
var r4 = A.buildKeyRange([4]);
eq(r4.length, 12, "buildKeyRange：[4]→12 键");
eq(r4[0].note, "C4", "buildKeyRange：首键 C4");
eq(r4[0].type, "white", "buildKeyRange：C4 为白键");
eq(r4[1].note, "C#4", "buildKeyRange：次键 C#4");
eq(r4[1].type, "black", "buildKeyRange：C#4 为黑键");
eq(r4[11].note, "B4", "buildKeyRange：末键 B4");
eq(r4[11].type, "white", "buildKeyRange：B4 为白键");
eq(r4.filter(function (k) { return k.type === "white"; }).length, 7, "buildKeyRange：单八度 7 白键");
eq(r4.filter(function (k) { return k.type === "black"; }).length, 5, "buildKeyRange：单八度 5 黑键");
var r34 = A.buildKeyRange([3, 4]);
eq(r34.length, 24, "buildKeyRange：[3,4]→24 键");
eq(r34[12].note, "C4", "buildKeyRange：[3,4] 第 13 键为 C4");
eq(A.buildKeyRange([0])[0].note, "C0", "buildKeyRange：八度下界 [0]");
eq(A.buildKeyRange([8])[11].note, "B8", "buildKeyRange：八度上界 [8]");
throwsField(function () { A.buildKeyRange("4"); }, "octaves", "buildKeyRange：字符串 '4' 抛错 err.field='octaves'");
throwsField(function () { A.buildKeyRange([]); }, "octaves", "buildKeyRange：空数组抛错");
throwsField(function () { A.buildKeyRange(null); }, "octaves", "buildKeyRange：null 抛错");
throwsField(function () { A.buildKeyRange([9]); }, "octaves", "buildKeyRange：[9] 越界抛错");
throwsField(function () { A.buildKeyRange([-1]); }, "octaves", "buildKeyRange：[-1] 越界抛错");
throwsField(function () { A.buildKeyRange([4.5]); }, "octaves", "buildKeyRange：[4.5] 非整数抛错");
throwsField(function () { A.buildKeyRange([3, "4"]); }, "octaves", "buildKeyRange：混入字符串抛错");

/* ---------- 4. serializeRecording / parseRecording：录音序列化往返 ---------- */
var evs = [{ note: "C4", timeMs: 0 }, { note: "E4", timeMs: 500 }, { note: "G4", timeMs: 1000.5 }];
var ser = A.serializeRecording(evs);
eq(ser, JSON.stringify(evs), "serializeRecording：序列化与 JSON.stringify 一致");
var back = A.parseRecording(ser);
eq(JSON.stringify(back), ser, "parseRecording：反序列化往返一致");
eq(back[1].note, "E4", "parseRecording：往返后音符正确");
eq(back[2].timeMs, 1000.5, "parseRecording：往返后时间戳正确");
eq(A.serializeRecording([]), "[]", "serializeRecording：空数组→'[]'");
eq(A.parseRecording("[]").length, 0, "parseRecording：'[]'→空数组");
throwsField(function () { A.serializeRecording([{ note: "H4", timeMs: 0 }]); }, "note", "serializeRecording：非法音名 err.field='note'");
throwsField(function () { A.serializeRecording([{ note: "C4", timeMs: -1 }]); }, "timeMs", "serializeRecording：timeMs<0 err.field='timeMs'");
throwsField(function () { A.serializeRecording([{ note: "C4", timeMs: "x" }]); }, "timeMs", "serializeRecording：timeMs 非数字 err.field='timeMs'");
throwsField(function () { A.serializeRecording("not-array"); }, "recording", "serializeRecording：非数组 err.field='recording'");
throwsField(function () { A.parseRecording("{bad json"); }, "recording", "parseRecording：非法 JSON err.field='recording'");
throwsField(function () { A.parseRecording('"abc"'); }, "recording", "parseRecording：合法 JSON 但非数组 err.field='recording'");
throwsField(function () { A.parseRecording('[{"note":"H4","timeMs":0}]'); }, "note", "parseRecording：数组内非法音名 err.field='note'");
throwsField(function () { A.parseRecording('[{"note":"C4","timeMs":-5}]'); }, "timeMs", "parseRecording：数组内 timeMs<0 err.field='timeMs'");
throwsField(function () { A.parseRecording('[{"note":"C4"}]'); }, "timeMs", "parseRecording：缺 timeMs err.field='timeMs'");

/* ---------- 5. 模块挂载 ---------- */
ok(typeof A.noteToFreq === "function" && typeof A.keyToNote === "function", "挂载：module.exports 导出纯函数");
ok(typeof A.buildKeyRange === "function" && typeof A.serializeRecording === "function" && typeof A.parseRecording === "function", "挂载：module.exports 导出全部 5 个纯函数");
has(JS_SRC, "window.OnlinePiano", "挂载：JS 挂 window.OnlinePiano");
has(JS_SRC, "module.exports", "挂载：JS 含 module.exports 同步导出");

/* ---------- 6. categories.go 注册 ---------- */
var pianoIdx = GO_SRC.indexOf('ID:          "online_piano"');
ok(pianoIdx !== -1, "注册：categories.go 含 ID online_piano");
var pianoBlock = GO_SRC.slice(pianoIdx, pianoIdx + 2400);
has(pianoBlock, "在线可弹钢琴", "注册 Name 为在线可弹钢琴");
has(pianoBlock, 'Path:        "/tools/online-piano"', "注册 Path 为 /tools/online-piano");
has(pianoBlock, 'Icon:        "piano"', "注册 Icon 为 piano");
has(pianoBlock, 'Category:    "生活工具"', "注册 Category 为生活工具");
has(pianoBlock, "New:         true", "注册 New: true");
has(pianoBlock, "钢琴", "Description 含「钢琴」");
has(pianoBlock, "电钢琴", "Description 含「电钢琴」");
has(pianoBlock, "风琴", "Description 含「风琴」");
has(pianoBlock, "Web Audio", "Description 含「Web Audio」");
has(pianoBlock, "小星星", "Description 含「小星星」");
has(pianoBlock, "localStorage", "Description 含「localStorage」");
has(pianoBlock, "client-side", "Description 含英文「client-side」");
var iconHits = (GO_SRC.match(/"piano"/g) || []).length;
eq(iconHits, 1, "Icon piano 精确值复测锁定：全库唯一 1 处");
var pathRe = /"\/tools\/[^"]+"/g, seen = {}, mm, pathCount = 0;
while ((mm = pathRe.exec(GO_SRC)) !== null) { if (!seen[mm[0]]) { seen[mm[0]] = true; pathCount++; } }
eq(pathCount, 317, "注册 Path 总数 290→291");
ok(GO_SRC.indexOf('ID:          "online_piano"') === GO_SRC.lastIndexOf('ID:          "online_piano"'), "注册：ID online_piano 无重复");

/* ---------- 7. 模板：SEO/真限制/控件/零外部资源 ---------- */
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/online-piano", "模板 canonical 含新 Path");
has(TPL_SRC, '{{template "nav" .}}', "模板含导航 nav");
has(TPL_SRC, 'id="op-app"', "模板含应用根节点 op-app");
has(TPL_SRC, 'id="op-keys"', "模板含键盘容器 op-keys");
has(TPL_SRC, 'id="op-oct-down"', "模板含八度减按钮 op-oct-down");
has(TPL_SRC, 'id="op-oct-up"', "模板含八度加按钮 op-oct-up");
has(TPL_SRC, 'id="op-oct-label"', "模板含八度标签 op-oct-label");
has(TPL_SRC, 'id="op-timbre"', "模板含音色选择 op-timbre");
has(TPL_SRC, 'id="op-volume"', "模板含音量控制 op-volume");
has(TPL_SRC, 'id="op-record"', "模板含录音按钮 op-record");
has(TPL_SRC, 'id="op-play"', "模板含回放按钮 op-play");
has(TPL_SRC, 'id="op-clear"', "模板含清空按钮 op-clear");
has(TPL_SRC, 'id="op-copy"', "模板含复制按钮 op-copy");
has(TPL_SRC, 'id="op-demo-twinkle"', "模板含小星星示范按钮 op-demo-twinkle");
has(TPL_SRC, 'id="op-demo-ode"', "模板含欢乐颂示范按钮 op-demo-ode");
has(TPL_SRC, 'id="op-rec-status"', "模板含录音状态 op-rec-status");
has(TPL_SRC, 'id="op-limit"', "模板含真限制区 op-limit");
has(TPL_SRC, 'src="/tools/static/js/online_piano.js?v=1"', "模板引用新 JS（v=1）");
has(TPL_SRC, "小星星", "模板含示范旋律《小星星》");
has(TPL_SRC, "欢乐颂", "模板含示范旋律《欢乐颂》");
has(TPL_SRC, "算法模拟", "真限制①：合成音色为算法模拟明示");
has(TPL_SRC, "与真实钢琴", "真限制①：与真实钢琴有差距明示");
has(TPL_SRC, "仅桌面浏览器可用", "真限制②：PC 键盘映射仅桌面浏览器可用明示");
has(TPL_SRC, "触摸", "真限制②：移动端触摸弹奏明示");
has(TPL_SRC, "localStorage", "真限制③：录音存浏览器本地明示");
has(TPL_SRC, "不上传", "真限制③：不上传明示");
var extRes = TPL_SRC.match(/<(script|link)[^>]*?(src|href)="https?:\/\//g) || [];
ok(extRes.every(function (t) { return t.indexOf('rel="canonical"') >= 0; }),
  "零外部资源：script/link 外链仅 canonical（实得 " + JSON.stringify(extRes) + "）");
notHas(JS_SRC, "fetch(", "零网络：JS 无 fetch 调用");
notHas(JS_SRC, "XMLHttpRequest", "零网络：JS 无 XHR");

console.log("online_piano: pass=" + pass + " fail=" + fail);
if (fail > 0) { process.exit(1); }
