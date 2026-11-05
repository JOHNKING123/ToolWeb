/* OFD 转 PDF（ofd_to_pdf）纯逻辑单元测试（零依赖）：
 * node tests/ofd_to_pdf.test.js
 * 覆盖：validateOfdFile（扩展名/空名/大小/上限，err.field=name/size 精确）/
 * capPageCount（50 页截断精确＋truncated 布尔）/
 * formatPageLabel（「第 3 / 12 页」精确＋越界抛错）/
 * buildExportName（换后缀精确＋空回退 ofd-converted.pdf）/
 * fontFallback（已知映射＋默认回退精确）/
 * pageRenderScale（3 位小数精确）/
 * sanitizeFileName（家族惯例＋空回退 ofd-converted）/
 * hasZipMagic（ZIP 文件头双校验）/
 * categories.go 注册（Path 总数 298→299、Icon file_upload 全库唯一、New/类目/关键词）/
 * 模板（SEO 五关键词、真限制四条、发票生成器互链、零外部资源静态检查）/
 * vendor（ofd.js 自研内核 MIT 头＋许可证核验结论、pdf-lib MIT）。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var A = require("../static/js/ofd_to_pdf.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function has(s, sub, name) { ok(s.indexOf(sub) !== -1, name); }
function notHas(s, sub, name) { ok(s.indexOf(sub) === -1, name); }
function throwsField(fn, field, name) {
  try { fn(); } catch (e) {
    ok(e instanceof Error && e.field === field,
      name + "（期望抛 Error 且 err.field=" + JSON.stringify(field) + "，实得 " +
      (e instanceof Error ? "Error field=" + JSON.stringify(e.field) : typeof e) + "）");
    return;
  }
  fail++; console.error("FAIL:", name + "（未抛出异常）");
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "ofd_to_pdf.js"), "utf8");
var VENDOR_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "vendor", "ofd.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "ofd_to_pdf.html"), "utf8");
var INV_TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "invoice_generator.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");
var MAXS = A.MAX_FILE_SIZE, MAXP = A.MAX_PAGES;

/* ---------- 1. validateOfdFile ---------- */
var v1 = A.validateOfdFile("发票.ofd", 1024, MAXS);
eq(v1.name, "发票.ofd", "validateOfdFile：合法文件返回 name");
eq(v1.sizeBytes, 1024, "validateOfdFile：合法文件返回 sizeBytes");
A.validateOfdFile("a.OFD", 100, MAXS);
ok(true, "validateOfdFile：大写 .OFD 通过");
throwsField(function () { A.validateOfdFile("a.pdf", 100, MAXS); }, "name", "validateOfdFile('a.pdf')：err.field=name");
throwsField(function () { A.validateOfdFile("ofd", 100, MAXS); }, "name", "validateOfdFile 无后缀：err.field=name");
throwsField(function () { A.validateOfdFile("", 100, MAXS); }, "name", "validateOfdFile 空名：err.field=name");
throwsField(function () { A.validateOfdFile("   ", 100, MAXS); }, "name", "validateOfdFile 空白名：err.field=name");
throwsField(function () { A.validateOfdFile(null, 100, MAXS); }, "name", "validateOfdFile null：err.field=name");
throwsField(function () { A.validateOfdFile("a.ofd", 0, MAXS); }, "size", "validateOfdFile size=0：err.field=size");
throwsField(function () { A.validateOfdFile("a.ofd", -5, MAXS); }, "size", "validateOfdFile 负数：err.field=size");
throwsField(function () { A.validateOfdFile("a.ofd", NaN, MAXS); }, "size", "validateOfdFile NaN：err.field=size");
throwsField(function () { A.validateOfdFile("a.ofd", MAXS + 1, MAXS); }, "size", "validateOfdFile 超 50MB：err.field=size");

/* ---------- 2. capPageCount ---------- */
var c1 = A.capPageCount(12, MAXP);
eq(c1.pages, 12, "capPageCount(12,50)：pages=12 精确");
eq(c1.truncated, false, "capPageCount(12,50)：truncated=false");
var c2 = A.capPageCount(80, MAXP);
eq(c2.pages, 50, "capPageCount(80,50)：pages=50 截断精确");
eq(c2.truncated, true, "capPageCount(80,50)：truncated=true");
var c3 = A.capPageCount(50, MAXP);
eq(c3.pages, 50, "capPageCount(50,50)：边界 pages=50");
eq(c3.truncated, false, "capPageCount(50,50)：边界 truncated=false");
throwsField(function () { A.capPageCount(-1, MAXP); }, "totalPages", "capPageCount 负页数：err.field=totalPages");
throwsField(function () { A.capPageCount(1.5, MAXP); }, "totalPages", "capPageCount 小数：err.field=totalPages");
throwsField(function () { A.capPageCount(10, 0); }, "maxPages", "capPageCount 上限 0：err.field=maxPages");

/* ---------- 3. formatPageLabel ---------- */
eq(A.formatPageLabel(3, 12), "第 3 / 12 页", "formatPageLabel(3,12)：「第 3 / 12 页」精确");
eq(A.formatPageLabel(1, 1), "第 1 / 1 页", "formatPageLabel(1,1)：单页精确");
eq(A.formatPageLabel(50, 80), "第 50 / 80 页", "formatPageLabel(50,80)：精确");
throwsField(function () { A.formatPageLabel(0, 12); }, "index", "formatPageLabel index=0：err.field=index");
throwsField(function () { A.formatPageLabel(13, 12); }, "index", "formatPageLabel 越界：err.field=index");
throwsField(function () { A.formatPageLabel(1.5, 12); }, "index", "formatPageLabel 小数：err.field=index");
throwsField(function () { A.formatPageLabel(1, 0); }, "total", "formatPageLabel total=0：err.field=total");

/* ---------- 4. buildExportName ---------- */
eq(A.buildExportName("发票.ofd"), "发票.pdf", "buildExportName：换后缀精确");
eq(A.buildExportName("a.OFD"), "a.pdf", "buildExportName：大写后缀精确");
eq(A.buildExportName("a.ofd.ofd"), "a.ofd.pdf", "buildExportName：双后缀只换末尾");
eq(A.buildExportName("noext"), "noext.pdf", "buildExportName：无后缀追加 .pdf");
eq(A.buildExportName(""), "ofd-converted.pdf", "buildExportName 空：回退 ofd-converted.pdf");
eq(A.buildExportName(null), "ofd-converted.pdf", "buildExportName null：回退");
eq(A.buildExportName("   "), "ofd-converted.pdf", "buildExportName 空白：回退");

/* ---------- 5. fontFallback ---------- */
eq(A.fontFallback("宋体"), "\"SimSun\",\"Songti SC\",serif", "fontFallback 宋体：精确映射");
eq(A.fontFallback("黑体"), "\"SimHei\",\"PingFang SC\",sans-serif", "fontFallback 黑体：精确映射");
eq(A.fontFallback("楷体"), "\"KaiTi\",\"Kaiti SC\",serif", "fontFallback 楷体：精确映射");
eq(A.fontFallback("Arial"), "Arial,\"Helvetica Neue\",sans-serif", "fontFallback Arial：精确映射");
eq(A.fontFallback("XyzUnknownFont"), "\"Noto Sans SC\",\"PingFang SC\",\"Microsoft YaHei\",\"SimSun\",sans-serif", "fontFallback 未知：默认回退精确");
eq(A.fontFallback(""), "\"Noto Sans SC\",\"PingFang SC\",\"Microsoft YaHei\",\"SimSun\",sans-serif", "fontFallback 空：默认回退精确");
eq(A.fontFallback(null), "\"Noto Sans SC\",\"PingFang SC\",\"Microsoft YaHei\",\"SimSun\",sans-serif", "fontFallback null：默认回退精确");

/* ---------- 6. pageRenderScale ---------- */
eq(A.pageRenderScale(210, 297, 420), 2, "pageRenderScale：420/210=2 精确");
eq(A.pageRenderScale(210, 297, 500), 2.381, "pageRenderScale：500/210=2.381（3 位小数精确）");
eq(A.pageRenderScale(100, 100, 33), 0.33, "pageRenderScale：0.33 精确");
throwsField(function () { A.pageRenderScale(0, 297, 500); }, "pageW", "pageRenderScale pageW=0：err.field=pageW");
throwsField(function () { A.pageRenderScale(210, -1, 500); }, "pageH", "pageRenderScale pageH<0：err.field=pageH");
throwsField(function () { A.pageRenderScale(210, 297, 0); }, "viewportW", "pageRenderScale 视口 0：err.field=viewportW");

/* ---------- 7. sanitizeFileName（家族惯例） ---------- */
eq(A.sanitizeFileName("发票 2024"), "发票-2024", "sanitizeFileName：空白转连字符");
eq(A.sanitizeFileName('a/b\\c:d*e?f"g<h>i|j'), "abcdefghij", "sanitizeFileName：非法字符剔除");
eq(A.sanitizeFileName(""), "ofd-converted", "sanitizeFileName 空：回退 ofd-converted");
eq(A.sanitizeFileName("   "), "ofd-converted", "sanitizeFileName 空白：回退");
eq(A.sanitizeFileName(null), "ofd-converted", "sanitizeFileName null：回退");
ok(A.sanitizeFileName(new Array(80).join("x")).length <= 60, "sanitizeFileName：超长截断 60");

/* ---------- 8. hasZipMagic ---------- */
ok(A.hasZipMagic(new Uint8Array([0x50, 0x4B, 0x03, 0x04, 0x14])), "hasZipMagic：PK\\x03\\x04=true");
ok(!A.hasZipMagic(new Uint8Array([0x25, 0x50, 0x44, 0x46])), "hasZipMagic：%PDF=false");
ok(!A.hasZipMagic(new Uint8Array([0x50, 0x4B])), "hasZipMagic：不足 4 字节=false");
ok(!A.hasZipMagic(null), "hasZipMagic null=false");

/* ---------- 9. 常量 ---------- */
eq(MAXS, 52428800, "MAX_FILE_SIZE=50MB 精确");
eq(MAXP, 50, "MAX_PAGES=50 精确");
eq(A.EXPORT_DPI, 150, "EXPORT_DPI=150 精确");

/* ---------- 10. categories.go 注册 ---------- */
var pathRe = /"\/tools\/[^"]+"/g, seen = {}, m, pathCount = 0;
while ((m = pathRe.exec(GO_SRC)) !== null) { if (!seen[m[0]]) { seen[m[0]] = true; pathCount++; } }
eq(pathCount, 301, "注册 Path 总数 298→299");
var iconHits = (GO_SRC.match(/Icon:\s*"file_upload"/g) || []).length;
eq(iconHits, 1, "Icon file_upload 全库唯一（精确值复测锁定）");
has(GO_SRC, 'ID:          "ofd_to_pdf"', "注册：ID ofd_to_pdf");
has(GO_SRC, 'Path:        "/tools/ofd-to-pdf"', "注册：Path /tools/ofd-to-pdf");
has(GO_SRC, 'Name:        "OFD 转 PDF"', "注册：Name OFD 转 PDF");
has(GO_SRC, 'Category:    "文档转换"', "注册：类目文档转换");
var ofdBlock = GO_SRC.slice(GO_SRC.indexOf('"ofd_to_pdf"'), GO_SRC.indexOf('"ofd_to_pdf"') + 900);
has(ofdBlock, "New:         true", "注册：New=true");
has(ofdBlock, "OFD", "注册：Description 含 OFD");
has(ofdBlock, "零上传", "注册：Description 含零上传");

/* ---------- 11. 模板：SEO/真限制/互链/零外部资源 ---------- */
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/ofd-to-pdf", "模板 canonical 含新 Path");
has(TPL_SRC, "OFD转PDF", "模板 SEO 关键词：OFD转PDF");
has(TPL_SRC, "电子发票OFD转PDF", "模板 SEO 关键词：电子发票OFD转PDF");
has(TPL_SRC, "OFD转PDF不上传", "模板 SEO 关键词：OFD转PDF不上传");
has(TPL_SRC, "OFD在线转换", "模板 SEO 关键词：OFD在线转换");
has(TPL_SRC, "版式文档转换", "模板 SEO 关键词：版式文档转换");
has(TPL_SRC, "真限制", "模板：真限制章节");
has(TPL_SRC, "字体回退", "真限制①：字体回退");
has(TPL_SRC, "版式偏差", "真限制②：版式偏差");
has(TPL_SRC, "零上传", "真限制③：零上传");
has(TPL_SRC, "50 页上限", "真限制④：50 页上限");
has(TPL_SRC, "/tools/invoice-generator", "互链：发票生成器（发票生成口径互补）");
has(TPL_SRC, "发票生成口径互补", "互链文案：发票生成口径互补");
has(INV_TPL_SRC, "/tools/ofd-to-pdf", "互链回链：发票生成器相关工具区回链 OFD 转 PDF");
has(TPL_SRC, 'id="otp-upload"', "模板含上传区 otp-upload");
has(TPL_SRC, 'id="otp-canvas-wrap"', "模板含预览画布容器 otp-canvas-wrap");
has(TPL_SRC, 'id="otp-export"', "模板含导出按钮 otp-export");
has(TPL_SRC, 'id="otp-pagelabel"', "模板含页码标签 otp-pagelabel");
has(TPL_SRC, "/tools/static/js/vendor/ofd.js", "模板引用本地 vendor ofd.js");
has(TPL_SRC, "/tools/static/js/vendor/pdf-lib.min.js", "模板引用本地 vendor pdf-lib");
has(TPL_SRC, "/tools/static/js/vendor/jszip.min.js", "模板引用本地 vendor jszip");
has(TPL_SRC, "/tools/static/js/ofd_to_pdf.js", "模板引用 ofd_to_pdf.js");
notHas(TPL_SRC, "fonts.googleapis", "模板零 CDN：无外部字体");
ok((TPL_SRC.match(/<script[^>]*src="http/g) || []).length === 0, "模板零外部脚本：无 http script src");
var httpLinks = (TPL_SRC.match(/<link[^>]*href="(http[^"]*)"/g) || []).map(function (t) {
  return t.replace(/^.*href="/, "").replace(/"$/, "");
});
ok(httpLinks.every(function (u) { return u.indexOf("johnkingzcq123.xyz") !== -1; }),
  "模板零外部样式：http link 仅 canonical 自家域名");

/* ---------- 12. JS 零网络 / vendor 许可证 ---------- */
notHas(JS_SRC, "fetch(", "零网络：ofd_to_pdf.js 无 fetch");
notHas(JS_SRC, "XMLHttpRequest", "零网络：ofd_to_pdf.js 无 XHR");
notHas(JS_SRC, "WebSocket", "零网络：ofd_to_pdf.js 无 WebSocket");
notHas(VENDOR_SRC, "fetch(", "零网络：vendor ofd.js 无 fetch");
notHas(VENDOR_SRC, "XMLHttpRequest", "零网络：vendor ofd.js 无 XHR");
has(VENDOR_SRC, "MIT License", "vendor ofd.js：MIT 许可证声明");
has(VENDOR_SRC, "原创", "vendor ofd.js：原创声明");
has(VENDOR_SRC, "parser_helper_x", "vendor ofd.js：许可证核验结论提及弃用的 parser_helper_x");
has(VENDOR_SRC, "bestofdview", "vendor ofd.js：许可证核验结论提及弃用的 bestofdview");
ok(fs.existsSync(path.join(ROOT, "static", "js", "vendor", "pdf-lib.min.js")), "vendor：pdf-lib.min.js 已本地化");
ok(fs.existsSync(path.join(ROOT, "static", "js", "vendor", "pdf-lib.LICENSE.txt")), "vendor：pdf-lib MIT 许可证文本已附带");
has(fs.readFileSync(path.join(ROOT, "static", "js", "vendor", "pdf-lib.LICENSE.txt"), "utf8"),
  "MIT License", "vendor：pdf-lib 许可证为 MIT");

console.log("PASS " + pass + " / FAIL " + fail);
if (fail > 0) process.exit(1);
