/* 寄存器位域查看与编辑器（register_bitfield_editor）- 纯前端本地计算
 * 32 位寄存器值输入（hex/dec/bin）→ 32 位位图点击置位/清零 → 实时输出
 * HEX（0x 前缀 8 位大写）/ DEC（无符号十进制）/ BIN（4 位分组）/ 置位位列表 /
 * C 宏定义（#define REG_BITn (1u << n) 降序、REG_VAL、REG_SET_MASK、REG_CLR_MASK），
 * 复制宏 / 下载 register-bitfield.h 与 register-bitfield.txt，示例 0xDEADBEEF 一键载入。
 * 纯函数经 module.exports 暴露供 node 测试；浏览器里走 DOM。
 * 失败约定：非法参数抛 Error，err.field 给出字段名，不静默钳制。
 * 零网络请求：本文件不发起任何 fetch / XHR。 */
(function () {
'use strict';

var MAX_U32 = 4294967295;

/* ---------- 失败构造 ---------- */
function fail(field, msg) {
  var e = new Error(msg);
  e.field = field;
  throw e;
}

/* ---------- 基础校验 ---------- */
function isUint(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n; }

function checkValue(value, field) {
  if (!isUint(value) || value < 0 || value > MAX_U32) {
    fail(field || 'value', '寄存器值必须为 0–4294967295（32 位无符号）的整数。');
  }
}

function checkBit(bit) {
  if (!isUint(bit) || bit < 0 || bit > 31) {
    fail('bit', '位号必须为 0–31 的整数。');
  }
}

function checkPrefix(prefix) {
  if (prefix == null || prefix === '') return 'REG';
  var p = String(prefix);
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(p)) {
    fail('prefix', '宏前缀只允许字母、数字、下划线，且须以字母或下划线开头。');
  }
  return p;
}

function checkFormat(format) {
  if (format == null || format === '') return 'auto';
  var f = String(format).toLowerCase();
  if (f !== 'auto' && f !== 'hex' && f !== 'dec' && f !== 'bin') {
    fail('format', '输入格式只支持 "auto" / "hex" / "dec" / "bin"。');
  }
  return f;
}

/* ---------- 输入解析 ----------
 * parseRegisterInput(str, format)：format ∈ auto|hex|dec|bin（默认 auto）。
 * auto 口径：0x/0X 前缀 → hex；0b/0B 前缀 → bin；含 a-fA-F → hex；其余 → dec。
 * 非法输入抛 Error（err.field = "value"），超 32 位（>4294967295）同样抛错。 */
function parseRegisterInput(str, format) {
  var f = checkFormat(format);
  var s = String(str == null ? '' : str).replace(/[\s_]/g, '');
  if (s === '') fail('value', '请输入寄存器值（hex/dec/bin）。');
  var v;

  if (f === 'auto') {
    if (/^0[xX]/.test(s)) f = 'hex';
    else if (/^0[bB]/.test(s)) f = 'bin';
    else if (/[a-fA-F]/.test(s)) f = 'hex';
    else f = 'dec';
  }

  if (f === 'hex') {
    var h = s.replace(/^0[xX]/, '');
    if (h === '' || !/^[0-9a-fA-F]+$/.test(h)) {
      fail('value', '十六进制格式错误：请使用 0-9、a-f（可选 0x 前缀），如 0xDEADBEEF。');
    }
    v = parseInt(h, 16);
  } else if (f === 'dec') {
    if (!/^\d+$/.test(s)) {
      fail('value', '十进制格式错误：请使用 0-9 数字，如 3735928559。');
    }
    v = parseInt(s, 10);
  } else { /* bin */
    var b = s.replace(/^0[bB]/, '');
    if (b === '' || !/^[01]+$/.test(b)) {
      fail('value', '二进制格式错误：请使用 0/1（可选 0b 前缀），如 0b101。');
    }
    if (b.length > 32) fail('value', '二进制位数超过 32 位。');
    v = parseInt(b, 2);
  }

  if (!isUint(v) || v > MAX_U32) {
    fail('value', '数值超出 32 位范围（最大 4294967295 / 0xFFFFFFFF）。');
  }
  return v >>> 0;
}

/* ---------- 位操作 ---------- */
function setBit(value, bit) {
  checkValue(value); checkBit(bit);
  return (value | (1 << bit)) >>> 0;
}

function clearBit(value, bit) {
  checkValue(value); checkBit(bit);
  return (value & ~(1 << bit)) >>> 0;
}

function toggleBit(value, bit) {
  checkValue(value); checkBit(bit);
  return (value ^ (1 << bit)) >>> 0;
}

/* ---------- 输出格式化 ---------- */
function padHex(v, digits) {
  var h = (v >>> 0).toString(16).toUpperCase();
  while (h.length < digits) h = '0' + h;
  return h;
}

/* toHex：0x 前缀＋8 位大写，如 0xDEADBEEF */
function toHex(value) {
  checkValue(value);
  return '0x' + padHex(value, 8);
}

/* toDec：无符号十进制字符串，如 3735928559 */
function toDec(value) {
  checkValue(value);
  return String(value >>> 0);
}

/* toBin：32 位，每 4 位空格分隔，如 0000 0000 ... 0101 */
function toBin(value) {
  checkValue(value);
  var bin = '';
  var i;
  for (i = 31; i >= 0; i--) {
    bin += (value >>> i) & 1 ? '1' : '0';
  }
  return bin.replace(/(.{4})/g, '$1 ').replace(/\s+$/, '');
}

/* setBitsList：置位位号升序数组，如 setBitsList(0xA5) = [0,2,5,7] */
function setBitsList(value) {
  checkValue(value);
  var list = [];
  var i;
  for (i = 0; i < 32; i++) {
    if (((value >>> i) & 1) === 1) list.push(i);
  }
  return list;
}

/* ---------- C 宏定义生成 ----------
 * generateMacros(value, prefix)：置位位宏按位号降序排列；
 * 之后依次为 ${P}_VAL / ${P}_SET_MASK / ${P}_CLR_MASK（CLR = ~value，按 32 位取反）；
 * value = 0 时不输出置位位宏行。prefix 非法抛错（err.field = "prefix"）。 */
function generateMacros(value, prefix) {
  checkValue(value);
  var p = checkPrefix(prefix);
  var lines = [];
  var bits = setBitsList(value);
  var i;
  for (i = bits.length - 1; i >= 0; i--) {
    lines.push('#define ' + p + '_BIT' + bits[i] + ' (1u << ' + bits[i] + ')');
  }
  var hx = '0x' + padHex(value, 8) + 'u';
  lines.push('#define ' + p + '_VAL ' + hx);
  lines.push('#define ' + p + '_SET_MASK ' + hx);
  lines.push('#define ' + p + '_CLR_MASK 0x' + padHex((~value) >>> 0, 8) + 'u');
  return lines.join('\n');
}

/* generateExample：固定示例值 0xDEADBEEF（寄存器调测经典演示值） */
function generateExample() {
  return 0xDEADBEEF;
}

/* suggestExportName(kind)：'txt' → register-bitfield.txt；'h' → register-bitfield.h；其余抛错 */
function suggestExportName(kind) {
  if (kind === 'txt') return 'register-bitfield.txt';
  if (kind === 'h') return 'register-bitfield.h';
  fail('kind', '导出类型只支持 "txt" 与 "h"，实得 ' + JSON.stringify(kind) + '。');
}

/* ---------- 导出文本 ---------- */
function buildExportH(value, prefix) {
  checkValue(value);
  var p = checkPrefix(prefix);
  var lines = [];
  lines.push('/*');
  lines.push(' * register-bitfield.h —— 寄存器位域宏定义（寄存器位域查看与编辑器生成）');
  lines.push(' * 值：' + toHex(value) + '（' + toDec(value) + '）');
  lines.push(' * 纯本地生成，未上传任何内容。');
  lines.push(' */');
  lines.push('#ifndef REGISTER_BITFIELD_H');
  lines.push('#define REGISTER_BITFIELD_H');
  lines.push('');
  lines.push(generateMacros(value, prefix));
  lines.push('');
  lines.push('/* 用法示例：');
  lines.push(' * ' + p + '_SET_MASK |=' + ' 置位：' + p + ' |= ' + p + '_SET_MASK;   // 或 ' + p + ' |= (' + p + '_BIT3 | ' + p + '_BIT7);');
  lines.push(' * 清零：   ' + p + ' &= ' + p + '_CLR_MASK;');
  lines.push(' */');
  lines.push('#endif /* REGISTER_BITFIELD_H */');
  return lines.join('\n');
}

function buildExportTxt(value, prefix) {
  checkValue(value);
  var p = checkPrefix(prefix);
  var lines = [];
  lines.push('寄存器位域查看与编辑器 —— 结果导出');
  lines.push('========================================');
  lines.push('HEX：' + toHex(value));
  lines.push('DEC：' + toDec(value));
  lines.push('BIN：' + toBin(value));
  lines.push('置位位（升序）：[' + setBitsList(value).join(', ') + ']');
  lines.push('');
  lines.push('C 宏定义（前缀 ' + p + '）：');
  lines.push(generateMacros(value, prefix));
  return lines.join('\n');
}

/* ---------- 浏览器 DOM ---------- */
function $(id) { return document.getElementById(id); }

function toast(msg) {
  var t = $('rb-toast');
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
    if (done) { toast(okMsg); } else { toast('复制失败，请手动选中宏定义内容复制'); }
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () { toast(okMsg); }, fallback);
  } else {
    fallback();
  }
}

function downloadText(name, text) {
  var blob = new Blob([text + '\n'], { type: 'text/plain;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 500);
}

var currentValue = 0;   /* 寄存器当前值（0–4294967295） */

function setText(id, text) {
  var el = $(id);
  if (el) el.textContent = text;
}

/* buildBitmap：构建 32 位位图（bit31…bit0 左到右降序），每 4 位一个 nibble 分组 */
function buildBitmap() {
  var wrap = $('rb-bitmap');
  if (!wrap) return;
  var html = '';
  var n;
  for (n = 0; n < 8; n++) {
    html += '<div class="rb-nibble' + (n % 2 === 0 ? ' rb-nib-a' : ' rb-nib-b') + '">';
    var b;
    for (b = 31 - n * 4; b >= 31 - n * 4 - 3; b--) {
      html += '<button type="button" class="rb-bit" data-bit="' + b + '"' +
        ' title="bit' + b + '（点击切换置位/清零）" aria-label="位 ' + b + '">' +
        '<span class="rb-bitnum">' + b + '</span>' +
        '<span class="rb-bitval">0</span></button>';
    }
    html += '</div>';
  }
  wrap.innerHTML = html;
  var cells = wrap.querySelectorAll('.rb-bit');
  var i;
  for (i = 0; i < cells.length; i++) {
    (function (cell) {
      cell.addEventListener('click', function () {
        var bit = parseInt(cell.getAttribute('data-bit'), 10);
        currentValue = toggleBit(currentValue, bit);
        render();
      });
    })(cells[i]);
  }
}

/* refreshFromInputs：从输入框解析值（格式下拉框口径），解析失败则显示错误提示 */
function refreshFromInputs() {
  var msg = $('rb-msg');
  var fmt = $('rb-format') ? $('rb-format').value : 'auto';
  var raw = $('rb-input') ? $('rb-input').value : '';
  try {
    currentValue = parseRegisterInput(raw, fmt);
    if (msg) msg.textContent = '';
    render();
  } catch (e) {
    if (msg) msg.textContent = '输入错误：' + e.message;
  }
}

function currentPrefix() {
  var el = $('rb-prefix');
  return el ? el.value : 'REG';
}

function render() {
  var wrap = $('rb-bitmap');
  if (wrap) {
    var cells = wrap.querySelectorAll('.rb-bit');
    var i;
    for (i = 0; i < cells.length; i++) {
      var bit = parseInt(cells[i].getAttribute('data-bit'), 10);
      var set = ((currentValue >>> bit) & 1) === 1;
      cells[i].className = 'rb-bit' + (set ? ' rb-on' : '');
      cells[i].setAttribute('aria-pressed', set ? 'true' : 'false');
      var val = cells[i].querySelector('.rb-bitval');
      if (val) val.textContent = set ? '1' : '0';
    }
  }
  setText('rb-out-hex', toHex(currentValue));
  setText('rb-out-dec', toDec(currentValue));
  setText('rb-out-bin', toBin(currentValue));
  setText('rb-out-bits', '[' + setBitsList(currentValue).join(', ') + ']');
  try {
    setText('rb-macros', generateMacros(currentValue, currentPrefix()));
    var pm = $('rb-prefix-msg');
    if (pm) pm.textContent = '';
  } catch (e) {
    var pm2 = $('rb-prefix-msg');
    if (pm2) pm2.textContent = '前缀错误：' + e.message;
  }
}

function init() {
  buildBitmap();
  var input = $('rb-input');
  if (input) input.addEventListener('input', refreshFromInputs);
  var fmt = $('rb-format');
  if (fmt) fmt.addEventListener('change', refreshFromInputs);
  var prefix = $('rb-prefix');
  if (prefix) prefix.addEventListener('input', render);

  var bAll = $('rb-set-all');
  if (bAll) bAll.addEventListener('click', function () {
    currentValue = MAX_U32;
    syncInputFromValue();
    render();
  });
  var bClear = $('rb-clear-all');
  if (bClear) bClear.addEventListener('click', function () {
    currentValue = 0;
    syncInputFromValue();
    render();
  });
  var bInv = $('rb-invert');
  if (bInv) bInv.addEventListener('click', function () {
    currentValue = (~currentValue) >>> 0;
    syncInputFromValue();
    render();
  });
  var bEx = $('rb-example');
  if (bEx) bEx.addEventListener('click', function () {
    currentValue = generateExample();
    var f = $('rb-format');
    if (f) f.value = 'hex';
    var inp = $('rb-input');
    if (inp) inp.value = toHex(currentValue);
    var msg = $('rb-msg');
    if (msg) msg.textContent = '';
    render();
    toast('已载入示例值 0xDEADBEEF');
  });
  var bCopy = $('rb-copy-macros');
  if (bCopy) bCopy.addEventListener('click', function () {
    try {
      copyText(generateMacros(currentValue, currentPrefix()), '已复制 C 宏定义');
    } catch (e) {
      toast('复制失败：' + e.message);
    }
  });
  var bH = $('rb-download-h');
  if (bH) bH.addEventListener('click', function () {
    try {
      var name = suggestExportName('h');
      downloadText(name, buildExportH(currentValue, currentPrefix()));
      toast('已下载 ' + name);
    } catch (e) {
      toast('下载失败：' + e.message);
    }
  });
  var bT = $('rb-download-txt');
  if (bT) bT.addEventListener('click', function () {
    try {
      var name = suggestExportName('txt');
      downloadText(name, buildExportTxt(currentValue, currentPrefix()));
      toast('已下载 ' + name);
    } catch (e) {
      toast('下载失败：' + e.message);
    }
  });
  /* 首屏以输入框预填值初始化（当前预填 0xDEADBEEF，自动识别为 hex） */
  refreshFromInputs();
}

/* syncInputFromValue：快捷按钮改值后，把输入框同步为 HEX 表达 */
function syncInputFromValue() {
  var f = $('rb-format');
  if (f) f.value = 'hex';
  var inp = $('rb-input');
  if (inp) inp.value = toHex(currentValue);
  var msg = $('rb-msg');
  if (msg) msg.textContent = '';
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
    parseRegisterInput: parseRegisterInput,
    setBit: setBit,
    clearBit: clearBit,
    toggleBit: toggleBit,
    toHex: toHex,
    toDec: toDec,
    toBin: toBin,
    setBitsList: setBitsList,
    generateMacros: generateMacros,
    generateExample: generateExample,
    suggestExportName: suggestExportName,
    buildExportH: buildExportH,
    buildExportTxt: buildExportTxt
  };
}
})();
