/* 视频提取音频（video_to_audio）- 纯前端视频取音工具
 *
 * 流程：上传/拖拽视频（MP4/WebM/MOV，≤500MB，全本地，不上传）→ 快速路径：
 *   FileReader 读入 ArrayBuffer → AudioContext.decodeAudioData 直接解出音轨（秒级，
 *   不实时播放）→ 失败自动降级 MediaRecorder 实时重录：video 元素播放 +
 *   createMediaElementSource → MediaStreamDestination 录制（耗时与视频等长，
 *   进度条明示）→ 录得 blob 再 decodeAudioData 解码 → 片段截取（起止可选，
 *   默认全片，毫秒微调）→ 试听提取结果 → WAV 手工编码（16-bit PCM）/
 *   MP3 经本地 vendor lamejs 编码（64–320kbps，默认 192kbps）本地下载，
 *   文件名「原名-audio.扩展名」。
 *
 * 音频只在浏览器本地处理：无后端调用、无第三方依赖、无 CDN（lamejs 为仓库内 vendor 文件）。
 * 纯函数（formatDuration / formatFileSize / secondsToSamples / clampExtractRange /
 * estimateWavBytes / estimateMp3Bytes / buildExportFilename / validateExtractConfig /
 * validateExtractState / formatProgress）在 node 下可单元测试。
 * 真限制：① 快速路径依赖浏览器对视频容器音频编码的解码支持，不支持的格式自动降级
 *   实时重录，耗时与视频等长；② 只提取音轨，不提升音质，MP3 导出按所选码率重编码，
 *   有损；③ DRM 保护／加密视频无法本地处理；④ 全程浏览器本地计算，零上传，大文件
 *   （≤500MB）解码占用内存，低配设备可能卡顿。
 */
(function () {
'use strict';

/* ================= 纯函数 ================= */

function vtaErr(message, field) {
    var e = new Error(message);
    e.field = field;
    return e;
}

function isFiniteNum(x) {
    return typeof x === 'number' && isFinite(x);
}

// 秒 → "m:ss"（<1h）或 "h:mm:ss"（≥1h），向下取整秒。锚点 3661→"1:01:01"、65→"1:05"。
function formatDuration(sec) {
    if (!isFiniteNum(sec) || sec < 0) throw vtaErr('seconds 须为 ≥0 的有限数字', 'seconds');
    var total = Math.floor(sec);
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    if (h > 0) return h + ':' + pad(m) + ':' + pad(s);
    return m + ':' + pad(s);
}

// 字节 → "N B" / "N.N KB" / "N.N MB"（一位小数）。锚点 1536→"1.5 KB"、1048576→"1.0 MB"。
function formatFileSize(bytes) {
    if (!isFiniteNum(bytes) || bytes < 0) throw vtaErr('bytes 须为 ≥0 的有限数字', 'bytes');
    if (bytes < 1024) return Math.floor(bytes) + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

// 秒 × 采样率 → 采样数（四舍五入）。锚点 (1.5, 44100)→66150。
function secondsToSamples(sec, sampleRate) {
    if (!isFiniteNum(sec) || sec <= 0) throw vtaErr('seconds 须为 >0 的有限数字', 'seconds');
    if (typeof sampleRate !== 'number' || Math.floor(sampleRate) !== sampleRate ||
        sampleRate < 8000 || sampleRate > 192000) throw vtaErr('sampleRate 须为 8000–192000 的整数', 'sampleRate');
    return Math.round(sec * sampleRate);
}

// 提取区间钳制：start 钳到 [0, duration]，end 钳到 [start, duration]；start ≥ end 抛错。
// 锚点 (10,50,120)→{start:10,end:50}；(-5,200,120)→{start:0,end:120}；(50,50,120) 抛错。
function clampExtractRange(startSec, endSec, durationSec) {
    if (!isFiniteNum(startSec) || !isFiniteNum(endSec) || !isFiniteNum(durationSec) ||
        durationSec <= 0) throw vtaErr('range 须为有限数且 duration 须 >0', 'range');
    var start = Math.min(Math.max(startSec, 0), durationSec);
    var end = Math.min(Math.max(endSec, start), durationSec);
    if (start >= end) throw vtaErr('提取区间起止无效：start 须 < end', 'range');
    return { start: start, end: end };
}

// WAV 体积预估：44 字节头 + 时长×采样率×声道×2 字节。锚点 (60,44100,2)→10584044。
function estimateWavBytes(durationSec, sampleRate, channels) {
    if (!isFiniteNum(durationSec) || durationSec <= 0) throw vtaErr('duration 须为 >0 的有限数字', 'duration');
    if (typeof sampleRate !== 'number' || Math.floor(sampleRate) !== sampleRate ||
        sampleRate < 8000 || sampleRate > 192000) throw vtaErr('sampleRate 须为 8000–192000 的整数', 'sampleRate');
    if (channels !== 1 && channels !== 2) throw vtaErr('channels 须为 1 或 2', 'channels');
    return 44 + Math.round(durationSec * sampleRate * channels * 2);
}

// MP3 体积预估：时长×码率/8。锚点 (60,128)→960000；(30,192)→720000。
function estimateMp3Bytes(durationSec, bitrateKbps) {
    if (!isFiniteNum(durationSec) || durationSec <= 0) throw vtaErr('duration 须为 >0 的有限数字', 'duration');
    if (typeof bitrateKbps !== 'number' || bitrateKbps < 32 || bitrateKbps > 320) throw vtaErr('bitrate 须为 32–320', 'bitrate');
    return Math.round(durationSec * bitrateKbps * 1000 / 8);
}

// 导出文件名：去掉原扩展名 + "-audio.扩展名"。锚点 ("my-video.mp4","mp3")→"my-video-audio.mp3"。
function buildExportFilename(baseName, ext) {
    if (typeof baseName !== 'string' || baseName.length === 0) throw vtaErr('fileName 须为非空字符串', 'fileName');
    if (ext !== 'wav' && ext !== 'mp3') throw vtaErr('format 须为 wav 或 mp3', 'format');
    var dot = baseName.lastIndexOf('.');
    var stem = dot > 0 ? baseName.slice(0, dot) : baseName;
    return stem + '-audio.' + ext;
}

var MP3_BITRATES = [64, 96, 128, 160, 192, 256, 320];

// 导出配置校验：format 须为 wav/mp3；mp3 时 bitrate 须在可选档位内；trim 若给出须 start<end。
function validateExtractConfig(config) {
    if (!config || typeof config !== 'object') throw vtaErr('config 须为对象', 'format');
    if (config.format !== 'wav' && config.format !== 'mp3') throw vtaErr('format 须为 wav 或 mp3', 'format');
    if (config.format === 'mp3') {
        if (MP3_BITRATES.indexOf(config.bitrate) === -1) throw vtaErr('bitrate 须为 64/96/128/160/192/256/320 之一', 'bitrate');
    }
    if (config.trim !== undefined && config.trim !== null) {
        var t = config.trim;
        if (!t || typeof t !== 'object' || !isFiniteNum(t.start) || !isFiniteNum(t.end) ||
            t.start < 0 || t.end <= 0 || t.start >= t.end) throw vtaErr('trim 须为 {start,end} 且 start<end', 'trim');
    }
    return config;
}

// 提取状态校验：progress 0–100；mode 须为 fast（快速路径）或 realtime（实时重录）。
function validateExtractState(state) {
    if (!state || typeof state !== 'object') throw vtaErr('state 须为对象', 'progress');
    if (!isFiniteNum(state.progress) || state.progress < 0 || state.progress > 100) throw vtaErr('progress 须为 0–100 的有限数', 'progress');
    if (state.mode !== 'fast' && state.mode !== 'realtime') throw vtaErr('mode 须为 fast 或 realtime', 'mode');
    return state;
}

// 进度 → "N%"（四舍五入整数）。锚点 33.6→"34%"。
function formatProgress(pct) {
    if (!isFiniteNum(pct) || pct < 0 || pct > 100) throw vtaErr('progress 须为 0–100 的有限数', 'progress');
    return Math.round(pct) + '%';
}

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

// float32(-1..1) → int16 PCM
function floatTo16BitPCM(f) {
    var out = new Int16Array(f.length);
    for (var i = 0; i < f.length; i++) {
        var v = clamp(f[i], -1, 1);
        out[i] = v < 0 ? Math.round(v * 32768) : Math.round(v * 32767);
    }
    return out;
}

// 交错多声道 int16（声道数>2 时只取前 2 声道）
function interleaveChannels(pcms, length) {
    var n = Math.min(2, pcms.length);
    var out = new Int16Array(length * n);
    var i, c, p = 0;
    for (i = 0; i < length; i++) {
        for (c = 0; c < n; c++) out[p++] = pcms[c][i];
    }
    return out;
}

// 手工编码 WAV（44 字节头 + 16-bit PCM）
function encodeWavDataView(sampleRate, numChannels, interleaved) {
    var bytes = 44 + interleaved.length * 2;
    var buf = new ArrayBuffer(bytes);
    var dv = new DataView(buf);
    function wstr(off, s) { for (var i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i)); }
    wstr(0, 'RIFF');
    dv.setUint32(4, bytes - 8, true);
    wstr(8, 'WAVE');
    wstr(12, 'fmt ');
    dv.setUint32(16, 16, true);          // fmt chunk size
    dv.setUint16(20, 1, true);           // PCM
    dv.setUint16(22, numChannels, true);
    dv.setUint32(24, sampleRate, true);
    dv.setUint32(28, sampleRate * numChannels * 2, true); // byte rate
    dv.setUint16(32, numChannels * 2, true);              // block align
    dv.setUint16(34, 16, true);         // bits per sample
    wstr(36, 'data');
    dv.setUint32(40, interleaved.length * 2, true);
    for (var i = 0; i < interleaved.length; i++) dv.setInt16(44 + i * 2, interleaved[i], true);
    return dv;
}

// 线性重采样（用于 MP3 编码前统一到 44100Hz）
function resampleLinear(src, srcRate, dstRate) {
    if (srcRate === dstRate) return src;
    var ratio = srcRate / dstRate;
    var dstLen = Math.max(1, Math.floor(src.length / ratio));
    var dst = new Float32Array(dstLen);
    for (var i = 0; i < dstLen; i++) {
        var pos = i * ratio;
        var i0 = Math.floor(pos), i1 = Math.min(src.length - 1, i0 + 1);
        var frac = pos - i0;
        dst[i] = src[i0] * (1 - frac) + src[i1] * frac;
    }
    return dst;
}

// 浏览器端挂 window.VideoToAudio；node 下导出纯函数以便单元测试
if (typeof window !== 'undefined') {
    window.VideoToAudio = { formatDuration: formatDuration, formatFileSize: formatFileSize,
        secondsToSamples: secondsToSamples, clampExtractRange: clampExtractRange,
        estimateWavBytes: estimateWavBytes, estimateMp3Bytes: estimateMp3Bytes,
        buildExportFilename: buildExportFilename, validateExtractConfig: validateExtractConfig,
        validateExtractState: validateExtractState, formatProgress: formatProgress };
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { formatDuration: formatDuration, formatFileSize: formatFileSize,
        secondsToSamples: secondsToSamples, clampExtractRange: clampExtractRange,
        estimateWavBytes: estimateWavBytes, estimateMp3Bytes: estimateMp3Bytes,
        buildExportFilename: buildExportFilename, validateExtractConfig: validateExtractConfig,
        validateExtractState: validateExtractState, formatProgress: formatProgress,
        floatTo16BitPCM: floatTo16BitPCM, interleaveChannels: interleaveChannels,
        encodeWavDataView: encodeWavDataView, resampleLinear: resampleLinear };
    return;
}

/* ================= 浏览器侧：状态 ================= */

var VTA_MAX_BYTES = 524288000;   // 500MB 上限
var VTA_ACCEPT_RE = /\.(mp4|webm|mov)$/i;
var MP3_RATE = 44100;            // lamejs 统一编码采样率
var MP3_CHUNK = 1152;            // lamejs 每帧采样数

var state = {
    actx: null,          // AudioContext
    buffer: null,        // AudioBuffer（解码出的音轨）
    fileName: '',        // 源文件名（不含扩展名）
    fileSize: 0,         // 源文件字节数
    mode: '',            // 'fast' 快速路径 / 'realtime' 实时重录
    extracting: false,   // 正在提取（含实时重录进行中）
    selStart: 0, selEnd: 0,   // 选区（秒）
    playing: false,
    playSrc: null,       // 当前 BufferSourceNode
    playRaf: 0,
    playT0: 0,           // 播放起始的 actx.currentTime
    playPos: 0,          // 当前播放位置（秒）
    recVideo: null,      // 实时重录用的 video 元素
    recRecorder: null,   // MediaRecorder
    recChunks: [],       // 录制数据块
    recSrc: null,        // MediaElementSource（一个 media 元素一生只能建一个，跨次重录复用）
    recDest: null,       // MediaStreamDestination（与 recSrc 配对复用）
    runId: 0,            // 提取轮次 token：重新上传/重置时递增，旧轮次的解码与重录回调凭此丢弃
    previewUrl: '',      // 视频预览用的 object URL（快速路径与实时重录共用）
};

function $(id) { return document.getElementById(id); }

var el = {};
['va-upload','va-file','va-srcinfo','va-status','va-video-wrap','va-video',
 'va-info','va-info-duration','va-info-rate','va-info-channels','va-info-size',
 'va-info-wav','va-info-mp3','va-mode',
 'va-extract-panel','va-progress-wrap','va-progress-bar','va-progress-text',
 'va-trim-panel','va-start-label','va-end-label','va-start-ms','va-end-ms','va-len-label','va-select-all',
 'va-preview-panel','va-play','va-stop','va-loop','va-play-pos',
 'va-export-panel','va-export-wav','va-export-mp3','va-bitrate','va-export-status','va-reupload'
].forEach(function (id) { el[id.replace(/-/g, '_').replace(/^va_/, '')] = $(id); });

function setStatus(msg) { el.status.textContent = msg || ''; }
function setExportStatus(msg) { el.export_status.textContent = msg || ''; }

function ensureCtx() {
    if (!state.actx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) throw new Error('当前浏览器不支持 Web Audio API，无法解码音频');
        state.actx = new AC();
    }
    if (state.actx.state === 'suspended') state.actx.resume();
    return state.actx;
}

/* ================= 上传与提取 ================= */

function handleFile(file) {
    if (!file) return;
    if (!VTA_ACCEPT_RE.test(file.name)) {
        setStatus('❌ 不支持的文件类型：' + file.name + '（支持 MP4 / WebM / MOV）');
        return;
    }
    if (file.size > VTA_MAX_BYTES) {
        setStatus('❌ 文件过大：' + formatFileSize(file.size) + '，上限 500MB（' + formatFileSize(VTA_MAX_BYTES) + '）');
        return;
    }
    stopPlayback();
    // 新一轮提取：递增轮次 token，旧轮次未完成的解码/重录回调凭此丢弃，不再覆盖新状态
    state.runId = (state.runId || 0) + 1;
    var runToken = state.runId;
    // 停止进行中的实时重录（其 onstop 稍后异步触发，凭 token 丢弃，不写回状态）
    if (state.recRecorder && state.recRecorder.state !== 'inactive') {
        try { state.recRecorder.stop(); } catch (e) { /* 已停 */ }
        state.recRecorder = null;
    }
    // 停掉旧视频播放并清除旧轮次挂在 video 元素上的回调，避免旧进度/失败回写新一轮
    try { el.video.pause(); } catch (e) { /* 已停 */ }
    el.video.onloadedmetadata = null;
    el.video.onended = null;
    el.video.ontimeupdate = null;
    el.video.onerror = null;
    state.fileName = file.name.replace(/\.[^.]+$/, '') || 'video';
    state.fileSize = file.size;
    state.extracting = true;
    // 视频预览（快速路径与实时重录共用同一 object URL）
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = URL.createObjectURL(file);
    el.video.src = state.previewUrl;
    el.video_wrap.style.display = 'block';
    setStatus('⏳ 正在本地解码音轨（快速路径），请稍候…');
    setExtractProgress(0, '快速路径解码中…');
    var reader = new FileReader();
    reader.onerror = function () {
        state.extracting = false;
        setStatus('❌ 文件读取失败');
    };
    reader.onload = function () {
        var ab = reader.result;
        var actx;
        try { actx = ensureCtx(); } catch (e) { state.extracting = false; setStatus('❌ ' + e.message); return; }
        var t0 = performance.now();
        actx.decodeAudioData(ab).then(function (buffer) {
            if (runToken !== state.runId) return;   // 已被新一轮上传取代，丢弃旧结果
            onDecoded(buffer, file, 'fast', Math.round(performance.now() - t0), runToken);
        }).catch(function () {
            if (runToken !== state.runId) return;   // 已被新一轮上传取代，不再降级
            // 快速路径失败：自动降级 MediaRecorder 实时重录
            setStatus('⚠️ 快速路径无法解码该视频的音频编码，自动降级为实时重录（耗时与视频等长）…');
            fallbackRealtime(file, runToken);
        });
    };
    reader.readAsArrayBuffer(file);
}

// 降级：MediaRecorder 实时重录（video 元素播放 + MediaElementSource → MediaStreamDestination）
// runToken：所属提取轮次，与 state.runId 不符时整轮静默丢弃（重录中途重新上传不串状态）。
function fallbackRealtime(file, runToken) {
    var actx;
    try { actx = ensureCtx(); } catch (e) { state.extracting = false; setStatus('❌ ' + e.message); return; }
    if (typeof MediaRecorder === 'undefined') {
        state.extracting = false;
        setStatus('❌ 快速路径与实时重录均不可用：当前浏览器不支持 MediaRecorder，请换 Chrome/Edge/Firefox 再试');
        return;
    }
    if (runToken !== undefined && runToken !== state.runId) return;   // 已被新一轮取代
    var video = el.video;
    var url = state.previewUrl || URL.createObjectURL(file);
    if (!state.previewUrl) state.previewUrl = url;
    state.recChunks = [];
    video.src = url;
    video.muted = false;
    el.video_wrap.style.display = 'block';
    var started = false;
    var setupDone = false;   // 建源/录制只执行一次（直接调用与 loadedmetadata 两路共用）
    // 预览 URL 生命周期由 handleFile/resetAll 管理：提取成功后视频预览仍要保留，不在此处释放。
    function onFail(msg) {
        if (runToken !== undefined && runToken !== state.runId) return;   // 旧轮次静默丢弃
        state.extracting = false;
        try { video.pause(); } catch (e) { /* 已停 */ }
        setStatus('❌ 实时重录失败：' + msg);
        setExtractProgress(0, '');
    }
    // 建源 + 开录（具名函数：元数据已就绪时直接调用，未就绪时由 onloadedmetadata 调用）
    function startRecording() {
        if (setupDone) return;
        setupDone = true;
        var dur = video.duration;
        if (!isFinite(dur) || dur <= 0) { onFail('无法读取视频时长'); return; }
        var rec;
        try {
            // 一个 media 元素一生只能创建一个 MediaElementAudioSourceNode：首次创建后
            // 存到 state 上跨次复用（只换 MediaRecorder），否则第二次重录必抛 InvalidStateError。
            if (!state.recSrc) {
                state.recSrc = actx.createMediaElementSource(video);
                state.recDest = actx.createMediaStreamDestination();
                state.recSrc.connect(state.recDest);
                state.recSrc.connect(actx.destination);
            }
            rec = new MediaRecorder(state.recDest.stream);
        } catch (e) { onFail(e.message); return; }
        state.recRecorder = rec;
        rec.ondataavailable = function (ev) { if (ev.data && ev.data.size > 0) state.recChunks.push(ev.data); };
        rec.onerror = function () { onFail('录制出错'); };
        rec.onstop = function () {
            if (runToken !== undefined && runToken !== state.runId) return;   // 旧轮次丢弃
            var blob = new Blob(state.recChunks, { type: rec.mimeType || 'audio/webm' });
            setExtractProgress(100, '重录完成，正在解码…');
            blob.arrayBuffer().then(function (ab) {
                actx.decodeAudioData(ab).then(function (buffer) {
                    onDecoded(buffer, file, 'realtime', 0, runToken);
                }).catch(function () {
                    onFail('重录的音频无法解码，该视频可能受 DRM 保护或编码不受支持');
                });
            }).catch(function () { onFail('重录数据读取失败'); });
        };
        video.onended = function () {
            if (rec.state !== 'inactive') rec.stop();
        };
        video.ontimeupdate = function () {
            if (!video.duration) return;
            var pct = video.currentTime / video.duration * 100;
            setExtractProgress(pct, '实时重录中 ' + formatProgress(pct) + '（耗时与视频等长）');
        };
        video.onerror = function () { onFail('视频无法播放，该文件可能损坏或受 DRM 保护'); };
        try {
            rec.start(250);
            started = true;
            var p = video.play();
            if (p && p.catch) p.catch(function (e) { onFail('视频播放被浏览器拦截：' + e.message); });
        } catch (e) { onFail(e.message); }
    }
    video.onloadedmetadata = function () { startRecording(); };
    video.onerror = function () { if (!started) onFail('视频无法加载，该文件可能损坏或受 DRM 保护'); };
    // handleFile 已先给 video 赋了同一 URL：若元数据已加载完，浏览器不再触发
    // loadedmetadata，须直接走建源/录制逻辑，否则进度条静默卡在 0%。
    if (video.readyState >= 1 && isFinite(video.duration) && video.duration > 0) {
        startRecording();
    }
}

function setExtractProgress(pct, text) {
    try { validateExtractState({ progress: pct, mode: state.mode || 'fast' }); } catch (e) { pct = clamp(pct, 0, 100); }
    el.progress_wrap.style.display = 'block';
    el.progress_bar.style.width = pct + '%';
    el.progress_bar.textContent = formatProgress(pct);
    el.progress_text.textContent = text || '';
}

function onDecoded(buffer, file, mode, ms, runToken) {
    if (runToken !== undefined && runToken !== state.runId) return;   // 旧轮次结果丢弃
    stopPlayback();
    state.buffer = buffer;
    state.mode = mode;
    state.extracting = false;
    var dur = buffer.duration;
    state.selStart = 0;
    state.selEnd = dur;
    el.srcinfo.style.display = 'block';
    el.srcinfo.textContent = '📄 ' + file.name + '　·　时长 ' + formatDuration(dur) +
        '　·　' + buffer.sampleRate + 'Hz　·　' + buffer.numberOfChannels + ' 声道' +
        '　·　大小 ' + formatFileSize(file.size);
    el.mode.textContent = mode === 'fast'
        ? '✅ 快速路径：decodeAudioData 直接解出音轨（' + ms + 'ms，秒级完成）'
        : '✅ 实时重录：MediaRecorder 随视频播放录制完成（耗时与视频等长）';
    setStatus(mode === 'fast'
        ? '✅ 音轨提取完成（快速路径，' + ms + 'ms）。框选片段、试听后导出。'
        : '✅ 音轨提取完成（实时重录）。框选片段、试听后导出。');
    setExtractProgress(100, mode === 'fast' ? '快速路径完成' : '实时重录完成');
    updateInfoPanel();
    el.info.style.display = 'block';
    el.extract_panel.style.display = 'block';
    el.trim_panel.style.display = 'block';
    el.preview_panel.style.display = 'block';
    el.export_panel.style.display = 'block';
    updateSelectionUI();
    el.trim_panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function updateInfoPanel() {
    var buf = state.buffer;
    if (!buf) return;
    var selLen = Math.max(0, state.selEnd - state.selStart);
    el.info_duration.textContent = formatDuration(buf.duration);
    el.info_rate.textContent = buf.sampleRate + ' Hz';
    el.info_channels.textContent = buf.numberOfChannels + ' 声道';
    el.info_size.textContent = formatFileSize(state.fileSize);
    el.info_wav.textContent = formatFileSize(estimateWavBytes(selLen, buf.sampleRate, Math.min(2, buf.numberOfChannels)));
    var bitrate = parseInt(el.bitrate.value, 10) || 192;
    el.info_mp3.textContent = formatFileSize(estimateMp3Bytes(selLen, bitrate)) + '（' + bitrate + 'kbps）';
}

/* ================= 片段截取 ================= */

function fmtMs(sec) {
    var ms = Math.round(sec * 1000);
    var m = Math.floor(ms / 60000);
    var s = Math.floor((ms % 60000) / 1000);
    var r = ms % 1000;
    return m + ':' + (s < 10 ? '0' : '') + s + '.' + (r < 100 ? (r < 10 ? '00' : '0') : '') + r;
}

function applyRange(startSec, endSec) {
    if (!state.buffer) return;
    try {
        var r = clampExtractRange(startSec, endSec, state.buffer.duration);
        state.selStart = r.start;
        state.selEnd = r.end;
    } catch (e) {
        setStatus('❌ 选区无效：起点须小于终点，且在视频时长内');
        return;
    }
    updateSelectionUI();
}

function updateSelectionUI() {
    if (!state.buffer) return;
    el.start_label.textContent = fmtMs(state.selStart);
    el.end_label.textContent = fmtMs(state.selEnd);
    el.start_ms.value = Math.round(state.selStart * 1000);
    el.end_ms.value = Math.round(state.selEnd * 1000);
    el.len_label.textContent = fmtMs(state.selEnd - state.selStart);
    updateInfoPanel();
}

function bindTimeInputs() {
    el.start_ms.addEventListener('change', function () {
        applyRange(parseInt(el.start_ms.value, 10) / 1000 || 0, state.selEnd);
    });
    el.end_ms.addEventListener('change', function () {
        applyRange(state.selStart, parseInt(el.end_ms.value, 10) / 1000 || 0);
    });
    document.querySelectorAll('.va-nudge').forEach(function (box) {
        var side = box.getAttribute('data-side');
        box.querySelectorAll('button').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var d = parseInt(btn.getAttribute('data-d'), 10) / 1000;
                if (side === 'start') applyRange(state.selStart + d, state.selEnd);
                else applyRange(state.selStart, state.selEnd + d);
            });
        });
    });
    el.select_all.addEventListener('click', function () {
        if (state.buffer) applyRange(0, state.buffer.duration);
    });
}

/* ================= 试听 ================= */

function sliceBuffer() {
    var buf = state.buffer;
    var sr = buf.sampleRate;
    var s0 = Math.floor(state.selStart * sr), s1 = Math.ceil(state.selEnd * sr);
    s0 = clamp(s0, 0, buf.length); s1 = clamp(s1, s0 + 1, buf.length);
    var nb;
    try {
        nb = new AudioBuffer({ numberOfChannels: buf.numberOfChannels, length: s1 - s0, sampleRate: sr });
    } catch (e) {
        var octx = new OfflineAudioContext(buf.numberOfChannels, s1 - s0, sr);
        nb = octx.createBuffer(buf.numberOfChannels, s1 - s0, sr);
    }
    for (var c = 0; c < buf.numberOfChannels; c++) {
        nb.getChannelData(c).set(buf.getChannelData(c).subarray(s0, s1));
    }
    return nb;
}

function playSelection() {
    if (!state.buffer) return;
    stopPlayback();
    var actx = ensureCtx();
    var nb = sliceBuffer();
    var src = actx.createBufferSource();
    src.buffer = nb;
    src.loop = el.loop.checked;
    src.connect(actx.destination);
    state.playSrc = src;
    state.playing = true;
    state.playT0 = actx.currentTime;
    state.playPos = state.selStart;
    el.play.disabled = true;
    el.stop.disabled = false;
    el.play_pos.textContent = fmtMs(state.selStart);
    src.onended = function () { if (state.playSrc === src) stopPlayback(); };
    src.start();
    var tick = function () {
        if (!state.playing) return;
        var pos = state.selStart + (actx.currentTime - state.playT0);
        if (!src.loop && pos >= state.selEnd) { stopPlayback(); return; }
        if (src.loop) pos = state.selStart + ((actx.currentTime - state.playT0) % (state.selEnd - state.selStart));
        state.playPos = pos;
        el.play_pos.textContent = fmtMs(pos);
        state.playRaf = requestAnimationFrame(tick);
    };
    state.playRaf = requestAnimationFrame(tick);
}

function stopPlayback() {
    if (state.playSrc) {
        try { state.playSrc.onended = null; state.playSrc.stop(); } catch (e) { /* 已结束 */ }
        state.playSrc = null;
    }
    if (state.playRaf) { cancelAnimationFrame(state.playRaf); state.playRaf = 0; }
    if (state.playing) {
        state.playing = false;
        el.play.disabled = false;
        el.stop.disabled = true;
        el.play_pos.textContent = fmtMs(state.selStart);
    }
}

/* ================= 导出 ================= */

function downloadBlob(blob, filename) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}

function exportWav() {
    if (!state.buffer) return;
    setExportStatus('⏳ 正在编码 WAV…');
    setTimeout(function () {
        try {
            validateExtractConfig({ format: 'wav', trim: { start: state.selStart, end: state.selEnd } });
            var nb = sliceBuffer();
            var pcms = [];
            for (var c = 0; c < nb.numberOfChannels; c++) pcms.push(floatTo16BitPCM(nb.getChannelData(c)));
            var interleaved = interleaveChannels(pcms, nb.length);
            var nch = Math.min(2, nb.numberOfChannels);
            var dv = encodeWavDataView(nb.sampleRate, nch, interleaved);
            var blob = new Blob([dv], { type: 'audio/wav' });
            var name = buildExportFilename(state.fileName, 'wav');
            downloadBlob(blob, name);
            setExportStatus('✅ WAV 已导出：' + name + '（' + formatDuration(nb.duration) + '，' + formatFileSize(blob.size) + '）');
        } catch (e) {
            setExportStatus('❌ WAV 导出失败：' + e.message);
        }
    }, 30);
}

function yieldUI() { return new Promise(function (r) { setTimeout(r, 0); }); }

async function exportMp3() {
    if (!state.buffer) return;
    if (typeof lamejs === 'undefined') {
        setExportStatus('❌ MP3 编码器（lamejs）未加载，请刷新页面重试（仍失败请确认页面为离线完整版）');
        return;
    }
    var bitrate = parseInt(el.bitrate.value, 10) || 192;
    try {
        validateExtractConfig({ format: 'mp3', bitrate: bitrate, trim: { start: state.selStart, end: state.selEnd } });
    } catch (e) {
        setExportStatus('❌ 导出配置无效：' + e.message);
        return;
    }
    el.export_mp3.disabled = true;
    el.export_wav.disabled = true;
    setExportStatus('⏳ 正在编码 MP3（' + bitrate + 'kbps）… 0%');
    try {
        var nb = sliceBuffer();
        var nch = Math.min(2, nb.numberOfChannels);
        var sr = nb.sampleRate;
        var chData = [];
        for (var c = 0; c < nch; c++) chData.push(floatTo16BitPCM(resampleLinear(nb.getChannelData(c), sr, MP3_RATE)));
        var len = chData[0].length;
        var enc = new lamejs.Mp3Encoder(nch, MP3_RATE, bitrate);
        var chunks = [];
        var done = 0;
        for (var off = 0; off < len; off += MP3_CHUNK) {
            var l = chData[0].subarray(off, off + MP3_CHUNK);
            var d;
            if (nch === 2) d = enc.encodeBuffer(l, chData[1].subarray(off, off + MP3_CHUNK));
            else d = enc.encodeBuffer(l);
            if (d.length > 0) chunks.push(d);
            done = off + MP3_CHUNK;
            if ((off / MP3_CHUNK) % 120 === 0) {
                setExportStatus('⏳ 正在编码 MP3（' + bitrate + 'kbps）… ' + Math.min(99, Math.round(done / len * 100)) + '%');
                await yieldUI();
            }
        }
        var tail = enc.flush();
        if (tail.length > 0) chunks.push(tail);
        var blob = new Blob(chunks, { type: 'audio/mpeg' });
        var name = buildExportFilename(state.fileName, 'mp3');
        downloadBlob(blob, name);
        setExportStatus('✅ MP3 已导出：' + name + '（' + formatDuration(nb.duration) + '，' + bitrate + 'kbps，' + formatFileSize(blob.size) + '）');
    } catch (e) {
        setExportStatus('❌ MP3 导出失败：' + e.message);
    }
    el.export_mp3.disabled = false;
    el.export_wav.disabled = false;
}

/* ================= 重置 ================= */

function resetAll() {
    // 作废进行中的解码/重录回调（其 onstop 稍后触发时凭 token 丢弃，不写回已重置的界面）
    state.runId = (state.runId || 0) + 1;
    stopPlayback();
    if (state.recRecorder && state.recRecorder.state !== 'inactive') {
        try { state.recRecorder.stop(); } catch (e) { /* 已停 */ }
    }
    state.recRecorder = null;
    if (el.video) { try { el.video.pause(); } catch (e) { /* 已停 */ } el.video.removeAttribute('src'); el.video.load(); }
    if (state.previewUrl) { URL.revokeObjectURL(state.previewUrl); state.previewUrl = ''; }
    state.buffer = null;
    state.fileName = '';
    state.fileSize = 0;
    state.mode = '';
    state.extracting = false;
    el.srcinfo.style.display = 'none';
    el.video_wrap.style.display = 'none';
    el.info.style.display = 'none';
    el.extract_panel.style.display = 'none';
    el.trim_panel.style.display = 'none';
    el.preview_panel.style.display = 'none';
    el.export_panel.style.display = 'none';
    el.file.value = '';
    setStatus('');
    setExportStatus('');
}

/* ================= 初始化 ================= */

function init() {
    el.upload.addEventListener('click', function () { el.file.click(); });
    el.upload.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); el.file.click(); }
    });
    el.file.addEventListener('change', function () { handleFile(el.file.files[0]); });
    ['dragenter', 'dragover'].forEach(function (t) {
        el.upload.addEventListener(t, function (ev) { ev.preventDefault(); el.upload.classList.add('dragover'); });
    });
    ['dragleave', 'drop'].forEach(function (t) {
        el.upload.addEventListener(t, function (ev) { ev.preventDefault(); el.upload.classList.remove('dragover'); });
    });
    el.upload.addEventListener('drop', function (ev) {
        var f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
        handleFile(f);
    });

    bindTimeInputs();
    el.bitrate.addEventListener('change', updateInfoPanel);

    el.play.addEventListener('click', playSelection);
    el.stop.addEventListener('click', stopPlayback);
    el.export_wav.addEventListener('click', exportWav);
    el.export_mp3.addEventListener('click', exportMp3);
    el.reupload.addEventListener('click', resetAll);

    // 空格启停试听（焦点不在输入框/按钮上时）
    document.addEventListener('keydown', function (ev) {
        if (ev.code !== 'Space') return;
        var tag = (document.activeElement && document.activeElement.tagName) || '';
        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;
        if (!state.buffer) return;
        ev.preventDefault();
        if (state.playing) stopPlayback(); else playSelection();
    });

    if (typeof lamejs === 'undefined') {
        setStatus('⚠️ MP3 编码器未能加载（vendor 文件缺失），WAV 导出不受影响');
    }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

})();
