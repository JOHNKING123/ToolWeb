/* 社媒标题/简介生成器（social_title_generator）纯逻辑单元测试（零依赖）：
* node tests/social_title_generator.test.js
* 覆盖：normalizeKeywords 确定性向量（规格逐字）与非法参数抛 Error（err.field="keywords"）、
* pickTemplates 确定性向量（规格逐字：非空＋每条含 {k1}）与非法参数（err.field="platform"/"tone"）、
* renderTitle 确定性向量（规格逐字）与非法参数（err.field="tpl"/"keywords"）、
* buildDownloadName 确定性向量（规格逐字）与非法参数（err.field="dt"）、
* generateFor 分组结构、三层模板库规模（4 平台 × 4 语气 × 5 条）、
* categories.go 注册（Path 总数 249→250、ID social_title_generator、Path
* /tools/social-title-generator、Icon title、营销工具、New、中英文 Description）、
* 模板 SEO 面板／真限制三条／互链（社媒标签生成器双向、违禁词检测器/OG 单向链入）／
* 不链未交付工具、零网络请求静态检查。
*/
"use strict";
var fs = require("fs");
var path = require("path");

var pass = 0, fail = 0;
function ok(cond, name) {
if (cond) { pass++;}
else { fail++; console.error("FAIL:", name);}
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）");}
function deepEq(a, b, name) { eq(JSON.stringify(a), JSON.stringify(b), name);}
function throwsField(fn, field, name) {
try { fn();} catch (e) {
ok(e instanceof Error && e.field === field,
name + "（期望抛 Error 且 err.field=" + JSON.stringify(field) + "，实得 " +
(e instanceof Error? "Error field=" + JSON.stringify(e.field): typeof e) + "）");
return;
}
fail++; console.error("FAIL:", name + "（未抛出异常）");
}
function has(s, sub, name) { ok(s.indexOf(sub)!== -1, name);}
function notHas(s, sub, name) { ok(s.indexOf(sub) === -1, name);}

var M = require("../static/js/social-title-generator.js");
var ROOT = path.join(__dirname, "..");

/* ---------- 1. normalizeKeywords 确定性向量（规格逐字） ---------- */
deepEq(M.normalizeKeywords(" 咖啡, 咖啡,拉花 "), ["咖啡", "拉花"],
"规格向量①：normalizeKeywords(' 咖啡, 咖啡,拉花 ')→['咖啡','拉花']");
deepEq(M.normalizeKeywords("咖啡 拉花 拿铁 美式"), ["咖啡", "拉花", "拿铁"],
"向量：空格分隔＋上限 3 截断");
deepEq(M.normalizeKeywords("咖啡\n拉花；拿铁"), ["咖啡", "拉花", "拿铁"],
"向量：换行/分号多分隔符");
deepEq(M.normalizeKeywords("Coffee,coffee"), ["Coffee"],
"向量：英文大小写不敏感去重");
throwsField(function () { M.normalizeKeywords("");}, "keywords", "非法：空字符串抛 Error（err.field=keywords）");
throwsField(function () { M.normalizeKeywords(",，； ");}, "keywords", "非法：纯分隔符抛 Error（err.field=keywords）");
throwsField(function () { M.normalizeKeywords(123);}, "keywords", "非法：数字抛 Error（err.field=keywords）");
throwsField(function () { M.normalizeKeywords(null);}, "keywords", "非法：null 抛 Error（err.field=keywords）");
throwsField(function () { M.normalizeKeywords(["a"]);}, "keywords", "非法：数组抛 Error（err.field=keywords）");

/* ---------- 2. pickTemplates 确定性向量（规格逐字） ---------- */
var v21 = M.pickTemplates("xiaohongshu", "plant");
ok(Array.isArray(v21) && v21.length > 0, "规格向量②：pickTemplates('xiaohongshu','plant') 返回非空数组");
ok(v21.every(function (t) { return t.indexOf("{k1}")!== -1;}),
"规格向量②：每条模板含 {k1} 槽位标记");
throwsField(function () { M.pickTemplates("weibo", "plant");}, "platform",
"非法：platform 非法抛 Error（err.field=platform）");
throwsField(function () { M.pickTemplates("xiaohongshu", "hot");}, "tone",
"非法：tone 非法抛 Error（err.field=tone）");
throwsField(function () { M.pickTemplates();}, "platform",
"非法：platform 缺省抛 Error（err.field=platform）");
throwsField(function () { M.pickTemplates("douyin");}, "tone",
"非法：tone 缺省抛 Error（err.field=tone）");

/* 全部 16 组合：非空、每条含 {k1} */
var combos = 0;
M.PLATFORMS.forEach(function (p) {
M.TONES.forEach(function (t) {
var arr = M.pickTemplates(p, t);
ok(Array.isArray(arr) && arr.length >= 3, "组合 " + p + "×" + t + "：模板数≥3");
ok(arr.every(function (x) { return x.indexOf("{k1}")!== -1;}),
"组合 " + p + "×" + t + "：每条含 {k1}");
combos++;
});
});
eq(combos, 16, "平台×语气组合总数 4×4=16");
eq(M.PLATFORMS.length, 4, "平台 4 个：小红书/抖音/Instagram/YouTube");
eq(M.TONES.length, 4, "语气 4 种：种草/干货/搞笑/正式");

/* ---------- 3. renderTitle 确定性向量（规格逐字） ---------- */
eq(M.renderTitle("【{k1}】种草攻略", "咖啡"), "【咖啡】种草攻略",
"规格向量③：renderTitle('【{k1}】种草攻略','咖啡')→'【咖啡】种草攻略'");
eq(M.renderTitle("{k1}和{k2}的{k3}日常", ["咖啡", "拉花"]), "咖啡和拉花的咖啡日常",
"向量：{k2} 替换＋{k3} 缺项回退 k1");
eq(M.renderTitle("{k1}×{k2}", "a"), "a×a",
"向量：字符串 keywords 视为单关键词，{k2} 回退 k1");
throwsField(function () { M.renderTitle("没有槽位的模板", ["咖啡"]);}, "tpl",
"非法：tpl 无槽位抛 Error（err.field=tpl）");
throwsField(function () { M.renderTitle("", ["咖啡"]);}, "tpl",
"非法：tpl 空字符串抛 Error（err.field=tpl）");
throwsField(function () { M.renderTitle(123, ["咖啡"]);}, "tpl",
"非法：tpl 非字符串抛 Error（err.field=tpl）");
throwsField(function () { M.renderTitle("{k1}攻略", []);}, "keywords",
"非法：keywords 空数组抛 Error（err.field=keywords）");
throwsField(function () { M.renderTitle("{k1}攻略", 123);}, "keywords",
"非法：keywords 数字抛 Error（err.field=keywords）");
throwsField(function () { M.renderTitle("{k1}攻略", null);}, "keywords",
"非法：keywords 为 null 抛 Error（err.field=keywords）");

/* ---------- 4. buildDownloadName 确定性向量（规格逐字） ---------- */
eq(M.buildDownloadName(new Date(2026, 10, 1, 1, 42, 0)), "social-title-20261101-014200.txt",
"规格向量④：buildDownloadName(new Date(2026,10,1,1,42,0))→'social-title-20261101-014200.txt'");
throwsField(function () { M.buildDownloadName("abc");}, "dt",
"非法：dt 为字符串抛 Error（err.field=dt）");
throwsField(function () { M.buildDownloadName(null);}, "dt",
"非法：dt 为 null 抛 Error（err.field=dt）");
throwsField(function () { M.buildDownloadName(new Date("invalid"));}, "dt",
"非法：dt 为无效日期抛 Error（err.field=dt）");
ok(/^social-title-\d{8}-\d{6}\.txt$/.test(M.buildDownloadName()),
"缺省：buildDownloadName() 取当前时间，格式 social-title-YYYYMMDD-HHmmss.txt");

/* ---------- 5. generateFor 分组结构 ---------- */
var G = M.generateFor("douyin", "guide", ["咖啡", "拉花"]);
eq(G.platform, "douyin", "generateFor：platform 回填");
eq(G.platformName, "抖音", "generateFor：platformName 中文");
eq(G.toneName, "干货", "generateFor：toneName 中文");
eq(G.titles.length, 5, "generateFor：每平台 5 条标题");
ok(G.titles.every(function (t) { return t.indexOf("{k1}") === -1 && t.indexOf("咖啡")!== -1;}),
"generateFor：标题槽位已替换、无残留 {k1}");
ok(typeof G.bio === "string" && G.bio.length > 0 && G.bio.indexOf("{k") === -1,
"generateFor：配套简介 1 段、槽位已替换");
var G2 = M.generateFor("xiaohongshu", "plant", ["咖啡"]);
eq(G2.titles.length, 5, "generateFor：单关键词照常 5 条");
throwsField(function () { M.generateFor("weibo", "plant", ["a"]);}, "platform",
"generateFor：非法 platform 透传 err.field=platform");
throwsField(function () { M.generateFor("douyin", "hot", ["a"]);}, "tone",
"generateFor：非法 tone 透传 err.field=tone");

/* 全量文本格式 */
var TXT = M.formatAllText([G]);
has(TXT, "【抖音 · 干货】", "formatAllText：分组头含平台·语气");
has(TXT, "简介：", "formatAllText：含简介段落");

/* ---------- 6. categories.go 注册 ---------- */
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");
var stgIdx = GO_SRC.indexOf('"social_title_generator"');
ok(stgIdx >= 0, "注册：categories.go 含 ID social_title_generator");
ok(GO_SRC.indexOf('"/tools/social-title-generator"') >= 0, "注册 Path /tools/social-title-generator");
ok(GO_SRC.slice(stgIdx, stgIdx + 1400).indexOf('Icon:        "title"') >= 0, "注册 Icon title");
ok(GO_SRC.slice(stgIdx, stgIdx + 1400).indexOf("New:         true") >= 0, "注册 New 为 true");
ok(GO_SRC.slice(stgIdx, stgIdx + 1400).indexOf('Category:    "营销工具"') >= 0, "注册 Category 为营销工具");
ok(GO_SRC.slice(stgIdx, stgIdx + 2200).toLowerCase().indexOf("social title") >= 0, "Description 中英文双语（含英文）");
var pathRe = /"\/tools\/[^"]+"/g, seen = {}, m, pathCount = 0;
while ((m = pathRe.exec(GO_SRC))!== null) { if (!seen[m[0]]) { seen[m[0]] = true; pathCount++;}}
eq(pathCount, 326, "注册 Path 总数 309→310");

/* ---------- 7. 模板：SEO／真限制／互链／零网络 ---------- */
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "social_title_generator.html"), "utf8");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "social-title-generator.js"), "utf8");
var HG_TPL = fs.readFileSync(path.join(ROOT, "templates", "hashtag_generator.html"), "utf8");
has(TPL_SRC, "{{define \"social_title_generator\"}}", "模板 define 名与路由 social-title-generator 对应");
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/social-title-generator", "模板 canonical 含新 Path");
has(TPL_SRC, '"url":"https://www.johnkingzcq123.xyz/tools/social-title-generator"', "模板 JSON-LD 含新 Path");
has(TPL_SRC, "社媒标题", "模板 SEO：标题含社媒标题");
has(TPL_SRC, "social title", "模板 SEO：含英文 social title");
has(TPL_SRC, "social-title-generator.js", "模板引入 social-title-generator.js");
has(TPL_SRC, "模板非爆款保证", "真限制①：模板非爆款保证");
has(TPL_SRC, "算法变化快", "真限制②：平台算法变化快");
has(TPL_SRC, "字数截断", "真限制③：简介字数截断");
has(TPL_SRC, "stg-input", "模板含关键词输入框 stg-input");
has(TPL_SRC, "stg-platform", "模板含平台多选 stg-platform");
has(TPL_SRC, "stg-tone", "模板含语气单选 stg-tone");
has(TPL_SRC, "stg-error", "模板含行内报错区 stg-error");
has(TPL_SRC, "social-title-", "模板下载文件名含 social-title- 前缀");
has(TPL_SRC, "/tools/hashtag-generator", "互链：社媒标签生成器（双向）");
has(TPL_SRC, "/tools/forbidden-word-detector", "互链：违禁词检测器（单向链入）");
has(TPL_SRC, "/tools/og-card-preview", "互链：OG 社交卡片预览（单向链入）");
has(HG_TPL, "/tools/social-title-generator", "双向互链：社媒标签生成器模板回链本工具");
notHas(TPL_SRC, "简繁", "不链未交付工具：无简繁互转");
notHas(TPL_SRC, "打印机测试", "不链未交付工具：无打印机测试页");
notHas(JS_SRC, "fetch(", "零网络：JS 无 fetch 调用");
notHas(JS_SRC, "XMLHttpRequest", "零网络：JS 无 XHR");
notHas(TPL_SRC, "fonts.googleapis", "模板零 CDN");

/* ---------- 汇总 ---------- */
console.log("\n通过 " + pass + "，失败 " + fail);
process.exit(fail === 0? 0: 1);
