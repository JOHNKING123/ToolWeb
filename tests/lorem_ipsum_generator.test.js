/* Lorem Ipsum 生成器纯逻辑单元测试（零依赖）：node tests/lorem_ipsum_generator.test.js
* 覆盖：段落数 1／3／20、每段句子数 1／5／10、经典开头开关、自定义首词、
* 英中切换、HTML 包裹与转义、范围钳制正反例、统计一致、2 组示例、
* 恢复默认、重新生成换批、段内不重复、注册（186→187 Path）与零网络请求、
* 模板真限制文案与互链（仅 Mock 生成器与 Markdown 预览，无未交付硬凑互链）。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/lorem_ipsum_generator.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function has(s, sub, name) { ok(String(s).indexOf(sub) !== -1, name + "（应包含 " + JSON.stringify(sub) + "）"); }
function notHas(s, sub, name) { ok(String(s).indexOf(sub) === -1, name + "（不应包含 " + JSON.stringify(sub) + "）"); }

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "lorem_ipsum_generator.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "lorem_ipsum_generator.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* 确定性随机源：循环返回固定序列，供 node 断言复现。 */
function seqRand(values) {
  var i = 0;
  return function () { var v = values[i % values.length]; i++; return v; };
}
function countChar(s, ch) { return String(s).split(ch).length - 1; }

/* ---------- 1. 默认值与经典开头 ---------- */
eq(M.DEFAULTS.lang, "en", "默认值：语言英文");
eq(M.DEFAULTS.paragraphs, 3, "默认值：段落数 3");
eq(M.DEFAULTS.sentencesPerParagraph, 5, "默认值：每段句子数 5");
eq(M.DEFAULTS.start, "classic", "默认值：经典开头");
eq(M.DEFAULTS.format, "text", "默认值：纯文本格式");
var def = M.generateLorem(M.DEFAULTS, seqRand([0.1, 0.3, 0.5, 0.7, 0.9]));
eq(def.paragraphs.length, 3, "默认生成：段落数为 3");
eq(def.stats.paragraphs, 3, "默认生成：统计段落数 3");
eq(def.stats.sentences, 15, "默认生成：总句子数 15");
ok(def.paragraphs[0].indexOf(M.CLASSIC_FIRST) === 0, "经典开头：首段首句为标准首句");
eq(M.CLASSIC_FIRST, "Lorem ipsum dolor sit amet, consectetur adipiscing elit.", "标准首句文本正确");
ok(def.text.indexOf("\n\n") !== -1, "纯文本：段落间空行分隔");

/* ---------- 2. 段落数 1／20 切换 ---------- */
eq(M.generateLorem({ lang: "en", paragraphs: 1, sentencesPerParagraph: 5, start: "random", format: "text" }, seqRand([0.2])).paragraphs.length, 1, "段落数 1：输出 1 段");
eq(M.generateLorem({ lang: "en", paragraphs: 20, sentencesPerParagraph: 2, start: "random", format: "text" }, seqRand([0.2, 0.4])).paragraphs.length, 20, "段落数 20：输出 20 段");
eq(M.generateLorem({ lang: "en", paragraphs: 20, sentencesPerParagraph: 2, start: "random", format: "text" }, seqRand([0.2, 0.4])).stats.sentences, 40, "段落数 20×每段 2 句：总句子数 40");

/* ---------- 3. 每段句子数 1／5／10 ---------- */
var s1 = M.generateLorem({ lang: "en", paragraphs: 2, sentencesPerParagraph: 1, start: "random", format: "text" }, seqRand([0.3, 0.6]));
eq(countChar(s1.paragraphs[0], "."), 1, "每段 1 句：首段句号数为 1");
var s10 = M.generateLorem({ lang: "en", paragraphs: 1, sentencesPerParagraph: 10, start: "random", format: "text" }, seqRand([0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95]));
eq(countChar(s10.paragraphs[0], "."), 10, "每段 10 句：首段句号数为 10");
eq(s10.stats.sentences, 10, "每段 10 句：总句子数 10");

/* ---------- 4. 随机开头与重新生成换批 ---------- */
var rnd = M.generateLorem({ lang: "en", paragraphs: 1, sentencesPerParagraph: 3, start: "random", format: "text" }, seqRand([0.5, 0.6, 0.7]));
ok(rnd.paragraphs[0].indexOf(M.CLASSIC_FIRST) !== 0, "随机开头：首句不固定为标准首句");
var batchA = M.generateLorem({ lang: "en", paragraphs: 2, sentencesPerParagraph: 3, start: "random", format: "text" }, seqRand([0.1]));
var batchB = M.generateLorem({ lang: "en", paragraphs: 2, sentencesPerParagraph: 3, start: "random", format: "text" }, seqRand([0.9]));
ok(batchA.text !== batchB.text, "重新生成：不同随机源换一批组合");
var sameSeed = M.generateLorem({ lang: "en", paragraphs: 1, sentencesPerParagraph: 3, start: "random", format: "text" }, seqRand([0.5, 0.6, 0.7]));
eq(sameSeed.text, rnd.text, "同一注入随机源：同一批次可复现（仅测试确定性）");

/* ---------- 5. 自定义首词 ---------- */
var customEn = M.generateLorem({ lang: "en", paragraphs: 1, sentencesPerParagraph: 3, start: "custom", customWord: "hello world", format: "text" }, seqRand([0.4]));
ok(customEn.paragraphs[0].indexOf("Hello world.") === 0, "自定义首词英文：首字母大写、句末补句号");
var customFlat = M.generateLorem({ lang: "en", paragraphs: 1, sentencesPerParagraph: 2, start: "custom", customWord: "hello\nworld", format: "text" }, seqRand([0.4]));
ok(customFlat.paragraphs[0].indexOf("Hello world.") === 0, "自定义首词换行展平为空格");
eq(M.flattenText("a\r\nb\rc\nd"), "a b c d", "换行展平：CRLF／CR／LF 各转一个空格");
eq(M.applyCustomWord("hello", "en"), "Hello.", "首词处理英文：补句号");
eq(M.applyCustomWord("hello.", "en"), "Hello.", "首词处理英文：已有句号不重复补");
eq(M.applyCustomWord("示例首词", "zh"), "示例首词。", "首词处理中文：直接拼接补句号");
var customZh = M.generateLorem({ lang: "zh", paragraphs: 1, sentencesPerParagraph: 2, start: "custom", customWord: "示例首词", format: "text" }, seqRand([0.4]));
ok(customZh.paragraphs[0].indexOf("示例首词。") === 0, "自定义首词中文：首段首句以该词开头");
var customEmpty = M.generateLorem({ lang: "en", paragraphs: 1, sentencesPerParagraph: 2, start: "custom", customWord: "   ", format: "text" }, seqRand([0.4]));
ok(customEmpty.paragraphs.length === 1, "自定义首词为空：仍生成不为空");
has(customEmpty.warnings.join("\n"), "自定义首词为空", "自定义首词为空：中文提示非空");
has(customEmpty.warnings.join("\n"), "随机开头", "自定义首词为空：提示按随机开头处理");

/* ---------- 6. 英中切换与中文语料 ---------- */
ok(M.ZH_SENTENCES.length >= 20, "中文语料：20 句以上");
ok(M.EN_SENTENCES.length >= 20, "英文语料：20 句以上");
var zh = M.generateLorem({ lang: "zh", paragraphs: 2, sentencesPerParagraph: 3, start: "random", format: "text" }, seqRand([0.2, 0.4, 0.6]));
eq(zh.paragraphs.length, 2, "中文切换：段落数同步");
eq(countChar(zh.paragraphs[0], "。"), 3, "中文切换：每段句子数同步");
ok(/[\u4e00-\u9fa5]/.test(zh.text), "中文切换：输出含中文");
ok(!/Lorem ipsum/.test(zh.text), "中文切换：输出不含英文语料");
var zhSentences = zh.paragraphs[0].split("。").filter(function (s) { return s !== ""; });
eq(new Set(zhSentences).size, zhSentences.length, "中文段内句子不重复");

/* ---------- 7. HTML 包裹与转义 ---------- */
var html = M.generateLorem({ lang: "en", paragraphs: 2, sentencesPerParagraph: 2, start: "random", format: "html" }, seqRand([0.3, 0.5]));
ok(html.html.indexOf("<p>") === 0, "HTML 格式：以 <p> 开头");
eq(countChar(html.html, "<p>"), 2, "HTML 格式：段落数与 <p> 数一致");
ok(html.html.lastIndexOf("</p>") === html.html.length - 4, "HTML 格式：以 </p> 结尾");
eq(M.escapeHtml("<a>&\"'"), "&lt;a&gt;&amp;&quot;&#39;", "HTML 转义：五类字符全转义");
var evil = M.generateLorem({ lang: "en", paragraphs: 1, sentencesPerParagraph: 2, start: "custom", customWord: "<script>alert(1)</script>", format: "html" }, seqRand([0.4]));
has(evil.html, "&lt;script&gt;", "自定义首词 HTML：输出中转义");
notHas(evil.html.replace(/<\/?p>/g, ""), "<script>", "自定义首词 HTML：除 <p> 包裹外无原始标签");

/* ---------- 8. 范围钳制正反例 ---------- */
var lowP = M.generateLorem({ lang: "en", paragraphs: 0, sentencesPerParagraph: 5, start: "random", format: "text" }, seqRand([0.3]));
eq(lowP.clamped.paragraphs, 1, "段落数 0：钳制到最小值 1");
has(lowP.warnings.join("\n"), "段落数", "段落数钳制：提示指明段落数");
var highP = M.generateLorem({ lang: "en", paragraphs: 99, sentencesPerParagraph: 5, start: "random", format: "text" }, seqRand([0.3]));
eq(highP.clamped.paragraphs, 20, "段落数 99：钳制到最大值 20");
has(highP.warnings.join("\n"), "20", "段落数钳制：提示含边界值");
var lowS = M.generateLorem({ lang: "en", paragraphs: 2, sentencesPerParagraph: 0, start: "random", format: "text" }, seqRand([0.3]));
eq(lowS.clamped.sentencesPerParagraph, 1, "每段句子数 0：钳制到最小值 1");
has(lowS.warnings.join("\n"), "每段句子数", "句子数钳制：提示指明每段句子数");
var highS = M.generateLorem({ lang: "en", paragraphs: 2, sentencesPerParagraph: 99, start: "random", format: "text" }, seqRand([0.3]));
eq(highS.clamped.sentencesPerParagraph, 10, "每段句子数 99：钳制到最大值 10");
var nanP = M.generateLorem({ lang: "en", paragraphs: "abc", sentencesPerParagraph: 5, start: "random", format: "text" }, seqRand([0.3]));
eq(nanP.clamped.paragraphs, 3, "段落数非数字：按默认值 3 处理");
has(nanP.warnings.join("\n"), "段落数", "段落数非数字：提示指明段落数");
ok(M.clampCount(5, 1, 20, "段落数", 3).warning === "", "范围内合法值：无提示");
var legal = M.generateLorem({ lang: "en", paragraphs: 3, sentencesPerParagraph: 5, start: "random", format: "text" }, seqRand([0.3]));
eq(legal.warnings.length, 0, "合法输入：无警告");

/* ---------- 9. 统计一致 ---------- */
var st = M.generateLorem({ lang: "en", paragraphs: 3, sentencesPerParagraph: 4, start: "random", format: "text" }, seqRand([0.2, 0.4, 0.6, 0.8]));
eq(st.stats.sentences, 12, "统计：总句子数＝段落数×每段句子数");
eq(st.stats.words, M.countWords(st.paragraphs.join(" "), "en"), "统计：英文词数与输出一致");
var stZh = M.generateLorem({ lang: "zh", paragraphs: 2, sentencesPerParagraph: 3, start: "random", format: "text" }, seqRand([0.2, 0.4, 0.6]));
eq(stZh.stats.words, M.countWords(stZh.paragraphs.join(" "), "zh"), "统计：中文字数与输出一致");
eq(M.countWords("", "en"), 0, "统计：空文本词数为 0");
eq(M.countWords("hello world", "en"), 2, "统计：英文切词计数");

/* ---------- 10. 示例与恢复默认 ---------- */
eq(M.SAMPLE_EN.lang, "en", "示例 1：英文");
eq(M.SAMPLE_EN.paragraphs, 3, "示例 1：3 段");
eq(M.SAMPLE_EN.start, "classic", "示例 1：经典开头");
var sampleEn = M.generateLorem(M.SAMPLE_EN, seqRand([0.2]));
ok(sampleEn.paragraphs[0].indexOf(M.CLASSIC_FIRST) === 0, "示例 1 生成：首句为标准首句");
eq(M.SAMPLE_ZH.lang, "zh", "示例 2：中文");
eq(M.SAMPLE_ZH.paragraphs, 2, "示例 2：2 段");
eq(M.SAMPLE_ZH.start, "random", "示例 2：随机开头");
var sampleZh = M.generateLorem(M.SAMPLE_ZH, seqRand([0.2]));
eq(sampleZh.paragraphs.length, 2, "示例 2 生成：段落数 2");
eq(M.generateLorem(M.DEFAULTS, seqRand([0.2])).paragraphs.length, 3, "恢复默认：回到 3 段");

/* ---------- 11. 注册 186→187 ---------- */
has(GO_SRC, '"lorem_ipsum_generator"', "注册：ID 存在");
has(GO_SRC, '"/tools/lorem-ipsum-generator"', "注册：Path 存在");
has(GO_SRC, 'Category:    "文本工具"', "注册：文本工具品类存在");
var pathMatches = GO_SRC.match(/"\/tools\/[^"]+"/g) || [];
eq(new Set(pathMatches).size, 187, "注册总数：186→187 Path");

/* ---------- 12. 零网络请求静态检查 ---------- */
notHas(JS_SRC, "fetch(", "零网络：JS 无 fetch");
notHas(JS_SRC, "XMLHttpRequest", "零网络：JS 无 XHR");
notHas(TPL_SRC, "fetch(", "零网络：模板无 fetch");
notHas(TPL_SRC, "XMLHttpRequest", "零网络：模板无 XHR");
ok(!/<script[^>]+src="https?:/.test(TPL_SRC), "零 CDN：模板无外部脚本");
ok(!/<link[^>]+rel="stylesheet"[^>]+href="https?:/.test(TPL_SRC), "零 CDN：模板无外部样式（canonical 不算样式）");

/* ---------- 13. 模板真限制文案与互链 ---------- */
has(TPL_SRC, "只生成占位文本", "真限制：只生成占位文本可见");
has(TPL_SRC, "中文占位句无实际语义", "真限制：中文占位句无实际语义可见");
has(TPL_SRC, "不可直接当正文发布", "真限制：不可直接当正文发布可见");
has(TPL_SRC, "随机组合不可复现同一批次", "真限制：随机组合不可复现可见");
has(TPL_SRC, "/tools/mock-data-generator", "互链：含 Mock 生成器");
has(TPL_SRC, "/tools/markdown-preview", "互链：含 Markdown 预览");
notHas(TPL_SRC, "/tools/css-easing-generator", "互链：不含未交付 CSS 缓动曲线生成器");
has(TPL_SRC, "lorem-ipsum.txt", "下载：纯文本下载名 lorem-ipsum.txt");
has(TPL_SRC, "lorem-ipsum.html", "下载：HTML 下载名 lorem-ipsum.html");
has(TPL_SRC, "复制失败", "复制：失败降级提示文案");
has(TPL_SRC, "恢复默认", "模板：恢复默认按钮");
has(TPL_SRC, "重新生成", "模板：重新生成按钮");
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/lorem-ipsum-generator", "SEO：canonical 正确");

console.log("lorem_ipsum_generator: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
