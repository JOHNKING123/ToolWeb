/* 扫描件效果生成器 - 纯前端图片扫描质感模拟（灰度+对比度+纸张噪点+轻微倾斜+边缘阴影）
 * 数据只在浏览器里处理：零第三方依赖、无任何后端调用、无网络请求（脚本内零 fetch/XHR）。
 * 纯函数契约（浏览器/Node 通用，非法参数抛 Error，err.field 给出字段名，不静默钳制）：
 *   grayOf(r, g, b)      -> number（luminosity 0.299/0.587/0.114，四舍五入取整；
 *                           任一参数非 0~255 数字抛 Error，err.field='rgb'）
 *   contrastOf(v, strength) -> number（strength 0~100；对比度因子 1+strength/50，
 *                           v 围绕 128 拉伸后 clamp 到 0~255 取整；
 *                           strength 非法抛 Error，err.field='strength'；
 *                           v 非数字抛 Error，err.field='v'）
 *   noiseOf(seed, x, y)  -> number（mulberry32 确定性噪点，返回 0~255 整数；
 *                           seed 非整数抛 Error，err.field='seed'；x/y 非数字抛 Error，err.field='xy'）
 *   buildScanName(dt)    -> string（scanned-YYYYMMDD-HHmmss.png；
 *                           非法日期抛 Error，err.field='dt'）
 * 渲染管线（canvas）：原图绘制 → 灰度＋对比度增强（质感滑杆联动）→ 种子随机纸张噪点叠加
 *   → 轻微旋转（透明背景补边）→ 边缘渐暗阴影（vignette）→ 预览＋导出 PNG。
 * 浏览器内运行：文件尾部把 init 挂到 DOMContentLoaded；
 * Node 自测：module.exports 暴露纯函数。
 */
(function () {
'use strict';

function err(field, msg) {
    var e = new Error(msg);
    e.field = field;
    return e;
}

function isByte(v) {
    return typeof v === 'number' && isFinite(v) && v >= 0 && v <= 255;
}

/* 灰度：luminosity 口径，四舍五入取整 */
function grayOf(r, g, b) {
    if (!isByte(r) || !isByte(g) || !isByte(b)) {
        throw err('rgb', 'grayOf: r/g/b 必须为 0~255 的数字');
    }
    return Math.round(0.299 * r + 0.587 * g + 0.114 * b);
}

/* 对比度：因子 1+strength/50，v 围绕 128 拉伸后 clamp 到 0~255 取整 */
function contrastOf(v, strength) {
    if (typeof strength !== 'number' || !isFinite(strength) || strength < 0 || strength > 100) {
        throw err('strength', 'contrastOf: strength 必须为 0~100 的数字');
    }
    if (typeof v !== 'number' || !isFinite(v)) {
        throw err('v', 'contrastOf: v 必须为数字');
    }
    var factor = 1 + strength / 50;
    var out = (v - 128) * factor + 128;
    if (out < 0) out = 0;
    if (out > 255) out = 255;
    return Math.round(out);
}

/* mulberry32：确定性伪随机数发生器，返回 [0,1) */
function mulberry32(a) {
    a = a | 0;
    return function () {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        var t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/* 确定性纸张噪点：(seed, x, y) 混合成 uint32 后走一步 mulberry32，返回 0~255 整数 */
function noiseOf(seed, x, y) {
    if (typeof seed !== 'number' || !isFinite(seed) || Math.floor(seed) !== seed) {
        throw err('seed', 'noiseOf: seed 必须为整数');
    }
    if (typeof x !== 'number' || typeof y !== 'number' || !isFinite(x) || !isFinite(y)) {
        throw err('xy', 'noiseOf: x/y 必须为数字');
    }
    var h = (seed ^ Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263)) | 0;
    return Math.floor(mulberry32(h)() * 256);
}

/* 下载文件名：scanned-YYYYMMDD-HHmmss.png */
function buildScanName(dt) {
    if (!(dt instanceof Date) || isNaN(dt.getTime())) {
        throw err('dt', 'buildScanName: dt 必须为有效 Date');
    }
    function p2(n) { return (n < 10 ? '0' : '') + n; }
    return 'scanned-' + dt.getFullYear() + p2(dt.getMonth() + 1) + p2(dt.getDate()) +
        '-' + p2(dt.getHours()) + p2(dt.getMinutes()) + p2(dt.getSeconds()) + '.png';
}

/* ============ 浏览器 UI ============ */
var MAX_DIM = 1600;          /* 渲染上限边长（性能保护） */
var ACCEPT_RE = /^image\/(jpeg|png|webp)$/;

function sampleImage(doc) {
    /* 内置演示样张：纯 canvas 绘制的模拟合同页（无外部资源） */
    var c = doc.createElement('canvas');
    c.width = 900; c.height = 1200;
    var g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 900, 1200);
    g.fillStyle = '#111827'; g.textAlign = 'center';
    g.font = 'bold 44px sans-serif';
    g.fillText('劳 动 合 同（演示样张）', 450, 110);
    g.textAlign = 'left'; g.font = '26px sans-serif'; g.fillStyle = '#374151';
    var lines = [
        '甲方（用人单位）：某某科技有限公司',
        '乙方（劳动者）：张三　身份证号：4403**********1234',
        '',
        '第一条　本合同为固定期限劳动合同，期限自 2026 年 1 月 1 日起',
        '至 2028 年 12 月 31 日止。',
        '',
        '第二条　乙方同意根据甲方需要，担任软件工程师岗位工作。',
        '',
        '第三条　甲方每月 10 日前以货币形式支付乙方工资，月工资',
        '为人民币 18000 元。',
        '',
        '……（正文省略）……',
        '',
        '',
        '甲方（盖章）：　　　　　　　　乙方（签字）：'
    ];
    lines.forEach(function (ln, i) { g.fillText(ln, 90, 200 + i * 52); });
    /* 模拟公章 */
    g.strokeStyle = '#c0392b'; g.lineWidth = 7;
    g.beginPath(); g.arc(680, 1010, 95, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#c0392b'; g.font = 'bold 34px sans-serif'; g.textAlign = 'center';
    g.fillText('某某科技', 680, 1000);
    g.fillText('有限公司', 680, 1045);
    return c.toDataURL('image/png');
}

function init() {
    function $(id) { return document.getElementById(id); }
    var drop = $('sg-drop'), fileInput = $('sg-file');
    var quality = $('sg-quality'), qualityVal = $('sg-quality-val');
    var tilt = $('sg-tilt'), tiltVal = $('sg-tilt-val'), tiltWarn = $('sg-tilt-warn');
    var grayBox = $('sg-gray'), vigBox = $('sg-vig');
    var canvas = $('sg-canvas'), empty = $('sg-empty');
    var downloadBtn = $('sg-download'), sampleBtn = $('sg-sample'), clearBtn = $('sg-clear');
    var fileNameEl = $('sg-filename');

    var img = null;          /* 当前原图 Image */
    var seed = 1;            /* 本次图片的噪点种子（换图时重掷，拖滑杆不重掷） */
    var renderTimer = null;

    function toast(msg) {
        var el = $('sg-toast');
        el.textContent = msg;
        el.className = 'show';
        setTimeout(function () { el.className = ''; }, 2200);
    }

    function currentParams() {
        return {
            quality: parseFloat(quality.value),
            tilt: parseFloat(tilt.value),
            gray: grayBox.checked,
            vignette: vigBox.checked
        };
    }

    /* 核心渲染管线：灰度+对比 → 噪点 → 旋转（透明补边）→ 边缘阴影 */
    function render() {
        if (!img) return;
        var p = currentParams();

        var w = img.naturalWidth || img.width;
        var h = img.naturalHeight || img.height;
        var scale = Math.min(1, MAX_DIM / Math.max(w, h));
        w = Math.max(1, Math.round(w * scale));
        h = Math.max(1, Math.round(h * scale));

        /* 1) 原图绘制到离屏 canvas */
        var off = document.createElement('canvas');
        off.width = w; off.height = h;
        var octx = off.getContext('2d');
        octx.drawImage(img, 0, 0, w, h);
        var idata = octx.getImageData(0, 0, w, h);
        var d = idata.data;

        /* 2) 灰度＋对比度增强；3) 种子随机纸张噪点叠加 */
        var noiseAmt = (p.quality / 100) * 0.32;   /* 噪点最大振幅系数 */
        for (var y = 0; y < h; y++) {
            for (var x = 0; x < w; x++) {
                var i = (y * w + x) * 4;
                var r = d[i], g = d[i + 1], b = d[i + 2];
                if (p.gray) {
                    var gv = grayOf(r, g, b);
                    r = gv; g = gv; b = gv;
                }
                r = contrastOf(r, p.quality);
                g = contrastOf(g, p.quality);
                b = contrastOf(b, p.quality);
                if (noiseAmt > 0) {
                    var nz = (noiseOf(seed, x, y) - 128) * 2 * noiseAmt;
                    r += nz; g += nz; b += nz;
                }
                d[i] = r; d[i + 1] = g; d[i + 2] = b;
            }
        }
        octx.putImageData(idata, 0, 0);

        /* 4) 轻微旋转：画布放大到包络盒，透明背景补边 */
        var rad = p.tilt * Math.PI / 180;
        var cos = Math.abs(Math.cos(rad)), sin = Math.abs(Math.sin(rad));
        var rw = Math.ceil(w * cos + h * sin);
        var rh = Math.ceil(w * sin + h * cos);
        canvas.width = rw; canvas.height = rh;
        var ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, rw, rh);
        ctx.save();
        ctx.translate(rw / 2, rh / 2);
        ctx.rotate(rad);
        ctx.drawImage(off, -w / 2, -h / 2);
        ctx.restore();

        /* 5) 边缘渐暗阴影（vignette） */
        if (p.vignette) {
            var grad = ctx.createRadialGradient(
                rw / 2, rh / 2, Math.min(rw, rh) * 0.38,
                rw / 2, rh / 2, Math.max(rw, rh) * 0.72);
            grad.addColorStop(0, 'rgba(0,0,0,0)');
            grad.addColorStop(1, 'rgba(0,0,0,0.30)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, rw, rh);
        }

        empty.style.display = 'none';
        canvas.style.display = 'block';
        downloadBtn.disabled = false;
    }

    function scheduleRender() {
        if (renderTimer) clearTimeout(renderTimer);
        renderTimer = setTimeout(render, 120);
    }

    function updateLabels() {
        qualityVal.textContent = quality.value;
        tiltVal.textContent = parseFloat(tilt.value).toFixed(1) + '°';
        tiltWarn.style.display = Math.abs(parseFloat(tilt.value)) > 2 ? 'block' : 'none';
    }

    function loadFromDataURL(dataURL, name) {
        var im = new Image();
        im.onload = function () {
            img = im;
            seed = (Math.random() * 2147483647) | 0;
            fileNameEl.textContent = '当前图片：' + name;
            render();
            toast('图片已载入（仅本地处理，不上传）');
        };
        im.onerror = function () { toast('图片解码失败，请换一张试试'); };
        im.src = dataURL;
    }

    function handleFile(f) {
        if (!f) return;
        if (!ACCEPT_RE.test(f.type || '')) {
            toast('仅支持 JPG / PNG / WebP 图片');
            return;
        }
        var reader = new FileReader();
        reader.onload = function () { loadFromDataURL(String(reader.result || ''), f.name); };
        reader.onerror = function () { toast('文件读取失败，请重试'); };
        reader.readAsDataURL(f);
    }

    drop.addEventListener('click', function () { fileInput.click(); });
    drop.addEventListener('dragover', function (e) {
        e.preventDefault(); drop.classList.add('sg-dragover');
    });
    drop.addEventListener('dragleave', function () { drop.classList.remove('sg-dragover'); });
    drop.addEventListener('drop', function (e) {
        e.preventDefault(); drop.classList.remove('sg-dragover');
        var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        handleFile(f);
    });
    fileInput.addEventListener('change', function () {
        handleFile(fileInput.files && fileInput.files[0]);
        fileInput.value = '';
    });

    quality.addEventListener('input', function () { updateLabels(); scheduleRender(); });
    tilt.addEventListener('input', function () { updateLabels(); scheduleRender(); });
    grayBox.addEventListener('change', scheduleRender);
    vigBox.addEventListener('change', scheduleRender);

    sampleBtn.addEventListener('click', function () {
        loadFromDataURL(sampleImage(document), '演示样张（内置生成）');
    });
    clearBtn.addEventListener('click', function () {
        img = null;
        canvas.style.display = 'none';
        empty.style.display = 'block';
        downloadBtn.disabled = true;
        fileNameEl.textContent = '';
        toast('已清空');
    });
    downloadBtn.addEventListener('click', function () {
        if (!img) { toast('请先上传图片'); return; }
        canvas.toBlob(function (blob) {
            if (!blob) { toast('导出失败，请重试'); return; }
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            try {
                a.download = buildScanName(new Date());
            } catch (e) {
                a.download = 'scanned.png';
            }
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(function () { URL.revokeObjectURL(a.href); }, 500);
            toast('已下载（文件名含时间戳）');
        }, 'image/png');
    });

    updateLabels();
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else { init(); }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        grayOf: grayOf, contrastOf: contrastOf, noiseOf: noiseOf, buildScanName: buildScanName,
        mulberry32: mulberry32, MAX_DIM: MAX_DIM
    };
}

})();
