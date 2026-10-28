/* CSS clip-path 生成器（css_clip_path_generator）- 纯前端本地计算
 * 只做 polygon / circle / ellipse / inset 四类形状，不做 SVG path() 与新 shape() 函数；
 * 顶点一律用百分比坐标系（相对元素盒子），不支持 px / em 混合坐标。
 * 纯函数经 module.exports 暴露供 node 测试；浏览器里走 DOM。
 * 失败约定：非法参数抛 Error，err.field 给出字段名，不静默钳制、不静默取整。
 * 零网络请求：本文件不发起任何 fetch / XHR。 */
(function () {
'use strict';

/* 抛错：err.field 给出字段名。 */
function fail(field, msg) {
  var e = new Error(msg);
  e.field = field;
  throw e;
}

/* 数值校验：有限数、区间内、最多 2 位小数；否则抛错。 */
function checkNum(v, field, min, max, gtMin) {
  if (typeof v !== 'number' || !isFinite(v)) fail(field, '坐标/数值须为数字');
  if (v < min || v > max) fail(field, '数值超出范围（' + min + '–' + max + '）');
  if (gtMin && v <= min) fail(field, '数值须大于 ' + min);
  if (Math.abs(v * 100 - Math.round(v * 100)) > 1e-9) fail(field, '数值最多保留 2 位小数');
  return v;
}

/* 坐标校验：0–100、最多 2 位小数。 */
function checkCoord(v, field) { return checkNum(v, field, 0, 100, false); }

/* 数字 → 百分比输出：整数不带小数、其余最多 2 位小数（去尾零）。 */
function fmtPct(n) {
  var v = Math.round(n * 100) / 100;
  if (v === 0) v = 0;
  var s = String(v);
  return s + '%';
}

/* 点数组校验：每点 {x, y} 均合法；返回深拷贝。 */
function checkPoints(points, field) {
  if (!Array.isArray(points)) fail(field || 'points', '顶点须为数组');
  return points.map(function (p, i) {
    if (!p || typeof p !== 'object') fail(field || 'points', '第 ' + (i + 1) + ' 个顶点非法');
    return { x: checkCoord(p.x, 'x'), y: checkCoord(p.y, 'y') };
  });
}

/* 单个坐标文本 → 数值：允许省略 %，最多 2 位小数，拒绝 px / em 等单位。 */
function parseCoordToken(tok, field) {
  var t = tok.trim();
  if (!/^-?\d+(\.\d{1,2})?%?$/.test(t)) fail(field, '坐标格式非法：' + tok);
  var v = parseFloat(t.replace(/%$/, ''));
  return checkCoord(v, field);
}

/* parsePolygon(text)：'50% 0%, 100% 100%, 0% 100%' → [{x, y}, ...]。
 * 空串、点数＜3、坐标缺失/非数值/越界/分隔符错乱均抛错。 */
function parsePolygon(text) {
  if (typeof text !== 'string' || text.trim() === '') fail('polygon', 'polygon 文本不能为空');
  var parts = text.split(',');
  var points = [];
  for (var i = 0; i < parts.length; i++) {
    var seg = parts[i].trim();
    if (seg === '') fail('polygon', '第 ' + (i + 1) + ' 个顶点为空（分隔符错乱）');
    var toks = seg.split(/\s+/);
    if (toks.length !== 2) fail('polygon', '第 ' + (i + 1) + ' 个顶点须恰好有两个坐标');
    points.push({ x: parseCoordToken(toks[0], 'x'), y: parseCoordToken(toks[1], 'y') });
  }
  if (points.length < 3) fail('polygon', 'polygon 至少需要 3 个顶点');
  return points;
}

/* pointsToPolygon(points)：[{x, y}] → 'polygon(50% 0%, 100% 100%, 0% 100%)'。 */
function pointsToPolygon(points) {
  var pts = checkPoints(points, 'points');
  if (pts.length < 3) fail('points', 'polygon 至少需要 3 个顶点');
  return 'polygon(' + pts.map(function (p) { return fmtPct(p.x) + ' ' + fmtPct(p.y); }).join(', ') + ')';
}

/* 九预设几何（百分比坐标，顺时针自顶部起）。 */
var PRESETS = {
  'triangle': [{ x: 50, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
  'diamond': [{ x: 50, y: 0 }, { x: 100, y: 50 }, { x: 50, y: 100 }, { x: 0, y: 50 }],
  'pentagon': [{ x: 50, y: 0 }, { x: 97.55, y: 34.55 }, { x: 79.39, y: 90.45 }, { x: 20.61, y: 90.45 }, { x: 2.45, y: 34.55 }],
  'hexagon': [{ x: 50, y: 0 }, { x: 93.3, y: 25 }, { x: 93.3, y: 75 }, { x: 50, y: 100 }, { x: 6.7, y: 75 }, { x: 6.7, y: 25 }],
  'star': [{ x: 50, y: 0 }, { x: 61.23, y: 34.55 }, { x: 97.55, y: 34.55 }, { x: 68.16, y: 55.9 }, { x: 79.39, y: 90.45 }, { x: 50, y: 69.1 }, { x: 20.61, y: 90.45 }, { x: 31.84, y: 55.9 }, { x: 2.45, y: 34.55 }, { x: 38.77, y: 34.55 }],
  'arrow-right': [{ x: 0, y: 25 }, { x: 60, y: 25 }, { x: 60, y: 0 }, { x: 100, y: 50 }, { x: 60, y: 100 }, { x: 60, y: 75 }, { x: 0, y: 75 }],
  'chevron': [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 100, y: 50 }, { x: 60, y: 100 }, { x: 0, y: 100 }, { x: 40, y: 50 }],
  'trapezoid': [{ x: 20, y: 0 }, { x: 80, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
  'parallelogram': [{ x: 25, y: 0 }, { x: 100, y: 0 }, { x: 75, y: 100 }, { x: 0, y: 100 }]
};
var PRESET_NAMES = ['triangle', 'diamond', 'pentagon', 'hexagon', 'star', 'arrow-right', 'chevron', 'trapezoid', 'parallelogram'];
var PRESET_LABELS = {
  'triangle': '三角形', 'diamond': '菱形', 'pentagon': '五边形', 'hexagon': '六边形',
  'star': '五角星', 'arrow-right': '右箭头', 'chevron': 'chevron', 'trapezoid': '梯形', 'parallelogram': '平行四边形'
};

/* generatePreset(name)：返回对应 polygon 点数组（深拷贝）；未知 name 抛错。 */
function generatePreset(name) {
  if (!PRESETS.hasOwnProperty(name)) fail('preset', '未知预设：' + name);
  return JSON.parse(JSON.stringify(PRESETS[name]));
}

/* buildCircle(radius, cx, cy)：数值 0–100、半径＞0 → 'circle(50% at 50% 50%)'。 */
function buildCircle(radius, cx, cy) {
  checkNum(radius, 'radius', 0, 100, true);
  checkCoord(cx, 'cx');
  checkCoord(cy, 'cy');
  return 'circle(' + fmtPct(radius) + ' at ' + fmtPct(cx) + ' ' + fmtPct(cy) + ')';
}

/* buildEllipse(rx, ry, cx, cy)：数值 0–100、半径＞0 → 'ellipse(50% 40% at 50% 50%)'。 */
function buildEllipse(rx, ry, cx, cy) {
  checkNum(rx, 'rx', 0, 100, true);
  checkNum(ry, 'ry', 0, 100, true);
  checkCoord(cx, 'cx');
  checkCoord(cy, 'cy');
  return 'ellipse(' + fmtPct(rx) + ' ' + fmtPct(ry) + ' at ' + fmtPct(cx) + ' ' + fmtPct(cy) + ')';
}

/* buildInset(top, right, bottom, left, round?)：四边 0–100、round 可省（有值时 0–50）。 */
function buildInset(top, right, bottom, left, round) {
  checkCoord(top, 'top');
  checkCoord(right, 'right');
  checkCoord(bottom, 'bottom');
  checkCoord(left, 'left');
  var v = 'inset(' + fmtPct(top) + ' ' + fmtPct(right) + ' ' + fmtPct(bottom) + ' ' + fmtPct(left);
  if (round !== undefined && round !== null) {
    checkNum(round, 'round', 0, 50, false);
    v += ' round ' + fmtPct(round);
  }
  return v + ')';
}

/* 形状对象 → clip-path 值字符串。 */
function shapeToValue(shape) {
  if (!shape || typeof shape !== 'object') fail('shape', '形状对象非法');
  if (shape.kind === 'polygon') return pointsToPolygon(shape.points);
  if (shape.kind === 'circle') return buildCircle(shape.radius, shape.cx, shape.cy);
  if (shape.kind === 'ellipse') return buildEllipse(shape.rx, shape.ry, shape.cx, shape.cy);
  if (shape.kind === 'inset') return buildInset(shape.top, shape.right, shape.bottom, shape.left, shape.round);
  fail('kind', '不支持的形状类型：' + shape.kind);
}

/* buildClipCss(shape)：标准行在前、-webkit- 前缀行在后。 */
function buildClipCss(shape) {
  var v = shapeToValue(shape);
  return 'clip-path: ' + v + ';\n-webkit-clip-path: ' + v + ';';
}

/* buildHtmlSnippet(clipValue)：校验后返回演示 HTML 片段（class clip-demo，300×200，渐变背景）。 */
function buildHtmlSnippet(clipValue) {
  var shape = parseClipPath(clipValue);
  var v = shapeToValue(shape);
  return '<div class="clip-demo" style="width: 300px; height: 200px; background: linear-gradient(135deg, #3b82f6, #a855f7); clip-path: ' + v + '; -webkit-clip-path: ' + v + ';"></div>';
}

/* parseClipPath(text)：解析完整 clip-path 值，四类各按自有语法解析。
 * 其它函数名（path() / shape() / url() 等）抛错并明示「不支持的形状函数」。 */
function parseClipPath(text) {
  if (typeof text !== 'string' || text.trim() === '') fail('clipPath', 'clip-path 值不能为空');
  var t = text.trim();
  var m = /^([a-z-]+)\((.*)\)$/.exec(t);
  if (!m) fail('clipPath', 'clip-path 语法错误：须为 polygon() / circle() / ellipse() / inset() 形式');
  var fn = m[1], inner = m[2].trim();
  if (fn !== 'polygon' && fn !== 'circle' && fn !== 'ellipse' && fn !== 'inset') {
    fail('kind', '不支持的形状函数：' + fn + '()，仅支持 polygon / circle / ellipse / inset');
  }
  if (fn === 'polygon') {
    try {
      return { kind: 'polygon', points: parsePolygon(inner) };
    } catch (e) {
      if (e.field === 'polygon') e.field = 'clipPath';
      throw e;
    }
  }
  /* circle / ellipse：'50% at 50% 50%'，at 段可省（默认 50% 50%）。 */
  function parseAt(rest, kind) {
    var atParts = rest.split(/\s+at\s+/);
    if (atParts.length > 2) fail('clipPath', kind + ' 语法错误：at 段只能出现一次');
    var center = { cx: 50, cy: 50 };
    if (atParts.length === 2) {
      var c = atParts[1].trim().split(/\s+/);
      if (c.length !== 2) fail('clipPath', kind + ' 中心坐标须有两个值');
      center.cx = parseCoordToken(c[0], 'cx');
      center.cy = parseCoordToken(c[1], 'cy');
    }
    return { main: atParts[0].trim(), center: center };
  }
  if (fn === 'circle') {
    var cParsed = parseAt(inner, 'circle');
    var r = parseCoordToken(cParsed.main, 'radius');
    if (r <= 0) fail('radius', 'circle 半径须大于 0');
    return { kind: 'circle', radius: r, cx: cParsed.center.cx, cy: cParsed.center.cy };
  }
  if (fn === 'ellipse') {
    var eParsed = parseAt(inner, 'ellipse');
    var radii = eParsed.main.split(/\s+/);
    if (radii.length !== 2) fail('clipPath', 'ellipse 须有两个半径值');
    var rx = parseCoordToken(radii[0], 'rx');
    var ry = parseCoordToken(radii[1], 'ry');
    if (rx <= 0 || ry <= 0) fail('rx', 'ellipse 半径须大于 0');
    return { kind: 'ellipse', rx: rx, ry: ry, cx: eParsed.center.cx, cy: eParsed.center.cy };
  }
  /* inset：1–4 个边值（CSS 缩写展开）＋可选单值 round。 */
  var roundParts = inner.split(/\s+round\s+/);
  if (roundParts.length > 2) fail('clipPath', 'inset 的 round 段只能出现一次');
  var round = undefined;
  if (roundParts.length === 2) {
    var roundToks = roundParts[1].trim().split(/\s+/);
    if (roundToks.length !== 1) fail('round', 'inset 圆角只支持单值 round，不做四角分别圆角');
    round = parseCoordToken(roundToks[0], 'round');
    if (round > 50) fail('round', 'inset 圆角超出范围（0–50）');
  }
  var sides = roundParts[0].trim().split(/\s+/).map(function (s) { return parseCoordToken(s, 'inset'); });
  if (sides.length < 1 || sides.length > 4) fail('clipPath', 'inset 须有 1–4 个边值');
  var top, right, bottom, left;
  if (sides.length === 1) { top = right = bottom = left = sides[0]; }
  else if (sides.length === 2) { top = bottom = sides[0]; right = left = sides[1]; }
  else if (sides.length === 3) { top = sides[0]; right = left = sides[1]; bottom = sides[2]; }
  else { top = sides[0]; right = sides[1]; bottom = sides[2]; left = sides[3]; }
  return { kind: 'inset', top: top, right: right, bottom: bottom, left: left, round: round };
}

/* movePoint(points, index, x, y)：返回新数组，不改原数组。 */
function movePoint(points, index, x, y) {
  var pts = checkPoints(points, 'points');
  if (typeof index !== 'number' || index % 1 !== 0 || index < 0 || index >= pts.length) fail('index', '顶点下标越界');
  var nx = checkCoord(x, 'x');
  var ny = checkCoord(y, 'y');
  var out = pts.map(function (p) { return { x: p.x, y: p.y }; });
  out[index] = { x: nx, y: ny };
  return out;
}

/* addPoint(points, x, y)：新点追加到末尾，返回新数组。 */
function addPoint(points, x, y) {
  var pts = checkPoints(points, 'points');
  pts.push({ x: checkCoord(x, 'x'), y: checkCoord(y, 'y') });
  return pts;
}

/* removePoint(points, index)：删后＜3 点抛错。 */
function removePoint(points, index) {
  var pts = checkPoints(points, 'points');
  if (typeof index !== 'number' || index % 1 !== 0 || index < 0 || index >= pts.length) fail('index', '顶点下标越界');
  pts.splice(index, 1);
  if (pts.length < 3) fail('points', '删除后顶点不足 3 个，polygon 至少需要 3 个顶点');
  return pts;
}

/* suggestExportName(kind)：css → clip-path.css，html → clip-path-demo.html，其它抛错。 */
function suggestExportName(kind) {
  if (kind === 'css') return 'clip-path.css';
  if (kind === 'html') return 'clip-path-demo.html';
  fail('kind', '未知导出类型：' + kind + '，仅支持 css / html');
}

/* 默认状态：三角形预设。 */
function defaultState() {
  return {
    tab: 'polygon',
    points: generatePreset('triangle'),
    circle: { radius: 50, cx: 50, cy: 50 },
    ellipse: { rx: 50, ry: 40, cx: 50, cy: 50 },
    inset: { top: 10, right: 10, bottom: 10, left: 10, roundEnabled: false, round: 10 }
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    parsePolygon: parsePolygon, pointsToPolygon: pointsToPolygon,
    parseClipPath: parseClipPath, shapeToValue: shapeToValue,
    buildCircle: buildCircle, buildEllipse: buildEllipse, buildInset: buildInset,
    buildClipCss: buildClipCss, buildHtmlSnippet: buildHtmlSnippet,
    generatePreset: generatePreset, PRESET_NAMES: PRESET_NAMES, PRESET_LABELS: PRESET_LABELS,
    movePoint: movePoint, addPoint: addPoint, removePoint: removePoint,
    suggestExportName: suggestExportName, defaultState: defaultState
  };
  return;
}

/* ---------- 浏览器 DOM 逻辑 ---------- */
function $(id) { return document.getElementById(id); }
var state = defaultState();
var bgDataUrl = '';

function toast(msg) {
  var t = $('ccp-toast');
  if (!t) return;
  t.textContent = msg;
  t.style.display = 'block';
  clearTimeout(t._timer);
  t._timer = setTimeout(function () { t.style.display = 'none'; }, 2600);
}

function showError(msg) {
  var el = $('ccp-error');
  if (el) el.textContent = msg || '';
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

function downloadFile(name, text, type) {
  var blob = new Blob([text + '\n'], { type: type });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 300);
  toast('已下载 ' + name);
}

/* 当前页签的 clip-path 值；非法时返回 '' 并显示红字提示。 */
function currentValue() {
  try {
    showError('');
    if (state.tab === 'polygon') return pointsToPolygon(state.points);
    if (state.tab === 'circle') return buildCircle(state.circle.radius, state.circle.cx, state.circle.cy);
    if (state.tab === 'ellipse') return buildEllipse(state.ellipse.rx, state.ellipse.ry, state.ellipse.cx, state.ellipse.cy);
    var ins = state.inset;
    return buildInset(ins.top, ins.right, ins.bottom, ins.left, ins.roundEnabled ? ins.round : undefined);
  } catch (e) {
    showError(e.message);
    return '';
  }
}

function renderPointsList() {
  var box = $('ccp-points');
  if (!box) return;
  box.innerHTML = '';
  state.points.forEach(function (p, i) {
    var row = document.createElement('div');
    row.className = 'ccp-point-row';
    var label = document.createElement('span');
    label.className = 'ccp-point-label';
    label.textContent = '顶点 ' + (i + 1);
    var xInput = document.createElement('input');
    xInput.type = 'number'; xInput.min = '0'; xInput.max = '100'; xInput.step = '0.01'; xInput.value = p.x;
    xInput.setAttribute('aria-label', '顶点 ' + (i + 1) + ' 横坐标百分比');
    var yInput = document.createElement('input');
    yInput.type = 'number'; yInput.min = '0'; yInput.max = '100'; yInput.step = '0.01'; yInput.value = p.y;
    yInput.setAttribute('aria-label', '顶点 ' + (i + 1) + ' 纵坐标百分比');
    var pct = document.createElement('span');
    pct.textContent = '%';
    var del = document.createElement('button');
    del.type = 'button'; del.className = 'ccp-btn-small'; del.textContent = '删除';
    xInput.addEventListener('change', function () { editPoint(i, parseFloat(xInput.value), p.y, xInput); });
    yInput.addEventListener('change', function () { editPoint(i, p.x, parseFloat(yInput.value), yInput); });
    del.addEventListener('click', function () {
      try {
        state.points = removePoint(state.points, i);
        showError('');
        render();
      } catch (e) { showError(e.message); }
    });
    row.appendChild(label);
    row.appendChild(xInput);
    row.appendChild(pct.cloneNode(true));
    row.appendChild(yInput);
    row.appendChild(pct.cloneNode(true));
    row.appendChild(del);
    box.appendChild(row);
  });
}

function editPoint(i, x, y, inputEl) {
  try {
    state.points = movePoint(state.points, i, x, y);
    showError('');
    render();
  } catch (e) {
    showError(e.message);
    /* 输入非法时不更新状态：重绘列表即把输入框恢复为当前有效值。 */
    renderPointsList();
    renderCanvas();
  }
}

function renderCanvas() {
  var svg = $('ccp-svg');
  if (!svg) return;
  svg.innerHTML = '';
  var ns = 'http://www.w3.org/2000/svg';
  var pts = state.points.map(function (p) { return p.x + ',' + p.y; }).join(' ');
  var poly = document.createElementNS(ns, 'polygon');
  poly.setAttribute('points', pts);
  poly.setAttribute('fill', 'rgba(255,255,255,0.25)');
  poly.setAttribute('stroke', '#ffffff');
  poly.setAttribute('stroke-width', '1.5');
  poly.setAttribute('vector-effect', 'non-scaling-stroke');
  svg.appendChild(poly);
  state.points.forEach(function (p, i) {
    var c = document.createElementNS(ns, 'circle');
    c.setAttribute('cx', p.x);
    c.setAttribute('cy', p.y);
    c.setAttribute('r', '5');
    c.setAttribute('fill', '#ffffff');
    c.setAttribute('stroke', '#2563eb');
    c.setAttribute('stroke-width', '2');
    c.setAttribute('vector-effect', 'non-scaling-stroke');
    c.style.cursor = 'grab';
    c.style.pointerEvents = 'all';
    c.addEventListener('pointerdown', function (ev) { startDrag(i, ev); });
    svg.appendChild(c);
  });
}

var dragIndex = -1;
function startDrag(i, ev) {
  dragIndex = i;
  ev.preventDefault();
  var svg = $('ccp-svg');
  svg.setPointerCapture(ev.pointerId);
  function onMove(e) {
    if (dragIndex < 0) return;
    var rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    var x = Math.round(((e.clientX - rect.left) / rect.width) * 100 * 100) / 100;
    var y = Math.round(((e.clientY - rect.top) / rect.height) * 100 * 100) / 100;
    x = Math.max(0, Math.min(100, x));
    y = Math.max(0, Math.min(100, y));
    try {
      state.points = movePoint(state.points, dragIndex, x, y);
      showError('');
      renderCanvas();
      renderPointsList();
      renderOutput();
    } catch (e2) { showError(e2.message); }
  }
  function onUp() {
    dragIndex = -1;
    svg.removeEventListener('pointermove', onMove);
    svg.removeEventListener('pointerup', onUp);
    svg.removeEventListener('pointercancel', onUp);
    render();
  }
  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerup', onUp);
  svg.addEventListener('pointercancel', onUp);
}

function renderOutput() {
  var value = currentValue();
  var preview = $('ccp-preview');
  if (preview) {
    preview.style.clipPath = value;
    preview.style.webkitClipPath = value;
  }
  var cssText = '';
  var htmlText = '';
  if (value) {
    try {
      var shape = parseClipPath(value);
      cssText = buildClipCss(shape);
      htmlText = buildHtmlSnippet(value);
    } catch (e) { showError(e.message); }
  }
  if ($('ccp-code-css')) $('ccp-code-css').textContent = cssText;
  if ($('ccp-code-html')) $('ccp-code-html').textContent = htmlText;
}

function syncSliderLabels() {
  function set(id, v, suffix) { var el = $(id); if (el) el.textContent = v + (suffix || '%'); }
  set('ccp-circle-radius-val', state.circle.radius);
  set('ccp-circle-cx-val', state.circle.cx);
  set('ccp-circle-cy-val', state.circle.cy);
  set('ccp-ellipse-rx-val', state.ellipse.rx);
  set('ccp-ellipse-ry-val', state.ellipse.ry);
  set('ccp-ellipse-cx-val', state.ellipse.cx);
  set('ccp-ellipse-cy-val', state.ellipse.cy);
  set('ccp-inset-top-val', state.inset.top);
  set('ccp-inset-right-val', state.inset.right);
  set('ccp-inset-bottom-val', state.inset.bottom);
  set('ccp-inset-left-val', state.inset.left);
  set('ccp-inset-round-val', state.inset.round);
}

function syncSliderValues() {
  var pairs = [
    ['ccp-circle-radius', state.circle.radius], ['ccp-circle-cx', state.circle.cx], ['ccp-circle-cy', state.circle.cy],
    ['ccp-ellipse-rx', state.ellipse.rx], ['ccp-ellipse-ry', state.ellipse.ry], ['ccp-ellipse-cx', state.ellipse.cx], ['ccp-ellipse-cy', state.ellipse.cy],
    ['ccp-inset-top', state.inset.top], ['ccp-inset-right', state.inset.right], ['ccp-inset-bottom', state.inset.bottom], ['ccp-inset-left', state.inset.left],
    ['ccp-inset-round', state.inset.round]
  ];
  pairs.forEach(function (p) { var el = $(p[0]); if (el) el.value = p[1]; });
}

function render() {
  renderCanvas();
  renderPointsList();
  syncSliderValues();
  syncSliderLabels();
  renderOutput();
  var tabs = ['polygon', 'circle', 'ellipse', 'inset'];
  tabs.forEach(function (t) {
    var panel = $('ccp-panel-' + t);
    if (panel) panel.style.display = state.tab === t ? 'block' : 'none';
    var btn = $('ccp-tab-' + t);
    if (btn) btn.classList.toggle('active', state.tab === t);
  });
  var svgWrap = $('ccp-svg-wrap');
  if (svgWrap) svgWrap.style.display = state.tab === 'polygon' ? 'block' : 'none';
}

function readSlider(id, fallback) {
  var el = $(id);
  if (!el) return fallback;
  var v = parseFloat(el.value);
  return isNaN(v) ? fallback : v;
}

function bindRange(id, apply) {
  var el = $(id);
  if (!el) return;
  el.addEventListener('input', function () { apply(readSlider(id, 0)); render(); });
}

function setTab(t) {
  state.tab = t;
  showError('');
  render();
}

function applyPreset(name) {
  try {
    state.points = generatePreset(name);
    state.tab = 'polygon';
    showError('');
    render();
    toast('已载入预设「' + PRESET_LABELS[name] + '」，可拖拽顶点或改坐标继续编辑');
  } catch (e) { showError(e.message); }
}

function loadExample() {
  applyPreset('star');
  toast('已载入示例：五角星预设，无需上传即可演示编辑→预览→导出全流程');
}

function onBgFile(file) {
  if (!file) return;
  if (file.type.indexOf('image/') !== 0) { showError('背景图须为图片文件（image/*）'); return; }
  if (file.size > 5 * 1024 * 1024) { showError('背景图须 ≤ 5MB'); return; }
  var reader = new FileReader();
  reader.onload = function () {
    bgDataUrl = reader.result;
    var preview = $('ccp-preview');
    if (preview) {
      preview.style.backgroundImage = 'url("' + bgDataUrl + '")';
      preview.style.backgroundSize = 'cover';
      preview.style.backgroundPosition = 'center';
    }
    showError('');
    toast('背景图已在本地载入，未上传');
  };
  reader.onerror = function () { showError('背景图读取失败，请重试'); };
  reader.readAsDataURL(file);
}

document.addEventListener('DOMContentLoaded', function () {
  PRESET_NAMES.forEach(function (name) {
    var btn = $('ccp-preset-' + name);
    if (btn) btn.addEventListener('click', function () { applyPreset(name); });
  });
  ['polygon', 'circle', 'ellipse', 'inset'].forEach(function (t) {
    var btn = $('ccp-tab-' + t);
    if (btn) btn.addEventListener('click', function () { setTab(t); });
  });
  bindRange('ccp-circle-radius', function (v) { state.circle.radius = v; });
  bindRange('ccp-circle-cx', function (v) { state.circle.cx = v; });
  bindRange('ccp-circle-cy', function (v) { state.circle.cy = v; });
  bindRange('ccp-ellipse-rx', function (v) { state.ellipse.rx = v; });
  bindRange('ccp-ellipse-ry', function (v) { state.ellipse.ry = v; });
  bindRange('ccp-ellipse-cx', function (v) { state.ellipse.cx = v; });
  bindRange('ccp-ellipse-cy', function (v) { state.ellipse.cy = v; });
  bindRange('ccp-inset-top', function (v) { state.inset.top = v; });
  bindRange('ccp-inset-right', function (v) { state.inset.right = v; });
  bindRange('ccp-inset-bottom', function (v) { state.inset.bottom = v; });
  bindRange('ccp-inset-left', function (v) { state.inset.left = v; });
  bindRange('ccp-inset-round', function (v) { state.inset.round = v; });
  var roundCheck = $('ccp-inset-round-enabled');
  if (roundCheck) roundCheck.addEventListener('change', function () {
    state.inset.roundEnabled = roundCheck.checked;
    var slider = $('ccp-inset-round');
    if (slider) slider.disabled = !roundCheck.checked;
    render();
  });
  var addBtn = $('ccp-add-point');
  if (addBtn) addBtn.addEventListener('click', function () {
    try {
      var first = state.points[0];
      var last = state.points[state.points.length - 1];
      var mx = Math.round(((first.x + last.x) / 2) * 100) / 100;
      var my = Math.round(((first.y + last.y) / 2) * 100) / 100;
      state.points = addPoint(state.points, mx, my);
      showError('');
      render();
    } catch (e) { showError(e.message); }
  });
  var bgInput = $('ccp-bg-file');
  if (bgInput) bgInput.addEventListener('change', function () { onBgFile(bgInput.files[0]); });
  var bgClear = $('ccp-bg-clear');
  if (bgClear) bgClear.addEventListener('click', function () {
    bgDataUrl = '';
    var preview = $('ccp-preview');
    if (preview) {
      preview.style.backgroundImage = '';
      preview.style.backgroundSize = '';
      preview.style.backgroundPosition = '';
    }
    if (bgInput) bgInput.value = '';
    toast('已清除本地背景图');
  });
  var copyCss = $('ccp-copy-css');
  if (copyCss) copyCss.addEventListener('click', function () { copyText($('ccp-code-css').textContent, '已复制 CSS'); });
  var copyHtml = $('ccp-copy-html');
  if (copyHtml) copyHtml.addEventListener('click', function () { copyText($('ccp-code-html').textContent, '已复制 HTML'); });
  var dlCss = $('ccp-download-css');
  if (dlCss) dlCss.addEventListener('click', function () { downloadFile(suggestExportName('css'), $('ccp-code-css').textContent, 'text/css;charset=utf-8'); });
  var dlHtml = $('ccp-download-html');
  if (dlHtml) dlHtml.addEventListener('click', function () { downloadFile(suggestExportName('html'), $('ccp-code-html').textContent, 'text/html;charset=utf-8'); });
  var example = $('ccp-load-example');
  if (example) example.addEventListener('click', loadExample);
  var reset = $('ccp-reset');
  if (reset) reset.addEventListener('click', function () {
    state = defaultState();
    bgDataUrl = '';
    var preview = $('ccp-preview');
    if (preview) {
      preview.style.backgroundImage = '';
      preview.style.backgroundSize = '';
      preview.style.backgroundPosition = '';
    }
    if (bgInput) bgInput.value = '';
    if (roundCheck) roundCheck.checked = false;
    var slider = $('ccp-inset-round');
    if (slider) slider.disabled = true;
    render();
    toast('已重置为默认参数');
  });
  render();
});
})();
