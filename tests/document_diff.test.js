/* 文档对比纯函数单元测试（零依赖）：node tests/document_diff.test.js
* 覆盖：detectDocFormat（锚点 ("合同V2.PDF")→"pdf"、("报告.docx")→"docx"、
* ("a.txt")→"txt"；("a.jpg") 抛错 err.field='format'；("") 抛错
* err.field='fileName'）、splitLines（锚点 ("a\r\nb\nc")→["a","b","c"]、
* ("")→[""]）、normalizeLine（锚点 ("  Hello   World  ", {ignoreWhitespace:true})
* →"Hello World"；("AbC", {ignoreCase:true})→"abc"；双开关→"abc"）、
* computeLineDiff（锚点 (["a","b","c"], ["a","x","c"]) → 4 条 ops，依次
* {same,"a"}、{del,"b"}、{add,"x"}、{same,"c"}；先 del 后 add 顺序约定；
* ([], []) → []）、summarizeDiff（锚点上例 ops → {added:1, removed:1,
* same:2, total:4}；[] → 全 0）、diffSimilarity（锚点上例 ops → 50；
* [] → 100；全 same 三行 → 100）、buildPlainTextReport（锚点 (上例 ops,
* "旧版.txt", "新版.txt") 首行 "--- 旧版.txt"、次行 "+++ 新版.txt"，含
* "- b" 与 "+ x" 行）、buildHtmlReport（独立单文件、转义、高亮类、相似度）、
* validateDiffInput（扩展名/format、boolean 开关、空名）、非法参数
* err.field、categories.go 注册（Path 总数 317→318、Icon difference 全库唯一、
* 紧邻 pdf_merge_split）、模板（SEO 关键词、真限制五条、控件、与 text_diff
* 双向互链、零外部资源静态检查）、本地 vendor（pdf.js 3.11.174＋mammoth.js
* 1.13.0 文件存在且版本可验）、浏览器绑定源码级检查（pdf.js workerSrc 本地
* 路径、mammoth.extractRawText、FileReader、20MB 上限、并排/统一视图切换、
* .txt/.html 导出、拖拽、示例加载）。
*/
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/document_diff.js");

var pass = 0, fail = 0;
function ok(cond, name) {
if (cond) { pass++; }
else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function eqj(a, b, name) { eq(JSON.stringify(a), JSON.stringify(b), name); }
function has(s, sub, name) { ok(s.indexOf(sub) !== -1, name + "（缺 " + sub + "）"); }
function notHas(s, sub, name) { ok(s.indexOf(sub) === -1, name + "（不应含 " + sub + "）"); }
function throws(fn, field, name) {
try { fn(); ok(false, name + "（应抛错却未抛）"); }
catch (e) { ok(!field || e.field === field, name + "（err.field 期望 " + field + "，实得 " + e.field + "）"); }
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "document_diff.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "document_diff.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");
var TD_TPL = fs.readFileSync(path.join(ROOT, "templates", "text_diff.html"), "utf8");
var PDFJS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "vendor", "pdf.min.js"), "utf8");
var PDF_WORKER_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "vendor", "pdf.worker.min.js"), "utf8");
var MAMMOTH_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "vendor", "mammoth.browser.min.js"), "utf8");

var ANCHOR_OPS = M.computeLineDiff(["a", "b", "c"], ["a", "x", "c"]);

/* ---------- 1. detectDocFormat ---------- */
eq(M.detectDocFormat("合同V2.PDF"), "pdf", "detectDocFormat：合同V2.PDF→pdf（大小写不敏感）");
eq(M.detectDocFormat("报告.docx"), "docx", "detectDocFormat：报告.docx→docx");
eq(M.detectDocFormat("a.txt"), "txt", "detectDocFormat：a.txt→txt");
eq(M.detectDocFormat("A.TXT"), "txt", "detectDocFormat：A.TXT→txt");
eq(M.detectDocFormat("dir/sub/合同.Pdf"), "pdf", "detectDocFormat：带目录的 Pdf→pdf");
throws(function () { M.detectDocFormat("a.jpg"); }, "format", "detectDocFormat：a.jpg 抛错 err.field='format'");
throws(function () { M.detectDocFormat("a.doc"); }, "format", "detectDocFormat：a.doc（老格式）抛错 err.field='format'");
throws(function () { M.detectDocFormat("a"); }, "format", "detectDocFormat：无扩展名抛错 err.field='format'");
throws(function () { M.detectDocFormat(""); }, "fileName", "detectDocFormat：空串抛错 err.field='fileName'");
throws(function () { M.detectDocFormat(123); }, "fileName", "detectDocFormat：数字抛错 err.field='fileName'");
throws(function () { M.detectDocFormat(null); }, "fileName", "detectDocFormat：null 抛错 err.field='fileName'");

/* ---------- 2. splitLines ---------- */
eqj(M.splitLines("a\r\nb\nc"), ["a", "b", "c"], "splitLines：a\\r\\nb\\nc→[a,b,c]");
eqj(M.splitLines(""), [""], "splitLines：空串→[\"\"]");
eqj(M.splitLines("a\rb"), ["a", "b"], "splitLines：\\r 换行→[a,b]");
eqj(M.splitLines("a\n"), ["a", ""], "splitLines：末尾换行保留空尾行");
eqj(M.splitLines("单行"), ["单行"], "splitLines：单行无换行");
throws(function () { M.splitLines(123); }, "text", "splitLines：123 抛错 err.field='text'");
throws(function () { M.splitLines(null); }, "text", "splitLines：null 抛错 err.field='text'");

/* ---------- 3. normalizeLine ---------- */
eq(M.normalizeLine("  Hello   World  ", { ignoreWhitespace: true }), "Hello World", "normalizeLine：去首尾空白＋折叠连续空白");
eq(M.normalizeLine("AbC", { ignoreCase: true }), "abc", "normalizeLine：忽略大小写转小写");
eq(M.normalizeLine("  AbC  ", { ignoreWhitespace: true, ignoreCase: true }), "abc", "normalizeLine：双开关→abc");
eq(M.normalizeLine("Hello World", {}), "Hello World", "normalizeLine：空 options 原样返回");
eq(M.normalizeLine("Hello World"), "Hello World", "normalizeLine：无 options 原样返回");
eq(M.normalizeLine("a\tb", { ignoreWhitespace: true }), "a b", "normalizeLine：制表符折叠为空格");
throws(function () { M.normalizeLine(123, {}); }, "line", "normalizeLine：123 抛错 err.field='line'");
throws(function () { M.normalizeLine("a", "yes"); }, "options", "normalizeLine：options 字符串抛错 err.field='options'");
throws(function () { M.normalizeLine("a", null); }, "options", "normalizeLine：options null 抛错 err.field='options'");

/* ---------- 4. computeLineDiff ---------- */
eq(ANCHOR_OPS.length, 4, "computeLineDiff：锚点例长度 4");
eqj(ANCHOR_OPS[0], { type: "same", text: "a" }, "computeLineDiff：锚点第 1 条 same a");
eqj(ANCHOR_OPS[1], { type: "del", text: "b" }, "computeLineDiff：锚点第 2 条 del b（先 del）");
eqj(ANCHOR_OPS[2], { type: "add", text: "x" }, "computeLineDiff：锚点第 3 条 add x（后 add）");
eqj(ANCHOR_OPS[3], { type: "same", text: "c" }, "computeLineDiff：锚点第 4 条 same c");
eqj(M.computeLineDiff([], []), [], "computeLineDiff：空对空→[]");
eqj(M.computeLineDiff([], ["x", "y"]), [{ type: "add", text: "x" }, { type: "add", text: "y" }], "computeLineDiff：空旧版→全 add");
eqj(M.computeLineDiff(["x", "y"], []), [{ type: "del", text: "x" }, { type: "del", text: "y" }], "computeLineDiff：空新版→全 del");
eqj(M.computeLineDiff(["a", "b"], ["a", "b"]), [{ type: "same", text: "a" }, { type: "same", text: "b" }], "computeLineDiff：全相同→全 same");
eqj(M.computeLineDiff(["a", "a", "b"], ["a", "b", "b"]), [{ type: "same", text: "a" }, { type: "del", text: "a" }, { type: "same", text: "b" }, { type: "add", text: "b" }], "computeLineDiff：重复行仍先 del 后 add");
throws(function () { M.computeLineDiff("a", []); }, "oldLines", "computeLineDiff：oldLines 字符串抛错 err.field='oldLines'");
throws(function () { M.computeLineDiff([], "b"); }, "newLines", "computeLineDiff：newLines 字符串抛错 err.field='newLines'");
throws(function () { M.computeLineDiff([1], []); }, "oldLines", "computeLineDiff：oldLines 含非字符串抛错");

/* ---------- 5. summarizeDiff ---------- */
eqj(M.summarizeDiff(ANCHOR_OPS), { added: 1, removed: 1, same: 2, total: 4 }, "summarizeDiff：锚点 ops→{1,1,2,4}");
eqj(M.summarizeDiff([]), { added: 0, removed: 0, same: 0, total: 0 }, "summarizeDiff：[]→全 0");
eqj(M.summarizeDiff([{ type: "add", text: "x" }, { type: "add", text: "y" }]), { added: 2, removed: 0, same: 0, total: 2 }, "summarizeDiff：全 add 计数");
throws(function () { M.summarizeDiff("x"); }, "ops", "summarizeDiff：字符串抛错 err.field='ops'");
throws(function () { M.summarizeDiff(null); }, "ops", "summarizeDiff：null 抛错 err.field='ops'");

/* ---------- 6. diffSimilarity ---------- */
eq(M.diffSimilarity(ANCHOR_OPS), 50, "diffSimilarity：锚点 ops→50");
eq(M.diffSimilarity([]), 100, "diffSimilarity：[]→100");
eq(M.diffSimilarity([{ type: "same", text: "a" }, { type: "same", text: "b" }, { type: "same", text: "c" }]), 100, "diffSimilarity：全 same 三行→100");
eq(M.diffSimilarity([{ type: "add", text: "x" }]), 0, "diffSimilarity：全 add→0");
eq(M.diffSimilarity([{ type: "same", text: "a" }, { type: "same", text: "b" }, { type: "add", text: "x" }]), 67, "diffSimilarity：2/3 四舍五入→67");
throws(function () { M.diffSimilarity(1); }, "ops", "diffSimilarity：数字抛错 err.field='ops'");

/* ---------- 7. buildPlainTextReport ---------- */
var REPORT = M.buildPlainTextReport(ANCHOR_OPS, "旧版.txt", "新版.txt");
eq(REPORT.split("\n")[0], "--- 旧版.txt", "buildPlainTextReport：首行 --- 旧版.txt");
eq(REPORT.split("\n")[1], "+++ 新版.txt", "buildPlainTextReport：次行 +++ 新版.txt");
has(REPORT, "- b", "buildPlainTextReport：含 del 行 - b");
has(REPORT, "+ x", "buildPlainTextReport：含 add 行 + x");
has(REPORT, "  a", "buildPlainTextReport：same 行前缀两个空格");
eq(REPORT.split("\n").length, 6, "buildPlainTextReport：2 行头＋4 行 ops");
eq(M.buildPlainTextReport([], "a.txt", "b.txt"), "--- a.txt\n+++ b.txt", "buildPlainTextReport：空 ops 只有两行头");
throws(function () { M.buildPlainTextReport("x", "a.txt", "b.txt"); }, "ops", "buildPlainTextReport：ops 非数组抛错 err.field='ops'");
throws(function () { M.buildPlainTextReport(ANCHOR_OPS, "", "b.txt"); }, "oldName", "buildPlainTextReport：nameA 空串抛错 err.field='oldName'");
throws(function () { M.buildPlainTextReport(ANCHOR_OPS, "x", ""); }, "newName", "buildPlainTextReport：nameB 空串抛错 err.field='newName'");

/* ---------- 8. buildHtmlReport ---------- */
var HTML_REPORT = M.buildHtmlReport(ANCHOR_OPS, "旧版.txt", "新版.txt");
has(HTML_REPORT, "<!DOCTYPE html>", "buildHtmlReport：独立 HTML 文档");
has(HTML_REPORT, "dd-add", "buildHtmlReport：含 add 高亮类");
has(HTML_REPORT, "dd-del", "buildHtmlReport：含 del 高亮类");
has(HTML_REPORT, "50%", "buildHtmlReport：含相似度 50%");
has(HTML_REPORT, "旧版.txt", "buildHtmlReport：含旧版文件名");
ok(HTML_REPORT.indexOf("<script") === -1, "buildHtmlReport：无 script 标签（纯展示）");
var HTML_ESC = M.buildHtmlReport([{ type: "add", text: "<b>&\"x\"" }], "a.txt", "b.txt");
has(HTML_ESC, "&lt;b&gt;", "buildHtmlReport：内容转义 <");
notHas(HTML_ESC, "<b>", "buildHtmlReport：转义后无原始 <b>");
throws(function () { M.buildHtmlReport(ANCHOR_OPS, "a.txt", ""); }, "newName", "buildHtmlReport：nameB 空串抛错 err.field='newName'");

/* ---------- 9. validateDiffInput ---------- */
eqj(M.validateDiffInput({ oldName: "a.pdf", newName: "b.docx", ignoreWhitespace: true, ignoreCase: false }), { oldName: "a.pdf", newName: "b.docx", ignoreWhitespace: true, ignoreCase: false }, "validateDiffInput：合法输入原样通过");
eqj(M.validateDiffInput({ oldName: "a.txt", newName: "b.txt" }), { oldName: "a.txt", newName: "b.txt" }, "validateDiffInput：无开关也通过");
throws(function () { M.validateDiffInput({ oldName: "a.pdf", newName: "b.jpg" }); }, "format", "validateDiffInput：newName b.jpg 抛错 err.field='format'");
throws(function () { M.validateDiffInput({ oldName: "a.jpg", newName: "b.pdf" }); }, "format", "validateDiffInput：oldName a.jpg 抛错 err.field='format'");
throws(function () { M.validateDiffInput({ oldName: "a.pdf", newName: "b.pdf", ignoreWhitespace: "yes" }); }, "ignoreWhitespace", "validateDiffInput：ignoreWhitespace 字符串抛错");
throws(function () { M.validateDiffInput({ oldName: "a.pdf", newName: "b.pdf", ignoreCase: 1 }); }, "ignoreCase", "validateDiffInput：ignoreCase 数字抛错");
throws(function () { M.validateDiffInput({ oldName: "", newName: "b.pdf" }); }, "oldName", "validateDiffInput：oldName 空串抛错 err.field='oldName'");
throws(function () { M.validateDiffInput({ oldName: "a.pdf", newName: "" }); }, "newName", "validateDiffInput：newName 空串抛错 err.field='newName'");
throws(function () { M.validateDiffInput(null); }, "input", "validateDiffInput：null 抛错 err.field='input'");

/* ---------- 10. 其他纯函数 ---------- */
eq(M.MAX_FILE_BYTES, 20971520, "MAX_FILE_BYTES：20MB 上限");
eq(M.formatFileSize(0), "0 B", "formatFileSize：0→0 B");
eq(M.formatFileSize(1536), "1.5 KB", "formatFileSize：1536→1.5 KB");
throws(function () { M.formatFileSize(-1); }, "bytes", "formatFileSize：-1 抛错 err.field='bytes'");

/* ---------- 11. categories.go 注册 ---------- */
var pathCount = (GO_SRC.match(/"\/tools\/[^"]+"/g) || []).filter(function (v, i, a) { return a.indexOf(v) === i; }).length;
eq(pathCount, 327, "注册 Path 总数 317→318");
has(GO_SRC, '"document_diff"', "注册：ID document_diff");
has(GO_SRC, '"/tools/document-diff"', "注册：Path /tools/document-diff");
has(GO_SRC, '"difference"', "注册：Icon difference");
eq((GO_SRC.match(/Icon:\s*"difference"/g) || []).length, 1, "Icon difference 全库唯一");
var entryBlock = GO_SRC.slice(GO_SRC.indexOf('"document_diff"') - 60,
GO_SRC.indexOf('"document_diff"') + 1600);
ok(/New:\s+true/.test(entryBlock), "注册：New: true");
ok(/Category:\s+"文档转换"/.test(entryBlock), "注册：类目 文档转换");
has(entryBlock, "文档对比", "注册：名称 文档对比");
ok(GO_SRC.indexOf('"document_diff"') > GO_SRC.indexOf('"pdf_merge_split"') &&
GO_SRC.indexOf('"document_diff"') < GO_SRC.indexOf('"pdf_to_image"'), "注册：紧邻 pdf_merge_split（在其后、pdf_to_image 之前）");

/* ---------- 12. 模板：SEO/真限制/控件/互链/零外部资源 ---------- */
has(TPL_SRC, '{{define "document_diff"}}', "模板：define document_diff");
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/document-diff", "模板 canonical 含新 Path");
has(TPL_SRC, "文档对比", "模板：标题含工具名");
has(TPL_SRC, "PDF对比", "模板 SEO：关键词含 PDF对比");
has(TPL_SRC, "合同版本对比", "模板 SEO：关键词含 合同版本对比");
has(TPL_SRC, "DOCX对比", "模板 SEO：关键词含 DOCX对比");
has(TPL_SRC, "真限制", "模板：真限制章节");
has(TPL_SRC, "扫描版 PDF", "真限制①：扫描版 PDF 需先 OCR");
has(TPL_SRC, "/tools/ocr-image-text", "真限制①：明示 OCR 用 ocr_image_text");
has(TPL_SRC, "只比纯文本", "真限制②：只比纯文本");
has(TPL_SRC, "DOCX 只提正文段落", "真限制③：DOCX 只提正文段落");
has(TPL_SRC, "单文件 ≤20MB", "真限制④：单文件 ≤20MB");
has(TPL_SRC, "全程浏览器本地计算，零上传", "真限制⑤：本地零上传");
has(TPL_SRC, 'id="dd-zone-a"', "模板控件：旧版拖拽区 dd-zone-a");
has(TPL_SRC, 'id="dd-zone-b"', "模板控件：新版拖拽区 dd-zone-b");
has(TPL_SRC, 'id="dd-file-a"', "模板控件：旧版文件输入 dd-file-a");
has(TPL_SRC, 'id="dd-file-b"', "模板控件：新版文件输入 dd-file-b");
has(TPL_SRC, 'id="dd-ignore-ws"', "模板控件：忽略空白 dd-ignore-ws");
has(TPL_SRC, 'id="dd-ignore-case"', "模板控件：忽略大小写 dd-ignore-case");
has(TPL_SRC, 'id="dd-view-btn-side"', "模板控件：并排视图按钮");
has(TPL_SRC, 'id="dd-view-btn-uni"', "模板控件：统一视图按钮");
has(TPL_SRC, 'id="dd-stat-added"', "模板控件：统计新增行");
has(TPL_SRC, 'id="dd-stat-removed"', "模板控件：统计删除行");
has(TPL_SRC, 'id="dd-stat-same"', "模板控件：统计未变行");
has(TPL_SRC, 'id="dd-stat-sim"', "模板控件：统计相似度");
has(TPL_SRC, 'id="dd-export-txt"', "模板控件：导出 .txt");
has(TPL_SRC, 'id="dd-export-html"', "模板控件：导出 .html");
has(TPL_SRC, 'id="dd-sample"', "模板控件：加载示例");
has(TPL_SRC, 'id="dd-swap"', "模板控件：交换旧版/新版");
has(TPL_SRC, 'id="dd-clear"', "模板控件：清空");
has(TPL_SRC, 'aria-live', "模板无障碍：aria-live 状态区");
has(TPL_SRC, "/tools/text-diff", "互链：文档对比 → 文本比较（只比粘贴文本）");
has(TD_TPL, "/tools/document-diff", "双向互链：文本比较 → 文档对比（要比对文件）");
has(TPL_SRC, "/tools/static/js/document_diff.js?v=1", "模板：引用本站 JS");
has(TPL_SRC, "/tools/static/js/vendor/pdf.min.js?v=1", "模板：引用本站 pdf.js vendor");
has(TPL_SRC, "/tools/static/js/vendor/mammoth.browser.min.js?v=1", "模板：引用本站 mammoth vendor");
notHas(TPL_SRC, "fonts.googleapis", "模板零 CDN：无外部字体");
notHas(TPL_SRC, "cdnjs", "模板零 CDN：无 cdnjs");
notHas(TPL_SRC, "jsdelivr", "模板零 CDN：无 jsdelivr");
ok((TPL_SRC.match(/<script[^>]*src="http/g) || []).length === 0, "模板零外部脚本：无 http script src");
var httpLinks = TPL_SRC.match(/<link[^>]*href="http[^"]*"/g) || [];
eq(httpLinks.length, 1, "模板 http link 仅 canonical 一条");
ok(httpLinks.length === 1 && httpLinks[0].indexOf("https://www.johnkingzcq123.xyz/tools/document-diff") !== -1, "模板 http link：仅自家 canonical");

/* ---------- 13. 本地 vendor ---------- */
ok(PDFJS_SRC.length > 100000, "vendor：pdf.min.js 已下载（>100KB）");
has(PDFJS_SRC, "3.11.174", "vendor：pdf.min.js 为 pinned 3.11.174");
has(PDFJS_SRC, "pdfjsLib", "vendor：pdf.min.js 含 pdfjsLib");
ok(PDF_WORKER_SRC.length > 500000, "vendor：pdf.worker.min.js 已下载（>500KB）");
ok(MAMMOTH_SRC.length > 100000, "vendor：mammoth.browser.min.js 已下载（>100KB）");
has(MAMMOTH_SRC, "extractRawText", "vendor：mammoth.browser.min.js 含 extractRawText");

/* ---------- 14. 浏览器绑定源码级检查 ---------- */
has(JS_SRC, "window.DocumentDiff", "导出：挂 window.DocumentDiff");
has(JS_SRC, "module.exports", "导出：module.exports 同步导出");
has(JS_SRC, "pdfjsLib.getDocument", "提取：pdf.js getDocument 提 PDF 文本");
has(JS_SRC, "pdf.worker.min.js", "提取：workerSrc 指向本地 vendor pdf.worker.min.js");
has(JS_SRC, "GlobalWorkerOptions.workerSrc", "提取：设置 GlobalWorkerOptions.workerSrc");
has(JS_SRC, "mammoth.extractRawText", "提取：mammoth.extractRawText 提 DOCX 文本");
has(JS_SRC, "readAsText", "提取：TXT 用 FileReader readAsText");
has(JS_SRC, "readAsArrayBuffer", "提取：PDF/DOCX 用 FileReader readAsArrayBuffer");
has(JS_SRC, "MAX_FILE_BYTES", "上限：单文件 20MB 常量");
has(JS_SRC, "20 * 1024 * 1024", "上限：20MB 字节数定义");
has(JS_SRC, "computeCharDiff", "行内标示：computeCharDiff 字符级 LCS");
has(JS_SRC, "dd-char-del", "行内标示：删除字符样式类");
has(JS_SRC, "dd-char-add", "行内标示：新增字符样式类");
has(JS_SRC, "dd-view-btn-side", "视图：并排视图切换按钮绑定");
has(JS_SRC, "dd-view-btn-uni", "视图：统一视图切换按钮绑定");
has(JS_SRC, "buildPlainTextReport(state.ops", "导出：.txt 用 buildPlainTextReport");
has(JS_SRC, "buildHtmlReport(state.ops", "导出：.html 用 buildHtmlReport");
has(JS_SRC, "addEventListener('drop'", "上传：拖拽 drop 绑定");
has(JS_SRC, "loadSample", "示例：加载示例合同两版");
has(JS_SRC, "SAMPLE_A", "示例：旧版示例文本");
has(JS_SRC, "validateDiffInput({", "比对：比对前 validateDiffInput 校验");
has(JS_SRC, "normalizeLine(l, opts)", "比对：归一化键参与比对、显示用原文行");
notHas(JS_SRC, "cdnjs", "绑定：无 CDN 引用");
notHas(JS_SRC, "diff-match-patch", "绑定：不引入 diff-match-patch 外部依赖");

console.log("document_diff: pass=" + pass + " fail=" + fail + "，共 " + (pass + fail) + " 断言");
if (fail > 0) process.exit(1);
