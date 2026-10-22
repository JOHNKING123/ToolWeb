/* 单位感知记事本计算器纯逻辑单元测试（零依赖）：node tests/unit_calc_notepad.test.js
 * 覆盖：词法（数字/单位/货币/保留字/范围/注释）、四则与优先级、单位归一化、
 * 温度转换、行间变量、范围汇总、百分比、货币标签、派生单位、错误隔离、
 * 汇总分组、示例可运行、源码零 fetch/XHR。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var uc = require("../static/js/unit_calc_notepad.js");
var SRC = fs.readFileSync(path.join(__dirname, "..", "static", "js", "unit_calc_notepad.js"), "utf8");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function contains(hay, needle, name) { ok(hay.indexOf(needle) !== -1, name + "（期望包含 " + JSON.stringify(needle) + "）"); }

/* 求值辅助：单行（独立 env）/ 多行（共享 env） */
function val(line) {
    var r = uc.evaluateLine(line, {});
    return r.type === "ok" ? uc.fmtQty(r.qty) : "ERR:" + r.error;
}
function isErr(line) { return uc.evaluateLine(line, {}).type === "error"; }
function linesVal(lines) {
    var ev = uc.evaluateAll(lines);
    return ev.results.map(function (r) { return r.type === "ok" ? uc.fmtQty(r.qty) : "ERR"; });
}

/* ---------- 1. 词法 ---------- */
(function () {
    var t = uc.tokenize("5kg * 3").tokens;
    eq(t.length, 4, "5kg * 3 切出 4 个 token");
    eq(t[0].t, "num", "首 token 是数字");
    eq(t[1].t, "unit", "数字后 kg 识别为单位");
    eq(t[1].u.sym, "kg", "单位符号 kg");
    var t2 = uc.tokenize("25C to F").tokens;
    eq(t2[1].u.sym, "°C", "C 识别为摄氏度");
    eq(t2[2].v, "to", "to 保留为标识符");
    var t3 = uc.tokenize("sum(a1..a3)").tokens;
    eq(t3[3].t, "range", "a1..a3 切出 range token");
    var t4 = uc.tokenize("¥100 + $50").tokens;
    eq(t4[0].t, "money", "¥ 识别为货币前缀");
    eq(t4[0].v, "¥", "货币标签 ¥");
    var t5 = uc.tokenize("5 to kg").tokens;
    eq(t5[1].v, "to", "5 to kg：to 不被吃成吨(t)");
    ok(uc.tokenize("5 @ 3").error, "非法字符 @ 报词法错");
    eq(uc.tokenize("2in").tokens[1].u.sym, "in", "in 识别为英寸");
    eq(uc.tokenize("5min").tokens[1].u.sym, "min", "5min 最长匹配分钟而非米+in");
})();

/* ---------- 2. 四则与优先级 ---------- */
(function () {
    eq(val("1 + 2 * 3"), "7", "乘法优先");
    eq(val("(1 + 2) * 3"), "9", "括号");
    eq(val("10 - 4 - 3"), "3", "减法左结合");
    eq(val("100 / 4 / 5"), "5", "除法左结合");
    eq(val("-5 + 3"), "-2", "一元负号");
    eq(val("2 * (3 + 4)"), "14", "括号内加法");
    eq(val("0.1 + 0.2"), "0.3", "浮点 0.1+0.2 精确显示");
})();

/* ---------- 3. 单位归一化（加减取最先出现单位） ---------- */
(function () {
    eq(val("5kg * 3"), "15 kg", "5kg*3 → 15 kg");
    eq(val("10km + 500m"), "10.5 km", "10km+500m → 10.5 km");
    eq(val("500m + 10km"), "10500 m", "500m+10km → 10500 m（首单位 m）");
    eq(val("2.5kg + 1800g"), "4.3 kg", "kg+g 归一化到 kg");
    eq(val("1h + 30min"), "1.5 h", "时间加法归一化到 h");
    eq(val("1L - 250mL"), "0.75 L", "体积减法");
    eq(val("5千米 + 300米"), "5.3 km", "中文单位别名");
    eq(val("3斤 + 500g"), "4 斤", "斤参与换算（归一化到首单位斤）");
    ok(isErr("5kg + 3s"), "重量+时间维度不一致报错");
    ok(isErr("10m + 5"), "长度+纯数字报错");
})();

/* ---------- 4. 温度 ---------- */
(function () {
    eq(val("25C to F"), "77°F", "25℃ → 77℉");
    eq(val("77F to C"), "25°C", "77℉ → 25℃");
    eq(val("0C to K"), "273.15 K", "0℃ → 273.15K");
    eq(val("100C to F"), "212°F", "100℃ → 212℉");
    eq(val("25℃ -> ℉"), "77°F", "-> 与中文温标符号");
    eq(val("25C + 10C"), "35°C", "温度可加减");
    ok(isErr("25C to m"), "温度转长度报错");
    ok(isErr("25C * 25C"), "温度相乘报错");
})();

/* ---------- 5. 单位转换 ---------- */
(function () {
    eq(val("10km -> m"), "10000 m", "km→m");
    eq(val("1mi to km"), "1.609344 km", "英里→千米");
    eq(val("2h to min"), "120 min", "小时→分钟");
    eq(val("1gal to L"), "3.785411784 L", "加仑→升");
    eq(val("5 to kg"), "5 kg", "纯数字 to 单位视为附加单位");
    ok(isErr("10kg to m"), "重量转长度报错");
})();

/* ---------- 6. 行间变量 ---------- */
(function () {
    var r = linesVal(["total = 5kg * 3", "total + 5kg", "total / 2"]);
    eq(r[0], "15 kg", "赋值行结果");
    eq(r[1], "20 kg", "后行引用变量");
    eq(r[2], "7.5 kg", "变量参与除法");
    var r2 = linesVal(["长 = 5.6m", "宽 = 4.2m", "长 * 宽"]);
    eq(r2[2], "23.52 m²", "中文变量名");
    ok(isErr("nothing + 1"), "未定义变量报错");
    ok(isErr("to = 5"), "保留字不能做变量名");
})();

/* ---------- 7. 范围汇总 sum(a1..a3) ---------- */
(function () {
    var r = linesVal(["a1 = 2.5kg", "a2 = 1800g", "a3 = 1.2kg", "sum(a1..a3)", "avg(a1..a3)", "max(a1..a3)", "min(a1..a3)", "count(a1..a3)"]);
    eq(r[3], "5.5 kg", "sum(a1..a3)");
    eq(r[4], "1.833333333 kg", "avg(a1..a3)");
    eq(r[5], "2.5 kg", "max(a1..a3)");
    eq(r[6], "1.2 kg", "min(a1..a3)");
    eq(r[7], "3", "count(a1..a3)");
    eq(val("sum(1, 2, 3)"), "6", "sum 逗号参数");
    ok(isErr("sum(a1..a9)"), "范围含未定义变量报错");
    var r2 = linesVal(["x1 = 1", "x3 = 3", "sum(x1..x3)"]);
    eq(r2[2], "ERR", "范围中间缺变量报错");
})();

/* ---------- 8. 百分比 ---------- */
(function () {
    eq(val("5% of 200"), "10", "5% of 200");
    eq(val("200 + 5%"), "210", "200+5% → 210");
    eq(val("200 - 5%"), "190", "200-5% → 190");
    eq(val("200 * 5%"), "10", "200*5% → 10");
    eq(val("5%"), "0.05", "裸 5% → 0.05");
    eq(val("200 * 1.05"), "210", "200*1.05 普通乘法");
    ok(isErr("5kg %"), "% 不能用于带单位数");
})();

/* ---------- 9. 货币（纯标签） ---------- */
(function () {
    eq(val("¥100 + ¥50"), "¥150", "¥ 加法保留符号");
    eq(val("¥100 * 3"), "¥300", "¥ 乘法");
    eq(val("100$ + 50$"), "$150", "后缀 $ 写法");
    eq(val("€30 + €20"), "€50", "€ 加法");
    ok(isErr("¥100 + $50"), "不同货币符号不能相加");
    ok(isErr("¥100 to $"), "货币不参与换算");
})();

/* ---------- 10. 派生单位 ---------- */
(function () {
    eq(val("2m * 3m"), "6 m²", "面积派生 m²");
    eq(val("10km / 2h"), "5 km/h", "速度派生 km/h");
    eq(val("10km / 2km"), "5", "同单位相除得纯数字");
    eq(val("100 / 4"), "25", "纯数字除法");
    ok(isErr("10 / 0"), "除零报错");
})();

/* ---------- 11. 错误隔离与注释 ---------- */
(function () {
    var r = linesVal(["1 + 1", "broken +", "3 * 3", "# 这是注释", "", "5 -"]);
    eq(r[0], "2", "非法行之前行正常");
    eq(r[2], "9", "非法行之后行正常");
    eq(r[1], "ERR", "非法行标记错误");
    eq(r[5], "ERR", "不完整算式标记错误");
    var r2 = linesVal(["10 + 5 # 行尾注释", "// 整行注释"]);
    eq(r2[0], "15", "行尾 # 注释被忽略");
    ok(uc.evaluateLine("# only comment", {}).type === "empty", "纯注释行为空行");
    ok(uc.evaluateLine("   ", {}).type === "empty", "空白行为空行");
})();

/* ---------- 12. 汇总区 ---------- */
(function () {
    var ev = uc.evaluateAll(["2.5kg", "1800g", "total = 99kg", "100", "200"]);
    var g = uc.summarize(ev.results);
    eq(g.length, 2, "重量/纯数字两个分组");
    eq(g[0].title, "重量", "第一分组为重量");
    eq(g[0].count, 2, "赋值行不计入汇总");
    eq(g[0].sum, "4.3 kg", "重量分组求和");
    eq(g[0].avg, "2.15 kg", "重量分组平均");
    eq(g[0].max, "2.5 kg", "重量分组最大值");
    eq(g[0].min, "1.8 kg", "重量分组最小值");
    eq(g[1].sum, "300", "纯数字分组求和");
    eq(uc.summarize([]).length, 0, "空输入无分组");
})();

/* ---------- 13. 内置示例可运行 ---------- */
(function () {
    [uc.EXAMPLE_PACK, uc.EXAMPLE_RENO].forEach(function (ex, k) {
        var ev = uc.evaluateAll(ex.split("\n"));
        var bad = ev.results.filter(function (r) { return r.type === "error"; });
        eq(bad.length, 0, "示例" + (k + 1) + "全部行无错误");
        var okCount = ev.results.filter(function (r) { return r.type === "ok"; }).length;
        ok(okCount >= 5, "示例" + (k + 1) + "有足够多的结果行");
    });
})();

/* ---------- 14. 源码零 fetch/XHR ---------- */
(function () {
    ok(!/fetch\s*\(/.test(SRC), "源码无 fetch(");
    ok(!/XMLHttpRequest/.test(SRC), "源码无 XMLHttpRequest");
    ok(!/\beval\s*\(/.test(SRC), "源码无 eval(");
    ok(!/Function\s*\(/.test(SRC), "源码无 new Function");
})();

console.log("PASS " + pass + " / FAIL " + fail + "（共 " + (pass + fail) + " 断言）");
process.exit(fail ? 1 : 0);
