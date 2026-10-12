/* 图片批量转 PDF - 纯前端本地处理（pdf-lib）
 * 多图上传（点击/拖拽/Ctrl+V）→ 缩略图列表 → 拖拽/上移下移调序 → A4/原尺寸页面设置 →
 * pdf-lib（CDN 懒加载）逐张 embed 合成单 PDF 下载。导出无水印，无后端、无上传。
 * 图片统一经离屏 canvas 转 JPEG（白底，处理 PNG/WebP 透明）后再 embed，三档质量档位对应 canvas 输出质量与长边上限。
 */
(function () {
'use strict';
var PDFLIB_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
var BIG_TOTAL = 100 * 1024 * 1024;   // 累计超过 100MB 提示
var MAX_PT = 14400;                   // pdf-lib 页面单边上限
var A4_W = 595.28, A4_H = 841.89;    // A4 pt
var QUALITY = {
    high: { q: 0.92, maxSide: Infinity },
    mid:  { q: 0.72, maxSide: 1920 },
    low:  { q: 0.5,  maxSide: 1280 }
};

var items = []; // {id,name,size,url,w,h,img}
var seq = 0;
var dragId = null;

function $(id) { return document.getElementById(id); }
function fmtSize(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
}
function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}
function timestamp() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}
function setStatus(m) { $('itp-status').textContent = m || ''; }
function setError(m) {
    var el = $('itp-error');
    el.textContent = m || '';
    el.style.display = m ? 'block' : 'none';
}
function showWarn(m) {
    var el = $('itp-warn');
    el.textContent = m || '';
    el.style.display = m ? 'block' : 'none';
}
function showLibError() {
    var el = $('itp-lib-error');
    el.style.display = 'block';
    el.textContent = 'PDF 合成组件（pdf-lib CDN）加载失败，无法生成 PDF。请检查网络连接后重试（页面本身不受影响，图片列表仍保留）。';
}
function hideLibError() { $('itp-lib-error').style.display = 'none'; $('itp-lib-error').textContent = ''; }
function downloadBlob(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
}

/* ============ CDN 懒加载 ============ */
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
            if (!done) { done = true; reject(new Error('load failed')); }
        };
        s.src = src;
        document.head.appendChild(s);
    });
}
function ensurePdfLib() { return ensureLib(PDFLIB_CDN, 'PDFLib'); }

/* ============ 上传（点击 / 拖拽 / Ctrl+V） ============ */
function isSupportedImage(file) {
    return /^image\/(png|jpe?g|webp)$/i.test(file.type || '');
}
function addFiles(files) {
    setError('');
    var added = 0, skipped = [];
    for (var i = 0; i < files.length; i++) {
        var f = files[i];
        if (!f || !f.type) continue;
        if (!isSupportedImage(f)) {
            skipped.push(f.name || '未命名文件');
            continue;
        }
        (function (file) {
            var url = URL.createObjectURL(file);
            var img = new Image();
            img.onload = function () {
                items.push({ id: ++seq, name: file.name || ('截图_' + seq + '.png'), size: file.size, url: url, w: img.naturalWidth, h: img.naturalHeight });
                renderList();
            };
            img.onerror = function () {
                URL.revokeObjectURL(url);
                setError('图片「' + (file.name || '未命名') + '」无法解码，已跳过');
            };
            img.src = url;
            added++;
        })(f);
    }
    if (added > 0) setStatus('已加入 ' + added + ' 张图片');
    if (skipped.length > 0) setError('以下文件格式不受支持已跳过（仅 PNG/JPG/WebP；HEIC 暂不支持）：' + skipped.map(esc).join('、'));
}

function bindUpload() {
    var zone = $('itp-upload'), input = $('itp-file');
    zone.addEventListener('click', function () { input.click(); });
    zone.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
    });
    input.addEventListener('change', function () {
        addFiles(input.files);
        input.value = '';
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
        zone.addEventListener(ev, function (e) {
            e.preventDefault();
            zone.classList.add('dragover');
        });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
        zone.addEventListener(ev, function (e) {
            e.preventDefault();
            zone.classList.remove('dragover');
        });
    });
    zone.addEventListener('drop', function (e) {
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
    });
    document.addEventListener('paste', function (e) {
        var items_ = (e.clipboardData && (e.clipboardData.files || e.clipboardData.items)) || [];
        var files = [];
        for (var i = 0; i < items_.length; i++) {
            var it = items_[i];
            var f = it.kind === 'file' ? it.getAsFile() : it;
            if (f && /^image\//i.test(f.type || '')) files.push(f);
        }
        if (files.length) {
            e.preventDefault();
            addFiles(files);
        }
    });
}

/* ============ 列表渲染 / 排序 ============ */
function totalSize() {
    return items.reduce(function (a, it) { return a + (it.size || 0); }, 0);
}
function findIdx(id) {
    for (var i = 0; i < items.length; i++) if (items[i].id === id) return i;
    return -1;
}
function moveItem(id, dir) {
    var i = findIdx(id);
    if (i < 0) return;
    var j = i + dir;
    if (j < 0 || j >= items.length) return;
    var t = items[i]; items[i] = items[j]; items[j] = t;
    renderList();
}
function removeItem(id) {
    var i = findIdx(id);
    if (i < 0) return;
    URL.revokeObjectURL(items[i].url);
    items.splice(i, 1);
    renderList();
}
function clearAll() {
    items.forEach(function (it) { URL.revokeObjectURL(it.url); });
    items = [];
    setStatus('');
    setError('');
    showWarn('');
    renderList();
}
function renderList() {
    var grid = $('itp-grid');
    grid.innerHTML = '';
    items.forEach(function (it, idx) {
        var card = document.createElement('div');
        card.className = 'itp-card';
        card.draggable = true;
        card.dataset.id = it.id;
        card.innerHTML =
            '<div class="itp-order">' + (idx + 1) + '</div>' +
            '<div class="itp-thumb" title="拖拽调序"><img src="' + it.url + '" alt="图片 ' + (idx + 1) + '" draggable="false"></div>' +
            '<div class="itp-meta">' +
            '<div class="itp-nm" title="' + esc(it.name) + '">' + esc(it.name) + '</div>' +
            '<div class="itp-sub">' + fmtSize(it.size) + ' · ' + it.w + '×' + it.h + '</div>' +
            '<div class="itp-ops">' +
            '<button type="button" data-op="up" title="上移"' + (idx === 0 ? ' disabled' : '') + '><span class="material-icons">arrow_upward</span></button>' +
            '<button type="button" data-op="down" title="下移"' + (idx === items.length - 1 ? ' disabled' : '') + '><span class="material-icons">arrow_downward</span></button>' +
            '<button type="button" data-op="del" class="del" title="删除"><span class="material-icons">close</span></button>' +
            '</div></div>';
        grid.appendChild(card);
    });
    grid.querySelectorAll('button[data-op]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            var card = btn.closest('.itp-card');
            var id = parseInt(card.dataset.id, 10);
            var op = btn.dataset.op;
            if (op === 'up') moveItem(id, -1);
            else if (op === 'down') moveItem(id, 1);
            else removeItem(id);
        });
    });
    grid.querySelectorAll('.itp-card').forEach(function (card) {
        card.addEventListener('dragstart', function (e) {
            dragId = parseInt(card.dataset.id, 10);
            card.classList.add('dragging');
            if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; }
        });
        card.addEventListener('dragend', function () {
            card.classList.remove('dragging');
            dragId = null;
            grid.querySelectorAll('.itp-card').forEach(function (c) { c.classList.remove('dragover'); });
        });
        card.addEventListener('dragover', function (e) {
            if (dragId === null) return;
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
            card.classList.add('dragover');
        });
        card.addEventListener('dragleave', function () { card.classList.remove('dragover'); });
        card.addEventListener('drop', function (e) {
            e.preventDefault();
            card.classList.remove('dragover');
            if (dragId === null) return;
            var from = findIdx(dragId), to = findIdx(parseInt(card.dataset.id, 10));
            if (from < 0 || to < 0 || from === to) return;
            var t = items.splice(from, 1)[0];
            items.splice(to, 0, t);
            renderList();
        });
    });
    var has = items.length > 0;
    $('itp-export').disabled = !has;
    $('itp-clear-all').disabled = !has;
    var cnt = $('itp-count');
    if (has) {
        cnt.style.display = 'block';
        cnt.textContent = '共 ' + items.length + ' 张，总计 ' + fmtSize(totalSize()) + '（左上角数字为最终 PDF 页码）';
    } else {
        cnt.style.display = 'none';
    }
    var ts = totalSize();
    if (ts > BIG_TOTAL) {
        showWarn('图片总大小已超过 ' + fmtSize(BIG_TOTAL) + '（当前 ' + fmtSize(ts) + '），浏览器内存占用较大，建议分批导出，或选用「中等/高压缩」档位。');
    } else {
        showWarn('');
    }
}

/* ============ 导出 ============ */
function loadImage(url) {
    return new Promise(function (resolve, reject) {
        var img = new Image();
        img.onload = function () { resolve(img); };
        img.onerror = function () { reject(new Error('decode')); };
        img.src = url;
    });
}
function canvasBlob(canvas, q) {
    return new Promise(function (resolve, reject) {
        canvas.toBlob(function (b) { b ? resolve(b) : reject(new Error('encode')); }, 'image/jpeg', q);
    });
}
function blobToBytes(blob) {
    return blob.arrayBuffer().then(function (buf) { return new Uint8Array(buf); });
}
function mmToPt(mm) { return mm * 2.83465; }

function pageSizeMode() {
    var r = document.querySelector('input[name="itp-size"]:checked');
    return r ? r.value : 'a4';
}
function qualityCfg() {
    var r = document.querySelector('input[name="itp-quality"]:checked');
    return QUALITY[r ? r.value : 'high'] || QUALITY.high;
}
function marginMm() {
    var r = document.querySelector('input[name="itp-margin"]:checked');
    return r ? parseFloat(r.value) || 0 : 0;
}
function outFileName() {
    var v = ($('itp-filename').value || '').trim().replace(/[\\/:*?"<>|]/g, '_');
    if (!v) v = 'images_' + timestamp();
    return v.replace(/\.pdf$/i, '') + '.pdf';
}
function setProgress(n, m, note) {
    var wrap = $('itp-progress');
    wrap.style.display = 'block';
    $('itp-progress-bar').style.width = (m ? (n / m * 100) : 0) + '%';
    $('itp-progress-txt').textContent = note || ('正在生成… ' + n + '/' + m);
}

function buildPdf() {
    var cfg = qualityCfg();
    var mode = pageSizeMode();
    var margin = mode === 'a4' ? mmToPt(marginMm()) : 0;
    var pdf = window.PDFLib.PDFDocument.create();
    var chain = Promise.resolve();
    items.forEach(function (it, idx) {
        chain = chain.then(function () {
            setProgress(idx, items.length);
            return loadImage(it.url).then(function (img) {
                var w = img.naturalWidth, h = img.naturalHeight;
                // 压缩档：长边上限缩放
                if (cfg.maxSide !== Infinity && Math.max(w, h) > cfg.maxSide) {
                    var s = cfg.maxSide / Math.max(w, h);
                    w = Math.max(1, Math.round(w * s));
                    h = Math.max(1, Math.round(h * s));
                }
                var cv = document.createElement('canvas');
                cv.width = w; cv.height = h;
                var ctx = cv.getContext('2d');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, w, h);
                ctx.drawImage(img, 0, 0, w, h);
                return canvasBlob(cv, cfg.q).then(function (blob) {
                    return blobToBytes(blob).then(function (bytes) {
                        var pw, ph, drawW, drawH, dx, dy;
                        if (mode === 'orig') {
                            var sp = 1;
                            if (Math.max(w, h) > MAX_PT) sp = MAX_PT / Math.max(w, h);
                            pw = w * sp; ph = h * sp;
                            drawW = pw; drawH = ph; dx = 0; dy = 0;
                        } else {
                            pw = A4_W; ph = A4_H;
                            var availW = pw - margin * 2, availH = ph - margin * 2;
                            var fit = Math.min(availW / w, availH / h, 1);
                            drawW = w * fit; drawH = h * fit;
                            dx = margin + (availW - drawW) / 2;
                            dy = margin + (availH - drawH) / 2;
                        }
                        return pdf.embedJpg(bytes).then(function (embed) {
                            var page = pdf.addPage([pw, ph]);
                            page.drawImage(embed, { x: dx, y: dy, width: drawW, height: drawH });
                        });
                    });
                });
            });
        });
    });
    return chain.then(function () {
        setProgress(items.length, items.length, '正在保存…');
        return pdf.save();
    });
}

function onExport() {
    if (!items.length) return;
    setError('');
    hideLibError();
    var btn = $('itp-export');
    btn.disabled = true;
    setProgress(0, items.length);
    ensurePdfLib().then(function () {
        return buildPdf();
    }).then(function (bytes) {
        var blob = new Blob([bytes], { type: 'application/pdf' });
        downloadBlob(blob, outFileName());
        setProgress(items.length, items.length, '完成：' + items.length + ' 张图片已合成一个 PDF（' + fmtSize(bytes.length) + '），无水印。');
        btn.disabled = false;
    }).catch(function (e) {
        var msg = (e && e.message) || '';
        if (msg === 'timeout' || msg === 'load failed' || msg === 'bad lib') {
            showLibError();
        } else {
            setError('生成失败：图片解码或合成出错，请换一张图片后重试（' + msg + '）');
        }
        $('itp-progress').style.display = 'none';
        btn.disabled = false;
    });
}

function bindControls() {
    document.querySelectorAll('input[name="itp-size"]').forEach(function (r) {
        r.addEventListener('change', function () {
            $('itp-margin-group').style.display = pageSizeMode() === 'a4' ? '' : 'none';
        });
    });
    $('itp-export').addEventListener('click', onExport);
    $('itp-clear-all').addEventListener('click', clearAll);
    $('itp-filename').value = 'images_' + timestamp();
}

/* ============ 初始化 ============ */
bindUpload();
bindControls();
renderList();
})();
