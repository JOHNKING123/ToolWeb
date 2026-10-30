/* 手写签名数字化仪纯逻辑单元测试（零依赖）：node tests/signature_capture.test.js
 * 覆盖：rgbToGray 灰度向量、otsuThreshold 确定性阈值、computeAlpha 去底逐像素、
 * detectBBox 边界框、cropToBBox 裁剪、端到端小向量链路、非法参数 err.field、
 * 注册与零网络请求静态检查、真限制四条、互链合规、webcam 优雅降级。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/signature_capture.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function eqj(a, b, name) { eq(JSON.stringify(a), JSON.stringify(b), name); }
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
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "signature_capture.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "signature_capture.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. rgbToGray：灰度向量 ---------- */
eqj(M.rgbToGray({ data: [255, 0, 0, 255, 0, 0, 255, 255], width: 2, height: 1 }),
  [76, 29], "红/蓝 luminosity 灰度逐值命中（76/29）");
eqj(M.rgbToGray({ data: [255, 255, 255, 255], width: 1, height: 1 }), [255], "纯白→255");
eqj(M.rgbToGray({ data: [0, 0, 0, 255], width: 1, height: 1 }), [0], "纯黑→0");
var gIn = [10, 20, 30, 255, 40, 50, 60, 255];
M.rgbToGray({ data: gIn.slice(), width: 2, height: 1 });
eqj(gIn, [10, 20, 30, 255, 40, 50, 60, 255], "rgbToGray 不修改输入数组");
throws(function () { M.rgbToGray(null); }, "image", "null 抛错 field=image");
throws(function () { M.rgbToGray({}); }, "image", "空对象抛错 field=image");
throws(function () { M.rgbToGray({ data: [0, 0, 0, 255], width: 0, height: 1 }); }, "image", "width=0 抛错");
throws(function () { M.rgbToGray({ data: [0, 0, 0, 255], width: 1.5, height: 1 }); }, "image", "width 非整数抛错");
throws(function () { M.rgbToGray({ data: [0, 0, 0], width: 1, height: 1 }); }, "image", "data 长度不匹配抛错");
throws(function () { M.rgbToGray({ data: [NaN, 0, 0, 255], width: 1, height: 1 }); }, "image", "NaN 像素抛错");
throws(function () { M.rgbToGray({ data: [300, 0, 0, 255], width: 1, height: 1 }); }, "image", "超 255 像素抛错");

/* ---------- 2. otsuThreshold：确定性阈值 ---------- */
eq(M.otsuThreshold(H([[10, 100], [20, 100]])), 10, "双峰等高→首个最大阈值 10");
eq(M.otsuThreshold(H([[0, 10], [100, 40], [200, 50]])), 100, "三簇→阈值 100");
eq(M.otsuThreshold(H([[128, 100]])), 0, "单值退化→0（确定性）");
eq(M.otsuThreshold(H([[10, 100], [20, 100]])), M.otsuThreshold(H([[10, 100], [20, 100]])),
  "重复调用结果一致（确定性）");
throws(function () { M.otsuThreshold(null); }, "hist", "null 抛错 field=hist");
throws(function () { M.otsuThreshold("str"); }, "hist", "字符串抛错 field=hist");
throws(function () { M.otsuThreshold(new Array(128).fill(1)); }, "hist", "128 bin 抛错 field=hist");
var negH = H([[5, 10]]); negH[5] = -1;
throws(function () { M.otsuThreshold(negH); }, "hist", "负 bin 抛错 field=hist");
var nanH = H([[5, 10]]); nanH[6] = NaN;
throws(function () { M.otsuThreshold(nanH); }, "hist", "NaN bin 抛错 field=hist");
throws(function () { M.otsuThreshold(new Array(256).fill(0)); }, "hist", "全零直方图抛错 field=hist");
var strH = H([[5, 10]]); strH[7] = "x";
throws(function () { M.otsuThreshold(strH); }, "hist", "非数字 bin 抛错 field=hist");

/* ---------- 3. computeAlpha：去底逐像素 ---------- */
var caIn = { data: [0, 0, 0, 255, 255, 255, 255, 255, 128, 128, 128, 255, 200, 50, 50, 255], width: 2, height: 2 };
var caOut = M.computeAlpha(caIn, 128);
eqj(caOut.data,
  [0, 0, 0, 255, 255, 255, 255, 0, 128, 128, 128, 255, 200, 50, 50, 255],
  "阈值 128 去底逐像素命中（黑/灰/红笔迹不透明，白底透明）");
eq(caOut.width, 2, "computeAlpha 宽保持");
eq(caOut.height, 2, "computeAlpha 高保持");
eqj(caIn.data, [0, 0, 0, 255, 255, 255, 255, 255, 128, 128, 128, 255, 200, 50, 50, 255],
  "computeAlpha 不修改输入");
throws(function () { M.computeAlpha(caIn, -1); }, "threshold", "阈值 -1 抛错 field=threshold");
throws(function () { M.computeAlpha(caIn, 256); }, "threshold", "阈值 256 抛错 field=threshold");
throws(function () { M.computeAlpha(caIn, 1.5); }, "threshold", "阈值小数抛错 field=threshold");
throws(function () { M.computeAlpha(caIn, "128"); }, "threshold", "阈值字符串抛错 field=threshold");
throws(function () { M.computeAlpha(null, 128); }, "image", "图像 null 抛错 field=image");

/* ---------- 4. detectBBox：边界框 ---------- */
var bbData = new Array(4 * 3 * 4).fill(0);
bbData[(0 * 4 + 1) * 4 + 3] = 255; /* (1,0) */
bbData[(2 * 4 + 3) * 4 + 3] = 255; /* (3,2) */
eqj(M.detectBBox({ data: bbData, width: 4, height: 3 }), { x: 1, y: 0, w: 3, h: 3 },
  "两点边界框逐值命中");
var bbSingle = new Array(2 * 2 * 4).fill(0);
bbSingle[(1 * 2 + 0) * 4 + 3] = 255;
eqj(M.detectBBox({ data: bbSingle, width: 2, height: 2 }), { x: 0, y: 1, w: 1, h: 1 },
  "单像素边界框");
eq(M.detectBBox({ data: new Array(2 * 2 * 4).fill(0), width: 2, height: 2 }), null,
  "全透明返回 null");
throws(function () { M.detectBBox(null); }, "image", "null 抛错 field=image");
throws(function () { M.detectBBox({ data: [], width: 0, height: 2 }); }, "image", "width=0 抛错 field=image");

/* ---------- 5. cropToBBox：裁剪 ---------- */
var cropData = [];
for (var pi = 0; pi < 16; pi++) { cropData.push(pi, pi, pi, 255); }
var cropImg = { data: cropData, width: 4, height: 4 };
var c0 = M.cropToBBox(cropImg, { x: 1, y: 1, w: 2, h: 2 }, 0);
eqj(c0.data, [5, 5, 5, 255, 6, 6, 6, 255, 9, 9, 9, 255, 10, 10, 10, 255],
  "padding=0 裁剪逐字节命中");
eq(c0.width, 2, "裁剪宽 2");
eq(c0.height, 2, "裁剪高 2");
var c1 = M.cropToBBox(cropImg, { x: 1, y: 1, w: 2, h: 2 }, 1);
eq(c1.width, 4, "padding=1 扩展钳制宽 4");
eq(c1.height, 4, "padding=1 扩展钳制高 4");
eqj(c1.data, cropData, "padding=1 扩展钳制后内容即原图");
var c2 = M.cropToBBox(cropImg, { x: 0, y: 0, w: 4, h: 4 }, 100);
eq(c2.width, 4, "超大 padding 钳制不越界");
throws(function () { M.cropToBBox(cropImg, null, 0); }, "bbox", "bbox null 抛错 field=bbox");
throws(function () { M.cropToBBox(cropImg, { x: -1, y: 0, w: 1, h: 1 }, 0); }, "bbox", "x 负数抛错");
throws(function () { M.cropToBBox(cropImg, { x: 0, y: 0, w: 0, h: 1 }, 0); }, "bbox", "w=0 抛错");
throws(function () { M.cropToBBox(cropImg, { x: 3, y: 3, w: 2, h: 2 }, 0); }, "bbox", "越界 bbox 抛错");
throws(function () { M.cropToBBox(cropImg, { x: 0, y: 0, w: 1.5, h: 1 }, 0); }, "bbox", "w 非整数抛错");
throws(function () { M.cropToBBox(cropImg, { x: 0, y: 0, w: 1, h: 1 }, -1); }, "padding", "padding 负数抛错");
throws(function () { M.cropToBBox(cropImg, { x: 0, y: 0, w: 1, h: 1 }, 1.5); }, "padding", "padding 小数抛错");
throws(function () { M.cropToBBox(cropImg, { x: 0, y: 0, w: 1, h: 1 }, "2"); }, "padding", "padding 字符串抛错");

/* ---------- 6. 端到端小向量链路 ---------- */
var e2e = { data: new Array(3 * 3 * 4), width: 3, height: 3 };
for (var ei = 0; ei < 9; ei++) {
  e2e.data[ei * 4] = 255; e2e.data[ei * 4 + 1] = 255; e2e.data[ei * 4 + 2] = 255; e2e.data[ei * 4 + 3] = 255;
}
e2e.data[(1 * 3 + 1) * 4] = 0; e2e.data[(1 * 3 + 1) * 4 + 1] = 0; e2e.data[(1 * 3 + 1) * 4 + 2] = 0;
var e2eAlpha = M.computeAlpha(e2e, 200);
var e2eBox = M.detectBBox(e2eAlpha);
eqj(e2eBox, { x: 1, y: 1, w: 1, h: 1 }, "链路：中心黑点检出 1x1 边界框");
var e2eCrop = M.cropToBBox(e2eAlpha, e2eBox, 1);
eq(e2eCrop.width, 3, "链路：padding=1 钳制回 3x3");
eq(e2eCrop.data[(1 * 3 + 1) * 4 + 3], 255, "链路：中心像素不透明");
eq(e2eCrop.data[3], 0, "链路：角落像素透明");

/* ---------- 7. 注册 ---------- */
ok(GO_SRC.indexOf('"signature_capture"') !== -1, "categories.go 注册 ID");
ok(GO_SRC.indexOf('"/tools/signature-capture"') !== -1, "categories.go 注册 Path");
var regBlock = GO_SRC.split('"signature_capture"')[1].split("},")[0];
ok(regBlock.indexOf('Category:    "实用工具"') !== -1, "categories.go 注册 Category 实用工具");
ok(regBlock.indexOf("New:         true") !== -1, "categories.go 注册 New true");
ok(regBlock.indexOf('Icon:        "gesture"') !== -1, "categories.go 注册 Icon gesture");
var pathCount = {};
GO_SRC.replace(/"(\/tools\/[^"]+)"/g, function (_, p) { pathCount[p] = 1; return p; });
eq(Object.keys(pathCount).length, 239, "注册 Path 总数 238→239");

/* ---------- 8. 零网络请求静态检查 ---------- */
ok(JS_SRC.indexOf("fetch(") === -1 && JS_SRC.indexOf("XMLHttpRequest") === -1,
  "JS 零 fetch/XHR");
ok(!/src="https?:\/\//.test(TPL_SRC), "模板无外部脚本引用");
ok(!/href="https?:\/\/(?!www\.johnkingzcq123\.xyz)/.test(TPL_SRC), "模板无外部超链接");
ok(TPL_SRC.indexOf('src="/tools/static/js/signature_capture.js') !== -1, "模板引用本工具 JS");

/* ---------- 9. 真限制四条页面明示 ---------- */
ok(TPL_SRC.indexOf("摄像头权限") !== -1 && TPL_SRC.indexOf("HTTPS") !== -1, "模板真限制①：摄像头需权限＋HTTPS");
ok(TPL_SRC.indexOf("白纸") !== -1 && TPL_SRC.indexOf("深色笔") !== -1, "模板真限制②：建议白纸深色笔");
ok(TPL_SRC.indexOf("无 AI 矢量化") !== -1 || TPL_SRC.indexOf("栅格 PNG") !== -1, "模板真限制③：无 AI 矢量化、导出栅格 PNG");
ok(TPL_SRC.indexOf("零上传") !== -1 && TPL_SRC.indexOf("本地") !== -1, "模板真限制④：全程本地零上传");
ok(TPL_SRC.indexOf("不出浏览器") !== -1, "模板隐私声明：数据不出浏览器");

/* ---------- 10. 互链合规 ---------- */
ok(TPL_SRC.indexOf("/tools/pdf-sign") !== -1, "模板互链 PDF 电子签名");
ok(TPL_SRC.indexOf("/tools/mail-signature-generator") !== -1, "模板互链邮件签名生成器");
ok(TPL_SRC.indexOf("嵌入 PDF") !== -1, "互链文案：签名嵌入 PDF vs 签名图下载");
var hrefRe = /href="(\/tools\/[a-z0-9\-\/]+)"/g;
var hm, bad = [];
while ((hm = hrefRe.exec(TPL_SRC)) !== null) {
  if (hm[1] === "/tools/static") continue;
  if (GO_SRC.indexOf('"' + hm[1] + '"') < 0) bad.push(hm[1]);
}
eq(bad.length, 0, "模板外链全部已注册（实得未注册：" + JSON.stringify(bad) + "）");
/* 注：2026-10-30 文件十六进制查看器已交付，原「不链未交付工具」负向断言已删除。 */

/* ---------- 11. webcam 优雅降级 ---------- */
ok(TPL_SRC.indexOf('id="sig-cam-degrade"') !== -1, "模板含摄像头降级提示区");
ok(TPL_SRC.indexOf("不支持摄像头") !== -1 || TPL_SRC.indexOf("无摄像头") !== -1, "降级提示文案明确");
ok(JS_SRC.indexOf("navigator.mediaDevices") !== -1, "JS 探测 mediaDevices 能力");
ok(JS_SRC.indexOf("getUserMedia") !== -1, "JS 经 getUserMedia 取流");

/* ---------- 12. 关键元素 ---------- */
ok(TPL_SRC.indexOf('id="sig-pad"') !== -1, "模板含手写签名板 canvas");
ok(TPL_SRC.indexOf('id="sig-video"') !== -1, "模板含摄像头 video");
ok(TPL_SRC.indexOf('id="sig-tab-cam"') !== -1 && TPL_SRC.indexOf('id="sig-tab-upload"') !== -1 &&
  TPL_SRC.indexOf('id="sig-tab-pad"') !== -1, "模板含三路输入页签");
ok(TPL_SRC.indexOf('id="sig-download"') !== -1 && TPL_SRC.indexOf('id="sig-copy"') !== -1,
  "模板含下载/复制按钮");
ok(TPL_SRC.indexOf('id="sig-thr"') !== -1 && TPL_SRC.indexOf('id="sig-process"') !== -1,
  "模板含阈值滑块与去底按钮");

console.log("PASS: " + pass + "  FAIL: " + fail);
process.exit(fail ? 1 : 0);
