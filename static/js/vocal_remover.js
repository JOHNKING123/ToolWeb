/* 人声消除 / 伴奏提取（vocal_remover）- 纯前端中心声道消除引擎
 *
 * 流程：上传音频（FileReader → ArrayBuffer，全本地，不上传）→ AudioContext.decodeAudioData 本地解码
 * → 须立体声（单声道明确报错）→ 中心声道消除法：mid=(L+R)/2，伴奏 out = L/R − s·mid（s=强度 0..1）；
 *   保低频开启时先对 mid 做一阶低通（200Hz），只消除 mid 的高通部分，低频居中成分保留
 * → 干声模式直接取 mid（中央声道）→ 双波形 canvas 对比（原音频 / 结果）→ A/B 对比试听
 * → WAV 手工编码（16-bit PCM）本地下载；MP3 经本地 vendor lamejs 编码（重采样 44100Hz，
 *   比特率 128/192/320kbps 可选），文件名自动后缀。
 *
 * 真限制（页面明示）：① 卡拉OK级消除，非 AI 音轨分离，效果远不及 AI 模型；
 * ② 仅立体声＋居中人声有效（单声道无法处理，偏置/混响人声消不干净）；
 * ③ 混响/和声/居中乐器残留（保低频开启时低频居中成分刻意保留）；
 * ④ 全程本地零上传。音频只在浏览器本地处理：无后端调用、无第三方依赖、无 CDN
 * （lamejs 为仓库内 vendor 文件）。刷新页面后音频不恢复（不写 localStorage/sessionStorage）。
 * 纯函数（fmtTime / clamp / fmtSize / validateAudioFile / requireStereo / clampStrength /
 *   preserveBass / centerEliminate / extractCenter / waveformPeaks / floatTo16BitPCM /
 *   interleaveChannels / encodeWavPcm16 / resampleLinear / estimateWavBytes /
 *   estimateMp3Bytes / makeExportName）在 node 下可单元测试；非法参数抛 Error 且 err.field 给字段名。
 */
(function () {
'use strict';

/* ================= 常量 ================= */

var MAX_FILE_SIZE = 200 * 1024 * 1024;   // 200MB
var ALLOWED_EXTS = ['.flac', '.wav', '.mp3', '.ogg', '.m4a'];
var BASS_CUTOFF_HZ = 200;                // 保低频一阶低通截止频率
var MP3_RATE = 44100;                    // lamejs 统一编码采样率
var MP3_CHUNK = 1152;                    // lamejs 每帧采样数

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

// 字节数 → 人类可读
function fmtSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(2) + ' MB';
    return (bytes / 1073741824).toFixed(2) + ' GB';
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

/* ---------- 声道校验 ---------- */

// 须立体声：numberOfChannels !== 2 时抛错，err.field='channels'（单声道明确报错）
function requireStereo(buf) {
    if (!buf || typeof buf !== 'object') throw err('channels', '音频数据无效');
    if (buf.numberOfChannels !== 2) throw err('channels', '仅支持立体声音频（当前 ' + buf.numberOfChannels + ' 声道）');
    return 2;
}

/* ---------- 强度参数 ---------- */

// 强度百分比 0..100 → 0..1 钳制（NaN → 0）
function clampStrength(v) {
    v = Number(v);
    if (isNaN(v)) return 0;
    return clamp(v, 0, 100) / 100;
}

/* ---------- 保低频：一阶低通 ---------- */

// 一阶低通 y[n] = y[n-1] + a·(x[n] − y[n-1])，a = 1 − exp(−2π·fc/fs)
// 直流全保留（常数输入收敛到常数）；高频大幅衰减（10kHz@200Hz 截止增益约 0.02）
// 返回与输入等长的 Float32Array；非法参数抛 Error（err.field：samples/sampleRate/cutoffHz）
function preserveBass(samples, sampleRate, cutoffHz) {
    if (!samples || typeof samples.length !== 'number' || samples.length < 1) throw err('samples', '采样数据为空');
    for (var k = 0; k < samples.length; k++) {
        if (typeof samples[k] !== 'number' || isNaN(samples[k])) throw err('samples', '采样数据含非法值');
    }
    if (typeof sampleRate !== 'number' || isNaN(sampleRate) || sampleRate <= 0) throw err('sampleRate', '采样率无效');
    if (cutoffHz === undefined || cutoffHz === null) cutoffHz = BASS_CUTOFF_HZ;
    if (typeof cutoffHz !== 'number' || isNaN(cutoffHz) || cutoffHz <= 0 || cutoffHz >= sampleRate / 2) throw err('cutoffHz', '截止频率无效');
    var a = 1 - Math.exp(-2 * Math.PI * cutoffHz / sampleRate);
    var out = new Float32Array(samples.length);
    var y = 0, i;
    for (i = 0; i < samples.length; i++) {
        y += a * (samples[i] - y);
        out[i] = y;
    }
    return out;
}

/* ---------- 声道数据校验（内部） ---------- */

function checkChannel(ch, field) {
    if (!ch || typeof ch.length !== 'number' || ch.length < 1) throw err(field, '声道数据为空');
    for (var i = 0; i < ch.length; i++) {
        if (typeof ch[i] !== 'number' || isNaN(ch[i])) throw err(field, '声道数据含非法值');
    }
    return ch.length;
}

/* ---------- 中央声道提取 ---------- */

// 干声 = 中央声道 mid = (L+R)/2（逐采样平均）
// 全居中信号原样返回；全反相信号返回全零
// 返回 Float32Array；非法参数抛 Error（err.field：left/right/length）
function extractCenter(left, right) {
    var nL = checkChannel(left, 'left');
    var nR = checkChannel(right, 'right');
    if (nL !== nR) throw err('length', '左右声道长度不一致');
    var out = new Float32Array(nL);
    for (var i = 0; i < nL; i++) out[i] = (left[i] + right[i]) / 2;
    return out;
}

/* ---------- 中心声道消除（伴奏） ---------- */

// 伴奏 out = L/R − s·mid，其中 mid=(L+R)/2，s 为强度 0..1
// 精确锚点：全居中 s=1 全消尽（out=0）；全反相 s=1 保留（mid=0，out=原信号）；
// s=0 直通（out=原信号）；s=0.5 半残留（居中信号剩一半）。
// options: {preserveBass: bool, sampleRate, bassCutoffHz} —— 保低频开启时先对 mid 做
// 一阶低通，只消除 mid 的高通部分，低频居中成分保留在输出里。
// 返回 {left, right}（Float32Array，钳制到 [-1,1]）；非法参数抛 Error
// （err.field：left/right/length/strength/sampleRate/cutoffHz）
function centerEliminate(left, right, strength, options) {
    var nL = checkChannel(left, 'left');
    var nR = checkChannel(right, 'right');
    if (nL !== nR) throw err('length', '左右声道长度不一致');
    if (typeof strength !== 'number' || isNaN(strength) || strength < 0 || strength > 1) throw err('strength', '强度须为 0..1');
    var opts = options || {};
    var keepBass = !!opts.preserveBass;
    var sampleRate = opts.sampleRate;
    var cutoffHz = (opts.bassCutoffHz === undefined || opts.bassCutoffHz === null) ? BASS_CUTOFF_HZ : opts.bassCutoffHz;
    if (keepBass) {
        if (typeof sampleRate !== 'number' || isNaN(sampleRate) || sampleRate <= 0) throw err('sampleRate', '保低频需要有效采样率');
        if (typeof cutoffHz !== 'number' || isNaN(cutoffHz) || cutoffHz <= 0 || cutoffHz >= sampleRate / 2) throw err('cutoffHz', '截止频率无效');
    }
    var mid = new Float32Array(nL);
    var i;
    for (i = 0; i < nL; i++) mid[i] = (left[i] + right[i]) / 2;
    var eff = mid;
    if (keepBass) {
        var lp = preserveBass(mid, sampleRate, cutoffHz);
        eff = new Float32Array(nL);
        for (i = 0; i < nL; i++) eff[i] = mid[i] - lp[i];
    }
    var outL = new Float32Array(nL), outR = new Float32Array(nL);
    for (i = 0; i < nL; i++) {
        outL[i] = clamp(left[i] - strength * eff[i], -1, 1);
        outR[i] = clamp(right[i] - strength * eff[i], -1, 1);
    }
    return { left: outL, right: outR };
}

/* ---------- 波形峰值 ---------- */

// 每桶取最大绝对值（用于 canvas 波形对比）；返回 Float32Array(buckets)，值域 0..1
function waveformPeaks(samples, buckets) {
    if (!samples || typeof samples.length !== 'number' || samples.length < 1) throw err('samples', '采样数据为空');
    if (typeof buckets !== 'number' || isNaN(buckets) || buckets < 1 || Math.floor(buckets) !== buckets) throw err('buckets', '桶数须为正整数');
    var out = new Float32Array(buckets);
    var per = samples.length / buckets, b, i;
    for (b = 0; b < buckets; b++) {
        var start = Math.floor(b * per), end = Math.max(start + 1, Math.floor((b + 1) * per));
        var peak = 0;
        for (i = start; i < end && i < samples.length; i++) {
            var v = Math.abs(samples[i]);
            if (v > peak) peak = v;
        }
        out[b] = peak;
    }
    return out;
}

/* ---------- PCM / WAV 编码 ---------- */

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

// 44 字节标准 WAV 头 + int16 交错数据 → DataView
// RIFF 头字段精确值：chunkSize=36+dataLen；fmt=16/PCM=1；byteRate=sr·ch·2；blockAlign=ch·2；bits=16
function encodeWavPcm16(sampleRate, numChannels, interleaved) {
    if (typeof sampleRate !== 'number' || isNaN(sampleRate) || sampleRate <= 0 || Math.floor(sampleRate) !== sampleRate) throw err('sampleRate', '采样率须为正整数');
    if (numChannels !== 1 && numChannels !== 2) throw err('numChannels', '声道数须为 1 或 2');
    if (!interleaved || interleaved.constructor !== Int16Array || interleaved.length < 1) throw err('interleaved', '交错 PCM 数据无效');
    if (interleaved.length % numChannels !== 0) throw err('interleaved', '交错 PCM 长度须为声道数的整数倍');
    var dataLen = interleaved.length * 2;
    var bytes = 44 + dataLen;
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
    dv.setUint32(40, dataLen, true);
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

/* ---------- 体积 / 文件名预估 ---------- */

function estimateWavBytes(frames, nCh) { return 44 + frames * nCh * 2; }

function estimateMp3Bytes(durationSec, kbps) {
    return Math.max(0, Math.round(kbps * 1000 / 8 * durationSec));
}

// 导出文件名：原名_vocal-{模式}_{强度}%.扩展名；例：夜曲 → 夜曲_vocal-karaoke_100.wav
function makeExportName(base, mode, strengthPct, ext) {
    base = String(base || 'audio').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) || 'audio';
    var m = (mode === 'vocal') ? 'vocal' : 'karaoke';
    var sp = Math.round(clamp(Number(strengthPct) || 0, 0, 100));
    return base + '_vocal-' + m + '_' + sp + '.' + String(ext || 'wav').replace(/^\./, '');
}

// node 下导出纯函数以便单元测试
var api = { fmtTime: fmtTime, clamp: clamp, fmtSize: fmtSize,
    MAX_FILE_SIZE: MAX_FILE_SIZE, ALLOWED_EXTS: ALLOWED_EXTS, BASS_CUTOFF_HZ: BASS_CUTOFF_HZ,
    validateAudioFile: validateAudioFile, requireStereo: requireStereo,
    clampStrength: clampStrength, preserveBass: preserveBass,
    centerEliminate: centerEliminate, extractCenter: extractCenter,
    waveformPeaks: waveformPeaks, floatTo16BitPCM: floatTo16BitPCM,
    interleaveChannels: interleaveChannels, encodeWavPcm16: encodeWavPcm16,
    resampleLinear: resampleLinear, estimateWavBytes: estimateWavBytes,
    estimateMp3Bytes: estimateMp3Bytes, makeExportName: makeExportName };
if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    return;
}
if (typeof window !== 'undefined') window.VocalRemover = api;

/* ================= 浏览器侧：状态 ================= */

var state = {
    actx: null,          // AudioContext（解码 + A/B 试听）
    buffer: null,        // AudioBuffer（解码后原音频，须立体声）
    fileBase: '',        // 源文件名（不含扩展名）
    mode: 'karaoke',     // karaoke=伴奏 / vocal=干声
    strength: 1,         // 消除强度 0..1
    keepBass: true,      // 保低频开关
    result: null,        // AudioBuffer（处理后结果）
    resultParams: null,  // 处理时的参数快照 {mode, strength, keepBass}
    processing: false,   // 处理进行中
    playing: null        // 当前试听节点 {src, stop}
};

var el = {};
['upload','file','srcinfo','status',
 'mode-karaoke','mode-vocal','strength','strength-val','keep-bass',
 'process','process-status',
 'wave-orig','wave-result','wave-note',
 'play-orig','play-result','stop-play','play-status',
 'export-wav','export-mp3','bitrate','export-status','export-filename','reupload',
 'panel-params','panel-process','panel-wave','panel-preview','panel-export'
].forEach(function (id) { el[id.replace(/-/g, '_')] = document.getElementById('vr-' + id); });

function setStatus(t) { el.status.textContent = t || ''; }
function setProcessStatus(t) { el.process_status.textContent = t || ''; }
function setPlayStatus(t) { el.play_status.textContent = t || ''; }
function setExportStatus(t) { el.export_status.textContent = t || ''; }

/* ================= 上传与解码 ================= */

function ensureActx() {
    if (!state.actx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        state.actx = new AC();
    }
    if (state.actx.state === 'suspended') state.actx.resume();
    return state.actx;
}

function handleFile(f) {
    if (!f) return;
    try {
        validateAudioFile(f);
    } catch (e) {
        setStatus('❌ ' + e.message + '（支持 FLAC/WAV/MP3/OGG/M4A，≤200MB）');
        return;
    }
    setStatus('⏳ 正在读取并解码音频…');
    var rd = new FileReader();
    rd.onload = function () {
        var actx = ensureActx();
        actx.decodeAudioData(rd.result).then(function (buf) {
            try {
                requireStereo(buf);
            } catch (e) {
                setStatus('❌ 单声道音频无法处理：本工具只支持立体声文件（当前 ' + buf.numberOfChannels + ' 声道），请换一首立体声歌曲');
                return;
            }
            state.buffer = buf;
            state.result = null;
            state.resultParams = null;
            var dot = f.name.lastIndexOf('.');
            state.fileBase = dot > 0 ? f.name.slice(0, dot) : f.name;
            el.srcinfo.style.display = 'block';
            el.srcinfo.textContent = '📄 ' + f.name + ' ｜ ' + fmtTime(buf.duration * 1000) +
                ' ｜ ' + buf.sampleRate + 'Hz ｜ ' + buf.numberOfChannels + ' 声道（立体声 ✓）';
            el.panel_params.style.display = 'block';
            el.panel_process.style.display = 'block';
            setStatus('✅ 解码成功，调好强度后点「生成伴奏 / 干声」');
            updateEstimate();
            stopPlayback();
        }).catch(function () {
            setStatus('❌ 解码失败：该格式可能不受当前浏览器支持（试试 MP3 / WAV）');
        });
    };
    rd.onerror = function () { setStatus('❌ 文件读取失败'); };
    rd.readAsArrayBuffer(f);
}

function resetAll() {
    stopPlayback();
    state.buffer = null; state.result = null; state.resultParams = null;
    state.fileBase = '';
    el.file.value = '';
    el.srcinfo.style.display = 'none';
    el.panel_params.style.display = 'none';
    el.panel_process.style.display = 'none';
    el.panel_wave.style.display = 'none';
    el.panel_preview.style.display = 'none';
    el.panel_export.style.display = 'none';
    setStatus(''); setProcessStatus(''); setPlayStatus(''); setExportStatus('');
    clearWave(el.wave_orig); clearWave(el.wave_result);
}

/* ================= 参数面板 ================= */

function bindParams() {
    el.mode_karaoke.addEventListener('change', function () {
        if (el.mode_karaoke.checked) { state.mode = 'karaoke'; updateEstimate(); }
    });
    el.mode_vocal.addEventListener('change', function () {
        if (el.mode_vocal.checked) { state.mode = 'vocal'; updateEstimate(); }
    });
    el.strength.addEventListener('input', function () {
        state.strength = clampStrength(parseFloat(el.strength.value));
        el.strength_val.textContent = el.strength.value + '%';
        updateEstimate();
    });
    el.keep_bass.addEventListener('change', function () {
        state.keepBass = el.keep_bass.checked;
        updateEstimate();
    });
}

// 体积/时长预估与导出文件名预览
function updateEstimate() {
    if (!state.buffer) return;
    var dur = state.buffer.duration;
    var nCh = 2;
    var frames = state.buffer.length;
    var wavBytes = estimateWavBytes(frames, nCh);
    var modeName = state.mode === 'vocal' ? '干声（中央声道）' : '伴奏（中心声道消除）';
    var sp = Math.round(state.strength * 100);
    el.export_filename.textContent = '导出文件名：' + makeExportName(state.fileBase, state.mode, sp, 'wav') +
        ' / ' + makeExportName(state.fileBase, state.mode, sp, 'mp3');
    setProcessStatus('当前：' + modeName + ' ｜ 强度 ' + sp + '% ｜ 保低频 ' +
        (state.keepBass ? '开（200Hz 以下居中成分保留）' : '关') +
        ' ｜ 时长 ' + fmtTime(dur * 1000) + ' ｜ WAV 约 ' + fmtSize(wavBytes) +
        ' ｜ MP3(128k) 约 ' + fmtSize(estimateMp3Bytes(dur, 128)));
}

/* ================= 双波形 canvas ================= */

function clearWave(cv) {
    if (!cv) return;
    var ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);
}

function drawWave(cv, peaks, color) {
    if (!cv) return;
    var ctx = cv.getContext('2d');
    var W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#f9fafb';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#e5e7eb';
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
    ctx.fillStyle = color;
    var bw = W / peaks.length;
    for (var i = 0; i < peaks.length; i++) {
        var h = Math.max(1, peaks[i] * (H - 8));
        ctx.fillRect(i * bw, (H - h) / 2, Math.max(1, bw - 0.5), h);
    }
}

function drawWaves() {
    if (!state.buffer || !state.result) return;
    var buckets = 400;
    var origMono = new Float32Array(state.buffer.length);
    var L0 = state.buffer.getChannelData(0), R0 = state.buffer.getChannelData(1);
    for (var i = 0; i < origMono.length; i++) origMono[i] = (L0[i] + R0[i]) / 2;
    drawWave(el.wave_orig, waveformPeaks(origMono, buckets), '#6b7280');
    var resMono = new Float32Array(state.result.length);
    var L1 = state.result.getChannelData(0), R1 = state.result.getChannelData(1);
    for (var j = 0; j < resMono.length; j++) resMono[j] = (L1[j] + R1[j]) / 2;
    drawWave(el.wave_result, waveformPeaks(resMono, buckets), '#2563eb');
    el.wave_note.textContent = '上：原音频波形（灰）｜ 下：' +
        (state.mode === 'vocal' ? '干声' : '伴奏') + '波形（蓝）——居中人声被消除后波形峰值应明显变矮';
}

/* ================= 处理（中心声道消除 / 提取） ================= */

function processAudio() {
    if (!state.buffer) { setProcessStatus('❌ 请先上传音频'); return; }
    if (state.processing) return;
    state.processing = true;
    el.process.disabled = true;
    setProcessStatus('⏳ 正在处理音频…');
    // setTimeout 让出主线程，先刷出状态文案再做逐采样循环
    setTimeout(function () {
        try {
            var buf = state.buffer;
            var L = buf.getChannelData(0), R = buf.getChannelData(1);
            var mode = state.mode, s = state.strength;
            var outL, outR;
            if (mode === 'vocal') {
                var mid = extractCenter(L, R);
                outL = mid; outR = mid;
            } else {
                var res = centerEliminate(L, R, s, {
                    preserveBass: state.keepBass,
                    sampleRate: buf.sampleRate,
                    bassCutoffHz: BASS_CUTOFF_HZ
                });
                outL = res.left; outR = res.right;
            }
            var actx = ensureActx();
            var outBuf = actx.createBuffer(2, buf.length, buf.sampleRate);
            outBuf.getChannelData(0).set(outL);
            outBuf.getChannelData(1).set(outR);
            state.result = outBuf;
            state.resultParams = { mode: mode, strength: s, keepBass: state.keepBass };
            setProcessStatus('✅ 处理完成：' + fmtTime(outBuf.duration * 1000) +
                '，可对比波形、A/B 试听后导出');
            el.panel_wave.style.display = 'block';
            el.panel_preview.style.display = 'block';
            el.panel_export.style.display = 'block';
            drawWaves();
            updateEstimate();
        } catch (e) {
            setProcessStatus('❌ 处理失败：' + e.message);
        }
        state.processing = false;
        el.process.disabled = false;
    }, 30);
}

/* ================= A/B 试听 ================= */

function stopPlayback() {
    if (state.playing) {
        try { state.playing.src.stop(); } catch (e) {}
        try { state.playing.src.disconnect(); } catch (e) {}
        state.playing = null;
    }
    el.stop_play.disabled = true;
    el.play_orig.disabled = !state.buffer;
    el.play_result.disabled = !state.result;
}

function playBuffer(buf, label) {
    if (!buf) return;
    stopPlayback();
    var actx = ensureActx();
    var src = actx.createBufferSource();
    src.buffer = buf;
    src.connect(actx.destination);
    src.onended = function () {
        if (state.playing && state.playing.src === src) {
            state.playing = null;
            el.stop_play.disabled = true;
            setPlayStatus(label + ' 播放结束');
        }
    };
    src.start(0);
    state.playing = { src: src };
    el.stop_play.disabled = false;
    setPlayStatus('▶ 正在播放：' + label + '（' + fmtTime(buf.duration * 1000) + '）');
}

/* ================= 导出 ================= */

function downloadBlob(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}

function exportWav() {
    if (!state.result) { setExportStatus('❌ 请先生成伴奏 / 干声'); return; }
    setExportStatus('⏳ 正在编码 WAV…');
    var buf = state.result;
    var nCh = buf.numberOfChannels;
    var pcms = [];
    for (var c = 0; c < nCh; c++) pcms.push(floatTo16BitPCM(buf.getChannelData(c)));
    var interleaved = interleaveChannels(pcms, buf.length);
    var dv = encodeWavPcm16(buf.sampleRate, nCh, interleaved);
    var p = state.resultParams;
    var name = makeExportName(state.fileBase, p.mode, Math.round(p.strength * 100), 'wav');
    downloadBlob(new Blob([dv], { type: 'audio/wav' }), name);
    setExportStatus('✅ WAV 已导出：' + name + '（' + fmtSize(dv.byteLength) + '）');
}

function exportMp3() {
    if (!state.result) { setExportStatus('❌ 请先生成伴奏 / 干声'); return; }
    if (typeof lamejs === 'undefined') {
        setExportStatus('❌ MP3 编码器（lamejs）未加载，请刷新页面重试');
        return;
    }
    var bitrate = parseInt(el.bitrate.value, 10) || 128;
    setExportStatus('⏳ 正在编码 MP3（' + bitrate + 'kbps）…');
    var buf = state.result;
    var srcRate = buf.sampleRate;
    var nCh = Math.min(2, buf.numberOfChannels);
    var chs = [];
    for (var c = 0; c < nCh; c++) {
        var pcm = floatTo16BitPCM(buf.getChannelData(c));
        var f32 = new Float32Array(pcm.length);
        for (var i = 0; i < pcm.length; i++) f32[i] = pcm[i] / 32768;
        chs.push(resampleLinear(f32, srcRate, MP3_RATE));
    }
    var len = chs[0].length;
    var enc = new lamejs.Mp3Encoder(nCh, MP3_RATE, bitrate);
    var out = [];
    function i16(f32arr) {
        var o = new Int16Array(f32arr.length);
        for (var i = 0; i < f32arr.length; i++) {
            var v = f32arr[i] < -1 ? -1 : (f32arr[i] > 1 ? 1 : f32arr[i]);
            o[i] = v < 0 ? Math.round(v * 32768) : Math.round(v * 32767);
        }
        return o;
    }
    var l = i16(chs[0]);
    var r = nCh === 2 ? i16(chs[1]) : null;
    for (var off = 0; off < len; off += MP3_CHUNK) {
        var lc = l.subarray(off, off + MP3_CHUNK);
        var data = nCh === 2
            ? enc.encodeBuffer(lc, r.subarray(off, off + MP3_CHUNK))
            : enc.encodeBuffer(lc);
        if (data.length > 0) out.push(new Int8Array(data));
    }
    var end = enc.flush();
    if (end.length > 0) out.push(new Int8Array(end));
    var blob = new Blob(out, { type: 'audio/mpeg' });
    var p = state.resultParams;
    var name = makeExportName(state.fileBase, p.mode, Math.round(p.strength * 100), 'mp3');
    downloadBlob(blob, name);
    setExportStatus('✅ MP3 已导出：' + name + '（' + bitrate + 'kbps，' + fmtSize(blob.size) + '）');
}

/* ================= 初始化 ================= */

function init() {
    bindParams();
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

    el.process.addEventListener('click', processAudio);
    el.play_orig.addEventListener('click', function () { playBuffer(state.buffer, '原音频'); });
    el.play_result.addEventListener('click', function () {
        playBuffer(state.result, state.mode === 'vocal' ? '干声（中央声道）' : '伴奏');
    });
    el.stop_play.addEventListener('click', function () { stopPlayback(); setPlayStatus('⏹ 已停止'); });
    el.export_wav.addEventListener('click', exportWav);
    el.export_mp3.addEventListener('click', exportMp3);
    el.reupload.addEventListener('click', resetAll);

    if (typeof lamejs === 'undefined') {
        setExportStatus('⚠️ MP3 编码器未能加载（vendor 文件缺失），WAV 导出不受影响');
    }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

})();
