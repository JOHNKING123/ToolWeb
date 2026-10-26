/* Lorem Ipsum 生成器（lorem_ipsum_generator）- 纯前端零上传
* 英文经典 Lorem ipsum／中文占位文本二选，段落数 1-20、每段句子数 1-10、
* 起始方式三选（经典开头／随机开头／自定义首词），输出纯文本（空行分隔）
* 或 HTML（每段包一层 <p>）。实时生成＋段落／句子／词数统计。
* 校验：段落数／句子数非数字或超范围时钳制到边界并中文提示（不静默丢弃）；
* 自定义首词含换行展平为空格；自定义首词为空时按随机开头处理并中文提示。
* 渲染一律用 textContent（HTML 格式输出的是转义后的标记文本），自定义首词里的
* HTML 只显示为文本、不会被执行。随机组合须可注入随机源：浏览器用 Math.random，
* node 测试传固定序列函数做确定性断言；不承诺固定种子复现同一批次。
* 零网络请求：本文件不发起任何请求。浏览器与 node 测试共用同一纯函数；
* 浏览器绑定只在有 document 时执行。 */
(function () {
'use strict';

/* 标准首句：经典开头时首段首句固定为这一句。 */
var CLASSIC_FIRST = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.';

/* 英文语料：公共领域标准 Lorem ipsum 文本拆成的句子（首句即标准首句）。 */
var EN_SENTENCES = [
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
  'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
  'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
  'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
  'Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
  'Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium.',
  'Totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.',
  'Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit.',
  'Sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt.',
  'Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit.',
  'Sed quia non numquam eius modi tempora incidunt ut labore et dolore magnam aliquam quaerat voluptatem.',
  'Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis suscipit laboriosam.',
  'Nisi ut aliquid ex ea commodi consequatur.',
  'Quis autem vel eum iure reprehenderit qui in ea voluptate velit esse quam nihil molestiae consequatur.',
  'Vel illum qui dolorem eum fugiat quo voluptas nulla pariatur.',
  'At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum deleniti atque corrupti quos dolores.',
  'Et quas molestias excepturi sint occaecati cupiditate non provident, similique sunt in culpa qui officia deserunt mollitia animi.',
  'Id est laborum et dolorum fuga.',
  'Et harum quidem rerum facilis est et expedita distinctio.',
  'Nam libero tempore, cum soluta nobis est eligendi optio cumque nihil impedit quo minus id quod maxime placeat facere possimus.',
  'Omnis voluptas assumenda est, omnis dolor repellendus.',
  'Temporibus autem quibusdam et aut officiis debitis aut rerum necessitatibus saepe eveniet ut et voluptates repudiandae sint et molestiae non recusandae.',
  'Itaque earum rerum hic tenetur a sapiente delectus, ut aut reiciendis voluptatibus maiores alias consequatur aut perferendis doloribus asperiores repellat.',
  'Integer posuere erat a ante venenatis dapibus posuere velit aliquet.',
  'Donec id elit non mi porta gravida at eget metus.',
  'Cras mattis consectetur purus sit amet fermentum.',
  'Aenean lacinia bibendum nulla sed consectetur.',
  'Vestibulum id ligula porta felis euismod semper.',
  'Maecenas faucibus mollis interdum.',
  'Nullam quis risus eget urna mollis ornare vel eu leo.',
  'Curabitur blandit tempus porttitor.',
  'Morbi leo risus, porta ac consectetur ac, vestibulum at eros.',
  'Praesent commodo cursus magna, vel scelerisque nisl consectetur et.',
  'Fusce dapibus, tellus ac cursus commodo, tortor mauris condimentum nibh, ut fermentum massa justo sit amet risus.',
  'Etiam porta sem malesuada magna mollis euismod.',
  'Donec sed odio dui.'
];

/* 中文语料：通用占位句，仅用于占位与排版预览，无实际语义，不可直接当正文发布。 */
var ZH_SENTENCES = [
  '这是一段用于排版预览的占位文本，主要用来观察文字在版面中的呈现效果。',
  '占位文字本身没有实际含义，只是用来填充版面，让排版结构先完整地呈现出来。',
  '在这里放置一段中文占位内容，可以大致判断段落长度与行距是否合适。',
  '当正文尚未定稿时，先用占位文本撑起版面，后续再替换为正式内容。',
  '这段文字用于测试标题与正文之间的间距，以及不同字号下的阅读感受。',
  '排版预览时不必逐字阅读占位内容，重点是看整体的疏密与节奏。',
  '占位文本的长度可以自由调整，用来模拟短段落与长段落的不同效果。',
  '这是一句通用的占位句子，放在任何版面里都不会带有特定的语义指向。',
  '通过多段占位文本的组合，可以初步看到页面滚动后的视觉连续性。',
  '占位内容只是临时填充物，正式发布前务必替换为真实撰写的内容。',
  '这段占位文字用来检验分栏、留白与对齐方式是否符合设计预期。',
  '在原型演示阶段，占位文本能让页面看起来完整，而不需要等待正文定稿。',
  '这句占位内容与前后段落没有逻辑关系，仅用于填充版面空间。',
  '调整段落数量后，版面的整体高度会随之变化，便于评估页面结构。',
  '这段文字的长短适中，适合用来观察单段文字在容器内的换行情况。',
  '占位文本不承担表达任务，也不需要传达任何观点或信息。',
  '用占位文本先行排版，可以尽早发现版式上的问题并及时调整。',
  '这是一段中性的填充文字，不涉及具体的人物、事件或产品信息。',
  '段落之间的空行分隔让版面层次更清晰，也方便对照检查各段长度。',
  '这句占位内容用来模拟正文段落，帮助确认行高与段间距的设置。',
  '在没有正式文案的情况下，占位文本是排版与原型展示的常用做法。',
  '这段文字仅作版面占位使用，阅读时无需深究其表述是否完整。',
  '多段组合后可以观察标题、正文与留白之间的比例是否协调。',
  '这句占位内容放在段落末尾，用来收束本段的版面长度。',
  '占位文本生成后可以直接复制使用，但请记得在发布前替换为正式内容。'
];

var DEFAULTS = {
  lang: 'en', paragraphs: 3, sentencesPerParagraph: 5,
  start: 'classic', customWord: '', format: 'text'
};

var SAMPLE_EN = {
  lang: 'en', paragraphs: 3, sentencesPerParagraph: 5,
  start: 'classic', customWord: '', format: 'text'
};

var SAMPLE_ZH = {
  lang: 'zh', paragraphs: 2, sentencesPerParagraph: 4,
  start: 'random', customWord: '', format: 'text'
};

function trim(s) { return String(s == null ? '' : s).replace(/^\s+|\s+$/g, ''); }

/* 换行展平：CRLF／LF／孤 CR 各转一个空格；其他字符原样保留。 */
function flattenText(s) {
  return String(s == null ? '' : s).replace(/\r\n|\r|\n/g, ' ');
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* 范围钳制：非数字按最小值处理并提示；超范围钳制到边界并提示；合法则原值返回。
* 返回 { value, warning }，warning 为空串表示无需提示。 */
function clampCount(raw, min, max, label, fallback) {
  var n = Number(raw);
  if (raw === '' || raw == null || isNaN(n)) {
    return { value: fallback, warning: label + '不是有效数字，已按默认值 ' + fallback + ' 处理。' };
  }
  n = Math.floor(n);
  if (n < min) return { value: min, warning: label + '超出范围，已钳制到最小值 ' + min + '。' };
  if (n > max) return { value: max, warning: label + '超出范围，已钳制到最大值 ' + max + '。' };
  return { value: n, warning: '' };
}

/* 词数／字数统计：英文按空白切词；中文按去空白后的字符数计。 */
function countWords(text, lang) {
  var t = String(text == null ? '' : text);
  if (lang === 'zh') return t.replace(/\s/g, '').length;
  var words = trim(t).split(/\s+/);
  if (words.length === 1 && words[0] === '') return 0;
  return words.length;
}

/* 不放回抽取 count 个下标（随机源 randFn 返回 [0,1)）；池子不够时允许复用。 */
function pickIndices(poolSize, count, randFn) {
  var used = {}, out = [], guard = 0, idx;
  while (out.length < count && guard < count * 20 + 50) {
    guard++;
    idx = Math.floor(randFn() * poolSize);
    if (idx >= poolSize) idx = poolSize - 1;
    if (!used[idx] || out.length >= poolSize) {
      used[idx] = true;
      out.push(idx);
    }
  }
  while (out.length < count) out.push(Math.floor(randFn() * poolSize));
  return out;
}

/* 自定义首词处理成首段首句：
* 英文：首字母大写、句末无句号时补句号；中文：原样拼接、句末无句号时补句号。 */
function applyCustomWord(word, lang) {
  var w = trim(flattenText(word));
  if (w === '') return '';
  if (lang === 'zh') {
    if (/[。！？]$/.test(w)) return w;
    return w + '。';
  }
  w = w.charAt(0).toUpperCase() + w.slice(1);
  if (/[.!?]$/.test(w)) return w;
  return w + '.';
}

/* 生成占位文本。opts: { lang, paragraphs, sentencesPerParagraph, start, customWord, format }。
* randFn 可注入（默认 Math.random）。返回：
* { paragraphs: [段落文本], text, html, stats: { paragraphs, sentences, words },
*   warnings: [], clamped: { paragraphs, sentencesPerParagraph }, customWord } */
function generateLorem(opts, randFn) {
  opts = opts || {};
  var rand = typeof randFn === 'function' ? randFn : Math.random;
  var warnings = [];
  var lang = opts.lang === 'zh' ? 'zh' : 'en';
  var format = opts.format === 'html' ? 'html' : 'text';
  var start = opts.start;
  if (start !== 'classic' && start !== 'random' && start !== 'custom') start = 'classic';
  var pCheck = clampCount(opts.paragraphs, 1, 20, '段落数', DEFAULTS.paragraphs);
  var sCheck = clampCount(opts.sentencesPerParagraph, 1, 10, '每段句子数', DEFAULTS.sentencesPerParagraph);
  if (pCheck.warning) warnings.push(pCheck.warning);
  if (sCheck.warning) warnings.push(sCheck.warning);
  var paraCount = pCheck.value, sentCount = sCheck.value;
  var pool = lang === 'zh' ? ZH_SENTENCES : EN_SENTENCES;
  var customWord = trim(flattenText(opts.customWord));
  if (start === 'custom' && customWord === '') {
    warnings.push('自定义首词为空，已按随机开头处理。');
    start = 'random';
  }
  var customFirst = start === 'custom' ? applyCustomWord(customWord, lang) : '';
  var paragraphs = [], p, i, idxs, sentences;
  for (p = 0; p < paraCount; p++) {
    idxs = pickIndices(pool.length, sentCount, rand);
    sentences = [];
    for (i = 0; i < idxs.length; i++) sentences.push(pool[idxs[i]]);
    if (p === 0 && start === 'classic' && lang === 'en') {
      sentences[0] = CLASSIC_FIRST;
    } else if (p === 0 && start === 'custom') {
      sentences[0] = customFirst;
    } else if (p === 0 && start === 'classic' && lang === 'zh') {
      /* 中文无经典 Lorem 首句：经典开头在中文下等同随机开头，不做特殊处理。 */
    }
    paragraphs.push(sentences.join(lang === 'zh' ? '' : ' '));
  }
  var text = paragraphs.join('\n\n');
  var html = paragraphs.map(function (para) { return '<p>' + escapeHtml(para) + '</p>'; }).join('\n');
  var plainForCount = paragraphs.join(' ');
  return {
    paragraphs: paragraphs,
    format: format,
    text: text,
    html: html,
    stats: {
      paragraphs: paraCount,
      sentences: paraCount * sentCount,
      words: countWords(plainForCount, lang)
    },
    warnings: warnings,
    clamped: { paragraphs: paraCount, sentencesPerParagraph: sentCount },
    customWord: customWord
  };
}

var api = {
  CLASSIC_FIRST: CLASSIC_FIRST,
  EN_SENTENCES: EN_SENTENCES,
  ZH_SENTENCES: ZH_SENTENCES,
  DEFAULTS: DEFAULTS,
  SAMPLE_EN: SAMPLE_EN,
  SAMPLE_ZH: SAMPLE_ZH,
  trim: trim,
  flattenText: flattenText,
  escapeHtml: escapeHtml,
  clampCount: clampCount,
  countWords: countWords,
  applyCustomWord: applyCustomWord,
  generateLorem: generateLorem
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.LoremIpsumGenerator = api;

/* ---------------- 浏览器绑定（仅有 document 时执行） ---------------- */
if (typeof document !== 'undefined') {
  function $(id) { return document.getElementById(id); }

  function readForm() {
    var langEl = document.querySelector('input[name="lig-lang"]:checked');
    var startEl = document.querySelector('input[name="lig-start"]:checked');
    var formatEl = document.querySelector('input[name="lig-format"]:checked');
    return {
      lang: langEl ? langEl.value : 'en',
      paragraphs: $('lig-paragraphs') ? $('lig-paragraphs').value : 3,
      sentencesPerParagraph: $('lig-sentences') ? $('lig-sentences').value : 5,
      start: startEl ? startEl.value : 'classic',
      customWord: $('lig-custom-word') ? $('lig-custom-word').value : '',
      format: formatEl ? formatEl.value : 'text'
    };
  }

  function applyForm(values) {
    var langInput = document.querySelector('input[name="lig-lang"][value="' + values.lang + '"]');
    if (langInput) langInput.checked = true;
    var startInput = document.querySelector('input[name="lig-start"][value="' + values.start + '"]');
    if (startInput) startInput.checked = true;
    var formatInput = document.querySelector('input[name="lig-format"][value="' + values.format + '"]');
    if (formatInput) formatInput.checked = true;
    if ($('lig-paragraphs')) $('lig-paragraphs').value = values.paragraphs;
    if ($('lig-paragraphs-range')) $('lig-paragraphs-range').value = values.paragraphs;
    if ($('lig-sentences')) $('lig-sentences').value = values.sentencesPerParagraph;
    if ($('lig-sentences-range')) $('lig-sentences-range').value = values.sentencesPerParagraph;
    if ($('lig-custom-word')) $('lig-custom-word').value = values.customWord;
    renderAll();
  }

  function renderAll() {
    var form = readForm();
    var result = generateLorem(form);
    var outEl = $('lig-output');
    var warnEl = $('lig-warn');
    var statsEl = $('lig-stats');
    var copyBtn = $('lig-copy');
    var dlBtn = $('lig-download');
    var display = result.format === 'html' ? result.html : result.text;
    if (outEl) outEl.value = display;
    if ($('lig-paragraphs')) $('lig-paragraphs').value = result.clamped.paragraphs;
    if ($('lig-paragraphs-range')) $('lig-paragraphs-range').value = result.clamped.paragraphs;
    if ($('lig-sentences')) $('lig-sentences').value = result.clamped.sentencesPerParagraph;
    if ($('lig-sentences-range')) $('lig-sentences-range').value = result.clamped.sentencesPerParagraph;
    if (warnEl) {
      if (result.warnings.length > 0) {
        warnEl.style.display = 'block';
        warnEl.textContent = result.warnings.join('\n');
      } else {
        warnEl.style.display = 'none';
        warnEl.textContent = '';
      }
    }
    if (statsEl) {
      var unit = form.lang === 'zh' ? '字' : '词';
      statsEl.textContent = '段落数：' + result.stats.paragraphs + '　总句子数：' + result.stats.sentences + '　总' + unit + '数：' + result.stats.words;
    }
    if (dlBtn) dlBtn.textContent = (form.format === 'html' ? '下载 lorem-ipsum.html' : '下载 lorem-ipsum.txt');
    if (copyBtn) copyBtn.disabled = display === '';
    if (dlBtn) dlBtn.disabled = display === '';
  }

  function copyOutput() {
    var outEl = $('lig-output');
    var hintEl = $('lig-copy-hint');
    if (!outEl || outEl.value === '') return;
    function ok() { if (hintEl) hintEl.textContent = '已复制到剪贴板。'; }
    function fail() {
      if (hintEl) hintEl.textContent = '复制失败：请手动全选输出框内容复制（点击输出框，按 Ctrl+A 全选，再按 Ctrl+C 复制）。';
      if (outEl) { outEl.focus(); outEl.select(); }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(outEl.value).then(ok, fail);
    } else {
      outEl.focus();
      outEl.select();
      try { if (document.execCommand('copy')) ok(); else fail(); } catch (e) { fail(); }
    }
  }

  function downloadOutput() {
    var outEl = $('lig-output');
    if (!outEl || outEl.value === '') return;
    var formatEl = document.querySelector('input[name="lig-format"]:checked');
    var isHtml = formatEl && formatEl.value === 'html';
    var blob = new Blob([outEl.value], { type: isHtml ? 'text/html;charset=utf-8' : 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = isHtml ? 'lorem-ipsum.html' : 'lorem-ipsum.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function syncRange(numberId, rangeId) {
    var n = $(numberId), r = $(rangeId);
    if (n && r) {
      n.addEventListener('input', function () { r.value = n.value; renderAll(); });
      r.addEventListener('input', function () { n.value = r.value; renderAll(); });
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    syncRange('lig-paragraphs', 'lig-paragraphs-range');
    syncRange('lig-sentences', 'lig-sentences-range');
    var radios = document.querySelectorAll('input[name="lig-lang"], input[name="lig-start"], input[name="lig-format"]');
    var i;
    for (i = 0; i < radios.length; i++) radios[i].addEventListener('change', renderAll);
    var customEl = $('lig-custom-word');
    if (customEl) customEl.addEventListener('input', renderAll);
    var s1 = $('lig-sample-en');
    if (s1) s1.addEventListener('click', function () { applyForm(SAMPLE_EN); });
    var s2 = $('lig-sample-zh');
    if (s2) s2.addEventListener('click', function () { applyForm(SAMPLE_ZH); });
    var resetBtn = $('lig-reset');
    if (resetBtn) resetBtn.addEventListener('click', function () { applyForm(DEFAULTS); });
    var regenBtn = $('lig-regen');
    if (regenBtn) regenBtn.addEventListener('click', renderAll);
    var copyBtn = $('lig-copy');
    if (copyBtn) copyBtn.addEventListener('click', copyOutput);
    var dlBtn = $('lig-download');
    if (dlBtn) dlBtn.addEventListener('click', downloadOutput);
    renderAll();
  });
}
})();
