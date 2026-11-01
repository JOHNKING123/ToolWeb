/* 负片图像还原 - 胶片底片扫描件还原工具（全色反转／彩色负片去橙色底／黑白负片）
 * 数据只在浏览器里处理：零第三方依赖、无任何后端调用、无网络请求（脚本内零 fetch/XHR）。
 * 纯函数契约（浏览器/Node 通用，非法参数抛 Error，err.field 给出字段名，不静默钳制）：
 *   invertOf(v)             -> 255-v（v 为 0–255 整数；非法抛 Error，err.field='v'）
 *   channelStretch(v,lo,hi) -> 把 v 从 [lo,hi] 线性拉伸到 [0,255]（round＋钳制；
 *                              v/lo/hi 均为 0–255 整数，lo>hi 非法；
 *                              lo==hi 时防除零：v>=hi→255 否则 0；
 *                              非法抛 Error，err.field='v'/'lo'/'hi'）
 *   invertAndStretch(v,lo,hi)-> channelStretch(invertOf(v),lo,hi)（彩色负片去橙色底的核心一步）
 *   buildFileName(date)     -> 'negative-20261101-094500.png'（Date 对象，本地时间；
 *                              非法抛 Error，err.field='date'）
 * 渲染管线（canvas，全部基于上面四个纯函数）：
 *   全色反转：逐像素 invertOf；
 *   彩色负片去橙色底：先逐像素 invertOf 求直方图 → 每通道取 1%/99% 分位作 lo/hi → 逐像素 invertAndStretch；
 *   黑白负片：逐像素 invertOf 后按 0.299/0.587/0.114 求灰度。
 * >20MP 大图：加载时按比例降采样到 20MP 以内并在页面明示（真限制）。
 * 浏览器内运行：文件尾部把 init 挂到 DOMContentLoaded；
 * Node 自测：module.exports 暴露纯函数。
 */
(function () {
'use strict';

/* 20MP 上限（像素数） */
var MAX_PIXELS = 20000000;

function err(field, msg) {
    var e = new Error(msg);
    e.field = field;
    return e;
}

function assertChannel(v, field) {
    if (typeof v !== 'number' || !isFinite(v) ||
            Math.floor(v) !== v || v < 0 || v > 255) {
        throw err(field, field + ': 必须为 0–255 整数');
    }
    return v;
}

/* 单通道反转：10→245 */
function invertOf(v) {
    assertChannel(v, 'v');
    return 255 - v;
}

/* 通道拉伸：把 v 从 [lo,hi] 映射到 [0,255]，四舍五入＋越界钳制。
 * lo==hi（零宽度，如纯色图的分位重合）时防除零：v>=hi→255，否则 0。 */
function channelStretch(v, lo, hi) {
    assertChannel(v, 'v');
    assertChannel(lo, 'lo');
    assertChannel(hi, 'hi');
    if (lo > hi) {
        throw err('lo', 'channelStretch: lo 不得大于 hi');
    }
    if (hi === lo) {
        return v >= hi ? 255 : 0;
    }
    var t = (v - lo) / (hi - lo) * 255;
    if (t <= 0) { return 0; }
    if (t >= 255) { return 255; }
    return Math.round(t);
}

/* 彩色负片去橙色底的核心一步：先反转，再按分位拉伸 */
function invertAndStretch(v, lo, hi) {
    return channelStretch(invertOf(v), lo, hi);
}

/* 导出文件名：negative-YYYYMMDD-HHmmss.png（本地时间） */
function buildFileName(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
        throw err('date', 'buildFileName: date 必须为有效 Date 对象');
    }
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return 'negative-' +
        date.getFullYear() + p(date.getMonth() + 1) + p(date.getDate()) + '-' +
        p(date.getHours()) + p(date.getMinutes()) + p(date.getSeconds()) + '.png';
}

/* ================= 浏览器管线 ================= */

var MODES = {
    invert: { id: 'invert', name: '全色反转' },
    color:  { id: 'color',  name: '彩色负片去橙色底' },
    bw:     { id: 'bw',     name: '黑白负片' }
};
var MODE_ORDER = ['invert', 'color', 'bw'];

var state = {
    mode: 'invert',
    origW: 0, origH: 0,        // 展示用尺寸（可能已降采样）
    srcW: 0, srcH: 0,          // 原图真实尺寸
    downscaled: false,
    origData: null,            // 原图的 ImageData（降采样后），重渲染的基准
    restoredURL: null
};

function $(id) { return document.getElementById(id); }

function toast(msg) {
    var t = $('nfr-toast');
    if (!t) { return; }
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 2200);
}

function showErr(msg) {
    var box = $('nfr-err');
    if (!box) { return; }
    if (msg) { box.style.display = 'block'; box.textContent = msg; }
    else { box.style.display = 'none'; box.textContent = ''; }
}

/* 从直方图（256 桶）取分位：p 为 0–1，返回最小的满足累计占比 >= p 的灰度级 */
function percentileOf(hist, total, p) {
    var target = total * p;
    var cum = 0, i;
    for (i = 0; i < 256; i++) {
        cum += hist[i];
        if (cum >= target) { return i; }
    }
    return 255;
}

function setCanvas(canvas, w, h) {
    canvas.width = w;
    canvas.height = h;
}

/* 模式渲染：读 state.origData，写 restored canvas。全部走纯函数。 */
function render() {
    var origC = $('nfr-canvas-orig'), restC = $('nfr-canvas-restored');
    if (!state.origData) { return; }
    var w = state.origW, h = state.origH;
    setCanvas(origC, w, h);
    setCanvas(restC, w, h);
    origC.style.display = 'inline-block';
    restC.style.display = 'inline-block';
    var octx = origC.getContext('2d'), rctx = restC.getContext('2d');
    octx.putImageData(state.origData, 0, 0);

    var src = state.origData.data;
    var out = rctx.createImageData(w, h);
    var dst = out.data;
    var i, r, g, b, n = w * h;
    var mode = state.mode;

    if (mode === 'invert') {
        for (i = 0; i < n; i++) {
            var o = i * 4;
            dst[o]     = invertOf(src[o]);
            dst[o + 1] = invertOf(src[o + 1]);
            dst[o + 2] = invertOf(src[o + 2]);
            dst[o + 3] = 255;
        }
    } else if (mode === 'color') {
        /* 彩色负片：先反转并统计三通道直方图，再用 1%/99% 分位逐通道拉伸去橙色底 */
        var hR = new Array(256), hG = new Array(256), hB = new Array(256);
        for (i = 0; i < 256; i++) { hR[i] = 0; hG[i] = 0; hB[i] = 0; }
        var inv = new Uint8Array(n * 3);
        for (i = 0; i < n; i++) {
            var o2 = i * 4, p3 = i * 3;
            r = invertOf(src[o2]); g = invertOf(src[o2 + 1]); b = invertOf(src[o2 + 2]);
            inv[p3] = r; inv[p3 + 1] = g; inv[p3 + 2] = b;
            hR[r]++; hG[g]++; hB[b]++;
        }
        var loR = percentileOf(hR, n, 0.01), hiR = percentileOf(hR, n, 0.99);
        var loG = percentileOf(hG, n, 0.01), hiG = percentileOf(hG, n, 0.99);
        var loB = percentileOf(hB, n, 0.01), hiB = percentileOf(hB, n, 0.99);
        for (i = 0; i < n; i++) {
            var o3 = i * 4, q3 = i * 3;
            dst[o3]     = invertAndStretch(inv[q3], loR, hiR);
            dst[o3 + 1] = invertAndStretch(inv[q3 + 1], loG, hiG);
            dst[o3 + 2] = invertAndStretch(inv[q3 + 2], loB, hiB);
            dst[o3 + 3] = 255;
        }
        var info = $('nfr-info');
        if (info) {
            info.innerHTML = '原图 <b>' + state.srcW + '×' + state.srcH + '</b>' +
                (state.downscaled ? '（已降采样到 ' + w + '×' + h + '，见真限制）' : '（' + w + '×' + h + '）') +
                ' · 模式 <b>' + MODES[mode].name + '</b>（R 分位 [' + loR + ',' + hiR + ']，G [' +
                loG + ',' + hiG + ']，B [' + loB + ',' + hiB + ']）';
        }
    } else { /* bw 黑白负片：反转后按人眼亮度取灰 */
        for (i = 0; i < n; i++) {
            var o4 = i * 4;
            r = invertOf(src[o4]); g = invertOf(src[o4 + 1]); b = invertOf(src[o4 + 2]);
            var gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
            dst[o4] = gray; dst[o4 + 1] = gray; dst[o4 + 2] = gray; dst[o4 + 3] = 255;
        }
    }

    rctx.putImageData(out, 0, 0);
    if (mode !== 'color') {
        var info2 = $('nfr-info');
        if (info2) {
            info2.innerHTML = '原图 <b>' + state.srcW + '×' + state.srcH + '</b>' +
                (state.downscaled ? '（已降采样到 ' + w + '×' + h + '，见真限制）' : '（' + w + '×' + h + '）') +
                ' · 模式 <b>' + MODES[mode].name + '</b>';
        }
    }
    var e1 = $('nfr-empty'), e2 = $('nfr-empty-orig');
    if (e1) { e1.style.display = 'none'; }
    if (e2) { e2.style.display = 'none'; }

    /* 更新下载链接 */
    if (state.restoredURL) { URL.revokeObjectURL(state.restoredURL); state.restoredURL = null; }
    var dl = $('nfr-download'), cp = $('nfr-copy-url');
    dl.disabled = false; cp.disabled = false;
    var dataURL = restC.toDataURL('image/png');
    dl.href = dataURL;
    dl.download = buildFileName(new Date());
    dl.dataset.dataurl = dataURL;
}

function loadFile(file) {
    showErr(null);
    var okTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (okTypes.indexOf(file.type) === -1) {
        showErr('只支持 JPG / PNG / WebP 图片（当前：' + (file.type || '未知类型') + '）。');
        return;
    }
    var reader = new FileReader();
    reader.onload = function () {
        var img = new Image();
        img.onload = function () {
            state.srcW = img.naturalWidth; state.srcH = img.naturalHeight;
            var total = state.srcW * state.srcH;
            var scale = 1;
            state.downscaled = false;
            if (total > MAX_PIXELS) {
                scale = Math.sqrt(MAX_PIXELS / total);
                state.downscaled = true;
            }
            state.origW = Math.max(1, Math.round(state.srcW * scale));
            state.origH = Math.max(1, Math.round(state.srcH * scale));
            var c = document.createElement('canvas');
            setCanvas(c, state.origW, state.origH);
            var ctx = c.getContext('2d');
            ctx.drawImage(img, 0, 0, state.origW, state.origH);
            state.origData = ctx.getImageData(0, 0, state.origW, state.origH);
            if (state.downscaled) {
                toast('原图 ' + (total / 1e6).toFixed(1) + 'MP 超过 20MP，已降采样到 ' +
                    (state.origW * state.origH / 1e6).toFixed(1) + 'MP 导出（真限制）');
            }
            render();
        };
        img.onerror = function () { showErr('图片解码失败，文件可能已损坏。'); };
        img.src = reader.result;
    };
    reader.onerror = function () { showErr('文件读取失败。'); };
    reader.readAsDataURL(file);
}

function copyDataURL() {
    var dl = $('nfr-download');
    var dataURL = dl.dataset.dataurl || '';
    if (!dataURL) { toast('请先上传图片'); return; }
    function fallback() {
        var ta = document.createElement('textarea');
        ta.value = dataURL;
        ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); toast('Data URL 已复制'); }
        catch (e) { toast('复制失败，请手动复制'); }
        document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(dataURL).then(
            function () { toast('Data URL 已复制'); },
            fallback
        );
    } else { fallback(); }
}

function init() {
    var fileInput = $('nfr-file');
    if (!fileInput) { return; } /* 非本工具页面 */
    fileInput.addEventListener('change', function () {
        if (fileInput.files && fileInput.files[0]) { loadFile(fileInput.files[0]); }
    });
    var radios = document.querySelectorAll('input[name="nfr-mode"]');
    for (var i = 0; i < radios.length; i++) {
        radios[i].addEventListener('change', function () {
            state.mode = this.value;
            if (state.origData) { render(); }
        });
    }
    $('nfr-copy-url').addEventListener('click', copyDataURL);
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else { init(); }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        invertOf: invertOf,
        channelStretch: channelStretch,
        invertAndStretch: invertAndStretch,
        buildFileName: buildFileName,
        MODES: MODES, MODE_ORDER: MODE_ORDER, MAX_PIXELS: MAX_PIXELS
    };
}

})();
