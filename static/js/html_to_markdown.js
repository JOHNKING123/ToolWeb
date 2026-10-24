/* HTML→Markdown 转换器（html_to_markdown）- 纯前端本地转换
 * 粘贴 HTML 片段 → 遍历映射为 GFM：标题、粗斜体、删除线、链接、图片、
 * 嵌套列表（每级 2 空格缩进）、引用、行内与围栏代码、pipe 表格（含对齐
 * 与 | 转义、合并单元格拆格展开），实体经解析层解码。
 * 浏览器里用 DOMParser 解析（脚本不执行）；node 测试里用同文件内置的
 * 轻量解析器走同一棵转换树。纯函数经 module.exports 暴露供 node 测试。
 * 零网络请求：本文件不发起任何网络请求。 */
(function () {
'use strict';

/* 无 Markdown 等价物的标签：计入丢弃清单，不执行、不进正文、不展开子树。 */
var DISCARD_TAGS = ['script', 'style', 'form', 'input', 'select', 'textarea',
  'button', 'iframe', 'video', 'audio', 'canvas', 'object', 'embed',
  'noscript', 'template', 'svg', 'meta', 'link', 'title', 'head', 'base'];
var DISCARD = {};
for (var di = 0; di < DISCARD_TAGS.length; di++) DISCARD[DISCARD_TAGS[di]] = true;

var VOID_TAGS = { area: 1, base: 1, br: 1, col: 1, embed: 1, hr: 1, img: 1,
  input: 1, link: 1, meta: 1, source: 1, track: 1, wbr: 1 };
var HEADINGS = { h1: 1, h2: 2, h3: 3, h4: 4, h5: 5, h6: 6 };
/* 块级容器：只透传子块，不自身产生 Markdown 行。 */
var CONTAINERS = { div: 1, section: 1, article: 1, main: 1, header: 1,
  footer: 1, nav: 1, figure: 1, details: 1, address: 1, fieldset: 1 };

var NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  nbsp: ' ', copy: '©', reg: '®', trade: '™', hellip: '…', mdash: '—',
  ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  laquo: '«', raquo: '»', times: '×', divide: '÷', plusmn: '±',
  deg: '°', cent: '¢', pound: '£', euro: '€', sect: '§', para: '¶',
  middot: '·', bull: '•', alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ',
  pi: 'π', sigma: 'σ', omega: 'ω', infin: '∞', ne: '≠', le: '≤', ge: '≥' };

/* 实体解码：命名实体查表、数字实体（十进制/十六进制）按码点解码，未知原样保留。 */
function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9A-Fa-f]+|#\d+|[A-Za-z][A-Za-z0-9]+);/g,
    function (m, body) {
      if (body.charAt(0) === '#') {
        var code = body.charAt(1) === 'x' || body.charAt(1) === 'X'
          ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
        if (!isNaN(code) && code >= 0 && code <= 0x10FFFF) {
          try { return String.fromCodePoint(code); } catch (e) { return m; }
        }
        return m;
      }
      return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, body)
        ? NAMED_ENTITIES[body] : m;
    });
}

function collapseWs(s) {
  return String(s).replace(/[ \t\r\n\f\u00A0]+/g, ' ');
}

/* ---------- 轻量 HTML 解析器（仅 node 测试路径；浏览器走 DOMParser） ---------- */
function parseAttrs(attrText) {
  var attrs = {};
  var re = /([A-Za-z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  var m;
  while ((m = re.exec(attrText)) !== null) {
    var val = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : ''));
    attrs[m[1].toLowerCase()] = decodeEntities(val);
  }
  return attrs;
}

/* 解析 HTML 片段为通用树：{tag, attrs, children} / {tag:'#text', text}。
 * 完整文档只取 body 内容；script/style/textarea/title 按原始文本截断到闭合标签。 */
function parseFragment(html) {
  var src = String(html);
  var bodyMatch = src.match(/<body[^>]*>([\s\S]*?)<\/body\s*>/i);
  if (bodyMatch) src = bodyMatch[1];
  var root = { tag: '#root', attrs: {}, children: [] };
  var stack = [root];
  var i = 0;
  var RAW_TAGS = { script: 1, style: 1, textarea: 1, title: 1 };
  function pushText(t) {
    if (t === '') return;
    stack[stack.length - 1].children.push({ tag: '#text', text: decodeEntities(t) });
  }
  while (i < src.length) {
    var lt = src.indexOf('<', i);
    if (lt === -1) { pushText(src.slice(i)); break; }
    if (lt > i) pushText(src.slice(i, lt));
    if (src.indexOf('<!--', lt) === lt) {
      var endComment = src.indexOf('-->', lt + 4);
      if (endComment === -1) break;
      i = endComment + 3;
      continue;
    }
    var gt = src.indexOf('>', lt);
    if (gt === -1) { pushText(src.slice(lt)); break; }
    var inner = src.slice(lt + 1, gt);
    i = gt + 1;
    if (inner.charAt(0) === '!' || inner.charAt(0) === '?') continue;
    if (inner.charAt(0) === '/') {
      var closeName = inner.slice(1).trim().split(/\s+/)[0].toLowerCase();
      for (var s = stack.length - 1; s > 0; s--) {
        if (stack[s].tag === closeName) { stack.length = s; break; }
      }
      continue;
    }
    var selfClosing = /\/\s*$/.test(inner);
    var nameMatch = inner.match(/^\s*([A-Za-z][A-Za-z0-9-]*)/);
    if (!nameMatch) continue;
    var tag = nameMatch[1].toLowerCase();
    var node = { tag: tag, attrs: parseAttrs(inner.slice(nameMatch[0].length)), children: [] };
    stack[stack.length - 1].children.push(node);
    if (VOID_TAGS[tag] || selfClosing) continue;
    if (RAW_TAGS[tag]) {
      var closeRe = new RegExp('</' + tag + '\\s*>', 'i');
      var rest = src.slice(i);
      var cm = rest.match(closeRe);
      if (cm) {
        pushTextRaw(node, rest.slice(0, cm.index));
        i += cm.index + cm[0].length;
      } else {
        pushTextRaw(node, rest);
        i = src.length;
      }
      continue;
    }
    stack.push(node);
  }
  function pushTextRaw(parent, t) {
    if (t !== '') parent.children.push({ tag: '#text', text: decodeEntities(t) });
  }
  return root.children;
}

/* ---------- DOMParser 产物 → 通用树（浏览器路径） ---------- */
function domToTree(node) {
  if (node.nodeType === 3) return { tag: '#text', text: node.nodeValue || '' };
  if (node.nodeType !== 1) return null;
  var attrs = {};
  for (var a = 0; a < node.attributes.length; a++) {
    attrs[node.attributes[a].name.toLowerCase()] = node.attributes[a].value;
  }
  var children = [];
  for (var c = 0; c < node.childNodes.length; c++) {
    var t = domToTree(node.childNodes[c]);
    if (t) children.push(t);
  }
  return { tag: node.tagName.toLowerCase(), attrs: attrs, children: children };
}

/* ---------- GFM 转换（操作通用树，浏览器与 node 共用） ---------- */
function convertTree(children) {
  var dropped = {};
  var warnings = [];
  function recordDrop(tag) { dropped[tag] = (dropped[tag] || 0) + 1; }
  /* 丢弃整棵子树：自身与内部嵌套的丢弃标签逐项计数，文本一律不进正文。 */
  function recordDrops(node) {
    if (DISCARD[node.tag]) dropped[node.tag] = (dropped[node.tag] || 0) + 1;
    if (node.children) {
      for (var k = 0; k < node.children.length; k++) recordDrops(node.children[k]);
    }
  }
  function isDiscard(tag) { return !!DISCARD[tag]; }

  function collectText(node) {
    if (node.tag === '#text') return node.text;
    var out = '';
    for (var k = 0; k < node.children.length; k++) out += collectText(node.children[k]);
    return out;
  }

  function inlineNode(node) {
    if (node.tag === '#text') return collapseWs(node.text);
    if (isDiscard(node.tag)) { recordDrops(node); return ''; }
    var tag = node.tag;
    if (tag === 'br') return '  \n';
    if (tag === 'img') {
      var alt = node.attrs.alt || '';
      var src = node.attrs.src || '';
      if (!src) return alt;
      return '![' + alt + '](' + src.replace(/\s+/g, '%20') + ')';
    }
    if (tag === 'a') {
      var text = inlineNodes(node.children).trim();
      var href = node.attrs.href || '';
      if (!href) return text;
      var title = node.attrs.title ? ' "' + String(node.attrs.title).replace(/"/g, '&quot;') + '"' : '';
      return '[' + (text || href) + '](' + href.replace(/\s+/g, '%20') + title + ')';
    }
    if (tag === 'code') {
      var codeText = collapseWs(collectText(node)).trim();
      if (codeText === '') return '';
      if (codeText.indexOf('`') !== -1) return '`` ' + codeText + ' ``';
      return '`' + codeText + '`';
    }
    var inner = inlineNodes(node.children);
    if (tag === 'strong' || tag === 'b') return inner === '' ? '' : '**' + inner + '**';
    if (tag === 'em' || tag === 'i') return inner === '' ? '' : '*' + inner + '*';
    if (tag === 'del' || tag === 's' || tag === 'strike') return inner === '' ? '' : '~~' + inner + '~~';
    if (HEADINGS[tag] || tag === 'p' || tag === 'ul' || tag === 'ol' || tag === 'table' ||
        tag === 'blockquote' || tag === 'pre' || tag === 'hr' || tag === 'li') {
      return blockNode(node);
    }
    return inner;
  }

  function inlineNodes(nodes) {
    var out = '';
    for (var k = 0; k < nodes.length; k++) out += inlineNode(nodes[k]);
    return out;
  }

  function blockTextOf(node) {
    return inlineNodes(node.children).trim();
  }

  function codeLanguage(node) {
    var cls = '';
    for (var k = 0; k < node.children.length; k++) {
      if (node.children[k].tag === 'code' && node.children[k].attrs.class) {
        cls = node.children[k].attrs.class;
        break;
      }
    }
    if (!cls && node.attrs.class) cls = node.attrs.class;
    var m = cls.match(/(?:language-|lang-)([\w-]+)/);
    return m ? m[1] : '';
  }

  function tableAlign(cell) {
    var a = (cell.attrs.align || '').toLowerCase();
    if (a === 'left' || a === 'center' || a === 'right') return a;
    var style = (cell.attrs.style || '').toLowerCase();
    var m = style.match(/text-align\s*:\s*(left|center|right)/);
    return m ? m[1] : '';
  }

  function cellText(cell) {
    var t = inlineNodes(cell.children);
    t = t.replace(/  \n/g, ' ');
    t = collapseWs(t).trim();
    return t.replace(/\|/g, '\\|');
  }

  function blockTable(node) {
    var rows = [];
    function collectRows(parent) {
      for (var k = 0; k < parent.children.length; k++) {
        var ch = parent.children[k];
        if (ch.tag === 'tr') rows.push(ch);
        else if (ch.tag === 'thead' || ch.tag === 'tbody' || ch.tag === 'tfoot') collectRows(ch);
      }
    }
    collectRows(node);
    if (rows.length === 0) return '';
    var grid = [];
    var occupied = {};
    var aligns = [];
    var mergedCol = 0, mergedRow = 0;
    function spanOf(cell, name) {
      var v = parseInt(cell.attrs[name], 10);
      return isNaN(v) || v < 1 ? 1 : v;
    }
    for (var r = 0; r < rows.length; r++) {
      var cells = [];
      for (var ci = 0; ci < rows[r].children.length; ci++) {
        if (rows[r].children[ci].tag === 'th' || rows[r].children[ci].tag === 'td') cells.push(rows[r].children[ci]);
      }
      grid[r] = grid[r] || [];
      var col = 0;
      for (var ci2 = 0; ci2 < cells.length; ci2++) {
        var cell = cells[ci2];
        while (occupied[r + ',' + col]) col++;
        var cs = spanOf(cell, 'colspan');
        var rs = spanOf(cell, 'rowspan');
        if (cs > 1) mergedCol++;
        if (rs > 1) mergedRow++;
        if (r === 0) aligns[col] = tableAlign(cell);
        grid[r][col] = cellText(cell);
        for (var rr = 0; rr < rs; rr++) {
          for (var cc = 0; cc < cs; cc++) {
            if (rr === 0 && cc === 0) continue;
            occupied[(r + rr) + ',' + (col + cc)] = true;
            grid[r + rr] = grid[r + rr] || [];
            grid[r + rr][col + cc] = '';
          }
        }
        col += cs;
      }
    }
    var maxCols = 0;
    for (var gi = 0; gi < grid.length; gi++) {
      if (grid[gi]) maxCols = Math.max(maxCols, grid[gi].length);
    }
    if (maxCols === 0) return '';
    for (var gi2 = 0; gi2 < grid.length; gi2++) {
      grid[gi2] = grid[gi2] || [];
      while (grid[gi2].length < maxCols) grid[gi2].push('');
    }
    function pipeRow(cellsArr) {
      return '| ' + cellsArr.join(' | ') + ' |';
    }
    function sepFor(a) {
      if (a === 'left') return ':---';
      if (a === 'center') return ':---:';
      if (a === 'right') return '---:';
      return '---';
    }
    var seps = [];
    for (var sc = 0; sc < maxCols; sc++) seps.push(sepFor(aligns[sc] || ''));
    var lines = [pipeRow(grid[0]), '| ' + seps.join(' | ') + ' |'];
    for (var br2 = 1; br2 < grid.length; br2++) lines.push(pipeRow(grid[br2]));
    if (mergedCol > 0 || mergedRow > 0) {
      var parts = [];
      if (mergedCol > 0) parts.push('colspan ×' + mergedCol + ' 处');
      if (mergedRow > 0) parts.push('rowspan ×' + mergedRow + ' 处');
      warnings.push('表格含合并单元格（' + parts.join('、') + '），已按拆格展开：合并格内容保留在左上角，展开的空格留空。');
    }
    return lines.join('\n');
  }

  function renderList(node) {
    var items = [];
    for (var k = 0; k < node.children.length; k++) {
      if (node.children[k].tag === 'li') items.push(node.children[k]);
    }
    var lines = [];
    for (var idx = 0; idx < items.length; idx++) {
      var marker = node.tag === 'ol' ? (idx + 1) + '. ' : '- ';
      var itemStr = renderListItem(items[idx]);
      var itemLines = itemStr === '' ? [''] : itemStr.split('\n');
      lines.push(marker + itemLines[0]);
      for (var li2 = 1; li2 < itemLines.length; li2++) {
        lines.push(itemLines[li2] === '' ? '' : '  ' + itemLines[li2]);
      }
    }
    return lines.join('\n');
  }

  function renderListItem(li) {
    var segments = [];
    var buf = [];
    function flushBuf() {
      var t = inlineNodes(buf).trim();
      buf = [];
      if (t !== '') segments.push({ type: 'text', str: t });
    }
    for (var k = 0; k < li.children.length; k++) {
      var ch = li.children[k];
      if (ch.tag === 'ul' || ch.tag === 'ol') {
        flushBuf();
        var sub = renderList(ch);
        if (sub !== '') segments.push({ type: 'list', str: sub });
      } else if (ch.tag === 'p' || ch.tag === 'div' || ch.tag === 'blockquote' ||
                 ch.tag === 'pre' || ch.tag === 'table' || ch.tag === 'hr' ||
                 HEADINGS[ch.tag]) {
        flushBuf();
        var b = blockNode(ch);
        if (b !== '') segments.push({ type: 'block', str: b });
      } else if (isDiscard(ch.tag)) {
        recordDrops(ch);
      } else {
        buf.push(ch);
      }
    }
    flushBuf();
    if (segments.length === 0) return '';
    var out = segments[0].str;
    for (var si = 1; si < segments.length; si++) {
      out += (segments[si].type === 'list' ? '\n' : '\n\n') + segments[si].str;
    }
    return out;
  }

  function blockNode(node) {
    var tag = node.tag;
    if (isDiscard(tag)) { recordDrops(node); return ''; }
    if (HEADINGS[tag]) {
      var ht = blockTextOf(node);
      return ht === '' ? '' : '#'.repeat(HEADINGS[tag]) + ' ' + ht;
    }
    if (tag === 'p') return blockTextOf(node);
    if (tag === 'hr') return '---';
    if (tag === 'pre') {
      var lang = codeLanguage(node);
      var raw = collectText(node).replace(/^\n+/, '').replace(/\n+$/, '');
      return '```' + lang + '\n' + raw + '\n```';
    }
    if (tag === 'blockquote') {
      var inner = renderBlocks(node.children);
      if (inner === '') return '';
      return inner.split('\n').map(function (l) {
        return l === '' ? '>' : '> ' + l;
      }).join('\n');
    }
    if (tag === 'ul' || tag === 'ol') return renderList(node);
    if (tag === 'table') return blockTable(node);
    if (tag === 'figcaption') {
      var ft = blockTextOf(node);
      return ft === '' ? '' : '*' + ft + '*';
    }
    if (tag === 'li') return '- ' + renderListItem(node);
    if (CONTAINERS[tag] || tag === 'body' || tag === 'html') return renderBlocks(node.children);
    /* 未知标签：透传子块，行内内容退化为行内文本。 */
    var hasElement = false;
    for (var k = 0; k < node.children.length; k++) {
      if (node.children[k].tag !== '#text') { hasElement = true; break; }
    }
    if (hasElement) return renderBlocks(node.children);
    return blockTextOf(node);
  }

  function renderBlocks(nodes) {
    var blocks = [];
    var buf = [];
    function flushBuf() {
      var t = inlineNodes(buf).trim();
      buf = [];
      if (t !== '') blocks.push(t);
    }
    for (var k = 0; k < nodes.length; k++) {
      var n = nodes[k];
      if (n.tag === '#text') {
        if (collapseWs(n.text).trim() !== '') buf.push(n);
        continue;
      }
      if (isDiscard(n.tag)) { flushBuf(); recordDrops(n); continue; }
      if (HEADINGS[n.tag] || n.tag === 'p' || n.tag === 'ul' || n.tag === 'ol' ||
          n.tag === 'blockquote' || n.tag === 'pre' || n.tag === 'table' ||
          n.tag === 'hr' || CONTAINERS[n.tag] || n.tag === 'li' ||
          n.tag === 'figcaption') {
        flushBuf();
        var b = blockNode(n);
        if (b !== '') blocks.push(b);
      } else {
        buf.push(n);
      }
    }
    flushBuf();
    return blocks.join('\n\n');
  }

  var markdown = renderBlocks(children);
  var droppedList = [];
  for (var key in dropped) {
    if (Object.prototype.hasOwnProperty.call(dropped, key)) {
      droppedList.push({ tag: key, count: dropped[key] });
    }
  }
  return { markdown: markdown, dropped: droppedList, warnings: warnings };
}

/* 转换主入口：输入原始 HTML 字符串，输出 {valid, errors, markdown, dropped, warnings}。
 * 空输入返回错误而非空字符串；纯文本按段落原样输出，不报错。 */
function convertHtml(html) {
  var raw = (html === null || html === undefined) ? '' : String(html);
  if (raw.trim() === '') {
    return { valid: false, errors: ['请先粘贴 HTML 片段再转换'], markdown: '', dropped: [], warnings: [] };
  }
  var children;
  if (typeof DOMParser !== 'undefined') {
    var doc = new DOMParser().parseFromString(raw, 'text/html');
    children = [];
    for (var c = 0; c < doc.body.childNodes.length; c++) {
      var t = domToTree(doc.body.childNodes[c]);
      if (t) children.push(t);
    }
  } else {
    children = parseFragment(raw);
  }
  var res = convertTree(children);
  res.valid = true;
  res.errors = [];
  return res;
}

/* 4 组示例：CMS 文章 / 表格+嵌套列表 / 代码+引用+图片 / 脏 HTML，载入后均可编辑再转换。 */
var EXAMPLES = [
  {
    name: 'CMS 文章',
    html: '<h1>给新人的第一篇技术笔记</h1>\n<p>欢迎来到团队博客：这里记录<strong>踩过的坑</strong>和<em>真正有用的经验</em>，而不是正确的废话。</p>\n<h2>先说结论</h2>\n<p>遇到问题先看<a href="https://example.com/docs">官方文档</a>，再翻旧代码，最后再问人。</p>\n<ul>\n  <li>复现问题</li>\n  <li>定位最小范围</li>\n  <li>写测试锁定行为</li>\n</ul>'
  },
  {
    name: '表格 + 嵌套列表',
    html: '<h2>本周任务与进度</h2>\n<ul>\n  <li>前端\n    <ul>\n      <li>首页改版</li>\n      <li>列表页空态</li>\n    </ul>\n  </li>\n  <li>后端\n    <ul>\n      <li>接口限流</li>\n    </ul>\n  </li>\n</ul>\n<table>\n  <thead><tr><th align="left">任务</th><th align="center">负责人</th><th align="right">进度</th></tr></thead>\n  <tbody>\n    <tr><td>首页改版</td><td>小林</td><td>80%</td></tr>\n    <tr><td colspan="2">合计：A | B 两项并行</td><td>进行中</td></tr>\n  </tbody>\n</table>'
  },
  {
    name: '代码 + 引用 + 图片',
    html: '<blockquote><p>先让它跑起来，再让它跑得快，最后让它好看。</p></blockquote>\n<p>入口只有三行：<code>npm install</code> 然后 <code>npm run dev</code>。</p>\n<pre><code class="language-js">function greet(name) {\n  return "你好，" + name;\n}</code></pre>\n<p><img src="https://example.com/arch.png" alt="系统架构图"></p>'
  },
  {
    name: '脏 HTML',
    html: '<div class="post" style="color:red;font-size:20px;"><h2>旧系统导出的文章</h2><style>.post{color:red}</style><script>alert("x");</script><p>正文第一段，含实体：Tom &amp; Jerry &copy; 2026，价格 5 &lt; 10。</p><form action="/submit"><input type="text" name="q"><button>提交</button></form><p>第二段：<b>粗体</b>与<i>斜体</i>混排，<del>删除线内容</del>。</p><table><tr><th>名称</th><th>备注</th></tr><tr><td rowspan="2">合并项</td><td>第一行</td></tr><tr><td>第二行</td></tr></table></div>'
  }
];

var api = {
  convertHtml: convertHtml,
  convertTree: convertTree,
  parseFragment: parseFragment,
  decodeEntities: decodeEntities,
  DISCARD_TAGS: DISCARD_TAGS,
  EXAMPLES: EXAMPLES
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
} else {
  window.HtmlToMarkdown = api;
  document.addEventListener('DOMContentLoaded', function () {
    var $ = function (id) { return document.getElementById(id); };
    var inputEl = $('hm-input'), errorEl = $('hm-errors'), resultEl = $('hm-result');
    var outputEl = $('hm-output'), droppedEl = $('hm-dropped'), warnEl = $('hm-warnings');
    var statsEl = $('hm-stats');
    var lastInput = '';

    function toast(msg) {
      var t = $('hm-toast');
      t.textContent = msg;
      t.style.display = 'block';
      setTimeout(function () { t.style.display = 'none'; }, 2600);
    }
    function showErrors(list) {
      errorEl.innerHTML = list.map(function (e) { return '<p style="margin:0;">' + e + '</p>'; }).join('');
      errorEl.style.display = 'block';
    }
    function hideErrors() { errorEl.style.display = 'none'; errorEl.innerHTML = ''; }

    function doConvert() {
      var res = convertHtml(inputEl.value);
      if (!res.valid) {
        showErrors(res.errors);
        resultEl.style.display = 'none';
        return;
      }
      hideErrors();
      lastInput = inputEl.value;
      outputEl.value = res.markdown;
      droppedEl.textContent = res.dropped.length
        ? res.dropped.map(function (d) { return d.tag + ' ×' + d.count; }).join('、')
        : '无丢弃标签';
      warnEl.textContent = res.warnings.length ? res.warnings.join(' ') : '无合并单元格提示。';
      var lines = res.markdown === '' ? 0 : res.markdown.split('\n').length;
      statsEl.textContent = '输入 ' + inputEl.value.length + ' 字符 · 输出 ' + lines + ' 行 · 丢弃 ' + res.dropped.length + ' 种标签';
      resultEl.style.display = 'block';
    }

    function copyText(text, okMsg) {
      function fallback() {
        var ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        var ok = false;
        try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        document.body.removeChild(ta);
        toast(ok ? okMsg : '复制失败，请手动选中输出框内容复制。');
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { toast(okMsg); }, fallback);
      } else { fallback(); }
    }

    $('hm-convert').addEventListener('click', doConvert);
    $('hm-reset').addEventListener('click', function () {
      if (lastInput) { inputEl.value = lastInput; doConvert(); }
      else { inputEl.value = ''; outputEl.value = ''; resultEl.style.display = 'none'; hideErrors(); }
    });
    $('hm-copy').addEventListener('click', function () {
      if (!outputEl.value) { toast('暂无可复制的 Markdown，请先转换。'); return; }
      copyText(outputEl.value, '已复制 Markdown。');
    });
    $('hm-download').addEventListener('click', function () {
      if (!outputEl.value) { toast('暂无可下载的 Markdown，请先转换。'); return; }
      var blob = new Blob([outputEl.value], { type: 'text/markdown;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'converted.md';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast('已下载 converted.md。');
    });
    document.querySelectorAll('[data-example]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var ex = EXAMPLES[parseInt(btn.getAttribute('data-example'), 10)];
        inputEl.value = ex.html;
        doConvert();
      });
    });
    inputEl.addEventListener('keydown', function (ev) {
      if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') doConvert();
    });
  });
}
})();
