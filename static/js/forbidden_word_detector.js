/* 违禁词检测器（forbidden_word_detector）- 营销文案违禁词纯前端扫描
 * 规则：
 * 1) 内置 6 分类 109 词条静态词库（v1.0）：极限词 / 权威背书 / 医疗功效 /
 *    金融承诺 / 导流诱导 / 互动诱导；
 * 2) scanText 做字面子串扫描：重叠命中取最长（同一位置多个词条可匹配时只保留
 *    最长者，并跳过其覆盖区间，避免「全国第一」被重复计为「第一」）；
 * 3) 风险分级：命中任一 high → 高风险；否则任一 medium → 中风险；
 *    否则任一 low → 低风险；无命中 → 无风险；
 * 4) 白名单：opts.whitelist 中的词条命中时跳过（整词跳过其覆盖区间）；
 * 5) maskText 把命中词条按字替换为遮罩字符（默认 █），生成脱敏版；
 * 6) 非法参数抛 Error 且 err.field 标明字段名。
 * 零网络请求：本文件不发起任何 fetch / XHR；内容不出浏览器。 */
(function () {
'use strict';

/* ---------- 内置词库（v1.0，静态） ---------- */
var BANNED_WORDS = [
  { id: 'absolute', name: '极限词', nameEn: 'Absolute / superlative terms', risk: 'high', words: [
    '最', '第一', '首个', '首选', '独家', '唯一', '首家', '顶级',
    '极致', '完美', '绝对', '终极', '史无前例', '前所未有', '无与伦比', '独一无二',
    '全国第一', '全球首发', '全网首家', '销量冠军', '排名第一', '领导品牌', '至尊', '巅峰',
    '全网最低', '最低价', '秒杀', '爆款'
  ] },
  { id: 'authority', name: '权威背书', nameEn: 'Authority endorsement', risk: 'medium', words: [
    '国家级', '世界级', '央视推荐', '央视上榜', '领导人推荐', '专家认证', '权威认证',
    '官方指定', '政府推荐', '诺贝尔奖', '院士推荐', '明星推荐', '大师推荐', '专利认证', '国际认证'
  ] },
  { id: 'medical', name: '医疗功效', nameEn: 'Medical efficacy claims', risk: 'high', words: [
    '根治', '包治百病', '治愈', '特效', '神效', '奇效', '祖传秘方', '秘方',
    '偏方', '排毒养颜', '杀菌率', '抗癌', '防癌', '降血压', '降血糖', '减肥神器',
    '增高', '丰胸', '壮阳', '补肾', '祛斑', '祛痘', '美白', '干细胞'
  ] },
  { id: 'finance', name: '金融承诺', nameEn: 'Financial promises', risk: 'high', words: [
    '保本', '保收益', '稳赚不赔', '稳赚', '零风险', '高回报', '翻倍', '一夜暴富',
    '暴富', '年化收益', '保底收益', '承诺收益', '无风险', '日入过万', '月入十万', '轻松赚钱',
    '躺赚', '保证盈利'
  ] },
  { id: 'diversion', name: '导流诱导', nameEn: 'Traffic diversion inducements', risk: 'medium', words: [
    '加微信', '微信号', '扫码添加', '私聊我', '私信领取', '留言领取',
    '点击链接购买', '跳转购买', '添加客服', '咨询客服领取', '二维码下单', '站外购买'
  ] },
  { id: 'interaction', name: '互动诱导', nameEn: 'Interaction inducements', risk: 'low', words: [
    '一键三连', '帮忙点赞', '求点赞', '转发抽奖', '集赞', '帮我砍一刀',
    '砍一刀', '求投票', '帮忙投票', '评论区扣1', '双击666', '关注有礼'
  ] }
];

var RISK_LABEL = { high: '高风险', medium: '中风险', low: '低风险', none: '无风险' };
var RISK_ORDER = { high: 0, medium: 1, low: 2 };

var ADVICE = {
  high: '含高风险词条（极限词 / 医疗功效 / 金融承诺）：触碰《广告法》禁用表述的概率极高，建议删除或改写后再发布，必要时咨询专业律师。',
  medium: '含中风险词条（权威背书 / 导流诱导）：背书类表述需确保真实有据，导流类表述需符合发布平台规则，建议逐条复核。',
  low: '仅含低风险词条（互动诱导）：各平台对诱导互动的限流口径不同，发布前请确认目标平台的最新规则。',
  none: '未命中词库词条：注意词库为 v1.0 静态版本、覆盖有限，未命中不等于合规，发布前仍请人工复核。'
};

function badParam(field, message) {
  var e = new Error(message);
  e.field = field;
  return e;
}

/* ---------- 扁平索引（构建一次） ---------- */
var WORD_LOOKUP = null;   /* 词条 → { categoryId, categoryName, categoryNameEn, risk } */
var WORDS_BY_LEN = null;  /* 全部词条按长度降序（重叠取最长时优先匹配长词） */
function buildIndex() {
  if (WORD_LOOKUP) return;
  WORD_LOOKUP = {};
  WORDS_BY_LEN = [];
  BANNED_WORDS.forEach(function (cat) {
    cat.words.forEach(function (w) {
      WORD_LOOKUP[w] = { categoryId: cat.id, categoryName: cat.name, categoryNameEn: cat.nameEn, risk: cat.risk };
      WORDS_BY_LEN.push(w);
    });
  });
  WORDS_BY_LEN.sort(function (a, b) { return b.length - a.length; });
}

/* 词库总词条数（供页面与测试断言 ≥90）。 */
function totalWords() {
  var n = 0;
  BANNED_WORDS.forEach(function (cat) { n += cat.words.length; });
  return n;
}

function normalizeOpts(opts, fnName) {
  if (opts === undefined || opts === null) return {};
  if (typeof opts !== 'object' || Array.isArray(opts)) {
    throw badParam('opts', fnName + '：opts 必须为对象，实得 ' + (Array.isArray(opts) ? '数组' : typeof opts) + '。');
  }
  return opts;
}

function normalizeWhitelist(opts, fnName) {
  if (opts.whitelist === undefined || opts.whitelist === null) return {};
  if (!Array.isArray(opts.whitelist)) {
    throw badParam('whitelist', fnName + '：whitelist 必须为字符串数组，实得 ' + typeof opts.whitelist + '。');
  }
  var map = {};
  for (var i = 0; i < opts.whitelist.length; i++) {
    var w = opts.whitelist[i];
    if (typeof w !== 'string' || w === '') {
      throw badParam('whitelist', fnName + '：whitelist 须为非空字符串数组，下标 ' + i + ' 非法。');
    }
    map[w] = true;
  }
  return map;
}

/* 在 text 的位置 pos 处找最长匹配词条；无匹配返回 null。 */
function longestAt(text, pos) {
  var n = text.length;
  for (var k = 0; k < WORDS_BY_LEN.length; k++) {
    var w = WORDS_BY_LEN[k];
    if (w.length + pos <= n && text.substr(pos, w.length) === w) return w;
  }
  return null;
}

/* 文案扫描。opts：{ whitelist: string[] }。
 * 返回 { text, hits, total, distinct, riskLevel, categories }；
 * hits 按首次出现位置排序，每项 { word, categoryId, categoryName, categoryNameEn,
 * risk, count, positions }；重叠命中取最长。非法参数抛 Error（err.field）。 */
function scanText(text, opts) {
  if (typeof text !== 'string') {
    throw badParam('text', 'scanText：text 必须为字符串，实得 ' + typeof text + '。');
  }
  buildIndex();
  opts = normalizeOpts(opts, 'scanText');
  var whitelist = normalizeWhitelist(opts, 'scanText');

  var agg = {};    /* 词条 → 聚合命中 */
  var order = [];  /* 词条首次出现顺序 */
  var total = 0;
  var i = 0, n = text.length;
  while (i < n) {
    var w = longestAt(text, i);
    if (w !== null) {
      if (!whitelist[w]) {
        if (!agg[w]) {
          var e = WORD_LOOKUP[w];
          agg[w] = { word: w, categoryId: e.categoryId, categoryName: e.categoryName,
                     categoryNameEn: e.categoryNameEn, risk: e.risk, count: 0, positions: [] };
          order.push(w);
        }
        agg[w].positions.push(i);
        agg[w].count++;
        total++;
      }
      i += w.length;
    } else {
      i++;
    }
  }

  var hits = order.map(function (w) { return agg[w]; });
  hits.sort(function (a, b) { return a.positions[0] - b.positions[0]; });

  var level = 'none';
  for (var h = 0; h < hits.length; h++) {
    var r = hits[h].risk;
    if (level === 'none' || RISK_ORDER[r] < RISK_ORDER[level]) level = r;
  }

  var categories = BANNED_WORDS.map(function (cat) {
    var c = 0, words = [];
    hits.forEach(function (hit) {
      if (hit.categoryId === cat.id) { c += hit.count; words.push(hit.word); }
    });
    return { id: cat.id, name: cat.name, nameEn: cat.nameEn, risk: cat.risk, hits: c, words: words };
  });

  return { text: text, hits: hits, total: total, distinct: hits.length, riskLevel: level, categories: categories };
}

/* 风险摘要。result 须为 scanText 的返回对象；非法抛 Error（err.field='result'）。
 * 返回 { level, label, high, medium, low, total, distinct, advice }。 */
function riskSummary(result) {
  if (!result || typeof result !== 'object' || !Array.isArray(result.hits)) {
    throw badParam('result', 'riskSummary：result 必须为 scanText 的返回对象（含 hits 数组）。');
  }
  var counts = { high: 0, medium: 0, low: 0 };
  result.hits.forEach(function (h) {
    if (counts[h.risk] !== undefined) counts[h.risk] += (h.positions ? h.positions.length : 0);
  });
  var level = result.riskLevel || 'none';
  if (!RISK_LABEL[level]) level = 'none';
  var total = counts.high + counts.medium + counts.low;
  return {
    level: level,
    label: RISK_LABEL[level],
    high: counts.high,
    medium: counts.medium,
    low: counts.low,
    total: total,
    distinct: result.hits.length,
    advice: ADVICE[level]
  };
}

/* 脱敏版：把命中词条按字替换为遮罩字符。opts：{ whitelist: string[], maskChar: 单字符（默认 '█'） }。
 * 非法参数抛 Error（err.field）。 */
function maskText(text, opts) {
  if (typeof text !== 'string') {
    throw badParam('text', 'maskText：text 必须为字符串，实得 ' + typeof text + '。');
  }
  buildIndex();
  opts = normalizeOpts(opts, 'maskText');
  var maskChar = opts.maskChar === undefined ? '█' : opts.maskChar;
  if (typeof maskChar !== 'string' || maskChar.length !== 1) {
    throw badParam('maskChar', 'maskText：maskChar 必须为单个字符。');
  }
  var whitelist = normalizeWhitelist(opts, 'maskText');

  var out = [];
  var i = 0, n = text.length;
  while (i < n) {
    var w = longestAt(text, i);
    if (w !== null && !whitelist[w]) {
      var rep = '';
      for (var k = 0; k < w.length; k++) rep += maskChar;
      out.push(rep);
      i += w.length;
    } else if (w !== null) {
      out.push(w);
      i += w.length;
    } else {
      out.push(text.charAt(i));
      i++;
    }
  }
  return out.join('');
}

var EXAMPLES = {
  risky: '全国第一！祖传秘方包治百病，稳赚不赔日入过万，加微信私聊我，一键三连求点赞！',
  promo: '新品上市，全网最低价，央视推荐，专家认证，转发抽奖赢好礼，评论区扣1参与。'
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    BANNED_WORDS: BANNED_WORDS,
    EXAMPLES: EXAMPLES,
    RISK_LABEL: RISK_LABEL,
    totalWords: totalWords,
    scanText: scanText,
    riskSummary: riskSummary,
    maskText: maskText
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

var RISK_CLASS = { high: 'fwd-b-high', medium: 'fwd-b-medium', low: 'fwd-b-low', none: 'fwd-b-none' };
var CAT_CLASS = { high: 'fwd-h-high', medium: 'fwd-h-medium', low: 'fwd-h-low' };

/* 白名单（页面态，逗号/空格/换行分隔解析）。 */
function currentWhitelist() {
  var raw = $('fwd-whitelist').value;
  var parts = raw.split(/[,，\s\n]+/);
  var out = [];
  parts.forEach(function (p) { if (p) out.push(p); });
  return out;
}

/* 把 scanText 结果展平为按位置排序的 occurrence 列表：[{ word, risk, start, len }]。 */
function occurrencesOf(res) {
  var occ = [];
  res.hits.forEach(function (h) {
    h.positions.forEach(function (p) { occ.push({ word: h.word, risk: h.risk, start: p, len: h.word.length }); });
  });
  occ.sort(function (a, b) { return a.start - b.start; });
  return occ;
}

function renderAll() {
  var text = $('fwd-input').value;
  var whitelist;
  try {
    whitelist = currentWhitelist();
  } catch (e) { whitelist = []; }
  var res, summary;
  try {
    res = scanText(text, { whitelist: whitelist });
    summary = riskSummary(res);
  } catch (e) {
    $('fwd-stat').textContent = '扫描出错：' + e.message;
    return;
  }

  /* 风险徽标与统计 */
  var badge = $('fwd-badge');
  badge.textContent = summary.label;
  badge.className = 'fwd-badge ' + RISK_CLASS[summary.level];
  $('fwd-stat').innerHTML =
    '共扫描 ' + esc(String(text.length)) + ' 字 · 命中 ' + esc(String(summary.total)) +
    ' 处（' + esc(String(summary.distinct)) + ' 个不同词条）' +
    ' · 高风险 ' + esc(String(summary.high)) + ' / 中风险 ' + esc(String(summary.medium)) +
    ' / 低风险 ' + esc(String(summary.low)) +
    (whitelist.length ? ' · 白名单 ' + esc(String(whitelist.length)) + ' 个' : '');
  $('fwd-advice').textContent = summary.advice;

  /* 分类统计 */
  var catHtml = res.categories.map(function (c) {
    return '<span class="fwd-cat ' + CAT_CLASS[c.risk] + '">' + esc(c.name) +
      ' ×' + c.hits + '</span>';
  }).join('');
  $('fwd-cats').innerHTML = catHtml;

  /* 命中明细（点击定位到原文高亮处） */
  var occ = occurrencesOf(res);
  if (!res.hits.length) {
    $('fwd-hits').innerHTML = '<p class="fwd-empty">未命中词库词条。注意：词库为 v1.0 静态版本，未命中不等于合规。</p>';
  } else {
    $('fwd-hits').innerHTML = res.hits.map(function (h) {
      return '<button type="button" class="fwd-hitrow" data-word="' + esc(h.word) + '">' +
        '<span class="fwd-hitword ' + CAT_CLASS[h.risk] + '">' + esc(h.word) + '</span>' +
        '<span class="fwd-hitmeta">' + esc(h.categoryName) + ' · ' + esc(RISK_LABEL[h.risk]) +
        ' · ' + h.count + ' 处（位置 ' + h.positions.join('、') + '）</span>' +
        '<span class="fwd-hitgo">定位 →</span></button>';
    }).join('');
    var rows = $('fwd-hits').getElementsByClassName('fwd-hitrow');
    Array.prototype.forEach.call(rows, function (row) {
      row.addEventListener('click', function () {
        var target = document.getElementById('fwd-m-' + row.getAttribute('data-word') + '-0');
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          target.classList.add('fwd-flash');
          setTimeout(function () { target.classList.remove('fwd-flash'); }, 1200);
        }
      });
    });
  }

  /* 原文高亮 */
  if (!text) {
    $('fwd-highlight').innerHTML = '<p class="fwd-empty">在上方粘贴文案，命中词条会在这里高亮标出。</p>';
  } else {
    var html = '', last = 0, seq = {};
    occ.forEach(function (o) {
      html += esc(text.slice(last, o.start));
      var k = (seq[o.word] = (seq[o.word] || 0) + 1) - 1;
      html += '<mark class="fwd-mark ' + CAT_CLASS[o.risk] + '" id="fwd-m-' +
        esc(o.word) + '-' + k + '" title="' + esc(o.word) + '">' + esc(o.word) + '</mark>';
      last = o.start + o.len;
    });
    html += esc(text.slice(last));
    $('fwd-highlight').innerHTML = html;
  }

  /* 脱敏版 */
  var masked = maskText(text, { whitelist: whitelist });
  $('fwd-masked').value = masked;
  $('fwd-masked-stat').textContent = masked ?
    '脱敏版 ' + masked.length + ' 字：命中词条已按字替换为 █，可直接复制发布用。' : '暂无脱敏版。';
}

function copyText(text, okMsg) {
  function done() { toast(okMsg); }
  function fail() { toast('复制失败，请手动全选复制'); }
  if (!text) { toast('内容为空，无法复制'); return; }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, function () { legacyCopy(text, done, fail); });
    return;
  }
  legacyCopy(text, done, fail);
}
function legacyCopy(text, done, fail) {
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0;';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy') ? done() : fail(); }
  catch (e) { fail(); }
  document.body.removeChild(ta);
}

function downloadText(text, filename) {
  if (!text) { toast('内容为空，无法下载'); return; }
  var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  toast(filename + ' 已开始下载');
}

function toast(msg) {
  var t = $('fwd-toast');
  t.textContent = msg;
  t.className = 'fwd-toast show';
  clearTimeout(t._timer);
  t._timer = setTimeout(function () { t.className = 'fwd-toast'; }, 1800);
}

$('fwd-input').addEventListener('input', renderAll);
$('fwd-whitelist').addEventListener('input', renderAll);
$('fwd-ex-risky').addEventListener('click', function () { $('fwd-input').value = EXAMPLES.risky; renderAll(); toast('已载入示例一：高风险文案'); });
$('fwd-ex-promo').addEventListener('click', function () { $('fwd-input').value = EXAMPLES.promo; renderAll(); toast('已载入示例二：促销文案'); });
$('fwd-clear').addEventListener('click', function () { $('fwd-input').value = ''; renderAll(); });
$('fwd-copy').addEventListener('click', function () {
  var v = $('fwd-masked').value;
  if (!v) { toast('还没有脱敏版内容'); return; }
  copyText(v, '脱敏版已复制（' + v.length + ' 字）');
});
$('fwd-download').addEventListener('click', function () { downloadText($('fwd-masked').value, 'forbidden-word-masked.txt'); });
$('fwd-wl-clear').addEventListener('click', function () { $('fwd-whitelist').value = ''; renderAll(); toast('白名单已清空'); });

renderAll();
})();
