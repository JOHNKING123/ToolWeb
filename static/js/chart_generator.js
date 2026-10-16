/* 在线图表生成器 - 纯前端 CSV/TSV/Excel 粘贴解析 + 自绘 SVG 图表 + PNG/SVG 导出
 *
 * 流程：①粘贴 CSV/TSV/Excel 复制行（自动识别分隔符，兼容双引号转义）
 * ②解析预览（「首行为表头」可勾选，默认自动识别）
 * ③图表类型切换（柱状图/折线图/饼图/环形图）+ X 轴列与数值列映射（多数值列分组对比）
 * ④标题/副标题/配色主题/网格线/数据标签配置
 * ⑤自绘 SVG 渲染（坐标轴刻度自动计算、图例、响应式），零第三方图表库
 * ⑥高清 PNG 导出（1x/2x/3x）+ SVG 源码一键复制
 * 数据不出浏览器，全程无网络请求。
 * 已知限制：只做「一张表→一张图」轻量路径，不做数据透视。
 * 纯逻辑函数无 DOM，可在 Node 下单测（module.exports 导出）。
 */
(function () {
'use strict';

/* ---------------- 纯逻辑函数（无 DOM，可在 Node 下单测） ---------------- */

var NUM_RE = /^-?\d+(\.\d+)?%?$|^-?\.\d+%?$/;

/* 判断字符串是否为合法数字（整数/小数，允许负号与尾部 %，允许千分位逗号） */
function isNumeric(s) {
  if (s == null) return false;
  var t = String(s).trim().replace(/,/g, '');
  if (t === '' || t === '-' || t === '.') return false;
  return NUM_RE.test(t);
}

/* 解析数字：返回 {value, percent}；"60%" → {value:60, percent:true}（按数字部分取值） */
function parseNumber(s) {
  var t = String(s).trim().replace(/,/g, '');
  var isPct = /%$/.test(t);
  var v = parseFloat(t.replace(/%$/, ''));
  return { value: v, percent: isPct };
}

/* 引号感知的行切分：支持双引号包裹字段与字段内转义双引号（"" → "） */
function splitRow(line, delim) {
  var cells = [], cur = '', inQ = false;
  for (var i = 0; i < line.length; i++) {
    var ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else { inQ = false; }
      } else { cur += ch; }
    } else if (ch === '"') { inQ = true; }
    else if (ch === delim) { cells.push(cur); cur = ''; }
    else { cur += ch; }
  }
  cells.push(cur);
  return cells;
}

/* 自动识别分隔符：取前 5 个非空行，候选 \t , ; |，选列数最多且最稳定者 */
function detectDelimiter(text) {
  var cands = ['\t', ',', ';', '|'];
  var lines = String(text).split(/\r?\n/).filter(function (l) { return l.trim() !== ''; }).slice(0, 5);
  if (!lines.length) return ',';
  var best = ',', bestScore = -1;
  cands.forEach(function (d) {
    var counts = lines.map(function (l) { return splitRow(l, d).length; });
    var sum = counts.reduce(function (a, b) { return a + b; }, 0);
    var avg = sum / counts.length;
    if (avg < 2) return; // 单列不参与
    var dev = counts.reduce(function (a, c) { return a + Math.abs(c - avg); }, 0) / counts.length;
    var score = avg * 10 - dev * 5;
    if (score > bestScore) { bestScore = score; best = d; }
  });
  if (bestScore > 0) return best;
  return text.indexOf('\t') > -1 ? '\t' : ',';
}

/* 表格解析：返回 {cells, delim, colCount, emptySkipped}，空行跳过并计数，列数向最长行看齐补空 */
function parseTable(text) {
  var lines = String(text == null ? '' : text).split(/\r?\n/);
  var nonEmpty = lines.filter(function (l) { return l.replace(/[\s　]+/g, '') !== ''; });
  if (!nonEmpty.length) return { cells: [], delim: ',', colCount: 0, emptySkipped: 0 };
  var delim = detectDelimiter(nonEmpty.join('\n'));
  var cells = [], emptySkipped = 0;
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].replace(/[\s　]+/g, '') === '') { emptySkipped++; continue; }
    cells.push(splitRow(lines[i], delim));
  }
  var colCount = 0;
  cells.forEach(function (r) { if (r.length > colCount) colCount = r.length; });
  cells.forEach(function (r) { while (r.length < colCount) r.push(''); });
  return { cells: cells, delim: delim, colCount: colCount, emptySkipped: emptySkipped };
}

/* 自动识别首行是否为表头：首行数字明显少于次行则判定为表头 */
function guessHasHeader(cells) {
  if (cells.length < 2) return false;
  function numCount(row) {
    var n = 0;
    for (var i = 0; i < row.length; i++) if (isNumeric(row[i])) n++;
    return n;
  }
  var first = numCount(cells[0]), second = numCount(cells[1]);
  return second > 0 && first < second && first <= Math.floor(cells[0].length / 2);
}

/* 切分表头与数据行：返回 {headers, rows} */
function splitHeader(cells, hasHeader) {
  if (!cells.length) return { headers: [], rows: [] };
  var headers, rows;
  if (hasHeader) {
    headers = cells[0].map(function (c, i) { return String(c).trim() === '' ? '列' + (i + 1) : String(c).trim(); });
    rows = cells.slice(1);
  } else {
    headers = cells[0].map(function (_, i) { return '列' + (i + 1); });
    rows = cells;
  }
  return { headers: headers, rows: rows };
}

/* 找出数值列：该列超过一半单元格为数字 */
function findNumericCols(rows, colCount) {
  var out = [];
  for (var c = 0; c < colCount; c++) {
    var n = 0;
    for (var r = 0; r < rows.length; r++) if (isNumeric(rows[r][c])) n++;
    if (rows.length && n > rows.length / 2) out.push(c);
  }
  return out;
}

/* 数字格式化：整数原样，最多 4 位小数去尾零 */
function fmtNum(v) {
  if (!isFinite(v)) return '';
  var r = Math.abs(v) < 1e-12 ? 0 : v;
  return String(parseFloat(r.toFixed(4)));
}

/* 坐标轴刻度自动计算（nice numbers：1/2/5 × 10^n） */
function niceTicks(min, max, maxTicks) {
  maxTicks = maxTicks || 6;
  if (!isFinite(min) || !isFinite(max)) return { lo: 0, hi: 1, step: 0.2, ticks: [0, 0.2, 0.4, 0.6, 0.8, 1] };
  if (min === max) { var d = Math.abs(min) || 1; min -= d; max += d; }
  var span = max - min;
  var rawStep = span / maxTicks;
  var mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  var norm = rawStep / mag, step;
  if (norm < 1.5) step = 1; else if (norm < 3.5) step = 2; else if (norm < 7.5) step = 5; else step = 10;
  step *= mag;
  var lo = Math.floor(min / step) * step;
  var hi = Math.ceil(max / step) * step;
  var dec = 0, ss = String(step);
  if (ss.indexOf('e-') > -1) dec = parseInt(ss.split('e-')[1], 10);
  else if (ss.indexOf('.') > -1) dec = ss.length - ss.indexOf('.') - 1;
  var p = Math.pow(10, dec);
  var ticks = [];
  for (var v = lo; v <= hi + step * 0.5; v += step) ticks.push(Math.round(v * p) / p);
  return { lo: lo, hi: hi, step: step, ticks: ticks };
}

/* XML 转义（SVG 文本/属性用） */
function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* 配色主题 */
var THEMES = {
  blue:    { name: '经典蓝', colors: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'] },
  warm:    { name: '暖阳',   colors: ['#f59e0b', '#ef4444', '#f97316', '#eab308', '#ec4899', '#a855f7', '#14b8a6', '#3b82f6'] },
  fresh:   { name: '清新',   colors: ['#10b981', '#06b6d4', '#84cc16', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899'] },
  morandi: { name: '莫兰迪', colors: ['#8a9a5b', '#c2b280', '#b76e79', '#6e7f80', '#9f8ac0', '#d4a574', '#7b8fa6', '#a8b8a0'] }
};

var SVG_FONT = "system-ui,-apple-system,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif";

function f1(n) { return Math.round(n * 10) / 10; }

/* 截断过长的轴标签 */
function truncLabel(s, n) {
  s = String(s);
  return s.length > n ? s.slice(0, n) + '…' : s;
}

/* 图例行数估算（按字符宽度估算换行） */
function legendRows(names, availW) {
  if (!names.length) return 0;
  var rows = 1, used = 0;
  names.forEach(function (nm) {
    var w = 24 + String(nm).length * 8 + 14;
    if (used + w > availW && used > 0) { rows++; used = 0; }
    used += w;
  });
  return rows;
}

/* 渲染图例（居中多行），返回 {svg, rows} */
function renderLegend(names, colors, cx, y, availW, fontSize) {
  fontSize = fontSize || 12.5;
  var rows = [], cur = [], used = 0;
  names.forEach(function (nm, i) {
    var w = 24 + String(nm).length * 8 + 14;
    if (used + w > availW && cur.length) { rows.push(cur); cur = []; used = 0; }
    cur.push({ name: nm, color: colors[i % colors.length], w: w });
    used += w;
  });
  if (cur.length) rows.push(cur);
  var s = '';
  rows.forEach(function (row, ri) {
    var total = row.reduce(function (a, it) { return a + it.w; }, 0);
    var x = cx - total / 2;
    var yy = y + ri * 24;
    row.forEach(function (it) {
      s += '<rect x="' + f1(x) + '" y="' + f1(yy - 9) + '" width="12" height="12" rx="2.5" fill="' + it.color + '"/>';
      s += '<text x="' + f1(x + 17) + '" y="' + f1(yy + 1) + '" font-size="' + fontSize + '" fill="#374151">' + escapeXml(it.name) + '</text>';
      x += it.w;
    });
  });
  return { svg: s, rows: rows.length };
}

/* 直角坐标系图表（柱状图/折线图）自绘
 * o: {type, title, subtitle, labels, series:[{name, values}], theme, gridlines, dataLabels}
 * 返回 {svg, width, height} */
function renderCartesian(o) {
  var W = 680, ML = 64, MR = 16, MT = 14, MB = 18;
  var theme = THEMES[o.theme] || THEMES.blue;
  var colors = theme.colors;
  var th = 0;
  if (o.title) th += 32;
  if (o.subtitle) th += 20;
  if (th) th += 12;
  var allVals = [];
  o.series.forEach(function (s) { s.values.forEach(function (v) { if (isFinite(v)) allVals.push(v); }); });
  var dMin = allVals.length ? Math.min.apply(null, allVals) : 0;
  var dMax = allVals.length ? Math.max.apply(null, allVals) : 1;
  var lo, hi;
  if (o.type === 'bar') { lo = Math.min(0, dMin); hi = Math.max(0, dMax); }
  else { var pad = (dMax - dMin) * 0.08 || 1; lo = dMin - pad; hi = dMax + pad; }
  var tk = niceTicks(lo, hi, 6);
  var N = o.labels.length, S = o.series.length;
  var leg = legendRows(o.series.map(function (s) { return s.name; }), W - 60);
  var maxLab = 0;
  o.labels.forEach(function (l) { if (String(l).length > maxLab) maxLab = String(l).length; });
  var rotLab = N > 10 || maxLab > 8;
  var xLabH = rotLab ? 58 : 30;
  var plotH = 300;
  var H = MT + th + plotH + xLabH + leg * 26 + MB;
  var plotX0 = ML, plotX1 = W - MR, plotY0 = MT + th, plotY1 = plotY0 + plotH;
  var plotW = plotX1 - plotX0;
  function X(i) { return plotX0 + plotW * (i + 0.5) / N; }
  function Y(v) { return plotY1 - (v - tk.lo) / (tk.hi - tk.lo) * plotH; }

  var s = '';
  // 标题 / 副标题
  var ty = MT + 8;
  if (o.title) { s += '<text x="' + W / 2 + '" y="' + ty + '" text-anchor="middle" font-size="18" font-weight="700" fill="#111827">' + escapeXml(o.title) + '</text>'; ty += 32; }
  if (o.subtitle) { s += '<text x="' + W / 2 + '" y="' + ty + '" text-anchor="middle" font-size="12.5" fill="#6b7280">' + escapeXml(o.subtitle) + '</text>'; ty += 20; }
  // 网格线 + Y 轴刻度
  tk.ticks.forEach(function (t) {
    var y = f1(Y(t));
    var isZero = Math.abs(t) < 1e-12;
    if (o.gridlines && !isZero) s += '<line x1="' + plotX0 + '" y1="' + y + '" x2="' + plotX1 + '" y2="' + y + '" stroke="#e5e7eb" stroke-width="1"/>';
    s += '<text x="' + (plotX0 - 9) + '" y="' + f1(y + 4.5) + '" text-anchor="end" font-size="11.5" fill="#6b7280">' + escapeXml(fmtNum(t)) + '</text>';
  });
  // 坐标轴线
  s += '<line x1="' + plotX0 + '" y1="' + plotY0 + '" x2="' + plotX0 + '" y2="' + plotY1 + '" stroke="#9ca3af" stroke-width="1.2"/>';
  s += '<line x1="' + plotX0 + '" y1="' + plotY1 + '" x2="' + plotX1 + '" y2="' + plotY1 + '" stroke="#9ca3af" stroke-width="1.2"/>';
  // 零线（有负值时加深）
  if (tk.lo < 0 && tk.hi > 0) {
    var zy = f1(Y(0));
    s += '<line x1="' + plotX0 + '" y1="' + zy + '" x2="' + plotX1 + '" y2="' + zy + '" stroke="#6b7280" stroke-width="1" stroke-dasharray="4,3"/>';
  }

  if (o.type === 'bar') {
    var gW = plotW / N;
    var barW = Math.min(gW * 0.72 / S, 46);
    for (var i = 0; i < N; i++) {
      var gx = plotX0 + gW * i;
      for (var j = 0; j < S; j++) {
        var v = o.series[j].values[i];
        if (!isFinite(v)) continue;
        var bx = gx + (gW - barW * S) / 2 + j * barW;
        var y0 = Y(0), y1 = Y(v);
        var top = Math.min(y0, y1), hh = Math.max(Math.abs(y1 - y0), v === 0 ? 0 : 1);
        var col = colors[j % colors.length];
        s += '<rect x="' + f1(bx) + '" y="' + f1(top) + '" width="' + f1(barW) + '" height="' + f1(hh) + '" rx="2" fill="' + col + '"/>';
        if (o.dataLabels && barW >= 13 && hh > 0) {
          var ly = v >= 0 ? top - 6 : top + hh + 13;
          s += '<text x="' + f1(bx + barW / 2) + '" y="' + f1(ly) + '" text-anchor="middle" font-size="11" fill="#374151">' + escapeXml(fmtNum(v)) + '</text>';
        }
      }
    }
  } else { // line
    for (var k = 0; k < S; k++) {
      var col2 = colors[k % colors.length];
      var pts = [];
      for (var m = 0; m < N; m++) {
        var vv = o.series[k].values[m];
        if (isFinite(vv)) pts.push({ x: X(m), y: Y(vv), v: vv });
      }
      if (pts.length > 1) {
        var d = 'M' + pts.map(function (p) { return f1(p.x) + ',' + f1(p.y); }).join(' L');
        s += '<path d="' + d + '" fill="none" stroke="' + col2 + '" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>';
      }
      pts.forEach(function (p) {
        s += '<circle cx="' + f1(p.x) + '" cy="' + f1(p.y) + '" r="3.6" fill="#fff" stroke="' + col2 + '" stroke-width="2.2"/>';
      });
      if (o.dataLabels && N <= 15) {
        pts.forEach(function (p) {
          s += '<text x="' + f1(p.x) + '" y="' + f1(p.y - 10) + '" text-anchor="middle" font-size="11" fill="#374151">' + escapeXml(fmtNum(p.v)) + '</text>';
        });
      }
    }
  }

  // X 轴标签
  for (var n = 0; n < N; n++) {
    var lab = truncLabel(o.labels[n], 12);
    var xx = f1(X(n));
    if (rotLab) {
      s += '<text x="' + xx + '" y="' + (plotY1 + 10) + '" transform="rotate(-28 ' + xx + ' ' + (plotY1 + 10) + ')" text-anchor="end" font-size="11.5" fill="#4b5563">' + escapeXml(lab) + '</text>';
    } else {
      s += '<text x="' + xx + '" y="' + (plotY1 + 21) + '" text-anchor="middle" font-size="11.5" fill="#4b5563">' + escapeXml(lab) + '</text>';
    }
  }

  // 图例
  var legR = renderLegend(o.series.map(function (x) { return x.name; }), colors, W / 2, plotY1 + xLabH + 12, W - 60);
  s += legR.svg;

  var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + f1(H) + '" viewBox="0 0 ' + W + ' ' + f1(H) + '" font-family="' + SVG_FONT + '" style="display:block;width:100%;height:auto;max-width:720px;margin:auto;background:#fff;" role="img" aria-label="' + escapeXml(o.title || '图表') + '">' + s + '</svg>';
  return { svg: svg, width: W, height: H };
}

/* 饼形图（饼图/环形图）自绘
 * o: {type:'pie'|'donut', title, subtitle, labels, series:[{name, values}]（只取首列）, theme, piePercent}
 * 返回 {svg, width, height}；负值/全零通过 error 返回 */
function renderPie(o) {
  var W = 640, MT = 14, MB = 18;
  var theme = THEMES[o.theme] || THEMES.blue;
  var colors = theme.colors;
  var th = 0;
  if (o.title) th += 32;
  if (o.subtitle) th += 20;
  if (th) th += 12;
  var src = o.series[0];
  var pairs = [];
  for (var i = 0; i < o.labels.length; i++) {
    var v = src.values[i];
    if (!isFinite(v)) continue;
    if (v < 0) return { error: '饼图/环形图不支持负值（「' + o.labels[i] + '」=' + fmtNum(v) + '），请切换柱状图或折线图。' };
    if (v === 0) continue;
    pairs.push({ label: o.labels[i], value: v });
  }
  // 超过 12 块：取前 11 + 其余合并为「其他」
  var merged = false;
  if (pairs.length > 12) {
    pairs.sort(function (a, b) { return b.value - a.value; });
    var rest = pairs.slice(11);
    var restSum = rest.reduce(function (a, p) { return a + p.value; }, 0);
    pairs = pairs.slice(0, 11);
    pairs.push({ label: '其他', value: restSum });
    merged = true;
  }
  var total = pairs.reduce(function (a, p) { return a + p.value; }, 0);
  if (!pairs.length || total <= 0) return { error: '数值列没有可绘制的正数（全为 0 或空），请选择其他数值列。' };

  var cx = W / 2, cy = MT + th + 158, R = 148;
  var r0 = o.type === 'donut' ? 80 : 0;
  var s = '';
  var ty = MT + 8;
  if (o.title) { s += '<text x="' + cx + '" y="' + ty + '" text-anchor="middle" font-size="18" font-weight="700" fill="#111827">' + escapeXml(o.title) + '</text>'; ty += 32; }
  if (o.subtitle) { s += '<text x="' + cx + '" y="' + ty + '" text-anchor="middle" font-size="12.5" fill="#6b7280">' + escapeXml(o.subtitle) + '</text>'; ty += 20; }

  var a = -Math.PI / 2;
  pairs.forEach(function (p, i) {
    var frac = p.value / total;
    var a1 = a + frac * Math.PI * 2;
    var col = colors[i % colors.length];
    s += '<path d="' + arcPath(cx, cy, R, r0, a, a1) + '" fill="' + col + '" stroke="#fff" stroke-width="2"/>';
    var mid = (a + a1) / 2;
    if (o.piePercent && frac >= 0.045) {
      var lr = r0 > 0 ? (R + r0) / 2 : R * 0.68;
      var lx = cx + lr * Math.cos(mid), ly = cy + lr * Math.sin(mid);
      var pct = (frac * 100).toFixed(1).replace(/\.0$/, '') + '%';
      s += '<text x="' + f1(lx) + '" y="' + f1(ly + 4.5) + '" text-anchor="middle" font-size="12" font-weight="600" fill="#fff">' + pct + '</text>';
    }
    a = a1;
  });
  // 环形图中心：系列名 + 总计
  if (r0 > 0) {
    s += '<text x="' + cx + '" y="' + f1(cy - 4) + '" text-anchor="middle" font-size="12.5" fill="#6b7280">' + escapeXml(src.name) + '</text>';
    s += '<text x="' + cx + '" y="' + f1(cy + 20) + '" text-anchor="middle" font-size="19" font-weight="700" fill="#111827">' + escapeXml(fmtNum(total)) + '</text>';
  }

  var legNames = pairs.map(function (p) {
    var pct = (p.value / total * 100).toFixed(1).replace(/\.0$/, '') + '%';
    return truncLabel(p.label, 10) + ' ' + pct;
  });
  var legY = cy + R + 30;
  var legR = renderLegend(legNames, colors, cx, legY, W - 60);
  s += legR.svg;
  var H = legY + legR.rows * 24 + MB;
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + f1(H) + '" viewBox="0 0 ' + W + ' ' + f1(H) + '" font-family="' + SVG_FONT + '" style="display:block;width:100%;height:auto;max-width:640px;margin:auto;background:#fff;" role="img" aria-label="' + escapeXml(o.title || '图表') + '">' + s + '</svg>';
  return { svg: svg, width: W, height: H, merged: merged };
}

/* 扇形路径（饼图切片/环形） */
function arcPath(cx, cy, R, r0, a0, a1) {
  var x0 = cx + R * Math.cos(a0), y0 = cy + R * Math.sin(a0);
  var x1 = cx + R * Math.cos(a1), y1 = cy + R * Math.sin(a1);
  var large = (a1 - a0) > Math.PI ? 1 : 0;
  var d = 'M' + f1(x0) + ',' + f1(y0) + ' A' + R + ',' + R + ' 0 ' + large + ' 1 ' + f1(x1) + ',' + f1(y1);
  if (r0 > 0) {
    var x2 = cx + r0 * Math.cos(a1), y2 = cy + r0 * Math.sin(a1);
    var x3 = cx + r0 * Math.cos(a0), y3 = cy + r0 * Math.sin(a0);
    d += ' L' + f1(x2) + ',' + f1(y2) + ' A' + r0 + ',' + r0 + ' 0 ' + large + ' 0 ' + f1(x3) + ',' + f1(y3) + ' Z';
  } else {
    d += ' L' + f1(cx) + ',' + f1(cy) + ' Z';
  }
  return d;
}

/* ---------------- DOM 交互 ---------------- */
if (typeof document === 'undefined') {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      isNumeric: isNumeric, parseNumber: parseNumber, splitRow: splitRow,
      detectDelimiter: detectDelimiter, parseTable: parseTable, guessHasHeader: guessHasHeader,
      splitHeader: splitHeader, findNumericCols: findNumericCols, fmtNum: fmtNum,
      niceTicks: niceTicks, escapeXml: escapeXml, truncLabel: truncLabel,
      legendRows: legendRows, renderCartesian: renderCartesian, renderPie: renderPie,
      arcPath: arcPath, THEMES: THEMES
    };
  }
  return;
}

var $ = function (id) { return document.getElementById(id); };
var els = {
  text: $('cg-text'), sample1: $('cg-sample1'), sample2: $('cg-sample2'), clear: $('cg-clear'),
  hasHeader: $('cg-header'), headerAuto: $('cg-header-auto'),
  statline: $('cg-statline'), err: $('cg-err'), preview: $('cg-preview'),
  typeTabs: document.querySelectorAll('.cg-type-tab'),
  xcol: $('cg-xcol'), vcols: $('cg-vcols'),
  title: $('cg-title'), subtitle: $('cg-subtitle'), theme: $('cg-theme'),
  grid: $('cg-grid'), labels: $('cg-labels'), piepct: $('cg-piepct'),
  chart: $('cg-chart'), warn: $('cg-warn'),
  scale: $('cg-scale'), png: $('cg-png'), svgcopy: $('cg-svgcopy'), copytip: $('cg-copytip')
};

var state = {
  headers: [], rows: [], colCount: 0,
  chartType: 'bar', xCol: 0, valueCols: [],
  lastSvg: '', lastW: 0, lastH: 0
};

var SAMPLE1 = '月份,产品A,产品B,产品C\n1月,120,85,60\n2月,135,92,74\n3月,118,105,88\n4月,150,98,95\n5月,168,112,103\n6月,182,125,118';
var SAMPLE2 = '渠道,占比\n自然搜索,38\n社交媒体,27\n直接访问,18\n广告投放,12\n其他,5';

function showError(msg) {
  if (!msg) { els.err.style.display = 'none'; els.err.textContent = ''; return; }
  els.err.style.display = 'block';
  els.err.textContent = msg;
}

function setStatline(html) {
  els.statline.innerHTML = html || '';
}

/* 解析输入并刷新预览 + 列映射 */
function refreshParsed() {
  showError('');
  var t = parseTable(els.text.value);
  if (!t.cells.length) {
    state.headers = []; state.rows = []; state.colCount = 0;
    els.preview.innerHTML = '';
    setStatline('');
    renderChart();
    return;
  }
  var autoH = guessHasHeader(t.cells);
  els.headerAuto.textContent = autoH ? '（已自动识别为有表头，可手动改）' : '（已自动识别为无表头，可手动改）';
  if (els.hasHeader.dataset.auto !== 'off') els.hasHeader.checked = autoH;
  var sp = splitHeader(t.cells, els.hasHeader.checked);
  state.headers = sp.headers; state.rows = sp.rows; state.colCount = t.colCount;

  var numCols = findNumericCols(state.rows, state.colCount);
  // X 轴列默认：第一个非数值列，否则第 0 列
  var defX = 0;
  for (var c = 0; c < state.colCount; c++) {
    if (numCols.indexOf(c) === -1) { defX = c; break; }
  }
  if (state.xCol == null || state.xCol >= state.colCount) state.xCol = defX;
  // 数值列默认：全部数值列（分组对比）；若无则提示
  if (!state.valueCols.length) state.valueCols = numCols.slice();

  buildMappingUI(numCols);
  renderPreview(t.emptySkipped, numCols);
  renderChart();
}

/* 列映射 UI：X 轴下拉 + 数值列多选 */
function buildMappingUI(numCols) {
  var xh = '';
  for (var c = 0; c < state.colCount; c++) {
    xh += '<option value="' + c + '"' + (c === state.xCol ? ' selected' : '') + '>' + escapeXml(state.headers[c]) + '</option>';
  }
  els.xcol.innerHTML = xh;

  var vh = '';
  for (var k = 0; k < state.colCount; k++) {
    var checked = state.valueCols.indexOf(k) > -1 ? ' checked' : '';
    var isNum = numCols.indexOf(k) > -1;
    vh += '<label class="cg-check"><input type="checkbox" value="' + k + '"' + checked + '>' +
          '<span>' + escapeXml(state.headers[k]) + (isNum ? '' : ' <em>（非数值列）</em>') + '</span></label>';
  }
  els.vcols.innerHTML = vh;
  var boxes = els.vcols.querySelectorAll('input[type=checkbox]');
  for (var b = 0; b < boxes.length; b++) {
    boxes[b].addEventListener('change', function () {
      state.valueCols = [];
      var all = els.vcols.querySelectorAll('input[type=checkbox]');
      for (var q = 0; q < all.length; q++) if (all[q].checked) state.valueCols.push(parseInt(all[q].value, 10));
      renderChart();
    });
  }
}

/* 数据预览表（前 10 行） */
function renderPreview(emptySkipped, numCols) {
  var h = '<div class="cg-table-wrap"><table class="cg-table"><thead><tr>';
  for (var c = 0; c < state.colCount; c++) h += '<th>' + escapeXml(state.headers[c]) + '</th>';
  h += '</tr></thead><tbody>';
  var show = Math.min(state.rows.length, 10);
  for (var r = 0; r < show; r++) {
    h += '<tr>';
    for (var k = 0; k < state.colCount; k++) h += '<td>' + escapeXml(state.rows[r][k]) + '</td>';
    h += '</tr>';
  }
  h += '</tbody></table></div>';
  if (state.rows.length > 10) h += '<div class="cg-hint">共 ' + state.rows.length + ' 行 × ' + state.colCount + ' 列，仅预览前 10 行；图表使用全部数据。</div>';
  els.preview.innerHTML = h;

  var info = '已解析 <b>' + state.rows.length + '</b> 行 × <b>' + state.colCount + '</b> 列';
  if (emptySkipped) info += '（跳过空行 ' + emptySkipped + '）';
  if (numCols.length) info += ' · 数值列：' + numCols.map(function (c) { return escapeXml(state.headers[c]); }).join('、');
  else info += ' · <b style="color:#b91c1c">未识别出数值列</b>，请检查数据';
  setStatline(info);
}

/* 由 state 组装渲染模型并绘图 */
function renderChart() {
  els.warn.innerHTML = '';
  if (!state.rows.length || !state.colCount) {
    els.chart.innerHTML = '<div class="cg-empty">粘贴表格数据后，这里会自动生成图表。<br>点「填入示例数据」可先看效果。</div>';
    els.png.disabled = true; els.svgcopy.disabled = true;
    state.lastSvg = '';
    return;
  }
  if (!state.valueCols.length) {
    showError('请至少勾选一个数值列（数值列用于决定柱子/折线的高度）。');
    els.chart.innerHTML = '';
    els.png.disabled = true; els.svgcopy.disabled = true;
    state.lastSvg = '';
    return;
  }
  var xCol = Math.min(state.xCol, state.colCount - 1);
  var vCols = state.valueCols.filter(function (c) { return c < state.colCount; });
  var labels = state.rows.map(function (r) { return String(r[xCol]).trim() === '' ? '（空）' : String(r[xCol]).trim(); });
  var series = vCols.map(function (c) {
    var vals = state.rows.map(function (r) {
      return isNumeric(r[c]) ? parseNumber(r[c]).value : NaN;
    });
    return { name: state.headers[c], values: vals };
  });
  var skipped = 0;
  series.forEach(function (s) { s.values.forEach(function (v) { if (!isFinite(v)) skipped++; }); });

  var model = {
    type: state.chartType,
    title: els.title.value.trim(),
    subtitle: els.subtitle.value.trim(),
    labels: labels,
    series: series,
    theme: els.theme.value,
    gridlines: els.grid.checked,
    dataLabels: els.labels.checked,
    piePercent: els.piepct.checked
  };

  // 行数上限保护
  var warns = [];
  if ((state.chartType === 'bar' || state.chartType === 'line') && labels.length > 60) {
    var keep = 60;
    model.labels = labels.slice(0, keep);
    model.series = series.map(function (s) { return { name: s.name, values: s.values.slice(0, keep) }; });
    warns.push('数据行超过 60 行，图表仅绘制前 60 行（全部数据仍可复制使用）。');
  }

  var ret;
  if (state.chartType === 'pie' || state.chartType === 'donut') {
    ret = renderPie(model);
    if (vCols.length > 1) warns.push('饼图/环形图只使用第一个数值列「' + series[0].name + '」。');
  } else {
    ret = renderCartesian(model);
  }
  if (ret.error) {
    showError(ret.error);
    els.chart.innerHTML = '';
    els.png.disabled = true; els.svgcopy.disabled = true;
    state.lastSvg = '';
    return;
  }
  if (ret.merged) warns.push('分类超过 12 个，已按数值取前 11 + 其余合并为「其他」。');
  if (skipped) warns.push('数值列中有 ' + skipped + ' 个非数字单元格，已按缺口/跳过处理。');

  els.chart.innerHTML = ret.svg;
  state.lastSvg = ret.svg; state.lastW = ret.width; state.lastH = ret.height;
  els.png.disabled = false; els.svgcopy.disabled = false;
  if (warns.length) {
    els.warn.innerHTML = warns.map(function (w) {
      return '<div class="cg-warnline"><i class="material-icons">info</i><span>' + escapeXml(w) + '</span></div>';
    }).join('');
  }
}

/* PNG 导出：SVG → Image → canvas（白底）→ 指定倍数 → 下载 */
function exportPng() {
  if (!state.lastSvg) return;
  var scale = parseInt(els.scale.value, 10) || 2;
  var btn = els.png;
  btn.disabled = true;
  var orig = btn.innerHTML;
  btn.innerHTML = '<i class="material-icons">hourglass_empty</i> 生成中…';
  try {
    var blob = new Blob([state.lastSvg], { type: 'image/svg+xml;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var img = new Image();
    img.onload = function () {
      try {
        var cw = Math.round(state.lastW * scale), ch = Math.round(state.lastH * scale);
        var cv = document.createElement('canvas');
        cv.width = cw; cv.height = ch;
        var ctx = cv.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, cw, ch);
        ctx.drawImage(img, 0, 0, cw, ch);
        URL.revokeObjectURL(url);
        cv.toBlob(function (b) {
          btn.disabled = false; btn.innerHTML = orig;
          if (!b) { showError('PNG 生成失败，请重试或改用「复制 SVG 源码」。'); return; }
          var a = document.createElement('a');
          a.href = URL.createObjectURL(b);
          a.download = 'chart-' + scale + 'x.png';
          document.body.appendChild(a);
          a.click();
          setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
        }, 'image/png');
      } catch (e) {
        btn.disabled = false; btn.innerHTML = orig;
        showError('PNG 生成失败：' + e.message);
      }
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      btn.disabled = false; btn.innerHTML = orig;
      showError('PNG 生成失败，请重试或改用「复制 SVG 源码」。');
    };
    img.src = url;
  } catch (e) {
    btn.disabled = false; btn.innerHTML = orig;
    showError('PNG 生成失败：' + e.message);
  }
}

/* SVG 源码复制（clipboard API + execCommand 双通道兜底） */
function copySvg() {
  if (!state.lastSvg) return;
  function done(ok) {
    els.copytip.style.display = 'inline';
    els.copytip.textContent = ok ? '已复制 SVG 源码，可粘贴到文本编辑器保存为 .svg 文件。' : '复制失败，请手动全选图表区复制。';
    setTimeout(function () { els.copytip.style.display = 'none'; }, 3500);
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(state.lastSvg).then(function () { done(true); }, function () { fallback(); });
  } else { fallback(); }
  function fallback() {
    try {
      var ta = document.createElement('textarea');
      ta.value = state.lastSvg;
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      ta.remove();
      done(ok);
    } catch (e) { done(false); }
  }
}

/* 事件绑定 */
var debounceTimer = null;
els.text.addEventListener('input', function () {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(refreshParsed, 350);
});
els.sample1.addEventListener('click', function () {
  els.text.value = SAMPLE1;
  els.hasHeader.dataset.auto = '';
  refreshParsed();
});
els.sample2.addEventListener('click', function () {
  els.text.value = SAMPLE2;
  els.hasHeader.dataset.auto = '';
  refreshParsed();
});
els.clear.addEventListener('click', function () {
  els.text.value = '';
  state.xCol = 0; state.valueCols = [];
  els.hasHeader.dataset.auto = '';
  refreshParsed();
});
els.hasHeader.addEventListener('change', function () {
  els.hasHeader.dataset.auto = 'off'; // 用户手动改过后，不再自动覆盖
  state.valueCols = [];
  refreshParsedKeepHeader();
});
function refreshParsedKeepHeader() {
  var t = parseTable(els.text.value);
  if (!t.cells.length) { refreshParsed(); return; }
  var sp = splitHeader(t.cells, els.hasHeader.checked);
  state.headers = sp.headers; state.rows = sp.rows; state.colCount = t.colCount;
  var numCols = findNumericCols(state.rows, state.colCount);
  buildMappingUI(numCols);
  renderPreview(t.emptySkipped, numCols);
  renderChart();
}
els.xcol.addEventListener('change', function () {
  state.xCol = parseInt(els.xcol.value, 10) || 0;
  renderChart();
});
for (var ti = 0; ti < els.typeTabs.length; ti++) {
  (function (tab) {
    tab.addEventListener('click', function () {
      for (var k = 0; k < els.typeTabs.length; k++) els.typeTabs[k].classList.remove('active');
      tab.classList.add('active');
      state.chartType = tab.getAttribute('data-type');
      var isPie = state.chartType === 'pie' || state.chartType === 'donut';
      els.piepct.disabled = !isPie;
      renderChart();
    });
  })(els.typeTabs[ti]);
}
[els.title, els.subtitle].forEach(function (inp) {
  inp.addEventListener('input', function () {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(renderChart, 350);
  });
});
els.theme.addEventListener('change', renderChart);
els.grid.addEventListener('change', renderChart);
els.labels.addEventListener('change', renderChart);
els.piepct.addEventListener('change', renderChart);
els.png.addEventListener('click', exportPng);
els.svgcopy.addEventListener('click', copySvg);

// 初始化：饼图百分比开关默认禁用（柱状图起手）
els.piepct.disabled = true;
renderChart();

})();
