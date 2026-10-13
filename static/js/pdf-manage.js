/* PDF 页面管理 - 纯前端本地处理（pdf.js 缩略图 + pdf-lib 导出）
 * 单页顺时针旋转 90°（即时预览+角标）、删除（含撤销）、拖拽调序/左移右移按钮、勾选提取导出。
 * pdf.js（缩略图）与 pdf-lib（导出）均经 CDN 懒加载；文件只在浏览器本地以 ArrayBuffer 处理，不上传服务器。
 * 导出时按当前顺序/旋转状态 copyPages，旋转经页面 /Rotate 设置实现，内容与页面尺寸无损。 */
(function () {
'use strict';
var PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
var PDFJS_WORKER_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
var PDFLIB_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
var BIG_FILE = 50 * 1024 * 1024;
var THUMB_W = 200; // 缩略图目标 CSS 宽度（×dpr 实际渲染）

var doc = null;        // pdf.js PDFDocumentProxy
var fileName = '', fileSize = 0, fileBuf = null;
var pages = [];        // {orig(1-based), rot(0/90/180/270), selected}
var undoStack = [];    // {page, index} 最近删除的记录
var baseCache = {};    // orig -> base canvas（未旋转渲染，供复用）
var busy = false;
var dragIdx = -1;

function $(id) { return document.getElementById(id); }
function toast(m) {
    var el = document.createElement('div');
    el.textContent = m;
    el.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:#111827;color:#fff;padding:.6rem 1.2rem;border-radius:.5rem;z-index:9999;font-size:.9rem;max-width:86vw;text-align:center;';
    document.body.appendChild(el);
    setTimeout(function () { if (el.parentNode) document.body.removeChild(el); }, 2600);
}
function setStatus(m) { $('pmg-status').textContent = m || ''; }
function showError(m) { $('pmg-error').textContent = m || ''; }
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
function baseName(name) { return String(name).replace(/\.pdf$/i, ''); }
function showProgress(text, frac) {
    $('pmg-progress').style.display = 'block';
    $('pmg-progress-bar').style.width = Math.round(frac * 100) + '%';
    $('pmg-progress-txt').textContent = text;
}
function hideProgress() {
    $('pmg-progress').style.display = 'none';
    $('pmg-progress-bar').style.width = '0';
    $('pmg-progress-txt').textContent = '';
}

/* ============ CDN 懒加载（与 pdf-merge-split.js / pdf-to-image.js 同款） ============ */
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
    var el = $('pmg-lib-error');
    el.style.display = 'block';
    el.textContent = what + '库加载失败，请检查网络连接后重试（页面本身不受影响）。';
}
function hideLibError() { $('pmg-lib-error').style.display = 'none'; $('pmg-lib-error').textContent = ''; }

/* ============ PDF 读取与错误分类 ============ */
function classifyPdfError(e) {
    var name = (e && e.name) || '';
    var msg = (e && e.message) || '';
    if (name === 'PasswordException' || /password|encrypt/i.test(msg)) {
        return '该 PDF 已加密（带打开密码），无法读取，请先解密后再试';
    }
    if (name === 'InvalidPDFException' || name === 'MissingPDFException' || /invalid|missing|format/i.test(msg)) {
        return '文件损坏或不是有效的 PDF，请换一个文件试试';
    }
    return '无法读取该 PDF 文件（' + (msg || '未知错误') + '），请换一个文件试试';
}

/* ============ 上传区 ============ */
function bindUpload() {
    var zone = $('pmg-upload'), input = $('pmg-file');
    zone.addEventListener('click', function () { input.click(); });
    zone.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
        zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add('dragover'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
        zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.remove('dragover'); });
    });
    zone.addEventListener('drop', function (e) {
        var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) handleFile(f);
    });
    input.addEventListener('change', function () {
        if (input.files && input.files[0]) handleFile(input.files[0]);
        input.value = '';
    });
    $('pmg-clear-file').addEventListener('click', resetAll);
}

function resetAll() {
    if (busy) return;
    if (doc) { try { doc.destroy(); } catch (e) {} doc = null; }
    fileName = ''; fileSize = 0; fileBuf = null;
    pages = []; undoStack = []; baseCache = {};
    $('pmg-fileinfo').style.display = 'none';
    $('pmg-work').style.display = 'none';
    $('pmg-actions').style.display = 'none';
    $('pmg-grid').innerHTML = '';
    $('pmg-empty').style.display = 'none';
    setStatus(''); showError(''); hideLibError(); hideProgress();
    $('pmg-warn').textContent = '';
}

function handleFile(f) {
    if (busy) { toast('正在处理中，请稍候'); return; }
    resetAll();
    var nm = f.name || '未命名.pdf';
    if (!/\.pdf$/i.test(nm) && f.type !== 'application/pdf') {
        showError('请选择 PDF 文件（.pdf）');
        return;
    }
    fileName = nm; fileSize = f.size;
    if (f.size > BIG_FILE) {
        $('pmg-warn').textContent = '文件较大（' + fmtSize(f.size) + '），缩略图渲染与导出可能较慢，可继续操作';
    }
    setStatus('正在加载文件…');
    hideLibError(); showError('');
    f.arrayBuffer().then(function (buf) {
        fileBuf = buf; // 主副本保留给 pdf-lib 导出
        return ensurePdfJs();
    }).then(function () {
        // pdf.js worker 会转移（detach）传入的 buffer，故给它一个副本
        return window.pdfjsLib.getDocument({ data: fileBuf.slice(0) }).promise;
    }).then(function (pdfDoc) {
        doc = pdfDoc;
        var n = doc.numPages;
        pages = [];
        for (var i = 1; i <= n; i++) pages.push({ orig: i, rot: 0, selected: false });
        $('pmg-file-name').textContent = fileName;
        $('pmg-file-sub').textContent = fmtSize(fileSize) + ' · 共 ' + n + ' 页';
        $('pmg-fileinfo').style.display = 'flex';
        $('pmg-work').style.display = 'block';
        $('pmg-actions').style.display = 'flex';
        setStatus('正在渲染缩略图…');
        busy = true; refreshUI();
        return renderAllThumbs();
    }).then(function () {
        busy = false; refreshUI();
        setStatus('');
    }).catch(function (e) {
        busy = false;
        if (/timeout|load failed|bad lib/.test((e && e.message) || '')) {
            showLibError('pdf.js ');
            setStatus('');
        } else {
            showError(classifyPdfError(e));
            setStatus('');
        }
        resetStateOnly();
    });
}

function resetStateOnly() {
    if (doc) { try { doc.destroy(); } catch (e) {} doc = null; }
    fileBuf = null; pages = []; undoStack = []; baseCache = {};
    $('pmg-fileinfo').style.display = 'none';
    $('pmg-work').style.display = 'none';
    $('pmg-actions').style.display = 'none';
    $('pmg-grid').innerHTML = '';
    $('pmg-empty').style.display = 'none';
    hideProgress();
}

/* ============ 缩略图渲染（逐页顺序，含旋转变换） ============ */
function renderBase(orig) {
    if (baseCache[orig]) return Promise.resolve(baseCache[orig]);
    return doc.getPage(orig).then(function (page) {
        var vp1 = page.getViewport({ scale: 1 });
        var dpr = window.devicePixelRatio || 1;
        var scale = (THUMB_W * dpr) / vp1.width;
        var vp = page.getViewport({ scale: scale });
        var c = document.createElement('canvas');
        c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
        return page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise.then(function () {
            baseCache[orig] = c;
            return c;
        });
    });
}

function applyRotation(base, rot) {
    if (!rot) return base;
    var rad = rot * Math.PI / 180;
    var w = base.width, h = base.height;
    var cw = (rot % 180 === 0) ? w : h, ch = (rot % 180 === 0) ? h : w;
    var c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    var x = c.getContext('2d');
    x.translate(cw / 2, ch / 2);
    x.rotate(rad);
    x.drawImage(base, -w / 2, -h / 2);
    return c;
}

function renderAllThumbs() {
    var grid = $('pmg-grid');
    grid.innerHTML = '';
    var i = 0;
    function next() {
        if (i >= pages.length) { refreshUI(); return Promise.resolve(); }
        var p = pages[i], idx = i;
        showProgress('正在渲染第 ' + (i + 1) + ' / ' + pages.length + ' 页', i / pages.length);
        return renderBase(p.orig).then(function () {
            appendCard(p, idx);
            i++;
            return next();
        });
    }
    return next().then(function () { hideProgress(); });
}

/* ============ 卡片网格 ============ */
function cardEl(p, idx) {
    var card = document.createElement('div');
    card.className = 'pmg-card';
    card.draggable = true;
    card.dataset.idx = idx;

    var thumb = document.createElement('div');
    thumb.className = 'pmg-thumb';
    var cv = document.createElement('canvas');
    thumb.appendChild(cv);
    var pos = document.createElement('span');
    pos.className = 'pmg-pos';
    var rotBadge = document.createElement('span');
    rotBadge.className = 'pmg-rot';
    var chk = document.createElement('label');
    chk.className = 'pmg-check';
    chk.title = '勾选以提取该页';
    var input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !!p.selected;
    input.setAttribute('aria-label', '选择第 ' + (idx + 1) + ' 页');
    input.addEventListener('change', function () { p.selected = input.checked; refreshUI(); });
    chk.appendChild(input);
    thumb.appendChild(pos); thumb.appendChild(rotBadge); thumb.appendChild(chk);
    // 点缩略图（非勾选框）切换勾选
    thumb.addEventListener('click', function (e) {
        if (e.target === input) return;
        p.selected = !p.selected;
        input.checked = p.selected;
        refreshUI();
    });

    var orig = document.createElement('div');
    orig.className = 'pmg-orig';

    var ops = document.createElement('div');
    ops.className = 'pmg-ops';
    var btnRot = mkBtn('rotate_right', '顺时针旋转 90°');
    var btnLeft = mkBtn('arrow_back', '左移（上移一位）');
    var btnRight = mkBtn('arrow_forward', '右移（下移一位）');
    var btnDel = mkBtn('delete', '删除该页');
    btnDel.classList.add('danger');
    btnRot.addEventListener('click', function () { rotatePage(idx); });
    btnLeft.addEventListener('click', function () { movePage(idx, -1); });
    btnRight.addEventListener('click', function () { movePage(idx, 1); });
    btnDel.addEventListener('click', function () { deletePage(idx); });
    ops.appendChild(btnRot); ops.appendChild(btnLeft); ops.appendChild(btnRight); ops.appendChild(btnDel);

    card.appendChild(thumb); card.appendChild(orig); card.appendChild(ops);

    // DnD（PC 增强）
    card.addEventListener('dragstart', function (e) {
        dragIdx = idx;
        card.classList.add('dragging');
        try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(idx)); } catch (err) {}
    });
    card.addEventListener('dragend', function () {
        card.classList.remove('dragging');
        dragIdx = -1;
        var cs = $('pmg-grid').children;
        for (var k = 0; k < cs.length; k++) cs[k].classList.remove('dragover');
    });
    card.addEventListener('dragover', function (e) {
        if (dragIdx < 0 || dragIdx === idx) return;
        e.preventDefault();
        card.classList.add('dragover');
        try { e.dataTransfer.dropEffect = 'move'; } catch (err) {}
    });
    card.addEventListener('dragleave', function () { card.classList.remove('dragover'); });
    card.addEventListener('drop', function (e) {
        e.preventDefault();
        card.classList.remove('dragover');
        if (dragIdx < 0 || dragIdx === idx) return;
        var mv = pages.splice(dragIdx, 1)[0];
        var to = idx;
        if (dragIdx < idx) to = idx; // 目标索引以放置卡片为准
        pages.splice(to, 0, mv);
        rebuildGrid();
        toast('已移到第 ' + (to + 1) + ' 位');
    });

    paintCard(card, p, idx);
    return card;
}

function mkBtn(icon, title) {
    var b = document.createElement('button');
    b.type = 'button';
    b.title = title;
    b.setAttribute('aria-label', title);
    var s = document.createElement('span');
    s.className = 'material-icons';
    s.textContent = icon;
    b.appendChild(s);
    return b;
}

function paintCard(card, p, idx) {
    var cv = card.querySelector('canvas');
    var base = baseCache[p.orig];
    var shown = applyRotation(base, p.rot);
    cv.width = shown.width; cv.height = shown.height;
    cv.getContext('2d').drawImage(shown, 0, 0);
    card.querySelector('.pmg-pos').textContent = '第 ' + (idx + 1) + ' 页';
    var rb = card.querySelector('.pmg-rot');
    if (p.rot) { rb.style.display = 'block'; rb.textContent = '↻' + p.rot + '°'; }
    else { rb.style.display = 'none'; }
    card.querySelector('.pmg-orig').textContent = '原第 ' + p.orig + ' 页';
    card.querySelector('.pmg-check input').checked = !!p.selected;
}

function appendCard(p, idx) {
    $('pmg-grid').appendChild(cardEl(p, idx));
}

function rebuildGrid() {
    var grid = $('pmg-grid');
    grid.innerHTML = '';
    for (var i = 0; i < pages.length; i++) appendCard(pages[i], i);
    refreshUI();
}

/* ============ 页面操作 ============ */
function rotatePage(idx) {
    if (busy) return;
    var p = pages[idx];
    p.rot = (p.rot + 90) % 360;
    var card = $('pmg-grid').children[idx];
    if (card) paintCard(card, p, idx);
}

function movePage(idx, dir) {
    if (busy) return;
    var to = idx + dir;
    if (to < 0 || to >= pages.length) return;
    var mv = pages.splice(idx, 1)[0];
    pages.splice(to, 0, mv);
    rebuildGrid();
}

function deletePage(idx) {
    if (busy) return;
    var rm = pages.splice(idx, 1)[0];
    undoStack.push({ page: rm, index: idx });
    if (rm.orig in baseCache) { /* 缩略图缓存保留，供撤销时复用 */ }
    rebuildGrid();
    toast('已删除原第 ' + rm.orig + ' 页，可点「撤销删除」恢复');
}

function undoDelete() {
    if (busy || !undoStack.length) return;
    var rec = undoStack.pop();
    var at = Math.min(rec.index, pages.length);
    pages.splice(at, 0, rec.page);
    rebuildGrid();
    toast('已恢复原第 ' + rec.page.orig + ' 页');
}

function refreshUI() {
    var n = pages.length;
    $('pmg-empty').style.display = n ? 'none' : 'block';
    var sel = pages.filter(function (p) { return p.selected; }).length;
    $('pmg-selcount').textContent = n ? ('已选 ' + sel + ' / 共 ' + n + ' 页') : '';
    $('pmg-export-sel').disabled = busy || sel === 0;
    $('pmg-export-all').disabled = busy || n === 0;
    var ub = $('pmg-undo');
    ub.disabled = busy || undoStack.length === 0;
    ub.innerHTML = undoStack.length
        ? '<span class="material-icons">undo</span>撤销删除(' + undoStack.length + ')'
        : '<span class="material-icons">undo</span>撤销删除';
    $('pmg-selall').disabled = busy || n === 0;
    $('pmg-selnone').disabled = busy || sel === 0;
    $('pmg-clearrot').disabled = busy || !pages.some(function (p) { return p.rot; });
}

function bindToolbar() {
    $('pmg-selall').addEventListener('click', function () {
        if (busy) return;
        pages.forEach(function (p) { p.selected = true; });
        rebuildGrid();
    });
    $('pmg-selnone').addEventListener('click', function () {
        if (busy) return;
        pages.forEach(function (p) { p.selected = false; });
        rebuildGrid();
    });
    $('pmg-clearrot').addEventListener('click', function () {
        if (busy) return;
        pages.forEach(function (p) { p.rot = 0; });
        rebuildGrid();
        toast('已清空全部旋转');
    });
    $('pmg-undo').addEventListener('click', undoDelete);
    $('pmg-export-sel').addEventListener('click', function () {
        var list = pages.filter(function (p) { return p.selected; });
        if (!list.length) { toast('请先勾选要提取的页面'); return; }
        doExport(list, 'sel');
    });
    $('pmg-export-all').addEventListener('click', function () {
        if (!pages.length) return;
        doExport(pages.slice(), 'all');
    });
}

/* ============ 导出 ============ */
function doExport(list, kind) {
    if (busy || !list.length || !fileBuf) return;
    busy = true; refreshUI();
    showError(''); hideLibError();
    ensurePdfLib().then(function () {
        return window.PDFLib.PDFDocument.load(fileBuf.slice(0));
    }).then(function (src) {
        var out = null;
        var i = 0;
        function step() {
            if (i >= list.length) return Promise.resolve();
            if (!out) out = window.PDFLib.PDFDocument.create();
            var p = list[i], idx = i;
            showProgress('正在生成第 ' + (i + 1) + ' / ' + list.length + ' 页', i / list.length);
            return out.copyPages(src, [p.orig - 1]).then(function (copied) {
                var cp = copied[0];
                if (p.rot) {
                    var cur = cp.getRotation().angle || 0;
                    cp.setRotation(window.PDFLib.degrees((cur + p.rot) % 360));
                }
                out.addPage(cp);
                i++;
                return new Promise(function (r) { setTimeout(r, 0); }).then(step);
            });
        }
        return step().then(function () {
            showProgress('正在保存文件…', 1);
            return out.save();
        });
    }).then(function (bytes) {
        var name = 'pages_' + baseName(fileName) + '.pdf';
        downloadBlob(new Blob([bytes], { type: 'application/pdf' }), name);
        hideProgress();
        toast('导出成功：' + name);
    }).catch(function (e) {
        hideProgress();
        if (/timeout|load failed|bad lib/.test((e && e.message) || '')) {
            showLibError('pdf-lib ');
        } else {
            showError('导出失败：' + classifyPdfError(e));
        }
    }).then(function () {
        busy = false; refreshUI();
    });
}

bindUpload();
bindToolbar();
refreshUI();
})();
