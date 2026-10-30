/* 截图 3D 样机渲染器（screenshot_mockup_3d）
 *
 * 上传截图 → CSS 3D 透视实时预览 → canvas 渲染 → 下载 PNG，截图零上传、零依赖、零 CDN。
 * 4 样机场景：browser-frame（自绘浏览器窗口框）／phone-frame（自绘手机机身框）／
 * float-3d（悬浮 3D 透视卡片）／flat-shadow（平面大阴影展示图）。
 *
 * 纯函数全部经 module.exports 暴露，node tests/screenshot_mockup_3d.test.js 自测；
 * 浏览器内 init 挂 DOMContentLoaded；无网络请求（零上传、零 fetch/XHR、零 CDN）。
 *
 * 导出约定（家族惯例）：非法输入抛 Error，err.field = "scene" | "param"。
 */
(function () {
"use strict";

var SCENES = ["browser-frame", "phone-frame", "float-3d", "flat-shadow"];

var SCENE_META = {
  "browser-frame": { name: "浏览器窗口", desc: "自绘浏览器窗口框：三点标题栏＋地址栏，适合展示网页截图" },
  "phone-frame":   { name: "手机机身",   desc: "自绘手机机身框：刘海屏＋圆角机身，适合展示移动端截图" },
  "float-3d":      { name: "悬浮 3D 卡片", desc: "悬浮透视卡片：圆角卡片＋大面积投影，适合做封面图" },
  "flat-shadow":   { name: "平面阴影",   desc: "平面大阴影展示图：无机身框，干净背景＋柔光投影" }
};

/* 参数合法区间（与页面滑杆一致） */
var RANGE = {
  rotateX:     [-30, 30],
  rotateY:     [-30, 30],
  perspective: [400, 1600],
  scale:       [0.5, 1.5],
  shadowIntensity: [0, 100]
};

var MAX_EXPORT_LONG_SIDE = 4096; /* 导出分辨率上限：长边 4096px */
var MAX_FILE_SIZE = 20 * 1024 * 1024;
var ACCEPTED_TYPES = { "image/png": true, "image/jpeg": true, "image/webp": true };
var ACCEPTED_EXTS = { png: true, jpg: true, jpeg: true, webp: true };
var HEX_RE = /^#?[0-9a-fA-F]{6}$/;

function ferr(field, msg) {
  var e = new Error(msg || ("invalid " + field));
  e.field = field;
  return e;
}
function isNum(v) { return typeof v === "number" && isFinite(v); }
function r2(v) { return Math.round(v * 100) / 100; }

/* mockupScenes：4 项固定顺序（browser-frame → phone-frame → float-3d → flat-shadow） */
function mockupScenes() {
  return SCENES.map(function (id) {
    return { id: id, name: SCENE_META[id].name, desc: SCENE_META[id].desc };
  });
}

function assertScene(scene) {
  if (SCENES.indexOf(scene) < 0) throw ferr("scene", "未知场景: " + scene);
}

/* defaultMockupParams(scene)：各场景默认参数；未知 scene 抛 Error(err.field="scene") */
function defaultMockupParams(scene) {
  assertScene(scene);
  var p = {
    scene: scene,
    rotateX: 0, rotateY: 0,
    perspective: 900, scale: 1,
    bgMode: "gradient", bgColor1: "#2563EB", bgColor2: "#7C3AED",
    shadowIntensity: 70, reflection: true, frameColor: "#1F2937"
  };
  if (scene === "browser-frame") { p.rotateX = -8; p.rotateY = 14; p.perspective = 1000; }
  else if (scene === "phone-frame") { p.rotateX = 0; p.rotateY = -18; p.perspective = 900; p.scale = 0.95; }
  else if (scene === "float-3d") { p.rotateX = -12; p.rotateY = 24; p.perspective = 900; p.scale = 0.9; }
  else if (scene === "flat-shadow") { p.rotateX = 0; p.rotateY = 0; p.perspective = 1200; p.bgMode = "solid"; p.bgColor1 = "#F3F4F6"; }
  return p;
}

function checkRange(name, v) {
  var r = RANGE[name];
  if (!isNum(v) || v < r[0] || v > r[1]) {
    throw ferr("param", name + " 非法（应为 " + r[0] + "–" + r[1] + "）");
  }
  return v;
}

/* buildTransform(params)：CSS transform 字符串，顺序固定
 * perspective → rotateX → rotateY → scale，例如：
 * buildTransform({rotateX:-12,rotateY:24,perspective:900,scale:0.9})
 *   === "perspective(900px) rotateX(-12deg) rotateY(24deg) scale(0.9)"
 * 越界／缺失／非数字抛 Error(err.field="param") */
function buildTransform(params) {
  if (!params || typeof params !== "object") throw ferr("param", "params 非法");
  var rx = checkRange("rotateX", params.rotateX);
  var ry = checkRange("rotateY", params.rotateY);
  var per = checkRange("perspective", params.perspective);
  var sc = checkRange("scale", params.scale);
  return "perspective(" + String(per) + "px) rotateX(" + String(rx) +
    "deg) rotateY(" + String(ry) + "deg) scale(" + String(sc) + ")";
}

/* normalizeHex：6 位 HEX 归一为大写 #RRGGBB，非法抛 Error(err.field="param") */
function normalizeHex(c) {
  var s = String(c == null ? "" : c).replace(/^\s+|\s+$/g, "");
  if (!HEX_RE.test(s)) throw ferr("param", "颜色非法: " + c);
  if (s.charAt(0) !== "#") s = "#" + s;
  return s.toUpperCase();
}

/* 各场景机身框内边距（单位：s 缩放后的 px） */
function framePadFor(scene, s) {
  if (scene === "browser-frame") return { top: 42 * s, right: 16 * s, bottom: 16 * s, left: 16 * s };
  if (scene === "phone-frame")   return { top: 36 * s, right: 18 * s, bottom: 36 * s, left: 18 * s };
  if (scene === "float-3d")      return { top: 30 * s, right: 30 * s, bottom: 30 * s, left: 30 * s };
  return { top: 40 * s, right: 40 * s, bottom: 40 * s, left: 40 * s }; /* flat-shadow */
}

/* buildCanvasDrawPlan(params, imgW, imgH)：纯对象绘制计划
 * {outW, outH, framePad, imgRect, shadow, reflection}，供导出像素明示。
 * imgRect 宽高比与输入一致；长边超 4096 时等比降采样并置 downscaled=true。 */
function buildCanvasDrawPlan(params, imgW, imgH) {
  if (!params || typeof params !== "object") throw ferr("param", "params 非法");
  assertScene(params.scene);
  checkRange("rotateX", params.rotateX);
  checkRange("rotateY", params.rotateY);
  checkRange("perspective", params.perspective);
  checkRange("scale", params.scale);
  var intensity = params.shadowIntensity;
  if (intensity === undefined || intensity === null) intensity = 70;
  checkRange("shadowIntensity", intensity);
  if (!isNum(imgW) || imgW <= 0) throw ferr("param", "imgW 非法");
  if (!isNum(imgH) || imgH <= 0) throw ferr("param", "imgH 非法");
  normalizeHex(params.frameColor == null ? "#1F2937" : params.frameColor);

  var s = params.scale;
  var w = imgW * s, h = imgH * s;
  var pad = framePadFor(params.scene, s);
  var reflH = params.reflection ? h * 0.35 : 0;
  var k = intensity / 100;
  var margin = 24 + 44 * k; /* 阴影外溢边距 */

  var outW = w + pad.left + pad.right + 2 * margin;
  var outH = h + pad.top + pad.bottom + reflH + 2 * margin;

  var downscaled = false;
  var longSide = Math.max(outW, outH);
  if (longSide > MAX_EXPORT_LONG_SIDE) {
    var f = MAX_EXPORT_LONG_SIDE / longSide;
    outW *= f; outH *= f; w *= f; h *= f; reflH *= f; margin *= f;
    pad = { top: pad.top * f, right: pad.right * f, bottom: pad.bottom * f, left: pad.left * f };
    downscaled = true;
  }

  return {
    outW: Math.round(outW),
    outH: Math.round(outH),
    framePad: { top: r2(pad.top), right: r2(pad.right), bottom: r2(pad.bottom), left: r2(pad.left) },
    imgRect: { x: r2(margin + pad.left), y: r2(margin + pad.top), w: r2(w), h: r2(h) },
    shadow: { blur: r2(52 * s * k), offsetY: r2(26 * s * k), alpha: r2(0.42 * k) },
    reflection: { enabled: !!params.reflection, height: r2(reflH), alpha: 0.3 },
    downscaled: downscaled
  };
}

/* exportFileName(scene)：'mockup-browser-frame.png'；未知 scene 抛 Error(err.field="scene") */
function exportFileName(scene) {
  assertScene(scene);
  return "mockup-" + scene + ".png";
}

/* validateImageFile：PNG/JPG/WebP、≤20MB（家族惯例），返回 {ok, error} */
function validateImageFile(file) {
  if (!file) return { ok: false, error: "未选择文件" };
  var type = file.type || "";
  var name = file.name || "";
  var ext = name.split(".").pop().toLowerCase();
  if (ACCEPTED_TYPES[type] || (type === "" && ACCEPTED_EXTS[ext])) {
    if (file.size > MAX_FILE_SIZE) return { ok: false, error: "文件超过 20MB 上限" };
    return { ok: true, error: "" };
  }
  return { ok: false, error: "仅支持 PNG / JPG / WebP 图片" };
}

var api = {
  mockupScenes: mockupScenes,
  defaultMockupParams: defaultMockupParams,
  buildTransform: buildTransform,
  buildCanvasDrawPlan: buildCanvasDrawPlan,
  exportFileName: exportFileName,
  validateImageFile: validateImageFile,
  normalizeHex: normalizeHex,
  SCENES: SCENES,
  MAX_EXPORT_LONG_SIDE: MAX_EXPORT_LONG_SIDE
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
} else if (typeof window !== "undefined") {
  window.Mockup3D = api;
}

/* ================= 浏览器 UI（DOM 存在时初始化；零网络） ================= */
if (typeof document !== "undefined") {
document.addEventListener("DOMContentLoaded", function () {
  var M = (typeof window.Mockup3D !== "undefined") ? window.Mockup3D : api;
  var $ = function (id) { return document.getElementById(id); };

  var els = {
    file: $("m3d-file"), drop: $("m3d-drop"), sample: $("m3d-sample"),
    stage: $("m3d-stage"), scene3d: $("m3d-scene"), card: $("m3d-card"),
    empty: $("m3d-empty"), pxinfo: $("m3d-pxinfo"), note: $("m3d-note"),
    bgmode: document.querySelectorAll('input[name="m3d-bgmode"]'),
    previewbg: document.querySelectorAll('input[name="m3d-previewbg"]')
  };
  if (!els.file || !els.stage) return; /* 非本工具页 */

  var state = { img: null, name: "", w: 0, h: 0, params: M.defaultMockupParams("browser-frame"), exportMode: "1x" };

  /* ---------- 场景卡片 ---------- */
  var sceneBox = $("m3d-scenes");
  M.mockupScenes().forEach(function (sc) {
    var d = document.createElement("button");
    d.type = "button";
    d.className = "m3d-scene-card" + (sc.id === state.params.scene ? " active" : "");
    d.dataset.scene = sc.id;
    d.innerHTML = '<b>' + sc.name + '</b><span>' + sc.desc + '</span>';
    d.addEventListener("click", function () {
      state.params = M.defaultMockupParams(sc.id);
      syncControls();
      render();
    });
    sceneBox.appendChild(d);
  });

  /* ---------- 参数控件 ---------- */
  var sliders = [
    ["m3d-rotatex", "m3d-rotatex-v", "rotateX", "°"],
    ["m3d-rotatey", "m3d-rotatey-v", "rotateY", "°"],
    ["m3d-perspective", "m3d-perspective-v", "perspective", "px"],
    ["m3d-scale", "m3d-scale-v", "scale", "×"],
    ["m3d-shadow", "m3d-shadow-v", "shadowIntensity", "%"]
  ];
  sliders.forEach(function (cfg) {
    var input = $(cfg[0]);
    input.addEventListener("input", function () {
      state.params[cfg[2]] = parseFloat(input.value);
      $(cfg[1]).textContent = input.value + cfg[3];
      render();
    });
  });
  function syncControls() {
    document.querySelectorAll(".m3d-scene-card").forEach(function (c) {
      c.classList.toggle("active", c.dataset.scene === state.params.scene);
    });
    sliders.forEach(function (cfg) {
      var v = state.params[cfg[2]];
      $(cfg[0]).value = v;
      $(cfg[1]).textContent = v + cfg[3];
    });
    $("m3d-bg1").value = state.params.bgColor1;
    $("m3d-bg2").value = state.params.bgColor2;
    $("m3d-framecolor").value = state.params.frameColor;
    $("m3d-reflection").checked = !!state.params.reflection;
    document.querySelectorAll('input[name="m3d-bgmode"]').forEach(function (r) {
      r.checked = (r.value === state.params.bgMode);
    });
  }
  ["m3d-bg1", "m3d-bg2"].forEach(function (id, i) {
    $(id).addEventListener("input", function (e) {
      try {
        var v = M.normalizeHex(e.target.value);
        state.params[i === 0 ? "bgColor1" : "bgColor2"] = v;
        render();
      } catch (err) { /* 输入中途非法值忽略 */ }
    });
  });
  $("m3d-framecolor").addEventListener("input", function (e) {
    try { state.params.frameColor = M.normalizeHex(e.target.value); render(); }
    catch (err) { /* 忽略 */ }
  });
  els.bgmode.forEach(function (r) {
    r.addEventListener("change", function () {
      state.params.bgMode = document.querySelector('input[name="m3d-bgmode"]:checked').value;
      render();
    });
  });
  $("m3d-reflection").addEventListener("change", function (e) {
    state.params.reflection = e.target.checked;
    render();
  });
  els.previewbg.forEach(function (r) { r.addEventListener("change", render); });
  document.querySelectorAll('input[name="m3d-exsize"]').forEach(function (r) {
    r.addEventListener("change", function () {
      state.exportMode = document.querySelector('input[name="m3d-exsize"]:checked').value;
      render();
    });
  });

  /* ---------- 文件载入 ---------- */
  function loadImageFile(file) {
    var v = M.validateImageFile(file);
    if (!v.ok) { setNote(v.error, true); return; }
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      state.img = img; state.name = file.name || "screenshot.png";
      state.w = img.naturalWidth; state.h = img.naturalHeight;
      URL.revokeObjectURL(url);
      setNote("", false);
      render();
    };
    img.onerror = function () { URL.revokeObjectURL(url); setNote("图片读取失败，请换一张试试", true); };
    img.src = url;
  }
  els.file.addEventListener("change", function (e) {
    if (e.target.files && e.target.files[0]) loadImageFile(e.target.files[0]);
    e.target.value = "";
  });
  els.drop.addEventListener("click", function () { els.file.click(); });
  ["dragover", "dragenter"].forEach(function (ev) {
    els.drop.addEventListener(ev, function (e) { e.preventDefault(); els.drop.classList.add("dragover"); });
  });
  ["dragleave", "drop"].forEach(function (ev) {
    els.drop.addEventListener(ev, function (e) { e.preventDefault(); els.drop.classList.remove("dragover"); });
  });
  els.drop.addEventListener("drop", function (e) {
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) loadImageFile(f);
  });

  /* 示例截图：canvas 自绘一张代码编辑器截图（零外部资源） */
  els.sample.addEventListener("click", function (e) {
    e.stopPropagation();
    var c = document.createElement("canvas");
    c.width = 1280; c.height = 800;
    var x = c.getContext("2d");
    x.fillStyle = "#0f172a"; x.fillRect(0, 0, 1280, 800);
    x.fillStyle = "#1e293b"; x.fillRect(0, 0, 1280, 56);
    ["#ef4444", "#f59e0b", "#22c55e"].forEach(function (col, i) {
      x.fillStyle = col; x.beginPath(); x.arc(32 + i * 28, 28, 8, 0, 7); x.fill();
    });
    x.fillStyle = "#334155";
    roundRect(x, 120, 16, 420, 26, 13); x.fill();
    var lines = ["const mockup = render(screenshot);", "mockup.rotate({ x: -12, y: 24 });",
      "mockup.shadow({ blur: 52, alpha: 0.42 });", "await mockup.exportPNG(\"mockup.png\"); // 零上传"];
    var colors = ["#7dd3fc", "#c4b5fd", "#86efac", "#64748b"];
    x.font = "26px ui-monospace, Menlo, Consolas, monospace";
    lines.forEach(function (ln, i) {
      x.fillStyle = "#1e293b"; roundRect(x, 80, 110 + i * 62, 700 + (i % 2) * 180, 40, 8); x.fill();
      x.fillStyle = colors[i]; x.fillText(ln, 100, 140 + i * 62);
    });
    x.fillStyle = "#1e293b"; roundRect(x, 80, 420, 520, 200, 12); x.fill();
    x.fillStyle = "#38bdf8"; x.fillRect(100, 440, 300, 14);
    x.fillStyle = "#a78bfa"; x.fillRect(100, 470, 420, 14);
    x.fillStyle = "#34d399"; x.fillRect(100, 500, 240, 14);
    x.fillStyle = "#475569"; x.font = "22px sans-serif";
    x.fillText("示例截图 · 本地 canvas 自绘", 80, 680);
    var img = new Image();
    img.onload = function () {
      state.img = img; state.name = "sample.png";
      state.w = 1280; state.h = 800;
      setNote("", false);
      render();
    };
    img.src = c.toDataURL("image/png");
  });

  function roundRect(x, px, py, w, h, rad) {
    x.beginPath();
    x.moveTo(px + rad, py);
    x.arcTo(px + w, py, px + w, py + h, rad);
    x.arcTo(px + w, py + h, px, py + h, rad);
    x.arcTo(px, py + h, px, py, rad);
    x.arcTo(px, py, px + w, py, rad);
    x.closePath();
  }

  function setNote(msg, isErr) {
    els.note.textContent = msg;
    els.note.style.display = msg ? "block" : "none";
    els.note.className = "m3d-note" + (isErr ? " err" : "");
  }

  /* ---------- 预览渲染 ---------- */
  function stageBackground() {
    var mode = document.querySelector('input[name="m3d-previewbg"]:checked').value;
    var p = state.params;
    if (mode === "dark") return "#111827";
    if (mode === "light") return "#f3f4f6";
    if (p.bgMode === "solid") return p.bgColor1;
    return "linear-gradient(135deg," + p.bgColor1 + "," + p.bgColor2 + ")";
  }

  function frameHTML() {
    var p = state.params;
    var fc = p.frameColor;
    var imgTag = '<img class="m3d-shot" alt="截图预览">';
    if (p.scene === "browser-frame") {
      return '<div class="m3d-browser" style="border-color:' + fc + '">' +
        '<div class="m3d-browser-bar" style="background:' + fc + '">' +
        '<span class="m3d-dot" style="background:#ef4444"></span>' +
        '<span class="m3d-dot" style="background:#f59e0b"></span>' +
        '<span class="m3d-dot" style="background:#22c55e"></span>' +
        '<span class="m3d-url">example.com/screenshot</span></div>' +
        '<div class="m3d-screen">' + imgTag + '</div></div>';
    }
    if (p.scene === "phone-frame") {
      return '<div class="m3d-phone" style="background:' + fc + ';border-color:' + fc + '">' +
        '<div class="m3d-notch"></div><div class="m3d-screen">' + imgTag + '</div>' +
        '<div class="m3d-homebar"></div></div>';
    }
    if (p.scene === "float-3d") {
      return '<div class="m3d-float">' + imgTag + '</div>';
    }
    return '<div class="m3d-flat">' + imgTag + '</div>';
  }

  function render() {
    var p = state.params;
    /* 舞台背景 */
    els.stage.style.background = stageBackground();
    els.scene3d.style.perspective = p.perspective + "px";

    var has = !!state.img;
    els.empty.style.display = has ? "none" : "flex";
    els.card.style.display = has ? "block" : "none";

    if (has) {
      els.card.innerHTML = frameHTML();
      var shot = els.card.querySelector(".m3d-shot");
      shot.src = state.img.src;
      /* 预览按比例缩放：最长边 460px */
      var fit = Math.min(1, 460 / Math.max(state.w, state.h));
      shot.style.width = Math.round(state.w * fit) + "px";
      shot.style.height = Math.round(state.h * fit) + "px";
      /* 3D 变换 */
      try {
        els.card.style.transform = M.buildTransform(p);
      } catch (e) { els.card.style.transform = "none"; }
      /* 阴影 */
      var k = p.shadowIntensity / 100;
      var sh = "0 " + Math.round(26 * k) + "px " + Math.round(52 * k) + "px rgba(0,0,0," + (0.42 * k).toFixed(2) + ")";
      var frameEl = els.card.firstElementChild;
      if (frameEl) frameEl.style.boxShadow = sh;
      /* 反射 */
      els.card.style.webkitBoxReflect = p.reflection ?
        "below 10px linear-gradient(transparent 55%, rgba(0,0,0,0.28))" : "";
      /* 导出像素明示 */
      try {
        var plan = exportPlan();
        var px = plan.outW + " × " + plan.outH + " px";
        if (plan.downscaled) px += "（已降采样，原尺寸超长边 4096px 上限）";
        els.pxinfo.textContent = "实际导出像素：" + px;
      } catch (e) { els.pxinfo.textContent = "实际导出像素：—"; }
    } else {
      els.pxinfo.textContent = "实际导出像素：—";
    }
  }

  /* 导出计划（含导出尺寸档位） */
  function exportPlan() {
    var p = JSON.parse(JSON.stringify(state.params));
    if (state.exportMode === "2x") {
      p.scale = Math.min(1.5, p.scale * 2);
    } else if (state.exportMode === "1920") {
      var base = M.buildCanvasDrawPlan(state.params, state.w, state.h);
      var f = 1920 / Math.max(base.outW, base.outH);
      p.scale = Math.min(1.5, Math.max(0.5, state.params.scale * f));
    }
    return M.buildCanvasDrawPlan(p, state.w, state.h);
  }

  /* ---------- canvas 导出 ---------- */
  $("m3d-download").addEventListener("click", function () {
    if (!state.img) { setNote("请先上传截图或载入示例图", true); return; }
    setNote("", false);
    var p = JSON.parse(JSON.stringify(state.params));
    if (state.exportMode === "2x") p.scale = Math.min(1.5, p.scale * 2);
    else if (state.exportMode === "1920") {
      var b0 = M.buildCanvasDrawPlan(state.params, state.w, state.h);
      p.scale = Math.min(1.5, Math.max(0.5, state.params.scale * (1920 / Math.max(b0.outW, b0.outH))));
    }
    var plan;
    try { plan = M.buildCanvasDrawPlan(p, state.w, state.h); }
    catch (e) { setNote("参数非法，无法导出", true); return; }

    var cv = document.createElement("canvas");
    cv.width = plan.outW; cv.height = plan.outH;
    var ctx = cv.getContext("2d");

    /* 背景 */
    if (p.bgMode === "solid") { ctx.fillStyle = p.bgColor1; ctx.fillRect(0, 0, cv.width, cv.height); }
    else {
      var g = ctx.createLinearGradient(0, 0, cv.width, cv.height);
      g.addColorStop(0, p.bgColor1); g.addColorStop(1, p.bgColor2);
      ctx.fillStyle = g; ctx.fillRect(0, 0, cv.width, cv.height);
    }

    /* 带 3D 透视近似的截图（切片扭曲） */
    var warped = warpPerspective(state.img, Math.round(plan.imgRect.w), Math.round(plan.imgRect.h),
      p.rotateX, p.rotateY, p.perspective);

    /* 机身框绘制 */
    var fx = plan.imgRect.x, fy = plan.imgRect.y, fw = plan.imgRect.w, fh = plan.imgRect.h;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0," + plan.shadow.alpha + ")";
    ctx.shadowBlur = plan.shadow.blur;
    ctx.shadowOffsetY = plan.shadow.offsetY;
    drawFrame(ctx, p, plan, warped, fx, fy, fw, fh);
    ctx.restore();

    /* 反射 */
    if (plan.reflection.enabled && plan.reflection.height > 0) {
      var rh = Math.round(plan.reflection.height);
      var rc = document.createElement("canvas");
      rc.width = Math.round(fw); rc.height = rh;
      var rx2 = rc.getContext("2d");
      rx2.save();
      rx2.translate(0, rh); rx2.scale(1, -1);
      rx2.drawImage(warped, 0, warped.height - rh, warped.width, rh, 0, 0, warped.width, rh);
      rx2.restore();
      var rg = rx2.createLinearGradient(0, 0, 0, rh);
      rg.addColorStop(0, "rgba(0,0,0," + plan.reflection.alpha + ")");
      rg.addColorStop(1, "rgba(0,0,0,0)");
      rx2.globalCompositeOperation = "destination-in";
      rx2.fillStyle = rg; rx2.fillRect(0, 0, rc.width, rh);
      ctx.drawImage(rc, Math.round(fx), Math.round(fy + fh + 6));
    }

    cv.toBlob(function (blob) {
      if (!blob) { setNote("导出失败：浏览器无法生成 PNG，请换用 Chromium 系浏览器重试", true); return; }
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = M.exportFileName(p.scene);
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      setNote("已导出 " + M.exportFileName(p.scene) + "（" + plan.outW + " × " + plan.outH + "）", false);
    }, "image/png");
  });

  /* 切片透视扭曲：先按列做 rotateY，再按行做 rotateX（近似 CSS 3D） */
  function warpPerspective(img, w, h, rotateX, rotateY, perspective) {
    var N = 64;
    var ry = rotateY * Math.PI / 180, rx = rotateX * Math.PI / 180;
    var natW = img.naturalWidth || w, natH = img.naturalHeight || h;
    var pw = document.createElement("canvas"); pw.width = w; pw.height = h;
    var px = pw.getContext("2d");
    if (rotateY !== 0) {
      var ssw = natW / N, dsw = w / N;
      for (var i = 0; i < N; i++) {
        var cx = ((i + 0.5) / N - 0.5) * w;
        var f = perspective / (perspective - cx * Math.tan(ry));
        var dw = dsw * f, dx = w / 2 + cx * f - dw / 2;
        px.drawImage(img, i * ssw, 0, ssw + 0.6, natH, dx, 0, dw, h);
      }
    } else {
      px.drawImage(img, 0, 0, natW, natH, 0, 0, w, h);
    }
    if (rotateX === 0) return pw;
    var out = document.createElement("canvas"); out.width = w; out.height = h;
    var ox = out.getContext("2d");
    var sh = h / N;
    for (var j = 0; j < N; j++) {
      var cy = ((j + 0.5) / N - 0.5) * h;
      var f2 = perspective / (perspective - cy * Math.tan(rx));
      var dh = sh * f2, dy = h / 2 + cy * f2 - dh / 2;
      ox.drawImage(pw, 0, j * sh, w, sh + 0.5, 0, dy, w, dh);
    }
    return out;
  }

  /* 机身框绘制（自绘 CSS/canvas，非真实设备照片级还原） */
  function drawFrame(ctx, p, plan, imgCv, fx, fy, fw, fh) {
    var s = p.scale;
    var fc = p.frameColor;
    function rr(x, y, w, h, rad) {
      ctx.beginPath();
      ctx.moveTo(x + rad, y);
      ctx.arcTo(x + w, y, x + w, y + h, rad);
      ctx.arcTo(x + w, y + h, x, y + h, rad);
      ctx.arcTo(x, y + h, x, y, rad);
      ctx.arcTo(x, y, x + w, y, rad);
      ctx.closePath();
    }
    if (p.scene === "browser-frame") {
      var barH = plan.framePad.top, side = plan.framePad.left;
      ctx.fillStyle = fc;
      rr(fx - side, fy - barH, fw + side * 2, fh + barH + side, 10 * s); ctx.fill();
      /* 标题栏三点 + 地址栏 */
      var cy = fy - barH / 2;
      ["#ef4444", "#f59e0b", "#22c55e"].forEach(function (col, i) {
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(fx - side + 16 * s + i * 20 * s, cy, 5.5 * s, 0, 7); ctx.fill();
      });
      ctx.fillStyle = "rgba(255,255,255,0.14)";
      rr(fx - side + 76 * s, cy - 11 * s, fw - 60 * s, 22 * s, 11 * s); ctx.fill();
      ctx.drawImage(imgCv, fx, fy, fw, fh);
    } else if (p.scene === "phone-frame") {
      var pad = plan.framePad;
      ctx.fillStyle = fc;
      rr(fx - pad.left, fy - pad.top, fw + pad.left + pad.right, fh + pad.top + pad.bottom, 26 * s); ctx.fill();
      /* 刘海 */
      ctx.fillStyle = "#0b0f16";
      rr(fx + fw / 2 - 52 * s, fy - pad.top + 7 * s, 104 * s, 20 * s, 10 * s); ctx.fill();
      /* home 条 */
      rr(fx + fw / 2 - 44 * s, fy + fh + pad.bottom - 13 * s, 88 * s, 5 * s, 2.5 * s); ctx.fill();
      ctx.save();
      rr(fx, fy, fw, fh, 10 * s); ctx.clip();
      ctx.drawImage(imgCv, fx, fy, fw, fh);
      ctx.restore();
    } else if (p.scene === "float-3d") {
      ctx.save();
      rr(fx, fy, fw, fh, 18 * s); ctx.clip();
      ctx.drawImage(imgCv, fx, fy, fw, fh);
      ctx.restore();
    } else {
      ctx.save();
      rr(fx, fy, fw, fh, 8 * s); ctx.clip();
      ctx.drawImage(imgCv, fx, fy, fw, fh);
      ctx.restore();
    }
  }

  syncControls();
  render();
});
}
})();
