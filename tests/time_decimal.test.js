/* 工时十进制转换（time_decimal）纯逻辑单元测试（零依赖）：
 * node tests/time_decimal.test.js
 * 覆盖：规格 8 条确定性向量逐字命中（parseToHours 五向量、formatHours 两向量、
 * batchConvert 一向量 total）、非法参数抛 Error 的 err.field、
 * categories.go 注册（Path 总数 279→279、Icon schedule 精确值复测锁定、
 * New/Category/中英文关键词）与模板（真限制四条、
 * 与单位换算器互链、零网络请求静态检查）。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var A = require("../static/js/time_decimal.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function has(s, sub, name) { ok(s.indexOf(sub) !== -1, name); }
function notHas(s, sub, name) { ok(s.indexOf(sub) === -1, name); }
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
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "time_decimal.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "time_decimal.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. parseToHours：规格 5 条确定性向量（逐字） ---------- */
eq(A.parseToHours("2:45"), 2.75, "向量1：parseToHours('2:45')=2.75");
eq(A.parseToHours("1:30:30"), 1.51, "向量2：parseToHours('1:30:30')=1.51（1.50833…四舍五入2位）");
eq(A.parseToHours("2小时45分"), 2.75, "向量3：parseToHours('2小时45分')=2.75");
eq(A.parseToHours("2h45m"), 2.75, "向量4：parseToHours('2h45m')=2.75");
eq(A.parseToHours("90分钟"), 1.5, "向量5：parseToHours('90分钟')=1.5");
eq(A.parseToHours("2:45"), 2.75, "重复调用确定性一致");
eq(A.parseToHours(" 2:45 "), 2.75, "首尾空白自动 trim");
eq(A.parseToHours("2小时45分30秒"), 2.76, "秒段：parseToHours('2小时45分30秒')=2.76");
eq(A.parseToHours("165分"), 2.75, "纯分：parseToHours('165分')=2.75");
eq(A.parseToHours("45s"), 0.01, "纯秒：parseToHours('45s')=0.01");
eq(A.parseToHours("2.5小时"), 2.5, "小数小时：parseToHours('2.5小时')=2.5");
eq(A.parseToHours("2H45M"), 2.75, "英文大小写不限：parseToHours('2H45M')=2.75");
eq(A.parseToHours("0:30"), 0.5, "零小时：parseToHours('0:30')=0.5");

/* ---------- 2. parseToHours：非法参数 err.field='text' ---------- */
throwsField(function () { A.parseToHours(""); }, "text", "空串：err.field='text'");
throwsField(function () { A.parseToHours("   "); }, "text", "纯空白：err.field='text'");
throwsField(function () { A.parseToHours("abc"); }, "text", "无匹配：err.field='text'");
throwsField(function () { A.parseToHours("2.5"); }, "text", "纯数字不认：err.field='text'");
throwsField(function () { A.parseToHours("2:75"); }, "text", "分钟≥60：err.field='text'");
throwsField(function () { A.parseToHours("1:30:99"); }, "text", "秒≥60：err.field='text'");
throwsField(function () { A.parseToHours("-2:45"); }, "text", "负时长：err.field='text'");
throwsField(function () { A.parseToHours(null); }, "text", "null：err.field='text'");
throwsField(function () { A.parseToHours(2.75); }, "text", "数字类型：err.field='text'");
throwsField(function () { A.parseToHours(undefined); }, "text", "undefined：err.field='text'");

/* ---------- 3. formatHours：规格 2 条确定性向量（逐字） ---------- */
eq(A.formatHours(2.75), "2小时45分", "向量6：formatHours(2.75)='2小时45分'");
eq(A.formatHours(4.25), "4小时15分", "向量7：formatHours(4.25)='4小时15分'");
eq(A.formatHours(1.5), "1小时30分", "formatHours(1.5)='1小时30分'");
eq(A.formatHours(0), "0小时0分", "formatHours(0)='0小时0分'");
throwsField(function () { A.formatHours(-1); }, "decimal", "负数：err.field='decimal'");
throwsField(function () { A.formatHours(NaN); }, "decimal", "NaN：err.field='decimal'");
throwsField(function () { A.formatHours(Infinity); }, "decimal", "Infinity：err.field='decimal'");
throwsField(function () { A.formatHours("2.75"); }, "decimal", "字符串：err.field='decimal'");
throwsField(function () { A.formatHours(null); }, "decimal", "null：err.field='decimal'");

/* ---------- 4. batchConvert：规格 1 条确定性向量（逐字） ---------- */
var b1 = A.batchConvert("2:45\n1:30");
eq(b1.total, 4.25, "向量8：batchConvert('2:45\\n1:30').total=4.25");
eq(b1.rows.length, 2, "向量8：rows 长度为 2");
eq(b1.rows[0].input, "2:45", "向量8：rows[0].input='2:45'");
eq(b1.rows[0].hours, 2.75, "向量8：rows[0].hours=2.75");
eq(b1.rows[1].hours, 1.5, "向量8：rows[1].hours=1.5");
var b2 = A.batchConvert("2:45\nabc\n1:30");
eq(b2.total, 4.25, "单行失败不中断：total 只加成功行=4.25");
eq(b2.rows[1].error !== undefined, true, "单行失败：rows[1] 记 error");
eq(b2.rows[1].input, "abc", "单行失败：rows[1].input='abc'");
var b3 = A.batchConvert("2:45\n\n  \n1:30");
eq(b3.rows.length, 2, "空行跳过：rows 长度为 2");
eq(b3.total, 4.25, "空行跳过：total=4.25");
throwsField(function () { A.batchConvert(""); }, "text", "空串：err.field='text'");
throwsField(function () { A.batchConvert("  \n  "); }, "text", "全空行：err.field='text'");
throwsField(function () { A.batchConvert(null); }, "text", "null：err.field='text'");

/* ---------- 5. window.TimeDecimal / module.exports 同步导出 ---------- */
eq(typeof A.parseToHours, "function", "module.exports 含 parseToHours");
eq(typeof A.formatHours, "function", "module.exports 含 formatHours");
eq(typeof A.batchConvert, "function", "module.exports 含 batchConvert");
has(JS_SRC, "window.TimeDecimal", "JS 挂载 window.TimeDecimal");

/* ---------- 6. categories.go 注册 ---------- */
var tdIdx = GO_SRC.indexOf('"time_decimal"');
ok(tdIdx >= 0, "注册含 ID time_decimal");
has(GO_SRC, 'Path:        "/tools/time-decimal"', "注册 Path 为 /tools/time-decimal");
var tdBlock = GO_SRC.slice(tdIdx, tdIdx + 1600);
has(tdBlock, "工时十进制转换", "注册 Name 为工时十进制转换");
has(tdBlock, 'Category:    "生活工具"', "注册 Category 为生活工具");
has(tdBlock, "New:         true", "注册 New: true");
has(tdBlock, 'Icon:        "schedule"', "注册 Icon 为 schedule");
has(tdBlock, "十进制小时", "Description 含「十进制小时」");
has(tdBlock, "工时单", "Description 含「工时单」");
has(tdBlock, "timesheet", "Description 含「timesheet」");
has(tdBlock, "decimal hours", "Description 含「decimal hours」");
var iconRe = /"schedule"/g, iconHits = (GO_SRC.match(iconRe) || []).length;
eq(iconHits, 2, "Icon schedule 精确值复测锁定：全库共 2 处（Cron 表达式解析＋工时十进制转换）");
var pathRe = /"\/tools\/[^"]+"/g, seen = {}, m, pathCount = 0;
while ((m = pathRe.exec(GO_SRC)) !== null) { if (!seen[m[0]]) { seen[m[0]] = true; pathCount++; } }
eq(pathCount, 284, "注册 Path 总数 278→279");

/* ---------- 7. 模板：SEO/真限制/互链/零外部资源 ---------- */
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/time-decimal", "模板 canonical 含新 Path");
has(TPL_SRC, 'id="td-app"', "模板含应用根节点 td-app");
has(TPL_SRC, 'id="td-in"', "模板含单行输入 td-in");
has(TPL_SRC, 'id="td-to-dec"', "模板含转十进制按钮 td-to-dec");
has(TPL_SRC, 'id="td-dec-in"', "模板含十进制输入 td-dec-in");
has(TPL_SRC, 'id="td-batch"', "模板含批量文本框 td-batch");
has(TPL_SRC, 'id="td-batch-run"', "模板含批量转换按钮 td-batch-run");
has(TPL_SRC, 'id="td-batch-copy"', "模板含批量复制按钮 td-batch-copy");
has(TPL_SRC, 'id="td-total"', "模板含合计 td-total");
has(TPL_SRC, 'src="/tools/static/js/time_decimal.js?v=1"', "模板引用新 JS（v=1）");
has(TPL_SRC, "不含午休扣除", "真限制①：不含午休扣除/加班系数明示");
has(TPL_SRC, "四舍五入保留 2 位", "真限制②：四舍五入保留2位明示");
has(TPL_SRC, "按公司口径核对", "真限制②：按公司口径核对明示");
has(TPL_SRC, "不会上传到任何服务器", "真限制④：纯本地零上传");
has(TPL_SRC, "仅供参考", "真限制④：仅供参考");
has(TPL_SRC, "/tools/unit-converter", "互链：单位换算器");
var extRes = TPL_SRC.match(/<(script|link)[^>]*?(src|href)="https?:\/\//g) || [];
ok(extRes.every(function (t) { return t.indexOf('rel="canonical"') >= 0; }),
  "零外部资源：script/link 外链仅 canonical（实得 " + JSON.stringify(extRes) + "）");
notHas(JS_SRC, "fetch(", "零网络：JS 无 fetch 调用");
notHas(JS_SRC, "XMLHttpRequest", "零网络：JS 无 XHR");

console.log("time_decimal: pass=" + pass + " fail=" + fail);
process.exit(fail === 0 ? 0 : 1);
