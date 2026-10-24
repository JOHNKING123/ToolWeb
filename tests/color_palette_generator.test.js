/* 配色方案生成器纯逻辑单元测试（零依赖）：node tests/color_palette_generator.test.js
 * 覆盖：
 * 1. HEX 解析与格式（3 位/6 位/无效/统一大写）
 * 2. RGB↔HSL 往返与色轮边界（0/60/…/360 取模、负角）
 * 3. 6 种方案色相角（互补/类比/三角色/分裂互补/四方形/单色）
 * 4. 单色明度阶梯（同色相、明度递增、6 档）
 * 5. WCAG 对比度数值与 AA 标识（含手工核对值）
 * 6. 导出格式（HEX 列表 / CSS 变量）
 * 7. 模板静态检查（SEO 面板/脚本引用/6 方案容器/基色控件）
 * 8. 零网络请求（源码无网络调用）
 * 9. 边界与非法输入
 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/color_palette_generator.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function deepEq(a, b, name) { eq(JSON.stringify(a), JSON.stringify(b), name); }
function near(a, b, tol, name) { ok(Math.abs(a - b) <= tol, name + "（期望 " + b + "±" + tol + "，实得 " + a + "）"); }
function hueDiff(a, b) { var d = Math.abs(((a - b) % 360 + 360) % 360); return Math.min(d, 360 - d); }

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "color_palette_generator.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "color_palette_generator.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. HEX 解析与格式 ---------- */
deepEq(M.parseHex("#2563EB"), [37, 99, 235], "解析 6 位 HEX");
deepEq(M.parseHex("2563eb"), [37, 99, 235], "解析无 # 前缀");
deepEq(M.parseHex("#25E"), [34, 85, 238], "解析 3 位简写");
deepEq(M.parseHex("#fff"), [255, 255, 255], "解析白色简写");
eq(M.parseHex("#12"), null, "2 位 HEX 非法");
eq(M.parseHex("#GGGGGG"), null, "非法字符拒绝");
eq(M.parseHex(""), null, "空串拒绝");
eq(M.parseHex(null), null, "null 拒绝");
ok(M.isValidHex("#AABBCC") && !M.isValidHex("xyz"), "isValidHex 正反例");
eq(M.rgbToHex(37, 99, 235), "#2563EB", "rgbToHex 输出统一大写");
eq(M.rgbToHex(0, 0, 0), "#000000", "黑色 HEX");
eq(M.rgbToHex(255, 255, 255), "#FFFFFF", "白色 HEX");
ok(/^#[0-9A-F]{6}$/.test(M.rgbToHex(12, 34, 56)), "HEX 输出格式恒为 #RRGGBB 大写");

/* ---------- 2. RGB↔HSL 往返与边界 ---------- */
deepEq(M.rgbToHsl(255, 0, 0), [0, 100, 50], "纯红 HSL");
deepEq(M.rgbToHsl(0, 255, 0), [120, 100, 50], "纯绿 HSL");
deepEq(M.rgbToHsl(0, 0, 255), [240, 100, 50], "纯蓝 HSL");
deepEq(M.rgbToHsl(128, 128, 128), [0, 0, 50], "灰色饱和度 0");
deepEq(M.hslToRgb(0, 100, 50), [255, 0, 0], "HSL 红回 RGB");
deepEq(M.hslToRgb(360, 100, 50), [255, 0, 0], "色相 360 取模回红");
deepEq(M.hslToRgb(-30, 100, 50), M.hslToRgb(330, 100, 50), "负色相取模等价 330");
deepEq(M.hslToRgb(390, 100, 50), M.hslToRgb(30, 100, 50), "色相 390 取模等价 30");
eq(M.wrapHue(720), 0, "wrapHue 720→0");
eq(M.wrapHue(-1), 359, "wrapHue -1→359");
[["#FF0000"], ["#00FF00"], ["#0000FF"], ["#2563EB"], ["#F59E0B"], ["#808080"]].forEach(function (h) {
  var rgb = M.parseHex(h[0]);
  var hsl = M.rgbToHsl(rgb[0], rgb[1], rgb[2]);
  var back = M.hslToRgb(hsl[0], hsl[1], hsl[2]);
  ok(back.every(function (v, i) { return Math.abs(v - rgb[i]) <= 1; }),
    "往返 " + h[0] + "（HSL 取整允许单通道 ±1，实得 " + JSON.stringify(back) + "）");
});
eq(M.hexToHsl("#2563EB").length, 3, "hexToHsl 返回三元组");
eq(M.hexToHsl("zzz"), null, "hexToHsl 非法返回 null");

/* ---------- 3. 6 种方案色相角（基色 #2563EB，色相约 221°） ---------- */
var base = "#2563EB";
var baseHsl = M.hexToHsl(base);
var schemes = M.allSchemes(base);
eq(Object.keys(schemes).length, 6, "allSchemes 返回 6 种方案");
function huesOf(id) { return schemes[id].map(function (c) { return M.hexToHsl(c.hex)[0]; }); }
function wrap(v) { return ((v % 360) + 360) % 360; }
function checkOffsets(id, expected) {
  var hues = huesOf(id);
  expected.forEach(function (off, i) {
    near(hueDiff(hues[i], wrap(baseHsl[0] + off)), 0, 2,
      id + " 第 " + i + " 色偏移 " + off + "°（目标色相 " + wrap(baseHsl[0] + off) + "°）");
  });
}
checkOffsets("complementary", [0, 180]);
checkOffsets("analogous", [-30, 0, 30]);
checkOffsets("triadic", [0, 120, 240]);
checkOffsets("split", [0, 150, 210]);
checkOffsets("square", [0, 90, 180, 270]);
eq(schemes.complementary.length, 2, "互补 2 色");
eq(schemes.analogous.length, 3, "类比 3 色");
eq(schemes.triadic.length, 3, "三角色 3 色");
eq(schemes.split.length, 3, "分裂互补 3 色");
eq(schemes.square.length, 4, "四方形 4 色");
eq(schemes.mono.length, 6, "单色 6 色");
schemes.complementary.concat(schemes.analogous, schemes.triadic, schemes.split, schemes.square, schemes.mono)
  .forEach(function (c) { ok(/^#[0-9A-F]{6}$/.test(c.hex), "方案色 HEX 格式 " + c.hex); });
deepEq(schemes.complementary.map(function (c) { return c.role; }), ["基色", "互补色 +180°"], "互补角色标注");
deepEq(schemes.analogous.map(function (c) { return c.role; }), ["类比色 −30°", "基色", "类比色 +30°"], "类比角色标注");
deepEq(schemes.triadic.map(function (c) { return c.role; }), ["基色", "三角色 +120°", "三角色 +240°"], "三角色角色标注");
deepEq(schemes.square.map(function (c) { return c.role; }), ["基色", "四方形 +90°", "四方形 +180°", "四方形 +270°"], "四方形角色标注");

/* ---------- 4. 单色明度阶梯 ---------- */
var monoHsl = schemes.mono.map(function (c) { return M.hexToHsl(c.hex); });
monoHsl.forEach(function (h) { near(hueDiff(h[0], baseHsl[0]), 0, 2, "单色同色相"); });
var monoL = monoHsl.map(function (h) { return h[2]; });
ok(monoL.every(function (v, i) { return i === 0 || v > monoL[i - 1]; }), "单色明度严格递增");
deepEq(M.MONO_LIGHTNESS, [12, 28, 44, 60, 76, 90], "单色明度阶梯表");
monoHsl.forEach(function (h, i) { near(h[2], M.MONO_LIGHTNESS[i], 1, "单色第 " + i + " 档明度"); });

/* ---------- 5. WCAG 对比度 ---------- */
near(M.contrastRatioHex("#000000", "#FFFFFF"), 21, 0.01, "黑白对比度 21:1");
near(M.contrastRatioHex("#FFFFFF", "#FFFFFF"), 1, 0.01, "同色对比度 1:1");
near(M.contrastRatioHex("#FFFFFF", "#000000"), 21, 0.01, "对比度对称");
var ct = M.contrastAgainst("#2563EB");
near(ct.white, 5.17, 0.05, "基色 #2563EB 对白底对比度（手工核对约 5.17）");
near(ct.black, 4.06, 0.05, "基色 #2563EB 对黑底对比度（手工核对约 4.06）");
ok(ct.white > ct.black, "蓝基色对白底对比度高于对黑底（亮度 0.153 偏暗色）");
eq(M.aaLabel(21), "AAA ✓", "21:1 标 AAA");
eq(M.aaLabel(4.5), "AA ✓", "4.5:1 恰达 AA");
eq(M.aaLabel(4.49), "仅大文本 AA", "4.49 仅大文本");
eq(M.aaLabel(2.0), "不达标 ✗", "2.0 不达标");
ok(M.aaPass(4.5) && !M.aaPass(4.49), "aaPass 阈值 4.5");
near(M.contrastRatioHex("#767676", "#FFFFFF"), 4.54, 0.05, "灰 #767676 对白底约 4.54（AA 边界抽查）");
eq(M.aaLabel(M.contrastRatioHex("#767676", "#FFFFFF")), "AA ✓", "#767676 对白底达 AA");

/* ---------- 6. 导出格式 ---------- */
eq(M.hexList(schemes.complementary), schemes.complementary[0].hex + ", " + schemes.complementary[1].hex, "HEX 列表逗号分隔");
var css = M.cssVariables(schemes.triadic);
ok(css.indexOf(":root {") === 0 && css.indexOf("--palette-1: " + schemes.triadic[0].hex) >= 0 &&
  css.indexOf("--palette-3: " + schemes.triadic[2].hex) >= 0 && css.slice(-1) === "}", "CSS 变量格式");
ok(M.randomBaseHex && /^#[0-9A-F]{6}$/.test(M.randomBaseHex()), "随机基色格式有效");

/* ---------- 7. 模板静态检查 ---------- */
ok(TPL_SRC.indexOf("https://www.johnkingzcq123.xyz/tools/color-palette-generator") >= 0, "模板 canonical 正确");
ok(TPL_SRC.indexOf("color-palette-generator") >= 0, "模板含工具 slug");
ok(TPL_SRC.indexOf("/tools/static/js/color_palette_generator.js") >= 0, "模板引用 JS");
ok(TPL_SRC.indexOf("cp-picker") >= 0 && TPL_SRC.indexOf("cp-hex") >= 0 && TPL_SRC.indexOf("cp-random") >= 0, "模板含基色控件");
ok(TPL_SRC.indexOf("cp-schemes") >= 0, "模板含方案容器");
ok(TPL_SRC.indexOf("互补") >= 0 && TPL_SRC.indexOf("类比") >= 0 && TPL_SRC.indexOf("三角色") >= 0 &&
  TPL_SRC.indexOf("分裂互补") >= 0 && TPL_SRC.indexOf("四方形") >= 0 && TPL_SRC.indexOf("单色") >= 0, "模板使用说明含 6 方案名");
ok(TPL_SRC.indexOf("常见问题") >= 0 && TPL_SRC.indexOf("相关工具") >= 0, "模板含 FAQ 与相关工具");
ok(TPL_SRC.indexOf("/tools/color-converter") >= 0 && TPL_SRC.indexOf("/tools/css-gradient-generator") >= 0, "模板相关工具互链");
ok(TPL_SRC.indexOf("application/ld+json") >= 0 && TPL_SRC.indexOf("og:title") >= 0, "模板含 JSON-LD 与 OG");
ok(GO_SRC.indexOf('"color_palette_generator"') >= 0 && GO_SRC.indexOf('"/tools/color-palette-generator"') >= 0, "categories.go 注册 ID 与 Path");
ok(GO_SRC.indexOf("color_lens") >= 0, "注册 Icon 为 color_lens");

/* ---------- 8. 零网络请求 ---------- */
ok(!/\bfetch\s*\(/.test(JS_SRC) && !/XMLHttpRequest/.test(JS_SRC), "JS 无网络调用");
ok(!/\bfetch\s*\(/.test(TPL_SRC) && !/XMLHttpRequest/.test(TPL_SRC), "模板无网络调用");

/* ---------- 9. 边界与非法输入 ---------- */
eq(M.schemeColors("nope", base), null, "未知方案返回 null");
eq(M.schemeColors("complementary", "zzz"), null, "非法基色返回 null");
eq(M.contrastRatioHex("#FFFFFF", "zzz"), null, "非法对比度输入返回 null");
deepEq(M.schemeColors("complementary", "#000000").map(function (c) { return c.hex; }),
  ["#000000", "#000000"], "纯黑基色互补仍为黑（饱和度 0）");
var wrap = M.schemeColors("analogous", "#FF0000");
eq(wrap[0].hue, 330, "红基色类比 -30° 回绕到 330°");

console.log("PASS " + pass + " / FAIL " + fail + "（共 " + (pass + fail) + " 断言）");
if (fail > 0) process.exit(1);
