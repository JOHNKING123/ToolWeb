/* 社媒标签生成器（hashtag_generator）纯逻辑单元测试（零依赖）：
 * node tests/hashtag_generator.test.js
 * 覆盖：normalizeKeywords 确定性向量与非法参数抛 Error（err.field="input"）、
 * matchTags 确定性向量与非法参数（err.field="keyword"）、generateHashtags 确定性
 * 向量逐字命中（含零命中保底派生策略）与非法参数抛 Error（err.field="keywords"/
 * "platform"/"count"/"heatPref"）、badgeFor 分档、热度偏好排序、平台默认数量、
 * categories.go 注册（Path 总数 248→248、ID hashtag_generator、Path
 * /tools/hashtag-generator、Icon local_offer、营销工具、New、中英文 Description）、
 * 模板 SEO 面板／真限制三条／互链（违禁词检测器、OG 社交卡片预览双向）／
 * 不链未交付工具、零网络请求静态检查。
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

var M = require("../static/js/hashtag-generator.js");
var ROOT = path.join(__dirname, "..");

/* ---------- 1. normalizeKeywords 确定性向量 ---------- */
deepEq(M.normalizeKeywords("美妆\n旅行, 健身，美食；口红"),
  ["美妆", "旅行", "健身", "美食", "口红"], "向量：多分隔符切分→5 关键词");
deepEq(M.normalizeKeywords([" a ", "A", "", "b"]),
  ["a", "b"], "向量：数组去空＋英文大小写去重");
deepEq(M.normalizeKeywords("  口红  "), ["口红"], "向量：单关键词 trim");
throwsField(function () { M.normalizeKeywords(""); }, "input", "非法：空字符串抛 Error（err.field=input）");
throwsField(function () { M.normalizeKeywords("  \n,， "); }, "input", "非法：纯分隔符抛 Error（err.field=input）");
throwsField(function () { M.normalizeKeywords([]); }, "input", "非法：空数组抛 Error（err.field=input）");
throwsField(function () { M.normalizeKeywords(123); }, "input", "非法：数字抛 Error（err.field=input）");
throwsField(function () { M.normalizeKeywords(null); }, "input", "非法：null 抛 Error（err.field=input）");
throwsField(function () { M.normalizeKeywords(["a", 1]); }, "input", "非法：数组含非字符串抛 Error（err.field=input）");
var many = [];
for (var i = 0; i < 25; i++) many.push("词" + i);
eq(M.normalizeKeywords(many).length, 20, "边界：25 个关键词截断为 20");

/* ---------- 2. matchTags 确定性向量 ---------- */
deepEq(M.matchTags("美妆").map(function (e) { return e.tag; }),
  ["美妆", "makeup"], "向量：matchTags('美妆')→[美妆, makeup]（alias 命中，按 heat 降序）");
deepEq(M.matchTags("makeup").map(function (e) { return e.tag; }),
  ["美妆", "makeup"], "向量：matchTags('makeup')→[美妆, makeup]（英文不区分大小写）");
eq(M.matchTags("口红")[0].tag, "口红试色", "向量：matchTags('口红') 首命中口红试色（子串命中）");
eq(M.matchTags("量子纠缠").length, 0, "向量：零命中→空数组");
throwsField(function () { M.matchTags(""); }, "keyword", "非法：空字符串抛 Error（err.field=keyword）");
throwsField(function () { M.matchTags("   "); }, "keyword", "非法：纯空白抛 Error（err.field=keyword）");
throwsField(function () { M.matchTags(42); }, "keyword", "非法：数字抛 Error（err.field=keyword）");
throwsField(function () { M.matchTags(null); }, "keyword", "非法：null 抛 Error（err.field=keyword）");

/* ---------- 3. badgeFor 分档 ---------- */
eq(M.badgeFor(92), "🔥爆款", "徽章：92→🔥爆款");
eq(M.badgeFor(85), "🔥爆款", "徽章：85→🔥爆款（边界）");
eq(M.badgeFor(84), "📈热门", "徽章：84→📈热门");
eq(M.badgeFor(60), "📈热门", "徽章：60→📈热门（边界）");
eq(M.badgeFor(59), "🌱潜力", "徽章：59→🌱潜力");
eq(M.badgeFor(30), "🌱潜力", "徽章：30→🌱潜力（边界）");
eq(M.badgeFor(29), "💎长尾", "徽章：29→💎长尾");

/* ---------- 4. generateHashtags 确定性向量（规格逐字） ---------- */
var R1 = M.generateHashtags(["美妆", "旅行"], { platform: "xiaohongshu", count: 10, heatPref: "balanced" });
deepEq(R1.core, [
  { tag: "#美妆", heat: 92, badge: "🔥爆款" },
  { tag: "#旅行", heat: 91, badge: "🔥爆款" },
  { tag: "#makeup", heat: 85, badge: "🔥爆款" },
  { tag: "#travelphotography", heat: 66, badge: "📈热门" }
], "规格向量①：核心组逐字命中（alias 命中→heat 降序）");
deepEq(R1.trending, [
  { tag: "#美食", heat: 93, badge: "🔥爆款" },
  { tag: "#宠物", heat: 90, badge: "🔥爆款" },
  { tag: "#穿搭", heat: 90, badge: "🔥爆款" },
  { tag: "#健身", heat: 89, badge: "🔥爆款" }
], "规格向量②：热门组逐字命中（平台热门补足，heat 降序）");
deepEq(R1.niche, [], "规格向量③：小红书平台无 heat<60 候选→长尾组为空（候选不足不硬凑）");

/* 零命中保底派生策略 */
var R2 = M.generateHashtags(["量子纠缠"], { platform: "douyin", count: 5, heatPref: "balanced" });
deepEq(R2.core, [{ tag: "#量子纠缠", heat: 35, badge: "🌱潜力" }],
  "保底策略：零命中时从关键词派生 #量子纠缠 进核心组");
eq(R2.trending[0].tag, "#fyp", "保底策略：热门组照常按平台热门补足（抖音→fyp 首位）");
ok(R2.trending.length + R2.niche.length > 0, "保底策略：热门/长尾组不因零命中而为空");

/* 热度偏好改变组内排序 */
var R3 = M.generateHashtags(["美妆"], { platform: "instagram", count: 15, heatPref: "niche" });
deepEq(R3.core.map(function (t) { return t.tag; }), ["#makeup", "#美妆"],
  "热度偏好 niche：核心组内按 heat 升序");
var R3b = M.generateHashtags(["美妆"], { platform: "instagram", count: 15, heatPref: "hot" });
deepEq(R3b.core.map(function (t) { return t.tag; }), ["#美妆", "#makeup"],
  "热度偏好 hot：核心组内按 heat 降序");

/* 平台默认数量 */
eq(M.PLATFORM_DEFAULT_COUNT.xiaohongshu, 10, "平台默认：小红书→10");
eq(M.PLATFORM_DEFAULT_COUNT.douyin, 5, "平台默认：抖音→5");
eq(M.PLATFORM_DEFAULT_COUNT.instagram, 15, "平台默认：Instagram→15");
eq(M.PLATFORM_DEFAULT_COUNT.youtube, 10, "平台默认：YouTube→10");
eq(M.PLATFORM_DEFAULT_COUNT.general, 10, "平台默认：通用→10");
var R4 = M.generateHashtags(["美食"], {});
ok(R4.core.length + R4.trending.length + R4.niche.length <= 10,
  "缺省 opts：按通用平台默认 count=10 上限");

/* 三组去重 */
var R5 = M.generateHashtags(["美妆", "makeup"], { platform: "general", count: 20 });
var allTags = R5.core.concat(R5.trending, R5.niche).map(function (t) { return t.tag; });
var uniq = {};
allTags.forEach(function (t) { uniq[t] = true; });
eq(allTags.length, Object.keys(uniq).length, "三组之间无重复标签");

/* 非法参数 */
throwsField(function () { M.generateHashtags("美妆", {}); }, "keywords",
  "非法：keywords 非数组抛 Error（err.field=keywords）");
throwsField(function () { M.generateHashtags([], {}); }, "keywords",
  "非法：keywords 空数组抛 Error（err.field=keywords）");
throwsField(function () { M.generateHashtags(null, {}); }, "keywords",
  "非法：keywords 为 null 抛 Error（err.field=keywords）");
throwsField(function () { M.generateHashtags(["a"], { platform: "weibo" }); }, "platform",
  "非法：platform 非法抛 Error（err.field=platform）");
throwsField(function () { M.generateHashtags(["a"], { count: 7 }); }, "count",
  "非法：count=7 抛 Error（err.field=count）");
throwsField(function () { M.generateHashtags(["a"], { count: "10" }); }, "count",
  "非法：count 为字符串抛 Error（err.field=count）");
throwsField(function () { M.generateHashtags(["a"], { heatPref: "random" }); }, "heatPref",
  "非法：heatPref 非法抛 Error（err.field=heatPref）");

/* 标签库规模：≥8 品类 */
var cats = {};
M.TAG_DB.forEach(function (e) { cats[e.category] = true; });
ok(Object.keys(cats).length >= 8, "标签库：品类数≥8（实得 " + Object.keys(cats).length + "）");
ok(M.TAG_DB.every(function (e) {
  return e.tag && Array.isArray(e.alias) && typeof e.heat === "number" &&
    Array.isArray(e.platforms) && e.category;
}), "标签库：每条含 tag+alias+heat+platforms+category");

/* ---------- 5. categories.go 注册 ---------- */
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");
var hgIdx = GO_SRC.indexOf('"hashtag_generator"');
ok(hgIdx >= 0, "注册：categories.go 含 ID hashtag_generator");
ok(GO_SRC.indexOf('"/tools/hashtag-generator"') >= 0, "注册 Path /tools/hashtag-generator");
ok(GO_SRC.slice(hgIdx, hgIdx + 1400).indexOf('Icon:        "local_offer"') >= 0, "注册 Icon local_offer");
ok(GO_SRC.slice(hgIdx, hgIdx + 1400).indexOf("New:         true") >= 0, "注册 New 为 true");
ok(GO_SRC.slice(hgIdx, hgIdx + 1400).indexOf('Category:    "营销工具"') >= 0, "注册 Category 为营销工具");
ok(GO_SRC.slice(hgIdx, hgIdx + 2200).toLowerCase().indexOf("hashtag generator") >= 0, "Description 中英文双语（含英文）");
var pathRe = /"\/tools\/[^"]+"/g, seen = {}, m, pathCount = 0;
while ((m = pathRe.exec(GO_SRC)) !== null) { if (!seen[m[0]]) { seen[m[0]] = true; pathCount++; } }
eq(pathCount, 248, "注册 Path 总数 248→248");

/* ---------- 6. 模板：SEO／真限制／互链／零网络 ---------- */
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "hashtag_generator.html"), "utf8");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "hashtag-generator.js"), "utf8");
var FWD_TPL = fs.readFileSync(path.join(ROOT, "templates", "forbidden_word_detector.html"), "utf8");
var OG_TPL = fs.readFileSync(path.join(ROOT, "templates", "og_card_preview.html"), "utf8");
has(TPL_SRC, "{{define \"hashtag_generator\"}}", "模板 define 名与路由 hashtag-generator 对应");
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/hashtag-generator", "模板 canonical 含新 Path");
has(TPL_SRC, '"url":"https://www.johnkingzcq123.xyz/tools/hashtag-generator"', "模板 JSON-LD 含新 Path");
has(TPL_SRC, "社媒标签生成器", "模板 SEO：标题含社媒标签生成器");
has(TPL_SRC, "hashtag generator", "模板 SEO：含英文 hashtag generator");
has(TPL_SRC, "hashtag-generator.js", "模板引入 hashtag-generator.js");
has(TPL_SRC, "热度为内置快照", "真限制①：热度为内置快照非实时");
has(TPL_SRC, "平台算法变化", "真限制②：平台算法变化快");
has(TPL_SRC, "仅辅助创意", "真限制③：仅辅助创意");
has(TPL_SRC, "hg-input", "模板含关键词输入框 hg-input");
has(TPL_SRC, "hg-platform", "模板含平台选择 hg-platform");
has(TPL_SRC, "hg-count", "模板含数量档 hg-count");
has(TPL_SRC, "hg-error", "模板含行内报错区 hg-error");
has(TPL_SRC, "hashtags-", "模板下载文件名含 hashtags- 前缀");
has(TPL_SRC, "/tools/forbidden-word-detector", "互链：违禁词检测器（去向）");
has(TPL_SRC, "/tools/og-card-preview", "互链：OG 社交卡片预览（去向）");
has(FWD_TPL, "/tools/hashtag-generator", "双向互链：违禁词检测器模板回链社媒标签生成器");
has(OG_TPL, "/tools/hashtag-generator", "双向互链：OG 模板回链社媒标签生成器");
notHas(TPL_SRC, "域名创意", "不链未交付工具：无域名创意生成器");
notHas(TPL_SRC, "打印机测试", "不链未交付工具：无打印机测试页");
notHas(JS_SRC, "fetch(", "零网络：JS 无 fetch 调用");
notHas(JS_SRC, "XMLHttpRequest", "零网络：JS 无 XHR");
notHas(TPL_SRC, "fonts.googleapis", "模板零 CDN");

/* ---------- 汇总 ---------- */
console.log("\n通过 " + pass + "，失败 " + fail);
process.exit(fail === 0 ? 0 : 1);
