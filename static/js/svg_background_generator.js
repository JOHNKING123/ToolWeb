/* SVG 波形／斑点背景生成器：正弦分层波形采样 + 径向扰动斑点（Catmull-Rom 平滑闭合）
 * 纯前端零上传、零第三方依赖、零网络请求（无 fetch / XHR）。
 * 纯逻辑部分（种子随机 / HEX 归一化 / 波形采样 / 斑点路径 / SVG 组装 / CSS 片段 / 导出命名 / 尺寸校验）
 * 经由 module.exports 暴露，供 node tests/svg_background_generator.test.js 做单元测试。
 * 用法（浏览器）：页面引入后自动初始化 #sbg-* 控件。
 * 失败约定：所有纯函数在参数非法时抛 Error，err.field 给出字段名，不静默钳制、不静默取整。
 */
(function () {
"use strict";

/* ================= 常量 ================= */
var WAVE_SAMPLES = 120; // 波形采样点数（不含闭合点），固定值
var MIN_SIZE = 200;
var MAX_SIZE = 4000;
var BLOB_MIN_POINTS = 6;
var BLOB_MAX_POINTS = 20;
var MAX_LAYERS = 4;

/* ================= 错误与数值工具 ================= */
function fail(field, message) {
  var err = new Error(message);
  err.field = field;
  return err;
}

function isFiniteNumber(v) {
  return typeof v === "number" && isFinite(v) && !isNaN(v);
}

/* 路径数值格式化：保留 3 位小数去尾零，保证同参数输出逐字节一致 */
function fmt(n) {
  var r = parseFloat(n.toFixed(3));
  return (r === 0 ? 0 : r).toString();
}

/* ================= mulberry32 种子随机 ================= */
function seededRandom(seed) {
  if (typeof seed !== "number" || !isFinite(seed) || Math.floor(seed) !== seed) {
    throw fail("seed", "种子 seed 必须为整数（不接受小数、NaN 或非数字，不静默取整）");
  }
  var a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ================= HEX 归一化 ================= */
function normalizeHex(input) {
  if (typeof input !== "string") throw fail("color", "颜色必须为文本");
  var s = input.replace(/^\s+|\s+$/g, "");
  if (s.charAt(0) === "#") s = s.slice(1);
  if (!/^[0-9a-fA-F]{6}$/.test(s)) {
    throw fail("color", "颜色必须为 6 位 HEX（如 #4F46E5 或 4f46e5），不支持 3 位缩写");
  }
  return "#" + s.toLowerCase();
}

function checkOpacity(opacity, field) {
  if (!isFiniteNumber(opacity) || opacity < 0 || opacity > 1) {
    throw fail(field, "透明度 opacity 必须在 0–1 之间");
  }
}

/* ================= 尺寸校验 ================= */
function validateSize(width, height) {
  if (typeof width !== "number" || Math.floor(width) !== width || width < MIN_SIZE || width > MAX_SIZE) {
    throw fail("width", "画布宽度必须为 " + MIN_SIZE + "–" + MAX_SIZE + " 之间的整数");
  }
  if (typeof height !== "number" || Math.floor(height) !== height || height < MIN_SIZE || height > MAX_SIZE) {
    throw fail("height", "画布高度必须为 " + MIN_SIZE + "–" + MAX_SIZE + " 之间的整数");
  }
  return true;
}

/* ================= 波形单层路径 =================
 * x_i = width*i/(N-1)，y_i = baseline + amplitude*sin(2π*frequency*x_i/width + phase)
 * M 起笔 → 120 个采样点 → L width,height → L 0,height → Z 闭合到底边
 */
function waveLayerPath(width, height, opts) {
  opts = opts || {};
  if (!isFiniteNumber(width) || width <= 0) throw fail("width", "波形宽度必须为正数");
  if (!isFiniteNumber(height) || height <= 0) throw fail("height", "波形高度必须为正数");
  var amplitude = opts.amplitude;
  var frequency = opts.frequency;
  var baseline = opts.baseline;
  var phase = opts.phase === undefined ? 0 : opts.phase;
  if (!isFiniteNumber(amplitude) || amplitude < 0) throw fail("amplitude", "振幅 amplitude 不能为负数");
  if (amplitude > height / 2) throw fail("amplitude", "振幅 amplitude 不能超过高度的一半");
  if (!isFiniteNumber(frequency) || frequency < 0.5) throw fail("frequency", "频率 frequency 不能小于 0.5");
  if (!isFiniteNumber(baseline) || baseline < 0 || baseline > height) {
    throw fail("baseline", "基线 baseline 必须在 0–高度之间");
  }
  if (!isFiniteNumber(phase)) throw fail("phase", "相位 phase 必须为数字");
  var parts = [];
  var i, x, y;
  for (i = 0; i < WAVE_SAMPLES; i++) {
    x = width * i / (WAVE_SAMPLES - 1);
    y = baseline + amplitude * Math.sin(2 * Math.PI * frequency * x / width + phase);
    parts.push((i === 0 ? "M " : "L ") + fmt(x) + "," + fmt(y));
  }
  parts.push("L " + fmt(width) + "," + fmt(height));
  parts.push("L 0," + fmt(height));
  parts.push("Z");
  return { d: parts.join(" ") };
}

/* ================= 斑点路径 =================
 * 顶点角均匀分布，半径 r_i = radius*(1 + smoothness*(rand_i-0.5)*2)，
 * 顶点间 Catmull-Rom 转三次贝塞尔平滑闭合；smoothness=0 时为正多边形。
 */
function blobPath(opts) {
  opts = opts || {};
  var cx = opts.cx;
  var cy = opts.cy;
  var radius = opts.radius;
  var points = opts.points;
  var smoothness = opts.smoothness;
  var seed = opts.seed;
  if (!isFiniteNumber(cx)) throw fail("cx", "中心横坐标 cx 必须为数字");
  if (!isFiniteNumber(cy)) throw fail("cy", "中心纵坐标 cy 必须为数字");
  if (!isFiniteNumber(radius) || radius <= 0) throw fail("radius", "半径 radius 必须为正数");
  if (typeof points !== "number" || Math.floor(points) !== points ||
      points < BLOB_MIN_POINTS || points > BLOB_MAX_POINTS) {
    throw fail("points", "顶点数 points 必须为 " + BLOB_MIN_POINTS + "–" + BLOB_MAX_POINTS + " 之间的整数");
  }
  if (!isFiniteNumber(smoothness) || smoothness < 0 || smoothness > 1) {
    throw fail("smoothness", "圆润度 smoothness 必须在 0–1 之间");
  }
  var rand = seededRandom(seed); // seed 非整数时在此抛错
  var verts = [];
  var i, ang, r;
  for (i = 0; i < points; i++) {
    ang = -Math.PI / 2 + 2 * Math.PI * i / points;
    r = radius * (1 + smoothness * (rand() - 0.5) * 2);
    verts.push({ x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang) });
  }
  function at(k) {
    return verts[((k % points) + points) % points];
  }
  var parts = ["M " + fmt(verts[0].x) + "," + fmt(verts[0].y)];
  for (i = 0; i < points; i++) {
    var p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    var c1x = p1.x + (p2.x - p0.x) / 6;
    var c1y = p1.y + (p2.y - p0.y) / 6;
    var c2x = p2.x - (p3.x - p1.x) / 6;
    var c2y = p2.y - (p3.y - p1.y) / 6;
    parts.push("C " + fmt(c1x) + "," + fmt(c1y) + " " + fmt(c2x) + "," + fmt(c2y) +
               " " + fmt(p2.x) + "," + fmt(p2.y));
  }
  parts.push("Z");
  return { d: parts.join(" ") };
}

/* ================= SVG 组装 ================= */
function escapeAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function buildSvg(config) {
  config = config || {};
  var type = config.type;
  if (type !== "wave" && type !== "blob") throw fail("type", "类型 type 必须为 wave 或 blob");
  validateSize(config.width, config.height);
  var width = config.width, height = config.height;
  var bg = config.background;
  var bgAttr = "";
  if (bg !== undefined && bg !== null && bg !== "transparent") {
    bgAttr = "<rect width=\"100%\" height=\"100%\" fill=\"" + escapeAttr(normalizeHex(bg)) + "\"/>";
  }
  var inner = bgAttr;
  if (type === "wave") {
    var layers = config.layers;
    if (!Array.isArray(layers) || layers.length < 1 || layers.length > MAX_LAYERS) {
      throw fail("layers", "波形层数 layers 必须为 1–4 层的数组");
    }
    layers.forEach(function (layer, idx) {
      var prefix = "layers[" + idx + "]";
      var color = normalizeHex(layer.color);
      checkOpacity(layer.opacity, prefix + ".opacity");
      var path = waveLayerPath(width, height, {
        amplitude: layer.amplitude,
        frequency: layer.frequency,
        phase: layer.phase,
        baseline: layer.baseline
      });
      inner += "<path d=\"" + path.d + "\" fill=\"" + color + "\" fill-opacity=\"" + layer.opacity + "\"/>";
    });
  } else {
    var color = normalizeHex(config.color);
    checkOpacity(config.opacity, "opacity");
    var path = blobPath({
      cx: config.cx === undefined ? width / 2 : config.cx,
      cy: config.cy === undefined ? height / 2 : config.cy,
      radius: config.radius === undefined ? Math.min(width, height) * 0.35 : config.radius,
      points: config.points,
      smoothness: config.smoothness,
      seed: config.seed
    });
    inner += "<path d=\"" + path.d + "\" fill=\"" + color + "\" fill-opacity=\"" + config.opacity + "\"/>";
  }
  return "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"" + width + "\" height=\"" + height +
         "\" viewBox=\"0 0 " + width + " " + height + "\">" + inner + "</svg>";
}

/* ================= CSS 背景片段与导出命名 ================= */
function buildCssBackground(svg) {
  if (typeof svg !== "string" || !svg) throw fail("svg", "CSS 片段需要非空 SVG 字符串");
  return "background-image: url(\"data:image/svg+xml," + encodeURIComponent(svg) + "\");";
}

function suggestExportName(type) {
  if (type === "wave") return "wave-background.svg";
  if (type === "blob") return "blob-background.svg";
  throw fail("type", "导出类型 type 必须为 wave 或 blob");
}

/* ================= 导出 ================= */
var api = {
  WAVE_SAMPLES: WAVE_SAMPLES,
  seededRandom: seededRandom,
  normalizeHex: normalizeHex,
  validateSize: validateSize,
  waveLayerPath: waveLayerPath,
  blobPath: blobPath,
  buildSvg: buildSvg,
  buildCssBackground: buildCssBackground,
  suggestExportName: suggestExportName
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
}
if (typeof window !== "undefined") {
  window.SvgBackgroundGenerator = api;
}

/* ================= 浏览器 UI ================= */
if (typeof document === "undefined") return;

function $(id) { return document.getElementById(id); }

var WAVE_EXAMPLE = {
  type: "wave", width: 1920, height: 1080, background: "#0f172a",
  layers: [
    { color: "#4f46e5", opacity: 0.9, amplitude: 60, frequency: 1, phase: 0, baseline: 700 },
    { color: "#06b6d4", opacity: 0.7, amplitude: 90, frequency: 2, phase: 1.2, baseline: 780 },
    { color: "#ec4899", opacity: 0.5, amplitude: 50, frequency: 3, phase: 2.4, baseline: 850 }
  ]
};
var BLOB_EXAMPLE = {
  type: "blob", width: 1200, height: 1200, background: "transparent",
  color: "#6366f1", opacity: 0.9, points: 12, smoothness: 0.6, seed: 42
};

var state = {
  mode: "wave",
  width: 1920, height: 1080,
  background: "#0f172a", transparentBg: false,
  layers: JSON.parse(JSON.stringify(WAVE_EXAMPLE.layers)),
  blob: { color: "#6366f1", opacity: 0.9, points: 12, smoothness: 0.6, seed: 42 }
};
var currentSvg = "";

function showError(msg) {
  var el = $("sbg-error");
  if (!msg) { el.style.display = "none"; el.textContent = ""; return; }
  el.style.display = "block";
  el.textContent = msg;
}

function numVal(id, fallback) {
  var v = parseFloat($(id).value);
  return isNaN(v) ? fallback : v;
}
function intVal(id, fallback) {
  var v = parseInt($(id).value, 10);
  return isNaN(v) ? fallback : v;
}

function collectConfig() {
  var bg = state.transparentBg ? "transparent" : state.background;
  if (state.mode === "wave") {
    return { type: "wave", width: state.width, height: state.height, background: bg, layers: state.layers };
  }
  return {
    type: "blob", width: state.width, height: state.height, background: bg,
    color: state.blob.color, opacity: state.blob.opacity, points: state.blob.points,
    smoothness: state.blob.smoothness, seed: state.blob.seed
  };
}

function render() {
  try {
    validateSize(state.width, state.height);
    currentSvg = buildSvg(collectConfig());
    $("sbg-preview").innerHTML = currentSvg;
    $("sbg-code").value = currentSvg;
    $("sbg-size-info").textContent = "画布 " + state.width + " × " + state.height + " · SVG " + currentSvg.length + " 字节";
    showError("");
  } catch (e) {
    showError(e.message || String(e));
  }
}

function renderLayerEditors() {
  var wrap = $("sbg-layers");
  wrap.innerHTML = "";
  state.layers.forEach(function (layer, idx) {
    var div = document.createElement("div");
    div.className = "sbg-layer";
    div.innerHTML =
      "<div class=\"sbg-layer-title\">第 " + (idx + 1) + " 层</div>" +
      "<label>颜色 <input type=\"color\" data-k=\"color\" data-i=\"" + idx + "\" value=\"" + layer.color + "\"></label>" +
      "<label>透明度 <input type=\"range\" min=\"0\" max=\"1\" step=\"0.05\" data-k=\"opacity\" data-i=\"" + idx + "\" value=\"" + layer.opacity + "\"> <span>" + layer.opacity + "</span></label>" +
      "<label>振幅(px) <input type=\"range\" min=\"0\" max=\"400\" step=\"5\" data-k=\"amplitude\" data-i=\"" + idx + "\" value=\"" + layer.amplitude + "\"> <span>" + layer.amplitude + "</span></label>" +
      "<label>频率(周期) <input type=\"range\" min=\"0.5\" max=\"6\" step=\"0.5\" data-k=\"frequency\" data-i=\"" + idx + "\" value=\"" + layer.frequency + "\"> <span>" + layer.frequency + "</span></label>" +
      "<label>相位(弧度) <input type=\"range\" min=\"0\" max=\"6.28\" step=\"0.1\" data-k=\"phase\" data-i=\"" + idx + "\" value=\"" + layer.phase + "\"> <span>" + layer.phase + "</span></label>" +
      "<label>基线(px) <input type=\"range\" min=\"0\" max=\"" + state.height + "\" step=\"10\" data-k=\"baseline\" data-i=\"" + idx + "\" value=\"" + layer.baseline + "\"> <span>" + layer.baseline + "</span></label>";
    wrap.appendChild(div);
  });
  var inputs = wrap.querySelectorAll("input");
  for (var i = 0; i < inputs.length; i++) {
    (function (input) {
      input.addEventListener("input", function () {
        var layer = state.layers[parseInt(input.getAttribute("data-i"), 10)];
        var k = input.getAttribute("data-k");
        layer[k] = (k === "color") ? input.value : parseFloat(input.value);
        var span = input.parentNode.querySelector("span");
        if (span) span.textContent = input.value;
        render();
      });
    })(inputs[i]);
  }
}

function syncFormFromState() {
  $("sbg-width").value = state.width;
  $("sbg-height").value = state.height;
  $("sbg-bg").value = state.background === "transparent" ? "#ffffff" : state.background;
  $("sbg-bg-transparent").checked = state.transparentBg;
  $("sbg-layer-count").value = state.layers.length;
  renderLayerEditors();
  $("sbg-blob-color").value = state.blob.color;
  $("sbg-blob-opacity").value = state.blob.opacity;
  $("sbg-blob-opacity-val").textContent = state.blob.opacity;
  $("sbg-blob-points").value = state.blob.points;
  $("sbg-blob-points-val").textContent = state.blob.points;
  $("sbg-blob-smooth").value = state.blob.smoothness;
  $("sbg-blob-smooth-val").textContent = state.blob.smoothness;
  $("sbg-blob-seed").value = state.blob.seed;
}

/* 高度变更时维护波形层：基线按新高/旧高等比缩放（取整后钳制到 [0, 新高]），
 * 振幅钳制到新高的一半以内。只改 UI 层状态，纯函数 waveLayerPath/buildSvg
 * 的非法即抛错、不静默钳制约定保持不动。 */
function rescaleLayersForHeight(oldHeight, newHeight) {
  if (!oldHeight || oldHeight === newHeight) return;
  var ratio = newHeight / oldHeight;
  var maxAmp = Math.floor(newHeight / 2);
  state.layers.forEach(function (layer) {
    layer.baseline = Math.max(0, Math.min(newHeight, Math.round(layer.baseline * ratio)));
    if (layer.amplitude > maxAmp) layer.amplitude = maxAmp;
  });
}

/* 统一的画布尺寸变更入口：先做层状态维护，再重建层编辑器（基线滑杆 max
 * 跟随新高度），最后 render()，避免预设/手动改高后停留在报错的旧 SVG。 */
function applyCanvasSize(newWidth, newHeight) {
  var oldHeight = state.height;
  state.width = newWidth;
  state.height = newHeight;
  rescaleLayersForHeight(oldHeight, newHeight);
  $("sbg-width").value = state.width;
  $("sbg-height").value = state.height;
  renderLayerEditors();
  render();
}

function setMode(mode) {
  state.mode = mode;
  $("sbg-tab-wave").className = "sbg-tab" + (mode === "wave" ? " active" : "");
  $("sbg-tab-blob").className = "sbg-tab" + (mode === "blob" ? " active" : "");
  $("sbg-wave-panel").style.display = mode === "wave" ? "block" : "none";
  $("sbg-blob-panel").style.display = mode === "blob" ? "block" : "none";
  render();
}

function copyText(text, okMsg) {
  function done() { $("sbg-status").textContent = okMsg; }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
  } else { fallbackCopy(text); done(); }
}
function fallbackCopy(text) {
  var ta = document.createElement("textarea");
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); } catch (e) { /* 忽略，走状态提示 */ }
  document.body.removeChild(ta);
}

function downloadBlob(blob, name) {
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); document.body.removeChild(a); }, 500);
}

function downloadPng() {
  try {
    validateSize(state.width, state.height);
    var svg = buildSvg(collectConfig());
    var url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    var img = new Image();
    img.onload = function () {
      var canvas = document.createElement("canvas");
      canvas.width = state.width;
      canvas.height = state.height;
      var ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, state.width, state.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(function (blob) {
        if (blob) {
          downloadBlob(blob, suggestExportName(state.mode).replace(/\.svg$/, ".png"));
          $("sbg-status").textContent = "PNG 已下载（" + state.width + "×" + state.height + "，与画布同尺寸）。";
        } else {
          showError("PNG 导出失败：浏览器未能生成图片数据。");
        }
      }, "image/png");
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      showError("PNG 导出失败：SVG 光栅化失败，请重试。");
    };
    img.src = url;
  } catch (e) {
    showError(e.message || String(e));
  }
}

function init() {
  $("sbg-tab-wave").addEventListener("click", function () { setMode("wave"); });
  $("sbg-tab-blob").addEventListener("click", function () { setMode("blob"); });

  var presets = document.querySelectorAll("[data-preset]");
  for (var p = 0; p < presets.length; p++) {
    presets[p].addEventListener("click", function () {
      var parts = this.getAttribute("data-preset").split("x");
      applyCanvasSize(parseInt(parts[0], 10), parseInt(parts[1], 10));
    });
  }
  $("sbg-width").addEventListener("input", function () {
    var w = intVal("sbg-width", state.width);
    if (w >= MIN_SIZE && w <= MAX_SIZE) { applyCanvasSize(w, state.height); }
    else { state.width = w; render(); }
  });
  $("sbg-height").addEventListener("input", function () {
    var h = intVal("sbg-height", state.height);
    if (h >= MIN_SIZE && h <= MAX_SIZE) { applyCanvasSize(state.width, h); }
    else { state.height = h; render(); }
  });
  $("sbg-bg").addEventListener("input", function () { state.background = $("sbg-bg").value; render(); });
  $("sbg-bg-transparent").addEventListener("change", function () {
    state.transparentBg = $("sbg-bg-transparent").checked;
    render();
  });
  $("sbg-layer-count").addEventListener("change", function () {
    var n = parseInt($("sbg-layer-count").value, 10);
    while (state.layers.length < n) {
      state.layers.push({ color: "#818cf8", opacity: 0.7, amplitude: 60, frequency: 1, phase: 0, baseline: Math.round(state.height * 0.65) });
    }
    state.layers.length = n;
    renderLayerEditors();
    render();
  });

  $("sbg-blob-color").addEventListener("input", function () { state.blob.color = $("sbg-blob-color").value; render(); });
  $("sbg-blob-opacity").addEventListener("input", function () {
    state.blob.opacity = parseFloat($("sbg-blob-opacity").value);
    $("sbg-blob-opacity-val").textContent = $("sbg-blob-opacity").value;
    render();
  });
  $("sbg-blob-points").addEventListener("input", function () {
    state.blob.points = parseInt($("sbg-blob-points").value, 10);
    $("sbg-blob-points-val").textContent = $("sbg-blob-points").value;
    render();
  });
  $("sbg-blob-smooth").addEventListener("input", function () {
    state.blob.smoothness = parseFloat($("sbg-blob-smooth").value);
    $("sbg-blob-smooth-val").textContent = $("sbg-blob-smooth").value;
    render();
  });
  $("sbg-blob-seed").addEventListener("input", function () {
    state.blob.seed = intVal("sbg-blob-seed", state.blob.seed);
    render();
  });
  $("sbg-blob-random-seed").addEventListener("click", function () {
    state.blob.seed = Math.floor(Math.random() * 1000000) + 1;
    $("sbg-blob-seed").value = state.blob.seed;
    render();
    $("sbg-status").textContent = "已换一个种子（" + state.blob.seed + "），斑点形状已变化；同一参数＋同一种子输出完全一致。";
  });

  $("sbg-copy").addEventListener("click", function () { copyText(currentSvg, "SVG 代码已复制。"); });
  $("sbg-download-svg").addEventListener("click", function () {
    downloadBlob(new Blob([currentSvg], { type: "image/svg+xml;charset=utf-8" }), suggestExportName(state.mode));
    $("sbg-status").textContent = "SVG 文件已下载。";
  });
  $("sbg-download-png").addEventListener("click", downloadPng);
  $("sbg-copy-css").addEventListener("click", function () {
    copyText(buildCssBackground(currentSvg), "CSS 背景代码已复制，粘贴到样式表即用。");
  });
  $("sbg-sample").addEventListener("click", function () {
    if (state.mode === "wave") {
      state.width = WAVE_EXAMPLE.width;
      state.height = WAVE_EXAMPLE.height;
      state.layers = JSON.parse(JSON.stringify(WAVE_EXAMPLE.layers));
      state.background = WAVE_EXAMPLE.background;
      state.transparentBg = false;
    } else {
      state.width = BLOB_EXAMPLE.width;
      state.height = BLOB_EXAMPLE.height;
      state.blob = { color: BLOB_EXAMPLE.color, opacity: BLOB_EXAMPLE.opacity, points: BLOB_EXAMPLE.points, smoothness: BLOB_EXAMPLE.smoothness, seed: BLOB_EXAMPLE.seed };
      state.transparentBg = true;
    }
    syncFormFromState();
    render();
    $("sbg-status").textContent = "示例已载入（" + (state.mode === "wave" ? "3 层波形预设" : "斑点预设") + "）。";
  });

  syncFormFromState();
  render();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
})();
