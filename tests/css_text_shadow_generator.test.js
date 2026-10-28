/* CSS 文字阴影生成器纯逻辑单元测试（零依赖）：node tests/css_text_shadow_generator.test.js
 * 覆盖：颜色与单层向量、图层集合向量、组合与预设向量、代码生成向量、
 * 注册与零网络请求静态检查。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/css_text_shadow_generator.js");

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
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "css_text_shadow_generator.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "css_text_shadow_generator.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

var L = function (o) {
  return { offsetX: 0, offsetY: 0, blur: 0, color: "#000000", opacity: 1, };
};
function merge(base, patch) {
  var out = {};
  Object.keys(base).forEach(function (k) { out[k] = base[k]; });
  Object.keys(patch).forEach(function (k) { out[k] = patch[k]; });
  return out;
}

/* ---------- 1. parseHexColor：已知值与非法 ---------- */
eq(M.parseHexColor("#FFF"), "#ffffff", "parseHexColor #FFF→#ffffff");
eq(M.parseHexColor("#00E5FF"), "#00e5ff", "parseHexColor #00E5FF→#00e5ff");
eq(M.parseHexColor("#abc"), "#aabbcc", "parseHexColor #abc 展开");
eq(M.parseHexColor("#AABBCC"), "#aabbcc", "parseHexColor 大写转小写");
throws(function () { M.parseHexColor("red"); }, "color", "parseHexColor 颜色名失败");
throws(function () { M.parseHexColor("rgb(255,0,0)"); }, "color", "parseHexColor rgb() 失败");
throws(function () { M.parseHexColor(""); }, "color", "parseHexColor 空串失败");
throws(function () { M.parseHexColor("#12345"); }, "color", "parseHexColor 5 位失败");
throws(function () { M.parseHexColor("#GGGGGG"); }, "color", "parseHexColor 非法字符失败");
throws(function () { M.parseHexColor(123); }, "color", "parseHexColor 非字符串失败");

/* ---------- 2. hexToRgba：hex / rgba 分流 ---------- */
eq(M.hexToRgba("#FFF", 1), "#ffffff", "hexToRgba opacity 1 输出 hex 本身");
eq(M.hexToRgba("#00E5FF", 1), "#00e5ff", "hexToRgba opacity 1 不转 rgba");
eq(M.hexToRgba("#00e5ff", 0.5), "rgba(0, 229, 255, 0.5)", "hexToRgba opacity 0.5 输出 rgba");
eq(M.hexToRgba("#ffffff", 0.9), "rgba(255, 255, 255, 0.9)", "hexToRgba opacity 0.9 去尾零");
eq(M.hexToRgba("#000000", 0), "rgba(0, 0, 0, 0)", "hexToRgba opacity 0 输出 rgba");
throws(function () { M.hexToRgba("#ffffff", 1.5); }, "opacity", "hexToRgba opacity 越界失败");
throws(function () { M.hexToRgba("#ffffff", -0.1); }, "opacity", "hexToRgba opacity 负值失败");
throws(function () { M.hexToRgba("#ffffff", 0.555); }, "opacity", "hexToRgba opacity 3 位小数失败");
throws(function () { M.hexToRgba("red", 0.5); }, "color", "hexToRgba 非法颜色失败");

/* ---------- 3. validateLayer：已知值与非法 ---------- */
var good = M.validateLayer({ offsetX: -10.5, offsetY: 20, blur: 5, color: "#ABC", opacity: 0.5 });
eq(good.offsetX, -10.5, "validateLayer 偏移通过");
eq(good.color, "#aabbcc", "validateLayer 颜色规范化为小写");
throws(function () { M.validateLayer(merge(L(), { offsetX: 101 })); }, "offsetX", "validateLayer X 越界失败");
throws(function () { M.validateLayer(merge(L(), { offsetY: -101 })); }, "offsetY", "validateLayer Y 越界失败");
throws(function () { M.validateLayer(merge(L(), { blur: 101 })); }, "blur", "validateLayer 模糊越界失败");
throws(function () { M.validateLayer(merge(L(), { blur: -1 })); }, "blur", "validateLayer 模糊负值失败");
throws(function () { M.validateLayer(merge(L(), { opacity: 1.1 })); }, "opacity", "validateLayer 不透明度越界失败");
throws(function () { M.validateLayer(merge(L(), { color: "blue" })); }, "color", "validateLayer 非法颜色失败");
throws(function () { M.validateLayer(merge(L(), { offsetX: 1.234 })); }, "offsetX", "validateLayer 3 位小数失败");

/* ---------- 4. 图层集合：增删移、不改原数组 ---------- */
var one = [L()];
var added = M.addLayer(one, L());
eq(added.length, 2, "addLayer 追加至末尾");
eq(one.length, 1, "addLayer 不改原数组");
var ten = [];
for (var i = 0; i < 10; i++) ten.push(L());
throws(function () { M.addLayer(ten, L()); }, "layers", "addLayer 超 10 层失败");
eq(ten.length, 10, "addLayer 超限后原数组不变");
throws(function () { M.removeLayer(one, 0); }, "layers", "removeLayer 删至低于 1 层失败");
throws(function () { M.removeLayer([L(), L()], 5); }, "index", "removeLayer 下标越界失败");
throws(function () { M.removeLayer([L(), L()], -1); }, "index", "removeLayer 负下标失败");
eq(M.removeLayer([L(), L()], 1).length, 1, "removeLayer 正常删除");
var a = merge(L(), { offsetX: 1 }), b = merge(L(), { offsetX: 2 }), c = merge(L(), { offsetX: 3 });
var trio = [a, b, c];
var moved = M.moveLayer(trio, 1, "up");
eq(moved.map(function (x) { return x.offsetX; }).join(","), "2,1,3", "moveLayer up 只改顺序");
eq(trio[0].offsetX, 1, "moveLayer 不改原数组");
eq(M.moveLayer(trio, 1, "down").map(function (x) { return x.offsetX; }).join(","), "1,3,2", "moveLayer down 只改顺序");
throws(function () { M.moveLayer(trio, 0, "up"); }, "index", "moveLayer 首层上移失败");
throws(function () { M.moveLayer(trio, 2, "down"); }, "index", "moveLayer 末层下移失败");
throws(function () { M.moveLayer(trio, 1, "left"); }, "direction", "moveLayer 非法方向失败");
throws(function () { M.moveLayer(trio, 9, "up"); }, "index", "moveLayer 下标越界失败");

/* ---------- 5. 组合：多层逗号连接与去尾零 ---------- */
var css = M.buildTextShadowCss([
  { offsetX: 1.5, offsetY: 2, blur: 0, color: "#FF0000", opacity: 1 },
  { offsetX: 0, offsetY: 0, blur: 10.5, color: "#00e5ff", opacity: 0.5 }
]);
eq(css, "1.5px 2px 0px #ff0000, 0px 0px 10.5px rgba(0, 229, 255, 0.5)",
  "buildTextShadowCss 多层逗号连接、去尾零、hex/rgba 分流");
throws(function () { M.buildTextShadowCss([]); }, "layers", "buildTextShadowCss 空数组失败");
throws(function () {
  var eleven = [];
  for (var i = 0; i < 11; i++) eleven.push(L());
  M.buildTextShadowCss(eleven);
}, "layers", "buildTextShadowCss 超 10 层失败");

/* ---------- 6. 预设：五组层数与数值 ---------- */
eq(M.generatePreset("neon").layers.length, 5, "generatePreset neon 5 层");
eq(M.generatePreset("three-d").layers.length, 6, "generatePreset three-d 6 层");
eq(M.generatePreset("retro").layers.length, 2, "generatePreset retro 2 层");
eq(M.generatePreset("emboss").layers.length, 2, "generatePreset emboss 2 层");
eq(M.generatePreset("long-shadow").layers.length, 10, "generatePreset long-shadow 10 层");
var neon = M.generatePreset("neon");
eq(neon.layers[0].blur, 5, "neon 首层模糊 5px");
eq(neon.layers[4].blur, 80, "neon 末层模糊 80px");
eq(neon.layers[4].opacity, 0.6, "neon 末层不透明度 0.6");
eq(neon.preview.backgroundColor, "#111827", "neon 深色背景预览");
eq(neon.preview.text, "文字阴影", "预设预览文字默认");
eq(neon.preview.fontSize, 72, "预设字号默认 72px");
var td = M.generatePreset("three-d");
eq(td.layers[0].offsetX, 1, "three-d 首层 1px");
eq(td.layers[5].offsetX, 6, "three-d 末层 6px");
eq(td.layers[0].color, "#999999", "three-d 首层最浅");
eq(td.layers[5].color, "#444444", "three-d 末层最深");
var retro = M.generatePreset("retro");
eq(retro.layers[0].offsetX, 3, "retro 首层 3px");
eq(retro.layers[1].color, "#ee5253", "retro 末层颜色");
var emboss = M.generatePreset("emboss");
eq(emboss.layers[0].opacity, 0.9, "emboss 亮层不透明度 0.9");
eq(emboss.layers[1].offsetX, -1, "emboss 暗层 -1px");
var ls = M.generatePreset("long-shadow");
eq(ls.layers[9].offsetX, 10, "long-shadow 末层 10px");
eq(ls.layers[9].color, "#2d3436", "long-shadow 同色");
throws(function () { M.generatePreset("glow"); }, "preset", "generatePreset 未知预设失败");

/* ---------- 7. 代码生成：CSS / HTML / 预览 / 导出名 ---------- */
var snippet = M.buildCssSnippet([{ offsetX: 2, offsetY: 2, blur: 4, color: "#000000", opacity: 1 }]);
ok(snippet.indexOf(".text-shadow {") === 0, "buildCssSnippet 块头正确");
ok(snippet.indexOf("  text-shadow: 2px 2px 4px #000000;") !== -1, "buildCssSnippet 含 text-shadow 行");
ok(snippet.indexOf("}") !== -1, "buildCssSnippet 闭合");
var html = M.buildHtmlSnippet(
  [{ offsetX: 2, offsetY: 2, blur: 4, color: "#000000", opacity: 1 }],
  { text: "文字阴影", fontSize: 72, textColor: "#ffffff", backgroundColor: "#111827" });
ok(html.indexOf("<style>") !== -1, "buildHtmlSnippet 含 <style>");
ok(html.indexOf("text-shadow: 2px 2px 4px #000000;") !== -1, "buildHtmlSnippet 内嵌生成 CSS");
ok(html.indexOf('<div class="text-shadow">文字阴影</div>') !== -1, "buildHtmlSnippet 含预览元素");
ok(html.indexOf("<script") === -1, "buildHtmlSnippet 无 <script>");
var esc = M.buildHtmlSnippet([L()], { text: "<b>试</b>", fontSize: 32, textColor: "#ffffff", backgroundColor: "#000000" });
ok(esc.indexOf("&lt;b&gt;") !== -1 && esc.indexOf("<b>") === -1, "buildHtmlSnippet 转义预览文字");
eq(M.validatePreview({ text: "你好", fontSize: 16, textColor: "#FFF", backgroundColor: "#000" }).textColor,
  "#ffffff", "validatePreview 颜色规范化");
throws(function () { M.validatePreview({ text: "", fontSize: 72, textColor: "#ffffff", backgroundColor: "#000000" }); }, "text", "validatePreview 空文字失败");
throws(function () { M.validatePreview({ text: "文字阴影", fontSize: 15, textColor: "#ffffff", backgroundColor: "#000000" }); }, "fontSize", "validatePreview 字号过小失败");
throws(function () { M.validatePreview({ text: "文字阴影", fontSize: 201, textColor: "#ffffff", backgroundColor: "#000000" }); }, "fontSize", "validatePreview 字号过大失败");
throws(function () { M.validatePreview({ text: "文字阴影", fontSize: 72.5, textColor: "#ffffff", backgroundColor: "#000000" }); }, "fontSize", "validatePreview 字号非整数失败");
throws(function () { M.validatePreview({ text: "文字阴影", fontSize: 72, textColor: "white", backgroundColor: "#000000" }); }, "textColor", "validatePreview 文字颜色非法失败");
throws(function () { M.validatePreview({ text: "文字阴影", fontSize: 72, textColor: "#ffffff", backgroundColor: "black" }); }, "backgroundColor", "validatePreview 背景颜色非法失败");
eq(M.suggestExportName("css"), "text-shadow.css", "suggestExportName css");
eq(M.suggestExportName("html"), "text-shadow-demo.html", "suggestExportName html");
throws(function () { M.suggestExportName("js"); }, "kind", "suggestExportName 其它 kind 失败");

/* ---------- 8. 注册与零网络请求静态检查 ---------- */
ok(GO_SRC.indexOf('"css_text_shadow_generator"') !== -1, "categories.go 注册 ID");
ok(GO_SRC.indexOf('"/tools/css-text-shadow-generator"') !== -1, "categories.go 注册 Path");
var regBlock = GO_SRC.split('"css_text_shadow_generator"')[1].split("},")[0];
ok(regBlock.indexOf('Category:    "开发工具"') !== -1, "categories.go 注册 Category 开发工具");
ok(regBlock.indexOf("New:         true") !== -1, "categories.go 注册 New true");
var pathCount = {};
GO_SRC.replace(/"(\/tools\/[^"]+)"/g, function (_, p) { pathCount[p] = 1; return p; });
eq(Object.keys(pathCount).length, 214, "注册总数 213→214 Path");
ok(JS_SRC.indexOf("fetch(") === -1 && JS_SRC.indexOf("XMLHttpRequest") === -1,
  "JS 零 fetch/XHR");
ok(TPL_SRC.indexOf('src="http') === -1 && TPL_SRC.indexOf("cdn.") === -1,
  "模板零 CDN 外链");
ok(TPL_SRC.indexOf("/tools/css-shadow-radius-generator") !== -1, "模板互链 CSS 阴影与圆角生成器");
ok(TPL_SRC.indexOf("/tools/css-gradient-generator") !== -1, "模板互链 CSS 渐变生成器");
ok(TPL_SRC.indexOf("/tools/css-keyframe-generator") !== -1, "模板互链 CSS 动画关键帧生成器");
ok(TPL_SRC.indexOf("CSS 滤镜生成器") === -1, "模板不硬凑未交付的滤镜生成器");
ok(TPL_SRC.indexOf("毛玻璃") === -1, "模板不硬凑未交付的毛玻璃生成器");
ok(TPL_SRC.indexOf("只做 text-shadow") !== -1, "模板真限制：只做 text-shadow");
ok(TPL_SRC.indexOf("filter: drop-shadow()") !== -1, "模板真限制：不做 drop-shadow");
ok(TPL_SRC.indexOf("首层在最上层") !== -1, "模板真限制：首层在最上层");
ok(TPL_SRC.indexOf("图层 1–10 层") !== -1 || TPL_SRC.indexOf("1–10 层") !== -1, "模板真限制：图层 1–10 层");
ok(TPL_SRC.indexOf("颜色只认 #RGB") !== -1, "模板真限制：颜色只认十六进制");
ok(TPL_SRC.indexOf("不收集") !== -1 && TPL_SRC.indexOf("不上传") !== -1, "模板真限制：不收集不上传");

console.log("PASS: " + pass + "  FAIL: " + fail);
process.exit(fail ? 1 : 0);
