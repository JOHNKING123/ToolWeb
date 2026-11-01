/* WhatsApp 链接生成器 - 国家码＋手机号＋预填消息 → wa.me 链接实时预览／一键复制／内嵌二维码／一键打开
* 零后端、零 fetch/XHR、零 CDN。二维码渲染依赖本地 vendored 的 qrcode-generator 1.4.4（canvas 手绘矩阵）。
* 纯函数契约（浏览器/Node 通用，非法参数抛 Error，err.field 给出字段名，不静默钳制）：
* normalizePhone(raw) -> 纯数字串（剔除首 +、空格、连字符、圆括号；
* raw 非字符串，或剔除后为空，或仍含其它非数字字符 → 抛 Error，err.field='phone'）
* buildWaLink(countryCode, phone, message)
* -> 'https://wa.me/<国家码><纯数字手机号>[?text=<encodeURIComponent(消息)>]'
* （countryCode 非纯数字串 → 抛 Error，err.field='countryCode'；
* phone 经 normalizePhone 非法 → 抛 Error，err.field='phone'；
* message 非字符串 → 抛 Error，err.field='message'；
* message 为空字符串时不带 text 参数）
* Node 自测：module.exports 暴露纯函数与二维码矩阵工具。
*/
(function () {
'use strict';

var WA_BASE = 'https://wa.me/';

/* ============ 国家码选项 ============ */
var COUNTRY_CODES = [
{ code: '86', label: '中国大陆 +86'},
{ code: '852', label: '中国香港 +852'},
{ code: '853', label: '中国澳门 +853'},
{ code: '886', label: '中国台湾 +886'},
{ code: '1', label: '美国 / 加拿大 +1'},
{ code: '44', label: '英国 +44'},
{ code: '81', label: '日本 +81'},
{ code: '82', label: '韩国 +82'},
{ code: '65', label: '新加坡 +65'},
{ code: '60', label: '马来西亚 +60'},
{ code: '66', label: '泰国 +66'},
{ code: '84', label: '越南 +84'},
{ code: '63', label: '菲律宾 +63'},
{ code: '62', label: '印度尼西亚 +62'},
{ code: '91', label: '印度 +91'},
{ code: '61', label: '澳大利亚 +61'},
{ code: '49', label: '德国 +49'},
{ code: '33', label: '法国 +33'},
{ code: '39', label: '意大利 +39'},
{ code: '34', label: '西班牙 +34'},
{ code: '7', label: '俄罗斯 +7'},
{ code: '55', label: '巴西 +55'},
{ code: '971', label: '阿联酋 +971'},
{ code: '966', label: '沙特阿拉伯 +966'},
{ code: 'custom', label: '自定义（手动输入）'}
];

function err(field, msg) {
var e = new Error(msg);
e.field = field;
return e;
}

/* 手机号 normalize：剔除 1 个首 +、全部空格/连字符/半角圆括号；非法抛 Error（err.field='phone'） */
function normalizePhone(raw) {
if (typeof raw!== 'string') {
throw err('phone', 'normalizePhone: raw 必须为字符串');
}
var s = raw;
if (s.charAt(0) === '+') { s = s.slice(1);}
s = s.replace(/[\s\-()]/g, '');
if (s.length === 0) {
throw err('phone', 'normalizePhone: 手机号剔除分隔符后为空');
}
if (!/^\d+$/.test(s)) {
throw err('phone', 'normalizePhone: 手机号含非法字符（仅允许数字、空格、连字符、圆括号与首 +）');
}
return s;
}

/* 国家码合法性：纯数字串 */
function assertCountryCode(countryCode) {
if (typeof countryCode!== 'string' ||!/^\d+$/.test(countryCode)) {
throw err('countryCode', 'buildWaLink: 国家码必须为纯数字串（如 "86"）');
}
return countryCode;
}

/* wa.me 链接构建；message 为空字符串时不带 text 参数 */
function buildWaLink(countryCode, phone, message) {
assertCountryCode(countryCode);
var digits = normalizePhone(phone); /* 非法时 err.field='phone'，直接透传 */
if (typeof message!== 'string') {
throw err('message', 'buildWaLink: message 必须为字符串（可为空字符串）');
}
var url = WA_BASE + countryCode + digits;
if (message.length > 0) {
url += '?text=' + encodeURIComponent(message);
}
return url;
}

/* ============ 二维码引擎（浏览器取全局，Node 取 vendored） ============ */
function getQrEngine() {
if (typeof qrcode === 'function') { return qrcode;}
if (typeof module!== 'undefined' && module.exports && typeof require === 'function') {
try { return require('./vendor/qrcode-generator-1.4.4.min.js');}
catch (e) { return null;}
}
return null;
}

/* wa.me 链接 → 二维码矩阵 { count, isDark(r, c)}。typeNumber=0 自动选择最小版本。 */
function makeWaQrMatrix(text, ecLevel) {
var engine = getQrEngine();
if (!engine) { throw new Error('二维码引擎未加载');}
if (engine.stringToBytesFuncs && engine.stringToBytesFuncs['UTF-8']) {
engine.stringToBytes = engine.stringToBytesFuncs['UTF-8'];
}
var qr = engine(0, ecLevel || 'M');
qr.addData(text);
qr.make();
var n = qr.getModuleCount();
return {
count: n,
isDark: function (r, c) { return qr.isDark(r, c);}
};
}

/* node 单元测试导出 */
if (typeof module!== 'undefined' && module.exports) {
module.exports = {
WA_BASE: WA_BASE,
COUNTRY_CODES: COUNTRY_CODES,
normalizePhone: normalizePhone,
buildWaLink: buildWaLink,
getQrEngine: getQrEngine,
makeWaQrMatrix: makeWaQrMatrix
};
}

/* ============ 浏览器 UI（DOM 存在时才挂载） ============ */
if (typeof document!== 'undefined') {

function $(id) { return document.getElementById(id);}

function toast(msg, ok) {
var t = $('wlg-toast');
if (!t) { return;}
t.textContent = msg;
t.className = 'wlg-toast show ' + (ok === false? 'fail': 'ok');
clearTimeout(toast._timer);
toast._timer = setTimeout(function () { t.className = 'wlg-toast';}, 2400);
}

/* 复制：Clipboard API 优先，降级 execCommand */
function copyText(text, cb) {
if (navigator.clipboard && navigator.clipboard.writeText) {
navigator.clipboard.writeText(text).then(function () { cb(true);}, function () { cb(false);});
} else {
var ta = document.createElement('textarea');
ta.value = text;
ta.style.position = 'fixed'; ta.style.opacity = '0';
document.body.appendChild(ta);
ta.select();
var ok = false;
try { ok = document.execCommand('copy');} catch (e) { ok = false;}
document.body.removeChild(ta);
cb(ok);
}
}

/* 矩阵 → canvas（居中、含静区），返回 canvas 元素 */
function renderQrToCanvas(matrix, size, fg, bg) {
var margin = 4;
var n = matrix.count;
var total = n + margin * 2;
var canvas = document.createElement('canvas');
canvas.width = size; canvas.height = size;
var ctx = canvas.getContext('2d');
var cell = size / total;
ctx.fillStyle = bg || '#ffffff';
ctx.fillRect(0, 0, size, size);
ctx.fillStyle = fg || '#075e54';
for (var r = 0; r < n; r++) {
for (var c = 0; c < n; c++) {
if (matrix.isDark(r, c)) {
ctx.fillRect(Math.round((c + margin) * cell), Math.round((r + margin) * cell),
Math.ceil(cell), Math.ceil(cell));
}
}
}
return canvas;
}

/* 当前国家码：下拉为自定义时取手动输入框并剔除首 + */
function currentCountryCode() {
var sel = $('wlg-country');
if (sel.value === 'custom') {
var v = $('wlg-country-custom').value.trim();
if (v.charAt(0) === '+') { v = v.slice(1);}
return v;
}
return sel.value;
}

var lastLink = '';

/* 主刷新：读表单 → 纯函数构建 → 链接预览／回显／二维码 */
function refresh() {
var countryCode = currentCountryCode();
var phoneRaw = $('wlg-phone').value;
var message = $('wlg-message').value;
var errBox = $('wlg-err');
var linkBox = $('wlg-link');
var qrBox = $('wlg-qr');
var normBox = $('wlg-phone-norm');

/* 字符计数＋编码后长度提示 */
var msgLen = message.length;
var encLen = message.length? encodeURIComponent(message).length: 0;
$('wlg-msg-count').textContent = '已输入 ' + msgLen + ' 字符' +
(msgLen? '（encodeURIComponent 编码后约 ' + encLen + ' 字节）': '');

var link = '';
try {
link = buildWaLink(countryCode, phoneRaw, message);
} catch (e) {
lastLink = '';
errBox.style.display = 'block';
errBox.textContent = (e && e.field? '': '') + (e && e.message? e.message: '输入有误');
linkBox.value = '';
normBox.textContent = '';
qrBox.innerHTML = '<div class="wlg-qr-empty">填写正确的国家码与手机号后自动生成二维码</div>';
$('wlg-copy').disabled = true;
$('wlg-open').disabled = true;
return;
}

lastLink = link;
errBox.style.display = 'none';
errBox.textContent = '';
linkBox.value = link;
try {
normBox.textContent = '号码 normalize 结果：' + countryCode + ' ' + normalizePhone(phoneRaw);
} catch (e) { normBox.textContent = '';}

/* 二维码 canvas 渲染（本地 vendored 引擎） */
try {
var matrix = makeWaQrMatrix(link, 'M');
var canvas = renderQrToCanvas(matrix, 220, '#075e54', '#ffffff');
canvas.style.maxWidth = '100%';
qrBox.innerHTML = '';
qrBox.appendChild(canvas);
$('wlg-qr-info').textContent = '扫码直达该 WhatsApp 聊天 · 矩阵 ' + matrix.count + '×' + matrix.count +
' · 本地渲染，零网络请求';
} catch (e) {
qrBox.innerHTML = '<div class="wlg-qr-empty">二维码生成失败：' + e.message + '</div>';
$('wlg-qr-info').textContent = '';
}

$('wlg-copy').disabled = false;
$('wlg-open').disabled = false;
}

/* 事件绑定 */
document.addEventListener('DOMContentLoaded', function () {
var sel = $('wlg-country');
COUNTRY_CODES.forEach(function (c, i) {
var o = document.createElement('option');
o.value = c.code; o.textContent = c.label;
if (i === 0) { o.selected = true;}
sel.appendChild(o);
});

function syncCustomRow() {
var isCustom = sel.value === 'custom';
$('wlg-custom-row').style.display = isCustom? 'flex': 'none';
}
sel.addEventListener('change', function () { syncCustomRow(); refresh();});
syncCustomRow();

$('wlg-country-custom').addEventListener('input', refresh);
$('wlg-phone').addEventListener('input', refresh);
$('wlg-message').addEventListener('input', refresh);

/* 填入示例 */
$('wlg-sample').addEventListener('click', function () {
sel.value = '86';
syncCustomRow();
$('wlg-phone').value = '138-0000 0000';
$('wlg-message').value = '你好，我在你的网站上看到这个产品，想咨询一下。';
refresh();
toast('已填入示例，可直接复制链接或扫码', true);
});

/* 一键复制 */
$('wlg-copy').addEventListener('click', function () {
if (!lastLink) { return;}
copyText(lastLink, function (ok) {
toast(ok? '✅ 链接已复制到剪贴板': '❌ 复制失败，请手动选择复制', ok);
});
});

/* 在 WhatsApp 打开 */
$('wlg-open').addEventListener('click', function () {
if (!lastLink) { return;}
window.open(lastLink, '_blank', 'noopener');
});

refresh();
});

} /* typeof document!== 'undefined' */
})();
