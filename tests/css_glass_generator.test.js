/* CSS 毛玻璃生成器纯逻辑单元测试（零依赖）：node tests/css_glass_generator.test.js
 * 覆盖：颜色与单项向量、合成与预设向量、代码生成向量、
 * 注册与零网络请求静态检查。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/css_glass_generator.js");

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
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "css_glass_generator.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "css_glass_generator.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

function panel(o) {
  var base = { blur: 12, saturate: 150, fillColor: "#ffffff", fillAlpha: 0.25,
    borderColor: "#ffffff", borderAlpha: 0.4, radius: 16,
    shadowBlur: 32, shadowAlpha: 0.15 };
  if (o) Object.keys(o).forEach(function (k) { base[k] = o[k]; });
  return base;
}

/* ---------- 1. parseHexColor ---------- */
eq(M.parseHexColor("#FFF"), "#ffffff", "parse #FFF→#ffffff");
eq(M.parseHexColor("#00E5FF"), "#00e5ff", "parse #00E5FF→#00e5ff");
eq(M.parseHexColor("#abc"), "#aabbcc", "parse #abc→#aabbcc");
eq(M.parseHexColor("#A1B2C3"), "#a1b2c3", "parse #A1B2C3→#a1b2c3");
throws(function () { M.parseHexColor("red"); }, "color", "parse 颜色名失败");
throws(function () { M.parseHexColor("rgb(255, 255, 255)"); }, "color", "parse rgb() 失败");
throws(function () { M.parseHexColor(""); }, "color", "parse 空串失败");
throws(function () { M.parseHexColor("#FF"); }, "color", "parse #FF 两位失败");
throws(function () { M.parseHexColor("#12345"); }, "color", "parse #12345 五位失败");
throws(function () { M.parseHexColor("#GGGGGG"); }, "color", "parse 非十六进制失败");
throws(function () { M.parseHexColor(123); }, "color", "parse 非字符串失败");
throws(function () { M.parseHexColor("#ffffff00"); }, "color", "parse 八位失败");

/* ---------- 2. hexToRgba ---------- */
eq(M.hexToRgba("#ffffff", 0.25), "rgba(255, 255, 255, 0.25)", "rgba 白 0.25");
eq(M.hexToRgba("#FFF", 1), "rgba(255, 255, 255, 1)", "rgba alpha 1 仍输出 rgba 串");
eq(M.hexToRgba("#000000", 0), "rgba(0, 0, 0, 0)", "rgba 黑 0");
eq(M.hexToRgba("#00E5FF", 0.5), "rgba(0, 229, 255, 0.5)", "rgba #00E5FF 0.5");
eq(M.hexToRgba("#123456", 0.1), "rgba(18, 52, 86, 0.1)", "rgba #123456 0.1");
throws(function () { M.hexToRgba("#ffffff", -0.1); }, "alpha", "rgba alpha 负值失败");
throws(function () { M.hexToRgba("#ffffff", 1.01); }, "alpha", "rgba alpha 超 1 失败");
throws(function () { M.hexToRgba("#ffffff", 0.555); }, "alpha", "rgba alpha 超 2 位小数失败");
throws(function () { M.hexToRgba("red", 0.5); }, "color", "rgba 非法颜色失败");

/* ---------- 3. validatePanel ---------- */
var v = M.validatePanel(panel());
eq(v.blur, 12, "validate 已知面板 blur 通过");
eq(v.fillColor, "#ffffff", "validate 已知面板填充色通过");
eq(M.validatePanel(panel({ fillColor: "#ABC" })).fillColor, "#aabbcc", "validate 颜色归一化小写");
eq(M.validatePanel(panel({ blur: 0, saturate: 0, radius: 0, shadowBlur: 0 })).blur, 0, "validate 下界全 0 通过");
eq(M.validatePanel(panel({ blur: 40, saturate: 200, radius: 40, shadowBlur: 60 })).shadowBlur, 60, "validate 上界通过");
eq(M.validatePanel(panel({ blur: 12.5 })).blur, 12.5, "validate 2 位小数通过");
throws(function () { M.validatePanel(panel({ blur: 41 })); }, "blur", "validate blur 越界失败");
throws(function () { M.validatePanel(panel({ blur: -1 })); }, "blur", "validate blur 负值失败");
throws(function () { M.validatePanel(panel({ saturate: 201 })); }, "saturate", "validate saturate 越界失败");
throws(function () { M.validatePanel(panel({ fillAlpha: 1.01 })); }, "fillAlpha", "validate 填充 alpha 越界失败");
throws(function () { M.validatePanel(panel({ borderAlpha: -0.1 })); }, "borderAlpha", "validate 边框 alpha 负值失败");
throws(function () { M.validatePanel(panel({ radius: 41 })); }, "radius", "validate 圆角越界失败");
throws(function () { M.validatePanel(panel({ shadowBlur: 61 })); }, "shadowBlur", "validate 阴影模糊越界失败");
throws(function () { M.validatePanel(panel({ shadowAlpha: 2 })); }, "shadowAlpha", "validate 阴影 alpha 越界失败");
throws(function () { M.validatePanel(panel({ fillColor: "white" })); }, "color", "validate 填充非法颜色失败");
throws(function () { M.validatePanel(panel({ borderColor: "" })); }, "color", "validate 边框空颜色失败");
throws(function () { M.validatePanel(panel({ blur: 12.555 })); }, "blur", "validate 超 2 位小数失败");
throws(function () { M.validatePanel(null); }, "panel", "validate 非对象失败");
throws(function () { M.validatePanel(panel({ blur: undefined })); }, "blur", "validate 缺失字段失败");

/* ---------- 4. buildBackdropFilter ---------- */
eq(M.buildBackdropFilter(panel()), "blur(12px) saturate(150%)", "backdrop 已知值");
eq(M.buildBackdropFilter(panel({ blur: 0, saturate: 100 })), "blur(0px) saturate(100%)", "backdrop 零值仍输出两项");
eq(M.buildBackdropFilter(panel({ blur: 12.5, saturate: 150.5 })), "blur(12.5px) saturate(150.5%)", "backdrop 去尾零");
throws(function () { M.buildBackdropFilter(panel({ blur: 41 })); }, "blur", "backdrop 越界失败");

/* ---------- 5. buildCssSnippet：.glass 八行块 ---------- */
var css = M.buildCssSnippet(panel());
var lines = css.split("\n");
eq(lines.length, 8, "CSS 八行块");
eq(lines[0], ".glass {", "CSS 首行为 .glass {");
eq(lines[lines.length - 1], "}", "CSS 末行为 }");
ok(css.indexOf("  -webkit-backdrop-filter: blur(12px) saturate(150%);") !== -1, "CSS 含 -webkit-backdrop-filter");
ok(css.indexOf("  backdrop-filter: blur(12px) saturate(150%);") !== -1, "CSS 含 backdrop-filter");
ok(css.indexOf("  background: rgba(255, 255, 255, 0.25);") !== -1, "CSS 含 background 填充 rgba");
ok(css.indexOf("  border: 1px solid rgba(255, 255, 255, 0.4);") !== -1, "CSS 含 border 边框 rgba");
ok(css.indexOf("  border-radius: 16px;") !== -1, "CSS 含 border-radius");
ok(css.indexOf("  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);") !== -1, "CSS 含 box-shadow（阴影模糊取面板值）");
ok(css.indexOf("<script") === -1, "CSS 无 script");
throws(function () { M.buildCssSnippet(panel({ radius: 41 })); }, "radius", "CSS 越界失败");

/* ---------- 6. generatePreset ---------- */
var card = M.generatePreset("card");
eq(card.background, "gradient", "预设 card 背景 gradient");
eq(card.panel.blur, 12, "预设 card blur 12");
eq(card.panel.saturate, 150, "预设 card saturate 150");
eq(card.panel.fillAlpha, 0.25, "预设 card 填充 alpha 0.25");
eq(card.panel.borderAlpha, 0.4, "预设 card 边框 alpha 0.4");
eq(card.panel.radius, 16, "预设 card 圆角 16");
eq(card.panel.shadowBlur, 32, "预设 card 阴影模糊 32");
eq(card.panel.shadowAlpha, 0.15, "预设 card 阴影 alpha 0.15");
var nav = M.generatePreset("navbar");
eq(nav.background, "photo", "预设 navbar 背景 photo");
eq(nav.panel.blur, 20, "预设 navbar blur 20");
eq(nav.panel.saturate, 180, "预设 navbar saturate 180");
eq(nav.panel.fillAlpha, 0.6, "预设 navbar 填充 alpha 0.6");
eq(nav.panel.borderAlpha, 0.5, "预设 navbar 边框 alpha 0.5");
eq(nav.panel.radius, 0, "预设 navbar 圆角 0");
eq(nav.panel.shadowBlur, 16, "预设 navbar 阴影模糊 16");
eq(nav.panel.shadowAlpha, 0.1, "预设 navbar 阴影 alpha 0.1");
var login = M.generatePreset("login");
eq(login.background, "dark", "预设 login 背景 dark");
eq(login.panel.blur, 10, "预设 login blur 10");
eq(login.panel.saturate, 130, "预设 login saturate 130");
eq(login.panel.fillAlpha, 0.2, "预设 login 填充 alpha 0.2");
eq(login.panel.borderAlpha, 0.3, "预设 login 边框 alpha 0.3");
eq(login.panel.radius, 20, "预设 login 圆角 20");
eq(login.panel.shadowBlur, 40, "预设 login 阴影模糊 40");
eq(login.panel.shadowAlpha, 0.2, "预设 login 阴影 alpha 0.2");
throws(function () { M.generatePreset("unknown"); }, "preset", "预设未知失败");
var c1 = M.generatePreset("card");
c1.panel.blur = 99;
eq(M.generatePreset("card").panel.blur, 12, "预设返回全新副本不互相污染");

/* ---------- 7. buildHtmlSnippet ---------- */
["gradient", "dark", "light", "photo"].forEach(function (bg) {
  var html = M.buildHtmlSnippet(panel(), bg);
  ok(html.indexOf("<style>") !== -1, "HTML " + bg + " 含 <style>");
  ok(html.indexOf('<div class="glass">') !== -1, "HTML " + bg + " 含 div.glass");
  ok(html.indexOf("<script") === -1, "HTML " + bg + " 无 script");
  ok(html.indexOf(".glass {") !== -1, "HTML " + bg + " 内嵌完整 CSS");
});
throws(function () { M.buildHtmlSnippet(panel(), "beach"); }, "background", "HTML 非法背景失败");
throws(function () { M.buildHtmlSnippet(panel(), ""); }, "background", "HTML 空背景失败");
throws(function () { M.buildHtmlSnippet(panel({ blur: 41 }), "gradient"); }, "blur", "HTML 非法面板失败");

/* ---------- 8. suggestExportName ---------- */
eq(M.suggestExportName("css"), "glass.css", "导出 css→glass.css");
eq(M.suggestExportName("html"), "glass-demo.html", "导出 html→glass-demo.html");
throws(function () { M.suggestExportName("js"); }, "kind", "导出其它 kind 失败");
throws(function () { M.suggestExportName(""); }, "kind", "导出空 kind 失败");

/* ---------- 9. 注册与零网络请求静态检查 ---------- */
ok(GO_SRC.indexOf('"css_glass_generator"') !== -1, "注册 ID css_glass_generator");
ok(GO_SRC.indexOf('"/tools/css-glass-generator"') !== -1, "注册 Path /tools/css-glass-generator");
ok(GO_SRC.indexOf('Category:    "开发工具"') !== -1, "注册含开发工具品类");
var regIdx = GO_SRC.indexOf('"css_glass_generator"');
var regBlock = GO_SRC.slice(regIdx, regIdx + 800);
ok(regBlock.indexOf("New:         true") !== -1, "注册 New: true");
ok(regBlock.indexOf('Category:    "开发工具"') !== -1, "注册块内 Category 开发工具");
var pathCount = (GO_SRC.match(/Path:/g) || []).length;
eq(pathCount, 248, "注册总数→248 Path（历史遗留陈旧断言同步）");
ok(JS_SRC.indexOf("fetch(") === -1, "JS 零 fetch");
ok(JS_SRC.indexOf("XMLHttpRequest") === -1, "JS 零 XHR");
ok(TPL_SRC.indexOf("cdn") === -1 && TPL_SRC.indexOf("src=\"http") === -1, "模板零 CDN 外链脚本");
ok(TPL_SRC.indexOf("/tools/css-filter-generator") !== -1, "互链含滤镜生成器");
ok(TPL_SRC.indexOf("/tools/css-shadow-radius-generator") !== -1, "互链含阴影圆角生成器");
ok(TPL_SRC.indexOf("/tools/css-gradient-generator") !== -1, "互链含渐变生成器");
ok(TPL_SRC.indexOf("specificity") === -1, "互链不含未交付特异性计算器");
ok(TPL_SRC.indexOf("scrollbar") === -1, "互链不含未交付滚动条样式生成器");
ok(TPL_SRC.indexOf("只做 backdrop-filter") !== -1, "真限制：只做 backdrop-filter 可见");
ok(TPL_SRC.indexOf("不做 filter") !== -1 || TPL_SRC.indexOf("不做 liquid") !== -1 || TPL_SRC.indexOf("液态玻璃") !== -1, "真限制：不做 filter／液态玻璃可见");
ok(TPL_SRC.indexOf("只改背景") !== -1 || TPL_SRC.indexOf("只改预览背景") !== -1, "真限制：背景切换只改背景可见");
ok(TPL_SRC.indexOf("rgba 的 alpha") !== -1, "真限制：不透明度即 rgba alpha 可见");
ok(TPL_SRC.indexOf("不收集") !== -1 && TPL_SRC.indexOf("不上传") !== -1, "真限制：不收集不上传可见");
ok(TPL_SRC.indexOf('data-preset="card"') !== -1, "模板含 card 预设按钮");
ok(TPL_SRC.indexOf('data-preset="navbar"') !== -1, "模板含 navbar 预设按钮");
ok(TPL_SRC.indexOf('data-preset="login"') !== -1, "模板含 login 预设按钮");
ok(TPL_SRC.indexOf('data-bg="gradient"') !== -1, "模板含 gradient 背景按钮");
ok(TPL_SRC.indexOf('data-bg="dark"') !== -1, "模板含 dark 背景按钮");
ok(TPL_SRC.indexOf('data-bg="light"') !== -1, "模板含 light 背景按钮");
ok(TPL_SRC.indexOf('data-bg="photo"') !== -1, "模板含 photo 背景按钮");

console.log("PASS " + pass + " / FAIL " + fail);
process.exit(fail ? 1 : 0);
