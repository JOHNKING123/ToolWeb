/* RSS／Atom 订阅源生成器（rss_feed_generator）- 纯前端静态 XML 生成
 * 频道元数据表单＋条目列表 → 实时生成 RSS 2.0 或 Atom 1.0 文本。
 * 纯文本字段做 XML 转义（& < > " '），描述／内容进 CDATA（含 ]]>
 * 时分段续写不断串）；pubDate 用 RFC 822、updated／published 用
 * RFC 3339，均按浏览器本地时区换算（datetime-local 本身无时区）。
 * 只生成静态 XML 文本：不发布、不托管、不验证订阅源可达性与链接
 * 真实存在，内容不做 HTML 清洗。零网络请求：本文件不发起任何请求。
 * 浏览器与 node 测试共用同一纯函数；浏览器绑定只在有 document 时执行，
 * 输出用 DOM 节点与表单值组装，不拼字符串。 */
(function () {
'use strict';

var WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad(n) { return (n < 10 ? '0' : '') + n; }

/* ---------- XML 转义与 CDATA ---------- */
function escapeXmlText(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
/* 属性值与纯文本字段用同一张转义表：引号必转义，引号内不破串。 */
function escapeXmlAttr(s) { return escapeXmlText(s); }

/* CDATA：内容含 ]]> 时拆成 ]]]]><![CDATA[> 续写，不截断、不破串。 */
function cdataWrap(s) {
  var body = String(s == null ? '' : s).split(']]>').join(']]]]><![CDATA[>');
  return '<![CDATA[' + body + ']]>';
}

/* ---------- 日期：本地时区换算 ---------- */
/* datetime-local（如 2026-10-26T07:37 或带秒）→ 本地 Date；非法返回 null。 */
function parseLocalDatetime(s) {
  var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
    String(s == null ? '' : s).trim());
  if (!m) return null;
  var y = +m[1], mo = +m[2], d = +m[3], h = +m[4], mi = +m[5], se = m[6] ? +m[6] : 0;
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || se > 59) return null;
  var dt = new Date(y, mo - 1, d, h, mi, se, 0);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 ||
      dt.getDate() !== d || dt.getHours() !== h ||
      dt.getMinutes() !== mi || dt.getSeconds() !== se) return null;
  return dt;
}

function tzOffset822(date) {
  var off = -date.getTimezoneOffset(); /* 分钟：东区为正 */
  var sign = off >= 0 ? '+' : '-';
  var a = Math.abs(off);
  return sign + pad(Math.floor(a / 60)) + pad(a % 60);
}
function tzOffset3339(date) {
  var o = tzOffset822(date);
  return o.slice(0, 3) + ':' + o.slice(3);
}
/* RFC 822：Mon, 26 Oct 2026 07:37:00 +0800（英文星期／月份缩写）。 */
function formatRfc822(date) {
  return WEEKDAYS[date.getDay()] + ', ' + pad(date.getDate()) + ' ' +
    MONTHS[date.getMonth()] + ' ' + date.getFullYear() + ' ' +
    pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' +
    pad(date.getSeconds()) + ' ' + tzOffset822(date);
}
/* RFC 3339：2026-10-26T07:37:00+08:00（含时区偏移）。 */
function formatRfc3339(date) {
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' +
    pad(date.getDate()) + 'T' + pad(date.getHours()) + ':' +
    pad(date.getMinutes()) + ':' + pad(date.getSeconds()) +
    tzOffset3339(date);
}

/* ---------- 校验 ---------- */
function isValidUrl(s) {
  var v = String(s == null ? '' : s).trim();
  if (!v || /\s/.test(v)) return false;
  return /^https?:\/\/[^\s/$.?#].[^\s]*$/.test(v);
}
function isValidEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim());
}

function validateFeed(channel, items) {
  var errors = [];
  channel = channel || {};
  if (!String(channel.title || '').trim()) errors.push('频道标题不能为空，请填写频道标题。');
  if (!String(channel.link || '').trim()) {
    errors.push('频道链接不能为空，请填写频道链接。');
  } else if (!isValidUrl(channel.link)) {
    errors.push('频道链接格式不正确：须以 http:// 或 https:// 开头，且不含空格。');
  }
  if (!String(channel.description || '').trim()) errors.push('频道描述不能为空，请填写频道描述。');
  if (channel.email && String(channel.email).trim() && !isValidEmail(channel.email)) {
    errors.push('频道管理邮箱格式不正确，请填写形如 name@example.com 的邮箱。');
  }
  if (channel.imageUrl && String(channel.imageUrl).trim() && !isValidUrl(channel.imageUrl)) {
    errors.push('频道图片链接格式不正确：须以 http:// 或 https:// 开头，且不含空格。');
  }
  (items || []).forEach(function (it, i) {
    var n = '第 ' + (i + 1) + ' 条条目：';
    if (!String(it.title || '').trim()) errors.push(n + '标题不能为空。');
    if (!String(it.link || '').trim()) {
      errors.push(n + '链接不能为空。');
    } else if (!isValidUrl(it.link)) {
      errors.push(n + '链接格式不正确：须以 http:// 或 https:// 开头，且不含空格。');
    }
    if (it.pubDate && String(it.pubDate).trim() && !parseLocalDatetime(it.pubDate)) {
      errors.push(n + '发布时间格式不正确，请用日期时间选择器重新选择。');
    }
    var enc = it.enclosure || {};
    var filled = [enc.url, enc.length, enc.type].filter(function (v) {
      return String(v == null ? '' : v).trim() !== '';
    }).length;
    if (filled > 0 && filled < 3) {
      errors.push(n + 'enclosure 须填齐三件套：音频 URL、长度（字节数）、MIME 类型，只填其一无法输出。');
    } else if (filled === 3) {
      if (!isValidUrl(enc.url)) errors.push(n + 'enclosure 音频 URL 格式不正确：须以 http:// 或 https:// 开头，且不含空格。');
      if (!/^\d+$/.test(String(enc.length).trim())) errors.push(n + 'enclosure 长度须为非负整数（字节数）。');
      if (String(enc.type).trim().indexOf('/') === -1) errors.push(n + 'enclosure 类型须为 MIME 形式，例如 audio/mpeg。');
    }
  });
  return errors;
}

/* guid：默认取条目链接；isPermaLink 随 guid 是否等于链接自动判定。 */
function resolveGuid(item) {
  var link = String(item.link || '').trim();
  var guid = String(item.guid || '').trim() || link;
  return { guid: guid, isPermaLink: guid === link };
}

function normChannel(channel) {
  return {
    title: String(channel.title || '').trim(),
    link: String(channel.link || '').trim(),
    description: String(channel.description || '').trim(),
    language: String(channel.language || '').trim() || 'zh-CN',
    copyright: String(channel.copyright || '').trim(),
    email: String(channel.email || '').trim(),
    imageUrl: String(channel.imageUrl || '').trim()
  };
}
function normItem(it) {
  var enc = it.enclosure || {};
  return {
    title: String(it.title || '').trim(),
    link: String(it.link || '').trim(),
    description: String(it.description || ''),
    author: String(it.author || '').trim(),
    category: String(it.category || '').trim(),
    pubDate: String(it.pubDate || '').trim(),
    guid: String(it.guid || '').trim(),
    enclosure: {
      url: String(enc.url || '').trim(),
      length: String(enc.length || '').trim(),
      type: String(enc.type || '').trim()
    }
  };
}

/* ---------- RSS 2.0 ---------- */
function buildRss(channel, items) {
  var ch = normChannel(channel);
  var list = (items || []).map(normItem);
  var out = [];
  out.push('<?xml version="1.0" encoding="UTF-8"?>');
  out.push('<rss version="2.0">');
  out.push('  <channel>');
  out.push('    <title>' + escapeXmlText(ch.title) + '</title>');
  out.push('    <link>' + escapeXmlText(ch.link) + '</link>');
  out.push('    <description>' + cdataWrap(ch.description) + '</description>');
  out.push('    <language>' + escapeXmlText(ch.language) + '</language>');
  if (ch.copyright) out.push('    <copyright>' + escapeXmlText(ch.copyright) + '</copyright>');
  if (ch.email) out.push('    <managingEditor>' + escapeXmlText(ch.email) + '</managingEditor>');
  if (ch.imageUrl) {
    out.push('    <image>');
    out.push('      <url>' + escapeXmlText(ch.imageUrl) + '</url>');
    out.push('      <title>' + escapeXmlText(ch.title) + '</title>');
    out.push('      <link>' + escapeXmlText(ch.link) + '</link>');
    out.push('    </image>');
  }
  list.forEach(function (it) {
    var g = resolveGuid(it);
    out.push('    <item>');
    out.push('      <title>' + escapeXmlText(it.title) + '</title>');
    out.push('      <link>' + escapeXmlText(it.link) + '</link>');
    if (it.description) out.push('      <description>' + cdataWrap(it.description) + '</description>');
    if (it.author) out.push('      <author>' + escapeXmlText(it.author) + '</author>');
    if (it.category) out.push('      <category>' + escapeXmlText(it.category) + '</category>');
    if (it.pubDate) {
      var d = parseLocalDatetime(it.pubDate);
      if (d) out.push('      <pubDate>' + formatRfc822(d) + '</pubDate>');
    }
    out.push('      <guid isPermaLink="' + (g.isPermaLink ? 'true' : 'false') + '">' +
      escapeXmlText(g.guid) + '</guid>');
    if (it.enclosure.url) {
      out.push('      <enclosure url="' + escapeXmlAttr(it.enclosure.url) +
        '" length="' + escapeXmlAttr(it.enclosure.length) +
        '" type="' + escapeXmlAttr(it.enclosure.type) + '" />');
    }
    out.push('    </item>');
  });
  out.push('  </channel>');
  out.push('</rss>');
  return out.join('\n');
}

/* ---------- Atom 1.0 ---------- */
/* updated 取最新条目时间，无条目时间时取当前时间（now 可注入，便于测试）。 */
function feedUpdated(items, now) {
  var latest = null;
  (items || []).forEach(function (it) {
    var d = it.pubDate ? parseLocalDatetime(it.pubDate) : null;
    if (d && (!latest || d > latest)) latest = d;
  });
  return latest || now || new Date();
}

function buildAtom(channel, items, now) {
  var ch = normChannel(channel);
  var list = (items || []).map(normItem);
  var updated = feedUpdated(list, now);
  var out = [];
  out.push('<?xml version="1.0" encoding="UTF-8"?>');
  out.push('<feed xmlns="http://www.w3.org/2005/Atom">');
  out.push('  <title>' + escapeXmlText(ch.title) + '</title>');
  out.push('  <link href="' + escapeXmlAttr(ch.link) + '" />');
  out.push('  <id>' + escapeXmlText(ch.link) + '</id>');
  out.push('  <updated>' + formatRfc3339(updated) + '</updated>');
  out.push('  <subtitle>' + cdataWrap(ch.description) + '</subtitle>');
  if (ch.copyright) out.push('  <rights>' + escapeXmlText(ch.copyright) + '</rights>');
  if (ch.email) out.push('  <author><name>' + escapeXmlText(ch.email) + '</name></author>');
  list.forEach(function (it) {
    var g = resolveGuid(it);
    var d = it.pubDate ? parseLocalDatetime(it.pubDate) : null;
    out.push('  <entry>');
    out.push('    <title>' + escapeXmlText(it.title) + '</title>');
    out.push('    <link href="' + escapeXmlAttr(it.link) + '" />');
    out.push('    <id>' + escapeXmlText(g.guid) + '</id>');
    out.push('    <updated>' + formatRfc3339(d || updated) + '</updated>');
    if (d) out.push('    <published>' + formatRfc3339(d) + '</published>');
    if (it.author) out.push('    <author><name>' + escapeXmlText(it.author) + '</name></author>');
    if (it.category) out.push('    <category term="' + escapeXmlAttr(it.category) + '" />');
    if (it.description) {
      out.push('    <summary>' + cdataWrap(it.description) + '</summary>');
      out.push('    <content type="html">' + cdataWrap(it.description) + '</content>');
    }
    if (it.enclosure.url) {
      out.push('    <link rel="enclosure" href="' + escapeXmlAttr(it.enclosure.url) +
        '" type="' + escapeXmlAttr(it.enclosure.type) +
        '" length="' + escapeXmlAttr(it.enclosure.length) + '" />');
    }
    out.push('  </entry>');
  });
  out.push('</feed>');
  return out.join('\n');
}

/* ---------- 总入口：校验不过时不输出（xml 为空字符串） ---------- */
function buildFeed(channel, items, format, now) {
  var errors = validateFeed(channel, items);
  if (errors.length) return { valid: false, errors: errors, xml: '' };
  var xml = format === 'atom' ? buildAtom(channel, items, now) : buildRss(channel, items);
  return { valid: true, errors: [], xml: xml };
}

/* ---------- 2 组示例 ---------- */
var EXAMPLES = [
  {
    name: '博客频道（3 条）',
    channel: { title: '示例博客', link: 'https://example.com',
      description: '一个示例博客频道，每周分享开发笔记。', language: 'zh-CN',
      copyright: '', email: '', imageUrl: '' },
    items: [
      { title: '第一篇：为什么 RSS 还值得写', link: 'https://example.com/posts/rss-why',
        description: '手写 RSS 容易在转义与日期格式上出错，表单生成恰好对症。',
        author: '作者甲', category: '专栏', pubDate: '2026-10-24T09:00',
        guid: '', enclosure: { url: '', length: '', type: '' } },
      { title: '第二篇：Atom 与 RSS 的日期差异', link: 'https://example.com/posts/atom-vs-rss',
        description: 'RSS 用 RFC 822，Atom 用 RFC 3339，两者时区写法各不相同。',
        author: '作者甲', category: '专栏', pubDate: '2026-10-25T09:00',
        guid: '', enclosure: { url: '', length: '', type: '' } },
      { title: '第三篇：给订阅源加播客音频', link: 'https://example.com/posts/podcast-enclosure',
        description: 'enclosure 三件套填齐，播客平台才能识别音频文件。',
        author: '作者乙', category: '播客', pubDate: '2026-10-26T07:00',
        guid: 'custom-guid-003', enclosure: { url: '', length: '', type: '' } }
    ]
  },
  {
    name: '播客频道（2 条，带 enclosure）',
    channel: { title: '示例播客', link: 'https://example.com/podcast',
      description: '一档示例播客，每期附完整音频文件。', language: 'zh-CN',
      copyright: '© 2026 示例播客', email: 'host@example.com',
      imageUrl: 'https://example.com/podcast/cover.jpg' },
    items: [
      { title: '第 1 期：开场', link: 'https://example.com/podcast/ep1',
        description: '第一期节目：聊聊这档播客要做什么。',
        author: '主播甲', category: '播客', pubDate: '2026-10-20T20:00',
        guid: '', enclosure: { url: 'https://example.com/podcast/ep1.mp3',
          length: '12345678', type: 'audio/mpeg' } },
      { title: '第 2 期：工具链', link: 'https://example.com/podcast/ep2',
        description: '第二期节目：聊聊日常开发工具链的选择。',
        author: '主播甲', category: '播客', pubDate: '2026-10-26T07:00',
        guid: '', enclosure: { url: 'https://example.com/podcast/ep2.mp3',
          length: '23456789', type: 'audio/mpeg' } }
    ]
  }
];

function emptyItem() {
  return { title: '', link: '', description: '', author: '', category: '',
    pubDate: '', guid: '',
    enclosure: { url: '', length: '', type: '' } };
}

var api = {
  escapeXmlText: escapeXmlText, escapeXmlAttr: escapeXmlAttr,
  cdataWrap: cdataWrap, parseLocalDatetime: parseLocalDatetime,
  formatRfc822: formatRfc822, formatRfc3339: formatRfc3339,
  isValidUrl: isValidUrl, validateFeed: validateFeed,
  resolveGuid: resolveGuid, buildRss: buildRss, buildAtom: buildAtom,
  buildFeed: buildFeed, feedUpdated: feedUpdated,
  EXAMPLES: EXAMPLES, emptyItem: emptyItem
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.RssFeedGenerator = api;

/* ---------- 浏览器绑定（只在有 document 时执行；输出用 DOM 组装） ---------- */
if (typeof document !== 'undefined') {
  function $(id) { return document.getElementById(id); }
  function toast(msg) {
    var t = $('rf-toast'); if (!t) return;
    t.textContent = msg; t.style.display = 'block';
    setTimeout(function () { t.style.display = 'none'; }, 2600);
  }
  var state = { items: [emptyItem()], format: 'rss', interacted: false };
  var FIELD_DEFS = [
    ['title', '标题 *', 'text', '条目标题'],
    ['link', '链接 *', 'url', 'https://example.com/posts/1'],
    ['description', '描述／内容（可选，多行）', 'textarea', '条目描述，支持 HTML，将原样进 CDATA'],
    ['author', '作者（可选）', 'text', '作者名'],
    ['category', '分类（可选）', 'text', '分类名'],
    ['pubDate', '发布时间（可选）', 'datetime-local', ''],
    ['guid', 'guid（可选，空则默认取条目链接）', 'text', '自定义 guid 则 isPermaLink=false']
  ];
  function readChannel() {
    return {
      title: $('rf-ch-title') ? $('rf-ch-title').value : '',
      link: $('rf-ch-link') ? $('rf-ch-link').value : '',
      description: $('rf-ch-desc') ? $('rf-ch-desc').value : '',
      language: $('rf-ch-lang') ? $('rf-ch-lang').value : 'zh-CN',
      copyright: $('rf-ch-copy') ? $('rf-ch-copy').value : '',
      email: $('rf-ch-email') ? $('rf-ch-email').value : '',
      imageUrl: $('rf-ch-image') ? $('rf-ch-image').value : ''
    };
  }
  function writeChannel(ch) {
    if ($('rf-ch-title')) $('rf-ch-title').value = ch.title || '';
    if ($('rf-ch-link')) $('rf-ch-link').value = ch.link || '';
    if ($('rf-ch-desc')) $('rf-ch-desc').value = ch.description || '';
    if ($('rf-ch-lang')) $('rf-ch-lang').value = ch.language || 'zh-CN';
    if ($('rf-ch-copy')) $('rf-ch-copy').value = ch.copyright || '';
    if ($('rf-ch-email')) $('rf-ch-email').value = ch.email || '';
    if ($('rf-ch-image')) $('rf-ch-image').value = ch.imageUrl || '';
  }
  function readFormat() {
    var a = $('rf-format-atom');
    return a && a.checked ? 'atom' : 'rss';
  }
  function showErrors(errors) {
    var el = $('rf-errors'); if (!el) return;
    if (!errors || !errors.length) { el.textContent = ''; el.style.display = 'none'; return; }
    el.textContent = errors.join('\n'); el.style.display = 'block';
  }
  function regenerate() {
    state.format = readFormat();
    var res = buildFeed(readChannel(), state.items, state.format);
    var out = $('rf-output');
    var meta = $('rf-meta');
    if (!state.interacted) { if (out) out.value = ''; return; }
    if (!res.valid) {
      showErrors(res.errors);
      if (out) out.value = '';
      if (meta) meta.textContent = '校验未通过，未生成输出（不会用旧结果冒充新结果）。';
      return;
    }
    showErrors([]);
    if (out) out.value = res.xml;
    if (meta) meta.textContent = '已生成 ' + (state.format === 'atom' ? 'Atom 1.0' : 'RSS 2.0') +
      '，共 ' + state.items.length + ' 条条目。';
  }
  function markChanged() { state.interacted = true; regenerate(); }
  function renderItems() {
    var wrap = $('rf-items'); if (!wrap) return;
    /* 只清空容器节点，不拼字符串内容。 */
    while (wrap.firstChild) wrap.removeChild(wrap.firstChild);
    state.items.forEach(function (it, idx) {
      var card = document.createElement('div');
      card.className = 'rf-item';
      var head = document.createElement('div');
      head.className = 'rf-item-head';
      var h = document.createElement('b');
      h.textContent = '条目 ' + (idx + 1);
      head.appendChild(h);
      [['上移', 'up'], ['下移', 'down'], ['删除', 'del']].forEach(function (pair) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'rf-btn rf-btn-sm'; b.textContent = pair[0];
        b.setAttribute('data-act', pair[1]); b.setAttribute('data-idx', String(idx));
        b.addEventListener('click', function () {
          state.interacted = true;
          if (pair[1] === 'up' && idx > 0) {
            var t = state.items[idx - 1]; state.items[idx - 1] = state.items[idx]; state.items[idx] = t;
          } else if (pair[1] === 'down' && idx < state.items.length - 1) {
            var u = state.items[idx + 1]; state.items[idx + 1] = state.items[idx]; state.items[idx] = u;
          } else if (pair[1] === 'del') {
            state.items.splice(idx, 1);
            if (!state.items.length) state.items.push(emptyItem());
          }
          renderItems(); regenerate();
        });
        head.appendChild(b);
      });
      card.appendChild(head);
      FIELD_DEFS.forEach(function (def) {
        var label = document.createElement('label');
        label.className = 'rf-field';
        var span = document.createElement('span');
        span.textContent = def[1];
        label.appendChild(span);
        var input;
        if (def[2] === 'textarea') {
          input = document.createElement('textarea');
          input.rows = 3;
        } else {
          input = document.createElement('input');
          input.type = def[2];
        }
        input.className = 'rf-input';
        input.placeholder = def[3];
        input.value = it[def[0]] || '';
        input.addEventListener('input', function () {
          state.items[idx][def[0]] = input.value;
          markChanged();
        });
        label.appendChild(input);
        card.appendChild(label);
      });
      var encLabel = document.createElement('div');
      encLabel.className = 'rf-field';
      var encSpan = document.createElement('span');
      encSpan.textContent = '播客 enclosure（可选三件套：填其一则须填齐）';
      encLabel.appendChild(encSpan);
      var encRow = document.createElement('div');
      encRow.className = 'rf-enc-row';
      [['url', '音频 URL', 'url'], ['length', '长度（字节数）', 'text'],
       ['type', 'MIME 类型，如 audio/mpeg', 'text']].forEach(function (e) {
        var ei = document.createElement('input');
        ei.className = 'rf-input'; ei.type = e[2]; ei.placeholder = e[1];
        ei.value = (it.enclosure && it.enclosure[e[0]]) || '';
        ei.addEventListener('input', function () {
          state.items[idx].enclosure[e[0]] = ei.value;
          markChanged();
        });
        encRow.appendChild(ei);
      });
      encLabel.appendChild(encRow);
      card.appendChild(encLabel);
      wrap.appendChild(card);
    });
  }
  function loadExample(idx) {
    var ex = EXAMPLES[idx];
    if (!ex) return;
    state.items = JSON.parse(JSON.stringify(ex.items));
    writeChannel(ex.channel);
    state.interacted = true;
    renderItems(); regenerate();
    toast('已载入示例：' + ex.name + '，可再改再生成');
  }
  function bindPage() {
    ['rf-ch-title', 'rf-ch-link', 'rf-ch-desc', 'rf-ch-lang',
     'rf-ch-copy', 'rf-ch-email', 'rf-ch-image'].forEach(function (id) {
      var el = $(id); if (el) el.addEventListener('input', markChanged);
    });
    var radios = document.querySelectorAll('input[name="rf-format"]');
    for (var i = 0; i < radios.length; i++) {
      radios[i].addEventListener('change', markChanged);
    }
    var exBtns = document.querySelectorAll('[data-example]');
    for (var j = 0; j < exBtns.length; j++) {
      (function (b) {
        b.addEventListener('click', function () {
          loadExample(parseInt(b.getAttribute('data-example'), 10));
        });
      })(exBtns[j]);
    }
    var addBtn = $('rf-add-item');
    if (addBtn) addBtn.addEventListener('click', function () {
      state.interacted = true;
      state.items.push(emptyItem()); renderItems(); regenerate();
    });
    var clearItems = $('rf-clear-items');
    if (clearItems) clearItems.addEventListener('click', function () {
      state.interacted = true;
      state.items = [emptyItem()]; renderItems(); regenerate();
      toast('已清空条目（保留 1 条空条目待填写）');
    });
    var clearAll = $('rf-clear-all');
    if (clearAll) clearAll.addEventListener('click', function () {
      state.interacted = true;
      writeChannel({ title: '', link: '', description: '', language: 'zh-CN',
        copyright: '', email: '', imageUrl: '' });
      state.items = [emptyItem()]; renderItems(); regenerate();
      toast('已清空频道与条目');
    });
    var copyBtn = $('rf-copy');
    if (copyBtn) copyBtn.addEventListener('click', function () {
      var out = $('rf-output'); if (!out || !out.value) { toast('暂无可复制的输出，请先通过校验'); return; }
      function fallback() {
        try {
          out.focus(); out.select();
          if (document.execCommand('copy')) { toast('已复制到剪贴板'); return; }
        } catch (e) { /* 走降级提示 */ }
        toast('复制失败，请手动选中输出框内容按 Ctrl+C 复制');
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(out.value).then(function () {
          toast('已复制到剪贴板');
        }, fallback);
      } else fallback();
    });
    var dlBtn = $('rf-download');
    if (dlBtn) dlBtn.addEventListener('click', function () {
      var out = $('rf-output'); if (!out || !out.value) { toast('暂无可下载的输出，请先通过校验'); return; }
      var filename = readFormat() === 'atom' ? 'atom.xml' : 'feed.xml';
      var blob = new Blob([out.value], { type: 'application/xml;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 500);
      toast('已下载 ' + filename);
    });
    renderItems(); regenerate();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindPage);
  else bindPage();
}
})();
