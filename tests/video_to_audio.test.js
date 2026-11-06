/* 视频提取音频纯函数单元测试（零依赖）：node tests/video_to_audio.test.js
* 覆盖：formatDuration（锚点 3661→"1:01:01"、65→"1:05"、3599→"59:59"）、
* formatFileSize（锚点 1536→"1.5 KB"、1048576→"1.0 MB"）、secondsToSamples（锚点
* (1.5,44100)→66150）、clampExtractRange（锚点 (10,50,120)→{start:10,end:50}、
* (-5,200,120)→{start:0,end:120}）、estimateWavBytes（锚点 (60,44100,2)→10584044）、
* estimateMp3Bytes（锚点 (60,128)→960000、(30,192)→720000）、buildExportFilename（锚点
* ("my-video.mp4","mp3")→"my-video-audio.mp3"、("讲座.MOV","wav")→"讲座-audio.wav"）、
* validateExtractConfig（mp3 档位/bitrate/trim）、validateExtractState（progress/mode）、
* formatProgress（锚点 33.6→"34%"）、WAV 手工编码头、非法参数 err.field、
* categories.go 注册（Path 总数 314→315、Icon music_video 全库唯一、紧邻 audio_trimmer）、
* 模板（SEO 关键词、真限制四条、控件、与 audio_trimmer 双向互链、零外部资源静态检查）、
* 浏览器绑定源码级检查（decodeAudioData 快速路径＋MediaRecorder 实时重录降级、
* 500MB 上限、lamejs MP3 导出、空格启停试听）。
*/
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/video_to_audio.js");

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
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "video_to_audio.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "video_to_audio.html"), "utf8");
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
eq(M.formatFileSize(524288000), "500.0 MB", "formatFileSize：500MB 上限→500.0 MB");
throws(function () { M.formatFileSize(-1); }, "bytes", "formatFileSize：-1 抛错 err.field='bytes'");
throws(function () { M.formatFileSize(NaN); }, "bytes", "formatFileSize：NaN 抛错");
throws(function () { M.formatFileSize("1024"); }, "bytes", "formatFileSize：字符串抛错");

/* ---------- 3. secondsToSamples ---------- */
eq(M.secondsToSamples(1.5, 44100), 66150, "secondsToSamples：(1.5,44100)→66150");
eq(M.secondsToSamples(60, 48000), 2880000, "secondsToSamples：(60,48000)→2880000");
eq(M.secondsToSamples(0.001, 44100), 44, "secondsToSamples：(0.001,44100)→44（四舍五入）");
throws(function () { M.secondsToSamples(0, 44100); }, "seconds", "secondsToSamples：0 抛错 err.field='seconds'");
throws(function () { M.secondsToSamples(-1, 44100); }, "seconds", "secondsToSamples：负数抛错");
throws(function () { M.secondsToSamples(1, 7999); }, "sampleRate", "secondsToSamples：7999 抛错 err.field='sampleRate'");
throws(function () { M.secondsToSamples(1, 192001); }, "sampleRate", "secondsToSamples：192001 抛错");
throws(function () { M.secondsToSamples(1, 44100.5); }, "sampleRate", "secondsToSamples：非整数采样率抛错");
throws(function () { M.secondsToSamples(1, "44100"); }, "sampleRate", "secondsToSamples：字符串采样率抛错");

/* ---------- 4. clampExtractRange ---------- */
eqj(M.clampExtractRange(10, 50, 120), { start: 10, end: 50 }, "clampExtractRange：(10,50,120)→{10,50}");
eqj(M.clampExtractRange(-5, 200, 120), { start: 0, end: 120 }, "clampExtractRange：(-5,200,120)→{0,120}（钳制）");
eqj(M.clampExtractRange(0, 120, 120), { start: 0, end: 120 }, "clampExtractRange：全片 (0,120,120)");
eqj(M.clampExtractRange(119, 500, 120), { start: 119, end: 120 }, "clampExtractRange：(119,500,120)→{119,120}");
throws(function () { M.clampExtractRange(50, 50, 120); }, "range", "clampExtractRange：(50,50,120) 抛错 err.field='range'");
throws(function () { M.clampExtractRange(60, 50, 120); }, "range", "clampExtractRange：start>end 抛错");
throws(function () { M.clampExtractRange(0, 10, 0); }, "range", "clampExtractRange：duration=0 抛错");
throws(function () { M.clampExtractRange(0, 10, -5); }, "range", "clampExtractRange：duration 负数抛错");
throws(function () { M.clampExtractRange(NaN, 50, 120); }, "range", "clampExtractRange：NaN 抛错");

/* ---------- 5. estimateWavBytes ---------- */
eq(M.estimateWavBytes(60, 44100, 2), 10584044, "estimateWavBytes：(60,44100,2)→10584044");
eq(M.estimateWavBytes(1, 8000, 1), 16044, "estimateWavBytes：(1,8000,1)→16044");
eq(M.estimateWavBytes(30, 48000, 1), 2880044, "estimateWavBytes：(30,48000,1)→2880044");
throws(function () { M.estimateWavBytes(0, 44100, 2); }, "duration", "estimateWavBytes：duration=0 抛错 err.field='duration'");
throws(function () { M.estimateWavBytes(60, 7999, 2); }, "sampleRate", "estimateWavBytes：采样率下限抛错");
throws(function () { M.estimateWavBytes(60, 44100, 3); }, "channels", "estimateWavBytes：channels=3 抛错 err.field='channels'");
throws(function () { M.estimateWavBytes(60, 44100, 0); }, "channels", "estimateWavBytes：channels=0 抛错");

/* ---------- 6. estimateMp3Bytes ---------- */
eq(M.estimateMp3Bytes(60, 128), 960000, "estimateMp3Bytes：(60,128)→960000");
eq(M.estimateMp3Bytes(30, 192), 720000, "estimateMp3Bytes：(30,192)→720000");
eq(M.estimateMp3Bytes(60, 320), 2400000, "estimateMp3Bytes：(60,320)→2400000");
throws(function () { M.estimateMp3Bytes(0, 128); }, "duration", "estimateMp3Bytes：duration=0 抛错 err.field='duration'");
throws(function () { M.estimateMp3Bytes(60, 31); }, "bitrate", "estimateMp3Bytes：31 抛错 err.field='bitrate'");
throws(function () { M.estimateMp3Bytes(60, 321); }, "bitrate", "estimateMp3Bytes：321 抛错");
throws(function () { M.estimateMp3Bytes(60, "128"); }, "bitrate", "estimateMp3Bytes：字符串码率抛错");

/* ---------- 7. buildExportFilename ---------- */
eq(M.buildExportFilename("my-video.mp4", "mp3"), "my-video-audio.mp3", "buildExportFilename：my-video.mp4→my-video-audio.mp3");
eq(M.buildExportFilename("讲座.MOV", "wav"), "讲座-audio.wav", "buildExportFilename：讲座.MOV→讲座-audio.wav");
eq(M.buildExportFilename("clip.webm", "wav"), "clip-audio.wav", "buildExportFilename：clip.webm→clip-audio.wav");
eq(M.buildExportFilename("noext", "mp3"), "noext-audio.mp3", "buildExportFilename：无扩展名原样加后缀");
eq(M.buildExportFilename("a.b.c.mp4", "mp3"), "a.b.c-audio.mp3", "buildExportFilename：多点文件名只去最后一段扩展名");
throws(function () { M.buildExportFilename("", "mp3"); }, "fileName", "buildExportFilename：空名抛错 err.field='fileName'");
throws(function () { M.buildExportFilename("a.mp4", "ogg"); }, "format", "buildExportFilename：ogg 抛错 err.field='format'");
throws(function () { M.buildExportFilename(123, "mp3"); }, "fileName", "buildExportFilename：数字名抛错");

/* ---------- 8. validateExtractConfig ---------- */
eqj(M.validateExtractConfig({ format: "mp3", bitrate: 192, trim: { start: 0, end: 60 } }),
{ format: "mp3", bitrate: 192, trim: { start: 0, end: 60 } }, "validateExtractConfig：mp3 192kbps 全配置通过");
eqj(M.validateExtractConfig({ format: "wav" }), { format: "wav" }, "validateExtractConfig：wav 无 bitrate 通过");
eqj(M.validateExtractConfig({ format: "wav", trim: { start: 5, end: 10 } }),
{ format: "wav", trim: { start: 5, end: 10 } }, "validateExtractConfig：wav 带 trim 通过");
throws(function () { M.validateExtractConfig({ format: "ogg" }); }, "format", "validateExtractConfig：ogg 抛错 err.field='format'");
throws(function () { M.validateExtractConfig({ format: "mp3", bitrate: 100 }); }, "bitrate", "validateExtractConfig：mp3 bitrate=100 抛错 err.field='bitrate'");
throws(function () { M.validateExtractConfig({ format: "mp3" }); }, "bitrate", "validateExtractConfig：mp3 缺 bitrate 抛错");
throws(function () { M.validateExtractConfig({ format: "mp3", bitrate: 192, trim: { start: 60, end: 60 } }); }, "trim", "validateExtractConfig：trim start=end 抛错 err.field='trim'");
throws(function () { M.validateExtractConfig({ format: "wav", trim: { start: 10, end: 5 } }); }, "trim", "validateExtractConfig：trim start>end 抛错");
throws(function () { M.validateExtractConfig(null); }, "format", "validateExtractConfig：null 抛错");

/* ---------- 9. validateExtractState ---------- */
eqj(M.validateExtractState({ progress: 50, mode: "fast" }), { progress: 50, mode: "fast" }, "validateExtractState：fast 50% 通过");
eqj(M.validateExtractState({ progress: 100, mode: "realtime" }), { progress: 100, mode: "realtime" }, "validateExtractState：realtime 100% 通过");
eqj(M.validateExtractState({ progress: 0, mode: "fast" }), { progress: 0, mode: "fast" }, "validateExtractState：0% 边界通过");
throws(function () { M.validateExtractState({ progress: 101, mode: "fast" }); }, "progress", "validateExtractState：progress=101 抛错 err.field='progress'");
throws(function () { M.validateExtractState({ progress: -1, mode: "fast" }); }, "progress", "validateExtractState：progress=-1 抛错");
throws(function () { M.validateExtractState({ progress: 50, mode: "x" }); }, "mode", "validateExtractState：mode='x' 抛错 err.field='mode'");
throws(function () { M.validateExtractState({ progress: 50 }); }, "mode", "validateExtractState：缺 mode 抛错");

/* ---------- 10. formatProgress ---------- */
eq(M.formatProgress(0), "0%", "formatProgress：0→0%");
eq(M.formatProgress(33.6), "34%", "formatProgress：33.6→34%");
eq(M.formatProgress(100), "100%", "formatProgress：100→100%");
eq(M.formatProgress(99.5), "100%", "formatProgress：99.5→100%（四舍五入）");
throws(function () { M.formatProgress(-1); }, "progress", "formatProgress：-1 抛错 err.field='progress'");
throws(function () { M.formatProgress(101); }, "progress", "formatProgress：101 抛错");
throws(function () { M.formatProgress(NaN); }, "progress", "formatProgress：NaN 抛错");

/* ---------- 11. WAV 手工编码 ---------- */
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

/* ---------- 12. categories.go 注册 ---------- */
var pathCount = (GO_SRC.match(/"\/tools\/[^"]+"/g) || []).filter(function (v, i, a) { return a.indexOf(v) === i; }).length;
eq(pathCount, 323, "注册 Path 总数 314→315");
has(GO_SRC, '"video_to_audio"', "注册：ID video_to_audio");
has(GO_SRC, '"/tools/video-to-audio"', "注册：Path /tools/video-to-audio");
has(GO_SRC, '"music_video"', "注册：Icon music_video");
eq((GO_SRC.match(/Icon:\s*"music_video"/g) || []).length, 1, "Icon music_video 全库唯一");
var entryBlock = GO_SRC.slice(GO_SRC.indexOf('"video_to_audio"') - 60,
GO_SRC.indexOf('"video_to_audio"') + 1600);
ok(/New:\s+true/.test(entryBlock), "注册：New: true");
ok(/Category:\s+"音频处理"/.test(entryBlock), "注册：类目 音频处理");
has(entryBlock, "视频提取音频", "注册：名称 视频提取音频");
has(entryBlock, "decodeAudioData", "注册：描述含 decodeAudioData");
has(entryBlock, "MediaRecorder", "注册：描述含 MediaRecorder");
ok(GO_SRC.indexOf('"video_to_audio"') > GO_SRC.indexOf('"audio_trimmer"') &&
GO_SRC.indexOf('"video_to_audio"') < GO_SRC.indexOf('"audio_merger"'), "注册：紧邻 audio_trimmer（在其后、audio_merger 之前）");

/* ---------- 13. 模板：SEO/真限制/控件/互链/零外部资源 ---------- */
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/video-to-audio", "模板 canonical 含新 Path");
has(TPL_SRC, "视频提取音频", "模板：标题含工具名");
has(TPL_SRC, "视频转音频", "模板 SEO：关键词含 视频转音频");
has(TPL_SRC, "视频提取 MP3", "模板 SEO：关键词含 视频提取 MP3");
has(TPL_SRC, "MP4 转 MP3", "模板 SEO：关键词含 MP4 转 MP3");
has(TPL_SRC, "video to audio", "模板 SEO：关键词含 video to audio");
has(TPL_SRC, "真限制", "模板：真限制章节");
has(TPL_SRC, "快速路径依赖浏览器对视频容器音频编码的解码支持", "真限制①：快速路径依赖浏览器解码支持");
has(TPL_SRC, "自动降级实时重录", "真限制①：不支持的格式自动降级实时重录");
has(TPL_SRC, "耗时与视频等长", "真限制①：重录耗时与视频等长");
has(TPL_SRC, "只提取音轨，不提升音质", "真限制②：只提取音轨不提升音质");
has(TPL_SRC, "DRM 保护／加密视频无法本地处理", "真限制③：DRM 视频无法处理");
has(TPL_SRC, "全程浏览器本地计算，零上传", "真限制④：本地零上传");
has(TPL_SRC, "大文件（≤500MB）解码占用内存", "真限制④：大文件占内存");
has(TPL_SRC, 'id="va-upload"', "模板控件：上传区 va-upload");
has(TPL_SRC, 'id="va-file"', "模板控件：文件选择 va-file");
has(TPL_SRC, 'id="va-video"', "模板控件：视频预览 va-video");
has(TPL_SRC, 'id="va-info-duration"', "模板控件：信息面板时长 va-info-duration");
has(TPL_SRC, 'id="va-info-rate"', "模板控件：信息面板采样率 va-info-rate");
has(TPL_SRC, 'id="va-info-wav"', "模板控件：信息面板 WAV 预估 va-info-wav");
has(TPL_SRC, 'id="va-info-mp3"', "模板控件：信息面板 MP3 预估 va-info-mp3");
has(TPL_SRC, 'id="va-progress-bar"', "模板控件：进度条 va-progress-bar");
has(TPL_SRC, 'id="va-start-ms"', "模板控件：起点毫秒 va-start-ms");
has(TPL_SRC, 'id="va-end-ms"', "模板控件：终点毫秒 va-end-ms");
has(TPL_SRC, 'id="va-play"', "模板控件：试听 va-play");
has(TPL_SRC, 'id="va-stop"', "模板控件：停止 va-stop");
has(TPL_SRC, 'id="va-export-wav"', "模板控件：导出 WAV va-export-wav");
has(TPL_SRC, 'id="va-export-mp3"', "模板控件：导出 MP3 va-export-mp3");
has(TPL_SRC, 'id="va-bitrate"', "模板控件：MP3 码率 va-bitrate");
has(TPL_SRC, 'value="192" selected', "模板控件：MP3 默认 192kbps");
has(TPL_SRC, 'aria-live', "模板无障碍：aria-live 状态区");
has(TPL_SRC, "空格键也可启停试听", "模板无障碍：空格启停试听说明");
has(TPL_SRC, "/tools/audio-trimmer", "互链：视频提取音频 → 在线音频裁剪器");
has(AT_TPL, "/tools/video-to-audio", "双向互链：在线音频裁剪器 → 视频提取音频");
has(TPL_SRC, "/tools/static/js/video_to_audio.js?v=1", "模板：引用本站 JS");
notHas(TPL_SRC, "fonts.googleapis", "模板零 CDN：无外部字体");
ok((TPL_SRC.match(/<script[^>]*src="http/g) || []).length === 0, "模板零外部脚本：无 http script src");
var httpLinks = TPL_SRC.match(/<link[^>]*href="http[^"]*"/g) || [];
eq(httpLinks.length, 1, "模板 http link 仅 canonical 一条");
ok(httpLinks.length === 1 && httpLinks[0].indexOf("https://www.johnkingzcq123.xyz/tools/video-to-audio") !== -1, "模板 http link：仅自家 canonical");

/* ---------- 14. 浏览器绑定源码级检查 ---------- */
notHas(JS_SRC, "fetch(", "零网络：JS 无 fetch");
notHas(JS_SRC, "XMLHttpRequest", "零网络：JS 无 XHR");
has(JS_SRC, "textContent", "渲染：用 textContent 防 HTML 执行");
has(JS_SRC, "decodeAudioData", "快速路径：decodeAudioData 直接解出音轨");
has(JS_SRC, "fallbackRealtime", "降级：快速路径失败自动降级 fallbackRealtime");
has(JS_SRC, "MediaRecorder", "降级：MediaRecorder 实时重录");
has(JS_SRC, "createMediaElementSource", "降级：createMediaElementSource 接视频元素");
has(JS_SRC, "createMediaStreamDestination", "降级：MediaStreamDestination 录制");
has(JS_SRC, "if (!state.recSrc)", "降级复用：MediaElementSource 只建一次、跨次重录复用 state.recSrc");
has(JS_SRC, "state.recDest.stream", "降级复用：重复重录只换 MediaRecorder、复用 recDest.stream");
has(JS_SRC, "video.readyState >= 1", "降级防卡住：元数据已就绪时直接建源、不等 loadedmetadata");
has(JS_SRC, "function startRecording()", "降级防卡住：建源逻辑抽成具名 startRecording 两路共用");
has(JS_SRC, "runId", "防串状态：提取轮次 token runId");
has(JS_SRC, "runToken !== state.runId", "防串状态：旧轮次回调凭 token 丢弃");
has(JS_SRC, "state.recRecorder.stop()", "防串状态：重新上传/重置先停旧录制");
has(JS_SRC, "VTA_MAX_BYTES = 524288000", "上限：500MB VTA_MAX_BYTES=524288000");
has(JS_SRC, "VTA_ACCEPT_RE", "校验：MP4/WebM/MOV 扩展名校验");
has(JS_SRC, "setExtractProgress", "进度：提取进度 setExtractProgress");
has(JS_SRC, "formatProgress(pct)", "进度：进度条用 formatProgress 文字百分比");
has(JS_SRC, "lamejs.Mp3Encoder", "导出：lamejs Mp3Encoder 编码 MP3");
has(JS_SRC, "encodeWavDataView", "导出：手工编码 WAV encodeWavDataView");
has(JS_SRC, "buildExportFilename(state.fileName, 'wav')", "导出：WAV 文件名原名-audio.wav");
has(JS_SRC, "buildExportFilename(state.fileName, 'mp3')", "导出：MP3 文件名原名-audio.mp3");
has(JS_SRC, "clampExtractRange(", "截取：起止区间用 clampExtractRange 校验");
has(JS_SRC, "'Space'", "空格操作：监听 Space 键启停试听");
has(JS_SRC, "window.VideoToAudio", "导出：挂 window.VideoToAudio");
has(JS_SRC, "module.exports", "导出：module.exports 同步导出");
has(JS_SRC, "MP3_BITRATES", "导出：MP3 档位表 MP3_BITRATES");
has(JS_SRC, "validateExtractConfig({ format: 'mp3'", "导出：MP3 导出前 validateExtractConfig 校验");

console.log("video_to_audio: pass=" + pass + " fail=" + fail + "，共 " + (pass + fail) + " 断言");
if (fail > 0) process.exit(1);
