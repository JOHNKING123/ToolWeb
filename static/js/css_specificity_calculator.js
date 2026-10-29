/* CSS 特异性计算器（css_specificity_calculator）- 纯前端本地计算
 * 选择器逐段解析、(a, b, c) 计数、字典序比较、稳定排序、
 * 文本／JSON 报告生成、示例数组、导出命名，全部为确定性纯函数。
 * 计数口径：a = ID 数；b = 类＋属性＋伪类数；c = 类型＋伪元素数；
 * 通用选择器 * 计 0；:not()／:is()／:has() 取参数中字典序最大的三元组；
 * :where() 计 0；:nth-child 等含 of 从句时本身计 b+1 再分量加 of 列表最大值；
 * legacy 单冒号 before／after／first-line／first-letter 计 c；
 * ::slotted()／::part() 只计伪元素本身，参数不另计。
 * 失败约定：非法参数抛 Error，err.field 给出字段名，不静默钳制、
 * 不静默取整、不静默截断。
 * 纯函数经 module.exports 暴露供 node 测试；浏览器里走 DOM 并挂 window。
 * 零网络请求：本文件不发起任何 fetch / XHR。 */
(function () {
'use strict';

function fail(field, message) {
  var e = new Error(message);
  e.field = field;
  throw e;
}

function isNonNegInt(v) {
  return typeof v === 'number' && isFinite(v) && v % 1 === 0 && v >= 0;
}

function checkTriple(t, field) {
  if (!t || typeof t !== 'object') fail(field || 'specificity', '特异性须为 {a, b, c} 对象');
  ['a', 'b', 'c'].forEach(function (k) {
    if (!isNonNegInt(t[k])) fail(k, '特异性分量 ' + k + ' 须为非负整数');
  });
  return { a: t.a, b: t.b, c: t.c };
}

/* 标识符：可含转义字符（反斜杠后任意一字符）。 */
function isIdentStart(ch) {
  return /[A-Za-z_\u0080-\uffff-]/.test(ch);
}
function isIdentChar(ch) {
  return /[A-Za-z0-9_\u0080-\uffff-]/.test(ch);
}
function readIdent(s, i) {
  var start = i;
  if (s[i] === '-') i++;
  if (i >= s.length) fail('selector', '选择器中标识符不完整：' + s);
  if (s[i] === '\\') { i += 2; }
  else if (isIdentStart(s[i])) { i++; }
  else fail('selector', '选择器中出现非法字符：' + s[i]);
  while (i < s.length) {
    if (s[i] === '\\') { i += 2; continue; }
    if (isIdentChar(s[i])) { i++; continue; }
    break;
  }
  return { name: s.slice(start, i), next: i };
}

/* 从 open 处起找配对 close：括号可嵌套，引号内不计，\ 转义。返回 close 下标。 */
function findMatching(s, open, close, openIdx) {
  var depth = 0, quote = null, i = openIdx;
  while (i < s.length) {
    var ch = s[i];
    if (quote) {
      if (ch === '\\') { i += 2; continue; }
      if (ch === quote) quote = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; i++; continue; }
    if (ch === '\\') { i += 2; continue; }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  fail('selector', '括号或方括号不配对：' + s);
  return -1;
}

/* 顶层切分：按 delim（单个字符）切分，括号／方括号／引号内不切分。 */
function splitTopLevel(s, delim) {
  var parts = [], depthP = 0, depthB = 0, quote = null, cur = '';
  for (var i = 0; i < s.length; i++) {
    var ch = s[i];
    if (quote) {
      cur += ch;
      if (ch === '\\' && i + 1 < s.length) { cur += s[i + 1]; i++; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (ch === '(') depthP++;
    else if (ch === ')') depthP--;
    else if (ch === '[') depthB++;
    else if (ch === ']') depthB--;
    if (ch === delim && depthP === 0 && depthB === 0) {
      parts.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  if (quote) fail('selector', '引号不配对：' + s);
  parts.push(cur);
  return parts;
}

var LEGACY_PSEUDO_ELEMENTS = {
  'before': true, 'after': true, 'first-line': true, 'first-letter': true
};
var NTH_PSEUDOS = {
  'nth-child': true, 'nth-last-child': true,
  'nth-of-type': true, 'nth-last-of-type': true
};

/* 剥离参数列表前导组合子（空格／>／+／~），剥离后为空则失败。 */
function stripLeadingCombinators(arg) {
  var s = arg.replace(/^[\s>+~]+/, '').replace(/[\s>+~]+$/, '');
  if (!s) fail('selector', '函数型伪类参数为空');
  return s;
}

function maxTripleOf(list) {
  var best = null;
  list.forEach(function (item) {
    var r = parseSelector(item);
    if (!best || compareSpecificity(r, best) > 0) best = r;
  });
  return best;
}

/* 解析单个复合选择器段，累计进 detail。返回段末下标。 */
function parseCompound(seg, i, detail) {
  var n = seg.length;
  /* 段首：类型／通用选择器／命名空间前缀。 */
  if (seg[i] === '*') {
    i++;
    if (seg[i] === '|') {
      i++;
      if (seg[i] === '*') { i++; }
      else if (i < n && (isIdentStart(seg[i]) || seg[i] === '\\')) {
        var t1 = readIdent(seg, i); i = t1.next; detail.type++;
      } else {
        fail('selector', '命名空间后缺少类型选择器：' + seg);
      }
    }
  } else if (seg[i] === '|') {
    i++;
    if (i < n && (isIdentStart(seg[i]) || seg[i] === '\\')) {
      var t0 = readIdent(seg, i); i = t0.next; detail.type++;
    } else {
      fail('selector', '命名空间后缺少类型选择器：' + seg);
    }
  } else if (i < n && (isIdentStart(seg[i]) || seg[i] === '\\')) {
    var id0 = readIdent(seg, i); i = id0.next;
    if (seg[i] === '|') {
      i++;
      if (seg[i] === '*') { i++; }
      else if (i < n && (isIdentStart(seg[i]) || seg[i] === '\\')) {
        var t2 = readIdent(seg, i); i = t2.next; detail.type++;
      } else {
        fail('selector', '命名空间后缺少类型选择器：' + seg);
      }
    } else {
      detail.type++;
    }
  }
  /* 段内剩余：#id、.class、[attr]、::伪元素、:伪类／legacy 伪元素。 */
  while (i < n) {
    var ch = seg[i];
    if (ch === '#') {
      i++;
      if (i >= n || !(isIdentStart(seg[i]) || seg[i] === '\\')) {
        fail('selector', '# 后缺少 ID 名：' + seg);
      }
      var idr = readIdent(seg, i); i = idr.next; detail.id++;
    } else if (ch === '.') {
      i++;
      if (i >= n || !(isIdentStart(seg[i]) || seg[i] === '\\')) {
        fail('selector', '. 后缺少类名：' + seg);
      }
      var clr = readIdent(seg, i); i = clr.next; detail.class++;
    } else if (ch === '[') {
      var closeB = findMatching(seg, '[', ']', i);
      if (closeB === i + 1) fail('selector', '属性选择器为空：' + seg);
      i = closeB + 1; detail.attr++;
    } else if (ch === ':') {
      if (seg[i + 1] === ':') {
        /* 伪元素。 */
        i += 2;
        if (i >= n || !(isIdentStart(seg[i]) || seg[i] === '\\')) {
          fail('selector', ':: 后缺少伪元素名：' + seg);
        }
        var per = readIdent(seg, i); i = per.next;
        detail.pseudoElement++;
        if (seg[i] === '(') {
          /* ::slotted()／::part()：参数只须配对，不另计。 */
          var closeP = findMatching(seg, '(', ')', i);
          if (closeP === i + 1) fail('selector', '伪元素参数为空：' + seg);
          i = closeP + 1;
        }
      } else {
        i++;
        if (i >= n || !(isIdentStart(seg[i]) || seg[i] === '\\')) {
          fail('selector', ': 后缺少伪类名：' + seg);
        }
        var pcr = readIdent(seg, i); i = pcr.next;
        var name = pcr.name.toLowerCase();
        if (seg[i] === '(') {
          var closeF = findMatching(seg, '(', ')', i);
          var arg = seg.slice(i + 1, closeF);
          if (!arg.trim()) fail('selector', '函数型伪类参数为空：' + seg);
          if (name === 'not' || name === 'is' || name === 'has') {
            var args = splitTopLevel(arg, ',').map(function (a) {
              return stripLeadingCombinators(a.trim());
            });
            var best = maxTripleOf(args);
            detail.id += best.detail.id;
            detail.class += best.detail.class;
            detail.attr += best.detail.attr;
            detail.pseudoClass += best.detail.pseudoClass;
            detail.pseudoElement += best.detail.pseudoElement;
            detail.type += best.detail.type;
          } else if (name === 'where') {
            /* :where() 计 0：参数仅做合法性校验，不计入。 */
            splitTopLevel(arg, ',').forEach(function (a) {
              parseSelector(stripLeadingCombinators(a.trim()));
            });
          } else if (NTH_PSEUDOS[name]) {
            detail.pseudoClass++;
            var m = arg.match(/\bof\b/i);
            if (m) {
              var before = arg.slice(0, m.index).trim();
              var ofList = arg.slice(m.index + 2).trim();
              if (!before) fail('selector', ':nth-* 的 of 从句前缺少 An+B：' + seg);
              if (!ofList) fail('selector', ':nth-* 的 of 从句为空：' + seg);
              var bestOf = maxTripleOf(splitTopLevel(ofList, ',').map(function (a) {
                return stripLeadingCombinators(a.trim());
              }));
              detail.id += bestOf.detail.id;
              detail.class += bestOf.detail.class;
              detail.attr += bestOf.detail.attr;
              detail.pseudoClass += bestOf.detail.pseudoClass;
              detail.pseudoElement += bestOf.detail.pseudoElement;
              detail.type += bestOf.detail.type;
            }
          } else {
            detail.pseudoClass++;
          }
          i = closeF + 1;
        } else if (LEGACY_PSEUDO_ELEMENTS[name]) {
          detail.pseudoElement++;
        } else {
          detail.pseudoClass++;
        }
      }
    } else {
      fail('selector', '选择器中出现非法字符：' + ch);
    }
  }
  return i;
}

/* 按组合子拆复合段：空格／>／+／~（括号与方括号内不切分）。
 * 空格只是分隔符不单独算组合子，因此 "div > p" 合法，
 * 而首尾组合子、连续显式组合子（div >> p、div > + p）均非法。 */
function splitCompounds(selector) {
  var segments = [], i = 0, n = selector.length, prevCombinator = false;
  while (true) {
    while (i < n && (selector[i] === ' ' || selector[i] === '\t')) i++;
    if (i >= n) break;
    var ch = selector[i];
    if (ch === '>' || ch === '+' || ch === '~') {
      if (segments.length === 0 || prevCombinator) {
        fail('selector', '选择器组合子位置非法（首尾或连续组合子）：' + selector);
      }
      prevCombinator = true;
      i++;
      continue;
    }
    /* 读一个复合段：深度为 0 时遇到空格或显式组合子即停。 */
    var start = i, depthP = 0, depthB = 0, quote = null;
    while (i < n) {
      var c = selector[i];
      if (quote) {
        if (c === '\\' && i + 1 < n) { i += 2; continue; }
        if (c === quote) quote = null;
        i++;
        continue;
      }
      if (c === '"' || c === "'") { quote = c; i++; continue; }
      if (c === '(') depthP++;
      else if (c === ')') depthP--;
      else if (c === '[') depthB++;
      else if (c === ']') depthB--;
      if (depthP === 0 && depthB === 0 &&
          (c === ' ' || c === '\t' || c === '>' || c === '+' || c === '~')) break;
      if (depthP < 0 || depthB < 0) fail('selector', '括号或方括号不配对：' + selector);
      i++;
    }
    if (quote) fail('selector', '引号不配对：' + selector);
    if (depthP !== 0 || depthB !== 0) fail('selector', '括号或方括号不配对：' + selector);
    var seg = selector.slice(start, i).trim();
    if (!seg) fail('selector', '选择器含空段：' + selector);
    segments.push(seg);
    prevCombinator = false;
  }
  if (prevCombinator) fail('selector', '选择器以组合子结尾：' + selector);
  if (segments.length === 0) fail('selector', '选择器为空');
  return segments;
}

function parseSelector(selector) {
  if (typeof selector !== 'string') fail('selector', '选择器须为字符串');
  var s = selector.trim();
  if (!s) fail('selector', '选择器不能为空');
  /* 注意：! ; { } 的非法判定交给 parseCompound 逐段扫描：
   * 属性方括号内的这类字符由方括号整段配对消费，不误杀。 */
  var detail = { id: 0, class: 0, attr: 0, pseudoClass: 0, pseudoElement: 0, type: 0 };
  var segments = splitCompounds(s);
  segments.forEach(function (seg) {
    parseCompound(seg, 0, detail);
  });
  return {
    selector: s,
    a: detail.id,
    b: detail.class + detail.attr + detail.pseudoClass,
    c: detail.type + detail.pseudoElement,
    detail: detail
  };
}

function formatSpecificity(t) {
  var v = checkTriple(t, 'specificity');
  return '(' + v.a + ', ' + v.b + ', ' + v.c + ')';
}

function compareSpecificity(x, y) {
  var vx = checkTriple(x, 'x');
  var vy = checkTriple(y, 'y');
  if (vx.a !== vy.a) return vx.a > vy.a ? 1 : -1;
  if (vx.b !== vy.b) return vx.b > vy.b ? 1 : -1;
  if (vx.c !== vy.c) return vx.c > vy.c ? 1 : -1;
  return 0;
}

function splitInput(text) {
  if (typeof text !== 'string') fail('text', '输入须为字符串');
  var out = [];
  text.split('\n').forEach(function (line, idx) {
    if (!line.trim()) return;
    splitTopLevel(line, ',').forEach(function (part) {
      var s = part.trim();
      if (!s) fail('selector', '第 ' + (idx + 1) + ' 行含空选择器段');
      out.push(s);
    });
  });
  return out;
}

function analyzeSelectors(selectors) {
  if (!Array.isArray(selectors)) fail('selectors', '选择器须为数组');
  if (selectors.length === 0) fail('selectors', '选择器数组不能为空');
  var entries = selectors.map(function (sel, idx) {
    var r = parseSelector(sel);
    return {
      selector: r.selector, a: r.a, b: r.b, c: r.c,
      detail: r.detail, index: idx, isWinner: false
    };
  });
  var max = { a: entries[0].a, b: entries[0].b, c: entries[0].c };
  entries.forEach(function (e) {
    if (compareSpecificity(e, max) > 0) max = { a: e.a, b: e.b, c: e.c };
  });
  entries.forEach(function (e) {
    e.isWinner = compareSpecificity(e, max) === 0;
  });
  var sorted = entries.slice().sort(function (p, q) {
    var cmp = compareSpecificity(q, p);
    if (cmp !== 0) return cmp;
    return p.index - q.index;
  });
  return { entries: entries, sorted: sorted, max: max };
}

function checkAnalyzed(analyzed) {
  if (!analyzed || typeof analyzed !== 'object' ||
      !Array.isArray(analyzed.entries) || analyzed.entries.length === 0 ||
      !analyzed.max) {
    fail('analyzed', '分析结果非法');
  }
  analyzed.entries.forEach(function (e) { checkTriple(e, 'analyzed'); });
  checkTriple(analyzed.max, 'analyzed');
  return analyzed;
}

function winnersOf(analyzed) {
  return analyzed.entries.filter(function (e) {
    return compareSpecificity(e, analyzed.max) === 0;
  }).map(function (e) { return e.selector; });
}

function buildTextReport(analyzed) {
  checkAnalyzed(analyzed);
  var lines = analyzed.entries.map(function (e) {
    return e.selector + ' ' + formatSpecificity(e);
  });
  lines.push('胜出：' + winnersOf(analyzed).join('、'));
  return lines.join('\n');
}

function buildJsonReport(analyzed) {
  checkAnalyzed(analyzed);
  return JSON.stringify({
    entries: analyzed.entries.map(function (e) {
      return { selector: e.selector, a: e.a, b: e.b, c: e.c };
    }),
    winners: winnersOf(analyzed)
  }, null, 2);
}

function generateExample() {
  return ['#header nav ul li a', '.menu li a', 'nav a', 'a', 'ul#nav li.active a:hover'];
}

function suggestExportName(kind) {
  if (kind === 'txt') return 'specificity.txt';
  if (kind === 'json') return 'specificity.json';
  fail('kind', '导出类型只认 txt 或 json：' + kind);
  return '';
}

var API = {
  parseSelector: parseSelector,
  formatSpecificity: formatSpecificity,
  compareSpecificity: compareSpecificity,
  splitInput: splitInput,
  analyzeSelectors: analyzeSelectors,
  buildTextReport: buildTextReport,
  buildJsonReport: buildJsonReport,
  generateExample: generateExample,
  suggestExportName: suggestExportName
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = API;
}
if (typeof window !== 'undefined') window.CssSpecificityCalculator = API;

/* ---------- 浏览器 UI（仅在有 DOM 时运行） ---------- */
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', function () {
    var input = document.getElementById('cs-input');
    if (!input) return;
    var tbody = document.getElementById('cs-results');
    var ranking = document.getElementById('cs-ranking');
    var reportEl = document.getElementById('cs-report');
    var hintEl = document.getElementById('cs-hint');
    var toastEl = document.getElementById('cs-toast');

    function showToast(msg) {
      if (!toastEl) return;
      toastEl.textContent = msg;
      toastEl.style.display = 'block';
      setTimeout(function () { toastEl.style.display = 'none'; }, 2200);
    }
    function detailText(d) {
      return 'ID ' + d.id + ' · 类 ' + d.class + ' · 属性 ' + d.attr +
        ' · 伪类 ' + d.pseudoClass + ' · 伪元素 ' + d.pseudoElement + ' · 类型 ' + d.type;
    }
    function render() {
      var text = input.value;
      render.lastAnalyzed = null;
      tbody.textContent = '';
      ranking.textContent = '';
      if (!text.trim()) {
        hintEl.textContent = '请先输入选择器';
        reportEl.textContent = '';
        return;
      }
      hintEl.textContent = '';
      var selectors;
      try {
        selectors = API.splitInput(text);
      } catch (e) {
        hintEl.textContent = e.message;
        reportEl.textContent = '';
        return;
      }
      var good = [], errors = [];
      selectors.forEach(function (sel) {
        try { good.push(API.parseSelector(sel)); }
        catch (e) { errors.push({ selector: sel, message: e.message }); }
      });
      /* 结果表：先合法行（输入顺序），后非法行红字降级。 */
      var analyzed = null;
      if (good.length) {
        analyzed = API.analyzeSelectors(good.map(function (g) { return g.selector; }));
        analyzed.entries.forEach(function (e) {
          var tr = document.createElement('tr');
          var tdSel = document.createElement('td'); tdSel.textContent = e.selector;
          var tdSpec = document.createElement('td'); tdSpec.textContent = API.formatSpecificity(e);
          var tdDetail = document.createElement('td'); tdDetail.textContent = detailText(e.detail);
          var tdMark = document.createElement('td');
          var winners = analyzed.entries.filter(function (x) { return x.isWinner; }).length;
          tdMark.textContent = e.isWinner ? (winners > 1 ? '并列胜出' : '胜出') : '—';
          if (e.isWinner) tdMark.style.fontWeight = '700';
          tr.appendChild(tdSel); tr.appendChild(tdSpec);
          tr.appendChild(tdDetail); tr.appendChild(tdMark);
          tbody.appendChild(tr);
        });
        analyzed.sorted.forEach(function (e, rank) {
          var li = document.createElement('li');
          var winners = analyzed.entries.filter(function (x) { return x.isWinner; }).length;
          li.textContent = '第 ' + (rank + 1) + ' 名：' + e.selector + ' ' +
            API.formatSpecificity(e) + (e.isWinner ? (winners > 1 ? '（并列胜出）' : '（胜出）') : '');
          ranking.appendChild(li);
        });
        reportEl.textContent = API.buildTextReport(analyzed);
      } else {
        reportEl.textContent = '';
      }
      errors.forEach(function (err) {
        var tr = document.createElement('tr');
        var tdSel = document.createElement('td'); tdSel.textContent = err.selector;
        var tdErr = document.createElement('td');
        tdErr.textContent = '非法：' + err.message;
        tdErr.style.color = '#dc2626';
        tdErr.colSpan = 3;
        tr.appendChild(tdSel); tr.appendChild(tdErr);
        tbody.appendChild(tr);
      });
      /* 供导出按钮使用：最近一次合法分析结果。 */
      render.lastAnalyzed = analyzed;
    }
    function download(filename, content, type) {
      var blob = new Blob([content], { type: type || 'text/plain;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 500);
    }
    function copyText(text, okMsg) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          showToast(okMsg);
        }, function () { showToast('复制失败，请手动选中结果区内容复制'); });
      } else {
        showToast('当前浏览器不支持自动复制，请手动选中结果区内容复制');
      }
    }
    input.addEventListener('input', render);
    document.getElementById('cs-copy').addEventListener('click', function () {
      if (!render.lastAnalyzed) { showToast('请先输入合法选择器'); return; }
      copyText(API.buildTextReport(render.lastAnalyzed), '结果已复制');
    });
    document.getElementById('cs-download-txt').addEventListener('click', function () {
      if (!render.lastAnalyzed) { showToast('请先输入合法选择器'); return; }
      download(API.suggestExportName('txt'), API.buildTextReport(render.lastAnalyzed));
      showToast('已下载 specificity.txt');
    });
    document.getElementById('cs-download-json').addEventListener('click', function () {
      if (!render.lastAnalyzed) { showToast('请先输入合法选择器'); return; }
      download(API.suggestExportName('json'), API.buildJsonReport(render.lastAnalyzed), 'application/json;charset=utf-8');
      showToast('已下载 specificity.json');
    });
    document.getElementById('cs-load-example').addEventListener('click', function () {
      input.value = API.generateExample().join('\n');
      render();
      showToast('示例已载入');
    });
    render();
  });
}

})();
