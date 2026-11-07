/* 罗马数字转换纯函数单元测试（零依赖）：node tests/roman_numeral_converter.test.js
 * 覆盖：toRoman 锚点精确值（1994→MCMXCIV、2026→MMXXVI、3999→MMMCMXCIX、
 * 1／4／9／40／90／400／900 减法锚点、3888→MMMDCCCLXXXVIII）、toRoman 非法
 * 输入逐条抛错 err.field='num'（0／负数／小数／＞3999／非数字）、fromRoman
 * 锚点精确值（含小写宽容与前后空格）、fromRoman 非法写法逐条抛错
 * err.field='roman'（IIII／VV／IL／VX／IC／XM／IXI／MCMCM／IM／XD／VL／LC／DM／
 * MMMM／IIX／LL／DD／ABC／空串）、isValidRoman、1–3999 全量往返一致＋去重、
 * decompose／decomposeRoman 锚点精确值（2026／1994／3999）、convertLine／
 * convertBatch／batchStats、13 组符号值对照表＋六组减法组合、5 组预设示例、
 * 常用速查、categories.go 注册（Path 总数 324→325、Icon history_edu 全库唯一、
 * 紧邻 pinyin_converter）、模板（SEO 关键词、真限制五条、控件、互链、
 * 零外部资源静态检查）、浏览器绑定源码级检查（window.RomanNumeralConverter、
 * 双向输入即转／批量／拆解／预设／复制／下载／清空）。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/roman_numeral_converter.js");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function eqj(a, b, name) { eq(JSON.stringify(a), JSON.stringify(b), name); }
function has(s, sub, name) { ok(s.indexOf(sub) !== -1, name + "（缺 " + sub + "）"); }
function notHas(s, sub, name) { ok(s.indexOf(sub) === -1, name + "（不应含 " + sub + "）"); }
function throws(fn, field, name) {
    try { fn(); ok(false, name + "（应抛错却未抛）"); }
    catch (e) { ok(!field || e.field === field, name + "（err.field 期望 " + field + "，实得 " + e.field + "）"); }
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "roman_numeral_converter.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "roman_numeral_converter.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. toRoman 锚点精确值 ---------- */
eq(M.toRoman(1), "I", "toRoman 1→I");
eq(M.toRoman(2), "II", "toRoman 2→II");
eq(M.toRoman(3), "III", "toRoman 3→III");
eq(M.toRoman(4), "IV", "toRoman 4→IV");
eq(M.toRoman(5), "V", "toRoman 5→V");
eq(M.toRoman(9), "IX", "toRoman 9→IX");
eq(M.toRoman(10), "X", "toRoman 10→X");
eq(M.toRoman(12), "XII", "toRoman 12→XII");
eq(M.toRoman(14), "XIV", "toRoman 14→XIV");
eq(M.toRoman(19), "XIX", "toRoman 19→XIX");
eq(M.toRoman(40), "XL", "toRoman 40→XL");
eq(M.toRoman(44), "XLIV", "toRoman 44→XLIV");
eq(M.toRoman(49), "XLIX", "toRoman 49→XLIX");
eq(M.toRoman(58), "LVIII", "toRoman 58→LVIII");
eq(M.toRoman(90), "XC", "toRoman 90→XC");
eq(M.toRoman(99), "XCIX", "toRoman 99→XCIX");
eq(M.toRoman(100), "C", "toRoman 100→C");
eq(M.toRoman(400), "CD", "toRoman 400→CD");
eq(M.toRoman(444), "CDXLIV", "toRoman 444→CDXLIV");
eq(M.toRoman(500), "D", "toRoman 500→D");
eq(M.toRoman(900), "CM", "toRoman 900→CM");
eq(M.toRoman(999), "CMXCIX", "toRoman 999→CMXCIX");
eq(M.toRoman(1000), "M", "toRoman 1000→M");
eq(M.toRoman(1984), "MCMLXXXIV", "toRoman 1984→MCMLXXXIV");
eq(M.toRoman(1994), "MCMXCIV", "toRoman 1994→MCMXCIV（数值锚点）");
eq(M.toRoman(1999), "MCMXCIX", "toRoman 1999→MCMXCIX");
eq(M.toRoman(2000), "MM", "toRoman 2000→MM");
eq(M.toRoman(2024), "MMXXIV", "toRoman 2024→MMXXIV");
eq(M.toRoman(2026), "MMXXVI", "toRoman 2026→MMXXVI（数值锚点）");
eq(M.toRoman(3888), "MMMDCCCLXXXVIII", "toRoman 3888→MMMDCCCLXXXVIII（最长写法 15 字符）");
eq(M.toRoman(3999), "MMMCMXCIX", "toRoman 3999→MMMCMXCIX（数值锚点／上限）");
eq(M.MIN, 1, "MIN=1");
eq(M.MAX, 3999, "MAX=3999");

/* ---------- 2. toRoman 非法输入逐条抛错 ---------- */
throws(function () { M.toRoman(0); }, "num", "toRoman 0 抛错（罗马数字没有 0）");
throws(function () { M.toRoman(-1); }, "num", "toRoman -1 抛错（负数）");
throws(function () { M.toRoman(-3999); }, "num", "toRoman -3999 抛错（负数）");
throws(function () { M.toRoman(3.5); }, "num", "toRoman 3.5 抛错（小数）");
throws(function () { M.toRoman(2026.1); }, "num", "toRoman 2026.1 抛错（小数）");
throws(function () { M.toRoman(4000); }, "num", "toRoman 4000 抛错（超范围）");
throws(function () { M.toRoman(10000); }, "num", "toRoman 10000 抛错（超范围）");
throws(function () { M.toRoman(NaN); }, "num", "toRoman NaN 抛错");
throws(function () { M.toRoman(Infinity); }, "num", "toRoman Infinity 抛错");
throws(function () { M.toRoman("2026"); }, "num", "toRoman 字符串 '2026' 抛错（须为数字）");
throws(function () { M.toRoman(null); }, "num", "toRoman null 抛错");
throws(function () { M.toRoman(undefined); }, "num", "toRoman undefined 抛错");

/* ---------- 3. fromRoman 锚点精确值 ---------- */
eq(M.fromRoman("I"), 1, "fromRoman I→1");
eq(M.fromRoman("IV"), 4, "fromRoman IV→4");
eq(M.fromRoman("IX"), 9, "fromRoman IX→9");
eq(M.fromRoman("XII"), 12, "fromRoman XII→12");
eq(M.fromRoman("XLIX"), 49, "fromRoman XLIX→49");
eq(M.fromRoman("XCIX"), 99, "fromRoman XCIX→99");
eq(M.fromRoman("CDXLIV"), 444, "fromRoman CDXLIV→444");
eq(M.fromRoman("MCMXCIV"), 1994, "fromRoman MCMXCIV→1994");
eq(M.fromRoman("MMXXVI"), 2026, "fromRoman MMXXVI→2026");
eq(M.fromRoman("MCMLXXXIV"), 1984, "fromRoman MCMLXXXIV→1984");
eq(M.fromRoman("MMMCMXCIX"), 3999, "fromRoman MMMCMXCIX→3999");
eq(M.fromRoman("mmxxvi"), 2026, "fromRoman 小写 mmxxvi→2026（小写宽容）");
eq(M.fromRoman("Xii"), 12, "fromRoman 混写 Xii→12（小写宽容）");
eq(M.fromRoman("  MMXXVI  "), 2026, "fromRoman 前后空格宽容");
eq(M.fromRoman("mcmxciv"), 1994, "fromRoman 小写 mcmxciv→1994");

/* ---------- 4. fromRoman 非法写法逐条抛错 ---------- */
throws(function () { M.fromRoman("IIII"); }, "roman", "fromRoman IIII 抛错（应为 IV）");
throws(function () { M.fromRoman("VV"); }, "roman", "fromRoman VV 抛错（应为 X）");
throws(function () { M.fromRoman("LL"); }, "roman", "fromRoman LL 抛错（应为 C）");
throws(function () { M.fromRoman("DD"); }, "roman", "fromRoman DD 抛错（应为 M）");
throws(function () { M.fromRoman("IL"); }, "roman", "fromRoman IL 抛错（非法减法组合）");
throws(function () { M.fromRoman("VX"); }, "roman", "fromRoman VX 抛错（非法减法组合）");
throws(function () { M.fromRoman("IC"); }, "roman", "fromRoman IC 抛错（非法减法组合）");
throws(function () { M.fromRoman("XM"); }, "roman", "fromRoman XM 抛错（非法减法组合）");
throws(function () { M.fromRoman("IM"); }, "roman", "fromRoman IM 抛错（非法减法组合）");
throws(function () { M.fromRoman("XD"); }, "roman", "fromRoman XD 抛错（非法减法组合）");
throws(function () { M.fromRoman("VL"); }, "roman", "fromRoman VL 抛错（非法减法组合）");
throws(function () { M.fromRoman("LC"); }, "roman", "fromRoman LC 抛错（非法减法组合）");
throws(function () { M.fromRoman("DM"); }, "roman", "fromRoman DM 抛错（非法减法组合）");
throws(function () { M.fromRoman("IXI"); }, "roman", "fromRoman IXI 抛错（错位写法）");
throws(function () { M.fromRoman("IIX"); }, "roman", "fromRoman IIX 抛错（错位写法）");
throws(function () { M.fromRoman("MCMCM"); }, "roman", "fromRoman MCMCM 抛错（重复减法）");
throws(function () { M.fromRoman("MMMM"); }, "roman", "fromRoman MMMM 抛错（超 3999）");
throws(function () { M.fromRoman("ABC"); }, "roman", "fromRoman ABC 抛错（非法罗马字符）");
throws(function () { M.fromRoman("A"); }, "roman", "fromRoman A 抛错（非法罗马字符）");
throws(function () { M.fromRoman("123"); }, "roman", "fromRoman 123 抛错（非法罗马字符）");
throws(function () { M.fromRoman(""); }, "roman", "fromRoman 空串抛错");
throws(function () { M.fromRoman("   "); }, "roman", "fromRoman 全空格抛错");
throws(function () { M.fromRoman(null); }, "roman", "fromRoman null 抛错");
throws(function () { M.fromRoman(2026); }, "roman", "fromRoman 数字 2026 抛错（须为字符串）");

/* ---------- 5. isValidRoman ---------- */
eq(M.isValidRoman("MMXXVI"), true, "isValidRoman MMXXVI=true");
eq(M.isValidRoman("mmxxvi"), true, "isValidRoman 小写 mmxxvi=true");
eq(M.isValidRoman("I"), true, "isValidRoman I=true");
eq(M.isValidRoman("MMMCMXCIX"), true, "isValidRoman MMMCMXCIX=true");
eq(M.isValidRoman("IIII"), false, "isValidRoman IIII=false");
eq(M.isValidRoman("VV"), false, "isValidRoman VV=false");
eq(M.isValidRoman("IL"), false, "isValidRoman IL=false");
eq(M.isValidRoman("VX"), false, "isValidRoman VX=false");
eq(M.isValidRoman("IC"), false, "isValidRoman IC=false");
eq(M.isValidRoman("XM"), false, "isValidRoman XM=false");
eq(M.isValidRoman("ABC"), false, "isValidRoman ABC=false");
eq(M.isValidRoman(""), false, "isValidRoman 空串=false");
eq(M.isValidRoman("   "), false, "isValidRoman 全空格=false");
eq(M.isValidRoman(null), false, "isValidRoman null=false");
eq(M.isValidRoman(2026), false, "isValidRoman 数字=false");
eq(M.isValidRoman("MMMM"), false, "isValidRoman MMMM=false");

/* ---------- 6. 往返一致：1–3999 全量抽查 ---------- */
(function () {
    var seen = {};
    var bad = 0;
    for (var n = 1; n <= 3999; n++) {
        var r = M.toRoman(n);
        if (M.fromRoman(r) !== n) { bad++; }
        if (seen[r]) { bad++; }
        seen[r] = true;
    }
    eq(bad, 0, "往返一致：1–3999 全量 fromRoman(toRoman(n))===n 且无重复写法");
    eq(Object.keys(seen).length, 3999, "全量去重：3999 个数对应 3999 种写法");
})();
var roundSamples = [1, 2, 3, 4, 5, 9, 10, 14, 19, 40, 44, 49, 90, 99, 100, 400, 444, 500, 900, 999, 1000, 1994, 1999, 2026, 3999];
roundSamples.forEach(function (n) {
    eq(M.fromRoman(M.toRoman(n)), n, "往返抽查 " + n + "→" + M.toRoman(n) + "→" + n);
});

/* ---------- 7. decompose / decomposeRoman ---------- */
eqj(M.decompose(2026), [{ symbol: "M", value: 1000, count: 2 }, { symbol: "X", value: 10, count: 2 }, { symbol: "V", value: 5, count: 1 }, { symbol: "I", value: 1, count: 1 }], "decompose(2026) 锚点精确值");
eqj(M.decompose(1994), [{ symbol: "M", value: 1000, count: 1 }, { symbol: "CM", value: 900, count: 1 }, { symbol: "XC", value: 90, count: 1 }, { symbol: "IV", value: 4, count: 1 }], "decompose(1994) 锚点精确值");
eqj(M.decompose(3999), [{ symbol: "M", value: 1000, count: 3 }, { symbol: "CM", value: 900, count: 1 }, { symbol: "XC", value: 90, count: 1 }, { symbol: "IX", value: 9, count: 1 }], "decompose(3999) 锚点精确值");
eqj(M.decompose(1), [{ symbol: "I", value: 1, count: 1 }], "decompose(1)");
eqj(M.decompose(4), [{ symbol: "IV", value: 4, count: 1 }], "decompose(4)");
eqj(M.decompose(58), [{ symbol: "L", value: 50, count: 1 }, { symbol: "V", value: 5, count: 1 }, { symbol: "I", value: 1, count: 3 }], "decompose(58)");
eqj(M.decomposeRoman("MMXXVI"), M.decompose(2026), "decomposeRoman(MMXXVI)=decompose(2026)");
eqj(M.decomposeRoman("MCMXCIV"), M.decompose(1994), "decomposeRoman(MCMXCIV)=decompose(1994)");
throws(function () { M.decompose(0); }, "num", "decompose 0 抛错");
throws(function () { M.decompose(4000); }, "num", "decompose 4000 抛错");
throws(function () { M.decompose(3.5); }, "num", "decompose 3.5 抛错");
throws(function () { M.decomposeRoman("IIII"); }, "roman", "decomposeRoman IIII 抛错");
throws(function () { M.decomposeRoman("IL"); }, "roman", "decomposeRoman IL 抛错");

/* ---------- 8. convertLine ---------- */
eqj(M.convertLine("2026"), { input: "2026", output: "MMXXVI", ok: true, kind: "arabic", arabic: 2026, roman: "MMXXVI" }, "convertLine 阿拉伯数字行");
eqj(M.convertLine("MMXXVI"), { input: "MMXXVI", output: 2026, ok: true, kind: "roman", arabic: 2026, roman: "MMXXVI" }, "convertLine 罗马数字行");
eqj(M.convertLine("xii"), { input: "xii", output: 12, ok: true, kind: "roman", arabic: 12, roman: "XII" }, "convertLine 小写罗马行");
eqj(M.convertLine(" 1984 "), { input: " 1984 ", output: "MCMLXXXIV", ok: true, kind: "arabic", arabic: 1984, roman: "MCMLXXXIV" }, "convertLine 前后空格宽容");
eq(M.convertLine(""), null, "convertLine 空行返回 null");
eq(M.convertLine("   "), null, "convertLine 全空格行返回 null");
eq(M.convertLine("0").ok, false, "convertLine 0 行失败");
eq(M.convertLine("0").kind, "arabic", "convertLine 0 行 kind=arabic");
eq(M.convertLine("0").output, "", "convertLine 失败行 output 为空串");
eq(M.convertLine("MMXXVI").output, 2026, "convertLine 罗马行 output 为阿拉伯数字");
eq(M.convertLine("4000").ok, false, "convertLine 4000 行失败");
eq(M.convertLine("3.5").ok, false, "convertLine 3.5 行失败");
eq(M.convertLine("-5").ok, false, "convertLine -5 行失败");
eq(M.convertLine("IIII").ok, false, "convertLine IIII 行失败");
eq(M.convertLine("IIII").kind, "roman", "convertLine IIII 行 kind=roman");
eq(M.convertLine("IL").ok, false, "convertLine IL 行失败");
eq(M.convertLine("ABC").ok, false, "convertLine ABC 行失败");
eq(M.convertLine("12a").ok, false, "convertLine 12a 行失败");
eq(M.convertLine("12a").kind, "unknown", "convertLine 12a 行 kind=unknown");
throws(function () { M.convertLine(2026); }, "line", "convertLine 非字符串抛错 err.field=line");

/* ---------- 9. convertBatch / batchStats ---------- */
var batch = M.convertBatch("2026\nMMXXVI\n1984\nXII\n3999\nIIII\n0\n\nABC");
eq(batch.length, 8, "convertBatch 跳过空行：9 行文本得 8 条结果");
eq(batch[0].roman, "MMXXVI", "convertBatch 第 1 行 2026→MMXXVI");
eq(batch[1].arabic, 2026, "convertBatch 第 2 行 MMXXVI→2026");
eq(batch[2].roman, "MCMLXXXIV", "convertBatch 第 3 行 1984→MCMLXXXIV");
eq(batch[3].arabic, 12, "convertBatch 第 4 行 XII→12");
eq(batch[4].roman, "MMMCMXCIX", "convertBatch 第 5 行 3999→MMMCMXCIX");
eq(batch[5].ok, false, "convertBatch 第 6 行 IIII 失败");
eq(batch[6].ok, false, "convertBatch 第 7 行 0 失败");
eq(batch[7].ok, false, "convertBatch 第 8 行 ABC 失败");
eqj(M.convertBatch(""), [], "convertBatch 空文本得空数组");
eqj(M.convertBatch("\n\n"), [], "convertBatch 全空行得空数组");
eqj(M.batchStats(batch), { total: 8, ok: 5, fail: 3, arabicToRoman: 3, romanToArabic: 2 }, "batchStats 混合批量统计精确值");
eqj(M.batchStats([]), { total: 0, ok: 0, fail: 0, arabicToRoman: 0, romanToArabic: 0 }, "batchStats 空数组");
throws(function () { M.batchStats(null); }, "batch", "batchStats 非数组抛错");
throws(function () { M.convertBatch(123); }, "text", "convertBatch 非字符串抛错");
(function () {
    var many = [];
    for (var i = 0; i < 1001; i++) { many.push("I"); }
    throws(function () { M.convertBatch(many.join("\n")); }, "text", "convertBatch 超 1000 行抛错");
})();
eq(M.MAX_BATCH_LINES, 1000, "MAX_BATCH_LINES=1000");

/* ---------- 10. 13 组符号值对照表与减法组合 ---------- */
eq(M.table.length, 13, "符号值对照表 13 组");
eqj(M.table.map(function (t) { return t.symbol; }), ["M", "CM", "D", "CD", "C", "XC", "L", "XL", "X", "IX", "V", "IV", "I"], "对照表符号顺序自大到小");
eqj(M.table.map(function (t) { return t.value; }), [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1], "对照表数值精确值");
eqj(M.subtractive, ["IV", "IX", "XL", "XC", "CD", "CM"], "减法组合仅六组");

/* ---------- 11. 预设示例与常用速查 ---------- */
eq(M.samples.length, 5, "预设示例 5 组");
eqj(M.samples[0], { label: "今年年份", note: "2026 年", arabic: 2026, roman: "MMXXVI" }, "预设 1 年份 MMXXVI");
eqj(M.samples[1], { label: "章节序号", note: "第 12 章", arabic: 12, roman: "XII" }, "预设 2 章节 XII");
eqj(M.samples[2], { label: "钟表刻度", note: "钟表 3 点", arabic: 3, roman: "III" }, "预设 3 钟表 III");
eqj(M.samples[3], { label: "版权页年份", note: "1984 年", arabic: 1984, roman: "MCMLXXXIV" }, "预设 4 版权页 MCMLXXXIV");
eqj(M.samples[4], { label: "最大值边界", note: "3999（上限）", arabic: 3999, roman: "MMMCMXCIX" }, "预设 5 边界 3999=MMMCMXCIX");
M.samples.forEach(function (s) {
    eq(M.toRoman(s.arabic), s.roman, "预设自洽：" + s.arabic + "→" + s.roman);
    eq(M.fromRoman(s.roman), s.arabic, "预设自洽：" + s.roman + "→" + s.arabic);
});
eqj(M.quickValues, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 50, 100, 500, 1000], "常用速查 1–20＋50／100／500／1000");
eqj(M.quickYears, [1949, 1984, 1999, 2000, 2008, 2024, 2025, 2026], "常用速查常见年份");
ok(M.quickValues.indexOf(50) !== -1 && M.quickValues.indexOf(100) !== -1 && M.quickValues.indexOf(500) !== -1 && M.quickValues.indexOf(1000) !== -1, "速查含 50／100／500／1000");
ok(M.quickYears.indexOf(2026) !== -1, "速查年份含 2026");

/* ---------- 12. categories.go 注册 ---------- */
var pathCount = (GO_SRC.match(/"\/tools\/[^"]+"/g) || []).filter(function (v, i, a) { return a.indexOf(v) === i; }).length;
eq(pathCount, 325, "注册 Path 总数 324→325");
has(GO_SRC, "\"roman_numeral_converter\"", "注册：ID roman_numeral_converter");
has(GO_SRC, "\"/tools/roman-numeral-converter\"", "注册：Path /tools/roman-numeral-converter");
has(GO_SRC, "\"history_edu\"", "注册：Icon history_edu");
eq((GO_SRC.match(/Icon:\s*"history_edu"/g) || []).length, 1, "Icon history_edu 全库唯一");
var entryBlock = GO_SRC.slice(GO_SRC.indexOf("\"roman_numeral_converter\"") - 60,
    GO_SRC.indexOf("\"roman_numeral_converter\"") + 1800);
ok(/New:\s+true/.test(entryBlock), "注册：New: true");
ok(/Category:\s+"编码转换"/.test(entryBlock), "注册：类目 编码转换");
has(entryBlock, "罗马数字转换", "注册：名称 罗马数字转换");
ok(GO_SRC.indexOf("\"roman_numeral_converter\"") > GO_SRC.indexOf("\"pinyin_converter\"") &&
    GO_SRC.indexOf("\"roman_numeral_converter\"") < GO_SRC.indexOf("\"http_status_reference\""),
    "注册：紧邻 pinyin_converter（在其后、http_status_reference 之前）");

/* ---------- 13. 模板：SEO/真限制/控件/互链/零外部资源 ---------- */
has(TPL_SRC, "{{define \"roman_numeral_converter\"}}", "模板：define roman_numeral_converter");
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/roman-numeral-converter", "模板 canonical 含新 Path");
has(TPL_SRC, "罗马数字转换", "模板：标题含工具名");
has(TPL_SRC, "阿拉伯数字转罗马数字", "模板：SEO 关键词 阿拉伯数字转罗马数字");
has(TPL_SRC, "罗马数字换算", "模板：SEO 关键词 罗马数字换算");
has(TPL_SRC, "罗马数字对照表", "模板：SEO 关键词 罗马数字对照表");
has(TPL_SRC, "MMXXVI", "模板：SEO 关键词 MMXXVI");
has(TPL_SRC, "五条真限制", "模板：五条真限制标题");
has(TPL_SRC, "仅支持 1–3999", "模板：真限制 1 仅 1–3999");
has(TPL_SRC, "严格规范形式校验", "模板：真限制 2 严格规范形式校验");
has(TPL_SRC, "减法组合仅六组", "模板：真限制 3 减法组合仅六组");
has(TPL_SRC, "小写宽容接受、输出统一大写", "模板：真限制 4 小写宽容接受");
has(TPL_SRC, "只做数字换算", "模板：真限制 5 只做数字换算");
has(TPL_SRC, "id=\"rn-arabic\"", "模板：阿拉伯数字输入框 rn-arabic");
has(TPL_SRC, "id=\"rn-roman\"", "模板：罗马数字输入框 rn-roman");
has(TPL_SRC, "id=\"rn-err-arabic\"", "模板：阿拉伯数字错误栏");
has(TPL_SRC, "id=\"rn-err-roman\"", "模板：罗马数字错误栏");
has(TPL_SRC, "id=\"rn-decompose\"", "模板：逐位拆解容器");
has(TPL_SRC, "id=\"rn-symbol-table\"", "模板：符号值对照表容器");
has(TPL_SRC, "id=\"rn-batch-input\"", "模板：批量输入框");
has(TPL_SRC, "id=\"rn-batch-btn\"", "模板：批量换算按钮");
has(TPL_SRC, "id=\"rn-batch-results\"", "模板：批量结果容器");
has(TPL_SRC, "id=\"rn-quick\"", "模板：常用速查容器");
has(TPL_SRC, "id=\"rn-quick-years\"", "模板：常见年份容器");
has(TPL_SRC, "id=\"rn-presets\"", "模板：预设示例容器");
has(TPL_SRC, "id=\"rn-stats\"", "模板：统计面板容器");
has(TPL_SRC, "id=\"rn-output\"", "模板：结果文本框");
has(TPL_SRC, "id=\"rn-copy-btn\"", "模板：一键复制按钮");
has(TPL_SRC, "id=\"rn-download-btn\"", "模板：下载按钮");
has(TPL_SRC, "id=\"rn-clear\"", "模板：清空按钮");
has(TPL_SRC, "history_edu", "模板：标题图标 history_edu");
has(TPL_SRC, "只做阿拉伯数字↔罗马数字换算", "模板：分工说明只做阿拉伯数字↔罗马数字换算");
has(TPL_SRC, "不做进制换算", "模板：分工说明不做进制换算");
has(TPL_SRC, "不做字符编码转换", "模板：分工说明不做字符编码转换");
has(TPL_SRC, "/tools/encoding-converter", "模板：互链 encoding_converter");
has(TPL_SRC, "中文编码转换器", "模板：互链 中文编码转换器");
has(TPL_SRC, "/tools/base64", "模板：互链 base64");
has(TPL_SRC, "Base64 编码/解码", "模板：互链 Base64 编码/解码");
has(TPL_SRC, "/tools/hex-c-array", "模板：互链 hex_c_array");
has(TPL_SRC, "HEX ↔ C 数组互转器", "模板：互链 HEX ↔ C 数组互转器");
notHas(TPL_SRC, "fonts.googleapis", "模板零 CDN：无外部字体");
notHas(TPL_SRC, "cdnjs", "模板零 CDN：无 cdnjs");
notHas(TPL_SRC, "unpkg", "模板零 CDN：无 unpkg");
notHas(TPL_SRC, "jsdelivr", "模板零 CDN：无 jsdelivr");
ok((TPL_SRC.match(/<script[^>]*src="http/g) || []).length === 0, "模板零外部脚本：无 http script src");
var httpLinks = TPL_SRC.match(/<link[^>]*href="http[^"]*"/g) || [];
eq(httpLinks.length, 1, "模板 http link 仅 canonical 一条");
ok(httpLinks.length === 1 && httpLinks[0].indexOf("https://www.johnkingzcq123.xyz/tools/roman-numeral-converter") !== -1, "模板 http link：仅自家 canonical");
has(TPL_SRC, "/tools/static/js/roman_numeral_converter.js", "模板：加载本站 JS");

/* ---------- 14. 浏览器绑定源码级检查 ---------- */
has(JS_SRC, "window.RomanNumeralConverter", "绑定：挂 window.RomanNumeralConverter");
has(JS_SRC, "module.exports", "绑定：module.exports 同步导出");
has(JS_SRC, "MAX_BATCH_LINES = 1000", "绑定：批量上限 1000 行");
has(JS_SRC, "rn-arabic", "绑定：阿拉伯数字输入框");
has(JS_SRC, "rn-roman", "绑定：罗马数字输入框");
has(JS_SRC, "rn-decompose", "绑定：逐位拆解");
has(JS_SRC, "rn-symbol-table", "绑定：符号值对照表");
has(JS_SRC, "rn-batch-input", "绑定：批量输入框");
has(JS_SRC, "rn-batch-btn", "绑定：批量换算按钮");
has(JS_SRC, "rn-quick", "绑定：常用速查");
has(JS_SRC, "rn-quick-years", "绑定：常见年份");
has(JS_SRC, "rn-presets", "绑定：预设示例");
has(JS_SRC, "rn-stats", "绑定：统计面板");
has(JS_SRC, "rn-copy-btn", "绑定：一键复制结果");
has(JS_SRC, "rn-download-btn", "绑定：下载 .txt");
has(JS_SRC, "rn-clear", "绑定：清空");
has(JS_SRC, "罗马数字换算结果.txt", "绑定：下载文件名罗马数字换算结果.txt");
has(JS_SRC, "addEventListener('input', onArabicInput)", "绑定：阿拉伯数字输入即转");
has(JS_SRC, "addEventListener('input', onRomanInput)", "绑定：罗马数字输入即转");
notHas(JS_SRC, "cdnjs", "绑定：无 CDN 引用");
notHas(JS_SRC, "fonts.googleapis", "绑定：无外部字体引用");
notHas(JS_SRC, "XMLHttpRequest", "绑定：无后端请求");
notHas(JS_SRC, "fetch(", "绑定：无 fetch 请求");

console.log("PASS " + pass + " / FAIL " + fail + "（共 " + (pass + fail) + " 断言）");
process.exit(fail === 0 ? 0 : 1);
