/* 唱歌音准检测（singing_pitch_checker）- 纯前端零上传练唱音准工具
* 自由练唱：麦克风实时音名＋偏差音分＋偏高／偏低／准指示；
* 目标音练习：目标音 C3–C6 可选（默认 A4），单音在容差内唱稳 0.5 秒计一次
* 成绩，累计平均偏差＋准音率（±25 音分内占比）＋S/A/B/C/D 分档；
* 基频检测：getUserMedia＋AnalyserNode 时域数据＋自相关（50–1000 Hz，
* 置信度阈值过滤静音／噪声）；音名–频率对照表 C3–C6；最近 10 次成绩
* 只存本机 localStorage，可一键清除。
* 真限制：① 自相关基频检测精度受环境噪声、麦克风质量、混响影响，低频／
*   高频边缘与快速滑音误差大，结果仅供练唱参考，不可作专业声乐鉴定；
*   ② 需麦克风权限，拒绝授权则无法实时检测，但音名–频率对照表仍可查；
*   ③ 有效检测范围约 50–1000 Hz（约 G1–B5），超出范围不显示音高；
*   ④ 全程浏览器本地计算，零上传；成绩只存本机 localStorage，换浏览器／
*   清缓存后丢失。
* 零网络请求：本文件不发起任何请求；渲染一律用 textContent，
* 输入里的 HTML 只显示为文本，不会执行。
* 浏览器与 node 测试共用同一纯函数；浏览器绑定只在有 document 时执行。
* 纯函数契约：挂 window.SingingPitchChecker，module.exports 同步导出；
* 非法参数抛 Error，err.field 给出字段名，不静默钳制。 */
(function () {
'use strict';

var NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
var SEMITONE_BASE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
var SP_FREQ_MIN = 50, SP_FREQ_MAX = 1000;
var SP_CONF_MIN = 0.8;
var SP_HOLD_MS = 500;
var SP_COOLDOWN_MS = 1500;
var SP_TOL_MIN = 5, SP_TOL_MAX = 100, SP_TOL_DEFAULT = 25;
var SP_TARGET_MIN_MIDI = 48, SP_TARGET_MAX_MIDI = 84;
var SP_IN_TUNE_CENTS = 25;
var SP_ON_PITCH_CENTS = 10;

function spErr(message, field) {
var e = new Error(message);
e.field = field;
return e;
}

function isFiniteNum(x) {
return typeof x === 'number' && isFinite(x);
}

function round2(x) {
return Math.round(x * 100) / 100;
}

function log2(x) {
return Math.log(x) / Math.log(2);
}

/* 频率 → MIDI 音高号（保留 2 位小数）。锚点 440→69、880→81、261.63→60。 */
function freqToMidi(freq) {
if (!isFiniteNum(freq) || freq <= 0) throw spErr('freq 须为 >0 的有限数字', 'freq');
return round2(69 + 12 * log2(freq / 440));
}

/* MIDI 音高号 → 频率（保留 2 位小数）。锚点 69→440、60→261.63、57→220。 */
function midiToFreq(midi) {
if (typeof midi !== 'number' || Math.floor(midi) !== midi || midi < 0 || midi > 127) throw spErr('midi 须为 0–127 的整数', 'midi');
return round2(440 * Math.pow(2, (midi - 69) / 12));
}

/* 频率 → 最近音：{name, octave, midi, cents}，cents 为与最近音的偏差
* （四舍五入整数，−50…+50）。锚点 440→{name:'A', octave:4, midi:69, cents:0}。 */
function freqToNoteName(freq) {
if (!isFiniteNum(freq) || freq <= 0) throw spErr('freq 须为 >0 的有限数字', 'freq');
var midi = Math.round(69 + 12 * log2(freq / 440));
if (midi < 0 || midi > 127) throw spErr('freq 超出可表示音高范围（MIDI 0–127）', 'freq');
var cents = Math.round(1200 * log2(freq / midiToFreq(midi))) + 0;
return { name: NOTE_NAMES[midi % 12], octave: Math.floor(midi / 12) - 1, midi: midi, cents: cents };
}

/* 两频率间音分差（四舍五入整数）。锚点 (880,440)→1200、(220,440)→−1200。 */
function centsBetween(freq, targetFreq) {
if (!isFiniteNum(freq) || freq <= 0 || !isFiniteNum(targetFreq) || targetFreq <= 0) throw spErr('freq 与 targetFreq 均须为 >0 的有限数字', 'frequency');
return Math.round(1200 * log2(freq / targetFreq)) + 0;
}

/* 音准分档（入参为绝对偏差音分）：≤10 S 完美／≤25 A 优秀／≤50 B 良好／
* ≤100 C 一般／>100 D 跑调。边界 10→S、11→A、25→A、26→B、50→B、51→C、100→C、101→D。 */
function gradePitch(centsAbs) {
if (!isFiniteNum(centsAbs) || centsAbs < 0) throw spErr('cents 须为 ≥0 的有限数字', 'cents');
if (centsAbs <= 10) return { grade: 'S', label: '完美' };
if (centsAbs <= 25) return { grade: 'A', label: '优秀' };
if (centsAbs <= 50) return { grade: 'B', label: '良好' };
if (centsAbs <= 100) return { grade: 'C', label: '一般' };
return { grade: 'D', label: '跑调' };
}

/* 一组练习成绩打分：{avgAbsCents, inTunePct, grade}。
* avgAbsCents 为平均绝对偏差（四舍五入整数）；inTunePct 为 |cents|≤25
* 占比（四舍五入整数百分比）；grade 取 gradePitch(avgAbsCents)。
* 锚点 [0,10,20,50]→{avgAbsCents:20, inTunePct:75, grade:{grade:'A', label:'优秀'}}。 */
function scorePitchSession(centsList) {
if (!Array.isArray(centsList) || centsList.length === 0) throw spErr('samples 须为非空数组', 'samples');
var sum = 0, inTune = 0;
for (var i = 0; i < centsList.length; i++) {
var v = centsList[i];
if (!isFiniteNum(v)) throw spErr('第 ' + (i + 1) + ' 个样本非法（须为有限数字）', 'samples');
sum += Math.abs(v);
if (Math.abs(v) <= SP_IN_TUNE_CENTS) inTune++;
}
var avgAbsCents = Math.round(sum / centsList.length);
var inTunePct = Math.round(100 * inTune / centsList.length);
return { avgAbsCents: avgAbsCents, inTunePct: inTunePct, grade: gradePitch(avgAbsCents) };
}

/* 音名解析：接受 "A4"／"C#5"／"Gb3"，大小写不敏感，b 为降号；
* 返回规范化 {name, octave, midi}（name 取升号拼写）。锚点 "A4"→{name:'A', octave:4, midi:69}。 */
function parseNoteName(noteStr) {
if (typeof noteStr !== 'string') throw spErr('note 须为字符串', 'note');
var s = noteStr.replace(/^\s+|\s+$/g, '');
var m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(s);
if (!m) throw spErr('note 须为音名＋八度，如 A4、C#5、Gb3', 'note');
var letter = m[1].toUpperCase();
var semitone = SEMITONE_BASE[letter];
if (m[2] === '#') semitone += 1;
else if (m[2] === 'b') semitone -= 1;
var octave = parseInt(m[3], 10);
var midi = (octave + 1) * 12 + semitone;
if (midi < 0 || midi > 127) throw spErr('note 超出 MIDI 0–127 范围', 'note');
return { name: NOTE_NAMES[((midi % 12) + 12) % 12], octave: Math.floor(midi / 12) - 1, midi: midi };
}

/* 配置校验：缺省 → {mode:'free', targetNote:'A4', tolerance:25}；
* mode 只认 free／target；target 模式须有合法 targetNote（C3–C6）；
* tolerance 只认 5–100 的有限数。返回归一化副本，不修改入参。 */
function validatePitchConfig(config) {
if (config === undefined || config === null) return { mode: 'free', targetNote: 'A4', tolerance: SP_TOL_DEFAULT };
if (typeof config !== 'object' || Array.isArray(config)) throw spErr('config 须为对象', 'config');
var mode = config.mode;
if (mode === undefined) mode = 'free';
if (mode !== 'free' && mode !== 'target') throw spErr('mode 只支持 free／target', 'mode');
var targetNote = config.targetNote;
if (mode === 'target' && (targetNote === undefined || targetNote === null || targetNote === '')) throw spErr('target 模式须指定 targetNote', 'targetNote');
if (targetNote === undefined || targetNote === null || targetNote === '') targetNote = 'A4';
var parsed;
try {
parsed = parseNoteName(targetNote);
} catch (e) {
throw spErr('targetNote 非法：' + e.message, 'targetNote');
}
if (parsed.midi < SP_TARGET_MIN_MIDI || parsed.midi > SP_TARGET_MAX_MIDI) throw spErr('targetNote 只支持 C3–C6', 'targetNote');
var tolerance = config.tolerance;
if (tolerance === undefined || tolerance === null) tolerance = SP_TOL_DEFAULT;
if (!isFiniteNum(tolerance) || tolerance < SP_TOL_MIN || tolerance > SP_TOL_MAX) throw spErr('tolerance 只支持 5–100', 'tolerance');
return { mode: mode, targetNote: parsed.name + parsed.octave, tolerance: tolerance };
}

/* 状态校验：state.samples 须为数组，每项须为有限数，长度 ≤600（约 10 秒采样）。
* 返回归一化副本，不修改入参。 */
function validatePitchState(state) {
if (!state || typeof state !== 'object' || Array.isArray(state)) throw spErr('state 须为对象', 'state');
var samples = state.samples;
if (!Array.isArray(samples)) throw spErr('samples 须为数组', 'samples');
if (samples.length > 600) throw spErr('samples 长度不可超过 600', 'samples');
for (var i = 0; i < samples.length; i++) {
if (!isFiniteNum(samples[i])) throw spErr('第 ' + (i + 1) + ' 个样本非法（须为有限数字）', 'samples');
}
return { samples: samples.slice() };
}

/* 音分格式化：0→"0 音分"、12→"+12 音分"、−8→"-8 音分"、12.6→"+13 音分"。 */
function formatCents(cents) {
if (!isFiniteNum(cents)) throw spErr('cents 须为有限数字', 'cents');
var n = Math.round(cents) + 0;
if (n === 0) return '0 音分';
return (n > 0 ? '+' : '') + n + ' 音分';
}

/* 时域自相关基频检测（纯函数，浏览器与 node 测试共用）：
* buffer 为时域采样数组（Float32Array 或 Array，长度 ≥1024），
* sampleRate 为采样率。返回 {freq, confidence}，或 null（静音／噪声／
* 超出 50–1000 Hz 有效范围）。去直流＋RMS 静音门限＋首个局部峰法
* （取 ≥0.9×最大相关的首个局部峰，避免倍频程误判）＋抛物线插值细化。 */
function detectPitch(buffer, sampleRate) {
if (!buffer || typeof buffer.length !== 'number' || buffer.length < 1024) throw spErr('buffer 须为长度 ≥1024 的采样数组', 'buffer');
if (!isFiniteNum(sampleRate) || sampleRate <= 0) throw spErr('sampleRate 须为 >0 的有限数字', 'sampleRate');
var n = buffer.length;
var mean = 0, i, v;
for (i = 0; i < n; i++) {
v = buffer[i];
if (!isFiniteNum(v)) throw spErr('buffer 第 ' + (i + 1) + ' 个采样非法（须为有限数字）', 'buffer');
mean += v;
}
mean /= n;
var sumSq = 0;
for (i = 0; i < n; i++) { v = buffer[i] - mean; sumSq += v * v; }
var rms = Math.sqrt(sumSq / n);
if (rms < 0.01) return null;
var lagMin = Math.max(1, Math.floor(sampleRate / SP_FREQ_MAX));
var lagMax = Math.min(n - 2, Math.ceil(sampleRate / SP_FREQ_MIN));
var corrs = new Array(lagMax + 2);
var lag, j, c;
var bestCorr = -Infinity;
for (lag = lagMin; lag <= lagMax; lag++) {
c = 0;
for (j = 0; j < n - lag; j++) c += (buffer[j] - mean) * (buffer[j + lag] - mean);
c = c / (n - lag);
corrs[lag] = c;
if (c > bestCorr) bestCorr = c;
}
var confidence = bestCorr / (rms * rms);
if (confidence < SP_CONF_MIN) return null;
/* 首个局部峰：从小滞后向大扫描，首个相关 ≥0.9×最大相关且为局部峰的滞后即基频周期 */
var threshold = bestCorr * 0.9;
var bestLag = -1;
for (lag = lagMin; lag <= lagMax; lag++) {
var left = (lag > lagMin) ? corrs[lag - 1] : -Infinity;
var right = (lag < lagMax) ? corrs[lag + 1] : -Infinity;
if (corrs[lag] >= threshold && corrs[lag] >= left && corrs[lag] >= right) { bestLag = lag; break; }
}
if (bestLag === -1) {
/* 退化：取全局最大相关滞后 */
bestLag = lagMin;
for (lag = lagMin + 1; lag <= lagMax; lag++) {
if (corrs[lag] > corrs[bestLag]) bestLag = lag;
}
}
/* 抛物线插值细化滞后 */
var shift = 0;
if (bestLag > lagMin && bestLag < lagMax) {
var y0 = corrs[bestLag - 1], y1 = corrs[bestLag], y2 = corrs[bestLag + 1];
var denom = y0 - 2 * y1 + y2;
if (denom !== 0) shift = 0.5 * (y0 - y2) / denom;
if (shift > 1) shift = 1;
if (shift < -1) shift = -1;
}
var freq = sampleRate / (bestLag + shift);
if (freq < SP_FREQ_MIN || freq > SP_FREQ_MAX) return null;
return { freq: Math.round(freq * 10) / 10, confidence: Math.round(confidence * 1000) / 1000 };
}

var api = {
freqToMidi: freqToMidi,
midiToFreq: midiToFreq,
freqToNoteName: freqToNoteName,
centsBetween: centsBetween,
gradePitch: gradePitch,
scorePitchSession: scorePitchSession,
parseNoteName: parseNoteName,
validatePitchConfig: validatePitchConfig,
validatePitchState: validatePitchState,
formatCents: formatCents,
detectPitch: detectPitch
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.SingingPitchChecker = api;

/* ---------------- 浏览器绑定（仅有 document 时执行） ---------------- */
if (typeof document !== 'undefined') {
var SP_HIST_KEY = 'singing_pitch_checker_history_v1', SP_HIST_MAX = 10;

function $(id) { return document.getElementById(id); }

function loadHistory() {
try {
var raw = window.localStorage.getItem(SP_HIST_KEY);
if (!raw) return [];
var h = JSON.parse(raw);
return Array.isArray(h) ? h : [];
} catch (e) { return []; }
}

function saveHistory(list) {
try { window.localStorage.setItem(SP_HIST_KEY, JSON.stringify(list.slice(0, SP_HIST_MAX))); } catch (e) {}
}

var state = {
running: false,
config: { mode: 'free', targetNote: 'A4', tolerance: SP_TOL_DEFAULT },
stream: null,
audioCtx: null,
analyser: null,
buf: null,
rafId: 0,
stableStart: 0,
stableSamples: [],
lastScoreAt: 0,
scores: loadHistory()
};

function fmtTime(d) {
function p(x) { return (x < 10 ? '0' : '') + x; }
return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function showError(msg) {
var el = $('sp-error');
if (!el) return;
if (msg) { el.textContent = msg; el.style.display = 'block'; }
else { el.textContent = ''; el.style.display = 'none'; }
}

function setStatus(msg) {
var el = $('sp-status');
if (el) el.textContent = msg;
}

function setMode(mode) {
var cfg;
try { cfg = api.validatePitchConfig({ mode: mode, targetNote: state.config.targetNote, tolerance: state.config.tolerance }); } catch (e) { return; }
state.config = cfg;
state.stableStart = 0;
state.stableSamples = [];
var freeBtn = $('sp-mode-free'), targetBtn = $('sp-mode-target');
if (freeBtn) { freeBtn.classList.toggle('sp-active', mode === 'free'); freeBtn.setAttribute('aria-pressed', mode === 'free' ? 'true' : 'false'); }
if (targetBtn) { targetBtn.classList.toggle('sp-active', mode === 'target'); targetBtn.setAttribute('aria-pressed', mode === 'target' ? 'true' : 'false'); }
var panel = $('sp-target-panel');
if (panel) panel.style.display = (mode === 'target') ? 'block' : 'none';
renderSession();
}

function buildTargetOptions() {
var sel = $('sp-target-note');
if (!sel) return;
sel.textContent = '';
for (var midi = SP_TARGET_MIN_MIDI; midi <= SP_TARGET_MAX_MIDI; midi++) {
var opt = document.createElement('option');
var note = api.freqToNoteName(api.midiToFreq(midi));
opt.value = note.name + note.octave;
opt.textContent = note.name + note.octave + '（' + api.midiToFreq(midi) + ' Hz）';
if (opt.value === state.config.targetNote) opt.selected = true;
sel.appendChild(opt);
}
}

function buildNoteTable() {
var body = $('sp-note-table');
if (!body) return;
body.textContent = '';
for (var midi = SP_TARGET_MIN_MIDI; midi <= SP_TARGET_MAX_MIDI; midi++) {
var note = api.freqToNoteName(api.midiToFreq(midi));
var tr = document.createElement('tr');
var tdN = document.createElement('td');
tdN.appendChild(document.createTextNode(note.name + note.octave));
var tdF = document.createElement('td');
tdF.appendChild(document.createTextNode(String(api.midiToFreq(midi))));
var tdA = document.createElement('td');
var btn = document.createElement('button');
btn.type = 'button';
btn.className = 'sp-btn sp-btn-small';
btn.setAttribute('data-note', note.name + note.octave);
btn.appendChild(document.createTextNode('设为目标音'));
btn.addEventListener('click', function () {
setTargetNote(this.getAttribute('data-note'));
setMode('target');
});
tdA.appendChild(btn);
tr.appendChild(tdN); tr.appendChild(tdF); tr.appendChild(tdA);
body.appendChild(tr);
}
}

function setTargetNote(noteStr) {
var cfg;
try { cfg = api.validatePitchConfig({ mode: state.config.mode, targetNote: noteStr, tolerance: state.config.tolerance }); } catch (e) { return; }
state.config = cfg;
state.stableStart = 0;
state.stableSamples = [];
var sel = $('sp-target-note');
if (sel) sel.value = cfg.targetNote;
var tf = $('sp-target-freq');
if (tf) tf.textContent = String(api.midiToFreq(api.parseNoteName(cfg.targetNote).midi)) + ' Hz';
}

function renderReading(note, freq) {
var big = $('sp-note');
if (big) big.textContent = note ? (note.name + note.octave) : '—';
var f = $('sp-freq');
if (f) f.textContent = note ? (String(freq) + ' Hz') : '—';
var c = $('sp-cents');
if (c) c.textContent = note ? api.formatCents(note.cents) : '—';
var ind = $('sp-indicator');
if (ind) {
if (!note) { ind.textContent = '未检测到音高'; ind.className = 'sp-indicator'; }
else if (Math.abs(note.cents) <= SP_ON_PITCH_CENTS) { ind.textContent = '准 ✓'; ind.className = 'sp-indicator sp-good'; }
else if (note.cents > 0) { ind.textContent = '偏高 ↑'; ind.className = 'sp-indicator sp-high'; }
else { ind.textContent = '偏低 ↓'; ind.className = 'sp-indicator sp-low'; }
}
var needle = $('sp-cents-needle');
if (needle) {
var pos = note ? Math.max(-100, Math.min(100, note.cents)) : 0;
needle.style.left = 'calc(' + ((pos + 100) / 2) + '% - 2px)';
needle.style.display = note ? 'block' : 'none';
}
var gradeEl = $('sp-live-grade');
if (gradeEl) {
if (!note) gradeEl.textContent = '—';
else { var g = api.gradePitch(Math.abs(note.cents)); gradeEl.textContent = g.grade + ' · ' + g.label; }
}
}

function drawWave() {
var cv = $('sp-wave');
if (!cv || !state.analyser) return;
var ctx = cv.getContext('2d');
if (!ctx) return;
var w = cv.width, h = cv.height;
ctx.clearRect(0, 0, w, h);
ctx.strokeStyle = '#2563eb';
ctx.lineWidth = 2;
ctx.beginPath();
var mid = h / 2;
for (var i = 0; i < state.buf.length; i++) {
var x = (i / (state.buf.length - 1)) * w;
var y = mid - state.buf[i] * (h / 2 - 4);
if (i === 0) ctx.moveTo(x, y);
else ctx.lineTo(x, y);
}
ctx.stroke();
}

function recordScore(meanCents) {
var cents = Math.round(meanCents);
var g = api.gradePitch(Math.abs(cents));
var rec = { cents: cents, grade: g.grade, targetNote: state.config.targetNote, time: fmtTime(new Date()) };
state.scores.unshift(rec);
state.scores = state.scores.slice(0, SP_HIST_MAX);
saveHistory(state.scores);
renderSession();
renderHistory();
var el = $('sp-last-score');
if (el) el.textContent = '已计分：' + state.config.targetNote + ' ' + api.formatCents(cents) + '（' + g.grade + ' · ' + g.label + '）';
}

function renderSession() {
var panel = $('sp-session');
if (!panel) return;
var n = $('sp-session-count');
if (n) n.textContent = String(state.scores.length);
var avg = $('sp-session-avg'), pct = $('sp-session-intune'), gr = $('sp-session-grade');
if (state.scores.length === 0) {
if (avg) avg.textContent = '—';
if (pct) pct.textContent = '—';
if (gr) gr.textContent = '—';
return;
}
var s = api.scorePitchSession(state.scores.map(function (r) { return r.cents; }));
if (avg) avg.textContent = s.avgAbsCents + ' 音分';
if (pct) pct.textContent = s.inTunePct + '%';
if (gr) gr.textContent = s.grade.grade + ' · ' + s.grade.label;
}

function renderHistory() {
var box = $('sp-history');
if (!box) return;
box.textContent = '';
if (state.scores.length === 0) {
box.textContent = '暂无成绩：目标音模式下单音唱稳 0.5 秒自动计分';
box.style.color = '#9ca3af';
return;
}
box.style.color = '';
state.scores.forEach(function (r) {
var row = document.createElement('div');
row.className = 'sp-hist-row';
var a = document.createElement('span'); a.className = 'r';
var g = api.gradePitch(Math.abs(r.cents));
a.appendChild(document.createTextNode(r.targetNote + ' ' + api.formatCents(r.cents) + ' · ' + g.grade + ' ' + g.label));
var t = document.createElement('span'); t.className = 't';
t.appendChild(document.createTextNode(r.time || ''));
row.appendChild(a); row.appendChild(t);
box.appendChild(row);
});
}

function tick() {
if (!state.running) return;
state.rafId = requestAnimationFrame(tick);
if (!state.analyser) return;
state.analyser.getFloatTimeDomainData(state.buf);
drawWave();
var res = null;
try { res = api.detectPitch(state.buf, state.analyser.context.sampleRate); } catch (e) { res = null; }
if (!res) {
renderReading(null, 0);
state.stableStart = 0;
state.stableSamples = [];
return;
}
var note = api.freqToNoteName(res.freq);
renderReading(note, res.freq);
if (state.config.mode !== 'target') { state.stableStart = 0; state.stableSamples = []; return; }
var now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
if (now - state.lastScoreAt < SP_COOLDOWN_MS) { state.stableStart = 0; state.stableSamples = []; return; }
if (Math.abs(note.cents) <= state.config.tolerance) {
if (state.stableStart === 0) { state.stableStart = now; state.stableSamples = [note.cents]; }
else state.stableSamples.push(note.cents);
if (now - state.stableStart >= SP_HOLD_MS) {
var sum = 0;
for (var i = 0; i < state.stableSamples.length; i++) sum += state.stableSamples[i];
recordScore(sum / state.stableSamples.length);
state.lastScoreAt = now;
state.stableStart = 0;
state.stableSamples = [];
}
} else {
state.stableStart = 0;
state.stableSamples = [];
}
}

function stopMic() {
state.running = false;
if (state.rafId) { cancelAnimationFrame(state.rafId); state.rafId = 0; }
if (state.stream) {
state.stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });
state.stream = null;
}
if (state.audioCtx) {
var ctx = state.audioCtx;
state.audioCtx = null;
state.analyser = null;
try { if (ctx.close) ctx.close(); } catch (e) {}
}
state.stableStart = 0;
state.stableSamples = [];
renderReading(null, 0);
var cv = $('sp-wave');
if (cv) { var c2 = cv.getContext('2d'); if (c2) c2.clearRect(0, 0, cv.width, cv.height); }
setStatus('已停止。点「开始检测」重新授权麦克风。');
var b = $('sp-start');
if (b) b.textContent = '开始检测';
}

function startMic() {
if (state.running) { stopMic(); return; }
if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
showError('当前浏览器不支持麦克风采集（getUserMedia 不可用）：请用最新版 Chrome / Edge / Firefox 并通过 HTTPS 访问；音名–频率对照表仍可查。');
return;
}
showError('');
setStatus('正在请求麦克风权限…');
navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }).then(function (stream) {
state.stream = stream;
var AC = window.AudioContext || window.webkitAudioContext;
state.audioCtx = new AC();
var src = state.audioCtx.createMediaStreamSource(stream);
state.analyser = state.audioCtx.createAnalyser();
state.analyser.fftSize = 4096;
src.connect(state.analyser);
state.buf = new Float32Array(state.analyser.fftSize);
state.running = true;
state.stableStart = 0;
state.stableSamples = [];
state.lastScoreAt = 0;
setStatus('正在检测…对着麦克风唱一个音。');
var b = $('sp-start');
if (b) b.textContent = '停止检测';
state.rafId = requestAnimationFrame(tick);
}).catch(function (err) {
var msg = '无法使用麦克风。';
if (err && err.name === 'NotAllowedError') msg = '麦克风权限被拒绝：请在浏览器地址栏允许麦克风权限后刷新页面；音名–频率对照表仍可查。';
else if (err && err.name === 'NotFoundError') msg = '未找到麦克风设备：请确认电脑已连接麦克风；音名–频率对照表仍可查。';
else if (err && err.message) msg = '无法使用麦克风：' + err.message + '；音名–频率对照表仍可查。';
showError(msg);
setStatus('未开始检测。');
});
}

function playRefTone() {
var AC = window.AudioContext || window.webkitAudioContext;
if (!AC) return;
var midi;
try { midi = api.parseNoteName(state.config.targetNote).midi; } catch (e) { return; }
var freq = api.midiToFreq(midi);
var ctx = state.audioCtx;
var own = false;
if (!ctx) { ctx = new AC(); own = true; }
try {
if (ctx.state === 'suspended') ctx.resume();
var osc = ctx.createOscillator();
osc.type = 'sine';
osc.frequency.value = freq;
var gain = ctx.createGain();
var t = ctx.currentTime;
gain.gain.setValueAtTime(0.0001, t);
gain.gain.exponentialRampToValueAtTime(0.2, t + 0.05);
gain.gain.setValueAtTime(0.2, t + 1.2);
gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
osc.connect(gain);
gain.connect(ctx.destination);
osc.start(t);
osc.stop(t + 1.5);
if (own) setTimeout(function () { try { ctx.close(); } catch (e) {} }, 1700);
} catch (e) {}
}

function clearHistory() {
if (!window.confirm('清空全部历史成绩？此操作不可撤销。')) return;
state.scores = [];
saveHistory(state.scores);
renderHistory();
renderSession();
var el = $('sp-last-score');
if (el) el.textContent = '';
}

function bindPage() {
buildTargetOptions();
buildNoteTable();
renderHistory();
renderSession();
var tf = $('sp-target-freq');
if (tf) tf.textContent = String(api.midiToFreq(api.parseNoteName(state.config.targetNote).midi)) + ' Hz';
var b;
b = $('sp-start'); if (b) b.addEventListener('click', startMic);
b = $('sp-mode-free'); if (b) b.addEventListener('click', function () { setMode('free'); });
b = $('sp-mode-target'); if (b) b.addEventListener('click', function () { setMode('target'); });
var sel = $('sp-target-note');
if (sel) sel.addEventListener('change', function () { setTargetNote(sel.value); });
var tol = $('sp-tolerance');
if (tol) tol.addEventListener('change', function () {
try {
var cfg = api.validatePitchConfig({ mode: state.config.mode, targetNote: state.config.targetNote, tolerance: Number(tol.value) });
state.config = cfg;
} catch (e) {}
state.stableStart = 0;
state.stableSamples = [];
});
b = $('sp-play-ref'); if (b) b.addEventListener('click', playRefTone);
b = $('sp-clear-history'); if (b) b.addEventListener('click', clearHistory);
document.addEventListener('keydown', function (e) {
if (e.code === 'Space' || e.key === ' ') {
var tag = e.target && e.target.tagName;
if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA') return;
if (e.target === document.body || (e.target && e.target.id === 'sp-start')) {
e.preventDefault();
startMic();
}
}
});
setStatus('未开始检测。点「开始检测」授权麦克风。');
renderReading(null, 0);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindPage);
else bindPage();
}
})();
