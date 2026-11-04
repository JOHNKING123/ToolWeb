/* 复古文字特效生成器（retro_text_fx）- 纯前端本地计算
 * 8 种 90s 复古预设的纯数据定义、绘制计划（draw plan）构建、
 * 字号自适应、文件名清洗，全部为确定性纯函数。
 * 失败约定：非法参数抛 Error，err.field 给出字段名，不静默钳制、
 * 不静默取整、不静默截断。
 * 纯函数经 module.exports 暴露供 node 测试；浏览器里挂 window.RetroTextFx。
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
function checkInt(v, field, label, min, max) {
  checkNum(v, field, label, min, max);
  if (Math.round(v) !== v) {
    fail(field, label + '须为整数');
  }
  return v;
}
/* 2 位小数去尾零。 */
function round2(v) {
  return Math.round(Number(v) * 100) / 100;
}

var COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/* 十六进制颜色：只认 #RGB / #RRGGBB，大小写不限，统一输出小写 #RRGGBB。 */
function parseHexColor(s) {
  if (typeof s !== 'string') fail('color', '颜色须为字符串');
  var t = s.trim();
  if (!COLOR_RE.test(t)) fail('color', '颜色只认 #RGB 或 #RRGGBB 十六进制：' + s);
  var hex = t.slice(1).toLowerCase();
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  return '#' + hex;
}
function hexToRgb(hex) {
  var n = parseHexColor(hex);
  return [
    parseInt(n.slice(1, 3), 16),
    parseInt(n.slice(3, 5), 16),
    parseInt(n.slice(5, 7), 16)
  ];
}
function toHex2(n) {
  var s = n.toString(16);
  return s.length === 1 ? '0' + s : s;
}
/* 两色线性插值：t=0 取 c1，t=1 取 c2，通道四舍五入，输出小写 #RRGGBB。 */
function lerpColor(c1, c2, t) {
  var a = hexToRgb(c1);
  var b = hexToRgb(c2);
  if (typeof t !== 'number' || !isFinite(t) || t < 0 || t > 1) {
    fail('t', '插值系数须为 0–1 的数字');
  }
  return '#' +
    toHex2(Math.round(a[0] + (b[0] - a[0]) * t)) +
    toHex2(Math.round(a[1] + (b[1] - a[1]) * t)) +
    toHex2(Math.round(a[2] + (b[2] - a[2]) * t));
}

/* ---------------- 8 预设纯数据 ----------------
 * fill: {kind:'solid',color} | {kind:'gradient',angle,stops} | null（无主填充）
 *   渐变角度语义：0°=左→右，90°=上→下。
 * stroke: {width:0–50, color}
 * shadow: {kind:'none'|'offset'|'long'|'extrude', distance:0–80, angle:0–360,
 *          blur:0–50, color, alpha:0–1, from, to（extrude 起止色）}
 * glow: {strength:0–100, color, blur:0–60}
 * overlay: null | {color, alpha}（source-atop 整图罩染）
 * layers: null | [{color, dx, dy, alpha}]（错位叠印层）
 */
var PRESETS = [
  {
    name: 'rainbow', label: '彩虹渐变', description: '90s  poster 经典：横向六色彩虹渐变＋粗黑描边＋硬投影',
    suggestBg: '#ffffff',
    fill: { kind: 'gradient', angle: 0, stops: [
      { offset: 0, color: '#ff2d55' }, { offset: 0.2, color: '#ff9500' },
      { offset: 0.4, color: '#ffcc00' }, { offset: 0.6, color: '#34c759' },
      { offset: 0.8, color: '#0a84ff' }, { offset: 1, color: '#bf5af2' }
    ] },
    stroke: { width: 4, color: '#1c1c1e' },
    shadow: { kind: 'offset', distance: 6, angle: 45, blur: 0, color: '#1c1c1e', alpha: 0.9 },
    glow: { strength: 0, color: '#ffffff', blur: 20 },
    overlay: null, layers: null
  },
  {
    name: 'outline', label: '粗描边', description: '白字＋超粗黑描边，街头海报式描边字',
    suggestBg: '#ffde59',
    fill: { kind: 'solid', color: '#ffffff' },
    stroke: { width: 14, color: '#111111' },
    shadow: { kind: 'none', distance: 0, angle: 45, blur: 0, color: '#000000', alpha: 0 },
    glow: { strength: 0, color: '#ffffff', blur: 20 },
    overlay: null, layers: null
  },
  {
    name: 'longshadow', label: '长阴影', description: '扁平风长投影：40 层 1px 步进斜向拖影',
    suggestBg: '#ffffff',
    fill: { kind: 'solid', color: '#ffffff' },
    stroke: { width: 0, color: '#111111' },
    shadow: { kind: 'long', distance: 40, angle: 45, blur: 0, color: '#e0245e', alpha: 1 },
    glow: { strength: 0, color: '#ffffff', blur: 20 },
    overlay: null, layers: null
  },
  {
    name: '3d', label: '3D 立体', description: '挤出式立体字：12 层斜向挤出由浅入深',
    suggestBg: '#0a84ff',
    fill: { kind: 'solid', color: '#ffd60a' },
    stroke: { width: 2, color: '#1c1c1e' },
    shadow: { kind: 'extrude', distance: 12, angle: 45, blur: 0, color: '#000000', alpha: 1, from: '#b25f00', to: '#5c2d00' },
    glow: { strength: 0, color: '#ffffff', blur: 20 },
    overlay: null, layers: null
  },
  {
    name: 'neon', label: '霓虹辉光', description: '暗底霓虹灯管：白芯＋品红辉光＋细描边',
    suggestBg: '#0b0b10',
    fill: { kind: 'solid', color: '#ffffff' },
    stroke: { width: 2, color: '#ff2bd1' },
    shadow: { kind: 'none', distance: 0, angle: 45, blur: 0, color: '#000000', alpha: 0 },
    glow: { strength: 80, color: '#ff2bd1', blur: 30 },
    overlay: null, layers: null
  },
  {
    name: 'chrome', label: '金属铬渐变', description: '液态金属：纵向高光硬分界铬渐变＋细黑描边',
    suggestBg: '#1c1c1e',
    fill: { kind: 'gradient', angle: 90, stops: [
      { offset: 0, color: '#f5f5f7' }, { offset: 0.38, color: '#ffffff' },
      { offset: 0.5, color: '#a7a7ad' }, { offset: 0.52, color: '#48484a' },
      { offset: 0.66, color: '#d1d1d6' }, { offset: 1, color: '#f2f2f7' }
    ] },
    stroke: { width: 3, color: '#1c1c1e' },
    shadow: { kind: 'offset', distance: 4, angle: 45, blur: 2, color: '#000000', alpha: 0.4 },
    glow: { strength: 0, color: '#ffffff', blur: 20 },
    overlay: null, layers: null
  },
  {
    name: 'vintage', label: '复古褪色', description: '做旧海报：暖调渐变＋纸色罩染＋细描边',
    suggestBg: '#f4ead5',
    fill: { kind: 'gradient', angle: 90, stops: [
      { offset: 0, color: '#e8a06a' }, { offset: 1, color: '#c96f3b' }
    ] },
    stroke: { width: 2, color: '#8a4b2a' },
    shadow: { kind: 'none', distance: 0, angle: 45, blur: 0, color: '#000000', alpha: 0 },
    glow: { strength: 0, color: '#ffffff', blur: 20 },
    overlay: { color: '#f4ead5', alpha: 0.35 },
    layers: null
  },
  {
    name: 'misprint', label: '双色叠印', description: 'Risograph 错位印刷：青/品红两层错位叠印',
    suggestBg: '#ffffff',
    fill: null,
    stroke: { width: 0, color: '#111111' },
    shadow: { kind: 'none', distance: 0, angle: 45, blur: 0, color: '#000000', alpha: 0 },
    glow: { strength: 0, color: '#ffffff', blur: 20 },
    overlay: null,
    layers: [
      { color: '#00b3ff', dx: -6, dy: 6, alpha: 0.92 },
      { color: '#ff4d6d', dx: 6, dy: -6, alpha: 0.92 }
    ]
  }
];

var PRESET_ORDER = PRESETS.map(function (p) { return p.name; });

/* 预设定义自检：启动即校验，数据写错立刻抛错（field 定位到字段）。 */
function checkPresetDef(p) {
  if (!p || typeof p !== 'object') fail('preset', '预设须为对象');
  if (typeof p.name !== 'string' || p.name.length === 0) fail('preset.name', '预设 name 不能为空');
  if (typeof p.label !== 'string' || p.label.length === 0) fail('preset.label', '预设 label 不能为空');
  if (typeof p.description !== 'string' || p.description.length === 0) fail('preset.description', '预设 description 不能为空');
  parseHexColor(p.suggestBg);
  var f = p.fill;
  if (f !== null) {
    if (f.kind === 'gradient') {
      checkNum(f.angle, 'fill.angle', '渐变角度', 0, 360);
      if (!Array.isArray(f.stops) || f.stops.length < 2) fail('fill.stops', '渐变至少 2 个色标');
      var prev = -1;
      f.stops.forEach(function (s) {
        checkNum(s.offset, 'fill.stops.offset', '色标位置', 0, 1);
        if (s.offset < prev) fail('fill.stops.offset', '色标位置须递增');
        prev = s.offset;
        parseHexColor(s.color);
      });
      if (f.stops[0].offset !== 0 || f.stops[f.stops.length - 1].offset !== 1) {
        fail('fill.stops', '渐变色标须起于 0 止于 1');
      }
    } else if (f.kind === 'solid') {
      parseHexColor(f.color);
    } else {
      fail('fill.kind', '未知填充类型：' + f.kind);
    }
  }
  checkNum(p.stroke.width, 'stroke.width', '描边宽度', 0, 50);
  parseHexColor(p.stroke.color);
  var sh = p.shadow;
  if (['none', 'offset', 'long', 'extrude'].indexOf(sh.kind) === -1) fail('shadow.kind', '未知阴影类型：' + sh.kind);
  checkNum(sh.distance, 'shadow.distance', '阴影距离', 0, 80);
  checkNum(sh.angle, 'shadow.angle', '阴影角度', 0, 360);
  checkNum(sh.blur, 'shadow.blur', '阴影模糊', 0, 50);
  parseHexColor(sh.color);
  checkNum(sh.alpha, 'shadow.alpha', '阴影不透明度', 0, 1);
  if (sh.kind === 'extrude') {
    parseHexColor(sh.from);
    parseHexColor(sh.to);
  }
  checkNum(p.glow.strength, 'glow.strength', '辉光强度', 0, 100);
  parseHexColor(p.glow.color);
  checkNum(p.glow.blur, 'glow.blur', '辉光模糊', 0, 60);
  if (p.overlay !== null) {
    parseHexColor(p.overlay.color);
    checkNum(p.overlay.alpha, 'overlay.alpha', '罩染不透明度', 0, 1);
  }
  if (p.layers !== null) {
    if (!Array.isArray(p.layers) || p.layers.length === 0) fail('layers', '叠印层须为非空数组');
    p.layers.forEach(function (L) {
      parseHexColor(L.color);
      checkNum(L.dx, 'layers.dx', '叠印层 X 偏移', -80, 80);
      checkNum(L.dy, 'layers.dy', '叠印层 Y 偏移', -80, 80);
      checkNum(L.alpha, 'layers.alpha', '叠印层不透明度', 0, 1);
    });
  }
  return p;
}

function deepCopy(o) {
  return JSON.parse(JSON.stringify(o));
}

/* 预设列表：[{name,label,description}]，顺序即展示顺序。 */
function presetList() {
  return PRESETS.map(function (p) {
    return { name: p.name, label: p.label, description: p.description };
  });
}

/* 取预设：返回深拷贝（改返回对象不影响内置定义）；未知 name 抛错 field='name'。 */
function getPreset(name) {
  for (var i = 0; i < PRESETS.length; i++) {
    if (PRESETS[i].name === name) return deepCopy(PRESETS[i]);
  }
  fail('name', '未知预设：' + name);
}

/* 字号自适应：measureWidth(size) 返回该字号下文字宽度；
 * 宽度已 fit 则返回基准字号（向下取整），超宽则二分缩小到刚好 fit，永不放大。 */
function fitFontSize(text, maxWidth, baseSize, measureWidth) {
  if (typeof text !== 'string' || text.length === 0) {
    fail('text', '文字不能为空');
  }
  if (typeof maxWidth !== 'number' || !isFinite(maxWidth) || maxWidth <= 0) {
    fail('maxWidth', '最大宽度须为大于 0 的数字');
  }
  if (typeof baseSize !== 'number' || !isFinite(baseSize) || baseSize <= 0) {
    fail('baseSize', '基准字号须为大于 0 的数字');
  }
  if (typeof measureWidth !== 'function') {
    fail('measureWidth', '须提供 measureWidth(size) 宽度测量函数');
  }
  var base = Math.floor(baseSize);
  if (measureWidth(base) <= maxWidth) return base;
  var lo = 1, hi = base - 1, mid;
  while (lo < hi) {
    mid = Math.ceil((lo + hi) / 2);
    if (measureWidth(mid) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/* 文件名清洗：去 Windows 非法字符与控制字符，首尾空白/点清掉，
 * 空白折成 '-'，超长截 60，空结果回退 'retro-text'。 */
function sanitizeFileName(text) {
  var s = text == null ? '' : String(text);
  s = s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '');
  s = s.replace(/^[\s.]+|[\s.]+$/g, '').replace(/\s+/g, '-');
  if (s.length > 60) s = s.slice(0, 60).replace(/-+$/, '');
  if (s.length === 0) return 'retro-text';
  return s;
}

/* 绘制计划：把「预设＋参数覆盖」编译成有序绘制 pass 数组（纯数据，可单元测试）。
 * overrides: {fontSize, gradientAngle, shadowDistance, blur, strokeWidth, glowStrength}
 *   未传的字段取预设默认值。
 * pass 类型：shadow | longshadow | extrude | glow | layer | fill | stroke | overlay */
function buildDrawPlan(text, presetName, overrides) {
  if (typeof text !== 'string' || text.length === 0) {
    fail('text', '文字不能为空');
  }
  var def = getPreset(presetName);
  var o = overrides || {};
  if (typeof o !== 'object') fail('overrides', '参数覆盖须为对象');
  var fontSize = checkInt(o.fontSize == null ? 120 : o.fontSize, 'fontSize', '字号', 16, 400);
  var baseAngle = def.fill && def.fill.kind === 'gradient' ? def.fill.angle : 0;
  var gradientAngle = checkNum(o.gradientAngle == null ? baseAngle : o.gradientAngle, 'gradientAngle', '渐变方向', 0, 360);
  var shadowDistance = checkNum(o.shadowDistance == null ? def.shadow.distance : o.shadowDistance, 'shadowDistance', '阴影距离', 0, 80);
  var blur = checkNum(o.blur == null ? def.shadow.blur : o.blur, 'blur', '模糊', 0, 50);
  var strokeWidth = checkNum(o.strokeWidth == null ? def.stroke.width : o.strokeWidth, 'strokeWidth', '描边宽度', 0, 50);
  var glowStrength = checkNum(o.glowStrength == null ? def.glow.strength : o.glowStrength, 'glowStrength', '辉光强度', 0, 100);

  var passes = [];
  var sh = def.shadow;
  if (sh.kind === 'offset' && shadowDistance > 0) {
    var rad = sh.angle * Math.PI / 180;
    passes.push({
      type: 'shadow',
      dx: round2(shadowDistance * Math.cos(rad)),
      dy: round2(shadowDistance * Math.sin(rad)),
      color: sh.color, blur: blur, alpha: sh.alpha
    });
  } else if (sh.kind === 'long') {
    passes.push({
      type: 'longshadow',
      count: Math.max(1, Math.min(80, Math.round(shadowDistance))),
      dx: 1, dy: 1, color: sh.color, blur: blur, alpha: sh.alpha
    });
  } else if (sh.kind === 'extrude') {
    passes.push({
      type: 'extrude',
      count: Math.max(1, Math.min(80, Math.round(shadowDistance))),
      dx: 1, dy: 1, from: sh.from, to: sh.to, blur: blur
    });
  }
  if (glowStrength > 0) {
    passes.push({
      type: 'glow', color: def.glow.color,
      blur: Math.round(def.glow.blur * glowStrength / 100), alpha: 0.9
    });
  }
  if (def.layers) {
    def.layers.forEach(function (L) {
      passes.push({ type: 'layer', color: L.color, dx: L.dx, dy: L.dy, alpha: L.alpha });
    });
  }
  if (def.fill) {
    var style = def.fill.kind === 'gradient'
      ? { kind: 'gradient', angle: gradientAngle, stops: def.fill.stops }
      : { kind: 'solid', color: def.fill.color };
    passes.push({ type: 'fill', style: style, x: 0, y: 0 });
  }
  if (strokeWidth > 0) {
    passes.push({ type: 'stroke', width: strokeWidth, color: def.stroke.color });
  }
  if (def.overlay) {
    passes.push({ type: 'overlay', color: def.overlay.color, alpha: def.overlay.alpha });
  }
  return { text: text, fontSize: fontSize, passes: passes };
}

var API = {
  presetList: presetList, getPreset: getPreset,
  fitFontSize: fitFontSize, sanitizeFileName: sanitizeFileName,
  buildDrawPlan: buildDrawPlan, lerpColor: lerpColor,
  parseHexColor: parseHexColor, PRESET_ORDER: PRESET_ORDER
};

/* 预设自检：定义写错在加载期立刻暴露。 */
PRESETS.forEach(checkPresetDef);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = API;
  return;
}
if (typeof window !== 'undefined') window.RetroTextFx = API;

/* ---------------- 浏览器 DOM 逻辑 ---------------- */
function $(id) { return document.getElementById(id); }

var FONT_STACK = '"Arial Black","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
function fontOf(size) { return '900 ' + size + 'px ' + FONT_STACK; }

var measureCanvas = document.createElement('canvas');
var measureCtx = measureCanvas.getContext('2d');

var state = {
  preset: 'rainbow', text: 'RETRO 90s', fontSize: 120,
  bg: '#ffffff', transparent: false,
  gradientAngle: 0, shadowDistance: 6, blur: 0, strokeWidth: 4, glowStrength: 0
};

function showMsg(text) {
  var el = $('rt-msg');
  if (el) el.textContent = text || '';
}
function toast(text) {
  var el = $('rt-toast');
  if (!el) return;
  el.textContent = text;
  el.style.display = 'block';
  setTimeout(function () { el.style.display = 'none'; }, 2200);
}

/* 渐变：angle 语义 0°=左→右，90°=上→下。 */
function makeGradient(ctx, style, cx, cy, w, h) {
  var a = style.angle * Math.PI / 180;
  var dx = Math.cos(a), dy = Math.sin(a);
  var half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
  var g = ctx.createLinearGradient(cx - dx * half, cy - dy * half, cx + dx * half, cy + dy * half);
  style.stops.forEach(function (s) { g.addColorStop(s.offset, s.color); });
  return g;
}

function execPass(ctx, p, text, cx, cy, boxW, boxH) {
  var i, t, col;
  ctx.save();
  if (p.type === 'shadow') {
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    if (p.blur > 0) { ctx.shadowColor = p.color; ctx.shadowBlur = p.blur; }
    ctx.fillText(text, cx + p.dx, cy + p.dy);
  } else if (p.type === 'longshadow') {
    for (i = p.count; i >= 1; i--) {
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      if (p.blur > 0) { ctx.shadowColor = p.color; ctx.shadowBlur = p.blur; }
      ctx.fillText(text, cx + i * p.dx, cy + i * p.dy);
    }
  } else if (p.type === 'extrude') {
    for (i = p.count; i >= 1; i--) {
      t = p.count === 1 ? 0 : (i - 1) / (p.count - 1);
      col = window.RetroTextFx.lerpColor(p.from, p.to, t);
      ctx.globalAlpha = 1;
      ctx.fillStyle = col;
      if (p.blur > 0) { ctx.shadowColor = col; ctx.shadowBlur = p.blur; }
      ctx.fillText(text, cx + i * p.dx, cy + i * p.dy);
    }
  } else if (p.type === 'glow') {
    ctx.globalAlpha = p.alpha;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = p.blur;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, cx, cy);
  } else if (p.type === 'layer') {
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    ctx.fillText(text, cx + p.dx, cy + p.dy);
  } else if (p.type === 'fill') {
    ctx.globalAlpha = 1;
    ctx.fillStyle = p.style.kind === 'gradient'
      ? makeGradient(ctx, p.style, cx, cy, boxW, boxH)
      : p.style.color;
    ctx.fillText(text, cx + p.x, cy + p.y);
  } else if (p.type === 'stroke') {
    ctx.globalAlpha = 1;
    ctx.lineWidth = p.width;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = p.color;
    ctx.strokeText(text, cx, cy);
  } else if (p.type === 'overlay') {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }
  ctx.restore();
}

function drawPlan(ctx, plan, W, H) {
  var cx = W / 2, cy = H / 2;
  ctx.font = fontOf(plan.fontSize);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  measureCtx.font = fontOf(plan.fontSize);
  var boxW = measureCtx.measureText(plan.text).width;
  var boxH = plan.fontSize;
  var i;
  for (i = 0; i < plan.passes.length; i++) {
    execPass(ctx, plan.passes[i], plan.text, cx, cy, boxW, boxH);
  }
}

/* 按 pass 类型估算四周留白，保证描边/阴影/辉光不被裁掉。 */
function measurePlan(plan) {
  measureCtx.font = fontOf(plan.fontSize);
  var w = measureCtx.measureText(plan.text).width;
  var pad = 24;
  plan.passes.forEach(function (p) {
    if (p.type === 'longshadow' || p.type === 'extrude') {
      pad = Math.max(pad, p.count * Math.max(Math.abs(p.dx), Math.abs(p.dy)) + 12);
    } else if (p.type === 'shadow') {
      pad = Math.max(pad, Math.abs(p.dx) + Math.abs(p.dy) + p.blur + 12);
    } else if (p.type === 'glow') {
      pad = Math.max(pad, p.blur + 12);
    } else if (p.type === 'stroke') {
      pad = Math.max(pad, p.width + 12);
    } else if (p.type === 'layer') {
      pad = Math.max(pad, Math.abs(p.dx) + Math.abs(p.dy) + 12);
    }
  });
  return {
    w: Math.max(50, Math.ceil(w + pad * 2)),
    h: Math.max(50, Math.ceil(plan.fontSize * 1.5 + pad * 2))
  };
}

function currentPlan() {
  var text = state.text;
  if (!text) { showMsg('请先输入文字'); return null; }
  showMsg('');
  var fitted = window.RetroTextFx.fitFontSize(text, 1200, state.fontSize, function (s) {
    measureCtx.font = fontOf(s);
    return measureCtx.measureText(text).width;
  });
  if (fitted < Math.floor(state.fontSize)) {
    showMsg('文字过长，字号已自动缩小到 ' + fitted + 'px 以完整显示');
  }
  try {
    return window.RetroTextFx.buildDrawPlan(text, state.preset, {
      fontSize: fitted,
      gradientAngle: state.gradientAngle,
      shadowDistance: state.shadowDistance,
      blur: state.blur,
      strokeWidth: state.strokeWidth,
      glowStrength: state.glowStrength
    });
  } catch (e) {
    showMsg(e.message);
    return null;
  }
}

function render() {
  var canvas = $('rt-canvas');
  if (!canvas) return;
  var plan = currentPlan();
  var dl1 = $('rt-dl-1x'), dl2 = $('rt-dl-2x'), cp = $('rt-copy-png');
  if (!plan) {
    if (dl1) dl1.disabled = true;
    if (dl2) dl2.disabled = true;
    if (cp) cp.disabled = true;
    return;
  }
  var size = measurePlan(plan);
  canvas.width = size.w;
  canvas.height = size.h;
  var ctx = canvas.getContext('2d');
  if (!state.transparent) {
    ctx.fillStyle = state.bg;
    ctx.fillRect(0, 0, size.w, size.h);
  }
  drawPlan(ctx, plan, size.w, size.h);
  if (dl1) dl1.disabled = false;
  if (dl2) dl2.disabled = false;
  if (cp) cp.disabled = false;
}

/* scale 倍率离屏渲染 → Blob。 */
function renderBlob(scale, cb) {
  var plan = currentPlan();
  if (!plan) { cb(null); return; }
  var size = measurePlan(plan);
  var c = document.createElement('canvas');
  c.width = size.w * scale;
  c.height = size.h * scale;
  var ctx = c.getContext('2d');
  ctx.scale(scale, scale);
  if (!state.transparent) {
    ctx.fillStyle = state.bg;
    ctx.fillRect(0, 0, size.w, size.h);
  }
  drawPlan(ctx, plan, size.w, size.h);
  if (c.toBlob) c.toBlob(cb, 'image/png');
  else cb(null);
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

function exportPng(scale) {
  renderBlob(scale, function (blob) {
    if (!blob) { toast('PNG 生成失败，请换个浏览器再试'); return; }
    var name = window.RetroTextFx.sanitizeFileName(state.text) + '-' + scale + 'x.png';
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

/* 预设切换：滑杆回到该预设默认值，背景用预设推荐色。 */
function loadPreset(name) {
  var def;
  try {
    def = window.RetroTextFx.getPreset(name);
  } catch (e) {
    showMsg(e.message);
    return;
  }
  state.preset = name;
  state.gradientAngle = def.fill && def.fill.kind === 'gradient' ? def.fill.angle : 0;
  state.shadowDistance = def.shadow.distance;
  state.blur = def.shadow.blur;
  state.strokeWidth = def.stroke.width;
  state.glowStrength = def.glow.strength;
  state.bg = def.suggestBg;
  state.transparent = false;
  syncInputs();
  render();
}

function setSlider(id, valId, val) {
  var r = $(id), v = $(valId);
  if (r) r.value = val;
  if (v) v.textContent = val;
}
function syncInputs() {
  var t = $('rt-text');
  if (t && t.value !== state.text) t.value = state.text;
  var fs = $('rt-font-size'), fsr = $('rt-font-size-range');
  if (fs) fs.value = state.fontSize;
  if (fsr) fsr.value = state.fontSize;
  setSlider('rt-gradient-angle', 'rt-gradient-angle-val', state.gradientAngle);
  setSlider('rt-shadow-distance', 'rt-shadow-distance-val', state.shadowDistance);
  setSlider('rt-blur', 'rt-blur-val', state.blur);
  setSlider('rt-stroke-width', 'rt-stroke-width-val', state.strokeWidth);
  setSlider('rt-glow-strength', 'rt-glow-strength-val', state.glowStrength);
  var bg = $('rt-bg'), bgt = $('rt-bg-text');
  if (bg) bg.value = state.bg;
  if (bgt) bgt.value = state.bg;
  var tr = $('rt-transparent');
  if (tr) tr.checked = state.transparent;
  var btns = document.querySelectorAll('.rt-preset');
  for (var i = 0; i < btns.length; i++) {
    if (btns[i].getAttribute('data-preset') === state.preset) btns[i].classList.add('active');
    else btns[i].classList.remove('active');
  }
}

function bindSlider(id, valId, key) {
  var r = $(id);
  if (!r) return;
  r.addEventListener('input', function () {
    state[key] = Number(r.value);
    var v = $(valId);
    if (v) v.textContent = r.value;
    render();
  });
}

/* 事件绑定 */
(function bind() {
  var btns = document.querySelectorAll('.rt-preset');
  for (var i = 0; i < btns.length; i++) {
    (function (b) {
      b.addEventListener('click', function () { loadPreset(b.getAttribute('data-preset')); });
    })(btns[i]);
  }
  var t = $('rt-text');
  if (t) t.addEventListener('input', function () {
    state.text = t.value;
    render();
  });
  var fsr = $('rt-font-size-range');
  if (fsr) fsr.addEventListener('input', function () {
    state.fontSize = Number(fsr.value);
    var fs = $('rt-font-size');
    if (fs) fs.value = fsr.value;
    render();
  });
  var fs = $('rt-font-size');
  if (fs) fs.addEventListener('change', function () {
    var v = Math.round(Number(fs.value));
    if (!isFinite(v) || v < 16) v = 16;
    if (v > 400) v = 400;
    state.fontSize = v;
    if (fsr) fsr.value = v;
    fs.value = v;
    render();
  });
  bindSlider('rt-gradient-angle', 'rt-gradient-angle-val', 'gradientAngle');
  bindSlider('rt-shadow-distance', 'rt-shadow-distance-val', 'shadowDistance');
  bindSlider('rt-blur', 'rt-blur-val', 'blur');
  bindSlider('rt-stroke-width', 'rt-stroke-width-val', 'strokeWidth');
  bindSlider('rt-glow-strength', 'rt-glow-strength-val', 'glowStrength');

  var bg = $('rt-bg');
  if (bg) bg.addEventListener('input', function () {
    state.bg = bg.value;
    var bgt = $('rt-bg-text');
    if (bgt) bgt.value = bg.value;
    render();
  });
  var bgt = $('rt-bg-text');
  if (bgt) bgt.addEventListener('change', function () {
    try {
      state.bg = window.RetroTextFx.parseHexColor(bgt.value.trim());
      if (bg) bg.value = state.bg;
      bgt.value = state.bg;
      render();
    } catch (e) {
      showMsg(e.message);
    }
  });
  var tr = $('rt-transparent');
  if (tr) tr.addEventListener('change', function () {
    state.transparent = tr.checked;
    render();
  });

  var ex = $('rt-example');
  if (ex) ex.addEventListener('click', function () {
    state.text = 'RETRO 90s 复古';
    state.fontSize = 140;
    loadPreset('rainbow');
    toast('已载入示例');
  });
  var dl1 = $('rt-dl-1x');
  if (dl1) dl1.addEventListener('click', function () { exportPng(1); });
  var dl2 = $('rt-dl-2x');
  if (dl2) dl2.addEventListener('click', function () { exportPng(2); });
  var cp = $('rt-copy-png');
  if (cp) cp.addEventListener('click', copyPng);

  syncInputs();
  render();
})();

})();
