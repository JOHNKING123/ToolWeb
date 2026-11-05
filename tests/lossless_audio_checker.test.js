/* 无损音频真伪检测纯函数单元测试（零依赖）：node tests/lossless_audio_checker.test.js
* 覆盖：fftMagnitudes（基 2 FFT 幅度谱锚点、长度校验 err.field='samples'）、
* applyHannWindow（端点为 0/中点为 1/不改原数组）、bandEnergies（1kHz 分档、
* energyDb 相对峰值、22 档@44.1kHz）、findCutoff（三档锚点、自定义阈值）、
* classifyCutoff（分档/采样率不足/非法参数 err.field）、validateAudioFile
* （扩展名与体积边界）、analyzeBands（组合入口、静音 inconclusive）、
* analyzeBuffer（端到端管线：1kHz+21kHz/18kHz/12kHz 三档锚点、全零静音、
* 短音频零填充）、mixToMono/peakDbfs、双模式导出与零外部接口、
* categories.go 注册（Path 总数 309→310、Icon audio_file 全库唯一、New/音频处理类目、
* 紧邻 audio_merger）、模板（SEO 五关键词、真限制四条、控件、互链、零外部资源静态检查）。
*/
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/lossless_audio_checker.js");

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
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "lossless_audio_checker.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "lossless_audio_checker.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");
var TRIMMER_TPL = fs.readFileSync(path.join(ROOT, "templates", "audio_trimmer.html"), "utf8");
var MERGER_TPL = fs.readFileSync(path.join(ROOT, "templates", "audio_merger.html"), "utf8");

var SR = 44100, N = 4096;
function binFreq(k) { return k * SR / N; }
function sineWave(freq, amp, len, sr) {
var out = new Float32Array(len), i;
for (i = 0; i < len; i++) out[i] = amp * Math.sin(2 * Math.PI * freq * i / sr);
return out;
}
function mixWaves(list, len, sr) {
var out = new Float32Array(len), i, w;
for (w = 0; w < list.length; w++) {
var s = sineWave(list[w][0], list[w][1], len, sr);
for (i = 0; i < len; i++) out[i] += s[i];
}
return out;
}
function fakeBuffer(mono, sr, channels) {
return { numberOfChannels: channels || 1, length: mono.length, duration: mono.length / sr,
sampleRate: sr, getChannelData: function () { return mono; } };
}
function mkBands(over, count) {
var out = [], i;
for (i = 0; i < (count || 22); i++)
out.push({ band: i, freqStart: i * 1000, freqEnd: (i + 1) * 1000, energyDb: -80 });
if (over) Object.keys(over).forEach(function (k) { out[+k].energyDb = over[k]; });
return out;
}

/* ---------- 1. fftMagnitudes：幅度锚点与校验 ---------- */
var mag = M.fftMagnitudes(sineWave(binFreq(93), 0.5, N, SR));
eq(mag.length, N / 2, "FFT 幅度谱长度 N/2");
near(mag[93], 1024, 0.01, "FFT 正弦幅度锚点：0.5 幅值 93 号 bin 幅度 1024（A·N/2）");
ok(mag[200] < 1e-6, "FFT 精确 bin 正弦：非峰值 bin 幅度≈0（无泄漏）");
ok(mag[92] < 1e-6 && mag[94] < 1e-6, "FFT 精确 bin 正弦：相邻 bin 幅度≈0");
var dc = M.fftMagnitudes(new Float32Array(256).fill(1));
near(dc[0], 256, 0.001, "FFT 直流锚点：常数 1 的 0 号 bin 幅度 = N");
ok(dc[1] < 1e-9, "FFT 直流锚点：其余 bin 幅度≈0");
eq(M.fftMagnitudes(new Float32Array(256)).length, 128, "FFT 最小点数 256 通过");
throws(function () { M.fftMagnitudes(new Float32Array(100)); }, "samples", "FFT 长度 100 非 2 的幂：err.field='samples'");
throws(function () { M.fftMagnitudes(new Float32Array(255)); }, "samples", "FFT 长度 255：err.field='samples'");
throws(function () { M.fftMagnitudes(new Float32Array(257)); }, "samples", "FFT 长度 257：err.field='samples'");
throws(function () { M.fftMagnitudes(new Float32Array(128)); }, "samples", "FFT 长度 128 < 256：err.field='samples'");
throws(function () { M.fftMagnitudes(null); }, "samples", "FFT null：err.field='samples'");
throws(function () { M.fftMagnitudes("x"); }, "samples", "FFT 字符串：err.field='samples'");
throws(function () { var a = new Float32Array(256); a[0] = NaN; M.fftMagnitudes(a); }, "samples", "FFT 含 NaN：err.field='samples'");

/* ---------- 2. applyHannWindow ---------- */
var win = M.applyHannWindow(new Float64Array([1, 1, 1, 1, 1]));
eq(win.length, 5, "Hann 窗长度不变");
near(win[0], 0, 1e-12, "Hann 窗首端为 0");
near(win[4], 0, 1e-12, "Hann 窗末端为 0");
near(win[2], 1, 1e-12, "Hann 窗中点为 1");
var srcArr = new Float32Array([2, 2, 2, 2]);
M.applyHannWindow(srcArr);
eq(srcArr[0], 2, "Hann 窗不改原数组");
throws(function () { M.applyHannWindow(new Float32Array([1])); }, "samples", "Hann 窗长度 1：err.field='samples'");
throws(function () { M.applyHannWindow(null); }, "samples", "Hann 窗 null：err.field='samples'");

/* ---------- 3. bandEnergies：分档与 dB 相对值 ---------- */
var twoTone = M.bandEnergies(
M.fftMagnitudes(M.applyHannWindow(mixWaves([[binFreq(93), 0.5], [binFreq(1900), 0.5]], N, SR))), SR);
eq(twoTone.length, 22, "bandEnergies：44.1kHz 共 22 档（0–22kHz）");
eq(twoTone[0].freqStart, 0, "bandEnergies：0 档起点 0Hz");
eq(twoTone[0].freqEnd, 1000, "bandEnergies：0 档终点 1000Hz");
eq(twoTone[21].freqEnd, 22000, "bandEnergies：21 档终点 22000Hz");
near(twoTone[20].energyDb, 0, 1e-9, "bandEnergies：20.5kHz 音调所在档为峰值 0dB");
ok(twoTone[1].energyDb > -1 && twoTone[1].energyDb < 0, "bandEnergies：1kHz 音调所在档约 -0.79dB（Hann 邻 bin 落 0 档）");
ok(twoTone[10].energyDb < -50, "bandEnergies：无音调的中频档低于 -50dB");
var zeroBands = M.bandEnergies(new Float64Array(N / 2), SR);
ok(zeroBands.every(function (b) { return b.energyDb === -Infinity; }), "bandEnergies：全零幅度谱各档 energyDb 为 -Infinity");
eq(M.bandEnergies(new Float64Array(1024), 22050).length, 11, "bandEnergies：22.05kHz 共 11 档");
throws(function () { M.bandEnergies(new Float64Array(0), SR); }, "magnitudes", "bandEnergies 空幅度谱：err.field='magnitudes'");
throws(function () { M.bandEnergies(new Float64Array(8), 0); }, "sampleRate", "bandEnergies 采样率 0：err.field='sampleRate'");
throws(function () { M.bandEnergies(new Float64Array(8), -44100); }, "sampleRate", "bandEnergies 负采样率：err.field='sampleRate'");
throws(function () { M.bandEnergies(new Float64Array(8), NaN); }, "sampleRate", "bandEnergies NaN 采样率：err.field='sampleRate'");
throws(function () { var a = new Float64Array(8); a[0] = -1; M.bandEnergies(a, SR); }, "magnitudes", "bandEnergies 负幅度：err.field='magnitudes'");
throws(function () { M.bandEnergies(new Float64Array(8), 1500); }, "sampleRate", "bandEnergies 采样率 1500 无法分档：err.field='sampleRate'");

/* ---------- 4. findCutoff：三档锚点 ---------- */
eq(M.findCutoff(mkBands({ 20: 0 })), 21000, "findCutoff：20 档 0dB → 截止 21000Hz");
eq(M.findCutoff(mkBands({ 18: 0 })), 19000, "findCutoff：18 档 0dB → 截止 19000Hz");
eq(M.findCutoff(mkBands({ 12: 0 })), 13000, "findCutoff：12 档 0dB → 截止 13000Hz");
eq(M.findCutoff(mkBands({ 20: -20, 21: -5 })), 22000, "findCutoff：取高于阈值的最高档（21 档 -5dB）");
eq(M.findCutoff(mkBands({ 20: -20 }), -10), 0, "findCutoff：自定义阈值 -10dB 时 -20dB 档不计入 → 0");
eq(M.findCutoff(mkBands({ 20: -20, 21: -5 }), -10), 22000, "findCutoff：自定义阈值 -10dB 时 -5dB 档计入 → 22000");
eq(M.findCutoff(mkBands({})), 0, "findCutoff：全档低于阈值 → 0");
eq(M.findCutoff(zeroBands), 0, "findCutoff：全零频带 → 0");
throws(function () { M.findCutoff([]); }, "bands", "findCutoff 空数组：err.field='bands'");
throws(function () { M.findCutoff(null); }, "bands", "findCutoff null：err.field='bands'");
throws(function () { M.findCutoff(mkBands({}), NaN); }, "thresholdDb", "findCutoff NaN 阈值：err.field='thresholdDb'");
throws(function () { M.findCutoff([{ energyDb: 0 }]); }, "bands", "findCutoff 元素缺 freqEnd：err.field='bands'");
throws(function () { M.findCutoff([{ energyDb: NaN, freqEnd: 1000 }]); }, "bands", "findCutoff 元素 energyDb 为 NaN：err.field='bands'");

/* ---------- 5. classifyCutoff：分档/采样率不足/非法参数 ---------- */
eqj(M.classifyCutoff(21000, 44100), { verdict: "likely_lossless", reason: "high_cutoff", cutoffHz: 21000, sampleRate: 44100 }, "classifyCutoff：21000Hz → 疑似真无损");
eq(M.classifyCutoff(20000, 44100).verdict, "likely_lossless", "classifyCutoff：20000Hz 边界 → 疑似真无损");
eq(M.classifyCutoff(22050, 48000).verdict, "likely_lossless", "classifyCutoff：48kHz 采样率 22050Hz → 疑似真无损");
eqj(M.classifyCutoff(19000, 44100), { verdict: "likely_transcoded", reason: "high_bitrate_mp3", cutoffHz: 19000, sampleRate: 44100 }, "classifyCutoff：19000Hz → 疑似转码（高码率 MP3）");
eq(M.classifyCutoff(19999, 44100).reason, "high_bitrate_mp3", "classifyCutoff：19999Hz 边界 → 高码率 MP3 特征");
eq(M.classifyCutoff(16000, 44100).reason, "high_bitrate_mp3", "classifyCutoff：16000Hz 边界 → 高码率 MP3 特征");
eqj(M.classifyCutoff(13000, 44100), { verdict: "likely_transcoded", reason: "low_bitrate", cutoffHz: 13000, sampleRate: 44100 }, "classifyCutoff：13000Hz → 疑似转码（低码率特征）");
eq(M.classifyCutoff(15999, 44100).reason, "low_bitrate", "classifyCutoff：15999Hz 边界 → 低码率特征");
eqj(M.classifyCutoff(0, 44100), { verdict: "inconclusive", reason: "no_signal", cutoffHz: 0, sampleRate: 44100 }, "classifyCutoff：截止 0 → 无法判定（无信号）");
eqj(M.classifyCutoff(21000, 22050), { verdict: "inconclusive", reason: "low_sample_rate", cutoffHz: 21000, sampleRate: 22050 }, "classifyCutoff：22.05kHz 采样率 → 无法判定（采样率不足）");
eq(M.classifyCutoff(21000, 32000).reason, "low_sample_rate", "classifyCutoff：32kHz 采样率 → 无法判定");
eq(M.classifyCutoff(21000, 44099).reason, "low_sample_rate", "classifyCutoff：44099Hz 采样率 → 无法判定");
throws(function () { M.classifyCutoff(-1, 44100); }, "cutoffHz", "classifyCutoff 负截止：err.field='cutoffHz'");
throws(function () { M.classifyCutoff(NaN, 44100); }, "cutoffHz", "classifyCutoff NaN 截止：err.field='cutoffHz'");
throws(function () { M.classifyCutoff("20000", 44100); }, "cutoffHz", "classifyCutoff 字符串截止：err.field='cutoffHz'");
throws(function () { M.classifyCutoff(21000, 0); }, "sampleRate", "classifyCutoff 采样率 0：err.field='sampleRate'");
throws(function () { M.classifyCutoff(21000, -44100); }, "sampleRate", "classifyCutoff 负采样率：err.field='sampleRate'");

/* ---------- 6. validateAudioFile：扩展名与体积边界 ---------- */
eqj(M.validateAudioFile({ name: "song.flac", size: 1024 }), { name: "song.flac", ext: ".flac", size: 1024 }, "validateAudioFile：flac 通过");
eq(M.validateAudioFile({ name: "SONG.FLAC", size: 1024 }).ext, ".flac", "validateAudioFile：大写扩展名归一化");
eq(M.validateAudioFile({ name: "a.wav", size: 1 }).ext, ".wav", "validateAudioFile：wav 通过");
eq(M.validateAudioFile({ name: "a.mp3", size: 1 }).ext, ".mp3", "validateAudioFile：mp3 通过");
eq(M.validateAudioFile({ name: "a.ogg", size: 1 }).ext, ".ogg", "validateAudioFile：ogg 通过");
eq(M.validateAudioFile({ name: "a.m4a", size: 1 }).ext, ".m4a", "validateAudioFile：m4a 通过");
eq(M.validateAudioFile({ name: "a.flac", size: 200 * 1024 * 1024 }).size, 209715200, "validateAudioFile：200MB 整边界通过");
throws(function () { M.validateAudioFile({ name: "a.flac", size: 200 * 1024 * 1024 + 1 }); }, "size", "validateAudioFile：200MB+1 字节：err.field='size'");
throws(function () { M.validateAudioFile({ name: "a.flac", size: 0 }); }, "size", "validateAudioFile：空文件：err.field='size'");
throws(function () { M.validateAudioFile({ name: "a.flac", size: -1 }); }, "size", "validateAudioFile：负体积：err.field='size'");
throws(function () { M.validateAudioFile({ name: "a.flac", size: NaN }); }, "size", "validateAudioFile：NaN 体积：err.field='size'");
throws(function () { M.validateAudioFile({ name: "a.flac" }); }, "size", "validateAudioFile：缺 size：err.field='size'");
throws(function () { M.validateAudioFile({ name: "a.txt", size: 1024 }); }, "name", "validateAudioFile：txt 扩展名：err.field='name'");
throws(function () { M.validateAudioFile({ name: "a.flacx", size: 1024 }); }, "name", "validateAudioFile：flacx 扩展名：err.field='name'");
throws(function () { M.validateAudioFile({ name: "noext", size: 1024 }); }, "name", "validateAudioFile：无扩展名：err.field='name'");
throws(function () { M.validateAudioFile({ name: "", size: 1024 }); }, "name", "validateAudioFile：空文件名：err.field='name'");
throws(function () { M.validateAudioFile({ name: "   ", size: 1024 }); }, "name", "validateAudioFile：空白文件名：err.field='name'");
throws(function () { M.validateAudioFile({ name: 123, size: 1024 }); }, "name", "validateAudioFile：数字文件名：err.field='name'");
throws(function () { M.validateAudioFile(null); }, "file", "validateAudioFile：null：err.field='file'");
throws(function () { M.validateAudioFile([]); }, "file", "validateAudioFile：数组：err.field='file'");
throws(function () { M.validateAudioFile("a.flac"); }, "file", "validateAudioFile：字符串：err.field='file'");

/* ---------- 7. analyzeBands：组合入口与静音 ---------- */
var abLossless = M.analyzeBands(mkBands({ 1: 0, 20: 0 }), SR);
eq(abLossless.cutoffHz, 21000, "analyzeBands：1kHz+20.5kHz → 截止 21000Hz");
eq(abLossless.verdict, "likely_lossless", "analyzeBands：1kHz+20.5kHz → 疑似真无损");
eq(abLossless.reason, "high_cutoff", "analyzeBands：1kHz+20.5kHz → reason high_cutoff");
var abMid = M.analyzeBands(mkBands({ 1: 0, 18: 0 }), SR);
eq(abMid.cutoffHz, 19000, "analyzeBands：1kHz+18kHz → 截止 19000Hz");
eq(abMid.verdict, "likely_transcoded", "analyzeBands：1kHz+18kHz → 疑似转码");
eq(abMid.reason, "high_bitrate_mp3", "analyzeBands：1kHz+18kHz → reason 高码率 MP3");
var abLow = M.analyzeBands(mkBands({ 1: 0, 12: 0 }), SR);
eq(abLow.cutoffHz, 13000, "analyzeBands：1kHz+12kHz → 截止 13000Hz");
eq(abLow.reason, "low_bitrate", "analyzeBands：1kHz+12kHz → reason 低码率");
var abZero = M.analyzeBands(zeroBands, SR);
eq(abZero.cutoffHz, 0, "analyzeBands：全零频带 → 截止 0");
eq(abZero.verdict, "inconclusive", "analyzeBands：全零频带 → 无法判定");
eq(abZero.reason, "no_signal", "analyzeBands：全零频带 → reason 无信号");
var abSr = M.analyzeBands(mkBands({ 1: 0, 10: 0 }, 11), 22050);
eq(abSr.verdict, "inconclusive", "analyzeBands：22.05kHz 采样率 → 无法判定");
eq(abSr.reason, "low_sample_rate", "analyzeBands：22.05kHz 采样率 → reason 采样率不足");
var abSilence = M.analyzeBands(mkBands({ 1: 0, 20: 0 }), SR, -50, -70);
eq(abSilence.verdict, "inconclusive", "analyzeBands：峰值 -70dBFS → 无法判定（静音）");
eq(abSilence.reason, "silence", "analyzeBands：峰值 -70dBFS → reason 静音");
var abEdge = M.analyzeBands(mkBands({ 1: 0, 20: 0 }), SR, -50, -60);
eq(abEdge.verdict, "likely_lossless", "analyzeBands：峰值恰 -60dBFS 不算静音（边界 < -60）");
var abLoud = M.analyzeBands(mkBands({ 1: 0, 20: 0 }), SR, -50, -3);
eq(abLoud.verdict, "likely_lossless", "analyzeBands：峰值 -3dBFS 正常判定");
var abThr = M.analyzeBands(mkBands({ 20: -20 }), SR, -10);
eq(abThr.cutoffHz, 0, "analyzeBands：阈值 -10dB 时 -20dB 档不计入 → 截止 0");
eq(abThr.reason, "no_signal", "analyzeBands：阈值 -10dB 时 → 无法判定");
throws(function () { M.analyzeBands(mkBands({ 1: 0 }), SR, -50, NaN); }, "peakDbfs", "analyzeBands：NaN 峰值：err.field='peakDbfs'");
throws(function () { M.analyzeBands([], SR); }, "bands", "analyzeBands 空频带：err.field='bands'");

/* ---------- 8. analyzeBuffer：端到端管线锚点 ---------- */
var bufLossless = M.analyzeBuffer(fakeBuffer(
mixWaves([[1000, 0.5], [binFreq(1900), 0.5]], SR * 2, SR), SR));
eq(bufLossless.segments, 8, "analyzeBuffer：2 秒音频取满 8 段");
eq(bufLossless.result.cutoffHz, 21000, "analyzeBuffer：1kHz+20.5kHz 双正弦 → 截止 21000Hz");
eq(bufLossless.result.verdict, "likely_lossless", "analyzeBuffer：1kHz+20.5kHz 双正弦 → 疑似真无损");
eq(bufLossless.merged.length, 22, "analyzeBuffer：合并频带 22 档");
eq(bufLossless.segBands.length, 8, "analyzeBuffer：每段频带 8 组");
ok(bufLossless.peakDbfs > -60, "analyzeBuffer：双正弦峰值高于静音线");
var bufTrue21k = M.analyzeBuffer(fakeBuffer(
mixWaves([[1000, 0.5], [21000, 0.5]], SR * 2, SR), SR));
ok(bufTrue21k.result.cutoffHz >= 20000, "analyzeBuffer：1kHz+21kHz 真实正弦 → 截止 ≥20000Hz");
eq(bufTrue21k.result.verdict, "likely_lossless", "analyzeBuffer：1kHz+21kHz 真实正弦 → 疑似真无损");
var bufMid = M.analyzeBuffer(fakeBuffer(
mixWaves([[1000, 0.5], [binFreq(1672), 0.5]], SR * 2, SR), SR));
eq(bufMid.result.cutoffHz, 19000, "analyzeBuffer：1kHz+18kHz 双正弦 → 截止 19000Hz");
eq(bufMid.result.verdict, "likely_transcoded", "analyzeBuffer：1kHz+18kHz → 疑似转码");
eq(bufMid.result.reason, "high_bitrate_mp3", "analyzeBuffer：1kHz+18kHz → 高码率 MP3 特征");
var bufLow = M.analyzeBuffer(fakeBuffer(
mixWaves([[1000, 0.5], [binFreq(1115), 0.5]], SR * 2, SR), SR));
eq(bufLow.result.cutoffHz, 13000, "analyzeBuffer：1kHz+12kHz 双正弦 → 截止 13000Hz");
eq(bufLow.result.reason, "low_bitrate", "analyzeBuffer：1kHz+12kHz → 低码率特征");
var bufSilence = M.analyzeBuffer(fakeBuffer(new Float32Array(SR), SR));
eq(bufSilence.result.verdict, "inconclusive", "analyzeBuffer：全零音频 → 无法判定");
eq(bufSilence.result.reason, "silence", "analyzeBuffer：全零音频 → 静音原因");
eq(bufSilence.peakDbfs, -Infinity, "analyzeBuffer：全零音频峰值 -Infinity");
var bufShort = M.analyzeBuffer(fakeBuffer(
mixWaves([[1000, 0.5]], 2000, SR), SR));
eq(bufShort.segments, 1, "analyzeBuffer：短于 4096 点只取 1 段（零填充）");
ok(typeof bufShort.result.verdict === "string" && bufShort.result.verdict.length > 0, "analyzeBuffer：短音频仍给出结论");
var bufStereo = M.analyzeBuffer(fakeBuffer(
mixWaves([[1000, 0.5], [binFreq(1900), 0.5]], SR, SR), SR, 2));
eq(bufStereo.result.verdict, "likely_lossless", "analyzeBuffer：双声道混合后仍判疑似真无损");

/* ---------- 9. mixToMono / peakDbfs ---------- */
eqj(Array.prototype.slice.call(M.mixToMono(
[new Float32Array([1, 2]), new Float32Array([3, 4])], 2)), [2, 3], "mixToMono：双声道平均混合");
near(M.peakDbfs(new Float32Array([0.5, -0.5, 0.25])), -6.02, 0.01, "peakDbfs：峰值 0.5 → -6.02dBFS");
eq(M.peakDbfs(new Float32Array([0, 0])), -Infinity, "peakDbfs：全零 → -Infinity");
near(M.peakDbfs(new Float32Array([1])), 0, 1e-9, "peakDbfs：满幅 → 0dBFS");

/* ---------- 10. 常量与双模式导出、零外部接口 ---------- */
eq(M.FFT_SIZE, 4096, "常量：每段 FFT 4096 点");
eq(M.MAX_SEGMENTS, 8, "常量：取段上限 8");
eq(M.BAND_WIDTH, 1000, "常量：分频带宽 1000Hz");
eq(M.THRESHOLD_DB, -50, "常量：判定阈值 -50dB");
eq(M.MAX_FILE_SIZE, 209715200, "常量：体积上限 200MB");
eq(M.MIN_SAMPLE_RATE, 44100, "常量：判定基准采样率 44100Hz");
eq(M.SILENCE_DBFS, -60, "常量：静音线 -60dBFS");
ok(typeof M.fftMagnitudes === "function" && typeof M.applyHannWindow === "function" &&
typeof M.bandEnergies === "function" && typeof M.findCutoff === "function" &&
typeof M.classifyCutoff === "function" && typeof M.validateAudioFile === "function" &&
typeof M.analyzeBands === "function" && typeof M.analyzeBuffer === "function",
"同步导出：8 个纯函数齐全");
has(JS_SRC, "window.LosslessAudioChecker", "浏览器导出：window.LosslessAudioChecker");
has(JS_SRC, "module.exports = api", "node 导出：module.exports 同步导出");
has(JS_SRC, "decodeAudioData", "JS：decodeAudioData 本地解码");
has(JS_SRC, "FileReader", "JS：FileReader 读取文件");
notHas(JS_SRC, "fetch(", "JS 零外部接口：无 fetch");
notHas(JS_SRC, "XMLHttpRequest", "JS 零外部接口：无 XMLHttpRequest");

/* ---------- 11. categories.go 注册 ---------- */
var pathCount = (GO_SRC.match(/"\/tools\/[^"]+"/g) || []).filter(function (v, i, a) { return a.indexOf(v) === i; }).length;
eq(pathCount, 311, "注册 Path 总数 309→310");
has(GO_SRC, '"lossless_audio_checker"', "注册：ID lossless_audio_checker");
has(GO_SRC, '"/tools/lossless-audio-checker"', "注册：Path /tools/lossless-audio-checker");
has(GO_SRC, '"audio_file"', "注册：Icon audio_file");
eq((GO_SRC.match(/Icon:\s*"audio_file"/g) || []).length, 1, "Icon audio_file 全库唯一");
var entryBlock = GO_SRC.slice(GO_SRC.indexOf('"lossless_audio_checker"') - 60,
GO_SRC.indexOf('"lossless_audio_checker"') + 1600);
ok(/New:\s+true/.test(entryBlock), "注册：New: true");
ok(/Category:\s+"音频处理"/.test(entryBlock), "注册：类目 音频处理");
has(entryBlock, "无损音频真伪检测", "注册：名称 无损音频真伪检测");
has(entryBlock, "假无损", "注册：描述含 假无损");
ok(GO_SRC.indexOf('"lossless_audio_checker"') > GO_SRC.indexOf('"audio_merger"') &&
GO_SRC.indexOf('"lossless_audio_checker"') < GO_SRC.indexOf('"slowed_reverb"'), "注册：紧邻 audio_merger（在其后、slowed_reverb 之前）");

/* ---------- 12. 模板：SEO/真限制/控件/互链/零外部资源 ---------- */
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/lossless-audio-checker", "模板 canonical 含新 Path");
has(TPL_SRC, "无损音频真伪检测", "模板：标题含工具名");
has(TPL_SRC, "无损检测", "模板 SEO：关键词 无损检测");
has(TPL_SRC, "FLAC真伪", "模板 SEO：关键词 FLAC真伪");
has(TPL_SRC, "假无损", "模板 SEO：关键词 假无损");
has(TPL_SRC, "音频频谱检测", "模板 SEO：关键词 音频频谱检测");
has(TPL_SRC, "MP3转FLAC识别", "模板 SEO：关键词 MP3转FLAC识别");
has(TPL_SRC, "真限制", "模板：真限制章节");
has(TPL_SRC, "频谱截止 ≠ 定罪", "真限制①：频谱截止≠定罪");
has(TPL_SRC, "概率性“疑似”结论，不是鉴定依据", "真限制①：概率性疑似、非鉴定依据");
has(TPL_SRC, "真无损的老录音高频少可被误判", "真限制②：真无损老录音高频少可被误判");
has(TPL_SRC, "全程本地零上传", "真限制③：全程本地零上传");
has(TPL_SRC, "个别 FLAC 解码失败 ≠ 文件损坏", "真限制④：个别 FLAC 解码失败≠文件损坏");
has(TPL_SRC, 'id="lac-upload"', "模板控件：上传区 lac-upload");
has(TPL_SRC, 'id="lac-file"', "模板控件：文件输入 lac-file");
has(TPL_SRC, 'id="lac-spectrogram"', "模板控件：频谱图 lac-spectrogram");
has(TPL_SRC, 'id="lac-curve"', "模板控件：频谱曲线 lac-curve");
has(TPL_SRC, 'id="lac-verdict"', "模板控件：结论卡 lac-verdict");
has(TPL_SRC, 'id="lac-reupload"', "模板控件：重新上传 lac-reupload");
has(TPL_SRC, "疑似真无损", "模板文案：疑似真无损");
has(TPL_SRC, "Hann", "模板文案：Hann 窗方法说明");
has(TPL_SRC, "4096", "模板文案：4096 点方法说明");
has(TPL_SRC, "/tools/audio-trimmer", "互链：在线音频裁剪器");
has(TPL_SRC, "/tools/audio-merger", "互链：音频合并器");
has(TPL_SRC, "/tools/static/js/lossless_audio_checker.js?v=1", "模板：引用本站 JS");
has(TRIMMER_TPL, "/tools/lossless-audio-checker", "双向互链：裁剪器模板链回本工具");
has(MERGER_TPL, "/tools/lossless-audio-checker", "双向互链：合并器模板链回本工具");
notHas(TPL_SRC, "fonts.googleapis", "模板零 CDN：无外部字体");
ok((TPL_SRC.match(/<script[^>]*src="http/g) || []).length === 0, "模板零外部脚本：无 http script src");
var httpLinks = TPL_SRC.match(/<link[^>]*href="http[^"]*"/g) || [];
eq(httpLinks.length, 1, "模板 http link 仅 canonical 一条");
ok(httpLinks.length === 1 && httpLinks[0].indexOf("https://www.johnkingzcq123.xyz/tools/lossless-audio-checker") !== -1, "模板 http link：仅自家 canonical");

console.log("lossless_audio_checker: pass=" + pass + " fail=" + fail + "，共 " + (pass + fail) + " 断言");
if (fail > 0) process.exit(1);
