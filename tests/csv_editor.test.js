/* CSV 编辑器纯逻辑单元测试（零依赖）：node tests/csv_editor.test.js
* 覆盖：detectDelimiter 三分隔符精确值／空文本回退／引号内不计／首行限定／非字符串抛错、
* parseCSV 引号包裹／双引号转义／字段内换行／CRLF／BOM／尾行丢弃／非法 delimiter 与非字符串 text 抛错、
* stringifyCSV 包裹与转义精确值／非法参数抛错、stringify↔parse 往返一致、
* setCell 不可变更新／越界抛错／value 归一化、insertRow／deleteRow／insertCol／deleteCol 边界与抛错、
* deleteCol 删至 0 列保留 1 空列、truncateGrid 截断精确值与标志、sanitizeFileName 清理与回退、
* 注册（295→296 Path）与 Icon table_edit 唯一、零网络请求、模板真限制文案与双向互链。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/csv_editor.js");

var pass = 0, fail = 0;
function ok(cond, name) {
if (cond) { pass++; }
else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function has(s, sub, name) { ok(String(s).indexOf(sub) !== -1, name + "（应包含 " + JSON.stringify(sub) + "）"); }
function notHas(s, sub, name) { ok(String(s).indexOf(sub) === -1, name + "（不应包含 " + JSON.stringify(sub) + "）"); }
function throwsField(fn, field, name) {
try { fn(); }
catch (e) { eq(e.field, field, name); return; }
ok(false, name + "（应抛错而未抛）");
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "csv_editor.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "csv_editor.html"), "utf8");
var VIEWER_TPL = fs.readFileSync(path.join(ROOT, "templates", "csv_table_viewer.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. detectDelimiter ---------- */
eq(M.detectDelimiter('姓名,部门,月薪\n张伟,研发,18500\n'), ',', "检测：逗号精确值");
eq(M.detectDelimiter('姓名;部门;月薪\n张伟;研发;18500\n'), ';', "检测：分号精确值");
eq(M.detectDelimiter('姓名\t部门\t月薪\n张伟\t研发\t18500\n'), '\t', "检测：制表符精确值");
eq(M.detectDelimiter(''), ',', "检测：空文本回退 ','");
eq(M.detectDelimiter('a,b;c\n'), ',', "检测：逗号分号各 1 个时按顺位取逗号");
eq(M.detectDelimiter('"陈;晨",市场\n'), ',', "检测：引号内分号不计");
eq(M.detectDelimiter('a,b\nx;y;z\n'), ',', "检测：只统计首行");
eq(M.detectDelimiter('单列无分隔符\n'), ',', "检测：首行无候选回退 ','");
throwsField(function () { M.detectDelimiter(123); }, 'text', "检测：数字 text 抛错");
throwsField(function () { M.detectDelimiter(null); }, 'text', "检测：null text 抛错");
throwsField(function () { M.detectDelimiter({}); }, 'text', "检测：对象 text 抛错");

/* ---------- 2. parseCSV ---------- */
eq(M.parseCSV('a,b\n"陈,晨",2\n', ',')[1][0], "陈,晨", "解析：引号包裹逗号不切分");
eq(M.parseCSV('a,b\n"说""好""",2\n', ',')[1][0], '说"好"', "解析：双引号转义还原");
eq(M.parseCSV('a,b\n"第1行\n第2行",2\n', ',')[1][0], "第1行\n第2行", "解析：字段内换行保留");
eq(M.parseCSV('a,b\r\n1,2\r\n', ',')[1][1], "2", "解析：CRLF 换行正常");
eq(M.parseCSV('﻿a,b\n1,2\n', ',')[0][0], "a", "解析：UTF-8 BOM 剥离");
eq(M.parseCSV('a,b\n1,2\n\n\n', ',').length, 2, "解析：空尾行不计入");
eq(M.parseCSV('a;b\n1;2\n', ';')[1][1], "2", "解析：分号分隔符");
eq(M.parseCSV('a\tb\n1\t2\n', '\t')[1][1], "2", "解析：制表符分隔符");
eq(M.parseCSV('', ',').length, 0, "解析：空输入零行");
eq(M.parseCSV('a,b\n"未闭合,2\n', ',').length, 2, "解析：未闭合引号尽力返回已读行");
throwsField(function () { M.parseCSV('a|b', '|'); }, 'delimiter', "解析：非法 delimiter 抛错");
throwsField(function () { M.parseCSV(null, ','); }, 'text', "解析：非字符串 text 抛错");

/* ---------- 3. stringifyCSV ---------- */
eq(M.stringifyCSV([['a', 'b'], ['1', '2']], ','), 'a,b\n1,2', "序列化：普通字段直接连接");
eq(M.stringifyCSV([['a,b', 'c']], ','), '"a,b",c', "序列化：含分隔符字段加引号");
eq(M.stringifyCSV([['a"b']], ','), '"a""b"', "序列化：双引号翻倍转义");
eq(M.stringifyCSV([['a\nb']], ','), '"a\nb"', "序列化：含换行字段加引号");
eq(M.stringifyCSV([['a', 'b']], ';'), 'a;b', "序列化：分号分隔符");
eq(M.stringifyCSV([], ','), '', "序列化：空表格得空字符串");
throwsField(function () { M.stringifyCSV([['a']], '|'); }, 'delimiter', "序列化：非法 delimiter 抛错");
throwsField(function () { M.stringifyCSV('a,b', ','); }, 'grid', "序列化：grid 非数组抛错");
throwsField(function () { M.stringifyCSV([['a'], 'b'], ','); }, 'grid', "序列化：行非数组抛错");

/* ---------- 4. 往返一致 ---------- */
var rt1 = [['姓名', '备注'], ['张伟', '含,逗号'], ['李娜', '含"引号"'], ['王强', '含\n换行']];
eq(JSON.stringify(M.parseCSV(M.stringifyCSV(rt1, ','), ',')), JSON.stringify(rt1), "往返：逗号特殊字段一致");
eq(JSON.stringify(M.parseCSV(M.stringifyCSV(rt1, ';'), ';')), JSON.stringify(rt1), "往返：分号特殊字段一致");
var rt2 = [['a', 'b', 'c'], ['1', '', '3']];
eq(JSON.stringify(M.parseCSV(M.stringifyCSV(rt2, '\t'), '\t')), JSON.stringify(rt2), "往返：制表符空字段一致");

/* ---------- 5. setCell ---------- */
var g0 = [['a', 'b'], ['c', 'd']];
var g1 = M.setCell(g0, 0, 1, 'X');
eq(g1[0][1], 'X', "setCell：新 grid 单元格已更新");
eq(g0[0][1], 'b', "setCell：原 grid 不变（不可变）");
ok(g1 !== g0 && g1[0] !== g0[0], "setCell：返回新对象而非原引用");
eq(M.setCell(g0, 1, 0, 42)[1][0], '42', "setCell：数字 value 归一化为字符串");
throwsField(function () { M.setCell(g0, 5, 0, 'x'); }, 'cell', "setCell：行越界抛错");
throwsField(function () { M.setCell(g0, 0, 9, 'x'); }, 'cell', "setCell：列越界抛错");
throwsField(function () { M.setCell(g0, 0.5, 0, 'x'); }, 'cell', "setCell：非整数下标抛错");

/* ---------- 6. insertRow ---------- */
var ir = M.insertRow([['a', 'b'], ['c', 'd']]);
eq(ir.length, 3, "insertRow：缺省末尾追加行数+1");
eq(JSON.stringify(ir[2]), JSON.stringify(['', '']), "insertRow：新行按列数补空");
var ir2 = M.insertRow([['a', 'b'], ['c']], 1);
eq(JSON.stringify(ir2[1]), JSON.stringify(['', '']), "insertRow：中间插入新行按最宽列补空");
eq(ir2[2][0], 'c', "insertRow：中间插入后原行后移");
throwsField(function () { M.insertRow([['a']], -1); }, 'index', "insertRow：负 index 抛错");
throwsField(function () { M.insertRow([['a']], 2); }, 'index', "insertRow：超界 index 抛错");

/* ---------- 7. deleteRow ---------- */
var dr = M.deleteRow([['a'], ['b'], ['c']], 1);
eq(JSON.stringify(dr), JSON.stringify([['a'], ['c']]), "deleteRow：中间删除精确值");
throwsField(function () { M.deleteRow([], 0); }, 'grid', "deleteRow：空表格抛错");
throwsField(function () { M.deleteRow([['a']], 3); }, 'index', "deleteRow：超界 index 抛错");

/* ---------- 8. insertCol ---------- */
var ic = M.insertCol([['a', 'b'], ['c', 'd']]);
eq(JSON.stringify(ic), JSON.stringify([['a', 'b', ''], ['c', 'd', '']]), "insertCol：缺省末尾追加精确值");
var ic2 = M.insertCol([['a', 'b']], 0);
eq(JSON.stringify(ic2), JSON.stringify([['', 'a', 'b']]), "insertCol：首列插入精确值");
throwsField(function () { M.insertCol([['a']], 5); }, 'index', "insertCol：超界 index 抛错");

/* ---------- 9. deleteCol ---------- */
var dc = M.deleteCol([['a', 'b', 'c'], ['1', '2', '3']], 1);
eq(JSON.stringify(dc), JSON.stringify([['a', 'c'], ['1', '3']]), "deleteCol：中间删除精确值");
var dc0 = M.deleteCol([['a'], ['b']], 0);
eq(dc0.length, 2, "deleteCol：删至 0 列仍保留行数");
eq(JSON.stringify(dc0[0]), JSON.stringify(['']), "deleteCol：删至 0 列保留 1 空列");
throwsField(function () { M.deleteCol([['a']], 2); }, 'index', "deleteCol：超界 index 抛错");
throwsField(function () { M.deleteCol([], 0); }, 'grid', "deleteCol：空表格抛错");

/* ---------- 10. truncateGrid ---------- */
var big = [];
for (var i = 0; i < 10; i++) big.push([String(i)]);
var t1 = M.truncateGrid(big, 3);
eq(t1.truncated, true, "截断：超限 truncated=true");
eq(t1.grid.length, 3, "截断：超限保留头部行数");
eq(t1.grid[2][0], '2', "截断：保留头部精确值");
var t2 = M.truncateGrid(big, 10);
eq(t2.truncated, false, "截断：未超限 truncated=false");
eq(t2.grid.length, 10, "截断：未超限行数不变");
throwsField(function () { M.truncateGrid(big, 0); }, 'maxRows', "截断：maxRows=0 抛错");
throwsField(function () { M.truncateGrid(big, 2.5); }, 'maxRows', "截断：maxRows 非整数抛错");

/* ---------- 11. sanitizeFileName ---------- */
eq(M.sanitizeFileName('a/b:c?d*e'), 'abcde', "文件名：非法字符清理");
eq(M.sanitizeFileName('my data 表'), 'my-data-表', "文件名：空白转连字符");
eq(M.sanitizeFileName('   '), 'csv-editor', "文件名：空白回退 'csv-editor'");
eq(M.sanitizeFileName(''), 'csv-editor', "文件名：空文本回退 'csv-editor'");
eq(M.sanitizeFileName(null), 'csv-editor', "文件名：null 回退 'csv-editor'");
ok(M.sanitizeFileName('x'.repeat(100)).length <= 60, "文件名：超长截断 60 字符");
eq(M.sanitizeFileName('..data..'), 'data', "文件名：首尾点清理");

/* ---------- 12. 注册与零网络、模板文案 ---------- */
has(GO_SRC, '"csv_editor"', "注册：ID csv_editor");
has(GO_SRC, '"/tools/csv-editor"', "注册：Path /tools/csv-editor");
var pathCount = (GO_SRC.match(/"\/tools\/[^"]+"/g) || []).filter(function (v, i, a) { return a.indexOf(v) === i; }).length;
eq(pathCount, 326, "注册：Path 总数 295→296");
has(GO_SRC, '"table_edit"', "注册：Icon table_edit");
eq((GO_SRC.match(/Icon:\s*"table_edit"/g) || []).length, 1, "注册：Icon table_edit 全库唯一");
has(GO_SRC, '"格式转换"', "注册：类目 格式转换");
notHas(JS_SRC, "fetch(", "零网络：JS 无 fetch");
notHas(JS_SRC, "XMLHttpRequest", "零网络：JS 无 XHR");
notHas(TPL_SRC, "fetch(", "零网络：模板无 fetch");
notHas(TPL_SRC, "http://", "零 CDN：模板无 http 外链");
notHas(TPL_SRC, "https://fonts.googleapis", "零 CDN：模板无字体 CDN");
has(TPL_SRC, "RFC4180 常用子集", "真限制：RFC4180 子集偏差文案");
has(TPL_SRC, "上限 2000 行", "真限制：2000 行上限文案");
has(TPL_SRC, "不上传任何服务器", "真限制：本地编辑不上传文案");
has(TPL_SRC, "/tools/csv-table-viewer", "互链：含 CSV 表格查看器");
has(TPL_SRC, "csv-editor", "模板：canonical 与标识含 csv-editor");
has(TPL_SRC, "csv_editor.js", "模板：JS 文件引用");
has(JS_SRC, "textContent", "渲染：用 textContent 防 HTML 执行");
has(TPL_SRC, "CSV在线编辑", "SEO：关键词含 CSV在线编辑");
has(TPL_SRC, "在线改表格", "SEO：关键词含 在线改表格");
has(VIEWER_TPL, "/tools/csv-editor", "双向互链：查看器模板含编辑器链接");

console.log("csv_editor: pass=" + pass + " fail=" + fail);
if (fail > 0) process.exit(1);
