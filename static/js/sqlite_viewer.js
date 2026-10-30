/* SQLite 文件查看器（sqlite_viewer）- 纯前端本地 .db 查看，零上传
 * 拖拽/选择 .db 文件（File API 本机读取）→ sql.js WASM 自托管解析
 * （static/js/vendor/sqljs/，sql.js v1.15.2，首屏不加载，仅选文件后动态注入）
 * → 左侧表列表（sqlite_master，过滤 sqlite_% 系统表）→ 表结构（列名/类型/主键）
 * ＋数据分页预览 → SQL 查询编辑器（只读）→ 结果表格 → 导出 CSV 下载。
 * 纯函数（双模式导出供 node 测试）：
 *   isReadOnlyQuery(sql)   → bool（仅 SELECT/WITH/PRAGMA/EXPLAIN 首关键字；空串/非字符串抛 Error，err.field="sql"；
 *                           前导注释容忍；多语句拦截；去除字面量后扫描写入关键字）
 *   extractTables(rows)    → 表名数组（过滤 sqlite_% 系统表；rows 为 sqlite_master 的 name/type 行；非法抛 Error，err.field="masterRows"）
 *   parseCreateTable(text) → [{name, type, pk}]（容忍换行/双引号/反引号/方括号列名；列级 PRIMARY KEY 识别；
 *                           表级约束行跳过；非法抛 Error，err.field="sqlText"）
 *   escapeCsvCell(v)       → RFC4180 转义（null/undefined→空串；含逗号/引号/换行加引号包裹、引号双写）
 *   rowsToCsv(columns,rows)→ CSV 文本（\r\n 换行，尾行带换行；非法抛 Error，err.field="columns"/"rows"）
 *   formatBytes(n)         → 人性化文件大小（如 1536→"1.5 KB"；非法抛 Error，err.field="n"）
 * 失败约定：非法参数抛 Error，err.field 给出字段名，不静默钳制。
 * 零网络请求：本文件不发起任何 fetch / XHR / WebSocket（WASM 二进制由 sql-wasm.js 内部同域加载）。 */
(function () {
'use strict';

/* ---------- 失败构造 ---------- */
function fail(field, msg) {
  var e = new Error(msg);
  e.field = field;
  throw e;
}

/* ---------- SQL 注释剥离（行注释 -- 与块注释 /* *\/，引号内不处理） ---------- */
function stripSqlComments(sql) {
  var out = '', i = 0, n = sql.length, quote = null;
  while (i < n) {
    var c = sql[i];
    if (quote) {
      out += c;
      if (quote === '[' ? c === ']' : c === quote) {
        if ((quote === "'" || quote === '"' || quote === '`') && sql[i + 1] === quote) { out += sql[i + 1]; i += 2; continue; }
        quote = null;
      }
      i++;
      continue;
    }
    if (c === "'" || c === '"' || c === '`' || c === '[') { quote = c; out += c; i++; continue; }
    if (c === '-' && sql[i + 1] === '-') { i += 2; while (i < n && sql[i] !== '\n') i++; continue; }
    if (c === '/' && sql[i + 1] === '*') {
      i += 2;
      while (i < n && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    out += c; i++;
  }
  return out;
}

/* ---------- SQL 字面量/引号标识符剥离（内容替换为空格，防关键字误伤） ---------- */
function stripSqlLiterals(sql) {
  var out = '', i = 0, n = sql.length, quote = null;
  while (i < n) {
    var c = sql[i];
    if (quote) {
      if (quote === '[' ? c === ']' : c === quote) {
        if ((quote === "'" || quote === '"' || quote === '`') && sql[i + 1] === quote) { i += 2; continue; }
        quote = null;
      }
      i++;
      continue;
    }
    if (c === "'" || c === '"' || c === '`' || c === '[') { quote = c; out += ' '; i++; continue; }
    out += c; i++;
  }
  return out;
}

var READONLY_KEYWORDS = ['SELECT', 'WITH', 'PRAGMA', 'EXPLAIN'];
var WRITE_KEYWORDS_RE = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|ATTACH|DETACH|REPLACE|VACUUM|REINDEX|TRUNCATE|GRANT|REVOKE)\b/i;

/* ---------- isReadOnlyQuery ---------- */
function isReadOnlyQuery(sql) {
  if (typeof sql !== 'string') fail('sql', 'SQL 查询必须为字符串。');
  var bare = stripSqlLiterals(stripSqlComments(sql));
  if (!bare.trim()) fail('sql', 'SQL 查询不能为空。');
  var parts = bare.split(';');
  var first = parts[0].trim();
  var m = /^([A-Za-z]+)/.exec(first);
  if (!m) return false;
  if (READONLY_KEYWORDS.indexOf(m[1].toUpperCase()) < 0) return false;
  for (var i = 1; i < parts.length; i++) {
    if (parts[i].trim()) return false; // 分号后还有实质语句 → 多语句拦截
  }
  if (WRITE_KEYWORDS_RE.test(bare)) return false; // WITH 携带 DML 等写入一律拦截
  return true;
}

/* ---------- extractTables ---------- */
function extractTables(masterRows) {
  if (!Array.isArray(masterRows)) fail('masterRows', 'masterRows 必须为 sqlite_master 行数组。');
  var out = [], i, r, name;
  for (i = 0; i < masterRows.length; i++) {
    r = masterRows[i] || {};
    name = r.name;
    if (r.type === 'table' && typeof name === 'string' && name && name.indexOf('sqlite_') !== 0) {
      out.push(name);
    }
  }
  return out;
}

/* ---------- parseCreateTable ---------- */
var CREATE_TABLE_RE = /^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?/i;
var TABLE_CONSTRAINT_RE = /^(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT)\b/i;
var COLUMN_CONSTRAINT_RE = /^(NOT|NULL|PRIMARY|UNIQUE|CHECK|REFERENCES|DEFAULT|COLLATE|GENERATED|AS|CONSTRAINT)$/i;

function unquoteIdent(s) {
  s = s.trim();
  if (s.length >= 2) {
    var f = s[0], l = s[s.length - 1];
    if ((f === '"' && l === '"') || (f === '`' && l === '`')) {
      return s.slice(1, -1).split(f + f).join(f);
    }
    if (f === '[' && l === ']') return s.slice(1, -1);
  }
  return s;
}

function splitTopLevel(s) {
  var parts = [], cur = '', quote = null, depth = 0, i, c;
  for (i = 0; i < s.length; i++) {
    c = s[i];
    if (quote) {
      cur += c;
      if (quote === '[' ? c === ']' : c === quote) {
        if ((quote === "'" || quote === '"' || quote === '`') && s[i + 1] === quote) { cur += s[i + 1]; i++; }
        else { quote = null; }
      }
      continue;
    }
    if (c === "'" || c === '"' || c === '`' || c === '[') { quote = c; cur += c; continue; }
    if (c === '(') depth++;
    else if (c === ')') depth--;
    if (c === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

function parseColumnDef(def) {
  var d = def.trim();
  if (!d || TABLE_CONSTRAINT_RE.test(d)) return null; // 表级约束行跳过
  var name, rest, fc = d[0];
  if (fc === '"' || fc === '`' || fc === '[') {
    var close = fc === '[' ? ']' : fc, p = 1;
    while (p < d.length) {
      if (d[p] === close) {
        if (close !== ']' && d[p + 1] === close) { p += 2; continue; }
        break;
      }
      p++;
    }
    name = unquoteIdent(d.slice(0, p + 1));
    rest = d.slice(p + 1).trim();
  } else {
    var sp = d.search(/\s/);
    if (sp < 0) { name = d; rest = ''; }
    else { name = d.slice(0, sp); rest = d.slice(sp + 1).trim(); }
  }
  var tokens = rest.split(/\s+/).filter(Boolean), typeTokens = [], i;
  for (i = 0; i < tokens.length; i++) {
    if (COLUMN_CONSTRAINT_RE.test(tokens[i])) break;
    typeTokens.push(tokens[i]);
  }
  return { name: name, type: typeTokens.join(' '), pk: /\bPRIMARY\s+KEY\b/i.test(d) };
}

function parseCreateTable(sqlText) {
  if (typeof sqlText !== 'string') fail('sqlText', '建表语句必须为字符串。');
  var t = sqlText.trim();
  var m = CREATE_TABLE_RE.exec(t);
  if (!m) fail('sqlText', '不是合法的 CREATE TABLE 语句。');
  var n = t.length, j = m[0].length, quote = null, c;
  var start = -1;
  for (; j < n; j++) { // 跳过表名（含引号/库名限定），找列定义左括号
    c = t[j];
    if (quote) {
      if (quote === '[' ? c === ']' : c === quote) {
        if ((quote === "'" || quote === '"' || quote === '`') && t[j + 1] === quote) { j++; continue; }
        quote = null;
      }
      continue;
    }
    if (c === "'" || c === '"' || c === '`' || c === '[') { quote = c; continue; }
    if (c === '(') { start = j; break; }
    if (c === ';') fail('sqlText', 'CREATE TABLE 语句不完整（缺少列定义）。');
  }
  if (start < 0) fail('sqlText', 'CREATE TABLE 语句缺少列定义括号。');
  var depth = 1, k;
  quote = null;
  for (k = start + 1; k < n; k++) { // 找配对右括号（引号/嵌套括号感知）
    c = t[k];
    if (quote) {
      if (quote === '[' ? c === ']' : c === quote) {
        if ((quote === "'" || quote === '"' || quote === '`') && t[k + 1] === quote) { k++; continue; }
        quote = null;
      }
      continue;
    }
    if (c === "'" || c === '"' || c === '`' || c === '[') { quote = c; continue; }
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) break; }
  }
  if (depth !== 0) fail('sqlText', 'CREATE TABLE 语句括号不配对。');
  var cols = splitTopLevel(t.slice(start + 1, k)), out = [], x, col;
  for (x = 0; x < cols.length; x++) {
    col = parseColumnDef(cols[x]);
    if (col) out.push(col);
  }
  if (!out.length) fail('sqlText', 'CREATE TABLE 未解析到任何列。');
  return out;
}

/* ---------- escapeCsvCell ---------- */
function escapeCsvCell(v) {
  if (v === null || v === undefined) return '';
  var s = String(v);
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/* ---------- rowsToCsv ---------- */
function rowsToCsv(columns, rows) {
  if (!Array.isArray(columns)) fail('columns', 'columns 必须为数组。');
  if (!Array.isArray(rows)) fail('rows', 'rows 必须为二维数组。');
  var lines = [columns.map(escapeCsvCell).join(',')], i, r;
  for (i = 0; i < rows.length; i++) {
    r = rows[i];
    if (!Array.isArray(r)) fail('rows', 'rows 的第 ' + i + ' 行不是数组。');
    lines.push(r.map(escapeCsvCell).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

/* ---------- formatBytes ---------- */
function formatBytes(n) {
  if (typeof n !== 'number' || !isFinite(n) || n < 0) fail('n', '文件大小必须为非负数。');
  var units = ['B', 'KB', 'MB', 'GB', 'TB'], u = 0, v = n;
  if (v < 1024) return Math.floor(v) + ' B';
  while (v >= 1024 && u < units.length - 1) { v /= 1024; u++; }
  var s = String(Math.round(v * 10) / 10);
  return s + ' ' + units[u];
}

/* ---------- 双模式导出 ---------- */
var api = {
  isReadOnlyQuery: isReadOnlyQuery,
  extractTables: extractTables,
  parseCreateTable: parseCreateTable,
  escapeCsvCell: escapeCsvCell,
  rowsToCsv: rowsToCsv,
  formatBytes: formatBytes
};
if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}

/* ================= 浏览器 DOM 逻辑（仅 document 存在时执行） ================= */
if (typeof document !== 'undefined') (function () {
  var SQL = null;          // sql.js 引擎（延迟加载）
  var wasmLoading = false; // WASM 加载中
  var wasmQueue = [];      // WASM 加载期间排队的 ensureEngine 回调（加载完成后依次执行）
  var db = null;           // 当前打开的库
  var fileName = '';
  var tables = [];         // [{name, sql}]
  var curTable = '';
  var curPage = 0;
  var rowsPerPage = 50;
  var totalRows = 0;
  var totalPages = 0;
  var lastResult = null;   // 最近一次查询结果 {columns, values}，供 CSV 导出
  var lastResultLabel = '';
  var MAX_FILE = 256 * 1024 * 1024; // 256MB 上限
  var VENDOR_JS = '/tools/static/js/vendor/sqljs/sql-wasm.js';
  var VENDOR_DIR = '/tools/static/js/vendor/sqljs/';

  function $(id) { return document.getElementById(id); }

  function toast(msg) {
    var t = $('sv-toast');
    t.textContent = msg;
    t.style.display = 'block';
    clearTimeout(t._h);
    t._h = setTimeout(function () { t.style.display = 'none'; }, 3200);
  }

  function setMsg(msg, isErr) {
    var m = $('sv-msg');
    m.textContent = msg || '';
    m.className = isErr ? 'sv-msg sv-err' : 'sv-msg';
  }

  function cellText(v) {
    if (v === null || v === undefined) return 'NULL';
    if (v instanceof Uint8Array) return 'BLOB（' + v.length + ' 字节）';
    return String(v);
  }

  function qIdent(name) {
    return '"' + String(name).replace(/"/g, '""') + '"';
  }

  /* ---------- WASM 延迟加载 ---------- */
  function ensureEngine(cb) {
    if (SQL) { cb(); return; }
    if (wasmLoading) { // 加载期间：排队等加载完成再执行，避免第二次选文件被吞掉
      wasmQueue.push(cb);
      toast('SQLite 引擎加载中，请稍候…');
      return;
    }
    wasmLoading = true;
    $('sv-wasm').style.display = 'block';
    $('sv-wasm-msg').textContent = '正在加载 SQLite 引擎（sql.js WASM 约 700KB，仅首次打开 .db 时加载一次）…';
    var s = document.createElement('script');
    s.src = VENDOR_JS;
    s.onload = function () {
      try {
        window.initSqlJs({ locateFile: function (f) { return VENDOR_DIR + f; } }).then(function (S) {
          SQL = S;
          wasmLoading = false;
          $('sv-wasm').style.display = 'none';
          var q = wasmQueue; wasmQueue = [];
          cb();
          q.forEach(function (f) { try { f(); } catch (e) { /* 忽略单个排队回调异常 */ } });
        }, function (err) {
          wasmLoading = false;
          wasmQueue = [];
          $('sv-wasm-msg').textContent = 'SQLite 引擎加载失败：' + (err && err.message || err);
          toast('SQLite 引擎加载失败，请刷新重试。');
        });
      } catch (e) {
        wasmLoading = false;
        wasmQueue = [];
        $('sv-wasm-msg').textContent = 'SQLite 引擎初始化失败：' + e.message;
      }
    };
    s.onerror = function () {
      wasmLoading = false;
      wasmQueue = [];
      $('sv-wasm-msg').textContent = 'SQLite 引擎脚本加载失败（同域 vendor 缺失？），请刷新重试。';
    };
    document.head.appendChild(s);
  }

  /* ---------- 文件载入 ---------- */
  function setFile(f) {
    if (!f) return;
    if (f.size > MAX_FILE) {
      toast('文件超过 256MB 上限，本工具拒绝打开（WASM 内存上限）。');
      return;
    }
    fileName = f.name;
    closeDb();
    $('sv-info').textContent = '已选择：' + f.name + '（' + formatBytes(f.size) + '），正在读取…';
    var rd = new FileReader();
    rd.onload = function () {
      ensureEngine(function () { openDb(new Uint8Array(rd.result), f); });
    };
    rd.onerror = function () { toast('文件读取失败。'); };
    rd.readAsArrayBuffer(f);
  }

  function closeDb() {
    if (db) { try { db.close(); } catch (e) {} db = null; }
    tables = []; curTable = ''; lastResult = null;
    $('sv-main').style.display = 'none';
    $('sv-result-card').style.display = 'none';
  }

  function openDb(u8, f) {
    try {
      db = new SQL.Database(u8);
      db.exec('SELECT name FROM sqlite_master LIMIT 1;'); // 探针查询：非法/加密文件在此抛错
    } catch (e) {
      if (db) { try { db.close(); } catch (e2) {} db = null; }
      toast('不是有效的 SQLite 数据库文件（可能已加密或已损坏）。');
      $('sv-info').textContent = '文件打开失败：不是标准 SQLite 格式。';
      return;
    }
    loadTables(f);
  }

  function loadTables(f) {
    var res = db.exec("SELECT name, type, sql FROM sqlite_master WHERE type IN ('table','view') ORDER BY name;");
    var rows = [];
    if (res.length) {
      var cols = res[0].columns, vals = res[0].values, i, o;
      for (i = 0; i < vals.length; i++) {
        o = {};
        o[cols[0]] = vals[i][0]; o[cols[1]] = vals[i][1]; o[cols[2]] = vals[i][2];
        rows.push({ name: o.name, type: o.type, sql: o.sql });
      }
    }
    var names;
    try { names = extractTables(rows); }
    catch (e) { names = []; }
    tables = rows.filter(function (r) { return names.indexOf(r.name) >= 0; });
    $('sv-info').textContent = '已载入：' + f.name + '（' + formatBytes(f.size) + '），共 ' + tables.length + ' 张表。';
    renderTableList();
    $('sv-main').style.display = 'block';
    if (tables.length) selectTable(tables[0].name);
    else toast('该库中没有用户表。');
  }

  function renderTableList() {
    var box = $('sv-tables');
    box.innerHTML = '';
    $('sv-tcount').textContent = '（' + tables.length + '）';
    tables.forEach(function (t) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'sv-tbtn' + (t.name === curTable ? ' sv-on' : '');
      b.textContent = t.name;
      b.setAttribute('data-t', t.name);
      box.appendChild(b);
    });
  }

  /* ---------- 表结构＋分页预览 ---------- */
  function selectTable(name) {
    if (!db) return;
    curTable = name;
    curPage = 0;
    renderTableList();
    setMsg('');
    // 表结构：优先解析 sqlite_master.sql，失败回落 PRAGMA table_info
    var schemaHtml = '', meta = null, i;
    for (i = 0; i < tables.length; i++) { if (tables[i].name === name) { meta = tables[i]; break; } }
    var cols = [];
    try {
      if (meta && meta.sql) cols = parseCreateTable(meta.sql);
    } catch (e) { cols = []; }
    if (!cols.length) {
      try {
        var pr = db.exec('PRAGMA table_info(' + qIdent(name) + ');');
        if (pr.length) {
          var ci = {}, vc = pr[0].columns;
          vc.forEach(function (c, idx) { ci[c] = idx; });
          pr[0].values.forEach(function (v) {
            cols.push({ name: String(v[ci.name]), type: String(v[ci.type] || ''), pk: v[ci.pk] === 1 });
          });
        }
      } catch (e2) {}
    }
    var sh = '<table class="sv-table"><thead><tr><th>列名</th><th>类型</th><th>主键</th></tr></thead><tbody>';
    cols.forEach(function (c) {
      var td1 = document.createElement('td'); td1.textContent = c.name;
      var td2 = document.createElement('td'); td2.textContent = c.type || '—';
      var td3 = document.createElement('td'); td3.textContent = c.pk ? '✔' : '';
      var tr = document.createElement('tr');
      tr.appendChild(td1); tr.appendChild(td2); tr.appendChild(td3);
      sh += tr.outerHTML;
    });
    schemaHtml = sh + '</tbody></table>';
    $('sv-schema').innerHTML = schemaHtml;
    $('sv-curtable').textContent = name;
    // 总行数
    try {
      var cr = db.exec('SELECT COUNT(*) AS c FROM ' + qIdent(name) + ';');
      totalRows = cr.length ? cr[0].values[0][0] : 0;
    } catch (e) { totalRows = 0; }
    totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));
    renderPreviewPage();
  }

  function renderPreviewPage() {
    if (curPage < 0) curPage = 0;
    if (curPage >= totalPages) curPage = totalPages - 1;
    var box = $('sv-preview'), res;
    try {
      res = db.exec('SELECT * FROM ' + qIdent(curTable) +
        ' LIMIT ' + rowsPerPage + ' OFFSET ' + (curPage * rowsPerPage) + ';');
    } catch (e) {
      box.innerHTML = '';
      setMsg('读取表数据失败：' + e.message, true);
      return;
    }
    if (!res.length) {
      box.innerHTML = '<p class="sv-note">该表暂无数据。</p>';
    } else {
      box.innerHTML = '';
      box.appendChild(buildResultTable(res[0].columns, res[0].values));
      lastResult = { columns: res[0].columns, values: res[0].values };
      lastResultLabel = curTable + '_p' + (curPage + 1);
    }
    $('sv-pageinfo').textContent = '第 ' + (curPage + 1) + ' / ' + totalPages + ' 页，共 ' + totalRows + ' 行';
    $('sv-prev').disabled = curPage <= 0;
    $('sv-next').disabled = curPage >= totalPages - 1;
  }

  function buildResultTable(columns, values) {
    var table = document.createElement('table');
    table.className = 'sv-table sv-res';
    var thead = document.createElement('thead'), tr = document.createElement('tr'), i, j;
    columns.forEach(function (c) {
      var th = document.createElement('th');
      th.textContent = c;
      tr.appendChild(th);
    });
    thead.appendChild(tr);
    table.appendChild(thead);
    var tbody = document.createElement('tbody');
    for (i = 0; i < values.length; i++) {
      tr = document.createElement('tr');
      for (j = 0; j < values[i].length; j++) {
        var td = document.createElement('td');
        var v = values[i][j];
        td.textContent = cellText(v);
        if (v === null) td.className = 'sv-null';
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    return table;
  }

  /* ---------- SQL 查询（只读） ---------- */
  function runSql() {
    if (!db) { toast('请先选择 .db 文件。'); return; }
    var sql = $('sv-sql').value;
    setMsg('');
    var ok;
    try { ok = isReadOnlyQuery(sql); }
    catch (e) { setMsg(e.message, true); return; }
    if (!ok) {
      setMsg('本工具为只读查看器，不支持写入（仅允许 SELECT / WITH / PRAGMA / EXPLAIN，且不支持多语句）。', true);
      return;
    }
    var res;
    try { res = db.exec(sql); }
    catch (e) { setMsg('SQL 执行出错：' + e.message, true); return; }
    var box = $('sv-result');
    box.innerHTML = '';
    if (!res.length) {
      box.innerHTML = '<p class="sv-note">执行成功，无结果集返回。</p>';
      lastResult = null;
    } else {
      box.appendChild(buildResultTable(res[0].columns, res[0].values));
      lastResult = { columns: res[0].columns, values: res[0].values };
      lastResultLabel = 'query_result';
      if (res.length > 1) {
        var p = document.createElement('p');
        p.className = 'sv-note';
        p.textContent = '注：返回 ' + res.length + ' 个结果集，仅展示第一个。';
        box.appendChild(p);
      }
    }
    $('sv-result-card').style.display = 'block';
    $('sv-result-info').textContent = lastResult ?
      ('共 ' + lastResult.values.length + ' 行 × ' + lastResult.columns.length + ' 列，可导出 CSV。') : '';
  }

  function exportCsv() {
    if (!lastResult) { toast('暂无可导出的结果（先预览表数据或执行查询）。'); return; }
    var csv;
    try { csv = rowsToCsv(lastResult.columns, lastResult.values); }
    catch (e) { toast('CSV 生成失败：' + e.message); return; }
    var blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    var base = (lastResultLabel || 'result').replace(/[^\w\u4e00-\u9fa5.-]+/g, '_');
    a.href = URL.createObjectURL(blob);
    a.download = base + '.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
    toast('CSV 已开始下载（含 UTF-8 BOM，Excel 直接打开不乱码）。');
  }

  function fillExample(sql) {
    $('sv-sql').value = sql;
    $('sv-sql').focus();
  }

  /* ---------- 事件绑定 ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    var dz = $('sv-drop'), fi = $('sv-file');
    $('sv-pick').addEventListener('click', function () { fi.click(); });
    fi.addEventListener('change', function () { if (fi.files[0]) setFile(fi.files[0]); fi.value = ''; });
    ['dragenter', 'dragover'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('sv-over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('sv-over'); });
    });
    dz.addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) setFile(f);
    });

    $('sv-tables').addEventListener('click', function (e) {
      var t = e.target;
      if (t && t.getAttribute && t.getAttribute('data-t')) selectTable(t.getAttribute('data-t'));
    });
    $('sv-rpp').addEventListener('change', function () {
      rowsPerPage = parseInt($('sv-rpp').value, 10) || 50;
      curPage = 0;
      totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));
      renderPreviewPage();
    });
    $('sv-prev').addEventListener('click', function () { curPage--; renderPreviewPage(); });
    $('sv-next').addEventListener('click', function () { curPage++; renderPreviewPage(); });

    $('sv-run').addEventListener('click', runSql);
    $('sv-sql').addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') runSql();
    });
    $('sv-export').addEventListener('click', exportCsv);
    var ex = document.querySelectorAll('[data-sv-example]');
    Array.prototype.forEach.call(ex, function (b) {
      b.addEventListener('click', function () {
        var kind = b.getAttribute('data-sv-example'), sql = '';
        if (kind === 'master') sql = "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';";
        else if (kind === 'all' && curTable) sql = 'SELECT * FROM ' + qIdent(curTable) + ' LIMIT 10;';
        else if (kind === 'pragma' && curTable) sql = 'PRAGMA table_info(' + qIdent(curTable) + ');';
        else if (kind === 'count' && curTable) sql = 'SELECT COUNT(*) AS total FROM ' + qIdent(curTable) + ';';
        if (sql) fillExample(sql);
        else toast('请先打开 .db 文件再使用该示例。');
      });
    });
  });
})();
}
)();
