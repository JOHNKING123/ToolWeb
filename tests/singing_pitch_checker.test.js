/* 唱歌音准检测纯函数单元测试（零依赖）：node tests/singing_pitch_checker.test.js
* 覆盖：freqToMidi（锚点 440→69、880→81、261.63→60）、midiToFreq（锚点
* 69→440、60→261.63、57→220）、freqToNoteName（锚点 440→A4/69/0 音分、
* 445→A4/+20、415.3→G#4、466.16→A#4）、centsBetween（锚点 (880,440)→1200、
* (415.3,440)→−100）、targetCents（锚点 (470,'A4')→114、(415,'A4')→−101、(440,'A4')→0；
* scorePitchSession（锚点 [0,10,20,50]→{avgAbsCents:20, inTunePct:75, grade A}）、
* parseNoteName（锚点 A4/C#5/Gb3）、validatePitchConfig（mode/targetNote/tolerance）、
* validatePitchState（samples 数组、≤600）、formatCents（锚点 12→"+12 音分"）、
* detectPitch（合成正弦 440/220/880 Hz、静音/噪声/超范围返回 null；额外导出，
* 非契约十函数）、非法参数 err.field、categories.go 注册（Path
* 总数 314→315、Icon record_voice_over 全库唯一、紧邻 metronome）、模板（SEO
* 关键词、真限制四条、控件、互链单向、零外部资源静态检查）、浏览器绑定源码级
* 检查（getUserMedia＋AnalyserNode 时域自相关、0.5s 唱稳计分、目标模式以 targetCents 与目标音的偏差计分、localStorage
* 最近 10 次成绩）。
*/
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/singing_pitch_checker.js");

var pass = 0, fail = 0;
function ok(cond, name) {
if (cond) { pass++; }
else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function eqj(a, b, name) { eq(JSON.stringify(a), JSON.stringify(b), name); }
function approx(a, b, eps, name) { ok(Math.abs(a - b) <= eps, name + "（期望≈" + b + "±" + eps + "，实得 " + a + "）"); }
function has(s, sub, name) { ok(s.indexOf(sub) !== -1, name + "（缺 " + sub + "）"); }
function notHas(s, sub, name) { ok(s.indexOf(sub) === -1, name + "（不应含 " + sub + "）"); }
function throws(fn, field, name) {
try { fn(); ok(false, name + "（应抛错却未抛）"); }
catch (e) { ok(!field || e.field === field, name + "（err.field 期望 " + field + "，实得 " + e.field + "）"); }
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "singing_pitch_checker.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "singing_pitch_checker.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");
var MT_TPL = fs.readFileSync(path.join(ROOT, "templates", "metronome.html"), "utf8");

/* ---------- 1. freqToMidi ---------- */
eq(M.freqToMidi(440), 69, "freqToMidi：440→69");
eq(M.freqToMidi(880), 81, "freqToMidi：880→81");
eq(M.freqToMidi(220), 57, "freqToMidi：220→57");
eq(M.freqToMidi(261.63), 60, "freqToMidi：261.63→60");
approx(M.freqToMidi(466.16), 70, 0.01, "freqToMidi：466.16≈70");
throws(function () { M.freqToMidi(0); }, "freq", "freqToMidi：0 抛错 err.field='freq'");
throws(function () { M.freqToMidi(-440); }, "freq", "freqToMidi：负数抛错");
throws(function () { M.freqToMidi(NaN); }, "freq", "freqToMidi：NaN 抛错");
throws(function () { M.freqToMidi("440"); }, "freq", "freqToMidi：字符串抛错");
throws(function () { M.freqToMidi(Infinity); }, "freq", "freqToMidi：Infinity 抛错");

/* ---------- 2. midiToFreq ---------- */
eq(M.midiToFreq(69), 440, "midiToFreq：69→440");
eq(M.midiToFreq(60), 261.63, "midiToFreq：60→261.63");
eq(M.midiToFreq(57), 220, "midiToFreq：57→220");
eq(M.midiToFreq(81), 880, "midiToFreq：81→880");
eq(M.midiToFreq(48), 130.81, "midiToFreq：48（C3）→130.81");
eq(M.midiToFreq(84), 1046.5, "midiToFreq：84（C6）→1046.5");
throws(function () { M.midiToFreq(69.5); }, "midi", "midiToFreq：69.5 非整数抛错 err.field='midi'");
throws(function () { M.midiToFreq(-1); }, "midi", "midiToFreq：-1 抛错");
throws(function () { M.midiToFreq(128); }, "midi", "midiToFreq：128 抛错");
throws(function () { M.midiToFreq("69"); }, "midi", "midiToFreq：字符串抛错");
throws(function () { M.midiToFreq(NaN); }, "midi", "midiToFreq：NaN 抛错");

/* ---------- 3. freqToNoteName ---------- */
eqj(M.freqToNoteName(440), { name: "A", octave: 4, midi: 69, cents: 0 }, "freqToNoteName：440→A4/69/0 音分");
eqj(M.freqToNoteName(445), { name: "A", octave: 4, midi: 69, cents: 20 }, "freqToNoteName：445→A4/+20 音分");
eqj(M.freqToNoteName(415.3), { name: "G#", octave: 4, midi: 68, cents: 0 }, "freqToNoteName：415.3→G#4/68/0 音分");
eqj(M.freqToNoteName(466.16), { name: "A#", octave: 4, midi: 70, cents: 0 }, "freqToNoteName：466.16→A#4/70/0 音分");
eqj(M.freqToNoteName(261.63), { name: "C", octave: 4, midi: 60, cents: 0 }, "freqToNoteName：261.63→C4/60/0 音分");
eqj(M.freqToNoteName(523.25), { name: "C", octave: 5, midi: 72, cents: 0 }, "freqToNoteName：523.25→C5/72/0 音分");
eqj(M.freqToNoteName(130.81), { name: "C", octave: 3, midi: 48, cents: 0 }, "freqToNoteName：130.81→C3/48/0 音分");
throws(function () { M.freqToNoteName(0); }, "freq", "freqToNoteName：0 抛错 err.field='freq'");
throws(function () { M.freqToNoteName(-100); }, "freq", "freqToNoteName：负数抛错");
throws(function () { M.freqToNoteName(NaN); }, "freq", "freqToNoteName：NaN 抛错");
throws(function () { M.freqToNoteName(5); }, "freq", "freqToNoteName：5Hz 超出 MIDI 范围抛错");

/* ---------- 4. centsBetween ---------- */
eq(M.centsBetween(440, 440), 0, "centsBetween：(440,440)→0");
eq(M.centsBetween(880, 440), 1200, "centsBetween：(880,440)→1200");
eq(M.centsBetween(220, 440), -1200, "centsBetween：(220,440)→-1200");
eq(M.centsBetween(415.3, 440), -100, "centsBetween：(415.3,440)→-100");
eq(M.centsBetween(445, 440), 20, "centsBetween：(445,440)→20");
throws(function () { M.centsBetween(0, 440); }, "frequency", "centsBetween：freq=0 抛错 err.field='frequency'");
throws(function () { M.centsBetween(440, 0); }, "frequency", "centsBetween：targetFreq=0 抛错");
throws(function () { M.centsBetween(NaN, 440); }, "frequency", "centsBetween：NaN freq 抛错");
throws(function () { M.centsBetween(440, NaN); }, "frequency", "centsBetween：NaN targetFreq 抛错");
throws(function () { M.centsBetween("440", 440); }, "frequency", "centsBetween：字符串 freq 抛错");

/* ---------- 4b. targetCents：与目标音的偏差（目标模式计分基准） ---------- */
eq(M.targetCents(470, "A4"), 114, "targetCents：(470,'A4')→114（反例：最近音 A#4 仅 +14，目标音实为 +114 应判 D）");
eq(M.targetCents(415, "A4"), -101, "targetCents：(415,'A4')→-101（反例：最近音 G#4 仅 -1，目标音实为 -101 应判 D）");
eq(M.targetCents(440, "A4"), 0, "targetCents：(440,'A4')→0");
eq(M.targetCents(880, "A4"), 1200, "targetCents：(880,'A4')→1200（高八度）");
eq(M.targetCents(220, "A4"), -1200, "targetCents：(220,'A4')→-1200（低八度）");
eq(M.targetCents(261.63, "C4"), 0, "targetCents：(261.63,'C4')→0");
eq(M.targetCents(523.25, "C5"), 0, "targetCents：(523.25,'C5')→0");
eq(M.targetCents(445, "A4"), 20, "targetCents：(445,'A4')→20（半音内与最近音口径一致）");
eq(M.gradePitch(Math.abs(M.targetCents(470, "A4"))).grade, "D", "targetCents 反例复核：470Hz 对目标 A4 判 D 跑调（非 A）");
eq(M.gradePitch(Math.abs(M.targetCents(415, "A4"))).grade, "D", "targetCents 反例复核：415Hz 对目标 A4 判 D 跑调（非 S）");
throws(function () { M.targetCents(0, "A4"); }, "freq", "targetCents：freq=0 抛错 err.field='freq'");
throws(function () { M.targetCents(-440, "A4"); }, "freq", "targetCents：负数 freq 抛错");
throws(function () { M.targetCents(NaN, "A4"); }, "freq", "targetCents：NaN freq 抛错");
throws(function () { M.targetCents(440, "H4"); }, "note", "targetCents：非法 targetNote 抛错 err.field='note'");
throws(function () { M.targetCents(440, ""); }, "note", "targetCents：空 targetNote 抛错");
throws(function () { M.targetCents(440, 69); }, "note", "targetCents：数字 targetNote 抛错");

/* ---------- 5. gradePitch：边界 ---------- */
eqj(M.gradePitch(0), { grade: "S", label: "完美" }, "gradePitch：0→S 完美");
eqj(M.gradePitch(10), { grade: "S", label: "完美" }, "gradePitch：10→S 完美");
eqj(M.gradePitch(11), { grade: "A", label: "优秀" }, "gradePitch：11→A 优秀");
eqj(M.gradePitch(25), { grade: "A", label: "优秀" }, "gradePitch：25→A 优秀");
eqj(M.gradePitch(26), { grade: "B", label: "良好" }, "gradePitch：26→B 良好");
eqj(M.gradePitch(50), { grade: "B", label: "良好" }, "gradePitch：50→B 良好");
eqj(M.gradePitch(51), { grade: "C", label: "一般" }, "gradePitch：51→C 一般");
eqj(M.gradePitch(100), { grade: "C", label: "一般" }, "gradePitch：100→C 一般");
eqj(M.gradePitch(101), { grade: "D", label: "跑调" }, "gradePitch：101→D 跑调");
eqj(M.gradePitch(500), { grade: "D", label: "跑调" }, "gradePitch：500→D 跑调");
throws(function () { M.gradePitch(-1); }, "cents", "gradePitch：负数抛错 err.field='cents'");
throws(function () { M.gradePitch(NaN); }, "cents", "gradePitch：NaN 抛错");
throws(function () { M.gradePitch("10"); }, "cents", "gradePitch：字符串抛错");

/* ---------- 6. scorePitchSession ---------- */
eqj(M.scorePitchSession([0, 10, 20, 50]), { avgAbsCents: 20, inTunePct: 75, grade: { grade: "A", label: "优秀" } }, "scorePitchSession：[0,10,20,50]→{avgAbsCents:20, inTunePct:75, grade A}");
eqj(M.scorePitchSession([0]), { avgAbsCents: 0, inTunePct: 100, grade: { grade: "S", label: "完美" } }, "scorePitchSession：[0]→{avgAbsCents:0, inTunePct:100, grade S}");
eqj(M.scorePitchSession([150, -200]), { avgAbsCents: 175, inTunePct: 0, grade: { grade: "D", label: "跑调" } }, "scorePitchSession：[150,-200]→{avgAbsCents:175, inTunePct:0, grade D}");
eqj(M.scorePitchSession([-5, 5]), { avgAbsCents: 5, inTunePct: 100, grade: { grade: "S", label: "完美" } }, "scorePitchSession：[-5,5]→平均 5、准音率 100%、S");
eqj(M.scorePitchSession([26, 30]), { avgAbsCents: 28, inTunePct: 0, grade: { grade: "B", label: "良好" } }, "scorePitchSession：[26,30]→平均 28、准音率 0%、B");
throws(function () { M.scorePitchSession([]); }, "samples", "scorePitchSession：空数组抛错 err.field='samples'");
throws(function () { M.scorePitchSession("x"); }, "samples", "scorePitchSession：非数组抛错");
throws(function () { M.scorePitchSession([0, NaN]); }, "samples", "scorePitchSession：NaN 样本抛错");

/* ---------- 7. parseNoteName ---------- */
eqj(M.parseNoteName("A4"), { name: "A", octave: 4, midi: 69 }, "parseNoteName：A4→{name:'A', octave:4, midi:69}");
eqj(M.parseNoteName("C#5"), { name: "C#", octave: 5, midi: 73 }, "parseNoteName：C#5→midi 73");
eqj(M.parseNoteName("Gb3"), { name: "F#", octave: 3, midi: 54 }, "parseNoteName：Gb3→midi 54（规范化 F#3）");
eqj(M.parseNoteName("C3"), { name: "C", octave: 3, midi: 48 }, "parseNoteName：C3→midi 48（目标音下限）");
eqj(M.parseNoteName("C6"), { name: "C", octave: 6, midi: 84 }, "parseNoteName：C6→midi 84（目标音上限）");
eqj(M.parseNoteName("a4"), { name: "A", octave: 4, midi: 69 }, "parseNoteName：小写 a4→69");
eqj(M.parseNoteName("Bb3"), { name: "A#", octave: 3, midi: 58 }, "parseNoteName：Bb3→midi 58（规范化 A#3）");
eqj(M.parseNoteName("Cb4"), { name: "B", octave: 3, midi: 59 }, "parseNoteName：Cb4→B3/midi 59（跨八度）");
throws(function () { M.parseNoteName("H4"); }, "note", "parseNoteName：H4 抛错 err.field='note'");
throws(function () { M.parseNoteName("A9"); }, "note", "parseNoteName：A9（midi 129）抛错");
throws(function () { M.parseNoteName("A"); }, "note", "parseNoteName：缺八度抛错");
throws(function () { M.parseNoteName(""); }, "note", "parseNoteName：空串抛错");
throws(function () { M.parseNoteName("A#4x"); }, "note", "parseNoteName：多余字符抛错");
throws(function () { M.parseNoteName(69); }, "note", "parseNoteName：数字抛错");
throws(function () { M.parseNoteName("C10"); }, "note", "parseNoteName：C10（midi 132）抛错");

/* ---------- 8. validatePitchConfig ---------- */
eqj(M.validatePitchConfig(), { mode: "free", targetNote: "A4", tolerance: 25 }, "validatePitchConfig：缺省→{mode:'free', targetNote:'A4', tolerance:25}");
eqj(M.validatePitchConfig(null), { mode: "free", targetNote: "A4", tolerance: 25 }, "validatePitchConfig：null→缺省");
eqj(M.validatePitchConfig({}), { mode: "free", targetNote: "A4", tolerance: 25 }, "validatePitchConfig：{}→缺省");
eqj(M.validatePitchConfig({ mode: "free", tolerance: 25 }), { mode: "free", targetNote: "A4", tolerance: 25 }, "validatePitchConfig：{mode:'free', tolerance:25} 通过");
eqj(M.validatePitchConfig({ mode: "target", targetNote: "C4", tolerance: 25 }), { mode: "target", targetNote: "C4", tolerance: 25 }, "validatePitchConfig：{mode:'target', targetNote:'C4', tolerance:25} 通过");
eqj(M.validatePitchConfig({ mode: "target", targetNote: "c#5", tolerance: 50 }), { mode: "target", targetNote: "C#5", tolerance: 50 }, "validatePitchConfig：小写 c#5 规范化为 C#5");
eqj(M.validatePitchConfig({ mode: "free", targetNote: "Gb3", tolerance: 10 }), { mode: "free", targetNote: "F#3", tolerance: 10 }, "validatePitchConfig：Gb3 规范化为 F#3");
throws(function () { M.validatePitchConfig({ mode: "x" }); }, "mode", "validatePitchConfig：mode='x' 抛错 err.field='mode'");
throws(function () { M.validatePitchConfig({ mode: "target" }); }, "targetNote", "validatePitchConfig：target 模式缺 targetNote 抛错 err.field='targetNote'");
throws(function () { M.validatePitchConfig({ mode: "target", targetNote: "C2", tolerance: 25 }); }, "targetNote", "validatePitchConfig：targetNote C2 超出 C3–C6 抛错");
throws(function () { M.validatePitchConfig({ mode: "target", targetNote: "C7", tolerance: 25 }); }, "targetNote", "validatePitchConfig：targetNote C7 超出 C3–C6 抛错");
throws(function () { M.validatePitchConfig({ mode: "target", targetNote: "H4", tolerance: 25 }); }, "targetNote", "validatePitchConfig：非法 targetNote 抛错");
throws(function () { M.validatePitchConfig({ mode: "free", tolerance: 200 }); }, "tolerance", "validatePitchConfig：tolerance=200 抛错 err.field='tolerance'");
throws(function () { M.validatePitchConfig({ mode: "free", tolerance: 4 }); }, "tolerance", "validatePitchConfig：tolerance=4 抛错");
throws(function () { M.validatePitchConfig({ mode: "free", tolerance: "25" }); }, "tolerance", "validatePitchConfig：字符串 tolerance 抛错");
throws(function () { M.validatePitchConfig("x"); }, "config", "validatePitchConfig：字符串 config 抛错 err.field='config'");
throws(function () { M.validatePitchConfig([1]); }, "config", "validatePitchConfig：数组 config 抛错");

/* ---------- 9. validatePitchState ---------- */
eqj(M.validatePitchState({ samples: [] }), { samples: [] }, "validatePitchState：空 samples 通过");
eqj(M.validatePitchState({ samples: [0, 10, -20] }), { samples: [0, 10, -20] }, "validatePitchState：[0,10,-20] 通过");
var s600 = [];
for (var si = 0; si < 600; si++) s600.push(si % 50);
eq(M.validatePitchState({ samples: s600 }).samples.length, 600, "validatePitchState：600 项 samples 通过（上限）");
var s601 = s600.concat([0]);
throws(function () { M.validatePitchState({ samples: s601 }); }, "samples", "validatePitchState：601 项 samples 抛错 err.field='samples'");
throws(function () { M.validatePitchState(null); }, "state", "validatePitchState：null 抛错 err.field='state'");
throws(function () { M.validatePitchState({}); }, "samples", "validatePitchState：缺 samples 抛错 err.field='samples'");
throws(function () { M.validatePitchState({ samples: "x" }); }, "samples", "validatePitchState：samples 非数组抛错");
throws(function () { M.validatePitchState({ samples: [0, NaN] }); }, "samples", "validatePitchState：NaN 样本抛错");

/* ---------- 10. formatCents ---------- */
eq(M.formatCents(0), "0 音分", "formatCents：0→\"0 音分\"");
eq(M.formatCents(12), "+12 音分", "formatCents：12→\"+12 音分\"");
eq(M.formatCents(-8), "-8 音分", "formatCents：-8→\"-8 音分\"");
eq(M.formatCents(12.6), "+13 音分", "formatCents：12.6→\"+13 音分\"（四舍五入）");
eq(M.formatCents(-12.6), "-13 音分", "formatCents：-12.6→\"-13 音分\"");
eq(M.formatCents(0.4), "0 音分", "formatCents：0.4→\"0 音分\"");
eq(M.formatCents(-0.4), "0 音分", "formatCents：-0.4→\"0 音分\"（-0 归一）");
throws(function () { M.formatCents(NaN); }, "cents", "formatCents：NaN 抛错 err.field='cents'");
throws(function () { M.formatCents("12"); }, "cents", "formatCents：字符串抛错");
throws(function () { M.formatCents(Infinity); }, "cents", "formatCents：Infinity 抛错");

/* ---------- 11. detectPitch：合成正弦验证 ---------- */
function sine(freq, sr, n, amp) {
var buf = new Float32Array(n);
for (var i = 0; i < n; i++) buf[i] = (amp || 0.5) * Math.sin(2 * Math.PI * freq * i / sr);
return buf;
}
var r440 = M.detectPitch(sine(440, 44100, 4096), 44100);
ok(r440 !== null, "detectPitch：440Hz 正弦检出非 null");
approx(r440.freq, 440, 2, "detectPitch：440Hz 正弦→≈440Hz");
ok(r440.confidence >= 0.9, "detectPitch：440Hz 正弦置信度≥0.9（实得 " + r440.confidence + "）");
var r220 = M.detectPitch(sine(220, 44100, 4096), 44100);
ok(r220 !== null, "detectPitch：220Hz 正弦检出非 null");
approx(r220.freq, 220, 2, "detectPitch：220Hz 正弦→≈220Hz");
var r880 = M.detectPitch(sine(880, 44100, 4096), 44100);
ok(r880 !== null, "detectPitch：880Hz 正弦检出非 null");
approx(r880.freq, 880, 3, "detectPitch：880Hz 正弦→≈880Hz");
var r523 = M.detectPitch(sine(523.25, 44100, 4096), 44100);
ok(r523 !== null, "detectPitch：523.25Hz（C5）正弦检出非 null");
approx(r523.freq, 523.25, 3, "detectPitch：523.25Hz 正弦→≈523.25Hz");
eq(M.detectPitch(new Float32Array(4096), 44100), null, "detectPitch：全零静音→null");
eq(M.detectPitch(sine(440, 44100, 4096, 0.001), 44100), null, "detectPitch：极小振幅（RMS<0.01）→null");
eq(M.detectPitch(sine(40, 44100, 4096), 44100), null, "detectPitch：40Hz 超出 50Hz 下限→null");
throws(function () { M.detectPitch(sine(440, 44100, 512), 44100); }, "buffer", "detectPitch：512 采样过短抛错 err.field='buffer'");
throws(function () { M.detectPitch(sine(440, 44100, 4096), 0); }, "sampleRate", "detectPitch：sampleRate=0 抛错 err.field='sampleRate'");
throws(function () { M.detectPitch(sine(440, 44100, 4096), NaN); }, "sampleRate", "detectPitch：sampleRate NaN 抛错");
var badBuf = sine(440, 44100, 4096);
badBuf[100] = NaN;
throws(function () { M.detectPitch(badBuf, 44100); }, "buffer", "detectPitch：含 NaN 采样抛错 err.field='buffer'");

/* ---------- 12. categories.go 注册 ---------- */
var pathCount = (GO_SRC.match(/"\/tools\/[^"]+"/g) || []).filter(function (v, i, a) { return a.indexOf(v) === i; }).length;
eq(pathCount, 322, "注册 Path 总数 314→315");
has(GO_SRC, '"singing_pitch_checker"', "注册：ID singing_pitch_checker");
has(GO_SRC, '"/tools/singing-pitch-checker"', "注册：Path /tools/singing-pitch-checker");
has(GO_SRC, '"record_voice_over"', "注册：Icon record_voice_over");
eq((GO_SRC.match(/Icon:\s*"record_voice_over"/g) || []).length, 1, "Icon record_voice_over 全库唯一");
var entryBlock = GO_SRC.slice(GO_SRC.indexOf('"singing_pitch_checker"') - 60,
GO_SRC.indexOf('"singing_pitch_checker"') + 1600);
ok(/New:\s+true/.test(entryBlock), "注册：New: true");
ok(/Category:\s+"音频处理"/.test(entryBlock), "注册：类目 音频处理");
has(entryBlock, "唱歌音准检测", "注册：名称 唱歌音准检测");
has(entryBlock, "目标音", "注册：描述含 目标音");
has(entryBlock, "自相关", "注册：描述含 自相关");
ok(GO_SRC.indexOf('"singing_pitch_checker"') > GO_SRC.indexOf('"metronome"') &&
GO_SRC.indexOf('"singing_pitch_checker"') < GO_SRC.indexOf('"slowed_reverb"'), "注册：紧邻 metronome（在其后、slowed_reverb 之前）");

/* ---------- 13. 模板：SEO/真限制/控件/互链/零外部资源 ---------- */
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/singing-pitch-checker", "模板 canonical 含新 Path");
has(TPL_SRC, "唱歌音准检测", "模板：标题含工具名");
has(TPL_SRC, "唱歌音准测试", "模板 SEO：关键词含 唱歌音准测试");
has(TPL_SRC, "音准检测", "模板 SEO：关键词含 音准检测");
has(TPL_SRC, "唱歌跑调测试", "模板 SEO：关键词含 唱歌跑调测试");
has(TPL_SRC, "singing pitch test", "模板 SEO：关键词含 singing pitch test");
has(TPL_SRC, "真限制", "模板：真限制章节");
has(TPL_SRC, "自相关基频检测精度受环境噪声", "真限制①：精度受噪声/麦克风/混响影响");
has(TPL_SRC, "不可作专业声乐鉴定", "真限制①：仅供练唱参考");
has(TPL_SRC, "拒绝授权则无法实时检测", "真限制②：拒授则对照表仍可用");
has(TPL_SRC, "50–1000 Hz", "真限制③：有效范围 50–1000 Hz");
has(TPL_SRC, "只存本机 localStorage", "真限制④：成绩只存本机");
has(TPL_SRC, 'id="sp-start"', "模板控件：开始按钮 sp-start");
has(TPL_SRC, 'id="sp-mode-free"', "模板控件：自由练唱 sp-mode-free");
has(TPL_SRC, 'id="sp-mode-target"', "模板控件：目标音练习 sp-mode-target");
has(TPL_SRC, 'id="sp-note"', "模板控件：音名大字 sp-note");
has(TPL_SRC, 'id="sp-cents"', "模板控件：音分偏差 sp-cents");
has(TPL_SRC, 'id="sp-indicator"', "模板控件：偏高/偏低/准指示 sp-indicator");
has(TPL_SRC, 'id="sp-cents-needle"', "模板控件：音分偏差条指针 sp-cents-needle");
has(TPL_SRC, 'id="sp-wave"', "模板控件：实时波形 sp-wave");
has(TPL_SRC, 'id="sp-target-note"', "模板控件：目标音选择 sp-target-note");
has(TPL_SRC, 'id="sp-play-ref"', "模板控件：播放目标音 sp-play-ref");
has(TPL_SRC, 'id="sp-tolerance"', "模板控件：计分容差 sp-tolerance");
has(TPL_SRC, 'id="sp-session-count"', "模板控件：已计成绩 sp-session-count");
has(TPL_SRC, 'id="sp-session-avg"', "模板控件：平均偏差 sp-session-avg");
has(TPL_SRC, 'id="sp-session-intune"', "模板控件：准音率 sp-session-intune");
has(TPL_SRC, 'id="sp-session-grade"', "模板控件：综合分档 sp-session-grade");
has(TPL_SRC, 'id="sp-note-table"', "模板控件：对照表 sp-note-table");
has(TPL_SRC, 'id="sp-history"', "模板控件：成绩历史 sp-history");
has(TPL_SRC, 'id="sp-clear-history"', "模板控件：清空历史 sp-clear-history");
has(TPL_SRC, "偏高", "模板无障碍：偏高文字提示");
has(TPL_SRC, "偏低", "模板无障碍：偏低文字提示");
has(TPL_SRC, "aria-live", "模板无障碍：aria-live 状态区");
has(TPL_SRC, "/tools/metronome", "互链：在线节拍器（单向）");
has(TPL_SRC, "/tools/static/js/singing_pitch_checker.js?v=1", "模板：引用本站 JS");
notHas(MT_TPL, "/tools/singing-pitch-checker", "单向互链：节拍器模板不链回本工具（单向）");
notHas(TPL_SRC, "fonts.googleapis", "模板零 CDN：无外部字体");
ok((TPL_SRC.match(/<script[^>]*src="http/g) || []).length === 0, "模板零外部脚本：无 http script src");
var httpLinks = TPL_SRC.match(/<link[^>]*href="http[^"]*"/g) || [];
eq(httpLinks.length, 1, "模板 http link 仅 canonical 一条");
ok(httpLinks.length === 1 && httpLinks[0].indexOf("https://www.johnkingzcq123.xyz/tools/singing-pitch-checker") !== -1, "模板 http link：仅自家 canonical");

/* ---------- 14. 浏览器绑定源码级检查 ---------- */
notHas(JS_SRC, "fetch(", "零网络：JS 无 fetch");
notHas(JS_SRC, "XMLHttpRequest", "零网络：JS 无 XHR");
has(JS_SRC, "textContent", "渲染：用 textContent 防 HTML 执行");
has(JS_SRC, "getUserMedia", "采集：navigator.mediaDevices.getUserMedia");
has(JS_SRC, "AnalyserNode", "采集：AnalyserNode");
has(JS_SRC, "getFloatTimeDomainData", "采集：时域数据 getFloatTimeDomainData");
has(JS_SRC, "detectPitch(", "检测：调用 detectPitch 自相关基频检测");
has(JS_SRC, "SP_FREQ_MIN = 50", "检测：有效范围下限 50Hz");
has(JS_SRC, "SP_FREQ_MAX = 1000", "检测：有效范围上限 1000Hz");
has(JS_SRC, "SP_CONF_MIN = 0.8", "检测：置信度阈值 0.8");
has(JS_SRC, "SP_HOLD_MS = 500", "计分：唱稳 0.5 秒 SP_HOLD_MS=500");
has(JS_SRC, "SP_COOLDOWN_MS = 1500", "计分：计分后 1.5 秒冷却防重复");
has(JS_SRC, "targetCents(", "计分基准：导出 targetCents（与目标音的偏差）");
has(JS_SRC, "centsVsTarget", "计分基准：tick 目标模式用 centsVsTarget 稳定判定与计分");
var tickSrc = JS_SRC.slice(JS_SRC.indexOf("function tick()"), JS_SRC.indexOf("function stopMic()"));
has(tickSrc, "targetCents(", "计分基准：tick 目标模式稳定判定引用 targetCents");
has(tickSrc, "centsVsTarget", "计分基准：tick 目标模式稳定判定与 stableSamples 用 centsVsTarget");
notHas(tickSrc, "note.cents", "计分基准：tick 内不再以最近音 note.cents 计分（反例 470Hz/+14 与 415Hz/-1 误判已修）");
has(tickSrc, "midi: targetParsed.midi", "计分基准：目标模式显示以目标音名＋centsVsTarget 为准");
has(JS_SRC, "requestAnimationFrame", "循环：requestAnimationFrame 实时检测");
has(JS_SRC, "singing_pitch_checker_history_v1", "历史：localStorage 键 singing_pitch_checker_history_v1");
has(JS_SRC, "SP_HIST_MAX = 10", "历史：最近 10 次");
has(JS_SRC, "window.SingingPitchChecker", "导出：挂 window.SingingPitchChecker");
has(JS_SRC, "module.exports", "导出：module.exports 同步导出");
has(JS_SRC, "NotAllowedError", "权限被拒：NotAllowedError 提示分支");
has(JS_SRC, "偏高", "指示：偏高文案");
has(JS_SRC, "偏低", "指示：偏低文案");
has(JS_SRC, "准 ✓", "指示：准文案");
has(JS_SRC, "'Space'", "空格操作：监听 Space 键启停");
has(JS_SRC, "playRefTone", "目标音：播放目标音试听");
has(JS_SRC, "buildNoteTable", "对照表：C3–C6 对照表由 JS 生成");
has(JS_SRC, "SP_TARGET_MIN_MIDI = 48", "对照表：下限 C3（midi 48）");
has(JS_SRC, "SP_TARGET_MAX_MIDI = 84", "对照表：上限 C6（midi 84）");

console.log("singing_pitch_checker: pass=" + pass + " fail=" + fail + "，共 " + (pass + fail) + " 断言");
if (fail > 0) process.exit(1);
