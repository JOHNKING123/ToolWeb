/* 文本信息提取器纯逻辑单元测试（零依赖）：node tests/text_info_extractor.test.js
* 覆盖：8 条内置规则正负样本、规则开关同步、自定义正则合法／非法／删除同步、
* 去重开关、高亮转义、重叠归属、规则筛选同步、导出文本拼装、2 组示例、
* 注册（181→182 Path）与零网络请求、模板真限制文案与互链。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/text_info_extractor.js");

var pass = 0, fail = 0;
function ok(cond, name) {
if (cond) { pass++;}
else { fail++; console.error("FAIL:", name);}
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）");}
function has(s, sub, name) { ok(String(s).indexOf(sub)!== -1, name + "（应包含 " + JSON.stringify(sub) + "）");}
function notHas(s, sub, name) { ok(String(s).indexOf(sub) === -1, name + "（不应包含 " + JSON.stringify(sub) + "）");}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "text_info_extractor.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "text_info_extractor.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

function valuesOf(text, ruleId, customs) {
var groups = M.extractAll(text, null, customs || []);
var g = groups.filter(function (x) { return x.id === ruleId;})[0];
return g? g.matches.map(function (m) { return m.value;}): [];
}
function groupOf(text, ruleId, customs) {
return M.extractAll(text, null, customs || []).filter(function (x) { return x.id === ruleId;})[0];
}

/* ---------- 1. 邮箱 ---------- */
eq(valuesOf("联系 wang@example.com 和 help@test.org", "email").length, 2, "邮箱：2 个正例命中");
eq(valuesOf("联系 a@b", "email").length, 0, "邮箱：a@b 不命中（无顶级域名）");
eq(valuesOf("联系 a@b.c", "email").length, 0, "邮箱：a@b.c 不命中（顶级域名仅 1 字符）");
eq(valuesOf("联系 a@@b.com", "email").length, 0, "邮箱：a@@b.com 不命中");

/* ---------- 2. 手机号 ---------- */
eq(valuesOf("手机 13812345678", "mobile").length, 1, "手机号：11 位正例命中");
eq(valuesOf("手机 138123456789", "mobile").length, 0, "手机号：12 位不命中");
eq(valuesOf("手机 12812345678", "mobile").length, 0, "手机号：12 开头不命中");
eq(valuesOf("手机 1381234567", "mobile").length, 0, "手机号：10 位不命中");

/* ---------- 3. 固定电话 ---------- */
eq(valuesOf("座机 010-12345678", "landline").length, 1, "固定电话：010 正例命中");
eq(valuesOf("座机 0755-1234567", "landline").length, 1, "固定电话：0755 正例命中");
eq(valuesOf("座机 010-123", "landline").length, 0, "固定电话：号码过短不命中");
eq(valuesOf("座机 01012345678", "landline").length, 0, "固定电话：无横杠不命中");

/* ---------- 4. 链接 ---------- */
eq(valuesOf("见 https://example.com/a?x=1&y=2。", "url")[0], "https://example.com/a?x=1&y=2", "链接：尾部句号不计入");
eq(valuesOf("访问 https://example.com/page.", "url")[0], "https://example.com/page", "链接：尾部英文句号不计入");
eq(valuesOf("访问 http://example.com/x", "url").length, 1, "链接：http 正例命中");
eq(valuesOf("访问 www.example.com", "url").length, 0, "链接：无协议裸域名不命中");
eq(valuesOf("访问 http://", "url").length, 0, "链接：裸协议不命中");

/* ---------- 5. 日期 ---------- */
eq(valuesOf("日期 2026-10-26", "date").length, 1, "日期：YYYY-MM-DD 正例命中");
eq(valuesOf("日期 2026/01/05", "date").length, 1, "日期：YYYY/MM/DD 正例命中");
eq(valuesOf("日期 2026年10月26日", "date").length, 1, "日期：中文格式正例命中");
eq(valuesOf("日期 2024-02-29", "date").length, 1, "日期：闰年 2 月 29 日命中");
eq(valuesOf("日期 2026-13-40", "date").length, 0, "日期：2026-13-40 不命中");
eq(valuesOf("日期 2026-02-30", "date").length, 0, "日期：2 月 30 日不命中");
eq(valuesOf("日期 2026/13/01", "date").length, 0, "日期：13 月不命中");

/* ---------- 6. 时间 ---------- */
eq(valuesOf("时间 14:30", "time").length, 1, "时间：HH:MM 正例命中");
eq(valuesOf("时间 08:15:32", "time").length, 1, "时间：HH:MM:SS 正例命中");
eq(valuesOf("时间 25:00", "time").length, 0, "时间：25 时不命中");
eq(valuesOf("时间 14:60", "time").length, 0, "时间：60 分不命中");
eq(valuesOf("时间 24:00", "time").length, 0, "时间：24 时不命中");

/* ---------- 7. IPv4 ---------- */
eq(valuesOf("地址 192.168.1.1", "ipv4").length, 1, "IPv4：内网地址正例命中");
eq(valuesOf("地址 8.8.8.8", "ipv4").length, 1, "IPv4：公网地址正例命中");
eq(valuesOf("地址 999.1.1.1", "ipv4").length, 0, "IPv4：999 段不命中");
eq(valuesOf("地址 256.0.0.1", "ipv4").length, 0, "IPv4：256 段不命中");
eq(valuesOf("地址 192.168.1", "ipv4").length, 0, "IPv4：三段不命中");
eq(valuesOf("地址 192.168.1.1.1", "ipv4").length, 0, "IPv4：五段不退格匹配后四段");

/* ---------- 8. 金额 ---------- */
eq(valuesOf("金额 ¥1,234.56", "amount").length, 1, "金额：¥ 千分位正例命中");
eq(valuesOf("金额 $99.50", "amount").length, 1, "金额：$ 正例命中");
eq(valuesOf("金额 ￥2,500", "amount").length, 1, "金额：￥ 正例命中");
eq(valuesOf("金额 100元", "amount").length, 1, "金额：元后缀正例命中");
eq(valuesOf("金额 1,234元", "amount").length, 1, "金额：千分位元后缀正例命中");
eq(valuesOf("金额 ¥", "amount").length, 0, "金额：裸 ¥ 不命中");
eq(valuesOf("金额 元", "amount").length, 0, "金额：裸元不命中");
eq(valuesOf("数字 1234", "amount").length, 0, "金额：无符号纯数字不命中");
eq(valuesOf("金额 ¥1,23", "amount").length, 0, "金额：千分位分组错误不命中");

/* ---------- 9. 规则开关同步 ---------- */
var toggled = M.extractAll("wang@example.com 13812345678", ["email"], []);
ok(toggled.some(function (g) { return g.id === "email" && g.matches.length === 1;}), "开关：只开邮箱时邮箱命中");
ok(!toggled.some(function (g) { return g.id === "mobile";}), "开关：关手机号后该组不在结果里");
var allGroups = M.extractAll("wang@example.com 13812345678", null, []);
eq(allGroups.filter(function (g) { return g.builtin;}).length, 8, "开关：默认 8 条内置规则全开");

/* ---------- 10. 自定义正则 ---------- */
var custom = [{ name: "订单号", pattern: "订单号：[A-Z0-9]+"}];
var cg = groupOf("订单号：AB123 请查收", "custom:订单号", custom);
eq(cg.matches.map(function (m) { return m.value;})[0], "订单号：AB123", "自定义：合法正则命中并进清单");
var bad = M.validateCustom("坏规则", "([a-");
ok(!bad.ok && /非法/.test(bad.error), "自定义：非法表达式中文报错");
var badGroups = M.extractAll("wang@example.com", null, [{ name: "坏规则", pattern: "([a-"}]);
ok(badGroups.some(function (g) { return g.id === "email" && g.matches.length === 1;}), "自定义：非法时内置规则照常工作");
var noCustom = M.extractAll("订单号：AB123", null, []);
ok(!noCustom.some(function (g) { return g.id === "custom:订单号";}), "自定义：删除后清单同步消失");
ok(!M.validateCustom("", "abc").ok && /名称/.test(M.validateCustom("", "abc").error), "自定义：名称必填报错");
ok(!M.validateCustom("x", "").ok && /正则表达式/.test(M.validateCustom("x", "").error), "自定义：表达式必填报错");
ok(M.validateCustom("订单号", "订单号：[A-Z0-9]+").ok, "自定义：合法表达式校验通过");
var dupName = M.validateCustom("订单号", "订单号：[A-Z0-9]+", ["订单号"]);
ok(!dupName.ok && /已有同名/.test(dupName.error), "自定义：同名规则中文报错不撞 id");

/* ---------- 11. 去重开关 ---------- */
var dupGroups = M.extractAll("13812345678 13812345678", null, []);
var dupMatches = dupGroups.filter(function (g) { return g.id === "mobile";})[0].matches;
eq(M.groupItems(dupMatches, true).length, 1, "去重开：重复值只列一次");
eq(M.groupItems(dupMatches, true)[0].count, 2, "去重开：次数正确为 2");
eq(M.groupItems(dupMatches, false).length, 2, "去重关：按序全列 2 条");
eq(M.groupItems(dupMatches, false)[0].value, "13812345678", "去重关：顺序与原文一致");

/* ---------- 12. 高亮转义与重叠归属 ---------- */
var escGroups = M.extractAll("<script>alert(1)</script> 13812345678", null, []);
var escHtml = M.buildHighlightHtml("<script>alert(1)</script> 13812345678", escGroups, null);
has(escHtml, "&lt;script&gt;", "高亮：<script> 被转义显示");
notHas(escHtml, "<script>alert", "高亮：<script> 不原样输出执行");
has(escHtml, "13812345678", "高亮：手机号仍被标注");
var ovText = "见 https://example.com/2026-10-26";
var ovGroups = M.extractAll(ovText, null, []);
var ovDate = ovGroups.filter(function (g) { return g.id === "date";})[0];
ok(ovDate.matches.length === 1 && ovDate.matches[0].highlighted === false, "重叠：链接里的日期清单有但高亮不归属日期");
var ovHtml = M.buildHighlightHtml(ovText, ovGroups, null);
eq((ovHtml.match(/<mark/g) || []).length, 1, "重叠：高亮只留顺序在先的链接一个标记");
has(ovHtml, "https://example.com/2026-10-26", "重叠：链接整段高亮");

/* ---------- 13. 规则筛选同步 ---------- */
var fGroups = M.extractAll("wang@example.com 13812345678", null, []);
var fList = M.buildListText(fGroups, true, "email");
has(fList, "wang@example.com", "筛选：清单只留邮箱组");
notHas(fList, "13812345678", "筛选：清单不同步手机号");
var fHtml = M.buildHighlightHtml("wang@example.com 13812345678", fGroups, "mobile");
eq((fHtml.match(/<mark/g) || []).length, 1, "筛选：高亮只留手机号一个标记");
has(fHtml, "13812345678", "筛选：高亮为手机号");

/* ---------- 14. 导出拼装 ---------- */
var exGroups = M.extractAll("wang@example.com 13812345678 13812345678 ¥1,234.56", null, []);
var txt = M.buildListText(exGroups, true, null);
has(txt, "邮箱（共1条）", "导出 txt：分组标题带规则名（邮箱）");
has(txt, "手机号（共1条）", "导出 txt：分组标题带规则名（手机号）");
has(txt, "金额（共1条）", "导出 txt：分组标题带规则名（金额）");
notHas(txt, "（共0条）", "导出 txt：无筛选时空组不输出无名空标题");
has(txt, "13812345678 ×2", "导出 txt：去重次数附在值后");
/* 全部复制场景（评审复现文本）：多组标题均带规则名，无无名空标题。 */
var allTxt = M.buildListText(M.extractAll("见 https://example.com/2026-10-26 和 2026-10-26", null, []), true, null);
has(allTxt, "链接（共1条）", "导出 txt：全部复制时链接组标题带规则名");
has(allTxt, "日期（共1条）", "导出 txt：全部复制时日期组标题带规则名");
notHas(allTxt, "（共0条）", "导出 txt：全部复制时无无名空标题");
/* 单组筛选且该组为空：保留标题并提示无命中，与页面清单口径一致。 */
var emptyFilterTxt = M.buildListText(M.extractAll("13812345678", null, []), true, "email");
has(emptyFilterTxt, "邮箱（共0条）", "导出 txt：单组筛选空组保留带规则名标题");
has(emptyFilterTxt, "本组无命中", "导出 txt：单组筛选空组提示无命中");
notHas(emptyFilterTxt, "13812345678", "导出 txt：单组筛选空组不混入其他组");
var csv = M.buildCsv(exGroups, true, null);
eq(csv.split("\n")[0], "规则,值,出现次数", "导出 csv：三列齐全表头");
has(csv, "邮箱,wang@example.com,1", "导出 csv：邮箱行三列齐全");
has(csv, '"¥1,234.56"', "导出 csv：含逗号的值加引号转义");

/* ---------- 15. 2 组示例 ---------- */
eq(M.EXAMPLES.length, 2, "示例：共 2 组");
M.EXAMPLES.forEach(function (ex, i) {
var gs = M.extractAll(ex.text, null, []);
var nonEmpty = gs.filter(function (g) { return g.matches.length > 0;}).length;
ok(nonEmpty >= 7, "示例" + i + "：非空规则组不少于 7 组（实得 " + nonEmpty + "）");
var html = M.buildHighlightHtml(ex.text, gs, null);
ok(html.indexOf("<mark")!== -1, "示例" + i + "：高亮有标记");
var list = M.buildListText(gs, true, null);
ok(list.length > 0, "示例" + i + "：清单非空");
});

/* ---------- 16. 空输入 ---------- */
var emptyGroups = M.extractAll("", null, []);
ok(emptyGroups.every(function (g) { return g.matches.length === 0;}), "空输入：各组均无命中");

/* ---------- 17. 注册（181→182 Path） ---------- */
has(GO_SRC, '"text_info_extractor"', "注册：ID text_info_extractor");
has(GO_SRC, '"/tools/text-info-extractor"', "注册：Path /tools/text-info-extractor");
has(GO_SRC, "文本信息提取器", "注册：中文名");
var paths = GO_SRC.match(/"\/tools\/[^"]+"/g) || [];
var uniq = paths.filter(function (v, i) { return paths.indexOf(v) === i;});
eq(uniq.length, 182, "注册：总数 181→182 Path");
ok(/ID:\s+"text_info_extractor"[\s\S]{0,800}?Category:\s+"文本工具"/.test(GO_SRC), "注册：品类为文本工具");
ok(/ID:\s+"text_info_extractor"[\s\S]{0,800}?New:\s+true/.test(GO_SRC), "注册：New 为 true");

/* ---------- 18. 零网络请求与模板 ---------- */
notHas(JS_SRC, "fetch(", "零网络：JS 无 fetch(");
notHas(JS_SRC, "XMLHttpRequest", "零网络：JS 无 XHR");
has(TPL_SRC, "正则近似提取、命中≠真实有效", "模板：真限制命中≠真实有效可见");
has(TPL_SRC, "不承诺 100% 召回", "模板：真限制不承诺召回可见");
has(TPL_SRC, "不提取身份证号、银行卡号", "模板：真限制不提取证件号可见");
has(TPL_SRC, "只处理你主动粘贴的文本", "模板：真限制只处理主动粘贴可见");
has(TPL_SRC, "/tools/regex-tester", "互链：正则表达式测试");
has(TPL_SRC, "/tools/text-diff", "互链：文本比较");
notHas(TPL_SRC, "/tools/csv-json", "互链：不与 CSV⇄JSON 互链");
has(TPL_SRC, 'href="https://www.johnkingzcq123.xyz/tools/text-info-extractor"', "模板：canonical");
has(TPL_SRC, "text_info_extractor.js", "模板：引用本工具 JS");
notHas(TPL_SRC, 'src="http', "模板：无外部 CDN 脚本");
ok(/id="tie-input"/.test(TPL_SRC), "模板：输入框齐全");
ok(/id="tie-highlight"/.test(TPL_SRC), "模板：高亮区齐全");
ok(/id="tie-list"/.test(TPL_SRC), "模板：清单区齐全");
ok(/id="tie-dedupe"/.test(TPL_SRC), "模板：去重开关齐全");
ok(/id="tie-file"/.test(TPL_SRC), "模板：本地.txt 读取齐全");
ok(/data-example="0"/.test(TPL_SRC) && /data-example="1"/.test(TPL_SRC), "模板：2 组示例按钮齐全");
ok(/id="tie-download-csv"/.test(TPL_SRC) && /id="tie-download-txt"/.test(TPL_SRC), "模板：下载按钮齐全");
ok(/id="tie-copy-all"/.test(TPL_SRC), "模板：全部复制按钮齐全");

console.log("text_info_extractor: " + pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
