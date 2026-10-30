/* 位运算计算器（bitwise_calculator）- 纯前端本地计算
 * 双操作数（各带 hex/dec/bin 进制选择，0x/0b 前缀可带可不带）× 位宽（8/16/32/64，
 * 默认 32）× 运算符（AND/OR/XOR/NOT/<< /逻辑>>/循环左移 ROL/循环右移 ROR）；
 * NOT 运算时第二个操作数禁用。
 * 64 位走 BigInt（原生 Number 位运算只到 32 位有符号整数），结果一律按位宽
 * 掩码归一化；移位/循环移位量 n 先做 n%w（w 为当前位宽）再运算；有符号
 * 十进制按位宽补码换算显示。
 * 纯函数经 module.exports 暴露供 node 测试；浏览器里走 DOM。
 * 零网络请求：本文件不发起任何 fetch / XHR。 */
(function () {
'use strict';

var WIDTHS = [8, 16, 32, 64];
var BASES = ['hex', 'dec', 'bin'];
var ZERO = BigInt(0);
var ONE = BigInt(1);

var OP_META = {
  and: { sym: 'AND', name: '按位与 AND', unary: false },
  or:  { sym: 'OR',  name: '按位或 OR',  unary: false },
  xor: { sym: 'XOR', name: '按位异或 XOR', unary: false },
  not: { sym: 'NOT', name: '按位取反 NOT', unary: true },
  shl: { sym: '<<',  name: '左移 <<', unary: false },
  shr: { sym: '>>',  name: '逻辑右移 >>', unary: false },
  rol: { sym: 'ROL', name: '循环左移 ROL', unary: true, shift: true },
  ror: { sym: 'ROR', name: '循环右移 ROR', unary: true, shift: true }
};

/* ---------- 位宽与掩码 ---------- */
function coerceWidth(w) {
  w = Number(w);
  if (w === 8 || w === 16 || w === 32 || w === 64) return w;
  return 32;
}

function maskOf(w) {
  return (ONE << BigInt(coerceWidth(w))) - ONE;
}

/* 把任意 BigInt 按位宽掩码归一化（负数/溢出均按补码截断）。 */
function normalize(v, w) {
  w = coerceWidth(w);
  var mod = maskOf(w) + ONE;
  var x = BigInt(v);
  return ((x % mod) + mod) % mod;
}

/* ---------- 操作数解析 ---------- */
/* parseOperand(str, base, field)：非法输入抛 Error，err.field 为 'op1' 或 'op2'。
 * hex/dec/bin 三进制；hex 可带 0x 前缀、bin 可带 0b 前缀（大小写不限）；
 * dec 可带正负号（负数按补码归一化，由 normalize 处理）。 */
function parseOperand(str, base, field) {
  field = field || 'op1';
  function fail(msg) {
    var e = new Error(msg);
    e.field = field;
    throw e;
  }
  if (str === null || str === undefined) fail('操作数为空，请输入数值');
  var s = String(str).replace(/^\s+|\s+$/g, '');
  if (s === '') fail('操作数为空，请输入数值');
  var digits = s;
  var v;
  if (base === 'hex') {
    if (digits.slice(0, 2).toLowerCase() === '0x') digits = digits.slice(2);
    if (digits === '' || !/^[0-9a-fA-F]+$/.test(digits)) {
      fail('十六进制操作数非法：只允许 0-9、a-f、A-F，0x 前缀可带可不带');
    }
    v = BigInt('0x' + digits);
  } else if (base === 'bin') {
    if (digits.slice(0, 2).toLowerCase() === '0b') digits = digits.slice(2);
    if (digits === '' || !/^[01]+$/.test(digits)) {
      fail('二进制操作数非法：只允许 0 和 1，0b 前缀可带可不带');
    }
    v = BigInt('0b' + digits);
  } else if (base === 'dec') {
    var neg = false;
    if (digits.charAt(0) === '+' || digits.charAt(0) === '-') {
      neg = digits.charAt(0) === '-';
      digits = digits.slice(1);
    }
    if (digits === '' || !/^[0-9]+$/.test(digits)) {
      fail('十进制操作数非法：只允许数字，可带正负号');
    }
    v = BigInt(digits);
    if (neg) v = -v;
  } else {
    fail('进制选择非法：仅支持 hex/dec/bin');
  }
  return v;
}

/* ---------- 位运算核（结果一律 BigInt，按位宽掩码归一化） ---------- */
function bitwiseAnd(a, b, w) {
  w = coerceWidth(w);
  return normalize(a, w) & normalize(b, w);
}
function bitwiseOr(a, b, w) {
  w = coerceWidth(w);
  return normalize(a, w) | normalize(b, w);
}
function bitwiseXor(a, b, w) {
  w = coerceWidth(w);
  return normalize(a, w) ^ normalize(b, w);
}
/* 按位取反：单操作数，b 参数忽略（保留形参以统一签名）。 */
function bitwiseNot(a, b, w) {
  w = coerceWidth(w);
  return (~normalize(a, w)) & maskOf(w);
}
/* 移位量 n 一律先做 n%w（w 为当前位宽），负数移位量同样归一化。 */
function normShift(n, w) {
  var bw = BigInt(w);
  var x = BigInt(n);
  return ((x % bw) + bw) % bw;
}
function shiftLeft(a, n, w) {
  w = coerceWidth(w);
  return (normalize(a, w) << normShift(n, w)) & maskOf(w);
}
function shiftRightLogical(a, n, w) {
  w = coerceWidth(w);
  /* a 已归一化为非负数，BigInt 的 >> 即逻辑右移。 */
  return normalize(a, w) >> normShift(n, w);
}
function rotateLeft(a, n, w) {
  w = coerceWidth(w);
  var nn = normShift(n, w);
  var x = normalize(a, w);
  if (nn === ZERO) return x;
  return ((x << nn) | (x >> (BigInt(w) - nn))) & maskOf(w);
}
function rotateRight(a, n, w) {
  w = coerceWidth(w);
  var nn = normShift(n, w);
  var x = normalize(a, w);
  if (nn === ZERO) return x;
  return ((x >> nn) | (x << (BigInt(w) - nn))) & maskOf(w);
}

/* 统一计算入口：非法运算符抛 Error，err.field='op'。 */
function computeOp(op, a, b, w) {
  w = coerceWidth(w);
  var x = normalize(a, w);
  var y = normalize(b === undefined || b === null ? ZERO : b, w);
  switch (op) {
    case 'and': return bitwiseAnd(x, y, w);
    case 'or':  return bitwiseOr(x, y, w);
    case 'xor': return bitwiseXor(x, y, w);
    case 'not': return bitwiseNot(x, y, w);
    case 'shl': return shiftLeft(x, y, w);
    case 'shr': return shiftRightLogical(x, y, w);
    case 'rol': return rotateLeft(x, y, w);
    case 'ror': return rotateRight(x, y, w);
    default: {
      var e = new Error('运算符非法：仅支持 AND/OR/XOR/NOT/<</逻辑>>/ROL/ROR');
      e.field = 'op';
      throw e;
    }
  }
}

/* ---------- 结果格式化（输入先按位宽归一化） ---------- */
function formatHex(v, w) {
  w = coerceWidth(w);
  var h = normalize(v, w).toString(16).toUpperCase();
  var need = w / 4;
  while (h.length < need) h = '0' + h;
  return '0x' + h;
}
function formatDec(v, w) {
  return normalize(v, coerceWidth(w)).toString(10);
}
/* 有符号十进制：按位宽补码换算，最高位为 1 即负数。 */
function formatSigned(v, w) {
  w = coerceWidth(w);
  var x = normalize(v, w);
  var half = ONE << BigInt(w - 1);
  if (x >= half) return (x - (half << ONE)).toString(10);
  return x.toString(10);
}
/* 二进制：0b 前缀，按 4 位（半字节）一组空格分隔（如 0b1010 0101）。 */
function formatBin(v, w) {
  w = coerceWidth(w);
  var b = normalize(v, w).toString(2);
  while (b.length < w) b = '0' + b;
  var groups = [];
  var i;
  for (i = 0; i < b.length; i += 4) groups.push(b.slice(i, i + 4));
  return '0b' + groups.join(' ');
}

/* 表达式回显文本：如 "0xFF00 AND 0x0F0F = 0x0F00"。 */
function buildExpression(op, aRaw, bRaw, resultHex) {
  var meta = OP_META[op] || { sym: op };
  var lhs = String(aRaw).replace(/^\s+|\s+$/g, '');
  if (op === 'not') return 'NOT ' + lhs + ' = ' + resultHex;
  var rhs = String(bRaw).replace(/^\s+|\s+$/g, '');
  return lhs + ' ' + meta.sym + ' ' + rhs + ' = ' + resultHex;
}

/* ---------- 浏览器 DOM ---------- */
function $(id) { return document.getElementById(id); }

function toast(msg) {
  var t = $('bw-toast');
  if (!t) return;
  t.textContent = msg;
  t.style.display = 'block';
  setTimeout(function () { t.style.display = 'none'; }, 2600);
}

function copyText(text, okMsg) {
  function fallback() {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var done = false;
    try { done = document.execCommand('copy'); } catch (e) { done = false; }
    document.body.removeChild(ta);
    if (done) { toast(okMsg); }
    else { toast('复制失败，请手动选中结果内容复制'); }
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () {
      toast(okMsg);
    }, fallback);
  } else {
    fallback();
  }
}

var lastResult = null; /* { hex, dec, signed, bin, expr } */

function currentOp() {
  var sel = $('bw-op');
  return sel ? sel.value : 'and';
}
function currentWidth() {
  var sel = $('bw-width');
  return sel ? parseInt(sel.value, 10) : 32;
}

function showError(msg, field) {
  var el = $('bw-msg');
  if (el) {
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
  }
  var op1 = $('bw-op1'), op2 = $('bw-op2');
  if (op1) op1.classList.toggle('bw-err', field === 'op1');
  if (op2) op2.classList.toggle('bw-err', field === 'op2');
}

function setResultRow(id, text) {
  var el = $(id);
  if (el) el.textContent = text;
}

function renderExpr(text) {
  var el = $('bw-expr');
  if (el) el.textContent = text;
}

function clearResult() {
  lastResult = null;
  renderExpr('—');
  setResultRow('bw-r-hex', '—');
  setResultRow('bw-r-dec', '—');
  setResultRow('bw-r-signed', '—');
  setResultRow('bw-r-bin', '—');
}

function compute() {
  var op = currentOp();
  var w = currentWidth();
  var meta = OP_META[op];
  if (!meta) { showError('运算符非法，请重新选择', 'op'); clearResult(); return; }
  var aRaw = $('bw-op1') ? $('bw-op1').value : '';
  var aBase = $('bw-base1') ? $('bw-base1').value : 'hex';
  var bRaw = $('bw-op2') ? $('bw-op2').value : '';
  var bBase = $('bw-base2') ? $('bw-base2').value : 'hex';
  var a, b;
  try {
    a = parseOperand(aRaw, aBase, 'op1');
  } catch (e) {
    showError('操作数 1 错误：' + e.message, e.field || 'op1');
    clearResult();
    return;
  }
  if (meta.unary && op === 'not') {
    b = ZERO;
  } else {
    try {
      b = parseOperand(bRaw, bBase, 'op2');
    } catch (e) {
      showError('操作数 2 错误：' + e.message, e.field || 'op2');
      clearResult();
      return;
    }
  }
  var v;
  try {
    v = computeOp(op, a, b, w);
  } catch (e) {
    showError('计算错误：' + e.message, e.field || 'op');
    clearResult();
    return;
  }
  var hex = formatHex(v, w);
  var dec = formatDec(v, w);
  var signed = formatSigned(v, w);
  var bin = formatBin(v, w);
  var expr = buildExpression(op, aRaw, bRaw, hex);
  lastResult = { hex: hex, dec: dec, signed: signed, bin: bin, expr: expr };
  showError('', null);
  renderExpr(expr);
  setResultRow('bw-r-hex', hex);
  setResultRow('bw-r-dec', dec);
  setResultRow('bw-r-signed', signed);
  setResultRow('bw-r-bin', bin);
}

function buildCopyAllText(r) {
  return r.expr + '\n' +
    'HEX: ' + r.hex + '\n' +
    'DEC（无符号）: ' + r.dec + '\n' +
    'DEC（有符号）: ' + r.signed + '\n' +
    'BIN: ' + r.bin;
}

function refreshOp2State() {
  var op2 = $('bw-op2');
  var base2 = $('bw-base2');
  var dis = currentOp() === 'not';
  if (op2) { op2.disabled = dis; op2.placeholder = dis ? 'NOT 运算不需要第二个操作数' : '如 0x0F0F'; }
  if (base2) base2.disabled = dis;
  var hint = $('bw-op2-hint');
  if (hint) hint.style.display = dis ? 'inline' : 'none';
}

function fillExample() {
  var op1 = $('bw-op1'), base1 = $('bw-base1');
  var op2 = $('bw-op2'), base2 = $('bw-base2');
  var op = $('bw-op'), width = $('bw-width');
  if (op1) op1.value = '0xDEADBEEF';
  if (base1) base1.value = 'hex';
  if (op2) op2.value = '4';
  if (base2) base2.value = 'dec';
  if (op) op.value = 'shl';
  if (width) width.value = '32';
  refreshOp2State();
  compute();
  toast('已填入示例：0xDEADBEEF << 4（32 位）');
}

function clearAll() {
  var op1 = $('bw-op1'), op2 = $('bw-op2');
  if (op1) op1.value = '';
  if (op2) op2.value = '';
  showError('', null);
  clearResult();
}

function init() {
  var calc = $('bw-calc');
  if (calc) calc.addEventListener('click', compute);
  var ex = $('bw-example');
  if (ex) ex.addEventListener('click', fillExample);
  var cl = $('bw-clear');
  if (cl) cl.addEventListener('click', clearAll);
  var op = $('bw-op');
  if (op) op.addEventListener('change', function () { refreshOp2State(); });
  var width = $('bw-width');
  if (width) width.addEventListener('change', function () {
    if (lastResult) compute();
  });
  var op1 = $('bw-op1'), op2 = $('bw-op2');
  function enterCompute(e) {
    if (e.key === 'Enter') compute();
  }
  if (op1) op1.addEventListener('keydown', enterCompute);
  if (op2) op2.addEventListener('keydown', enterCompute);
  var copyMap = [
    ['bw-copy-hex', function () { return lastResult && lastResult.hex; }, '已复制 HEX 结果'],
    ['bw-copy-dec', function () { return lastResult && lastResult.dec; }, '已复制无符号十进制结果'],
    ['bw-copy-signed', function () { return lastResult && lastResult.signed; }, '已复制有符号十进制结果'],
    ['bw-copy-bin', function () { return lastResult && lastResult.bin; }, '已复制二进制结果'],
    ['bw-copy-expr', function () { return lastResult && buildCopyAllText(lastResult); }, '已复制表达式与四进制结果']
  ];
  var i;
  for (i = 0; i < copyMap.length; i++) {
    (function (id, get, msg) {
      var btn = $(id);
      if (btn) btn.addEventListener('click', function () {
        var t = get();
        if (!t) { toast('请先点「计算」得出结果'); return; }
        copyText(t, msg);
      });
    })(copyMap[i][0], copyMap[i][1], copyMap[i][2]);
  }
  refreshOp2State();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    WIDTHS: WIDTHS, BASES: BASES, OP_META: OP_META,
    coerceWidth: coerceWidth, maskOf: maskOf, normalize: normalize,
    parseOperand: parseOperand,
    bitwiseAnd: bitwiseAnd, bitwiseOr: bitwiseOr,
    bitwiseXor: bitwiseXor, bitwiseNot: bitwiseNot,
    shiftLeft: shiftLeft, shiftRightLogical: shiftRightLogical,
    rotateLeft: rotateLeft, rotateRight: rotateRight,
    computeOp: computeOp,
    formatHex: formatHex, formatDec: formatDec,
    formatSigned: formatSigned, formatBin: formatBin,
    buildExpression: buildExpression
  };
}
})();
