/* ads.txt 校验器（ads_txt_validator）- 纯前端本地解析与校验
 * 解析口径（IAB Ads.txt 1.1 近似实现，不承诺与 IAB 官方验证器逐字一致）：
 * 数据记录：逗号分隔字段 —— 域名／发布商账号 ID／账号类型（DIRECT|RESELLER，全大写严格）／认证机构 ID（可选，通常为 16 位十六进制 TAG-ID）
 * 变量记录：无逗号、含 = 的行，如 OWNERDOMAIN=example.com（1.1 新增）；SUBDOMAIN / CONTACT 为 1.0 旧版字段
 * 注释：首个非空白字符为 #；空行：仅空白字符。
 * 校验：字段数 < 3 判错；账号类型大小写严格（必须全大写 DIRECT 或 RESELLER）判错；必填字段为空判错；
 * 多余字段（>4）／重复记录／可疑认证机构 ID（非 16 位十六进制）判警告；旧版或未知变量名判警告。
 * 零网络请求：本文件不发起任何 fetch / XHR；内容不出浏览器。 */
(function () {
'use strict';

/* ---------- 常量 ---------- */
var KNOWN_VARIABLES_11 = ['OWNERDOMAIN', 'MANAGERDOMAIN', 'INVENTORYPARTNERDOMAIN'];
var LEGACY_VARIABLES_10 = ['SUBDOMAIN', 'CONTACT'];
var REQUIRED_NAMES = ['域名', '发布商账号 ID', '账号类型'];
var CA_ID_RE = /^[0-9a-fA-F]{16}$/;

var EXAMPLES = {
  typical: [
    '# 示例一：典型发布商 ads.txt（IAB Ads.txt 1.1）',
    'OWNERDOMAIN=example.com',
    'google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0',
    'rubiconproject.com, 12345, DIRECT, 0bfd66d529a55807',
    'appnexus.com, 1234, RESELLER, f08c47fec0942fa0',
    'pubmatic.com, 156619, RESELLER',
    '',
    '# 以下为注释行：上架前请确认账号 ID 与贵司签约主体一致'
  ].join('\n'),
  problem: [
    '# 示例二：带问题的 ads.txt（演示错误与警告）',
    'google.com, pub-12345, direct, f08c47fec0942fa0',
    'rubiconproject.com, 12345',
    'openx.com, 1234, RESELLER, f08c47fec0942fa0, 多余字段',
    'appnexus.com, 1234, RESELLER',
    'appnexus.com, 1234, RESELLER',
    'suspicious-exchange.com, 999, DIRECT, 不是TAGID',
    'SOMEVAR=实验性字段'
  ].join('\n')
};

/* ---------- 错误约定 ---------- */
function fieldError(field, message) {
  var e = new Error(message);
  e.field = field;
  return e;
}
function isPositiveInt(n) {
  return typeof n === 'number' && isFinite(n) && Math.floor(n) === n && n >= 1;
}

/* ---------- 逐行解析 ---------- */
/* 返回 {line, type:'blank'|'comment'|'variable'|'record', raw, fields, ...}
 * record 另带：domain / accountId / accountType / caId（无第 4 字段时为 null）
 * variable 另带：name / value；comment 另带：text（# 之后的内容） */
function parseLine(text, lineNo) {
  if (typeof text !== 'string') {
    throw fieldError('text', 'parseLine(text, lineNo)：text 必须是字符串');
  }
  if (!isPositiveInt(lineNo)) {
    throw fieldError('lineNo', 'parseLine(text, lineNo)：lineNo 必须是正整数');
  }
  var raw = text;
  var line = text.replace(/\r$/, '');
  var trimmed = line.replace(/^\s+|\s+$/g, '');
  if (trimmed === '') {
    return { line: lineNo, type: 'blank', raw: raw, fields: [] };
  }
  if (trimmed.charAt(0) === '#') {
    return { line: lineNo, type: 'comment', raw: raw, fields: [],
      text: trimmed.slice(1).replace(/^\s+/, '') };
  }
  if (trimmed.indexOf(',') < 0 && trimmed.indexOf('=') >= 0) {
    var eqIdx = trimmed.indexOf('=');
    var name = trimmed.slice(0, eqIdx).replace(/^\s+|\s+$/g, '');
    var value = trimmed.slice(eqIdx + 1).replace(/^\s+|\s+$/g, '');
    return { line: lineNo, type: 'variable', raw: raw, fields: [name, value], name: name, value: value };
  }
  var fields = trimmed.split(',').map(function (f) { return f.replace(/^\s+|\s+$/g, ''); });
  return {
    line: lineNo, type: 'record', raw: raw, fields: fields,
    domain: fields[0] || '', accountId: fields[1] || '', accountType: fields[2] || '',
    caId: fields.length > 3 ? fields[3] : null
  };
}

/* ---------- 整体校验 ---------- */
/* 返回 {lines, errors:[{line,message}], warnings:[{line,message}], stats}；
 * stats = {total, records, variables, comments, blanks, errors, warnings} */
function validateAdsTxt(text) {
  if (typeof text !== 'string') {
    throw fieldError('text', 'validateAdsTxt(text)：text 必须是字符串');
  }
  var lines = [], errors = [], warnings = [];
  var seen = {};
  text.split('\n').forEach(function (raw, idx) {
    var lineNo = idx + 1;
    var pl = parseLine(raw, lineNo);
    lines.push(pl);
    if (pl.type === 'variable') {
      validateVariable(pl, warnings);
      return;
    }
    if (pl.type !== 'record') return;
    var f = pl.fields;
    if (f.length < 3) {
      errors.push({ line: lineNo, message: '第 ' + lineNo + ' 行：字段不足。数据记录至少需要 3 个字段（域名、发布商账号 ID、账号类型），本行只有 ' + f.length + ' 个。' });
      return;
    }
    var hasEmptyError = false;
    for (var i = 0; i < 3; i++) {
      if (f[i] === '') {
        errors.push({ line: lineNo, message: '第 ' + lineNo + ' 行：第 ' + (i + 1) + ' 个字段「' + REQUIRED_NAMES[i] + '」不能为空。' });
        hasEmptyError = true;
      }
    }
    // 账号类型大小写严格：必须全大写 DIRECT 或 RESELLER
    if (pl.accountType !== '' && pl.accountType !== 'DIRECT' && pl.accountType !== 'RESELLER') {
      errors.push({ line: lineNo, message: '第 ' + lineNo + ' 行：账号类型「' + pl.accountType + '」无效。必须严格写作全大写的 DIRECT 或 RESELLER（大小写敏感，小写 direct / reseller 不算数）。' });
    }
    if (hasEmptyError) return;
    if (f.length > 4) {
      warnings.push({ line: lineNo, message: '第 ' + lineNo + ' 行：有多余字段（共 ' + f.length + ' 个，规范最多 4 个）。第 5 个及之后的字段会被买方忽略，建议删除。' });
    }
    var key = f.slice(0, 4).join(',');
    if (seen[key] !== undefined) {
      warnings.push({ line: lineNo, message: '第 ' + lineNo + ' 行：与第 ' + seen[key] + ' 行重复。重复记录不影响判定但显得文件不干净，建议删除。' });
    } else {
      seen[key] = lineNo;
    }
    // 可疑认证机构 ID：通常为 16 位十六进制 TAG-ID
    if (pl.caId !== null && pl.caId !== '' && !CA_ID_RE.test(pl.caId)) {
      warnings.push({ line: lineNo, message: '第 ' + lineNo + ' 行：认证机构 ID「' + pl.caId + '」看起来不像标准的 16 位十六进制 TAG-ID，请与广告系统核对是否写错。' });
    }
  });
  var stats = { total: lines.length, records: 0, variables: 0, comments: 0, blanks: 0,
    errors: errors.length, warnings: warnings.length };
  lines.forEach(function (l) {
    if (l.type === 'record') stats.records++;
    else if (l.type === 'variable') stats.variables++;
    else if (l.type === 'comment') stats.comments++;
    else if (l.type === 'blank') stats.blanks++;
  });
  return { lines: lines, errors: errors, warnings: warnings, stats: stats };
}

/* 变量记录校验：1.1 已知变量无问题；1.0 旧版变量判警告（实验性/旧版字段口径）；
 * 未知变量名判警告。 */
function validateVariable(pl, warnings) {
  var name = pl.name.toUpperCase();
  if (KNOWN_VARIABLES_11.indexOf(name) >= 0) return;
  if (LEGACY_VARIABLES_10.indexOf(name) >= 0) {
    warnings.push({ line: pl.line, message: '第 ' + pl.line + ' 行：变量「' + pl.name + '」是 Ads.txt 1.0 的旧版字段，按 1.1 规范以警告处理。请确认买方仍识别该字段，否则可删除。' });
    return;
  }
  if (pl.name === '') {
    warnings.push({ line: pl.line, message: '第 ' + pl.line + ' 行：变量名为空（= 前无内容），该行会被忽略。' });
    return;
  }
  warnings.push({ line: pl.line, message: '第 ' + pl.line + ' 行：未知变量「' + pl.name + '」。非 IAB 1.1 规范变量，可能是实验性字段，买方可能不识别。' });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    EXAMPLES: EXAMPLES, KNOWN_VARIABLES_11: KNOWN_VARIABLES_11, LEGACY_VARIABLES_10: LEGACY_VARIABLES_10,
    parseLine: parseLine, validateAdsTxt: validateAdsTxt
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

function typeLabel(t) {
  return t === 'record' ? '记录' : t === 'variable' ? '变量' : t === 'comment' ? '注释' : '空行';
}

function renderAll() {
  var text = $('atv-input').value;
  var result = validateAdsTxt(text);
  renderStats(result.stats);
  renderIssues(result.errors, result.warnings);
  renderTable(result.lines);
}

function renderStats(stats) {
  var html = '<div class="atv-stats">' +
    statChip('总行数', stats.total) + statChip('数据记录', stats.records) +
    statChip('变量', stats.variables) + statChip('注释', stats.comments) +
    statChip('空行', stats.blanks) +
    statChip('错误', stats.errors, stats.errors ? 'bad' : '') +
    statChip('警告', stats.warnings, stats.warnings ? 'warn' : '') +
    '</div>';
  $('atv-stats').innerHTML = html;
}
function statChip(label, n, cls) {
  return '<span class="atv-chip ' + (cls || '') + '"><b>' + n + '</b>' + esc(label) + '</span>';
}

function renderIssues(errors, warnings) {
  var box = $('atv-issues');
  var html = '<div class="atv-summary ' + (errors.length ? 'bad' : (warnings.length ? 'warn' : 'good')) + '">';
  if (errors.length) {
    html += '发现 ' + errors.length + ' 个错误、' + warnings.length + ' 个警告：错误必须修，修完再把文件放到网站根目录。';
  } else if (warnings.length) {
    html += '无错误，发现 ' + warnings.length + ' 个警告（不影响上线，但建议逐条确认）。';
  } else {
    html += '未发现问题：错误 0 个，警告 0 个，可以放心使用。';
  }
  html += '</div>';
  var total = errors.length + warnings.length;
  if (total) {
    html += '<ul class="atv-issue-list">';
    errors.forEach(function (e) { html += '<li class="err">' + esc(e.message) + '</li>'; });
    warnings.forEach(function (w) { html += '<li class="warn">' + esc(w.message) + '</li>'; });
    html += '</ul>';
  }
  box.innerHTML = html;
}

function renderTable(lines) {
  var box = $('atv-table');
  var rows = '';
  lines.forEach(function (l) {
    var cells;
    if (l.type === 'record') {
      cells = '<td>' + esc(l.domain) + '</td><td>' + esc(l.accountId) + '</td><td>' + accountTypeBadge(l.accountType) + '</td><td>' + esc(l.caId === null ? '—' : (l.caId === '' ? '（空）' : l.caId)) + '</td>';
    } else if (l.type === 'variable') {
      cells = '<td colspan="4"><code>' + esc(l.name) + '</code> = <code>' + esc(l.value) + '</code></td>';
    } else if (l.type === 'comment') {
      cells = '<td colspan="4" class="atv-dim">' + esc(l.text === '' ? '（空注释）' : l.text) + '</td>';
    } else {
      cells = '<td colspan="4" class="atv-dim">（空行）</td>';
    }
    rows += '<tr><td class="atv-lineno">' + l.line + '</td><td><span class="atv-kind ' + l.type + '">' + typeLabel(l.type) + '</span></td>' + cells + '</tr>';
  });
  if (!lines.length) {
    box.innerHTML = '<p class="atv-empty">尚未输入内容。请粘贴 ads.txt 文本，或载入下方示例。</p>';
    return;
  }
  box.innerHTML = '<div class="atv-table-wrap"><table class="atv-table-el"><thead><tr><th>行</th><th>类型</th><th>域名</th><th>发布商账号 ID</th><th>账号类型</th><th>认证机构 ID</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
}
function accountTypeBadge(t) {
  if (t === 'DIRECT') return '<span class="atv-badge direct">DIRECT</span>';
  if (t === 'RESELLER') return '<span class="atv-badge reseller">RESELLER</span>';
  return '<span class="atv-badge invalid">' + esc(t === '' ? '（空）' : t) + '</span>';
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

$('atv-input').addEventListener('input', renderAll);
$('atv-ex-typical').addEventListener('click', function () { $('atv-input').value = EXAMPLES.typical; renderAll(); toast('已载入示例一，可编辑后再校验'); });
$('atv-ex-problem').addEventListener('click', function () { $('atv-input').value = EXAMPLES.problem; renderAll(); toast('已载入示例二：观察错误与警告的判定'); });
$('atv-copy').addEventListener('click', function () { copyText($('atv-input').value, 'ads.txt 原文已复制'); });
$('atv-download').addEventListener('click', function () {
  var text = $('atv-input').value;
  if (!text) { toast('内容为空，无法下载'); return; }
  var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = 'ads.txt';
  document.body.appendChild(a); a.click();
  setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  toast('ads.txt 已开始下载');
});
$('atv-reset').addEventListener('click', function () {
  $('atv-input').value = '';
  renderAll(); toast('已重置为空状态');
});

renderAll();
})();
