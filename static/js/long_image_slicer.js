/* 长图切片器 - 长截图按目标比例自动切分（纯前端）
 * 上传长图（JPG/PNG/WebP，FileReader 本地读取）→ 目标比例四选（3:4/1:1/16:9/自定义）
 * → computeSliceLines 自动切线 → findSafeCutLine 行灰度差智能微调（±48px）
 * → 总览拖动微调切线 → 逐片预览（W×H 标注）→ 逐片 PNG/JPG 下载 → JSZip 一键打包。
 * 图片只在浏览器本地 canvas 流转，不上传服务器；脚本内零 fetch/XHR/WebSocket。
 *
 * 纯函数契约（浏览器/Node 通用，非法参数抛 Error，err.field 给出字段名，不静默钳制）：
 *   computeSliceLines(imageWidth, imageHeight, aspectW, aspectH)
 *       -> {pieceHeight, count, lines}；
 *         pieceHeight = Math.round(imageWidth*aspectH/aspectW)；
 *         count = Math.ceil(imageHeight/pieceHeight)；
 *         lines 为 pieceHeight 的倍数且严格 < imageHeight 的升序切线数组。
 *         imageWidth/imageHeight 非正整数抛 Error，err.field='imageSize'；
 *         aspectW/aspectH 非正整数抛 Error，err.field='aspect'；
 *         宽高比导致 pieceHeight<1（如极端 1:1000000）抛 Error，err.field='aspect'。
 *   findSafeCutLine(rows, y, window)
 *       -> 在 [max(0,y-window), min(len-1,y+window)] 内逐行能量
 *         e[i]=|rows[i]-rows[i-1]|（i=0 处 e=0），选能量最小者；
 *         并列选离 y 最近者，再并列取较小下标；结果钳制到 [0,len-1]。
 *         rows 非数组/空数组抛 Error，err.field='rows'；
 *         window 非有限数/<0 抛 Error，err.field='window'。
 *   buildSliceFileName(date, index) -> 'long_slice_YYYYMMDD_HHmmss_p<index+1>.png'
 *         date 非有效 Date 抛 Error，err.field='date'；
 *         index 非非负整数抛 Error，err.field='index'。
 *   buildZipFileName(date) -> 'long_slice_YYYYMMDD_HHmmss.zip'（date 校验同上）
 *   computeRowLuma(pixels, width, height)
 *       -> 每行平均灰度数组（length=height），pixels 为 RGBA 数组（length=width*height*4）；
 *         pixels 非数组（类数组）/长度不匹配、width/height 非正整数抛 Error，
 *         err.field='pixels'/'imageSize'。
 *
 * 浏览器内运行：文件尾部把 init 挂到 DOMContentLoaded；
 * Node 自测：module.exports 暴露纯函数。
 */
(function () {
'use strict';

/* ================= 纯函数 ================= */

function err(field, msg) {
    var e = new Error(msg);
    e.field = field;
    return e;
}

function isPosInt(v) {
    return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v >= 1;
}

function pad2(n) {
    return (n < 10 ? '0' : '') + n;
}

function stampOf(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
        throw err('date', 'buildSliceFileName: date 必须为有效 Date 对象');
    }
    return '' + date.getFullYear() + pad2(date.getMonth() + 1) + pad2(date.getDate()) +
        '_' + pad2(date.getHours()) + pad2(date.getMinutes()) + pad2(date.getSeconds());
}

/* 按目标宽高比把长图切成等高片：切线落在 pieceHeight 的整数倍上 */
function computeSliceLines(imageWidth, imageHeight, aspectW, aspectH) {
    if (!isPosInt(imageWidth) || !isPosInt(imageHeight)) {
        throw err('imageSize', 'computeSliceLines: imageWidth/imageHeight 必须为正整数');
    }
    if (!isPosInt(aspectW) || !isPosInt(aspectH)) {
        throw err('aspect', 'computeSliceLines: aspectW/aspectH 必须为正整数');
    }
    var pieceHeight = Math.round(imageWidth * aspectH / aspectW);
    if (pieceHeight < 1) {
        throw err('aspect', 'computeSliceLines: 宽高比导致单片高度为 0，请调整比例');
    }
    var count = Math.ceil(imageHeight / pieceHeight);
    var lines = [];
    for (var y = pieceHeight; y < imageHeight; y += pieceHeight) {
        lines.push(y);
    }
    return { pieceHeight: pieceHeight, count: count, lines: lines };
}

/* 在切线 y 上下 window 范围内找行灰度变化最小处下刀（智能避字启发式） */
function findSafeCutLine(rows, y, window) {
    if (!Array.isArray(rows) || rows.length === 0) {
        throw err('rows', 'findSafeCutLine: rows 必须为非空数组');
    }
    if (typeof window !== 'number' || !isFinite(window) || window < 0) {
        throw err('window', 'findSafeCutLine: window 必须为非负有限数');
    }
    var n = rows.length;
    var yi = Math.round(Number(y));
    if (!isFinite(yi)) yi = 0;
    yi = Math.max(0, Math.min(n - 1, yi));
    var lo = Math.max(0, Math.ceil(yi - window));
    var hi = Math.min(n - 1, Math.floor(yi + window));
    var best = lo, bestE = Infinity, bestD = Infinity;
    for (var i = lo; i <= hi; i++) {
        var e = (i === 0) ? 0 : Math.abs(rows[i] - rows[i - 1]);
        var d = Math.abs(i - yi);
        if (e < bestE || (e === bestE && (d < bestD || (d === bestD && i < best)))) {
            best = i; bestE = e; bestD = d;
        }
    }
    return Math.max(0, Math.min(n - 1, best));
}

/* 单片文件名：long_slice_YYYYMMDD_HHmmss_p<index+1>.png */
function buildSliceFileName(date, index) {
    if (typeof index !== 'number' || !isFinite(index) || Math.floor(index) !== index || index < 0) {
        throw err('index', 'buildSliceFileName: index 必须为非负整数');
    }
    return 'long_slice_' + stampOf(date) + '_p' + (index + 1) + '.png';
}

/* 打包文件名：long_slice_YYYYMMDD_HHmmss.zip */
function buildZipFileName(date) {
    return 'long_slice_' + stampOf(date) + '.zip';
}

/* RGBA 像素逐行平均灰度（供 findSafeCutLine 的 rows 使用） */
function computeRowLuma(pixels, width, height) {
    if (!isPosInt(width) || !isPosInt(height)) {
        throw err('imageSize', 'computeRowLuma: width/height 必须为正整数');
    }
    var len = width * height * 4;
    if (!pixels || typeof pixels.length !== 'number' || pixels.length < len) {
        throw err('pixels', 'computeRowLuma: pixels 长度须 >= width*height*4');
    }
    var rows = new Array(height);
    for (var y = 0; y < height; y++) {
        var sum = 0;
        var base = y * width * 4;
        for (var x = 0; x < width; x++) {
            var o = base + x * 4;
            sum += 0.299 * pixels[o] + 0.587 * pixels[o + 1] + 0.114 * pixels[o + 2];
        }
        rows[y] = sum / width;
    }
    return rows;
}

/* ================= 浏览器 UI ================= */

/* ---------- 配置 ---------- */
var ACCEPT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
var ACCEPT_EXT = /\.(jpe?g|png|webp)$/i;
var MAX_FILE_MB = 50;                 // 上传单文件上限（本地读取，不上传）
var SAMPLE_W = 120;                   // 行灰度采样宽度（px），高度按比例
var TUNE_WINDOW_PX = 48;              // 智能微调扫描半径（原图像素）
var OVERVIEW_MAX_H = 560;             // 总览图显示最大高度
var PIECE_PREVIEW_H = 200;            // 分片预览显示高度
var MAX_SIDE = 16384;                 // canvas 单边安全上限，超限自动降采样导出
var WARN_MP = 30;                     // 建议像素上限（MP），超限提示可能卡顿

/* ---------- 状态 ---------- */
var srcCanvas = null;                 // 离屏原图 canvas（原分辨率）
var srcW = 0, srcH = 0;
var srcName = '';
var lines = [];                       // 原图坐标切线（升序）
var pieceInfo = { pieceHeight: 0, count: 0 };
var aspect = { w: 3, h: 4 };           // 目标比例
var smartTune = true;                 // 智能微调开关
var exportFormat = 'png';             // png | jpg
var jpgQuality = 0.92;
var rowLuma = null;                   // 采样行灰度
var sampleScale = 1;                  // 采样高度 / 原图高度
var dragIdx = -1;                     // 正在拖动的切线下标

/* ---------- 通用工具 ---------- */
function $(id) { return document.getElementById(id); }

function toast(msg) {
    var t = $('lis-toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 2400);
}

function fmtInt(n) { return Number(n).toLocaleString('en-US'); }

function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 4000);
}

function fileStem(name) {
    var s = String(name || 'image').replace(/\.[^.]+$/, '');
    return s || 'image';
}

/* ---------- 图片载入 ---------- */
function validImageFile(f) {
    if (ACCEPT_TYPES.indexOf(f.type) !== -1) return true;
    return ACCEPT_EXT.test(f.name || '');
}

function loadImageFile(file) {
    if (!validImageFile(file)) {
        toast('仅支持 JPG / PNG / WebP 图片');
        return;
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
        toast('文件过大（上限 ' + MAX_FILE_MB + ' MB），请压缩后重试');
        return;
    }
    var reader = new FileReader();
    reader.onload = function () {
        var img = new Image();
        img.onload = function () {
            setSource(img, img.naturalWidth || img.width, img.naturalHeight || img.height,
                file.name, '已载入：' + file.name + '（仅本地处理，未上传）');
        };
        img.onerror = function () { toast('图片解码失败，请换一张图重试'); };
        img.src = reader.result;
    };
    reader.onerror = function () { toast('文件读取失败，请重试'); };
    reader.readAsDataURL(file); // 纯本地 FileReader，不经过网络
}

/* 以任意可绘制对象（Image/canvas）为源，拷贝到离屏原图 canvas */
function setSource(drawable, w, h, name, msg) {
    if (!w || !h) { toast('图片尺寸无效'); return; }
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var ctx = c.getContext('2d');
    ctx.drawImage(drawable, 0, 0, w, h);
    srcCanvas = c;
    srcW = w; srcH = h;
    srcName = name || 'image';
    var mp = (w * h / 1e6).toFixed(1);
    $('lis-size-info').textContent = '原图 ' + fmtInt(w) + ' × ' + fmtInt(h) + ' px（约 ' + mp + ' MP）';
    var warn = $('lis-size-warn');
    if (w * h > WARN_MP * 1e6) {
        warn.style.display = 'block';
        warn.textContent = '图片超过 ' + WARN_MP + ' MP：导出大分片时可能卡顿，超 canvas 单边上限（' +
            fmtInt(MAX_SIDE) + 'px）时会自动降采样导出。';
    } else {
        warn.style.display = 'none';
    }
    analyzeAndSlice();
    if (msg) toast(msg);
}

/* ---------- 示例长图（一键填充） ---------- */
function makeSample() {
    var w = 900, h = 3600;
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var ctx = c.getContext('2d');
    // 纸面底
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, w, h);
    // 顶栏
    var g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#2563eb'); g.addColorStop(1, '#7c3aed');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, 300);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 72px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('示例长截图', w / 2, 150);
    ctx.font = '36px sans-serif';
    ctx.fillText('900 × 3600 px · 拖动红色切线可微调', w / 2, 225);
    // 正文段落：色块 + 文字行，段间留白（智能避字应落在留白处）
    var y = 380;
    var para = 0;
    ctx.textAlign = 'left';
    while (y < h - 420) {
        para++;
        // 段落配图色块
        var hues = [210, 160, 20, 340, 260, 120];
        ctx.fillStyle = 'hsl(' + hues[para % hues.length] + ',70%,88%)';
        var bh = 300 + (para % 3) * 60;
        if (y + bh > h - 420) bh = h - 420 - y;
        ctx.fillRect(60, y, w - 120, bh);
        ctx.fillStyle = '#334155';
        ctx.font = '40px sans-serif';
        ctx.fillText('段落 ' + para + ' 配图', 90, y + 70);
        y += bh + 30;
        // 文字行
        ctx.fillStyle = '#cbd5e1';
        var rows = 4 + (para % 3);
        for (var r = 0; r < rows && y < h - 420; r++) {
            var lw = w - 120 - (r === rows - 1 ? 260 : (para * 37 + r * 53) % 120);
            ctx.fillRect(60, y, lw, 26);
            y += 52;
        }
        y += 90; // 段间留白：理想下刀处
    }
    // 底栏
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, h - 260, w, 260);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '36px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('— 到底啦 —', w / 2, h - 120);
    setSource(c, w, h, '示例长图.png', '已载入示例长图（900×3600）');
}

/* ---------- 切分分析 ---------- */
function currentAspect() {
    if (aspect.custom) {
        var w = parseInt($('lis-cw').value, 10);
        var h = parseInt($('lis-ch').value, 10);
        if (isPosInt(w) && isPosInt(h)) return { w: w, h: h };
        return null;
    }
    return { w: aspect.w, h: aspect.h };
}

function buildRowLuma() {
    var sw = SAMPLE_W;
    var sh = Math.max(1, Math.round(sw * srcH / srcW));
    var c = document.createElement('canvas');
    c.width = sw; c.height = sh;
    var ctx = c.getContext('2d');
    ctx.drawImage(srcCanvas, 0, 0, sw, sh);
    var data;
    try {
        data = ctx.getImageData(0, 0, sw, sh).data;
    } catch (e) {
        rowLuma = null; sampleScale = 1;
        return;
    }
    rowLuma = computeRowLuma(data, sw, sh);
    sampleScale = sh / srcH;
}

function analyzeAndSlice() {
    if (!srcCanvas) return;
    var a = currentAspect();
    if (!a) { toast('自定义比例宽高必须为正整数'); return; }
    var r;
    try {
        r = computeSliceLines(srcW, srcH, a.w, a.h);
    } catch (e) {
        toast('切分参数错误：' + e.message);
        return;
    }
    pieceInfo = { pieceHeight: r.pieceHeight, count: r.count };
    buildRowLuma();
    if (smartTune && rowLuma) {
        var win = Math.max(1, Math.round(TUNE_WINDOW_PX * sampleScale));
        lines = r.lines.map(function (y) {
            return Math.round(findSafeCutLine(rowLuma, Math.round(y * sampleScale), win) / sampleScale);
        });
        // 钳制回合法区间并保序（采样取整可能产生越界/乱序）
        for (var i = 0; i < lines.length; i++) {
            var lo = (i === 0 ? 0 : lines[i - 1]) + 1;
            var hi = (i === lines.length - 1 ? srcH : lines[i + 1]) - 1;
            if (lo > hi) { lines[i] = Math.min(Math.max(lines[i], i === 0 ? 1 : lines[i - 1] + 1), srcH - (lines.length - i)); }
            else lines[i] = Math.min(Math.max(lines[i], lo), hi);
        }
    } else {
        lines = r.lines.slice();
    }
    $('lis-workspace').style.display = '';
    renderOverview();
    renderPieces();
    updateSliceInfo(a, r);
}

function updateSliceInfo(a, r) {
    var tuned = smartTune && rowLuma ? '（已智能微调±' + TUNE_WINDOW_PX + 'px 避字）' : '';
    $('lis-slice-info').textContent = '目标比例 ' + a.w + ':' + a.h + ' → 单片高约 ' +
        fmtInt(r.pieceHeight) + ' px，共 ' + r.count + ' 片，切线 ' + lines.length + ' 条' + tuned +
        '。拖动总览图中的红色切线可微调。';
}

/* ---------- 分片边界 ---------- */
function bounds() {
    var b = [0].concat(lines, [srcH]);
    return b;
}

/* ---------- 总览（含可拖动切线） ---------- */
var ovScale = 1, ovW = 0, ovH = 0;

function renderOverview() {
    var cv = $('lis-overview');
    ovH = Math.min(OVERVIEW_MAX_H, Math.round(OVERVIEW_MAX_H * srcH / srcH));
    // 显示高度按比例：宽度固定算法
    var dispH = Math.min(OVERVIEW_MAX_H, srcH > 2400 ? OVERVIEW_MAX_H : Math.round(srcH * 0.35));
    if (srcH <= 1200) dispH = srcH;
    ovScale = dispH / srcH;
    ovW = Math.max(1, Math.round(srcW * ovScale));
    ovH = Math.round(srcH * ovScale);
    cv.width = ovW; cv.height = ovH;
    cv.style.width = ovW + 'px'; cv.style.height = ovH + 'px';
    drawOverview(cv, -1);
}

function drawOverview(cv, hoverIdx) {
    var ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, ovW, ovH);
    ctx.drawImage(srcCanvas, 0, 0, ovW, ovH);
    var b = bounds();
    ctx.font = '12px sans-serif';
    for (var i = 0; i < lines.length; i++) {
        var y = Math.round(lines[i] * ovScale);
        var hot = (i === hoverIdx || i === dragIdx);
        ctx.strokeStyle = hot ? '#ef4444' : 'rgba(239,68,68,.85)';
        ctx.lineWidth = hot ? 3 : 2;
        ctx.setLineDash([8, 5]);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(ovW, y); ctx.stroke();
        ctx.setLineDash([]);
        // 切线标签：片号
        var label = '✂ ' + (i + 1);
        var tw = ctx.measureText(label).width;
        ctx.fillStyle = hot ? '#ef4444' : 'rgba(239,68,68,.9)';
        ctx.fillRect(ovW - tw - 14, y - 11, tw + 14, 22);
        ctx.fillStyle = '#fff';
        ctx.fillText(label, ovW - tw - 7, y + 4);
    }
    // 每片 W×H 标注（左上角）
    ctx.fillStyle = 'rgba(17,24,39,.78)';
    for (var p = 0; p < b.length - 1; p++) {
        var y0 = Math.round(b[p] * ovScale), y1 = Math.round(b[p + 1] * ovScale);
        var txt = '#' + (p + 1) + ' ' + srcW + '×' + (b[p + 1] - b[p]);
        var wpx = ctx.measureText(txt).width;
        var ty = Math.min(y0 + 4, ovH - 24);
        ctx.fillRect(6, ty, wpx + 12, 20);
        ctx.fillStyle = '#fff';
        ctx.fillText(txt, 12, ty + 14);
        ctx.fillStyle = 'rgba(17,24,39,.78)';
    }
}

function overviewYToSrc(clientY) {
    var cv = $('lis-overview');
    var rect = cv.getBoundingClientRect();
    return (clientY - rect.top) / rect.height * srcH;
}

function hitLine(srcY) {
    var best = -1, bestD = 12 / ovScale; // 显示 12px 容差
    for (var i = 0; i < lines.length; i++) {
        var d = Math.abs(lines[i] - srcY);
        if (d < bestD) { bestD = d; best = i; }
    }
    return best;
}

function bindOverviewEvents() {
    var cv = $('lis-overview');
    function pos(e) {
        if (e.touches && e.touches.length) return e.touches[0].clientY;
        return e.clientY;
    }
    cv.addEventListener('mousedown', function (e) {
        var i = hitLine(overviewYToSrc(pos(e)));
        if (i !== -1) { dragIdx = i; drawOverview(cv, i); e.preventDefault(); }
    });
    cv.addEventListener('touchstart', function (e) {
        var i = hitLine(overviewYToSrc(pos(e)));
        if (i !== -1) { dragIdx = i; drawOverview(cv, i); e.preventDefault(); }
    }, { passive: false });
    function move(e) {
        if (dragIdx === -1) {
            var hov = hitLine(overviewYToSrc(pos(e)));
            cv.style.cursor = hov !== -1 ? 'ns-resize' : 'default';
            if (hov !== drawOverview._hov) { drawOverview._hov = hov; drawOverview(cv, hov); }
            return;
        }
        var y = Math.round(overviewYToSrc(pos(e)));
        var lo = (dragIdx === 0 ? 0 : lines[dragIdx - 1]) + 2;
        var hi = (dragIdx === lines.length - 1 ? srcH : lines[dragIdx + 1]) - 2;
        if (lo > hi) return;
        lines[dragIdx] = Math.min(Math.max(y, lo), hi);
        drawOverview(cv, dragIdx);
        if (e.cancelable) e.preventDefault();
    }
    function up() {
        if (dragIdx !== -1) {
            dragIdx = -1;
            drawOverview(cv, -1);
            renderPieces();
            var a = currentAspect();
            if (a) updateSliceInfo(a, { pieceHeight: pieceInfo.pieceHeight, count: pieceInfo.count });
            toast('切线已微调，分片已更新（拖动为手动值，不再保证等高）');
        }
    }
    cv.addEventListener('mousemove', move);
    cv.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('mouseup', up);
    window.addEventListener('touchend', up);
}

/* ---------- 分片列表 ---------- */
function renderPieces() {
    var wrap = $('lis-pieces');
    wrap.innerHTML = '';
    var b = bounds();
    var n = b.length - 1;
    $('lis-piece-count').textContent = '共 ' + n + ' 片';
    for (var i = 0; i < n; i++) {
        (function (idx) {
            var y0 = b[idx], ph = b[idx + 1] - b[idx];
            var card = document.createElement('div');
            card.className = 'lis-piece';
            var scale = PIECE_PREVIEW_H / ph;
            var pw = Math.max(1, Math.round(srcW * scale));
            var cv = document.createElement('canvas');
            cv.width = pw; cv.height = PIECE_PREVIEW_H;
            cv.getContext('2d').drawImage(srcCanvas, 0, y0, srcW, ph, 0, 0, pw, PIECE_PREVIEW_H);
            var meta = document.createElement('div');
            meta.className = 'lis-piece-meta';
            meta.innerHTML = '<b>第 ' + (idx + 1) + ' 片</b><span>' + fmtInt(srcW) + ' × ' + fmtInt(ph) +
                ' px</span><span>原图 ' + fmtInt(y0) + '–' + fmtInt(b[idx + 1]) + ' px</span>';
            var btn = document.createElement('button');
            btn.className = 'btn btn-secondary';
            btn.style.fontSize = '.88rem';
            btn.textContent = '下载本片（' + exportFormat.toUpperCase() + '）';
            btn.addEventListener('click', function () { downloadPiece(idx); });
            card.appendChild(cv);
            card.appendChild(meta);
            card.appendChild(btn);
            wrap.appendChild(card);
        })(i);
    }
    $('lis-zip').disabled = n === 0;
}

/* ---------- 单片导出 ---------- */
function pieceCanvas(idx) {
    var b = bounds();
    var y0 = b[idx], ph = b[idx + 1] - b[idx];
    var scale = 1;
    if (srcW > MAX_SIDE || ph > MAX_SIDE) {
        scale = Math.min(MAX_SIDE / srcW, MAX_SIDE / ph);
    }
    var cw = Math.max(1, Math.round(srcW * scale));
    var ch = Math.max(1, Math.round(ph * scale));
    var c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    var ctx = c.getContext('2d');
    if (exportFormat === 'jpg') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, cw, ch);
    }
    ctx.drawImage(srcCanvas, 0, y0, srcW, ph, 0, 0, cw, ch);
    return { canvas: c, scaled: scale < 1 };
}

function pieceBlob(idx) {
    return new Promise(function (resolve, reject) {
        var pc = pieceCanvas(idx);
        var mime = exportFormat === 'jpg' ? 'image/jpeg' : 'image/png';
        pc.canvas.toBlob(function (blob) {
            if (blob) resolve({ blob: blob, scaled: pc.scaled });
            else reject(new Error('encode failed'));
        }, mime, jpgQuality);
    });
}

function pieceFileName(idx, ext) {
    return 'long_slice_' + stampOf(new Date()) + '_p' + (idx + 1) + '.' + ext;
}

function downloadPiece(idx) {
    var ext = exportFormat === 'jpg' ? 'jpg' : 'png';
    pieceBlob(idx).then(function (r) {
        downloadBlob(r.blob, pieceFileName(idx, ext));
        toast('第 ' + (idx + 1) + ' 片已下载' + (r.scaled ? '（已自动降采样）' : ''));
    }).catch(function () { toast('导出失败：浏览器编码异常，请重试'); });
}

/* ---------- 一键打包 ZIP ---------- */
function downloadZip() {
    if (typeof JSZip === 'undefined') {
        toast('ZIP 组件未加载，请检查网络后刷新重试');
        return;
    }
    var b = bounds();
    var n = b.length - 1;
    if (!n) { toast('暂无分片可打包'); return; }
    var ext = exportFormat === 'jpg' ? 'jpg' : 'png';
    var btn = $('lis-zip');
    btn.disabled = true;
    btn.textContent = '打包中…';
    var zip = new JSZip();
    var folder = zip.folder('long_slices');
    var chain = Promise.resolve();
    var scaledAny = false;
    for (var i = 0; i < n; i++) {
        (function (idx) {
            chain = chain.then(function () {
                return pieceBlob(idx).then(function (r) {
                    if (r.scaled) scaledAny = true;
                    return r.blob.arrayBuffer().then(function (buf) {
                        folder.file(pieceFileName(idx, ext), buf);
                    });
                });
            });
        })(i);
    }
    chain.then(function () { return zip.generateAsync({ type: 'blob' }); })
        .then(function (blob) {
            var name;
            try { name = buildZipFileName(new Date()); }
            catch (e) { name = 'long_slices.zip'; }
            downloadBlob(blob, name);
            toast('已打包 ' + n + ' 片为 ZIP' + (scaledAny ? '（部分已自动降采样）' : ''));
        })
        .catch(function () { toast('打包失败，请重试'); })
        .then(function () {
            btn.disabled = false;
            btn.textContent = '一键打包 ZIP（' + n + ' 片·' + exportFormat.toUpperCase() + '）';
        });
}

/* ---------- 事件绑定 ---------- */
function setAspect(w, h, custom) {
    aspect = { w: w, h: h, custom: !!custom };
    var btns = document.querySelectorAll('#lis-aspect-seg .lis-seg-btn');
    for (var i = 0; i < btns.length; i++) {
        var b = btns[i];
        b.classList.toggle('active', b.getAttribute('data-aw') === String(w) &&
            b.getAttribute('data-ah') === String(h) && !custom);
    }
    $('lis-custom-row').style.display = custom ? '' : 'none';
}

function init() {
    /* 上传 */
    var up = $('lis-upload'), fi = $('lis-file');
    up.addEventListener('click', function () { fi.click(); });
    up.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { fi.click(); e.preventDefault(); }
    });
    fi.addEventListener('change', function () {
        if (this.files.length) loadImageFile(this.files[0]);
        this.value = '';
    });
    ['dragover', 'dragenter'].forEach(function (ev) {
        up.addEventListener(ev, function (e) { e.preventDefault(); up.classList.add('dragover'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
        up.addEventListener(ev, function (e) { e.preventDefault(); up.classList.remove('dragover'); });
    });
    up.addEventListener('drop', function (e) {
        var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) loadImageFile(f);
    });
    /* 粘贴上传 */
    document.addEventListener('paste', function (e) {
        var items = e.clipboardData && e.clipboardData.items;
        if (!items || srcCanvas) return; // 仅在未载入时响应粘贴，避免干扰
        for (var i = 0; i < items.length; i++) {
            if (items[i].type && items[i].type.indexOf('image/') === 0) {
                var f = items[i].getAsFile();
                if (f) { loadImageFile(f); e.preventDefault(); return; }
            }
        }
    });

    $('lis-sample').addEventListener('click', makeSample);
    $('lis-reset').addEventListener('click', function () {
        srcCanvas = null; lines = []; rowLuma = null;
        $('lis-workspace').style.display = 'none';
        $('lis-size-info').textContent = '';
        $('lis-size-warn').style.display = 'none';
        toast('已重置，请重新上传长图');
    });

    /* 比例四选 */
    var segBtns = document.querySelectorAll('#lis-aspect-seg .lis-seg-btn');
    for (var i = 0; i < segBtns.length; i++) {
        (function (b) {
            b.addEventListener('click', function () {
                var custom = b.getAttribute('data-custom') === '1';
                setAspect(parseInt(b.getAttribute('data-aw'), 10) || 3,
                    parseInt(b.getAttribute('data-ah'), 10) || 4, custom);
                analyzeAndSlice();
            });
        })(segBtns[i]);
    }
    $('lis-cw').addEventListener('input', function () { analyzeAndSlice(); });
    $('lis-ch').addEventListener('input', function () { analyzeAndSlice(); });

    /* 智能微调开关 */
    $('lis-tune').addEventListener('change', function () {
        smartTune = this.checked;
        analyzeAndSlice();
    });

    /* 导出格式 */
    var fBtns = document.querySelectorAll('#lis-format-seg .lis-seg-btn');
    for (var j = 0; j < fBtns.length; j++) {
        (function (b) {
            b.addEventListener('click', function () {
                exportFormat = b.getAttribute('data-format');
                for (var k = 0; k < fBtns.length; k++) fBtns[k].classList.toggle('active', fBtns[k] === b);
                $('lis-quality-row').style.display = exportFormat === 'jpg' ? '' : 'none';
                renderPieces();
            });
        })(fBtns[j]);
    }
    $('lis-quality').addEventListener('input', function () {
        jpgQuality = this.value / 100;
        $('lis-quality-val').textContent = this.value + '%';
    });

    $('lis-zip').addEventListener('click', downloadZip);

    bindOverviewEvents();
    setAspect(3, 4, false);
}

var API = {
    computeSliceLines: computeSliceLines,
    findSafeCutLine: findSafeCutLine,
    buildSliceFileName: buildSliceFileName,
    buildZipFileName: buildZipFileName,
    computeRowLuma: computeRowLuma
};

if (typeof window !== 'undefined') {
    window.LongImageSlicer = API;
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else { init(); }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
}

})();
