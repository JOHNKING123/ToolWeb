/* 信封打印助手（envelope_printer）- 纯前端毫米坐标布局
 * 尺寸预设（宽×高，毫米）＋自定义尺寸 → 三区毫米坐标（寄件人区／收件人区／
 * 邮票框）＋@page 打印样式字符串＋测试页网格数据，全部本地计算。
 * 布局规则：寄件人区左 12mm／上 10mm；收件人区左＝宽×0.45／上＝高×0.50；
 * 邮票框右上（右距 10mm／上 10mm／25×20mm 虚线框）；三区超出边界自动收敛。
 * 偏移：全局偏移 X／Y ＋ 收件人区独立偏移 X／Y（步进 0.5mm，范围 −20–+20）
 * 叠加后同时作用于预览与打印；偏移为 0 时不写多余样式（坐标即基准坐标）。
 * 纯函数经 module.exports 暴露供 node 测试；浏览器渲染走 CSS 变量 --pxmm
 * （屏幕为像素／毫米、打印时为 1mm），预览与打印共用同一组毫米坐标。
 * 零网络请求：本文件不发起任何网络请求。 */
(function () {
'use strict';

var PRESETS = [
  { id: '#10', name: '#10', width: 105, height: 241 },
  { id: 'DL', name: 'DL', width: 110, height: 220 },
  { id: 'C5', name: 'C5', width: 162, height: 229 },
  { id: 'C6', name: 'C6', width: 114, height: 162 },
  { id: 'A2', name: 'A2', width: 111, height: 146 },
  { id: 'A6', name: 'A6', width: 121, height: 165 },
  { id: 'A7', name: 'A7', width: 133, height: 184 }
];
var PRESET_MAP = {};
for (var pi = 0; pi < PRESETS.length; pi++) PRESET_MAP[PRESETS[pi].id] = PRESETS[pi];

var SENDER_X = 12, SENDER_Y = 10, SENDER_W = 85, SENDER_H = 34;
var STAMP_RIGHT = 10, STAMP_TOP = 10, STAMP_W = 25, STAMP_H = 20;
var RECIPIENT_X_RATIO = 0.45, RECIPIENT_Y_RATIO = 0.50, RECIPIENT_H = 42;
var CUSTOM_W_MIN = 80, CUSTOM_W_MAX = 400, CUSTOM_H_MIN = 60, CUSTOM_H_MAX = 300;
var OFFSET_MIN = -20, OFFSET_MAX = 20, OFFSET_STEP = 0.5;
var GRID_STEP = 10, CROP_LEN = 8, CROSS_HALF = 10;

function round2(n) { return Math.round(n * 100) / 100; }
function clamp(n, lo, hi) { return n < lo ? lo : (n > hi ? hi : n); }
function trim(s) { return String(s == null ? '' : s).replace(/^\s+|\s+$/g, ''); }
function splitLines(s) {
  var out = [], parts = String(s == null ? '' : s).split(/\r?\n/);
  for (var i = 0; i < parts.length; i++) {
    var t = trim(parts[i]);
    if (t !== '') out.push(t);
  }
  return out;
}
function toNum(v) {
  var n = parseFloat(v);
  return isNaN(n) ? null : n;
}
function snapStep(n) { return Math.round(n / OFFSET_STEP) * OFFSET_STEP; }

/* 尺寸解析：预设直接取表；自定义校验宽 80–400mm、高 60–300mm，超出报错。 */
function resolveSize(presetId, customWidth, customHeight) {
  var errors = [];
  if (presetId !== 'custom') {
    var p = PRESET_MAP[presetId];
    if (!p) errors.push('未知的尺寸预设：' + presetId + '。');
    return { valid: errors.length === 0, errors: errors,
      width: p ? p.width : 0, height: p ? p.height : 0, preset: presetId };
  }
  var w = toNum(customWidth), h = toNum(customHeight);
  if (w === null || h === null) {
    errors.push('自定义尺寸请填写数字：宽 80–400mm、高 60–300mm。');
  } else {
    if (w < CUSTOM_W_MIN || w > CUSTOM_W_MAX)
      errors.push('自定义宽度超出范围：' + w + 'mm，须在 80–400mm 之间。');
    if (h < CUSTOM_H_MIN || h > CUSTOM_H_MAX)
      errors.push('自定义高度超出范围：' + h + 'mm，须在 60–300mm 之间。');
  }
  return { valid: errors.length === 0, errors: errors,
    width: w === null ? 0 : w, height: h === null ? 0 : h, preset: 'custom' };
}

/* 偏移处理：步进 0.5mm 对齐、范围 −20–+20mm，超出收敛并提示（不拦截）。 */
function resolveOffset(v, label, warnings) {
  var n = toNum(v);
  if (n === null) return 0;
  n = snapStep(n);
  var c = clamp(n, OFFSET_MIN, OFFSET_MAX);
  if (c !== n) warnings.push(label + '超出 −20–+20mm，已收敛到 ' + c + 'mm。');
  return c;
}

/* 单区边界收敛：超出信封时收敛到边界内并说明（不拦截）。 */
function clampZone(zone, width, height, label, warnings) {
  var maxX = Math.max(0, width - zone.width);
  var maxY = Math.max(0, height - zone.height);
  var cx = clamp(zone.x, 0, maxX), cy = clamp(zone.y, 0, maxY);
  if (cx !== zone.x || cy !== zone.y)
    warnings.push(label + '区超出信封边界，已收敛到边界内（' + round2(cx) + 'mm, ' + round2(cy) + 'mm）。');
  return { x: round2(cx), y: round2(cy), width: zone.width, height: zone.height };
}

/* 打印样式字符串：@page 尺寸即信封宽高、边距 0。 */
function buildPrintCSS(width, height) {
  return '@page { size: ' + width + 'mm ' + height + 'mm; margin: 0; }';
}

/* 测试页网格数据：10mm 网格线、四角裁切标记、中心十字。 */
function buildTestGrid(width, height) {
  var vLines = [], hLines = [], i;
  for (i = 0; i <= width; i += GRID_STEP) vLines.push(i);
  for (i = 0; i <= height; i += GRID_STEP) hLines.push(i);
  var cx = round2(width / 2), cy = round2(height / 2);
  var crops = [
    { x1: 0, y1: 0, x2: CROP_LEN, y2: 0 }, { x1: 0, y1: 0, x2: 0, y2: CROP_LEN },
    { x1: width, y1: 0, x2: width - CROP_LEN, y2: 0 }, { x1: width, y1: 0, x2: width, y2: CROP_LEN },
    { x1: 0, y1: height, x2: CROP_LEN, y2: height }, { x1: 0, y1: height, x2: 0, y2: height - CROP_LEN },
    { x1: width, y1: height, x2: width - CROP_LEN, y2: height }, { x1: width, y1: height, x2: width, y2: height - CROP_LEN }
  ];
  var cross = [
    { x1: cx - CROSS_HALF, y1: cy, x2: cx + CROSS_HALF, y2: cy },
    { x1: cx, y1: cy - CROSS_HALF, x2: cx, y2: cy + CROSS_HALF }
  ];
  return { vLines: vLines, hLines: hLines, centerX: cx, centerY: cy,
    cropMarks: crops, centerCross: cross };
}

/* 核心布局：输入 {preset, customWidth, customHeight, recipient, sender,
 * globalOffset, recipientOffset}，输出 {三区毫米坐标, 打印样式, warnings}；
 * 空收件人返回错误而非空白布局。 */
function computeLayout(input) {
  input = input || {};
  var errors = [], warnings = [];
  var size = resolveSize(input.preset, input.customWidth, input.customHeight);
  errors = errors.concat(size.errors);
  var width = size.width, height = size.height;

  var recipient = input.recipient || {};
  var sender = input.sender || {};
  var rName = trim(recipient.name), rAddr = splitLines(recipient.address);
  var rPostcode = trim(recipient.postcode);
  if (rName === '' && rAddr.length === 0)
    errors.push('收件人姓名与地址均为空：请填写收件人姓名或地址后再预览／打印。');
  if (rName.length > 50)
    warnings.push('收件人姓名超过 50 字（当前 ' + rName.length + ' 字），超长部分可能超出收件人区，仅提示不拦截。');
  for (var ai = 0; ai < rAddr.length; ai++) {
    if (rAddr[ai].length > 100)
      warnings.push('收件人地址第 ' + (ai + 1) + ' 行超过 100 字，仅提示不拦截。');
  }
  if (size.valid && width < height)
    warnings.push('竖版信封：当前宽度小于高度（' + width + '×' + height + 'mm），请确认进纸方向与打印机信封进纸要求一致。');

  var go = input.globalOffset || {}, ro = input.recipientOffset || {};
  var gx = resolveOffset(go.x, '全局偏移 X', warnings);
  var gy = resolveOffset(go.y, '全局偏移 Y', warnings);
  var rx = resolveOffset(ro.x, '收件人偏移 X', warnings);
  var ry = resolveOffset(ro.y, '收件人偏移 Y', warnings);

  if (errors.length > 0)
    return { valid: false, errors: errors, warnings: warnings, zones: null,
      width: width, height: height, printCSS: '', testGrid: null,
      offsets: { globalX: gx, globalY: gy, recipientX: rx, recipientY: ry } };

  var senderW = Math.min(SENDER_W, width - 24);
  var recX = width * RECIPIENT_X_RATIO + gx + rx;
  var recY = height * RECIPIENT_Y_RATIO + gy + ry;
  var recipientW = Math.max(20, Math.min(95, width - recX - 10));
  var zones = {
    sender: clampZone({ x: SENDER_X + gx, y: SENDER_Y + gy, width: senderW, height: SENDER_H },
      width, height, '寄件人', warnings),
    recipient: clampZone({ x: recX, y: recY, width: recipientW, height: RECIPIENT_H },
      width, height, '收件人', warnings),
    stamp: clampZone({ x: width - STAMP_RIGHT - STAMP_W + gx, y: STAMP_TOP + gy,
        width: STAMP_W, height: STAMP_H }, width, height, '邮票框', warnings)
  };
  return { valid: true, errors: [], warnings: warnings, zones: zones,
    width: width, height: height, printCSS: buildPrintCSS(width, height),
    testGrid: buildTestGrid(width, height),
    offsets: { globalX: gx, globalY: gy, recipientX: rx, recipientY: ry },
    recipient: { name: rName, addressLines: rAddr, postcode: rPostcode },
    sender: { name: trim(sender.name), addressLines: splitLines(sender.address),
      postcode: trim(sender.postcode) } };
}

/* 屏幕预览缩放：按信封宽高比等比缩放，取容器宽／最大高度的较小比例。 */
function previewScale(widthMm, heightMm, maxWPx, maxHPx) {
  if (!widthMm || !heightMm) return 1;
  return round2(Math.min(maxWPx / widthMm, maxHPx / heightMm));
}

/* 三组示例（请按需改写，载入后仍可编辑再预览）。 */
var EXAMPLES = [
  { name: '个人寄信（DL）', preset: 'DL',
    recipient: { name: '王小明', address: '广东省深圳市南山区科技园科苑路88号\n科兴科学园A栋1201室', postcode: '518057' },
    sender: { name: '李华', address: '广东省深圳市福田区福华路123号', postcode: '518000' },
    globalOffset: { x: 0, y: 0 }, recipientOffset: { x: 0, y: 0 } },
  { name: '企业寄件（C5）', preset: 'C5',
    recipient: { name: '深圳市星辰科技有限公司', address: '广东省深圳市宝安区西乡大道456号星辰大厦8楼', postcode: '518102' },
    sender: { name: '深圳市晨光贸易有限公司 行政部', address: '广东省深圳市龙岗区坂田街道吉华路78号', postcode: '518129' },
    globalOffset: { x: 0, y: 0 }, recipientOffset: { x: 0, y: 0 } },
  { name: '自定义小尺寸＋偏移（A6）', preset: 'A6',
    recipient: { name: '陈晨', address: '广东省广州市天河区中山大道西55号', postcode: '510630' },
    sender: { name: '林涛', address: '广东省广州市越秀区东风中路300号', postcode: '510030' },
    globalOffset: { x: 2, y: -1.5 }, recipientOffset: { x: 1, y: 2 } }
];

var api = { PRESETS: PRESETS, EXAMPLES: EXAMPLES, resolveSize: resolveSize,
  resolveOffset: resolveOffset, clampZone: clampZone, buildPrintCSS: buildPrintCSS,
  buildTestGrid: buildTestGrid, computeLayout: computeLayout,
  previewScale: previewScale, splitLines: splitLines };

if (typeof module !== 'undefined' && module.exports) module.exports = api;

/* ---------------- 浏览器渲染（node 下不执行） ---------------- */
if (typeof document !== 'undefined') {
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function linesHtml(lines) {
    var out = '';
    for (var i = 0; i < lines.length; i++) out += '<div>' + esc(lines[i]) + '</div>';
    return out;
  }
  function zoneVars(z) {
    return '--zx:' + z.x + ';--zy:' + z.y + ';--zw:' + z.width + ';--zh:' + z.height + ';';
  }
  function testSvg(grid, width, height) {
    var s = '<svg class="ep-test-svg" viewBox="0 0 ' + width + ' ' + height +
      '" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">';
    var i;
    for (i = 0; i < grid.vLines.length; i++)
      s += '<line x1="' + grid.vLines[i] + '" y1="0" x2="' + grid.vLines[i] +
        '" y2="' + height + '" class="ep-grid-line"/>';
    for (i = 0; i < grid.hLines.length; i++)
      s += '<line x1="0" y1="' + grid.hLines[i] + '" x2="' + width +
        '" y2="' + grid.hLines[i] + '" class="ep-grid-line"/>';
    for (i = 0; i < grid.cropMarks.length; i++) {
      var c = grid.cropMarks[i];
      s += '<line x1="' + c.x1 + '" y1="' + c.y1 + '" x2="' + c.x2 + '" y2="' + c.y2 + '" class="ep-crop-line"/>';
    }
    for (i = 0; i < grid.centerCross.length; i++) {
      var cr = grid.centerCross[i];
      s += '<line x1="' + cr.x1 + '" y1="' + cr.y1 + '" x2="' + cr.x2 + '" y2="' + cr.y2 + '" class="ep-cross-line"/>';
    }
    s += '<text x="' + (width / 2) + '" y="15" text-anchor="middle" class="ep-test-note">' +
      '测试页：先打印本页，量取横／纵偏差后填入偏移</text></svg>';
    return s;
  }

  document.addEventListener('DOMContentLoaded', function () {
    var $ = function (id) { return document.getElementById(id); };
    var els = { rName: $('ep-r-name'), rAddr: $('ep-r-addr'), rPost: $('ep-r-post'),
      sName: $('ep-s-name'), sAddr: $('ep-s-addr'), sPost: $('ep-s-post'),
      preset: $('ep-preset'), cw: $('ep-cw'), ch: $('ep-ch'), customBox: $('ep-custom-box'),
      gx: $('ep-gx'), gy: $('ep-gy'), rx: $('ep-rx'), ry: $('ep-ry'),
      errors: $('ep-errors'), warnings: $('ep-warnings'), info: $('ep-info'),
      envelope: $('ep-envelope'), modeNote: $('ep-mode-note'),
      pageStyle: $('ep-page-style') };
    if (!els.envelope) return;
    var mode = 'preview'; /* preview | test */
    var current = null;

    function readInput() {
      return { preset: els.preset.value, customWidth: els.cw.value, customHeight: els.ch.value,
        recipient: { name: els.rName.value, address: els.rAddr.value, postcode: els.rPost.value },
        sender: { name: els.sName.value, address: els.sAddr.value, postcode: els.sPost.value },
        globalOffset: { x: els.gx.value, y: els.gy.value },
        recipientOffset: { x: els.rx.value, y: els.ry.value } };
    }
    function showMsg(box, list) {
      if (!list || list.length === 0) { box.style.display = 'none'; box.innerHTML = ''; return; }
      var html = '';
      for (var i = 0; i < list.length; i++) html += '<div>' + esc(list[i]) + '</div>';
      box.innerHTML = html; box.style.display = 'block';
    }
    function render() {
      current = computeLayout(readInput());
      showMsg(els.errors, current.errors);
      showMsg(els.warnings, current.warnings);
      els.customBox.style.display = els.preset.value === 'custom' ? 'block' : 'none';
      if (!current.valid) {
        els.envelope.style.display = 'none';
        els.info.textContent = '请修正上方错误后再预览／打印。';
        els.pageStyle.textContent = '';
        return;
      }
      els.pageStyle.textContent = current.printCSS;
      var wrap = $('ep-preview-wrap');
      var maxW = wrap ? Math.max(280, wrap.clientWidth - 32) : 640;
      var pxmm = previewScale(current.width, current.height, maxW, 520);
      var env = els.envelope;
      env.style.display = 'block';
      env.style.setProperty('--ew', current.width);
      env.style.setProperty('--eh', current.height);
      env.style.setProperty('--pxmm', pxmm + 'px');
      var z = current.zones;
      if (mode === 'test') {
        env.innerHTML = testSvg(current.testGrid, current.width, current.height);
        els.modeNote.textContent = '测试页模式：与信封同尺寸（' + current.width + '×' + current.height +
          'mm），含 10mm 网格、四角裁切标记与中心十字。先打测试页，量取横／纵偏差后填入上方偏移，再正式打印。';
      } else {
        var senderEmpty = current.sender.name === '' && current.sender.addressLines.length === 0 &&
          current.sender.postcode === '';
        var senderHtml = senderEmpty ? '' :
          '<div class="ep-zone ep-zone-sender" style="' + zoneVars(z.sender) + '">' +
          (current.sender.name ? '<div class="ep-zone-name">' + esc(current.sender.name) + '</div>' : '') +
          linesHtml(current.sender.addressLines) +
          (current.sender.postcode ? '<div>' + esc(current.sender.postcode) + '</div>' : '') + '</div>';
        env.innerHTML = senderHtml +
          '<div class="ep-zone ep-zone-recipient" style="' + zoneVars(z.recipient) + '">' +
          '<div class="ep-zone-name">' + esc(current.recipient.name) + '</div>' +
          linesHtml(current.recipient.addressLines) +
          (current.recipient.postcode ? '<div>' + esc(current.recipient.postcode) + '</div>' : '') + '</div>' +
          '<div class="ep-zone ep-zone-stamp" style="' + zoneVars(z.stamp) + '">贴邮票处</div>';
        els.modeNote.textContent = '预览模式：屏幕按比例缩放仅示意位置关系，毫米数值以打印样式与测试页为准；正式打印前请先打测试页核对。';
      }
      els.info.textContent = '信封 ' + current.width + '×' + current.height + 'mm（宽×高）｜寄件人区（' +
        z.sender.x + 'mm, ' + z.sender.y + 'mm）｜收件人区（' + z.recipient.x + 'mm, ' + z.recipient.y +
        'mm）｜邮票框（' + z.stamp.x + 'mm, ' + z.stamp.y + 'mm）｜全局偏移（' +
        current.offsets.globalX + 'mm, ' + current.offsets.globalY + 'mm）｜收件人偏移（' +
        current.offsets.recipientX + 'mm, ' + current.offsets.recipientY + 'mm）。';
    }
    function setMode(m) {
      mode = m;
      var pb = $('ep-mode-preview'), tb = $('ep-mode-test');
      if (pb) pb.className = 'ep-btn' + (m === 'preview' ? ' ep-btn-primary' : '');
      if (tb) tb.className = 'ep-btn' + (m === 'test' ? ' ep-btn-primary' : '');
      render();
    }
    ['input', 'change'].forEach(function (ev) {
      ['rName', 'rAddr', 'rPost', 'sName', 'sAddr', 'sPost', 'preset', 'cw', 'ch',
       'gx', 'gy', 'rx', 'ry'].forEach(function (k) {
        if (els[k]) els[k].addEventListener(ev, render);
      });
    });
    var pb = $('ep-mode-preview'), tb = $('ep-mode-test');
    if (pb) pb.addEventListener('click', function () { setMode('preview'); });
    if (tb) tb.addEventListener('click', function () { setMode('test'); });
    var printBtn = $('ep-print');
    if (printBtn) printBtn.addEventListener('click', function () {
      render();
      if (!current || !current.valid) return;
      window.print();
    });
    document.querySelectorAll('[data-example]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var ex = EXAMPLES[parseInt(btn.getAttribute('data-example'), 10)];
        if (!ex) return;
        els.preset.value = ex.preset;
        els.rName.value = ex.recipient.name; els.rAddr.value = ex.recipient.address; els.rPost.value = ex.recipient.postcode;
        els.sName.value = ex.sender.name; els.sAddr.value = ex.sender.address; els.sPost.value = ex.sender.postcode;
        els.gx.value = ex.globalOffset.x; els.gy.value = ex.globalOffset.y;
        els.rx.value = ex.recipientOffset.x; els.ry.value = ex.recipientOffset.y;
        render();
      });
    });
    render();
  });
}
})();
