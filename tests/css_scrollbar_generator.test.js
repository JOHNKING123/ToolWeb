/* CSS 滚动条样式生成器纯逻辑单元测试（零依赖）：node tests/css_scrollbar_generator.test.js
 * 覆盖：颜色与校验向量、双轨合成向量、预设与导出向量、
 * 注册与零网络请求静态检查。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/css_scrollbar_generator.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function throws(fn, field, name) {
  try { fn(); ok(false, name + "（应抛错却未抛）"); }
  catch (e) { ok(!field || e.field === field, name + "（err.field 期望 " + field + "，实得 " + e.field + "）"); }
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "css_scrollbar_generator.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "css_scrollbar_generator.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

function cfg(o) {
  var base = { width: 12, trackColor: "#f1f1f1", trackRadius: 6,
    thumbColor: "#c1c1c1", thumbRadius: 6, thumbHoverColor: "#a8a8a8" };
  if (o) Object.keys(o).forEach(function (k) { base[k] = o[k]; });
  return base;
}

/* ---------- 1. parseHexColor ---------- */
eq(M.parseHexColor("#FFF"), "#ffffff", "parse #FFF→#ffffff");
eq(M.parseHexColor("#00E5FF"), "#00e5ff", "parse #00E5FF→#00e5ff");
eq(M.parseHexColor("#abc"), "#aabbcc", "parse #abc→#aabbcc");
throws(function () { M.parseHexColor("red"); }, "color", "parse 颜色名失败");
throws(function () { M.parseHexColor("rgb(255, 255, 255)"); }, "color", "parse rgb() 失败");
throws(function () { M.parseHexColor(""); }, "color", "parse 空串失败");
throws(function () { M.parseHexColor("#FF"); }, "color", "parse #FF 两位失败");
throws(function () { M.parseHexColor("#GGGGGG"); }, "color", "parse 非十六进制失败");
throws(function () { M.parseHexColor(123); }, "color", "parse 非字符串失败");

/* ---------- 2. validateScrollbar ---------- */
var v = M.validateScrollbar(cfg());
eq(v.width, 12, "validate light 宽度通过");
eq(v.trackColor, "#f1f1f1", "validate light 轨道色通过");
eq(v.thumbHoverColor, "#a8a8a8", "validate light 悬停色通过");
eq(M.validateScrollbar(cfg({ trackColor: "#ABC" })).trackColor, "#aabbcc", "validate 颜色归一化小写");
eq(M.validateScrollbar(cfg({ width: 2, trackRadius: 0, thumbRadius: 0 })).width, 2, "validate 下界通过");
eq(M.validateScrollbar(cfg({ width: 32, trackRadius: 32, thumbRadius: 32 })).width, 32, "validate 上界通过");
eq(M.validateScrollbar(cfg({ width: 12.5 })).width, 12.5, "validate 2 位小数通过");
throws(function () { M.validateScrollbar(cfg({ width: 1 })); }, "width", "validate width 1 越界失败");
throws(function () { M.validateScrollbar(cfg({ width: 33 })); }, "width", "validate width 33 越界失败");
throws(function () { M.validateScrollbar(cfg({ trackRadius: -1 })); }, "trackRadius", "validate 轨道圆角负值失败");
throws(function () { M.validateScrollbar(cfg({ thumbRadius: 33 })); }, "thumbRadius", "validate 滑块圆角越界失败");
throws(function () { M.validateScrollbar(cfg({ width: 12.555 })); }, "width", "validate 超 2 位小数失败");
throws(function () { M.validateScrollbar(cfg({ trackColor: "white" })); }, "trackColor", "validate 轨道非法颜色失败");
throws(function () { M.validateScrollbar(cfg({ thumbColor: "" })); }, "thumbColor", "validate 滑块空颜色失败");
throws(function () { M.validateScrollbar(cfg({ thumbHoverColor: undefined })); }, "thumbHoverColor", "validate 缺失悬停色失败");
throws(function () { M.validateScrollbar(null); }, "scrollbar", "validate 非对象失败");

/* ---------- 3. buildWebkitCss：light 4 行字面一致 ---------- */
var light = M.generatePreset("light").cfg;
var webkit = M.buildWebkitCss(light);
var wlines = webkit.split("\n");
eq(wlines.length, 4, "WebKit 4 行");
eq(wlines[0], ".scroll-area::-webkit-scrollbar { width: 12px; height: 12px; }", "WebKit 首行 width 与 height 同值 12px");
eq(wlines[1], ".scroll-area::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 6px; }", "WebKit 轨道行");
eq(wlines[2], ".scroll-area::-webkit-scrollbar-thumb { background: #c1c1c1; border-radius: 6px; }", "WebKit 滑块行");
eq(wlines[3], ".scroll-area::-webkit-scrollbar-thumb:hover { background: #a8a8a8; }", "WebKit hover 行只含背景色");
throws(function () { M.buildWebkitCss(cfg({ width: 33 })); }, "width", "WebKit 越界失败");

/* ---------- 4. buildFirefoxCss ---------- */
var firefox = M.buildFirefoxCss(light);
var flines = firefox.split("\n");
eq(flines.length, 4, "Firefox 4 行");
eq(flines[0], ".scroll-area {", "Firefox 首行");
eq(flines[1], "  scrollbar-width: auto;", "Firefox light 为 auto");
eq(flines[2], "  scrollbar-color: #c1c1c1 #f1f1f1;", "Firefox scrollbar-color thumb＋track");
eq(flines[3], "}", "Firefox 末行");
ok(firefox.indexOf("border-radius") === -1, "Firefox 无 border-radius");
eq(M.buildFirefoxCss(M.generatePreset("thin").cfg).split("\n")[1], "  scrollbar-width: thin;", "Firefox thin 预设（width 6）为 thin");
eq(M.buildFirefoxCss(cfg({ width: 8 })).split("\n")[1], "  scrollbar-width: thin;", "Firefox width 8 边界为 thin");
eq(M.buildFirefoxCss(cfg({ width: 8.01 })).split("\n")[1], "  scrollbar-width: auto;", "Firefox width 8.01 为 auto");
throws(function () { M.buildFirefoxCss(cfg({ thumbColor: "red" })); }, "thumbColor", "Firefox 非法颜色失败");

/* ---------- 5. buildCssSnippet：4＋空行＋4 ---------- */
var snippet = M.buildCssSnippet(light);
var slines = snippet.split("\n");
eq(slines.length, 9, "完整 CSS 9 行");
eq(slines[4], "", "完整 CSS 第 5 行为空行");
eq(slines.slice(0, 4).join("\n"), webkit, "完整 CSS 前 4 行为 WebKit");
eq(slines.slice(5).join("\n"), firefox, "完整 CSS 后 4 行为 Firefox");
throws(function () { M.buildCssSnippet(cfg({ trackRadius: 33 })); }, "trackRadius", "完整 CSS 越界失败");

/* ---------- 6. contrast 预设两 radius 均为 0px ---------- */
var contrastWebkit = M.buildWebkitCss(M.generatePreset("contrast").cfg);
ok(contrastWebkit.indexOf("border-radius: 0px;") !== -1, "contrast 轨道圆角 0px");
eq(contrastWebkit.split("border-radius: 0px;").length - 1, 2, "contrast 两 radius 行均为 0px");

/* ---------- 7. generatePreset 六预设字面一致 ---------- */
var expected = {
  light: { width: 12, trackColor: "#f1f1f1", trackRadius: 6, thumbColor: "#c1c1c1", thumbRadius: 6, thumbHoverColor: "#a8a8a8" },
  dark: { width: 12, trackColor: "#1e1e1e", trackRadius: 6, thumbColor: "#4d4d4d", thumbRadius: 6, thumbHoverColor: "#6e6e6e" },
  thin: { width: 6, trackColor: "#f5f5f5", trackRadius: 3, thumbColor: "#bdbdbd", thumbRadius: 3, thumbHoverColor: "#9e9e9e" },
  rounded: { width: 16, trackColor: "#e8e8e8", trackRadius: 8, thumbColor: "#888888", thumbRadius: 8, thumbHoverColor: "#666666" },
  blue: { width: 10, trackColor: "#e3f2fd", trackRadius: 5, thumbColor: "#64b5f6", thumbRadius: 5, thumbHoverColor: "#42a5f5" },
  contrast: { width: 14, trackColor: "#ffffff", trackRadius: 0, thumbColor: "#000000", thumbRadius: 0, thumbHoverColor: "#333333" }
};
Object.keys(expected).forEach(function (name) {
  var got = M.generatePreset(name);
  eq(got.name, name, "预设 " + name + " 名称");
  Object.keys(expected[name]).forEach(function (k) {
    eq(got.cfg[k], expected[name][k], "预设 " + name + " " + k);
  });
});
throws(function () { M.generatePreset("unknown"); }, "preset", "预设未知失败");
var p1 = M.generatePreset("light");
p1.cfg.width = 99;
eq(M.generatePreset("light").cfg.width, 12, "预设返回全新副本不互相污染");

/* ---------- 8. buildHtmlSnippet ---------- */
var html = M.buildHtmlSnippet(light);
ok(html.indexOf("<style>") !== -1, "HTML 含 <style>");
ok(html.indexOf('class="scroll-area"') !== -1, "HTML 含 class scroll-area");
ok(html.indexOf("<script") === -1, "HTML 无 script");
ok(html.indexOf(".scroll-area::-webkit-scrollbar") !== -1, "HTML 内嵌完整 WebKit CSS");
ok(html.indexOf("height: 240px;") !== -1, "HTML 预览区高 240px");
ok(html.indexOf("overflow-y: auto;") !== -1, "HTML 预览区 overflow-y auto");
ok(html.indexOf("滚动条是界面里最容易被忽视的细节") !== -1, "HTML 含内置中文示例文字");
throws(function () { M.buildHtmlSnippet(cfg({ width: 1 })); }, "width", "HTML 越界失败");

/* ---------- 9. suggestExportName ---------- */
eq(M.suggestExportName("css"), "scrollbar.css", "导出 css→scrollbar.css");
eq(M.suggestExportName("html"), "scrollbar-demo.html", "导出 html→scrollbar-demo.html");
throws(function () { M.suggestExportName("js"); }, "kind", "导出其它 kind 失败");
throws(function () { M.suggestExportName(""); }, "kind", "导出空 kind 失败");

/* ---------- 10. 注册与零网络请求静态检查 ---------- */
ok(GO_SRC.indexOf('"css_scrollbar_generator"') !== -1, "注册 ID css_scrollbar_generator");
ok(GO_SRC.indexOf('"/tools/css-scrollbar-generator"') !== -1, "注册 Path /tools/css-scrollbar-generator");
ok(GO_SRC.indexOf('Category:    "开发工具"') !== -1, "注册含开发工具品类");
var regIdx = GO_SRC.indexOf('"css_scrollbar_generator"');
var regBlock = GO_SRC.slice(regIdx, regIdx + 900);
ok(regBlock.indexOf("New:         true") !== -1, "注册 New: true");
ok(regBlock.indexOf('Category:    "开发工具"') !== -1, "注册块内 Category 开发工具");
ok(regBlock.indexOf("swap_vert") !== -1, "注册 Icon swap_vert");
var pathCount = (GO_SRC.match(/Path:/g) || []).length;
eq(pathCount, 245, "注册总数→245 Path（历史遗留陈旧断言同步）");
ok(JS_SRC.indexOf("fetch(") === -1, "JS 零 fetch");
ok(JS_SRC.indexOf("XMLHttpRequest") === -1, "JS 零 XHR");
ok(TPL_SRC.indexOf("src=\"http") === -1, "模板零外部脚本");
ok(TPL_SRC.indexOf("/tools/css-shadow-radius-generator") !== -1, "互链含阴影圆角生成器");
ok(TPL_SRC.indexOf("/tools/css-gradient-generator") !== -1, "互链含渐变生成器");
ok(TPL_SRC.indexOf("/tools/css-glass-generator") !== -1, "互链含毛玻璃生成器");
ok(TPL_SRC.indexOf("/tools/css-button-generator") === -1, "互链不含未交付按钮生成器");
ok(TPL_SRC.indexOf("/tools/css-unit-converter") === -1, "互链不含未交付单位换算器");
ok(TPL_SRC.indexOf("只做滚动条样式声明") !== -1, "真限制：只做滚动条样式声明可见");
ok(TPL_SRC.indexOf("不做 JS 模拟滚动条") !== -1, "真限制：不做 JS 模拟滚动条可见");
ok(TPL_SRC.indexOf("滚动进度条") !== -1, "真限制：不做滚动进度条可见");
ok(TPL_SRC.indexOf("不做渐变滑块") !== -1, "真限制：不做渐变滑块可见");
ok(TPL_SRC.indexOf("Firefox 不支持圆角与像素宽度") !== -1, "真限制：Firefox 不支持圆角与像素宽度可见");
ok(TPL_SRC.indexOf("移动端基本不生效") !== -1, "真限制：移动端基本不生效可见");
ok(TPL_SRC.indexOf("不收集") !== -1 && TPL_SRC.indexOf("不上传") !== -1, "真限制：不收集不上传可见");
["light", "dark", "thin", "rounded", "blue", "contrast"].forEach(function (name) {
  ok(TPL_SRC.indexOf('data-preset="' + name + '"') !== -1, "模板含 " + name + " 预设按钮");
});
ok(TPL_SRC.indexOf('class="scroll-area"') !== -1, "模板含可滚动预览面板");
ok(TPL_SRC.indexOf('id="sb-code-webkit"') !== -1, "模板含 WebKit 代码栏");
ok(TPL_SRC.indexOf('id="sb-code-firefox"') !== -1, "模板含 Firefox 代码栏");
ok(TPL_SRC.indexOf('id="sb-copy-webkit"') !== -1, "模板含复制 WebKit 按钮");
ok(TPL_SRC.indexOf('id="sb-download-css"') !== -1, "模板含下载 .css 按钮");
ok(TPL_SRC.indexOf('id="sb-download-html"') !== -1, "模板含下载 HTML 按钮");
ok(TPL_SRC.indexOf('id="sb-load-example"') !== -1, "模板含载入示例按钮");

console.log("PASS " + pass + " / FAIL " + fail);
process.exit(fail ? 1 : 0);
