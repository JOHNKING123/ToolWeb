/* 在线录音机纯函数单元测试（零依赖）：node tests/voice_recorder.test.js
* 覆盖：formatDuration（锚点 3661→"1:01:01"、65→"1:05"）、
* formatFileSize（锚点 1536→"1.5 KB"、1048576→"1.0 MB"）、pickMimeType（优先序
* audio/webm;codecs=opus > audio/webm > audio/mp4 > audio/ogg;codecs=opus，无匹配返回 ''）、
* buildRecordingName（锚点 1→"录音 1"）、buildExportFilename（锚点 ("录音 1","wav")→
* "录音 1.wav"；ext 限 wav/mp3/webm）、estimateWavBytes（锚点 (60,44100,2)→10584044）、
* estimateMp3Bytes（锚点 (60,128)→960000）、computePeakLevel（锚点 [255]→0.9921875）、
* buildWavHeader（44 字节 RIFF/WAVE 头，(100,44100,2) 各偏移 LE 值锚定）、
* validateRecordConfig（format/bitrate 档位/echoCancellation/noiseSuppression）、
* validateRecordState（status idle/recording/paused/stopped/error；elapsedSec≥0）、
* WAV 手工编码头、非法参数 err.field、categories.go 注册（Path 总数 316→317、
* Icon mic_none 全库唯一、紧邻 audio_trimmer）、模板（SEO 关键词、真限制五条、控件、
* 与 audio_trimmer 双向互链、零外部资源静态检查）、浏览器绑定源码级检查（getUserMedia＋
* MediaRecorder 录制＋AnalyserNode 波形、暂停／继续、lamejs MP3 导出、空格启停）。
* 注：BACKLOG 锚点 pickMimeType 一行写作 (['audio/webm','audio/mp4'])→'audio/webm;codecs=opus'，
* 与规格优先序规则（返回首个在 supported 中的值）相抵——按规则，首选 opus 不在该 supported
* 中时应取次选 'audio/webm'；本测试按规则断言（首选在 supported 中时取首选，
* 另补 ['audio/webm','audio/mp4']→'audio/webm' 一例），规则优先于锚点笔误。
*/
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/voice_recorder.js");

var pass = 0, fail = 0;
function ok(cond, name) {
if (cond) { pass++; }
else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function eqj(a, b, name) { eq(JSON.stringify(a), JSON.stringify(b), name); }
function has(s, sub, name) { ok(s.indexOf(sub) !== -1, name + "（缺 " + sub + "）"); }
function notHas(s, sub, name) { ok(s.indexOf(sub) === -1, name + "（不应含 " + sub + "）"); }
function throws(fn, field, name) {
try { fn(); ok(false, name + "（应抛错却未抛）"); }
catch (e) { ok(!field || e.field === field, name + "（err.field 期望 " + field + "，实得 " + e.field + "）"); }
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "voice_recorder.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "voice_recorder.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");
var AT_TPL = fs.readFileSync(path.join(ROOT, "templates", "audio_trimmer.html"), "utf8");

/* ---------- 1. formatDuration ---------- */
eq(M.formatDuration(0), "0:00", "formatDuration：0→0:00");
eq(M.formatDuration(65), "1:05", "formatDuration：65→1:05");
eq(M.formatDuration(59.9), "0:59", "formatDuration：59.9 向下取整→0:59");
eq(M.formatDuration(3599), "59:59", "formatDuration：3599→59:59");
eq(M.formatDuration(3600), "1:00:00", "formatDuration：3600→1:00:00");
eq(M.formatDuration(3661), "1:01:01", "formatDuration：3661→1:01:01");
eq(M.formatDuration(7325), "2:02:05", "formatDuration：7325→2:02:05");
throws(function () { M.formatDuration(-1); }, "seconds", "formatDuration：-1 抛错 err.field='seconds'");
throws(function () { M.formatDuration(NaN); }, "seconds", "formatDuration：NaN 抛错");
throws(function () { M.formatDuration("65"); }, "seconds", "formatDuration：字符串抛错");
throws(function () { M.formatDuration(Infinity); }, "seconds", "formatDuration：Infinity 抛错");

/* ---------- 2. formatFileSize ---------- */
eq(M.formatFileSize(0), "0 B", "formatFileSize：0→0 B");
eq(M.formatFileSize(512), "512 B", "formatFileSize：512→512 B");
eq(M.formatFileSize(1023), "1023 B", "formatFileSize：1023→1023 B");
eq(M.formatFileSize(1536), "1.5 KB", "formatFileSize：1536→1.5 KB");
eq(M.formatFileSize(1048576), "1.0 MB", "formatFileSize：1048576→1.0 MB");
eq(M.formatFileSize(5242880), "5.0 MB", "formatFileSize：5MB→5.0 MB");
throws(function () { M.formatFileSize(-1); }, "bytes", "formatFileSize：-1 抛错 err.field='bytes'");
throws(function () { M.formatFileSize(NaN); }, "bytes", "formatFileSize：NaN 抛错");
throws(function () { M.formatFileSize("1024"); }, "bytes", "formatFileSize：字符串抛错");

/* ---------- 3. pickMimeType ---------- */
eq(M.pickMimeType(["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]), "audio/webm;codecs=opus", "pickMimeType：首选 opus 在 supported 中时取首选");
eq(M.pickMimeType(["audio/webm", "audio/mp4"]), "audio/webm", "pickMimeType：无 opus 时取次选 audio/webm");
eq(M.pickMimeType(["audio/mp4"]), "audio/mp4", "pickMimeType：仅 mp4 时取 audio/mp4");
eq(M.pickMimeType(["audio/ogg;codecs=opus"]), "audio/ogg;codecs=opus", "pickMimeType：仅 ogg opus 时取之");
eq(M.pickMimeType(["audio/mp4", "audio/webm;codecs=opus"]), "audio/webm;codecs=opus", "pickMimeType：优先序不随 supported 顺序变");
eq(M.pickMimeType([]), "", "pickMimeType：空数组→''");
eq(M.pickMimeType(["audio/x-wav"]), "", "pickMimeType：无匹配→''");
throws(function () { M.pickMimeType("x"); }, "candidates", "pickMimeType：字符串抛错 err.field='candidates'");
throws(function () { M.pickMimeType(); }, "candidates", "pickMimeType：缺参抛错");
throws(function () { M.pickMimeType(null); }, "candidates", "pickMimeType：null 抛错");

/* ---------- 4. buildRecordingName ---------- */
eq(M.buildRecordingName(1), "录音 1", "buildRecordingName：1→录音 1");
eq(M.buildRecordingName(2), "录音 2", "buildRecordingName：2→录音 2");
eq(M.buildRecordingName(10), "录音 10", "buildRecordingName：10→录音 10");
throws(function () { M.buildRecordingName(0); }, "index", "buildRecordingName：0 抛错 err.field='index'");
throws(function () { M.buildRecordingName(-1); }, "index", "buildRecordingName：-1 抛错");
throws(function () { M.buildRecordingName(1.5); }, "index", "buildRecordingName：1.5 抛错");
throws(function () { M.buildRecordingName("1"); }, "index", "buildRecordingName：字符串抛错");

/* ---------- 5. buildExportFilename ---------- */
eq(M.buildExportFilename("录音 1", "wav"), "录音 1.wav", "buildExportFilename：录音 1＋wav→录音 1.wav");
eq(M.buildExportFilename("录音 1", "mp3"), "录音 1.mp3", "buildExportFilename：录音 1＋mp3→录音 1.mp3");
eq(M.buildExportFilename("录音 1", "webm"), "录音 1.webm", "buildExportFilename：录音 1＋webm→录音 1.webm");
eq(M.buildExportFilename("a.mp3", "mp3"), "a.mp3", "buildExportFilename：a.mp3＋mp3→a.mp3（去旧扩展名）");
eq(M.buildExportFilename("a.webm", "wav"), "a.wav", "buildExportFilename：a.webm＋wav→a.wav");
eq(M.buildExportFilename("a.b.c", "mp3"), "a.b.mp3", "buildExportFilename：多点文件名只去最后一段扩展名");
throws(function () { M.buildExportFilename("", "wav"); }, "fileName", "buildExportFilename：空名抛错 err.field='fileName'");
throws(function () { M.buildExportFilename("x", "ogg"); }, "format", "buildExportFilename：ogg 抛错 err.field='format'");
throws(function () { M.buildExportFilename("x", "flac"); }, "format", "buildExportFilename：flac 抛错");
throws(function () { M.buildExportFilename(123, "mp3"); }, "fileName", "buildExportFilename：数字名抛错");

/* ---------- 6. estimateWavBytes ---------- */
eq(M.estimateWavBytes(60, 44100, 2), 10584044, "estimateWavBytes：(60,44100,2)→10584044");
eq(M.estimateWavBytes(10, 44100, 1), 882044, "estimateWavBytes：(10,44100,1)→882044");
eq(M.estimateWavBytes(1, 8000, 1), 16044, "estimateWavBytes：(1,8000,1)→16044");
eq(M.estimateWavBytes(30, 48000, 1), 2880044, "estimateWavBytes：(30,48000,1)→2880044");
throws(function () { M.estimateWavBytes(0, 44100, 2); }, "duration", "estimateWavBytes：duration=0 抛错 err.field='duration'");
throws(function () { M.estimateWavBytes(60, 7999, 2); }, "sampleRate", "estimateWavBytes：采样率下限抛错");
throws(function () { M.estimateWavBytes(60, 44100, 3); }, "channels", "estimateWavBytes：channels=3 抛错 err.field='channels'");
throws(function () { M.estimateWavBytes(60, 44100, 0); }, "channels", "estimateWavBytes：channels=0 抛错");

/* ---------- 7. estimateMp3Bytes ---------- */
eq(M.estimateMp3Bytes(60, 128), 960000, "estimateMp3Bytes：(60,128)→960000");
eq(M.estimateMp3Bytes(30, 192), 720000, "estimateMp3Bytes：(30,192)→720000");
eq(M.estimateMp3Bytes(60, 320), 2400000, "estimateMp3Bytes：(60,320)→2400000");
eq(M.estimateMp3Bytes(60, 64), 480000, "estimateMp3Bytes：(60,64)→480000");
throws(function () { M.estimateMp3Bytes(0, 128); }, "duration", "estimateMp3Bytes：duration=0 抛错 err.field='duration'");
throws(function () { M.estimateMp3Bytes(60, 31); }, "bitrate", "estimateMp3Bytes：31 抛错 err.field='bitrate'");
throws(function () { M.estimateMp3Bytes(60, 321); }, "bitrate", "estimateMp3Bytes：321 抛错");
throws(function () { M.estimateMp3Bytes(60, "128"); }, "bitrate", "estimateMp3Bytes：字符串码率抛错");

/* ---------- 8. computePeakLevel ---------- */
eq(M.computePeakLevel(new Uint8Array([128, 128, 128])), 0, "computePeakLevel：全 128 静音→0");
eq(M.computePeakLevel(new Uint8Array([255])), 0.9921875, "computePeakLevel：[255]→0.9921875（127/128）");
eq(M.computePeakLevel(new Uint8Array([0])), 1, "computePeakLevel：[0]→1（满幅）");
eq(M.computePeakLevel(new Uint8Array([128, 192])), 0.5, "computePeakLevel：[128,192]→0.5（64/128）");
eq(M.computePeakLevel(new Uint8Array([64, 128, 200])), 0.5625, "computePeakLevel：[64,128,200]→0.5625（取最大 72/128）");
throws(function () { M.computePeakLevel(new Uint8Array([])); }, "samples", "computePeakLevel：空数组抛错 err.field='samples'");
throws(function () { M.computePeakLevel([255]); }, "samples", "computePeakLevel：普通数组抛错（须 Uint8Array）");
throws(function () { M.computePeakLevel("x"); }, "samples", "computePeakLevel：字符串抛错");
throws(function () { M.computePeakLevel(null); }, "samples", "computePeakLevel：null 抛错");

/* ---------- 9. buildWavHeader ---------- */
var hdr = M.buildWavHeader(100, 44100, 2);
eq(hdr.length, 44, "buildWavHeader：(100,44100,2) 长度 44");
eq(String.fromCharCode(hdr[0], hdr[1], hdr[2], hdr[3]), "RIFF", "buildWavHeader：0–3 RIFF 魔数");
eq(String.fromCharCode(hdr[8], hdr[9], hdr[10], hdr[11]), "WAVE", "buildWavHeader：8–11 WAVE 魔数");
eq(String.fromCharCode(hdr[12], hdr[13], hdr[14], hdr[15]), "fmt ", "buildWavHeader：12–15 fmt 魔数");
eq(String.fromCharCode(hdr[36], hdr[37], hdr[38], hdr[39]), "data", "buildWavHeader：36–39 data 魔数");
var hdv = new DataView(hdr.buffer);
eq(hdv.getUint32(4, true), 136, "buildWavHeader：偏移 4 chunk size=36+100=136");
eq(hdv.getUint32(16, true), 16, "buildWavHeader：偏移 16 fmt size=16");
eq(hdv.getUint16(20, true), 1, "buildWavHeader：偏移 20 PCM=1");
eq(hdv.getUint16(22, true), 2, "buildWavHeader：偏移 22 声道=2");
eq(hdv.getUint32(24, true), 44100, "buildWavHeader：偏移 24 采样率=44100");
eq(hdv.getUint32(28, true), 176400, "buildWavHeader：偏移 28 byte rate=44100*2*2");
eq(hdv.getUint16(32, true), 4, "buildWavHeader：偏移 32 block align=4");
eq(hdv.getUint16(34, true), 16, "buildWavHeader：偏移 34 16-bit");
eq(hdv.getUint32(40, true), 100, "buildWavHeader：偏移 40 数据字节=100");
var hdr1 = M.buildWavHeader(0, 48000, 1);
eq(hdr1.length, 44, "buildWavHeader：(0,48000,1) 空数据仍 44 字节");
eq(new DataView(hdr1.buffer).getUint32(40, true), 0, "buildWavHeader：空数据偏移 40=0");
throws(function () { M.buildWavHeader(-1, 44100, 2); }, "dataBytes", "buildWavHeader：dataBytes=-1 抛错 err.field='dataBytes'");
throws(function () { M.buildWavHeader(1.5, 44100, 2); }, "dataBytes", "buildWavHeader：dataBytes 非整数抛错");
throws(function () { M.buildWavHeader(100, 100, 2); }, "sampleRate", "buildWavHeader：sampleRate=100 抛错 err.field='sampleRate'");
throws(function () { M.buildWavHeader(100, 44100, 3); }, "channels", "buildWavHeader：channels=3 抛错 err.field='channels'");

/* ---------- 10. validateRecordConfig ---------- */
eqj(M.validateRecordConfig({ format: "mp3", bitrate: 192, echoCancellation: true, noiseSuppression: true }),
{ format: "mp3", bitrate: 192, echoCancellation: true, noiseSuppression: true }, "validateRecordConfig：mp3 192kbps 全配置通过");
eqj(M.validateRecordConfig({ format: "wav" }), { format: "wav" }, "validateRecordConfig：wav 无 bitrate 通过");
eqj(M.validateRecordConfig({ format: "webm" }), { format: "webm" }, "validateRecordConfig：webm 通过");
eqj(M.validateRecordConfig({ format: "mp3", bitrate: 64 }), { format: "mp3", bitrate: 64 }, "validateRecordConfig：mp3 64kbps 下限通过");
eqj(M.validateRecordConfig({ format: "mp3", bitrate: 320 }), { format: "mp3", bitrate: 320 }, "validateRecordConfig：mp3 320kbps 上限通过");
throws(function () { M.validateRecordConfig({ format: "ogg" }); }, "format", "validateRecordConfig：ogg 抛错 err.field='format'");
throws(function () { M.validateRecordConfig({ format: "mp3", bitrate: 100 }); }, "bitrate", "validateRecordConfig：mp3 bitrate=100 抛错 err.field='bitrate'");
throws(function () { M.validateRecordConfig({ format: "mp3" }); }, "bitrate", "validateRecordConfig：mp3 缺 bitrate 抛错");
throws(function () { M.validateRecordConfig({ format: "wav", echoCancellation: "yes" }); }, "echoCancellation", "validateRecordConfig：echoCancellation='yes' 抛错 err.field='echoCancellation'");
throws(function () { M.validateRecordConfig({ format: "wav", noiseSuppression: 1 }); }, "noiseSuppression", "validateRecordConfig：noiseSuppression=1 抛错 err.field='noiseSuppression'");
throws(function () { M.validateRecordConfig(null); }, "format", "validateRecordConfig：null 抛错");
throws(function () { M.validateRecordConfig({}); }, "format", "validateRecordConfig：空对象缺 format 抛错");

/* ---------- 11. validateRecordState ---------- */
eqj(M.validateRecordState({ status: "recording", elapsedSec: 65 }), { status: "recording", elapsedSec: 65 }, "validateRecordState：recording 65s 通过");
eqj(M.validateRecordState({ status: "idle", elapsedSec: 0 }), { status: "idle", elapsedSec: 0 }, "validateRecordState：idle 0s 通过");
eqj(M.validateRecordState({ status: "paused", elapsedSec: 30 }), { status: "paused", elapsedSec: 30 }, "validateRecordState：paused 通过");
eqj(M.validateRecordState({ status: "stopped", elapsedSec: 120 }), { status: "stopped", elapsedSec: 120 }, "validateRecordState：stopped 通过");
eqj(M.validateRecordState({ status: "error", elapsedSec: 0 }), { status: "error", elapsedSec: 0 }, "validateRecordState：error 通过");
throws(function () { M.validateRecordState({ status: "x", elapsedSec: 0 }); }, "status", "validateRecordState：status='x' 抛错 err.field='status'");
throws(function () { M.validateRecordState({ status: "recording", elapsedSec: -1 }); }, "elapsedSec", "validateRecordState：elapsedSec=-1 抛错 err.field='elapsedSec'");
throws(function () { M.validateRecordState({ status: "recording" }); }, "elapsedSec", "validateRecordState：缺 elapsedSec 抛错");
throws(function () { M.validateRecordState({ elapsedSec: 0 }); }, "status", "validateRecordState：缺 status 抛错");
throws(function () { M.validateRecordState(null); }, "status", "validateRecordState：null 抛错");

/* ---------- 12. WAV 手工编码 ---------- */
var pcm = M.floatTo16BitPCM(new Float32Array([0, 0.5, -0.5, 1, -1]));
eq(pcm[0], 0, "floatTo16BitPCM：0→0");
eq(pcm[1], 16384, "floatTo16BitPCM：0.5→16384（0.5*32767 四舍五入）");
eq(pcm[2], -16384, "floatTo16BitPCM：-0.5→-16384");
eq(pcm[3], 32767, "floatTo16BitPCM：1→32767（正满幅钳制）");
eq(pcm[4], -32768, "floatTo16BitPCM：-1→-32768（负满幅）");
var dv = M.encodeWavDataView(44100, 2, new Int16Array([0, 0, 100, -100]));
eq(dv.byteLength, 44 + 8, "encodeWavDataView：44 字节头 + 8 字节数据");
eq(String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3)), "RIFF", "encodeWavDataView：RIFF 魔数");
eq(String.fromCharCode(dv.getUint8(8), dv.getUint8(9), dv.getUint8(10), dv.getUint8(11)), "WAVE", "encodeWavDataView：WAVE 魔数");
eq(dv.getUint32(24, true), 44100, "encodeWavDataView：采样率 44100");
eq(dv.getUint16(22, true), 2, "encodeWavDataView：声道 2");
eq(dv.getUint16(34, true), 16, "encodeWavDataView：16-bit PCM");
eq(dv.getUint32(40, true), 8, "encodeWavDataView：数据字节 8");
eq(dv.getInt16(44, true), 0, "encodeWavDataView：首个采样 0");
eq(dv.getInt16(48, true), 100, "encodeWavDataView：第三个采样 100");

/* ---------- 13. categories.go 注册 ---------- */
var pathCount = (GO_SRC.match(/"\/tools\/[^"]+"/g) || []).filter(function (v, i, a) { return a.indexOf(v) === i; }).length;
eq(pathCount, 319, "注册 Path 总数 316→317");
has(GO_SRC, '"voice_recorder"', "注册：ID voice_recorder");
has(GO_SRC, '"/tools/voice-recorder"', "注册：Path /tools/voice-recorder");
has(GO_SRC, '"mic_none"', "注册：Icon mic_none");
eq((GO_SRC.match(/Icon:\s*"mic_none"/g) || []).length, 1, "Icon mic_none 全库唯一");
var entryBlock = GO_SRC.slice(GO_SRC.indexOf('"voice_recorder"') - 60,
GO_SRC.indexOf('"voice_recorder"') + 1600);
ok(/New:\s+true/.test(entryBlock), "注册：New: true");
ok(/Category:\s+"音频处理"/.test(entryBlock), "注册：类目 音频处理");
has(entryBlock, "在线录音机", "注册：名称 在线录音机");
has(entryBlock, "MediaRecorder", "注册：描述含 MediaRecorder");
has(entryBlock, "getUserMedia", "注册：描述含 getUserMedia");
ok(GO_SRC.indexOf('"voice_recorder"') > GO_SRC.indexOf('"audio_trimmer"') &&
GO_SRC.indexOf('"voice_recorder"') < GO_SRC.indexOf('"video_to_audio"'), "注册：紧邻 audio_trimmer（在其后、video_to_audio 之前）");

/* ---------- 14. 模板：SEO/真限制/控件/互链/零外部资源 ---------- */
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/voice-recorder", "模板 canonical 含新 Path");
has(TPL_SRC, "在线录音机", "模板：标题含工具名");
has(TPL_SRC, "在线录音", "模板 SEO：关键词含 在线录音");
has(TPL_SRC, "语音备忘录", "模板 SEO：关键词含 语音备忘录");
has(TPL_SRC, "浏览器录音", "模板 SEO：关键词含 浏览器录音");
has(TPL_SRC, "免费录音机", "模板 SEO：关键词含 免费录音机");
has(TPL_SRC, "真限制", "模板：真限制章节");
has(TPL_SRC, "只录音、不录屏", "真限制①：只录音不录屏");
has(TPL_SRC, "录屏请用", "真限制①：录屏请用 screen_recorder");
has(TPL_SRC, "/tools/screen-recorder", "真限制①：明示录屏用 screen_recorder");
has(TPL_SRC, "录音列表仅保留在当前会话", "真限制②：列表仅当前会话");
has(TPL_SRC, "刷新／关闭页面后消失", "真限制②：刷新后消失");
has(TPL_SRC, "请及时下载导出", "真限制②：请及时下载导出");
has(TPL_SRC, "不设人工时长上限", "真限制③：不设人工时长上限");
has(TPL_SRC, "浏览器内存限制", "真限制③：受浏览器内存限制");
has(TPL_SRC, "切后台可能中断录音", "真限制③：移动端切后台可能中断");
has(TPL_SRC, "WAV／MP3 导出需浏览器解码录音", "真限制④：WAV/MP3 导出需解码");
has(TPL_SRC, "解码失败时仅可下载原始 WebM", "真限制④：解码失败仅可下 WebM");
has(TPL_SRC, "全程浏览器本地计算，零上传", "真限制⑤：本地零上传");
has(TPL_SRC, 'id="vr-mic"', "模板控件：麦克风选择 vr-mic");
has(TPL_SRC, 'id="vr-echo"', "模板控件：回声消除 vr-echo");
has(TPL_SRC, 'id="vr-noise"', "模板控件：噪声抑制 vr-noise");
has(TPL_SRC, 'id="vr-start"', "模板控件：开始录音 vr-start");
has(TPL_SRC, 'id="vr-pause"', "模板控件：暂停 vr-pause");
has(TPL_SRC, 'id="vr-resume"', "模板控件：继续 vr-resume");
has(TPL_SRC, 'id="vr-stop"', "模板控件：停止 vr-stop");
has(TPL_SRC, 'id="vr-timer"', "模板控件：计时 vr-timer");
has(TPL_SRC, 'id="vr-wave"', "模板控件：波形 vr-wave");
has(TPL_SRC, 'id="vr-meter-fill"', "模板控件：音量表 vr-meter-fill");
has(TPL_SRC, 'id="vr-list"', "模板控件：录音列表 vr-list");
has(TPL_SRC, 'id="vr-clear"', "模板控件：清空列表 vr-clear");
has(TPL_SRC, 'id="vr-info-duration"', "模板控件：信息面板时长 vr-info-duration");
has(TPL_SRC, 'id="vr-info-rate"', "模板控件：信息面板采样率 vr-info-rate");
has(TPL_SRC, 'id="vr-info-channels"', "模板控件：信息面板声道 vr-info-channels");
has(TPL_SRC, 'id="vr-info-size"', "模板控件：信息面板体积 vr-info-size");
has(TPL_SRC, 'id="vr-info-wav"', "模板控件：信息面板 WAV 预估 vr-info-wav");
has(TPL_SRC, 'id="vr-info-mp3"', "模板控件：信息面板 MP3 预估 vr-info-mp3");
has(TPL_SRC, 'id="vr-bitrate"', "模板控件：MP3 码率 vr-bitrate");
has(TPL_SRC, 'value="192" selected', "模板控件：MP3 默认 192kbps");
has(TPL_SRC, 'aria-live', "模板无障碍：aria-live 状态区");
has(TPL_SRC, "空格键也可开始／停止录音", "模板无障碍：空格启停录音说明");
has(TPL_SRC, "/tools/audio-trimmer", "互链：在线录音机 → 在线音频裁剪器");
has(AT_TPL, "/tools/voice-recorder", "双向互链：在线音频裁剪器 → 在线录音机");
has(TPL_SRC, "/tools/static/js/voice_recorder.js?v=1", "模板：引用本站 JS");
has(TPL_SRC, "/tools/static/js/vendor/lamejs.min.js?v=1", "模板：引用本站 lamejs vendor");
notHas(TPL_SRC, "fonts.googleapis", "模板零 CDN：无外部字体");
ok((TPL_SRC.match(/<script[^>]*src="http/g) || []).length === 0, "模板零外部脚本：无 http script src");
var httpLinks = TPL_SRC.match(/<link[^>]*href="http[^"]*"/g) || [];
eq(httpLinks.length, 1, "模板 http link 仅 canonical 一条");
ok(httpLinks.length === 1 && httpLinks[0].indexOf("https://www.johnkingzcq123.xyz/tools/voice-recorder") !== -1, "模板 http link：仅自家 canonical");

/* ---------- 15. 浏览器绑定源码级检查 ---------- */
notHas(JS_SRC, "fetch(", "零网络：JS 无 fetch");
notHas(JS_SRC, "XMLHttpRequest", "零网络：JS 无 XHR");
has(JS_SRC, "textContent", "渲染：用 textContent 防 HTML 执行");
has(JS_SRC, "getUserMedia", "采集：getUserMedia 麦克风采集");
has(JS_SRC, "enumerateDevices", "采集：enumerateDevices 列麦克风");
has(JS_SRC, "echoCancellation", "采集：回声消除开关");
has(JS_SRC, "noiseSuppression", "采集：噪声抑制开关");
has(JS_SRC, "MediaRecorder", "录制：MediaRecorder 本地录制");
has(JS_SRC, "MediaRecorder.isTypeSupported", "录制：isTypeSupported 探测 MIME");
has(JS_SRC, "pickMimeType(supported)", "录制：MIME 用 pickMimeType 优先序挑选");
has(JS_SRC, "recorder.pause()", "暂停：MediaRecorder.pause()");
has(JS_SRC, "recorder.resume()", "继续：MediaRecorder.resume()");
has(JS_SRC, "recorder.stop()", "停止：MediaRecorder.stop()");
has(JS_SRC, "ondataavailable", "录制：ondataavailable 收集数据块");
has(JS_SRC, "AnalyserNode", "波形：AnalyserNode 实时分析");
has(JS_SRC, "getByteTimeDomainData", "波形：getByteTimeDomainData 取时域数据");
has(JS_SRC, "computePeakLevel(state.analyserData)", "音量表：computePeakLevel 算峰值电平");
has(JS_SRC, "fmtClock", "计时：hh:mm:ss 零补齐计时 fmtClock");
has(JS_SRC, "buildRecordingName(++state.recCount)", "列表：停止后默认名 buildRecordingName 递增");
has(JS_SRC, "decodeAudioData", "导出：decodeAudioData 解码供 WAV/MP3 导出");
has(JS_SRC, "decodeFailed", "导出：解码失败标记 decodeFailed，仅 WebM 可导出");
has(JS_SRC, "lamejs.Mp3Encoder", "导出：lamejs Mp3Encoder 编码 MP3");
has(JS_SRC, "encodeWavDataView", "导出：手工编码 WAV encodeWavDataView");
has(JS_SRC, "buildExportFilename(rec.name, 'wav')", "导出：WAV 文件名录音名.wav");
has(JS_SRC, "buildExportFilename(rec.name, 'mp3')", "导出：MP3 文件名录音名.mp3");
has(JS_SRC, "buildExportFilename(rec.name, 'webm')", "导出：WebM 文件名录音名.webm");
has(JS_SRC, "validateRecordConfig({ format: 'mp3'", "导出：MP3 导出前 validateRecordConfig 校验");
has(JS_SRC, "validateRecordState({ status:", "状态：录音状态切换过 validateRecordState 校验");
has(JS_SRC, "'Space'", "空格操作：监听 Space 键开始／停止录音");
has(JS_SRC, "window.VoiceRecorder", "导出：挂 window.VoiceRecorder");
has(JS_SRC, "module.exports", "导出：module.exports 同步导出");
has(JS_SRC, "MP3_BITRATES", "导出：MP3 档位表 MP3_BITRATES");
has(JS_SRC, "renameRecording", "列表：重命名 renameRecording");
has(JS_SRC, "deleteRecording", "列表：删除 deleteRecording");
has(JS_SRC, "playRecording", "列表：试听 playRecording");

console.log("voice_recorder: pass=" + pass + " fail=" + fail + "，共 " + (pass + fail) + " 断言");
if (fail > 0) process.exit(1);
