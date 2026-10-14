/* 批量 PDF 转 Word（文本提取版）- 纯前端本地处理
 *
 * 流程：文件队列 → 每份 PDF 用 pdf.js（3.11.174，cdnjs UMD + worker 懒加载）逐页 getTextContent →
 * 按阅读顺序重排（Y 容差合并行、行内 X 排序、行间距保段落分隔）→
 * docx 库（UMD，unpkg 主 + npmmirror 备 + 本地 vendor 兜底，懒加载）按段落生成可编辑 .docx →
 * JSZip（cdnjs 3.10.1 → npmmirror 双 CDN 懒加载，与 docx-repair 同链）打包多份 .docx 为 zip 下载，
 * 同时支持逐个单独下载。
 * 扫描件检测：前 3 页几乎无文本 → 标记「扫描件跳过」引导站内 OCR，不导出空文档、不中断队列。
 * 加密/损坏 PDF：单个文件可读中文报错，队列继续。
 * 文件只在浏览器本地处理，不上传服务器。
 *
 * TODO(长期)：本文件从 pdf-to-word.js 复制了提取纯逻辑（classifyPdfError / ptwReorder /
 * ptwLinesToParagraphs / ptwCollectImageYs 及 CDN 懒加载器），待有档期时抽取公共模块
 * static/js/pdf-text-extract.js 供单文件版与批量版共用，避免逻辑分叉无人认领。
 */
(function () {
'use strict';

/* ---------------- 常量 ---------------- */
var PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
var PDFJS_WORKER_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
var DOCX_CDNS = [
  'https://unpkg.com/docx@9.5.1/dist/index.umd.cjs',
  'https://cdn.npmmirror.com/packages/docx/9.5.1/files/dist/index.umd.cjs'
];
var JSZIP_CDNS = [
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://cdn.npmmirror.com/packages/jszip/3.10.1/jszip.min.js'
];
/* 本地兜底：按本脚本实际加载地址推导 vendor 路径（与 pdf-to-word.js 同口径）。 */
(function () {
  var me = document.currentScript && document.currentScript.src;
  var fb = me ? me.replace(/pdf-to-word-batch\.js(\?.*)?$/, 'vendor/docx-9.5.1.umd.js') : '';
  if (fb && fb !== me) DOCX_CDNS.push(fb);
})();
var BIG_FILE = 50 * 1024 * 1024;   // 超过仅提示，不硬拦截
var SCAN_SAMPLE_PAGES = 3;          // 扫描件检测采样页数
var SCAN_CHAR_LIMIT = 30;           // 采样页总字符数低于此 → 判定扫描件

var FONTS = { dengxian: '等线', songti: '宋体', yahei: '微软雅黑' };
var SIZES = { wuhao: 10.5, xiaosi: 12, sihao: 14 };   // 单位 pt

var STATUS_LABEL = {
  pending: '待处理', working: '处理中', done: '完成',
  failed: '失败', skipped: '扫描件跳过'
};
var STATUS_CLASS = {
  pending: 'pwb-st-pending', working: 'pwb-st-working', done: 'pwb-st-done',
  failed: 'pwb-st-failed', skipped: 'pwb-st-skipped'
};

/* ---------------- 通用小工具 ---------------- */
function $(id) { return document.getElementById(id); }
function fmtSize(n) {
  if (n !== 0 && !n) return '-';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}
function baseName(name) { return String(name || 'file').replace(/\.pdf$/i, ''); }
function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function downloadBlob(blob, name) {
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
}
function tick() { return new Promise(function (r) { setTimeout(r, 0); }); }  // 让出主线程，进度可刷新
function pad2(n) { return (n < 10 ? '0' : '') + n; }

/* ---------- 纯逻辑函数（复制自 pdf-to-word.js，见文件头 TODO） ---------- */

/* PDF 读取错误分类 → 可读中文 */
function classifyPdfError(e) {
  var name = (e && e.name) || '';
  var msg = String((e && e.message) || '');
  if (name === 'PasswordException' || /password|encrypt/i.test(msg)) {
    return { kind: 'encrypted', text: '该 PDF 已加密（带打开密码），无法读取。请先用「PDF 加密/解密」工具解密后再试。' };
  }
  if (name === 'InvalidPDFException' || name === 'MissingPDFException' || /invalid|missing|format|parse|header|trailer|xref/i.test(msg)) {
    return { kind: 'invalid', text: '文件损坏或不是有效的 PDF，请换一个文件试试。' };
  }
  return { kind: 'unknown', text: '无法读取该 PDF 文件（' + (msg || '未知错误') + '），请换一个文件试试。' };
}

/* 估算相邻两文本项之间的平均字宽（用于判断是否需要补空格） */
function ptwAvgCharW(prev, cur) {
  var w = 0, c = 0;
  if (prev.s.length && prev.w > 0) { w += prev.w / prev.s.length; c++; }
  if (cur.s.length && cur.w > 0) { w += cur.w / cur.s.length; c++; }
  return c ? w / c : 6;
}
function isAsciiWordChar(ch) { return /[A-Za-z0-9]/.test(ch || ''); }

/* 按阅读顺序重排单页文本项 → [{y,h,text}]（y 为 PDF 坐标，行已按从上到下排序） */
function ptwReorder(items) {
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
        rows[r].items.push({ x: x, s: str, w: it.width || 0 });
        if (h > rows[r].h) rows[r].h = h;
        placed = true;
        break;
      }
    }
    if (!placed) rows.push({ y: y, h: h, items: [{ x: x, s: str, w: it.width || 0 }] });
  }
  rows.sort(function (a, b) { return b.y - a.y; });  // PDF y 轴向上 → 从大到小即从上到下
  var lines = [];
  for (var k = 0; k < rows.length; k++) {
    var its = rows[k].items.slice().sort(function (a, b) { return a.x - b.x; });
    var line = '';
    var prevEnd = 0, prev = null;
    for (var j = 0; j < its.length; j++) {
      var cur = its[j];
      if (j > 0) {
        var gap = cur.x - prevEnd;
        var avgW = ptwAvgCharW(prev, cur);
        var lastCh = prev.s.charAt(prev.s.length - 1);
        var firstCh = cur.s.charAt(0);
        // 明显空隙 → 补空格（表格列、词组分隔）；中文字符紧邻不补
        if (gap > Math.max(2.5, 0.35 * avgW)) line += ' ';
        else if (isAsciiWordChar(lastCh) && isAsciiWordChar(firstCh) && gap > 0.5) line += ' ';
      }
      line += cur.s;
      prevEnd = cur.x + (cur.w || 0);
      prev = cur;
    }
    lines.push({ y: rows[k].y, h: rows[k].h, text: line });
  }
  return lines;
}

/* 行 → 段落：行间距过大处插入空行保段落分隔；图片标记按 Y 位置并入 */
function ptwLinesToParagraphs(lines, imgYs) {
  var stream = [];
  lines.forEach(function (l) { stream.push({ y: l.y, h: l.h, kind: 'text', text: l.text }); });
  (imgYs || []).forEach(function (y) { stream.push({ y: y, h: 14, kind: 'img' }); });
  stream.sort(function (a, b) { return b.y - a.y; });
  var blocks = [];
  var prevY = null, prevH = 10;
  for (var i = 0; i < stream.length; i++) {
    var s = stream[i];
    if (s.kind === 'img') {
      blocks.push({ text: '[图片]', isImage: true });
      prevY = s.y; prevH = 14;
      continue;
    }
    if (prevY !== null) {
      var gap = prevY - s.y;
      var lh = Math.max(prevH, s.h, 8);
      if (gap > 1.7 * lh) blocks.push({ text: '' });  // 空行：段落分隔
    }
    blocks.push({ text: s.text });
    prevY = s.y; prevH = s.h;
  }
  return blocks;
}

/* 从 operatorList 收集图片绘制的 Y 坐标（跟踪 CTM，处理 q/Q 嵌套） */
function ptwCollectImageYs(opList, OPS, Util) {
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
    if (fn === OPS.save) { stack.push(ctm.slice()); }
    else if (fn === OPS.restore) { if (stack.length) ctm = stack.pop(); }
    else if (fn === OPS.transform) { ctm = mul(ctm, args); }
    else if (fn === OPS.paintImageXObject || fn === OPS.paintJpegXObject || fn === OPS.paintImageMaskXObject) {
      ys.push(ctm[5]);
    }
  }
  return ys;
}

/* ---------------- CDN 懒加载（支持多 URL 依次回退） ---------------- */
function ensureLibFromList(list, globalName) {
  return new Promise(function (resolve, reject) {
    if (window[globalName]) { resolve(); return; }
    var idx = 0;
    function tryNext() {
      if (idx >= list.length) { reject(new Error('all failed')); return; }
      var src = list[idx++];
      var s = document.createElement('script');
      var done = false;
      var timer = setTimeout(function () {
        if (!done) { done = true; s.remove(); tryNext(); }
      }, 25000);
      s.onload = function () {
        if (done) return;
        done = true; clearTimeout(timer);
        if (window[globalName]) resolve();
        else { s.remove(); tryNext(); }
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
    if (window.pdfjsLib.GlobalWorkerOptions && !window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN;
    }
  });
}
function ensureDocx() { return ensureLibFromList(DOCX_CDNS, 'docx'); }
function ensureJSZip() { return ensureLibFromList(JSZIP_CDNS, 'JSZip'); }

/* ---------------- 状态 ---------------- */
var queue = [];        // [{file,name,size,status,pages,pageDone,error,blob,outName}]
var busy = false;      // 批量转换中
var zipping = false;
var fileSeq = 0;

function setStatus(t) { $('pwb-status').textContent = t || ''; }
function setError(t) { $('pwb-error').innerHTML = t || ''; }
function setLibError(t) { var el = $('pwb-lib-error'); el.style.display = t ? 'block' : 'none'; el.innerHTML = t || ''; }
function setNote(t) { var el = $('pwb-bignote'); el.style.display = t ? 'block' : 'none'; el.innerHTML = t || ''; }
function setProgress(pct, txt) {
  var box = $('pwb-progress');
  box.style.display = pct == null ? 'none' : 'block';
  if (pct != null) {
    $('pwb-progress-bar').style.width = Math.round(pct * 100) + '%';
    $('pwb-progress-txt').textContent = txt || '';
  }
}
function showSummary(show) { $('pwb-summary').style.display = show ? 'block' : 'none'; }

/* ---------------- 队列渲染 ---------------- */
function renderQueue() {
  var box = $('pwb-list');
  box.innerHTML = '';
  if (!queue.length) {
    box.innerHTML = '<div class="pwb-empty">还没有文件。点击上方区域选择多个 PDF，或直接把文件拖进来。</div>';
    $('pwb-listbox').style.display = 'none';
    refreshActions();
    return;
  }
  $('pwb-listbox').style.display = 'block';
  queue.forEach(function (q) {
    var row = document.createElement('div');
    row.className = 'pwb-row';
    row.setAttribute('data-id', q.id);
    var html = '<i class="material-icons pwb-ico">picture_as_pdf</i>';
    html += '<div class="pwb-meta"><div class="pwb-nm">' + escHtml(q.name) + '</div>';
    html += '<div class="pwb-sub">' + fmtSize(q.size);
    if (q.pages != null) html += ' · 共 ' + q.pages + ' 页';
    if (q.status === 'working') html += ' · 已提取 ' + q.pageDone + ' / ' + (q.pages || '?') + ' 页';
    if (q.error) html += ' · <span class="pwb-errmsg">' + escHtml(q.error) + '</span>';
    if (q.status === 'skipped') html += ' · 这是扫描件（图片型 PDF），请走站内 <a href="/tools/ocr-image-text">OCR 图片文字识别</a>';
    html += '</div>';
    if (q.status === 'working' && q.pages) {
      var pct = q.pages ? (q.pageDone / q.pages * 100) : 0;
      html += '<div class="pwb-rowbar"><i style="width:' + pct.toFixed(1) + '%"></i></div>';
    }
    html += '</div>';
    html += '<div class="pwb-st ' + STATUS_CLASS[q.status] + '">' + STATUS_LABEL[q.status] + '</div>';
    html += '<div class="pwb-ops">';
    if (q.status === 'done') {
      html += '<button type="button" class="pwb-dl" title="单独下载该 Word"><span class="material-icons">download</span></button>';
    }
    if (q.status === 'pending' || q.status === 'failed' || q.status === 'skipped') {
      html += '<button type="button" class="pwb-rm" title="移除"><span class="material-icons">close</span></button>';
    }
    html += '</div>';
    row.innerHTML = html;
    var dl = row.querySelector('.pwb-dl');
    if (dl) dl.addEventListener('click', function () { downloadOne(q); });
    var rm = row.querySelector('.pwb-rm');
    if (rm) rm.addEventListener('click', function () { removeFile(q.id); });
    box.appendChild(row);
  });
  refreshActions();
}

function refreshActions() {
  var hasFiles = queue.length > 0;
  var hasPending = queue.some(function (q) { return q.status === 'pending' || q.status === 'failed'; });
  var hasDone = queue.some(function (q) { return q.status === 'done'; });
  $('pwb-start').disabled = busy || !hasPending;
  $('pwb-zip').disabled = zipping || !hasDone;
  $('pwb-clear').disabled = busy || !hasFiles;
}

/* ---------------- 文件加入 ---------------- */
function addFiles(files) {
  var added = 0, dup = 0, bad = 0;
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') { bad++; continue; }
    var isDup = queue.some(function (q) { return q.name === f.name && q.size === f.size; });
    if (isDup) { dup++; continue; }
    queue.push({
      id: ++fileSeq, file: f, name: f.name, size: f.size,
      status: 'pending', pages: null, pageDone: 0, error: '', blob: null, outName: ''
    });
    if (f.size > BIG_FILE) added = added;  // 大文件提示统一走顶部 note
    added++;
  }
  var notes = [];
  if (queue.some(function (q) { return q.size > BIG_FILE && (q.status === 'pending' || q.status === 'failed'); })) {
    notes.push('列表中有超过 50MB 的大文件，转换会慢一些，请耐心等待。文件仍只在本地处理，不上传。');
  }
  if (dup) notes.push(dup + ' 个文件已在列表中，已跳过重复添加。');
  if (bad) notes.push(bad + ' 个非 PDF 文件已忽略。');
  setNote(notes.join('<br>'));
  if (added) { setStatus('已加入 ' + added + ' 个文件，点「开始批量转换」。'); setError(''); }
  renderQueue();
}

function removeFile(id) {
  if (busy) return;
  for (var i = 0; i < queue.length; i++) {
    if (queue[i].id === id) {
      var q = queue[i];
      if (q.blob) { try { URL.revokeObjectURL(q.blobUrl); } catch (e) {} }
      queue.splice(i, 1);
      break;
    }
  }
  renderQueue();
}

function clearAll() {
  if (busy) return;
  queue.forEach(function (q) {
    if (q.blobUrl) { try { URL.revokeObjectURL(q.blobUrl); } catch (e) {} }
  });
  queue = [];
  setStatus(''); setError(''); setNote(''); setProgress(null); showSummary(false);
  renderQueue();
}

/* ---------------- 单文件提取 ---------------- */
async function extractPage(pdf, pageNum) {
  var page = await pdf.getPage(pageNum);
  try {
    var tc = await page.getTextContent();
    var lines = ptwReorder(tc.items);
    var imgYs = [];
    try {
      var opList = await page.getOperatorList();
      imgYs = ptwCollectImageYs(opList, window.pdfjsLib.OPS, window.pdfjsLib.Util);
    } catch (e) { imgYs = []; }
    var blocks = ptwLinesToParagraphs(lines, imgYs);
    var chars = blocks.reduce(function (a, b) { return a + (b.text ? b.text.length : 0); }, 0);
    return { num: pageNum, blocks: blocks, chars: chars };
  } finally {
    try { page.cleanup(); } catch (e) {}
  }
}

async function processOne(q, opt) {
  q.status = 'working';
  q.pageDone = 0;
  renderQueue();
  var pdf = null;
  try {
    var buf = await q.file.arrayBuffer();
    pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    q.pages = pdf.numPages;
    renderQueue();
    var pages = [];
    var sampleChars = 0;
    for (var p = 1; p <= pdf.numPages; p++) {
      var pg = await extractPage(pdf, p);
      pages.push(pg);
      if (p <= SCAN_SAMPLE_PAGES) sampleChars += pg.chars;
      q.pageDone = p;
      renderQueue();
      await tick();
    }
    if (sampleChars < SCAN_CHAR_LIMIT) {
      q.status = 'skipped';
      q.error = '';
      renderQueue();
      return;
    }
    var doc = await buildDocxBlob(pages, opt);
    q.blob = doc.blob;
    q.outName = baseName(q.name) + '.docx';
    q.blobUrl = URL.createObjectURL(doc.blob);
    q.status = 'done';
    q.error = '';
    renderQueue();
  } catch (e) {
    q.status = 'failed';
    q.error = classifyPdfError(e).text;
    renderQueue();
  } finally {
    if (pdf) { try { pdf.destroy(); } catch (e2) {} }
  }
}

/* ---------------- docx 生成 ---------------- */
function currentOptions() {
  var fontKey = (document.querySelector('input[name="pwb-font"]:checked') || {}).value || 'dengxian';
  var sizeKey = (document.querySelector('input[name="pwb-size"]:checked') || {}).value || 'wuhao';
  return { font: FONTS[fontKey] || '等线', size: SIZES[sizeKey] || 10.5 };
}

async function buildDocxBlob(pages, opt) {
  var docx = window.docx;
  var children = [];
  var paraCount = 0;
  for (var i = 0; i < pages.length; i++) {
    var pg = pages[i];
    for (var j = 0; j < pg.blocks.length; j++) {
      var b = pg.blocks[j];
      var firstOfDoc = (i === 0 && j === 0);
      if (b.text === '') {
        children.push(new docx.Paragraph({ spacing: { after: 160 } }));
        continue;
      }
      paraCount++;
      children.push(new docx.Paragraph({
        children: [new docx.TextRun({
          text: b.text,
          font: opt.font,
          size: Math.round(opt.size * 2),
          color: b.isImage ? '808080' : undefined
        })],
        spacing: { after: b.isImage ? 120 : 160 },
        pageBreakBefore: !firstOfDoc && i > 0 && j === 0
      }));
    }
  }
  var doc = new docx.Document({
    creator: 'ToolWeb 批量PDF转Word',
    lastModifiedBy: 'ToolWeb 批量PDF转Word',
    sections: [{ children: children }]
  });
  var blob = await docx.Packer.toBlob(doc);
  return { blob: blob, paras: paraCount };
}

/* ---------------- 批量转换主流程 ---------------- */
async function startBatch() {
  if (busy) return;
  var todo = queue.filter(function (q) { return q.status === 'pending' || q.status === 'failed'; });
  if (!todo.length) return;
  busy = true;
  setError(''); setLibError(''); showSummary(false);
  refreshActions();
  setStatus('正在加载 PDF 解析组件…');
  try {
    await ensurePdfJs().catch(function () { throw { kind: 'lib', what: 'PDF 解析组件（pdf.js CDN）' }; });
  } catch (e) {
    busy = false;
    if (e && e.kind === 'lib') setLibError('组件加载失败：' + e.what + '。请检查网络后刷新重试（需能访问 CDN）。');
    else setError('组件加载失败，请刷新重试。');
    refreshActions();
    return;
  }
  var opt = currentOptions();
  var docxReady = false;
  for (var i = 0; i < todo.length; i++) {
    var q = todo[i];
    setProgress(i / todo.length, '正在处理第 ' + (i + 1) + ' / ' + todo.length + ' 个文件：' + q.name);
    if (!docxReady) {
      setStatus('正在加载 Word 生成组件…');
      try {
        await ensureDocx().catch(function () { throw { kind: 'lib', what: 'Word 生成组件（docx CDN）' }; });
        docxReady = true;
      } catch (e) {
        setProgress(null);
        busy = false;
        if (e && e.kind === 'lib') setLibError('组件加载失败：' + e.what + '。已依次尝试 unpkg / npmmirror CDN 与本地组件均失败，请检查网络后刷新重试。');
        else setError('组件加载失败，请重试。');
        refreshActions();
        return;
      }
    }
    await processOne(q, opt);
    setProgress((i + 1) / todo.length, '正在处理第 ' + (i + 1) + ' / ' + todo.length + ' 个文件：' + q.name);
    await tick();
  }
  busy = false;
  setProgress(null);
  renderSummary();
  refreshActions();
}

function renderSummary() {
  var done = queue.filter(function (q) { return q.status === 'done'; });
  var failed = queue.filter(function (q) { return q.status === 'failed'; });
  var skipped = queue.filter(function (q) { return q.status === 'skipped'; });
  var html = '完成 <b>' + done.length + '</b> 个';
  if (skipped.length) html += ' · 扫描件跳过 <b>' + skipped.length + '</b> 个（请走站内 <a href="/tools/ocr-image-text">OCR 图片文字识别</a>）';
  if (failed.length) html += ' · 失败 <b>' + failed.length + '</b> 个';
  html += '。';
  if (done.length) html += '点「打包下载全部」把 ' + done.length + ' 份 Word 打成一个 zip，或逐行单独下载。';
  $('pwb-summary-text').innerHTML = html;
  showSummary(true);
  setStatus(done.length ? '批量转换完成。' : '本批没有成功转换的文件。');
}

/* ---------------- 下载 ---------------- */
function downloadOne(q) {
  if (!q.blob) return;
  downloadBlob(q.blob, q.outName);
}

async function zipAll() {
  if (zipping) return;
  var done = queue.filter(function (q) { return q.status === 'done' && q.blob; });
  if (!done.length) return;
  zipping = true;
  refreshActions();
  setStatus('正在加载打包组件…');
  try {
    await ensureJSZip().catch(function () { throw { kind: 'lib', what: '打包组件（JSZip CDN）' }; });
  } catch (e) {
    zipping = false;
    if (e && e.kind === 'lib') setLibError('组件加载失败：' + e.what + '。cdnjs / npmmirror CDN 都不可达，请检查网络后重试；也可以先逐个单独下载。');
    else setError('组件加载失败，请重试。');
    refreshActions();
    return;
  }
  setStatus('正在打包 ' + done.length + ' 份 Word 文档…');
  try {
    var zip = new window.JSZip();
    var usedNames = {};
    done.forEach(function (q) {
      var nm = q.outName;
      if (usedNames[nm]) {
        var k = 2, cand = nm;
        while (usedNames[cand]) { cand = baseName(nm) + '_' + (k++) + '.docx'; }
        nm = cand;
      }
      usedNames[nm] = true;
      zip.file(nm, q.blob);
    });
    var content = await zip.generateAsync({ type: 'blob' }, function (meta) {
      setStatus('正在打包：' + Math.round(meta.percent) + '%…');
    });
    var d = new Date();
    var zipName = '批量PDF转Word_' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) +
      '_' + pad2(d.getHours()) + pad2(d.getMinutes()) + '.zip';
    downloadBlob(content, zipName);
    setStatus('已打包下载「' + zipName + '」（' + fmtSize(content.size) + '）。');
  } catch (e) {
    setError('打包失败（' + escHtml(String((e && e.message) || '未知错误')) + '），请逐个单独下载或重试。');
  }
  zipping = false;
  refreshActions();
}

/* ---------------- 初始化 ---------------- */
function init() {
  var up = $('pwb-upload'), fi = $('pwb-file');
  up.addEventListener('click', function () { fi.click(); });
  up.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fi.click(); } });
  fi.addEventListener('change', function () { if (fi.files && fi.files.length) addFiles(fi.files); fi.value = ''; });
  ['dragover', 'dragenter'].forEach(function (ev) {
    up.addEventListener(ev, function (e) { e.preventDefault(); up.classList.add('dragover'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    up.addEventListener(ev, function (e) { e.preventDefault(); up.classList.remove('dragover'); });
  });
  up.addEventListener('drop', function (e) {
    var fs = e.dataTransfer && e.dataTransfer.files;
    if (fs && fs.length) addFiles(fs);
  });
  $('pwb-start').addEventListener('click', startBatch);
  $('pwb-zip').addEventListener('click', zipAll);
  $('pwb-clear').addEventListener('click', clearAll);
  renderQueue();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
})();
