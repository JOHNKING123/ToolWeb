/* PDF 元数据查看与清除器 - 纯前端本地处理（pdf-lib）
* 拖拽/选择上传 PDF（ArrayBuffer 本地处理，零上传）；pdf-lib 经 cdnjs 懒加载。
* 解析 Info 字典（标题/作者/主题/关键词/创建者/Producer/创建日期/修改日期）与 XMP 有无；
* 一键复制文本报告；一键清除（Info 字段置空+时间戳移除+移除 catalog 的 Metadata/XMP 键，save 重写）
* 后下载 -cleaned 后缀文件，并展示清除前后对比小结。 */
(function () {
'use strict';
var PDFLIB_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
var BIG_FILE = 50 * 1024 * 1024;
var INFO_KEYS = ['Title', 'Author', 'Subject', 'Keywords', 'Creator', 'Producer', 'CreationDate', 'ModDate', 'Trapped'];

var state = null; // {name, size, buf, meta, reportText}

function $(id) { return document.getElementById(id);}
function toast(m) {
var el = document.createElement('div');
el.textContent = m;
el.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:#111827;color:#fff;padding:.6rem 1.2rem;border-radius:.5rem;z-index:9999;font-size:.9rem;max-width:86vw;text-align:center;';
document.body.appendChild(el);
setTimeout(function () { el.remove();}, 2800);
}
function fmtSize(n) {
if (n < 1024) return n + ' B';
if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
return (n / 1024 / 1024).toFixed(2) + ' MB';
}
function esc(s) {
return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function showError(m) { var el = $('pmd-error'); el.style.display = 'block'; el.textContent = m;}
function clearError() { var el = $('pmd-error'); el.style.display = 'none'; el.textContent = '';}
function setProgress(pct, txt) {
var box = $('pmd-progress');
box.style.display = 'block';
$('pmd-progress-bar').style.width = pct + '%';
$('pmd-progress-txt').textContent = txt || '';
}
function hideProgress() { $('pmd-progress').style.display = 'none';}

/* ============ CDN 懒加载（参照 pdf-merge-split 先例） ============ */
function ensureLib(src, globalName) {
return new Promise(function (resolve, reject) {
if (window[globalName]) { resolve(); return;}
var s = document.createElement('script');
var done = false;
var timer = setTimeout(function () {
if (!done) { done = true; s.remove(); reject(new Error('timeout'));}
}, 20000);
s.onload = function () {
if (!done) { done = true; clearTimeout(timer); window[globalName]? resolve(): reject(new Error('bad lib'));}
};
s.onerror = function () {
if (!done) { done = true; clearTimeout(timer); reject(new Error('load failed'));}
};
s.src = src;
document.head.appendChild(s);
});
}
var libReady = null;
function ensurePdfLib() {
if (!libReady) libReady = ensureLib(PDFLIB_CDN, 'PDFLib');
return libReady;
}
function showLibFallback() {
$('pmd-fallback').style.display = 'block';
var up = $('pmd-upload');
up.style.opacity = '.55';
up.style.cursor = 'not-allowed';
up.setAttribute('aria-disabled', 'true');
}

/* ============ PDF 读取与错误分类 ============ */
function isPdfMagic(buf) {
var b = new Uint8Array(buf, 0, Math.min(5, buf.byteLength));
return b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2D; // %PDF-
}
function classifyError(e) {
var msg = (e && e.message) || '';
if (/encrypt/i.test(msg)) return '文件已加密（带打开密码），暂不支持解析，请先用「PDF 加密/解密」工具解密后再上传。';
if (/No PDF header|parse PDF/i.test(msg)) return '文件损坏或不是有效的 PDF，请换一个文件重试。';
return 'PDF 解析失败（' + (msg || '未知错误').slice(0, 60) + '），请换一个文件重试。';
}

function formatDate(d) {
if (!d) return '';
try {
var t = d instanceof Date? d: new Date(d);
if (isNaN(t.getTime())) return '';
return t.toLocaleString('zh-CN', { hour12: false});
} catch (e) { return '';}
}

function readMetadata(doc) {
var meta = [];
var push = function (label, value) { meta.push({ label: label, value: value || ''});};
push('标题', doc.getTitle());
push('作者', doc.getAuthor());
push('主题', doc.getSubject());
var kw = doc.getKeywords();
push('关键词', Array.isArray(kw)? kw.join(' '): kw);
push('创建者', doc.getCreator());
push('Producer', doc.getProducer());
push('创建日期', formatDate(doc.getCreationDate()));
push('修改日期', formatDate(doc.getModificationDate()));
var xmp = null;
try {
xmp = doc.catalog.get(PDFLib.PDFName.of('Metadata'));
// catalog.get 无类型断言：undefined 即无 XMP
} catch (e) { xmp = null;}
push('XMP 元数据', xmp? '有': '无');
return meta;
}

function getInfoDict(doc) {
try {
var ctx = doc.context;
var ref = (ctx.trailerInfo && ctx.trailerInfo.Info) || doc.catalog.get(PDFLib.PDFName.of('Info'));
if (!ref) return null;
var dict = ctx.lookup(ref);
// lookup（非 lookupMaybe）：lookupMaybe 单参数会触发 pdf-lib 类型断言报错
return (dict && typeof dict.has === 'function')? dict: null;
} catch (e) { return null;}
}

function countFilled(meta) {
var n = 0;
meta.forEach(function (m) { if (m.value) n++;});
return n;
}

function renderTable(meta) {
var html = '';
meta.forEach(function (m) {
var v;
if (m.label === 'XMP 元数据') {
v = m.value === '有'
? '<span class="pmd-badge yes">有（文档内含 XMP 数据包）</span>'
: '<span class="pmd-badge no">无</span>';
} else {
v = m.value? esc(m.value): '<span class="pmd-empty">—</span>';
}
html += '<tr><th>' + esc(m.label) + '</th><td>' + v + '</td></tr>';
});
$('pmd-table').innerHTML = html;
}

function buildReport(name, size, meta) {
var lines = ['' + name + '（' + fmtSize(size) + '）'];
meta.forEach(function (m) { lines.push(m.label + '：' + (m.value || '—'));});
lines.push('—— 由本站「PDF 元数据查看与清除器」本地解析，文件未上传 ——');
return lines.join('\n');
}

/* ============ 上传与解析 ============ */
function resetUI() {
state = null;
$('pmd-work').style.display = 'none';
$('pmd-summary').style.display = 'none';
$('pmd-summary').innerHTML = '';
$('pmd-fileinfo').style.display = 'none';
$('pmd-copy').disabled = true;
$('pmd-clean').disabled = true;
clearError();
hideProgress();
$('pmd-status').textContent = '';
}

function handleFile(file) {
resetUI();
if (!file) return;
var name = file.name || '';
if (!/\.pdf$/i.test(name) && file.type!== 'application/pdf') {
showError('请选择 PDF 文件（当前：' + (file.type || '未知类型') + '）。');
return;
}
var reader = new FileReader();
reader.onload = function () {
var buf = reader.result;
if (!isPdfMagic(buf)) {
showError('该文件不是有效的 PDF（文件头校验失败），请换一个文件重试。');
return;
}
parsePdf(name, file.size, buf);
};
reader.onerror = function () { showError('文件读取失败，请重试。');};
reader.readAsArrayBuffer(file);
}

function parsePdf(name, size, buf) {
setProgress(10, '正在加载解析组件…');
ensurePdfLib().then(function () {
setProgress(40, '正在解析 PDF 元数据…');
return new Promise(function (resolve) {
setTimeout(function () {
try {
var doc = PDFLib.PDFDocument.load(buf.slice(0), { updateMetadata: false});
resolve(doc);
} catch (e) { resolve({ __err: e});}
}, 30);
});
}).then(function (doc) {
if (doc && doc.__err) throw doc.__err;
if (doc.isEncrypted) throw new Error('encrypted');
setProgress(70, '正在生成元数据表格…');
var meta = readMetadata(doc);
state = { name: name, size: size, buf: buf, meta: meta, reportText: buildReport(name, size, meta)};
renderTable(meta);
$('pmd-file-name').textContent = name;
$('pmd-file-sub').textContent = fmtSize(size) + (size > BIG_FILE? '（大文件，处理会慢一些）': '');
$('pmd-fileinfo').style.display = 'flex';
$('pmd-work').style.display = 'block';
$('pmd-copy').disabled = false;
$('pmd-clean').disabled = false;
setProgress(100, '解析完成');
setTimeout(hideProgress, 600);
$('pmd-status').textContent = '已解析：' + countFilled(meta) + ' 个字段有值（含 XMP 状态）。';
}).catch(function (e) {
hideProgress();
if (e && (e.message === 'timeout' || e.message === 'load failed' || e.message === 'bad lib')) {
showLibFallback();
} else {
showError(classifyError(e));
}
});
}

/* ============ 复制报告 ============ */
function copyReport() {
if (!state) return;
var text = state.reportText;
function done() { toast('报告已复制，去粘贴吧');}
function fallback() {
var ta = document.createElement('textarea');
ta.value = text;
ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
document.body.appendChild(ta);
ta.select();
try {
if (document.execCommand('copy')) { done();}
else { showError('复制失败，请手动长按选择表格内容复制。');}
} catch (e) { showError('复制失败，请手动长按选择表格内容复制。');}
ta.remove();
}
if (navigator.clipboard && navigator.clipboard.writeText) {
navigator.clipboard.writeText(text).then(done, fallback);
} else {
fallback();
}
}

/* ============ 一键清除并下载 ============ */
function download(bytes, filename) {
var blob = new Blob([bytes], { type: 'application/pdf'});
var a = document.createElement('a');
a.href = URL.createObjectURL(blob);
a.download = filename;
document.body.appendChild(a);
a.click();
setTimeout(function () { URL.revokeObjectURL(a.href); a.remove();}, 4000);
}

function cleanAndDownload() {
if (!state) return;
var beforeMeta = state.meta;
var beforeCount = countFilled(beforeMeta.filter(function (m) { return m.label!== 'XMP 元数据';}));
var beforeXmp = beforeMeta[beforeMeta.length - 1].value;
setProgress(15, '正在清除元数据…');
ensurePdfLib().then(function () {
var doc = PDFLib.PDFDocument.load(state.buf.slice(0), { updateMetadata: false});
if (doc.isEncrypted) throw new Error('encrypted');
// 清空 Info 字典全部字段（含时间戳）
var info = getInfoDict(doc);
if (info) {
INFO_KEYS.forEach(function (k) {
var key = PDFLib.PDFName.of(k);
try { if (info.has(key)) info.delete(key);} catch (e) { /* 忽略单个字段失败 */}
});
}
// 移除 XMP（catalog 的 Metadata 键）
try { doc.catalog.delete(PDFLib.PDFName.of('Metadata'));} catch (e) { /* 忽略 */}
setProgress(60, '正在重写 PDF 文件…');
return doc.save();
}).then(function (outBytes) {
setProgress(85, '正在复核清除结果…');
// 重新读取，验证全空
var doc2 = PDFLib.PDFDocument.load(outBytes.slice(0), { updateMetadata: false});
var afterMeta = readMetadata(doc2);
var afterCount = countFilled(afterMeta.filter(function (m) { return m.label!== 'XMP 元数据';}));
var afterXmp = afterMeta[afterMeta.length - 1].value;
var base = state.name.replace(/\.pdf$/i, '');
download(outBytes, base + '-cleaned.pdf');
setProgress(100, '完成');
setTimeout(hideProgress, 600);
var s = $('pmd-summary');
s.style.display = 'block';
s.innerHTML = '<b>清除前后对比：</b><br>' +
'文档属性字段：清除前 <b>' + beforeCount + '</b> 个有值 → 清除后 <b>' + afterCount + '</b> 个有值<br>' +
'XMP 元数据：清除前 <b>' + esc(beforeXmp) + '</b> → 清除后 <b>' + esc(afterXmp) + '</b><br>' +
'已下载 <b>' + esc(base + '-cleaned.pdf') + '</b>。' +
(afterCount === 0 && afterXmp === '无'? '全部元数据已清除干净。': '注意：仍有残留字段，可能是阅读器自动补写的时间戳。');
$('pmd-status').textContent = '清除完成，已下载去痕版。';
toast('清除完成，已开始下载');
}).catch(function (e) {
hideProgress();
if (e && (e.message === 'timeout' || e.message === 'load failed' || e.message === 'bad lib')) {
showLibFallback();
} else {
showError(classifyError(e));
}
});
}

/* ============ 事件绑定 ============ */
function bind() {
var up = $('pmd-upload');
var fi = $('pmd-file');
up.addEventListener('click', function () {
if (up.getAttribute('aria-disabled') === 'true') return;
fi.click();
});
up.addEventListener('keydown', function (e) {
if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fi.click();}
});
fi.addEventListener('change', function () {
if (fi.files && fi.files[0]) handleFile(fi.files[0]);
fi.value = '';
});
['dragenter', 'dragover'].forEach(function (ev) {
up.addEventListener(ev, function (e) { e.preventDefault(); up.classList.add('dragover');});
});
['dragleave', 'drop'].forEach(function (ev) {
up.addEventListener(ev, function (e) { e.preventDefault(); up.classList.remove('dragover');});
});
up.addEventListener('drop', function (e) {
if (up.getAttribute('aria-disabled') === 'true') return;
var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
if (f) handleFile(f);
});
$('pmd-clear-file').addEventListener('click', function () { resetUI(); $('pmd-status').textContent = '';});
$('pmd-copy').addEventListener('click', copyReport);
$('pmd-clean').addEventListener('click', cleanAndDownload);
}

if (document.readyState === 'loading') {
document.addEventListener('DOMContentLoaded', bind);
} else {
bind();
}
})();
