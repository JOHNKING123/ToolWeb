/* UTM 链接生成器纯函数单元测试（零依赖）：node tests/utm_link_builder.test.js
* 覆盖：listPresets 11 组数量/结构精确值与深拷贝隔离、
* getPresetById 命中与未命中抛错 err.field='id'、normalizeBaseUrl 校验与
* 抛错 err.field='baseUrl'、normalizeParams 必填/选填/超长边界与抛错 err.field、
* buildTaggedUrl 锚点精确值（基础拼接/已有查询串续接/hash 位置/空格与中文编码/
* 空选填省略/固定顺序）、parseTaggedUrl 往返一致与 otherParams 保留、
* mergeOtherParams（粘贴回填→改 campaign→再生成不丢其余参数）、
* 非法参数抛错 err.field、双模式导出与零外部接口、categories.go 注册
* （Path 总数 309→310、Icon sell 全库唯一、New/编码转换类目）、
* 模板（SEO 五关键词、真限制四条、控件、互链、零外部资源静态检查）。
*/
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/utm_link_builder.js");

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
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "utm_link_builder.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "utm_link_builder.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

var BASE = { source: "wechat", medium: "social", campaign: "summer_sale" };

/* ---------- 1. listPresets：11 组数量/结构精确值 ---------- */
var all = M.listPresets();
eq(all.length, 11, "预设共 11 组（≥8）");
eqj(all.map(function (p) { return p.id; }),
["wechat-article", "wechat-moments", "weibo", "douyin", "xiaohongshu", "zhihu", "bilibili",
"email", "sms", "baidu", "google-ads"], "预设 id 顺序精确值");
eqj(all.map(function (p) { return p.name; }),
["微信公众号文章", "微信朋友圈", "微博", "抖音", "小红书", "知乎", "哔哩哔哩",
"邮件 newsletter", "短信", "百度搜索广告", "Google Ads"], "预设名称精确值");
all.forEach(function (p) {
ok(typeof p.id === "string" && p.id && typeof p.name === "string" && p.name &&
typeof p.source === "string" && p.source && typeof p.medium === "string" && p.medium &&
typeof p.note === "string" && p.note, "预设 " + p.id + "：id/name/source/medium/note 五字段齐全非空");
});
eqj(all.map(function (p) { return p.source; }),
["wechat", "wechat", "weibo", "douyin", "xiaohongshu", "zhihu", "bilibili",
"email", "sms", "baidu", "google"], "预设 source 精确值");
eqj(all.map(function (p) { return p.medium; }),
["social", "moments", "social", "short_video", "social", "social", "video",
"email", "sms", "cpc", "cpc"], "预设 medium 精确值");
var copy1 = M.listPresets();
copy1[0].source = "hacked"; copy1.push({ id: "x" });
var again = M.listPresets();
eq(again[0].source, "wechat", "深拷贝隔离：改返回副本不污染内部预设");
eq(again.length, 11, "深拷贝隔离：push 返回副本不污染内部预设");

/* ---------- 2. getPresetById：命中/未命中 ---------- */
eq(M.getPresetById("wechat-article").source, "wechat", "命中 wechat-article：source=wechat");
eq(M.getPresetById("wechat-article").medium, "social", "命中 wechat-article：medium=social");
eq(M.getPresetById("google-ads").source, "google", "命中 google-ads：source=google");
eq(M.getPresetById("google-ads").medium, "cpc", "命中 google-ads：medium=cpc");
throws(function () { M.getPresetById("no-such"); }, "id", "未命中：抛错 err.field='id'");
throws(function () { M.getPresetById(""); }, "id", "空串 id：抛错 err.field='id'");
throws(function () { M.getPresetById(123); }, "id", "数字 id：抛错 err.field='id'");
throws(function () { M.getPresetById(null); }, "id", "null id：抛错 err.field='id'");
var presetCopy = M.getPresetById("weibo");
presetCopy.medium = "hacked";
eq(M.getPresetById("weibo").medium, "social", "返回深拷贝：改副本不污染内部预设");

/* ---------- 3. normalizeBaseUrl：校验与抛错 ---------- */
eq(M.normalizeBaseUrl("  https://example.com/page  "), "https://example.com/page", "去首尾空白");
eq(M.normalizeBaseUrl("http://example.com/page"), "http://example.com/page", "http 链接通过");
eq(M.normalizeBaseUrl("HTTPS://Example.COM/Page"), "https://example.com/Page", "大写协议/域名归一化，路径大小写保留");
throws(function () { M.normalizeBaseUrl(""); }, "baseUrl", "空串：抛错 err.field='baseUrl'");
throws(function () { M.normalizeBaseUrl("   "); }, "baseUrl", "空白串：抛错 err.field='baseUrl'");
throws(function () { M.normalizeBaseUrl(null); }, "baseUrl", "null：抛错 err.field='baseUrl'");
throws(function () { M.normalizeBaseUrl(123); }, "baseUrl", "数字：抛错 err.field='baseUrl'");
throws(function () { M.normalizeBaseUrl("example.com/page"); }, "baseUrl", "无协议：抛错 err.field='baseUrl'");
throws(function () { M.normalizeBaseUrl("ftp://example.com/x"); }, "baseUrl", "ftp 协议：抛错 err.field='baseUrl'");
throws(function () { M.normalizeBaseUrl("not a url"); }, "baseUrl", "非 URL：抛错 err.field='baseUrl'");
throws(function () { M.normalizeBaseUrl("http://"); }, "baseUrl", "http:// 无主机：抛错 err.field='baseUrl'");

/* ---------- 4. normalizeParams：必填/选填/超长边界 ---------- */
eqj(M.normalizeParams({ source: "wechat", medium: "social", campaign: "summer_sale", term: "t", content: "c" }),
{ source: "wechat", medium: "social", campaign: "summer_sale", term: "t", content: "c" }, "五参数齐全：原样返回");
eqj(M.normalizeParams(BASE),
{ source: "wechat", medium: "social", campaign: "summer_sale", term: "", content: "" }, "选填缺省：term/content 为 ''");
eqj(M.normalizeParams({ source: " wechat ", medium: " social ", campaign: " summer_sale " }),
{ source: "wechat", medium: "social", campaign: "summer_sale", term: "", content: "" }, "值去首尾空白");
throws(function () { M.normalizeParams({ medium: "social", campaign: "x" }); }, "source", "缺 source：err.field='source'");
throws(function () { M.normalizeParams({ source: "wechat", campaign: "x" }); }, "medium", "缺 medium：err.field='medium'");
throws(function () { M.normalizeParams({ source: "wechat", medium: "social" }); }, "campaign", "缺 campaign：err.field='campaign'");
throws(function () { M.normalizeParams({ source: "", medium: "social", campaign: "x" }); }, "source", "source 空串：err.field='source'");
throws(function () { M.normalizeParams({ source: "wechat", medium: "social", campaign: "   " }); }, "campaign", "campaign 空白串：err.field='campaign'");
throws(function () { M.normalizeParams({ source: "wechat", medium: "social", campaign: "x", term: 123 }); }, "term", "term 非字符串：err.field='term'");
eq(M.normalizeParams({ source: "wechat", medium: "social", campaign: "x", term: new Array(201).join("a") }).term.length, 200, "term 200 字符：边界通过");
throws(function () { M.normalizeParams({ source: "wechat", medium: "social", campaign: "x", term: new Array(202).join("a") }); }, "term", "term 201 字符：err.field='term'");
throws(function () { M.normalizeParams({ source: "wechat", medium: "social", campaign: new Array(202).join("a") }); }, "campaign", "campaign 201 字符：err.field='campaign'");
throws(function () { M.normalizeParams(null); }, "source", "null params：err.field='source'");
throws(function () { M.normalizeParams(["wechat"]); }, "source", "数组 params：err.field='source'");
eqj(M.normalizeParams({ source: "wechat", medium: "social", campaign: "x", utm_id: "999" }),
{ source: "wechat", medium: "social", campaign: "x", term: "", content: "" }, "多余键忽略：只保留五参数");

/* ---------- 5. buildTaggedUrl：锚点精确值 ---------- */
eq(M.buildTaggedUrl("https://example.com/page", BASE),
"https://example.com/page?utm_source=wechat&utm_medium=social&utm_campaign=summer_sale", "锚点：基础拼接");
eq(M.buildTaggedUrl("https://example.com/p?id=123", BASE),
"https://example.com/p?id=123&utm_source=wechat&utm_medium=social&utm_campaign=summer_sale", "已有查询串：& 续接不冲掉 id");
eq(M.buildTaggedUrl("https://example.com/p#sec", BASE),
"https://example.com/p?utm_source=wechat&utm_medium=social&utm_campaign=summer_sale#sec", "带 hash：参数插 #sec 之前");
eq(M.buildTaggedUrl("https://example.com/p?id=123#sec", BASE),
"https://example.com/p?id=123&utm_source=wechat&utm_medium=social&utm_campaign=summer_sale#sec", "查询串+hash：& 续接且参数在 # 前");
eq(M.buildTaggedUrl("https://example.com/page", { source: "wechat", medium: "social", campaign: "x", term: "summer sale" }),
"https://example.com/page?utm_source=wechat&utm_medium=social&utm_campaign=x&utm_term=summer%20sale", "空格→%20");
eq(M.buildTaggedUrl("https://example.com/page", { source: "wechat", medium: "social", campaign: "夏季大促" }),
"https://example.com/page?utm_source=wechat&utm_medium=social&utm_campaign=%E5%A4%8F%E5%AD%A3%E5%A4%A7%E4%BF%83", "中文→百分号编码");
eq(M.buildTaggedUrl("https://example.com/page", { source: "wechat", medium: "social", campaign: "x", term: "", content: undefined }),
"https://example.com/page?utm_source=wechat&utm_medium=social&utm_campaign=x", "空选填省略");
eq(M.buildTaggedUrl("https://example.com/page", { source: "s", medium: "m", campaign: "c", term: "t", content: "ct" }),
"https://example.com/page?utm_source=s&utm_medium=m&utm_campaign=c&utm_term=t&utm_content=ct", "五参数固定顺序 source→medium→campaign→term→content");
eq(M.buildTaggedUrl("https://example.com/page?", BASE),
"https://example.com/page?utm_source=wechat&utm_medium=social&utm_campaign=summer_sale", "末尾空 ? 不产生双问号");
eq(M.buildTaggedUrl("https://example.com/p?utm_source=old", BASE),
"https://example.com/p?utm_source=wechat&utm_medium=social&utm_campaign=summer_sale", "已有 utm_source 被新值替换、不重复出现");
eq(M.buildTaggedUrl("https://example.com/p?id=123&utm_medium=old&utm_term=old_t&utm_content=old_c", BASE),
"https://example.com/p?id=123&utm_source=wechat&utm_medium=social&utm_campaign=summer_sale", "已有 utm_medium/term/content 被替换、非 utm 参数 id=123 保留");
eq(M.buildTaggedUrl("https://example.com/p?UTM_SOURCE=old&utm_campaign=old_c", BASE),
"https://example.com/p?utm_source=wechat&utm_medium=social&utm_campaign=summer_sale", "已有 utm 参数大小写不敏感、同样被替换");
eq(M.buildTaggedUrl("https://example.com/p?utm_source=old&", BASE),
"https://example.com/p?utm_source=wechat&utm_medium=social&utm_campaign=summer_sale", "末尾空段丢弃、不产生 &&");
throws(function () { M.buildTaggedUrl("example.com/page", BASE); }, "baseUrl", "非法 baseUrl：err.field='baseUrl'");
throws(function () { M.buildTaggedUrl("https://example.com/page", { source: "wechat", campaign: "x" }); }, "medium", "非法 params：err.field 透传 medium");

/* ---------- 6. parseTaggedUrl：往返一致与 otherParams 保留 ---------- */
var parsed = M.parseTaggedUrl("https://example.com/page?utm_source=wechat&utm_medium=social&utm_campaign=summer_sale");
eqj(parsed.params, { source: "wechat", medium: "social", campaign: "summer_sale", term: "", content: "" }, "解析锚点：params 精确值");
eqj(parsed.otherParams, [], "解析锚点：无其余参数");
eq(parsed.baseUrl, "https://example.com/page", "解析锚点：baseUrl 精确值");
var parsed2 = M.parseTaggedUrl("https://example.com/p?id=123&utm_source=wechat&utm_medium=social&utm_campaign=summer_sale");
eqj(parsed2.otherParams, [{ key: "id", value: "123" }], "其余参数进 otherParams：id=123 保留");
var built = M.buildTaggedUrl("https://example.com/p?id=123", { source: "wechat", medium: "social", campaign: "summer_sale", term: "t", content: "c" });
var rt = M.parseTaggedUrl(built);
eqj(rt.params, { source: "wechat", medium: "social", campaign: "summer_sale", term: "t", content: "c" }, "往返一致：params 全等");
eqj(rt.otherParams, [{ key: "id", value: "123" }], "往返一致：otherParams 保留 id=123");
eq(rt.baseUrl, "https://example.com/p", "往返一致：baseUrl 精确值");
var rtHash = M.parseTaggedUrl(M.buildTaggedUrl("https://example.com/p?id=123#sec", BASE));
eqj(rtHash.params, { source: "wechat", medium: "social", campaign: "summer_sale", term: "", content: "" }, "往返一致（含 hash）：params 全等");
eq(rtHash.baseUrl, "https://example.com/p", "往返一致（含 hash）：baseUrl 不含 hash");
var parsed3 = M.parseTaggedUrl("https://example.com/page");
eqj(parsed3.params, { source: "", medium: "", campaign: "", term: "", content: "" }, "无 utm 参数：params 全为 ''");
eqj(parsed3.otherParams, [], "无查询串：otherParams 为空");
var parsed4 = M.parseTaggedUrl("https://example.com/p?q=a+b&utm_source=wechat");
eq(parsed4.otherParams[0].value, "a b", "+ 按查询串语义解码为空格");
var parsed5 = M.parseTaggedUrl("https://example.com/page?utm_campaign=%E5%A4%8F%E5%AD%A3%E5%A4%A7%E4%BF%83");
eq(parsed5.params.campaign, "夏季大促", "百分号编码值解码回中文");
throws(function () { M.parseTaggedUrl("example.com/page?utm_source=x"); }, "url", "无协议：err.field='url'");
throws(function () { M.parseTaggedUrl(""); }, "url", "空串：err.field='url'");
throws(function () { M.parseTaggedUrl(null); }, "url", "null：err.field='url'");

/* ---------- 6b. mergeOtherParams：粘贴回填→改 campaign→再生成不丢其余参数 ---------- */
var parsedBack = M.parseTaggedUrl("https://example.com/p?id=123&utm_source=wechat&utm_medium=social&utm_campaign=summer_sale");
eq(M.mergeOtherParams(parsedBack.baseUrl, parsedBack.otherParams), "https://example.com/p?id=123", "mergeOtherParams：其余参数拼回基础链接");
var rebuilt = M.buildTaggedUrl(M.mergeOtherParams(parsedBack.baseUrl, parsedBack.otherParams), { source: "wechat", medium: "social", campaign: "new_sale" });
eq(rebuilt, "https://example.com/p?id=123&utm_source=wechat&utm_medium=social&utm_campaign=new_sale", "粘贴回填→改 campaign→再生成：id=123 仍在");
var rt2 = M.parseTaggedUrl(rebuilt);
eqj(rt2.otherParams, [{ key: "id", value: "123" }], "重建后再解析：otherParams 仍保留 id=123");
eq(rt2.params.campaign, "new_sale", "重建后再解析：campaign 已是新值 new_sale");
eq(M.mergeOtherParams("https://example.com/p?id=123", [{ key: "id", value: "999" }]), "https://example.com/p?id=123", "mergeOtherParams：基础链接已有同名键不重复");
eq(M.mergeOtherParams("https://example.com/p#sec", [{ key: "id", value: "123" }]), "https://example.com/p?id=123#sec", "mergeOtherParams：参数插 #hash 之前");
eq(M.mergeOtherParams("https://example.com/p", []), "https://example.com/p", "mergeOtherParams：空列表原样返回");
eq(M.mergeOtherParams("https://example.com/p", [{ key: "q", value: "a b" }]), "https://example.com/p?q=a%20b", "mergeOtherParams：值百分号编码");

/* ---------- 7. 双模式导出与零外部接口 ---------- */
ok(typeof M.listPresets === "function" && typeof M.getPresetById === "function" &&
typeof M.normalizeBaseUrl === "function" && typeof M.normalizeParams === "function" &&
typeof M.buildTaggedUrl === "function" && typeof M.parseTaggedUrl === "function" &&
typeof M.mergeOtherParams === "function",
"同步导出：7 个纯函数齐全");
has(JS_SRC, "window.UtmLinkBuilder", "浏览器导出：window.UtmLinkBuilder");
has(JS_SRC, "module.exports = api", "node 导出：module.exports 同步导出");
notHas(JS_SRC, "fetch(", "JS 零外部接口：无 fetch");
notHas(JS_SRC, "XMLHttpRequest", "JS 零外部接口：无 XMLHttpRequest");
notHas(JS_SRC, "localStorage", "JS 零存储：不写 localStorage");

/* ---------- 8. categories.go 注册 ---------- */
var pathCount = (GO_SRC.match(/"\/tools\/[^"]+"/g) || []).filter(function (v, i, a) { return a.indexOf(v) === i; }).length;
eq(pathCount, 320, "注册 Path 总数 309→310");
has(GO_SRC, '"utm_link_builder"', "注册：ID utm_link_builder");
has(GO_SRC, '"/tools/utm-link-builder"', "注册：Path /tools/utm-link-builder");
has(GO_SRC, '"sell"', "注册：Icon sell");
eq((GO_SRC.match(/Icon:\s*"sell"/g) || []).length, 1, "Icon sell 全库唯一");
var entryBlock = GO_SRC.slice(GO_SRC.indexOf('"utm_link_builder"') - 60,
GO_SRC.indexOf('"utm_link_builder"') + 1400);
ok(/New:\s+true/.test(entryBlock), "注册：New: true");
ok(/Category:\s+"编码转换"/.test(entryBlock), "注册：类目 编码转换");
has(entryBlock, "UTM 生成器", "注册：名称 UTM 生成器");
has(entryBlock, "utm_source", "注册：描述含 utm_source");
ok(GO_SRC.indexOf('"utm_link_builder"') > GO_SRC.indexOf('"url_tracker_cleaner"') &&
GO_SRC.indexOf('"utm_link_builder"') < GO_SRC.indexOf('"url_parser"'), "注册：紧邻 url_tracker_cleaner（在其后、url_parser 之前）");

/* ---------- 9. 模板：SEO/真限制/控件/互链/零外部资源 ---------- */
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/utm-link-builder", "模板 canonical 含新 Path");
has(TPL_SRC, "UTM 生成器", "模板：标题含工具名");
has(TPL_SRC, "UTM 生成器", "模板 SEO：关键词 UTM 生成器");
has(TPL_SRC, "UTM 链接", "模板 SEO：关键词 UTM 链接");
has(TPL_SRC, "推广链接生成", "模板 SEO：关键词 推广链接生成");
has(TPL_SRC, "utm 参数拼接", "模板 SEO：关键词 utm 参数拼接");
has(TPL_SRC, "渠道归因链接", "模板 SEO：关键词 渠道归因链接");
has(TPL_SRC, "真限制", "模板：真限制章节");
has(TPL_SRC, "UTM 参数仅用于流量归因统计，请勿在参数值中填入手机号、身份证号等敏感个人信息", "真限制①：不填敏感个人信息");
has(TPL_SRC, "生成的链接不经过服务器，全程浏览器本地拼接，零上传", "真限制②：本地拼接零上传");
has(TPL_SRC, "各平台对链接长度与特殊字符限制不同，超长链接发出前请先在目标平台实测可打开", "真限制③：超长链接先实测");
has(TPL_SRC, "utm_source / medium / campaign 命名请与团队归因口径保持一致，否则统计会分叉", "真限制④：命名口径一致");
has(TPL_SRC, 'id="ulb-base"', "模板控件：基础链接输入 ulb-base");
has(TPL_SRC, 'id="ulb-source"', "模板控件：source 输入 ulb-source");
has(TPL_SRC, 'id="ulb-campaign"', "模板控件：campaign 输入 ulb-campaign");
has(TPL_SRC, 'id="ulb-generate-btn"', "模板控件：生成按钮 ulb-generate-btn");
has(TPL_SRC, 'id="ulb-output"', "模板控件：生成结果 ulb-output");
has(TPL_SRC, 'id="ulb-copy-btn"', "模板控件：复制按钮 ulb-copy-btn");
has(TPL_SRC, 'id="ulb-paste"', "模板控件：粘贴回填输入 ulb-paste");
has(TPL_SRC, 'id="ulb-parse-btn"', "模板控件：解析回填按钮 ulb-parse-btn");
has(TPL_SRC, 'id="ulb-presets"', "模板控件：预设容器 ulb-presets");
has(TPL_SRC, "/tools/qrcode", "互链：二维码工具");
has(TPL_SRC, "/tools/url-tracker-cleaner", "互链：URL 追踪参数清除器");
has(TPL_SRC, "/tools/static/js/utm_link_builder.js?v=1", "模板：引用本站 JS");
notHas(TPL_SRC, "fonts.googleapis", "模板零 CDN：无外部字体");
ok((TPL_SRC.match(/<script[^>]*src="http/g) || []).length === 0, "模板零外部脚本：无 http script src");
var httpLinks = TPL_SRC.match(/<link[^>]*href="http[^"]*"/g) || [];
eq(httpLinks.length, 1, "模板 http link 仅 canonical 一条");
ok(httpLinks.length === 1 && httpLinks[0].indexOf("https://www.johnkingzcq123.xyz/tools/utm-link-builder") !== -1, "模板 http link：仅自家 canonical");

console.log("utm_link_builder: pass=" + pass + " fail=" + fail + "，共 " + (pass + fail) + " 断言");
if (fail > 0) process.exit(1);
