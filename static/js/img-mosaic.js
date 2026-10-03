/* 图片打码 - 纯前端 canvas 框选打码（马赛克 / 高斯模糊）
 * 区域以原图坐标存储，预览按比例缩放渲染，导出按原图分辨率输出。
 * 图片只在浏览器本地处理，不上传服务器。 */
(function () {
'use strict';
var ACCEPT = ['image/jpeg', 'image/png', 'image/webp'];
var MAX_DISPLAY = 860;

var sourceCanvas = null; // 原图分辨率画布
var origW = 0, origH = 0, origName = 'image';
var regions = []; // {x,y,w,h,mode,granularity,blur} 原图坐标
var mode = 'mosaic';
var dragging = false, dragStart = null, dragCur = null;

function $(id) { return document.getElementById(id); }
function toast(m) {
    var el = document.createElement('div');
    el.textContent = m;
    el.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:#111827;color:#fff;padding:.6rem 1.2rem;border-radius:.5rem;z-index:9999;font-size:.9rem;max-width:86vw;text-align:center;';
    document.body.appendChild(el);
    setTimeout(function () { if (el.parentNode) document.body.removeChild(el); }, 2200);
}
function setStatus(m) { $('im-status').textContent = m || ''; }

function loadBitmap(file) {
    if (typeof createImageBitmap === 'function') {
        return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(function () { return createImageBitmap(file); });
    }
    return new Promise(function (res, rej) {
        var url = URL.createObjectURL(file), img = new Image();
        img.onload = function () { URL.revokeObjectURL(url); res(img); };
        img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('decode')); };
        img.src = url;
    });
}

function handleFile(file) {
    if (!file) return;
    if (ACCEPT.indexOf(file.type) < 0 && !/\.(jpe?g|png|webp)$/i.test(file.name)) { toast('仅支持 JPG / PNG / WebP 图片'); return; }
    setStatus('处理中…正在载入图片');
    loadBitmap(file).then(function (bmp) {
        origW = bmp.width || bmp.naturalWidth; origH = bmp.height || bmp.naturalHeight;
        sourceCanvas = document.createElement('canvas');
        sourceCanvas.width = origW; sourceCanvas.height = origH;
        sourceCanvas.getContext('2d').drawImage(bmp, 0, 0, origW, origH);
        if (bmp.close) { try { bmp.close(); } catch (e) {} }
        origName = (file.name || 'image').replace(/\.[^.]+$/, '');
        regions = [];
        setupCanvas();
        $('im-fileinfo').style.display = 'block';
        $('im-fileinfo').textContent = '已载入：' + file.name + '（' + origW + ' × ' + origH + '，' + (file.size / 1024).toFixed(1) + ' KB）' + ((origW >= 4000 || origH >= 4000 || file.size > 10 * 1024 * 1024) ? '，大图已自动缩放预览，导出仍为原图分辨率' : '');
        $('im-workspace').style.display = 'block';
        setStatus('');
        render();
    }).catch(function () { setStatus(''); toast('图片读取失败，请换一张试试'); });
}

function setupCanvas() {
    var c = $('im-canvas');
    var scale = Math.min(1, MAX_DISPLAY / origW);
    c.width = Math.round(origW * scale); c.height = Math.round(origH * scale);
}
function scaleFactor() { return origW / $('im-canvas').width; }

function applyRegion(ctx, r, sf) {
    // sf: 目标画布相对原图的缩放（预览<1，导出=1）
    var x = r.x * sf, y = r.y * sf, w = r.w * sf, h = r.h * sf;
    if (w < 2 || h < 2) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    if (r.mode === 'blur') {
        var rad = Math.max(1, r.blur * sf);
        try { ctx.filter = 'blur(' + rad + 'px)'; } catch (e) {}
        ctx.drawImage(sourceCanvas, 0, 0, sourceCanvas.width * sf, sourceCanvas.height * sf);
        try { ctx.filter = 'none'; } catch (e) {}
    } else {
        var g = Math.max(2, Math.round(r.granularity * sf));
        var tw = Math.max(1, Math.round(w / g)), th = Math.max(1, Math.round(h / g));
        var tmp = document.createElement('canvas'); tmp.width = tw; tmp.height = th;
        tmp.getContext('2d').drawImage(sourceCanvas, r.x, r.y, r.w, r.h, 0, 0, tw, th);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tmp, 0, 0, tw, th, x, y, w, h);
        ctx.imageSmoothingEnabled = true;
    }
    ctx.restore();
}

function render() {
    var c = $('im-canvas'); if (!sourceCanvas) return;
    var ctx = c.getContext('2d'), sf = c.width / origW;
    ctx.drawImage(sourceCanvas, 0, 0, c.width, c.height);
    regions.forEach(function (r) { applyRegion(ctx, r, sf); });
    if (dragging && dragStart && dragCur) {
        ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
        ctx.strokeRect(dragStart.x, dragStart.y, dragCur.x - dragStart.x, dragCur.y - dragStart.y);
        ctx.setLineDash([]);
    }
    $('im-count').textContent = regions.length;
}

function pointerPos(e) {
    var rect = $('im-canvas').getBoundingClientRect();
    var cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    var cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    return { x: cx * ( $('im-canvas').width / rect.width ), y: cy * ( $('im-canvas').height / rect.height ) };
}
function onDown(e) { if (!sourceCanvas) return; dragging = true; dragStart = pointerPos(e); dragCur = dragStart; if (e.cancelable) e.preventDefault(); }
function onMove(e) { if (!dragging) return; dragCur = pointerPos(e); render(); if (e.cancelable) e.preventDefault(); }
function onUp(e) {
    if (!dragging) return; dragging = false;
    if (dragStart && dragCur) {
        var sf = scaleFactor();
        var x = Math.min(dragStart.x, dragCur.x) * sf, y = Math.min(dragStart.y, dragCur.y) * sf;
        var w = Math.abs(dragCur.x - dragStart.x) * sf, h = Math.abs(dragCur.y - dragStart.y) * sf;
        if (w >= 6 && h >= 6) {
            regions.push({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), mode: mode,
                granularity: parseInt($('im-granularity').value, 10), blur: parseInt($('im-blur-radius').value, 10) });
        }
    }
    dragStart = dragCur = null; render();
}

function exportPNG() {
    if (!sourceCanvas) return;
    setStatus('处理中…正在生成导出图片');
    setTimeout(function () {
        var out = document.createElement('canvas');
        out.width = origW; out.height = origH;
        var ctx = out.getContext('2d');
        ctx.drawImage(sourceCanvas, 0, 0);
        regions.forEach(function (r) { applyRegion(ctx, r, 1); });
        out.toBlob(function (b) {
            setStatus('');
            if (!b) { toast('导出失败，请重试'); return; }
            var url = URL.createObjectURL(b), a = document.createElement('a');
            a.href = url; a.download = 'mosaic_' + origName + '.png';
            document.body.appendChild(a); a.click();
            setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 4000);
        }, 'image/png');
    }, 30);
}

document.addEventListener('DOMContentLoaded', function () {
    var up = $('im-upload'), fi = $('im-file');
    up.addEventListener('click', function () { fi.click(); });
    up.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fi.click(); } });
    fi.addEventListener('change', function () { handleFile(fi.files[0]); fi.value = ''; });
    ['dragover', 'dragenter'].forEach(function (ev) { up.addEventListener(ev, function (e) { e.preventDefault(); up.classList.add('dragover'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { up.addEventListener(ev, function (e) { e.preventDefault(); up.classList.remove('dragover'); }); });
    up.addEventListener('drop', function (e) { var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; handleFile(f); });

    document.querySelectorAll('.im-mode-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            document.querySelectorAll('.im-mode-btn').forEach(function (b) { b.classList.remove('active'); });
            btn.classList.add('active'); mode = btn.getAttribute('data-mode');
            $('im-mosaic-ctl').style.display = mode === 'mosaic' ? '' : 'none';
            $('im-blur-ctl').style.display = mode === 'blur' ? '' : 'none';
        });
    });
    $('im-granularity').addEventListener('input', function () { $('im-granularity-val').textContent = this.value; });
    $('im-blur-radius').addEventListener('input', function () { $('im-blur-val').textContent = this.value; });

    var c = $('im-canvas');
    c.addEventListener('mousedown', onDown);
    c.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    c.addEventListener('touchstart', onDown, { passive: false });
    c.addEventListener('touchmove', onMove, { passive: false });
    c.addEventListener('touchend', onUp);

    $('im-undo').addEventListener('click', function () { regions.pop(); render(); });
    $('im-clear').addEventListener('click', function () { regions = []; render(); });
    $('im-export').addEventListener('click', exportPNG);
    $('im-reset').addEventListener('click', function () {
        sourceCanvas = null; regions = [];
        $('im-workspace').style.display = 'none'; $('im-fileinfo').style.display = 'none'; setStatus('');
    });
});
})();
