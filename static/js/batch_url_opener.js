/* 网址批量打开工具（batch_url_opener）- 多行网址逐行校验＋分批一键打开
 * 纯函数契约（失败约定沿用家族惯例：非法参数抛 Error，err.field 给出字段名，不静默钳制）：
 * 1) parseUrlList(rawText) → [{line, raw, url, valid, reason}]
 *    - line：1 起行号；raw：原始行文本；url：归一化后的 URL 字符串（无效时为 null）；
 *      valid：是否有效；reason：无效原因，或有效时的处理标注（如「已自动补全 https://」）。
 *    - 空行直接忽略（不产出条目），因此 parseUrlList('') → []；
 *    - 缺 scheme 的裸域名自动补 https:// 并在 reason 标注；
 *    - 行内杂质自动抽取首个形如 https?://\S+ 的子串（末尾多余标点会被剥离）；
 *    - 仅支持 http/https 协议，其它协议判无效（reason 标明协议名）；
 *    - valid=false 时 url=null 且 reason 为非空字符串；
 *    - rawText 非字符串抛 Error（err.field="rawText"）。
 * 2) dedupeUrls(items) → 去重后数组（按归一化 url；只对 valid 且 url 为字符串的
 *    条目去重，同一 url 只保留首次出现；url 为 null 的无效条目原样透传）；
 *    items 非数组抛 Error（err.field="items"）。
 * 零网络请求：本文件不发起任何 fetch / XHR；内容不出浏览器。 */
(function () {
'use strict';

/* ---------- 打开策略常量（供页面与测试引用） ---------- */
var BATCH_SIZE = 5;          /* 每批打开的标签数 */
var BATCH_GAP_MS = 600;      /* 批次间隔（毫秒），防浏览器卡死 */
var INTRA_STAGGER_MS = 120;  /* 同一批内相邻标签的打开间隔（毫秒） */
var CONFIRM_THRESHOLD = 30;  /* 超过该数量打开前弹确认 */

/* 行内 URL 抽取：首个 https?://\S+（大小写不敏感）；末尾剥离常见句末标点。 */
var INLINE_URL_RE = /https?:\/\/\S+/i;
var TRAIL_PUNCT_RE = /[.,;:!?，。；：！？、）」"'\]\)}】>]+$/;
/* 显式协议检测：协议名不含点（真实协议如 ftp/mailto 均无点），避免把
 * example.com:8080 这类「域名:端口」误判为协议。 */
var SCHEME_RE = /^([a-zA-Z][a-zA-Z0-9+-]*):/;

function badParam(field, message) {
  var e = new Error(message);
  e.field = field;
  return e;
}

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return '数组';
  return typeof v;
}

function extractInlineUrl(text) {
  var m = INLINE_URL_RE.exec(text);
  if (!m) return null;
  return m[0].replace(TRAIL_PUNCT_RE, '');
}

/* 解析候选字符串为归一化 URL；返回 {ok, url, scheme} 或 {ok:false, reason}。 */
function tryNormalize(candidate) {
  var u;
  try {
    u = new URL(candidate);
  } catch (e) {
    return { ok: false, reason: 'URL 构造失败：不是合法的网址格式' };
  }
  var scheme = u.protocol.replace(/:$/, '').toLowerCase();
  if (scheme !== 'http' && scheme !== 'https') {
    return { ok: false, scheme: scheme, reason: '不支持的协议「' + scheme + '」（仅支持 http/https）' };
  }
  return { ok: true, url: u.href, scheme: scheme };
}

function parseLine(line, raw, text) {
  /* 1) 行内抽取首个 http(s) URL */
  var inline = extractInlineUrl(text);
  if (inline) {
    var r = tryNormalize(inline);
    if (r.ok) {
      return { line: line, raw: raw, url: r.url, valid: true, reason: '已从行内文本中抽取' };
    }
    return { line: line, raw: raw, url: null, valid: false, reason: r.reason };
  }
  /* 2) 显式协议：非 http/https（如 ftp://、mailto:）判无效并标明协议名 */
  var sm = SCHEME_RE.exec(text);
  if (sm) {
    var scheme = sm[1].toLowerCase();
    if (scheme !== 'http' && scheme !== 'https') {
      return { line: line, raw: raw, url: null, valid: false,
        reason: '不支持的协议「' + scheme + '」（仅支持 http/https）' };
    }
    var malformed = tryNormalize(text);
    if (malformed.ok) {
      return { line: line, raw: raw, url: malformed.url, valid: true, reason: '' };
    }
    return { line: line, raw: raw, url: null, valid: false, reason: malformed.reason };
  }
  /* 3) 裸域名/路径：剥离行末标点后自动补 https:// */
  var bare = text.replace(TRAIL_PUNCT_RE, '');
  var fixed = tryNormalize('https://' + bare);
  if (fixed.ok) {
    return { line: line, raw: raw, url: fixed.url, valid: true, reason: '已自动补全 https://' };
  }
  return { line: line, raw: raw, url: null, valid: false, reason: fixed.reason };
}

function parseUrlList(rawText) {
  if (typeof rawText !== 'string') {
    throw badParam('rawText', 'parseUrlList：rawText 必须为字符串，实得 ' + typeOf(rawText) + '。');
  }
  var items = [];
  var lines = rawText.split(/\r?\n/);
  for (var i = 0; i < lines.length; i++) {
    var raw = lines[i];
    var text = raw.trim();
    if (text === '') continue; /* 空行忽略：不产出条目 */
    items.push(parseLine(i + 1, raw, text));
  }
  return items;
}

/* 归一化键：new URL().href；构造失败则回退原字符串。 */
function dupKey(url) {
  try { return new URL(url).href; } catch (e) { return String(url); }
}

function dedupeUrls(items) {
  if (!Array.isArray(items)) {
    throw badParam('items', 'dedupeUrls：items 必须为数组，实得 ' + typeOf(items) + '。');
  }
  var seen = {};
  var out = [];
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (it && it.valid === true && typeof it.url === 'string') {
      var key = dupKey(it.url);
      if (seen[key]) continue; /* 重复：只保留首次出现 */
      seen[key] = true;
    }
    out.push(it);
  }
  return out;
}

/* 示例文本（页面「载入示例」用）。 */
var EXAMPLE = [
  'https://github.com',
  'github.com/trending',
  '去 Hacker News 看看 https://news.ycombinator.com 再回来。',
  'www.v2ex.com，',
  'https://a.com',
  'https://a.com/',
  'NOT A URL',
  'ftp://files.example.com/x.zip',
  '',
  '  developer.mozilla.org  '
].join('\n');

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    BATCH_SIZE: BATCH_SIZE,
    BATCH_GAP_MS: BATCH_GAP_MS,
    INTRA_STAGGER_MS: INTRA_STAGGER_MS,
    CONFIRM_THRESHOLD: CONFIRM_THRESHOLD,
    EXAMPLE: EXAMPLE,
    extractInlineUrl: extractInlineUrl,
    parseUrlList: parseUrlList,
    dedupeUrls: dedupeUrls
  };
  return;
}

/* ================= 以下为浏览器 DOM 交互（node 下不执行） ================= */

function $(id) { return document.getElementById(id); }

function toast(msg, ok) {
  var t = $('buo-toast');
  t.textContent = msg;
  t.style.background = ok === false ? '#991b1b' : '#111827';
  t.className = 'buo-toast show';
  clearTimeout(t._timer);
  t._timer = setTimeout(function () { t.className = 'buo-toast'; }, 2600);
}

/* 复制文本：优先 navigator.clipboard，降级 textarea+execCommand（沿用家族惯例）。 */
function copyText(text, done) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () { done(true); }, function () {
      fallbackCopy(text, done);
    });
  } else {
    fallbackCopy(text, done);
  }
}
function fallbackCopy(text, done) {
  try {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var ok = document.execCommand('copy');
    document.body.removeChild(ta);
    done(!!ok);
  } catch (e) { done(false); }
}

function downloadText(text, filename) {
  if (!text) { toast('没有可下载的内容', false); return; }
  var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  toast(filename + ' 已开始下载', true);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

/* 首次出现的 url → 行号（用于「重复」标注）。 */
function firstLineMap(items) {
  var map = {};
  items.forEach(function (it) {
    if (it && it.valid && typeof it.url === 'string') {
      var key = dupKey(it.url);
      if (!(key in map)) map[key] = it.line;
    }
  });
  return map;
}

var lastItems = [];    /* parseUrlList 原始结果 */
var lastDeduped = [];  /* dedupeUrls 去重后（含无效条目透传） */

function renderAll() {
  var raw = $('buo-input').value;
  var skipped = 0;
  try {
    lastItems = parseUrlList(raw);
  } catch (e) {
    lastItems = [];
  }
  skipped = raw.split(/\r?\n/).filter(function (l) { return l.trim() === ''; }).length;
  if (raw === '') skipped = 0;
  lastDeduped = dedupeUrls(lastItems);

  var valid = lastItems.filter(function (it) { return it.valid; });
  var invalid = lastItems.filter(function (it) { return !it.valid; });
  var dupCount = valid.length - lastDeduped.filter(function (it) { return it.valid; }).length;

  $('buo-stat').innerHTML =
    '有效 <b>' + valid.length + '</b>　无效 <b>' + invalid.length + '</b>　重复 <b>' + dupCount + '</b>' +
    (skipped > 0 ? '　<span class="buo-note">已忽略 ' + skipped + ' 个空行</span>' : '');

  var firstLines = firstLineMap(lastItems);
  var keptKeys = {};
  lastDeduped.forEach(function (it) {
    if (it && it.valid) keptKeys[dupKey(it.url)] = true;
  });

  var vh = '';
  if (!valid.length) {
    vh = '<p class="buo-empty">暂无有效网址：在上方粘贴网址列表后自动解析。</p>';
  } else {
    valid.forEach(function (it) {
      var key = dupKey(it.url);
      var isDup = firstLines[key] !== it.line;
      var willOpen = !isDup; /* 重复行默认不勾选（去重后只开首次） */
      vh += '<label class="buo-row' + (isDup ? ' buo-dup' : '') + '">' +
        '<input type="checkbox" data-url="' + escapeHtml(it.url) + '"' + (willOpen ? ' checked' : '') + '>' +
        '<span class="buo-url">' + escapeHtml(it.url) + '</span>' +
        '<span class="buo-meta">第 ' + it.line + ' 行' +
        (it.reason ? ' · ' + escapeHtml(it.reason) : '') +
        (isDup ? ' · <b class="buo-duptag">重复（与第 ' + firstLines[key] + ' 行相同）</b>' : '') +
        '</span></label>';
    });
  }
  $('buo-valid-list').innerHTML = vh;

  var ih = '';
  if (!invalid.length) {
    ih = '<p class="buo-empty">无无效行。</p>';
  } else {
    invalid.forEach(function (it) {
      ih += '<div class="buo-row buo-bad"><span class="buo-url buo-raw">' +
        escapeHtml(it.raw.trim()) + '</span>' +
        '<span class="buo-meta">第 ' + it.line + ' 行 · ' + escapeHtml(it.reason) + '</span></div>';
    });
  }
  $('buo-invalid-list').innerHTML = ih;

  var hasOpenable = lastDeduped.some(function (it) { return it && it.valid; });
  $('buo-open-all').disabled = !hasOpenable;
  $('buo-open-selected').disabled = !hasOpenable;
  $('buo-copy').disabled = !hasOpenable;
  $('buo-download').disabled = !hasOpenable;
}

/* 收集待打开的 URL：mode 'all' 取去重后全部有效；'selected' 取勾选框。 */
function collectUrls(mode) {
  if (mode === 'selected') {
    var boxes = $('buo-valid-list').querySelectorAll('input[type=checkbox]:checked');
    var urls = [];
    for (var i = 0; i < boxes.length; i++) urls.push(boxes[i].getAttribute('data-url'));
    return urls;
  }
  return lastDeduped.filter(function (it) { return it && it.valid; })
    .map(function (it) { return it.url; });
}

/* 一键打开：每批 BATCH_SIZE 个、批次间隔 BATCH_GAP_MS；被拦截自动降级复制全部链接。 */
function openUrls(urls) {
  if (!urls.length) { toast('没有可打开的网址', false); return; }
  if (urls.length > CONFIRM_THRESHOLD &&
      !window.confirm('将要打开 ' + urls.length + ' 个标签页，可能导致浏览器卡顿/占用大量内存，确定继续吗？')) {
    return;
  }
  var opened = 0, blocked = 0, done = 0;
  function finish() {
    if (blocked > 0) {
      /* 降级：复制全部链接 + 白名单指引（沿用 search_router 降级惯例）。 */
      copyText(urls.join('\n'), function (ok) {
        toast(ok
          ? '⚠️ 浏览器拦截了 ' + blocked + ' 个弹窗，已复制全部 ' + urls.length + ' 条链接到剪贴板（下方有白名单指引）'
          : '⚠️ 浏览器拦截了弹窗，复制也失败了，请逐条点击打开', ok);
      });
    } else {
      toast('✅ 已打开 ' + opened + ' 个页面', true);
    }
  }
  urls.forEach(function (u, i) {
    var batch = Math.floor(i / BATCH_SIZE);
    var delay = batch * BATCH_GAP_MS + (i % BATCH_SIZE) * INTRA_STAGGER_MS;
    setTimeout(function () {
      var w = null;
      try { w = window.open(u, '_blank', 'noopener,noreferrer'); } catch (e) { w = null; }
      if (!w || w.closed) { blocked++; } else { opened++; }
      done++;
      if (done === urls.length) finish();
    }, delay);
  });
}

document.addEventListener('DOMContentLoaded', function () {
  $('buo-input').addEventListener('input', renderAll);
  $('buo-example').addEventListener('click', function () {
    $('buo-input').value = EXAMPLE;
    renderAll();
    toast('已载入示例', true);
  });
  $('buo-clear').addEventListener('click', function () {
    $('buo-input').value = '';
    renderAll();
    toast('已清空', true);
  });
  $('buo-check-all').addEventListener('click', function () {
    var boxes = $('buo-valid-list').querySelectorAll('input[type=checkbox]');
    for (var i = 0; i < boxes.length; i++) boxes[i].checked = true;
  });
  $('buo-uncheck-all').addEventListener('click', function () {
    var boxes = $('buo-valid-list').querySelectorAll('input[type=checkbox]');
    for (var i = 0; i < boxes.length; i++) boxes[i].checked = false;
  });
  $('buo-open-all').addEventListener('click', function () { openUrls(collectUrls('all')); });
  $('buo-open-selected').addEventListener('click', function () { openUrls(collectUrls('selected')); });
  $('buo-copy').addEventListener('click', function () {
    var urls = collectUrls('all');
    if (!urls.length) { toast('没有可复制的链接', false); return; }
    copyText(urls.join('\n'), function (ok) {
      toast(ok ? '✅ 已复制 ' + urls.length + ' 条链接' : '❌ 复制失败，请手动选择复制', ok);
    });
  });
  $('buo-download').addEventListener('click', function () {
    var urls = collectUrls('all');
    downloadText(urls.join('\n'), 'batch-urls.txt');
  });
  renderAll();
});
})();
