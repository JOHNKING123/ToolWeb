/* 图片转 Excel - 扫描件/图片里的表格识别成 .xlsx，纯前端本地处理
 *
 * 流程：图片上传（点击/拖拽/Ctrl+V 粘贴）→ tesseract.js v6（jsdelivr CDN 懒加载，
 * 语言包经 IndexedDB 缓存）取词级文本框坐标 → 启发式行列分组（Y 容差聚行、X 区间
 * 聚类推导列边界）生成二维网格 → HTML 表格预览确认（展示「识别 X 行 Y 列 / Z 个
 * 单元格」）→ SheetJS xlsx（CDN 懒加载 UMD + 本地 vendor 兜底）导出 <原名>.xlsx，
 * 另附 CSV 导出备选。全程三阶段进度：识别中 / 分组生成中 / 导出 Excel。
 * 无表格结构时提示「未检测到明显表格结构，建议走站内 OCR」，不导出空表。
 * 全程不上传服务器，无新增后端接口；CDN 失败时给出可读报错，页面不白屏。
 * 合并单元格/多表同页/跨行文本从简处理，页面使用说明如实声明。
 */
(function () {
'use strict';

/* ---------------- 常量 ---------------- */
var TESS_CDNS = [
  'https://cdn.jsdelivr.net/npm/tesseract.js@6/dist/tesseract.min.js',
  'https://cdn.npmmirror.com/packages/tesseract.js/6.0.1/files/dist/tesseract.min.js'
];
var LANG_PATH = 'https://cdn.jsdelivr.net/gh/tesseract-ocr/tessdata_fast@main';
var XLSX_CDNS = [
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js'
];
/* 本地兜底：按本脚本实际加载地址推导 vendor 路径（与 pdf-to-word.js 同款写法），
 * /tools 与 /tool-web 两种挂载前缀都可用。
 * IIFE 在浏览器脚本加载时同步执行，document.currentScript 有效；
 * Node 单测时 document 不存在，直接跳过（不影响纯逻辑导出）。 */
(function () {
  if (typeof document === 'undefined' || !document.currentScript) return;
  var me = document.currentScript.src;
  var fb = me ? me.replace(/image-to-excel\.js(\?.*)?$/, 'vendor/xlsx-0.18.5.umd.js') : '';
  if (fb && fb !== me) XLSX_CDNS.push(fb);
})();
var BIG_IMG = 10 * 1024 * 1024;   // 超过 10MB 仅提示较慢，不硬拦截

/*<ITX-PURE-BEGIN>*/
/* ---------------- 纯逻辑函数（无 DOM，可在 Node 下单测） ---------------- */
var WORD_CONF_MIN = 30;           // 词级置信度低于此视为噪点，参与分组时丢弃

function medNum(a) {
  if (!a.length) return 0;
  var s = a.slice().sort(function (x, y) { return x - y; });
  var m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
/* 文件名去后缀 + 去非法字符 */
function safeBaseName(name) {
  var n = String(name || 'image').replace(/\.[a-z0-9]+$/i, '');
  n = n.replace(/[\\/:*?"<>|\r\n]/g, '_').trim();
  return n || 'image';
}
/* 把 tesseract words 归一化为内部结构；丢弃空文本/零面积/低置信度噪点 */
function normWords(words) {
  var out = [];
  for (var i = 0; i < words.length; i++) {
    var w = words[i] || {};
    var t = String(w.text == null ? '' : w.text).trim();
    if (!t) continue;
    var b = w.bbox || {};
    var x0 = +b.x0, y0 = +b.y0, x1 = +b.x1, y1 = +b.y1;
    if (!(x1 > x0 && y1 > y0)) continue;
    var conf = w.confidence;
    if (typeof conf === 'number' && conf < WORD_CONF_MIN) continue;
    out.push({ text: t, x0: x0, y0: y0, x1: x1, y1: y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, h: y1 - y0 });
  }
  return out;
}
/* 启发式行列分组：按 Y 容差聚行，按 X 区间聚类推导列边界，生成二维网格。
 * words: [{text, bbox:{x0,y0,x1,y1}, confidence?}]（自 blocks 逐层 flatten 得到，见 doRecognize）
 * 返回 {ok, rows, cols, grid, filled, colBands, rowBands, reason} */
function groupWordsToGrid(words) {
  var ws = normWords(words);
  if (!ws.length) return { ok: false, reason: 'empty', rows: 0, cols: 0, grid: [], filled: 0 };
  var medH = medNum(ws.map(function (w) { return w.h; }));
  if (medH <= 0) medH = 12;

  /* --- 聚行：按 cy 排序，Y 容差 = 0.55 * 中位字高 --- */
  var tolY = Math.max(2, medH * 0.55);
  var byY = ws.slice().sort(function (a, b) { return a.cy - b.cy; });
  var rows = [];
  for (var i = 0; i < byY.length; i++) {
    var w = byY[i];
    var last = rows[rows.length - 1];
    if (last && Math.abs(w.cy - last.cy) <= tolY) {
      last.words.push(w);
      last.cy = (last.cy * (last.words.length - 1) + w.cy) / last.words.length;
      if (w.y0 < last.y0) last.y0 = w.y0;
      if (w.y1 > last.y1) last.y1 = w.y1;
    } else {
      rows.push({ cy: w.cy, y0: w.y0, y1: w.y1, words: [w] });
    }
  }

  /* --- 推导列：按 x0 排序扫一遍，x0 > 当前簇最大 x1 + 容差 → 新列。
   * 容差取 0.8 * 中位字高：同列左对齐文本的 x0 抖动远小于此，列间空隙通常大于此。
   * 宽词（宽度 > 2 倍中位词宽，疑似合并单元格）按 x0 归簇但不扩展簇边界，
   * 避免一个跨列宽词把相邻列吞并。 --- */
  var tolX = Math.max(3, medH * 0.8);
  var medW = medNum(ws.map(function (w) { return w.x1 - w.x0; }));
  var byX = ws.slice().sort(function (a, b) { return a.x0 - b.x0; });
  var cols = [];
  for (var j = 0; j < byX.length; j++) {
    var w2 = byX[j];
    var wide = (w2.x1 - w2.x0) > medW * 2;
    var lc = cols[cols.length - 1];
    if (lc && w2.x0 <= lc.maxX1 + tolX) {
      if (!wide) {
        if (w2.x1 > lc.maxX1) lc.maxX1 = w2.x1;
        if (w2.x0 < lc.minX0) lc.minX0 = w2.x0;
      }
      lc.cxSum += w2.cx; lc.n++;
    } else {
      cols.push({ minX0: w2.x0, maxX1: w2.x1, cxSum: w2.cx, n: 1 });
    }
  }
  cols.forEach(function (c) { c.cx = c.cxSum / c.n; });
  cols.sort(function (a, b) { return a.cx - b.cx; });

  /* --- 列区间边界：相邻列取中点；首尾向外扩半个容差 --- */
  var colL = [], colR = [];
  for (var k = 0; k < cols.length; k++) {
    colL.push(k === 0 ? cols[k].minX0 - tolX / 2 : (cols[k - 1].maxX1 + cols[k].minX0) / 2);
    colR.push(k === cols.length - 1 ? cols[k].maxX1 + tolX / 2 : (cols[k].maxX1 + cols[k + 1].minX0) / 2);
  }
  /* --- 行区间边界同理 --- */
  rows.sort(function (a, b) { return a.cy - b.cy; });
  var rowT = [], rowB = [];
  for (var r = 0; r < rows.length; r++) {
    rowT.push(r === 0 ? rows[r].y0 - tolY / 2 : (rows[r - 1].y1 + rows[r].y0) / 2);
    rowB.push(r === rows.length - 1 ? rows[r].y1 + tolY / 2 : (rows[r].y1 + rows[r + 1].y0) / 2);
  }

  /* --- 落格：词按中心点归属行列区间，不在区间内则归最近行/列；
   * 跨多列的宽词（疑似合并单元格）按最大重叠归一列，从简不拆分 --- */
  var R = rows.length, C = cols.length;
  var cells = [];
  for (var ri = 0; ri < R; ri++) { cells.push([]); for (var ci = 0; ci < C; ci++) cells[ri].push([]); }
  function nearestIdx(v, L, Rr) {
    for (var i = 0; i < L.length; i++) if (v >= L[i] && v <= Rr[i]) return i;
    var best = 0, bd = Infinity;
    for (var i2 = 0; i2 < L.length; i2++) {
      var d = v < L[i2] ? L[i2] - v : v - Rr[i2];
      if (d < bd) { bd = d; best = i2; }
    }
    return best;
  }
  ws.forEach(function (w) {
    var rr = nearestIdx(w.cy, rowT, rowB);
    var cc = nearestIdx(w.cx, colL, colR);
    cells[rr][cc].push(w);
  });

  /* --- 拼格文本：同格按 x 排序；相邻词间距大则加空格，否则直连（中英文混排友好） --- */
  var grid = [], filled = 0;
  for (var a = 0; a < R; a++) {
    var line = [];
    for (var b = 0; b < C; b++) {
      var cw = cells[a][b].sort(function (p, q) { return p.x0 - q.x0; });
      var txt = '';
      for (var q = 0; q < cw.length; q++) {
        if (q > 0) {
          var gap = cw[q].x0 - cw[q - 1].x1;
          var ref = Math.min(cw[q].h, cw[q - 1].h);
          txt += gap > ref * 0.3 ? ' ' : '';
        }
        txt += cw[q].text;
      }
      txt = txt.trim();
      if (txt) filled++;
      line.push(txt);
    }
    grid.push(line);
  }
  return {
    ok: true, reason: '',
    rows: R, cols: C, grid: grid, filled: filled,
    colBands: cols.map(function (c, i) { return { l: colL[i], r: colR[i] }; }),
    rowBands: rows.map(function (rw, i) { return { t: rowT[i], b: rowB[i] }; })
  };
}
/* 表格性判定：行列数与有效单元格数门槛；纯文字段落通常只有 1 列 → 判为非表格 */
function isTableLike(g) {
  if (!g || !g.ok) return { ok: false, reason: g ? g.reason : 'empty' };
  if (g.rows < 2) return { ok: false, reason: 'rows<2' };
  if (g.cols < 2) return { ok: false, reason: 'cols<2' };
  if (g.filled < 4) return { ok: false, reason: 'filled<4' };
  return { ok: true, reason: '' };
}
/* 网格 → CSV 文本（RFC4180 简版：含逗号/引号/换行则加引号转义） */
function gridToCsv(grid) {
  return grid.map(function (row) {
    return row.map(function (cell) {
      var s = String(cell == null ? '' : cell);
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',');
  }).join('\r\n');
}
/* 网格 → HTML 表格（预览用），转义防 XSS */
function escHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function gridToHtml(grid) {
  var h = '<table class="itx-table"><tbody>';
  for (var i = 0; i < grid.length; i++) {
    h += '<tr>';
    for (var j = 0; j < grid[i].length; j++) {
      h += i === 0 ? '<th>' + escHtml(grid[i][j]) + '</th>' : '<td>' + escHtml(grid[i][j]) + '</td>';
    }
    h += '</tr>';
  }
  return h + '</tbody></table>';
}
/* 导出前列宽：按列最大「显示宽度」估算（CJK 算 2，ASCII 算 1），上限 50 */
function dispWidth(s) {
  var w = 0;
  var t = String(s == null ? '' : s);
  for (var i = 0; i < t.length; i++) w += t.charCodeAt(i) > 255 ? 2 : 1;
  return w;
}
function colWidths(grid) {
  if (!grid.length) return [];
  var C = grid[0].length, out = [];
  for (var c = 0; c < C; c++) {
    var m = 4;
    for (var r = 0; r < grid.length; r++) m = Math.max(m, dispWidth(grid[r][c]));
    out.push({ wch: Math.min(50, m + 2) });
  }
  return out;
}
/* 供 Node 单测导出纯逻辑 */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    groupWordsToGrid: groupWordsToGrid, isTableLike: isTableLike,
    gridToCsv: gridToCsv, gridToHtml: gridToHtml, colWidths: colWidths,
    safeBaseName: safeBaseName, normWords: normWords, dispWidth: dispWidth,
    WORD_CONF_MIN: WORD_CONF_MIN
  };
}
/*<ITX-PURE-END>*/

/* ---------------- CDN 懒加载（支持多 URL 依次回退） ---------------- */
function ensureLibFromList(list, globalName) {
  return new Promise(function (resolve, reject) {
    if (window[globalName]) { resolve(); return; }
    var idx = 0;
    function tryNext() {
      if (idx >= list.length) { reject(new Error('all failed')); return; }
      var src = list[idx++];
      var s = document.createElement('script');
      var done = false;
      var timer = setTimeout(function () {
        if (!done) { done = true; s.remove(); tryNext(); }
      }, 25000);
      s.onload = function () {
        if (done) return;
        done = true; clearTimeout(timer);
        if (window[globalName]) resolve();
        else { s.remove(); tryNext(); }
      };
      s.onerror = function () {
        if (done) return;
        done = true; clearTimeout(timer); s.remove(); tryNext();
      };
      s.src = src;
      document.head.appendChild(s);
    }
    tryNext();
  });
}
function ensureTess() { return ensureLibFromList(TESS_CDNS, 'Tesseract'); }
function ensureXlsx() { return ensureLibFromList(XLSX_CDNS, 'XLSX'); }
function libLoadFail(what) {
  var el = $('itx-lib-error');
  el.style.display = 'block';
  el.textContent = what + '库加载失败（多个 CDN 源均不可用），请检查网络后重试；页面其他功能不受影响。';
}

/* ---------------- 通用小工具 ---------------- */
function $(id) { return document.getElementById(id); }
function fmtSize(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}
function toast(m) {
  var el = document.createElement('div');
  el.textContent = m;
  el.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:#111827;color:#fff;padding:.6rem 1.2rem;border-radius:.5rem;z-index:9999;font-size:.9rem;max-width:86vw;text-align:center;';
  document.body.appendChild(el);
  setTimeout(function () { if (el.parentNode) document.body.removeChild(el); }, 3000);
}
function setStatus(m) { $('itx-status').textContent = m || ''; }
function showError(m) { $('itx-error').textContent = m || ''; }
function showPhase(txt, frac) {
  $('itx-progress').style.display = 'block';
  $('itx-progress-bar').style.width = Math.round(frac * 100) + '%';
  $('itx-progress-txt').textContent = txt;
}
function hideProgress() {
  $('itx-progress').style.display = 'none';
  $('itx-progress-bar').style.width = '0';
  $('itx-progress-txt').textContent = '';
}
function downloadBlob(blob, name) {
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
}
function checkedVal(name) {
  var el = document.querySelector('input[name="' + name + '"]:checked');
  return el ? el.value : '';
}

/* ---------------- 状态 ---------------- */
var S = {
  file: null, fileName: '', fileSize: 0,
  imgURL: null, imgW: 0, imgH: 0,
  busy: false, cancelled: false, seq: 0,
  worker: null, workerLangs: '',
  grid: null, rows: 0, cols: 0, filled: 0   // 分组结果缓存
};
function setBusy(b, phaseTxt) {
  S.busy = b;
  $('itx-run').disabled = b || !S.imgURL;
  $('itx-cancel').style.display = b ? '' : 'none';
  if (b && phaseTxt) showPhase(phaseTxt, 0);
}

/* ---------------- 图片载入（点击/拖拽/粘贴） ---------------- */
function loadFile(file) {
  if (!file) return;
  if (!/^image\//.test(file.type)) { showError('请选择图片文件（PNG/JPG/WebP 等）。'); return; }
  showError('');
  if (S.imgURL) URL.revokeObjectURL(S.imgURL);
  S.file = file;
  S.fileName = file.name || '粘贴的图片';
  S.imgURL = URL.createObjectURL(file);
  var img = $('itx-img');
  img.onload = function () {
    S.imgW = img.naturalWidth; S.imgH = img.naturalHeight;
    S.grid = null;
    $('itx-preview').style.display = 'block';
    $('itx-fileinfo').style.display = 'flex';
    $('itx-file-name').textContent = S.fileName;
    $('itx-file-name').title = S.fileName;
    var sub = fmtSize(file.size) + ' · ' + S.imgW + '×' + S.imgH + ' 像素';
    if (file.size > BIG_IMG) sub += ' · 图片较大，识别可能较慢';
    $('itx-file-sub').textContent = sub;
    $('itx-result-card').style.display = 'none';
    $('itx-notable').style.display = 'none';
    setStatus('图片已载入，点击「开始识别表格」进行整图识别。识别在浏览器本地完成，不上传服务器。');
    setBusy(false);
  };
  img.onerror = function () {
    S.imgURL = null;
    showError('图片读取失败：文件可能已损坏或格式不受支持，请换一张图片重试。');
  };
  img.src = S.imgURL;
}
function clearFile() {
  if (S.imgURL) { URL.revokeObjectURL(S.imgURL); S.imgURL = null; }
  S.file = null; S.grid = null;
  $('itx-file').value = '';
  $('itx-preview').style.display = 'none';
  $('itx-fileinfo').style.display = 'none';
  $('itx-result-card').style.display = 'none';
  $('itx-notable').style.display = 'none';
  setStatus(''); showError(''); setBusy(false);
}

/* ---------------- tesseract worker（懒创建、语言切换即重建） ---------------- */
function langCode() { return checkedVal('itx-lang') === 'eng' ? 'eng' : 'chi_sim+eng'; }
function langLabel(code) { return code === 'eng' ? '英文' : '中文'; }
function statusText(status, code) {
  if (status === 'loading tesseract core') return '正在加载识别引擎…';
  if (status === 'initializing tesseract') return '正在初始化识别引擎…';
  if (status === 'loading language traineddata') return '正在加载' + langLabel(code) + '语言包…（约' + (code === 'eng' ? '4' : '7') + 'MB，首次稍慢，之后自动缓存）';
  if (status === 'recognizing text') return '正在识别表格文字…';
  return '准备中…';
}
async function ensureWorker(code, mySeq) {
  if (S.worker && S.workerLangs === code) return S.worker;
  if (S.worker) { try { await S.worker.terminate(); } catch (e) {} S.worker = null; }
  var T = window.Tesseract;
  var w = await T.createWorker(code, T.OEM.LSTM_ONLY, {
    langPath: LANG_PATH,
    gzip: false,
    cacheMethod: 'write',
    logger: function (m) {
      if (mySeq !== S.seq || S.cancelled) return;
      var p = m.progress || 0;
      if (m.status === 'recognizing text') showPhase('阶段 1/3 · 识别中…' + Math.round(p * 100) + '%', p * 0.7);
      else showPhase('阶段 1/3 · ' + statusText(m.status, code) + Math.round(p * 100) + '%', p * 0.7 * 0.999);
    }
  });
  if (mySeq !== S.seq || S.cancelled) { try { await w.terminate(); } catch (e) {} throw new Error('cancelled'); }
  S.worker = w; S.workerLangs = code;
  return w;
}

/* ---------------- 表格线去除（OCR 前预处理） ----------------
 * tesseract 会被粗表格网格线带偏，整图识别失败（实测：带 3px 网格线的清晰表格
 * 直接识别只能吐出几个乱字符、置信度 17%；去线后 96% 全对）。
 * 做法：灰度阈值找"暗像素占比超 60%"的连续行/列游程，厚度<=8px 的视为线条并擦白；
 * 更厚的深色块（如深色标题栏）予以保留，避免误删。返回 canvas；无细线时返回原图。 */
function removeTableLines(img) {
  var w = img.naturalWidth, h = img.naturalHeight;
  if (!w || !h) return img;
  var scale = Math.min(1, 2000 / Math.max(w, h));   // 限长边 2000px，控像素循环量
  var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
  var cv = document.createElement('canvas');
  cv.width = cw; cv.height = ch;
  var ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, cw, ch);
  var d;
  try { d = ctx.getImageData(0, 0, cw, ch); } catch (e) { return img; }
  var px = d.data, TH = 0.6, MAXT = 8;
  function isDark(i) { return (px[i] + px[i + 1] + px[i + 2]) / 3 < 128; }
  function rowDark(y) { var c = 0; for (var x = 0; x < cw; x++) if (isDark((y * cw + x) * 4)) c++; return c / cw > TH; }
  function colDark(x) { var c = 0; for (var y = 0; y < ch; y++) if (isDark((y * cw + x) * 4)) c++; return c / ch > TH; }
  function runs(isD, n) {
    var rs = [], s = -1, i;
    for (i = 0; i < n; i++) {
      if (isD(i)) { if (s < 0) s = i; }
      else if (s >= 0) { rs.push([s, i - 1]); s = -1; }
    }
    if (s >= 0) rs.push([s, n - 1]);
    return rs;
  }
  function whiten(x0, y0, x1, y1) {
    for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
      var i = (y * cw + x) * 4; px[i] = px[i + 1] = px[i + 2] = 255;
    }
  }
  var found = false, r, i2;
  var rRuns = runs(rowDark, ch), cRuns = runs(colDark, cw);
  for (i2 = 0; i2 < rRuns.length; i2++) { r = rRuns[i2]; if (r[1] - r[0] + 1 <= MAXT) { found = true; whiten(0, r[0], cw - 1, r[1]); } }
  for (i2 = 0; i2 < cRuns.length; i2++) { r = cRuns[i2]; if (r[1] - r[0] + 1 <= MAXT) { found = true; whiten(r[0], 0, r[1], ch - 1); } }
  if (!found) return img;
  ctx.putImageData(d, 0, 0);
  return cv;
}

/* ---------------- 识别 → 分组 → 预览 ---------------- */
function tick() { return new Promise(function (r) { setTimeout(r, 30); }); }
async function doRecognize() {
  if (!S.imgURL || S.busy) return;
  showError('');
  var mySeq = ++S.seq;
  S.cancelled = false;
  setBusy(true, '阶段 1/3 · 准备识别引擎…');
  $('itx-result-card').style.display = 'none';
  $('itx-notable').style.display = 'none';
  var code = langCode();
  try { await ensureTess(); }
  catch (e) { libLoadFail('识别引擎'); setBusy(false); hideProgress(); return; }
  try {
    var w = await ensureWorker(code, mySeq);
    if (mySeq !== S.seq || S.cancelled) return;
    showPhase('阶段 1/3 · 识别中…0%', 0);
    var recogImg = removeTableLines($('itx-img'));   // 先擦除表格网格线再识别
    /* tesseract.js v6 默认只回 text；词级 bbox 需显式要 blocks 并逐层 flatten */
    var res = await w.recognize(recogImg, {}, { blocks: true });
    if (mySeq !== S.seq || S.cancelled) return;
    var words = [];
    (res.data.blocks || []).forEach(function (blk) {
      (blk.paragraphs || []).forEach(function (par) {
        (par.lines || []).forEach(function (ln) {
          (ln.words || []).forEach(function (wd) { words.push(wd); });
        });
      });
    });
    /* --- 阶段 2：启发式行列分组 --- */
    showPhase('阶段 2/3 · 分组生成中…', 0.75);
    await tick();   // 让进度条有机会刷新
    var g = groupWordsToGrid(words);
    if (mySeq !== S.seq || S.cancelled) return;
    var chk = isTableLike(g);
    if (!chk.ok) { showNoTable(chk.reason); return; }
    S.grid = g.grid; S.rows = g.rows; S.cols = g.cols; S.filled = g.filled;
    showPhase('阶段 2/3 · 分组生成中…完成', 0.8);
    showResult();
  } catch (e) {
    if (mySeq !== S.seq || String(e && e.message) === 'cancelled') return;
    showError('识别失败：' + (e && e.message ? e.message : '未知错误') + '。语言包加载失败时请检查网络后重试。');
  } finally {
    if (mySeq === S.seq && !S.cancelled) { setBusy(false); hideProgress(); }
  }
}
function showNoTable(reason) {
  setBusy(false); hideProgress();
  var box = $('itx-notable');
  box.style.display = 'block';
  var why = { 'empty': '图片中没有识别到文字', 'rows<2': '只识别到不足 2 行', 'cols<2': '只识别到 1 列（像普通段落文字）', 'filled<4': '有效单元格太少' }[reason] || '结构不明显';
  $('itx-notable-why').textContent = '未检测到明显表格结构（' + why + '），不会导出空表。';
  setStatus('未检测到表格结构。');
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function statText() {
  return '识别 ' + S.rows + ' 行 ' + S.cols + ' 列 / ' + S.filled + ' 个单元格';
}
function showResult() {
  setBusy(false); hideProgress();
  $('itx-result-card').style.display = 'block';
  $('itx-stat').textContent = statText();
  $('itx-table-wrap').innerHTML = gridToHtml(S.grid);
  $('itx-name-hint').textContent = '导出文件名：' + safeBaseName(S.fileName) + '.xlsx';
  setStatus('表格结构已生成，请在预览中核对，确认无误后导出。');
  $('itx-result-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ---------------- 导出 ---------------- */
async function ensureXlsxOk() {
  try { await ensureXlsx(); return true; }
  catch (e) { libLoadFail('Excel 导出'); return false; }
}
async function exportXlsx() {
  if (!S.grid || S.busy) return;
  if (!(await ensureXlsxOk())) return;
  showPhase('阶段 3/3 · 导出 Excel…', 0.9);
  await tick();
  try {
    var wb = XLSX.utils.book_new();
    var ws = XLSX.utils.aoa_to_sheet(S.grid);
    ws['!cols'] = colWidths(S.grid);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    var name = safeBaseName(S.fileName) + '.xlsx';
    XLSX.writeFile(wb, name);
    showPhase('阶段 3/3 · 导出完成', 1);
    setStatus('已导出 ' + name + '（' + statText() + '）。');
    toast('已导出 ' + name);
  } catch (e) {
    showError('导出 Excel 失败：' + (e && e.message ? e.message : '未知错误'));
  } finally {
    setTimeout(hideProgress, 1200);
  }
}
function exportCsv() {
  if (!S.grid) return;
  var csv = '﻿' + gridToCsv(S.grid);   // BOM，Excel 直接打开不乱码
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), safeBaseName(S.fileName) + '.csv');
  toast('已导出 CSV 文件');
}
async function cancelWork() {
  S.cancelled = true; S.seq++;
  setBusy(false); hideProgress();
  setStatus('已取消。');
  if (S.worker) { try { await S.worker.terminate(); } catch (e) {} S.worker = null; S.workerLangs = ''; }
}

/* ---------------- 事件绑定（仅浏览器；Node 单测时跳过） ---------------- */
if (typeof document !== 'undefined') {
document.addEventListener('DOMContentLoaded', function () {
  var up = $('itx-upload'), fi = $('itx-file');
  up.addEventListener('click', function () { fi.click(); });
  up.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fi.click(); } });
  fi.addEventListener('change', function () { if (fi.files && fi.files[0]) loadFile(fi.files[0]); });
  ['dragover', 'dragenter'].forEach(function (ev) {
    up.addEventListener(ev, function (e) { e.preventDefault(); up.classList.add('dragover'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    up.addEventListener(ev, function (e) { e.preventDefault(); up.classList.remove('dragover'); });
  });
  up.addEventListener('drop', function (e) {
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) loadFile(f);
  });
  document.addEventListener('paste', function (e) {
    var items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (var i = 0; i < items.length; i++) {
      if (items[i].type && items[i].type.indexOf('image/') === 0) {
        var f = items[i].getAsFile();
        if (f) { e.preventDefault(); loadFile(f); setStatus('已从剪贴板读取截图。'); }
        return;
      }
    }
  });
  $('itx-clear').addEventListener('click', clearFile);
  $('itx-run').addEventListener('click', doRecognize);
  $('itx-cancel').addEventListener('click', cancelWork);
  var radios = document.querySelectorAll('input[name="itx-lang"]');
  radios.forEach(function (r) {
    r.addEventListener('change', function () {
      if (S.worker) { var w = S.worker; S.worker = null; S.workerLangs = ''; w.terminate().catch(function () {}); }
      setStatus('已切换为「' + (langCode() === 'eng' ? '仅英文' : '中英文混排') + '」，下次识别时加载对应语言包。');
    });
  });
  $('itx-export-xlsx').addEventListener('click', exportXlsx);
  $('itx-export-csv').addEventListener('click', exportCsv);
});
}
})();
