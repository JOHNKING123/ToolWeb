/* 文本转 PDF（text_to_pdf）- 纯前端：粘贴文本 → 排版打印视图 → window.print() 另存为 PDF
 * 纯函数（双模式导出供 node 测试）：
 *   escapeHtml(s)               → string（& < > " ' 转义，防 XSS 注入）
 *   countChars(text)            → {chars, lines, words}（chars 含换行按 UTF-16 码元计；
 *                                 lines 空文本为 0；words 为空白分隔 token 数，中英混排口径锁定）
 *   pageConfig(opts)            → 归一化排版配置对象（非法值抛 Error，err.field 定位字段名）
 *   buildPrintDoc({title, body, opts, date}) → string（转义后确定性 HTML 文档片段，
 *                                 含 @page 纸张声明；空 body 抛 Error err.field="input"）
 * 排版选项（预设值，PM 规格锁定）：
 *   fontSize:  s(14px) / m(16px) / l(20px)            默认 m
 *   lineHeight: 1.4 / 1.6 / 2.0                       默认 1.6
 *   margin:    narrow(10mm) / normal(20mm) / wide(30mm) 默认 normal
 *   orientation: portrait(纵向) / landscape(横向)      默认 portrait
 *   fontFamily: serif(宋体衬线) / sans(黑体无衬线) / mono(等宽) 默认 sans
 *   header:    true/false（标题＋日期页眉）            默认 true
 *   avoidBreak: true/false（段落 break-inside: avoid）  默认 true
 * 失败约定：非法参数抛 Error，err.field 给出字段名，不静默钳制。
 * 零网络请求：本文件不发起任何 fetch / XHR；零依赖、零 CDN。 */
(function () {
'use strict';

/* ---------- 失败构造 ---------- */
function fail(field, msg) {
  var e = new Error(msg);
  e.field = field;
  throw e;
}

/* ---------- escapeHtml ---------- */
var ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function (ch) { return ESCAPE_MAP[ch]; });
}

/* ---------- countChars ---------- */
function countChars(text) {
  if (typeof text !== 'string') fail('input', '输入必须为字符串。');
  var chars = text.length;
  var lines = text === '' ? 0 : text.split('\n').length;
  var words = 0;
  if (text.trim() !== '') {
    words = text.trim().split(/\s+/).length;
  }
  return { chars: chars, lines: lines, words: words };
}

/* ---------- pageConfig ---------- */
var FONT_SIZE_PX = { s: 14, m: 16, l: 20 };
var FONT_SIZE_NAME = { s: '小', m: '中', l: '大' };
var LINE_HEIGHTS = [1.4, 1.6, 2.0];
var MARGIN_MM = { narrow: 10, normal: 20, wide: 30 };
var MARGIN_NAME = { narrow: '窄', normal: '默认', wide: '宽' };
var ORIENTATIONS = ['portrait', 'landscape'];
var ORIENTATION_NAME = { portrait: '纵向', landscape: '横向' };
var FONT_FAMILIES = ['serif', 'sans', 'mono'];
var FONT_FAMILY_CSS = {
  serif: '"Songti SC", "STSong", "SimSun", "Noto Serif CJK SC", serif',
  sans: '-apple-system, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, "Noto Sans Mono CJK SC", monospace'
};
var FONT_FAMILY_NAME = { serif: '宋体衬线', sans: '黑体无衬线', mono: '等宽' };

function pageConfig(opts) {
  opts = opts || {};
  var cfg = {};

  var fs = opts.fontSize == null ? 'm' : opts.fontSize;
  if (!Object.prototype.hasOwnProperty.call(FONT_SIZE_PX, fs)) {
    fail('fontSize', '字号非法（' + fs + '）：仅支持 s（小）/ m（中）/ l（大）。');
  }
  cfg.fontSize = fs;
  cfg.fontSizePx = FONT_SIZE_PX[fs];

  var lh = opts.lineHeight == null ? 1.6 : Number(opts.lineHeight);
  if (LINE_HEIGHTS.indexOf(lh) === -1) {
    fail('lineHeight', '行距非法（' + opts.lineHeight + '）：仅支持 1.4 / 1.6 / 2.0。');
  }
  cfg.lineHeight = lh;

  var mg = opts.margin == null ? 'normal' : opts.margin;
  if (!Object.prototype.hasOwnProperty.call(MARGIN_MM, mg)) {
    fail('margin', '页边距非法（' + mg + '）：仅支持 narrow（窄）/ normal（默认）/ wide（宽）。');
  }
  cfg.margin = mg;
  cfg.marginMm = MARGIN_MM[mg];

  var ori = opts.orientation == null ? 'portrait' : opts.orientation;
  if (ORIENTATIONS.indexOf(ori) === -1) {
    fail('orientation', '纸张方向非法（' + ori + '）：仅支持 portrait（纵向）/ landscape（横向）。');
  }
  cfg.orientation = ori;

  var ff = opts.fontFamily == null ? 'sans' : opts.fontFamily;
  if (FONT_FAMILIES.indexOf(ff) === -1) {
    fail('fontFamily', '字体非法（' + ff + '）：仅支持 serif（宋体衬线）/ sans（黑体无衬线）/ mono（等宽）。');
  }
  cfg.fontFamily = ff;
  cfg.fontFamilyCss = FONT_FAMILY_CSS[ff];

  var hd = opts.header == null ? true : opts.header;
  if (typeof hd !== 'boolean') fail('header', '页眉开关非法：必须为布尔值。');
  cfg.header = hd;

  var ab = opts.avoidBreak == null ? true : opts.avoidBreak;
  if (typeof ab !== 'boolean') fail('avoidBreak', '段落防断裂开关非法：必须为布尔值。');
  cfg.avoidBreak = ab;

  return cfg;
}

/* ---------- buildPrintDoc ---------- */
function buildPrintDoc(args) {
  args = args || {};
  var title = args.title == null ? '' : String(args.title);
  if (args.body != null && typeof args.body !== 'string') {
    fail('input', '正文内容必须为字符串。');
  }
  var body = args.body == null ? '' : args.body;
  if (body.trim() === '') {
    fail('input', '正文内容不能为空：请先粘贴或输入文本。');
  }
  var cfg = pageConfig(args.opts);
  var date = args.date == null ? '' : String(args.date);

  var parts = [];
  /* @page 纸张声明：A4 + 方向 + 页边距（确定性，随配置变化） */
  parts.push('<style>@page{size:A4 ' + cfg.orientation + ';margin:' + cfg.marginMm + 'mm;}</style>');
  parts.push('<div class="tp-doc" style="font-size:' + cfg.fontSizePx + 'px;line-height:' +
    cfg.lineHeight + ';font-family:' + cfg.fontFamilyCss + ';">');

  if (cfg.header) {
    parts.push('<div class="tp-doc-header">');
    if (title.trim() !== '') {
      parts.push('<h1 class="tp-doc-title">' + escapeHtml(title) + '</h1>');
    }
    if (date.trim() !== '') {
      parts.push('<p class="tp-doc-date">' + escapeHtml(date) + '</p>');
    }
    parts.push('</div>');
  }

  var lines = body.split('\n');
  var i, line;
  var pStyle = cfg.avoidBreak ? ' style="break-inside:avoid;"' : '';
  for (i = 0; i < lines.length; i++) {
    line = lines[i];
    if (line.trim() === '') {
      parts.push('<p class="tp-doc-p tp-doc-empty"' + pStyle + '>&nbsp;</p>');
    } else {
      parts.push('<p class="tp-doc-p"' + pStyle + '>' + escapeHtml(line) + '</p>');
    }
  }

  parts.push('<p class="tp-doc-foot">由程序员工具箱 · 文本转 PDF 生成</p>');
  parts.push('</div>');
  return parts.join('');
}

/* ---------- 双模式导出 ---------- */
var api = {
  escapeHtml: escapeHtml,
  countChars: countChars,
  pageConfig: pageConfig,
  buildPrintDoc: buildPrintDoc,
  FONT_SIZE_PX: FONT_SIZE_PX,
  MARGIN_MM: MARGIN_MM,
  FONT_FAMILY_CSS: FONT_FAMILY_CSS
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
} else {
  /* ---------- 浏览器 UI（仅浏览器环境执行） ---------- */
  (function () {
    function $(id) { return document.getElementById(id); }
    function toast(msg) {
      var t = $('tp-toast');
      t.textContent = msg;
      t.style.display = 'block';
      clearTimeout(t._h);
      t._h = setTimeout(function () { t.style.display = 'none'; }, 2200);
    }
    function todayStr() {
      var d = new Date();
      var m = ('0' + (d.getMonth() + 1)).slice(-2);
      var day = ('0' + d.getDate()).slice(-2);
      return d.getFullYear() + '-' + m + '-' + day;
    }
    function readOpts() {
      return {
        fontSize: $('tp-fontsize').value,
        lineHeight: $('tp-lineheight').value,
        margin: $('tp-margin').value,
        orientation: $('tp-orientation').value,
        fontFamily: $('tp-fontfamily').value,
        header: $('tp-header').checked,
        avoidBreak: $('tp-avoidbreak').checked
      };
    }
    function refreshCount() {
      var c = countChars($('tp-input').value);
      $('tp-count').textContent = '字符 ' + c.chars + ' · 行 ' + c.lines + ' · 词 ' + c.words;
    }
    function refreshPreview() {
      var body = $('tp-input').value;
      var box = $('tp-preview');
      if (body.trim() === '') {
        box.innerHTML = '<div class="tp-preview-empty">在此粘贴文本，排版预览将显示在这里</div>';
        return;
      }
      try {
        var html = buildPrintDoc({
          title: $('tp-title').value,
          body: body,
          opts: readOpts(),
          date: todayStr()
        });
        box.innerHTML = html;
        var cfg = pageConfig(readOpts());
        box.classList.toggle('tp-landscape', cfg.orientation === 'landscape');
        $('tp-msg').textContent = '';
      } catch (e) {
        $('tp-msg').textContent = e.message || '排版失败。';
      }
    }
    var EXAMPLE = '会议纪要\n\n时间：2026-10-30 09:30\n地点：三楼会议室\n\n一、本周进展\n1. 文本转 PDF 工具完成开发，进入联调；\n2. 用户反馈的打印边距问题已修复。\n\n二、下周计划\n1. 完成代码评审与测试；\n2. 发布到开发版验证打印效果。\n\n备注：纪要定稿后请打印为 PDF 归档。';

    document.addEventListener('DOMContentLoaded', function () {
      var t = null;
      $('tp-input').addEventListener('input', function () {
        refreshCount();
        clearTimeout(t);
        t = setTimeout(refreshPreview, 250);
      });
      $('tp-title').addEventListener('input', function () {
        clearTimeout(t);
        t = setTimeout(refreshPreview, 250);
      });
      ['tp-fontsize', 'tp-lineheight', 'tp-margin', 'tp-orientation', 'tp-fontfamily',
       'tp-header', 'tp-avoidbreak'].forEach(function (id) {
        $(id).addEventListener('change', refreshPreview);
      });
      $('tp-example').addEventListener('click', function () {
        $('tp-input').value = EXAMPLE;
        if ($('tp-title').value.trim() === '') $('tp-title').value = '项目周会纪要';
        refreshCount();
        refreshPreview();
        toast('已载入示例文本。');
      });
      $('tp-clear').addEventListener('click', function () {
        $('tp-input').value = '';
        $('tp-title').value = '';
        refreshCount();
        refreshPreview();
        toast('已清空。');
      });
      $('tp-print').addEventListener('click', function () {
        if ($('tp-input').value.trim() === '') {
          $('tp-msg').textContent = '请先输入正文内容再打印。';
          return;
        }
        refreshPreview();
        window.print();
      });
      refreshCount();
      refreshPreview();
    });
  })();
}
})();
