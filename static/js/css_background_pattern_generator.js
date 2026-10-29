/* CSS 背景图案生成器（css_background_pattern_generator）- 纯前端本地生成
 * 六种无缝平铺图案（PATTERNS 顺序固定）：stripes 条纹、dots 圆点、
 * checkerboard 棋盘、grid 网格、diagonal 斜线、zigzag 锯齿。
 * 构造口径（background-size 恒为 {size}px {size}px）：
 *  stripes/diagonal：repeating-linear-gradient({angle}deg, {fg} 0, {fg} {d}px, {bg} {d}px, {bg} {size}px)，
 *    d = round(size × stripeWidthPct / 100)；
 *  dots：radial-gradient(circle, {fg} {r}px, transparent {r+1}px)，r = round(size × dotDiameterPct / 200)；
 *  checkerboard：conic-gradient({fg} 0 25%, {bg} 0 50%, {fg} 0 75%, {bg} 0)；
 *  grid：linear-gradient({fg} {w}px, transparent {w}px), linear-gradient(90deg, {fg} {w}px, transparent {w}px)，
 *    w = gridLinePx；
 *  zigzag：经典四层锯齿，linear-gradient(135deg/225deg/315deg/45deg, {fg} 25%, transparent 25%)，
 *    其中 135°/225° 两层带 -{size/2}px 0 的半单元横向偏移以消除接缝。
 * 关于 zigzag 的说明：background-image 声明依法不能携带位置信息（浏览器会整条丢弃），
 * 故该图案的中间声明使用 background 简写承载「四层图像＋位置」，输出仍为三条声明，
 * 且 buildBackgroundCSS 返回的 backgroundImage 值字符串与上述口径逐字一致。
 * 失败约定：非法参数抛 Error，err.field 给出字段名，不静默钳制、不静默取整、不静默截断。
 * 纯函数经 module.exports 暴露供 node 测试；浏览器里走 DOM。
 * 零网络请求：本文件不发起任何 fetch / XHR，不引用任何 CDN。 */
(function () {
'use strict';

/* ---------- 图案注册表（顺序固定，供切换器直接渲染） ---------- */
var PATTERNS = [
  { id: 'stripes',      name: '条纹', desc: '双色条纹，色带宽度与角度可调' },
  { id: 'dots',         name: '圆点', desc: '等距圆点阵列，直径占比可调' },
  { id: 'checkerboard', name: '棋盘', desc: '双色 2×2 棋盘格，无缝拼接' },
  { id: 'grid',         name: '网格', desc: '横竖细线网格，线宽可调' },
  { id: 'diagonal',     name: '斜线', desc: '与条纹同构造，默认 45°，参数独立' },
  { id: 'zigzag',       name: '锯齿', desc: '经典四层锯齿波，半单元错位无缝' }
];

/* ---------- 参数取值范围 ---------- */
var LIMITS = {
  size:           { min: 8,  max: 160 },
  stripeWidthPct: { min: 10, max: 90 },
  dotDiameterPct: { min: 10, max: 90 },
  gridLinePx:     { min: 1,  max: 8 },
  angle:          { min: 0,  max: 90 }
};

/* 各图案启用的参数（界面灰显无关项用） */
var PARAMS_BY_PATTERN = {
  stripes:      ['size', 'stripeWidthPct', 'angle'],
  diagonal:     ['size', 'stripeWidthPct', 'angle'],
  dots:         ['size', 'dotDiameterPct'],
  checkerboard: ['size'],
  grid:         ['size', 'gridLinePx'],
  zigzag:       ['size', 'stripeWidthPct']
};

function configError(field, message) {
  var e = new Error(message);
  e.field = field;
  return e;
}

/* #RGB / #RRGGBB → 规范化小写 #rrggbb；非法返回 null。 */
function normalizeColor(text) {
  if (typeof text !== 'string') return null;
  var s = text.trim();
  var m3 = /^#([0-9a-fA-F]{3})$/.exec(s);
  if (m3) {
    var h = m3[1].toLowerCase();
    return '#' + h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  var m6 = /^#([0-9a-fA-F]{6})$/.exec(s);
  if (m6) return '#' + m6[1].toLowerCase();
  return null;
}

function checkInt(field, value, limit, label) {
  var n = Number(value);
  if (!isFinite(n) || Math.floor(n) !== n) {
    throw configError(field, label + '须为整数');
  }
  if (n < limit.min || n > limit.max) {
    throw configError(field, label + '须在 ' + limit.min + '–' + limit.max + ' 范围内');
  }
  return n;
}

/* 校验并返回归一化 config；非法抛 Error（err.field 为字段名）。 */
function validateConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') throw configError('config', '配置须为对象');
  var out = {};
  var known = false;
  for (var i = 0; i < PATTERNS.length; i++) {
    if (PATTERNS[i].id === cfg.pattern) { known = true; break; }
  }
  if (!known) throw configError('pattern', '图案非法，须为 stripes/dots/checkerboard/grid/diagonal/zigzag 之一');
  out.pattern = cfg.pattern;
  var bg = normalizeColor(cfg.bg);
  if (!bg) throw configError('bg', '底色须为 #RGB 或 #RRGGBB 格式');
  out.bg = bg;
  var fg = normalizeColor(cfg.fg);
  if (!fg) throw configError('fg', '图案色须为 #RGB 或 #RRGGBB 格式');
  out.fg = fg;
  out.size = checkInt('size', cfg.size, LIMITS.size, '平铺单元');
  out.stripeWidthPct = checkInt('stripeWidthPct', cfg.stripeWidthPct, LIMITS.stripeWidthPct, '色带占比');
  out.dotDiameterPct = checkInt('dotDiameterPct', cfg.dotDiameterPct, LIMITS.dotDiameterPct, '圆点直径占比');
  out.gridLinePx = checkInt('gridLinePx', cfg.gridLinePx, LIMITS.gridLinePx, '网格线宽');
  out.angle = checkInt('angle', cfg.angle, LIMITS.angle, '角度');
  return out;
}

/* 数字转 CSS 文本：去掉多余的 .0（如 20.5 保留，20 → "20"）。 */
function cssNum(n) {
  return String(Math.round(n * 100) / 100);
}

/* 返回 { backgroundColor, backgroundImage, backgroundSize, imageProp }；
 * imageProp 恒为 "background-image"，唯 zigzag 为 "background"
 *（background-image 不能携带位置信息，用简写承载四层图像＋半单元偏移）。 */
function buildBackgroundCSS(cfg) {
  var c = validateConfig(cfg);
  var s = c.size, bg = c.bg, fg = c.fg;
  var image, imageProp = 'background-image';
  var sizeVal = s + 'px ' + s + 'px';
  switch (c.pattern) {
    case 'stripes':
    case 'diagonal': {
      var d = Math.round(s * c.stripeWidthPct / 100);
      image = 'repeating-linear-gradient(' + c.angle + 'deg, ' + fg + ' 0, ' + fg + ' ' + d + 'px, ' + bg + ' ' + d + 'px, ' + bg + ' ' + s + 'px)';
      break;
    }
    case 'dots': {
      var r = Math.round(s * c.dotDiameterPct / 200);
      image = 'radial-gradient(circle, ' + fg + ' ' + r + 'px, transparent ' + (r + 1) + 'px)';
      break;
    }
    case 'checkerboard':
      image = 'conic-gradient(' + fg + ' 0 25%, ' + bg + ' 0 50%, ' + fg + ' 0 75%, ' + bg + ' 0)';
      break;
    case 'grid': {
      var w = c.gridLinePx;
      image = 'linear-gradient(' + fg + ' ' + w + 'px, transparent ' + w + 'px), ' +
              'linear-gradient(90deg, ' + fg + ' ' + w + 'px, transparent ' + w + 'px)';
      break;
    }
    case 'zigzag': {
      var pos = '-' + cssNum(s / 2) + 'px 0';
      image = 'linear-gradient(135deg, ' + fg + ' 25%, transparent 25%) ' + pos + ', ' +
              'linear-gradient(225deg, ' + fg + ' 25%, transparent 25%) ' + pos + ', ' +
              'linear-gradient(315deg, ' + fg + ' 25%, transparent 25%), ' +
              'linear-gradient(45deg, ' + fg + ' 25%, transparent 25%)';
      imageProp = 'background';
      break;
    }
    default:
      throw configError('pattern', '未知图案');
  }
  return { backgroundColor: bg, backgroundImage: image, backgroundSize: sizeVal, imageProp: imageProp };
}

/* 完整 CSS 声明文本：.pattern 包裹的三条声明。 */
function buildFullCSS(cfg) {
  var b = buildBackgroundCSS(cfg);
  return '.pattern {\n' +
    '  background-color: ' + b.backgroundColor + ';\n' +
    '  ' + b.imageProp + ': ' + b.backgroundImage + ';\n' +
    '  background-size: ' + b.backgroundSize + ';\n' +
    '}';
}

/* 自包含演示页 HTML：预览块应用图案＋内嵌 CSS＋中文说明。 */
function buildDemoHTML(cfg) {
  var b = buildBackgroundCSS(cfg);
  var cssText = '.pattern {\n' +
    '  background-color: ' + b.backgroundColor + ';\n' +
    '  ' + b.imageProp + ': ' + b.backgroundImage + ';\n' +
    '  background-size: ' + b.backgroundSize + ';\n' +
    '}';
  var patternName = '';
  for (var i = 0; i < PATTERNS.length; i++) {
    if (PATTERNS[i].id === cfg.pattern) { patternName = PATTERNS[i].name; break; }
  }
  return '<!DOCTYPE html>\n' +
'<html lang="zh-CN">\n' +
'<head>\n' +
'<meta charset="UTF-8">\n' +
'<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
'<title>CSS 背景图案演示（' + patternName + '）</title>\n' +
'<style>\n' +
'  body { font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; margin: 0; padding: 24px; color: #111827; }\n' +
'  .pattern {\n' +
'    background-color: ' + b.backgroundColor + ';\n' +
'    ' + b.imageProp + ': ' + b.backgroundImage + ';\n' +
'    background-size: ' + b.backgroundSize + ';\n' +
'  }\n' +
'  .demo { width: 100%; min-height: 60vh; border: 1px solid #e5e7eb; border-radius: 12px; }\n' +
'  pre { background: #111827; color: #d1fae5; padding: 16px; border-radius: 8px; overflow: auto; font-size: 13px; }\n' +
'</style>\n' +
'</head>\n' +
'<body>\n' +
'<h1>CSS 背景图案演示：' + patternName + '</h1>\n' +
'<p>使用说明：把下面 <code>.pattern</code> 的三条声明复制到你的样式表中，应用到任意元素上，即可得到与下方预览完全一致的无缝平铺图案。本文件由 CSS 背景图案生成器导出，离线双击即可打开预览，无需联网。</p>\n' +
'<div class="pattern demo"></div>\n' +
'<h2>CSS 代码</h2>\n' +
'<pre>' + escapeHtml(cssText) + '</pre>\n' +
'<p>提示：平铺单元为 ' + cfg.size + 'px，底色 ' + b.backgroundColor + '，图案色 ' + cfg.fg + '。如需调整密度或颜色，请回到生成器重新导出。</p>\n' +
'</body>\n' +
'</html>\n';
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* 固定示例：checkerboard 棋盘，底色 #ffffff、图案色 #e5e7eb、单元 40px。 */
function generateExample() {
  return {
    pattern: 'checkerboard', bg: '#ffffff', fg: '#e5e7eb', size: 40,
    stripeWidthPct: 50, dotDiameterPct: 50, gridLinePx: 2, angle: 45
  };
}

/* 导出文件名建议；未知 kind 抛 Error（err.field === 'kind'）。 */
function suggestExportName(kind) {
  if (kind === 'css') return 'background-pattern.css';
  if (kind === 'html') return 'background-pattern-demo.html';
  throw configError('kind', '导出类型非法，仅支持 css / html');
}

var api = {
  PATTERNS: PATTERNS,
  LIMITS: LIMITS,
  PARAMS_BY_PATTERN: PARAMS_BY_PATTERN,
  normalizeColor: normalizeColor,
  validateConfig: validateConfig,
  buildBackgroundCSS: buildBackgroundCSS,
  buildFullCSS: buildFullCSS,
  buildDemoHTML: buildDemoHTML,
  generateExample: generateExample,
  suggestExportName: suggestExportName,
  escapeHtml: escapeHtml
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
} else if (typeof window !== 'undefined') {
  window.CssBgPattern = api;
}

/* ---------- 浏览器界面（仅在 DOM 环境执行） ---------- */
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', function () {
    var $ = function (id) { return document.getElementById(id); };
    var els = {
      patternBar: $('cbp-patterns'), preview: $('cbp-preview'), code: $('cbp-code'),
      summary: $('cbp-summary'), err: $('cbp-err'), toast: $('cbp-toast'),
      bgColor: $('cbp-bg-color'), bgText: $('cbp-bg-text'),
      fgColor: $('cbp-fg-color'), fgText: $('cbp-fg-text')
    };
    if (!els.patternBar) return;

    var PARAM_DEFS = [
      { key: 'size',           label: '平铺单元', unit: 'px', min: 8,  max: 160, step: 1 },
      { key: 'stripeWidthPct', label: '色带占比', unit: '%',  min: 10, max: 90,  step: 1 },
      { key: 'dotDiameterPct', label: '圆点直径占比', unit: '%', min: 10, max: 90, step: 1 },
      { key: 'gridLinePx',     label: '网格线宽', unit: 'px', min: 1,  max: 8,   step: 1 },
      { key: 'angle',          label: '角度',     unit: '°',  min: 0,  max: 90,  step: 1 }
    ];
    var PARAM_HINTS = {
      size: '一个平铺单元的边长，8–160px',
      stripeWidthPct: '条纹／斜线／锯齿中图案色的宽度占比',
      dotDiameterPct: '圆点直径占单元边长的比例',
      gridLinePx: '网格线的宽度',
      angle: '条纹／斜线的倾斜角度（0° 为横向）'
    };

    var state = {
      pattern: 'stripes', bg: '#ffffff', fg: '#2563eb', size: 40,
      stripeWidthPct: 50, dotDiameterPct: 50, gridLinePx: 2, angle: 90
    };

    /* 渲染图案切换按钮 */
    PATTERNS.forEach(function (p) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cbp-tab' + (p.id === state.pattern ? ' cbp-tab-active' : '');
      btn.dataset.pattern = p.id;
      btn.title = p.desc;
      var b = document.createElement('b');
      b.textContent = p.name;
      var s = document.createElement('span');
      s.textContent = p.desc;
      btn.appendChild(b);
      btn.appendChild(s);
      btn.addEventListener('click', function () {
        state.pattern = p.id;
        if (p.id === 'stripes') state.angle = 90;
        if (p.id === 'diagonal') state.angle = 45;
        renderTabs(); renderParams(); refresh();
      });
      els.patternBar.appendChild(btn);
    });

    function renderTabs() {
      var btns = els.patternBar.querySelectorAll('.cbp-tab');
      for (var i = 0; i < btns.length; i++) {
        btns[i].classList.toggle('cbp-tab-active', btns[i].dataset.pattern === state.pattern);
      }
    }

    /* 渲染参数滑杆行 */
    var paramBox = $('cbp-params');
    PARAM_DEFS.forEach(function (def) {
      var row = document.createElement('div');
      row.className = 'cbp-row';
      row.id = 'cbp-row-' + def.key;
      var label = document.createElement('label');
      label.textContent = def.label;
      label.title = PARAM_HINTS[def.key];
      var range = document.createElement('input');
      range.type = 'range';
      range.min = def.min; range.max = def.max; range.step = def.step;
      range.id = 'cbp-range-' + def.key;
      range.setAttribute('aria-label', def.label);
      var num = document.createElement('input');
      num.type = 'number';
      num.min = def.min; num.max = def.max; num.step = def.step;
      num.id = 'cbp-num-' + def.key;
      num.setAttribute('aria-label', def.label + '数值');
      var unit = document.createElement('span');
      unit.className = 'cbp-unit';
      unit.textContent = def.unit;
      row.appendChild(label); row.appendChild(range); row.appendChild(num); row.appendChild(unit);
      paramBox.appendChild(row);
      range.addEventListener('input', function () { state[def.key] = Number(range.value); num.value = range.value; refresh(); });
      num.addEventListener('change', function () {
        var v = Number(num.value);
        if (!isFinite(v)) v = def.min;
        v = Math.max(def.min, Math.min(def.max, Math.round(v)));
        state[def.key] = v; range.value = v; num.value = v; refresh();
      });
    });

    function renderParams() {
      var active = PARAMS_BY_PATTERN[state.pattern];
      PARAM_DEFS.forEach(function (def) {
        var row = $('cbp-row-' + def.key);
        var on = active.indexOf(def.key) !== -1;
        row.classList.toggle('cbp-row-off', !on);
        $('cbp-range-' + def.key).disabled = !on;
        $('cbp-num-' + def.key).disabled = !on;
        $('cbp-range-' + def.key).value = state[def.key];
        $('cbp-num-' + def.key).value = state[def.key];
      });
    }

    /* 取色器与文本框双向同步 */
    function bindColor(colorEl, textEl, key) {
      colorEl.addEventListener('input', function () {
        state[key] = colorEl.value; textEl.value = colorEl.value; refresh();
      });
      textEl.addEventListener('change', function () {
        var v = normalizeColor(textEl.value);
        if (!v) { showErr((key === 'bg' ? '底色' : '图案色') + '须为 #RGB 或 #RRGGBB 格式'); textEl.value = state[key]; return; }
        hideErr();
        state[key] = v; colorEl.value = v; textEl.value = v; refresh();
      });
    }
    bindColor(els.bgColor, els.bgText, 'bg');
    bindColor(els.fgColor, els.fgText, 'fg');

    function showErr(msg) { els.err.textContent = msg; els.err.style.display = 'block'; }
    function hideErr() { els.err.style.display = 'none'; }

    function toast(msg) {
      els.toast.textContent = msg;
      els.toast.style.display = 'block';
      setTimeout(function () { els.toast.style.display = 'none'; }, 2200);
    }

    function patternName(id) {
      for (var i = 0; i < PATTERNS.length; i++) {
        if (PATTERNS[i].id === id) return PATTERNS[i].name;
      }
      return id;
    }

    /* 核心刷新：校验 → 预览 → 代码 → 摘要 */
    function refresh() {
      var cfg;
      try {
        cfg = validateConfig(state);
      } catch (e) {
        showErr(e.message || '参数非法');
        return;
      }
      hideErr();
      var b = buildBackgroundCSS(cfg);
      /* 预览：直接写行内样式，不注入 <style>，避免污染页面其他元素 */
      if (b.imageProp === 'background') {
        els.preview.style.background = b.backgroundImage;
        els.preview.style.backgroundColor = b.backgroundColor;
        els.preview.style.backgroundSize = b.backgroundSize;
      } else {
        els.preview.style.backgroundColor = b.backgroundColor;
        els.preview.style.backgroundImage = b.backgroundImage;
        els.preview.style.backgroundSize = b.backgroundSize;
      }
      els.code.textContent = buildFullCSS(cfg);
      els.summary.textContent = '当前：' + patternName(cfg.pattern) + ' · 单元 ' + cfg.size + 'px · 底色 ' + cfg.bg + ' · 图案色 ' + cfg.fg;
    }

    function copyText(text, okMsg) {
      function fallback() {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); toast(okMsg); }
        catch (e) { toast('复制失败，请手动复制代码区文本'); }
        document.body.removeChild(ta);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { toast(okMsg); }, fallback);
      } else { fallback(); }
    }

    function downloadBlob(name, text, mime) {
      var blob = new Blob([text], { type: mime });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); document.body.removeChild(a); }, 500);
      toast('已下载 ' + name);
    }

    $('cbp-copy').addEventListener('click', function () {
      try { copyText(buildFullCSS(validateConfig(state)), 'CSS 已复制到剪贴板'); }
      catch (e) { showErr(e.message || '参数非法'); }
    });
    $('cbp-dl-css').addEventListener('click', function () {
      try { downloadBlob(suggestExportName('css'), buildFullCSS(validateConfig(state)) + '\n', 'text/css;charset=utf-8'); }
      catch (e) { showErr(e.message || '参数非法'); }
    });
    $('cbp-dl-html').addEventListener('click', function () {
      try { downloadBlob(suggestExportName('html'), buildDemoHTML(validateConfig(state)), 'text/html;charset=utf-8'); }
      catch (e) { showErr(e.message || '参数非法'); }
    });
    $('cbp-example').addEventListener('click', function () {
      var ex = generateExample();
      state.pattern = ex.pattern; state.bg = ex.bg; state.fg = ex.fg; state.size = ex.size;
      state.stripeWidthPct = ex.stripeWidthPct; state.dotDiameterPct = ex.dotDiameterPct;
      state.gridLinePx = ex.gridLinePx; state.angle = ex.angle;
      els.bgColor.value = state.bg; els.bgText.value = state.bg;
      els.fgColor.value = state.fg; els.fgText.value = state.fg;
      renderTabs(); renderParams(); refresh();
      toast('已载入棋盘示例，可直接预览与导出');
    });

    /* 初始化控件值 */
    els.bgColor.value = state.bg; els.bgText.value = state.bg;
    els.fgColor.value = state.fg; els.fgText.value = state.fg;
    renderParams();
    refresh();
  });
}

})();
