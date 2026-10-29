/* CSS 按钮生成器（css_button_generator）- 纯前端本地计算
 * 六组值 State：background（背景色 hex＋透明度）/ border（宽度/样式/颜色）/
 * borderRadius（圆角 px）/ padding（上下/左右 px）/ font（字号/字重/颜色/字间距）/
 * boxShadow（水平/垂直偏移/模糊/扩散/颜色/透明度/inset）。
 * 配置 config：{ selector, default, hover, focus, active }。
 * buildButtonCSS 输出 "{selector} {…}" ＋ ":hover"／":focus-visible"／":active"
 * 规则块；某态与默认态逐项一致时自动省略该规则块（不输出空规则）。
 * 失败约定：非法参数抛 Error，err.field 给出字段路径（如 "default.background"），
 * 不静默钳制、不静默取整、不静默截断。
 * 纯函数经 module.exports 暴露供 node 测试；浏览器里走 DOM。
 * 零网络请求：本文件不发起任何网络请求。 */
(function () {
'use strict';

/* ---------- 小工具 ---------- */

/* #RGB / #RRGGBB → {r, g, b}；非法返回 null。 */
function hexToRgb(hex) {
  if (typeof hex !== 'string') return null;
  var s = hex.trim();
  var m3 = /^#([0-9a-fA-F]{3})$/.exec(s);
  var m6 = /^#([0-9a-fA-F]{6})$/.exec(s);
  var h;
  if (m3) {
    h = m3[1];
    return {
      r: parseInt(h[0] + h[0], 16),
      g: parseInt(h[1] + h[1], 16),
      b: parseInt(h[2] + h[2], 16)
    };
  }
  if (m6) {
    h = m6[1];
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16)
    };
  }
  return null;
}

/* 透明度 0–100 → rgba 小数（两位内，去尾零）。 */
function fmtAlpha(pct) {
  var v = Math.round(Number(pct)) / 100;
  if (v < 0) v = 0;
  if (v > 1) v = 1;
  v = Math.round(v * 100) / 100;
  if (v === 0) v = 0;
  return String(v);
}

/* 整数格式化：-0 归零。 */
function fmtInt(n) {
  var v = Math.round(Number(n));
  if (v === 0) v = 0;
  return String(v);
}

function isFiniteNumber(n) {
  return typeof n === 'number' && isFinite(n);
}

/* 深拷贝（State/config 均为纯数据）。 */
function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

/* 抛带 field 的 Error。 */
function bad(field, message) {
  var e = new Error(message);
  e.field = field;
  throw e;
}

/* ---------- 校验 ---------- */

var BORDER_STYLES = ['solid', 'dashed', 'dotted', 'none'];
var FONT_WEIGHTS = [400, 500, 600, 700];

function checkColor(value, field) {
  if (!hexToRgb(value)) bad(field, '颜色须为 #RGB 或 #RRGGBB 格式，实得：' + String(value));
}

function checkRange(value, min, max, field, label) {
  if (!isFiniteNumber(value) || value < min || value > max) {
    bad(field, (label || field) + ' 须为 ' + min + '–' + max + ' 之间的有限数，实得：' + String(value));
  }
}

function checkEnum(value, list, field, label) {
  if (list.indexOf(value) < 0) {
    bad(field, (label || field) + ' 须为 ' + list.join('/') + ' 之一，实得：' + String(value));
  }
}

function checkBool(value, field, label) {
  if (typeof value !== 'boolean') bad(field, (label || field) + ' 须为布尔值，实得：' + String(value));
}

/* validateState(s, field)：校验单个 State；非法抛 Error，err.field 形如 "default.background"。 */
function validateState(s, field) {
  var f = field || 'state';
  if (!s || typeof s !== 'object') bad(f, 'State 须为对象');
  var p = function (sub) { return f + '.' + sub; };

  if (!s.background || typeof s.background !== 'object') bad(p('background'), 'background 须为对象');
  checkColor(s.background.color, p('background.color'));
  checkRange(s.background.opacity, 0, 100, p('background.opacity'), '背景透明度');

  if (!s.border || typeof s.border !== 'object') bad(p('border'), 'border 须为对象');
  checkRange(s.border.width, 0, 12, p('border.width'), '边框宽度');
  checkEnum(s.border.style, BORDER_STYLES, p('border.style'), '边框样式');
  checkColor(s.border.color, p('border.color'));

  checkRange(s.borderRadius, 0, 64, p('borderRadius'), '圆角');

  if (!s.padding || typeof s.padding !== 'object') bad(p('padding'), 'padding 须为对象');
  checkRange(s.padding.y, 0, 40, p('padding.y'), '内边距上下');
  checkRange(s.padding.x, 0, 64, p('padding.x'), '内边距左右');

  if (!s.font || typeof s.font !== 'object') bad(p('font'), 'font 须为对象');
  checkRange(s.font.size, 10, 32, p('font.size'), '字号');
  checkEnum(s.font.weight, FONT_WEIGHTS, p('font.weight'), '字重');
  checkColor(s.font.color, p('font.color'));
  checkRange(s.font.letterSpacing, 0, 8, p('font.letterSpacing'), '字间距');

  if (!s.boxShadow || typeof s.boxShadow !== 'object') bad(p('boxShadow'), 'boxShadow 须为对象');
  var sh = s.boxShadow;
  checkRange(sh.x, -20, 20, p('boxShadow.x'), '阴影水平偏移');
  checkRange(sh.y, -20, 20, p('boxShadow.y'), '阴影垂直偏移');
  checkRange(sh.blur, 0, 40, p('boxShadow.blur'), '阴影模糊');
  checkRange(sh.spread, -10, 20, p('boxShadow.spread'), '阴影扩散');
  checkColor(sh.color, p('boxShadow.color'));
  checkRange(sh.opacity, 0, 100, p('boxShadow.opacity'), '阴影透明度');
  checkBool(sh.inset, p('boxShadow.inset'), '阴影 inset 开关');
  return true;
}

/* validateConfig(config)：selector 非空；四态逐项校验；返回归一化 config（深拷贝＋selector 去首尾空格）。 */
function validateConfig(config) {
  if (!config || typeof config !== 'object') bad('config', 'config 须为对象');
  var sel = config.selector;
  if (typeof sel !== 'string' || sel.trim() === '') bad('selector', '选择器须为非空字符串');
  if (/[{};]/.test(sel)) bad('selector', '选择器不能包含 { } ; 字符');
  if (/<\/?style|</i.test(sel)) bad('selector', '选择器不能包含 < 字符');
  validateState(config.default, 'default');
  validateState(config.hover, 'hover');
  validateState(config.focus, 'focus');
  validateState(config.active, 'active');
  var out = clone(config);
  out.selector = sel.trim();
  return out;
}

/* ---------- 声明构建 ---------- */

/* 边框声明：宽度为 0 或样式为 none 时出 border: none; */
function buildBorder(b) {
  if (b.width === 0 || b.style === 'none') return 'none';
  return fmtInt(b.width) + 'px ' + b.style + ' ' + b.color;
}

/* 阴影声明：透明度为 0 时出 none；否则 [inset ]Xpx Ypx Blpx Spx rgba(…)。 */
function buildBoxShadow(sh) {
  if (sh.opacity === 0) return 'none';
  var rgb = hexToRgb(sh.color);
  var parts = [];
  if (sh.inset) parts.push('inset');
  parts.push(fmtInt(sh.x) + 'px');
  parts.push(fmtInt(sh.y) + 'px');
  parts.push(fmtInt(sh.blur) + 'px');
  parts.push(fmtInt(sh.spread) + 'px');
  parts.push('rgba(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ', ' + fmtAlpha(sh.opacity) + ')');
  return parts.join(' ');
}

/* buildDeclarations(state)：返回该态的 CSS 声明文本（多行，每行 "  prop: value;"），
 * 只含六组值对应的 9 个属性；非法抛 Error。 */
function buildDeclarations(state) {
  validateState(state, 'state');
  var bg = hexToRgb(state.background.color);
  var lines = [
    '  background-color: rgba(' + bg.r + ', ' + bg.g + ', ' + bg.b + ', ' + fmtAlpha(state.background.opacity) + ');',
    '  border: ' + buildBorder(state.border) + ';',
    '  border-radius: ' + fmtInt(state.borderRadius) + 'px;',
    '  padding: ' + fmtInt(state.padding.y) + 'px ' + fmtInt(state.padding.x) + 'px;',
    '  color: ' + state.font.color + ';',
    '  font-size: ' + fmtInt(state.font.size) + 'px;',
    '  font-weight: ' + state.font.weight + ';',
    '  letter-spacing: ' + fmtInt(state.font.letterSpacing) + 'px;',
    '  box-shadow: ' + buildBoxShadow(state.boxShadow) + ';'
  ];
  return lines.join('\n');
}

/* ---------- 态比较与规则块 ---------- */

var STATE_FIELDS = [
  ['background', 'color'], ['background', 'opacity'],
  ['border', 'width'], ['border', 'style'], ['border', 'color'],
  ['borderRadius'],
  ['padding', 'y'], ['padding', 'x'],
  ['font', 'size'], ['font', 'weight'], ['font', 'color'], ['font', 'letterSpacing'],
  ['boxShadow', 'x'], ['boxShadow', 'y'], ['boxShadow', 'blur'],
  ['boxShadow', 'spread'], ['boxShadow', 'color'], ['boxShadow', 'opacity'], ['boxShadow', 'inset']
];

function getPath(o, path) {
  var v = o;
  for (var i = 0; i < path.length; i++) {
    if (v == null || typeof v !== 'object') return undefined;
    v = v[path[i]];
  }
  return v;
}

/* stateDiffers(a, b)：两 State 逐项比较，返回是否不同。 */
function stateDiffers(a, b) {
  for (var i = 0; i < STATE_FIELDS.length; i++) {
    if (getPath(a, STATE_FIELDS[i]) !== getPath(b, STATE_FIELDS[i])) return true;
  }
  return false;
}

/* buildButtonCSS(config)：完整规则块字符串；与默认一致的态自动省略；非法抛 Error。 */
function buildButtonCSS(config) {
  var cfg = validateConfig(config);
  var sel = cfg.selector;
  var blocks = [sel + ' {\n' + buildDeclarations(cfg.default) + '\n}'];
  var states = [
    ['hover', ':hover'],
    ['focus', ':focus-visible'],
    ['active', ':active']
  ];
  for (var i = 0; i < states.length; i++) {
    var name = states[i][0], pseudo = states[i][1];
    if (stateDiffers(cfg.default, cfg[name])) {
      blocks.push(sel + pseudo + ' {\n' + buildDeclarations(cfg[name]) + '\n}');
    }
  }
  return blocks.join('\n\n');
}

/* scopeLiveSelector(sel)：把选择器限定在预览区容器 #cbg-preview-scope 内。
 * 逗号分组逐个前缀 "#cbg-preview-scope "。预览按钮在该容器里，仍被命中；
 * 而页面自身的操作按钮（class="btn btn-primary"）在容器外，不再被用户
 * 选择器（如 .btn）的同特异度规则重涂。纯函数，供 renderAll 的 live 注入用。 */
function scopeLiveSelector(sel) {
  return String(sel).split(',').map(function (part) {
    return '#cbg-preview-scope ' + part.trim();
  }).join(', ');
}

/* ---------- 默认配置 / 预设 / 示例 ---------- */

/* 默认 State：蓝底白字圆角按钮。 */
function defaultState() {
  return {
    background: { color: '#2563eb', opacity: 100 },
    border: { width: 0, style: 'solid', color: '#1d4ed8' },
    borderRadius: 8,
    padding: { y: 12, x: 24 },
    font: { size: 16, weight: 600, color: '#ffffff', letterSpacing: 0 },
    boxShadow: { x: 0, y: 4, blur: 12, spread: 0, color: '#000000', opacity: 20, inset: false }
  };
}

/* 默认 config：四态与默认一致（页签初始全部标注「与默认一致」）。 */
function defaultConfig() {
  var d = defaultState();
  return {
    selector: '.btn',
    default: d,
    hover: clone(d),
    focus: clone(d),
    active: clone(d)
  };
}

/* PRESETS：4 组预设（实心圆角、描边按钮、胶囊按钮、扁平深色），可直接载入。 */
var PRESETS = [
  {
    name: '实心圆角',
    desc: '经典主按钮：蓝底白字，悬停加深＋阴影放大',
    config: (function () {
      var c = defaultConfig();
      c.hover.background.color = '#1d4ed8';
      c.hover.boxShadow = { x: 0, y: 8, blur: 20, spread: 0, color: '#000000', opacity: 28, inset: false };
      c.focus.border = { width: 3, style: 'solid', color: '#bfdbfe' };
      c.focus.boxShadow = { x: 0, y: 4, blur: 16, spread: 2, color: '#2563eb', opacity: 35, inset: false };
      c.active.background.color = '#1e40af';
      c.active.boxShadow = { x: 0, y: 2, blur: 6, spread: 0, color: '#000000', opacity: 25, inset: false };
      return c;
    })()
  },
  {
    name: '描边按钮',
    desc: '幽灵按钮：透明底＋蓝色描边，悬停透出底色',
    config: (function () {
      var c = defaultConfig();
      c.default.background = { color: '#2563eb', opacity: 0 };
      c.default.border = { width: 2, style: 'solid', color: '#2563eb' };
      c.default.font.color = '#2563eb';
      c.default.boxShadow.opacity = 0;
      c.hover.background.opacity = 10;
      c.hover.border.color = '#1d4ed8';
      c.hover.font.color = '#1d4ed8';
      c.focus.border = { width: 2, style: 'solid', color: '#1e40af' };
      c.focus.boxShadow = { x: 0, y: 0, blur: 0, spread: 3, color: '#2563eb', opacity: 25, inset: false };
      c.active.background.opacity = 20;
      c.active.border.color = '#1e40af';
      c.active.font.color = '#1e40af';
      return c;
    })()
  },
  {
    name: '胶囊按钮',
    desc: '大圆角胶囊：绿色系，悬停上浮感',
    config: (function () {
      var c = defaultConfig();
      c.default.background.color = '#10b981';
      c.default.borderRadius = 32;
      c.default.padding = { y: 12, x: 32 };
      c.hover.borderRadius = 32;
      c.hover.padding = { y: 12, x: 32 };
      c.focus.borderRadius = 32;
      c.focus.padding = { y: 12, x: 32 };
      c.active.borderRadius = 32;
      c.active.padding = { y: 12, x: 32 };
      c.hover.background.color = '#059669';
      c.hover.boxShadow = { x: 0, y: 8, blur: 18, spread: 0, color: '#000000', opacity: 25, inset: false };
      c.focus.border = { width: 3, style: 'solid', color: '#a7f3d0' };
      c.active.background.color = '#047857';
      c.active.boxShadow = { x: 0, y: 2, blur: 6, spread: 0, color: '#000000', opacity: 22, inset: false };
      return c;
    })()
  },
  {
    name: '扁平深色',
    desc: '无阴影扁平风：深灰底，悬停/按下只变底色',
    config: (function () {
      var c = defaultConfig();
      c.default.background.color = '#1f2937';
      c.default.borderRadius = 6;
      c.default.boxShadow.opacity = 0;
      c.hover.borderRadius = 6;
      c.focus.borderRadius = 6;
      c.active.borderRadius = 6;
      c.hover.background.color = '#111827';
      c.focus.border = { width: 2, style: 'solid', color: '#9ca3af' };
      c.active.background.color = '#030712';
      return c;
    })()
  }
];

/* generateExample()：固定示例 config（蓝底白字圆角按钮；hover 加深＋阴影放大；
 * focus 加粗浅色描边＋外扩阴影表达聚焦环；active 底色再深＋阴影收小表达下沉），演示四态差异。 */
function generateExample() {
  var c = defaultConfig();
  c.selector = '.btn';
  c.default.borderRadius = 10;
  c.hover.borderRadius = 10;
  c.focus.borderRadius = 10;
  c.active.borderRadius = 10;
  c.hover.background.color = '#1d4ed8';
  c.hover.boxShadow = { x: 0, y: 8, blur: 20, spread: 0, color: '#000000', opacity: 30, inset: false };
  c.focus.border = { width: 3, style: 'solid', color: '#bfdbfe' };
  c.focus.boxShadow = { x: 0, y: 4, blur: 14, spread: 2, color: '#2563eb', opacity: 35, inset: false };
  c.active.background.color = '#1e40af';
  c.active.boxShadow = { x: 0, y: 2, blur: 8, spread: 0, color: '#000000', opacity: 25, inset: false };
  return c;
}

/* suggestExportName(kind)：'css' → 'button.css'，'html' → 'button-demo.html'；其它 kind 抛 Error。 */
function suggestExportName(kind) {
  if (kind === 'css') return 'button.css';
  if (kind === 'html') return 'button-demo.html';
  return bad('kind', '导出类型须为 css/html 之一，实得：' + String(kind));
}

/* escapeHtml：演示页插值转义。 */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* 从选择器提取可用于演示按钮的 class/id（仅取 [A-Za-z0-9_-] 安全字符）。 */
function selectorTokens(selector) {
  var base = String(selector).split(':')[0];
  var classes = [];
  var ids = [];
  var reC = /\.([A-Za-z0-9_-]+)/g, reI = /#([A-Za-z0-9_-]+)/g, m;
  while ((m = reC.exec(base)) !== null) classes.push(m[1]);
  while ((m = reI.exec(base)) !== null) ids.push(m[1]);
  return { classes: classes, id: ids.length ? ids[0] : '' };
}

/* buildDemoPage(config)：返回 { fileName, html }，html 为内嵌生成 CSS 的完整演示页。 */
function buildDemoPage(config) {
  var cfg = validateConfig(config);
  var css = buildButtonCSS(cfg);
  var tok = selectorTokens(cfg.selector);
  var clsAttr = tok.classes.length ? ' class="' + escapeHtml(tok.classes.join(' ')) + '"' : '';
  var idAttr = tok.id ? ' id="' + escapeHtml(tok.id) + '"' : '';
  var btnTag = '<button' + clsAttr + idAttr + '>演示按钮</button>';
  if (!tok.classes.length && !tok.id) {
    btnTag = '<!-- 选择器 "' + escapeHtml(cfg.selector) + '" 较复杂，演示按钮改用内联样式展示默认态 -->\n' +
      '  <button style="' + escapeHtml(buildDeclarations(cfg.default).split('\n').join(' ')) + '">演示按钮</button>';
  }
  var html = '<!DOCTYPE html>\n' +
    '<html lang="zh-CN">\n<head>\n' +
    '<meta charset="UTF-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
    '<title>按钮演示页 - ' + escapeHtml(cfg.selector) + '</title>\n' +
    '<style>\n' + css + '\n\n' +
    'body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;\n' +
    '  background: #f3f4f6; font-family: system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; }\n' +
    '.demo-wrap { text-align: center; padding: 2rem; }\n' +
    '.demo-tip { margin-top: 1.5rem; color: #6b7280; font-size: 14px; line-height: 2; }\n' +
    '.demo-code { margin: 1.5rem auto 0; max-width: 640px; text-align: left; background: #111827; color: #d1fae5;\n' +
    '  border-radius: 8px; padding: 1rem 1.2rem; font-family: ui-monospace, Menlo, Consolas, monospace;\n' +
    '  font-size: 13px; line-height: 1.7; white-space: pre-wrap; word-break: break-all; }\n' +
    '</style>\n</head>\n<body>\n' +
    '<div class="demo-wrap">\n  ' + btnTag + '\n' +
    '  <p class="demo-tip">将鼠标悬停到按钮上 / 按 Tab 键聚焦 / 按住鼠标左键，<br>分别体验 :hover ／ :focus-visible ／ :active 三态效果</p>\n' +
    '  <pre class="demo-code">' + escapeHtml(css) + '</pre>\n' +
    '</div>\n</body>\n</html>\n';
  return { fileName: suggestExportName('html'), html: html };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    hexToRgb: hexToRgb, fmtAlpha: fmtAlpha,
    validateState: validateState, validateConfig: validateConfig,
    buildDeclarations: buildDeclarations, buildButtonCSS: buildButtonCSS,
    stateDiffers: stateDiffers, scopeLiveSelector: scopeLiveSelector,
    defaultState: defaultState, defaultConfig: defaultConfig,
    PRESETS: PRESETS, generateExample: generateExample,
    suggestExportName: suggestExportName, buildDemoPage: buildDemoPage,
    selectorTokens: selectorTokens, escapeHtml: escapeHtml
  };
  return;
}

/* ---------- 浏览器 DOM 逻辑 ---------- */
function $(id) { return document.getElementById(id); }

var TABS = ['default', 'hover', 'focus', 'active'];
var currentTab = 'default';
var config = defaultConfig();

function toast(msg) {
  var t = $('cbg-toast');
  if (!t) return;
  t.textContent = msg;
  t.style.display = 'block';
  clearTimeout(t._timer);
  t._timer = setTimeout(function () { t.style.display = 'none'; }, 2600);
}

function copyText(text, okMsg) {
  function fallback() {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      if (document.execCommand('copy')) { toast(okMsg); }
      else { toast('复制失败，请手动选中代码区内容复制'); }
    } catch (e) {
      toast('复制失败，请手动选中代码区内容复制');
    }
    document.body.removeChild(ta);
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () { toast(okMsg); }, fallback);
  } else {
    fallback();
  }
}

function downloadText(text, fileName, mime) {
  var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(function () {
    URL.revokeObjectURL(a.href);
    document.body.removeChild(a);
  }, 500);
  toast('已下载 ' + fileName);
}

/* 把当前态读回 state（控件值均为合法范围，颜色选择器恒合法）。 */
function readControls() {
  var st = config[currentTab];
  st.background.color = $('cbg-bg-color').value;
  st.background.opacity = +$('cbg-bg-opacity').value;
  st.border.width = +$('cbg-border-width').value;
  st.border.style = $('cbg-border-style').value;
  st.border.color = $('cbg-border-color').value;
  st.borderRadius = +$('cbg-radius').value;
  st.padding.y = +$('cbg-pad-y').value;
  st.padding.x = +$('cbg-pad-x').value;
  st.font.color = $('cbg-font-color').value;
  st.font.size = +$('cbg-font-size').value;
  st.font.weight = +$('cbg-font-weight').value;
  st.font.letterSpacing = +$('cbg-letter-spacing').value;
  st.boxShadow.x = +$('cbg-shadow-x').value;
  st.boxShadow.y = +$('cbg-shadow-y').value;
  st.boxShadow.blur = +$('cbg-shadow-blur').value;
  st.boxShadow.spread = +$('cbg-shadow-spread').value;
  st.boxShadow.color = $('cbg-shadow-color').value;
  st.boxShadow.opacity = +$('cbg-shadow-opacity').value;
  st.boxShadow.inset = $('cbg-shadow-inset').checked;
  config.selector = $('cbg-selector').value;
}

/* 把 state 写回控件（含滑杆＋数值框联动）。 */
function writeControls(st) {
  function pair(rangeId, numId, v) {
    $(rangeId).value = v;
    $(numId).value = v;
  }
  $('cbg-bg-color').value = st.background.color;
  pair('cbg-bg-opacity', 'cbg-bg-opacity-num', st.background.opacity);
  pair('cbg-border-width', 'cbg-border-width-num', st.border.width);
  $('cbg-border-style').value = st.border.style;
  $('cbg-border-color').value = st.border.color;
  pair('cbg-radius', 'cbg-radius-num', st.borderRadius);
  pair('cbg-pad-y', 'cbg-pad-y-num', st.padding.y);
  pair('cbg-pad-x', 'cbg-pad-x-num', st.padding.x);
  $('cbg-font-color').value = st.font.color;
  pair('cbg-font-size', 'cbg-font-size-num', st.font.size);
  $('cbg-font-weight').value = String(st.font.weight);
  pair('cbg-letter-spacing', 'cbg-letter-spacing-num', st.font.letterSpacing);
  pair('cbg-shadow-x', 'cbg-shadow-x-num', st.boxShadow.x);
  pair('cbg-shadow-y', 'cbg-shadow-y-num', st.boxShadow.y);
  pair('cbg-shadow-blur', 'cbg-shadow-blur-num', st.boxShadow.blur);
  pair('cbg-shadow-spread', 'cbg-shadow-spread-num', st.boxShadow.spread);
  $('cbg-shadow-color').value = st.boxShadow.color;
  pair('cbg-shadow-opacity', 'cbg-shadow-opacity-num', st.boxShadow.opacity);
  $('cbg-shadow-inset').checked = st.boxShadow.inset;
}

/* 选择器映射到预览按钮：解析 class/id 并验证能否命中。 */
function mapSelectorToPreview(sel, btn) {
  var base = String(sel).split(':')[0].trim();
  btn.className = '';
  btn.removeAttribute('id');
  var tok = selectorTokens(sel);
  if (tok.classes.length) btn.className = tok.classes.join(' ');
  if (tok.id) btn.setAttribute('id', tok.id);
  var ok = false;
  try {
    ok = !!base && btn.matches(base);
  } catch (e) {
    ok = false;
  }
  return ok;
}

function renderAll() {
  var errEl = $('cbg-selector-err');
  var cfg;
  try {
    cfg = validateConfig(config);
    errEl.textContent = '';
    errEl.style.display = 'none';
  } catch (e) {
    errEl.textContent = '配置无效（' + (e.field || '?') + '）：' + e.message;
    errEl.style.display = 'block';
    return;
  }
  var cssText = buildButtonCSS(cfg);
  /* live 注入作用域隔离：克隆配置＋scope 选择器再生成，<style id="cbg-live">
   * 的规则只影响预览区内的真按钮；代码区保持原选择器输出不变。 */
  var liveCfg = clone(cfg);
  liveCfg.selector = scopeLiveSelector(cfg.selector);
  $('cbg-code').textContent = cssText;
  $('cbg-live').textContent = buildButtonCSS(liveCfg);

  /* 页签「与默认一致」标注 */
  for (var i = 0; i < TABS.length; i++) {
    var name = TABS[i];
    var tab = $('cbg-tab-' + name);
    var badge = $('cbg-tab-' + name + '-same');
    tab.classList.toggle('cbg-tab-active', name === currentTab);
    if (name === 'default') {
      if (badge) badge.style.display = 'none';
    } else if (badge) {
      badge.style.display = stateDiffers(cfg.default, cfg[name]) ? 'none' : 'inline-block';
    }
  }

  /* 真按钮预览：选择器能命中则完全走注入样式（三态可实测），否则内联默认态 */
  var btn = $('cbg-preview-btn');
  var hint = $('cbg-preview-hint');
  if (mapSelectorToPreview(cfg.selector, btn)) {
    btn.removeAttribute('style');
    hint.textContent = '当前选择器可直接命中预览按钮：把鼠标移到按钮上体验 :hover，按 Tab 聚焦体验 :focus-visible，按住左键体验 :active。';
  } else {
    btn.style.cssText = buildDeclarations(cfg.default).split('\n').join(' ');
    hint.textContent = '选择器较复杂，预览区改用内联样式展示默认态；复制 CSS 后在你自己的页面里三态依然生效。';
  }
}

function switchTab(name) {
  currentTab = name;
  var label = { default: '默认', hover: '悬停 :hover', focus: '聚焦 :focus-visible', active: '按下 :active' }[name] || name;
  $('cbg-cur-tab').textContent = label;
  writeControls(config[name]);
  renderAll();
}

function applyConfig(c, msg) {
  config = clone(c);
  $('cbg-selector').value = config.selector;
  var label = { default: '默认', hover: '悬停 :hover', focus: '聚焦 :focus-visible', active: '按下 :active' }[currentTab] || currentTab;
  $('cbg-cur-tab').textContent = label;
  writeControls(config[currentTab]);
  renderAll();
  if (msg) toast(msg);
}

function applyPreset(i) {
  var p = PRESETS[i];
  applyConfig(p.config, '已载入预设「' + p.name + '」，请按需改写');
}

/* 滑杆＋数值框双向联动 */
function linkPair(rangeId, numId, min, max) {
  var r = $(rangeId), n = $(numId);
  r.addEventListener('input', function () {
    n.value = r.value;
    readControls(); renderAll();
  });
  n.addEventListener('input', function () {
    var v = +n.value;
    if (!isFinite(v)) return;
    if (v < min) v = min;
    if (v > max) v = max;
    r.value = v;
    n.value = v;
    readControls(); renderAll();
  });
}

document.addEventListener('DOMContentLoaded', function () {
  var pairs = [
    ['cbg-bg-opacity', 'cbg-bg-opacity-num', 0, 100],
    ['cbg-border-width', 'cbg-border-width-num', 0, 12],
    ['cbg-radius', 'cbg-radius-num', 0, 64],
    ['cbg-pad-y', 'cbg-pad-y-num', 0, 40],
    ['cbg-pad-x', 'cbg-pad-x-num', 0, 64],
    ['cbg-font-size', 'cbg-font-size-num', 10, 32],
    ['cbg-letter-spacing', 'cbg-letter-spacing-num', 0, 8],
    ['cbg-shadow-x', 'cbg-shadow-x-num', -20, 20],
    ['cbg-shadow-y', 'cbg-shadow-y-num', -20, 20],
    ['cbg-shadow-blur', 'cbg-shadow-blur-num', 0, 40],
    ['cbg-shadow-spread', 'cbg-shadow-spread-num', -10, 20],
    ['cbg-shadow-opacity', 'cbg-shadow-opacity-num', 0, 100]
  ];
  for (var i = 0; i < pairs.length; i++) {
    linkPair(pairs[i][0], pairs[i][1], pairs[i][2], pairs[i][3]);
  }

  var singles = ['cbg-bg-color', 'cbg-border-style', 'cbg-border-color', 'cbg-font-color',
    'cbg-font-weight', 'cbg-shadow-color', 'cbg-shadow-inset'];
  for (var j = 0; j < singles.length; j++) {
    $(singles[j]).addEventListener('input', function () { readControls(); renderAll(); });
    $(singles[j]).addEventListener('change', function () { readControls(); renderAll(); });
  }
  $('cbg-selector').addEventListener('input', function () { readControls(); renderAll(); });

  for (var k = 0; k < TABS.length; k++) {
    (function (name) {
      $('cbg-tab-' + name).addEventListener('click', function () { switchTab(name); });
    })(TABS[k]);
  }
  for (var q = 0; q < PRESETS.length; q++) {
    (function (idx) {
      $('cbg-preset-' + idx).addEventListener('click', function () { applyPreset(idx); });
    })(q);
  }

  $('cbg-copy').addEventListener('click', function () {
    copyText($('cbg-code').textContent, '已复制完整 CSS 规则块');
  });
  $('cbg-download-css').addEventListener('click', function () {
    try {
      var name = suggestExportName('css');
      downloadText($('cbg-code').textContent + '\n', name, 'text/css;charset=utf-8');
    } catch (e) { toast('导出失败：' + e.message); }
  });
  $('cbg-download-demo').addEventListener('click', function () {
    try {
      var page = buildDemoPage(validateConfig(config));
      downloadText(page.html, page.fileName, 'text/html;charset=utf-8');
    } catch (e) { toast('导出失败：' + e.message); }
  });
  $('cbg-load-example').addEventListener('click', function () {
    applyConfig(generateExample(), '已载入示例：四态均有差异，可直接体验悬停/聚焦/按下');
  });
  $('cbg-reset').addEventListener('click', function () {
    currentTab = 'default';
    applyConfig(defaultConfig(), '已重置为默认配置');
  });

  $('cbg-selector').value = config.selector;
  writeControls(config.default);
  renderAll();
});
})();
