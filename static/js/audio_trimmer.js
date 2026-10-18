/* 在线音频裁剪器 - 纯前端音频裁剪引擎
 *
 * 流程：上传音频（FileReader → ArrayBuffer，全本地，不上传）→ AudioContext.decodeAudioData 本地解码
 * → 声道混合做峰值抽取（2048 柱，canvas 波形渲染，长音频不卡顿）→ 拖拽起止手柄 / 波形框选 /
 *   毫秒输入框 / ±1ms~±1s 微调按钮 选定裁剪区间（选区外灰化）→ 选区试听（BufferSource 区间播放，
 *   循环可选，rAF 读 currentTime 同步播放线与进度）→ AudioBuffer 通道切片 → WAV 手工编码（16-bit PCM）
 *   本地下载；MP3 经本地 vendor lamejs 编码（重采样 44100Hz，比特率 64/128/192/320kbps 可选）。
 *
 * 音频只在浏览器本地处理：无后端调用、无第三方依赖、无 CDN（lamejs 为仓库内 vendor 文件）。
 * 纯函数（fmtTime / clamp / computePeaks / floatTo16BitPCM / encodeWavDataView / resampleLinear）在 node 下可单元测试。
 */
(function () {
'use strict';

/* ================= 纯函数 ================= */

// 毫秒 → "m:ss.mmm"
function fmtTime(ms) {
    ms = Math.max(0, Math.round(ms));
    var m = Math.floor(ms / 60000);
    var s = Math.floor((ms % 60000) / 1000);
    var r = ms % 1000;
    return m + ':' + (s < 10 ? '0' : '') + s + '.' + (r < 100 ? (r < 10 ? '00' : '0') : '') + r;
}

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

// 多声道平均混合为单声道（用于波形显示）
function mixToMono(channels, length) {
    var mono = new Float32Array(length);
    var n = channels.length, i, c;
    for (i = 0; i < length; i++) {
        var sum = 0;
        for (c = 0; c < n; c++) sum += channels[c][i];
        mono[i] = sum / n;
    }
    return mono;
}

// 峰值抽取：把 mono 采样压缩为 bins 个柱体，每柱记录区间最大/最小值
function computePeaks(mono, bins) {
    var len = mono.length;
    var mins = new Float32Array(bins);
    var maxs = new Float32Array(bins);
    var per = len / bins, b, s, e, i, v, mn, mx;
    for (b = 0; b < bins; b++) {
        s = Math.floor(b * per);
        e = Math.min(len, Math.floor((b + 1) * per));
        if (e <= s) e = Math.min(len, s + 1);
        mn = 1; mx = -1;
        for (i = s; i < e; i++) {
            v = mono[i];
            if (v < mn) mn = v;
            if (v > mx) mx = v;
        }
        mins[b] = mn; maxs[b] = mx;
    }
    return { mins: mins, maxs: maxs, bins: bins };
}

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

// node 下导出纯函数以便单元测试
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { fmtTime: fmtTime, clamp: clamp, mixToMono: mixToMono,
        computePeaks: computePeaks, floatTo16BitPCM: floatTo16BitPCM,
        interleaveChannels: interleaveChannels, encodeWavDataView: encodeWavDataView,
        resampleLinear: resampleLinear };
    return;
}

/* ================= 浏览器侧：状态 ================= */

var PEAK_BINS = 2048;          // 波形峰值柱数
var MP3_RATE = 44100;          // lamejs 统一编码采样率
var MP3_CHUNK = 1152;          // lamejs 每帧采样数
var MIN_SEL = 0.001;           // 最小选区 1ms

var state = {
    actx: null,          // AudioContext
    buffer: null,        // AudioBuffer（解码后原音频）
    fileName: '',        // 源文件名（不含扩展名）
    peaks: null,         // computePeaks 结果
    selStart: 0, selEnd: 0,   // 选区（秒）
    playing: false,
    playSrc: null,       // 当前 BufferSourceNode
    playRaf: 0,
    playT0: 0,           // 播放起始的 actx.currentTime
    playPos: 0,          // 当前播放位置（秒，用于画播放线）
};

function $(id) { return document.getElementById(id); }

var el = {};
['at-upload','at-file','at-srcinfo','at-status','at-editor','at-stage','at-canvas','at-hstart','at-hend',
 'at-start-label','at-end-label','at-start-ms','at-end-ms','at-len-label','at-select-all',
 'at-preview-panel','at-play','at-stop','at-loop','at-play-pos',
 'at-export-panel','at-export-wav','at-export-mp3','at-bitrate','at-export-status','at-reupload'
].forEach(function (id) { el[id.replace(/-/g, '_').replace(/^at_/, '')] = $(id); });

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

/* ================= 上传与解码 ================= */

var ACCEPT_RE = /\.(mp3|wav|wave|ogg|oga|m4a|mp4|aac|flac|webm)$/i;

function handleFile(file) {
    if (!file) return;
    if (!ACCEPT_RE.test(file.name)) {
        setStatus('❌ 不支持的文件类型：' + file.name + '（支持 MP3 / WAV / OGG / M4A）');
        return;
    }
    setStatus('⏳ 正在本地解码音频，请稍候…');
    var reader = new FileReader();
    reader.onerror = function () { setStatus('❌ 文件读取失败'); };
    reader.onload = function () {
        var ab = reader.result;
        var actx;
        try { actx = ensureCtx(); } catch (e) { setStatus('❌ ' + e.message); return; }
        actx.decodeAudioData(ab).then(function (buffer) {
            onDecoded(buffer, file);
        }).catch(function (err) {
            setStatus('❌ 音频解码失败：该文件可能损坏，或浏览器不支持此格式（' + (err && err.message ? err.message : 'unknown') + '）');
        });
    };
    reader.readAsArrayBuffer(file);
}

function onDecoded(buffer, file) {
    stopPlayback();
    state.buffer = buffer;
    state.fileName = file.name.replace(/\.[^.]+$/, '') || 'audio';
    var dur = buffer.duration;
    // 峰值抽取（声道混合）
    var chs = [];
    for (var c = 0; c < buffer.numberOfChannels; c++) chs.push(buffer.getChannelData(c));
    var t0 = performance.now();
    state.peaks = computePeaks(mixToMono(chs, buffer.length), PEAK_BINS);
    state.selStart = 0;
    state.selEnd = dur;
    el.srcinfo.style.display = 'block';
    el.srcinfo.innerHTML = '📄 ' + escapeHtml(file.name) + '　·　时长 ' + fmtTime(dur * 1000) +
        '　·　' + buffer.sampleRate + 'Hz　·　' + buffer.numberOfChannels + ' 声道' +
        '　·　大小 ' + (file.size / 1048576).toFixed(2) + ' MB';
    setStatus('✅ 解码完成（' + Math.round(performance.now() - t0) + 'ms 波形渲染）。拖动波形框选裁剪区间。');
    el.editor.style.display = 'block';
    el.preview_panel.style.display = 'block';
    el.export_panel.style.display = 'block';
    updateSelectionUI();
    sizeCanvas();
    renderWave();
    // 滚到波形区
    el.editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
}

/* ================= 波形渲染 ================= */

var canvas = null, ctx2d = null, dpr = 1;

function sizeCanvas() {
    canvas = el.canvas;
    ctx2d = canvas.getContext('2d');
    dpr = window.devicePixelRatio || 1;
    var w = el.stage.clientWidth, h = el.stage.clientHeight;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
}

function xOf(t) { // 秒 → 归一化 x
    var dur = state.buffer ? state.buffer.duration : 1;
    return clamp(t / dur, 0, 1);
}
function tOfX(x) { // 归一化 x → 秒
    var dur = state.buffer ? state.buffer.duration : 0;
    return clamp(x, 0, 1) * dur;
}

function renderWave() {
    if (!state.buffer || !state.peaks || !ctx2d) return;
    var W = canvas.width, H = canvas.height;
    var mid = H / 2, amp = H * 0.46;
    ctx2d.clearRect(0, 0, W, H);
    ctx2d.fillStyle = '#0f172a';
    ctx2d.fillRect(0, 0, W, H);

    var bins = state.peaks.bins;
    var xs = xOf(state.selStart) * W, xe = xOf(state.selEnd) * W;

    // 全波形（暗色）
    drawPeaks('#334155', 0, W);
    // 选区外灰化
    ctx2d.fillStyle = 'rgba(2,6,23,0.72)';
    if (xs > 0) ctx2d.fillRect(0, 0, xs, H);
    if (xe < W) ctx2d.fillRect(xe, 0, W - xe, H);
    // 选区内波形（亮色）
    ctx2d.save();
    ctx2d.beginPath();
    ctx2d.rect(xs, 0, Math.max(1, xe - xs), H);
    ctx2d.clip();
    drawPeaks('#38bdf8', 0, W);
    ctx2d.restore();
    // 选区边框线
    ctx2d.fillStyle = '#f59e0b';
    ctx2d.fillRect(xs - 1, 0, 2, H);
    ctx2d.fillRect(xe - 1, 0, 2, H);
    // 时间刻度
    drawRuler(W, H);
    // 播放线
    if (state.playing) {
        var px = xOf(state.playPos) * W;
        ctx2d.fillStyle = '#fbbf24';
        ctx2d.fillRect(px - 1.5, 0, 3, H);
    }

    function drawPeaks(color, x0, x1) {
        ctx2d.fillStyle = color;
        var bw = (x1 - x0) / bins;
        var step = Math.max(1, Math.floor(1 / bw)); // 柱比像素密时抽稀
        for (var b = 0; b < bins; b += step) {
            var x = x0 + b * bw;
            var y1 = mid - state.peaks.maxs[b] * amp;
            var y2 = mid - state.peaks.mins[b] * amp;
            ctx2d.fillRect(x, y1, Math.max(1, step * bw), Math.max(1, y2 - y1));
        }
    }

    function drawRuler(W, H) {
        var dur = state.buffer.duration;
        var target = 8;
        var raw = dur / target;
        var step = niceStep(raw);
        ctx2d.fillStyle = 'rgba(148,163,184,0.9)';
        ctx2d.font = (10 * dpr) + 'px ui-monospace, Menlo, monospace';
        ctx2d.textBaseline = 'top';
        for (var t = 0; t <= dur + 1e-6; t += step) {
            var x = xOf(t) * W;
            ctx2d.fillRect(x, 0, 1, 6 * dpr);
            ctx2d.fillText(fmtTime(t * 1000), x + 4 * dpr, 6 * dpr);
        }
    }
}

function niceStep(raw) {
    var steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600];
    for (var i = 0; i < steps.length; i++) if (steps[i] >= raw) return steps[i];
    return 7200;
}

/* ================= 选区交互 ================= */

function setSelection(s, e) {
    var dur = state.buffer ? state.buffer.duration : 0;
    s = clamp(s, 0, dur); e = clamp(e, 0, dur);
    if (e - s < MIN_SEL) {
        // 保持最小选区：优先扩展终点
        if (e + MIN_SEL <= dur) e = s + MIN_SEL;
        else s = Math.max(0, e - MIN_SEL);
    }
    state.selStart = s; state.selEnd = e;
    updateSelectionUI();
    renderWave();
}

function updateSelectionUI() {
    var sMs = Math.round(state.selStart * 1000), eMs = Math.round(state.selEnd * 1000);
    el.start_label.textContent = fmtTime(sMs);
    el.end_label.textContent = fmtTime(eMs);
    el.len_label.textContent = fmtTime(eMs - sMs);
    if (document.activeElement !== el.start_ms) el.start_ms.value = sMs;
    if (document.activeElement !== el.end_ms) el.end_ms.value = eMs;
    el.hstart.style.left = (xOf(state.selStart) * 100) + '%';
    el.hend.style.left = (xOf(state.selEnd) * 100) + '%';
}

function stageXToT(clientX) {
    var r = el.stage.getBoundingClientRect();
    return tOfX((clientX - r.left) / r.width);
}

var dragMode = null; // 'start' | 'end' | 'scrub'
var scrubAnchor = 0;

function bindStage() {
    el.stage.addEventListener('pointerdown', function (ev) {
        if (!state.buffer) return;
        ev.preventDefault();
        el.stage.setPointerCapture(ev.pointerId);
        var t = stageXToT(ev.clientX);
        if (ev.target === el.hstart || ev.target.closest('#at-hstart')) { dragMode = 'start'; }
        else if (ev.target === el.hend || ev.target.closest('#at-hend')) { dragMode = 'end'; }
        else { dragMode = 'scrub'; scrubAnchor = t; setSelection(t, t); }
    });
    el.stage.addEventListener('pointermove', function (ev) {
        if (!dragMode || !state.buffer) return;
        var t = stageXToT(ev.clientX);
        if (dragMode === 'start') setSelection(Math.min(t, state.selEnd - MIN_SEL), state.selEnd);
        else if (dragMode === 'end') setSelection(state.selStart, Math.max(t, state.selStart + MIN_SEL));
        else setSelection(Math.min(scrubAnchor, t), Math.max(scrubAnchor, t));
    });
    function endDrag() { dragMode = null; }
    el.stage.addEventListener('pointerup', endDrag);
    el.stage.addEventListener('pointercancel', endDrag);
    el.stage.addEventListener('dblclick', function () {
        if (state.buffer) setSelection(0, state.buffer.duration);
    });
}

function bindTimeInputs() {
    function applyMs(which, msVal) {
        if (!state.buffer || isNaN(msVal)) return;
        var t = clamp(msVal / 1000, 0, state.buffer.duration);
        if (which === 'start') setSelection(Math.min(t, state.selEnd - MIN_SEL), state.selEnd);
        else setSelection(state.selStart, Math.max(t, state.selStart + MIN_SEL));
    }
    el.start_ms.addEventListener('change', function () { applyMs('start', parseFloat(el.start_ms.value)); });
    el.end_ms.addEventListener('change', function () { applyMs('end', parseFloat(el.end_ms.value)); });
    // 微调按钮
    var grids = document.querySelectorAll('.at-nudge');
    grids.forEach(function (g) {
        g.addEventListener('click', function (ev) {
            var btn = ev.target.closest('button');
            if (!btn || !state.buffer) return;
            var dms = parseFloat(btn.getAttribute('data-d'));
            var side = g.getAttribute('data-side');
            if (side === 'start') {
                var t = clamp(state.selStart + dms / 1000, 0, state.buffer.duration);
                setSelection(Math.min(t, state.selEnd - MIN_SEL), state.selEnd);
            } else {
                var t2 = clamp(state.selEnd + dms / 1000, 0, state.buffer.duration);
                setSelection(state.selStart, Math.max(t2, state.selStart + MIN_SEL));
            }
        });
    });
    el.select_all.addEventListener('click', function () {
        if (state.buffer) setSelection(0, state.buffer.duration);
    });
}

/* ================= 试听 ================= */

function playSelection() {
    if (!state.buffer) return;
    var dur = state.selEnd - state.selStart;
    if (dur < 0.02) { setStatus('⚠️ 选区太短（<20ms），请先框选一个有效的裁剪区间'); return; }
    stopPlayback();
    var actx;
    try { actx = ensureCtx(); } catch (e) { setStatus('❌ ' + e.message); return; }
    var src = actx.createBufferSource();
    src.buffer = state.buffer;
    var loop = el.loop.checked;
    if (loop) {
        src.loop = true;
        src.loopStart = state.selStart;
        src.loopEnd = state.selEnd;
        src.start(0, state.selStart);
    } else {
        src.start(0, state.selStart, dur);
    }
    src.connect(actx.destination);
    src.onended = function () {
        // 循环模式下 stop() 会触发 onended，避免重复收尾
        if (state.playSrc === src && !loop) stopPlaybackUI();
    };
    state.playSrc = src;
    state.playing = true;
    state.playT0 = actx.currentTime;
    el.play.disabled = true;
    el.stop.disabled = false;
    setStatus(loop ? '▶ 循环试听中…' : '▶ 试听中…');
    (function tick() {
        if (!state.playing) return;
        var elapsed = actx.currentTime - state.playT0;
        var pos;
        if (loop) pos = state.selStart + (elapsed % dur);
        else pos = state.selStart + elapsed;
        if (!loop && pos >= state.selEnd) { stopPlayback(); return; }
        state.playPos = pos;
        el.play_pos.textContent = fmtTime(pos * 1000);
        renderWave();
        state.playRaf = requestAnimationFrame(tick);
    })();
}

function stopPlaybackUI() {
    state.playing = false;
    cancelAnimationFrame(state.playRaf);
    state.playSrc = null;
    el.play.disabled = false;
    el.stop.disabled = true;
    el.play_pos.textContent = fmtTime(state.selStart * 1000);
    renderWave();
    setStatus('⏹ 已停止');
}

function stopPlayback() {
    if (state.playSrc) {
        try { state.playSrc.onended = null; state.playSrc.stop(); } catch (e) { /* 已结束 */ }
    }
    if (state.playing) stopPlaybackUI();
}

/* ================= 裁剪与导出 ================= */

function sliceBuffer() {
    var buf = state.buffer;
    var sr = buf.sampleRate;
    var s0 = Math.floor(state.selStart * sr), s1 = Math.ceil(state.selEnd * sr);
    s0 = clamp(s0, 0, buf.length); s1 = clamp(s1, s0 + 1, buf.length);
    var nb;
    try {
        nb = new AudioBuffer({ numberOfChannels: buf.numberOfChannels, length: s1 - s0, sampleRate: sr });
    } catch (e) {
        // 兼容旧浏览器：走 OfflineAudioContext 构造
        var octx = new OfflineAudioContext(buf.numberOfChannels, s1 - s0, sr);
        nb = octx.createBuffer(buf.numberOfChannels, s1 - s0, sr);
    }
    for (var c = 0; c < buf.numberOfChannels; c++) {
        nb.getChannelData(c).set(buf.getChannelData(c).subarray(s0, s1));
    }
    return nb;
}

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
            var nb = sliceBuffer();
            var pcms = [];
            for (var c = 0; c < nb.numberOfChannels; c++) pcms.push(floatTo16BitPCM(nb.getChannelData(c)));
            var interleaved = interleaveChannels(pcms, nb.length);
            var nch = Math.min(2, nb.numberOfChannels);
            var dv = encodeWavDataView(nb.sampleRate, nch, interleaved);
            var blob = new Blob([dv], { type: 'audio/wav' });
            downloadBlob(blob, state.fileName + '_trimmed.wav');
            setExportStatus('✅ WAV 已导出：' + state.fileName + '_trimmed.wav（' +
                fmtTime(nb.duration * 1000) + '，' + (blob.size / 1024).toFixed(1) + ' KB）');
        } catch (e) {
            setExportStatus('❌ WAV 导出失败：' + e.message);
        }
    }, 30);
}

// 分块让出主线程，避免长音频编码时页面假死
function yieldUI() { return new Promise(function (r) { setTimeout(r, 0); }); }

async function exportMp3() {
    if (!state.buffer) return;
    if (typeof lamejs === 'undefined') {
        setExportStatus('❌ MP3 编码器（lamejs）未加载，请刷新页面重试（仍失败请确认页面为离线完整版）');
        return;
    }
    var bitrate = parseInt(el.bitrate.value, 10) || 128;
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
        downloadBlob(blob, state.fileName + '_trimmed.mp3');
        setExportStatus('✅ MP3 已导出：' + state.fileName + '_trimmed.mp3（' +
            fmtTime(nb.duration * 1000) + '，' + bitrate + 'kbps，' + (blob.size / 1024).toFixed(1) + ' KB）');
    } catch (e) {
        setExportStatus('❌ MP3 导出失败：' + e.message);
    }
    el.export_mp3.disabled = false;
    el.export_wav.disabled = false;
}

/* ================= 重置 ================= */

function resetAll() {
    stopPlayback();
    state.buffer = null;
    state.peaks = null;
    state.fileName = '';
    el.srcinfo.style.display = 'none';
    el.editor.style.display = 'none';
    el.preview_panel.style.display = 'none';
    el.export_panel.style.display = 'none';
    el.file.value = '';
    setStatus('');
    setExportStatus('');
}

/* ================= 初始化 ================= */

function init() {
    // 上传区
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

    bindStage();
    bindTimeInputs();

    el.play.addEventListener('click', playSelection);
    el.stop.addEventListener('click', stopPlayback);
    el.export_wav.addEventListener('click', exportWav);
    el.export_mp3.addEventListener('click', exportMp3);
    el.reupload.addEventListener('click', resetAll);

    var rsz = null;
    window.addEventListener('resize', function () {
        clearTimeout(rsz);
        rsz = setTimeout(function () { if (state.buffer) { sizeCanvas(); renderWave(); } }, 150);
    });

    if (typeof lamejs === 'undefined') {
        setStatus('⚠️ MP3 编码器未能加载（vendor 文件缺失），WAV 导出不受影响');
    }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

})();
