/* 白噪音发生器（white_noise_generator）纯前端核心逻辑
 * 纯函数经 module.exports 暴露，node tests/white_noise_generator.test.js 自测；
 * 浏览器端：window.WhiteNoise 全局 + DOM 装配（本文件末尾）。
 *
 * 设计说明：
 * - 噪声与环境声全部 WebAudio 本地合成：先生成循环噪声缓冲（AudioBuffer，
 *   首尾做交叉淡化消除循环接缝），经 GainNode 混音，零音频文件、零 fetch/XHR。
 * - 白噪声：均匀随机；粉噪声：Voss-McCartney 算法（8 行随机数表，按最低位
 *   尾 0 计数更新）；棕噪声：白噪声积分（Brownian），一阶泄漏积分器。
 * - 雨声：白噪声高通滤波＋随机雨滴调制（短衰减正弦爆发）；雷声：低通滤波棕
 *   噪声＋随机低频轰隆包络；风声：棕噪声＋慢速 LFO 扫幅。
 * - 防削波：各层增益求和超过 MIX_HEADROOM 时按比例缩放（混音归一化）。
 * - 睡眠定时器：到期前 FADE_SECONDS 秒自动淡出并停止；倒计时每秒刷新。
 * - 混音配置＋定时设置 localStorage 持久化（wn:mix）。
 */
(function () {
"use strict";

/* ================= 1. 纯函数：随机与基础 ================= */
function whiteSample(randFn) { return randFn() * 2 - 1; }

/* 粉噪声 Voss-McCartney：rows 为 8 行随机数表，idx 为递增计数器 */
function newPinkState(randFn) {
    var rows = [];
    for (var i = 0; i < 8; i++) rows.push(whiteSample(randFn));
    return { rows: rows, idx: 0, last: 0 };
}
/* 一步：统计 idx 尾随 0 个数，更新对应行并滚动白噪声 */
function pinkStep(st, randFn) {
    var idx = st.idx, n = 0;
    while (n < 7 && (idx & 1) === 0) { idx >>= 1; n++; }
    st.idx++;
    st.rows[n] = whiteSample(randFn);
    var sum = 0;
    for (var i = 0; i < 8; i++) sum += st.rows[i];
    st.last = sum / 8;
    return st.last * 1.6; /* 放大约回单位峰值附近 */
}

/* 棕噪声：泄漏积分器 last = (last + 0.02*w) / 1.02，DC 不漂移 */
function newBrownState() { return { last: 0 }; }
function brownStep(st, randFn) {
    st.last = (st.last + 0.02 * whiteSample(randFn)) / 1.02;
    return st.last * 3.5;
}

/* 一阶低通：y += alpha*(x-y)；高通：x - 低通(x) */
function newFilterState() { return { y: 0 }; }
function lowpassStep(st, x, alpha) {
    st.y += alpha * (x - st.y);
    return st.y;
}
function highpassStep(st, x, alpha) {
    return x - lowpassStep(st, x, alpha);
}

/* 循环缓冲首尾交叉淡化：返回新的 Float32Array，末 blendN 个采样渐入首部 */
function crossfadeLoop(buf, blendRatio) {
    var n = buf.length;
    var blend = Math.max(2, Math.floor(n * (blendRatio == null ? 0.08 : blendRatio)));
    var out = new Float32Array(n);
    for (var i = 0; i < n; i++) out[i] = buf[i];
    for (var j = 0; j < blend; j++) {
        var t = j / blend; /* 0 → 1 */
        out[n - blend + j] = buf[n - blend + j] * (1 - t) + buf[j] * t;
    }
    return out;
}

/* 峰值归一化到 target（默认 0.9），返回 {buf, peak} */
function normalizePeak(buf, target) {
    target = target == null ? 0.9 : target;
    var peak = 0, i;
    for (i = 0; i < buf.length; i++) {
        var a = Math.abs(buf[i]);
        if (a > peak) peak = a;
    }
    var g = peak > 1e-9 ? target / peak : 1;
    for (i = 0; i < buf.length; i++) buf[i] *= g;
    return { buf: buf, peak: peak * g };
}

/* ================= 2. 纯函数：六种声音合成 ================= */
/* sampleRate：采样率；seconds：缓冲秒数；randFn：()→[0,1) 随机源 */
function genWhite(sampleRate, seconds, randFn) {
    var n = Math.floor(sampleRate * seconds), buf = new Float32Array(n);
    for (var i = 0; i < n; i++) buf[i] = whiteSample(randFn);
    return buf;
}
function genPink(sampleRate, seconds, randFn) {
    var n = Math.floor(sampleRate * seconds), buf = new Float32Array(n);
    var st = newPinkState(randFn);
    for (var i = 0; i < n; i++) buf[i] = pinkStep(st, randFn);
    return buf;
}
function genBrown(sampleRate, seconds, randFn) {
    var n = Math.floor(sampleRate * seconds), buf = new Float32Array(n);
    var st = newBrownState();
    for (var i = 0; i < n; i++) buf[i] = brownStep(st, randFn);
    return buf;
}
/* 雨声：高通滤白噪声（alpha 越大截止越低）＋随机雨滴短爆发调制 */
function genRain(sampleRate, seconds, randFn) {
    var n = Math.floor(sampleRate * seconds), buf = new Float32Array(n);
    var lp = newFilterState();
    var i, drop = 0, dropFreq = 0;
    for (i = 0; i < n; i++) {
        var w = whiteSample(randFn);
        var hiss = highpassStep(lp, w, 0.35) * 0.7;
        /* 随机雨滴：平均每 ~0.25 秒一颗（概率按采样率折算，保持每秒颗数恒定） */
        if (drop <= 0 && randFn() < 0.00009 * (44100 / sampleRate)) {
            drop = Math.floor(sampleRate * (0.03 + randFn() * 0.05));
            dropFreq = 2200 + randFn() * 2600;
        }
        var ping = 0;
        if (drop > 0) {
            var ph = (dropFreq * (sampleRate * 0.08 - drop)) / sampleRate;
            ping = Math.sin(2 * Math.PI * ph) * (drop / (sampleRate * 0.08)) * 0.5;
            drop--;
        }
        buf[i] = hiss + ping;
    }
    return buf;
}
/* 雷声：低通棕噪声＋随机轰隆包络（指数起振慢衰减） */
function genThunder(sampleRate, seconds, randFn) {
    var n = Math.floor(sampleRate * seconds), buf = new Float32Array(n);
    var bs = newBrownState(), lp = newFilterState();
    var i, env = 0, envLen = 0, rumbles = 0;
    for (i = 0; i < n; i++) {
        var low = lowpassStep(lp, brownStep(bs, randFn) * 3.0, 0.03);
        /* 平均每 ~6 秒一次轰隆（概率按采样率折算，保持每秒次数恒定） */
        if (env <= 0 && randFn() < 0.0000038 * (44100 / sampleRate)) {
            envLen = Math.floor(sampleRate * (2 + randFn() * 3));
            env = envLen;
            rumbles++;
        }
        var rumble = 0;
        if (env > 0) {
            var k = 1 - env / envLen; /* 0 → 1 */
            /* 起振快、衰减慢：包络 = (1-exp(-k*8)) * exp(-k*3) */
            rumble = (1 - Math.exp(-k * 10)) * Math.exp(-k * 2.5);
            env--;
        }
        buf[i] = low * (0.3 + 2.0 * rumble);
    }
    return buf;
}
/* 风声：棕噪声＋双正弦 LFO 慢扫幅（0.05Hz/0.13Hz），模拟阵风 */
function genWind(sampleRate, seconds, randFn) {
    var n = Math.floor(sampleRate * seconds), buf = new Float32Array(n);
    var bs = newBrownState(), lp = newFilterState();
    for (var i = 0; i < n; i++) {
        var base = lowpassStep(lp, brownStep(bs, randFn) * 2.2, 0.06);
        var t = i / sampleRate;
        var gust = 0.55 + 0.45 * (0.6 * Math.sin(2 * Math.PI * 0.05 * t) +
                                  0.4 * Math.sin(2 * Math.PI * 0.13 * t + 1.7));
        buf[i] = base * (0.35 + 0.65 * gust);
    }
    return buf;
}

var KINDS = ["white", "pink", "brown", "rain", "thunder", "wind"];
var KIND_LABEL = { white: "白噪声", pink: "粉噪声", brown: "棕噪声", rain: "雨声", thunder: "雷声", wind: "风声" };
function genKind(kind, sampleRate, seconds, randFn) {
    switch (kind) {
        case "white": return genWhite(sampleRate, seconds, randFn);
        case "pink": return genPink(sampleRate, seconds, randFn);
        case "brown": return genBrown(sampleRate, seconds, randFn);
        case "rain": return genRain(sampleRate, seconds, randFn);
        case "thunder": return genThunder(sampleRate, seconds, randFn);
        case "wind": return genWind(sampleRate, seconds, randFn);
        default: return null;
    }
}

/* ================= 3. 纯函数：混音/定时器/预设/持久化 ================= */
var MIX_HEADROOM = 0.85;  /* 多层混音求和上限，防削波 */
/* gains：{white:0~1,...}。求和超上限则等比缩放；返回 {gains, scale, sum} */
function normalizeGains(gains) {
    var sum = 0, k, out = {};
    for (var i = 0; i < KINDS.length; i++) {
        k = KINDS[i];
        var v = +gains[k];
        if (!(v > 0)) v = 0;
        if (v > 1) v = 1;
        out[k] = v;
        sum += v;
    }
    var scale = 1;
    if (sum > MIX_HEADROOM) {
        scale = MIX_HEADROOM / sum;
        for (var j = 0; j < KINDS.length; j++) out[KINDS[j]] *= scale;
    }
    return { gains: out, scale: scale, sum: sum };
}

var FADE_SECONDS = 10; /* 到期前淡出秒数 */
/* 返回 {remainingSec, fading, done} */
function computeTimerState(totalSeconds, elapsedMs) {
    var remaining = totalSeconds - elapsedMs / 1000;
    if (remaining <= 0) return { remainingSec: 0, fading: false, done: true };
    return { remainingSec: remaining, fading: remaining <= FADE_SECONDS, done: false };
}
function formatHMS(sec) {
    sec = Math.max(0, Math.ceil(sec));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    function p(x) { return (x < 10 ? "0" : "") + x; }
    return h > 0 ? p(h) + ":" + p(m) + ":" + p(s) : p(m) + ":" + p(s);
}

/* 预设：各层 0~100 音量 */
var PRESETS = {
    focus:  { label: "专注工作", mix: { white: 20, pink: 80, brown: 0, rain: 30, thunder: 0, wind: 0 } },
    sleep:  { label: "深度睡眠", mix: { white: 0, pink: 0, brown: 80, rain: 0, thunder: 0, wind: 25 } },
    rainy:  { label: "雨夜",     mix: { white: 0, pink: 0, brown: 15, rain: 80, thunder: 35, wind: 0 } },
    custom: { label: "自定义",   mix: { white: 50, pink: 50, brown: 0, rain: 0, thunder: 0, wind: 0 } }
};
function defaultMix() {
    var m = {};
    for (var i = 0; i < KINDS.length; i++) m[KINDS[i]] = 0;
    return m;
}
function applyPresetMix(mix, presetId) {
    var p = PRESETS[presetId];
    if (!p) return mix;
    var out = defaultMix();
    for (var i = 0; i < KINDS.length; i++) out[KINDS[i]] = p.mix[KINDS[i]];
    return out;
}

var STORAGE_KEY = "white_noise_generator:mix:v1";
function sanitizeVolume(v) {
    v = Math.round(+v);
    if (!isFinite(v)) return 0;
    if (v < 0) return 0;
    if (v > 100) return 100;
    return v;
}
/* 配置：{mix:{kind:0-100}, master:0-100, preset, timerMin} */
function sanitizeConfig(cfg) {
    cfg = cfg && typeof cfg === "object" ? cfg : {};
    var out = { mix: defaultMix(), master: 80, preset: "custom", timerMin: 0 };
    if (cfg.mix && typeof cfg.mix === "object") {
        for (var i = 0; i < KINDS.length; i++) {
            var k = KINDS[i];
            if (cfg.mix[k] != null) out.mix[k] = sanitizeVolume(cfg.mix[k]);
        }
    }
    if (cfg.master != null) out.master = sanitizeVolume(cfg.master);
    if (typeof cfg.preset === "string" && PRESETS[cfg.preset]) out.preset = cfg.preset;
    var tm = Math.round(+cfg.timerMin);
    if (isFinite(tm) && tm > 0 && tm <= 480) out.timerMin = tm;
    return out;
}
function serializeConfig(cfg) { return JSON.stringify(sanitizeConfig(cfg)); }
function parseConfig(json) {
    if (typeof json !== "string" || !json) return null;
    try {
        var o = JSON.parse(json);
        return sanitizeConfig(o);
    } catch (e) { return null; }
}

/* ================= 4. 双模式导出 ================= */
var API = {
    whiteSample: whiteSample,
    newPinkState: newPinkState, pinkStep: pinkStep,
    newBrownState: newBrownState, brownStep: brownStep,
    newFilterState: newFilterState, lowpassStep: lowpassStep, highpassStep: highpassStep,
    crossfadeLoop: crossfadeLoop, normalizePeak: normalizePeak,
    genWhite: genWhite, genPink: genPink, genBrown: genBrown,
    genRain: genRain, genThunder: genThunder, genWind: genWind, genKind: genKind,
    KINDS: KINDS, KIND_LABEL: KIND_LABEL,
    MIX_HEADROOM: MIX_HEADROOM, normalizeGains: normalizeGains,
    FADE_SECONDS: FADE_SECONDS, computeTimerState: computeTimerState, formatHMS: formatHMS,
    PRESETS: PRESETS, defaultMix: defaultMix, applyPresetMix: applyPresetMix,
    STORAGE_KEY: STORAGE_KEY, sanitizeConfig: sanitizeConfig,
    serializeConfig: serializeConfig, parseConfig: parseConfig, sanitizeVolume: sanitizeVolume
};

if (typeof module !== "undefined" && module.exports) {
    module.exports = API;
}

/* ================= 5. 浏览器端：WebAudio 引擎 + DOM 装配 ================= */
if (typeof window !== "undefined") {
    window.WhiteNoise = API;

    var $ = function (id) { return document.getElementById(id); };
    var ctx = null;             /* AudioContext，首次用户手势时创建 */
    var masterGain = null;
    var layers = {};            /* kind -> {src, gain} */
    var buffers = {};           /* kind -> AudioBuffer */
    var mix = defaultMix();     /* 各层 0~100 */
    var masterVol = 80;
    var playing = false;
    var presetId = "custom";
    var timerId = null, timerStart = 0, timerTotalSec = 0, fading = false;

    var LOOP_SECONDS = 6;

    function toast(msg) {
        var el = $("wn-toast");
        if (!el) return;
        el.textContent = msg;
        el.classList.add("wn-show");
        clearTimeout(el._t);
        el._t = setTimeout(function () { el.classList.remove("wn-show"); }, 2200);
    }

    /* 构建/恢复 AudioContext（iOS 必须在手势内） */
    function ensureCtx() {
        if (!ctx) {
            var AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) { toast("当前浏览器不支持 WebAudio"); return false; }
            ctx = new AC();
            masterGain = ctx.createGain();
            masterGain.gain.value = masterVol / 100;
            masterGain.connect(ctx.destination);
        }
        if (ctx.state === "suspended") {
            ctx.resume();
            var hint = $("wn-ios-hint");
            if (hint) {
                hint.style.display = ctx.state === "suspended" ? "flex" : "none";
            }
        }
        return true;
    }

    function getBuffer(kind) {
        if (buffers[kind]) return buffers[kind];
        var rand = Math.random;
        var raw = genKind(kind, ctx.sampleRate, LOOP_SECONDS, rand);
        raw = crossfadeLoop(raw);
        normalizePeak(raw, 0.9);
        var ab = ctx.createBuffer(1, raw.length, ctx.sampleRate);
        ab.getChannelData(0).set(raw);
        buffers[kind] = ab;
        return ab;
    }

    /* 应用各层增益：音量滑杆(0~100)→0~1，求和超限按比例缩放防削波 */
    function applyGains() {
        if (!ctx) return;
        var g = {}, i;
        for (i = 0; i < KINDS.length; i++) {
            var k = KINDS[i];
            g[k] = (mix[k] > 0 ? 1 : 0) * (mix[k] / 100);
        }
        var norm = normalizeGains(g);
        for (i = 0; i < KINDS.length; i++) {
            k = KINDS[i];
            if (layers[k]) {
                layers[k].gain.gain.setTargetAtTime(norm.gains[k], ctx.currentTime, 0.1);
            }
        }
        return norm;
    }

    function startLayer(kind) {
        if (layers[kind] || !ctx) return;
        var src = ctx.createBufferSource();
        src.buffer = getBuffer(kind);
        src.loop = true;
        var g = ctx.createGain();
        g.gain.value = 0;
        src.connect(g);
        g.connect(masterGain);
        src.start();
        layers[kind] = { src: src, gain: g };
    }
    function stopLayer(kind) {
        var L = layers[kind];
        if (!L) return;
        try { L.src.stop(); } catch (e) {}
        try { L.src.disconnect(); L.gain.disconnect(); } catch (e) {}
        delete layers[kind];
    }

    function refreshLayerStates() {
        for (var i = 0; i < KINDS.length; i++) {
            var k = KINDS[i];
            if (playing && mix[k] > 0) startLayer(k);
            else stopLayer(k);
        }
        applyGains();
    }

    function setPlaying(on) {
        if (on && !ensureCtx()) return;
        playing = on;
        refreshLayerStates();
        var btn = $("wn-play");
        if (btn) {
            btn.innerHTML = on
                ? '<i class="material-icons">pause</i> 暂停'
                : '<i class="material-icons">play_arrow</i> 开始播放';
            btn.classList.toggle("wn-playing", on);
        }
        var st = $("wn-status");
        if (st) st.textContent = on ? "正在播放 · 多层混音中" : "已停止";
    }

    /* ---- 睡眠定时器 ---- */
    function clearTimer() {
        if (timerId) { clearInterval(timerId); timerId = null; }
        timerStart = 0; timerTotalSec = 0; fading = false;
        var el = $("wn-timer-count");
        if (el) el.textContent = "未设置";
        var btn = $("wn-timer-cancel");
        if (btn) btn.disabled = true;
    }
    function startTimer(minutes) {
        clearTimer();
        timerTotalSec = minutes * 60;
        timerStart = Date.now();
        var btn = $("wn-timer-cancel");
        if (btn) btn.disabled = false;
        timerId = setInterval(timerTick, 500);
        timerTick();
        toast("睡眠定时器已设置：" + minutes + " 分钟");
        saveConfig();
    }
    function timerTick() {
        var st = computeTimerState(timerTotalSec, Date.now() - timerStart);
        var el = $("wn-timer-count");
        if (el) el.textContent = "剩余 " + formatHMS(st.remainingSec) + (st.fading ? "（正在淡出…）" : "");
        if (st.done) {
            clearTimer();
            fadeOutAndStop();
            return;
        }
        if (st.fading && !fading && ctx && masterGain) {
            fading = true;
            /* 到期前 10 秒：主音量线性淡出到 0 */
            masterGain.gain.cancelScheduledValues(ctx.currentTime);
            masterGain.gain.setValueAtTime(masterGain.gain.value, ctx.currentTime);
            masterGain.gain.linearRampToValueAtTime(0, ctx.currentTime + st.remainingSec);
        }
    }
    function fadeOutAndStop() {
        if (ctx && masterGain && playing) {
            masterGain.gain.cancelScheduledValues(ctx.currentTime);
            masterGain.gain.setValueAtTime(masterGain.gain.value, ctx.currentTime);
            masterGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.5);
            setTimeout(function () {
                setPlaying(false);
                if (masterGain) masterGain.gain.setValueAtTime(masterVol / 100, ctx.currentTime);
                toast("定时器到期，已自动停止");
            }, 1600);
        } else {
            setPlaying(false);
            toast("定时器到期，已自动停止");
        }
    }

    /* ---- 持久化 ---- */
    function saveConfig() {
        try {
            localStorage.setItem(STORAGE_KEY, serializeConfig({
                mix: mix, master: masterVol, preset: presetId,
                timerMin: timerId ? Math.round(timerTotalSec / 60) : 0
            }));
        } catch (e) {}
    }
    function loadConfig() {
        var cfg = null;
        try { cfg = parseConfig(localStorage.getItem(STORAGE_KEY)); } catch (e) {}
        if (cfg) {
            mix = cfg.mix; masterVol = cfg.master; presetId = cfg.preset;
            return cfg;
        }
        return null;
    }

    /* ---- UI 装配 ---- */
    function paintMixUI() {
        for (var i = 0; i < KINDS.length; i++) {
            var k = KINDS[i];
            var sw = $("wn-sw-" + k), sl = $("wn-vol-" + k), val = $("wn-val-" + k);
            if (sw) sw.checked = mix[k] > 0;
            if (sl) sl.value = mix[k];
            if (val) val.textContent = mix[k] + "%";
        }
        var mv = $("wn-master");
        if (mv) mv.value = masterVol;
        var mvv = $("wn-master-val");
        if (mvv) mvv.textContent = masterVol + "%";
        paintPresetUI();
    }
    function paintPresetUI() {
        var btns = document.querySelectorAll(".wn-preset");
        for (var i = 0; i < btns.length; i++) {
            btns[i].classList.toggle("wn-active", btns[i].getAttribute("data-preset") === presetId);
        }
    }

    function init() {
        var saved = loadConfig();
        /* 滑杆/开关事件 */
        for (var i = 0; i < KINDS.length; i++) (function (k) {
            var sw = $("wn-sw-" + k), sl = $("wn-vol-" + k), val = $("wn-val-" + k);
            if (sw) sw.addEventListener("change", function () {
                mix[k] = sw.checked ? (mix[k] > 0 ? mix[k] : 60) : 0;
                if (sl) sl.value = mix[k];
                if (val) val.textContent = mix[k] + "%";
                presetId = "custom"; paintPresetUI();
                refreshLayerStates(); saveConfig();
            });
            if (sl) sl.addEventListener("input", function () {
                mix[k] = sanitizeVolume(sl.value);
                if (sw) sw.checked = mix[k] > 0;
                if (val) val.textContent = mix[k] + "%";
                presetId = "custom"; paintPresetUI();
                refreshLayerStates(); saveConfig();
            });
        })(KINDS[i]);

        var mv = $("wn-master");
        if (mv) mv.addEventListener("input", function () {
            masterVol = sanitizeVolume(mv.value);
            var mvv = $("wn-master-val");
            if (mvv) mvv.textContent = masterVol + "%";
            if (ctx && masterGain && !fading) {
                masterGain.gain.setTargetAtTime(masterVol / 100, ctx.currentTime, 0.05);
            }
            saveConfig();
        });

        /* 预设按钮 */
        var btns = document.querySelectorAll(".wn-preset");
        for (var j = 0; j < btns.length; j++) (function (b) {
            b.addEventListener("click", function () {
                var pid = b.getAttribute("data-preset");
                mix = applyPresetMix(mix, pid);
                presetId = pid;
                paintMixUI();
                refreshLayerStates(); saveConfig();
                toast("已切换预设：" + (PRESETS[pid] ? PRESETS[pid].label : pid));
            });
        })(btns[j]);

        /* 保存我的混音 */
        var saveBtn = $("wn-save-mix");
        if (saveBtn) saveBtn.addEventListener("click", function () {
            presetId = "custom"; paintPresetUI();
            saveConfig();
            toast("混音已保存，刷新页面自动恢复");
        });

        /* 播放/暂停（用户手势；iOS 在此解锁 AudioContext） */
        var play = $("wn-play");
        if (play) play.addEventListener("click", function () { setPlaying(!playing); });

        /* 定时器 */
        var tbtns = document.querySelectorAll(".wn-timer");
        for (var t = 0; t < tbtns.length; t++) (function (b) {
            b.addEventListener("click", function () {
                startTimer(parseInt(b.getAttribute("data-min"), 10) || 15);
            });
        })(tbtns[t]);
        var customT = $("wn-timer-custom");
        var customBtn = $("wn-timer-custom-go");
        if (customBtn) customBtn.addEventListener("click", function () {
            var m = Math.round(+((customT && customT.value) || 0));
            if (!m || m < 1 || m > 480) { toast("请输入 1~480 分钟"); return; }
            startTimer(m);
        });
        var cancelBtn = $("wn-timer-cancel");
        if (cancelBtn) cancelBtn.addEventListener("click", function () {
            clearTimer(); saveConfig(); toast("已取消定时器");
        });

        paintMixUI();
        clearTimer();
        /* 恢复上次的定时器设置（仅设置项，不自动开始计时） */
        if (saved && saved.timerMin > 0) {
            var el = $("wn-timer-count");
            if (el) el.textContent = "上次设置：" + saved.timerMin + " 分钟（点击预设时长重新开始）";
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
}
})();
