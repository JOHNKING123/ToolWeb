/* 照片拼图合成器（照片墙）- 纯前端 canvas 多图布局拼合逻辑
 * 上传/拖拽多图 → 布局模板（2/3/4/6/9 宫格）→ 点击/拖拽换位 → 间距/圆角/背景色可调
 * → canvas 实时预览合成 → 下载 PNG。纯本地零上传。
 * 纯函数契约（家族惯例：非法参数抛 Error，err.field 给字段名，不静默钳制）：
 * validateCollageConfig / computeCollageLayout / swapCollageSlots / buildCollageFileName */
(function () {
'use strict';

/* ---------- 布局模板数据 ---------- */
var LAYOUTS = {
    'grid-2': { cols: 2, rows: 1, label: '2 宫格', sub: '横排' },
    'grid-3': { cols: 3, rows: 1, label: '3 宫格', sub: '横排' },
    'grid-4': { cols: 2, rows: 2, label: '4 宫格', sub: '2×2' },
    'grid-6': { cols: 3, rows: 2, label: '6 宫格', sub: '3×2' },
    'grid-9': { cols: 3, rows: 3, label: '9 宫格', sub: '3×3' }
};
var EXPORT_CELL = 600;      // 导出画布单格基准边长（px）
var MAX_SIDE = 16384;       // canvas 单边安全上限（浏览器硬限制口径）
var GAP_MIN = 0, GAP_MAX = 64;
var RADIUS_MIN = 0, RADIUS_MAX = 200;
var ACCEPT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
var ACCEPT_EXT = /\.(jpe?g|png|webp)$/i;

/* ---------- 纯函数 ---------- */
function collageError(field, message) {
    var e = new Error(message);
    e.field = field;
    return e;
}

function isNum(v) {
    return typeof v === 'number' && isFinite(v);
}

/* 校验拼图配置：非法抛 Error（err.field），合法返回 {ok:true} */
function validateCollageConfig(config) {
    var cfg = config;
    if (!cfg || typeof cfg !== 'object') {
        throw collageError('images', '配置缺失：images 必须是非空数组');
    }
    if (!Array.isArray(cfg.images) || cfg.images.length === 0) {
        throw collageError('images', 'images 必须是非空数组');
    }
    if (!LAYOUTS[cfg.layout]) {
        throw collageError('layout', 'layout 非法：' + String(cfg.layout) + '，可选 ' + Object.keys(LAYOUTS).join(' / '));
    }
    var gap = cfg.gap === undefined ? 0 : cfg.gap;
    if (!isNum(gap) || gap < GAP_MIN || gap > GAP_MAX) {
        throw collageError('gap', 'gap 必须在 [' + GAP_MIN + ',' + GAP_MAX + '] 之间');
    }
    var radius = cfg.radius === undefined ? 0 : cfg.radius;
    if (!isNum(radius) || radius < RADIUS_MIN || radius > RADIUS_MAX) {
        throw collageError('radius', 'radius 必须在 [' + RADIUS_MIN + ',' + RADIUS_MAX + '] 之间');
    }
    return { ok: true };
}

/* 计算布局：给定 {width,height,layout,gap} → 每格 {x,y,w,h}（行优先，逐字确定） */
function computeCollageLayout(config) {
    var cfg = config || {};
    var def = LAYOUTS[cfg.layout];
    if (!def || !isNum(cfg.width) || cfg.width <= 0 || !isNum(cfg.height) || cfg.height <= 0) {
        throw collageError('layout', '布局非法：width/height 须为正数且 layout 须为已知模板');
    }
    var gap = cfg.gap === undefined ? 0 : cfg.gap;
    if (!isNum(gap) || gap < GAP_MIN || gap > GAP_MAX) {
        throw collageError('gap', 'gap 必须在 [' + GAP_MIN + ',' + GAP_MAX + '] 之间');
    }
    var cols = def.cols, rows = def.rows;
    var cellW = (cfg.width - (cols - 1) * gap) / cols;
    var cellH = (cfg.height - (rows - 1) * gap) / rows;
    if (!(cellW > 0) || !(cellH > 0)) {
        throw collageError('layout', '布局非法：画布尺寸容不下格数与间距');
    }
    var cells = [];
    var r, c;
    for (r = 0; r < rows; r++) {
        for (c = 0; c < cols; c++) {
            cells.push({
                x: c * (cellW + gap),
                y: r * (cellH + gap),
                w: cellW,
                h: cellH
            });
        }
    }
    return cells;
}

/* 槽位交换：返回交换 i/j 位置后的新数组（不改原数组） */
function swapCollageSlots(slots, i, j) {
    if (!Array.isArray(slots)) {
        throw collageError('slots', 'slots 必须是非空数组');
    }
    function bad(n) {
        return !isNum(n) || Math.floor(n) !== n || n < 0 || n >= slots.length;
    }
    if (bad(i) || bad(j)) {
        throw collageError('index', '下标越界：i/j 须为 [0,' + slots.length + ') 整数');
    }
    var out = slots.slice();
    var t = out[i];
    out[i] = out[j];
    out[j] = t;
    return out;
}

/* 下载文件名：photo_collage_YYYYMMDD_HHmmss.png（非法 date 回落当前时间） */
function buildCollageFileName(date) {
    var d = (date instanceof Date && !isNaN(date.getTime())) ? date : new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return 'photo_collage_' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) +
        '_' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + '.png';
}

/* cover 裁剪数学：源图等比填满目标格（居中裁掉超出部分，非拉伸） */
function coverCrop(srcW, srcH, dstW, dstH) {
    var scale = Math.max(dstW / srcW, dstH / srcH);
    var dw = srcW * scale, dh = srcH * scale;
    return { scale: scale, dx: (dstW - dw) / 2, dy: (dstH - dh) / 2, dw: dw, dh: dh };
}

/* 导出画布尺寸：按布局格数 × 单格基准边长 + 间距 */
function collageCanvasSize(layout, gap) {
    var def = LAYOUTS[layout];
    if (!def) {
        throw collageError('layout', 'layout 非法：' + String(layout));
    }
    var g = gap === undefined ? 0 : gap;
    if (!isNum(g) || g < GAP_MIN || g > GAP_MAX) {
        throw collageError('gap', 'gap 必须在 [' + GAP_MIN + ',' + GAP_MAX + '] 之间');
    }
    return {
        w: def.cols * EXPORT_CELL + (def.cols - 1) * g,
        h: def.rows * EXPORT_CELL + (def.rows - 1) * g
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        LAYOUTS: LAYOUTS,
        EXPORT_CELL: EXPORT_CELL,
        GAP_MIN: GAP_MIN, GAP_MAX: GAP_MAX,
        RADIUS_MIN: RADIUS_MIN, RADIUS_MAX: RADIUS_MAX,
        validateCollageConfig: validateCollageConfig,
        computeCollageLayout: computeCollageLayout,
        swapCollageSlots: swapCollageSlots,
        buildCollageFileName: buildCollageFileName,
        coverCrop: coverCrop,
        collageCanvasSize: collageCanvasSize
    };
    return;
}

/* ---------- 浏览器 DOM 逻辑 ---------- */
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
            reject(new Error('canvas 转 Blob 不受支持'));
        }
    });
}

function decodeImage(file) {
    if (typeof createImageBitmap === 'function') {
        return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(function () {
            return createImageBitmap(file);
        }).then(function (bmp) {
            return { bmp: bmp, w: bmp.width, h: bmp.height };
        });
    }
    return new Promise(function (resolve, reject) {
        var url = URL.createObjectURL(file);
        var img = new Image();
        img.onload = function () {
            URL.revokeObjectURL(url);
            resolve({ bmp: img, w: img.naturalWidth, h: img.naturalHeight });
        };
        img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('图片解码失败')); };
        img.src = url;
    });
}

/* ---------- 状态 ---------- */
var photos = [];        // {id, name, bmp, w, h, thumbUrl}
var seq = 0;
var slots = [];         // 长度=布局格数，元素为 photo id 或 null
var settings = {
    layout: 'grid-4',
    gap: 8,
    radius: 0,
    bg: '#ffffff'       // 或 'transparent'
};
var selSlot = -1;       // 选中的槽位下标（点击换位用）
var selSpare = null;    // 选中的备用图 id
var dragFrom = null;    // {kind:'slot'|'spare', index/id}

function cellCount() { return LAYOUTS[settings.layout].cols * LAYOUTS[settings.layout].rows; }

function getPhoto(id) {
    for (var i = 0; i < photos.length; i++) if (photos[i].id === id) return photos[i];
    return null;
}

function spares() {
    var used = {};
    slots.forEach(function (id) { if (id != null) used[id] = true; });
    return photos.filter(function (p) { return !used[p.id]; });
}

/* ---------- 圆角路径 ---------- */
function roundRectPath(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    if (r === 0) { ctx.rect(x, y, w, h); return; }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

/* ---------- 合成渲染 ---------- */
function renderCollage() {
    var canvas = $('pc-preview');
    if (!canvas) return;
    var size = collageCanvasSize(settings.layout, settings.gap);
    if (size.w > MAX_SIDE || size.h > MAX_SIDE) {
        toast('导出尺寸超出浏览器画布上限，已按上限等比压缩');
        var k = Math.min(MAX_SIDE / size.w, MAX_SIDE / size.h);
        size = { w: Math.floor(size.w * k), h: Math.floor(size.h * k) };
    }
    canvas.width = size.w;
    canvas.height = size.h;
    var ctx = canvas.getContext('2d');
    if (settings.bg === 'transparent') {
        ctx.clearRect(0, 0, size.w, size.h);
    } else {
        ctx.fillStyle = settings.bg;
        ctx.fillRect(0, 0, size.w, size.h);
    }
    var cells = computeCollageLayout({ width: size.w, height: size.h, layout: settings.layout, gap: settings.gap });
    cells.forEach(function (cell, idx) {
        var photo = getPhoto(slots[idx]);
        if (!photo) return; // 空槽位：保留背景色
        var cc = coverCrop(photo.w, photo.h, cell.w, cell.h);
        ctx.save();
        roundRectPath(ctx, cell.x, cell.y, cell.w, cell.h, settings.radius);
        ctx.clip();
        ctx.drawImage(photo.bmp, cell.x + cc.dx, cell.y + cc.dy, cc.dw, cc.dh);
        ctx.restore();
    });
    var info = $('pc-sizeinfo');
    if (info) info.textContent = '导出尺寸 ' + size.w + ' × ' + size.h + ' px · ' +
        photos.length + ' 张照片 · 已排入 ' + slots.filter(function (s) { return s != null; }).length + ' 格';
}

/* ---------- 槽位/备用区 UI ---------- */
function esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function renderSlots() {
    var wrap = $('pc-slots');
    if (!wrap) return;
    var def = LAYOUTS[settings.layout];
    wrap.style.gridTemplateColumns = 'repeat(' + def.cols + ', 1fr)';
    var html = '';
    slots.forEach(function (id, idx) {
        var p = getPhoto(id);
        var cls = 'pc-slot' + (selSlot === idx ? ' sel' : '');
        html += '<div class="' + cls + '" data-slot="' + idx + '" draggable="true" role="button" tabindex="0" ' +
            'aria-label="槽位 ' + (idx + 1) + (p ? '：' + esc(p.name) : '：空') + '">' +
            (p ? '<img src="' + p.thumbUrl + '" alt="' + esc(p.name) + '"><span class="pc-num">' + (idx + 1) + '</span>'
               : '<span class="pc-empty">＋</span><span class="pc-num">' + (idx + 1) + '</span>') +
            '</div>';
    });
    wrap.innerHTML = html;

    var list = spares();
    var spareWrap = $('pc-spares');
    var sh = '';
    list.forEach(function (p) {
        sh += '<div class="pc-spare' + (selSpare === p.id ? ' sel' : '') + '" data-spare="' + p.id + '" ' +
            'draggable="true" role="button" tabindex="0" aria-label="备用图：' + esc(p.name) + '">' +
            '<img src="' + p.thumbUrl + '" alt="' + esc(p.name) + '"></div>';
    });
    spareWrap.innerHTML = sh || '<span class="pc-spare-tip">暂无备用图：上传的图片超出当前布局格数时会放在这里</span>';

    bindSlotEvents();
}

function clearSel() { selSlot = -1; selSpare = null; }

function swapSlotsUI(a, b) {
    try {
        slots = swapCollageSlots(slots, a, b);
    } catch (e) { toast(e.message); return; }
    clearSel();
    renderSlots();
    renderCollage();
}

function assignSpareToSlot(spareId, slotIdx) {
    var prev = slots[slotIdx];
    slots[slotIdx] = spareId;
    clearSel();
    renderSlots();
    renderCollage();
    toast(prev == null ? '已放入槽位 ' + (slotIdx + 1) : '已替换槽位 ' + (slotIdx + 1) + '，原图回到备用区');
}

function onSlotClick(idx) {
    if (selSpare != null) { assignSpareToSlot(selSpare, idx); return; }
    if (selSlot === -1) { selSlot = idx; renderSlots(); return; }
    if (selSlot === idx) { clearSel(); renderSlots(); return; }
    swapSlotsUI(selSlot, idx);
}

function onSpareClick(id) {
    if (selSlot !== -1) { assignSpareToSlot(id, selSlot); return; }
    selSpare = (selSpare === id) ? null : id;
    renderSlots();
}

function bindSlotEvents() {
    var wrap = $('pc-slots');
    Array.prototype.forEach.call(wrap.querySelectorAll('[data-slot]'), function (el) {
        var idx = parseInt(el.getAttribute('data-slot'), 10);
        el.addEventListener('click', function () { onSlotClick(idx); });
        el.addEventListener('keydown', function (ev) {
            if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onSlotClick(idx); }
        });
        el.addEventListener('dragstart', function (ev) {
            dragFrom = { kind: 'slot', index: idx };
            ev.dataTransfer.effectAllowed = 'move';
            try { ev.dataTransfer.setData('text/plain', 'slot:' + idx); } catch (e) {}
        });
        el.addEventListener('dragover', function (ev) { ev.preventDefault(); ev.dataTransfer.dropEffect = 'move'; });
        el.addEventListener('drop', function (ev) {
            ev.preventDefault();
            var from = dragFrom;
            dragFrom = null;
            if (!from) return;
            if (from.kind === 'slot') { if (from.index !== idx) swapSlotsUI(from.index, idx); }
            else { assignSpareToSlot(from.id, idx); }
        });
    });
    var spareWrap = $('pc-spares');
    Array.prototype.forEach.call(spareWrap.querySelectorAll('[data-spare]'), function (el) {
        var id = parseInt(el.getAttribute('data-spare'), 10);
        el.addEventListener('click', function () { onSpareClick(id); });
        el.addEventListener('keydown', function (ev) {
            if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onSpareClick(id); }
        });
        el.addEventListener('dragstart', function (ev) {
            dragFrom = { kind: 'spare', id: id };
            ev.dataTransfer.effectAllowed = 'move';
            try { ev.dataTransfer.setData('text/plain', 'spare:' + id); } catch (e) {}
        });
    });
}

/* ---------- 上传 ---------- */
function acceptFile(file) {
    if (!file) return false;
    var okType = ACCEPT_TYPES.indexOf(file.type) >= 0 || ACCEPT_EXT.test(file.name || '');
    if (!okType) { toast('不支持的文件：' + (file.name || '') + '（仅 JPG/PNG/WebP）'); return false; }
    return true;
}

function addFiles(files) {
    var list = Array.prototype.filter.call(files, acceptFile);
    if (!list.length) return;
    var chain = Promise.resolve();
    list.forEach(function (file) {
        chain = chain.then(function () {
            return decodeImage(file).then(function (dec) {
                var id = ++seq;
                photos.push({
                    id: id, name: file.name || ('图片' + id),
                    bmp: dec.bmp, w: dec.w, h: dec.h,
                    thumbUrl: URL.createObjectURL(file)
                });
            }).catch(function (err) {
                toast('解码失败：' + (file.name || '') + '（' + err.message + '）');
            });
        });
    });
    chain.then(function () {
        autoFillSlots();
        refreshWorkspace();
        toast('已载入 ' + list.length + ' 张图片');
    });
}

/* 空槽位按上传顺序自动填入 */
function autoFillSlots() {
    var used = {};
    slots.forEach(function (id) { if (id != null) used[id] = true; });
    var qi = 0;
    var queue = photos.filter(function (p) { return !used[p.id]; });
    for (var i = 0; i < slots.length && qi < queue.length; i++) {
        if (slots[i] == null) slots[i] = queue[qi++].id;
    }
}

function resetLayoutSlots() {
    var n = cellCount();
    var old = slots.slice();
    slots = [];
    for (var i = 0; i < n; i++) slots.push(old[i] != null ? old[i] : null);
    clearSel();
}

/* ---------- 刷新 ---------- */
function refreshWorkspace() {
    var has = photos.length > 0;
    ['pc-layout-card', 'pc-slot-card', 'pc-setting-card', 'pc-preview-card', 'pc-action-card'].forEach(function (id) {
        var el = $(id);
        if (el) el.style.display = has ? '' : 'none';
    });
    if (!has) return;
    renderSlots();
    renderCollage();
}

/* ---------- 初始化 ---------- */
document.addEventListener('DOMContentLoaded', function () {
    resetLayoutSlots();

    // 布局模板按钮
    var layoutWrap = $('pc-layouts');
    var html = '';
    Object.keys(LAYOUTS).forEach(function (key) {
        var d = LAYOUTS[key];
        html += '<button type="button" class="pc-layout-btn' + (key === settings.layout ? ' active' : '') +
            '" data-layout="' + key + '"><b>' + d.label + '</b><small>' + d.sub + '</small></button>';
    });
    layoutWrap.innerHTML = html;
    Array.prototype.forEach.call(layoutWrap.querySelectorAll('[data-layout]'), function (btn) {
        btn.addEventListener('click', function () {
            var key = btn.getAttribute('data-layout');
            if (key === settings.layout) return;
            settings.layout = key;
            Array.prototype.forEach.call(layoutWrap.querySelectorAll('[data-layout]'), function (b) {
                b.classList.toggle('active', b.getAttribute('data-layout') === key);
            });
            resetLayoutSlots();
            autoFillSlots();
            renderSlots();
            renderCollage();
        });
    });

    // 上传
    var upload = $('pc-upload'), fileInput = $('pc-file');
    upload.addEventListener('click', function () { fileInput.click(); });
    upload.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); fileInput.click(); }
    });
    fileInput.addEventListener('change', function () {
        addFiles(fileInput.files);
        fileInput.value = '';
    });
    ['dragenter', 'dragover'].forEach(function (t) {
        upload.addEventListener(t, function (ev) { ev.preventDefault(); upload.classList.add('dragover'); });
    });
    ['dragleave', 'drop'].forEach(function (t) {
        upload.addEventListener(t, function (ev) { ev.preventDefault(); upload.classList.remove('dragover'); });
    });
    upload.addEventListener('drop', function (ev) {
        if (ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files.length) {
            addFiles(ev.dataTransfer.files);
        }
    });

    // 间距
    $('pc-gap').addEventListener('input', function () {
        settings.gap = Math.max(GAP_MIN, Math.min(GAP_MAX, parseInt(this.value, 10) || 0));
        $('pc-gap-val').textContent = settings.gap + ' px';
        renderCollage();
    });
    // 圆角
    $('pc-radius').addEventListener('input', function () {
        settings.radius = Math.max(RADIUS_MIN, Math.min(RADIUS_MAX, parseInt(this.value, 10) || 0));
        $('pc-radius-val').textContent = settings.radius + ' px';
        renderCollage();
    });
    // 背景色
    Array.prototype.forEach.call(document.querySelectorAll('[data-bg]'), function (btn) {
        btn.addEventListener('click', function () {
            Array.prototype.forEach.call(document.querySelectorAll('[data-bg]'), function (b) {
                b.classList.remove('active');
            });
            btn.classList.add('active');
            settings.bg = btn.getAttribute('data-bg');
            if (settings.bg !== 'transparent') $('pc-bg-color').value = settings.bg;
            renderCollage();
        });
    });
    $('pc-bg-color').addEventListener('input', function () {
        Array.prototype.forEach.call(document.querySelectorAll('[data-bg]'), function (b) {
            b.classList.remove('active');
        });
        settings.bg = this.value;
        renderCollage();
    });

    // 下载 PNG
    $('pc-download').addEventListener('click', function () {
        var canvas = $('pc-preview');
        renderCollage();
        canvasToBlob(canvas).then(function (blob) {
            var name = buildCollageFileName();
            downloadBlob(blob, name);
            toast('已导出 ' + name);
        }).catch(function (err) {
            toast('导出失败：' + err.message);
        });
    });

    // 清空重来
    $('pc-reset').addEventListener('click', function () {
        photos.forEach(function (p) { if (p.thumbUrl) URL.revokeObjectURL(p.thumbUrl); });
        photos = [];
        clearSel();
        resetLayoutSlots();
        refreshWorkspace();
        toast('已清空，可重新上传');
    });

    refreshWorkspace();
});
})();
