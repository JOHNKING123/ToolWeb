/* CSS 背景图案生成器纯逻辑单元测试（零依赖）：node tests/css_background_pattern_generator.test.js
 * 覆盖：参数校验向量（非法颜色/size 越界/非法 pattern/非整数/角度越界，err.field 正确）、
 * 六种图案渐变字面（stripes/diagonal repeating-linear-gradient、dots radial-gradient、
 * checkerboard conic-gradient、grid 双层 linear-gradient、zigzag 四层 linear-gradient）、
 * 示例向量（棋盘 #ffffff/#e5e7eb/size 40）、三声明行、导出文件名、演示页中文说明、
 * PATTERNS 注册表、颜色归一化、注册与零网络请求。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/css_background_pattern_generator.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function throwsWithField(fn, field, name) {
  try { fn(); ok(false, name + "（期望抛错，未抛）"); }
  catch (e) { ok(e && e.field === field, name + "（期望 err.field=" + field + "，实得 " + (e && e.field) + "）"); }
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "css_background_pattern_generator.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "css_background_pattern_generator.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

function baseCfg(over) {
  var c = { pattern: "stripes", bg: "#ffffff", fg: "#2563eb", size: 40,
    stripeWidthPct: 50, dotDiameterPct: 50, gridLinePx: 2, angle: 90 };
  if (over) for (var k in over) c[k] = over[k];
  return c;
}

/* ---------- 1. validateConfig 校验向量 ---------- */
throwsWithField(function () { M.validateConfig(baseCfg({ bg: "red" })); }, "bg", "非法颜色 red → field=bg");
throwsWithField(function () { M.validateConfig(baseCfg({ bg: "#12" })); }, "bg", "非法颜色 #12 → field=bg");
throwsWithField(function () { M.validateConfig(baseCfg({ fg: "#gggggg" })); }, "fg", "非法图案色 → field=fg");
throwsWithField(function () { M.validateConfig(baseCfg({ size: 7 })); }, "size", "size=7 越界 → field=size");
throwsWithField(function () { M.validateConfig(baseCfg({ size: 161 })); }, "size", "size=161 越界 → field=size");
throwsWithField(function () { M.validateConfig(baseCfg({ size: 40.5 })); }, "size", "size 非整数不静默取整 → field=size");
throwsWithField(function () { M.validateConfig(baseCfg({ pattern: "waves" })); }, "pattern", "非法 pattern → field=pattern");
throwsWithField(function () { M.validateConfig(baseCfg({ angle: 91 })); }, "angle", "angle=91 越界 → field=angle");
throwsWithField(function () { M.validateConfig(baseCfg({ stripeWidthPct: 9 })); }, "stripeWidthPct", "色带占比 9 越界");
throwsWithField(function () { M.validateConfig(baseCfg({ gridLinePx: 9 })); }, "gridLinePx", "网格线宽 9 越界");
var norm = M.validateConfig(baseCfg({ bg: "#FFF", fg: "#E5E7EB" }));
eq(norm.bg, "#ffffff", "颜色归一化 #FFF → #ffffff");
eq(norm.fg, "#e5e7eb", "颜色归一化 #E5E7EB → #e5e7eb");

/* ---------- 2. 示例向量：棋盘 #ffffff/#e5e7eb/size 40 ---------- */
var ex = M.generateExample();
eq(ex.pattern, "checkerboard", "示例图案为 checkerboard");
var exCss = M.buildBackgroundCSS(ex);
ok(exCss.backgroundImage.indexOf("conic-gradient") !== -1, "示例 backgroundImage 含 conic-gradient 字面");
eq(exCss.backgroundSize, "40px 40px", "示例 backgroundSize 为 40px 40px");
eq(exCss.backgroundColor, "#ffffff", "示例 backgroundColor 为底色");
eq(exCss.backgroundImage, "conic-gradient(#e5e7eb 0 25%, #ffffff 0 50%, #e5e7eb 0 75%, #ffffff 0)",
  "棋盘渐变字面逐字正确");

/* ---------- 3. 各图案渐变字面 ---------- */
var st = M.buildBackgroundCSS(baseCfg({ pattern: "stripes", angle: 90 }));
eq(st.backgroundImage,
  "repeating-linear-gradient(90deg, #2563eb 0, #2563eb 20px, #ffffff 20px, #ffffff 40px)",
  "stripes 字面逐字正确（d=round(40×50/100)=20）");
eq(st.imageProp, "background-image", "stripes 中间声明为 background-image");
var dg = M.buildBackgroundCSS(baseCfg({ pattern: "diagonal", angle: 45 }));
ok(dg.backgroundImage.indexOf("repeating-linear-gradient(45deg,") !== -1, "diagonal 含 repeating-linear-gradient 与 45deg");
var dt = M.buildBackgroundCSS(baseCfg({ pattern: "dots" }));
eq(dt.backgroundImage, "radial-gradient(circle, #2563eb 10px, transparent 11px)",
  "dots 字面逐字正确（r=round(40×50/200)=10）");
var gr = M.buildBackgroundCSS(baseCfg({ pattern: "grid" }));
eq(gr.backgroundImage,
  "linear-gradient(#2563eb 2px, transparent 2px), linear-gradient(90deg, #2563eb 2px, transparent 2px)",
  "grid 双层 linear-gradient 字面逐字正确");
var zg = M.buildBackgroundCSS(baseCfg({ pattern: "zigzag" }));
var zigCount = (zg.backgroundImage.match(/linear-gradient\(/g) || []).length;
eq(zigCount, 4, "zigzag 含 4 个 linear-gradient(");
ok(zg.backgroundImage.indexOf("135deg, #2563eb 25%, transparent 25%) -20px 0") !== -1,
  "zigzag 第一层带 -20px 0 半单元偏移");
eq(zg.imageProp, "background", "zigzag 中间声明用 background 简写承载位置");

/* ---------- 4. buildFullCSS 三声明行 ---------- */
var full = M.buildFullCSS(ex);
ok(full.indexOf("  background-color: #ffffff;") !== -1, "buildFullCSS 含 background-color 声明行");
ok(full.indexOf("  background-image: conic-gradient(") !== -1, "buildFullCSS 含 background-image 声明行");
ok(full.indexOf("  background-size: 40px 40px;") !== -1, "buildFullCSS 含 background-size 声明行");
var declLines = full.split("\n").filter(function (l) { return /^\s{2}[a-z-]+:/.test(l); });
eq(declLines.length, 3, "buildFullCSS 恰为三条声明行");
var fullZig = M.buildFullCSS(baseCfg({ pattern: "zigzag" }));
var declZig = fullZig.split("\n").filter(function (l) { return /^\s{2}[a-z-]+:/.test(l); });
eq(declZig.length, 3, "zigzag 同样恰为三条声明行");
ok(fullZig.indexOf("  background: linear-gradient(") !== -1, "zigzag 中间行为 background 简写");

/* ---------- 5. suggestExportName ---------- */
eq(M.suggestExportName("css"), "background-pattern.css", "css 导出文件名");
eq(M.suggestExportName("html"), "background-pattern-demo.html", "html 导出文件名");
throwsWithField(function () { M.suggestExportName("txt"); }, "kind", "未知 kind 失败且 field=kind");
throwsWithField(function () { M.suggestExportName(""); }, "kind", "空 kind 失败");

/* ---------- 6. buildDemoHTML ---------- */
var demo = M.buildDemoHTML(ex);
ok(demo.indexOf("<!DOCTYPE html>") !== -1, "演示页为完整 HTML");
ok(/[\u4e00-\u9fa5]/.test(demo), "演示页含中文说明");
ok(demo.indexOf("使用说明") !== -1, "演示页含“使用说明”中文说明");
ok(demo.indexOf("conic-gradient(") !== -1, "演示页内嵌示例图案 CSS");
ok(demo.indexOf("40px 40px") !== -1, "演示页内嵌 background-size");
ok(demo.indexOf("fetch(") === -1 && demo.indexOf("XMLHttpRequest") === -1, "演示页零网络请求代码");

/* ---------- 7. PATTERNS 注册表 ---------- */
eq(M.PATTERNS.length, 6, "PATTERNS 共 6 项");
eq(M.PATTERNS.map(function (p) { return p.id; }).join(","),
  "stripes,dots,checkerboard,grid,diagonal,zigzag", "PATTERNS 顺序固定");

/* ---------- 8. 注册与模板 ---------- */
ok(GO_SRC.indexOf('ID:          "css_background_pattern_generator"') !== -1, "categories.go 注册 ID");
ok(GO_SRC.indexOf('Path:        "/tools/css-background-pattern-generator"') !== -1, "categories.go 注册 Path");
ok(GO_SRC.indexOf('Category:    "开发工具"') !== -1, "注册 Category 为开发工具");
var pathCount = (GO_SRC.match(/Path:\s*"\/tools\//g) || []).length;
eq(pathCount, 245, "注册总数→245 Path（历史遗留陈旧断言同步）");
ok(TPL_SRC.indexOf("/tools/svg-background-generator") !== -1, "模板互链 SVG 背景生成器");
ok(TPL_SRC.indexOf("/tools/css-gradient-generator") !== -1, "模板互链 CSS 渐变生成器");
ok(TPL_SRC.indexOf("只做纯 CSS 多渐变背景图案") !== -1, "真限制文案①可见");
ok(TPL_SRC.indexOf("只输出 background-color") !== -1, "真限制文案②可见");
ok(TPL_SRC.indexOf("不收集、不上传") !== -1, "真限制文案③可见");
ok(TPL_SRC.indexOf("css_background_pattern_generator.js") !== -1, "模板引用本工具 JS");

/* ---------- 9. 零网络请求 ---------- */
ok(JS_SRC.indexOf("fetch(") === -1, "JS 无 fetch");
ok(JS_SRC.indexOf("XMLHttpRequest") === -1, "JS 无 XHR");
ok(JS_SRC.indexOf("https://") === -1 && JS_SRC.indexOf("http://") === -1, "JS 无外部 URL 引用");

console.log("PASS " + pass + " / FAIL " + fail);
process.exit(fail === 0 ? 0 : 1);
