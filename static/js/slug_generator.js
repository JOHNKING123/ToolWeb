/* Slug 生成器（slug_generator）- 纯前端标题→URL slug 生成
 * 规则：
 * 1) 英文：NFKD 规范化后剥离组合变音符号（Café→cafe），小写，仅保留 a-z0-9；
 * 2) 中文：转拼音（内置常用字表，首屏延迟加载：首次遇到需转拼音的汉字时才解析字表）；
 *    拼音开关关闭或字表中没有的字会被删除（页面会提示人工复核）；
 * 3) 空白与标点一律视为词边界；连续边界合并为一个分隔符，首尾分隔符去除；
 * 4) maxLength 按单词边界截断（在限制长度内找最后一个分隔符截断，无分隔符则硬截断）。
 * 零网络请求：本文件不发起任何 fetch / XHR；内容不出浏览器。 */
(function () {
'use strict';

/* ---------- 拼音字表（紧凑编码，延迟解析） ----------
 * 格式 "字:拼音"，空格分隔。loadPinyinTable() 在首次真正需要转拼音时才解析，
 * 之前 pinyinLoaded() 为 false —— 这就是「首屏延迟加载」，页面首屏渲染不付解析成本。
 * 注意：多音字只收最常用读音，表外字会被删除（页面明示人工复核）。 */
var PINYIN_RAW =
  '工:gong 具:ju 网:wang 站:zhan 优:you 化:hua 实:shi 战:zhan 的:de 是:shi 在:zai ' +
  '有:you 和:he 不:bu 我:wo 你:ni 他:ta 她:ta 们:men 这:zhe 那:na 个:ge 一:yi 二:er ' +
  '三:san 四:si 五:wu 六:liu 七:qi 八:ba 九:jiu 十:shi 百:bai 千:qian 万:wan 年:nian ' +
  '月:yue 日:ri 天:tian 人:ren 大:da 小:xiao 中:zhong 国:guo 上:shang 下:xia 左:zuo ' +
  '右:you 前:qian 后:hou 内:nei 外:wai 来:lai 去:qu 到:dao 回:hui 走:zou 跑:pao 飞:fei ' +
  '吃:chi 喝:he 睡:shui 看:kan 听:ting 说:shuo 读:du 写:xie 学:xue 校:xiao 生:sheng ' +
  '老:lao 新:xin 好:hao 高:gao 低:di 长:chang 短:duan 快:kuai 慢:man 多:duo 全:quan ' +
  '每:mei 点:dian 分:fen 时:shi 今:jin 明:ming 昨:zuo 早:zao 晚:wan 手:shou 机:ji ' +
  '电:dian 脑:nao 视:shi 频:pin 音:yin 乐:le 图:tu 片:pian 文:wen 章:zhang 标:biao ' +
  '题:ti 容:rong 搜:sou 索:suo 引:yin 擎:qing 排:pai 名:ming 关:guan 键:jian 词:ci ' +
  '流:liu 量:liang 击:ji 转:zhuan 换:huan 率:lu 析:xi 报:bao 告:gao 作:zuo 项:xiang ' +
  '目:mu 团:tuan 队:dui 理:li 开:kai 发:fa 测:ce 试:shi 版:ban 本:ben 布:bu 线:xian ' +
  '修:xiu 复:fu 问:wen 答:da 帮:bang 助:zhu 如:ru 何:he 什:shen 么:me 为:wei 以:yi ' +
  '下:xia 除:chu 包:bao 含:han 使:shi 用:yong 户:hu 访:fang 客:ke 注:zhu 册:ce ' +
  '登:deng 录:lu 退:tui 出:chu 密:mi 码:ma 账:zhang 号:hao 设:she 置:zhi 默:mo ' +
  '认:ren 选:xuan 择:ze 添:tian 加:jia 删:shan 改:gai 查:cha 询:xun 找:zhao 创:chuang ' +
  '建:jian 存:cun 取:qu 消:xiao 确:que 提:ti 交:jiao 送:song 接:jie 收:shou 请:qing ' +
  '求:qiu 响:xiang 应:ying 服:fu 务:wu 器:qi 数:shu 据:ju 库:ku 表:biao 单:dan ' +
  '页:ye 面:mian 首:shou 尾:wei 头:tou 末:mo 始:shi 终:zhong 过:guo 程:cheng 结:jie ' +
  '果:guo 方:fang 法:fa 步:bu 骤:zhou 操:cao 指:zhi 南:nan 案:an 公:gong 司:si ' +
  '产:chan 品:pin 牌:pai 市:shi 场:chang 营:ying 销:xiao 售:shou 推:tui 广:guang ' +
  '活:huo 动:dong 惠:hui 价:jia 格:ge 钱:qian 免:mian 费:fei 付:fu 款:kuan 订:ding ' +
  '物:wu 仓:cang 储:chu 运:yun 输:shu 递:di 配:pei 达:da 裹:guo 件:jian 货:huo ' +
  '架:jia 完:wan 成:cheng 功:gong 能:neng 效:xiao';

var pinyinTable = null;

/* 解析字表（幂等，首次调用时执行）。 */
function loadPinyinTable() {
  if (pinyinTable) return pinyinTable;
  pinyinTable = {};
  var parts = PINYIN_RAW.split(' ');
  for (var i = 0; i < parts.length; i++) {
    var kv = parts[i].split(':');
    if (kv.length === 2 && kv[0] && kv[1]) pinyinTable[kv[0]] = kv[1];
  }
  return pinyinTable;
}

/* 字表是否已加载（供页面与测试验证「延迟加载」）。 */
function pinyinLoaded() {
  return pinyinTable !== null;
}

function isCjk(cp) {
  return (cp >= 0x3400 && cp <= 0x4DBF) ||   /* 扩展 A */
    (cp >= 0x4E00 && cp <= 0x9FFF) ||         /* 基本区 */
    (cp >= 0xF900 && cp <= 0xFAFF) ||         /* 兼容 */
    (cp >= 0x20000 && cp <= 0x2EBEF);         /* 扩展 B–F */
}

function badParam(field, message) {
  var e = new Error(message);
  e.field = field;
  return e;
}

var COMBINING_RE = /[\u0300-\u036f]/g; /* U+0300-U+036F 组合变音符号，全局替换 */
var ALNUM_RE = /^[a-zA-Z0-9]$/;

/* 标题→slug。opts：{ separator:'-'|'_'（默认 '-'）, maxLength:正整数|null（默认 null 不限）,
 * pinyin:true|false（默认 true） }。非法参数抛 Error 且 err.field 标明字段名。 */
function slugify(text, opts) {
  if (typeof text !== 'string') throw badParam('text', 'slugify：text 必须为字符串，实得 ' + typeof text + '。');
  opts = opts || {};
  var sep = opts.separator === undefined ? '-' : opts.separator;
  if (sep !== '-' && sep !== '_') throw badParam('separator', 'slugify：separator 只允许 "-" 或 "_"，实得 ' + JSON.stringify(sep) + '。');
  var maxLength = (opts.maxLength === undefined || opts.maxLength === null) ? null : opts.maxLength;
  if (maxLength !== null && (typeof maxLength !== 'number' || !isFinite(maxLength) ||
      Math.floor(maxLength) !== maxLength || maxLength < 1)) {
    throw badParam('maxLength', 'slugify：maxLength 必须为正整数或 null，实得 ' + JSON.stringify(opts.maxLength) + '。');
  }
  var usePinyin = opts.pinyin === undefined ? true : opts.pinyin;
  if (typeof usePinyin !== 'boolean') throw badParam('pinyin', 'slugify：pinyin 必须为布尔值，实得 ' + typeof opts.pinyin + '。');

  var s = text.normalize('NFKD').replace(COMBINING_RE, '');
  var tokens = [];
  var cur = '';
  var dropped = [];
  function flush() { if (cur) { tokens.push(cur); cur = ''; } }
  var table = null;
  for (var i = 0; i < s.length;) {
    var cp = s.codePointAt(i);
    var ch = String.fromCodePoint(cp);
    i += cp > 0xFFFF ? 2 : 1;
    if (ALNUM_RE.test(ch)) { cur += ch.toLowerCase(); continue; }
    if (isCjk(cp)) {
      flush();
      if (usePinyin) {
        if (!table) table = loadPinyinTable();
        var py = table[ch];
        if (py) tokens.push(py);
        else if (dropped.indexOf(ch) === -1) dropped.push(ch);
      } else if (dropped.indexOf(ch) === -1) {
        dropped.push(ch);
      }
      continue;
    }
    flush(); /* 空白、标点、符号、分隔符：词边界 */
  }
  flush();

  var joined = tokens.join(sep);
  if (maxLength !== null && joined.length > maxLength) {
    var cut = joined.slice(0, maxLength);
    var lastSep = cut.lastIndexOf(sep);
    joined = lastSep > 0 ? cut.slice(0, lastSep) : cut;
  }
  return { slug: joined, dropped: dropped };
}

/* 多行批量：每行一个标题，空行跳过。返回每行的 { line, input, slug, dropped }。 */
function batchSlugs(text, opts) {
  if (typeof text !== 'string') throw badParam('lines', 'batchSlugs：lines 必须为字符串（多行文本），实得 ' + typeof text + '。');
  var lines = text.split(/\r?\n/);
  var out = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].replace(/^\s+|\s+$/g, '');
    if (!line) continue;
    var r = slugify(line, opts);
    out.push({ line: i + 1, input: line, slug: r.slug, dropped: r.dropped });
  }
  return out;
}

var EXAMPLES = {
  basic: 'The Ultimate Guide to URL Slugs (2026)',
  chinese: '工具网站 SEO 优化实战'
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    EXAMPLES: EXAMPLES,
    slugify: slugify,
    batchSlugs: batchSlugs,
    loadPinyinTable: loadPinyinTable,
    pinyinLoaded: pinyinLoaded
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

function currentOpts() {
  var sep = $('sg-sep-under').checked ? '_' : '-';
  var mlRaw = $('sg-maxlength').value.replace(/^\s+|\s+$/g, '');
  var maxLength = mlRaw === '' ? null : parseInt(mlRaw, 10);
  return { separator: sep, maxLength: maxLength, pinyin: $('sg-pinyin').checked };
}

function renderSingle() {
  var text = $('sg-input').value;
  var out = $('sg-output'), stat = $('sg-stat'), warn = $('sg-warn');
  if (!text.replace(/^\s+|\s+$/g, '')) {
    out.value = ''; stat.textContent = '在上方输入标题，slug 实时生成。';
    warn.style.display = 'none'; warn.innerHTML = '';
    return;
  }
  var r;
  try {
    r = slugify(text, currentOpts());
  } catch (e) {
    out.value = ''; stat.textContent = '参数错误：' + e.message;
    warn.style.display = 'none'; warn.innerHTML = '';
    return;
  }
  out.value = r.slug;
  stat.textContent = '长度 ' + r.slug.length + ' 字符' +
    (r.slug ? '' : '（结果为空：标题中没有可保留的字符）') +
    ' · 拼音字表' + (pinyinLoaded() ? '已加载（延迟加载生效）' : '未加载');
  if (r.dropped.length) {
    warn.style.display = '';
    warn.innerHTML = '以下汉字不在内置拼音表内，已删除，请人工复核：' +
      esc(r.dropped.join('、')) + '。';
  } else {
    warn.style.display = 'none';
    warn.innerHTML = '';
  }
}

function renderBatch() {
  var text = $('sg-batch-input').value;
  var box = $('sg-batch-output');
  if (!text.replace(/^\s+|\s+$/g, '')) { box.innerHTML = '<p class="sg-empty">每行一个标题，批量结果显示在这里。</p>'; return; }
  var rows;
  try {
    rows = batchSlugs(text, currentOpts());
  } catch (e) {
    box.innerHTML = '<p class="sg-empty">参数错误：' + esc(e.message) + '</p>';
    return;
  }
  if (!rows.length) { box.innerHTML = '<p class="sg-empty">没有有效行。</p>'; return; }
  var html = rows.map(function (r) {
    var note = r.dropped.length ? ' <span class="sg-drop">（删字：' + esc(r.dropped.join('、')) + '）</span>' : '';
    return '<div class="sg-row"><span class="sg-lineno">' + r.line + '</span>' +
      '<span class="sg-in">' + esc(r.input) + '</span>' +
      '<span class="sg-arrow">→</span>' +
      '<code class="sg-out">' + esc(r.slug) + '</code>' + note + '</div>';
  }).join('');
  box.innerHTML = html;
}

function renderAll() { renderSingle(); renderBatch(); }

function copyText(text, okMsg) {
  function done() { toast(okMsg); }
  function fail() { toast('复制失败：请手动全选复制'); }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, fail);
    return;
  }
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
  var t = $('sg-toast');
  t.textContent = msg;
  t.className = 'sg-toast show';
  clearTimeout(t._timer);
  t._timer = setTimeout(function () { t.className = 'sg-toast'; }, 1800);
}

['sg-input', 'sg-maxlength'].forEach(function (id) {
  $(id).addEventListener('input', renderAll);
});
['sg-sep-dash', 'sg-sep-under', 'sg-pinyin'].forEach(function (id) {
  $(id).addEventListener('change', renderAll);
});
$('sg-batch-input').addEventListener('input', renderBatch);
$('sg-ex-basic').addEventListener('click', function () { $('sg-input').value = EXAMPLES.basic; renderAll(); toast('已载入示例一：英文标题'); });
$('sg-ex-cn').addEventListener('click', function () { $('sg-input').value = EXAMPLES.chinese; renderAll(); toast('已载入示例二：中文标题转拼音'); });
$('sg-copy').addEventListener('click', function () {
  var v = $('sg-output').value;
  if (!v) { toast('还没有生成结果'); return; }
  copyText(v, 'slug 已复制');
});
$('sg-download').addEventListener('click', function () { downloadText($('sg-output').value, 'slug.txt'); });
$('sg-batch-copy').addEventListener('click', function () {
  var rows = batchSlugs($('sg-batch-input').value, currentOpts());
  var text = rows.map(function (r) { return r.slug; }).join('\n');
  if (!text) { toast('还没有批量结果'); return; }
  copyText(text, '批量结果已复制（' + rows.length + ' 行）');
});
$('sg-batch-download').addEventListener('click', function () {
  var rows = batchSlugs($('sg-batch-input').value, currentOpts());
  downloadText(rows.map(function (r) { return r.slug; }).join('\n'), 'slugs.txt');
});
$('sg-batch-clear').addEventListener('click', function () { $('sg-batch-input').value = ''; renderBatch(); toast('批量输入已清空'); });

renderAll();
})();
