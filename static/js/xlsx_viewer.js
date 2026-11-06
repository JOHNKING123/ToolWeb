/* Excel 查看器（xlsx_viewer）- 纯前端本地 Excel 在线预览
 *
 * 流程：本地打开 .xlsx/.xls/.csv（点击/拖拽/预设示例，FileReader 本地读，
 * 零上传）→ SheetJS 本地解析（本站 vendor 副本 xlsx-0.18.5.umd.js，
 * 模板同步引入，无 CDN 回退）→ 多工作表切换＋首行表头开关 → 表头三态
 * 排序（数字按数值、空值恒置末尾）→ 全局搜索 → 每页 100 行分页渲染 →
 * 导出当前表 CSV（RFC4180）／一键复制 TSV。
 * 真限制：只查看不编辑、公式不重算（只显缓存值）；透视/图表/宏/条件格式
 * 不渲染；合并单元格展开显示；>20MB 拒收、单表 >5000 行分页提示；
 * 本地解析零上传、.xls 旧格式解析或有缺失。
 * 零网络请求：本文件不发起任何请求；渲染一律转义 HTML，输入只显示为文本。
 * 浏览器与 node 测试共用同一纯函数；浏览器绑定只在有 document 时执行。
 * parseWorkbook 复用 sheet_split/sheet_merge 的签名与返回形状。 */
(function () {
'use strict';

/* ---------------- 常量 ---------------- */
var MAX_FILE_SIZE = 20 * 1024 * 1024;  /* 20MB，超限拒收 */
var MAX_ROWS_NOTICE = 5000;            /* 单表超此行数显示分页提示 */
var PAGE_SIZE = 100;                   /* 每页 100 行 */

/* ---------------- 错误辅助 ---------------- */
function err(field, msg) {
  var e = new Error(msg);
  e.field = field;
  return e;
}
function isEmptyCell(v) {
  return v === null || v === undefined || String(v).trim() === '';
}
function isRowEmpty(row) {
  for (var i = 0; i < row.length; i++) {
    if (!isEmptyCell(row[i])) return false;
  }
  return true;
}
function isValidXlsx(XLSX) {
  return XLSX && typeof XLSX.read === 'function' &&
    XLSX.utils && typeof XLSX.utils.sheet_to_json === 'function';
}

/* ---------------- 纯逻辑函数（无 DOM，可在 Node 下单测） ---------------- */

/* 工作簿解析：buf 为 ArrayBuffer/Buffer/Uint8Array（CSV 也可传字符串），
 * fileName 用于判定 CSV；XLSX 以参数传入，保持函数纯粹、无全局依赖。
 * 返回 {sheets: [{name, header, rows, ncols}]}，header 为首行，rows 为数据行。
 * 语义：空行整行剔除；短行按最宽行补空串；合并单元格展开显示（合并区域
 * 内每个格子都填左上角的值）；日期按 Excel 序列值显示（raw: true，
 * 序列号原样返回为数字）；公式只取缓存值，不重算（SheetJS 行为）。
 * 非法参数抛 Error 且 err.field 命名；文件损坏/格式不对时 err.field='buf'。 */
function parseWorkbook(XLSX, buf, fileName) {
  if (!isValidXlsx(XLSX)) throw err('XLSX', 'XLSX 参数无效：需要 SheetJS 库对象');
  if (buf === null || buf === undefined) throw err('buf', 'buf 参数无效：需要文件内容');
  if (typeof buf !== 'string' && !(buf instanceof ArrayBuffer) &&
      typeof ArrayBuffer !== 'undefined' && !(buf instanceof Uint8Array) &&
      (typeof Buffer === 'undefined' || !(buf instanceof Buffer))) {
    /* Node 下 Buffer 即 Uint8Array 子类，上面的 Uint8Array 分支已覆盖；
     * 浏览器下 ArrayBuffer/Uint8Array 已覆盖；其余类型一律拒收。 */
    throw err('buf', 'buf 参数无效：需要 ArrayBuffer/Uint8Array/Buffer 或 CSV 文本');
  }
  if (typeof fileName !== 'string' || !fileName) throw err('fileName', 'fileName 参数无效：需要非空文件名字符串');
  /* 魔数校验：.xlsx 须为 ZIP（PK\x03\x04 或空 ZIP PK\x05\x06），.xls 须为
   * OLE 复合文档（D0 CF 11 E0）；否则 SheetJS 会把任意文本当 CSV 读入，
   * 损坏文件会被误认成「一格文本的工作表」。CSV 无魔数，不校验。 */
  function firstBytes(n) {
    if (typeof buf === 'string') {
      var s = [];
      for (var i = 0; i < n && i < buf.length; i++) s.push(buf.charCodeAt(i) & 0xFF);
      return s;
    }
    var u = (buf instanceof Uint8Array) ? buf : new Uint8Array(buf);
    var out = [];
    for (var j = 0; j < n && j < u.length; j++) out.push(u[j]);
    return out;
  }
  if (/\.xlsx$/i.test(fileName)) {
    var xb = firstBytes(4);
    if (!(xb.length >= 2 && xb[0] === 0x50 && xb[1] === 0x4B)) {
      throw err('buf', '文件损坏或格式不受支持：.xlsx 文件不是有效的 ZIP 压缩包');
    }
  } else if (/\.xls$/i.test(fileName)) {
    var lb = firstBytes(4);
    if (!(lb.length === 4 && lb[0] === 0xD0 && lb[1] === 0xCF && lb[2] === 0x11 && lb[3] === 0xE0)) {
      throw err('buf', '文件损坏或格式不受支持：.xls 文件不是有效的 OLE 复合文档');
    }
  }
  var wb;
  try {
    if (/\.csv$/i.test(fileName)) {
      var text = (typeof buf === 'string') ? buf : new TextDecoder('utf-8').decode(buf);
      wb = XLSX.read(text, { type: 'string' });
    } else {
      wb = XLSX.read(buf, { type: 'array' });
    }
  } catch (e) {
    throw err('buf', '文件损坏或格式不受支持：' + (e && e.message ? e.message : '解析失败'));
  }
  if (!wb || !wb.SheetNames || !wb.SheetNames.length) throw err('buf', '文件中没有可读取的工作表');
  var sheets = [];
  for (var i = 0; i < wb.SheetNames.length; i++) {
    var sn = wb.SheetNames[i];
    var ws = wb.Sheets[sn];
    var aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
    /* 合并单元格展开显示：合并区域内每个格子都填左上角的值 */
    var merges = ws['!merges'] || [];
    for (var m = 0; m < merges.length; m++) {
      var rg = merges[m];
      var top = (aoa[rg.s.r] && aoa[rg.s.r][rg.s.c] !== undefined) ? aoa[rg.s.r][rg.s.c] : '';
      for (var r = rg.s.r; r <= rg.e.r; r++) {
        while (aoa.length <= r) aoa.push([]);
        for (var c = rg.s.c; c <= rg.e.c; c++) {
          while (aoa[r].length <= c) aoa[r].push('');
          aoa[r][c] = top;
        }
      }
    }
    /* 空行整行剔除（含首尾与中间全空行） */
    var kept = [];
    for (var k = 0; k < aoa.length; k++) {
      if (!isRowEmpty(aoa[k])) kept.push(aoa[k]);
    }
    aoa = kept;
    var ncols = 0, r2;
    for (r2 = 0; r2 < aoa.length; r2++) ncols = Math.max(ncols, aoa[r2].length);
    for (r2 = 0; r2 < aoa.length; r2++) while (aoa[r2].length < ncols) aoa[r2].push('');
    sheets.push({
      name: sn,
      header: aoa.length ? aoa[0] : [],
      rows: aoa.length > 1 ? aoa.slice(1) : [],
      ncols: ncols
    });
  }
  return { sheets: sheets };
}

/* 单元格格式化显示值：日期按 Excel 序列值原样显示（数字即序列号），
 * 公式只显缓存值（解析阶段已取缓存值，此处不重算）；布尔按 Excel 惯例
 * 显示 TRUE/FALSE；空值显示为空串。 */
function formatCellValue(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (v instanceof Date) {
    var y = v.getFullYear();
    var mo = String(v.getMonth() + 1);
    if (mo.length < 2) mo = '0' + mo;
    var d = String(v.getDate());
    if (d.length < 2) d = '0' + d;
    return y + '-' + mo + '-' + d;
  }
  return String(v);
}

/* 是否可按数值比较：非空单元格全部能解析为有限数字（前后空白不计）。 */
function isNumericColumn(body, colIdx) {
  var seen = false;
  for (var i = 0; i < body.length; i++) {
    var v = body[i][colIdx];
    if (isEmptyCell(v)) continue;
    if (typeof v === 'number') {
      if (!isFinite(v)) return false;
    } else if (!isFinite(Number(String(v).trim()))) {
      return false;
    }
    seen = true;
  }
  return seen;
}

/* 排序：dir 为 'asc' | 'desc' | null；null 返回原序副本。
 * 空值（空串或全空白）恒置末尾，与升降序无关；数字列按数值排，
 * 文本列按字符串排（码点比较，保证 node 与浏览器结果一致）；
 * 原数组不改动（先 slice 再 sort）。 */
function sortRows(rows, colIdx, dir) {
  if (!Array.isArray(rows)) throw err('rows', 'rows 参数无效：需要二维数组');
  if (typeof colIdx !== 'number' || !isFinite(colIdx) || colIdx < 0 || (colIdx | 0) !== colIdx) {
    throw err('colIdx', 'colIdx 参数无效：需要非负整数');
  }
  if (dir !== null && dir !== undefined && dir !== 'asc' && dir !== 'desc') {
    throw err('dir', 'dir 参数无效：需要 asc/desc/null');
  }
  if (!dir) return rows.slice();
  var numeric = isNumericColumn(rows, colIdx);
  function cmp(a, b) {
    var va = a[colIdx], vb = b[colIdx];
    var ea = isEmptyCell(va), eb = isEmptyCell(vb);
    if (ea && eb) return 0;
    if (ea) return 1;
    if (eb) return -1;
    var res;
    if (numeric) {
      res = Number(typeof va === 'number' ? va : String(va).trim()) -
            Number(typeof vb === 'number' ? vb : String(vb).trim());
    } else {
      var sa = formatCellValue(va), sb = formatCellValue(vb);
      if (sa < sb) res = -1;
      else if (sa > sb) res = 1;
      else res = 0;
    }
    return dir === 'desc' ? -res : res;
  }
  return rows.slice().sort(cmp);
}

/* 下一排序态：null → asc → desc → null（三态循环）。 */
function nextSortDir(dir) {
  if (!dir) return 'asc';
  if (dir === 'asc') return 'desc';
  return null;
}

/* 全局搜索：命中任意列即保留该行；大小写不敏感；空查询返回全部行的副本。
 * 匹配按格式化显示值进行（数字、布尔同样可搜）。 */
function searchRows(rows, query) {
  if (!Array.isArray(rows)) throw err('rows', 'rows 参数无效：需要二维数组');
  var q = (query === null || query === undefined) ? '' : String(query).trim().toLowerCase();
  if (!q) return rows.slice();
  return rows.filter(function (row) {
    for (var i = 0; i < row.length; i++) {
      if (formatCellValue(row[i]).toLowerCase().indexOf(q) !== -1) return true;
    }
    return false;
  });
}

/* 分页：page 从 1 起；pageSize 须为正整数（非法抛错）；页码钳制到合法范围；
 * 返回 {pageRows, totalPages, page, totalRows}。 */
function paginateRows(rows, page, pageSize) {
  if (!Array.isArray(rows)) throw err('rows', 'rows 参数无效：需要二维数组');
  var size = pageSize;
  if (typeof size !== 'number' || !isFinite(size) || size <= 0 || (size | 0) !== size) {
    throw err('pageSize', 'pageSize 参数无效：需要正整数');
  }
  var totalPages = Math.max(1, Math.ceil(rows.length / size));
  var p = parseInt(page, 10);
  if (!p || p < 1) p = 1;
  if (p > totalPages) p = totalPages;
  var start = (p - 1) * size;
  return { pageRows: rows.slice(start, start + size), totalPages: totalPages, page: p, totalRows: rows.length };
}

/* RFC4180 转 CSV：含逗号/双引号/换行/回车的字段加双引号，字段内双引号双写；
 * 行尾用 CRLF（含末行）。单元格先按显示值格式化。 */
function rowsToCSV(aoa) {
  if (!Array.isArray(aoa)) throw err('aoa', 'aoa 参数无效：需要二维数组');
  var out = [];
  for (var i = 0; i < aoa.length; i++) {
    var row = aoa[i];
    if (!Array.isArray(row)) throw err('aoa', 'aoa 参数无效：第 ' + (i + 1) + ' 行不是数组');
    var cells = [];
    for (var j = 0; j < row.length; j++) {
      var s = formatCellValue(row[j]);
      if (/[",\r\n]/.test(s)) cells.push('"' + s.replace(/"/g, '""') + '"');
      else cells.push(s);
    }
    out.push(cells.join(','));
  }
  return out.length ? out.join('\r\n') + '\r\n' : '';
}

/* 转 TSV（一键复制用）：制表符分隔，单元格内的制表符/换行/回车替换为空格，
 * 保证复制后粘贴进 Excel 不串列；行间用 \n，末尾无多余换行。 */
function rowsToTSV(aoa) {
  if (!Array.isArray(aoa)) throw err('aoa', 'aoa 参数无效：需要二维数组');
  var out = [];
  for (var i = 0; i < aoa.length; i++) {
    var row = aoa[i];
    if (!Array.isArray(row)) throw err('aoa', 'aoa 参数无效：第 ' + (i + 1) + ' 行不是数组');
    var cells = [];
    for (var j = 0; j < row.length; j++) {
      cells.push(formatCellValue(row[j]).replace(/[\t\r\n]/g, ' '));
    }
    out.push(cells.join('\t'));
  }
  return out.join('\n');
}

/* 统计面板：文件大小／表数／行列／单元格数（单元格含表头行）。
 * rows 为各表数据行数之和，cols 为各表列数最大值。 */
function workbookStats(parsed, fileSize) {
  if (!parsed || !Array.isArray(parsed.sheets)) throw err('parsed', 'parsed 参数无效：需要 parseWorkbook 的返回值');
  if (typeof fileSize !== 'number' || !isFinite(fileSize) || fileSize < 0) {
    throw err('fileSize', 'fileSize 参数无效：需要非负数字');
  }
  var rows = 0, cols = 0, cells = 0;
  for (var i = 0; i < parsed.sheets.length; i++) {
    var s = parsed.sheets[i];
    rows += s.rows.length;
    if (s.ncols > cols) cols = s.ncols;
    cells += (s.rows.length + 1) * s.ncols;
  }
  return { fileSize: fileSize, sheets: parsed.sheets.length, rows: rows, cols: cols, cells: cells };
}

/* 是否支持的文件：.xlsx / .xls / .csv（大小写不敏感）。 */
function isSupportedFile(name) {
  return /\.(xlsx|xls|csv)$/i.test(String(name || ''));
}

/* 预设示例：JS 内用 XLSX.utils 生成真实工作簿（不经过服务器）。
 * kind: 'sales' 销售表 / 'schedule' 课程表 / 'contacts' 通讯录。
 * 销售表日期用 Excel 序列值（如 45658 = 2025-01-01），与真实文件一致。 */
var SAMPLES = {
  sales: {
    sheetName: '销售表',
    header: ['日期', '商品', '数量', '单价', '金额'],
    rows: [
      [45658, '无线鼠标', 12, 89, 1068],
      [45659, '机械键盘', 5, 459, 2295],
      [45660, '显示器 27寸', 3, 1299, 3897],
      [45661, '鼠标垫', 20, 45, 900],
      [45662, '耳机', 8, 299, 2392],
      [45665, '键盘托', 6, 129, 774],
      [45666, 'USB-C 数据线', 30, 25, 750],
      [45667, '笔记本支架', 4, 199, 796]
    ]
  },
  schedule: {
    sheetName: '课程表',
    header: ['星期', '第一节', '第二节', '第三节', '第四节'],
    rows: [
      ['周一', '语文', '数学', '英语', '体育'],
      ['周二', '数学', '语文', '物理', '美术'],
      ['周三', '英语', '化学', '数学', '音乐'],
      ['周四', '语文', '英语', '生物', '信息技术'],
      ['周五', '数学', '语文', '历史', '班会']
    ]
  },
  contacts: {
    sheetName: '通讯录',
    header: ['姓名', '电话', '邮箱', '城市'],
    rows: [
      ['张三', '13800000001', 'zhangsan@example.com', '深圳'],
      ['李娜', '13800000002', 'lina@example.com', '广州'],
      ['王强', '13800000003', 'wangqiang@example.com', '上海'],
      ['赵敏', '13800000004', 'zhaomin@example.com', '北京'],
      ['刘洋', '13800000005', 'liuyang@example.com', '杭州'],
      ['陈晨', '13800000006', 'chenchen@example.com', '成都']
    ]
  }
};
function buildSampleWorkbook(XLSX, kind) {
  if (!isValidXlsx(XLSX)) throw err('XLSX', 'XLSX 参数无效：需要 SheetJS 库对象');
  if (!SAMPLES.hasOwnProperty(kind)) throw err('kind', 'kind 参数无效：需要 sales/schedule/contacts');
  var def = SAMPLES[kind];
  var wb = XLSX.utils.book_new();
  var ws = XLSX.utils.aoa_to_sheet([def.header].concat(def.rows));
  XLSX.utils.book_append_sheet(wb, ws, def.sheetName);
  return wb;
}

/* 供 Node 单测与浏览器共用的导出 */
var api = {
  MAX_FILE_SIZE: MAX_FILE_SIZE,
  MAX_ROWS_NOTICE: MAX_ROWS_NOTICE,
  PAGE_SIZE: PAGE_SIZE,
  parseWorkbook: parseWorkbook,
  formatCellValue: formatCellValue,
  sortRows: sortRows,
  nextSortDir: nextSortDir,
  searchRows: searchRows,
  paginateRows: paginateRows,
  rowsToCSV: rowsToCSV,
  rowsToTSV: rowsToTSV,
  workbookStats: workbookStats,
  isSupportedFile: isSupportedFile,
  buildSampleWorkbook: buildSampleWorkbook
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.XlsxViewer = api;

/* ---------------- 浏览器绑定（仅有 document 时执行） ---------------- */
if (typeof document !== 'undefined') {
function $(id) { return document.getElementById(id); }
function escHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function fmtSize(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / (1024 * 1024)).toFixed(2) + ' MB';
}
function toast(m) {
  var el = document.createElement('div');
  el.textContent = m;
  el.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:#111827;color:#fff;padding:.6rem 1.2rem;border-radius:.5rem;z-index:9999;font-size:.9rem;max-width:86vw;text-align:center;';
  document.body.appendChild(el);
  setTimeout(function () { if (el.parentNode) document.body.removeChild(el); }, 3000);
}
function setStatus(m) { $('xv-status').textContent = m || ''; }
function showError(m) {
  var el = $('xv-error');
  el.textContent = m; el.style.display = 'block';
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function hideError() { $('xv-error').style.display = 'none'; $('xv-error').textContent = ''; }
function downloadBlob(blob, name) {
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
}
function safeBaseName(name) {
  var n = String(name || 'xlsx_viewer').replace(/\.[a-z0-9]+$/i, '');
  n = n.replace(/[\\/:*?"<>|\r\n]/g, '_').trim();
  return n || 'xlsx_viewer';
}

/* ---------------- 状态 ---------------- */
var S = {
  fileName: '', fileSize: 0, parsed: null,
  sheetIndex: 0, headerOn: true,
  sortCol: -1, sortDir: null, query: '', page: 1
};

/* 当前表视图：headerOn 关时首行计入数据行，表头自动生成「列1、列2…」 */
function currentSheet() {
  return S.parsed.sheets[Math.max(0, Math.min(S.sheetIndex, S.parsed.sheets.length - 1))];
}
function viewSheet() {
  var sh = currentSheet();
  if (S.headerOn) return { name: sh.name, header: sh.header, rows: sh.rows, ncols: sh.ncols };
  var aoa = [sh.header].concat(sh.rows);
  var header = [];
  for (var i = 0; i < sh.ncols; i++) header.push('列' + (i + 1));
  return { name: sh.name, header: header, rows: aoa, ncols: sh.ncols };
}
/* 当前视图经搜索＋排序后的全量行（分页前），导出/复制与渲染共用 */
function filteredSortedRows(view) {
  var rows = searchRows(view.rows, S.query);
  if (S.sortCol >= 0 && S.sortDir) rows = sortRows(rows, S.sortCol, S.sortDir);
  return rows;
}

/* ---------------- 文件读取与解析 ---------------- */
function handleBuffer(buf, fileName, fileSize) {
  hideError();
  if (!window.XLSX) {
    showError('表格解析组件（SheetJS）未加载：请刷新页面重试。');
    return;
  }
  try {
    S.parsed = parseWorkbook(window.XLSX, buf, fileName);
  } catch (e) {
    showError('文件解析失败：不是有效的 Excel/CSV 文件，或文件已损坏。');
    setStatus('');
    return;
  }
  if (!S.parsed.sheets.length) {
    showError('文件中没有可读取的工作表。');
    setStatus('');
    return;
  }
  S.fileName = fileName;
  S.fileSize = fileSize;
  S.sheetIndex = 0; S.sortCol = -1; S.sortDir = null; S.query = ''; S.page = 1;
  $('xv-search').value = '';
  renderAfterParse();
}
function handleFile(file) {
  hideError();
  if (!file) return;
  if (!isSupportedFile(file.name)) {
    showError('仅支持 .xlsx / .xls / .csv 文件。');
    return;
  }
  if (file.size > MAX_FILE_SIZE) {
    showError('文件超过 20MB 上限（当前 ' + fmtSize(file.size) + '），请拆分后重试。');
    return;
  }
  setStatus('正在读取文件…');
  file.arrayBuffer().then(function (buf) {
    setStatus('正在解析表格…');
    setTimeout(function () { handleBuffer(buf, file.name, file.size); }, 30);
  }).catch(function () {
    showError('文件读取失败，请重试。');
    setStatus('');
  });
}
function loadSample(kind) {
  hideError();
  if (!window.XLSX) {
    showError('表格解析组件（SheetJS）未加载：请刷新页面重试。');
    return;
  }
  var wb = buildSampleWorkbook(window.XLSX, kind);
  var arr = window.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  var names = { sales: '示例-销售表.xlsx', schedule: '示例-课程表.xlsx', contacts: '示例-通讯录.xlsx' };
  handleBuffer(arr, names[kind], arr.byteLength);
  setStatus('已载入预设示例（JS 本地生成，未上传）。');
}

/* ---------------- 渲染 ---------------- */
function renderAfterParse() {
  var sheets = S.parsed.sheets;
  var stats = workbookStats(S.parsed, S.fileSize);
  $('xv-fileinfo').style.display = 'flex';
  $('xv-file-name').textContent = S.fileName;
  $('xv-file-sub').textContent = fmtSize(S.fileSize) + ' · 本地解析，不上传';
  $('xv-stats').innerHTML =
    '文件大小 <b>' + escHtml(fmtSize(stats.fileSize)) + '</b> · 工作表 <b>' + stats.sheets + '</b> 个' +
    ' · 数据行 <b>' + stats.rows + '</b> 行 · 列数 <b>' + stats.cols + '</b> 列（最多）' +
    ' · 单元格 <b>' + stats.cells + '</b> 个（含表头）';
  /* 工作表切换 */
  var tabs = $('xv-tabs');
  var html = '';
  for (var i = 0; i < sheets.length; i++) {
    html += '<button type="button" class="xv-tab' + (i === S.sheetIndex ? ' active' : '') +
      '" data-i="' + i + '">' + escHtml(sheets[i].name) +
      '（' + sheets[i].rows.length + ' 行）</button>';
  }
  tabs.innerHTML = html;
  tabs.style.display = sheets.length > 1 ? '' : 'none';
  var btns = tabs.querySelectorAll('button[data-i]');
  for (var b = 0; b < btns.length; b++) {
    (function (btn) {
      btn.addEventListener('click', function () {
        S.sheetIndex = parseInt(btn.getAttribute('data-i'), 10) || 0;
        S.sortCol = -1; S.sortDir = null; S.page = 1;
        renderAfterParse();
      });
    })(btns[b]);
  }
  /* 超 5000 行提示 */
  var sh = currentSheet();
  var warn = $('xv-warn');
  if (sh.rows.length > MAX_ROWS_NOTICE) {
    warn.style.display = 'block';
    warn.textContent = '该工作表共 ' + sh.rows.length + ' 行数据（超过 5000 行），已分页显示，每页 100 行；搜索与排序对全部行生效。';
  } else {
    warn.style.display = 'none';
    warn.textContent = '';
  }
  $('xv-viewer').style.display = '';
  renderTable();
  setStatus('解析成功：' + sheets.length + ' 个工作表，共 ' + stats.rows + ' 行数据。');
}
function renderTable() {
  var view = viewSheet();
  var rows = filteredSortedRows(view);
  var pg = paginateRows(rows, S.page, PAGE_SIZE);
  S.page = pg.page;
  var h = '<table class="xv-table"><thead><tr>';
  for (var j = 0; j < view.header.length; j++) {
    var arrow = (S.sortCol === j) ? (S.sortDir === 'asc' ? ' ▲' : S.sortDir === 'desc' ? ' ▼' : '') : '';
    h += '<th class="xv-th" data-col="' + j + '" title="点击排序">' +
      escHtml(formatCellValue(view.header[j])) + escHtml(arrow) + '</th>';
  }
  h += '</tr></thead><tbody>';
  for (var i = 0; i < pg.pageRows.length; i++) {
    h += '<tr>';
    for (var k = 0; k < view.ncols; k++) {
      var v = pg.pageRows[i][k];
      var cls = (typeof v === 'number') ? ' class="num"' : '';
      h += '<td' + cls + '>' + escHtml(formatCellValue(v)) + '</td>';
    }
    h += '</tr>';
  }
  h += '</tbody></table>';
  $('xv-table-wrap').innerHTML = pg.pageRows.length
    ? h : '<div class="xv-empty">' + (S.query ? '没有匹配「' + escHtml(S.query) + '」的行。' : '该工作表暂无数据行。') + '</div>';
  $('xv-stats-line').textContent =
    '当前表「' + view.name + '」：共 ' + view.rows.length + ' 行数据 × ' + view.ncols + ' 列' +
    (S.query ? '，搜索后 ' + rows.length + ' 行' : '') +
    '，第 ' + pg.page + ' / ' + pg.totalPages + ' 页';
  $('xv-page-info').textContent = '第 ' + pg.page + ' / ' + pg.totalPages + ' 页';
  $('xv-page-jump').value = pg.page;
  $('xv-prev').disabled = pg.page <= 1;
  $('xv-next').disabled = pg.page >= pg.totalPages;
  $('xv-export').disabled = !view.rows.length;
  $('xv-copy').disabled = !view.rows.length;
  var ths = $('xv-table-wrap').querySelectorAll('th[data-col]');
  for (var t = 0; t < ths.length; t++) {
    (function (th) {
      th.addEventListener('click', function () {
        var col = parseInt(th.getAttribute('data-col'), 10) || 0;
        if (S.sortCol === col) S.sortDir = nextSortDir(S.sortDir);
        else { S.sortCol = col; S.sortDir = 'asc'; }
        if (!S.sortDir) S.sortCol = -1;
        S.page = 1;
        renderTable();
      });
    })(ths[t]);
  }
}
function exportCSV() {
  if (!S.parsed) return;
  var view = viewSheet();
  var rows = filteredSortedRows(view);
  var csv = rowsToCSV([view.header].concat(rows));
  var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  var name = safeBaseName(S.fileName) + '_' + view.name.replace(/[\\/:*?"<>|\r\n]/g, '_') + '.csv';
  downloadBlob(blob, name);
  toast('已导出 ' + name + '（' + rows.length + ' 行数据）');
}
function copyTSV() {
  if (!S.parsed) return;
  var view = viewSheet();
  var rows = filteredSortedRows(view);
  var tsv = rowsToTSV([view.header].concat(rows));
  function done() { toast('已复制 TSV（' + rows.length + ' 行数据），可直接粘贴进 Excel。'); }
  function fallback() {
    var ta = document.createElement('textarea');
    ta.value = tsv;
    ta.style.cssText = 'position:fixed;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); }
    catch (e) { showError('复制失败：请手动全选表格后复制。'); }
    document.body.removeChild(ta);
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(tsv).then(done, fallback);
  } else {
    fallback();
  }
}
function clearAll() {
  S.fileName = ''; S.fileSize = 0; S.parsed = null;
  S.sheetIndex = 0; S.sortCol = -1; S.sortDir = null; S.query = ''; S.page = 1;
  $('xv-file').value = '';
  $('xv-search').value = '';
  $('xv-fileinfo').style.display = 'none';
  $('xv-viewer').style.display = 'none';
  $('xv-warn').style.display = 'none';
  setStatus('');
  hideError();
}

document.addEventListener('DOMContentLoaded', function () {
  var up = $('xv-upload'), fi = $('xv-file');
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
  $('xv-clear').addEventListener('click', clearAll);
  $('xv-sample-sales').addEventListener('click', function () { loadSample('sales'); });
  $('xv-sample-schedule').addEventListener('click', function () { loadSample('schedule'); });
  $('xv-sample-contacts').addEventListener('click', function () { loadSample('contacts'); });
  $('xv-header-toggle').addEventListener('change', function () {
    S.headerOn = $('xv-header-toggle').checked;
    S.sortCol = -1; S.sortDir = null; S.page = 1;
    if (S.parsed) renderTable();
  });
  $('xv-search').addEventListener('input', function () {
    S.query = $('xv-search').value;
    S.page = 1;
    if (S.parsed) renderTable();
  });
  $('xv-prev').addEventListener('click', function () {
    if (S.page > 1) { S.page--; renderTable(); }
  });
  $('xv-next').addEventListener('click', function () {
    S.page++; renderTable();
  });
  $('xv-page-go').addEventListener('click', function () {
    var p = parseInt($('xv-page-jump').value || '1', 10) || 1;
    S.page = p;
    renderTable();
  });
  $('xv-export').addEventListener('click', exportCSV);
  $('xv-copy').addEventListener('click', copyTSV);
});
}

})();
