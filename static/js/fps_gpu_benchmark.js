/* 浏览器 FPS/GPU 性能速测 - WebGL 可调负载（低/中/高/自定义档）→ rAF 帧时间统计 → 成绩单 → 一键复制/下载报告
* 纯前端、零后端、零 fetch/XHR：负载用 WebGL 本地渲染，帧时间统计走 requestAnimationFrame，
* GPU 型号只读本地的 WEBGL_debug_renderer_info 渲染器字符串，全程不上传。
* 纯函数契约（浏览器/Node 通用，非法参数抛 Error，err.field 给出字段名，不静默钳制）：
* aggregateFrameStats(frames)
* -> {avgFps, p1Low, p95FrameTime, jitterMs, dropRate}（frames 非数组/空/含非有限正数 → err.field='frames'）
* classifyFpsGrade(avgFps)
* -> '流畅' | '良好' | '卡顿'（avgFps 非有限非负数 → err.field='avgFps'；≥55 流畅，≥30 良好，否则卡顿）
* validateBenchmarkConfig(config)
* -> {triangles, resolution, antialias, effects}（triangles∈[1000,2000000] → err.field='triangles'；
* resolution∈[0.25,2] → err.field='resolution'；config 非对象 → err.field='config'）
* buildFpsReportName(now)
* -> 'fps_benchmark_YYYYMMDD_HHmmss.txt'（now 缺省为 new Date()；非法 → err.field='now'）
* Node 自测：module.exports 暴露纯函数。浏览器 DOM 装配由 typeof document!== 'undefined' 守卫。
*/
(function () {
'use strict';

/* ---------------- 纯函数 ---------------- */

function err(field, msg) {
var e = new Error(msg);
e.field = field;
return e;
}

function r2(x) { return Math.round(x * 100) / 100;}
function r4(x) { return Math.round(x * 10000) / 10000;}

var DROP_THRESHOLD_MS = 33.3; /* >33.3ms 即掉帧（30fps 线） */

/* 帧时间数组（毫秒）→ 成绩单 */
function aggregateFrameStats(frames) {
if (!Array.isArray(frames) || frames.length === 0) throw err('frames', 'frames 必须为非空数组');
var i, n = frames.length;
for (i = 0; i < n; i++) {
var t = frames[i];
if (typeof t!== 'number' ||!isFinite(t) || t <= 0) throw err('frames', 'frames[' + i + '] 必须为有限正数（帧时间 ms）');
}
var sum = 0;
for (i = 0; i < n; i++) sum += frames[i];
var mean = sum / n;
var vsum = 0;
for (i = 0; i < n; i++) { var d = frames[i] - mean; vsum += d * d;}
var jitter = Math.sqrt(vsum / n); /* 帧时间总体标准差 */
var sorted = frames.slice().sort(function (a, b) { return a - b;});
var p95 = sorted[Math.max(0, Math.ceil(0.95 * n) - 1)]; /* 95 分位帧时间 */
var lowCount = Math.max(1, Math.ceil(0.01 * n)); /* 最慢 1% 帧求平均再转 FPS */
var lowSum = 0;
for (i = 0; i < lowCount; i++) lowSum += sorted[n - 1 - i];
var p1Low = 1000 / (lowSum / lowCount);
var drops = 0;
for (i = 0; i < n; i++) if (frames[i] > DROP_THRESHOLD_MS) drops++;
return {
avgFps: r2(1000 / mean),
p1Low: r2(p1Low),
p95FrameTime: r2(p95),
jitterMs: r2(jitter),
dropRate: r4(drops / n)
};
}

/* 平均 FPS → 档位评级 */
function classifyFpsGrade(avgFps) {
if (typeof avgFps!== 'number' ||!isFinite(avgFps) || avgFps < 0) throw err('avgFps', 'avgFps 必须为有限非负数');
if (avgFps >= 55) return '流畅';
if (avgFps >= 30) return '良好';
return '卡顿';
}

/* 负载配置校验与归一化 */
function validateBenchmarkConfig(config) {
if (config === null || config === undefined || typeof config!== 'object' || Array.isArray(config)) throw err('config', 'config 必须为对象');
var t = config.triangles, r = config.resolution;
if (typeof t!== 'number' ||!isFinite(t) || t < 1000 || t > 2000000) throw err('triangles', 'triangles 必须在 [1000,2000000] 之间');
if (typeof r!== 'number' ||!isFinite(r) || r < 0.25 || r > 2) throw err('resolution', 'resolution 必须在 [0.25,2] 之间');
var antialias = config.antialias === undefined? false: config.antialias;
var effects = config.effects === undefined? false: config.effects;
if (typeof antialias!== 'boolean') throw err('antialias', 'antialias 必须为布尔值');
if (typeof effects!== 'boolean') throw err('effects', 'effects 必须为布尔值');
return {triangles: Math.round(t), resolution: r, antialias: antialias, effects: effects};
}

function pad2(n) { return (n < 10? '0': '') + n;}

/* 报告文件名 */
function buildFpsReportName(now) {
var d = (now === undefined || now === null)? new Date(): now;
if (!(d instanceof Date) || isNaN(d.getTime())) throw err('now', 'now 必须为合法 Date');
return 'fps_benchmark_' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) +
'_' + pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds()) + '.txt';
}

if (typeof module!== 'undefined' && module.exports) {
module.exports = {
aggregateFrameStats: aggregateFrameStats,
classifyFpsGrade: classifyFpsGrade,
validateBenchmarkConfig: validateBenchmarkConfig,
buildFpsReportName: buildFpsReportName,
DROP_THRESHOLD_MS: DROP_THRESHOLD_MS
};
}

/* ---------------- 浏览器 DOM 装配 ---------------- */

if (typeof document!== 'undefined' && typeof window!== 'undefined') {
(function () {
var A = (typeof window.FpsGpuBenchmark!== 'undefined')? window.FpsGpuBenchmark: {
aggregateFrameStats: aggregateFrameStats,
classifyFpsGrade: classifyFpsGrade,
validateBenchmarkConfig: validateBenchmarkConfig,
buildFpsReportName: buildFpsReportName,
DROP_THRESHOLD_MS: DROP_THRESHOLD_MS
};

function $(id) { return document.getElementById(id);}

var PRESETS = {
low: {triangles: 20000, resolution: 0.5, antialias: false, effects: false},
mid: {triangles: 200000, resolution: 1, antialias: true, effects: false},
high: {triangles: 1000000, resolution: 1.5, antialias: true, effects: true}
};

var BENCH_MS = 6000; /* 单次跑分时长 6 秒 */

var gpuInfo = {ok: false, renderer: '', masked: false};
var running = false;
var lastReport = '';

/* ---- WebGL 渲染器检测（只读本地渲染器字符串，不上传） ---- */
function detectGpu() {
try {
var canvas = document.createElement('canvas');
var gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
if (!gl) return {ok: false, masked: false, renderer: ''};
var dbg = null;
try { dbg = gl.getExtension('WEBGL_debug_renderer_info');} catch (e) { dbg = null;}
if (!dbg) {
var masked = '';
try { masked = gl.getParameter(gl.RENDERER) || '';} catch (e2) { masked = '';}
return {ok: true, masked: true, renderer: String(masked)};
}
var renderer = '';
try { renderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '';} catch (e3) { renderer = '';}
return {ok: true, masked: false, renderer: String(renderer)};
} catch (e) {
return {ok: false, masked: false, renderer: ''};
}
}

function refreshGpuPanel() {
gpuInfo = detectGpu();
var box = $('fgb-gpu-status'), btn = $('fgb-run');
if (!box) return;
if (!gpuInfo.ok) {
box.className = 'fgb-gpu fgb-gpu-bad';
box.innerHTML = '<i class="material-icons">error</i><div><b>WebGL 不可用。</b>当前浏览器未提供 WebGL 上下文（可能被禁用或驱动不支持），无法跑分。请换一个支持 WebGL 的浏览器再试。</div>';
if (btn) btn.disabled = true;
} else if (gpuInfo.masked ||!gpuInfo.renderer) {
box.className = 'fgb-gpu fgb-gpu-warn';
box.innerHTML = '<i class="material-icons">visibility_off</i><div><b>GPU 型号未知</b>（隐私模式/企业策略可能屏蔽了渲染器字符串）。跑分功能不受影响，可继续。</div>';
if (btn) btn.disabled = false;
} else {
box.className = 'fgb-gpu fgb-gpu-ok';
box.innerHTML = '<i class="material-icons">memory</i><div><b>检测到 GPU：</b><span class="fgb-renderer-raw">' +
escapeHtml(gpuInfo.renderer) + '</span></div>';
if (btn) btn.disabled = false;
}
}

function escapeHtml(s) {
return String(s).replace(/[&<>"']/g, function (c) {
return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c];
});
}

/* ---- 档位 UI ---- */
var preset = 'mid';
function applyPresetUI() {
var cfg = PRESETS[preset] || PRESETS.mid;
$('fgb-tri').value = cfg.triangles;
$('fgb-res').value = cfg.resolution;
$('fgb-res-val').textContent = Number(cfg.resolution).toFixed(2) + '×';
$('fgb-aa').checked = cfg.antialias;
$('fgb-fx').checked = cfg.effects;
var customBox = $('fgb-custom');
if (customBox) customBox.style.display = (preset === 'custom')? '': 'none';
}

function currentConfig() {
return {
triangles: Number($('fgb-tri').value),
resolution: Number($('fgb-res').value),
antialias: $('fgb-aa').checked,
effects: $('fgb-fx').checked
};
}

/* ---- WebGL 负载：N 个旋转彩色三角形 ---- */
function createProgram(gl, vsSrc, fsSrc) {
function compile(type, src) {
var sh = gl.createShader(type);
gl.shaderSource(sh, src);
gl.compileShader(sh);
if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error('shader 编译失败');
return sh;
}
var prog = gl.createProgram();
gl.attachShader(prog, compile(gl.VERTEX_SHADER, vsSrc));
gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fsSrc));
gl.linkProgram(prog);
if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('program 链接失败');
return prog;
}

function buildTriangleData(triangles) {
var verts = new Float32Array(triangles * 3 * 5); /* x,y,r,g,b */
var idx = 0, i, k;
var s = 0.9;
for (i = 0; i < triangles; i++) {
var a = (i / triangles) * Math.PI * 2;
var ring = (i % 64) / 64; /* 同心环编号 */
var r0 = s * (0.06 + 0.94 * ring);
var cx = Math.cos(a) * r0, cy = Math.sin(a) * r0;
var rr = 0.015 + 0.05 * ((i * 7) % 13) / 13;
var cr = ((i * 37) % 100) / 100, cg = ((i * 53) % 100) / 100, cb = ((i * 79) % 100) / 100;
for (k = 0; k < 3; k++) {
var ta = a + k * (Math.PI * 2 / 3);
verts[idx++] = cx + Math.cos(ta) * rr;
verts[idx++] = cy + Math.sin(ta) * rr;
verts[idx++] = cr * (0.4 + 0.6 * (k / 2));
verts[idx++] = cg * (0.4 + 0.6 * ((k + 1) % 3 / 2));
verts[idx++] = cb * (0.4 + 0.6 * ((k + 2) % 3 / 2));
}
}
return verts;
}

function runBenchmark(cfg) {
return new Promise(function (resolve, reject) {
var canvas = $('fgb-gl');
var w = 640, h = 360;
canvas.width = Math.round(w * cfg.resolution);
canvas.height = Math.round(h * cfg.resolution);
var gl = null;
try {
gl = canvas.getContext('webgl', {antialias: cfg.antialias, preserveDrawingBuffer: false}) ||
canvas.getContext('experimental-webgl', {antialias: cfg.antialias});
} catch (e) { gl = null;}
if (!gl) { reject(new Error('WebGL 上下文创建失败')); return;}
var vs = 'attribute vec2 aPos; attribute vec3 aCol; uniform float uAngle; varying vec3 vCol;' +
'void main(){ float c=cos(uAngle), s=sin(uAngle);' +
' gl_Position=vec4(vec2(c*aPos.x-s*aPos.y, s*aPos.x+c*aPos.y),0.0,1.0); vCol=aCol;}';
var fs = cfg.effects
? 'precision mediump float; varying vec3 vCol; uniform float uTime;' +
'void main(){ float glow=0.75+0.25*sin(uTime*3.0+(vCol.r+vCol.g)*8.0);' +
' gl_FragColor=vec4(vCol*glow,1.0);}'
: 'precision mediump float; varying vec3 vCol; void main(){ gl_FragColor=vec4(vCol,1.0);}';
var prog, uAngle, uTime;
try {
prog = createProgram(gl, vs, fs);
uAngle = gl.getUniformLocation(prog, 'uAngle');
uTime = gl.getUniformLocation(prog, 'uTime');
} catch (e) { reject(new Error('着色器初始化失败')); return;}
var data;
try {
data = buildTriangleData(cfg.triangles);
} catch (e) { reject(new Error('顶点数据过大，显存不足')); return;}
var buf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
gl.useProgram(prog);
var aPos = gl.getAttribLocation(prog, 'aPos');
var aCol = gl.getAttribLocation(prog, 'aCol');
gl.enableVertexAttribArray(aPos);
gl.enableVertexAttribArray(aCol);
gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 20, 0);
gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 20, 8);
gl.viewport(0, 0, canvas.width, canvas.height);
gl.clearColor(0.04, 0.05, 0.09, 1.0);

var dts = [];
var start = performance.now(), last = start, t0 = start;
var histEl = $('fgb-hist');
var hist = [];
function drawHist() {
var ctx = histEl.getContext('2d');
var W = histEl.width, H = histEl.height;
ctx.clearRect(0, 0, W, H);
ctx.fillStyle = '#0b1220';
ctx.fillRect(0, 0, W, H);
ctx.strokeStyle = '#1f2937';
ctx.lineWidth = 1;
[30, 60, 120].forEach(function (fpsLine) {
var y = H - Math.min(1, fpsLine / 240) * (H - 8) - 4;
ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
});
if (hist.length < 2) return;
ctx.strokeStyle = '#22c55e';
ctx.lineWidth = 2;
ctx.beginPath();
for (var i = 0; i < hist.length; i++) {
var x = (i / (hist.length - 1)) * W;
var y2 = H - Math.min(1, hist[i] / 240) * (H - 8) - 4;
if (i === 0) ctx.moveTo(x, y2); else ctx.lineTo(x, y2);
}
ctx.stroke();
}
var stop = false;
function frame(now) {
if (stop) return;
var dt = now - last;
last = now;
if (dt > 0 && dt < 1000) {
dts.push(dt);
hist.push(1000 / dt);
if (hist.length > 600) hist.shift();
drawHist();
$('fgb-live').textContent = Math.round(1000 / dt) + ' FPS';
var progPct = Math.min(100, Math.round((now - t0) / BENCH_MS * 100));
$('fgb-progress').style.width = progPct + '%';
$('fgb-progress-txt').textContent = progPct + '%';
}
gl.clear(gl.COLOR_BUFFER_BIT);
if (uAngle) gl.uniform1f(uAngle, (now - t0) / 1000 * 0.6);
if (uTime) gl.uniform1f(uTime, (now - t0) / 1000);
gl.drawArrays(gl.TRIANGLES, 0, cfg.triangles * 3);
if (now - t0 >= BENCH_MS) {
stop = true;
var ext = gl.getExtension('WEBGL_lose_context');
if (ext) ext.loseContext();
resolve(dts);
return;
}
requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
});
}

/* ---- 报告文本 ---- */
function buildReportText(cfg, stats, grade) {
var lines = [];
lines.push('浏览器 FPS/GPU 性能速测报告');
lines.push('生成时间：' + new Date().toLocaleString('zh-CN'));
lines.push('');
lines.push('');
lines.push(' 三角形数量：' + cfg.triangles.toLocaleString('en-US'));
lines.push(' 渲染分辨率倍数：' + cfg.resolution + '×');
lines.push(' 抗锯齿：' + (cfg.antialias? '开': '关'));
lines.push(' 特效（流光）：' + (cfg.effects? '开': '关'));
lines.push('');
lines.push('');
lines.push(' 渲染器：' + (gpuInfo.ok && gpuInfo.renderer? gpuInfo.renderer: '未知（隐私模式可能屏蔽）'));
lines.push(' 供应商：' + (gpuInfo.ok && gpuInfo.renderer? gpuInfo.renderer.split(',')[0].trim(): '未知'));
lines.push('');
lines.push('');
lines.push(' 档位评级：' + grade);
lines.push(' 平均 FPS：' + stats.avgFps);
lines.push(' 1% Low FPS：' + stats.p1Low);
lines.push(' P95 帧时间：' + stats.p95FrameTime + ' ms');
lines.push(' 帧时间抖动（stddev）：' + stats.jitterMs + ' ms');
lines.push(' 掉帧率（>33.3ms 占比）：' + (stats.dropRate * 100).toFixed(2) + '%');
lines.push('');
lines.push('本报告仅测量浏览器内 WebGL 渲染性能，不能替代 3DMark 等原生跑分；');
lines.push('不同浏览器、驱动、系统负载都会影响结果；无法获取温度/功耗/频率等硬件传感器数据。');
return lines.join('\n');
}

function gradeClass(grade) {
return grade === '流畅'? 'fgb-grade-good': (grade === '良好'? 'fgb-grade-mid': 'fgb-grade-bad');
}

function toast(msg, ok) {
var t = $('fgb-toast');
if (!t) return;
t.textContent = msg;
t.className = 'fgb-toast ' + (ok === false? 'fgb-toast-bad': '');
t.style.display = 'block';
setTimeout(function () { t.style.display = 'none';}, 2600);
}

/* ---- 事件装配 ---- */
function bind() {
var tabs = document.querySelectorAll('.fgb-tab');
tabs.forEach(function (tab) {
tab.addEventListener('click', function () {
tabs.forEach(function (x) { x.classList.remove('active');});
tab.classList.add('active');
preset = tab.getAttribute('data-preset');
applyPresetUI();
});
});
$('fgb-res').addEventListener('input', function () {
$('fgb-res-val').textContent = Number($('fgb-res').value).toFixed(2) + '×';
});
$('fgb-redetect').addEventListener('click', function () { refreshGpuPanel(); toast('已重新检测 GPU');});

$('fgb-run').addEventListener('click', function () {
if (running) return;
var cfg;
try {
cfg = A.validateBenchmarkConfig(currentConfig());
} catch (e) {
toast('配置无效：' + e.message, false);
return;
}
if (!gpuInfo.ok) { toast('WebGL 不可用，无法跑分', false); return;}
running = true;
$('fgb-run').disabled = true;
$('fgb-stop-note').style.display = '';
$('fgb-score').style.display = 'none';
$('fgb-report-panel').style.display = 'none';
$('fgb-live').textContent = '…';
runBenchmark(cfg).then(function (dts) {
running = false;
$('fgb-run').disabled = false;
$('fgb-stop-note').style.display = 'none';
if (dts.length < 10) { toast('采集帧数过少，请重试', false); return;}
var stats = A.aggregateFrameStats(dts);
var grade = A.classifyFpsGrade(stats.avgFps);
$('fgb-grade').textContent = grade;
$('fgb-grade').className = 'fgb-grade ' + gradeClass(grade);
$('fgb-s-avg').textContent = stats.avgFps + ' FPS';
$('fgb-s-p1').textContent = stats.p1Low + ' FPS';
$('fgb-s-p95').textContent = stats.p95FrameTime + ' ms';
$('fgb-s-jitter').textContent = stats.jitterMs + ' ms';
$('fgb-s-drop').textContent = (stats.dropRate * 100).toFixed(2) + '%';
$('fgb-s-gpu').textContent = (gpuInfo.ok && gpuInfo.renderer)? gpuInfo.renderer: '未知';
$('fgb-score').style.display = '';
lastReport = buildReportText(cfg, stats, grade);
$('fgb-report-panel').style.display = '';
toast('✅ 跑分完成：' + grade);
}).catch(function (e) {
running = false;
$('fgb-run').disabled = false;
$('fgb-stop-note').style.display = 'none';
toast('跑分失败：' + e.message, false);
});
});

$('fgb-copy').addEventListener('click', function () {
if (!lastReport) return;
function done() { toast('✅ 报告已复制到剪贴板');}
if (navigator.clipboard && navigator.clipboard.writeText) {
navigator.clipboard.writeText(lastReport).then(done, function () { fallbackCopy();});
} else { fallbackCopy();}
function fallbackCopy() {
var ta = document.createElement('textarea');
ta.value = lastReport;
document.body.appendChild(ta);
ta.select();
try { document.execCommand('copy'); done();} catch (e) { toast('复制失败，请手动选择复制', false);}
document.body.removeChild(ta);
}
});

$('fgb-download').addEventListener('click', function () {
if (!lastReport) return;
var name = A.buildFpsReportName(new Date());
var blob = new Blob(['\ufeff' + lastReport], {type: 'text/plain;charset=utf-8'});
var url = URL.createObjectURL(blob);
var a = document.createElement('a');
a.href = url; a.download = name;
document.body.appendChild(a); a.click();
setTimeout(function () { URL.revokeObjectURL(url); document.body.removeChild(a);}, 500);
toast('✅ 已开始下载 ' + name);
});
}

applyPresetUI();
refreshGpuPanel();
bind();

})();
} /* typeof document!== 'undefined' */
})();
