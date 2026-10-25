/* CSS 阴影与圆角生成器（css_shadow_radius_generator）- 纯前端本地计算
 * box-shadow 形如 [inset ]Xpx Ypx Blpx Spx rgba(r, g, b, a)，完整四值输出不省略；
 * border-radius 联动/四角相等出单值，四角不等按顺时针 TL TR BR BL 输出，
 * 椭圆模式且水平≠垂直时出「水平四值 / 垂直四值」斜杠语法，相等时不写斜杠。
 * 纯函数经 module.exports 暴露供 node 测试；浏览器里走 DOM。
 * 零网络请求：本文件不发起任何 fetch / XHR。 */
(function () {
'use strict';

/* 整数格式化：-0 归零。 */
function fmtInt(n) {
  var v = Math.round(Number(n));
  if (v === 0) v = 0;
  return String(v);
}

/* 透明度 0–100% → rgba 小数（两位内，去尾零）。 */
function fmtAlpha(pct) {
  var v = Math.round(Number(pct)) / 100;
  if (v < 0) v = 0;
  if (v > 1) v = 1;
  v = Math.round(v * 100) / 100;
  if (v === 0) v = 0;
  return String(v);
}

/* #RRGGBB → {r, g, b}；非法返回 null。 */
function hexToRgb(hex) {
  if (typeof hex !== 'string') return null;
  var m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  return {
    r: parseInt(m[1].slice(0, 2), 16),
    g: parseInt(m[1].slice(2, 4), 16),
    b: parseInt(m[1].slice(4, 6), 16)
  };
}

/* 阴影参数：{offsetX, offsetY, blur, spread, color, opacity, inset}。
 * color 为 #RRGGBB，非法时回退纯黑；opacity 为 0–100。 */
function buildBoxShadow(s) {
  var rgb = hexToRgb(s.color) || { r: 0, g: 0, b: 0 };
  var parts = [];
  if (s.inset) parts.push('inset');
  parts.push(fmtInt(s.offsetX) + 'px');
  parts.push(fmtInt(s.offsetY) + 'px');
  parts.push(fmtInt(s.blur) + 'px');
  parts.push(fmtInt(s.spread) + 'px');
  parts.push('rgba(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ', ' + fmtAlpha(s.opacity) + ')');
  return parts.join(' ');
}

/* 四角值 → 单值或顺时针四值（相等时出单值）。 */
function cornersToString(vals) {
  var v = vals.map(function (x) { return fmtInt(x) + 'px'; });
  if (v[0] === v[1] && v[1] === v[2] && v[2] === v[3]) return v[0];
  return v.join(' ');
}

/* 圆角参数：{linked, tl, tr, br, bl, ellipse, vtl, vtr, vbr, vbl}。
 * linked 时以 tl 为四角水平值、vtl 为四角垂直值。 */
function buildBorderRadius(r) {
  var h, v;
  if (r.linked) {
    h = [r.tl, r.tl, r.tl, r.tl];
    v = [r.vtl, r.vtl, r.vtl, r.vtl];
  } else {
    h = [r.tl, r.tr, r.br, r.bl];
    v = [r.vtl, r.vtr, r.vbr, r.vbl];
  }
  var hStr = cornersToString(h);
  if (!r.ellipse) return hStr;
  var vStr = cornersToString(v);
  if (vStr === hStr) return hStr;
  return hStr + ' / ' + vStr;
}

/* 合并生成：输入 {shadow, radius}，输出 {boxShadow, borderRadius, cssText}。 */
function buildCss(input) {
  var boxShadow = buildBoxShadow(input.shadow);
  var borderRadius = buildBorderRadius(input.radius);
  var cssText = '.shadow-radius-box {\n' +
    '  box-shadow: ' + boxShadow + ';\n' +
    '  border-radius: ' + borderRadius + ';\n' +
    '}';
  return { boxShadow: boxShadow, borderRadius: borderRadius, cssText: cssText };
}

/* 默认参数（重置目标）。 */
function defaultState() {
  return {
    shadow: { offsetX: 0, offsetY: 8, blur: 24, spread: 0, color: '#000000', opacity: 15, inset: false },
    radius: { linked: true, tl: 12, tr: 12, br: 12, bl: 12, ellipse: false, vtl: 12, vtr: 12, vbr: 12, vbl: 12 },
    boxBg: '#ffffff',
    pageBg: '#f3f4f6'
  };
}

/* 4 组预设：仅为示例起点，请按需改写。 */
var PRESETS = [
  {
    name: '柔和卡片',
    shadow: { offsetX: 0, offsetY: 4, blur: 16, spread: 0, color: '#000000', opacity: 12, inset: false },
    radius: { linked: true, tl: 8, tr: 8, br: 8, bl: 8, ellipse: false, vtl: 8, vtr: 8, vbr: 8, vbl: 8 }
  },
  {
    name: '悬浮抬升',
    shadow: { offsetX: 0, offsetY: 16, blur: 48, spread: 0, color: '#000000', opacity: 18, inset: false },
    radius: { linked: true, tl: 12, tr: 12, br: 12, bl: 12, ellipse: false, vtl: 12, vtr: 12, vbr: 12, vbl: 12 }
  },
  {
    name: '内阴影凹陷',
    shadow: { offsetX: 0, offsetY: 2, blur: 12, spread: 0, color: '#000000', opacity: 25, inset: true },
    radius: { linked: true, tl: 16, tr: 16, br: 16, bl: 16, ellipse: false, vtl: 16, vtr: 16, vbr: 16, vbl: 16 }
  },
  {
    name: '不等圆角椭圆',
    shadow: { offsetX: 0, offsetY: 8, blur: 24, spread: 0, color: '#1e293b', opacity: 20, inset: false },
    radius: { linked: false, tl: 48, tr: 16, br: 32, bl: 8, ellipse: true, vtl: 16, vtr: 32, vbr: 8, vbl: 24 }
  }
];

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    fmtInt: fmtInt, fmtAlpha: fmtAlpha, hexToRgb: hexToRgb,
    buildBoxShadow: buildBoxShadow, cornersToString: cornersToString,
    buildBorderRadius: buildBorderRadius, buildCss: buildCss,
    defaultState: defaultState, PRESETS: PRESETS
  };
  return;
}

/* ---------- 浏览器 DOM 逻辑 ---------- */
function $(id) { return document.getElementById(id); }
var state = defaultState();

function toast(msg) {
  var t = $('csr-toast');
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

function downloadCss() {
  var css = $('csr-code-all').textContent;
  var blob = new Blob([css + '\n'], { type: 'text/css;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'shadow-radius.css';
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 300);
  toast('已下载 shadow-radius.css');
}

function readState() {
  var s = state.shadow, r = state.radius;
  s.offsetX = parseInt($('csr-ox').value, 10);
  s.offsetY = parseInt($('csr-oy').value, 10);
  s.blur = parseInt($('csr-blur').value, 10);
  s.spread = parseInt($('csr-spread').value, 10);
  s.color = $('csr-color').value;
  s.opacity = parseInt($('csr-opacity').value, 10);
  s.inset = $('csr-inset').checked;
  r.linked = $('csr-linked').checked;
  r.ellipse = $('csr-ellipse').checked;
  if (r.linked) {
    r.tl = r.tr = r.br = r.bl = parseInt($('csr-h-all').value, 10);
    r.vtl = r.vtr = r.vbr = r.vbl = parseInt($('csr-v-all').value, 10);
  } else {
    r.tl = parseInt($('csr-h-tl').value, 10);
    r.tr = parseInt($('csr-h-tr').value, 10);
    r.br = parseInt($('csr-h-br').value, 10);
    r.bl = parseInt($('csr-h-bl').value, 10);
    r.vtl = parseInt($('csr-v-tl').value, 10);
    r.vtr = parseInt($('csr-v-tr').value, 10);
    r.vbr = parseInt($('csr-v-br').value, 10);
    r.vbl = parseInt($('csr-v-bl').value, 10);
  }
  state.boxBg = $('csr-box-bg').value;
  state.pageBg = $('csr-page-bg').value;
}

function setVal(id, v) { var el = $(id); if (el) el.textContent = v; }

function render() {
  readState();
  var out = buildCss(state);
  var box = $('csr-preview-box');
  box.style.boxShadow = out.boxShadow;
  box.style.borderRadius = out.borderRadius;
  box.style.backgroundColor = state.boxBg;
  $('csr-preview-stage').style.backgroundColor = state.pageBg;
  $('csr-code-shadow').textContent = 'box-shadow: ' + out.boxShadow + ';';
  $('csr-code-radius').textContent = 'border-radius: ' + out.borderRadius + ';';
  $('csr-code-all').textContent = out.cssText;
  setVal('csr-ox-val', state.shadow.offsetX + 'px');
  setVal('csr-oy-val', state.shadow.offsetY + 'px');
  setVal('csr-blur-val', state.shadow.blur + 'px');
  setVal('csr-spread-val', state.shadow.spread + 'px');
  setVal('csr-opacity-val', state.shadow.opacity + '%');
  setVal('csr-h-all-val', state.radius.tl + 'px');
  setVal('csr-v-all-val', state.radius.vtl + 'px');
  setVal('csr-h-tl-val', state.radius.tl + 'px');
  setVal('csr-h-tr-val', state.radius.tr + 'px');
  setVal('csr-h-br-val', state.radius.br + 'px');
  setVal('csr-h-bl-val', state.radius.bl + 'px');
  setVal('csr-v-tl-val', state.radius.vtl + 'px');
  setVal('csr-v-tr-val', state.radius.vtr + 'px');
  setVal('csr-v-br-val', state.radius.vbr + 'px');
  setVal('csr-v-bl-val', state.radius.vbl + 'px');
  $('csr-radius-independent').style.display = state.radius.linked ? 'none' : 'block';
  $('csr-radius-vertical').style.display = state.radius.ellipse ? 'block' : 'none';
}

function applyState(st) {
  state = JSON.parse(JSON.stringify(st));
  var s = state.shadow, r = state.radius;
  $('csr-ox').value = s.offsetX;
  $('csr-oy').value = s.offsetY;
  $('csr-blur').value = s.blur;
  $('csr-spread').value = s.spread;
  $('csr-color').value = s.color;
  $('csr-opacity').value = s.opacity;
  $('csr-inset').checked = s.inset;
  $('csr-linked').checked = r.linked;
  $('csr-independent').checked = !r.linked;
  $('csr-ellipse').checked = r.ellipse;
  $('csr-h-all').value = r.tl;
  $('csr-v-all').value = r.vtl;
  $('csr-h-tl').value = r.tl;
  $('csr-h-tr').value = r.tr;
  $('csr-h-br').value = r.br;
  $('csr-h-bl').value = r.bl;
  $('csr-v-tl').value = r.vtl;
  $('csr-v-tr').value = r.vtr;
  $('csr-v-br').value = r.vbr;
  $('csr-v-bl').value = r.vbl;
  $('csr-box-bg').value = state.boxBg;
  $('csr-page-bg').value = state.pageBg;
  render();
}

function applyPreset(i) {
  var p = PRESETS[i];
  var st = defaultState();
  st.shadow = JSON.parse(JSON.stringify(p.shadow));
  st.radius = JSON.parse(JSON.stringify(p.radius));
  applyState(st);
  toast('已载入预设「' + p.name + '」，请按需改写');
}

document.addEventListener('DOMContentLoaded', function () {
  var inputs = document.querySelectorAll('#csr-form input');
  for (var i = 0; i < inputs.length; i++) {
    inputs[i].addEventListener('input', render);
    inputs[i].addEventListener('change', render);
  }
  for (var j = 0; j < PRESETS.length; j++) {
    (function (idx) {
      $('csr-preset-' + idx).addEventListener('click', function () { applyPreset(idx); });
    })(j);
  }
  $('csr-copy-shadow').addEventListener('click', function () {
    copyText($('csr-code-shadow').textContent, '已复制 box-shadow');
  });
  $('csr-copy-radius').addEventListener('click', function () {
    copyText($('csr-code-radius').textContent, '已复制 border-radius');
  });
  $('csr-copy-all').addEventListener('click', function () {
    copyText($('csr-code-all').textContent, '已复制完整 CSS');
  });
  $('csr-download').addEventListener('click', downloadCss);
  $('csr-reset').addEventListener('click', function () {
    applyState(defaultState());
    toast('已重置为默认参数');
  });
  applyState(defaultState());
});
})();
