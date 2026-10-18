/* 图片转像素画 - 纯前端像素化引擎
 *
 * 流程：上传图片 → 自动下采样到工作分辨率（长边 ≤ 2048）→ 缩小到像素宽度
 * → 调色板量化（预设 nearest 匹配 / 自定义中位切分）→ nearest-neighbor 放大预览
 * → 导出 PNG（1×/2×/4×，nearest-neighbor，网格线不导出）。
 *
 * 图片只在浏览器本地处理：无后端调用、无第三方依赖、无 CDN。
 * 纯函数（调色板 / 最近邻匹配 / 中位切分）可在 node 下单元测试。
 */
(function () {
'use strict';

/* ---------- 调色板定义 ---------- */

function hex(h) { // "#1d2b53" -> [r,g,b]
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

var PALETTES = {
    gameboy: {
        name: 'GameBoy 4 色',
        colors: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'].map(hex)
    },
    pico8: {
        name: 'PICO-8 16 色',
        colors: ['#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f',
                 '#c2c3c7', '#fff1e8', '#ff004d', '#ffa300', '#ffec27', '#00e436',
                 '#29adff', '#83769c', '#ff77a8', '#ffccaa'].map(hex)
    },
    retro16: {
        name: '复古 16 色',
        colors: ['#000000', '#0000aa', '#00aa00', '#00aaaa', '#aa0000', '#aa00aa',
                 '#aa5500', '#aaaaaa', '#555555', '#5555ff', '#55ff55', '#55ffff',
                 '#ff5555', '#ff55ff', '#ffff55', '#ffffff'].map(hex)
    }
};

function getPalette(name) {
    return PALETTES[name] ? PALETTES[name].colors : null; // fullcolor -> null（不量化）
}

/* ---------- 纯函数：颜色匹配与中位切分 ---------- */

// 最近邻颜色：返回调色板索引（RGB 欧氏距离平方）
function nearestColorIndex(r, g, b, palette) {
    var best = 0, bestD = Infinity, i, d, c;
    for (i = 0; i < palette.length; i++) {
        c = palette[i];
        d = (r - c[0]) * (r - c[0]) + (g - c[1]) * (g - c[1]) + (b - c[2]) * (b - c[2]);
        if (d < bestD) { bestD = d; best = i; }
    }
    return best;
}

// 中位切分：pixels 为 [[r,g,b],...]（不透明像素），提炼 n 色色板（返回 [[r,g,b],...]）
function medianCut(pixels, n) {
    if (!pixels.length) return [[0, 0, 0]];
    if (n < 1) n = 1;
    var boxes = [pixels.slice()];
    function channelRange(box) {
        var mn = [255, 255, 255], mx = [0, 0, 0], i, p, ch;
        for (i = 0; i < box.length; i++) {
            p = box[i];
            for (ch = 0; ch < 3; ch++) {
                if (p[ch] < mn[ch]) mn[ch] = p[ch];
                if (p[ch] > mx[ch]) mx[ch] = p[ch];
            }
        }
        var range = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];
        var c = range[0] >= range[1] && range[0] >= range[2] ? 0 : (range[1] >= range[2] ? 1 : 2);
        return { ch: c, range: range[c] };
    }
    function average(box) {
        var s = [0, 0, 0], i;
        for (i = 0; i < box.length; i++) { s[0] += box[i][0]; s[1] += box[i][1]; s[2] += box[i][2]; }
        return [Math.round(s[0] / box.length), Math.round(s[1] / box.length), Math.round(s[2] / box.length)];
    }
    while (boxes.length < n) {
        var bi = -1, bestRange = 0, i, info;
        for (i = 0; i < boxes.length; i++) {
            if (boxes[i].length < 2) continue;
            info = channelRange(boxes[i]);
            if (info.range > bestRange) { bestRange = info.range; bi = i; }
        }
        if (bi < 0) break; // 所有盒子都不可再分
        var box = boxes.splice(bi, 1)[0];
        var ch = channelRange(box).ch;
        box.sort(function (a, b) { return a[ch] - b[ch]; });
        var mid = Math.floor(box.length / 2);
        boxes.push(box.slice(0, mid), box.slice(mid));
    }
    return boxes.map(average);
}

// 对小尺寸 ImageData 做量化，返回新的 ImageData（就地写入 out）
// paletteName: 'gameboy'|'pico8'|'retro16'|'fullcolor'|'custom'; customN 仅 custom 时用
// keepAlpha: alpha < 128 视为透明（保留透明，不参与匹配）
function quantizeImageData(img, paletteName, customN, keepAlpha) {
    var d = img.data, i, r, g, b, a, idx, c;
    var palette = getPalette(paletteName);
    if (paletteName === 'custom') {
        var opaque = [];
        for (i = 0; i < d.length; i += 4) {
            a = d[i + 3];
            if (!keepAlpha || a >= 128) opaque.push([d[i], d[i + 1], d[i + 2]]);
        }
        palette = medianCut(opaque, customN);
    }
    for (i = 0; i < d.length; i += 4) {
        r = d[i]; g = d[i + 1]; b = d[i + 2]; a = d[i + 3];
        if (keepAlpha && a < 128) { d[i + 3] = 0; continue; } // 保持透明
        if (palette) {
            idx = nearestColorIndex(r, g, b, palette);
            c = palette[idx];
            d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
            d[i + 3] = 255; // 调色板无 alpha 概念，匹配后统一不透明
        }
        // 全彩保持：保留原始颜色与 alpha
    }
    return img;
}

/* ---------- 浏览器侧：引擎与交互 ---------- */

var MAX_SOURCE_EDGE = 2048; // 大图自动下采样上限（长边）
var state = {
    srcCanvas: null,   // 下采样后的源图
    workCanvas: null,   // 像素宽度小图（量化后）
    workW: 0, workH: 0,
    fileName: 'pixel-art'
};

function $(id) { return document.getElementById(id); }

function showTip(msg) {
    var t = $('px-tip');
    t.textContent = msg;
    t.className = 'px-tip px-tip-err';
    t.style.display = 'block';
}
function hideTip() { var t = $('px-tip'); t.style.display = 'none'; }
function setStatus(msg) { $('px-status').textContent = msg || ''; }

function readFile(file) {
    var ACCEPT = ['image/png', 'image/jpeg', 'image/webp'];
    if (!file) return;
    if (ACCEPT.indexOf(file.type) < 0) { showTip('暂不支持该格式，请上传 PNG / JPG / WebP 图片。'); return; }
    if (file.size > 30 * 1024 * 1024) { showTip('图片超过 30MB，请先压缩再上传。'); return; }
    hideTip();
    setStatus('正在读取图片…');
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
        URL.revokeObjectURL(url);
        buildSource(img, file.name);
    };
    img.onerror = function () {
        URL.revokeObjectURL(url);
        showTip('图片读取失败，文件可能已损坏。');
        setStatus('');
    };
    img.src = url;
}

// 源图下采样到工作分辨率（长边 ≤ 2048），大图不卡顿
function buildSource(img, name) {
    var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    if (!w || !h) { showTip('图片尺寸异常，无法处理。'); setStatus(''); return; }
    var scale = Math.min(1, MAX_SOURCE_EDGE / Math.max(w, h));
    var sw = Math.max(1, Math.round(w * scale)), sh = Math.max(1, Math.round(h * scale));
    var c = document.createElement('canvas');
    c.width = sw; c.height = sh;
    var ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, sw, sh);
    state.srcCanvas = c;
    state.fileName = (name || 'pixel-art').replace(/\.[^.]+$/, '') || 'pixel-art';
    $('px-srcinfo').style.display = 'block';
    $('px-srcinfo').textContent = '已载入：' + w + ' × ' + h + ' 像素' +
        (scale < 1 ? '（已自动下采样到 ' + sw + ' × ' + sh + ' 工作分辨率）' : '');
    $('px-controls').style.display = 'block';
    $('px-result').style.display = 'block';
    setStatus('');
    render();
}

// 核心：缩小 → 量化 → nearest-neighbor 放大预览
function render() {
    if (!state.srcCanvas) return;
    var targetW = parseInt($('px-width').value, 10);
    var sw = state.srcCanvas.width, sh = state.srcCanvas.height;
    var targetH = Math.max(1, Math.round(targetW * sh / sw));

    // 1. 缩小到像素宽度（缩小允许平滑，放大必须硬像素）
    var small = document.createElement('canvas');
    small.width = targetW; small.height = targetH;
    var sctx = small.getContext('2d');
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(state.srcCanvas, 0, 0, targetW, targetH);

    // 2. 量化
    var img = sctx.getImageData(0, 0, targetW, targetH);
    var pal = currentPalette();
    quantizeImageData(img, pal, parseInt($('px-colors').value, 10), $('px-alpha').checked);
    sctx.putImageData(img, 0, 0);
    state.workCanvas = small;
    state.workW = targetW; state.workH = targetH;

    // 3. nearest-neighbor 放大到预览尺寸（预览约 480px 宽）
    var k = Math.max(1, Math.round(480 / targetW));
    drawScaled($('px-out-canvas'), small, k, $('px-grid').checked);

    // 原图预览（等比缩到约 480px 宽）
    var sk = Math.min(1, 480 / sw);
    var sc = $('px-src-canvas');
    sc.width = Math.max(1, Math.round(sw * sk));
    sc.height = Math.max(1, Math.round(sh * sk));
    var s2 = sc.getContext('2d');
    s2.drawImage(state.srcCanvas, 0, 0, sc.width, sc.height);

    var palName = pal === 'fullcolor' ? '全彩保持' :
        (pal === 'custom' ? '自定义 ' + $('px-colors').value + ' 色' : PALETTES[pal].name);
    $('px-meta').innerHTML = '输出尺寸：<b>' + targetW + ' × ' + targetH + ' 像素</b> · 调色板：<b>' +
        palName + '</b>' + ($('px-grid').checked ? ' · 网格线：<b>开</b>（仅预览，导出不带）' : '');
}

// 把小图 nearest-neighbor 放大 k 倍画到 canvas；grid=true 时叠加像素网格线（仅预览）
function drawScaled(canvas, small, k, grid) {
    canvas.width = small.width * k;
    canvas.height = small.height * k;
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, canvas.width, canvas.height);
    if (grid && k >= 3) {
        ctx.strokeStyle = 'rgba(0,0,0,0.28)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        var x, y;
        for (x = 0; x <= small.width; x++) { ctx.moveTo(x * k + .5, 0); ctx.lineTo(x * k + .5, canvas.height); }
        for (y = 0; y <= small.height; y++) { ctx.moveTo(0, y * k + .5); ctx.lineTo(canvas.width, y * k + .5); }
        ctx.stroke();
    }
}

function currentPalette() {
    var el = document.querySelector('#px-palettes .px-pal.active');
    return el ? el.getAttribute('data-pal') : 'gameboy';
}

function exportPNG() {
    if (!state.workCanvas) { showTip('请先上传图片。'); return; }
    var s = parseInt((document.querySelector('input[name=pxs]:checked') || {}).value || '2', 10);
    var out = document.createElement('canvas');
    out.width = state.workW * s;
    out.height = state.workH * s;
    var ctx = out.getContext('2d');
    ctx.imageSmoothingEnabled = false; // 导出同样硬像素
    ctx.drawImage(state.workCanvas, 0, 0, out.width, out.height);
    out.toBlob(function (blob) {
        if (!blob) { showTip('导出失败，请重试。'); return; }
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = state.fileName + '-pixel-' + state.workW + 'x' + state.workH + '-' + s + 'x.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    }, 'image/png');
}

// 调色板按钮上的色板缩略图
function renderSwatches() {
    var els = document.querySelectorAll('.px-swatches[data-sw]');
    for (var i = 0; i < els.length; i++) {
        (function (el) {
            var pal = PALETTES[el.getAttribute('data-sw')];
            if (!pal) return;
            var show = pal.colors.slice(0, 8); // 太多色只展示前 8 格
            el.innerHTML = show.map(function (c) {
                return '<i style="background:rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')"></i>';
            }).join('');
        })(els[i]);
    }
}

function bindScaleRadios() {
    var labels = document.querySelectorAll('#px-scale label');
    for (var i = 0; i < labels.length; i++) {
        (function (label) {
            label.querySelector('input').addEventListener('change', function () {
                for (var j = 0; j < labels.length; j++) labels[j].classList.remove('on');
                label.classList.add('on');
            });
        })(labels[i]);
    }
}

function init() {
    var upload = $('px-upload'), fileInput = $('px-file');
    if (!upload) return;

    renderSwatches();
    bindScaleRadios();

    function openPicker() { fileInput.click(); }
    upload.addEventListener('click', openPicker);
    upload.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); }
    });
    fileInput.addEventListener('change', function () {
        readFile(fileInput.files[0]);
        fileInput.value = '';
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
        upload.addEventListener(ev, function (e) { e.preventDefault(); upload.classList.add('dragover'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
        upload.addEventListener(ev, function (e) { e.preventDefault(); upload.classList.remove('dragover'); });
    });
    upload.addEventListener('drop', function (e) {
        var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) readFile(f);
    });
    // 拖拽到页面其他区域时阻止浏览器默认打开文件
    window.addEventListener('dragover', function (e) { e.preventDefault(); });
    window.addEventListener('drop', function (e) { e.preventDefault(); });

    $('px-width').addEventListener('input', function () {
        $('px-width-val').textContent = this.value + ' px';
        render();
    });
    $('px-colors').addEventListener('input', function () {
        $('px-colors-val').textContent = this.value + ' 色';
        if (currentPalette() === 'custom') render();
    });
    var pals = document.querySelectorAll('#px-palettes .px-pal');
    for (var i = 0; i < pals.length; i++) {
        (function (btn) {
            btn.addEventListener('click', function () {
                for (var j = 0; j < pals.length; j++) pals[j].classList.remove('active');
                btn.classList.add('active');
                $('px-custom-row').style.display = btn.getAttribute('data-pal') === 'custom' ? 'flex' : 'none';
                render();
            });
        })(pals[i]);
    }
    $('px-grid').addEventListener('change', render);
    $('px-alpha').addEventListener('change', render);
    $('px-export').addEventListener('click', exportPNG);
    $('px-reupload').addEventListener('click', openPicker);
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}

/* node 单元测试导出 */
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PALETTES: PALETTES, getPalette: getPalette, nearestColorIndex: nearestColorIndex, medianCut: medianCut, quantizeImageData: quantizeImageData };
}

})();
