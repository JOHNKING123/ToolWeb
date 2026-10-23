/* ASCII 字符画生成器（ascii_art_generator）纯前端核心逻辑
 * 纯函数经 module.exports 暴露，node tests/ascii_art_generator.test.js 自测；
 * 浏览器端：window.AsciiArt 全局 + DOM 装配（本文件末尾）。
 *
 * 设计说明（规格见 BACKLOG 2026-10-24 05:41 PM 排期条目）：
 * - 字符集（全部按「暗→亮 / 密→疏」顺序存储）：
 *   simple   精简 11 级：@#S%?*+;:,.
 *   standard 标准 70 级经典 ramp：$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\|()1{}[]?-_+~<>i!lI;:,"^`.' （末空格）
 *   halftone 半调 10 级：规格串 ` .:-=+*#%@`（亮→暗）反转存储为 @%#*+=-:. （末空格）
 * - 映射：亮度 lum∈[0,255]，idx = round((1 - lum/255) * (len-1))；反色开关直接翻转映射。
 * - 降采样：大图先 canvas 缩放到最长边 ≤480px；字符宽度 40/80/120/160 四档（默认 80），
 *   行数按行高 0.5 压缩（等宽字符约高为宽的 2 倍，防拉长）。
 * - 彩色模式：逐 cell 记录采样点原色，展示用 span 着色；复制/导出 .txt 降级为纯灰度字符。
 * - 零上传、零 fetch/XHR：FileReader→Image→canvas 全本地；导出用 Blob+URL.createObjectURL（家族惯例带 BOM）。
 */
(function () {
"use strict";

/* ================= 0. 常量 ================= */

var RAMPS = {
    simple:   "@#S%?*+;:,.",
    standard: "$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,\"^`.' ",
    halftone: "@%#*+=-:. "
};
var RAMP_NAMES = { simple: "精简", standard: "标准", halftone: "半调" };
var RAMP_KEYS = ["simple", "standard", "halftone"];
var WIDTHS = [40, 80, 120, 160];
var DEFAULT_WIDTH = 80;
var DEFAULT_RAMP = "standard";
var MAX_SIDE = 480;        /* 预缩放上限：最长边 ≤480px */
var ROW_FACTOR = 0.5;      /* 行高压缩比，防字符画横向拉长 */
var PERF_HINT_COLS = 160;  /* 彩色模式下达到此宽度提示可能卡顿、建议降档 */

/* ================= 1. 亮度与映射 ================= */

/* ITU-R BT.601 亮度 */
function luminance(r, g, b) {
    return 0.299 * r + 0.587 * g + 0.114 * b;
}

/* 亮度→字符。ramp 须为 RAMPS 中的串（暗→亮/密→疏顺序）；invert 反转映射。 */
function charForLuminance(lum, ramp, invert) {
    if (typeof lum !== "number" || isNaN(lum)) lum = 128;
    if (lum < 0) lum = 0;
    if (lum > 255) lum = 255;
    var s = RAMPS[ramp] || RAMPS[DEFAULT_RAMP];
    var n = s.length - 1;
    var t = invert ? 1 - lum / 255 : lum / 255;
    var idx = Math.round(t * n);
    if (idx < 0) idx = 0;
    if (idx > n) idx = n;
    return s.charAt(idx);
}

/* ================= 2. 尺寸计算 ================= */

/* 大图预缩放：最长边压到 MAX_SIDE 以内，小图不动。返回 {w,h}。 */
function computeTargetSize(w, h) {
    w = Math.max(1, Math.floor(w) || 1);
    h = Math.max(1, Math.floor(h) || 1);
    var m = Math.max(w, h);
    if (m <= MAX_SIDE) return { w: w, h: h };
    var k = MAX_SIDE / m;
    return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/* 由缩放后尺寸与目标列数算行列：cols 取档位（不超过源宽），rows 按行高 0.5 压缩。 */
function gridSize(scaledW, scaledH, cols) {
    cols = Math.max(1, Math.min(Math.floor(cols) || DEFAULT_WIDTH, scaledW));
    var rows = Math.max(1, Math.round(scaledH / scaledW * cols * ROW_FACTOR));
    return { cols: cols, rows: rows };
}

/* ================= 3. 字符画构建 ================= */

/*
 * pixels: {width, height, data}（data 为 RGBA Uint8ClampedArray 风格数组）
 * cols: 目标字符宽度；opts: {ramp, invert, color}
 * 返回 {lines:[...], cols, rows, cells?}；color 模式下 cells 为逐 cell {ch,r,g,b}。
 */
function buildArt(pixels, cols, opts) {
    opts = opts || {};
    var ramp = opts.ramp || DEFAULT_RAMP;
    var invert = !!opts.invert;
    var wantColor = !!opts.color;
    var pw = pixels.width, ph = pixels.height, data = pixels.data;
    var g = gridSize(pw, ph, cols);
    var cw = g.cols, ch = g.rows;
    var lines = new Array(ch);
    var cells = wantColor ? [] : null;
    var sx = pw / cw, sy = ph / ch;
    for (var y = 0; y < ch; y++) {
        var rowChars = new Array(cw);
        for (var x = 0; x < cw; x++) {
            var px = Math.min(pw - 1, Math.floor((x + 0.5) * sx));
            var py = Math.min(ph - 1, Math.floor((y + 0.5) * sy));
            var i = (py * pw + px) * 4;
            var r = data[i], gg = data[i + 1], b = data[i + 2];
            var lum = luminance(r, gg, b);
            var chr = charForLuminance(lum, ramp, invert);
            rowChars[x] = chr;
            if (cells) cells.push({ ch: chr, r: r, g: gg, b: b });
        }
        lines[y] = rowChars.join("");
    }
    return { lines: lines, cols: cw, rows: ch, cells: cells };
}

/* 字符画→导出文本（纯灰度字符，彩色信息丢弃）。 */
function artToText(art) {
    return art.lines.join("\n");
}

/* 彩色模式是否可能卡顿（逐字 span 量大）：达到阈值提示降档。 */
function needsPerfHint(cols, color) {
    return !!color && cols >= PERF_HINT_COLS;
}

/* ================= 4. 导出 ================= */

/* 文件名：ascii-art-YYYYMMDD-HHmmss.txt（本地时间） */
function pad2(n) { return (n < 10 ? "0" : "") + n; }
function buildFilename(d) {
    var t = d instanceof Date ? d : new Date();
    return "ascii-art-" + t.getFullYear() + pad2(t.getMonth() + 1) + pad2(t.getDate()) +
        "-" + pad2(t.getHours()) + pad2(t.getMinutes()) + pad2(t.getSeconds()) + ".txt";
}

/* ================= 5. 导出 API ================= */

var api = {
    RAMPS: RAMPS, RAMP_NAMES: RAMP_NAMES, RAMP_KEYS: RAMP_KEYS,
    WIDTHS: WIDTHS, DEFAULT_WIDTH: DEFAULT_WIDTH, DEFAULT_RAMP: DEFAULT_RAMP,
    MAX_SIDE: MAX_SIDE, ROW_FACTOR: ROW_FACTOR, PERF_HINT_COLS: PERF_HINT_COLS,
    luminance: luminance, charForLuminance: charForLuminance,
    computeTargetSize: computeTargetSize, gridSize: gridSize,
    buildArt: buildArt, artToText: artToText,
    needsPerfHint: needsPerfHint, buildFilename: buildFilename
};

if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
} else if (typeof window !== "undefined") {
    window.AsciiArt = api;
}

/* ================= 6. 浏览器 DOM 装配 ================= */

if (typeof document !== "undefined" && typeof window !== "undefined") {
(function () {
var AA = (typeof window.AsciiArt !== "undefined") ? window.AsciiArt : api;

function $(id) { return document.getElementById(id); }

function toast(msg) {
    var el = $("aag-toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove("show"); }, 2600);
}

function escHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c];
    });
}

var state = {
    art: null,        /* buildArt 结果 */
    fileName: "",     /* 原图文件名（用于下载名前缀提示） */
    fontSize: 14
};

function currentOpts() {
    var ramp = AA.DEFAULT_RAMP;
    var rs = document.querySelectorAll('input[name="aag-ramp"]');
    for (var i = 0; i < rs.length; i++) if (rs[i].checked) ramp = rs[i].value;
    var cols = AA.DEFAULT_WIDTH;
    var ws = document.querySelectorAll('input[name="aag-width"]');
    for (var j = 0; j < ws.length; j++) if (ws[j].checked) cols = parseInt(ws[j].value, 10) || AA.DEFAULT_WIDTH;
    return {
        ramp: ramp,
        cols: cols,
        invert: $("aag-invert").checked,
        color: $("aag-color").checked
    };
}

/* 由已解码的 Image 生成字符画 */
function convertFromImage(img) {
    var size = AA.computeTargetSize(img.naturalWidth || img.width, img.naturalHeight || img.height);
    var cv = document.createElement("canvas");
    cv.width = size.w; cv.height = size.h;
    var ctx = cv.getContext("2d");
    ctx.drawImage(img, 0, 0, size.w, size.h);
    var imgd;
    try {
        imgd = ctx.getImageData(0, 0, size.w, size.h);
    } catch (e) {
        toast("图片读取失败（可能跨域），请换一张本地图片。");
        return;
    }
    var opts = currentOpts();
    var art = AA.buildArt(
        { width: size.w, height: size.h, data: imgd.data },
        opts.cols,
        { ramp: opts.ramp, invert: opts.invert, color: opts.color }
    );
    state.art = art;
    renderArt();
    $("aag-result-panel").style.display = "";
    var info = size.w + "×" + size.h + " → " + art.cols + "列 × " + art.rows + "行";
    $("aag-meta").textContent = "原图 " + info + "（字符集：" + AA.RAMP_NAMES[opts.ramp] +
        (opts.invert ? " · 反色" : "") + (opts.color ? " · 彩色" : " · 灰度") + "）";
    if (AA.needsPerfHint(art.cols, opts.color)) {
        toast("160 宽彩色模式字符较多，若页面卡顿可降到 80/120 档。");
    }
    var empty = $("aag-empty");
    if (empty) empty.style.display = "none";
}

function renderArt() {
    var pre = $("aag-output");
    var art = state.art;
    if (!art) { pre.textContent = ""; return; }
    var color = $("aag-color").checked;
    pre.style.fontSize = state.fontSize + "px";
    if (color && art.cells) {
        var html = [];
        var idx = 0;
        for (var y = 0; y < art.rows; y++) {
            for (var x = 0; x < art.cols; x++) {
                var c = art.cells[idx++];
                html.push('<span style="color:rgb(' + c.r + "," + c.g + "," + c.b + ')">' +
                    escHtml(c.ch) + "</span>");
            }
            if (y < art.rows - 1) html.push("\n");
        }
        pre.innerHTML = html.join("");
    } else {
        pre.textContent = AA.artToText(art);
    }
}

/* 参数变化时若已有图则重新转换（需要保留原 Image） */
var lastImage = null;
function reconvert() {
    if (lastImage) convertFromImage(lastImage);
}

function handleFile(file) {
    if (!file) return;
    if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) {
        toast("仅支持 PNG / JPG / GIF / WebP 图片。");
        return;
    }
    state.fileName = file.name || "";
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
        URL.revokeObjectURL(url);
        lastImage = img;
        convertFromImage(img);
    };
    img.onerror = function () {
        URL.revokeObjectURL(url);
        toast("图片解码失败，请换一张图片重试。");
    };
    img.src = url;
}

function copyArt() {
    if (!state.art) { toast("请先上传图片生成字符画。"); return; }
    var text = AA.artToText(state.art); /* 复制恒为灰度字符，与导出一致 */
    function done() { toast("已复制到剪贴板（灰度字符）。"); }
    function fallback() {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        try {
            var ok = document.execCommand("copy");
            document.body.removeChild(ta);
            toast(ok ? "已复制到剪贴板（灰度字符）。" : "复制失败，请手动选择输出区复制。");
        } catch (e) {
            document.body.removeChild(ta);
            toast("复制失败，请手动选择输出区复制。");
        }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, fallback);
    } else {
        fallback();
    }
}

function downloadArt() {
    if (!state.art) { toast("请先上传图片生成字符画。"); return; }
    var text = AA.artToText(state.art); /* 导出恒为灰度字符画 */
    var blob = new Blob(["﻿" + text], { type: "text/plain;charset=utf-8" }); /* 家族惯例：带 BOM */
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = AA.buildFilename(new Date());
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
        URL.revokeObjectURL(a.href);
        document.body.removeChild(a);
    }, 500);
    var color = $("aag-color").checked;
    toast("已开始下载 " + a.download + (color ? "（彩色模式已降级为灰度字符）" : ""));
}

function init() {
    var dz = $("aag-dropzone"), fi = $("aag-file-input");
    dz.addEventListener("click", function () { fi.click(); });
    $("aag-pick-btn").addEventListener("click", function (e) { e.stopPropagation(); fi.click(); });
    fi.addEventListener("change", function () {
        if (fi.files && fi.files[0]) handleFile(fi.files[0]);
        fi.value = "";
    });
    ["dragenter", "dragover"].forEach(function (ev) {
        dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add("aag-drag"); });
    });
    ["dragleave", "drop"].forEach(function (ev) {
        dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove("aag-drag"); });
    });
    dz.addEventListener("drop", function (e) {
        var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) handleFile(f);
    });

    var params = document.querySelectorAll('input[name="aag-width"],input[name="aag-ramp"],#aag-invert,#aag-color');
    for (var i = 0; i < params.length; i++) {
        params[i].addEventListener("change", reconvert);
    }

    $("aag-font-dec").addEventListener("click", function () {
        state.fontSize = Math.max(8, state.fontSize - 1);
        renderArt();
    });
    $("aag-font-inc").addEventListener("click", function () {
        state.fontSize = Math.min(28, state.fontSize + 1);
        renderArt();
    });

    $("aag-copy-btn").addEventListener("click", copyArt);
    $("aag-dl-btn").addEventListener("click", downloadArt);
    $("aag-repick-btn").addEventListener("click", function () { fi.click(); });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}

})();
}
})();
