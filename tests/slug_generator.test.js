/* Slug 生成器（slug_generator）纯逻辑单元测试（零依赖）：
 * node tests/slug_generator.test.js
 * 覆盖：规格确定性向量逐值命中（slugify 四向量、分隔符/maxLength/拼音开关选项、
 * batchSlugs 批量、非法参数抛 Error 的 err.field）、拼音字表首屏延迟加载、
 * 两组示例结构、categories.go 注册（Path 总数 239→240）与零网络请求静态检查、
 * 模板真限制三条、与 OG 社交卡片预览双向互链、与 URL 编码/解码单向链入、
 * Description 中英文双语、不链未交付工具。
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

/* ---------- 0. 拼音字表首屏延迟加载（用全新模块实例，避免被后续调用污染） ---------- */
var JS_PATH = require.resolve("../static/js/slug_generator.js");
delete require.cache[JS_PATH];
var F = require("../static/js/slug_generator.js");
eq(F.pinyinLoaded(), false, "延迟加载：require 后字表尚未加载");
eq(F.slugify("abc", { pinyin: false }).slug, "abc", "延迟加载：纯英文＋拼音关闭不触发字表加载");
eq(F.pinyinLoaded(), false, "延迟加载：无汉字输入时字表仍未加载");
eq(F.slugify("工具").slug, "gong-ju", "延迟加载：首次遇到汉字触发加载并转写");
eq(F.pinyinLoaded(), true, "延迟加载：使用后字表已加载");
eq(F.loadPinyinTable()["工"], "gong", "延迟加载：字表含 工→gong");

var M = require("../static/js/slug_generator.js");

/* ---------- 1. 规格确定性向量 ---------- */
eq(M.slugify("Hello World").slug, "hello-world", "向量1：slugify(\"Hello World\")→\"hello-world\"");
eq(M.slugify("  Café — Résumé  ").slug, "cafe-resume", "向量2：slugify(\"  Café — Résumé  \")→\"cafe-resume\"");
eq(M.slugify("a:b=c:d 换算", { pinyin: false }).slug, "a-b-c-d", "向量3：slugify(\"a:b=c:d 换算\",{pinyin:false})→\"a-b-c-d\"");
eq(M.slugify("工具网站").slug, "gong-ju-wang-zhan", "向量4：slugify(\"工具网站\")→\"gong-ju-wang-zhan\"（拼音表锁定）");
eq(M.slugify("Hello World", { separator: "_" }).slug, "hello_world", "选项：分隔符 _");
eq(M.slugify("Hello World", { separator: "-" }).slug, "hello-world", "选项：分隔符 - 显式");
eq(M.slugify("hello-beautiful-world", { maxLength: 12 }).slug, "hello", "选项：maxLength 单词边界截断（12→hello）");
eq(M.slugify("hello", { maxLength: 100 }).slug, "hello", "选项：maxLength 大于长度不截断");
eq(M.slugify("hello world", { maxLength: null }).slug, "hello-world", "选项：maxLength null 不限");
eq(M.slugify("abcdefghij", { maxLength: 5 }).slug, "abcde", "选项：无分隔符时 maxLength 硬截断");
eq(M.slugify("Hi 你好").slug, "hi-ni-hao", "混合：英文＋中文拼音混排");

/* ---------- 2. 中文删除与表外字 ---------- */
var rNoPy = M.slugify("工具网站", { pinyin: false });
eq(rNoPy.slug, "", "拼音关闭：中文全部删除结果为空");
ok(rNoPy.dropped.indexOf("工") !== -1 && rNoPy.dropped.length === 4, "拼音关闭：dropped 列出 4 个被删字");
var rRare = M.slugify("龘", { pinyin: true });
eq(rRare.slug, "", "表外字：龘 不在字表结果为空");
ok(rRare.dropped.indexOf("龘") !== -1, "表外字：dropped 提示 龘 需人工复核");

/* ---------- 3. batchSlugs 批量 ---------- */
var b = M.batchSlugs("Hello World\n工具网站", {});
eq(b.length, 2, "批量：2 行输入得 2 条结果");
eq(b[0].line, 1, "批量：首行行号 1");
eq(b[0].input, "Hello World", "批量：首行原文保留");
eq(b[0].slug, "hello-world", "批量：首行 slug");
eq(b[1].slug, "gong-ju-wang-zhan", "批量：次行 slug");
var b2 = M.batchSlugs("a\n\n   \nb", { separator: "_" });
eq(b2.length, 2, "批量：空行自动跳过");
eq(b2[1].slug, "b", "批量：选项 separator 透传");

/* ---------- 4. 非法参数抛 Error（err.field） ---------- */
throwsField(function () { M.slugify(123); }, "text", "非法参数：slugify(123) 抛 Error，err.field=text");
throwsField(function () { M.slugify(null); }, "text", "非法参数：slugify(null) 抛 Error，err.field=text");
throwsField(function () { M.slugify("x", { separator: "*" }); }, "separator", "非法参数：separator 非法抛 Error，err.field=separator");
throwsField(function () { M.slugify("x", { maxLength: 0 }); }, "maxLength", "非法参数：maxLength 0 抛 Error，err.field=maxLength");
throwsField(function () { M.slugify("x", { maxLength: 2.5 }); }, "maxLength", "非法参数：maxLength 非整数抛 Error，err.field=maxLength");
throwsField(function () { M.slugify("x", { maxLength: "10" }); }, "maxLength", "非法参数：maxLength 字符串抛 Error，err.field=maxLength");
throwsField(function () { M.slugify("x", { pinyin: "yes" }); }, "pinyin", "非法参数：pinyin 非布尔抛 Error，err.field=pinyin");
throwsField(function () { M.batchSlugs(123); }, "lines", "非法参数：batchSlugs(123) 抛 Error，err.field=lines");

/* ---------- 5. 两组示例 ---------- */
eq(M.EXAMPLES.basic, "The Ultimate Guide to URL Slugs (2026)", "示例一：英文标题原文");
eq(M.EXAMPLES.chinese, "工具网站 SEO 优化实战", "示例二：中文标题原文");
eq(M.slugify(M.EXAMPLES.basic).slug, "the-ultimate-guide-to-url-slugs-2026", "示例一：生成结果逐值命中");
eq(M.slugify(M.EXAMPLES.chinese).slug, "gong-ju-wang-zhan-seo-you-hua-shi-zhan", "示例二：生成结果逐值命中");

/* ---------- 6. categories.go 注册 ---------- */
var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "slug_generator.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "slug_generator.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");
var OG_TPL = fs.readFileSync(path.join(ROOT, "templates", "og_card_preview.html"), "utf8");

var slugIdx = GO_SRC.indexOf('"slug_generator"');
ok(slugIdx >= 0, "注册 ID slug_generator");
ok(GO_SRC.indexOf('"/tools/slug-generator"') >= 0, "注册 Path /tools/slug-generator");
ok(GO_SRC.slice(slugIdx, slugIdx + 900).indexOf('Icon:        "short_text"') >= 0, "注册 Icon short_text");
ok(GO_SRC.slice(slugIdx, slugIdx + 900).indexOf("New:         true") >= 0, "注册 New 为 true");
ok(GO_SRC.slice(slugIdx, slugIdx + 900).indexOf('Category:    "营销工具"') >= 0, "注册 Category 为营销工具");
var ogIdx = GO_SRC.indexOf('"og_card_preview"');
ok(ogIdx >= 0 && slugIdx > ogIdx, "注册紧邻 og_card_preview 之后（互链家族相邻）");
ok(GO_SRC.indexOf("URL slug generator") >= 0, "Description 中英文双语（含英文）");
var pathRe = /"\/tools\/[^"]+"/g, seen = {}, m, pathCount = 0;
while ((m = pathRe.exec(GO_SRC)) !== null) { if (!seen[m[0]]) { seen[m[0]] = true; pathCount++; } }
eq(pathCount, 240, "注册 Path 总数 239→240");

/* ---------- 7. 模板：真限制/互链/零网络 ---------- */
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/slug-generator", "模板 canonical 含新 Path");
has(TPL_SRC, "表外字删除须人工复核", "真限制①：拼音表外字删除须人工复核");
has(TPL_SRC, "仅规范化 URL 路径片段", "真限制②：仅规范化 URL 路径片段");
has(TPL_SRC, "纯前端本地生成", "真限制③：纯前端本地生成");
has(TPL_SRC, "/tools/og-card-preview", "互链：OG 社交卡片预览（双向）");
has(TPL_SRC, "/tools/url-codec", "链入：URL 编码/解码（单向）");
notHas(TPL_SRC, "/tools/proportion", "不链未交付工具：无比例求解器");
has(TPL_SRC, "sg-input", "模板含标题输入框 sg-input");
has(TPL_SRC, "sg-output", "模板含实时预览 sg-output");
has(TPL_SRC, "sg-batch-input", "模板含批量输入区 sg-batch-input");
has(TPL_SRC, "sg-batch-output", "模板含批量结果区 sg-batch-output");
has(TPL_SRC, "slug_generator.js?v=1", "模板引用外部 JS");
has(TPL_SRC, '"url":"https://www.johnkingzcq123.xyz/tools/slug-generator"', "模板 JSON-LD 含新 Path");
has(OG_TPL, "/tools/slug-generator", "双向互链：OG 模板回链 Slug 生成器");
notHas(JS_SRC, "fetch(", "零网络：JS 无 fetch 调用");
notHas(JS_SRC, "XMLHttpRequest", "零网络：JS 无 XHR");
notHas(TPL_SRC, "fonts.googleapis", "模板零 CDN");

console.log("PASS " + pass + " / FAIL " + fail);
if (fail > 0) process.exit(1);
