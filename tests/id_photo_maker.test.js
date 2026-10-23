/* 证件照裁剪排版纯逻辑单元测试（零依赖）：node tests/id_photo_maker.test.js
 * 覆盖：
 *  1. 毫米→像素换算（300dpi 口径）
 *  2. 五预设像素尺寸与宽高比（规格：1寸295x413 / 2寸413x579 / 小2寸390x567 / 美签600x600 / 护照390x567）
 *  3. 相纸排版（5寸1寸8张 / 5寸2寸4张 / 首格坐标 / 放不下 / 非法输入）
 *  4. 背景替换纯函数（距离、容差、阈值行为、alpha 保留）
 *  5. 导出文件名规则
 *  6. 脚本零 fetch/XHR/上传（源码自检）
 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/id_photo_maker.js");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + ")"); }
function approx(a, b, eps, name) { ok(Math.abs(a - b) <= eps, name + "（期望≈" + b + "，实得 " + a + ")"); }

/* ---------- 1. 毫米→像素（300dpi） ---------- */
eq(M.ipmMmToPx(25), 295, "25mm→295px（1寸宽）");
eq(M.ipmMmToPx(35), 413, "35mm→413px（1寸高/2寸宽）");
eq(M.ipmMmToPx(49), 579, "49mm→579px（2寸高）");
eq(M.ipmMmToPx(33), 390, "33mm→390px（小2寸/护照宽）");
eq(M.ipmMmToPx(48), 567, "48mm→567px（小2寸/护照高）");
eq(M.ipmMmToPx(51), 602, "51mm 公式值 602（美签预设按冲印口径硬编码 600）");
eq(M.ipmMmToPx(127), 1500, "127mm→1500px（5寸纸宽）");
eq(M.ipmMmToPx(89), 1051, "89mm 公式值 1051（5寸纸高按冲印惯例取 1050，见相纸表）");
eq(M.ipmMmToPx(0), null, "0mm→null");
eq(M.ipmMmToPx(-5), null, "负数→null");
eq(M.ipmMmToPx(NaN), null, "NaN→null");
eq(M.ipmMmToPx("25"), null, "字符串→null");

/* ---------- 2. 尺寸预设 ---------- */
var spec = {
    "1inch":    [295, 413, "1寸"],
    "2inch":    [413, 579, "2寸"],
    "small2":   [390, 567, "小2寸"],
    "usvisa":   [600, 600, "美国签证"],
    "passport": [390, 567, "护照"]
};
Object.keys(spec).forEach(function (k) {
    var p = M.ipmPreset(k);
    ok(!!p, "预设存在 " + k);
    eq(p.pxW, spec[k][0], k + " 宽 " + spec[k][2]);
    eq(p.pxH, spec[k][1], k + " 高 " + spec[k][2]);
    eq(p.label, spec[k][2], k + " 标签");
});
eq(M.ipmPreset("bogus"), null, "未知预设→null");
/* 宽高比锁定 */
approx(M.ipmAspect("1inch"), 295 / 413, 1e-9, "1寸宽高比 295/413");
approx(M.ipmAspect("2inch"), 413 / 579, 1e-9, "2寸宽高比 413/579");
approx(M.ipmAspect("usvisa"), 1, 1e-9, "美签宽高比 1:1");
eq(M.ipmAspect("bogus"), null, "未知预设宽高比→null");
/* 相纸 */
eq(M.ipmPaper("5inch").pxW, 1500, "5寸纸宽 1500");
eq(M.ipmPaper("5inch").pxH, 1050, "5寸纸高 1050");
eq(M.ipmPaper("6inch").pxW, 1800, "6寸纸宽 1800");
eq(M.ipmPaper("6inch").pxH, 1200, "6寸纸高 1200");
eq(M.ipmPaper("bogus"), null, "未知相纸→null");

/* ---------- 3. 相纸排版（margin 60 / gap 30，与页面一致） ---------- */
function layout(paperKey, presetKey) {
    var paper = M.ipmPaper(paperKey), p = M.ipmPreset(presetKey);
    return M.ipmLayout(paper.pxW, paper.pxH, p.pxW, p.pxH, 60, 30);
}
/* 验收：5寸 1寸 8 张（4列x2行，横版） */
var L = layout("5inch", "1inch");
eq(L.count, 8, "5寸+1寸 → 8张");
eq(L.cols, 4, "5寸+1寸 → 4列");
eq(L.rows, 2, "5寸+1寸 → 2行");
eq(L.portrait, false, "5寸+1寸 → 横版");
eq(L.paperW, 1500, "5寸+1寸 paperW 1500");
eq(L.paperH, 1050, "5寸+1寸 paperH 1050");
eq(L.cells.length, 8, "5寸+1寸 cells 8 格");
/* 首格居中坐标：usedW=4*295+3*30=1270 → x=(1500-1270)/2=115；usedH=2*413+30=856 → y=(1050-856)/2=97 */
eq(L.cells[0].x, 115, "5寸+1寸 首格 x=115");
eq(L.cells[0].y, 97, "5寸+1寸 首格 y=97");
eq(L.cells[0].w, 295, "5寸+1寸 格宽 295");
eq(L.cells[0].h, 413, "5寸+1寸 格高 413");
/* 末格坐标：x=115+3*(295+30)=1090，y=97+(413+30)=540 */
eq(L.cells[7].x, 1090, "5寸+1寸 末格 x=1090");
eq(L.cells[7].y, 540, "5寸+1寸 末格 y=540");

/* 验收：5寸 2寸 4 张（2列x2行，竖版） */
L = layout("5inch", "2inch");
eq(L.count, 4, "5寸+2寸 → 4张");
eq(L.cols, 2, "5寸+2寸 → 2列");
eq(L.rows, 2, "5寸+2寸 → 2行");
eq(L.portrait, true, "5寸+2寸 → 竖版");
eq(L.paperW, 1050, "5寸+2寸 竖版 paperW 1050");
eq(L.paperH, 1500, "5寸+2寸 竖版 paperH 1500");
/* 首格：usedW=2*413+30=856 → x=(1050-856)/2=97；usedH=2*579+30=1188 → y=(1500-1188)/2=156 */
eq(L.cells[0].x, 97, "5寸+2寸 首格 x=97");
eq(L.cells[0].y, 156, "5寸+2寸 首格 y=156");

/* 5寸 小2寸 → 4张（竖版 2x2） */
L = layout("5inch", "small2");
eq(L.count, 4, "5寸+小2寸 → 4张");
eq(L.cols, 2, "5寸+小2寸 → 2列");
eq(L.rows, 2, "5寸+小2寸 → 2行");

/* 5寸 美签 → 2张 */
L = layout("5inch", "usvisa");
eq(L.count, 2, "5寸+美签 → 2张");

/* 6寸 1寸 → 10张（横版 5x2） */
L = layout("6inch", "1inch");
eq(L.count, 10, "6寸+1寸 → 10张");
eq(L.cols, 5, "6寸+1寸 → 5列");
eq(L.rows, 2, "6寸+1寸 → 2行");
eq(L.portrait, false, "6寸+1寸 → 横版");

/* 6寸 2寸 → 4张（竖版 2列x2行） */
L = layout("6inch", "2inch");
eq(L.count, 4, "6寸+2寸 → 4张");
eq(L.cols, 2, "6寸+2寸 → 2列");
eq(L.rows, 2, "6寸+2寸 → 2行");
eq(L.portrait, true, "6寸+2寸 → 竖版");

/* 照片比相纸大 → 0 张 */
L = M.ipmLayout(100, 100, 295, 413, 60, 30);
eq(L.count, 0, "照片大于相纸 → 0张");
eq(L.cells.length, 0, "照片大于相纸 → 无格子");

/* 非法输入 */
eq(M.ipmLayout(0, 1050, 295, 413, 60, 30), null, "相纸宽0 → null");
eq(M.ipmLayout(1500, 1050, 0, 413, 60, 30), null, "照片宽0 → null");
eq(M.ipmLayout(1500, 1050, 295, -413, 60, 30), null, "照片高负 → null");

/* 默认 margin/gap 也可用 */
L = M.ipmLayout(1500, 1050, 295, 413);
ok(L && L.count > 0, "默认边距排版可用");

/* ---------- 4. 背景替换纯函数 ---------- */
/* 距离 */
eq(M.ipmColorDist(255, 255, 255, 255, 255, 255), 0, "同色距离 0");
approx(M.ipmColorDist(255, 0, 0, 0, 0, 0), 255, 1e-6, "红黑距离=255");
approx(M.ipmColorDist(0, 0, 0, 255, 255, 255), M.IPM_MAX_DIST, 1e-6, "黑白距离=最大距离");
approx(M.IPM_MAX_DIST, 441.673, 0.001, "最大距离≈441.673");

/* 容差→阈值 */
eq(M.ipmTolToDist(0), 0, "容差0 → 阈值0");
approx(M.ipmTolToDist(100), M.IPM_MAX_DIST, 1e-9, "容差100 → 最大距离");
approx(M.ipmTolToDist(50), M.IPM_MAX_DIST / 2, 1e-9, "容差50 → 一半");
eq(M.ipmTolToDist(-10), 0, "容差负数钳制 0");
approx(M.ipmTolToDist(200), M.IPM_MAX_DIST, 1e-9, "容差超100钳制");
eq(M.ipmTolToDist(NaN), null, "容差NaN → null");

/* 替换行为：2x2 像素，左上为背景色(200,200,200)，右下为前景(30,30,30) */
function px(r, g, b, a) { return [r, g, b, a === undefined ? 255 : a]; }
var src = new Uint8ClampedArray([].concat(
    px(200, 200, 200), px(200, 200, 200),
    px(200, 200, 200), px(30, 30, 30, 128)
));
var sample = { r: 200, g: 200, b: 200 };
var white = { r: 255, g: 255, b: 255 };

/* 容差 0：只有精确匹配被替换 */
var out = M.ipmReplaceBg(src, 2, 2, sample, 0, white);
ok(out instanceof Uint8ClampedArray, "返回 Uint8ClampedArray");
eq(out[0], 255, "容差0 背景像素R→255");
eq(out[1], 255, "容差0 背景像素G→255");
eq(out[2], 255, "容差0 背景像素B→255");
eq(out[12], 30, "容差0 前景像素R保留");
eq(out[13], 30, "容差0 前景像素G保留");
eq(out[14], 30, "容差0 前景像素B保留");
eq(out[15], 128, "容差0 前景 alpha 保留 128");
eq(out[3], 255, "容差0 背景 alpha 保留 255");

/* 容差 100：全图替换 */
out = M.ipmReplaceBg(src, 2, 2, sample, 100, { r: 255, g: 0, b: 0 });
eq(out[12], 255, "容差100 前景也被替换 R");
eq(out[13], 0, "容差100 前景 G→0");
eq(out[14], 0, "容差100 前景 B→0");
eq(out[15], 128, "容差100 alpha 仍保留");

/* 原数组不被污染 */
eq(src[0], 200, "原数组不被修改");

/* 非法输入 */
eq(M.ipmReplaceBg(null, 2, 2, sample, 30, white), null, "src null → null");
eq(M.ipmReplaceBg(src, 2, 2, null, 30, white), null, "sample null → null");
eq(M.ipmReplaceBg(src, 2, 2, sample, 30, null), null, "target null → null");
eq(M.ipmReplaceBg(src, 2, 2, sample, NaN, white), null, "容差 NaN → null");
eq(M.ipmReplaceBg(new Uint8ClampedArray(4), 2, 2, sample, 30, white), null, "长度不足 → null");
eq(M.ipmReplaceBg(src, 0, 2, sample, 30, white), null, "宽0 → null");

/* ---------- 5. 导出文件名 ---------- */
eq(M.ipmSingleName("1inch"), "证件照_1寸_295x413.jpg", "单张命名 1寸");
eq(M.ipmSingleName("2inch"), "证件照_2寸_413x579.jpg", "单张命名 2寸");
eq(M.ipmSingleName("usvisa"), "证件照_美国签证_600x600.jpg", "单张命名 美签");
eq(M.ipmSingleName("bogus"), null, "未知预设命名 → null");
eq(M.ipmSheetName("5inch"), "证件照_排版_5寸_1500x1050.jpg", "相纸命名 5寸");
eq(M.ipmSheetName("6inch"), "证件照_排版_6寸_1800x1200.jpg", "相纸命名 6寸");
eq(M.ipmSheetName("bogus"), null, "未知相纸命名 → null");

/* ---------- 6. 零 fetch/XHR/上传（源码自检） ---------- */
var jsSrc = fs.readFileSync(path.join(__dirname, "../static/js/id_photo_maker.js"), "utf8");
ok(jsSrc.indexOf("fetch(") === -1, "源码无 fetch(");
ok(jsSrc.indexOf("XMLHttpRequest") === -1, "源码无 XMLHttpRequest");
ok(jsSrc.indexOf("WebSocket") === -1, "源码无 WebSocket");
ok(jsSrc.indexOf("EventSource") === -1, "源码无 EventSource");
ok(jsSrc.indexOf("navigator.sendBeacon") === -1, "源码无 sendBeacon");
ok(!/https?:\/\/(?!www\.johnkingzcq123\.xyz)[a-z0-9]/i.test(jsSrc.replace(/www\.johnkingzcq123\.xyz/g, "")), "源码无外部 URL（canonical 除外在模板）");

console.log("\n通过 " + pass + "，失败 " + fail);
process.exit(fail ? 1 : 0);
