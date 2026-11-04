/* 在线口算闯关：纯函数出题引擎（年级预设/四则/括号/判分/星级/计时/错题本/历史最佳）+ 浏览器端闯关交互。
 * 纯函数经 module.exports 暴露供 node 测试；浏览器里挂 window.MentalMathQuiz。
 * 失败约定（家族惯例）：非法参数抛 Error，err.field 给出字段名，不静默钳制。
 */
(function () {
'use strict';

var OPS = ['+', '-', '*', '/', '()'];
var OP_SYM = { '+': '+', '-': '−', '*': '×', '/': '÷' };

function fail(field, msg) { var e = new Error(msg); e.field = field; throw e; }
function isNum(n) { return typeof n === 'number' && isFinite(n); }
function isInt(n) { return isNum(n) && Math.floor(n) === n; }

/* ---------- 年级预设表（表驱动） ---------- */
var GRADES = {
  1: { min: 0, max: 20,   ops: ['+', '-'] },
  2: { min: 0, max: 100,  ops: ['+', '-'] },
  3: { min: 1, max: 100,  ops: ['+', '-', '*', '/'] },
  4: { min: 1, max: 1000, ops: ['+', '-', '*', '/'] },
  5: { min: 1, max: 100,  ops: ['+', '-', '*', '/', '()'] },
  6: { min: 1, max: 1000, ops: ['+', '-', '*', '/', '()'] }
};
var GRADE_NAMES = {
  1: '一年级 · 20以内加减', 2: '二年级 · 100以内加减', 3: '三年级 · 表内乘除＋100以内加减',
  4: '四年级 · 千以内四则', 5: '五年级 · 括号混合运算', 6: '六年级 · 大数混合运算'
};

function rangeForGrade(grade) {
  if (!isInt(grade) || grade < 1 || grade > 6) fail('grade', 'grade 须为 1–6 的整数，实得：' + String(grade));
  var g = GRADES[grade];
  return { min: g.min, max: g.max, ops: g.ops.slice() };
}

/* ---------- 四则求值 ---------- */
function calc(a, op, b) {
  if (!isNum(a) || !isNum(b)) fail('question', '操作数须为有限数字');
  if (op === '+') return a + b;
  if (op === '-') return a - b;
  if (op === '*') return a * b;
  if (op === '/') {
    if (b === 0) fail('op', '除数不能为 0');
    return a / b;
  }
  fail('op', 'op 非法：' + String(op) + '（仅支持 + - * /）');
}

/* 二元题：{a, op, b, answer, text}。op='()' 为括号加法题 "(a + b)"。 */
function buildQuestion(a, b, op) {
  if (op !== '+' && op !== '-' && op !== '*' && op !== '/' && op !== '()')
    fail('op', "op 非法：" + String(op) + "（仅支持 + - * / ()）");
  if (!isNum(a) || !isNum(b)) fail('question', '操作数须为有限数字');
  if (op === '/') {
    if (b === 0) fail('op', '除数不能为 0');
    return { a: a, op: '/', b: b, answer: a / b, text: a + ' ÷ ' + b };
  }
  if (op === '()') {
    return { a: a, op: '()', b: b, answer: a + b, text: '(' + a + ' + ' + b + ')' };
  }
  return { a: a, op: op, b: b, answer: calc(a, op, b), text: a + ' ' + OP_SYM[op] + ' ' + b };
}

/* 括号三元题：(a op1 b) op2 c，op1/op2 仅四则。 */
function buildParenQuestion(a, b, c, op1, op2) {
  var valid = { '+': 1, '-': 1, '*': 1, '/': 1 };
  if (!valid[op1]) fail('op', 'op1 非法：' + String(op1) + '（仅支持 + - * /）');
  if (!valid[op2]) fail('op', 'op2 非法：' + String(op2) + '（仅支持 + - * /）');
  if (!isNum(a) || !isNum(b) || !isNum(c)) fail('question', '操作数须为有限数字');
  if ((op1 === '/' && b === 0) || (op2 === '/' && calc(a, op1, b) === 0))
    fail('op', '除数不能为 0');
  var inner = calc(a, op1, b);
  var answer = calc(inner, op2, c);
  return {
    a: a, b: b, c: c, op1: op1, op2: op2, answer: answer,
    text: '(' + a + ' ' + OP_SYM[op1] + ' ' + b + ') ' + OP_SYM[op2] + ' ' + c
  };
}

/* ---------- 输入归一化 ---------- */
function normalizeInput(text) {
  if (text === null || text === undefined) fail('answer', '答案不能为空');
  var s = String(text).trim().replace(/，/g, '.');
  if (s === '') fail('answer', '答案不能为空');
  var n = Number(s);
  if (!isNum(n)) fail('answer', '答案不是有效数字：' + String(text).slice(0, 30));
  return n;
}

/* ---------- 判分 ---------- */
function evalAnswer(question, inputNum) {
  if (!question || typeof question !== 'object' || !isNum(question.answer))
    fail('question', 'question 结构不合：须含有限数字 answer');
  if (!isNum(inputNum)) fail('answer', '输入答案须为有限数字');
  return { correct: inputNum === question.answer };
}

/* ---------- 星级评价 ---------- */
function starFor(accuracy) {
  if (!isNum(accuracy) || accuracy < 0 || accuracy > 1)
    fail('accuracy', 'accuracy 须为 0–1 的数字，实得：' + String(accuracy));
  if (accuracy >= 0.95) return 3;
  if (accuracy >= 0.85) return 2;
  if (accuracy >= 0.70) return 1;
  return 0;
}

/* ---------- 计时格式化 ---------- */
function formatTime(ms) {
  if (!isNum(ms) || ms < 0) fail('ms', 'ms 须为非负数字，实得：' + String(ms));
  var totalSec = Math.floor(ms / 1000);
  var m = Math.floor(totalSec / 60), s = totalSec % 60;
  return (m < 10 ? '0' + m : String(m)) + ':' + (s < 10 ? '0' + s : String(s));
}

/* ---------- 错题本 ---------- */
function pushMistake(mistakes, q, maxLen) {
  if (!q || typeof q !== 'object') fail('question', 'q 须为错题对象');
  if (!isInt(maxLen) || maxLen < 1) fail('maxLen', 'maxLen 须为正整数，实得：' + String(maxLen));
  var arr = Array.isArray(mistakes) ? mistakes.slice() : [];
  arr.push(q);
  while (arr.length > maxLen) arr.shift();
  return arr;
}

/* ---------- 历史最佳 ---------- */
function updateBest(best, key, score) {
  if (typeof key !== 'string' || key === '') fail('key', 'key 须为非空字符串');
  if (!score || typeof score !== 'object' ||
      !isNum(score.accuracy) || score.accuracy < 0 || score.accuracy > 1 ||
      !isNum(score.avgSec) || score.avgSec < 0)
    fail('score', 'score 须为 {accuracy: 0–1, avgSec: ≥0}');
  var nb = {};
  if (best && typeof best === 'object') {
    for (var k in best) { if (Object.prototype.hasOwnProperty.call(best, k)) nb[k] = best[k]; }
  }
  var cur = nb[key];
  if (!cur || typeof cur !== 'object' ||
      score.accuracy > cur.accuracy ||
      (score.accuracy === cur.accuracy && score.avgSec < cur.avgSec)) {
    nb[key] = { accuracy: score.accuracy, avgSec: score.avgSec };
  }
  return nb;
}

/* ---------- 文件名清洗（家族惯例） ---------- */
function sanitizeFileName(text) {
  var s = text == null ? '' : String(text);
  s = s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '');
  s = s.replace(/^[\s.]+|[\s.]+$/g, '').replace(/\s+/g, '-');
  if (s.length > 60) s = s.slice(0, 60).replace(/-+$/, '');
  if (s.length === 0) return 'mental-math-quiz';
  return s;
}

var API = {
  rangeForGrade: rangeForGrade,
  buildQuestion: buildQuestion,
  buildParenQuestion: buildParenQuestion,
  normalizeInput: normalizeInput,
  evalAnswer: evalAnswer,
  starFor: starFor,
  formatTime: formatTime,
  pushMistake: pushMistake,
  updateBest: updateBest,
  sanitizeFileName: sanitizeFileName,
  GRADE_NAMES: GRADE_NAMES
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = API;
  return;
}
if (typeof window !== 'undefined') window.MentalMathQuiz = API;

/* ---------------- 浏览器 DOM 逻辑（DOM/计时仅浏览器端） ---------------- */
function $(id) { return document.getElementById(id); }
function ri(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function round2(x) { return Math.round(x * 100) / 100; }
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

var M = (typeof window !== 'undefined') ? window.MentalMathQuiz : null;
var LS_BEST = 'mmq_best_v1', LS_MISTAKES = 'mmq_mistakes_v1';
var MISTAKE_CAP = 50;

var S = {
  grade: 2, count: 20,
  useAddSub: true, useMulDiv: true, useParen: false,
  carry: true, borrow: true, exactDiv: true,
  questions: [], idx: 0, correct: 0, startMs: 0, timer: null,
  mistakes: [], roundMistakes: [], answered: false, locked: true
};

function loadJSON(key, fallback) {
  try { var v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }
  catch (e) { return fallback; }
}
function saveJSON(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); return true; }
  catch (e) { return false; }
}

/* ---------- 随机出题（浏览器端，Math.random） ---------- */
function needCarry(a, b) { return (a % 10) + (b % 10) >= 10; }
function needBorrow(a, b) { return (a % 10) < (b % 10); }

function genOne(g) {
  var ops = [];
  if (S.useAddSub && (g.ops.indexOf('+') !== -1 || g.ops.indexOf('-') !== -1)) ops.push('addsub');
  if (S.useMulDiv && (g.ops.indexOf('*') !== -1 || g.ops.indexOf('/') !== -1)) ops.push('muldiv');
  if (S.useParen && g.ops.indexOf('()') !== -1) ops.push('paren');
  if (ops.length === 0) ops.push('addsub');
  var kind = pick(ops), q = null, tries = 0;
  while (tries++ < 60 && !q) q = tryGen(kind, g);
  return q || { a: 1, op: '+', b: 1, answer: 2, text: '1 + 1' };
}

function tryGen(kind, g) {
  var a, b, c, op1, op2, inner, ans;
  if (kind === 'addsub') {
    if (Math.random() < 0.5) {
      a = ri(g.min, g.max); b = ri(g.min, g.max);
      if (a + b > g.max) return null;
      if (!S.carry && needCarry(a, b)) return null;
      return M.buildQuestion(a, b, '+');
    }
    a = ri(g.min, g.max); b = ri(g.min, g.max);
    if (a < b) { var t = a; a = b; b = t; } /* 减法不负数 */
    if (!S.borrow && needBorrow(a, b)) return null;
    return M.buildQuestion(a, b, '-');
  }
  if (kind === 'muldiv') {
    if (Math.random() < 0.5) {
      a = ri(2, 9); b = ri(2, 9);
      return M.buildQuestion(a, b, '*');
    }
    b = ri(2, 9);
    if (S.exactDiv) {
      var quot = ri(2, 12);
      a = b * quot;
      return M.buildQuestion(a, b, '/');
    }
    a = ri(2, 99);
    var raw = M.buildQuestion(a, b, '/');
    raw.answer = round2(raw.answer);
    return raw;
  }
  /* 括号题：(a op1 b) op2 c，数字小、中间与最终答案非负 */
  a = ri(2, 9); b = ri(2, 9); c = ri(1, 9);
  op1 = pick(['+', '-', '*']); op2 = pick(['+', '-', '*']);
  inner = (op1 === '+') ? a + b : (op1 === '-' ? a - b : a * b);
  if (inner < 0) return null;
  ans = (op2 === '+') ? inner + c : (op2 === '-' ? inner - c : inner * c);
  if (ans < 0) return null;
  return M.buildParenQuestion(a, b, c, op1, op2);
}

/* ---------- 闯关流程 ---------- */
function show(id) { $(id).style.display = ''; }
function hide(id) { $(id).style.display = 'none'; }
function toast(msg) {
  var t = $('mmq-toast'); t.textContent = msg; t.style.display = 'block';
  setTimeout(function () { t.style.display = 'none'; }, 2200);
}

function startGame(questions) {
  S.questions = questions; S.idx = 0; S.correct = 0;
  S.roundMistakes = []; S.answered = false; S.locked = false;
  S.startMs = Date.now();
  hide('mmq-setup'); hide('mmq-result'); hide('mmq-mistakes'); show('mmq-quiz');
  tickTimer();
  S.timer = setInterval(tickTimer, 500);
  renderQuestion();
  setTimeout(function () { $('mmq-answer').focus(); }, 50);
}

function tickTimer() {
  if (S.locked) return;
  $('mmq-timer').textContent = M.formatTime(Date.now() - S.startMs);
}

function renderQuestion() {
  var q = S.questions[S.idx];
  $('mmq-progress').textContent = '第 ' + (S.idx + 1) + ' / ' + S.questions.length + ' 题';
  $('mmq-score').textContent = '答对 ' + S.correct + ' 题';
  $('mmq-qtext').textContent = q.text + ' = ?';
  $('mmq-answer').value = '';
  $('mmq-feedback').textContent = '';
  $('mmq-feedback').className = 'mmq-feedback';
  $('mmq-next').style.display = 'none';
  $('mmq-submit').disabled = false;
  S.answered = false;
}

function submitAnswer() {
  if (S.locked || S.answered) return;
  var raw = $('mmq-answer').value, q = S.questions[S.idx], n;
  try { n = M.normalizeInput(raw); }
  catch (e) { toast('请输入数字答案'); $('mmq-answer').focus(); return; }
  if (q.answer === round2(q.answer) && !Number.isInteger(q.answer)) {
    /* 非整除除法：答案保留两位小数，输入同样四舍五入后比较 */
    n = round2(n);
  }
  var r = M.evalAnswer({ answer: q.answer }, n);
  S.answered = true;
  var fb = $('mmq-feedback');
  if (r.correct) {
    S.correct++;
    fb.textContent = '✓ 答对了！';
    fb.className = 'mmq-feedback ok';
    setTimeout(function () { if (!S.locked && S.answered) nextQuestion(); }, 650);
  } else {
    fb.textContent = '✗ 答错了，正确答案是 ' + q.answer;
    fb.className = 'mmq-feedback bad';
    var mk = { text: q.text, input: n, answer: q.answer };
    S.roundMistakes = M.pushMistake(S.roundMistakes, mk, MISTAKE_CAP);
    S.mistakes = M.pushMistake(S.mistakes, mk, MISTAKE_CAP);
    saveJSON(LS_MISTAKES, S.mistakes);
    $('mmq-next').style.display = '';
  }
  $('mmq-score').textContent = '答对 ' + S.correct + ' 题';
  $('mmq-submit').disabled = true;
}

function nextQuestion() {
  S.idx++;
  if (S.idx >= S.questions.length) { finishGame(); return; }
  renderQuestion();
  $('mmq-answer').focus();
}

function finishGame() {
  S.locked = true;
  clearInterval(S.timer);
  var totalMs = Date.now() - S.startMs;
  var n = S.questions.length;
  var accuracy = n === 0 ? 0 : S.correct / n;
  var avgSec = n === 0 ? 0 : (totalMs / 1000) / n;
  var stars = M.starFor(accuracy);
  var key = 'g' + S.grade + '_n' + S.count;
  var best = loadJSON(LS_BEST, {});
  var before = best[key];
  best = M.updateBest(best, key, { accuracy: accuracy, avgSec: avgSec });
  saveJSON(LS_BEST, best);
  var improved = !before || accuracy > before.accuracy ||
    (accuracy === before.accuracy && avgSec < before.avgSec);

  hide('mmq-quiz'); show('mmq-result');
  var starStr = '';
  for (var i = 0; i < 3; i++) starStr += i < stars ? '★' : '☆';
  $('mmq-stars').textContent = starStr;
  $('mmq-stat-time').textContent = M.formatTime(totalMs);
  $('mmq-stat-avg').textContent = avgSec.toFixed(1) + ' 秒/题';
  $('mmq-stat-acc').textContent = (accuracy * 100).toFixed(1) + '%（' + S.correct + '/' + n + '）';
  $('mmq-best-line').textContent = '历史最佳（' + M.GRADE_NAMES[S.grade] + ' · ' + S.count +
    ' 题）：正确率 ' + (best[key].accuracy * 100).toFixed(1) + '%，平均 ' +
    best[key].avgSec.toFixed(1) + ' 秒/题' + (improved ? ' —— 新纪录！🎉' : '');
  var rm = S.roundMistakes;
  $('mmq-round-mistakes').innerHTML = rm.length === 0
    ? '<p class="mmq-empty">本局全部答对，没有错题 🎉</p>'
    : rm.map(function (m) {
        return '<div class="mmq-mitem"><span>' + esc(m.text) + ' = ' + esc(m.answer) +
          '</span><span class="mmq-your">你的答案：' + esc(m.input) + '</span></div>';
      }).join('');
  $('mmq-retry-mistakes').disabled = rm.length === 0;
  renderMistakeBook();
}

/* ---------- 错题本 ---------- */
function renderMistakeBook() {
  var box = $('mmq-book-list');
  if (S.mistakes.length === 0) {
    box.innerHTML = '<p class="mmq-empty">错题本是空的，加油保持！</p>';
  } else {
    box.innerHTML = S.mistakes.map(function (m, i) {
      return '<div class="mmq-mitem"><span>' + (i + 1) + '. ' + esc(m.text) + ' = ' + esc(m.answer) +
        '</span><span class="mmq-your">你的答案：' + esc(m.input) + '</span></div>';
    }).join('');
  }
  $('mmq-book-count').textContent = '共 ' + S.mistakes.length + ' 道（上限 ' + MISTAKE_CAP + ' 道，超限自动丢弃最早的）';
}

/* ---------- 设置区 ---------- */
function chipGroup(id, attr, cb) {
  $(id).addEventListener('click', function (e) {
    var t = e.target.closest('[' + attr + ']');
    if (!t) return;
    var btns = $(id).querySelectorAll('[' + attr + ']');
    for (var i = 0; i < btns.length; i++) btns[i].classList.remove('active');
    t.classList.add('active');
    cb(t.getAttribute(attr));
  });
}

function readSetup() {
  S.grade = parseInt(document.querySelector('#mmq-grades .active').getAttribute('data-grade'), 10);
  S.count = parseInt(document.querySelector('#mmq-counts .active').getAttribute('data-count'), 10);
  S.useAddSub = $('mmq-op-addsub').checked;
  S.useMulDiv = $('mmq-op-muldiv').checked;
  S.useParen = $('mmq-op-paren').checked;
  S.carry = $('mmq-carry').checked;
  S.borrow = $('mmq-borrow').checked;
  S.exactDiv = $('mmq-exactdiv').checked;
  var g = M.rangeForGrade(S.grade);
  $('mmq-grade-desc').textContent = M.GRADE_NAMES[S.grade] + '（' + g.min + '–' + g.max +
    '，含' + g.ops.map(function (o) { return o === '()' ? '括号' : ({ '+': '加', '-': '减', '*': '乘', '/': '除' })[o]; }).join('、') + '）';
}

function buildRound() {
  readSetup();
  if (!S.useAddSub && !S.useMulDiv && !S.useParen) {
    toast('请至少勾选一种运算类型'); return;
  }
  var g = M.rangeForGrade(S.grade);
  var qs = [];
  for (var i = 0; i < S.count; i++) qs.push(genOne(g));
  startGame(qs);
}

function retryMistakes() {
  if (S.roundMistakes.length === 0) return;
  var qs = S.roundMistakes.map(function (m) {
    return { text: m.text, answer: m.answer, a: 0, b: 0, op: 'retry' };
  });
  startGame(qs);
}

document.addEventListener('DOMContentLoaded', function () {
  S.mistakes = loadJSON(LS_MISTAKES, []);
  if (!Array.isArray(S.mistakes)) S.mistakes = [];
  chipGroup('mmq-grades', 'data-grade', readSetup);
  chipGroup('mmq-counts', 'data-count', readSetup);
  var ids = ['mmq-op-addsub', 'mmq-op-muldiv', 'mmq-op-paren', 'mmq-carry', 'mmq-borrow', 'mmq-exactdiv'];
  ids.forEach(function (id) { $(id).addEventListener('change', readSetup); });
  readSetup();
  $('mmq-start').addEventListener('click', buildRound);
  $('mmq-submit').addEventListener('click', submitAnswer);
  $('mmq-next').addEventListener('click', nextQuestion);
  $('mmq-quit').addEventListener('click', function () {
    S.locked = true; clearInterval(S.timer);
    hide('mmq-quiz'); show('mmq-setup');
  });
  $('mmq-answer').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') submitAnswer();
  });
  $('mmq-again').addEventListener('click', buildRound);
  $('mmq-retry-mistakes').addEventListener('click', retryMistakes);
  $('mmq-show-book').addEventListener('click', function () {
    renderMistakeBook(); hide('mmq-result'); show('mmq-mistakes');
  });
  $('mmq-back-setup').addEventListener('click', function () {
    hide('mmq-mistakes'); show('mmq-setup');
  });
  $('mmq-clear-book').addEventListener('click', function () {
    if (!confirm('确定清空错题本吗？')) return;
    S.mistakes = []; saveJSON(LS_MISTAKES, []);
    renderMistakeBook(); toast('错题本已清空');
  });
});

})();
