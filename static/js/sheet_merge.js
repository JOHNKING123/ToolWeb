/* 表格合并 - 纯前端本地 Excel 多文件/多工作表纵向合并工具（SheetJS）
 *
 * 流程：多文件上传（.xlsx/.xls/.csv，点击/拖拽，FileReader+SheetJS 本地解析，
 * CDN 懒加载 + 本地 vendor 兜底）→ 选择合并模式：
 * ①多文件纵向合并（每文件选一张工作表参与，表头对齐：并集补空 / 交集保留），
 * ②同文件多工作表合并（选一个文件，勾选多张工作表合并）→ 选项：保留表头、
 * 追加来源列、表头对齐策略 → 合并统计预览 → 单结果 xlsx 下载
 * （merge-<时间戳>.xlsx）。全程不上传服务器，无新增后端接口。
 */
(function () {
'use strict';

/* ---------------- 常量 ---------------- */
var XLSX_CDNS = [
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js'
];
/* 本地兜底：按本脚本实际加载地址推导 vendor 路径（与 sheet_split.js 同款写法），
 * /tools 与 /tool-web 两种挂载前缀都可用。
 * Node 单测时 document 不存在，直接跳过。 */
(function () {
  if (typeof document === 'undefined' || !document.currentScript) return;
  var me = document.currentScript.src;
  var fb = me ? me.replace(/sheet_merge\.js(\?.*)?$/, 'vendor/xlsx-0.18.5.umd.js') : '';
  if (fb && fb !== me) XLSX_CDNS.push(fb);
})();
var BIG_FILE = 50 * 1024 * 1024;   // 超过 50MB 仅提示较慢，不硬拦截
var PREVIEW_ROWS = 10;             // 预览表格展示行数
var SOURCE_COL_NAME = '来源文件';   // 追加来源列时的列头

/*<SM-PURE-BEGIN>*/
/* ---------------- 纯逻辑函数（无 DOM，可在 Node 下单测） ---------------- */

/* Excel 工作表名非法字符 \ / ? * [ ] :，上限 31 字符 */
function sanitizeSheetName(s) {
  var t = String(s == null ? '' : s).replace(/[\\\/\?\*\[\]\:]/g, '_').trim();
  if (!t) t = 'Sheet';
  if (t.length > 31) t = t.slice(0, 31);
  return t;
}
/* 文件名去后缀 + 去非法字符（与 sheet_split.js 同款） */
function safeBaseName(name) {
  var n = String(name || 'merge').replace(/\.[a-z0-9]+$/i, '');
  n = n.replace(/[\\/:*?"<>|\r\n]/g, '_').trim();
  return n || 'merge';
}
/* 表头对齐键：trim 后字符串；原型链污染防护用 Object.create(null)（与 sheet_split.js 一致） */
function headerKey(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}
/* 工作簿解析：复用 sheet_split.js 的实现思路（尾部全空行剔除、列宽补齐）
 * buf 为 ArrayBuffer/Buffer/Uint8Array，fileName 用于判定 CSV
 * 返回 {sheets: [{name, header, rows, ncols}]}，XLSX 以参数传入 */
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
/* 列键：表头规范化名 + 同名在表内出现序号，保证同表内唯一
 * （解决：空白列折叠、重复非空表头折叠导致的静默丢列） */
function tableColKeys(t) {
  var keys = [], counts = Object.create(null);
  var src = (t && t.header) || [];
  for (var j = 0; j < src.length; j++) {
    var k = headerKey(src[j]);
    var n = counts[k] || 0;
    counts[k] = n + 1;
    keys.push(k + '\u0000' + n);
  }
  return keys;
}
/* 纵向合并（纯逻辑核心）
 * tables: [{label, header, rows}] — header 为表头行数组（未保留表头时 header 为空数组），rows 为数据行
 * opts: {strategy: 'union'|'intersect', keepHeader: bool, sourceCol: bool, sourceColName}
 * union: 取所有表头并集（首次出现顺序），各表缺失列补空
 * intersect: 只保留所有表共有的列（按首表顺序）
 * keepHeader=false 时按位置合并：union 取最大列数、intersect 取最小列数
 * 返回 {header, rows, labels: 各来源实际参与列数} */
function mergeTables(tables, opts) {
  opts = opts || {};
  var strategy = opts.strategy === 'intersect' ? 'intersect' : 'union';
  var keepHeader = opts.keepHeader !== false;
  var addSource = !!opts.sourceCol;
  var srcName = opts.sourceColName || SOURCE_COL_NAME;
  var outHeader = [], outKeys = [], i, j, t;
  /* 各表的列键（keepHeader 时使用；表内唯一） */
  var keyss = [];
  /* 各表实际列数（keepHeader=false 时 = 表头行宽与数据行宽的最大值） */
  var widths = [];

  if (keepHeader) {
    for (i = 0; i < tables.length; i++) keyss.push(tableColKeys(tables[i]));
    if (strategy === 'union') {
      var seen = Object.create(null);
      for (i = 0; i < tables.length; i++) {
        t = tables[i];
        for (j = 0; j < keyss[i].length; j++) {
          var uk = keyss[i][j];
          if (uk in seen) continue;
          seen[uk] = 1;
          outKeys.push(uk);
          outHeader.push(t.header[j]);      // 显示仍用原始表头值
        }
      }
    } else {
      if (tables.length) {
        for (j = 0; j < keyss[0].length; j++) {
          var bk = keyss[0][j], ok = true;
          for (i = 1; i < tables.length; i++) {
            if (keyss[i].indexOf(bk) < 0) { ok = false; break; }
          }
          if (ok) { outKeys.push(bk); outHeader.push(tables[0].header[j]); }
        }
      }
    }
  } else {
    /* 不保留表头：按列位置合并；union 取最大列数，intersect 取最小列数
     * 注意：此时 t.header 为 []（表头已当作数据行），列宽必须按实际行宽计算，
     * 不能用 t.header.length（会得到 0 → 输出全空列）。 */
    var width = 0, minw = -1;
    for (i = 0; i < tables.length; i++) {
      t = tables[i];
      var w = t.header ? t.header.length : 0;
      for (var r = 0; r < (t.rows || []).length; r++) {
        var rl = (t.rows[r] || []).length;
        if (rl > w) w = rl;
      }
      widths.push(w);
      if (w > width) width = w;
      if (minw < 0 || w < minw) minw = w;
    }
    if (strategy === 'intersect') width = (minw < 0 ? 0 : minw);
    for (i = 0; i < width; i++) outHeader.push('第' + (i + 1) + '列');
  }

  var outRows = [], perTable = [];
  /* 预建各表的「本表列下标 → 输出列下标」映射（-1 表示不参与） */
  var tableMaps = [];
  var keyToIdx = Object.create(null);
  for (j = 0; j < outKeys.length; j++) keyToIdx[outKeys[j]] = j;
  for (i = 0; i < tables.length; i++) {
    t = tables[i];
    var m = [];
    if (keepHeader) {
      for (j = 0; j < keyss[i].length; j++) {
        m.push((keyss[i][j] in keyToIdx) ? keyToIdx[keyss[i][j]] : -1);
      }
    } else {
      var w2 = widths[i] || 0, width2 = outHeader.length;
      for (j = 0; j < w2; j++) m.push(j < width2 ? j : -1);
    }
    tableMaps.push(m);
  }
  for (i = 0; i < tables.length; i++) {
    t = tables[i];
    var tm = tableMaps[i], count = 0;
    for (var r = 0; r < t.rows.length; r++) {
      var row = t.rows[r] || [], out = [];
      for (j = 0; j < outHeader.length; j++) out.push('');
      if (keepHeader) {
        /* 列键在表内唯一，每列最多命中一个输出列，按列下标直接映射 */
        var lim = Math.min(row.length, tm.length);
        for (j = 0; j < lim; j++) {
          var oi = tm[j];
          if (oi >= 0 && row[j] !== null && row[j] !== undefined) out[oi] = row[j];
        }
      } else {
        for (j = 0; j < outHeader.length; j++) {
          out[j] = (j < row.length && row[j] !== null && row[j] !== undefined) ? row[j] : '';
        }
      }
      if (addSource) out.push(t.label);
      outRows.push(out);
      count++;
    }
    perTable.push(count);
  }
  var finalHeader = keepHeader ? outHeader.slice() : outHeader.slice();
  if (addSource) finalHeader.push(srcName);
  return { header: finalHeader, rows: outRows, perTable: perTable };
}
/* 时间戳文件名：merge-YYYYMMDDHHmmss.xlsx */
function mergeFileName(d) {
  d = d || new Date();
  function p(n) { return (n < 10 ? '0' : '') + n; }
  return 'merge-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) +
    p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + '.xlsx';
}
/* 供 Node 单测导出纯逻辑 */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    sanitizeSheetName: sanitizeSheetName, safeBaseName: safeBaseName,
    headerKey: headerKey, parseWorkbook: parseWorkbook,
    mergeTables: mergeTables, mergeFileName: mergeFileName,
    SOURCE_COL_NAME: SOURCE_COL_NAME
  };
}
/*<SM-PURE-END>*/

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

/* ---------------- 工具函数（浏览器） ---------------- */
function $(id) { return document.getElementById(id); }
function setStatus(m) { $('sm-status').textContent = m || ''; }
function showError(m) {
  var el = $('sm-error');
  el.textContent = m; el.style.display = 'block';
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function hideError() { $('sm-error').style.display = 'none'; $('sm-error').textContent = ''; }
function libLoadFail(what) {
  var el = $('sm-lib-error');
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
function tick() { return new Promise(function (r) { setTimeout(r, 30); }); }
/* 列宽：按列最大显示宽度估算（CJK 算 2，ASCII 算 1），上限 50（与 sheet_split 同款） */
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
  mode: 'files',            // 'files' | 'sheets'
  strategy: 'union',        // 'union' | 'intersect'
  files: [],                // [{name, size, buf, parsed, sheetIdx}]
  busy: false, result: null // {header, rows, fname}
};

/* ---------------- 文件读取与解析 ---------------- */
function isSheetFile(f) {
  return /\.(xlsx|xls|csv)$/i.test(f.name);
}
function addFiles(list) {
  hideError();
  var news = [];
  for (var i = 0; i < list.length; i++) {
    if (isSheetFile(list[i])) news.push(list[i]);
  }
  if (!news.length) {
    showError('仅支持 .xlsx / .xls / .csv 文件。');
    return;
  }
  if (news.length < list.length) setStatus('已过滤掉 ' + (list.length - news.length) + ' 个非表格文件。');
  else setStatus('正在读取 ' + news.length + ' 个文件…');
  var big = news.some(function (f) { return f.size > BIG_FILE; });
  if (big) setStatus('部分文件较大（>50MB），解析可能需要一些时间…');
  ensureXlsx().then(function () {
    var p = Promise.resolve(), parsed = 0;
    news.forEach(function (f) {
      p = p.then(function () {
        return f.arrayBuffer().then(function (buf) {
          return tick().then(function () {
            var pb = parseWorkbook(window.XLSX, buf, f.name);
            if (!pb.sheets.length) throw new Error('empty:' + f.name);
            S.files.push({ name: f.name, size: f.size, buf: buf, parsed: pb, sheetIdx: 0 });
            parsed++;
            setStatus('已解析 ' + parsed + '/' + news.length + '：' + f.name);
          });
        });
      });
    });
    return p;
  }).then(function () {
    setStatus('共 ' + S.files.length + ' 个文件，请选择合并模式与选项。');
    renderAll();
  }).catch(function (e) {
    if (e && e.message === 'all failed') { libLoadFail('表格解析（SheetJS）'); setStatus(''); return; }
    if (e && e.message && e.message.indexOf('empty:') === 0) {
      showError('文件「' + e.message.slice(6) + '」中没有可读取的工作表，已跳过其余文件。');
    } else {
      showError('文件解析失败：不是有效的 Excel/CSV 文件，或文件已损坏。');
    }
    setStatus('');
  });
}
function removeFile(idx) {
  S.files.splice(idx, 1);
  S.result = null;
  $('sm-result').style.display = 'none';
  setStatus(S.files.length ? '已移除一个文件，剩余 ' + S.files.length + ' 个。' : '');
  renderAll();
}
function clearAll() {
  S.files = []; S.result = null;
  $('sm-file').value = '';
  $('sm-result').style.display = 'none';
  $('sm-preview').style.display = 'none';
  $('sm-options').style.display = 'none';
  $('sm-clear-wrap').style.display = 'none';
  $('sm-run').disabled = true;
  setStatus('');
  hideError();
}

/* ---------------- 渲染 ---------------- */
function currentSources() {
  /* 返回本轮参与合并的 tables: [{label, header, rows}]，以及错误信息 */
  var tables = [], err = '';
  var keepHeader = $('sm-keepheader').checked;
  if (S.mode === 'files') {
    for (var i = 0; i < S.files.length; i++) {
      var f = S.files[i];
      var sel = $('sm-sheet-' + i);
      var si = sel ? (parseInt(sel.value, 10) || 0) : f.sheetIdx;
      f.sheetIdx = Math.max(0, Math.min(si, f.parsed.sheets.length - 1));
      var sh = f.parsed.sheets[f.sheetIdx];
      tables.push({
        label: f.name,
        header: keepHeader ? sh.header : [],
        rows: keepHeader ? sh.rows : [sh.header].concat(sh.rows),
        name: sh.name
      });
    }
  } else {
    if (!S.files.length) return { tables: [], err: '请先上传文件。' };
    var fi = Math.max(0, Math.min(parseInt($('sm-mergefile').value || '0', 10) || 0, S.files.length - 1));
    var f2 = S.files[fi];
    var boxes = document.querySelectorAll('input[name="sm-sheetchk"]:checked');
    if (!boxes.length) return { tables: [], err: '请至少勾选一张工作表参与合并。' };
    for (var b = 0; b < boxes.length; b++) {
      var sh2 = f2.parsed.sheets[parseInt(boxes[b].value, 10)];
      tables.push({
        label: sh2.name,
        header: keepHeader ? sh2.header : [],
        rows: keepHeader ? sh2.rows : [sh2.header].concat(sh2.rows),
        name: sh2.name
      });
    }
  }
  if (!tables.length) err = S.mode === 'files' ? '请先上传文件。' : err;
  return { tables: tables, err: err };
}
function renderFileList() {
  var box = $('sm-filelist');
  if (!S.files.length) { box.innerHTML = ''; box.style.display = 'none'; return; }
  box.style.display = '';
  var html = '';
  for (var i = 0; i < S.files.length; i++) {
    var f = S.files[i];
    var shs = f.parsed.sheets;
    var opts = '';
    for (var j = 0; j < shs.length; j++) {
      opts += '<option value="' + j + '"' + (j === f.sheetIdx ? ' selected' : '') + '>' +
        escHtml(shs[j].name) + '（' + shs[j].rows.length + '行）</option>';
    }
    html += '<div class="sm-fileinfo"><i class="material-icons">table_view</i>' +
      '<div class="meta"><div class="nm">' + escHtml(f.name) + '</div>' +
      '<div class="sub">' + fmtSize(f.size) + ' · ' + shs.length + ' 个工作表</div></div>' +
      '<div class="ops">';
    if (S.mode === 'files' && shs.length > 1) {
      html += '<select id="sm-sheet-' + i + '" class="sm-sheet-sel" title="选择参与合并的工作表">' + opts + '</select>';
    }
    html += '<button type="button" data-rm="' + i + '" title="移除该文件"><span class="material-icons">close</span></button></div></div>';
  }
  box.innerHTML = html;
  var rms = box.querySelectorAll('button[data-rm]');
  for (var r = 0; r < rms.length; r++) {
    (function (btn) {
      btn.addEventListener('click', function () { removeFile(parseInt(btn.getAttribute('data-rm'), 10)); });
    })(rms[r]);
  }
  var sels = box.querySelectorAll('select.sm-sheet-sel');
  for (var s = 0; s < sels.length; s++) {
    sels[s].addEventListener('change', function () { S.result = null; $('sm-result').style.display = 'none'; updatePreview(); });
  }
}
function renderModeUI() {
  $('sm-mode-sheets-ui').style.display = S.mode === 'sheets' ? '' : 'none';
  if (S.mode === 'sheets') {
    var sel = $('sm-mergefile'), html = '';
    for (var i = 0; i < S.files.length; i++) {
      html += '<option value="' + i + '">' + escHtml(S.files[i].name) + '（' + S.files[i].parsed.sheets.length + ' 个工作表）</option>';
    }
    sel.innerHTML = html;
    renderSheetChecks();
  }
}
function renderSheetChecks() {
  var fi = Math.max(0, Math.min(parseInt($('sm-mergefile').value || '0', 10) || 0, S.files.length - 1));
  var box = $('sm-sheetchecks'), html = '';
  if (S.files.length) {
    var shs = S.files[fi].parsed.sheets;
    for (var i = 0; i < shs.length; i++) {
      html += '<label class="sm-chk"><input type="checkbox" name="sm-sheetchk" value="' + i + '" checked>' +
        '<span>' + escHtml(shs[i].name) + '（' + shs[i].rows.length + ' 行）</span></label>';
    }
  }
  box.innerHTML = html;
  var boxes = box.querySelectorAll('input[name="sm-sheetchk"]');
  for (var b = 0; b < boxes.length; b++) boxes[b].addEventListener('change', updatePreview);
}
function renderAll() {
  renderFileList();
  renderModeUI();
  var has = S.files.length > 0;
  $('sm-options').style.display = has ? '' : 'none';
  $('sm-preview').style.display = has ? '' : 'none';
  $('sm-clear-wrap').style.display = has ? '' : 'none';
  if (has) updatePreview();
  $('sm-run').disabled = !has;
}

/* ---------------- 预览 ---------------- */
function previewTableHTML(header, rows) {
  var h = '<table class="sm-table"><thead><tr>';
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
  if (!S.files.length) return;
  hideError();
  var src = currentSources();
  if (src.err || !src.tables.length) {
    $('sm-preview-stat').textContent = src.err || '暂无可合并的数据。';
    $('sm-preview-table').innerHTML = '';
    $('sm-run').disabled = true;
    return;
  }
  try {
    var merged = mergeTables(src.tables, {
      strategy: S.strategy,
      keepHeader: $('sm-keepheader').checked,
      sourceCol: $('sm-sourcecol').checked,
      sourceColName: SOURCE_COL_NAME
    });
  } catch (e) {
    showError('预览失败：' + (e && e.message ? e.message : '未知错误'));
    return;
  }
  var total = merged.rows.length, cols = merged.header.length;
  var per = merged.perTable.map(function (c, i) { return escHtml(src.tables[i].label) + '：' + c + ' 行'; }).join('、');
  var strategyTxt = S.strategy === 'union' ? '并集（缺失列补空）' : '交集（只保留共有列）';
  var modeTxt = S.mode === 'files' ? '多文件纵向合并' : '同文件多工作表合并';
  $('sm-preview-stat').innerHTML = escHtml(modeTxt + ' · 表头策略：' + strategyTxt) + '<br>' +
    '参与合并 ' + src.tables.length + ' 个来源：' + per + '<br>' +
    '预计结果：<b>' + total + '</b> 行数据 × <b>' + cols + '</b> 列' +
    ($('sm-keepheader').checked ? '（含表头）' : '（不保留表头）') +
    ($('sm-sourcecol').checked ? ' · 含来源列「' + escHtml(SOURCE_COL_NAME) + '」' : '');
  $('sm-preview-table').innerHTML = merged.rows.length
    ? previewTableHTML(merged.header, merged.rows)
    : '<div class="sm-empty">合并后暂无数据行</div>';
  $('sm-run').disabled = !merged.rows.length;
}

/* ---------------- 合并与下载 ---------------- */
function resultToBlob(result) {
  var wb = window.XLSX.utils.book_new();
  var aoa = [result.header].concat(result.rows);
  var ws = window.XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = colWidths(aoa);
  window.XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName('合并结果'));
  var arr = window.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([arr], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
function doMerge() {
  if (S.busy) return;
  hideError();
  var src = currentSources();
  if (src.err || !src.tables.length) { showError(src.err || '没有可合并的数据。'); return; }
  S.busy = true;
  $('sm-run').disabled = true;
  $('sm-progress').style.display = 'block';
  $('sm-progress-txt').textContent = '正在合并…';
  $('sm-progress-bar').style.width = '40%';
  setTimeout(function () {
    try {
      var merged = mergeTables(src.tables, {
        strategy: S.strategy,
        keepHeader: $('sm-keepheader').checked,
        sourceCol: $('sm-sourcecol').checked,
        sourceColName: SOURCE_COL_NAME
      });
      if (!merged.rows.length) throw new Error('empty');
      var fname = mergeFileName();
      S.result = { header: merged.header, rows: merged.rows, fname: fname, nfiles: src.tables.length };
      showResult(src, merged, fname);
      $('sm-progress-bar').style.width = '100%';
      $('sm-progress-txt').textContent = '合并完成';
      setStatus('合并完成：' + merged.rows.length + ' 行数据 × ' + merged.header.length + ' 列。');
      setTimeout(function () { $('sm-progress').style.display = 'none'; }, 1200);
    } catch (e) {
      showError('合并失败：' + (e && e.message === 'empty' ? '合并后没有数据行。' : '未知错误'));
      $('sm-progress').style.display = 'none';
      setStatus('');
    } finally {
      S.busy = false;
      $('sm-run').disabled = false;
    }
  }, 30);
}
function showResult(src, merged, fname) {
  var box = $('sm-result');
  box.style.display = 'block';
  var per = merged.perTable.map(function (c, i) { return escHtml(src.tables[i].label) + '：' + c + ' 行'; }).join('、');
  $('sm-result-stat').innerHTML = '结果：<b>' + merged.rows.length + '</b> 行数据 × <b>' + merged.header.length +
    '</b> 列，来自 ' + src.tables.length + ' 个来源（' + per + '）';
  $('sm-result-name').textContent = fname;
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function downloadResult() {
  if (!S.result) return;
  var blob = resultToBlob(S.result);
  downloadBlob(blob, S.result.fname);
  toast('已下载 ' + S.result.fname);
}

/* ---------------- 事件绑定（仅浏览器；Node 单测时跳过） ---------------- */
if (typeof document !== 'undefined') {
document.addEventListener('DOMContentLoaded', function () {
  var up = $('sm-upload'), fi = $('sm-file');
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
    var fs = e.dataTransfer && e.dataTransfer.files;
    if (fs && fs.length) addFiles(fs);
  });
  fi.addEventListener('change', function () {
    if (fi.files && fi.files.length) addFiles(fi.files);
    fi.value = '';
  });
  $('sm-clear').addEventListener('click', clearAll);

  /* 合并模式切换 */
  var modes = document.querySelectorAll('input[name="sm-mode"]');
  for (var i = 0; i < modes.length; i++) {
    modes[i].addEventListener('change', function () {
      S.mode = document.querySelector('input[name="sm-mode"]:checked').value;
      $('sm-result').style.display = 'none';
      S.result = null;
      renderFileList();
      renderModeUI();
      if (S.files.length) updatePreview();
    });
  }
  /* 表头策略切换 */
  var strs = document.querySelectorAll('input[name="sm-strategy"]');
  for (var j = 0; j < strs.length; j++) {
    strs[j].addEventListener('change', function () {
      S.strategy = document.querySelector('input[name="sm-strategy"]:checked').value;
      $('sm-result').style.display = 'none';
      S.result = null;
      if (S.files.length) updatePreview();
    });
  }
  $('sm-keepheader').addEventListener('change', updatePreview);
  $('sm-sourcecol').addEventListener('change', updatePreview);
  $('sm-mergefile').addEventListener('change', function () { renderSheetChecks(); updatePreview(); });

  $('sm-run').addEventListener('click', doMerge);
  $('sm-dl').addEventListener('click', downloadResult);
});
}

})();
