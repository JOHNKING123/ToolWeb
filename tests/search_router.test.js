/* 社区搜索聚合器纯逻辑单元测试（零依赖）：node tests/search_router.test.js
 * 覆盖：板块配置（6 板块/id 唯一）、链接构造（Google site: 语法/站内搜索 URL/关键词 URL 编码）、
 * 时间范围 after: 日期计算、HN Algolia dateRange 映射、单板块 1 条链接、全板块 6 条链接、
 * OpenSearch XML（ShortName/Url template ?q={searchTerms}）、XML 转义、源码零 fetch/XHR。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var sr = require("../static/js/search_router.js");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function contains(hay, needle, name) { ok(hay.indexOf(needle) !== -1, name + "（期望包含 " + JSON.stringify(needle) + "）"); }

/* 固定“今天”：2026-10-22（本地构造，避免时区抖动） */
var NOW = new Date(2026, 9, 22);
var KW = "python asyncio 连接池";
var KW_ENC = "python%20asyncio%20%E8%BF%9E%E6%8E%A5%E6%B1%A0"; /* encodeURIComponent(KW) */

/* ---------- 板块配置 ---------- */
eq(sr.BOARDS.length, 6, "板块共 6 个");
(function () {
    var seen = {};
    sr.BOARDS.forEach(function (b) { seen[b.id] = true; });
    eq(Object.keys(seen).length, 6, "板块 id 唯一");
})();
ok(!!sr.getBoard("reddit") && !!sr.getBoard("hn") && !!sr.getBoard("se") &&
   !!sr.getBoard("quora") && !!sr.getBoard("v2ex") && !!sr.getBoard("zhihu"),
    "6 个板块 id 均可查到");
eq(sr.getBoard("nope"), null, "未知板块 id → null");
eq(sr.getRange("month").days, 30, "过去 1 个月 = 30 天");
eq(sr.getRange("nope").id, "all", "未知时间范围 → 回退不限时间");

/* ---------- after: 日期计算 ---------- */
eq(sr.afterDate(30, NOW), "2026-09-22", "过去 1 个月 → 2026-09-22");
eq(sr.afterDate(0, NOW), "2026-10-22", "0 天 → 当天");
eq(sr.afterDate(1, NOW), "2026-10-21", "过去 24 小时 → 2026-10-21");
eq(sr.afterDate(7, NOW), "2026-10-15", "过去 1 周 → 2026-10-15");
eq(sr.afterDate(365, NOW), "2025-10-22", "过去 1 年 → 2025-10-22");

/* ---------- Google site: 路由（Reddit） ---------- */
var r = sr.buildBoardLink("reddit", KW, "month", NOW);
ok(!!r, "Reddit 生成链接非空");
eq(r.engine, "google", "Reddit 路由引擎为 google");
ok(r.url.indexOf("https://www.google.com/search?q=") === 0, "Reddit 链接走 Google 搜索");
contains(r.url, "site%3Areddit.com", "Reddit 链接含 site:reddit.com（已编码）");
contains(r.url, KW_ENC, "Reddit 链接含 URL 编码后的关键词");
contains(r.url, "after%3A2026-09-22", "过去 1 个月 → Google 链接含 after:2026-09-22（已编码）");

var rAll = sr.buildBoardLink("reddit", KW, "all", NOW);
ok(rAll.url.indexOf("after") === -1, "不限时间 → Google 链接不含 after:");

var q = sr.buildBoardLink("quora", KW, "week", NOW);
contains(q.url, "site%3Aquora.com", "Quora 链接含 site:quora.com");
contains(q.url, "after%3A2026-10-15", "过去 1 周 → after:2026-10-15");

/* ---------- 站内搜索路由 ---------- */
var h = sr.buildBoardLink("hn", KW, "month", NOW);
ok(h.url.indexOf("https://hn.algolia.com/?q=") === 0, "HN 走 hn.algolia.com 官方搜索");
contains(h.url, KW_ENC, "HN 链接含 URL 编码后的关键词");
contains(h.url, "dateRange=pastMonth", "过去 1 个月 → HN dateRange=pastMonth");
contains(sr.buildBoardLink("hn", KW, "day", NOW).url, "dateRange=last24h", "过去 24 小时 → HN dateRange=last24h");
contains(sr.buildBoardLink("hn", KW, "all", NOW).url, "dateRange=all", "不限时间 → HN dateRange=all");

var s = sr.buildBoardLink("se", KW, "month", NOW);
ok(s.url.indexOf("https://stackoverflow.com/search?q=") === 0, "Stack Exchange 走 SO 官方站内搜索");
contains(s.url, KW_ENC, "SO 链接含 URL 编码后的关键词");

var v = sr.buildBoardLink("v2ex", KW, "month", NOW);
ok(v.url.indexOf("https://www.v2ex.com/search?q=") === 0, "V2EX 走官方站内搜索");
contains(v.url, KW_ENC, "V2EX 链接含 URL 编码后的关键词");

var z = sr.buildBoardLink("zhihu", KW, "month", NOW);
contains(z.url, "https://www.zhihu.com/search?type=content&q=", "知乎走官方站内搜索（type=content）");
contains(z.url, KW_ENC, "知乎链接含 URL 编码后的关键词");

/* ---------- 非法输入 ---------- */
eq(sr.buildBoardLink("nope", KW, "month", NOW), null, "未知板块 → null");
eq(sr.buildBoardLink("reddit", "", "month", NOW), null, "空关键词 → null");
eq(sr.buildBoardLink("reddit", "   ", "month", NOW), null, "空白关键词 → null");

/* ---------- 批量生成 ---------- */
var one = sr.buildLinks(KW, ["reddit"], "month", NOW);
eq(one.length, 1, "单板块（Reddit）→ 只生成 1 条链接");

var allIds = sr.BOARDS.map(function (b) { return b.id; });
var all = sr.buildLinks(KW, allIds, "month", NOW);
eq(all.length, 6, "全板块 → 生成 6 条链接");
eq(all.map(function (l) { return l.boardId; }).join(","),
   "reddit,hn,se,quora,v2ex,zhihu", "全板块链接保持板块配置顺序");
ok(all.every(function (l) { return l.url.indexOf(KW_ENC) !== -1; }),
    "全板块每条链接都含 URL 编码后的关键词");
eq(sr.buildLinks("", allIds, "month", NOW).length, 0, "空关键词 → 0 条链接");
eq(sr.buildLinks(KW, [], "month", NOW).length, 0, "未选板块 → 0 条链接");
eq(sr.buildLinks(KW, ["reddit", "nope"], "month", NOW).length, 1, "未知板块 id 被忽略");

/* ---------- OpenSearch XML ---------- */
var xml = sr.buildOpenSearchXml();
ok(xml.indexOf('<?xml version="1.0" encoding="UTF-8"?>') === 0, "XML 声明头正确");
contains(xml, "<ShortName>社区搜索</ShortName>", "含 ShortName");
contains(xml, 'template="https://www.it-tool.eu.cc/tools/search-router?q={searchTerms}"',
    "Url template 含 ?q={searchTerms} 占位");
contains(xml, 'xmlns="http://a9.com/-/spec/opensearch/1.1/"', "含 OpenSearch 命名空间");
ok(xml.trim().lastIndexOf("</OpenSearchDescription>") === xml.trim().length - "</OpenSearchDescription>".length,
    "XML 根元素闭合完整");
eq(sr.escapeXml('a&b<"c\'>d'), "a&amp;b&lt;&quot;c&apos;&gt;d", "XML 转义 & < \" ' >");

/* ---------- 源码零 fetch/XHR ---------- */
var src = fs.readFileSync(path.join(__dirname, "..", "static", "js", "search_router.js"), "utf8");
ok(!/fetch\s*\(/.test(src), "源码无 fetch(");
ok(!/XMLHttpRequest/.test(src), "源码无 XMLHttpRequest");
ok(!/navigator\.sendBeacon/.test(src), "源码无 sendBeacon");

console.log("\n通过 " + pass + " / " + (pass + fail) + "，失败 " + fail);
process.exit(fail ? 1 : 0);
