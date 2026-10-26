/* CSS 缓动曲线生成器（css_easing_generator）- 纯前端本地计算
 * 控制点 x1/x2 限 0-1，y1/y2 限 -1-2（y 超出 0-1 为合法回弹区间）；
 * 时长限 0.2-3 秒。数值统一保留 2 位小数输出。
 * 纯函数经 module.exports 暴露供 node 测试；浏览器里走 DOM。
 * 零网络请求：本文件不发起任何 fetch / XHR。 */
(function () {
'use strict';

/* 钳制到 [min, max]；非数字时返回 min（调用方另行提示）。 */
function clampNum(v, min, max) {
  var n = Number(v);
  if (isNaN(n)) return min;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}
function clampX(v) { return clampNum(v, 0, 1); }
function clampY(v) { return clampNum(v, -1, 2); }
function clampDuration(v) { return clampNum(v, 0.2, 3); }

/* 2 位小数：-0 归零，避免输出 -0.00。 */
function fmt2(n) {
  var v = Math.round(Number(n) * 100) / 100;
  if (v === 0) v = 0;
  return v.toFixed(2);
}

/* 10 组预设：前 5 组为 CSS 关键字曲线，后 5 组为常用缓动函数。 */
var PRESETS = {
  'linear': [0, 0, 1, 1],
  'ease': [0.25, 0.10, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
  'easeInQuad': [0.11, 0, 0.50, 0],
  'easeOutQuad': [0.50, 1, 0.89, 1],
  'easeInOutQuad': [0.45, 0, 0.55, 1],
  'easeInCubic': [0.32, 0, 0.67, 0],
  'easeOutCubic': [0.33, 1, 0.68, 1]
};
var PRESET_ORDER = ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out',
  'easeInQuad', 'easeOutQuad', 'easeInOutQuad', 'easeInCubic', 'easeOutCubic'];

function presetValues(name) {
  var p = PRESETS[name];
  if (!p) return null;
  return { x1: p[0], y1: p[1], x2: p[2], y2: p[3] };
}

/* 默认状态：ease、1 秒。 */
function defaultState() {
  return { x1: 0.25, y1: 0.10, x2: 0.25, y2: 1, duration: 1 };
}

/* 校验一项输入：返回 {value, message}，message 为 null 表示未钳制。
 * key 为 x1/x2/y1/y2/duration 之一，提示指明是哪一项。 */
function validateField(key, raw) {
  var labels = { x1: 'x1', y1: 'y1', x2: 'x2', y2: 'y2', duration: '动画时长' };
  var ranges = {
    x1: [0, 1], x2: [0, 1], y1: [-1, 2], y2: [-1, 2], duration: [0.2, 3]
  };
  var r = ranges[key];
  var n = Number(raw);
  if (isNaN(n)) {
    return { value: r[0], message: labels[key] + '不是有效数字，已钳制为 ' + fmt2(r[0]) };
  }
  if (n < r[0]) {
    return { value: r[0], message: labels[key] + '超出范围，已钳制为 ' + fmt2(r[0]) };
  }
  if (n > r[1]) {
    return { value: r[1], message: labels[key] + '超出范围，已钳制为 ' + fmt2(r[1]) };
  }
  return { value: n, message: null };
}

/* 三段代码生成：数值 2 位小数，时长同步到 transition。 */
function buildCodes(s) {
  var bezier = 'cubic-bezier(' + fmt2(s.x1) + ', ' + fmt2(s.y1) + ', ' +
    fmt2(s.x2) + ', ' + fmt2(s.y2) + ')';
  var transition = 'transition: all ' + fmt2(s.duration) + 's ' + bezier + ';';
  var timing = 'transition-timing-function: ' + bezier + ';';
  var cssText = '.easing-box {\n  ' + transition + '\n  ' + timing + '\n}';
  return { bezier: bezier, transition: transition, timingFunction: timing, cssText: cssText };
}

/* 三次贝塞尔点：t∈[0,1]，起止点 (0,0)→(1,1)。 */
function bezierPoint(t, x1, y1, x2, y2) {
  var u = 1 - t;
  var x = 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t;
  var y = 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t;
  return { x: x, y: y };
}

/* 画布映射：viewBox 300×300；x∈[0,1]→0–300，y∈[-1,2]→300–0。 */
function mapX(x) { return x * 300; }
function mapY(y) { return (2 - y) * 100; }

/* SVG 曲线 path：M 起点 C 控制点1 控制点2 终点。 */
function buildCurvePath(x1, y1, x2, y2) {
  return 'M 0 ' + mapY(0) + ' C ' + mapX(x1) + ' ' + mapY(y1) + ', ' +
    mapX(x2) + ' ' + mapY(y2) + ', 300 ' + mapY(1);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    clampX: clampX, clampY: clampY, clampDuration: clampDuration,
    clampNum: clampNum, fmt2: fmt2, PRESETS: PRESETS,
    PRESET_ORDER: PRESET_ORDER, presetValues: presetValues,
    defaultState: defaultState, validateField: validateField,
    buildCodes: buildCodes, bezierPoint: bezierPoint,
    mapX: mapX, mapY: mapY, buildCurvePath: buildCurvePath
  };
  return;
}

/* ---------------- 浏览器 DOM 逻辑 ---------------- */
function $(id) { return document.getElementById(id); }

var state = defaultState();
var dragTarget = null;

function showMsg(text) {
  var el = $('ceg-msg');
  if (el) el.textContent = text;
}
function toast(text) {
  var el = $('ceg-toast');
  if (!el) return;
  el.textContent = text;
  el.style.display = 'block';
  clearTimeout(el._t);
  el._t = setTimeout(function () { el.style.display = 'none'; }, 2600);
}

/* 刷新：输入框/滑杆值、画布、代码、预览动画时长四方同步。 */
function render() {
  var keys = ['x1', 'y1', 'x2', 'y2'];
  keys.forEach(function (k) {
    var num = $('ceg-' + k);
    var rng = $('ceg-' + k + '-range');
    if (num) num.value = fmt2(state[k]);
    if (rng) rng.value = state[k];
  });
  var durNum = $('ceg-duration');
  var durRng = $('ceg-duration-range');
  if (durNum) durNum.value = fmt2(state.duration);
  if (durRng) durRng.value = state.duration;

  var path = $('ceg-curve');
  if (path) path.setAttribute('d', buildCurvePath(state.x1, state.y1, state.x2, state.y2));
  var c1 = $('ceg-cp1');
  var c2 = $('ceg-cp2');
  if (c1) { c1.setAttribute('cx', mapX(state.x1)); c1.setAttribute('cy', mapY(state.y1)); }
  if (c2) { c2.setAttribute('cx', mapX(state.x2)); c2.setAttribute('cy', mapY(state.y2)); }
  var l1 = $('ceg-line1');
  var l2 = $('ceg-line2');
  if (l1) { l1.setAttribute('x2', mapX(state.x1)); l1.setAttribute('y2', mapY(state.y1)); }
  if (l2) { l2.setAttribute('x1', mapX(state.x2)); l2.setAttribute('y1', mapY(state.y2)); }

  var codes = buildCodes(state);
  var b = $('ceg-code-bezier');
  var t = $('ceg-code-transition');
  var f = $('ceg-code-timing');
  var all = $('ceg-code-all');
  if (b) b.textContent = codes.bezier;
  if (t) t.textContent = codes.transition;
  if (f) f.textContent = codes.timingFunction;
  if (all) all.textContent = codes.cssText;

  var box = $('ceg-preview-box');
  if (box) {
    box.style.transitionDuration = fmt2(state.duration) + 's';
    box.style.transitionTimingFunction = codes.bezier;
  }
}

/* 从输入框/滑杆改一项：钳制并提示后同步另一控件。 */
function setField(key, raw) {
  var r = validateField(key, raw);
  state[key] = r.value;
  if (r.message) showMsg(r.message);
  render();
}

function bindField(key) {
  var num = $('ceg-' + key);
  var rng = $('ceg-' + key + '-range');
  if (num) num.addEventListener('change', function () { setField(key, num.value); });
  if (rng) rng.addEventListener('input', function () { state[key] = Number(rng.value); render(); });
}

function applyPreset(name) {
  var p = presetValues(name);
  if (!p) return;
  state.x1 = p.x1; state.y1 = p.y1; state.x2 = p.x2; state.y2 = p.y2;
  showMsg('已载入预设 ' + name + '：cubic-bezier(' +
    fmt2(p.x1) + ', ' + fmt2(p.y1) + ', ' + fmt2(p.x2) + ', ' + fmt2(p.y2) + ')');
  render();
  playPreview();
}

function playPreview() {
  var box = $('ceg-preview-box');
  var track = $('ceg-track');
  if (!box || !track) return;
  var dist = Math.max(0, track.clientWidth - box.offsetWidth - 16);
  box.style.transition = 'none';
  box.style.transform = 'translateX(0px)';
  void box.offsetWidth;
  box.style.transition = 'transform ' + fmt2(state.duration) + 's ' +
    buildCodes(state).bezier;
  box.style.transform = 'translateX(' + dist + 'px)';
}

function copyText(text, okMsg) {
  function fail() {
    toast('复制失败，请手动选中代码区内容复制');
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () { toast(okMsg); }, fail);
  } else {
    var ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
      if (document.execCommand('copy')) toast(okMsg); else fail();
    } catch (e) { fail(); }
    document.body.removeChild(ta);
  }
}

function downloadCss() {
  var blob = new Blob([buildCodes(state).cssText + '\n'], { type: 'text/css' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'easing.css';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 500);
  toast('已下载 easing.css');
}

/* 画布拖动：指针坐标→控制点值（x 钳制 0–1，y 钳制 -1–2），双向同步。 */
function svgPos(evt) {
  var svg = $('ceg-svg');
  var rect = svg.getBoundingClientRect();
  var fx = (evt.clientX - rect.left) / rect.width;
  var fy = (evt.clientY - rect.top) / rect.height;
  return {
    x: clampX(Math.round(fx * 100) / 100),
    y: clampY(Math.round((2 - fy * 3) * 100) / 100)
  };
}
function bindDrag(circleId, keyX, keyY) {
  var el = $(circleId);
  if (!el) return;
  el.addEventListener('pointerdown', function (evt) {
    dragTarget = { x: keyX, y: keyY };
    el.setPointerCapture(evt.pointerId);
    evt.preventDefault();
  });
  el.addEventListener('pointermove', function (evt) {
    if (!dragTarget) return;
    var p = svgPos(evt);
    state[dragTarget.x] = p.x;
    state[dragTarget.y] = p.y;
    render();
  });
  el.addEventListener('pointerup', function () { dragTarget = null; });
  el.addEventListener('pointercancel', function () { dragTarget = null; });
}

function init() {
  ['x1', 'y1', 'x2', 'y2', 'duration'].forEach(bindField);
  PRESET_ORDER.forEach(function (name) {
    var btn = $('ceg-preset-' + name);
    if (btn) btn.addEventListener('click', function () { applyPreset(name); });
  });
  var play = $('ceg-play');
  if (play) play.addEventListener('click', playPreview);
  var reset = $('ceg-reset');
  if (reset) reset.addEventListener('click', function () {
    state = defaultState();
    showMsg('已恢复默认：ease、1 秒');
    render();
  });
  var cb = $('ceg-copy-bezier');
  if (cb) cb.addEventListener('click', function () {
    copyText(buildCodes(state).bezier, '已复制 cubic-bezier()');
  });
  var ca = $('ceg-copy-all');
  if (ca) ca.addEventListener('click', function () {
    copyText(buildCodes(state).cssText, '已复制全部代码');
  });
  var dl = $('ceg-download');
  if (dl) dl.addEventListener('click', downloadCss);
  bindDrag('ceg-cp1', 'x1', 'y1');
  bindDrag('ceg-cp2', 'x2', 'y2');
  render();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
})();
