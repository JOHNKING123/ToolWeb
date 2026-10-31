/* SVG 波形／斑点背景生成器纯逻辑单元测试（零依赖）：node tests/svg_background_generator.test.js
 * 覆盖：
 * 1. 种子随机（同 seed 一致、异 seed 不同、非整数失败）
 * 2. 颜色归一化（带/不带 #、大写归一化、3 位缩写/非法字符/长度不对失败、opacity 越界失败）
 * 3. 波形向量（逐字节一致、M 起笔 Z 闭合、恰 120 采样点、amplitude=0 退化直线、频率加倍波峰加倍、非法参数失败）
 * 4. 斑点向量（同 seed 一致、异 seed 不同、闭合、smoothness=0 为正多边形、越界/非整数 seed 失败）
 * 5. 组装与导出（xmlns 与 viewBox、层数 1/4 合法 0/5 失败、CSS 片段解码还原逐字节一致、两模式文件名、尺寸越界失败）
 * 6. 注册与静态检查（categories.go 注册完整、总数 206→207→245（历史遗留陈旧断言同步）、真限制文案可见、互链仅 CSS 渐变与 SVG 压缩、零 fetch/XHR）
 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/svg_background_generator.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function throwsWithField(fn, field, name) {
  try { fn(); ok(false, name + "（应抛错未抛）"); }
  catch (e) { ok(e.field === field, name + "（期望 field=" + field + "，实得 " + (e && e.field) + "：" + (e && e.message) + "）"); }
}
function throwsAny(fn, name) {
  try { fn(); ok(false, name + "（应抛错未抛）"); }
  catch (e) { ok(true, name); }
}

/* 解析路径中的坐标点：返回 [{cmd, x, y}]，C 段只取终点（顶点） */
function parsePoints(d) {
  var toks = d.split(/\s+/);
  var pts = [];
  for (var i = 0; i < toks.length; i++) {
    if (toks[i] === "M" || toks[i] === "L") {
      var p = toks[i + 1].split(",");
      pts.push({ cmd: toks[i], x: parseFloat(p[0]), y: parseFloat(p[1]) });
      i += 1;
    } else if (toks[i] === "C") {
      var e = toks[i + 3].split(",");
      pts.push({ cmd: "C", x: parseFloat(e[0]), y: parseFloat(e[1]) });
      i += 3;
    }
  }
  return pts;
}
function countPeaks(ys) {
  var n = 0;
  for (var i = 1; i < ys.length - 1; i++) {
    if (ys[i] > ys[i - 1] && ys[i] > ys[i + 1]) n++;
  }
  return n;
}

function main() {
  /* ---------- 1. 种子随机 ---------- */
  var r1 = M.seededRandom(42), r2 = M.seededRandom(42), r3 = M.seededRandom(43);
  var s1 = [r1(), r1(), r1()], s2 = [r2(), r2(), r2()], s3 = [r3(), r3(), r3()];
  eq(JSON.stringify(s1), JSON.stringify(s2), "同 seed 随机序列逐值一致");
  ok(JSON.stringify(s1) !== JSON.stringify(s3), "异 seed 随机序列不同");
  ok(s1.every(function (v) { return v >= 0 && v < 1; }), "随机值均在 [0,1) 内");
  throwsWithField(function () { M.seededRandom(1.5); }, "seed", "小数 seed 失败");
  throwsWithField(function () { M.seededRandom(NaN); }, "seed", "NaN seed 失败");
  throwsWithField(function () { M.seededRandom("42"); }, "seed", "字符串 seed 失败");

  /* ---------- 2. 颜色归一化与透明度 ---------- */
  eq(M.normalizeHex("#4F46E5"), "#4f46e5", "大写带 # 归一化为小写");
  eq(M.normalizeHex("4f46e5"), "#4f46e5", "不带 # 归一化补 #");
  eq(M.normalizeHex("ABCDEF"), "#abcdef", "全大写不带 # 归一化");
  throwsAny(function () { M.normalizeHex("#abc"); }, "3 位缩写失败");
  throwsAny(function () { M.normalizeHex("#gggggg"); }, "非 HEX 字符失败");
  throwsAny(function () { M.normalizeHex("#12345"); }, "长度 5 位失败");
  throwsAny(function () { M.normalizeHex("#1234567"); }, "长度 7 位失败");
  throwsAny(function () { M.normalizeHex(""); }, "空颜色失败");

  /* ---------- 3. 波形向量 ---------- */
  var wopts = { amplitude: 50, frequency: 1, phase: 0, baseline: 200 };
  var w1 = M.waveLayerPath(800, 400, wopts);
  var w2 = M.waveLayerPath(800, 400, wopts);
  eq(w1.d, w2.d, "同参数波形路径逐字节一致");
  ok(w1.d.indexOf("M ") === 0, "波形路径以 M 起笔");
  ok(/Z$/.test(w1.d), "波形路径含 Z 闭合");
  var wpts = parsePoints(w1.d);
  eq(wpts.length, 122, "波形路径坐标点总数 = 120 采样 + 2 闭合");
  eq(wpts.length - 2, 120, "波形采样点数恰为 120");
  eq(wpts[0].x, 0, "波形起笔 x=0");
  eq(wpts[0].y, 200, "phase=0 时起笔 y=baseline");
  eq(wpts[121].x, 0, "闭合回左边缘 x=0");
  eq(wpts[121].y, 400, "闭合到底边 y=height");
  var flat = M.waveLayerPath(800, 400, { amplitude: 0, frequency: 2, phase: 0.7, baseline: 150 });
  var fpts = parsePoints(flat.d).slice(0, 120);
  ok(fpts.every(function (p) { return p.y === 150; }), "amplitude=0 时波形退化为水平直线（y 全等于 baseline）");
  var ys1 = parsePoints(M.waveLayerPath(800, 400, { amplitude: 50, frequency: 1, phase: 0, baseline: 200 }).d).slice(0, 120).map(function (p) { return p.y; });
  var ys2 = parsePoints(M.waveLayerPath(800, 400, { amplitude: 50, frequency: 2, phase: 0, baseline: 200 }).d).slice(0, 120).map(function (p) { return p.y; });
  eq(countPeaks(ys1), 1, "frequency=1 时波峰数为 1");
  eq(countPeaks(ys2), 2, "frequency 加倍后波峰数加倍为 2");
  throwsWithField(function () { M.waveLayerPath(800, 400, { amplitude: -1, frequency: 1, phase: 0, baseline: 200 }); }, "amplitude", "负振幅失败");
  throwsWithField(function () { M.waveLayerPath(800, 400, { amplitude: 50, frequency: 0.4, phase: 0, baseline: 200 }); }, "frequency", "frequency<0.5 失败");
  throwsWithField(function () { M.waveLayerPath(800, 400, { amplitude: 50, frequency: 1, phase: 0, baseline: 401 }); }, "baseline", "baseline 越界失败");
  throwsWithField(function () { M.waveLayerPath(800, 400, { amplitude: 201, frequency: 1, phase: 0, baseline: 200 }); }, "amplitude", "amplitude>height/2 失败");
  throwsWithField(function () { M.waveLayerPath(800, 400, { amplitude: 50, frequency: 1, phase: 0, baseline: -1 }); }, "baseline", "baseline 为负失败");

  /* ---------- 4. 斑点向量 ---------- */
  var bopts = { cx: 400, cy: 300, radius: 150, points: 10, smoothness: 0.6, seed: 7 };
  var b1 = M.blobPath(bopts), b2 = M.blobPath(bopts);
  eq(b1.d, b2.d, "同 seed 斑点路径逐字节一致");
  ok(M.blobPath({ cx: 400, cy: 300, radius: 150, points: 10, smoothness: 0.6, seed: 8 }).d !== b1.d, "异 seed 斑点路径不同");
  ok(/Z$/.test(b1.d), "斑点路径含 Z 闭合");
  var bpts = parsePoints(b1.d);
  eq(bpts.length, 11, "斑点路径顶点数 = points + 起点（M 与首个 C 终点闭合对应）");
  var poly = M.blobPath({ cx: 400, cy: 300, radius: 150, points: 8, smoothness: 0, seed: 99 });
  var ppts = parsePoints(poly.d);
  var radii = ppts.map(function (p) { return Math.sqrt((p.x - 400) * (p.x - 400) + (p.y - 300) * (p.y - 300)); });
  ok(radii.every(function (r) { return Math.abs(r - 150) < 0.01; }), "smoothness=0 时所有顶点半径等于 radius（正多边形）");
  throwsWithField(function () { M.blobPath({ cx: 400, cy: 300, radius: 150, points: 5, smoothness: 0.5, seed: 1 }); }, "points", "points<6 失败");
  throwsWithField(function () { M.blobPath({ cx: 400, cy: 300, radius: 150, points: 21, smoothness: 0.5, seed: 1 }); }, "points", "points>20 失败");
  throwsWithField(function () { M.blobPath({ cx: 400, cy: 300, radius: 150, points: 10.5, smoothness: 0.5, seed: 1 }); }, "points", "points 非整数失败");
  throwsWithField(function () { M.blobPath({ cx: 400, cy: 300, radius: 150, points: 10, smoothness: 1.2, seed: 1 }); }, "smoothness", "smoothness>1 失败");
  throwsWithField(function () { M.blobPath({ cx: 400, cy: 300, radius: 150, points: 10, smoothness: 0.5, seed: 2.5 }); }, "seed", "斑点 seed 非整数失败");
  throwsWithField(function () { M.blobPath({ cx: 400, cy: 300, radius: 0, points: 10, smoothness: 0.5, seed: 1 }); }, "radius", "radius<=0 失败");

  /* ---------- 5. 组装与导出 ---------- */
  var svg = M.buildSvg({
    type: "wave", width: 800, height: 400, background: "#0F172A",
    layers: [
      { color: "4F46E5", opacity: 0.9, amplitude: 60, frequency: 1, phase: 0, baseline: 250 },
      { color: "#06b6d4", opacity: 0.7, amplitude: 40, frequency: 2, phase: 1.2, baseline: 280 }
    ]
  });
  ok(svg.indexOf('xmlns="http://www.w3.org/2000/svg"') >= 0, "buildSvg 输出含 xmlns");
  ok(svg.indexOf('viewBox="0 0 800 400"') >= 0, "buildSvg 输出正确 viewBox");
  ok(svg.indexOf('width="800"') >= 0 && svg.indexOf('height="400"') >= 0, "buildSvg 输出正确宽高属性");
  ok(svg.indexOf('fill="#4f46e5"') >= 0, "buildSvg 背景/图层颜色归一化为小写");
  ok(svg.indexOf('<rect width="100%" height="100%" fill="#0f172a"/>') >= 0, "buildSvg 含背景矩形");
  var svgTransparent = M.buildSvg({ type: "blob", width: 600, height: 600, background: "transparent", color: "#6366f1", opacity: 0.9, points: 12, smoothness: 0.6, seed: 42 });
  ok(svgTransparent.indexOf("<rect") < 0, "transparent 背景不输出背景矩形");
  ok(svgTransparent.indexOf('viewBox="0 0 600 600"') >= 0, "斑点 SVG viewBox 正确");
  var oneLayer = M.buildSvg({ type: "wave", width: 800, height: 400, background: "transparent", layers: [{ color: "#ff0000", opacity: 1, amplitude: 10, frequency: 1, phase: 0, baseline: 200 }] });
  eq((oneLayer.match(/<path/g) || []).length, 1, "wave 1 层合法（1 条 path）");
  var fourLayers = M.buildSvg({
    type: "wave", width: 800, height: 400, background: "transparent",
    layers: [1, 2, 3, 4].map(function () { return { color: "#ff0000", opacity: 1, amplitude: 10, frequency: 1, phase: 0, baseline: 200 }; })
  });
  eq((fourLayers.match(/<path/g) || []).length, 4, "wave 4 层合法（4 条 path）");
  throwsWithField(function () { M.buildSvg({ type: "wave", width: 800, height: 400, background: "transparent", layers: [] }); }, "layers", "wave 0 层失败");
  throwsWithField(function () {
    M.buildSvg({
      type: "wave", width: 800, height: 400, background: "transparent",
      layers: [1, 2, 3, 4, 5].map(function () { return { color: "#ff0000", opacity: 1, amplitude: 10, frequency: 1, phase: 0, baseline: 200 }; })
    });
  }, "layers", "wave 5 层失败");
  throwsWithField(function () {
    M.buildSvg({ type: "wave", width: 800, height: 400, background: "transparent", layers: [{ color: "#ff0000", opacity: 1.5, amplitude: 10, frequency: 1, phase: 0, baseline: 200 }] });
  }, "layers[0].opacity", "opacity>1 失败");
  throwsWithField(function () {
    M.buildSvg({ type: "wave", width: 800, height: 400, background: "transparent", layers: [{ color: "#ff0000", opacity: -0.1, amplitude: 10, frequency: 1, phase: 0, baseline: 200 }] });
  }, "layers[0].opacity", "opacity<0 失败");
  var css = M.buildCssBackground(svg);
  ok(css.indexOf('background-image: url("data:image/svg+xml,') === 0, "CSS 片段以 background-image data URI 开头");
  var encoded = css.replace(/^background-image: url\("data:image\/svg\+xml,/, "").replace(/"\);$/, "");
  eq(decodeURIComponent(encoded), svg, "CSS 片段 decodeURIComponent 还原后与原 SVG 逐字节一致");
  eq(M.suggestExportName("wave"), "wave-background.svg", "wave 导出文件名为 wave-background.svg");
  eq(M.suggestExportName("blob"), "blob-background.svg", "blob 导出文件名为 blob-background.svg");
  throwsWithField(function () { M.validateSize(199, 400); }, "width", "宽度 199 越界失败");
  throwsWithField(function () { M.validateSize(4001, 400); }, "width", "宽度 4001 越界失败");
  throwsWithField(function () { M.validateSize(800.5, 400); }, "width", "宽度非整数失败");
  throwsWithField(function () { M.validateSize(800, 199); }, "height", "高度 199 越界失败");
  ok(M.validateSize(200, 4000) === true, "边界尺寸 200×4000 合法");
  throwsWithField(function () { M.buildSvg({ type: "wave", width: 100, height: 400, background: "transparent", layers: [{ color: "#ff0000", opacity: 1, amplitude: 10, frequency: 1, phase: 0, baseline: 200 }] }); }, "width", "buildSvg 尺寸越界失败");

  /* ---------- 6. 注册与静态检查 ---------- */
  var repoRoot = path.join(__dirname, "..");
  var cats = fs.readFileSync(path.join(repoRoot, "tools", "categories.go"), "utf8");
  ok(cats.indexOf('"svg_background_generator"') >= 0, "categories.go 注册 ID svg_background_generator");
  ok(cats.indexOf('"/tools/svg-background-generator"') >= 0, "categories.go 注册 Path /tools/svg-background-generator");
  var idIdx = cats.indexOf('"svg_background_generator"');
  var entry = cats.slice(idIdx, idIdx + 800);
  ok(entry.indexOf('Category:    "图片处理"') >= 0, "注册 Category 为图片处理");
  ok(entry.indexOf("New:         true") >= 0, "注册 New: true");
  var pathMatches = cats.match(/"\/tools\/[^"]+"/g) || [];
  eq(new Set(pathMatches).size, 245, "注册 Path 总数→245（历史遗留陈旧断言同步）");
  var tpl = fs.readFileSync(path.join(repoRoot, "templates", "svg_background_generator.html"), "utf8");
  ["只做装饰背景几何", "不做动画视频导出", "种子可复现", "PNG 放大不如 SVG 清晰", "不收集、不上传"].forEach(function (phrase) {
    ok(tpl.indexOf(phrase) >= 0, "模板含真限制文案「" + phrase + "」");
  });
  ok(tpl.indexOf("/tools/css-gradient-generator") >= 0, "模板互链 CSS 渐变生成器");
  ok(tpl.indexOf("/tools/svg-compressor") >= 0, "模板互链 SVG 压缩优化器");
  var toolLinks = (tpl.match(/href="\/tools\/[a-z0-9-]+"/g) || [])
    .map(function (h) { return h.replace('href="/tools/', "").replace('"', ""); })
    .filter(function (p) { return p !== "static"; });
  ok(toolLinks.every(function (p) { return p === "css-gradient-generator" || p === "svg-compressor"; }),
    "模板互链仅 CSS 渐变生成器与 SVG 压缩优化器（无硬凑未交付工具）");
  var js = fs.readFileSync(path.join(repoRoot, "static", "js", "svg_background_generator.js"), "utf8");
  ok(js.indexOf("fetch(") < 0, "JS 零 fetch");
  ok(js.indexOf("XMLHttpRequest") < 0, "JS 零 XHR");
  ok(js.indexOf("src=\"http") < 0 && tpl.indexOf("src=\"http") < 0, "模板与 JS 零外部脚本（零 CDN）");
  ok(tpl.indexOf("svg_background_generator.js") >= 0, "模板引入本工具 JS");
  ok(tpl.indexOf("svg-background-generator") >= 0, "模板含 canonical 路径 svg-background-generator");

  console.log("PASS " + pass + " / FAIL " + fail + "（共 " + (pass + fail) + " 断言）");
  if (fail > 0) process.exit(1);
}

main();
