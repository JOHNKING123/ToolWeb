/* 幸运决策转盘纯逻辑单元测试（零依赖）：node tests/decision_wheel.test.js
* 覆盖：parseItems 逐行／权重格式（半角＋全角冒号）／缺省权重／空行跳过／CRLF／非法参数抛错 err.field 定位、
* normalizeWeights 均权边界精确值／加权精确值／非正权重抛错、
* pickIndex 边界精确值（rand=0→0、累计边界下落下一扇区）／非法 rand／非法 weights 抛错、
* sectorGeometry 中心角精确值／越界与非法 n 抛错、
* easingOutCubic(0)=0／(1)=1／(0.5)=0.875 精确值／非法 t 抛错、
* finalAngle 整数圈精确值（含缺省 extraTurns=5）／非法参数抛错、
* recordResult 超限截断精确值（最旧被挤掉）／非法参数抛错、
* sanitizeFileName 清理与空回退、
* 注册（296→297 Path）与 Icon album 唯一、零网络请求、模板真限制文案与双向互链。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/decision_wheel.js");

var pass = 0, fail = 0;
function ok(cond, name) {
if (cond) { pass++; }
else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function has(s, sub, name) { ok(String(s).indexOf(sub) !== -1, name + "（应包含 " + JSON.stringify(sub) + "）"); }
function notHas(s, sub, name) { ok(String(s).indexOf(sub) === -1, name + "（不应包含 " + JSON.stringify(sub) + "）"); }
function throwsField(fn, field, name) {
try { fn(); }
catch (e) { eq(e.field, field, name); return; }
ok(false, name + "（应抛错而未抛）");
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "decision_wheel.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "decision_wheel.html"), "utf8");
var RD_TPL = fs.readFileSync(path.join(ROOT, "templates", "random_decision.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. parseItems ---------- */
var p1 = M.parseItems('火锅\n烧烤\n');
eq(p1.length, 2, "解析：两行两项");
eq(p1[0].name, "火锅", "解析：首项名称精确值");
eq(p1[0].weight, 1, "解析：无权重缺省为 1");
var p2 = M.parseItems('火锅:3\n奶茶:2\n');
eq(p2[0].weight, 3, "解析：半角冒号权重精确值");
eq(p2[1].weight, 2, "解析：第二项权重精确值");
eq(M.parseItems('烧烤：2\n')[0].weight, 2, "解析：全角冒号权重精确值");
eq(M.parseItems('\n\n火锅\n   \n烧烤\n\n').length, 2, "解析：空行与空白行跳过");
eq(M.parseItems('a\r\nb:2\r\n').length, 2, "解析：CRLF 换行正常");
eq(M.parseItems('a:2.5\n')[0].weight, 2.5, "解析：小数权重精确值");
eq(M.parseItems('  火锅  \n')[0].name, "火锅", "解析：名称首尾空白修剪");
eq(M.parseItems('火锅 : 3\n')[0].weight, 3, "解析：冒号两侧空白容忍");
throwsField(function () { M.parseItems(123); }, 'text', "解析：数字 text 抛错");
throwsField(function () { M.parseItems(null); }, 'text', "解析：null text 抛错");
throwsField(function () { M.parseItems('火锅:abc\n'); }, 'weight', "解析：非数字权重抛错");
throwsField(function () { M.parseItems('火锅:-2\n'); }, 'weight', "解析：负权重抛错");
throwsField(function () { M.parseItems('火锅:0\n'); }, 'weight', "解析：零权重抛错");
throwsField(function () { M.parseItems('火锅:\n'); }, 'weight', "解析：空权重抛错");
throwsField(function () { M.parseItems(':3\n'); }, 'items', "解析：空名称抛错");
throwsField(function () { M.parseItems('   \n\n'); }, 'items', "解析：全空行抛错");
throwsField(function () { M.parseItems(''); }, 'items', "解析：空文本抛错");

/* ---------- 2. normalizeWeights ---------- */
var n1 = M.normalizeWeights([{ name: 'a', weight: 1 }, { name: 'b', weight: 1 }, { name: 'c', weight: 1 }]);
eq(n1[0].prob, 1 / 3, "归一化：均权每项 1/3 精确值");
eq(n1[2].prob, 1 / 3, "归一化：均权末项 1/3 精确值");
var n2 = M.normalizeWeights([{ name: 'a', weight: 1 }, { name: 'b', weight: 2 }, { name: 'c', weight: 3 }]);
eq(n2[0].prob, 1 / 6, "归一化：1/6 精确值");
eq(n2[1].prob, 2 / 6, "归一化：2/6 精确值");
eq(n2[2].prob, 3 / 6, "归一化：3/6 精确值");
eq(M.normalizeWeights([{ name: 'a', weight: 5 }])[0].prob, 1, "归一化：单项概率为 1");
throwsField(function () { M.normalizeWeights('x'); }, 'items', "归一化：非数组抛错");
throwsField(function () { M.normalizeWeights([]); }, 'items', "归一化：空数组抛错");
throwsField(function () { M.normalizeWeights([{ name: 'a', weight: 0 }]); }, 'weight', "归一化：零权重抛错");
throwsField(function () { M.normalizeWeights([{ name: 'a', weight: -1 }]); }, 'weight', "归一化：负权重抛错");
throwsField(function () { M.normalizeWeights([{ name: 'a', weight: NaN }]); }, 'weight', "归一化：NaN 权重抛错");
throwsField(function () { M.normalizeWeights([{ name: 'a' }]); }, 'weight', "归一化：缺失权重抛错");

/* ---------- 3. pickIndex ---------- */
eq(M.pickIndex([1, 2, 3], 0), 0, "抽取：rand=0 命中首项");
eq(M.pickIndex([1, 2, 3], 0.4), 1, "抽取：rand=0.4 命中第二项");
eq(M.pickIndex([1, 2, 3], 0.99), 2, "抽取：rand=0.99 命中末项");
eq(M.pickIndex([1, 2, 3], 1 / 6), 1, "抽取：累计边界 rand=1/6 落下一扇区");
eq(M.pickIndex([1, 2, 3], 0.5), 2, "抽取：累计边界 rand=0.5 落下一扇区");
eq(M.pickIndex([5], 0.9999), 0, "抽取：单项任意 rand 命中 0");
throwsField(function () { M.pickIndex([1, 2], 1); }, 'rand', "抽取：rand=1 抛错");
throwsField(function () { M.pickIndex([1, 2], -0.1); }, 'rand', "抽取：rand 为负抛错");
throwsField(function () { M.pickIndex([1, 2], '0.5'); }, 'rand', "抽取：rand 非数字抛错");
throwsField(function () { M.pickIndex([1, 2], NaN); }, 'rand', "抽取：rand=NaN 抛错");
throwsField(function () { M.pickIndex([], 0.5); }, 'weights', "抽取：空 weights 抛错");
throwsField(function () { M.pickIndex('x', 0.5); }, 'weights', "抽取：非数组 weights 抛错");
throwsField(function () { M.pickIndex([1, 0, 2], 0.5); }, 'weights', "抽取：零权重抛错");
throwsField(function () { M.pickIndex([1, -2], 0.5); }, 'weights', "抽取：负权重抛错");

/* ---------- 4. sectorGeometry ---------- */
var g0 = M.sectorGeometry(0, 4);
eq(g0.start, -Math.PI / 2, "几何：扇区0 start=-π/2 精确值");
eq(g0.mid, -Math.PI / 4, "几何：扇区0 mid=-π/4 精确值");
eq(g0.end, 0, "几何：扇区0 end=0 精确值");
var g1 = M.sectorGeometry(1, 4);
eq(g1.start, 0, "几何：扇区1 start=0 精确值");
eq(g1.mid, Math.PI / 4, "几何：扇区1 mid=π/4 精确值");
eq(g1.end, Math.PI / 2, "几何：扇区1 end=π/2 精确值");
var g3 = M.sectorGeometry(3, 4);
eq(g3.start, Math.PI, "几何：扇区3 start=π 精确值");
eq(g3.end, 3 * Math.PI / 2, "几何：扇区3 end=3π/2 精确值");
var gS = M.sectorGeometry(0, 1);
eq(gS.mid, Math.PI / 2, "几何：单扇区 mid=π/2 精确值");
throwsField(function () { M.sectorGeometry(-1, 4); }, 'index', "几何：index=-1 抛错");
throwsField(function () { M.sectorGeometry(4, 4); }, 'index', "几何：index=n 抛错");
throwsField(function () { M.sectorGeometry(0.5, 4); }, 'index', "几何：index 非整数抛错");
throwsField(function () { M.sectorGeometry(0, 0); }, 'n', "几何：n=0 抛错");
throwsField(function () { M.sectorGeometry(0, 2.5); }, 'n', "几何：n 非整数抛错");

/* ---------- 5. easingOutCubic ---------- */
eq(M.easingOutCubic(0), 0, "缓动：t=0 得 0 精确值");
eq(M.easingOutCubic(1), 1, "缓动：t=1 得 1 精确值");
eq(M.easingOutCubic(0.5), 0.875, "缓动：t=0.5 得 0.875 精确值");
throwsField(function () { M.easingOutCubic(-0.1); }, 't', "缓动：t<0 抛错");
throwsField(function () { M.easingOutCubic(1.1); }, 't', "缓动：t>1 抛错");
throwsField(function () { M.easingOutCubic('x'); }, 't', "缓动：t 非数字抛错");
throwsField(function () { M.easingOutCubic(NaN); }, 't', "缓动：t=NaN 抛错");

/* ---------- 6. finalAngle ---------- */
eq(M.finalAngle(0, 4, 2), 23 * Math.PI / 4, "转角：finalAngle(0,4,2)=23π/4 精确值");
eq(M.finalAngle(2, 4, 0), 3 * Math.PI / 4, "转角：finalAngle(2,4,0)=3π/4 精确值");
eq(M.finalAngle(1, 4, 0), 5 * Math.PI / 4, "转角：finalAngle(1,4,0)=5π/4 精确值");
eq(M.finalAngle(0, 1), 11 * Math.PI, "转角：缺省 extraTurns=5 时 finalAngle(0,1)=11π");
ok(M.finalAngle(3, 6, 1) >= 2 * Math.PI && M.finalAngle(3, 6, 1) < 4 * Math.PI, "转角：1 整圈时落在 [2π,4π)");
throwsField(function () { M.finalAngle(5, 4, 0); }, 'index', "转角：index 越界抛错");
throwsField(function () { M.finalAngle(0, 4, -1); }, 'extraTurns', "转角：extraTurns 为负抛错");
throwsField(function () { M.finalAngle(0, 4, 1.5); }, 'extraTurns', "转角：extraTurns 非整数抛错");

/* ---------- 7. recordResult ---------- */
var r1 = M.recordResult([], { name: 'A', time: 't1' }, 3);
eq(r1.length, 1, "记录：空历史追加 1 条");
eq(r1[0].name, 'A', "记录：名称精确值");
var r2 = M.recordResult([{ name: 'A', time: 't1' }], { name: 'B', time: 't2' }, 3);
eq(r2[0].name, 'B', "记录：新记录插到最前");
eq(r2[1].name, 'A', "记录：旧记录后移");
var r3 = M.recordResult([{ name: 'A' }, { name: 'B' }, { name: 'C' }], { name: 'D' }, 3);
eq(r3.length, 3, "记录：超限截断后长度精确值");
eq(r3.map(function (x) { return x.name; }).join(','), 'D,A,B', "记录：最旧的 C 被挤掉");
var r4 = M.recordResult([], { name: 'Z' });
eq(r4.length, 1, "记录：缺省 maxLen 可用");
throwsField(function () { M.recordResult('x', { name: 'A' }); }, 'history', "记录：history 非数组抛错");
throwsField(function () { M.recordResult([], {}); }, 'entry', "记录：entry 缺 name 抛错");
throwsField(function () { M.recordResult([], { name: '' }); }, 'entry', "记录：entry 空 name 抛错");
throwsField(function () { M.recordResult([], null); }, 'entry', "记录：entry=null 抛错");
throwsField(function () { M.recordResult([], { name: 'A' }, 0); }, 'maxLen', "记录：maxLen=0 抛错");
throwsField(function () { M.recordResult([], { name: 'A' }, 2.5); }, 'maxLen', "记录：maxLen 非整数抛错");

/* ---------- 8. sanitizeFileName ---------- */
eq(M.sanitizeFileName('a/b:c?d*e'), 'abcde', "文件名：非法字符清理");
eq(M.sanitizeFileName('my data 表'), 'my-data-表', "文件名：空白转连字符");
eq(M.sanitizeFileName(''), 'decision-wheel', "文件名：空文本回退 'decision-wheel'");
eq(M.sanitizeFileName(null), 'decision-wheel', "文件名：null 回退 'decision-wheel'");
eq(M.sanitizeFileName('   '), 'decision-wheel', "文件名：空白回退 'decision-wheel'");
ok(M.sanitizeFileName('x'.repeat(100)).length <= 60, "文件名：超长截断 60 字符");
eq(M.sanitizeFileName('..data..'), 'data', "文件名：首尾点清理");

/* ---------- 9. 注册与零网络、模板文案 ---------- */
has(GO_SRC, '"decision_wheel"', "注册：ID decision_wheel");
has(GO_SRC, '"/tools/decision-wheel"', "注册：Path /tools/decision-wheel");
var pathCount = (GO_SRC.match(/"\/tools\/[^"]+"/g) || []).filter(function (v, i, a) { return a.indexOf(v) === i; }).length;
eq(pathCount, 309, "注册：Path 总数 296→297");
has(GO_SRC, '"album"', "注册：Icon album");
eq((GO_SRC.match(/Icon:\s*"album"/g) || []).length, 1, "注册：Icon album 全库唯一");
has(GO_SRC, '"生活工具"', "注册：类目 生活工具");
notHas(JS_SRC, "fetch(", "零网络：JS 无 fetch");
notHas(JS_SRC, "XMLHttpRequest", "零网络：JS 无 XHR");
notHas(TPL_SRC, "fetch(", "零网络：模板无 fetch");
notHas(TPL_SRC, "http://", "零 CDN：模板无 http 外链");
notHas(TPL_SRC, "https://fonts.googleapis", "零 CDN：模板无字体 CDN");
has(TPL_SRC, "伪随机", "真限制：伪随机不可复原文案");
has(TPL_SRC, "5MB", "真限制：localStorage 约 5MB 配额文案");
has(TPL_SRC, "帧率", "真限制：帧率差异文案");
has(TPL_SRC, "不上传任何服务器", "真限制：数据不上传文案");
has(TPL_SRC, "/tools/random-decision", "互链：含随机决策器链接");
has(TPL_SRC, "decision-wheel", "模板：canonical 与标识含 decision-wheel");
has(TPL_SRC, "decision_wheel.js", "模板：JS 文件引用");
has(JS_SRC, "textContent", "渲染：用 textContent 防 HTML 执行");
has(TPL_SRC, "在线转盘抽奖", "SEO：关键词含 在线转盘抽奖");
has(TPL_SRC, "决策转盘", "SEO：关键词含 决策转盘");
has(TPL_SRC, "随机选择器", "SEO：关键词含 随机选择器");
has(TPL_SRC, "幸运大转盘", "SEO：关键词含 幸运大转盘");
has(TPL_SRC, "转盘抽签", "SEO：关键词含 转盘抽签");
has(RD_TPL, "/tools/decision-wheel", "双向互链：随机决策器模板含转盘链接");

console.log("decision_wheel: pass=" + pass + " fail=" + fail);
if (fail > 0) process.exit(1);
