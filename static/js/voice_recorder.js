/* 在线录音机（voice_recorder）- 纯前端麦克风录音工具
 *
 * 流程：getUserMedia 采集麦克风（可指定设备，回声消除／噪声抑制默认开）→
 *   MediaRecorder 本地录制（开始／暂停／继续／停止，实时计时 hh:mm:ss，
 *   AnalyserNode 实时波形＋音量表）→ 停止后进入录音列表（会话内管理：
 *   重命名／试听／删除）→ 导出：原始 WebM 直存／WAV 手工编码（16-bit PCM，
 *   经 decodeAudioData 解码）／MP3 经本地 vendor lamejs 编码（64–320kbps，
 *   默认 192kbps），文件名「录音名.扩展名」；解码失败时仅可下载原始 WebM。
 * 只录音不录屏（录屏请用 screen_recorder）。全程浏览器本地处理：无后端调用、
 * 无第三方依赖、无 CDN（lamejs 为仓库内 vendor 文件）。
 * 纯函数（formatDuration / formatFileSize / pickMimeType / buildRecordingName /
 * estimateWavBytes / estimateMp3Bytes / computePeakLevel / buildWavHeader /
 * buildExportFilename / validateRecordConfig / validateRecordState）在 node 下可单元测试。
 * 真限制：① 只录音、不录屏（录屏请用 screen_recorder）；② 录音列表仅保留在当前
 *   会话，刷新／关闭后消失，请及时下载导出；③ 不设人工时长上限，但超长录音受
 *   浏览器内存限制；移动端浏览器切后台可能中断录音；④ WAV／MP3 导出需浏览器
 *   解码录音，解码失败时仅可下载原始 WebM；⑤ 全程浏览器本地计算，零上传。
 */
(function () {
'use strict';

/* ================= 纯函数 ================= */

function vrErr(message, field) {
    var e = new Error(message);
    e.field = field;
    return e;
}

function isFiniteNum(x) {
    return typeof x === 'number' && isFinite(x);
}

// 秒 → "m:ss"（<1h）或 "h:mm:ss"（≥1h），向下取整秒。锚点 3661→"1:01:01"、65→"1:05"。
function formatDuration(sec) {
    if (!isFiniteNum(sec) || sec < 0) throw vrErr('seconds 须为 ≥0 的有限数字', 'seconds');
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
    if (!isFiniteNum(bytes) || bytes < 0) throw vrErr('bytes 须为 ≥0 的有限数字', 'bytes');
    if (bytes < 1024) return Math.floor(bytes) + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

// MediaRecorder MIME 优先序：返回首个在 supported 中的值，无匹配返回 ''。
// 锚点：supported 含首选 'audio/webm;codecs=opus' 时取首选；
//   ['audio/webm','audio/mp4'] → 'audio/webm'；[] → ''；非数组抛错 err.field='candidates'。
var MIME_PRIORITY = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

function pickMimeType(supported) {
    if (!Array.isArray(supported)) throw vrErr('candidates 须为数组', 'candidates');
    for (var i = 0; i < MIME_PRIORITY.length; i++) {
        if (supported.indexOf(MIME_PRIORITY[i]) !== -1) return MIME_PRIORITY[i];
    }
    return '';
}

// 录音序号 → 默认名。锚点 1→"录音 1"；0/1.5 抛错 err.field='index'。
function buildRecordingName(index) {
    if (typeof index !== 'number' || Math.floor(index) !== index || index < 1) throw vrErr('index 须为 ≥1 的整数', 'index');
    return '录音 ' + index;
}

// 导出文件名：去掉原扩展名 + ".扩展名"。锚点 ("录音 1","wav")→"录音 1.wav"；
// ("a.mp3","mp3")→"a.mp3"；ext 限 wav/mp3/webm。
function buildExportFilename(name, ext) {
    if (typeof name !== 'string' || name.length === 0) throw vrErr('fileName 须为非空字符串', 'fileName');
    if (ext !== 'wav' && ext !== 'mp3' && ext !== 'webm') throw vrErr('format 须为 wav、mp3 或 webm', 'format');
    var dot = name.lastIndexOf('.');
    var stem = dot > 0 ? name.slice(0, dot) : name;
    return stem + '.' + ext;
}

// WAV 体积预估：44 字节头 + 时长×采样率×声道×2 字节。锚点 (60,44100,2)→10584044。
function estimateWavBytes(durationSec, sampleRate, channels) {
    if (!isFiniteNum(durationSec) || durationSec <= 0) throw vrErr('duration 须为 >0 的有限数字', 'duration');
    if (typeof sampleRate !== 'number' || Math.floor(sampleRate) !== sampleRate ||
        sampleRate < 8000 || sampleRate > 192000) throw vrErr('sampleRate 须为 8000–192000 的整数', 'sampleRate');
    if (channels !== 1 && channels !== 2) throw vrErr('channels 须为 1 或 2', 'channels');
    return 44 + Math.round(durationSec * sampleRate * channels * 2);
}

// MP3 体积预估：时长×码率/8。锚点 (60,128)→960000；(30,192)→720000。
function estimateMp3Bytes(durationSec, bitrateKbps) {
    if (!isFiniteNum(durationSec) || durationSec <= 0) throw vrErr('duration 须为 >0 的有限数字', 'duration');
    if (typeof bitrateKbps !== 'number' || bitrateKbps < 32 || bitrateKbps > 320) throw vrErr('bitrate 须为 32–320', 'bitrate');
    return Math.round(durationSec * bitrateKbps * 1000 / 8);
}

// 时域采样（AnalyserNode getByteTimeDomainData，128 为静音中点）→ 峰值电平 0–1。
// 锚点：[128,128,128]→0；[255]→0.9921875（127/128）；空数组/非 Uint8Array 抛错 err.field='samples'。
function computePeakLevel(samples) {
    if (!(samples instanceof Uint8Array) || samples.length === 0) throw vrErr('samples 须为非空 Uint8Array', 'samples');
    var peak = 0;
    for (var i = 0; i < samples.length; i++) {
        var v = Math.abs(samples[i] - 128) / 128;
        if (v > peak) peak = v;
    }
    return peak;
}

// 44 字节 RIFF/WAVE 头（16-bit PCM）。锚点 (100,44100,2)：长度 44，0–3 "RIFF"、
// 8–11 "WAVE"、偏移 22 LE 读得 2、偏移 24 LE 读得 44100、偏移 40 LE 读得 100。
function buildWavHeader(dataBytes, sampleRate, channels) {
    if (typeof dataBytes !== 'number' || Math.floor(dataBytes) !== dataBytes || dataBytes < 0) throw vrErr('dataBytes 须为 ≥0 的整数', 'dataBytes');
    if (typeof sampleRate !== 'number' || Math.floor(sampleRate) !== sampleRate ||
        sampleRate < 8000 || sampleRate > 192000) throw vrErr('sampleRate 须为 8000–192000 的整数', 'sampleRate');
    if (channels !== 1 && channels !== 2) throw vrErr('channels 须为 1 或 2', 'channels');
    var buf = new ArrayBuffer(44);
    var dv = new DataView(buf);
    function wstr(off, s) { for (var i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i)); }
    wstr(0, 'RIFF');
    dv.setUint32(4, 36 + dataBytes, true);   // chunk size = 36 + data
    wstr(8, 'WAVE');
    wstr(12, 'fmt ');
    dv.setUint32(16, 16, true);              // fmt chunk size
    dv.setUint16(20, 1, true);               // PCM
    dv.setUint16(22, channels, true);
    dv.setUint32(24, sampleRate, true);
    dv.setUint32(28, sampleRate * channels * 2, true); // byte rate
    dv.setUint16(32, channels * 2, true);    // block align
    dv.setUint16(34, 16, true);              // bits per sample
    wstr(36, 'data');
    dv.setUint32(40, dataBytes, true);
    return new Uint8Array(buf);
}

var MP3_BITRATES = [64, 96, 128, 160, 192, 256, 320];

// 导出配置校验：format 须为 wav/mp3/webm；mp3 时 bitrate 须在可选档位内；
// echoCancellation／noiseSuppression 如出现须为 boolean。
function validateRecordConfig(config) {
    if (!config || typeof config !== 'object') throw vrErr('config 须为对象', 'format');
    if (config.format !== 'wav' && config.format !== 'mp3' && config.format !== 'webm') throw vrErr('format 须为 wav、mp3 或 webm', 'format');
    if (config.format === 'mp3') {
        if (MP3_BITRATES.indexOf(config.bitrate) === -1) throw vrErr('bitrate 须为 64/96/128/160/192/256/320 之一', 'bitrate');
    }
    if (config.echoCancellation !== undefined && typeof config.echoCancellation !== 'boolean') throw vrErr('echoCancellation 须为 boolean', 'echoCancellation');
    if (config.noiseSuppression !== undefined && typeof config.noiseSuppression !== 'boolean') throw vrErr('noiseSuppression 须为 boolean', 'noiseSuppression');
    return config;
}

// 录音状态校验：status 须为 idle/recording/paused/stopped/error 之一；elapsedSec 须 ≥0。
var RECORD_STATUSES = ['idle', 'recording', 'paused', 'stopped', 'error'];

function validateRecordState(state) {
    if (!state || typeof state !== 'object') throw vrErr('state 须为对象', 'status');
    if (RECORD_STATUSES.indexOf(state.status) === -1) throw vrErr('status 须为 idle/recording/paused/stopped/error 之一', 'status');
    if (!isFiniteNum(state.elapsedSec) || state.elapsedSec < 0) throw vrErr('elapsedSec 须为 ≥0 的有限数', 'elapsedSec');
    return state;
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

// 手工编码 WAV（44 字节头 + 16-bit PCM），头由 buildWavHeader 生成
function encodeWavDataView(sampleRate, numChannels, interleaved) {
    var header = buildWavHeader(interleaved.length * 2, sampleRate, numChannels);
    var buf = new ArrayBuffer(44 + interleaved.length * 2);
    var out = new Uint8Array(buf);
    out.set(header, 0);
    var dv = new DataView(buf);
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

// 浏览器端挂 window.VoiceRecorder；node 下导出纯函数以便单元测试
if (typeof window !== 'undefined') {
    window.VoiceRecorder = { formatDuration: formatDuration, formatFileSize: formatFileSize,
        pickMimeType: pickMimeType, buildRecordingName: buildRecordingName,
        buildExportFilename: buildExportFilename, estimateWavBytes: estimateWavBytes,
        estimateMp3Bytes: estimateMp3Bytes, computePeakLevel: computePeakLevel,
        buildWavHeader: buildWavHeader, validateRecordConfig: validateRecordConfig,
        validateRecordState: validateRecordState };
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { formatDuration: formatDuration, formatFileSize: formatFileSize,
        pickMimeType: pickMimeType, buildRecordingName: buildRecordingName,
        buildExportFilename: buildExportFilename, estimateWavBytes: estimateWavBytes,
        estimateMp3Bytes: estimateMp3Bytes, computePeakLevel: computePeakLevel,
        buildWavHeader: buildWavHeader, validateRecordConfig: validateRecordConfig,
        validateRecordState: validateRecordState,
        floatTo16BitPCM: floatTo16BitPCM, interleaveChannels: interleaveChannels,
        encodeWavDataView: encodeWavDataView, resampleLinear: resampleLinear };
    return;
}

/* ================= 浏览器侧：状态 ================= */

var MP3_RATE = 44100;            // lamejs 统一编码采样率
var MP3_CHUNK = 1152;            // lamejs 每帧采样数

var state = {
    status: 'idle',      // idle / recording / paused / stopped / error（见 validateRecordState）
    stream: null,        // MediaStream（麦克风）
    recorder: null,      // MediaRecorder
    mimeType: '',        // 本次录制实际 MIME
    actx: null,          // AudioContext（波形分析＋解码导出共用）
    analyser: null,      // AnalyserNode（fftSize=2048）
    analyserData: null,  // Uint8Array 时域采样
    sourceNode: null,    // MediaStreamAudioSourceNode
    chunks: [],          // 本次录制数据块
    recStart: 0,         // 本次录制开始的 Date.now()
    pausedTotal: 0,      // 累计暂停毫秒
    pauseStart: 0,       // 本次暂停开始的 Date.now()
    elapsedSec: 0,       // 当前录制已走秒数（暂停时冻结）
    timerId: 0,          // 计时 setInterval
    rafId: 0,            // 波形 requestAnimationFrame
    recCount: 0,         // 录音序号（默认名递增）
    recordings: [],      // 会话内录音列表：{id,name,blob,mimeType,size,durationSec,buffer,sampleRate,channels,decodeFailed,url}
    selectedId: 0,       // 信息面板当前选中录音 id
    playingId: 0,        // 正在试听的录音 id
    playAudio: null,     // 试听用 <audio> 元素
};

function $(id) { return document.getElementById(id); }

var el = {};
['vr-mic', 'vr-mic-refresh', 'vr-echo', 'vr-noise', 'vr-start',
 'vr-rec-panel', 'vr-timer', 'vr-wave', 'vr-meter-fill', 'vr-status',
 'vr-pause', 'vr-resume', 'vr-stop',
 'vr-list-empty', 'vr-list', 'vr-clear',
 'vr-info', 'vr-info-duration', 'vr-info-rate', 'vr-info-channels',
 'vr-info-size', 'vr-info-wav', 'vr-info-mp3',
 'vr-bitrate', 'vr-export-status'
].forEach(function (id) { el[id.replace(/-/g, '_').replace(/^vr_/, '')] = $(id); });

function setStatus(msg) { el.status.textContent = msg || ''; }
function setExportStatus(msg) { el.export_status.textContent = msg || ''; }

// 状态切换：先过 validateRecordState 校验，再写回 state 并同步按钮可用态
function setRecState(status) {
    try { validateRecordState({ status: status, elapsedSec: state.elapsedSec }); } catch (e) { /* 校验失败不阻断界面 */ }
    state.status = status;
    el.start.disabled = (status === 'recording' || status === 'paused');
    el.pause.disabled = (status !== 'recording');
    el.resume.disabled = (status !== 'paused');
    el.stop.disabled = (status !== 'recording' && status !== 'paused');
    el.mic.disabled = (status === 'recording' || status === 'paused');
    el.echo.disabled = (status === 'recording' || status === 'paused');
    el.noise.disabled = (status === 'recording' || status === 'paused');
}

// 秒 → "hh:mm:ss"（实时计时，零补齐）
function fmtClock(totalSec) {
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    var h = Math.floor(totalSec / 3600);
    var m = Math.floor((totalSec % 3600) / 60);
    var s = totalSec % 60;
    return pad(h) + ':' + pad(m) + ':' + pad(s);
}

function ensureCtx() {
    if (!state.actx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) throw new Error('当前浏览器不支持 Web Audio API，无法分析波形与解码导出');
        state.actx = new AC();
    }
    if (state.actx.state === 'suspended') state.actx.resume();
    return state.actx;
}

function stopStream() {
    if (state.stream) {
        state.stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) { /* 已停 */ } });
        state.stream = null;
    }
    if (state.sourceNode) { try { state.sourceNode.disconnect(); } catch (e) { /* 已断 */ } state.sourceNode = null; }
    state.analyser = null;
    state.analyserData = null;
}

function stopWaveLoop() {
    if (state.timerId) { clearInterval(state.timerId); state.timerId = 0; }
    if (state.rafId) { cancelAnimationFrame(state.rafId); state.rafId = 0; }
}

/* ================= 麦克风设备 ================= */

function refreshMicList() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        el.mic.innerHTML = '<option value="">默认麦克风</option>';
        return Promise.resolve();
    }
    return navigator.mediaDevices.enumerateDevices().then(function (devices) {
        var prev = el.mic.value;
        var mics = devices.filter(function (d) { return d.kind === 'audioinput'; });
        var html = '<option value="">默认麦克风</option>';
        mics.forEach(function (d, i) {
            var label = d.label || ('麦克风 ' + (i + 1));
            html += '<option value="' + d.deviceId + '">' + label.replace(/</g, '&lt;') + '</option>';
        });
        el.mic.innerHTML = html;
        if (prev) el.mic.value = prev;
    }).catch(function () { /* 枚举失败不阻断录音 */ });
}

/* ================= 录制 ================= */

function startRecording() {
    if (state.status === 'recording' || state.status === 'paused') return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setStatus('❌ 当前浏览器不支持麦克风采集（getUserMedia 不可用）：请用最新版 Chrome / Edge / Firefox 并通过 HTTPS 访问');
        setRecState('error');
        return;
    }
    if (typeof MediaRecorder === 'undefined') {
        setStatus('❌ 当前浏览器不支持 MediaRecorder，请换 Chrome / Edge / Firefox 再试');
        setRecState('error');
        return;
    }
    var deviceId = el.mic.value || undefined;
    var constraints = { audio: { echoCancellation: el.echo.checked, noiseSuppression: el.noise.checked } };
    if (deviceId) constraints.audio.deviceId = { exact: deviceId };
    // 指定设备失败时（设备被拔出等）回落默认麦克风再试一次
    navigator.mediaDevices.getUserMedia(constraints).catch(function () {
        if (!deviceId) throw new Error('麦克风访问被拒绝或不可用：请检查浏览器地址栏的麦克风权限');
        return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: el.echo.checked, noiseSuppression: el.noise.checked } });
    }).then(function (stream) {
        state.stream = stream;
        var actx;
        try {
            actx = ensureCtx();
            state.sourceNode = actx.createMediaStreamSource(stream);
            state.analyser = actx.createAnalyser();
            state.analyser.fftSize = 2048;
            state.sourceNode.connect(state.analyser);
            state.analyserData = new Uint8Array(state.analyser.fftSize);
        } catch (e) {
            // 波形分析失败不阻断录制（仅波形/音量表不可用）
            state.analyser = null;
            state.analyserData = null;
        }
        // 按优先序挑浏览器支持的 MIME（MediaRecorder.isTypeSupported 探测）
        var supported = [];
        if (typeof MediaRecorder.isTypeSupported === 'function') {
            supported = MIME_PRIORITY.filter(function (m) {
                try { return MediaRecorder.isTypeSupported(m); } catch (e) { return false; }
            });
        }
        state.mimeType = pickMimeType(supported);
        var rec;
        try {
            rec = state.mimeType ? new MediaRecorder(stream, { mimeType: state.mimeType }) : new MediaRecorder(stream);
        } catch (e) {
            setStatus('❌ 无法创建录音器：' + e.message);
            setRecState('error');
            stopStream();
            return;
        }
        state.recorder = rec;
        state.chunks = [];
        rec.ondataavailable = function (ev) { if (ev.data && ev.data.size > 0) state.chunks.push(ev.data); };
        rec.onerror = function () {
            setStatus('❌ 录制出错，已停止');
            setRecState('error');
            stopWaveLoop();
            stopStream();
        };
        rec.onstop = function () { finalizeRecording(); };
        try { rec.start(250); } catch (e) {
            setStatus('❌ 开始录制失败：' + e.message);
            setRecState('error');
            stopStream();
            return;
        }
        state.recStart = Date.now();
        state.pausedTotal = 0;
        state.pauseStart = 0;
        state.elapsedSec = 0;
        setRecState('recording');
        el.rec_panel.style.display = 'block';
        el.timer.textContent = '00:00:00';
        setStatus('● 正在录音… 对着麦克风说话，波形与音量表实时跳动');
        setExportStatus('');
        state.timerId = setInterval(tickTimer, 200);
        drawWave();
        refreshMicList();   // 授权后设备名才可见，刷新一次下拉
    }).catch(function (e) {
        setStatus('❌ ' + (e && e.message ? e.message : '无法访问麦克风'));
        setRecState('error');
    });
}

function tickTimer() {
    if (state.status !== 'recording') return;
    state.elapsedSec = Math.floor((Date.now() - state.recStart - state.pausedTotal) / 1000);
    el.timer.textContent = fmtClock(state.elapsedSec);
}

function pauseRecording() {
    if (state.status !== 'recording' || !state.recorder) return;
    try { state.recorder.pause(); } catch (e) {
        setStatus('⚠️ 当前浏览器不支持暂停录制（MediaRecorder.pause 不可用），可直接停止后分段录制');
        return;
    }
    state.pauseStart = Date.now();
    setRecState('paused');
    setStatus('⏸ 已暂停（计时冻结），点「继续录制」恢复');
}

function resumeRecording() {
    if (state.status !== 'paused' || !state.recorder) return;
    try { state.recorder.resume(); } catch (e) {
        setStatus('❌ 恢复录制失败：' + e.message);
        return;
    }
    state.pausedTotal += Date.now() - state.pauseStart;
    state.pauseStart = 0;
    setRecState('recording');
    setStatus('● 正在录音… 对着麦克风说话，波形与音量表实时跳动');
}

function stopRecording() {
    if ((state.status !== 'recording' && state.status !== 'paused') || !state.recorder) return;
    if (state.status === 'paused') state.pausedTotal += Date.now() - state.pauseStart;
    state.elapsedSec = Math.floor((Date.now() - state.recStart - state.pausedTotal) / 1000);
    el.timer.textContent = fmtClock(state.elapsedSec);
    try { state.recorder.stop(); } catch (e) {
        setStatus('❌ 停止录制失败：' + e.message);
        setRecState('error');
        stopWaveLoop();
        stopStream();
        return;
    }
    setRecState('stopped');
    stopWaveLoop();
    setStatus('⏳ 正在整理录音…');
}

// MediaRecorder onstop 回调：落盘进会话内列表，并尝试解码供 WAV/MP3 导出用
function finalizeRecording() {
    var blob = new Blob(state.chunks, { type: state.mimeType || 'audio/webm' });
    var durationSec = state.elapsedSec;
    var rec = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        name: buildRecordingName(++state.recCount),
        blob: blob,
        mimeType: state.mimeType || blob.type || 'audio/webm',
        size: blob.size,
        durationSec: durationSec,
        buffer: null, sampleRate: 0, channels: 0, decodeFailed: false,
        url: URL.createObjectURL(blob)
    };
    state.recordings.push(rec);
    state.selectedId = rec.id;
    stopStream();
    state.recorder = null;
    state.chunks = [];
    setRecState('idle');
    el.timer.textContent = fmtClock(durationSec);
    setStatus('✅ 已保存到录音列表：' + rec.name + '（' + formatDuration(durationSec) + '，' + formatFileSize(rec.size) + '），正在尝试解码以便导出 WAV/MP3…');
    renderList();
    updateInfoPanel();
    // 解码：成功则 WAV/MP3 导出可用；失败则仅可下载原始 WebM（页面明示）
    var actx;
    try { actx = ensureCtx(); } catch (e) {
        rec.decodeFailed = true;
        renderList();
        updateInfoPanel();
        setStatus('✅ 已保存到录音列表：' + rec.name + '（' + formatDuration(durationSec) + '，' + formatFileSize(rec.size) + '）。⚠️ 本浏览器无法解码该录音，WAV/MP3 导出不可用，仅可下载原始 WebM');
        return;
    }
    blob.arrayBuffer().then(function (ab) {
        return actx.decodeAudioData(ab);
    }).then(function (buffer) {
        rec.buffer = buffer;
        rec.sampleRate = buffer.sampleRate;
        rec.channels = buffer.numberOfChannels;
        renderList();
        updateInfoPanel();
        setStatus('✅ 已保存到录音列表：' + rec.name + '（' + formatDuration(durationSec) + '，' + formatFileSize(rec.size) + '，' + rec.sampleRate + 'Hz ' + rec.channels + ' 声道），可导出 WebM / WAV / MP3');
    }).catch(function () {
        rec.decodeFailed = true;
        renderList();
        updateInfoPanel();
        setStatus('✅ 已保存到录音列表：' + rec.name + '（' + formatDuration(durationSec) + '，' + formatFileSize(rec.size) + '）。⚠️ 本浏览器无法解码该录音，WAV/MP3 导出不可用，仅可下载原始 WebM');
    });
}

/* ================= 波形与音量表 ================= */

function drawWave() {
    if (state.status !== 'recording' && state.status !== 'paused') return;
    state.rafId = requestAnimationFrame(drawWave);
    var canvas = el.wave;
    var ctx = canvas.getContext('2d');
    var w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, w, h);
    if (!state.analyser || !state.analyserData) {
        ctx.fillStyle = '#64748b';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(state.status === 'paused' ? '已暂停' : '波形采集中…', w / 2, h / 2 + 5);
        el.meter_fill.style.width = '0%';
        return;
    }
    state.analyser.getByteTimeDomainData(state.analyserData);
    var peak = computePeakLevel(state.analyserData);
    el.meter_fill.style.width = Math.round(peak * 100) + '%';
    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 2;
    ctx.beginPath();
    var step = w / state.analyserData.length;
    for (var i = 0; i < state.analyserData.length; i++) {
        var y = (state.analyserData[i] / 255) * h;
        if (i === 0) ctx.moveTo(0, y);
        else ctx.lineTo(i * step, y);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(148,163,184,.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
}

/* ================= 录音列表 ================= */

function findRecording(id) {
    for (var i = 0; i < state.recordings.length; i++) {
        if (state.recordings[i].id === id) return state.recordings[i];
    }
    return null;
}

function downloadBlob(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function renderList() {
    el.list_empty.style.display = state.recordings.length ? 'none' : 'block';
    el.list.innerHTML = '';
    state.recordings.forEach(function (rec) {
        var li = document.createElement('li');
        li.className = 'vr-item' + (rec.id === state.selectedId ? ' vr-sel' : '');
        var name = document.createElement('span');
        name.className = 'vr-item-name';
        name.textContent = rec.name;
        var meta = document.createElement('span');
        meta.className = 'vr-item-meta';
        meta.textContent = formatDuration(rec.durationSec) + ' · ' + formatFileSize(rec.size) +
            (rec.sampleRate ? ' · ' + rec.sampleRate + 'Hz ' + rec.channels + ' 声道' : '') +
            (rec.decodeFailed ? ' · 仅 WebM 可导出' : '');
        function mkBtn(label, title, fn) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'vr-mini';
            b.textContent = label;
            b.title = title;
            b.addEventListener('click', function (ev) { ev.stopPropagation(); fn(); });
            return b;
        }
        var playBtn = mkBtn(state.playingId === rec.id ? '⏸ 停止试听' : '▶ 试听', '试听该录音', function () { playRecording(rec); });
        var renameBtn = mkBtn('✏️ 重命名', '重命名该录音', function () { renameRecording(rec); });
        var webmBtn = mkBtn('⬇️ WebM', '下载原始录音（WebM）', function () { exportWebm(rec); });
        var wavBtn = mkBtn('⬇️ WAV', rec.decodeFailed ? '该录音无法解码，仅可下载原始 WebM' : '导出 WAV（16-bit PCM）', function () { exportWav(rec); });
        var mp3Btn = mkBtn('⬇️ MP3', rec.decodeFailed ? '该录音无法解码，仅可下载原始 WebM' : '导出 MP3（lamejs）', function () { exportMp3(rec); });
        if (rec.decodeFailed) { wavBtn.disabled = true; mp3Btn.disabled = true; }
        var delBtn = mkBtn('🗑 删除', '删除该录音', function () { deleteRecording(rec); });
        li.appendChild(name);
        li.appendChild(meta);
        li.appendChild(playBtn);
        li.appendChild(renameBtn);
        li.appendChild(webmBtn);
        li.appendChild(wavBtn);
        li.appendChild(mp3Btn);
        li.appendChild(delBtn);
        li.addEventListener('click', function () {
            state.selectedId = rec.id;
            renderList();
            updateInfoPanel();
        });
        el.list.appendChild(li);
    });
}

function stopPlayback() {
    if (state.playAudio) {
        try { state.playAudio.pause(); } catch (e) { /* 已停 */ }
    }
    state.playingId = 0;
}

function playRecording(rec) {
    if (state.playingId === rec.id) {
        stopPlayback();
        renderList();
        return;
    }
    stopPlayback();
    if (!state.playAudio) {
        state.playAudio = new Audio();
        state.playAudio.addEventListener('ended', function () { state.playingId = 0; renderList(); });
    }
    state.playAudio.src = rec.url;
    state.playingId = rec.id;
    renderList();
    var p = state.playAudio.play();
    if (p && p.catch) p.catch(function (e) { setExportStatus('❌ 试听播放失败：' + e.message); state.playingId = 0; renderList(); });
}

function renameRecording(rec) {
    var next = window.prompt('重命名录音', rec.name);
    if (next === null) return;
    next = next.trim();
    if (!next) { setExportStatus('⚠️ 名称不能为空，未重命名'); return; }
    rec.name = next;
    renderList();
    updateInfoPanel();
    setExportStatus('✅ 已重命名为「' + next + '」');
}

function deleteRecording(rec) {
    if (!window.confirm('确定删除「' + rec.name + '」吗？此操作不可恢复（未导出的录音将丢失）。')) return;
    if (state.playingId === rec.id) stopPlayback();
    try { URL.revokeObjectURL(rec.url); } catch (e) { /* 已释放 */ }
    state.recordings = state.recordings.filter(function (r) { return r.id !== rec.id; });
    if (state.selectedId === rec.id) state.selectedId = state.recordings.length ? state.recordings[state.recordings.length - 1].id : 0;
    renderList();
    updateInfoPanel();
    setExportStatus('✅ 已删除「' + rec.name + '」');
}

function clearRecordings() {
    if (!state.recordings.length) return;
    if (!window.confirm('确定清空全部 ' + state.recordings.length + ' 条录音吗？未导出的录音将丢失。')) return;
    stopPlayback();
    state.recordings.forEach(function (rec) { try { URL.revokeObjectURL(rec.url); } catch (e) { /* 已释放 */ } });
    state.recordings = [];
    state.selectedId = 0;
    renderList();
    updateInfoPanel();
    setExportStatus('✅ 已清空录音列表');
}

/* ================= 信息面板 ================= */

function updateInfoPanel() {
    var rec = state.selectedId ? findRecording(state.selectedId) : null;
    if (!rec) {
        el.info.style.display = 'none';
        return;
    }
    el.info.style.display = 'block';
    el.info_duration.textContent = formatDuration(rec.durationSec);
    el.info_rate.textContent = rec.sampleRate ? rec.sampleRate + ' Hz' : '—（解码后可见）';
    el.info_channels.textContent = rec.channels ? rec.channels + ' 声道' : '—（解码后可见）';
    el.info_size.textContent = formatFileSize(rec.size) + '（原始 WebM）';
    el.info_wav.textContent = rec.sampleRate ? formatFileSize(estimateWavBytes(rec.durationSec, rec.sampleRate, rec.channels)) : '—';
    var bitrate = parseInt(el.bitrate.value, 10) || 192;
    el.info_mp3.textContent = formatFileSize(estimateMp3Bytes(rec.durationSec, bitrate)) + '（' + bitrate + 'kbps）';
}

/* ================= 导出 ================= */

function exportWebm(rec) {
    try {
        validateRecordConfig({ format: 'webm' });
    } catch (e) {
        setExportStatus('❌ 导出配置无效：' + e.message);
        return;
    }
    var name = buildExportFilename(rec.name, 'webm');
    downloadBlob(rec.blob, name);
    setExportStatus('✅ 原始 WebM 已导出：' + name + '（' + formatDuration(rec.durationSec) + '，' + formatFileSize(rec.size) + '）');
}

function exportWav(rec) {
    if (!rec.buffer) {
        setExportStatus('⚠️ 该录音无法解码为 WAV，仅可下载原始 WebM（浏览器解码失败，属实告知）');
        return;
    }
    try {
        validateRecordConfig({ format: 'wav' });
    } catch (e) {
        setExportStatus('❌ 导出配置无效：' + e.message);
        return;
    }
    try {
        var nb = rec.buffer;
        var nch = Math.min(2, nb.numberOfChannels);
        var pcms = [];
        for (var c = 0; c < nch; c++) pcms.push(floatTo16BitPCM(nb.getChannelData(c)));
        var interleaved = interleaveChannels(pcms, nb.length);
        var dv = encodeWavDataView(nb.sampleRate, nch, interleaved);
        var blob = new Blob([dv], { type: 'audio/wav' });
        var name = buildExportFilename(rec.name, 'wav');
        downloadBlob(blob, name);
        setExportStatus('✅ WAV 已导出：' + name + '（' + formatDuration(nb.duration) + '，' + formatFileSize(blob.size) + '）');
    } catch (e) {
        setExportStatus('❌ WAV 导出失败：' + e.message);
    }
}

function yieldUI() { return new Promise(function (r) { setTimeout(r, 0); }); }

async function exportMp3(rec) {
    if (!rec.buffer) {
        setExportStatus('⚠️ 该录音无法解码为 MP3，仅可下载原始 WebM（浏览器解码失败，属实告知）');
        return;
    }
    if (typeof lamejs === 'undefined') {
        setExportStatus('❌ MP3 编码器（lamejs）未加载，请刷新页面重试（仍失败请确认页面为离线完整版）');
        return;
    }
    var bitrate = parseInt(el.bitrate.value, 10) || 192;
    try {
        validateRecordConfig({ format: 'mp3', bitrate: bitrate, echoCancellation: el.echo.checked, noiseSuppression: el.noise.checked });
    } catch (e) {
        setExportStatus('❌ 导出配置无效：' + e.message);
        return;
    }
    setExportStatus('⏳ 正在编码 MP3（' + bitrate + 'kbps）… 0%');
    try {
        var nb = rec.buffer;
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
        var name = buildExportFilename(rec.name, 'mp3');
        downloadBlob(blob, name);
        setExportStatus('✅ MP3 已导出：' + name + '（' + formatDuration(nb.duration) + '，' + bitrate + 'kbps，' + formatFileSize(blob.size) + '）');
    } catch (e) {
        setExportStatus('❌ MP3 导出失败：' + e.message);
    }
}

/* ================= 初始化 ================= */

function init() {
    el.start.addEventListener('click', startRecording);
    el.pause.addEventListener('click', pauseRecording);
    el.resume.addEventListener('click', resumeRecording);
    el.stop.addEventListener('click', stopRecording);
    el.mic_refresh.addEventListener('click', function () { refreshMicList(); });
    el.clear.addEventListener('click', clearRecordings);
    el.bitrate.addEventListener('change', updateInfoPanel);

    // 空格启停录音（焦点不在输入框/选择框/按钮上时）：空闲→开始，录制中→停止
    document.addEventListener('keydown', function (ev) {
        if (ev.code !== 'Space') return;
        var tag = (document.activeElement && document.activeElement.tagName) || '';
        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;
        if (state.status === 'idle') { ev.preventDefault(); startRecording(); }
        else if (state.status === 'recording') { ev.preventDefault(); stopRecording(); }
    });

    // 录音进行中离开页面会丢失录音，提示一次
    window.addEventListener('beforeunload', function (ev) {
        if (state.status === 'recording' || state.status === 'paused') {
            ev.preventDefault();
            ev.returnValue = '';
        }
    });

    refreshMicList();
    renderList();
    setRecState('idle');
    if (typeof lamejs === 'undefined') {
        setStatus('⚠️ MP3 编码器未能加载（vendor 文件缺失），WAV 与原始 WebM 导出不受影响');
    }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

})();
