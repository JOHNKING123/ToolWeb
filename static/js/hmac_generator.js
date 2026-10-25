/* HMAC 生成器（hmac_generator）- 纯前端本地计算
 * 计算口径：密钥三种输入口径（文本按 UTF-8 编码 / 十六进制按字节解析 /
 * Base64 解码为字节）＋消息文本按 UTF-8 编码，经 WebCrypto
 * crypto.subtle.sign('HMAC', key, message) 本地计算，零上传。
 * HMAC 是消息认证码，不是加密：签名本身不保密消息，密钥泄露即任何人
 * 可伪造签名。本工具仅供调试，勿粘贴真实生产密钥。
 * WebCrypto 需安全上下文（HTTPS 或 localhost）；/tool-web 为 HTTPS，满足条件。
 * 本文件不发起任何 fetch / XHR，不加载任何 CDN 资源。
 * 纯函数经 module.exports 暴露供 node 测试；浏览器里走 DOM。 */
(function () {
'use strict';

/* ---------- 算法表 ---------- */
var ALGORITHMS = {
  'SHA-256': { label: 'HMAC-SHA256', prefix: 'sha256=', hexLen: 64 },
  'SHA-384': { label: 'HMAC-SHA384', prefix: 'sha384=', hexLen: 96 },
  'SHA-512': { label: 'HMAC-SHA512', prefix: 'sha512=', hexLen: 128 }
};
var ALGORITHM_ORDER = ['SHA-256', 'SHA-384', 'SHA-512'];

function algorithmInfo(hashName) {
  var info = ALGORITHMS[hashName];
  if (!info) throw new Error('不支持的算法：' + hashName);
  return info;
}

/* ---------- 编码转换 ---------- */
function bytesToHex(bytes) {
  var out = '';
  for (var i = 0; i < bytes.length; i++) {
    var h = bytes[i].toString(16);
    out += (h.length === 1 ? '0' + h : h);
  }
  return out;
}

function hexToBytes(hex) {
  var clean = String(hex).replace(/\s+/g, '');
  if (clean.length === 0) throw new Error('十六进制密钥不能为空');
  if (clean.length % 2 !== 0) throw new Error('十六进制密钥长度必须为偶数（每字节两位），当前为 ' + clean.length + ' 位');
  if (!/^[0-9a-fA-F]+$/.test(clean)) throw new Error('十六进制密钥包含非法字符，只允许 0-9、a-f、A-F');
  var bytes = new Uint8Array(clean.length / 2);
  for (var i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return bytes;
}

function bytesToBase64(bytes) {
  var binary = '';
  for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  if (typeof Buffer !== 'undefined') return Buffer.from(binary, 'latin1').toString('base64');
  return btoa(binary);
}

function base64ToBytes(b64) {
  var clean = String(b64).replace(/\s+/g, '');
  if (clean.length === 0) throw new Error('Base64 密钥不能为空');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(clean) || clean.length % 4 !== 0) {
    throw new Error('Base64 密钥格式不正确（只允许 A-Z、a-z、0-9、+、/ 与末尾最多两个 =，长度须为 4 的倍数）');
  }
  var binary;
  if (typeof Buffer !== 'undefined') {
    var buf = Buffer.from(clean, 'base64');
    // 严格校验：重编码须与输入一致，否则说明含非法填充或截断
    if (buf.toString('base64') !== clean) throw new Error('Base64 密钥格式不正确（填充或字符非法）');
    return new Uint8Array(buf);
  }
  try { binary = atob(clean); } catch (e) { throw new Error('Base64 密钥格式不正确（解码失败）'); }
  var bytes = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function hexToBase64(hex) { return bytesToBase64(hexToBytes(hex)); }
function base64ToHex(b64) { return bytesToHex(base64ToBytes(b64)); }

function textToBytes(text) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(String(text));
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(String(text), 'utf8'));
  throw new Error('当前环境不支持 UTF-8 编码');
}

/* ---------- 密钥口径解析 ---------- */
/* mode: 'text' | 'hex' | 'base64'。空密钥一律中文报错，不静默输出。 */
function parseKey(input, mode) {
  var raw = input == null ? '' : String(input);
  if (mode === 'text') {
    if (raw.length === 0) throw new Error('密钥不能为空，请输入密钥（WebCrypto 不接受空密钥）');
    return textToBytes(raw);
  }
  if (mode === 'hex') {
    if (raw.replace(/\s+/g, '').length === 0) throw new Error('密钥不能为空，请输入十六进制密钥（WebCrypto 不接受空密钥）');
    return hexToBytes(raw);
  }
  if (mode === 'base64') {
    if (raw.replace(/\s+/g, '').length === 0) throw new Error('密钥不能为空，请输入 Base64 密钥（WebCrypto 不接受空密钥）');
    return base64ToBytes(raw);
  }
  throw new Error('不支持的密钥口径：' + mode);
}

function keyModeLabel(mode) {
  if (mode === 'text') return '文本（UTF-8）';
  if (mode === 'hex') return '十六进制';
  if (mode === 'base64') return 'Base64';
  return mode;
}

/* ---------- HMAC 计算 ---------- */
function getSubtle() {
  var c = null;
  if (typeof crypto !== 'undefined' && crypto.subtle) c = crypto;
  else if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) c = globalThis.crypto;
  if (!c || !c.subtle) throw new Error('当前页面不是安全上下文（需 HTTPS 或 localhost），WebCrypto 不可用');
  return c.subtle;
}

/* 返回 Promise<Uint8Array>。空密钥由 parseKey 前置拦截，这里再兜底一次。 */
async function computeHmac(keyBytes, message, hashName) {
  if (!keyBytes || keyBytes.length === 0) throw new Error('密钥不能为空，请输入密钥（WebCrypto 不接受空密钥）');
  var subtle = getSubtle();
  var key = await subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: { name: hashName } }, false, ['sign']);
  var sig = await subtle.sign('HMAC', key, textToBytes(message == null ? '' : message));
  return new Uint8Array(sig);
}

/* 便捷入口：口径＋算法一次算出双输出。返回 Promise<{hex, base64, prefixed, prefix, hexLen}> */
async function computeOutputs(keyInput, keyMode, message, hashName) {
  var info = algorithmInfo(hashName);
  var keyBytes = parseKey(keyInput, keyMode);
  var sig = await computeHmac(keyBytes, message, hashName);
  var hex = bytesToHex(sig);
  return { hex: hex, base64: bytesToBase64(sig), prefixed: info.prefix + hex, prefix: info.prefix, hexLen: info.hexLen };
}

/* ---------- 签名比对 ---------- */
/* 剥离 sha256=/sha384=/sha512= 前缀（大小写不敏感），返回 {stripped, prefix}。 */
function stripPrefix(sig) {
  var raw = String(sig == null ? '' : sig).replace(/^\s+|\s+$/g, '');
  var m = raw.match(/^sha(256|384|512)=/i);
  if (m) return { stripped: raw.slice(m[0].length), prefix: 'sha' + m[1] + '=' };
  return { stripped: raw, prefix: null };
}

/* 期望签名归一化：剥离前缀后，十六进制（大小写不敏感→小写）或 Base64→十六进制。
 * 非法输入抛中文错误，不静默判不一致。返回 {hex, format, prefix}。 */
function normalizeExpected(sig) {
  var p = stripPrefix(sig);
  var s = p.stripped.replace(/\s+/g, '');
  if (s.length === 0) throw new Error('期望签名不能为空');
  if (/^[0-9a-fA-F]+$/.test(s)) {
    if (s.length % 2 !== 0) throw new Error('期望签名（十六进制）长度必须为偶数');
    return { hex: s.toLowerCase(), format: 'hex', prefix: p.prefix };
  }
  // 非纯十六进制时按 Base64 解析；Base64 字母表含 +/ 与 =，十六进制已在上支处理
  var bytes = base64ToBytes(s);
  return { hex: bytesToHex(bytes), format: 'base64', prefix: p.prefix };
}

/* 二值比对：只给一致/不一致，不猜原因、不自动修正期望签名。 */
function compareSignatures(actualHex, expectedSig) {
  var norm = normalizeExpected(expectedSig);
  var actual = String(actualHex).replace(/\s+/g, '').toLowerCase();
  return { match: actual === norm.hex, actualHex: actual, expectedHex: norm.hex, expectedFormat: norm.format, prefix: norm.prefix };
}

/* ---------- 示例 ---------- */
var EXAMPLES = {
  webhook: {
    key: 'whsec_test_secret_123',
    keyMode: 'text',
    message: '{\n  "event": "order.paid",\n  "order_id": "202610250001",\n  "amount": 29900\n}',
    hash: 'SHA-256'
  },
  rfc4231: {
    key: '0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b',
    keyMode: 'hex',
    message: 'Hi There',
    hash: 'SHA-256'
  }
};

/* ---------- 浏览器 DOM ---------- */
function copyText(text, okMsg, failEl) {
  function fallback() {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok) { if (failEl) failEl.textContent = okMsg; return; }
    } catch (e) { /* fall through */ }
    if (failEl) failEl.textContent = '复制失败：浏览器未允许剪贴板访问，请手动全选上方输出文本复制。';
  }
  if (navigator.clipboard && window.isSecureContext !== false) {
    navigator.clipboard.writeText(text).then(function () {
      if (failEl) failEl.textContent = okMsg;
    }).catch(fallback);
  } else {
    fallback();
  }
}

function bindUI() {
  var keyEl = document.getElementById('hmg-key');
  var msgEl = document.getElementById('hmg-message');
  var algoEl = document.getElementById('hmg-algo');
  var errEl = document.getElementById('hmg-error');
  var hexEl = document.getElementById('hmg-hex');
  var b64El = document.getElementById('hmg-base64');
  var modeNote = document.getElementById('hmg-mode-note');
  var prefixBtn = document.getElementById('hmg-copy-prefixed');
  var expEl = document.getElementById('hmg-expected');
  var cmpEl = document.getElementById('hmg-compare-result');
  var copyMsg = document.getElementById('hmg-copy-msg');
  if (!keyEl || !msgEl || !algoEl) return;

  var last = null; // {hex, base64, prefixed, prefix}

  function currentMode() {
    var checked = document.querySelector('input[name="hmg-key-mode"]:checked');
    return checked ? checked.value : 'text';
  }

  async function recompute() {
    var mode = currentMode();
    if (modeNote) modeNote.textContent = '当前密钥口径：' + keyModeLabel(mode) + '；消息文本按 UTF-8 编码。';
    if (prefixBtn) prefixBtn.textContent = '复制带 ' + algorithmInfo(algoEl.value).prefix + ' 前缀';
    try {
      last = await computeOutputs(keyEl.value, mode, msgEl.value, algoEl.value);
      if (errEl) errEl.textContent = '';
      if (hexEl) hexEl.textContent = last.hex;
      if (b64El) b64El.textContent = last.base64;
    } catch (e) {
      last = null;
      if (errEl) errEl.textContent = e.message || String(e);
      if (hexEl) hexEl.textContent = '—';
      if (b64El) b64El.textContent = '—';
    }
    renderCompare();
  }

  function renderCompare() {
    if (!cmpEl) return;
    var exp = expEl ? expEl.value : '';
    if (!exp.replace(/\s+/g, '')) { cmpEl.innerHTML = '<p class="hmg-note">在上方粘贴期望签名后，这里给出一致／不一致结论。</p>'; return; }
    if (!last) { cmpEl.innerHTML = '<p class="hmg-note">请先得到有效签名（上方无报错），再做比对。</p>'; return; }
    try {
      var r = compareSignatures(last.hex, exp);
      var cls = r.match ? 'good' : 'bad';
      var word = r.match ? '一致' : '不一致';
      cmpEl.innerHTML = '<div class="hmg-verdict ' + cls + '">比对结论：' + word + '</div>' +
        '<p>当前签名（归一化十六进制）：<code>' + last.hex + '</code></p>' +
        '<p>期望签名（归一化十六进制，口径：' + (r.expectedFormat === 'hex' ? '十六进制' : 'Base64') +
        (r.prefix ? '，已剥离前缀 ' + r.prefix : '') + '）：<code>' + r.expectedHex + '</code></p>' +
        (r.match ? '' : '<p class="hmg-note">不一致时不猜测原因、不自动修正期望签名，请核对密钥口径、算法与消息原文是否完全一致。</p>');
    } catch (e) {
      cmpEl.innerHTML = '<p class="hmg-note" style="color:#b91c1c;">期望签名无法解析：' + (e.message || String(e)) + '</p>';
    }
  }

  function loadExample(name) {
    var ex = EXAMPLES[name];
    if (!ex) return;
    keyEl.value = ex.key;
    var radio = document.querySelector('input[name="hmg-key-mode"][value="' + ex.keyMode + '"]');
    if (radio) radio.checked = true;
    msgEl.value = ex.message;
    algoEl.value = ex.hash;
    recompute();
  }

  keyEl.addEventListener('input', recompute);
  msgEl.addEventListener('input', recompute);
  algoEl.addEventListener('change', recompute);
  document.querySelectorAll('input[name="hmg-key-mode"]').forEach(function (r) {
    r.addEventListener('change', recompute);
  });
  if (expEl) expEl.addEventListener('input', renderCompare);

  var btn = function (id, fn) { var el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
  btn('hmg-recompute', recompute);
  btn('hmg-copy-hex', function () { if (last) copyText(last.hex, '十六进制签名已复制。', copyMsg); });
  btn('hmg-copy-base64', function () { if (last) copyText(last.base64, 'Base64 签名已复制。', copyMsg); });
  btn('hmg-copy-prefixed', function () { if (last) copyText(last.prefixed, '带前缀签名已复制。', copyMsg); });
  btn('hmg-ex-webhook', function () { loadExample('webhook'); });
  btn('hmg-ex-rfc', function () { loadExample('rfc4231'); });
  btn('hmg-reset', function () {
    keyEl.value = ''; msgEl.value = '';
    var radio = document.querySelector('input[name="hmg-key-mode"][value="text"]');
    if (radio) radio.checked = true;
    algoEl.value = 'SHA-256';
    if (expEl) expEl.value = '';
    if (copyMsg) copyMsg.textContent = '';
    recompute();
  });

  recompute();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindUI);
  else bindUI();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ALGORITHMS: ALGORITHMS, ALGORITHM_ORDER: ALGORITHM_ORDER, algorithmInfo: algorithmInfo,
    bytesToHex: bytesToHex, hexToBytes: hexToBytes, bytesToBase64: bytesToBase64, base64ToBytes: base64ToBytes,
    hexToBase64: hexToBase64, base64ToHex: base64ToHex, textToBytes: textToBytes,
    parseKey: parseKey, keyModeLabel: keyModeLabel,
    computeHmac: computeHmac, computeOutputs: computeOutputs,
    stripPrefix: stripPrefix, normalizeExpected: normalizeExpected, compareSignatures: compareSignatures,
    EXAMPLES: EXAMPLES
  };
} else if (typeof window !== 'undefined') {
  window.HmacGenerator = {
    ALGORITHMS: ALGORITHMS, computeOutputs: computeOutputs, compareSignatures: compareSignatures
  };
}
})();
