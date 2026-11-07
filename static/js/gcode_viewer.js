/* G-code 预览器（gcode_viewer）- 纯前端（零后端、零上传）
*
* 只做切片后刀路预览，不做模型预览、不做切片、不替代切片软件。
* 解析范围：Marlin/RepRap 风格 G0/G1 直线移动（X/Y/Z/E/F），
* E 增加为挤出否则为空走，Z 变化分层；G2/G3 圆弧、温度/风扇等
* M 指令、相对坐标（G91）/相对挤出（M83）忽略处理。
* 预估时长按进给速度累加直线距离（无 F 沿用上一次，初始默认
* 1500 mm/min），未计加减速/回抽/加热等待；耗材按 1.75mm 丝径、
* PLA 1.24 g/cm^3 估算。Z 回退/多挤出头可能分层不准。
* 不引第三方库、不走 CDN；模板零外部静态资源。
*/
(function () {
'use strict';

var EPS = 1e-9;
var DEFAULT_FEED = 1500; /* mm/min */
var MAX_FILE_BYTES = 20 * 1024 * 1024;

function fail(field, msg) {
var e = new Error(msg);
e.field = field;
throw e;
}
function isNum(v) { return typeof v === 'number' && isFinite(v);}
function isInt(v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v;}
function dist(x0, y0, x1, y1) {
var dx = x1 - x0, dy = y1 - y0;
return Math.sqrt(dx * dx + dy * dy);
}

/* 规范 8 行样例：totalLines 8、totalLayers 2、layers[0].z 0.2、
* layers[1].z 0.4、totalExtrudeMm ≈44.14、totalTravelMm 0、
* estimatedSeconds ∈ (1.7, 1.8)。 */
var SAMPLE_TEXT = [
'; G-code 预览器规范样例：双层校准方块（第一层对角线＋三边）',
'G90',
'G1 Z0.2 F1500',
'G1 X10 Y10 E0.5',
'G1 X20 Y10 E1.0',
'G1 X20 Y20 E1.5',
'G1 X10 Y20 E2.0',
'G1 Z0.4'
].join('\n');

/* 预设 2：20×20mm 方框 · 4 层，每层完整方框周长。 */
var CUBE_TEXT = [
'; 预设：20×20mm 方框 · 4 层',
'G90',
'G1 Z0.2 F1500',
'G1 X0 Y0 E0',
'G1 X20 Y0 E0.8',
'G1 X20 Y20 E1.6',
'G1 X0 Y20 E2.4',
'G1 X0 Y0 E3.2',
'G1 Z0.4',
'G1 X20 Y0 E4.0',
'G1 X20 Y20 E4.8',
'G1 X0 Y20 E5.6',
'G1 X0 Y0 E6.4',
'G1 Z0.6',
'G1 X20 Y0 E7.2',
'G1 X20 Y20 E8.0',
'G1 X0 Y20 E8.8',
'G1 X0 Y0 E9.6',
'G1 Z0.8',
'G1 X20 Y0 E10.4',
'G1 X20 Y20 E11.2',
'G1 X0 Y20 E12.0',
'G1 X0 Y0 E12.8'
].join('\n');

/* 预设 3：半径 15mm 同心圆 · 3 层（12 段直线逼近圆，G0 空走到起
* 点再 G1 挤出画圆），程序化生成保证几何正确。 */
function buildCircleText() {
var lines = ['; 预设：半径 15mm 圆环 · 3 层（12 段直线逼近）', 'G90'];
var e = 0, li, k, ang, x, y;
for (li = 0; li < 3; li++) {
lines.push('G1 Z' + (0.2 * (li + 1)).toFixed(1) + ' F1500');
lines.push('G0 X15.00 Y0.00');
for (k = 1; k <= 12; k++) {
ang = k * Math.PI / 6;
x = 15 * Math.cos(ang);
y = 15 * Math.sin(ang);
e += 0.3;
lines.push('G1 X' + x.toFixed(2) + ' Y' + y.toFixed(2) + ' E' + e.toFixed(1));
}
}
return lines.join('\n');
}

var PRESETS = [
{ id: 'sample', name: '双层校准方块', desc: '规范 8 行样例：2 层，Z 0.2 / 0.4', text: SAMPLE_TEXT},
{ id: 'cube', name: '20mm 方框 · 4 层', desc: '每层完整方框周长，共 4 层', text: CUBE_TEXT},
{ id: 'circle', name: '圆环 · 3 层', desc: '半径 15mm，12 段直线逼近圆', text: buildCircleText()}
];

function getPresets() {
return PRESETS.map(function (p) {
return { id: p.id, name: p.name, desc: p.desc, text: p.text};
});
}
function getPreset(id) {
if (typeof id!== 'string' ||!id) fail('id', '预设 id 须为非空字符串');
var i;
for (i = 0; i < PRESETS.length; i++) {
if (PRESETS[i].id === id) return PRESETS[i].text;
}
fail('id', '未知预设 id：' + id);
}

/* 解析 G-code 文本。返回 {layers:[{z, moves:[{x0,y0,x1,y1,extrude,feed}]}], stats:{...}}。
* moves 只含 XY 位移或 E 变化的 G0/G1；Z-only 移动只切分层，不产生 move。 */
function parseGcode(text) {
if (typeof text!== 'string') fail('text', 'parseGcode(text)：text 须为字符串');
var lines;
if (text === '') {
lines = [];
} else {
lines = text.split(/\r?\n/);
if (lines.length && lines[lines.length - 1] === '') lines.pop();
}
var layers = [];
var x = 0, y = 0, z = 0, e = 0, feed = DEFAULT_FEED;
var currentLayer = null;
var totalExtrudeMm = 0, totalTravelMm = 0, estimatedSeconds = 0, filamentMm = 0;
var i, raw, line, pairs, j, m, code, cmd, params, has, nz, ne, nx, ny, d, dE, extrude;

function ensureLayer() {
if (!currentLayer) {
currentLayer = { z: z, moves: []};
layers.push(currentLayer);
}
return currentLayer;
}

for (i = 0; i < lines.length; i++) {
raw = lines[i];
line = raw.replace(/;.*$/, '').replace(/\([^)]*\)/g, ' ').trim();
if (!line) continue;
pairs = [];
var re = /([A-Za-z])(-?\d+(?:\.\d+)?)/g;
while ((m = re.exec(line))!== null) {
pairs.push([m[1].toUpperCase(), parseFloat(m[2])]);
}
if (!pairs.length) continue;
code = pairs[0][0];
cmd = pairs[0][1];
params = {};
for (j = 1; j < pairs.length; j++) params[pairs[j][0]] = pairs[j][1];

if (code === 'G' && (cmd === 0 || cmd === 1)) {
if (isNum(params.F) && params.F > 0) feed = params.F;
if (isNum(params.Z) && Math.abs(params.Z - z) > EPS) {
z = params.Z;
currentLayer = { z: z, moves: []};
layers.push(currentLayer);
}
has = isNum(params.X) || isNum(params.Y) || isNum(params.E);
if (!has) continue;
nx = isNum(params.X)? params.X: x;
ny = isNum(params.Y)? params.Y: y;
ne = isNum(params.E)? params.E: e;
d = dist(x, y, nx, ny);
dE = ne - e;
extrude = dE > EPS;
if (d > EPS || Math.abs(dE) > EPS) {
ensureLayer().moves.push({ x0: x, y0: y, x1: nx, y1: ny, extrude: extrude, feed: feed});
if (extrude) totalExtrudeMm += d; else totalTravelMm += d;
if (d > EPS) estimatedSeconds += d / (feed / 60);
}
if (dE > EPS) filamentMm += dE;
x = nx; y = ny; e = ne;
} else if (code === 'G' && cmd === 92) {
/* G92：只处理位置重设（常用于 G92 E0），不产生 move、不切层。 */
if (isNum(params.X)) x = params.X;
if (isNum(params.Y)) y = params.Y;
if (isNum(params.Z)) z = params.Z;
if (isNum(params.E)) e = params.E;
}
/* 其余指令（G2/G3、G21/G90/G91、M104/M109/M82/M83 等）忽略处理。 */
}

var heights = [], h;
for (i = 1; i < layers.length; i++) {
h = layers[i].z - layers[i - 1].z;
if (h > EPS) heights.push(h);
}
heights.sort(function (a, b) { return a - b;});
var medianH = 0;
if (heights.length) {
medianH = heights.length % 2 === 1
? heights[(heights.length - 1) / 2]
: (heights[heights.length / 2 - 1] + heights[heights.length / 2]) / 2;
}

return {
layers: layers,
stats: {
totalLines: lines.length,
totalLayers: layers.length,
totalExtrudeMm: totalExtrudeMm,
totalTravelMm: totalTravelMm,
estimatedSeconds: estimatedSeconds,
filamentMm: filamentMm,
filamentMeters: filamentMm / 1000,
filamentGrams: filamentWeight(filamentMm),
layerHeightMedianMm: medianH
}
};
}

function clampLayer(index, total) {
if (!isInt(index)) fail('index', 'clampLayer(index, total)：index 须为整数');
if (!isInt(total) || total < 0) fail('total', 'clampLayer(index, total)：total 须为非负整数');
if (total === 0) return -1;
if (index < 0) return 0;
if (index > total - 1) return total - 1;
return index;
}

function getLayer(parsed, index) {
if (!parsed || typeof parsed!== 'object' ||!Array.isArray(parsed.layers)) {
fail('parsed', 'getLayer(parsed, index)：parsed 须为 parseGcode 返回的对象');
}
if (!isInt(index)) fail('index', 'getLayer(parsed, index)：index 须为整数');
if (parsed.layers.length === 0) return null;
return parsed.layers[clampLayer(index, parsed.layers.length)];
}

function layerStats(layer) {
if (!layer || typeof layer!== 'object' ||!isNum(layer.z) ||!Array.isArray(layer.moves)) {
fail('layer', 'layerStats(layer)：layer 须为 {z, moves} 对象');
}
var extrudeCount = 0, travelCount = 0, extrudeMm = 0, travelMm = 0, seconds = 0, i, mv, d;
for (i = 0; i < layer.moves.length; i++) {
mv = layer.moves[i];
d = dist(mv.x0, mv.y0, mv.x1, mv.y1);
if (mv.extrude) { extrudeCount++; extrudeMm += d;}
else { travelCount++; travelMm += d;}
if (d > EPS && isNum(mv.feed) && mv.feed > 0) seconds += d / (mv.feed / 60);
}
return {
z: layer.z,
moveCount: layer.moves.length,
extrudeCount: extrudeCount,
travelCount: travelCount,
extrudeMm: extrudeMm,
travelMm: travelMm,
seconds: seconds
};
}

function estimateTime(parsed) {
if (!parsed || typeof parsed!== 'object' ||!Array.isArray(parsed.layers)) {
fail('parsed', 'estimateTime(parsed)：parsed 须为 parseGcode 返回的对象');
}
var total = 0, i;
for (i = 0; i < parsed.layers.length; i++) total += layerStats(parsed.layers[i]).seconds;
return total;
}

function formatDuration(seconds) {
if (!isNum(seconds) || seconds < 0) fail('seconds', 'formatDuration(seconds)：seconds 须为非负数');
var t = Math.floor(seconds);
var h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
if (h > 0) return h + '小时' + m + '分' + s + '秒';
if (m > 0) return m + '分' + s + '秒';
return s + '秒';
}

function filamentWeight(extrudeMm, diameterMm, density) {
if (diameterMm === undefined) diameterMm = 1.75;
if (density === undefined) density = 1.24;
if (!isNum(extrudeMm) || extrudeMm < 0) fail('extrudeMm', 'filamentWeight(extrudeMm, diameterMm, density)：extrudeMm 须为非负数');
if (!isNum(diameterMm) || diameterMm <= 0) fail('diameterMm', 'filamentWeight：diameterMm 须为正数');
if (!isNum(density) || density <= 0) fail('density', 'filamentWeight：density 须为正数');
var r = diameterMm / 2;
var volumeCm3 = Math.PI * r * r * extrudeMm / 1000;
return volumeCm3 * density;
}

var API = {
parseGcode: parseGcode,
getLayer: getLayer,
layerStats: layerStats,
estimateTime: estimateTime,
formatDuration: formatDuration,
filamentWeight: filamentWeight,
clampLayer: clampLayer,
getPresets: getPresets,
getPreset: getPreset,
SAMPLE_TEXT: SAMPLE_TEXT,
MAX_FILE_BYTES: MAX_FILE_BYTES,
DEFAULT_FEED: DEFAULT_FEED
};

if (typeof window!== 'undefined') window.GcodeViewer = API;
if (typeof module!== 'undefined' && module.exports) module.exports = API;

/* ================= 浏览器绑定（DOM 只做浏览器端） ================= */
if (typeof document!== 'undefined') {
(function () {
function $(id) { return document.getElementById(id);}
function esc(s) {
return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function fmt(n, digits) {
if (digits === undefined) digits = 2;
return Number(n).toFixed(digits);
}
function fmtSize(bytes) {
if (bytes < 1024) return bytes + ' B';
if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}
function copyText(text, okMsg) {
var tip = $('gc-tip');
function done(msg) { if (tip) { tip.textContent = msg; tip.style.display = 'block';}}
if (navigator.clipboard && navigator.clipboard.writeText) {
navigator.clipboard.writeText(text).then(function () { done(okMsg);},
function () { fallbackCopy(text, okMsg, done);});
} else {
fallbackCopy(text, okMsg, done);
}
}
function fallbackCopy(text, okMsg, done) {
var ta = document.createElement('textarea');
ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
document.body.appendChild(ta); ta.select();
try { document.execCommand('copy'); done(okMsg);}
catch (e) { done('复制失败：请手动选择复制。');}
document.body.removeChild(ta);
}

var parsed = null, fileName = '', fileSize = 0, fileText = '';
var currentLayer = 0, zoom = 1, speed = 1, playing = false, timer = null;

function bounds() {
var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, i, j, mv, has = false;
if (!parsed) return null;
for (i = 0; i < parsed.layers.length; i++) {
for (j = 0; j < parsed.layers[i].moves.length; j++) {
mv = parsed.layers[i].moves[j];
has = true;
minX = Math.min(minX, mv.x0, mv.x1); maxX = Math.max(maxX, mv.x0, mv.x1);
minY = Math.min(minY, mv.y0, mv.y1); maxY = Math.max(maxY, mv.y0, mv.y1);
}
}
if (!has) return { minX: -10, minY: -10, maxX: 10, maxY: 10};
if (maxX - minX < 1e-9) { minX -= 5; maxX += 5;}
if (maxY - minY < 1e-9) { minY -= 5; maxY += 5;}
return { minX: minX, minY: minY, maxX: maxX, maxY: maxY};
}

function render() {
var cv = $('gc-canvas');
if (!cv) return;
var ctx = cv.getContext('2d');
var dpr = window.devicePixelRatio || 1;
var w = cv.clientWidth, h = cv.clientHeight;
if (!w ||!h) return;
cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
ctx.clearRect(0, 0, w, h);
ctx.fillStyle = '#f9fafb'; ctx.fillRect(0, 0, w, h);
if (!parsed ||!parsed.layers.length) {
ctx.fillStyle = '#9ca3af'; ctx.font = '15px sans-serif'; ctx.textAlign = 'center';
ctx.fillText('尚未加载 G-code：拖入文件或点下方预设示例', w / 2, h / 2);
return;
}
var b = bounds();
var pad = 24;
var scale = Math.min((w - pad * 2) / (b.maxX - b.minX), (h - pad * 2) / (b.maxY - b.minY)) * zoom;
function px(x) { return pad + (x - b.minX) * scale + (w - pad * 2 - (b.maxX - b.minX) * scale) / 2;}
function py(y) { return h - pad - (y - b.minY) * scale - (h - pad * 2 - (b.maxY - b.minY) * scale) / 2;}
var layer = getLayer(parsed, currentLayer);
if (!layer) return;
var i, mv;
ctx.lineCap = 'round'; ctx.lineJoin = 'round';
/* 先画空走（淡色虚线），再画挤出（实色），挤出压在上层。 */
ctx.strokeStyle = '#9ca3af'; ctx.lineWidth = 1.2; ctx.setLineDash([5, 4]);
ctx.beginPath();
for (i = 0; i < layer.moves.length; i++) {
mv = layer.moves[i];
if (!mv.extrude) { ctx.moveTo(px(mv.x0), py(mv.y0)); ctx.lineTo(px(mv.x1), py(mv.y1));}
}
ctx.stroke();
ctx.setLineDash([]);
ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 2;
ctx.beginPath();
for (i = 0; i < layer.moves.length; i++) {
mv = layer.moves[i];
if (mv.extrude) { ctx.moveTo(px(mv.x0), py(mv.y0)); ctx.lineTo(px(mv.x1), py(mv.y1));}
}
ctx.stroke();
/* 起点标记 */
if (layer.moves.length) {
var s0 = layer.moves[0];
ctx.fillStyle = '#16a34a';
ctx.beginPath(); ctx.arc(px(s0.x0), py(s0.y0), 4, 0, Math.PI * 2); ctx.fill();
}
}

function updateLayerPanel() {
var info = $('gc-layer-info');
var slider = $('gc-layer-slider');
if (!parsed ||!parsed.layers.length) {
if (info) info.innerHTML = '<span class="gc-muted">未加载文件。</span>';
if (slider) { slider.disabled = true; slider.max = 0; slider.value = 0;}
return;
}
var total = parsed.layers.length;
currentLayer = clampLayer(currentLayer, total);
if (slider) { slider.disabled = false; slider.max = total - 1; slider.value = currentLayer;}
var st = layerStats(getLayer(parsed, currentLayer));
if (info) {
info.innerHTML =
'<div class="gc-icard"><div class="gc-it">当前层 / 总层数</div><div class="gc-iv">第 ' + (currentLayer + 1) + ' 层 / 共 ' + total + ' 层</div></div>' +
'<div class="gc-icard"><div class="gc-it">Z 高度</div><div class="gc-iv">' + fmt(st.z, 2) + ' mm</div></div>' +
'<div class="gc-icard"><div class="gc-it">该层挤出</div><div class="gc-iv">' + fmt(st.extrudeMm) + ' mm（' + st.extrudeCount + ' 段）</div></div>' +
'<div class="gc-icard"><div class="gc-it">该层空走</div><div class="gc-iv">' + fmt(st.travelMm) + ' mm（' + st.travelCount + ' 段）</div></div>' +
'<div class="gc-icard"><div class="gc-it">该层预估时长</div><div class="gc-iv">' + esc(formatDuration(st.seconds)) + '</div></div>';
}
var lbl = $('gc-layer-label');
if (lbl) lbl.textContent = '第 ' + (currentLayer + 1) + ' / ' + total + ' 层（Z ' + fmt(st.z, 2) + ' mm）';
}

function updateStats() {
var el = $('gc-stats');
if (!el) return;
if (!parsed) { el.innerHTML = '<span class="gc-muted">未加载文件。</span>'; return;}
var s = parsed.stats;
el.innerHTML =
'<div class="gc-icard"><div class="gc-it">文件大小</div><div class="gc-iv">' + esc(fmtSize(fileSize)) + '</div></div>' +
'<div class="gc-icard"><div class="gc-it">总行数</div><div class="gc-iv">' + s.totalLines + '</div></div>' +
'<div class="gc-icard"><div class="gc-it">总层数</div><div class="gc-iv">' + s.totalLayers + '</div></div>' +
'<div class="gc-icard"><div class="gc-it">层高中位数</div><div class="gc-iv">' + fmt(s.layerHeightMedianMm, 2) + ' mm</div></div>' +
'<div class="gc-icard"><div class="gc-it">总挤出</div><div class="gc-iv">' + fmt(s.totalExtrudeMm) + ' mm</div></div>' +
'<div class="gc-icard"><div class="gc-it">总空走</div><div class="gc-iv">' + fmt(s.totalTravelMm) + ' mm</div></div>' +
'<div class="gc-icard"><div class="gc-it">预估时长</div><div class="gc-iv">' + esc(formatDuration(s.estimatedSeconds)) + '</div></div>' +
'<div class="gc-icard"><div class="gc-it">预估耗材</div><div class="gc-iv">' + fmt(s.filamentGrams) + ' g（' + fmt(s.filamentMeters, 2) + ' m）</div></div>';
}

function setStatus(msg) { var el = $('gc-status'); if (el) el.textContent = msg || '';}
function showPanels() {
['gc-viewport-wrap', 'gc-layer-wrap', 'gc-stats-wrap', 'gc-actions-wrap'].forEach(function (id) {
var el = $(id); if (el) el.style.display = '';
});
}

function loadText(text, name, size) {
try {
parsed = parseGcode(text);
} catch (e) {
setStatus('解析失败：' + e.message);
return;
}
fileText = text; fileName = name || '未命名.gcode'; fileSize = size || 0;
currentLayer = 0;
stopPlay();
showPanels();
if (!parsed.layers.length) {
setStatus('文件中没有可解析的 G0/G1 移动：请确认是 Marlin/RepRap 风格 G-code。');
} else {
setStatus('已加载「' + fileName + '」：' + parsed.stats.totalLines + ' 行，' +
parsed.stats.totalLayers + ' 层，预估 ' + formatDuration(parsed.stats.estimatedSeconds) + '。');
}
var src = $('gc-srcinfo');
if (src) { src.style.display = 'block'; src.textContent = '来源：' + fileName + '（' + fmtSize(fileSize) + '）';}
updateLayerPanel(); updateStats(); render();
}

function stopPlay() {
if (timer) { clearInterval(timer); timer = null;}
playing = false;
var btn = $('gc-play');
if (btn) btn.textContent = '▶ 播放';
}
function startPlay() {
if (!parsed ||!parsed.layers.length) { setStatus('请先加载 G-code 文件或预设示例。'); return;}
if (currentLayer >= parsed.layers.length - 1) currentLayer = 0;
playing = true;
var btn = $('gc-play');
if (btn) btn.textContent = '⏸ 暂停';
updateLayerPanel(); render();
timer = setInterval(function () {
if (currentLayer >= parsed.layers.length - 1) { stopPlay(); return;}
currentLayer++;
updateLayerPanel(); render();
}, Math.round(600 / speed));
}
function stepLayer(delta) {
if (!parsed ||!parsed.layers.length) return;
stopPlay();
currentLayer = clampLayer(currentLayer + delta, parsed.layers.length);
updateLayerPanel(); render();
}

function buildSummaryText() {
if (!parsed) return '';
var s = parsed.stats;
return '\n' +
'文件：' + fileName + '（' + fmtSize(fileSize) + '）\n' +
'总行数：' + s.totalLines + ' 行\n' +
'总层数：' + s.totalLayers + ' 层\n' +
'层高中位数：' + fmt(s.layerHeightMedianMm, 2) + ' mm\n' +
'总挤出：' + fmt(s.totalExtrudeMm) + ' mm\n' +
'总空走：' + fmt(s.totalTravelMm) + ' mm\n' +
'预估时长：' + formatDuration(s.estimatedSeconds) + '\n' +
'预估耗材：' + fmt(s.filamentGrams) + ' g（' + fmt(s.filamentMeters, 2) + ' m，PLA 1.75mm 估算）';
}

function clearAll() {
stopPlay();
parsed = null; fileName = ''; fileSize = 0; fileText = '';
currentLayer = 0; zoom = 1;
var zs = $('gc-zoom'); if (zs) zs.value = 1;
var zl = $('gc-zoom-label'); if (zl) zl.textContent = '100%';
var fi = $('gc-file'); if (fi) fi.value = '';
var src = $('gc-srcinfo'); if (src) { src.style.display = 'none'; src.textContent = '';}
setStatus('');
var tip = $('gc-tip'); if (tip) { tip.style.display = 'none'; tip.textContent = '';}
updateLayerPanel(); updateStats(); render();
}

function handleFile(file) {
if (!file) return;
if (!/\.(gcode|gco|nc)$/i.test(file.name)) {
setStatus('不支持的文件类型：仅接受.gcode /.gco /.nc。');
return;
}
if (file.size > MAX_FILE_BYTES) {
setStatus('文件超过 20MB 上限（' + fmtSize(file.size) + '），请用更小的文件。');
return;
}
var rd = new FileReader();
rd.onload = function () { loadText(String(rd.result || ''), file.name, file.size);};
rd.onerror = function () { setStatus('读取文件失败，请重试。');};
rd.readAsText(file);
}

document.addEventListener('DOMContentLoaded', function () {
var up = $('gc-upload'), fi = $('gc-file');
if (up && fi) {
up.addEventListener('click', function () { fi.click();});
up.addEventListener('keydown', function (ev) {
if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); fi.click();}
});
['dragover', 'dragenter'].forEach(function (evn) {
up.addEventListener(evn, function (ev) { ev.preventDefault(); up.classList.add('dragover');});
});
['dragleave', 'drop'].forEach(function (evn) {
up.addEventListener(evn, function (ev) { ev.preventDefault(); up.classList.remove('dragover');});
});
up.addEventListener('drop', function (ev) {
var f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
handleFile(f);
});
fi.addEventListener('change', function () { handleFile(fi.files && fi.files[0]);});
}
var slider = $('gc-layer-slider');
if (slider) {
slider.addEventListener('input', function () {
stopPlay();
currentLayer = clampLayer(parseInt(slider.value, 10) || 0, parsed? parsed.layers.length: 0);
updateLayerPanel(); render();
});
}
var prev = $('gc-prev'), next = $('gc-next');
if (prev) prev.addEventListener('click', function () { stepLayer(-1);});
if (next) next.addEventListener('click', function () { stepLayer(1);});
var play = $('gc-play');
if (play) play.addEventListener('click', function () { playing? stopPlay(): startPlay();});
var sp = $('gc-speed');
if (sp) sp.addEventListener('change', function () {
speed = parseFloat(sp.value) || 1;
if (playing) { stopPlay(); startPlay();}
});
var zs = $('gc-zoom');
if (zs) zs.addEventListener('input', function () {
zoom = parseFloat(zs.value) || 1;
var zl = $('gc-zoom-label'); if (zl) zl.textContent = Math.round(zoom * 100) + '%';
render();
});
var presetsEl = $('gc-presets');
if (presetsEl) {
var list = getPresets(), html = '', i;
for (i = 0; i < list.length; i++) {
html += '<button type="button" class="gc-chip" data-preset="' + esc(list[i].id) + '">' +
esc(list[i].name) + '（' + esc(list[i].desc) + '）</button>';
}
presetsEl.innerHTML = html;
var chips = presetsEl.querySelectorAll('.gc-chip');
for (i = 0; i < chips.length; i++) {
chips[i].addEventListener('click', function () {
var p = null, k;
for (k = 0; k < list.length; k++) if (list[k].id === this.getAttribute('data-preset')) p = list[k];
if (p) loadText(p.text, '预设示例：' + p.name + '.gcode', p.text.length);
});
}
}
var copyBtn = $('gc-copy-btn');
if (copyBtn) copyBtn.addEventListener('click', function () {
if (!parsed) { var tip = $('gc-tip'); if (tip) { tip.textContent = '暂无可复制的统计：请先加载文件或预设示例。'; tip.style.display = 'block';} return;}
copyText(buildSummaryText(), '已复制统计摘要。');
});
var clearBtn = $('gc-clear');
if (clearBtn) clearBtn.addEventListener('click', clearAll);
window.addEventListener('resize', render);
render();
});
})();
}

})();
