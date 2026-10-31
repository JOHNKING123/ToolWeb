/* CSS clip-path 生成器纯逻辑单元测试（零依赖）：node tests/css_clip_path_generator.test.js
 * 覆盖：polygon 解析/拼串往返、去尾零、四类形状拼串与往返、预设几何、
 * 编辑不变量、代码生成、导出文件名、注册、真限制文案、互链与零网络请求。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/css_clip_path_generator.js");

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
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "css_clip_path_generator.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "css_clip_path_generator.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. polygon 解析：已知值 ---------- */
eq(JSON.stringify(M.parsePolygon("50% 0%, 100% 100%, 0% 100%")),
  JSON.stringify([{ x: 50, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]), "parsePolygon 三角形已知值");
eq(JSON.stringify(M.parsePolygon("50 0, 100 100, 0 100")),
  JSON.stringify([{ x: 50, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]), "无 % 号同值");
eq(JSON.stringify(M.parsePolygon("33.33% 66.67%, 100% 0%, 0% 100%")),
  JSON.stringify([{ x: 33.33, y: 66.67 }, { x: 100, y: 0 }, { x: 0, y: 100 }]), "小数 33.33 通过");
eq(JSON.stringify(M.parsePolygon(" 50%   0% , 100% 100% , 0% 100% ")),
  JSON.stringify([{ x: 50, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]), "多余空白容忍");
throws(function () { M.parsePolygon(""); }, "空串失败", "polygon");
throws(function () { M.parsePolygon("50% 0%, 100% 100%"); }, "＜3 点失败", "polygon");
throws(function () { M.parsePolygon("50% 0%, 101% 100%, 0% 100%"); }, "越界 101 失败", "x");
throws(function () { M.parsePolygon("50% 0%, abc 100%, 0% 100%"); }, "非数值失败", "x");
throws(function () { M.parsePolygon("50% 0%, 100%, 0% 100%"); }, "坐标缺失失败", "polygon");
throws(function () { M.parsePolygon("50% 0%,, 100% 100%, 0% 100%"); }, "分隔符错乱失败", "polygon");
throws(function () { M.parsePolygon("33.333% 0%, 100% 100%, 0% 100%"); }, "3 位小数失败", "x");
throws(function () { M.parsePolygon("50px 0%, 100% 100%, 0% 100%"); }, "px 单位失败", "x");

/* ---------- 2. pointsToPolygon 往返与去尾零 ---------- */
eq(M.pointsToPolygon([{ x: 50, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]),
  "polygon(50% 0%, 100% 100%, 0% 100%)", "pointsToPolygon 三角形拼串");
eq(M.pointsToPolygon(M.parsePolygon("33.30% 0%, 100% 100%, 0% 100%")),
  "polygon(33.3% 0%, 100% 100%, 0% 100%)", "往返去尾零：33.30 → 33.3");
eq(M.pointsToPolygon(M.parsePolygon("50% 0%, 100% 100%, 0% 100%")),
  "polygon(50% 0%, 100% 100%, 0% 100%)", "parse→points 往返一致");
throws(function () { M.pointsToPolygon([{ x: 50, y: 0 }, { x: 100, y: 100 }]); }, "拼串＜3 点失败", "points");
throws(function () { M.pointsToPolygon([{ x: 50, y: 0 }, { x: 101, y: 100 }, { x: 0, y: 100 }]); }, "拼串越界失败", "x");

/* ---------- 3. 四类形状拼串 ---------- */
eq(M.buildCircle(50, 50, 50), "circle(50% at 50% 50%)", "buildCircle 标准拼串");
eq(M.buildEllipse(50, 40, 50, 50), "ellipse(50% 40% at 50% 50%)", "buildEllipse 标准拼串");
eq(M.buildInset(10, 20, 30, 40), "inset(10% 20% 30% 40%)", "buildInset 无 round");
eq(M.buildInset(10, 20, 30, 40, 10), "inset(10% 20% 30% 40% round 10%)", "buildInset 含 round");
throws(function () { M.buildCircle(0, 50, 50); }, "circle 半径为 0 失败", "radius");
throws(function () { M.buildCircle(101, 50, 50); }, "circle 半径越界失败", "radius");
throws(function () { M.buildEllipse(50, 0, 50, 50); }, "ellipse 纵半径为 0 失败", "ry");
throws(function () { M.buildInset(10, 20, 30, 40, 51); }, "inset round 越界失败", "round");
throws(function () { M.buildInset(10, 20, 30, 101); }, "inset 边越界失败", "left");

/* ---------- 4. parseClipPath 四类往返 ---------- */
eq(M.shapeToValue(M.parseClipPath("polygon(50% 0%, 100% 100%, 0% 100%)")),
  "polygon(50% 0%, 100% 100%, 0% 100%)", "parseClipPath polygon 往返");
eq(M.shapeToValue(M.parseClipPath("circle(50% at 50% 50%)")), "circle(50% at 50% 50%)", "parseClipPath circle 往返");
eq(M.shapeToValue(M.parseClipPath("ellipse(50% 40% at 50% 50%)")), "ellipse(50% 40% at 50% 50%)", "parseClipPath ellipse 往返");
eq(M.shapeToValue(M.parseClipPath("inset(10% 20% 30% 40% round 10%)")), "inset(10% 20% 30% 40% round 10%)", "parseClipPath inset 往返");
eq(M.shapeToValue(M.parseClipPath("circle(50%)")), "circle(50% at 50% 50%)", "circle 省 at 默认中心 50% 50%");
eq(M.shapeToValue(M.parseClipPath("inset(10%)")), "inset(10% 10% 10% 10%)", "inset 单值缩写展开");
eq(JSON.stringify(M.parseClipPath("inset(10% 20% 30% 40% round 10%)")),
  JSON.stringify({ kind: "inset", top: 10, right: 20, bottom: 30, left: 40, round: 10 }), "parseClipPath inset 结构");
ok(M.parseClipPath("inset(10% 20% 30% 40%)").round === undefined, "parseClipPath inset 无 round 时 round 为 undefined");
try { M.parseClipPath("path('M0 0 L10 10')"); ok(false, "path() 应抛错"); }
catch (e) { ok(/不支持的形状函数/.test(e.message), "path() 判失败并明示不支持"); }
try { M.parseClipPath("shape(from foo)"); ok(false, "shape() 应抛错"); }
catch (e) { ok(/不支持的形状函数/.test(e.message), "shape() 判失败并明示不支持"); }
try { M.parseClipPath("url(#clip)"); ok(false, "url() 应抛错"); }
catch (e) { ok(/不支持的形状函数/.test(e.message), "url() 判失败并明示不支持"); }
throws(function () { M.parseClipPath("inset(10% 20% round 5% 6%)"); }, "inset 多值 round 失败", "round");
throws(function () { M.parseClipPath("notafunction"); }, "无括号语法失败", "clipPath");

/* ---------- 5. 预设与编辑 ---------- */
eq(M.PRESET_NAMES.length, 9, "预设共 9 个");
M.PRESET_NAMES.forEach(function (n) {
  ok(M.generatePreset(n).length >= 3, "预设 " + n + " 至少 3 点");
});
eq(M.generatePreset("star").length, 10, "五角星 star 10 点");
eq(M.generatePreset("arrow-right").length, 7, "右箭头 arrow-right 7 点");
eq(M.generatePreset("chevron").length, 6, "chevron 6 点");
eq(JSON.stringify(M.generatePreset("triangle")[0]), JSON.stringify({ x: 50, y: 0 }), "三角形首顶点 50% 0%");
eq(JSON.stringify(M.generatePreset("diamond")[2]), JSON.stringify({ x: 50, y: 100 }), "菱形底顶点 50% 100%");
throws(function () { M.generatePreset("octagon"); }, "未知预设失败", "preset");
var orig = [{ x: 50, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
var moved = M.movePoint(orig, 0, 60, 10);
eq(JSON.stringify(moved[0]), JSON.stringify({ x: 60, y: 10 }), "movePoint 新数组首点已改");
eq(JSON.stringify(orig[0]), JSON.stringify({ x: 50, y: 0 }), "movePoint 不改原数组");
throws(function () { M.movePoint(orig, 3, 10, 10); }, "movePoint 下标越界失败", "index");
throws(function () { M.movePoint(orig, 0, 101, 10); }, "movePoint 坐标越界失败", "x");
eq(M.addPoint(orig, 25, 25).length, 4, "addPoint 点数＋1");
eq(JSON.stringify(M.addPoint(orig, 25, 25)[3]), JSON.stringify({ x: 25, y: 25 }), "addPoint 新点追加到末尾");
eq(M.removePoint([{ x: 50, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }, { x: 0, y: 0 }], 3).length, 3, "removePoint 4→3 点通过");
throws(function () { M.removePoint(orig, 0); }, "删至＜3 点失败", "points");

/* ---------- 6. 代码生成与导出名 ---------- */
var css = M.buildClipCss({ kind: "polygon", points: [{ x: 50, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }] });
eq(css, "clip-path: polygon(50% 0%, 100% 100%, 0% 100%);\n-webkit-clip-path: polygon(50% 0%, 100% 100%, 0% 100%);",
  "buildClipCss 标准行＋webkit 前缀行（标准在前）");
var html = M.buildHtmlSnippet("circle(50% at 50% 50%)");
ok(html.indexOf('class="clip-demo"') >= 0, "buildHtmlSnippet 含 class clip-demo");
ok(html.indexOf("clip-path: circle(50% at 50% 50%)") >= 0, "buildHtmlSnippet 含当前值");
ok(html.indexOf("300px") >= 0 && html.indexOf("200px") >= 0, "buildHtmlSnippet 含 300×200");
throws(function () { M.buildHtmlSnippet("path('M0 0')"); }, "buildHtmlSnippet 非法值失败");
eq(M.suggestExportName("css"), "clip-path.css", "suggestExportName css");
eq(M.suggestExportName("html"), "clip-path-demo.html", "suggestExportName html");
throws(function () { M.suggestExportName("png"); }, "suggestExportName 其它 kind 失败", "kind");

/* ---------- 7. 注册、模板、互链与零网络 ---------- */
ok(GO_SRC.indexOf('"css_clip_path_generator"') >= 0, "categories.go 注册 ID");
ok(GO_SRC.indexOf('"/tools/css-clip-path-generator"') >= 0, "categories.go 注册 Path");
ok(GO_SRC.indexOf('Category:    "开发工具"') >= 0, "开发工具品类存在");
var paths = GO_SRC.match(/"\/tools\/[^"]+"/g) || [];
var uniq = {};
paths.forEach(function (p) { uniq[p] = true; });
eq(Object.keys(uniq).length, 247, "注册 Path 总数→247（历史遗留陈旧断言同步）");
ok(TPL_SRC.indexOf("css-clip-path-generator") >= 0, "模板 canonical 含新 Path");
ok(TPL_SRC.indexOf("只做 polygon／circle／ellipse／inset 四类形状，不做 SVG path() 与新 shape() 函数") >= 0, "真限制 1：四类＋不做 path/shape");
ok(TPL_SRC.indexOf("百分比坐标系") >= 0, "真限制 2：百分比坐标系");
ok(TPL_SRC.indexOf("裁剪不影响布局") >= 0 && TPL_SRC.indexOf("点击区域仍按盒子算") >= 0, "真限制 3：裁剪不影响布局＋点击区域按盒子算");
ok(TPL_SRC.indexOf("inset 圆角只支持单值 round") >= 0, "真限制 4：inset 单值 round");
ok(TPL_SRC.indexOf("不收集、不上传任何内容") >= 0, "真限制 5：不收集不上传");
ok(TPL_SRC.indexOf("预览以当前浏览器渲染为准") >= 0, "真限制 6：预览以浏览器渲染为准");
ok(TPL_SRC.indexOf("/tools/css-gradient-generator") >= 0, "互链：CSS 渐变生成器");
ok(TPL_SRC.indexOf("/tools/css-shadow-radius-generator") >= 0, "互链：CSS 阴影／圆角生成器");
ok(TPL_SRC.indexOf("/tools/css-to-tailwind") >= 0, "互链：CSS 转 Tailwind");
ok(TPL_SRC.indexOf("flexbox") < 0 && TPL_SRC.indexOf("Grid") < 0, "不链未交付的 Flexbox／Grid 生成器");
ok(TPL_SRC.indexOf("clip-path.css") >= 0 && TPL_SRC.indexOf("clip-path-demo.html") >= 0, "模板含两下载文件名");
ok(TPL_SRC.indexOf("载入示例") >= 0, "模板含载入示例按钮");
ok(TPL_SRC.indexOf("ccp-svg") >= 0 && TPL_SRC.indexOf("ccp-points") >= 0, "模板含画布 SVG 与坐标列表");
ok(TPL_SRC.indexOf("ccp-tab-circle") >= 0 && TPL_SRC.indexOf("ccp-tab-ellipse") >= 0 && TPL_SRC.indexOf("ccp-tab-inset") >= 0, "模板含四页签");
ok(JS_SRC.indexOf("fetch(") < 0 && JS_SRC.indexOf("XMLHttpRequest") < 0, "JS 零 fetch／XHR");
var tplNoCanonical = TPL_SRC.split("\n").filter(function (l) { return l.indexOf("johnkingzcq123.xyz") < 0; }).join("\n");
ok(tplNoCanonical.indexOf("src=\"http") < 0 && tplNoCanonical.indexOf("href=\"http") < 0, "模板零 CDN 外链（canonical／OG 自身域名除外）");
ok(JS_SRC.indexOf("parsePolygon") >= 0 && JS_SRC.indexOf("parseClipPath") >= 0 && JS_SRC.indexOf("generatePreset") >= 0, "JS 含核心纯函数");

console.log("PASS " + pass + " / FAIL " + fail);
if (fail > 0) process.exit(1);
