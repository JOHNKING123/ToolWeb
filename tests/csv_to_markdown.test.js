/* CSV→Markdown 表格生成器纯逻辑单元测试（零依赖）：node tests/csv_to_markdown.test.js
* 覆盖：解析正例与告警、表头开关与短行补空、空表头占位、对齐行三态与全部对齐、
* 竖线转义、换行展平与处数、整表生成结构、2 组示例、空输入、
* 注册（184→185 Path）与零网络请求、模板真限制文案与互链。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/csv_to_markdown.js");

var pass = 0, fail = 0;
function ok(cond, name) {
if (cond) { pass++; }
else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function has(s, sub, name) { ok(String(s).indexOf(sub) !== -1, name + "（应包含 " + JSON.stringify(sub) + "）"); }
function notHas(s, sub, name) { ok(String(s).indexOf(sub) === -1, name + "（不应包含 " + JSON.stringify(sub) + "）"); }

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "csv_to_markdown.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "csv_to_markdown.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. 解析正例 ---------- */
var r = M.parseCSV('a,b\r\n"陈,晨",2\n', ',');
eq(r.rows.length, 2, "解析：CRLF 两行");
eq(r.rows[1][0], "陈,晨", "解析：引号内逗号不切分");
eq(r.unclosedQuote, false, "解析：引号闭合无告警");
eq(M.parseCSV('a,b\n"说""好""",2\n', ',').rows[1][0], '说"好"', "解析：转义双引号还原");
eq(M.parseCSV('a,b\n"第1行\n第2行",2\n', ',').rows[1][0], "第1行\n第2行", "解析：字段内换行保留");
eq(M.parseCSV('\ufeffa,b\n1,2\n', ',').rows[0][0], "a", "解析：UTF-8 BOM 剥离");
eq(M.parseCSV('a,b\n1,2\n\n\n', ',').rows.length, 2, "解析：空尾行不计入");
eq(M.parseCSV('a;b\n1;2\n', ';').rows[1][1], "2", "解析：分号分隔符");
eq(M.parseCSV('a\tb\n1\t2\n', '\t').rows[1][1], "2", "解析：制表符分隔符");
eq(M.parseCSV('', ',').rows.length, 0, "解析：空输入零行");

/* ---------- 2. 告警与归一 ---------- */
var bad = M.parseCSV('a,b\n"未闭合,2\n', ',');
eq(bad.unclosedQuote, true, "告警：引号未闭合检出");
eq(bad.rows.length, 2, "告警：未闭合仍尽力返回已读行");
var norm = M.normalizeRows([['姓名', '月薪'], ['张伟'], ['李娜', '16200', '多余']], true);
eq(norm.headers.length, 3, "归一：表头按最宽行补空");
eq(norm.body[0][1], "", "归一：短行补空");
eq(norm.body[0].length, 3, "归一：短行补齐到最宽");
var noHeader = M.normalizeRows([['a', 'b'], ['1', '2']], false);
eq(noHeader.headers[0], "列1", "表头开关：取消后自动生成列1");
eq(noHeader.body.length, 2, "表头开关：取消后首行计入数据行");
var emptyHeader = M.normalizeRows([['姓名', '', '月薪'], ['张伟', '研发', '18500']], true);
eq(emptyHeader.headers[1], "列2", "空表头：空列用列 N 占位");
eq(emptyHeader.headers[0], "姓名", "空表头：非空列保持原名");

/* ---------- 3. 对齐行 ---------- */
eq(M.alignCell('left'), ":---", "对齐：左对齐 :---");
eq(M.alignCell('center'), ":---:", "对齐：居中 :---:");
eq(M.alignCell('right'), "---:", "对齐：右对齐 ---:");
eq(M.alignCell('bogus'), ":---", "对齐：非法值回落左对齐");
eq(M.alignCell(undefined), ":---", "对齐：缺失回落左对齐");

/* ---------- 4. 转义与展平 ---------- */
eq(M.escapeCell('a|b').text, "a\\|b", "转义：竖线转义为 \\|");
eq(M.escapeCell('a|b|c').text, "a\\|b\\|c", "转义：多竖线逐个转义");
var flat = M.escapeCell("第1行\n第2行\r\n第3行");
eq(flat.text, "第1行 第2行 第3行", "展平：换行展平为空格");
eq(flat.flattened, 2, "展平：CRLF 与 LF 各计 1 处");
eq(M.escapeCell("无换行").flattened, 0, "展平：无换行处数为 0");
eq(M.escapeCell("a\r\nb\rc").flattened, 2, "展平：CRLF 与孤 CR 各计 1 处");
eq(M.escapeCell("  两边空格  ").text, "  两边空格  ", "转义：首尾空格按原样保留");

/* ---------- 5. 整表生成 ---------- */
var full = M.generateMarkdown(['姓名', '月薪'], [['张伟', '18500'], ['李娜', '16200']], ['left', 'right']);
eq(full.markdown, "| 姓名 | 月薪 |\n| :--- | ---: |\n| 张伟 | 18500 |\n| 李娜 | 16200 |", "生成：表头行／对齐行／数据行结构正确");
eq(full.flattened, 0, "生成：无换行展平处数为 0");
var centerAll = M.generateMarkdown(['A', 'B'], [['1', '2']], ['center', 'center']);
has(centerAll.markdown, "| :---: | :---: |", "生成：全部居中对齐行同步");
var mixed = M.generateMarkdown(['A', 'B', 'C'], [['x', 'y', 'z']], ['left', 'center', 'right']);
has(mixed.markdown, "| :--- | :---: | ---: |", "生成：每列对齐单独同步");
var pipeTable = M.generateMarkdown(['商品'], [['a|b']], ['left']);
has(pipeTable.markdown, "a\\|b", "生成：数据行竖线转义");
var flatTable = M.generateMarkdown(['备注'], [["第1行\n第2行"]], ['left']);
eq(flatTable.flattened, 1, "生成：整表展平处数汇总");
has(flatTable.markdown, "第1行 第2行", "生成：整表换行展平为空格");
eq(M.generateMarkdown([], [], []).markdown, "", "生成：空表头输出空串不误导");
eq(M.buildMarkdown('', ',', true, []).markdown, "", "一站式：空输入不输出表格");
var built = M.buildMarkdown('姓名,月薪\n张伟,18500\n', ',', true, ['left', 'right']);
eq(built.headers.join(','), "姓名,月薪", "一站式：表头解析正确");
eq(built.body.length, 1, "一站式：数据行数正确");
has(built.markdown, "| ---: |", "一站式：对齐传入生成结果");
var builtNoHeader = M.buildMarkdown('张伟,18500\n', ',', false, []);
eq(builtNoHeader.headers.join(','), "列1,列2", "一站式：表头开关关闭生成列 N");
var builtBad = M.buildMarkdown('a,b\n"未闭合,2\n', ',', true, []);
eq(builtBad.unclosedQuote, true, "一站式：未闭合告警透传");

/* ---------- 6. 示例 ---------- */
var emp = M.parseCSV(M.SAMPLE_EMPLOYEES, ',');
eq(emp.rows.length, 8, "示例：员工表示例 8 行含表头");
has(M.SAMPLE_EMPLOYEES, "陈,晨", "示例：员工表含引号内逗号姓名");
var ord = M.parseCSV(M.SAMPLE_ORDERS, ',');
eq(ord.rows[3][2], '显示器 27"寸', "示例：订单表转义双引号解析");
eq(ord.rows.length, 7, "示例：订单表示例 7 行含表头");
var empMd = M.buildMarkdown(M.SAMPLE_EMPLOYEES, ',', true, ['left', 'left', 'left', 'right']);
has(empMd.markdown, "| 姓名 | 部门 | 入职年份 | 月薪 |", "示例：员工表生成表头行");
has(empMd.markdown, "| :--- | :--- | :--- | ---: |", "示例：员工表对齐行");
eq(empMd.body.length, 7, "示例：员工表数据行 7 行");

/* ---------- 7. 注册与零网络、模板文案 ---------- */
has(GO_SRC, '"csv_to_markdown"', "注册：ID csv_to_markdown");
has(GO_SRC, '"/tools/csv-to-markdown"', "注册：Path /tools/csv-to-markdown");
var pathCount = (GO_SRC.match(/"\/tools\/[^"]+"/g) || []).filter(function (v, i, a) { return a.indexOf(v) === i; }).length;
eq(pathCount, 185, "注册：Path 总数现为 185（184＋本轮新增 1）");
notHas(JS_SRC, "fetch(", "零网络：JS 无 fetch");
notHas(JS_SRC, "XMLHttpRequest", "零网络：JS 无 XHR");
notHas(TPL_SRC, "fetch(", "零网络：模板无 fetch");
notHas(TPL_SRC, "http://", "零 CDN：模板无 http 外链");
notHas(TPL_SRC, "https://fonts.googleapis", "零 CDN：模板无字体 CDN");
has(TPL_SRC, "只做表格文本生成", "真限制：只做表格文本生成文案");
has(TPL_SRC, "不回写 CSV", "真限制：不回写 CSV 文案");
has(TPL_SRC, "只做展平提示", "真限制：合并多行只做展平提示文案");
has(TPL_SRC, "分隔符仅支持逗号／分号／制表符三选", "真限制：分隔符仅三选文案");
has(TPL_SRC, "/tools/csv-table-viewer", "互链：含 CSV 表格查看器");
has(TPL_SRC, "/tools/csv-json", "互链：含 CSV⇄JSON 互转");
has(TPL_SRC, "/tools/markdown-preview", "互链：含 Markdown 预览");
has(TPL_SRC, "csv_to_markdown.js", "模板：JS 文件引用");
has(TPL_SRC, "csv-to-markdown", "模板：canonical 与标识含 csv-to-markdown");
has(JS_SRC, "textContent", "渲染：用 textContent 防 HTML 执行");

console.log("csv_to_markdown: pass=" + pass + " fail=" + fail);
if (fail > 0) process.exit(1);
