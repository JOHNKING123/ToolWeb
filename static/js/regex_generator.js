/* 示例生成正则表达式（regex_generator，grex 式）- 纯前端、零依赖、零上传
 *
 * 能力：
 * 1. 多行示例字符串（每行一条）→ 确定性贪心算法生成覆盖全部示例的正则表达式
 * 2. 等长示例逐列扫描：全同字符→字面（转义）、全数字且「数字列合并为 \d」开→\d、
 *    否则→字符类（排序后合并连续区间，如 [cd]、[0-9]、[a-zA-Z]）
 * 3. 示例长度不一→按 trie 前缀分支交替 (alt1|alt2)，分支按字典序保证确定性
 * 4. 相邻相同 token 合并量词（[0-9]{3}、\d{n}），字面字符直接拼接不合并
 * 5. 选项：锚定 ^$（默认开）/ 数字列合并为 \d（默认关）/ 忽略大小写（默认关，flags=i）
 * 6. 纯函数经 module.exports 暴露供 node 测试；浏览器里走 DOM。
 * 零网络请求：本文件不发起任何网络请求。
 */
(function () {
'use strict';

/* 正则特殊字符（字符类之外出现需转义） */
var SPECIAL = '\\^$.*+?()[]{}|';

/* 单个字符转义：'.'→'\.'，普通字符原样返回。 */
function escapeRegExpChar(ch) {
  var c = String(ch).charAt(0);
  if (!c) return '';
  return SPECIAL.indexOf(c) >= 0 ? '\\' + c : c;
}

/* 多行文本（或数组）→去空行、去重后的示例数组。 */
function normalizeExamples(text) {
  var lines = Array.isArray(text)
    ? text
    : String(text === null || text === undefined ? '' : text).split(/\r?\n/);
  var out = [];
  var seen = {};
  for (var i = 0; i < lines.length; i++) {
    var s = String(lines[i]).trim();
    if (s === '' || seen[s]) continue;
    seen[s] = true;
    out.push(s);
  }
  return out;
}

/* 字符类内部转义：\ ] ^ - 需转义。 */
function escapeClassChar(c) {
  return (c === '\\' || c === ']' || c === '^' || c === '-') ? '\\' + c : c;
}

/* 字符数组→字符类字符串：按码点排序→连续区间合并。
 * ['c','d']→'[cd]'；['a','c','b']→'[a-c]'。
 * 区间按“排序后连续（含重复，码点差 ≤1 即延续）”的长度判定：
 * 长度 1→单个字符；长度 2→直接并列（如 ab）；长度 ≥3→x-y 区间。
 * 数字语义：纯数字连续 run（长度≥3） canonicalize 为 [0-9]（grex 式数字类归一），
 * 因此 charClassFromSet(['0','1','2'])→'[0-9]'；而列 (0,0,1)→'[0-1]'、列 (0,1)→'[01]'。
 * 注意：逐列扫描的数字列（digitMerge 关）要求“精确类”（只含实际出现的数字），
 * 走内部 buildCharClass(chars, false) 不做 [0-9] 归一；公开 API 做归一。 */
function buildCharClass(chars, canonicalizeDigit) {
  var seq = [];
  for (var i = 0; i < chars.length; i++) {
    var c = String(chars[i]).charAt(0);
    if (c) seq.push(c);
  }
  if (seq.length === 0) return '(?!)';
  seq.sort();
  if (canonicalizeDigit && seq.length >= 3) {
    var allDigit = true;
    var distinct = {};
    for (var d = 0; d < seq.length; d++) {
      if (!isDigit(seq[d])) { allDigit = false; break; }
      distinct[seq[d]] = true;
    }
    var dkeys = Object.keys(distinct).sort();
    var consec = dkeys.length >= 3;
    for (var e = 1; e < dkeys.length && consec; e++) {
      if (dkeys[e].charCodeAt(0) - dkeys[e - 1].charCodeAt(0) !== 1) consec = false;
    }
    if (allDigit && consec) return '[0-9]';
  }
  var parts = [];
  var k = 0;
  while (k < seq.length) {
    var j = k;
    while (j + 1 < seq.length &&
           seq[j + 1].charCodeAt(0) - seq[j].charCodeAt(0) <= 1) j++;
    var run = j - k + 1;
    if (run >= 3) {
      parts.push(escapeClassChar(seq[k]) + '-' + escapeClassChar(seq[j]));
    } else if (run === 2) {
      parts.push(escapeClassChar(seq[k]) + escapeClassChar(seq[j]));
    } else {
      parts.push(escapeClassChar(seq[k]));
    }
    k = j + 1;
  }
  return '[' + parts.join('') + ']';
}

function charClassFromSet(chars) {
  return buildCharClass(chars, true);
}

function isDigit(ch) { return ch >= '0' && ch <= '9'; }

/* 逐列扫描产出 token：{text, quantifiable}。字面不可合并量词。 */
function columnToken(examples, col, digitMerge) {
  var chars = [];
  var allSame = true;
  var allDigit = true;
  for (var i = 0; i < examples.length; i++) {
    var ch = examples[i].charAt(col);
    chars.push(ch);
    if (ch !== chars[0]) allSame = false;
    if (!isDigit(ch)) allDigit = false;
  }
  if (allSame) return { text: escapeRegExpChar(chars[0]), quantifiable: false };
  if (allDigit && digitMerge) return { text: '\\d', quantifiable: true };
  /* 数字列（digitMerge 关）用精确类：只含实际出现的数字，不做 [0-9] 归一。 */
  return { text: buildCharClass(chars, false), quantifiable: true };
}

/* 相邻相同 token 合并量词：[0-9][0-9][0-9]→[0-9]{3}，\d\d→\d{2}。 */
function mergeQuantifiers(tokens) {
  var out = '';
  var i = 0;
  while (i < tokens.length) {
    var t = tokens[i];
    if (!t.quantifiable) { out += t.text; i++; continue; }
    var j = i + 1;
    while (j < tokens.length && tokens[j].quantifiable && tokens[j].text === t.text) j++;
    var n = j - i;
    out += n === 1 ? t.text : t.text + '{' + n + '}';
    i = j;
  }
  return out;
}

/* 长度不一→trie 前缀分支交替：每个分支为从分支点起的完整转义后缀，
 * 分支按原始字符串字典序排列，保证确定性。 */
function trieAlternation(examples) {
  var root = { children: {}, terminal: false };
  for (var i = 0; i < examples.length; i++) {
    var node = root;
    var s = examples[i];
    for (var k = 0; k < s.length; k++) {
      var c = s.charAt(k);
      if (!node.children[c]) node.children[c] = { children: {}, terminal: false };
      node = node.children[c];
    }
    node.terminal = true;
  }
  /* 返回 [{raw, text}]：raw 用于字典序，text 为转义后的正则片段。 */
  function render(node, rawPrefix, escPrefix) {
    var alts = [];
    if (node.terminal) alts.push({ raw: rawPrefix, text: escPrefix });
    var keys = Object.keys(node.children).sort();
    for (var i = 0; i < keys.length; i++) {
      var c = keys[i];
      var sub = render(node.children[c], rawPrefix + c, escPrefix + escapeRegExpChar(c));
      for (var j = 0; j < sub.length; j++) alts.push(sub[j]);
    }
    if (alts.length === 1) return alts;
    /* 终端（空后缀）先入、子节点按字符序：已是字典序，stable sort 兜底。 */
    alts.sort(function (a, b) { return a.raw < b.raw ? -1 : a.raw > b.raw ? 1 : 0; });
    var body = alts.map(function (a) { return a.text; }).join('|');
    return [{ raw: rawPrefix, text: '(' + body + ')' }];
  }
  return render(root, '', '')[0].text;
}

function exampleError(message) {
  var e = new Error(message);
  e.field = 'examples';
  return e;
}

/* 主入口：示例数组（或多行文本）+ 选项 → 正则字符串。
 * options: {anchor:true, digitMerge:false, ignoreCase:false}
 * 去空行去重后不足 2 条抛 Error（err.field='examples'）。 */
function generateRegex(examples, options) {
  var opts = options || {};
  var anchor = opts.anchor !== false;
  var digitMerge = !!opts.digitMerge;
  var list = normalizeExamples(examples);
  if (list.length < 2) {
    throw exampleError('示例不足：去空行、去重后至少需要 2 条有效示例。');
  }
  var body;
  var firstLen = list[0].length;
  var allSameLength = true;
  for (var i = 1; i < list.length; i++) {
    if (list[i].length !== firstLen) { allSameLength = false; break; }
  }
  if (allSameLength) {
    var tokens = [];
    var hasLiteral = false;
    for (var col = 0; col < firstLen; col++) {
      var t = columnToken(list, col, digitMerge);
      if (!t.quantifiable) hasLiteral = true;
      tokens.push(t);
    }
    /* 存在至少一列固定字符→逐列合并；否则位置合并无意义
     *（如 [cd][ao][gt] 会过度泛化），退化为全串交替。 */
    body = hasLiteral ? mergeQuantifiers(tokens) : trieAlternation(list);
  } else {
    body = trieAlternation(list);
  }
  return (anchor ? '^' : '') + body + (anchor ? '$' : '');
}

/* 选项对应的 RegExp flags：忽略大小写开→'i'，否则 ''。 */
function flagsFor(options) {
  return options && options.ignoreCase ? 'i' : '';
}

/* 「载入示例」固定演示输入。 */
function generateExample() {
  return ['user_001', 'user_002', 'user_010'];
}

var api = {
  generateRegex: generateRegex,
  charClassFromSet: charClassFromSet,
  escapeRegExpChar: escapeRegExpChar,
  normalizeExamples: normalizeExamples,
  generateExample: generateExample,
  flagsFor: flagsFor
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
} else {
  window.RegexGenerator = api;
  document.addEventListener('DOMContentLoaded', function () {
    var $ = function (id) { return document.getElementById(id); };
    var inputEl = $('rg-input'), anchorEl = $('rg-anchor'), digitEl = $('rg-digit'),
        icaseEl = $('rg-icase'), genBtn = $('rg-generate'), loadBtn = $('rg-load-example'),
        clearBtn = $('rg-clear'), countEl = $('rg-count'), errorEl = $('rg-error'),
        resultEl = $('rg-result'), patternEl = $('rg-pattern'), flagsEl = $('rg-flags'),
        copyBtn = $('rg-copy'), testerLink = $('rg-open-tester'), explainerLink = $('rg-open-explainer');

    function toast(msg) {
      var t = $('rg-toast');
      t.textContent = msg;
      t.style.display = 'block';
      setTimeout(function () { t.style.display = 'none'; }, 2600);
    }
    function showError(msg) {
      errorEl.textContent = msg;
      errorEl.style.display = 'block';
    }
    function hideError() {
      errorEl.style.display = 'none';
      errorEl.textContent = '';
    }
    function copyText(text, done) {
      function fallback() {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        var ok = false;
        try { ok = document.execCommand('copy'); } catch (e) {}
        document.body.removeChild(ta);
        done(ok);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { done(true); }, function () { fallback(); });
      } else { fallback(); }
    }
    function currentOptions() {
      return { anchor: anchorEl.checked, digitMerge: digitEl.checked, ignoreCase: icaseEl.checked };
    }
    function refreshCount() {
      var n = normalizeExamples(inputEl.value).length;
      countEl.textContent = n >= 2
        ? '已识别 ' + n + ' 条有效示例（去空行、去重后）'
        : '已识别 ' + n + ' 条有效示例（至少需要 2 条）';
      countEl.style.color = n >= 2 ? '#065f46' : '#92400e';
    }
    function doGenerate() {
      hideError();
      try {
        var pattern = generateRegex(inputEl.value, currentOptions());
        var flags = flagsFor(currentOptions());
        patternEl.textContent = pattern;
        flagsEl.textContent = flags ? '修饰符：/' + flags + '/' : '修饰符：无';
        resultEl.style.display = 'block';
        toast('已生成正则，覆盖全部 ' + normalizeExamples(inputEl.value).length + ' 条示例。');
      } catch (e) {
        resultEl.style.display = 'none';
        showError(e && e.message ? e.message : '生成失败，请检查示例输入。');
      }
    }
    loadBtn.addEventListener('click', function () {
      inputEl.value = generateExample().join('\n');
      refreshCount();
      doGenerate();
    });
    clearBtn.addEventListener('click', function () {
      inputEl.value = '';
      resultEl.style.display = 'none';
      hideError();
      refreshCount();
      inputEl.focus();
    });
    genBtn.addEventListener('click', doGenerate);
    inputEl.addEventListener('input', refreshCount);
    inputEl.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); doGenerate(); }
    });
    copyBtn.addEventListener('click', function () {
      var p = patternEl.textContent;
      if (!p) { toast('暂无可复制的正则，请先生成。'); return; }
      copyText(p, function (ok) { toast(ok ? '正则已复制到剪贴板。' : '复制失败，请手动选择复制。'); });
    });
    /* 互链：点击时先复制正则，再跳转（目标页粘贴即用）。 */
    function copyThenGo(link) {
      link.addEventListener('click', function () {
        var p = patternEl.textContent;
        if (p) copyText(p, function () {});
      });
    }
    copyThenGo(testerLink);
    copyThenGo(explainerLink);
    refreshCount();
  });
}
})();
