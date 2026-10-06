/* 图片拼接 / 长图拼接 - 纯前端 canvas 多图合成逻辑
 * 多图上传 → 拖拽排序 → 纵/横拼接（统一基准尺寸）→ PNG/JPG 原分辨率导出。
 * 超 canvas 单边上限（16384px）时自动等比降质导出并提示，避免导出空白。
 * 图片只在浏览器本地处理，不上传服务器。 */
(function () {
'use strict';

/* ---------- 配置 ---------- */
var MAX_SIDE = 16384;          // canvas 单边安全上限，超过自动降质导出
var PREVIEW_MAX_SIDE = 3000;   // 预览画布最大边长，防大图卡死（导出不受此限）
var ACCEPT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
var ACCEPT_EXT = /\.(jpe?g|png|webp)$/i;

/* ---------- 状态 ---------- */
var images = [];               // {id, name, bmp, w, h, thumbUrl}
var seq = 0;
var settings = {
    direction: 'vertical',     // vertical | horizontal
    gap: 10,                   // 0~100 px
    bg: '#ffffff',             // 颜色值或 'transparent'
    align: 'center',           // left | center | right
    format: 'png'              // png | jpg
};
var dragId = null;

/* ---------- 通用工具 ---------- */
function $(id) { return document.getElementById(id); }

function toast(msg) {
    var el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);' +
        'background:#111827;color:#fff;padding:.6rem 1.2rem;border-radius:.5rem;z-index:9999;font-size:.9rem;' +
        'max-width:86vw;text-align:center;';
    document.body.appendChild(el);
    setTimeout(function () { if (el.parentNode) document.body.removeChild(el); }, 2400);
}

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

function timestamp() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) +
        p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}

function loadImageBitmap(file) {
    if (typeof createImageBitmap === 'function') {
        return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(function () {
            return createImageBitmap(file);
        });
    }
    return new Promise(function (resolve, reject) {
        var url = URL.createObjectURL(file);
        var img = new Image();
        img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('decode failed')); };
        img.src = url;
    });
}

/* ---------- 布局计算（原分辨率，scale=1） ----------
 * 纵向：统一宽度 = 各图最大宽度，每图等比缩放后上下排布；
 * 横向：统一高度 = 各图最大高度，每图等比缩放后左右排布。
 * 对齐决定图片在基准列/行内的横向（纵向拼接）或纵向（横向拼接）位置：
 * 统一缩放后各图恰好占满基准列/行，尺寸一致时对齐无视觉差异。 */
function alignOffset(span, size) {
    var rest = Math.max(0, span - size);
    if (settings.align === 'left') return 0;
    if (settings.align === 'right') return rest;
    return Math.round(rest / 2);
}

function computeLayout() {
    var n = images.length;
    if (!n) return null;
    var gap = settings.gap;
    var items = [], totalW, totalH, i, img;
    if (settings.direction === 'vertical') {
        var baseW = 0;
        for (i = 0; i < n; i++) baseW = Math.max(baseW, images[i].w);
        var y = 0;
        for (i = 0; i < n; i++) {
            img = images[i];
            var dh = Math.max(1, Math.round(img.h * baseW / img.w));
            items.push({ bmp: img.bmp, dx: alignOffset(baseW, baseW), dy: y, dw: baseW, dh: dh });
            y += dh + gap;
        }
        totalW = baseW;
        totalH = y - gap;
    } else {
        var baseH = 0;
        for (i = 0; i < n; i++) baseH = Math.max(baseH, images[i].h);
        var x2 = 0;
        for (i = 0; i < n; i++) {
            img = images[i];
            var dw = Math.max(1, Math.round(img.w * baseH / img.h));
            items.push({ bmp: img.bmp, dx: x2, dy: alignOffset(baseH, baseH), dw: dw, dh: baseH });
            x2 += dw + gap;
        }
        totalW = x2 - gap;
        totalH = baseH;
    }
    return { totalW: totalW, totalH: totalH, items: items };
}

function isOverLimit(layout) {
    return layout && (layout.totalW > MAX_SIDE || layout.totalH > MAX_SIDE);
}

function fitScale(layout) {
    if (!isOverLimit(layout)) return 1;
    return Math.min(MAX_SIDE / layout.totalW, MAX_SIDE / layout.totalH);
}

/* 把布局绘制到 canvas（scale 为相对原分辨率的缩放比） */
function drawLayout(canvas, layout, scale, forJpg) {
    canvas.width = Math.max(1, Math.round(layout.totalW * scale));
    canvas.height = Math.max(1, Math.round(layout.totalH * scale));
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (settings.bg !== 'transparent') {
        ctx.fillStyle = settings.bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else if (forJpg) {
        // JPG 不支持透明：自动转白底
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    layout.items.forEach(function (it) {
        ctx.drawImage(it.bmp,
            Math.round(it.dx * scale), Math.round(it.dy * scale),
            Math.max(1, Math.round(it.dw * scale)), Math.max(1, Math.round(it.dh * scale)));
    });
    return canvas;
}

/* ---------- 缩略图条 ---------- */
function renderThumbs() {
    var wrap = $('st-thumbs');
    wrap.innerHTML = '';
    images.forEach(function (img, i) {
        var cell = document.createElement('div');
        cell.className = 'st-thumb';
        cell.draggable = true;
        cell.setAttribute('data-id', img.id);

        var im = document.createElement('img');
        im.src = img.thumbUrl;
        im.alt = img.name;
        cell.appendChild(im);

        var idx = document.createElement('span');
        idx.className = 'st-idx';
        idx.textContent = (i + 1) + ' / ' + images.length;
        cell.appendChild(idx);

        var meta = document.createElement('div');
        meta.className = 'st-meta';
        meta.textContent = img.w + '×' + img.h;
        meta.title = img.name;
        cell.appendChild(meta);

        var ops = document.createElement('div');
        ops.className = 'st-ops';
        var mk = function (label, data, title, disabled) {
            var b = document.createElement('button');
            b.type = 'button';
            b.textContent = label;
            b.title = title;
            b.setAttribute(data.k, data.v);
            if (disabled) b.disabled = true;
            return b;
        };
        ops.appendChild(mk('←', { k: 'data-move', v: i + ':-1' }, '上移', i === 0));
        ops.appendChild(mk('→', { k: 'data-move', v: i + ':1' }, '下移', i === images.length - 1));
        var del = mk('✕', { k: 'data-del', v: String(img.id) }, '删除这张', false);
        del.className = 'st-del';
        ops.appendChild(del);
        cell.appendChild(ops);

        wrap.appendChild(cell);
    });
}

/* ---------- 预览与信息 ---------- */
function refresh() {
    var has = images.length > 0;
    $('st-list-card').style.display = has ? '' : 'none';
    $('st-settings-card').style.display = has ? '' : 'none';
    $('st-preview-card').style.display = has ? '' : 'none';
    $('st-action-card').style.display = has ? '' : 'none';
    if (!has) return;

    renderThumbs();
    var layout = computeLayout();
    var dirLabel = settings.direction === 'vertical' ? '纵向' : '横向';
    $('st-size-info').textContent = '共 ' + images.length + ' 张图片，' + dirLabel +
        '拼接总尺寸：' + layout.totalW + ' × ' + layout.totalH + ' px（原分辨率）';

    var warn = $('st-size-warn');
    if (isOverLimit(layout)) {
        var s = fitScale(layout);
        warn.style.display = '';
        warn.textContent = '⚠ 拼接总尺寸 ' + layout.totalW + ' × ' + layout.totalH +
            ' px 超过浏览器画布单边上限 ' + MAX_SIDE + 'px，导出时将自动等比降质为约 ' +
            Math.round(layout.totalW * s) + ' × ' + Math.round(layout.totalH * s) +
            ' px（也可减少图片数量或分段拼接后二次拼接）。';
    } else {
        warn.style.display = 'none';
        warn.textContent = '';
    }

    var jpgWarn = $('st-jpg-warn');
    if (settings.format === 'jpg' && settings.bg === 'transparent') {
        jpgWarn.style.display = '';
        jpgWarn.textContent = '提示：JPG 不支持透明背景，导出时透明背景将自动转为白色。';
    } else {
        jpgWarn.style.display = 'none';
        jpgWarn.textContent = '';
    }

    var scale = Math.min(1, PREVIEW_MAX_SIDE / Math.max(layout.totalW, layout.totalH));
    drawLayout($('st-preview'), layout, scale, false);
}

/* ---------- 图片增删 ---------- */
function addFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return;
    var valid = files.filter(function (f) {
        return ACCEPT_TYPES.indexOf(f.type) !== -1 || ACCEPT_EXT.test(f.name || '');
    });
    if (valid.length < files.length) toast('已跳过非 JPG/PNG/WebP 文件');
    if (!valid.length) return;
    var chain = Promise.resolve();
    valid.forEach(function (f) {
        chain = chain.then(function () {
            return loadImageBitmap(f).then(function (bmp) {
                images.push({
                    id: ++seq,
                    name: f.name || 'image',
                    bmp: bmp,
                    w: bmp.width || bmp.naturalWidth,
                    h: bmp.height || bmp.naturalHeight,
                    thumbUrl: URL.createObjectURL(f)
                });
            }).catch(function () {
                toast('有一张图片读取失败，已跳过');
            });
        });
    });
    chain.then(function () {
        refresh();
        if (images.length) toast('已添加 ' + valid.length + ' 张图片，共 ' + images.length + ' 张');
    });
}

function removeImage(id) {
    for (var i = 0; i < images.length; i++) {
        if (images[i].id === id) {
            URL.revokeObjectURL(images[i].thumbUrl);
            if (images[i].bmp.close) { try { images[i].bmp.close(); } catch (e) {} }
            images.splice(i, 1);
            break;
        }
    }
    refresh();
}

function clearAll() {
    images.forEach(function (img) {
        URL.revokeObjectURL(img.thumbUrl);
        if (img.bmp.close) { try { img.bmp.close(); } catch (e) {} }
    });
    images = [];
    $('st-file').value = '';
    $('st-export-msg').textContent = '';
    refresh();
}

function moveImage(index, delta) {
    var j = index + delta;
    if (index < 0 || j < 0 || j >= images.length) return;
    var t = images[index];
    images[index] = images[j];
    images[j] = t;
    refresh();
}

function reorderTo(draggedId, targetId) {
    var from = -1, to = -1, i;
    for (i = 0; i < images.length; i++) {
        if (images[i].id === draggedId) from = i;
        if (images[i].id === targetId) to = i;
    }
    if (from < 0 || to < 0 || from === to) return;
    var item = images.splice(from, 1)[0];
    images.splice(to, 0, item);
    refresh();
}

/* ---------- 导出 ---------- */
function exportImage() {
    if (!images.length) { toast('请先添加图片'); return; }
    var layout = computeLayout();
    var scale = fitScale(layout);
    var canvas = document.createElement('canvas');
    var isJpg = settings.format === 'jpg';
    drawLayout(canvas, layout, scale, isJpg);
    var mime = isJpg ? 'image/jpeg' : 'image/png';
    var ext = isJpg ? 'jpg' : 'png';
    var done = function (blob) {
        if (!blob) { toast('导出失败：画布过大，请减少图片数量或分段拼接'); return; }
        downloadBlob(blob, 'stitched_' + timestamp() + '.' + ext);
        var sizeTxt = canvas.width + ' × ' + canvas.height + ' px';
        if (scale < 1) {
            $('st-export-msg').textContent = '已降质导出（' + sizeTxt + '），原拼接尺寸 ' +
                layout.totalW + ' × ' + layout.totalH + ' px 超过画布上限 ' + MAX_SIDE + 'px。';
        } else {
            $('st-export-msg').textContent = '导出完成：stitched_' + timestamp() + '.' + ext + '（' + sizeTxt + '）';
        }
        if (isJpg && settings.bg === 'transparent') toast('JPG 不支持透明，背景已自动转为白色');
        else toast('拼接图导出完成（' + sizeTxt + '）');
    };
    if (canvas.toBlob) {
        canvas.toBlob(function (b) { done(b); }, mime, 0.92);
    } else {
        try {
            var url = canvas.toDataURL(mime, 0.92);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'stitched_' + timestamp() + '.' + ext;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            $('st-export-msg').textContent = '导出完成：' + canvas.width + ' × ' + canvas.height + ' px';
        } catch (e) {
            toast('导出失败：画布过大，请减少图片数量或分段拼接');
        }
    }
}

/* ---------- 设置控件 ---------- */
function bindSeg(selector, attr, apply) {
    document.querySelectorAll(selector).forEach(function (btn) {
        btn.addEventListener('click', function () {
            document.querySelectorAll(selector).forEach(function (b) { b.classList.remove('active'); });
            btn.classList.add('active');
            apply(btn.getAttribute(attr));
            refresh();
        });
    });
}

/* ---------- 事件绑定 ---------- */
document.addEventListener('DOMContentLoaded', function () {
    var upload = $('st-upload'), fileInput = $('st-file');

    upload.addEventListener('click', function () { fileInput.click(); });
    upload.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
    });
    fileInput.addEventListener('change', function () {
        addFiles(this.files);
        this.value = ''; // 允许重复选择同一批文件追加
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
        upload.addEventListener(ev, function (e) {
            e.preventDefault();
            upload.classList.add('dragover');
        });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
        upload.addEventListener(ev, function (e) {
            e.preventDefault();
            upload.classList.remove('dragover');
        });
    });
    upload.addEventListener('drop', function (e) {
        if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
    });

    $('st-add').addEventListener('click', function () { fileInput.click(); });
    $('st-clear').addEventListener('click', function () {
        if (!images.length) return;
        clearAll();
        toast('已清空全部图片');
    });
    $('st-reset').addEventListener('click', function () {
        clearAll();
        toast('已重置，可以重新上传图片');
    });
    $('st-export').addEventListener('click', exportImage);

    /* 缩略图条：删除 / 上移 / 下移（事件委托） */
    $('st-thumbs').addEventListener('click', function (e) {
        var del = e.target.closest ? e.target.closest('[data-del]') : null;
        if (del) { removeImage(parseInt(del.getAttribute('data-del'), 10)); return; }
        var mv = e.target.closest ? e.target.closest('[data-move]') : null;
        if (mv) {
            var parts = mv.getAttribute('data-move').split(':');
            moveImage(parseInt(parts[0], 10), parseInt(parts[1], 10));
        }
    });

    /* 缩略图拖拽排序（HTML5 DnD，桌面端；移动端用 ← → 按钮兜底） */
    var thumbs = $('st-thumbs');
    thumbs.addEventListener('dragstart', function (e) {
        var cell = e.target.closest ? e.target.closest('.st-thumb') : null;
        if (!cell) return;
        dragId = parseInt(cell.getAttribute('data-id'), 10);
        cell.classList.add('dragging');
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            try { e.dataTransfer.setData('text/plain', String(dragId)); } catch (err) {}
        }
    });
    thumbs.addEventListener('dragover', function (e) {
        var cell = e.target.closest ? e.target.closest('.st-thumb') : null;
        if (!cell || dragId === null) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        thumbs.querySelectorAll('.st-thumb.dragover').forEach(function (c) { c.classList.remove('dragover'); });
        if (parseInt(cell.getAttribute('data-id'), 10) !== dragId) cell.classList.add('dragover');
    });
    thumbs.addEventListener('drop', function (e) {
        var cell = e.target.closest ? e.target.closest('.st-thumb') : null;
        if (!cell || dragId === null) return;
        e.preventDefault();
        reorderTo(dragId, parseInt(cell.getAttribute('data-id'), 10));
        dragId = null;
    });
    thumbs.addEventListener('dragend', function () {
        dragId = null;
        thumbs.querySelectorAll('.st-thumb').forEach(function (c) {
            c.classList.remove('dragging');
            c.classList.remove('dragover');
        });
    });

    /* 设置 */
    bindSeg('[data-dir]', 'data-dir', function (v) { settings.direction = v; });
    bindSeg('[data-align]', 'data-align', function (v) { settings.align = v; });
    bindSeg('[data-format]', 'data-format', function (v) { settings.format = v; });

    document.querySelectorAll('[data-bg]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            document.querySelectorAll('[data-bg]').forEach(function (b) { b.classList.remove('active'); });
            btn.classList.add('active');
            settings.bg = btn.getAttribute('data-bg');
            if (settings.bg !== 'transparent') $('st-bg-color').value = settings.bg;
            refresh();
        });
    });
    $('st-bg-color').addEventListener('input', function () {
        document.querySelectorAll('[data-bg]').forEach(function (b) { b.classList.remove('active'); });
        settings.bg = this.value;
        refresh();
    });

    $('st-gap').addEventListener('input', function () {
        settings.gap = parseInt(this.value, 10) || 0;
        $('st-gap-val').textContent = settings.gap + ' px';
        refresh();
    });
});

/* 暴露给自测 */
window.__stitchTest = {
    MAX_SIDE: MAX_SIDE,
    computeLayout: computeLayout,
    fitScale: fitScale,
    _state: function () { return { images: images, settings: settings }; }
};
})();
