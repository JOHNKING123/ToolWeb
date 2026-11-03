/* 打印机测试页生成器（printer_test_page）纯逻辑单元测试（零依赖）：
 * node tests/printer_test_page.test.js
 * 覆盖：mmToPx 确定性向量（mmToPx(100)→377.95）与非法参数抛 Error
 * （err.field="mm"）、cmykToRgb 确定性向量（(0,100,100,0)→{r:255,g:0,b:0}）
 * 与非法参数（err.field="c"/"m"/"y"/"k"）、getPaperSize 确定性向量
 * （'a4'→{w:210,h:297,label:'A4'}）与非法参数（err.field="spec"）、
 * buildScaleTicks 确定性向量（(100,10)→[0..100 step10] 逐字）与非法参数
 * （err.field="lengthMm"/"stepMm"）、pageSizeCss 向量与非法参数
 * （err.field="paperKey"/"orientation"）、pngFileName 向量与非法参数
 * （err.field="label"/"date"）、categories.go 注册（Path 总数 249→250、
 * ID printer_test_page、Path /tools/printer-test-page、Icon print、
 * 生活工具、New、中英文 Description）、模板 SEO 面板／真限制三条／
 * @media print 仅输出测试页／@page 跟随规格／window.print()／PNG 下载命名／
 * 相关工具单向链入信封打印助手／零网络请求静态检查。
 */
"use strict";
var fs = require("fs");
var path = require("path");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function deepEq(a, b, name) { eq(JSON.stringify(a), JSON.stringify(b), name); }
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

var M = require("../static/js/printer-test-page.js");
var ROOT = path.join(__dirname, "..");

/* ---------- 1. mmToPx 确定性向量（规格逐字） ---------- */
eq(M.mmToPx(100), 377.95, "规格向量：mmToPx(100)→377.95（96dpi）");
eq(M.mmToPx(0), 0, "向量：mmToPx(0)→0");
eq(M.mmToPx(25.4), 96, "向量：mmToPx(25.4)→96（1 英寸）");
eq(M.mmToPx(210), 793.7, "向量：mmToPx(210)→793.7（A4 宽）");
eq(M.mmToPx(1), 3.78, "向量：mmToPx(1)→3.78");
throwsField(function () { M.mmToPx("100"); }, "mm", "非法：字符串抛 Error（err.field=mm）");
throwsField(function () { M.mmToPx(NaN); }, "mm", "非法：NaN 抛 Error（err.field=mm）");
throwsField(function () { M.mmToPx(-1); }, "mm", "非法：负数抛 Error（err.field=mm）");
throwsField(function () { M.mmToPx(Infinity); }, "mm", "非法：Infinity 抛 Error（err.field=mm）");
throwsField(function () { M.mmToPx(null); }, "mm", "非法：null 抛 Error（err.field=mm）");
throwsField(function () { M.mmToPx(); }, "mm", "非法：缺参数抛 Error（err.field=mm）");

/* ---------- 2. cmykToRgb 确定性向量（规格逐字） ---------- */
deepEq(M.cmykToRgb(0, 100, 100, 0), { r: 255, g: 0, b: 0 },
  "规格向量：cmykToRgb(0,100,100,0)→{r:255,g:0,b:0}（纯红）");
deepEq(M.cmykToRgb(0, 0, 0, 0), { r: 255, g: 255, b: 255 }, "向量：全 0→白色");
deepEq(M.cmykToRgb(0, 0, 0, 100), { r: 0, g: 0, b: 0 }, "向量：K100→黑色");
deepEq(M.cmykToRgb(100, 0, 0, 0), { r: 0, g: 255, b: 255 }, "向量：C100→青色");
deepEq(M.cmykToRgb(0, 100, 0, 0), { r: 255, g: 0, b: 255 }, "向量：M100→品红");
deepEq(M.cmykToRgb(0, 0, 100, 0), { r: 255, g: 255, b: 0 }, "向量：Y100→黄色");
deepEq(M.cmykToRgb(0, 0, 0, 50), { r: 128, g: 128, b: 128 }, "向量：K50→中灰（取整）");
throwsField(function () { M.cmykToRgb(-1, 0, 0, 0); }, "c", "非法：c=-1（err.field=c）");
throwsField(function () { M.cmykToRgb(0, 101, 0, 0); }, "m", "非法：m=101（err.field=m）");
throwsField(function () { M.cmykToRgb(0, 0, "50", 0); }, "y", "非法：y 为字符串（err.field=y）");
throwsField(function () { M.cmykToRgb(0, 0, 0, NaN); }, "k", "非法：k=NaN（err.field=k）");
throwsField(function () { M.cmykToRgb(0, 0, 0); }, "k", "非法：缺 k 参数（err.field=k）");
throwsField(function () { M.cmykToRgb(0, 0, 0, Infinity); }, "k", "非法：k=Infinity（err.field=k）");

/* ---------- 3. getPaperSize 确定性向量（规格逐字） ---------- */
deepEq(M.getPaperSize("a4"), { w: 210, h: 297, label: "A4" },
  "规格向量：getPaperSize('a4')→{w:210,h:297,label:'A4'}");
deepEq(M.getPaperSize("A4"), { w: 210, h: 297, label: "A4" }, "向量：大小写不敏感 'A4'");
deepEq(M.getPaperSize("  a4  "), { w: 210, h: 297, label: "A4" }, "向量：首尾空格 trim");
deepEq(M.getPaperSize("letter"), { w: 215.9, h: 279.4, label: "US Letter" },
  "向量：getPaperSize('letter')→{w:215.9,h:279.4,label:'US Letter'}");
deepEq(M.getPaperSize("Letter"), { w: 215.9, h: 279.4, label: "US Letter" }, "向量：大小写不敏感 'Letter'");
throwsField(function () { M.getPaperSize("a3"); }, "spec", "非法：未知规格 a3（err.field=spec）");
throwsField(function () { M.getPaperSize(""); }, "spec", "非法：空字符串（err.field=spec）");
throwsField(function () { M.getPaperSize("   "); }, "spec", "非法：纯空格（err.field=spec）");
throwsField(function () { M.getPaperSize(null); }, "spec", "非法：null（err.field=spec）");
throwsField(function () { M.getPaperSize(123); }, "spec", "非法：数字（err.field=spec）");

/* ---------- 4. buildScaleTicks 确定性向量（规格逐字） ---------- */
deepEq(M.buildScaleTicks(100, 10), [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
  "规格向量：buildScaleTicks(100,10)→[0..100 step10] 逐字");
deepEq(M.buildScaleTicks(50, 25), [0, 25, 50], "向量：(50,25)→[0,25,50]");
deepEq(M.buildScaleTicks(10, 10), [0, 10], "向量：步长等于总长→[0,10]");
deepEq(M.buildScaleTicks(100, 30), [0, 30, 60, 90, 100], "向量：非整除补末端 (100,30)");
throwsField(function () { M.buildScaleTicks(0, 10); }, "lengthMm", "非法：lengthMm=0（err.field=lengthMm）");
throwsField(function () { M.buildScaleTicks(-5, 10); }, "lengthMm", "非法：lengthMm 负数（err.field=lengthMm）");
throwsField(function () { M.buildScaleTicks("100", 10); }, "lengthMm", "非法：lengthMm 字符串（err.field=lengthMm）");
throwsField(function () { M.buildScaleTicks(NaN, 10); }, "lengthMm", "非法：lengthMm=NaN（err.field=lengthMm）");
throwsField(function () { M.buildScaleTicks(100, 0); }, "stepMm", "非法：stepMm=0（err.field=stepMm）");
throwsField(function () { M.buildScaleTicks(100, -2); }, "stepMm", "非法：stepMm 负数（err.field=stepMm）");
throwsField(function () { M.buildScaleTicks(100, 200); }, "stepMm", "非法：stepMm>lengthMm（err.field=stepMm）");
throwsField(function () { M.buildScaleTicks(100, "10"); }, "stepMm", "非法：stepMm 字符串（err.field=stepMm）");
throwsField(function () { M.buildScaleTicks(100, Infinity); }, "stepMm", "非法：stepMm=Infinity（err.field=stepMm）");

/* ---------- 5. pageSizeCss（@page 跟随规格） ---------- */
eq(M.pageSizeCss("a4", "portrait"), "A4 portrait", "向量：('a4','portrait')→'A4 portrait'");
eq(M.pageSizeCss("a4", "landscape"), "A4 landscape", "向量：('a4','landscape')→'A4 landscape'");
eq(M.pageSizeCss("letter", "portrait"), "letter portrait", "向量：('letter','portrait')→'letter portrait'");
eq(M.pageSizeCss("LETTER", "landscape"), "letter landscape", "向量：大小写不敏感");
throwsField(function () { M.pageSizeCss("a3", "portrait"); }, "paperKey", "非法 paperKey（err.field=paperKey）");
throwsField(function () { M.pageSizeCss("a4", "diagonal"); }, "orientation", "非法 orientation（err.field=orientation）");
throwsField(function () { M.pageSizeCss(null, "portrait"); }, "paperKey", "非法：paperKey=null（err.field=paperKey）");

/* ---------- 6. pngFileName（导出命名） ---------- */
eq(M.pngFileName("A4", new Date(2026, 9, 31, 23, 5, 7)),
  "printer-test-page-A4-20261031-230507.png", "向量：A4 文件名含规格与时间戳");
eq(M.pngFileName("Letter", new Date(2026, 0, 5, 8, 3, 9)),
  "printer-test-page-Letter-20260105-080309.png", "向量：Letter 文件名补零");
throwsField(function () { M.pngFileName("US Letter", new Date()); }, "label", "非法 label（err.field=label）");
throwsField(function () { M.pngFileName("", new Date()); }, "label", "非法：空 label（err.field=label）");
throwsField(function () { M.pngFileName("A4", "2026-10-31"); }, "date", "非法 date 字符串（err.field=date）");
throwsField(function () { M.pngFileName("A4", new Date(NaN)); }, "date", "非法：Invalid Date（err.field=date）");
throwsField(function () { M.pngFileName("A4", null); }, "date", "非法：date=null（err.field=date）");

/* ---------- 7. categories.go 注册 ---------- */
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");
var ptpIdx = GO_SRC.indexOf('"printer_test_page"');
ok(ptpIdx >= 0, "注册：categories.go 含 ID printer_test_page");
ok(GO_SRC.indexOf('"/tools/printer-test-page"') >= 0, "注册 Path /tools/printer-test-page");
ok(GO_SRC.slice(ptpIdx, ptpIdx + 1600).indexOf('Icon:        "print"') >= 0, "注册 Icon print（实测 0 占用）");
ok(GO_SRC.slice(ptpIdx, ptpIdx + 1600).indexOf("New:         true") >= 0, "注册 New 为 true");
ok(GO_SRC.slice(ptpIdx, ptpIdx + 1600).indexOf('Category:    "生活工具"') >= 0, "注册 Category 为生活工具");
ok(GO_SRC.slice(ptpIdx, ptpIdx + 2600).toLowerCase().indexOf("printer test page") >= 0, "Description 中英文双语（含英文）");
ok(GO_SRC.slice(ptpIdx, ptpIdx + 2600).indexOf("打印机测试页") >= 0, "Description 含中文名");
/* 品类归位：生活工具区，countdown-timer 条目之后 */
var cdIdx = GO_SRC.indexOf('"countdown_timer"');
ok(cdIdx >= 0 && ptpIdx > cdIdx, "品类归位：生活工具区 countdown-timer 之后");
var pathRe = /"\/tools\/[^"]+"/g, seen = {}, m, pathCount = 0;
while ((m = pathRe.exec(GO_SRC)) !== null) { if (!seen[m[0]]) { seen[m[0]] = true; pathCount++; } }
eq(pathCount, 280, "注册 Path 总数 268→270");

/* ---------- 8. 模板：SEO／真限制／打印／互链／零网络 ---------- */
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "printer_test_page.html"), "utf8");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "printer-test-page.js"), "utf8");
has(TPL_SRC, '{{define "printer_test_page"}}', "模板 define 名与路由 printer-test-page 对应");
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/printer-test-page", "模板 canonical 含新 Path");
has(TPL_SRC, '"url":"https://www.johnkingzcq123.xyz/tools/printer-test-page"', "模板 JSON-LD 含新 Path");
has(TPL_SRC, "打印机测试页生成器", "模板 SEO：标题含打印机测试页生成器");
has(TPL_SRC, "printer test page", "模板 SEO：含英文 printer test page");
has(TPL_SRC, "printer-test-page.js", "模板引入 printer-test-page.js");
has(TPL_SRC, "不判断硬件故障", "真限制①：不判断硬件故障");
has(TPL_SRC, "打印缩放须 100% / 实际大小", "真限制②：打印缩放须 100%/实际大小");
has(TPL_SRC, "屏显色≠打印色", "真限制③：屏显色≠打印色");
has(TPL_SRC, "@media print", "打印：@media print 仅输出测试页");
has(TPL_SRC, "ptp-print", "打印：打印区 id=ptp-print");
has(TPL_SRC, "@page", "打印：@page 尺寸跟随规格");
has(TPL_SRC, "ptp-page-css", "打印：@page 规则由 JS 动态跟随规格");
has(TPL_SRC, "ptp-print-btn", "打印：模板含打印按钮（JS 侧调用 window.print()）");
has(TPL_SRC, "ptp-canvas", "模板含测试页 canvas");
has(TPL_SRC, "ptp-paper", "模板含纸张规格选择");
has(TPL_SRC, "ptp-orient", "模板含纵向/横向选择");
has(TPL_SRC, "printer-test-page-{A4|Letter}-YYYYMMDD-HHmmss.png", "模板注明 PNG 下载命名口径");
has(TPL_SRC, "CMYK", "模板使用说明含 CMYK");
has(TPL_SRC, "100mm", "模板含 100mm 参考尺说明");
has(TPL_SRC, "/tools/envelope-printer", "相关工具：单向链入信封打印助手");
has(JS_SRC, "window.print()", "JS 打印按钮调用 window.print()");
has(JS_SRC, "buildScaleTicks(100, 10)", "JS 标尺主刻度复用 buildScaleTicks");
has(JS_SRC, "toBlob", "JS PNG 导出走 canvas.toBlob");
notHas(JS_SRC, "fetch(", "零网络：JS 无 fetch 调用");
notHas(JS_SRC, "XMLHttpRequest", "零网络：JS 无 XHR");
notHas(TPL_SRC, "fonts.googleapis", "模板零 CDN");

/* ---------- 汇总 ---------- */
console.log("\n通过 " + pass + "，失败 " + fail);
process.exit(fail === 0 ? 0 : 1);
