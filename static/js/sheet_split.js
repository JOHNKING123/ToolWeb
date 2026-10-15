/* 表格拆分 - 纯前端本地 Excel 拆分工具（SheetJS）
 *
 * 流程：上传 .xlsx/.xls/.csv（点击/拖拽）→ SheetJS 本地解析（CDN 懒加载 + 本地
 * vendor 兜底）→ 选择拆分模式：①按列拆分（选定关键列，同值归为一张表——核心卖点）
 * ②按行数拆分（每 N 行一张表）③按工作表拆分（每张工作表单独成文件）→ 预览分组/
 * 分块统计 → 导出：拆出结果保留首行表头；单结果直接下载 .xlsx，多结果经 JSZip
 *（CDN 懒加载）打包 ZIP，JSZip 加载失败时降级逐个下载。全程不上传服务器，
 * 无新增后端接口；CDN 失败时给出可读报错，页面不白屏。
 */
(function () {
'use strict';

/* ---------------- 常量 ---------------- */
var XLSX_CDNS = [
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js'
];
/* 本地兜底：按本脚本实际加载地址推导 vendor 路径（与 image-to-excel.js 同款写法），
 * /tools 与 /tool-web 两种挂载前缀都可用。
 * IIFE 在浏览器脚本加载时同步执行，document.currentScript 有效；
 * Node 单测时 document 不存在，直接跳过（不影响纯逻辑导出）。 */
(function () {
  if (typeof document === 'undefined' || !document.currentScript) return;
  var me = document.currentScript.src;
  var fb = me ? me.replace(/sheet_split\.js(\?.*)?$/, 'vendor/xlsx-0.18.5.umd.js') : '';
  if (fb && fb !== me) XLSX_CDNS.push(fb);
})();
var ZIP_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
var BIG_FILE = 50 * 1024 * 1024;   // 超过 50MB 仅提示较慢，不硬拦截
var PREVIEW_ROWS = 10;             // 预览表格展示行数
var PREVIEW_GROUPS = 12;           // 按列拆分预览展示分组数

/*<SS-PURE-BEGIN>*/
/* ---------------- 纯逻辑函数（无 DOM，可在 Node 下单测） ---------------- */

/* Excel 工作表名非法字符 \ / ? * [ ] :，上限 31 字符 */
function sanitizeSheetName(s) {
  var t = String(s == null ? '' : s).replace(/[\\\/\?\*\[\]\:]/g, '_').trim();
  if (!t) t = 'Sheet';
  if (t.length > 31) t = t.slice(0, 31);
  return t;
}
/* 去重：重名追加 (2)、(3)…，保持原顺序 */
function uniqueNames(names) {
  var seen = Object.create(null), out = [];
  for (var i = 0; i < names.length; i++) {
    var n = names[i], k = n, c = 2;
    while (seen[k]) { k = n + ' (' + (c++) + ')'; }
    seen[k] = 1;
    out.push(k);
  }
  return out;
}
/* 文件名去后缀 + 去非法字符（与 image-to-excel.js 同款） */
function safeBaseName(name) {
  var n = String(name || 'split').replace(/\.[a-z0-9]+$/i, '');
  n = n.replace(/[\\/:*?"<>|\r\n]/g, '_').trim();
  return n || 'split';
}
/* 文件名片段：去非法字符，限长 80 */
function sanitizeFilePart(s) {
  var t = String(s == null ? '' : s).replace(/[\\\/:*?"<>|\r\n]/g, '_').trim();
  if (t.length > 80) t = t.slice(0, 80);
  return t || '未命名';
}
/* 序号补零 */
function padNum(n, width) {
  var s = String(n);
  while (s.length < width) s = '0' + s;
  return s;
}
/* 分组键显示标签：空值统一显示为（空值） */
function keyLabel(key) {
  if (key === null || key === undefined || key === '') return '（空值）';
  return String(key);
}
/* 按列分组：rows 为数据行（不含表头），colIdx 为关键列下标
 * 返回 [{key, label, rows}]，按分组值首次出现顺序排列 */
function groupRowsByColumn(rows, colIdx) {
  var groups = [], idx = Object.create(null);
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i] || [];
    var v = colIdx < row.length ? row[colIdx] : '';
    if (v === null || v === undefined) v = '';
    var k = String(v);
    if (!(k in idx)) {
      idx[k] = groups.length;
      groups.push({ key: k, label: keyLabel(k), rows: [] });
    }
    groups[idx[k]].rows.push(row);
  }
  return groups;
}
/* 按行数切块：rows 为数据行，n 为每块行数（>=1） */
function chunkRows(rows, n) {
  var out = [];
  n = Math.max(1, n | 0 || 1);
  for (var i = 0; i < rows.length; i += n) out.push(rows.slice(i, i + n));
  return out;
}
/* 工作簿解析：buf 为 ArrayBuffer/Buffer/Uint8Array，fileName 用于判定 CSV
 * 返回 {sheets: [{name, header, rows, ncols}]}，header 为首行，rows 为数据行。
 * XLSX 以参数传入，保持函数纯粹、无全局依赖。 */
function parseWorkbook(XLSX, buf, fileName) {
  var wb;
  if (/\.csv$/i.test(fileName || '')) {
    var text = (typeof buf === 'string') ? buf : new TextDecoder('utf-8').decode(buf);
    wb = XLSX.read(text, { type: 'string' });
  } else {
    wb = XLSX.read(buf, { type: 'array' });
  }
  var sheets = [];
  for (var i = 0; i < wb.SheetNames.length; i++) {
    var sn = wb.SheetNames[i];
    var aoa = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '', raw: true });
    /* 去掉尾部全空行 */
    while (aoa.length) {
      var last = aoa[aoa.length - 1], allEmpty = true;
      for (var e = 0; e < last.length; e++) {
        if (last[e] !== '' && last[e] !== null && last[e] !== undefined) { allEmpty = false; break; }
      }
      if (!allEmpty) break;
      aoa.pop();
    }
    var ncols = 0, r;
    for (r = 0; r < aoa.length; r++) ncols = Math.max(ncols, aoa[r].length);
    for (r = 0; r < aoa.length; r++) while (aoa[r].length < ncols) aoa[r].push('');
    sheets.push({
      name: sn,
      header: aoa.length ? aoa[0] : [],
      rows: aoa.length > 1 ? aoa.slice(1) : [],
      ncols: ncols
    });
  }
  return { sheets: sheets };
}
/* 构建拆分方案（纯逻辑核心）
 * parsed: parseWorkbook 的返回值
 * mode: 'column' | 'rows' | 'sheet'
 * opts: {sheetIndex, colIndex, rowCount, baseName}
 * 返回 [{fileName, sheetName, aoa}]，aoa 首行为表头；文件名按「列值/序号 + 原文件名」命名 */
function buildSplitPlan(parsed, mode, opts) {
  opts = opts || {};
  var base = safeBaseName(opts.baseName || 'split');
  var parts = [];
  function pushPart(namePart, sheetName, header, rows) {
    parts.push({
      fileName: base + '_' + sanitizeFilePart(namePart) + '.xlsx',
      sheetName: sheetName,
      aoa: [header].concat(rows)
    });
  }
  if (mode === 'sheet') {
    var snames = uniqueNames(parsed.sheets.map(function (s) { return sanitizeSheetName(s.name); }));
    for (var i = 0; i < parsed.sheets.length; i++) {
      var s = parsed.sheets[i];
      pushPart(snames[i], snames[i], s.header, s.rows);
    }
    return parts;
  }
  var si = Math.max(0, Math.min(opts.sheetIndex | 0, parsed.sheets.length - 1));
  var src = parsed.sheets[si];
  if (mode === 'column') {
    var ci = Math.max(0, opts.colIndex | 0);
    var groups = groupRowsByColumn(src.rows, ci);
    var labels = uniqueNames(groups.map(function (g) { return sanitizeSheetName(g.label); }));
    for (var g = 0; g < groups.length; g++) {
      pushPart(labels[g], labels[g], src.header, groups[g].rows);
    }
  } else { /* rows */
    var n = Math.max(1, opts.rowCount | 0 || 100);
    var chunks = chunkRows(src.rows, n);
    var pad = String(chunks.length).length;
    for (var c = 0; c < chunks.length; c++) {
      var from = c * n + 1, to = c * n + chunks[c].length;
      var no = padNum(c + 1, pad);
      pushPart(no, '第' + from + '-' + to + '行', src.header, chunks[c]);
    }
  }
  return parts;
}
/* 供 Node 单测导出纯逻辑 */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    sanitizeSheetName: sanitizeSheetName, uniqueNames: uniqueNames,
    safeBaseName: safeBaseName, sanitizeFilePart: sanitizeFilePart,
    padNum: padNum, keyLabel: keyLabel,
    groupRowsByColumn: groupRowsByColumn, chunkRows: chunkRows,
    parseWorkbook: parseWorkbook, buildSplitPlan: buildSplitPlan
  };
}
/*<SS-PURE-END>*/

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
        if (window[globalName]) resolve(); else tryNext();
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
function ensureXlsx() { return ensureLibFromList(XLSX_CDNS, 'XLSX'); }
function ensureJSZip() { return ensureLibFromList([ZIP_CDN], 'JSZip'); }

/* ---------------- 工具函数（浏览器） ---------------- */
function $(id) { return document.getElementById(id); }
function setStatus(m) { $('ss-status').textContent = m || ''; }
function showError(m) {
  var el = $('ss-error');
  el.textContent = m; el.style.display = 'block';
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function hideError() { $('ss-error').style.display = 'none'; $('ss-error').textContent = ''; }
function libLoadFail(what) {
  var el = $('ss-lib-error');
  el.style.display = 'block';
  el.textContent = what + '组件加载失败，请检查网络连接后重试（页面本身不受影响）。';
}
function toast(m) {
  var el = document.createElement('div');
  el.textContent = m;
  el.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:#111827;color:#fff;padding:.6rem 1.2rem;border-radius:.5rem;z-index:9999;font-size:.9rem;max-width:86vw;text-align:center;';
  document.body.appendChild(el);
  setTimeout(function () { if (el.parentNode) document.body.removeChild(el); }, 3000);
}
function fmtSize(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}
function escHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function downloadBlob(blob, name) {
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
}
function showProgress(txt, ratio) {
  $('ss-progress').style.display = 'block';
  $('ss-progress-bar').style.width = Math.round(ratio * 100) + '%';
  $('ss-progress-txt').textContent = txt;
}
function hideProgress() { $('ss-progress').style.display = 'none'; }
function tick() { return new Promise(function (r) { setTimeout(r, 30); }); }
/* 列宽：按列最大显示宽度估算（CJK 算 2，ASCII 算 1），上限 50（与 image-to-excel 同款） */
function colWidths(aoa) {
  if (!aoa.length) return [];
  var C = aoa[0].length, out = [];
  for (var c = 0; c < C; c++) {
    var m = 4;
    for (var r = 0; r < aoa.length; r++) {
      var t = String(aoa[r][c] == null ? '' : aoa[r][c]), w = 0;
      for (var i = 0; i < t.length; i++) w += t.charCodeAt(i) > 255 ? 2 : 1;
      if (w > m) m = w;
    }
    out.push({ wch: Math.min(50, m + 2) });
  }
  return out;
}

/* ---------------- 状态 ---------------- */
var S = {
  fileName: '', buf: null, parsed: null,
  mode: 'column', busy: false, parts: []
};

/* ---------------- 文件读取与解析 ---------------- */
function isSheetFile(f) {
  return /\.(xlsx|xls|csv)$/i.test(f.name);
}
function handleFile(file) {
  hideError();
  if (!file) return;
  if (!isSheetFile(file)) {
    showError('仅支持 .xlsx / .xls / .csv 文件。');
    return;
  }
  if (file.size > BIG_FILE) setStatus('文件较大（' + fmtSize(file.size) + '），解析可能需要一些时间…');
  else setStatus('正在读取文件…');
  file.arrayBuffer().then(function (buf) {
    S.fileName = file.name; S.buf = buf; S.parts = [];
    $('ss-fileinfo').style.display = 'flex';
    $('ss-file-name').textContent = file.name;
    $('ss-file-sub').textContent = fmtSize(file.size) + ' · 本地解析，不上传';
    $('ss-result').style.display = 'none';
    return ensureXlsx().then(function () {
      setStatus('正在解析表格…');
      return tick();
    }).then(function () {
      S.parsed = parseWorkbook(window.XLSX, buf, file.name);
      if (!S.parsed.sheets.length) throw new Error('empty');
      renderAfterParse();
    });
  }).catch(function (e) {
    if (e && e.message === 'all failed') { libLoadFail('表格解析（SheetJS）'); setStatus(''); return; }
    showError(e && e.message === 'empty' ? '文件中没有可读取的工作表。' : '文件解析失败：不是有效的 Excel/CSV 文件，或文件已损坏。');
    setStatus('');
  });
}
function renderAfterParse() {
  var sheets = S.parsed.sheets;
  /* 工作表选择 */
  var ssel = $('ss-sheet'), html = '';
  for (var i = 0; i < sheets.length; i++) {
    html += '<option value="' + i + '">' + escHtml(sheets[i].name) +
      '（' + sheets[i].rows.length + ' 行数据）</option>';
  }
  ssel.innerHTML = html;
  $('ss-sheet-wrap').style.display = (sheets.length > 1 && S.mode !== 'sheet') ? '' : 'none';
  $('ss-params').style.display = '';
  $('ss-preview').style.display = '';
  renderParams();
  setStatus('解析成功：' + sheets.length + ' 个工作表，请选择拆分模式与参数。');
  $('ss-run').disabled = false;
  updatePreview();
}

/* ---------------- 参数区渲染 ---------------- */
function currentSheet() {
  var idx = parseInt(($('ss-sheet') || {}).value || '0', 10) || 0;
  return S.parsed.sheets[Math.max(0, Math.min(idx, S.parsed.sheets.length - 1))];
}
function renderParams() {
  var sh = currentSheet();
  $('ss-col-wrap').style.display = S.mode === 'column' ? '' : 'none';
  $('ss-rows-wrap').style.display = S.mode === 'rows' ? '' : 'none';
  $('ss-sheet-wrap').style.display =
    (S.parsed.sheets.length > 1 && S.mode !== 'sheet') ? '' : 'none';
  if (S.mode === 'column') {
    var csel = $('ss-col'), html = '';
    for (var i = 0; i < sh.ncols; i++) {
      var label = String(sh.header[i] == null ? '' : sh.header[i]).trim();
      html += '<option value="' + i + '">' + escHtml(label || ('第' + (i + 1) + '列')) + '</option>';
    }
    csel.innerHTML = html;
  }
  updatePreview();
}
function previewTableHTML(header, rows) {
  var h = '<table class="ss-table"><thead><tr>';
  for (var j = 0; j < header.length; j++) h += '<th>' + escHtml(header[j]) + '</th>';
  h += '</tr></thead><tbody>';
  var n = Math.min(PREVIEW_ROWS, rows.length);
  for (var i = 0; i < n; i++) {
    h += '<tr>';
    for (var k = 0; k < header.length; k++) h += '<td>' + escHtml(rows[i][k]) + '</td>';
    h += '</tr>';
  }
  return h + '</tbody></table>';
}
function updatePreview() {
  if (!S.parsed) return;
  hideError();
  var sh = currentSheet();
  var info = '当前表「' + sh.name + '」：' + sh.rows.length + ' 行数据 × ' + sh.ncols + ' 列';
  var extra = '';
  if (S.mode === 'column') {
    var ci = parseInt($('ss-col').value || '0', 10) || 0;
    var groups = groupRowsByColumn(sh.rows, ci);
    extra = '按第 ' + (ci + 1) + ' 列拆分 → ' + groups.length + ' 组：' +
      groups.slice(0, PREVIEW_GROUPS).map(function (g) {
        return escHtml(g.label) + '（' + g.rows.length + '行）';
      }).join('、') + (groups.length > PREVIEW_GROUPS ? '…等' + groups.length + '组' : '');
  } else if (S.mode === 'rows') {
    var n = Math.max(1, parseInt($('ss-rowcount').value || '100', 10) || 100);
    var chunks = Math.ceil(sh.rows.length / n);
    extra = '每 ' + n + ' 行一张表 → 共 ' + chunks + ' 张表';
  } else {
    extra = '每个工作表单独成文件 → 共 ' + S.parsed.sheets.length + ' 个文件';
  }
  $('ss-preview-stat').innerHTML = escHtml(info) + '<br>' + extra;
  $('ss-preview-table').innerHTML = sh.rows.length
    ? previewTableHTML(sh.header, sh.rows) : '<div class="ss-empty">该工作表暂无数据行</div>';
  $('ss-run').disabled = !sh.rows.length;
}

/* ---------------- 拆分与下载 ---------------- */
function partToXlsxBlob(part) {
  var wb = window.XLSX.utils.book_new();
  var ws = window.XLSX.utils.aoa_to_sheet(part.aoa);
  ws['!cols'] = colWidths(part.aoa);
  window.XLSX.utils.book_append_sheet(wb, ws, part.sheetName);
  var arr = window.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([arr], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
function doSplit() {
  if (!S.parsed || S.busy) return;
  hideError();
  var sh = currentSheet();
  if (!sh.rows.length) { showError('所选工作表没有数据行，无法拆分。'); return; }
  var opts = {
    baseName: S.fileName,
    sheetIndex: parseInt($('ss-sheet').value || '0', 10) || 0,
    colIndex: parseInt(($('ss-col') || {}).value || '0', 10) || 0,
    rowCount: Math.max(1, parseInt($('ss-rowcount').value || '100', 10) || 100)
  };
  S.busy = true;
  $('ss-run').disabled = true;
  showProgress('正在拆分…', 0.3);
  setTimeout(function () {
    try {
      S.parts = buildSplitPlan(S.parsed, S.mode, opts);
      if (!S.parts.length) throw new Error('no parts');
      showResult();
      showProgress('拆分完成', 1);
      setStatus('拆分完成：共 ' + S.parts.length + ' 个结果。');
      setTimeout(hideProgress, 1200);
    } catch (e) {
      showError('拆分失败：' + (e && e.message ? e.message : '未知错误'));
      hideProgress(); setStatus('');
    } finally {
      S.busy = false;
      $('ss-run').disabled = false;
    }
  }, 30);
}
function showResult() {
  var box = $('ss-result');
  box.style.display = 'block';
  var html = '';
  for (var i = 0; i < S.parts.length; i++) {
    var p = S.parts[i];
    html += '<div class="ss-item"><i class="material-icons">table_view</i>' +
      '<div class="meta"><div class="nm">' + escHtml(p.fileName) + '</div>' +
      '<div class="sub">工作表「' + escHtml(p.sheetName) + '」· ' + (p.aoa.length - 1) + ' 行数据 × ' + (p.aoa[0] ? p.aoa[0].length : 0) + ' 列</div></div>' +
      '<div class="ops"><button type="button" class="btn btn-sm" data-i="' + i + '"><span class="material-icons">download</span>下载</button></div></div>';
  }
  $('ss-result-list').innerHTML = html;
  var btns = $('ss-result-list').querySelectorAll('button[data-i]');
  for (var b = 0; b < btns.length; b++) {
    (function (btn) {
      btn.addEventListener('click', function () {
        var p = S.parts[parseInt(btn.getAttribute('data-i'), 10)];
        downloadBlob(partToXlsxBlob(p), p.fileName);
        toast('已下载 ' + p.fileName);
      });
    })(btns[b]);
  }
  /* 单结果直接下载按钮，多结果显示打包按钮 */
  if (S.parts.length === 1) {
    $('ss-dl-single').style.display = '';
    $('ss-dl-zip').style.display = 'none';
  } else {
    $('ss-dl-single').style.display = 'none';
    $('ss-dl-zip').style.display = '';
    $('ss-dl-zip').innerHTML = '<i class="material-icons">folder_zip</i> 打包下载 ZIP（' + S.parts.length + ' 个文件）';
  }
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function downloadSingle() {
  if (S.parts.length !== 1) return;
  var p = S.parts[0];
  downloadBlob(partToXlsxBlob(p), p.fileName);
  toast('已下载 ' + p.fileName);
}
function downloadZip() {
  if (!S.parts.length) return;
  var btn = $('ss-dl-zip');
  btn.disabled = true;
  showProgress('正在打包 ZIP…', 0.5);
  ensureJSZip().then(function () {
    var zip = new window.JSZip();
    for (var i = 0; i < S.parts.length; i++) {
      zip.file(S.parts[i].fileName, partToXlsxBlob(S.parts[i]));
    }
    return zip.generateAsync({ type: 'blob' }, function (meta) {
      showProgress('正在打包 ZIP… ' + Math.round(meta.percent) + '%', 0.5 + meta.percent / 200);
    });
  }).then(function (blob) {
    var name = safeBaseName(S.fileName) + '_拆分结果.zip';
    downloadBlob(blob, name);
    toast('已下载 ' + name);
    showProgress('打包完成', 1);
    setTimeout(hideProgress, 1200);
  }).catch(function () {
    /* 降级：逐个下载 */
    hideProgress();
    toast('打包失败，已降级为逐个下载');
    showError('ZIP 打包失败（可能是 JSZip CDN 加载异常），已自动降级为逐个下载，请在浏览器中允许下载多个文件。');
    var i = 0;
    (function next() {
      if (i >= S.parts.length) return;
      var p = S.parts[i++];
      downloadBlob(partToXlsxBlob(p), p.fileName);
      setTimeout(next, 600);
    })();
  }).finally(function () { btn.disabled = false; });
}
function clearFile() {
  S.fileName = ''; S.buf = null; S.parsed = null; S.parts = [];
  $('ss-file').value = '';
  $('ss-fileinfo').style.display = 'none';
  $('ss-params').style.display = 'none';
  $('ss-preview').style.display = 'none';
  $('ss-result').style.display = 'none';
  $('ss-run').disabled = true;
  setStatus('');
  hideError();
}

/* ---------------- 事件绑定（仅浏览器；Node 单测时跳过） ---------------- */
if (typeof document !== 'undefined') {
document.addEventListener('DOMContentLoaded', function () {
  var up = $('ss-upload'), fi = $('ss-file');
  up.addEventListener('click', function () { fi.click(); });
  up.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fi.click(); }
  });
  ['dragover', 'dragenter'].forEach(function (ev) {
    up.addEventListener(ev, function (e) { e.preventDefault(); up.classList.add('dragover'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    up.addEventListener(ev, function (e) { e.preventDefault(); up.classList.remove('dragover'); });
  });
  up.addEventListener('drop', function (e) {
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleFile(f);
  });
  fi.addEventListener('change', function () {
    if (fi.files && fi.files[0]) handleFile(fi.files[0]);
  });
  $('ss-clear').addEventListener('click', clearFile);

  /* 模式切换 */
  var pills = document.querySelectorAll('input[name="ss-mode"]');
  for (var i = 0; i < pills.length; i++) {
    pills[i].addEventListener('change', function () {
      S.mode = document.querySelector('input[name="ss-mode"]:checked').value;
      $('ss-result').style.display = 'none';
      S.parts = [];
      if (S.parsed) { $('ss-params').style.display = ''; $('ss-preview').style.display = ''; renderParams(); }
    });
  }
  $('ss-sheet').addEventListener('change', function () { renderParams(); });
  $('ss-col').addEventListener('change', function () { updatePreview(); });
  $('ss-rowcount').addEventListener('input', function () { updatePreview(); });
  $('ss-run').addEventListener('click', doSplit);
  $('ss-dl-single').addEventListener('click', downloadSingle);
  $('ss-dl-zip').addEventListener('click', downloadZip);
});
}

})();
