/* 截图美化器（screenshot_beautifier）：给现成图片加 presentation 画框
*
* 只加画框，不改图片内容一像素：不做语法高亮、不画批注（箭头/文字/打码）、
* 不压缩改尺寸、不加水印。背景 / 内边距 / 圆角 / 阴影 / 可选描边全部在
* 画布外围或图片边缘完成，原图像素原样绘制到 (padding, padding) 处。
* 纯函数全部经 module.exports 暴露，node tests/screenshot_beautifier.test.js 自测；
* 浏览器内 init 挂 DOMContentLoaded；无网络请求（零上传、零 fetch/XHR、零 CDN）。
*/
(function () {
"use strict";

var MAX_FILE_SIZE = 20 * 1024 * 1024;
var ACCEPTED_TYPES = { "image/png": true, "image/jpeg": true, "image/webp": true };
var ACCEPTED_EXTS = { png: true, jpg: true, jpeg: true, webp: true };
var HEX_RE = /^#?[0-9a-fA-F]{6}$/;

function trim(s) { return String(s == null ? "" : s).replace(/^\s+|\s+$/g, ""); }
function isNum(v) { return typeof v === "number" && isFinite(v); }

/* parseBackground：6 位 HEX 校验归一化（带/不带 #、大小写不限均归一为大写 #RRGGBB）。
* mode: solid | gradient | transparent；values: solid 为字符串或 {color}，
* gradient 为 {color1,color2} / {from,to} / [c1,c2]。其余返回 {ok:false,error}。 */
function parseHex(hex) {
  var s = trim(hex);
  if (!HEX_RE.test(s)) return null;
  if (s.charAt(0) === "#") s = s.slice(1);
  return "#" + s.toUpperCase();
}

function parseBackground(mode, values) {
  if (mode === "transparent") return { ok: true, mode: "transparent" };
  if (mode === "solid") {
    var c = parseHex(typeof values === "string" ? values : (values && values.color));
    if (!c) return { ok: false, error: "背景颜色不是合法的 6 位 HEX（如 #FF8800）" };
    return { ok: true, mode: "solid", color: c };
  }
  if (mode === "gradient") {
    var from, to;
    if (values && typeof values === "object" && typeof values.length === "number") {
      from = values[0]; to = values[1];
    } else {
      from = values && (values.color1 || values.from);
      to = values && (values.color2 || values.to);
    }
    var f = parseHex(from), t = parseHex(to);
    if (!f || !t) return { ok: false, error: "渐变起止颜色须为合法的 6 位 HEX（如 #FF8800）" };
    return { ok: true, mode: "gradient", color1: f, color2: t };
  }
  return { ok: false, error: "未知的背景模式" };
}

/* computeLayout：画布 = 原图 + 2×padding，图位于 (padding, padding)。
* radius 钳制到 [0, min(imgW,imgH)/2]；padding、shadowBlur、偏移非法
* （负数、非数字、NaN）返回 {ok:false,error}，不静默改写。 */
function computeLayout(imgW, imgH, opts) {
  opts = opts || {};
  if (!isNum(imgW) || !isNum(imgH) || imgW <= 0 || imgH <= 0) {
    return { ok: false, error: "图片宽高无效" };
  }
  var padding = opts.padding, radius = opts.radius;
  var blur = opts.shadowBlur, ox = opts.shadowOffsetX, oy = opts.shadowOffsetY;
  if (!isNum(padding) || padding < 0) return { ok: false, error: "内边距不能为负数" };
  if (!isNum(blur) || blur < 0) return { ok: false, error: "阴影模糊不能为负数" };
  if (!isNum(ox)) return { ok: false, error: "阴影横向偏移无效" };
  if (!isNum(oy)) return { ok: false, error: "阴影纵向偏移无效" };
  var r = isNum(radius) ? radius : 0;
  var maxR = Math.min(imgW, imgH) / 2;
  if (r < 0) r = 0;
  if (r > maxR) r = maxR;
  return {
    ok: true, canvasW: imgW + 2 * padding, canvasH: imgH + 2 * padding,
    imgX: padding, imgY: padding, radius: r,
    shadowBlur: blur, shadowOffsetX: ox, shadowOffsetY: oy
  };
}

/* validateImageFile：仅 png/jpeg/webp（以 type 为准，type 为空时以后缀兜底），
* 超 20MB 拒绝；其余返回 {ok:false,error}。 */
function validateImageFile(file) {
  if (!file) return { ok: false, error: "未选择图片文件" };
  if (typeof file.size === "number" && file.size > MAX_FILE_SIZE) {
    return { ok: false, error: "文件超过 20MB 上限，请换一张更小的图片" };
  }
  var type = trim(file.type).toLowerCase();
  if (type) {
    if (!ACCEPTED_TYPES[type]) return { ok: false, error: "仅支持 PNG / JPEG / WebP 图片，不支持该格式" };
    return { ok: true };
  }
  var name = trim(file.name).toLowerCase();
  var dot = name.lastIndexOf(".");
  var ext = dot > 0 ? name.slice(dot + 1) : "";
  if (!ACCEPTED_EXTS[ext]) return { ok: false, error: "仅支持 PNG / JPEG / WebP 图片，不支持该格式" };
  return { ok: true };
}

/* suggestExportName：去扩展名后加 -beautified.png。 */
function suggestExportName(originalName) {
  var name = trim(originalName);
  if (!name) return "beautified.png";
  var dot = name.lastIndexOf(".");
  if (dot > 0) name = name.slice(0, dot);
  return name + "-beautified.png";
}

function roundedPath(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/* renderFrame：把 img（HTMLImageElement/Canvas）按 opts 画到 canvas 上。
* opts: padding, radius, shadowEnabled, shadowBlur, shadowOffsetX/Y, shadowColor,
* background {mode,color,color1,color2}, strokeEnabled, strokeWidth, strokeColor,
* checker（仅预览时为透明底画棋盘格示意，导出时传 false 以保留真透明）。 */
function renderFrame(canvas, img, opts) {
  if (!canvas || !img || !opts) return null;
  var layout = computeLayout(img.width, img.height, opts);
  if (!layout.ok) return layout;
  var bg = parseBackground(opts.background && opts.background.mode, opts.background);
  if (!bg.ok) return bg;
  var ctx = canvas.getContext("2d");
  canvas.width = layout.canvasW;
  canvas.height = layout.canvasH;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (opts.checker && bg.mode === "transparent") {
    var s = 16, x, y, row = 0;
    ctx.fillStyle = "#e5e7eb";
    for (y = 0; y < canvas.height; y += s, row++) {
      for (x = (row % 2 ? s : 0); x < canvas.width; x += 2 * s) ctx.fillRect(x, y, s, s);
    }
  }
  if (bg.mode === "solid") {
    ctx.fillStyle = bg.color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else if (bg.mode === "gradient") {
    var g = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    g.addColorStop(0, bg.color1);
    g.addColorStop(1, bg.color2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  if (opts.shadowEnabled) {
    /* 阴影先行：以圆角路径填充一次（填充色随后被原图完全盖住），
    * 阴影落在路径外侧；直接给 drawImage 加 shadow 会被圆角裁剪吃掉。 */
    ctx.save();
    ctx.shadowColor = opts.shadowColor || "#000000";
    ctx.shadowBlur = layout.shadowBlur;
    ctx.shadowOffsetX = layout.shadowOffsetX;
    ctx.shadowOffsetY = layout.shadowOffsetY;
    ctx.fillStyle = opts.shadowColor || "#000000";
    roundedPath(ctx, layout.imgX, layout.imgY, img.width, img.height, layout.radius);
    ctx.fill();
    ctx.restore();
  }
  ctx.save();
  roundedPath(ctx, layout.imgX, layout.imgY, img.width, img.height, layout.radius);
  ctx.clip();
  ctx.drawImage(img, layout.imgX, layout.imgY);
  ctx.restore();
  if (opts.strokeEnabled && opts.strokeWidth > 0) {
    ctx.save();
    ctx.strokeStyle = opts.strokeColor || "#111827";
    ctx.lineWidth = opts.strokeWidth;
    roundedPath(ctx, layout.imgX, layout.imgY, img.width, img.height, layout.radius);
    ctx.stroke();
    ctx.restore();
  }
  return layout;
}

/* buildSampleImage：浏览器侧用 canvas 程序化生成 800×500 示例图，无外部资源。 */
function buildSampleImage() {
  if (typeof document === "undefined") return null;
  var c = document.createElement("canvas");
  c.width = 800; c.height = 500;
  var ctx = c.getContext("2d");
  var g = ctx.createLinearGradient(0, 0, 800, 500);
  g.addColorStop(0, "#dbeafe"); g.addColorStop(1, "#fef3c7");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 800, 500);
  ctx.fillStyle = "#2563eb"; ctx.fillRect(60, 60, 300, 180);
  ctx.fillStyle = "#f59e0b"; ctx.fillRect(400, 60, 340, 180);
  ctx.fillStyle = "#10b981"; ctx.fillRect(60, 280, 680, 120);
  ctx.fillStyle = "#111827"; ctx.font = "bold 44px sans-serif";
  ctx.fillText("示例截图 800 × 500", 60, 460);
  ctx.font = "28px sans-serif"; ctx.fillStyle = "#374151";
  ctx.fillText("加画框后导出，内容一像素不动", 60, 200);
  return c;
}

var api = {
  MAX_FILE_SIZE: MAX_FILE_SIZE, parseHex: parseHex, parseBackground: parseBackground,
  computeLayout: computeLayout, validateImageFile: validateImageFile,
  suggestExportName: suggestExportName, renderFrame: renderFrame,
  buildSampleImage: buildSampleImage
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
} else if (typeof window !== "undefined") {
  window.ScreenshotBeautifier = api;
  document.addEventListener("DOMContentLoaded", function () {
    function $(id) { return document.getElementById(id); }
    function showErr(msg) {
      var el = $("sb-error"); if (!el) return;
      var span = el.querySelector("span");
      if (span) span.textContent = msg || "";
      else el.textContent = msg || "";
      el.style.display = msg ? "flex" : "none";
    }
    function showStatus(msg) { var el = $("sb-status"); if (el) el.textContent = msg || ""; }
    function num(id, def) { var v = parseFloat($(id).value); return isFinite(v) ? v : def; }
    var state = { img: null, name: "", sample: false };
    function collectOpts() {
      var mode = $("sb-bg-mode").value;
      return {
        padding: num("sb-padding", 40), radius: num("sb-radius", 24),
        shadowEnabled: $("sb-shadow").checked, shadowBlur: num("sb-shadow-blur", 24),
        shadowOffsetX: num("sb-shadow-x", 0), shadowOffsetY: num("sb-shadow-y", 8),
        shadowColor: $("sb-shadow-color").value,
        background: mode === "solid" ? { mode: mode, color: $("sb-color").value }
          : mode === "gradient" ? { mode: mode, color1: $("sb-color1").value, color2: $("sb-color2").value }
          : { mode: "transparent" },
        strokeEnabled: $("sb-stroke").checked, strokeWidth: num("sb-stroke-width", 0),
        strokeColor: $("sb-stroke-color").value
      };
    }
    function render() {
      var canvas = $("sb-canvas"); if (!canvas || !state.img) return;
      var opts = collectOpts();
      opts.checker = true;
      var layout = renderFrame(canvas, state.img, opts);
      if (!layout || !layout.ok) { showErr(layout && layout.error ? layout.error : "渲染失败，请检查参数"); return; }
      showErr("");
      var info = $("sb-info");
      if (info) info.textContent = "原图 " + state.img.width + " × " + state.img.height + " → 画布 " +
        layout.canvasW + " × " + layout.canvasH + "，图位于 (" + layout.imgX + ", " + layout.imgY +
        ")，实际圆角 " + layout.radius + " px";
      $("sb-padding-val").textContent = opts.padding + " px";
      $("sb-radius-val").textContent = opts.radius + " px（实际 " + layout.radius + " px）";
      $("sb-shadow-blur-val").textContent = opts.shadowBlur + " px";
      $("sb-shadow-x-val").textContent = opts.shadowOffsetX + " px";
      $("sb-shadow-y-val").textContent = opts.shadowOffsetY + " px";
      $("sb-stroke-width-val").textContent = opts.strokeWidth + " px";
      var dl = $("sb-download"); if (dl) dl.disabled = false;
    }
    function setImage(img, name, isSample) {
      state.img = img; state.name = name; state.sample = !!isSample;
      var meta = $("sb-meta");
      if (meta) meta.textContent = (isSample ? "示例图：" : "已上传：") + name + "（" + img.width + " × " + img.height + "）";
      render();
    }
    function handleFile(file) {
      var v = validateImageFile(file);
      if (!v.ok) { showErr(v.error); return; }
      showErr("");
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); setImage(img, file.name, false); showStatus("已载入图片，调整参数后导出 PNG。"); };
      img.onerror = function () { URL.revokeObjectURL(url); showErr("图片解码失败，请换一张 PNG / JPEG / WebP 图片"); };
      img.src = url;
    }
    var drop = $("sb-drop"), input = $("sb-file");
    if (drop) {
      drop.addEventListener("click", function () { input.click(); });
      ["dragenter", "dragover"].forEach(function (e) { drop.addEventListener(e, function (ev) { ev.preventDefault(); drop.classList.add("drag"); }); });
      ["dragleave", "drop"].forEach(function (e) { drop.addEventListener(e, function (ev) { ev.preventDefault(); drop.classList.remove("drag"); }); });
      drop.addEventListener("drop", function (ev) { if (ev.dataTransfer.files.length) handleFile(ev.dataTransfer.files[0]); });
      drop.addEventListener("keydown", function (ev) { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); input.click(); } });
    }
    if (input) input.addEventListener("change", function () { if (input.files.length) handleFile(input.files[0]); });
    ["sb-bg-mode", "sb-color", "sb-color1", "sb-color2", "sb-padding", "sb-radius",
     "sb-shadow", "sb-shadow-blur", "sb-shadow-x", "sb-shadow-y", "sb-shadow-color",
     "sb-stroke", "sb-stroke-width", "sb-stroke-color"].forEach(function (id) {
      var el = $(id); if (el) el.addEventListener("input", function () {
        var mode = $("sb-bg-mode").value;
        $("sb-solid-row").style.display = mode === "solid" ? "" : "none";
        $("sb-gradient-row").style.display = mode === "gradient" ? "" : "none";
        if (state.img) render();
      });
    });
    var sampleBtn = $("sb-sample");
    if (sampleBtn) sampleBtn.addEventListener("click", function () {
      var img = buildSampleImage();
      if (img) { setImage(img, "示例图 800×500", true); showStatus("已载入示例图，无需上传即可演示全部画框参数。"); }
    });
    var resetBtn = $("sb-reset");
    if (resetBtn) resetBtn.addEventListener("click", function () {
      state.img = null; state.name = ""; if (input) input.value = "";
      var c = $("sb-canvas"); if (c) { var ctx = c.getContext("2d"); ctx.clearRect(0, 0, c.width, c.height); }
      var meta = $("sb-meta"); if (meta) meta.textContent = "未载入图片：请上传图片或载入示例。";
      var info = $("sb-info"); if (info) info.textContent = "";
      var dl = $("sb-download"); if (dl) dl.disabled = true;
      showErr(""); showStatus("");
    });
    var dlBtn = $("sb-download");
    if (dlBtn) dlBtn.addEventListener("click", function () {
      if (!state.img) { showErr("请先上传图片或载入示例"); return; }
      var off = document.createElement("canvas");
      var opts = collectOpts(); opts.checker = false;
      var layout = renderFrame(off, state.img, opts);
      if (!layout || !layout.ok) { showErr(layout && layout.error ? layout.error : "导出失败，请检查参数"); return; }
      showErr("");
      off.toBlob(function (blob) {
        if (!blob) { showErr("导出失败：浏览器无法生成 PNG，请换用 Chromium 系浏览器重试"); return; }
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = suggestExportName(state.sample ? "sample.png" : state.name);
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
        showStatus("已导出 PNG（" + layout.canvasW + " × " + layout.canvasH + "）：圆角与透明背景仅 PNG 保留。");
      }, "image/png");
    });
  });
}
})();
