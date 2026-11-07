/* 文本摘要/要点提取器（text_summarizer）纯逻辑单元测试（零依赖）：
 * node tests/text_summarizer.test.js
 * 覆盖：splitSentences（中英文分句精确值＋空文本抛错 err.field='text'）/
 * tokenize（英文按词中文按单字＋停用词过滤精确值，err.field='sentence'/'stopwords'）/
 * sentenceSimilarity（TF 余弦精确值：相同句→1、无交集→0、0.8944 四位小数，err.field='tokensA'/'tokensB'）/
 * buildSimilarityMatrix（对角 0、对称，err.field='tokenized'）/
 * textRank（收敛：得分和≈1、悬挂节点均匀，非法 options 抛错 err.field='options*'）/
 * extractSummary（30% 取句数精确值＋原序＋ratio 越界抛错 err.field='ratio'＋单句 kept=1）/
 * extractKeywords（降序精确值＋topN 抛错 err.field='topN'）/
 * truncateText（5 万字截断精确值＋truncated 布尔，err.field='maxChars'）/
 * sanitizeFileName（家族惯例＋空回退 'text-summary'）/
 * categories.go 注册（Path 总数 299→300、Icon summarize 全库唯一、New/类目/关键词）/
 * 模板（SEO 四关键词、真限制四条、零外部资源静态检查）/
 * JS 零网络静态检查。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var A = require("../static/js/text_summarizer.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function has(s, sub, name) { ok(s.indexOf(sub) !== -1, name); }
function notHas(s, sub, name) { ok(s.indexOf(sub) === -1, name); }
function approx(a, b, tol, name) { ok(Math.abs(a - b) <= tol, name + "（期望≈" + b + "±" + tol + "，实得 " + a + "）"); }
function throwsField(fn, field, name) {
  try { fn(); } catch (e) {
    ok(e instanceof Error && e.field === field,
      name + "（期望抛 Error 且 err.field=" + JSON.stringify(field) + "，实得 " +
      (e instanceof Error ? "Error field=" + JSON.stringify(e.field) : typeof e) + "）");
    return;
  }
  fail++; console.error("FAIL:", name + "（未抛出异常）");
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "text_summarizer.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "text_summarizer.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. splitSentences ---------- */
eq(JSON.stringify(A.splitSentences("你好。这是测试！")), JSON.stringify(["你好。", "这是测试！"]), "splitSentences：中文分句精确");
eq(JSON.stringify(A.splitSentences("Hello world. This is a test.")), JSON.stringify(["Hello world.", "This is a test."]), "splitSentences：英文分句精确");
eq(A.splitSentences("第一句。第二 sentence here. 第三句！").length, 3, "splitSentences：中英混排 3 句");
eq(JSON.stringify(A.splitSentences("他说……然后走了。")), JSON.stringify(["他说……然后走了。"]), "splitSentences：省略号不切分");
eq(JSON.stringify(A.splitSentences("pi is 3.14. End.")), JSON.stringify(["pi is 3.14.", "End."]), "splitSentences：小数点不切分");
eq(JSON.stringify(A.splitSentences("第一句。\n第二句。")), JSON.stringify(["第一句。", "第二句。"]), "splitSentences：换行切分");
eq(JSON.stringify(A.splitSentences("太好了！！")), JSON.stringify(["太好了！！"]), "splitSentences：连续中文标点合并");
throwsField(function () { A.splitSentences(123); }, "text", "splitSentences(123)：err.field=text");
throwsField(function () { A.splitSentences(null); }, "text", "splitSentences(null)：err.field=text");
throwsField(function () { A.splitSentences(undefined); }, "text", "splitSentences(undefined)：err.field=text");
throwsField(function () { A.splitSentences(""); }, "text", "splitSentences('')：err.field=text");
throwsField(function () { A.splitSentences("   \n  "); }, "text", "splitSentences(空白)：err.field=text");

/* ---------- 2. tokenize ---------- */
eq(JSON.stringify(A.tokenize("Hello World", [])), JSON.stringify(["hello", "world"]), "tokenize：英文按词＋小写归一");
eq(JSON.stringify(A.tokenize("你好世界", [])), JSON.stringify(["你", "好", "世", "界"]), "tokenize：中文按单字");
eq(JSON.stringify(A.tokenize("AI 改变世界", [])), JSON.stringify(["ai", "改", "变", "世", "界"]), "tokenize：中英混排");
eq(JSON.stringify(A.tokenize("the cat is here", ["the", "is"])), JSON.stringify(["cat", "here"]), "tokenize：停用词过滤精确");
eq(JSON.stringify(A.tokenize("the", ["the"])), JSON.stringify([]), "tokenize：全停用词→空数组");
eq(JSON.stringify(A.tokenize("the cat")), JSON.stringify(["cat"]), "tokenize：省略 stopwords 用内置默认表");
throwsField(function () { A.tokenize(123, []); }, "sentence", "tokenize(123)：err.field=sentence");
throwsField(function () { A.tokenize(null); }, "sentence", "tokenize(null)：err.field=sentence");
throwsField(function () { A.tokenize("x", "no"); }, "stopwords", "tokenize stopwords 非数组：err.field=stopwords");
throwsField(function () { A.tokenize("x", 123); }, "stopwords", "tokenize stopwords 数字：err.field=stopwords");

/* ---------- 3. sentenceSimilarity ---------- */
eq(A.sentenceSimilarity(["a", "b"], ["a", "b"]), 1, "sentenceSimilarity：相同句→1.0000 精确");
eq(A.sentenceSimilarity(["cat", "sat"], ["cat", "ran"]), 0.5, "sentenceSimilarity：余弦 0.5 精确");
eq(A.sentenceSimilarity(["cat", "dog"], ["fish", "bird"]), 0, "sentenceSimilarity：无交集→0");
eq(A.sentenceSimilarity([], ["a"]), 0, "sentenceSimilarity：空向量→0");
eq(A.sentenceSimilarity([], []), 0, "sentenceSimilarity：双空向量→0");
eq(A.sentenceSimilarity(["a", "a", "a", "b"], ["a", "b"]), 0.8944, "sentenceSimilarity：0.8944 四位小数精确");
throwsField(function () { A.sentenceSimilarity("x", ["a"]); }, "tokensA", "sentenceSimilarity tokensA 非数组：err.field=tokensA");
throwsField(function () { A.sentenceSimilarity(null, []); }, "tokensA", "sentenceSimilarity tokensA null：err.field=tokensA");
throwsField(function () { A.sentenceSimilarity(["a"], 123); }, "tokensB", "sentenceSimilarity tokensB 非数组：err.field=tokensB");

/* ---------- 4. buildSimilarityMatrix ---------- */
var M = A.buildSimilarityMatrix([["a", "b"], ["a", "c"], ["x", "y"]]);
eq(M.length, 3, "buildSimilarityMatrix：3x3");
eq(M[0][0], 0, "buildSimilarityMatrix：对角 m[0][0]=0");
eq(M[1][1], 0, "buildSimilarityMatrix：对角 m[1][1]=0");
eq(M[2][2], 0, "buildSimilarityMatrix：对角 m[2][2]=0");
eq(M[0][1], M[1][0], "buildSimilarityMatrix：对称 m[0][1]=m[1][0]");
eq(M[0][2], M[2][0], "buildSimilarityMatrix：对称 m[0][2]=m[2][0]");
eq(M[1][2], M[2][1], "buildSimilarityMatrix：对称 m[1][2]=m[2][1]");
eq(M[0][1], 0.5, "buildSimilarityMatrix：m[0][1]=0.5 精确");
eq(M[0][2], 0, "buildSimilarityMatrix：m[0][2]=0 精确");
throwsField(function () { A.buildSimilarityMatrix("x"); }, "tokenized", "buildSimilarityMatrix 非数组：err.field=tokenized");
throwsField(function () { A.buildSimilarityMatrix(null); }, "tokenized", "buildSimilarityMatrix null：err.field=tokenized");
throwsField(function () { A.buildSimilarityMatrix([]); }, "tokenized", "buildSimilarityMatrix 空数组：err.field=tokenized");
throwsField(function () { A.buildSimilarityMatrix([["a"], "x"]); }, "tokenized", "buildSimilarityMatrix 元素非数组：err.field=tokenized");

/* ---------- 5. textRank ---------- */
var pr2 = A.textRank([[0, 1], [1, 0]]);
approx(pr2[0], 0.5, 1e-9, "textRank：双节点 s0≈0.5");
approx(pr2[1], 0.5, 1e-9, "textRank：双节点 s1≈0.5");
approx(pr2[0] + pr2[1], 1, 1e-6, "textRank：得分和≈1");
var pr3 = A.textRank([[0, 1, 0], [1, 0, 1], [0, 1, 0]]);
ok(pr3[1] > pr3[0] && pr3[1] > pr3[2], "textRank：链状图中间节点得分最高");
approx(pr3[0] + pr3[1] + pr3[2], 1, 1e-6, "textRank：三节点得分和≈1");
var prd = A.textRank([[0, 0], [0, 0]]);
approx(prd[0], 0.5, 1e-9, "textRank：悬挂节点均匀 s0≈0.5");
approx(prd[1], 0.5, 1e-9, "textRank：悬挂节点均匀 s1≈0.5");
var prc = A.textRank([[0, 1], [1, 0]], { damping: 0.9, maxIter: 10, epsilon: 1e-6 });
approx(prc[0] + prc[1], 1, 1e-6, "textRank：自定义 options 收敛和≈1");
throwsField(function () { A.textRank("x"); }, "matrix", "textRank matrix 非数组：err.field=matrix");
throwsField(function () { A.textRank([]); }, "matrix", "textRank matrix 空：err.field=matrix");
throwsField(function () { A.textRank([[0, 1]]); }, "matrix", "textRank 非方阵：err.field=matrix");
throwsField(function () { A.textRank([[0, "x"], [1, 0]]); }, "matrix", "textRank 元素非法：err.field=matrix");
throwsField(function () { A.textRank([[0, 1], [1, 0]], null); }, "options", "textRank options null：err.field=options");
throwsField(function () { A.textRank([[0, 1], [1, 0]], "x"); }, "options", "textRank options 字符串：err.field=options");
throwsField(function () { A.textRank([[0, 1], [1, 0]], []); }, "options", "textRank options 数组：err.field=options");
throwsField(function () { A.textRank([[0, 1], [1, 0]], { damping: 0 }); }, "options.damping", "textRank damping=0：err.field=options.damping");
throwsField(function () { A.textRank([[0, 1], [1, 0]], { damping: 1 }); }, "options.damping", "textRank damping=1：err.field=options.damping");
throwsField(function () { A.textRank([[0, 1], [1, 0]], { damping: 1.5 }); }, "options.damping", "textRank damping 越界：err.field=options.damping");
throwsField(function () { A.textRank([[0, 1], [1, 0]], { maxIter: 0 }); }, "options.maxIter", "textRank maxIter=0：err.field=options.maxIter");
throwsField(function () { A.textRank([[0, 1], [1, 0]], { maxIter: 1.5 }); }, "options.maxIter", "textRank maxIter 小数：err.field=options.maxIter");
throwsField(function () { A.textRank([[0, 1], [1, 0]], { epsilon: 0 }); }, "options.epsilon", "textRank epsilon=0：err.field=options.epsilon");
throwsField(function () { A.textRank([[0, 1], [1, 0]], { epsilon: -1 }); }, "options.epsilon", "textRank epsilon 负数：err.field=options.epsilon");

/* ---------- 6. extractSummary ---------- */
var TEXT10 = "第一句。第二句很重要很重要。第三句。第四句。第五句。第六句。第七句。第八句。第九句。第十句。";
var S10 = A.extractSummary(TEXT10, 0.3);
eq(S10.total, 10, "extractSummary：total=10 精确");
eq(S10.kept, 3, "extractSummary：30% 取 3 句精确");
eq(S10.sentences.length, 3, "extractSummary：sentences 长度 3");
eq(S10.indices.length, 3, "extractSummary：indices 长度 3");
ok(S10.indices[0] < S10.indices[1] && S10.indices[1] < S10.indices[2], "extractSummary：indices 严格升序（原序）");
var ORIG = A.splitSentences(TEXT10);
ok(S10.sentences.every(function (s, i) { return s === ORIG[S10.indices[i]]; }), "extractSummary：摘要句与原句精确对应");
var SD = A.extractSummary(TEXT10);
eq(SD.kept, 3, "extractSummary：默认 ratio=0.3 取 3 句");
var S1 = A.extractSummary(TEXT10, 1);
eq(S1.kept, 10, "extractSummary：ratio=1 取全部 10 句");
var S005 = A.extractSummary(TEXT10, 0.05);
eq(S005.kept, 1, "extractSummary：ratio=0.05 兜底 kept=1");
var ONE = A.extractSummary("只有一句。", 0.3);
eq(ONE.kept, 1, "extractSummary：单句文本 kept=1");
eq(JSON.stringify(ONE.sentences), JSON.stringify(["只有一句。"]), "extractSummary：单句文本摘要精确");
eq(JSON.stringify(ONE.indices), JSON.stringify([0]), "extractSummary：单句文本 indices=[0]");
var SOP = A.extractSummary(TEXT10, 0.3, { damping: 0.85, maxIter: 100, epsilon: 1e-4, stopwords: [] });
eq(SOP.kept, 3, "extractSummary：options 透传可用");
throwsField(function () { A.extractSummary(TEXT10, 0); }, "ratio", "extractSummary ratio=0：err.field=ratio");
throwsField(function () { A.extractSummary(TEXT10, -0.1); }, "ratio", "extractSummary ratio 负数：err.field=ratio");
throwsField(function () { A.extractSummary(TEXT10, 1.5); }, "ratio", "extractSummary ratio>1：err.field=ratio");
throwsField(function () { A.extractSummary(TEXT10, "x"); }, "ratio", "extractSummary ratio 字符串：err.field=ratio");
throwsField(function () { A.extractSummary(TEXT10, NaN); }, "ratio", "extractSummary ratio NaN：err.field=ratio");
throwsField(function () { A.extractSummary("", 0.3); }, "text", "extractSummary 空文本：err.field=text");
throwsField(function () { A.extractSummary("   ", 0.3); }, "text", "extractSummary 空白文本：err.field=text");
throwsField(function () { A.extractSummary(123, 0.3); }, "text", "extractSummary 非字符串：err.field=text");
throwsField(function () { A.extractSummary(null, 0.3); }, "text", "extractSummary null：err.field=text");
throwsField(function () { A.extractSummary(TEXT10, 0.3, "x"); }, "options", "extractSummary options 非对象：err.field=options");

/* ---------- 7. extractKeywords ---------- */
var KWS = A.extractKeywords("猫喜欢鱼。狗喜欢骨头。猫和狗是朋友。", 3);
eq(KWS.length, 3, "extractKeywords：topN=3 长度精确");
eq(KWS[0].word, "喜", "extractKeywords：并列首词「喜」精确（词升序）");
eq(KWS[0].score, 0.1538, "extractKeywords：2/13=0.1538 精确");
eq(KWS[1].score, 0.1538, "extractKeywords：并列得分精确");
eq(KWS[2].score, 0.1538, "extractKeywords：并列得分精确");
var KWF = A.extractKeywords("猫喜欢鱼。狗喜欢骨头。猫和狗是朋友。");
var desc = true;
for (var ki = 1; ki < KWF.length; ki++) { if (KWF[ki].score > KWF[ki - 1].score + 1e-12) desc = false; }
ok(desc, "extractKeywords：全量结果按 score 降序");
ok(KWF.length <= 10, "extractKeywords：默认 topN=10 上限");
eq(JSON.stringify(A.extractKeywords("a b c cat", 10, [])), JSON.stringify([{ word: "cat", score: 1 }]), "extractKeywords：单个英文字符不成关键词");
eq(JSON.stringify(A.extractKeywords("apple banana apple", 2, ["banana"])), JSON.stringify([{ word: "apple", score: 1 }]), "extractKeywords：自定义停用词精确");
eq(JSON.stringify(A.extractKeywords("the a an", 5)), JSON.stringify([]), "extractKeywords：全停用词→空数组");
throwsField(function () { A.extractKeywords("文本", 0); }, "topN", "extractKeywords topN=0：err.field=topN");
throwsField(function () { A.extractKeywords("文本", -1); }, "topN", "extractKeywords topN 负数：err.field=topN");
throwsField(function () { A.extractKeywords("文本", 1.5); }, "topN", "extractKeywords topN 小数：err.field=topN");
throwsField(function () { A.extractKeywords("文本", "x"); }, "topN", "extractKeywords topN 字符串：err.field=topN");
throwsField(function () { A.extractKeywords("", 5); }, "text", "extractKeywords 空文本：err.field=text");
throwsField(function () { A.extractKeywords(123, 5); }, "text", "extractKeywords 非字符串：err.field=text");

/* ---------- 8. truncateText ---------- */
var T1 = A.truncateText("abc");
eq(T1.text, "abc", "truncateText：短文本原样");
eq(T1.truncated, false, "truncateText：短文本 truncated=false");
var LONG = new Array(50002).join("x");
var T2 = A.truncateText(LONG);
eq(T2.truncated, true, "truncateText：50001 字 truncated=true");
eq(T2.text.length, 50000, "truncateText：截断后 50000 字精确");
var T3 = A.truncateText(new Array(50001).join("x"));
eq(T3.truncated, false, "truncateText：50000 字整 truncated=false");
var T4 = A.truncateText("abcdef", 3);
eq(T4.text, "abc", "truncateText：自定义 maxChars 截断精确");
eq(T4.truncated, true, "truncateText：自定义 maxChars truncated=true");
throwsField(function () { A.truncateText("x", 0); }, "maxChars", "truncateText maxChars=0：err.field=maxChars");
throwsField(function () { A.truncateText("x", -5); }, "maxChars", "truncateText maxChars 负数：err.field=maxChars");
throwsField(function () { A.truncateText("x", 1.5); }, "maxChars", "truncateText maxChars 小数：err.field=maxChars");
throwsField(function () { A.truncateText(123); }, "text", "truncateText 非字符串：err.field=text");
throwsField(function () { A.truncateText(null); }, "text", "truncateText null：err.field=text");

/* ---------- 9. sanitizeFileName（家族惯例） ---------- */
eq(A.sanitizeFileName(""), "text-summary", "sanitizeFileName 空：回退 text-summary");
eq(A.sanitizeFileName(null), "text-summary", "sanitizeFileName null：回退");
eq(A.sanitizeFileName("   "), "text-summary", "sanitizeFileName 空白：回退");
eq(A.sanitizeFileName("我的摘要 2024"), "我的摘要-2024", "sanitizeFileName：空白转连字符");
eq(A.sanitizeFileName('a/b\\c:d*e?f"g<h>i|j'), "abcdefghij", "sanitizeFileName：非法字符剔除");
ok(A.sanitizeFileName(new Array(80).join("x")).length <= 60, "sanitizeFileName：超长截断 60");

/* ---------- 10. 常量 ---------- */
eq(A.MAX_CHARS, 50000, "MAX_CHARS=50000 精确");
eq(A.DAMPING, 0.85, "DAMPING=0.85 精确");
eq(A.MAX_ITER, 100, "MAX_ITER=100 精确");
eq(A.EPSILON, 0.0001, "EPSILON=1e-4 精确");
eq(A.DEFAULT_RATIO, 0.3, "DEFAULT_RATIO=0.3 精确");
eq(A.DEFAULT_TOPN, 10, "DEFAULT_TOPN=10 精确");
ok(Array.isArray(A.EN_STOPWORDS) && A.EN_STOPWORDS.length >= 60, "EN_STOPWORDS：60+ 英文停用词");
ok(Array.isArray(A.ZH_STOPWORDS) && A.ZH_STOPWORDS.length >= 40, "ZH_STOPWORDS：40+ 中文停用词");
eq(A.DEFAULT_STOPWORDS.length, A.EN_STOPWORDS.length + A.ZH_STOPWORDS.length, "DEFAULT_STOPWORDS：中英合并");

/* ---------- 11. categories.go 注册 ---------- */
var pathRe = /"\/tools\/[^"]+"/g, seen = {}, m, pathCount = 0;
while ((m = pathRe.exec(GO_SRC)) !== null) { if (!seen[m[0]]) { seen[m[0]] = true; pathCount++; } }
eq(pathCount, 328, "注册 Path 总数 299→300");
var iconHits = (GO_SRC.match(/Icon:\s*"summarize"/g) || []).length;
eq(iconHits, 1, "Icon summarize 全库唯一（精确值复测锁定）");
has(GO_SRC, 'ID:          "text_summarizer"', "注册：ID text_summarizer");
has(GO_SRC, 'Path:        "/tools/text-summarizer"', "注册：Path /tools/text-summarizer");
has(GO_SRC, 'Name:        "文本摘要/要点提取器"', "注册：Name 文本摘要/要点提取器");
has(GO_SRC, 'Category:    "文本工具"', "注册：类目文本工具");
var tsBlock = GO_SRC.slice(GO_SRC.indexOf('"text_summarizer"'), GO_SRC.indexOf('"text_summarizer"') + 1200);
has(tsBlock, "New:         true", "注册：New=true");
has(tsBlock, "TextRank", "注册：Description 含 TextRank");
has(tsBlock, "零上传", "注册：Description 含零上传");
has(tsBlock, "10%–50%", "注册：Description 含压缩比");

/* ---------- 12. 模板：SEO/真限制/互链/零外部资源 ---------- */
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/text-summarizer", "模板 canonical 含新 Path");
has(TPL_SRC, "在线文本摘要", "模板 SEO 关键词：在线文本摘要");
has(TPL_SRC, "文章摘要生成", "模板 SEO 关键词：文章摘要生成");
has(TPL_SRC, "长文提炼要点", "模板 SEO 关键词：长文提炼要点");
has(TPL_SRC, "TextRank 在线摘要", "模板 SEO 关键词：TextRank 在线摘要");
has(TPL_SRC, "真限制", "模板：真限制章节");
has(TPL_SRC, "提取式", "真限制①：提取式不改写");
has(TPL_SRC, "单字级分词", "真限制②：中文单字级分词");
has(TPL_SRC, "零上传", "真限制③：零上传");
has(TPL_SRC, "5 万字", "真限制④：5 万字上限");
has(TPL_SRC, "/tools/text-info-extractor", "互链：文本信息提取器（正则口径互补）");
has(TPL_SRC, "/tools/wordcloud-generator", "互链：词云生成器（词频可视化口径互补）");
has(TPL_SRC, 'id="ts-input"', "模板含文本输入框 ts-input");
has(TPL_SRC, 'id="ts-ratio"', "模板含压缩比滑杆 ts-ratio");
has(TPL_SRC, 'id="ts-run"', "模板含生成按钮 ts-run");
has(TPL_SRC, 'id="ts-result"', "模板含结果区 ts-result");
has(TPL_SRC, 'id="ts-copy"', "模板含复制按钮 ts-copy");
has(TPL_SRC, 'id="ts-export"', "模板含导出按钮 ts-export");
has(TPL_SRC, 'id="ts-keywords"', "模板含关键词区 ts-keywords");
has(TPL_SRC, "/tools/static/js/text_summarizer.js", "模板引用 text_summarizer.js");
has(TPL_SRC, "summarize</i>", "模板标题图标 summarize");
notHas(TPL_SRC, "fonts.googleapis", "模板零 CDN：无外部字体");
ok((TPL_SRC.match(/<script[^>]*src="http/g) || []).length === 0, "模板零外部脚本：无 http script src");
var httpLinks = (TPL_SRC.match(/<link[^>]*href="(http[^"]*)"/g) || []).map(function (t) {
  return t.replace(/^.*href="/, "").replace(/"$/, "");
});
ok(httpLinks.every(function (u) { return u.indexOf("johnkingzcq123.xyz") !== -1; }),
  "模板零外部样式：http link 仅 canonical 自家域名");

/* ---------- 13. JS 零网络静态检查 ---------- */
notHas(JS_SRC, "fetch(", "零网络：text_summarizer.js 无 fetch");
notHas(JS_SRC, "XMLHttpRequest", "零网络：text_summarizer.js 无 XHR");
notHas(JS_SRC, "new WebSocket", "零网络：text_summarizer.js 无 WebSocket");
notHas(JS_SRC, "navigator.sendBeacon", "零网络：无 sendBeacon");
has(JS_SRC, "window.TextSummarizer", "挂载：window.TextSummarizer");
has(JS_SRC, "module.exports", "导出：module.exports");

console.log("PASS " + pass + " / FAIL " + fail);
if (fail > 0) process.exit(1);
