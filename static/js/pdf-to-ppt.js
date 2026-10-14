/* PDF 转 PPT（文本提取版）- 纯前端本地处理
*
* 流程：pdf.js（3.11.174，cdnjs UMD + worker 懒加载）逐页 getTextContent →
* 按阅读顺序重排（Y 容差合并行、行内 X 排序、行间距保段落分隔，与 pdf-to-word.js 同口径）→
* pptxgenjs（3.12.0 UMD：unpkg 主 + npmmirror 备 + 本地 vendor 兜底，懒加载）
* 每 PDF 页 → 一张幻灯片：首文本行作标题、其余作正文（保留段落分隔），版式从简不逐像素还原。
* 扫描件检测：前 3 页几乎无文本 → 引导站内 OCR，不导出空文档。
* 文件只在浏览器本地处理，不上传服务器。
*/
(function () {
'use strict';

/* ---------------- 常量 ---------------- */
var PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
var PDFJS_WORKER_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
var PPTX_CDNS = [
'https://unpkg.com/pptxgenjs@3.12.0/dist/pptxgen.bundle.js',
'https://cdn.npmmirror.com/packages/pptxgenjs/3.12.0/files/dist/pptxgen.bundle.js'
];
/* 本地兜底：按本脚本实际加载地址推导 vendor 路径。
* /tools/static/ 不会被挂载中间件改写，直接写绝对路径 '/tools/...' 在 /tool-web 下会 404；
* 这里用 document.currentScript.src 相对推导，/tools 与 /tool-web 两种挂载前缀都可用。
* IIFE 在脚本加载时同步执行，document.currentScript 有效。 */
(function () {
var me = document.currentScript && document.currentScript.src;
var fb = me? me.replace(/pdf-to-ppt\.js(\?.*)?$/, 'vendor/pptxgenjs-3.12.0.bundle.js'): '';
if (fb && fb!== me) PPTX_CDNS.push(fb);
})();
var BIG_FILE = 50 * 1024 * 1024; // 超过仅提示，不硬拦截
var SCAN_SAMPLE_PAGES = 3; // 扫描件检测采样页数
var SCAN_CHAR_LIMIT = 30; // 采样页总字符数低于此 → 判定扫描件
var PREVIEW_PAGES = 3; // 预览展示页数
var PREVIEW_MAX_LINES = 80; // 预览总行数上限

var FONTS = { dengxian: '等线', songti: '宋体', yahei: '微软雅黑'};
var SIZES = { wuhao: 10.5, xiaosi: 12, sihao: 14}; // 单位 pt（正文）；标题 = 正文 + 8

/* ---------------- 通用小工具 ---------------- */
function $(id) { return document.getElementById(id);}
function fmtSize(n) {
if (n!== 0 &&!n) return '-';
if (n < 1024) return n + ' B';
if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
return (n / 1024 / 1024).toFixed(2) + ' MB';
}
function baseName(name) { return String(name || 'file').replace(/\.pdf$/i, '');}
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
return a.href;
}
function tick() { return new Promise(function (r) { setTimeout(r, 0);});} // 让出主线程，进度可刷新

/*<PTP-PURE-BEGIN>*/
/* ---------------- 纯逻辑函数（无 DOM，可在 Node 下单测） ---------------- */

/* PDF 读取错误分类 → 可读中文 */
function ptpClassifyPdfError(e) {
var name = (e && e.name) || '';
var msg = String((e && e.message) || '');
if (name === 'PasswordException' || /password|encrypt/i.test(msg)) {
return { kind: 'encrypted', text: '该 PDF 已加密（带打开密码），无法读取。请先用「PDF 加密/解密」工具解密后再试。'};
}
if (name === 'InvalidPDFException' || name === 'MissingPDFException' || /invalid|missing|format|parse|header|trailer|xref/i.test(msg)) {
return { kind: 'invalid', text: '文件损坏或不是有效的 PDF，请换一个文件试试。'};
}
return { kind: 'unknown', text: '无法读取该 PDF 文件（' + (msg || '未知错误') + '），请换一个文件试试。'};
}

/* 估算相邻两文本项之间的平均字宽（用于判断是否需要补空格） */
function ptpAvgCharW(prev, cur) {
var w = 0, c = 0;
if (prev.s.length && prev.w > 0) { w += prev.w / prev.s.length; c++;}
if (cur.s.length && cur.w > 0) { w += cur.w / cur.s.length; c++;}
return c? w / c: 6;
}
function ptpIsAsciiWordChar(ch) { return /[A-Za-z0-9]/.test(ch || '');}

/* 按阅读顺序重排单页文本项 → [{y,h,text}]（y 为 PDF 坐标，行已按从上到下排序）
* 与 pdf-to-word.js 的 ptwReorder 同口径。 */
function ptpReorderItems(items) {
var rows = [];
for (var i = 0; i < items.length; i++) {
var it = items[i];
var str = it.str;
if (str == null || str === '') continue;
var tr = it.transform || [1, 0, 0, 1, 0, 0];
var x = tr[4], y = tr[5];
var h = it.height || Math.abs(tr[0]) || 10;
if (!(h > 0)) h = 10;
var placed = false;
for (var r = 0; r < rows.length; r++) {
var tol = 0.4 * Math.max(rows[r].h, h);
if (Math.abs(rows[r].y - y) <= tol) {
rows[r].items.push({ x: x, s: str, w: it.width || 0});
if (h > rows[r].h) rows[r].h = h;
placed = true;
break;
}
}
if (!placed) rows.push({ y: y, h: h, items: [{ x: x, s: str, w: it.width || 0}]});
}
rows.sort(function (a, b) { return b.y - a.y;}); // PDF y 轴向上 → 从大到小即从上到下
var lines = [];
for (var k = 0; k < rows.length; k++) {
var its = rows[k].items.slice().sort(function (a, b) { return a.x - b.x;});
var line = '';
var prevEnd = 0, prev = null;
for (var j = 0; j < its.length; j++) {
var cur = its[j];
if (j > 0) {
var gap = cur.x - prevEnd;
var avgW = ptpAvgCharW(prev, cur);
var lastCh = prev.s.charAt(prev.s.length - 1);
var firstCh = cur.s.charAt(0);
// 明显空隙 → 补空格（表格列、词组分隔）；中文字符紧邻不补
if (gap > Math.max(2.5, 0.35 * avgW)) line += ' ';
else if (ptpIsAsciiWordChar(lastCh) && ptpIsAsciiWordChar(firstCh) && gap > 0.5) line += ' ';
}
line += cur.s;
prevEnd = cur.x + (cur.w || 0);
prev = cur;
}
lines.push({ y: rows[k].y, h: rows[k].h, text: line});
}
return lines;
}

/* 行 → 块：行间距过大处插入空行保段落分隔；图片标记按 Y 位置并入。
* 与 pdf-to-word.js 的 ptwLinesToParagraphs 同口径。 */
function ptpLinesToBlocks(lines, imgYs) {
var stream = [];
lines.forEach(function (l) { stream.push({ y: l.y, h: l.h, kind: 'text', text: l.text});});
(imgYs || []).forEach(function (y) { stream.push({ y: y, h: 14, kind: 'img'});});
stream.sort(function (a, b) { return b.y - a.y;});
var blocks = [];
var prevY = null, prevH = 10;
for (var i = 0; i < stream.length; i++) {
var s = stream[i];
if (s.kind === 'img') {
blocks.push({ text: '[图片]', isImage: true});
prevY = s.y; prevH = 14;
continue;
}
if (prevY!== null) {
var gap = prevY - s.y;
var lh = Math.max(prevH, s.h, 8);
if (gap > 1.7 * lh) blocks.push({ text: ''}); // 空行：段落分隔
}
blocks.push({ text: s.text});
prevY = s.y; prevH = s.h;
}
return blocks;
}

/* 从 operatorList 收集图片绘制的 Y 坐标（跟踪 CTM，处理 q/Q 嵌套） */
function ptpCollectImageYs(opList, OPS, Util) {
var ys = [];
function mul(m1, m2) {
if (Util && Util.transform) return Util.transform(m1, m2);
return [
m1[0] * m2[0] + m1[2] * m2[1], m1[1] * m2[0] + m1[3] * m2[1],
m1[0] * m2[2] + m1[2] * m2[3], m1[1] * m2[2] + m1[3] * m2[3],
m1[0] * m2[4] + m1[2] * m2[5] + m1[4], m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
];
}
var stack = [];
var ctm = [1, 0, 0, 1, 0, 0];
var n = opList.fnArray.length;
for (var i = 0; i < n; i++) {
var fn = opList.fnArray[i], args = opList.argsArray[i];
if (fn === OPS.save) { stack.push(ctm.slice());}
else if (fn === OPS.restore) { if (stack.length) ctm = stack.pop();}
else if (fn === OPS.transform) { ctm = mul(ctm, args);}
else if (fn === OPS.paintImageXObject || fn === OPS.paintJpegXObject || fn === OPS.paintImageMaskXObject) {
ys.push(ctm[5]);
}
}
return ys;
}

/* 单页 blocks → 幻灯片数据：首个非空块作标题，其余作正文（保留段落分隔） */
function ptpPageToSlide(page) {
var title = '', bodyParts = [], started = false;
var blocks = page.blocks || [];
for (var i = 0; i < blocks.length; i++) {
var b = blocks[i];
var t = b.isImage? '[图片]': (b.text == null? '': String(b.text));
if (!started) {
if (t.replace(/\s/g, '').length) { title = t; started = true;}
} else {
bodyParts.push(t);
}
}
while (bodyParts.length &&!bodyParts[0].replace(/\s/g, '').length) bodyParts.shift();
while (bodyParts.length &&!bodyParts[bodyParts.length - 1].replace(/\s/g, '').length) bodyParts.pop();
return { title: title, body: bodyParts.join('\n')};
}

/* 按页生成幻灯片并导出。PptxGenJSClass 为 pptxgenjs 构造函数（浏览器里是 window.PptxGenJS）。
* pages: [{num, blocks:[{text,isImage?}]}]；opts: {font, size}；onProgress(i, n) 逐张回调；
* outputType: 'blob'（浏览器下载用）或 'base64'（Node 单测用）。
* 版式固定 16:9（13.33×7.5 英寸），标题深蓝加粗、正文深灰，版式从简不逐像素还原。 */
function ptpBuildSlides(PptxGenJSClass, pages, opts, onProgress, outputType) {
return new Promise(function (resolve, reject) {
try {
var pptx = new PptxGenJSClass();
pptx.defineLayout({ name: 'PTP_WIDE', width: 13.33, height: 7.5});
pptx.layout = 'PTP_WIDE';
pptx.author = 'ToolWeb PDF转PPT';
pptx.title = 'PDF转PPT';
var titleSize = (opts.size || 10.5) + 8;
for (var i = 0; i < pages.length; i++) {
var sd = ptpPageToSlide(pages[i]);
var hasTitle = sd.title.replace(/\s/g, '').length > 0;
var hasBody = sd.body.replace(/\s/g, '').length > 0;
var slide = pptx.addSlide();
if (hasTitle) {
slide.addText(sd.title, {
x: 0.6, y: 0.35, w: 12.13, h: 1.15,
fontFace: opts.font || '等线', fontSize: titleSize, bold: true, color: '1F3864'
});
}
if (hasBody) {
slide.addText(sd.body, {
x: 0.6, y: hasTitle? 1.65: 0.5, w: 12.13, h: hasTitle? 5.35: 6.5,
fontFace: opts.font || '等线', fontSize: opts.size || 10.5, color: '262626'
});
}
if (!hasTitle &&!hasBody) {
slide.addText('（此页无可提取文字）', {
x: 0.6, y: 3.2, w: 12.13, h: 0.8,
fontFace: opts.font || '等线', fontSize: opts.size || 10.5, color: '9CA3AF', align: 'center'
});
}
if (onProgress) onProgress(i + 1, pages.length);
}
resolve(pptx.write(outputType || 'blob'));
} catch (e) {
reject(e);
}
});
}
/*<PTP-PURE-END>*/

/* ---------------- CDN 懒加载（支持多 URL 依次回退） ---------------- */
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
function ensurePdfJs() {
return ensureLibFromList([PDFJS_CDN], 'pdfjsLib').then(function () {
if (window.pdfjsLib.GlobalWorkerOptions &&!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN;
}
});
}
function ensurePptx() { return ensureLibFromList(PPTX_CDNS, 'PptxGenJS');}

/* ---------------- 状态 ---------------- */
var S = {
file: null, fileName: '', fileSize: 0,
pdf: null, totalPages: 0,
pages: [], // [{num, blocks:[{text,isImage?}], chars}] 提取缓存
scanned: false,
busy: false,
outUrl: null
};

function setStatus(t) { $('ptp-status').textContent = t || '';}
function setError(t) { $('ptp-error').innerHTML = t || '';}
function setLibError(t) { var el = $('ptp-lib-error'); el.style.display = t? 'block': 'none'; el.innerHTML = t || '';}
function setNote(t) { var el = $('ptp-bignote'); el.style.display = t? 'block': 'none'; el.innerHTML = t || '';}
function setProgress(pct, txt) {
var box = $('ptp-progress');
box.style.display = pct == null? 'none': 'block';
if (pct!= null) {
$('ptp-progress-bar').style.width = Math.round(pct * 100) + '%';
$('ptp-progress-txt').textContent = txt || '';
}
}
function showScanBox(show) { $('ptp-scanbox').style.display = show? 'block': 'none';}
function showPreview(show) { $('ptp-preview').style.display = show? 'block': 'none';}
function showResult(show) { $('ptp-result').style.display = show? 'block': 'none';}
function setBusy(b) {
S.busy = b;
$('ptp-extract').disabled = b ||!S.pdf;
$('ptp-export').disabled = b ||!S.pages.length || S.scanned;
}

/* ---------------- 上传 ---------------- */
function resetAll() {
if (S.pdf) { try { S.pdf.destroy();} catch (e) {}}
S.pdf = null; S.totalPages = 0; S.pages = [];
S.scanned = false; S.file = null;
if (S.outUrl) { try { URL.revokeObjectURL(S.outUrl);} catch (e) {} S.outUrl = null;}
$('ptp-fileinfo').style.display = 'none';
$('ptp-optbox').style.display = 'none';
showScanBox(false); showPreview(false); showResult(false);
setStatus(''); setError(''); setLibError(''); setNote('');
setProgress(null);
setBusy(false);
$('ptp-extract').disabled = true;
}

async function handleFile(f) {
resetAll();
if (!f) return;
if (!/\.pdf$/i.test(f.name) && f.type!== 'application/pdf') {
setError('请选择 PDF 文件（.pdf）。');
return;
}
S.file = f; S.fileName = f.name; S.fileSize = f.size;
if (f.size > BIG_FILE) {
setNote('文件较大（' + fmtSize(f.size) + '，超过 50MB），提取会慢一些，请耐心等待。文件仍只在本地处理，不上传。');
}
$('ptp-file-name').textContent = f.name;
$('ptp-file-sub').textContent = fmtSize(f.size) + ' · 读取中…';
$('ptp-fileinfo').style.display = 'flex';
setBusy(true);
setStatus('正在加载 PDF 组件…');
try {
await ensurePdfJs().catch(function () { throw { kind: 'lib', what: 'PDF 解析组件（pdf.js CDN）'};});
} catch (e) {
setBusy(false);
if (e && e.kind === 'lib') { setLibError('组件加载失败：' + e.what + '。请检查网络后刷新重试（需能访问 CDN）。');}
else setError('组件加载失败，请刷新重试。');
return;
}
setStatus('正在读取 PDF…');
try {
var buf = await f.arrayBuffer();
var pdf = await window.pdfjsLib.getDocument({ data: buf}).promise;
S.pdf = pdf; S.totalPages = pdf.numPages;
$('ptp-file-sub').textContent = fmtSize(f.size) + ' · 共 ' + pdf.numPages + ' 页 · 本地处理不上传';
$('ptp-optbox').style.display = 'block';
setStatus('');
setBusy(false);
// 自动开始提取
startExtract();
} catch (e) {
setBusy(false);
setError(escHtml(ptpClassifyPdfError(e).text));
}
}

/* ---------------- 提取（阶段一） ---------------- */
async function extractPage(pdf, pageNum) {
var page = await pdf.getPage(pageNum);
try {
var tc = await page.getTextContent();
var lines = ptpReorderItems(tc.items);
var imgYs = [];
try {
var opList = await page.getOperatorList();
imgYs = ptpCollectImageYs(opList, window.pdfjsLib.OPS, window.pdfjsLib.Util);
} catch (e) { imgYs = [];}
var blocks = ptpLinesToBlocks(lines, imgYs);
var chars = blocks.reduce(function (a, b) { return a + (b.text? b.text.length: 0);}, 0);
return { num: pageNum, blocks: blocks, chars: chars};
} finally {
try { page.cleanup();} catch (e) {}
}
}

async function startExtract() {
if (S.busy ||!S.pdf) return;
setError(''); showScanBox(false); showPreview(false); showResult(false);
setBusy(true);
S.pages = []; S.scanned = false;
var total = S.totalPages;
setProgress(0, '阶段 1/2：正在提取第 1 / ' + total + ' 页…');
try {
var sampleChars = 0;
for (var i = 1; i <= total; i++) {
var pg = await extractPage(S.pdf, i);
S.pages.push(pg);
if (i <= SCAN_SAMPLE_PAGES) sampleChars += pg.chars;
setProgress(i / total, '阶段 1/2：正在提取第 ' + i + ' / ' + total + ' 页…');
await tick();
}
if (sampleChars < SCAN_CHAR_LIMIT) {
S.scanned = true;
showScanBox(true);
setProgress(null);
setStatus('');
setBusy(false);
return;
}
renderPreview();
setProgress(null);
setStatus('提取完成，共 ' + total + ' 页。确认预览无误后点「导出 PPT」。');
} catch (e) {
setProgress(null);
setError(escHtml(ptpClassifyPdfError(e).text));
}
setBusy(false);
}

function renderPreview() {
var html = '';
var shown = 0;
var pages = S.pages.slice(0, PREVIEW_PAGES);
for (var i = 0; i < pages.length; i++) {
var sd = ptpPageToSlide(pages[i]);
html += '<div class="ptp-prev-page"><h4>第 ' + pages[i].num + ' 页 → 幻灯片 ' + (i + 1) + '（预览）</h4><pre>';
var lines = [];
if (sd.title) { lines.push('' + sd.title); shown++;}
var bodyLines = sd.body.split('\n');
for (var j = 0; j < bodyLines.length && shown < PREVIEW_MAX_LINES; j++) {
lines.push(bodyLines[j] === ''? ' ': bodyLines[j]);
shown++;
}
html += escHtml(lines.join('\n'));
if (shown >= PREVIEW_MAX_LINES) html += '\n……（仅显示前 ' + PREVIEW_MAX_LINES + ' 行小样）';
html += '</pre></div>';
}
if (S.pages.length > PREVIEW_PAGES) {
html += '<div class="ptp-prev-more">仅预览前 ' + PREVIEW_PAGES + ' 页，导出将包含全部 ' + S.pages.length + ' 页（每页一张幻灯片）。</div>';
}
$('ptp-preview-body').innerHTML = html;
showPreview(true);
}

/* ---------------- 导出 PPT（阶段二） ---------------- */
function currentOptions() {
var fontKey = (document.querySelector('input[name="ptp-font"]:checked') || {}).value || 'dengxian';
var sizeKey = (document.querySelector('input[name="ptp-size"]:checked') || {}).value || 'wuhao';
return { font: FONTS[fontKey] || '等线', size: SIZES[sizeKey] || 10.5};
}

async function startExport() {
if (S.busy ||!S.pages.length || S.scanned) return;
setError(''); showResult(false);
setBusy(true);
setStatus('正在加载 PPT 生成组件…');
try {
await ensurePptx().catch(function () { throw { kind: 'lib', what: 'PPT 生成组件（pptxgenjs CDN）'};});
} catch (e) {
setBusy(false);
if (e && e.kind === 'lib') setLibError('组件加载失败：' + e.what + '。已依次尝试 unpkg / npmmirror CDN 与本地组件均失败，请检查网络后刷新重试。');
else setError('组件加载失败，请重试。');
return;
}
setStatus('');
var opt = currentOptions();
try {
var total = S.pages.length;
setProgress(0, '阶段 2/2：正在生成第 1 / ' + total + ' 张幻灯片…');
await tick();
var blob = await ptpBuildSlides(window.PptxGenJS, S.pages, opt, function (i, n) {
setProgress(i / n, '阶段 2/2：正在生成第 ' + i + ' / ' + n + ' 张幻灯片…');
}, 'blob');
setProgress(1, '生成完成，开始下载…');
await tick();
if (S.outUrl) { try { URL.revokeObjectURL(S.outUrl);} catch (e) {}}
S.outUrl = URL.createObjectURL(blob);
var outName = baseName(S.fileName) + '.pptx';
downloadBlob(blob, outName);
$('ptp-result-text').innerHTML = '已导出 <b>' + escHtml(outName) + '</b>（' + fmtSize(blob.size) + '）';
$('ptp-result-sub').textContent = '转换 ' + S.pages.length + ' 页 / 生成 ' + S.pages.length + ' 张幻灯片 · 正文字体' + opt.font + ' · 可直接用 PowerPoint / WPS 打开编辑';
showResult(true);
setProgress(null);
setStatus('导出成功。如需换字体/字号，可调整后点「换选项重新生成」。');
} catch (e) {
setProgress(null);
setError('生成 PPT 失败（' + escHtml(String((e && e.message) || '未知错误')) + '），请重试。');
}
setBusy(false);
}

/* ---------------- 初始化 ---------------- */
function init() {
var up = $('ptp-upload'), fi = $('ptp-file');
up.addEventListener('click', function () { fi.click();});
up.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fi.click();}});
fi.addEventListener('change', function () { if (fi.files && fi.files[0]) handleFile(fi.files[0]); fi.value = '';});
['dragover', 'dragenter'].forEach(function (ev) {
up.addEventListener(ev, function (e) { e.preventDefault(); up.classList.add('dragover');});
});
['dragleave', 'drop'].forEach(function (ev) {
up.addEventListener(ev, function (e) { e.preventDefault(); up.classList.remove('dragover');});
});
up.addEventListener('drop', function (e) {
var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
if (f) handleFile(f);
});
$('ptp-clear').addEventListener('click', function (e) { e.stopPropagation(); resetAll();});
$('ptp-extract').addEventListener('click', startExtract);
$('ptp-export').addEventListener('click', startExport);
$('ptp-regen').addEventListener('click', startExport);
$('ptp-redownload').addEventListener('click', function () {
if (S.outUrl) {
var a = document.createElement('a');
a.href = S.outUrl;
a.download = baseName(S.fileName) + '.pptx';
document.body.appendChild(a); a.click(); a.remove();
}
});
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
})();
