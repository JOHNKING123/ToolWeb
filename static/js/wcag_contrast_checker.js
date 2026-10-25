/* WCAG 颜色对比度检查器（wcag_contrast_checker）- 纯前端本地计算
 * WCAG 2.x 相对亮度：sRGB 通道归一化后 ≤0.03928 除以 12.92，
 * 否则 ((c＋0.055)/1.055)^2.4；系数 0.2126 / 0.7152 / 0.0722；
 * 对比度＝(较亮亮度＋0.05)/(较暗亮度＋0.05)。
 * 判定阈值：AA 正常 ≥4.5、AA 大号 ≥3.0、AAA 正常 ≥7.0、AAA 大号 ≥4.5。
 * 大号字按 WCAG 定义：≥18pt，或 14pt 加粗。
 * 纯函数经 module.exports 暴露供 node 测试；浏览器里走 DOM。
 * 零网络请求：本文件不发起任何 fetch / XHR。 */
(function () {
'use strict';

/* ---------- 颜色解析与格式化 ---------- */

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

/* {r, g, b} → #RRGGBB（大写）；通道越界时钳制。 */
function rgbToHex(rgb) {
  function ch(v) {
    var n = Math.round(Number(v));
    if (isNaN(n)) n = 0;
    if (n < 0) n = 0;
    if (n > 255) n = 255;
    var s = n.toString(16).toUpperCase();
    return s.length === 1 ? '0' + s : s;
  }
  return '#' + ch(rgb.r) + ch(rgb.g) + ch(rgb.b);
}

/* {r, g, b} → rgb(r, g, b) 文本。 */
function rgbToText(rgb) {
  return 'rgb(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ')';
}

/* 解析颜色文本：支持 #RGB、#RRGGBB、rgb(r, g, b) 三种写法。
 * 成功返回 {r, g, b, hex}（hex 为规范化 #RRGGBB 大写），非法返回 null。
 * rgb() 要求三个整数 0–255，不接受小数、百分比与 alpha。 */
function parseColor(text) {
  if (typeof text !== 'string') return null;
  var s = text.trim();
  var m3 = /^#([0-9a-fA-F]{3})$/.exec(s);
  if (m3) {
    var h = m3[1];
    var rgb = {
      r: parseInt(h[0] + h[0], 16),
      g: parseInt(h[1] + h[1], 16),
      b: parseInt(h[2] + h[2], 16)
    };
    return { r: rgb.r, g: rgb.g, b: rgb.b, hex: rgbToHex(rgb) };
  }
  var rgb6 = hexToRgb(s);
  if (rgb6) return { r: rgb6.r, g: rgb6.g, b: rgb6.b, hex: rgbToHex(rgb6) };
  var mRgb = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i.exec(s);
  if (mRgb) {
    var r = Number(mRgb[1]), g = Number(mRgb[2]), b = Number(mRgb[3]);
    if (r > 255 || g > 255 || b > 255) return null;
    var parsed = { r: r, g: g, b: b };
    return { r: r, g: g, b: b, hex: rgbToHex(parsed) };
  }
  return null;
}

/* ---------- WCAG 相对亮度与对比度 ---------- */

/* 单通道 sRGB → 线性值（阈值 0.03928）。 */
function linearize(channel) {
  var c = channel / 255;
  if (c <= 0.03928) return c / 12.92;
  return Math.pow((c + 0.055) / 1.055, 2.4);
}

/* 相对亮度 L（0–1）。 */
function relativeLuminance(rgb) {
  return 0.2126 * linearize(rgb.r) + 0.7152 * linearize(rgb.g) + 0.0722 * linearize(rgb.b);
}

/* 对比度数值（未四舍五入）；互换前景/背景结果不变。 */
function contrastRatio(fg, bg) {
  var l1 = relativeLuminance(fg);
  var l2 = relativeLuminance(bg);
  var hi = Math.max(l1, l2), lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

/* 对比度显示：保留两位小数。 */
function formatRatio(ratio) {
  return (Math.round(ratio * 100) / 100).toFixed(2);
}

/* 字号对应的 AA / AAA 阈值：normal=正常字，large=大号字。 */
function thresholdsForSize(size) {
  if (size === 'large') return { aa: 3.0, aaa: 4.5 };
  return { aa: 4.5, aaa: 7.0 };
}

/* 完整评估：输入 {fg, bg}（{r,g,b} 或颜色文本）与字号。
 * 输出 {fgHex, bgHex, fgLum, bgLum, ratio, ratioText, checks, primary}，
 * checks 为四档判定，primary 为当前字号下的 AA / AAA 判定。 */
function evaluate(fg, bg, size) {
  var f = typeof fg === 'string' ? parseColor(fg) : fg;
  var b = typeof bg === 'string' ? parseColor(bg) : bg;
  if (!f || !b) return null;
  var ratio = contrastRatio(f, b);
  var th = thresholdsForSize(size);
  var checks = {
    aaNormal: ratio >= 4.5,
    aaLarge: ratio >= 3.0,
    aaaNormal: ratio >= 7.0,
    aaaLarge: ratio >= 4.5
  };
  return {
    fgHex: rgbToHex(f),
    bgHex: rgbToHex(b),
    fgLum: relativeLuminance(f),
    bgLum: relativeLuminance(b),
    ratio: ratio,
    ratioText: formatRatio(ratio),
    checks: checks,
    primary: { aa: ratio >= th.aa, aaa: ratio >= th.aaa }
  };
}

/* ---------- HSL 互转（修正建议用） ---------- */

function rgbToHsl(rgb) {
  var r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255;
  var max = Math.max(r, g, b), min = Math.min(r, g, b);
  var h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    var d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return { h: h, s: s, l: l };
}

function hslToRgb(hsl) {
  var h = hsl.h, s = hsl.s, l = hsl.l;
  if (s === 0) {
    var v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  function hue2rgb(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }
  var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  var p = 2 * l - q;
  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255)
  };
}

/* 修正建议：沿 HSL 明度方向以 1% 步进双向搜索最近达标前景色。
 * 输入前景/背景颜色文本与目标比值；输出 null（无前景色可达目标）
 * 或 {hex, ratio, ratioText, steps, direction}（direction 为 'darken'/'lighten'；
 * 同步数并列时先判调暗方向，方向确定、步数最少）。
 * 只调前景色明暗，不改色相与饱和度。 */
function suggestColor(fgText, bgText, targetRatio) {
  var fg = parseColor(fgText);
  var bg = parseColor(bgText);
  if (!fg || !bg) return null;
  if (contrastRatio(fg, bg) >= targetRatio) return null;
  var hsl = rgbToHsl(fg);
  for (var step = 1; step <= 100; step++) {
    var candidates = [
      { l: hsl.l - step / 100, direction: 'darken' },
      { l: hsl.l + step / 100, direction: 'lighten' }
    ];
    for (var i = 0; i < candidates.length; i++) {
      var nl = candidates[i].l;
      if (nl < 0 || nl > 1) continue;
      var rgb = hslToRgb({ h: hsl.h, s: hsl.s, l: nl });
      var ratio = contrastRatio(rgb, bg);
      if (ratio >= targetRatio) {
        return {
          hex: rgbToHex(rgb),
          ratio: ratio,
          ratioText: formatRatio(ratio),
          steps: step,
          direction: candidates[i].direction
        };
      }
    }
  }
  return null;
}

/* 建议目标档 → 目标比值。 */
function targetRatioForKey(key) {
  if (key === 'aaLarge') return 3.0;
  if (key === 'aaaNormal') return 7.0;
  if (key === 'aaaLarge') return 4.5;
  return 4.5;
}

/* 结果摘要文本（含两色 HEX、比值、四档判定）。 */
function buildSummary(ev, size, suggestion) {
  var lines = [];
  lines.push('WCAG 颜色对比度检查结果');
  lines.push('前景色：' + ev.fgHex + '　背景色：' + ev.bgHex);
  lines.push('对比度：' + ev.ratioText + ':1');
  lines.push('字号：' + (size === 'large' ? '大号字（≥18pt 或 14pt 加粗）' : '正常字'));
  lines.push('AA 正常（≥4.5）：' + (ev.checks.aaNormal ? '通过' : '未通过'));
  lines.push('AA 大号（≥3.0）：' + (ev.checks.aaLarge ? '通过' : '未通过'));
  lines.push('AAA 正常（≥7.0）：' + (ev.checks.aaaNormal ? '通过' : '未通过'));
  lines.push('AAA 大号（≥4.5）：' + (ev.checks.aaaLarge ? '通过' : '未通过'));
  if (suggestion) {
    lines.push('修正建议前景色：' + suggestion.hex + '（对比度 ' + suggestion.ratioText + ':1）');
  }
  lines.push('判定按 WCAG 2.x 相对亮度公式，仅针对所输颜色对。');
  return lines.join('\n');
}

/* 默认状态：黑字白底、正常字、建议目标 AA 正常。 */
function defaultState() {
  return { fg: '#000000', bg: '#FFFFFF', size: 'normal', target: 'aaNormal' };
}

/* 4 组预设色对：仅为示例起点，请按需改写。 */
var PRESETS = [
  { name: '黑字白底', fg: '#000000', bg: '#FFFFFF', note: '满分示例 21.00' },
  { name: '#767676 白底', fg: '#767676', bg: '#FFFFFF', note: 'AA 正常过线示例 4.54' },
  { name: '#777777 白底', fg: '#777777', bg: '#FFFFFF', note: 'AA 正常未过线＋修正建议演示 4.48' },
  { name: '品牌蓝 #1A73E8 白底', fg: '#1A73E8', bg: '#FFFFFF', note: 'AA 正常过线、AAA 未过线示例' }
];

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    hexToRgb: hexToRgb, rgbToHex: rgbToHex, rgbToText: rgbToText,
    parseColor: parseColor, linearize: linearize,
    relativeLuminance: relativeLuminance, contrastRatio: contrastRatio,
    formatRatio: formatRatio, thresholdsForSize: thresholdsForSize,
    evaluate: evaluate, rgbToHsl: rgbToHsl, hslToRgb: hslToRgb,
    suggestColor: suggestColor, targetRatioForKey: targetRatioForKey,
    buildSummary: buildSummary, defaultState: defaultState, PRESETS: PRESETS
  };
  return;
}

/* ---------- 浏览器 DOM 逻辑 ---------- */
function $(id) { return document.getElementById(id); }
var state = defaultState();
var lastSuggestion = null;

function toast(msg) {
  var t = $('wcc-toast');
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
      else { toast('复制失败，请手动选中结果摘要内容复制'); }
    } catch (e) {
      toast('复制失败，请手动选中结果摘要内容复制');
    }
    document.body.removeChild(ta);
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () { toast(okMsg); }, fallback);
  } else {
    fallback();
  }
}

function setError(which, msg) {
  var el = $(which === 'fg' ? 'wcc-fg-error' : 'wcc-bg-error');
  if (el) el.textContent = msg || '';
}

/* 一路输入有效时：同步取色器＋另两路文本，刷新预览与判定。
 * 非法时只显示报错，不改取色器、不改另两路文本、不改预览（不静默回退）。 */
function onColorText(which, raw) {
  var parsed = parseColor(raw);
  if (!parsed) {
    setError(which, '颜色格式不正确：请用 #RGB、#RRGGBB 或 rgb(r, g, b)，如 #1A73E8 或 rgb(26, 115, 232)');
    return;
  }
  setError(which, '');
  state[which] = parsed.hex;
  syncInputs(which);
  render();
}

function syncInputs(which) {
  var parsed = parseColor(state[which]);
  if (!parsed) return;
  var p = which === 'fg' ? 'fg' : 'bg';
  $( 'wcc-' + p + '-picker').value = parsed.hex;
  $('wcc-' + p + '-hex').value = parsed.hex;
  $('wcc-' + p + '-rgb').value = rgbToText(parsed);
}

function render() {
  var ev = evaluate(state.fg, state.bg, state.size);
  if (!ev) return;
  /* 预览：背景为所选背景色，外层固定浅灰底以区分。 */
  var stage = $('wcc-preview');
  stage.style.backgroundColor = ev.bgHex;
  var title = $('wcc-preview-title'), body = $('wcc-preview-body'), btn = $('wcc-preview-btn');
  title.style.color = ev.fgHex;
  body.style.color = ev.fgHex;
  btn.style.backgroundColor = ev.fgHex;
  btn.style.color = ev.bgHex;
  btn.style.borderColor = ev.fgHex;
  $('wcc-ratio').textContent = ev.ratioText + ':1';
  $('wcc-lums').textContent = '前景亮度 ' + ev.fgLum.toFixed(4) + '　背景亮度 ' + ev.bgLum.toFixed(4);
  function badge(id, pass) {
    var el = $(id);
    el.textContent = pass ? '✓ 通过' : '✗ 未通过';
    el.className = 'wcc-badge ' + (pass ? 'wcc-pass' : 'wcc-fail');
  }
  badge('wcc-badge-aa-normal', ev.checks.aaNormal);
  badge('wcc-badge-aa-large', ev.checks.aaLarge);
  badge('wcc-badge-aaa-normal', ev.checks.aaaNormal);
  badge('wcc-badge-aaa-large', ev.checks.aaaLarge);
  /* 当前字号主判定高亮：正常字看 AA/AAA 正常档，大号字看 AA/AAA 大号档。 */
  var primaryNote = state.size === 'large'
    ? '当前为大号字：主判定为 AA 大号（≥3.0）' + (ev.primary.aa ? '通过' : '未通过') + '、AAA 大号（≥4.5）' + (ev.primary.aaa ? '通过' : '未通过')
    : '当前为正常字：主判定为 AA 正常（≥4.5）' + (ev.primary.aa ? '通过' : '未通过') + '、AAA 正常（≥7.0）' + (ev.primary.aaa ? '通过' : '未通过');
  $('wcc-primary').textContent = primaryNote;
  /* 修正建议：仅当目标档未达标时出现；目标已达标则不显示建议。 */
  var targetRatio = targetRatioForKey(state.target);
  var targetPass = ev.ratio >= targetRatio;
  var sugBox = $('wcc-suggestion');
  if (targetPass) {
    lastSuggestion = null;
    sugBox.textContent = '当前颜色对已达到所选目标档，无需修正建议。';
  } else {
    lastSuggestion = suggestColor(state.fg, state.bg, targetRatio);
    if (!lastSuggestion) {
      sugBox.innerHTML = '';
      var none = document.createElement('span');
      none.textContent = '仅调前景色明暗无法达到所选目标档（已试调至纯黑/纯白两端），请改换背景色或降低目标档。';
      sugBox.appendChild(none);
    } else {
      sugBox.innerHTML = '';
      var sText = document.createElement('span');
      sText.textContent = '建议前景色 ' + lastSuggestion.hex + '（' + (lastSuggestion.direction === 'darken' ? '调暗' : '调亮') + lastSuggestion.steps + '%，对比度 ' + lastSuggestion.ratioText + ':1）：';
      var sBtn = document.createElement('button');
      sBtn.className = 'btn btn-primary';
      sBtn.type = 'button';
      sBtn.textContent = '一键采纳';
      sBtn.onclick = function () {
        state.fg = lastSuggestion.hex;
        syncInputs('fg');
        render();
        toast('已采纳建议色 ' + lastSuggestion.hex);
      };
      sugBox.appendChild(sText);
      sugBox.appendChild(document.createTextNode(' '));
      sugBox.appendChild(sBtn);
    }
  }
  $('wcc-summary').textContent = buildSummary(ev, state.size, lastSuggestion);
}

function applyPreset(i) {
  var p = PRESETS[i];
  state.fg = p.fg;
  state.bg = p.bg;
  setError('fg', '');
  setError('bg', '');
  syncInputs('fg');
  syncInputs('bg');
  render();
  toast('已载入预设：' + p.name + '（请按需改写）');
}

function resetAll() {
  var d = defaultState();
  state.fg = d.fg; state.bg = d.bg; state.size = d.size; state.target = d.target;
  $('wcc-size-normal').checked = true;
  $('wcc-target').value = 'aaNormal';
  setError('fg', '');
  setError('bg', '');
  syncInputs('fg');
  syncInputs('bg');
  render();
}

function bind() {
  $('wcc-fg-picker').addEventListener('input', function (e) {
    state.fg = e.target.value.toUpperCase();
    setError('fg', '');
    syncInputs('fg');
    render();
  });
  $('wcc-bg-picker').addEventListener('input', function (e) {
    state.bg = e.target.value.toUpperCase();
    setError('bg', '');
    syncInputs('bg');
    render();
  });
  $('wcc-fg-hex').addEventListener('input', function (e) { onColorText('fg', e.target.value); });
  $('wcc-bg-hex').addEventListener('input', function (e) { onColorText('bg', e.target.value); });
  $('wcc-fg-rgb').addEventListener('input', function (e) { onColorText('fg', e.target.value); });
  $('wcc-bg-rgb').addEventListener('input', function (e) { onColorText('bg', e.target.value); });
  $('wcc-swap').addEventListener('click', function () {
    var tmp = state.fg; state.fg = state.bg; state.bg = tmp;
    setError('fg', ''); setError('bg', '');
    syncInputs('fg'); syncInputs('bg'); render();
  });
  $('wcc-size-normal').addEventListener('change', function () { state.size = 'normal'; render(); });
  $('wcc-size-large').addEventListener('change', function () { state.size = 'large'; render(); });
  $('wcc-target').addEventListener('change', function (e) { state.target = e.target.value; render(); });
  $('wcc-copy').addEventListener('click', function () {
    copyText($('wcc-summary').textContent, '结果摘要已复制');
  });
  $('wcc-reset').addEventListener('click', resetAll);
  for (var i = 0; i < PRESETS.length; i++) {
    (function (idx) {
      $('wcc-preset-' + idx).addEventListener('click', function () { applyPreset(idx); });
    })(i);
  }
}

bind();
syncInputs('fg');
syncInputs('bg');
render();
})();
