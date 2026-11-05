/* 无损音频真伪检测 - 纯前端频谱截止分析
 *
 * 流程：单文件上传/拖拽（.flac/.wav/.mp3/.ogg/.m4a ≤200MB）→ FileReader 读入 ArrayBuffer
 * → AudioContext.decodeAudioData 本地解码（沿用 audio_trimmer.js 既有模式）→ 声道混合为单声道
 * → 全文件均匀取 ≤8 段、每段 4096 点加 Hann 窗 FFT（基 2 迭代 FFT）→ 1kHz 分频带能量
 *   （各段取最大值，energyDb 相对峰值）→ 频谱图（段×频带热力）+ 频谱曲线 + 截止频率竖线
 * → 结论卡三档（疑似真无损 / 疑似转码 / 无法判定，措辞一律“疑似”）。
 *
 * 判定分档（44.1kHz 基准，阈值 -50dB）：截止 ≥20000Hz → 疑似真无损；
 * 16000–19999Hz → 疑似转码（高码率 MP3 特征）；<16000Hz → 疑似转码（低码率特征）；
 * 采样率 <44100Hz 或静音（峰值 <-60dBFS）或无高于阈值的能量 → 无法判定。
 *
 * 音频只在浏览器本地处理：无后端调用、无第三方依赖、无 CDN。
 * 纯函数（fftMagnitudes / applyHannWindow / bandEnergies / findCutoff / classifyCutoff /
 * validateAudioFile / analyzeBands）在 node 下可单元测试；非法参数抛 Error 且 err.field 给字段名，不静默钳制。
 */
(function () {
'use strict';

/* ================= 常量 ================= */

var FFT_SIZE = 4096;          // 每段 FFT 点数（2 的幂）
var FFT_MIN = 256;            // fftMagnitudes 接受的最小点数
var MAX_SEGMENTS = 8;         // 全文件均匀取段上限
var BAND_WIDTH = 1000;        // 分频带宽度（Hz）
var THRESHOLD_DB = -50;       // 截止判定阈值（相对峰值 dB）
var MAX_FILE_SIZE = 200 * 1024 * 1024;  // 200MB
var ALLOWED_EXTS = ['.flac', '.wav', '.mp3', '.ogg', '.m4a'];
var MIN_SAMPLE_RATE = 44100;  // 判定基准采样率
var SILENCE_DBFS = -60;       // 静音判定峰值（dBFS）

function fail(field, message) {
    var e = new Error(message);
    e.field = field;
    return e;
}

/* ================= 纯函数 ================= */

// 基 2 迭代 FFT 幅度谱：samples 长度须为 2 的幂且 ≥256；返回长度 N/2 的幅度谱（0Hz~奈奎斯特）
function fftMagnitudes(samples) {
    if (!samples || typeof samples.length !== 'number') throw fail('samples', 'samples 须为数组');
    var n = samples.length;
    if (n < FFT_MIN || (n & (n - 1)) !== 0) throw fail('samples', 'samples 长度须为 2 的幂且 ≥' + FFT_MIN);
    var re = new Float64Array(n), im = new Float64Array(n), i, v;
    for (i = 0; i < n; i++) {
        v = samples[i];
        if (typeof v !== 'number' || !isFinite(v)) throw fail('samples', 'samples 须为有限数值');
        re[i] = v;
    }
    // 位反转置换
    var j = 0, bit, t;
    for (i = 1; i < n; i++) {
        bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) {
            t = re[i]; re[i] = re[j]; re[j] = t;
            t = im[i]; im[i] = im[j]; im[j] = t;
        }
    }
    // 蝶形迭代
    var len, half, ang, wr, wi, k, cwr, cwi, ur, ui, vr, vi, nwr;
    for (len = 2; len <= n; len <<= 1) {
        ang = -2 * Math.PI / len;
        wr = Math.cos(ang); wi = Math.sin(ang);
        half = len >> 1;
        for (i = 0; i < n; i += len) {
            cwr = 1; cwi = 0;
            for (k = 0; k < half; k++) {
                ur = re[i + k]; ui = im[i + k];
                vr = re[i + k + half] * cwr - im[i + k + half] * cwi;
                vi = re[i + k + half] * cwi + im[i + k + half] * cwr;
                re[i + k] = ur + vr; im[i + k] = ui + vi;
                re[i + k + half] = ur - vr; im[i + k + half] = ui - vi;
                nwr = cwr * wr - cwi * wi; cwi = cwr * wi + cwi * wr; cwr = nwr;
            }
        }
    }
    var out = new Float64Array(n / 2);
    for (i = 0; i < n / 2; i++) out[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
    return out;
}

// Hann 窗：w[i] = 0.5 - 0.5*cos(2πi/(n-1))，返回新数组（不改原数组）
function applyHannWindow(samples) {
    if (!samples || typeof samples.length !== 'number') throw fail('samples', 'samples 须为数组');
    var n = samples.length;
    if (n < 2) throw fail('samples', 'samples 长度须 ≥2');
    var out = new Float64Array(n), i, v;
    for (i = 0; i < n; i++) {
        v = samples[i];
        if (typeof v !== 'number' || !isFinite(v)) throw fail('samples', 'samples 须为有限数值');
        out[i] = v * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)));
    }
    return out;
}

// 每 1kHz 一档的频带能量：返回 [{band, freqStart, freqEnd, energyDb}]，energyDb 相对峰值频带（峰值档为 0dB）
function bandEnergies(magnitudes, sampleRate) {
    if (!magnitudes || typeof magnitudes.length !== 'number' || magnitudes.length < 1)
        throw fail('magnitudes', 'magnitudes 须为非空数组');
    if (typeof sampleRate !== 'number' || !isFinite(sampleRate) || sampleRate <= 0)
        throw fail('sampleRate', 'sampleRate 须为正有限数值');
    var n = magnitudes.length * 2;             // FFT 点数
    var binHz = sampleRate / n;                // 每 bin 的 Hz
    var bandCount = Math.floor(sampleRate / 2 / BAND_WIDTH);
    if (bandCount < 1) throw fail('sampleRate', '采样率过低，无法划分 1kHz 频带');
    var energies = new Float64Array(bandCount), b, k, m;
    for (k = 0; k < magnitudes.length; k++) {
        m = magnitudes[k];
        if (typeof m !== 'number' || !isFinite(m) || m < 0)
            throw fail('magnitudes', '幅度谱须为非负有限数值');
        b = Math.floor(k * binHz / BAND_WIDTH);
        if (b >= bandCount) b = bandCount - 1; // 奈奎斯特边缘归入最后一档
        energies[b] += m * m;
    }
    var peak = 0;
    for (b = 0; b < bandCount; b++) if (energies[b] > peak) peak = energies[b];
    var out = [];
    for (b = 0; b < bandCount; b++) {
        out.push({
            band: b,
            freqStart: b * BAND_WIDTH,
            freqEnd: (b + 1) * BAND_WIDTH,
            energyDb: peak > 0 ? (energies[b] > 0 ? 10 * Math.log10(energies[b] / peak) : -Infinity) : -Infinity
        });
    }
    return out;
}

// 截止频率：高于 thresholdDb 的最高频带的 freqEnd；无一档高于阈值时返回 0
function findCutoff(bands, thresholdDb) {
    if (!bands || typeof bands.length !== 'number' || bands.length === 0)
        throw fail('bands', 'bands 须为非空数组');
    if (thresholdDb === undefined || thresholdDb === null) thresholdDb = THRESHOLD_DB;
    if (typeof thresholdDb !== 'number' || !isFinite(thresholdDb))
        throw fail('thresholdDb', 'thresholdDb 须为有限数值');
    var cutoff = 0, i, b;
    for (i = 0; i < bands.length; i++) {
        b = bands[i];
        if (!b || typeof b.energyDb !== 'number' || isNaN(b.energyDb) || typeof b.freqEnd !== 'number')
            throw fail('bands', 'bands 元素须含 energyDb/freqEnd 数值');
        if (b.energyDb >= thresholdDb && b.freqEnd > cutoff) cutoff = b.freqEnd;
    }
    return cutoff;
}

// 截止频率分档（44.1kHz 基准）：返回 {verdict, reason, cutoffHz, sampleRate}
// verdict：likely_lossless / likely_transcoded / inconclusive；reason：high_cutoff / high_bitrate_mp3 /
// low_bitrate / low_sample_rate / no_signal
function classifyCutoff(cutoffHz, sampleRate) {
    if (typeof cutoffHz !== 'number' || !isFinite(cutoffHz) || cutoffHz < 0)
        throw fail('cutoffHz', 'cutoffHz 须为 ≥0 的有限数值');
    if (typeof sampleRate !== 'number' || !isFinite(sampleRate) || sampleRate <= 0)
        throw fail('sampleRate', 'sampleRate 须为正有限数值');
    if (sampleRate < MIN_SAMPLE_RATE)
        return { verdict: 'inconclusive', reason: 'low_sample_rate', cutoffHz: cutoffHz, sampleRate: sampleRate };
    if (cutoffHz <= 0)
        return { verdict: 'inconclusive', reason: 'no_signal', cutoffHz: cutoffHz, sampleRate: sampleRate };
    if (cutoffHz >= 20000)
        return { verdict: 'likely_lossless', reason: 'high_cutoff', cutoffHz: cutoffHz, sampleRate: sampleRate };
    if (cutoffHz >= 16000)
        return { verdict: 'likely_transcoded', reason: 'high_bitrate_mp3', cutoffHz: cutoffHz, sampleRate: sampleRate };
    return { verdict: 'likely_transcoded', reason: 'low_bitrate', cutoffHz: cutoffHz, sampleRate: sampleRate };
}

// 文件校验：{name, size}；扩展名仅 .flac/.wav/.mp3/.ogg/.m4a（大小写不敏感），体积 (0, 200MB]
function validateAudioFile(file) {
    if (!file || typeof file !== 'object' || Array.isArray(file))
        throw fail('file', 'file 须为对象');
    if (typeof file.name !== 'string' || !file.name.trim())
        throw fail('name', '文件名须为非空字符串');
    var dot = file.name.lastIndexOf('.');
    var ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : '';
    if (ALLOWED_EXTS.indexOf(ext) === -1)
        throw fail('name', '不支持的扩展名' + (ext || '（无扩展名）') + '，仅支持 .flac/.wav/.mp3/.ogg/.m4a');
    if (typeof file.size !== 'number' || !isFinite(file.size))
        throw fail('size', 'size 须为有限数值');
    if (file.size <= 0) throw fail('size', '文件为空');
    if (file.size > MAX_FILE_SIZE) throw fail('size', '文件超过 200MB 上限');
    return { name: file.name, ext: ext, size: file.size };
}

// 组合入口：频带 → 截止频率 → 分档；peakDbfs 可选，低于 -60dBFS 判静音 → 无法判定
function analyzeBands(bands, sampleRate, thresholdDb, peakDbfs) {
    if (thresholdDb === undefined || thresholdDb === null) thresholdDb = THRESHOLD_DB;
    var cutoff = findCutoff(bands, thresholdDb);
    if (peakDbfs !== undefined && peakDbfs !== null) {
        if (typeof peakDbfs !== 'number' || isNaN(peakDbfs) || peakDbfs === Infinity)
            throw fail('peakDbfs', 'peakDbfs 须为有限数值或 -Infinity（全零静音）');
        if (peakDbfs < SILENCE_DBFS)
            return { cutoffHz: cutoff, verdict: 'inconclusive', reason: 'silence',
                     sampleRate: sampleRate, thresholdDb: thresholdDb, peakDbfs: peakDbfs };
    }
    var c = classifyCutoff(cutoff, sampleRate);
    return { cutoffHz: c.cutoffHz, verdict: c.verdict, reason: c.reason,
             sampleRate: sampleRate, thresholdDb: thresholdDb,
             peakDbfs: (peakDbfs === undefined || peakDbfs === null) ? null : peakDbfs };
}

// 多声道平均混合为单声道
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

// 峰值 dBFS（相对满刻度）：全零返回 -Infinity
function peakDbfs(mono) {
    var peak = 0, i, v;
    for (i = 0; i < mono.length; i++) {
        v = Math.abs(mono[i]);
        if (v > peak) peak = v;
    }
    return peak <= 0 ? -Infinity : 20 * Math.log10(peak);
}

// 全文件分析：均匀取 ≤8 段 ×4096 点 Hann 窗 FFT → 各频带取段间最大值 → analyzeBands
// 返回 {result, segBands, merged, peakDbfs, duration, sampleRate, channels, segments}
function analyzeBuffer(buffer) {
    var chs = [], c;
    for (c = 0; c < buffer.numberOfChannels; c++) chs.push(buffer.getChannelData(c));
    var mono = mixToMono(chs, buffer.length);
    var peak = peakDbfs(mono);
    var total = mono.length;
    var nSeg = total >= FFT_SIZE ? Math.min(MAX_SEGMENTS, Math.floor(total / FFT_SIZE)) : 1;
    var starts = [], s;
    if (nSeg === 1) starts = [0];
    else {
        var step = (total - FFT_SIZE) / (nSeg - 1);
        for (s = 0; s < nSeg; s++) starts.push(Math.floor(s * step));
    }
    var segBands = [], merged = null, i, k;
    for (s = 0; s < nSeg; s++) {
        var seg = new Float64Array(FFT_SIZE);
        for (i = 0; i < FFT_SIZE; i++) {
            var idx = starts[s] + i;
            seg[i] = idx < total ? mono[idx] : 0;   // 短于 4096 点的段零填充
        }
        var bands = bandEnergies(fftMagnitudes(applyHannWindow(seg)), buffer.sampleRate);
        segBands.push(bands);
        if (!merged) {
            merged = bands.map(function (b) {
                return { band: b.band, freqStart: b.freqStart, freqEnd: b.freqEnd, energyDb: b.energyDb };
            });
        } else {
            for (k = 0; k < merged.length; k++)
                if (bands[k].energyDb > merged[k].energyDb) merged[k].energyDb = bands[k].energyDb;
        }
    }
    var result = analyzeBands(merged, buffer.sampleRate, THRESHOLD_DB, peak);
    return { result: result, segBands: segBands, merged: merged, peakDbfs: peak,
             duration: buffer.duration, sampleRate: buffer.sampleRate,
             channels: buffer.numberOfChannels, segments: nSeg };
}

var api = {
    fftMagnitudes: fftMagnitudes,
    applyHannWindow: applyHannWindow,
    bandEnergies: bandEnergies,
    findCutoff: findCutoff,
    classifyCutoff: classifyCutoff,
    validateAudioFile: validateAudioFile,
    analyzeBands: analyzeBands,
    mixToMono: mixToMono,
    peakDbfs: peakDbfs,
    analyzeBuffer: analyzeBuffer,
    FFT_SIZE: FFT_SIZE,
    FFT_MIN: FFT_MIN,
    MAX_SEGMENTS: MAX_SEGMENTS,
    BAND_WIDTH: BAND_WIDTH,
    THRESHOLD_DB: THRESHOLD_DB,
    MAX_FILE_SIZE: MAX_FILE_SIZE,
    ALLOWED_EXTS: ALLOWED_EXTS.slice(),
    MIN_SAMPLE_RATE: MIN_SAMPLE_RATE,
    SILENCE_DBFS: SILENCE_DBFS
};

// node 下同步导出纯函数（浏览器侧代码不执行）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    return;
}
if (typeof window !== 'undefined') window.LosslessAudioChecker = api;

/* ================= 浏览器侧：状态 ================= */

function $(id) { return document.getElementById(id); }

var el = {};
['lac-upload', 'lac-file', 'lac-srcinfo', 'lac-status',
 'lac-result', 'lac-verdict', 'lac-cutoff-line',
 'lac-spectrogram', 'lac-curve', 'lac-reupload'
].forEach(function (id) { el[id.replace(/-/g, '_').replace(/^lac_/, '')] = $(id); });

var state = {
    actx: null,         // AudioContext
    analysis: null      // analyzeBuffer 结果
};

function setStatus(msg) { el.status.textContent = msg || ''; }

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
}

function fmtTime(ms) {
    ms = Math.max(0, Math.round(ms));
    var m = Math.floor(ms / 60000);
    var s = Math.floor((ms % 60000) / 1000);
    var r = ms % 1000;
    return m + ':' + (s < 10 ? '0' : '') + s + '.' + (r < 100 ? (r < 10 ? '00' : '0') : '') + r;
}

function fmtSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(2) + ' MB';
}

function fmtDbfs(v) {
    if (!isFinite(v)) return '-∞ dBFS';
    return v.toFixed(1) + ' dBFS';
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

/* ================= 上传与解码（沿用 audio_trimmer.js 既有模式） ================= */

function handleFile(file) {
    if (!file) return;
    try {
        validateAudioFile({ name: file.name, size: file.size });
    } catch (e) {
        setStatus('❌ ' + e.message);
        return;
    }
    setStatus('⏳ 正在本地解码音频，请稍候…');
    var reader = new FileReader();
    reader.onerror = function () { setStatus('❌ 文件读取失败'); };
    reader.onload = function () {
        var actx;
        try { actx = ensureCtx(); } catch (e) { setStatus('❌ ' + e.message); return; }
        actx.decodeAudioData(reader.result).then(function (buffer) {
            onDecoded(buffer, file);
        }).catch(function (err) {
            setStatus('❌ 音频解码失败：个别 FLAC 文件解码失败不等于文件损坏，可能是浏览器解码器不支持此格式（' +
                (err && err.message ? err.message : 'unknown') + '）。可换 Chrome/Edge 再试。');
        });
    };
    reader.readAsArrayBuffer(file);
}

function onDecoded(buffer, file) {
    var t0 = performance.now();
    var analysis = analyzeBuffer(buffer);
    state.analysis = analysis;
    el.srcinfo.style.display = 'block';
    el.srcinfo.innerHTML = '📄 ' + escapeHtml(file.name) + '　·　时长 ' + fmtTime(buffer.duration * 1000) +
        '　·　' + buffer.sampleRate + 'Hz　·　' + buffer.numberOfChannels + ' 声道' +
        '　·　大小 ' + fmtSize(file.size) + '　·　峰值 ' + fmtDbfs(analysis.peakDbfs) +
        '　·　取段 ' + analysis.segments + ' 段 × 4096 点';
    setStatus('✅ 分析完成（' + Math.round(performance.now() - t0) + 'ms）。频谱截止 ' +
        analysis.result.cutoffHz + 'Hz，结论见下方卡片。');
    el.result.style.display = 'block';
    renderVerdict(analysis);
    renderSpectrogram(analysis);
    renderCurve(analysis);
    el.result.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ================= 结论卡 ================= */

var VERDICT_COPY = {
    likely_lossless: {
        cls: 'lac-v-ok',
        title: '✅ 疑似真无损',
        high_cutoff: '频谱能量延伸到 20kHz 以上，未见典型有损编码的截止特征，符合真无损音频的表现。'
    },
    likely_transcoded: {
        cls: 'lac-v-warn',
        title: '⚠️ 疑似转码（假无损）',
        high_bitrate_mp3: '高频在 16–20kHz 附近截断，与高码率 MP3 编码特征相符：该文件很可能是 MP3 等有损格式转存为 FLAC/WAV 的“假无损”。',
        low_bitrate: '高频在 16kHz 以下截断，与低码率有损编码特征相符：该文件很可能是低码率 MP3 等有损格式转存的“假无损”。'
    },
    inconclusive: {
        cls: 'lac-v-gray',
        title: '❓ 无法判定',
        low_sample_rate: '采样率低于 44.1kHz，频谱上限不足以支撑无损/转码判断。',
        silence: '音频接近静音（峰值低于 -60dBFS），没有足够信号做频谱判断。',
        no_signal: '高于 -50dB 阈值的频谱能量过低，无法判断。'
    }
};

function renderVerdict(analysis) {
    var r = analysis.result;
    var copy = VERDICT_COPY[r.verdict];
    var reasonText = copy[r.reason] || '';
    el.verdict.className = 'lac-verdict ' + copy.cls;
    el.verdict.innerHTML =
        '<div class="lac-v-title">' + copy.title + '</div>' +
        '<div class="lac-v-reason">' + escapeHtml(reasonText) + '</div>' +
        '<div class="lac-v-grid">' +
        '<div><span>截止频率</span><b>' + r.cutoffHz + ' Hz</b></div>' +
        '<div><span>采样率</span><b>' + analysis.sampleRate + ' Hz</b></div>' +
        '<div><span>峰值</span><b>' + fmtDbfs(analysis.peakDbfs) + '</b></div>' +
        '<div><span>判定阈值</span><b>-50 dB（相对峰值）</b></div>' +
        '</div>' +
        '<div class="lac-v-caveat">以上结论均为概率性“疑似”，不是鉴定依据：频谱截止频率只是线索之一，不能据此定罪；真无损的老录音本身高频成分少，也可能被误判为转码。</div>';
    el.cutoff_line.textContent = '截止频率：' + r.cutoffHz + ' Hz（阈值 -50dB，44.1kHz 基准）';
}

/* ================= 频谱图（段 × 频带热力） ================= */

function dbColor(db) {
    // -100dB 以下纯黑 → -50dB 深蓝 → -20dB 青绿 → 0dB 亮黄
    var t = Math.max(0, Math.min(1, (db + 100) / 100));
    var r, g, b;
    if (t < 0.5) { var u = t / 0.5; r = 15 + u * 20; g = 23 + u * 90; b = 42 + u * 110; }
    else { var u2 = (t - 0.5) / 0.5; r = 35 + u2 * 220; g = 113 + u2 * 120; b = 152 - u2 * 110; }
    return 'rgb(' + Math.round(r) + ',' + Math.round(g) + ',' + Math.round(b) + ')';
}

function setupCanvas(canvas, cssH) {
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth, h = cssH;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: w, h: h };
}

function renderSpectrogram(analysis) {
    var cv = el.spectrogram;
    var box = setupCanvas(cv, 180);
    var ctx = box.ctx, w = box.w, h = box.h;
    var padL = 46, padB = 22, padT = 8, padR = 8;
    var plotW = w - padL - padR, plotH = h - padT - padB;
    var bands = analysis.merged, segs = analysis.segBands;
    var nB = bands.length, nS = segs.length;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, w, h);
    var cw = plotW / nB, ch = plotH / nS, i, j;
    for (i = 0; i < nS; i++) {
        for (j = 0; j < nB; j++) {
            ctx.fillStyle = dbColor(segs[i][j].energyDb);
            ctx.fillRect(padL + j * cw, padT + i * ch, Math.ceil(cw), Math.ceil(ch));
        }
    }
    // 截止频率竖线
    var cutoff = analysis.result.cutoffHz;
    var nyq = analysis.sampleRate / 2;
    var cx = padL + (cutoff / nyq) * plotW;
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, padT); ctx.lineTo(cx, padT + plotH); ctx.stroke();
    // 刻度
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    var marks = [0, 5000, 10000, 15000, 20000];
    marks.forEach(function (f) {
        if (f > nyq) return;
        var x = padL + (f / nyq) * plotW;
        ctx.fillText((f / 1000) + 'k', x, h - 7);
        ctx.strokeStyle = 'rgba(148,163,184,.25)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + plotH); ctx.stroke();
    });
    ctx.textAlign = 'right';
    for (i = 0; i < nS; i++) {
        ctx.fillText('段' + (i + 1), padL - 6, padT + (i + 0.5) * ch + 4);
    }
    ctx.fillStyle = '#f87171';
    ctx.textAlign = cx > w - 90 ? 'right' : 'left';
    ctx.fillText('截止 ' + cutoff + 'Hz', cx + 4, padT + 12);
}

/* ================= 频谱曲线（合并后各段最大值 + 截止竖线） ================= */

function renderCurve(analysis) {
    var cv = el.curve;
    var box = setupCanvas(cv, 220);
    var ctx = box.ctx, w = box.w, h = box.h;
    var padL = 46, padB = 22, padT = 12, padR = 8;
    var plotW = w - padL - padR, plotH = h - padT - padB;
    var bands = analysis.merged;
    var nB = bands.length;
    var nyq = analysis.sampleRate / 2;
    var yOf = function (db) {
        var t = Math.max(0, Math.min(1, (db + 100) / 100));
        return padT + (1 - t) * plotH;
    };
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    // 网格：每 1kHz 淡线，-50dB 阈值虚线
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    var b;
    for (b = 0; b <= nB; b++) {
        var gx = padL + (b * 1000 / nyq) * plotW;
        if (gx > padL + plotW + 1) break;
        ctx.beginPath(); ctx.moveTo(gx, padT); ctx.lineTo(gx, padT + plotH); ctx.stroke();
    }
    ctx.strokeStyle = '#f59e0b';
    ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(padL, yOf(-50)); ctx.lineTo(padL + plotW, yOf(-50)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#b45309';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('-50dB 阈值', padL + 4, yOf(-50) - 4);
    // 频带柱 + 曲线
    var bw = plotW / nB;
    ctx.fillStyle = 'rgba(37,99,235,.55)';
    for (b = 0; b < nB; b++) {
        var db = bands[b].energyDb;
        var y = yOf(isFinite(db) ? db : -100);
        ctx.fillRect(padL + b * bw + 1, y, Math.max(1, bw - 2), padT + plotH - y);
    }
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (b = 0; b < nB; b++) {
        var db2 = bands[b].energyDb;
        var px = padL + (b + 0.5) * bw, py = yOf(isFinite(db2) ? db2 : -100);
        if (b === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    // 截止频率竖线
    var cutoff = analysis.result.cutoffHz;
    var cx = padL + (cutoff / nyq) * plotW;
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, padT); ctx.lineTo(cx, padT + plotH); ctx.stroke();
    ctx.fillStyle = '#dc2626';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = cx > w - 110 ? 'right' : 'left';
    ctx.fillText('截止 ' + cutoff + 'Hz', cx + 5, padT + 14);
    // 刻度
    ctx.fillStyle = '#6b7280';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    [0, 5000, 10000, 15000, 20000].forEach(function (f) {
        if (f > nyq) return;
        ctx.fillText((f / 1000) + 'kHz', padL + (f / nyq) * plotW, h - 7);
    });
    ctx.textAlign = 'right';
    [0, -50, -100].forEach(function (db) {
        ctx.fillText(db + 'dB', padL - 6, yOf(db) + 4);
    });
}

/* ================= 事件绑定 ================= */

el.upload.addEventListener('click', function () { el.file.click(); });
el.upload.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.file.click(); }
});
el.file.addEventListener('change', function () {
    if (el.file.files && el.file.files[0]) handleFile(el.file.files[0]);
    el.file.value = '';
});
['dragover', 'dragenter'].forEach(function (ev) {
    el.upload.addEventListener(ev, function (e) { e.preventDefault(); el.upload.classList.add('dragover'); });
});
['dragleave', 'drop'].forEach(function (ev) {
    el.upload.addEventListener(ev, function (e) { e.preventDefault(); el.upload.classList.remove('dragover'); });
});
el.upload.addEventListener('drop', function (e) {
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleFile(f);
});
el.reupload.addEventListener('click', function () {
    el.file.click();
});
window.addEventListener('resize', function () {
    if (state.analysis) {
        renderSpectrogram(state.analysis);
        renderCurve(state.analysis);
    }
});

})();
