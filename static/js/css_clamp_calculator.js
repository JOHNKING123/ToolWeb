/* CSS clamp 流体尺寸计算器（css_clamp_calculator）- 纯前端本地计算
 * 斜率 vw 系数 = (maxSize - minSize) / (maxViewport - minViewport) × 100；
 * 截距 = minSize - 斜率 × minViewport / 100；
 * 输出 clamp(min, 截距 + 斜率vw, max)，px 版与 rem 版各一条。
 * 纯函数经 module.exports 暴露供 node 测试；浏览器里走 DOM。
 * 零网络请求：本文件不发起任何 fetch / XHR。 */
(function () {
'use strict';

function toNum(v) {
  if (v === null || v === undefined || v === '') return NaN;
  return Number(v);
}

/* 保留 4 位小数、去尾零；-0 归零。 */
function fmt(n) {
  if (!isFinite(n)) return '';
  var r = Math.round(n * 10000) / 10000;
  if (r === 0) r = 0;
  return String(r);
}

/* 校验并计算。input: {minVp, maxVp, minSize, maxSize, unit('px'|'rem'), root}。
 * minSize/maxSize 按 unit 理解；内部一律先换算为 px 再算斜率与截距。 */
function compute(input) {
  var out = { valid: false, errors: [] };
  var minVp = toNum(input.minVp);
  var maxVp = toNum(input.maxVp);
  var minSize = toNum(input.minSize);
  var maxSize = toNum(input.maxSize);
  var root = toNum(input.root);
  var unit = (input.unit === 'rem') ? 'rem' : 'px';
  if (!isFinite(minVp) || minVp <= 0) out.errors.push('最小视口须为大于 0 的数字');
  if (!isFinite(maxVp) || maxVp <= 0) out.errors.push('最大视口须为大于 0 的数字');
  if (!isFinite(minSize) || minSize <= 0) out.errors.push('最小尺寸须为大于 0 的数字');
  if (!isFinite(maxSize) || maxSize <= 0) out.errors.push('最大尺寸须为大于 0 的数字');
  if (!isFinite(root) || root <= 0) out.errors.push('根字号须为大于 0 的数字');
  if (out.errors.length === 0 && maxVp <= minVp) out.errors.push('最大视口须大于最小视口');
  if (out.errors.length === 0 && maxSize <= minSize) out.errors.push('最大尺寸须大于最小尺寸');
  if (out.errors.length > 0) return out;

  var minPx = (unit === 'rem') ? minSize * root : minSize;
  var maxPx = (unit === 'rem') ? maxSize * root : maxSize;
  var slope = (maxPx - minPx) / (maxVp - minVp) * 100;
  var interceptPx = minPx - slope * minVp / 100;
  out.valid = true;
  out.unit = unit;
  out.root = root;
  out.minVp = minVp;
  out.maxVp = maxVp;
  out.minPx = minPx;
  out.maxPx = maxPx;
  out.slope = slope;
  out.interceptPx = interceptPx;
  out.interceptRem = interceptPx / root;
  out.minRem = minPx / root;
  out.maxRem = maxPx / root;
  out.clampPx = 'clamp(' + fmt(minPx) + 'px, ' + fmt(interceptPx) + 'px + ' +
    fmt(slope) + 'vw, ' + fmt(maxPx) + 'px)';
  out.clampRem = 'clamp(' + fmt(out.minRem) + 'rem, ' + fmt(out.interceptRem) + 'rem + ' +
    fmt(slope) + 'vw, ' + fmt(out.maxRem) + 'rem)';
  return out;
}

/* 某视口下的取值（px）：断点外钳制为 min / max，断点内线性插值。
 * 返回 {value, clamped: 'min'|'max'|null}；result 非法时返回 null。 */
function valueAt(result, viewport) {
  if (!result || !result.valid) return null;
  var vp = toNum(viewport);
  if (!isFinite(vp)) return null;
  if (vp <= result.minVp) return { value: result.minPx, clamped: 'min' };
  if (vp >= result.maxVp) return { value: result.maxPx, clamped: 'max' };
  return { value: result.interceptPx + result.slope * vp / 100, clamped: null };
}

/* 断点取值表：固定断点 320 / 375 / 768 / 1024 / 1440。 */
var BREAKPOINTS = [320, 375, 768, 1024, 1440];

function breakpointTable(result) {
  if (!result || !result.valid) return [];
  return BREAKPOINTS.map(function (bp) {
    var v = valueAt(result, bp);
    return {
      viewport: bp,
      valuePx: v.value,
      valueRem: v.value / result.root,
      clamped: v.clamped
    };
  });
}

function clampLabel(clamped) {
  if (clamped === 'min') return '钳制为最小值';
  if (clamped === 'max') return '钳制为最大值';
  return '区间内插值';
}

/* 8 组常用预设：一键载入后可再编辑，页面注明「请按需改写」。 */
var PRESETS = [
  { name: 'H1 标题', minVp: 320, maxVp: 1440, minSize: 28, maxSize: 56, unit: 'px', note: '页面主标题' },
  { name: 'H2 标题', minVp: 320, maxVp: 1440, minSize: 24, maxSize: 40, unit: 'px', note: '章节标题' },
  { name: '正文', minVp: 320, maxVp: 1440, minSize: 16, maxSize: 18, unit: 'px', note: '段落正文字号' },
  { name: '按钮内边距', minVp: 320, maxVp: 1024, minSize: 12, maxSize: 16, unit: 'px', note: '按钮上下内边距' },
  { name: '区块间距', minVp: 320, maxVp: 1440, minSize: 24, maxSize: 64, unit: 'px', note: '区块上下外边距' },
  { name: '卡片间距', minVp: 320, maxVp: 1024, minSize: 16, maxSize: 32, unit: 'px', note: '卡片间隙 gap' },
  { name: '容器最大宽度', minVp: 320, maxVp: 1440, minSize: 320, maxSize: 1200, unit: 'px', note: '内容容器宽度' },
  { name: '段落行高', minVp: 320, maxVp: 1440, minSize: 24, maxSize: 32, unit: 'px', note: '正文行高 line-height' }
];

var api = {
  fmt: fmt, compute: compute, valueAt: valueAt,
  breakpointTable: breakpointTable, clampLabel: clampLabel,
  BREAKPOINTS: BREAKPOINTS, PRESETS: PRESETS
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
} else {
  window.CssClampCalculator = api;
  document.addEventListener('DOMContentLoaded', function () {
    var $ = function (id) { return document.getElementById(id); };
    var inputs = ['ccc-min-vp', 'ccc-max-vp', 'ccc-min-size', 'ccc-max-size', 'ccc-unit', 'ccc-root'];

    function readInput() {
      return {
        minVp: $('ccc-min-vp').value,
        maxVp: $('ccc-max-vp').value,
        minSize: $('ccc-min-size').value,
        maxSize: $('ccc-max-size').value,
        unit: $('ccc-unit').value,
        root: $('ccc-root').value
      };
    }

    function renderTable(result) {
      var rows = breakpointTable(result).map(function (r) {
        return '<tr><td>' + r.viewport + 'px</td><td>' + fmt(r.valuePx) + 'px</td><td>' +
          fmt(r.valueRem) + 'rem</td><td>' + clampLabel(r.clamped) + '</td></tr>';
      }).join('');
      $('ccc-table-body').innerHTML = rows;
    }

    function renderPreview(result) {
      var vp = Number($('ccc-slider').value);
      $('ccc-slider-val').textContent = vp + 'px';
      if (!result) { $('ccc-preview-val').textContent = '—'; return; }
      var v = valueAt(result, vp);
      $('ccc-preview-val').textContent = fmt(v.value) + 'px（' + fmt(v.value / result.root) +
        'rem，' + clampLabel(v.clamped) + '）';
      $('ccc-preview-title').style.fontSize = fmt(v.value) + 'px';
      $('ccc-preview-bar').style.width = fmt(v.value) + 'px';
    }

    var lastResult = null;
    function refresh() {
      var result = compute(readInput());
      lastResult = result.valid ? result : null;
      var errEl = $('ccc-errors');
      if (!result.valid) {
        errEl.textContent = result.errors.join('；') + '。请修正后重新计算，不输出畸形公式。';
        errEl.style.display = 'block';
        $('ccc-slope').textContent = '—';
        $('ccc-intercept').textContent = '—';
        $('ccc-out-px').textContent = '（输入非法，暂无公式）';
        $('ccc-out-rem').textContent = '（输入非法，暂无公式）';
        $('ccc-table-body').innerHTML = '<tr><td colspan="4">输入非法时不生成取值表，请先修正上方错误。</td></tr>';
        $('ccc-copy').disabled = true;
      } else {
        errEl.style.display = 'none';
        $('ccc-slope').textContent = fmt(result.slope) + 'vw（每 100px 视口变化 ' + fmt(result.slope) + 'px）';
        $('ccc-intercept').textContent = fmt(result.interceptPx) + 'px（' + fmt(result.interceptRem) + 'rem）';
        $('ccc-out-px').textContent = result.clampPx;
        $('ccc-out-rem').textContent = result.clampRem;
        renderTable(result);
        $('ccc-copy').disabled = false;
      }
      renderPreview(lastResult);
    }

    function toast(msg) {
      var t = $('ccc-toast');
      t.textContent = msg;
      t.style.display = 'block';
      setTimeout(function () { t.style.display = 'none'; }, 2800);
    }

    inputs.forEach(function (id) {
      $(id).addEventListener('input', refresh);
      $(id).addEventListener('change', refresh);
    });
    $('ccc-slider').addEventListener('input', function () { renderPreview(lastResult); });
    $('ccc-use-window').addEventListener('click', function () {
      var w = window.innerWidth;
      if (w < 320) w = 320;
      if (w > 1440) w = 1440;
      $('ccc-slider').value = w;
      renderPreview(lastResult);
      toast('已取当前窗口宽度 ' + window.innerWidth + 'px（滑杆钳制到 320–1440px）。');
    });
    document.querySelectorAll('[data-preset]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var p = PRESETS[Number(btn.getAttribute('data-preset'))];
        if (!p) return;
        $('ccc-min-vp').value = p.minVp;
        $('ccc-max-vp').value = p.maxVp;
        $('ccc-min-size').value = p.minSize;
        $('ccc-max-size').value = p.maxSize;
        $('ccc-unit').value = p.unit;
        refresh();
        toast('已载入「' + p.name + '」预设，请按需改写后再使用。');
      });
    });
    $('ccc-copy').addEventListener('click', function () {
      if (!lastResult) { toast('没有可复制的公式，请先修正输入。'); return; }
      var text = lastResult.clampPx + '\n' + lastResult.clampRem;
      function fallback() {
        var ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        var ok = false;
        try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
        document.body.removeChild(ta);
        toast(ok ? '已复制 px 版与 rem 版两条公式。' : '复制失败，请手动选中输出区的两条公式复制。');
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          toast('已复制 px 版与 rem 版两条公式。');
        }, fallback);
      } else { fallback(); }
    });
    refresh();
  });
}
})();
