/* WCAG 颜色对比度检查器纯逻辑单元测试（零依赖）：node tests/wcag_contrast_checker.test.js
 * 覆盖：sRGB 线性化、相对亮度、对比度边界值、四档阈值、字号切换、
 * 互换不变性、HEX/RGB 解析与非法输入、修正建议达标性与方向选择、
 * 预设静态检查、结果摘要、注册与零网络请求。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/wcag_contrast_checker.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function approx(a, b, tol, name) { ok(Math.abs(a - b) <= tol, name + "（期望约 " + b + "，实得 " + a + "）"); }

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "wcag_contrast_checker.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "wcag_contrast_checker.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. sRGB 线性化 ---------- */
eq(M.linearize(0), 0, "线性化：0 → 0");
eq(M.linearize(255), 1, "线性化：255 → 1");
approx(M.linearize(10), 10 / 255 / 12.92, 1e-9, "线性化：通道 10 在阈值内走除法");
approx(M.linearize(128), 0.21586, 1e-4, "线性化：通道 128 走幂函数");
ok(M.linearize(10) < M.linearize(11), "线性化单调递增");

/* ---------- 2. 相对亮度 ---------- */
eq(M.relativeLuminance({ r: 0, g: 0, b: 0 }), 0, "亮度：纯黑 0");
eq(M.relativeLuminance({ r: 255, g: 255, b: 255 }), 1, "亮度：纯白 1");
approx(M.relativeLuminance({ r: 255, g: 0, b: 0 }), 0.2126, 1e-4, "亮度：纯红系数 0.2126");
approx(M.relativeLuminance({ r: 0, g: 255, b: 0 }), 0.7152, 1e-4, "亮度：纯绿系数 0.7152");
approx(M.relativeLuminance({ r: 0, g: 0, b: 255 }), 0.0722, 1e-4, "亮度：纯蓝系数 0.0722");
approx(M.relativeLuminance({ r: 128, g: 128, b: 128 }), 0.21586, 1e-4, "亮度：#808080 约 0.21586");

/* ---------- 3. 对比度边界值 ---------- */
eq(M.formatRatio(M.contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })), "21.00", "黑/白 21.00");
eq(M.formatRatio(M.contrastRatio({ r: 0, g: 0, b: 0 }, { r: 0, g: 0, b: 0 })), "1.00", "同色 1.00");
eq(M.formatRatio(M.contrastRatio(M.parseColor("#767676"), M.parseColor("#FFFFFF"))), "4.54", "#767676 白底 4.54");
eq(M.formatRatio(M.contrastRatio(M.parseColor("#777777"), M.parseColor("#FFFFFF"))), "4.48", "#777777 白底 4.48");
eq(M.formatRatio(M.contrastRatio(M.parseColor("#595959"), M.parseColor("#FFFFFF"))), "7.00", "#595959 白底 7.00");
eq(M.formatRatio(M.contrastRatio(M.parseColor("#1A73E8"), M.parseColor("#FFFFFF"))), "4.51", "#1A73E8 白底 4.51");
eq(M.contrastRatio(M.parseColor("#767676"), M.parseColor("#FFFFFF")),
  M.contrastRatio(M.parseColor("#FFFFFF"), M.parseColor("#767676")), "互换前景/背景比值不变（#767676）");
eq(M.contrastRatio(M.parseColor("#1A73E8"), M.parseColor("#000000")),
  M.contrastRatio(M.parseColor("#000000"), M.parseColor("#1A73E8")), "互换前景/背景比值不变（品牌蓝）");

/* ---------- 4. 阈值与字号切换 ---------- */
eq(M.thresholdsForSize("normal").aa, 4.5, "正常字 AA 阈值 4.5");
eq(M.thresholdsForSize("normal").aaa, 7.0, "正常字 AAA 阈值 7.0");
eq(M.thresholdsForSize("large").aa, 3.0, "大号字 AA 阈值 3.0");
eq(M.thresholdsForSize("large").aaa, 4.5, "大号字 AAA 阈值 4.5");
var ev7676 = M.evaluate("#767676", "#FFFFFF", "normal");
ok(ev7676.checks.aaNormal === true, "#767676 通过 AA 正常");
ok(ev7676.checks.aaaNormal === false, "#767676 不通过 AAA 正常");
var ev7777 = M.evaluate("#777777", "#FFFFFF", "normal");
ok(ev7777.checks.aaNormal === false, "#777777 不通过 AA 正常");
ok(ev7777.checks.aaLarge === true, "#777777 通过 AA 大号");
ok(ev7777.primary.aa === false, "#777777 正常字主判定 AA 未通过");
var ev7777Large = M.evaluate("#777777", "#FFFFFF", "large");
ok(ev7777Large.primary.aa === true, "#777777 大号字主判定 AA 通过（同一颜色对判定随字号变）");
var ev5959 = M.evaluate("#595959", "#FFFFFF", "normal");
ok(ev5959.checks.aaaNormal === true, "#595959 通过 AAA 正常");
var evBrand = M.evaluate("#1A73E8", "#FFFFFF", "normal");
ok(evBrand.checks.aaNormal === true, "品牌蓝通过 AA 正常");
ok(evBrand.checks.aaaNormal === false, "品牌蓝不通过 AAA 正常");
ok(evBrand.checks.aaaLarge === true, "品牌蓝通过 AAA 大号（4.51≥4.5）");
eq(M.evaluate("#000000", "#FFFFFF", "normal").ratioText, "21.00", "evaluate 黑/白 ratioText 21.00");

/* ---------- 5. HEX/RGB 解析与非法输入 ---------- */
eq(M.parseColor("#fff").hex, "#FFFFFF", "#RGB 展开为 #FFFFFF");
eq(M.parseColor("#1a73e8").hex, "#1A73E8", "#RRGGBB 小写规范化大写");
eq(M.parseColor("rgb(26, 115, 232)").hex, "#1A73E8", "rgb() 解析");
eq(M.parseColor("rgb(0,0,0)").hex, "#000000", "rgb() 无空格解析");
eq(M.parseColor("  #767676  ").hex, "#767676", "首尾空白容忍");
ok(M.parseColor("red") === null, "非法：颜色名 red");
ok(M.parseColor("#12") === null, "非法：#12 位数不足");
ok(M.parseColor("#12345") === null, "非法：#12345 位数不对");
ok(M.parseColor("#gggggg") === null, "非法：非十六进制字符");
ok(M.parseColor("rgb(256, 0, 0)") === null, "非法：rgb 通道超 255");
ok(M.parseColor("rgb(1, 2)") === null, "非法：rgb 缺通道");
ok(M.parseColor("rgba(0, 0, 0, 1)") === null, "非法：rgba 不接受");
ok(M.parseColor("") === null, "非法：空字符串");
ok(M.parseColor(null) === null, "非法：null 输入");
ok(M.evaluate("red", "#FFFFFF", "normal") === null, "evaluate 非法前景返回 null");
eq(M.rgbToHex({ r: 26, g: 115, b: 232 }), "#1A73E8", "rgbToHex 转换");
eq(JSON.stringify(M.hexToRgb("#1A73E8")), JSON.stringify({ r: 26, g: 115, b: 232 }), "hexToRgb 转换");
eq(M.rgbToText({ r: 26, g: 115, b: 232 }), "rgb(26, 115, 232)", "rgbToText 转换");

/* ---------- 6. 修正建议 ---------- */
var sug = M.suggestColor("#777777", "#FFFFFF", 4.5);
eq(sug.hex, "#747474", "#777777 修正建议色 #747474");
eq(sug.steps, 1, "#777777 修正建议步数 1（双向最少）");
eq(sug.direction, "darken", "#777777 修正方向为调暗");
eq(sug.ratioText, "4.67", "#777777 建议色比值 4.67");
ok(M.contrastRatio(M.parseColor(sug.hex), M.parseColor("#FFFFFF")) >= 4.5, "建议色与白底比值 ≥4.5");
ok(M.suggestColor("#000000", "#FFFFFF", 4.5) === null, "已达标时无修正建议");
var sugAaa = M.suggestColor("#777777", "#FFFFFF", 7.0);
ok(sugAaa !== null && sugAaa.ratio >= 7.0, "AAA 目标下建议色比值 ≥7.0");
ok(sugAaa.steps <= 20, "AAA 目标下建议步数合理");
ok(M.suggestColor("#FFFFFF", "#808080", 7.0) === null, "无前景色可达 AAA 时返回 null（灰底两端均不足）");
eq(M.targetRatioForKey("aaNormal"), 4.5, "目标档 AA 正常 4.5");
eq(M.targetRatioForKey("aaLarge"), 3.0, "目标档 AA 大号 3.0");
eq(M.targetRatioForKey("aaaNormal"), 7.0, "目标档 AAA 正常 7.0");
eq(M.targetRatioForKey("aaaLarge"), 4.5, "目标档 AAA 大号 4.5");
eq(M.targetRatioForKey("unknown"), 4.5, "未知目标档默认 4.5");

/* ---------- 7. 默认与预设静态检查 ---------- */
var d = M.defaultState();
eq(d.fg, "#000000", "默认前景黑");
eq(d.bg, "#FFFFFF", "默认背景白");
eq(d.size, "normal", "默认正常字");
eq(d.target, "aaNormal", "默认建议目标 AA 正常");
eq(M.PRESETS.length, 4, "预设共 4 组");
eq(M.PRESETS[0].fg, "#000000", "预设 1 黑字");
eq(M.PRESETS[1].fg, "#767676", "预设 2 #767676");
eq(M.PRESETS[2].fg, "#777777", "预设 3 #777777");
eq(M.PRESETS[3].fg, "#1A73E8", "预设 4 品牌蓝");
eq(M.evaluate(M.PRESETS[0].fg, M.PRESETS[0].bg, "normal").ratioText, "21.00", "预设 1 比值 21.00");
ok(M.evaluate(M.PRESETS[1].fg, M.PRESETS[1].bg, "normal").checks.aaNormal === true, "预设 2 通过 AA 正常");
ok(M.evaluate(M.PRESETS[2].fg, M.PRESETS[2].bg, "normal").checks.aaNormal === false, "预设 3 不通过 AA 正常");
ok(M.evaluate(M.PRESETS[3].fg, M.PRESETS[3].bg, "normal").checks.aaaNormal === false, "预设 4 不通过 AAA 正常");

/* ---------- 8. 结果摘要 ---------- */
var summary = M.buildSummary(ev7777, "normal", sug);
ok(summary.indexOf("#777777") >= 0, "摘要含前景色 HEX");
ok(summary.indexOf("#FFFFFF") >= 0, "摘要含背景色 HEX");
ok(summary.indexOf("4.48") >= 0, "摘要含比值 4.48");
ok(summary.indexOf("AA 正常") >= 0 && summary.indexOf("AAA 大号") >= 0, "摘要含四档判定标签");
ok(summary.indexOf("#747474") >= 0, "摘要含建议色");

/* ---------- 9. 注册、模板与零网络 ---------- */
ok(GO_SRC.indexOf('"wcag_contrast_checker"') >= 0, "categories.go 注册 ID");
ok(GO_SRC.indexOf('"/tools/wcag-contrast-checker"') >= 0, "categories.go 注册 Path");
ok(GO_SRC.indexOf('Icon:        "contrast"') >= 0, "注册 Icon contrast");
var paths = GO_SRC.match(/"\/tools\/[^"]+"/g) || [];
var uniq = {};
paths.forEach(function (p) { uniq[p] = true; });
eq(Object.keys(uniq).length, 238, "注册 Path 总数 237→238");
ok(TPL_SRC.indexOf("wcag-contrast-checker") >= 0, "模板 canonical 含新 Path");
ok(TPL_SRC.indexOf("请按需改写") >= 0, "模板含请按需改写提示");
ok(TPL_SRC.indexOf("按 WCAG 2.x 相对亮度公式判定，不承诺 APCA 口径") >= 0, "真限制：不承诺 APCA");
ok(TPL_SRC.indexOf("判定只针对所输颜色对") >= 0, "真限制：只针对所输颜色对");
ok(TPL_SRC.indexOf("大号字 ≥18pt 或 14pt 加粗") >= 0, "真限制：大号字定义");
ok(TPL_SRC.indexOf("修正建议只调前景色明暗") >= 0, "真限制：只调前景色明暗");
ok(TPL_SRC.indexOf("文本不出浏览器") >= 0, "真限制：文本不出浏览器");
ok(TPL_SRC.indexOf("/tools/color-palette-generator") >= 0, "互链：配色方案生成器");
ok(TPL_SRC.indexOf("/tools/css-gradient-generator") >= 0, "互链：CSS 渐变生成器");
ok(TPL_SRC.indexOf("/tools/css-shadow-radius-generator") >= 0, "互链：CSS 阴影与圆角生成器");
ok(JS_SRC.indexOf("fetch(") < 0 && JS_SRC.indexOf("XMLHttpRequest") < 0, "JS 零 fetch/XHR");
ok(TPL_SRC.indexOf("wcc-fg-picker") >= 0 && TPL_SRC.indexOf("wcc-bg-picker") >= 0, "模板含双取色器");
ok(TPL_SRC.indexOf("wcc-fg-hex") >= 0 && TPL_SRC.indexOf("wcc-fg-rgb") >= 0, "模板含前景 HEX/RGB 文本输入");
ok(TPL_SRC.indexOf("wcc-swap") >= 0, "模板含互换按钮");
ok(TPL_SRC.indexOf("wcc-preview-title") >= 0 && TPL_SRC.indexOf("wcc-preview-btn") >= 0, "模板含样例预览（大标题＋按钮）");

console.log("PASS " + pass + " / FAIL " + fail);
if (fail > 0) process.exit(1);
