/* 违禁词检测器（forbidden_word_detector）纯逻辑单元测试（零依赖）：
 * node tests/forbidden_word_detector.test.js
 * 覆盖：BANNED_WORDS 词库完整性（6 分类 109 词条、无重复、风险值合法）、
 * scanText 确定性向量逐值命中（含 positions 断言）、重叠命中取最长、
 * 白名单、非法参数抛 Error 的 err.field、riskSummary、maskText、
 * 两组示例、categories.go 注册（Path 总数 244→245）与零网络请求静态检查、
 * 模板真限制三条、与 OG 社交卡片预览双向互链、单向链入结构化提示词构建器、
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

var M = require("../static/js/forbidden_word_detector.js");

/* ---------- 1. 词库完整性 ---------- */
eq(M.BANNED_WORDS.length, 6, "词库：6 个分类");
deepEq(M.BANNED_WORDS.map(function (c) { return c.id; }),
  ["absolute", "authority", "medical", "finance", "diversion", "interaction"],
  "词库：分类 id 顺序");
deepEq(M.BANNED_WORDS.map(function (c) { return c.name; }),
  ["极限词", "权威背书", "医疗功效", "金融承诺", "导流诱导", "互动诱导"],
  "词库：分类中文名");
deepEq(M.BANNED_WORDS.map(function (c) { return c.risk; }),
  ["high", "medium", "high", "high", "medium", "low"],
  "词库：分类风险等级");
ok(M.totalWords() >= 90, "词库：总词条数 ≥90（实得 " + M.totalWords() + "）");
eq(M.totalWords(), 109, "词库：总词条数锁定 109");
var allWords = [];
M.BANNED_WORDS.forEach(function (c) {
  ok(c.words.length > 0, "词库：" + c.id + " 非空");
  ok(/^[a-z]+$/.test(c.id), "词库：" + c.id + " id 为英文小写");
  ok(c.nameEn && c.nameEn.length > 0, "词库：" + c.id + " 有英文名");
  c.words.forEach(function (w) { allWords.push(w); });
});
var seen = {}, dup = 0;
allWords.forEach(function (w) { if (seen[w]) dup++; seen[w] = 1; });
eq(dup, 0, "词库：109 词条无重复");

/* ---------- 2. scanText 确定性向量（含 positions） ---------- */
var r1 = M.scanText("全国第一");
eq(r1.hits.length, 1, "向量1：scanText('全国第一') 命中 1 个不同词条");
eq(r1.hits[0].word, "全国第一", "向量1：命中词条为 全国第一");
deepEq(r1.hits[0].positions, [0], "向量1：positions=[0]");
eq(r1.hits[0].categoryId, "absolute", "向量1：分类 absolute");
eq(r1.hits[0].risk, "high", "向量1：风险 high");
eq(r1.total, 1, "向量1：total=1");
eq(r1.riskLevel, "high", "向量1：riskLevel=high");

var r2 = M.scanText("全国第一！祖传秘方包治百病，稳赚不赔日入过万，加微信私聊我，一键三连求点赞！");
eq(r2.total, 9, "向量2：示例一 total=9");
eq(r2.distinct, 9, "向量2：示例一 distinct=9");
eq(r2.riskLevel, "high", "向量2：示例一 riskLevel=high");
deepEq(r2.hits.map(function (h) { return h.word; }),
  ["全国第一", "祖传秘方", "包治百病", "稳赚不赔", "日入过万", "加微信", "私聊我", "一键三连", "求点赞"],
  "向量2：命中词条按首次位置排序");
deepEq(r2.hits.map(function (h) { return h.positions[0]; }),
  [0, 5, 9, 14, 18, 23, 26, 30, 34],
  "向量2：positions 逐值命中");
deepEq(r2.hits[5].categoryId, "diversion", "向量2：加微信 分类 diversion");
eq(r2.hits[7].risk, "low", "向量2：一键三连 风险 low");

var r3 = M.scanText("新品上市，全网最低价，央视推荐，专家认证，转发抽奖赢好礼，评论区扣1参与。");
eq(r3.total, 5, "向量3：示例二 total=5");
eq(r3.riskLevel, "high", "向量3：示例二 riskLevel=high（含全网最低）");
deepEq(r3.hits[0].positions, [5], "向量3：全网最低 positions=[5]");
eq(r3.hits[0].word, "全网最低", "向量3：命中 全网最低（非 最低价 的 最）");

var r4 = M.scanText("今天天气不错，适合出门。");
eq(r4.total, 0, "向量4：无命中 total=0");
eq(r4.hits.length, 0, "向量4：无命中 hits 为空");
eq(r4.riskLevel, "none", "向量4：无命中 riskLevel=none");
var r5 = M.scanText("");
eq(r5.riskLevel, "none", "向量5：空串 riskLevel=none");

/* ---------- 3. 重叠命中取最长 ---------- */
deepEq(M.scanText("稳赚不赔").hits.map(function (h) { return h.word; }), ["稳赚不赔"],
  "重叠取最长：稳赚不赔 不重复计 稳赚");
deepEq(M.scanText("全国第一").hits.map(function (h) { return h.word; }), ["全国第一"],
  "重叠取最长：全国第一 不重复计 第一");
deepEq(M.scanText("祖传秘方").hits.map(function (h) { return h.word; }), ["祖传秘方"],
  "重叠取最长：祖传秘方 不重复计 秘方");
deepEq(M.scanText("帮我砍一刀").hits.map(function (h) { return h.word; }), ["帮我砍一刀"],
  "重叠取最长：帮我砍一刀 不重复计 砍一刀");

/* ---------- 4. 白名单 ---------- */
var rwl = M.scanText("全国第一 最低价", { whitelist: ["全国第一"] });
deepEq(rwl.hits.map(function (h) { return h.word; }), ["最低价"], "白名单：全国第一 被豁免");
eq(M.maskText("全国第一最低价", { whitelist: ["全国第一"] }), "全国第一███", "白名单：maskText 同样豁免");
eq(M.scanText("全国第一", {}).total, 1, "白名单：空对象 opts 不影响扫描");

/* ---------- 5. 非法参数抛 Error（err.field） ---------- */
throwsField(function () { M.scanText(123); }, "text", "非法参数：scanText(123)");
throwsField(function () { M.scanText(null); }, "text", "非法参数：scanText(null)");
throwsField(function () { M.scanText("x", "nope"); }, "opts", "非法参数：scanText opts 非对象");
throwsField(function () { M.scanText("x", { whitelist: "a" }); }, "whitelist", "非法参数：whitelist 非数组");
throwsField(function () { M.scanText("x", { whitelist: [1] }); }, "whitelist", "非法参数：whitelist 含非字符串");
throwsField(function () { M.riskSummary(null); }, "result", "非法参数：riskSummary(null)");
throwsField(function () { M.riskSummary({}); }, "result", "非法参数：riskSummary({}) 无 hits 数组");
throwsField(function () { M.maskText(123); }, "text", "非法参数：maskText(123)");
throwsField(function () { M.maskText("x", { maskChar: "ab" }); }, "maskChar", "非法参数：maskChar 非单字符");

/* ---------- 6. riskSummary ---------- */
var s1 = M.riskSummary(r2);
eq(s1.level, "high", "riskSummary：示例一 level=high");
eq(s1.label, "高风险", "riskSummary：示例一 label=高风险");
eq(s1.high, 5, "riskSummary：示例一 high=5");
eq(s1.medium, 2, "riskSummary：示例一 medium=2");
eq(s1.low, 2, "riskSummary：示例一 low=2");
eq(s1.total, 9, "riskSummary：示例一 total=9");
ok(s1.advice && s1.advice.length > 0, "riskSummary：示例一 advice 非空");
var rLow = M.scanText("求点赞，双击666，关注有礼！");
var sLow = M.riskSummary(rLow);
eq(sLow.level, "low", "riskSummary：纯低风险文案 level=low");
eq(sLow.label, "低风险", "riskSummary：纯低风险文案 label=低风险");
var sNone = M.riskSummary(M.scanText("今天天气不错"));
eq(sNone.level, "none", "riskSummary：无命中 level=none");
eq(sNone.label, "无风险", "riskSummary：无命中 label=无风险");

/* ---------- 7. maskText ---------- */
eq(M.maskText("全国第一稳赚不赔"), "████████", "maskText：命中词条按字替换为 █");
eq(M.maskText("最", { maskChar: "*" }), "*", "maskText：maskChar 选项生效");
eq(M.maskText("今天天气不错"), "今天天气不错", "maskText：无命中原文不变");
eq(M.maskText(""), "", "maskText：空串返回空串");
eq(M.maskText("效果最好", {}).length, 4, "maskText：长度与原文一致（含单字命中）");

/* ---------- 8. 两组示例 ---------- */
ok(typeof M.EXAMPLES.risky === "string" && M.EXAMPLES.risky.length > 0, "示例一：risky 非空字符串");
ok(typeof M.EXAMPLES.promo === "string" && M.EXAMPLES.promo.length > 0, "示例二：promo 非空字符串");
eq(M.scanText(M.EXAMPLES.risky).total, 9, "示例一：扫描 total=9（与向量2一致）");
ok(M.scanText(M.EXAMPLES.promo).total > 0, "示例二：扫描有命中");

/* ---------- 9. categories.go 注册 ---------- */
var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "forbidden_word_detector.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "forbidden_word_detector.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");
var OG_TPL = fs.readFileSync(path.join(ROOT, "templates", "og_card_preview.html"), "utf8");

var fwdIdx = GO_SRC.indexOf('"forbidden_word_detector"');
ok(fwdIdx >= 0, "注册 ID forbidden_word_detector");
ok(GO_SRC.indexOf('"/tools/forbidden-word-detector"') >= 0, "注册 Path /tools/forbidden-word-detector");
ok(GO_SRC.slice(fwdIdx, fwdIdx + 1200).indexOf('Icon:        "warning"') >= 0, "注册 Icon warning");
ok(GO_SRC.slice(fwdIdx, fwdIdx + 1200).indexOf("New:         true") >= 0, "注册 New 为 true");
ok(GO_SRC.slice(fwdIdx, fwdIdx + 1200).indexOf('Category:    "营销工具"') >= 0, "注册 Category 为营销工具");
ok(GO_SRC.indexOf("Forbidden word detector") >= 0, "Description 中英文双语（含英文）");
var ogIdx = GO_SRC.indexOf('"og_card_preview"');
ok(ogIdx >= 0 && fwdIdx > ogIdx, "注册在 og_card_preview 之后（营销工具互链家族相邻）");
var pathRe = /"\/tools\/[^"]+"/g, seen2 = {}, m2, pathCount = 0;
while ((m2 = pathRe.exec(GO_SRC)) !== null) { if (!seen2[m2[0]]) { seen2[m2[0]] = true; pathCount++; } }
eq(pathCount, 245, "注册 Path 总数 244→245");

/* ---------- 10. 模板：真限制/互链/零网络 ---------- */
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/forbidden-word-detector", "模板 canonical 含新 Path");
has(TPL_SRC, "不构成法律意见", "真限制①：非法律意见");
has(TPL_SRC, "词库版本 v1.0", "真限制②：词库版本 v1.0 滞后");
has(TPL_SRC, "合规责任由发布者承担", "真限制③：合规责任在发布者");
has(TPL_SRC, "/tools/og-card-preview", "互链：OG 社交卡片预览（双向）");
has(TPL_SRC, "/tools/prompt-builder", "链入：结构化提示词构建器（单向）");
notHas(TPL_SRC, "/tools/nonexistent-tool", "不链未交付工具");
has(OG_TPL, "/tools/forbidden-word-detector", "双向互链：OG 模板回链违禁词检测器");
has(TPL_SRC, "fwd-input", "模板含文案输入框 fwd-input");
has(TPL_SRC, "fwd-highlight", "模板含原文高亮区 fwd-highlight");
has(TPL_SRC, "fwd-masked", "模板含脱敏版输出区 fwd-masked");
has(TPL_SRC, "forbidden_word_detector.js?v=1", "模板引用外部 JS");
has(TPL_SRC, '"url":"https://www.johnkingzcq123.xyz/tools/forbidden-word-detector"', "模板 JSON-LD 含新 Path");
notHas(JS_SRC, "fetch(", "零网络：JS 无 fetch 调用");
notHas(JS_SRC, "XMLHttpRequest", "零网络：JS 无 XHR");
notHas(TPL_SRC, "fonts.googleapis", "模板零 CDN");

console.log("PASS " + pass + " / FAIL " + fail);
if (fail > 0) process.exit(1);
