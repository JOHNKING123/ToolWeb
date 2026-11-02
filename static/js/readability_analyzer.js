/* 英文可读性分析器（readability_analyzer）- 纯前端零上传
* 粘贴英文文本 → 词/句/音节/难词统计 →
* Flesch Reading Ease／Flesch-Kincaid Grade／Gunning Fog Index 三指标
* （保留 1 位小数）→ 等级解读对照 → 难句高亮。
* 纯函数契约（非法参数抛 Error，err.field 为字段名）：
* countSyllables（元音群启发式，词尾静默 e 减 1）、analyzeText
* （text 非字符串/空抛 Error，err.field='text'）、fleschReadingEase
* （206.835−1.015×W/S−84.6×Sy/W）、fleschKincaidGrade
* （0.39×W/S+11.8×Sy/W−15.59）、gunningFogIndex（0.4×[W/S+100×C/W]）、
* readabilityLevel（FK 等级对照）。
* 真限制：仅英文文本有效；音节估算为元音群启发式，非词典级精确值；
* 纯本地零上传。零网络请求：本文件不发起任何请求；渲染一律用
* textContent，输入里的 HTML 只显示为文本，不会执行。
* 浏览器与 node 测试共用同一纯函数；浏览器绑定只在有 document 时执行。 */
(function () {
'use strict';

/* 参数错误构造：err.field 为字段名，调用方按字段名定位问题，不静默钳制。 */
function paramError(field, message) {
var e = new Error(message);
e.field = field;
return e;
}

function round1(x) { return Math.round(x * 10) / 10; }

/* 音节估算：元音群（aeiouy）启发式；词尾静默 e 减 1；至少 1 个音节。 */
function countSyllables(word) {
if (typeof word !== 'string') throw paramError('word', 'countSyllables: word 必须为字符串');
var w = word.toLowerCase().replace(/[^a-z]/g, '');
if (w.length === 0) return 0;
var groups = w.match(/[aeiouy]+/g);
var n = groups ? groups.length : 0;
if (w.charAt(w.length - 1) === 'e' && n > 1) n -= 1;
return n < 1 ? 1 : n;
}

/* 分词：英文单词（含缩写撇号），不跨中日韩字符。 */
function splitWords(text) {
var m = text.match(/[A-Za-z]+(?:'[a-z]+)?/g);
return m ? m : [];
}

/* 分句：按 .!? 切分，去空段。 */
function splitSentences(text) {
return text.split(/[.!?]+/).map(function (s) { return s.trim(); })
.filter(function (s) { return s.length > 0; });
}

function assertPositiveNumber(v, field, name) {
if (typeof v !== 'number' || !isFinite(v) || v <= 0) {
throw paramError(field, name + ': ' + field + ' 必须为正数');
}
}

/* Flesch Reading Ease：206.835−1.015×(W/S)−84.6×(Sy/W)。 */
function fleschReadingEase(words, sentences, syllables) {
assertPositiveNumber(words, 'words', 'fleschReadingEase');
assertPositiveNumber(sentences, 'sentences', 'fleschReadingEase');
assertPositiveNumber(syllables, 'syllables', 'fleschReadingEase');
return round1(206.835 - 1.015 * (words / sentences) - 84.6 * (syllables / words));
}

/* Flesch-Kincaid Grade Level：0.39×(W/S)+11.8×(Sy/W)−15.59。 */
function fleschKincaidGrade(words, sentences, syllables) {
assertPositiveNumber(words, 'words', 'fleschKincaidGrade');
assertPositiveNumber(sentences, 'sentences', 'fleschKincaidGrade');
assertPositiveNumber(syllables, 'syllables', 'fleschKincaidGrade');
return round1(0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59);
}

/* Gunning Fog Index：0.4×[W/S+100×C/W]。 */
function gunningFogIndex(words, sentences, complexWords) {
assertPositiveNumber(words, 'words', 'gunningFogIndex');
assertPositiveNumber(sentences, 'sentences', 'gunningFogIndex');
if (typeof complexWords !== 'number' || !isFinite(complexWords) || complexWords < 0) {
throw paramError('complexWords', 'gunningFogIndex: complexWords 必须为非负数');
}
return round1(0.4 * ((words / sentences) + 100 * (complexWords / words)));
}

/* 等级对照（以 Flesch-Kincaid Grade 为主轴）：确定性分段。 */
function readabilityLevel(grade) {
if (typeof grade !== 'number' || !isFinite(grade)) {
throw paramError('grade', 'readabilityLevel: grade 必须为数字');
}
var band, bandEn, description;
if (grade < 3) { band = '初级'; bandEn = 'Elementary'; description = '约小学 1–3 年级水平：短句、常见词，几乎人人能读。'; }
else if (grade < 6) { band = '中低级'; bandEn = 'Lower Intermediate'; description = '约小学 4–6 年级水平：简单句为主，适合大众阅读材料。'; }
else if (grade < 9) { band = '中级'; bandEn = 'Intermediate'; description = '约初中水平：普通新闻与说明文的典型难度。'; }
else if (grade < 12) { band = '中高级'; bandEn = 'Upper Intermediate'; description = '约高中水平：长句与抽象词增多，需一定阅读功底。'; }
else if (grade < 16) { band = '大学级'; bandEn = 'College'; description = '约大学水平：专业文本、学术论文常见难度。'; }
else { band = '研究生级'; bandEn = 'Graduate'; description = '研究生及以上水平：高度抽象、术语密集。'; }
return { band: band, bandEn: bandEn, grade: grade, description: description };
}

/* Flesch Reading Ease 分段解读。 */
function fleschBand(score) {
if (score >= 90) return '非常容易';
if (score >= 80) return '容易';
if (score >= 70) return '较容易';
if (score >= 60) return '标准难度';
if (score >= 50) return '有点难';
if (score >= 30) return '难';
return '非常难';
}

/* 难词：≥3 音节的词；排除专有名词（句首词除外）。 */
function isComplexWord(word, sentenceFirst) {
if (countSyllables(word) < 3) return false;
var first = word.charAt(0);
var isCap = first >= 'A' && first <= 'Z';
if (isCap && !sentenceFirst) return false;
return true;
}

/* 全文分析：text 非字符串或全空抛 Error，err.field='text'。 */
function analyzeText(text) {
if (typeof text !== 'string' || text.trim().length === 0) {
throw paramError('text', 'analyzeText: text 必须为非空字符串');
}
var words = splitWords(text);
var sentences = splitSentences(text);
if (words.length === 0 || sentences.length === 0) {
throw paramError('text', 'analyzeText: 未识别到英文单词或句子');
}
var syllables = 0, complexWords = 0;
sentences.forEach(function (sen) {
var ws = splitWords(sen);
ws.forEach(function (w, i) {
syllables += countSyllables(w);
if (isComplexWord(w, i === 0)) complexWords += 1;
});
});
var fre = fleschReadingEase(words.length, sentences.length, syllables);
var fkg = fleschKincaidGrade(words.length, sentences.length, syllables);
var fog = gunningFogIndex(words.length, sentences.length, complexWords);
return {
words: words.length,
sentences: sentences.length,
syllables: syllables,
complexWords: complexWords,
fleschReadingEase: fre,
fleschKincaidGrade: fkg,
gunningFogIndex: fog,
level: readabilityLevel(fkg)
};
}

/* 逐句分析（难句高亮用）：grade>=12 或词数>=25 视为难句。 */
function analyzeSentences(text) {
if (typeof text !== 'string' || text.trim().length === 0) {
throw paramError('text', 'analyzeSentences: text 必须为非空字符串');
}
return splitSentences(text).map(function (sen) {
var ws = splitWords(sen);
if (ws.length === 0) return null;
var sy = ws.reduce(function (a, w) { return a + countSyllables(w); }, 0);
var grade = round1(0.39 * ws.length + 11.8 * (sy / ws.length) - 15.59);
return {
sentence: sen,
words: ws.length,
syllables: sy,
grade: grade,
hard: grade >= 12 || ws.length >= 25
};
}).filter(function (x) { return x !== null; });
}

var SAMPLE = 'Reading every day is one of the best habits you can build. ' +
'It improves your vocabulary, sharpens your focus, and gives you new ideas to think about. ' +
'Start with short articles or simple stories, and increase the difficulty gradually as your confidence grows. ' +
'The extraordinary proliferation of interdisciplinary terminology in contemporary academic discourse frequently impedes comprehension for readers who lack specialized domain expertise.';

var api = {
countSyllables: countSyllables,
analyzeText: analyzeText,
analyzeSentences: analyzeSentences,
fleschReadingEase: fleschReadingEase,
fleschKincaidGrade: fleschKincaidGrade,
gunningFogIndex: gunningFogIndex,
readabilityLevel: readabilityLevel,
fleschBand: fleschBand,
SAMPLE: SAMPLE
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.Readability = api;

/* ---------- 浏览器 UI 绑定（仅当有 document 时执行） ---------- */
if (typeof document !== 'undefined') {
function el(id) { return document.getElementById(id); }
function txt(parent, s) { parent.appendChild(document.createTextNode(s)); }

function renderResult(r) {
var box = el('ra-result');
box.innerHTML = '';
var stats = el('ra-stats');
stats.innerHTML = '';
[['总词数', r.words], ['句子数', r.sentences], ['总音节数', r.syllables], ['难词数（≥3 音节）', r.complexWords]]
.forEach(function (p) {
var d = document.createElement('div');
d.className = 'ra-stat';
var b = document.createElement('b');
txt(b, String(p[1]));
var s = document.createElement('span');
txt(s, p[0]);
d.appendChild(b); d.appendChild(s);
stats.appendChild(d);
});
var cards = [
['Flesch Reading Ease', r.fleschReadingEase, fleschBand(r.fleschReadingEase), '0–100，分数越高越容易读。90+ 非常容易，60–70 为标准难度。'],
['Flesch-Kincaid Grade', r.fleschKincaidGrade, r.level.band + '（' + r.level.bandEn + '）', '对应美国年级水平：' + r.level.description],
['Gunning Fog Index', r.gunningFogIndex, '约需 ' + Math.max(1, Math.round(r.gunningFogIndex)) + ' 年教育', '数值≈理解文本所需的受教育年数；>12 偏学术难读。']
];
cards.forEach(function (c) {
var d = document.createElement('div');
d.className = 'ra-card';
var h = document.createElement('h4');
txt(h, c[0]);
var v = document.createElement('div');
v.className = 'ra-value';
txt(v, String(c[1]));
var lv = document.createElement('div');
lv.className = 'ra-level';
txt(lv, c[2]);
var ds = document.createElement('p');
ds.className = 'ra-desc';
txt(ds, c[3]);
d.appendChild(h); d.appendChild(v); d.appendChild(lv); d.appendChild(ds);
box.appendChild(d);
});
}

function renderSentences(list) {
var box = el('ra-sentences');
box.innerHTML = '';
var hardCount = list.filter(function (x) { return x.hard; }).length;
var note = el('ra-sen-note');
note.innerHTML = '';
txt(note, '共 ' + list.length + ' 句，其中难句 ' + hardCount + ' 句（单句 FK Grade ≥ 12 或词数 ≥ 25，高亮显示）。');
list.forEach(function (x, i) {
var p = document.createElement('p');
p.className = 'ra-sen' + (x.hard ? ' ra-hard' : '');
var tag = document.createElement('span');
tag.className = 'ra-tag';
txt(tag, '句' + (i + 1) + ' · ' + x.words + '词 · Grade ' + x.grade);
p.appendChild(tag);
txt(p, x.sentence + (x.sentence.match(/[.!?]$/) ? '' : '。'));
box.appendChild(p);
});
}

function doAnalyze() {
var input = el('ra-input');
var err = el('ra-error');
err.style.display = 'none';
err.innerHTML = '';
var box = el('ra-result'), stats = el('ra-stats'), sens = el('ra-sentences'), note = el('ra-sen-note');
try {
var r = analyzeText(input.value);
renderResult(r);
renderSentences(analyzeSentences(input.value));
box.style.display = 'grid';
stats.style.display = 'grid';
sens.style.display = 'block';
note.style.display = 'block';
} catch (e) {
txt(err, e.message || '分析失败');
err.style.display = '';
}
}

function bind() {
el('ra-analyze').addEventListener('click', doAnalyze);
el('ra-sample').addEventListener('click', function () {
el('ra-input').value = SAMPLE;
doAnalyze();
});
el('ra-clear').addEventListener('click', function () {
el('ra-input').value = '';
el('ra-result').style.display = 'none';
el('ra-stats').style.display = 'none';
el('ra-sentences').style.display = 'none';
el('ra-sen-note').style.display = 'none';
el('ra-error').style.display = 'none';
});
el('ra-input').addEventListener('input', function () {
el('ra-analyze').disabled = el('ra-input').value.trim().length === 0;
});
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
else bind();
}
})();
