/* Schema.org 结构化数据生成器纯逻辑单元测试（零依赖）：node tests/schema_org_generator.test.js
 * 覆盖：类型配置完整性、必填校验、枚举/URL/日期/时长校验、JSON-LD 构建、
 * 单类型输出、@graph 多类型堆叠、HTML 片段转义、源码零 fetch/XHR。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var sog = require("../static/js/schema_org_generator.js");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }

/* ---------- 类型配置完整性 ---------- */
var ids = sog.SOG_TYPES.map(function (t) { return t.id; });
var expectIds = ["article", "product", "recipe", "event", "faqpage", "breadcrumb",
    "organization", "localbusiness", "jobposting", "softwareapp", "videoobject", "website"];
expectIds.forEach(function (id) { ok(ids.indexOf(id) !== -1, "类型存在: " + id); });
eq(ids.length, 12, "类型总数 12（不少于 10）");
ok(new Set(ids).size === ids.length, "类型 id 唯一");
sog.SOG_TYPES.forEach(function (t) {
    ok(t.label && t.label.length > 0, "类型有中文标签: " + t.id);
    ok(Array.isArray(t.fields) && t.fields.length > 0, "类型有字段: " + t.id);
    ok(t.fields.some(function (f) { return f.required; }), "类型至少一个必填字段: " + t.id);
    ok(Array.isArray(t.atTypes) && t.atTypes.length > 0, "类型有 @type: " + t.id);
});
eq(sog.SCHEMA_CONTEXT, "https://schema.org", "@context 固定为 https://schema.org");

/* ---------- 必填校验：Article 缺标题 ---------- */
var v1 = sog.validateValues("article", { headline: "", authorName: "张三", datePublished: "2026-10-22" });
ok(!v1.valid, "Article 缺标题 → 校验不通过");
ok(v1.errors.some(function (e) { return e.key === "headline"; }), "错误定位到 headline 字段");

/* Article 全填 → 通过 */
var articleVals = { headline: "测试标题", authorName: "张三", datePublished: "2026-10-22", image: "https://example.com/c.jpg" };
var v2 = sog.validateValues("article", articleVals);
ok(v2.valid && v2.errors.length === 0, "Article 必填完整 → 校验通过");

/* ---------- 格式校验 ---------- */
var vUrl = sog.validateValues("organization", { name: "X 公司", url: "not-a-url" });
ok(!vUrl.valid && vUrl.errors.some(function (e) { return e.key === "url"; }), "非法 URL 被拦截");
var vDate = sog.validateValues("article", { headline: "t", authorName: "a", datePublished: "2026/10/22" });
ok(!vDate.valid && vDate.errors.some(function (e) { return e.key === "datePublished"; }), "非法日期格式被拦截");
var vDur = sog.validateValues("recipe", { name: "红烧肉", recipeIngredient: "肉", recipeInstructions: "炖", cookTime: "40分钟" });
ok(!vDur.valid && vDur.errors.some(function (e) { return e.key === "cookTime"; }), "非法 ISO 8601 时长被拦截");
var vDurOk = sog.validateValues("recipe", { name: "红烧肉", recipeIngredient: "肉", recipeInstructions: "炖", cookTime: "PT40M" });
ok(vDurOk.valid, "合法时长 PT40M 通过");
var vNum = sog.validateValues("product", { name: "耳机", price: "贵", priceCurrency: "CNY" });
ok(!vNum.valid && vNum.errors.some(function (e) { return e.key === "price"; }), "非数字价格被拦截");
var vEnum = sog.validateValues("product", { name: "耳机", price: "99", priceCurrency: "火星币" });
ok(!vEnum.valid && vEnum.errors.some(function (e) { return e.key === "priceCurrency"; }), "非法枚举值被拦截");

/* Event 线上模式：地点必须是 URL */
var vEvtOnline = sog.validateValues("event", { name: "直播", startDate: "2026-11-20T09:00",
    attendanceMode: "OnlineEventAttendanceMode", location: "深圳会展中心" });
ok(!vEvtOnline.valid && vEvtOnline.errors.some(function (e) { return e.key === "location"; }), "线上活动地点非 URL 被拦截");
var vEvtOnlineOk = sog.validateValues("event", { name: "直播", startDate: "2026-11-20T09:00",
    attendanceMode: "OnlineEventAttendanceMode", location: "https://live.example.com/1" });
ok(vEvtOnlineOk.valid, "线上活动地点为 URL 通过");
var vEvtOffline = sog.validateValues("event", { name: "大会", startDate: "2026-11-20T09:00",
    attendanceMode: "OfflineEventAttendanceMode", location: "深圳会展中心" });
ok(vEvtOffline.valid, "线下活动地点为文本通过");

/* FAQ 空行校验 */
var vFaqEmpty = sog.validateValues("faqpage", { faqs: [] });
ok(!vFaqEmpty.valid, "FAQ 零条目不通过");
var vFaqHalf = sog.validateValues("faqpage", { faqs: [{ q: "问题？", a: "" }] });
ok(!vFaqHalf.valid && vFaqHalf.errors.some(function (e) { return e.key === "faqs-0-a"; }), "FAQ 回答为空定位到 faqs-0-a");

/* ---------- JSON-LD 构建：Article ---------- */
var out1 = sog.buildOutput([{ typeId: "article", atType: "Article", values: articleVals }]);
ok(out1.json !== null, "单类型输出非空");
var parsed;
try { parsed = JSON.parse(out1.text); ok(true, "输出可 JSON.parse"); }
catch (e) { ok(false, "输出可 JSON.parse"); }
eq(parsed["@context"], "https://schema.org", "含 @context https://schema.org");
eq(parsed["@type"], "Article", "@type 为 Article");
eq(parsed.headline, "测试标题", "headline 正确");
eq(parsed.author.name, "张三", "作者嵌套 Person 正确");
ok(!("@graph" in parsed), "单类型不包 @graph");

/* 文章子类型切换 */
var outNews = sog.buildOutput([{ typeId: "article", atType: "NewsArticle", values: articleVals }]);
eq(JSON.parse(outNews.text)["@type"], "NewsArticle", "@type 可切换为 NewsArticle");

/* Product 嵌套：offers / availability IRI / aggregateRating */
var outP = sog.buildOutput([{ typeId: "product", values: { name: "耳机", price: "299.00", priceCurrency: "CNY",
    availability: "InStock", ratingValue: "4.8", reviewCount: "100" } }]);
var p = JSON.parse(outP.text);
eq(p.offers["@type"], "Offer", "offers 嵌套");
eq(p.offers.availability, "https://schema.org/InStock", "availability 输出完整 IRI");
eq(p.aggregateRating.ratingValue, "4.8", "aggregateRating 嵌套");

/* Recipe 列表展开 */
var outR = sog.buildOutput([{ typeId: "recipe", values: { name: "红烧肉",
    recipeIngredient: "五花肉 500g\n生抽 2 勺\n", recipeInstructions: "切块\n炖 40 分钟" } }]);
var r = JSON.parse(outR.text);
ok(Array.isArray(r.recipeIngredient) && r.recipeIngredient.length === 2, "食材清单按行展开（空行过滤）");
eq(r.recipeInstructions[0]["@type"], "HowToStep", "步骤转为 HowToStep");

/* FAQPage mainEntity */
var outF = sog.buildOutput([{ typeId: "faqpage", values: { faqs: [{ q: "Q1？", a: "A1。" }] } }]);
var f = JSON.parse(outF.text);
eq(f.mainEntity[0]["@type"], "Question", "FAQ 主实体为 Question");
eq(f.mainEntity[0].acceptedAnswer.text, "A1。", "回答嵌套正确");

/* BreadcrumbList position */
var outB = sog.buildOutput([{ typeId: "breadcrumb", values: { crumbs: [
    { name: "首页", item: "https://example.com/" }, { name: "博客", item: "https://example.com/blog" } ] } }]);
var b = JSON.parse(outB.text);
eq(b.itemListElement[1].position, 2, "面包屑 position 递增");

/* WebSite + SearchAction */
var outW = sog.buildOutput([{ typeId: "website", values: { name: "工具箱", url: "https://example.com",
    searchTarget: "https://example.com/s?q={search_term_string}" } }]);
var w = JSON.parse(outW.text);
eq(w.potentialAction["@type"], "SearchAction", "填搜索模板时附加 SearchAction");
var outW2 = sog.buildOutput([{ typeId: "website", values: { name: "工具箱", url: "https://example.com", searchTarget: "" } }]);
ok(!("potentialAction" in JSON.parse(outW2.text)), "不填搜索模板时无 SearchAction");

/* ---------- 双类型堆叠 @graph ---------- */
var outG = sog.buildOutput([
    { typeId: "faqpage", values: { faqs: [{ q: "Q？", a: "A。" }] } },
    { typeId: "product", values: { name: "耳机", price: "99", priceCurrency: "CNY" } }
]);
var g = JSON.parse(outG.text);
ok(Array.isArray(g["@graph"]) && g["@graph"].length === 2, "@graph 数组含 2 个节点");
eq(g["@graph"][0]["@type"], "FAQPage", "@graph[0] 为 FAQPage");
eq(g["@graph"][1]["@type"], "Product", "@graph[1] 为 Product");

/* 无效类型不进入输出 */
var outMix = sog.buildOutput([
    { typeId: "article", values: { headline: "", authorName: "", datePublished: "" } },
    { typeId: "product", values: { name: "耳机", price: "99", priceCurrency: "CNY" } }
]);
ok(!outMix.validAll, "混合选择 validAll 为 false");
var mixP = JSON.parse(outMix.text);
eq(mixP["@type"], "Product", "无效类型被排除，仅输出有效类型");
ok(outMix.results[0].errors.length === 3, "无效类型报出 3 条必填错误");

/* 空选择 */
var outEmpty = sog.buildOutput([]);
eq(outEmpty.text, "", "空选择输出为空文本");
eq(outEmpty.json, null, "空选择 json 为 null");

/* ---------- HTML 片段 ---------- */
var snippet = sog.buildHtmlSnippet('{"@context":"https://schema.org"}');
ok(snippet.indexOf('<script type="application/ld+json">') === 0, "片段以 script 标签开头");
ok(snippet.trim().endsWith("</script>"), "片段以 </script> 结尾");
var evil = sog.buildHtmlSnippet('{"x":"</script><script>alert(1)"}');
ok(evil.indexOf("</script><script>") === -1, "</script> 注入被转义");

/* ---------- 源码零 fetch/XHR ---------- */
var src = fs.readFileSync(path.join(__dirname, "../static/js/schema_org_generator.js"), "utf8");
ok(!/\bfetch\s*\(/.test(src), "源码无 fetch(");
ok(src.indexOf("XMLHttpRequest") === -1, "源码无 XMLHttpRequest");

/* ---------- 示例值自洽：每类示例都能通过校验并生成 ---------- */
Object.keys(sog.SOG_SAMPLES).forEach(function (id) {
    var s = sog.SOG_SAMPLES[id];
    var vr = sog.validateValues(id, s);
    ok(vr.valid, "示例通过校验: " + id + (vr.valid ? "" : " → " + JSON.stringify(vr.errors)));
    if (vr.valid) {
        var o = sog.buildOutput([{ typeId: id, values: s }]);
        try { JSON.parse(o.text); ok(true, "示例可生成合法 JSON: " + id); }
        catch (e) { ok(false, "示例可生成合法 JSON: " + id); }
    }
});

console.log("\n通过 " + pass + " / " + (pass + fail) + "，失败 " + fail);
process.exit(fail ? 1 : 0);
