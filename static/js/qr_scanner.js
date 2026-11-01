/* 二维码扫描器 - 上传/拖拽/粘贴二维码图片 → 本地 jsQR 解码 → 文本展示/复制/打开链接/定位框/下载
 * 零后端、零 fetch/XHR、零 CDN：解码库 jsQR 以单文件形式 vendored 在 static/vendor/jsQR.min.js，
 * 页面 <script> 本地加载，图片只进 canvas + ImageData，全程不上传。
 * 纯函数契约（浏览器/Node 通用，非法参数抛 Error，err.field 给出字段名，不静默钳制）：
 * validateImageFile(file, maxSize)
 * -> {name, type, size}（file 缺失/非对象 → err.field='file'；type 非 image/* → err.field='type'；
 *    size 非有限正数或超 maxSize(默认 10MB) → err.field='size'）
 * extractQrText(result)
 * -> jsQR 解码结果的 data 文本（result 非对象 → err.field='result'；data 非字符串/空 → err.field='data'）
 * normalizeQrLocation(result)
 * -> [{x,y}×4] 整数化角点（result 非对象 → err.field='result'；location 缺失/角点不全 → err.field='location'）
 * classifyQrContent(text)
 * -> {type:'url'|'wifi'|'vcard'|'text', openable, ...}（text 非字符串/空 → err.field='text'；
 *    仅 http/https 判 url 且 openable=true；WIFI: 解析 ssid/auth/password/hidden；
 *    BEGIN:VCARD 提取 FN；javascript:/data:/ftp:/mailto: 等一律 type='text' 且 openable=false）
 * isOpenableUrl(text)
 * -> 布尔（text 非字符串 → err.field='text'；空串 → false；仅 ^https?:// 白名单 → true，防 javascript: 注入）
 * buildQrDownloadName(now)
 * -> 'qr_decode_YYYYMMDD_HHmmss.txt'（now 缺省为 new Date()；非法 → err.field='now'）
 * Node 自测：module.exports 暴露纯函数。
 */
(function () {
'use strict';

function err(field, msg) {
var e = new Error(msg);
e.field = field;
return e;
}

function pad2(n) { return (n < 10 ? '0' : '') + n; }

/* ---------- 1. 图片文件校验 ---------- */
var DEFAULT_MAX_SIZE = 10 * 1024 * 1024; /* 10MB */

function validateImageFile(file, maxSize) {
if (!file || typeof file !== 'object') {
throw err('file', '未选择图片文件');
}
if (typeof file.type !== 'string' || file.type.toLowerCase().indexOf('image/') !== 0) {
throw err('type', '仅支持图片文件（image/*），当前类型：' + String(file.type));
}
var limit = (typeof maxSize === 'number' && isFinite(maxSize) && maxSize > 0) ? maxSize : DEFAULT_MAX_SIZE;
if (typeof file.size !== 'number' || !isFinite(file.size) || file.size <= 0) {
throw err('size', '图片文件大小无效');
}
if (file.size > limit) {
throw err('size', '图片超过 ' + Math.round(limit / 1024 / 1024) + 'MB 上限');
}
return { name: typeof file.name === 'string' ? file.name : '', type: file.type, size: file.size };
}

/* ---------- 2. 解码结果取文本 ---------- */
function extractQrText(result) {
if (!result || typeof result !== 'object') {
throw err('result', '解码结果为空（未传入 jsQR 结果对象）');
}
if (typeof result.data !== 'string' || result.data.length === 0) {
throw err('data', '解码结果中没有文本内容');
}
return result.data;
}

/* ---------- 3. 定位框角点归一化 ---------- */
function normalizeQrLocation(result) {
if (!result || typeof result !== 'object') {
throw err('result', '解码结果为空（未传入 jsQR 结果对象）');
}
var loc = result.location;
if (!loc || typeof loc !== 'object') {
throw err('location', '解码结果中没有定位框信息');
}
var keys = ['topLeftCorner', 'topRightCorner', 'bottomRightCorner', 'bottomLeftCorner'];
var pts = [];
for (var i = 0; i < keys.length; i++) {
var p = loc[keys[i]];
if (!p || typeof p.x !== 'number' || typeof p.y !== 'number' || !isFinite(p.x) || !isFinite(p.y)) {
throw err('location', '定位框角点缺失或无效：' + keys[i]);
}
pts.push({ x: Math.round(p.x), y: Math.round(p.y) });
}
return pts;
}

/* ---------- 4. 内容分类 ---------- */
function parseWifiFields(body) {
/* body: T:WPA;S:xxx;P:yyy;H:false; 形式；值内 \; \: \, \\ 为转义 */
var out = {};
var cur = '', kvs = [], esc = false;
for (var i = 0; i < body.length; i++) {
var ch = body.charAt(i);
if (esc) { cur += ch; esc = false; continue; }
if (ch === '\\') { esc = true; continue; }
if (ch === ';') { kvs.push(cur); cur = ''; continue; }
cur += ch;
}
if (cur) { kvs.push(cur); }
for (var j = 0; j < kvs.length; j++) {
var kv = kvs[j], idx = -1, e2 = false;
for (var k = 0; k < kv.length; k++) {
var c2 = kv.charAt(k);
if (e2) { e2 = false; continue; }
if (c2 === '\\') { e2 = true; continue; }
if (c2 === ':') { idx = k; break; }
}
if (idx < 0) { continue; }
var key = kv.slice(0, idx).toUpperCase();
var val = kv.slice(idx + 1).replace(/\\(.)/g, '$1');
out[key] = val;
}
return out;
}

function classifyQrContent(text) {
if (typeof text !== 'string' || text.trim().length === 0) {
throw err('text', '待分类内容为空');
}
var t = text.trim();
/* URL：仅 http/https 白名单 */
if (/^https?:\/\//i.test(t)) {
return { type: 'url', url: t, openable: true };
}
/* WiFi 配置 */
if (/^WIFI:/i.test(t)) {
var fields = parseWifiFields(t.replace(/^WIFI:/i, ''));
var hiddenRaw = String(fields.H || '').toLowerCase();
return {
type: 'wifi',
ssid: fields.S || '',
auth: fields.T || '',
password: fields.P || '',
hidden: hiddenRaw === 'true' || hiddenRaw === '1',
openable: false
};
}
/* 电子名片 */
if (/^BEGIN:VCARD/i.test(t)) {
var name = '';
var m = t.match(/(?:^|\r?\n)FN:(.*)/i);
if (m) { name = m[1].trim(); }
return { type: 'vcard', name: name, openable: false };
}
/* 其余一律纯文本（含 javascript:/data:/ftp:/mailto: 等伪协议，绝不给打开按钮） */
return { type: 'text', openable: false };
}

/* ---------- 5. 可打开 URL 白名单 ---------- */
function isOpenableUrl(text) {
if (typeof text !== 'string') {
throw err('text', '待判断内容不是字符串');
}
if (text.trim().length === 0) { return false; }
return /^https?:\/\/\S+$/i.test(text.trim());
}

/* ---------- 6. 下载文件名 ---------- */
function buildQrDownloadName(now) {
var d = (now === undefined || now === null) ? new Date() : now;
if (!(d instanceof Date) || isNaN(d.getTime())) {
throw err('now', '时间参数非法');
}
return 'qr_decode_' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) +
'_' + pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds()) + '.txt';
}

/* Node 自测导出 */
if (typeof module !== 'undefined' && module.exports) {
module.exports = {
validateImageFile: validateImageFile,
extractQrText: extractQrText,
normalizeQrLocation: normalizeQrLocation,
classifyQrContent: classifyQrContent,
isOpenableUrl: isOpenableUrl,
buildQrDownloadName: buildQrDownloadName
};
}

/* ================= 浏览器 UI ================= */
if (typeof document !== 'undefined') {
document.addEventListener('DOMContentLoaded', function () {
if (typeof jsQR !== 'function') {
showErr('解码库加载失败（static/vendor/jsQR.min.js），请刷新重试');
return;
}

var fileInput = $('qrs-file'), drop = $('qrs-drop'), canvas = $('qrs-canvas');
var infoBox = $('qrs-info'), errBox = $('qrs-err'), resultPanel = $('qrs-result');
var textOut = $('qrs-text'), typeBadge = $('qrs-type');
var btnCopy = $('qrs-copy'), btnOpen = $('qrs-open'), btnDl = $('qrs-download'), btnClear = $('qrs-clear');
var currentText = '', currentOpenable = false;

function $(id) { return document.getElementById(id); }

function showErr(msg) {
errBox.style.display = 'block';
errBox.textContent = msg;
}
function hideErr() {
errBox.style.display = 'none';
errBox.textContent = '';
}
function toast(msg, ok) {
var t = $('qrs-toast');
t.textContent = msg;
t.className = 'qrs-toast show ' + (ok ? 'ok' : 'bad');
setTimeout(function () { t.className = 'qrs-toast'; }, 2200);
}
function copyText(text, cb) {
if (navigator.clipboard && navigator.clipboard.writeText) {
navigator.clipboard.writeText(text).then(function () { cb(true); }, function () { cb(false); });
} else {
var ta = document.createElement('textarea');
ta.value = text;
ta.style.position = 'fixed'; ta.style.opacity = '0';
document.body.appendChild(ta);
ta.select();
var ok = false;
try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
document.body.removeChild(ta);
cb(ok);
}
}
function setButtonsEnabled(on) {
btnCopy.disabled = !on;
btnDl.disabled = !on;
btnClear.disabled = !on;
btnOpen.style.display = (on && currentOpenable) ? '' : 'none';
}

function handleFile(file) {
hideErr();
resultPanel.style.display = 'none';
setButtonsEnabled(false);
var meta;
try {
meta = validateImageFile(file);
} catch (e) {
showErr('文件校验失败：' + e.message);
return;
}
infoBox.style.display = 'block';
infoBox.innerHTML = '已载入：<b>' + escapeHtml(meta.name || '（粘贴的图片）') + '</b>（' +
escapeHtml(meta.type) + '，' + (meta.size / 1024).toFixed(1) + ' KB）—— 正在本地解码…';
var url = URL.createObjectURL(file);
var img = new Image();
img.onload = function () {
URL.revokeObjectURL(url);
try {
decodeImage(img);
} catch (e) {
showErr('解码失败：' + e.message);
}
};
img.onerror = function () {
URL.revokeObjectURL(url);
showErr('图片加载失败：文件可能已损坏');
};
img.src = url;
}

function decodeImage(img) {
/* 限制最大边 1600px，兼顾识别率与性能 */
var maxSide = 1600, w = img.naturalWidth, h = img.naturalHeight;
if (!w || !h) { throw err('image', '图片尺寸无效'); }
var scale = Math.min(1, maxSide / Math.max(w, h));
var cw = Math.round(w * scale), ch = Math.round(h * scale);
canvas.width = cw; canvas.height = ch;
var ctx = canvas.getContext('2d', { willReadFrequently: true });
ctx.drawImage(img, 0, 0, cw, ch);
var imageData = ctx.getImageData(0, 0, cw, ch);
var res = jsQR(imageData.data, cw, ch);
if (!res) {
showErr('未检测到二维码：仅支持标准 QR 码；图片模糊、倾斜、反光或码图过小都可能导致识别失败，可换一张更清晰的图重试');
return;
}
var text = extractQrText(res);
var cls = classifyQrContent(text);
currentText = text;
currentOpenable = cls.openable && isOpenableUrl(text);
/* 画定位框 */
try {
var pts = normalizeQrLocation(res);
ctx.strokeStyle = '#16a34a'; ctx.lineWidth = Math.max(3, Math.round(cw / 200));
ctx.beginPath();
ctx.moveTo(pts[0].x, pts[0].y);
for (var i = 1; i < pts.length; i++) { ctx.lineTo(pts[i].x, pts[i].y); }
ctx.closePath(); ctx.stroke();
} catch (e) { /* 无定位框不影响展示文本 */ }
/* 展示结果 */
textOut.value = text;
typeBadge.innerHTML = typeBadgeHtml(cls);
resultPanel.style.display = 'block';
setButtonsEnabled(true);
hideErr();
infoBox.innerHTML = infoBox.innerHTML.replace('正在本地解码…', '解码成功 ✅（纯本地，未上传）');
}

function typeBadgeHtml(cls) {
var label = { url: '🔗 链接', wifi: '📶 WiFi 配置', vcard: '👤 电子名片', text: '📝 纯文本' }[cls.type] || '📝 纯文本';
var extra = '';
if (cls.type === 'wifi' && cls.ssid) {
extra = '（SSID：' + escapeHtml(cls.ssid) + (cls.auth ? '，加密：' + escapeHtml(cls.auth) : '') + '）';
} else if (cls.type === 'vcard' && cls.name) {
extra = '（' + escapeHtml(cls.name) + '）';
}
return '<b>' + label + '</b>' + extra;
}

function escapeHtml(s) {
return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* 上传 */
fileInput.addEventListener('change', function () {
if (fileInput.files && fileInput.files[0]) { handleFile(fileInput.files[0]); }
fileInput.value = '';
});
/* 拖拽 */
['dragenter', 'dragover'].forEach(function (ev) {
drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('drag'); });
});
['dragleave', 'drop'].forEach(function (ev) {
drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('drag'); });
});
drop.addEventListener('drop', function (e) {
var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
if (f) { handleFile(f); }
});
drop.addEventListener('click', function () { fileInput.click(); });
drop.addEventListener('keydown', function (e) {
if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
});
/* 粘贴（截图/Ctrl+V 直接解码） */
document.addEventListener('paste', function (e) {
var files = e.clipboardData && e.clipboardData.files;
if (files && files.length > 0 && /^image\//i.test(files[0].type || '')) {
e.preventDefault();
handleFile(files[0]);
}
});
/* 复制 */
btnCopy.addEventListener('click', function () {
if (!currentText) { return; }
copyText(currentText, function (ok) {
toast(ok ? '✅ 解码文本已复制到剪贴板' : '❌ 复制失败，请手动选择复制', ok);
});
});
/* 打开链接（仅 http/https 白名单，按钮仅此时可见） */
btnOpen.addEventListener('click', function () {
if (!currentText || !currentOpenable) { return; }
window.open(currentText.trim(), '_blank', 'noopener');
});
/* 下载解码文本 */
btnDl.addEventListener('click', function () {
if (!currentText) { return; }
var name;
try { name = buildQrDownloadName(); } catch (e) { name = 'qr_decode.txt'; }
var blob = new Blob(['\uFEFF' + currentText], { type: 'text/plain;charset=utf-8' });
var a = document.createElement('a');
a.href = URL.createObjectURL(blob);
a.download = name;
document.body.appendChild(a);
a.click();
setTimeout(function () { URL.revokeObjectURL(a.href); document.body.removeChild(a); }, 500);
toast('✅ 已开始下载 ' + name, true);
});
/* 清空 */
btnClear.addEventListener('click', function () {
currentText = ''; currentOpenable = false;
textOut.value = '';
resultPanel.style.display = 'none';
infoBox.style.display = 'none';
hideErr();
setButtonsEnabled(false);
var ctx = canvas.getContext('2d');
ctx.clearRect(0, 0, canvas.width, canvas.height);
});

setButtonsEnabled(false);
});
} /* typeof document !== 'undefined' */
})();
