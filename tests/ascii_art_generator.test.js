/* ASCII 字符画生成器（ascii_art_generator）纯逻辑单元测试（零依赖）：
 * node tests/ascii_art_generator.test.js
 * 覆盖：字符集常量（长度/首尾/密度方向）、亮度→字符映射、映射单调性、反色、
 * 预缩放尺寸、行列计算、buildArt 列数四档（±2 容差）与黑白极值、彩色 cells 与
 * 导出灰度降级、文件名格式、性能提示阈值、JS 零 fetch/XHR、模板静态检查。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var AA = require("../static/js/ascii_art_generator.js");
var SRC = fs.readFileSync(path.join(__dirname, "..", "static", "js", "ascii_art_generator.js"), "utf8");
var TPL = fs.readFileSync(path.join(__dirname, "..", "templates", "ascii_art_generator.html"), "utf8");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function near(a, b, tol, name) { ok(Math.abs(a - b) <= tol, name + "（期望≈" + b + "±" + tol + "，实得 " + a + "）"); }

/* 构造纯色像素网格 {width,height,data} */
function solidGrid(w, h, r, g, b) {
    var data = new Array(w * h * 4);
    for (var i = 0; i < w * h; i++) {
        data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = 255;
    }
    return { width: w, height: h, data: data };
}
/* 水平亮度渐变网格 */
function gradientGrid(w, h) {
    var data = new Array(w * h * 4);
    for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
            var v = Math.round(x / (w - 1) * 255);
            var i = (y * w + x) * 4;
            data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
        }
    }
    return { width: w, height: h, data: data };
}

/* ---------- 1. 字符集常量 ---------- */
var SIMPLE_SPEC = ["@", "#", "S", "%", "?", "*", "+", ";", ":", ",", "."].join("");
ok(AA.RAMPS.simple === SIMPLE_SPEC, "精简字符集与规格一致（11 级，数组拼接无隐形空格）");
eq(AA.RAMPS.simple.length, 11, "精简字符集 11 级");
eq(AA.RAMPS.simple.charAt(0), "@", "精简首字符最密（@）");
eq(AA.RAMPS.simple.charAt(10), ".", "精简末字符最疏（.）");
eq(AA.RAMPS.standard.length, 70, "标准字符集 70 级");
eq(AA.RAMPS.standard.charAt(0), "$", "标准字符集首字符最密（$）");
eq(AA.RAMPS.standard.charAt(69), " ", "标准字符集末字符最疏（空格）");
ok(AA.RAMPS.standard.indexOf("@B%8&WM#") === 1, "标准 ramp 含经典中段 @B%8&WM#");
eq(AA.RAMPS.halftone, "@%#*+=-:. ", "半调字符集为规格串反转（暗→亮）");
eq(AA.RAMPS.halftone.length, 10, "半调字符集 10 级");
eq(AA.RAMP_NAMES.standard, "标准", "字符集名称映射");
eq(AA.RAMP_KEYS.length, 3, "三档字符集");

/* ---------- 2. 亮度→字符映射 ---------- */
eq(AA.charForLuminance(0, "simple", false), "@", "纯黑→精简首字符 @");
eq(AA.charForLuminance(255, "simple", false), ".", "纯白→精简末字符 .");
eq(AA.charForLuminance(0, "standard", false), "$", "纯黑→标准首字符 $");
eq(AA.charForLuminance(255, "standard", false), " ", "纯白→标准末字符（空格）");
eq(AA.charForLuminance(0, "halftone", false), "@", "纯黑→半调首字符 @");
eq(AA.charForLuminance(255, "halftone", false), " ", "纯白→半调末字符（空格）");
eq(AA.luminance(255, 255, 255), 255, "白色亮度 255");
eq(AA.luminance(0, 0, 0), 0, "黑色亮度 0");
near(AA.luminance(255, 0, 0), 76.245, 0.01, "红色亮度按 BT.601");
/* 未知 ramp 回退默认标准档 */
eq(AA.charForLuminance(0, "nope", false), "$", "未知字符集回退标准档");
/* 越界亮度钳制 */
eq(AA.charForLuminance(-50, "simple", false), "@", "负亮度钳制到纯黑");
eq(AA.charForLuminance(999, "simple", false), ".", "超限亮度钳制到纯白");

/* ---------- 3. 密度单调性：亮度上升→字符索引非递减（密→疏） ---------- */
AA.RAMP_KEYS.forEach(function (key) {
    var s = AA.RAMPS[key];
    var prev = -1, mono = true;
    for (var lum = 0; lum <= 255; lum += 5) {
        var idx = s.indexOf(AA.charForLuminance(lum, key, false));
        if (idx < prev) { mono = false; break; }
        prev = idx;
    }
    ok(mono, "字符集 " + key + " 密度单调（亮区稀疏/暗区密集）");
});

/* ---------- 4. 反色 ---------- */
eq(AA.charForLuminance(0, "standard", true), " ", "反色：纯黑→空格");
eq(AA.charForLuminance(255, "standard", true), "$", "反色：纯白→$");
eq(AA.charForLuminance(0, "simple", true), AA.charForLuminance(255, "simple", false), "反色翻转映射（黑↔白）");
eq(AA.charForLuminance(255, "simple", true), AA.charForLuminance(0, "simple", false), "反色翻转映射（白↔黑）");

/* ---------- 5. 预缩放 ---------- */
var sz = AA.computeTargetSize(1000, 800);
eq(sz.w, 480, "大图最长边压到 480");
eq(sz.h, 384, "大图等比缩放高度");
var sz2 = AA.computeTargetSize(400, 300);
eq(sz2.w, 400, "小图宽度不动");
eq(sz2.h, 300, "小图高度不动");
var sz3 = AA.computeTargetSize(2000, 2000);
eq(sz3.w, 480, "正方形大图压到 480");
eq(AA.MAX_SIDE, 480, "预缩放上限常量 480");

/* ---------- 6. 行列计算 ---------- */
var gs = AA.gridSize(480, 480, 80);
eq(gs.cols, 80, "80 档列数 80");
eq(gs.rows, 40, "正方形 80 档行数按 0.5 压缩为 40");
var gs2 = AA.gridSize(480, 240, 160);
eq(gs2.cols, 160, "160 档列数 160");
eq(gs2.rows, 40, "2:1 图 160 档行数 40");
var gs3 = AA.gridSize(100, 100, 160);
eq(gs3.cols, 100, "列数不超过源图宽度");
eq(AA.ROW_FACTOR, 0.5, "行高压缩比 0.5");

/* ---------- 7. buildArt：极值与四档列数 ---------- */
var black = AA.buildArt(solidGrid(200, 200, 0, 0, 0), 80, { ramp: "standard" });
eq(black.cols, 80, "黑图列数 80");
eq(black.rows, 40, "黑图行数 40");
ok(black.lines.every(function (ln) { return ln.length === 80; }), "黑图每行 80 字符");
ok(black.lines.every(function (ln) { return /^\$+$/.test(ln); }), "纯黑全 $（最密）");
var white = AA.buildArt(solidGrid(200, 200, 255, 255, 255), 80, { ramp: "standard" });
ok(white.lines.every(function (ln) { return /^ *$/.test(ln); }), "纯白全空格（最疏）");
var whiteInv = AA.buildArt(solidGrid(200, 200, 255, 255, 255), 80, { ramp: "standard", invert: true });
ok(whiteInv.lines.every(function (ln) { return /^\$+$/.test(ln); }), "反色纯白全 $");
var grad = AA.buildArt(gradientGrid(400, 100), 80, { ramp: "standard" });
ok(grad.lines[0].charAt(0) === "$", "渐变左端最密");
ok(grad.lines[0].charAt(79) === " ", "渐变右端最疏");
/* 四档宽度：输出列数对应变化（±2 容差） */
AA.WIDTHS.forEach(function (w) {
    var art = AA.buildArt(solidGrid(480, 480, 128, 128, 128), w, { ramp: "simple" });
    near(art.lines[0].length, w, 2, w + " 档输出列数≈" + w);
});
eq(AA.WIDTHS.join(","), "40,80,120,160", "宽度四档");
eq(AA.DEFAULT_WIDTH, 80, "默认宽度 80");

/* ---------- 8. 彩色模式与导出降级 ---------- */
var colorArt = AA.buildArt(solidGrid(100, 100, 200, 30, 30), 40, { ramp: "standard", color: true });
ok(Array.isArray(colorArt.cells) && colorArt.cells.length === colorArt.cols * colorArt.rows, "彩色模式逐 cell 记录");
eq(colorArt.cells[0].r, 200, "cell 记录采样点红色");
eq(colorArt.cells[0].g, 30, "cell 记录采样点绿色");
eq(colorArt.cells[0].b, 30, "cell 记录采样点蓝色");
var grayArt = AA.buildArt(solidGrid(100, 100, 200, 30, 30), 40, { ramp: "standard", color: false });
eq(AA.artToText(colorArt), AA.artToText(grayArt), "导出文本与灰度一致（彩色降级）");
ok(AA.artToText(colorArt).indexOf("rgb") === -1 && AA.artToText(colorArt).indexOf("span") === -1,
    "导出 .txt 为纯字符、无颜色标记");
var noColor = AA.buildArt(solidGrid(50, 50, 0, 0, 0), 40, {});
eq(noColor.cells, null, "灰度模式无 cells");

/* ---------- 9. 导出文件名与性能提示 ---------- */
ok(/^ascii-art-\d{8}-\d{6}\.txt$/.test(AA.buildFilename(new Date(2026, 9, 24, 5, 45, 23))),
    "文件名格式 ascii-art-YYYYMMDD-HHmmss.txt");
eq(AA.buildFilename(new Date(2026, 9, 24, 5, 45, 23)), "ascii-art-20261024-054523.txt", "文件名时间戳精确");
ok(AA.needsPerfHint(160, true), "160 档彩色提示降档");
ok(!AA.needsPerfHint(160, false), "160 档灰度不提示");
ok(!AA.needsPerfHint(80, true), "80 档彩色不提示");
ok(!AA.needsPerfHint(120, true), "120 档彩色不提示");

/* ---------- 10. JS 源码约束：零 fetch/XHR ---------- */
ok(!/\bfetch\s*\(/.test(SRC), "JS 无 fetch 调用");
ok(SRC.indexOf("XMLHttpRequest") === -1, "JS 无 XMLHttpRequest");
ok(SRC.indexOf("navigator.clipboard") !== -1, "复制走 navigator.clipboard");
ok(SRC.indexOf("createObjectURL") !== -1, "下载走 Blob+ObjectURL");
ok(SRC.indexOf("getImageData") !== -1, "canvas 本地解码");

/* ---------- 11. 模板静态检查 ---------- */
ok(TPL.indexOf('rel="canonical" href="https://www.johnkingzcq123.xyz/tools/ascii-art-generator"') !== -1, "canonical 正确");
ok(TPL.indexOf("图片只在本机浏览器处理") !== -1, "隐私声明：只在本机浏览器处理");
ok(TPL.indexOf("不上传") !== -1, "隐私声明：不上传");
ok(TPL.indexOf('accept="image/png,image/jpeg,image/gif,image/webp"') !== -1, "accept 含 PNG/JPG/GIF/WebP");
ok(TPL.indexOf('id="aag-output"') !== -1, "输出 <pre> 存在");
ok(TPL.indexOf("overflow-x") !== -1, "输出区横向滚动不撑破布局");
ok(TPL.indexOf("/tools/static/js/ascii_art_generator.js") !== -1, "引用 JS 文件");
ok(TPL.indexOf("application/ld+json") !== -1, "JSON-LD 结构化数据");
ok(TPL.indexOf("ascii-art-generator") !== -1, "模板含工具 path 标识");

console.log("\n通过 " + pass + "，失败 " + fail + "，共 " + (pass + fail) + " 断言");
process.exit(fail === 0 ? 0 : 1);
