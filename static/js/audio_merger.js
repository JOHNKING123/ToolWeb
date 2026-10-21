/* 音频合并器 - 纯前端多段音频拼接引擎
 *
 * 流程：多文件上传/拖拽（FileReader → ArrayBuffer，全本地，不上传）→ AudioContext.decodeAudioData
 *   本地解码 → 采样率/声道归一化（统一重采样到 44100Hz；声道：全单声道则单声道，否则立体声，
 *   单声道段复制为双声道）→ AudioBuffer 数据顺序拼接（可选每段淡入淡出、段间静音间隔）
 *   → 合并试听（一次播放）→ WAV 手工编码（16-bit PCM）本地下载；MP3 经本地 vendor lamejs
 *   编码（44100Hz，比特率 64/128/192/320kbps 可选）。
 *
 * 零上传：无后端调用、无第三方依赖、无 CDN（lamejs 为仓库内 vendor 文件），脚本内零 fetch/XHR。
 * 纯函数（fmtTime / clamp / floatTo16BitPCM / interleaveChannels / encodeWavDataView /
 *   resampleLinear / normalizeChannels / applyFade / concatSegments / estimateWavBytes /
 *   estimateMp3Bytes / moveItem / insertSegmentBySeq / fmtSize）在 node 下可单元测试。
 */
(function () {
'use strict';

/* ================= 纯函数 ================= */

var TARGET_RATE = 44100; // 归一化目标采样率（与 lamejs 编码路径一致）

// 毫秒 → "m:ss.mmm"
function fmtTime(ms) {
    ms = Math.max(0, Math.round(ms));
    var m = Math.floor(ms / 60000);
    var s = Math.floor((ms % 60000) / 1000);
    var r = ms % 1000;
    return m + ':' + (s < 10 ? '0' : '') + s + '.' + (r < 100 ? (r < 10 ? '00' : '0') : '') + r;
}

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

// 字节数 → 人类可读
function fmtSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(2) + ' MB';
    return (bytes / 1073741824).toFixed(2) + ' GB';
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

// 线性重采样
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

// 声道归一化：channels 为 Float32Array 数组，target 为 1 或 2
// 规则：单声道→立体声时复制；立体声→单声道时取平均；多声道→立体声取前 2 声道，→单声道全混合
function normalizeChannels(channels, target) {
    var n = channels.length;
    if (n === target) return channels;
    if (target === 2) {
        if (n === 1) return [channels[0], channels[0].slice()];
        return [channels[0], channels[1]]; // n > 2 取前 2 声道
    }
    // target === 1：全声道平均混合为单声道
    var len = channels[0].length;
    var mono = new Float32Array(len);
    for (var i = 0; i < len; i++) {
        var sum = 0;
        for (var c = 0; c < n; c++) sum += channels[c][i];
        mono[i] = sum / n;
    }
    return [mono];
}

// 对单通道应用淡入/淡出（余弦曲线），返回新数组；fadeInSamples/fadeOutSamples 为 0 时不处理对应端
function applyFade(ch, fadeInSamples, fadeOutSamples) {
    if (fadeInSamples <= 0 && fadeOutSamples <= 0) return ch;
    var len = ch.length;
    var fi = clamp(Math.round(fadeInSamples), 0, len);
    var fo = clamp(Math.round(fadeOutSamples), 0, len);
    var out = ch.slice();
    var i, g;
    for (i = 0; i < fi; i++) {
        g = 0.5 * (1 - Math.cos(Math.PI * i / fi));
        out[i] *= g;
    }
    for (i = 0; i < fo; i++) {
        g = 0.5 * (1 - Math.cos(Math.PI * i / fo));
        out[len - 1 - i] *= g;
    }
    return out;
}

/* 顺序拼接多段音频（纯函数，浏览器 AudioBuffer 数据亦可按此逻辑处理）
 * segments: [{ channels: [Float32Array], sampleRate: number }]
 * opts: { targetRate, fadeMs, gapSec }
 * 返回: { channels: [Float32Array], sampleRate: targetRate, duration }
 */
function concatSegments(segments, opts) {
    opts = opts || {};
    var targetRate = opts.targetRate || TARGET_RATE;
    var fadeMs = Math.max(0, opts.fadeMs || 0);
    var gapSec = Math.max(0, opts.gapSec || 0);

    if (!segments || segments.length === 0) {
        return { channels: [], sampleRate: targetRate, duration: 0 };
    }

    // 声道目标：全单声道则单声道，否则立体声
    var targetCh = 1;
    for (var s = 0; s < segments.length; s++) {
        if (segments[s].channels.length > 1) { targetCh = 2; break; }
    }

    var gapSamples = Math.round(gapSec * targetRate);
    var pieces = []; // 每段处理后的 [Float32Array]
    var totalLen = 0;

    for (var k = 0; k < segments.length; k++) {
        var seg = segments[k];
        var norm = normalizeChannels(
            seg.channels.map(function (ch) { return resampleLinear(ch, seg.sampleRate, targetRate); }),
            targetCh
        );
        var segLen = norm[0].length;
        var fSamples = Math.round(fadeMs / 1000 * targetRate);
        fSamples = Math.min(fSamples, Math.floor(segLen / 2)); // 淡化不超过段长一半
        var done = [];
        for (var c = 0; c < norm.length; c++) {
            done.push(applyFade(norm[c], fSamples, fSamples));
        }
        pieces.push(done);
        totalLen += segLen;
        if (k < segments.length - 1) totalLen += gapSamples;
    }

    var out = [];
    for (var c2 = 0; c2 < targetCh; c2++) out.push(new Float32Array(totalLen));
    var pos = 0;
    for (var p = 0; p < pieces.length; p++) {
        var pc = pieces[p];
        for (var c3 = 0; c3 < targetCh; c3++) {
            out[c3].set(pc[c3], pos);
        }
        pos += pc[0].length + (p < pieces.length - 1 ? gapSamples : 0);
    }

    return { channels: out, sampleRate: targetRate, duration: totalLen / targetRate };
}

// 导出体积预估：WAV = 44 字节头 + 采样数×声道数×2 字节
function estimateWavBytes(durationSec, sampleRate, numChannels) {
    return 44 + Math.ceil(durationSec * sampleRate) * numChannels * 2;
}

// MP3 粗略预估（比特率×时长，不含容器开销）
function estimateMp3Bytes(durationSec, bitrateKbps) {
    return Math.round(bitrateKbps * 1000 / 8 * durationSec);
}

// 列表排序：dir=-1 上移，dir=+1 下移；越界返回 null
function moveItem(list, idx, dir) {
    var j = idx + dir;
    if (idx < 0 || idx >= list.length || j < 0 || j >= list.length) return null;
    var copy = list.slice();
    var tmp = copy[idx];
    copy[idx] = copy[j];
    copy[j] = tmp;
    return copy;
}

// 并行 decodeAudioData 的完成顺序不可控：入队时记录添加序号 seq，
// 解码完成后按 seq 插回对应位置，保证"列表按添加顺序排列"；
// 用户手动上移/下移只改变数组顺序不改动 seq，新批次仍追加到末尾。
// 无 seq 的历史对象视为 seq=0。返回 segments（原地修改）。
function insertSegmentBySeq(segments, seg) {
    var seq = (seg && typeof seg.seq === 'number') ? seg.seq : 0;
    var pos = segments.length;
    for (var i = 0; i < segments.length; i++) {
        var s = (segments[i] && typeof segments[i].seq === 'number') ? segments[i].seq : 0;
        if (s > seq) { pos = i; break; }
    }
    segments.splice(pos, 0, seg);
    return segments;
}

// node 下导出纯函数以便单元测试
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        TARGET_RATE: TARGET_RATE, fmtTime: fmtTime, clamp: clamp, fmtSize: fmtSize,
        floatTo16BitPCM: floatTo16BitPCM, interleaveChannels: interleaveChannels,
        encodeWavDataView: encodeWavDataView, resampleLinear: resampleLinear,
        normalizeChannels: normalizeChannels, applyFade: applyFade,
        concatSegments: concatSegments, estimateWavBytes: estimateWavBytes,
        estimateMp3Bytes: estimateMp3Bytes, moveItem: moveItem,
        insertSegmentBySeq: insertSegmentBySeq
    };
    return;
}

/* ================= 浏览器侧：状态 ================= */

var MP3_CHUNK = 1152; // lamejs 每帧采样数

var state = {
    actx: null,
    segments: [],   // [{ name, size, sampleRate, channels, duration, data: [Float32Array] }]
    merged: null,   // { channels, sampleRate, duration }
    playing: false,
    playSrc: null,
    playRaf: 0,
    playT0: 0,
};

function $(id) { return document.getElementById(id); }

// 文件添加序号：并行解码完成顺序不可控，解码后按此序号插回列表正确位置
var fileSeq = 0;

var el = {};
['am-upload', 'am-file', 'am-status', 'am-list-panel', 'am-list', 'am-empty',
 'am-opt-panel', 'am-fade', 'am-gap', 'am-bitrate',
 'am-preview-panel', 'am-total', 'am-est', 'am-play', 'am-stop', 'am-play-pos',
 'am-export-panel', 'am-export-wav', 'am-export-mp3', 'am-export-status', 'am-clear'
].forEach(function (id) { el[id.replace(/-/g, '_').replace(/^am_/, '')] = $(id); });

function setStatus(msg) { el.status.textContent = msg || ''; }
function setExportStatus(msg) { el.export_status.textContent = msg || ''; }

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
}

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

function handleFiles(files) {
    if (!files || files.length === 0) return;
    var actx;
    try { actx = ensureCtx(); } catch (e) { setStatus('❌ ' + e.message); return; }
    var list = [];
    for (var i = 0; i < files.length; i++) {
        var f = files[i];
        if (ACCEPT_RE.test(f.name)) list.push(f);
        else setStatus('⚠️ 已跳过不支持的文件：' + f.name);
    }
    if (list.length === 0) { if (!el.status.textContent) setStatus('❌ 没有可用的音频文件（支持 MP3 / WAV / OGG / M4A）'); return; }
    setStatus('⏳ 正在本地解码 ' + list.length + ' 个音频…');
    var pending = list.length;
    list.forEach(function (f) {
        var seq = fileSeq++; // 入队序号：解码完成后按此插回列表（完成顺序≠添加顺序）
        var reader = new FileReader();
        reader.onerror = function () {
            pending--;
            setStatus('❌ 文件读取失败：' + f.name + '（剩余 ' + pending + ' 个）');
            if (pending === 0) refreshAll();
        };
        reader.onload = function () {
            actx.decodeAudioData(reader.result).then(function (buffer) {
                onDecoded(buffer, f, seq);
                pending--;
                if (pending === 0) refreshAll();
                else setStatus('⏳ 解码中…（剩余 ' + pending + ' 个）');
            }).catch(function (err) {
                pending--;
                setStatus('❌ 解码失败：' + f.name + '（' + (err && err.message ? err.message : '格式不支持或文件损坏') + '），已跳过');
                if (pending === 0) refreshAll();
            });
        };
        reader.readAsArrayBuffer(f);
    });
}

function onDecoded(buffer, file, seq) {
    var data = [];
    for (var c = 0; c < buffer.numberOfChannels; c++) data.push(buffer.getChannelData(c).slice());
    // 按添加序号插入，而非按解码完成顺序 push（小文件先解完会导致乱序）
    insertSegmentBySeq(state.segments, {
        name: file.name,
        size: file.size,
        sampleRate: buffer.sampleRate,
        channels: buffer.numberOfChannels,
        duration: buffer.duration,
        data: data,
        seq: seq
    });
}

function refreshAll() {
    stopPlayback();
    renderList();
    buildMerged();
}

function renderList() {
    var n = state.segments.length;
    el.list_panel.style.display = 'block';
    el.opt_panel.style.display = n ? 'block' : 'none';
    el.preview_panel.style.display = n ? 'block' : 'none';
    el.export_panel.style.display = n ? 'block' : 'none';
    if (!n) {
        el.list.style.display = 'none';
        el.empty.style.display = 'block';
        el.empty.textContent = '还没有音频：点击上方上传区添加，或把多个音频文件一起拖进来。';
        setStatus('');
        return;
    }
    el.list.style.display = 'block';
    el.empty.style.display = 'none';
    var html = '';
    state.segments.forEach(function (seg, i) {
        html += '<div class="am-item" data-idx="' + i + '">' +
            '<span class="am-idx">' + (i + 1) + '</span>' +
            '<span class="am-name" title="' + escapeHtml(seg.name) + '">' + escapeHtml(seg.name) + '</span>' +
            '<span class="am-meta">' + fmtTime(seg.duration * 1000) + ' · ' + seg.sampleRate + 'Hz · ' +
            seg.channels + '声道 · ' + fmtSize(seg.size) + '</span>' +
            '<span class="am-ops">' +
            '<button data-act="up" title="上移"' + (i === 0 ? ' disabled' : '') + '>▲</button>' +
            '<button data-act="down" title="下移"' + (i === n - 1 ? ' disabled' : '') + '>▼</button>' +
            '<button data-act="del" title="删除">✕</button>' +
            '</span></div>';
    });
    el.list.innerHTML = html;
}

function bindList() {
    el.list.addEventListener('click', function (ev) {
        var btn = ev.target.closest('button');
        if (!btn) return;
        var item = ev.target.closest('.am-item');
        if (!item) return;
        var idx = parseInt(item.getAttribute('data-idx'), 10);
        var act = btn.getAttribute('data-act');
        if (act === 'del') {
            state.segments.splice(idx, 1);
            setStatus('🗑 已删除第 ' + (idx + 1) + ' 段');
            refreshAll();
        } else {
            var dir = act === 'up' ? -1 : 1;
            var moved = moveItem(state.segments, idx, dir);
            if (moved) {
                state.segments = moved;
                refreshAll();
            }
        }
    });
}

/* ================= 合并构建 ================= */

function readOpts() {
    return {
        targetRate: TARGET_RATE,
        fadeMs: Math.max(0, parseFloat(el.fade.value) || 0),
        gapSec: Math.max(0, parseFloat(el.gap.value) || 0)
    };
}

function buildMerged() {
    if (state.segments.length === 0) {
        state.merged = null;
        el.total.textContent = '—';
        el.est.textContent = '—';
        return;
    }
    var opts = readOpts();
    setStatus('⏳ 正在按顺序拼接 ' + state.segments.length + ' 段音频…');
    setTimeout(function () {
        try {
            var t0 = performance.now();
            var segs = state.segments.map(function (s) {
                return { channels: s.data, sampleRate: s.sampleRate };
            });
            state.merged = concatSegments(segs, opts);
            var m = state.merged;
            var nch = m.channels.length;
            var bitrate = parseInt(el.bitrate.value, 10) || 128;
            el.total.innerHTML = '共 <b>' + state.segments.length + '</b> 段，合并时长 <b>' +
                fmtTime(m.duration * 1000) + '</b>（' + m.sampleRate + 'Hz / ' + nch + '声道）';
            el.est.innerHTML = '预计导出体积：WAV ≈ <b>' + fmtSize(estimateWavBytes(m.duration, m.sampleRate, nch)) +
                '</b>　·　MP3(' + bitrate + 'kbps) ≈ <b>' + fmtSize(estimateMp3Bytes(m.duration, bitrate)) + '</b>';
            setStatus('✅ 拼接完成（' + Math.round(performance.now() - t0) + 'ms）。可试听或导出。');
            el.play.disabled = false;
        } catch (e) {
            state.merged = null;
            setStatus('❌ 拼接失败：' + e.message);
        }
    }, 30);
}

function mergedAudioBuffer() {
    var m = state.merged;
    var nch = m.channels.length;
    var buf;
    try {
        buf = new AudioBuffer({ numberOfChannels: nch, length: m.channels[0].length, sampleRate: m.sampleRate });
    } catch (e) {
        var octx = new OfflineAudioContext(nch, m.channels[0].length, m.sampleRate);
        buf = octx.createBuffer(nch, m.channels[0].length, m.sampleRate);
    }
    for (var c = 0; c < nch; c++) buf.getChannelData(c).set(m.channels[c]);
    return buf;
}

/* ================= 试听 ================= */

function playMerged() {
    if (!state.merged || state.merged.duration < 0.02) {
        setStatus('⚠️ 合并结果太短或尚未生成，请先添加音频');
        return;
    }
    stopPlayback();
    var actx;
    try { actx = ensureCtx(); } catch (e) { setStatus('❌ ' + e.message); return; }
    var buf = mergedAudioBuffer();
    var src = actx.createBufferSource();
    src.buffer = buf;
    src.connect(actx.destination);
    src.onended = function () { if (state.playSrc === src) stopPlaybackUI(); };
    src.start(0);
    state.playSrc = src;
    state.playing = true;
    state.playT0 = actx.currentTime;
    el.play.disabled = true;
    el.stop.disabled = false;
    setStatus('▶ 合并试听中…（' + fmtTime(state.merged.duration * 1000) + '）');
    (function tick() {
        if (!state.playing) return;
        var pos = actx.currentTime - state.playT0;
        if (pos >= buf.duration) { stopPlayback(); return; }
        el.play_pos.textContent = fmtTime(pos * 1000) + ' / ' + fmtTime(buf.duration * 1000);
        state.playRaf = requestAnimationFrame(tick);
    })();
}

function stopPlaybackUI() {
    state.playing = false;
    cancelAnimationFrame(state.playRaf);
    state.playSrc = null;
    el.play.disabled = !(state.merged && state.merged.duration >= 0.02);
    el.stop.disabled = true;
    el.play_pos.textContent = '0:00.000';
    setStatus('⏹ 已停止');
}

function stopPlayback() {
    if (state.playSrc) {
        try { state.playSrc.onended = null; state.playSrc.stop(); } catch (e) { /* 已结束 */ }
    }
    if (state.playing) stopPlaybackUI();
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

function baseFileName() {
    if (state.segments.length === 0) return 'merged';
    return (state.segments[0].name.replace(/\.[^.]+$/, '') || 'merged') + '_merged';
}

function exportWav() {
    if (!state.merged) return;
    setExportStatus('⏳ 正在编码 WAV…');
    setTimeout(function () {
        try {
            var m = state.merged;
            var pcms = [];
            for (var c = 0; c < m.channels.length; c++) pcms.push(floatTo16BitPCM(m.channels[c]));
            var interleaved = interleaveChannels(pcms, m.channels[0].length);
            var nch = Math.min(2, m.channels.length);
            var dv = encodeWavDataView(m.sampleRate, nch, interleaved);
            var blob = new Blob([dv], { type: 'audio/wav' });
            var fn = baseFileName() + '.wav';
            downloadBlob(blob, fn);
            setExportStatus('✅ WAV 已导出：' + fn + '（' + fmtTime(m.duration * 1000) + '，' + fmtSize(blob.size) + '）');
        } catch (e) {
            setExportStatus('❌ WAV 导出失败：' + e.message);
        }
    }, 30);
}

// 分块让出主线程，避免长音频编码时页面假死
function yieldUI() { return new Promise(function (r) { setTimeout(r, 0); }); }

async function exportMp3() {
    if (!state.merged) return;
    if (typeof lamejs === 'undefined') {
        setExportStatus('❌ MP3 编码器（lamejs）未加载，请刷新页面重试');
        return;
    }
    var bitrate = parseInt(el.bitrate.value, 10) || 128;
    el.export_mp3.disabled = true;
    el.export_wav.disabled = true;
    setExportStatus('⏳ 正在编码 MP3（' + bitrate + 'kbps）… 0%');
    try {
        var m = state.merged;
        var nch = Math.min(2, m.channels.length);
        var chData = [];
        for (var c = 0; c < nch; c++) chData.push(floatTo16BitPCM(m.channels[c]));
        var len = chData[0].length;
        var enc = new lamejs.Mp3Encoder(nch, TARGET_RATE, bitrate);
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
        var fn = baseFileName() + '.mp3';
        downloadBlob(blob, fn);
        setExportStatus('✅ MP3 已导出：' + fn + '（' + fmtTime(m.duration * 1000) + '，' + bitrate + 'kbps，' + fmtSize(blob.size) + '）');
    } catch (e) {
        setExportStatus('❌ MP3 导出失败：' + e.message);
    }
    el.export_mp3.disabled = false;
    el.export_wav.disabled = false;
}

/* ================= 重置 ================= */

function resetAll() {
    stopPlayback();
    state.segments = [];
    state.merged = null;
    el.file.value = '';
    el.list.innerHTML = '';
    el.list.style.display = 'none';
    el.empty.style.display = 'block';
    el.empty.textContent = '还没有音频：点击上方上传区添加，或把多个音频文件一起拖进来。';
    el.opt_panel.style.display = 'none';
    el.preview_panel.style.display = 'none';
    el.export_panel.style.display = 'none';
    el.total.textContent = '—';
    el.est.textContent = '—';
    el.play_pos.textContent = '0:00.000';
    setStatus('');
    setExportStatus('');
}

/* ================= 初始化 ================= */

function init() {
    el.upload.addEventListener('click', function () { el.file.click(); });
    el.upload.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); el.file.click(); }
    });
    el.file.addEventListener('change', function () {
        handleFiles(el.file.files);
        el.file.value = ''; // 允许重复选择同一文件
    });
    ['dragenter', 'dragover'].forEach(function (t) {
        el.upload.addEventListener(t, function (ev) { ev.preventDefault(); el.upload.classList.add('dragover'); });
    });
    ['dragleave', 'drop'].forEach(function (t) {
        el.upload.addEventListener(t, function (ev) { ev.preventDefault(); el.upload.classList.remove('dragover'); });
    });
    el.upload.addEventListener('drop', function (ev) {
        var fs = ev.dataTransfer && ev.dataTransfer.files;
        handleFiles(fs);
    });

    bindList();

    el.fade.addEventListener('change', buildMerged);
    el.gap.addEventListener('change', buildMerged);
    el.bitrate.addEventListener('change', buildMerged);

    el.play.addEventListener('click', playMerged);
    el.stop.addEventListener('click', stopPlayback);
    el.export_wav.addEventListener('click', exportWav);
    el.export_mp3.addEventListener('click', exportMp3);
    el.clear.addEventListener('click', resetAll);

    el.play.disabled = true;
    el.stop.disabled = true;

    if (typeof lamejs === 'undefined') {
        setStatus('⚠️ MP3 编码器未能加载（vendor 文件缺失），WAV 导出不受影响');
    }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

})();
