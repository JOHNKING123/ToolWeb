/* 成绩统计分析 - 纯前端本地分数统计工具
 *
 * 流程：①逐行输入（每行一个分数，也认「姓名 分数」格式取最后一个数字）
 * ②或上传 CSV（FileReader 本地解析，多列取每行最后一个数字，首行无数字视为表头跳过）
 * → 解析：空行与非数字行自动跳过并计数 → 参数：及格线（默认60）/优秀线（默认90，要求优秀线>及格线）
 * → 统计：人数/平均分/最高/最低/中位数/及格率/优秀率/五档人数+占比
 * → 可视化：自绘 SVG 分数段柱状图（零依赖，随参数实时重算）
 * → 导出：统计结果 CSV 下载（BOM 头，Excel 直接打开不乱码）。
 * 全程不上传服务器，无新增后端接口。
 * 纯逻辑函数无 DOM，可在 Node 下单测（module.exports 导出）。
 */
(function () {
'use strict';

/* ---------------- 纯逻辑函数（无 DOM，可在 Node 下单测） ---------------- */

var NUM_RE = /^-?\d+(\.\d+)?$/;

/* 判断字符串是否为合法数字（整数/小数，允许负号） */
function isNumeric(s) {
  return NUM_RE.test(String(s).trim());
}

/* 逐行输入解析：返回 {scores:[], skipped: n, empty: n}
 * 每行取最后一个数字 token；空行与无数字行跳过计数 */
function parseLineScores(text) {
  var scores = [], skipped = 0, empty = 0;
  var lines = String(text == null ? '' : text).split(/\r?\n/);
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) { empty++; continue; }
    var tokens = line.split(/[\s,，、;；\t]+/).filter(Boolean);
    var val = null;
    for (var j = tokens.length - 1; j >= 0; j--) {
      if (isNumeric(tokens[j])) { val = parseFloat(tokens[j]); break; }
    }
    if (val === null) { skipped++; continue; }
    scores.push(val);
  }
  return { scores: scores, skipped: skipped, empty: empty };
}

/* 极简 CSV 行解析：支持双引号包裹字段与字段内转义双引号 */
function parseCsvRow(line) {
  var cells = [], cur = '', inQ = false;
  for (var i = 0; i < line.length; i++) {
    var ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else { inQ = false; }
      } else { cur += ch; }
    } else if (ch === '"') { inQ = true; }
    else if (ch === ',') { cells.push(cur); cur = ''; }
    else { cur += ch; }
  }
  cells.push(cur);
  return cells;
}

/* 取一行的最后一个数字（多列 CSV：学号，姓名，分数） */
function lastNumericOfRow(cells) {
  for (var i = cells.length - 1; i >= 0; i--) {
    if (isNumeric(cells[i])) return parseFloat(cells[i]);
  }
  return null;
}

/* CSV 文本解析：返回 {scores:[], skipped: n, empty: n}
 * 首行无数字视为表头跳过（不计入跳过数） */
function parseCsvScores(text) {
  var scores = [], skipped = 0, empty = 0;
  var lines = String(text == null ? '' : text).split(/\r?\n/);
  var started = false;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (!line.trim()) { empty++; continue; }
    var cells = parseCsvRow(line);
    var v = lastNumericOfRow(cells);
    if (v === null) {
      if (!started && scores.length === 0) continue; // 疑似表头行，静默跳过
      skipped++;
      continue;
    }
    started = true;
    scores.push(v);
  }
  return { scores: scores, skipped: skipped, empty: empty };
}

/* 五档分界：由及格线 P 与优秀线 E 生成 [P, P+10, P+20, E] 去重排序。
 * 默认 60/90 → [60,70,80,90]，即 <60 / 60–69 / 70–79 / 80–89 / ≥90；
 * 优秀线 >90 时第五档以优秀线为界。 */
function tierBounds(pass, excellent) {
  var b = [pass, pass + 10, pass + 20, excellent];
  b.sort(function (a, c) { return a - c; });
  var out = [];
  for (var i = 0; i < b.length; i++) {
    if (i === 0 || b[i] !== b[i - 1]) out.push(b[i]);
  }
  return out;
}

/* 分数段标签：整数边界用「60–69」风格，否则用「≥a 且 <b」 */
function fmtNum(n) {
  return (Math.round(n * 100) / 100).toString();
}
function tierLabel(lo, hi, isLast, isFirst) {
  if (isFirst) return '<' + fmtNum(lo);
  if (isLast) return '≥' + fmtNum(lo);
  if (Number.isInteger(lo) && Number.isInteger(hi)) return fmtNum(lo) + '–' + fmtNum(hi - 1);
  return '≥' + fmtNum(lo) + ' 且 <' + fmtNum(hi);
}

/* 核心统计：返回 {count, avg, max, min, median, passCount, passRate, excCount, excRate, tiers:[{label,count,rate}]} */
function computeStats(scores, pass, excellent) {
  var n = scores.length;
  var sorted = scores.slice().sort(function (a, b) { return a - b; });
  var sum = 0, passCount = 0, excCount = 0, i;
  for (i = 0; i < n; i++) {
    sum += sorted[i];
    if (sorted[i] >= pass) passCount++;
    if (sorted[i] >= excellent) excCount++;
  }
  var median = 0;
  if (n > 0) {
    median = (n % 2 === 1) ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  }
  var bounds = tierBounds(pass, excellent);
  var tiers = [];
  for (i = 0; i <= bounds.length; i++) {
    var lo = i === 0 ? -Infinity : bounds[i - 1];
    var hi = i === bounds.length ? Infinity : bounds[i];
    var cnt = 0;
    for (var j = 0; j < n; j++) {
      if (sorted[j] >= lo && sorted[j] < hi) cnt++;
    }
    tiers.push({
      label: tierLabel(i === 0 ? bounds[0] : lo, hi, i === bounds.length, i === 0),
      count: cnt,
      rate: n === 0 ? 0 : Math.round(cnt / n * 10000) / 100
    });
  }
  return {
    count: n,
    avg: n === 0 ? 0 : Math.round(sum / n * 100) / 100,
    max: n === 0 ? 0 : sorted[n - 1],
    min: n === 0 ? 0 : sorted[0],
    median: Math.round(median * 100) / 100,
    passCount: passCount,
    passRate: n === 0 ? 0 : Math.round(passCount / n * 10000) / 100,
    excCount: excCount,
    excRate: n === 0 ? 0 : Math.round(excCount / n * 10000) / 100,
    tiers: tiers
  };
}

/* 导出 CSV 内容（数组的数组 → CSV 文本，BOM 由调用方加） */
function buildExportRows(st, pass, excellent) {
  var rows = [
    ['统计项', '数值'],
    ['有效人数', st.count],
    ['平均分', st.avg],
    ['最高分', st.max],
    ['最低分', st.min],
    ['中位数', st.median],
    ['及格线', pass],
    ['及格人数', st.passCount],
    ['及格率(%)', st.passRate],
    ['优秀线', excellent],
    ['优秀人数', st.excCount],
    ['优秀率(%)', st.excRate],
    [],
    ['分数段', '人数', '占比(%)']
  ];
  for (var i = 0; i < st.tiers.length; i++) {
    rows.push([st.tiers[i].label, st.tiers[i].count, st.tiers[i].rate]);
  }
  return rows;
}
function csvEscape(v) {
  var s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function buildExportCsv(st, pass, excellent) {
  var rows = buildExportRows(st, pass, excellent);
  return '﻿' + rows.map(function (r) { return r.map(csvEscape).join(','); }).join('\r\n');
}

function pad2(n) { return (n < 10 ? '0' : '') + n; }
function stampName(prefix) {
  var d = new Date();
  return prefix + '-' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) +
    '-' + pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds()) + '.csv';
}

/* ---------------- DOM 交互 ---------------- */
if (typeof document === 'undefined') {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      isNumeric: isNumeric, parseLineScores: parseLineScores, parseCsvRow: parseCsvRow,
      parseCsvScores: parseCsvScores, tierBounds: tierBounds, tierLabel: tierLabel,
      computeStats: computeStats, buildExportRows: buildExportRows, buildExportCsv: buildExportCsv,
      csvEscape: csvEscape, stampName: stampName
    };
  }
  return;
}

var $ = function (id) { return document.getElementById(id); };
var els = {
  tabText: $('gs-tab-text'), tabCsv: $('gs-tab-csv'),
  paneText: $('gs-pane-text'), paneCsv: $('gs-pane-csv'),
  text: $('gs-text'), upload: $('gs-upload'), file: $('gs-file'),
  fileinfo: $('gs-fileinfo'), fileName: $('gs-file-name'), fileSub: $('gs-file-sub'),
  clear: $('gs-clear'), pass: $('gs-pass'), excellent: $('gs-excellent'),
  statline: $('gs-statline'), error: $('gs-error'),
  run: $('gs-run'), exp: $('gs-export'),
  result: $('gs-result'), kpis: $('gs-kpis'), tierBody: $('gs-tier-table').querySelector('tbody'),
  chart: $('gs-chart')
};
var mode = 'text';        // 'text' | 'csv'
var csvText = '';          // 当前 CSV 文件内容
var lastResult = null;     // {parsed, stats, pass, excellent}
var parsedCache = null;    // 最近一次解析结果，避免重复解析

function showError(msg) {
  els.error.textContent = msg || '';
  els.error.style.display = msg ? 'block' : 'none';
}
function setStatline(parsed) {
  if (!parsed) { els.statline.textContent = ''; return; }
  var t = '已解析 ' + parsed.scores.length + ' 个有效分数';
  var skip = parsed.skipped + parsed.empty;
  if (skip > 0) t += '，跳过 ' + skip + ' 行（空行 ' + parsed.empty + ' / 非数字 ' + parsed.skipped + '）';
  els.statline.textContent = t + '。';
}

/* 解析当前输入（文本框 / 已上传 CSV） */
function parseCurrent() {
  if (mode === 'csv') {
    if (!csvText) return null;
    return parseCsvScores(csvText);
  }
  var t = els.text.value;
  if (!t.trim()) return null;
  return parseLineScores(t);
}
function refreshParsed() {
  parsedCache = parseCurrent();
  setStatline(parsedCache);
  showError('');
  return parsedCache;
}

function readParams() {
  var p = parseFloat(els.pass.value), e = parseFloat(els.excellent.value);
  if (isNaN(p) || isNaN(e)) return { ok: false, msg: '及格线与优秀线必须是数字。' };
  if (!(e > p)) return { ok: false, msg: '优秀线必须大于及格线，请调整后再统计。' };
  if (p < 0) return { ok: false, msg: '及格线不能为负数。' };
  return { ok: true, pass: p, excellent: e };
}

/* KPI 卡片 */
function renderKpis(st) {
  var items = [
    ['有效人数', st.count], ['平均分', st.avg], ['最高分', st.max],
    ['最低分', st.min], ['中位数', st.median],
    ['及格率', st.passRate + '%'], ['优秀率', st.excRate + '%']
  ];
  els.kpis.innerHTML = items.map(function (it) {
    return '<div class="gs-kpi"><div class="v">' + it[1] + '</div><div class="k">' + it[0] + '</div></div>';
  }).join('');
}

/* 分数段表格 */
function renderTierTable(st) {
  els.tierBody.innerHTML = st.tiers.map(function (t) {
    return '<tr><td class="l">' + t.label + '</td><td>' + t.count + '</td><td>' + t.rate + '%</td></tr>';
  }).join('');
}

/* 自绘 SVG 分数段柱状图（零依赖） */
function renderChart(st) {
  var W = 640, H = 300, padL = 44, padR = 16, padT = 30, padB = 46;
  var cw = W - padL - padR, ch = H - padT - padB;
  var n = st.tiers.length;
  var maxC = 0, i;
  for (i = 0; i < n; i++) maxC = Math.max(maxC, st.tiers[i].count);
  if (maxC === 0) maxC = 1;
  var slot = cw / n, bw = Math.min(84, slot * 0.62);
  var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="分数段分布柱状图" style="display:block;max-width:680px;margin:auto;">';
  // 纵轴网格线 + 刻度
  var steps = 4;
  for (i = 0; i <= steps; i++) {
    var v = Math.round(maxC * i / steps);
    var y = padT + ch - ch * i / steps;
    s += '<line x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '" stroke="#e5e7eb" stroke-width="1"/>';
    s += '<text x="' + (padL - 8) + '" y="' + (y + 4) + '" text-anchor="end" font-size="11" fill="#9ca3af">' + v + '</text>';
  }
  // 柱子
  var colors = ['#ef4444', '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6'];
  for (i = 0; i < n; i++) {
    var t = st.tiers[i];
    var bh = ch * t.count / maxC;
    var x = padL + slot * i + (slot - bw) / 2;
    var y0 = padT + ch - bh;
    var c = colors[i % colors.length];
    s += '<rect x="' + x.toFixed(1) + '" y="' + y0.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(bh, 1).toFixed(1) + '" rx="5" fill="' + c + '" fill-opacity="0.88"/>';
    s += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (y0 - 8).toFixed(1) + '" text-anchor="middle" font-size="12" font-weight="700" fill="#374151">' + t.count + '人</text>';
    s += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (y0 - 22).toFixed(1) + '" text-anchor="middle" font-size="11" fill="#9ca3af">' + t.rate + '%</text>';
    var lx = padL + slot * i + slot / 2;
    s += '<text x="' + lx.toFixed(1) + '" y="' + (H - padB + 20) + '" text-anchor="middle" font-size="12" fill="#374151">' + t.label + '</text>';
  }
  // 基线
  s += '<line x1="' + padL + '" y1="' + (padT + ch) + '" x2="' + (W - padR) + '" y2="' + (padT + ch) + '" stroke="#9ca3af" stroke-width="1"/>';
  s += '</svg>';
  els.chart.innerHTML = s;
}

function runStats() {
  showError('');
  var parsed = refreshParsed();
  if (!parsed || parsed.scores.length === 0) {
    showError(mode === 'csv' ? 'CSV 中没有解析到有效分数：请确认文件包含数字列，首行表头会被自动跳过。' : '请先在文本框中输入分数（每行一个），或切换到「上传 CSV 文件」。');
    els.result.style.display = 'none';
    els.exp.disabled = true;
    lastResult = null;
    return;
  }
  var pm = readParams();
  if (!pm.ok) { showError(pm.msg); return; }
  var st = computeStats(parsed.scores, pm.pass, pm.excellent);
  lastResult = { parsed: parsed, stats: st, pass: pm.pass, excellent: pm.excellent };
  renderKpis(st);
  renderTierTable(st);
  renderChart(st);
  els.result.style.display = 'block';
  els.exp.disabled = false;
  els.result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function exportCsv() {
  if (!lastResult) return;
  var csv = buildExportCsv(lastResult.stats, lastResult.pass, lastResult.excellent);
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = stampName('score-stats');
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/* Tab 切换 */
function setMode(m) {
  mode = m;
  els.tabText.classList.toggle('active', m === 'text');
  els.tabCsv.classList.toggle('active', m === 'csv');
  els.paneText.classList.toggle('active', m === 'text');
  els.paneCsv.classList.toggle('active', m === 'csv');
  refreshParsed();
}
els.tabText.addEventListener('click', function () { setMode('text'); });
els.tabCsv.addEventListener('click', function () { setMode('csv'); });

/* 文本框：粘贴/输入即刷新解析行 */
var textTimer = null;
els.text.addEventListener('input', function () {
  clearTimeout(textTimer);
  textTimer = setTimeout(refreshParsed, 250);
});

/* CSV 上传：点击 / 拖拽 */
els.upload.addEventListener('click', function () { els.file.click(); });
els.upload.addEventListener('keydown', function (e) {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); els.file.click(); }
});
['dragover', 'dragenter'].forEach(function (ev) {
  els.upload.addEventListener(ev, function (e) { e.preventDefault(); els.upload.classList.add('dragover'); });
});
['dragleave', 'drop'].forEach(function (ev) {
  els.upload.addEventListener(ev, function (e) { e.preventDefault(); els.upload.classList.remove('dragover'); });
});
els.upload.addEventListener('drop', function (e) {
  if (e.dataTransfer && e.dataTransfer.files.length) loadCsvFile(e.dataTransfer.files[0]);
});
els.file.addEventListener('change', function () {
  if (els.file.files.length) loadCsvFile(els.file.files[0]);
});
function loadCsvFile(f) {
  if (!/\.csv$/i.test(f.name)) { showError('仅支持 .csv 文件，请重新选择。'); return; }
  var rd = new FileReader();
  rd.onload = function () {
    csvText = String(rd.result || '');
    els.fileName.textContent = f.name;
    els.fileSub.textContent = (f.size / 1024).toFixed(1) + ' KB · 本地解析，不上传';
    els.fileinfo.style.display = 'flex';
    refreshParsed();
  };
  rd.onerror = function () { showError('文件读取失败，请重试。'); };
  rd.readAsText(f, 'utf-8');
}
els.clear.addEventListener('click', function (e) {
  e.stopPropagation();
  els.file.value = '';
  csvText = '';
  els.fileinfo.style.display = 'none';
  parsedCache = null;
  setStatline(null);
});

/* 参数变化：若已有结果则实时重算（含分布图） */
[els.pass, els.excellent].forEach(function (inp) {
  inp.addEventListener('input', function () {
    if (lastResult) runStats();
  });
});

els.run.addEventListener('click', runStats);
els.exp.addEventListener('click', exportCsv);

})();
