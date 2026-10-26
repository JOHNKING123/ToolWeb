/* CRC 校验和计算器（crc_checksum_calculator）- 纯前端本地计算
 * 6 组变体：CRC32（IEEE 802.3）、CRC32C（Castagnoli）、CRC16/MODBUS、
 * CRC16/CCITT-FALSE、CRC16/XMODEM、CRC16/ARC。文本用 TextEncoder 按
 * UTF-8 编码，文件按原始字节分片增量计算，同一增量计算核。
 * 纯函数经 module.exports 暴露供 node 测试；浏览器里走 DOM。
 * 零网络请求：本文件不发起任何 fetch / XHR。 */
(function () {
'use strict';

/* ---------- CRC32：反射表驱动 ---------- */
function makeTable32(reflectedPoly) {
  var table = new Array(256);
  var i, j, c;
  for (i = 0; i < 256; i++) {
    c = i;
    for (j = 0; j < 8; j++) {
      c = (c & 1) ? (reflectedPoly ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
}
var TABLE32 = makeTable32(0xEDB88320);
var TABLE32C = makeTable32(0x82F63B78);

function crc32State(table) {
  var crc = 0xFFFFFFFF;
  return {
    update: function (bytes) {
      var i;
      for (i = 0; i < bytes.length; i++) {
        crc = table[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
      }
      crc = crc >>> 0;
    },
    value: function () { return (crc ^ 0xFFFFFFFF) >>> 0; }
  };
}

/* ---------- CRC16 反射型：表驱动（MODBUS / ARC） ---------- */
function makeTable16Reflected(reflectedPoly) {
  var table = new Array(256);
  var i, j, c;
  for (i = 0; i < 256; i++) {
    c = i;
    for (j = 0; j < 8; j++) {
      c = (c & 1) ? (reflectedPoly ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c & 0xFFFF;
  }
  return table;
}
var TABLE16_A001 = makeTable16Reflected(0xA001);

function crc16ReflectedState(table, init) {
  var crc = init & 0xFFFF;
  return {
    update: function (bytes) {
      var i;
      for (i = 0; i < bytes.length; i++) {
        crc = table[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
      }
      crc = crc & 0xFFFF;
    },
    value: function () { return crc; }
  };
}

/* ---------- CRC16 正向型：按位计算（CCITT-FALSE / XMODEM） ---------- */
function crc16NormalState(poly, init) {
  var crc = init & 0xFFFF;
  return {
    update: function (bytes) {
      var i, j;
      for (i = 0; i < bytes.length; i++) {
        crc ^= (bytes[i] << 8);
        for (j = 0; j < 8; j++) {
          crc = (crc & 0x8000) ? (((crc << 1) ^ poly) & 0xFFFF) : ((crc << 1) & 0xFFFF);
        }
      }
    },
    value: function () { return crc; }
  };
}

/* ---------- 变体定义：名称、多项式、初值、异或输出值 ---------- */
var VARIANTS = [
  { id: 'crc32', name: 'CRC32', full: 'CRC32（IEEE 802.3）', bits: 32,
    params: '多项式 0x04C11DB7（反射 0xEDB88320）· 初值 0xFFFFFFFF · 异或输出 0xFFFFFFFF · 输入/输出均反射',
    make: function () { return crc32State(TABLE32); } },
  { id: 'crc32c', name: 'CRC32C', full: 'CRC32C（Castagnoli）', bits: 32,
    params: '多项式 0x1EDC6F41（反射 0x82F63B78）· 初值 0xFFFFFFFF · 异或输出 0xFFFFFFFF · 输入/输出均反射',
    make: function () { return crc32State(TABLE32C); } },
  { id: 'crc16-modbus', name: 'CRC16/MODBUS', full: 'CRC16/MODBUS', bits: 16,
    params: '多项式 0x8005（反射 0xA001）· 初值 0xFFFF · 异或输出 0x0000 · 输入/输出均反射',
    make: function () { return crc16ReflectedState(TABLE16_A001, 0xFFFF); } },
  { id: 'crc16-ccitt-false', name: 'CRC16/CCITT-FALSE', full: 'CRC16/CCITT-FALSE', bits: 16,
    params: '多项式 0x1021 · 初值 0xFFFF · 异或输出 0x0000 · 输入/输出均不反射',
    make: function () { return crc16NormalState(0x1021, 0xFFFF); } },
  { id: 'crc16-xmodem', name: 'CRC16/XMODEM', full: 'CRC16/XMODEM', bits: 16,
    params: '多项式 0x1021 · 初值 0x0000 · 异或输出 0x0000 · 输入/输出均不反射',
    make: function () { return crc16NormalState(0x1021, 0x0000); } },
  { id: 'crc16-arc', name: 'CRC16/ARC', full: 'CRC16/ARC', bits: 16,
    params: '多项式 0x8005（反射 0xA001）· 初值 0x0000 · 异或输出 0x0000 · 输入/输出均反射',
    make: function () { return crc16ReflectedState(TABLE16_A001, 0x0000); } }
];
var VARIANT_IDS = ['crc32', 'crc32c', 'crc16-modbus', 'crc16-ccitt-false', 'crc16-xmodem', 'crc16-arc'];

function variantById(id) {
  var i;
  for (i = 0; i < VARIANTS.length; i++) {
    if (VARIANTS[i].id === id) return VARIANTS[i];
  }
  return null;
}

/* ---------- 增量计算核：一次创建 6 组状态，分片喂入 ---------- */
function createAllStates() {
  var states = [];
  var i;
  for (i = 0; i < VARIANTS.length; i++) {
    states.push({ variant: VARIANTS[i], state: VARIANTS[i].make() });
  }
  return {
    update: function (bytes) {
      var k;
      for (k = 0; k < states.length; k++) states[k].state.update(bytes);
    },
    results: function () {
      var out = [];
      var k, v;
      for (k = 0; k < states.length; k++) {
        v = states[k].state.value();
        out.push({ id: states[k].variant.id, name: states[k].variant.name,
          full: states[k].variant.full, bits: states[k].variant.bits,
          params: states[k].variant.params, value: v,
          hex: formatHex(v, states[k].variant.bits), dec: v });
      }
      return out;
    }
  };
}

/* 一次性计算：字节数组 -> 6 组结果。 */
function computeAll(bytes) {
  var all = createAllStates();
  all.update(bytes);
  return all.results();
}

function formatHex(value, bits) {
  var width = bits === 32 ? 8 : 4;
  var h = (value >>> 0).toString(16).toUpperCase();
  while (h.length < width) h = '0' + h;
  return h;
}

/* 文本按 UTF-8 编码为字节（浏览器 TextEncoder，node 兜底 Buffer）。 */
function encodeUtf8(text) {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text);
  }
  var buf = Buffer.from(text, 'utf8');
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

/* ---------- 期望值比对 ---------- */
/* 剥离可选 0x 前缀与首尾空白，大小写不敏感；空串 = 未填写。 */
function parseExpected(raw) {
  if (raw === null || raw === undefined) return { empty: true };
  var s = String(raw).replace(/^\s+|\s+$/g, '');
  if (s === '') return { empty: true };
  if (s.slice(0, 2).toLowerCase() === '0x') s = s.slice(2);
  if (s === '' || !/^[0-9a-fA-F]+$/.test(s)) return { empty: false, valid: false };
  return { empty: false, valid: true, value: parseInt(s, 16) };
}

/* 返回 { state, label }：state 为 empty/match/mismatch/invalid。 */
function compareOne(result, raw) {
  var p = parseExpected(raw);
  if (p.empty) return { state: 'empty', label: '—' };
  if (!p.valid) return { state: 'invalid', label: '期望值格式非法' };
  if (p.value === result.value) return { state: 'match', label: '✓ 一致' };
  return { state: 'mismatch', label: '✗ 不一致' };
}

/* ---------- 复制 / 下载文本：与页面输出同一来源 ---------- */
function buildAllText(results) {
  var lines = [];
  var i;
  for (i = 0; i < results.length; i++) {
    lines.push(results[i].full + '：' + results[i].hex + '（十进制 ' + results[i].dec + '）');
  }
  return lines.join('\n');
}

/* ---------- 浏览器 DOM ---------- */
function $(id) { return document.getElementById(id); }

function toast(msg) {
  var t = $('crc-toast');
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

var currentResults = null;
var currentLabel = '';

function renderResults(results, label) {
  var i, r;
  currentResults = results;
  currentLabel = label;
  for (i = 0; i < results.length; i++) {
    r = results[i];
    var hexEl = $('crc-hex-' + r.id);
    var decEl = $('crc-dec-' + r.id);
    if (hexEl) hexEl.textContent = r.hex;
    if (decEl) decEl.textContent = String(r.dec);
    refreshCompare(r);
  }
  var info = $('crc-source-info');
  if (info) info.textContent = label;
}

function refreshCompare(result) {
  var input = $('crc-exp-' + result.id);
  var status = $('crc-status-' + result.id);
  if (!input || !status) return;
  var c = compareOne(result, input.value);
  status.textContent = c.label;
  status.className = 'crc-status crc-' + c.state;
}

function refreshAllCompare() {
  if (!currentResults) return;
  var i;
  for (i = 0; i < currentResults.length; i++) refreshCompare(currentResults[i]);
}

function computeText() {
  var ta = $('crc-text');
  var text = ta ? ta.value : '';
  var bytes = encodeUtf8(text);
  var results = computeAll(bytes);
  var msg = $('crc-msg');
  renderResults(results, '当前输入：文本（UTF-8 编码，' + bytes.length + ' 字节）');
  if (msg) {
    msg.textContent = text.length === 0
      ? '当前为空输入，请输入文本或选择文件（下方为标准空输入值）。'
      : '';
  }
}

function computeFile(file) {
  var info = $('crc-file-info');
  var prog = $('crc-file-progress');
  var msg = $('crc-msg');
  if (info) info.textContent = '文件：' + file.name + '（' + file.size + ' 字节）';
  if (msg) msg.textContent = '';
  var CHUNK = 1024 * 1024;
  var all = createAllStates();
  var offset = 0;
  function step() {
    if (offset >= file.size) {
      var results = all.results();
      renderResults(results, '当前输入：文件 ' + file.name + '（原始字节，' + file.size + ' 字节）');
      if (prog) prog.textContent = '读取完成（100%）';
      return;
    }
    var slice = file.slice(offset, offset + CHUNK);
    var reader = new FileReader();
    reader.onload = function () {
      try {
        all.update(new Uint8Array(reader.result));
      } catch (e) {
        if (msg) msg.textContent = '文件读取失败：' + file.name + '，请重新选择文件。';
        return;
      }
      offset += CHUNK;
      if (prog) {
        var pct = Math.min(100, Math.floor(offset / file.size * 100));
        prog.textContent = '读取中…' + pct + '%';
      }
      step();
    };
    reader.onerror = function () {
      if (msg) msg.textContent = '文件读取失败：' + file.name + '，请重新选择文件。';
    };
    try {
      reader.readAsArrayBuffer(slice);
    } catch (e) {
      if (msg) msg.textContent = '文件读取失败：' + file.name + '，请重新选择文件。';
    }
  }
  if (file.size === 0) {
    renderResults(all.results(), '当前输入：文件 ' + file.name + '（原始字节，0 字节）');
    if (prog) prog.textContent = '读取完成（100%）';
    if (msg) msg.textContent = '当前为空输入，请输入文本或选择文件（下方为标准空输入值）。';
    return;
  }
  step();
}

function currentMode() {
  var f = $('crc-mode-file');
  return (f && f.checked) ? 'file' : 'text';
}

function recompute() {
  if (currentMode() === 'file') {
    var input = $('crc-file');
    if (input && input.files && input.files.length > 0) {
      computeFile(input.files[0]);
    } else {
      renderResults(computeAll(new Uint8Array(0)), '当前输入：文件模式（未选择文件，显示标准空输入值）');
      var msg = $('crc-msg');
      if (msg) msg.textContent = '当前为空输入，请输入文本或选择文件（下方为标准空输入值）。';
    }
  } else {
    computeText();
  }
}

function init() {
  var ta = $('crc-text');
  if (ta) ta.addEventListener('input', function () {
    if (currentMode() === 'text') computeText();
  });
  var i, v;
  for (i = 0; i < VARIANTS.length; i++) {
    (function (variant) {
      var input = $('crc-exp-' + variant.id);
      if (input) input.addEventListener('input', refreshAllCompare);
      var btn = $('crc-copy-' + variant.id);
      if (btn) btn.addEventListener('click', function () {
        if (!currentResults) return;
        var k, r = null;
        for (k = 0; k < currentResults.length; k++) {
          if (currentResults[k].id === variant.id) r = currentResults[k];
        }
        if (r) copyText(r.hex, '已复制 ' + r.full + '：' + r.hex);
      });
    })(VARIANTS[i]);
  }
  var modes = document.querySelectorAll('input[name="crc-mode"]');
  for (i = 0; i < modes.length; i++) {
    modes[i].addEventListener('change', function () {
      var textCard = $('crc-text-card');
      var fileCard = $('crc-file-card');
      if (textCard) textCard.style.display = currentMode() === 'text' ? '' : 'none';
      if (fileCard) fileCard.style.display = currentMode() === 'file' ? '' : 'none';
      recompute();
    });
  }
  var fileInput = $('crc-file');
  if (fileInput) fileInput.addEventListener('change', function () {
    if (fileInput.files && fileInput.files.length > 0) computeFile(fileInput.files[0]);
  });
  var drop = $('crc-drop');
  if (drop) {
    drop.addEventListener('dragover', function (e) { e.preventDefault(); });
    drop.addEventListener('drop', function (e) {
      e.preventDefault();
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        computeFile(e.dataTransfer.files[0]);
      }
    });
  }
  var ex = $('crc-example');
  if (ex) ex.addEventListener('click', function () {
    if (ta) ta.value = '123456789';
    var tm = $('crc-mode-text');
    if (tm) tm.checked = true;
    var textCard = $('crc-text-card');
    var fileCard = $('crc-file-card');
    if (textCard) textCard.style.display = '';
    if (fileCard) fileCard.style.display = 'none';
    computeText();
  });
  var cl = $('crc-clear');
  if (cl) cl.addEventListener('click', function () {
    if (ta) ta.value = '';
    if (fileInput) fileInput.value = '';
    var info = $('crc-file-info');
    if (info) info.textContent = '';
    var prog = $('crc-file-progress');
    if (prog) prog.textContent = '';
    var inputs = document.querySelectorAll('.crc-exp');
    for (i = 0; i < inputs.length; i++) inputs[i].value = '';
    computeText();
    var tm = $('crc-mode-text');
    if (tm) tm.checked = true;
    var textCard = $('crc-text-card');
    var fileCard = $('crc-file-card');
    if (textCard) textCard.style.display = '';
    if (fileCard) fileCard.style.display = 'none';
  });
  var ca = $('crc-copy-all');
  if (ca) ca.addEventListener('click', function () {
    if (currentResults) copyText(buildAllText(currentResults), '已复制全部 6 组校验值');
  });
  var dl = $('crc-download');
  if (dl) dl.addEventListener('click', function () {
    if (!currentResults) return;
    var blob = new Blob([buildAllText(currentResults) + '\n'], { type: 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'crc-checksum.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 500);
    toast('已下载 crc-checksum.txt');
  });
  computeText();
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
    VARIANTS: VARIANTS, VARIANT_IDS: VARIANT_IDS, variantById: variantById,
    createAllStates: createAllStates, computeAll: computeAll,
    formatHex: formatHex, encodeUtf8: encodeUtf8,
    parseExpected: parseExpected, compareOne: compareOne,
    buildAllText: buildAllText
  };
}
})();
