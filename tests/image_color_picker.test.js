/* 图片取色器与主色提取纯逻辑单元测试（零依赖）：node tests/image_color_picker.test.js
 * 覆盖：颜色格式向量、像素读取向量、量化向量、导出与文件校验向量、注册与零网络静态检查 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/image_color_picker.js");
var pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; } else { fail++; console.error("FAIL:", name); } }
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function deepEq(a, b, name) { eq(JSON.stringify(a), JSON.stringify(b), name); }
function near(a, b, tol, name) { ok(Math.abs(a - b) <= tol, name + "（期望 " + b + "±" + tol + "，实得 " + a + "）"); }
var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "image_color_picker.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "image_color_picker.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* 1. 颜色格式 */
eq(M.rgbToHex(255, 0, 0), "#ff0000", "纯红 HEX 小写");
eq(M.rgbToHex(0, 0, 0), "#000000", "纯黑 HEX");
eq(M.rgbToHex(255, 255, 255), "#ffffff", "纯白 HEX");
eq(M.rgbToHex(256, 0, 0), null, "越界 RGB 失败");
eq(M.rgbToHex(1.5, 0, 0), null, "非整数 RGB 失败");
eq(M.rgbToHex(-1, 0, 0), null, "负值 RGB 失败");
deepEq(M.hexToRgb("#FF0000"), { r: 255, g: 0, b: 0 }, "大写 HEX 解析");
deepEq(M.hexToRgb("2563eb"), { r: 37, g: 99, b: 235 }, "无 # HEX 解析");
eq(M.hexToRgb("#f00"), null, "3 位缩写失败");
eq(M.hexToRgb("#gggggg"), null, "非法 HEX 字符失败");
eq(M.hexToRgb("#12345"), null, "长度不对失败");
["#ff0000", "#00ff00", "#0000ff", "#2563eb", "#f59e0b", "#808080", "#123456"].forEach(function (h) {
  var rgb = M.hexToRgb(h);
  eq(M.rgbToHex(rgb.r, rgb.g, rgb.b), h, "HEX→RGB→HEX 往返 " + h);
});
deepEq(M.rgbToHsl(255, 0, 0), { h: 0, s: 100, l: 50 }, "纯红 HSL");
deepEq(M.rgbToHsl(255, 255, 255), { h: 0, s: 0, l: 100 }, "纯白 HSL");
deepEq(M.rgbToHsl(0, 0, 0), { h: 0, s: 0, l: 0 }, "纯黑 HSL");
eq(M.rgbToHsl(300, 0, 0), null, "非法 HSL 输入失败");
deepEq(M.rgbToCmyk(255, 0, 0), { c: 0, m: 100, y: 100, k: 0 }, "纯红 CMYK");
deepEq(M.rgbToCmyk(0, 0, 0), { c: 0, m: 0, y: 0, k: 100 }, "纯黑 CMYK");
eq(M.rgbToCmyk(0, 0, 256), null, "非法 CMYK 输入失败");
deepEq(M.formatColor({ r: 255, g: 0, b: 0 }),
  { hex: "#ff0000", rgb: "rgb(255, 0, 0)", hsl: "hsl(0, 100%, 50%)", cmyk: "cmyk(0%, 100%, 100%, 0%)" }, "formatColor 四格式");
eq(M.formatColor({ r: 300, g: 0, b: 0 }), null, "formatColor 非法失败");

/* 2. 像素读取：2x2 RGBA */
var data = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 128, 255, 255, 0, 0]);
deepEq(M.pickPixel(data, 2, 2, 0, 0), { r: 255, g: 0, b: 0, a: 255 }, "左上红");
deepEq(M.pickPixel(data, 2, 2, 1, 0), { r: 0, g: 255, b: 0, a: 255 }, "右上绿");
deepEq(M.pickPixel(data, 2, 2, 0, 1), { r: 0, g: 0, b: 255, a: 128 }, "左下蓝透明保留 alpha");
deepEq(M.pickPixel(data, 2, 2, 1, 1), { r: 255, g: 255, b: 0, a: 0 }, "右下黄全透明");
eq(M.pickPixel(data, 2, 2, 2, 0), null, "越界 x 失败");
eq(M.pickPixel(data, 2, 2, 0, -1), null, "越界 y 失败");
eq(M.pickPixel(new Uint8ClampedArray([1, 2, 3]), 2, 2, 0, 0), null, "长度不符失败");

/* 3. 抽样与量化 */
var big = [];
for (var i = 0; i < 250; i++) { big.push(10, 20, 30, 255); }
var bigArr = new Uint8ClampedArray(big);
deepEq(M.samplePixels(bigArr, 100), (function () {
  var out = []; for (var k = 0; k < 250; k += 3) out.push({ r: 10, g: 20, b: 30 }); return out;
})(), "固定步长抽样逐项一致（250 像素/上限 100 → 步长 3）");
eq(M.samplePixels(bigArr, 99), null, "maxSamples 小于 100 失败");
eq(M.samplePixels(bigArr, 1.5), null, "maxSamples 非整数失败");
deepEq(M.samplePixels(bigArr), M.samplePixels(bigArr, 10000), "默认 maxSamples 等于 10000");
var pure = []; for (i = 0; i < 20; i++) pure.push({ r: 255, g: 0, b: 0 });
var qPure = M.quantizeColors(pure, 6);
eq(qPure.length, 1, "纯色只返回 1 色");
eq(qPure[0].percent, 100.0, "纯色占比 100.0");
eq(qPure[0].hex, "#ff0000", "纯色 HEX");
var half = []; for (i = 0; i < 50; i++) half.push({ r: 255, g: 0, b: 0 });
for (i = 0; i < 50; i++) half.push({ r: 0, g: 0, b: 255 });
var qHalf = M.quantizeColors(half, 2);
eq(qHalf.length, 2, "红蓝各半返回 2 色");
near(qHalf[0].percent, 50, 1, "首色占比约 50");
near(qHalf[1].percent, 50, 1, "次色占比约 50");
ok(qHalf[0].percent >= qHalf[1].percent, "色板按占比降序");
deepEq(M.quantizeColors(half, 4), M.quantizeColors(half, 4), "同一输入两次逐项一致");
eq(M.quantizeColors([], 6), null, "空数组失败");
eq(M.quantizeColors(half, 0), null, "count 小于 1 失败");
eq(M.quantizeColors(half, 11), null, "count 大于 10 失败");
eq(M.quantizeColors(half, 2.5), null, "count 非整数失败");

/* 4. 导出与文件校验 */
var cols = [{ hex: "#ff0000" }, { hex: "#00ff00" }];
eq(M.buildCssVariables(cols), "--color-1: #ff0000;\n--color-2: #00ff00;", "CSS 变量默认 prefix");
eq(M.buildCssVariables(cols, "brand"), "--brand-1: #ff0000;\n--brand-2: #00ff00;", "CSS 变量自定义 prefix");
eq(M.buildCssVariables(cols, "Bad Prefix"), null, "非法 prefix 失败");
eq(M.buildCssVariables([]), null, "CSS 变量空数组失败");
eq(M.buildHexList(cols), "#ff0000\n#00ff00", "HEX 列表换行分隔小写");
ok(M.buildHexList(cols).indexOf("\n\n") < 0, "HEX 列表无空行");
eq(M.buildHexList([]), null, "HEX 列表空数组失败");
eq(M.suggestExportName("css"), "palette.css", "CSS 导出文件名");
eq(M.suggestExportName("hex"), "palette.txt", "HEX 导出文件名");
eq(M.suggestExportName("png"), null, "其它 kind 失败");
["image/png", "image/jpeg", "image/webp", "image/gif", "image/bmp"].forEach(function (t) {
  ok(M.validateImageMeta(t, 1024).ok, "接受类型 " + t);
});
ok(!M.validateImageMeta("image/svg+xml", 1024).ok, "SVG 类型拒绝");
ok(!M.validateImageMeta("image/png", 20 * 1024 * 1024 + 1).ok, "超 20MB 拒绝");
ok(M.validateImageMeta("image/png", 20 * 1024 * 1024).ok, "恰 20MB 通过");

/* 5. 注册与静态检查 */
ok(GO_SRC.indexOf('"image_color_picker"') >= 0, "categories.go 注册 ID");
ok(GO_SRC.indexOf('"/tools/image-color-picker"') >= 0, "categories.go 注册 Path");
ok(GO_SRC.indexOf('Category:    "图片处理"') >= 0, "categories.go 图片处理品类");
var paths = GO_SRC.match(/"\/tools\/[^"]+"/g) || [];
var uniq = {}; paths.forEach(function (p) { uniq[p] = true; });
eq(Object.keys(uniq).length, 208, "注册总数 207→208 Path");
ok(TPL_SRC.indexOf('id="icp-canvas"') >= 0, "模板含取色 canvas");
ok(TPL_SRC.indexOf('id="icp-mag"') >= 0, "模板含放大镜");
ok(TPL_SRC.indexOf('id="icp-count"') >= 0, "模板含主色数量滑杆");
ok(TPL_SRC.indexOf('id="icp-history"') >= 0, "模板含历史区");
ok(TPL_SRC.indexOf('id="icp-sample"') >= 0, "模板含载入示例");
ok(TPL_SRC.indexOf("/tools/color-converter") >= 0, "互链颜色转换");
ok(TPL_SRC.indexOf("/tools/color-palette-generator") >= 0, "互链配色方案生成器");
ok(TPL_SRC.indexOf("/tools/wcag-contrast-checker") >= 0, "互链 WCAG 对比度检查器");
ok(TPL_SRC.indexOf("只读本地上传图片") >= 0 && TPL_SRC.indexOf("不做 URL 抓取") >= 0, "真限制：只读本地不抓 URL");
ok(TPL_SRC.indexOf("精度受压缩与抗锯齿影响") >= 0, "真限制：精度受压缩影响");
ok(TPL_SRC.indexOf("透明像素") >= 0, "真限制：透明像素说明");
ok(TPL_SRC.indexOf("GIF 只取首帧") >= 0, "真限制：GIF 只取首帧");
ok(TPL_SRC.indexOf("主色提取为量化近似") >= 0, "真限制：主色为量化近似");
ok(TPL_SRC.indexOf("不收集、不上传") >= 0, "真限制：不收集不上传");
ok(JS_SRC.indexOf("fetch(") < 0 && JS_SRC.indexOf("XMLHttpRequest") < 0, "JS 零 fetch/XHR");
ok(TPL_SRC.indexOf("fonts.googleapis.com") < 0 && TPL_SRC.indexOf("cdn.") < 0, "模板零 CDN");
ok(TPL_SRC.indexOf("svg") < 0 || TPL_SRC.indexOf("/tools/svg") < 0, "不链未交付 SVG 工具（无 /tools/svg 互链）");

console.log("PASS " + pass + " FAIL " + fail);
process.exit(fail ? 1 : 0);
