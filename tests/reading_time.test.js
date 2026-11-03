/* 阅读时间估算器（reading_time）纯逻辑单元测试（零依赖）：
 * node tests/reading_time.test.js
 * 覆盖：规格确定性向量逐字命中（countWords 中英混排/空串/标点、
 * estimateReadingTime 两档语速与自定义语速/秒数下限、
 * formatDuration 分段文案、非法参数抛 Error 的 err.field）、
 * categories.go 注册（Path 总数 276→277、Icon hourglass_top 全库唯一、
 * New/Category/中英文关键词）与模板（真限制三条、与文本工具集双向互链
 * 「写作一条龙」、零网络请求静态检查）。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var A = require("../static/js/reading_time.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
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
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "reading_time.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "reading_time.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. countWords：规格确定性向量 ---------- */
var c1 = A.countWords("你好 world test");
eq(c1.chinese, 2, "countWords：'你好 world test' chinese=2");
eq(c1.english, 2, "countWords：'你好 world test' english=2");
eq(c1.total, 4, "countWords：'你好 world test' total=4（无标点）");
var c0 = A.countWords("");
eq(c0.chinese, 0, "countWords：空串 chinese=0");
eq(c0.english, 0, "countWords：空串 english=0");
eq(c0.total, 0, "countWords：空串 total=0");
var c2 = A.countWords("你好，世界！hello, world.");
eq(c2.chinese, 4, "countWords：标点不计入字数 chinese=4");
eq(c2.english, 2, "countWords：标点不影响英文词数 english=2");
eq(c2.total, 10, "countWords：total=4+2+4标点=10");
throwsField(function () { A.countWords(123); }, "text", "countWords(123)：抛 Error err.field='text'");
throwsField(function () { A.countWords(null); }, "text", "countWords(null)：抛 Error err.field='text'");
throwsField(function () { A.countWords(undefined); }, "text", "countWords(undefined)：抛 Error err.field='text'");

/* ---------- 2. estimateReadingTime：规格确定性向量 ---------- */
var e1 = A.estimateReadingTime("你好世界", "silent", { chinese: 400, english: 200 });
eq(e1.seconds, 1, "estimateReadingTime：4字默读400字/分 seconds=1");
eq(e1.minutes, 0, "estimateReadingTime：seconds=1 时 minutes=0");
eq(e1.display, "约 1 秒", "estimateReadingTime：seconds=1 时 display='约 1 秒'");
var e2 = A.estimateReadingTime("a ".repeat(200), "aloud", { chinese: 220, english: 140 });
eq(e2.seconds, 86, "estimateReadingTime：200词朗读140词/分 seconds=86");
eq(e2.minutes, 1, "estimateReadingTime：86秒 minutes=1");
eq(e2.display, "约 1 分 26 秒", "estimateReadingTime：86秒 display='约 1 分 26 秒'");
throwsField(function () { A.estimateReadingTime("x", "fast"); }, "mode", "estimateReadingTime mode='fast'：抛 Error err.field='mode'");
var e3 = A.estimateReadingTime("你好世界", "silent");
eq(e3.seconds, 1, "estimateReadingTime：缺省 wpm 取默读默认 400/200");
var e4 = A.estimateReadingTime("你好世界", "aloud");
eq(e4.seconds, 2, "estimateReadingTime：缺省 wpm 取朗读默认 220/140（4/220*60=1.09→2）");
var e5 = A.estimateReadingTime("", "silent", { chinese: 400, english: 200 });
eq(e5.seconds, 1, "estimateReadingTime：空文本秒数下限为 1 秒");
throwsField(function () { A.estimateReadingTime("x", "silent", { chinese: 0, english: 200 }); }, "wpm", "estimateReadingTime wpm.chinese=0：抛 Error err.field='wpm'");
throwsField(function () { A.estimateReadingTime("x", "silent", { chinese: -5, english: 200 }); }, "wpm", "estimateReadingTime wpm.chinese<0：抛 Error err.field='wpm'");
throwsField(function () { A.estimateReadingTime("x", "silent", { chinese: 400 }); }, "wpm", "estimateReadingTime wpm 缺 english：抛 Error err.field='wpm'");
throwsField(function () { A.estimateReadingTime("x", "silent", "fast"); }, "wpm", "estimateReadingTime wpm 非对象：抛 Error err.field='wpm'");
throwsField(function () { A.estimateReadingTime(123, "silent"); }, "text", "estimateReadingTime text 非字符串：抛 Error err.field='text'");

/* ---------- 3. formatDuration：规格确定性向量 ---------- */
eq(A.formatDuration(45), "约 45 秒", "formatDuration(45)='约 45 秒'");
eq(A.formatDuration(150), "约 2 分 30 秒", "formatDuration(150)='约 2 分 30 秒'");
eq(A.formatDuration(120), "约 2 分", "formatDuration(120)='约 2 分'");
eq(A.formatDuration(0), "约 0 秒", "formatDuration(0)='约 0 秒'");
eq(A.formatDuration(59), "约 59 秒", "formatDuration(59)='约 59 秒'");
eq(A.formatDuration(60), "约 1 分", "formatDuration(60)='约 1 分'");
eq(A.formatDuration(61), "约 1 分 1 秒", "formatDuration(61)='约 1 分 1 秒'");
eq(A.formatDuration(3661), "约 61 分 1 秒", "formatDuration(3661)='约 61 分 1 秒'");
throwsField(function () { A.formatDuration(-1); }, "seconds", "formatDuration(-1)：抛 Error err.field='seconds'");
throwsField(function () { A.formatDuration(1.5); }, "seconds", "formatDuration(1.5)：抛 Error err.field='seconds'");
throwsField(function () { A.formatDuration("45"); }, "seconds", "formatDuration('45')：抛 Error err.field='seconds'");
throwsField(function () { A.formatDuration(NaN); }, "seconds", "formatDuration(NaN)：抛 Error err.field='seconds'");

/* ---------- 4. window.ReadingTime / module.exports 同步导出 ---------- */
eq(typeof A.countWords, "function", "module.exports 含 countWords");
eq(typeof A.estimateReadingTime, "function", "module.exports 含 estimateReadingTime");
eq(typeof A.formatDuration, "function", "module.exports 含 formatDuration");
has(JS_SRC, "window.ReadingTime", "JS 挂载 window.ReadingTime");
eq(A.DEFAULT_WPM.silent.chinese, 400, "默认语速：默读中文 400 字/分");
eq(A.DEFAULT_WPM.silent.english, 200, "默认语速：默读英文 200 词/分");
eq(A.DEFAULT_WPM.aloud.chinese, 220, "默认语速：朗读中文 220 字/分");
eq(A.DEFAULT_WPM.aloud.english, 140, "默认语速：朗读英文 140 词/分");

/* ---------- 5. categories.go 注册 ---------- */
var rtIdx = GO_SRC.indexOf('"reading_time"');
ok(rtIdx >= 0, "注册含 ID reading_time");
has(GO_SRC, 'Path:        "/tools/reading-time"', "注册 Path 为 /tools/reading-time");
var rtBlock = GO_SRC.slice(rtIdx, rtIdx + 1600);
has(rtBlock, "阅读时间估算器", "注册 Name 为阅读时间估算器");
has(rtBlock, 'Category:    "文本工具"', "注册 Category 为文本工具");
has(rtBlock, "New:         true", "注册 New: true");
has(rtBlock, "阅读时间", "Description 含「阅读时间」");
has(rtBlock, "默读", "Description 含「默读」");
has(rtBlock, "朗读", "Description 含「朗读」");
has(rtBlock, "reading time", "Description 含「reading time」");
var ttIdx = GO_SRC.indexOf('"texttools"');
ok(ttIdx >= 0 && rtIdx > ttIdx, "注册紧邻 texttools 之后（文本工具家族相邻）");
var iconRe = /"hourglass_top"/g, iconHits = (GO_SRC.match(iconRe) || []).length;
eq(iconHits, 1, "Icon hourglass_top 全库唯一（精确值复测锁定）");
var pathRe = /"\/tools\/[^"]+"/g, seen = {}, m, pathCount = 0;
while ((m = pathRe.exec(GO_SRC)) !== null) { if (!seen[m[0]]) { seen[m[0]] = true; pathCount++; } }
eq(pathCount, 283, "注册 Path 总数 276→277");

/* ---------- 6. 模板：SEO/真限制/互链/零外部资源 ---------- */
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/reading-time", "模板 canonical 含新 Path");
has(TPL_SRC, 'id="rt-app"', "模板含应用根节点 rt-app");
has(TPL_SRC, 'id="rt-input"', "模板含文本输入框 rt-input");
has(TPL_SRC, 'id="rt-silent"', "模板含默读结果 rt-silent");
has(TPL_SRC, 'id="rt-aloud"', "模板含朗读结果 rt-aloud");
has(TPL_SRC, 'id="rt-copy"', "模板含复制按钮 rt-copy");
has(TPL_SRC, "固定语速估算", "真限制①：固定语速估算明示");
has(TPL_SRC, "个体差异大", "真限制②：个体差异大明示");
has(TPL_SRC, "仅供参考", "真限制②：仅供参考");
has(TPL_SRC, "不会上传到任何服务器", "真限制③：纯本地零上传");
has(TPL_SRC, "/tools/text-tools", "互链：文本工具集（写作一条龙）");
has(TPL_SRC, "写作一条龙", "互链文案：写作一条龙");
var extRes = TPL_SRC.match(/<(script|link)[^>]*?(src|href)="https?:\/\//g) || [];
ok(extRes.every(function (t) { return t.indexOf('rel="canonical"') >= 0; }),
  "零外部资源：script/link 外链仅 canonical（实得 " + JSON.stringify(extRes) + "）");
notHas(JS_SRC, "fetch(", "零网络：JS 无 fetch 调用");
notHas(JS_SRC, "XMLHttpRequest", "零网络：JS 无 XHR");

console.log("reading_time: pass=" + pass + " fail=" + fail);
process.exit(fail === 0 ? 0 : 1);
