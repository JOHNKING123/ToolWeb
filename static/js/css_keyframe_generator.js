/* CSS 动画关键帧生成器（css_keyframe_generator）- 纯前端本地计算
 * 停靠点解析、帧排序与校验、transform 合成、五预设配置、
 * @keyframes / 完整 CSS / HTML 片段生成，全部为确定性纯函数。
 * 失败约定：非法参数抛 Error，err.field 给出字段名，不静默钳制、
 * 不静默取整、不静默补帧。
 * 纯函数经 module.exports 暴露供 node 测试；浏览器里走 DOM 并挂 window。
 * 零网络请求：本文件不发起任何 fetch / XHR。 */
(function () {
'use strict';

/* 带字段名的失败。 */
function fail(field, message) {
  var e = new Error(message);
  e.field = field;
  throw e;
}

/* 数值：有限且最多 2 位小数。 */
function is2dp(v) {
  return typeof v === 'number' && isFinite(v) &&
    Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;
}
function checkNum(v, field, label, min, max) {
  if (typeof v !== 'number' || !isFinite(v)) {
    fail(field, label + '不是有效数字');
  }
  if (!is2dp(v)) {
    fail(field, label + '最多保留 2 位小数');
  }
  if (v < min || v > max) {
    fail(field, label + '超出范围 ' + min + '–' + max);
  }
  return v;
}

/* 2 位小数去尾零：33.50 -> "33.5"，0 -> "0"，-0 归零。 */
function fmtNum(v) {
  var r = Math.round(Number(v) * 100) / 100;
  if (r === 0) r = 0;
  return String(r);
}

/* 停靠点：from -> 0，to -> 100，<数值>%（0–100，最多 2 位小数）。
 * 其它写法（裸数字、em、负值、>100%、空串）一律失败。 */
function parseStop(s) {
  if (typeof s !== 'string') fail('stop', '停靠点须为字符串');
  var t = s.trim().toLowerCase();
  if (t === 'from') return 0;
  if (t === 'to') return 100;
  var m = /^(\d+(?:\.\d{1,2})?)%$/.exec(t);
  if (!m) fail('stop', '停靠点写法非法：' + s);
  var v = parseFloat(m[1]);
  if (v > 100) fail('stop', '停靠点超出 0–100%：' + s);
  return v;
}

var EASING_KEYWORDS = ['ease', 'linear', 'ease-in', 'ease-out', 'ease-in-out'];
var CUBIC_RE = /^cubic-bezier\(\s*(-?\d+(?:\.\d{1,2})?)\s*,\s*(-?\d+(?:\.\d{1,2})?)\s*,\s*(-?\d+(?:\.\d{1,2})?)\s*,\s*(-?\d+(?:\.\d{1,2})?)\s*\)$/;

/* 缓动：空串表示继承全局，或关键字，或 cubic-bezier(a,b,c,d)，
 * 其中 a、c 在 0–1，b、d 在 -2–2，各最多 2 位小数。返回规范化串。 */
function validateEasing(v, field) {
  field = field || 'easing';
  if (v === undefined || v === null || v === '') return '';
  if (typeof v !== 'string') fail(field, '缓动须为字符串');
  var t = v.trim();
  if (EASING_KEYWORDS.indexOf(t) !== -1) return t;
  var m = CUBIC_RE.exec(t);
  if (!m) fail(field, '缓动写法非法：' + v);
  var nums = [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]), parseFloat(m[4])];
  if (nums[0] < 0 || nums[0] > 1) fail(field, 'cubic-bezier 的 x1 超出 0–1');
  if (nums[2] < 0 || nums[2] > 1) fail(field, 'cubic-bezier 的 x2 超出 0–1');
  if (nums[1] < -2 || nums[1] > 2) fail(field, 'cubic-bezier 的 y1 超出 -2–2');
  if (nums[3] < -2 || nums[3] > 2) fail(field, 'cubic-bezier 的 y2 超出 -2–2');
  return 'cubic-bezier(' + nums.map(fmtNum).join(', ') + ')';
}

var COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/* 单帧校验：返回规范化后的新对象（不改原对象）。
 * 缺省字段取默认值：opacity 1、位移 0、scale 1、rotate 0、背景色与缓动为空。 */
function validateFrame(frame) {
  if (!frame || typeof frame !== 'object') fail('frame', '关键帧须为对象');
  var stop;
  if (typeof frame.stop === 'string') {
    stop = parseStop(frame.stop);
  } else if (typeof frame.stop === 'number') {
    stop = checkNum(frame.stop, 'stop', '停靠点', 0, 100);
  } else {
    fail('stop', '关键帧缺少停靠点');
  }
  var out = { stop: stop };
  out.opacity = frame.opacity === undefined || frame.opacity === null ? 1 :
    checkNum(frame.opacity, 'opacity', '不透明度', 0, 1);
  out.translateX = frame.translateX === undefined || frame.translateX === null ? 0 :
    checkNum(frame.translateX, 'translateX', '水平位移', -2000, 2000);
  out.translateY = frame.translateY === undefined || frame.translateY === null ? 0 :
    checkNum(frame.translateY, 'translateY', '垂直位移', -2000, 2000);
  out.scale = frame.scale === undefined || frame.scale === null ? 1 :
    checkNum(frame.scale, 'scale', '缩放', 0, 10);
  out.rotate = frame.rotate === undefined || frame.rotate === null ? 0 :
    checkNum(frame.rotate, 'rotate', '旋转', -720, 720);
  if (frame.backgroundColor === undefined || frame.backgroundColor === null ||
      frame.backgroundColor === '') {
    out.backgroundColor = '';
  } else if (typeof frame.backgroundColor === 'string' &&
      COLOR_RE.test(frame.backgroundColor.trim())) {
    out.backgroundColor = frame.backgroundColor.trim();
  } else {
    fail('backgroundColor', '背景色须为 #RGB 或 #RRGGBB 十六进制');
  }
  out.easing = validateEasing(frame.easing, 'easing');
  return out;
}

/* 帧排序：返回按 stop 升序的新数组（不改原数组）；重复停靠点失败。 */
function sortFrames(frames) {
  if (!Array.isArray(frames)) fail('frames', '关键帧须为数组');
  var norm = frames.map(validateFrame);
  var seen = {};
  norm.forEach(function (f) {
    if (seen[f.stop]) fail('frames', '停靠点重复：' + fmtNum(f.stop) + '%');
    seen[f.stop] = true;
  });
  norm.sort(function (a, b) { return a.stop - b.stop; });
  return norm;
}

/* 增帧：先校验、再排序返回新数组；超 10 帧或重复停靠点失败；不改原数组。 */
function addFrame(frames, frame) {
  if (!Array.isArray(frames)) fail('frames', '关键帧须为数组');
  if (frames.length >= 10) fail('frames', '关键帧已达上限 10 个');
  var next = frames.slice();
  next.push(frame);
  return sortFrames(next);
}

/* 删帧：删除该停靠点的帧返回新数组；将低于 2 帧或停靠点不存在失败。 */
function removeFrame(frames, stop) {
  if (!Array.isArray(frames)) fail('frames', '关键帧须为数组');
  var target = typeof stop === 'string' ? parseStop(stop) :
    checkNum(stop, 'stop', '停靠点', 0, 100);
  var idx = -1;
  frames.forEach(function (f, i) {
    var s = typeof f.stop === 'string' ? parseStop(f.stop) : f.stop;
    if (s === target) idx = i;
  });
  if (idx === -1) fail('stop', '不存在停靠点 ' + fmtNum(target) + '% 的关键帧');
  if (frames.length - 1 < 2) fail('frames', '关键帧至少保留 2 个');
  var next = frames.slice();
  next.splice(idx, 1);
  return next;
}

var DIRECTIONS = ['normal', 'reverse', 'alternate', 'alternate-reverse'];
var FILL_MODES = ['none', 'forwards', 'backwards', 'both'];

/* 动画参数校验：返回规范化后的新对象。缺省取默认值。 */
function validateAnimation(opts) {
  if (!opts || typeof opts !== 'object') fail('animation', '动画参数须为对象');
  var out = {};
  out.duration = opts.duration === undefined || opts.duration === null ? 1 :
    checkNum(opts.duration, 'duration', '动画时长', 0.1, 60);
  out.delay = opts.delay === undefined || opts.delay === null ? 0 :
    checkNum(opts.delay, 'delay', '延迟', 0, 60);
  if (opts.iteration === undefined || opts.iteration === null) {
    out.iteration = 1;
  } else if (opts.iteration === 'infinite') {
    out.iteration = 'infinite';
  } else if (typeof opts.iteration === 'number' &&
      isFinite(opts.iteration) && Math.floor(opts.iteration) === opts.iteration &&
      opts.iteration >= 1 && opts.iteration <= 100) {
    out.iteration = opts.iteration;
  } else {
    fail('iteration', '循环次数须为 1–100 的正整数或 infinite');
  }
  out.direction = opts.direction === undefined || opts.direction === null ?
    'normal' : opts.direction;
  if (DIRECTIONS.indexOf(out.direction) === -1) {
    fail('direction', '方向非法：' + opts.direction);
  }
  out.fillMode = opts.fillMode === undefined || opts.fillMode === null ?
    'none' : opts.fillMode;
  if (FILL_MODES.indexOf(out.fillMode) === -1) {
    fail('fillMode', '填充模式非法：' + opts.fillMode);
  }
  out.timingFunction = opts.timingFunction === undefined ||
    opts.timingFunction === null || opts.timingFunction === '' ?
    'ease' : validateEasing(opts.timingFunction, 'timingFunction');
  return out;
}

var NAME_RE = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

/* 单帧声明：opacity 恒输出；transform 按 translate -> rotate -> scale
 * 合成且默认值省略；背景色与单帧缓动为空时不输出对应行。 */
function buildFrameDecl(f) {
  var decls = ['opacity: ' + fmtNum(f.opacity) + ';'];
  var parts = [];
  if (f.translateX !== 0 || f.translateY !== 0) {
    parts.push('translate(' + fmtNum(f.translateX) + 'px, ' +
      fmtNum(f.translateY) + 'px)');
  }
  if (f.rotate !== 0) parts.push('rotate(' + fmtNum(f.rotate) + 'deg)');
  if (f.scale !== 1) parts.push('scale(' + fmtNum(f.scale) + ')');
  if (parts.length) decls.push('transform: ' + parts.join(' ') + ';');
  if (f.backgroundColor) decls.push('background-color: ' + f.backgroundColor + ';');
  if (f.easing) decls.push('animation-timing-function: ' + f.easing + ';');
  return decls.join(' ');
}

/* @keyframes 块：动画名校验、帧数 2–10、须含 0% 与 100%。 */
function buildKeyframesCss(name, frames) {
  if (typeof name !== 'string' || !NAME_RE.test(name)) {
    fail('name', '动画名须以字母开头，仅含字母、数字、下划线、连字符');
  }
  var sorted = sortFrames(frames);
  if (sorted.length < 2 || sorted.length > 10) {
    fail('frames', '关键帧须为 2–10 个');
  }
  var stops = sorted.map(function (f) { return f.stop; });
  if (stops.indexOf(0) === -1 || stops.indexOf(100) === -1) {
    fail('frames', '关键帧须含 0% 与 100%');
  }
  var lines = sorted.map(function (f) {
    return '  ' + fmtNum(f.stop) + '% { ' + buildFrameDecl(f) + ' }';
  });
  return '@keyframes ' + name + ' {\n' + lines.join('\n') + '\n}';
}

/* 完整 CSS：关键帧块 + .animated-element 缩写行。 */
function buildAnimationCss(name, frames, opts) {
  var keyframes = buildKeyframesCss(name, frames);
  var o = validateAnimation(opts);
  var anim = 'animation: ' + name + ' ' + fmtNum(o.duration) + 's ' +
    o.timingFunction + ' ' + fmtNum(o.delay) + 's ' + o.iteration + ' ' +
    o.direction + ' ' + o.fillMode + ';';
  return keyframes + '\n\n.animated-element {\n  ' + anim + '\n}';
}

/* HTML 片段：<style> 内嵌完整 CSS + 预览元素（内容为动画名），无 <script>。 */
function buildHtmlSnippet(name, frames, opts) {
  var css = buildAnimationCss(name, frames, opts);
  return '<style>\n' + css + '\n</style>\n<div class="animated-element">' +
    name + '</div>';
}

/* 连字符转驼峰：fade-in -> fadeIn，首段小写、后续段首字母大写。 */
function toCamel(key) {
  return key.split('-').map(function (p, i) {
    if (i === 0) return p;
    return p.charAt(0).toUpperCase() + p.slice(1);
  }).join('');
}

var PRESETS = {
  'fade-in': {
    frames: [
      { stop: 0, opacity: 0 },
      { stop: 100, opacity: 1 }
    ],
    opts: { duration: 1, delay: 0, iteration: 1, direction: 'normal',
      fillMode: 'none', timingFunction: 'ease' }
  },
  'slide-in-left': {
    frames: [
      { stop: 0, opacity: 0, translateX: -200 },
      { stop: 100, opacity: 1, translateX: 0 }
    ],
    opts: { duration: 1, delay: 0, iteration: 1, direction: 'normal',
      fillMode: 'none', timingFunction: 'ease-out' }
  },
  'bounce': {
    frames: [
      { stop: 0, translateY: 0 },
      { stop: 50, translateY: -60 },
      { stop: 100, translateY: 0 }
    ],
    opts: { duration: 1, delay: 0, iteration: 2, direction: 'normal',
      fillMode: 'none', timingFunction: 'ease' }
  },
  'rotate': {
    frames: [
      { stop: 0, rotate: 0 },
      { stop: 100, rotate: 360 }
    ],
    opts: { duration: 2, delay: 0, iteration: 'infinite', direction: 'normal',
      fillMode: 'none', timingFunction: 'linear' }
  },
  'pulse': {
    frames: [
      { stop: 0, scale: 1 },
      { stop: 50, scale: 1.2 },
      { stop: 100, scale: 1 }
    ],
    opts: { duration: 1, delay: 0, iteration: 'infinite', direction: 'normal',
      fillMode: 'none', timingFunction: 'ease-in-out' }
  }
};
var PRESET_ORDER = ['fade-in', 'slide-in-left', 'bounce', 'rotate', 'pulse'];

/* 预设：返回 { name（驼峰动画名）, frames, opts } 的全新副本；未知预设失败。 */
function generatePreset(key) {
  var p = PRESETS[key];
  if (!p) fail('preset', '未知预设：' + key);
  return {
    name: toCamel(key),
    frames: p.frames.map(function (f) { return validateFrame(f); }),
    opts: validateAnimation(p.opts)
  };
}

/* 导出文件名：css -> animation.css，html -> animation-demo.html，其它失败。 */
function suggestExportName(kind) {
  if (kind === 'css') return 'animation.css';
  if (kind === 'html') return 'animation-demo.html';
  fail('kind', '未知导出类型：' + kind);
}

var API = {
  parseStop: parseStop, validateFrame: validateFrame,
  sortFrames: sortFrames, addFrame: addFrame, removeFrame: removeFrame,
  validateAnimation: validateAnimation, buildKeyframesCss: buildKeyframesCss,
  buildAnimationCss: buildAnimationCss, buildHtmlSnippet: buildHtmlSnippet,
  generatePreset: generatePreset, suggestExportName: suggestExportName,
  validateEasing: validateEasing, fmtNum: fmtNum,
  EASING_KEYWORDS: EASING_KEYWORDS, PRESET_ORDER: PRESET_ORDER,
  DIRECTIONS: DIRECTIONS, FILL_MODES: FILL_MODES
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = API;
  return;
}
if (typeof window !== 'undefined') window.CssKeyframeGenerator = API;

/* ---------------- 浏览器 DOM 逻辑 ---------------- */
function $(id) { return document.getElementById(id); }

var state = (function () {
  var p = generatePreset('fade-in');
  return { name: p.name, frames: p.frames, opts: p.opts, shape: 'square' };
})();
var paused = false;

function showMsg(text) {
  var el = $('ckf-msg');
  if (el) el.textContent = text || '';
}
function toast(text) {
  var el = $('ckf-toast');
  if (!el) return;
  el.textContent = text;
  el.style.display = 'block';
  clearTimeout(el._t);
  el._t = setTimeout(function () { el.style.display = 'none'; }, 2600);
}
function setExportEnabled(on) {
  ['ckf-copy-keyframes', 'ckf-copy-all', 'ckf-download-css',
   'ckf-download-html'].forEach(function (id) {
    var b = $(id);
    if (b) b.disabled = !on;
  });
}

/* 刷新代码区与预览样式；非法时红字提示并禁用导出，预览保留上次可用 CSS。 */
function refresh() {
  try {
    var keyframes = buildKeyframesCss(state.name, state.frames);
    var css = buildAnimationCss(state.name, state.frames, state.opts);
    var kEl = $('ckf-code-keyframes');
    var aEl = $('ckf-code-all');
    if (kEl) kEl.textContent = keyframes;
    if (aEl) aEl.textContent = css;
    var styleEl = $('ckf-preview-style');
    if (styleEl) styleEl.textContent = css;
    showMsg('');
    setExportEnabled(true);
  } catch (e) {
    showMsg(e.message);
    setExportEnabled(false);
  }
}

var FRAME_FIELDS = [
  { key: 'opacity', label: '不透明度', min: 0, max: 1, step: 0.01, unit: '' },
  { key: 'translateX', label: '水平位移', min: -2000, max: 2000, step: 1, unit: 'px' },
  { key: 'translateY', label: '垂直位移', min: -2000, max: 2000, step: 1, unit: 'px' },
  { key: 'scale', label: '缩放', min: 0, max: 10, step: 0.05, unit: '' },
  { key: 'rotate', label: '旋转', min: -720, max: 720, step: 1, unit: 'deg' }
];
var EASING_OPTIONS = [
  { v: '', label: '继承全局缓动' },
  { v: 'ease', label: 'ease' },
  { v: 'linear', label: 'linear' },
  { v: 'ease-in', label: 'ease-in' },
  { v: 'ease-out', label: 'ease-out' },
  { v: 'ease-in-out', label: 'ease-in-out' },
  { v: 'cubic-bezier', label: 'cubic-bezier 自定义…' }
];

function easingSelectHtml(current, prefix) {
  var cur = current || '';
  var isCubic = cur.indexOf('cubic-bezier') === 0;
  var selVal = isCubic ? 'cubic-bezier' : cur;
  var html = '<select data-role="easing-select" data-prefix="' + prefix + '">';
  EASING_OPTIONS.forEach(function (o) {
    html += '<option value="' + o.v + '"' +
      (o.v === selVal ? ' selected' : '') + '>' + o.label + '</option>';
  });
  html += '</select>';
  var nums = [0.25, 0.1, 0.25, 1];
  if (isCubic) {
    var m = /^cubic-bezier\(([^)]+)\)$/.exec(cur);
    if (m) nums = m[1].split(',').map(function (s) { return parseFloat(s.trim()); });
  }
  html += '<span data-role="cubic-wrap" data-prefix="' + prefix + '"' +
    (isCubic ? '' : ' style="display:none"') + '> ' +
    ['x1', 'y1', 'x2', 'y2'].map(function (k, i) {
      return '<label>' + k + ' <input type="number" data-role="cubic-' + k +
        '" data-prefix="' + prefix + '" step="0.01" value="' + nums[i] + '"></label>';
    }).join(' ') + '</span>';
  return html;
}

function frameCardHtml(f, idx) {
  var html = '<div class="ckf-frame" data-idx="' + idx + '">' +
    '<div class="ckf-frame-head"><b>关键帧 ' + (idx + 1) + ' · ' +
    fmtNum(f.stop) + '%</b>' +
    '<button class="ckf-btn ckf-btn-small" type="button" data-role="del-frame" ' +
    'data-idx="' + idx + '">删除本帧</button></div>' +
    '<div class="ckf-row"><label>停靠点</label>' +
    '<input type="range" data-role="stop-range" data-idx="' + idx +
    '" min="0" max="100" step="1" value="' + f.stop + '">' +
    '<input type="number" data-role="stop-num" data-idx="' + idx +
    '" min="0" max="100" step="0.01" value="' + f.stop + '"><span>%</span></div>';
  FRAME_FIELDS.forEach(function (fd) {
    html += '<div class="ckf-row"><label>' + fd.label + '</label>' +
      '<input type="range" data-role="field-range" data-idx="' + idx +
      '" data-key="' + fd.key + '" min="' + fd.min + '" max="' + fd.max +
      '" step="' + fd.step + '" value="' + f[fd.key] + '">' +
      '<input type="number" data-role="field-num" data-idx="' + idx +
      '" data-key="' + fd.key + '" min="' + fd.min + '" max="' + fd.max +
      '" step="' + fd.step + '" value="' + f[fd.key] + '">' +
      '<span>' + fd.unit + '</span></div>';
  });
  html += '<div class="ckf-row"><label>背景色</label>' +
    '<input type="color" data-role="bg-color" data-idx="' + idx +
    '" value="' + (f.backgroundColor || '#2563eb') + '">' +
    '<input type="text" data-role="bg-text" data-idx="' + idx +
    '" placeholder="留空表示不输出" value="' + f.backgroundColor + '">' +
    '<button class="ckf-btn ckf-btn-small" type="button" data-role="bg-clear" ' +
    'data-idx="' + idx + '">清除</button></div>' +
    '<div class="ckf-row"><label>单帧缓动</label>' +
    easingSelectHtml(f.easing, 'f' + idx) + '</div></div>';
  return html;
}

function renderFrames() {
  var wrap = $('ckf-frames');
  if (!wrap) return;
  wrap.innerHTML = state.frames.map(frameCardHtml).join('');
  var addBtn = $('ckf-add-frame');
  if (addBtn) addBtn.disabled = state.frames.length >= 10;
  bindFrameEvents();
  refresh();
}

function cubicValue(prefix) {
  var vals = ['x1', 'y1', 'x2', 'y2'].map(function (k) {
    var el = document.querySelector('[data-role="cubic-' + k + '"][data-prefix="' + prefix + '"]');
    return el ? el.value : '0';
  });
  return 'cubic-bezier(' + vals.join(', ') + ')';
}

function applyFrameEasing(idx) {
  var sel = document.querySelector('[data-role="easing-select"][data-prefix="f' + idx + '"]');
  if (!sel) return;
  var wrap = document.querySelector('[data-role="cubic-wrap"][data-prefix="f' + idx + '"]');
  var val = sel.value === 'cubic-bezier' ? cubicValue('f' + idx) : sel.value;
  if (wrap) wrap.style.display = sel.value === 'cubic-bezier' ? '' : 'none';
  try {
    var next = state.frames.slice();
    next[idx] = validateFrame(Object.assign({}, state.frames[idx], { easing: val }));
    state.frames = next;
    refresh();
  } catch (e) { showMsg(e.message); renderFrames(); }
}

function bindFrameEvents() {
  var wrap = $('ckf-frames');
  if (!wrap) return;
  wrap.querySelectorAll('[data-role="stop-range"]').forEach(function (el) {
    el.addEventListener('input', function () {
      var num = wrap.querySelector('[data-role="stop-num"][data-idx="' + el.dataset.idx + '"]');
      if (num) num.value = el.value;
      setStop(Number(el.dataset.idx), Number(el.value), false);
    });
    el.addEventListener('change', function () { renderFrames(); });
  });
  wrap.querySelectorAll('[data-role="stop-num"]').forEach(function (el) {
    el.addEventListener('change', function () {
      setStop(Number(el.dataset.idx), Number(el.value), true);
    });
  });
  wrap.querySelectorAll('[data-role="field-range"]').forEach(function (el) {
    el.addEventListener('input', function () {
      var num = wrap.querySelector('[data-role="field-num"][data-idx="' + el.dataset.idx + '"][data-key="' + el.dataset.key + '"]');
      if (num) num.value = el.value;
      setField(Number(el.dataset.idx), el.dataset.key, Number(el.value), false);
    });
  });
  wrap.querySelectorAll('[data-role="field-num"]').forEach(function (el) {
    el.addEventListener('change', function () {
      setField(Number(el.dataset.idx), el.dataset.key, Number(el.value), true);
    });
  });
  wrap.querySelectorAll('[data-role="bg-color"]').forEach(function (el) {
    el.addEventListener('input', function () {
      setBg(Number(el.dataset.idx), el.value);
      var tx = wrap.querySelector('[data-role="bg-text"][data-idx="' + el.dataset.idx + '"]');
      if (tx) tx.value = el.value;
    });
  });
  wrap.querySelectorAll('[data-role="bg-text"]').forEach(function (el) {
    el.addEventListener('change', function () {
      setBg(Number(el.dataset.idx), el.value.trim());
    });
  });
  wrap.querySelectorAll('[data-role="bg-clear"]').forEach(function (el) {
    el.addEventListener('click', function () {
      setBg(Number(el.dataset.idx), '');
      renderFrames();
    });
  });
  wrap.querySelectorAll('[data-role="del-frame"]').forEach(function (el) {
    el.addEventListener('click', function () {
      var idx = Number(el.dataset.idx);
      try {
        state.frames = removeFrame(state.frames, state.frames[idx].stop);
        renderFrames();
      } catch (e) { showMsg(e.message); }
    });
  });
  wrap.querySelectorAll('[data-role="easing-select"]').forEach(function (sel) {
    sel.addEventListener('change', function () {
      applyFrameEasing(Number(sel.dataset.prefix.slice(1)));
    });
  });
  wrap.querySelectorAll('[data-role^="cubic-"]').forEach(function (el) {
    el.addEventListener('change', function () {
      applyFrameEasing(Number(el.dataset.prefix.slice(1)));
    });
  });
}

/* 改停靠点：排序后重排；重复停靠点时报错并还原。 */
function setStop(idx, v, rerender) {
  try {
    var next = state.frames.slice();
    next[idx] = validateFrame(Object.assign({}, state.frames[idx], { stop: v }));
    state.frames = sortFrames(next);
    refresh();
    if (rerender) renderFrames();
  } catch (e) {
    showMsg(e.message);
    if (rerender) renderFrames();
  }
}
function setField(idx, key, v, rerender) {
  try {
    var patch = {};
    patch[key] = v;
    var next = state.frames.slice();
    next[idx] = validateFrame(Object.assign({}, state.frames[idx], patch));
    state.frames = next;
    refresh();
    if (rerender) renderFrames();
  } catch (e) {
    showMsg(e.message);
    if (rerender) renderFrames();
  }
}
function setBg(idx, v) {
  try {
    var next = state.frames.slice();
    next[idx] = validateFrame(Object.assign({}, state.frames[idx], { backgroundColor: v }));
    state.frames = next;
    refresh();
  } catch (e) {
    showMsg(e.message);
    renderFrames();
  }
}

function applyPreset(key) {
  try {
    var p = generatePreset(key);
    state.name = p.name;
    state.frames = p.frames;
    state.opts = p.opts;
    var nameEl = $('ckf-name');
    if (nameEl) nameEl.value = p.name;
    renderAnimControls();
    renderFrames();
    restartPreview();
    showMsg('已载入预设 ' + key + '（动画名 ' + p.name + '）');
  } catch (e) { showMsg(e.message); }
}

function renderAnimControls() {
  var o = state.opts;
  var set = function (id, v) { var el = $(id); if (el) el.value = v; };
  set('ckf-duration', o.duration);
  set('ckf-duration-range', o.duration);
  set('ckf-delay', o.delay);
  set('ckf-delay-range', o.delay);
  set('ckf-iteration', o.iteration === 'infinite' ? 1 : o.iteration);
  var inf = $('ckf-iteration-inf');
  if (inf) inf.checked = o.iteration === 'infinite';
  set('ckf-direction', o.direction);
  set('ckf-fill', o.fillMode);
  var sel = $('ckf-easing');
  if (sel) {
    var isCubic = o.timingFunction.indexOf('cubic-bezier') === 0;
    sel.value = isCubic ? 'cubic-bezier' : o.timingFunction;
    var wrap = $('ckf-cubic-wrap');
    if (wrap) wrap.style.display = isCubic ? '' : 'none';
    if (isCubic) {
      var m = /^cubic-bezier\(([^)]+)\)$/.exec(o.timingFunction);
      if (m) {
        m[1].split(',').forEach(function (s, i) {
          var k = ['x1', 'y1', 'x2', 'y2'][i];
          var el = $('ckf-cubic-' + k);
          if (el) el.value = parseFloat(s.trim());
        });
      }
    }
  }
}

function applyGlobalEasing() {
  var sel = $('ckf-easing');
  if (!sel) return;
  var wrap = $('ckf-cubic-wrap');
  var val = sel.value === 'cubic-bezier' ? cubicValue('g') : sel.value;
  if (wrap) wrap.style.display = sel.value === 'cubic-bezier' ? '' : 'none';
  try {
    state.opts = validateAnimation(Object.assign({}, state.opts, { timingFunction: val }));
    refresh();
  } catch (e) { showMsg(e.message); }
}

function setAnimField(key, v) {
  try {
    var patch = {};
    patch[key] = v;
    state.opts = validateAnimation(Object.assign({}, state.opts, patch));
    refresh();
  } catch (e) {
    showMsg(e.message);
    renderAnimControls();
  }
}

function previewEl() { return $('ckf-preview-el'); }
function restartPreview() {
  var el = previewEl();
  if (!el) return;
  el.classList.remove('animated-element');
  void el.offsetWidth;
  el.style.animationPlayState = '';
  el.classList.add('animated-element');
  paused = false;
  var btn = $('ckf-play-pause');
  if (btn) btn.textContent = '⏸ 暂停';
}
function togglePlay() {
  var el = previewEl();
  if (!el) return;
  var btn = $('ckf-play-pause');
  if (paused) {
    el.style.animationPlayState = 'running';
    paused = false;
    if (btn) btn.textContent = '⏸ 暂停';
  } else {
    el.style.animationPlayState = 'paused';
    paused = true;
    if (btn) btn.textContent = '▶ 继续播放';
  }
}
function setShape(shape) {
  state.shape = shape;
  var el = previewEl();
  if (!el) return;
  el.classList.remove('ckf-shape-square', 'ckf-shape-circle', 'ckf-shape-text');
  el.classList.add('ckf-shape-' + shape);
  el.textContent = shape === 'text' ? '动画' : '';
  restartPreview();
}

function copyText(text, okMsg) {
  function failCopy() { toast('复制失败，请手动选中代码区内容复制'); }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () { toast(okMsg); }, failCopy);
  } else {
    var ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
      if (document.execCommand('copy')) toast(okMsg); else failCopy();
    } catch (e) { failCopy(); }
    document.body.removeChild(ta);
  }
}
function downloadFile(name, content) {
  var blob = new Blob([content + '\n'], { type: 'text/plain' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 500);
  toast('已下载 ' + name);
}

function init() {
  PRESET_ORDER.forEach(function (key) {
    var btn = $('ckf-preset-' + key);
    if (btn) btn.addEventListener('click', function () { applyPreset(key); });
  });
  var addBtn = $('ckf-add-frame');
  if (addBtn) addBtn.addEventListener('click', function () {
    try {
      var sorted = sortFrames(state.frames);
      var best = null, bestGap = 0;
      for (var i = 0; i < sorted.length - 1; i++) {
        var gap = sorted[i + 1].stop - sorted[i].stop;
        if (gap > bestGap) { bestGap = gap; best = (sorted[i].stop + sorted[i + 1].stop) / 2; }
      }
      if (best === null || bestGap < 1) { showMsg('相邻关键帧之间已无空位可插帧'); return; }
      best = Math.round(best * 10) / 10;
      state.frames = addFrame(state.frames,
        { stop: best, opacity: 1, translateX: 0, translateY: 0,
          scale: 1, rotate: 0, backgroundColor: '', easing: '' });
      renderFrames();
    } catch (e) { showMsg(e.message); }
  });
  var nameEl = $('ckf-name');
  if (nameEl) nameEl.addEventListener('change', function () {
    if (!NAME_RE.test(nameEl.value)) {
      showMsg('动画名须以字母开头，仅含字母、数字、下划线、连字符');
      nameEl.value = state.name;
      return;
    }
    state.name = nameEl.value;
    refresh();
  });
  var dur = $('ckf-duration');
  var durR = $('ckf-duration-range');
  if (dur) dur.addEventListener('change', function () {
    setAnimField('duration', Number(dur.value));
    if (durR) durR.value = state.opts.duration;
  });
  if (durR) durR.addEventListener('input', function () {
    setAnimField('duration', Number(durR.value));
    if (dur) dur.value = state.opts.duration;
  });
  var del = $('ckf-delay');
  var delR = $('ckf-delay-range');
  if (del) del.addEventListener('change', function () {
    setAnimField('delay', Number(del.value));
    if (delR) delR.value = state.opts.delay;
  });
  if (delR) delR.addEventListener('input', function () {
    setAnimField('delay', Number(delR.value));
    if (del) del.value = state.opts.delay;
  });
  var it = $('ckf-iteration');
  if (it) it.addEventListener('change', function () {
    var inf = $('ckf-iteration-inf');
    if (inf && inf.checked) return;
    setAnimField('iteration', Math.round(Number(it.value)));
  });
  var inf = $('ckf-iteration-inf');
  if (inf) inf.addEventListener('change', function () {
    setAnimField('iteration', inf.checked ? 'infinite' :
      Math.max(1, Math.round(Number(($('ckf-iteration') || {}).value || 1))));
    renderAnimControls();
  });
  var dir = $('ckf-direction');
  if (dir) dir.addEventListener('change', function () { setAnimField('direction', dir.value); });
  var fill = $('ckf-fill');
  if (fill) fill.addEventListener('change', function () { setAnimField('fillMode', fill.value); });
  var ge = $('ckf-easing');
  if (ge) ge.addEventListener('change', applyGlobalEasing);
  ['x1', 'y1', 'x2', 'y2'].forEach(function (k) {
    var el = $('ckf-cubic-' + k);
    if (el) el.addEventListener('change', applyGlobalEasing);
  });
  ['square', 'circle', 'text'].forEach(function (s) {
    var b = $('ckf-shape-' + s);
    if (b) b.addEventListener('click', function () { setShape(s); });
  });
  var pp = $('ckf-play-pause');
  if (pp) pp.addEventListener('click', togglePlay);
  var rs = $('ckf-reset');
  if (rs) rs.addEventListener('click', restartPreview);
  var ck = $('ckf-copy-keyframes');
  if (ck) ck.addEventListener('click', function () {
    try { copyText(buildKeyframesCss(state.name, state.frames), '已复制 @keyframes 代码'); }
    catch (e) { showMsg(e.message); }
  });
  var ca = $('ckf-copy-all');
  if (ca) ca.addEventListener('click', function () {
    try { copyText(buildAnimationCss(state.name, state.frames, state.opts), '已复制完整 CSS'); }
    catch (e) { showMsg(e.message); }
  });
  var dc = $('ckf-download-css');
  if (dc) dc.addEventListener('click', function () {
    try {
      downloadFile(suggestExportName('css'),
        buildAnimationCss(state.name, state.frames, state.opts));
    } catch (e) { showMsg(e.message); }
  });
  var dh = $('ckf-download-html');
  if (dh) dh.addEventListener('click', function () {
    try {
      downloadFile(suggestExportName('html'),
        buildHtmlSnippet(state.name, state.frames, state.opts));
    } catch (e) { showMsg(e.message); }
  });
  var ex = $('ckf-load-example');
  if (ex) ex.addEventListener('click', function () { applyPreset('fade-in'); });
  renderAnimControls();
  renderFrames();
  restartPreview();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
})();
