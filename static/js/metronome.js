/* 在线节拍器（metronome）- Web Audio 前瞻调度节拍
 *
 * 流程：Web Audio 前瞻调度（lookahead scheduler：25ms 定时器＋0.1s 预调度，
 * 每拍提前把 OscillatorNode 正弦 click 排进音频时钟，防 setInterval 漂移）
 * → BPM 40–208（滑杆＋数字输入＋±1/±5 步进、键盘 ↑/↓、空格启停）
 * → 拍号 2/4、3/4、4/4、6/8（首拍重音可听辨：首拍 2000Hz/增益 1.0，
 * 其余 1000Hz/增益 0.6）→ 节拍音色四档（click/木鱼/鼓/正弦）
 * → 视觉闪烁（当前拍圆点高亮＋拍数指示，按音频时钟对齐）
 * → Tap 测速（≥4 次点按取平均间隔→BPM，超限明确提示、不自动钳制）。
 *
 * 真限制（页面明示）：① 后台标签页 setInterval 可能被节流导致节拍漂移，
 * 建议保持页面前台使用；② 手机静音模式／系统媒体音量会影响节拍音，
 * 须开启媒体音量；③ Tap 测速是估算值（取点按平均间隔，偶发点按误差会
 * 拉偏 BPM，仅作参考）；④ 全程浏览器本地计算，零上传。
 * 纯函数（validateBpm / bpmToIntervalMs / intervalMsToBpm / tapToBpm /
 *   beatInBar / nextBeatTime / clickParams）在 node 下可单元测试；
 * 非法参数抛 Error 且 err.field 给字段名，不静默钳制。
 * 注意：intervalMsToBpm 与 tapToBpm 返回值不钳制（超出 40–208 时原值
 * 返回），由调用方按 validateBpm 校验并提示。
 */
(function () {
'use strict';

/* ================= 常量 ================= */

var MIN_BPM = 40;                    // BPM 下限
var MAX_BPM = 208;                   // BPM 上限
var DEFAULT_BPM = 120;               // 默认 BPM
var LOOKAHEAD_MS = 25;               // 调度定时器间隔（毫秒）
var SCHEDULE_AHEAD_S = 0.1;          // 预调度窗口（秒）
var ACCENT_FREQ = 2000;              // 首拍 click 频率（Hz）
var BEAT_FREQ = 1000;                // 其余拍 click 频率（Hz）
var CLICK_DUR_MS = 50;               // click 持续时间（毫秒）
var ACCENT_GAIN = 1.0;               // 首拍增益
var BEAT_GAIN = 0.6;                 // 其余拍增益
var TIME_SIGNATURES = [              // 拍号：每小节拍数
    { beats: 2, label: '2/4' },
    { beats: 3, label: '3/4' },
    { beats: 4, label: '4/4' },
    { beats: 6, label: '6/8' }
];
var TIMBRES = ['click', 'woodblock', 'drum', 'sine'];
var TIMBRE_LABELS = { click: 'Click', woodblock: '木鱼', drum: '鼓', sine: '正弦' };
var BPM_PRESETS = [60, 80, 100, 120, 140, 160];
var TAP_MIN_INTERVALS = 2;           // tapToBpm 至少 2 个间隔（即 ≥3 次点按）
var TAP_MIN_TAPS = 4;                // 界面 Tap 测速至少 4 次点按
var TAP_MAX_GAP_MS = 2000;           // 两次点按间隔超过 2 秒视为重新开始计时

/* ================= 纯函数 ================= */

function err(field, msg) {
    var e = new Error(msg);
    e.field = field;
    return e;
}

/* ---------- BPM 校验 ---------- */

// BPM 须为 40–208 的整数；返回 bpm 本身；非法抛 Error（err.field='bpm'）
// 精确锚点：40→40、208→208；39/209/120.5 抛错
function validateBpm(bpm) {
    if (typeof bpm !== 'number' || isNaN(bpm) || Math.floor(bpm) !== bpm ||
        bpm < MIN_BPM || bpm > MAX_BPM) throw err('bpm', 'BPM 须为 40–208 的整数');
    return bpm;
}

/* ---------- BPM ↔ 拍间隔 ---------- */

// BPM → 每拍间隔毫秒：60000/bpm
// bpm 须为 40–208 的有限数（不要求整数，见 validateBpm 的整数口径）；
// 精确锚点：60→1000、120→500、40→1500、208→60000/208≈288.46
// 非法抛 Error（err.field='bpm'）
function bpmToIntervalMs(bpm) {
    if (typeof bpm !== 'number' || isNaN(bpm) || !isFinite(bpm) ||
        bpm < MIN_BPM || bpm > MAX_BPM) throw err('bpm', 'BPM 须为 40–208 的有限数');
    return 60000 / bpm;
}

// 拍间隔毫秒 → BPM：60000/ms；ms 须为正有限数，否则 err.field='intervalMs'
// 返回值不钳制、不四舍五入（超出 40–208 时原值返回，由调用方按 validateBpm 处理）
// 精确锚点：500→120、1000→60
function intervalMsToBpm(ms) {
    if (typeof ms !== 'number' || isNaN(ms) || !isFinite(ms) || ms <= 0) throw err('intervalMs', '间隔须为正有限数（毫秒）');
    return 60000 / ms;
}

/* ---------- Tap 测速 ---------- */

// 点按间隔数组 → BPM：取平均间隔换算 60000/平均间隔
// intervals 须为 ≥2 个正有限数的数组，否则 err.field='intervals'
// 返回值不钳制、不四舍五入（超出 40–208 时原值返回，由调用方提示超限）
// 精确锚点：[500,500,500]→120；[250,250]→240（不钳制）
function tapToBpm(intervals) {
    if (!intervals || typeof intervals.length !== 'number' || intervals.length < TAP_MIN_INTERVALS) throw err('intervals', '至少需要 2 个点按间隔');
    var sum = 0;
    for (var i = 0; i < intervals.length; i++) {
        var v = intervals[i];
        if (typeof v !== 'number' || isNaN(v) || !isFinite(v) || v <= 0) throw err('intervals', '点按间隔须为正有限数（毫秒）');
        sum += v;
    }
    return 60000 / (sum / intervals.length);
}

/* ---------- 小节内拍位 ---------- */

// 全局拍序号 → 小节内位置：{beat: 1 起的当拍序号, isAccent: 是否首拍}
// beatIndex 须为 ≥0 整数（err.field='beatIndex'）；
// beatsPerBar 须为 2/3/4/6 之一（err.field='beatsPerBar'）
// 精确锚点：(0,4)→{beat:1,isAccent:true}、(3,4)→{beat:4,isAccent:false}、
// (4,4)→{beat:1,isAccent:true}、(5,6)→{beat:6,isAccent:false}
function beatInBar(beatIndex, beatsPerBar) {
    if (typeof beatIndex !== 'number' || isNaN(beatIndex) ||
        Math.floor(beatIndex) !== beatIndex || beatIndex < 0) throw err('beatIndex', '拍序号须为 ≥0 的整数');
    var ok = false;
    for (var i = 0; i < TIME_SIGNATURES.length; i++) {
        if (TIME_SIGNATURES[i].beats === beatsPerBar) { ok = true; break; }
    }
    if (!ok) throw err('beatsPerBar', '拍号须为 2/4、3/4、4/4、6/8 之一');
    var pos = beatIndex % beatsPerBar;
    return { beat: pos + 1, isAccent: pos === 0 };
}

/* ---------- 前瞻调度 ---------- */

// 下一拍的音频时钟时间（秒）：currentTime＋intervalMs/1000
// currentTime 须为 ≥0 有限数（err.field='currentTime'）；
// intervalMs 须为正有限数（err.field='intervalMs'）
// 精确锚点：(1.0, 500)→1.5
function nextBeatTime(currentTime, intervalMs) {
    if (typeof currentTime !== 'number' || isNaN(currentTime) || !isFinite(currentTime) || currentTime < 0) throw err('currentTime', '当前时间须为 ≥0 的有限数（秒）');
    if (typeof intervalMs !== 'number' || isNaN(intervalMs) || !isFinite(intervalMs) || intervalMs <= 0) throw err('intervalMs', '间隔须为正有限数（毫秒）');
    return currentTime + intervalMs / 1000;
}

/* ---------- 节拍 click 参数 ---------- */

// 首拍 {frequency:2000, durationMs:50, gain:1.0}，其余 {frequency:1000, durationMs:50, gain:0.6}
// isAccent 须为布尔值，否则 err.field='isAccent'
function clickParams(isAccent) {
    if (typeof isAccent !== 'boolean') throw err('isAccent', 'isAccent 须为布尔值');
    if (isAccent) return { frequency: ACCENT_FREQ, durationMs: CLICK_DUR_MS, gain: ACCENT_GAIN };
    return { frequency: BEAT_FREQ, durationMs: CLICK_DUR_MS, gain: BEAT_GAIN };
}

// node 下导出纯函数以便单元测试
var api = { MIN_BPM: MIN_BPM, MAX_BPM: MAX_BPM, DEFAULT_BPM: DEFAULT_BPM,
    LOOKAHEAD_MS: LOOKAHEAD_MS, SCHEDULE_AHEAD_S: SCHEDULE_AHEAD_S,
    ACCENT_FREQ: ACCENT_FREQ, BEAT_FREQ: BEAT_FREQ, CLICK_DUR_MS: CLICK_DUR_MS,
    ACCENT_GAIN: ACCENT_GAIN, BEAT_GAIN: BEAT_GAIN,
    TIME_SIGNATURES: TIME_SIGNATURES, TIMBRES: TIMBRES, TIMBRE_LABELS: TIMBRE_LABELS,
    BPM_PRESETS: BPM_PRESETS, TAP_MIN_INTERVALS: TAP_MIN_INTERVALS,
    TAP_MIN_TAPS: TAP_MIN_TAPS, TAP_MAX_GAP_MS: TAP_MAX_GAP_MS,
    validateBpm: validateBpm, bpmToIntervalMs: bpmToIntervalMs,
    intervalMsToBpm: intervalMsToBpm, tapToBpm: tapToBpm,
    beatInBar: beatInBar, nextBeatTime: nextBeatTime, clickParams: clickParams };
if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    return;
}
if (typeof window !== 'undefined') window.Metronome = api;

/* ================= 浏览器侧：状态 ================= */

var state = {
    actx: null,          // AudioContext（节拍时钟）
    masterGain: null,    // GainNode（总音量）
    timerId: 0,          // setInterval 句柄（25ms 调度定时器）
    nextNoteTime: 0,     // 下一拍的音频时钟时间（秒）
    beatCount: 0,        // 自启动起的全局拍序号
    bpm: DEFAULT_BPM,    // 当前 BPM
    beatsPerBar: 4,      // 每小节拍数（拍号）
    timbre: 'click',     // 节拍音色
    volume: 0.8,         // 音量 0..1
    muted: false,        // 静音
    running: false,      // 节拍进行中
    tapTimes: []         // Tap 点按时间戳（performance.now）
};

var el = {};
['start', 'status', 'bpm-display', 'bpm-slider', 'bpm-input',
 'step-m5', 'step-m1', 'step-p1', 'step-p5',
 'sig', 'timbre', 'presets', 'beat-dots', 'flash', 'beat-label',
 'tap', 'tap-status', 'volume', 'volume-val', 'mute'
].forEach(function (id) { el[id.replace(/-/g, '_')] = document.getElementById('mt-' + id); });

function setStatus(msg) { if (el.status) el.status.textContent = msg; }
function setTapStatus(msg) { if (el.tap_status) el.tap_status.textContent = msg; }

/* ================= AudioContext 与调度 ================= */

function ensureActx() {
    if (state.actx) {
        if (state.actx.state === 'suspended') state.actx.resume();
        return true;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) {
        setStatus('❌ 当前浏览器不支持 Web Audio API，请换 Chrome / Edge / Firefox');
        return false;
    }
    state.actx = new AC();
    state.masterGain = state.actx.createGain();
    state.masterGain.gain.value = state.muted ? 0 : state.volume;
    state.masterGain.connect(state.actx.destination);
    return true;
}

// 在音频时钟 time 时刻排一拍 click；视觉闪烁按同一时钟对齐
function scheduleClick(beatIndex, time) {
    var info = beatInBar(beatIndex, state.beatsPerBar);
    var p = clickParams(info.isAccent);
    var osc = state.actx.createOscillator();
    var g = state.actx.createGain();
    var dur = p.durationMs / 1000;
    if (state.timbre === 'drum') {
        // 鼓：正弦 160Hz→55Hz 滑音＋0.12s 包络
        osc.type = 'sine';
        osc.frequency.setValueAtTime(160, time);
        osc.frequency.exponentialRampToValueAtTime(55, time + 0.12);
        g.gain.setValueAtTime(0.0001, time);
        g.gain.exponentialRampToValueAtTime(p.gain, time + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, time + 0.12);
        osc.start(time);
        osc.stop(time + 0.14);
    } else if (state.timbre === 'woodblock') {
        // 木鱼：方波短促敲击（首拍 1800Hz、其余 900Hz），音量减半防刺耳
        osc.type = 'square';
        osc.frequency.setValueAtTime(info.isAccent ? 1800 : 900, time);
        g.gain.setValueAtTime(0.0001, time);
        g.gain.exponentialRampToValueAtTime(p.gain * 0.5, time + 0.003);
        g.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);
        osc.start(time);
        osc.stop(time + 0.05);
    } else {
        // click / sine：正弦短促 click；sine 档稍长（0.09s）、稍柔（×0.8）
        osc.type = 'sine';
        osc.frequency.setValueAtTime(p.frequency, time);
        var d = state.timbre === 'sine' ? 0.09 : dur;
        var peak = state.timbre === 'sine' ? p.gain * 0.8 : p.gain;
        g.gain.setValueAtTime(0.0001, time);
        g.gain.exponentialRampToValueAtTime(peak, time + 0.003);
        g.gain.exponentialRampToValueAtTime(0.0001, time + d);
        osc.start(time);
        osc.stop(time + d + 0.02);
    }
    osc.connect(g);
    g.connect(state.masterGain);
    // 视觉闪烁与音频时钟对齐：按音频时间换算延迟后点亮当前拍
    var delay = Math.max(0, (time - state.actx.currentTime) * 1000);
    setTimeout(function () { flashBeat(info.beat, info.isAccent); }, delay);
}

// 前瞻调度：每 25ms 检查一次，把未来 0.1s 内的拍全部排进音频时钟
function scheduler() {
    if (!state.running || !state.actx) return;
    var intervalMs = bpmToIntervalMs(state.bpm);
    while (state.nextNoteTime < state.actx.currentTime + SCHEDULE_AHEAD_S) {
        scheduleClick(state.beatCount, state.nextNoteTime);
        state.nextNoteTime = nextBeatTime(state.nextNoteTime, intervalMs);
        state.beatCount++;
    }
}

/* ================= 启停 ================= */

function start() {
    if (!ensureActx()) return;
    if (state.actx.state === 'suspended') state.actx.resume();
    state.running = true;
    state.beatCount = 0;
    state.nextNoteTime = state.actx.currentTime + 0.06;
    state.timerId = setInterval(scheduler, LOOKAHEAD_MS);
    el.start.textContent = '⏹ 停止';
    el.start.classList.add('mt-btn-stop');
    setStatus('▶ 节拍进行中：' + state.bpm + ' BPM，' + state.beatsPerBar + ' 拍/小节（首拍重音 ' + ACCENT_FREQ + 'Hz，其余 ' + BEAT_FREQ + 'Hz）');
}

function stop() {
    state.running = false;
    if (state.timerId) { clearInterval(state.timerId); state.timerId = 0; }
    el.start.textContent = '▶ 开始';
    el.start.classList.remove('mt-btn-stop');
    clearFlash();
    setStatus('⏸ 已停止（当前 ' + state.bpm + ' BPM，点「开始」继续）');
}

function toggleStart() {
    if (state.running) stop();
    else start();
}

/* ================= 视觉闪烁 ================= */

function buildDots() {
    el.beat_dots.innerHTML = '';
    for (var i = 0; i < state.beatsPerBar; i++) {
        var d = document.createElement('span');
        d.className = 'mt-dot' + (i === 0 ? ' mt-dot-first' : '');
        d.textContent = (i + 1);
        el.beat_dots.appendChild(d);
    }
    if (el.beat_label) el.beat_label.textContent = '第 – 拍 / 共 ' + state.beatsPerBar + ' 拍';
}

function flashBeat(beat, isAccent) {
    var dots = el.beat_dots.children;
    for (var i = 0; i < dots.length; i++) {
        dots[i].classList.toggle('mt-on', i + 1 === beat);
        dots[i].classList.toggle('mt-on-accent', i + 1 === beat && isAccent);
    }
    if (el.beat_label) el.beat_label.textContent = '第 ' + beat + ' 拍 / 共 ' + state.beatsPerBar + ' 拍' + (isAccent ? '（重音）' : '');
    if (el.flash) {
        el.flash.classList.remove('mt-pulse', 'mt-pulse-accent');
        void el.flash.offsetWidth; // 强制重排，使动画可重复触发
        el.flash.classList.add(isAccent ? 'mt-pulse-accent' : 'mt-pulse');
    }
}

function clearFlash() {
    var dots = el.beat_dots.children;
    for (var i = 0; i < dots.length; i++) dots[i].classList.remove('mt-on', 'mt-on-accent');
    if (el.flash) el.flash.classList.remove('mt-pulse', 'mt-pulse-accent');
    if (el.beat_label) el.beat_label.textContent = '第 – 拍 / 共 ' + state.beatsPerBar + ' 拍';
}

/* ================= BPM 控制 ================= */

function syncBpmInputs() {
    el.bpm_display.textContent = state.bpm;
    el.bpm_slider.value = state.bpm;
    el.bpm_input.value = state.bpm;
}

function setBpm(v) {
    try { validateBpm(v); }
    catch (e) {
        setStatus('❌ BPM 须为 40–208 的整数（当前 ' + state.bpm + ' BPM 未变）');
        syncBpmInputs();
        return false;
    }
    state.bpm = v;
    syncBpmInputs();
    if (state.running) setStatus('▶ 节拍进行中：' + v + ' BPM，' + state.beatsPerBar + ' 拍/小节（首拍重音 ' + ACCENT_FREQ + 'Hz，其余 ' + BEAT_FREQ + 'Hz）');
    else setStatus('就绪：' + v + ' BPM，' + state.beatsPerBar + ' 拍/小节，点「开始」打拍子');
    return true;
}

function stepBpm(delta) {
    setBpm(state.bpm + delta);
}

/* ================= Tap 测速 ================= */

function onTap() {
    var now = performance.now();
    var taps = state.tapTimes;
    if (taps.length > 0 && now - taps[taps.length - 1] > TAP_MAX_GAP_MS) {
        taps.length = 0;
        setTapStatus('⏱ 两次点按间隔超过 2 秒，已重新开始计时');
    }
    taps.push(now);
    if (taps.length < TAP_MIN_TAPS) {
        setTapStatus('👆 已点按 ' + taps.length + ' 次，再点 ' + (TAP_MIN_TAPS - taps.length) + ' 次即可测速（跟随音乐稳定点按）');
        return;
    }
    var intervals = [];
    for (var i = 1; i < taps.length; i++) intervals.push(taps[i] - taps[i - 1]);
    var raw;
    try { raw = tapToBpm(intervals); }
    catch (e) { setTapStatus('❌ ' + e.message); taps.length = 0; return; }
    var sum = 0;
    for (var j = 0; j < intervals.length; j++) sum += intervals[j];
    var avgMs = Math.round(sum / intervals.length);
    var bpm = Math.round(raw);
    taps.length = 0;
    try { validateBpm(bpm); }
    catch (e) {
        // 超限明确提示，不自动钳制：当前 BPM 保持不变
        setTapStatus('⚠️ 测得约 ' + bpm + ' BPM，超出节拍器 40–208 BPM 可用范围，请放慢/加快点按速度后重试（未自动钳制，当前 ' + state.bpm + ' BPM 未变）');
        return;
    }
    setBpm(bpm);
    setTapStatus('✅ Tap 测速：约 ' + bpm + ' BPM（' + intervals.length + ' 个间隔平均 ' + avgMs + ' ms，仅供参考）');
}

/* ================= 初始化 ================= */

function bindGroup(container, attr, activeClass, onPick) {
    var btns = container.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
        btns[i].addEventListener('click', (function (btn) {
            return function () {
                for (var k = 0; k < btns.length; k++) btns[k].classList.remove(activeClass);
                btn.classList.add(activeClass);
                onPick(btn.getAttribute(attr));
            };
        })(btns[i]));
    }
}

function init() {
    buildDots();
    syncBpmInputs();
    setStatus('就绪：' + state.bpm + ' BPM，' + state.beatsPerBar + ' 拍/小节，点「开始」打拍子');

    el.start.addEventListener('click', toggleStart);

    el.bpm_slider.addEventListener('input', function () {
        setBpm(parseInt(el.bpm_slider.value, 10));
    });
    el.bpm_input.addEventListener('change', function () {
        var v = parseInt(el.bpm_input.value, 10);
        if (isNaN(v)) { setStatus('❌ BPM 请输入 40–208 的整数（当前 ' + state.bpm + ' BPM 未变）'); syncBpmInputs(); return; }
        setBpm(v);
    });
    el.step_m5.addEventListener('click', function () { stepBpm(-5); });
    el.step_m1.addEventListener('click', function () { stepBpm(-1); });
    el.step_p1.addEventListener('click', function () { stepBpm(1); });
    el.step_p5.addEventListener('click', function () { stepBpm(5); });

    bindGroup(el.presets, 'data-bpm', 'mt-active', function (v) { setBpm(parseInt(v, 10)); });
    bindGroup(el.sig, 'data-beats', 'mt-active', function (v) {
        state.beatsPerBar = parseInt(v, 10);
        if (state.running) state.beatCount = 0; // 切换拍号后从新小节首拍开始
        buildDots();
        setStatus(state.running
            ? '▶ 节拍进行中：' + state.bpm + ' BPM，' + state.beatsPerBar + ' 拍/小节（已从新小节首拍开始）'
            : '就绪：' + state.bpm + ' BPM，' + state.beatsPerBar + ' 拍/小节，点「开始」打拍子');
    });
    bindGroup(el.timbre, 'data-timbre', 'mt-active', function (v) {
        state.timbre = v;
        setStatus('音色已切换为「' + (TIMBRE_LABELS[v] || v) + '」' + (state.running ? '（下一拍起生效）' : ''));
    });

    el.tap.addEventListener('click', onTap);
    el.volume.addEventListener('input', function () {
        state.volume = parseInt(el.volume.value, 10) / 100;
        el.volume_val.textContent = el.volume.value + '%';
        if (state.masterGain) state.masterGain.gain.value = state.muted ? 0 : state.volume;
    });
    el.mute.addEventListener('click', function () {
        state.muted = !state.muted;
        el.mute.textContent = state.muted ? '🔇 已静音' : '🔊 静音';
        if (state.masterGain) state.masterGain.gain.value = state.muted ? 0 : state.volume;
    });

    // 键盘：空格启停，↑/↓ 调 BPM（Shift 加 5）；焦点在输入框/按钮/滑杆时交给原生行为
    document.addEventListener('keydown', function (ev) {
        var tag = (ev.target && ev.target.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return;
        if (ev.code === 'Space' || ev.key === ' ') { ev.preventDefault(); toggleStart(); }
        else if (ev.key === 'ArrowUp') { ev.preventDefault(); stepBpm(ev.shiftKey ? 5 : 1); }
        else if (ev.key === 'ArrowDown') { ev.preventDefault(); stepBpm(ev.shiftKey ? -5 : -1); }
    });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

})();
