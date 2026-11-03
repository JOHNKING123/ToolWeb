/* 中文编码转换器 - 纯前端：中文↔\uXXXX 双向互转（Java native2ascii 兼容）＋
 * 乱码恢复/反查（两种字节假设 × 12 候选编码批量试解）＋文件按编码解码，
 * 一键复制＋示例填充，浏览器本地运行，不上传。
 *
 * 功能：
 * ① 中文 → \uXXXX：Java native2ascii 兼容口径，非 ASCII 字符转小写 \uXXXX，
 *    增补平面（code point > 0xFFFF，如 Emoji）按 UTF-16 代理对输出两段 \uXXXX；
 *    ASCII（0x00~0x7F）原样保留；
 * ② \uXXXX → 中文：反向解析，\uXXXX 大小写 hex 均认，代理对（\uD800-\uDBFF
 *    后紧跟 \uDC00-\uDFFF）合并为增补平面字符，非法序列（\u 后不足 4 个 hex、
 *    孤立代理项）原样保留；
 * ③ 乱码恢复/反查：把乱码文本按两种字节假设（utf-8 / latin1）还原为字节，
 *    再用 12 个候选编码标签逐一试解，返回 [{bytes, label, text}] 候选列表供人工选择；
 * ④ 文件按编码解码：FileReader 读 ArrayBuffer ＋ TextDecoder 按所选编码解码预览。
 *
 * 纯函数契约（浏览器/Node 通用，非法参数抛 Error 且 err.field 标明字段）：
 * escapeUnicode(text) -> string
 *   text 非字符串 → 抛 Error，err.field='text'；
 *   空串 → 返回 ""；
 *   逐 code point：cp < 0x80 原样保留；0x80 ≤ cp ≤ 0xFFFF → '\u'＋小写 4 位 hex；
 *   cp > 0xFFFF → 代理对，两段 '\u'＋小写 4 位 hex（如 😀 → \ud83d\ude00）。
 * unescapeUnicode(text) -> string
 *   text 非字符串 → 抛 Error，err.field='text'；
 *   空串 → 返回 ""；
 *   扫描 \uXXXX（hex 大小写不限）：高代理后紧跟 \uDC00-\uDFFF 合并为增补平面字符；
 *   \u 后不足 4 个 hex、孤立高/低代理 → 该序列原样保留（如 "a\u12b" 不变）。
 * decodeBytes(bytes, label) -> string
 *   bytes 接受 Array（元素须为 0~255 整数）/ Uint8Array / 其他 TypedArray / ArrayBuffer，
 *   其他类型或越界元素 → 抛 Error，err.field='bytes'；
 *   label 非字符串或空 → 抛 Error，err.field='label'；
 *   TextDecoder 不支持的标签 → 抛 Error，err.field='label'；
 *   解码用 {fatal:false}，非法字节序列以 U+FFFD 占位。
 * recoverMojibake(text) -> [{bytes, label, text}]
 *   text 非字符串 → 抛 Error，err.field='text'；
 *   空串 → 返回 []；
 *   两种字节假设：'utf-8'（TextEncoder 编码）、'latin1'（逐字符 charCodeAt & 0xFF，
 *   超出 U+00FF 的字符按低 8 位截断，乱码文本本就来自 latin1 误读、字符恒 ≤ U+00FF）；
 *   × 12 个 CANDIDATE_LABELS 逐一 TextDecoder({fatal:true}) 试解：解码失败跳过、
 *   解出结果与输入完全相同跳过、同一假设下文本重复的只保留首个标签；
 *   每项 {bytes:'utf-8'|'latin1', label:候选标签, text:试解文本}，人工从中选择。
 * CANDIDATE_LABELS -> string[12]：utf-8、gbk、gb18030、big5、big5-hkscs、
 *   shift_jis、euc-jp、euc-kr、iso-8859-1、windows-1252、utf-16le、utf-16be。
 *
 * 浏览器内运行：文件尾部把 init 挂到 DOMContentLoaded；挂 window.EncodingConverter。
 * Node 自测：module.exports 暴露纯函数与 CANDIDATE_LABELS。
 */
(function () {
'use strict';

/* 12 个候选编码标签（全部为 WHATWG Encoding Standard 合法标签） */
var CANDIDATE_LABELS = [
'utf-8', 'gbk', 'gb18030', 'big5', 'big5-hkscs',
'shift_jis', 'euc-jp', 'euc-kr',
'iso-8859-1', 'windows-1252',
'utf-16le', 'utf-16be'
];

/* 乱码恢复的两种字节假设：把乱码文本还原成「当初的字节」 */
var BYTE_HYPOTHESES = ['utf-8', 'latin1'];

function mkErr(field, msg) {
var e = new Error(msg);
e.field = field;
return e;
}

function pad4(hex) {
hex = String(hex).toLowerCase();
while (hex.length < 4) { hex = '0' + hex; }
return hex;
}

function isHex4(s) {
return /^[0-9a-fA-F]{4}$/.test(s);
}

/* 中文 → \uXXXX（Java native2ascii 兼容：非 ASCII 小写转义，增补平面用代理对） */
function escapeUnicode(text) {
if (typeof text !== 'string') {
throw mkErr('text', 'text 必须是字符串');
}
var out = '';
for (var i = 0; i < text.length; i++) {
var cp = text.codePointAt(i);
if (cp < 0x80) {
out += text.charAt(i);
} else if (cp <= 0xFFFF) {
out += '\\u' + pad4(cp.toString(16));
} else {
var v = cp - 0x10000;
out += '\\u' + pad4((0xD800 + (v >> 10)).toString(16)) +
'\\u' + pad4((0xDC00 + (v & 0x3FF)).toString(16));
i++;
}
}
return out;
}

/* \uXXXX → 中文（代理对合并，非法序列原样保留） */
function unescapeUnicode(text) {
if (typeof text !== 'string') {
throw mkErr('text', 'text 必须是字符串');
}
var out = '';
var i = 0;
while (i < text.length) {
if (text.charAt(i) === '\\' && text.charAt(i + 1) === 'u' &&
i + 6 <= text.length && isHex4(text.substr(i + 2, 4))) {
var code = parseInt(text.substr(i + 2, 4), 16);
/* 高代理：看后面是否紧跟 \uDC00-\uDFFF，能合并就合并 */
if (code >= 0xD800 && code <= 0xDBFF &&
text.charAt(i + 6) === '\\' && text.charAt(i + 7) === 'u' &&
i + 12 <= text.length && isHex4(text.substr(i + 8, 4))) {
var lo = parseInt(text.substr(i + 8, 4), 16);
if (lo >= 0xDC00 && lo <= 0xDFFF) {
out += String.fromCharCode(code, lo);
i += 12;
continue;
}
}
/* 孤立代理项：原样保留整个 \uXXXX */
if ((code >= 0xD800 && code <= 0xDBFF) || (code >= 0xDC00 && code <= 0xDFFF)) {
out += text.substr(i, 6);
i += 6;
continue;
}
out += String.fromCharCode(code);
i += 6;
} else {
out += text.charAt(i);
i++;
}
}
return out;
}

/* bytes 归一化为 Uint8Array（非法抛 Error，err.field='bytes'） */
function normalizeBytes(bytes) {
var arr;
if (bytes instanceof Uint8Array) {
arr = bytes;
} else if (typeof ArrayBuffer !== 'undefined' && bytes instanceof ArrayBuffer) {
arr = new Uint8Array(bytes);
} else if (bytes && typeof bytes === 'object' && typeof bytes.byteLength === 'number' &&
typeof bytes.buffer !== 'undefined') {
arr = new Uint8Array(bytes.buffer, bytes.byteOffset || 0, bytes.byteLength);
} else if (Array.isArray(bytes)) {
arr = new Uint8Array(bytes.length);
for (var i = 0; i < bytes.length; i++) {
var b = bytes[i];
if (typeof b !== 'number' || b !== Math.floor(b) || b < 0 || b > 255) {
throw mkErr('bytes', 'bytes 元素必须是 0~255 的整数（下标 ' + i + '）');
}
arr[i] = b;
}
} else {
throw mkErr('bytes', 'bytes 必须是字节数组（Array/Uint8Array/ArrayBuffer）');
}
return arr;
}

/* 字节数组按编码标签解码 */
function decodeBytes(bytes, label) {
var arr = normalizeBytes(bytes);
if (typeof label !== 'string' || !label.trim()) {
throw mkErr('label', 'label 必须是非空字符串（如 "gbk"）');
}
var dec;
try {
dec = new TextDecoder(label.trim(), { fatal: false });
} catch (e) {
throw mkErr('label', '不支持的编码标签：' + label);
}
return dec.decode(arr);
}

/* 乱码文本 → 字节（按假设） */
function textToBytes(text, hypothesis) {
if (hypothesis === 'utf-8') {
return new TextEncoder().encode(text);
}
var out = new Uint8Array(text.length);
for (var i = 0; i < text.length; i++) {
out[i] = text.charCodeAt(i) & 0xFF;
}
return out;
}

/* 乱码恢复/反查：两种字节假设 × 12 候选编码批量试解，人工选择 */
function recoverMojibake(text) {
if (typeof text !== 'string') {
throw mkErr('text', 'text 必须是字符串');
}
if (!text) {
return [];
}
var results = [];
var seen = {};
for (var h = 0; h < BYTE_HYPOTHESES.length; h++) {
var hyp = BYTE_HYPOTHESES[h];
var bytes = textToBytes(text, hyp);
for (var k = 0; k < CANDIDATE_LABELS.length; k++) {
var label = CANDIDATE_LABELS[k];
var decoded;
try {
decoded = new TextDecoder(label, { fatal: true }).decode(bytes);
} catch (e) {
continue;
}
if (decoded === text) {
continue;
}
var key = hyp + '|' + decoded;
if (seen[key]) {
continue;
}
seen[key] = true;
results.push({ bytes: hyp, label: label, text: decoded });
}
}
return results;
}

var EncodingConverter = {
escapeUnicode: escapeUnicode,
unescapeUnicode: unescapeUnicode,
decodeBytes: decodeBytes,
recoverMojibake: recoverMojibake,
CANDIDATE_LABELS: CANDIDATE_LABELS
};

/* ---------------- 浏览器 UI ---------------- */

var ESC_SAMPLE = '你好，世界！Hello 123 😀';
var MOJI_SAMPLE = 'ÊÇ·ñ';
var MAX_FILE_SIZE = 2 * 1024 * 1024;

function $(id) { return document.getElementById(id); }

function toast(msg) {
var t = $('ec-toast');
t.textContent = msg;
t.style.display = 'block';
clearTimeout(t._timer);
t._timer = setTimeout(function () { t.style.display = 'none'; }, 2200);
}

function copyText(text, okMsg) {
function done() { toast(okMsg || '已复制到剪贴板'); }
function fallback() {
var ta = document.createElement('textarea');
ta.value = text;
ta.style.position = 'fixed';
ta.style.opacity = '0';
document.body.appendChild(ta);
ta.select();
try { document.execCommand('copy'); done(); }
catch (e) { toast('复制失败，请手动复制'); }
document.body.removeChild(ta);
}
if (navigator.clipboard && navigator.clipboard.writeText) {
navigator.clipboard.writeText(text).then(done, fallback);
} else {
fallback();
}
}

function escapeHtml(s) {
return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ① 中文 ↔ \uXXXX 双向互转 */
function showEscResult(text, note) {
var out = $('ec-out');
out.style.display = 'block';
out.innerHTML = '<pre class="ec-pre">' + escapeHtml(text) + '</pre>' +
'<div class="ec-note">' + note + '</div>';
out._copy = text;
}

function doEscape() {
var raw = $('ec-in').value;
try {
var esc = escapeUnicode(raw);
showEscResult(esc, '中文 → \\uXXXX：共 ' + raw.length + ' 个字符，转义为 ' + esc.length + ' 个字符（ASCII 原样保留）');
} catch (e) {
toast('转义失败：' + e.message);
}
}

function doUnescape() {
var raw = $('ec-in').value;
try {
var txt = unescapeUnicode(raw);
showEscResult(txt, '\\uXXXX → 中文：代理对已合并，非法序列原样保留');
} catch (e) {
toast('解析失败：' + e.message);
}
}

function copyEsc() {
var c = $('ec-out')._copy;
if (c === undefined || c === null) {
toast('请先转换出结果');
return;
}
copyText(c, '转换结果已复制');
}

/* ② 乱码恢复/反查 */
function doRecover() {
var raw = $('ec-moji').value;
var list = $('ec-recover-list');
var box = $('ec-recover-box');
var results;
try {
results = recoverMojibake(raw);
} catch (e) {
toast('恢复失败：' + e.message);
return;
}
box.style.display = 'block';
if (results.length === 0) {
list.innerHTML = '<div class="ec-empty">没有可用的候选解码：输入为空，或所有试解结果都与输入相同。</div>';
box._copy = null;
return;
}
var html = '';
for (var i = 0; i < results.length; i++) {
var r = results[i];
html += '<div class="ec-cand">' +
'<div class="ec-cand-meta"><span class="ec-tag">字节假设：' + escapeHtml(r.bytes) + '</span>' +
'<span class="ec-tag">编码：' + escapeHtml(r.label) + '</span></div>' +
'<pre class="ec-pre">' + escapeHtml(r.text) + '</pre>' +
'<button type="button" class="btn btn-secondary ec-chip" data-i="' + i + '">复制这条</button>' +
'</div>';
}
list.innerHTML = html;
box._results = results;
var btns = list.getElementsByTagName('button');
for (var j = 0; j < btns.length; j++) {
(function (idx) {
btns[idx].addEventListener('click', function () {
copyText(box._results[idx].text, '已复制（' + box._results[idx].label + ' 解码）');
});
})(j);
}
toast('试解完成：' + results.length + ' 条候选，请人工选择');
}

function copyRecoverAll() {
var box = $('ec-recover-box');
if (!box._results || box._results.length === 0) {
toast('请先点「批量试解」');
return;
}
var parts = [];
for (var i = 0; i < box._results.length; i++) {
var r = box._results[i];
parts.push('[' + r.bytes + ' × ' + r.label + ']\n' + r.text);
}
copyText('乱码恢复候选（' + box._results.length + ' 条）：\n\n' + parts.join('\n\n'), '全部候选已复制');
}

/* ③ 文件按编码解码 */
function doDecodeFile() {
var file = $('ec-file').files[0];
var label = $('ec-enc').value;
var out = $('ec-file-out');
if (!file) {
toast('请先选择文件');
return;
}
if (file.size > MAX_FILE_SIZE) {
toast('文件过大（' + (file.size / 1024 / 1024).toFixed(2) + ' MB），上限 2 MB');
return;
}
var reader = new FileReader();
reader.onload = function () {
var buf = reader.result;
try {
var text = new TextDecoder(label, { fatal: false }).decode(buf);
out.style.display = 'block';
out.innerHTML = '<div class="ec-note">「' + escapeHtml(file.name) + '」按 <b>' +
escapeHtml(label) + '</b> 解码（本地读取，未上传）</div>' +
'<pre class="ec-pre ec-filepre">' + escapeHtml(text) + '</pre>';
out._copy = text;
toast('解码完成：' + text.length + ' 个字符');
} catch (e) {
toast('解码失败：' + e.message);
}
};
reader.onerror = function () { toast('文件读取失败，请重试'); };
reader.readAsArrayBuffer(file);
}

function copyFileText() {
var c = $('ec-file-out')._copy;
if (c === undefined || c === null) {
toast('请先解码文件');
return;
}
copyText(c, '解码文本已复制');
}

function init() {
var sel = $('ec-enc');
CANDIDATE_LABELS.forEach(function (label) {
var op = document.createElement('option');
op.value = label;
op.textContent = label;
if (label === 'gbk') { op.selected = true; }
sel.appendChild(op);
});

$('ec-to-esc').addEventListener('click', doEscape);
$('ec-to-text').addEventListener('click', doUnescape);
$('ec-copy').addEventListener('click', copyEsc);
$('ec-sample').addEventListener('click', function () {
$('ec-in').value = ESC_SAMPLE;
doEscape();
toast('已填入示例并转义');
});
$('ec-clear').addEventListener('click', function () {
$('ec-in').value = '';
$('ec-out').style.display = 'none';
$('ec-out')._copy = null;
});

$('ec-recover').addEventListener('click', doRecover);
$('ec-moji-sample').addEventListener('click', function () {
$('ec-moji').value = MOJI_SAMPLE;
doRecover();
});
$('ec-recover-copy').addEventListener('click', copyRecoverAll);
$('ec-moji').addEventListener('keydown', function (e) {
if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { doRecover(); }
});

$('ec-decode-file').addEventListener('click', doDecodeFile);
$('ec-file-copy').addEventListener('click', copyFileText);
}

if (typeof window !== 'undefined') {
window.EncodingConverter = EncodingConverter;
if (document.readyState === 'loading') {
document.addEventListener('DOMContentLoaded', init);
} else {
init();
}
}

if (typeof module !== 'undefined' && module.exports) {
module.exports = EncodingConverter;
}

})();
