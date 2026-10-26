/* CSV 表格查看器纯逻辑单元测试（零依赖）：node tests/csv_table_viewer.test.js
* 覆盖：解析正例与告警、首行表头开关与短行补空、数字／文本排序与空值置末、
* 三态切换、全局搜索与列筛选叠加、分页切片与页数、2 组示例、
* 注册（182→183 Path）与零网络请求、模板真限制文案与互链。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/csv_table_viewer.js");

var pass = 0, fail = 0;
function ok(cond, name) {
if (cond) { pass++; }
else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function has(s, sub, name) { ok(String(s).indexOf(sub) !== -1, name + "（应包含 " + JSON.stringify(sub) + "）"); }
function notHas(s, sub, name) { ok(String(s).indexOf(sub) === -1, name + "（不应包含 " + JSON.stringify(sub) + "）"); }

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "csv_table_viewer.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "csv_table_viewer.html"), "utf8");
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
eq(M.parseCSV('a,b\n1,2\n', ',').rows[1][1], "2", "解析：LF 换行正常");
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

/* ---------- 3. 排序 ---------- */
var nums = [['10'], ['2'], [''], ['30']];
eq(M.sortRows(nums, 0, 'asc').map(function (x) { return x[0]; }).join(','), "2,10,30,", "排序：数字升序按数值、空值置末");
eq(M.sortRows(nums, 0, 'desc').map(function (x) { return x[0]; }).join(','), "30,10,2,", "排序：数字降序、空值仍置末");
var texts = [['香蕉'], ['苹果'], [''], ['橙子']];
eq(M.sortRows(texts, 0, 'asc')[0][0], "橙子", "排序：文本升序按字符串");
eq(M.sortRows(texts, 0, 'desc')[0][0], "香蕉", "排序：文本降序");
eq(M.sortRows(texts, 0, null).length, 4, "排序：null 返回原序副本");
eq(M.nextSortDir(null), 'asc', "三态：null→asc");
eq(M.nextSortDir('asc'), 'desc', "三态：asc→desc");
eq(M.nextSortDir('desc'), null, "三态：desc→null");

/* ---------- 4. 筛选与搜索 ---------- */
var body = [['张伟', '研发'], ['李娜', '产品'], ['王强', '研发']];
eq(M.filterRows(body, '研发', []).length, 2, "搜索：命中任意列保留");
eq(M.filterRows(body, '', ['', '产品']).length, 1, "列筛选：单列包含匹配");
eq(M.filterRows(body, '张', ['', '研发']).length, 1, "叠加：全局搜索与列筛选 AND 生效");
eq(M.filterRows(body, '张', ['', '产品']).length, 0, "叠加：条件冲突时零行");
eq(M.filterRows(body, '', []).length, 3, "筛选：空条件不过滤");

/* ---------- 5. 分页 ---------- */
var many = [];
for (var i = 0; i < 120; i++) many.push([String(i)]);
var p1 = M.paginate(many, 1, 50);
eq(p1.pageRows.length, 50, "分页：每页 50 首行 50 条");
eq(p1.totalPages, 3, "分页：120 行每页 50 共 3 页");
eq(M.paginate(many, 3, 50).pageRows[0][0], "100", "分页：第 3 页起于第 101 行");
eq(M.paginate(many, 99, 50).page, 3, "分页：超界页码钳制到末页");
eq(M.paginate(many, 1, 200).pageRows.length, 120, "分页：每页 200 一页装下 120 行");
eq(M.paginate(many, 1, 100).totalPages, 2, "分页：每页 100 共 2 页");

/* ---------- 6. 示例 ---------- */
var emp = M.parseCSV(M.SAMPLE_EMPLOYEES, ',');
eq(emp.rows.length, 8, "示例：员工表示例 8 行含表头");
has(M.SAMPLE_EMPLOYEES, "陈,晨", "示例：员工表含引号内逗号姓名");
var ord = M.parseCSV(M.SAMPLE_ORDERS, ',');
eq(ord.rows[3][2], '显示器 27"寸', "示例：订单表转义双引号解析");
eq(ord.rows.length, 7, "示例：订单表示例 7 行含表头");

/* ---------- 7. 注册与零网络、模板文案 ---------- */
has(GO_SRC, '"csv_table_viewer"', "注册：ID csv_table_viewer");
has(GO_SRC, '"/tools/csv-table-viewer"', "注册：Path /tools/csv-table-viewer");
var pathCount = (GO_SRC.match(/"\/tools\/[^"]+"/g) || []).filter(function (v, i, a) { return a.indexOf(v) === i; }).length;
eq(pathCount, 183, "注册：Path 总数 182→183");
notHas(JS_SRC, "fetch(", "零网络：JS 无 fetch");
notHas(JS_SRC, "XMLHttpRequest", "零网络：JS 无 XHR");
notHas(TPL_SRC, "fetch(", "零网络：模板无 fetch");
notHas(TPL_SRC, "http://", "零 CDN：模板无 http 外链");
notHas(TPL_SRC, "https://fonts.googleapis", "零 CDN：模板无字体 CDN");
has(TPL_SRC, "只查看、排序、筛选", "真限制：只查看排序筛选文案");
has(TPL_SRC, "不编辑", "真限制：不编辑文案");
has(TPL_SRC, "超大文件建议先在本地拆分", "真限制：超大文件本地拆分文案");
has(TPL_SRC, "分隔符仅支持逗号／分号／制表符三选", "真限制：分隔符仅三选文案");
has(TPL_SRC, "/tools/csv-json", "互链：含 CSV⇄JSON 互转");
notHas(TPL_SRC, "csv-to-markdown", "互链：不硬凑未交付 CSV→Markdown");
has(TPL_SRC, "csv-table-viewer", "模板：canonical 与标识含 csv-table-viewer");
has(TPL_SRC, "csv_table_viewer.js", "模板：JS 文件引用");
has(JS_SRC, "textContent", "渲染：用 textContent 防 HTML 执行");

/* ---------- 8. 评审修复：列筛选焦点与示例残留 ---------- */
has(JS_SRC, "prevFilters", "修复1：重建前先快照列筛选值（旧 input 销毁后查不到）");
has(JS_SRC, "prevFilters[idx]", "修复1：新筛选框用快照恢复值而非重建中途重查");
has(JS_SRC, "document.activeElement", "修复1：重建前记录焦点所在列筛选框");
has(JS_SRC, "setSelectionRange", "修复1：重建后恢复光标位置");
has(JS_SRC, "restored.focus()", "修复1：重建后把焦点交还同列新输入框");
has(JS_SRC, "clearColFilters", "修复2：示例载入与清空共用列筛选清零");
has(JS_SRC, "clearColFilters();\nrenderAll();", "修复2：清零列筛选后才重渲染");

console.log("csv_table_viewer: pass=" + pass + " fail=" + fail);
if (fail > 0) process.exit(1);
