/* 搜索结果页（search_results_page）回归测试：
 * 缺陷：handleSearch 已传 SearchQuery／SearchResults（main.go:630-631），但
 * templates/index.html 全文 0 处引用：搜索页标题仍写「热门工具」，两输入框无
 * 预填值，无结果计数，零结果无任何提示，「新工具」区空标题残留。
 * 修复（只动 templates/index.html，以 .SearchQuery 是否非空区分搜索态与首页态）：
 *  ① <title> 搜索态为「搜索 "{{.SearchQuery}}" - 程序员工具箱」，首页态一字不动；
 *  ② 两输入框加条件 value="{{.SearchQuery}}"（首页 handler 不传该键，首页无 value 属性）；
 *  ③ 「热门工具」h2 搜索态改为「搜索结果」，其下加「为 "{{.SearchQuery}}" 找到
 *     {{.SearchResults}} 个结果」计数行；④ 搜索态且结果为 0 时结果区显示
 *     「未找到与 "{{.SearchQuery}}" 相关的工具」＋换关键词／浏览分类建议，分类区仍展示；
 *  ⑤ 搜索态隐藏「新工具」区（{{if not .SearchQuery}} 包裹整区；handler 本就传空数组）。
 * 核查（只核查不改）：static/js/search.js 加载时不按输入框值过滤——filterTools 只在
 *  input／ESC 事件里调用，DOMContentLoaded 时无任何调用，故预填 value 后分类区
 *  仍完整展示（327 张分类卡）；匹配逻辑未动。
 *
 * 运行：node tests/search_results_page.test.js
 * 两种模式（自动选择，启动时打印）：
 *  1) 真实页面模式：环境变量 SEARCH_JSON_HTML／SEARCH_ZERO_HTML／SEARCH_CAL_HTML／
 *     SEARCH_XSS_HTML／HOMEPAGE_HTML 指向本地服务抓回的真实渲染 HTML 时（如
 *     http://127.0.0.1:18099/tools/search?q=json 等），跑全部数值锚点
 *     （q=json：value="json" 各 1 处、计数 29、结果卡 29、分类卡 327、19 分类；
 *      q=zzzzqqq123：结果区 0 卡、「未找到」1 处、19 分类仍展示；
 *      q=日历：结果卡 4、value 与 title 均含「日历」；
 *      引号／尖括号 q：无未转义输出、无新增 script 标签；
 *      首页：无 value 属性、title 逐字相同、「热门工具」仍在、热门 6 张、「新工具」正常）。
 *     另有 jsdom 分支：jsdom 可用且设 SEARCH_JSON_HTML 时，用真实搜索页 HTML＋真实
 *     search.js 验证加载时不按预填值过滤（全部卡片与 19 分类均可见）。
 *  2) 静态断言模式（零依赖默认）：只读 templates/index.html 与 static/js/search.js
 *     源码，断言上述条件渲染与 search.js 加载时不按值过滤。
 * 开发轮本地实测（2026-11-23，本地构建 127.0.0.1:18099）：q=json 200、value="json"×2、
 * 「为 "json" 找到 29 个结果」、title「搜索 "json" - 程序员工具箱」、热门 h2 0 处、
 * 「搜索结果」1 处、结果卡 29、分类卡 327、19 分类、新工具区 0；q=zzzzqqq123 200、
 * 结果区 0 卡、「未找到」1 处、value×2、19 分类；q=日历 200、结果卡 4、value 与 title
 * 均含「日历」；q="><script>alert(1)</script> 200、无未转义输出、script 标签 6 个与首页
 * 相同；首页 200、无 value 属性、title 与改前逐字相同、热门 6 张、「新工具」正常，
 * 且首页除访客统计驱动的热门区／JSON-LD 外与改前逐字节相同；/tool-web/search?q=json
 * 200、归一化（/tool-web/→/tools/、访客数、JSON-LD）后与直通一致，无 q 302 到
 * /tool-web/index；sitemap <loc> 329、Path 328 不变。
 */
"use strict";
var fs = require("fs");
var path = require("path");

var ROOT = path.join(__dirname, "..");
var indexHtml = fs.readFileSync(path.join(ROOT, "templates/index.html"), "utf-8");
var searchSrc = fs.readFileSync(path.join(ROOT, "static/js/search.js"), "utf-8");

var pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name, extra !== undefined ? "(" + extra + ")" : ""); }
}
function eq(a, b, name) { ok(a === b, name, "期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a)); }
function count(h, pat) { var m = h.match(new RegExp(pat, "g")); return m ? m.length : 0; }
function titleOf(h) { var m = h.match(/<title>([\s\S]*?)<\/title>/); return m ? m[1] : ""; }
function sectionCards(h, id) {
  var m = h.match(new RegExp('<section id="' + id + '"[\\s\\S]*?</section>'));
  return m ? count(m[0], 'class="tool-card"') : -1;
}

var HOME_TITLE = "程序员工具箱 - 免费在线开发工具集合 | JSON格式化、Base64编码、正则测试";

/* ---------- 源码静态断言（两种模式共用） ---------- */
ok(indexHtml.indexOf('<title>{{if .SearchQuery}}搜索 "{{.SearchQuery}}" - 程序员工具箱{{else}}' + HOME_TITLE + '{{end}}</title>') !== -1,
  "title 搜索态含查询词、首页态一字不动");
ok(count(indexHtml, 'value="\\{\\{\\.SearchQuery\\}\\}"') === 2, "两输入框各 1 处 value=\"{{.SearchQuery}}\"");
ok(count(indexHtml, '\\{\\{if \\.SearchQuery\\}\\} value="') === 2, "value 属性只在搜索态输出（首页无 value）");
ok(indexHtml.indexOf('{{if .SearchQuery}}搜索结果{{else}}热门工具{{end}}') !== -1,
  "热门工具 h2 搜索态改为「搜索结果」、首页态仍为「热门工具」");
ok(indexHtml.indexOf('为 "{{.SearchQuery}}" 找到 {{.SearchResults}} 个结果') !== -1,
  "计数行「为 \"xxx\" 找到 N 个结果」（.SearchResults 计数）");
ok(indexHtml.indexOf('{{if and .SearchQuery (eq .SearchResults 0)}}') !== -1,
  "零结果提示只在搜索态且结果为 0 时出现");
ok(indexHtml.indexOf('未找到与 "{{.SearchQuery}}" 相关的工具') !== -1,
  "零结果提示文案「未找到与 \"xxx\" 相关的工具」");
ok(indexHtml.indexOf('换个关键词') !== -1 && indexHtml.indexOf('浏览下方分类') !== -1,
  "零结果提示含换关键词／浏览分类建议");
ok(indexHtml.indexOf('{{if not .SearchQuery}}<section id="new-tools"') !== -1,
  "搜索态隐藏「新工具」区（{{if not .SearchQuery}} 包裹）");
ok(indexHtml.indexOf('</section>{{end}}') !== -1, "「新工具」区条件包裹闭合");

/* search.js 加载时不按输入框值过滤：filterTools 只在 input／ESC 事件里调用 */
var filterCalls = searchSrc.match(/filterTools\([^)]*\)/g) || [];
eq(filterCalls.length, 4, "search.js 全文 filterTools 出现恰为 4 处（1 定义＋3 调用）");
ok(filterCalls.indexOf("filterTools(searchTerm)") !== -1, "search.js 含 filterTools 定义 1 处");
ok(filterCalls.filter(function (c) { return c === "filterTools(e.target.value)"; }).length === 2,
  "filterTools 仅由两输入框 input 事件触发（e.target.value）");
ok(filterCalls.indexOf("filterTools('')") !== -1, "第 3 处为 ESC 清空调用 filterTools('')");
ok(searchSrc.indexOf("filterTools(toolSearch") === -1 && searchSrc.indexOf("filterTools(toolSearchLarge") === -1,
  "search.js 加载时不按输入框值过滤（无 filterTools(输入框.value) 调用）");
ok(searchSrc.indexOf("const isMatch = name.includes(term) || description.includes(term);") !== -1,
  "search.js 匹配逻辑未动（name/description includes）");

/* ---------- 真实页面模式：环境变量指向抓回的 HTML ---------- */
var env = {
  json: process.env.SEARCH_JSON_HTML || "",
  zero: process.env.SEARCH_ZERO_HTML || "",
  cal: process.env.SEARCH_CAL_HTML || "",
  xss: process.env.SEARCH_XSS_HTML || "",
  home: process.env.HOMEPAGE_HTML || ""
};
var liveFiles = Object.keys(env).filter(function (k) { return env[k] && fs.existsSync(env[k]); });
if (liveFiles.length > 0) {
  console.log("模式：真实页面（" + liveFiles.join("、") + "）");
  var pages = {};
  liveFiles.forEach(function (k) { pages[k] = fs.readFileSync(env[k], "utf-8"); });

  if (pages.json) {
    var j = pages.json;
    eq(titleOf(j), '搜索 "json" - 程序员工具箱', "q=json：title 含查询词");
    eq(count(j, 'value="json"'), 2, "q=json：两输入框 value=\"json\" 各 1 处");
    eq(count(j, '<h2><i class="material-icons">star</i> 热门工具</h2>'), 0, "q=json：「热门工具」h2 0 处");
    eq(count(j, "搜索结果</h2>"), 1, "q=json：「搜索结果」h2 1 处");
    ok(j.indexOf('为 "json" 找到 29 个结果') !== -1, "q=json：计数文案「为 \"json\" 找到 29 个结果」");
    eq(sectionCards(j, "popular"), 29, "q=json：结果卡 29 张");
    eq(sectionCards(j, "all"), 327, "q=json：分类卡 327 张");
    eq(count(j, 'class="category"'), 19, "q=json：19 个分类");
    eq(count(j, 'id="new-tools"'), 0, "q=json：「新工具」区已隐藏");
    eq(count(j, "未找到"), 0, "q=json：有结果时无「未找到」提示");
    if (pages.home) ok(titleOf(j) !== titleOf(pages.home), "q=json：title 与首页不同");
  }
  if (pages.zero) {
    var z = pages.zero;
    eq(sectionCards(z, "popular"), 0, "q=zzzzqqq123：结果区 0 张卡");
    eq(count(z, "未找到"), 1, "q=zzzzqqq123：正文含「未找到」提示 1 处");
    ok(z.indexOf('未找到与 "zzzzqqq123" 相关的工具') !== -1, "q=zzzzqqq123：零结果提示含查询词");
    eq(count(z, 'value="zzzzqqq123"'), 2, "q=zzzzqqq123：两输入框预填该词");
    eq(count(z, 'class="category"'), 19, "q=zzzzqqq123：19 个分类仍展示");
    eq(sectionCards(z, "all"), 327, "q=zzzzqqq123：分类卡 327 张");
  }
  if (pages.cal) {
    var c = pages.cal;
    eq(sectionCards(c, "popular"), 4, "q=日历：结果卡 4 张");
    eq(count(c, 'value="日历"'), 2, "q=日历：两输入框预填「日历」");
    ok(titleOf(c).indexOf("日历") !== -1, "q=日历：title 含「日历」");
  }
  if (pages.xss) {
    var x = pages.xss;
    ok(x.indexOf('"><script>') === -1, "转义：响应中无未转义的原始 q");
    ok(x.indexOf("&lt;script&gt;") !== -1, "转义：查询词被 Go 模板转义输出");
    ok(x.indexOf('value="&#34;&gt;&lt;script&gt;') !== -1, "转义：value 属性内引号／尖括号已转义、无 breakout");
    if (pages.home) eq(count(x, "<script"), count(pages.home, "<script"), "转义：script 标签数与首页相同（无新增）");
  }
  if (pages.home) {
    var h = pages.home;
    eq(titleOf(h), HOME_TITLE, "首页：title 与改前逐字相同");
    eq(count(h, ' value="'), 0, "首页：两输入框无 value 属性");
    eq(count(h, '<h2><i class="material-icons">star</i> 热门工具</h2>'), 1, "首页：「热门工具」h2 仍在");
    eq(sectionCards(h, "popular"), 6, "首页：热门区 6 张卡");
    eq(count(h, 'id="new-tools"'), 1, "首页：「新工具」区正常展示");
    eq(count(h, "search-result-count"), 0, "首页：无结果计数行");
    eq(count(h, "未找到"), 0, "首页：无「未找到」提示");
  }

  /* jsdom 分支：真实搜索页 HTML＋真实 search.js，验证加载时不按预填值过滤 */
  var jsdom = null;
  try { jsdom = require("jsdom"); } catch (e) { /* 未安装则跳过 */ }
  if (jsdom && pages.json) {
    var dom = new jsdom.JSDOM(pages.json, { url: "https://www.it-tool.eu.cc/tool-web/search?q=json", runScripts: "outside-only" });
    var window = dom.window;
    var document = window.document;
    window.eval(searchSrc);
    document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true }));
    var allCards = Array.prototype.slice.call(document.querySelectorAll(".tool-card"));
    var visibleCards = allCards.filter(function (card) { return card.style.display !== "none"; });
    var allCats = Array.prototype.slice.call(document.querySelectorAll(".category"));
    var visibleCats = allCats.filter(function (cat) { return cat.style.display !== "none"; });
    eq(document.getElementById("toolSearch").value, "json", "jsdom：预填值 json 在加载后仍在输入框");
    eq(visibleCards.length, allCards.length, "jsdom：加载时不按预填值过滤（全部卡片可见）");
    eq(visibleCats.length, 19, "jsdom：加载时 19 个分类全部可见");
    eq(allCards.length, 356, "jsdom：搜索页卡片总数 29＋327＝356");
  } else if (pages.json) {
    console.log("提示：未找到 jsdom，jsdom 加载时过滤分支未跑（静态断言已覆盖：filterTools 仅事件触发）");
  }
} else {
  console.log("模式：静态断言（未设 SEARCH_*_HTML／HOMEPAGE_HTML；设环境变量可跑真实页面锚点）");
}

console.log("search_results_page: pass=" + pass + " fail=" + fail);
process.exit(fail ? 1 : 0);
