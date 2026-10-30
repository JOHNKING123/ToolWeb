/* SQLite 文件查看器纯逻辑单元测试（零依赖）：node tests/sqlite_viewer.test.js
 * 覆盖：六个纯函数的确定性向量（规格逐字命中）、错误约定（err.field）、
 * 注册、互链、真限制五条、零网络请求静态检查，
 * 以及 node 端加载同版本自托管 sql-wasm（static/js/vendor/sqljs/）的内存库端到端断言
 * （建 2 张表＋中文内容 → sqlite_master 表列表 → 表结构解析 → 分页 SELECT → 只读校验 → CSV 导出向量一致）。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/sqlite_viewer.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function eqArr(a, b, name) {
  ok(Array.isArray(a) && a.length === b.length && a.every(function (v, i) { return v === b[i]; }),
    name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）");
}
function throwsField(fn, field, name) {
  try { fn(); } catch (e) {
    ok(e instanceof Error && e.field === field,
      name + "（期望抛 Error 且 err.field=" + JSON.stringify(field) + "，实得 " +
      (e instanceof Error ? "Error field=" + JSON.stringify(e.field) : typeof e) + "）");
    return;
  }
  fail++; console.error("FAIL:", name + "（未抛出异常）");
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "sqlite_viewer.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "sqlite_viewer.html"), "utf8");
var CSV_TPL = fs.readFileSync(path.join(ROOT, "templates", "csv_table_viewer.html"), "utf8");
var SQL_TPL = fs.readFileSync(path.join(ROOT, "templates", "sql_formatter.html"), "utf8");
var HEX_TPL = fs.readFileSync(path.join(ROOT, "templates", "hex_viewer.html"), "utf8");
var JSON_TPL = fs.readFileSync(path.join(ROOT, "templates", "json_parser.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. isReadOnlyQuery 确定性向量 ---------- */
eq(M.isReadOnlyQuery('SELECT * FROM users'), true, "规格向量：SELECT → true");
eq(M.isReadOnlyQuery('DROP TABLE users'), false, "规格向量：DROP → false");
eq(M.isReadOnlyQuery('  with x as (select 1) select * from x'), true, "规格向量：前导空格 with → true");
throwsField(function () { M.isReadOnlyQuery(''); }, "sql", "规格向量：空串抛 Error field=sql");
throwsField(function () { M.isReadOnlyQuery(123); }, "sql", "非字符串抛 Error field=sql");
throwsField(function () { M.isReadOnlyQuery(null); }, "sql", "null 抛 Error field=sql");
throwsField(function () { M.isReadOnlyQuery('   '); }, "sql", "纯空白抛 Error field=sql");
eq(M.isReadOnlyQuery('-- 注释\nSELECT 1'), true, "行注释容忍");
eq(M.isReadOnlyQuery('/* 块注释 */ SELECT 1'), true, "块注释容忍");
eq(M.isReadOnlyQuery('EXPLAIN QUERY PLAN SELECT * FROM t'), true, "EXPLAIN → true");
eq(M.isReadOnlyQuery('PRAGMA table_info(users)'), true, "PRAGMA → true");
eq(M.isReadOnlyQuery('insert into t values (1)'), false, "INSERT → false");
eq(M.isReadOnlyQuery('UPDATE t SET a=1'), false, "UPDATE → false");
eq(M.isReadOnlyQuery('DELETE FROM t'), false, "DELETE → false");
eq(M.isReadOnlyQuery('CREATE TABLE t (a)'), false, "CREATE → false");
eq(M.isReadOnlyQuery('ATTACH DATABASE \'x\' AS y'), false, "ATTACH → false");
eq(M.isReadOnlyQuery('SELECT 1;'), true, "尾部分号容忍");
eq(M.isReadOnlyQuery('SELECT 1; DROP TABLE t'), false, "多语句拦截");
eq(M.isReadOnlyQuery('WITH x AS (SELECT 1) DELETE FROM t'), false, "WITH 携带 DML 拦截");
eq(M.isReadOnlyQuery("SELECT 'drop table users'"), true, "字面量内关键字不误伤");

/* ---------- 2. extractTables ---------- */
eqArr(M.extractTables([
  { name: 'users', type: 'table' },
  { name: 'orders', type: 'table' },
  { name: 'sqlite_sequence', type: 'table' },
  { name: 'idx_users', type: 'index' }
]), ['users', 'orders'], "过滤 sqlite_% 系统表与非表类型");
eqArr(M.extractTables([]), [], "空数组 → 空数组");
throwsField(function () { M.extractTables('nope'); }, "masterRows", "非数组抛 Error field=masterRows");
throwsField(function () { M.extractTables(null); }, "masterRows", "null 抛 Error field=masterRows");

/* ---------- 3. parseCreateTable 确定性向量 ---------- */
var pc = M.parseCreateTable('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL)');
eq(pc.length, 2, "规格向量：解析出 2 列");
eq(pc[0].name, 'id', "规格向量：列1 name");
eq(pc[0].type, 'INTEGER', "规格向量：列1 type");
eq(pc[0].pk, true, "规格向量：列1 pk");
eq(pc[1].name, 'name', "规格向量：列2 name");
eq(pc[1].type, 'TEXT', "规格向量：列2 type");
eq(pc[1].pk, false, "规格向量：列2 pk");
var pq = M.parseCreateTable('CREATE TABLE "my table" (\n  "my col" TEXT,\n  `x` INTEGER PRIMARY KEY\n)');
eq(pq[0].name, 'my col', "双引号列名去引号");
eq(pq[1].name, 'x', "反引号列名去引号");
eq(pq[1].pk, true, "反引号列主键识别");
var pt = M.parseCreateTable('CREATE TABLE t (a TEXT, b INTEGER, PRIMARY KEY (a))');
eq(pt.length, 2, "表级约束行跳过");
eq(pt[0].pk, false, "表级主键不误标列级 pk");
throwsField(function () { M.parseCreateTable(123); }, "sqlText", "非字符串抛 Error field=sqlText");
throwsField(function () { M.parseCreateTable('SELECT 1'); }, "sqlText", "非建表语句抛 Error field=sqlText");
throwsField(function () { M.parseCreateTable('CREATE TABLE t ()'); }, "sqlText", "空列定义抛 Error field=sqlText");

/* ---------- 4. escapeCsvCell 确定性向量 ---------- */
eq(M.escapeCsvCell(null), '', "规格向量：null → ''");
eq(M.escapeCsvCell('a"b'), '"a""b"', "规格向量：引号双写加包裹");
eq(M.escapeCsvCell(undefined), '', "undefined → ''");
eq(M.escapeCsvCell('plain'), 'plain', "普通文本不包裹");
eq(M.escapeCsvCell('x,y'), '"x,y"', "含逗号包裹");
eq(M.escapeCsvCell('a\nb'), '"a\nb"', "含换行包裹");
eq(M.escapeCsvCell(42), '42', "数字转字符串");

/* ---------- 5. rowsToCsv 确定性向量 ---------- */
eq(M.rowsToCsv(['a', 'b'], [[1, 'x,y'], [2, 'say "hi"']]),
  'a,b\r\n1,"x,y"\r\n2,"say ""hi"""\r\n', "规格向量：逐字命中");
eq(M.rowsToCsv(['h'], []), 'h\r\n', "空数据行仅表头＋换行");
eq(M.rowsToCsv(['a'], [[null]]), 'a\r\n\r\n', "null 单元格 → 空串");
throwsField(function () { M.rowsToCsv('x', []); }, "columns", "columns 非数组 field=columns");
throwsField(function () { M.rowsToCsv([], 'x'); }, "rows", "rows 非数组 field=rows");

/* ---------- 6. formatBytes 确定性向量 ---------- */
eq(M.formatBytes(1536), '1.5 KB', "规格向量：1536 → 1.5 KB");
eq(M.formatBytes(0), '0 B', "规格向量：0 → 0 B");
eq(M.formatBytes(1024), '1 KB', "1024 → 1 KB");
eq(M.formatBytes(1048576), '1 MB', "1048576 → 1 MB");
eq(M.formatBytes(500), '500 B', "500 → 500 B");
throwsField(function () { M.formatBytes(-1); }, "n", "负数抛 Error field=n");
throwsField(function () { M.formatBytes('x'); }, "n", "非数字抛 Error field=n");

/* ---------- 7. 双模式导出 ---------- */
["isReadOnlyQuery", "extractTables", "parseCreateTable", "escapeCsvCell", "rowsToCsv", "formatBytes"]
  .forEach(function (k) { ok(typeof M[k] === "function", "导出函数 " + k); });

/* ---------- 8. 注册 ---------- */
ok(/ID:\s*"sqlite_viewer"/.test(GO_SRC), "categories.go 注册 ID sqlite_viewer");
ok(/Name:\s*"SQLite 文件查看器"/.test(GO_SRC), "categories.go 注册 Name");
ok(/Path:\s*"\/tools\/sqlite-viewer"/.test(GO_SRC), "categories.go 注册 Path /tools/sqlite-viewer");
ok(/ID:\s*"sqlite_viewer"[\s\S]{0,2000}?Category:\s*"开发工具"/.test(GO_SRC), "归属开发工具品类");
ok(/ID:\s*"sqlite_viewer"[\s\S]{0,2000}?New:\s*true/.test(GO_SRC), "New:true");
ok(/ID:\s*"sqlite_viewer"[\s\S]{0,2000}?Icon:\s*"storage"/.test(GO_SRC), "Icon:storage");
var regBlock = GO_SRC.split('"sqlite_viewer"')[1].split("},")[0];
ok(/SQLite viewer/i.test(regBlock), "Description 中英文双语（含英文）");
ok(regBlock.indexOf("零上传") !== -1, "Description 含零上传声明");
ok(/{{define "sqlite_viewer"}}/.test(TPL_SRC), "模板 define sqlite_viewer");
ok(/https:\/\/www\.johnkingzcq123\.xyz\/tools\/sqlite-viewer/.test(TPL_SRC), "模板 canonical");
ok(/"@type":"SoftwareApplication"/.test(TPL_SRC), "JSON-LD SoftwareApplication");
ok(/<meta property="og:title"/.test(TPL_SRC), "OG 标签");
var paths = GO_SRC.match(/"\/tools\/[^"]+"/g) || [];
ok(new Set(paths).size === 237, "全量 Path 数 237（实得 " + new Set(paths).size + "）");

/* ---------- 9. 互链（文件查看 vs 文本格式化 vs 字节查看） ---------- */
ok(TPL_SRC.indexOf("/tools/csv-table-viewer") !== -1, "互链 CSV 表格查看器");
ok(TPL_SRC.indexOf("导出的 CSV 想表格化查看去这边") !== -1, "互链文案：CSV 表格查看器");
ok(TPL_SRC.indexOf("/tools/sql-formatter") !== -1, "互链 SQL 格式化");
ok(TPL_SRC.indexOf("SQL 语句想格式化去这边") !== -1, "互链文案：SQL 格式化");
ok(TPL_SRC.indexOf("/tools/hex-viewer") !== -1, "互链文件十六进制查看器");
ok(TPL_SRC.indexOf("想看 .db 原始字节去这边") !== -1, "互链文案：十六进制查看器");
ok(TPL_SRC.indexOf("/tools/json-parser") !== -1, "互链 JSON 解析器");
ok(TPL_SRC.indexOf("文件查看 vs 文本格式化 vs 字节查看") !== -1, "互链边界文案");
ok(CSV_TPL.indexOf("/tools/sqlite-viewer") !== -1, "csv_table_viewer 回链");
ok(SQL_TPL.indexOf("/tools/sqlite-viewer") !== -1, "sql_formatter 回链");
ok(HEX_TPL.indexOf("/tools/sqlite-viewer") !== -1, "hex_viewer 回链");
ok(JSON_TPL.indexOf("/tools/sqlite-viewer") !== -1, "json_parser 回链");
ok(TPL_SRC.indexOf("markdown-to-csv") === -1, "不链未交付工具（Markdown 表格转 CSV）");
var hrefRe = /href="(\/tools\/[a-z0-9\-\/]+)"/g;
var hm, bad = [];
while ((hm = hrefRe.exec(TPL_SRC)) !== null) {
  if (hm[1] === "/tools/static") continue;
  if (GO_SRC.indexOf('"' + hm[1] + '"') < 0) bad.push(hm[1]);
}
eq(bad.length, 0, "模板外链全部已注册（实得未注册：" + JSON.stringify(bad) + "）");

/* ---------- 10. 真限制五条页面明示 ---------- */
ok(TPL_SRC.indexOf("WASM") !== -1 && TPL_SRC.indexOf("延迟加载") !== -1, "真限制①：WASM 约700KB 首屏延迟加载");
ok(TPL_SRC.indexOf("只读") !== -1 && TPL_SRC.indexOf("不支持写入") !== -1, "真限制②：只读不支持写入");
ok(TPL_SRC.indexOf("256MB") !== -1 && TPL_SRC.indexOf("分页") !== -1, "真限制③：>256MB 拒绝＋分页预览");
ok(TPL_SRC.indexOf("标准 SQLite") !== -1 && TPL_SRC.indexOf("加密") !== -1, "真限制④：仅标准格式，加密/损坏报错");
ok(TPL_SRC.indexOf("零上传") !== -1 && TPL_SRC.indexOf("本地") !== -1, "真限制⑤：全程本地零上传");
ok(TPL_SRC.indexOf("/tools/static/js/vendor/sqljs/sql-wasm.js") !== -1, "WASM 同域自托管路径引用");

/* ---------- 11. 零网络请求静态检查 ---------- */
ok(!/fetch\s*\(/.test(JS_SRC), "JS 无 fetch");
ok(!/XMLHttpRequest/.test(JS_SRC), "JS 无 XMLHttpRequest");
ok(!/new\s+WebSocket/.test(JS_SRC), "JS 无 WebSocket");
ok(!/<script[^>]*src\s*=\s*"https?:\/\//.test(TPL_SRC), "模板无外部 script（含 CDN 禁令）");
ok(!/<link[^>]*rel\s*=\s*"stylesheet"[^>]*href\s*=\s*"https?:\/\//.test(TPL_SRC), "模板无外部样式");
ok(!/fetch\s*\(|XMLHttpRequest/.test(TPL_SRC), "模板无 fetch/XHR");

/* ---------- 12. sql.js 内存库端到端（同版本自托管 vendor） ---------- */
function finish() {
  console.log("\n通过 " + pass + "，失败 " + fail);
  process.exit(fail === 0 ? 0 : 1);
}
try {
  var initSqlJs = require("../static/js/vendor/sqljs/sql-wasm.js");
  var vendorDir = path.join(ROOT, "static", "js", "vendor", "sqljs") + path.sep;
  initSqlJs({ locateFile: function (f) { return vendorDir + f; } }).then(function (SQL) {
    var db = new SQL.Database();
    db.run("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL);");
    db.run("INSERT INTO users VALUES (1, '张三'), (2, '李四'), (3, '王五');");
    db.run("CREATE TABLE orders (oid INTEGER PRIMARY KEY, uname TEXT, amount REAL);");
    db.run("INSERT INTO orders VALUES (101, '张三', 99.5);");
    // 表列表：sqlite_master → extractTables
    var mr = db.exec("SELECT name, type FROM sqlite_master WHERE type='table';")[0];
    var rows = mr.values.map(function (v) { return { name: v[0], type: v[1] }; });
    eqArr(M.extractTables(rows), ['users', 'orders'], "e2e：表列表过滤系统表");
    // 表结构：CREATE TABLE 解析
    var st = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users';");
    st.step();
    var schema = M.parseCreateTable(st.get()[0]);
    st.free();
    eq(schema.length, 2, "e2e：users 表 2 列");
    eq(schema[0].name, 'id', "e2e：列 id");
    eq(schema[0].pk, true, "e2e：id 为主键");
    // 分页预览 SELECT
    var pv = db.exec("SELECT * FROM users ORDER BY id LIMIT 2 OFFSET 1;")[0];
    eqArr(pv.columns, ['id', 'name'], "e2e：分页列名");
    eq(pv.values.length, 2, "e2e：分页 2 行");
    eq(pv.values[0][1], '李四', "e2e：中文内容正确");
    // 只读校验拦截写入
    eq(M.isReadOnlyQuery("DELETE FROM users"), false, "e2e：DELETE 被拦截");
    eq(M.isReadOnlyQuery("SELECT * FROM users WHERE name='张三'"), true, "e2e：中文条件 SELECT 通过");
    // CSV 导出与向量一致
    var csv = M.rowsToCsv(pv.columns, pv.values);
    eq(csv, 'id,name\r\n2,李四\r\n3,王五\r\n', "e2e：CSV 导出内容");
    // 非法文件打开报错（页面 openDb 的探针查询同款口径）
    var threw = false;
    try {
      var baddb = new SQL.Database(new Uint8Array([1, 2, 3, 4]));
      baddb.exec("SELECT name FROM sqlite_master LIMIT 1;");
    } catch (e) { threw = true; }
    ok(threw, "e2e：非法文件字节探针查询抛错");
    db.close();
    finish();
  }, function (err) {
    fail++; console.error("FAIL: sql.js WASM 初始化失败", err && err.message);
    finish();
  });
} catch (e) {
  fail++; console.error("FAIL: 无法加载自托管 sql-wasm", e.message);
  finish();
}
