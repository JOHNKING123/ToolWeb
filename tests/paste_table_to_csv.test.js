/* 网页表格粘贴转 CSV 纯逻辑单元测试（零依赖）：node tests/paste_table_to_csv.test.js
 * 覆盖：
 *  1. parseTsv 契约（确定性向量逐字；\r\n/\r/\n 分行；末尾空行丢弃；非法参数 err.field 命名：text/delimiter）
 *  2. checkColumnConsistency 契约（确定性向量逐字；不一致只报告不截断；err.field='rows'）
 *  3. escapeCsvField 契约（RFC4180；确定性向量逐字；err.field='field'）
 *  4. rowsToCsv 契约（确定性向量逐字；\r\n 行分隔；err.field='rows'）
 *  5. buildCsvDownloadName 契约（确定性向量逐字；正则；err.field='now'）
 *  6. categories.go 注册（ID/Path/Icon/Category/New）与 Path 总数 259
 *  7. 零网络请求静态检查（JS 无 fetch/XHR/WebSocket/EventSource；模板无外部 script CDN）
 *  8. 模板：SEO 面板、真限制三条、与 csv_table_viewer／csvjson／markdown_to_excel 双向互链「表格数据一条龙」
 */
"use strict";
var T = require("../static/js/paste_table_to_csv.js");
var fs = require("fs");
var path = require("path");
var ROOT = path.join(__dirname, "..");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function contains(s, sub, name) { ok(String(s).indexOf(sub) !== -1, name + "（期望包含 " + JSON.stringify(sub) + "）"); }
function notContains(s, sub, name) { ok(String(s).indexOf(sub) === -1, name + "（不应包含 " + JSON.stringify(sub) + "）"); }
function throwsField(fn, field, name) {
    try { fn(); }
    catch (e) {
        ok(e instanceof Error && e.field === field, name + "（err.field=" + field + "）");
        return;
    }
    ok(false, name + "（期望抛出 Error）");
}

/* ================= 1. parseTsv ================= */
(function () {
    eq(JSON.stringify(T.parseTsv("a\tb\n1\t2", "\t")),
        JSON.stringify([["a", "b"], ["1", "2"]]),
        "规格向量：parseTsv(\"a\\tb\\n1\\t2\",\"\\t\")→逐字命中");
    eq(JSON.stringify(T.parseTsv("a,b\r\n1,2\r\n", ",")),
        JSON.stringify([["a", "b"], ["1", "2"]]),
        "CRLF 分行＋末尾空行丢弃");
    eq(JSON.stringify(T.parseTsv("a|b\rc|d", "|")),
        JSON.stringify([["a", "b"], ["c", "d"]]),
        "CR 分行＋竖线分隔符");
    eq(JSON.stringify(T.parseTsv("x;y\n", ";")),
        JSON.stringify([["x", "y"]]),
        "单行＋结尾换行被丢弃");
    eq(JSON.stringify(T.parseTsv("a\n\nb", ",")),
        JSON.stringify([["a"], [""], ["b"]]),
        "中间空行保留为 [\"\"] 数据行");
    eq(JSON.stringify(T.parseTsv("a\tb\t\n1\t2\t3", "\t")),
        JSON.stringify([["a", "b", ""], ["1", "2", "3"]]),
        "行尾分隔符产生空字段");
    throwsField(function () { T.parseTsv("", "\t"); }, "text",
        "规格向量：parseTsv(\"\",\"\\t\") 抛 Error（err.field=text，开发轮定死）");
    throwsField(function () { T.parseTsv(null, "\t"); }, "text", "text 为 null 抛 Error（err.field=text）");
    throwsField(function () { T.parseTsv(123, "\t"); }, "text", "text 非字符串抛 Error（err.field=text）");
    throwsField(function () { T.parseTsv("a\tb", ""); }, "delimiter", "delimiter 空串抛 Error（err.field=delimiter）");
    throwsField(function () { T.parseTsv("a\tb", null); }, "delimiter", "delimiter 非字符串抛 Error（err.field=delimiter）");
    throwsField(function () { T.parseTsv("\n\n", "\t"); }, "text", "全空行文本抛 Error（err.field=text）");
})();

/* ================= 2. checkColumnConsistency ================= */
(function () {
    var r = T.checkColumnConsistency([["a", "b"], ["1"]]);
    eq(JSON.stringify(r), JSON.stringify({consistent: false, expectedCols: 2, badRows: [1]}),
        "规格向量：checkColumnConsistency([[\"a\",\"b\"],[\"1\"]])→逐字命中");
    var r2 = T.checkColumnConsistency([["a", "b"], ["1", "2"], ["3", "4"]]);
    eq(JSON.stringify(r2), JSON.stringify({consistent: true, expectedCols: 2, badRows: []}),
        "列数一致 → consistent:true，badRows 为空");
    var r3 = T.checkColumnConsistency([["a"], ["1", "2"], ["3"]]);
    eq(JSON.stringify(r3.badRows), JSON.stringify([1]),
        "多出的列也算不一致（badRows 报告行下标）");
    eq(T.checkColumnConsistency([["only"]]).expectedCols, 1, "单行：expectedCols=1 且 consistent");
    throwsField(function () { T.checkColumnConsistency([]); }, "rows", "rows 空数组抛 Error（err.field=rows）");
    throwsField(function () { T.checkColumnConsistency("x"); }, "rows", "rows 非数组抛 Error（err.field=rows）");
    throwsField(function () { T.checkColumnConsistency([["a"], "x"]); }, "rows", "某行非数组抛 Error（err.field=rows）");
})();

/* ================= 3. escapeCsvField ================= */
(function () {
    eq(T.escapeCsvField('他说"好"'), '"他说""好"""',
        "规格向量：escapeCsvField('他说\"好\"')→逐字命中");
    eq(T.escapeCsvField("plain"), "plain", "纯文本不加引号");
    eq(T.escapeCsvField(""), "", "空字段不加引号");
    eq(T.escapeCsvField("a,b"), '"a,b"', "含逗号加引号");
    eq(T.escapeCsvField("2\n3"), '"2\n3"', "含换行加引号");
    eq(T.escapeCsvField("x\ry"), '"x\ry"', "含回车加引号");
    eq(T.escapeCsvField('a"b,c\nd'), '"a""b,c\nd"', "引号翻倍＋整体加引号");
    throwsField(function () { T.escapeCsvField(123); }, "field", "field 非字符串抛 Error（err.field=field）");
    throwsField(function () { T.escapeCsvField(null); }, "field", "field 为 null 抛 Error（err.field=field）");
})();

/* ================= 4. rowsToCsv ================= */
(function () {
    eq(T.rowsToCsv([["a,b", "c"], ["1", "2\n3"]]), '"a,b",c\r\n1,"2\n3"',
        "规格向量：rowsToCsv→逐字命中（转义＋CRLF）");
    eq(T.rowsToCsv([["a", "b"]]), "a,b", "单行无尾部分隔");
    eq(T.rowsToCsv([]), "", "空数组 → 空串");
    eq(T.rowsToCsv([["他说\"好\"", "x"]]), '"他说""好""",x', "引号字段转义");
    throwsField(function () { T.rowsToCsv("x"); }, "rows", "rows 非数组抛 Error（err.field=rows）");
    throwsField(function () { T.rowsToCsv([["a"], "x"]); }, "rows", "某行非数组抛 Error（err.field=rows）");
    throwsField(function () { T.rowsToCsv([[1]]); }, "field", "非字符串字段透传 err.field=field");
})();

/* ================= 5. buildCsvDownloadName ================= */
(function () {
    eq(T.buildCsvDownloadName(new Date(2026, 10, 1, 19, 30, 5)), "table_20261101_193005.csv",
        "buildCsvDownloadName 确定性向量逐字");
    ok(/^table_\d{8}_\d{6}\.csv$/.test(T.buildCsvDownloadName()),
        "规格向量：buildCsvDownloadName 匹配 /^table_\\d{8}_\\d{6}\\.csv$/");
    eq(T.buildCsvDownloadName(new Date(2026, 0, 2, 3, 4, 5)), "table_20260102_030405.csv",
        "月份/日期/时分秒补零");
    throwsField(function () { T.buildCsvDownloadName("x"); }, "now", "now 非 Date 抛 Error（err.field=now）");
    throwsField(function () { T.buildCsvDownloadName(new Date(NaN)); }, "now", "now 为无效 Date 抛 Error（err.field=now）");
})();

/* ================= 6. categories.go 注册 ================= */
(function () {
    var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");
    var blockRe = /ID:\s*"paste_table_to_csv"[\s\S]*?Category:\s*"([^"]+)"/;
    var m = blockRe.exec(GO_SRC);
    ok(m !== null, "categories.go 含 paste_table_to_csv 注册块");
    contains(GO_SRC, 'Path:        "/tools/paste-table-to-csv"', "注册 Path 为 /tools/paste-table-to-csv");
    contains(GO_SRC, 'Icon:        "table"', "注册 Icon 为 table");
    eq((GO_SRC.match(/"table"/g) || []).length, 1, "table 全库仅本工具使用（0 占用→1）");
    eq(m ? m[1] : "", "格式转换", "注册 Category 为 格式转换");
    contains(GO_SRC, 'Name:        "网页表格粘贴转 CSV"', "注册 Name 为 网页表格粘贴转 CSV");
    ok(/ID:\s*"paste_table_to_csv"[\s\S]{0,2000}?New:\s*true/.test(GO_SRC), "注册 New: true");
    contains(GO_SRC.toLowerCase(), "paste", "Description 中英文双语（含英文）");
    var pathRe = /"\/tools\/[^"]+"/g, seen = {}, mm, pathCount = 0;
    while ((mm = pathRe.exec(GO_SRC)) !== null) { if (!seen[mm[0]]) { seen[mm[0]] = true; pathCount++; } }
    eq(pathCount, 314, "注册 Path 总数 309→310");
})();

/* ================= 7. 零网络静态检查 ================= */
(function () {
    var src = fs.readFileSync(path.join(ROOT, "static", "js", "paste_table_to_csv.js"), "utf8");
    ["fetch(", "XMLHttpRequest", "WebSocket(", "EventSource("].forEach(function (kw) {
        notContains(src, kw, "JS 内无 " + kw);
    });
    contains(src, "parseTsv", "解析走纯函数 parseTsv");
    contains(src, "checkColumnConsistency", "校验走纯函数 checkColumnConsistency");
    contains(src, "escapeCsvField", "转义走纯函数 escapeCsvField");
    contains(src, "rowsToCsv", "CSV 拼装走纯函数 rowsToCsv");
    contains(src, "buildCsvDownloadName", "CSV 文件名走纯函数 buildCsvDownloadName");
    contains(src, "navigator.clipboard", "复制优先走 navigator.clipboard");
    contains(src, "execCommand", "复制降级走 execCommand");
    contains(src, "\\uFEFF", "CSV 下载带 UTF-8 BOM");
    contains(src, "Blob", "下载走 Blob");
    contains(src, "module.exports", "Node 自测暴露纯函数");
    var tpl = fs.readFileSync(path.join(ROOT, "templates", "paste_table_to_csv.html"), "utf8");
    notContains(tpl, "fetch(", "模板内无 fetch");
    notContains(tpl, "<script src=\"http", "模板无外部 script CDN");
})();

/* ================= 8. 模板：SEO／真限制／互链 ================= */
(function () {
    var tpl = fs.readFileSync(path.join(ROOT, "templates", "paste_table_to_csv.html"), "utf8");
    /* SEO 面板 */
    contains(tpl, "<title>网页表格粘贴转 CSV", "SEO：title");
    contains(tpl, 'name="description"', "SEO：description");
    contains(tpl, 'name="keywords"', "SEO：keywords");
    contains(tpl, 'rel="canonical"', "SEO：canonical");
    contains(tpl, 'property="og:title"', "SEO：OG title");
    contains(tpl, "application/ld+json", "SEO：JSON-LD");
    contains(tpl, "https://www.johnkingzcq123.xyz/tools/paste-table-to-csv", "SEO：canonical/OG URL 为新 Path");
    contains(tpl, ">table<", "标题图标 table");
    /* 真限制三条（页面明示） */
    contains(tpl, "不直接解析 HTML DOM 表格复制", "真限制①：不直接解析 HTML DOM 表格复制");
    contains(tpl, "浏览器复制行为差异", "真限制①：浏览器复制行为差异");
    contains(tpl, "列数不一致不静默截断", "真限制②：列数不一致不静默截断");
    contains(tpl, "拒绝生成 CSV 并标出坏行号", "真限制②：拒绝生成并标坏行");
    contains(tpl, "100% 浏览器本地处理不上传", "真限制③：纯本地零上传");
    contains(tpl, "零外部请求", "真限制③：零外部请求");
    /* 互链（与 csv_table_viewer／csvjson／markdown_to_excel 双向） */
    contains(tpl, "/tools/csv-table-viewer", "与 csv_table_viewer 互链");
    contains(tpl, "/tools/csv-json", "与 csvjson 互链");
    contains(tpl, "/tools/markdown-to-excel", "与 markdown_to_excel 互链");
    contains(tpl, "表格数据一条龙", "互链文案：表格数据一条龙");
    contains(tpl, "网页表格粘贴转 CSV（当前）", "相关工具含当前态标记");
    /* 输入输出控件 */
    contains(tpl, 'id="ptc-input"', "粘贴输入框");
    contains(tpl, 'id="ptc-delim"', "分隔符选择");
    contains(tpl, 'id="ptc-parse"', "解析按钮");
    contains(tpl, 'id="ptc-sample"', "填入示例按钮");
    contains(tpl, 'id="ptc-clear"', "清空按钮");
    contains(tpl, 'id="ptc-err"', "错误提示框");
    contains(tpl, 'id="ptc-warn"', "列数不一致告警框");
    contains(tpl, 'id="ptc-preview"', "表格预览区");
    contains(tpl, 'id="ptc-count"', "行列计数");
    contains(tpl, 'id="ptc-csv"', "CSV 输出框");
    contains(tpl, 'id="ptc-copy"', "一键复制按钮");
    contains(tpl, 'id="ptc-download"', "CSV 下载按钮");
    /* 回链（双向互链另一半） */
    var ctvTpl = fs.readFileSync(path.join(ROOT, "templates", "csv_table_viewer.html"), "utf8");
    contains(ctvTpl, "/tools/paste-table-to-csv", "csv_table_viewer 模板含回链（双向互链）");
    var cjTpl = fs.readFileSync(path.join(ROOT, "templates", "csv_json.html"), "utf8");
    contains(cjTpl, "/tools/paste-table-to-csv", "csv_json 模板含回链（双向互链）");
    var m2xTpl = fs.readFileSync(path.join(ROOT, "templates", "markdown_to_excel.html"), "utf8");
    contains(m2xTpl, "/tools/paste-table-to-csv", "markdown_to_excel 模板含回链（双向互链）");
})();

console.log("\n断言通过: " + pass + ", 失败: " + fail + ", 共 " + (pass + fail));
process.exit(fail === 0 ? 0 : 1);
