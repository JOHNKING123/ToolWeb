/* PDF 加水印 - 纯前端本地处理（pdf.js 预览 + pdf-lib 回写）
 * 预览：pdf.js 渲染页面到 canvas，叠加层用同一套参数在 canvas 2D 绘制水印，所见即所得。
 * 导出：水印先经离屏 canvas 绘成透明 PNG stamp（本地系统字体渲染，绕开 pdf-lib 标准字体
 * 不支持中文的问题），再由 pdf-lib 逐页 embedPng 覆盖全页；未选页面原样保留。
 * pdf.js 与 pdf-lib 均经 CDN 懒加载；文件只在浏览器本地以 ArrayBuffer 处理，不上传服务器。 */
(function () {
'use strict';
var PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
var PDFJS_WORKER_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
var PDFLIB_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
var BIG_FILE = 50 * 1024 * 1024;
var STAMP_SCALE = 2;      // 导出 stamp 渲染倍率（相对 PDF 磅值尺寸）
var STAMP_MAX_PX = 4200;  // stamp 单边像素上限，防超大页面内存爆掉

var doc = null;        // pdf.js PDFDocumentProxy
var fileBuf = null;    // 原始 ArrayBuffer（供 pdf-lib 回写）
var fileInfo = null;   // {name,size,pages,base}
var curPage = 1;
var busy = false;
var renderSeq = 0;     // 预览渲染序号，防翻页竞态
var pageGeom = null;   // 当前预览页 {wPt,hPt,scale}

function $(id) { return document.getElementById(id); }
function toast(m) {
    var el = document.createElement('div');
    el.textContent = m;
    el.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:#111827;color:#fff;padding:.6rem 1.2rem;border-radius:.5rem;z-index:9999;font-size:.9rem;max-width:86vw;text-align:center;';
    document.body.appendChild(el);
    setTimeout(function () { if (el.parentNode) document.body.removeChild(el); }, 3000);
}
function setStatus(m) { $('pwm-status').textContent = m || ''; }
function showError(m) { $('pwm-error').textContent = m || ''; }
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
function checkedVal(name) {
    var el = document.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : '';
}
function showProgress(text, frac) {
    $('pwm-progress').style.display = 'block';
    $('pwm-progress-bar').style.width = Math.round(frac * 100) + '%';
    $('pwm-progress-txt').textContent = text;
}
function hideProgress() {
    $('pwm-progress').style.display = 'none';
    $('pwm-progress-bar').style.width = '0';
    $('pwm-progress-txt').textContent = '';
}
function nextFrame() {
    return new Promise(function (resolve) {
        if (window.requestAnimationFrame) requestAnimationFrame(function () { setTimeout(resolve, 0); });
        else setTimeout(resolve, 30);
    });
}

/* ============ CDN 懒加载（与 pdf-to-image / pdf-merge-split 同款按需加载 + 失败提示） ============ */
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
    var el = $('pwm-lib-error');
    el.style.display = 'block';
    el.textContent = what + '库加载失败，请检查网络后重试（页面本身不受影响）。';
}
function hideLibError() { $('pwm-lib-error').style.display = 'none'; $('pwm-lib-error').textContent = ''; }

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

/* ============ 水印设置 ============ */
function getSettings() {
    return {
        text: $('pwm-text').value.replace(/\s+$/g, ''),
        size: Number($('pwm-size').value) || 36,
        opacity: (Number($('pwm-opacity').value) || 30) / 100,
        angle: Number($('pwm-angle').value) || 0,
        color: $('pwm-color').value || '#9ca3af',
        mode: checkedVal('pwm-mode') === 'tile' ? 'tile' : 'center',
        cols: Number($('pwm-cols').value) || 3
    };
}

/* 水印绘制：坐标统一用 PDF 磅值空间（wPt×hPt），ctx 已按 scale 缩放。
 * 预览与导出共用此函数，保证参数语义一致、所见即所得。 */
function paintWatermark(ctx, wPt, hPt, st) {
    if (!st.text) return;
    ctx.save();
    ctx.fillStyle = st.color;
    ctx.globalAlpha = st.opacity;
    ctx.font = '700 ' + st.size + 'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC","Source Han Sans SC",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var rad = st.angle * Math.PI / 180;
    if (st.mode === 'center') {
        ctx.translate(wPt / 2, hPt / 2);
        ctx.rotate(rad);
        ctx.fillText(st.text, 0, 0);
    } else {
        var stepX = wPt / st.cols;
        var stepY = Math.max(st.size * 2.4, stepX * 0.55);
        var row = 0;
        for (var y = stepY / 2; y < hPt + stepY; y += stepY, row++) {
            var startX = stepX / 2 + (row % 2 ? stepX / 2 : 0);
            for (var x = startX; x < wPt + stepX; x += stepX) {
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(rad);
                ctx.fillText(st.text, 0, 0);
                ctx.restore();
            }
        }
    }
    ctx.restore();
}
/* 生成一张覆盖整页的透明 stamp canvas（像素尺寸 = 磅值 × scale） */
function createStamp(wPt, hPt, st) {
    var scale = STAMP_SCALE;
    var maxSide = Math.max(wPt, hPt) * scale;
    if (maxSide > STAMP_MAX_PX) scale = STAMP_MAX_PX / Math.max(wPt, hPt);
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(wPt * scale));
    canvas.height = Math.max(1, Math.round(hPt * scale));
    var ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    paintWatermark(ctx, wPt, hPt, st);
    return canvas;
}
function releaseCanvas(canvas) {
    if (!canvas) return;
    canvas.width = 0;
    canvas.height = 0;
}
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

/* ============ 页码范围解析（与 pdf_merge_split 拆分 / pdf_to_image 同一语义） ============ */
function parseRange(text, total) {
    var cleaned = String(text == null ? '' : text).replace(/，/g, ',').replace(/[－–—]/g, '-').replace(/\s+/g, '');
    if (!cleaned) return { error: '请先输入页码范围，例如 1-3,5' };
    var set = {};
    var tokens = cleaned.split(',');
    for (var i = 0; i < tokens.length; i++) {
        var tk = tokens[i];
        if (!tk) return { error: '页码范围里有空段（多余的逗号），请检查后重试' };
        var m = tk.match(/^(\d+)-(\d+)$/);
        if (m) {
            var a = Number(m[1]), b = Number(m[2]);
            if (a < 1 || a > total || b < 1 || b > total) return { error: '区间 ' + tk + ' 超出范围：该 PDF 共 ' + total + ' 页，页码须在 1-' + total + ' 之间' };
            if (a > b) return { error: '区间 ' + tk + ' 写反了：起始页不能大于结束页' };
            for (var p = a; p <= b; p++) set[p] = true;
        } else if (/^\d+$/.test(tk)) {
            var n = Number(tk);
            if (n < 1 || n > total) return { error: '页码 ' + n + ' 超出范围：该 PDF 共 ' + total + ' 页，页码须在 1-' + total + ' 之间' };
            set[n] = true;
        } else {
            return { error: '无法识别「' + tk + '」：请用数字与短横线，如 1-3,5,8-10' };
        }
    }
    var pages = Object.keys(set).map(Number).sort(function (x, y) { return x - y; });
    if (!pages.length) return { error: '没有选中任何页面，请检查页码范围' };
    return { pages: pages };
}
function resolvePages() {
    if (!doc || !fileInfo) { toast('请先选择一个可用的 PDF'); return null; }
    if (checkedVal('pwm-rangemode') === 'all') {
        var all = [];
        for (var i = 1; i <= fileInfo.pages; i++) all.push(i);
        return all;
    }
    var r = parseRange($('pwm-range').value, fileInfo.pages);
    if (r.error) { showError(r.error); return null; }
    showError('');
    return r.pages;
}
/* 当前预览页是否在作用范围内（宽松判断：范围非法时返回 null） */
function currentInScope() {
    if (!fileInfo) return null;
    if (checkedVal('pwm-rangemode') === 'all') return true;
    var r = parseRange($('pwm-range').value, fileInfo.pages);
    if (r.error) return null;
    return r.pages.indexOf(curPage) >= 0;
}

/* ============ 界面状态 ============ */
function refreshExportState() {
    var hasText = getSettings().text.trim().length > 0;
    $('pwm-text-hint').textContent = hasText ? '支持中文；修改后预览实时刷新。' : '水印文字为空，填入文字后才能导出。';
    $('pwm-text-hint').style.color = hasText ? '' : '#b91c1c';
    $('pwm-export').disabled = !(doc && fileInfo && hasText) || busy;
}
function renderFileInfo() {
    var box = $('pwm-fileinfo');
    var ok = doc && fileInfo;
    box.style.display = ok ? 'flex' : 'none';
    if (ok) {
        $('pwm-file-name').textContent = fileInfo.name;
        $('pwm-file-name').title = fileInfo.name;
        $('pwm-file-sub').textContent = fmtSize(fileInfo.size) + ' · 共 ' + fileInfo.pages + ' 页' +
            (fileInfo.size > BIG_FILE ? ' · 文件较大，处理可能较慢' : '');
    }
    $('pwm-preview').style.display = ok ? '' : 'none';
    refreshExportState();
}
function updatePager() {
    if (!fileInfo) return;
    $('pwm-pglabel').textContent = '第 ' + curPage + ' / ' + fileInfo.pages + ' 页';
    $('pwm-prev').disabled = curPage <= 1 || busy;
    $('pwm-next').disabled = curPage >= fileInfo.pages || busy;
    var inScope = currentInScope();
    var el = $('pwm-inscope');
    if (inScope === true) el.textContent = '当前页在水印作用范围内，导出时会加水印';
    else if (inScope === false) el.textContent = '当前页不在所选范围内，导出时原样保留、不加水印';
    else el.textContent = '自定义范围填写有误，导出前请修正';
}

/* ============ 预览渲染 ============ */
function renderPreview() {
    if (!doc || !fileInfo) return;
    var seq = ++renderSeq;
    var pageNum = curPage;
    doc.getPage(pageNum).then(function (page) {
        if (seq !== renderSeq) return;
        var stageW = $('pwm-stage').clientWidth || 800;
        var base = page.getViewport({ scale: 1 });
        var scale = Math.min(stageW / base.width, 2);
        var viewport = page.getViewport({ scale: scale });
        var pc = $('pwm-page');
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
    var oc = $('pwm-overlay'), pc = $('pwm-page');
    if (!pageGeom || !pc.width) return;
    oc.width = pc.width;
    oc.height = pc.height;
    var ctx = oc.getContext('2d');
    ctx.clearRect(0, 0, oc.width, oc.height);
    ctx.save();
    ctx.scale(pageGeom.scale, pageGeom.scale);
    paintWatermark(ctx, pageGeom.wPt, pageGeom.hPt, getSettings());
    ctx.restore();
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
        renderFileInfo();
        if (!window.pdfjsLib) {
            showLibError('PDF 渲染库（pdf.js）');
        } else {
            showError('「' + f.name + '」' + classifyPdfError(e));
        }
    });
}
$('pwm-clear').addEventListener('click', function () {
    if (busy) return;
    if (doc) { doc.destroy(); }
    doc = null;
    fileInfo = null;
    fileBuf = null;
    pageGeom = null;
    renderSeq++;
    showError('');
    hideProgress();
    renderFileInfo();
});

/* ============ 导出 ============ */
$('pwm-export').addEventListener('click', function () {
    if (busy) return;
    if (!getSettings().text.trim()) { showError('水印文字为空，请先填写水印文字'); toast('请先填写水印文字'); return; }
    var pages = resolvePages();
    if (!pages) return;
    hideLibError();
    showError('');
    busy = true;
    refreshExportState();
    updatePager();
    showProgress('正在加载 PDF 处理组件…', 0);
    var st = getSettings();
    ensurePdfLib().then(function () {
        return window.PDFLib.PDFDocument.load(fileBuf.slice(0), { ignoreEncryption: false });
    }).then(function (pdfDoc) {
        var selected = {};
        pages.forEach(function (p) { selected[p] = true; });
        var pdfPages = pdfDoc.getPages();
        var total = pdfPages.length;
        var chain = Promise.resolve();
        pdfPages.forEach(function (page, idx) {
            chain = chain.then(function () {
                showProgress('正在处理第 ' + (idx + 1) + ' / ' + total + ' 页', (idx + 1) / total);
                if (!selected[idx + 1]) return null; // 未选页面原样保留
                var size = page.getSize();
                var stamp = createStamp(size.width, size.height, st);
                return canvasToPngBytes(stamp).then(function (pngBytes) {
                    releaseCanvas(stamp);
                    return pdfDoc.embedPng(pngBytes);
                }).then(function (img) {
                    page.drawImage(img, { x: 0, y: 0, width: size.width, height: size.height });
                }).then(nextFrame);
            });
        });
        return chain.then(function () {
            showProgress('正在生成 PDF 文件…', 1);
            return pdfDoc.save();
        });
    }).then(function (bytes) {
        downloadBlob(new Blob([bytes], { type: 'application/pdf' }), 'watermarked_' + fileInfo.base + '.pdf');
        toast('已导出加水印 PDF：watermarked_' + fileInfo.base + '.pdf（' + pages.length + ' 页已加水印）');
    }).catch(function (e) {
        if (!window.PDFLib) {
            showLibError('PDF 处理库（pdf-lib）');
        } else if (/encrypt/i.test((e && e.message) || '')) {
            showError('该 PDF 已加密，无法写入水印，请先解密后再试');
        } else {
            showError('导出失败：PDF 可能已损坏或格式不受支持，请换一个文件重试');
        }
    }).then(function () {
        busy = false;
        hideProgress();
        refreshExportState();
        updatePager();
    });
});

/* ============ 设置联动（实时刷新预览） ============ */
function onSettingsChanged() {
    refreshExportState();
    redrawOverlay();
}
['pwm-text', 'pwm-size', 'pwm-opacity', 'pwm-angle', 'pwm-cols', 'pwm-color'].forEach(function (id) {
    $(id).addEventListener('input', function () {
        if (id === 'pwm-size') $('pwm-size-val').textContent = $('pwm-size').value;
        if (id === 'pwm-opacity') $('pwm-opacity-val').textContent = $('pwm-opacity').value + '%';
        if (id === 'pwm-angle') $('pwm-angle-val').textContent = $('pwm-angle').value + '°';
        if (id === 'pwm-cols') $('pwm-cols-val').textContent = $('pwm-cols').value + ' 列';
        onSettingsChanged();
    });
});
Array.prototype.forEach.call(document.querySelectorAll('.pwm-swatch'), function (btn) {
    btn.addEventListener('click', function () {
        $('pwm-color').value = btn.getAttribute('data-color');
        onSettingsChanged();
    });
});
Array.prototype.forEach.call(document.querySelectorAll('input[name="pwm-mode"]'), function (r) {
    r.addEventListener('change', function () {
        $('pwm-cols-group').style.display = checkedVal('pwm-mode') === 'tile' ? '' : 'none';
        onSettingsChanged();
    });
});
Array.prototype.forEach.call(document.querySelectorAll('input[name="pwm-rangemode"]'), function (r) {
    r.addEventListener('change', function () {
        $('pwm-range-wrap').style.display = checkedVal('pwm-rangemode') === 'custom' ? '' : 'none';
        if (checkedVal('pwm-rangemode') === 'custom') $('pwm-range').focus();
        showError('');
        updatePager();
    });
});
$('pwm-range').addEventListener('input', function () { showError(''); updatePager(); });

/* ============ 翻页 ============ */
$('pwm-prev').addEventListener('click', function () {
    if (busy || curPage <= 1) return;
    curPage--;
    renderPreview();
});
$('pwm-next').addEventListener('click', function () {
    if (busy || !fileInfo || curPage >= fileInfo.pages) return;
    curPage++;
    renderPreview();
});
var resizeTimer = null, lastStageW = 0;
window.addEventListener('resize', function () {
    if (!doc) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
        var w = $('pwm-stage').clientWidth;
        if (w && Math.abs(w - lastStageW) > 8) { lastStageW = w; renderPreview(); }
    }, 250);
});

/* ============ 绑定上传区 ============ */
var zone = $('pwm-upload'), input = $('pwm-file');
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
renderFileInfo();
})();

