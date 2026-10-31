/* 打印机测试页生成器（printer_test_page）- 纯前端毫米精确测试页引擎
 * 纯函数契约（失败约定沿用家族惯例：非法参数抛 Error，err.field 给出字段名，不静默钳制）：
 * 1) mmToPx(mm) → number
 * - 毫米→CSS 像素（96dpi：1in=25.4mm=96px），结果保留 2 位小数；
 * - mmToPx(100)→377.95；
 * - mm 非有限非负数（非数字/NaN/±Infinity/负数）→ 抛 Error（err.field="mm"）。
 * 2) cmykToRgb(c, m, y, k) → {r, g, b}
 * - 四通道取值 0~100；朴素公式 r=255×(1-c/100)×(1-k/100)（余类推），输出取整 0~255；
 * - cmykToRgb(0,100,100,0)→{r:255,g:0,b:0}；
 * - 任一通道非数字/NaN/±Infinity/超出 0~100 → 抛 Error（err.field="c"/"m"/"y"/"k"，按通道命名）。
 * 3) getPaperSize(spec) → {w, h, label}
 * - spec 大小写不敏感（trim 后比对）："a4"→{w:210,h:297,label:"A4"}；
 * "letter"→{w:215.9,h:279.4,label:"US Letter"}；
 * - 非字符串/空/未知规格 → 抛 Error（err.field="spec"）。
 * 4) buildScaleTicks(lengthMm, stepMm) → number[]
 * - 返回 [0, step, 2*step, …, length]（刻度值保留 2 位小数）；
 * buildScaleTicks(100,10)→[0,10,20,30,40,50,60,70,80,90,100]；
 * - lengthMm 非有限正数 → 抛 Error（err.field="lengthMm"）；
 * - stepMm 非有限正数，或 stepMm > lengthMm → 抛 Error（err.field="stepMm"）。
 * 5) pageSizeCss(paperKey, orientation) → string（@page size 取值，供打印样式动态跟随规格）
 * - paperKey："a4"/"letter"（大小写不敏感）；orientation："portrait"/"landscape"；
 * - pageSizeCss("a4","portrait")→"A4 portrait"；
 * - 非法 paperKey → 抛 Error（err.field="paperKey"）；非法 orientation → 抛 Error（err.field="orientation"）。
 * 6) pngFileName(label, date) → string（PNG 导出文件名）
 * - label 仅接受 "A4" / "Letter"；date 须为合法 Date；
 * - pngFileName("A4", new Date(2026,9,31,23,5,7))→"printer-test-page-A4-20261031-230507.png"；
 * - 非法 label → 抛 Error（err.field="label")；非法 date → 抛 Error（err.field="date"）。
 * 零网络请求：本文件不发起任何 fetch / XHR；绘制全部在本地 canvas 完成。
 */
(function () {
'use strict';

var CSS_DPI = 96;
var MM_PER_INCH = 25.4;

function badParam(field, message) {
  var e = new Error(message);
  e.field = field;
  return e;
}

function round2(v) {
  return Math.round(v * 100) / 100;
}

/* ---------- 1. mmToPx ---------- */
function mmToPx(mm) {
  if (typeof mm !== 'number' || !isFinite(mm) || mm < 0) {
    throw badParam('mm', 'mm 须为有限非负数，实得：' + String(mm));
  }
  return round2(mm / MM_PER_INCH * CSS_DPI);
}

/* ---------- 2. cmykToRgb ---------- */
function channelIn(name, v) {
  if (typeof v !== 'number' || !isFinite(v) || v < 0 || v > 100) {
    throw badParam(name, 'CMYK 通道 ' + name + ' 须为 0~100 的有限数字，实得：' + String(v));
  }
  return v / 100;
}
function cmykToRgb(c, m, y, k) {
  var cn = channelIn('c', c), mn = channelIn('m', m),
      yn = channelIn('y', y), kn = channelIn('k', k);
  return {
    r: Math.round(255 * (1 - cn) * (1 - kn)),
    g: Math.round(255 * (1 - mn) * (1 - kn)),
    b: Math.round(255 * (1 - yn) * (1 - kn))
  };
}
function cmykCss(c, m, y, k) {
  var rgb = cmykToRgb(c, m, y, k);
  return 'rgb(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ')';
}

/* ---------- 3. getPaperSize ---------- */
var PAPER_SIZES = {
  a4:     { w: 210,   h: 297,   label: 'A4' },
  letter: { w: 215.9, h: 279.4, label: 'US Letter' }
};
function getPaperSize(spec) {
  if (typeof spec !== 'string' || !spec.trim()) {
    throw badParam('spec', '纸张规格须为非空字符串（a4/letter），实得：' + String(spec));
  }
  var key = spec.trim().toLowerCase();
  if (!PAPER_SIZES.hasOwnProperty(key)) {
    throw badParam('spec', '未知纸张规格：' + String(spec) + '（仅支持 a4/letter）');
  }
  var s = PAPER_SIZES[key];
  return { w: s.w, h: s.h, label: s.label };
}

/* ---------- 4. buildScaleTicks ---------- */
function buildScaleTicks(lengthMm, stepMm) {
  if (typeof lengthMm !== 'number' || !isFinite(lengthMm) || lengthMm <= 0) {
    throw badParam('lengthMm', '标尺总长须为有限正数（毫米），实得：' + String(lengthMm));
  }
  if (typeof stepMm !== 'number' || !isFinite(stepMm) || stepMm <= 0 || stepMm > lengthMm) {
    throw badParam('stepMm', '刻度步长须为有限正数且不大于总长（毫米），实得：' + String(stepMm));
  }
  var ticks = [];
  var n = Math.floor(lengthMm / stepMm);
  for (var i = 0; i <= n; i++) {
    ticks.push(round2(i * stepMm));
  }
  var last = round2(lengthMm);
  if (ticks[ticks.length - 1] !== last) {
    ticks.push(last);
  }
  return ticks;
}

/* ---------- 5. pageSizeCss ---------- */
var PAGE_SIZE_KEYWORDS = { a4: 'A4', letter: 'letter' };
function pageSizeCss(paperKey, orientation) {
  if (typeof paperKey !== 'string' || !PAGE_SIZE_KEYWORDS.hasOwnProperty(paperKey.trim().toLowerCase())) {
    throw badParam('paperKey', 'paperKey 仅支持 a4/letter，实得：' + String(paperKey));
  }
  if (orientation !== 'portrait' && orientation !== 'landscape') {
    throw badParam('orientation', 'orientation 仅支持 portrait/landscape，实得：' + String(orientation));
  }
  return PAGE_SIZE_KEYWORDS[paperKey.trim().toLowerCase()] + ' ' + orientation;
}

/* ---------- 6. pngFileName ---------- */
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function pngFileName(label, date) {
  if (label !== 'A4' && label !== 'Letter') {
    throw badParam('label', '文件名规格标签仅支持 A4/Letter，实得：' + String(label));
  }
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    throw badParam('date', 'date 须为合法 Date 对象');
  }
  return 'printer-test-page-' + label + '-' +
    date.getFullYear() + pad2(date.getMonth() + 1) + pad2(date.getDate()) + '-' +
    pad2(date.getHours()) + pad2(date.getMinutes()) + pad2(date.getSeconds()) + '.png';
}

/* ================= 浏览器：canvas 绘制与交互 ================= */
if (typeof document !== 'undefined') {
(function () {

var SCALE = 2; /* 背屏 2x，CSS 尺寸仍按 mmToPx 精确对应物理尺寸，打印更锐利 */

function $(id) { return document.getElementById(id); }

function ptToPx(pt) { return pt * CSS_DPI / 72; }

/* 在 canvas 上按毫米精确绘制整张测试页；返回 {cssW, cssH}
 * 约定：函数内所有坐标均为毫米，落笔时一律经 X(mm)=mmToPx(mm) 转 CSS 像素。 */
function drawTestPage(canvas, paperKey, orientation) {
  var size = getPaperSize(paperKey);
  var wMm = orientation === 'landscape' ? size.h : size.w;
  var hMm = orientation === 'landscape' ? size.w : size.h;
  var cssW = mmToPx(wMm), cssH = mmToPx(hMm);
  canvas.width = Math.round(cssW * SCALE);
  canvas.height = Math.round(cssH * SCALE);
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  var ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cssW, cssH);

  var X = mmToPx; /* 毫米→CSS px 的绘图标尺 */
  var M = 10;     /* 页边距（毫米） */
  /* 横向纸张高度不足时启用紧凑排布：只压缩色块高度/行距/段间距，
   * 不动 100mm 标尺、字号 pt 值、细线 pt 值与页边距，保证毫米精确部分不受影响。 */
  var compact = hMm < 250;
  var bh = compact ? 11 : 14;    /* CMYK 100% 色块高 */
  var sh = compact ? 6 : 7;      /* 梯度条块高 */
  var rowH = compact ? 9.5 : 12; /* 梯度条行距 */
  var gh = compact ? 8 : 10;     /* 灰阶块高 */
  var lead = compact ? 1.38 : 1.55;
  var fineGap = compact ? 5.5 : 7;
  var secGap = compact ? 5 : 8;  /* 段落之间距 */

  /* ---- 整页边框对齐框 ---- */
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = X(0.35);
  ctx.strokeRect(X(M), X(M), X(wMm - 2 * M), X(hMm - 2 * M));

  /* ---- 四角定位十字 ---- */
  var corners = [[15, 15], [wMm - 15, 15], [15, hMm - 15], [wMm - 15, hMm - 15]];
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = X(0.4);
  corners.forEach(function (p) {
    var cx = X(p[0]), cy = X(p[1]), arm = X(5);
    ctx.beginPath();
    ctx.moveTo(cx - arm, cy); ctx.lineTo(cx + arm, cy);
    ctx.moveTo(cx, cy - arm); ctx.lineTo(cx, cy + arm);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, X(2.5), 0, Math.PI * 2);
    ctx.stroke();
  });

  /* ---- 标题区 ---- */
  var y = M + 4;
  ctx.fillStyle = '#111111';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '700 ' + X(6) + 'px sans-serif';
  ctx.fillText('打印机测试页', X(M + 2), X(y + 6));
  ctx.font = '400 ' + X(3.2) + 'px sans-serif';
  ctx.fillStyle = '#374151';
  var now = new Date();
  var datestr = now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate());
  ctx.fillText('PRINTER TEST PAGE · ' + size.label + ' ' + size.w + '×' + size.h + 'mm · ' +
    (orientation === 'landscape' ? '横向' : '纵向') + ' · ' + datestr, X(M + 2), X(y + 11));

  /* ---- CMYK 100% 色块 ---- */
  y = y + 11 + secGap * 0.6;
  ctx.font = '600 ' + X(3) + 'px sans-serif';
  ctx.fillStyle = '#111111';
  ctx.fillText('CMYK 四通道 100% 色块', X(M + 2), X(y));
  var chans = [
    { n: 'C', c: 100, m: 0, yv: 0, k: 0 },
    { n: 'M', c: 0, m: 100, yv: 0, k: 0 },
    { n: 'Y', c: 0, m: 0, yv: 100, k: 0 },
    { n: 'K', c: 0, m: 0, yv: 0, k: 100 }
  ];
  var bw = (wMm - 2 * M - 4 - 3 * 4) / 4, bx = M + 2;
  ctx.font = '400 ' + X(2.6) + 'px sans-serif';
  chans.forEach(function (ch) {
    ctx.fillStyle = cmykCss(ch.c, ch.m, ch.yv, ch.k);
    ctx.fillRect(X(bx), X(y + 2), X(bw), X(bh));
    ctx.strokeStyle = '#9ca3af';
    ctx.lineWidth = 1;
    ctx.strokeRect(X(bx), X(y + 2), X(bw), X(bh));
    ctx.fillStyle = '#111111';
    var rgb = cmykToRgb(ch.c, ch.m, ch.yv, ch.k);
    ctx.fillText(ch.n + ' 100%  #' +
      ('0' + rgb.r.toString(16)).slice(-2) + ('0' + rgb.g.toString(16)).slice(-2) +
      ('0' + rgb.b.toString(16)).slice(-2), X(bx), X(y + 2 + bh + 4));
    bx += bw + 4;
  });

  /* ---- CMYK 10 级梯度条 ---- */
  y = y + 2 + bh + 4 + secGap * 0.8;
  ctx.font = '600 ' + X(3) + 'px sans-serif';
  ctx.fillStyle = '#111111';
  ctx.fillText('CMYK 10 级梯度条（10%→100%）', X(M + 2), X(y));
  var sw = 13, sx = M + 10;
  ctx.font = '400 ' + X(2.6) + 'px sans-serif';
  chans.forEach(function (ch, ri) {
    var ry = y + 3 + ri * rowH;
    ctx.fillStyle = '#111111';
    ctx.fillText(ch.n, X(M + 2), X(ry + 5));
    for (var i = 0; i < 10; i++) {
      var v = (i + 1) * 10;
      var cc = ch.n === 'C' ? v : 0, mmv = ch.n === 'M' ? v : 0,
          yyv = ch.n === 'Y' ? v : 0, kkv = ch.n === 'K' ? v : 0;
      ctx.fillStyle = cmykCss(cc, mmv, yyv, kkv);
      ctx.fillRect(X(sx + i * (sw + 1.2)), X(ry), X(sw), X(sh));
      ctx.strokeStyle = '#d1d5db';
      ctx.lineWidth = 1;
      ctx.strokeRect(X(sx + i * (sw + 1.2)), X(ry), X(sw), X(sh));
    }
    ctx.fillStyle = '#6b7280';
    ctx.fillText('10% → 100%', X(sx + 10 * (sw + 1.2) + 2), X(ry + 5));
  });

  /* ---- 20 级灰阶 ---- */
  y = y + 3 + 4 * rowH + secGap * 0.8;
  ctx.font = '600 ' + X(3) + 'px sans-serif';
  ctx.fillStyle = '#111111';
  ctx.fillText('20 级灰阶渐变（K 0%→100%）', X(M + 2), X(y));
  var gw = (wMm - 2 * M - 4) / 20, gx = M + 2;
  for (var g = 0; g < 20; g++) {
    var kv = Math.round(g / 19 * 100);
    ctx.fillStyle = cmykCss(0, 0, 0, kv);
    ctx.fillRect(X(gx + g * gw), X(y + 2), X(gw) + 1, X(gh));
  }
  ctx.strokeStyle = '#9ca3af';
  ctx.lineWidth = 1;
  ctx.strokeRect(X(gx), X(y + 2), X(20 * gw), X(gh));
  ctx.font = '400 ' + X(2.4) + 'px sans-serif';
  ctx.fillStyle = '#6b7280';
  ctx.fillText('K 0%', X(gx), X(y + 2 + gh + 4));
  ctx.fillText('K 100%', X(gx + 20 * gw) - X(12), X(y + 2 + gh + 4));

  /* ---- 中英文多字号文字行 ---- */
  y = y + 2 + gh + 4 + secGap;
  ctx.font = '600 ' + X(3) + 'px sans-serif';
  ctx.fillStyle = '#111111';
  ctx.fillText('中英文多字号文字行', X(M + 2), X(y));
  var sizes = [6, 8, 10, 12, 14, 18];
  var tyPx = X(y + 2); /* px 空间的行光标，避免毫米/像素混算 */
  ctx.fillStyle = '#111111';
  sizes.forEach(function (pt) {
    var px = ptToPx(pt);
    ctx.font = '400 ' + px + 'px sans-serif';
    tyPx += px * lead;
    ctx.fillText(pt + 'pt 打印机测试页 Printer Test Page 0123456789', X(M + 2), tyPx);
  });
  y = tyPx / X(1); /* 回到毫米空间 */

  /* ---- 0.5/1/2pt 细线组 ---- */
  y = y + secGap * 0.8;
  ctx.font = '600 ' + X(3) + 'px sans-serif';
  ctx.fillStyle = '#111111';
  ctx.fillText('细线组（横线 / 竖线）', X(M + 2), X(y));
  var fineSpecs = [0.5, 1, 2];
  var fy = y + 4;
  ctx.font = '400 ' + X(2.6) + 'px sans-serif';
  fineSpecs.forEach(function (pt, fi) {
    var ly = fy + fi * fineGap;
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = ptToPx(pt);
    ctx.beginPath();
    ctx.moveTo(X(M + 2), X(ly));
    ctx.lineTo(X(M + 2 + 70), X(ly));
    ctx.stroke();
    ctx.fillStyle = '#374151';
    ctx.fillText(pt + 'pt 横线', X(M + 2 + 74), X(ly + 1.2));
    var vx = M + 2 + 110 + fi * 14;
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = ptToPx(pt);
    ctx.beginPath();
    ctx.moveTo(X(vx), X(ly - 3));
    ctx.lineTo(X(vx), X(ly + 14));
    ctx.stroke();
  });
  ctx.fillStyle = '#374151';
  ctx.fillText('0.5 / 1 / 2pt 竖线', X(M + 2 + 110 + 3 * 14 + 4), X(fy + 7));

  /* ---- 100mm 精确参考尺 ---- */
  y = fy + 3 * fineGap + secGap;
  ctx.font = '600 ' + X(3) + 'px sans-serif';
  ctx.fillStyle = '#111111';
  ctx.fillText('100mm 精确参考尺（10mm 刻度）', X(M + 2), X(y));
  var ry0 = y + 6, rx0 = M + 2;
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = X(0.3);
  ctx.beginPath();
  ctx.moveTo(X(rx0), X(ry0));
  ctx.lineTo(X(rx0 + 100), X(ry0));
  ctx.stroke();
  var majors = buildScaleTicks(100, 10);
  ctx.font = '400 ' + X(2.6) + 'px sans-serif';
  ctx.fillStyle = '#111111';
  for (var t = 0; t <= 100; t++) {
    var isMajor = majors.indexOf(t) !== -1;
    var th = isMajor ? 4 : 2;
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = isMajor ? X(0.3) : X(0.15);
    ctx.beginPath();
    ctx.moveTo(X(rx0 + t), X(ry0));
    ctx.lineTo(X(rx0 + t), X(ry0 - th));
    ctx.stroke();
    if (isMajor) {
      ctx.fillText(String(t), X(rx0 + t) - (t === 100 ? X(5) : t === 0 ? 0 : X(2.5)), X(ry0 - th - 1.5));
    }
  }
  ctx.fillStyle = '#6b7280';
  ctx.font = '400 ' + X(2.4) + 'px sans-serif';
  ctx.fillText('打印后用直尺核验：0→100 应为精确 100mm（打印对话框须选 100% / 实际大小）',
    X(rx0), X(ry0 + 5));

  /* ---- 页脚 ---- */
  ctx.fillStyle = '#6b7280';
  ctx.font = '400 ' + X(2.6) + 'px sans-serif';
  ctx.fillText('本页仅生成标准测试图案，不诊断打印机硬件故障 · 屏幕显示颜色≠打印颜色',
    X(M + 2), X(hMm - M - 3));

  return { cssW: cssW, cssH: cssH };
}

/* ---------- 打印样式：@page 跟随规格 ---------- */
function syncPageCss(paperKey, orientation) {
  var el = $('ptp-page-css');
  if (el) {
    el.textContent = '@page{size:' + pageSizeCss(paperKey, orientation) + ';margin:0;}';
  }
}

/* ---------- 交互 ---------- */
var canvas = $('ptp-canvas');
var paperSel = $('ptp-paper');
var orientSel = $('ptp-orient');
var msgBox = $('ptp-msg');

function toast(msg, isErr) {
  if (!msgBox) return;
  msgBox.style.display = msg ? 'block' : 'none';
  msgBox.style.color = isErr ? '#b91c1c' : '#166534';
  msgBox.style.background = isErr ? '#fef2f2' : '#f0fdf4';
  msgBox.style.borderColor = isErr ? '#fecaca' : '#bbf7d0';
  msgBox.textContent = msg;
}

function currentOpts() {
  return {
    paperKey: paperSel ? paperSel.value : 'a4',
    orientation: orientSel ? orientSel.value : 'portrait'
  };
}

function render() {
  var o = currentOpts();
  try {
    syncPageCss(o.paperKey, o.orientation);
    drawTestPage(canvas, o.paperKey, o.orientation);
    toast('');
  } catch (e) {
    toast('⚠ ' + (e && e.message ? e.message : e), true);
  }
}

function fileLabelFor(key) {
  return key === 'letter' ? 'Letter' : 'A4';
}

function bindUI() {
  if (paperSel) paperSel.addEventListener('change', render);
  if (orientSel) orientSel.addEventListener('change', render);
  var btnPrint = $('ptp-print-btn');
  if (btnPrint) btnPrint.addEventListener('click', function () { window.print(); });
  var btnPng = $('ptp-png-btn');
  if (btnPng) btnPng.addEventListener('click', function () {
    var o = currentOpts();
    try {
      var name = pngFileName(fileLabelFor(o.paperKey), new Date());
      if (canvas.toBlob) {
        canvas.toBlob(function (blob) {
          if (!blob) { toast('⚠ PNG 导出失败：浏览器不支持 canvas 导出', true); return; }
          var a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = name;
          document.body.appendChild(a);
          a.click();
          setTimeout(function () {
            URL.revokeObjectURL(a.href);
            if (a.parentNode) a.parentNode.removeChild(a);
          }, 500);
          toast('已下载 ' + name);
        }, 'image/png');
      } else {
        var a2 = document.createElement('a');
        a2.href = canvas.toDataURL('image/png');
        a2.download = name;
        document.body.appendChild(a2);
        a2.click();
        document.body.removeChild(a2);
        toast('已下载 ' + name);
      }
    } catch (e) {
      toast('⚠ ' + (e && e.message ? e.message : e), true);
    }
  });
  var btnRedraw = $('ptp-redraw');
  if (btnRedraw) btnRedraw.addEventListener('click', render);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () { bindUI(); render(); });
} else {
  bindUI(); render();
}

})();
}

/* node 测试导出（双模式） */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    mmToPx: mmToPx,
    cmykToRgb: cmykToRgb,
    getPaperSize: getPaperSize,
    buildScaleTicks: buildScaleTicks,
    pageSizeCss: pageSizeCss,
    pngFileName: pngFileName,
    CSS_DPI: CSS_DPI
  };
}
})();
