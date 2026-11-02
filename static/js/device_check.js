/* 摄像头/麦克风/扬声器检测（device_check）- 纯前端零上传
* 一键设备自检四步：① 摄像头 getUserMedia 实时预览＋分辨率/帧率显示；
* ② 麦克风 WebAudio AnalyserNode 实时音量条/波形＋dB/百分比读数；
* ③ 扬声器左右声道测试音（各 2 秒，StereoPanner 声像定位）＋左右确认按钮；
* ④ 设备下拉切换（enumerateDevices）＋一键释放（停全部轨道、关 AudioContext、
* 指示灯熄灭、状态复位）。
* 纯函数契约（非法参数抛 Error，err.field 为字段名）：
* calcVolumeLevel（Float32Array 时域采样→RMS→归一化 0~1）、rmsToDb
* （20*log10(rms)，保留 1 位小数；rms=0 静音返回 -Infinity）、shortenLabel
* （超长截断 slice(0,maxLen-3)+'...'）。
* 真限制：需浏览器授权；HTTPS 或 localhost 安全上下文；设备同一时间只能被
* 一个应用占用；Safari/iOS 部分限制；纯本地零上传（Network 面板自证）。
* 零网络请求：本文件不发起任何请求（无 fetch/XHR/WebSocket/Beacon）；
* 渲染一律用 textContent，设备名里的 HTML 只显示为文本，不会执行。
* 浏览器与 node 测试共用同一纯函数；浏览器绑定只在有 document 时执行。 */
(function () {
'use strict';

/* ---------- 纯函数契约 ---------- */

/* 参数错误构造：err.field 为字段名，调用方按字段名定位问题，不静默钳制。 */
function paramError(field, message) {
var e = new Error(message);
e.field = field;
return e;
}

/* 时域采样 → 原始 RMS（不钳制，供 dB 计算用）。 */
function rawRms(data) {
if (!data || typeof data.length !== 'number' || data.length === 0) {
throw paramError('data', 'calcVolumeLevel: data 必须为非空采样数组');
}
var sum = 0, i, v;
for (i = 0; i < data.length; i++) {
v = Number(data[i]);
if (!isFinite(v)) throw paramError('data', 'calcVolumeLevel: 采样值必须为有限数值');
sum += v * v;
}
return Math.sqrt(sum / data.length);
}

/* calcVolumeLevel：Float32Array 时域采样 → RMS → 归一化 0~1。 */
function calcVolumeLevel(data) {
var rms = rawRms(data);
if (rms > 1) return 1;
if (rms < 0) return 0;
return rms;
}

/* rmsToDb：20*log10(rms)，保留 1 位小数；rms=0（静音）返回 -Infinity。 */
function rmsToDb(rms) {
if (typeof rms !== 'number' || !isFinite(rms) || rms < 0) {
throw paramError('rms', 'rmsToDb: rms 必须为非负有限数');
}
if (rms === 0) return -Infinity;
return Math.round(20 * Math.log10(rms) * 10) / 10;
}

/* shortenLabel：超长截断 slice(0,maxLen-3)+'...'，不超长原样返回。 */
function shortenLabel(label, maxLen) {
if (typeof label !== 'string') throw paramError('label', 'shortenLabel: label 必须为字符串');
if (typeof maxLen !== 'number' || !isFinite(maxLen) || Math.floor(maxLen) !== maxLen || maxLen < 4) {
throw paramError('maxLen', 'shortenLabel: maxLen 必须为 ≥4 的整数');
}
if (label.length <= maxLen) return label;
return label.slice(0, maxLen - 3) + '...';
}

var TONE_MS = 2000; /* 左右声道测试音时长：各 2 秒 */

var api = {
calcVolumeLevel: calcVolumeLevel,
rmsToDb: rmsToDb,
shortenLabel: shortenLabel,
TONE_MS: TONE_MS,
VERSION: '1.0.0'
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.DeviceCheck = api;

/* ---------- 浏览器 UI 绑定（仅当有 document 时执行） ---------- */
if (typeof document !== 'undefined') {
function el(id) { return document.getElementById(id); }
function txt(node, s) { node.textContent = s; }

var S = {
stream: null,        /* getUserMedia 媒体流 */
audioCtx: null,
analyser: null,
analyserData: null,  /* Float32Array 时域采样缓冲 */
rafId: 0,
playing: false,      /* 测试音播放中 */
camOk: false, micOk: false, spkL: false, spkR: false
};

function err(msg) {
var box = el('dc-error');
txt(box, msg);
box.style.display = msg ? 'block' : 'none';
}

function dot(id, on) {
var d = el(id);
d.className = 'dc-dot' + (on ? ' on' : '');
}

function setStep(id, text, ok) {
var n = el(id);
txt(n, text);
n.className = 'dc-step-note ' + (ok ? 'ok' : '');
}

/* ---- 步骤一：摄像头 ---- */
function startCamera(stream) {
var video = el('dc-video');
video.srcObject = stream;
var vt = stream.getVideoTracks()[0];
var info = '设备：' + shortenLabel(vt ? (vt.label || '未知摄像头') : '未知摄像头', 40);
txt(el('dc-cam-info'), info + ' ｜ 分辨率：检测中… ｜ 帧率：检测中…');
video.onloadedmetadata = function () {
var w = video.videoWidth, h = video.videoHeight;
var fps = vt && vt.getSettings ? (vt.getSettings().frameRate || 0) : 0;
var line = '设备：' + shortenLabel(vt ? (vt.label || '未知摄像头') : '未知摄像头', 40) +
' ｜ 分辨率：' + w + '×' + h + ' ｜ 帧率：' + (fps ? (Math.round(fps) + ' fps') : '—');
txt(el('dc-cam-info'), line);
if (!fps && typeof video.requestVideoFrameCallback === 'function') estimateFps(video);
};
video.play().catch(function () {});
S.camOk = true;
dot('dc-dot-cam', true);
setStep('dc-step-cam', '✓ 摄像头预览正常', true);
}

/* getSettings().frameRate 取不到时，用 requestVideoFrameCallback 估算 1 秒帧数。 */
function estimateFps(video) {
var n = 0, t0 = performance.now();
function cb() {
n++;
if (performance.now() - t0 < 1000) { video.requestVideoFrameCallback(cb); return; }
var line = el('dc-cam-info').textContent.replace(/帧率：[^｜]*/, '帧率：约 ' + n + ' fps');
txt(el('dc-cam-info'), line);
}
video.requestVideoFrameCallback(cb);
}

/* ---- 步骤二：麦克风 ---- */
function startMic(stream) {
var AC = window.AudioContext || window.webkitAudioContext;
if (!AC) { setStep('dc-step-mic', '✗ 当前浏览器不支持 Web Audio', false); return; }
S.audioCtx = new AC();
var src = S.audioCtx.createMediaStreamSource(stream);
S.analyser = S.audioCtx.createAnalyser();
S.analyser.fftSize = 2048;
src.connect(S.analyser);
S.analyserData = new Float32Array(S.analyser.fftSize);
S.micOk = true;
dot('dc-dot-mic', true);
setStep('dc-step-mic', '✓ 麦克风采集中，请对着麦克风说话', true);
tickMic();
}

function tickMic() {
if (!S.analyser) return;
S.analyser.getFloatTimeDomainData(S.analyserData);
var rms, level, db;
try {
rms = rawRms(S.analyserData);
level = rms > 1 ? 1 : rms;
db = rmsToDb(rms);
} catch (e) { rms = 0; level = 0; db = -Infinity; }
/* 音量条 */
el('dc-level-fill').style.width = (level * 100).toFixed(1) + '%';
/* 读数 */
txt(el('dc-db'), db === -Infinity ? '-∞ dB' : (db.toFixed(1) + ' dB'));
txt(el('dc-pct'), Math.round(level * 100) + '%');
/* 波形 */
drawWave(S.analyserData);
S.rafId = requestAnimationFrame(tickMic);
}

function drawWave(data) {
var c = el('dc-wave'), ctx = c.getContext('2d');
var W = c.width, H = c.height, mid = H / 2;
ctx.clearRect(0, 0, W, H);
ctx.strokeStyle = '#e5e7eb';
ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(W, mid); ctx.stroke();
ctx.strokeStyle = '#2563eb';
ctx.lineWidth = 2;
ctx.beginPath();
var step = Math.max(1, Math.floor(data.length / W));
for (var x = 0; x < W; x++) {
var v = data[x * step] || 0;
if (v > 1) v = 1; if (v < -1) v = -1;
var y = mid - v * (mid - 4);
if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
}
ctx.stroke();
}

/* ---- 步骤三：扬声器左右声道测试音 ---- */
function playTone(pan, btnId) {
if (S.playing || !S.audioCtx) return;
S.playing = true;
var btn = el(btnId);
btn.disabled = true;
txt(btn, '播放中…');
var ctx = S.audioCtx;
if (ctx.state === 'suspended') ctx.resume();
var osc = ctx.createOscillator();
osc.type = 'sine';
osc.frequency.value = 440;
var gain = ctx.createGain();
var t = ctx.currentTime;
gain.gain.setValueAtTime(0.0001, t);
gain.gain.exponentialRampToValueAtTime(0.5, t + 0.05);
gain.gain.setValueAtTime(0.5, t + TONE_MS / 1000 - 0.1);
gain.gain.exponentialRampToValueAtTime(0.0001, t + TONE_MS / 1000);
var out = gain;
if (typeof ctx.createStereoPanner === 'function') {
var panner = ctx.createStereoPanner();
panner.pan.value = pan;
osc.connect(gain); gain.connect(panner); panner.connect(ctx.destination);
} else {
osc.connect(gain); gain.connect(ctx.destination);
}
osc.start(t);
osc.stop(t + TONE_MS / 1000 + 0.05);
osc.onended = function () {
S.playing = false;
btn.disabled = false;
txt(btn, pan < 0 ? '播放左声道测试音（2 秒）' : '播放右声道测试音（2 秒）');
var cbtn = el(pan < 0 ? 'dc-confirm-l' : 'dc-confirm-r');
cbtn.disabled = false;
};
}

/* ---- 步骤四：设备枚举与切换 ---- */
function fillDevices() {
if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
navigator.mediaDevices.enumerateDevices().then(function (devs) {
var camSel = el('dc-cam-sel'), micSel = el('dc-mic-sel');
camSel.innerHTML = ''; micSel.innerHTML = '';
var ci = 0, mi = 0;
devs.forEach(function (d) {
var label = d.label || (d.kind === 'videoinput' ? '摄像头 ' + (ci + 1) : d.kind === 'audioinput' ? '麦克风 ' + (mi + 1) : d.kind);
label = shortenLabel(label, 48);
var opt = document.createElement('option');
opt.value = d.deviceId;
txt(opt, label);
if (d.kind === 'videoinput') { ci++; camSel.appendChild(opt); }
else if (d.kind === 'audioinput') { mi++; micSel.appendChild(opt); }
});
if (S.stream) {
var vt = S.stream.getVideoTracks()[0], at = S.stream.getAudioTracks()[0];
if (vt && vt.getSettings) {
var vs = vt.getSettings();
if (vs.deviceId) camSel.value = vs.deviceId;
}
if (at && at.getSettings) {
var as = at.getSettings();
if (as.deviceId) micSel.value = as.deviceId;
}
}
}).catch(function () {});
}

/* ---- 主流程 ---- */
function start() {
err('');
if (!window.isSecureContext) {
err('当前页面不是安全上下文：getUserMedia 仅在 HTTPS 或 localhost 下可用。这是真限制②。');
return;
}
if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
err('当前浏览器不支持 getUserMedia，无法访问摄像头/麦克风。请用新版 Chrome / Edge / Firefox / Safari。');
return;
}
el('dc-start').disabled = true;
txt(el('dc-start'), '请求权限中…');
navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(function (stream) {
S.stream = stream;
txt(el('dc-start'), '检测中…');
startCamera(stream);
startMic(stream);
fillDevices();
el('dc-release').disabled = false;
el('dc-switch').disabled = false;
setStep('dc-step-spk', '请依次播放左右声道测试音，听到后点确认', false);
}).catch(function (e) {
el('dc-start').disabled = false;
txt(el('dc-start'), '开始检测');
var msg = '无法获取设备：';
if (e && e.name === 'NotAllowedError') msg += '你拒绝了权限，请在浏览器地址栏左侧重新允许摄像头/麦克风。这是真限制①。';
else if (e && e.name === 'NotFoundError') msg += '未找到可用设备。';
else if (e && e.name === 'NotReadableError') msg += '设备正被其他应用占用（QQ/会议软件等）。这是真限制③。';
else msg += (e && e.message) || '未知错误';
err(msg);
});
}

function release() {
if (S.rafId) { cancelAnimationFrame(S.rafId); S.rafId = 0; }
if (S.stream) {
S.stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });
S.stream = null;
}
if (S.audioCtx) {
try { S.audioCtx.close(); } catch (e) {}
S.audioCtx = null; S.analyser = null; S.analyserData = null;
}
var video = el('dc-video');
video.pause();
video.removeAttribute('srcObject');
video.srcObject = null;
video.onloadedmetadata = null;
el('dc-level-fill').style.width = '0%';
txt(el('dc-db'), '— dB');
txt(el('dc-pct'), '—');
var c = el('dc-wave'), ctx = c.getContext('2d');
ctx.clearRect(0, 0, c.width, c.height);
txt(el('dc-cam-info'), '未开始');
dot('dc-dot-cam', false); dot('dc-dot-mic', false); dot('dc-dot-spk', false);
S.camOk = false; S.micOk = false; S.spkL = false; S.spkR = false;
setStep('dc-step-cam', '等待开始', false);
setStep('dc-step-mic', '等待开始', false);
setStep('dc-step-spk', '等待开始', false);
el('dc-confirm-l').disabled = true;
el('dc-confirm-r').disabled = true;
el('dc-release').disabled = true;
el('dc-switch').disabled = true;
el('dc-start').disabled = false;
txt(el('dc-start'), '开始检测');
err('');
}

function confirmSide(side) {
if (side === 'L') { S.spkL = true; el('dc-confirm-l').disabled = true; }
else { S.spkR = true; el('dc-confirm-r').disabled = true; }
if (S.spkL && S.spkR) {
dot('dc-dot-spk', true);
setStep('dc-step-spk', '✓ 左右声道均确认正常', true);
} else {
setStep('dc-step-spk', '已确认' + (S.spkL ? '左' : '右') + '声道，请继续另一侧', false);
}
}

function switchDevice() {
if (!S.stream) return;
var camId = el('dc-cam-sel').value, micId = el('dc-mic-sel').value;
var cons = {};
if (camId) cons.video = { deviceId: { exact: camId } }; else cons.video = true;
if (micId) cons.audio = { deviceId: { exact: micId } }; else cons.audio = true;
err('');
navigator.mediaDevices.getUserMedia(cons).then(function (ns) {
release();
S.stream = ns;
txt(el('dc-start'), '检测中…');
el('dc-start').disabled = true;
startCamera(ns);
startMic(ns);
fillDevices();
el('dc-release').disabled = false;
el('dc-switch').disabled = false;
setStep('dc-step-spk', '设备已切换：请重新播放左右声道测试音并确认', false);
}).catch(function (e) {
err('切换设备失败：' + ((e && e.message) || '未知错误') + '（设备可能正被其他应用占用，这是真限制③）');
});
}

function bind() {
el('dc-start').addEventListener('click', start);
el('dc-release').addEventListener('click', release);
el('dc-switch').addEventListener('click', switchDevice);
el('dc-tone-l').addEventListener('click', function () { playTone(-1, 'dc-tone-l'); });
el('dc-tone-r').addEventListener('click', function () { playTone(1, 'dc-tone-r'); });
el('dc-confirm-l').addEventListener('click', function () { confirmSide('L'); });
el('dc-confirm-r').addEventListener('click', function () { confirmSide('R'); });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
else bind();
}
})();
