/* 域名创意生成器（domain_name_ideas）纯逻辑单元测试（零依赖）：
 * node tests/domain_name_ideas.test.js
 * 覆盖：normalizeKeywords 确定性向量与非法参数抛 Error（err.field="input"）、
 * toPinyin 确定性向量与非法参数（err.field="word"）、combineIdeas 确定性
 * 向量逐字命中（前缀/后缀/拼接/变形四组＋顺序）与非法参数抛 Error
 * （err.field="keywords"/"styles"/"perStyle"）、buildDomainLabels 确定性向量
 * 与非法参数（err.field="ideas"/"tlds"）、isValidLabel LDH 向量、
 * categories.go 注册（Path 总数 247→248、ID domain_name_ideas、Path
 * /tools/domain-name-ideas、Icon lightbulb、网络工具、New、中英文 Description）、
 * 模板 SEO 面板／真限制三条／互链（域名查询双向、Slug 生成器单向链入）／
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

var M = require("../static/js/domain-name-ideas.js");
var ROOT = path.join(__dirname, "..");

/* ---------- 1. normalizeKeywords 确定性向量 ---------- */
deepEq(M.normalizeKeywords("咖啡,  咖啡 ,coffee"),
  ["咖啡", "coffee"], "向量：'咖啡,  咖啡 ,coffee'→['咖啡','coffee']（去重＋逗号/空格切分）");
deepEq(M.normalizeKeywords("咖啡\n奶茶  云"), ["咖啡", "奶茶", "云"], "向量：换行/空格分隔");
deepEq(M.normalizeKeywords([" Coffee ", "coffee", "CLOUD"]),
  ["Coffee", "CLOUD"], "向量：数组去空＋英文大小写去重（保留首次形式）");
throwsField(function () { M.normalizeKeywords(""); }, "input", "非法：空字符串抛 Error（err.field=input）");
throwsField(function () { M.normalizeKeywords("  \n,， "); }, "input", "非法：纯分隔符抛 Error（err.field=input）");
throwsField(function () { M.normalizeKeywords([]); }, "input", "非法：空数组抛 Error（err.field=input）");
throwsField(function () { M.normalizeKeywords(123); }, "input", "非法：数字抛 Error（err.field=input）");
throwsField(function () { M.normalizeKeywords(null); }, "input", "非法：null 抛 Error（err.field=input）");
throwsField(function () { M.normalizeKeywords(["a", 1]); }, "input", "非法：数组含非字符串抛 Error（err.field=input）");
eq(M.normalizeKeywords(["a", "b", "c", "d", "e"]).length, 3, "边界：5 个关键词截断为 3");
eq(M.MAX_KEYWORDS, 3, "常量：MAX_KEYWORDS=3");

/* ---------- 2. toPinyin 确定性向量 ---------- */
eq(M.toPinyin("咖啡"), "kafei", "向量：toPinyin('咖啡')→'kafei'");
eq(M.toPinyin("Hello World"), "hello world", "向量：toPinyin('Hello World')→'hello world'（小写原样）");
eq(M.toPinyin("奶茶"), "naicha", "向量：toPinyin('奶茶')→'naicha'（增补字）");
eq(M.toPinyin("Cloud"), "cloud", "向量：英文转小写");
throwsField(function () { M.toPinyin(42); }, "word", "非法：数字抛 Error（err.field=word）");
throwsField(function () { M.toPinyin(""); }, "word", "非法：空字符串抛 Error（err.field=word）");
throwsField(function () { M.toPinyin(null); }, "word", "非法：null 抛 Error（err.field=word）");

/* ---------- 3. combineIdeas 确定性向量（规格逐字） ---------- */
deepEq(M.combineIdeas(["kafei"], { styles: ["prefix"], perStyle: 2 }),
  ["getkafei", "mykafei"], "规格向量①：前缀法逐字（前缀库固定顺序）");
deepEq(M.combineIdeas(["kafei"], { styles: ["suffix"], perStyle: 2 }),
  ["kafeihub", "kafeilab"], "向量：后缀法逐字（后缀库固定顺序）");
deepEq(M.combineIdeas(["kafei", "shop"], { styles: ["concat"], perStyle: 4 }),
  ["kafeishop", "kafei-shop", "shopkafei", "shop-kafei"],
  "向量：拼接组合（有序对连写＋短横连接）");
deepEq(M.combineIdeas(["kafei"], { styles: ["transform"], perStyle: 10 }),
  ["kf", "kafeii", "kaf3i"],
  "向量：创意变形（去元音/末字母双写/形近替换）");
deepEq(M.combineIdeas(["kafei"], { perStyle: 1 }),
  ["getkafei", "kafeihub", "kafeikafei", "kf"],
  "向量：缺省 styles 全选，按前缀→后缀→拼接→变形顺序");
/* 非法参数 */
throwsField(function () { M.combineIdeas("kafei", {}); }, "keywords",
  "非法：keywords 非数组抛 Error（err.field=keywords）");
throwsField(function () { M.combineIdeas([], {}); }, "keywords",
  "非法：keywords 空数组抛 Error（err.field=keywords）");
throwsField(function () { M.combineIdeas(["a", 1], {}); }, "keywords",
  "非法：keywords 元素非字符串抛 Error（err.field=keywords）");
throwsField(function () { M.combineIdeas(["a"], { styles: ["typo"] }); }, "styles",
  "非法：styles 含非法值抛 Error（err.field=styles）");
throwsField(function () { M.combineIdeas(["a"], { styles: [] }); }, "styles",
  "非法：styles 空数组抛 Error（err.field=styles）");
throwsField(function () { M.combineIdeas(["a"], { styles: "prefix" }); }, "styles",
  "非法：styles 非数组抛 Error（err.field=styles）");
throwsField(function () { M.combineIdeas(["a"], { perStyle: 0 }); }, "perStyle",
  "非法：perStyle=0 抛 Error（err.field=perStyle）");
throwsField(function () { M.combineIdeas(["a"], { perStyle: 61 }); }, "perStyle",
  "非法：perStyle=61 抛 Error（err.field=perStyle）");
throwsField(function () { M.combineIdeas(["a"], { perStyle: "10" }); }, "perStyle",
  "非法：perStyle 为字符串抛 Error（err.field=perStyle）");
/* LDH 过滤：非法 label 不应出现在输出中 */
var allLabels = M.combineIdeas(["kafei", "shop"]);
ok(allLabels.every(function (l) { return M.isValidLabel(l); }), "输出全部通过 isValidLabel（LDH 过滤）");
var uniq = {};
allLabels.forEach(function (l) { uniq[l] = true; });
eq(allLabels.length, Object.keys(uniq).length, "输出无重复 label");

/* ---------- 4. buildDomainLabels 确定性向量 ---------- */
deepEq(M.buildDomainLabels(["getkafei"], ["com", "cn"]),
  ["getkafei.com", "getkafei.cn"], "规格向量②：label.tld 展开");
deepEq(M.buildDomainLabels(["getkafei"], [".com"]),
  ["getkafei.com"], "向量：tld 前导点自动去除");
deepEq(M.buildDomainLabels(["a", "b"], ["com", "cn"]),
  ["a.com", "a.cn", "b.com", "b.cn"], "向量：ideas 主序、tlds 次序展开");
throwsField(function () { M.buildDomainLabels("x", ["com"]); }, "ideas",
  "非法：ideas 非数组抛 Error（err.field=ideas）");
throwsField(function () { M.buildDomainLabels([1], ["com"]); }, "ideas",
  "非法：ideas 元素非字符串抛 Error（err.field=ideas）");
throwsField(function () { M.buildDomainLabels(["a"], "com"); }, "tlds",
  "非法：tlds 非数组抛 Error（err.field=tlds）");
throwsField(function () { M.buildDomainLabels(["a"], []); }, "tlds",
  "非法：tlds 空数组抛 Error（err.field=tlds）");
throwsField(function () { M.buildDomainLabels(["a"], ["c_m"]); }, "tlds",
  "非法：tlds 含非法字符抛 Error（err.field=tlds）");

/* ---------- 5. isValidLabel LDH 向量 ---------- */
eq(M.isValidLabel("-bad"), false, "规格向量③：isValidLabel('-bad')→false（首连字符）");
eq(M.isValidLabel("good-name"), true, "规格向量③：isValidLabel('good-name')→true");
eq(M.isValidLabel("a".repeat(64)), false, "规格向量③：64 字符→false（>63）");
eq(M.isValidLabel("a".repeat(63)), true, "边界：63 字符→true");
eq(M.isValidLabel("ABC"), false, "大写→false（须全小写）");
eq(M.isValidLabel("bad-"), false, "尾连字符→false");
eq(M.isValidLabel(""), false, "空字符串→false");
eq(M.isValidLabel(42), false, "非字符串→false（谓词语义，不抛异常）");
eq(M.isValidLabel("getkafei"), true, "普通 label→true");

/* ---------- 6. categories.go 注册 ---------- */
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");
var dniIdx = GO_SRC.indexOf('"domain_name_ideas"');
ok(dniIdx >= 0, "注册：categories.go 含 ID domain_name_ideas");
ok(GO_SRC.indexOf('"/tools/domain-name-ideas"') >= 0, "注册 Path /tools/domain-name-ideas");
ok(GO_SRC.slice(dniIdx, dniIdx + 1600).indexOf('Icon:        "lightbulb"') >= 0, "注册 Icon lightbulb");
ok(GO_SRC.slice(dniIdx, dniIdx + 1600).indexOf("New:         true") >= 0, "注册 New 为 true");
ok(GO_SRC.slice(dniIdx, dniIdx + 1600).indexOf('Category:    "网络工具"') >= 0, "注册 Category 为网络工具");
ok(GO_SRC.slice(dniIdx, dniIdx + 2400).toLowerCase().indexOf("domain name ideas") >= 0, "Description 中英文双语（含英文）");
/* 紧邻域名查询：domain-check 条目之后、ip-lookup 条目之前 */
var dcIdx = GO_SRC.indexOf('"domain-check"');
var ipIdx = GO_SRC.indexOf('"ip-lookup"');
ok(dcIdx >= 0 && dniIdx > dcIdx && dniIdx < ipIdx, "品类归位：紧邻域名查询之后、IP查询之前");
var pathRe = /"\/tools\/[^"]+"/g, seen = {}, m, pathCount = 0;
while ((m = pathRe.exec(GO_SRC)) !== null) { if (!seen[m[0]]) { seen[m[0]] = true; pathCount++; } }
eq(pathCount, 248, "注册 Path 总数 247→248");

/* ---------- 7. 模板：SEO／真限制／互链／零网络 ---------- */
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "domain_name_ideas.html"), "utf8");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "domain-name-ideas.js"), "utf8");
var DC_TPL = fs.readFileSync(path.join(ROOT, "templates", "domain_check.html"), "utf8");
var SG_TPL = fs.readFileSync(path.join(ROOT, "templates", "slug_generator.html"), "utf8");
has(TPL_SRC, "{{define \"domain_name_ideas\"}}", "模板 define 名与路由 domain-name-ideas 对应");
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/domain-name-ideas", "模板 canonical 含新 Path");
has(TPL_SRC, "\"url\":\"https://www.johnkingzcq123.xyz/tools/domain-name-ideas\"", "模板 JSON-LD 含新 Path");
has(TPL_SRC, "域名创意生成器", "模板 SEO：标题含域名创意生成器");
has(TPL_SRC, "domain name ideas", "模板 SEO：含英文 domain name ideas");
has(TPL_SRC, "domain-name-ideas.js", "模板引入 domain-name-ideas.js");
has(TPL_SRC, "不含实时可用性检查", "真限制①：不含实时可用性检查（whois/RDAP 受限）");
has(TPL_SRC, "拼音字表覆盖有限", "真限制②：拼音字表覆盖有限");
has(TPL_SRC, "不保证可注册", "真限制③：创意不保证可注册");
has(TPL_SRC, "dny-input", "模板含关键词输入框 dny-input");
has(TPL_SRC, "dny-style", "模板含风格多选 dny-style");
has(TPL_SRC, "dny-tld", "模板含 TLD 多选 dny-tld");
has(TPL_SRC, "dny-error", "模板含行内报错区 dny-error");
has(TPL_SRC, "domain-ideas-", "模板下载文件名含 domain-ideas- 前缀");
has(TPL_SRC, "前缀法", "模板含前缀法风格");
has(TPL_SRC, "后缀法", "模板含后缀法风格");
has(TPL_SRC, "组合拼接", "模板含组合拼接风格");
has(TPL_SRC, "创意变形", "模板含创意变形风格");
has(TPL_SRC, "/tools/domain-check", "互链：域名查询（去向：看中了哪个去查注册状态）");
has(TPL_SRC, "看中了哪个", "互链文案：看中了哪个？去域名查询查注册状态");
has(TPL_SRC, "/tools/slug-generator", "单向链入：Slug 生成器");
has(DC_TPL, "/tools/domain-name-ideas", "双向互链：域名查询模板回链域名创意生成器");
has(DC_TPL, "还没想好名字", "回链文案：还没想好名字？用域名创意生成器");
notHas(SG_TPL, "/tools/domain-name-ideas", "单向链入：Slug 生成器模板不回链（保持单向）");
notHas(TPL_SRC, "打印机测试", "不链未交付工具：无打印机测试页");
notHas(TPL_SRC, "社媒标题", "不链未交付工具：无社媒标题生成器");
notHas(JS_SRC, "fetch(", "零网络：JS 无 fetch 调用");
notHas(JS_SRC, "XMLHttpRequest", "零网络：JS 无 XHR");
notHas(TPL_SRC, "fonts.googleapis", "模板零 CDN");

/* ---------- 汇总 ---------- */
console.log("\n通过 " + pass + "，失败 " + fail);
process.exit(fail === 0 ? 0 : 1);
