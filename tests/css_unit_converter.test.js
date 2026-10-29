/* CSS 单位换算器纯函数单元测试（零依赖）：node tests/css_unit_converter.test.js
 * 覆盖：validateValue / validateCtx / toPx / fromPx / formatNumber /
 * convertAll / formatUnitValue / generateExample / suggestExportName、
 * 示例 ctx 换算向量、源码零 fetch/XHR/外部请求。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var c = require("../static/js/css_unit_converter.js");
var SRC = fs.readFileSync(path.join(__dirname, "..", "static", "js", "css_unit_converter.js"), "utf8");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function errField(fn, field, name) {
    try { fn(); }
    catch (e) { ok(e && e.field === field, name + "（期望 err.field=" + field + "，实得 " + (e && e.field) + "）"); return; }
    fail++; console.error("FAIL:", name, "（期望抛错，未抛）");
}

/* ---- 1. validateValue ---- */
eq(c.validateValue("16"), 16, "validateValue('16')→16");
eq(c.validateValue(" 1.5 "), 1.5, "validateValue(' 1.5 ')→1.5（trim）");
eq(c.validateValue(0), 0, "validateValue(0)→0");
errField(function () { c.validateValue("16px"); }, "value", "validateValue('16px') 判失败（带单位写法拒绝）");
errField(function () { c.validateValue(""); }, "value", "validateValue('') 判失败");
errField(function () { c.validateValue("   "); }, "value", "validateValue(纯空格) 判失败");
errField(function () { c.validateValue(NaN); }, "value", "validateValue(NaN) 判失败");
errField(function () { c.validateValue(Infinity); }, "value", "validateValue(Infinity) 判失败");

/* ---- 2. validateCtx ---- */
var def = c.validateCtx(undefined);
eq(def.rootFontSize, 16, "validateCtx 缺省：rootFontSize=16");
eq(def.parentFontSize, 16, "validateCtx 缺省：parentFontSize=16");
eq(def.viewportWidth, 1920, "validateCtx 缺省：viewportWidth=1920");
eq(def.viewportHeight, 1080, "validateCtx 缺省：viewportHeight=1080");
eq(def.dpi, 96, "validateCtx 缺省：dpi=96");
eq(Object.keys(def).length, 5, "validateCtx 返回完整五字段");
errField(function () { c.validateCtx({ rootFontSize: 0 }); }, "rootFontSize", "validateCtx rootFontSize=0 判失败，err.field 正确");
errField(function () { c.validateCtx({ rootFontSize: -1 }); }, "rootFontSize", "validateCtx rootFontSize=-1 判失败，err.field 正确");
errField(function () { c.validateCtx({ rootFontSize: NaN }); }, "rootFontSize", "validateCtx rootFontSize=NaN 判失败，err.field 正确");
errField(function () { c.validateCtx({ viewportHeight: "abc" }); }, "viewportHeight", "validateCtx viewportHeight='abc' 判失败，err.field 正确");

/* ---- 3. 换算向量：默认 ctx ---- */
function row(rows, unit) {
    for (var i = 0; i < rows.length; i++) if (rows[i].unit === unit) return rows[i].value;
    return undefined;
}
var r16 = c.convertAll(16, "px");
eq(r16.length, 14, "convertAll 返回 14 项");
eq(r16.map(function (x) { return x.unit; }).join(","), c.SUPPORTED_UNITS.join(","), "convertAll 顺序与 SUPPORTED_UNITS 一致");
eq(row(r16, "rem"), 1, "默认 ctx：16px→rem=1");
eq(row(r16, "pt"), 12, "默认 ctx：16px→pt=12");
eq(row(r16, "in"), 0.1667, "默认 ctx：16px→in=0.1667（4 位小数）");
eq(row(r16, "pc"), 1, "默认 ctx：16px→pc=1");
eq(row(r16, "Q"), 42.3333, "默认 ctx：16px→Q=42.3333");

/* ---- 4. 换算向量：示例 ctx（根 16 / 父级 20 / 视口 1920×1080） ---- */
var ex = c.generateExample();
var exCtx = ex.ctx;
var rex = c.convertAll(16, "px", exCtx);
eq(row(rex, "rem"), 1, "示例 ctx：16px→rem=1（根 16）");
eq(row(rex, "em"), 0.8, "示例 ctx：16px→em=0.8（父级 20）");
eq(row(rex, "vw"), 0.8333, "示例 ctx：16px→vw=0.8333（1920/100=19.2）");
eq(row(rex, "%"), 80, "示例 ctx：16px→%=80（父级 20）");
eq(row(rex, "vh"), 1.4815, "示例 ctx：16px→vh=1.4815（1080/100=10.8）");
eq(row(rex, "vmin"), 1.4815, "示例 ctx：16px→vmin=1.4815（较小边 1080）");
eq(row(rex, "vmax"), 0.8333, "示例 ctx：16px→vmax=0.8333（较大边 1920）");

/* ---- 5. toPx / fromPx 逆运算 ---- */
eq(c.toPx(1, "rem"), 16, "toPx(1,'rem')=16（默认 ctx）");
eq(c.toPx(1, "in"), 96, "toPx(1,'in')=96（96dpi）");
eq(c.toPx(1, "em", exCtx), 20, "toPx(1,'em',示例 ctx)=20");
eq(c.toPx(50, "vw", exCtx), 960, "toPx(50,'vw',示例 ctx)=960");
eq(c.fromPx(16, "rem"), 1, "fromPx(16,'rem')=1（逆运算一致）");
eq(c.fromPx(960, "vw", exCtx), 50, "fromPx(960,'vw',示例 ctx)=50（逆运算一致）");
errField(function () { c.toPx(16, "xx"); }, "unit", "toPx 不支持的单位判失败");
errField(function () { c.fromPx(16, "rem", { dpi: 0 }); }, "dpi", "fromPx 非法 ctx 判失败");

/* ---- 6. formatNumber ---- */
eq(c.formatNumber(1.2), 1.2, "formatNumber(1.2)→1.2");
eq(c.formatNumber(1.2000), 1.2, "formatNumber(1.2000)→1.2（去尾零）");
eq(c.formatNumber(0.166666), 0.1667, "formatNumber(0.166666)→0.1667（四舍五入 4 位）");
eq(c.formatNumber(80), 80, "formatNumber(80)→80");
eq(typeof c.formatNumber(1.2), "number", "formatNumber 返回数字（非字符串）");
errField(function () { c.formatNumber(NaN); }, "n", "formatNumber(NaN) 判失败");

/* ---- 7. formatUnitValue ---- */
eq(c.formatUnitValue(1.5, "rem"), "1.5rem", "formatUnitValue(1.5,'rem')→'1.5rem'");
eq(c.formatUnitValue(16, "px"), "16px", "formatUnitValue(16,'px')→'16px'");
errField(function () { c.formatUnitValue(1.5, "xx"); }, "unit", "formatUnitValue 不支持的单位判失败");

/* ---- 8. generateExample 字段字面 ---- */
eq(ex.value, 16, "generateExample().value=16");
eq(ex.unit, "px", "generateExample().unit='px'");
eq(ex.ctx.rootFontSize, 16, "generateExample().ctx.rootFontSize=16");
eq(ex.ctx.parentFontSize, 20, "generateExample().ctx.parentFontSize=20（与 rem 基准不同）");
eq(ex.ctx.viewportWidth, 1920, "generateExample().ctx.viewportWidth=1920");
eq(ex.ctx.viewportHeight, 1080, "generateExample().ctx.viewportHeight=1080");
eq(ex.ctx.dpi, 96, "generateExample().ctx.dpi=96");
eq(JSON.stringify(Object.keys(ex.ctx).sort()), JSON.stringify(["dpi","parentFontSize","rootFontSize","viewportHeight","viewportWidth"]), "generateExample ctx 字段齐全");

/* ---- 9. suggestExportName ---- */
eq(c.suggestExportName("txt"), "css-units.txt", "suggestExportName('txt')→css-units.txt");
eq(c.suggestExportName("json"), "css-units.json", "suggestExportName('json')→css-units.json");
errField(function () { c.suggestExportName("csv"); }, "kind", "suggestExportName('csv') 判失败（不编造文件名）");
errField(function () { c.suggestExportName(""); }, "kind", "suggestExportName('') 判失败");

/* ---- 10. 源码零网络请求自检 ---- */
ok(SRC.indexOf("fetch(") === -1, "JS 源码无 fetch(");
ok(SRC.indexOf("XMLHttpRequest") === -1, "JS 源码无 XMLHttpRequest");
ok(SRC.indexOf("http://") === -1 && SRC.indexOf("https://") === -1, "JS 源码无 http(s) 外链");

console.log("\n通过 " + pass + "，失败 " + fail + "。");
process.exit(fail ? 1 : 0);
