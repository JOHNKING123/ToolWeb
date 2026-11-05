/* 照片拼图合成器（photo_collage）纯逻辑单元测试（零依赖）：
 * node tests/photo_collage.test.js
 * 覆盖：规格确定性向量逐字命中（buildCollageFileName 文件名正则＋固定日期逐字、
 * validateCollageConfig 合法通过＋四字段 err.field、computeCollageLayout 1200×1200/grid-4/gap8
 * 四格坐标逐字、swapCollageSlots 交换逐字＋越界 err.field、coverCrop/collageCanvasSize 辅助向量）、
 * categories.go 注册（Path 总数 268→269、ID/Path/Icon apps/Category 图片处理/New: true、
 * 紧邻 img_stitch 之后）与零网络请求静态检查、
 * 模板真限制四条、SEO 面板（Title/Description/Keywords/OG）、
 * 与 img_stitch/nine_grid 双向互链「拼图一条龙」（合成↔切分↔长拼）。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var A = require("../static/js/photo_collage.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function throwsField(fn, field, name) {
  try { fn(); } catch (e) {
    ok(e instanceof Error && e.field === field,
      name + "（期望抛 Error 且 err.field=" + JSON.stringify(field) + "，实得 " +
      (e instanceof Error ? "Error field=" + JSON.stringify(e.field) : typeof e) + "）");
    return;
  }
  fail++; console.error("FAIL:", name + "（未抛出异常）");
}
function has(s, sub, name) { ok(s.indexOf(sub) !== -1, name); }
function notHas(s, sub, name) { ok(s.indexOf(sub) === -1, name); }

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "photo_collage.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "photo_collage.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");
var STITCH_TPL = fs.readFileSync(path.join(ROOT, "templates", "img_stitch.html"), "utf8");
var NINE_TPL = fs.readFileSync(path.join(ROOT, "templates", "nine_grid.html"), "utf8");

/* ---------- 1. buildCollageFileName：正则＋固定日期逐字 ---------- */
ok(/^photo_collage_\d{8}_\d{6}\.png$/.test(A.buildCollageFileName()), "文件名：默认正则匹配");
eq(A.buildCollageFileName(new Date(2026, 10, 2, 9, 5, 16)), "photo_collage_20261102_090516.png", "文件名：固定日期逐字");
ok(/^photo_collage_\d{8}_\d{6}\.png$/.test(A.buildCollageFileName("invalid")), "文件名：非法 date 回落当前时间");
ok(/^photo_collage_\d{8}_\d{6}\.png$/.test(A.buildCollageFileName(new Date(NaN))), "文件名：NaN 日期回落当前时间");

/* ---------- 2. validateCollageConfig：err.field＋合法通过 ---------- */
throwsField(function () { A.validateCollageConfig({ images: [], layout: "grid-4" }); }, "images", "校验：空 images→err.field=images");
throwsField(function () { A.validateCollageConfig({ layout: "grid-4" }); }, "images", "校验：缺 images→err.field=images");
throwsField(function () { A.validateCollageConfig({ images: "nope", layout: "grid-4" }); }, "images", "校验：images 非数组→err.field=images");
throwsField(function () { A.validateCollageConfig(null); }, "images", "校验：config 为 null→err.field=images");
throwsField(function () { A.validateCollageConfig({ images: ["a"], layout: "grid-99" }); }, "layout", "校验：非法 layout→err.field=layout");
throwsField(function () { A.validateCollageConfig({ images: ["a"], layout: "grid-2", gap: 65 }); }, "gap", "校验：gap=65 越界→err.field=gap");
throwsField(function () { A.validateCollageConfig({ images: ["a"], layout: "grid-2", gap: -1 }); }, "gap", "校验：gap=-1 越界→err.field=gap");
throwsField(function () { A.validateCollageConfig({ images: ["a"], layout: "grid-2", gap: NaN }); }, "gap", "校验：gap=NaN→err.field=gap");
throwsField(function () { A.validateCollageConfig({ images: ["a"], layout: "grid-2", radius: 201 }); }, "radius", "校验：radius=201 越界→err.field=radius");
throwsField(function () { A.validateCollageConfig({ images: ["a"], layout: "grid-2", radius: -1 }); }, "radius", "校验：radius=-1 越界→err.field=radius");
var validCfg = { images: ["a", "b"], layout: "grid-2", gap: 8, radius: 0 };
eq(JSON.stringify(A.validateCollageConfig(validCfg)), '{"ok":true}', "校验：合法配置通过→{ok:true}");
eq(JSON.stringify(A.validateCollageConfig({ images: ["a"], layout: "grid-9", gap: 0, radius: 200 })), '{"ok":true}', "校验：gap=0/radius=200 边界通过");
eq(JSON.stringify(A.validateCollageConfig({ images: ["a"], layout: "grid-9", gap: 64, radius: 0 })), '{"ok":true}', "校验：gap=64 边界通过");
eq(JSON.stringify(A.validateCollageConfig({ images: ["a"], layout: "grid-4" })), '{"ok":true}', "校验：gap/radius 缺省按 0 通过");

/* ---------- 3. computeCollageLayout：1200×1200/grid-4/gap8 四格逐字 ---------- */
var cells = A.computeCollageLayout({ width: 1200, height: 1200, layout: "grid-4", gap: 8 });
eq(JSON.stringify(cells),
  '[{"x":0,"y":0,"w":596,"h":596},{"x":604,"y":0,"w":596,"h":596},{"x":0,"y":604,"w":596,"h":596},{"x":604,"y":604,"w":596,"h":596}]',
  "布局：1200×1200/grid-4/gap8 四格坐标逐字固定");
eq(cells.length, 4, "布局：grid-4 格数为 4");
eq(A.computeCollageLayout({ width: 1200, height: 1200, layout: "grid-9", gap: 0 }).length, 9, "布局：grid-9 格数为 9");
eq(A.computeCollageLayout({ width: 1800, height: 600, layout: "grid-3", gap: 0 }).length, 3, "布局：grid-3 格数为 3");
throwsField(function () { A.computeCollageLayout({ width: 1200, height: 1200, layout: "grid-99", gap: 8 }); }, "layout", "布局：非法 layout→err.field=layout");
throwsField(function () { A.computeCollageLayout({ width: 0, height: 1200, layout: "grid-4", gap: 8 }); }, "layout", "布局：width=0→err.field=layout");
throwsField(function () { A.computeCollageLayout({ width: 1200, height: -5, layout: "grid-4", gap: 8 }); }, "layout", "布局：height 为负→err.field=layout");
throwsField(function () { A.computeCollageLayout({ width: NaN, height: 1200, layout: "grid-4", gap: 8 }); }, "layout", "布局：width=NaN→err.field=layout");
throwsField(function () { A.computeCollageLayout({ width: 10, height: 10, layout: "grid-4", gap: 64 }); }, "layout", "布局：画布容不下格数与间距→err.field=layout");

/* ---------- 4. swapCollageSlots：交换逐字＋越界 ---------- */
eq(JSON.stringify(A.swapCollageSlots(["A", "B", "C"], 0, 2)), '["C","B","A"]', "换位：[A,B,C](0,2)→[C,B,A]逐字固定");
var srcArr = ["A", "B", "C"];
var swapped = A.swapCollageSlots(srcArr, 0, 2);
eq(JSON.stringify(srcArr), '["A","B","C"]', "换位：不改原数组（纯函数）");
eq(JSON.stringify(A.swapCollageSlots(["A", "B"], 1, 1)), '["A","B"]', "换位：同一下标交换结果不变");
throwsField(function () { A.swapCollageSlots("nope", 0, 1); }, "slots", "换位：slots 非数组→err.field=slots");
throwsField(function () { A.swapCollageSlots(null, 0, 1); }, "slots", "换位：slots 为 null→err.field=slots");
throwsField(function () { A.swapCollageSlots(["A"], 0, 5); }, "index", "换位：下标越界→err.field=index");
throwsField(function () { A.swapCollageSlots(["A", "B"], -1, 0); }, "index", "换位：负下标→err.field=index");
throwsField(function () { A.swapCollageSlots(["A", "B"], 0, 2); }, "index", "换位：j==length 越界→err.field=index");
throwsField(function () { A.swapCollageSlots(["A", "B"], 0.5, 1); }, "index", "换位：非整数下标→err.field=index");
throwsField(function () { A.swapCollageSlots([], 0, 0); }, "index", "换位：空数组任何下标越界→err.field=index");

/* ---------- 5. 辅助纯函数向量 ---------- */
var cc = A.coverCrop(400, 200, 100, 100);
eq(cc.scale, 0.5, "cover：400×200 填 100×100 缩放 0.5");
eq(cc.dw, 200, "cover：目标绘制宽 200");
eq(cc.dh, 100, "cover：目标绘制高 100");
eq(cc.dx, -50, "cover：水平居中偏移 -50");
eq(cc.dy, 0, "cover：垂直居中偏移 0");
var cc2 = A.coverCrop(100, 400, 200, 200);
eq(cc2.scale, 2, "cover：竖图 100×400 填 200×200 缩放 2");
eq(JSON.stringify(A.collageCanvasSize("grid-4", 8)), '{"w":1208,"h":1208}', "导出尺寸：grid-4/gap8→1208×1208");
eq(JSON.stringify(A.collageCanvasSize("grid-9", 0)), '{"w":1800,"h":1800}', "导出尺寸：grid-9/gap0→1800×1800");
eq(JSON.stringify(A.collageCanvasSize("grid-2", 16)), '{"w":1216,"h":600}', "导出尺寸：grid-2/gap16→1216×600");
throwsField(function () { A.collageCanvasSize("grid-99", 8); }, "layout", "导出尺寸：非法 layout→err.field=layout");
ok(A.LAYOUTS["grid-2"] && A.LAYOUTS["grid-3"] && A.LAYOUTS["grid-4"] && A.LAYOUTS["grid-6"] && A.LAYOUTS["grid-9"],
  "布局模板：2/3/4/6/9 宫格齐备");

/* ---------- 6. categories.go 注册 ---------- */
var pcIdx = GO_SRC.indexOf('"photo_collage"');
ok(pcIdx >= 0, "注册 ID photo_collage");
ok(GO_SRC.indexOf('"/tools/photo-collage"') >= 0, "注册 Path /tools/photo-collage");
ok(GO_SRC.slice(pcIdx, pcIdx + 900).indexOf('Icon:        "apps"') >= 0, "注册 Icon apps");
ok(GO_SRC.slice(pcIdx, pcIdx + 900).indexOf("New:         true") >= 0, "注册 New 为 true");
ok(GO_SRC.slice(pcIdx, pcIdx + 900).indexOf('Category:    "图片处理"') >= 0, "注册 Category 为图片处理");
ok(GO_SRC.indexOf("Photo collage maker") >= 0, "Description 中英文双语（含英文）");
var stitchIdx = GO_SRC.indexOf('"img_stitch"');
ok(stitchIdx >= 0 && pcIdx > stitchIdx && pcIdx - stitchIdx < 1200, "注册紧邻 img_stitch 之后（拼图家族相邻）");
var iconAppsCount = (GO_SRC.match(/Icon:\s+"apps"/g) || []).length;
eq(iconAppsCount, 1, "Icon apps 全库唯一（1 次命中）");
var pathRe = /"\/tools\/[^"]+"/g, seen = {}, m, pathCount = 0;
while ((m = pathRe.exec(GO_SRC)) !== null) { if (!seen[m[0]]) { seen[m[0]] = true; pathCount++; } }
eq(pathCount, 310, "注册 Path 总数 309→310");

/* ---------- 7. 模板：真限制/SEO/互链/零网络 ---------- */
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/photo-collage", "模板 canonical 含新 Path");
has(TPL_SRC, "<title>照片拼图合成器", "SEO：Title 含工具名");
has(TPL_SRC, 'name="description"', "SEO：Description meta");
has(TPL_SRC, 'name="keywords"', "SEO：Keywords meta");
has(TPL_SRC, 'property="og:title"', "SEO：OG title");
has(TPL_SRC, 'property="og:description"', "SEO：OG description");
has(TPL_SRC, 'property="og:url" content="https://www.johnkingzcq123.xyz/tools/photo-collage"', "SEO：OG url");
has(TPL_SRC, "输出分辨率受浏览器内存限制", "真限制①：内存限制卡顿");
has(TPL_SRC, "覆盖裁剪", "真限制②：覆盖裁剪非拉伸");
has(TPL_SRC, "以布局格为准居中裁剪", "真限制③：居中裁剪");
has(TPL_SRC, "纯本地零上传", "真限制④：纯本地零上传");
has(TPL_SRC, "/tools/img-stitch", "互链：图片拼接/长图拼接");
has(TPL_SRC, "/tools/nine-grid", "互链：九宫格切图");
has(TPL_SRC, "拼图一条龙", "互链：拼图一条龙品牌");
has(TPL_SRC, "pc-upload", "模板含上传区 pc-upload");
has(TPL_SRC, "pc-layouts", "模板含布局模板区 pc-layouts");
has(TPL_SRC, "pc-slots", "模板含槽位区 pc-slots");
has(TPL_SRC, "pc-preview", "模板含预览 canvas pc-preview");
has(TPL_SRC, "pc-download", "模板含下载按钮 pc-download");
notHas(TPL_SRC, "fonts.googleapis", "模板零 CDN");
has(STITCH_TPL, "/tools/photo-collage", "双向互链：img_stitch 模板回链照片拼图合成器");
has(NINE_TPL, "/tools/photo-collage", "双向互链：nine_grid 模板回链照片拼图合成器");
notHas(JS_SRC, "fetch(", "零网络：JS 无 fetch 调用");
notHas(JS_SRC, "XMLHttpRequest", "零网络：JS 无 XHR");
notHas(JS_SRC, "http://", "零网络：JS 无 http 外链");
notHas(JS_SRC, "https://", "零网络：JS 无 https 外链");

console.log("PASS " + pass + " / FAIL " + fail);
if (fail > 0) process.exit(1);
