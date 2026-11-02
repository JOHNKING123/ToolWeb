/* JSON 转 Excel 纯逻辑单元测试（零依赖）：node tests/json_to_excel.test.js
* 覆盖：flattenValue 点路径展平确定性向量逐字（{a:1,b:{c:2},tags:['x','y']}
* →{'a':1,'b.c':2,'tags.0':'x','tags.1':'y'}、undefined err.field='value'）、
* extractColumns 列名并集首次出现顺序逐字（[{a:1},{b:2,a:3}]→['a','b']、
* 'x' err.field='rows'、元素非对象 err.field='rows[1]'）、jsonToSheet 逐字
* （[{a:1},{a:2,b:3}]→columns=['a','b'] rows=[[1,null],[2,3]]、单对象包行、
* 'x' err.field='data'）、buildExcelFileName 逐字（2026-11-02 19:30→
* 'json_to_excel_20261102_193000.xlsx'、'x' err.field='now'）、locateJsonError
* 行列定位、window.JsonToExcel 与 module.exports 同步导出、注册（269→270 Path、
* ID/Path/Icon data_array 全库唯一/Category 格式转换/New: true/紧邻 csvjson）、
* 模板真限制五条文案与零网络请求、csvjson＋markdown_to_excel＋paste_table_to_csv
* 表格一条龙互链、SEO 中英文关键词。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/json_to_excel.js");

var pass = 0, fail = 0;
function ok(cond, name) {
if (cond) { pass++; }
else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function deepEq(a, b, name) { eq(JSON.stringify(a), JSON.stringify(b), name); }
function has(s, sub, name) { ok(String(s).indexOf(sub) !== -1, name + "（应包含 " + JSON.stringify(sub) + "）"); }
function notHas(s, sub, name) { ok(String(s).indexOf(sub) === -1, name + "（不应包含 " + JSON.stringify(sub) + "）"); }
function throwsField(fn, field, name) {
try { fn(); }
catch (e) { eq(e && e.field, field, name); return; }
fail++; console.error("FAIL:", name + "（应抛错，未抛）");
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "json_to_excel.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "json_to_excel.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. flattenValue 确定性向量 ---------- */
deepEq(M.flattenValue({a:1, b:{c:2}, tags:['x','y']}), {'a':1,'b.c':2,'tags.0':'x','tags.1':'y'}, "flattenValue：确定性向量逐字");
deepEq(M.flattenValue({a:1}), {a:1}, "flattenValue：单层原样");
deepEq(M.flattenValue([1,2]), {'0':1,'1':2}, "flattenValue：顶层数组按索引展开");
deepEq(M.flattenValue(5, 'v'), {v:5}, "flattenValue：原始类型直接返回 {[prefix]: value}");
deepEq(M.flattenValue(null, 'n'), {n:null}, "flattenValue：null 为叶子");
deepEq(M.flattenValue({}, 'e'), {}, "flattenValue：空对象不产生列");
deepEq(M.flattenValue({a:{b:{c:{d:1}}}}), {'a.b.c.d':1}, "flattenValue：深层嵌套点路径");
throwsField(function(){ M.flattenValue(undefined); }, "value", "flattenValue：undefined err.field='value'");
throwsField(function(){ M.flattenValue(function(){}); }, "value", "flattenValue：函数 err.field='value'");

/* ---------- 2. extractColumns 确定性向量 ---------- */
deepEq(M.extractColumns([{a:1},{b:2,a:3}]), ['a','b'], "extractColumns：并集首次出现顺序逐字");
deepEq(M.extractColumns([]), [], "extractColumns：空数组→空列");
deepEq(M.extractColumns([{'x.y':1},{'x.y':2,'z':3}]), ['x.y','z'], "extractColumns：点路径列名原样");
throwsField(function(){ M.extractColumns('x'); }, "rows", "extractColumns：'x' err.field='rows'");
throwsField(function(){ M.extractColumns(null); }, "rows", "extractColumns：null err.field='rows'");
throwsField(function(){ M.extractColumns([{a:1}, 5]); }, "rows[1]", "extractColumns：元素非对象 err.field='rows[1]'");
throwsField(function(){ M.extractColumns([null]); }, "rows[0]", "extractColumns：元素 null err.field='rows[0]'");

/* ---------- 3. jsonToSheet 确定性向量 ---------- */
var s1 = M.jsonToSheet([{a:1},{a:2,b:3}]);
deepEq(s1.columns, ['a','b'], "jsonToSheet：columns 逐字 ['a','b']");
deepEq(s1.rows, [[1,null],[2,3]], "jsonToSheet：rows 逐字 [[1,null],[2,3]]（缺失置 null）");
var s2 = M.jsonToSheet({name:'a'});
deepEq(s2.columns, ['name'], "jsonToSheet：单对象包成单行 columns");
deepEq(s2.rows, [['a']], "jsonToSheet：单对象包成单行 rows");
var s3 = M.jsonToSheet([{a:1,b:{c:2},tags:['x','y']},{a:9}]);
deepEq(s3.columns, ['a','b.c','tags.0','tags.1'], "jsonToSheet：嵌套展平点路径列");
deepEq(s3.rows, [[1,2,'x','y'],[9,null,null,null]], "jsonToSheet：嵌套缺失置 null");
throwsField(function(){ M.jsonToSheet('x'); }, "data", "jsonToSheet：'x' err.field='data'");
throwsField(function(){ M.jsonToSheet(42); }, "data", "jsonToSheet：数字 err.field='data'");
throwsField(function(){ M.jsonToSheet(null); }, "data", "jsonToSheet：null err.field='data'");

/* ---------- 4. buildExcelFileName 确定性向量 ---------- */
eq(M.buildExcelFileName(new Date(2026,10,2,19,30,0)), 'json_to_excel_20261102_193000.xlsx', "buildExcelFileName：2026-11-02 19:30 逐字");
eq(M.buildExcelFileName(new Date(2026,0,5,8,4,9)), 'json_to_excel_20260105_080409.xlsx', "buildExcelFileName：补零逐字");
throwsField(function(){ M.buildExcelFileName('x'); }, "now", "buildExcelFileName：'x' err.field='now'");
throwsField(function(){ M.buildExcelFileName(123); }, "now", "buildExcelFileName：数字 err.field='now'");

/* ---------- 5. locateJsonError 行列定位 ---------- */
var bad = '[\n  {"a": 1},\n  {"b": 2,}\n]';
var loc;
try { JSON.parse(bad); loc = null; } catch (e) { loc = M.locateJsonError(bad, e); }
ok(loc && loc.line === 3, "locateJsonError：定位到第 3 行（实得 " + (loc && loc.line) + "）");
ok(loc && loc.col > 0, "locateJsonError：列号为正");
var loc2 = M.locateJsonError('xxx', new Error('no position info'));
eq(loc2.line, -1, "locateJsonError：无 position 信息时 line=-1");

/* ---------- 6. window.JsonToExcel 与 module.exports 同步导出 ---------- */
["flattenValue","extractColumns","jsonToSheet","buildExcelFileName","locateJsonError","cellOf","buildWorkbook"].forEach(function (k) {
ok(typeof M[k] === "function", "module.exports 导出 " + k);
});
ok(JS_SRC.indexOf("window.JsonToExcel") !== -1, "JS 挂 window.JsonToExcel");
ok(JS_SRC.indexOf("if (typeof window !== 'undefined') window.JsonToExcel") !== -1, "window 挂载有 typeof 守卫（Node 安全）");

/* ---------- 7. 注册 ---------- */
has(GO_SRC, "\"json_to_excel\"", "注册：ID json_to_excel");
has(GO_SRC, "\"/tools/json-to-excel\"", "注册：Path /tools/json-to-excel");
var iconHits = (GO_SRC.match(/"data_array"/g) || []).length;
eq(iconHits, 1, "注册：Icon data_array 全库唯一（复测锁定）");
var regBlock = GO_SRC.split("\"json_to_excel\"")[1].split("},")[0];
has(regBlock, "Category:    \"格式转换\"", "注册：Category 格式转换");
has(regBlock, "New:         true", "注册：New: true");
has(regBlock, "Icon:        \"data_array\"", "注册：Icon data_array");
has(regBlock, "Path:        \"/tools/json-to-excel\"", "注册：Path 字段");
ok(GO_SRC.indexOf("\"json_to_excel\"") > GO_SRC.indexOf("\"csvjson\""), "注册：紧邻 csvjson 之后（格式转换簇相邻）");
ok(GO_SRC.indexOf("\"json_to_excel\"") < GO_SRC.indexOf("\"csv_table_viewer\""), "注册：位于 csv_table_viewer 之前");
has(regBlock, "JSON 转 Excel", "注册：Description 含中文关键词 JSON 转 Excel");
has(regBlock, "json to excel", "注册：Description 含英文关键词 json to excel");
has(regBlock, "JSON 数组转表格", "注册：Description 含 JSON 数组转表格");
has(regBlock, "xlsx 导出", "注册：Description 含 xlsx 导出");
var pathCount = (GO_SRC.match(/"\/tools\/[^"]+"/g) || []).filter(function (v, i, a) { return a.indexOf(v) === i; }).length;
eq(pathCount, 270, "注册：Path 总数 270→270");
notHas(GO_SRC.match(/"\/tools\/[^"]+"/g).join(" "), "/tools/json-to-excel\", \"/tools/json-to-excel", "注册：Path 无重复");

/* ---------- 8. 模板：真限制五条 ---------- */
has(TPL_SRC, "仅支持<b>数组/对象结构</b>", "真限制①：仅数组/对象结构文案");
has(TPL_SRC, "展平为点路径列名", "真限制②：点路径展平文案");
has(TPL_SRC, "user.address.city", "真限制②：点路径示例 user.address.city");
has(TPL_SRC, "tags.0", "真限制②：点路径示例 tags.0");
has(TPL_SRC, "全部列求并集", "真限制③：列并集文案");
has(TPL_SRC, "缺失单元格留空", "真限制③：缺失留空文案");
has(TPL_SRC, "20MB", "真限制④：20MB 上限文案");
has(TPL_SRC, "50000", "真限制④：5 万行上限文案");
has(TPL_SRC, "零上传", "真限制⑤：零上传文案");
has(TPL_SRC, "Network 面板自证", "真限制⑤：Network 面板自证文案");

/* ---------- 9. 模板：表格一条龙互链 ---------- */
has(TPL_SRC, "/tools/csv-json", "互链：csvjson（CSV⇄JSON 互转）");
has(TPL_SRC, "/tools/markdown-to-excel", "互链：markdown_to_excel（Markdown 表格转 Excel）");
has(TPL_SRC, "/tools/paste-table-to-csv", "互链：paste_table_to_csv（网页表格粘贴转 CSV）");
has(TPL_SRC, "表格数据一条龙", "互链：表格一条龙组合文案");

/* ---------- 10. 模板：SEO 与基础 ---------- */
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/json-to-excel", "模板 canonical 含新 Path");
has(TPL_SRC, "JSON 转 Excel", "SEO：标题含 JSON 转 Excel");
has(TPL_SRC, "json to excel", "SEO：含英文 json to excel");
has(TPL_SRC, "JSON 数组转表格", "SEO：含 JSON 数组转表格");
has(TPL_SRC, "xlsx 导出", "SEO：含 xlsx 导出");
has(TPL_SRC, "/tools/static/js/vendor/xlsx-0.18.5.umd.js", "模板引用本地 vendor xlsx");
has(TPL_SRC, "/tools/static/js/json_to_excel.js", "模板引用本站 JS");
has(TPL_SRC, "{{define \"json_to_excel\"}}", "模板 define 名 json_to_excel（路由 /tools/json-to-excel 自动映射）");

/* ---------- 11. 零网络请求 ---------- */
notHas(JS_SRC, "fetch(", "零网络：JS 无 fetch");
notHas(JS_SRC, "XMLHttpRequest", "零网络：JS 无 XHR");
notHas(JS_SRC, "new WebSocket", "零网络：JS 无 WebSocket");
notHas(JS_SRC, "sendBeacon", "零网络：JS 无 Beacon");
notHas(TPL_SRC, "fetch(", "零网络：模板无 fetch");
notHas(TPL_SRC, "http://", "零 CDN：模板无 http 外链");
notHas(TPL_SRC, "https://fonts.googleapis", "零 CDN：模板无字体 CDN");
var tplExtSrc = TPL_SRC.match(/<script[^>]+src="([^"]+)"/g) || [];
ok(tplExtSrc.every(function (t) { return t.indexOf("https://") === -1 && t.indexOf("http://") === -1; }), "零 CDN：模板 script src 全为本站相对路径");

/* ---------- 12. JS：超限与报错定位文案 ---------- */
has(JS_SRC, "20 * 1024 * 1024", "JS：20MB 上限常量");
has(JS_SRC, "50000", "JS：5 万行上限常量");
has(JS_SRC, "第 ", "JS：报错定位含「第 X 行」文案");
has(JS_SRC, "FileReader", "JS：上传走 FileReader 本地读");

console.log("\njson_to_excel: " + pass + " 通过, " + fail + " 失败");
process.exit(fail ? 1 : 0);
