/* 图片复古做旧 - 纯前端胶片滤镜引擎
 *
 * 流程：上传图片（FileReader + canvas，全本地处理，不上传）→ 下采样到工作分辨率（长边 ≤ 2048）
 * → 预设堆叠：柯达暖黄 / 富士胶片 / CCD 数码风 / 褪色老照片 / 黑白胶片（色调矩阵，逐预设 0–100 强度 lerp 混合）
 * → 叠加：漏光（径向暖色光晕，screen 混合）/ 暗角（径向压暗）/ 胶片颗粒（纯前端确定性伪随机噪点，粒度可调）
 * → canvas 实时预览 + 原图/效果滑动对比条 → PNG/JPEG 本地导出（JPEG 质量 0.8/0.92/1.0 三档，canvas 重绘自然剥离 EXIF）。
 *
 * 图片只在浏览器本地处理：无后端调用、无第三方依赖、无 CDN。
 * 纯函数（hash2 / PRESET_FNS / applyPreset / applyGrain）在 node 下可单元测试。
 */
(function () {
'use strict';

/* ---------- 纯函数：色调变换 ---------- */

function clamp255(v) { return v < 0 ? 0 : (v > 255 ? 255 : v); }

// 确定性伪随机哈希（x, y 为整数块坐标）→ [-1, 1]；无 Math.random，保证同一参数渲染可复现
function hash2(x, y) {
    var h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = h ^ (h >>> 16);
    return (h >>> 0) / 4294967296 * 2 - 1;
}

// 预设色调：逐像素 f(r,g,b) -> [r,g,b]
var PRESET_FNS = {
    kodak: function (r, g, b) { // Kodak Gold 暖黄：暖移 + 轻对比
        return [r * 1.10 + g * 0.04 - 6, r * 0.03 + g * 1.00 + b * 0.02, g * 0.05 + b * 0.88 - 8];
    },
    fuji: function (r, g, b) { // Fuji 绿色调柔和：绿通道上扬
        return [r * 0.96 + g * 0.06 + b * 0.01, r * 0.02 + g * 1.02 + b * 0.03, r * 0.01 + g * 0.04 + b * 0.94];
    },
    ccd: function (r, g, b) { // CCD 数码风：高对比 + 冷色偏
        return [(r - 128) * 1.12 + 128 - 6, (g - 128) * 1.15 + 128, (b - 128) * 1.20 + 128 + 10];
    },
    faded: function (r, g, b) { // 褪色老照片：提黑降对比 + 暖调 + 轻去饱和
        var lum = 0.299 * r + 0.587 * g + 0.114 * b;
        var nr = r * 0.86 + 32, ng = g * 0.84 + 28, nb = b * 0.78 + 22;
        return [nr * 0.75 + (lum + 14) * 0.25, ng * 0.75 + (lum + 10) * 0.25, nb * 0.75 + (lum + 4) * 0.25];
    },
    bw: function (r, g, b) { // 黑白胶片：亮度灰度 + 轻对比
        var v = ((0.299 * r + 0.587 * g + 0.114 * b) - 128) * 1.12 + 128;
        return [v, v, v];
    }
};

// 对 ImageData 做预设变换：result = lerp(原像素, 变换后像素, strength)，strength ∈ [0,1]
function applyPreset(img, fn, strength) {
    var d = img.data, i, r, g, b, o;
    for (i = 0; i < d.length; i += 4) {
        r = d[i]; g = d[i + 1]; b = d[i + 2];
        o = fn(r, g, b);
        d[i]     = r + (clamp255(o[0]) - r) * strength;
        d[i + 1] = g + (clamp255(o[1]) - g) * strength;
        d[i + 2] = b + (clamp255(o[2]) - b) * strength;
    }
    return img;
}

// 胶片颗粒：按块坐标哈希的确定性噪点叠加；intensity ∈ [0,1]，grain ≥ 1 为噪点块边长（px），越大颗粒越粗
function applyGrain(img, intensity, grain) {
    var d = img.data, w = img.width, len = d.length;
    var i, x = 0, y = 0, n;
    grain = Math.max(1, Math.round(grain));
    var amp = intensity * 42;
    for (i = 0; i < len; i += 4) {
        n = hash2(Math.floor(x / grain), Math.floor(y / grain)) * amp;
        d[i]     = clamp255(d[i] + n);
        d[i + 1] = clamp255(d[i + 1] + n * 0.96);
        d[i + 2] = clamp255(d[i + 2] + n * 0.92);
        x++;
        if (x >= w) { x = 0; y++; }
    }
    return img;
}

/* ---------- 浏览器侧：引擎与交互 ---------- */

var MAX_SOURCE_EDGE = 2048;  // 源图下采样上限（长边）
var PREVIEW_EDGE = 1024;     // 预览分辨率上限（长边），滑杆实时渲染不卡顿

// 预设顺序 = 堆叠顺序
var PRESET_ORDER = ['kodak', 'fuji', 'ccd', 'faded', 'bw'];
var PRESET_NAMES = {
    kodak: '📷 柯达暖黄', fuji: '🎞️ 富士胶片', ccd: '📟 CCD 数码风',
    faded: '🕰️ 褪色老照片', bw: '⬛ 黑白胶片'
};

// 漏光位置：每组为 [fx, fy, 半径(对角线比例), 'r,g,b']
var LEAK_SPOTS = {
    auto: [[0.06, 0.08, 0.55, '255,120,60'], [0.96, 0.88, 0.50, '255,80,40'], [0.92, 0.04, 0.32, '255,200,120']],
    tl:   [[-0.02, -0.02, 0.62, '255,120,60'], [0.06, 0.02, 0.34, '255,200,140']],
    tr:   [[1.02, -0.02, 0.62, '255,120,60'], [0.94, 0.02, 0.34, '255,200,140']],
    bl:   [[-0.02, 1.02, 0.62, '255,110,50'], [0.06, 0.98, 0.34, '255,190,130']],
    br:   [[1.02, 1.02, 0.62, '255,110,50'], [0.94, 0.98, 0.34, '255,190,130']],
    diag: [[-0.02, -0.02, 0.55, '255,120,60'], [1.02, 1.02, 0.55, '255,90,45']]
};

var state = {
    srcCanvas: null,   // 下采样后的源图（≤2048 长边）
    fileName: 'retro-photo',
    comparePos: 50,    // 对比条位置（百分比）
    renderQueued: false
};

var defaults = {
    kodak: { on: true,  s: 70 }, fuji: { on: false, s: 70 }, ccd: { on: false, s: 70 },
    faded: { on: false, s: 70 }, bw:   { on: false, s: 85 },
    leak:  { on: false, s: 60, pos: 'auto' },
    vig:   { on: true,  s: 30 },
    grain: { on: true,  int: 25, size: 2 }
};

function $(id) { return document.getElementById(id); }

function showTip(msg) {
    var t = $('rf-tip');
    t.textContent = msg;
    t.className = 'rf-tip rf-tip-err';
    t.style.display = 'block';
}
function hideTip() { var t = $('rf-tip'); t.style.display = 'none'; }
function setStatus(msg) { $('rf-status').textContent = msg || ''; }

// 从页面控件读取当前参数
function readParams() {
    function ps(id) { // 预设：开关 + 强度
        return { on: $(id + '-on').checked, s: parseInt($(id + '-s').value, 10) };
    }
    return {
        kodak: ps('rf-kodak'), fuji: ps('rf-fuji'), ccd: ps('rf-ccd'),
        faded: ps('rf-faded'), bw: ps('rf-bw'),
        leak:  { on: $('rf-leak-on').checked, s: parseInt($('rf-leak-s').value, 10), pos: $('rf-leak-pos').value },
        vig:   { on: $('rf-vig-on').checked,  s: parseInt($('rf-vig-s').value, 10) },
        grain: { on: $('rf-grain-on').checked, int: parseInt($('rf-grain-int').value, 10), size: parseInt($('rf-grain-size').value, 10) }
    };
}

/* ---------- 渲染管线 ---------- */

// 漏光：径向暖色光晕，'lighter' 叠加
function drawLeak(ctx, W, H, strength, pos) {
    var spots = LEAK_SPOTS[pos] || LEAK_SPOTS.auto;
    var diag = Math.sqrt(W * W + H * H), i, sp, cx, cy, r, g;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (i = 0; i < spots.length; i++) {
        sp = spots[i];
        cx = sp[0] * W; cy = sp[1] * H; r = sp[2] * diag;
        g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, 'rgba(' + sp[3] + ',' + (0.55 * strength).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(' + sp[3] + ',0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
}

// 暗角：四周径向压暗
function drawVignette(ctx, W, H, strength) {
    var cx = W / 2, cy = H / 2;
    var r = Math.sqrt(cx * cx + cy * cy);
    var g = ctx.createRadialGradient(cx, cy, r * 0.45, cx, cy, r);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,' + (0.6 * strength).toFixed(3) + ')');
    ctx.save();
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
}

// 核心渲染：把源图按 params 渲染到 canvas（W×H）
function renderTo(canvas, W, H, p) {
    var ctx = canvas.getContext('2d');
    canvas.width = W; canvas.height = H;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(state.srcCanvas, 0, 0, W, H);

    var i, id, img, pr;
    for (i = 0; i < PRESET_ORDER.length; i++) {
        id = PRESET_ORDER[i]; pr = p[id];
        if (pr.on && pr.s > 0) {
            img = ctx.getImageData(0, 0, W, H);
            applyPreset(img, PRESET_FNS[id], pr.s / 100);
            ctx.putImageData(img, 0, 0);
        }
    }
    if (p.leak.on && p.leak.s > 0) drawLeak(ctx, W, H, p.leak.s / 100, p.leak.pos);
    if (p.vig.on && p.vig.s > 0) drawVignette(ctx, W, H, p.vig.s / 100);
    if (p.grain.on && p.grain.int > 0) {
        img = ctx.getImageData(0, 0, W, H);
        applyGrain(img, p.grain.int / 100, p.grain.size);
        ctx.putImageData(img, 0, 0);
    }
}

// 预览：原图 canvas + 效果 canvas（效果层按对比条位置裁剪）
function renderPreview() {
    if (!state.srcCanvas) return;
    var sw = state.srcCanvas.width, sh = state.srcCanvas.height;
    var k = Math.min(1, PREVIEW_EDGE / Math.max(sw, sh));
    var W = Math.max(1, Math.round(sw * k)), H = Math.max(1, Math.round(sh * k));
    var p = readParams();

    var orig = $('rf-orig-canvas');
    var octx = orig.getContext('2d');
    orig.width = W; orig.height = H;
    octx.imageSmoothingEnabled = true; octx.imageSmoothingQuality = 'high';
    octx.drawImage(state.srcCanvas, 0, 0, W, H);

    renderTo($('rf-eff-canvas'), W, H, p);
    updateCompareClip();
    updateMeta(p, W, H);
}

// rAF 节流：滑杆连续拖动时不堆积渲染任务
function queueRender() {
    if (!state.srcCanvas || state.renderQueued) return;
    state.renderQueued = true;
    requestAnimationFrame(function () {
        state.renderQueued = false;
        renderPreview();
    });
}

/* ---------- 原图/效果滑动对比条 ---------- */

function updateCompareClip() {
    var pos = state.comparePos;
    $('rf-eff-canvas').style.clipPath = 'inset(0 ' + (100 - pos) + '% 0 0)';
    $('rf-divider').style.left = pos + '%';
}

function bindCompare(stage) {
    var dragging = false;
    function setPos(clientX) {
        var rect = stage.getBoundingClientRect();
        var x = (clientX - rect.left) / rect.width * 100;
        state.comparePos = Math.max(2, Math.min(98, x));
        updateCompareClip();
    }
    stage.addEventListener('pointerdown', function (e) {
        dragging = true;
        stage.setPointerCapture(e.pointerId);
        setPos(e.clientX);
        e.preventDefault();
    });
    stage.addEventListener('pointermove', function (e) {
        if (dragging) setPos(e.clientX);
    });
    stage.addEventListener('pointerup', function () { dragging = false; });
    stage.addEventListener('pointercancel', function () { dragging = false; });
}

/* ---------- 上传 ---------- */

function readFile(file) {
    var ACCEPT = ['image/png', 'image/jpeg', 'image/webp'];
    if (!file) return;
    if (ACCEPT.indexOf(file.type) < 0) { showTip('暂不支持该格式，请上传 PNG / JPG / JPEG / WebP 图片。'); return; }
    if (file.size > 30 * 1024 * 1024) { showTip('图片超过 30MB，请先压缩再上传。'); return; }
    hideTip();
    setStatus('正在读取图片…');
    var reader = new FileReader();
    reader.onload = function () {
        var img = new Image();
        img.onload = function () { buildSource(img, file.name); };
        img.onerror = function () { showTip('图片读取失败，文件可能已损坏。'); setStatus(''); };
        img.src = reader.result;
    };
    reader.onerror = function () { showTip('文件读取失败。'); setStatus(''); };
    reader.readAsDataURL(file);
}

// 源图下采样到工作分辨率（长边 ≤ 2048）
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
    state.fileName = (name || 'retro-photo').replace(/\.[^.]+$/, '') || 'retro-photo';

    $('rf-srcinfo').style.display = 'block';
    $('rf-srcinfo').textContent = '已载入：' + w + ' × ' + h + ' 像素' +
        (scale < 1 ? '（已自动下采样到 ' + sw + ' × ' + sh + ' 工作分辨率）' : '');
    $('rf-controls').style.display = 'block';
    $('rf-result').style.display = 'block';
    // 按图片比例设置对比舞台
    $('rf-stage').style.aspectRatio = sw + ' / ' + sh;
    setStatus('');
    renderPreview();
}

function updateMeta(p, W, H) {
    var on = [];
    var i, id;
    for (i = 0; i < PRESET_ORDER.length; i++) {
        id = PRESET_ORDER[i];
        if (p[id].on && p[id].s > 0) on.push(PRESET_NAMES[id] + ' ' + p[id].s + '%');
    }
    if (p.leak.on && p.leak.s > 0) on.push('🌞 漏光 ' + p.leak.s + '%');
    if (p.vig.on && p.vig.s > 0) on.push('🌑 暗角 ' + p.vig.s + '%');
    if (p.grain.on && p.grain.int > 0) on.push('✨ 颗粒 ' + p.grain.int + '% / 粒度 ' + p.grain.size);
    $('rf-meta').innerHTML = '当前叠加：<b>' + (on.length ? on.join(' ＋ ') : '无（原图直出）') + '</b><br>' +
        '预览分辨率：' + W + ' × ' + H + '（导出按工作分辨率 ' +
        state.srcCanvas.width + ' × ' + state.srcCanvas.height + ' 全尺寸重绘）';
}

/* ---------- 导出 ---------- */

function exportImage(format) {
    if (!state.srcCanvas) { showTip('请先上传图片。'); return; }
    setStatus('正在导出…');
    var p = readParams();
    var sw = state.srcCanvas.width, sh = state.srcCanvas.height;
    var c = document.createElement('canvas');
    // 渲染与预览一致的管线（颗粒按输出分辨率逐像素重绘，非简单放大）
    setTimeout(function () {
        try {
            renderTo(c, sw, sh, p);
            var mime = format === 'png' ? 'image/png' : 'image/jpeg';
            var opt = { type: mime };
            if (format === 'jpg') {
                var q = document.querySelector('input[name="rfq"]:checked');
                opt.quality = q ? parseFloat(q.value) : 0.92;
            }
            c.toBlob(function (blob) {
                if (!blob) { showTip('导出失败，浏览器不支持该格式编码。'); setStatus(''); return; }
                var a = document.createElement('a');
                var url = URL.createObjectURL(blob);
                a.href = url;
                a.download = state.fileName + '-retro.' + (format === 'png' ? 'png' : 'jpg');
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
                setStatus('已导出：' + a.download + '（' + (blob.size / 1024).toFixed(1) + ' KB，EXIF 已剥离）');
            }, opt.type, opt.quality);
        } catch (e) {
            showTip('导出失败：' + e.message);
            setStatus('');
        }
    }, 30);
}

/* ---------- 初始化 ---------- */

function bindSliderValue(sliderId, labelId, fmt) {
    var s = $(sliderId);
    function upd() { $(labelId).textContent = fmt(parseInt(s.value, 10)); }
    s.addEventListener('input', function () { upd(); queueRender(); });
    upd();
}

function bindPresetCard(id) {
    $(id + '-on').addEventListener('change', function () {
        // 卡片高亮跟随开关状态
        var card = $('rf-card-' + id.replace('rf-', ''));
        if (card) card.classList.toggle('on', $(id + '-on').checked);
        queueRender();
    });
    bindSliderValue(id + '-s', id + '-val', function (v) { return v + ' %'; });
}

// JPEG 质量单选按钮高亮（与 pixel_art_converter 的 px-scale 同模式）
function bindQualityRadios() {
    var labels = document.querySelectorAll('#rf-quality label');
    for (var i = 0; i < labels.length; i++) {
        (function (label) {
            label.querySelector('input').addEventListener('change', function () {
                for (var j = 0; j < labels.length; j++) labels[j].classList.remove('on');
                label.classList.add('on');
            });
        })(labels[i]);
    }
}

function resetParams() {
    function set(id, on, s) {
        $(id + '-on').checked = on;
        $(id + '-s').value = s;
        $(id + '-val').textContent = s + ' %';
        var card = $('rf-card-' + id.replace('rf-', ''));
        if (card) card.classList.toggle('on', on);
    }
    set('rf-kodak', defaults.kodak.on, defaults.kodak.s);
    set('rf-fuji', defaults.fuji.on, defaults.fuji.s);
    set('rf-ccd', defaults.ccd.on, defaults.ccd.s);
    set('rf-faded', defaults.faded.on, defaults.faded.s);
    set('rf-bw', defaults.bw.on, defaults.bw.s);
    set('rf-leak', defaults.leak.on, defaults.leak.s);
    $('rf-leak-pos').value = defaults.leak.pos;
    set('rf-vig', defaults.vig.on, defaults.vig.s);
    $('rf-grain-on').checked = defaults.grain.on;
    $('rf-card-grain').classList.toggle('on', defaults.grain.on);
    $('rf-grain-int').value = defaults.grain.int;
    $('rf-grain-int-val').textContent = defaults.grain.int + ' %';
    $('rf-grain-size').value = defaults.grain.size;
    $('rf-grain-size-val').textContent = defaults.grain.size + ' px';
    queueRender();
}

function init() {
    var up = $('rf-upload'), file = $('rf-file');

    up.addEventListener('click', function () { file.click(); });
    up.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); }
    });
    file.addEventListener('change', function () {
        if (file.files && file.files[0]) readFile(file.files[0]);
        file.value = '';
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
        up.addEventListener(ev, function (e) { e.preventDefault(); up.classList.add('dragover'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
        up.addEventListener(ev, function (e) { e.preventDefault(); up.classList.remove('dragover'); });
    });
    up.addEventListener('drop', function (e) {
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]);
    });

    ['kodak', 'fuji', 'ccd', 'faded', 'bw'].forEach(function (id) { bindPresetCard('rf-' + id); });
    bindPresetCard('rf-leak');
    $('rf-leak-pos').addEventListener('change', queueRender);
    bindPresetCard('rf-vig');
    $('rf-grain-on').addEventListener('change', function () {
        $('rf-card-grain').classList.toggle('on', $('rf-grain-on').checked);
        queueRender();
    });
    bindSliderValue('rf-grain-int', 'rf-grain-int-val', function (v) { return v + ' %'; });
    bindSliderValue('rf-grain-size', 'rf-grain-size-val', function (v) { return v + ' px'; });

    bindCompare($('rf-stage'));
    bindQualityRadios();

    $('rf-export-png').addEventListener('click', function () { exportImage('png'); });
    $('rf-export-jpg').addEventListener('click', function () { exportImage('jpg'); });
    $('rf-reset').addEventListener('click', resetParams);
    $('rf-reupload').addEventListener('click', function () { file.click(); });
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}

// node 下单元测试纯函数（浏览器环境无 module，不受影响）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { hash2: hash2, PRESET_FNS: PRESET_FNS, applyPreset: applyPreset, applyGrain: applyGrain, clamp255: clamp255 };
}

})();
