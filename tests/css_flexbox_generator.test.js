/* CSS Flexbox 可视化生成器纯逻辑单元测试（零依赖）：node tests/css_flexbox_generator.test.js
 * 覆盖：容器拼串向量、条目拼串向量、组合与预设向量、代码生成向量、
 * 注册、真限制文案、互链与零网络请求。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/css_flexbox_generator.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function throws(fn, name, fieldPart) {
  try { fn(); ok(false, name + "（应抛错却未抛）"); }
  catch (e) {
    var good = e instanceof Error && typeof e.field === "string" && e.field.length > 0;
    if (fieldPart) good = good && e.field.indexOf(fieldPart) >= 0;
    ok(good, name + "（抛错且带 err.field" + (fieldPart ? " " + fieldPart : "") + "，实得 field=" + (e && e.field) + " msg=" + (e && e.message) + "）");
  }
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "css_flexbox_generator.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "css_flexbox_generator.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

var CONTAINER = { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", alignContent: "stretch", gap: 16 };
var ITEM = { grow: 1, shrink: 1, basis: "30%", order: 0, alignSelf: "auto" };

/* ---------- 1. 容器拼串向量 ---------- */
eq(M.buildContainerCss(CONTAINER),
  ".flex-container {\n  display: flex;\n  flex-direction: row;\n  flex-wrap: wrap;\n  justify-content: space-between;\n  align-items: center;\n  align-content: stretch;\n  gap: 16px;\n}",
  "buildContainerCss 已知值拼串");
ok(M.buildContainerCss(CONTAINER).split("\n")[1].trim() === "display: flex;", "容器首行声明为 display: flex;");
throws(function () { M.buildContainerCss({ flexDirection: "diagonal", flexWrap: "wrap", justifyContent: "center", alignItems: "center", alignContent: "stretch", gap: 0 }); }, "容器 direction 枚举外失败", "flexDirection");
throws(function () { M.buildContainerCss({ flexDirection: "row", flexWrap: "fold", justifyContent: "center", alignItems: "center", alignContent: "stretch", gap: 0 }); }, "容器 wrap 枚举外失败", "flexWrap");
throws(function () { M.buildContainerCss({ flexDirection: "row", flexWrap: "wrap", justifyContent: "middle", alignItems: "center", alignContent: "stretch", gap: 0 }); }, "容器 justify 枚举外失败", "justifyContent");
throws(function () { M.buildContainerCss({ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", alignItems: "top", alignContent: "stretch", gap: 0 }); }, "容器 align-items 枚举外失败", "alignItems");
throws(function () { M.buildContainerCss({ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", alignItems: "center", alignContent: "middle", gap: 0 }); }, "容器 align-content 枚举外失败", "alignContent");
throws(function () { M.buildContainerCss({ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", alignItems: "center", alignContent: "stretch", gap: 16.5 }); }, "容器 gap 非整数失败", "gap");
throws(function () { M.buildContainerCss({ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", alignItems: "center", alignContent: "stretch", gap: 65 }); }, "容器 gap 越界 65 失败", "gap");
throws(function () { M.buildContainerCss({ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", alignItems: "center", alignContent: "stretch", gap: -1 }); }, "容器 gap 负数失败", "gap");
eq(M.buildContainerCss({ flexDirection: "column-reverse", flexWrap: "wrap-reverse", justifyContent: "space-evenly", alignItems: "baseline", alignContent: "space-around", gap: 0 }).indexOf("gap: 0px;") >= 0, true, "容器 gap 0 通过且输出 0px");

/* ---------- 2. 条目拼串向量 ---------- */
eq(M.buildItemCss(ITEM), ".flex-item {\n  flex: 1 1 30%;\n  order: 0;\n  align-self: auto;\n}", "buildItemCss 已知值：grow 1 shrink 1 basis 30%");
ok(M.buildItemCss({ grow: 0, shrink: 1, basis: "auto", order: 0, alignSelf: "auto" }).indexOf("flex: 0 1 auto;") >= 0, "条目 basis auto 通过");
ok(M.buildItemCss({ grow: 0, shrink: 1, basis: "0", order: 0, alignSelf: "auto" }).indexOf("flex: 0 1 0;") >= 0, "条目 basis 0 通过");
ok(M.buildItemCss({ grow: 0, shrink: 0, basis: "200px", order: 0, alignSelf: "auto" }).indexOf("flex: 0 0 200px;") >= 0, "条目 basis 200px 通过");
ok(M.buildItemCss({ grow: 0, shrink: 1, basis: "33.33%", order: 0, alignSelf: "auto" }).indexOf("flex: 0 1 33.33%;") >= 0, "条目 basis 33.33% 通过");
throws(function () { M.buildItemCss({ grow: 11, shrink: 1, basis: "auto", order: 0, alignSelf: "auto" }); }, "条目 grow 越界失败", "grow");
throws(function () { M.buildItemCss({ grow: 0, shrink: -1, basis: "auto", order: 0, alignSelf: "auto" }); }, "条目 shrink 越界失败", "shrink");
throws(function () { M.buildItemCss({ grow: 0, shrink: 1, basis: "10em", order: 0, alignSelf: "auto" }); }, "条目 basis em 单位失败", "basis");
throws(function () { M.buildItemCss({ grow: 0, shrink: 1, basis: "101%", order: 0, alignSelf: "auto" }); }, "条目 basis % 越界失败", "basis");
throws(function () { M.buildItemCss({ grow: 0, shrink: 1, basis: "1001px", order: 0, alignSelf: "auto" }); }, "条目 basis px 越界失败", "basis");
throws(function () { M.buildItemCss({ grow: 0, shrink: 1, basis: "auto", order: 1.5, alignSelf: "auto" }); }, "条目 order 非整数失败", "order");
throws(function () { M.buildItemCss({ grow: 0, shrink: 1, basis: "auto", order: 11, alignSelf: "auto" }); }, "条目 order 越界失败", "order");
throws(function () { M.buildItemCss({ grow: 0, shrink: 1, basis: "auto", order: 0, alignSelf: "middle" }); }, "条目 align-self 枚举外失败", "alignSelf");

/* ---------- 3. 组合与预设向量 ---------- */
var combo = M.buildFlexCss(CONTAINER, [ITEM, ITEM, ITEM]);
ok(combo.indexOf(".flex-container {") === 0, "buildFlexCss 以容器块开头");
ok(combo.indexOf(".flex-item-1 {") >= 0 && combo.indexOf(".flex-item-2 {") >= 0 && combo.indexOf(".flex-item-3 {") >= 0, "buildFlexCss 类名连续 1–3");
ok(combo.indexOf(".flex-item-4 {") < 0, "buildFlexCss 无多余条目块");
throws(function () { M.buildFlexCss(CONTAINER, []); }, "条目数 0 失败", "items");
throws(function () {
  var arr = [];
  for (var i = 0; i < 13; i++) arr.push(ITEM);
  M.buildFlexCss(CONTAINER, arr);
}, "条目数 13 失败", "items");
throws(function () { M.buildFlexCss(CONTAINER, [{ grow: 0, shrink: 1, basis: "10em", order: 0, alignSelf: "auto" }]); }, "组合中任一条目非法失败", "basis");
var navbar = M.generatePreset("navbar");
eq(navbar.items.length, 3, "预设 navbar 3 项");
eq(navbar.container.justifyContent, "space-between", "预设 navbar justify space-between");
eq(navbar.container.alignItems, "center", "预设 navbar align-items center");
var center = M.generatePreset("center");
eq(center.items.length, 1, "预设 center 1 项");
eq(center.container.justifyContent, "center", "预设 center justify center");
var cards = M.generatePreset("cards-wrap");
eq(cards.items.length, 6, "预设 cards-wrap 6 项");
eq(cards.container.flexWrap, "wrap", "预设 cards-wrap wrap");
eq(cards.container.gap, 16, "预设 cards-wrap gap 16");
eq(cards.items[0].basis, "30%", "预设 cards-wrap 条目 basis 30%");
eq(cards.items[0].grow, 1, "预设 cards-wrap 条目 grow 1");
var sidebar = M.generatePreset("sidebar");
eq(sidebar.items.length, 2, "预设 sidebar 2 项");
eq(sidebar.items[0].basis, "200px", "预设 sidebar 首项 basis 200px");
eq(sidebar.items[1].grow, 1, "预设 sidebar 次项 grow 1");
throws(function () { M.generatePreset("masonry"); }, "未知预设失败", "preset");

/* ---------- 4. 代码生成向量 ---------- */
var html = M.buildHtmlSnippet(CONTAINER, [ITEM, ITEM]);
ok(html.indexOf("<style>") >= 0 && html.indexOf("</style>") >= 0, "buildHtmlSnippet 含 <style> 内嵌 CSS");
ok(html.indexOf('class="flex-container"') >= 0, "buildHtmlSnippet 含 flex-container 容器 div");
eq((html.match(/<div class="flex-item flex-item-\d+">/g) || []).length, 2, "buildHtmlSnippet 含 2 个条目 div");
ok(html.indexOf("display: flex;") >= 0, "buildHtmlSnippet 内嵌 CSS 含 display: flex;");
throws(function () { M.buildHtmlSnippet(CONTAINER, []); }, "buildHtmlSnippet 条目数 0 失败", "items");
eq(M.suggestExportName("css"), "flexbox.css", "suggestExportName css");
eq(M.suggestExportName("html"), "flexbox-demo.html", "suggestExportName html");
throws(function () { M.suggestExportName("png"); }, "suggestExportName 其它 kind 失败", "kind");

/* ---------- 5. 注册、模板、互链与零网络 ---------- */
ok(GO_SRC.indexOf('"css_flexbox_generator"') >= 0, "categories.go 注册 ID");
ok(GO_SRC.indexOf('"/tools/css-flexbox-generator"') >= 0, "categories.go 注册 Path");
var paths = GO_SRC.match(/"\/tools\/[^"]+"/g) || [];
var uniq = {};
paths.forEach(function (p) { uniq[p] = true; });
eq(Object.keys(uniq).length, 247, "注册 Path 总数→247（历史遗留陈旧断言同步）");
ok(TPL_SRC.indexOf("css-flexbox-generator") >= 0, "模板 canonical 含新 Path");
ok(TPL_SRC.indexOf("只做单维 flex 布局、不做 Grid") >= 0, "真限制 1：单维 flex、不做 Grid");
ok(TPL_SRC.indexOf("不做多断点批量导出") >= 0, "真限制 2：不做多断点批量导出");
ok(TPL_SRC.indexOf("条目数上限 12") >= 0, "真限制 3：条目数上限 12");
ok(TPL_SRC.indexOf("gap 只用 px、basis 只认 auto／px／%") >= 0, "真限制 4：gap 只用 px、basis 只认 auto／px／%");
ok(TPL_SRC.indexOf("不直接生成 Tailwind 类") >= 0, "真限制 5：不直接生成 Tailwind 类");
ok(TPL_SRC.indexOf("不收集、不上传") >= 0, "真限制 6：不收集、不上传");
ok(TPL_SRC.indexOf("/tools/css-to-tailwind") >= 0, "互链：CSS 转 Tailwind");
ok(TPL_SRC.indexOf("/tools/css-gradient-generator") >= 0, "互链：CSS 渐变生成器");
ok(TPL_SRC.indexOf("/tools/css-shadow-radius-generator") >= 0, "互链：CSS 阴影／圆角生成器");
ok(TPL_SRC.indexOf("/tools/css-grid") < 0 && TPL_SRC.indexOf("animation") < 0, "不链未交付的 Grid／动画工具");
ok(TPL_SRC.indexOf("flexbox.css") >= 0 && TPL_SRC.indexOf("flexbox-demo.html") >= 0, "模板含两下载文件名");
ok(TPL_SRC.indexOf("载入示例") >= 0, "模板含载入示例按钮");
ok(TPL_SRC.indexOf("cfb-preview") >= 0 && TPL_SRC.indexOf("cfb-item-select") >= 0, "模板含预览区与条目选择");
ok(TPL_SRC.indexOf("cfb-preset-navbar") >= 0 && TPL_SRC.indexOf("cfb-preset-center") >= 0 && TPL_SRC.indexOf("cfb-preset-cards-wrap") >= 0 && TPL_SRC.indexOf("cfb-preset-sidebar") >= 0, "模板含四预设按钮");
ok(JS_SRC.indexOf("fetch(") < 0 && JS_SRC.indexOf("XMLHttpRequest") < 0, "JS 零 fetch／XHR");
var tplNoCanonical = TPL_SRC.split("\n").filter(function (l) { return l.indexOf("johnkingzcq123.xyz") < 0; }).join("\n");
ok(tplNoCanonical.indexOf('src="http') < 0 && tplNoCanonical.indexOf('href="http') < 0, "模板零 CDN 外链（canonical／OG 自身域名除外）");
ok(JS_SRC.indexOf("buildContainerCss") >= 0 && JS_SRC.indexOf("buildItemCss") >= 0 && JS_SRC.indexOf("buildFlexCss") >= 0 && JS_SRC.indexOf("buildHtmlSnippet") >= 0 && JS_SRC.indexOf("generatePreset") >= 0 && JS_SRC.indexOf("suggestExportName") >= 0, "JS 含六个核心纯函数");

console.log("PASS " + pass + " / FAIL " + fail);
if (fail > 0) process.exit(1);
