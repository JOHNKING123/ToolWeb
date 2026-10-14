/* 文档修复/损坏文档文字抢救 - 纯前端本地处理
*
* 流程：JSZip（cdnjs 3.10.1 CDN 懒加载 → npmmirror 备）解包.docx →
* 读 word/document.xml，按 w:p 取段、w:t 取字、w:br 换行 →
* 页面预览 + 字数统计 → 导出 <原名>_抢救.txt / 复用 vendor docx-9.5.1 重建 <原名>_修复版.docx。
* 诚实范围：zip 索引损坏如实提示无解（不赌修坏 zip）；.doc 老格式 / 加密文档给引导提示。
* 文件只在浏览器本地处理，不上传服务器。
*/
(function () {
'use strict';

/* ---------------- 常量 ---------------- */
var JSZIP_CDNS = [
'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
'https://cdn.npmmirror.com/packages/jszip/3.10.1/jszip.min.js'
];
var DOCX_CDNS = [
'https://unpkg.com/docx@9.5.1/dist/index.umd.cjs',
'https://cdn.npmmirror.com/packages/docx/9.5.1/files/dist/index.umd.cjs'
];
/* 本地兜底：按本脚本实际加载地址推导 vendor 路径（与 pdf-to-word.js 同一口径）。 */
(function () {
var me = document.currentScript && document.currentScript.src;
var fb = me? me.replace(/docx-repair\.js(\?.*)?$/, 'vendor/docx-9.5.1.umd.js'): '';
if (fb && fb!== me) DOCX_CDNS.push(fb);
})();
var BIG_FILE = 50 * 1024 * 1024; // 超过仅提示，不硬拦截
var PREVIEW_MAX_CHARS = 20000; // 预览截断上限

/*<DR-PURE-BEGIN>*/
/* ---------------- 纯逻辑（无 DOM 依赖，可在 Node 下单测） ---------------- */
function drUnescapeXml(s) {
return String(s == null? '': s).replace(/&(lt|gt|amp|quot|apos|#x[0-9a-fA-F]+|#[0-9]+);/g, function (m, e) {
if (e === 'lt') return '<';
if (e === 'gt') return '>';
if (e === 'amp') return '&';
if (e === 'quot') return '"';
if (e === 'apos') return "'";
if (e.charAt(0) === '#') {
var n = e.charAt(1).toLowerCase() === 'x'? parseInt(e.slice(2), 16): parseInt(e.slice(1), 10);
return isNaN(n)? m: String.fromCharCode(n);
}
return m;
});
}

/* 文件头魔数判定：zip → docx 候选；ole → 老格式.doc；其他 → 未知 */
function drDetectKind(u8) {
if (!u8 || u8.length < 4) return 'unknown';
if (u8[0] === 0x50 && u8[1] === 0x4B && u8[2] === 0x03 && u8[3] === 0x04) return 'zip';
if (u8[0] === 0xD0 && u8[1] === 0xCF && u8[2] === 0x11 && u8[3] === 0xE0) return 'ole';
return 'unknown';
}

function drParseXml(xmlText) {
try {
var doc = new DOMParser().parseFromString(xmlText, 'application/xml');
var errs = doc.getElementsByTagName('parsererror');
if (errs && errs.length) return null;
return doc;
} catch (e) {
return null;
}
}

/* 递归走 w:p 子树：w:t 取字、w:br 换行、w:tab 制表 */
function drParaText(pEl) {
var out = '';
(function walk(n) {
for (var c = n.firstChild; c; c = c.nextSibling) {
if (c.nodeType === 3) {
out += c.nodeValue;
} else if (c.nodeType === 1) {
var name = c.nodeName || '';
var local = name.indexOf(':') >= 0? name.split(':')[1]: name;
if (local === 't') {
out += c.textContent || '';
} else if (local === 'br') {
out += '\n';
} else if (local === 'tab') {
out += '\t';
} else {
walk(c);
}
}
}
})(pEl);
return out;
}

/* 主路径：DOM 解析 document.xml，按文档顺序取 w:p 段落。
 * 文本框（w:txbxContent）里的嵌套 w:p 会被外层段落递归走出文字，
 * 为避免重复计数，跳过有 w:p 祖先的嵌套段落。 */
function drHasParaAncestor(el) {
for (var n = el.parentNode; n; n = n.parentNode) {
if ((n.nodeName || '') === 'w:p') return true;
}
return false;
}
function drExtractParagraphs(xmlText) {
var doc = drParseXml(xmlText);
if (!doc) return drExtractParagraphsFallback(xmlText);
var ps = doc.getElementsByTagName('w:p');
var paras = [];
for (var i = 0; i < ps.length; i++) {
if (!drHasParaAncestor(ps[i])) paras.push(drParaText(ps[i]));
}
return paras;
}

/* 兜底路径：document.xml 良构性已坏（如被改写过），用正则按 w:t 粗提取文字。
 * 单遍文档顺序 token 匹配：w:t 取字、w:br 换行、w:tab 制表。
 * （旧版先把 w:br 预替换成 \n 再只拼 w:t 内部文本，会把换行丢掉，此处已修。） */
function drExtractParagraphsFallback(xmlText) {
var paras = [];
var re = /([\s\S]*?)<\/w:p\s*>/gi, m;
while ((m = re.exec(xmlText))!== null) {
var chunk = m[1];
var tre = /<w:t(?=[\s/>])[^>]*>([\s\S]*?)<\/w:t>|<w:br[^>]*\/?>|<w:tab[^>]*\/?>/gi, tm, text = '';
while ((tm = tre.exec(chunk))!== null) {
if (tm[1]!== undefined) text += drUnescapeXml(tm[1]);
else if (/^<w:br/i.test(tm[0])) text += '\n';
else text += '\t';
}
paras.push(text);
}
return paras;
}

/* 段数（非空段）/ 字数（去空白）统计 */
function drCountStats(paras) {
var p = 0, chars = 0;
for (var i = 0; i < paras.length; i++) {
var t = paras[i];
if (t && t.replace(/\s/g, '').length) p++;
chars += (t || '').replace(/\s/g, '').length;
}
return { paras: p, chars: chars};
}

/* 文件名基名：去掉.docx 后缀 */
function drBaseName(name) {
var b = String(name || 'file').replace(/\.docx$/i, '');
return b || 'file';
}
/*<DR-PURE-END>*/

/* ---------------- CDN 懒加载（多 URL 依次回退） ---------------- */
function ensureLibFromList(list, globalName) {
return new Promise(function (resolve, reject) {
if (window[globalName]) { resolve(); return;}
var idx = 0;
function tryNext() {
if (idx >= list.length) { reject(new Error('all failed')); return;}
var src = list[idx++];
var s = document.createElement('script');
var done = false;
var timer = setTimeout(function () {
if (!done) { done = true; s.remove(); tryNext();}
}, 25000);
s.onload = function () {
if (done) return;
done = true; clearTimeout(timer);
if (window[globalName]) resolve();
else { s.remove(); tryNext();}
};
s.onerror = function () {
if (done) return;
done = true; clearTimeout(timer); s.remove(); tryNext();
};
s.src = src;
document.head.appendChild(s);
}
tryNext();
});
}
function ensureJSZip() { return ensureLibFromList(JSZIP_CDNS, 'JSZip');}
function ensureDocx() { return ensureLibFromList(DOCX_CDNS, 'docx');}

/* ---------------- 通用小工具 ---------------- */
function $(id) { return document.getElementById(id);}
function fmtSize(n) {
if (n!== 0 &&!n) return '-';
if (n < 1024) return n + ' B';
if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
return (n / 1024 / 1024).toFixed(2) + ' MB';
}
function escHtml(s) {
return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function downloadBlob(blob, name) {
var a = document.createElement('a');
a.href = URL.createObjectURL(blob);
a.download = name;
document.body.appendChild(a);
a.click();
setTimeout(function () { URL.revokeObjectURL(a.href); a.remove();}, 800);
}
function tick() { return new Promise(function (r) { setTimeout(r, 0);});}

/* ---------------- 状态 ---------------- */
var S = {
file: null, fileName: '', fileSize: 0,
paras: [], // 正文段落数组（含空段，保留原顺序）
extraParas: [], // 页眉/页脚/文本框来源段落
usedFallback: false, // 是否走了正则兜底
busy: false,
txtUrl: null, docxUrl: null
};

function setStatus(t) { $('dr-status').textContent = t || '';}
function setError(t) { $('dr-error').innerHTML = t || '';}
function setLibError(t) { var el = $('dr-lib-error'); el.style.display = t? 'block': 'none'; el.innerHTML = t || '';}
function setNote(t) { var el = $('dr-bignote'); el.style.display = t? 'block': 'none'; el.innerHTML = t || '';}
function setProgress(pct, txt) {
var box = $('dr-progress');
box.style.display = pct == null? 'none': 'block';
if (pct!= null) {
$('dr-progress-bar').style.width = Math.round(pct * 100) + '%';
$('dr-progress-txt').textContent = txt || '';
}
}
function showPreview(show) { $('dr-preview').style.display = show? 'block': 'none';}
function showResult(show) { $('dr-result').style.display = show? 'block': 'none';}
function setBusy(b) {
S.busy = b;
$('dr-rescue').disabled = b ||!S.file;
$('dr-export-txt').disabled = b || (!S.paras.length && !S.extraParas.length);
$('dr-export-docx').disabled = $('dr-export-txt').disabled;
}

function resetAll() {
S.file = null; S.fileName = ''; S.fileSize = 0;
S.paras = []; S.extraParas = []; S.usedFallback = false;
if (S.txtUrl) { try { URL.revokeObjectURL(S.txtUrl);} catch (e) {} S.txtUrl = null;}
if (S.docxUrl) { try { URL.revokeObjectURL(S.docxUrl);} catch (e) {} S.docxUrl = null;}
$('dr-fileinfo').style.display = 'none';
$('dr-file').value = '';
showPreview(false); showResult(false); $('dr-result-ops').style.display = 'none';
setStatus(''); setError(''); setLibError(''); setNote('');
setProgress(null);
$('dr-rescue').disabled = true;
$('dr-export-txt').disabled = true;
$('dr-export-docx').disabled = true;
}

/* ---------------- 上传 ---------------- */
function onFile(file) {
resetAll();
if (!file) return;
S.file = file; S.fileName = file.name || 'file'; S.fileSize = file.size;
if (S.fileSize > BIG_FILE) {
setNote('文件较大（' + fmtSize(S.fileSize) + '），解包分析会慢一些，请耐心等待；不拦截，继续可用。');
}
var reader = new FileReader();
reader.onload = function () {
var u8 = new Uint8Array(reader.result);
var kind = drDetectKind(u8);
if (kind === 'ole') {
setError('这是<b>老格式.doc</b>（Office 2003 及更早版本），不是 zip 结构的.docx，本工具无法解包。<br>请先在 Word / WPS 里打开它，<b>另存为.docx</b> 后再来抢救。');
S.file = null;
return;
}
if (kind!== 'zip') {
setError('这不是有效的.docx 文件（文件头不是 zip 格式，可能是改了后缀名的其他文件）。<br>请确认选择的是真正的 <b>.docx</b> 文档。');
S.file = null;
return;
}
$('dr-file-name').textContent = S.fileName;
$('dr-file-sub').textContent = fmtSize(S.fileSize) + ' · 本地处理不上传';
$('dr-fileinfo').style.display = 'flex';
$('dr-rescue').disabled = false;
setStatus('文件已就绪，点击「开始抢救文字」。');
};
reader.onerror = function () {
setError('文件读取失败，请换个文件重试。');
S.file = null;
};
reader.readAsArrayBuffer(file.slice(0, 4));
}

function bindUpload() {
var up = $('dr-upload'), inp = $('dr-file');
up.addEventListener('click', function () { inp.click();});
up.addEventListener('keydown', function (e) {
if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click();}
});
inp.addEventListener('change', function () {
if (inp.files && inp.files[0]) onFile(inp.files[0]);
});
['dragenter', 'dragover'].forEach(function (ev) {
up.addEventListener(ev, function (e) { e.preventDefault(); up.classList.add('dragover');});
});
['dragleave', 'drop'].forEach(function (ev) {
up.addEventListener(ev, function (e) { e.preventDefault(); up.classList.remove('dragover');});
});
up.addEventListener('drop', function (e) {
var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
if (f) onFile(f);
});
$('dr-clear').addEventListener('click', resetAll);
}

/* ---------------- 抢救 ---------------- */
async function startRescue() {
if (S.busy ||!S.file) return;
setError(''); setLibError(''); showPreview(false); showResult(false); $('dr-result-ops').style.display = 'none';
setBusy(true);
try {
setStatus('正在加载解包组件…');
setProgress(0.05, '阶段 1/2：正在解包分析……（加载解包组件）');
await ensureJSZip().catch(function () {
throw new Error('lib');
});
await tick();
setProgress(0.15, '阶段 1/2：正在解包分析……（读取文件）');
var buf = await S.file.arrayBuffer();
var zip;
try {
zip = await new window.JSZip().loadAsync(buf);
} catch (e) {
throw new Error('badzip');
}
await tick();
setProgress(0.3, '阶段 1/2：正在解包分析……（检查文档结构）');
/* 加密文档：zip 结构完好但没有明文 document.xml */
var encInfo = zip.file('EncryptionInfo') || zip.file('EncryptedPackage');
if (encInfo) {
throw new Error('encrypted');
}
var docFile = zip.file('word/document.xml');
if (!docFile) {
throw new Error('nodocxml');
}
setProgress(0.45, '阶段 1/2：正在解包分析……（提取文字）');
var xmlText = await docFile.async('string');
S.usedFallback = drParseXml(xmlText) === null;
S.paras = drExtractParagraphs(xmlText);
await tick();
/* 页眉/页脚顺带提取（从简，页面如实说明来源） */
S.extraParas = [];
var names = Object.keys(zip.files || {});
for (var i = 0; i < names.length; i++) {
if (/^word\/(header|footer)\d*\.xml$/.test(names[i])) {
try {
var x = await zip.file(names[i]).async('string');
var ps = drExtractParagraphs(x).filter(function (t) { return t && t.replace(/\s/g, '').length;});
if (ps.length) S.extraParas.push('' + ps.join(' '));
} catch (e) { /* 单个部件坏了不影响正文 */}
}
}
setProgress(0.55, '阶段 1/2：正在解包分析……（统计字数）');
var st = drCountStats(S.paras);
if (!st.chars &&!S.extraParas.length) {
throw new Error('empty');
}
await tick();
renderPreview(st);
setProgress(null);
setStatus('');
$('dr-export-txt').disabled = false;
$('dr-export-docx').disabled = false;
} catch (e) {
setProgress(null);
var msg = e && e.message;
if (msg === 'lib') {
setLibError('解包组件（JSZip）加载失败：cdnjs / npmmirror CDN 都不可达。请检查网络后重试。');
} else if (msg === 'badzip') {
setError('<b>文件结构损坏严重，无法抢救。</b><br>这个文件已经不是完整的 zip 压缩包（索引损坏），里面的文字取不出来。<br>建议：找找备份、微信/QQ 里传过的文件版本，或 Word 的自动恢复副本。');
} else if (msg === 'encrypted') {
setError('这个文档<b>设置了打开密码（加密文档）</b>，浏览器解不开里面的文字。<br>请先在 Word / WPS 里输入密码打开，<b>另存为无密码副本</b>后再来抢救。<br>（文档想加密码保护，可先转 PDF 再用站内 <a href="/tools/pdf-encrypt">PDF 加密/解密</a> 工具。）');
} else if (msg === 'nodocxml') {
setError('<b>解包成功，但里面没有找到正文</b>（缺少 word/document.xml）。<br>这个文件不是完整的 Word 文档，无法抢救。');
} else if (msg === 'empty') {
setError('解包成功，但<b>没有提取到任何文字</b>：文档正文可能是空的，或损坏到了文字区。<br>不会导出空文件。');
} else {
setError('抢救失败：' + escHtml(msg || '未知错误') + '，请换个文件重试。');
}
} finally {
setBusy(false);
$('dr-rescue').disabled =!S.file;
}
}

function fullText() {
var t = S.paras.join('\n');
if (S.extraParas.length) t += '\n\n' + S.extraParas.join('\n');
return t;
}

function renderPreview(st) {
var t = fullText();
var shown = t.length > PREVIEW_MAX_CHARS? t.slice(0, PREVIEW_MAX_CHARS) + '\n……（预览截断，导出文件含全部文字）': t;
$('dr-preview-body').textContent = shown;
$('dr-stat-para').textContent = st.paras;
$('dr-stat-char').textContent = st.chars;
var note = [];
if (S.extraParas.length) note.push('含页眉/页脚文字');
if (S.usedFallback) note.push('正文 XML 已破损，走粗提取');
$('dr-stat-note').textContent = note.length? '（' + note.join('，') + '）': '';
showPreview(true);
}

/* ---------------- 导出 ---------------- */
function showDone(kind, fileName) {
var st = drCountStats(S.paras);
$('dr-result-text').innerHTML = '抢救完成：<b>抢救出 ' + st.paras + ' 段 / ' + st.chars + ' 字</b>，已导出 <b>' + escHtml(fileName) + '</b>';
$('dr-result-sub').textContent = kind === 'txt'
? '纯文本版：只含文字，版式从简。如需在 Word 里继续排版，可再导出修复版.docx。'
: '修复版.docx：按段落重建的干净文档，zip 结构完整、可用 Word / WPS 正常打开编辑。';
$('dr-result-ops').style.display = 'flex';
showResult(true);
}

async function exportTxt() {
if (S.busy || (!S.paras.length &&!S.extraParas.length)) return;
setBusy(true);
try {
setProgress(0.6, '阶段 2/2：正在生成文档……（纯文本）');
await tick();
var blob = new Blob(["\uFEFF" + fullText()], { type: 'text/plain;charset=utf-8'});
var name = drBaseName(S.fileName) + '_抢救.txt';
if (S.txtUrl) { try { URL.revokeObjectURL(S.txtUrl);} catch (e) {}}
S.txtUrl = URL.createObjectURL(blob);
var a = document.createElement('a');
a.href = S.txtUrl; a.download = name;
document.body.appendChild(a); a.click(); a.remove();
setProgress(null);
showDone('txt', name);
} finally {
setBusy(false);
$('dr-rescue').disabled =!S.file;
}
}

async function exportDocx() {
if (S.busy || (!S.paras.length &&!S.extraParas.length)) return;
setError(''); setLibError('');
setBusy(true);
try {
setStatus('正在加载 Word 生成组件…');
setProgress(0.6, '阶段 2/2：正在生成文档……（加载组件）');
await ensureDocx().catch(function () { throw new Error('lib');});
await tick();
setProgress(0.75, '阶段 2/2：正在生成文档……（重建段落）');
var docx = window.docx;
var children = [];
var lines = S.paras.slice();
if (S.extraParas.length) {
lines.push('');
for (var k = 0; k < S.extraParas.length; k++) lines.push(S.extraParas[k]);
}
for (var i = 0; i < lines.length; i++) {
var txt = lines[i];
if (!txt) {
children.push(new docx.Paragraph({ spacing: { after: 160}}));
continue;
}
/* 段内换行（w:br）拆成多次 TextRun 换行，保持视觉一致 */
var parts = txt.split('\n');
var runs = [];
for (var j = 0; j < parts.length; j++) {
if (j > 0) runs.push(new docx.TextRun({ break: 1}));
runs.push(new docx.TextRun({ text: parts[j], font: '等线', size: 21}));
}
children.push(new docx.Paragraph({ children: runs, spacing: { after: 160}}));
}
setProgress(0.9, '阶段 2/2：正在生成文档……（打包）');
var doc = new docx.Document({
creator: 'ToolWeb 文档修复',
lastModifiedBy: 'ToolWeb 文档修复',
sections: [{ children: children}]
});
var blob = await docx.Packer.toBlob(doc);
var name = drBaseName(S.fileName) + '_修复版.docx';
if (S.docxUrl) { try { URL.revokeObjectURL(S.docxUrl);} catch (e) {}}
S.docxUrl = URL.createObjectURL(blob);
var a = document.createElement('a');
a.href = S.docxUrl; a.download = name;
document.body.appendChild(a); a.click(); a.remove();
setProgress(null);
setStatus('');
showDone('docx', name);
} catch (e) {
setProgress(null);
if (e && e.message === 'lib') {
setLibError('Word 生成组件（docx）加载失败：unpkg / npmmirror CDN 与本地副本都不可达。请检查网络后重试，或先导出.txt 保住文字。');
} else {
setError('生成修复版.docx 失败：' + escHtml((e && e.message) || '未知错误') + '。文字已抢救成功，可先导出.txt。');
}
} finally {
setBusy(false);
$('dr-rescue').disabled =!S.file;
}
}

function redownload(url, name) {
if (!url) return;
var a = document.createElement('a');
a.href = url; a.download = name;
document.body.appendChild(a); a.click(); a.remove();
}

/* ---------------- 绑定 ---------------- */
bindUpload();
$('dr-rescue').addEventListener('click', startRescue);
$('dr-export-txt').addEventListener('click', exportTxt);
$('dr-export-docx').addEventListener('click', exportDocx);
$('dr-redownload-txt').addEventListener('click', function () {
redownload(S.txtUrl, drBaseName(S.fileName) + '_抢救.txt');
});
$('dr-redownload-docx').addEventListener('click', function () {
redownload(S.docxUrl, drBaseName(S.fileName) + '_修复版.docx');
});

/* 单测钩子：Node 下可 eval DR-PURE 段验证提取逻辑 */
if (typeof window!== 'undefined') {
window.__docxRepairPure = {
drUnescapeXml: drUnescapeXml,
drDetectKind: drDetectKind,
drExtractParagraphs: drExtractParagraphs,
drExtractParagraphsFallback: drExtractParagraphsFallback,
drCountStats: drCountStats,
drBaseName: drBaseName
};
}
})();
