/* 文档扫描去底纹纯逻辑单元测试（零依赖）：node tests/doc_bg_cleaner.test.js
 * 覆盖：rgbToGray 精确值与非法抛错 err.field、buildGrayHistogram 256 桶计数精确值、
 * otsuThreshold 经典双峰直方图阈值精确值、whitenPixel 背景提亮/文字保持精确值与
 * strength 越界抛错、applyWhitening auto 阈值路径与非法 options 抛错、
 * estimateInkCoverage 0–1 范围与全白/全黑精确值、sanitizeFileName 空回退 'doc-cleaned'、
 * categories.go 注册（Path 总数 300→301、Icon filter_b_and_w 全库唯一、New/类目）、
 * 模板（SEO 四关键词、真限制四条、扫描件效果生成器双向互链、零外部资源静态检查）。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/doc_bg_cleaner.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function eqj(a, b, name) { eq(JSON.stringify(a), JSON.stringify(b), name); }
function has(s, sub, name) { ok(s.indexOf(sub) !== -1, name + "（缺 " + sub + "）"); }
function notHas(s, sub, name) { ok(s.indexOf(sub) === -1, name + "（不应含 " + sub + "）"); }
function throws(fn, field, name) {
  try { fn(); ok(false, name + "（应抛错却未抛）"); }
  catch (e) { ok(!field || e.field === field, name + "（err.field 期望 " + field + "，实得 " + e.field + "）"); }
}
function H(pairs) {
  var h = new Array(256).fill(0);
  pairs.forEach(function (p) { h[p[0]] = p[1]; });
  return h;
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "doc_bg_cleaner.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "doc_bg_cleaner.html"), "utf8");
var SCAN_TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "scan_effect_generator.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. rgbToGray：精确值与非法抛错 ---------- */
eq(M.rgbToGray(255, 0, 0), 76, "红 luminosity 灰度=76");
eq(M.rgbToGray(0, 255, 0), 150, "绿 luminosity 灰度=150");
eq(M.rgbToGray(0, 0, 255), 29, "蓝 luminosity 灰度=29");
eq(M.rgbToGray(255, 255, 255), 255, "纯白→255");
eq(M.rgbToGray(0, 0, 0), 0, "纯黑→0");
eq(M.rgbToGray(128, 128, 128), 128, "中灰→128");
throws(function () { M.rgbToGray("x", 0, 0); }, "r", "r 非数字抛错 field=r");
throws(function () { M.rgbToGray(0, NaN, 0); }, "g", "g NaN 抛错 field=g");
throws(function () { M.rgbToGray(0, 0, 300); }, "b", "b 超 255 抛错 field=b");
throws(function () { M.rgbToGray(-1, 0, 0); }, "r", "r 负值抛错 field=r");
throws(function () { M.rgbToGray(0, 0, Infinity); }, "b", "b Infinity 抛错 field=b");

/* ---------- 2. buildGrayHistogram：256 桶计数精确值 ---------- */
var hist = M.buildGrayHistogram([0, 0, 255, 128, 128, 128]);
eq(hist.length, 256, "直方图 256 桶");
eq(hist[0], 2, "bin0 计数=2");
eq(hist[128], 3, "bin128 计数=3");
eq(hist[255], 1, "bin255 计数=1");
eq(hist[1], 0, "bin1 计数=0");
eq(hist.reduce(function (a, b) { return a + b; }, 0), 6, "总计数=6");
throws(function () { M.buildGrayHistogram(null); }, "grayData", "null 抛错 field=grayData");
throws(function () { M.buildGrayHistogram([]); }, "grayData", "空数组抛错 field=grayData");
throws(function () { M.buildGrayHistogram([0, 256]); }, "grayData", "超 255 灰度抛错 field=grayData");
throws(function () { M.buildGrayHistogram([0, NaN]); }, "grayData", "NaN 灰度抛错 field=grayData");

/* ---------- 3. otsuThreshold：经典双峰直方图阈值精确值 ---------- */
eq(M.otsuThreshold(H([[50, 100], [200, 100]])), 50, "双峰等高→首个最大阈值 50");
eq(M.otsuThreshold(H([[0, 10], [100, 40], [200, 50]])), 100, "三簇→阈值 100");
eq(M.otsuThreshold(H([[128, 100]])), 0, "单值退化→0（确定性）");
eq(M.otsuThreshold(H([[50, 100], [200, 100]])), M.otsuThreshold(H([[50, 100], [200, 100]])),
  "重复调用结果一致（确定性）");
throws(function () { M.otsuThreshold(null); }, "hist", "null 抛错 field=hist");
throws(function () { M.otsuThreshold(new Array(128).fill(1)); }, "hist", "128 bin 抛错 field=hist");
var negH = H([[5, 10]]); negH[5] = -1;
throws(function () { M.otsuThreshold(negH); }, "hist", "负 bin 抛错 field=hist");
throws(function () { M.otsuThreshold(new Array(256).fill(0)); }, "hist", "全零直方图抛错 field=hist");

/* ---------- 4. whitenPixel：背景提亮/文字保持精确值与越界抛错 ---------- */
eq(M.whitenPixel(180, 150, 1), 255, "背景 180＋强度 1→全白 255");
eq(M.whitenPixel(120, 150, 1), 120, "文字 120≤阈值保持不变");
eq(M.whitenPixel(180, 150, 0.5), 218, "背景 180＋强度 0.5→218");
eq(M.whitenPixel(180, 150, 0), 180, "强度 0→原值不变");
eq(M.whitenPixel(150, 150, 1), 150, "等于阈值视为文字保持");
throws(function () { M.whitenPixel(180, 150, 1.5); }, "strength", "strength>1 抛错 field=strength");
throws(function () { M.whitenPixel(180, 150, -0.1); }, "strength", "strength<0 抛错 field=strength");
throws(function () { M.whitenPixel(180, 150, NaN); }, "strength", "strength NaN 抛错 field=strength");
throws(function () { M.whitenPixel(300, 150, 0.5); }, "gray", "gray 超 255 抛错 field=gray");
throws(function () { M.whitenPixel(180, 256, 0.5); }, "threshold", "threshold 非法抛错 field=threshold");

/* ---------- 5. applyWhitening：auto 阈值路径与非法 options 抛错 ---------- */
var autoOut = M.applyWhitening([200, 200, 50, 50], 2, 2, { threshold: "auto", strength: 1 });
ok(autoOut instanceof Uint8ClampedArray, "applyWhitening auto→Uint8ClampedArray");
eqj(Array.from(autoOut), [50, 50, 50, 50], "auto Otsu(阈值 50)＋2x2 中值滤波→全 50");
var denoiseOut = M.applyWhitening([200, 200, 200, 200, 50, 200, 200, 200, 200], 3, 3,
  { threshold: 128, strength: 1 });
eqj(Array.from(denoiseOut), [255, 255, 255, 255, 255, 255, 255, 255, 255],
  "3x3 中值滤波抹掉中心孤立噪点→全 255");
throws(function () { M.applyWhitening([1, 1, 1, 1], 2, 2, null); }, "options", "options null 抛错 field=options");
throws(function () { M.applyWhitening([1, 1, 1, 1], 2, 2, { threshold: 128 }); }, "options",
  "options 缺 strength 抛错 field=options");
throws(function () { M.applyWhitening([1, 1, 1, 1], 2, 2, { threshold: 128, strength: 2 }); }, "options",
  "strength 越界经 options 抛错 field=options");
throws(function () { M.applyWhitening([1, 1, 1], 2, 2, { threshold: 128, strength: 1 }); }, "grayData",
  "灰度长度≠w*h 抛错 field=grayData");
throws(function () { M.applyWhitening([1, 1, 1, 1], 0, 2, { threshold: 128, strength: 1 }); }, "width",
  "width=0 抛错 field=width");
throws(function () { M.applyWhitening([1, 1, 1, 1], 2, 1.5, { threshold: 128, strength: 1 }); }, "height",
  "height 非整数抛错 field=height");

/* ---------- 6. estimateInkCoverage：0–1 范围与全白/全黑精确值 ---------- */
eq(M.estimateInkCoverage([0, 0, 0, 0], 128), 1, "全黑→覆盖率 1");
eq(M.estimateInkCoverage([255, 255, 255, 255], 128), 0, "全白→覆盖率 0");
eq(M.estimateInkCoverage([0, 255, 255, 255], 128), 0.25, "一黑三白→0.25");
ok(M.estimateInkCoverage([10, 200, 30, 250], 100) >= 0 &&
  M.estimateInkCoverage([10, 200, 30, 250], 100) <= 1, "覆盖率在 0–1 范围内");
throws(function () { M.estimateInkCoverage([], 128); }, "grayData", "空数组抛错 field=grayData");
throws(function () { M.estimateInkCoverage([0, 1], 300); }, "threshold", "阈值非法抛错 field=threshold");

/* ---------- 7. sanitizeFileName：空回退 'doc-cleaned' ---------- */
eq(M.sanitizeFileName(""), "doc-cleaned", "空字符串回退 doc-cleaned");
eq(M.sanitizeFileName(null), "doc-cleaned", "null 回退 doc-cleaned");
eq(M.sanitizeFileName("   "), "doc-cleaned", "全空格回退 doc-cleaned");
eq(M.sanitizeFileName("合同照片 2026"), "合同照片-2026", "空格转连字符");
eq(M.sanitizeFileName("a/b\\c:d*e?f\"g<h>i|j"), "abcdefghij", "非法字符剔除");
eq(M.MAX_FILE_SIZE, 20 * 1024 * 1024, "输入上限常量 20MB");

/* ---------- 8. 双模式导出 ---------- */
ok(typeof M.rgbToGray === "function" && typeof M.applyWhitening === "function" &&
  typeof M.estimateInkCoverage === "function" && typeof M.sanitizeFileName === "function",
  "module.exports 暴露全部纯函数");
has(JS_SRC, "window.DocBgCleaner", "浏览器端挂 window.DocBgCleaner");
notHas(JS_SRC, "fetch(", "零网络：doc_bg_cleaner.js 无 fetch");
notHas(JS_SRC, "XMLHttpRequest", "零网络：doc_bg_cleaner.js 无 XHR");
notHas(JS_SRC, "WebSocket", "零网络：doc_bg_cleaner.js 无 WebSocket");

/* ---------- 9. categories.go 注册 ---------- */
var pathCount = (GO_SRC.match(/Path:\s*"/g) || []).length;
eq(pathCount, 301, "注册 Path 总数 300→301");
has(GO_SRC, 'ID:          "doc_bg_cleaner"', "注册：ID doc_bg_cleaner");
has(GO_SRC, 'Path:        "/tools/doc-bg-cleaner"', "注册：Path /tools/doc-bg-cleaner");
has(GO_SRC, 'Icon:        "filter_b_and_w"', "注册：Icon filter_b_and_w");
eq((GO_SRC.match(/Icon:\s*"filter_b_and_w"/g) || []).length, 1, "Icon filter_b_and_w 全库唯一");
var entryBlock = GO_SRC.slice(GO_SRC.indexOf('ID:          "doc_bg_cleaner"') - 60,
  GO_SRC.indexOf('ID:          "doc_bg_cleaner"') + 1400);
has(entryBlock, "New:         true", "注册：New: true");
has(entryBlock, 'Category:    "图片处理"', "注册：类目 图片处理");
has(entryBlock, "零上传", "注册：Description 含零上传");
has(entryBlock, "doc-cleaned", "注册：Description 含 doc-cleaned");

/* ---------- 10. 模板：SEO/真限制/互链/零外部资源 ---------- */
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/doc-bg-cleaner", "模板 canonical 含新 Path");
has(TPL_SRC, "文档去底纹", "模板 SEO 关键词：文档去底纹");
has(TPL_SRC, "扫描件增白", "模板 SEO 关键词：扫描件增白");
has(TPL_SRC, "手机拍照文档处理", "模板 SEO 关键词：手机拍照文档处理");
has(TPL_SRC, "打印去灰底", "模板 SEO 关键词：打印去灰底");
has(TPL_SRC, "真限制", "模板：真限制章节");
has(TPL_SRC, "深色纸张", "真限制①：深色纸/彩色底纹/浅色笔迹");
has(TPL_SRC, "强阴影", "真限制②：强阴影/褶皱残留");
has(TPL_SRC, "不上传任何服务器", "真限制③：零上传");
has(TPL_SRC, "20MB", "真限制④：20MB 上限");
has(TPL_SRC, "/tools/scan-effect-generator", "互链：扫描件效果生成器（反向口径互补）");
has(TPL_SRC, "反向口径互补", "互链文案：反向口径互补");
has(SCAN_TPL_SRC, "/tools/doc-bg-cleaner", "互链回链：扫描件效果生成器相关工具区回链文档扫描去底纹");
has(TPL_SRC, "/tools/static/js/vendor/pdf-lib.min.js", "模板引用本地 vendor pdf-lib");
has(TPL_SRC, "/tools/static/js/doc_bg_cleaner.js", "模板引用 doc_bg_cleaner.js");
notHas(TPL_SRC, "fonts.googleapis", "模板零 CDN：无外部字体");
ok((TPL_SRC.match(/<script[^>]*src="http/g) || []).length === 0, "模板零外部脚本：无 http script src");
var httpLinks = (TPL_SRC.match(/<link[^>]*href="(http[^"]*)"/g) || []).map(function (t) {
  return t.replace(/^.*href="/, "").replace(/"$/, "");
});
ok(httpLinks.every(function (u) { return u.indexOf("johnkingzcq123.xyz") !== -1; }),
  "模板零外部样式：http link 仅 canonical 自家域名");
has(TPL_SRC, 'id="dbc-drop"', "模板含上传区 dbc-drop");
has(TPL_SRC, 'id="dbc-thr"', "模板含阈值滑块 dbc-thr");
has(TPL_SRC, 'id="dbc-strength"', "模板含漂白强度滑块 dbc-strength");
has(TPL_SRC, 'id="dbc-pos"', "模板含对比滑块 dbc-pos");
has(TPL_SRC, 'id="dbc-export-png"', "模板含 PNG 导出按钮");
has(TPL_SRC, 'id="dbc-export-pdf"', "模板含 PDF 导出按钮");
has(TPL_SRC, 'aria-label', "模板：含 aria 无障碍标签");
has(TPL_SRC, "prefers-reduced-motion", "模板：动画可减弱媒体查询");

console.log("PASS: " + pass + "  FAIL: " + fail);
process.exit(fail ? 1 : 0);
