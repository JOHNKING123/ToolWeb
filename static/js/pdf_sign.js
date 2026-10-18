/* PDF 电子签名 - 纯前端本地处理（pdf.js 预览 + pdf-lib 回写）
 * 流程：上传 PDF（pdf.js 逐页渲染预览）→ 三种方式制作签名（手写板/图片白底转透明/
 * 键入姓名手写体渲染，签名库 localStorage 持久化）→ 预览页点击放置、拖拽定位、
 * 等比缩放、删除，多页多枚 → pdf-lib embedPng 按页/坐标嵌入导出新 PDF（原文件不动）。
 * 坐标：放置数据统一记为 PDF 磅值、y 轴向下（与 pdf.js viewport 一致）；导出时
 * y_pdf = 页高 - y_top - h 换算成 pdf-lib 的左下原点，无镜像、无偏移。
 * pdf.js 与 pdf-lib 均经 CDN 懒加载；文件只在浏览器本地以 ArrayBuffer 处理，不上传服务器。 */
(function () {
'use strict';
var PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
var PDFJS_WORKER_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
var PDFLIB_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
var BIG_FILE = 50 * 1024 * 1024;
var LS_KEY = 'toolweb_pdfsign_sigs_v1';
var PAD_W = 800, PAD_H = 320;   // 签名板 canvas 属性尺寸
var PLACE_W_PT = 150;           // 点击放置时的默认签名宽度（PDF 磅值）
var MIN_PT = 18;                // 签名最小边长（磅值）

var doc = null;        // pdf.js PDFDocumentProxy
var fileBuf = null;    // 原始 ArrayBuffer（供 pdf-lib 回写）
var fileInfo = null;   // {name,size,pages,base}
var curPage = 1;
var busy = false;
var renderSeq = 0;     // 预览渲染序号，防翻页竞态
var pageGeom = null;   // 当前预览页 {wPt,hPt,scale}，scale = 渲染像素 / PDF 磅值
var placements = {};   // 页号 -> [{id, sigId, x, y, w, h}]，x/y 为左上角 PDF 磅值（y 向下）
var placeSeq = 0;
var selectedPlaceId = null;

var sigs = [];         // [{id, name, dataURL, pw, ph}] pw/ph 为 PNG 像素尺寸
var activeSigId = null;

function $(id) { return document.getElementById(id); }
function toast(m) {
    var el = document.createElement('div');
    el.textContent = m;
    el.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:#111827;color:#fff;padding:.6rem 1.2rem;border-radius:.5rem;z-index:9999;font-size:.9rem;max-width:86vw;text-align:center;';
    document.body.appendChild(el);
    setTimeout(function () { if (el.parentNode) document.body.removeChild(el); }, 3000);
}
function setStatus(m) { $('pgs-status').textContent = m || ''; }
function showError(m) { $('pgs-error').textContent = m || ''; }
function fmtSize(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
}
function downloadBlob(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
}
function baseName(name) { return name.replace(/\.pdf$/i, ''); }
function showProgress(text, frac) {
    $('pgs-progress').style.display = 'block';
    $('pgs-progress-bar').style.width = Math.round(frac * 100) + '%';
    $('pgs-progress-txt').textContent = text;
}
function hideProgress() {
    $('pgs-progress').style.display = 'none';
    $('pgs-progress-bar').style.width = '0';
    $('pgs-progress-txt').textContent = '';
}
function nextFrame() {
    return new Promise(function (resolve) {
        if (window.requestAnimationFrame) requestAnimationFrame(function () { setTimeout(resolve, 0); });
        else setTimeout(resolve, 30);
    });
}

/* ============ CDN 懒加载（沿 pdf-watermark 惯例） ============ */
function ensureLib(src, globalName) {
    return new Promise(function (resolve, reject) {
        if (window[globalName]) { resolve(); return; }
        var s = document.createElement('script');
        var done = false;
        var timer = setTimeout(function () {
            if (!done) { done = true; s.remove(); reject(new Error('timeout')); }
        }, 20000);
        s.onload = function () {
            if (!done) { done = true; clearTimeout(timer); window[globalName] ? resolve() : reject(new Error('bad lib')); }
        };
        s.onerror = function () {
            if (!done) { done = true; clearTimeout(timer); reject(new Error('load failed')); }
        };
        s.src = src;
        document.head.appendChild(s);
    });
}
function ensurePdfJs() {
    return ensureLib(PDFJS_CDN, 'pdfjsLib').then(function () {
        if (window.pdfjsLib.GlobalWorkerOptions && !window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN;
        }
    });
}
function ensurePdfLib() { return ensureLib(PDFLIB_CDN, 'PDFLib'); }
function showLibError(what) {
    var el = $('pgs-lib-error');
    el.style.display = 'block';
    el.textContent = what + '库加载失败，请检查网络后重试（页面本身不受影响）。';
}
function hideLibError() { $('pgs-lib-error').style.display = 'none'; $('pgs-lib-error').textContent = ''; }

/* ============ PDF 读取与错误分类 ============ */
function classifyPdfError(e) {
    var name = (e && e.name) || '';
    var msg = (e && e.message) || '';
    if (name === 'PasswordException' || /password|encrypt/i.test(msg)) {
        return '该 PDF 已加密（带打开密码），无法读取，请先解密后再试';
    }
    if (name === 'InvalidPDFException' || name === 'MissingPDFException') {
        return '文件损坏或不是有效的 PDF，请换一个文件试试';
    }
    return 'PDF 读取失败：文件可能已损坏或格式不受支持';
}
function isPdfFile(f) {
    return /\.pdf$/i.test(f.name) || f.type === 'application/pdf';
}

/* ============ canvas 通用：裁剪内容边界 ============ */
function trimCanvas(src) {
    var w = src.width, h = src.height;
    var ctx = src.getContext('2d');
    var d;
    try { d = ctx.getImageData(0, 0, w, h).data; } catch (e) { return src; }
    var minX = w, minY = h, maxX = -1, maxY = -1;
    for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
            if (d[(y * w + x) * 4 + 3] > 8) {
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
            }
        }
    }
    if (maxX < 0) return null; // 空白
    var pad = 8;
    minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
    maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad);
    var out = document.createElement('canvas');
    out.width = maxX - minX + 1;
    out.height = maxY - minY + 1;
    out.getContext('2d').drawImage(src, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
    return out;
}

/* ============ 签名库（localStorage 持久化） ============ */
function loadSigs() {
    sigs = [];
    try {
        var raw = localStorage.getItem(LS_KEY);
        if (raw) {
            var arr = JSON.parse(raw);
            if (Array.isArray(arr)) {
                sigs = arr.filter(function (s) { return s && s.id && s.dataURL && s.pw && s.ph; });
            }
        }
    } catch (e) { sigs = []; }
    if (!activeSigId || !sigs.some(function (s) { return s.id === activeSigId; })) {
        activeSigId = sigs.length ? sigs[0].id : null;
    }
}
function saveSigs() {
    try {
        localStorage.setItem(LS_KEY, JSON.stringify(sigs));
        return true;
    } catch (e) {
        toast('浏览器本地存储空间不足，签名未能保存（页面关闭后会丢失）');
        return false;
    }
}
function getSig(id) {
    for (var i = 0; i < sigs.length; i++) if (sigs[i].id === id) return sigs[i];
    return null;
}
function nextSigName() {
    var n = sigs.length + 1, base = '签名';
    while (sigs.some(function (s) { return s.name === base + n; })) n++;
    return base + n;
}
function addSigFromCanvas(canvas, name) {
    var trimmed = trimCanvas(canvas);
    if (!trimmed) { toast('签名是空白的，请先书写内容'); return false; }
    var sig = {
        id: 'sig_' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
        name: name || nextSigName(),
        dataURL: trimmed.toDataURL('image/png'),
        pw: trimmed.width,
        ph: trimmed.height
    };
    sigs.push(sig);
    if (saveSigs()) {
        activeSigId = sig.id;
        renderSigList();
        updateModebar();
        toast('已存入签名库：「' + sig.name + '」');
        return true;
    }
    sigs.pop();
    return false;
}
function renderSigList() {
    var box = $('pgs-siglist');
    box.innerHTML = '';
    if (!sigs.length) {
        box.innerHTML = '<span class="pgs-empty">还没有签名，用上方三种方式制作一枚吧。</span>';
        return;
    }
    sigs.forEach(function (sig) {
        var d = document.createElement('div');
        d.className = 'pgs-sig' + (sig.id === activeSigId ? ' active' : '');
        d.title = '点击选中为当前签名；双击改名';
        var img = document.createElement('img');
        img.src = sig.dataURL;
        img.alt = sig.name;
        var nm = document.createElement('div');
        nm.className = 'nm';
        nm.textContent = sig.name;
        var del = document.createElement('button');
        del.className = 'del';
        del.type = 'button';
        del.title = '删除这枚签名';
        del.textContent = '×';
        del.addEventListener('click', function (e) {
            e.stopPropagation();
            sigs = sigs.filter(function (s) { return s.id !== sig.id; });
            if (activeSigId === sig.id) activeSigId = sigs.length ? sigs[0].id : null;
            // 清掉已放置但库里已删除的签名实例
            Object.keys(placements).forEach(function (pg) {
                placements[pg] = placements[pg].filter(function (p) { return p.sigId !== sig.id; });
            });
            saveSigs();
            renderSigList();
            renderPlaceLayer();
            refreshChecklist();
            refreshExportState();
            updateModebar();
            toast('已删除签名「' + sig.name + '」');
        });
        d.appendChild(img);
        d.appendChild(nm);
        d.appendChild(del);
        d.addEventListener('click', function () {
            activeSigId = sig.id;
            renderSigList();
            updateModebar();
        });
        d.addEventListener('dblclick', function () {
            var nv = window.prompt('给签名改个名字：', sig.name);
            if (nv && nv.trim()) {
                sig.name = nv.trim().slice(0, 20);
                saveSigs();
                renderSigList();
            }
        });
        box.appendChild(d);
    });
}

/* ============ 签名制作①：手写签名板 ============ */
var padCtx = null, strokes = [], curStroke = null, padDrawing = false;
function padPos(e) {
    var r = $('pgs-pad').getBoundingClientRect();
    return { x: (e.clientX - r.left) * (PAD_W / r.width), y: (e.clientY - r.top) * (PAD_H / r.height) };
}
function redrawPad() {
    var ctx = padCtx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, PAD_W, PAD_H);
    ctx.restore();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 4.5;
    strokes.forEach(function (st) { drawStroke(ctx, st); });
    if (curStroke) drawStroke(ctx, curStroke);
}
function drawStroke(ctx, pts) {
    if (!pts || pts.length < 1) return;
    ctx.beginPath();
    if (pts.length === 1) {
        ctx.arc(pts[0].x, pts[0].y, ctx.lineWidth / 2, 0, Math.PI * 2);
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fill();
        return;
    }
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length - 1; i++) {
        var xc = (pts[i].x + pts[i + 1].x) / 2, yc = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
    }
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    ctx.stroke();
}
function initPad() {
    var pad = $('pgs-pad');
    padCtx = pad.getContext('2d');
    redrawPad();
    pad.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        pad.setPointerCapture(e.pointerId);
        padDrawing = true;
        curStroke = [padPos(e)];
        redrawPad();
    });
    pad.addEventListener('pointermove', function (e) {
        if (!padDrawing || !curStroke) return;
        e.preventDefault();
        curStroke.push(padPos(e));
        redrawPad();
    });
    function endStroke(e) {
        if (!padDrawing) return;
        padDrawing = false;
        if (curStroke && curStroke.length) strokes.push(curStroke);
        curStroke = null;
        redrawPad();
    }
    pad.addEventListener('pointerup', endStroke);
    pad.addEventListener('pointercancel', endStroke);
    $('pgs-pad-undo').addEventListener('click', function () {
        strokes.pop();
        redrawPad();
    });
    $('pgs-pad-clear').addEventListener('click', function () {
        strokes = [];
        curStroke = null;
        redrawPad();
    });
    $('pgs-pad-save').addEventListener('click', function () {
        if (!strokes.length) { toast('签名板是空的，请先书写'); return; }
        var tmp = document.createElement('canvas');
        tmp.width = PAD_W; tmp.height = PAD_H;
        var tctx = tmp.getContext('2d');
        tctx.lineCap = 'round'; tctx.lineJoin = 'round'; tctx.strokeStyle = '#111827'; tctx.lineWidth = 4.5;
        strokes.forEach(function (st) { drawStroke(tctx, st); });
        if (addSigFromCanvas(tmp)) {
            strokes = [];
            redrawPad();
        }
    });
}

/* ============ 签名制作②：上传图片白底转透明 ============ */
var uploadedImgCanvas = null;
function whiteToTransparent(src) {
    var out = document.createElement('canvas');
    out.width = src.width; out.height = src.height;
    var ctx = out.getContext('2d');
    ctx.drawImage(src, 0, 0);
    var img;
    try { img = ctx.getImageData(0, 0, out.width, out.height); }
    catch (e) { return out; }
    var d = img.data;
    for (var i = 0; i < d.length; i += 4) {
        var luma = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
        if (luma > 242) d[i + 3] = 0;      // 近白底色 → 透明
    }
    ctx.putImageData(img, 0, 0);
    return out;
}
function initImagePane() {
    $('pgs-img-pick').addEventListener('click', function () { $('pgs-img-file').click(); });
    $('pgs-img-file').addEventListener('change', function () {
        var f = $('pgs-img-file').files[0];
        $('pgs-img-file').value = '';
        if (!f) return;
        if (!/^image\/(png|jpeg)$/.test(f.type)) { toast('请选择 PNG 或 JPG 图片'); return; }
        var url = URL.createObjectURL(f);
        var img = new Image();
        img.onload = function () {
            URL.revokeObjectURL(url);
            var maxSide = 1200;
            var sc = Math.min(1, maxSide / Math.max(img.width, img.height));
            var c = document.createElement('canvas');
            c.width = Math.max(1, Math.round(img.width * sc));
            c.height = Math.max(1, Math.round(img.height * sc));
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            uploadedImgCanvas = c;
            $('pgs-img-save').disabled = false;
            $('pgs-img-hint').textContent = '已读取「' + f.name + '」（' + c.width + '×' + c.height + '），点下方按钮转透明并存入库。';
            toast('已读取签名图片，点「白底转透明并存入签名库」完成');
        };
        img.onerror = function () {
            URL.revokeObjectURL(url);
            toast('图片读取失败，请换一张试试');
        };
        img.src = url;
    });
    $('pgs-img-save').addEventListener('click', function () {
        if (!uploadedImgCanvas) { toast('请先选择一张签名图片'); return; }
        var transparent = whiteToTransparent(uploadedImgCanvas);
        if (addSigFromCanvas(transparent)) {
            uploadedImgCanvas = null;
            $('pgs-img-save').disabled = true;
            $('pgs-img-hint').textContent = '支持白底手写签名照片/扫描件；存入时自动把接近白色的底色转成透明，裁掉多余空白。';
        }
    });
}

/* ============ 签名制作③：键入姓名手写体渲染 ============ */
var TEXT_FONTS = {
    hand1: "'Segoe Script','Comic Sans MS','Kaiti SC','KaiTi',cursive",
    hand2: "'Brush Script MT','Segoe Script',cursive",
    kaiti: "'Kaiti SC','KaiTi','STKaiti',serif",
    xing:  "'Xingkai SC','Kaiti SC','KaiTi',cursive"
};
var textFontKey = 'hand1';
function initTextPane() {
    Array.prototype.forEach.call(document.querySelectorAll('#pgs-fontrow .pgs-font'), function (b) {
        b.addEventListener('click', function () {
            Array.prototype.forEach.call(document.querySelectorAll('#pgs-fontrow .pgs-font'), function (x) { x.classList.remove('active'); });
            b.classList.add('active');
            textFontKey = b.getAttribute('data-font');
        });
    });
    $('pgs-text-save').addEventListener('click', function () {
        var name = $('pgs-name').value.trim();
        if (!name) { toast('请先输入姓名'); $('pgs-name').focus(); return; }
        var c = document.createElement('canvas');
        c.width = 900; c.height = 300;
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#111827';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        var fontStack = TEXT_FONTS[textFontKey] || TEXT_FONTS.hand1;
        var size = 150;
        ctx.font = 'italic 700 ' + size + 'px ' + fontStack;
        while (ctx.measureText(name).width > 840 && size > 40) {
            size -= 8;
            ctx.font = 'italic 700 ' + size + 'px ' + fontStack;
        }
        ctx.fillText(name, 450, 155);
        if (addSigFromCanvas(c, name)) {
            $('pgs-name').value = '';
        }
    });
}
function initTabs() {
    Array.prototype.forEach.call(document.querySelectorAll('.pgs-tab'), function (t) {
        t.addEventListener('click', function () {
            Array.prototype.forEach.call(document.querySelectorAll('.pgs-tab'), function (x) { x.classList.remove('active'); });
            t.classList.add('active');
            var key = t.getAttribute('data-tab');
            Array.prototype.forEach.call(document.querySelectorAll('.pgs-pane'), function (p) {
                p.classList.toggle('active', p.id === 'pgs-pane-' + key);
            });
        });
    });
}

/* ============ 界面状态 ============ */
function totalPlacements() {
    var n = 0;
    Object.keys(placements).forEach(function (pg) { n += placements[pg].length; });
    return n;
}
function refreshExportState() {
    $('pgs-export').disabled = !(doc && fileInfo && totalPlacements() > 0) || busy;
}
function renderFileInfo() {
    var box = $('pgs-fileinfo');
    var ok = doc && fileInfo;
    box.style.display = ok ? 'flex' : 'none';
    if (ok) {
        $('pgs-file-name').textContent = fileInfo.name;
        $('pgs-file-name').title = fileInfo.name;
        $('pgs-file-sub').textContent = fmtSize(fileInfo.size) + ' · 共 ' + fileInfo.pages + ' 页' +
            (fileInfo.size > BIG_FILE ? ' · 文件较大，处理可能较慢' : '');
    }
    $('pgs-preview').style.display = ok ? 'block' : 'none';
    refreshExportState();
}
function updatePager() {
    if (!fileInfo) return;
    $('pgs-pglabel').textContent = '第 ' + curPage + ' / ' + fileInfo.pages + ' 页';
    $('pgs-prev').disabled = curPage <= 1 || busy;
    $('pgs-next').disabled = curPage >= fileInfo.pages || busy;
    $('pgs-jump').max = fileInfo.pages;
}
function updateModebar() {
    var sig = getSig(activeSigId);
    var el = $('pgs-modebar');
    if (!doc) { el.textContent = '上传 PDF 后即可在预览页放置签名。'; return; }
    if (!sig) { el.innerHTML = '请先在上方<b>制作一枚签名</b>，再点击页面空白处放置。'; return; }
    el.innerHTML = '当前签名：<b>' + escapeHtml(sig.name) + '</b> —— 点击页面空白处放置；拖拽已放签名可微调位置，选中后右下角圆点拖拽等比缩放，右上角 × 或 Delete 键删除。';
}
function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}
function refreshChecklist() {
    var box = $('pgs-checklist'), body = $('pgs-checklist-body');
    var rows = [];
    Object.keys(placements).map(Number).sort(function (a, b) { return a - b; }).forEach(function (pg) {
        placements[pg].forEach(function (p) {
            var sig = getSig(p.sigId);
            rows.push({ pg: pg, p: p, sig: sig });
        });
    });
    box.style.display = rows.length ? 'block' : 'none';
    $('pgs-count').textContent = rows.length;
    body.innerHTML = '';
    rows.forEach(function (r) {
        var tr = document.createElement('tr');
        var tdImg = document.createElement('td');
        if (r.sig) {
            var img = document.createElement('img');
            img.src = r.sig.dataURL;
            img.alt = r.sig.name;
            tdImg.appendChild(img);
            var sp = document.createElement('span');
            sp.textContent = ' ' + r.sig.name;
            tdImg.appendChild(sp);
        } else tdImg.textContent = '（已删除）';
        var tdPg = document.createElement('td');
        tdPg.textContent = '第 ' + r.pg + ' 页';
        var tdSz = document.createElement('td');
        tdSz.textContent = Math.round(r.p.w) + ' × ' + Math.round(r.p.h);
        var tdOp = document.createElement('td');
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn';
        btn.style.padding = '.2rem .6rem';
        btn.textContent = '删除';
        btn.addEventListener('click', function () {
            removePlacement(r.pg, r.p.id);
        });
        tdOp.appendChild(btn);
        tr.appendChild(tdImg); tr.appendChild(tdPg); tr.appendChild(tdSz); tr.appendChild(tdOp);
        body.appendChild(tr);
    });
}
function removePlacement(pg, id) {
    if (!placements[pg]) return;
    placements[pg] = placements[pg].filter(function (p) { return p.id !== id; });
    if (selectedPlaceId === id) selectedPlaceId = null;
    renderPlaceLayer();
    refreshChecklist();
    refreshExportState();
}

/* ============ 预览渲染 ============ */
function renderPreview() {
    if (!doc || !fileInfo) return;
    var seq = ++renderSeq;
    var pageNum = curPage;
    doc.getPage(pageNum).then(function (page) {
        if (seq !== renderSeq) return;
        var stageW = $('pgs-stage').clientWidth || 800;
        var base = page.getViewport({ scale: 1 });
        var scale = Math.min(stageW / base.width, 2);
        var viewport = page.getViewport({ scale: scale });
        var pc = $('pgs-page');
        pc.width = Math.ceil(viewport.width);
        pc.height = Math.ceil(viewport.height);
        pageGeom = { wPt: base.width, hPt: base.height, scale: scale };
        return page.render({ canvasContext: pc.getContext('2d'), viewport: viewport }).promise.then(function () {
            if (page.cleanup) page.cleanup();
            if (seq !== renderSeq) return;
            renderPlaceLayer();
            updatePager();
        });
    }).catch(function (e) {
        if (seq !== renderSeq) return;
        showError('预览渲染失败：' + classifyPdfError(e));
    });
}
/* 放置层：把当前页的 placements 按 PDF 磅值 × scale 换成 CSS 像素 */
function renderPlaceLayer() {
    var stage = $('pgs-stage');
    Array.prototype.forEach.call(stage.querySelectorAll('.pgs-sign-el'), function (el) { el.remove(); });
    if (!pageGeom) return;
    var list = placements[curPage] || [];
    var sc = pageGeom.scale;
    list.forEach(function (p) {
        var sig = getSig(p.sigId);
        if (!sig) return;
        var d = document.createElement('div');
        d.className = 'pgs-sign-el' + (p.id === selectedPlaceId ? ' selected' : '');
        d.style.left = (p.x * sc) + 'px';
        d.style.top = (p.y * sc) + 'px';
        d.style.width = (p.w * sc) + 'px';
        d.style.height = (p.h * sc) + 'px';
        var img = document.createElement('img');
        img.src = sig.dataURL;
        img.alt = sig.name;
        img.draggable = false;
        d.appendChild(img);
        var handle = document.createElement('span');
        handle.className = 'handle';
        handle.title = '拖拽等比缩放';
        d.appendChild(handle);
        var cls = document.createElement('span');
        cls.className = 'cls';
        cls.textContent = '×';
        cls.title = '删除这枚签名';
        cls.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
        cls.addEventListener('click', function (e) {
            e.stopPropagation();
            removePlacement(curPage, p.id);
        });
        d.appendChild(cls);
        d.addEventListener('pointerdown', function (e) {
            e.stopPropagation();
            if (busy) return;
            if (selectedPlaceId !== p.id) {
                selectedPlaceId = p.id;
                Array.prototype.forEach.call(stage.querySelectorAll('.pgs-sign-el'), function (x) {
                    x.classList.toggle('selected', x === d);
                });
            }
            startDrag(e, d, p);
        });
        wireResize(handle, p);
        stage.appendChild(d);
    });
}
function clampPlacement(p) {
    p.w = Math.max(MIN_PT, p.w);
    p.h = Math.max(MIN_PT, p.h);
    if (pageGeom) {
        p.w = Math.min(p.w, pageGeom.wPt);
        p.h = Math.min(p.h, pageGeom.hPt);
        p.x = Math.max(0, Math.min(p.x, pageGeom.wPt - p.w));
        p.y = Math.max(0, Math.min(p.y, pageGeom.hPt - p.h));
    }
}
/* 拖拽定位：选择与拖拽在同一个 pointerdown 里启动，避免重建 DOM 导致指针捕获失效 */
function startDrag(e, el, p) {
    el.setPointerCapture(e.pointerId);
    var sc = pageGeom.scale;
    var startCX = e.clientX, startCY = e.clientY;
    var ox = p.x, oy = p.y;
    var moved = false;
    function onMove(ev) {
        var dx = (ev.clientX - startCX) / sc, dy = (ev.clientY - startCY) / sc;
        if (Math.abs(dx) + Math.abs(dy) > 1.5) moved = true;
        p.x = ox + dx; p.y = oy + dy;
        clampPlacement(p);
        el.style.left = (p.x * sc) + 'px';
        el.style.top = (p.y * sc) + 'px';
    }
    function onUp() {
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerup', onUp);
        el.removeEventListener('pointercancel', onUp);
        if (moved) { refreshChecklist(); }
    }
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
}
function wireResize(handle, p) {
    handle.addEventListener('pointerdown', function (e) {
        e.stopPropagation();
        if (busy) return;
        handle.setPointerCapture(e.pointerId);
        var sc = pageGeom.scale;
        var startCX = e.clientX, startCY = e.clientY;
        var ow = p.w, oh = p.h, ratio = ow / oh;
        function onMove(ev) {
            var dw = (ev.clientX - startCX) / sc;
            var nw = Math.max(MIN_PT, ow + dw);
            p.w = nw;
            p.h = nw / ratio;
            clampPlacement(p);
            var el = handle.parentElement;
            el.style.width = (p.w * sc) + 'px';
            el.style.height = (p.h * sc) + 'px';
        }
        function onUp() {
            handle.removeEventListener('pointermove', onMove);
            handle.removeEventListener('pointerup', onUp);
            handle.removeEventListener('pointercancel', onUp);
            refreshChecklist();
        }
        handle.addEventListener('pointermove', onMove);
        handle.addEventListener('pointerup', onUp);
        handle.addEventListener('pointercancel', onUp);
    });
}
/* 点击页面空白处放置签名 */
function initPlaceClick() {
    $('pgs-stage').addEventListener('click', function (e) {
        if (busy || !doc || !pageGeom) return;
        if (e.target.closest('.pgs-sign-el')) return;   // 点在已放签名上：走选择/拖拽
        selectedPlaceId = null;
        var sig = getSig(activeSigId);
        if (!sig) { toast('请先在上方制作并点选一枚签名'); return; }
        e.stopPropagation(); // 放置后不让 document 级取消选中立刻反选
        var pc = $('pgs-page');
        var rect = pc.getBoundingClientRect();
        var sc = pageGeom.scale;
        var wPt = PLACE_W_PT, hPt = PLACE_W_PT * (sig.ph / sig.pw);
        var xPt = (e.clientX - rect.left) / sc - wPt / 2;
        var yPt = (e.clientY - rect.top) / sc - hPt / 2;
        var p = { id: 'p' + (++placeSeq), sigId: sig.id, x: xPt, y: yPt, w: wPt, h: hPt };
        clampPlacement(p);
        if (!placements[curPage]) placements[curPage] = [];
        placements[curPage].push(p);
        selectedPlaceId = p.id;
        renderPlaceLayer();
        refreshChecklist();
        refreshExportState();
    });
}

/* ============ 文件加载 ============ */
function handleFiles(files) {
    if (busy) return;
    var f = files[0];
    if (!f) return;
    if (files.length > 1) toast('一次只处理一个 PDF，已取第一个');
    if (!isPdfFile(f)) { showError('请选择 PDF 文件（.pdf）'); toast('请选择 PDF 文件'); return; }
    if (f.size > BIG_FILE) toast('文件较大，处理可能较慢，请耐心等待');
    hideLibError();
    showError('');
    hideProgress();
    if (doc) { doc.destroy(); doc = null; }
    fileInfo = null;
    fileBuf = null;
    pageGeom = null;
    placements = {};
    placeSeq = 0;
    selectedPlaceId = null;
    renderFileInfo();
    refreshChecklist();
    setStatus('正在加载 PDF 渲染组件…');
    ensurePdfJs().then(function () {
        setStatus('正在读取 PDF…');
        return f.arrayBuffer();
    }).then(function (buf) {
        fileBuf = buf;
        return window.pdfjsLib.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise;
    }).then(function (pdf) {
        doc = pdf;
        curPage = 1;
        fileInfo = { name: f.name, size: f.size, pages: pdf.numPages, base: baseName(f.name) };
        setStatus('');
        renderFileInfo();
        refreshChecklist();
        updateModebar();
        renderPreview();
        toast('已读取「' + f.name + '」，共 ' + pdf.numPages + ' 页');
    }).catch(function (e) {
        setStatus('');
        doc = null;
        fileInfo = null;
        fileBuf = null;
        renderFileInfo();
        if (!window.pdfjsLib) {
            showLibError('PDF 渲染库（pdf.js）');
        } else {
            showError('「' + f.name + '」' + classifyPdfError(e));
        }
    });
}
$('pgs-clear').addEventListener('click', function () {
    if (busy) return;
    if (doc) { doc.destroy(); }
    doc = null;
    fileInfo = null;
    fileBuf = null;
    pageGeom = null;
    placements = {};
    selectedPlaceId = null;
    renderSeq++;
    showError('');
    hideProgress();
    renderFileInfo();
    refreshChecklist();
    updateModebar();
});

/* ============ dataURL → 字节（供 pdf-lib embedPng） ============ */
function dataURLToBytes(dataURL) {
    var base64 = dataURL.split(',')[1];
    var bin = window.atob(base64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
}

/* ============ 导出 ============ */
$('pgs-export').addEventListener('click', function () {
    if (busy) return;
    if (totalPlacements() === 0) { showError('还没有放置任何签名：先点选签名，再点击页面放置。'); return; }
    hideLibError();
    showError('');
    busy = true;
    refreshExportState();
    updatePager();
    showProgress('正在加载 PDF 处理组件…', 0);
    ensurePdfLib().then(function () {
        return window.PDFLib.PDFDocument.load(fileBuf.slice(0), { ignoreEncryption: false });
    }).then(function (pdfDoc) {
        var pdfPages = pdfDoc.getPages();
        var total = pdfPages.length;
        var imgCache = {}; // sigId -> embedded image
        var embedOne = function (sigId) {
            if (imgCache[sigId]) return Promise.resolve(imgCache[sigId]);
            var sig = getSig(sigId);
            if (!sig) return Promise.reject(new Error('签名已删除，请重新放置'));
            return pdfDoc.embedPng(dataURLToBytes(sig.dataURL)).then(function (img) {
                imgCache[sigId] = img;
                return img;
            });
        };
        var chain = Promise.resolve();
        Object.keys(placements).map(Number).sort(function (a, b) { return a - b; }).forEach(function (pg) {
            chain = chain.then(function () {
                showProgress('正在写入第 ' + pg + ' 页的签名', pg / total * 0.9);
                var page = pdfPages[pg - 1];
                if (!page) return null;
                var size = page.getSize();
                var seq2 = Promise.resolve();
                (placements[pg] || []).forEach(function (p) {
                    seq2 = seq2.then(function () {
                        return embedOne(p.sigId).then(function (img) {
                            // y 轴换算：放置坐标 y 向下（pdf.js），pdf-lib 原点在左下
                            page.drawImage(img, {
                                x: p.x,
                                y: size.height - p.y - p.h,
                                width: p.w,
                                height: p.h
                            });
                        });
                    });
                });
                return seq2.then(nextFrame);
            });
        });
        return chain.then(function () {
            showProgress('正在生成 PDF 文件…', 1);
            return pdfDoc.save();
        });
    }).then(function (bytes) {
        downloadBlob(new Blob([bytes], { type: 'application/pdf' }), 'signed_' + fileInfo.base + '.pdf');
        toast('已导出已签名 PDF：signed_' + fileInfo.base + '.pdf（共 ' + totalPlacements() + ' 处签名）');
    }).catch(function (e) {
        if (!window.PDFLib) {
            showLibError('PDF 处理库（pdf-lib）');
        } else if (/encrypt/i.test((e && e.message) || '')) {
            showError('该 PDF 已加密，无法写入签名，请先解密后再试');
        } else {
            showError('导出失败：' + (e && e.message ? e.message : '请换一个文件重试'));
        }
    }).then(function () {
        busy = false;
        hideProgress();
        refreshExportState();
        updatePager();
    });
});

/* ============ 翻页 ============ */
function goPage(n) {
    if (busy || !fileInfo) return;
    n = Math.max(1, Math.min(fileInfo.pages, Number(n) || 1));
    if (n === curPage) return;
    curPage = n;
    selectedPlaceId = null;
    renderPreview();
}
$('pgs-prev').addEventListener('click', function () { goPage(curPage - 1); });
$('pgs-next').addEventListener('click', function () { goPage(curPage + 1); });
$('pgs-jump-go').addEventListener('click', function () { goPage($('pgs-jump').value); });
$('pgs-jump').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); goPage($('pgs-jump').value); }
});
var resizeTimer = null, lastStageW = 0;
window.addEventListener('resize', function () {
    if (!doc) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
        var w = $('pgs-stage').clientWidth;
        if (w && Math.abs(w - lastStageW) > 8) { lastStageW = w; renderPreview(); }
    }, 250);
});
/* Delete 键删除选中的已放签名 */
document.addEventListener('keydown', function (e) {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedPlaceId) {
        var tag = (document.activeElement && document.activeElement.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        removePlacement(curPage, selectedPlaceId);
    }
});
/* 点击空白处取消选中 */
document.addEventListener('click', function (e) {
    if (selectedPlaceId && !e.target.closest('.pgs-sign-el') && !e.target.closest('#pgs-checklist')) {
        selectedPlaceId = null;
        renderPlaceLayer();
    }
});

/* ============ 绑定上传区 ============ */
var zone = $('pgs-upload'), input = $('pgs-file');
zone.addEventListener('click', function () { input.click(); });
zone.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
input.addEventListener('change', function () {
    if (input.files.length) handleFiles(input.files);
    input.value = '';
});
['dragenter', 'dragover'].forEach(function (ev) {
    zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add('dragover'); });
});
['dragleave', 'drop'].forEach(function (ev) {
    zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.remove('dragover'); });
});
zone.addEventListener('drop', function (e) {
    if (e.dataTransfer && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
});

/* ============ 初始化 ============ */
initTabs();
initPad();
initImagePane();
initTextPane();
initPlaceClick();
loadSigs();
renderSigList();
renderFileInfo();
refreshChecklist();
updateModebar();
})();
