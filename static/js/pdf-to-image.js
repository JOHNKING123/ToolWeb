/* PDF 转图片/长图 - 纯前端本地处理（pdf.js 渲染 + JSZip 打包）
 * 逐页图片：每页一张 PNG/JPG，多页打包 ZIP；拼成长图：所选页纵向拼接为一张长图。
 * pdf.js 与 JSZip 均经 CDN 懒加载；文件只在浏览器本地以 ArrayBuffer 处理，不上传服务器。
 * 渲染逐页顺序执行不并发，每页转 Blob 后立即释放 canvas，避免大文件内存爆掉。 */
(function () {
'use strict';
var PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
var PDFJS_WORKER_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
var ZIP_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
var BIG_FILE = 50 * 1024 * 1024;
var MAX_LONG_HEIGHT = 16000;            // 长图安全上限：总像素高
var MAX_LONG_BYTES = 512 * 1024 * 1024; // 长图安全上限：预估 canvas 内存（宽×高×4）

var doc = null;      // pdf.js PDFDocumentProxy
var fileInfo = null; // {name,size,pages,base}
var busy = false;

function $(id) { return document.getElementById(id); }
function toast(m) {
    var el = document.createElement('div');
    el.textContent = m;
    el.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:#111827;color:#fff;padding:.6rem 1.2rem;border-radius:.5rem;z-index:9999;font-size:.9rem;max-width:86vw;text-align:center;';
    document.body.appendChild(el);
    setTimeout(function () { if (el.parentNode) document.body.removeChild(el); }, 3000);
}
function setStatus(m) { $('pti-status').textContent = m || ''; }
function showError(m) { $('pti-error').textContent = m || ''; }
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
    $('pti-progress').style.display = 'block';
    $('pti-progress-bar').style.width = Math.round(frac * 100) + '%';
    $('pti-progress-txt').textContent = text;
}
function hideProgress() {
    $('pti-progress').style.display = 'none';
    $('pti-progress-bar').style.width = '0';
    $('pti-progress-txt').textContent = '';
}

/* ============ CDN 懒加载（与 pdf-merge-split.js 同款按需加载 + 失败提示） ============ */
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
function ensureJSZip() { return ensureLib(ZIP_CDN, 'JSZip'); }
function showLibError(what) {
    var el = $('pti-lib-error');
    el.style.display = 'block';
    el.textContent = what + '库加载失败，请检查网络后重试（页面本身不受影响）。';
}
function hideLibError() { $('pti-lib-error').style.display = 'none'; $('pti-lib-error').textContent = ''; }

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
function renderFileInfo() {
    var box = $('pti-fileinfo');
    var ok = doc && fileInfo;
    box.style.display = ok ? 'flex' : 'none';
    if (ok) {
        $('pti-file-name').textContent = fileInfo.name;
        $('pti-file-name').title = fileInfo.name;
        $('pti-file-sub').textContent = fmtSize(fileInfo.size) + ' · 共 ' + fileInfo.pages + ' 页' +
            (fileInfo.size > BIG_FILE ? ' · 文件较大，渲染可能较慢' : '');
    }
    $('pti-export').disabled = !ok || busy;
}

function handleFiles(files) {
    if (busy) return;
    var f = files[0];
    if (!f) return;
    if (files.length > 1) toast('一次只处理一个 PDF，已取第一个');
    if (!isPdfFile(f)) { showError('请选择 PDF 文件（.pdf）'); toast('请选择 PDF 文件'); return; }
    if (f.size > BIG_FILE) toast('文件较大，渲染可能较慢，请耐心等待');
    hideLibError();
    showError('');
    hideProgress();
    if (doc) { doc.destroy(); doc = null; }
    fileInfo = null;
    renderFileInfo();
    setStatus('正在加载 PDF 渲染组件…');
    ensurePdfJs().then(function () {
        setStatus('正在读取 PDF…');
        return f.arrayBuffer();
    }).then(function (buf) {
        return window.pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
    }).then(function (pdf) {
        doc = pdf;
        fileInfo = { name: f.name, size: f.size, pages: pdf.numPages, base: baseName(f.name) };
        setStatus('');
        renderFileInfo();
        toast('已读取「' + f.name + '」，共 ' + pdf.numPages + ' 页');
    }).catch(function (e) {
        setStatus('');
        doc = null;
        fileInfo = null;
        renderFileInfo();
        if (!window.pdfjsLib) {
            showLibError('PDF 渲染库（pdf.js）');
        } else {
            showError('「' + f.name + '」' + classifyPdfError(e));
        }
    });
}
$('pti-clear').addEventListener('click', function () {
    if (busy) return;
    if (doc) { doc.destroy(); }
    doc = null;
    fileInfo = null;
    showError('');
    hideProgress();
    renderFileInfo();
});

/* ============ 页码范围解析（与 pdf_merge_split 拆分模式同一语义） ============ */
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
    if (checkedVal('pti-rangemode') === 'all') {
        var all = [];
        for (var i = 1; i <= fileInfo.pages; i++) all.push(i);
        return all;
    }
    var r = parseRange($('pti-range').value, fileInfo.pages);
    if (r.error) { showError(r.error); return null; }
    showError('');
    return r.pages;
}

/* ============ 单页渲染（顺序执行，不并发） ============ */
function releaseCanvas(canvas) {
    if (!canvas) return;
    canvas.width = 0;
    canvas.height = 0;
}
function renderPageCanvas(pageNum, scale, whiteBg) {
    return doc.getPage(pageNum).then(function (page) {
        var viewport = page.getViewport({ scale: scale });
        var canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        var ctx = canvas.getContext('2d');
        if (whiteBg) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        return page.render({ canvasContext: ctx, viewport: viewport }).promise.then(function () {
            if (page.cleanup) page.cleanup();
            return canvas;
        }).catch(function (e) {
            releaseCanvas(canvas);
            throw e;
        });
    });
}
function canvasToBlob(canvas, format) {
    return new Promise(function (resolve, reject) {
        try {
            if (format === 'jpg') canvas.toBlob(function (b) { b ? resolve(b) : reject(new Error('blob')); }, 'image/jpeg', 0.92);
            else canvas.toBlob(function (b) { b ? resolve(b) : reject(new Error('blob')); }, 'image/png');
        } catch (e) { reject(e); }
    });
}

/* ============ 导出：逐页图片 ============ */
function exportPages(pages, scale, format) {
    var ext = format === 'jpg' ? 'jpg' : 'png';
    var items = []; // {name, blob}
    var chain = Promise.resolve();
    pages.forEach(function (p, idx) {
        chain = chain.then(function () {
            showProgress('正在渲染第 ' + (idx + 1) + ' / ' + pages.length + ' 页', (idx + 1) / pages.length);
            return renderPageCanvas(p, scale, format === 'jpg').then(function (canvas) {
                return canvasToBlob(canvas, format).then(function (blob) {
                    items.push({ name: 'pdfimg_' + fileInfo.base + '_p' + p + '.' + ext, blob: blob });
                    releaseCanvas(canvas);
                });
            });
        });
    });
    return chain.then(function () {
        if (items.length === 1) {
            downloadBlob(items[0].blob, items[0].name);
            toast('已导出 1 张图片：' + items[0].name);
            return;
        }
        showProgress('正在打包 ZIP（共 ' + items.length + ' 张图片）…', 1);
        return ensureJSZip().then(function () {
            var zip = new window.JSZip();
            items.forEach(function (it) { zip.file(it.name, it.blob); });
            return zip.generateAsync({ type: 'blob' });
        }).then(function (blob) {
            downloadBlob(blob, 'pdfimg_' + fileInfo.base + '.zip');
            toast('已打包下载 ' + items.length + ' 张图片：pdfimg_' + fileInfo.base + '.zip');
        }).catch(function () {
            showError('打包组件（JSZip）库加载失败，请检查网络后重试；本次已自动降级为逐页下载，请在浏览器中允许下载多个文件。');
            toast('打包失败，已降级为逐页下载');
            items.forEach(function (it, i) {
                setTimeout(function () { downloadBlob(it.blob, it.name); }, i * 450);
            });
        });
    });
}

/* ============ 导出：拼成长图 ============ */
function exportLong(pages, scale, format, gap) {
    var ext = format === 'jpg' ? 'jpg' : 'png';
    // 第一遍只算尺寸：总高与最大宽，用于像素上限校验（不真正渲染）
    var dims = [];
    var chain = Promise.resolve();
    pages.forEach(function (p) {
        chain = chain.then(function () {
            return doc.getPage(p).then(function (page) {
                var vp = page.getViewport({ scale: scale });
                dims.push({ p: p, w: Math.ceil(vp.width), h: Math.ceil(vp.height) });
                if (page.cleanup) page.cleanup();
            });
        });
    });
    return chain.then(function () {
        var width = 0, totalH = 0;
        dims.forEach(function (d) { width = Math.max(width, d.w); totalH += d.h; });
        totalH += gap * (dims.length - 1);
        var estBytes = width * totalH * 4;
        if (totalH > MAX_LONG_HEIGHT || estBytes > MAX_LONG_BYTES) {
            showError('长图总高度将达 ' + totalH + 'px（宽 ' + width + 'px），超过安全上限 ' + MAX_LONG_HEIGHT +
                'px，浏览器可能内存不足或生成失败。请降低清晰度、减少页数，或改用「逐页图片」导出。');
            toast('长图尺寸超出安全上限，请改用逐页图片');
            return null;
        }
        var longCanvas = document.createElement('canvas');
        longCanvas.width = width;
        longCanvas.height = totalH;
        var lctx = longCanvas.getContext('2d');
        lctx.fillStyle = '#ffffff';
        lctx.fillRect(0, 0, width, totalH);
        var y = 0;
        var chain2 = Promise.resolve();
        dims.forEach(function (d, idx) {
            chain2 = chain2.then(function () {
                showProgress('正在渲染第 ' + (idx + 1) + ' / ' + dims.length + ' 页', (idx + 1) / dims.length);
                return renderPageCanvas(d.p, scale, false).then(function (canvas) {
                    lctx.drawImage(canvas, 0, y);
                    y += d.h + gap;
                    releaseCanvas(canvas);
                });
            });
        });
        return chain2.then(function () {
            showProgress('正在合成长图…', 1);
            return canvasToBlob(longCanvas, format).then(function (blob) {
                releaseCanvas(longCanvas);
                downloadBlob(blob, 'pdflong_' + fileInfo.base + '.' + ext);
                toast('长图已导出：pdflong_' + fileInfo.base + '.' + ext + '（' + width + '×' + totalH + '）');
            });
        }).catch(function (e) {
            releaseCanvas(longCanvas);
            throw e;
        });
    });
}

/* ============ 导出主入口 ============ */
$('pti-export').addEventListener('click', function () {
    if (busy) return;
    var pages = resolvePages();
    if (!pages) return;
    hideLibError();
    showError('');
    var mode = checkedVal('pti-mode');
    var scale = Number(checkedVal('pti-scale')) || 2;
    var format = checkedVal('pti-format') === 'jpg' ? 'jpg' : 'png';
    var gap = Number(checkedVal('pti-gap')) || 0;
    busy = true;
    $('pti-export').disabled = true;
    showProgress('正在准备渲染…', 0);
    ensurePdfJs().then(function () {
        if (mode === 'long') return exportLong(pages, scale, format, gap);
        return exportPages(pages, scale, format);
    }).catch(function (e) {
        if (!window.pdfjsLib) {
            showLibError('PDF 渲染库（pdf.js）');
        } else {
            showError('渲染失败：' + classifyPdfError(e) + '；如文件较大，请降低清晰度或减少页数后重试');
        }
    }).then(function () {
        busy = false;
        hideProgress();
        renderFileInfo();
    });
});

/* ============ 选项联动 ============ */
Array.prototype.forEach.call(document.querySelectorAll('input[name="pti-mode"]'), function (r) {
    r.addEventListener('change', function () {
        $('pti-gap-group').style.display = checkedVal('pti-mode') === 'long' ? '' : 'none';
    });
});
Array.prototype.forEach.call(document.querySelectorAll('input[name="pti-rangemode"]'), function (r) {
    r.addEventListener('change', function () {
        $('pti-range-wrap').style.display = checkedVal('pti-rangemode') === 'custom' ? '' : 'none';
        if (checkedVal('pti-rangemode') === 'custom') $('pti-range').focus();
    });
});
$('pti-range').addEventListener('input', function () { showError(''); });

/* ============ 绑定上传区 ============ */
var zone = $('pti-upload'), input = $('pti-file');
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

