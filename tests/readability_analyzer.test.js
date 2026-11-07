/* 英文可读性分析器纯逻辑单元测试（零依赖）：node tests/readability_analyzer.test.js
* 覆盖：countSyllables（元音群启发式、词尾静默e减1逐字、err.field=word）、
* analyzeText 确定性向量逐字（'I like to read books every day.'→
* words:7,sentences:1,syllables:9,complexWords:1,
* fleschReadingEase:91.0,fleschKincaidGrade:2.3,gunningFogIndex:8.5）、
* err.field='text'、三公式确定性向量与 err.field、readabilityLevel
* 分段逐字、analyzeSentences 难句判定、注册（268→269 Path、
* ID/Path/Icon insights 全库唯一/Category 文本工具/New: true）、
* 模板真限制三条文案与零网络请求。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/readability_analyzer.js");

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
catch (e) { eq(e && e.field, field, name); return; }
fail++; console.error("FAIL:", name + "（应抛错，未抛）");
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "readability_analyzer.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "readability_analyzer.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. countSyllables 确定性向量 ---------- */
eq(M.countSyllables("readability"), 5, "音节：readability→5");
eq(M.countSyllables("hello"), 2, "音节：hello→2");
eq(M.countSyllables("every"), 3, "音节：every→3（e/e/y 三群）");
eq(M.countSyllables("like"), 1, "音节：like→1（词尾静默e减1）");
eq(M.countSyllables("made"), 1, "音节：made→1（词尾静默e减1）");
eq(M.countSyllables("apple"), 1, "音节：apple→1（词尾静默e减1）");
eq(M.countSyllables("day"), 1, "音节：day→1");
eq(M.countSyllables("books"), 1, "音节：books→1");
eq(M.countSyllables("I"), 1, "音节：I→1");
eq(M.countSyllables("the"), 1, "音节：the→1（单群不扣）");
eq(M.countSyllables("programming"), 3, "音节：programming→3");
eq(M.countSyllables("syllables"), 3, "音节：syllables→3");
eq(M.countSyllables("text"), 1, "音节：text→1");
throwsField(function () { M.countSyllables(123); }, "word", "契约：countSyllables 非字符串 err.field=word");
throwsField(function () { M.countSyllables(null); }, "word", "契约：countSyllables null err.field=word");

/* ---------- 2. 三公式确定性向量 ---------- */
eq(M.fleschReadingEase(7, 1, 9), 91.0, "FRE(7,1,9)→91.0");
eq(M.fleschKincaidGrade(7, 1, 9), 2.3, "FKG(7,1,9)→2.3");
eq(M.gunningFogIndex(7, 1, 1), 8.5, "Fog(7,1,1)→8.5");
eq(M.fleschReadingEase(100, 10, 150), 69.8, "FRE(100,10,150)→69.8");
eq(M.fleschKincaidGrade(100, 10, 150), 6.0, "FKG(100,10,150)→6.0");
eq(M.gunningFogIndex(100, 10, 5), 6.0, "Fog(100,10,5)→6.0");
throwsField(function () { M.fleschReadingEase(0, 1, 9); }, "words", "契约：FRE words=0 err.field=words");
throwsField(function () { M.fleschReadingEase(7, 0, 9); }, "sentences", "契约：FRE sentences=0 err.field=sentences");
throwsField(function () { M.fleschReadingEase(7, 1, 0); }, "syllables", "契约：FRE syllables=0 err.field=syllables");
throwsField(function () { M.fleschKincaidGrade("7", 1, 9); }, "words", "契约：FKG words 非数字 err.field=words");
throwsField(function () { M.gunningFogIndex(7, 1, -1); }, "complexWords", "契约：Fog complexWords<0 err.field=complexWords");
throwsField(function () { M.gunningFogIndex(7, 1, "x"); }, "complexWords", "契约：Fog complexWords 非数字 err.field=complexWords");

/* ---------- 3. readabilityLevel 分段 ---------- */
eq(M.readabilityLevel(2.3).band, "初级", "等级：2.3→初级");
eq(M.readabilityLevel(0).band, "初级", "等级：0→初级");
eq(M.readabilityLevel(4.5).band, "中低级", "等级：4.5→中低级");
eq(M.readabilityLevel(7.5).band, "中级", "等级：7.5→中级");
eq(M.readabilityLevel(10).band, "中高级", "等级：10→中高级");
eq(M.readabilityLevel(13).band, "大学级", "等级：13→大学级");
eq(M.readabilityLevel(17).band, "研究生级", "等级：17→研究生级");
throwsField(function () { M.readabilityLevel("x"); }, "grade", "契约：readabilityLevel 非数字 err.field=grade");
throwsField(function () { M.readabilityLevel(NaN); }, "grade", "契约：readabilityLevel NaN err.field=grade");

/* ---------- 4. analyzeText 确定性向量 ---------- */
var r = M.analyzeText("I like to read books every day.");
eq(r.words, 7, "全文：words=7");
eq(r.sentences, 1, "全文：sentences=1");
eq(r.syllables, 9, "全文：syllables=9");
eq(r.complexWords, 1, "全文：complexWords=1（every）");
eq(r.fleschReadingEase, 91.0, "全文：fleschReadingEase=91.0");
eq(r.fleschKincaidGrade, 2.3, "全文：fleschKincaidGrade=2.3");
eq(r.gunningFogIndex, 8.5, "全文：gunningFogIndex=8.5");
eq(r.level.band, "初级", "全文：level.band=初级");
eq(M.fleschBand(91.0), "非常容易", "FRE 分段：91→非常容易");
eq(M.fleschBand(65), "标准难度", "FRE 分段：65→标准难度");
throwsField(function () { M.analyzeText(null); }, "text", "契约：analyzeText(null) err.field=text");
throwsField(function () { M.analyzeText("   "); }, "text", "契约：analyzeText 全空 err.field=text");
throwsField(function () { M.analyzeText(123); }, "text", "契约：analyzeText 非字符串 err.field=text");

/* ---------- 5. analyzeSentences 难句判定 ---------- */
var sens = M.analyzeSentences("I like apples. The extraordinary proliferation of interdisciplinary terminology in contemporary academic discourse frequently impedes comprehension.");
eq(sens.length, 2, "逐句：2 句");
eq(sens[0].hard, false, "逐句：第1句非难句");
eq(sens[1].hard, true, "逐句：第2句为难句（FK Grade≥12）");
ok(sens[1].grade >= 12, "逐句：第2句 grade≥12（实得 " + sens[1].grade + "）");
throwsField(function () { M.analyzeSentences(""); }, "text", "契约：analyzeSentences 空输入 err.field=text");

/* ---------- 6. 示例文本可分析 ---------- */
var sr = M.analyzeText(M.SAMPLE);
ok(sr.words > 30, "示例：词数>30（实得 " + sr.words + "）");
ok(sr.sentences === 4, "示例：4 句（实得 " + sr.sentences + "）");
ok(typeof sr.fleschReadingEase === "number", "示例：FRE 为数字");

/* ---------- 7. 注册与零网络、模板文案 ---------- */
has(GO_SRC, "\"readability_analyzer\"", "注册：ID readability_analyzer");
has(GO_SRC, "\"/tools/readability-analyzer\"", "注册：Path /tools/readability-analyzer");
var iconHits = (GO_SRC.match(/"insights"/g) || []).length;
eq(iconHits, 1, "注册：Icon insights 全库唯一（复测锁定）");
var regBlock = GO_SRC.split("\"readability_analyzer\"")[1].split("},")[0];
has(regBlock, "Category:    \"文本工具\"", "注册：Category 文本工具");
has(regBlock, "New:         true", "注册：New: true");
var pathCount = (GO_SRC.match(/"\/tools\/[^"]+"/g) || []).filter(function (v, i, a) { return a.indexOf(v) === i; }).length;
eq(pathCount, 327, "注册：Path 总数 309→310");
notHas(GO_SRC.match(/"\/tools\/[^"]+"/g).join(" "), "/tools/readability-analyzer\", \"/tools/readability-analyzer", "注册：Path 无重复");
notHas(JS_SRC, "fetch(", "零网络：JS 无 fetch");
notHas(JS_SRC, "XMLHttpRequest", "零网络：JS 无 XHR");
notHas(TPL_SRC, "fetch(", "零网络：模板无 fetch");
notHas(TPL_SRC, "http://", "零 CDN：模板无 http 外链");
notHas(TPL_SRC, "https://fonts.googleapis", "零 CDN：模板无字体 CDN");
has(TPL_SRC, "仅英文文本有效", "真限制：仅英文有效文案");
has(TPL_SRC, "元音群启发式", "真限制：音节启发式文案");
has(TPL_SRC, "非词典级", "真限制：非词典级文案");
has(TPL_SRC, "纯本地零上传", "真限制：纯本地零上传文案");
has(TPL_SRC, "难句高亮", "模板：难句高亮文案");
has(TPL_SRC, "readability_analyzer.js", "模板：JS 文件引用");
has(TPL_SRC, "readability-analyzer", "模板：canonical 与标识含 readability-analyzer");
has(TPL_SRC, "\"@type\":\"SoftwareApplication\"", "SEO：JSON-LD SoftwareApplication");
has(TPL_SRC, "<meta property=\"og:title\"", "SEO：OG 标签");
has(JS_SRC, "textContent", "渲染：用 textContent 防 HTML 执行");
has(JS_SRC, "window.Readability", "挂载：window.Readability");

console.log("readability_analyzer: pass=" + pass + " fail=" + fail);
if (fail > 0) process.exit(1);
