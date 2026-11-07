/* 国际电话区号查询纯函数单元测试（零依赖）：node tests/dial_code_lookup.test.js
 * 覆盖：区号锚点精确值（CN→86、US→1、GB→44、JP→81、KR→82、HK→852、
 * MO→853、TW→886）、共享区号（+1 含 US/CA、+7 含 RU/KZ、+44/+61/+262
 * 等多国组）、getByDialCode 三种写法（+86/86/0086）、searchCountries
 * 大小写不敏感（united 含 US 与 GB）、parseNumber 最长区号匹配
 * （+1242→巴哈马、+44207→英国）与无法识别返 null、formatExample
 * 占位号段、非法参数 err.field（query/iso/code/input）、收录数下限
 * （实际 246 ≥200、ISO 唯一、dialCode 纯数字、排序规则）、categories.go
 * 注册（Path 总数 326→327、Icon call 全库唯一、紧邻 ip_lookup）、模板
 * （SEO 关键词、真限制五条、控件、互链、零外部资源静态检查）、浏览器
 * 绑定源码级检查（window.DialCodeLookup、常用国家速查、复制／清空）。
 * Icon 说明：规格首选 call 经双源验真——官方 Material Icons codepoints
 * 全库 2235 条有 call e0b0；实时下发的 Material Icons v145 woff2 cmap
 * 共 2226 字形，含 U+E0B0（call）；备选 contact_phone e0cf／
 * phone_in_talk e61d／flag e153 亦在 codepoints 与 cmap 内，但 call
 * 精确值全库 0 命中且为最贴切 glyph，锁定 call。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/dial_code_lookup.js");

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
function throwsMsg(fn, field, sub, name) {
    try { fn(); ok(false, name + "（应抛错却未抛）"); }
    catch (e) {
        ok((!field || e.field === field) && String(e.message).indexOf(sub) !== -1,
            name + "（err.field 期望 " + field + "、message 应含 " + sub +
            "，实得 field=" + e.field + " message=" + e.message + "）");
    }
}
function isos(list) { return list.map(function (c) { return c.iso; }); }
function contains(list, iso) { return isos(list).indexOf(iso) !== -1; }

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "dial_code_lookup.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "dial_code_lookup.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. getByIso 区号锚点精确值 ---------- */
eq(M.getByIso("CN").dialCode, "86", "锚点 CN→86");
eq(M.getByIso("US").dialCode, "1", "锚点 US→1");
eq(M.getByIso("GB").dialCode, "44", "锚点 GB→44");
eq(M.getByIso("JP").dialCode, "81", "锚点 JP→81");
eq(M.getByIso("KR").dialCode, "82", "锚点 KR→82");
eq(M.getByIso("HK").dialCode, "852", "锚点 HK→852");
eq(M.getByIso("MO").dialCode, "853", "锚点 MO→853");
eq(M.getByIso("TW").dialCode, "886", "锚点 TW→886");
eq(M.getByIso("cn").dialCode, "86", "getByIso 大小写不敏感 cn→86");
eq(M.getByIso("Gb").dialCode, "44", "getByIso 大小写不敏感 Gb→44");
eq(M.getByIso("CN").name, "中国", "getByIso CN 中文名 中国");
eq(M.getByIso("US").nameEn, "United States", "getByIso US 英文名 United States");
eq(M.getByIso("SG").dialCode, "65", "锚点 SG→65");
eq(M.getByIso("DE").dialCode, "49", "锚点 DE→49");
eq(M.getByIso("AU").dialCode, "61", "锚点 AU→61");
throwsMsg(function () { M.getByIso("XX"); }, "iso", "未收录", "getByIso 未知 ISO 抛错含「未收录」");
throws(function () { M.getByIso(""); }, "iso", "getByIso 空串抛错 err.field=iso");
throws(function () { M.getByIso(123); }, "iso", "getByIso 非字符串抛错 err.field=iso");
throws(function () { M.getByIso("CNA"); }, "iso", "getByIso 三位码抛错 err.field=iso");
throws(function () { M.getByIso("C1"); }, "iso", "getByIso 含数字抛错 err.field=iso");

/* ---------- 2. getByDialCode 反向查区号 ---------- */
eq(M.getByDialCode("86").length, 1, "getByDialCode 86 长度 1");
ok(contains(M.getByDialCode("86"), "CN"), "getByDialCode 86 含 CN");
eqj(isos(M.getByDialCode("+86")), ["CN"], "getByDialCode +86 同 86");
eqj(isos(M.getByDialCode("0086")), ["CN"], "getByDialCode 0086 同 86");
ok(M.getByDialCode("1").length >= 2, "getByDialCode 1 长度≥2（共享区号）");
ok(contains(M.getByDialCode("1"), "US") && contains(M.getByDialCode("1"), "CA"), "getByDialCode 1 含 US 与 CA");
ok(M.getByDialCode("7").length >= 2, "getByDialCode 7 长度≥2（共享区号）");
ok(contains(M.getByDialCode("7"), "RU") && contains(M.getByDialCode("7"), "KZ"), "getByDialCode 7 含 RU 与 KZ");
ok(M.getByDialCode("44").length >= 2, "getByDialCode 44 长度≥2（英国／根西／泽西／马恩岛）");
ok(contains(M.getByDialCode("44"), "GB") && contains(M.getByDialCode("44"), "GG"), "getByDialCode 44 含 GB 与 GG");
ok(M.getByDialCode("61").length >= 2, "getByDialCode 61 长度≥2（澳大利亚／科科斯／圣诞岛）");
ok(contains(M.getByDialCode("61"), "AU") && contains(M.getByDialCode("61"), "CC"), "getByDialCode 61 含 AU 与 CC");
ok(M.getByDialCode("262").length >= 2, "getByDialCode 262 长度≥2（留尼汪／马约特）");
ok(contains(M.getByDialCode("262"), "RE") && contains(M.getByDialCode("262"), "YT"), "getByDialCode 262 含 RE 与 YT");
eq(M.getByDialCode("1242").length, 1, "getByDialCode 1242 长度 1（NANP 巴哈马）");
ok(contains(M.getByDialCode("1242"), "BS"), "getByDialCode 1242 含 BS");
eq(M.getByDialCode("999").length, 0, "getByDialCode 999 无匹配返空数组");
throws(function () { M.getByDialCode("00"); }, "code", "getByDialCode 00 剥离后空串抛错 err.field=code");
throws(function () { M.getByDialCode(""); }, "code", "getByDialCode 空串抛错 err.field=code");
throws(function () { M.getByDialCode("abc"); }, "code", "getByDialCode 含字母抛错 err.field=code");
throws(function () { M.getByDialCode("+"); }, "code", "getByDialCode 仅 + 抛错 err.field=code");
throws(function () { M.getByDialCode(86); }, "code", "getByDialCode 非字符串抛错 err.field=code");
throws(function () { M.getByDialCode("+86a"); }, "code", "getByDialCode +86a 抛错 err.field=code");

/* ---------- 3. searchCountries 国家搜索 ---------- */
ok(contains(M.searchCountries("中国"), "CN"), "搜索 中国 含 CN");
ok(contains(M.searchCountries("86"), "CN"), "搜索 86 含 CN");
ok(contains(M.searchCountries("united"), "US") && contains(M.searchCountries("united"), "GB"), "搜索 united 含 US 与 GB");
ok(contains(M.searchCountries("UNITED"), "US") && contains(M.searchCountries("UNITED"), "GB"), "搜索 UNITED 大小写不敏感含 US 与 GB");
ok(contains(M.searchCountries("cn"), "CN"), "搜索 cn（ISO 小写）含 CN");
ok(contains(M.searchCountries("852"), "HK"), "搜索 852 含 HK");
ok(contains(M.searchCountries("日本"), "JP"), "搜索 日本 含 JP");
ok(contains(M.searchCountries("Japan"), "JP"), "搜索 Japan 含 JP");
eq(M.searchCountries("").length, M.getAllCountries().length, "搜索 空串返回全部");
eq(M.searchCountries("   ").length, M.getAllCountries().length, "搜索 纯空白返回全部");
eq(M.searchCountries("不存在的国家xyz").length, 0, "搜索 无匹配返空数组");
throws(function () { M.searchCountries(123); }, "query", "搜索 非字符串抛错 err.field=query");
throws(function () { M.searchCountries(null); }, "query", "搜索 null 抛错 err.field=query");
ok(M.searchCountries("中国香港").length >= 1 && contains(M.searchCountries("中国香港"), "HK"), "搜索 中国香港 含 HK");
ok(contains(M.searchCountries("Korea"), "KR"), "搜索 Korea 含 KR");

/* ---------- 4. parseNumber 号码解析 ---------- */
var p1 = M.parseNumber("+8613800000000");
eq(p1.dialCode, "86", "解析 +8613800000000 区号 86");
eq(p1.nationalNumber, "13800000000", "解析 +8613800000000 本地号");
ok(contains(p1.countries, "CN"), "解析 +8613800000000 含 CN");
var p2 = M.parseNumber("00814400000000");
eq(p2.dialCode, "81", "解析 00814400000000 区号 81");
ok(contains(p2.countries, "JP"), "解析 00814400000000 含 JP");
var p3 = M.parseNumber("+12425551234");
eq(p3.dialCode, "1242", "解析 +1242 最长匹配 巴哈马 1242（非 1）");
ok(contains(p3.countries, "BS"), "解析 +1242 含 BS");
var p4 = M.parseNumber("+442071234567");
eq(p4.dialCode, "44", "解析 +44207 最长匹配 英国 44");
ok(contains(p4.countries, "GB"), "解析 +44207 含 GB");
var p5 = M.parseNumber("+1 202 555 0100");
eq(p5.dialCode, "1", "解析 +1 202 555 0100 区号 1（空格剥离）");
ok(contains(p5.countries, "US"), "解析 +1 202 555 0100 含 US");
var p6 = M.parseNumber("+86-138-0000-0000");
eq(p6.dialCode, "86", "解析 +86-138-0000-0000 连字符剥离区号 86");
eq(M.parseNumber("12345"), null, "解析 12345 无前缀返 null");
eq(M.parseNumber("13800000000"), null, "解析 本地号无前缀返 null");
eq(M.parseNumber("+999123456"), null, "解析 +999 未知区号返 null");
eq(M.parseNumber(""), null, "解析 空串返 null");
throws(function () { M.parseNumber(123); }, "input", "解析 非字符串抛错 err.field=input");

/* ---------- 5. formatExample 拨号格式示例 ---------- */
ok(M.formatExample("CN").indexOf("+86") !== -1, "示例 CN 含 +86");
ok(M.formatExample("CN").indexOf("0086") !== -1, "示例 CN 含 0086（00 写法）");
ok(M.formatExample("CN").indexOf("138 0000 0000") !== -1, "示例 CN 用占位号段 138 0000 0000");
ok(M.formatExample("US").indexOf("+1") !== -1, "示例 US 含 +1");
ok(M.formatExample("GB").indexOf("+44") !== -1, "示例 GB 含 +44");
throws(function () { M.formatExample("XX"); }, "iso", "示例 未知 ISO 抛错 err.field=iso");
throws(function () { M.formatExample(""); }, "iso", "示例 空串抛错 err.field=iso");

/* ---------- 6. getAllCountries 收录规模与结构 ---------- */
var all = M.getAllCountries();
eq(all.length, 246, "收录总数 246");
ok(all.length >= 200, "收录数下限 ≥200");
var seenIso = {}, dupIso = 0, badCode = 0, badField = 0, i;
for (i = 0; i < all.length; i++) {
    if (seenIso[all[i].iso]) { dupIso++; }
    seenIso[all[i].iso] = true;
    if (!/^[0-9]+$/.test(all[i].dialCode)) { badCode++; }
    if (!all[i].name || !all[i].nameEn || !/^[A-Z]{2}$/.test(all[i].iso)) { badField++; }
}
eq(dupIso, 0, "ISO 全库唯一");
eq(badCode, 0, "dialCode 全为纯数字字符串");
eq(badField, 0, "每项 name／nameEn 非空、iso 为 2 位大写字母");
var sortedOk = true;
for (i = 1; i < all.length; i++) {
    var pd = parseInt(all[i - 1].dialCode, 10), cd = parseInt(all[i].dialCode, 10);
    if (cd < pd) { sortedOk = false; break; }
    if (cd === pd && all[i].name < all[i - 1].name) { sortedOk = false; break; }
}
ok(sortedOk, "排序：区号升序、同区号按中文名排序");
eq(all[0].dialCode, "1", "排序首项区号 1");
eq(all[all.length - 1].dialCode, "1876", "排序末项区号 1876（数值最大为 NANP 牙买加 +1876）");
ok(all[0].iso === "US" || all[0].iso === "CA", "排序首项为 US／CA 之一（+1 组按中文名排序）");
eq(all[1].dialCode, "1", "排序次项仍为区号 1（美国／加拿大同组）");
var again = M.getAllCountries();
eqj(all, again, "getAllCountries 两次调用结果一致");
all[0].name = "篡改";
eq(M.getAllCountries()[0].name === "篡改", false, "getAllCountries 返回副本不污染内部数据");

/* ---------- 7. categories.go 注册 ---------- */
var pathCount = (GO_SRC.match(/"\/tools\/[^"]+"/g) || []).filter(function (v, i, a) { return a.indexOf(v) === i; }).length;
eq(pathCount, 327, "注册 Path 总数 326→327");
has(GO_SRC, "\"dial_code_lookup\"", "注册：ID dial_code_lookup");
has(GO_SRC, "\"/tools/dial-code-lookup\"", "注册：Path /tools/dial-code-lookup");
has(GO_SRC, "\"call\"", "注册：Icon call");
eq((GO_SRC.match(/Icon:\s*"call"/g) || []).length, 1, "Icon call 全库唯一（官方 codepoints e0b0、v145 woff2 cmap 含 U+E0B0）");
var entryBlock = GO_SRC.slice(GO_SRC.indexOf("\"dial_code_lookup\"") - 60,
    GO_SRC.indexOf("\"dial_code_lookup\"") + 1800);
ok(/New:\s+true/.test(entryBlock), "注册：New: true");
ok(/Category:\s+"网络工具"/.test(entryBlock), "注册：类目 网络工具");
has(entryBlock, "国际电话区号查询", "注册：名称 国际电话区号查询");
has(entryBlock, "246", "注册：描述注明收录 246 个国家／地区");
ok(GO_SRC.indexOf("\"dial_code_lookup\"") > GO_SRC.indexOf("\"ip-lookup\"") &&
    GO_SRC.indexOf("\"dial_code_lookup\"") < GO_SRC.indexOf("\"my-ip\""),
    "注册：紧邻 ip_lookup（在其后、my-ip 之前）");

/* ---------- 8. 模板：SEO/真限制/控件/互链/零外部资源 ---------- */
has(TPL_SRC, "{{define \"dial_code_lookup\"}}", "模板：define dial_code_lookup");
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/dial-code-lookup", "模板 canonical 含新 Path");
has(TPL_SRC, "国际电话区号查询", "模板：标题含工具名");
has(TPL_SRC, "国际电话区号", "模板：SEO 关键词 国际电话区号");
has(TPL_SRC, "国家区号查询", "模板：SEO 关键词 国家区号查询");
has(TPL_SRC, "拨打国际电话", "模板：SEO 关键词 拨打国际电话");
has(TPL_SRC, "国际区号表", "模板：SEO 关键词 国际区号表");
has(TPL_SRC, "五条真限制", "模板：五条真限制标题");
has(TPL_SRC, "区号以 ITU E.164 国家区号为准", "模板：真限制 1 E.164 基准");
has(TPL_SRC, "2026-11-07", "模板：真限制 1 明示核对日期 2026-11-07");
has(TPL_SRC, "+1、+7 等区号由多国共享", "模板：真限制 2 共享区号");
has(TPL_SRC, "拨号示例为格式演示", "模板：真限制 3 示例为占位号");
has(TPL_SRC, "只做国家区号查询", "模板：真限制 4 只做区号");
has(TPL_SRC, "不做号码归属地查询", "模板：真限制 4 不做归属地");
has(TPL_SRC, "不做运营商查询", "模板：真限制 4 不做运营商");
has(TPL_SRC, "未收录不代表不存在", "模板：真限制 5 未收录不代表不存在");
has(TPL_SRC, "南极洲", "模板：真限制 5 南极洲示例");
has(TPL_SRC, "246 个国家／地区", "模板：页面明示收录 246");
has(TPL_SRC, "id=\"dc-search\"", "模板：国家搜索输入框 dc-search");
has(TPL_SRC, "id=\"dc-list\"", "模板：搜索结果列表 dc-list");
has(TPL_SRC, "id=\"dc-detail\"", "模板：选中国家详情 dc-detail");
has(TPL_SRC, "id=\"dc-reverse\"", "模板：反向查区号输入框 dc-reverse");
has(TPL_SRC, "id=\"dc-reverse-result\"", "模板：反向查结果 dc-reverse-result");
has(TPL_SRC, "id=\"dc-parse\"", "模板：号码解析输入框 dc-parse");
has(TPL_SRC, "id=\"dc-parse-result\"", "模板：号码解析结果 dc-parse-result");
has(TPL_SRC, "id=\"dc-quick\"", "模板：常用国家速查 dc-quick");
has(TPL_SRC, "id=\"dc-stats\"", "模板：统计面板 dc-stats");
has(TPL_SRC, "id=\"dc-copy-btn\"", "模板：复制结果按钮 dc-copy-btn");
has(TPL_SRC, "id=\"dc-clear\"", "模板：清空按钮 dc-clear");
has(TPL_SRC, "call", "模板：标题图标 call");
has(TPL_SRC, "号码不出浏览器", "模板：隐私声明 号码不出浏览器");
has(TPL_SRC, "/tools/ip-lookup", "模板：互链 ip_lookup");
has(TPL_SRC, "IP 查询", "模板：互链 IP 查询");
has(TPL_SRC, "/tools/timezone-converter", "模板：互链 timezone_converter");
has(TPL_SRC, "时区转换器", "模板：互链 时区转换器");
has(TPL_SRC, "不做 IP／时区查询", "模板：分工说明 不做 IP／时区查询");
notHas(TPL_SRC, "fonts.googleapis", "模板零 CDN：无外部字体");
notHas(TPL_SRC, "cdnjs", "模板零 CDN：无 cdnjs");
notHas(TPL_SRC, "unpkg", "模板零 CDN：无 unpkg");
notHas(TPL_SRC, "jsdelivr", "模板零 CDN：无 jsdelivr");
ok((TPL_SRC.match(/<script[^>]*src="http/g) || []).length === 0, "模板零外部脚本：无 http script src");
var httpLinks = TPL_SRC.match(/<link[^>]*href="http[^"]*"/g) || [];
eq(httpLinks.length, 1, "模板 http link 仅 canonical 一条");
ok(httpLinks.length === 1 && httpLinks[0].indexOf("https://www.johnkingzcq123.xyz/tools/dial-code-lookup") !== -1, "模板 http link：仅自家 canonical");
has(TPL_SRC, "/tools/static/js/dial_code_lookup.js", "模板：加载本站 JS");

/* ---------- 9. JS 源码与浏览器绑定检查 ---------- */
has(JS_SRC, "window.DialCodeLookup", "绑定：挂 window.DialCodeLookup");
has(JS_SRC, "module.exports", "绑定：module.exports 同步导出");
has(JS_SRC, "getAllCountries", "绑定：getAllCountries");
has(JS_SRC, "searchCountries", "绑定：searchCountries");
has(JS_SRC, "getByIso", "绑定：getByIso");
has(JS_SRC, "getByDialCode", "绑定：getByDialCode");
has(JS_SRC, "formatExample", "绑定：formatExample");
has(JS_SRC, "parseNumber", "绑定：parseNumber");
has(JS_SRC, "ITU E.164", "数据：文件头注明 ITU E.164 基准");
has(JS_SRC, "2026-11-07", "数据：文件头注明核对日期 2026-11-07");
has(JS_SRC, "dc-search", "绑定：国家搜索输入框");
has(JS_SRC, "dc-list", "绑定：搜索结果列表");
has(JS_SRC, "dc-detail", "绑定：选中国家详情");
has(JS_SRC, "dc-reverse", "绑定：反向查区号");
has(JS_SRC, "dc-parse", "绑定：号码解析");
has(JS_SRC, "dc-quick", "绑定：常用国家速查");
has(JS_SRC, "dc-stats", "绑定：统计面板");
has(JS_SRC, "dc-copy-btn", "绑定：复制结果按钮");
has(JS_SRC, "dc-clear", "绑定：清空按钮");
has(JS_SRC, "'CN', 'US', 'GB', 'JP', 'KR', 'SG', 'HK', 'TW', 'AU', 'DE'", "绑定：常用国家速查十国（中／美／英／日／韩／新／港／台／澳／德）");
ok((JS_SRC.match(/"HK", "852"/g) || []).length === 1, "数据：HK 852 唯一");
ok((JS_SRC.match(/"CN", "86"/g) || []).length === 1, "数据：CN 86 唯一");

console.log("dial_code_lookup: pass=" + pass + " fail=" + fail);
process.exit(fail ? 1 : 0);
