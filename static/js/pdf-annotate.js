/* PDF 批注打码 - 纯前端本地处理（pdf.js 预览 + pdf-lib 回写）
 * 预览：pdf.js 逐页渲染到 canvas；透明覆盖层用同一套 PDF 磅值坐标绘制批注，所见即所得。
 * 交互：涂抹打码（矩形框选，黑/白/灰不透明遮罩）、荧光笔高亮（拖拽画笔，半透明
 * 黄/绿/粉、线宽三档）、文字标注（点击放置，字号/颜色可调）。批注按页存储，翻页保留。
 * 导出：坐标按渲染 scale 映射回 PDF 磅值，pdf-lib 逐页 drawRectangle——打码块不透明
 * 覆盖、高亮按画笔路径包络矩形半透明覆盖；文字标注走 PNG stamp 嵌入；未批注页原样保留。
 * 诚实说明：打码为视觉覆盖遮罩，底层文字层未被删除。
 * pdf.js 与 pdf-lib 均经 CDN 懒加载；文件只在浏览器本地以 ArrayBuffer 处理，不上传服务器。 */
(function () {
'use strict';
var PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
var PDFJS_WORKER_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
var PDFLIB_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
var BIG_FILE = 50 * 1024 * 1024;
var STAMP_SCALE = 2;      // 文字标注导出 stamp 渲染倍率（相对 PDF 磅值尺寸）
var STAMP_MAX_PX = 4200;  // stamp 单边像素上限，防超大页面内存爆掉
var HL_OPACITY = 0.4;     // 高亮透明度（预览与导出一致）

function hexToRgb(hex) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return {
        r: parseInt(h.substr(0, 2), 16) / 255,
        g: parseInt(h.substr(2, 2), 16) / 255,
        b: parseInt(h.substr(4, 2), 16) / 255
    };
}

var doc = null;        // pdf.js PDFDocumentProxy
var fileBuf = null;    // 原始 ArrayBuffer（供 pdf-lib 回写）
var fileInfo = null;   // {name,size,pages,base}
var curPage = 1;
var busy = false;
var renderSeq = 0;     // 预览渲染序号，防翻页竞态
var pageGeom = null;   // 当前预览页 {wPt,hPt,scale}，scale = 设备像素 / PDF 磅值
var annos = {};        // 页号 -> [{type:'redact'|'hl'|'text', ...}，坐标均为 PDF 磅值、y 轴向下]
var tool = 'redact';   // redact | highlight | text
var redactColor = '#111827';
var hlColor = '#ffe14d';
var hlWidth = 8;       // 荧光笔线宽（PDF 磅值）
var textSize = 28;     // 文字标注字号（PDF 磅值）
var textColor = '#ef4444';
var draft = null;      // 正在绘制的草稿 {kind, x0,y0,x1,y1, pts:[{x,y}]}

function $(id) { return document.getElementById(id); }
function toast(m) {
    var el = document.createElement('div');
    el.textContent = m;
    el.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:#111827;color:#fff;padding:.6rem 1.2rem;border-radius:.5rem;z-index:9999;font-size:.9rem;max-width:86vw;text-align:center;';
    document.body.appendChild(el);
    setTimeout(function () { if (el.parentNode) document.body.removeChild(el); }, 3000);
}
function setStatus(m) { $('pan-status').textContent = m || ''; }
function showError(m) { $('pan-error').textContent = m || ''; }
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
    $('pan-progress').style.display = 'block';
    $('pan-progress-bar').style.width = Math.round(frac * 100) + '%';
    $('pan-progress-txt').textContent = text;
}
function hideProgress() {
    $('pan-progress').style.display = 'none';
    $('pan-progress-bar').style.width = '0';
    $('pan-progress-txt').textContent = '';
}
function nextFrame() {
    return new Promise(function (resolve) {
        if (window.requestAnimationFrame) requestAnimationFrame(function () { setTimeout(resolve, 0); });
        else setTimeout(resolve, 30);
    });
}

/* ============ CDN 懒加载（与 pdf_watermark / pdf_merge_split 同款按需加载 + 失败提示） ============ */
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
    var el = $('pan-lib-error');
    el.style.display = 'block';
    el.textContent = what + '库加载失败，请检查网络后重试（页面本身不受影响）。';
}
function hideLibError() { $('pan-lib-error').style.display = 'none'; $('pan-lib-error').textContent = ''; }

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

/* ============ 批注绘制（坐标均为 PDF 磅值，函数内部按 scale 换算为设备像素） ============ */
function drawRedactRect(ctx, a, scale) {
    ctx.fillStyle = a.color;
    ctx.globalAlpha = 1;
    ctx.fillRect(a.x * scale, a.y * scale, a.w * scale, a.h * scale);
}
function drawHlAnno(ctx, a, scale) {
    ctx.strokeStyle = a.color;
    ctx.globalAlpha = HL_OPACITY;
    ctx.lineWidth = a.width * scale;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    var pts = a.pts;
    if (pts.length === 1) {
        ctx.beginPath();
        ctx.moveTo(pts[0].x * scale, pts[0].y * scale);
        ctx.lineTo((pts[0].x + 0.5) * scale, (pts[0].y + 0.5) * scale);
        ctx.stroke();
        return;
    }
    ctx.beginPath();
    ctx.moveTo(pts[0].x * scale, pts[0].y * scale);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x * scale, pts[i].y * scale);
    ctx.stroke();
    ctx.globalAlpha = 1;
}
function drawTextAnno(ctx, a, scale) {
    ctx.save();
    ctx.fillStyle = a.color;
    ctx.globalAlpha = 1;
    ctx.font = '700 ' + (a.size * scale) + 'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC","Source Han Sans SC",sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(a.text, a.x * scale, a.y * scale);
    ctx.restore();
}
function drawAnno(ctx, a, scale) {
    if (a.type === 'redact') drawRedactRect(ctx, a, scale);
    else if (a.type === 'hl') drawHlAnno(ctx, a, scale);
    else if (a.type === 'text') drawTextAnno(ctx, a, scale);
}
/* 草稿绘制（预览叠加层上，像素空间 -> 按 scale 换算进磅值空间） */
function drawDraft(ctx, scale) {
    if (!draft) return;
    if (draft.kind === 'redact') {
        var x = Math.min(draft.x0, draft.x1), y = Math.min(draft.y0, draft.y1);
        ctx.save();
        ctx.fillStyle = redactColor;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(x * scale, y * scale, Math.abs(draft.x1 - draft.x0) * scale, Math.abs(draft.y1 - draft.y0) * scale);
        ctx.restore();
    } else if (draft.kind === 'hl') {
        drawHlAnno(ctx, { type: 'hl', color: hlColor, width: hlWidth, pts: draft.pts }, scale);
    }
}

/* ============ 界面状态 ============ */
function pageList() {
    if (!annos[curPage]) annos[curPage] = [];
    return annos[curPage];
}
function totalAnnos() {
    var n = 0;
    Object.keys(annos).forEach(function (k) { n += annos[k].length; });
    return n;
}
function refreshButtons() {
    var has = pageList().length > 0;
    $('pan-undo').disabled = !has || busy;
    $('pan-clear').disabled = !has || busy;
    $('pan-export').disabled = !(doc && fileInfo && totalAnnos() > 0) || busy;
}
function renderFileInfo() {
    var box = $('pan-fileinfo');
    var ok = doc && fileInfo;
    box.style.display = ok ? 'flex' : 'none';
    if (ok) {
        $('pan-file-name').textContent = fileInfo.name;
        $('pan-file-name').title = fileInfo.name;
        $('pan-file-sub').textContent = fmtSize(fileInfo.size) + ' · 共 ' + fileInfo.pages + ' 页 · 已批注 ' + totalAnnos() + ' 处' +
            (fileInfo.size > BIG_FILE ? ' · 文件较大，处理可能较慢' : '');
    }
    $('pan-work').style.display = ok ? 'block' : 'none';
    refreshButtons();
}
function updatePager() {
    if (!fileInfo) return;
    $('pan-pglabel').textContent = '第 ' + curPage + ' / ' + fileInfo.pages + ' 页';
    $('pan-goto').value = '';
    $('pan-prev').disabled = curPage <= 1 || busy;
    $('pan-next').disabled = curPage >= fileInfo.pages || busy;
    $('pan-goto-btn').disabled = busy;
    $('pan-pageann').textContent = pageList().length ? '本页已有 ' + pageList().length + ' 处批注' : '本页暂无批注，用上面的工具在页面上涂抹/高亮';
}

/* ============ 预览渲染 ============ */
function renderPreview() {
    if (!doc || !fileInfo) return;
    var seq = ++renderSeq;
    var pageNum = curPage;
    doc.getPage(pageNum).then(function (page) {
        if (seq !== renderSeq) return;
        var stageW = $('pan-stage').clientWidth || 800;
        var base = page.getViewport({ scale: 1 });
        var scale = Math.min(stageW / base.width, 2);
        var viewport = page.getViewport({ scale: scale });
        var pc = $('pan-page');
        pc.width = Math.ceil(viewport.width);
        pc.height = Math.ceil(viewport.height);
        pageGeom = { wPt: base.width, hPt: base.height, scale: scale };
        return page.render({ canvasContext: pc.getContext('2d'), viewport: viewport }).promise.then(function () {
            if (page.cleanup) page.cleanup();
            if (seq !== renderSeq) return;
            redrawOverlay();
            updatePager();
        });
    }).catch(function (e) {
        if (seq !== renderSeq) return;
        showError('预览渲染失败：' + classifyPdfError(e));
    });
}
function redrawOverlay() {
    var oc = $('pan-overlay'), pc = $('pan-page');
    if (!pageGeom || !pc.width) return;
    oc.width = pc.width;
    oc.height = pc.height;
    var ctx = oc.getContext('2d');
    ctx.clearRect(0, 0, oc.width, oc.height);
    /* drawAnno 内部已按 scale 把磅值坐标换算成设备像素，此处不再 ctx.scale，避免双重缩放 */
    pageList().forEach(function (a) { drawAnno(ctx, a, pageGeom.scale); });
    drawDraft(ctx, pageGeom.scale);
}

/* ============ 覆盖层交互（框选 / 画笔 / 文本放置） ============ */
function toPoints(e) {
    var oc = $('pan-overlay');
    var r = oc.getBoundingClientRect();
    var px = (e.clientX - r.left) * (oc.width / r.width);
    var py = (e.clientY - r.top) * (oc.height / r.height);
    return { x: px / pageGeom.scale, y: py / pageGeom.scale };
}
function startStroke(e) {
    if (busy || !pageGeom) return;
    if (e.button != null && e.button !== 0) return;
    var p = toPoints(e);
    if (p.x < 0 || p.y < 0 || p.x > pageGeom.wPt || p.y > pageGeom.hPt) return;
    if (tool === 'text') {
        placeText(p);
        return;
    }
    draft = tool === 'redact'
        ? { kind: 'redact', x0: p.x, y0: p.y, x1: p.x, y1: p.y }
        : { kind: 'hl', pts: [p] };
    e.preventDefault();
}
function moveStroke(e) {
    if (!draft || busy || !pageGeom) return;
    var p = toPoints(e);
    p.x = Math.max(0, Math.min(pageGeom.wPt, p.x));
    p.y = Math.max(0, Math.min(pageGeom.hPt, p.y));
    if (draft.kind === 'redact') { draft.x1 = p.x; draft.y1 = p.y; }
    else {
        var last = draft.pts[draft.pts.length - 1];
        var dx = p.x - last.x, dy = p.y - last.y;
        if (dx * dx + dy * dy >= 4) draft.pts.push(p); // 2pt 间隔采样，控内存
    }
    redrawOverlay();
    if (e.cancelable) e.preventDefault();
}
function endStroke(e) {
    if (!draft) return;
    var d = draft;
    draft = null;
    if (d.kind === 'redact') {
        var x = Math.min(d.x0, d.x1), y = Math.min(d.y0, d.y1);
        var w = Math.abs(d.x1 - d.x0), h = Math.abs(d.y1 - d.y0);
        if (w >= 2 && h >= 2) {
            pageList().push({ type: 'redact', x: x, y: y, w: w, h: h, color: redactColor });
        } else {
            toast('框选区域太小，已忽略');
        }
    } else {
        if (d.pts.length > 0) {
            pageList().push({ type: 'hl', color: hlColor, width: hlWidth, pts: d.pts });
        }
    }
    redrawOverlay();
    updatePager();
    refreshButtons();
    renderFileInfo();
}
function placeText(p) {
    var text = $('pan-text').value.trim();
    if (!text) { toast('请先在左侧输入标注文字'); $('pan-text').focus(); return; }
    pageList().push({ type: 'text', text: text, x: p.x, y: p.y, size: textSize, color: textColor });
    redrawOverlay();
    updatePager();
    refreshButtons();
    renderFileInfo();
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
    annos = {};
    draft = null;
    renderSeq++;
    renderFileInfo();
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
        renderPreview();
        toast('已读取「' + f.name + '」，共 ' + pdf.numPages + ' 页');
    }).catch(function (e) {
        setStatus('');
        doc = null;
        fileInfo = null;
        fileBuf = null;
        renderSeq++;
        renderFileInfo();
        if (!window.pdfjsLib) {
            showLibError('PDF 渲染库（pdf.js）');
        } else {
            showError('「' + f.name + '」' + classifyPdfError(e));
        }
    });
}
$('pan-clear-file').addEventListener('click', function () {
    if (busy) return;
    if (doc) { doc.destroy(); }
    doc = null;
    fileInfo = null;
    fileBuf = null;
    pageGeom = null;
    annos = {};
    draft = null;
    renderSeq++;
    showError('');
    hideProgress();
    renderFileInfo();
});

/* ============ 导出 ============ */
function canvasToPngBytes(canvas) {
    return new Promise(function (resolve, reject) {
        try {
            canvas.toBlob(function (b) {
                if (!b) { reject(new Error('stamp blob')); return; }
                b.arrayBuffer().then(resolve, reject);
            }, 'image/png');
        } catch (e) { reject(e); }
    });
}
/* 文本标注走整页 PNG stamp（本地系统字体渲染，绕开 pdf-lib 标准字体不支持中文的问题） */
function exportTextStamp(pdfDoc, page, texts, wPt, hPt) {
    var scale = STAMP_SCALE;
    var maxSide = Math.max(wPt, hPt) * scale;
    if (maxSide > STAMP_MAX_PX) scale = STAMP_MAX_PX / Math.max(wPt, hPt);
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(wPt * scale));
    canvas.height = Math.max(1, Math.round(hPt * scale));
    var ctx = canvas.getContext('2d');
    /* drawTextAnno 内部已按 scale 换算坐标与字号，不再 ctx.scale，避免双重缩放 */
    texts.forEach(function (a) { drawTextAnno(ctx, a, scale); });
    return canvasToPngBytes(canvas).then(function (pngBytes) {
        canvas.width = 0; canvas.height = 0;
        return pdfDoc.embedPng(pngBytes);
    }).then(function (img) {
        page.drawImage(img, { x: 0, y: 0, width: wPt, height: hPt });
    });
}
/* 高亮按画笔路径包络矩形导出半透明色块；打码块按所选颜色不透明填充覆盖。 */
function exportAnnoRects(page, list, wPt, hPt) {
    list.forEach(function (a) {
        if (a.type === 'redact') {
            var c = hexToRgb(a.color);
            page.drawRectangle({
                x: a.x, y: hPt - a.y - a.h, width: a.w, height: a.h,
                color: window.PDFLib.rgb(c.r, c.g, c.b), opacity: 1
            });
        } else if (a.type === 'hl') {
            var minX = a.pts[0].x, maxX = a.pts[0].x, minY = a.pts[0].y, maxY = a.pts[0].y;
            a.pts.forEach(function (p) {
                if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
                if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
            });
            var pad = a.width / 2;
            minX -= pad; minY -= pad; maxX += pad; maxY += pad;
            var c2 = hexToRgb(a.color);
            page.drawRectangle({
                x: minX, y: hPt - maxY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY),
                color: window.PDFLib.rgb(c2.r, c2.g, c2.b), opacity: HL_OPACITY
            });
        }
    });
}
$('pan-export').addEventListener('click', function () {
    if (busy || totalAnnos() === 0) return;
    hideLibError();
    showError('');
    busy = true;
    refreshButtons();
    updatePager();
    showProgress('正在加载 PDF 处理组件…', 0);
    ensurePdfLib().then(function () {
        return window.PDFLib.PDFDocument.load(fileBuf.slice(0), { ignoreEncryption: false });
    }).then(function (pdfDoc) {
        var pdfPages = pdfDoc.getPages();
        var total = pdfPages.length;
        var annotatedPages = 0;
        var chain = Promise.resolve();
        pdfPages.forEach(function (page, idx) {
            chain = chain.then(function () {
                var n = idx + 1;
                showProgress('正在处理第 ' + n + ' / ' + total + ' 页', n / total);
                var list = annos[n];
                if (!list || !list.length) return null; // 未批注页原样保留
                annotatedPages++;
                var size = page.getSize();
                var wPt = size.width, hPt = size.height;
                var texts = list.filter(function (a) { return a.type === 'text'; });
                exportAnnoRects(page, list, wPt, hPt);
                if (texts.length) {
                    return exportTextStamp(pdfDoc, page, texts, wPt, hPt).then(nextFrame);
                }
                return nextFrame();
            });
        });
        return chain.then(function () {
            showProgress('正在生成 PDF 文件…', 1);
            return pdfDoc.save();
        }).then(function (bytes) { return { bytes: bytes, count: annotatedPages }; });
    }).then(function (r) {
        downloadBlob(new Blob([r.bytes], { type: 'application/pdf' }), 'annotated_' + fileInfo.base + '.pdf');
        toast('已导出批注 PDF：annotated_' + fileInfo.base + '.pdf（共批注 ' + totalAnnos() + ' 处）');
    }).catch(function (e) {
        if (!window.PDFLib) {
            showLibError('PDF 处理库（pdf-lib）');
        } else if (/encrypt/i.test((e && e.message) || '')) {
            showError('该 PDF 已加密，无法写回批注，请先解密后再试');
        } else {
            showError('导出失败：PDF 可能已损坏或格式不受支持，请换一个文件重试');
        }
    }).then(function () {
        busy = false;
        hideProgress();
        refreshButtons();
        updatePager();
        renderFileInfo();
    });
});
/* ============ 工具栏 ============ */
function setTool(t) {
    tool = t;
    draft = null;
    var map = { redact: 'pan-tool-redact', highlight: 'pan-tool-hl', text: 'pan-tool-text' };
    Object.keys(map).forEach(function (k) {
        $('pan-toolbox').querySelector('#' + map[k]).classList.toggle('active', k === t);
    });
    $('pan-textopts').style.display = t === 'text' ? '' : 'none';
    redrawOverlay();
}
$('pan-toolbox').addEventListener('click', function (e) {
    var btn = e.target.closest('.pan-tool');
    if (!btn || btn.disabled) return;
    setTool(btn.getAttribute('data-tool'));
});
function bindSwatches(wrapId, fn) {
    Array.prototype.forEach.call(document.querySelectorAll('#' + wrapId + ' .pan-swatch'), function (btn) {
        btn.addEventListener('click', function () {
            fn(btn.getAttribute('data-color'));
            Array.prototype.forEach.call(document.querySelectorAll('#' + wrapId + ' .pan-swatch'), function (b) {
                b.classList.toggle('sel', b === btn);
            });
            redrawOverlay();
        });
    });
}
bindSwatches('pan-redact-colors', function (c) { redactColor = c; });
bindSwatches('pan-hl-colors', function (c) { hlColor = c; });
bindSwatches('pan-text-colors', function (c) { textColor = c; });
Array.prototype.forEach.call(document.querySelectorAll('input[name="pan-hlwidth"]'), function (r) {
    r.addEventListener('change', function () { hlWidth = Number(r.value); });
});
Array.prototype.forEach.call(document.querySelectorAll('input[name="pan-textsize"]'), function (r) {
    r.addEventListener('change', function () {
        textSize = Number(r.value);
        $('pan-textsize-val').textContent = textSize + 'pt';
    });
});
$('pan-undo').addEventListener('click', function () {
    if (busy) return;
    var list = pageList();
    if (list.length) {
        list.pop();
        redrawOverlay();
        updatePager();
        refreshButtons();
        renderFileInfo();
        toast('已撤销上一步批注');
    }
});
$('pan-clear').addEventListener('click', function () {
    if (busy) return;
    var list = pageList();
    if (list.length && confirm('确定清空当前页的全部 ' + list.length + ' 处批注吗？')) {
        list.length = 0;
        redrawOverlay();
        updatePager();
        refreshButtons();
        renderFileInfo();
        toast('已清空当前页批注');
    }
});

/* ============ 翻页 / 跳页 ============ */
$('pan-prev').addEventListener('click', function () {
    if (busy || curPage <= 1) return;
    draft = null;
    curPage--;
    renderPreview();
});
$('pan-next').addEventListener('click', function () {
    if (busy || !fileInfo || curPage >= fileInfo.pages) return;
    draft = null;
    curPage++;
    renderPreview();
});
$('pan-goto-btn').addEventListener('click', function () { doGoto(); });
$('pan-goto').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); doGoto(); }
});
function doGoto() {
    if (busy || !fileInfo) return;
    var n = parseInt($('pan-goto').value, 10);
    if (!n || n < 1 || n > fileInfo.pages) {
        toast('请输入 1 到 ' + fileInfo.pages + ' 之间的页码');
        return;
    }
    if (n === curPage) return;
    draft = null;
    curPage = n;
    renderPreview();
}
var resizeTimer = null, lastStageW = 0;
window.addEventListener('resize', function () {
    if (!doc) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
        var w = $('pan-stage').clientWidth;
        if (w && Math.abs(w - lastStageW) > 8) { lastStageW = w; renderPreview(); }
    }, 250);
});

/* ============ 绑定上传区 ============ */
var zone = $('pan-upload'), input = $('pan-file');
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

/* ============ 覆盖层指针事件 ============ */
var overlay = $('pan-overlay');
overlay.addEventListener('pointerdown', startStroke);
window.addEventListener('pointermove', moveStroke);
window.addEventListener('pointerup', endStroke);
window.addEventListener('pointercancel', endStroke);

renderFileInfo();
setTool('redact');
})();
