/* HEX ↔ C 数组互转器（hex_c_array）- 纯前端本地计算
 * 纯函数（双模式导出供 node 测试）：
 *   parseHex(text)      → Uint8Array（容忍连续 hex／空格逗号换行分隔／0x 前缀／大小写混写）
 *   parseByteList(text) → Uint8Array（十进制逗号分隔，0–255 范围校验）
 *   parseCArray(text)   → {bytes, name}（解析 const uint8_t data[N] = {...}，容忍 char／十进制混写）
 *   toCArray(bytes, opts)    → string（opts: {name, type, perLine, prefix('0x'|'h'), uppercase}）
 *   toHexString(bytes, opts) → string（opts: {format: 'plain'|'spaced'|'0x', uppercase}）
 *   toByteList(bytes)   → string；toBase64(bytes) → string；formatBytes(n) → 中文可读体积
 * 失败约定：非法参数抛 Error，err.field 给出字段名（input／name／type／perLine／prefix／format／bytes），不静默钳制。
 * 零网络请求：本文件不发起任何 fetch / XHR。 */
(function () {
'use strict';

/* ---------- 失败构造 ---------- */
function fail(field, msg) {
  var e = new Error(msg);
  e.field = field;
  throw e;
}

/* ---------- 基础工具 ---------- */
function byteHex(b, uppercase) {
  var h = (b & 0xFF).toString(16);
  if (uppercase !== false) h = h.toUpperCase();
  return h.length < 2 ? '0' + h : h;
}

function toBytesArray(bytes) {
  var arr, i;
  if (bytes instanceof Uint8Array) { arr = bytes; }
  else if (Array.isArray(bytes)) { arr = bytes; }
  else { fail('bytes', '字节数据必须为 Uint8Array 或数组。'); }
  for (i = 0; i < arr.length; i++) {
    var v = arr[i];
    if (typeof v !== 'number' || !isFinite(v) || Math.floor(v) !== v || v < 0 || v > 255) {
      fail('bytes', '字节数据第 ' + (i + 1) + ' 项非法（' + v + '）：每个字节必须为 0–255 的整数。');
    }
  }
  return arr;
}

/* ---------- parseHex ---------- */
var HEX_CHARS = /[0-9a-fA-FxX]/;
var HEX_SEP = /[\s,]/;

function parseHex(text) {
  if (typeof text !== 'string') fail('input', '输入必须为字符串。');
  var i, ch;
  var cleaned = '';
  for (i = 0; i < text.length; i++) {
    ch = text.charAt(i);
    if (HEX_CHARS.test(ch)) { cleaned += ch; }
    else if (HEX_SEP.test(ch)) { /* 分隔符跳过 */ }
    else {
      fail('input', '第 ' + (i + 1) + ' 个字符非法（"' + ch + '"）：HEX 文本只允许十六进制数字（0-9、a-f、A-F）、0x 前缀、空格、逗号与换行分隔。');
    }
  }
  var hex = cleaned.replace(/0[xX]/g, '');
  if (!/^[0-9a-fA-F]*$/.test(hex)) {
    fail('input', '存在非法十六进制字符：x/X 只允许紧跟在 0 之后组成 0x 前缀。');
  }
  if (hex.length === 0) fail('input', '输入为空：请粘贴至少 1 个字节的十六进制数据。');
  if (hex.length % 2 !== 0) {
    fail('input', '十六进制位数为奇数（共 ' + hex.length + ' 位）：每个字节需要 2 位十六进制数字。');
  }
  var out = new Uint8Array(hex.length / 2);
  for (i = 0; i < hex.length; i += 2) {
    out[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return out;
}

/* ---------- parseByteList ---------- */
function parseByteList(text) {
  if (typeof text !== 'string') fail('input', '输入必须为字符串。');
  var parts = text.split(/[\s,;，、]+/);
  var vals = [], i, tok, v, idx = 0;
  for (i = 0; i < parts.length; i++) {
    tok = parts[i];
    if (tok === '') continue;
    idx++;
    if (!/^\d+$/.test(tok)) {
      fail('input', '第 ' + idx + ' 个数非法（"' + tok + '"）：字节列表只允许 0–255 的十进制整数。');
    }
    v = parseInt(tok, 10);
    if (v > 255) {
      fail('input', '第 ' + idx + ' 个数超出范围（"' + tok + '"）：每个字节必须为 0–255。');
    }
    vals.push(v);
  }
  if (vals.length === 0) fail('input', '输入为空：请粘贴至少 1 个字节（十进制，0–255，逗号分隔）。');
  return new Uint8Array(vals);
}

/* ---------- parseCArray ---------- */
var C_TYPE_RE = /^\s*(?:const\s+)?(?:unsigned\s+char|signed\s+char|char|uint8_t|int8_t)\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:\[[^\]]*\])?\s*=\s*\{([\s\S]*)\}\s*;?\s*$/;

function parseCArray(text) {
  if (typeof text !== 'string') fail('input', '输入必须为字符串。');
  var m = text.match(C_TYPE_RE);
  if (!m) {
    fail('input', '无法识别为 C 数组：期望形如 const uint8_t data[] = { 0xA1, 0xB2, 195 };（类型支持 uint8_t／unsigned char／char，可省略 const 与数组长度）。');
  }
  var name = m[1], body = m[2];
  var parts = body.split(',');
  var vals = [], i, tok, v;
  for (i = 0; i < parts.length; i++) {
    tok = parts[i].trim();
    if (tok === '') continue;
    if (/^0[xX][0-9a-fA-F]+$/.test(tok)) { v = parseInt(tok, 16); }
    else if (/^[0-9a-fA-F]+[hH]$/.test(tok)) { v = parseInt(tok.slice(0, -1), 16); }
    else if (/^\d+$/.test(tok)) { v = parseInt(tok, 10); }
    else {
      fail('input', '数组元素非法（"' + tok + '"）：只支持 0x 前缀十六进制（如 0xA1）、十进制（如 195）或 h 后缀十六进制（如 A1h）。');
    }
    if (v > 255) {
      fail('input', '数组元素超出范围（"' + tok + '"）：每个字节必须为 0–255。');
    }
    vals.push(v);
  }
  if (vals.length === 0) fail('input', '数组为空：大括号内至少需要 1 个字节。');
  return { bytes: new Uint8Array(vals), name: name };
}

/* ---------- toCArray ---------- */
var C_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
var C_TYPES = ['uint8_t', 'unsigned char', 'char'];

function toCArray(bytes, opts) {
  var arr = toBytesArray(bytes);
  opts = opts || {};
  var name = opts.name !== undefined ? opts.name : 'data';
  if (typeof name !== 'string' || !C_NAME_RE.test(name)) {
    fail('name', '数组名必须为合法 C 标识符（字母或下划线开头，仅含字母、数字、下划线）。');
  }
  var type = opts.type !== undefined ? opts.type : 'uint8_t';
  if (C_TYPES.indexOf(type) === -1) {
    fail('type', '数据类型只支持：uint8_t、unsigned char、char。');
  }
  var perLine = opts.perLine !== undefined ? opts.perLine : 8;
  if (typeof perLine !== 'number' || !isFinite(perLine) || Math.floor(perLine) !== perLine || perLine < 1) {
    fail('perLine', '每行字节数必须为正整数。');
  }
  var prefix = opts.prefix !== undefined ? opts.prefix : '0x';
  if (prefix !== '0x' && prefix !== 'h') {
    fail('prefix', '十六进制前缀只支持 "0x"（如 0xA1）或 "h"（如 A1h）。');
  }
  var uppercase = opts.uppercase !== false;
  function elem(b) {
    var h = byteHex(b, uppercase);
    return prefix === '0x' ? '0x' + h : h + 'h';
  }
  var lines = [], i, j, chunk;
  for (i = 0; i < arr.length; i += perLine) {
    chunk = [];
    for (j = i; j < i + perLine && j < arr.length; j++) chunk.push(elem(arr[j]));
    lines.push('    ' + chunk.join(', '));
  }
  return 'const ' + type + ' ' + name + '[' + arr.length + '] = {\n' +
    lines.join(',\n') + '\n};';
}

/* ---------- toHexString ---------- */
function toHexString(bytes, opts) {
  var arr = toBytesArray(bytes);
  opts = opts || {};
  var format = opts.format !== undefined ? opts.format : 'spaced';
  if (format !== 'plain' && format !== 'spaced' && format !== '0x') {
    fail('format', 'HEX 格式只支持：plain（连续）、spaced（空格分隔）、0x（0x 前缀逗号分隔）。');
  }
  var uppercase = opts.uppercase !== false;
  var parts = [], i, h;
  for (i = 0; i < arr.length; i++) {
    h = byteHex(arr[i], uppercase);
    parts.push(format === '0x' ? '0x' + h : h);
  }
  if (format === 'plain') return parts.join('');
  if (format === 'spaced') return parts.join(' ');
  return parts.join(', ');
}

/* ---------- toByteList / toBase64 / formatBytes ---------- */
function toByteList(bytes) {
  var arr = toBytesArray(bytes);
  var parts = [], i;
  for (i = 0; i < arr.length; i++) parts.push(String(arr[i]));
  return parts.join(', ');
}

function toBase64(bytes) {
  var arr = toBytesArray(bytes);
  if (typeof Buffer !== 'undefined' && Buffer.from) {
    return Buffer.from(arr).toString('base64');
  }
  var bin = '', i;
  for (i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}

function formatBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}

/* ---------- 双模式导出 ---------- */
var api = {
  parseHex: parseHex,
  parseByteList: parseByteList,
  parseCArray: parseCArray,
  toCArray: toCArray,
  toHexString: toHexString,
  toByteList: toByteList,
  toBase64: toBase64,
  formatBytes: formatBytes
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
} else {
  window.__hexCArray = api;
}

/* ---------- 浏览器 DOM ---------- */
if (typeof document !== 'undefined') {
  (function () {
    function $(id) { return document.getElementById(id); }

    var toastEl;
    function toast(msg) {
      if (!toastEl) toastEl = $('hx-toast');
      toastEl.textContent = msg;
      toastEl.style.display = 'block';
      clearTimeout(toastEl._t);
      toastEl._t = setTimeout(function () { toastEl.style.display = 'none'; }, 2400);
    }

    function copyText(text, done) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { done(true); }, function () { fallbackCopy(text, done); });
      } else { fallbackCopy(text, done); }
    }
    function fallbackCopy(text, done) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      done(ok);
    }

    var inputMode = 'hex';   /* hex | list | carray */
    var outputMode = 'carray'; /* carray | hex | bytes | base64 */
    var lastBytes = null;

    var tabs = { hex: 'hx-tab-hex', list: 'hx-tab-list', carray: 'hx-tab-carray' };
    function setInputMode(mode) {
      inputMode = mode;
      Object.keys(tabs).forEach(function (k) {
        $(tabs[k]).classList.toggle('hx-tab-active', k === mode);
      });
      var hints = {
        hex: '支持连续 hex（A1B2C3）、空格／逗号／换行分隔（A1 B2, C3）、0x 前缀（0xA1, 0xB2）、大小写混写。',
        list: '十进制字节列表，逗号或空格分隔，例如：161, 178, 195（每个 0–255）。',
        carray: '粘贴 C 数组定义，例如：const uint8_t data[4] = { 0xA1, 0xB2, 195, 0xD4 };（类型可为 uint8_t／unsigned char／char，可省略 const 与长度）。'
      };
      $('hx-hint').textContent = hints[mode];
      clearResult();
      refreshInfo();
    }

    function clearResult() {
      $('hx-result').textContent = '';
      $('hx-out-card').style.display = 'none';
      $('hx-msg').textContent = '';
      lastBytes = null;
    }

    function showError(e) {
      var msg = e && e.message ? e.message : String(e);
      $('hx-msg').textContent = '解析失败：' + msg;
    }

    function currentOpts() {
      return {
        name: $('hx-name').value.trim() || 'data',
        type: $('hx-type').value,
        perLine: parseInt($('hx-perline').value, 10),
        prefix: $('hx-prefix').value,
        uppercase: $('hx-uppercase').value === 'upper'
      };
    }

    function doConvert() {
      var raw = $('hx-input').value;
      var bytes;
      try {
        if (inputMode === 'hex') bytes = api.parseHex(raw);
        else if (inputMode === 'list') bytes = api.parseByteList(raw);
        else bytes = api.parseCArray(raw).bytes;
      } catch (e) { clearResult(); showError(e); return; }
      var out;
      try {
        if (outputMode === 'carray') out = api.toCArray(bytes, currentOpts());
        else if (outputMode === 'hex') {
          var fmt = $('hx-hexfmt').value;
          out = api.toHexString(bytes, { format: fmt, uppercase: $('hx-uppercase').value === 'upper' });
        }
        else if (outputMode === 'bytes') out = api.toByteList(bytes);
        else out = api.toBase64(bytes);
      } catch (e) { showError(e); return; }
      lastBytes = bytes;
      $('hx-msg').textContent = '';
      $('hx-result').textContent = out;
      $('hx-out-card').style.display = 'block';
      refreshInfo();
    }

    function refreshInfo() {
      var raw = $('hx-input').value;
      var bytes = null;
      try {
        if (inputMode === 'hex') bytes = api.parseHex(raw);
        else if (inputMode === 'list') bytes = api.parseByteList(raw);
        else bytes = api.parseCArray(raw).bytes;
      } catch (e) { bytes = null; }
      var info = '字节数：' + (bytes ? bytes.length : '—');
      if (bytes && outputMode === 'carray') {
        info += '　·　C 数组行数约：' + Math.ceil(bytes.length / parseInt($('hx-perline').value, 10));
      }
      info += '　·　输入字符数：' + raw.length;
      $('hx-info').textContent = info;
    }

    document.addEventListener('DOMContentLoaded', function () {
      Object.keys(tabs).forEach(function (k) {
        $(tabs[k]).addEventListener('click', function () { setInputMode(k); });
      });
      document.querySelectorAll('input[name="hx-output"]').forEach(function (r) {
        r.addEventListener('change', function () {
          outputMode = r.value;
          $('hx-row-hexfmt').style.display = outputMode === 'hex' ? '' : 'none';
          $('hx-row-copts').style.display = outputMode === 'carray' ? '' : 'none';
          clearResult();
          refreshInfo();
        });
      });
      $('hx-convert').addEventListener('click', doConvert);
      $('hx-example').addEventListener('click', function () {
        if (inputMode === 'hex') $('hx-input').value = 'A1 B2, 0xc3\nD4 E5 F6, 0x07, 0x88';
        else if (inputMode === 'list') $('hx-input').value = '161, 178, 195, 212, 229, 246, 7, 136';
        else $('hx-input').value = 'const uint8_t data[8] = { 0xA1, 0xB2, 195, 0xD4, 0xE5, 0xF6, 0x07, 0x88 };';
        clearResult();
        refreshInfo();
        toast('已载入示例，点击「转换」查看输出。');
      });
      $('hx-clear').addEventListener('click', function () {
        $('hx-input').value = '';
        clearResult();
        refreshInfo();
      });
      $('hx-copy').addEventListener('click', function () {
        var txt = $('hx-result').textContent;
        if (!txt) { toast('暂无转换结果，请先转换。'); return; }
        copyText(txt, function (ok) { toast(ok ? '已复制到剪贴板。' : '复制失败，请手动选择复制。'); });
      });
      $('hx-download').addEventListener('click', function () {
        var txt = $('hx-result').textContent;
        if (!txt) { toast('暂无转换结果，请先转换。'); return; }
        var ext = outputMode === 'carray' ? 'h' : 'txt';
        var name = outputMode === 'carray' ? (($('hx-name').value.trim() || 'data') + '.h') : ('hex-c-array.' + ext);
        var blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
        toast('已下载 ' + name + '。');
      });
      $('hx-input').addEventListener('input', refreshInfo);
      ['hx-perline', 'hx-uppercase'].forEach(function (id) {
        $(id).addEventListener('change', refreshInfo);
      });
      setInputMode('hex');
    });
  })();
}
})();
