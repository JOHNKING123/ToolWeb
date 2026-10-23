/* SVG 转字体图标生成器纯逻辑单元测试（node tests/svg_to_font.test.js）
 * 覆盖：path 全命令解析（含 A 圆弧转贝塞尔）、基本形状转换、transform、
 * Y 翻转＋归一化、字形名清洗去重、码点分配、TTF/OTF 组装 round-trip、
 * CSS 生成、非法输入不中断、脚本零 fetch/XHR。
 * vendor opentype.js@2.0.0（static/vendor/opentype.min.js）经 vm 加载，
 * 即浏览器实际加载的同一文件。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var SF = require("../static/js/svg_to_font.js");
var SRC = fs.readFileSync(path.join(__dirname, "..", "static", "js", "svg_to_font.js"), "utf8");

function loadVendorOpentype() {
    var code = fs.readFileSync(path.join(__dirname, "..", "static", "vendor", "opentype.min.js"), "utf8");
    vm.runInThisContext(code, { filename: "opentype.min.js" });
    return globalThis.opentype;
}
var ot = loadVendorOpentype();

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function approx(a, b, tol, name) { ok(Math.abs(a - b) <= tol, name + "（期望≈" + b + "，实得 " + a + "）"); }
function contains(hay, needle, name) { ok(String(hay).indexOf(needle) !== -1, name + "（期望包含 " + JSON.stringify(needle) + "）"); }

var IDENT = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/* ---------- 1. path 基本命令 ---------- */
(function () {
    var r = SF.parsePathData("M10 10 L20 20", IDENT);
    ok(r.ok, "M/L 解析成功");
    eq(r.subpaths.length, 1, "1 条子路径");
    eq(r.subpaths[0].start.x, 10, "起点 x");
    eq(r.subpaths[0].start.y, 10, "起点 y");
    eq(r.subpaths[0].segs.length, 1, "1 段");
    eq(r.subpaths[0].segs[0].t, "L", "线段类型");
    eq(r.subpaths[0].segs[0].x, 20, "终点 x");
})();
(function () {
    var r = SF.parsePathData("M0 0h10v10H0Z", IDENT);
    ok(r.ok, "H/V/Z 解析成功");
    eq(r.subpaths[0].segs.length, 3, "h/v/H 共 3 段");
    eq(r.subpaths[0].closed, true, "Z 闭合");
    eq(r.subpaths[0].segs[0].x, 10, "相对 h");
    eq(r.subpaths[0].segs[1].y, 10, "相对 v");
    eq(r.subpaths[0].segs[2].x, 0, "绝对 H");
})();
(function () {
    var r = SF.parsePathData("M0 0 10 0 10 10", IDENT);
    ok(r.ok, "M 后隐式 lineto");
    eq(r.subpaths[0].segs.length, 2, "隐式 2 段直线");
    eq(r.subpaths[0].segs[1].x, 10, "第二段 x");
    eq(r.subpaths[0].segs[1].y, 10, "第二段 y");
})();
(function () {
    var r = SF.parsePathData("m5 5 l10 0", IDENT);
    ok(r.ok, "相对 m/l");
    eq(r.subpaths[0].start.x, 5, "相对 m 起点");
    eq(r.subpaths[0].segs[0].x, 15, "相对 l 终点");
})();

/* ---------- 2. 曲线命令 ---------- */
(function () {
    var r = SF.parsePathData("M0 0 C10 0 20 10 30 10", IDENT);
    ok(r.ok, "C 解析成功");
    var s = r.subpaths[0].segs[0];
    eq(s.t, "C", "三次贝塞尔");
    eq(s.c1x, 10, "c1x"); eq(s.c2y, 10, "c2y"); eq(s.x, 30, "终点");
})();
(function () {
    var r = SF.parsePathData("M0 0 C10 0 20 0 30 0 S50 0 60 0", IDENT);
    ok(r.ok, "S 解析成功");
    var s = r.subpaths[0].segs[1];
    approx(s.c1x, 40, 1e-9, "S 反射控制点 c1x=40");
    eq(s.x, 60, "S 终点");
})();
(function () {
    var r = SF.parsePathData("M0 0 Q10 10 20 0", IDENT);
    ok(r.ok, "Q 解析成功");
    var s = r.subpaths[0].segs[0];
    eq(s.t, "C", "Q 升阶为三次");
    approx(s.c1x, 20 / 3, 1e-9, "Q→C c1x");
    approx(s.c1y, 20 / 3, 1e-9, "Q→C c1y");
    approx(s.c2x, 40 / 3, 1e-9, "Q→C c2x");
    eq(s.x, 20, "Q 终点");
})();
(function () {
    var r = SF.parsePathData("M0 0 Q10 10 20 0 T40 0", IDENT);
    ok(r.ok, "T 解析成功");
    var s = r.subpaths[0].segs[1];
    approx(s.c1x, 20 + 20 / 3, 1e-9, "T 反射 c1x");
    eq(s.x, 40, "T 终点");
})();

/* ---------- 3. 圆弧 A → 三次贝塞尔 ---------- */
(function () {
    var r = SF.parsePathData("M0 0 A10 10 0 0 1 20 0", IDENT);
    ok(r.ok, "A 解析成功");
    eq(r.subpaths[0].segs.length, 2, "180° 圆弧拆成 2 段贝塞尔");
    var s0 = r.subpaths[0].segs[0], s1 = r.subpaths[0].segs[1];
    approx(s0.x, 10, 0.01, "第一段终点 x=10");
    approx(s0.y, -10, 0.01, "第一段终点 y=-10（上半圆）");
    approx(s1.x, 20, 0.01, "第二段终点 x=20");
    approx(s1.y, 0, 0.01, "第二段终点 y=0");
    ok(s0.t === "C" && s1.t === "C", "圆弧转为三次贝塞尔");
})();
(function () {
    var r = SF.parsePathData("M0 0 A10 10 0 0 0 20 0", IDENT);
    ok(r.ok, "A sweep=0 解析成功");
    approx(r.subpaths[0].segs[0].y, 10, 0.01, "sweep=0 走下半圆");
})();
(function () {
    var cz = SF.arcToCubics(5, 5, 10, 10, 0, 0, 1, 5, 5);
    eq(cz.length, 0, "起点终点重合的圆弧返回空");
})();
/* ---------- 3b. 旋转椭圆弧回归（rx≠ry 且 φ≠0）：pt/dpt 半径交叉 ---------- */
(function () {
    /* 修复前 arcToCubics(0,0, 30,10, 45, 0,1, 20,10) 末段终点为 (33.66,13.66)；
       修复后必须恰为弧终点 (20,10) */
    var segs = SF.arcToCubics(0, 0, 30, 10, 45, 0, 1, 20, 10);
    ok(segs.length > 0, "旋转椭圆弧有输出");
    var last = segs[segs.length - 1];
    approx(last.x, 20, 1e-6, "旋转椭圆弧末段终点 x=20");
    approx(last.y, 10, 1e-6, "旋转椭圆弧末段终点 y=10");
    /* 按 SVG 规范独立求中心与缩放后半径，验每段端点落在椭圆方程 (X/rx)²+(Y/ry)²=1 上 */
    var rx0 = 30, ry0 = 10, phiDeg = 45, x1 = 0, y1 = 0, x2 = 20, y2 = 10;
    var phi = phiDeg * Math.PI / 180, cp = Math.cos(phi), sp = Math.sin(phi);
    var rx = Math.abs(rx0), ry = Math.abs(ry0);
    var dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
    var x1p = cp * dx + sp * dy, y1p = -sp * dx + cp * dy;
    var lam = x1p * x1p / (rx * rx) + y1p * y1p / (ry * ry);
    if (lam > 1) { var s = Math.sqrt(lam); rx *= s; ry *= s; }
    var num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
    var den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
    var co = den === 0 ? 0 : Math.sqrt(Math.max(0, num / den));
    /* largeArc=0、sweep=1：两者不等，不取反 */
    var cxp = co * rx * y1p / ry, cyp = -co * ry * x1p / rx;
    var cx = cp * cxp - sp * cyp + (x1 + x2) / 2;
    var cy = sp * cxp + cp * cyp + (y1 + y2) / 2;
    var allOn = segs.every(function (sg) {
        var X = cp * (sg.x - cx) + sp * (sg.y - cy);
        var Y = -sp * (sg.x - cx) + cp * (sg.y - cy);
        return Math.abs(X * X / (rx * rx) + Y * Y / (ry * ry) - 1) < 1e-9;
    });
    ok(allOn, "旋转椭圆弧每段端点落在椭圆方程上");
})();

/* ---------- 4. 基本形状转换 ---------- */
function shape(el, attrs, mat) { return { el: el, attrs: attrs, mat: mat || IDENT }; }
(function () {
    var r = SF.shapeToSubpaths(shape("rect", { x: "10", y: "10", width: "80", height: "40" }));
    ok(r.ok, "rect 转换成功");
    eq(r.subpaths.length, 1, "rect 1 条子路径");
    eq(r.subpaths[0].closed, true, "rect 闭合");
    eq(r.subpaths[0].segs.length, 3, "直角 rect 3 段直线");
    eq(r.subpaths[0].start.x, 10, "rect 起点 x");
})();
(function () {
    var r = SF.shapeToSubpaths(shape("rect", { x: "0", y: "0", width: "100", height: "50", rx: "10" }));
    ok(r.ok, "圆角 rect 转换成功");
    eq(r.subpaths[0].segs.length, 8, "圆角 rect 4 直线+4 圆角");
    ok(r.subpaths[0].segs.every(function (s) { return s.t === "L" || s.t === "C"; }), "圆角由直线+三次贝塞尔构成");
})();
(function () {
    var r = SF.shapeToSubpaths(shape("circle", { cx: "50", cy: "50", r: "20" }));
    ok(r.ok, "circle 转换成功");
    eq(r.subpaths[0].segs.length, 4, "圆 4 段三次贝塞尔");
    eq(r.subpaths[0].start.x, 70, "圆起点 (cx+r, cy)");
    approx(r.subpaths[0].segs[0].c1y, 50 + 20 * 0.5522847498, 1e-9, "圆 kappa 控制点");
})();
(function () {
    var r = SF.shapeToSubpaths(shape("ellipse", { cx: "0", cy: "0", rx: "30", ry: "10" }));
    ok(r.ok, "ellipse 转换成功");
    eq(r.subpaths[0].start.x, 30, "椭圆起点 x=rx");
    approx(r.subpaths[0].segs[0].y, 10, 1e-9, "椭圆第一段终点 y=ry");
})();
(function () {
    var r = SF.shapeToSubpaths(shape("line", { x1: "0", y1: "0", x2: "100", y2: "50" }));
    ok(r.ok, "line 转换成功");
    eq(r.subpaths[0].closed, false, "line 开放");
    eq(r.subpaths[0].segs[0].x, 100, "line 终点");
})();
(function () {
    var r = SF.shapeToSubpaths(shape("polyline", { points: "0,0 10,0 10,10" }));
    ok(r.ok, "polyline 转换成功");
    eq(r.subpaths[0].segs.length, 2, "polyline 2 段");
    eq(r.subpaths[0].closed, false, "polyline 开放");
    var r2 = SF.shapeToSubpaths(shape("polygon", { points: "0 0 10 0 10 10" }));
    ok(r2.ok, "polygon 转换成功");
    eq(r2.subpaths[0].closed, true, "polygon 闭合");
})();
(function () {
    var r = SF.shapeToSubpaths(shape("rect", { x: "0", y: "0", width: "0", height: "10" }));
    ok(!r.ok, "宽高无效的 rect 报错");
})();

/* ---------- 5. transform ---------- */
(function () {
    var m = SF.parseTransform("translate(10, 20)");
    eq(m.e, 10, "translate tx"); eq(m.f, 20, "translate ty");
    var m2 = SF.parseTransform("scale(2)");
    eq(m2.a, 2, "scale sx"); eq(m2.d, 2, "scale sy");
    var m3 = SF.parseTransform("translate(5,5) scale(2)");
    var p = SF.matApply(m3, 1, 1);
    eq(p.x, 7, "translate→scale 复合 x（SVG 左为外层：先缩放后平移）");
    eq(p.y, 7, "translate→scale 复合 y");
    eq(SF.parseTransform("rotate(45)"), null, "rotate 不支持返回 null");
    eq(SF.parseTransform("matrix(1,0,0,1,0,0)"), null, "matrix 不支持返回 null");
})();
(function () {
    var r = SF.parsePathData("M0 0 L10 0", { a: 2, b: 0, c: 0, d: 3, e: 5, f: 7 });
    eq(r.subpaths[0].start.x, 5, "矩阵变换起点 x");
    eq(r.subpaths[0].segs[0].x, 25, "矩阵变换终点 x");
    eq(r.subpaths[0].segs[0].y, 7, "矩阵变换终点 y");
})();
(function () {
    var svg = '<svg viewBox="0 0 100 100"><g transform="translate(10,10)"><rect x="0" y="0" width="10" height="10"/></g></svg>';
    var r = SF.buildGlyphFromSvg("t.svg", svg);
    ok(r.ok, "g 分组 transform 解析成功");
    approx(r.subpaths[0].start.x, 10 * 10.24, 0.01, "分组 translate 生效（归一化后）");
})();

/* ---------- 6. SVG 文档解析 ---------- */
(function () {
    var r = SF.parseSvg("hello world");
    ok(!r.ok, "非 SVG 报错");
    contains(r.error, "<svg>", "错误信息提到 <svg>");
})();
(function () {
    var r = SF.parseSvg('<svg width="24" height="24"><path d="M0 0L10 0"/></svg>');
    ok(r.ok, "无 viewBox 但有 width/height 时用其作画布");
    eq(r.viewBox.w, 24, "画布宽取 width");
})();
(function () {
    var r = SF.parseSvg("<svg></svg>");
    ok(!r.ok, "无 viewBox 且无宽高时报错");
    contains(r.error, "画布尺寸", "错误信息提到画布尺寸");
})();
(function () {
    var r = SF.parseSvg('<svg viewBox="0 0 24 24"><defs><linearGradient id="g"></linearGradient></defs><path d="M0 0L10 0"/></svg>');
    ok(r.ok, "含渐变定义的 SVG 仍解析成功");
    ok(r.warnings.length > 0, "非轮廓元素给出忽略提示");
    eq(r.shapes.length, 1, "只提取 path");
})();

/* ---------- 7. 归一化（Y 翻转＋缩放到 1024） ---------- */
(function () {
    var sp = [{ start: { x: 12, y: 2 }, segs: [{ t: "L", x: 12, y: 22 }], closed: false }];
    var n = SF.normalizeSubpaths(sp, { x: 0, y: 0, w: 24, h: 24 });
    var s = 1024 / 24;
    approx(n.subpaths[0].start.x, 12 * s, 1e-9, "归一化 x");
    approx(n.subpaths[0].start.y, (24 - 2) * s, 1e-9, "Y 翻转：顶部点映射到高 y");
    approx(n.subpaths[0].segs[0].y, (24 - 22) * s, 1e-9, "Y 翻转：底部点映射到低 y");
    ok(n.subpaths[0].start.y > n.subpaths[0].segs[0].y, "翻转后上大下小");
    eq(n.advanceWidth, 1024, "正方形 viewBox advance=1024");
})();
(function () {
    var sp = [{ start: { x: 0, y: 0 }, segs: [], closed: false }];
    var n = SF.normalizeSubpaths(sp, { x: 0, y: 0, w: 48, h: 24 });
    eq(n.advanceWidth, 1024, "宽 viewBox：按 max 边缩放，advance=1024");
    approx(n.scale, 1024 / 48, 1e-12, "缩放系数取 max 边");
})();

/* ---------- 8. 字形名清洗去重 ---------- */
(function () {
    var used = {};
    eq(SF.sanitizeGlyphName("my icon!.svg", used), "my_icon", "非法字符转下划线");
    eq(SF.sanitizeGlyphName("123abc.svg", used), "icon_123abc", "数字开头加前缀");
    eq(SF.sanitizeGlyphName("图标.svg", used), "icon", "全非法字符回退 icon");
    eq(SF.sanitizeGlyphName("star.svg", used), "star", "普通文件名");
    eq(SF.sanitizeGlyphName("star.svg", used), "star_2", "重名自动加后缀");
    eq(SF.sanitizeGlyphName("star.svg", used), "star_3", "重名后缀递增");
    ok(/^[A-Za-z_][A-Za-z0-9_]*$/.test(SF.sanitizeGlyphName("a b-c.d.svg", {})), "清洗结果为合法 PostScript 名");
})();

/* ---------- 9. 码点分配 ---------- */
(function () {
    var cps = SF.assignCodepoints(3);
    eq(cps[0], 0xE000, "首个码点 U+E000");
    eq(cps[1], 0xE001, "第二个码点 U+E001");
    eq(cps[2], 0xE002, "第三个码点 U+E002");
    eq(SF.codepointLabel(0xE000), "U+E000", "码点标签格式");
    eq(SF.cssUnicodeEscape(0xE000), "\\e000", "CSS 转义格式");
})();

/* ---------- 10. 三次→二次贝塞尔 ---------- */
(function () {
    var qs = SF.cubicToQuadratics({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 30, y: 0 }, 1.0);
    eq(qs.length, 1, "直线型三次只需 1 段二次");
    eq(qs[0].x, 30, "终点一致");
})();

/* ---------- 11. 轮廓方向规范化 ---------- */
(function () {
    var sp = [{ start: { x: 0, y: 1024 }, segs: [{ t: "L", x: 1024, y: 1024 }, { t: "L", x: 1024, y: 0 }, { t: "L", x: 0, y: 0 }], closed: true }];
    var cs = SF.glyphSubpathsToContours(sp);
    eq(cs.length, 1, "1 条轮廓");
    ok(cs[0].length >= 4, "轮廓点数足够");
})();

/* ---------- 12. 三个测试 SVG → 字形 ---------- */
var STAR = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z"/></svg>';
var SHAPES = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="10" y="10" width="80" height="80" rx="10"/><circle cx="50" cy="50" r="20"/></svg>';
var MULTI = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/><path d="M8 8h8v8H8z"/></svg>';
var GLYPHS = (function () {
    var files = [["star.svg", STAR], ["shapes.svg", SHAPES], ["multi.svg", MULTI]];
    var used = {}, glyphs = [], cps = SF.assignCodepoints(files.length);
    files.forEach(function (f, i) {
        var r = SF.buildGlyphFromSvg(f[0], f[1]);
        ok(r.ok, "测试 SVG 解析成功：" + f[0]);
        glyphs.push({
            name: SF.sanitizeGlyphName(f[0], used), codepoint: cps[i],
            subpaths: r.subpaths, advanceWidth: r.advanceWidth
        });
    });
    return glyphs;
})();
(function () {
    eq(GLYPHS.length, 3, "3 个字形");
    eq(GLYPHS[0].codepoint, 0xE000, "star 分配 U+E000");
    eq(GLYPHS[1].codepoint, 0xE001, "shapes 分配 U+E001");
    eq(GLYPHS[2].codepoint, 0xE002, "multi 分配 U+E002");
    eq(GLYPHS[2].subpaths.length, 2, "多 path 合并为一个字形的 2 条子路径");
    eq(GLYPHS[1].subpaths.length, 2, "rect+circle 2 条子路径");
    ok(GLYPHS.every(function (g) { return /^[A-Za-z_][A-Za-z0-9_]*$/.test(g.name); }), "字形名全部合法");
})();

/* ---------- 13. TTF 组装 round-trip（vendor opentype 重新 parse） ---------- */
(function () {
    var ttf = SF.buildTTF(GLYPHS, { familyName: "IconFont" });
    ok(ttf instanceof Uint8Array, "TTF 输出 Uint8Array");
    eq(ttf[0], 0, "TTF 签名字节 0"); eq(ttf[1], 1, "TTF 签名字节 1");
    eq(ttf[2], 0, "TTF 签名字节 2"); eq(ttf[3], 0, "TTF 签名字节 3（0x00010000=TrueType）");
    var sum = 0;
    for (var i = 0; i < ttf.length; i += 4) sum = (sum + ((ttf[i] << 24) | (ttf[i + 1] << 16) | (ttf[i + 2] << 8) | ttf[i + 3])) >>> 0;
    eq(sum, 0xB1B0AFBA, "TTF 全字体 checksum 正确");
    var buf = ttf.buffer.slice(ttf.byteOffset, ttf.byteOffset + ttf.byteLength);
    var p = ot.parse(buf);
    eq(p.outlinesFormat, "truetype", "TTF 为 TrueType 轮廓");
    eq(p.numGlyphs, 4, "TTF glyph 数=4（含 .notdef）");
    eq(p.unitsPerEm, 1024, "TTF unitsPerEm=1024");
    eq(p.ascender, 880, "TTF ascender=880");
    eq(p.descender, -144, "TTF descender=-144");
    var g1 = p.glyphs.get(1), g2 = p.glyphs.get(2), g3 = p.glyphs.get(3);
    eq(g1.unicode, 0xE000, "TTF 字形 1 码点 U+E000");
    eq(g2.unicode, 0xE001, "TTF 字形 2 码点 U+E001");
    eq(g3.unicode, 0xE002, "TTF 字形 3 码点 U+E002");
    eq(g1.advanceWidth, GLYPHS[0].advanceWidth, "TTF 字形 1 advanceWidth 一致");
    eq(g2.advanceWidth, GLYPHS[1].advanceWidth, "TTF 字形 2 advanceWidth 一致");
    eq(g3.advanceWidth, GLYPHS[2].advanceWidth, "TTF 字形 3 advanceWidth 一致");
    eq(g1.name, GLYPHS[0].name, "TTF 字形 1 字形名一致");
    eq(g2.name, GLYPHS[1].name, "TTF 字形 2 字形名一致");
    ok(g1.path.commands.length > 0, "TTF 字形 1 有轮廓命令");
    ok(g2.path.commands.length > 0, "TTF 字形 2 有轮廓命令");
    eq(p.glyphs.get(0).name, ".notdef", "TTF 首字形为 .notdef");
    /* 必改2 回归：OS/2 表按规范偏移解析，字段不再错位（修复前 version=0、
       achVendID 占 8 字节且缺 fsSelection/usFirstCharIndex/usLastCharIndex，
       按规范偏移读出 sTypoAscender=-144、usWinAscent=144 等错位值） */
    var os2tab = (function () {
        var dv = new DataView(ttf.buffer, ttf.byteOffset, ttf.byteLength);
        var nt = dv.getUint16(4);
        for (var i = 0; i < nt; i++) {
            var o = 12 + i * 16;
            var tag = String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
            if (tag === "OS/2") return { off: dv.getUint32(o + 8), len: dv.getUint32(o + 12) };
        }
        return null;
    })();
    ok(!!os2tab, "TTF 含 OS/2 表");
    eq(os2tab.len, 86, "OS/2 表长 86（v1）");
    var odv = new DataView(ttf.buffer, ttf.byteOffset + os2tab.off, os2tab.len);
    eq(odv.getUint16(0), 1, "OS/2 version=1");
    eq(odv.getUint16(64), 0xE000, "OS/2 usFirstCharIndex=U+E000");
    eq(odv.getUint16(66), 0xE002, "OS/2 usLastCharIndex=U+E002");
    eq(odv.getInt16(68), 880, "OS/2 sTypoAscender=880");
    eq(odv.getInt16(70), -144, "OS/2 sTypoDescender=-144");
    eq(odv.getUint16(74), 880, "OS/2 usWinAscent=880");
    eq(odv.getUint16(76), 144, "OS/2 usWinDescent=144");
})();

/* ---------- 14. OTF 组装 round-trip ---------- */
(function () {
    var ab = SF.buildOTF(ot, GLYPHS, { familyName: "IconFont" });
    ok(ab instanceof ArrayBuffer, "OTF 输出 ArrayBuffer");
    var sig = String.fromCharCode.apply(null, Array.from(new Uint8Array(ab).slice(0, 4)));
    eq(sig, "OTTO", "OTF 签名为 OTTO");
    var p = ot.parse(ab);
    eq(p.outlinesFormat, "cff", "OTF 为 CFF 轮廓");
    eq(p.numGlyphs, 4, "OTF glyph 数=4（含 .notdef）");
    var g1 = p.glyphs.get(1), g2 = p.glyphs.get(2), g3 = p.glyphs.get(3);
    eq(g1.unicode, 0xE000, "OTF 字形 1 码点 U+E000");
    eq(g2.unicode, 0xE001, "OTF 字形 2 码点 U+E001");
    eq(g3.unicode, 0xE002, "OTF 字形 3 码点 U+E002");
    eq(g1.advanceWidth, GLYPHS[0].advanceWidth, "OTF 字形 1 advanceWidth 一致");
    eq(g2.advanceWidth, GLYPHS[1].advanceWidth, "OTF 字形 2 advanceWidth 一致");
    eq(g3.advanceWidth, GLYPHS[2].advanceWidth, "OTF 字形 3 advanceWidth 一致");
    ok(g1.path.commands.length > 0, "OTF 字形 1 有轮廓命令");
})();

/* ---------- 15. CSS 生成 ---------- */
(function () {
    var css = SF.buildCSS("IconFont", GLYPHS);
    contains(css, "@font-face", "CSS 含 @font-face");
    contains(css, "font-family: 'IconFont'", "CSS 含字体族名");
    contains(css, "format('truetype')", "CSS 含 truetype 格式声明");
    contains(css, ".icon-star::before", "CSS 含字形 class");
    contains(css, 'content: "\\e000"', "CSS 含码点转义");
    contains(css, "U+E001", "CSS 注释含码点标签");
    contains(css, ".icon-shapes::before", "CSS 含第二个字形");
})();

/* ---------- 16. 非法输入不中断队列 ---------- */
(function () {
    var files = [
        ["good1.svg", STAR],
        ["bad-no-svg.txt", "this is not svg"],
        ["bad-empty.svg", '<svg viewBox="0 0 24 24"><path d=""/></svg>'],
        ["bad-nosize.svg", "<svg><path d=\"M0 0L1 1\"/></svg>"],
        ["good2.svg", MULTI]
    ];
    var results = files.map(function (f) { return SF.buildGlyphFromSvg(f[0], f[1]); });
    eq(results.filter(function (r) { return r.ok; }).length, 2, "坏文件不影响好文件：2 个成功");
    eq(results.filter(function (r) { return !r.ok; }).length, 3, "3 个坏文件各自报错");
    ok(results.every(function (r) { return r.ok || (typeof r.error === "string" && r.error.length > 0); }), "每个失败都有明确错误信息");
    contains(results[1].error, "<svg>", "非 SVG 文件错误信息明确");
})();
(function () {
    var r = SF.parsePathData("", IDENT);
    ok(!r.ok, "空 d 报错");
    var r2 = SF.parsePathData("M10", IDENT);
    ok(!r2.ok, "参数不足报错");
    var r3 = SF.parsePathData("10 10", IDENT);
    ok(!r3.ok, "缺少命令报错");
    var r4 = SF.parsePathData("M0 0 X10 10", IDENT);
    ok(!r4.ok, "未知命令报错");
    var r5 = SF.buildGlyphFromSvg("empty.svg", '<svg viewBox="0 0 24 24"></svg>');
    ok(!r5.ok, "无轮廓的 SVG 报错");
    contains(r5.error, "矢量轮廓", "无轮廓错误信息明确");
})();

/* ---------- 17. 源码零 fetch/XHR ---------- */
(function () {
    ok(!/[^a-zA-Z]fetch\s*\(/.test(SRC), "源码无 fetch 调用");
    ok(SRC.indexOf("XMLHttpRequest") === -1, "源码无 XMLHttpRequest");
    ok(/static\/vendor\/opentype\.min\.js/.test(fs.readFileSync(path.join(__dirname, "..", "templates", "svg_to_font.html"), "utf8")), "模板引用本地 vendor opentype");
})();

/* ---------- 汇总 ---------- */
console.log("\nsvg_to_font 测试：通过 " + pass + "，失败 " + fail + "，共 " + (pass + fail) + " 个断言");
process.exit(fail ? 1 : 0);
