/* 反应速度测试纯函数单元测试（零依赖）：node tests/reaction_test.test.js
* 覆盖：computeReactionMs（锚点 (1000,1248)→248、负耗时抛错 err.field='clickMs'）、
* isFalseStart（锚点 (900,1000)→true、边界相等不抢跑）、averageReactions（锚点
* [200,250,300]→250）、bestReaction（最小值）、gradeReaction（边界
* 199/200/249/250/299/300/399/400）、validateReactionConfig（缺省 5、只认
* 3/5/10）、validateReactionState（四阶段状态机）、formatReactionMs（锚点
* 248→"248 ms"、1250→"1.25 s"）、非法参数 err.field、categories.go 注册（Path
* 总数 312→313、Icon flash_on 全库唯一、紧邻 decision_wheel）、模板（SEO
* 关键词、真限制四条、控件、互链单向、零外部资源静态检查）、浏览器绑定源码级
* 检查（2–5s 随机等待、空格操作、localStorage 最佳＋历史）。
*/
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/reaction_test.js");

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

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "reaction_test.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "reaction_test.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");
var DW_TPL = fs.readFileSync(path.join(ROOT, "templates", "decision_wheel.html"), "utf8");

/* ---------- 1. computeReactionMs ---------- */
eq(M.computeReactionMs(1000, 1248), 248, "computeReactionMs：(1000,1248)→248");
eq(M.computeReactionMs(0, 0), 0, "computeReactionMs：(0,0)→0");
eq(M.computeReactionMs(500, 500), 0, "computeReactionMs：相等时刻→0");
eq(M.computeReactionMs(1000, 1000.5), 0.5, "computeReactionMs：小数毫秒保留");
throws(function () { M.computeReactionMs(1248, 1000); }, "clickMs", "computeReactionMs：clickMs 早于 startMs 抛错 err.field='clickMs'");
throws(function () { M.computeReactionMs("1000", 1248); }, "startMs", "computeReactionMs：字符串 startMs 抛错 err.field='startMs'");
throws(function () { M.computeReactionMs(NaN, 1248); }, "startMs", "computeReactionMs：NaN startMs 抛错");
throws(function () { M.computeReactionMs(1000, null); }, "clickMs", "computeReactionMs：null clickMs 抛错 err.field='clickMs'");
throws(function () { M.computeReactionMs(1000, Infinity); }, "clickMs", "computeReactionMs：Infinity clickMs 抛错");

/* ---------- 2. isFalseStart ---------- */
eq(M.isFalseStart(900, 1000), true, "isFalseStart：(900,1000)→true（抢跑）");
eq(M.isFalseStart(1000, 1000), false, "isFalseStart：(1000,1000)→false（恰绿灯不抢跑）");
eq(M.isFalseStart(1200, 1000), false, "isFalseStart：(1200,1000)→false（绿灯后）");
eq(M.isFalseStart(0, 1000), true, "isFalseStart：(0,1000)→true（开局即点）");
throws(function () { M.isFalseStart(NaN, 1000); }, "clickMs", "isFalseStart：NaN clickMs 抛错 err.field='clickMs'");
throws(function () { M.isFalseStart(900, "1000"); }, "greenMs", "isFalseStart：字符串 greenMs 抛错 err.field='greenMs'");

/* ---------- 3. averageReactions ---------- */
eq(M.averageReactions([200, 250, 300]), 250, "averageReactions：[200,250,300]→250");
eq(M.averageReactions([100, 200]), 150, "averageReactions：[100,200]→150");
eq(M.averageReactions([248]), 248, "averageReactions：单轮即自身");
eq(M.averageReactions([199, 201]), 200, "averageReactions：[199,201]→200");
throws(function () { M.averageReactions([]); }, "reactions", "averageReactions：空数组抛错 err.field='reactions'");
throws(function () { M.averageReactions("250"); }, "reactions", "averageReactions：非数组抛错");
throws(function () { M.averageReactions([200, -1]); }, "reactions", "averageReactions：负成绩抛错");
throws(function () { M.averageReactions([200, NaN]); }, "reactions", "averageReactions：NaN 成绩抛错");

/* ---------- 4. bestReaction ---------- */
eq(M.bestReaction([300, 200, 250]), 200, "bestReaction：[300,200,250]→200");
eq(M.bestReaction([250]), 250, "bestReaction：单轮即自身");
eq(M.bestReaction([400, 400, 199]), 199, "bestReaction：[400,400,199]→199");
throws(function () { M.bestReaction([]); }, "reactions", "bestReaction：空数组抛错 err.field='reactions'");
throws(function () { M.bestReaction([200, Infinity]); }, "reactions", "bestReaction：Infinity 成绩抛错");

/* ---------- 5. gradeReaction：边界 ---------- */
eqj(M.gradeReaction(199), { grade: "S", label: "职业级" }, "gradeReaction：199→S 职业级");
eqj(M.gradeReaction(200), { grade: "A", label: "优秀" }, "gradeReaction：200→A 优秀");
eqj(M.gradeReaction(249), { grade: "A", label: "优秀" }, "gradeReaction：249→A 优秀");
eqj(M.gradeReaction(250), { grade: "B", label: "良好" }, "gradeReaction：250→B 良好");
eqj(M.gradeReaction(299), { grade: "B", label: "良好" }, "gradeReaction：299→B 良好");
eqj(M.gradeReaction(300), { grade: "C", label: "一般" }, "gradeReaction：300→C 一般");
eqj(M.gradeReaction(399), { grade: "C", label: "一般" }, "gradeReaction：399→C 一般");
eqj(M.gradeReaction(400), { grade: "D", label: "多练练" }, "gradeReaction：400→D 多练练");
eqj(M.gradeReaction(0), { grade: "S", label: "职业级" }, "gradeReaction：0→S 职业级");
eqj(M.gradeReaction(1000), { grade: "D", label: "多练练" }, "gradeReaction：1000→D 多练练");
throws(function () { M.gradeReaction(-1); }, "ms", "gradeReaction：负数抛错 err.field='ms'");
throws(function () { M.gradeReaction(NaN); }, "ms", "gradeReaction：NaN 抛错");
throws(function () { M.gradeReaction("250"); }, "ms", "gradeReaction：字符串抛错");

/* ---------- 6. validateReactionConfig ---------- */
eqj(M.validateReactionConfig(), { rounds: 5 }, "validateReactionConfig：缺省→{rounds:5}");
eqj(M.validateReactionConfig(null), { rounds: 5 }, "validateReactionConfig：null→{rounds:5}");
eqj(M.validateReactionConfig({}), { rounds: 5 }, "validateReactionConfig：{}→{rounds:5}");
eqj(M.validateReactionConfig({ rounds: 3 }), { rounds: 3 }, "validateReactionConfig：{rounds:3} 通过");
eqj(M.validateReactionConfig({ rounds: 5 }), { rounds: 5 }, "validateReactionConfig：{rounds:5} 通过");
eqj(M.validateReactionConfig({ rounds: 10 }), { rounds: 10 }, "validateReactionConfig：{rounds:10} 通过");
throws(function () { M.validateReactionConfig({ rounds: 4 }); }, "rounds", "validateReactionConfig：rounds=4 抛错 err.field='rounds'");
throws(function () { M.validateReactionConfig({ rounds: 5.5 }); }, "rounds", "validateReactionConfig：rounds=5.5 非整数抛错");
throws(function () { M.validateReactionConfig({ rounds: "5" }); }, "rounds", "validateReactionConfig：字符串 rounds 抛错");
throws(function () { M.validateReactionConfig("x"); }, "config", "validateReactionConfig：字符串 config 抛错 err.field='config'");
throws(function () { M.validateReactionConfig([5]); }, "config", "validateReactionConfig：数组 config 抛错");

/* ---------- 7. validateReactionState ---------- */
eqj(M.validateReactionState({ phase: "idle", rounds: 5, current: 0, results: [] }),
{ phase: "idle", rounds: 5, current: 0, results: [] }, "validateReactionState：idle 初始态通过");
eqj(M.validateReactionState({ phase: "waiting", rounds: 5, current: 2, results: [200, 250] }),
{ phase: "waiting", rounds: 5, current: 2, results: [200, 250] }, "validateReactionState：waiting 中间态通过");
eqj(M.validateReactionState({ phase: "done", rounds: 3, current: 3, results: [200, 250, 300] }),
{ phase: "done", rounds: 3, current: 3, results: [200, 250, 300] }, "validateReactionState：done 完成态通过");
eqj(M.validateReactionState({ phase: "ready", rounds: 10, current: 9, results: [248] }),
{ phase: "ready", rounds: 10, current: 9, results: [248] }, "validateReactionState：ready 态通过");
throws(function () { M.validateReactionState(null); }, "state", "validateReactionState：null 抛错 err.field='state'");
throws(function () { M.validateReactionState({ phase: "running", rounds: 5, current: 0, results: [] }); }, "phase", "validateReactionState：非法 phase 抛错 err.field='phase'");
throws(function () { M.validateReactionState({ phase: "idle", rounds: 4, current: 0, results: [] }); }, "rounds", "validateReactionState：rounds=4 抛错 err.field='rounds'");
throws(function () { M.validateReactionState({ phase: "idle", rounds: 5, current: -1, results: [] }); }, "current", "validateReactionState：current=-1 抛错 err.field='current'");
throws(function () { M.validateReactionState({ phase: "idle", rounds: 5, current: 6, results: [] }); }, "current", "validateReactionState：current 超 rounds 抛错");
throws(function () { M.validateReactionState({ phase: "idle", rounds: 5, current: 1.5, results: [] }); }, "current", "validateReactionState：current 非整数抛错");
throws(function () { M.validateReactionState({ phase: "idle", rounds: 5, current: 0, results: "x" }); }, "results", "validateReactionState：results 非数组抛错 err.field='results'");
throws(function () { M.validateReactionState({ phase: "idle", rounds: 3, current: 3, results: [200, 250, 300, 199] }); }, "results", "validateReactionState：results 超 rounds 抛错");
throws(function () { M.validateReactionState({ phase: "idle", rounds: 5, current: 1, results: [-5] }); }, "results", "validateReactionState：负成绩抛错");

/* ---------- 8. formatReactionMs ---------- */
eq(M.formatReactionMs(248), "248 ms", "formatReactionMs：248→\"248 ms\"");
eq(M.formatReactionMs(1250), "1.25 s", "formatReactionMs：1250→\"1.25 s\"");
eq(M.formatReactionMs(1000), "1 s", "formatReactionMs：1000→\"1 s\"");
eq(M.formatReactionMs(1500), "1.5 s", "formatReactionMs：1500→\"1.5 s\"");
eq(M.formatReactionMs(999), "999 ms", "formatReactionMs：999→\"999 ms\"");
eq(M.formatReactionMs(1049), "1.05 s", "formatReactionMs：1049→\"1.05 s\"");
eq(M.formatReactionMs(0), "0 ms", "formatReactionMs：0→\"0 ms\"");
throws(function () { M.formatReactionMs(-1); }, "ms", "formatReactionMs：负数抛错 err.field='ms'");
throws(function () { M.formatReactionMs(NaN); }, "ms", "formatReactionMs：NaN 抛错");
throws(function () { M.formatReactionMs("248"); }, "ms", "formatReactionMs：字符串抛错");

/* ---------- 9. categories.go 注册 ---------- */
var pathCount = (GO_SRC.match(/"\/tools\/[^"]+"/g) || []).filter(function (v, i, a) { return a.indexOf(v) === i; }).length;
eq(pathCount, 326, "注册 Path 总数 312→313");
has(GO_SRC, '"reaction_test"', "注册：ID reaction_test");
has(GO_SRC, '"/tools/reaction-test"', "注册：Path /tools/reaction-test");
has(GO_SRC, '"flash_on"', "注册：Icon flash_on");
eq((GO_SRC.match(/Icon:\s*"flash_on"/g) || []).length, 1, "Icon flash_on 全库唯一");
var entryBlock = GO_SRC.slice(GO_SRC.indexOf('"reaction_test"') - 60,
GO_SRC.indexOf('"reaction_test"') + 1600);
ok(/New:\s+true/.test(entryBlock), "注册：New: true");
ok(/Category:\s+"生活工具"/.test(entryBlock), "注册：类目 生活工具");
has(entryBlock, "反应速度测试", "注册：名称 反应速度测试");
has(entryBlock, "抢跑", "注册：描述含 抢跑");
has(entryBlock, "performance.now()", "注册：描述含 performance.now()");
ok(GO_SRC.indexOf('"reaction_test"') > GO_SRC.indexOf('"decision_wheel"') &&
GO_SRC.indexOf('"reaction_test"') < GO_SRC.indexOf('"fancy_fonts"'), "注册：紧邻 decision_wheel（在其后、fancy_fonts 之前）");

/* ---------- 10. 模板：SEO/真限制/控件/互链/零外部资源 ---------- */
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/reaction-test", "模板 canonical 含新 Path");
has(TPL_SRC, "反应速度测试", "模板：标题含工具名");
has(TPL_SRC, "反应时间测试", "模板 SEO：关键词含 反应时间测试");
has(TPL_SRC, "测反应速度", "模板 SEO：关键词含 测反应速度");
has(TPL_SRC, "反应力测试", "模板 SEO：关键词含 反应力测试");
has(TPL_SRC, "reaction time test", "模板 SEO：关键词含 reaction time test");
has(TPL_SRC, "真限制", "模板：真限制章节");
has(TPL_SRC, "毫秒数是近似值", "真限制①：毫秒数是近似值");
has(TPL_SRC, "16.7ms", "真限制①：60Hz 约 16.7ms 一帧");
has(TPL_SRC, "抢跑作废", "真限制②：抢跑作废");
has(TPL_SRC, "输入延迟不同", "真限制③：触屏鼠标键盘输入延迟不同");
has(TPL_SRC, "只存本机 localStorage", "真限制④：最佳成绩只存本机");
has(TPL_SRC, 'id="rt-area"', "模板控件：测试区 rt-area");
has(TPL_SRC, 'id="rt-start"', "模板控件：开始按钮 rt-start");
has(TPL_SRC, 'data-rounds="3"', "模板控件：轮次 3");
has(TPL_SRC, 'data-rounds="5"', "模板控件：轮次 5（默认）");
has(TPL_SRC, 'data-rounds="10"', "模板控件：轮次 10");
has(TPL_SRC, 'id="rt-last"', "模板控件：上轮成绩 rt-last");
has(TPL_SRC, 'id="rt-avg"', "模板控件：多轮平均 rt-avg");
has(TPL_SRC, 'id="rt-best"', "模板控件：最佳成绩 rt-best");
has(TPL_SRC, 'id="rt-history"', "模板控件：历史成绩 rt-history");
has(TPL_SRC, 'id="rt-clear-history"', "模板控件：清空历史 rt-clear-history");
has(TPL_SRC, "点！", "模板无障碍：变绿同时文字提示“点！”");
has(TPL_SRC, "aria-live", "模板无障碍：aria-live 状态区");
has(TPL_SRC, "/tools/decision-wheel", "互链：幸运决策转盘（单向）");
has(TPL_SRC, "/tools/static/js/reaction_test.js?v=1", "模板：引用本站 JS");
notHas(DW_TPL, "/tools/reaction-test", "单向互链：幸运决策转盘模板不链回本工具（单向）");
notHas(TPL_SRC, "fonts.googleapis", "模板零 CDN：无外部字体");
ok((TPL_SRC.match(/<script[^>]*src="http/g) || []).length === 0, "模板零外部脚本：无 http script src");
var httpLinks = TPL_SRC.match(/<link[^>]*href="http[^"]*"/g) || [];
eq(httpLinks.length, 1, "模板 http link 仅 canonical 一条");
ok(httpLinks.length === 1 && httpLinks[0].indexOf("https://www.johnkingzcq123.xyz/tools/reaction-test") !== -1, "模板 http link：仅自家 canonical");

/* ---------- 11. 浏览器绑定源码级检查 ---------- */
notHas(JS_SRC, "fetch(", "零网络：JS 无 fetch");
notHas(JS_SRC, "XMLHttpRequest", "零网络：JS 无 XHR");
has(JS_SRC, "textContent", "渲染：用 textContent 防 HTML 执行");
has(JS_SRC, "performance.now", "计时：performance.now()");
has(JS_SRC, "RT_WAIT_MIN = 2000", "等待：随机等待下限 2s");
has(JS_SRC, "RT_WAIT_MAX = 5000", "等待：随机等待上限 5s");
has(JS_SRC, "Math.random() * (RT_WAIT_MAX - RT_WAIT_MIN)", "等待：2–5s 随机");
has(JS_SRC, "'Space'", "空格操作：监听 Space 键");
has(JS_SRC, "preventDefault()", "空格操作：拦截默认滚动");
has(JS_SRC, "reaction_test_best_v1", "最佳成绩：localStorage 键 reaction_test_best_v1");
has(JS_SRC, "reaction_test_history_v1", "历史：localStorage 键 reaction_test_history_v1");
has(JS_SRC, "RT_HIST_MAX = 10", "历史：最近 10 次");
has(JS_SRC, "window.ReactionTest", "导出：挂 window.ReactionTest");
has(JS_SRC, "module.exports", "导出：module.exports 同步导出");
has(JS_SRC, "抢跑犯规", "抢跑：犯规提示文案");
has(JS_SRC, "setArea('ready', '点！'", "变色：就绪态文字“点！”");

console.log("reaction_test: pass=" + pass + " fail=" + fail + "，共 " + (pass + fail) + " 断言");
if (fail > 0) process.exit(1);
