/* HTTP 状态码速查（http_status_reference）纯逻辑单元测试（零依赖）：
 * node tests/http_status_reference.test.js
 * 覆盖：数据总量与类别分布、逐条七字段齐全无空、码号唯一升序、类别归属正确
 * （418/451 归 4xx、103 归 1xx）、冷知识备注、搜索函数逻辑（429/teapot/网关/
 * 拼音首字母/空查询/大小写）、类别筛选、queryStatus 双条件、getStatusByCode、
 * renderCard 防 XSS 转义、JS 零 fetch/XHR、模板静态检查。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var H = require("../static/js/http_status_reference.js");
var SRC = fs.readFileSync(path.join(__dirname, "..", "static", "js", "http_status_reference.js"), "utf8");
var TPL = fs.readFileSync(path.join(__dirname, "..", "templates", "http_status_reference.html"), "utf8");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }

var CODES = H.STATUS_CODES;
var FIELDS = ["code", "name_en", "name_cn", "category", "meaning_cn", "scenario", "fix"];

/* ---------- 1. 总量与类别分布 ---------- */
ok(CODES.length >= 60, "状态码总数 ≥60（实得 " + CODES.length + "）");
function countCat(cat) { return CODES.filter(function (e) { return e.category === cat; }).length; }
eq(countCat("1xx"), 3, "1xx 共 3 条");
eq(countCat("2xx"), 10, "2xx 共 10 条");
eq(countCat("3xx"), 9, "3xx 共 9 条");
eq(countCat("4xx"), 29, "4xx 共 29 条");
eq(countCat("5xx"), 11, "5xx 共 11 条");
eq(H.CATEGORY_KEYS.length, 5, "五类枚举");
eq(H.CATEGORY_LABELS["4xx"], "4xx 客户端错误", "类别标签 4xx");

/* ---------- 2. 逐条七字段齐全无空 ---------- */
var bad = [];
CODES.forEach(function (e) {
    FIELDS.forEach(function (f) {
        var v = e[f];
        if (typeof v === "string" ? v.replace(/^\s+|\s+$/g, "") === "" : v === null || v === undefined) {
            bad.push(e.code + "." + f);
        }
    });
});
ok(bad.length === 0, "逐条七字段齐全无空字段" + (bad.length ? "（缺失：" + bad.slice(0, 5).join(",") + "）" : ""));
ok(CODES.every(function (e) { return typeof e.code === "number"; }), "码号均为数字");
ok(CODES.every(function (e) { return H.CATEGORY_KEYS.indexOf(e.category) !== -1; }), "类别枚举合法");
ok(CODES.every(function (e) { return typeof e.py === "string" && e.py.length > 0 && e.py.indexOf(" ") === -1; }), "拼音首字母字段齐全无空格");

/* ---------- 3. 码号唯一且升序 ---------- */
var codes = CODES.map(function (e) { return e.code; });
eq(new Set(codes).size, codes.length, "码号唯一无重复");
var sorted = codes.slice().sort(function (a, b) { return a - b; });
ok(codes.every(function (c, i) { return c === sorted[i]; }), "码号升序排列");

/* ---------- 4. 类别归属正确 ---------- */
function catOf(code) {
    var e = H.getStatusByCode(code);
    return e ? e.category : null;
}
eq(catOf(103), "1xx", "103 归 1xx");
eq(catOf(418), "4xx", "418 归 4xx");
eq(catOf(451), "4xx", "451 归 4xx");
eq(catOf(200), "2xx", "200 归 2xx");
eq(catOf(301), "3xx", "301 归 3xx");
eq(catOf(503), "5xx", "503 归 5xx");
ok(CODES.every(function (e) {
    var lo = parseInt(e.category, 10) * 100, hi = lo + 100;
    return e.code >= lo && e.code < hi;
}), "每条码号落在所属类别区间内");

/* ---------- 5. 冷知识备注 ---------- */
var e418 = H.getStatusByCode(418), e451 = H.getStatusByCode(451);
ok(!!(e418 && e418.note), "418 有冷知识备注");
ok(!!(e451 && e451.note), "451 有冷知识备注");
ok(e418.note.indexOf("茶壶") !== -1 || e418.note.indexOf("RFC 2324") !== -1, "418 冷知识提及茶壶/RFC 2324");
ok(e451.note.indexOf("451") !== -1 && (e451.note.indexOf("华氏") !== -1 || e451.note.indexOf("Fahrenheit") !== -1), "451 冷知识提及华氏451度");
ok(e418.name_en.toLowerCase().indexOf("teapot") !== -1, "418 英文原名含 teapot");

/* ---------- 6. 搜索函数逻辑 ---------- */
function codesOf(list) { return list.map(function (e) { return e.code; }); }
ok(codesOf(H.searchStatus("429")).indexOf(429) !== -1, "搜索「429」命中 429");
ok(codesOf(H.searchStatus("teapot")).indexOf(418) !== -1, "搜索「teapot」命中 418");
var gw = codesOf(H.searchStatus("网关"));
ok(gw.indexOf(502) !== -1 && gw.indexOf(504) !== -1, "搜索「网关」命中 502 与 504");
ok(codesOf(H.searchStatus("cg")).indexOf(200) !== -1, "搜索拼音首字母「cg」命中 200 成功");
ok(codesOf(H.searchStatus("TEAPOT")).indexOf(418) !== -1, "搜索大小写不敏感（TEAPOT）");
eq(H.searchStatus("").length, CODES.length, "空查询返回全部");
eq(H.searchStatus("   ").length, CODES.length, "纯空格查询返回全部");
eq(H.searchStatus("zzzz不存在的词").length, 0, "无匹配关键词返回空");
ok(codesOf(H.searchStatus("限流")).indexOf(429) !== -1, "搜索「限流」命中 429");
eq(H.normalizeQuery(null), "", "normalizeQuery(null) 为空串");
eq(H.normalizeQuery("  429 "), "429", "normalizeQuery 去空格");

/* ---------- 7. 类别筛选 ---------- */
eq(H.filterByCategory("all").length, CODES.length, "filter all 返回全部");
ok(H.filterByCategory("4xx").every(function (e) { return e.category === "4xx"; }), "filter 4xx 全部归属正确");
eq(H.filterByCategory("2xx").length, 10, "filter 2xx 数量正确");
eq(H.filterByCategory("9xx").length, 0, "非法类别返回空");

/* ---------- 8. 双条件组合 ---------- */
var combo = H.queryStatus("网关", "5xx");
ok(codesOf(combo).indexOf(502) !== -1 && codesOf(combo).indexOf(504) !== -1, "queryStatus(网关, 5xx) 命中 502/504");
eq(H.queryStatus("茶壶", "2xx").length, 0, "queryStatus(茶壶, 2xx) 为空");
eq(H.queryStatus("", "1xx").length, 3, "queryStatus('', 1xx) = 3");

/* ---------- 9. getStatusByCode ---------- */
eq(H.getStatusByCode(404).name_en, "Not Found", "getStatusByCode(404) 英文原名");
eq(H.getStatusByCode("404").name_cn, "未找到", "getStatusByCode('404') 字符串码号兼容");
eq(H.getStatusByCode(999), null, "getStatusByCode(999) 返回 null");
eq(H.getStatusByCode("abc"), null, "getStatusByCode('abc') 返回 null");

/* ---------- 10. 渲染防 XSS ---------- */
var evil = H.renderCard({code: 999, name_en: "<script>", name_cn: "<img>", category: "4xx",
    py: "x", meaning_cn: "a&b", scenario: "s", fix: "f"});
ok(evil.indexOf("<script>") === -1 && evil.indexOf("&lt;script&gt;") !== -1, "renderCard 转义英文原名");
ok(evil.indexOf("a&amp;b") !== -1, "renderCard 转义 &");
ok(evil.indexOf('data-code="999"') !== -1, "renderCard 含 data-code");
ok(H.renderCard(e418).indexOf("冷知识") !== -1, "有 note 的卡片渲染冷知识区");
ok(H.renderEmpty("xyz").indexOf("xyz") !== -1, "renderEmpty 回显查询词");

/* ---------- 11. JS 源码约束：零 fetch/XHR ---------- */
ok(!/\bfetch\s*\(/.test(SRC), "JS 无 fetch 调用");
ok(SRC.indexOf("XMLHttpRequest") === -1, "JS 无 XMLHttpRequest");

/* ---------- 12. 模板静态检查 ---------- */
ok(TPL.indexOf('rel="canonical" href="https://www.johnkingzcq123.xyz/tools/http-status-reference"') !== -1, "canonical 正确");
ok(TPL.indexOf("中文释义仅供参考，规范语义以 RFC/MDN 为准") !== -1, "释义声明完整");
ok(TPL.indexOf("/tools/static/js/http_status_reference.js") !== -1, "引用 JS 文件");
ok(TPL.indexOf("application/ld+json") !== -1, "JSON-LD 结构化数据");
ok(TPL.indexOf('id="hsr-search"') !== -1, "搜索框存在");
ok(TPL.indexOf('id="hsr-grid"') !== -1, "卡片网格存在");
ok(TPL.indexOf('data-cat="4xx"') !== -1, "类别 tab 含 4xx");
ok(TPL.indexOf("418") !== -1 && TPL.indexOf("茶壶") !== -1, "模板提及 418 茶壶");
ok(TPL.indexOf("@media (max-width:640px)") !== -1, "移动端媒体查询");
ok(TPL.indexOf("grid-template-columns:1fr") !== -1, "小屏卡片单列");
ok(TPL.indexOf('{{define "http_status_reference"}}') !== -1, "模板 define 名称正确");

console.log("\n通过 " + pass + "，失败 " + fail + "，共 " + (pass + fail) + " 断言");
process.exit(fail === 0 ? 0 : 1);
