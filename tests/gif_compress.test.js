/* GIF 压缩优化器纯逻辑单元测试（零依赖）：node tests/gif_compress.test.js
 * 覆盖：解析向量（示例 GIF／手工 GIF：disposal 2／透明／NETSCAPE 循环）、
 * 失败向量（err.field=file）、处理向量（抽帧／缩放／量化／LZW 往返／formatBytes）、
 * 编码向量（魔数／往返帧数）、64 组合不变式＋体积单调性、注册与零网络静态检查。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/gif_compress.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function deepEq(a, b, name) { eq(JSON.stringify(a), JSON.stringify(b), name); }
function throwsField(fn, field, name) {
  try { fn(); ok(false, name + "（未抛错）"); }
  catch (e) { ok(e instanceof Error && e.field === field, name + "（field=" + (e && e.field) + "）"); }
}
function px(frame, x, y) {
  var o = (y * frame.width + x) * 4;
  return [frame.pixels[o], frame.pixels[o + 1], frame.pixels[o + 2], frame.pixels[o + 3]];
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "gif_compress.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "gif_compress.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* 手工 GIF：2×2 画布，GCT＝红/绿/蓝/白；frame1 全红(disposal 1)；
 * frame2 (1,0) 处 1×1 蓝色(disposal 2)；frame3 透明索引 3、白透明，
 * 下行绿(disposal 1＋透明标志)。验证 NETSCAPE 循环、disposal 2 背景恢复、
 * 子图定位、透明合成。LZW 数据用被测 lzwEncode 生成。 */
function buildTestGif() {
  var bytes = [];
  function ascii(s) { for (var i = 0; i < s.length; i++) bytes.push(s.charCodeAt(i)); }
  function u16(v) { bytes.push(v & 0xff); bytes.push((v >> 8) & 0xff); }
  function subBlocks(data) {
    for (var o = 0; o < data.length; o += 255) {
      var c = Math.min(255, data.length - o);
      bytes.push(c);
      for (var j = 0; j < c; j++) bytes.push(data[o + j]);
    }
    bytes.push(0);
  }
  ascii("GIF89a");
  u16(2); u16(2);
  bytes.push(0xF1); bytes.push(0); bytes.push(0); /* GCT 4 色，背景索引 0 */
  [255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255].forEach(function (b) { bytes.push(b); });
  bytes.push(0x21, 0xFF, 11); ascii("NETSCAPE2.0");
  bytes.push(3, 1); u16(3); bytes.push(0); /* 循环 3 次 */
  bytes.push(0x21, 0xF9, 4, 0x04); u16(10); bytes.push(0, 0); /* GCE disposal 1 */
  bytes.push(0x2C); u16(0); u16(0); u16(2); u16(2); bytes.push(0);
  bytes.push(2); subBlocks(M.lzwEncode(2, [0, 0, 0, 0]));
  bytes.push(0x21, 0xF9, 4, 0x08); u16(10); bytes.push(0, 0); /* GCE disposal 2 */
  bytes.push(0x2C); u16(1); u16(0); u16(1); u16(1); bytes.push(0);
  bytes.push(2); subBlocks(M.lzwEncode(2, [2]));
  bytes.push(0x21, 0xF9, 4, 0x05); u16(10); bytes.push(3, 0); /* GCE disposal 1＋透明 idx3 */
  bytes.push(0x2C); u16(0); u16(0); u16(2); u16(2); bytes.push(0);
  bytes.push(2); subBlocks(M.lzwEncode(2, [3, 3, 1, 1]));
  bytes.push(0x3B);
  return new Uint8Array(bytes);
}

/* ---------- 1. 解析向量 ---------- */
var exBytes = M.generateExampleGif();
var ex = M.parseGif(exBytes);
eq(ex.frames.length, 4, "示例 GIF 解析得 4 帧");
eq(ex.width, 32, "示例 GIF 宽 32");
eq(ex.height, 32, "示例 GIF 高 32");
eq(ex.loopCount, 0, "示例 GIF loopCount=0（无限循环）");
ok(ex.frames.every(function (f) { return f.delayMs === 100; }), "示例 GIF 每帧 delayMs=100");
ok(ex.frames.every(function (f) { return f.pixels.length === 32 * 32 * 4; }), "示例 GIF 每帧像素缓冲 32×32×4");
deepEq(Array.from(M.generateExampleGif()), Array.from(exBytes), "generateExampleGif 确定性：两次字节一致");
eq(String.fromCharCode(exBytes[0], exBytes[1], exBytes[2], exBytes[3], exBytes[4], exBytes[5]),
  "GIF89a", "示例 GIF 魔数 GIF89a");

var tg = M.parseGif(buildTestGif());
eq(tg.frames.length, 3, "手工 GIF 解析得 3 帧");
eq(tg.loopCount, 3, "手工 GIF NETSCAPE 循环次数=3");
deepEq(px(tg.frames[0], 0, 0), [255, 0, 0, 255], "手工 GIF frame1 全红");
deepEq(px(tg.frames[0], 1, 1), [255, 0, 0, 255], "手工 GIF frame1 右下红");
deepEq(px(tg.frames[1], 1, 0), [0, 0, 255, 255], "手工 GIF frame2 (1,0) 蓝色子图");
deepEq(px(tg.frames[1], 0, 0), [255, 0, 0, 255], "手工 GIF frame2 其余保持红");
deepEq(px(tg.frames[2], 0, 0), [255, 0, 0, 255], "手工 GIF frame3 透明处透出红");
deepEq(px(tg.frames[2], 0, 1), [0, 255, 0, 255], "手工 GIF frame3 下行绿");

/* ---------- 2. 失败向量 ---------- */
throwsField(function () { M.parseGif(new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A])); }, "file", "PNG 魔数抛错 field=file");
throwsField(function () { M.parseGif(new Uint8Array([0x47, 0x49, 0x46])); }, "file", "截断文件抛错 field=file");
throwsField(function () { M.parseGif(new Uint8Array(0)); }, "file", "空字节抛错 field=file");
throwsField(function () { M.parseGif(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x62])); }, "file", "GIF89b 魔数抛错 field=file");
throwsField(function () { M.dropFrames(ex.frames, 0); }, "keepEvery", "dropFrames keepEvery=0 抛错");
throwsField(function () { M.dropFrames(ex.frames, 1.5); }, "keepEvery", "dropFrames keepEvery 非整数抛错");
throwsField(function () { M.resizeFrames(ex.frames, 0); }, "scale", "resizeFrames scale=0 抛错");
throwsField(function () { M.resizeFrames(ex.frames, -1); }, "scale", "resizeFrames scale 为负抛错");
throwsField(function () { M.quantizeFrames(ex.frames, 0); }, "maxColors", "quantizeFrames maxColors=0 抛错");
throwsField(function () { M.quantizeFrames(ex.frames, 257); }, "maxColors", "quantizeFrames maxColors=257 抛错");
throwsField(function () { M.encodeGif([], {}); }, "frames", "encodeGif 空帧抛错");

/* ---------- 3. 处理向量 ---------- */
var dropped2 = M.dropFrames(ex.frames, 2);
eq(dropped2.length, 2, "dropFrames(2) 得 2 帧");
var totalOrig = ex.frames.reduce(function (s, f) { return s + f.delayMs; }, 0);
var totalKept = dropped2.reduce(function (s, f) { return s + f.delayMs; }, 0);
eq(totalKept, totalOrig, "dropFrames(2) 总时长不变（400ms）");
eq(ex.frames[0].delayMs, 100, "dropFrames 不修改原数组帧 delay");
eq(M.dropFrames(ex.frames, 1).length, 4, "dropFrames(1) 保留全部 4 帧");
eq(M.dropFrames(ex.frames, 3).length, 2, "dropFrames(3) 得 ceil(4/3)=2 帧");
eq(M.dropFrames(ex.frames, 4).length, 1, "dropFrames(4) 得 1 帧");

var resized = M.resizeFrames(ex.frames, 0.5);
eq(resized[0].width, 16, "resizeFrames(0.5) 宽 16");
eq(resized[0].height, 16, "resizeFrames(0.5) 高 16");
eq(resized[0].pixels.length, 1024, "resizeFrames(0.5) 像素缓冲 1024 字节");
eq(resized.length, 4, "resizeFrames 保持帧数");
deepEq(px(resized[0], 0, 0), px(ex.frames[0], 0, 0), "resizeFrames 最近邻：左上像素一致");
var resizedTiny = M.resizeFrames(ex.frames, 0.01);
eq(resizedTiny[0].width, 1, "resizeFrames 极小 scale 钳制到 1px");

var q32 = M.quantizeFrames(resized, 32);
ok(q32.frames[0].palette.length <= 32, "quantizeFrames(32) palette≤32（实得 " + q32.frames[0].palette.length + "）");
eq(q32.frames[0].indices.length, 256, "quantizeFrames indices 长度=16×16");
eq(q32.width, 16, "quantizeFrames 宽 16");
ok(q32.frames.every(function (f) { return f.palette.length <= 32; }), "quantizeFrames 每帧 palette≤32");
var q256 = M.quantizeFrames(ex.frames, 256);
ok(q256.frames[0].palette.length <= 256, "quantizeFrames(256) palette≤256");

/* 透明量化：透明像素固定占 palette[0] */
var transFrame = {
  pixels: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 255, 255, 0, 255, 0, 255]),
  width: 2, height: 2, delayMs: 100, left: 0, top: 0, disposal: 0
};
var qt = M.quantizeFrames([transFrame], 32);
eq(qt.frames[0].hasTransparent, true, "透明帧 hasTransparent=true");
eq(qt.frames[0].indices[1], 0, "透明像素映射到 palette[0]");
ok(qt.frames[0].palette.length <= 32, "透明量化 palette≤32");
var encT = M.encodeGif(qt.frames, { width: 2, height: 2, loopCount: 0 });
var backT = M.parseGif(encT);
eq(backT.frames.length, 1, "透明帧编码往返帧数一致");
deepEq(px(backT.frames[0], 1, 0), [0, 0, 0, 0], "透明像素往返后仍透明");
deepEq(px(backT.frames[0], 0, 0), [255, 0, 0, 255], "不透明像素往返后颜色一致");

/* LZW 往返 */
function lzwRoundtrip(minCodeSize, indices, name) {
  var enc = M.lzwEncode(minCodeSize, indices);
  var dec = M.lzwDecode(minCodeSize, enc);
  deepEq(dec, Array.prototype.slice.call(indices), name);
}
lzwRoundtrip(2, [0, 0, 0, 0], "LZW 往返：全同短序列");
lzwRoundtrip(2, [0, 1, 2, 3, 0, 1, 2, 3, 3, 2, 1, 0], "LZW 往返：交替序列");
lzwRoundtrip(1, [0, 1, 0, 1, 1, 0], "LZW 往返：minCodeSize=1");
(function () { /* 长随机序列：触发码长增长到 12 位与 clear 重置 */
  var seed = 123456789;
  function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed; }
  var seq = [];
  for (var i = 0; i < 6000; i++) seq.push(rnd() % 200);
  lzwRoundtrip(8, seq, "LZW 往返：6000 长随机序列（码长增长＋clear）");
})();
(function () { /* 单色长游程 */
  var seq = [];
  for (var i = 0; i < 3000; i++) seq.push(7);
  lzwRoundtrip(4, seq, "LZW 往返：3000 单色游程");
})();

/* formatBytes */
eq(M.formatBytes(1536), "1.5 KB", "formatBytes(1536)=1.5 KB");
eq(M.formatBytes(500), "500 B", "formatBytes(500)=500 B");
eq(M.formatBytes(0), "0 B", "formatBytes(0)=0 B");
eq(M.formatBytes(1023), "1023 B", "formatBytes(1023)=1023 B");
eq(M.formatBytes(1024), "1.0 KB", "formatBytes(1024)=1.0 KB");
eq(M.formatBytes(2097152), "2.0 MB", "formatBytes(2097152)=2.0 MB");

/* ---------- 4. 编码向量 ---------- */
var qfull = M.quantizeFrames(M.resizeFrames(M.dropFrames(ex.frames, 2), 0.5), 32);
var encFull = M.encodeGif(qfull.frames, { width: qfull.width, height: qfull.height, loopCount: ex.loopCount });
eq(String.fromCharCode(encFull[0], encFull[1], encFull[2], encFull[3], encFull[4], encFull[5]),
  "GIF89a", "encodeGif 魔数 GIF89a");
var backFull = M.parseGif(encFull);
eq(backFull.frames.length, qfull.frames.length, "parseGif(encodeGif(x)) 往返帧数一致");
eq(backFull.width, 16, "往返宽 16");
eq(backFull.height, 16, "往返高 16");
eq(backFull.loopCount, 0, "往返 loopCount=0");
ok(backFull.frames.every(function (f) { return f.delayMs === 200; }), "往返每帧 delayMs=200（抽帧累加后）");

/* ---------- 5. 不变式：64 组合可解析＋帧数正确；体积单调性 ---------- */
var scales = [1, 0.75, 0.5, 0.25], keeps = [1, 2, 3, 4], colorOpts = [256, 128, 64, 32];
var comboCount = 0;
var sizeTable = {};
scales.forEach(function (sc, si) {
  keeps.forEach(function (kp, ki) {
    var key = si + "_" + ki;
    sizeTable[key] = [];
    colorOpts.forEach(function (mc) {
      var p = M.parseGif(M.generateExampleGif());
      var d = M.dropFrames(p.frames, kp);
      var r = M.resizeFrames(d, sc);
      var q = M.quantizeFrames(r, mc);
      var enc = M.encodeGif(q.frames, { width: q.width, height: q.height, loopCount: p.loopCount });
      var back = M.parseGif(enc);
      ok(back.frames.length === d.length,
        "组合 scale=" + sc + " keep=" + kp + " colors=" + mc + " 帧数=" + d.length);
      sizeTable[key].push(enc.length);
      comboCount++;
    });
  });
});
eq(comboCount, 64, "64 种选项组合全覆盖");
Object.keys(sizeTable).forEach(function (key) {
  var s = sizeTable[key];
  for (var i = 1; i < s.length; i++) {
    ok(s[i] <= s[i - 1], "体积单调不增 [" + key + "] colors " +
      colorOpts[i - 1] + "→" + colorOpts[i] + "（" + s[i - 1] + "→" + s[i] + "）");
  }
});

/* ---------- 6. 注册与静态检查 ---------- */
ok(GO_SRC.indexOf('"gif_compress"') >= 0, "categories.go 注册 ID");
ok(GO_SRC.indexOf('"/tools/gif-compress"') >= 0, "categories.go 注册 Path");
var idx = GO_SRC.indexOf('"gif_compress"');
ok(GO_SRC.slice(idx, idx + 1400).indexOf('Category:    "图片处理"') >= 0, "注册 Category 为图片处理");
ok(GO_SRC.slice(idx, idx + 1400).indexOf("New:         true") >= 0, "注册 New 为 true");
ok(GO_SRC.slice(idx, idx + 1400).indexOf('Icon:        "gif"') >= 0, "注册 Icon 为 gif");
var pathCount = 0, m, re2 = /"\/tools\/[^"]+"/g, seen = {};
while ((m = re2.exec(GO_SRC)) !== null) { if (!seen[m[0]]) { seen[m[0]] = true; pathCount++; } }
eq(pathCount, 241, "注册 Path 总数 240→241");
ok(JS_SRC.indexOf("fetch(") < 0 && JS_SRC.indexOf("XMLHttpRequest") < 0, "JS 零 fetch/XHR");
ok(!/<script[^>]+src="https?:\/\//.test(TPL_SRC), "模板无外部脚本引用（零 CDN）");
ok(!/rel="stylesheet"[^>]+href="https?:\/\//.test(TPL_SRC), "模板无外部样式引用（零 CDN）");
ok(TPL_SRC.indexOf('{{define "gif_compress"}}') >= 0, "模板 define 名与路由 gif-compress 对应");
ok(TPL_SRC.indexOf('src="/tools/static/js/gif_compress.js') >= 0, "模板引用自有 JS");
ok(TPL_SRC.indexOf("大文件内存占用高") >= 0, "模板含真限制：大文件内存占用高");
ok(TPL_SRC.indexOf("建议先拆小") >= 0, "模板含真限制：建议先拆小");
ok(TPL_SRC.indexOf("256 色上限") >= 0, "模板含真限制：256 色上限");
ok(TPL_SRC.indexOf("色带") >= 0, "模板含真限制：色带");
ok(TPL_SRC.indexOf("抽帧") >= 0 && TPL_SRC.indexOf("卡顿") >= 0, "模板含真限制：抽帧卡顿属预期");
ok(TPL_SRC.indexOf("不收集、不上传") >= 0, "模板含真限制：不收集、不上传");
ok(TPL_SRC.indexOf("/tools/img-compress") >= 0, "互链图片压缩");
ok(TPL_SRC.indexOf("/tools/img-convert") >= 0, "互链图片格式转换");
var hrefs = {}, hm, hre = /href="\/tools\/([a-z0-9-]+)"/g, badLinks = [];
while ((hm = hre.exec(TPL_SRC)) !== null) {
  if (hm[1] === "static") continue;
  if (hm[1] !== "img-compress" && hm[1] !== "img-convert") badLinks.push(hm[1]);
  hrefs[hm[1]] = true;
}
eq(badLinks.length, 0, "互链仅含图片压缩与图片格式转换" + (badLinks.length ? "（多余：" + badLinks.join(",") + "）" : ""));
ok(TPL_SRC.indexOf("https://www.johnkingzcq123.xyz/tools/gif-compress") >= 0, "模板含 canonical/OG 链接");
ok(TPL_SRC.indexOf("载入示例") >= 0, "模板含载入示例入口");
ok(TPL_SRC.indexOf("gif-compressed.gif") >= 0, "模板含下载文件名 gif-compressed.gif");

console.log("gif_compress: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
