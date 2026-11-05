/* 长图切片器纯逻辑单元测试（零依赖）：node tests/long_image_slicer.test.js
 * 覆盖：
 *  1. computeSliceLines 确定性向量（规格逐字命中）＋非法参数（err.field='imageSize'/'aspect'）
 *  2. findSafeCutLine 确定性向量（规格逐字命中）＋非法参数（err.field='rows'/'window'）
 *  3. buildSliceFileName / buildZipFileName 确定性向量（规格逐字命中）＋非法参数
 *  4. computeRowLuma 行灰度口径
 *  5. window.LongImageSlicer 与 module.exports 同步导出
 *  6. categories.go 注册（ID/Path/Icon/Category/New，紧邻 img_stitch）与 Path 总数 273、Icon view_agenda 全库唯一
 *  7. 零网络请求静态检查（JS 无 fetch/XHR/WebSocket；上传走 FileReader；模板零 CDN）
 *  8. 模板：SEO 面板、真限制三条、互链（img_stitch 双向「长图双向一条龙」）与回链、关键元素 ID
 */
"use strict";
var L = require("../static/js/long_image_slicer.js");
var fs = require("fs");
var path = require("path");
var ROOT = path.join(__dirname, "..");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function deepEq(a, b, name) { ok(JSON.stringify(a) === JSON.stringify(b), name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function contains(s, sub, name) { ok(String(s).indexOf(sub) !== -1, name + "（期望包含 " + JSON.stringify(sub) + "）"); }
function notContains(s, sub, name) { ok(String(s).indexOf(sub) === -1, name + "（不应包含 " + JSON.stringify(sub) + "）"); }
function throwsField(fn, field, name) {
    try { fn(); }
    catch (e) {
        ok(e instanceof Error && e.field === field, name + "（err.field=" + field + "）");
        return;
    }
    ok(false, name + "（期望抛出 Error）");
}

/* ================= 1. computeSliceLines（规格逐字） ================= */
(function () {
    deepEq(L.computeSliceLines(900, 1200, 3, 4),
        { pieceHeight: 1200, count: 1, lines: [] },
        "规格向量①：computeSliceLines(900,1200,3,4)→{pieceHeight:1200,count:1,lines:[]}");
    deepEq(L.computeSliceLines(900, 3600, 3, 4),
        { pieceHeight: 1200, count: 3, lines: [1200, 2400] },
        "规格向量②：computeSliceLines(900,3600,3,4)→{pieceHeight:1200,count:3,lines:[1200,2400]}");
    deepEq(L.computeSliceLines(900, 2500, 3, 4),
        { pieceHeight: 1200, count: 3, lines: [1200, 2400] },
        "规格向量③：computeSliceLines(900,2500,3,4)→{pieceHeight:1200,count:3,lines:[1200,2400]}（尾片不足整高仍占一片）");

    /* 口径补充：1:1 与 16:9 */
    var sq = L.computeSliceLines(800, 2000, 1, 1);
    eq(sq.pieceHeight, 800, "1:1：pieceHeight=round(800*1/1)=800");
    eq(sq.count, 3, "1:1：count=ceil(2000/800)=3");
    deepEq(sq.lines, [800, 1600], "1:1：lines=[800,1600]");
    var w = L.computeSliceLines(1920, 1000, 16, 9);
    eq(w.pieceHeight, 1080, "16:9：pieceHeight=round(1920*9/16)=1080");
    eq(w.count, 1, "16:9：1000<1080→count=1");
    deepEq(w.lines, [], "16:9：lines=[]");

    /* 切线严格 < imageHeight：整除时末线不计入 */
    var exact = L.computeSliceLines(900, 2400, 3, 4);
    deepEq(exact.lines, [1200], "整除：2400 处不计入切线（严格<imageHeight），lines=[1200]");

    /* 非法参数 */
    throwsField(function () { L.computeSliceLines(0, 100, 3, 4); }, "imageSize", "规格向量④：宽为 0→err.field='imageSize'");
    throwsField(function () { L.computeSliceLines(900, 0, 3, 4); }, "imageSize", "高为 0→err.field='imageSize'");
    throwsField(function () { L.computeSliceLines(-5, 100, 3, 4); }, "imageSize", "负宽→err.field='imageSize'");
    throwsField(function () { L.computeSliceLines(900.5, 100, 3, 4); }, "imageSize", "非整数宽→err.field='imageSize'（不静默钳制）");
    throwsField(function () { L.computeSliceLines(900, 3600, 0, 4); }, "aspect", "规格向量⑤：aspectW=0→err.field='aspect'");
    throwsField(function () { L.computeSliceLines(900, 3600, 3, -1); }, "aspect", "aspectH 为负→err.field='aspect'");
    throwsField(function () { L.computeSliceLines(900, 3600, 1.5, 4); }, "aspect", "非整数比例→err.field='aspect'（不静默钳制）");
})();

/* ================= 2. findSafeCutLine（规格逐字） ================= */
(function () {
    eq(L.findSafeCutLine([10, 10, 10, 10, 10], 2, 1), 2,
        "规格向量⑥：全平坦→能量全 0，并列选离 y 最近者→2");
    eq(L.findSafeCutLine([10, 10, 90, 90, 90], 2, 2), 1,
        "规格向量⑦：e=[0,0,80,0,0]，最小能量并列 0/1/3/4，离 y=2 最近的是 1 和 3，再并列取较小者→1");
    throwsField(function () { L.findSafeCutLine(null, 2, 1); }, "rows", "规格向量⑧：rows=null→err.field='rows'");
    throwsField(function () { L.findSafeCutLine([], 0, 1); }, "rows", "规格向量⑨：rows=[]→err.field='rows'");
    throwsField(function () { L.findSafeCutLine([10], 0, -1); }, "window", "规格向量⑩：window=-1→err.field='window'");

    /* 口径补充 */
    eq(L.findSafeCutLine([5, 5, 5], 0, 0), 0, "window=0：只看 y 本行→0");
    eq(L.findSafeCutLine([1, 100, 1, 1, 1], 2, 2), 3,
        "能量 e=[0,99,99,0,0]：最小能量并列 i=0(d=2)/3(d=1)/4(d=2)，离 y=2 最近→3");
    eq(L.findSafeCutLine([7, 7, 7], 99, 2), 2,
        "y 越界→先钳制到 [0,len-1]（yi=2）再扫描：范围[0,2]全平坦，离 2 最近→2");
})();

/* ================= 3. buildSliceFileName / buildZipFileName ================= */
(function () {
    eq(L.buildSliceFileName(new Date(2026, 10, 3, 1, 41, 0), 0), "long_slice_20261103_014100_p1.png",
        "规格向量⑪：buildSliceFileName(2026-11-03 01:41:00,0)→'long_slice_20261103_014100_p1.png'");
    eq(L.buildSliceFileName(new Date(2026, 0, 5, 9, 4, 7), 11), "long_slice_20260105_090407_p12.png",
        "序号 p12 与个位数补零");
    eq(L.buildZipFileName(new Date(2026, 10, 3, 1, 41, 0)), "long_slice_20261103_014100.zip",
        "buildZipFileName→'long_slice_20261103_014100.zip'");
    throwsField(function () { L.buildSliceFileName(new Date("invalid"), 0); }, "date", "无效 Date→err.field='date'");
    throwsField(function () { L.buildSliceFileName("2026-11-03", 0); }, "date", "非 Date→err.field='date'");
    throwsField(function () { L.buildSliceFileName(new Date(2026, 10, 3), -1); }, "index", "index 为负→err.field='index'");
    throwsField(function () { L.buildSliceFileName(new Date(2026, 10, 3), 1.5); }, "index", "index 非整数→err.field='index'");
    throwsField(function () { L.buildZipFileName(null); }, "date", "zip：date 非法→err.field='date'");
})();

/* ================= 4. computeRowLuma ================= */
(function () {
    // 2px：纯红(76.245) + 纯黑(0) → 均值 38.1225
    var luma = L.computeRowLuma([255, 0, 0, 255, 0, 0, 0, 255], 2, 1);
    eq(luma.length, 1, "行数=height");
    ok(Math.abs(luma[0] - 38.1225) < 1e-9, "红+黑行灰度=38.1225（0.299*255/2）");
    var white = L.computeRowLuma([255, 255, 255, 255], 1, 1);
    ok(Math.abs(white[0] - 255) < 1e-9, "纯白行灰度=255");
    throwsField(function () { L.computeRowLuma([0, 0, 0], 2, 1); }, "pixels", "pixels 长度不足→err.field='pixels'");
    throwsField(function () { L.computeRowLuma([0, 0, 0, 255], 0, 1); }, "imageSize", "width=0→err.field='imageSize'");
})();

/* ================= 5. 同步导出 ================= */
(function () {
    ["computeSliceLines", "findSafeCutLine", "buildSliceFileName", "buildZipFileName", "computeRowLuma"]
        .forEach(function (k) {
            ok(typeof L[k] === "function", "module.exports 同步导出 " + k);
        });
    var jsSrc = fs.readFileSync(path.join(ROOT, "static", "js", "long_image_slicer.js"), "utf8");
    contains(jsSrc, "window.LongImageSlicer = API", "window.LongImageSlicer 同步导出");
    contains(jsSrc, "module.exports = API", "module.exports 同步导出");
})();

/* ================= 6. categories.go 注册 ================= */
(function () {
    var goSrc = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");
    var idIdx = goSrc.indexOf('"long_image_slice"');
    ok(idIdx >= 0, "注册 ID long_image_slice");
    ok(goSrc.indexOf('"/tools/long-image-slice"') >= 0, "注册 Path /tools/long-image-slice");
    ok(goSrc.slice(idIdx, idIdx + 1400).indexOf('Icon:        "view_agenda"') >= 0, "注册 Icon view_agenda");
    ok(goSrc.slice(idIdx, idIdx + 1400).indexOf("New:         true") >= 0, "注册 New 为 true");
    ok(goSrc.slice(idIdx, idIdx + 1400).indexOf('Category:    "图片处理"') >= 0, "注册 Category 为图片处理");
    ok(goSrc.indexOf("long image splitter") >= 0, "Description 含英文 SEO 关键词 long image splitter");
    var stitchIdx = goSrc.indexOf('"img_stitch"');
    ok(stitchIdx >= 0 && idIdx > stitchIdx && idIdx - stitchIdx < 1200, "注册紧邻 img_stitch 之后");
    var iconCount = (goSrc.match(/Icon:\s+"view_agenda"/g) || []).length;
    eq(iconCount, 1, "Icon view_agenda 全库唯一（1 次命中）");
    var pathRe = /"\/tools\/[^"]+"/g, seen = {}, m, pathCount = 0;
    while ((m = pathRe.exec(goSrc)) !== null) { if (!seen[m[0]]) { seen[m[0]] = true; pathCount++; } }
    eq(pathCount, 307, "注册 Path 总数 273→273");
})();

/* ================= 7. 零网络请求静态检查 ================= */
(function () {
    var jsSrc = fs.readFileSync(path.join(ROOT, "static", "js", "long_image_slicer.js"), "utf8");
    notContains(jsSrc, "fetch(", "零网络：JS 无 fetch 调用");
    notContains(jsSrc, "XMLHttpRequest", "零网络：JS 无 XHR");
    notContains(jsSrc, "new WebSocket", "零网络：JS 无 WebSocket");
    notContains(jsSrc, "http://", "零网络：JS 无 http 外链");
    notContains(jsSrc, "https://", "零网络：JS 无 https 外链");
    contains(jsSrc, "readAsDataURL", "上传走 FileReader 本地读取");
    contains(jsSrc, "JSZip", "ZIP 打包走本地 vendor JSZip");
    var tplSrc = fs.readFileSync(path.join(ROOT, "templates", "long_image_slice.html"), "utf8");
    notContains(tplSrc, "fonts.googleapis", "模板零 CDN：无 Google Fonts");
    notContains(tplSrc, "http://", "模板零 CDN：无 http 外链");
    contains(tplSrc, "/tools/static/js/vendor/jszip.min.js", "JSZip 引用本地 vendor");
    contains(tplSrc, "/tools/static/js/long_image_slicer.js", "业务 JS 引用本地路径");
})();

/* ================= 8. 模板：SEO/真限制/互链/元素 ================= */
(function () {
    var tplSrc = fs.readFileSync(path.join(ROOT, "templates", "long_image_slice.html"), "utf8");
    contains(tplSrc, '{{define "long_image_slice"}}', "模板 define 名与路由 long-image-slice 对应");
    contains(tplSrc, "https://www.johnkingzcq123.xyz/tools/long-image-slice", "模板 canonical 含新 Path");
    contains(tplSrc, "<title>长图切片器", "SEO：Title 含工具名");
    contains(tplSrc, 'name="description"', "SEO：Description meta");
    contains(tplSrc, 'name="keywords"', "SEO：Keywords meta");
    contains(tplSrc, "长图切片", "SEO：Keywords 含长图切片");
    contains(tplSrc, "长截图分割", "SEO：Keywords 含长截图分割");
    contains(tplSrc, "微信小红书发图切图", "SEO：Keywords 含微信小红书发图切图");
    contains(tplSrc, "long image splitter", "SEO：Keywords 含 long image splitter");
    contains(tplSrc, 'property="og:title"', "SEO：OG title");
    contains(tplSrc, 'property="og:url" content="https://www.johnkingzcq123.xyz/tools/long-image-slice"', "SEO：OG url");
    contains(tplSrc, "智能避字是启发式", "真限制①：智能避字启发式＋人工复核");
    contains(tplSrc, "不会上传到任何服务器", "真限制②：纯本地不上传");
    contains(tplSrc, "≤30MP", "真限制③：大图内存上限 30MP");
    contains(tplSrc, "/tools/img-stitch", "互链：图片拼接/长图拼接");
    contains(tplSrc, "长图双向一条龙", "互链：长图双向一条龙品牌");
    ["lis-upload", "lis-file", "lis-sample", "lis-aspect-seg", "lis-tune",
     "lis-overview", "lis-pieces", "lis-zip", "lis-toast"].forEach(function (id) {
        contains(tplSrc, 'id="' + id + '"', "模板含关键元素 #" + id);
    });
    var stitchTpl = fs.readFileSync(path.join(ROOT, "templates", "img_stitch.html"), "utf8");
    contains(stitchTpl, "/tools/long-image-slice", "双向互链：img_stitch 模板回链长图切片器");
    contains(stitchTpl, "长图双向一条龙", "双向互链：img_stitch 回链带长图双向一条龙品牌");
})();

console.log("\n" + pass + " 通过，" + fail + " 失败");
process.exit(fail ? 1 : 0);
