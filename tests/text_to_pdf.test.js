/* 文本转 PDF 纯逻辑单元测试（零依赖）：node tests/text_to_pdf.test.js
 * 覆盖：PM 确定性向量（逐字命中）、XSS 转义、字数统计口径、
 * 排版配置校验（err.field 定位）、注册与零网络请求静态检查。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/text_to_pdf.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function deepEq(a, b, name) { ok(JSON.stringify(a) === JSON.stringify(b), name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
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
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "text_to_pdf.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "text_to_pdf.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. escapeHtml ---------- */
eq(M.escapeHtml("<script>alert(1)</script>"), "&lt;script&gt;alert(1)&lt;/script&gt;", "escapeHtml 转义 script 标签");
eq(M.escapeHtml('a&b"c\'d'), "a&amp;b&quot;c&#39;d", "escapeHtml 转义 & \" '");
eq(M.escapeHtml("普通文本"), "普通文本", "escapeHtml 普通文本不变");

/* ---------- 2. countChars 确定性向量 ---------- */
deepEq(M.countChars("abc\n你好"), { chars: 6, lines: 2, words: 2 }, "countChars 中英混排口径向量");
deepEq(M.countChars(""), { chars: 0, lines: 0, words: 0 }, "countChars 空文本");
deepEq(M.countChars("  \n "), { chars: 4, lines: 2, words: 0 }, "countChars 纯空白 words=0");
eq(M.countChars("hello world").words, 2, "countChars 英文两词");
throwsField(function () { M.countChars(123); }, "input", "countChars 非字符串抛错");

/* ---------- 3. pageConfig ---------- */
var def = M.pageConfig();
eq(def.fontSize, "m", "pageConfig 默认 fontSize=m");
eq(def.fontSizePx, 16, "pageConfig 默认 16px");
eq(def.lineHeight, 1.6, "pageConfig 默认行距 1.6");
eq(def.margin, "normal", "pageConfig 默认 margin=normal");
eq(def.marginMm, 20, "pageConfig 默认 20mm");
eq(def.orientation, "portrait", "pageConfig 默认纵向");
eq(def.fontFamily, "sans", "pageConfig 默认 sans");
ok(def.fontFamilyCss.indexOf("PingFang") !== -1, "pageConfig sans 含中文字体栈");
eq(def.header, true, "pageConfig 默认页眉开");
eq(def.avoidBreak, true, "pageConfig 默认防断裂开");
var cfg2 = M.pageConfig({ fontSize: "l", lineHeight: "2.0", margin: "wide", orientation: "landscape", fontFamily: "mono", header: false, avoidBreak: false });
eq(cfg2.fontSizePx, 20, "pageConfig l→20px");
eq(cfg2.lineHeight, 2.0, "pageConfig 字符串行距归一化");
eq(cfg2.marginMm, 30, "pageConfig wide→30mm");
throwsField(function () { M.pageConfig({ orientation: "sideways" }); }, "orientation", "pageConfig orientation 非法");
throwsField(function () { M.pageConfig({ fontSize: "xl" }); }, "fontSize", "pageConfig fontSize 非法");
throwsField(function () { M.pageConfig({ lineHeight: 1.5 }); }, "lineHeight", "pageConfig lineHeight 非法");
throwsField(function () { M.pageConfig({ margin: "huge" }); }, "margin", "pageConfig margin 非法");
throwsField(function () { M.pageConfig({ fontFamily: "comic" }); }, "fontFamily", "pageConfig fontFamily 非法");
throwsField(function () { M.pageConfig({ header: "yes" }); }, "header", "pageConfig header 非布尔抛错");
throwsField(function () { M.pageConfig({ avoidBreak: 1 }); }, "avoidBreak", "pageConfig avoidBreak 非布尔抛错");

/* ---------- 4. buildPrintDoc 确定性向量 ---------- */
var V1 = {
  title: "会议纪要",
  body: "第一项\n第二项",
  opts: { fontSize: "m", lineHeight: 1.6, margin: "normal", orientation: "portrait", fontFamily: "sans", header: true }
};
var d1 = M.buildPrintDoc(V1);
eq(M.buildPrintDoc(V1), d1, "buildPrintDoc 确定性：同输入两次输出一致");
ok(d1.indexOf('<h1 class="tp-doc-title">会议纪要</h1>') !== -1, "向量1：含转义标题 <h1>");
ok(d1.indexOf('<p class="tp-doc-p" style="break-inside:avoid;">第一项</p>') !== -1, "向量1：第一段 <p>");
ok(d1.indexOf('<p class="tp-doc-p" style="break-inside:avoid;">第二项</p>') !== -1, "向量1：第二段 <p>");
ok(d1.indexOf("@page{size:A4 portrait;margin:20mm;}") !== -1, "向量1：@page 纵向声明");
ok(d1.indexOf("font-size:16px") !== -1, "向量1：字号 m→16px");
ok(d1.indexOf("line-height:1.6") !== -1, "向量1：行距 1.6");

/* XSS 向量 */
var dx = M.buildPrintDoc({ title: "<script>alert(1)</script>", body: "x" });
ok(dx.indexOf("<script>") === -1, "XSS 向量：输出无裸 <script>");
ok(dx.indexOf("&lt;script&gt;alert(1)&lt;/script&gt;") !== -1, "XSS 向量：标题转义为 &lt;script&gt;");
var dx2 = M.buildPrintDoc({ title: "t", body: '<img src=x onerror=alert(2)>&"' });
ok(dx2.indexOf("<img") === -1, "XSS 向量：正文 img 标签被转义");
ok(dx2.indexOf("&lt;img") !== -1, "XSS 向量：正文转义命中");

/* 空 body 抛错 */
throwsField(function () { M.buildPrintDoc({ title: "t", body: "   \n " }); }, "input", "buildPrintDoc 空 body 抛错");
throwsField(function () { M.buildPrintDoc({}); }, "input", "buildPrintDoc 缺 body 抛错");
throwsField(function () { M.buildPrintDoc({ title: "t", body: 42 }); }, "input", "buildPrintDoc 非法 body 抛错");

/* 选项逐项生效 */
var dl = M.buildPrintDoc({ title: "t", body: "x", opts: { orientation: "landscape", margin: "wide", fontSize: "l", lineHeight: 2.0, fontFamily: "serif" } });
ok(dl.indexOf("@page{size:A4 landscape;margin:30mm;}") !== -1, "选项生效：横向＋宽边距 @page");
ok(dl.indexOf("font-size:20px") !== -1, "选项生效：字号 l→20px");
ok(dl.indexOf("line-height:2") !== -1, "选项生效：行距 2.0");
ok(dl.indexOf("SimSun") !== -1, "选项生效：衬线字体栈");
var dnh = M.buildPrintDoc({ title: "t", body: "x", opts: { header: false } });
ok(dnh.indexOf("<h1") === -1, "页眉关闭：无 <h1>");
var dnb = M.buildPrintDoc({ title: "t", body: "x", opts: { avoidBreak: false } });
ok(dnb.indexOf("break-inside") === -1, "防断裂关闭：无 break-inside");
var dd = M.buildPrintDoc({ title: "t", body: "x", date: "2026-10-30" });
ok(dd.indexOf('<p class="tp-doc-date">2026-10-30</p>') !== -1, "日期页眉：date 显式传入才渲染");
ok(d1.indexOf("tp-doc-date") === -1, "日期页眉：未传 date 不渲染（确定性）");
var dempty = M.buildPrintDoc({ title: "t", body: "a\n\nb" });
ok(dempty.indexOf('<p class="tp-doc-p tp-doc-empty"') !== -1, "空行保留为空段落");

/* ---------- 5. 双模式导出 ---------- */
["escapeHtml", "countChars", "pageConfig", "buildPrintDoc"]
  .forEach(function (k) { ok(typeof M[k] === "function", "导出函数 " + k); });

/* ---------- 6. 注册 ---------- */
ok(/ID:\s*"text_to_pdf"/.test(GO_SRC), "categories.go 注册 ID text_to_pdf");
ok(/Path:\s*"\/tools\/text-to-pdf"/.test(GO_SRC), "categories.go 注册 Path /tools/text-to-pdf");
ok(/ID:\s*"text_to_pdf"[\s\S]{0,800}?Category:\s*"文本工具"/.test(GO_SRC), "text_to_pdf 归属文本工具品类");
ok(/ID:\s*"text_to_pdf"[\s\S]{0,800}?New:\s*true/.test(GO_SRC), "text_to_pdf New:true");
ok(/ID:\s*"text_to_pdf"[\s\S]{0,800}?Icon:\s*"text_snippet"/.test(GO_SRC), "text_to_pdf Icon text_snippet");
ok(/{{define "text_to_pdf"}}/.test(TPL_SRC), "模板 define text_to_pdf");
ok(/https:\/\/www\.johnkingzcq123\.xyz\/tools\/text-to-pdf/.test(TPL_SRC), "模板 canonical");
var paths = GO_SRC.match(/"\/tools\/[^"]+"/g) || [];
ok(new Set(paths).size === 228, "全量 Path 数 228（实得 " + new Set(paths).size + "）");
ok(new Set(paths.map(function (p) { return p; })).has('"/tools/text-to-pdf"'), "Path 集合含 /tools/text-to-pdf");

/* ---------- 7. 零网络请求静态检查 ---------- */
ok(!/fetch\s*\(/.test(JS_SRC), "JS 无 fetch");
ok(!/XMLHttpRequest/.test(JS_SRC), "JS 无 XMLHttpRequest");
ok(!/WebSocket/.test(JS_SRC), "JS 无 WebSocket");
ok(!/<script[^>]*src\s*=\s*"https?:\/\//.test(TPL_SRC), "模板无外部 script");
ok(!/<link[^>]*rel\s*=\s*"stylesheet"[^>]*href\s*=\s*"https?:\/\//.test(TPL_SRC), "模板无外部样式");
ok(!/fetch\s*\(|XMLHttpRequest/.test(TPL_SRC), "模板无 fetch/XHR");
ok(!/(?<![\w"'])fetch\s*\(/.test(TPL_SRC), "模板无 fetch 调用");
ok(/window\.print\(\)/.test(TPL_SRC) || /window\.print\(\)/.test(JS_SRC), "打印按钮调用 window.print()");

/* ---------- 8. 真限制明示与互链 ---------- */
ok(/另存为 PDF/.test(TPL_SRC), "页面明示「另存为 PDF」");
ok(/非一键/.test(TPL_SRC), "页面明示非一键直下");
ok(/@media print/.test(TPL_SRC), "模板含 @media print");
ok(/tp-screen/.test(TPL_SRC), "模板有打印隐藏标记类");
ok(/\/tools\/doc-to-pdf/.test(TPL_SRC), "模板互链 DOC 转 PDF");
ok(/\/tools\/text-tools/.test(TPL_SRC), "模板互链文本工具集");
ok(/\/tools\/text-diff/.test(TPL_SRC), "模板互链文本比较");
ok(!/\/tools\/map/.test(TPL_SRC), "互链不含未交付的 MAP 工具");

console.log("text_to_pdf: pass=" + pass + " fail=" + fail);
process.exit(fail ? 1 : 0);
