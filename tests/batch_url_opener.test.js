/* 网址批量打开工具（batch_url_opener）纯逻辑单元测试（零依赖）：
 * node tests/batch_url_opener.test.js
 * 覆盖：打开策略常量（5/600ms/30 确认阈值）、parseUrlList 确定性向量逐值命中
 * （空串、裸域名补 scheme、重复合并、无效行 reason、行号正确）、行内抽取、
 * 末尾标点剥离、空行跳过、CRLF、不支持协议、dedupeUrls 去重与透传、
 * 非法参数抛 Error 的 err.field、categories.go 注册（Path 总数 246→246、
 * Icon open_in_new、开发工具、New、中英文 Description）、模板真限制三条、
 * 与社区搜索聚合器双向互链、不链未交付工具、零网络请求静态检查。
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

var M = require("../static/js/batch_url_opener.js");
var ROOT = path.join(__dirname, "..");

/* ---------- 1. 打开策略常量 ---------- */
eq(M.BATCH_SIZE, 5, "常量：每批 5 个");
eq(M.BATCH_GAP_MS, 600, "常量：批次间隔 600ms");
eq(M.CONFIRM_THRESHOLD, 30, "常量：超 30 个弹确认");

/* ---------- 2. 确定性向量：空串 ---------- */
deepEq(M.parseUrlList(''), [], "向量：parseUrlList('') → []");

/* ---------- 3. 确定性向量：裸域名补 scheme ---------- */
var v2 = M.parseUrlList('example.com');
eq(v2.length, 1, "向量：parseUrlList('example.com') 得 1 项");
eq(v2[0].line, 1, "向量：裸域名 line=1");
eq(v2[0].raw, 'example.com', "向量：裸域名 raw 原样");
eq(v2[0].valid, true, "向量：裸域名 valid=true");
eq(v2[0].url, 'https://example.com/', "向量：裸域名 url='https://example.com/'");
ok(typeof v2[0].reason === 'string' && v2[0].reason.indexOf('已自动补全') !== -1,
  "向量：裸域名 reason 标明自动补全（实得 " + JSON.stringify(v2[0].reason) + "）");

/* ---------- 4. 确定性向量：重复合并＋无效行 ---------- */
var v3 = M.parseUrlList('https://a.com\nhttps://a.com/\nNOT A URL');
eq(v3.length, 3, "向量：三行输入得 3 项");
deepEq(v3.map(function (it) { return it.line; }), [1, 2, 3], "向量：行号 1,2,3 正确");
eq(v3[0].valid, true, "向量：第 1 行 valid");
eq(v3[1].valid, true, "向量：第 2 行 valid");
eq(v3[0].url, 'https://a.com/', "向量：第 1 行归一化 url");
eq(v3[1].url, 'https://a.com/', "向量：第 2 行归一化 url（与第 1 行相同）");
eq(v3[2].valid, false, "向量：第 3 行 valid=false");
eq(v3[2].url, null, "向量：第 3 行 url=null");
ok(typeof v3[2].reason === 'string' && v3[2].reason.length > 0,
  "向量：第 3 行 reason 非空（实得 " + JSON.stringify(v3[2].reason) + "）");
var v3d = M.dedupeUrls(v3);
eq(v3d.length, 2, "向量：dedupe 后合并为 2 项");
eq(v3d[0].url, 'https://a.com/', "向量：dedupe 保留首次出现的 url");
eq(v3d[1].valid, false, "向量：dedupe 后无效行透传保留");

/* ---------- 5. 非法参数抛 Error（err.field） ---------- */
throwsField(function () { M.parseUrlList(null); }, 'rawText', "非法：parseUrlList(null) 抛 Error，err.field=rawText");
throwsField(function () { M.parseUrlList(undefined); }, 'rawText', "非法：parseUrlList(undefined) 抛 Error");
throwsField(function () { M.parseUrlList(123); }, 'rawText', "非法：parseUrlList(123) 抛 Error");
throwsField(function () { M.parseUrlList(['a.com']); }, 'rawText', "非法：parseUrlList(数组) 抛 Error");
throwsField(function () { M.dedupeUrls(null); }, 'items', "非法：dedupeUrls(null) 抛 Error，err.field=items");
throwsField(function () { M.dedupeUrls('a.com'); }, 'items', "非法：dedupeUrls(字符串) 抛 Error");
throwsField(function () { M.dedupeUrls({}); }, 'items', "非法：dedupeUrls(对象) 抛 Error");

/* ---------- 6. 行内抽取与标点剥离 ---------- */
var v6 = M.parseUrlList('去看看 https://example.com/path 吧');
eq(v6.length, 1, "行内抽取：得 1 项");
eq(v6[0].valid, true, "行内抽取：valid=true");
eq(v6[0].url, 'https://example.com/path', "行内抽取：url 正确抽取");
ok(v6[0].reason.indexOf('抽取') !== -1, "行内抽取：reason 标注抽取");
var v6b = M.parseUrlList('www.v2ex.com，');
eq(v6b[0].valid, true, "末尾中文标点：valid=true");
eq(v6b[0].url, 'https://www.v2ex.com/', "末尾中文标点：剥离后补 scheme 归一化");

/* ---------- 7. 空行跳过／CRLF／不支持协议 ---------- */
var v7 = M.parseUrlList('a.com\n\n   \nb.com');
eq(v7.length, 2, "空行：只产出 2 项");
deepEq(v7.map(function (it) { return it.line; }), [1, 4], "空行：行号保持 1 与 4");
var v7b = M.parseUrlList('a.com\r\nb.com');
eq(v7b.length, 2, "CRLF：得 2 项");
var v7c = M.parseUrlList('ftp://files.example.com/x.zip');
eq(v7c[0].valid, false, "不支持协议：ftp 判无效");
eq(v7c[0].url, null, "不支持协议：url=null");
ok(v7c[0].reason.indexOf('不支持的协议') !== -1, "不支持协议：reason 标明协议不支持");
var v7d = M.parseUrlList('http://insecure.example.com');
eq(v7d[0].valid, true, "http 协议：有效");
eq(v7d[0].url, 'http://insecure.example.com/', "http 协议：url 保留 http");

/* ---------- 8. dedupeUrls 语义 ---------- */
var dupItems = M.parseUrlList('HTTPS://A.COM\nhttps://a.com/\nhttps://b.com');
var dd = M.dedupeUrls(dupItems);
eq(dd.length, 2, "去重：大小写/末尾斜杠归一后合并");
ok(dd !== dupItems, "去重：返回新数组（非原引用）");
var mixed = [{ line: 1, raw: 'x', url: null, valid: false, reason: 'r' }, { line: 2, raw: 'y', url: null, valid: false, reason: 'r2' }];
eq(M.dedupeUrls(mixed).length, 2, "去重：url 为 null 的无效条目原样透传不合并");
eq(M.dedupeUrls([]).length, 0, "去重：空数组 → 空数组");
ok(typeof M.EXAMPLE === 'string' && M.EXAMPLE.length > 0, "示例文本非空");

/* ---------- 9. categories.go 注册 ---------- */
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");
var buoIdx = GO_SRC.indexOf('"batch_url_opener"');
ok(buoIdx >= 0, "注册 ID batch_url_opener");
ok(GO_SRC.indexOf('"/tools/batch-url-opener"') >= 0, "注册 Path /tools/batch-url-opener");
ok(GO_SRC.slice(buoIdx, buoIdx + 1200).indexOf('Icon:        "open_in_new"') >= 0, "注册 Icon open_in_new");
ok(GO_SRC.slice(buoIdx, buoIdx + 1200).indexOf("New:         true") >= 0, "注册 New 为 true");
ok(GO_SRC.slice(buoIdx, buoIdx + 1200).indexOf('Category:    "开发工具"') >= 0, "注册 Category 为开发工具");
ok(GO_SRC.slice(buoIdx, buoIdx + 2000).indexOf("Batch URL opener") >= 0, "Description 中英文双语（含英文）");
var pathRe = /"\/tools\/[^"]+"/g, seen = {}, m, pathCount = 0;
while ((m = pathRe.exec(GO_SRC)) !== null) { if (!seen[m[0]]) { seen[m[0]] = true; pathCount++; } }
eq(pathCount, 246, "注册 Path 总数 246→246");

/* ---------- 10. 模板：SEO／真限制／互链／零网络 ---------- */
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "batch_url_opener.html"), "utf8");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "batch_url_opener.js"), "utf8");
var SR_TPL = fs.readFileSync(path.join(ROOT, "templates", "search_router.html"), "utf8");
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/batch-url-opener", "模板 canonical 含新 Path");
has(TPL_SRC, '"url":"https://www.johnkingzcq123.xyz/tools/batch-url-opener"', "模板 JSON-LD 含新 Path");
has(TPL_SRC, "弹窗拦截", "真限制①：弹窗拦截须手动允许");
has(TPL_SRC, "弹窗白名单", "真限制①：给出弹窗白名单指引");
has(TPL_SRC, "一次打开太多标签", "真限制②：开太多标签卡顿");
has(TPL_SRC, "钓鱼", "真限制③：钓鱼链接自行甄别");
has(TPL_SRC, "/tools/search-router", "互链：社区搜索聚合器（去向）");
has(SR_TPL, "/tools/batch-url-opener", "双向互链：社区搜索聚合器模板回链");
notHas(TPL_SRC, "简繁", "不链未交付工具：无简繁互转");
notHas(TPL_SRC, "kotlin", "不链未交付工具：无 JSON→Kotlin");
has(TPL_SRC, "buo-input", "模板含网址输入框 buo-input");
has(TPL_SRC, "buo-valid-list", "模板含有效列表 buo-valid-list");
has(TPL_SRC, "buo-invalid-list", "模板含无效分组 buo-invalid-list");
has(TPL_SRC, "batch_url_opener.js?v=1", "模板引用外部 JS");
notHas(JS_SRC, "fetch(", "零网络：JS 无 fetch 调用");
notHas(JS_SRC, "XMLHttpRequest", "零网络：JS 无 XHR");
notHas(TPL_SRC, "http://", "模板无 http 外链（零外部请求）");

console.log("PASS " + pass + " / FAIL " + fail);
if (fail > 0) process.exit(1);
