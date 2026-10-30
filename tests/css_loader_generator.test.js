/* CSS 加载动画生成器纯逻辑单元测试（零依赖）：node tests/css_loader_generator.test.js
 * 覆盖：类型表与默认参数、确定性 CSS/HTML 向量、非法参数 err.field、
 * 预览对象、注册与零网络请求静态检查。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/css_loader_generator.js");

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
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "css_loader_generator.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "css_loader_generator.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. loaderTypes：7 项顺序固定 ---------- */
var types = M.loaderTypes();
eq(types.join(","), "spinner-ring,spinner-dots,bars,pulse,grid,wave-bar,progress-bar",
  "loaderTypes() 7 项顺序固定");
eq(types.length, 7, "loaderTypes() 长度 7");

/* ---------- 2. defaultParams：各类默认值与非法 type ---------- */
var ringDef = M.defaultParams("spinner-ring");
eq(ringDef.size, 48, "默认 size 48");
eq(ringDef.color, "#2563eb", "默认 color #2563eb");
eq(ringDef.speed, 1, "默认 speed 1");
eq(ringDef.count, 1, "spinner-ring 默认 count 1");
eq(M.defaultParams("spinner-dots").count, 3, "spinner-dots 默认 count 3");
eq(M.defaultParams("bars").count, 5, "bars 默认 count 5");
eq(M.defaultParams("grid").count, 9, "grid 默认 count 9");
eq(M.defaultParams("progress-bar").speed, 1.6, "progress-bar 默认 speed 1.6");
throws(function () { M.defaultParams("unknown-type"); }, "type", "defaultParams 未知 type 失败");
throws(function () { M.defaultParams(); }, "type", "defaultParams 缺省 type 失败");

/* ---------- 3. 确定性向量：spinner-ring ---------- */
var ring = M.generateLoaderCSS("spinner-ring", M.defaultParams("spinner-ring"));
ok(ring.indexOf("@keyframes spin") !== -1, "spinner-ring 含 @keyframes spin");
ok(ring.indexOf("animation: spin 1s linear infinite") !== -1,
  "spinner-ring 含 animation: spin 1s linear infinite");
ok(ring.indexOf("border-radius: 50%") !== -1, "spinner-ring 含 border-radius: 50%");

/* ---------- 4. 确定性向量：spinner-dots（stagger = speed/6） ---------- */
var dots = M.generateLoaderCSS("spinner-dots", { size: 48, color: "#3b82f6", speed: 0.9, count: 3 });
eq((dots.match(/span:nth-child\(/g) || []).length, 3, "dots count=3 生成 3 个 dot 规则块");
ok(dots.indexOf("animation-delay: 0s") !== -1, "dots 第 1 项 animation-delay 0s");
ok(dots.indexOf("animation-delay: 0.15s") !== -1, "dots 第 2 项 animation-delay 0.15s（speed/6）");
ok(dots.indexOf("animation-delay: 0.3s") !== -1, "dots 第 3 项 animation-delay 0.3s");
ok(dots.indexOf("@keyframes dot-jump") !== -1, "dots 含 @keyframes dot-jump");

/* ---------- 5. 确定性向量：bars ---------- */
var bars = M.generateLoaderCSS("bars", { size: 48, color: "#000000", speed: 1, count: 5 });
eq((bars.match(/span:nth-child\(/g) || []).length, 5, "bars count=5 生成 5 条 bar 规则块");
ok(bars.indexOf("@keyframes bar-bounce") !== -1, "bars 含 @keyframes bar-bounce");

/* ---------- 6. 确定性向量：progress-bar ---------- */
var pb = M.generateLoaderCSS("progress-bar", M.defaultParams("progress-bar"));
ok(pb.indexOf("@keyframes progress-indeterminate") !== -1,
  "progress-bar 含 @keyframes progress-indeterminate");
ok(pb.indexOf("animation: progress-indeterminate 1.6s") !== -1,
  "progress-bar 默认 speed 1.6s");

/* ---------- 7. 其余类型冒烟 ---------- */
["pulse", "grid", "wave-bar"].forEach(function (t) {
  var c = M.generateLoaderCSS(t, M.defaultParams(t));
  ok(c.indexOf("@keyframes") !== -1 && c.indexOf(".loader") !== -1,
    t + " 输出含 .loader 与 @keyframes");
});
ok(M.generateLoaderCSS("grid", M.defaultParams("grid")).indexOf("@keyframes grid-blink") !== -1,
  "grid 含 @keyframes grid-blink");
ok(M.generateLoaderCSS("pulse", M.defaultParams("pulse")).indexOf("@keyframes pulse-scale") !== -1,
  "pulse 含 @keyframes pulse-scale");
ok(M.generateLoaderCSS("wave-bar", M.defaultParams("wave-bar")).indexOf("@keyframes wave-sweep") !== -1,
  "wave-bar 含 @keyframes wave-sweep");

/* ---------- 8. generateLoaderHTML ---------- */
var html = M.generateLoaderHTML("spinner-dots", { size: 48, color: "#3b82f6", speed: 0.9, count: 3 });
eq((html.match(/<span><\/span>/g) || []).length, 3,
  "generateLoaderHTML dots count=3 恰 3 个 <span>");
ok(html.indexOf('<div class="loader">') !== -1, "generateLoaderHTML 含 div.loader");
var htmlRing = M.generateLoaderHTML("spinner-ring", M.defaultParams("spinner-ring"));
eq(htmlRing, '<div class="loader"></div>', "generateLoaderHTML spinner-ring 单容器无子元素");
var htmlGrid = M.generateLoaderHTML("grid", M.defaultParams("grid"));
eq((htmlGrid.match(/<span><\/span>/g) || []).length, 9, "generateLoaderHTML grid 恰 9 个 <span>");

/* ---------- 9. generateLoaderPreview ---------- */
var pv = M.generateLoaderPreview("pulse", M.defaultParams("pulse"));
ok(typeof pv === "object" && pv !== null, "generateLoaderPreview 返回对象");
ok(typeof pv.css === "string" && pv.css.indexOf("@keyframes pulse-scale") !== -1,
  "generateLoaderPreview.css 含关键帧");
ok(pv.html.indexOf('<div class="loader"></div>') !== -1, "generateLoaderPreview.html 结构正确");
ok(typeof pv.label === "string" && pv.label.length > 0, "generateLoaderPreview.label 非空");

/* ---------- 10. 非法参数：err.field ---------- */
throws(function () { M.generateLoaderCSS("unknown-type", {}); }, "type", "未知 type 抛错 field=type");
throws(function () { M.generateLoaderCSS("bars", { size: -1, color: "#000000", speed: 1, count: 5 }); },
  "param", "size=-1 抛错 field=param");
throws(function () { M.generateLoaderCSS("bars", { size: 200, color: "#000000", speed: 1, count: 5 }); },
  "param", "size=200 越界抛错 field=param");
throws(function () { M.generateLoaderCSS("bars", { size: 48, color: "red", speed: 1, count: 5 }); },
  "param", "颜色 'red' 抛错 field=param");
throws(function () { M.generateLoaderCSS("bars", { size: 48, color: "zzz", speed: 1, count: 5 }); },
  "param", "颜色 'zzz' 抛错 field=param");
throws(function () { M.generateLoaderCSS("bars", { size: 48, color: "#abc", speed: 1, count: 5 }); },
  "param", "颜色 #RGB 抛错 field=param（只接受 6 位）");
throws(function () { M.generateLoaderCSS("bars", { size: 48, color: "#000000", speed: 0.1, count: 5 }); },
  "param", "speed=0.1 越界抛错 field=param");
throws(function () { M.generateLoaderCSS("bars", { size: 48, color: "#000000", speed: 1, count: 2 }); },
  "param", "bars count=2 抛错 field=param（bars 限定 3–8）");
throws(function () { M.generateLoaderCSS("spinner-dots", { size: 48, color: "#000000", speed: 1, count: 6 }); },
  "param", "dots count=6 抛错 field=param（dots 限定 2–5）");
throws(function () { M.generateLoaderCSS("progress-bar", { size: 48, color: "#000000", speed: 1, count: 2 }); },
  "param", "progress-bar count=2 抛错 field=param（固定 1）");
throws(function () { M.generateLoaderCSS("grid", { size: 48, color: "#000000", speed: 1, count: 4 }); },
  "param", "grid count=4 抛错 field=param（固定 9）");
throws(function () { M.generateLoaderHTML("unknown-type", {}); }, "type", "HTML 未知 type 抛错 field=type");

/* 颜色大小写归一化 */
var up = M.generateLoaderCSS("bars", { size: 48, color: "#ABCDEF", speed: 1, count: 5 });
ok(up.indexOf("#abcdef") !== -1, "颜色大写归一化为小写");

/* ---------- 11. 注册与零网络请求静态检查 ---------- */
ok(GO_SRC.indexOf('"css_loader_generator"') !== -1, "categories.go 注册 ID");
ok(GO_SRC.indexOf('"/tools/css-loader-generator"') !== -1, "categories.go 注册 Path");
var regBlock = GO_SRC.split('"css_loader_generator"')[1].split("},")[0];
ok(regBlock.indexOf('Category:    "开发工具"') !== -1, "categories.go 注册 Category 开发工具");
ok(regBlock.indexOf("New:         true") !== -1, "categories.go 注册 New true");
ok(regBlock.indexOf('Icon:        "autorenew"') !== -1, "categories.go 注册 Icon autorenew");
var pathCount = {};
GO_SRC.replace(/"(\/tools\/[^"]+)"/g, function (_, p) { pathCount[p] = 1; return p; });
eq(Object.keys(pathCount).length, 239, "注册 Path 总数 238→239");
ok(JS_SRC.indexOf("fetch(") === -1 && JS_SRC.indexOf("XMLHttpRequest") === -1,
  "JS 零 fetch/XHR");
ok(!/src="https?:\/\//.test(TPL_SRC), "模板无外部脚本引用");
ok(!/href="https?:\/\/(?!www\.johnkingzcq123\.xyz)/.test(TPL_SRC), "模板无外部超链接");
ok(TPL_SRC.indexOf("/tools/skeleton-screen-generator") !== -1, "模板互链骨架屏加载占位生成器");
ok(TPL_SRC.indexOf("/tools/css-keyframe-generator") !== -1, "模板互链 CSS 动画关键帧生成器");
ok(TPL_SRC.indexOf("/tools/css-button-generator") !== -1, "模板互链 CSS 按钮生成器");
ok(TPL_SRC.indexOf("/tools/3d-mockup") === -1 && TPL_SRC.indexOf("llms.txt") === -1,
  "模板不链未交付工具（3D 样机／llms.txt）");
ok(TPL_SRC.indexOf("不依赖任何 JS 库") !== -1, "模板真限制①：独立 keyframes 零依赖");
ok(TPL_SRC.indexOf("不管理真实异步状态") !== -1, "模板真限制②：不管理异步状态");
ok(TPL_SRC.indexOf("IE9") !== -1, "模板真限制③：CSS3 animation 老浏览器限制");
ok(TPL_SRC.indexOf("不收集") !== -1 && TPL_SRC.indexOf("不上传") !== -1, "模板真限制④＋隐私：不收集不上传");
ok(TPL_SRC.indexOf('src="/tools/static/js/css_loader_generator.js') !== -1, "模板引用本工具 JS");

console.log("PASS: " + pass + "  FAIL: " + fail);
process.exit(fail ? 1 : 0);
