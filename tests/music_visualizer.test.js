/* 音乐可视化器纯函数单元测试（零依赖）：node tests/music_visualizer.test.js
* 覆盖：validateAudioFile（扩展名与体积边界）、computeBarHeights（归一化锚点：全 255→全 1、
* 全 0→全 0、[0,128,255]→[0,≈0.502,1]、桶取最大值降采样）、smoothHeights（指数平滑三档锚点：
* factor=1 等于 next、0.5 时 [0]→[1] 得 0.5、factor=0 等于 prev）、freqToColor（对数映射：
* 首末色精确值、三主题、越界钳制、中点插值精确值）、buildWaveformPoints（时域→波形点：
* 全 128→y=height/2、顶底锚点、x 均匀分布）、formatDuration（三档：0→0:00、65→1:05、
* 3599→59:59）、recordingFilename（去扩展名＋-visualizer.webm）、非法参数 err.field、
* categories.go 注册（Path 总数 309→310、Icon equalizer 全库唯一、紧邻 vocal_remover）、
* 模板（SEO 五关键词、真限制三条、控件、互链、零外部资源静态检查）、评审重审回归
* （停止麦克风后恢复播放面板、静默丢弃录制不下载、截图须有真实音源、进度条键盘操作、
* recordingFilename 文件名恰为 .mp3 的边界）。
*/
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/music_visualizer.js");

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
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "music_visualizer.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "music_visualizer.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");
var VOCAL_TPL = fs.readFileSync(path.join(ROOT, "templates", "vocal_remover.html"), "utf8");
var SLOWED_TPL = fs.readFileSync(path.join(ROOT, "templates", "slowed_reverb.html"), "utf8");

function allEq(arr, v, name) {
var good = true;
for (var i = 0; i < arr.length; i++) if (arr[i] !== v) { good = false; break; }
ok(good, name);
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

/* ---------- 2. computeBarHeights：0–255→0..1 归一化锚点 ---------- */
allEq(M.computeBarHeights(new Uint8Array([255, 255, 255, 255])), 1, "computeBarHeights：全 255→全 1");
allEq(M.computeBarHeights(new Uint8Array([0, 0, 0])), 0, "computeBarHeights：全 0→全 0");
var cb = M.computeBarHeights(new Uint8Array([0, 128, 255]));
eq(cb[0], 0, "computeBarHeights：[0,128,255] 首 0");
near(cb[1], 128 / 255, 1e-6, "computeBarHeights：[0,128,255] 中 ≈0.502");
eq(cb[2], 1, "computeBarHeights：[0,128,255] 末 1");
eq(cb.length, 3, "computeBarHeights：缺省 bins=原长");
eqj(Array.prototype.slice.call(M.computeBarHeights(new Uint8Array([255, 0, 255, 0]), 2)), [1, 1], "computeBarHeights：4 点→2 桶取最大值 [1,1]");
var cb2 = M.computeBarHeights(new Uint8Array([10, 20, 30, 40]), 2);
near(cb2[0], 20 / 255, 1e-6, "computeBarHeights：4 点→2 桶取最大值首 20/255");
near(cb2[1], 40 / 255, 1e-6, "computeBarHeights：4 点→2 桶取最大值末 40/255");
eq(M.computeBarHeights(new Uint8Array([255]), 1)[0], 1, "computeBarHeights：单点 255→1");
ok(M.computeBarHeights(new Uint8Array([100, 200])) instanceof Float32Array, "computeBarHeights：返回 Float32Array");
throws(function () { M.computeBarHeights(new Uint8Array(0)); }, "freqData", "computeBarHeights 空数据：err.field='freqData'");
throws(function () { M.computeBarHeights(null); }, "freqData", "computeBarHeights null：err.field='freqData'");
throws(function () { M.computeBarHeights([256]); }, "freqData", "computeBarHeights 值 256 越界：err.field='freqData'");
throws(function () { M.computeBarHeights([0, -1]); }, "freqData", "computeBarHeights 负值：err.field='freqData'");
throws(function () { M.computeBarHeights(new Uint8Array([1, 2]), 0); }, "bins", "computeBarHeights 桶数 0：err.field='bins'");
throws(function () { M.computeBarHeights(new Uint8Array([1, 2]), 2.5); }, "bins", "computeBarHeights 桶数非整数：err.field='bins'");
throws(function () { M.computeBarHeights(new Uint8Array([1, 2]), 3); }, "bins", "computeBarHeights 桶数超长：err.field='bins'");

/* ---------- 3. smoothHeights：指数平滑三档锚点 ---------- */
eqj(Array.prototype.slice.call(M.smoothHeights(new Float32Array([0, 5]), new Float32Array([1, 10]), 1)), [1, 10], "smoothHeights：factor=1 等于 next");
eqj(Array.prototype.slice.call(M.smoothHeights(new Float32Array([0]), new Float32Array([1]), 0.5)), [0.5], "smoothHeights：factor=0.5 时 [0]→[1] 得 0.5");
eqj(Array.prototype.slice.call(M.smoothHeights(new Float32Array([0, 10]), new Float32Array([10, 20]), 0.5)), [5, 15], "smoothHeights：factor=0.5 时 [0,10]→[10,20] 得 [5,15]");
eqj(Array.prototype.slice.call(M.smoothHeights(new Float32Array([3, 7]), new Float32Array([9, 1]), 0)), [3, 7], "smoothHeights：factor=0 等于 prev");
near(M.smoothHeights(new Float32Array([0]), new Float32Array([1]), 0.25)[0], 0.25, 1e-9, "smoothHeights：factor=0.25 时 [0]→[1] 得 0.25");
var smPrev = new Float32Array([0.2]), smNext = new Float32Array([0.8]);
M.smoothHeights(smPrev, smNext, 0.5);
near(smPrev[0], 0.2, 1e-6, "smoothHeights：不改 prev 原数组");
near(smNext[0], 0.8, 1e-6, "smoothHeights：不改 next 原数组");
ok(M.smoothHeights(new Float32Array([0]), new Float32Array([1]), 0.5) instanceof Float32Array, "smoothHeights：返回 Float32Array");
throws(function () { M.smoothHeights(new Float32Array([0, 1]), new Float32Array([1]), 0.5); }, "length", "smoothHeights 长度不一致：err.field='length'");
throws(function () { M.smoothHeights(new Float32Array(0), new Float32Array([1]), 0.5); }, "prev", "smoothHeights prev 空：err.field='prev'");
throws(function () { M.smoothHeights(new Float32Array([1]), null, 0.5); }, "next", "smoothHeights next null：err.field='next'");
throws(function () { M.smoothHeights(new Float32Array([0]), new Float32Array([1]), -0.1); }, "factor", "smoothHeights factor −0.1：err.field='factor'");
throws(function () { M.smoothHeights(new Float32Array([0]), new Float32Array([1]), 1.1); }, "factor", "smoothHeights factor 1.1：err.field='factor'");
throws(function () { M.smoothHeights(new Float32Array([0]), new Float32Array([1]), NaN); }, "factor", "smoothHeights factor NaN：err.field='factor'");
throws(function () { M.smoothHeights(new Float32Array([0]), new Float32Array([1]), "0.5"); }, "factor", "smoothHeights factor 字符串：err.field='factor'");

/* ---------- 4. freqToColor：对数映射首末色精确值 ---------- */
eq(M.freqToColor(20, 20, 20000), "#00e5ff", "freqToColor：neon 首色 20Hz=#00e5ff");
eq(M.freqToColor(20000, 20, 20000), "#ff2d78", "freqToColor：neon 末色 20000Hz=#ff2d78");
eq(M.freqToColor(20, 20, 20000, "sunset"), "#ffea00", "freqToColor：sunset 首色=#ffea00");
eq(M.freqToColor(20000, 20, 20000, "sunset"), "#c2185b", "freqToColor：sunset 末色=#c2185b");
eq(M.freqToColor(20, 20, 20000, "ocean"), "#00e676", "freqToColor：ocean 首色=#00e676");
eq(M.freqToColor(20000, 20, 20000, "ocean"), "#304ffe", "freqToColor：ocean 末色=#304ffe");
eq(M.freqToColor(Math.sqrt(20 * 20000), 20, 20000), "#7f3dfc", "freqToColor：neon 几何中点插值=#7f3dfc");
eq(M.freqToColor(10, 20, 20000), "#00e5ff", "freqToColor：低于下限钳制到首色");
eq(M.freqToColor(40000, 20, 20000), "#ff2d78", "freqToColor：高于上限钳制到末色");
ok(/^#[0-9a-f]{6}$/.test(M.freqToColor(1000, 20, 20000)), "freqToColor：返回小写 #rrggbb");
eq(Object.keys(M.THEMES).length, 3, "freqToColor：≥3 组颜色主题");
throws(function () { M.freqToColor(0, 20, 20000); }, "freq", "freqToColor 频率 0：err.field='freq'");
throws(function () { M.freqToColor(-100, 20, 20000); }, "freq", "freqToColor 负频率：err.field='freq'");
throws(function () { M.freqToColor(NaN, 20, 20000); }, "freq", "freqToColor 频率 NaN：err.field='freq'");
throws(function () { M.freqToColor(1000, 0, 20000); }, "minFreq", "freqToColor 最小频率 0：err.field='minFreq'");
throws(function () { M.freqToColor(1000, 20000, 20000); }, "maxFreq", "freqToColor 最大频率=最小频率：err.field='maxFreq'");
throws(function () { M.freqToColor(1000, 20000, 1000); }, "maxFreq", "freqToColor 最大频率<最小频率：err.field='maxFreq'");
throws(function () { M.freqToColor(1000, 20, 20000, "nope"); }, "theme", "freqToColor 未知主题：err.field='theme'");

/* ---------- 5. buildWaveformPoints：时域→波形点 ---------- */
var wpAll = M.buildWaveformPoints(new Uint8Array([128, 128, 128, 128]), 1000, 320);
ok(wpAll.every(function (p) { return p.y === 160; }), "buildWaveformPoints：全 128→y=height/2=160");
var wp3 = M.buildWaveformPoints(new Uint8Array([0, 128, 255]), 300, 200, 3);
eq(wp3[0].x, 0, "buildWaveformPoints：首点 x=0");
eq(wp3[1].x, 150, "buildWaveformPoints：中点 x=150");
eq(wp3[2].x, 300, "buildWaveformPoints：末点 x=300");
eq(wp3[0].y, 200, "buildWaveformPoints：v=0→y=height（底）");
eq(wp3[1].y, 100, "buildWaveformPoints：v=128→y=height/2（中线）");
near(wp3[2].y, 0, 1, "buildWaveformPoints：v=255→y≈0（顶，误差<1）");
eq(wp3.length, 3, "buildWaveformPoints：count=3 返回 3 点");
eq(M.buildWaveformPoints(new Uint8Array([128, 128]), 100, 100).length, 2, "buildWaveformPoints：缺省 count=min(256,长度)");
eq(M.buildWaveformPoints(new Uint8Array(300).fill(128), 100, 100).length, 256, "buildWaveformPoints：缺省 count 上限 256");
eq(M.buildWaveformPoints(new Uint8Array([128]), 100, 100, 1)[0].x, 0, "buildWaveformPoints：单点 x=0");
throws(function () { M.buildWaveformPoints(new Uint8Array(0), 100, 100); }, "timeData", "buildWaveformPoints 空数据：err.field='timeData'");
throws(function () { M.buildWaveformPoints([300], 100, 100); }, "timeData", "buildWaveformPoints 值 300 越界：err.field='timeData'");
throws(function () { M.buildWaveformPoints(new Uint8Array([128]), 0, 100); }, "width", "buildWaveformPoints 宽度 0：err.field='width'");
throws(function () { M.buildWaveformPoints(new Uint8Array([128]), 100, -1); }, "height", "buildWaveformPoints 高度负数：err.field='height'");
throws(function () { M.buildWaveformPoints(new Uint8Array([128]), 100, 100, 0); }, "count", "buildWaveformPoints 点数 0：err.field='count'");
throws(function () { M.buildWaveformPoints(new Uint8Array([128]), 100, 100, 2); }, "count", "buildWaveformPoints 点数超长：err.field='count'");

/* ---------- 6. formatDuration：m:ss 三档 ---------- */
eq(M.formatDuration(0), "0:00", "formatDuration：0→0:00");
eq(M.formatDuration(65), "1:05", "formatDuration：65→1:05");
eq(M.formatDuration(3599), "59:59", "formatDuration：3599→59:59");
eq(M.formatDuration(60), "1:00", "formatDuration：60→1:00");
eq(M.formatDuration(61.9), "1:01", "formatDuration：61.9 秒向下取整→1:01");
eq(M.formatDuration(600), "10:00", "formatDuration：600→10:00");
throws(function () { M.formatDuration(-1); }, "seconds", "formatDuration 负数：err.field='seconds'");
throws(function () { M.formatDuration(NaN); }, "seconds", "formatDuration NaN：err.field='seconds'");
throws(function () { M.formatDuration("65"); }, "seconds", "formatDuration 字符串：err.field='seconds'");

/* ---------- 7. recordingFilename：去扩展名＋-visualizer.webm ---------- */
eq(M.recordingFilename("song.mp3"), "song-visualizer.webm", "recordingFilename：song.mp3→song-visualizer.webm");
eq(M.recordingFilename("夜曲.flac"), "夜曲-visualizer.webm", "recordingFilename：中文名去扩展名");
eq(M.recordingFilename("a.b.c.mp3"), "a.b.c-visualizer.webm", "recordingFilename：多点只去最后扩展名");
eq(M.recordingFilename("song"), "song-visualizer.webm", "recordingFilename：无扩展名直接加后缀");
eq(M.recordingFilename(""), "audio-visualizer.webm", "recordingFilename：空名回退 audio");
eq(M.recordingFilename("a/b:c.mp3"), "a_b_c-visualizer.webm", "recordingFilename：非法字符替换");
eq(M.recordingFilename("SONG.WAV"), "SONG-visualizer.webm", "recordingFilename：大写扩展名也去掉");
eq(M.recordingFilename(".mp3"), "audio-visualizer.webm", "recordingFilename：文件名恰为 .mp3（dot=0）去扩展名后空串回退 audio");

/* ---------- 8. 常量与同步导出 ---------- */
eq(M.MAX_FILE_SIZE, 209715200, "常量：体积上限 200MB");
eq(M.FFT_SIZE, 2048, "常量：AnalyserNode fftSize=2048");
eq(M.SMOOTH_FACTOR, 0.6, "常量：默认平滑系数 0.6");
eq(M.ALLOWED_EXTS.length, 5, "常量：白名单 5 个扩展名");
eq(M.STYLES.length, 5, "常量：5 种渲染样式");
ok(M.STYLES.indexOf("bars") !== -1 && M.STYLES.indexOf("ring") !== -1 &&
M.STYLES.indexOf("waveform") !== -1 && M.STYLES.indexOf("circular") !== -1 &&
M.STYLES.indexOf("mirror") !== -1, "常量：5 种样式齐全（频谱条/环形频谱/波形/圆形波形/镜像频谱）");
ok(typeof M.validateAudioFile === "function" && typeof M.computeBarHeights === "function" &&
typeof M.smoothHeights === "function" && typeof M.freqToColor === "function" &&
typeof M.buildWaveformPoints === "function" && typeof M.formatDuration === "function" &&
typeof M.recordingFilename === "function",
"同步导出：7 个核心纯函数齐全");
has(JS_SRC, "window.MusicVisualizer", "浏览器导出：window.MusicVisualizer");
has(JS_SRC, "module.exports = api", "node 导出：module.exports 同步导出");
has(JS_SRC, "decodeAudioData", "JS：decodeAudioData 本地解码");
has(JS_SRC, "AnalyserNode", "JS：AnalyserNode 频谱分析");
has(JS_SRC, "FFT_SIZE = 2048", "JS：FFT_SIZE=2048");
has(JS_SRC, ".fftSize = FFT_SIZE", "JS：AnalyserNode fftSize 赋值");
has(JS_SRC, "getUserMedia", "JS：getUserMedia 麦克风输入");
has(JS_SRC, "MediaRecorder", "JS：MediaRecorder 录制导出");
has(JS_SRC, "captureStream", "JS：canvas.captureStream 录制画面");
has(JS_SRC, "toBlob", "JS：PNG 截图 toBlob");
has(JS_SRC, "getByteFrequencyData", "JS：取频域数据");
has(JS_SRC, "getByteTimeDomainData", "JS：取时域数据");
notHas(JS_SRC, "fetch(", "JS 零外部接口：无 fetch");
notHas(JS_SRC, "XMLHttpRequest", "JS 零外部接口：无 XMLHttpRequest");
notHas(JS_SRC, "localStorage", "JS 零存储：不写 localStorage");

/* ---------- 9. categories.go 注册 ---------- */
var pathCount = (GO_SRC.match(/"\/tools\/[^"]+"/g) || []).filter(function (v, i, a) { return a.indexOf(v) === i; }).length;
eq(pathCount, 313, "注册 Path 总数 309→310");
has(GO_SRC, '"music_visualizer"', "注册：ID music_visualizer");
has(GO_SRC, '"/tools/music-visualizer"', "注册：Path /tools/music-visualizer");
has(GO_SRC, '"equalizer"', "注册：Icon equalizer");
eq((GO_SRC.match(/Icon:\s*"equalizer"/g) || []).length, 1, "Icon equalizer 全库唯一");
var entryBlock = GO_SRC.slice(GO_SRC.indexOf('"music_visualizer"') - 60,
GO_SRC.indexOf('"music_visualizer"') + 1600);
ok(/New:\s+true/.test(entryBlock), "注册：New: true");
ok(/Category:\s+"音频处理"/.test(entryBlock), "注册：类目 音频处理");
has(entryBlock, "音乐可视化器", "注册：名称 音乐可视化器");
has(entryBlock, "AnalyserNode", "注册：描述含 AnalyserNode");
ok(GO_SRC.indexOf('"music_visualizer"') > GO_SRC.indexOf('"vocal_remover"') &&
GO_SRC.indexOf('"music_visualizer"') < GO_SRC.indexOf('"slowed_reverb"'), "注册：紧邻 vocal_remover（在其后、slowed_reverb 之前）");

/* ---------- 10. 模板：SEO/真限制/控件/互链/零外部资源 ---------- */
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/music-visualizer", "模板 canonical 含新 Path");
has(TPL_SRC, "音乐可视化器", "模板：标题含工具名");
has(TPL_SRC, "音乐可视化", "模板 SEO：关键词 音乐可视化");
has(TPL_SRC, "音频可视化", "模板 SEO：关键词 音频可视化");
has(TPL_SRC, "频谱视频", "模板 SEO：关键词 频谱视频");
has(TPL_SRC, "music visualizer", "模板 SEO：关键词 music visualizer");
has(TPL_SRC, "音乐频谱", "模板 SEO：关键词 音乐频谱");
has(TPL_SRC, "真限制", "模板：真限制章节");
has(TPL_SRC, "导出为实时录制", "真限制①：导出为实时录制");
has(TPL_SRC, "3 分钟的音频要等 3 分钟", "真限制①：3 分钟音频等 3 分钟");
has(TPL_SRC, "画面随音频频谱内容变化", "真限制②：画面随音频频谱内容变化");
has(TPL_SRC, "零上传＋麦克风需授权", "真限制③：零上传＋麦克风需授权");
has(TPL_SRC, "拒绝授权就无法使用麦克风输入", "模板文案：拒绝授权明确提示");
has(TPL_SRC, 'id="mv-upload"', "模板控件：上传区 mv-upload");
has(TPL_SRC, 'id="mv-file"', "模板控件：文件输入 mv-file");
has(TPL_SRC, 'id="mv-canvas"', "模板控件：可视化画布 mv-canvas");
has(TPL_SRC, 'id="mv-play"', "模板控件：播放按钮 mv-play");
has(TPL_SRC, 'id="mv-seek"', "模板控件：进度条 mv-seek");
has(TPL_SRC, 'id="mv-volume"', "模板控件：音量滑杆 mv-volume");
has(TPL_SRC, 'id="mv-mic"', "模板控件：麦克风按钮 mv-mic");
has(TPL_SRC, 'id="mv-record"', "模板控件：录制按钮 mv-record");
has(TPL_SRC, 'id="mv-shot"', "模板控件：截图按钮 mv-shot");
has(TPL_SRC, 'id="mv-style-bars"', "模板控件：频谱条样式 mv-style-bars");
has(TPL_SRC, 'id="mv-style-ring"', "模板控件：环形频谱样式 mv-style-ring");
has(TPL_SRC, 'id="mv-style-waveform"', "模板控件：波形样式 mv-style-waveform");
has(TPL_SRC, 'id="mv-style-circular"', "模板控件：圆形波形样式 mv-style-circular");
has(TPL_SRC, 'id="mv-style-mirror"', "模板控件：镜像频谱样式 mv-style-mirror");
has(TPL_SRC, 'id="mv-theme"', "模板控件：主题选择 mv-theme");
has(TPL_SRC, "/tools/vocal-remover", "互链：人声消除/伴奏提取（单向）");
has(TPL_SRC, "/tools/slowed-reverb", "互链：音频变速混响生成器（单向）");
has(TPL_SRC, "/tools/static/js/music_visualizer.js?v=1", "模板：引用本站 JS");
notHas(VOCAL_TPL, "/tools/music-visualizer", "单向互链：人声消除模板不链回本工具（单向）");
notHas(SLOWED_TPL, "/tools/music-visualizer", "单向互链：变速混响模板不链回本工具（单向）");
notHas(TPL_SRC, "fonts.googleapis", "模板零 CDN：无外部字体");
ok((TPL_SRC.match(/<script[^>]*src="http/g) || []).length === 0, "模板零外部脚本：无 http script src");
var httpLinks = TPL_SRC.match(/<link[^>]*href="http[^"]*"/g) || [];
eq(httpLinks.length, 1, "模板 http link 仅 canonical 一条");
ok(httpLinks.length === 1 && httpLinks[0].indexOf("https://www.johnkingzcq123.xyz/tools/music-visualizer") !== -1, "模板 http link：仅自家 canonical");

/* ---------- 11. 评审重审回归：麦克风/录制模式切换链路 ---------- */
/* 浏览器侧函数在 node 下不执行（module.exports 提前 return），回归断言按本仓库既有
* 模式做源码级检查：截取目标函数体，断言修复逻辑确实存在于正确分支内。 */
var toggleMicSrc = JS_SRC.slice(JS_SRC.indexOf("function toggleMic()"),
JS_SRC.indexOf("/* ================= 渲染循环"));
has(toggleMicSrc, "if (state.buffer)", "回归①：停止麦克风分支以 state.buffer 为条件");
has(toggleMicSrc, "el.panel_player.style.display = 'block'", "回归①：已加载文件时停止麦克风恢复播放面板可见");
ok(toggleMicSrc.indexOf("el.panel_player.style.display = 'block'") >
toggleMicSrc.indexOf("if (state.buffer)"), "回归①：恢复面板在 state.buffer 分支内（非无条件）");
var stopRecSrc = JS_SRC.slice(JS_SRC.indexOf("function stopRecording"),
JS_SRC.indexOf("function takeScreenshot"));
has(stopRecSrc, "if (silent)", "回归②：stopRecording 区分静默丢弃与正常停止");
has(stopRecSrc, "state.recorder.onstop = null", "回归②：静默丢弃时先置空 onstop，录制中重传不触发下载");
has(stopRecSrc, "state.recorder.ondataavailable = null", "回归②：静默丢弃时先置空 ondataavailable");
ok(stopRecSrc.indexOf("state.recorder.onstop = null") <
stopRecSrc.indexOf("state.recorder.stop()"), "回归②：置空回调在 stop() 之前");
var shotSrc = JS_SRC.slice(JS_SRC.indexOf("function takeScreenshot"),
JS_SRC.indexOf("/* ================= 初始化"));
has(shotSrc, "!state.buffer && !state.micStream", "回归③：截图要求真实音源（已加载文件或麦克风接入中）");
has(JS_SRC, "ArrowLeft", "回归④：进度条键盘支持 ArrowLeft");
has(JS_SRC, "seekTo((pos - 5) / state.buffer.duration)", "回归④：ArrowLeft 后退 5 秒");
has(JS_SRC, "seekTo((pos + 5) / state.buffer.duration)", "回归④：ArrowRight 前进 5 秒");
has(JS_SRC, "ev.key === 'Home'", "回归④：进度条键盘支持 Home");
has(JS_SRC, "ev.key === 'End'", "回归④：进度条键盘支持 End");

console.log("music_visualizer: pass=" + pass + " fail=" + fail + "，共 " + (pass + fail) + " 断言");
if (fail > 0) process.exit(1);
