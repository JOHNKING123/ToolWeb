/* Modbus RTU 帧生成与校验器（modbus_frame_tool）- 纯前端本地计算
 * 组帧：buildReadFrame（01/02/03/04）、buildWriteSingle（05/06）、
 *       buildWriteMultiple（0F/10），统一自动附加 CRC16/MODBUS（低字节在前）。
 * 解析：parseFrame（容错 hex 输入、验 CRC、字段分解、异常响应识别）。
 * 纯函数经 module.exports 暴露供 node 测试；浏览器里走 DOM。
 * 失败约定：非法参数抛 Error，err.field 给出字段名，不静默钳制。
 * 零网络请求：本文件不发起任何 fetch / XHR。 */
(function () {
'use strict';

/* ---------- 失败构造 ---------- */
function fail(field, msg) {
  var e = new Error(msg);
  e.field = field;
  throw e;
}

/* ---------- 基础校验 ---------- */
function isUint(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n; }

function checkSlave(addr) {
  if (!isUint(addr) || addr < 1 || addr > 247) {
    fail('slaveAddr', '从站地址必须为 1–247 的整数（0 为广播地址，本工具不生成广播帧）。');
  }
}

var READ_FUNCS = { 1: true, 2: true, 3: true, 4: true };
var WRITE_SINGLE_FUNCS = { 5: true, 6: true };
var WRITE_MULTI_FUNCS = { 15: true, 16: true };
var ALL_FUNCS = { 1: true, 2: true, 3: true, 4: true, 5: true, 6: true, 15: true, 16: true };

function checkFunction(func, allowed, field) {
  if (!isUint(func) || !ALL_FUNCS[func]) {
    fail(field || 'function', '功能码只支持 01/02/03/04/05/06/0F/10。');
  }
  if (allowed && !allowed[func]) {
    fail(field || 'function', '该构建器不支持功能码 0x' + byteHex(func) + '。');
  }
}

function checkAddr(address) {
  if (!isUint(address) || address < 0 || address > 65535) {
    fail('address', '寄存器地址必须为 0–65535 的整数。');
  }
}

/* ---------- hex 工具 ---------- */
function byteHex(b) {
  var h = (b & 0xFF).toString(16).toUpperCase();
  return h.length < 2 ? '0' + h : h;
}
function wordHex(w) {
  var h = (w & 0xFFFF).toString(16).toUpperCase();
  while (h.length < 4) h = '0' + h;
  return h;
}

/* formatHex(bytes, {spaced})：spaced 默认为 true → "01 03 …"；{spaced:false} → 紧凑 "0103…"。 */
function formatHex(bytes, opts) {
  var spaced = !opts || opts.spaced !== false;
  var parts = [];
  var i;
  for (i = 0; i < bytes.length; i++) parts.push(byteHex(bytes[i]));
  return spaced ? parts.join(' ') : parts.join('');
}

/* ---------- CRC16/MODBUS：表驱动（反射型，poly 0xA001，init 0xFFFF） ---------- */
var TABLE16_A001 = (function () {
  var table = new Array(256);
  var i, j, c;
  for (i = 0; i < 256; i++) {
    c = i;
    for (j = 0; j < 8; j++) {
      c = (c & 1) ? (0xA001 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c & 0xFFFF;
  }
  return table;
})();

/* crc16Modbus(bytes:number[]) → { lo, hi, hex }；lo 为低字节（帧中先发）。 */
function crc16Modbus(bytes) {
  if (!bytes || typeof bytes.length !== 'number') fail('bytes', 'crc16Modbus 参数须为字节数组。');
  var crc = 0xFFFF;
  var i;
  for (i = 0; i < bytes.length; i++) {
    var b = bytes[i];
    if (!isUint(b) || b < 0 || b > 255) fail('bytes', '字节数组第 ' + i + ' 项超出 0–255。');
    crc = TABLE16_A001[(crc ^ b) & 0xFF] ^ (crc >>> 8);
    crc &= 0xFFFF;
  }
  var lo = crc & 0xFF, hi = (crc >>> 8) & 0xFF;
  return { lo: lo, hi: hi, hex: wordHex(crc) };
}

function withCrc(frame) {
  var c = crc16Modbus(frame);
  var out = frame.slice();
  out.push(c.lo, c.hi);
  return { bytes: out, crc: c };
}

/* ---------- 帧构建 ---------- */
function buildFrameResult(frameBytes, crc) {
  return { bytes: frameBytes, crc: crc,
    hex: formatHex(frameBytes), compact: formatHex(frameBytes, { spaced: false }) };
}

/* 01/02/03/04 读：数量 01/02 为 1–2000，03/04 为 1–125。 */
function buildReadFrame(cfg) {
  cfg = cfg || {};
  checkSlave(cfg.slaveAddr);
  checkFunction(cfg.function, READ_FUNCS);
  checkAddr(cfg.address);
  var maxQ = (cfg.function === 3 || cfg.function === 4) ? 125 : 2000;
  if (!isUint(cfg.quantity) || cfg.quantity < 1 || cfg.quantity > maxQ) {
    fail('quantity', '数量必须为 1–' + maxQ + ' 的整数（功能码 0x' + byteHex(cfg.function) + '）。');
  }
  var frame = [cfg.slaveAddr & 0xFF, cfg.function & 0xFF,
    (cfg.address >>> 8) & 0xFF, cfg.address & 0xFF,
    (cfg.quantity >>> 8) & 0xFF, cfg.quantity & 0xFF];
  var r = withCrc(frame);
  return buildFrameResult(r.bytes, r.crc);
}

/* 05 写单个线圈（value 只允许 0x0000/0xFF00）／06 写单个寄存器（value 0–65535）。 */
function buildWriteSingle(cfg) {
  cfg = cfg || {};
  checkSlave(cfg.slaveAddr);
  checkFunction(cfg.function, WRITE_SINGLE_FUNCS);
  checkAddr(cfg.address);
  if (cfg.function === 5) {
    if (cfg.value !== 0x0000 && cfg.value !== 0xFF00) {
      fail('value', '05 功能码的写入值只允许 0x0000（断开）或 0xFF00（闭合）。');
    }
  } else {
    if (!isUint(cfg.value) || cfg.value < 0 || cfg.value > 65535) {
      fail('value', '06 功能码的写入值必须为 0–65535 的整数。');
    }
  }
  var frame = [cfg.slaveAddr & 0xFF, cfg.function & 0xFF,
    (cfg.address >>> 8) & 0xFF, cfg.address & 0xFF,
    (cfg.value >>> 8) & 0xFF, cfg.value & 0xFF];
  var r = withCrc(frame);
  return buildFrameResult(r.bytes, r.crc);
}

/* 0F 写多个线圈（quantity 1–1968，dataBytes 长度须 = ceil(quantity/8)，
   自动附加字节数字段）／10 写多个寄存器（dataBytes 须为偶数长度，
   数量 = dataBytes.length/2，1–123，字节数 = 数量×2）。 */
function buildWriteMultiple(cfg) {
  cfg = cfg || {};
  checkSlave(cfg.slaveAddr);
  checkFunction(cfg.function, WRITE_MULTI_FUNCS);
  checkAddr(cfg.address);
  var data = cfg.dataBytes;
  if (!data || typeof data.length !== 'number' || data.length === 0) {
    fail('dataBytes', 'dataBytes 须为非空字节数组。');
  }
  var i;
  for (i = 0; i < data.length; i++) {
    if (!isUint(data[i]) || data[i] < 0 || data[i] > 255) {
      fail('dataBytes', 'dataBytes 第 ' + i + ' 项超出 0–255。');
    }
  }
  var frame, quantity, byteCount;
  if (cfg.function === 15) {
    if (!isUint(cfg.quantity) || cfg.quantity < 1 || cfg.quantity > 1968) {
      fail('quantity', '0F 功能码的线圈数量必须为 1–1968 的整数。');
    }
    quantity = cfg.quantity;
    byteCount = Math.ceil(quantity / 8);
    if (data.length !== byteCount) {
      fail('dataBytes', '0F 功能码：' + quantity + ' 个线圈需要 ' + byteCount + ' 字节数据，实得 ' + data.length + ' 字节。');
    }
  } else {
    if (data.length % 2 !== 0) {
      fail('dataBytes', '10 功能码：寄存器数据须为偶数长度（每寄存器 2 字节）。');
    }
    quantity = data.length / 2;
    if (quantity < 1 || quantity > 123) {
      fail('quantity', '10 功能码的寄存器数量必须为 1–123（dataBytes 每 2 字节计 1 个寄存器）。');
    }
    byteCount = data.length;
  }
  frame = [cfg.slaveAddr & 0xFF, cfg.function & 0xFF,
    (cfg.address >>> 8) & 0xFF, cfg.address & 0xFF,
    (quantity >>> 8) & 0xFF, quantity & 0xFF, byteCount & 0xFF];
  for (i = 0; i < data.length; i++) frame.push(data[i] & 0xFF);
  var r = withCrc(frame);
  var res = buildFrameResult(r.bytes, r.crc);
  res.quantity = quantity;
  res.byteCount = byteCount;
  return res;
}

/* ---------- 固定示例：slave=1、03 功能、addr=0x0000、qty=2 → 01 03 00 00 00 02 C4 0B ---------- */
function generateExample() {
  var cfg = { slaveAddr: 1, function: 3, address: 0, quantity: 2 };
  var r = buildReadFrame(cfg);
  return { config: cfg, bytes: r.bytes, crc: r.crc, hex: r.hex, compact: r.compact };
}

/* suggestExportName(kind)：'txt' → modbus-frame.txt；'json' → modbus-frame.json；其余抛错。 */
function suggestExportName(kind) {
  if (kind === 'txt') return 'modbus-frame.txt';
  if (kind === 'json') return 'modbus-frame.json';
  fail('kind', '导出类型只支持 "txt" 与 "json"，实得 ' + JSON.stringify(kind) + '。');
}

/* ---------- 功能码 / 异常码说明表 ---------- */
var FUNCTION_NAMES = {
  1: '读线圈状态（Read Coils）',
  2: '读离散输入（Read Discrete Inputs）',
  3: '读保持寄存器（Read Holding Registers）',
  4: '读输入寄存器（Read Input Registers）',
  5: '写单个线圈（Write Single Coil）',
  6: '写单个寄存器（Write Single Register）',
  15: '写多个线圈（Write Multiple Coils）',
  16: '写多个寄存器（Write Multiple Registers）'
};

var EXCEPTION_NAMES = {
  1: '非法功能码（Illegal Function）',
  2: '非法数据地址（Illegal Data Address）',
  3: '非法数据值（Illegal Data Value）',
  4: '从站设备故障（Slave Device Failure）',
  5: '确认（Acknowledge）',
  6: '从站设备忙（Slave Device Busy）'
};

/* ---------- hex 容错解析：容忍空格／换行／0x 前缀／逗号分隔 ---------- */
function parseHexInput(raw) {
  var s = String(raw == null ? '' : raw);
  s = s.replace(/0x/gi, '').replace(/[\s,;、，；|]/g, '');
  if (s === '') fail('hexStr', '请输入十六进制帧内容。');
  if (!/^[0-9a-fA-F]+$/.test(s)) fail('hexStr', '输入含非十六进制字符，请检查。');
  if (s.length % 2 !== 0) fail('hexStr', '十六进制字符数为奇数，缺半字节。');
  var bytes = [];
  var i;
  for (i = 0; i < s.length; i += 2) bytes.push(parseInt(s.slice(i, i + 2), 16));
  return bytes;
}

/* parseFrame(hexStr) → { crcOk, slaveAddr, function, fields[], rawHex,
 *   crcExpected, crcActual, isException, exceptionCode, exceptionName,
 *   functionName, note }
 * fields[] 项：{ offset, bytes(hex 串), label, note }。 */
function parseFrame(hexStr) {
  var bytes = parseHexInput(hexStr);
  if (bytes.length < 4) fail('hexStr', 'RTU 帧至少 4 字节（从站地址＋功能码＋CRC16）。');

  var slave = bytes[0], func = bytes[1];
  var body = bytes.slice(2, bytes.length - 2);
  var actualLo = bytes[bytes.length - 2], actualHi = bytes[bytes.length - 1];
  var exp = crc16Modbus(bytes.slice(0, bytes.length - 2));
  var crcOk = (exp.lo === actualLo && exp.hi === actualHi);

  var fields = [];
  var isException = (func & 0x80) === 0x80;
  var funcBase = func & 0x7F;
  var functionName = FUNCTION_NAMES[funcBase] || null;
  var exceptionCode = null, exceptionName = null, note = '';

  function pushField(offset, byteArr, label, sub) {
    fields.push({ offset: offset, bytes: formatHex(byteArr), label: label, note: sub || '' });
  }
  function wordOf(hi, lo) { return ((hi << 8) | lo) >>> 0; }

  pushField(0, [slave], '从站地址', '十进制 ' + slave);
  if (isException) {
    exceptionCode = body.length > 0 ? body[0] : null;
    exceptionName = exceptionCode != null
      ? (EXCEPTION_NAMES[exceptionCode] || '未定义异常码（保留）') : null;
    var fn = FUNCTION_NAMES[funcBase];
    pushField(1, [func], '功能码（异常响应）',
      fn ? ('原请求功能码 0x' + byteHex(funcBase) + '：' + fn) : '原请求功能码 0x' + byteHex(funcBase) + ' 未知');
    if (exceptionCode != null) {
      pushField(2, [exceptionCode], '异常码', exceptionName || '');
    } else {
      pushField(2, body, '数据区', '异常帧无异常码字节');
    }
    note = '异常响应帧：功能码最高位置 1（0x' + byteHex(func) + ' = 0x80 | 0x' + byteHex(funcBase) + '）。';
  } else if (functionName) {
    pushField(1, [func], '功能码', '0x' + byteHex(func) + '：' + functionName);
    if (func <= 4) {
      if (bytes.length === 8) {
        pushField(2, body.slice(0, 2), '寄存器起始地址', '十进制 ' + wordOf(body[0], body[1]));
        pushField(4, body.slice(2, 4), '数量', '十进制 ' + wordOf(body[2], body[3]));
        note = '读请求帧（01/02/03/04 请求固定 8 字节）。';
      } else if (bytes.length >= 5) {
        var bc = body[0];
        pushField(2, [bc], '字节数', '后续数据 ' + bc + ' 字节');
        pushField(3, body.slice(1), '数据区', body.slice(1).length + ' 字节' +
          (bc === body.slice(1).length ? '（与字节数一致）' : '（与字节数 ' + bc + ' 不一致）'));
        note = '读响应帧：字节数字段后跟寄存器/线圈数据。';
      }
    } else if (func === 5 || func === 6) {
      pushField(2, body.slice(0, 2), func === 5 ? '线圈地址' : '寄存器地址', '十进制 ' + wordOf(body[0], body[1]));
      var val = wordOf(body[2], body[3]);
      pushField(4, body.slice(2, 4), func === 5 ? '输出值' : '写入值',
        func === 5 ? (val === 0xFF00 ? '0xFF00：线圈闭合' : '0x0000：线圈断开') : '十进制 ' + val);
      note = '05/06 请求帧与正常响应回显帧格式相同。';
    } else if (func === 15 || func === 16) {
      if (bytes.length === 8) {
        pushField(2, body.slice(0, 2), '寄存器起始地址', '十进制 ' + wordOf(body[0], body[1]));
        pushField(4, body.slice(2, 4), '数量', '十进制 ' + wordOf(body[2], body[3]));
        note = '写多响应帧：从站回显起始地址与数量。';
      } else if (bytes.length >= 10) {
        pushField(2, body.slice(0, 2), '寄存器起始地址', '十进制 ' + wordOf(body[0], body[1]));
        pushField(4, body.slice(2, 4), '数量', '十进制 ' + wordOf(body[2], body[3]));
        var mbc = body[4];
        pushField(6, [mbc], '字节数', '后续数据 ' + mbc + ' 字节');
        pushField(7, body.slice(5), '数据区', body.slice(5).length + ' 字节' +
          (mbc === body.slice(5).length ? '（与字节数一致）' : '（与字节数 ' + mbc + ' 不一致）'));
        note = func === 15 ? '写多个线圈请求帧。' : '写多个寄存器请求帧。';
      } else {
        pushField(2, body, '数据区', body.length + ' 字节（长度不足，无法按请求格式拆解）');
      }
    }
  } else {
    pushField(1, [func], '功能码', '未知功能码，仅做字段切分');
    pushField(2, body, '数据区', body.length + ' 字节');
    note = '未知功能码：本工具功能码范围为 01/02/03/04/05/06/0F/10，此处仅按位置切分字段，不做语义解读。';
  }

  pushField(bytes.length - 2, [actualLo], 'CRC 低字节',
    '帧中值 0x' + byteHex(actualLo) + (crcOk ? '' : '；计算期望 0x' + byteHex(exp.lo)));
  pushField(bytes.length - 1, [actualHi], 'CRC 高字节',
    '帧中值 0x' + byteHex(actualHi) + (crcOk ? '' : '；计算期望 0x' + byteHex(exp.hi)));

  return {
    crcOk: crcOk, slaveAddr: slave, function: func, fields: fields,
    rawHex: formatHex(bytes),
    crcExpected: { lo: exp.lo, hi: exp.hi, hex: exp.hex },
    crcActual: { lo: actualLo, hi: actualHi, hex: byteHex(actualHi) + byteHex(actualLo) },
    isException: isException,
    exceptionCode: exceptionCode, exceptionName: exceptionName,
    functionName: functionName, note: note
  };
}

/* ---------- 下载文本 ---------- */
function buildFrameText(label, result) {
  var lines = [];
  lines.push(label);
  lines.push('帧（空格分隔）: ' + result.hex);
  lines.push('帧（紧凑）: ' + result.compact);
  lines.push('CRC16/MODBUS: 低字节 0x' + byteHex(result.crc.lo) + ' 高字节 0x' + byteHex(result.crc.hi) +
    '（帧中低字节在前）');
  lines.push('字节数: ' + result.bytes.length);
  return lines.join('\n');
}

function buildParseJson(parsed) {
  return JSON.stringify({
    rawHex: parsed.rawHex,
    crcOk: parsed.crcOk,
    crcExpected: '0x' + parsed.crcExpected.hex,
    crcActual: '0x' + parsed.crcActual.hex,
    slaveAddr: parsed.slaveAddr,
    function: '0x' + byteHex(parsed.function),
    functionName: parsed.functionName,
    isException: parsed.isException,
    exceptionCode: parsed.exceptionCode,
    exceptionName: parsed.exceptionName,
    note: parsed.note,
    fields: parsed.fields
  }, null, 2);
}

/* ---------- 浏览器 DOM ---------- */
function $(id) { return document.getElementById(id); }

function toast(msg) {
  var t = $('mb-toast');
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
    if (done) { toast(okMsg); } else { toast('复制失败，请手动选中结果内容复制'); }
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

var currentBuild = null;   /* { result, label } */
var currentParse = null;

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function intOf(id, radix) {
  var el = $(id);
  if (!el) return NaN;
  var s = String(el.value).replace(/^\s+|\s+$/g, '');
  if (s === '') return NaN;
  if (radix === 16) {
    if (s.slice(0, 2).toLowerCase() === '0x') s = s.slice(2);
    if (!/^[0-9a-fA-F]+$/.test(s)) return NaN;
    return parseInt(s, 16);
  }
  if (!/^\d+$/.test(s)) return NaN;
  return parseInt(s, 10);
}

function selectedFunction() {
  var el = $('mb-func');
  return el ? parseInt(el.value, 10) : NaN;
}

function toggleDataInputs() {
  var f = selectedFunction();
  var rows = ['mb-row-qty', 'mb-row-value', 'mb-row-qty15', 'mb-row-data'];
  var i;
  for (i = 0; i < rows.length; i++) {
    var r = $(rows[i]);
    if (r) r.style.display = 'none';
  }
  if (f >= 1 && f <= 4) { var q = $('mb-row-qty'); if (q) q.style.display = ''; }
  else if (f === 5 || f === 6) { var v = $('mb-row-value'); if (v) v.style.display = ''; }
  else if (f === 15) {
    var q15 = $('mb-row-qty15'); if (q15) q15.style.display = '';
    var d15 = $('mb-row-data'); if (d15) d15.style.display = '';
  }
  else if (f === 16) { var d16 = $('mb-row-data'); if (d16) d16.style.display = ''; }
  var h = $('mb-data-hint');
  if (h) {
    h.textContent = f === 15 ? '线圈数据：十六进制字节，用空格/逗号分隔；字节数须 = ceil(线圈数量/8)。'
      : f === 16 ? '寄存器数据：十六进制字节，用空格/逗号分隔；须为偶数长度，每 2 字节 = 1 个寄存器。'
      : '';
  }
}

function buildCurrent() {
  var msg = $('mb-build-msg');
  var out = $('mb-build-out');
  if (msg) msg.textContent = '';
  var slave = intOf('mb-slave', 10);
  var addr = intOf('mb-addr', 10);
  var func = selectedFunction();
  var cfg = { slaveAddr: slave, function: func, address: addr };
  try {
    var result, label;
    if (func >= 1 && func <= 4) {
      var qty = intOf('mb-qty', 10);
      if (isNaN(qty)) fail('quantity', '请填写数量。');
      cfg.quantity = qty;
      result = buildReadFrame(cfg);
      label = '读请求帧（功能码 0x' + byteHex(func) + '）';
    } else if (func === 5 || func === 6) {
      var val = intOf('mb-value', 16);
      if (isNaN(val)) fail('value', '请填写写入值（十六进制，如 FF00）。');
      cfg.value = val;
      result = buildWriteSingle(cfg);
      label = func === 5 ? '写单个线圈（05）' : '写单个寄存器（06）';
    } else if (func === 15 || func === 16) {
      var raw = $('mb-data') ? $('mb-data').value : '';
      var bytes = parseHexInput(raw === '' ? 'fail:' : raw);
      cfg.dataBytes = bytes;
      if (func === 15) {
        var q15 = intOf('mb-qty15', 10);
        if (isNaN(q15)) fail('quantity', '请填写线圈数量。');
        cfg.quantity = q15;
      }
      result = buildWriteMultiple(cfg);
      label = func === 15 ? '写多个线圈（0F）' : '写多个寄存器（10）';
    } else {
      fail('function', '请选择功能码。');
    }
    currentBuild = { result: result, label: label };
    renderBuild(result, label);
  } catch (e) {
    currentBuild = null;
    if (out) out.style.display = 'none';
    if (msg) msg.textContent = '参数错误（' + (e.field || '?') + '）：' + e.message;
  }
}

function renderFields(fields, tbody) {
  var html = '';
  var i, f;
  for (i = 0; i < fields.length; i++) {
    f = fields[i];
    html += '<tr><td class="mb-mono">' + esc(f.offset) + '</td>' +
      '<td class="mb-mono mb-bytes">' + esc(f.bytes) + '</td>' +
      '<td>' + esc(f.label) + '</td><td>' + esc(f.note) + '</td></tr>';
  }
  tbody.innerHTML = html;
}

function frameToFields(result, label) {
  /* 把构建结果也拆成 fields 表（逐字节说明），供下载 JSON 复用。 */
  var bytes = result.bytes;
  var fields = [
    { offset: 0, bytes: byteHex(bytes[0]), label: '从站地址', note: '十进制 ' + bytes[0] },
    { offset: 1, bytes: byteHex(bytes[1]), label: '功能码', note: '0x' + byteHex(bytes[1]) + '：' + (FUNCTION_NAMES[bytes[1]] || '未知') }
  ];
  var i;
  for (i = 2; i < bytes.length - 2; i++) {
    fields.push({ offset: i, bytes: byteHex(bytes[i]), label: '数据字节 ' + (i - 1), note: '' });
  }
  fields.push({ offset: bytes.length - 2, bytes: byteHex(bytes[bytes.length - 2]), label: 'CRC 低字节', note: '低字节在前' });
  fields.push({ offset: bytes.length - 1, bytes: byteHex(bytes[bytes.length - 1]), label: 'CRC 高字节', note: '' });
  return { rawHex: result.hex, crcOk: true, slaveAddr: bytes[0],
    function: '0x' + byteHex(bytes[1]), functionName: FUNCTION_NAMES[bytes[1]] || null,
    isException: false, exceptionCode: null, exceptionName: null,
    note: label + '（本地组装，CRC 已自动计算）', fields: fields };
}

function renderBuild(result, label) {
  var out = $('mb-build-out');
  if (!out) return;
  out.style.display = '';
  var sp = $('mb-frame-spaced');
  var cp = $('mb-frame-compact');
  var crc = $('mb-crc-note');
  if (sp) sp.textContent = result.hex;
  if (cp) cp.textContent = result.compact;
  if (crc) crc.textContent = 'CRC16/MODBUS：低字节 0x' + byteHex(result.crc.lo) +
    '　高字节 0x' + byteHex(result.crc.hi) + '（帧中低字节在前：…' + byteHex(result.crc.lo) + ' ' + byteHex(result.crc.hi) + '）';
  var tbody = $('mb-build-fields');
  if (tbody) {
    var parsed = frameToFields(result, label);
    renderFields(parsed.fields, tbody);
    var l = $('mb-build-label');
    if (l) l.textContent = label + ' · 共 ' + result.bytes.length + ' 字节';
  }
}

function parseCurrent() {
  var msg = $('mb-parse-msg');
  var out = $('mb-parse-out');
  var badge = $('mb-crc-badge');
  if (msg) msg.textContent = '';
  var raw = $('mb-hex') ? $('mb-hex').value : '';
  try {
    var p = parseFrame(raw);
    currentParse = p;
    if (out) out.style.display = '';
    if (badge) {
      badge.textContent = p.crcOk ? '✓ CRC 校验通过' : '✗ CRC 校验失败';
      badge.className = 'mb-badge ' + (p.crcOk ? 'mb-ok' : 'mb-bad');
    }
    var info = $('mb-parse-info');
    if (info) {
      info.textContent = p.crcOk
        ? 'CRC 一致（期望 0x' + p.crcExpected.hex + ' = 实际帧中值）。'
        : 'CRC 不一致：按帧前部字节算出期望 0x' + p.crcExpected.hex +
          '（低字节 0x' + byteHex(p.crcExpected.lo) + ' 高字节 0x' + byteHex(p.crcExpected.hi) + '），' +
          '帧中实际为 0x' + p.crcActual.hex + '。';
    }
    var tbody = $('mb-parse-fields');
    if (tbody) renderFields(p.fields, tbody);
    var note = $('mb-parse-note');
    if (note) {
      var txt = p.note;
      if (p.isException && p.exceptionName) txt += ' 异常码 0x' + byteHex(p.exceptionCode) + '：' + p.exceptionName + '。';
      note.textContent = txt;
    }
  } catch (e) {
    currentParse = null;
    if (out) out.style.display = 'none';
    if (badge) { badge.textContent = ''; badge.className = 'mb-badge'; }
    if (msg) msg.textContent = '解析失败（' + (e.field || '?') + '）：' + e.message;
  }
}

function switchTab(mode) {
  var b = $('mb-tab-build'), p = $('mb-tab-parse');
  var pb = $('mb-panel-build'), pp = $('mb-panel-parse');
  if (b) b.className = 'mb-tab' + (mode === 'build' ? ' mb-tab-active' : '');
  if (p) p.className = 'mb-tab' + (mode === 'parse' ? ' mb-tab-active' : '');
  if (pb) pb.style.display = mode === 'build' ? '' : 'none';
  if (pp) pp.style.display = mode === 'parse' ? '' : 'none';
}

function init() {
  var f = $('mb-func');
  if (f) f.addEventListener('change', toggleDataInputs);
  var btn = $('mb-build');
  if (btn) btn.addEventListener('click', buildCurrent);
  var ex = $('mb-example');
  if (ex) ex.addEventListener('click', function () {
    switchTab('build');
    var exCfg = generateExample().config;
    var s = $('mb-slave'); if (s) s.value = String(exCfg.slaveAddr);
    var fn = $('mb-func'); if (fn) { fn.value = String(exCfg.function); toggleDataInputs(); }
    var a = $('mb-addr'); if (a) a.value = String(exCfg.address);
    var q = $('mb-qty'); if (q) q.value = String(exCfg.quantity);
    buildCurrent();
    var hex = $('mb-hex');
    if (hex) hex.value = generateExample().hex;
  });
  var pb = $('mb-parse-btn');
  if (pb) pb.addEventListener('click', parseCurrent);
  var tb = $('mb-tab-build');
  if (tb) tb.addEventListener('click', function () { switchTab('build'); });
  var tp = $('mb-tab-parse');
  if (tp) tp.addEventListener('click', function () { switchTab('parse'); });
  var c1 = $('mb-copy-spaced');
  if (c1) c1.addEventListener('click', function () {
    if (currentBuild) copyText(currentBuild.result.hex, '已复制请求帧（空格分隔）');
  });
  var c2 = $('mb-copy-compact');
  if (c2) c2.addEventListener('click', function () {
    if (currentBuild) copyText(currentBuild.result.compact, '已复制请求帧（紧凑格式）');
  });
  var dl = $('mb-download-txt');
  if (dl) dl.addEventListener('click', function () {
    if (!currentBuild) return;
    downloadText(suggestExportName('txt'), buildFrameText(currentBuild.label, currentBuild.result));
    toast('已下载 ' + suggestExportName('txt'));
  });
  function downloadFieldsJson() {
    var src = currentParse || (currentBuild && frameToFields(currentBuild.result, currentBuild.label));
    if (!src) return;
    var payload = currentParse ? buildParseJson(currentParse) : JSON.stringify(src, null, 2);
    downloadText(suggestExportName('json'), payload);
    toast('已下载 ' + suggestExportName('json'));
  }
  var dj = $('mb-download-json');
  if (dj) dj.addEventListener('click', downloadFieldsJson);
  var dj2 = $('mb-download-json2');
  if (dj2) dj2.addEventListener('click', downloadFieldsJson);
  toggleDataInputs();
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
    crc16Modbus: crc16Modbus,
    buildReadFrame: buildReadFrame,
    buildWriteSingle: buildWriteSingle,
    buildWriteMultiple: buildWriteMultiple,
    parseFrame: parseFrame,
    formatHex: formatHex,
    generateExample: generateExample,
    suggestExportName: suggestExportName,
    parseHexInput: parseHexInput,
    buildFrameText: buildFrameText,
    buildParseJson: buildParseJson,
    FUNCTION_NAMES: FUNCTION_NAMES,
    EXCEPTION_NAMES: EXCEPTION_NAMES
  };
}
})();
