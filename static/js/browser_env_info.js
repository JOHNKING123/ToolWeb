/* 浏览器环境信息一键复制（browser_env_info）- 纯前端本地采集
 * 打开即自动采集 13 项浏览器环境信息（浏览器名/版本、操作系统、UA 原文、
 * 屏幕分辨率、视口尺寸、设备像素比、时区、语言、触屏、Cookie 开关、在线状态、
 * 色深、硬件并发数），一键复制 Markdown/纯文本，数据编进 URL hash 生成
 * 可分享链接，无需后端，纯前端零上传。
 * 纯函数契约：
 *   buildEntries(raw) → 13 个 key 固定顺序卡片；缺字段回退'未知'；
 *     raw 非对象抛错，err.field='raw'。
 *   formatAsMarkdown/formatAsPlainText(entries) → 字符串；
 *     entries 为空抛错，err.field='entries'。
 *   encodeShareFragment/decodeShareFragment(entries) → fragment 往返一致；
 *     非法 fragment 抛错，err.field='fragment'。
 * 纯函数经 module.exports 暴露供 node 测试；浏览器里挂 window.BrowserEnvInfo。
 * 零网络请求：本文件不发起任何 fetch / XHR。 */
(function () {
'use strict';

/* 带字段名的失败：非法参数抛 Error，err.field 给出字段名。 */
function fail(field, message) {
  var e = new Error(message);
  e.field = field;
  throw e;
}

/* 13 项固定顺序定义。 */
var ENTRY_DEFS = [
  { key: 'browser', label: '浏览器' },
  { key: 'os', label: '操作系统' },
  { key: 'userAgent', label: 'UA 原文' },
  { key: 'screen', label: '屏幕分辨率' },
  { key: 'viewport', label: '视口尺寸' },
  { key: 'dpr', label: '设备像素比' },
  { key: 'timezone', label: '时区' },
  { key: 'language', label: '语言' },
  { key: 'touch', label: '触屏支持' },
  { key: 'cookies', label: 'Cookie' },
  { key: 'online', label: '在线状态' },
  { key: 'colorDepth', label: '色深' },
  { key: 'hardwareConcurrency', label: '硬件并发数' }
];

var UNKNOWN = '未知';

function nonEmptyStr(v) {
  return typeof v === 'string' && v.trim().length > 0 ? v : null;
}
function posInt(v) {
  return typeof v === 'number' && isFinite(v) && v > 0 && Math.floor(v) === v ? v : null;
}
function finiteNum(v) {
  return typeof v === 'number' && isFinite(v) ? v : null;
}

/* 解析浏览器名/版本：navigator.userAgentData.brands 优先（Chromium 系），
 * UA 字符串回退。解析不出返回 null（由 buildEntries 回退'未知'）。 */
function parseBrowser(ua, brands) {
  if (Array.isArray(brands)) {
    for (var i = 0; i < brands.length; i++) {
      var b = brands[i];
      if (!b || typeof b.brand !== 'string' || typeof b.version !== 'string') continue;
      /* 跳过 GREASE 占位品牌（如 "Not/A)Brand"）。 */
      if (/not/i.test(b.brand)) continue;
      var name = b.brand.trim();
      var ver = b.version.trim();
      if (name && ver) return name + ' ' + ver;
    }
  }
  if (typeof ua !== 'string' || !ua) return null;
  var m;
  m = ua.match(/Edg\/([\d.]+)/);
  if (m) return 'Microsoft Edge ' + m[1];
  m = ua.match(/OPR\/([\d.]+)/);
  if (m) return 'Opera ' + m[1];
  m = ua.match(/Chrome\/([\d.]+)/);
  if (m) return 'Chrome ' + m[1];
  m = ua.match(/Firefox\/([\d.]+)/);
  if (m) return 'Firefox ' + m[1];
  m = ua.match(/Version\/([\d.]+).*Safari/);
  if (m) return 'Safari ' + m[1];
  m = ua.match(/MSIE ([\d.]+)/);
  if (m) return 'Internet Explorer ' + m[1];
  m = ua.match(/Trident.*rv:([\d.]+)/);
  if (m) return 'Internet Explorer ' + m[1];
  return null;
}

/* 解析操作系统：UA 优先，userAgentData.platform 兜底。解析不出返回 null。 */
function parseOs(ua, platform) {
  var m;
  if (typeof ua === 'string' && ua) {
    m = ua.match(/Windows NT ([\d.]+)/);
    if (m) {
      var nt = m[1];
      if (nt === '10.0') return 'Windows 10/11';
      if (nt === '6.3') return 'Windows 8.1';
      if (nt === '6.2') return 'Windows 8';
      if (nt === '6.1') return 'Windows 7';
      return 'Windows NT ' + nt;
    }
    m = ua.match(/Android ([\d.]+)/);
    if (m) return 'Android ' + m[1];
    m = ua.match(/iPhone OS ([\d_]+)/) || ua.match(/CPU OS ([\d_]+)/);
    if (m) return 'iOS ' + m[1].replace(/_/g, '.');
    m = ua.match(/Mac OS X ([\d_]+)/);
    if (m) return 'macOS ' + m[1].replace(/_/g, '.');
    if (/Linux/.test(ua) && !/Android/.test(ua)) return 'Linux';
    if (/CrOS/.test(ua)) return 'Chrome OS';
  }
  if (typeof platform === 'string' && platform) {
    var p = platform.trim();
    if (/^windows$/i.test(p)) return 'Windows';
    if (/^macos$/i.test(p)) return 'macOS';
    if (/^android$/i.test(p)) return 'Android';
    if (/^ios$/i.test(p)) return 'iOS';
    if (/^linux$/i.test(p)) return 'Linux';
    if (/chrome ?os/i.test(p)) return 'Chrome OS';
  }
  return null;
}

/* 构建 13 个 key 固定顺序卡片：缺字段回退'未知'。 */
function buildEntries(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    fail('raw', 'raw 必须是对象');
  }
  var ua = nonEmptyStr(raw.ua);
  var sw = posInt(raw.screenW), sh = posInt(raw.screenH);
  var vw = posInt(raw.viewportW), vh = posInt(raw.viewportH);
  var dpr = finiteNum(raw.dpr);
  var mtp = raw.maxTouchPoints;
  var ck = raw.cookieEnabled;
  var on = raw.onLine;
  var cd = posInt(raw.colorDepth);
  var hc = posInt(raw.hardwareConcurrency);
  return [
    { key: 'browser', label: '浏览器',
      value: parseBrowser(raw.ua, raw.brands) || UNKNOWN },
    { key: 'os', label: '操作系统',
      value: parseOs(raw.ua, raw.platform) || UNKNOWN },
    { key: 'userAgent', label: 'UA 原文',
      value: ua || UNKNOWN },
    { key: 'screen', label: '屏幕分辨率',
      value: (sw && sh) ? sw + '×' + sh : UNKNOWN },
    { key: 'viewport', label: '视口尺寸',
      value: (vw && vh) ? vw + '×' + vh + ' px' : UNKNOWN },
    { key: 'dpr', label: '设备像素比',
      value: (dpr !== null && dpr > 0) ? String(dpr) : UNKNOWN },
    { key: 'timezone', label: '时区',
      value: nonEmptyStr(raw.timezone) || UNKNOWN },
    { key: 'language', label: '语言',
      value: nonEmptyStr(raw.language) || UNKNOWN },
    { key: 'touch', label: '触屏支持',
      value: typeof mtp === 'number' && isFinite(mtp) && mtp >= 0
        ? (mtp > 0 ? '支持（' + mtp + ' 点触控）' : '不支持')
        : UNKNOWN },
    { key: 'cookies', label: 'Cookie',
      value: typeof ck === 'boolean' ? (ck ? '已开启' : '已禁用') : UNKNOWN },
    { key: 'online', label: '在线状态',
      value: typeof on === 'boolean' ? (on ? '在线' : '离线') : UNKNOWN },
    { key: 'colorDepth', label: '色深',
      value: cd ? cd + ' 位' : UNKNOWN },
    { key: 'hardwareConcurrency', label: '硬件并发数',
      value: hc ? String(hc) + '（逻辑处理器）' : UNKNOWN }
  ];
}

/* 校验 entries 为非空数组。 */
function checkEntries(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    fail('entries', 'entries 必须是非空数组');
  }
  return entries;
}

/* 格式化为 Markdown。 */
function formatAsMarkdown(entries) {
  checkEntries(entries);
  var lines = ['## 浏览器环境信息', ''];
  entries.forEach(function (e) {
    lines.push('- **' + e.label + '**：' + e.value);
  });
  lines.push('', '_由「浏览器环境信息一键复制」生成，纯前端本地采集_');
  return lines.join('\n');
}

/* 格式化为纯文本。 */
function formatAsPlainText(entries) {
  checkEntries(entries);
  var lines = ['浏览器环境信息'];
  entries.forEach(function (e) {
    lines.push(e.label + '：' + e.value);
  });
  return lines.join('\n');
}

/* base64url 编解码（node 用 Buffer，浏览器用 btoa/atob）。 */
function utf8Encode(str) {
  if (typeof TextEncoder !== 'undefined') {
    return Array.prototype.slice.call(new TextEncoder().encode(str));
  }
  var bin = unescape(encodeURIComponent(str));
  var out = [];
  for (var i = 0; i < bin.length; i++) out.push(bin.charCodeAt(i));
  return out;
}
function utf8Decode(bytes) {
  if (typeof TextDecoder !== 'undefined') {
    try {
      return new TextDecoder('utf-8', { fatal: true })
        .decode(new Uint8Array(bytes));
    } catch (e) { return null; }
  }
  var bin = '';
  for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  try { return decodeURIComponent(escape(bin)); } catch (e) { return null; }
}
function b64urlEncode(str) {
  var bytes = utf8Encode(str);
  var bin = '';
  for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  var b64 = (typeof Buffer !== 'undefined')
    ? Buffer.from(bin, 'binary').toString('base64')
    : btoa(bin);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s) {
  if (typeof s !== 'string' || s.length === 0 || !/^[A-Za-z0-9\-_]+$/.test(s)) {
    return null;
  }
  var b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  var bin;
  if (typeof Buffer !== 'undefined') {
    bin = Buffer.from(b64, 'base64').toString('binary');
  } else {
    try { bin = atob(b64); } catch (e) { return null; }
  }
  var bytes = [];
  for (var i = 0; i < bin.length; i++) bytes.push(bin.charCodeAt(i));
  return utf8Decode(bytes);
}

var FRAGMENT_PREFIX = 'bei1.';

/* 校验 entries 元素结构（供 encode 用）。 */
function checkEntryItems(entries) {
  checkEntries(entries);
  entries.forEach(function (e, i) {
    if (!e || typeof e.key !== 'string' || typeof e.label !== 'string' ||
        typeof e.value !== 'string') {
      fail('entries', 'entries[' + i + '] 必须含 key/label/value 字符串');
    }
  });
}

/* 编码分享 fragment：数据编进 URL hash，无需后端。 */
function encodeShareFragment(entries) {
  checkEntryItems(entries);
  return FRAGMENT_PREFIX + b64urlEncode(JSON.stringify(entries));
}

/* 解码分享 fragment：非法抛错，err.field='fragment'。 */
function decodeShareFragment(fragment) {
  if (typeof fragment !== 'string' || fragment.indexOf(FRAGMENT_PREFIX) !== 0) {
    fail('fragment', 'fragment 前缀非法');
  }
  var payload = fragment.slice(FRAGMENT_PREFIX.length);
  var json = b64urlDecode(payload);
  if (json === null) fail('fragment', 'fragment 不是合法的 base64url');
  var arr;
  try { arr = JSON.parse(json); } catch (e) {
    fail('fragment', 'fragment 不是合法的 JSON');
  }
  if (!Array.isArray(arr) || arr.length !== ENTRY_DEFS.length) {
    fail('fragment', 'fragment 数据条目数非法');
  }
  for (var i = 0; i < ENTRY_DEFS.length; i++) {
    var e = arr[i];
    if (!e || e.key !== ENTRY_DEFS[i].key ||
        typeof e.label !== 'string' || typeof e.value !== 'string') {
      fail('fragment', 'fragment 数据结构非法');
    }
  }
  return arr;
}

/* 文件名清洗：非法字符删除、空白折横线、空回退、截 60 字符。 */
function sanitizeFileName(name) {
  var s = typeof name === 'string' ? name : '';
  s = s.replace(/[\\/:*?"<>|]/g, '').trim().replace(/\s+/g, '-');
  s = s.replace(/^[.\-]+/, '').replace(/[.\-]+$/, '');
  if (!s) return 'browser-env-info';
  return s.length > 60 ? s.slice(0, 60) : s;
}

var API = {
  ENTRY_DEFS: ENTRY_DEFS,
  parseBrowser: parseBrowser,
  parseOs: parseOs,
  buildEntries: buildEntries,
  formatAsMarkdown: formatAsMarkdown,
  formatAsPlainText: formatAsPlainText,
  encodeShareFragment: encodeShareFragment,
  decodeShareFragment: decodeShareFragment,
  sanitizeFileName: sanitizeFileName
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = API;
}
if (typeof window !== 'undefined') {
  window.BrowserEnvInfo = API;
}

/* ============ 以下为浏览器 UI 绑定（node 测试不执行） ============ */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  function $(id) { return document.getElementById(id); }

  /* 浏览器端原始数据采集（防御式取值，取不到留 undefined→'未知'）。 */
  function collectRaw() {
    var raw = {};
    var nav = (typeof navigator !== 'undefined') ? navigator : {};
    var scr = (typeof screen !== 'undefined') ? screen : {};
    var win = (typeof window !== 'undefined') ? window : {};
    raw.ua = typeof nav.userAgent === 'string' ? nav.userAgent : undefined;
    if (nav.userAgentData && typeof nav.userAgentData === 'object') {
      if (Array.isArray(nav.userAgentData.brands)) {
        raw.brands = nav.userAgentData.brands.map(function (b) {
          return { brand: b && b.brand, version: b && b.version };
        });
      }
      if (typeof nav.userAgentData.platform === 'string') {
        raw.platform = nav.userAgentData.platform;
      }
    }
    if (typeof nav.platform === 'string' && !raw.platform) {
      raw.platform = nav.platform;
    }
    raw.screenW = typeof scr.width === 'number' ? scr.width : undefined;
    raw.screenH = typeof scr.height === 'number' ? scr.height : undefined;
    raw.viewportW = typeof win.innerWidth === 'number' ? win.innerWidth : undefined;
    raw.viewportH = typeof win.innerHeight === 'number' ? win.innerHeight : undefined;
    raw.dpr = typeof win.devicePixelRatio === 'number' ? win.devicePixelRatio : undefined;
    try {
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      var off = -new Date().getTimezoneOffset();
      var sign = off >= 0 ? '+' : '-';
      var abs = Math.abs(off);
      var hh = String(Math.floor(abs / 60));
      if (hh.length < 2) hh = '0' + hh;
      var mm = String(abs % 60);
      if (mm.length < 2) mm = '0' + mm;
      raw.timezone = tz ? tz + '（UTC' + sign + hh + ':' + mm + '）' : undefined;
    } catch (e) { /* 留 undefined */}
    if (typeof nav.language === 'string' && nav.language) {
      var langs = nav.language;
      if (Array.isArray(nav.languages) && nav.languages.length > 1) {
        langs += '（另有：' + nav.languages.slice(1).join('、') + '）';
      }
      raw.language = langs;
    }
    raw.maxTouchPoints = typeof nav.maxTouchPoints === 'number' ? nav.maxTouchPoints : undefined;
    raw.cookieEnabled = typeof nav.cookieEnabled === 'boolean' ? nav.cookieEnabled : undefined;
    raw.onLine = typeof nav.onLine === 'boolean' ? nav.onLine : undefined;
    raw.colorDepth = typeof scr.colorDepth === 'number' ? scr.colorDepth : undefined;
    raw.hardwareConcurrency = typeof nav.hardwareConcurrency === 'number'
      ? nav.hardwareConcurrency : undefined;
    return raw;
  }

  function toast(msg) {
    var t = $('bei-toast');
    if (!t) return;
    t.textContent = msg;
    t.style.display = 'block';
    setTimeout(function () { t.style.display = 'none'; }, 2200);
  }

  function renderEntries(entries) {
    var box = $('bei-list');
    if (!box) return;
    var html = '';
    entries.forEach(function (e) {
      html += '<div class="bei-row"><div class="bei-label">' + escapeHtml(e.label) +
        '</div><div class="bei-value">' + escapeHtml(e.value) + '</div></div>';
    });
    box.innerHTML = html;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var currentEntries = [];

  function refresh(fromShare) {
    var note = $('bei-note');
    if (fromShare) {
      currentEntries = fromShare;
      if (note) {
        note.style.display = 'block';
        note.textContent = '这是通过分享链接打开的环境信息快照（只读）；点「重新采集」可采集本机当前环境。';
      }
    } else {
      currentEntries = window.BrowserEnvInfo.buildEntries(collectRaw());
      if (note) note.style.display = 'none';
      if (window.location.hash && window.location.hash.indexOf('#bei1.') === 0) {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    }
    renderEntries(currentEntries);
  }

  function copyText(text, okMsg) {
    function done() { toast(okMsg); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text, done); });
    } else {
      fallbackCopy(text, done);
    }
  }
  function fallbackCopy(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      done();
    } catch (e) {
      toast('复制失败，请手动选中复制');
    }
    document.body.removeChild(ta);
  }

  function downloadText(text, filename) {
    var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
      document.body.removeChild(a);
    }, 500);
    toast('已下载 ' + filename);
  }

  document.addEventListener('DOMContentLoaded', function () {
    /* 分享链接打开：优先渲染 hash 里的数据。 */
    var shared = null;
    if (window.location.hash && window.location.hash.indexOf('#bei1.') === 0) {
      try {
        shared = window.BrowserEnvInfo.decodeShareFragment(window.location.hash.slice(1));
      } catch (e) { shared = null; }
    }
    refresh(shared);

    var rc = $('bei-recollect');
    if (rc) rc.addEventListener('click', function () {
      refresh(null);
      toast('已重新采集');
    });
    var cm = $('bei-copy-md');
    if (cm) cm.addEventListener('click', function () {
      copyText(window.BrowserEnvInfo.formatAsMarkdown(currentEntries), 'Markdown 已复制到剪贴板');
    });
    var cp = $('bei-copy-plain');
    if (cp) cp.addEventListener('click', function () {
      copyText(window.BrowserEnvInfo.formatAsPlainText(currentEntries), '纯文本已复制到剪贴板');
    });
    var dm = $('bei-dl-md');
    if (dm) dm.addEventListener('click', function () {
      downloadText(window.BrowserEnvInfo.formatAsMarkdown(currentEntries),
        window.BrowserEnvInfo.sanitizeFileName('浏览器环境信息') + '.md');
    });
    var dp = $('bei-dl-plain');
    if (dp) dp.addEventListener('click', function () {
      downloadText(window.BrowserEnvInfo.formatAsPlainText(currentEntries),
        window.BrowserEnvInfo.sanitizeFileName('浏览器环境信息') + '.txt');
    });
    var gs = $('bei-gen-share');
    if (gs) gs.addEventListener('click', function () {
      var frag = window.BrowserEnvInfo.encodeShareFragment(currentEntries);
      var url = window.location.origin + window.location.pathname + '#' + frag;
      var inp = $('bei-share-url');
      if (inp) {
        inp.value = url;
        inp.select();
      }
      window.location.hash = frag;
      copyText(url, '分享链接已生成并复制');
    });
    var cs = $('bei-copy-share');
    if (cs) cs.addEventListener('click', function () {
      var inp = $('bei-share-url');
      if (inp && inp.value) copyText(inp.value, '分享链接已复制');
      else toast('请先点「生成分享链接」');
    });
  });
})();

})();
