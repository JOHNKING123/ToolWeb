/* Excel 查看器纯逻辑单元测试（真 xlsx round-trip）：node tests/xlsx_viewer.test.js
* 覆盖：parseWorkbook 真实 xlsx round-trip（单表 header ['姓名','年龄']、
* rows[0] ['张三',28]、双表、空行剔除、短行补空、合并格展开、公式缓存值、
* 日期序列值、CSV 解析、损坏文件 err.field='buf'、非法参数 err.field）、
* formatCellValue（序列号/布尔/空值/日期）、sortRows（数字按数值、空值置末、
* 原数组不改、三态）、searchRows（大小写不敏感）、paginateRows（10 行/3 每页
* totalPages 4）、rowsToCSV（RFC4180 引号双写精确值）、rowsToTSV、
* buildSampleWorkbook（三 kind 首列 '日期'/'星期'/'姓名'）、workbookStats、
* isSupportedFile、window.XlsxViewer 与 module.exports 同步导出、注册
* （Path 总数 322→323、ID/Path/Icon view_module 全库唯一/Category 格式转换/
* New: true/紧邻 csv_table_viewer）、模板真限制五条与零外部静态资源、
* csv-table-viewer＋sheet_split＋sheet_merge＋json-to-excel 互链与分工、
* SEO 中英文关键词。 */
"use strict";
var fs = require("fs");
var path = require("path");
var XLSX = require("../static/js/vendor/xlsx-0.18.5.umd.js");
var M = require("../static/js/xlsx_viewer.js");

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
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "xlsx_viewer.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "xlsx_viewer.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

eq(XLSX.version, "0.18.5", "前置：vendor SheetJS 版本 0.18.5");

/* ---------- 1. parseWorkbook 真实 xlsx round-trip：单表 ---------- */
function makeWb() {
  var wb = XLSX.utils.book_new();
  var ws = XLSX.utils.aoa_to_sheet([["姓名", "年龄"], ["张三", 28], ["李四", 30]]);
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return wb;
}
var buf1 = XLSX.write(makeWb(), { bookType: "xlsx", type: "buffer" });
var p1 = M.parseWorkbook(XLSX, buf1, "test.xlsx");
eq(p1.sheets.length, 1, "parseWorkbook 单表：1 个工作表");
eq(p1.sheets[0].name, "Sheet1", "parseWorkbook 单表：表名 Sheet1");
deepEq(p1.sheets[0].header, ["姓名", "年龄"], "parseWorkbook 单表：header ['姓名','年龄']");
deepEq(p1.sheets[0].rows[0], ["张三", 28], "parseWorkbook 单表：rows[0] ['张三',28]");
deepEq(p1.sheets[0].rows[1], ["李四", 30], "parseWorkbook 单表：rows[1] ['李四',30]");
eq(p1.sheets[0].ncols, 2, "parseWorkbook 单表：ncols 2");
eq(p1.sheets[0].rows.length, 2, "parseWorkbook 单表：2 行数据");

/* ---------- 2. parseWorkbook 双表 ---------- */
var wb2 = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb2, XLSX.utils.aoa_to_sheet([["a"], [1]]), "第一表");
XLSX.utils.book_append_sheet(wb2, XLSX.utils.aoa_to_sheet([["x", "y"], [2, 3], [4, 5]]), "第二表");
var p2 = M.parseWorkbook(XLSX, XLSX.write(wb2, { bookType: "xlsx", type: "buffer" }), "two.xlsx");
eq(p2.sheets.length, 2, "parseWorkbook 双表：2 个工作表");
eq(p2.sheets[0].name, "第一表", "parseWorkbook 双表：首表名 第一表");
eq(p2.sheets[1].name, "第二表", "parseWorkbook 双表：次表名 第二表");
deepEq(p2.sheets[1].header, ["x", "y"], "parseWorkbook 双表：次表 header");
deepEq(p2.sheets[1].rows, [[2, 3], [4, 5]], "parseWorkbook 双表：次表 rows 逐字");

/* ---------- 3. parseWorkbook 空行剔除＋短行补空 ---------- */
var wb3 = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb3, XLSX.utils.aoa_to_sheet([["姓名", "年龄", "城市"], [], ["张三", 28], ["李四"], [], []]), "S");
var p3 = M.parseWorkbook(XLSX, XLSX.write(wb3, { bookType: "xlsx", type: "buffer" }), "empty.xlsx");
eq(p3.sheets[0].rows.length, 2, "parseWorkbook 空行剔除：中间与尾部全空行剔除后剩 2 行");
deepEq(p3.sheets[0].rows[0], ["张三", 28, ""], "parseWorkbook 短行补空：首行按最宽行补空");
deepEq(p3.sheets[0].rows[1], ["李四", "", ""], "parseWorkbook 短行补空：短行补空串");
eq(p3.sheets[0].ncols, 3, "parseWorkbook 短行补空：ncols 3");

/* ---------- 4. parseWorkbook 合并格展开＋公式缓存值＋日期序列值 ---------- */
var wb4 = XLSX.utils.book_new();
var ws4 = XLSX.utils.aoa_to_sheet([["标题", null], ["张三", 28], ["李四", 30]]);
ws4["B2"] = { f: "A2+1", v: 29, t: "n" };
ws4["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
XLSX.utils.book_append_sheet(wb4, ws4, "S");
var wb4b = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb4b, XLSX.utils.aoa_to_sheet([["日期", "事项"], [45658, "开会"]]), "D");
var p4 = M.parseWorkbook(XLSX, XLSX.write(wb4, { bookType: "xlsx", type: "buffer" }), "merge.xlsx");
deepEq(p4.sheets[0].header, ["标题", "标题"], "parseWorkbook 合并格展开：合并区每格都填左上角值");
eq(p4.sheets[0].rows[0][1], 29, "parseWorkbook 公式缓存值：公式只显缓存值 29，不重算");
var p4b = M.parseWorkbook(XLSX, XLSX.write(wb4b, { bookType: "xlsx", type: "buffer" }), "date.xlsx");
eq(p4b.sheets[0].rows[0][0], 45658, "parseWorkbook 日期序列值：45658 原样为数字");
eq(typeof p4b.sheets[0].rows[0][0], "number", "parseWorkbook 日期序列值：类型为 number");

/* ---------- 5. parseWorkbook CSV 解析 ---------- */
var p5 = M.parseWorkbook(XLSX, "姓名,年龄\n张三,28\n李四,30", "a.csv");
eq(p5.sheets.length, 1, "parseWorkbook CSV：1 个工作表");
eq(p5.sheets[0].name, "Sheet1", "parseWorkbook CSV：表名 Sheet1");
deepEq(p5.sheets[0].header, ["姓名", "年龄"], "parseWorkbook CSV：header");
deepEq(p5.sheets[0].rows[0], ["张三", 28], "parseWorkbook CSV：rows[0] 逐字（数字类型推断）");
var p5b = M.parseWorkbook(XLSX, Buffer.from("a,b\n1,2", "utf8"), "b.CSV");
deepEq(p5b.sheets[0].header, ["a", "b"], "parseWorkbook CSV：大写后缀 .CSV 同样识别");

/* ---------- 6. parseWorkbook 损坏文件与非法参数 ---------- */
throwsField(function () { M.parseWorkbook(XLSX, Buffer.from("not a zip at all, garbage"), "t.xlsx"); }, "buf", "parseWorkbook 损坏文件：纯文本冒充 .xlsx err.field='buf'");
throwsField(function () { M.parseWorkbook(XLSX, Buffer.alloc(0), "t.xlsx"); }, "buf", "parseWorkbook 损坏文件：空文件 .xlsx err.field='buf'");
throwsField(function () { M.parseWorkbook(XLSX, Buffer.from("garbage"), "t.xls"); }, "buf", "parseWorkbook 损坏文件：纯文本冒充 .xls err.field='buf'");
throwsField(function () { M.parseWorkbook(XLSX, Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]), "t.xlsx"); }, "buf", "parseWorkbook 损坏文件：PK 头残缺 ZIP err.field='buf'");
throwsField(function () { M.parseWorkbook(null, buf1, "t.xlsx"); }, "XLSX", "parseWorkbook 非法参数：XLSX 为 null err.field='XLSX'");
throwsField(function () { M.parseWorkbook({}, buf1, "t.xlsx"); }, "XLSX", "parseWorkbook 非法参数：XLSX 无 read err.field='XLSX'");
throwsField(function () { M.parseWorkbook(XLSX, null, "t.xlsx"); }, "buf", "parseWorkbook 非法参数：buf 为 null err.field='buf'");
throwsField(function () { M.parseWorkbook(XLSX, 123, "t.xlsx"); }, "buf", "parseWorkbook 非法参数：buf 为数字 err.field='buf'");
throwsField(function () { M.parseWorkbook(XLSX, buf1, ""); }, "fileName", "parseWorkbook 非法参数：fileName 为空 err.field='fileName'");
throwsField(function () { M.parseWorkbook(XLSX, buf1, null); }, "fileName", "parseWorkbook 非法参数：fileName 为 null err.field='fileName'");

/* ---------- 7. formatCellValue ---------- */
eq(M.formatCellValue(45658), "45658", "formatCellValue：日期序列值 45658 原样显示");
eq(M.formatCellValue(28), "28", "formatCellValue：数字转字符串");
eq(M.formatCellValue("张三"), "张三", "formatCellValue：字符串原样");
eq(M.formatCellValue(true), "TRUE", "formatCellValue：布尔 true 显示 TRUE");
eq(M.formatCellValue(false), "FALSE", "formatCellValue：布尔 false 显示 FALSE");
eq(M.formatCellValue(null), "", "formatCellValue：null 显示空串");
eq(M.formatCellValue(undefined), "", "formatCellValue：undefined 显示空串");
eq(M.formatCellValue(""), "", "formatCellValue：空串显示空串");
eq(M.formatCellValue(0), "0", "formatCellValue：0 显示 0");
eq(M.formatCellValue(new Date(2025, 0, 1)), "2025-01-01", "formatCellValue：Date 显示 YYYY-MM-DD");

/* ---------- 8. sortRows ---------- */
var sortIn = [["b", 10], ["a", 2], ["c", ""], ["d", 5]];
var sortInCopy = JSON.stringify(sortIn);
deepEq(M.sortRows(sortIn, 1, "asc"), [["a", 2], ["d", 5], ["b", 10], ["c", ""]], "sortRows：数字按数值升序");
deepEq(M.sortRows(sortIn, 1, "desc"), [["b", 10], ["d", 5], ["a", 2], ["c", ""]], "sortRows：数字按数值降序");
deepEq(M.sortRows(sortIn, 1, "asc")[3], ["c", ""], "sortRows：空值升序置末");
deepEq(M.sortRows(sortIn, 1, "desc")[3], ["c", ""], "sortRows：空值降序仍置末");
eq(JSON.stringify(sortIn), sortInCopy, "sortRows：原数组不改");
deepEq(M.sortRows(sortIn, 0, "asc"), [["a", 2], ["b", 10], ["c", ""], ["d", 5]], "sortRows：文本列按字符串升序");
deepEq(M.sortRows(sortIn, 0, null), sortIn, "sortRows：dir null 返回原序副本");
ok(M.sortRows(sortIn, 0, null) !== sortIn, "sortRows：dir null 返回的是副本不是原数组");
deepEq(M.sortRows([["x", "  "]], 1, "asc"), [["x", "  "]], "sortRows：单行全空白不崩");
throwsField(function () { M.sortRows("x", 0, "asc"); }, "rows", "sortRows：rows 非数组 err.field='rows'");
throwsField(function () { M.sortRows([], -1, "asc"); }, "colIdx", "sortRows：colIdx 负数 err.field='colIdx'");
throwsField(function () { M.sortRows([], "0", "asc"); }, "colIdx", "sortRows：colIdx 字符串 err.field='colIdx'");
throwsField(function () { M.sortRows([], 0, "up"); }, "dir", "sortRows：dir 非法 err.field='dir'");

/* ---------- 9. nextSortDir ---------- */
eq(M.nextSortDir(null), "asc", "nextSortDir：null→asc");
eq(M.nextSortDir("asc"), "desc", "nextSortDir：asc→desc");
eq(M.nextSortDir("desc"), null, "nextSortDir：desc→null");

/* ---------- 10. searchRows ---------- */
var sea = [["张三", "Sales"], ["李娜", "sales"], ["王强", "研发"]];
deepEq(M.searchRows(sea, "SALES"), [["张三", "Sales"], ["李娜", "sales"]], "searchRows：大小写不敏感");
deepEq(M.searchRows(sea, "sales"), [["张三", "Sales"], ["李娜", "sales"]], "searchRows：小写同样命中");
deepEq(M.searchRows(sea, "张三"), [["张三", "Sales"]], "searchRows：中文命中");
deepEq(M.searchRows(sea, ""), sea, "searchRows：空查询返回全部");
ok(M.searchRows(sea, "") !== sea, "searchRows：空查询返回的是副本");
deepEq(M.searchRows(sea, "不存在"), [], "searchRows：无命中返回空数组");
deepEq(M.searchRows(sea, "28"), [], "searchRows：数字需按显示值匹配");
deepEq(M.searchRows([["a", 28]], "28"), [["a", 28]], "searchRows：数字按显示值可搜");
throwsField(function () { M.searchRows("x", "a"); }, "rows", "searchRows：rows 非数组 err.field='rows'");

/* ---------- 11. paginateRows ---------- */
var ten = [];
for (var i = 0; i < 10; i++) ten.push([i + 1]);
var pg1 = M.paginateRows(ten, 1, 3);
eq(pg1.totalPages, 4, "paginateRows：10 行/3 每页 totalPages 4");
deepEq(pg1.pageRows, [[1], [2], [3]], "paginateRows：第 1 页行逐字");
eq(pg1.page, 1, "paginateRows：第 1 页 page=1");
eq(pg1.totalRows, 10, "paginateRows：totalRows 10");
var pg4 = M.paginateRows(ten, 4, 3);
deepEq(pg4.pageRows, [[10]], "paginateRows：第 4 页仅剩 1 行");
eq(pg4.totalPages, 4, "paginateRows：第 4 页 totalPages 仍 4");
var pg99 = M.paginateRows(ten, 99, 3);
eq(pg99.page, 4, "paginateRows：页码超限钳制到末页");
deepEq(pg99.pageRows, [[10]], "paginateRows：钳制后行逐字");
var pg0 = M.paginateRows(ten, 0, 3);
eq(pg0.page, 1, "paginateRows：页码 0 钳制到首页");
var pg100 = M.paginateRows(ten, 1, 100);
eq(pg100.totalPages, 1, "paginateRows：每页 100 行时 10 行仅 1 页");
eq(pg100.pageRows.length, 10, "paginateRows：每页 100 行全量返回");
throwsField(function () { M.paginateRows(ten, 1, 0); }, "pageSize", "paginateRows：pageSize 0 err.field='pageSize'");
throwsField(function () { M.paginateRows(ten, 1, "3"); }, "pageSize", "paginateRows：pageSize 字符串 err.field='pageSize'");
throwsField(function () { M.paginateRows("x", 1, 3); }, "rows", "paginateRows：rows 非数组 err.field='rows'");

/* ---------- 12. rowsToCSV（RFC4180） ---------- */
eq(M.rowsToCSV([["姓名", "备注"], ["张三", "他说\"好\""]]), "姓名,备注\r\n张三,\"他说\"\"好\"\"\"\r\n", "rowsToCSV：引号双写精确值");
eq(M.rowsToCSV([["a", "b"], ["x,y", "z"]]), "a,b\r\n\"x,y\",z\r\n", "rowsToCSV：含逗号字段加引号精确值");
eq(M.rowsToCSV([["a"], ["line1\nline2"]]), "a\r\n\"line1\nline2\"\r\n", "rowsToCSV：含换行字段加引号精确值");
eq(M.rowsToCSV([["a", "b"], ["x", 28], ["y", true]]), "a,b\r\nx,28\r\ny,TRUE\r\n", "rowsToCSV：数字与布尔按显示值");
eq(M.rowsToCSV([]), "", "rowsToCSV：空表返回空串");
eq(M.rowsToCSV([["a", "b"]]), "a,b\r\n", "rowsToCSV：单行末尾 CRLF");
throwsField(function () { M.rowsToCSV("x"); }, "aoa", "rowsToCSV：aoa 非数组 err.field='aoa'");
throwsField(function () { M.rowsToCSV([["a"], "x"]); }, "aoa", "rowsToCSV：行非数组 err.field='aoa'");

/* ---------- 13. rowsToTSV ---------- */
eq(M.rowsToTSV([["a", "b"], ["x", "y"]]), "a\tb\nx\ty", "rowsToTSV：制表符分隔精确值");
eq(M.rowsToTSV([["a", "b\tc"], ["x\ny", "z"]]), "a\tb c\nx y\tz", "rowsToTSV：单元格内制表符与换行替换为空格");
eq(M.rowsToTSV([]), "", "rowsToTSV：空表返回空串");
throwsField(function () { M.rowsToTSV("x"); }, "aoa", "rowsToTSV：aoa 非数组 err.field='aoa'");

/* ---------- 14. buildSampleWorkbook ---------- */
["sales", "schedule", "contacts"].forEach(function (kind) {
  var wb = M.buildSampleWorkbook(XLSX, kind);
  ok(wb && wb.SheetNames && wb.SheetNames.length === 1, "buildSampleWorkbook " + kind + "：单表工作簿");
});
function sampleHeader(kind) {
  var wb = M.buildSampleWorkbook(XLSX, kind);
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 })[0];
}
eq(sampleHeader("sales")[0], "日期", "buildSampleWorkbook：sales 首列 '日期'");
eq(sampleHeader("schedule")[0], "星期", "buildSampleWorkbook：schedule 首列 '星期'");
eq(sampleHeader("contacts")[0], "姓名", "buildSampleWorkbook：contacts 首列 '姓名'");
deepEq(sampleHeader("sales"), ["日期", "商品", "数量", "单价", "金额"], "buildSampleWorkbook：sales 表头逐字");
deepEq(sampleHeader("schedule"), ["星期", "第一节", "第二节", "第三节", "第四节"], "buildSampleWorkbook：schedule 表头逐字");
deepEq(sampleHeader("contacts"), ["姓名", "电话", "邮箱", "城市"], "buildSampleWorkbook：contacts 表头逐字");
var swb = M.buildSampleWorkbook(XLSX, "sales");
var sp = M.parseWorkbook(XLSX, XLSX.write(swb, { bookType: "xlsx", type: "buffer" }), "sample.xlsx");
eq(sp.sheets[0].rows.length, 8, "buildSampleWorkbook：sales 示例 8 行数据");
deepEq(sp.sheets[0].rows[0], [45658, "无线鼠标", 12, 89, 1068], "buildSampleWorkbook：sales 首行逐字（日期为序列值）");
throwsField(function () { M.buildSampleWorkbook(XLSX, "nope"); }, "kind", "buildSampleWorkbook：非法 kind err.field='kind'");
throwsField(function () { M.buildSampleWorkbook(null, "sales"); }, "XLSX", "buildSampleWorkbook：XLSX 无效 err.field='XLSX'");

/* ---------- 15. workbookStats ---------- */
var st = M.workbookStats(p2, 12345);
eq(st.fileSize, 12345, "workbookStats：fileSize 原样");
eq(st.sheets, 2, "workbookStats：表数 2");
eq(st.rows, 3, "workbookStats：数据行总数 3");
eq(st.cols, 2, "workbookStats：列数取最大值 2");
eq(st.cells, 8, "workbookStats：单元格数 8（含表头行：(1+1)*1+(2+1)*2=8）");
throwsField(function () { M.workbookStats(null, 1); }, "parsed", "workbookStats：parsed 无效 err.field='parsed'");
throwsField(function () { M.workbookStats(p2, -1); }, "fileSize", "workbookStats：fileSize 负数 err.field='fileSize'");
throwsField(function () { M.workbookStats(p2, "x"); }, "fileSize", "workbookStats：fileSize 字符串 err.field='fileSize'");

/* ---------- 16. isSupportedFile ---------- */
ok(M.isSupportedFile("a.xlsx"), "isSupportedFile：.xlsx 支持");
ok(M.isSupportedFile("a.XLSX"), "isSupportedFile：大写 .XLSX 支持");
ok(M.isSupportedFile("a.xls"), "isSupportedFile：.xls 支持");
ok(M.isSupportedFile("a.csv"), "isSupportedFile：.csv 支持");
ok(!M.isSupportedFile("a.txt"), "isSupportedFile：.txt 不支持");
ok(!M.isSupportedFile("a.xlsx.bak"), "isSupportedFile：.xlsx.bak 不支持");
ok(!M.isSupportedFile(""), "isSupportedFile：空名不支持");

/* ---------- 17. 常量与同步导出 ---------- */
eq(M.MAX_FILE_SIZE, 20 * 1024 * 1024, "常量：MAX_FILE_SIZE 20MB");
eq(M.MAX_ROWS_NOTICE, 5000, "常量：MAX_ROWS_NOTICE 5000 行");
eq(M.PAGE_SIZE, 100, "常量：PAGE_SIZE 100 行");
["parseWorkbook", "formatCellValue", "sortRows", "nextSortDir", "searchRows", "paginateRows", "rowsToCSV", "rowsToTSV", "workbookStats", "isSupportedFile", "buildSampleWorkbook"].forEach(function (k) {
  ok(typeof M[k] === "function", "module.exports 导出 " + k);
});
ok(JS_SRC.indexOf("window.XlsxViewer") !== -1, "JS 挂 window.XlsxViewer");
ok(JS_SRC.indexOf("if (typeof window !== 'undefined') window.XlsxViewer") !== -1, "window 挂载有 typeof 守卫（Node 安全）");

/* ---------- 18. 注册 ---------- */
has(GO_SRC, "\"xlsx_viewer\"", "注册：ID xlsx_viewer");
has(GO_SRC, "\"/tools/xlsx-viewer\"", "注册：Path /tools/xlsx-viewer");
var iconHits = (GO_SRC.match(/"view_module"/g) || []).length;
eq(iconHits, 1, "注册：Icon view_module 全库唯一（官方 codepoints e8f0，复测锁定）");
var regBlock = GO_SRC.split("\"xlsx_viewer\"")[1].split("},")[0];
has(regBlock, "Category:    \"格式转换\"", "注册：Category 格式转换");
has(regBlock, "New:         true", "注册：New: true");
has(regBlock, "Icon:        \"view_module\"", "注册：Icon view_module");
has(regBlock, "Path:        \"/tools/xlsx-viewer\"", "注册：Path 字段");
ok(GO_SRC.indexOf("\"xlsx_viewer\"") > GO_SRC.indexOf("\"csv_table_viewer\""), "注册：紧邻 csv_table_viewer 之后（格式转换簇相邻）");
ok(GO_SRC.indexOf("\"xlsx_viewer\"") < GO_SRC.indexOf("\"model_3d_viewer\""), "注册：位于 model_3d_viewer 之前");
has(regBlock, "Excel 查看器", "注册：Description 含 Excel 查看器");
has(regBlock, "Excel 在线查看", "注册：Description 含 Excel 在线查看");
has(regBlock, "XLSX 预览", "注册：Description 含 XLSX 预览");
has(regBlock, "在线打开 Excel", "注册：Description 含在线打开 Excel");
has(regBlock, "xlsx", "注册：Description 含 xlsx");
var pathCount = (GO_SRC.match(/"\/tools\/[^"]+"/g) || []).filter(function (v, i, a) { return a.indexOf(v) === i; }).length;
eq(pathCount, 327, "注册：Path 总数 322→323");
notHas(GO_SRC.match(/"\/tools\/[^"]+"/g).join(" "), "/tools/xlsx-viewer\", \"/tools/xlsx-viewer", "注册：Path 无重复");

/* ---------- 19. 模板：真限制五条 ---------- */
has(TPL_SRC, "只查看、不编辑", "真限制①：只查看不编辑文案");
has(TPL_SRC, "公式不重算", "真限制①：公式不重算文案");
has(TPL_SRC, "缓存值", "真限制①：缓存值文案");
has(TPL_SRC, "透视表、图表、宏、条件格式不渲染", "真限制②：透视/图表/宏/条件格式不渲染文案");
has(TPL_SRC, "合并单元格展开显示", "真限制③：合并格展开显示文案");
has(TPL_SRC, "20MB", "真限制④：20MB 上限文案");
has(TPL_SRC, "5000", "真限制④：5000 行分页提示文案");
has(TPL_SRC, "零上传", "真限制⑤：零上传文案");
has(TPL_SRC, "Network 面板自证", "真限制⑤：Network 面板自证文案");
has(TPL_SRC, ".xls 旧格式解析或有缺失", "真限制⑤：.xls 旧格式或有缺失文案");

/* ---------- 20. 模板：互链与分工 ---------- */
has(TPL_SRC, "/tools/csv-table-viewer", "互链：csv_table_viewer（CSV 表格查看器）");
has(TPL_SRC, "/tools/sheet-split", "互链：sheet_split（表格拆分）");
has(TPL_SRC, "/tools/sheet-merge", "互链：sheet_merge（表格合并）");
has(TPL_SRC, "/tools/json-to-excel", "互链：json_to_excel（JSON 转 Excel）");
has(TPL_SRC, "只做查看", "互链：分工明示只做查看");
has(TPL_SRC, "表格数据一条龙", "互链：表格一条龙组合文案");

/* ---------- 21. 模板：SEO 与基础 ---------- */
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/xlsx-viewer", "模板 canonical 含新 Path");
has(TPL_SRC, "Excel 在线查看", "SEO：含 Excel 在线查看");
has(TPL_SRC, "XLSX 预览", "SEO：含 XLSX 预览");
has(TPL_SRC, "在线打开 Excel", "SEO：含在线打开 Excel");
has(TPL_SRC, "Excel 查看器", "SEO：标题含 Excel 查看器");
has(TPL_SRC, "xlsx viewer", "SEO：含英文 xlsx viewer");
has(TPL_SRC, "/tools/static/js/vendor/xlsx-0.18.5.umd.js", "模板引用本地 vendor xlsx");
has(TPL_SRC, "/tools/static/js/xlsx_viewer.js", "模板引用本站 JS");
has(TPL_SRC, "{{define \"xlsx_viewer\"}}", "模板 define 名 xlsx_viewer（路由 /tools/xlsx-viewer 自动映射）");

/* ---------- 22. 零网络请求 ---------- */
notHas(JS_SRC, "fetch(", "零网络：JS 无 fetch");
notHas(JS_SRC, "XMLHttpRequest", "零网络：JS 无 XHR");
notHas(JS_SRC, "new WebSocket", "零网络：JS 无 WebSocket");
notHas(JS_SRC, "sendBeacon", "零网络：JS 无 Beacon");
notHas(TPL_SRC, "fetch(", "零网络：模板无 fetch");
notHas(TPL_SRC, "http://", "零 CDN：模板无 http 外链");
notHas(TPL_SRC, "https://fonts.googleapis", "零 CDN：模板无字体 CDN");
var tplExtSrc = TPL_SRC.match(/<script[^>]+src="([^"]+)"/g) || [];
ok(tplExtSrc.every(function (t) { return t.indexOf("https://") === -1 && t.indexOf("http://") === -1; }), "零 CDN：模板 script src 全为本站相对路径");

/* ---------- 23. JS：超限与分页常量 ---------- */
has(JS_SRC, "20 * 1024 * 1024", "JS：20MB 上限常量");
has(JS_SRC, "5000", "JS：5000 行提示常量");
has(JS_SRC, "PAGE_SIZE = 100", "JS：每页 100 行常量");
has(JS_SRC, "FileReader", "JS：上传走 FileReader 本地读");
has(JS_SRC, "arrayBuffer", "JS：文件走 arrayBuffer 本地读");

console.log("\nxlsx_viewer: " + pass + " 通过, " + fail + " 失败");
process.exit(fail ? 1 : 0);
