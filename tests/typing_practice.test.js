/* 打字练习（typing_practice）纯逻辑单元测试（零依赖）：
 * node tests/typing_practice.test.js
 * 覆盖：规格确定性向量逐值命中（buildTargets 逐字符精确值/initSession 结构/
 * applyKeystroke 对错着色+keyErrors 计数/Backspace 不在纯函数口径内/
 * calcStats WPM 精确值/accuracy/非法 elapsedMs/topErrors 降序精确值/
 * updateBest 三情形更新规则/sanitizeFileName 家族惯例/TEXTS 文本库）、
 * categories.go 注册（Path 总数 297→298、Icon type 全库唯一、New/Category/关键词）
 * 与模板（SEO 五关键词、真限制三条、自律学习一条龙双向互链、零网络请求静态检查）。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var A = require("../static/js/typing_practice.js");

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
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "typing_practice.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "typing_practice.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");
var SN_TPL = fs.readFileSync(path.join(ROOT, "templates", "study_notes.html"), "utf8");
var FC_TPL = fs.readFileSync(path.join(ROOT, "templates", "flashcard_maker.html"), "utf8");
var HB_TPL = fs.readFileSync(path.join(ROOT, "templates", "habit_tracker.html"), "utf8");

/* ---------- 1. buildTargets：逐字符精确值 ---------- */
eqArr(A.buildTargets("abc"), ["a", "b", "c"], "buildTargets('abc') 逐字符精确值");
eq(A.buildTargets("hello").length, 5, "buildTargets('hello') 长度 5");
eqArr(A.buildTargets("中a"), ["中", "a"], "buildTargets 中英混排逐字符");
throwsField(function () { A.buildTargets(123); }, "text", "buildTargets(123)：err.field=text");
throwsField(function () { A.buildTargets(null); }, "text", "buildTargets(null)：err.field=text");
throwsField(function () { A.buildTargets(""); }, "text", "buildTargets('') 空文本：err.field=text");

/* ---------- 2. initSession：结构逐值 ---------- */
var s0 = A.initSession("ab", "en");
eq(s0.mode, "en", "initSession：mode 逐字");
eqArr(s0.targets, ["a", "b"], "initSession：targets 逐字符");
eqArr(s0.typed, [], "initSession：typed 空数组");
eq(s0.errors, 0, "initSession：errors=0");
eq(Object.keys(s0.keyErrors).length, 0, "initSession：keyErrors 空对象");
eq(s0.startedAt, 0, "initSession：startedAt=0");
throwsField(function () { A.initSession("ab", "xx"); }, "mode", "initSession 非法 mode：err.field=mode");
throwsField(function () { A.initSession("ab", null); }, "mode", "initSession mode=null：err.field=mode");
throwsField(function () { A.initSession("", "en"); }, "text", "initSession 空文本：err.field=text");

/* ---------- 3. applyKeystroke：对错着色+keyErrors 计数精确值 ---------- */
var s1 = A.initSession("aab", "en");
var r1 = A.applyKeystroke(s1, "a");
ok(r1 === s1, "applyKeystroke：返回同一 session 引用");
eq(s1.typed.length, 1, "applyKeystroke：typed 长度 1");
eq(s1.typed[0].correct, true, "applyKeystroke：打对 correct=true（着色绿）");
eq(s1.errors, 0, "applyKeystroke：打对 errors 保持 0");
A.applyKeystroke(s1, "x");
eq(s1.typed[1].correct, false, "applyKeystroke：打错 correct=false（着色红）");
eq(s1.errors, 1, "applyKeystroke：打错 errors=1 精确值");
eq(s1.keyErrors.x, 1, "applyKeystroke：keyErrors.x=1 精确值");
A.applyKeystroke(s1, "x");
eq(s1.errors, 2, "applyKeystroke：同一错键 errors=2 精确值");
eq(s1.keyErrors.x, 2, "applyKeystroke：keyErrors.x=2 精确值");
throwsField(function () { A.applyKeystroke(s1, "b"); }, "key", "applyKeystroke 文本打完仍输入：err.field=key（不静默钳制）");
throwsField(function () { A.applyKeystroke(s1, "ab"); }, "key", "applyKeystroke 双字符：err.field=key");
throwsField(function () { A.applyKeystroke(s1, ""); }, "key", "applyKeystroke 空字符：err.field=key");
throwsField(function () { A.applyKeystroke(null, "a"); }, "session", "applyKeystroke session=null：err.field=session");
throwsField(function () { A.applyKeystroke({}, "a"); }, "session", "applyKeystroke 结构不合：err.field=session");

/* ---------- 4. calcStats：WPM 精确值 ---------- */
var s2 = A.initSession(new Array(301).join("a"), "en");
for (var i = 0; i < 300; i++) A.applyKeystroke(s2, "a");
var st2 = A.calcStats(s2, 60000);
eq(st2.wpm, 60, "calcStats：60000ms/300 正确字符→WPM 60 精确值");
eq(st2.accuracy, 100, "calcStats：全对 accuracy=100 精确值");
eq(st2.elapsedMs, 60000, "calcStats：elapsedMs 回传精确值");
eq(st2.charsTyped, 300, "calcStats：charsTyped=300 精确值");
eq(st2.charsCorrect, 300, "calcStats：charsCorrect=300 精确值");
eq(st2.progress, 1, "calcStats：打完 progress=1 精确值");
var s3 = A.initSession("abcde", "code");
"axcde".split("").forEach(function (c) { A.applyKeystroke(s3, c); });
var st3 = A.calcStats(s3, 120000);
eq(st3.accuracy, 80, "calcStats：4/5 正确 accuracy=80 精确值");
eq(st3.wpm, 0.4, "calcStats：120000ms/4 正确字符→WPM 0.4 精确值");
var s4 = A.initSession("abcd", "zh");
A.applyKeystroke(s4, "a"); A.applyKeystroke(s4, "b");
eq(A.calcStats(s4, 30000).progress, 0.5, "calcStats：打一半 progress=0.5 精确值");
throwsField(function () { A.calcStats(s2, -1); }, "elapsedMs", "calcStats elapsedMs=-1：err.field=elapsedMs");
throwsField(function () { A.calcStats(s2, NaN); }, "elapsedMs", "calcStats elapsedMs=NaN：err.field=elapsedMs");
throwsField(function () { A.calcStats(s2, "x"); }, "elapsedMs", "calcStats elapsedMs 非数字：err.field=elapsedMs");
throwsField(function () { A.calcStats(null, 1000); }, "session", "calcStats session 非法：err.field=session");

/* ---------- 5. topErrors：降序精确值 ---------- */
var top = A.topErrors({ e: 3, a: 5, o: 1 }, 2);
eq(top.length, 2, "topErrors：n=2 取 2 条");
eq(top[0].key, "a", "topErrors：首位 key='a' 精确值");
eq(top[0].count, 5, "topErrors：首位 count=5 精确值");
eq(top[1].key, "e", "topErrors：次位 key='e' 精确值");
eq(top[1].count, 3, "topErrors：次位 count=3 精确值");
eq(A.topErrors({ b: 2, a: 2 }, 2)[0].key, "a", "topErrors：count 并列按 key 升序");
eq(A.topErrors({ x: 1 }, 10).length, 1, "topErrors：n 超量返回全部");
eq(A.topErrors({ a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 }).length, 5, "topErrors：n 缺省 5");
throwsField(function () { A.topErrors("x", 2); }, "keyErrors", "topErrors keyErrors 非对象：err.field=keyErrors");
throwsField(function () { A.topErrors([], 2); }, "keyErrors", "topErrors keyErrors 数组：err.field=keyErrors");
throwsField(function () { A.topErrors({}, 0); }, "n", "topErrors n=0：err.field=n");
throwsField(function () { A.topErrors({}, 1.5); }, "n", "topErrors n 非整数：err.field=n");
throwsField(function () { A.topErrors({}, "x"); }, "n", "topErrors n 非数字：err.field=n");

/* ---------- 6. updateBest：三情形更新规则精确值 ---------- */
var b1 = A.updateBest(null, "en", { wpm: 60, accuracy: 95 });
eq(b1.en.wpm, 60, "updateBest：无记录→wpm 60 精确值");
eq(b1.en.accuracy, 95, "updateBest：无记录→accuracy 95 精确值");
var b2 = A.updateBest({ en: { wpm: 50, accuracy: 90 } }, "en", { wpm: 60, accuracy: 80 });
eq(b2.en.wpm, 60, "updateBest：更高 WPM 更新→60 精确值");
eq(b2.en.accuracy, 80, "updateBest：更高 WPM 更新→accuracy 80 精确值");
var b3 = A.updateBest({ en: { wpm: 60, accuracy: 80 } }, "en", { wpm: 60, accuracy: 95 });
eq(b3.en.accuracy, 95, "updateBest：等 WPM 更高 accuracy 更新→95 精确值");
var prev4 = { en: { wpm: 60, accuracy: 95 } };
var b4 = A.updateBest(prev4, "en", { wpm: 55, accuracy: 99 });
eq(b4.en.wpm, 60, "updateBest：都不优不更新→wpm 保持 60");
eq(b4.en.accuracy, 95, "updateBest：都不优不更新→accuracy 保持 95");
eq(prev4.en.wpm, 60, "updateBest：原 best 不被修改（不可变）");
var b5 = A.updateBest({ en: { wpm: 60, accuracy: 90 }, zh: { wpm: 30, accuracy: 80 } }, "code", { wpm: 40, accuracy: 85 });
eq(b5.code.wpm, 40, "updateBest：新类目 code 写入");
eq(b5.en.wpm, 60, "updateBest：他类目 en 保持");
eq(b5.zh.wpm, 30, "updateBest：他类目 zh 保持");
throwsField(function () { A.updateBest("x", "en", { wpm: 1, accuracy: 1 }); }, "best", "updateBest best 非对象：err.field=best");
throwsField(function () { A.updateBest(null, "xx", { wpm: 1, accuracy: 1 }); }, "mode", "updateBest mode 非法：err.field=mode");
throwsField(function () { A.updateBest(null, "en", null); }, "stats", "updateBest stats=null：err.field=stats");
throwsField(function () { A.updateBest(null, "en", { wpm: NaN, accuracy: 1 }); }, "stats", "updateBest wpm 非有限：err.field=stats");

/* ---------- 7. sanitizeFileName：家族惯例 ---------- */
eq(A.sanitizeFileName("hello world"), "hello-world", "sanitizeFileName：空白转 '-' 逐字");
eq(A.sanitizeFileName("a/b\\c:d*e"), "abcde", "sanitizeFileName：非法字符清洗逐字");
eq(A.sanitizeFileName(""), "typing-practice", "sanitizeFileName：空文本回退 'typing-practice'");
eq(A.sanitizeFileName("   "), "typing-practice", "sanitizeFileName：空白文本回退");
eq(A.sanitizeFileName(new Array(71).join("a")).length, 60, "sanitizeFileName：超长截断 60");

/* ---------- 8. TEXTS 文本库 ---------- */
eqArr(A.MODES, ["en", "code", "zh"], "MODES 三类目精确值");
["en", "code", "zh"].forEach(function (m) {
  ok(Array.isArray(A.TEXTS[m]) && A.TEXTS[m].length >= 3, "TEXTS." + m + " 非空文本库");
  ok(A.TEXTS[m].every(function (t) { return typeof t === "string" && t.length > 0; }), "TEXTS." + m + " 全为非空字符串");
});
ok(typeof A.MODE_NAMES.en === "string", "MODE_NAMES 含英文名言");

/* ---------- 9. window.TypingPractice 挂载 + module.exports ---------- */
ok(typeof A.buildTargets === "function" && typeof A.initSession === "function" &&
  typeof A.applyKeystroke === "function" && typeof A.calcStats === "function" &&
  typeof A.topErrors === "function" && typeof A.updateBest === "function" &&
  typeof A.sanitizeFileName === "function",
  "module.exports 同步导出七个纯函数");
has(JS_SRC, "window.TypingPractice", "JS 挂载 window.TypingPractice");

/* ---------- 10. categories.go 注册 ---------- */
var tpIdx = GO_SRC.indexOf('"typing_practice"');
ok(tpIdx >= 0, "注册 ID typing_practice");
ok(GO_SRC.indexOf('"/tools/typing-practice"') >= 0, "注册 Path /tools/typing-practice");
ok(GO_SRC.slice(tpIdx, tpIdx + 1200).indexOf('Icon:        "type"') >= 0, "注册 Icon type");
ok(GO_SRC.slice(tpIdx, tpIdx + 1200).indexOf("New:         true") >= 0, "注册 New 为 true");
ok(GO_SRC.slice(tpIdx, tpIdx + 1200).indexOf('Category:    "学习工具"') >= 0, "注册 Category 为学习工具");
var tpDesc = GO_SRC.slice(tpIdx, tpIdx + 1600);
has(tpDesc, "打字练习", "Description 含「打字练习」");
has(tpDesc, "打字速度测试", "Description 含「打字速度测试」");
has(tpDesc, "typing practice", "Description 含「typing practice」");
var typeIconHits = (GO_SRC.match(/Icon:\s*"type"/g) || []).length;
eq(typeIconHits, 1, "Icon type 全库唯一（精确值复测锁定）");
var pathRe = /"\/tools\/[^"]+"/g, seen = {}, m, pathCount = 0;
while ((m = pathRe.exec(GO_SRC)) !== null) { if (!seen[m[0]]) { seen[m[0]] = true; pathCount++; } }
eq(pathCount, 311, "注册 Path 总数 297→298");

/* ---------- 11. 模板：SEO/真限制/互链/零网络/无障碍 ---------- */
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/typing-practice", "模板 canonical 含新 Path");
has(TPL_SRC, 'id="tp-app"', "模板含应用根节点 tp-app");
has(TPL_SRC, 'id="tp-input"', "模板含输入区 tp-input");
has(TPL_SRC, 'id="tp-text"', "模板含文本展示区 tp-text");
has(TPL_SRC, "在线打字练习", "模板含 SEO 关键词 在线打字练习");
has(TPL_SRC, "打字速度测试", "模板含 SEO 关键词 打字速度测试");
has(TPL_SRC, "键盘打字练习", "模板含 SEO 关键词 键盘打字练习");
has(TPL_SRC, "中文打字练习", "模板含 SEO 关键词 中文打字练习");
has(TPL_SRC, "英文打字练习", "模板含 SEO 关键词 英文打字练习");
has(TPL_SRC, "计时基于浏览器本地时钟", "真限制①：本地时钟计时差异");
has(TPL_SRC, "localStorage", "真限制②：localStorage 明示");
has(TPL_SRC, "约 5MB 配额", "真限制②：约 5MB 配额明示");
has(TPL_SRC, "清除浏览器数据后丢失", "真限制②：丢失风险明示");
has(TPL_SRC, "所有练习数据不上传任何服务器", "真限制③：纯本地零上传");
has(TPL_SRC, "Network 面板自证", "真限制③：Network 面板自证");
has(TPL_SRC, "内置文本仅为示例片段", "真限制③：内置文本示例明示");
has(TPL_SRC, "/tools/study-notes", "互链：学习笔记整理器（学习辅助一条龙）");
has(TPL_SRC, "/tools/flashcard-maker", "互链：闪卡卡片生成器（学习辅助一条龙）");
has(TPL_SRC, "/tools/habit-tracker", "互链：习惯追踪器（自律学习一条龙）");
has(TPL_SRC, "学习辅助一条龙", "互链文案：学习辅助一条龙");
has(TPL_SRC, "自律学习一条龙", "互链文案：自律学习一条龙");
has(TPL_SRC, "prefers-reduced-motion", "无障碍：动画可减弱");
has(TPL_SRC, 'aria-live="polite"', "无障碍：aria-live 状态播报");
notHas(JS_SRC, "fetch(", "零网络：JS 无 fetch 调用");
notHas(JS_SRC, "XMLHttpRequest", "零网络：JS 无 XHR");
notHas(JS_SRC, "WebSocket", "零网络：JS 无 WebSocket");
notHas(TPL_SRC, "fonts.googleapis", "模板零 CDN");
ok((TPL_SRC.match(/<script[^>]*src="http/g) || []).length === 0, "模板零外部脚本：无 http script src");
var httpLinks = (TPL_SRC.match(/<link[^>]*href="(http[^"]*)"/g) || []).map(function (t) {
  return t.replace(/^.*href="/, "").replace(/"$/, "");
});
ok(httpLinks.every(function (u) { return u.indexOf("johnkingzcq123.xyz") !== -1; }),
  "模板零外部样式：http link 仅 canonical 自家域名");
has(FC_TPL, "/tools/typing-practice", "双向互链：闪卡模板链向打字练习");
has(SN_TPL, "/tools/typing-practice", "双向互链：学习笔记模板链向打字练习");
has(HB_TPL, "/tools/typing-practice", "双向互链：习惯追踪器模板链向打字练习");

/* ---------- 12. 回归防线：Bug1（单行 input 吞回车）/Bug2（IME 组合输入） ---------- */
has(TPL_SRC, '<textarea id="tp-input"', "回归防线 Bug1：输入区须为 textarea（单行 input 按回车不触发 input）");
has(TPL_SRC, 'resize: vertical', "回归防线 Bug1：textarea 可纵向拖动尺寸");
has(JS_SRC, "compositionstart", "回归防线 Bug2：JS 监听 compositionstart");
has(JS_SRC, "compositionend", "回归防线 Bug2：JS 监听 compositionend");
ok(/if\s*\(\s*composing\s*\)\s*return/.test(JS_SRC), "回归防线 Bug2：onInput 组合输入期间跳过逐键处理");
has(TPL_SRC, 'aria-valuenow="0"', "无障碍：进度条含 aria-valuenow（renderStats 随进度同步更新）");

console.log("PASS " + pass + " / FAIL " + fail);
if (fail > 0) process.exit(1);
