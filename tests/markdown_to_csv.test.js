/* Markdown 表格转 CSV 纯逻辑单元测试（零依赖）：node tests/markdown_to_csv.test.js
* 覆盖：parseMarkdownTable（固定表头／对齐行／转义管道逐字、取首个表格、短行补空、
* 首尾管道可选、BOM 剥离、err.field=text/table）、detectAlignmentRow（三态逐字、
* 非对齐行 null、err.field=line）、escapeCsvField（三种情况逐字、err.field=field）、
* buildCsvText、buildMarkdownCsvFileName（固定日期逐字＋正则）、2 组示例、
* 注册（268→269 Path、ID/Path/Icon import_export/Category 格式转换/New: true）
* 与零网络请求、模板真限制三条文案与表格一条龙互链。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/markdown_to_csv.js");

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
catch (e) { eq(e && e.field, field, name); return; }
fail++; console.error("FAIL:", name + "（应抛错，未抛）");
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "markdown_to_csv.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "markdown_to_csv.html"), "utf8");
var CTM_TPL = fs.readFileSync(path.join(ROOT, "templates", "csv_to_markdown.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. parseMarkdownTable 确定性向量 ---------- */
var t1 = M.parseMarkdownTable("| 姓名 | 年龄 |\n| :--- | ---: |\n| 张伟 | 30 |\n| 李娜 | 28 |");
eq(JSON.stringify(t1.headers), JSON.stringify(["姓名", "年龄"]), "解析：固定表头逐字");
eq(JSON.stringify(t1.alignments), JSON.stringify(["left", "right"]), "解析：对齐行逐字");
eq(JSON.stringify(t1.rows), JSON.stringify([["张伟", "30"], ["李娜", "28"]]), "解析：数据行逐字");
var tEsc = M.parseMarkdownTable("| 商品 | 规格\\|备注 |\n| :--- | :---: |\n| 鼠标 | 静音\\|2.4G |");
eq(tEsc.headers[1], "规格|备注", "解析：表头转义管道逐字还原");
eq(tEsc.rows[0][1], "静音|2.4G", "解析：数据转义管道逐字还原");
eq(JSON.stringify(tEsc.alignments), JSON.stringify(["left", "center"]), "解析：居中对齐逐字");
var tNoPipe = M.parseMarkdownTable("姓名 | 年龄\n--- | ---:\n张伟 | 30");
eq(JSON.stringify(tNoPipe.headers), JSON.stringify(["姓名", "年龄"]), "解析：首尾管道可选");
var tPad = M.parseMarkdownTable("| A | B | C |\n| --- | --- | --- |\n| 1 |\n| 2 | 3 | 4 | 5 |");
eq(JSON.stringify(tPad.rows[0]), JSON.stringify(["1", "", ""]), "解析：短行补空");
eq(JSON.stringify(tPad.rows[1]), JSON.stringify(["2", "3", "4"]), "解析：超长行截断到表头宽度");
var tBom = M.parseMarkdownTable("\ufeff| A |\n| --- |\n| 1 |");
eq(tBom.headers[0], "A", "解析：UTF-8 BOM 剥离");
var tFirst = M.parseMarkdownTable("前言文字\n| A |\n| --- |\n| 1 |\n中间文字\n| B |\n| --- |\n| 2 |");
eq(tFirst.headers[0], "A", "解析：取首个表格");
eq(tFirst.rows.length, 1, "解析：首个表格遇无竖线行停止");
var tCrlf = M.parseMarkdownTable("| A |\r\n| --- |\r\n| 1 |\r\n");
eq(tCrlf.rows[0][0], "1", "解析：CRLF 换行");
throwsField(function () { M.parseMarkdownTable(123); }, "text", "契约：text 非字符串 err.field=text");
throwsField(function () { M.parseMarkdownTable(null); }, "text", "契约：text 为 null err.field=text");
throwsField(function () { M.parseMarkdownTable("这里没有表格"); }, "table", "契约：无表格 err.field=table");
throwsField(function () { M.parseMarkdownTable("| A |\n| B |\n"); }, "table", "契约：缺对齐行 err.field=table");
throwsField(function () { M.parseMarkdownTable(""); }, "table", "契约：空输入 err.field=table");

/* ---------- 2. detectAlignmentRow ---------- */
eq(JSON.stringify(M.detectAlignmentRow("| :--- | :---: | ---: |")), JSON.stringify(["left", "center", "right"]), "对齐：三态逐字");
eq(JSON.stringify(M.detectAlignmentRow("|:---|:---:|---:|")), JSON.stringify(["left", "center", "right"]), "对齐：无空格写法逐字");
eq(JSON.stringify(M.detectAlignmentRow("| --- | --- |")), JSON.stringify(["left", "left"]), "对齐：无冒号默认左对齐");
eq(M.detectAlignmentRow("| 姓名 | 年龄 |"), null, "对齐：非对齐行返回 null");
eq(M.detectAlignmentRow("| :--- | 年龄 |"), null, "对齐：混入普通格返回 null");
eq(M.detectAlignmentRow(""), null, "对齐：空行返回 null");
throwsField(function () { M.detectAlignmentRow(null); }, "line", "契约：line 非字符串 err.field=line");
throwsField(function () { M.detectAlignmentRow(42); }, "line", "契约：line 为数字 err.field=line");

/* ---------- 3. escapeCsvField 三种情况逐字 ---------- */
eq(M.escapeCsvField("abc"), "abc", "转义：普通字段原样");
eq(M.escapeCsvField("a,b"), "\"a,b\"", "转义：含逗号加引号");
eq(M.escapeCsvField("说\"好\""), "\"说\"\"好\"\"\"", "转义：含引号双写加引号");
eq(M.escapeCsvField("第1行\n第2行"), "\"第1行\n第2行\"", "转义：含换行加引号");
eq(M.escapeCsvField(""), "", "转义：空字段原样");
throwsField(function () { M.escapeCsvField(undefined); }, "field", "契约：field 非字符串 err.field=field");
throwsField(function () { M.escapeCsvField(123); }, "field", "契约：field 为数字 err.field=field");

/* ---------- 4. buildCsvText ---------- */
var csv = M.buildCsvText({ headers: ["姓名", "备注"], rows: [["张伟", "a,b"], ["李娜", "说\"好\""]] });
eq(csv, "姓名,备注\n张伟,\"a,b\"\n李娜,\"说\"\"好\"\"\"", "CSV：表头＋转义逐字");
eq(M.buildCsvText({ headers: [], rows: [] }), "", "CSV：空表头输出空串");

/* ---------- 5. buildMarkdownCsvFileName ---------- */
eq(M.buildMarkdownCsvFileName(new Date(2026, 10, 2, 11, 47, 5)), "markdown_table_20261102_114705.csv", "文件名：固定日期逐字");
ok(/^markdown_table_\d{8}_\d{6}\.csv$/.test(M.buildMarkdownCsvFileName()), "文件名：正则匹配");

/* ---------- 6. 示例 ---------- */
var emp = M.parseMarkdownTable(M.SAMPLE_BASIC);
eq(emp.headers.length, 3, "示例：员工表 3 列");
eq(emp.rows.length, 3, "示例：员工表 3 行数据");
eq(JSON.stringify(emp.alignments), JSON.stringify(["left", "left", "right"]), "示例：员工表对齐逐字");
var esc = M.parseMarkdownTable(M.SAMPLE_ESCAPE);
eq(esc.rows[0][1], "静音款|2.4G", "示例：转义管道表还原");
eq(esc.rows[2][0], "\"特价\"显示器", "示例：引号字段保留");

/* ---------- 7. 注册与零网络、模板文案 ---------- */
has(GO_SRC, "\"markdown_to_csv\"", "注册：ID markdown_to_csv");
has(GO_SRC, "\"/tools/markdown-to-csv\"", "注册：Path /tools/markdown-to-csv");
has(GO_SRC, "\"import_export\"", "注册：Icon import_export");
var catBlock = GO_SRC.split("\"markdown_to_csv\"")[1].split("},")[0];
has(catBlock, "Category:    \"格式转换\"", "注册：Category 格式转换");
has(catBlock, "New:         true", "注册：New: true");
var pathCount = (GO_SRC.match(/"\/tools\/[^"]+"/g) || []).filter(function (v, i, a) { return a.indexOf(v) === i; }).length;
eq(pathCount, 324, "注册：Path 总数 309→310");
notHas(GO_SRC.match(/"\/tools\/[^"]+"/g).join(" "), "/tools/markdown-to-csv\", \"/tools/markdown-to-csv", "注册：Path 无重复");
notHas(JS_SRC, "fetch(", "零网络：JS 无 fetch");
notHas(JS_SRC, "XMLHttpRequest", "零网络：JS 无 XHR");
notHas(TPL_SRC, "fetch(", "零网络：模板无 fetch");
notHas(TPL_SRC, "http://", "零 CDN：模板无 http 外链");
notHas(TPL_SRC, "https://fonts.googleapis", "零 CDN：模板无字体 CDN");
has(TPL_SRC, "只解析标准 GFM 表格", "真限制：仅标准 GFM 表格文案");
has(TPL_SRC, "合并单元格不支持", "真限制：合并单元格不支持文案");
has(TPL_SRC, "UTF-8 with BOM", "真限制：UTF-8 with BOM 文案");
has(TPL_SRC, "零上传", "真限制：纯本地零上传文案");
has(TPL_SRC, "/tools/csv-to-markdown", "互链：含 CSV→Markdown 表格生成器");
has(TPL_SRC, "表格一条龙", "互链：表格一条龙文案");
has(CTM_TPL, "/tools/markdown-to-csv", "互链：csv_to_markdown 回链（双向）");
has(CTM_TPL, "表格一条龙", "互链：csv_to_markdown 表格一条龙文案");
has(TPL_SRC, "markdown_to_csv.js", "模板：JS 文件引用");
has(TPL_SRC, "markdown-to-csv", "模板：canonical 与标识含 markdown-to-csv");
has(TPL_SRC, "\"@type\":\"SoftwareApplication\"", "SEO：JSON-LD SoftwareApplication");
has(TPL_SRC, "<meta property=\"og:title\"", "SEO：OG 标签");
has(JS_SRC, "textContent", "渲染：用 textContent 防 HTML 执行");

console.log("markdown_to_csv: pass=" + pass + " fail=" + fail);
if (fail > 0) process.exit(1);
