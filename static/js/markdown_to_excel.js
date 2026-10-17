/* Markdown 表格转 Excel - AI 回答/ .md 里的一键转 .xlsx，纯前端本地处理
 *
 * 流程：大文本框粘贴整段 AI 回答 或 上传 .md 文件（FileReader 本地读）
 * → 表格提取引擎（表头+分隔行识别、跳过 ``` 代码块内表格、转义竖线 \| 不分割、
 *   行列数不一致补空/截断）→ 多表→多 sheet（以上方最近 #/## 标题命名，无标题用
 *   「表格1/2/3」，Excel 非法字符替换、31 字符截断、重名自动加后缀）
 * → 单元格类型：千分位数字/百分比存真实数值、15 位+长 ID/前导零存文本
 *   （防科学计数法）→ 卡片化预览（表头粗体、斑马纹、统计信息）
 * → 导出 .xlsx（SheetJS 0.18.5 CDN 懒加载 + 本地 vendor 兜底，表头粗体+填充、
 *   冻结首行、自动列宽）/ 单表复制 TSV / 示例数据一键填入。
 * 全程不上传服务器，无新增后端接口；CDN 失败时给出可读报错，页面不白屏。
 */
/* 全局 XLSX（懒加载后挂载） */
var MD2XLSX = null;

/* ---------------- 常量 ---------------- */
var XLSX_CDNS = [
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js'
];
/* 本地兜底：按本脚本实际加载地址推导 vendor 路径（与 sheet_merge.js 同款写法），
 * /tools 与 /tool-web 两种挂载前缀都可用。
 * Node 单测时 document 不存在，直接跳过。 */
(function () {
  if (typeof document === 'undefined' || !document.currentScript) return;
  var me = document.currentScript.src;
  var fb = me ? me.replace(/markdown_to_excel\.js(\?.*)?$/, 'vendor/xlsx-0.18.5.umd.js') : '';
  if (fb && fb !== me) XLSX_CDNS.push(fb);
})();

/*<MD2XLSX-PURE-BEGIN>*/
/* ---------------- 纯逻辑函数（无 DOM，可在 Node 下单测） ---------------- */

function splitLines(text) { return String(text).split(/\r\n|\r|\n/); }
function isFence(line) { return /^\s*```/.test(line); }
function isHeading(line) { return /^\s*#{1,6}\s+/.test(line); }
function headingText(line) { return stripInlineMd(line.replace(/^\s*#{1,6}\s+/, '').replace(/\s+#+\s*$/, '')); }

/* 行内 markdown 清理：代码/粗体/斜体/删除线/链接/HTML 标签 */
function stripInlineMd(s) {
  s = String(s == null ? '' : s);
  s = s.replace(/`([^`]*)`/g, '$1');
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1');
  s = s.replace(/__([^_]+)__/g, '$1');
  s = s.replace(/\*([^*\n]+)\*/g, '$1');
  s = s.replace(/(^|[^_\w])_([^_\n]+)_/g, '$1$2');
  s = s.replace(/~~([^~]*)~~/g, '$1');
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  s = s.replace(/<[^>]*>/g, '');
  s = s.replace(/&nbsp;/gi, ' ');
  return s.trim();
}

/* 按竖线切分：转义竖线 \| 不分割；首尾外围竖线产生的空单元格去掉 */
function splitPipeCells(line) {
  var cells = [], cur = '', i = 0;
  while (i < line.length) {
    var ch = line.charAt(i);
    if (ch === '\\' && i + 1 < line.length && line.charAt(i + 1) === '|') { cur += '|'; i += 2; continue; }
    if (ch === '|') { cells.push(cur); cur = ''; i++; continue; }
    cur += ch; i++;
  }
  cells.push(cur);
  if (cells.length && /^\s*$/.test(cells[0])) cells.shift();
  if (cells.length && /^\s*$/.test(cells[cells.length - 1])) cells.pop();
  return cells.map(function (c) { return stripInlineMd(c); });
}

/* 分隔行：| --- | :---: | ---: |，放宽到 1+ 个 -（AI 常写 1~2 个） */
function isDelimiterLine(line) {
  var cells = splitPipeCells(line);
  if (!cells.length) return false;
  for (var i = 0; i < cells.length; i++) {
    if (!/^\s*:?-+:?\s*$/.test(cells[i])) return false;
  }
  return true;
}

function hasDigits(s) { return /\d/.test(s); }
/* 千分位分组校验：有逗号时整数部分必须形如 1,234,567 */
function validGrouping(s) {
  if (s.indexOf(',') < 0) return true;
  var intPart = s.split('.')[0];
  return /^\d{1,3}(,\d{3})+$/.test(intPart);
}

/* 单元格类型判定：返回 {v: 值, t: 'n'|'s', z: 数字格式(可选), d: 展示文本} */
function classifyCell(raw) {
  var s = stripInlineMd(raw);
  if (s === '') return { v: '', t: 's', d: '' };
  /* 15 位+ 长数字 ID / 前导零 → 存文本，防 Excel 科学计数法 */
  if (/^\d{15,}$/.test(s)) return { v: s, t: 's', d: s };
  if (/^0\d+$/.test(s)) return { v: s, t: 's', d: s };
  /* 百分比：12.5% / -3.2% / 1,234.5% → 真实数值 + 百分比格式 */
  var pm = /^([+-]?)\s*([\d,]+(?:\.\d+)?)\s*%$/.exec(s);
  if (pm && hasDigits(pm[2])) {
    var pnum = parseFloat(pm[2].replace(/,/g, '')) * (pm[1] === '-' ? -1 : 1);
    if (isFinite(pnum)) return { v: pnum / 100, t: 'n', z: '0.00%', d: s };
  }
  /* 千分位数字：1,234 / 1,234,567.89 / -9,999 → 真实数值 */
  var nm = /^([+-]?)([\d,]+(?:\.\d+)?)$/.exec(s);
  if (nm && hasDigits(nm[2]) && validGrouping(nm[2])) {
    var num = parseFloat((nm[1] + nm[2]).replace(/,/g, ''));
    if (isFinite(num)) return { v: num, t: 'n', d: s };
  }
  return { v: s, t: 's', d: s };
}

/* 行列数不一致：补空到 ncols，多余截断 */
function normRow(cells, ncols) {
  var r = cells.slice(0, ncols);
  while (r.length < ncols) r.push({ v: '', t: 's', d: '' });
  return r;
}

/* Excel 工作表名非法字符 \ / ? * [ ] :，上限 31 字符（与 sheet_merge.js 同款） */
function sanitizeSheetName(s) {
  var t = String(s == null ? '' : s).replace(/[\\\/\?\*\[\]\:]/g, '_').trim();
  if (!t) t = 'Sheet';
  if (t.length > 31) t = t.slice(0, 31);
  return t;
}
/* 重名 sheet 自动加后缀：表A、表A_2、表A_3…（后缀计入 31 字符上限，避免截断后恒等死循环） */
function uniqueSheetName(name, used) {
  var n = name, k = 2;
  while (Object.prototype.hasOwnProperty.call(used, n)) {
    var suf = '_' + k;
    n = name.slice(0, 31 - suf.length) + suf;
    k++;
  }
  used[n] = true;
  return n;
}

/* 主引擎：从整段文本提取表格。返回 [{title, header:[cell], rows:[[cell]]}] */
function extractTables(text) {
  var lines = splitLines(text);
  /* 先算每行是否在 ``` 代码围栏内（围栏行本身也标记为内） */
  var fenced = [], f = false, i;
  for (i = 0; i < lines.length; i++) {
    if (isFence(lines[i])) { f = !f; fenced.push(true); } else { fenced.push(f); }
  }
  var tables = [], lastTitle = null;
  i = 0;
  while (i < lines.length) {
    var line = lines[i];
    if (fenced[i]) { i++; continue; }
    if (isHeading(line)) {
      var ht = headingText(line);
      if (ht) lastTitle = ht;
      i++; continue;
    }
    if (line.indexOf('|') >= 0 && i + 1 < lines.length && !fenced[i + 1] && isDelimiterLine(lines[i + 1])) {
      var headerRaw = splitPipeCells(line);
      var rowsRaw = [];
      var j = i + 2;
      while (j < lines.length && !fenced[j]) {
        var rl = lines[j];
        if (rl.indexOf('|') < 0 || /^\s*$/.test(rl)) break;
        if (isHeading(rl)) break;
        if (isDelimiterLine(rl)) break;
        rowsRaw.push(splitPipeCells(rl));
        j++;
      }
      if (rowsRaw.length) {
        var ncols = headerRaw.length;
        for (var r = 0; r < rowsRaw.length; r++) ncols = Math.max(ncols, rowsRaw[r].length);
        ncols = Math.max(ncols, 1);
        var header = normRow(headerRaw.map(classifyCell), ncols);
        var rows = rowsRaw.map(function (rr) { return normRow(rr.map(classifyCell), ncols); });
        tables.push({ title: lastTitle || ('表格' + (tables.length + 1)), header: header, rows: rows });
      }
      i = j; continue;
    }
    i++;
  }
  return tables;
}

/* 表格统计：行数/列数/单元格数/数值与文本单元格数 */
function tableStats(t) {
  var ncols = t.header.length, nrows = t.rows.length, nums = 0, texts = 0;
  t.rows.forEach(function (r) {
    r.forEach(function (c) { if (c.t === 'n') nums++; else texts++; });
  });
  return { cols: ncols, rows: nrows, cells: nrows * ncols, nums: nums, texts: texts };
}

/* 展示文本宽度估算（CJK 算 2），用于自动列宽 */
function textWidth(s) {
  var w = 0, str = String(s);
  for (var i = 0; i < str.length; i++) w += (str.charCodeAt(i) > 255 ? 2 : 1);
  return w;
}

/* 用 SheetJS 生成工作簿：表头粗体+浅蓝底、冻结首行、自动列宽 */
function buildWorkbook(XLSX, tables) {
  var wb = XLSX.utils.book_new();
  var used = {};
  tables.forEach(function (t) {
    var name = uniqueSheetName(sanitizeSheetName(t.title), used);
    var allRows = [t.header].concat(t.rows);
    var aoa = allRows.map(function (r) { return r.map(function (c) { return c.v; }); });
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    var range = XLSX.utils.decode_range(ws['!ref']);
    var R, C;
    for (R = 0; R <= range.e.r; R++) {
      for (C = 0; C <= range.e.c; C++) {
        var addr = XLSX.utils.encode_cell({ r: R, c: C });
        var cell = ws[addr];
        if (!cell) continue;
        var src = allRows[R][C];
        cell.t = src.t;
        if (src.t === 'n' && src.z) cell.z = src.z;
        if (R === 0) cell.s = { font: { bold: true, color: { rgb: 'FF1F2937' } }, fill: { patternType: 'solid', fgColor: { rgb: 'FFDCE9FD' } } };
      }
    }
    ws['!freeze'] = { xSplit: 1, ySplit: 1, topLeftCell: 'B2', activePane: 'bottomRight', state: 'frozen' };
    var widths = [];
    for (C = 0; C <= range.e.c; C++) {
      var w = 8;
      for (R = 0; R <= range.e.r; R++) {
        w = Math.max(w, textWidth(allRows[R][C] ? allRows[R][C].d : '') + 2);
      }
      widths.push({ wch: Math.min(w, 60) });
    }
    ws['!cols'] = widths;
    XLSX.utils.book_append_sheet(wb, ws, name);
  });
  return wb;
}

/* 单表转 TSV：单元格内制表符/换行替换为空格，保证粘贴进 Excel 不挤列 */
function tableToTSV(t) {
  function clean(c) { return String(c.d == null ? '' : c.d).replace(/[\t\r\n]+/g, ' '); }
  var lines = [t.header.map(clean).join('\t')];
  t.rows.forEach(function (r) { lines.push(r.map(clean).join('\t')); });
  return lines.join('\n');
}

/* 下载文件名：上传文件名去后缀 + -tables.xlsx，否则按时间戳 */
function downloadName(srcName) {
  if (srcName) {
    var n = String(srcName).replace(/\.[a-z0-9]+$/i, '').replace(/[\\/:*?"<>|\r\n]/g, '_').trim();
    if (n) return n + '-tables.xlsx';
  }
  var d = new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; };
  return 'markdown-tables-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + '.xlsx';
}

/*<MD2XLSX-PURE-END>*/

/* Node 单测导出（浏览器下 module 未定义，跳过） */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    extractTables: extractTables, classifyCell: classifyCell, sanitizeSheetName: sanitizeSheetName,
    uniqueSheetName: uniqueSheetName, tableStats: tableStats, tableToTSV: tableToTSV,
    downloadName: downloadName, buildWorkbook: buildWorkbook, splitPipeCells: splitPipeCells,
    isDelimiterLine: isDelimiterLine, stripInlineMd: stripInlineMd
  };
}

/* ---------------- DOM 胶水（浏览器 only） ---------------- */
(function () {
  if (typeof document === 'undefined') return;
  'use strict';

  function $(id) { return document.getElementById(id); }
  var input = $('m2x-input'), fileInput = $('m2x-file'), upload = $('m2x-upload'),
      status = $('m2x-status'), errBox = $('m2x-error'),
      resultBox = $('m2x-result'), summary = $('m2x-summary'), cards = $('m2x-cards'),
      btnParse = $('m2x-parse'), btnSample = $('m2x-sample'), btnClear = $('m2x-clear'),
      btnExport = $('m2x-export'), charCount = $('m2x-count');
  var tables = [], srcFileName = '';

  function toast(msg, ok) {
    status.textContent = msg;
    status.style.color = ok === false ? '#b91c1c' : '#059669';
  }
  function fail(msg) { errBox.style.display = 'block'; errBox.textContent = msg; }
  function clearErr() { errBox.style.display = 'none'; errBox.textContent = ''; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function updateCount() { charCount.textContent = (input.value || '').length; }

  /* SheetJS 懒加载：CDN 列表依次试，全部失败则报错（纯前端，无后端） */
  function ensureXLSX(cb) {
    if (MD2XLSX) return cb(MD2XLSX);
    var idx = 0;
    function next() {
      if (idx >= XLSX_CDNS.length) return cb(null);
      var s = document.createElement('script');
      s.src = XLSX_CDNS[idx++];
      s.onload = function () {
        if (window.XLSX) { MD2XLSX = window.XLSX; cb(MD2XLSX); }
        else next();
      };
      s.onerror = next;
      document.head.appendChild(s);
    }
    next();
  }

  function doParse() {
    clearErr();
    var text = input.value || '';
    if (!text.trim()) {
      fail('请先粘贴 AI 回答或上传 .md 文件，再点「解析表格」。');
      return;
    }
    tables = extractTables(text);
    if (!tables.length) {
      fail('未识别到 Markdown 表格。请确认文本里有「表头 + --- 分隔行」结构的表格；``` 代码块内的表格会被有意跳过。');
      resultBox.style.display = 'none';
      btnExport.disabled = true;
      return;
    }
    renderPreview();
    toast('识别到 ' + tables.length + ' 张表格，请核对预览后导出。', true);
  }

  function renderPreview() {
    summary.innerHTML = '共识别到 <b>' + tables.length + '</b> 张表格' +
      (tables.length > 1 ? '，导出为 ' + tables.length + ' 个工作表' : '');
    var html = '';
    tables.forEach(function (t, i) {
      var st = tableStats(t);
      html += '<div class="m2x-card"><div class="m2x-card-head">' +
        '<div><div class="m2x-card-title">' + esc(t.title) + '</div>' +
        '<div class="m2x-card-stat">数据 ' + st.rows + ' 行 × ' + st.cols + ' 列 · 共 ' + st.cells + ' 个单元格（数值 ' + st.nums + ' / 文本 ' + st.texts + '）· 将导出为 sheet「' + esc(sanitizeSheetName(t.title)) + '」</div></div>' +
        '<button class="btn btn-secondary m2x-copy" data-i="' + i + '"><i class="material-icons">content_copy</i> 复制 TSV</button>' +
        '</div><div class="m2x-table-wrap"><table class="m2x-table"><thead><tr>' +
        t.header.map(function (c) { return '<th>' + esc(c.d) + '</th>'; }).join('') +
        '</tr></thead><tbody>';
      var maxRows = 12;
      t.rows.slice(0, maxRows).forEach(function (r) {
        html += '<tr>' + r.map(function (c) {
          return '<td class="' + (c.t === 'n' ? 'num' : '') + '">' + esc(c.d) + '</td>';
        }).join('') + '</tr>';
      });
      if (t.rows.length > maxRows) {
        html += '<tr><td colspan="' + st.cols + '" class="m2x-more">…以下省略 ' + (t.rows.length - maxRows) + ' 行，导出 .xlsx 可见全部</td></tr>';
      }
      html += '</tbody></table></div></div>';
    });
    cards.innerHTML = html;
    resultBox.style.display = 'block';
    btnExport.disabled = false;
    var cps = cards.querySelectorAll('.m2x-copy');
    cps.forEach(function (b) {
      b.addEventListener('click', function () { copyTSV(parseInt(b.getAttribute('data-i'), 10)); });
    });
  }

  function copyTSV(i) {
    var tsv = tableToTSV(tables[i]);
    function done() { toast('已复制「' + tables[i].title + '」为 TSV，可直接粘贴进 Excel/WPS。', true); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(tsv).then(done, function () { legacyCopy(tsv, done); });
    } else legacyCopy(tsv, done);
  }
  function legacyCopy(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { toast('复制失败，请手动选择预览表格复制。', false); }
    document.body.removeChild(ta);
  }

  function doExport() {
    if (!tables.length) return;
    clearErr();
    btnExport.disabled = true;
    toast('正在生成 .xlsx…', true);
    ensureXLSX(function (X) {
      if (!X) {
        btnExport.disabled = false;
        fail('SheetJS 加载失败（CDN 与本地均不可用），请检查网络后重试。数据未离开浏览器。');
        return;
      }
      try {
        var wb = buildWorkbook(X, tables);
        X.writeFile(wb, downloadName(srcFileName));
        toast('已导出 ' + tables.length + ' 张表格，共 ' + tables.reduce(function (a, t) { return a + t.rows.length; }, 0) + ' 行数据。', true);
      } catch (e) {
        fail('生成 .xlsx 失败：' + (e && e.message ? e.message : e));
      }
      btnExport.disabled = false;
    });
  }

  /* 上传 .md / .txt：FileReader 本地读，不上传 */
  function readFile(f) {
    if (!f) return;
    if (!/\.(md|markdown|txt)$/i.test(f.name) && !/^text\//.test(f.type || '')) {
      fail('请上传 .md / .txt 文本文件（当前：' + f.name + '）。图片请用站内「图片转 Excel」。');
      return;
    }
    if (f.size > 10 * 1024 * 1024) { fail('文件过大（>10MB），请拆小后重试。'); return; }
    var rd = new FileReader();
    rd.onload = function () {
      input.value = rd.result;
      srcFileName = f.name;
      updateCount();
      toast('已读入「' + f.name + '」，点「解析表格」开始识别。', true);
      clearErr();
    };
    rd.onerror = function () { fail('读取文件失败，请重试。'); };
    rd.readAsText(f, 'utf-8');
  }

  btnParse.addEventListener('click', doParse);
  btnSample.addEventListener('click', function () { input.value = SAMPLE; srcFileName = ''; updateCount(); clearErr(); toast('已填入示例数据，点「解析表格」看效果。', true); });
  btnClear.addEventListener('click', function () {
    input.value = ''; srcFileName = ''; tables = []; updateCount();
    resultBox.style.display = 'none'; btnExport.disabled = true; clearErr(); toast('', true);
  });
  btnExport.addEventListener('click', doExport);
  input.addEventListener('input', updateCount);
  upload.addEventListener('click', function () { fileInput.click(); });
  upload.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
  fileInput.addEventListener('change', function () { readFile(fileInput.files[0]); });
  ['dragover', 'dragenter'].forEach(function (ev) {
    upload.addEventListener(ev, function (e) { e.preventDefault(); upload.classList.add('dragover'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    upload.addEventListener(ev, function (e) { e.preventDefault(); upload.classList.remove('dragover'); });
  });
  upload.addEventListener('drop', function (e) {
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    readFile(f);
  });
  updateCount();

  /* 示例数据：覆盖多表/转义竖线/代码块假表格/千分位/百分比/长ID/前导零/非法sheet名 */
  var SAMPLE = [
    '# AI 助手回答示例（直接点「解析表格」）',
    '',
    '## 产品方案对比',
    '',
    '| 方案 | 价格（元） | 交付周期 | 备注 |',
    '| ---- | ---------: | :------: | ---- |',
    '| 基础版 | 1,299 | 7 天 | 性价比\\|高 |',
    '| 专业版 | **12,800** | 15 天 | 含 `API` 接入 |',
    '| 企业版 | 68,000 | 30 天 | 支持[定制开发](https://example.com) |',
    '',
    '下面这段代码里的表格是假的，不应该被提取：',
    '',
    '```markdown',
    '| 假表头 | 假列 |',
    '| ------ | ---- |',
    '| 假数据 | 假数据 |',
    '```',
    '',
    '## 2026年第一季度各区域销售汇总（华南/华东/华北/华中/西南/西北/东北全覆盖）最终确认版？v2',
    '',
    '| 区域 | 销售额 | 环比 | 订单编号 | 工号 |',
    '| ---- | ------: | ----: | -------- | ---- |',
    '| 华南 | 1,234,567.89 | 12.5% | 20260118000123456 | 00123 |',
    '| 华东 | 987,654 | -3.2% | 20260118000123457 | 00456 |',
    '| 华北 | 12,300 | 0.8% |  | 07890 |',
    '',
    '| 姓名 | 年龄 |',
    '| ---- | ---- |',
    '| 张三 | 28 |',
    '| 李四 | 35 |',
    ''
  ].join('\n');
})();
