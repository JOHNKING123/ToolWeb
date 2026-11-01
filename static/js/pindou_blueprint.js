/* 图片转拼豆施工图生成器 - 纯前端像素化 + 内置拼豆色板量化 + 符号施工图引擎
 *
 * 流程：上传图片 → canvas 下采样到网格（格数可调，默认 29×29 贴合标准拼豆板）
 * → 内置拼豆色板最近邻量化（就近匹配，色号+中文名+符号）
 * → 取用最多的 paletteSize 色、尾部色彩合并到最近保留色 → 分配符号
 * → 带色号符号的网格施工图渲染 → 每色豆数统计 + 购买清单 → PNG 高清施工图导出 / 浏览器打印。
 *
 * 图片只在浏览器本地处理：无后端调用、无第三方依赖、无 CDN。
 * 纯函数（validatePindouConfig / hexToRgb / quantizeToPalette / countBeads /
 * buildPindouFileName）可在 node 下单元测试。
 *
 * 内置拼豆色板：自研常用色参考色卡（60 色，屏幕 hex 均为近似参考值，
 * 色号为本工具内部编号而非官方全库；屏幕色与实物豆存在色差，购买请以实物豆为准）。
 */
(function () {
'use strict';

/* ---------- 错误（家族惯例：非法参数抛 Error，err.field 给出字段名） ---------- */
function pindouError(message, field) {
    var e = new Error(message);
    e.field = field;
    return e;
}

/* ---------- 内置拼豆色板：[内部色号, 中文名, hex 近似参考值] ---------- */
var PINDOU_PALETTE = [
["PD-01","雪白","#FFFFFF"],["PD-02","米白","#F5F0E6"],["PD-03","奶油白","#FFF7E6"],
["PD-04","浅灰","#D9D9D9"],["PD-05","中灰","#9E9E9E"],["PD-06","深灰","#5A5A5A"],
["PD-07","纯黑","#1C1C1C"],
["PD-08","正红","#E60012"],["PD-09","深红","#A01225"],["PD-10","酒红","#7A1E2B"],
["PD-11","珊瑚红","#FF6F61"],["PD-12","樱桃粉","#F26D8D"],["PD-13","玫红","#D6336C"],
["PD-14","浅粉","#FDE2E9"],["PD-15","粉红","#FFB3C6"],
["PD-16","橙色","#FF8C00"],["PD-17","深橙","#D35400"],["PD-18","浅橙","#FFC37A"],
["PD-19","南瓜橙","#E67E22"],
["PD-20","柠檬黄","#FFF200"],["PD-21","金黄","#FFD400"],["PD-22","芥末黄","#C9A227"],
["PD-23","奶油黄","#FFF7CC"],["PD-24","鹅黄","#F7DC6F"],
["PD-25","草绿","#58B368"],["PD-26","深绿","#1E6B3A"],["PD-27","浅绿","#BDE3B5"],
["PD-28","黄绿","#A8C256"],["PD-29","军绿","#6B7F3E"],["PD-30","薄荷绿","#9BE3C0"],
["PD-31","墨绿","#0E4D2E"],
["PD-32","天蓝","#7CC4E8"],["PD-33","宝蓝","#2B6CB0"],["PD-34","深蓝","#1A3A6B"],
["PD-35","浅蓝","#D4ECF7"],["PD-36","湖蓝","#3AA7A3"],["PD-37","雾蓝","#A9CCE3"],
["PD-38","藏青","#2E4057"],
["PD-39","紫罗兰","#8E44AD"],["PD-40","浅紫","#D2B4DE"],["PD-41","深紫","#5B2C6F"],
["PD-42","粉紫","#C39BD3"],["PD-43","品红","#C2185B"],
["PD-44","咖啡棕","#6F4E37"],["PD-45","浅棕","#C19A6B"],["PD-46","深棕","#3E2723"],
["PD-47","驼色","#B08D57"],["PD-48","卡其","#D2B48C"],
["PD-49","肤色","#F1C27D"],["PD-50","浅肤","#FAD7A0"],["PD-51","小麦肤","#D9A066"],
["PD-52","豆沙","#C0836B"],
["PD-53","牛仔蓝","#5D6D7E"],["PD-54","橄榄绿","#808000"],["PD-55","孔雀绿","#008080"],
["PD-56","桃红","#FF9EBB"],["PD-57","电光蓝","#00BFFF"],["PD-58","荧光绿","#7FFF00"],
["PD-59","珍珠白","#F8F6F0"],["PD-60","象牙","#FFFFF0"]
];

/* ---------- 64 个施工图符号（拉丁字母+数字+几何形，canvas 渲染可靠） ---------- */
var PINDOU_SYMBOLS = ("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789").split("");
PINDOU_SYMBOLS.push("●", "○");

/* ---------- 纯函数：颜色 / 校验 / 量化 / 计数 / 文件名（node 可测） ---------- */

function hexToRgb(h) {
    if (typeof h !== "string") throw pindouError("hex 必须是字符串", "hex");
    var m = /^#?([0-9a-fA-F]{6})$/.exec(h.replace(/\s+/g, ""));
    if (!m) throw pindouError("hex 格式非法（期望 #RRGGBB）", "hex");
    return {
        r: parseInt(m[1].slice(0, 2), 16),
        g: parseInt(m[1].slice(2, 4), 16),
        b: parseInt(m[1].slice(4, 6), 16)
    };
}

/* palette 预解析缓存（按引用缓存，避免重复解析） */
var _palCache = { palette: null, rgb: null };
function paletteRgb(palette) {
    if (_palCache.palette === palette) return _palCache.rgb;
    var rgb = [];
    for (var i = 0; i < palette.length; i++) {
        var c = hexToRgb(palette[i][2]);
        rgb.push([c.r, c.g, c.b]);
    }
    _palCache = { palette: palette, rgb: rgb };
    return rgb;
}

function colorDist2(a, b) {
    var dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
    return dr * dr + dg * dg + db * db;
}

function nearestPaletteIndex(r, g, b, rgb) {
    var best = 0, bestD = Infinity, target = [r, g, b];
    for (var i = 0; i < rgb.length; i++) {
        var d = colorDist2(target, rgb[i]);
        if (d < bestD) { bestD = d; best = i; } /* 并列取序号更小者：确定性 */
    }
    return best;
}

/* 配置校验：gridSize∈[8,64]整数；paletteSize∈[2,64]整数；beadSizeMm∈{2.6,5} */
function validatePindouConfig(cfg) {
    if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) {
        throw pindouError("配置必须是对象", "config");
    }
    var gridSize = cfg.gridSize, paletteSize = cfg.paletteSize, beadSizeMm = cfg.beadSizeMm;
    if (typeof gridSize !== "number" || !isFinite(gridSize) || Math.floor(gridSize) !== gridSize ||
            gridSize < 8 || gridSize > 64) {
        throw pindouError("格数 gridSize 必须是 8~64 的整数", "gridSize");
    }
    if (typeof paletteSize !== "number" || !isFinite(paletteSize) || Math.floor(paletteSize) !== paletteSize ||
            paletteSize < 2 || paletteSize > 64) {
        throw pindouError("色数 paletteSize 必须是 2~64 的整数", "paletteSize");
    }
    if (beadSizeMm !== 2.6 && beadSizeMm !== 5) {
        throw pindouError("豆子规格 beadSizeMm 只能是 2.6 或 5（毫米）", "beadSizeMm");
    }
    return { gridSize: gridSize, paletteSize: paletteSize, beadSizeMm: beadSizeMm };
}

/* 最近邻量化：pixels 为 RGBA 数组（长度 w*h*4），palette 为 [code,name,hex] 数组。
 * 取用最多的 paletteSize 色，尾部合并到最近保留色；返回：
 * { indices:[颜色下标…], colors:[{code,name,hex,symbol}…] }（colors 按豆数降序，符号按序分配） */
function quantizeToPalette(pixels, width, height, palette, paletteSize) {
    if (!palette || !palette.length) throw pindouError("色板不能为空", "palette");
    if (typeof paletteSize !== "number" || Math.floor(paletteSize) !== paletteSize ||
            paletteSize < 1 || paletteSize > palette.length) {
        throw pindouError("paletteSize 非法", "paletteSize");
    }
    var n = width * height;
    if (!pixels || pixels.length < n * 4) throw pindouError("像素数据长度不足", "pixels");
    var rgb = paletteRgb(palette);

    /* 第一遍：最近邻 + 频次统计 */
    var raw = new Array(n), counts = new Array(palette.length);
    for (var i = 0; i < counts.length; i++) counts[i] = 0;
    for (var p = 0; p < n; p++) {
        var idx = nearestPaletteIndex(pixels[p * 4], pixels[p * 4 + 1], pixels[p * 4 + 2], rgb);
        raw[p] = idx; counts[idx]++;
    }

    /* 按（频次降序，序号升序）取保留色 */
    var order = [];
    for (var k = 0; k < palette.length; k++) if (counts[k] > 0) order.push(k);
    order.sort(function (a, b) { return (counts[b] - counts[a]) || (a - b); });
    var kept = order.slice(0, Math.min(paletteSize, order.length));

    /* 尾部合并：非保留色找保留色中最近者 */
    var keptRgb = [];
    for (var q = 0; q < kept.length; q++) keptRgb.push(rgb[kept[q]]);
    var remap = new Array(palette.length);
    for (var r2 = 0; r2 < palette.length; r2++) {
        var pos = kept.indexOf(r2);
        if (pos !== -1) { remap[r2] = pos; continue; }
        var c0 = rgb[r2];
        var best = 0, bestD = Infinity;
        for (var q2 = 0; q2 < keptRgb.length; q2++) {
            var d = colorDist2(c0, keptRgb[q2]);
            if (d < bestD) { bestD = d; best = q2; }
        }
        remap[r2] = best;
    }

    var colors = [];
    for (var t = 0; t < kept.length; t++) {
        colors.push({
            code: palette[kept[t]][0],
            name: palette[kept[t]][1],
            hex: palette[kept[t]][2],
            symbol: PINDOU_SYMBOLS[t] || ("#" + t)
        });
    }
    var indices = new Array(n);
    for (var p2 = 0; p2 < n; p2++) indices[p2] = remap[raw[p2]];
    return { indices: indices, colors: colors };
}

/* 豆数统计：indices 为颜色下标数组，colors 为 quantizeToPalette 的 colors 数组。
 * 返回 [{code,name,hex,symbol,count}…]，按 count 降序、符号序升序（确定性）。 */
function countBeads(indices, colors) {
    if (!indices || typeof indices.length !== "number") throw pindouError("indices 必须是数组", "indices");
    if (!colors || !colors.length) throw pindouError("colors 不能为空", "colors");
    var counts = new Array(colors.length);
    for (var i = 0; i < counts.length; i++) counts[i] = 0;
    for (var p = 0; p < indices.length; p++) {
        var idx = indices[p];
        if (typeof idx !== "number" || Math.floor(idx) !== idx || idx < 0 || idx >= colors.length) {
            throw pindouError("indices[" + p + "] 越界", "indices");
        }
        counts[idx]++;
    }
    var rows = [];
    for (var c = 0; c < colors.length; c++) {
        rows.push({
            code: colors[c].code, name: colors[c].name, hex: colors[c].hex,
            symbol: colors[c].symbol, count: counts[c]
        });
    }
    rows.sort(function (a, b) { return (b.count - a.count) || (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0); });
    return rows;
}

/* 导出文件名：pindou_blueprint_YYYYMMDD_HHmmss.png */
function buildPindouFileName(now) {
    var d = now == null ? new Date() : now;
    if (!(d instanceof Date) || isNaN(d.getTime())) throw pindouError("now 必须是合法 Date", "now");
    function pad(x) { return (x < 10 ? "0" : "") + x; }
    return "pindou_blueprint_" +
        d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + "_" +
        pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()) + ".png";
}

var api = {
    PINDOU_PALETTE: PINDOU_PALETTE,
    PINDOU_SYMBOLS: PINDOU_SYMBOLS,
    hexToRgb: hexToRgb,
    validatePindouConfig: validatePindouConfig,
    quantizeToPalette: quantizeToPalette,
    countBeads: countBeads,
    buildPindouFileName: buildPindouFileName
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
} else {

/* ================= 浏览器交互 ================= */
document.addEventListener('DOMContentLoaded', function () {
    var $ = function (id) { return document.getElementById(id); };
    var dropEl = $('pd-upload'), fileEl = $('pd-file'), srcInfoEl = $('pd-srcinfo'),
        statusEl = $('pd-status'), tipEl = $('pd-tip'),
        controlsEl = $('pd-controls'), resultEl = $('pd-result'),
        gridEl = $('pd-grid'), gridValEl = $('pd-grid-val'),
        palEl = $('pd-palette'), palValEl = $('pd-palette-val'),
        beadWrap = $('pd-beadsize'), viewWrap = $('pd-view'), gridlineEl = $('pd-gridline'),
        srcCanvas = $('pd-src-canvas'), bpCanvas = $('pd-bp-canvas'),
        metaEl = $('pd-meta'), listBody = $('pd-list-body'), totalEl = $('pd-total'),
        exportBtn = $('pd-export'), printBtn = $('pd-print'), reuploadBtn = $('pd-reupload');

    var imgObj = null, lastQuant = null, lastCfg = null, gridW = 0, gridH = 0;

    function toast(msg) { statusEl.textContent = msg; }
    function showTip(msg) { tipEl.textContent = msg; tipEl.style.display = 'block'; }
    function hideTip() { tipEl.style.display = 'none'; tipEl.textContent = ''; }

    gridEl.addEventListener('input', function () {
        gridValEl.textContent = gridEl.value + ' 格';
        scheduleRender();
    });
    palEl.addEventListener('input', function () {
        palValEl.textContent = palEl.value + ' 色';
        scheduleRender();
    });
    function radioGroup(wrap, name, cb) {
        wrap.addEventListener('click', function (ev) {
            var lab = ev.target.closest('label');
            if (!lab) return;
            var labels = wrap.querySelectorAll('label');
            for (var i = 0; i < labels.length; i++) labels[i].classList.remove('on');
            lab.classList.add('on');
            cb(lab.querySelector('input').value);
        });
    }
    var beadSizeMm = 5, viewMode = 'symbol';
    radioGroup(beadWrap, 'pdb', function (v) { beadSizeMm = parseFloat(v); renderMeta(); });
    radioGroup(viewWrap, 'pdv', function (v) { viewMode = v; renderBlueprint(); });
    gridlineEl.addEventListener('change', renderBlueprint);

    var renderTimer = null;
    function scheduleRender() {
        if (!imgObj) return;
        clearTimeout(renderTimer);
        renderTimer = setTimeout(renderAll, 120);
    }

    dropEl.addEventListener('click', function () { fileEl.click(); });
    dropEl.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') fileEl.click(); });
    ['dragover', 'dragenter'].forEach(function (ev) {
        dropEl.addEventListener(ev, function (e) { e.preventDefault(); dropEl.classList.add('dragover'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
        dropEl.addEventListener(ev, function (e) { e.preventDefault(); dropEl.classList.remove('dragover'); });
    });
    dropEl.addEventListener('drop', function (e) {
        var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) loadFile(f);
    });
    fileEl.addEventListener('change', function () { if (fileEl.files[0]) loadFile(fileEl.files[0]); });

    function loadFile(f) {
        hideTip();
        if (!/^image\//.test(f.type)) { showTip('请选择图片文件（PNG / JPG / WebP）。'); return; }
        var url = URL.createObjectURL(f);
        var img = new Image();
        img.onload = function () {
            URL.revokeObjectURL(url);
            imgObj = img;
            controlsEl.style.display = 'block';
            srcInfoEl.style.display = 'block';
            srcInfoEl.textContent = '已加载：' + f.name + '（' + img.naturalWidth + '×' + img.naturalHeight + '）';
            renderAll();
            toast('图片已载入，施工图已生成。');
        };
        img.onerror = function () { URL.revokeObjectURL(url); showTip('图片读取失败，请换一张图片重试。'); };
        img.src = url;
    }

    /* 下采样到网格：取区域平均，保留整体色调 */
    function downsample() {
        var cfg = validatePindouConfig({
            gridSize: parseInt(gridEl.value, 10),
            paletteSize: parseInt(palEl.value, 10),
            beadSizeMm: beadSizeMm
        });
        lastCfg = cfg;
        var srcW = imgObj.naturalWidth, srcH = imgObj.naturalHeight;
        gridW = cfg.gridSize;
        gridH = Math.max(1, Math.min(64, Math.round(cfg.gridSize * srcH / srcW)));
        var tmp = document.createElement('canvas');
        tmp.width = gridW; tmp.height = gridH;
        var tctx = tmp.getContext('2d', { willReadFrequently: true });
        /* 先分步缩小（大图直接一步缩到小网格会丢细节/走样） */
        var steps = [], w = srcW, h = srcH;
        while (w / 2 >= gridW * 2 && h / 2 >= gridH * 2) { w = Math.floor(w / 2); h = Math.floor(h / 2); steps.push([w, h]); }
        var cur = imgObj;
        for (var i = 0; i < steps.length; i++) {
            var c = document.createElement('canvas');
            c.width = steps[i][0]; c.height = steps[i][1];
            c.getContext('2d').drawImage(cur, 0, 0, c.width, c.height);
            cur = c;
        }
        tctx.imageSmoothingEnabled = true;
        tctx.imageSmoothingQuality = 'high';
        tctx.drawImage(cur, 0, 0, gridW, gridH);
        var data = tctx.getImageData(0, 0, gridW, gridH).data;
        /* 透明像素按白色处理（拼豆无透明概念） */
        var px = new Uint8ClampedArray(data.length);
        for (var p = 0; p < data.length; p += 4) {
            var a = data[p + 3] / 255;
            px[p] = Math.round(data[p] * a + 255 * (1 - a));
            px[p + 1] = Math.round(data[p + 1] * a + 255 * (1 - a));
            px[p + 2] = Math.round(data[p + 2] * a + 255 * (1 - a));
            px[p + 3] = 255;
        }
        return px;
    }

    function renderAll() {
        if (!imgObj) return;
        try {
            var px = downsample();
            lastQuant = quantizeToPalette(px, gridW, gridH, PINDOU_PALETTE, lastCfg.paletteSize);
        } catch (err) { showTip('生成失败：' + err.message); return; }
        renderSrcPreview();
        renderBlueprint();
        renderMeta();
        renderList();
        resultEl.style.display = 'block';
    }

    function renderSrcPreview() {
        srcCanvas.width = gridW; srcCanvas.height = gridH;
        var ctx = srcCanvas.getContext('2d');
        var im = ctx.createImageData(gridW, gridH);
        for (var p = 0; p < gridW * gridH; p++) {
            var c = lastQuant.colors[lastQuant.indices[p]];
            var rgb = hexToRgb(c.hex);
            im.data[p * 4] = rgb.r; im.data[p * 4 + 1] = rgb.g;
            im.data[p * 4 + 2] = rgb.b; im.data[p * 4 + 3] = 255;
        }
        ctx.putImageData(im, 0, 0);
    }

    function luminance(hex) {
        var c = hexToRgb(hex);
        return (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
    }

    function drawBlueprint(ctx, cell, withSymbols, showGrid) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, gridW * cell, gridH * cell);
        for (var y = 0; y < gridH; y++) {
            for (var x = 0; x < gridW; x++) {
                var c = lastQuant.colors[lastQuant.indices[y * gridW + x]];
                var bx = x * cell, by = y * cell;
                ctx.fillStyle = c.hex;
                if (ctx.roundRect) {
                    ctx.beginPath();
                    ctx.roundRect(bx + 1, by + 1, cell - 2, cell - 2, Math.max(2, cell * 0.18));
                    ctx.fill();
                } else {
                    ctx.fillRect(bx + 1, by + 1, cell - 2, cell - 2);
                }
                if (withSymbols) {
                    ctx.fillStyle = luminance(c.hex) > 0.55 ? '#1f2937' : '#ffffff';
                    ctx.font = 'bold ' + Math.floor(cell * 0.52) + 'px system-ui, sans-serif';
                    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillText(c.symbol, bx + cell / 2, by + cell / 2 + 1);
                }
            }
        }
        if (showGrid) {
            ctx.strokeStyle = 'rgba(17,24,39,.28)';
            ctx.lineWidth = 1;
            for (var gx = 0; gx <= gridW; gx++) {
                ctx.beginPath(); ctx.moveTo(gx * cell + .5, 0); ctx.lineTo(gx * cell + .5, gridH * cell); ctx.stroke();
            }
            for (var gy = 0; gy <= gridH; gy++) {
                ctx.beginPath(); ctx.moveTo(0, gy * cell + .5); ctx.lineTo(gridW * cell, gy * cell + .5); ctx.stroke();
            }
            /* 每 10 格加粗 */
            ctx.strokeStyle = 'rgba(17,24,39,.55)';
            ctx.lineWidth = 2;
            for (var gx2 = 0; gx2 <= gridW; gx2 += 10) {
                ctx.beginPath(); ctx.moveTo(gx2 * cell, 0); ctx.lineTo(gx2 * cell, gridH * cell); ctx.stroke();
            }
            for (var gy2 = 0; gy2 <= gridH; gy2 += 10) {
                ctx.beginPath(); ctx.moveTo(0, gy2 * cell); ctx.lineTo(gridW * cell, gy2 * cell); ctx.stroke();
            }
        }
    }

    function renderBlueprint() {
        if (!lastQuant) return;
        var cell = gridW > 40 ? 16 : 26;
        bpCanvas.width = gridW * cell; bpCanvas.height = gridH * cell;
        var ctx = bpCanvas.getContext('2d');
        drawBlueprint(ctx, cell, viewMode === 'symbol', gridlineEl.checked);
    }

    function renderMeta() {
        if (!lastQuant || !lastCfg) return;
        var wCm = (gridW * lastCfg.beadSizeMm / 10).toFixed(1);
        var hCm = (gridH * lastCfg.beadSizeMm / 10).toFixed(1);
        var boards = Math.ceil(gridW / 29) * Math.ceil(gridH / 29);
        var total = gridW * gridH;
        metaEl.innerHTML =
            '网格 <b>' + gridW + '×' + gridH + '</b>　实物尺寸约 <b>' + wCm + '×' + hCm + ' cm</b>' +
            '（' + (lastCfg.beadSizeMm === 5 ? '大豆 5mm' : '小豆 2.6mm') + '）' +
            '　用色 <b>' + lastQuant.colors.length + '</b>　总豆数 <b>' + total + '</b>' +
            '　约需标准板(29×29) <b>' + boards + '</b> 块';
    }

    function renderList() {
        if (!lastQuant) return;
        var rows = countBeads(lastQuant.indices, lastQuant.colors);
        var html = '';
        for (var i = 0; i < rows.length; i++) {
            var r = rows[i];
            var packs = Math.max(1, Math.ceil(r.count / 1000));
            html += '<tr><td>' + (i + 1) + '</td>' +
                '<td><span class="pd-sym" style="background:' + r.hex + ';color:' +
                (luminance(r.hex) > 0.55 ? '#1f2937' : '#fff') + '">' + r.symbol + '</span></td>' +
                '<td><code>' + r.code + '</code></td><td>' + r.name + '</td>' +
                '<td><b>' + r.count + '</b> 颗</td><td>约 ' + packs + ' 包</td></tr>';
        }
        listBody.innerHTML = html;
        var totalPacks = 0;
        for (var j = 0; j < rows.length; j++) totalPacks += Math.max(1, Math.ceil(rows[j].count / 1000));
        totalEl.innerHTML = '共 <b>' + rows.length + '</b> 色，<b>' + (gridW * gridH) + '</b> 颗豆子；' +
            '按常见 1000 颗/包估算约需 <b>' + totalPacks + '</b> 包（含每色至少 1 包的余量）。';
    }

    exportBtn.addEventListener('click', function () {
        if (!lastQuant) { toast('请先上传图片生成施工图。'); return; }
        var cell = 46;
        var headH = 120, footPerRow = 44;
        var footH = 60 + lastQuant.colors.length * footPerRow;
        var c = document.createElement('canvas');
        c.width = gridW * cell; c.height = headH + gridH * cell + footH;
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.fillStyle = '#111827'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.font = 'bold 34px system-ui, sans-serif';
        var wCm = (gridW * lastCfg.beadSizeMm / 10).toFixed(1);
        var hCm = (gridH * lastCfg.beadSizeMm / 10).toFixed(1);
        ctx.fillText('拼豆施工图（' + gridW + '×' + gridH + ' / 约 ' + wCm + '×' + hCm + 'cm）', 20, 48);
        ctx.font = '22px system-ui, sans-serif'; ctx.fillStyle = '#4b5563';
        ctx.fillText('用色 ' + lastQuant.colors.length + '　总豆数 ' + (gridW * gridH) +
            '　' + (lastCfg.beadSizeMm === 5 ? '大豆 5mm' : '小豆 2.6mm') +
            '　生成于 ' + new Date().toLocaleString('zh-CN'), 20, 88);
        ctx.save();
        ctx.translate(0, headH);
        drawBlueprint(ctx, cell, true, true);
        ctx.restore();
        var y0 = headH + gridH * cell + 30;
        ctx.fillStyle = '#111827'; ctx.font = 'bold 26px system-ui, sans-serif';
        ctx.fillText('购买清单（按豆数降序）', 20, y0);
        var rows = countBeads(lastQuant.indices, lastQuant.colors);
        ctx.font = '22px system-ui, sans-serif';
        for (var i = 0; i < rows.length; i++) {
            var r = rows[i], ry = y0 + 30 + i * footPerRow;
            ctx.fillStyle = r.hex;
            ctx.fillRect(20, ry - 20, 30, 30);
            ctx.strokeStyle = '#9ca3af'; ctx.strokeRect(20.5, ry - 19.5, 29, 29);
            ctx.fillStyle = '#111827';
            ctx.fillText((i + 1) + '. [' + r.symbol + '] ' + r.code + ' ' + r.name +
                ' — ' + r.count + ' 颗（约 ' + Math.max(1, Math.ceil(r.count / 1000)) + ' 包）', 62, ry + 4);
        }
        var url = c.toDataURL('image/png');
        var a = document.createElement('a');
        try { a.download = buildPindouFileName(); } catch (e) { a.download = 'pindou_blueprint.png'; }
        a.href = url;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        toast('已导出 ' + a.download + '。');
    });

    printBtn.addEventListener('click', function () {
        if (!lastQuant) { toast('请先上传图片生成施工图。'); return; }
        window.print();
    });

    reuploadBtn.addEventListener('click', function () { fileEl.click(); });
});
}

})(); /* IIFE 结束 */
