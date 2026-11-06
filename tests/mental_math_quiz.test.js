/* 在线口算闯关纯逻辑单元测试（零依赖）：node tests/mental_math_quiz.test.js
 * 覆盖：rangeForGrade / buildQuestion / buildParenQuestion / normalizeInput /
 * evalAnswer / starFor / formatTime / pushMistake / updateBest / sanitizeFileName
 * 精确值向量与 err.field 全覆盖，以及注册与零网络请求静态检查。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/mental_math_quiz.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function jeq(a, b, name) { eq(JSON.stringify(a), JSON.stringify(b), name); }
function throws(fn, field, name) {
  try { fn(); ok(false, name + "（应抛错却未抛）"); }
  catch (e) { ok(!field || e.field === field, name + "（err.field 期望 " + field + "，实得 " + e.field + "）"); }
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "mental_math_quiz.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "mental_math_quiz.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. rangeForGrade：年级预设精确值 ---------- */
var rg1 = M.rangeForGrade(1);
eq(rg1.min, 0, "rangeForGrade(1).min");
eq(rg1.max, 20, "rangeForGrade(1).max");
jeq(rg1.ops, ["+", "-"], "rangeForGrade(1).ops");
var rg2 = M.rangeForGrade(2);
eq(rg2.min, 0, "rangeForGrade(2).min");
eq(rg2.max, 100, "rangeForGrade(2).max");
jeq(rg2.ops, ["+", "-"], "rangeForGrade(2).ops");
var rg3 = M.rangeForGrade(3);
eq(rg3.min, 1, "rangeForGrade(3).min");
eq(rg3.max, 100, "rangeForGrade(3).max");
jeq(rg3.ops, ["+", "-", "*", "/"], "rangeForGrade(3).ops");
var rg4 = M.rangeForGrade(4);
eq(rg4.min, 1, "rangeForGrade(4).min");
eq(rg4.max, 1000, "rangeForGrade(4).max");
jeq(rg4.ops, ["+", "-", "*", "/"], "rangeForGrade(4).ops");
var rg5 = M.rangeForGrade(5);
eq(rg5.min, 1, "rangeForGrade(5).min");
eq(rg5.max, 100, "rangeForGrade(5).max");
jeq(rg5.ops, ["+", "-", "*", "/", "()"], "rangeForGrade(5).ops");
var rg6 = M.rangeForGrade(6);
eq(rg6.min, 1, "rangeForGrade(6).min");
eq(rg6.max, 1000, "rangeForGrade(6).max");
jeq(rg6.ops, ["+", "-", "*", "/", "()"], "rangeForGrade(6).ops");
throws(function () { M.rangeForGrade(0); }, "grade", "rangeForGrade(0) 非法");
throws(function () { M.rangeForGrade(7); }, "grade", "rangeForGrade(7) 非法");
throws(function () { M.rangeForGrade(1.5); }, "grade", "rangeForGrade(1.5) 非整数");
throws(function () { M.rangeForGrade("2"); }, "grade", "rangeForGrade('2') 字符串");
throws(function () { M.rangeForGrade(NaN); }, "grade", "rangeForGrade(NaN)");
throws(function () { M.rangeForGrade(null); }, "grade", "rangeForGrade(null)");

/* ---------- 2. buildQuestion：四则＋括号 ---------- */
var q1 = M.buildQuestion(7, 5, "+");
eq(q1.answer, 12, "buildQuestion 7+5 answer");
eq(q1.text, "7 + 5", "buildQuestion 7+5 text");
var q2 = M.buildQuestion(10, 3, "-");
eq(q2.answer, 7, "buildQuestion 10-3 answer");
eq(q2.text, "10 − 3", "buildQuestion 10-3 text");
var q3 = M.buildQuestion(6, 7, "*");
eq(q3.answer, 42, "buildQuestion 6*7 answer");
eq(q3.text, "6 × 7", "buildQuestion 6*7 text");
var q4 = M.buildQuestion(20, 4, "/");
eq(q4.answer, 5, "buildQuestion 20/4 answer");
eq(q4.text, "20 ÷ 4", "buildQuestion 20/4 text");
var q5 = M.buildQuestion(3, 4, "()");
eq(q5.answer, 7, "buildQuestion (3+4) answer");
eq(q5.text, "(3 + 4)", "buildQuestion (3+4) text");
throws(function () { M.buildQuestion(1, 2, "^"); }, "op", "buildQuestion op='^' 非法");
throws(function () { M.buildQuestion(1, 2, ""); }, "op", "buildQuestion op='' 非法");
throws(function () { M.buildQuestion(1, 2, null); }, "op", "buildQuestion op=null 非法");
throws(function () { M.buildQuestion(1, 0, "/"); }, "op", "buildQuestion 除数为 0");

/* ---------- 3. buildParenQuestion ---------- */
var p1 = M.buildParenQuestion(8, 3, 2, "+", "*");
eq(p1.answer, 22, "buildParenQuestion (8+3)*2 answer");
eq(p1.text, "(8 + 3) × 2", "buildParenQuestion (8+3)*2 text");
var p2 = M.buildParenQuestion(10, 4, 2, "-", "/");
eq(p2.answer, 3, "buildParenQuestion (10-4)/2 answer");
eq(p2.text, "(10 − 4) ÷ 2", "buildParenQuestion (10-4)/2 text");
throws(function () { M.buildParenQuestion(1, 2, 3, "^", "+"); }, "op", "buildParenQuestion op1 非法");
throws(function () { M.buildParenQuestion(1, 2, 3, "+", "%"); }, "op", "buildParenQuestion op2 非法");
throws(function () { M.buildParenQuestion(1, 2, 0, "+", "/"); }, "op", "buildParenQuestion 外层除数为 0");

/* ---------- 4. normalizeInput ---------- */
eq(M.normalizeInput("42"), 42, "normalizeInput '42'");
eq(M.normalizeInput(" 3.5 "), 3.5, "normalizeInput 首尾空白小数");
eq(M.normalizeInput("-7"), -7, "normalizeInput 负数");
eq(M.normalizeInput("0"), 0, "normalizeInput 0");
throws(function () { M.normalizeInput(""); }, "answer", "normalizeInput 空串");
throws(function () { M.normalizeInput("   "); }, "answer", "normalizeInput 纯空白");
throws(function () { M.normalizeInput("abc"); }, "answer", "normalizeInput 非数字");
throws(function () { M.normalizeInput("1a"); }, "answer", "normalizeInput 混杂");
throws(function () { M.normalizeInput(null); }, "answer", "normalizeInput null");

/* ---------- 5. evalAnswer ---------- */
jeq(M.evalAnswer({ answer: 12 }, 12), { correct: true }, "evalAnswer 答对");
jeq(M.evalAnswer({ answer: 12 }, 13), { correct: false }, "evalAnswer 答错");
jeq(M.evalAnswer({ a: 1, b: 2, op: "+", answer: 3, text: "1 + 2" }, 3), { correct: true }, "evalAnswer 完整题结构");
throws(function () { M.evalAnswer(null, 1); }, "question", "evalAnswer question=null");
throws(function () { M.evalAnswer({}, 1); }, "question", "evalAnswer 无 answer 字段");
throws(function () { M.evalAnswer({ answer: "12" }, 12); }, "question", "evalAnswer answer 非数字");

/* ---------- 6. starFor：阈值边界 ---------- */
eq(M.starFor(0.95), 3, "starFor 0.95 → 3 星");
eq(M.starFor(1), 3, "starFor 1 → 3 星");
eq(M.starFor(0.949), 2, "starFor 0.949 → 2 星");
eq(M.starFor(0.85), 2, "starFor 0.85 → 2 星");
eq(M.starFor(0.849), 1, "starFor 0.849 → 1 星");
eq(M.starFor(0.70), 1, "starFor 0.70 → 1 星");
eq(M.starFor(0.69), 0, "starFor 0.69 → 0 星");
eq(M.starFor(0), 0, "starFor 0 → 0 星");
throws(function () { M.starFor(-0.1); }, "accuracy", "starFor -0.1 非法");
throws(function () { M.starFor(1.1); }, "accuracy", "starFor 1.1 非法");
throws(function () { M.starFor("0.9"); }, "accuracy", "starFor 字符串非法");
throws(function () { M.starFor(NaN); }, "accuracy", "starFor NaN 非法");

/* ---------- 7. formatTime ---------- */
eq(M.formatTime(90000), "01:30", "formatTime 90000 → 01:30");
eq(M.formatTime(0), "00:00", "formatTime 0 → 00:00");
eq(M.formatTime(59000), "00:59", "formatTime 59000 → 00:59");
eq(M.formatTime(61000), "01:01", "formatTime 61000 → 01:01");
eq(M.formatTime(1500), "00:01", "formatTime 1500 向下取整");
eq(M.formatTime(3600000), "60:00", "formatTime 3600000 → 60:00");
throws(function () { M.formatTime(-1); }, "ms", "formatTime 负值");
throws(function () { M.formatTime("x"); }, "ms", "formatTime 非数字");

/* ---------- 8. pushMistake ---------- */
jeq(M.pushMistake([{ a: 1 }, { a: 2 }], { a: 3 }, 2), [{ a: 2 }, { a: 3 }], "pushMistake 超限截断头部");
jeq(M.pushMistake([{ a: 1 }], { a: 2 }, 5), [{ a: 1 }, { a: 2 }], "pushMistake 未超限追加");
jeq(M.pushMistake(null, { a: 1 }, 3), [{ a: 1 }], "pushMistake mistakes=null 容忍");
throws(function () { M.pushMistake([], null, 3); }, "question", "pushMistake q=null");
throws(function () { M.pushMistake([], "x", 3); }, "question", "pushMistake q 非对象");
throws(function () { M.pushMistake([], { a: 1 }, 0); }, "maxLen", "pushMistake maxLen=0");
throws(function () { M.pushMistake([], { a: 1 }, -2); }, "maxLen", "pushMistake maxLen 负值");
throws(function () { M.pushMistake([], { a: 1 }, 1.5); }, "maxLen", "pushMistake maxLen 非整数");
throws(function () { M.pushMistake([], { a: 1 }, "3"); }, "maxLen", "pushMistake maxLen 字符串");

/* ---------- 9. updateBest ---------- */
var b0 = M.updateBest({}, "g2_n20", { accuracy: 0.9, avgSec: 8.5 });
jeq(b0, { g2_n20: { accuracy: 0.9, avgSec: 8.5 } }, "updateBest 新 key 写入");
var b1 = M.updateBest(b0, "g2_n20", { accuracy: 0.95, avgSec: 9.0 });
jeq(b1.g2_n20, { accuracy: 0.95, avgSec: 9.0 }, "updateBest 正确率更高更新");
var b2 = M.updateBest(b1, "g2_n20", { accuracy: 0.95, avgSec: 7.0 });
jeq(b2.g2_n20, { accuracy: 0.95, avgSec: 7.0 }, "updateBest 正确率相等平均用时更短更新");
var b3 = M.updateBest(b2, "g2_n20", { accuracy: 0.9, avgSec: 5.0 });
jeq(b3.g2_n20, { accuracy: 0.95, avgSec: 7.0 }, "updateBest 都不优不更新");
eq(JSON.stringify(b0), JSON.stringify({ g2_n20: { accuracy: 0.9, avgSec: 8.5 } }), "updateBest 不改动原对象");
var b4 = M.updateBest(null, "g1_n10", { accuracy: 1, avgSec: 3.2 });
jeq(b4, { g1_n10: { accuracy: 1, avgSec: 3.2 } }, "updateBest best=null 容忍");
throws(function () { M.updateBest({}, "k", { accuracy: 1.2, avgSec: 1 }); }, "score", "updateBest accuracy>1");
throws(function () { M.updateBest({}, "k", { accuracy: 0.5, avgSec: -1 }); }, "score", "updateBest avgSec 负值");
throws(function () { M.updateBest({}, "k", null); }, "score", "updateBest score=null");

/* ---------- 10. sanitizeFileName ---------- */
eq(M.sanitizeFileName(""), "mental-math-quiz", "sanitizeFileName 空串回退");
eq(M.sanitizeFileName("   "), "mental-math-quiz", "sanitizeFileName 纯空白回退");
eq(M.sanitizeFileName(null), "mental-math-quiz", "sanitizeFileName null 回退");
eq(M.sanitizeFileName("口算 闯关 1"), "口算-闯关-1", "sanitizeFileName 空白折横线");

/* ---------- 11. 注册与零网络请求静态检查 ---------- */
ok(GO_SRC.indexOf('"mental_math_quiz"') !== -1, "categories.go 注册 ID");
ok(GO_SRC.indexOf('"/tools/mental-math-quiz"') !== -1, "categories.go 注册 Path");
var regBlock = GO_SRC.split('"mental_math_quiz"')[1].split("},")[0];
ok(regBlock.indexOf('Category:    "学习工具"') !== -1, "categories.go 注册 Category 学习工具");
ok(regBlock.indexOf("New:         true") !== -1, "categories.go 注册 New true");
ok(regBlock.indexOf('Icon:        "bolt"') !== -1, "categories.go 注册 Icon bolt");
var iconHits = (GO_SRC.match(/Icon:\s+"bolt"/g) || []).length;
eq(iconHits, 1, "Icon bolt 精确值复测锁定：全库唯一 1 处");
var pathCount = {};
GO_SRC.replace(/"(\/tools\/[^"]+)"/g, function (_, p) { pathCount[p] = 1; return p; });
eq(Object.keys(pathCount).length, 313, "注册总数 294→295 Path");
ok(JS_SRC.indexOf("fetch(") === -1 && JS_SRC.indexOf("XMLHttpRequest") === -1,
  "JS 零 fetch/XHR");
ok(TPL_SRC.indexOf('src="http') === -1 && TPL_SRC.indexOf("cdn.") === -1,
  "模板零 CDN 外链");
ok(TPL_SRC.indexOf("/tools/static/js/mental_math_quiz.js") !== -1, "模板引入 mental_math_quiz.js");
ok(TPL_SRC.indexOf("localStorage") !== -1, "模板明示 localStorage");
ok(TPL_SRC.indexOf("5MB") !== -1, "模板明示 5MB 配额真限制");
ok(TPL_SRC.indexOf("Math.random") !== -1 && TPL_SRC.indexOf("不可复现") !== -1, "模板明示随机不可复现真限制");
ok(TPL_SRC.indexOf("不上传任何服务器") !== -1, "模板明示零上传真限制");
ok(TPL_SRC.indexOf("在线口算练习") !== -1 && TPL_SRC.indexOf("小学生口算") !== -1 &&
   TPL_SRC.indexOf("口算打卡") !== -1 && TPL_SRC.indexOf("数学口算题") !== -1 &&
   TPL_SRC.indexOf("小学生数学练习") !== -1, "模板含 SEO 关键词");

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail === 0 ? 0 : 1);
