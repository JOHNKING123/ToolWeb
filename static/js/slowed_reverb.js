/* 音频变速混响生成器（slowed + reverb）- 纯前端音频效果引擎
 *
 * 流程：上传音频（FileReader → ArrayBuffer，全本地，不上传）→ AudioContext.decodeAudioData 本地解码
 * → 变速（0.5x–1.5x，0.8x Slowed / 1.0x 正常 / 1.25x Nightcore 一键预设，音调随速度自然变化）
 * → ConvolverNode 卷积混响（程序化合成脉冲响应 IR：mulberry32 确定性噪声 + 单极点低通阻尼 +
 *   指数衰减包络，nostalgic/ambient/deep-room/soft-echo 四预设，soft-echo 带离散回声抽头）
 * → OfflineAudioContext 离线渲染（suspend 分段更新进度条）→ A/B 对比试听（原音频 / 效果）
 * → WAV 手工编码（16-bit PCM）本地下载；MP3 经本地 vendor lamejs 编码（重采样 44100Hz，
 *   比特率 128/192/320kbps 可选），文件名自动后缀。
 *
 * 音频只在浏览器本地处理：无后端调用、无第三方依赖、无 CDN（lamejs 为仓库内 vendor 文件）。
 * 刷新页面后音频不恢复（不写 localStorage/sessionStorage）。
 * 纯函数（fmtTime / clamp / clampSpeed / clampWet01 / SPEED_PRESETS / getReverbPreset /
 *   mulberry32 / synthesizeIR / wetDryGains / renderedDuration / estimateWavBytes /
 *   estimateMp3Bytes / makeExportName / fmtSize / floatTo16BitPCM / interleaveChannels /
 *   encodeWavDataView / resampleLinear）在 node 下可单元测试。
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

// 字节数 → 人类可读
function fmtSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(2) + ' MB';
    return (bytes / 1073741824).toFixed(2) + ' GB';
}

/* ---------- 变速参数 ---------- */

var SPEED_MIN = 0.5;   // 最慢 0.5x
var SPEED_MAX = 1.5;   // 最快 1.5x

function clampSpeed(v) {
    v = Number(v);
    if (isNaN(v)) return 1;
    return clamp(v, SPEED_MIN, SPEED_MAX);
}

// 一键预设：0.8x Slowed / 1.0x 正常 / 1.25x Nightcore（音调随速度自然变化，不做变调补偿）
var SPEED_PRESETS = [
    { key: 'slowed',    label: '0.8x Slowed',  speed: 0.8  },
    { key: 'normal',    label: '1.0x 正常',    speed: 1.0  },
    { key: 'nightcore', label: '1.25x Nightcore', speed: 1.25 }
];

/* ---------- 混响预设与 IR 合成 ---------- */

// 预设参数：irLen=脉冲响应时长(秒)；decay=指数衰减系数（越大尾音越短）；
// damping=单极点低通阻尼 0..1（越大越闷/越暖）；echo=离散回声抽头（soft-echo 专用）
var REVERB_PRESETS = {
    'nostalgic': {
        key: 'nostalgic', name: '怀旧磁带', nameEn: 'Nostalgic',
        desc: '温暖老旧磁带感：中长尾音，高频柔和衰减',
        irLen: 2.0, decay: 2.8, damping: 0.45, echo: null
    },
    'ambient': {
        key: 'ambient', name: '空灵氛围', nameEn: 'Ambient',
        desc: '开阔空间感：超长尾音，空气感强',
        irLen: 3.5, decay: 1.6, damping: 0.30, echo: null
    },
    'deep-room': {
        key: 'deep-room', name: '深邃房间', nameEn: 'Deep Room',
        desc: '小房间混响：尾音短促集中，闷而深',
        irLen: 1.1, decay: 4.5, damping: 0.55, echo: null
    },
    'soft-echo': {
        key: 'soft-echo', name: '柔和回声', nameEn: 'Soft Echo',
        desc: '带离散回声抽头：余音有节奏地渐弱',
        irLen: 1.6, decay: 3.5, damping: 0.35,
        echo: { delayMs: 260, gain: 0.32, taps: 4 }
    }
};

function getReverbPreset(key) {
    if (Object.prototype.hasOwnProperty.call(REVERB_PRESETS, key)) return REVERB_PRESETS[key];
    return null;
}

// djb2 字符串哈希 → uint32（IR 种子）
function hashStr(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = (((h << 5) + h) + s.charCodeAt(i)) >>> 0;
    return h >>> 0;
}

// mulberry32 确定性 PRNG：同一预设每次合成出同一条 IR，保证渲染结果可复现、A/B 对比一致
function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        var t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// 程序化合成脉冲响应：确定性白噪声 → 单极点低通（阻尼）→ 指数衰减包络 → 能量归一化
// nCh=1 单声道 / 2 立体声（两声道用不同种子去相关，避免中央堆积）
// 返回：Float32Array 数组（每声道一条），预设非法/采样率非法时返回 null
function synthesizeIR(presetKey, sampleRate, nCh) {
    var p = getReverbPreset(presetKey);
    if (!p || !sampleRate || sampleRate <= 0) return null;
    nCh = (nCh === 1) ? 1 : 2;
    var len = Math.max(1, Math.floor(p.irLen * sampleRate));
    var out = [];
    for (var c = 0; c < nCh; c++) {
        var rand = mulberry32((hashStr(presetKey) + c * 1013904223) >>> 0);
        var ch = new Float32Array(len);
        var lp = 0, i;
        for (i = 0; i < len; i++) {
            var t = i / sampleRate;
            var white = rand() * 2 - 1;
            lp += p.damping * (white - lp);
            ch[i] = lp * Math.exp(-p.decay * t);
        }
        // 离散回声抽头（soft-echo）：从快照复制，避免在写入的同时读到已叠加的值
        if (p.echo) {
            var d = Math.max(1, Math.floor(p.echo.delayMs / 1000 * sampleRate));
            var snap = new Float32Array(ch);
            for (var k = 1; k <= p.echo.taps; k++) {
                var off = k * d, g = Math.pow(p.echo.gain, k) * 0.6;
                var lim = len - off;
                for (var j = 0; j < lim; j++) ch[j + off] += snap[j] * g;
            }
        }
        // 能量归一化（每声道 Σh²=1）：卷积后功率≈输入功率，配合等功率干湿比不会爆音
        var energy = 0;
        for (i = 0; i < len; i++) energy += ch[i] * ch[i];
        var norm = energy > 0 ? 1 / Math.sqrt(energy) : 1;
        for (i = 0; i < len; i++) ch[i] *= norm;
        out.push(ch);
    }
    return out;
}

// 混响量 0..100(%) → 0..1 钳制
function clampWet01(v) {
    v = Number(v);
    if (isNaN(v)) return 0;
    return clamp(v, 0, 1);
}

// 干湿增益：等功率交叉淡化（wet=0 → 纯干声≈纯变速；wet=1 → 纯湿声）
function wetDryGains(wet) {
    wet = clampWet01(wet);
    return { dry: Math.cos(wet * Math.PI / 2), wet: Math.sin(wet * Math.PI / 2) };
}

/* ---------- 时长 / 体积预估 ---------- */

// 渲染后主干时长（秒，不含混响尾音）= 原时长 / 变速比
function renderedDuration(srcSec, speed) {
    speed = clampSpeed(speed);
    return srcSec / speed;
}

function estimateWavBytes(frames, nCh) { return 44 + frames * nCh * 2; }

function estimateMp3Bytes(durationSec, kbps) {
    return Math.max(0, Math.round(kbps * 1000 / 8 * durationSec));
}

// 导出文件名：原名_slowed-{速度}x_reverb-{混响量}.扩展名；混响量为 0 时省略 reverb 段
// 例：夜曲 → 夜曲_slowed-0.8x_reverb-50.wav
function makeExportName(base, speed, wetPct, ext) {
    base = String(base || 'audio').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) || 'audio';
    var sp = clampSpeed(speed);
    var spStr = String(Math.round(sp * 100) / 100);
    var wp = Math.round(clamp(Number(wetPct) || 0, 0, 100));
    var name = base + '_slowed-' + spStr + 'x';
    if (wp > 0) name += '_reverb-' + wp;
    return name + '.' + String(ext || 'wav').replace(/^\./, '');
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

// 44 字节标准 WAV 头 + int16 交错数据
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
    module.exports = { fmtTime: fmtTime, clamp: clamp, fmtSize: fmtSize,
        SPEED_MIN: SPEED_MIN, SPEED_MAX: SPEED_MAX, clampSpeed: clampSpeed,
        SPEED_PRESETS: SPEED_PRESETS, REVERB_PRESETS: REVERB_PRESETS,
        getReverbPreset: getReverbPreset, hashStr: hashStr, mulberry32: mulberry32,
        synthesizeIR: synthesizeIR, clampWet01: clampWet01, wetDryGains: wetDryGains,
        renderedDuration: renderedDuration, estimateWavBytes: estimateWavBytes,
        estimateMp3Bytes: estimateMp3Bytes, makeExportName: makeExportName,
        floatTo16BitPCM: floatTo16BitPCM, interleaveChannels: interleaveChannels,
        encodeWavDataView: encodeWavDataView, resampleLinear: resampleLinear };
    return;
}

/* ================= 浏览器侧：状态 ================= */

var MP3_RATE = 44100;          // lamejs 统一编码采样率
var MP3_CHUNK = 1152;          // lamejs 每帧采样数
var RENDER_SPLITS = 10;        // 离线渲染进度分段数

var state = {
    actx: null,          // AudioContext（解码 + A/B 试听）
    buffer: null,        // AudioBuffer（解码后原音频）
    fileBase: '',        // 源文件名（不含扩展名）
    speed: 1,            // 当前变速比
    reverbKey: 'nostalgic', // 当前混响预设
    wet: 0.5,            // 当前混响量 0..1
    rendered: null,      // AudioBuffer（渲染后效果）
    renderParams: null,  // 渲染时的参数快照 {speed, reverbKey, wet}
    rendering: false,    // 渲染进行中
    renderSeq: 0,        // 渲染序列号：handleFile 成功解码时递增，使在飞的旧渲染失效
    playing: null        // 当前试听节点 {src, stop}
};

var el = {};
['upload','file','srcinfo','status','speed','speed-val','presets','reverb-cards','wet','wet-val',
 'estimate','render','render-bar','render-pct','render-status',
 'play-orig','play-fx','stop-play','play-status',
 'export-wav','export-mp3','bitrate','export-status','reupload',
 'panel-params','panel-render','panel-preview','panel-export','export-filename'
].forEach(function (id) { el[id.replace(/-/g, '_')] = document.getElementById('sr-' + id); });

function setStatus(t) { el.status.textContent = t || ''; }
function setRenderStatus(t) { el.render_status.textContent = t || ''; }
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
    setStatus('⏳ 正在读取并解码音频…');
    var rd = new FileReader();
    rd.onload = function () {
        var actx = ensureActx();
        actx.decodeAudioData(rd.result).then(function (buf) {
            state.buffer = buf;
            state.rendered = null;
            state.renderParams = null;
            state.renderSeq++; // 新文件：作废任何在飞的旧渲染
            var dot = f.name.lastIndexOf('.');
            state.fileBase = dot > 0 ? f.name.slice(0, dot) : f.name;
            el.srcinfo.style.display = 'block';
            el.srcinfo.textContent = '📄 ' + f.name + ' ｜ ' + fmtTime(buf.duration * 1000) +
                ' ｜ ' + buf.sampleRate + 'Hz ｜ ' + buf.numberOfChannels + ' 声道';
            el.panel_params.style.display = 'block';
            el.panel_render.style.display = 'block';
            setStatus('✅ 解码成功，调整参数后点「生成效果」');
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
    state.buffer = null; state.rendered = null; state.renderParams = null;
    state.fileBase = '';
    state.renderSeq++; // 作废在飞的旧渲染
    el.file.value = '';
    el.srcinfo.style.display = 'none';
    el.panel_params.style.display = 'none';
    el.panel_render.style.display = 'none';
    el.panel_preview.style.display = 'none';
    el.panel_export.style.display = 'none';
    setStatus(''); setRenderStatus(''); setPlayStatus(''); setExportStatus('');
    el.render_bar.style.width = '0%'; el.render_pct.textContent = '0%';
}

/* ================= 参数面板 ================= */

function bindParams() {
    // 速度滑块
    el.speed.addEventListener('input', function () {
        state.speed = clampSpeed(parseFloat(el.speed.value));
        el.speed_val.textContent = state.speed.toFixed(2) + 'x';
        syncPresetButtons();
        updateEstimate();
    });
    // 一键预设
    var box = el.presets;
    SPEED_PRESETS.forEach(function (p) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'sr-chip';
        b.dataset.key = p.key;
        b.textContent = p.label;
        b.addEventListener('click', function () {
            state.speed = p.speed;
            el.speed.value = p.speed;
            el.speed_val.textContent = p.speed.toFixed(2) + 'x';
            syncPresetButtons();
            updateEstimate();
        });
        box.appendChild(b);
    });
    syncPresetButtons();
    // 混响预设卡片
    var cards = el.reverb_cards;
    Object.keys(REVERB_PRESETS).forEach(function (key) {
        var p = REVERB_PRESETS[key];
        var d = document.createElement('div');
        d.className = 'sr-rcard' + (key === state.reverbKey ? ' on' : '');
        d.dataset.key = key;
        d.setAttribute('role', 'button');
        d.setAttribute('tabindex', '0');
        d.innerHTML = '<div class="sr-rcard-t">' + p.name + ' <span>' + p.nameEn + '</span></div>' +
            '<div class="sr-rcard-d">' + p.desc + '</div>';
        function pick() {
            state.reverbKey = key;
            var nodes = cards.querySelectorAll('.sr-rcard');
            for (var i = 0; i < nodes.length; i++) nodes[i].classList.remove('on');
            d.classList.add('on');
            updateEstimate();
        }
        d.addEventListener('click', pick);
        d.addEventListener('keydown', function (ev) {
            if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick(); }
        });
        cards.appendChild(d);
    });
    // 混响量滑块
    el.wet.addEventListener('input', function () {
        state.wet = clampWet01(parseInt(el.wet.value, 10) / 100);
        el.wet_val.textContent = el.wet.value + '%';
        updateEstimate();
    });
}

function syncPresetButtons() {
    var nodes = el.presets.querySelectorAll('.sr-chip');
    for (var i = 0; i < nodes.length; i++) {
        var key = nodes[i].dataset.key;
        var hit = SPEED_PRESETS.filter(function (p) { return p.key === key; })[0];
        nodes[i].classList.toggle('on', !!hit && Math.abs(hit.speed - state.speed) < 1e-9);
    }
}

// 体积/时长预估
function updateEstimate() {
    if (!state.buffer) return;
    var dur = renderedDuration(state.buffer.duration, state.speed);
    var ir = getReverbPreset(state.reverbKey);
    var totalSec = dur + (ir ? ir.irLen : 0);
    var nCh = Math.min(2, state.buffer.numberOfChannels);
    var frames = Math.ceil(totalSec * state.buffer.sampleRate);
    var wavBytes = estimateWavBytes(frames, nCh);
    el.estimate.innerHTML = '预计效果时长 <b>' + fmtTime(totalSec * 1000) + '</b>' +
        '（变速 ' + state.speed.toFixed(2) + 'x → ' + fmtTime(dur * 1000) + ' ＋ 混响尾音）｜ ' +
        'WAV 约 ' + fmtSize(wavBytes) + ' ｜ MP3(128k) 约 ' + fmtSize(estimateMp3Bytes(totalSec, 128));
    var wp = Math.round(state.wet * 100);
    el.export_filename.textContent = '导出文件名：' + makeExportName(state.fileBase, state.speed, wp, 'wav') +
        ' / ' + makeExportName(state.fileBase, state.speed, wp, 'mp3');
}

/* ================= 离线渲染 ================= */

function renderEffect() {
    if (!state.buffer) { setRenderStatus('❌ 请先上传音频'); return; }
    if (state.rendering) return;
    state.rendering = true;
    state.renderSeq++;
    var seq = state.renderSeq; // 在飞的渲染带序列号：中途若换文件则本轮结果作废
    setRenderStatus('⏳ 正在离线渲染…');
    el.render_bar.style.width = '0%'; el.render_pct.textContent = '0%';
    el.render.disabled = true;

    var speed = clampSpeed(state.speed);
    var wet = clampWet01(state.wet);
    var presetKey = state.reverbKey;
    var srcBuf = state.buffer;
    var srcRate = srcBuf.sampleRate;
    var nCh = Math.min(2, srcBuf.numberOfChannels);
    var ir = synthesizeIR(presetKey, srcRate, nCh);
    if (!ir) {
        setRenderStatus('❌ 混响预设无效，请重新选择');
        state.rendering = false; el.render.disabled = false;
        return;
    }
    var irLen = ir[0].length;
    var mainFrames = Math.ceil(srcBuf.duration / speed * srcRate);
    var totalFrames = mainFrames + irLen;

    var off;
    try {
        off = new OfflineAudioContext(nCh, totalFrames, srcRate);
    } catch (e) {
        setRenderStatus('❌ 当前浏览器不支持离线音频渲染（OfflineAudioContext）');
        state.rendering = false; el.render.disabled = false;
        return;
    }

    var src = off.createBufferSource();
    src.buffer = srcBuf;
    src.playbackRate.value = speed;   // 音调随速度自然变化（slowed 降调 / nightcore 升调）
    var conv = off.createConvolver();
    var irBuf = off.createBuffer(nCh, irLen, srcRate);
    for (var c = 0; c < nCh; c++) irBuf.getChannelData(c).set(ir[c]);
    conv.buffer = irBuf;
    var g = wetDryGains(wet);
    var dry = off.createGain(); dry.gain.value = g.dry;
    var wetG = off.createGain(); wetG.gain.value = g.wet;
    src.connect(dry); dry.connect(off.destination);
    src.connect(conv); conv.connect(wetG); wetG.connect(off.destination);
    src.start(0);

    // 分段 suspend 更新进度条
    var splits = RENDER_SPLITS, done = 0;
    function armNext() {
        if (done >= splits) return;
        done++;
        var at = Math.floor(totalFrames * done / splits);
        off.suspend(at).then(function () {
            var pct = Math.round(done / splits * 100);
            el.render_bar.style.width = pct + '%';
            el.render_pct.textContent = pct + '%';
            off.resume().then(armNext);
        }).catch(function () { /* 渲染已结束时 suspend 会 reject，忽略 */ });
    }
    armNext();

    off.startRendering().then(function (rendered) {
        state.rendering = false;
        el.render.disabled = false;
        if (seq !== state.renderSeq) {
            // 渲染中途换了文件：旧结果作废，不写回、不点亮试听/导出面板
            setRenderStatus('⚠️ 渲染已过期（文件已更换），请按当前参数重新渲染');
            return;
        }
        state.rendered = rendered;
        state.renderParams = { speed: speed, reverbKey: presetKey, wet: wet };
        el.render_bar.style.width = '100%'; el.render_pct.textContent = '100%';
        setRenderStatus('✅ 渲染完成：' + fmtTime(rendered.duration * 1000) +
            '，可 A/B 试听对比后导出');
        el.panel_preview.style.display = 'block';
        el.panel_export.style.display = 'block';
        updateEstimate();
    }).catch(function () {
        state.rendering = false;
        el.render.disabled = false;
        setRenderStatus('❌ 渲染失败：音频过长或内存不足，试试较短的音频');
    });
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
    el.play_fx.disabled = !state.rendered;
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
    if (!state.rendered) { setExportStatus('❌ 请先生成效果'); return; }
    setExportStatus('⏳ 正在编码 WAV…');
    var buf = state.rendered;
    var nCh = buf.numberOfChannels;
    var pcms = [];
    for (var c = 0; c < nCh; c++) pcms.push(floatTo16BitPCM(buf.getChannelData(c)));
    var interleaved = interleaveChannels(pcms, buf.length);
    var dv = encodeWavDataView(buf.sampleRate, nCh, interleaved);
    var wp = Math.round(state.renderParams.wet * 100);
    var name = makeExportName(state.fileBase, state.renderParams.speed, wp, 'wav');
    downloadBlob(new Blob([dv], { type: 'audio/wav' }), name);
    setExportStatus('✅ WAV 已导出：' + name + '（' + fmtSize(dv.byteLength) + '）');
}

function exportMp3() {
    if (!state.rendered) { setExportStatus('❌ 请先生成效果'); return; }
    if (typeof lamejs === 'undefined') {
        setExportStatus('❌ MP3 编码器（lamejs）未加载，请刷新页面重试');
        return;
    }
    var bitrate = parseInt(el.bitrate.value, 10) || 128;
    setExportStatus('⏳ 正在编码 MP3（' + bitrate + 'kbps）…');
    var buf = state.rendered;
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
    var wp = Math.round(state.renderParams.wet * 100);
    var name = makeExportName(state.fileBase, state.renderParams.speed, wp, 'mp3');
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

    el.render.addEventListener('click', renderEffect);
    el.play_orig.addEventListener('click', function () { playBuffer(state.buffer, '原音频'); });
    el.play_fx.addEventListener('click', function () { playBuffer(state.rendered, '效果（变速+混响）'); });
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
