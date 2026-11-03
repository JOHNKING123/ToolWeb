/* GPA 绩点计算器 - 纯前端：课程（课程名＋成绩＋学分）录入 → 四算法可选 → 学分加权 GPA 实时计算
* ＋ what-if 逐门试算（考到 X 分 GPA 变多少）＋ localStorage 本地保存，全部浏览器本地计算，不上传。
*
* 纯函数契约（浏览器/Node 通用，非法参数抛 Error，err.field 给出字段名，不静默钳制）：
* ALGORITHMS —— 四算法元数据（页面下拉与说明区复用）：
* [{id:'std4', name:'标准 4.0 制', desc:'换算表见下'},
* {id:'pku4', name:'北大 4.0 制', desc:'60–100 线性：绩点=(分数−50)/10，上限 4.0；<60=0'},
* {id:'scale5', name:'5.0 制', desc:'90–100=5.0、80–89=4.0、70–79=3.0、60–69=2.0、<60=0'},
* {id:'percent', name:'百分制加权平均分', desc:'不换算绩点：按学分加权平均百分制分数'}]
* GRADE_TO_SCORE —— 等级制输入折算为百分制的代表分：
* A+→97、A→93、A-→90、B+→87、B→83、B-→80、C+→77、C→73、C-→70、D→65、F→30。
* scoreToPoint(score, algorithm)
* -> number（该成绩在所选算法下的绩点；'percent' 算法返回原百分制分数）。
* 标准 4.0 制换算表：90–100=4.0、85–89=3.7、82–84=3.3、78–81=3.0、75–77=2.7、
* 72–74=2.3、68–71=2.0、64–67=1.5、60–63=1.0、<60=0。
* score 非 0~100 数字、非合法等级字符串（大小写不敏感，首尾空格容忍）抛 Error，err.field='score'；
* algorithm 非 'std4'/'pku4'/'scale5'/'percent' 抛 Error，err.field='algorithm'。
* calcGPA(courses, algorithm)
* -> {gpa, totalCredits, totalCourses}；gpa 为学分加权平均绩点（保留 2 位小数），
* totalCredits 为总学分（保留 2 位小数），totalCourses 为课程门数。
* courses 非数组抛 Error，err.field='courses'；courses 为空数组返回
* {gpa:0, totalCredits:0, totalCourses:0}；某门 credit 非正数、score 非法（数字越界
* 或等级串非法）抛 Error，err.field='courses'。
* whatIf(courses, algorithm, index, newScore)
* -> {gpa, delta}；把第 index 门课程成绩换成 newScore 后的 GPA（保留 2 位小数）
* 与变化量 delta（保留 2 位小数，可为负）。
* index 非 0~courses.length-1 整数抛 Error，err.field='index'；
* newScore 非法抛 Error，err.field='score'；courses/algorithm 非法沿用 calcGPA 约定
* （err.field='courses'/'algorithm'）。
*
* 浏览器内运行：文件尾部把 init 挂到 DOMContentLoaded；挂 window.GpaCalculator。
* Node 自测：module.exports 暴露纯函数与常量。
*/
(function () {
'use strict';

/* ---------------- 常量 ---------------- */

var ALGORITHMS = [
{ id: 'std4', name: '标准 4.0 制', desc: '90–100=4.0、85–89=3.7、82–84=3.3、78–81=3.0、75–77=2.7、72–74=2.3、68–71=2.0、64–67=1.5、60–63=1.0、<60=0'},
{ id: 'pku4', name: '北大 4.0 制', desc: '60–100 线性：绩点=(分数−50)/10，上限 4.0；<60=0'},
{ id: 'scale5', name: '5.0 制', desc: '90–100=5.0、80–89=4.0、70–79=3.0、60–69=2.0、<60=0'},
{ id: 'percent', name: '百分制加权平均分', desc: '不换算绩点：按学分加权平均百分制分数'}
];

/* 等级制输入折算为百分制代表分（各档中点口径，页面真限制已明示） */
var GRADE_TO_SCORE = {
'A+': 97, 'A': 93, 'A-': 90,
'B+': 87, 'B': 83, 'B-': 80,
'C+': 77, 'C': 73, 'C-': 70,
'D': 65, 'F': 30
};

/* ---------------- 基础工具 ---------------- */

function mkErr(field, msg) {
var e = new Error(msg);
e.field = field;
return e;
}

function isNum(v) {
return typeof v === 'number' && isFinite(v);
}

function round2(x) {
return Math.round(x * 100) / 100;
}

function checkAlgorithm(algorithm) {
for (var i = 0; i < ALGORITHMS.length; i++) {
if (ALGORITHMS[i].id === algorithm) {
return algorithm;
}
}
throw mkErr('algorithm', "algorithm 非法：只允许 'std4' / 'pku4' / 'scale5' / 'percent'");
}

/* 成绩归一化为百分制数字：数字原样（0~100 校验），等级串按 GRADE_TO_SCORE 折算 */
function normalizeScore(score) {
if (isNum(score)) {
if (score < 0 || score > 100) {
throw mkErr('score', 'score 必须是 0~100 的数字或等级（A+/A/A-/B+/B/B-/C+/C/C-/D/F）');
}
return score;
}
if (typeof score === 'string') {
var g = score.trim().toUpperCase();
if (Object.prototype.hasOwnProperty.call(GRADE_TO_SCORE, g)) {
return GRADE_TO_SCORE[g];
}
}
throw mkErr('score', 'score 必须是 0~100 的数字或等级（A+/A/A-/B+/B/B-/C+/C/C-/D/F）');
}

/* ---------------- 纯函数 ---------------- */

function std4Point(s) {
if (s >= 90) { return 4.0;}
if (s >= 85) { return 3.7;}
if (s >= 82) { return 3.3;}
if (s >= 78) { return 3.0;}
if (s >= 75) { return 2.7;}
if (s >= 72) { return 2.3;}
if (s >= 68) { return 2.0;}
if (s >= 64) { return 1.5;}
if (s >= 60) { return 1.0;}
return 0;
}

function pku4Point(s) {
if (s < 60) { return 0;}
return Math.min(4.0, round2((s - 50) / 10));
}

function scale5Point(s) {
if (s >= 90) { return 5.0;}
if (s >= 80) { return 4.0;}
if (s >= 70) { return 3.0;}
if (s >= 60) { return 2.0;}
return 0;
}

/* 单门成绩 → 绩点（percent 算法返回原百分制分数） */
function scoreToPoint(score, algorithm) {
checkAlgorithm(algorithm);
var s = normalizeScore(score);
if (algorithm === 'percent') { return s;}
if (algorithm === 'pku4') { return pku4Point(s);}
if (algorithm === 'scale5') { return scale5Point(s);}
return std4Point(s);
}

/* 学分加权 GPA */
function calcGPA(courses, algorithm) {
checkAlgorithm(algorithm);
if (!Array.isArray(courses)) {
throw mkErr('courses', 'courses 必须是 [{name, score, credit}] 数组');
}
if (courses.length === 0) {
return { gpa: 0, totalCredits: 0, totalCourses: 0};
}
var sumP = 0, sumC = 0;
for (var i = 0; i < courses.length; i++) {
var c = courses[i] || {};
if (!isNum(c.credit) || c.credit <= 0) {
throw mkErr('courses', '第 ' + (i + 1) + ' 门课程 credit 必须为正数');
}
var pt;
try {
pt = scoreToPoint(c.score, algorithm);
} catch (e) {
throw mkErr('courses', '第 ' + (i + 1) + ' 门课程 score 非法：' + e.message);
}
sumP += pt * c.credit;
sumC += c.credit;
}
return { gpa: round2(sumP / sumC), totalCredits: round2(sumC), totalCourses: courses.length};
}

/* what-if：假设第 index 门考到 newScore 后的 GPA 与变化量 */
function whatIf(courses, algorithm, index, newScore) {
checkAlgorithm(algorithm);
if (!Array.isArray(courses)) {
throw mkErr('courses', 'courses 必须是 [{name, score, credit}] 数组');
}
if (!isNum(index) || Math.floor(index)!== index || index < 0 || index >= courses.length) {
throw mkErr('index', courses.length === 0
? 'courses 为空，没有可模拟的课程'
: 'index 必须为 0~' + (courses.length - 1) + ' 的整数');
}
var base = calcGPA(courses, algorithm);
try {
scoreToPoint(newScore, algorithm);
} catch (e) {
throw mkErr('score', 'newScore 非法：' + e.message);
}
var changed = courses.map(function (c, i) {
if (i === index) {
return { name: c.name, score: newScore, credit: c.credit};
}
return { name: c.name, score: c.score, credit: c.credit};
});
var gpa = calcGPA(changed, algorithm).gpa;
return { gpa: gpa, delta: round2(gpa - base.gpa)};
}

var GpaCalculator = {
ALGORITHMS: ALGORITHMS,
GRADE_TO_SCORE: GRADE_TO_SCORE,
scoreToPoint: scoreToPoint,
calcGPA: calcGPA,
whatIf: whatIf
};

/* ---------------- 浏览器 UI ---------------- */

var LS_KEY = 'gpa_calculator_v1';

function $(id) { return document.getElementById(id);}

function toast(msg) {
var t = $('gpa-toast');
t.textContent = msg;
t.style.display = 'block';
clearTimeout(t._timer);
t._timer = setTimeout(function () { t.style.display = 'none';}, 2200);
}

function currentAlgorithm() {
var radios = document.getElementsByName('gpa-algo');
for (var i = 0; i < radios.length; i++) {
if (radios[i].checked) { return radios[i].value;}
}
return 'std4';
}

/* 从表格读课程数组（name/score/credit 均为原始输入值，由纯函数做校验） */
function readCourses() {
var rows = document.querySelectorAll('#gpa-tbody tr');
var list = [];
for (var i = 0; i < rows.length; i++) {
var name = rows[i].querySelector('.gpa-name').value.trim();
var scoreRaw = rows[i].querySelector('.gpa-score').value.trim();
var creditRaw = rows[i].querySelector('.gpa-credit').value.trim();
var score = scoreRaw === ''? NaN: (/^[+-]?(\d+(\.\d+)?|\.\d+)$/.test(scoreRaw)? parseFloat(scoreRaw): scoreRaw);
var credit = creditRaw === ''? NaN: parseFloat(creditRaw);
list.push({ name: name, score: score, credit: credit, _row: rows[i]});
}
return list;
}

/* 逐行显示单门绩点（校验失败显示 —） */
function renderRowPoints(courses, algorithm) {
for (var i = 0; i < courses.length; i++) {
var cell = courses[i]._row.querySelector('.gpa-point');
try {
cell.textContent = GpaCalculator.scoreToPoint(courses[i].score, algorithm);
} catch (e) {
cell.textContent = '—';
}
}
}

function renderResult() {
var algorithm = currentAlgorithm();
var courses = readCourses();
renderRowPoints(courses, algorithm);
var box = $('gpa-result');
var errBox = $('gpa-error');
errBox.style.display = 'none';
try {
var r = GpaCalculator.calcGPA(courses, algorithm);
box.style.display = 'block';
$('gpa-value').textContent = r.gpa.toFixed(2);
$('gpa-credits').textContent = r.totalCredits;
$('gpa-count').textContent = r.totalCourses;
$('gpa-algo-name').textContent = algoName(algorithm);
box._last = { algorithm: algorithm, courses: courses, r: r};
renderWhatIf(courses, algorithm, r.gpa);
} catch (e) {
box.style.display = 'none';
box._last = null;
errBox.style.display = 'block';
errBox.textContent = '输入有误：' + e.message;
$('gpa-wif').innerHTML = '';
}
saveLocal();
}

function algoName(id) {
for (var i = 0; i < ALGORITHMS.length; i++) {
if (ALGORITHMS[i].id === id) { return ALGORITHMS[i].name;}
}
return id;
}

/* what-if：统一目标分输入 → 逐门试算列表 */
function renderWhatIf(courses, algorithm, baseGpa) {
var wrap = $('gpa-wif');
var targetRaw = $('gpa-wif-score').value.trim();
if (!courses.length) { wrap.innerHTML = ''; return;}
var html = '';
for (var i = 0; i < courses.length; i++) {
var c = courses[i];
var label = (c.name || ('课程' + (i + 1)));
var line;
if (targetRaw === '') {
line = '<span class="gpa-wif-hint">在上方输入假设分数后逐门试算</span>';
} else {
var target = /^[+-]?(\d+(\.\d+)?|\.\d+)$/.test(targetRaw)? parseFloat(targetRaw): targetRaw;
try {
var w = GpaCalculator.whatIf(courses.map(function (x) {
return { name: x.name, score: x.score, credit: x.credit};
}), algorithm, i, target);
var cls = w.delta > 0? 'gpa-delta-up': (w.delta < 0? 'gpa-delta-down': '');
var arrow = w.delta > 0? '↑': (w.delta < 0? '↓': '→');
line = '考到 <b>' + escapeHtml(targetRaw) + '</b> → GPA <b>' + w.gpa.toFixed(2) + '</b> ' +
'<span class="' + cls + '">' + arrow + ' ' + (w.delta > 0? '+': '') + w.delta.toFixed(2) + '</span> ' +
'<button type="button" class="btn btn-secondary gpa-apply" data-idx="' + i + '" style="font-size:.8rem;padding:.2rem.6rem;">一键应用</button>';
} catch (e) {
line = '<span class="gpa-wif-hint">假设分数非法：' + escapeHtml(e.message) + '</span>';
}
}
html += '<div class="gpa-wif-row"><span class="gpa-wif-name">' + escapeHtml(label) + '</span><span>' + line + '</span></div>';
}
wrap.innerHTML = html;
var btns = wrap.querySelectorAll('.gpa-apply');
for (var j = 0; j < btns.length; j++) {
btns[j].addEventListener('click', (function (idx) {
return function () { applyWhatIf(idx);};
})(parseInt(btns[j].getAttribute('data-idx'), 10)));
}
}

function applyWhatIf(idx) {
var targetRaw = $('gpa-wif-score').value.trim();
var rows = document.querySelectorAll('#gpa-tbody tr');
if (rows[idx] && targetRaw!== '') {
rows[idx].querySelector('.gpa-score').value = targetRaw;
renderResult();
toast('已把假设分数应用到第 ' + (idx + 1) + ' 门课程');
}
}

function escapeHtml(s) {
return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
.replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function addRow(name, score, credit) {
var tr = document.createElement('tr');
tr.innerHTML =
'<td><input class="gpa-name" type="text" placeholder="如 高等数学" value="' + escapeHtml(name || '') + '"></td>' +
'<td><input class="gpa-score" type="text" placeholder="如 85 或 A+" value="' + escapeHtml(score || '') + '"></td>' +
'<td><input class="gpa-credit" type="number" min="0" step="0.5" placeholder="如 3" value="' + escapeHtml(credit || '') + '"></td>' +
'<td class="gpa-point">—</td>' +
'<td><button type="button" class="btn btn-secondary gpa-del" style="font-size:.8rem;padding:.2rem.6rem;">删除</button></td>';
$('gpa-tbody').appendChild(tr);
tr.querySelector('.gpa-del').addEventListener('click', function () {
tr.parentNode.removeChild(tr);
renderResult();
});
var inputs = tr.querySelectorAll('input');
for (var i = 0; i < inputs.length; i++) {
inputs[i].addEventListener('input', renderResult);
}
}

function saveLocal() {
try {
var courses = readCourses().map(function (c) {
return {
name: c.name,
score: typeof c.score === 'number' && isNaN(c.score)? '': String(c.score),
credit: typeof c.credit === 'number' && isNaN(c.credit)? '': String(c.credit)
};
});
localStorage.setItem(LS_KEY, JSON.stringify({ algorithm: currentAlgorithm(), courses: courses}));
} catch (e) { /* 本地保存失败不打扰主流程 */}
}

function loadLocal() {
try {
var raw = localStorage.getItem(LS_KEY);
if (!raw) { return false;}
var data = JSON.parse(raw);
if (!data ||!Array.isArray(data.courses) ||!data.courses.length) { return false;}
var radios = document.getElementsByName('gpa-algo');
for (var i = 0; i < radios.length; i++) {
if (radios[i].value === data.algorithm) { radios[i].checked = true;}
}
$('gpa-tbody').innerHTML = '';
data.courses.forEach(function (c) { addRow(c.name, c.score, c.credit);});
return true;
} catch (e) { return false;}
}

function buildCopyText() {
var last = $('gpa-result')._last;
if (!last) { return '';}
var lines = last.courses.map(function (c, i) {
var nm = c.name || ('课程' + (i + 1));
var pt;
try { pt = GpaCalculator.scoreToPoint(c.score, last.algorithm);}
catch (e) { pt = '—';}
return nm + '：' + c.score + ' 分（学分 ' + c.credit + '，绩点 ' + pt + '）';
});
return '算法：' + algoName(last.algorithm) + '\n' +
lines.join('\n') + '\n' +
'→ GPA ' + last.r.gpa.toFixed(2) + '（总学分 ' + last.r.totalCredits + '，共 ' + last.r.totalCourses + ' 门）。' +
'各校绩点算法差异大，务必按目标学校官方算法核对，结果仅供参考。';
}

function copyResult() {
var text = buildCopyText();
if (!text) {
toast('暂无可复制的结果（请先录入有效课程）');
return;
}
function done() { toast('结果已复制到剪贴板');}
function fallback() {
var ta = document.createElement('textarea');
ta.value = text;
ta.style.position = 'fixed';
ta.style.opacity = '0';
document.body.appendChild(ta);
ta.select();
try { document.execCommand('copy'); done();}
catch (e) { toast('复制失败，请手动复制');}
document.body.removeChild(ta);
}
if (navigator.clipboard && navigator.clipboard.writeText) {
navigator.clipboard.writeText(text).then(done, fallback);
} else {
fallback();
}
}

function fillSample() {
$('gpa-tbody').innerHTML = '';
var radios = document.getElementsByName('gpa-algo');
for (var i = 0; i < radios.length; i++) {
radios[i].checked = radios[i].value === 'std4';
}
[
['高等数学', '92', '4'],
['大学英语', '88', '3'],
['程序设计基础', '85', '3'],
['线性代数', '78', '2.5'],
['体育', 'A', '1']
].forEach(function (r) { addRow(r[0], r[1], r[2]);});
renderResult();
toast('已填入示例并计算');
}

function clearAll() {
$('gpa-tbody').innerHTML = '';
addRow('', '', '');
$('gpa-wif-score').value = '';
try { localStorage.removeItem(LS_KEY);} catch (e) {}
renderResult();
}

function buildAlgoRadios() {
var box = $('gpa-algos');
ALGORITHMS.forEach(function (a, i) {
var lab = document.createElement('label');
lab.className = 'gpa-algo';
var radio = document.createElement('input');
radio.type = 'radio';
radio.name = 'gpa-algo';
radio.value = a.id;
if (i === 0) { radio.checked = true;}
radio.addEventListener('change', renderResult);
var txt = document.createElement('span');
txt.innerHTML = '<b>' + escapeHtml(a.name) + '</b><small>' + escapeHtml(a.desc) + '</small>';
lab.appendChild(radio);
lab.appendChild(txt);
box.appendChild(lab);
});
var note = document.createElement('div');
note.className = 'gpa-info';
note.textContent = '等级制输入（A+/A/A-/B+/B/B-/C+/C/C-/D/F）按代表分折算：A+→97、A→93、A-→90、B+→87、B→83、B-→80、C+→77、C→73、C-→70、D→65、F→30，再按所选算法换算。';
box.appendChild(note);
}

function init() {
buildAlgoRadios();
if (!loadLocal()) {
addRow('', '', '');
addRow('', '', '');
addRow('', '', '');
}
$('gpa-add').addEventListener('click', function () { addRow('', '', ''); renderResult();});
$('gpa-copy').addEventListener('click', copyResult);
$('gpa-sample').addEventListener('click', fillSample);
$('gpa-clear').addEventListener('click', clearAll);
$('gpa-wif-score').addEventListener('input', renderResult);
renderResult();
}

if (typeof window!== 'undefined') {
window.GpaCalculator = GpaCalculator;
if (document.readyState === 'loading') {
document.addEventListener('DOMContentLoaded', init);
} else {
init();
}
}

if (typeof module!== 'undefined' && module.exports) {
module.exports = GpaCalculator;
}

})();
