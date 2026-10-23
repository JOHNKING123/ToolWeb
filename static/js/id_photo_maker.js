/* 证件照裁剪排版 - 纯前端：上传→固定比例裁剪→点取背景换底→相纸排版→导出JPG
 * 零 fetch/XHR、零上传：所有处理在浏览器 canvas 本地完成。
 * 纯逻辑函数通过 module.exports 导出，供 node 单元测试；浏览器端走 DOM 绑定。
 */
(function () {
"use strict";

/* ================= 纯逻辑（浏览器/DOM 无关，可 node 测试） ================= */

/* 300dpi 口径：毫米 → 像素（美签按冲印惯用口径硬编码 600，见预设表） */
function ipmMmToPx(mm) {
    if (typeof mm !== "number" || !isFinite(mm) || mm <= 0) return null;
    return Math.round(mm / 25.4 * 300);
}

/* 尺寸预设：像素值按 300dpi 固定口径
 * 1寸 25x35mm=295x413 · 2寸 35x49mm=413x579 · 小2寸 33x48mm=390x567
 * 美签 51x51mm=600x600 · 护照 33x48mm=390x567 */
var IPM_PRESETS = {
    "1inch":    { label: "1寸",     mmW: 25, mmH: 35, pxW: 295, pxH: 413 },
    "2inch":    { label: "2寸",     mmW: 35, mmH: 49, pxW: 413, pxH: 579 },
    "small2":   { label: "小2寸",   mmW: 33, mmH: 48, pxW: 390, pxH: 567 },
    "usvisa":   { label: "美国签证", mmW: 51, mmH: 51, pxW: 600, pxH: 600 },
    "passport": { label: "护照",     mmW: 33, mmH: 48, pxW: 390, pxH: 567 }
};

/* 相纸预设：5寸 127x89mm=1500x1050 · 6寸 152x102mm=1800x1200（@300dpi） */
var IPM_PAPERS = {
    "5inch": { label: "5寸", pxW: 1500, pxH: 1050 },
    "6inch": { label: "6寸", pxW: 1800, pxH: 1200 }
};

function ipmPreset(key) { return IPM_PRESETS[key] || null; }
function ipmPaper(key) { return IPM_PAPERS[key] || null; }

/* 宽高比（宽/高），裁剪框锁定用 */
function ipmAspect(key) {
    var p = ipmPreset(key);
    if (!p) return null;
    return p.pxW / p.pxH;
}

/* RGB 欧氏距离（0 ~ 441.67） */
function ipmColorDist(r1, g1, b1, r2, g2, b2) {
    var dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
    return Math.sqrt(dr * dr + dg * dg + db * db);
}

var IPM_MAX_DIST = Math.sqrt(3 * 255 * 255); /* ≈441.67 */

/* 容差滑块 0~100 → 距离阈值 */
function ipmTolToDist(tol) {
    if (typeof tol !== "number" || !isFinite(tol)) return null;
    if (tol < 0) tol = 0;
    if (tol > 100) tol = 100;
    return tol / 100 * IPM_MAX_DIST;
}

/* 背景替换纯函数：src 为 Uint8ClampedArray/普通数组（RGBA 交错），
 * sample {r,g,b} 取样色，tol 容差 0~100，target {r,g,b} 目标底色。
 * 距离 ≤ 阈值的像素替换为目标色（保留 alpha），返回新 Uint8ClampedArray。 */
function ipmReplaceBg(src, w, h, sample, tol, target) {
    if (!src || typeof w !== "number" || typeof h !== "number" || w <= 0 || h <= 0) return null;
    if (!sample || !target) return null;
    var thr = ipmTolToDist(tol);
    if (thr === null) return null;
    var need = w * h * 4;
    if (src.length < need) return null;
    var out = new Uint8ClampedArray(need);
    for (var i = 0; i < need; i += 4) {
        var d = ipmColorDist(src[i], src[i + 1], src[i + 2], sample.r, sample.g, sample.b);
        if (d <= thr) {
            out[i] = target.r; out[i + 1] = target.g; out[i + 2] = target.b; out[i + 3] = src[i + 3];
        } else {
            out[i] = src[i]; out[i + 1] = src[i + 1]; out[i + 2] = src[i + 2]; out[i + 3] = src[i + 3];
        }
    }
    return out;
}

/* 相纸排版：横/竖两个方向都算，取张数最多的方案。
 * 返回 {cols, rows, count, portrait, cells:[{x,y,w,h}], paperW, paperH}
 * portrait=true 表示相纸竖放（paperW/paperH 已交换为实际排版尺寸）。 */
function ipmLayout(paperW, paperH, photoW, photoH, margin, gap) {
    margin = (typeof margin === "number" && margin >= 0) ? margin : 30;
    gap = (typeof gap === "number" && gap >= 0) ? gap : 20;
    if (!(paperW > 0 && paperH > 0 && photoW > 0 && photoH > 0)) return null;

    function tryOrient(pw, ph, portrait) {
        if (photoW > pw - 2 * margin || photoH > ph - 2 * margin) return null;
        var cols = Math.floor((pw - 2 * margin + gap) / (photoW + gap));
        var rows = Math.floor((ph - 2 * margin + gap) / (photoH + gap));
        if (cols < 1 || rows < 1) return null;
        var usedW = cols * photoW + (cols - 1) * gap;
        var usedH = rows * photoH + (rows - 1) * gap;
        var ox = (pw - usedW) / 2, oy = (ph - usedH) / 2;
        var cells = [];
        for (var r = 0; r < rows; r++) {
            for (var c = 0; c < cols; c++) {
                cells.push({
                    x: Math.round(ox + c * (photoW + gap)),
                    y: Math.round(oy + r * (photoH + gap)),
                    w: photoW, h: photoH
                });
            }
        }
        return { cols: cols, rows: rows, count: cols * rows, portrait: portrait, cells: cells, paperW: pw, paperH: ph };
    }

    var land = tryOrient(paperW, paperH, false);
    var port = tryOrient(paperH, paperW, true);
    if (!land && !port) return { cols: 0, rows: 0, count: 0, portrait: false, cells: [], paperW: paperW, paperH: paperH };
    if (land && port) return land.count >= port.count ? land : port; /* 张数相同默认横版 */
    return land || port;
}

/* 导出文件名 */
function ipmSingleName(presetKey) {
    var p = ipmPreset(presetKey);
    if (!p) return null;
    return "证件照_" + p.label + "_" + p.pxW + "x" + p.pxH + ".jpg";
}
function ipmSheetName(paperKey) {
    var p = ipmPaper(paperKey);
    if (!p) return null;
    return "证件照_排版_" + p.label + "_" + p.pxW + "x" + p.pxH + ".jpg";
}

/* ================= 浏览器 DOM 部分 ================= */
if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        ipmMmToPx: ipmMmToPx,
        IPM_PRESETS: IPM_PRESETS,
        IPM_PAPERS: IPM_PAPERS,
        ipmPreset: ipmPreset,
        ipmPaper: ipmPaper,
        ipmAspect: ipmAspect,
        ipmColorDist: ipmColorDist,
        IPM_MAX_DIST: IPM_MAX_DIST,
        ipmTolToDist: ipmTolToDist,
        ipmReplaceBg: ipmReplaceBg,
        ipmLayout: ipmLayout,
        ipmSingleName: ipmSingleName,
        ipmSheetName: ipmSheetName
    };
    return;
}

/* ---------- 以下仅浏览器执行 ---------- */
var BG_COLORS = {
    white: { label: "白色", r: 255, g: 255, b: 255, css: "#ffffff" },
    red:   { label: "红色", r: 255, g: 0,   b: 0,   css: "#ff0000" },
    blue:  { label: "蓝色", r: 67,  g: 142, b: 219, css: "#438edb" }
};

var state = {
    img: null,          /* HTMLImageElement（原图） */
    imgCanvas: null,    /* 原图离屏 canvas（取色用） */
    presetKey: "1inch",
    paperKey: "5inch",
    /* 裁剪框（canvas 显示坐标，宽高比锁定） */
    box: { x: 0, y: 0, w: 0, h: 0 },
    /* 图片变换：显示宽高 = 自然尺寸 * scale，偏移 ox/oy */
    scale: 1, ox: 0, oy: 0,
    /* 背景换色 */
    sample: null,       /* {r,g,b} 取样色 */
    tol: 30,
    targetKey: "white",
    picking: false,
    /* 交互 */
    drag: null,         /* {mode:'pan'|'move'|'resize', ...} */
    resultCanvas: null, /* 导出级单张成品 canvas（pxW x pxH） */
    sheetCanvas: null,  /* 导出级相纸 canvas */
    layout: null
};

function $(id) { return document.getElementById(id); }

function toast(msg) {
    var t = $("ipm-toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._tm);
    t._tm = setTimeout(function () { t.classList.remove("show"); }, 2200);
}

function cropCanvas() { return $("ipm-crop"); }

/* canvas 显示尺寸：随容器自适应（移动端不错位） */
function fitCanvasSize() {
    var c = cropCanvas();
    var wrap = $("ipm-crop-wrap");
    var maxW = wrap ? Math.min(wrap.clientWidth, 720) : 640;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var cssH = Math.round(maxW * 0.72);
    c.style.width = maxW + "px";
    c.style.height = cssH + "px";
    c.width = Math.round(maxW * dpr);
    c.height = Math.round(cssH * dpr);
    return { w: c.width, h: c.height, dpr: dpr };
}

/* 当前 canvas 逻辑尺寸（设备像素） */
function canvasSize() {
    var c = cropCanvas();
    return { w: c.width, h: c.height };
}

/* 把图片初始适配进画布并居中，裁剪框按预设宽高比居中放置 */
function resetView() {
    var cs = canvasSize();
    var p = ipmPreset(state.presetKey);
    if (!state.img || !p) return;
    var iw = state.img.naturalWidth, ih = state.img.naturalHeight;
    state.scale = Math.min(cs.w / iw, cs.h / ih) * 0.92;
    if (state.scale <= 0) state.scale = 1;
    state.ox = (cs.w - iw * state.scale) / 2;
    state.oy = (cs.h - ih * state.scale) / 2;
    resetBox();
}

function resetBox() {
    var cs = canvasSize();
    var p = ipmPreset(state.presetKey);
    if (!p) return;
    var ar = p.pxW / p.pxH;
    var bw, bh;
    if (cs.w / cs.h > ar) { bh = cs.h * 0.86; bw = bh * ar; }
    else { bw = cs.w * 0.86; bh = bw / ar; }
    state.box = { x: (cs.w - bw) / 2, y: (cs.h - bh) / 2, w: bw, h: bh };
}

/* 裁剪框 → 原图像素矩形（钳制在图片内） */
function boxToImageRect() {
    var b = state.box;
    var ix = (b.x - state.ox) / state.scale;
    var iy = (b.y - state.oy) / state.scale;
    var iw = b.w / state.scale, ih = b.h / state.scale;
    var nw = state.img.naturalWidth, nh = state.img.naturalHeight;
    var x = Math.max(0, Math.min(nw, ix));
    var y = Math.max(0, Math.min(nh, iy));
    var w = Math.max(1, Math.min(nw - x, iw));
    var h = Math.max(1, Math.min(nh - y, ih));
    return { x: x, y: y, w: w, h: h };
}

/* 渲染成品单张（导出级分辨率）→ state.resultCanvas */
function renderResult() {
    var p = ipmPreset(state.presetKey);
    if (!state.img || !p) return;
    var rc = document.createElement("canvas");
    rc.width = p.pxW; rc.height = p.pxH;
    var ctx = rc.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, p.pxW, p.pxH);
    var r = boxToImageRect();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(state.img, r.x, r.y, r.w, r.h, 0, 0, p.pxW, p.pxH);
    if (state.sample) {
        var tgt = BG_COLORS[state.targetKey];
        var id = ctx.getImageData(0, 0, p.pxW, p.pxH);
        var out = ipmReplaceBg(id.data, p.pxW, p.pxH, state.sample, state.tol, tgt);
        if (out) { id.data.set(out); ctx.putImageData(id, 0, 0); }
    }
    state.resultCanvas = rc;
}

/* 渲染相纸（导出级分辨率） */
function renderSheet() {
    var paper = ipmPaper(state.paperKey);
    var p = ipmPreset(state.presetKey);
    if (!state.resultCanvas || !paper || !p) return;
    state.layout = ipmLayout(paper.pxW, paper.pxH, p.pxW, p.pxH, 60, 30);
    var L = state.layout;
    var sc = document.createElement("canvas");
    sc.width = L.paperW; sc.height = L.paperH;
    var ctx = sc.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, sc.width, sc.height);
    for (var i = 0; i < L.cells.length; i++) {
        var cell = L.cells[i];
        ctx.drawImage(state.resultCanvas, cell.x, cell.y, cell.w, cell.h);
        ctx.strokeStyle = "#d1d5db";
        ctx.lineWidth = 2;
        ctx.strokeRect(cell.x + 1, cell.y + 1, cell.w - 2, cell.h - 2);
    }
    state.sheetCanvas = sc;
    var info = $("ipm-sheet-info");
    if (info) {
        var orient = L.portrait ? "竖版" : "横版";
        info.textContent = "相纸 " + paper.label + "（" + sc.width + "×" + sc.height + "px，" + orient + "）· " +
            p.label + "排 " + L.count + " 张（" + L.cols + "列×" + L.rows + "行）";
    }
}

/* 主画布绘制：图片 + 遮罩 + 裁剪框 + 头部参考线 */
function drawCrop() {
    var c = cropCanvas();
    var ctx = c.getContext("2d");
    var cs = canvasSize();
    ctx.clearRect(0, 0, cs.w, cs.h);
    ctx.fillStyle = "#1f2937";
    ctx.fillRect(0, 0, cs.w, cs.h);
    if (!state.img) {
        ctx.fillStyle = "#9ca3af";
        ctx.font = Math.round(cs.w * 0.035) + "px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("请先上传照片", cs.w / 2, cs.h / 2);
        return;
    }
    var iw = state.img.naturalWidth * state.scale;
    var ih = state.img.naturalHeight * state.scale;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(state.img, state.ox, state.oy, iw, ih);

    var b = state.box;
    /* 框外遮罩 */
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, cs.w, b.y);
    ctx.fillRect(0, b.y + b.h, cs.w, cs.h - b.y - b.h);
    ctx.fillRect(0, b.y, b.x, b.h);
    ctx.fillRect(b.x + b.w, b.y, cs.w - b.x - b.w, b.h);
    /* 裁剪成品实时预览（叠在框内） */
    if (state.resultCanvas) {
        ctx.drawImage(state.resultCanvas, b.x, b.y, b.w, b.h);
    }
    /* 框线 */
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = Math.max(2, cs.w * 0.004);
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    /* 三等分参考线 */
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = 1;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(b.x + b.w / 3, b.y); ctx.lineTo(b.x + b.w / 3, b.y + b.h);
    ctx.moveTo(b.x + 2 * b.w / 3, b.y); ctx.lineTo(b.x + 2 * b.w / 3, b.y + b.h);
    ctx.moveTo(b.x, b.y + b.h / 3); ctx.lineTo(b.x + b.w, b.y + b.h / 3);
    ctx.moveTo(b.x, b.y + 2 * b.h / 3); ctx.lineTo(b.x + b.w, b.y + 2 * b.h / 3);
    ctx.stroke();
    /* 头部参考椭圆（虚线）：头顶约在框上沿 1/8、下巴约在框下沿 1/8 */
    ctx.beginPath();
    ctx.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w * 0.30, b.h * 0.375, 0, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(52,211,153,0.9)";
    ctx.lineWidth = Math.max(2, cs.w * 0.003);
    ctx.stroke();
    ctx.setLineDash([]);
    /* 四角缩放手柄 */
    var hs = Math.max(14, cs.w * 0.028);
    ctx.fillStyle = "#2563eb";
    var corners = [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]];
    for (var i = 0; i < corners.length; i++) {
        ctx.beginPath();
        ctx.arc(corners[i][0], corners[i][1], hs / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}

function renderAll() {
    renderResult();
    renderSheet();
    drawCrop();
    drawSheetPreview();
    updateSummary();
}

/* 排版缩略图 */
function drawSheetPreview() {
    var pc = $("ipm-sheet");
    if (!pc || !state.sheetCanvas) return;
    var maxW = Math.min(($("ipm-step4") ? $("ipm-step4").clientWidth : 640), 560);
    var sc = state.sheetCanvas;
    var k = maxW / sc.width;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    pc.style.width = Math.round(sc.width * k) + "px";
    pc.style.height = Math.round(sc.height * k) + "px";
    pc.width = Math.round(sc.width * k * dpr);
    pc.height = Math.round(sc.height * k * dpr);
    var ctx = pc.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#f3f4f6";
    ctx.fillRect(0, 0, sc.width * k, sc.height * k);
    ctx.drawImage(sc, 0, 0, sc.width * k, sc.height * k);
}

/* 单张预览 + 导出尺寸确认 */
function updateSummary() {
    var p = ipmPreset(state.presetKey);
    var pv = $("ipm-single-preview");
    if (pv && state.resultCanvas) {
        pv.src = state.resultCanvas.toDataURL("image/jpeg", 0.85);
    }
    var s = $("ipm-summary");
    if (s && p) {
        s.textContent = "当前预设：" + p.label + "（" + p.mmW + "×" + p.mmH + "mm）· 导出 " +
            p.pxW + "×" + p.pxH + "px @300dpi JPG";
    }
}

/* ---------- 交互：拖拽/缩放/平移 ---------- */
function canvasPos(ev) {
    var c = cropCanvas();
    var r = c.getBoundingClientRect();
    var kx = c.width / r.width, ky = c.height / r.height;
    return { x: (ev.clientX - r.left) * kx, y: (ev.clientY - r.top) * ky };
}

function hitHandle(pos) {
    var b = state.box;
    var cs = canvasSize();
    var hs = Math.max(14, cs.w * 0.028) * 1.6;
    var corners = [
        { x: b.x, y: b.y, cx: -1, cy: -1 },
        { x: b.x + b.w, y: b.y, cx: 1, cy: -1 },
        { x: b.x, y: b.y + b.h, cx: -1, cy: 1 },
        { x: b.x + b.w, y: b.y + b.h, cx: 1, cy: 1 }
    ];
    for (var i = 0; i < corners.length; i++) {
        var dx = pos.x - corners[i].x, dy = pos.y - corners[i].y;
        if (dx * dx + dy * dy <= hs * hs) return corners[i];
    }
    return null;
}

function inBox(pos) {
    var b = state.box;
    return pos.x >= b.x && pos.x <= b.x + b.w && pos.y >= b.y && pos.y <= b.y + b.h;
}

function bindCropEvents() {
    var c = cropCanvas();
    c.style.touchAction = "none";

    c.addEventListener("pointerdown", function (ev) {
        if (!state.img) return;
        c.setPointerCapture(ev.pointerId);
        var pos = canvasPos(ev);
        /* 取色模式：点取原图像素 */
        if (state.picking) {
            pickColor(pos);
            return;
        }
        var h = hitHandle(pos);
        if (h) {
            state.drag = { mode: "resize", cx: h.cx, cy: h.cy, startBox: Object.assign({}, state.box), start: pos };
        } else if (inBox(pos)) {
            state.drag = { mode: "move", startBox: Object.assign({}, state.box), start: pos };
        } else {
            state.drag = { mode: "pan", startOx: state.ox, startOy: state.oy, start: pos };
        }
        ev.preventDefault();
    });

    c.addEventListener("pointermove", function (ev) {
        if (!state.drag || !state.img) return;
        var pos = canvasPos(ev);
        var dx = pos.x - state.drag.start.x, dy = pos.y - state.drag.start.y;
        var p = ipmPreset(state.presetKey);
        var ar = p.pxW / p.pxH;
        if (state.drag.mode === "pan") {
            state.ox = state.drag.startOx + dx;
            state.oy = state.drag.startOy + dy;
        } else if (state.drag.mode === "move") {
            var sb = state.drag.startBox;
            var cs = canvasSize();
            var nx = Math.min(Math.max(sb.x + dx, 0), cs.w - sb.w);
            var ny = Math.min(Math.max(sb.y + dy, 0), cs.h - sb.h);
            state.box.x = nx; state.box.y = ny;
        } else if (state.drag.mode === "resize") {
            var sb2 = state.drag.startBox;
            /* 以对角为锚点，按宽高比锁定缩放 */
            var anchorX = state.drag.cx > 0 ? sb2.x : sb2.x + sb2.w;
            var anchorY = state.drag.cy > 0 ? sb2.y : sb2.y + sb2.h;
            var dw = state.drag.cx * (pos.x - (state.drag.cx > 0 ? sb2.x + sb2.w : sb2.x));
            var newW = Math.max(40, sb2.w + dw);
            var newH = newW / ar;
            var cs2 = canvasSize();
            if (newH > cs2.h) { newH = cs2.h; newW = newH * ar; }
            if (newW > cs2.w) { newW = cs2.w; newH = newW / ar; }
            var nx2 = state.drag.cx > 0 ? anchorX : anchorX - newW;
            var ny2 = state.drag.cy > 0 ? anchorY : anchorY - newH;
            nx2 = Math.min(Math.max(nx2, 0), cs2.w - newW);
            ny2 = Math.min(Math.max(ny2, 0), cs2.h - newH);
            state.box = { x: nx2, y: ny2, w: newW, h: newH };
        }
        renderAll();
    });

    function endDrag() { state.drag = null; }
    c.addEventListener("pointerup", endDrag);
    c.addEventListener("pointercancel", endDrag);

    /* 滚轮缩放图片（以光标为中心） */
    c.addEventListener("wheel", function (ev) {
        if (!state.img) return;
        ev.preventDefault();
        var pos = canvasPos(ev);
        var factor = ev.deltaY < 0 ? 1.12 : 1 / 1.12;
        zoomAt(pos, factor);
    }, { passive: false });
}

function zoomAt(pos, factor) {
    var ns = state.scale * factor;
    ns = Math.min(Math.max(ns, 0.05), 20);
    var k = ns / state.scale;
    state.ox = pos.x - (pos.x - state.ox) * k;
    state.oy = pos.y - (pos.y - state.oy) * k;
    state.scale = ns;
    renderAll();
}

function zoomStep(factor) {
    var cs = canvasSize();
    zoomAt({ x: cs.w / 2, y: cs.h / 2 }, factor);
}

/* ---------- 取色 ---------- */
function imagePixelAt(pos) {
    if (!state.imgCanvas) return null;
    var k = state.imgScaleK || 1;
    var ix = Math.round((pos.x - state.ox) / state.scale * k);
    var iy = Math.round((pos.y - state.oy) / state.scale * k);
    var w = state.imgCanvas.width, h = state.imgCanvas.height;
    if (ix < 0 || iy < 0 || ix >= w || iy >= h) return null;
    var ctx = state.imgCanvas.getContext("2d");
    var d = ctx.getImageData(ix, iy, 1, 1).data;
    return { r: d[0], g: d[1], b: d[2] };
}

function pickColor(pos) {
    var px = imagePixelAt(pos);
    if (!px) { toast("这一点不在照片上，换个位置点"); return; }
    state.sample = px;
    state.picking = false;
    syncPickBtn();
    paintSampleChip();
    renderAll();
    toast("已取样背景色，拖动容差滑块预览换底效果");
}

function paintSampleChip() {
    var chip = $("ipm-sample-chip");
    if (!chip) return;
    if (state.sample) {
        var s = state.sample;
        chip.style.background = "rgb(" + s.r + "," + s.g + "," + s.b + ")";
        chip.title = "取样色 rgb(" + s.r + "," + s.g + "," + s.b + ")";
    } else {
        chip.style.background = "transparent";
        chip.title = "尚未取样";
    }
}

function syncPickBtn() {
    var b = $("ipm-pick-btn");
    if (!b) return;
    b.classList.toggle("ipm-active", state.picking);
    b.querySelector("span").textContent = state.picking ? "取色中：点击照片取样" : "点取背景色";
}

/* ---------- 上传 ---------- */
function loadFile(file) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
        toast("仅支持 PNG / JPG / WebP 图片");
        return;
    }
    var rd = new FileReader();
    rd.onload = function () {
        var img = new Image();
        img.onload = function () {
            state.img = img;
            /* 取色用离屏 canvas（限制 2000px 以内，取色够用） */
            var k = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
            var oc = document.createElement("canvas");
            oc.width = Math.max(1, Math.round(img.naturalWidth * k));
            oc.height = Math.max(1, Math.round(img.naturalHeight * k));
            oc.getContext("2d").drawImage(img, 0, 0, oc.width, oc.height);
            state.imgCanvas = oc;
            state.imgScaleK = k;
            state.sample = null;
            paintSampleChip();
            resetView();
            renderAll();
            setStepEnabled(true);
            toast("照片已载入，拖拽/滚轮调整后导出");
        };
        img.onerror = function () { toast("图片解码失败，请换一张试试"); };
        img.src = rd.result;
    };
    rd.readAsDataURL(file);
}

function setStepEnabled(on) {
    var ids = ["ipm-preset-row", "ipm-crop-tools", "ipm-bg-panel", "ipm-export-row"];
    for (var i = 0; i < ids.length; i++) {
        var el = $(ids[i]);
        if (el) el.classList.toggle("ipm-disabled", !on);
    }
    var btns = document.querySelectorAll("#ipm-export-row button");
    for (var j = 0; j < btns.length; j++) btns[j].disabled = !on;
}

/* ---------- 导出 ---------- */
function downloadCanvas(canvas, name) {
    var a = document.createElement("a");
    a.href = canvas.toDataURL("image/jpeg", 0.92);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { document.body.removeChild(a); }, 100);
}

function exportSingle() {
    if (!state.resultCanvas) return;
    renderResult();
    downloadCanvas(state.resultCanvas, ipmSingleName(state.presetKey));
    toast("单张证件照已导出");
}

function exportSheet() {
    if (!state.sheetCanvas) return;
    renderSheet();
    downloadCanvas(state.sheetCanvas, ipmSheetName(state.paperKey));
    toast("相纸排版图已导出");
}

/* ---------- 事件绑定 ---------- */
function bindEvents() {
    var dz = $("ipm-dropzone"), fi = $("ipm-file-input");
    if (dz && fi) {
        dz.addEventListener("click", function (e) {
            if (e.target.closest("button")) return;
            fi.click();
        });
        $("ipm-choose-btn").addEventListener("click", function (e) { e.stopPropagation(); fi.click(); });
        fi.addEventListener("change", function () {
            if (fi.files && fi.files[0]) loadFile(fi.files[0]);
            fi.value = "";
        });
        ["dragenter", "dragover"].forEach(function (t) {
            dz.addEventListener(t, function (e) { e.preventDefault(); dz.classList.add("ipm-drag"); });
        });
        ["dragleave", "drop"].forEach(function (t) {
            dz.addEventListener(t, function (e) { e.preventDefault(); dz.classList.remove("ipm-drag"); });
        });
        dz.addEventListener("drop", function (e) {
            var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
            if (f) loadFile(f);
        });
    }

    /* 预设切换 */
    var pradios = document.getElementsByName("ipm-preset");
    for (var i = 0; i < pradios.length; i++) {
        pradios[i].addEventListener("change", function () {
            state.presetKey = this.value;
            resetBox();
            renderAll();
        });
    }

    /* 相纸切换 */
    var paperRadios = document.getElementsByName("ipm-paper");
    for (var j = 0; j < paperRadios.length; j++) {
        paperRadios[j].addEventListener("change", function () {
            state.paperKey = this.value;
            renderAll();
        });
    }

    bindCropEvents();

    $("ipm-zoom-in").addEventListener("click", function () { if (state.img) zoomStep(1.2); });
    $("ipm-zoom-out").addEventListener("click", function () { if (state.img) zoomStep(1 / 1.2); });
    $("ipm-reset-view").addEventListener("click", function () { if (state.img) { resetView(); renderAll(); } });

    /* 取色 */
    $("ipm-pick-btn").addEventListener("click", function () {
        if (!state.img) { toast("请先上传照片"); return; }
        state.picking = !state.picking;
        syncPickBtn();
        if (state.picking) toast("点击照片上的背景区域取样");
    });
    $("ipm-clear-sample").addEventListener("click", function () {
        state.sample = null;
        paintSampleChip();
        renderAll();
        toast("已恢复原背景");
    });

    /* 容差滑块 */
    var tol = $("ipm-tol"), tolv = $("ipm-tol-val");
    if (tol) {
        tol.addEventListener("input", function () {
            state.tol = parseInt(tol.value, 10) || 0;
            tolv.textContent = state.tol;
            if (state.img && state.sample) renderAll();
        });
        tolv.textContent = tol.value;
    }

    /* 目标底色 */
    var tradios = document.getElementsByName("ipm-target");
    for (var k = 0; k < tradios.length; k++) {
        tradios[k].addEventListener("change", function () {
            state.targetKey = this.value;
            if (state.img && state.sample) renderAll();
        });
    }

    /* 导出 */
    $("ipm-export-single").addEventListener("click", exportSingle);
    $("ipm-export-sheet").addEventListener("click", exportSheet);

    window.addEventListener("resize", function () {
        if (!state.img) return;
        var keep = { scale: state.scale, ox: state.ox, oy: state.oy, box: Object.assign({}, state.box) };
        fitCanvasSize();
        /* 尺寸变化后按比例重映射，避免错位 */
        state.scale = keep.scale; state.ox = keep.ox; state.oy = keep.oy; state.box = keep.box;
        drawCrop(); drawSheetPreview();
    });
}

document.addEventListener("DOMContentLoaded", function () {
    fitCanvasSize();
    bindEvents();
    syncPickBtn();
    paintSampleChip();
    setStepEnabled(false);
    drawCrop();
});

})();
