/* 九宫格切图 - 纯前端 canvas 图片切分逻辑
 * 上传 → 中心正方形裁剪 → 档位等分 → 逐张下载 / ZIP 打包 / 合成预览图下载。
 * 大图（任一边 > 2000px）自动等比缩放后再切分，避免移动端卡死。
 * 图片只在浏览器本地处理，不上传服务器。 */
(function () {
'use strict';

/* ---------- 配置 ---------- */
var MAX_SIDE = 2000; // 工作画布最大边长，防大图卡死
var MODES = {
    '3x3': { cols: 3, rows: 3, label: '3 × 3' },
    '2x2': { cols: 2, rows: 2, label: '2 × 2' },
    '1x3': { cols: 1, rows: 3, label: '1 × 3' },
    '3x1': { cols: 3, rows: 1, label: '3 × 1' }
};
var ZIP_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
var ACCEPT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
var ACCEPT_EXT = /\.(jpe?g|png|webp)$/i;

/* ---------- 状态 ---------- */
var sourceCanvas = null;   // 工作画布（已做中心裁剪基准的原图，可能已缩放）
var origW = 0, origH = 0;  // 工作画布尺寸
var mode = '3x3';
var tiles = [];            // 切分后的 tile canvas，行优先编号
var compositeCanvas = null;
var tileUrls = [];         // 预览用的 object URL，reset 时释放

/* ---------- 通用工具 ---------- */
function $(id) { return document.getElementById(id); }

function toast(msg) {
    var el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);' +
        'background:#111827;color:#fff;padding:.6rem 1.2rem;border-radius:.5rem;z-index:9999;font-size:.9rem;' +
        'max-width:86vw;text-align:center;';
    document.body.appendChild(el);
    setTimeout(function () { if (el.parentNode) document.body.removeChild(el); }, 2200);
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

function canvasToBlob(canvas) {
    return new Promise(function (resolve, reject) {
        if (canvas.toBlob) {
            canvas.toBlob(function (b) { b ? resolve(b) : reject(new Error('toBlob failed')); }, 'image/png');
        } else if (canvas.convertToBlob) {
            canvas.convertToBlob({ type: 'image/png' }).then(resolve, reject);
        } else {
            reject(new Error('no blob api'));
        }
    });
}

/* ---------- 图片加载 ---------- */
function loadImageBitmap(file) {
    if (typeof createImageBitmap === 'function') {
        return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(function () {
            return createImageBitmap(file);
        });
    }
    return new Promise(function (resolve, reject) {
        var url = URL.createObjectURL(file);
        var img = new Image();
        img.onload = function () {
            URL.revokeObjectURL(url);
            resolve(img);
        };
        img.onerror = function () {
            URL.revokeObjectURL(url);
            reject(new Error('decode failed'));
        };
        img.src = url;
    });
}

function bitmapToCanvas(bmp) {
    var w = bmp.width || bmp.naturalWidth;
    var h = bmp.height || bmp.naturalHeight;
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d').drawImage(bmp, 0, 0, w, h);
    if (bmp.close) { try { bmp.close(); } catch (e) {} }
    return c;
}

function handleFile(file) {
    if (!file) return;
    var okType = ACCEPT_TYPES.indexOf(file.type) !== -1 || ACCEPT_EXT.test(file.name || '');
    if (!okType) {
        toast('仅支持 JPG / PNG / WebP 图片');
        return;
    }
    loadImageBitmap(file).then(function (bmp) {
        var full = bitmapToCanvas(bmp);
        var w = full.width, h = full.height;
        var note = '';
        if (Math.max(w, h) > MAX_SIDE) {
            var scale = MAX_SIDE / Math.max(w, h);
            var sw = Math.round(w * scale), sh = Math.round(h * scale);
            var small = document.createElement('canvas');
            small.width = sw; small.height = sh;
            small.getContext('2d').drawImage(full, 0, 0, sw, sh);
            sourceCanvas = small;
            note = '原图 ' + w + '×' + h + ' px 过大，已自动等比缩放至 ' + sw + '×' + sh + ' px 再切分（防卡顿，切块依然清晰）';
        } else {
            sourceCanvas = full;
            note = '原图 ' + w + '×' + h + ' px';
        }
        origW = sourceCanvas.width;
        origH = sourceCanvas.height;
        $('ng-fileinfo').style.display = '';
        $('ng-fileinfo').textContent = note;
        $('ng-workspace').style.display = '';
        $('ng-preview-card').style.display = '';
        $('ng-action-card').style.display = '';
        recut();
        toast('图片加载成功，开始切分');
    }).catch(function () {
        toast('图片读取失败，请换一张图片重试');
    });
}

/* ---------- 切分 ---------- */
function cutTiles() {
    var m = MODES[mode];
    var cols = m.cols, rows = m.rows;
    var side = Math.min(origW, origH);           // 中心正方形
    var sx = (origW - side) / 2, sy = (origH - side) / 2;
    var xs = [0], ys = [0], i;
    for (i = 1; i <= cols; i++) xs.push(Math.round(sx + side * i / cols) - Math.round(sx));
    for (i = 1; i <= rows; i++) ys.push(Math.round(sy + side * i / rows) - Math.round(sy));
    var ox = Math.round(sx), oy = Math.round(sy);
    var result = [];
    for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
            var w = xs[c + 1] - xs[c], h = ys[r + 1] - ys[r];
            var t = document.createElement('canvas');
            t.width = Math.max(1, w);
            t.height = Math.max(1, h);
            t.getContext('2d').drawImage(
                sourceCanvas,
                ox + xs[c], oy + ys[r], w, h,
                0, 0, t.width, t.height
            );
            result.push(t);
        }
    }
    return { list: result, cols: cols, rows: rows };
}

function buildComposite(cut) {
    var cols = cut.cols, rows = cut.rows;
    var tileSide = cut.list[0].width;
    var gap = Math.max(2, Math.round(tileSide / 40)); // 白边缝隙，约 2.5%
    // 按列/行累计宽度（四舍五入可能带来 1px 差异，逐列累计保证严丝合缝）
    var colW = [], rowH = [], c, r;
    for (c = 0; c < cols; c++) colW.push(cut.list[c].width);
    for (r = 0; r < rows; r++) rowH.push(cut.list[r * cols].height);
    var totalW = (cols + 1) * gap, totalH = (rows + 1) * gap;
    colW.forEach(function (w) { totalW += w; });
    rowH.forEach(function (h) { totalH += h; });
    var comp = document.createElement('canvas');
    comp.width = totalW; comp.height = totalH;
    var ctx = comp.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, totalW, totalH);
    var y = gap;
    for (r = 0; r < rows; r++) {
        var x = gap;
        for (c = 0; c < cols; c++) {
            ctx.drawImage(cut.list[r * cols + c], x, y);
            x += colW[c] + gap;
        }
        y += rowH[r] + gap;
    }
    return comp;
}

function clearTileUrls() {
    tileUrls.forEach(function (u) { URL.revokeObjectURL(u); });
    tileUrls = [];
}

function recut() {
    if (!sourceCanvas) return;
    var cut = cutTiles();
    tiles = cut.list;
    compositeCanvas = buildComposite(cut);

    // 合成预览（所见即所得）
    $('ng-composite').src = compositeCanvas.toDataURL('image/png');

    // 分块预览 + 逐张下载
    clearTileUrls();
    var wrap = $('ng-tiles');
    wrap.innerHTML = '';
    wrap.style.gridTemplateColumns = 'repeat(' + cut.cols + ', 1fr)';
    tiles.forEach(function (t, i) {
        var n = i + 1;
        var cell = document.createElement('div');
        cell.className = 'ng-tile';
        var img = document.createElement('img');
        img.setAttribute('data-tileimg', n);
        img.alt = '切块 ' + n;
        var foot = document.createElement('div');
        foot.className = 'ng-tile-foot';
        var name = document.createElement('span');
        name.className = 'ng-tile-name';
        name.textContent = 'grid_' + n + '.png';
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-secondary ng-dl';
        btn.setAttribute('data-dl', i);
        btn.textContent = '下载';
        foot.appendChild(name);
        foot.appendChild(btn);
        cell.appendChild(img);
        cell.appendChild(foot);
        wrap.appendChild(cell);
        canvasToBlob(t).then(function (b) {
            var url = URL.createObjectURL(b);
            tileUrls.push(url);
            img.src = url;
        }).catch(function () {});
    });

    var tw = tiles[0].width, th = tiles[0].height;
    $('ng-cutinfo').textContent = '当前档位 ' + MODES[mode].label + '：中心正方形 ' +
        Math.min(origW, origH) + '×' + Math.min(origW, origH) + ' px，切出 ' +
        tiles.length + ' 张，每块约 ' + tw + '×' + th + ' px';
}

/* ---------- 下载 ---------- */
function downloadTile(i) {
    var t = tiles[i];
    if (!t) return;
    canvasToBlob(t).then(function (b) {
        downloadBlob(b, 'grid_' + (i + 1) + '.png');
    }).catch(function () {
        toast('下载失败，请重试');
    });
}

function downloadAllSequential() {
    toast('已开始逐张下载' + tiles.length + ' 张切块（请在浏览器中允许下载多个文件）');
    tiles.forEach(function (t, i) {
        setTimeout(function () { downloadTile(i); }, i * 450);
    });
}

function ensureJSZip() {
    return new Promise(function (resolve, reject) {
        if (window.JSZip) { resolve(); return; }
        var s = document.createElement('script');
        var done = false;
        var timer = setTimeout(function () {
            if (!done) { done = true; s.remove(); reject(new Error('timeout')); }
        }, 15000);
        s.onload = function () {
            if (!done) { done = true; clearTimeout(timer); window.JSZip ? resolve() : reject(new Error('bad lib')); }
        };
        s.onerror = function () {
            if (!done) { done = true; clearTimeout(timer); reject(new Error('load failed')); }
        };
        s.src = ZIP_CDN;
        document.head.appendChild(s);
    });
}

function downloadZip() {
    if (!tiles.length) { toast('请先上传图片'); return; }
    var msg = $('ng-zipmsg');
    msg.textContent = '正在准备打包…';
    ensureJSZip().then(function () {
        var zip = new window.JSZip();
        var jobs = tiles.map(function (t, i) {
            return canvasToBlob(t).then(function (b) {
                zip.file('grid_' + (i + 1) + '.png', b);
            });
        });
        return Promise.all(jobs).then(function () {
            return zip.generateAsync({ type: 'blob' });
        });
    }).then(function (blob) {
        msg.textContent = '';
        downloadBlob(blob, 'nine-grid.zip');
        toast('打包下载完成：nine-grid.zip');
    }).catch(function () {
        msg.textContent = '打包组件（JSZip CDN）加载失败，已自动降级为逐张下载。';
        toast('打包组件加载失败，已降级为逐张下载');
        downloadAllSequential();
    });
}

function downloadCombined() {
    if (!compositeCanvas) { toast('请先上传图片'); return; }
    canvasToBlob(compositeCanvas).then(function (b) {
        downloadBlob(b, 'nine-grid-combined.png');
        toast('合成预览图下载完成');
    }).catch(function () {
        toast('下载失败，请重试');
    });
}

/* ---------- 重置 ---------- */
function resetAll() {
    clearTileUrls();
    sourceCanvas = null;
    tiles = [];
    compositeCanvas = null;
    origW = 0; origH = 0;
    $('ng-file').value = '';
    $('ng-fileinfo').style.display = 'none';
    $('ng-fileinfo').textContent = '';
    $('ng-workspace').style.display = 'none';
    $('ng-preview-card').style.display = 'none';
    $('ng-action-card').style.display = 'none';
    $('ng-tiles').innerHTML = '';
    $('ng-composite').removeAttribute('src');
    $('ng-zipmsg').textContent = '';
    setMode('3x3');
}

/* ---------- 档位切换 ---------- */
function setMode(m) {
    if (!MODES[m]) return;
    mode = m;
    document.querySelectorAll('.ng-mode-btn').forEach(function (btn) {
        btn.classList.toggle('active', btn.getAttribute('data-mode') === m);
    });
    if (sourceCanvas) recut();
}

/* ---------- 事件绑定 ---------- */
document.addEventListener('DOMContentLoaded', function () {
    var upload = $('ng-upload'), fileInput = $('ng-file');

    upload.addEventListener('click', function () { fileInput.click(); });
    upload.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
    });
    fileInput.addEventListener('change', function () {
        handleFile(this.files && this.files[0]);
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
        var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        handleFile(f);
    });

    document.querySelectorAll('.ng-mode-btn').forEach(function (btn) {
        btn.addEventListener('click', function () { setMode(btn.getAttribute('data-mode')); });
    });

    document.addEventListener('click', function (e) {
        var dl = e.target.closest ? e.target.closest('[data-dl]') : null;
        if (dl) downloadTile(parseInt(dl.getAttribute('data-dl'), 10));
    });

    $('ng-zip').addEventListener('click', downloadZip);
    $('ng-combined').addEventListener('click', downloadCombined);
    $('ng-reset').addEventListener('click', resetAll);
});

/* 暴露给自测 */
window.__ngTest = { MODES: MODES, MAX_SIDE: MAX_SIDE };
})();
