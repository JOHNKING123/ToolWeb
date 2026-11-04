/* 在线可弹钢琴 - 纯前端 Web Audio 合成钢琴
 *
 * 流程：黑白键 UI（默认 C3–E5 共 29 键：17 白键＋12 黑键，触摸/点击/PC 键盘发声）
 * → Web Audio API 实时合成琴音（Oscillator 基频＋泛音＋指数衰减包络，免外部音色文件；
 *   钢琴/电钢琴/风琴 3 种合成音色）→ 八度切换（移动 29 键窗口：C2–E4 ～ C5–E7）＋音量控制
 * → 简易录音（音符＋时间戳，回放/清空，localStorage 保存最近一次录音）
 * → 一键自动弹奏《小星星》《欢乐颂》示范旋律 → 一键复制录音数据（JSON）。
 *
 * 全程无网络请求：无后端调用、无第三方依赖、无 CDN。发声只做浏览器端。
 * 纯函数（noteToFreq / keyToNote / buildKeyRange / serializeRecording / parseRecording /
 * pcLabelForNote）在 node 下可单元测试；非法参数抛 Error 且 err.field 命名（不静默钳制）。
 */
(function () {
'use strict';

/* ================= 纯函数 ================= */

var NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
var SEMI_BASE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function fieldError(field, msg) {
    var e = new Error(msg);
    e.field = field;
    return e;
}

// 解析音名 → {semitone: 0-11, octave}；非法格式抛 err.field='note'
function parseNote(note) {
    if (typeof note !== 'string') throw fieldError('note', '音名必须为字符串');
    var m = /^([A-Ga-g])(#|b)?([0-8])$/.exec(note.replace(/\s+/g, ''));
    if (!m) throw fieldError('note', '非法音名格式: ' + note);
    var semi = SEMI_BASE[m[1].toUpperCase()] + (m[2] === '#' ? 1 : (m[2] === 'b' ? -1 : 0));
    var oct = parseInt(m[3], 10);
    if (semi < 0) { semi += 12; oct -= 1; }
    if (semi > 11) { semi -= 12; oct += 1; }
    return { semitone: semi, octave: oct };
}

// 音名 → 频率 Hz（A4=440，十二平均律）；非法音名 err.field='note'
function noteToFreq(note) {
    var p = parseNote(note);
    var midi = (p.octave + 1) * 12 + p.semitone; // C4 → 60
    return 440 * Math.pow(2, (midi - 69) / 12);
}

// PC 键盘 → 音名（标准布局：A 行白键、W/E/T/Y/U 黑键；K/L/; 与 O/P 为高八度延续）
// 映射外键返回 null；baseOctave 非 0–8 整数 err.field='octave'
var KEY_OFFSET = {
    'A': 0, 'W': 1, 'S': 2, 'E': 3, 'D': 4, 'F': 5, 'T': 6, 'G': 7,
    'Y': 8, 'H': 9, 'U': 10, 'J': 11, 'K': 12, 'O': 13, 'L': 14, 'P': 15, ';': 16
};
var OFFSET_KEY = {};
Object.keys(KEY_OFFSET).forEach(function (k) { OFFSET_KEY[KEY_OFFSET[k]] = k; });

function assertBaseOctave(baseOctave) {
    if (typeof baseOctave !== 'number' || !isFinite(baseOctave) ||
        Math.floor(baseOctave) !== baseOctave || baseOctave < 0 || baseOctave > 8) {
        throw fieldError('octave', 'baseOctave 必须为 0–8 的整数');
    }
}

function keyToNote(key, baseOctave) {
    assertBaseOctave(baseOctave);
    if (typeof key !== 'string' || key.length !== 1) return null;
    var off = KEY_OFFSET[key.toUpperCase()];
    if (off === undefined) return null;
    return NOTE_NAMES[off % 12] + (baseOctave + Math.floor(off / 12));
}

// 键盘窗口内某音符对应的 PC 键帽标签（窗口起始八度 startOctave 时）；窗口外返回 ''
function pcLabelForNote(note, startOctave) {
    assertBaseOctave(startOctave);
    var p;
    try { p = parseNote(note); } catch (e) { return ''; }
    var off = (p.octave - startOctave) * 12 + p.semitone;
    return OFFSET_KEY[off] || '';
}

// 构建键位数组：octaves 为八度数组（如 [3,4] → C3–B4 共 24 键）
// 返回 [{note, type:'white'|'black'}...]；非法 err.field='octaves'
function buildKeyRange(octaves) {
    if (!Array.isArray(octaves) || octaves.length === 0) {
        throw fieldError('octaves', 'octaves 必须为非空八度数组');
    }
    octaves.forEach(function (o) {
        if (typeof o !== 'number' || !isFinite(o) || Math.floor(o) !== o || o < 0 || o > 8) {
            throw fieldError('octaves', '八度必须为 0–8 的整数');
        }
    });
    var keys = [];
    octaves.forEach(function (oct) {
        for (var s = 0; s < 12; s++) {
            var name = NOTE_NAMES[s];
            keys.push({ note: name + oct, type: name.indexOf('#') === -1 ? 'white' : 'black' });
        }
    });
    return keys;
}

// 录音序列化：events=[{note, timeMs}] → JSON 字符串
// note 非法 err.field='note'；timeMs<0/非数字 err.field='timeMs'；非数组 err.field='recording'
function serializeRecording(events) {
    if (!Array.isArray(events)) throw fieldError('recording', '录音事件必须为数组');
    var out = events.map(function (ev) {
        if (!ev || typeof ev !== 'object') throw fieldError('recording', '录音事件格式非法');
        parseNote(ev.note); // 非法音名 → field='note'
        if (typeof ev.timeMs !== 'number' || !isFinite(ev.timeMs) || ev.timeMs < 0) {
            throw fieldError('timeMs', 'timeMs 必须为 ≥0 的数字');
        }
        return { note: ev.note, timeMs: ev.timeMs };
    });
    return JSON.stringify(out);
}

// 录音反序列化：JSON 字符串 → [{note, timeMs}]
// JSON 非法/非数组 err.field='recording'；note/timeMs 非法沿用各自 field
function parseRecording(json) {
    var data;
    try {
        data = JSON.parse(json);
    } catch (e) {
        throw fieldError('recording', '录音 JSON 解析失败');
    }
    if (!Array.isArray(data)) throw fieldError('recording', '录音数据必须为数组');
    data.forEach(function (ev) {
        if (!ev || typeof ev !== 'object') throw fieldError('recording', '录音事件格式非法');
        parseNote(ev.note);
        if (typeof ev.timeMs !== 'number' || !isFinite(ev.timeMs) || ev.timeMs < 0) {
            throw fieldError('timeMs', 'timeMs 必须为 ≥0 的数字');
        }
    });
    return data.map(function (ev) { return { note: ev.note, timeMs: ev.timeMs }; });
}

var OnlinePiano = {
    noteToFreq: noteToFreq,
    keyToNote: keyToNote,
    buildKeyRange: buildKeyRange,
    serializeRecording: serializeRecording,
    parseRecording: parseRecording,
    pcLabelForNote: pcLabelForNote
};

/* ================= 浏览器端：音频引擎 + UI ================= */

if (typeof window === 'undefined') {
    // node 环境：只导出纯函数
    if (typeof module !== 'undefined' && module.exports) module.exports = OnlinePiano;
    return;
}

window.OnlinePiano = OnlinePiano;

// 合成音色参数：基频波形＋泛音列＋指数衰减包络（算法模拟，非采样）
var TIMBRES = {
    piano:    { label: '钢琴',   type: 'triangle', harmonics: [[1, 1], [2, 0.45], [3, 0.22], [4, 0.10]], attack: 0.004, decay: 2.2 },
    electric: { label: '电钢琴', type: 'sine',     harmonics: [[1, 1], [2, 0.60], [3, 0.18], [4, 0.08]], attack: 0.008, decay: 3.5 },
    organ:    { label: '风琴',   type: 'sine',     harmonics: [[1, 1], [2, 0.55], [3, 0.35], [4, 0.22], [5, 0.12]], attack: 0.030, decay: 8.0 }
};

var LS_KEY = 'online_piano_last_rec';
var WHITE_W = 46; // 白键像素宽
var state = {
    startOctave: 3,      // 键盘窗口起始八度（C3–E5，共 29 键）
    timbre: 'piano',
    volume: 0.8,
    recording: false,
    recStart: 0,
    events: [],
    playing: false,
    playTimers: []
};

var ctx = null, master = null;

function $(id) { return document.getElementById(id); }

function ensureCtx() {
    if (!ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = state.volume * state.volume;
        master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
}

// 发声：note 音名，durSec 包络时长（默认按音色 decay）；fromUser=true 时计入录音
function playNote(note, durSec, fromUser) {
    var ac = ensureCtx();
    if (!ac) return;
    var freq;
    try { freq = noteToFreq(note); } catch (e) { return; }
    var tb = TIMBRES[state.timbre] || TIMBRES.piano;
    var dur = (typeof durSec === 'number' && durSec > 0) ? durSec : Math.min(tb.decay, 2.5);
    var t = ac.currentTime + 0.001;
    var peak = 0.5 / tb.harmonics.length;
    tb.harmonics.forEach(function (h) {
        var osc = ac.createOscillator();
        osc.type = tb.type;
        osc.frequency.value = freq * h[0];
        var g = ac.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(peak * h[1], t + tb.attack);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(g);
        g.connect(master);
        osc.start(t);
        osc.stop(t + dur + 0.05);
    });
    if (fromUser && state.recording) {
        state.events.push({ note: note, timeMs: Date.now() - state.recStart });
        renderRecStatus();
    }
    flashKey(note);
}

// 键位高亮（弹奏/回放时）
function flashKey(note) {
    var el = document.querySelector('[data-note="' + note + '"]');
    if (!el) return;
    el.classList.add('op-active');
    setTimeout(function () { el.classList.remove('op-active'); }, 180);
}

// 渲染 29 键键盘：C(s)–E(s+2) = buildKeyRange([s, s+1]) ＋ 顶部 C–E 半个八度
function renderKeyboard() {
    var s = state.startOctave;
    var keys = buildKeyRange([s, s + 1]);
    ['C', 'C#', 'D', 'D#', 'E'].forEach(function (n) {
        keys.push({ note: n + (s + 2), type: n.indexOf('#') === -1 ? 'white' : 'black' });
    });
    var box = $('op-keys');
    box.innerHTML = '';
    var wi = 0; // 白键序号
    keys.forEach(function (k) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = k.type === 'white' ? 'op-wkey' : 'op-bkey';
        b.setAttribute('data-note', k.note);
        b.setAttribute('aria-label', k.note);
        var label = pcLabelForNote(k.note, s);
        if (k.type === 'white') {
            b.style.left = (wi * WHITE_W) + 'px';
            b.innerHTML = '<span class="op-nn">' + k.note + '</span>' +
                (label ? '<span class="op-kb">' + label + '</span>' : '');
            wi++;
        } else {
            b.style.left = (wi * WHITE_W - 15) + 'px'; // 黑键宽 30，骑缝
        }
        var press = function (ev) {
            if (ev) ev.preventDefault();
            ensureCtx();
            playNote(k.note, 0, true);
            b.classList.add('op-active');
        };
        var release = function () { b.classList.remove('op-active'); };
        b.addEventListener('pointerdown', press);
        b.addEventListener('pointerup', release);
        b.addEventListener('pointerleave', release);
        b.addEventListener('pointercancel', release);
        box.appendChild(b);
    });
    box.style.width = (wi * WHITE_W) + 'px';
    $('op-oct-label').textContent = 'C' + s + '–E' + (s + 2) + '（29 键）';
    $('op-oct-down').disabled = s <= 2;
    $('op-oct-up').disabled = s >= 5;
}

// 录音状态行
function renderRecStatus() {
    var el = $('op-rec-status');
    if (state.recording) {
        el.textContent = '● 录音中…已录 ' + state.events.length + ' 个音符（点「停止录音」结束并保存到浏览器本地）';
        el.className = 'op-status op-recing';
    } else if (state.events.length) {
        el.textContent = '已录 ' + state.events.length + ' 个音符（已保存到浏览器本地，可回放/复制/清空）';
        el.className = 'op-status';
    } else {
        el.textContent = '还没录音：点「开始录音」后弹奏，音符＋时间戳会记下来';
        el.className = 'op-status';
    }
    $('op-play').disabled = state.playing || state.events.length === 0;
    $('op-clear').disabled = state.playing || state.events.length === 0;
    $('op-copy').disabled = state.events.length === 0;
}

// 回放录音（含 localStorage 兜底：events 为空时尝试载入上次保存）
function playEvents(events, done) {
    stopPlayback();
    if (!events || !events.length) return;
    ensureCtx();
    state.playing = true;
    renderRecStatus();
    $('op-play').textContent = '⏹ 停止回放';
    var start = Date.now();
    events.forEach(function (ev) {
        state.playTimers.push(setTimeout(function () {
            playNote(ev.note, 0, false);
        }, Math.max(0, ev.timeMs - (Date.now() - start))));
    });
    var total = events[events.length - 1].timeMs + 1200;
    state.playTimers.push(setTimeout(function () {
        stopPlayback();
        if (done) done();
    }, total));
}

function stopPlayback() {
    state.playTimers.forEach(clearTimeout);
    state.playTimers = [];
    if (state.playing) {
        state.playing = false;
        $('op-play').textContent = '▶ 回放录音';
        renderRecStatus();
    }
}

// 示范旋律：[音名, 拍数]
var DEMOS = {
    twinkle: {
        name: '小星星',
        notes: [['C4',1],['C4',1],['G4',1],['G4',1],['A4',1],['A4',1],['G4',2],
                ['F4',1],['F4',1],['E4',1],['E4',1],['D4',1],['D4',1],['C4',2]]
    },
    ode: {
        name: '欢乐颂',
        notes: [['E4',1],['E4',1],['F4',1],['G4',1],['G4',1],['F4',1],['E4',1],['D4',1],
                ['C4',1],['C4',1],['D4',1],['E4',1],['E4',1.5],['D4',0.5],['D4',2]]
    }
};

function playDemo(key) {
    var demo = DEMOS[key];
    if (!demo) return;
    var beat = 420, t = 0;
    var events = demo.notes.map(function (n) {
        var ev = { note: n[0], timeMs: t };
        t += n[1] * beat;
        return ev;
    });
    playEvents(events);
    $('op-demo-status').textContent = '正在弹奏《' + demo.name + '》…';
    var total = t + 1200;
    state.playTimers.push(setTimeout(function () {
        $('op-demo-status').textContent = '《' + demo.name + '》弹奏完毕';
    }, total));
}

function setStatus(msg) { $('op-status').textContent = msg; }

function init() {
    renderKeyboard();
    // 恢复上次录音
    try {
        var saved = localStorage.getItem(LS_KEY);
        if (saved) state.events = parseRecording(saved);
    } catch (e) { state.events = []; }
    renderRecStatus();

    $('op-oct-down').addEventListener('click', function () {
        if (state.startOctave > 2) { state.startOctave--; stopPlayback(); renderKeyboard(); }
    });
    $('op-oct-up').addEventListener('click', function () {
        if (state.startOctave < 5) { state.startOctave++; stopPlayback(); renderKeyboard(); }
    });
    $('op-timbre').addEventListener('change', function (e) {
        state.timbre = e.target.value;
        setStatus('已切换音色：' + (TIMBRES[state.timbre] || {}).label);
    });
    $('op-volume').addEventListener('input', function (e) {
        state.volume = e.target.value / 100;
        if (master) master.gain.value = state.volume * state.volume;
    });

    $('op-record').addEventListener('click', function () {
        ensureCtx();
        if (!state.recording) {
            state.recording = true;
            state.recStart = Date.now();
            state.events = [];
            this.textContent = '⏹ 停止录音';
            this.classList.add('op-btn-stop');
        } else {
            state.recording = false;
            this.textContent = '⏺ 开始录音';
            this.classList.remove('op-btn-stop');
            try { localStorage.setItem(LS_KEY, serializeRecording(state.events)); } catch (e) {}
            setStatus('录音已保存到浏览器本地（localStorage），共 ' + state.events.length + ' 个音符');
        }
        renderRecStatus();
    });
    $('op-play').addEventListener('click', function () {
        if (state.playing) { stopPlayback(); return; }
        playEvents(state.events);
    });
    $('op-clear').addEventListener('click', function () {
        stopPlayback();
        state.events = [];
        try { localStorage.removeItem(LS_KEY); } catch (e) {}
        renderRecStatus();
        setStatus('录音已清空（含浏览器本地保存）');
    });
    $('op-copy').addEventListener('click', function () {
        var text = serializeRecording(state.events);
        var done = function () { setStatus('录音数据已复制（' + state.events.length + ' 个音符的 JSON）'); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
        } else { fallbackCopy(text); done(); }
    });
    $('op-demo-twinkle').addEventListener('click', function () { playDemo('twinkle'); });
    $('op-demo-ode').addEventListener('click', function () { playDemo('ode'); });

    // PC 键盘映射（桌面浏览器；移动端以触摸为准）
    var downKeys = {};
    document.addEventListener('keydown', function (e) {
        if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
        var tag = (e.target && e.target.tagName) || '';
        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
        var note = keyToNote(e.key, state.startOctave);
        if (!note) return;
        e.preventDefault();
        if (downKeys[e.key]) return;
        downKeys[e.key] = true;
        ensureCtx();
        playNote(note, 0, true);
    });
    document.addEventListener('keyup', function (e) { delete downKeys[e.key]; });

    setStatus('点琴键或按键盘 A–; 弹奏（以当前八度窗口为准）');

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = OnlinePiano;
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
})();
