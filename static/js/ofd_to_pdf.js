/* OFD 转 PDF（ofd_to_pdf）- 纯前端：OFD 拖拽/选择打开 → 本地 ZIP 解包 →
 * 自研 OFD 渲染内核（static/js/vendor/ofd.js）逐页 canvas 渲染预览 →
 * pdf-lib（本地 vendor）逐页嵌 JPEG 组装 PDF 下载。零上传。
 *
 * 纯函数契约（浏览器/Node 通用；非法参数抛 Error，err.field 给出字段名，不静默钳制）：
 *   validateOfdFile(name, sizeBytes, maxSizeBytes)
 *       -> {name, sizeBytes}；name 非字符串/空/非 .ofd 结尾抛 Error，err.field='name'；
 *         sizeBytes 非正数/非有限数字抛 Error，err.field='size'；
 *         超过 maxSizeBytes 抛 Error，err.field='size'。
 *   capPageCount(totalPages, maxPages)
 *       -> {pages, truncated}；totalPages 非整数/为负抛 Error，err.field='totalPages'；
 *         maxPages 非正整数抛 Error，err.field='maxPages'。
 *   formatPageLabel(index, total)
 *       -> 「第 3 / 12 页」；index 越界/非整数抛 Error，err.field='index'；
 *         total 非正整数抛 Error，err.field='total'。
 *   buildExportName(fileName)
 *       -> 文件名 .ofd→.pdf；空/非法回退 'ofd-converted.pdf'。
 *   fontFallback(fontName)
 *       -> 系统字体回退栈（委托 vendor/ofd.js OFD.fontFallback，精确值由测试锁定）。
 *   pageRenderScale(pageW, pageH, viewportW)
 *       -> viewportW/pageW，保留 3 位小数（Number）；非法尺寸抛 Error，err.field 定位。
 *   sanitizeFileName(name)
 *       -> 去除非法字符/首尾空白点/空白转连字符/截断 60；空回退 'ofd-converted'（家族惯例）。
 *   hasZipMagic(u8)
 *       -> 是否 ZIP 文件头（扩展名+文件头双校验之一；委托 vendor/ofd.js）。
 */
(function () {
'use strict';

var MAX_FILE_SIZE = 50 * 1024 * 1024;   /* 50MB */
var MAX_PAGES = 50;
var EXPORT_DPI = 150;
var JPEG_QUALITY = 0.92;
var PT_PER_MM = 72 / 25.4;

function fldError(field, message) {
    var e = new Error(message);
    e.field = field;
    return e;
}

function isFiniteNumber(v) {
    return typeof v === 'number' && isFinite(v);
}

/* ---------------- 纯函数 ---------------- */

function validateOfdFile(name, sizeBytes, maxSizeBytes) {
    var nm = (typeof name === 'string') ? name.trim() : '';
    if (!nm || !/\.ofd$/i.test(nm)) {
        throw fldError('name', '请选择 .ofd 后缀的 OFD 文件');
    }
    if (!isFiniteNumber(sizeBytes) || sizeBytes <= 0) {
        throw fldError('size', '文件大小非法');
    }
    if (isFiniteNumber(maxSizeBytes) && maxSizeBytes > 0 && sizeBytes > maxSizeBytes) {
        throw fldError('size', '文件超过大小上限（' + Math.round(maxSizeBytes / 1024 / 1024) + 'MB）');
    }
    return { name: nm, sizeBytes: sizeBytes };
}

function capPageCount(totalPages, maxPages) {
    if (!isFiniteNumber(totalPages) || Math.floor(totalPages) !== totalPages || totalPages < 0) {
        throw fldError('totalPages', '总页数非法');
    }
    if (!isFiniteNumber(maxPages) || Math.floor(maxPages) !== maxPages || maxPages <= 0) {
        throw fldError('maxPages', '页数上限非法');
    }
    return {
        pages: Math.min(totalPages, maxPages),
        truncated: totalPages > maxPages
    };
}

function formatPageLabel(index, total) {
    if (!isFiniteNumber(total) || Math.floor(total) !== total || total <= 0) {
        throw fldError('total', '总页数非法');
    }
    if (!isFiniteNumber(index) || Math.floor(index) !== index || index < 1 || index > total) {
        throw fldError('index', '页码越界');
    }
    return '第 ' + index + ' / ' + total + ' 页';
}

function sanitizeFileName(name) {
    var s = (name == null) ? '' : String(name);
    s = s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '');
    s = s.replace(/^[\s.]+|[\s.]+$/g, '').replace(/\s+/g, '-');
    if (s.length > 60) s = s.slice(0, 60).replace(/-+$/, '');
    if (s.length === 0) return 'ofd-converted';
    return s;
}

function buildExportName(fileName) {
    var s = (fileName == null) ? '' : String(fileName).trim();
    if (!s) return 'ofd-converted.pdf';
    var base = s.replace(/\.ofd$/i, '');
    base = sanitizeFileName(base);
    return base + '.pdf';
}

function ofdNs() {
    if (typeof window !== 'undefined' && window.OFD) return window.OFD;
    if (typeof module !== 'undefined' && module.exports) {
        try { return require('./vendor/ofd.js'); } catch (e) { return null; }
    }
    return null;
}
var OFD = ofdNs();
var LOCAL_DEFAULT_STACK = '"Noto Sans SC","PingFang SC","Microsoft YaHei","SimSun",sans-serif';

function fontFallback(fontName) {
    if (OFD && OFD.fontFallback) return OFD.fontFallback(fontName);
    return LOCAL_DEFAULT_STACK;
}

function hasZipMagic(u8) {
    if (OFD && OFD.hasZipMagic) return OFD.hasZipMagic(u8);
    if (!u8 || u8.length < 4) return false;
    return u8[0] === 0x50 && u8[1] === 0x4B && u8[2] === 0x03 && u8[3] === 0x04;
}

function pageRenderScale(pageW, pageH, viewportW) {
    if (!isFiniteNumber(pageW) || pageW <= 0) throw fldError('pageW', '页面宽度非法');
    if (!isFiniteNumber(pageH) || pageH <= 0) throw fldError('pageH', '页面高度非法');
    if (!isFiniteNumber(viewportW) || viewportW <= 0) throw fldError('viewportW', '视口宽度非法');
    return Number((viewportW / pageW).toFixed(3));
}

var API = {
    MAX_FILE_SIZE: MAX_FILE_SIZE,
    MAX_PAGES: MAX_PAGES,
    EXPORT_DPI: EXPORT_DPI,
    validateOfdFile: validateOfdFile,
    capPageCount: capPageCount,
    formatPageLabel: formatPageLabel,
    buildExportName: buildExportName,
    fontFallback: fontFallback,
    pageRenderScale: pageRenderScale,
    sanitizeFileName: sanitizeFileName,
    hasZipMagic: hasZipMagic
};

/* ---------------- 浏览器 UI 胶水（Node 下不执行） ---------------- */

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    window.OfdToPdf = API;

    var S = {
        doc: null, fileName: '', pageIndex: 0, pageTotal: 0,
        zoom: 1, token: 0, exporting: false
    };

    function $(id) { return document.getElementById(id); }

    function setStatus(m) { $('otp-status').textContent = m || ''; }

    function setError(m) {
        var el = $('otp-error');
        el.textContent = m || '';
        el.style.display = m ? 'block' : 'none';
    }

    function setNote(m) {
        var el = $('otp-note');
        el.textContent = m || '';
        el.style.display = m ? 'block' : 'none';
    }

    function setProgress(n, total, note) {
        var wrap = $('otp-progress');
        wrap.style.display = 'block';
        $('otp-progress-bar').style.width = (total ? (n / total * 100) : 0) + '%';
        $('otp-progress-txt').textContent = note || ('处理中… ' + n + '/' + total);
    }

    function hideProgress() { $('otp-progress').style.display = 'none'; }

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

    function friendlyOfdError(e) {
        var code = (e && e.code) || '';
        if (code === 'NOT_ZIP') return '文件头校验失败：这不是有效的 OFD 文件（OFD 本质是 ZIP 压缩包）。';
        if (code === 'NOT_OFD') return '不是有效的 OFD 文件：压缩包内缺少 OFD.xml。';
        if (code === 'XML_PARSE') return '文件解析失败：可能已损坏或为加密 OFD（加密文件暂不支持）。';
        if (code === 'NO_PAGES') return 'OFD 文档中未找到任何页面。';
        if (code === 'NO_JSZIP') return '解包组件缺失，请刷新页面重试。';
        return '解析失败：' + ((e && e.message) || '未知错误');
    }

    function onFile(file) {
        setError(''); setNote('');
        var info;
        try {
            info = validateOfdFile(file.name, file.size, MAX_FILE_SIZE);
        } catch (e) {
            setError(e.message + '（仅支持 .ofd 文件，50MB 以内）');
            return;
        }
        setStatus('正在读取文件…');
        $('otp-export').disabled = true;
        var reader = new FileReader();
        reader.onerror = function () { setStatus(''); setError('文件读取失败，请重试。'); };
        reader.onload = function () {
            var buf = reader.result;
            if (!hasZipMagic(new Uint8Array(buf))) {
                setStatus('');
                setError('文件头校验失败：这不是有效的 OFD 文件（请选择 .ofd 后缀的真实 OFD 文档）。');
                return;
            }
            setStatus('正在解析 OFD 文档…');
            var ns = ofdNs();
            if (!ns || !ns.load) { setStatus(''); setError('渲染内核缺失，请刷新页面重试。'); return; }
            ns.load(buf).then(function (doc) {
                var cap = capPageCount(doc.pageCount, MAX_PAGES);
                S.doc = doc;
                S.fileName = info.name;
                S.pageTotal = cap.pages;
                S.pageIndex = 0;
                S.zoom = 1;
                $('otp-file-name').textContent = info.name;
                $('otp-file-sub').textContent = fmtSize(info.sizeBytes) + ' · 共 ' + doc.pageCount + ' 页' +
                    (cap.truncated ? '（仅处理前 ' + MAX_PAGES + ' 页）' : '');
                $('otp-fileinfo').style.display = 'flex';
                $('otp-viewer').style.display = 'block';
                if (cap.truncated) {
                    setNote('提示：该文件共 ' + doc.pageCount + ' 页，超出单文件 ' + MAX_PAGES +
                        ' 页上限，仅预览并转换前 ' + MAX_PAGES + ' 页。');
                }
                $('otp-export').disabled = false;
                renderCurrent();
            }, function (e) {
                setStatus('');
                setError(friendlyOfdError(e));
            });
        };
        reader.readAsArrayBuffer(file);
    }

    function renderCurrent() {
        if (!S.doc) return;
        var t = ++S.token;
        var pg = S.doc.pageSize(S.pageIndex);
        var wrapW = ($('otp-canvas-wrap').clientWidth || 640) - 32;
        if (wrapW < 200) wrapW = 200;
        var basePxW = pg.wMm * 96 / 25.4, basePxH = pg.hMm * 96 / 25.4;
        var scale = pageRenderScale(basePxW, basePxH, wrapW) * S.zoom;
        var pxPerMm = scale * 96 / 25.4;
        setStatus('正在渲染第 ' + (S.pageIndex + 1) + ' 页…');
        S.doc.renderPage(S.pageIndex, pxPerMm).then(function (canvas) {
            if (t !== S.token) return; /* 竞态丢弃 */
            var wrap = $('otp-canvas-wrap');
            var old = $('otp-canvas');
            canvas.id = 'otp-canvas';
            canvas.style.maxWidth = '100%';
            canvas.style.height = 'auto';
            canvas.style.boxShadow = '0 1px 6px rgba(0,0,0,.18)';
            if (old) wrap.replaceChild(canvas, old);
            else wrap.appendChild(canvas);
            $('otp-pagelabel').textContent = formatPageLabel(S.pageIndex + 1, S.pageTotal);
            $('otp-zoomlabel').textContent = Math.round(S.zoom * 100) + '%';
            $('otp-prev').disabled = S.pageIndex <= 0;
            $('otp-next').disabled = S.pageIndex >= S.pageTotal - 1;
            setStatus('');
        }, function (e) {
            if (t !== S.token) return;
            setStatus('');
            setError('第 ' + (S.pageIndex + 1) + ' 页渲染失败：' + (e.message || '未知错误'));
        });
    }

    function gotoPage(d) {
        if (!S.doc) return;
        var n = S.pageIndex + d;
        if (n < 0 || n >= S.pageTotal) return;
        S.pageIndex = n;
        renderCurrent();
    }

    function onExport() {
        if (S.exporting || !S.doc) return;
        if (!window.PDFLib) { setError('PDF 合成组件缺失，请刷新页面重试。'); return; }
        S.exporting = true;
        setError('');
        window.PDFLib.PDFDocument.create().then(function (pdf) {
            var chain = Promise.resolve();
            for (var i = 0; i < S.pageTotal; i++) {
                (function (idx) {
                    chain = chain.then(function () {
                        setProgress(idx, S.pageTotal, '正在渲染第 ' + (idx + 1) + ' / ' + S.pageTotal + ' 页…');
                        return S.doc.renderPage(idx, EXPORT_DPI / 25.4);
                    }).then(function (canvas) {
                        return new Promise(function (resolve, reject) {
                            canvas.toBlob(function (b) {
                                if (b) resolve(b);
                                else reject(new Error('页面图像编码失败'));
                            }, 'image/jpeg', JPEG_QUALITY);
                        });
                    }).then(function (blob) { return blob.arrayBuffer(); })
                    .then(function (ab) { return pdf.embedJpg(ab); })
                    .then(function (embed) {
                        var pg = S.doc.pageSize(idx);
                        var wPt = pg.wMm * PT_PER_MM, hPt = pg.hMm * PT_PER_MM;
                        var page = pdf.addPage([wPt, hPt]);
                        page.drawImage(embed, { x: 0, y: 0, width: wPt, height: hPt });
                    });
                })(i);
            }
            return chain.then(function () {
                setProgress(S.pageTotal, S.pageTotal, '正在生成 PDF…');
                return pdf.save();
            });
        }).then(function (bytes) {
            var blob = new Blob([bytes], { type: 'application/pdf' });
            downloadBlob(blob, buildExportName(S.fileName));
            hideProgress();
            setStatus('导出完成：' + buildExportName(S.fileName) + '（' + S.pageTotal + ' 页）');
            S.exporting = false;
        }, function (e) {
            hideProgress();
            setError('导出失败：' + (e.message || '未知错误'));
            S.exporting = false;
        });
    }

    function clearFile() {
        S.token++;
        S.doc = null; S.fileName = ''; S.pageIndex = 0; S.pageTotal = 0; S.zoom = 1;
        $('otp-file').value = '';
        $('otp-fileinfo').style.display = 'none';
        $('otp-viewer').style.display = 'none';
        $('otp-export').disabled = true;
        setStatus(''); setError(''); setNote('');
        var old = $('otp-canvas');
        if (old) old.remove();
    }

    function bindUI() {
        var up = $('otp-upload'), fi = $('otp-file');
        up.addEventListener('click', function () { fi.click(); });
        up.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fi.click(); }
        });
        fi.addEventListener('change', function () {
            if (fi.files && fi.files[0]) onFile(fi.files[0]);
            fi.value = '';
        });
        ['dragenter', 'dragover'].forEach(function (ev) {
            up.addEventListener(ev, function (e) { e.preventDefault(); up.classList.add('dragover'); });
        });
        ['dragleave', 'drop'].forEach(function (ev) {
            up.addEventListener(ev, function (e) { e.preventDefault(); up.classList.remove('dragover'); });
        });
        up.addEventListener('drop', function (e) {
            var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
            if (f) onFile(f);
        });
        $('otp-clear').addEventListener('click', clearFile);
        $('otp-prev').addEventListener('click', function () { gotoPage(-1); });
        $('otp-next').addEventListener('click', function () { gotoPage(1); });
        $('otp-zoomin').addEventListener('click', function () {
            if (S.zoom < 3) { S.zoom = Math.min(3, +(S.zoom + 0.25).toFixed(2)); renderCurrent(); }
        });
        $('otp-zoomout').addEventListener('click', function () {
            if (S.zoom > 0.5) { S.zoom = Math.max(0.5, +(S.zoom - 0.25).toFixed(2)); renderCurrent(); }
        });
        $('otp-export').addEventListener('click', onExport);
        document.addEventListener('keydown', function (e) {
            if (!$('otp-viewer') || $('otp-viewer').style.display === 'none') return;
            if (e.key === 'ArrowLeft') gotoPage(-1);
            else if (e.key === 'ArrowRight') gotoPage(1);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindUI);
    } else {
        bindUI();
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
}

})();
