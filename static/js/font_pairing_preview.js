/* 字体搭配预览（Fontjoy 模式）纯函数 + 浏览器端实时预览逻辑。
 * 口径：预设搭配全部基于系统字体栈＋回退栈，不加载任何网络字体；
 * 搭配是审美建议，商用前请先核对字体授权；全程浏览器本地计算，
 * 零上传、零外部接口、不写浏览器存储。
 * 导出：window.FontPairingPreview（浏览器）与 module.exports（node 测试，同步导出）。
 */
(function (global) {
  'use strict';

  function fail(field, message) {
    var e = new Error(message);
    e.field = field;
    return e;
  }

  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  /* ---------------- 预设搭配表 ----------------
   * id / name / style / titleStack（标题字体栈）/ bodyStack（正文字体栈）/ note（一句话点评）。
   * 风格五类全覆盖：classic 经典、modern 现代、elegant 优雅、playful 活泼、minimal 极简。 */
  var STYLES = ['classic', 'modern', 'elegant', 'playful', 'minimal'];
  var STYLE_LABELS = { classic: '经典', modern: '现代', elegant: '优雅', playful: '活泼', minimal: '极简' };

  var PAIRINGS = [
    { id: 'classic-ink', name: '墨韵经典', style: 'classic',
      titleStack: ['Songti SC', 'STSong', 'SimSun', 'serif'],
      bodyStack: ['Kaiti SC', 'STKaiti', 'KaiTi', 'serif'],
      note: '宋体标题端庄、楷体正文温润，适合文学与长文排版。' },
    { id: 'classic-palatino', name: '典雅书卷', style: 'classic',
      titleStack: ['Palatino', 'Palatino Linotype', 'Book Antiqua', 'Songti SC', 'serif'],
      bodyStack: ['Georgia', 'Times New Roman', 'Songti SC', 'SimSun', 'serif'],
      note: 'Palatino 标题柔和、Georgia 正文耐读，经典书籍排版组合。' },
    { id: 'modern-hei', name: '现代黑体', style: 'modern',
      titleStack: ['Helvetica Neue', 'Arial', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'],
      bodyStack: ['PingFang SC', 'Microsoft YaHei', 'Hiragino Sans GB', 'Heiti SC', 'sans-serif'],
      note: '无衬线标题利落、正文黑体清晰，适合产品页与界面文案。' },
    { id: 'modern-grotesk', name: '几何无衬线', style: 'modern',
      titleStack: ['Futura', 'Century Gothic', 'Avenir Next', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'],
      bodyStack: ['Avenir Next', 'Helvetica Neue', 'Arial', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'],
      note: 'Futura 标题几何感强，Avenir 正文现代中性，适合科技品牌。' },
    { id: 'elegant-didot', name: '优雅时尚', style: 'elegant',
      titleStack: ['Didot', 'Bodoni MT', 'Songti SC', 'STSong', 'serif'],
      bodyStack: ['Georgia', 'Songti SC', 'SimSun', 'serif'],
      note: 'Didot 标题纤细高对比，适合时尚、婚礼与品牌视觉。' },
    { id: 'elegant-kaiti', name: '雅致楷宋', style: 'elegant',
      titleStack: ['Kaiti SC', 'STKaiti', 'KaiTi', 'serif'],
      bodyStack: ['Songti SC', 'STSong', 'SimSun', 'serif'],
      note: '楷体标题温雅、宋体正文稳重，适合文化类与茶室菜单排版。' },
    { id: 'playful-yuanti', name: '活泼圆体', style: 'playful',
      titleStack: ['Yuanti SC', 'YouYuan', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'],
      bodyStack: ['PingFang SC', 'Microsoft YaHei', 'Hiragino Sans GB', 'sans-serif'],
      note: '圆体标题亲切圆润，适合儿童、餐饮与轻松活泼的场景。' },
    { id: 'playful-marker', name: '俏皮手写', style: 'playful',
      titleStack: ['Comic Sans MS', 'Chalkboard SE', 'Yuanti SC', 'YouYuan', 'sans-serif'],
      bodyStack: ['Comic Sans MS', 'Chalkboard SE', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'],
      note: '手写风标题俏皮，适合便签、派对邀请与非正式场合。' },
    { id: 'minimal-sans', name: '极简无衬线', style: 'minimal',
      titleStack: ['Helvetica Neue', 'Helvetica', 'Arial', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'],
      bodyStack: ['Helvetica Neue', 'Helvetica', 'Arial', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'],
      note: '同族字重对比做层次，留白即设计，适合极简主义页面。' },
    { id: 'minimal-mono', name: '极简等宽', style: 'minimal',
      titleStack: ['Courier New', 'Menlo', 'Consolas', 'monospace'],
      bodyStack: ['Helvetica Neue', 'Arial', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'],
      note: '等宽标题配无衬线正文，技术文档与开发者博客的利落组合。' }
  ];

  /* 手动选择用的字体栈下拉选项：id / label / families。 */
  var FONT_STACKS = [
    { id: 'song', label: '宋体（Songti SC / SimSun）', families: ['Songti SC', 'STSong', 'SimSun', 'serif'] },
    { id: 'kaiti', label: '楷体（Kaiti SC / KaiTi）', families: ['Kaiti SC', 'STKaiti', 'KaiTi', 'serif'] },
    { id: 'heiti', label: '黑体（PingFang SC / 微软雅黑）', families: ['PingFang SC', 'Microsoft YaHei', 'Hiragino Sans GB', 'Heiti SC', 'SimHei', 'sans-serif'] },
    { id: 'yuanti', label: '圆体（Yuanti SC / 幼圆）', families: ['Yuanti SC', 'YouYuan', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'] },
    { id: 'georgia', label: 'Georgia 衬线', families: ['Georgia', 'Times New Roman', 'Songti SC', 'SimSun', 'serif'] },
    { id: 'times', label: 'Times New Roman 衬线', families: ['Times New Roman', 'Georgia', 'Songti SC', 'SimSun', 'serif'] },
    { id: 'palatino', label: 'Palatino 衬线', families: ['Palatino', 'Palatino Linotype', 'Book Antiqua', 'Songti SC', 'serif'] },
    { id: 'didot', label: 'Didot 时尚衬线', families: ['Didot', 'Bodoni MT', 'Songti SC', 'STSong', 'serif'] },
    { id: 'helvetica', label: 'Helvetica / Arial 无衬线', families: ['Helvetica Neue', 'Helvetica', 'Arial', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'] },
    { id: 'futura', label: 'Futura 几何无衬线', families: ['Futura', 'Century Gothic', 'Avenir Next', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'] },
    { id: 'courier', label: 'Courier New 等宽', families: ['Courier New', 'Menlo', 'Consolas', 'monospace'] },
    { id: 'comic', label: 'Comic Sans 手写风', families: ['Comic Sans MS', 'Chalkboard SE', 'Yuanti SC', 'YouYuan', 'sans-serif'] }
  ];

  var GENERIC_FAMILIES = { serif: true, 'sans-serif': true, monospace: true, cursive: true, fantasy: true, 'system-ui': true };

  /* ---------------- 纯函数 ---------------- */

  /* listPairings() -> 全部预设搭配（深拷贝，调用方改动不污染内置表）。 */
  function listPairings() { return clone(PAIRINGS); }

  /* listFontStacks() -> 手动选择用的字体栈选项（深拷贝）。 */
  function listFontStacks() { return clone(FONT_STACKS); }

  /* getPairingById(id) -> 单个搭配；id 非字符串/空串/不存在时抛错，err.field='id'。 */
  function getPairingById(id) {
    if (typeof id !== 'string' || !id) throw fail('id', '搭配 id 必须是非空字符串');
    for (var i = 0; i < PAIRINGS.length; i++) {
      if (PAIRINGS[i].id === id) return clone(PAIRINGS[i]);
    }
    throw fail('id', '未找到 id 为 ' + id + ' 的字体搭配');
  }

  /* getPairingsByStyle(style) -> 该风格的全部搭配；非法风格抛错，err.field='style'。 */
  function getPairingsByStyle(style) {
    if (typeof style !== 'string' || STYLES.indexOf(style) === -1) {
      throw fail('style', '风格必须是 classic/modern/elegant/playful/minimal 之一');
    }
    return clone(PAIRINGS.filter(function (p) { return p.style === style; }));
  }

  /* pickPairingByIndex(index) -> 按下标取搭配；非整数或越界抛错，err.field='index'。 */
  function pickPairingByIndex(index) {
    if (typeof index !== 'number' || !isFinite(index) || Math.floor(index) !== index) {
      throw fail('index', '下标必须是非负整数');
    }
    if (index < 0 || index >= PAIRINGS.length) {
      throw fail('index', '下标超出范围 0–' + (PAIRINGS.length - 1));
    }
    return clone(PAIRINGS[index]);
  }

  /* buildFontStack(families) -> CSS font-family 字符串。
   * 含空格或非 ASCII（如中文名）的字体名加双引号；通用族名（serif/sans-serif/
   * monospace 等）与纯 ASCII 单词名不加引号。families 非空数组、成员非空字符串，
   * 否则抛错，err.field='families'。 */
  function buildFontStack(families) {
    if (!Array.isArray(families) || families.length === 0) {
      throw fail('families', '字体栈必须是非空数组');
    }
    var parts = families.map(function (f) {
      if (typeof f !== 'string' || !f.trim()) throw fail('families', '字体名必须是非空字符串');
      var name = f.trim();
      if (GENERIC_FAMILIES[name]) return name;
      if (/^[A-Za-z][A-Za-z0-9-]*$/.test(name)) return name;
      return '"' + name.replace(/"/g, '') + '"';
    });
    return parts.join(', ');
  }

  var DEFAULT_OPTIONS = { titleSizePx: 32, bodySizePx: 16, lineHeight: 1.6 };
  var OPTION_RANGES = { titleSizePx: [16, 72], bodySizePx: [12, 24], lineHeight: [1.2, 2.0] };

  /* normalizeOptions(options) -> {titleSizePx, bodySizePx, lineHeight}。
   * 缺省为 {32, 16, 1.6}；缺失字段补缺省；越界或非数字抛错，err.field 为字段名，
   * 不静默钳制。options 为 undefined/null 时返回全部缺省；非对象抛错 field='options'。 */
  function normalizeOptions(options) {
    if (options === undefined || options === null) return clone(DEFAULT_OPTIONS);
    if (typeof options !== 'object' || Array.isArray(options)) {
      throw fail('options', '选项必须是一个对象');
    }
    var out = {};
    ['titleSizePx', 'bodySizePx', 'lineHeight'].forEach(function (k) {
      var v = options[k];
      if (v === undefined) { out[k] = DEFAULT_OPTIONS[k]; return; }
      if (typeof v !== 'number' || !isFinite(v)) throw fail(k, k + ' 必须是数字');
      var r = OPTION_RANGES[k];
      if (v < r[0] || v > r[1]) throw fail(k, k + ' 必须在 ' + r[0] + '–' + r[1] + ' 之间');
      out[k] = v;
    });
    return out;
  }

  /* formatPairingCSS(pairing, options) -> 两段 CSS（.font-title / .font-body）。
   * pairing 缺标题或正文字体栈抛错，err.field='pairing'；options 经 normalizeOptions 校验。 */
  function formatPairingCSS(pairing, options) {
    if (!pairing || typeof pairing !== 'object' ||
        !Array.isArray(pairing.titleStack) || !pairing.titleStack.length ||
        !Array.isArray(pairing.bodyStack) || !pairing.bodyStack.length) {
      throw fail('pairing', '搭配必须包含非空的标题与正文字体栈');
    }
    var o = normalizeOptions(options);
    var name = typeof pairing.name === 'string' ? pairing.name : '';
    var style = typeof pairing.style === 'string' ? pairing.style : '';
    var head = '/* 字体搭配：' + name + (style ? '（' + (STYLE_LABELS[style] || style) + '）' : '') + ' */';
    return head + '\n' +
      '.font-title {\n' +
      '  font-family: ' + buildFontStack(pairing.titleStack) + ';\n' +
      '  font-size: ' + o.titleSizePx + 'px;\n' +
      '  line-height: ' + o.lineHeight + ';\n' +
      '}\n' +
      '.font-body {\n' +
      '  font-family: ' + buildFontStack(pairing.bodyStack) + ';\n' +
      '  font-size: ' + o.bodySizePx + 'px;\n' +
      '  line-height: ' + o.lineHeight + ';\n' +
      '}';
  }

  var api = {
    listPairings: listPairings,
    listFontStacks: listFontStacks,
    getPairingById: getPairingById,
    getPairingsByStyle: getPairingsByStyle,
    pickPairingByIndex: pickPairingByIndex,
    buildFontStack: buildFontStack,
    normalizeOptions: normalizeOptions,
    formatPairingCSS: formatPairingCSS,
    styles: clone(STYLES),
    styleLabels: clone(STYLE_LABELS)
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.FontPairingPreview = api;

  /* ---------- 浏览器端 UI：仅在有 DOM 时绑定 ---------- */
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function () {
      var $ = function (id) { return document.getElementById(id); };
      var esc = function (s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
          return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
      };

      var state = {
        pairing: getPairingById('classic-ink'),
        titleStackId: null,
        bodyStackId: null,
        options: normalizeOptions()
      };
      var styleFilter = 'all';

      function currentTitleFamilies() {
        if (state.titleStackId) {
          var hit = listFontStacks().filter(function (s) { return s.id === state.titleStackId; })[0];
          if (hit) return hit.families;
        }
        return state.pairing.titleStack;
      }
      function currentBodyFamilies() {
        if (state.bodyStackId) {
          var hit = listFontStacks().filter(function (s) { return s.id === state.bodyStackId; })[0];
          if (hit) return hit.families;
        }
        return state.pairing.bodyStack;
      }

      function applyPreview() {
        var preview = $('fpp-preview');
        if (!preview) return;
        var titleEl = $('fpp-preview-title');
        var subEl = $('fpp-preview-subtitle');
        var bodyEls = preview.querySelectorAll('.fpp-body-text');
        var quoteEl = $('fpp-preview-quote');
        var o = state.options;
        if (titleEl) {
          titleEl.style.fontFamily = buildFontStack(currentTitleFamilies());
          titleEl.style.fontSize = o.titleSizePx + 'px';
          titleEl.style.lineHeight = o.lineHeight;
        }
        if (subEl) {
          subEl.style.fontFamily = buildFontStack(currentTitleFamilies());
          subEl.style.fontSize = Math.max(12, Math.round(o.titleSizePx * 0.55)) + 'px';
          subEl.style.lineHeight = o.lineHeight;
        }
        for (var i = 0; i < bodyEls.length; i++) {
          bodyEls[i].style.fontFamily = buildFontStack(currentBodyFamilies());
          bodyEls[i].style.fontSize = o.bodySizePx + 'px';
          bodyEls[i].style.lineHeight = o.lineHeight;
        }
        if (quoteEl) {
          quoteEl.style.fontFamily = buildFontStack(currentBodyFamilies());
          quoteEl.style.fontSize = o.bodySizePx + 'px';
          quoteEl.style.lineHeight = o.lineHeight;
        }
        var cssEl = $('fpp-css');
        if (cssEl) {
          var eff = { id: state.pairing.id, name: state.pairing.name, style: state.pairing.style,
            titleStack: currentTitleFamilies(), bodyStack: currentBodyFamilies() };
          cssEl.textContent = formatPairingCSS(eff, o);
        }
        var cur = $('fpp-current');
        if (cur) {
          var manual = (state.titleStackId || state.bodyStackId) ? '（已手动调整字体）' : '';
          cur.textContent = '当前搭配：' + state.pairing.name + ' · ' + STYLE_LABELS[state.pairing.style] + manual;
        }
      }

      function renderList() {
        var listEl = $('fpp-list');
        if (!listEl) return;
        var all = listPairings();
        var shown = styleFilter === 'all' ? all : all.filter(function (p) { return p.style === styleFilter; });
        listEl.innerHTML = shown.map(function (p) {
          var active = p.id === state.pairing.id && !state.titleStackId && !state.bodyStackId;
          return '<div class="fpp-card' + (active ? ' fpp-active' : '') + '" data-id="' + esc(p.id) + '" role="button" tabindex="0" aria-label="选用搭配 ' + esc(p.name) + '">' +
            '<div class="fpp-card-title" style="font-family:' + esc(buildFontStack(p.title)) + '">' + esc(p.name) + '</div>' +
            '<div class="fpp-card-sample" style="font-family:' + esc(buildFontStack(p.title)) + '">标题 Title 123</div>' +
            '<div class="fpp-card-sample fpp-card-body" style="font-family:' + esc(buildFontStack(p.body)) + '">正文 Body 示例文字，The quick brown fox jumps over the lazy dog.</div>' +
            '<div class="fpp-card-meta"><span class="fpp-tag">' + esc(STYLE_LABELS[p.style]) + '</span><span class="fpp-note">' + esc(p.note) + '</span></div>' +
            '</div>';
        }).join('') || '<div class="fpp-empty">没有该风格的搭配。</div>';
        var cards = listEl.querySelectorAll('.fpp-card');
        for (var i = 0; i < cards.length; i++) {
          cards[i].addEventListener('click', function () {
            state.pairing = getPairingById(this.getAttribute('data-id'));
            state.titleStackId = null;
            state.bodyStackId = null;
            syncSelects();
            renderList();
            applyPreview();
          });
          cards[i].addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.click(); }
          });
        }
      }

      function fillSelect(sel, stacks, placeholder) {
        sel.innerHTML = '<option value="">' + esc(placeholder) + '</option>' +
          stacks.map(function (s) { return '<option value="' + esc(s.id) + '">' + esc(s.label) + '</option>'; }).join('');
      }

      function syncSelects() {
        var ts = $('fpp-title-select'), bs = $('fpp-body-select');
        if (ts) ts.value = state.titleStackId || '';
        if (bs) bs.value = state.bodyStackId || '';
      }

      function bindSlider(id, labelId, key, fmt) {
        var input = $(id), label = $(labelId);
        if (!input) return;
        input.addEventListener('input', function () {
          var v = parseFloat(input.value);
          var patch = {};
          patch[key] = v;
          try {
            state.options = normalizeOptions({
              titleSizePx: key === 'titleSizePx' ? v : state.options.titleSizePx,
              bodySizePx: key === 'bodySizePx' ? v : state.options.bodySizePx,
              lineHeight: key === 'lineHeight' ? v : state.options.lineHeight
            });
          } catch (e) { return; }
          if (label) label.textContent = fmt(v);
          applyPreview();
        });
      }

      /* 风格筛选 */
      var chips = document.querySelectorAll('#fpp-filters .fpp-chip');
      for (var c = 0; c < chips.length; c++) {
        chips[c].addEventListener('click', function () {
          for (var j = 0; j < chips.length; j++) chips[j].classList.remove('on');
          this.classList.add('on');
          styleFilter = this.getAttribute('data-f');
          renderList();
        });
      }

      /* 下拉手动选择 */
      var stacks = listFontStacks();
      var ts = $('fpp-title-select'), bs = $('fpp-body-select');
      if (ts) {
        fillSelect(ts, stacks, '跟随预设搭配');
        ts.addEventListener('change', function () {
          state.titleStackId = ts.value || null;
          renderList();
          applyPreview();
        });
      }
      if (bs) {
        fillSelect(bs, stacks, '跟随预设搭配');
        bs.addEventListener('change', function () {
          state.bodyStackId = bs.value || null;
          renderList();
          applyPreview();
        });
      }

      /* 滑杆 */
      bindSlider('fpp-title-size', 'fpp-title-size-val', 'titleSizePx', function (v) { return v + 'px'; });
      bindSlider('fpp-body-size', 'fpp-body-size-val', 'bodySizePx', function (v) { return v + 'px'; });
      bindSlider('fpp-line-height', 'fpp-line-height-val', 'lineHeight', function (v) { return v.toFixed(1); });

      /* 随机搭配 */
      var randomBtn = $('fpp-random');
      if (randomBtn) {
        randomBtn.addEventListener('click', function () {
          var all = listPairings();
          var idx = Math.floor(Math.random() * all.length);
          if (all.length > 1 && all[idx].id === state.pairing.id) idx = (idx + 1) % all.length;
          state.pairing = pickPairingByIndex(idx);
          state.titleStackId = null;
          state.bodyStackId = null;
          syncSelects();
          renderList();
          applyPreview();
        });
      }

      /* 复制 CSS */
      var copyBtn = $('fpp-copy');
      if (copyBtn) {
        copyBtn.addEventListener('click', function () {
          var text = $('fpp-css') ? $('fpp-css').textContent : '';
          var tip = $('fpp-copy-tip');
          var done = function (ok) {
            if (tip) {
              tip.textContent = ok ? '已复制到剪贴板，可直接粘贴进样式表使用。' : '复制失败，请手动选择 CSS 文本复制。';
              tip.style.display = 'block';
            }
          };
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
          } else {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            try { done(document.execCommand('copy')); } catch (e) { done(false); }
            document.body.removeChild(ta);
          }
        });
      }

      renderList();
      applyPreview();
    });
  }
})(typeof window !== 'undefined' ? window : this);
