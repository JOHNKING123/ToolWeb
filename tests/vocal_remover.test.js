/* 人声消除/伴奏提取纯函数单元测试（零依赖）：node tests/vocal_remover.test.js
* 覆盖：validateAudioFile（扩展名与体积边界）、requireStereo（单声道 err.field='channels'）、
* centerEliminate（伴奏算法精确锚点：全居中 s=1 全消尽、全反相 s=1 保留、s=0 直通、s=0.5 半残留、
* 保低频直流保留/高频近 karaoke、非法参数 err.field）、extractCenter（中央声道锚点）、
* preserveBass（一阶低通：直流全保留/高频近 karaoke 误差 ≤0.05）、encodeWavPcm16（RIFF 头字段与
* 数据长度精确值）、waveformPeaks / floatTo16BitPCM / interleaveChannels / resampleLinear /
* clampStrength / 导出命名与体积预估、categories.go 注册（Path 总数 309→309、Icon mic_off 全库唯一、
* 紧邻 lossless_audio_checker）、模板（SEO 关键词、真限制四条、控件、互链、零外部资源静态检查）。
*/
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/vocal_remover.js");

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
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "vocal_remover.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "vocal_remover.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");
var TRIMMER_TPL = fs.readFileSync(path.join(ROOT, "templates", "audio_trimmer.html"), "utf8");
var SLOWED_TPL = fs.readFileSync(path.join(ROOT, "templates", "slowed_reverb.html"), "utf8");

var SR = 44100;
function constArr(v, n) { var a = new Float32Array(n); for (var i = 0; i < n; i++) a[i] = v; return a; }
function sineWave(freq, amp, len, sr) {
var out = new Float32Array(len), i;
for (i = 0; i < len; i++) out[i] = amp * Math.sin(2 * Math.PI * freq * i / sr);
return out;
}
function maxAbs(a, from) {
var m = 0, i;
for (i = (from || 0); i < a.length; i++) { var v = Math.abs(a[i]); if (v > m) m = v; }
return m;
}

/* ---------- 1. validateAudioFile：扩展名与体积边界 ---------- */
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
throws(function () { M.validateAudioFile({ name: "a.aac", size: 1024 }); }, "name", "validateAudioFile：aac 不在白名单：err.field='name'");
throws(function () { M.validateAudioFile({ name: "noext", size: 1024 }); }, "name", "validateAudioFile：无扩展名：err.field='name'");
throws(function () { M.validateAudioFile({ name: "", size: 1024 }); }, "name", "validateAudioFile：空文件名：err.field='name'");
throws(function () { M.validateAudioFile({ name: 123, size: 1024 }); }, "name", "validateAudioFile：数字文件名：err.field='name'");
throws(function () { M.validateAudioFile(null); }, "file", "validateAudioFile：null：err.field='file'");
throws(function () { M.validateAudioFile([]); }, "file", "validateAudioFile：数组：err.field='file'");
throws(function () { M.validateAudioFile("a.flac"); }, "file", "validateAudioFile：字符串：err.field='file'");

/* ---------- 2. requireStereo：单声道明确报错 ---------- */
eq(M.requireStereo({ numberOfChannels: 2 }), 2, "requireStereo：立体声通过返回 2");
throws(function () { M.requireStereo({ numberOfChannels: 1 }); }, "channels", "requireStereo：单声道：err.field='channels'");
throws(function () { M.requireStereo({ numberOfChannels: 0 }); }, "channels", "requireStereo：0 声道：err.field='channels'");
throws(function () { M.requireStereo({ numberOfChannels: 6 }); }, "channels", "requireStereo：6 声道：err.field='channels'");
throws(function () { M.requireStereo({}); }, "channels", "requireStereo：缺声道数：err.field='channels'");
throws(function () { M.requireStereo(null); }, "channels", "requireStereo：null：err.field='channels'");

/* ---------- 3. centerEliminate：伴奏算法精确锚点 ---------- */
var ce1 = M.centerEliminate(constArr(0.5, 8), constArr(0.5, 8), 1);
ok(maxAbs(ce1.left) === 0 && maxAbs(ce1.right) === 0, "centerEliminate：全居中 s=1 全消尽（out 全 0）");
var ce2 = M.centerEliminate(constArr(0.5, 8), constArr(-0.5, 8), 1);
eq(ce2.left[0], 0.5, "centerEliminate：全反相 s=1 左声道保留");
eq(ce2.right[0], -0.5, "centerEliminate：全反相 s=1 右声道保留");
var ce3 = M.centerEliminate(new Float32Array([0.8, -0.3]), new Float32Array([0.4, 0.9]), 0);
near(ce3.left[0], 0.8, 1e-6, "centerEliminate：s=0 左声道直通 0.8");
near(ce3.left[1], -0.3, 1e-6, "centerEliminate：s=0 左声道直通 −0.3");
near(ce3.right[0], 0.4, 1e-6, "centerEliminate：s=0 右声道直通 0.4");
near(ce3.right[1], 0.9, 1e-6, "centerEliminate：s=0 右声道直通 0.9");
var ce4 = M.centerEliminate(constArr(0.8, 8), constArr(0.8, 8), 0.5);
near(ce4.left[0], 0.4, 1e-6, "centerEliminate：全居中 s=0.5 左声道半残留 0.4");
near(ce4.right[0], 0.4, 1e-6, "centerEliminate：全居中 s=0.5 右声道半残留 0.4");
var ce5 = M.centerEliminate(new Float32Array([0.8]), new Float32Array([0.4]), 1);
near(ce5.left[0], 0.2, 1e-6, "centerEliminate：混合声道 s=1 左 0.8−mid0.6=0.2");
near(ce5.right[0], -0.2, 1e-6, "centerEliminate：混合声道 s=1 右 0.4−mid0.6=−0.2");
var ce6 = M.centerEliminate(new Float32Array([2]), new Float32Array([-2]), 1);
eq(ce6.left[0], 1, "centerEliminate：超幅输出钳制到 1");
eq(ce6.right[0], -1, "centerEliminate：超幅输出钳制到 −1");
var ceBass = M.centerEliminate(constArr(0.5, SR), constArr(0.5, SR), 1, { preserveBass: true, sampleRate: SR });
near(ceBass.left[SR - 1], 0.5, 1e-3, "centerEliminate 保低频：直流居中 s=1 稳态保留 0.5");
ok(Math.abs(ceBass.left[0]) < 0.05, "centerEliminate 保低频：首采样近 0（低通瞬态）");
var hfL = sineWave(10000, 0.5, SR, SR), hfR = sineWave(10000, 0.5, SR, SR);
var ceHf = M.centerEliminate(hfL, hfR, 1, { preserveBass: true, sampleRate: SR });
ok(maxAbs(ceHf.left, 5000) < 0.05, "centerEliminate 保低频：10kHz 居中正弦稳态残留 < 0.05（高频仍被消除）");
var ceHfOff = M.centerEliminate(hfL, hfR, 1);
ok(maxAbs(ceHfOff.left) < 1e-9, "centerEliminate 保低频关：10kHz 居中正弦 s=1 全消尽");
throws(function () { M.centerEliminate(constArr(0.5, 4), constArr(0.5, 4), -0.1); }, "strength", "centerEliminate：强度 −0.1：err.field='strength'");
throws(function () { M.centerEliminate(constArr(0.5, 4), constArr(0.5, 4), 1.1); }, "strength", "centerEliminate：强度 1.1：err.field='strength'");
throws(function () { M.centerEliminate(constArr(0.5, 4), constArr(0.5, 4), NaN); }, "strength", "centerEliminate：强度 NaN：err.field='strength'");
throws(function () { M.centerEliminate(constArr(0.5, 4), constArr(0.5, 4), "1"); }, "strength", "centerEliminate：强度字符串：err.field='strength'");
throws(function () { M.centerEliminate(constArr(0.5, 4), constArr(0.5, 3), 1); }, "length", "centerEliminate：左右长度不一致：err.field='length'");
throws(function () { M.centerEliminate(new Float32Array(0), constArr(0.5, 4), 1); }, "left", "centerEliminate：左声道空：err.field='left'");
throws(function () { M.centerEliminate(constArr(0.5, 4), null, 1); }, "right", "centerEliminate：右声道 null：err.field='right'");
throws(function () { M.centerEliminate(constArr(0.5, 4), constArr(0.5, 4), 1, { preserveBass: true }); }, "sampleRate", "centerEliminate 保低频缺采样率：err.field='sampleRate'");
throws(function () { M.centerEliminate(constArr(0.5, 4), constArr(0.5, 4), 1, { preserveBass: true, sampleRate: SR, bassCutoffHz: 0 }); }, "cutoffHz", "centerEliminate 保低频截止 0：err.field='cutoffHz'");
throws(function () { M.centerEliminate(constArr(0.5, 4), constArr(0.5, 4), 1, { preserveBass: true, sampleRate: SR, bassCutoffHz: SR }); }, "cutoffHz", "centerEliminate 保低频截止 ≥fs/2：err.field='cutoffHz'");

/* ---------- 4. extractCenter：中央声道锚点 ---------- */
var ec1 = M.extractCenter(constArr(0.7, 4), constArr(0.7, 4));
ok(ec1.every(function (v) { return Math.abs(v - 0.7) < 1e-6; }), "extractCenter：全居中原样返回");
ok(maxAbs(M.extractCenter(constArr(0.5, 4), constArr(-0.5, 4))) === 0, "extractCenter：全反相返回全零");
near(M.extractCenter(new Float32Array([0.8]), new Float32Array([0.4]))[0], 0.6, 1e-6, "extractCenter：混合声道 mid=(0.8+0.4)/2=0.6");
throws(function () { M.extractCenter(constArr(0.5, 4), constArr(0.5, 3)); }, "length", "extractCenter：左右长度不一致：err.field='length'");
throws(function () { M.extractCenter(null, constArr(0.5, 4)); }, "left", "extractCenter：左声道 null：err.field='left'");
throws(function () { M.extractCenter(constArr(0.5, 4), new Float32Array(0)); }, "right", "extractCenter：右声道空：err.field='right'");

/* ---------- 5. preserveBass：一阶低通锚点 ---------- */
var lpDc = M.preserveBass(constArr(0.5, SR), SR);
near(lpDc[SR - 1], 0.5, 1e-9, "preserveBass：直流 0.5 稳态全保留");
near(lpDc[0], 0.01405, 1e-4, "preserveBass：直流首采样 a·0.5≈0.01405（a=1−exp(−2π·200/44100)）");
var lpHf = M.preserveBass(sineWave(10000, 1, SR, SR), SR);
ok(maxAbs(lpHf, 5000) <= 0.05, "preserveBass：10kHz 正弦稳态输出 ≤0.05（高频近 karaoke 误差）");
var lpLf = M.preserveBass(sineWave(50, 1, SR, SR), SR);
ok(maxAbs(lpLf, 20000) > 0.9, "preserveBass：50Hz 正弦稳态输出 >0.9（低频通过）");
eq(M.preserveBass(constArr(0.25, 100), SR, 200).length, 100, "preserveBass：自定义截止 200Hz 长度不变");
throws(function () { M.preserveBass(new Float32Array(0), SR); }, "samples", "preserveBass 空数据：err.field='samples'");
throws(function () { M.preserveBass(null, SR); }, "samples", "preserveBass null：err.field='samples'");
throws(function () { var a = new Float32Array([0.5, NaN]); M.preserveBass(a, SR); }, "samples", "preserveBass 含 NaN：err.field='samples'");
throws(function () { M.preserveBass(constArr(0.5, 8), 0); }, "sampleRate", "preserveBass 采样率 0：err.field='sampleRate'");
throws(function () { M.preserveBass(constArr(0.5, 8), -44100); }, "sampleRate", "preserveBass 负采样率：err.field='sampleRate'");
throws(function () { M.preserveBass(constArr(0.5, 8), SR, 0); }, "cutoffHz", "preserveBass 截止 0：err.field='cutoffHz'");
throws(function () { M.preserveBass(constArr(0.5, 8), SR, SR / 2); }, "cutoffHz", "preserveBass 截止 =fs/2：err.field='cutoffHz'");

/* ---------- 6. encodeWavPcm16：RIFF 头字段与数据长度精确值 ---------- */
function str4(dv, off) {
var s = "";
for (var i = 0; i < 4; i++) s += String.fromCharCode(dv.getUint8(off + i));
return s;
}
var wav = M.encodeWavPcm16(44100, 2, new Int16Array([1000, -1000, 2000, -2000]));
eq(wav.byteLength, 52, "encodeWavPcm16：总字节 44+8=52");
eq(str4(wav, 0), "RIFF", "encodeWavPcm16：RIFF 标识");
eq(wav.getUint32(4, true), 44, "encodeWavPcm16：chunkSize=36+dataLen=44");
eq(str4(wav, 8), "WAVE", "encodeWavPcm16：WAVE 标识");
eq(str4(wav, 12), "fmt ", "encodeWavPcm16：fmt 标识");
eq(wav.getUint32(16, true), 16, "encodeWavPcm16：fmt chunk size=16");
eq(wav.getUint16(20, true), 1, "encodeWavPcm16：PCM 格式=1");
eq(wav.getUint16(22, true), 2, "encodeWavPcm16：声道数=2");
eq(wav.getUint32(24, true), 44100, "encodeWavPcm16：采样率=44100");
eq(wav.getUint32(28, true), 176400, "encodeWavPcm16：byteRate=44100·2·2=176400");
eq(wav.getUint16(32, true), 4, "encodeWavPcm16：blockAlign=4");
eq(wav.getUint16(34, true), 16, "encodeWavPcm16：bits=16");
eq(str4(wav, 36), "data", "encodeWavPcm16：data 标识");
eq(wav.getUint32(40, true), 8, "encodeWavPcm16：dataLen=8");
eq(wav.getInt16(44, true), 1000, "encodeWavPcm16：采样 0=1000");
eq(wav.getInt16(46, true), -1000, "encodeWavPcm16：采样 1=−1000");
eq(wav.getInt16(48, true), 2000, "encodeWavPcm16：采样 2=2000");
eq(wav.getInt16(50, true), -2000, "encodeWavPcm16：采样 3=−2000");
var wavMono = M.encodeWavPcm16(48000, 1, new Int16Array([32767, -32768]));
eq(wavMono.byteLength, 48, "encodeWavPcm16 单声道：总字节 44+4=48");
eq(wavMono.getUint32(28, true), 96000, "encodeWavPcm16 单声道：byteRate=48000·1·2=96000");
eq(wavMono.getUint16(32, true), 2, "encodeWavPcm16 单声道：blockAlign=2");
throws(function () { M.encodeWavPcm16(0, 2, new Int16Array([1, 2])); }, "sampleRate", "encodeWavPcm16 采样率 0：err.field='sampleRate'");
throws(function () { M.encodeWavPcm16(44100.5, 2, new Int16Array([1, 2])); }, "sampleRate", "encodeWavPcm16 采样率非整数：err.field='sampleRate'");
throws(function () { M.encodeWavPcm16(44100, 3, new Int16Array([1, 2, 3])); }, "numChannels", "encodeWavPcm16 声道数 3：err.field='numChannels'");
throws(function () { M.encodeWavPcm16(44100, 2, [1, 2]); }, "interleaved", "encodeWavPcm16 普通数组：err.field='interleaved'");
throws(function () { M.encodeWavPcm16(44100, 2, new Int16Array(0)); }, "interleaved", "encodeWavPcm16 空 PCM：err.field='interleaved'");
throws(function () { M.encodeWavPcm16(44100, 2, new Int16Array([1, 2, 3])); }, "interleaved", "encodeWavPcm16 长度非声道倍数：err.field='interleaved'");

/* ---------- 7. clampStrength / floatTo16BitPCM / interleaveChannels / waveformPeaks / resampleLinear ---------- */
near(M.clampStrength(50), 0.5, 1e-12, "clampStrength：50→0.5");
eq(M.clampStrength(0), 0, "clampStrength：0→0");
eq(M.clampStrength(100), 1, "clampStrength：100→1");
eq(M.clampStrength(150), 1, "clampStrength：150 钳制到 1");
eq(M.clampStrength(-10), 0, "clampStrength：−10 钳制到 0");
eq(M.clampStrength(NaN), 0, "clampStrength：NaN→0");
eqj(Array.prototype.slice.call(M.floatTo16BitPCM(new Float32Array([1, -1, 0, 0.5, -0.5]))), [32767, -32768, 0, 16384, -16384], "floatTo16BitPCM：满幅/零/半幅锚点");
eqj(Array.prototype.slice.call(M.interleaveChannels([new Int16Array([1, 2]), new Int16Array([3, 4])], 2)), [1, 3, 2, 4], "interleaveChannels：双声道交错");
eqj(Array.prototype.slice.call(M.waveformPeaks(new Float32Array([0.5, -1, 0.25, 0]), 2)), [1, 0.25], "waveformPeaks：两桶峰值 1/0.25");
eq(M.waveformPeaks(new Float32Array([0.5, -1]), 1)[0], 1, "waveformPeaks：单桶峰值 1");
eq(M.waveformPeaks(new Float32Array([0, 0, 0]), 3).length, 3, "waveformPeaks：全零三桶长度 3");
throws(function () { M.waveformPeaks(new Float32Array(0), 2); }, "samples", "waveformPeaks 空数据：err.field='samples'");
throws(function () { M.waveformPeaks(new Float32Array([1]), 0); }, "buckets", "waveformPeaks 桶数 0：err.field='buckets'");
throws(function () { M.waveformPeaks(new Float32Array([1]), 2.5); }, "buckets", "waveformPeaks 桶数非整数：err.field='buckets'");
var rsSame = new Float32Array([1, 2, 3]);
eq(M.resampleLinear(rsSame, 44100, 44100), rsSame, "resampleLinear：同采样率返回原数组");
eq(M.resampleLinear(new Float32Array([0, 1, 2, 3]), 44100, 22050).length, 2, "resampleLinear：降采样长度减半");

/* ---------- 8. 导出命名与体积预估 ---------- */
eq(M.makeExportName("夜曲", "karaoke", 100, "wav"), "夜曲_vocal-karaoke_100.wav", "makeExportName：伴奏 100% WAV");
eq(M.makeExportName("夜曲", "vocal", 80, "mp3"), "夜曲_vocal-vocal_80.mp3", "makeExportName：干声 80% MP3");
eq(M.makeExportName("a/b:c", "karaoke", 0, "wav"), "a_b_c_vocal-karaoke_0.wav", "makeExportName：非法字符替换");
eq(M.makeExportName("", "karaoke", 100, "wav"), "audio_vocal-karaoke_100.wav", "makeExportName：空名回退 audio");
eq(M.estimateWavBytes(100, 2), 444, "estimateWavBytes：100 帧双声道=44+400");
eq(M.estimateMp3Bytes(10, 128), 160000, "estimateMp3Bytes：10 秒 128k=160000 字节");
eq(M.estimateMp3Bytes(0, 128), 0, "estimateMp3Bytes：0 秒=0");
eq(M.MAX_FILE_SIZE, 209715200, "常量：体积上限 200MB");
eq(M.BASS_CUTOFF_HZ, 200, "常量：保低频截止 200Hz");
eq(M.ALLOWED_EXTS.length, 5, "常量：白名单 5 个扩展名");
ok(typeof M.validateAudioFile === "function" && typeof M.requireStereo === "function" &&
typeof M.centerEliminate === "function" && typeof M.extractCenter === "function" &&
typeof M.preserveBass === "function" && typeof M.encodeWavPcm16 === "function",
"同步导出：6 个核心纯函数齐全");
has(JS_SRC, "window.VocalRemover", "浏览器导出：window.VocalRemover");
has(JS_SRC, "module.exports = api", "node 导出：module.exports 同步导出");
has(JS_SRC, "decodeAudioData", "JS：decodeAudioData 本地解码");
has(JS_SRC, "FileReader", "JS：FileReader 读取文件");
notHas(JS_SRC, "fetch(", "JS 零外部接口：无 fetch");
notHas(JS_SRC, "XMLHttpRequest", "JS 零外部接口：无 XMLHttpRequest");

/* ---------- 9. categories.go 注册 ---------- */
var pathCount = (GO_SRC.match(/"\/tools\/[^"]+"/g) || []).filter(function (v, i, a) { return a.indexOf(v) === i; }).length;
eq(pathCount, 309, "注册 Path 总数 309→309");
has(GO_SRC, '"vocal_remover"', "注册：ID vocal_remover");
has(GO_SRC, '"/tools/vocal-remover"', "注册：Path /tools/vocal-remover");
has(GO_SRC, '"mic_off"', "注册：Icon mic_off");
eq((GO_SRC.match(/Icon:\s*"mic_off"/g) || []).length, 1, "Icon mic_off 全库唯一");
var entryBlock = GO_SRC.slice(GO_SRC.indexOf('"vocal_remover"') - 60,
GO_SRC.indexOf('"vocal_remover"') + 1600);
ok(/New:\s+true/.test(entryBlock), "注册：New: true");
ok(/Category:\s+"音频处理"/.test(entryBlock), "注册：类目 音频处理");
has(entryBlock, "人声消除/伴奏提取", "注册：名称 人声消除/伴奏提取");
has(entryBlock, "中心声道消除法", "注册：描述含 中心声道消除法");
ok(GO_SRC.indexOf('"vocal_remover"') > GO_SRC.indexOf('"lossless_audio_checker"') &&
GO_SRC.indexOf('"vocal_remover"') < GO_SRC.indexOf('"slowed_reverb"'), "注册：紧邻 lossless_audio_checker（在其后、slowed_reverb 之前）");

/* ---------- 10. 模板：SEO/真限制/控件/互链/零外部资源 ---------- */
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/vocal-remover", "模板 canonical 含新 Path");
has(TPL_SRC, "人声消除/伴奏提取", "模板：标题含工具名");
has(TPL_SRC, "人声消除", "模板 SEO：关键词 人声消除");
has(TPL_SRC, "伴奏提取", "模板 SEO：关键词 伴奏提取");
has(TPL_SRC, "卡拉OK伴奏", "模板 SEO：关键词 卡拉OK伴奏");
has(TPL_SRC, "干声提取", "模板 SEO：关键词 干声提取");
has(TPL_SRC, "真限制", "模板：真限制章节");
has(TPL_SRC, "卡拉OK级消除，非 AI 分离", "真限制①：卡拉OK级消除、非 AI 分离");
has(TPL_SRC, "仅立体声＋居中人声有效", "真限制②：仅立体声＋居中人声有效");
has(TPL_SRC, "混响/和声/居中乐器残留", "真限制③：混响/和声/居中乐器残留");
has(TPL_SRC, "全程本地零上传", "真限制④：全程本地零上传");
has(TPL_SRC, "单声道文件无法处理", "模板文案：单声道无法处理");
has(TPL_SRC, 'id="vr-upload"', "模板控件：上传区 vr-upload");
has(TPL_SRC, 'id="vr-file"', "模板控件：文件输入 vr-file");
has(TPL_SRC, 'id="vr-mode-karaoke"', "模板控件：伴奏模式 vr-mode-karaoke");
has(TPL_SRC, 'id="vr-mode-vocal"', "模板控件：干声模式 vr-mode-vocal");
has(TPL_SRC, 'id="vr-strength"', "模板控件：强度滑杆 vr-strength");
has(TPL_SRC, 'id="vr-keep-bass"', "模板控件：保低频 vr-keep-bass");
has(TPL_SRC, 'id="vr-process"', "模板控件：生成按钮 vr-process");
has(TPL_SRC, 'id="vr-wave-orig"', "模板控件：原波形 vr-wave-orig");
has(TPL_SRC, 'id="vr-wave-result"', "模板控件：结果波形 vr-wave-result");
has(TPL_SRC, 'id="vr-play-orig"', "模板控件：A/B 试听原音频 vr-play-orig");
has(TPL_SRC, 'id="vr-play-result"', "模板控件：A/B 试听结果 vr-play-result");
has(TPL_SRC, 'id="vr-export-wav"', "模板控件：导出 WAV vr-export-wav");
has(TPL_SRC, 'id="vr-export-mp3"', "模板控件：导出 MP3 vr-export-mp3");
has(TPL_SRC, 'id="vr-reupload"', "模板控件：重新上传 vr-reupload");
has(TPL_SRC, "/tools/audio-trimmer", "互链：在线音频裁剪器");
has(TPL_SRC, "/tools/slowed-reverb", "互链：音频变速混响生成器（单向）");
has(TPL_SRC, "/tools/static/js/vocal_remover.js?v=1", "模板：引用本站 JS");
has(TRIMMER_TPL, "/tools/vocal-remover", "双向互链：裁剪器模板链回本工具");
notHas(SLOWED_TPL, "/tools/vocal-remover", "单向互链：变速混响模板不链回本工具（单向）");
notHas(TPL_SRC, "fonts.googleapis", "模板零 CDN：无外部字体");
ok((TPL_SRC.match(/<script[^>]*src="http/g) || []).length === 0, "模板零外部脚本：无 http script src");
var httpLinks = TPL_SRC.match(/<link[^>]*href="http[^"]*"/g) || [];
eq(httpLinks.length, 1, "模板 http link 仅 canonical 一条");
ok(httpLinks.length === 1 && httpLinks[0].indexOf("https://www.johnkingzcq123.xyz/tools/vocal-remover") !== -1, "模板 http link：仅自家 canonical");

console.log("vocal_remover: pass=" + pass + " fail=" + fail + "，共 " + (pass + fail) + " 断言");
if (fail > 0) process.exit(1);
