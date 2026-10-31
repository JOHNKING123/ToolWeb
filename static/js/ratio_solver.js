/* 比例求解器（ratio_solver）- a:b=c:d 交叉相乘求解，纯前端本地计算
 * 纯函数契约（失败约定沿用家族惯例：非法参数抛 Error，err.field 给出字段名，不静默钳制）：
 *   solveRatio(a,b,c,d[,precision]) -> {a,b,c,d} 完整四项（求解项允许 null/undefined/空串，
 *     恰空一项；多空/零空/非数字/除零抛 Error，err.field 指向缺失或非法字段）
 *   simplifyRatio(a,b) -> "x:y" 最简整数比（GCD 约分；a/b 非正整数抛 Error）
 *   parseRatio(text) -> {a,b}（解析 "16:9"/"16 : 9"/"16：9"；非法格式抛 Error，err.field="input"）
 *   PRESETS 常量表（预设名 -> a:b，供界面按钮与向量断言）
 *   toFraction(n[,precision]) -> 约分分数串（小数显示用）
 * 精度默认 4 位小数；浏览器里走 DOM，即时计算（debounce）+ 一键复制。
 * 零网络请求：本文件不发起任何 fetch / XHR。 */
(function () {
'use strict';

var FIELDS = ['a', 'b', 'c', 'd'];
var PRECISION_DEFAULT = 4;

/* ---------- 常用比例预设（② 预设均为近似值，页面与真限制条明示） ---------- */
var PRESETS = [
  { id: '16:9',    label: '16 : 9',          a: 16,   b: 9,      desc: '宽屏 / 视频' },
  { id: '4:3',     label: '4 : 3',           a: 4,    b: 3,      desc: '传统屏幕 / 老照片' },
  { id: '1:1',     label: '1 : 1',           a: 1,    b: 1,      desc: '正方形' },
  { id: '3:2',     label: '3 : 2',           a: 3,    b: 2,      desc: '单反照片' },
  { id: 'A4',      label: 'A4 · 1 : √2',     a: 1,    b: 1.4142, desc: 'A4 纸（近似 1:1.4142）' },
  { id: 'golden',  label: '黄金比例 1 : 1.618', a: 1, b: 1.618,  desc: '黄金比例（近似 1.618）' }
];

/* ---------- 内部工具 ---------- */
function isBlank(v) {
  return v === null || v === undefined ||
    (typeof v === 'string' && v.replace(/^\s+|\s+$/g, '') === '');
}

function fail(field, msg) {
  var e = new Error(msg);
  e.field = field;
  throw e;
}

/* gcd：欧几里得算法，输入整数（负数取绝对值）。 */
function gcd(x, y) {
  x = Math.abs(Math.round(x));
  y = Math.abs(Math.round(y));
  while (y !== 0) { var t = x % y; x = y; y = t; }
  return x;
}

function toNum(v, field) {
  if (isBlank(v)) fail(field, '求解项不能为空');
  var n = Number(v);
  if (!isFinite(n)) fail(field, '不是有效数字');
  return n;
}

function roundTo(n, precision) {
  var p = Math.pow(10, precision);
  var r = Math.round(n * p) / p;
  /* 干掉 -0 这种显示噪音。 */
  return r === 0 ? 0 : r;
}

/* ---------- solveRatio：交叉相乘求解 ad=bc ---------- */
/* 恰空一项为求解项。a 缺 => a=b*c/d；b 缺 => b=a*d/c；c 缺 => c=a*d/b；d 缺 => d=b*c/a。
 * 分母（已知项中作除数的那一个）为 0 => 抛 Error，err.field 为该分母字段。 */
function solveRatio(a, b, c, d, precision) {
  if (precision === undefined || precision === null) precision = PRECISION_DEFAULT;
  precision = Math.max(0, Math.min(12, Math.round(Number(precision) || 0)));
  var vals = { a: a, b: b, c: c, d: d };
  var missing = FIELDS.filter(function (f) { return isBlank(vals[f]); });
  if (missing.length > 1) fail(missing[0], '一次只能求解一项：空出了 ' + missing.length + ' 项');
  if (missing.length === 0) fail('solve', '四项都已填写：请把求解项留空（或点「设为求解项」）');
  var target = missing[0];
  var v = {};
  FIELDS.forEach(function (f) {
    if (f !== target) v[f] = toNum(vals[f], f);
  });
  var num, den, denField;
  if (target === 'a') { num = v.b * v.c; den = v.d; denField = 'd'; }
  else if (target === 'b') { num = v.a * v.d; den = v.c; denField = 'c'; }
  else if (target === 'c') { num = v.a * v.d; den = v.b; denField = 'b'; }
  else { num = v.b * v.c; den = v.a; denField = 'a'; }
  if (den === 0) fail(denField, '除数为 0：' + denField + ' 不能为 0（ad=bc 交叉相乘要求已知分母非零）');
  var solved = roundTo(num / den, precision);
  var out = { a: v.a, b: v.b, c: v.c, d: v.d };
  out[target] = solved;
  return out;
}

/* ---------- simplifyRatio：GCD 化简最简整数比 ---------- */
function simplifyRatio(a, b) {
  var na = isBlank(a) ? NaN : Number(a);
  var nb = isBlank(b) ? NaN : Number(b);
  if (!isFinite(na)) fail('a', 'a 不是有效数字');
  if (!isFinite(nb)) fail('b', 'b 不是有效数字');
  if (na <= 0) fail('a', 'a 必须为正数（当前 ' + na + '）');
  if (nb <= 0) fail('b', 'b 必须为正数（当前 ' + nb + '）');
  if (Math.round(na) !== na) fail('a', 'a 必须为整数（化简只接受整数比）');
  if (Math.round(nb) !== nb) fail('b', 'b 必须为整数（化简只接受整数比）');
  var g = gcd(na, nb);
  return (na / g) + ':' + (nb / g);
}

/* ---------- parseRatio：解析 "16:9" 文本 ---------- */
function parseRatio(text) {
  if (isBlank(text)) fail('input', '输入为空：请输入形如 16:9 的比例');
  var s = String(text).replace(/^\s+|\s+$/g, '');
  var parts = s.split(/[:：]/);
  if (parts.length !== 2) fail('input', '格式应为 a:b，如 16:9');
  var ra = parts[0].replace(/^\s+|\s+$/g, '');
  var rb = parts[1].replace(/^\s+|\s+$/g, '');
  var a = Number(ra), b = Number(rb);
  if (ra === '' || rb === '' || !isFinite(a) || !isFinite(b)) {
    fail('input', 'a:b 两项都必须是数字，如 16:9');
  }
  return { a: a, b: b };
}

/* ---------- toFraction：小数 -> 约分分数串 ---------- */
function toFraction(n, precision) {
  if (precision === undefined || precision === null) precision = PRECISION_DEFAULT;
  if (!isFinite(n)) fail('input', '不是有效数字');
  var p = Math.max(0, Math.min(12, Math.round(Number(precision) || 0)));
  var scale = Math.pow(10, p);
  var num = Math.round(n * scale);
  var g = gcd(num, scale);
  var rn = num / g, rd = scale / g;
  if (rd === 1) return String(rn);
  return rn + '/' + rd;
}

/* ---------- 浏览器 UI ---------- */
function fmtNum(n, precision) {
  /* 整数原样显示；小数按精度去尾零。 */
  if (!isFinite(n)) return '—';
  if (Math.round(n) === n && Math.abs(n) < 1e15) return String(Math.round(n));
  var s = roundTo(n, precision).toFixed(precision);
  return s.replace(/\.?0+$/, '');
}

function $(id) { return document.getElementById(id); }

function init() {
  var inputs = { a: $('rs-a'), b: $('rs-b'), c: $('rs-c'), d: $('rs-d') };
  if (!inputs.a) return; /* node 环境无 DOM，直接跳过。 */
  var marks = { a: $('rs-ma'), b: $('rs-mb'), c: $('rs-mc'), d: $('rs-md') };
  var solveTarget = 'd';
  var precisionSel = $('rs-precision');
  var resultBox = $('rs-result'), errBox = $('rs-error'), statusBox = $('rs-status');
  var timer = null;

  function setTarget(f) {
    solveTarget = f;
    FIELDS.forEach(function (k) {
      marks[k].classList.toggle('on', k === f);
      marks[k].setAttribute('aria-pressed', k === f ? 'true' : 'false');
      inputs[k].classList.toggle('rs-solving', k === f);
      inputs[k].placeholder = (k === f) ? '求解项' : '';
    });
    schedule();
  }

  function currentInputs() {
    return {
      a: solveTarget === 'a' ? null : inputs.a.value,
      b: solveTarget === 'b' ? null : inputs.b.value,
      c: solveTarget === 'c' ? null : inputs.c.value,
      d: solveTarget === 'd' ? null : inputs.d.value
    };
  }

  function solveText(inp) {
    return solveRatio(inp.a, inp.b, inp.c, inp.d, Number(precisionSel.value));
  }

  function render() {
    errBox.style.display = 'none';
    var inp = currentInputs();
    /* 已知三项没填完则只出提示，不报错打断输入。 */
    var known = FIELDS.filter(function (f) { return f !== solveTarget && !isBlank(inp[f]); });
    if (known.length < 3) {
      resultBox.style.display = 'none';
      statusBox.textContent = '填入已知的三项（或点预设 / 示例一键填入），结果实时算出';
      return;
    }
    try {
      var r = solveText(inp);
      var solved = r[solveTarget];
      var prec = Number(precisionSel.value);
      var fr = toFraction(solved, prec);
      /* 最简整数比：对 a:b 取整后化简（用户多为整数场景）。 */
      var simple = '';
      try { simple = simplifyRatio(Math.round(r.a), Math.round(r.b)); } catch (e) { simple = ''; }
      var names = { a: 'a', b: 'b', c: 'c', d: 'd' };
      var expr = '交叉相乘 ad=bc → ' + names[solveTarget] + ' = ' +
        (solveTarget === 'a' ? 'b×c ÷ d' : solveTarget === 'b' ? 'a×d ÷ c' : solveTarget === 'c' ? 'a×d ÷ b' : 'b×c ÷ a');
      resultBox.style.display = '';
      $('rs-r-dec').textContent = fmtNum(solved, prec);
      $('rs-r-frac').textContent = fr + (fr === String(Math.round(solved)) ? '' : ' ≈ ' + fmtNum(solved, prec));
      $('rs-r-simple').textContent = simple || '—（非整数比）';
      $('rs-r-expr').textContent = expr + ' = ' + fmtNum(r.a, prec) + ' : ' + fmtNum(r.b, prec) +
        ' = ' + fmtNum(r.c, prec) + ' : ' + fmtNum(r.d, prec);
      statusBox.textContent = '已求出 ' + names[solveTarget] + ' = ' + fmtNum(solved, prec);
      resultBox.dataset.copy = names[solveTarget] + ' = ' + fmtNum(solved, prec) +
        '（' + fr + '；最简比 ' + (simple || '—') + '）';
    } catch (e) {
      resultBox.style.display = 'none';
      errBox.style.display = '';
      errBox.textContent = e.message || '计算出错';
      statusBox.textContent = '';
    }
  }

  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(render, 180);
  }

  /* 预设按钮。 */
  var presetBox = $('rs-presets');
  PRESETS.forEach(function (p) {
    var el = document.createElement('button');
    el.type = 'button';
    el.className = 'rs-preset';
    el.innerHTML = '<b>' + p.label + '</b><small>' + p.desc + '</small>';
    el.title = '填入 a:b = ' + p.a + ' : ' + p.b;
    el.addEventListener('click', function () {
      inputs.a.value = String(p.a);
      inputs.b.value = String(p.b);
      inputs.a.focus();
      schedule();
    });
    presetBox.appendChild(el);
  });

  FIELDS.forEach(function (f) {
    marks[f].addEventListener('click', function () { setTarget(f); });
    inputs[f].addEventListener('input', schedule);
  });
  precisionSel.addEventListener('change', render);

  /* 示例一键填充：配方 / 设计图。 */
  $('rs-ex-a').addEventListener('click', function () {
    /* 配方：已知比例 a:b=3:4，糖（d 项）500g → 求面粉（c 项）。 */
    inputs.a.value = '3'; inputs.b.value = '4';
    inputs.c.value = ''; inputs.d.value = '500';
    setTarget('c');
    statusBox.textContent = '示例已填入：比例 3 : 4，糖 500g，求面粉';
  });
  $('rs-ex-b').addEventListener('click', function () {
    /* 设计图：16:9，宽 1080 → 求高。 */
    inputs.a.value = '16'; inputs.b.value = '9';
    inputs.c.value = '1080'; inputs.d.value = '';
    setTarget('d');
    statusBox.textContent = '示例已填入：16 : 9，宽 1080，求高';
  });

  /* 一键复制。 */
  $('rs-copy').addEventListener('click', function () {
    var txt = resultBox.dataset.copy || '';
    if (!txt) { statusBox.textContent = '暂无结果可复制'; return; }
    function done() { statusBox.textContent = '结果已复制到剪贴板'; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(done, function () { fallbackCopy(txt); done(); });
    } else { fallbackCopy(txt); done(); }
  });
  function fallbackCopy(txt) {
    var ta = document.createElement('textarea');
    ta.value = txt;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* 忽略 */ }
    document.body.removeChild(ta);
  }

  setTarget('d');
}

if (typeof document !== 'undefined' && document.readyState) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    FIELDS: FIELDS,
    PRECISION_DEFAULT: PRECISION_DEFAULT,
    PRESETS: PRESETS,
    gcd: gcd,
    solveRatio: solveRatio,
    simplifyRatio: simplifyRatio,
    parseRatio: parseRatio,
    toFraction: toFraction
  };
}
})();
