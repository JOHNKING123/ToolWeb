/* CSS 加载动画生成器（css_loader_generator）- 纯前端本地计算
 * 7 种参数化 loader 预设：spinner-ring 旋转圆环 / spinner-dots 点跳跃 /
 * bars 柱条跳动 / pulse 脉冲 / grid 格点 / wave-bar 波浪条 /
 * progress-bar 不确定进度条。
 * 纯函数双模式导出：loaderTypes / defaultParams / generateLoaderCSS /
 * generateLoaderHTML / generateLoaderPreview。
 * 失败约定：非法参数抛 Error，err.field 为 "type" 或 "param"，不静默钳制、
 * 不静默取整、不静默截断。
 * 纯函数经 module.exports 暴露供 node 测试；浏览器里走 DOM。
 * 零网络请求：本文件不发起任何网络请求。 */
(function () {
'use strict';

/* ---------- 小工具 ---------- */

/* 带字段名的失败。 */
function fail(field, message) {
  var e = new Error(message);
  e.field = field;
  throw e;
}

/* 6 位 hex：#RRGGBB。 */
function isHex6(v) {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
}

/* 数字：有限且最多 2 位小数。 */
function is2dp(v) {
  return typeof v === 'number' && isFinite(v) &&
    Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;
}

/* 2 位小数去尾零：1.50 -> "1.5"，1 -> "1"。 */
function fmtNum(v) {
  var r = Math.round(Number(v) * 100) / 100;
  if (r === 0) r = 0;
  return String(r);
}

function px(v) { return fmtNum(v) + 'px'; }

/* ---------- loader 类型表（顺序固定，确定性向量逐字命中用） ---------- */

var LOADER_TYPES = [
  'spinner-ring',
  'spinner-dots',
  'bars',
  'pulse',
  'grid',
  'wave-bar',
  'progress-bar'
];

var LOADER_NAMES = {
  'spinner-ring': '旋转圆环',
  'spinner-dots': '点跳跃',
  'bars': '柱条跳动',
  'pulse': '脉冲',
  'grid': '格点',
  'wave-bar': '波浪条',
  'progress-bar': '不确定进度条'
};

/* 每类数量限定：[min, max]。单元素类型固定为 1。 */
var COUNT_LIMITS = {
  'spinner-ring': [1, 1],
  'spinner-dots': [2, 5],
  'bars': [3, 8],
  'pulse': [1, 1],
  'grid': [9, 9],
  'wave-bar': [1, 1],
  'progress-bar': [1, 1]
};

function loaderTypes() {
  return LOADER_TYPES.slice();
}

/* ---------- 参数 ---------- */

function defaultParams(type) {
  if (typeof type !== 'string' || LOADER_TYPES.indexOf(type) === -1) {
    fail('type', '未知 loader 类型：' + type);
  }
  var count = type === 'spinner-dots' ? 3 : type === 'bars' ? 5 :
              type === 'grid' ? 9 : 1;
  var speed = type === 'progress-bar' ? 1.6 : 1;
  return { size: 48, color: '#2563eb', speed: speed, count: count };
}

function validateParams(type, params) {
  if (typeof type !== 'string' || LOADER_TYPES.indexOf(type) === -1) {
    fail('type', '未知 loader 类型：' + type);
  }
  if (!params || typeof params !== 'object') {
    fail('param', '参数必须是对象');
  }
  var size = params.size;
  if (typeof size !== 'number' || !isFinite(size) || !is2dp(size) ||
      size < 16 || size > 128) {
    fail('param', '尺寸 size 必须在 16–128px 范围内（最多 2 位小数）');
  }
  if (!isHex6(params.color)) {
    fail('param', '颜色 color 必须是 6 位 hex（如 #2563eb）');
  }
  var speed = params.speed;
  if (typeof speed !== 'number' || !isFinite(speed) || !is2dp(speed) ||
      speed < 0.4 || speed > 3) {
    fail('param', '速度 speed 必须在 0.4–3s 范围内（最多 2 位小数）');
  }
  var lim = COUNT_LIMITS[type];
  var count = params.count;
  if (typeof count !== 'number' || !isFinite(count) ||
      Math.floor(count) !== count || count < lim[0] || count > lim[1]) {
    fail('param', '数量 count 在 ' + type + ' 下必须为 ' + lim[0] +
      (lim[0] === lim[1] ? '' : '–' + lim[1]) + ' 的整数');
  }
  return {
    type: type,
    size: size,
    color: String(params.color).toLowerCase(),
    speed: speed,
    count: count,
    name: LOADER_NAMES[type]
  };
}

/* ---------- CSS 生成 ---------- */

function cssHeader(p) {
  return '/* ' + p.name + ' · CSS 加载动画生成器 · 复制到项目即可用，零依赖 */';
}

function genSpinnerRing(p) {
  var c = p.color, d = fmtNum(p.speed), s = px(p.size);
  return (
    cssHeader(p) + '\n' +
    '.loader {\n' +
    '  width: ' + s + ';\n' +
    '  height: ' + s + ';\n' +
    '  border: ' + px(p.size / 8) + ' solid ' + c + '22;\n' +
    '  border-top-color: ' + c + ';\n' +
    '  border-radius: 50%;\n' +
    '  animation: spin ' + d + 's linear infinite;\n' +
    '}\n\n' +
    '@keyframes spin {\n' +
    '  to { transform: rotate(360deg); }\n' +
    '}'
  );
}

function genSpinnerDots(p) {
  var c = p.color, d = fmtNum(p.speed), n = p.count;
  var dia = p.size / 3.4, gap = p.size / 10;
  var stagger = fmtNum(p.speed / 6);
  var lines = [cssHeader(p)];
  lines.push('.loader { display: flex; align-items: center; gap: ' + px(gap) + '; }');
  for (var i = 0; i < n; i++) {
    lines.push('');
    lines.push('.loader span:nth-child(' + (i + 1) + ') {');
    lines.push('  width: ' + px(dia) + ';');
    lines.push('  height: ' + px(dia) + ';');
    lines.push('  background: ' + c + ';');
    lines.push('  border-radius: 50%;');
    lines.push('  animation: dot-jump ' + d + 's ease-in-out infinite;');
    lines.push('  animation-delay: ' + fmtNum(i * p.speed / 6) + 's; /* stagger = speed/6 */');
    lines.push('}');
  }
  lines.push('');
  lines.push('@keyframes dot-jump {');
  lines.push('  0%, 100% { transform: translateY(0); opacity: .5; }');
  lines.push('  50% { transform: translateY(' + px(-p.size / 4) + '); opacity: 1; }');
  lines.push('}');
  lines.push('/* stagger = speed/6 = ' + stagger + 's */');
  return lines.join('\n');
}

function genBars(p) {
  var c = p.color, d = fmtNum(p.speed), n = p.count;
  var w = p.size / (n * 2.2), gap = w / 2;
  var lines = [cssHeader(p)];
  lines.push('.loader { display: flex; align-items: flex-end; gap: ' + px(gap) +
    '; height: ' + px(p.size) + '; }');
  for (var i = 0; i < n; i++) {
    lines.push('');
    lines.push('.loader span:nth-child(' + (i + 1) + ') {');
    lines.push('  width: ' + px(w) + ';');
    lines.push('  height: 40%;');
    lines.push('  background: ' + c + ';');
    lines.push('  border-radius: 2px;');
    lines.push('  animation: bar-bounce ' + d + 's ease-in-out infinite;');
    lines.push('  animation-delay: ' + fmtNum(i * p.speed / n) + 's;');
    lines.push('}');
  }
  lines.push('');
  lines.push('@keyframes bar-bounce {');
  lines.push('  0%, 100% { height: 30%; }');
  lines.push('  50% { height: 100%; }');
  lines.push('}');
  return lines.join('\n');
}

function genPulse(p) {
  var c = p.color, d = fmtNum(p.speed), s = px(p.size);
  return (
    cssHeader(p) + '\n' +
    '.loader {\n' +
    '  width: ' + s + ';\n' +
    '  height: ' + s + ';\n' +
    '  background: ' + c + ';\n' +
    '  border-radius: 50%;\n' +
    '  animation: pulse-scale ' + d + 's ease-in-out infinite;\n' +
    '}\n\n' +
    '@keyframes pulse-scale {\n' +
    '  0%, 100% { transform: scale(.55); opacity: .35; }\n' +
    '  50% { transform: scale(1); opacity: 1; }\n' +
    '}'
  );
}

function genGrid(p) {
  var c = p.color, d = fmtNum(p.speed);
  var cell = p.size / 3, dia = cell * 0.62, gap = cell * 0.38;
  var lines = [cssHeader(p)];
  lines.push('.loader { display: grid; grid-template-columns: repeat(3, ' + px(dia) +
    '); gap: ' + px(gap) + '; }');
  lines.push('.loader span {');
  lines.push('  width: ' + px(dia) + ';');
  lines.push('  height: ' + px(dia) + ';');
  lines.push('  background: ' + c + ';');
  lines.push('  border-radius: 50%;');
  lines.push('  animation: grid-blink ' + d + 's ease-in-out infinite;');
  lines.push('}');
  for (var i = 1; i <= 9; i++) {
    var row = Math.floor((i - 1) / 3), col = (i - 1) % 3;
    lines.push('.loader span:nth-child(' + i + ') { animation-delay: ' +
      fmtNum(p.speed * (row + col) / 5) + 's; }');
  }
  lines.push('');
  lines.push('@keyframes grid-blink {');
  lines.push('  0%, 100% { opacity: .2; transform: scale(.8); }');
  lines.push('  50% { opacity: 1; transform: scale(1); }');
  lines.push('}');
  return lines.join('\n');
}

function genWaveBar(p) {
  var c = p.color, d = fmtNum(p.speed);
  var w = p.size, h = p.size / 8;
  return (
    cssHeader(p) + '\n' +
    '.loader {\n' +
    '  width: ' + px(w) + ';\n' +
    '  height: ' + px(h) + ';\n' +
    '  border-radius: ' + px(h / 2) + ';\n' +
    '  background: linear-gradient(90deg, transparent, ' + c + ', transparent);\n' +
    '  background-size: 40% 100%;\n' +
    '  background-repeat: no-repeat;\n' +
    '  animation: wave-sweep ' + d + 's linear infinite;\n' +
    '}\n\n' +
    '@keyframes wave-sweep {\n' +
    '  0% { background-position: -40% 0; }\n' +
    '  100% { background-position: 140% 0; }\n' +
    '}'
  );
}

function genProgressBar(p) {
  var c = p.color, d = fmtNum(p.speed);
  var w = p.size * 2.4, h = p.size / 10;
  return (
    cssHeader(p) + '\n' +
    '.loader {\n' +
    '  position: relative;\n' +
    '  width: ' + px(w) + ';\n' +
    '  height: ' + px(h) + ';\n' +
    '  border-radius: ' + px(h / 2) + ';\n' +
    '  background: ' + c + '22;\n' +
    '  overflow: hidden;\n' +
    '}\n' +
    '.loader::before {\n' +
    '  content: "";\n' +
    '  position: absolute;\n' +
    '  top: 0; left: 0;\n' +
    '  height: 100%;\n' +
    '  width: 40%;\n' +
    '  border-radius: inherit;\n' +
    '  background: ' + c + ';\n' +
    '  animation: progress-indeterminate ' + d + 's ease-in-out infinite;\n' +
    '}\n\n' +
    '@keyframes progress-indeterminate {\n' +
    '  0% { left: -40%; }\n' +
    '  100% { left: 100%; }\n' +
    '}'
  );
}

function generateLoaderCSS(type, params) {
  var p = validateParams(type, params);
  switch (p.type) {
    case 'spinner-ring': return genSpinnerRing(p);
    case 'spinner-dots': return genSpinnerDots(p);
    case 'bars': return genBars(p);
    case 'pulse': return genPulse(p);
    case 'grid': return genGrid(p);
    case 'wave-bar': return genWaveBar(p);
    case 'progress-bar': return genProgressBar(p);
  }
  fail('type', '未知 loader 类型：' + type);
}

/* ---------- HTML 生成 ---------- */

/* spinner-dots / bars / grid 需要 count 个 <span> 子元素；其余为单个容器。 */
var SPAN_TYPES = { 'spinner-dots': true, 'bars': true, 'grid': true };

function generateLoaderHTML(type, params) {
  var p = validateParams(type, params);
  if (SPAN_TYPES[p.type]) {
    var spans = [];
    for (var i = 0; i < p.count; i++) spans.push('  <span></span>');
    return '<div class="loader">\n' + spans.join('\n') + '\n</div>';
  }
  return '<div class="loader"></div>';
}

/* ---------- 预览 ---------- */

function generateLoaderPreview(type, params) {
  var p = validateParams(type, params);
  return {
    css: generateLoaderCSS(p.type, p),
    html: generateLoaderHTML(p.type, p),
    label: p.name
  };
}

/* ---------- 导出：node 下导出纯函数并提前返回，浏览器里继续走 DOM ---------- */

var API = {
  loaderTypes: loaderTypes,
  defaultParams: defaultParams,
  generateLoaderCSS: generateLoaderCSS,
  generateLoaderHTML: generateLoaderHTML,
  generateLoaderPreview: generateLoaderPreview
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = API;
  return;
}
if (typeof window !== 'undefined') window.CssLoaderGenerator = API;

/* ---------------- 浏览器 DOM 逻辑 ---------------- */

/* ---------- 浏览器 UI ---------- */

function $(id) { return document.getElementById(id); }

function toast(msg) {
  var t = $('clg-toast');
  if (!t) return;
  t.textContent = msg;
  t.style.display = 'block';
  clearTimeout(t._h);
  t._h = setTimeout(function () { t.style.display = 'none'; }, 1600);
}

function copyText(text, okMsg) {
  function done() { toast(okMsg); }
  function fallback() {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    done();
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, fallback);
  } else {
    fallback();
  }
}

function downloadFile(name, text) {
  var blob = new Blob([text], { type: 'text/css;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(function () {
    URL.revokeObjectURL(a.href);
    document.body.removeChild(a);
  }, 300);
}

/* 状态 */
var state = {
  type: 'spinner-ring',
  params: defaultParams('spinner-ring'),
  codeTab: 'css',
  dark: false
};

var TYPE_DESC = {
  'spinner-ring': '半透明环＋单色描边旋转',
  'spinner-dots': '圆点依次弹跳，逐项延迟',
  'bars': '柱条按比例延迟起伏',
  'pulse': '单圆缩放＋透明度呼吸',
  'grid': '3×3 网格圆点波浪闪烁',
  'wave-bar': '横条波浪扫过',
  'progress-bar': '不定进度条左右滑动'
};

/* 左栏类型卡片 */
function renderTypeCards() {
  var box = $('clg-types');
  if (!box) return;
  box.innerHTML = '';
  loaderTypes().forEach(function (t) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'clg-type' + (t === state.type ? ' clg-type-active' : '');
    b.setAttribute('data-type', t);
    var nm = document.createElement('b');
    nm.textContent = LOADER_NAMES[t];
    var ds = document.createElement('span');
    ds.textContent = TYPE_DESC[t];
    b.appendChild(nm);
    b.appendChild(ds);
    b.addEventListener('click', function () { setType(t); });
    box.appendChild(b);
  });
}

function setType(type) {
  state.type = type;
  state.params = defaultParams(type);
  syncParamInputs();
  renderTypeCards();
  refresh();
}

/* 参数面板：滑杆＋数值框双向联动 */
function readParams() {
  return {
    size: parseFloat($('clg-size').value),
    color: $('clg-color').value,
    speed: parseFloat($('clg-duration').value),
    count: parseInt($('clg-count').value, 10)
  };
}

function syncParamInputs() {
  var lim = COUNT_LIMITS[state.type];
  var showCount = lim[0] !== lim[1];
  $('clg-count-row').style.display = showCount ? '' : 'none';
  $('clg-size').value = state.params.size;
  $('clg-size-num').value = state.params.size;
  $('clg-duration').value = state.params.speed;
  $('clg-duration-num').value = state.params.speed;
  if (showCount) {
    $('clg-count').min = lim[0];
    $('clg-count').max = lim[1];
    $('clg-count-num').min = lim[0];
    $('clg-count-num').max = lim[1];
    $('clg-count-hint').textContent = '（' + lim[0] + '–' + lim[1] + ' 个）';
  }
  $('clg-count').value = state.params.count;
  $('clg-count-num').value = state.params.count;
  $('clg-color').value = state.params.color;
  $('clg-color-text').value = state.params.color;
}

function refresh() {
  try {
    var css = generateLoaderCSS(state.type, state.params);
    var html = generateLoaderHTML(state.type, state.params);
    var stage = $('clg-stage');
    if (stage) {
      stage.innerHTML = '';
      var st = document.createElement('style');
      st.textContent = css;
      stage.appendChild(st);
      var box = document.createElement('div');
      box.innerHTML = html;
      stage.appendChild(box);
    }
    var codeBox = $('clg-code');
    if (codeBox) {
      codeBox.textContent = state.codeTab === 'css' ? css : html;
    }
    $('clg-err').style.display = 'none';
  } catch (e) {
    var err = $('clg-err');
    err.textContent = '参数错误：' + e.message;
    err.style.display = 'block';
  }
}

function onParamChange() {
  state.params = readParams();
  refresh();
}

function bindPair(rangeId, numId, apply) {
  var r = $(rangeId), n = $(numId);
  if (!r || !n) return;
  r.addEventListener('input', function () { n.value = r.value; apply(); });
  n.addEventListener('input', function () { r.value = n.value; apply(); });
  n.addEventListener('change', function () { syncParamInputs(); apply(); });
}

function init() {
  if (!$('clg-types')) return;
  renderTypeCards();
  syncParamInputs();
  bindPair('clg-size', 'clg-size-num', onParamChange);
  bindPair('clg-duration', 'clg-duration-num', onParamChange);
  bindPair('clg-count', 'clg-count-num', onParamChange);
  $('clg-color').addEventListener('input', function () {
    $('clg-color-text').value = $('clg-color').value;
    onParamChange();
  });
  $('clg-color-text').addEventListener('change', function () {
    var v = $('clg-color-text').value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      $('clg-color').value = v.toLowerCase();
      syncParamInputs();
      onParamChange();
    } else {
      $('clg-err').textContent = '颜色必须是 6 位 hex（如 #2563eb）';
      $('clg-err').style.display = 'block';
    }
  });

  var bgBtn = $('clg-bg-toggle');
  if (bgBtn) {
    bgBtn.addEventListener('click', function () {
      state.dark = !state.dark;
      var w = $('clg-stage-wrap');
      if (w) w.classList.toggle('clg-stage-dark', state.dark);
      bgBtn.textContent = state.dark ? '切换浅色背景' : '切换深色背景';
    });
  }

  var tabCss = $('clg-tab-css'), tabHtml = $('clg-tab-html');
  if (tabCss && tabHtml) {
    tabCss.addEventListener('click', function () {
      state.codeTab = 'css';
      tabCss.classList.add('clg-tab-active');
      tabHtml.classList.remove('clg-tab-active');
      refresh();
    });
    tabHtml.addEventListener('click', function () {
      state.codeTab = 'html';
      tabHtml.classList.add('clg-tab-active');
      tabCss.classList.remove('clg-tab-active');
      refresh();
    });
  }

  var cp = $('clg-copy');
  if (cp) cp.addEventListener('click', function () {
    try {
      var txt = state.codeTab === 'css'
        ? generateLoaderCSS(state.type, state.params)
        : generateLoaderHTML(state.type, state.params);
      copyText(txt, state.codeTab === 'css' ? '已复制 CSS' : '已复制 HTML');
    } catch (e) { toast('参数错误：' + e.message); }
  });
  var dl = $('clg-download');
  if (dl) dl.addEventListener('click', function () {
    try {
      downloadFile('loader.css', generateLoaderCSS(state.type, state.params));
      toast('已下载 loader.css');
    } catch (e) { toast('参数错误：' + e.message); }
  });

  refresh();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
})();
