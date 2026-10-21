/* URL 即文档 · 文本分享链接生成器（url_note_share）- 纯前端引擎
* 功能：
* 1. 编辑区输入文本（可选 Markdown 渲染预览）-> DEFLATE 压缩（原生 CompressionStream）
*    + base64url -> URL fragment 生成分享链接，一键复制
* 2. 打开链接即按 fragment 解压解码渲染原文（文本/Markdown 双模式）
* 3. 可选 WebCrypto AES-GCM 口令加密（盐+IV 随 fragment 走，服务端永远看不到密钥），
*    输口令解密、错误口令报错
* 4. 压缩后 > 8KB 的长文本给出长度警告
* 零上传：全程零 fetch/XHR，Network 面板可验证（除页面自身静态资源外无任何请求）。
* 纯函数全部经 module.exports 暴露，node tests/url_note_share.test.js 自测；浏览器内 init 挂 DOMContentLoaded。
*/
(function () {
'use strict';

/* ================= 常量与协议 =================
* fragment 格式（永远只出现在 # 后，浏览器不会把 fragment 发给服务器）：
*   #u1,<模式>,<payload>
*   #u1,<模式>,E,<payload>        （E = AES-GCM 口令加密）
* 模式：t = 纯文本，m = Markdown
* payload(明文)：base64url(deflate-raw(utf8(原文)))
* payload(加密)：base64url(0x01 | salt(16) | iv(12) | aes-gcm-256 密文)
*   其中加密前先 deflate-raw(原文) 再加密；密钥 = PBKDF2-SHA256(口令, salt, 100000 次, 256bit)
*/
var FRAG_PREFIX = 'u1';
var MODE_TEXT = 't';
var MODE_MD = 'm';
var ENC_VERSION = 1;
var SALT_LEN = 16;
var IV_LEN = 12;
var PBKDF2_ITER = 100000;
/** 压缩后超过此字节数即判定为长文本，给出长度警告 */
var WARN_COMPRESSED_BYTES = 8192;

/* ================= 基础工具（纯函数） ================= */

function utf8Encode(str) {
  return new TextEncoder().encode(String(str));
}

function utf8Decode(bytes) {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

function btoaFn() {
  if (typeof btoa !== 'undefined') return btoa;
  if (typeof Buffer !== 'undefined') {
    return function (bin) { return Buffer.from(bin, 'binary').toString('base64'); };
  }
  throw new Error('当前环境不支持 base64 编码');
}

function atobFn() {
  if (typeof atob !== 'undefined') return atob;
  if (typeof Buffer !== 'undefined') {
    return function (b64) { return Buffer.from(b64, 'base64').toString('binary'); };
  }
  throw new Error('当前环境不支持 base64 解码');
}

/** Uint8Array -> base64url（无填充），分块避免大字符串爆栈 */
function b64urlEncode(bytes) {
  var b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  var bin = '';
  var CHUNK = 0x8000;
  var enc = btoaFn();
  for (var i = 0; i < b.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, b.subarray(i, i + CHUNK));
  }
  var s = enc(bin);
  return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/** base64url -> Uint8Array；非法字符抛错 */
function b64urlDecode(str) {
  var s = String(str);
  if (!/^[A-Za-z0-9\-_]*$/.test(s)) throw new Error('非法 base64url 字符');
  var b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  var pad = b64.length % 4;
  if (pad === 1) throw new Error('base64url 长度非法');
  if (pad) b64 += '===='.slice(pad);
  var bin = atobFn()(b64);
  var out = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xff;
  return out;
}

function concatBytes() {
  var total = 0, i;
  for (i = 0; i < arguments.length; i++) total += arguments[i].length;
  var out = new Uint8Array(total);
  var off = 0;
  for (i = 0; i < arguments.length; i++) { out.set(arguments[i], off); off += arguments[i].length; }
  return out;
}

/** DEFLATE 压缩（原生 CompressionStream，deflate-raw 无 zlib 头更省字节） */
async function deflateRaw(bytes) {
  if (typeof CompressionStream === 'undefined') throw new Error('当前浏览器不支持 CompressionStream');
  var cs = new CompressionStream('deflate-raw');
  var stream = new Blob([bytes]).stream().pipeThrough(cs);
  var buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

/** DEFLATE 解压 */
async function inflateRaw(bytes) {
  if (typeof DecompressionStream === 'undefined') throw new Error('当前浏览器不支持 DecompressionStream');
  var ds = new DecompressionStream('deflate-raw');
  var stream = new Blob([bytes]).stream().pipeThrough(ds);
  var buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

function getSubtle() {
  var c = (typeof crypto !== 'undefined') ? crypto : (typeof globalThis !== 'undefined' ? globalThis.crypto : undefined);
  if (c && c.subtle) return c.subtle;
  throw new Error('当前环境不支持 WebCrypto（需要 HTTPS 或 localhost）');
}

function getRandomValues(n) {
  var c = (typeof crypto !== 'undefined') ? crypto : (typeof globalThis !== 'undefined' ? globalThis.crypto : undefined);
  if (!c || !c.getRandomValues) throw new Error('当前环境不支持安全随机数');
  var out = new Uint8Array(n);
  c.getRandomValues(out);
  return out;
}

async function deriveKey(password, salt) {
  var subtle = getSubtle();
  var base = await subtle.importKey('raw', utf8Encode(password), { name: 'PBKDF2' }, false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', salt: salt, iterations: PBKDF2_ITER, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** 口令加密：明文先压缩再加密，返回 0x01|salt|iv|密文 */
async function encryptBlob(plainBytes, password) {
  if (!password) throw new Error('口令不能为空');
  var compressed = await deflateRaw(plainBytes);
  var salt = getRandomValues(SALT_LEN);
  var iv = getRandomValues(IV_LEN);
  var key = await deriveKey(password, salt);
  var ct = new Uint8Array(await getSubtle().encrypt({ name: 'AES-GCM', iv: iv }, key, compressed));
  return concatBytes(new Uint8Array([ENC_VERSION]), salt, iv, ct);
}

/** 口令解密：失败（口令错/数据损坏）抛错 */
async function decryptBlob(blob, password) {
  if (!password) throw new Error('口令不能为空');
  var b = blob instanceof Uint8Array ? blob : new Uint8Array(blob);
  if (b.length < 1 + SALT_LEN + IV_LEN + 16) throw new Error('加密数据损坏');
  if (b[0] !== ENC_VERSION) throw new Error('不支持的加密版本');
  var salt = b.slice(1, 1 + SALT_LEN);
  var iv = b.slice(1 + SALT_LEN, 1 + SALT_LEN + IV_LEN);
  var ct = b.slice(1 + SALT_LEN + IV_LEN);
  var key = await deriveKey(password, salt);
  var plain;
  try {
    plain = new Uint8Array(await getSubtle().decrypt({ name: 'AES-GCM', iv: iv }, key, ct));
  } catch (e) {
    throw new Error('口令错误或链接数据已损坏');
  }
  return inflateRaw(plain);
}

/* ================= fragment 编解码（纯函数 + 异步编解码） ================= */

/** 压缩后字节数是否触发长文本警告 */
function isTooLong(compressedBytes) {
  return compressedBytes > WARN_COMPRESSED_BYTES;
}

/**
* 生成分享 fragment（含前导 #）。
* opts: {text, markdown:boolean, password?:string}
* 返回 Promise<{fragment, compressedBytes, payloadChars, warn}>
*/
async function encodeNote(opts) {
  var text = String(opts && opts.text != null ? opts.text : '');
  var md = !!(opts && opts.markdown);
  var password = opts && opts.password ? String(opts.password) : '';
  var raw = utf8Encode(text);
  var payload, compressedBytes;
  var encrypted = false;
  if (password) {
    payload = await encryptBlob(raw, password);
    encrypted = true;
    // 压缩后体积取"解密再压缩"的等价值：用密文前的压缩长度做警告更准确
    compressedBytes = (await deflateRaw(raw)).length;
  } else {
    payload = await deflateRaw(raw);
    compressedBytes = payload.length;
  }
  var frag = '#' + FRAG_PREFIX + ',' + (md ? MODE_MD : MODE_TEXT) +
    (encrypted ? ',E' : '') + ',' + b64urlEncode(payload);
  return {
    fragment: frag,
    compressedBytes: compressedBytes,
    payloadChars: frag.length - 1,
    warn: isTooLong(compressedBytes)
  };
}

/**
* 解析 location.hash（可带或不带前导 #）。
* 返回 {ok:true, markdown, encrypted, payload:Uint8Array} 或 {ok:false, error}
*/
function parseFragment(hash) {
  var h = String(hash || '');
  if (h.charAt(0) === '#') h = h.slice(1);
  if (!h) return { ok: false, error: '链接中没有数据（fragment 为空）' };
  var parts = h.split(',');
  if (parts[0] !== FRAG_PREFIX) return { ok: false, error: '不是本工具生成的分享链接（版本标识不匹配）' };
  if (parts.length < 3 || parts.length > 4) return { ok: false, error: '分享链接格式损坏' };
  var mode = parts[1];
  if (mode !== MODE_TEXT && mode !== MODE_MD) return { ok: false, error: '分享链接格式损坏（未知内容模式）' };
  var idx = 2, encrypted = false;
  if (parts[idx] === 'E') { encrypted = true; idx++; }
  if (idx >= parts.length || !parts[idx]) return { ok: false, error: '分享链接数据缺失' };
  var payload;
  try { payload = b64urlDecode(parts[idx]); }
  catch (e) { return { ok: false, error: '分享链接数据损坏（base64 解码失败）' }; }
  if (payload.length === 0) return { ok: false, error: '分享链接数据为空' };
  return { ok: true, markdown: mode === MODE_MD, encrypted: encrypted, payload: payload };
}

/**
* 按解析结果解码出原文。parsed 来自 parseFragment；加密模式需传 password。
* 返回 Promise<{text}>
*/
async function decodeNote(parsed, password) {
  if (!parsed || !parsed.ok) throw new Error((parsed && parsed.error) || '链接解析失败');
  var raw;
  if (parsed.encrypted) {
    raw = await decryptBlob(parsed.payload, password || '');
  } else {
    var decomp;
    try { decomp = await inflateRaw(parsed.payload); }
    catch (e) { throw new Error('分享链接数据损坏（解压失败）'); }
    raw = decomp;
  }
  return { text: utf8Decode(raw) };
}

/* ================= 轻量 Markdown 渲染（纯函数，XSS 安全） ================= */

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* 链接/图片 URL 协议过滤：拦截 javascript:/vbscript:/data:(非图片) */
function sanitizeUrl(u, allowDataImage) {
  var s = String(u).trim();
  if (/^[\s\u0000-\u001f]*javascript:/i.test(s)) return '#';
  if (/^[\s\u0000-\u001f]*vbscript:/i.test(s)) return '#';
  if (/^[\s\u0000-\u001f]*data:/i.test(s)) {
    return (allowDataImage && /^data:image\//i.test(s)) ? s : '#';
  }
  return s;
}

/* 行内渲染：先整体转义，再把受保护的 code span 占位、处理加粗/斜体/删除线/链接 */
function renderInline(src) {
  var s = escapeHtml(src);
  // 行内代码先占位保护
  var codes = [];
  s = s.replace(/`([^`\n]+)`/g, function (m, c) {
    codes.push('<code>' + c + '</code>');
    return '\u0000' + (codes.length - 1) + '\u0000';
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
       .replace(/__([^_]+)__/g, '<strong>$1</strong>')
       .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
       .replace(/_([^_\n]+)_/g, '<em>$1</em>')
       .replace(/~~([^~]+)~~/g, '<del>$1</del>');
  // 图片（允许 data:image）
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, function (m, alt, url) {
    return '<img src="' + escapeHtml(sanitizeUrl(url, true)) + '" alt="' + alt + '">';
  });
  // 链接
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, function (m, text, url) {
    var safe = sanitizeUrl(url, false);
    var rel = /^https?:\/\//i.test(safe) ? ' rel="noopener noreferrer" target="_blank"' : '';
    return '<a href="' + escapeHtml(safe) + '"' + rel + '>' + text + '</a>';
  });
  // 自动链接
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<]+)/g, '$1<a href="$2" rel="noopener noreferrer" target="_blank">$2</a>');
  // 恢复 code 占位
  s = s.replace(/\u0000(\d+)\u0000/g, function (m, i) { return codes[+i]; });
  return s;
}

function isTableSep(line) {
  return /^\|?[\s:|-]+\|?[\s:|-]*$/.test(line) && /-/.test(line) && line.indexOf('|') !== -1;
}

function splitRow(line) {
  var s = line.trim();
  if (s.charAt(0) === '|') s = s.slice(1);
  if (s.charAt(s.length - 1) === '|') s = s.slice(0, -1);
  return s.split('|').map(function (c) { return c.trim(); });
}

/** Markdown -> HTML（块级：标题/代码围栏/表格/引用/列表/hr/段落） */
function renderMarkdown(src) {
  var lines = String(src).replace(/\r\n?/g, '\n').split('\n');
  var html = [];
  var i = 0, n = lines.length;

  function flushList() { /* 由调用方直接拼装 */ }

  while (i < n) {
    var line = lines[i];

    // 代码围栏
    var fence = line.match(/^\s*```(\S*)\s*$/);
    if (fence) {
      var lang = fence[1] ? ' class="language-' + escapeHtml(fence[1]) + '"' : '';
      var buf = [];
      i++;
      while (i < n && !/^\s*```\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++; // 跳过闭合围栏（未闭合则到文末）
      html.push('<pre><code' + lang + '>' + escapeHtml(buf.join('\n')) + '</code></pre>');
      continue;
    }

    // 标题
    var h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      html.push('<h' + h[1].length + '>' + renderInline(h[2].trim()) + '</h' + h[1].length + '>');
      i++;
      continue;
    }

    // 分隔线
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      html.push('<hr>'); i++; continue;
    }

    // 表格
    if (line.indexOf('|') !== -1 && i + 1 < n && isTableSep(lines[i + 1])) {
      var head = splitRow(line);
      var body = [];
      i += 2;
      while (i < n && lines[i].indexOf('|') !== -1 && lines[i].trim() !== '') {
        body.push(splitRow(lines[i])); i++;
      }
      var t = '<table><thead><tr>' + head.map(function (c) {
        return '<th>' + renderInline(c) + '</th>';
      }).join('') + '</tr></thead>';
      if (body.length) {
        t += '<tbody>' + body.map(function (r) {
          return '<tr>' + r.map(function (c) { return '<td>' + renderInline(c) + '</td>'; }).join('') + '</tr>';
        }).join('') + '</tbody>';
      }
      html.push(t + '</table>');
      continue;
    }

    // 引用
    if (/^\s*>/.test(line)) {
      var q = [];
      while (i < n && /^\s*>/.test(lines[i])) { q.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
      html.push('<blockquote>' + q.map(function (l) { return '<p>' + renderInline(l) + '</p>'; }).join('') + '</blockquote>');
      continue;
    }

    // 无序列表
    if (/^\s*[-*+]\s+/.test(line)) {
      var items = [];
      while (i < n && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push('<li>' + renderInline(lines[i].replace(/^\s*[-*+]\s+/, '')) + '</li>'); i++;
      }
      html.push('<ul>' + items.join('') + '</ul>');
      continue;
    }

    // 有序列表
    if (/^\s*\d+[.)]\s+/.test(line)) {
      var oitems = [];
      while (i < n && /^\s*\d+[.)]\s+/.test(lines[i])) {
        oitems.push('<li>' + renderInline(lines[i].replace(/^\s*\d+[.)]\s+/, '')) + '</li>'); i++;
      }
      html.push('<ol>' + oitems.join('') + '</ol>');
      continue;
    }

    // 空行
    if (/^\s*$/.test(line)) { i++; continue; }

    // 段落（连续非空行合并）
    var para = [];
    while (i < n && !/^\s*$/.test(lines[i]) && !/^(#{1,6}\s|```|>|\s*[-*+]\s+|\s*\d+[.)]\s+|\s*(-{3,}|\*{3,}|_{3,})\s*$)/.test(lines[i])) {
      if (lines[i].indexOf('|') !== -1 && i + 1 < n && isTableSep(lines[i + 1])) break;
      para.push(lines[i]); i++;
    }
    html.push('<p>' + para.map(renderInline).join('<br>') + '</p>');
  }

  return html.join('\n');
}

/* ================= 浏览器 UI 逻辑 ================= */

function $(id) { return document.getElementById(id); }

function showMsg(el, msg, isErr) {
  el.style.display = 'block';
  el.style.color = isErr ? '#dc2626' : '#065f46';
  el.style.background = isErr ? '#fef2f2' : '#ecfdf5';
  el.style.borderColor = isErr ? '#fecaca' : '#a7f3d0';
  el.innerHTML = msg;
}

function copyText(text, btn) {
  function done(ok) {
    if (!btn) return;
    var orig = btn.getAttribute('data-orig') || btn.innerHTML;
    btn.setAttribute('data-orig', orig);
    btn.innerHTML = ok ? '<i class="material-icons">check</i> 已复制' : '<i class="material-icons">error</i> 请手动复制';
    setTimeout(function () { btn.innerHTML = orig; }, 2000);
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
  } else {
    var ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { done(document.execCommand('copy')); } catch (e) { done(false); }
    document.body.removeChild(ta);
  }
}

/* ---- 编辑模式 ---- */
function updatePreview() {
  var text = $('uns-input').value;
  var md = document.querySelector('input[name="uns-mode"]:checked').value === 'md';
  var prev = $('uns-preview');
  if (!text.trim()) { prev.innerHTML = '<span style="color:#9ca3af;">在左侧输入内容后，这里实时预览渲染效果…</span>'; return; }
  prev.innerHTML = md ? renderMarkdown(text) : '<pre style="white-space:pre-wrap;font-family:inherit;margin:0;">' + escapeHtml(text) + '</pre>';
}

function updateStats() {
  var text = $('uns-input').value;
  $('uns-stat').textContent = '原文 ' + text.length + ' 字 / ' + utf8Encode(text).length + ' 字节';
}

async function genShareLink() {
  var text = $('uns-input').value;
  var msg = $('uns-msg');
  if (!text.trim()) { showMsg(msg, '请先输入要分享的文本内容', true); return; }
  var md = document.querySelector('input[name="uns-mode"]:checked').value === 'md';
  var password = $('uns-password').value;
  var btn = $('uns-gen-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="material-icons">hourglass_empty</i> 生成中…';
  try {
    var r = await encodeNote({ text: text, markdown: md, password: password });
    var url = location.origin + location.pathname + r.fragment;
    $('uns-link').value = url;
    $('uns-result').style.display = 'block';
    var stat = '原文 ' + text.length + ' 字 → 压缩后 ' + r.compressedBytes + ' 字节 → 链接总长 ' + url.length + ' 字符';
    $('uns-linkstat').textContent = stat;
    if (r.warn) {
      showMsg($('uns-warn'),
        '<b>长度警告：</b>压缩后仍超过 8KB（' + (r.compressedBytes / 1024).toFixed(1) + 'KB），' +
        '链接非常长。部分场景（微信/短信/二维码）可能截断或无法发送，建议拆成多段分别分享，或开启口令加密后再分享。',
        true);
    } else {
      $('uns-warn').style.display = 'none';
    }
    showMsg(msg, '分享链接已生成：数据全部编码在 #fragment 中，服务器永远收不到你的原文。', false);
  } catch (e) {
    showMsg(msg, '生成失败：' + escapeHtml(e.message), true);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="material-icons">link</i> 生成分享链接';
  }
}

/* ---- 阅读模式（带 #u1 fragment 打开） ---- */
async function readerInit() {
  $('uns-editor').style.display = 'none';
  $('uns-reader').style.display = 'block';
  var parsed = parseFragment(location.hash);
  var content = $('uns-content');
  var msg = $('uns-readmsg');
  if (!parsed.ok) {
    showMsg(msg, '链接无效：' + escapeHtml(parsed.error), true);
    return;
  }
  if (parsed.encrypted) {
    $('uns-pwbox').style.display = 'block';
    $('uns-decrypt-btn').onclick = async function () {
      var pw = $('uns-readpw').value;
      var btn = this;
      btn.disabled = true;
      try {
        var r = await decodeNote(parsed, pw);
        renderReaderContent(r.text, parsed.markdown);
        $('uns-pwbox').style.display = 'none';
        msg.style.display = 'none';
      } catch (e) {
        showMsg(msg, escapeHtml(e.message) + '（请检查口令是否正确）', true);
      } finally {
        btn.disabled = false;
      }
    };
    return;
  }
  try {
    var r2 = await decodeNote(parsed);
    renderReaderContent(r2.text, parsed.markdown);
  } catch (e) {
    showMsg(msg, '解码失败：' + escapeHtml(e.message), true);
  }
}

function renderReaderContent(text, markdown) {
  var content = $('uns-content');
  content.innerHTML = markdown ? renderMarkdown(text)
    : '<pre style="white-space:pre-wrap;font-family:inherit;margin:0;">' + escapeHtml(text) + '</pre>';
  $('uns-copy-src').onclick = function () { copyText(text, this); };
  $('uns-readmeta').textContent = '共 ' + text.length + ' 字 · ' + (markdown ? 'Markdown 渲染' : '纯文本');
}

function init() {
  // 有分享 fragment -> 直接进入阅读模式
  if (location.hash && location.hash.indexOf('#' + FRAG_PREFIX + ',') === 0) {
    readerInit();
    return;
  }
  var input = $('uns-input');
  input.addEventListener('input', function () { updatePreview(); updateStats(); });
  var modes = document.querySelectorAll('input[name="uns-mode"]');
  for (var i = 0; i < modes.length; i++) modes[i].addEventListener('change', updatePreview);
  $('uns-gen-btn').addEventListener('click', genShareLink);
  $('uns-copy-btn').addEventListener('click', function () { copyText($('uns-link').value, this); });
  $('uns-open-btn').addEventListener('click', function () {
    window.open($('uns-link').value, '_blank', 'noopener');
  });
  $('uns-clear-btn').addEventListener('click', function () {
    input.value = ''; $('uns-password').value = '';
    $('uns-result').style.display = 'none';
    $('uns-msg').style.display = 'none';
    updatePreview(); updateStats();
  });
  updatePreview();
  updateStats();
}

function hasDOM() {
  return typeof document !== 'undefined' && typeof window !== 'undefined';
}

if (hasDOM()) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    FRAG_PREFIX: FRAG_PREFIX, WARN_COMPRESSED_BYTES: WARN_COMPRESSED_BYTES,
    utf8Encode: utf8Encode, utf8Decode: utf8Decode,
    b64urlEncode: b64urlEncode, b64urlDecode: b64urlDecode,
    deflateRaw: deflateRaw, inflateRaw: inflateRaw,
    encryptBlob: encryptBlob, decryptBlob: decryptBlob,
    isTooLong: isTooLong, encodeNote: encodeNote,
    parseFragment: parseFragment, decodeNote: decodeNote,
    escapeHtml: escapeHtml, sanitizeUrl: sanitizeUrl,
    renderInline: renderInline, renderMarkdown: renderMarkdown
  };
}
})();
