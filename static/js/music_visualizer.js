/* 音乐可视化器（music_visualizer）- 纯前端音频频谱可视化
 *
 * 流程：上传音频（FileReader → ArrayBuffer，全本地，不上传）→ AudioContext.decodeAudioData 本地解码
 * → AudioBufferSourceNode → AnalyserNode（fftSize=2048）取频域/时域数据 → canvas 渲染 5 种样式
 * （频谱条 / 环形频谱 / 波形 / 圆形波形 / 镜像频谱）＋ 3 组颜色主题（霓虹 / 落日 / 海洋）
 * → 播放控制（播放/暂停/进度/音量）＋ 麦克风输入模式（getUserMedia，拒绝授权明确提示）
 * → MediaRecorder 录制 canvas.captureStream＋音频导出 WebM，另附 PNG 静态帧截图。
 *
 * 真限制（页面明示）：① 导出为实时录制（3 分钟音频等 3 分钟，不能加速离线渲染）；
 * ② 画面随音频频谱内容变化（静音/弱信号时画面也弱，无固定动画兜底）；
 * ③ 零上传＋麦克风需授权（文件只在浏览器本地处理；麦克风模式须浏览器授权，拒绝则无法使用）。
 * 纯函数（clamp / fmtSize / fmtTime / validateAudioFile / computeBarHeights / smoothHeights /
 *   freqToColor / buildWaveformPoints / formatDuration / recordingFilename）在 node 下可单元测试；
 * 非法参数抛 Error 且 err.field 给字段名。
 */
(function () {
'use strict';

/* ================= 常量 ================= */

var MAX_FILE_SIZE = 200 * 1024 * 1024;   // 200MB
var ALLOWED_EXTS = ['.flac', '.wav', '.mp3', '.ogg', '.m4a'];
var FFT_SIZE = 2048;                     // AnalyserNode fftSize
var SMOOTH_FACTOR = 0.6;                 // 频谱条指数平滑系数
var STYLES = ['bars', 'ring', 'waveform', 'circular', 'mirror'];
var THEMES = {
    neon:   ['#00e5ff', '#2979ff', '#d500f9', '#ff2d78'],  // 霓虹
    sunset: ['#ffea00', '#ff9100', '#ff3d00', '#c2185b'],  // 落日
    ocean:  ['#00e676', '#00bfa5', '#0091ea', '#304ffe']   // 海洋
};

/* ================= 纯函数 ================= */

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

// 字节数 → 人类可读
function fmtSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(2) + ' MB';
    return (bytes / 1073741824).toFixed(2) + ' GB';
}

// 毫秒 → "m:ss.mmm"
function fmtTime(ms) {
    ms = Math.max(0, Math.round(ms));
    var m = Math.floor(ms / 60000);
    var s = Math.floor((ms % 60000) / 1000);
    var r = ms % 1000;
    return m + ':' + (s < 10 ? '0' : '') + s + '.' + (r < 100 ? (r < 10 ? '00' : '0') : '') + r;
}

function err(field, msg) {
    var e = new Error(msg);
    e.field = field;
    return e;
}

/* ---------- 文件校验 ---------- */

// 校验上传文件：扩展名白名单（.flac/.wav/.mp3/.ogg/.m4a）+ 体积 ≤200MB（含 200MB 整边界）
// 返回 {name, ext, size}；非法抛 Error，err.field 为 'file' | 'name' | 'size'
function validateAudioFile(file) {
    if (!file || typeof file !== 'object' || Array.isArray(file)) throw err('file', '未选择文件');
    if (typeof file.name !== 'string' || file.name.trim() === '') throw err('name', '文件名无效');
    var dot = file.name.lastIndexOf('.');
    if (dot < 0) throw err('name', '文件缺少扩展名');
    var ext = file.name.slice(dot).toLowerCase();
    if (ALLOWED_EXTS.indexOf(ext) === -1) throw err('name', '不支持的文件格式：' + ext);
    if (typeof file.size !== 'number' || isNaN(file.size)) throw err('size', '文件体积无效');
    if (file.size <= 0) throw err('size', '文件为空');
    if (file.size > MAX_FILE_SIZE) throw err('size', '文件超过 200MB 上限');
    return { name: file.name, ext: ext, size: file.size };
}

/* ---------- 频域 → 归一化柱高 ---------- */

// 频域字节数据（0–255）→ 0..1 归一化柱高；bins 指定时按桶取最大值降采样到 bins 柱
// 精确锚点：全 255→全 1；全 0→全 0；[0,128,255]→[0,128/255≈0.502,1]
// 返回 Float32Array；非法参数抛 Error（err.field：freqData/bins）
function computeBarHeights(freqData, bins) {
    if (!freqData || typeof freqData.length !== 'number' || freqData.length < 1) throw err('freqData', '频域数据为空');
    for (var k = 0; k < freqData.length; k++) {
        if (typeof freqData[k] !== 'number' || isNaN(freqData[k]) || freqData[k] < 0 || freqData[k] > 255) throw err('freqData', '频域数据须为 0..255');
    }
    if (bins === undefined || bins === null) bins = freqData.length;
    if (typeof bins !== 'number' || isNaN(bins) || bins < 1 || Math.floor(bins) !== bins) throw err('bins', '柱数须为正整数');
    if (bins > freqData.length) throw err('bins', '柱数不能超过频域数据长度');
    var out = new Float32Array(bins);
    if (bins === freqData.length) {
        for (var i = 0; i < bins; i++) out[i] = freqData[i] / 255;
        return out;
    }
    var per = freqData.length / bins;
    for (var b = 0; b < bins; b++) {
        var start = Math.floor(b * per), end = Math.max(start + 1, Math.floor((b + 1) * per));
        var peak = 0;
        for (var j = start; j < end && j < freqData.length; j++) {
            if (freqData[j] > peak) peak = freqData[j];
        }
        out[b] = peak / 255;
    }
    return out;
}

/* ---------- 指数平滑 ---------- */

// 指数平滑 out[i] = prev[i] + factor·(next[i] − prev[i])
// 精确锚点：factor=1 时 out=next；factor=0.5、prev=[0]、next=[1] 时 out=[0.5]；factor=0 时 out=prev
// 返回新的 Float32Array，不改原数组；非法参数抛 Error（err.field：prev/next/length/factor）
function smoothHeights(prev, next, factor) {
    if (!prev || typeof prev.length !== 'number' || prev.length < 1) throw err('prev', '上一帧柱高为空');
    if (!next || typeof next.length !== 'number' || next.length < 1) throw err('next', '当前帧柱高为空');
    if (prev.length !== next.length) throw err('length', '前后两帧柱高长度不一致');
    if (typeof factor !== 'number' || isNaN(factor) || factor < 0 || factor > 1) throw err('factor', '平滑系数须为 0..1');
    var out = new Float32Array(prev.length);
    for (var i = 0; i < prev.length; i++) out[i] = prev[i] + factor * (next[i] - prev[i]);
    return out;
}

/* ---------- 对数频率 → 色带 ---------- */

// 频率对数映射到主题色带：t = ln(freq/minFreq) / ln(maxFreq/minFreq)，在色标间线性插值
// 精确锚点：freq=minFreq 时返回主题首色；freq=maxFreq 时返回主题末色；超出范围钳制到两端
// 主题：neon（霓虹）/ sunset（落日）/ ocean（海洋），缺省 neon；返回小写 #rrggbb
// 非法参数抛 Error（err.field：freq/minFreq/maxFreq/theme）
function freqToColor(freq, minFreq, maxFreq, theme) {
    if (typeof freq !== 'number' || isNaN(freq) || freq <= 0) throw err('freq', '频率须为正数');
    if (typeof minFreq !== 'number' || isNaN(minFreq) || minFreq <= 0) throw err('minFreq', '最小频率须为正数');
    if (typeof maxFreq !== 'number' || isNaN(maxFreq) || maxFreq <= minFreq) throw err('maxFreq', '最大频率须大于最小频率');
    if (theme === undefined || theme === null) theme = 'neon';
    var stops = THEMES[theme];
    if (!stops) throw err('theme', '未知颜色主题：' + theme);
    var t = Math.log(freq / minFreq) / Math.log(maxFreq / minFreq);
    t = clamp(t, 0, 1);
    var seg = t * (stops.length - 1);
    var idx = Math.min(stops.length - 2, Math.floor(seg));
    var frac = seg - idx;
    function hex2rgb(h) {
        return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    }
    var a = hex2rgb(stops[idx]), b = hex2rgb(stops[idx + 1]);
    var rgb = [0, 1, 2].map(function (k) { return Math.round(a[k] + frac * (b[k] - a[k])); });
    function hx(v) { var s = v.toString(16); return s.length < 2 ? '0' + s : s; }
    return '#' + hx(rgb[0]) + hx(rgb[1]) + hx(rgb[2]);
}

/* ---------- 时域 → 波形点 ---------- */

// 时域字节数据（128 为中线）→ 波形点 [{x, y}]：x 在 0..width 均匀分布，
// y = height/2 − (v−128)/128 · (height/2)；全 128→y=height/2；v=255→y≈0（顶）；v=0→y=height（底）
// count 缺省为 min(256, 数据长度)；返回普通数组；非法参数抛 Error
// （err.field：timeData/width/height/count）
function buildWaveformPoints(timeData, width, height, count) {
    if (!timeData || typeof timeData.length !== 'number' || timeData.length < 1) throw err('timeData', '时域数据为空');
    for (var k = 0; k < timeData.length; k++) {
        if (typeof timeData[k] !== 'number' || isNaN(timeData[k]) || timeData[k] < 0 || timeData[k] > 255) throw err('timeData', '时域数据须为 0..255');
    }
    if (typeof width !== 'number' || isNaN(width) || width <= 0) throw err('width', '画布宽度须为正数');
    if (typeof height !== 'number' || isNaN(height) || height <= 0) throw err('height', '画布高度须为正数');
    if (count === undefined || count === null) count = Math.min(256, timeData.length);
    if (typeof count !== 'number' || isNaN(count) || count < 1 || Math.floor(count) !== count) throw err('count', '点数须为正整数');
    if (count > timeData.length) throw err('count', '点数不能超过时域数据长度');
    var pts = [];
    var step = timeData.length / count;
    for (var i = 0; i < count; i++) {
        var v = timeData[Math.floor(i * step)];
        var x = count === 1 ? 0 : (i / (count - 1)) * width;
        var y = (height / 2) * (1 - (v - 128) / 128);
        pts.push({ x: x, y: y });
    }
    return pts;
}

/* ---------- 时长格式化 ---------- */

// 秒 → "m:ss"：0→0:00、65→1:05、3599→59:59；非法参数抛 Error（err.field：seconds）
function formatDuration(seconds) {
    if (typeof seconds !== 'number' || isNaN(seconds) || seconds < 0) throw err('seconds', '时长须为非负数');
    var total = Math.floor(seconds);
    var m = Math.floor(total / 60);
    var s = total % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
}

/* ---------- 录制文件名 ---------- */

// 去扩展名＋"-visualizer.webm"：song.mp3→song-visualizer.webm；空名回退 audio-visualizer.webm
function recordingFilename(base) {
    var name = String(base || '').trim();
    var dot = name.lastIndexOf('.');
    if (dot > 0) name = name.slice(0, dot);
    name = name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) || 'audio';
    return name + '-visualizer.webm';
}

// node 下导出纯函数以便单元测试
var api = { clamp: clamp, fmtSize: fmtSize, fmtTime: fmtTime,
    MAX_FILE_SIZE: MAX_FILE_SIZE, ALLOWED_EXTS: ALLOWED_EXTS, FFT_SIZE: FFT_SIZE,
    SMOOTH_FACTOR: SMOOTH_FACTOR, STYLES: STYLES, THEMES: THEMES,
    validateAudioFile: validateAudioFile, computeBarHeights: computeBarHeights,
    smoothHeights: smoothHeights, freqToColor: freqToColor,
    buildWaveformPoints: buildWaveformPoints, formatDuration: formatDuration,
    recordingFilename: recordingFilename };
if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    return;
}
if (typeof window !== 'undefined') window.MusicVisualizer = api;

/* ================= 浏览器侧：状态 ================= */

var state = {
    actx: null,          // AudioContext（解码 + 播放 + 分析）
    analyser: null,      // AnalyserNode（fftSize=2048）
    gain: null,          // GainNode（音量）
    mediaDest: null,     // MediaStreamDestination（录制用音频流）
    buffer: null,        // AudioBuffer（解码后原音频）
    fileBase: '',        // 源文件名（不含扩展名）
    source: null,        // 当前 AudioBufferSourceNode（文件模式）
    micStream: null,     // MediaStream（麦克风模式）
    micSource: null,     // MediaStreamAudioSourceNode（麦克风模式）
    mode: 'file',        // file=文件播放 / mic=麦克风实时输入
    playing: false,      // 文件播放中
    offset: 0,           // 暂停/续播位置（秒）
    startedAt: 0,        // 本次 start 时的 actx.currentTime
    volume: 0.8,         // 音量 0..1
    style: 'bars',       // 渲染样式
    theme: 'neon',       // 颜色主题
    prevHeights: null,   // 上一帧平滑后柱高
    raf: 0,              // requestAnimationFrame 句柄
    recorder: null,      // MediaRecorder
    recChunks: [],       // 录制数据块
    recording: false,    // 录制中
    recStartAt: 0        // 录制开始时间戳（用于显示录制时长）
};

var el = {};
['upload','file','srcinfo','status',
 'style-bars','style-ring','style-waveform','style-circular','style-mirror',
 'theme','smoothing','smoothing-val',
 'canvas','play','seek','seek-fill','cur-time','total-time','volume','volume-val',
 'mic','mic-status','record','rec-status','shot','shot-status',
 'panel-player','panel-controls','panel-record','reupload'
].forEach(function (id) { el[id.replace(/-/g, '_')] = document.getElementById('mv-' + id); });

function setStatus(t) { el.status.textContent = t || ''; }
function setMicStatus(t) { el.mic_status.textContent = t || ''; }
function setRecStatus(t) { el.rec_status.textContent = t || ''; }
function setShotStatus(t) { el.shot_status.textContent = t || ''; }

/* ================= AudioContext 与分析链 ================= */

function ensureActx() {
    if (!state.actx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        state.actx = new AC();
        state.analyser = state.actx.createAnalyser();
        state.analyser.fftSize = FFT_SIZE;
        state.analyser.smoothingTimeConstant = 0.8;
        state.gain = state.actx.createGain();
        state.gain.gain.value = state.volume;
        state.gain.connect(state.analyser);
        state.analyser.connect(state.actx.destination);
        state.mediaDest = state.actx.createMediaStreamDestination();
        state.gain.connect(state.mediaDest);
    }
    if (state.actx.state === 'suspended') state.actx.resume();
    return state.actx;
}

/* ================= 上传与解码 ================= */

function handleFile(f) {
    if (!f) return;
    try {
        validateAudioFile(f);
    } catch (e) {
        setStatus('❌ ' + e.message + '（支持 FLAC/WAV/MP3/OGG/M4A，≤200MB）');
        return;
    }
    stopMic();
    setStatus('⏳ 正在读取并解码音频…');
    var rd = new FileReader();
    rd.onload = function () {
        var actx = ensureActx();
        actx.decodeAudioData(rd.result).then(function (buf) {
            state.buffer = buf;
            state.mode = 'file';
            state.offset = 0;
            state.playing = false;
            var dot = f.name.lastIndexOf('.');
            state.fileBase = dot > 0 ? f.name.slice(0, dot) : f.name;
            el.srcinfo.style.display = 'block';
            el.srcinfo.textContent = '📄 ' + f.name + ' ｜ ' + formatDuration(buf.duration) +
                ' ｜ ' + buf.sampleRate + 'Hz ｜ ' + buf.numberOfChannels + ' 声道 ｜ ' + fmtSize(f.size);
            el.total_time.textContent = formatDuration(buf.duration);
            el.cur_time.textContent = '0:00';
            el.seek_fill.style.width = '0%';
            el.panel_player.style.display = 'block';
            el.panel_controls.style.display = 'block';
            el.panel_record.style.display = 'block';
            el.play.disabled = false;
            el.play.textContent = '▶ 播放';
            setStatus('✅ 解码成功，点「播放」开始可视化');
            startLoop();
        }).catch(function () {
            setStatus('❌ 解码失败：该格式可能不受当前浏览器支持（试试 MP3 / WAV）');
        });
    };
    rd.onerror = function () { setStatus('❌ 文件读取失败'); };
    rd.readAsArrayBuffer(f);
}

function resetAll() {
    stopPlayback();
    stopMic();
    stopRecording(true);
    state.buffer = null;
    state.fileBase = '';
    state.offset = 0;
    state.prevHeights = null;
    el.file.value = '';
    el.srcinfo.style.display = 'none';
    el.panel_player.style.display = 'none';
    el.panel_controls.style.display = 'none';
    el.panel_record.style.display = 'none';
    el.play.textContent = '▶ 播放';
    el.cur_time.textContent = '0:00';
    el.total_time.textContent = '0:00';
    el.seek_fill.style.width = '0%';
    setStatus(''); setMicStatus(''); setRecStatus(''); setShotStatus('');
    drawIdle();
}

/* ================= 文件播放（AudioBufferSourceNode） ================= */

function currentPosition() {
    if (!state.buffer) return 0;
    if (!state.playing) return state.offset;
    return Math.min(state.buffer.duration, state.offset + (state.actx.currentTime - state.startedAt));
}

function startSource(offset) {
    stopSource();
    var src = state.actx.createBufferSource();
    src.buffer = state.buffer;
    src.connect(state.gain);
    src.onended = function () {
        if (state.playing && state.source === src) {
            state.playing = false;
            state.offset = 0;
            el.play.textContent = '▶ 播放';
            el.cur_time.textContent = '0:00';
            el.seek_fill.style.width = '0%';
            setStatus('✅ 播放结束');
        }
    };
    src.start(0, offset);
    state.source = src;
    state.startedAt = state.actx.currentTime;
    state.playing = true;
    el.play.textContent = '⏸ 暂停';
}

function stopSource() {
    if (state.source) {
        try { state.source.onended = null; state.source.stop(); } catch (e) {}
        try { state.source.disconnect(); } catch (e) {}
        state.source = null;
    }
}

function stopPlayback() {
    if (state.playing) {
        state.offset = currentPosition();
        state.playing = false;
    }
    stopSource();
    el.play.textContent = '▶ 播放';
}

function togglePlay() {
    if (!state.buffer) { setStatus('❌ 请先上传音频，或使用麦克风模式'); return; }
    ensureActx();
    if (state.playing) {
        stopPlayback();
        setStatus('⏸ 已暂停（' + formatDuration(state.offset) + ' / ' + formatDuration(state.buffer.duration) + '）');
    } else {
        if (state.offset >= state.buffer.duration) state.offset = 0;
        startSource(state.offset);
        setStatus('▶ 正在播放并可视化：' + state.fileBase);
    }
}

function seekTo(frac) {
    if (!state.buffer) return;
    var wasPlaying = state.playing;
    stopPlayback();
    state.offset = clamp(frac, 0, 1) * state.buffer.duration;
    el.cur_time.textContent = formatDuration(state.offset);
    el.seek_fill.style.width = (clamp(frac, 0, 1) * 100) + '%';
    if (wasPlaying) startSource(state.offset);
}

/* ================= 麦克风模式 ================= */

function startMic() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setMicStatus('❌ 当前浏览器不支持麦克风输入（需 getUserMedia），请换 Chrome / Edge / Firefox');
        return;
    }
    ensureActx();
    setMicStatus('⏳ 正在请求麦克风授权…');
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
        stopPlayback();
        stopMic();
        state.micStream = stream;
        state.micSource = state.actx.createMediaStreamSource(stream);
        state.micSource.connect(state.gain);
        state.mode = 'mic';
        el.panel_player.style.display = 'none';
        el.panel_controls.style.display = 'block';
        el.panel_record.style.display = 'block';
        el.mic.textContent = '🎙️ 停止麦克风';
        setMicStatus('✅ 麦克风已接入：对着麦克风说话或播放音乐，画面会随声音实时变化（停止后请关闭授权指示灯）');
        startLoop();
    }).catch(function (e) {
        var reason = (e && e.name === 'NotAllowedError') ? '你拒绝了麦克风授权（或浏览器已屏蔽本站麦克风权限）'
            : (e && e.name === 'NotFoundError') ? '未找到可用的麦克风设备'
            : '无法打开麦克风（' + (e && e.name ? e.name : '未知错误') + '）';
        setMicStatus('❌ ' + reason + '：请在浏览器地址栏的权限设置里允许本站使用麦克风后重试。文件模式不受影响。');
    });
}

function stopMic() {
    if (state.micSource) {
        try { state.micSource.disconnect(); } catch (e) {}
        state.micSource = null;
    }
    if (state.micStream) {
        state.micStream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });
        state.micStream = null;
    }
    if (state.mode === 'mic') state.mode = 'file';
    el.mic.textContent = '🎙️ 麦克风输入';
}

function toggleMic() {
    if (state.micStream) {
        stopMic();
        setMicStatus('⏹ 麦克风已停止');
        if (!state.buffer) {
            el.panel_controls.style.display = 'none';
            el.panel_record.style.display = 'none';
        }
    } else {
        startMic();
    }
}

/* ================= 渲染循环 ================= */

var FREQ = new Uint8Array(1024);   // fftSize=2048 → 1024 频点
var TIME = new Uint8Array(2048);   // 时域 2048 采样

function startLoop() {
    if (state.raf) return;
    var loop = function () {
        state.raf = requestAnimationFrame(loop);
        drawFrame();
        if (state.mode === 'file' && state.buffer) {
            var pos = currentPosition();
            el.cur_time.textContent = formatDuration(pos);
            el.seek_fill.style.width = (state.buffer.duration > 0 ? (pos / state.buffer.duration * 100) : 0) + '%';
            if (state.recording) setRecStatus('🔴 录制中 ' + formatDuration((Date.now() - state.recStartAt) / 1000) + '（实时录制：3 分钟音频需录满 3 分钟）');
        } else if (state.mode === 'mic' && state.recording) {
            setRecStatus('🔴 录制中 ' + formatDuration((Date.now() - state.recStartAt) / 1000) + '（实时录制中）');
        }
    };
    state.raf = requestAnimationFrame(loop);
}

function drawIdle() {
    var cv = el.canvas;
    if (!cv) return;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = '#64748b';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('上传音频或接入麦克风后，这里会随声音实时跳动', cv.width / 2, cv.height / 2);
}

function freqOfBin(bin, sampleRate) {
    return (bin + 0.5) * sampleRate / FFT_SIZE;
}

function drawFrame() {
    var cv = el.canvas;
    if (!cv || !state.analyser) return;
    var ctx = cv.getContext('2d');
    var W = cv.width, H = cv.height;
    state.analyser.getByteFrequencyData(FREQ);
    state.analyser.getByteTimeDomainData(TIME);
    var theme = THEMES[state.theme] || THEMES.neon;
    var sampleRate = state.actx ? state.actx.sampleRate : 44100;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, W, H);

    if (state.style === 'waveform') {
        drawWaveform(ctx, W, H, theme);
    } else if (state.style === 'circular') {
        drawCircularWave(ctx, W, H, theme);
    } else {
        drawSpectrum(ctx, W, H, theme, sampleRate);
    }
}

function drawSpectrum(ctx, W, H, theme, sampleRate) {
    var bars = 96;
    var raw = computeBarHeights(FREQ, bars);
    var heights = state.prevHeights
        ? smoothHeights(state.prevHeights, raw, SMOOTH_FACTOR)
        : raw;
    state.prevHeights = heights;
    var minF = 20, maxF = Math.min(20000, sampleRate / 2);

    if (state.style === 'ring') {
        var cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.22;
        for (var i = 0; i < bars; i++) {
            var a = (i / bars) * Math.PI * 2 - Math.PI / 2;
            var len = heights[i] * Math.min(W, H) * 0.26 + 2;
            var f = freqOfBin(Math.floor(i / bars * FREQ.length), sampleRate);
            ctx.strokeStyle = freqToColor(f, minF, maxF, state.theme);
            ctx.lineWidth = Math.max(2, (Math.PI * 2 * R / bars) * 0.7);
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
            ctx.lineTo(cx + Math.cos(a) * (R + len), cy + Math.sin(a) * (R + len));
            ctx.stroke();
        }
        ctx.fillStyle = theme[1];
        ctx.beginPath();
        ctx.arc(cx, cy, R * 0.55, 0, Math.PI * 2);
        ctx.fill();
        return;
    }

    var bw = W / bars;
    for (var j = 0; j < bars; j++) {
        var h = Math.max(2, heights[j] * (H - 16));
        var fj = freqOfBin(Math.floor(j / bars * FREQ.length), sampleRate);
        var color = freqToColor(fj, minF, maxF, state.theme);
        ctx.fillStyle = color;
        if (state.style === 'mirror') {
            ctx.fillRect(j * bw + 1, H / 2 - h / 2, bw - 2, h / 2);
            ctx.fillRect(j * bw + 1, H / 2, bw - 2, h / 2);
        } else { // bars：底部频谱条
            ctx.fillRect(j * bw + 1, H - h, bw - 2, h);
        }
    }
}

function drawWaveform(ctx, W, H, theme) {
    var pts = buildWaveformPoints(TIME, W, H);
    ctx.strokeStyle = theme[0];
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    ctx.stroke();
}

function drawCircularWave(ctx, W, H, theme) {
    var pts = buildWaveformPoints(TIME, W, H);
    var cx = W / 2, cy = H / 2;
    var R = Math.min(W, H) * 0.3;
    var amp = Math.min(W, H) * 0.18;
    ctx.strokeStyle = theme[2] || theme[0];
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (var i = 0; i < pts.length; i++) {
        var a = (i / pts.length) * Math.PI * 2 - Math.PI / 2;
        var r = R + (H / 2 - pts[i].y) / (H / 2) * amp;
        var x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
}

/* ================= 录制（MediaRecorder）与截图 ================= */

function downloadBlob(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}

function startRecording() {
    if (state.recording) return;
    if (!state.actx || !state.analyser) {
        setRecStatus('❌ 请先上传音频并播放，或接入麦克风，再开始录制');
        return;
    }
    if (typeof MediaRecorder === 'undefined') {
        setRecStatus('❌ 当前浏览器不支持 MediaRecorder 录制');
        return;
    }
    var canvasStream = el.canvas.captureStream(30);
    var tracks = canvasStream.getVideoTracks().slice();
    var audioTracks = state.mediaDest.stream.getAudioTracks();
    if (audioTracks.length > 0) tracks.push(audioTracks[0]);
    else if (state.micStream) {
        var mt = state.micStream.getAudioTracks();
        if (mt.length > 0) tracks.push(mt[0]);
    }
    var stream = new MediaStream(tracks);
    var mime = '';
    if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) mime = 'video/webm;codecs=vp9,opus';
    else if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) mime = 'video/webm;codecs=vp8,opus';
    var rec;
    try {
        rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch (e) {
        setRecStatus('❌ 录制启动失败：' + e.message);
        return;
    }
    state.recChunks = [];
    rec.ondataavailable = function (ev) { if (ev.data && ev.data.size > 0) state.recChunks.push(ev.data); };
    rec.onstop = function () {
        state.recording = false;
        el.record.textContent = '🔴 开始录制';
        el.record.disabled = false;
        var blob = new Blob(state.recChunks, { type: 'video/webm' });
        var name = recordingFilename(state.fileBase || 'mic');
        downloadBlob(blob, name);
        setRecStatus('✅ 已导出 WebM 频谱视频：' + name + '（' + fmtSize(blob.size) + '，实时录制，含画面＋音频）');
    };
    rec.start(250);
    state.recorder = rec;
    state.recording = true;
    state.recStartAt = Date.now();
    el.record.textContent = '⏹ 停止并导出';
    setRecStatus('🔴 录制中 0:00（实时录制：3 分钟音频需录满 3 分钟，录制期间请保持页面前台）');
}

function stopRecording(silent) {
    if (state.recorder && state.recording) {
        try { state.recorder.stop(); } catch (e) {}
    }
    state.recorder = null;
    state.recording = false;
    el.record.textContent = '🔴 开始录制';
    if (!silent) setRecStatus('');
}

function takeScreenshot() {
    if (!state.actx) { setShotStatus('❌ 请先上传音频或接入麦克风'); return; }
    el.canvas.toBlob(function (blob) {
        if (!blob) { setShotStatus('❌ 截图失败'); return; }
        var base = (state.fileBase || 'mic').replace(/[\\/:*?"<>|]/g, '_');
        downloadBlob(blob, base + '-visualizer.png');
        setShotStatus('✅ 已保存当前帧 PNG：' + base + '-visualizer.png（' + fmtSize(blob.size) + '）');
    }, 'image/png');
}

/* ================= 初始化 ================= */

function bindStyleButtons() {
    var map = { bars: 'style_bars', ring: 'style_ring', waveform: 'style_waveform', circular: 'style_circular', mirror: 'style_mirror' };
    Object.keys(map).forEach(function (key) {
        var btn = el[map[key]];
        if (!btn) return;
        btn.addEventListener('click', function () {
            state.style = key;
            state.prevHeights = null;
            Object.keys(map).forEach(function (k) {
                var b = el[map[k]];
                if (b) b.classList.toggle('mv-active', k === key);
            });
            drawIdle();
        });
    });
}

function init() {
    bindStyleButtons();
    el.theme.addEventListener('change', function () {
        state.theme = el.theme.value;
        state.prevHeights = null;
    });
    el.smoothing.addEventListener('input', function () {
        var v = parseInt(el.smoothing.value, 10) || 0;
        SMOOTH_FACTOR = v / 100;
        el.smoothing_val.textContent = v + '%';
    });
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

    el.play.addEventListener('click', togglePlay);
    el.seek.addEventListener('click', function (ev) {
        var rect = el.seek.getBoundingClientRect();
        seekTo((ev.clientX - rect.left) / rect.width);
    });
    el.volume.addEventListener('input', function () {
        state.volume = parseInt(el.volume.value, 10) / 100;
        el.volume_val.textContent = el.volume.value + '%';
        if (state.gain) state.gain.gain.value = state.volume;
    });
    el.mic.addEventListener('click', toggleMic);
    el.record.addEventListener('click', function () {
        if (state.recording) stopRecording(false);
        else startRecording();
    });
    el.shot.addEventListener('click', takeScreenshot);
    el.reupload.addEventListener('click', resetAll);

    drawIdle();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

})();
