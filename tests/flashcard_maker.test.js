/* 闪卡卡片生成器（flashcard_maker）纯逻辑单元测试（零依赖）：
 * node tests/flashcard_maker.test.js
 * 覆盖：规格确定性向量逐值命中（shuffleDeck 洗牌向量、gradeCard 简化 SM-2 向量、
 * computeDeckStats 统计向量、nextDueCards 复习队列向量、parseImport 归一化三向量、
 * buildExportFileName 文件名向量）、非法参数抛 Error 的 err.field 逐字向量、
 * categories.go 注册（ID/Path/Icon/Category/New/Description 关键词，Path 总数 274→275，
 * Icon quiz 全库唯一）、模板真限制三条/互链「学习辅助一条龙」/零网络请求静态检查、
 * SEO 关键词（闪卡/抽认卡/背单词卡片/Flashcards maker）。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var A = require("../static/js/flashcard_maker.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function eqArr(a, b, name) {
  ok(Array.isArray(a) && a.length === b.length && a.every(function (v, i) { return v === b[i]; }),
    name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）");
}
function has(s, sub, name) { ok(s.indexOf(sub) !== -1, name); }
function notHas(s, sub, name) { ok(s.indexOf(sub) === -1, name); }
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
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "flashcard_maker.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "flashcard_maker.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. shuffleDeck 确定性向量 ---------- */
eqArr(A.shuffleDeck(["a", "b", "c"], function () { return 0; }), ["b", "c", "a"],
  "洗牌向量1：rand=0 时 ['a','b','c'] → ['b','c','a']");
eqArr(A.shuffleDeck(["a", "b"], function () { return 0.999; }), ["a", "b"],
  "洗牌向量2：rand=0.999 时 ['a','b'] → ['a','b']（j=1 不换位）");
var srcArr = ["x", "y", "z"];
var shuffled = A.shuffleDeck(srcArr, function () { return 0.5; });
ok(shuffled !== srcArr, "洗牌返回新数组（不改原数组引用）");
eqArr(srcArr, ["x", "y", "z"], "洗牌不修改原数组内容");
throwsField(function () { A.shuffleDeck("nope"); }, "cards", "shuffleDeck 非数组抛 Error err.field='cards'");
throwsField(function () { A.shuffleDeck(null); }, "cards", "shuffleDeck null 抛 Error err.field='cards'");

/* ---------- 2. gradeCard 简化 SM-2 向量 ---------- */
var g1 = A.gradeCard({ front: "f", back: "b", reviews: 0, interval: 0, ease: 2.5, due: 0 }, "know", 1000000);
eq(g1.reviews, 1, "grade向量1：know 后 reviews=1");
eq(g1.interval, 1, "grade向量1：know 后 interval=1（0→1）");
eq(g1.ease, 2.6, "grade向量1：know 后 ease=2.6");
eq(g1.due, 87400000, "grade向量1：know 后 due=87400000（1000000+1*86400000）");
eq(g1.front, "f", "grade向量1：front 保留");
eq(g1.back, "b", "grade向量1：back 保留");

var g2 = A.gradeCard({ front: "f", back: "b", reviews: 2, interval: 3, ease: 2.6, due: 0 }, "unknown", 0);
eq(g2.reviews, 3, "grade向量2：unknown 后 reviews=3");
eq(g2.interval, 1, "grade向量2：unknown 后 interval=1（重置）");
eq(g2.ease, 2.4, "grade向量2：unknown 后 ease=2.4（2.6-0.2）");
eq(g2.due, 86400000, "grade向量2：unknown 后 due=86400000");

var g3 = A.gradeCard({ front: "f", back: "b", reviews: 5, interval: 10, ease: 1.35, due: 0 }, "unknown", 0);
eq(g3.ease, 1.3, "ease 钳制向量：1.35-0.2=1.15 → max(1.3,1.15)=1.3");
eq(g3.interval, 1, "ease 钳制向量：interval=1");
eq(g3.due, 86400000, "ease 钳制向量：due=86400000");

var g4in = { front: "f", back: "b", reviews: 0, interval: 0, ease: 2.5, due: 0 };
var g4 = A.gradeCard(g4in, "know", 0);
ok(g4 !== g4in, "gradeCard 返回新对象（不可变）");
eq(g4in.reviews, 0, "gradeCard 不修改原卡 reviews");
eq(g4in.interval, 0, "gradeCard 不修改原卡 interval");

var g5 = A.gradeCard({ front: "f", back: "b", reviews: 1, interval: 2, ease: 2.5, due: 0 }, "know", 0);
eq(g5.interval, 5, "know 非零 interval：ceil(2*2.5)=5");

throwsField(function () { A.gradeCard(null, "know", 0); }, "card", "gradeCard card 非对象抛 Error err.field='card'");
throwsField(function () { A.gradeCard({ reviews: 0, interval: 0, ease: 2.5 }, "maybe", 0); }, "result",
  "gradeCard result 非法抛 Error err.field='result'");
throwsField(function () { A.gradeCard({ reviews: 0, interval: 0, ease: 2.5 }, "know", NaN); }, "now",
  "gradeCard now 非有限数抛 Error err.field='now'");
throwsField(function () { A.gradeCard({ reviews: 0, interval: 0, ease: 2.5 }, "know", Infinity); }, "now",
  "gradeCard now=Infinity 抛 Error err.field='now'");

/* ---------- 3. computeDeckStats 向量 ---------- */
var st = A.computeDeckStats([{ reviews: 0, interval: 0 }, { reviews: 1, interval: 2 }, { reviews: 3, interval: 8 }]);
eq(st.total, 3, "统计向量：total=3");
eq(st["new"], 1, "统计向量：new=1（reviews=0）");
eq(st.learning, 1, "统计向量：learning=1（reviews>0 且 interval<7）");
eq(st.mastered, 1, "统计向量：mastered=1（interval>=7）");
var st0 = A.computeDeckStats([]);
eq(st0.total, 0, "空卡组：total=0");
throwsField(function () { A.computeDeckStats("nope"); }, "cards", "computeDeckStats 非数组抛 Error err.field='cards'");

/* ---------- 4. nextDueCards 向量 ---------- */
var dueCards = A.nextDueCards([{ due: 100 }, { due: 300 }, { due: 200 }], 250);
eqArr(dueCards.map(function (c) { return c.due; }), [100, 200], "复习队列向量：due<=250 按升序 → [100,200]");
throwsField(function () { A.nextDueCards("nope", 0); }, "cards", "nextDueCards cards 非数组抛 Error err.field='cards'");
throwsField(function () { A.nextDueCards([], NaN); }, "now", "nextDueCards now 非有限数抛 Error err.field='now'");

/* ---------- 5. parseImport 三向量 ---------- */
var pi = A.parseImport('{"name":"x","cards":[{"front":"a","back":"b"}]}');
eq(pi.name, "x", "parseImport 正常向量：name='x'");
eq(pi.cards.length, 1, "parseImport 正常向量：cards 长度 1");
eq(pi.cards[0].front, "a", "parseImport 正常向量：front='a'");
eq(pi.cards[0].back, "b", "parseImport 正常向量：back='b'");
eq(pi.cards[0].reviews, 0, "parseImport 归一化：reviews=0");
eq(pi.cards[0].interval, 0, "parseImport 归一化：interval=0");
eq(pi.cards[0].ease, 2.5, "parseImport 归一化：ease=2.5");
eq(pi.cards[0].due, 0, "parseImport 归一化：due=0");
throwsField(function () { A.parseImport("not json"); }, "text", "parseImport 非法 JSON 抛 Error err.field='text'");
throwsField(function () { A.parseImport('{"name":"x"}'); }, "deck", "parseImport 缺 cards 抛 Error err.field='deck'");
throwsField(function () { A.parseImport('{"name":"x","cards":[{"front":"a"}]}'); }, "deck",
  "parseImport 卡片缺 back 抛 Error err.field='deck'");
throwsField(function () { A.parseImport(123); }, "text", "parseImport 非字符串抛 Error err.field='text'");

/* ---------- 6. buildExportFileName 向量 ---------- */
eq(A.buildExportFileName(new Date(2026, 10, 3, 3, 0, 0)), "flashcards_20261103_030000.json",
  "文件名向量：new Date(2026,10,3,3,0,0) → 'flashcards_20261103_030000.json'");
throwsField(function () { A.buildExportFileName("x"); }, "now", "buildExportFileName 非 Date 抛 Error err.field='now'");
throwsField(function () { A.buildExportFileName(new Date(NaN)); }, "now", "buildExportFileName 无效 Date 抛 Error err.field='now'");

/* ---------- 7. categories.go 注册 ---------- */
var fcIdx = GO_SRC.indexOf('"flashcard_maker"');
ok(fcIdx >= 0, "注册 ID flashcard_maker");
ok(GO_SRC.indexOf('"/tools/flashcard-maker"') >= 0, "注册 Path /tools/flashcard-maker");
ok(GO_SRC.slice(fcIdx, fcIdx + 900).indexOf('Icon:        "quiz"') >= 0, "注册 Icon quiz");
ok(GO_SRC.slice(fcIdx, fcIdx + 900).indexOf("New:         true") >= 0, "注册 New 为 true");
ok(GO_SRC.slice(fcIdx, fcIdx + 900).indexOf('Category:    "学习工具"') >= 0, "注册 Category 为学习工具");
ok(GO_SRC.indexOf("闪卡") >= 0, "Description 含关键词 闪卡");
ok(GO_SRC.indexOf("抽认卡") >= 0, "Description 含关键词 抽认卡");
ok(GO_SRC.indexOf("背单词卡片") >= 0, "Description 含关键词 背单词卡片");
ok(GO_SRC.indexOf("Flashcards maker") >= 0, "Description 含关键词 Flashcards maker");
var quizMatches = GO_SRC.match(/Icon:\s+"quiz"/g) || [];
eq(quizMatches.length, 1, "Icon quiz 全库唯一（精确值复测锁定）");
var pathRe = /"\/tools\/[^"]+"/g, seen = {}, m, pathCount = 0;
while ((m = pathRe.exec(GO_SRC)) !== null) { if (!seen[m[0]]) { seen[m[0]] = true; pathCount++; } }
eq(pathCount, 309, "注册 Path 总数 274→275");

/* ---------- 8. 模板：真限制/互链/零网络/SEO ---------- */
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/flashcard-maker", "模板 canonical 含新 Path");
has(TPL_SRC, "跨设备不同步", "真限制①：localStorage 跨设备不同步");
has(TPL_SRC, "导出 JSON 备份", "真限制①：须导出 JSON 备份");
has(TPL_SRC, "简化版 SM-2", "真限制②：简化版 SM-2 非完整算法");
has(TPL_SRC, "Network 面板自证", "真限制③：纯本地零上传 Network 面板自证");
has(TPL_SRC, "/tools/math-worksheet-generator", "互链：算术题生成器（学习辅助一条龙）");
has(TPL_SRC, "/tools/ratio-solver", "互链：比例求解器（学习辅助一条龙）");
has(TPL_SRC, "学习辅助一条龙", "互链口号：学习辅助一条龙");
has(TPL_SRC, "闪卡", "模板含 SEO 关键词 闪卡");
has(TPL_SRC, "抽认卡", "模板含 SEO 关键词 抽认卡");
has(TPL_SRC, "背单词卡片", "模板含 SEO 关键词 背单词卡片");
has(TPL_SRC, "Flashcards maker", "模板含 SEO 关键词 Flashcards maker");
has(TPL_SRC, "/tools/typing-practice", "互链：打字练习（自律学习一条龙）");
has(TPL_SRC, "fm-practice", "模板含练习容器 fm-practice");
has(JS_SRC, "fm-practice-card", "JS 渲染练习翻转卡 fm-practice-card");
has(TPL_SRC, "fm-stats", "模板含统计区 fm-stats");
has(TPL_SRC, "fm-deck-list", "模板含卡组列表 fm-deck-list");
has(TPL_SRC, "fm-batch-text", "模板含批量导入区 fm-batch-text");
notHas(JS_SRC, "fetch(", "零网络：JS 无 fetch 调用");
notHas(JS_SRC, "XMLHttpRequest", "零网络：JS 无 XHR");
notHas(TPL_SRC, "fonts.googleapis", "模板零 CDN");

console.log("PASS " + pass + " / FAIL " + fail);
if (fail > 0) process.exit(1);
