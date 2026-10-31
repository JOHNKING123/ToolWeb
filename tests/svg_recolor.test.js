/* SVG 换色器纯逻辑单元测试（零依赖）：node tests/svg_recolor.test.js
 * 覆盖：颜色解析／归一化／HSL 互转／色调偏移／提取／上下文限定替换／消毒／校验／导出名／注册与零网络静态检查 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/svg_recolor.js");
var pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; } else { fail++; console.error("FAIL:", name); } }
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function deepEq(a, b, name) { eq(JSON.stringify(a), JSON.stringify(b), name); }
function near(a, b, tol, name) { ok(Math.abs(a - b) <= tol, name + "（期望 " + b + "±" + tol + "，实得 " + a + "）"); }
function throws(fn, field, name) {
  try { fn(); ok(false, name + "（应抛错却未抛）"); }
  catch (e) { ok(!field || e.field === field, name + "（field 期望 " + field + "，实得 " + (e && e.field) + "）"); }
}
var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "svg_recolor.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "svg_recolor.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* 1. parseColor 已知值 */
deepEq(M.parseColor("#f00"), { r: 255, g: 0, b: 0, a: 1 }, "#f00 缩写展开");
deepEq(M.parseColor("#FF0000"), { r: 255, g: 0, b: 0, a: 1 }, "#FF0000 大写");
deepEq(M.parseColor("#ff0000"), { r: 255, g: 0, b: 0, a: 1 }, "#ff0000");
var half = M.parseColor("#ff000080");
eq(half.r, 255, "#ff000080 r"); eq(half.g, 0, "#ff000080 g"); eq(half.b, 0, "#ff000080 b");
near(half.a, 128 / 255, 1e-9, "#ff000080 alpha=128/255");
deepEq(M.parseColor("rgb(255, 0, 0)"), { r: 255, g: 0, b: 0, a: 1 }, "rgb() 红");
deepEq(M.parseColor("rgba(0, 128, 0, 0.5)"), { r: 0, g: 128, b: 0, a: 0.5 }, "rgba() 半透明绿");
deepEq(M.parseColor("red"), { r: 255, g: 0, b: 0, a: 1 }, "命名色 red");
deepEq(M.parseColor("RED"), { r: 255, g: 0, b: 0, a: 1 }, "命名色不区分大小写 RED");
deepEq(M.parseColor("transparent"), { r: 0, g: 0, b: 0, a: 0 }, "transparent");
deepEq(M.parseColor("  #00ff00  "), { r: 0, g: 255, b: 0, a: 1 }, "首尾空白容忍");
deepEq(M.parseColor("teal"), { r: 0, g: 128, b: 128, a: 1 }, "命名色 teal");
deepEq(M.parseColor("silver"), { r: 192, g: 192, b: 192, a: 1 }, "命名色 silver");
/* 1b. parseColor 失败向量 */
throws(function () { M.parseColor("currentColor"); }, "color", "currentColor 判失败");
throws(function () { M.parseColor("url(#g)"); }, "color", "url() 判失败");
throws(function () { M.parseColor("none"); }, "color", "none 判失败");
throws(function () { M.parseColor("inherit"); }, "color", "inherit 判失败");
throws(function () { M.parseColor("rebeccapurple"); }, "color", "未知命名色判失败");
throws(function () { M.parseColor("grey"); }, "color", "grey 不在 16 基础色内判失败");
throws(function () { M.parseColor("rgb(256, 0, 0)"); }, "color", "rgb 越界判失败");
throws(function () { M.parseColor("rgb(-1, 0, 0)"); }, "color", "rgb 负值判失败");
throws(function () { M.parseColor("rgb(1.5, 0, 0)"); }, "color", "rgb 非整数判失败");
throws(function () { M.parseColor("rgba(0, 0, 0, 1.5)"); }, "color", "rgba alpha 越界判失败");
throws(function () { M.parseColor("rgba(0, 0, 0)"); }, "color", "rgba 缺 alpha 判失败");
throws(function () { M.parseColor("#ggg"); }, "color", "非法 HEX 字符判失败");
throws(function () { M.parseColor("#12345"); }, "color", "HEX 长度不对判失败");
throws(function () { M.parseColor(""); }, "color", "空串判失败");
throws(function () { M.parseColor(null); }, "color", "非字符串判失败");
throws(function () { M.parseColor("var(--c)"); }, "color", "var() 判失败");

/* 2. toCanonical */
eq(M.toCanonical({ r: 255, g: 0, b: 0, a: 1 }), "#ff0000", "不透明归一化小写");
eq(M.toCanonical({ r: 255, g: 0, b: 0, a: 0.5 }), "#ff000080", "半透明 a×255 四舍五入");
eq(M.toCanonical({ r: 0, g: 0, b: 0, a: 0 }), "#00000000", "全透明归一化");
eq(M.toCanonical(M.parseColor("#f00")), "#ff0000", "#f00→规范形往返");
eq(M.toCanonical(M.parseColor("#ff000080")), "#ff000080", "#rrggbbaa 往返");
throws(function () { M.toCanonical({ r: 256, g: 0, b: 0, a: 1 }); }, "color", "toCanonical 越界失败");
throws(function () { M.toCanonical({ r: 1.5, g: 0, b: 0, a: 1 }); }, "color", "toCanonical 非整数失败");
throws(function () { M.toCanonical({ r: 0, g: 0, b: 0, a: 1.5 }); }, "color", "toCanonical alpha 越界失败");

/* 3. HSL 互转 */
deepEq(M.rgbToHsl(255, 0, 0), { h: 0, s: 100, l: 50 }, "纯红 HSL");
deepEq(M.rgbToHsl(0, 255, 0), { h: 120, s: 100, l: 50 }, "纯绿 HSL");
deepEq(M.rgbToHsl(128, 128, 128), { h: 0, s: 0, l: 50 }, "灰色 HSL s=0");
deepEq(M.rgbToHsl(255, 255, 255), { h: 0, s: 0, l: 100 }, "纯白 HSL");
deepEq(M.rgbToHsl(0, 0, 0), { h: 0, s: 0, l: 0 }, "纯黑 HSL");
deepEq(M.hslToRgb(0, 100, 50), { r: 255, g: 0, b: 0 }, "HSL 红");
deepEq(M.hslToRgb(120, 100, 50), { r: 0, g: 255, b: 0 }, "HSL 绿");
deepEq(M.hslToRgb(0, 0, 50), { r: 128, g: 128, b: 128 }, "HSL 灰");
deepEq(M.hslToRgb(360, 100, 50), { r: 255, g: 0, b: 0 }, "h=360 等同 0");
throws(function () { M.rgbToHsl(256, 0, 0); }, "color", "rgbToHsl 越界失败");
throws(function () { M.hslToRgb(361, 100, 50); }, "color", "hslToRgb h 越界失败");
throws(function () { M.hslToRgb(0, 101, 50); }, "color", "hslToRgb s 越界失败");
throws(function () { M.hslToRgb(0, 100, -1); }, "color", "hslToRgb l 越界失败");

/* 4. shiftHue */
eq(M.shiftHue("#ff0000", 120), "#00ff00", "红+120°→绿");
eq(M.shiftHue("#ff0000", -120), "#0000ff", "红-120°→蓝");
eq(M.shiftHue("#ff0000", 180), "#00ffff", "红+180°→青");
eq(M.shiftHue("#808080", 120), "#808080", "灰色偏移不变");
eq(M.shiftHue("#808080", -180), "#808080", "灰色 -180° 不变");
eq(M.shiftHue(M.shiftHue("#ff0000", 180), -180), "#ff0000", "±180° 往返回原色");
eq(M.shiftHue("red", 120), "#00ff00", "命名色输入可偏移");
eq(M.shiftHue({ r: 255, g: 0, b: 0, a: 0.5 }, 120), "#00ff0080", "带透明偏移保留 alpha");
throws(function () { M.shiftHue("#ff0000", 181); }, "degrees", "偏移 181° 失败");
throws(function () { M.shiftHue("#ff0000", -181); }, "degrees", "偏移 -181° 失败");
throws(function () { M.shiftHue("#ff0000", 0.5); }, "degrees", "偏移非整数失败");
throws(function () { M.shiftHue("#ff0000", "90"); }, "degrees", "偏移非数字失败");

/* 5. extractColors */
var SAMPLE = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">' +
  '<!-- 注释里的 fill="#ff0000" 不计 -->' +
  '<style>.x{fill:#ff0000;stroke:blue}</style>' +
  '<defs><linearGradient id="g"><stop offset="0" stop-color="#ff0000"/><stop offset="1" stop-color="blue"/></linearGradient></defs>' +
  '<rect id="red" x="0" y="0" width="10" height="10" fill="#ff0000"/>' +
  '<circle cx="20" cy="20" r="5" fill="red" stroke="#0000ff"/>' +
  '<path d="M0 0" fill="url(#g)" stroke="currentColor"/>' +
  '<ellipse cx="40" cy="40" rx="5" ry="5" fill="none" stroke="rebeccapurple"/>' +
  '<text x="5" y="90" fill="#0000ff">fill="#ff0000" 文本不计</text>' +
  '<g style="fill: #00ff00; stroke: inherit"><rect x="1" y="1" width="2" height="2" fill="#00ff00"/></g>' +
  '</svg>';
var ext = M.extractColors(SAMPLE);
eq(ext.palette.length, 3, "提取 3 种颜色");
eq(ext.palette[0].color, "#ff0000", "首色为出现最多的 #ff0000");
eq(ext.palette[0].count, 3, "#ff0000 计数 3（rect＋stop＋circle 的 red）");
eq(ext.palette[1].color, "#0000ff", "次色 #0000ff");
eq(ext.palette[1].count, 3, "#0000ff 计数 3（stroke＋stop 的 blue＋text fill）");
eq(ext.palette[2].color, "#00ff00", "第三色 #00ff00");
eq(ext.palette[2].count, 2, "#00ff00 计数 2（内联 style＋rect）");
ok(ext.palette[0].count >= ext.palette[1].count && ext.palette[1].count >= ext.palette[2].count, "色板按数量降序");
eq(ext.skipped, 5, "跳过数 5（url＋currentColor＋none＋未知命名色＋内联 style 的 inherit）");
var tie = M.extractColors('<svg><rect fill="red"/><rect fill="blue"/><rect fill="red"/><rect fill="blue"/></svg>');
deepEq(tie.palette, [{ color: "#ff0000", count: 2 }, { color: "#0000ff", count: 2 }], "并列按首次出现顺序");
eq(M.extractColors('<svg><rect fill="red"/></svg>').skipped, 0, "无跳过时 skipped=0");
throws(function () { M.extractColors(""); }, "svg", "提取空串失败");
throws(function () { M.extractColors(null); }, "svg", "提取非字符串失败");

/* 6. replaceColors：仅上下文内替换 */
var SRC = '<svg><rect id="red" fill="#ff0000"/><!-- fill="#ff0000" --><style>.x{fill:#ff0000}</style>' +
  '<text fill="#0000ff">#ff0000 文本</text><path fill="url(#g)" stroke="#ff0000"/>' +
  '<g style="fill: #ff0000; stroke: #0000ff"><rect fill="#ff0000"/></g></svg>';
var rep = M.replaceColors(SRC, { "#ff0000": "#00ff00" });
eq(rep.replaced, 4, "替换计数 4（rect＋path stroke＋style 声明＋内层 rect）");
ok(rep.svg.indexOf('id="red"') >= 0, "id 原样保留");
ok(rep.svg.indexOf('<!-- fill="#ff0000" -->') >= 0, "注释原样保留");
ok(rep.svg.indexOf('<style>.x{fill:#ff0000}</style>') >= 0, "style 块原样保留");
ok(rep.svg.indexOf('>#ff0000 文本</text>') >= 0, "文本内容原样保留");
ok(rep.svg.indexOf('fill="url(#g)"') >= 0, "url 引用原样保留");
ok(rep.svg.indexOf('stroke: #0000ff') >= 0, "未映射颜色不动（内联 style 中的 stroke）");
ok(rep.svg.indexOf('fill="#00ff00"') >= 0, "映射颜色已替换");
ok(rep.svg.indexOf('style="fill: #00ff00; stroke: #0000ff"') >= 0, "内联 style 声明已替换");
var rep2 = M.replaceColors('<svg><rect fill="RED" stroke="red"/></svg>', { "red": "#00ff00" });
eq(rep2.replaced, 2, "命名色键归一化后替换");
eq(rep2.svg, '<svg><rect fill="#00ff00" stroke="#00ff00"/></svg>', "命名色替换结果");
throws(function () { M.replaceColors(SRC, { "notacolor": "#00ff00" }); }, "mapping", "非法 mapping 键失败");
throws(function () { M.replaceColors(SRC, { "#ff0000": "zzz" }); }, "mapping", "非法 mapping 值失败");
throws(function () { M.replaceColors(SRC, null); }, "mapping", "mapping 非对象失败");
throws(function () { M.replaceColors("", { "#ff0000": "#00ff00" }); }, "svg", "替换空串失败");
eq(M.replaceColors(SRC, {}).replaced, 0, "空 mapping 零替换");

/* 7. applyHueShift */
var hs = M.applyHueShift('<svg><rect fill="#ff0000"/><circle fill="#808080"/></svg>', 120);
eq(hs.mapping["#ff0000"], "#00ff00", "色调偏移 mapping 红→绿");
eq(hs.mapping["#808080"], "#808080", "色调偏移 mapping 灰不变");
eq(hs.replaced, 2, "色调偏移替换计数");
ok(hs.svg.indexOf('#00ff00') >= 0 && hs.svg.indexOf('#808080') >= 0, "色调偏移结果 SVG");
throws(function () { M.applyHueShift('<svg/>', 200); }, "degrees", "applyHueShift 非法度数失败");

/* 8. sanitizeSvg */
var dirty = '<svg><script>alert(1)</script><rect fill="#ff0000" onclick="evil()" onload="x"/>' +
  '<a href="javascript:alert(1)"><text>hi</text></a><a xlink:href="https://example.com">ok</a></svg>';
var clean = M.sanitizeSvg(dirty);
ok(clean.indexOf('<script') < 0, "script 标签已剥离");
ok(clean.indexOf('alert(1)') < 0, "script 与 javascript: 内容已清除");
ok(clean.indexOf('onclick') < 0 && clean.indexOf('onload') < 0, "on* 属性已剥离");
ok(clean.indexOf('href="#"') >= 0, "javascript: 链接改写为 #");
ok(clean.indexOf('xlink:href="https://example.com"') >= 0, "正常链接保留");
ok(clean.indexOf('fill="#ff0000"') >= 0, "正常属性保留");
throws(function () { M.sanitizeSvg(""); }, "svg", "消毒空串失败");

/* 9. validateSvgInput 与导出名 */
ok(M.validateSvgInput('<svg></svg>').ok, "合法 SVG 通过");
ok(!M.validateSvgInput('').ok, "空串失败");
ok(!M.validateSvgInput('<div></div>').ok, "无 svg 标签失败");
ok(!M.validateSvgInput('<svgx></svgx>').ok, "svgx 不算 svg 标签");
ok(!M.validateSvgInput(new Array(2 * 1024 * 1024 + 2).join('x')).ok, "超 2MB 失败");
ok(M.validateSvgInput('<svg>' + new Array(2 * 1024 * 1024 - 11 + 1).join(' ') + '</svg>').ok, "恰 2MB 通过");
eq(M.suggestExportName(), "recolored.svg", "导出文件名固定 recolored.svg");

/* 10. 注册与静态检查 */
ok(GO_SRC.indexOf('"svg_recolor"') >= 0, "categories.go 注册 ID");
ok(GO_SRC.indexOf('"/tools/svg-recolor"') >= 0, "categories.go 注册 Path");
ok(GO_SRC.indexOf('Icon:        "format_color_fill"') >= 0, "categories.go Icon format_color_fill");
ok(GO_SRC.indexOf('Category:    "图片处理"') >= 0, "categories.go 图片处理品类");
var paths = GO_SRC.match(/"\/tools\/[^"]+"/g) || [];
var uniq = {}; paths.forEach(function (p) { uniq[p] = true; });
eq(Object.keys(uniq).length, 246, "注册总数→246 Path（历史遗留陈旧断言同步）");
ok(TPL_SRC.indexOf('id="svgr-input"') >= 0, "模板含 SVG 输入框");
ok(TPL_SRC.indexOf('id="svgr-drop"') >= 0, "模板含上传拖拽区");
ok(TPL_SRC.indexOf('id="svgr-palette"') >= 0, "模板含色板区");
ok(TPL_SRC.indexOf('id="svgr-hue"') >= 0, "模板含色调滑杆");
ok(TPL_SRC.indexOf('id="svgr-orig"') >= 0, "模板含原图预览");
ok(TPL_SRC.indexOf('id="svgr-new"') >= 0, "模板含换色后预览");
ok(TPL_SRC.indexOf('id="svgr-sample"') >= 0, "模板含载入示例");
ok(TPL_SRC.indexOf('id="svgr-restore"') >= 0, "模板含恢复原图");
ok(TPL_SRC.indexOf("/tools/svg-compressor") >= 0, "互链 SVG 压缩优化器");
ok(TPL_SRC.indexOf("/tools/svg-to-font") >= 0, "互链 SVG 转字体");
ok(TPL_SRC.indexOf("/tools/image-color-picker") >= 0, "互链图片取色器");
ok(TPL_SRC.indexOf("clip-path") < 0 && TPL_SRC.indexOf("Flexbox") < 0, "不链未交付工具");
ok(TPL_SRC.indexOf("只改行内属性与内联 style") >= 0, "真限制：只改行内与内联 style");
ok(TPL_SRC.indexOf("渐变引用本身不动、只改色标") >= 0, "真限制：渐变引用不动只改色标");
ok(TPL_SRC.indexOf("只认 16 个 CSS 基础色") >= 0, "真限制：命名色只认 16 基础色");
ok(TPL_SRC.indexOf("不收集、不上传") >= 0, "真限制：不收集不上传");
ok(JS_SRC.indexOf("fetch(") < 0 && JS_SRC.indexOf("XMLHttpRequest") < 0, "JS 零 fetch/XHR");
ok(TPL_SRC.indexOf("fonts.googleapis.com") < 0 && TPL_SRC.indexOf("cdn.") < 0, "模板零 CDN");

console.log("PASS " + pass + " FAIL " + fail);
process.exit(fail ? 1 : 0);
