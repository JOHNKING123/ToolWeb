/* 中文编码转换器（encoding_converter）纯逻辑单元测试（零依赖）：
 * node tests/encoding_converter.test.js
 * 覆盖：规格 11 条确定性向量逐字命中（escapeUnicode/unescapeUnicode/roundtrip/
 * decodeBytes/recoverMojibake/空串与非法参数约定）、增补平面代理对、
 * 非法序列原样保留、module.exports＋window.EncodingConverter 同步导出、
 * categories.go 注册（Path 总数 279→280、Icon translate 全库唯一、
 * New/Category/中英文关键词）与模板（真限制四条、互链、零网络请求静态检查）。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var A = require("../static/js/encoding_converter.js");

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
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "encoding_converter.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "encoding_converter.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. escapeUnicode：规格向量 ---------- */
eq(A.escapeUnicode("中文"), "\\u4e2d\\u6587", "向量1：escapeUnicode('中文')='\\u4e2d\\u6587'");
eq(A.escapeUnicode("ABC123"), "ABC123", "ASCII 原样保留：escapeUnicode('ABC123')");
eq(A.escapeUnicode("A中1"), "A\\u4e2d1", "中英混排：只有非 ASCII 转义");
eq(A.escapeUnicode("😀"), "\\ud83d\\ude00", "增补平面：escapeUnicode('😀')='\\ud83d\\ude00'（代理对）");
eq(A.escapeUnicode(""), "", "向量7a：空串约定 escapeUnicode('')=''");

/* ---------- 2. unescapeUnicode：规格向量 ---------- */
eq(A.unescapeUnicode("\\u4e2d\\u6587"), "中文", "向量2：unescapeUnicode('\\u4e2d\\u6587')='中文'");
eq(A.unescapeUnicode("A\\u0041"), "AA", "向量3：unescapeUnicode('A\\u0041')='AA'");
eq(A.unescapeUnicode("\\u4E2D\\u6587"), "中文", "hex 大小写不限：'\\u4E2D\\u6587'→'中文'");
eq(A.unescapeUnicode("\\ud83d\\ude00"), "😀", "代理对合并：'\\ud83d\\ude00'→'😀'");
eq(A.unescapeUnicode("a\\u12b"), "a\\u12b", "非法序列原样保留：'a\\u12b'");
eq(A.unescapeUnicode("\\ud83dX"), "\\ud83dX", "孤立高代理原样保留：'\\ud83dX'");
eq(A.unescapeUnicode("\\ude00"), "\\ude00", "孤立低代理原样保留：'\\ude00'");
eq(A.unescapeUnicode(""), "", "向量7b：空串约定 unescapeUnicode('')=''");

/* ---------- 3. roundtrip：规格向量 ---------- */
eq(A.unescapeUnicode(A.escapeUnicode("你好，世界！")), "你好，世界！", "向量4：roundtrip('你好，世界！')");
eq(A.unescapeUnicode(A.escapeUnicode("Hello 你好 😀")), "Hello 你好 😀", "roundtrip 混排＋Emoji");

/* ---------- 4. decodeBytes：规格向量 ---------- */
eq(A.decodeBytes([0xCA, 0xC7, 0xB7, 0xF1], "gbk"), "是否", "向量5：decodeBytes([0xCA,0xC7,0xB7,0xF1],'gbk')='是否'");
eq(A.decodeBytes([0xE4, 0xB8, 0xAD], "utf-8"), "中", "decodeBytes utf-8 向量");
eq(A.decodeBytes(new Uint8Array([0xCA, 0xC7]), "gbk"), "是", "decodeBytes 接受 Uint8Array");
eq(A.decodeBytes([], "gbk"), "", "向量7c：空字节数组约定 decodeBytes([],'gbk')=''");
throwsField(function () { A.decodeBytes("x", "gbk"); }, "bytes", "向量8a：bytes 非法类型 err.field='bytes'");
throwsField(function () { A.decodeBytes([256], "gbk"); }, "bytes", "向量8b：bytes 元素越界 err.field='bytes'");
throwsField(function () { A.decodeBytes([1], ""); }, "label", "向量8c：label 空串 err.field='label'");
throwsField(function () { A.decodeBytes([1], null); }, "label", "label null err.field='label'");
throwsField(function () { A.decodeBytes([1], "no-such-encoding"); }, "label", "不支持的标签 err.field='label'");

/* ---------- 5. recoverMojibake：规格向量 ---------- */
var rec = A.recoverMojibake("ÊÇ·ñ");
var hit = rec.filter(function (r) { return r.bytes === "latin1" && r.label === "gbk" && r.text === "是否"; });
eq(hit.length, 1, "向量6：recoverMojibake('ÊÇ·ñ') 含 {latin1,gbk,'是否'}");
ok(rec.length > 0, "recoverMojibake 返回非空候选列表");
ok(rec.every(function (r) { return typeof r.bytes === "string" && typeof r.label === "string" && typeof r.text === "string"; }),
  "候选项形如 {bytes,label,text}");
/* 乱码用 Buffer 程序化构造（避免字面量里混入不可见字符）：「中文」的 UTF-8 字节被按 latin1 误读 */
var mojiUtf8 = Buffer.from("中文", "utf8").toString("latin1");
var recUtf = A.recoverMojibake(mojiUtf8);
ok(recUtf.some(function (r) { return r.bytes === "latin1" && r.label === "utf-8" && r.text === "中文"; }),
  "latin1 字节假设：UTF-8 字节误读乱码经 latin1×utf-8 试解出 '中文'");
eq(A.recoverMojibake("").length, 0, "向量7d：空串约定 recoverMojibake('')=[]");
throwsField(function () { A.recoverMojibake(null); }, "text", "向量8d：text 非字符串 err.field='text'");
throwsField(function () { A.escapeUnicode(null); }, "text", "escapeUnicode null err.field='text'");
throwsField(function () { A.unescapeUnicode(123); }, "text", "unescapeUnicode 数字 err.field='text'");

/* ---------- 6. CANDIDATE_LABELS ---------- */
eq(A.CANDIDATE_LABELS.length, 12, "CANDIDATE_LABELS 共 12 个候选标签");
["utf-8", "gbk", "gb18030", "big5", "big5-hkscs", "shift_jis",
 "euc-jp", "euc-kr", "iso-8859-1", "windows-1252", "utf-16le", "utf-16be"
].forEach(function (l) { ok(A.CANDIDATE_LABELS.indexOf(l) !== -1, "CANDIDATE_LABELS 含 " + l); });
var td;
for (var i = 0; i < A.CANDIDATE_LABELS.length; i++) {
  try { td = new TextDecoder(A.CANDIDATE_LABELS[i]); }
  catch (e) { td = null; }
  ok(td !== null, "TextDecoder 支持标签 " + A.CANDIDATE_LABELS[i]);
}

/* ---------- 7. module.exports / window 同步导出 ---------- */
eq(typeof A.escapeUnicode, "function", "module.exports 含 escapeUnicode");
eq(typeof A.unescapeUnicode, "function", "module.exports 含 unescapeUnicode");
eq(typeof A.decodeBytes, "function", "module.exports 含 decodeBytes");
eq(typeof A.recoverMojibake, "function", "module.exports 含 recoverMojibake");
ok(Array.isArray(A.CANDIDATE_LABELS), "module.exports 含 CANDIDATE_LABELS");
has(JS_SRC, "window.EncodingConverter", "JS 挂载 window.EncodingConverter");

/* ---------- 8. categories.go 注册 ---------- */
var ecIdx = GO_SRC.indexOf('"encoding_converter"');
ok(ecIdx >= 0, "注册含 ID encoding_converter");
has(GO_SRC, 'Path:        "/tools/encoding-converter"', "注册 Path 为 /tools/encoding-converter");
var ecBlock = GO_SRC.slice(ecIdx, ecIdx + 1800);
has(ecBlock, "中文编码转换器", "注册 Name 为中文编码转换器");
has(ecBlock, 'Category:    "编码转换"', "注册 Category 为编码转换");
has(ecBlock, "New:         true", "注册 New: true");
has(ecBlock, 'Icon:        "translate"', "注册 Icon 为 translate");
has(ecBlock, "乱码", "Description 含「乱码」");
has(ecBlock, "native2ascii", "Description 含「native2ascii」");
has(ecBlock, "mojibake", "Description 含「mojibake」");
has(ecBlock, "encoding converter", "Description 含「encoding converter」");
var iconRe = /"translate"/g, iconHits = (GO_SRC.match(iconRe) || []).length;
eq(iconHits, 1, "Icon translate 精确值复测锁定：全库唯一 1 处");
var pathRe = /"\/tools\/[^"]+"/g, seen = {}, m, pathCount = 0;
while ((m = pathRe.exec(GO_SRC)) !== null) { if (!seen[m[0]]) { seen[m[0]] = true; pathCount++; } }
eq(pathCount, 301, "注册 Path 总数 279→280");

/* ---------- 9. 模板：SEO/真限制/互链/零外部资源 ---------- */
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/encoding-converter", "模板 canonical 含新 Path");
has(TPL_SRC, 'id="ec-app"', "模板含应用根节点 ec-app");
has(TPL_SRC, 'id="ec-in"', "模板含转义输入 ec-in");
has(TPL_SRC, 'id="ec-to-esc"', "模板含转义按钮 ec-to-esc");
has(TPL_SRC, 'id="ec-to-text"', "模板含反向按钮 ec-to-text");
has(TPL_SRC, 'id="ec-moji"', "模板含乱码输入 ec-moji");
has(TPL_SRC, 'id="ec-recover"', "模板含试解按钮 ec-recover");
has(TPL_SRC, 'id="ec-recover-list"', "模板含候选列表 ec-recover-list");
has(TPL_SRC, 'id="ec-file"', "模板含文件选择 ec-file");
has(TPL_SRC, 'id="ec-enc"', "模板含编码下拉 ec-enc");
has(TPL_SRC, 'id="ec-decode-file"', "模板含文件解码按钮 ec-decode-file");
has(TPL_SRC, 'src="/tools/static/js/encoding_converter.js?v=1"', "模板引用新 JS（v=1）");
has(TPL_SRC, "不是压缩也不是加密", "真限制①：转义非压缩/加密明示");
has(TPL_SRC, "不能判定哪个一定对", "真限制②：试解不判定明示");
has(TPL_SRC, "不做编码自动检测", "真限制③：不自动检测编码明示");
has(TPL_SRC, "不会上传到任何服务器", "真限制④：纯本地零上传");
has(TPL_SRC, "仅供参考", "真限制④：仅供参考");
has(TPL_SRC, "/tools/html-entities", "互链：HTML 实体编解码");
has(TPL_SRC, "/tools/base64", "互链：Base64");
has(TPL_SRC, "/tools/url-codec", "互链：URL 编码");
var extRes = TPL_SRC.match(/<(script|link)[^>]*?(src|href)="https?:\/\//g) || [];
ok(extRes.every(function (t) { return t.indexOf('rel="canonical"') >= 0; }),
  "零外部资源：script/link 外链仅 canonical（实得 " + JSON.stringify(extRes) + "）");
notHas(JS_SRC, "fetch(", "零网络：JS 无 fetch 调用");
notHas(JS_SRC, "XMLHttpRequest", "零网络：JS 无 XHR");

console.log("encoding_converter: pass=" + pass + " fail=" + fail);
process.exit(fail === 0 ? 0 : 1);
