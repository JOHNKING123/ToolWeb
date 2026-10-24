/* 布尔搜索语句生成器（boolean_search_builder）- 纯前端本地构建
 * 分组树 -> 查询串的纯函数，经 module.exports 暴露供 node 测试；
 * 浏览器里走 DOM。零网络请求：本文件不发起任何请求，
 * Google 跳转只是打开一条链接，不上传本站数据。 */
(function () {
'use strict';

var FIELDS = ['', 'site:', 'intitle:', 'inurl:', 'filetype:', 'author:'];

function trimText(v) {
  return (v === null || v === undefined) ? '' : String(v).trim();
}

/* 含空格的术语自动加英文双引号；已含一对双引号的不重复加。 */
function quoteTerm(text) {
  var t = trimText(text);
  if (!t) return '';
  if (t.length >= 2 && t.charAt(0) === '"' && t.charAt(t.length - 1) === '"') return t;
  if (/\s/.test(t)) return '"' + t + '"';
  return t;
}

/* 术语 -> 查询片段。字段值（即术语本身）为空时不输出限定符；
 * 排除术语统一渲染为 - 前缀。 */
function formatTerm(term) {
  if (!term) return '';
  var body = quoteTerm(term.text);
  if (!body) return '';
  var field = (FIELDS.indexOf(term.field) >= 0) ? term.field : '';
  if (field) body = field + body;
  if (term.exclude) body = '-' + body;
  return body;
}

function groupOp(group) {
  return (group && group.op === 'OR') ? 'OR' : 'AND';
}

/* 序列化一个组。子组加括号、顶层组不加多余括号、
 * 排除组渲染为 NOT (...)；空术语与空组丢弃。 */
function serializeGroup(group, isChild) {
  if (!group) return '';
  var parts = [];
  var terms = group.terms || [];
  var i, f;
  for (i = 0; i < terms.length; i++) {
    f = formatTerm(terms[i]);
    if (f) parts.push(f);
  }
  var children = group.children || [];
  for (i = 0; i < children.length; i++) {
    f = serializeGroup(children[i], true);
    if (f) parts.push(f);
  }
  if (parts.length === 0) return '';
  var inner = parts.join(' ' + groupOp(group) + ' ');
  if (group.exclude) return 'NOT (' + inner + ')';
  if (isChild) return '(' + inner + ')';
  return inner;
}

function wrapNot(serialized) {
  if (!serialized) return '';
  if (serialized.indexOf('NOT ') === 0) return serialized;
  if (serialized.charAt(0) === '(' && serialized.charAt(serialized.length - 1) === ')') return 'NOT ' + serialized;
  return 'NOT (' + serialized + ')';
}

/* 多组拼接时，含顶层 AND/OR 的组需加括号定优先级（单组时不加，属必要括号而非多余括号）。 */
function parenthesizeForJoin(serialized) {
  if (!serialized) return '';
  if (serialized.indexOf('NOT ') === 0) return serialized;
  if (serialized.indexOf(' AND ') >= 0 || serialized.indexOf(' OR ') >= 0) return '(' + serialized + ')';
  return serialized;
}

/* 顶层：groups 以 between 连接；between 为 NOT 时，后续组渲染为 NOT (...)。 */
function buildQuery(groups, between) {
  if (!groups) return '';
  var parts = [];
  var i, s;
  for (i = 0; i < groups.length; i++) {
    s = serializeGroup(groups[i], false);
    if (s) parts.push(s);
  }
  if (parts.length === 0) return '';
  if (parts.length > 1) {
    for (i = 0; i < parts.length; i++) parts[i] = parenthesizeForJoin(parts[i]);
  }
  if (between === 'NOT') {
    var out = [parts[0]];
    for (i = 1; i < parts.length; i++) out.push(wrapNot(parts[i]));
    return out.join(' ');
  }
  var joiner = (between === 'OR') ? ' OR ' : ' AND ';
  return parts.join(joiner);
}

/* 括号平衡自检：左括号数永不为负且最终归零；双引号成对。 */
function checkBalanced(query) {
  var q = (query === null || query === undefined) ? '' : String(query);
  var depth = 0, quotes = 0, i, c;
  for (i = 0; i < q.length; i++) {
    c = q.charAt(i);
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth < 0) return false; }
    else if (c === '"') quotes++;
  }
  return depth === 0 && quotes % 2 === 0;
}

function emptyGroup() {
  return { op: 'AND', exclude: false, terms: [{ text: '', field: '', exclude: false }], children: [] };
}
function emptyTerm() {
  return { text: '', field: '', exclude: false };
}

/* 三组一键模板：仅为示例起点，页面注明「请按需改写」。 */
var TEMPLATES = {
  sourcing: {
    name: '招聘寻访',
    between: 'AND',
    groups: [
      { op: 'AND', exclude: false, terms: [
        { text: 'software engineer', field: '', exclude: false },
        { text: 'Python', field: '', exclude: false },
        { text: 'linkedin.com', field: 'site:', exclude: false }
      ], children: [] },
      { op: 'OR', exclude: false, terms: [
        { text: 'github.com', field: 'site:', exclude: false },
        { text: 'stackoverflow.com', field: 'site:', exclude: false }
      ], children: [] }
    ]
  },
  academic: {
    name: '学术检索',
    between: 'AND',
    groups: [
      { op: 'AND', exclude: false, terms: [
        { text: 'machine learning', field: '', exclude: false },
        { text: 'transformer', field: '', exclude: false },
        { text: 'pdf', field: 'filetype:', exclude: false },
        { text: 'tutorial', field: '', exclude: true }
      ], children: [] }
    ]
  },
  jobseek: {
    name: '求职检索',
    between: 'AND',
    groups: [
      { op: 'AND', exclude: false, terms: [
        { text: '前端工程师', field: '', exclude: false },
        { text: '深圳', field: '', exclude: false },
        { text: '招聘', field: 'intitle:', exclude: false }
      ], children: [] }
    ]
  }
};

function googleSearchUrl(query) {
  return 'https://www.google.com/search?q=' + encodeURIComponent(query);
}

var api = {
  FIELDS: FIELDS, quoteTerm: quoteTerm, formatTerm: formatTerm,
  serializeGroup: serializeGroup, buildQuery: buildQuery,
  checkBalanced: checkBalanced, emptyGroup: emptyGroup,
  emptyTerm: emptyTerm, TEMPLATES: TEMPLATES,
  googleSearchUrl: googleSearchUrl
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
} else {
  window.BooleanSearchBuilder = api;
  document.addEventListener('DOMContentLoaded', function () {
    var $ = function (id) { return document.getElementById(id); };
    var state = { between: 'AND', groups: [emptyGroup(), emptyGroup()] };
    state.groups[1].op = 'OR';
    state.groups[1].terms = [{ text: '', field: '', exclude: false }];

    function fieldOptions(selected) {
      var labels = { '': '不限', 'site:': 'site:', 'intitle:': 'intitle:', 'inurl:': 'inurl:', 'filetype:': 'filetype:', 'author:': 'author:' };
      var html = '';
      FIELDS.forEach(function (f) {
        html += '<option value="' + f + '"' + (f === selected ? ' selected' : '') + '>' + labels[f] + '</option>';
      });
      return html;
    }
    function termRowHtml(term) {
      return '<div class="bsb-term"><input class="bsb-input bsb-term-text" type="text" placeholder="术语，如 software engineer" value="' +
        String(term.text).replace(/&/g, '&amp;').replace(/"/g, '&quot;') +
        '"><select class="bsb-select bsb-term-field">' + fieldOptions(term.field) +
        '</select><label class="bsb-check"><input class="bsb-term-exclude" type="checkbox"' + (term.exclude ? ' checked' : '') + '> 排除</label>' +
        '<button class="bsb-btn bsb-term-del" type="button">删除</button></div>';
    }
    function childHtml(child, gi, ci) {
      var terms = child.terms.map(termRowHtml).join('');
      return '<div class="bsb-child" data-gi="' + gi + '" data-ci="' + ci + '"><div class="bsb-row"><b>子组</b>' +
        '<select class="bsb-select bsb-child-op"><option value="AND"' + (child.op === 'AND' ? ' selected' : '') + '>组内全部（AND）</option>' +
        '<option value="OR"' + (child.op === 'OR' ? ' selected' : '') + '>组内任一（OR）</option></select>' +
        '<label class="bsb-check"><input class="bsb-child-exclude" type="checkbox"' + (child.exclude ? ' checked' : '') + '> 排除组（NOT (...)）</label>' +
        '<button class="bsb-btn bsb-child-del" type="button">删除子组</button></div>' + terms +
        '<button class="bsb-btn bsb-child-add-term" type="button">＋ 术语</button></div>';
    }
    function render() {
      var wrap = $('bsb-groups');
      wrap.innerHTML = '';
      state.groups.forEach(function (g, gi) {
        var card = document.createElement('div');
        card.className = 'bsb-group';
        card.setAttribute('data-gi', gi);
        var terms = g.terms.map(termRowHtml).join('');
        var children = g.children.map(function (c, ci) { return childHtml(c, gi, ci); }).join('');
        card.innerHTML = '<div class="bsb-row"><b>术语组 ' + (gi + 1) + '</b>' +
          '<select class="bsb-select bsb-group-op"><option value="AND"' + (g.op === 'AND' ? ' selected' : '') + '>组内全部（AND）</option>' +
          '<option value="OR"' + (g.op === 'OR' ? ' selected' : '') + '>组内任一（OR）</option></select>' +
          '<label class="bsb-check"><input class="bsb-group-exclude" type="checkbox"' + (g.exclude ? ' checked' : '') + '> 排除组（NOT (...)）</label>' +
          '<button class="bsb-btn bsb-group-del" type="button">删除组</button></div>' + terms +
          '<div class="bsb-row"><button class="bsb-btn bsb-add-term" type="button">＋ 术语</button>' +
          '<button class="bsb-btn bsb-add-child" type="button">＋ 子组（一层嵌套）</button></div>' + children;
        wrap.appendChild(card);
      });
      refresh();
    }
    function syncFromDom() {
      var cards = document.querySelectorAll('#bsb-groups .bsb-group');
      cards.forEach(function (card, gi) {
        var g = state.groups[gi];
        if (!g) return;
        g.op = card.querySelector('.bsb-group-op').value;
        g.exclude = card.querySelector('.bsb-group-exclude').checked;
        var rows = card.querySelectorAll(':scope > .bsb-term');
        rows.forEach(function (row, ti) {
          if (!g.terms[ti]) return;
          g.terms[ti].text = row.querySelector('.bsb-term-text').value;
          g.terms[ti].field = row.querySelector('.bsb-term-field').value;
          g.terms[ti].exclude = row.querySelector('.bsb-term-exclude').checked;
        });
        var childEls = card.querySelectorAll(':scope > .bsb-child');
        childEls.forEach(function (cel, ci) {
          var c = g.children[ci];
          if (!c) return;
          c.op = cel.querySelector('.bsb-child-op').value;
          c.exclude = cel.querySelector('.bsb-child-exclude').checked;
          var crows = cel.querySelectorAll(':scope > .bsb-term');
          crows.forEach(function (row, ti) {
            if (!c.terms[ti]) return;
            c.terms[ti].text = row.querySelector('.bsb-term-text').value;
            c.terms[ti].field = row.querySelector('.bsb-term-field').value;
            c.terms[ti].exclude = row.querySelector('.bsb-term-exclude').checked;
          });
        });
      });
      state.between = $('bsb-between').value;
    }
    function refresh() {
      syncFromDom();
      var q = buildQuery(state.groups, state.between);
      var preview = $('bsb-preview');
      var hint = $('bsb-hint');
      if (q) {
        preview.textContent = q;
        hint.textContent = checkBalanced(q) ? '括号平衡 ✓　空组与空术语已丢弃，不输出畸形串。' : '括号不平衡：请检查输入（正常生成不会出现此提示）。';
      } else {
        preview.textContent = '（尚未生成：请添加至少一个非空术语）';
        hint.textContent = '空组与空术语会被丢弃，不输出畸形串；请填写术语后查看预览。';
      }
      $('bsb-google').disabled = !q;
      $('bsb-copy').disabled = !q;
    }
    function toast(msg) {
      var t = $('bsb-toast');
      t.textContent = msg;
      t.style.display = 'block';
      setTimeout(function () { t.style.display = 'none'; }, 2600);
    }
    document.addEventListener('input', function (e) {
      if (e.target.closest('#bsb-groups') || e.target.id === 'bsb-between') refresh();
    });
    document.addEventListener('change', function (e) {
      if (e.target.closest('#bsb-groups') || e.target.id === 'bsb-between') refresh();
    });
    $('bsb-groups').addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      syncFromDom();
      var card = btn.closest('.bsb-group');
      var gi = card ? parseInt(card.getAttribute('data-gi'), 10) : -1;
      var childEl = btn.closest('.bsb-child');
      if (btn.className.indexOf('bsb-add-term') >= 0 && !childEl) { state.groups[gi].terms.push(emptyTerm()); }
      else if (btn.className.indexOf('bsb-add-child') >= 0) { state.groups[gi].children.push(emptyGroup()); }
      else if (btn.className.indexOf('bsb-group-del') >= 0) { state.groups.splice(gi, 1); }
      else if (btn.className.indexOf('bsb-term-del') >= 0 && !childEl) {
        var rows = card.querySelectorAll(':scope > .bsb-term');
        var idx = Array.prototype.indexOf.call(rows, btn.closest('.bsb-term'));
        state.groups[gi].terms.splice(idx, 1);
      }
      else if (btn.className.indexOf('bsb-child-add-term') >= 0) {
        var ci = parseInt(childEl.getAttribute('data-ci'), 10);
        state.groups[gi].children[ci].terms.push(emptyTerm());
      }
      else if (btn.className.indexOf('bsb-child-del') >= 0) {
        var ci2 = parseInt(childEl.getAttribute('data-ci'), 10);
        state.groups[gi].children.splice(ci2, 1);
      }
      else if (btn.className.indexOf('bsb-term-del') >= 0 && childEl) {
        var ci3 = parseInt(childEl.getAttribute('data-ci'), 10);
        var crows = childEl.querySelectorAll(':scope > .bsb-term');
        var cidx = Array.prototype.indexOf.call(crows, btn.closest('.bsb-term'));
        state.groups[gi].children[ci3].terms.splice(cidx, 1);
      }
      if (state.groups.length === 0) state.groups.push(emptyGroup());
      render();
    });
    $('bsb-add-group').addEventListener('click', function () {
      syncFromDom();
      state.groups.push(emptyGroup());
      render();
    });
    document.querySelectorAll('[data-template]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var t = TEMPLATES[btn.getAttribute('data-template')];
        if (!t) return;
        state = JSON.parse(JSON.stringify(t));
        $('bsb-between').value = state.between;
        render();
        toast('已载入「' + t.name + '」模板，请按需改写后再生成。');
      });
    });
    $('bsb-copy').addEventListener('click', function () {
      var q = buildQuery(state.groups, state.between);
      if (!q) { toast('没有可复制的查询串，请先填写术语。'); return; }
      function fallback() {
        var ta = document.createElement('textarea');
        ta.value = q;
        document.body.appendChild(ta);
        ta.select();
        var ok = false;
        try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
        document.body.removeChild(ta);
        toast(ok ? '已复制到剪贴板。' : '复制失败，请手动选中预览区的查询串复制。');
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(q).then(function () {
          toast('已复制到剪贴板。');
        }, fallback);
      } else { fallback(); }
    });
    $('bsb-google').addEventListener('click', function () {
      var q = buildQuery(state.groups, state.between);
      if (!q) { toast('没有可搜索的查询串，请先填写术语。'); return; }
      window.open(googleSearchUrl(q), '_blank');
    });
    $('bsb-clear').addEventListener('click', function () {
      state = { between: 'AND', groups: [emptyGroup()] };
      $('bsb-between').value = 'AND';
      render();
    });
    render();
  });
}
})();
