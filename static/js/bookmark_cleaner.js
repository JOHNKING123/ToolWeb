/* 浏览器书签清理与分析器（bookmark_cleaner）- 纯前端本地书签治理
 *
 * 能力：
 * 1. 导入浏览器导出的 bookmarks.html（Netscape 标准格式），FileReader 本地读取，零上传
 * 2. 手写 Netscape 书签 HTML 解析（词法切分 + 建树，不依赖 DOMParser，
 *    使纯函数在浏览器与 node 下行为完全一致、可被 node 单元测试精确断言）
 * 3. URL 归一化（host 小写、去默认端口/末尾斜杠/fragment，保留 query）后做重复 URL 分组
 * 4. 重复标题分组、域名分组 TopN 统计、空文件夹（递归无链接）检测
 * 5. removeLinks / removeFolders 纯函数勾选删除（返回新 tree，不改原对象）
 * 6. 导出标准 NETSCAPE-Bookmark-file-1 书签 HTML（bookmarks-cleaned.html）
 * 7. generateExample() 内置固定示例（3 文件夹 / 7 链接）演示全流程
 *
 * 纯函数经 module.exports 暴露供 node 测试；浏览器里走 DOM。
 * 零网络请求：本文件不发起任何网络请求（无 fetch / XHR），无外部依赖。
 * 真限制：只做本地导入→分析/去重/清理→导出；不做跨设备同步、AI 摘要/语义搜索；
 * 首版不做死链检测；不收集、不上传。
 */
(function () {
'use strict';

/* ================= 0. 错误约定（家族惯例：非法抛 Error，err.field 给字段名） ================= */
function mkErr(field, message) {
  var e = new Error(message);
  e.field = field;
  return e;
}

/* ================= 1. HTML 实体编解码 ================= */
var ENTITY_MAP = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' '
};
function decodeEntities(s) {
  return String(s).replace(/&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z]+);/g, function (m, code) {
    if (code.charAt(0) === '#') {
      var n = code.charAt(1).toLowerCase() === 'x' ?
        parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return isNaN(n) || n < 0 ? m : String.fromCharCode(n);
    }
    return ENTITY_MAP.hasOwnProperty(code) ? ENTITY_MAP[code] : m;
  });
}
function escHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escAttr(s) {
  return escHtml(s).replace(/'/g, '&#39;');
}
function cleanText(s) {
  return decodeEntities(String(s)).replace(/\s+/g, ' ').trim();
}
function toIntOrNull(v) {
  if (v == null || v === '') return null;
  var n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

/* ================= 2. 属性解析（大小写不敏感，键统一大写） ================= */
function parseAttrs(attrStr) {
  var attrs = {};
  var re = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`>]+)))?/g;
  var m;
  while ((m = re.exec(attrStr || '')) !== null) {
    var name = m[1].toUpperCase();
    var val = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : ''));
    attrs[name] = decodeEntities(val);
  }
  return attrs;
}

/* ================= 3. 词法切分：书签 HTML -> tag/text token 流 =================
 * Netscape 书签文件结构高度规整（DL/DT/H3/A/P），手写切分足够且确定性强；
 * 注释先整体剔除，标签内引号中的 > 不会被误判为标签结束。 */
function tokenize(html) {
  var tokens = [];
  var clean = String(html).replace(/<!--[\s\S]*?-->/g, '');
  var re = /<(\/?)([A-Za-z][A-Za-z0-9]*)((?:"[^"]*"|'[^']*'|[^'">])*)>|([^<]+)/g;
  var m;
  while ((m = re.exec(clean)) !== null) {
    if (m[4] !== undefined) {
      tokens.push({ t: 'text', text: m[4] });
    } else {
      tokens.push({ t: m[1] ? 'close' : 'open', tag: m[2].toUpperCase(), attrs: parseAttrs(m[3] || '') });
    }
  }
  return tokens;
}

/* ================= 4. 解析：bookmarks.html -> { folders, links, tree } =================
 * tree 为嵌套节点数组：
 *   folder: { type:'folder', id, name, addDate, lastModified, children }
 *   link:   { type:'link', id, title, href, addDate, icon, folderPath:[...] }
 * folders 为全部文件夹节点（文档序，不含虚拟根），links 为全部链接节点（文档序）。
 * 非法格式（无 NETSCAPE-Bookmark-file-1 标识 / 空）抛 Error，err.field='file'。 */
function parseBookmarksHtml(htmlStr) {
  if (typeof htmlStr !== 'string' || !htmlStr.trim()) {
    throw mkErr('file', '文件内容为空，请选择浏览器导出的 bookmarks.html 文件。');
  }
  if (!/<!DOCTYPE\s+NETSCAPE-Bookmark-file-1\s*>/i.test(htmlStr)) {
    throw mkErr('file', '不是有效的 Netscape 书签文件（缺少 NETSCAPE-Bookmark-file-1 标识），请从浏览器书签管理器导出 bookmarks.html 后再试。');
  }
  var tokens = tokenize(htmlStr);
  var root = { type: 'folder', id: 'f0', name: '', addDate: null, lastModified: null, children: [] };
  var stack = [root];
  var fid = 0, lid = 0;
  var i = 0;
  while (i < tokens.length) {
    var tk = tokens[i];
    if (tk.t === 'open' && tk.tag === 'H3') {
      var name = '';
      i++;
      while (i < tokens.length && !(tokens[i].t === 'close' && tokens[i].tag === 'H3')) {
        if (tokens[i].t === 'text') name += tokens[i].text;
        i++;
      }
      var f = {
        type: 'folder',
        id: 'f' + (++fid),
        name: cleanText(name),
        addDate: toIntOrNull(tk.attrs.ADD_DATE),
        lastModified: toIntOrNull(tk.attrs.LAST_MODIFIED),
        children: []
      };
      stack[stack.length - 1].children.push(f);
      stack.push(f);
    } else if (tk.t === 'open' && tk.tag === 'A') {
      var title = '';
      i++;
      while (i < tokens.length && !(tokens[i].t === 'close' && tokens[i].tag === 'A')) {
        if (tokens[i].t === 'text') title += tokens[i].text;
        i++;
      }
      var path = [];
      for (var s = 1; s < stack.length; s++) path.push(stack[s].name);
      stack[stack.length - 1].children.push({
        type: 'link',
        id: 'l' + (++lid),
        title: cleanText(title),
        href: tk.attrs.HREF || '',
        addDate: toIntOrNull(tk.attrs.ADD_DATE),
        icon: tk.attrs.ICON || '',
        folderPath: path
      });
    } else if (tk.t === 'close' && tk.tag === 'DL') {
      if (stack.length > 1) stack.pop();
    }
    i++;
  }
  var tree = root.children;
  var folders = [], links = [];
  (function walk(nodes) {
    for (var k = 0; k < nodes.length; k++) {
      var n = nodes[k];
      if (n.type === 'folder') { folders.push(n); walk(n.children || []); }
      else if (n.type === 'link') { links.push(n); }
    }
  })(tree);
  return { folders: folders, links: links, tree: tree };
}

/* ================= 5. URL 归一化（去重依据） =================
 * 口径：host 小写、去默认端口(:80/:443)、去末尾 /（根路径除外）、去 #fragment；
 * 保留 query（不同 query 视为不同页面）；非法 URL 返回 null（不抛错，该条不参与去重）。 */
var DEFAULT_PORT_BY_SCHEME = { 'http:': '80', 'https:': '443', 'ftp:': '21', 'ws:': '80', 'wss:': '443' };
function normalizeUrl(url) {
  var s = String(url == null ? '' : url).trim();
  if (!s) return null;
  var u;
  try { u = new URL(s); } catch (e) { return null; }
  u.hostname = u.hostname.toLowerCase();
  var scheme = u.protocol.toLowerCase();
  if (u.port && DEFAULT_PORT_BY_SCHEME[scheme] === u.port) u.port = '';
  u.hash = '';
  if (u.pathname.length > 1 && u.pathname.charAt(u.pathname.length - 1) === '/') {
    u.pathname = u.pathname.slice(0, -1);
  }
  return u.href;
}
function hostOf(url) {
  try {
    var h = new URL(String(url == null ? '' : url).trim()).hostname.toLowerCase();
    return h || null;
  } catch (e) { return null; }
}
function cmpAddDate(a, b) {
  var x = a.addDate, y = b.addDate;
  if (x === y) return 0;
  if (x == null) return 1;
  if (y == null) return -1;
  return x - y;
}

/* ================= 6. 重复 URL 分组（归一化后相同，组大小>=2） =================
 * 每组内链接按 ADD_DATE 升序（最早在前，供 UI 默认保留最早一条）；组按规模降序。 */
function detectDuplicateUrls(links) {
  var map = {}, order = [];
  (links || []).forEach(function (lk) {
    var key = normalizeUrl(lk.href);
    if (key === null) return;
    if (!map[key]) { map[key] = []; order.push(key); }
    map[key].push(lk);
  });
  var groups = [];
  order.forEach(function (key) {
    if (map[key].length >= 2) {
      groups.push({ key: key, links: map[key].slice().sort(cmpAddDate) });
    }
  });
  groups.sort(function (a, b) {
    return b.links.length - a.links.length || (a.key < b.key ? -1 : (a.key > b.key ? 1 : 0));
  });
  return groups;
}

/* ================= 7. 重复标题分组（标题完全相同，组大小>=2；仅提示） ================= */
function detectDuplicateTitles(links) {
  var map = {}, order = [];
  (links || []).forEach(function (lk) {
    var key = lk.title || '';
    if (!map[key]) { map[key] = []; order.push(key); }
    map[key].push(lk);
  });
  var groups = [];
  order.forEach(function (key) {
    if (map[key].length >= 2) {
      groups.push({ key: key, links: map[key].slice().sort(cmpAddDate) });
    }
  });
  groups.sort(function (a, b) {
    return b.links.length - a.links.length || (a.key < b.key ? -1 : (a.key > b.key ? 1 : 0));
  });
  return groups;
}

/* ================= 8. 空文件夹检测（递归无链接）-> 文件夹 id 列表 ================= */
function findEmptyFolders(tree) {
  var ids = [];
  function hasLink(node) {
    var ch = node.children || [];
    for (var i = 0; i < ch.length; i++) {
      if (ch[i].type === 'link') return true;
      if (ch[i].type === 'folder' && hasLink(ch[i])) return true;
    }
    return false;
  }
  (function walk(nodes) {
    (nodes || []).forEach(function (n) {
      if (n.type === 'folder') {
        if (!hasLink(n)) ids.push(n.id);
        walk(n.children);
      }
    });
  })(tree || []);
  return ids;
}

/* ================= 9. 域名分组统计 -> [{domain, count}] 降序，取前 topN ================= */
function domainStats(links, topN) {
  var n = topN == null ? 20 : (parseInt(topN, 10) || 20);
  if (n < 1) n = 1;
  var map = {}, order = [];
  (links || []).forEach(function (lk) {
    var h = hostOf(lk.href);
    if (!h) return;
    if (!map[h]) { map[h] = 0; order.push(h); }
    map[h]++;
  });
  var arr = order.map(function (h) { return { domain: h, count: map[h] }; });
  arr.sort(function (a, b) {
    return b.count - a.count || (a.domain < b.domain ? -1 : (a.domain > b.domain ? 1 : 0));
  });
  return arr.slice(0, n);
}

/* ================= 10. 树操作（纯函数：返回新 tree，不改原对象） ================= */
function cloneTree(tree) {
  return JSON.parse(JSON.stringify(tree || []));
}
function removeLinks(tree, ids) {
  var set = {};
  (ids || []).forEach(function (id) { set[id] = true; });
  var nt = cloneTree(tree);
  (function walk(nodes) {
    for (var i = nodes.length - 1; i >= 0; i--) {
      var n = nodes[i];
      if (n.type === 'link') {
        if (set[n.id]) nodes.splice(i, 1);
      } else if (n.type === 'folder') {
        walk(n.children || []);
      }
    }
  })(nt);
  return nt;
}
function removeFolders(tree, folderIds) {
  var set = {};
  (folderIds || []).forEach(function (id) { set[id] = true; });
  var nt = cloneTree(tree);
  (function walk(nodes) {
    for (var i = nodes.length - 1; i >= 0; i--) {
      var n = nodes[i];
      if (n.type === 'folder') {
        if (set[n.id]) { nodes.splice(i, 1); continue; }
        walk(n.children || []);
      }
    }
  })(nt);
  return nt;
}
function flattenLinks(tree) {
  var out = [];
  (function walk(nodes) {
    (nodes || []).forEach(function (n) {
      if (n.type === 'link') out.push(n);
      else if (n.type === 'folder') walk(n.children);
    });
  })(tree || []);
  return out;
}
function countFolders(tree) {
  var c = 0;
  (function walk(nodes) {
    (nodes || []).forEach(function (n) {
      if (n.type === 'folder') { c++; walk(n.children); }
    });
  })(tree || []);
  return c;
}

/* ================= 11. 导出：标准 NETSCAPE-Bookmark-file-1 HTML ================= */
function exportBookmarksHtml(tree) {
  if (!Array.isArray(tree)) throw mkErr('tree', 'tree 须为节点数组。');
  var lines = [];
  lines.push('<!DOCTYPE NETSCAPE-Bookmark-file-1>');
  lines.push('<!-- This is an automatically generated file.');
  lines.push('     It will be read and overwritten.');
  lines.push('     DO NOT EDIT! -->');
  lines.push('<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">');
  lines.push('<TITLE>Bookmarks</TITLE>');
  lines.push('<H1>Bookmarks</H1>');
  lines.push('<DL><p>');
  function folderLastModified(f) {
    var best = f.addDate;
    (function w(ns) {
      (ns || []).forEach(function (n) {
        if (n.type === 'link') {
          if (n.addDate != null && (best == null || n.addDate > best)) best = n.addDate;
        } else if (n.type === 'folder') {
          if (n.addDate != null && (best == null || n.addDate > best)) best = n.addDate;
          w(n.children);
        }
      });
    })(f.children);
    return best;
  }
  (function walk(nodes, depth) {
    var pad = new Array(depth + 1).join('    ');
    (nodes || []).forEach(function (n) {
      if (n.type === 'folder') {
        var fa = '';
        if (n.addDate != null) fa += ' ADD_DATE="' + n.addDate + '"';
        var lm = folderLastModified(n);
        if (lm != null) fa += ' LAST_MODIFIED="' + lm + '"';
        lines.push(pad + '<DT><H3' + fa + '>' + escHtml(n.name) + '</H3>');
        lines.push(pad + '<DL><p>');
        walk(n.children, depth + 1);
        lines.push(pad + '</DL><p>');
      } else {
        var la = ' HREF="' + escAttr(n.href || '') + '"';
        if (n.addDate != null) la += ' ADD_DATE="' + n.addDate + '"';
        if (n.icon) la += ' ICON="' + escAttr(n.icon) + '"';
        lines.push(pad + '<DT><A' + la + '>' + escHtml(n.title || '') + '</A>');
      }
    });
  })(tree, 1);
  lines.push('</DL><p>');
  return lines.join('\n');
}
function suggestExportName() {
  return 'bookmarks-cleaned.html';
}

/* ================= 12. 内置示例（固定）：3 文件夹 / 7 链接 =================
 * - 2 条 URL 重复（末尾斜杠差异，归一化后同组；host 大小写差异一并覆盖）
 * - 1 组标题重复（同名、不同 URL）
 * - 1 个空文件夹
 * - 域名分布：example.com x3（统计 Top1），其余各 x1 */
function generateExample() {
  var L = [];
  L.push('<!DOCTYPE NETSCAPE-Bookmark-file-1>');
  L.push('<!-- This is an automatically generated file.');
  L.push('     It will be read and overwritten.');
  L.push('     DO NOT EDIT! -->');
  L.push('<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">');
  L.push('<TITLE>Bookmarks</TITLE>');
  L.push('<H1>Bookmarks</H1>');
  L.push('<DL><p>');
  L.push('    <DT><H3 ADD_DATE="1700000000" LAST_MODIFIED="1700000004">技术博客</H3>');
  L.push('    <DL><p>');
  L.push('        <DT><A HREF="https://Example.com/a/" ADD_DATE="1700000001" ICON="data:image/png;base64,iVBORw0KGgo=">示例站点首页</A>');
  L.push('        <DT><A HREF="https://example.com/a" ADD_DATE="1700000002">示例站点首页·备用</A>');
  L.push('        <DT><A HREF="https://developer.mozilla.org/zh-CN/docs/Web" ADD_DATE="1700000003">MDN Web 文档</A>');
  L.push('        <DT><A HREF="https://github.com/" ADD_DATE="1700000004">GitHub</A>');
  L.push('    </DL><p>');
  L.push('    <DT><H3 ADD_DATE="1700000005" LAST_MODIFIED="1700000006">新闻资讯</H3>');
  L.push('    <DL><p>');
  L.push('        <DT><A HREF="https://news.example.com/today" ADD_DATE="1700000005">每日新闻</A>');
  L.push('        <DT><A HREF="https://other.example.com/latest" ADD_DATE="1700000006">每日新闻</A>');
  L.push('    </DL><p>');
  L.push('    <DT><H3 ADD_DATE="1700000007" LAST_MODIFIED="1700000007">空文件夹</H3>');
  L.push('    <DL><p>');
  L.push('    </DL><p>');
  L.push('    <DT><A HREF="https://example.com/tools" ADD_DATE="1700000008">示例工具站</A>');
  L.push('</DL><p>');
  return L.join('\n');
}

/* ================= 13. 浏览器 UI（仅浏览器执行；node 下 document 未定义则跳过） ================= */
function bcInit() {
var $ = function (id) { return document.getElementById(id);};
var state = { fileName: '', parsed: null, working: null};

function el(tag, cls, text) {
var e = document.createElement(tag);
if (cls) e.className = cls;
if (text!= null) e.textContent = text;
return e;
}
function toast(msg) {
var t = $('bc-toast');
t.textContent = msg;
t.style.display = 'block';
clearTimeout(t._t);
t._t = setTimeout(function () { t.style.display = 'none';}, 2400);
}
function showError(msg) {
var box = $('bc-error');
box.textContent = msg;
box.style.display = 'block';
}
function hideError() { $('bc-error').style.display = 'none';}
function fmtDate(addDate) {
if (addDate == null) return '未知时间';
try { return new Date(addDate * 1000).toLocaleString('zh-CN', { hour12: false});}
catch (e) { return '未知时间';}
}
function folderPathText(lk) {
return (lk.folderPath && lk.folderPath.length)? lk.folderPath.join(' / '): '（根目录）';
}
function copyText(text, done) {
if (navigator.clipboard && navigator.clipboard.writeText) {
navigator.clipboard.writeText(text).then(function () { done(true);}, function () { fallback();});
} else { fallback();}
function fallback() {
var ta = document.createElement('textarea');
ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
document.body.appendChild(ta); ta.select();
var ok = false;
try { ok = document.execCommand('copy');} catch (e) {}
document.body.removeChild(ta); done(ok);
}
}
function downloadText(fileName, text) {
var blob = new Blob([text], { type: 'text/html;charset=utf-8'});
var a = document.createElement('a');
a.href = URL.createObjectURL(blob);
a.download = fileName;
document.body.appendChild(a);
a.click();
setTimeout(function () { URL.revokeObjectURL(a.href); a.remove();}, 800);
}

/* ---------- 渲染 ---------- */
function renderAll() {
var links = flattenLinks(state.working);
var folderCount = countFolders(state.working);
var dupUrl = detectDuplicateUrls(links);
var dupTitle = detectDuplicateTitles(links);
var emptyIds = findEmptyFolders(state.working);
var domains = domainStats(links, 20);
state._dupUrl = dupUrl; state._emptyIds = emptyIds;

// 概览
var ov = $('bc-overview');
ov.innerHTML = '';
var stats = [
['总链接', links.length],
['文件夹', folderCount],
['重复 URL 组', dupUrl.length],
['重复标题组', dupTitle.length],
['空文件夹', emptyIds.length]
];
stats.forEach(function (s) {
var card = el('div', 'bc-stat');
card.appendChild(el('div', 'bc-stat-num', String(s[1])));
card.appendChild(el('div', 'bc-stat-label', s[0]));
ov.appendChild(card);
});
$('bc-file-info').textContent = '当前文件：' + state.fileName +
'（已载入 ' + links.length + ' 条链接 / ' + folderCount + ' 个文件夹）';

renderUrlGroups(dupUrl);
renderTitleGroups(dupTitle);
renderDomains(domains, links.length);
renderEmptyFolders(emptyIds);

var hasData = true;
['bc-apply-btn', 'bc-reset-btn', 'bc-export-btn', 'bc-verify-btn', 'bc-copy-btn'].forEach(function (id) {
$(id).disabled =!hasData;
});
}

function renderUrlGroups(groups) {
var box = $('bc-url-groups');
box.innerHTML = '';
$('bc-url-count').textContent = groups.length? '（' + groups.length + ' 组）': '';
if (!groups.length) { box.appendChild(el('p', 'bc-empty-note', '未发现重复 URL，书签库很干净。')); return;}
groups.forEach(function (g, gi) {
var card = el('div', 'bc-group');
var head = el('div', 'bc-group-head');
head.appendChild(el('span', 'bc-badge bc-badge-warn', g.links.length + ' 条重复'));
var keyEl = el('code', 'bc-group-key', g.key);
keyEl.title = g.key;
head.appendChild(keyEl);
head.appendChild(el('span', 'bc-group-hint', '默认保留最早收藏的一条，可改选'));
card.appendChild(head);
g.links.forEach(function (lk) {
var row = el('label', 'bc-row');
var radio = document.createElement('input');
radio.type = 'radio';
radio.name = 'bc-keep-' + gi;
radio.value = lk.id;
if (lk.id === g.links[0].id) radio.checked = true;
row.appendChild(radio);
var info = el('div', 'bc-row-info');
var t = el('div', 'bc-row-title', lk.title || '（无标题）');
info.appendChild(t);
var meta = el('div', 'bc-row-meta');
meta.appendChild(el('span', '', '文件夹：' + folderPathText(lk)));
meta.appendChild(el('span', '', '收藏：' + fmtDate(lk.addDate)));
info.appendChild(meta);
var hrefEl = el('div', 'bc-row-href', lk.href);
hrefEl.title = lk.href;
info.appendChild(hrefEl);
row.appendChild(info);
var keepTag = el('span', 'bc-keep-tag', '保留此条');
row.appendChild(keepTag);
card.appendChild(row);
});
box.appendChild(card);
});
}

function renderTitleGroups(groups) {
var box = $('bc-title-groups');
box.innerHTML = '';
$('bc-title-count').textContent = groups.length? '（' + groups.length + ' 组）': '';
if (!groups.length) { box.appendChild(el('p', 'bc-empty-note', '未发现重复标题。')); return;}
var tip = el('p', 'bc-sec-tip', '同名可能是不同网站的不同页面，仅作提示，默认不勾选删除，请逐条确认后再勾选。');
box.appendChild(tip);
groups.forEach(function (g) {
var card = el('div', 'bc-group');
var head = el('div', 'bc-group-head');
head.appendChild(el('span', 'bc-badge', g.links.length + ' 条同名'));
head.appendChild(el('span', 'bc-group-key', '标题：' + (g.key || '（空标题）')));
card.appendChild(head);
g.links.forEach(function (lk) {
var row = el('label', 'bc-row');
var cb = document.createElement('input');
cb.type = 'checkbox';
cb.setAttribute('data-bc-tdel', lk.id);
row.appendChild(cb);
var info = el('div', 'bc-row-info');
info.appendChild(el('div', 'bc-row-href', lk.href)).title = lk.href;
var meta = el('div', 'bc-row-meta');
meta.appendChild(el('span', '', '文件夹：' + folderPathText(lk)));
meta.appendChild(el('span', '', '收藏：' + fmtDate(lk.addDate)));
info.appendChild(meta);
row.appendChild(info);
row.appendChild(el('span', 'bc-keep-tag bc-del-tag', '勾选删除'));
card.appendChild(row);
});
box.appendChild(card);
});
}

function renderDomains(domains, total) {
var box = $('bc-domain-list');
box.innerHTML = '';
$('bc-domain-count').textContent = domains.length? '（Top ' + domains.length + '）': '';
if (!domains.length) { box.appendChild(el('p', 'bc-empty-note', '暂无域名数据。')); return;}
var max = domains[0].count || 1;
domains.forEach(function (d) {
var row = el('div', 'bc-dom-row');
row.appendChild(el('span', 'bc-dom-name', d.domain)).title = d.domain;
var barWrap = el('div', 'bc-dom-barwrap');
var bar = el('div', 'bc-dom-bar');
bar.style.width = Math.max(2, Math.round(d.count / max * 100)) + '%';
barWrap.appendChild(bar);
row.appendChild(barWrap);
row.appendChild(el('span', 'bc-dom-count', d.count + ' 条'));
box.appendChild(row);
});
}

function renderEmptyFolders(emptyIds) {
var box = $('bc-empty-list');
box.innerHTML = '';
$('bc-empty-count').textContent = emptyIds.length? '（' + emptyIds.length + ' 个）': '';
if (!emptyIds.length) { box.appendChild(el('p', 'bc-empty-note', '没有空文件夹。')); return;}
var tip = el('p', 'bc-sec-tip', '以下文件夹（含子文件夹）内没有任何链接，默认勾选删除。');
box.appendChild(tip);
var idToNode = {};
(function walk(nodes) {
(nodes || []).forEach(function (n) {
if (n.type === 'folder') { idToNode[n.id] = n; walk(n.children);}
});
})(state.working);
emptyIds.forEach(function (fid) {
var n = idToNode[fid];
if (!n) return;
var row = el('label', 'bc-row');
var cb = document.createElement('input');
cb.type = 'checkbox';
cb.checked = true;
cb.setAttribute('data-bc-fdel', fid);
row.appendChild(cb);
var info = el('div', 'bc-row-info');
info.appendChild(el('div', 'bc-row-title', '📁 ' + (n.name || '（未命名）')));
info.appendChild(el('div', 'bc-row-meta')).appendChild(
el('span', '', '创建：' + fmtDate(n.addDate)));
row.appendChild(info);
row.appendChild(el('span', 'bc-keep-tag bc-del-tag', '勾选删除'));
box.appendChild(row);
});
}

/* ---------- 载入 ---------- */
function loadText(text, name) {
try {
var parsed = parseBookmarksHtml(text);
state.fileName = name;
state.parsed = parsed;
state.working = cloneTree(parsed.tree);
hideError();
$('bc-verify-result').textContent = '';
renderAll();
toast('解析成功：' + parsed.folders.length + ' 个文件夹 / ' + parsed.links.length + ' 条链接');
} catch (e) {
showError('解析失败：' + (e && e.message? e.message: String(e)));
}
}
function handleFile(file) {
if (!file) return;
if (!/\.html?$/i.test(file.name || '')) {
showError('请选择浏览器导出的 bookmarks.html 文件（.html 后缀）。');
return;
}
var reader = new FileReader();
reader.onload = function () { loadText(String(reader.result || ''), file.name);};
reader.onerror = function () { showError('文件读取失败，请重试。');};
reader.readAsText(file, 'UTF-8');
}

/* ---------- 删除 / 重置 ---------- */
function collectDeletions() {
var linkIds = [], folderIds = [];
(state._dupUrl || []).forEach(function (g, gi) {
var checked = document.querySelector('input[name="bc-keep-' + gi + '"]:checked');
var keepId = checked? checked.value: (g.links[0] && g.links[0].id);
g.links.forEach(function (lk) { if (lk.id!== keepId) linkIds.push(lk.id);});
});
Array.prototype.forEach.call(
document.querySelectorAll('[data-bc-tdel]:checked'),
function (cb) { linkIds.push(cb.getAttribute('data-bc-tdel'));});
Array.prototype.forEach.call(
document.querySelectorAll('[data-bc-fdel]:checked'),
function (cb) { folderIds.push(cb.getAttribute('data-bc-fdel'));});
return { linkIds: linkIds, folderIds: folderIds};
}

/* ---------- 事件绑定 ---------- */
var drop = $('bc-drop'), fileInput = $('bc-file');
drop.addEventListener('click', function () { fileInput.click();});
fileInput.addEventListener('change', function () {
handleFile(fileInput.files && fileInput.files[0]);
fileInput.value = '';
});
;['dragover', 'dragenter'].forEach(function (ev) {
drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('bc-dragover');});
});
;['dragleave', 'drop'].forEach(function (ev) {
drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('bc-dragover');});
});
drop.addEventListener('drop', function (e) {
var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
handleFile(f);
});
$('bc-example-btn').addEventListener('click', function () {
loadText(generateExample(), '内置示例 bookmarks.html');
});

$('bc-apply-btn').addEventListener('click', function () {
if (!state.working) return;
var d = collectDeletions();
var before = flattenLinks(state.working).length;
var nt = removeLinks(state.working, d.linkIds);
nt = removeFolders(nt, d.folderIds);
state.working = nt;
var after = flattenLinks(nt).length;
$('bc-verify-result').textContent = '';
renderAll();
toast('已删除 ' + (before - after) + ' 条链接 / ' + d.folderIds.length + ' 个文件夹，统计已刷新');
});
$('bc-reset-btn').addEventListener('click', function () {
if (!state.parsed) return;
state.working = cloneTree(state.parsed.tree);
$('bc-verify-result').textContent = '';
renderAll();
toast('已重置为导入时的状态');
});
$('bc-export-btn').addEventListener('click', function () {
if (!state.working) return;
try {
var html = exportBookmarksHtml(state.working);
downloadText(suggestExportName(), html);
toast('已导出 ' + suggestExportName() + '，可回浏览器书签管理器导入');
} catch (e) {
toast('导出失败：' + e.message);
}
});
$('bc-verify-btn').addEventListener('click', function () {
if (!state.working) return;
try {
var html = exportBookmarksHtml(state.working);
var re = parseBookmarksHtml(html);
$('bc-verify-result').textContent = '✓ 导出文件重新解析通过：' +
re.folders.length + ' 个文件夹 / ' + re.links.length + ' 条链接，格式合法，可回浏览器导入。';
toast('校验通过：重新解析成功');
} catch (e) {
$('bc-verify-result').textContent = '✗ 重新解析失败：' + e.message;
}
});
$('bc-copy-btn').addEventListener('click', function () {
if (!state.working) return;
var links = flattenLinks(state.working);
var dupUrl = detectDuplicateUrls(links);
var dupTitle = detectDuplicateTitles(links);
var emptyIds = findEmptyFolders(state.working);
var domains = domainStats(links, 5);
var delUrl = dupUrl.reduce(function (a, g) { return a + g.links.length - 1;}, 0);
var lines = [
'' + state.fileName,
'总链接：' + links.length + ' ｜ 文件夹：' + countFolders(state.working),
'重复 URL：' + dupUrl.length + ' 组（按保留最早一条可删 ' + delUrl + ' 条）',
'重复标题：' + dupTitle.length + ' 组 ｜ 空文件夹：' + emptyIds.length + ' 个',
'域名 Top5：' + domains.map(function (d) { return d.domain + ' x' + d.count;}).join('、')
];
copyText(lines.join('\n'), function (ok) {
toast(ok? '统计摘要已复制': '复制失败，请手动选择复制');
});
});
}

if (typeof document!== 'undefined') {
if (document.readyState === 'loading') {
document.addEventListener('DOMContentLoaded', bcInit);
} else {
bcInit();
}
}

if (typeof module!== 'undefined' && module.exports) {
module.exports = {
parseBookmarksHtml: parseBookmarksHtml,
normalizeUrl: normalizeUrl,
detectDuplicateUrls: detectDuplicateUrls,
detectDuplicateTitles: detectDuplicateTitles,
findEmptyFolders: findEmptyFolders,
domainStats: domainStats,
removeLinks: removeLinks,
removeFolders: removeFolders,
exportBookmarksHtml: exportBookmarksHtml,
generateExample: generateExample,
suggestExportName: suggestExportName,
flattenLinks: flattenLinks,
countFolders: countFolders
};
}
})();
