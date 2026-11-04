/* 网页涂鸦画板（doodle_board）- 纯前端本地绘制
 * 几何/颜色/历史/文档/文件名清洗全部为确定性纯函数。
 * 失败约定：非法参数抛 Error，err.field 给出字段名，不静默钳制
 * （clampBrushSize 除外：它就是钳制函数本身）、不静默取整、不静默截断。
 * 纯函数经 module.exports 暴露供 node 测试；浏览器里挂 window.DoodleBoard。
 * canvas 渲染仅浏览器端，测试只覆盖纯函数。
 * 零网络请求：本文件不发起任何 fetch / XHR。 */
(function () {
'use strict';

/* 带字段名的失败。 */
function fail(field, message) {
  var e = new Error(message);
  e.field = field;
  throw e;
}

/* 点校验：{x, y} 均为有限数字。 */
function checkPoint(p, field) {
  field = field || 'point';
  if (!p || typeof p !== 'object' ||
      typeof p.x !== 'number' || !isFinite(p.x) ||
      typeof p.y !== 'number' || !isFinite(p.y)) {
    fail(field, '点须为 {x, y} 且坐标为有限数字');
  }
  return p;
}

var COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/* 十六进制颜色 → {r, g, b}：只认 #RGB / #RRGGBB，大小写不限。
 * 非法抛错，err.field='color'。 */
function hexToRgb(hex) {
  if (typeof hex !== 'string') fail('color', '颜色须为字符串');
  var t = hex.trim();
  if (!COLOR_RE.test(t)) fail('color', '颜色只认 #RGB 或 #RRGGBB 十六进制：' + hex);
  var h = t.slice(1).toLowerCase();
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16)
  };
}

/* 两点 → 归一化矩形 {x, y, w, h}：任意拖拽方向都归一为左上+正宽高。 */
function rectFromPoints(p1, p2) {
  checkPoint(p1);
  checkPoint(p2);
  return {
    x: Math.min(p1.x, p2.x),
    y: Math.min(p1.y, p2.y),
    w: Math.abs(p2.x - p1.x),
    h: Math.abs(p2.y - p1.y)
  };
}

/* 圆心 c 与圆上一点 p → 半径（欧氏距离）。
 * 任一坐标非数字抛错，err.field='point'。 */
function radiusFrom(c, p) {
  checkPoint(c);
  checkPoint(p);
  return Math.hypot(p.x - c.x, p.y - c.y);
}

/* 2 位小数去尾零。 */
function round2(v) {
  return Math.round(Number(v) * 100) / 100;
}

/* 箭头几何：tail 起点、head 箭头顶点；返回双翼坐标 {wing1, wing2}（2 位小数）。
 * headLen≤0 抛错 err.field='headLen'；headAngle∉(0,π/2) 抛错 err.field='headAngle'。 */
function arrowGeometry(tail, head, headLen, headAngle) {
  checkPoint(tail);
  checkPoint(head);
  if (typeof headLen !== 'number' || !isFinite(headLen) || headLen <= 0) {
    fail('headLen', '箭头头部长度须为大于 0 的数字');
  }
  if (typeof headAngle !== 'number' || !isFinite(headAngle) ||
      headAngle <= 0 || headAngle >= Math.PI / 2) {
    fail('headAngle', '箭头夹角须在 (0, π/2) 区间内');
  }
  var a = Math.atan2(head.y - tail.y, head.x - tail.x);
  return {
    wing1: {
      x: round2(head.x - headLen * Math.cos(a - headAngle)),
      y: round2(head.y - headLen * Math.sin(a - headAngle))
    },
    wing2: {
      x: round2(head.x - headLen * Math.cos(a + headAngle)),
      y: round2(head.y - headLen * Math.sin(a + headAngle))
    }
  };
}

/* 画笔粗细钳制到 1–100；非数字（NaN/Infinity/非 number 类型）抛错 err.field='size'。 */
function clampBrushSize(v) {
  if (typeof v !== 'number' || !isFinite(v)) {
    fail('size', '画笔粗细须为有限数字');
  }
  if (v < 1) return 1;
  if (v > 100) return 100;
  return v;
}

/* 历史栈压入：返回新数组（不改原数组）；超 maxLen 从头部截断。
 * snapshot 须为对象（数组亦可），否则 err.field='snapshot'；
 * maxLen 须为正整数，否则 err.field='maxLen'。 */
function pushHistory(history, snapshot, maxLen) {
  if (!Array.isArray(history)) fail('history', '历史栈须为数组');
  if (snapshot === null || typeof snapshot !== 'object') {
    fail('snapshot', '快照须为对象');
  }
  if (typeof maxLen !== 'number' || !isFinite(maxLen) ||
      Math.floor(maxLen) !== maxLen || maxLen <= 0) {
    fail('maxLen', 'maxLen 须为正整数');
  }
  var next = history.concat([snapshot]);
  if (next.length > maxLen) next = next.slice(next.length - maxLen);
  return next;
}

/* 作品文档结构：{v:1, savedAt, bg:'light'|'dark', bgImage:dataURL|null, items:[...]} */
function checkDoc(doc) {
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    fail('doc', '文档须为对象');
  }
  if (doc.v !== 1) fail('doc', '文档版本须为 1');
  if (typeof doc.savedAt !== 'string' || doc.savedAt.length === 0) {
    fail('doc', 'savedAt 须为非空字符串');
  }
  if (doc.bg !== 'light' && doc.bg !== 'dark') {
    fail('doc', "bg 只认 'light' / 'dark'");
  }
  if (doc.bgImage !== null &&
      (typeof doc.bgImage !== 'string' || doc.bgImage.indexOf('data:image/') !== 0)) {
    fail('doc', 'bgImage 须为 null 或图片 dataURL');
  }
  if (!Array.isArray(doc.items)) fail('doc', 'items 须为数组');
  return doc;
}

/* 作品文档 → JSON 字符串；非法文档抛错 err.field='doc'。 */
function serializeDoc(doc) {
  checkDoc(doc);
  return JSON.stringify(doc);
}

/* JSON 字符串 → 作品文档；非法 JSON 或结构非法抛错 err.field='doc'。 */
function parseDoc(json) {
  var doc;
  try {
    doc = JSON.parse(json);
  } catch (e) {
    fail('doc', '非法 JSON 文档：' + e.message);
  }
  checkDoc(doc);
  return doc;
}

/* 文件名清洗：去 Windows 非法字符与控制字符，首尾空白/点清掉，
 * 空白折成 '-'，超长截 60，空结果回退 'doodle-board'。 */
function sanitizeFileName(text) {
  var s = text == null ? '' : String(text);
  s = s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '');
  s = s.replace(/^[\s.]+|[\s.]+$/g, '').replace(/\s+/g, '-');
  if (s.length > 60) s = s.slice(0, 60).replace(/-+$/, '');
  if (s.length === 0) return 'doodle-board';
  return s;
}

var API = {
  hexToRgb: hexToRgb,
  rectFromPoints: rectFromPoints,
  radiusFrom: radiusFrom,
  arrowGeometry: arrowGeometry,
  clampBrushSize: clampBrushSize,
  pushHistory: pushHistory,
  serializeDoc: serializeDoc,
  parseDoc: parseDoc,
  sanitizeFileName: sanitizeFileName
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = API;
  return;
}
if (typeof window !== 'undefined') window.DoodleBoard = API;

/* ---------------- 浏览器 DOM 逻辑（canvas 渲染仅浏览器端） ---------------- */
function $(id) { return document.getElementById(id); }

var D = window.DoodleBoard;
var BG_COLORS = { light: '#ffffff', dark: '#1f2937' };
var HISTORY_LIMIT = 20;
var DRAFT_KEY = 'doodle_board_draft_v1';
var CANVAS_H = 520;

var canvas = $('db-canvas');
var ctx = canvas ? canvas.getContext('2d') : null;
var DPR = Math.min(2, window.devicePixelRatio || 1);
var bgImgEl = new Image();

var state = {
  tool: 'brush',
  color: '#111111',
  size: 8,
  fillMode: 'stroke',
  textSize: 28,
  textColor: '#111111',
  bg: 'light',
  bgImage: null,
  items: [],
  undo: [],
  redo: [],
  drawing: false,
  dragStart: null,
  curStroke: null,
  preview: null,
  lastPt: null
};

function showMsg(t) {
  var el = $('db-msg');
  if (el) el.textContent = t || '';
}
function toast(t) {
  var el = $('db-toast');
  if (!el) return;
  el.textContent = t;
  el.style.display = 'block';
  setTimeout(function () { el.style.display = 'none'; }, 2400);
}
function copyItems(items) {
  return JSON.parse(JSON.stringify(items));
}
function rgba(hex, alpha) {
  var c = D.hexToRgb(hex);
  return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + alpha + ')';
}

/* 画布尺寸：CSS 宽度自适应容器，高度固定；backing store 按 DPR 放大。 */
function fitCanvas() {
  if (!canvas) return;
  var w = canvas.clientWidth || canvas.parentElement.clientWidth || 800;
  canvas.width = Math.max(1, Math.round(w * DPR));
  canvas.height = Math.round(CANVAS_H * DPR);
  canvas.style.height = CANVAS_H + 'px';
  render();
}

function cssSize() {
  return { w: canvas.width / DPR, h: canvas.height / DPR };
}

function drawItem(g, item, isPreview) {
  var i, p;
  g.save();
  if (isPreview) g.globalAlpha = 0.75;
  if (item.type === 'path') {
    if (item.eraser) {
      g.globalCompositeOperation = 'destination-out';
      g.strokeStyle = '#000000';
    } else {
      g.strokeStyle = item.color;
    }
    g.lineWidth = item.size;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    for (i = 0; i < item.points.length; i++) {
      p = item.points[i];
      if (i === 0) g.moveTo(p.x, p.y);
      else g.lineTo(p.x, p.y);
    }
    if (item.points.length === 1) {
      p = item.points[0];
      g.moveTo(p.x, p.y);
      g.lineTo(p.x + 0.01, p.y + 0.01);
    }
    g.stroke();
  } else if (item.type === 'line') {
    g.strokeStyle = item.color;
    g.lineWidth = item.size;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(item.x1, item.y1);
    g.lineTo(item.x2, item.y2);
    g.stroke();
  } else if (item.type === 'rect') {
    if (item.fill) {
      g.fillStyle = item.color;
      g.fillRect(item.x, item.y, item.w, item.h);
    } else {
      g.strokeStyle = item.color;
      g.lineWidth = item.size;
      g.strokeRect(item.x, item.y, item.w, item.h);
    }
  } else if (item.type === 'circle') {
    g.beginPath();
    g.arc(item.cx, item.cy, Math.max(0.01, item.r), 0, Math.PI * 2);
    if (item.fill) {
      g.fillStyle = item.color;
      g.fill();
    } else {
      g.strokeStyle = item.color;
      g.lineWidth = item.size;
      g.stroke();
    }
  } else if (item.type === 'arrow') {
    g.strokeStyle = item.color;
    g.fillStyle = item.color;
    g.lineWidth = item.size;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(item.x1, item.y1);
    g.lineTo(item.x2, item.y2);
    g.stroke();
    try {
      var geo = D.arrowGeometry(
        { x: item.x1, y: item.y1 }, { x: item.x2, y: item.y2 },
        item.headLen, item.headAngle);
      g.beginPath();
      g.moveTo(item.x2, item.y2);
      g.lineTo(geo.wing1.x, geo.wing1.y);
      g.moveTo(item.x2, item.y2);
      g.lineTo(geo.wing2.x, geo.wing2.y);
      g.stroke();
    } catch (e) { /* 几何非法时只画杆 */ }
  } else if (item.type === 'text') {
    g.fillStyle = item.color;
    g.font = item.fontSize + 'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
    g.textBaseline = 'top';
    g.fillText(item.text, item.x, item.y);
  }
  g.restore();
}

/* 在给定 ctx 上按 CSS 像素合成整幅（含底色、底图、全部笔触）。 */
function drawComposed(g, w, h) {
  var i;
  g.clearRect(0, 0, w, h);
  g.fillStyle = BG_COLORS[state.bg];
  g.fillRect(0, 0, w, h);
  if (state.bgImage && bgImgEl.complete && bgImgEl.naturalWidth) {
    var iw = bgImgEl.naturalWidth, ih = bgImgEl.naturalHeight;
    var s = Math.min(w / iw, h / ih);
    var dw = iw * s, dh = ih * s;
    g.drawImage(bgImgEl, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }
  for (i = 0; i < state.items.length; i++) drawItem(g, state.items[i], false);
  if (state.preview) drawItem(g, state.preview, true);
}

function render() {
  if (!canvas) return;
  var s = cssSize();
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawComposed(ctx, s.w, s.h);
}

function loadBgImage(cb) {
  cb = cb || function () {};
  if (!state.bgImage) {
    bgImgEl.removeAttribute('src');
    cb();
    return;
  }
  if (bgImgEl.src === state.bgImage && bgImgEl.complete && bgImgEl.naturalWidth) {
    cb();
    return;
  }
  bgImgEl.onload = function () { cb(); };
  bgImgEl.onerror = function () { toast('底图加载失败'); cb(); };
  bgImgEl.src = state.bgImage;
}

function updateUndoRedo() {
  var u = $('db-undo'), r = $('db-redo');
  if (u) { u.disabled = state.undo.length === 0; u.textContent = '↩ 撤销(' + state.undo.length + ')'; }
  if (r) { r.disabled = state.redo.length === 0; r.textContent = '↪ 重做(' + state.redo.length + ')'; }
}

function pushUndo() {
  state.undo = D.pushHistory(state.undo, copyItems(state.items), HISTORY_LIMIT);
  state.redo = [];
}

function commitItem(item) {
  pushUndo();
  state.items.push(item);
  state.preview = null;
  render();
  updateUndoRedo();
}

function undo() {
  if (state.undo.length === 0) { toast('没有可撤销的步骤'); return; }
  state.redo = D.pushHistory(state.redo, copyItems(state.items), HISTORY_LIMIT);
  state.items = state.undo.pop();
  render();
  updateUndoRedo();
}

function redo() {
  if (state.redo.length === 0) { toast('没有可重做的步骤'); return; }
  state.undo = D.pushHistory(state.undo, copyItems(state.items), HISTORY_LIMIT);
  state.items = state.redo.pop();
  render();
  updateUndoRedo();
}

function clearBoard() {
  if (state.items.length === 0) { toast('画布已经是空的'); return; }
  pushUndo();
  state.items = [];
  render();
  updateUndoRedo();
  toast('已清屏（可撤销）');
}

/* 坐标：client → canvas CSS 像素。 */
function toCanvas(e) {
  var r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function shapeItem(tool, p1, p2) {
  var base = { color: state.color, size: state.size };
  if (tool === 'line') {
    return { type: 'line', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
      color: base.color, size: base.size };
  }
  if (tool === 'rect') {
    var rc = D.rectFromPoints(p1, p2);
    return { type: 'rect', x: rc.x, y: rc.y, w: rc.w, h: rc.h,
      color: base.color, size: base.size, fill: state.fillMode === 'fill' };
  }
  if (tool === 'circle') {
    return { type: 'circle', cx: p1.x, cy: p1.y, r: D.radiusFrom(p1, p2),
      color: base.color, size: base.size, fill: state.fillMode === 'fill' };
  }
  if (tool === 'arrow') {
    return { type: 'arrow', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
      color: base.color, size: base.size,
      headLen: Math.max(12, base.size * 3), headAngle: Math.PI / 6 };
  }
  return null;
}

function drawLiveSegment(p1, p2, eraser) {
  var s = cssSize();
  ctx.save();
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (eraser) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = '#000000';
  } else {
    ctx.strokeStyle = state.color;
  }
  ctx.lineWidth = state.size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x === p1.x && p2.y === p1.y ? p1.x + 0.01 : p2.x,
             p2.x === p1.x && p2.y === p1.y ? p1.y + 0.01 : p2.y);
  ctx.stroke();
  ctx.restore();
}

/* 文字工具：画布点击处弹出行内输入框，回车/失焦提交。 */
function openTextEditor(pt) {
  closeTextEditor(true);
  var stage = $('db-stage');
  if (!stage) return;
  var box = document.createElement('div');
  box.id = 'db-textedit';
  box.style.left = Math.max(0, Math.min(pt.x, cssSize().w - 40)) + 'px';
  box.style.top = Math.max(0, pt.y) + 'px';
  var input = document.createElement('input');
  input.type = 'text';
  input.placeholder = '输入文字，回车确定';
  input.maxLength = 60;
  input.style.fontSize = state.textSize + 'px';
  input.style.color = state.textColor;
  box.appendChild(input);
  stage.appendChild(box);
  input.focus();
  var done = false;
  function finish(commit) {
    if (done) return;
    done = true;
    var v = input.value;
    box.remove();
    if (commit && v.trim()) {
      commitItem({
        type: 'text', x: pt.x, y: pt.y, text: v,
        color: state.textColor, fontSize: state.textSize
      });
    }
  }
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') finish(true);
    else if (e.key === 'Escape') finish(false);
    e.stopPropagation();
  });
  input.addEventListener('blur', function () { finish(true); });
}
function closeTextEditor(commit) {
  var box = $('db-textedit');
  if (box) box.remove();
}

function onPointerDown(e) {
  if (!canvas || e.button === 2) return;
  e.preventDefault();
  var pt = toCanvas(e);
  canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
  if (state.tool === 'text') {
    openTextEditor(pt);
    return;
  }
  state.drawing = true;
  state.dragStart = pt;
  state.lastPt = pt;
  if (state.tool === 'brush' || state.tool === 'eraser') {
    state.curStroke = [pt];
    drawLiveSegment(pt, pt, state.tool === 'eraser');
  }
}

function onPointerMove(e) {
  if (!state.drawing) return;
  e.preventDefault();
  var pt = toCanvas(e);
  if (state.tool === 'brush' || state.tool === 'eraser') {
    state.curStroke.push(pt);
    drawLiveSegment(state.lastPt, pt, state.tool === 'eraser');
    state.lastPt = pt;
  } else {
    state.preview = shapeItem(state.tool, state.dragStart, pt);
    render();
  }
}

function onPointerUp(e) {
  if (!state.drawing) return;
  e.preventDefault();
  var pt = toCanvas(e);
  state.drawing = false;
  if (state.tool === 'brush' || state.tool === 'eraser') {
    state.curStroke.push(pt);
    commitItem({
      type: 'path',
      points: state.curStroke,
      color: state.color,
      size: state.size,
      eraser: state.tool === 'eraser'
    });
    state.curStroke = null;
  } else {
    var item = shapeItem(state.tool, state.dragStart, pt);
    state.preview = null;
    if (item) commitItem(item);
    else render();
  }
  state.dragStart = null;
  state.lastPt = null;
}

/* 底图导入：缩放适配画布后存为 dataURL（控制 localStorage 体积）。 */
function importFile(file) {
  if (!file) return;
  if (!/^image\//.test(file.type || '')) { toast('请选择图片文件'); return; }
  var rd = new FileReader();
  rd.onload = function () {
    var img = new Image();
    img.onload = function () {
      var s = cssSize();
      var k = Math.min(1, s.w / img.width, s.h / img.height);
      var c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * k));
      c.height = Math.max(1, Math.round(img.height * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      state.bgImage = c.toDataURL('image/png');
      loadBgImage(function () {
        render();
        toast('底图已导入并适配画布，可直接画标注');
      });
    };
    img.onerror = function () { toast('图片读取失败，请换一张再试'); };
    img.src = rd.result;
  };
  rd.onerror = function () { toast('文件读取失败'); };
  rd.readAsDataURL(file);
}

function downloadBlob(blob, filename) {
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(function () {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
}

/* scale 倍率离屏合成 → Blob。 */
function renderBlob(scale, cb) {
  var s = cssSize();
  var c = document.createElement('canvas');
  c.width = Math.round(s.w * scale);
  c.height = Math.round(s.h * scale);
  var g = c.getContext('2d');
  g.scale(scale, scale);
  drawComposed(g, s.w, s.h);
  if (c.toBlob) c.toBlob(cb, 'image/png');
  else cb(null);
}

function exportPng(scale) {
  renderBlob(scale, function (blob) {
    if (!blob) { toast('PNG 生成失败，请换个浏览器再试'); return; }
    var name = D.sanitizeFileName($('db-title') ? $('db-title').value : '') + '-' + scale + 'x.png';
    downloadBlob(blob, name);
    toast('已导出 ' + name);
  });
}

function copyPng() {
  if (!(navigator.clipboard && window.ClipboardItem)) {
    toast('当前浏览器不支持复制 PNG，请改用下载');
    return;
  }
  renderBlob(2, function (blob) {
    if (!blob) { toast('PNG 生成失败，请换个浏览器再试'); return; }
    navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]).then(
      function () { toast('PNG 已复制到剪贴板'); },
      function () { toast('复制被拒绝，请改用下载'); }
    );
  });
}

/* 本地作品暂存：最近一张存 localStorage，零上传。 */
function saveDraft() {
  var doc = {
    v: 1,
    savedAt: new Date().toISOString(),
    bg: state.bg,
    bgImage: state.bgImage,
    items: state.items
  };
  var s;
  try {
    s = D.serializeDoc(doc);
  } catch (e) {
    toast('暂存失败：' + e.message);
    return;
  }
  try {
    localStorage.setItem(DRAFT_KEY, s);
    toast('已暂存到浏览器本地（localStorage，零上传）');
  } catch (e) {
    toast('暂存失败：本地存储空间不足（约 5MB 配额），可先导出 PNG 再清屏');
  }
}

function restoreDraft() {
  var s = null;
  try { s = localStorage.getItem(DRAFT_KEY); } catch (e) { /* 忽略 */ }
  if (!s) { toast('没有暂存的作品'); return; }
  var doc;
  try {
    doc = D.parseDoc(s);
  } catch (e) {
    toast('暂存数据已损坏：' + e.message);
    return;
  }
  pushUndo();
  state.bg = doc.bg;
  state.bgImage = doc.bgImage;
  state.items = doc.items;
  loadBgImage(function () {
    render();
    syncBgButtons();
    updateUndoRedo();
    var when = String(doc.savedAt).slice(0, 19).replace('T', ' ');
    toast('已恢复暂存作品（' + when + '）');
  });
}

function setTool(name) {
  state.tool = name;
  closeTextEditor(false);
  var btns = document.querySelectorAll('.db-tool');
  for (var i = 0; i < btns.length; i++) {
    if (btns[i].getAttribute('data-tool') === name) btns[i].classList.add('active');
    else btns[i].classList.remove('active');
  }
  var fillRow = $('db-fill-row');
  if (fillRow) fillRow.style.display = (name === 'rect' || name === 'circle') ? '' : 'none';
  if (canvas) canvas.style.cursor = name === 'text' ? 'text' : 'crosshair';
}

function syncBgButtons() {
  var l = $('db-bg-light'), d = $('db-bg-dark');
  if (l) l.classList.toggle('active', state.bg === 'light');
  if (d) d.classList.toggle('active', state.bg === 'dark');
}

/* 事件绑定 */
(function bind() {
  if (!canvas) return;
  var btns = document.querySelectorAll('.db-tool');
  for (var i = 0; i < btns.length; i++) {
    (function (b) {
      b.addEventListener('click', function () { setTool(b.getAttribute('data-tool')); });
    })(btns[i]);
  }

  var color = $('db-color');
  if (color) color.addEventListener('input', function () {
    try {
      state.color = D.hexToRgb(color.value).r !== undefined ? color.value : state.color;
    } catch (e) { /* color input 恒合法 */ }
  });
  var size = $('db-size'), sizeVal = $('db-size-val');
  if (size) size.addEventListener('input', function () {
    state.size = D.clampBrushSize(Number(size.value));
    if (sizeVal) sizeVal.textContent = state.size;
  });

  var fills = document.querySelectorAll('input[name="db-fill"]');
  for (var i = 0; i < fills.length; i++) {
    fills[i].addEventListener('change', function () {
      var c = document.querySelector('input[name="db-fill"]:checked');
      state.fillMode = c ? c.value : 'stroke';
    });
  }

  var tc = $('db-text-color');
  if (tc) tc.addEventListener('input', function () { state.textColor = tc.value; });
  var ts = $('db-text-size');
  if (ts) ts.addEventListener('change', function () {
    var v = Math.round(Number(ts.value));
    if (!isFinite(v) || v < 8) v = 8;
    if (v > 120) v = 120;
    state.textSize = v;
    ts.value = v;
  });

  var bl = $('db-bg-light'), bd = $('db-bg-dark');
  if (bl) bl.addEventListener('click', function () { state.bg = 'light'; syncBgButtons(); render(); });
  if (bd) bd.addEventListener('click', function () { state.bg = 'dark'; syncBgButtons(); render(); });

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', function () {
    state.drawing = false;
    state.preview = null;
    state.curStroke = null;
    render();
  });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  /* 拖拽导入底图 */
  var stage = $('db-stage');
  if (stage) {
    ['dragenter', 'dragover'].forEach(function (ev) {
      stage.addEventListener(ev, function (e) {
        e.preventDefault();
        stage.classList.add('db-dragover');
      });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      stage.addEventListener(ev, function (e) {
        e.preventDefault();
        stage.classList.remove('db-dragover');
      });
    });
    stage.addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      importFile(f);
    });
  }
  var file = $('db-file');
  if (file) file.addEventListener('change', function () {
    importFile(file.files && file.files[0]);
    file.value = '';
  });
  var clearBg = $('db-clear-bg');
  if (clearBg) clearBg.addEventListener('click', function () {
    state.bgImage = null;
    loadBgImage(render);
    toast('已移除底图');
  });

  var u = $('db-undo'), r = $('db-redo'), cl = $('db-clear');
  if (u) u.addEventListener('click', undo);
  if (r) r.addEventListener('click', redo);
  if (cl) cl.addEventListener('click', clearBoard);

  var sv = $('db-save-draft'), rs = $('db-restore-draft');
  if (sv) sv.addEventListener('click', saveDraft);
  if (rs) rs.addEventListener('click', restoreDraft);

  var dl1 = $('db-dl-1x'), dl2 = $('db-dl-2x'), cp = $('db-copy-png');
  if (dl1) dl1.addEventListener('click', function () { exportPng(1); });
  if (dl2) dl2.addEventListener('click', function () { exportPng(2); });
  if (cp) cp.addEventListener('click', copyPng);

  document.addEventListener('keydown', function (e) {
    var tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if ((e.ctrlKey || e.metaKey) &&
               (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
      e.preventDefault();
      redo();
    }
  });

  window.addEventListener('resize', fitCanvas);

  setTool('brush');
  syncBgButtons();
  fitCanvas();
  updateUndoRedo();
})();

})();
