/* robots.txt 校验与测试器（robots_txt_validator）- 纯前端本地解析与判定
 * 解析口径（Google 规范近似实现，不承诺与每个爬虫逐字一致）：
 * 连续 User-agent 行组成一组；规则行出现后下一个 User-agent 行开启新组；
 * Sitemap 行与组无关，单列收集；# 开头的注释与空行只保留定位、不计规则。
 * 判定口径：同组内最长匹配规则获胜；等长时 Allow 优先；无匹配规则默认允许；
 * 专属组优先于 * 组；既无专属组又无 * 组时无匹配组、默认允许。
 * 零网络请求：本文件不发起任何 fetch / XHR；内容不出浏览器。 */
(function () {
'use strict';

/* ---------- 常量 ---------- */
var AI_BOTS = ['GPTBot', 'ClaudeBot', 'CCBot', 'PerplexityBot', 'Google-Extended', 'Applebot-Extended'];
var KNOWN_DIRECTIVES = ['user-agent', 'allow', 'disallow', 'sitemap', 'crawl-delay'];

var EXAMPLES = {
  typical: [
    '# 示例一：典型站点文件',
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin/',
    'Disallow: /private/',
    '',
    'Sitemap: https://example.com/sitemap.xml',
    ''
  ].join('\n'),
  aiBlock: [
    '# 示例二：屏蔽 AI 爬虫',
    'User-agent: *',
    'Allow: /',
    '',
    'User-agent: GPTBot',
    'Disallow: /',
    '',
    'User-agent: ClaudeBot',
    'Disallow: /',
    ''
  ].join('\n')
};

/* ---------- 解析 ---------- */
/* 返回 {groups, sitemaps, orphans, lines}
 * groups[i] = {userAgents:[{value,line}], rules:[{kind,value,line,directive}],
 *   crawlDelays:[{value,line}], unknown:[{directive,value,line}]}
 * sitemaps = [{value,line}]; orphans = 组前规则行 [{kind,value,line}]；
 * lines = [{line, type:'blank'|'comment'|'directive', raw}]，供解析视图定位。 */
function parseRobots(text) {
  var result = { groups: [], sitemaps: [], orphans: [], lines: [] };
  var current = null;
  var rawLines = String(text == null ? '' : text).split('\n');
  rawLines.forEach(function (raw, idx) {
    var lineNo = idx + 1;
    var line = raw.replace(/\r$/, '');
    var hashIdx = line.indexOf('#');
    var code = hashIdx >= 0 ? line.slice(0, hashIdx) : line;
    var trimmed = code.replace(/^\s+|\s+$/g, '');
    if (trimmed === '') {
      result.lines.push({ line: lineNo, type: hashIdx >= 0 ? 'comment' : 'blank', raw: line });
      return;
    }
    result.lines.push({ line: lineNo, type: 'directive', raw: line });
    var colonIdx = trimmed.indexOf(':');
    if (colonIdx < 0) {
      // 无冒号的行：无法识别为指令，记为未知指令，不静默丢弃
      if (!current) current = newGroup(result);
      current.unknown.push({ directive: trimmed, value: '', line: lineNo });
      return;
    }
    var directiveRaw = trimmed.slice(0, colonIdx).replace(/^\s+|\s+$/g, '');
    var directive = directiveRaw.toLowerCase();
    var value = trimmed.slice(colonIdx + 1).replace(/^\s+|\s+$/g, '');
    if (directive === 'user-agent') {
      // 规则已开始的组之后出现新 User-agent，即开启新组
      if (current && (current.rules.length > 0 || current.crawlDelays.length > 0)) current = null;
      if (!current) current = newGroup(result);
      current.userAgents.push({ value: value, line: lineNo, directive: directiveRaw });
      return;
    }
    if (directive === 'sitemap') {
      result.sitemaps.push({ value: value, line: lineNo, directive: directiveRaw });
      return;
    }
    if (directive === 'allow' || directive === 'disallow') {
      if (!current) {
        result.orphans.push({ kind: directive, value: value, line: lineNo, directive: directiveRaw });
        return;
      }
      current.rules.push({ kind: directive, value: value, line: lineNo, directive: directiveRaw });
      return;
    }
    if (directive === 'crawl-delay') {
      if (!current) {
        result.orphans.push({ kind: 'crawl-delay', value: value, line: lineNo, directive: directiveRaw });
        return;
      }
      current.crawlDelays.push({ value: value, line: lineNo, directive: directiveRaw });
      return;
    }
    // 其余指令：未知指令，挂在当前组（无组时挂在首个空组占位以便展示）
    if (!current) current = newGroup(result);
    current.unknown.push({ directive: directiveRaw, value: value, line: lineNo });
  });
  return result;
}

function newGroup(result) {
  var g = { userAgents: [], rules: [], crawlDelays: [], unknown: [] };
  result.groups.push(g);
  return g;
}

/* ---------- 校验 ---------- */
/* 返回 {errors:[{line,message}], warnings:[{line,message}]}；行号均带出。 */
function validateRobots(parsed) {
  var errors = [], warnings = [];
  parsed.orphans.forEach(function (o) {
    errors.push({ line: o.line, message: '第 ' + o.line + ' 行：规则行出现在任何 User-agent 组之前，已被忽略。请先写 User-agent 行再写规则。' });
  });
  parsed.groups.forEach(function (g, gi) {
    var label = '第 ' + (gi + 1) + ' 组';
    g.userAgents.forEach(function (ua) {
      if (ua.value === '') {
        errors.push({ line: ua.line, message: '第 ' + ua.line + ' 行：User-agent 为空，该组无法匹配任何爬虫。' });
      }
    });
    if (g.userAgents.length === 0 && (g.rules.length > 0 || g.crawlDelays.length > 0)) {
      errors.push({ line: g.rules.length ? g.rules[0].line : g.crawlDelays[0].line, message: label + '：缺少 User-agent 行，规则无法归属。' });
    }
    g.rules.forEach(function (r) {
      // 规范写法只有全小写与首字母大写两种（如 Allow / Disallow），其余拼写视为大小写混写
      if (r.directive !== r.kind && r.directive !== r.kind.charAt(0).toUpperCase() + r.kind.slice(1)) {
        warnings.push({ line: r.line, message: '第 ' + r.line + ' 行：指令名「' + r.directive + '」大小写混写。指令名不区分大小写，但路径区分大小写，建议写作 ' + r.kind.charAt(0).toUpperCase() + r.kind.slice(1) + '。' });
      }
      if (r.value !== '' && r.value.charAt(0) !== '/') {
        errors.push({ line: r.line, message: '第 ' + r.line + ' 行：' + (r.kind === 'allow' ? 'Allow' : 'Disallow') + ' 路径「' + r.value + '」缺少前导 /，应写为 /' + r.value + '。' });
      }
      if (r.kind === 'disallow' && r.value === '') {
        warnings.push({ line: r.line, message: '第 ' + r.line + ' 行：空 Disallow 等于允许全部抓取，并非禁止。' });
      }
    });
    var seen = {};
    g.rules.forEach(function (r) {
      var key = r.kind + '|' + r.value;
      if (seen[key]) {
        warnings.push({ line: r.line, message: '第 ' + r.line + ' 行：与第 ' + seen[key] + ' 行重复的' + (r.kind === 'allow' ? 'Allow' : 'Disallow') + ' 规则「' + r.value + '」，重复规则不影响判定，可删除。' });
      } else {
        seen[key] = r.line;
      }
    });
    g.crawlDelays.forEach(function (cd) {
      warnings.push({ line: cd.line, message: '第 ' + cd.line + ' 行：Crawl-delay 是非标准指令，Google 已忽略，其效力因爬虫而异，仅作礼貌声明。' });
    });
    g.unknown.forEach(function (u) {
      warnings.push({ line: u.line, message: '第 ' + u.line + ' 行：未知指令「' + u.directive + '」，主流爬虫会忽略该行，请确认是否拼写错误。' });
    });
    g.userAgents.forEach(function (ua) {
      if (ua.directive && ua.directive !== 'User-agent' && ua.directive !== 'user-agent') {
        warnings.push({ line: ua.line, message: '第 ' + ua.line + ' 行：指令名「' + ua.directive + '」大小写混写。指令名不区分大小写，建议统一写作 User-agent。' });
      }
    });
  });
  parsed.sitemaps.forEach(function (s) {
    if (!/^https?:\/\/\S+$/.test(s.value)) {
      errors.push({ line: s.line, message: '第 ' + s.line + ' 行：Sitemap「' + s.value + '」不是绝对 URL，应写为以 http(s):// 开头的完整地址。' });
    }
    if (s.directive && s.directive !== 'Sitemap' && s.directive !== 'sitemap') {
      warnings.push({ line: s.line, message: '第 ' + s.line + ' 行：指令名「' + s.directive + '」大小写混写。指令名不区分大小写，建议统一写作 Sitemap。' });
    }
  });
  return { errors: errors, warnings: warnings };
}

/* ---------- 规则匹配（Google 规范近似） ---------- */
/* * 通配任意字符序列；行尾 $ 锚定结尾；无 $ 时为前缀匹配。空规则匹配不到任何路径。 */
function patternMatches(pattern, path) {
  if (!pattern) return false;
  var anchored = pattern.charAt(pattern.length - 1) === '$';
  var body = anchored ? pattern.slice(0, -1) : pattern;
  var re = '^' + body.split('*').map(function (part) {
    return part.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }).join('.*') + (anchored ? '$' : '');
  return new RegExp(re).test(path);
}

/* 选组：专属组优先于 * 组；返回 {group, groupIndex, fallback}，fallback 为
 * 'specific' | 'wildcard' | 'none'。 */
function selectGroup(parsed, agent) {
  var name = String(agent == null ? '' : agent).replace(/^\s+|\s+$/g, '').toLowerCase();
  var wildcard = null, wildcardIndex = -1;
  for (var i = 0; i < parsed.groups.length; i++) {
    var uas = parsed.groups[i].userAgents.map(function (u) { return u.value.toLowerCase(); });
    if (name !== '' && uas.indexOf(name) >= 0) {
      return { group: parsed.groups[i], groupIndex: i, fallback: 'specific' };
    }
    if (wildcard === null && uas.indexOf('*') >= 0) {
      wildcard = parsed.groups[i]; wildcardIndex = i;
    }
  }
  if (wildcard) return { group: wildcard, groupIndex: wildcardIndex, fallback: 'wildcard' };
  return { group: null, groupIndex: -1, fallback: 'none' };
}

/* 路径归一化：接受完整 URL 时取路径＋查询串；缺前导 / 时补上。 */
function normalizeTestPath(input) {
  var s = String(input == null ? '' : input).replace(/^\s+|\s+$/g, '');
  var m = s.match(/^https?:\/\/[^/]+(\/.*)?$/);
  if (m) s = m[1] || '/';
  if (s === '') s = '/';
  if (s.charAt(0) !== '/') s = '/' + s;
  return s;
}

/* URL 测试：返回 {allowed, matched, groupIndex, fallback, basis, path}。
 * matched 为 null 表示无匹配规则；basis 为一句话判定依据。 */
function testUrl(parsed, agent, input) {
  var path = normalizeTestPath(input);
  var sel = selectGroup(parsed, agent);
  if (!sel.group) {
    return { allowed: true, matched: null, groupIndex: -1, fallback: 'none', basis: '无匹配组（既无该爬虫专属组，也无 * 组），默认允许。', path: path };
  }
  var best = null;
  sel.group.rules.forEach(function (r) {
    if (!patternMatches(r.value, path)) return;
    if (!best || r.value.length > best.value.length ||
        (r.value.length === best.value.length && r.kind === 'allow' && best.kind === 'disallow')) {
      best = r;
    }
  });
  if (!best) {
    var fb = sel.fallback === 'specific' ? '专属组内无匹配规则，默认允许。' : '回落到 * 组，组内无匹配规则，默认允许。';
    return { allowed: true, matched: null, groupIndex: sel.groupIndex, fallback: sel.fallback, basis: fb, path: path };
  }
  var basis = '命中最长匹配规则「' + (best.kind === 'allow' ? 'Allow' : 'Disallow') + ': ' + best.value + '」（第 ' + best.line + ' 行，长度 ' + best.value.length + '），' +
    (best.kind === 'allow' ? 'Allow 获胜，允许抓取。' : 'Disallow 获胜，禁止抓取。');
  return { allowed: best.kind === 'allow', matched: best, groupIndex: sel.groupIndex, fallback: sel.fallback, basis: basis, path: path };
}

/* AI 爬虫放行矩阵：按首页路径 / 判定；status 为 允许 / 禁止 / 未明确。 */
function aiMatrix(parsed) {
  return AI_BOTS.map(function (bot) {
    var r = testUrl(parsed, bot, '/');
    var status = r.fallback === 'none' ? '未明确' : (r.allowed ? '允许' : '禁止');
    var detail;
    if (r.fallback === 'none') {
      detail = '无匹配组';
    } else if (!r.matched) {
      detail = (r.fallback === 'specific' ? '专属组' : '* 组') + '无匹配规则，默认允许';
    } else {
      detail = (r.fallback === 'specific' ? '专属组' : '* 组') + ' ' +
        (r.matched.kind === 'allow' ? 'Allow' : 'Disallow') + ': ' + r.matched.value + '（第 ' + r.matched.line + ' 行）';
    }
    return { bot: bot, status: status, detail: detail, fallback: r.fallback, matched: r.matched };
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    AI_BOTS: AI_BOTS, EXAMPLES: EXAMPLES,
    parseRobots: parseRobots, validateRobots: validateRobots,
    patternMatches: patternMatches, selectGroup: selectGroup,
    normalizeTestPath: normalizeTestPath, testUrl: testUrl, aiMatrix: aiMatrix
  };
  return;
}

/* ---------- 浏览器 DOM 逻辑 ---------- */
function $(id) { return document.getElementById(id); }
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function renderAll() {
  var text = $('rtv-input').value;
  var parsed = parseRobots(text);
  var check = validateRobots(parsed);
  renderGroups(parsed);
  renderCheck(check);
  renderTest(parsed);
  renderMatrix(parsed);
}

function renderGroups(parsed) {
  var html = '';
  if (parsed.groups.length === 0 && parsed.sitemaps.length === 0) {
    html = '<p class="rtv-empty">尚未解析出规则组或 Sitemap。请粘贴 robots.txt 内容，或载入下方示例。</p>';
  } else {
    parsed.groups.forEach(function (g, gi) {
      html += '<div class="rtv-group"><div class="rtv-group-head">规则组 ' + (gi + 1) + ' · User-agent：' +
        (g.userAgents.length ? g.userAgents.map(function (u) { return esc(u.value === '' ? '（空）' : u.value) + '（第 ' + u.line + ' 行）'; }).join('、') : '（无）') + '</div>';
      if (g.rules.length) {
        html += '<div class="rtv-rules">';
        g.rules.forEach(function (r) {
          html += '<div class="rtv-rule"><span class="rtv-kind ' + r.kind + '">' + (r.kind === 'allow' ? 'Allow' : 'Disallow') + '</span>' +
            '<code>' + esc(r.value === '' ? '（空）' : r.value) + '</code><span class="rtv-line">第 ' + r.line + ' 行</span></div>';
        });
        html += '</div>';
      } else {
        html += '<p class="rtv-empty">本组无 Allow / Disallow 规则行。</p>';
      }
      g.crawlDelays.forEach(function (cd) {
        html += '<div class="rtv-note">Crawl-delay: ' + esc(cd.value) + '（第 ' + cd.line + ' 行）</div>';
      });
      g.unknown.forEach(function (u) {
        html += '<div class="rtv-note warn">未识别指令：' + esc(u.directive) + ': ' + esc(u.value) + '（第 ' + u.line + ' 行）</div>';
      });
      html += '</div>';
    });
    if (parsed.sitemaps.length) {
      html += '<div class="rtv-group"><div class="rtv-group-head">Sitemap（单列，与组无关）</div><div class="rtv-rules">';
      parsed.sitemaps.forEach(function (s) {
        html += '<div class="rtv-rule"><span class="rtv-kind sitemap">Sitemap</span><code>' + esc(s.value) + '</code><span class="rtv-line">第 ' + s.line + ' 行</span></div>';
      });
      html += '</div></div>';
    }
    if (parsed.orphans.length) {
      html += '<div class="rtv-group"><div class="rtv-group-head">组前规则（已被忽略）</div><div class="rtv-rules">';
      parsed.orphans.forEach(function (o) {
        html += '<div class="rtv-rule"><span class="rtv-kind ' + (o.kind === 'allow' ? 'allow' : 'disallow') + '">' + o.kind + '</span><code>' + esc(o.value) + '</code><span class="rtv-line">第 ' + o.line + ' 行</span></div>';
      });
      html += '</div></div>';
    }
  }
  $('rtv-groups').innerHTML = html;
}

function renderCheck(check) {
  var box = $('rtv-check');
  var total = check.errors.length + check.warnings.length;
  var html = '<div class="rtv-summary ' + (check.errors.length ? 'bad' : (check.warnings.length ? 'warn' : 'good')) + '">';
  if (check.errors.length) {
    html += '发现 ' + check.errors.length + ' 个错误、' + check.warnings.length + ' 个警告，请先修错误再上线。';
  } else if (check.warnings.length) {
    html += '无错误，发现 ' + check.warnings.length + ' 个警告（不影响上线，但建议确认）。';
  } else {
    html += '未发现问题：错误 0 个，警告 0 个，可以放心使用。';
  }
  html += '</div>';
  if (total) {
    html += '<ul class="rtv-issues">';
    check.errors.forEach(function (e) { html += '<li class="err">' + esc(e.message) + '</li>'; });
    check.warnings.forEach(function (w) { html += '<li class="warn">' + esc(w.message) + '</li>'; });
    html += '</ul>';
  }
  box.innerHTML = html;
}

function renderTest(parsed) {
  var agent = $('rtv-agent').value;
  var path = $('rtv-url').value;
  if (!path.replace(/^\s+|\s+$/g, '')) {
    $('rtv-test-result').innerHTML = '<p class="rtv-empty">输入测试路径后即时出结果，例如 /private/page.html?x=1。</p>';
    return;
  }
  var r = testUrl(parsed, agent, path);
  var verdict = r.allowed ? '允许抓取' : '禁止抓取';
  var cls = r.allowed ? 'good' : 'bad';
  var groupNote = r.fallback === 'none' ? '无匹配组、默认允许' :
    (r.fallback === 'specific' ? '命中专属组（第 ' + (r.groupIndex + 1) + ' 组）' : '无专属组，回落到 * 组（第 ' + (r.groupIndex + 1) + ' 组）');
  var matchedNote = r.matched ? '命中规则：' + (r.matched.kind === 'allow' ? 'Allow' : 'Disallow') + ': ' + esc(r.matched.value) + '（第 ' + r.matched.line + ' 行）' : '命中规则：无';
  $('rtv-test-result').innerHTML = '<div class="rtv-verdict ' + cls + '">' + verdict + '</div>' +
    '<p>测试路径：<code>' + esc(r.path) + '</code> · 爬虫：<code>' + esc(agent === '' ? '（空，按 * 处理）' : agent) + '</code></p>' +
    '<p>' + matchedNote + ' · ' + esc(groupNote) + '</p><p>判定依据：' + esc(r.basis) + '</p>';
}

function renderMatrix(parsed) {
  var rows = aiMatrix(parsed);
  var html = '<table class="rtv-matrix"><thead><tr><th>AI 爬虫</th><th>首页 / 判定</th><th>命中规则简述</th></tr></thead><tbody>';
  rows.forEach(function (r) {
    var cls = r.status === '禁止' ? 'bad' : (r.status === '允许' ? 'good' : 'na');
    html += '<tr><td><b>' + esc(r.bot) + '</b></td><td><span class="rtv-badge ' + cls + '">' + r.status + '</span></td><td>' + esc(r.detail) + '</td></tr>';
  });
  html += '</tbody></table><p class="rtv-note">矩阵按首页路径 / 判定；具体路径请用上方 URL 测试。AI 爬虫是否遵守 robots.txt 取决于各厂商声明，本工具只按文件规则判定。</p>';
  $('rtv-matrix').innerHTML = html;
}

function toast(msg) {
  var el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:#111827;color:#fff;padding:.6rem 1.2rem;border-radius:.5rem;z-index:9999;font-size:.9rem;max-width:90vw;text-align:center;';
  document.body.appendChild(el);
  setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 1800);
}
function copyText(t, okMsg) {
  if (!t) { toast('内容为空，无需复制'); return; }
  function done() { toast(okMsg || '已复制到剪贴板'); }
  function fail() { toast('复制失败，请手动全选复制（浏览器未授予剪贴板权限时可用此降级方式）'); }
  if (navigator.clipboard && window.isSecureContext !== false) {
    navigator.clipboard.writeText(t).then(done, function () { fallbackCopy(t, done, fail); });
  } else {
    fallbackCopy(t, done, fail);
  }
}
function fallbackCopy(t, done, fail) {
  var ta = document.createElement('textarea');
  ta.value = t;
  ta.style.cssText = 'position:fixed;opacity:0;';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy') ? done() : fail(); }
  catch (e) { fail(); }
  document.body.removeChild(ta);
}

$('rtv-input').addEventListener('input', renderAll);
$('rtv-url').addEventListener('input', function () { renderTest(parseRobots($('rtv-input').value)); renderMatrix(parseRobots($('rtv-input').value)); });
$('rtv-agent').addEventListener('input', function () { renderTest(parseRobots($('rtv-input').value)); renderMatrix(parseRobots($('rtv-input').value)); });
['Googlebot', 'Bingbot', 'GPTBot', 'ClaudeBot', '*'].forEach(function (name) {
  var btn = document.querySelector('[data-agent="' + name + '"]');
  if (btn) btn.addEventListener('click', function () { $('rtv-agent').value = name; renderTest(parseRobots($('rtv-input').value)); });
});
$('rtv-ex-typical').addEventListener('click', function () { $('rtv-input').value = EXAMPLES.typical; renderAll(); toast('已载入示例一，可编辑后再解析与测试'); });
$('rtv-ex-aiblock').addEventListener('click', function () { $('rtv-input').value = EXAMPLES.aiBlock; renderAll(); toast('已载入示例二，可编辑后再解析与测试'); });
$('rtv-copy').addEventListener('click', function () { copyText($('rtv-input').value, 'robots.txt 原文已复制'); });
$('rtv-download').addEventListener('click', function () {
  var text = $('rtv-input').value;
  if (!text) { toast('内容为空，无法下载'); return; }
  var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = 'robots.txt';
  document.body.appendChild(a); a.click();
  setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  toast('robots.txt 已开始下载');
});
$('rtv-reset').addEventListener('click', function () {
  $('rtv-input').value = ''; $('rtv-url').value = ''; $('rtv-agent').value = '*';
  renderAll(); toast('已重置为空状态');
});

renderAll();
})();
