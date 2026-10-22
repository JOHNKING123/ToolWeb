/* 视频帧提取器（video_frame_extractor）：本地视频三模式逐帧提取 / 缩略图网格 / PNG-JPEG 下载
*
* 功能：
*  1) 输入：拖拽＋文件选择（mp4/webm/mov 等浏览器可解码格式），<video> 本地解码，
*     objectURL 全程本地，纯前端零上传（脚本内无任何网络请求 API）。
*  2) 三模式（标签页切换）：
*     ① 等间隔抽帧：输入帧数 N（默认 12），按 duration*i/(N+1) 均匀时间点 seek 抓帧；
*        或按「每 X 秒一帧」模式。
*     ② 精确抓帧：多行时间点列表（支持 hh:mm:ss.mmm / mm:ss.mmm / mm:ss / 纯秒小数），
*        seek 到时间点抓帧，输出时间戳取 video.currentTime 实际值（误差≤0.2s）。
*     ③ 差异度扫描：按间隔 S 秒采样全片帧，计算相邻帧像素差异度，输出差异最大的 K 帧
*        （默认 12），按差异度降序排列，适配精彩画面/场景切换抓取。
*  3) 输出：缩略图网格＋时间戳（模式③附差异度），点击缩略图预览大图；
*     单张 PNG/JPEG 下载；全选一键逐个下载（a[download] 逐个触发，不依赖 ZIP 库）；
*     清空重选。seek 抓帧期间进度条提示；解码失败/时长未知友好错误提示。
* 纯函数全部经 module.exports 暴露，node tests/video_frame_extractor.test.js 自测；
* 浏览器内 init 挂 DOMContentLoaded；无网络请求（零上传）。
*/
(function () {
"use strict";

/* ================= 1. 基础 ================= */
var LS_KEY = "tw_video_frame_extractor_v1";
var MAX_OUT_EDGE = 1280;   /* 输出帧最大边（px），超则等比缩小，提速+省内存 */
var DIFF_STRIDE = 8;       /* 差异度计算降采样步长（像素） */
var SEEK_TIMEOUT = 12000;  /* 单次 seek 超时 ms */
var MAX_SCAN_SAMPLES = 600;/* 差异度扫描采样上限（超则提示缩短间隔） */

function clampNum(v, def, min, max) {
  var x = parseFloat(v);
  if (!isFinite(x)) return def;
  if (x < min) return min;
  if (x > max) return max;
  return x;
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/* 文件名清理：去扩展名＋替换 Windows/URL 非法字符 */
function cleanStem(name) {
  var base = String(name == null ? "video" : name).replace(/\.[^.\\/]*$/, "");
  base = base.replace(/[\\/:*?"<>|\s]+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  return base || "video";
}

/* ================= 2. 时间点解析与格式化 ================= */

/* 解析时间点：支持 "hh:mm:ss.mmm" / "mm:ss.mmm" / "mm:ss" / "1:02:03" / "90" / "90.5"
* 返回秒数（float），非法返回 NaN */
function parseTimestamp(raw) {
  var s = String(raw == null ? "" : raw).trim();
  if (!s) return NaN;
  if (/^[+-]/.test(s)) return NaN;
  var parts = s.split(":");
  if (parts.length > 3) return NaN;
  var nums = [];
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i].trim();
    if (p === "" || !/^\d+(\.\d{1,3})?$/.test(p)) return NaN;
    nums.push(parseFloat(p));
  }
  if (parts.length === 3) {
    if (nums[1] >= 60 || nums[2] >= 60) return NaN;
    return nums[0] * 3600 + nums[1] * 60 + nums[2];
  }
  if (parts.length === 2) {
    if (nums[1] >= 60) return NaN;
    return nums[0] * 60 + nums[1];
  }
  return nums[0];
}

/* 秒 → "hh:mm:ss.mmm"（有小时才显示小时位），用于界面时间戳 */
function formatTimestamp(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  var ms = Math.round(sec * 1000);
  var h = Math.floor(ms / 3600000);
  var m = Math.floor((ms % 3600000) / 60000);
  var s = Math.floor((ms % 60000) / 1000);
  var r = ms % 1000;
  function p2(n) { return (n < 10 ? "0" : "") + n; }
  function p3(n) { return (n < 10 ? "00" : n < 100 ? "0" : "") + n; }
  var mmss = p2(m) + ":" + p2(s) + "." + p3(r);
  return h > 0 ? p2(h) + ":" + mmss : mmss;
}

/* 秒 → 文件名友好 "hh-mm-ss-mmm"（冒号/点全换连字符） */
function formatFileTimestamp(sec) {
  return formatTimestamp(sec).replace(/[:.]/g, "-");
}

/* 解析多行时间点列表（按行/逗号/分号分隔），返回 {points:[秒], bad:[原文本]} */
function parseTimestampList(text) {
  var points = [], bad = [];
  var tokens = String(text == null ? "" : text).split(/[\r\n,;，；]+/);
  for (var i = 0; i < tokens.length; i++) {
    var t = tokens[i].trim();
    if (!t) continue;
    var v = parseTimestamp(t);
    if (isFinite(v)) points.push(v);
    else bad.push(t);
  }
  return { points: points, bad: bad };
}

/* ================= 3. 时间点生成 ================= */

/* 等间隔抽帧：duration 秒片长抽 N 帧 → duration*i/(N+1), i=1..N
* 单调递增、覆盖全片（首>0、末<duration） */
function evenTimepoints(duration, n) {
  duration = parseFloat(duration);
  n = Math.floor(n);
  if (!isFinite(duration) || duration <= 0 || !isFinite(n) || n <= 0) return [];
  var pts = [];
  for (var i = 1; i <= n; i++) pts.push(duration * i / (n + 1));
  return pts;
}

/* 每 X 秒一帧：X, 2X, ... < duration */
function intervalTimepoints(duration, everyX) {
  duration = parseFloat(duration);
  everyX = parseFloat(everyX);
  if (!isFinite(duration) || duration <= 0 || !isFinite(everyX) || everyX <= 0) return [];
  var pts = [];
  for (var t = everyX; t < duration - 0.05; t += everyX) pts.push(t);
  return pts;
}

/* 差异度扫描采样点：间隔 S 秒 → S, 2S, ... < duration（含首帧 0.05s 兜底） */
function scanTimepoints(duration, step) {
  duration = parseFloat(duration);
  step = parseFloat(step);
  if (!isFinite(duration) || duration <= 0 || !isFinite(step) || step <= 0) return [];
  var pts = [0.05];
  for (var t = step; t < duration - 0.05; t += step) pts.push(t);
  return pts;
}

/* ================= 4. 相邻帧差异度 ================= */

/* frameDiffScore(prev, curr, stride)：prev/curr 为同尺寸 Uint8ClampedArray(RGBA)。
* 降采样（每 stride 像素取一个）算灰度平均绝对差，归一化到 0..1。
* 相同帧→0；差异越大→越接近 1。 */
function frameDiffScore(prev, curr, stride) {
  if (!prev || !curr || prev.length !== curr.length || prev.length === 0) return 0;
  stride = Math.max(1, Math.floor(stride || DIFF_STRIDE));
  var step = stride * 4, n = prev.length;
  var sum = 0, cnt = 0;
  for (var i = 0; i + 2 < n; i += step) {
    var g1 = (prev[i] + prev[i + 1] + prev[i + 2]) / 3;
    var g2 = (curr[i] + curr[i + 1] + curr[i + 2]) / 3;
    sum += Math.abs(g1 - g2);
    cnt++;
  }
  if (cnt === 0) return 0;
  var v = (sum / cnt) / 255;
  return v > 1 ? 1 : v;
}

/* topKByDiff(frames, k)：frames 为 [{t, score, ...}]，按 score 降序取前 K 个。
* k 越界钳制；返回新数组（不改原数组）。 */
function topKByDiff(frames, k) {
  k = Math.floor(k);
  if (!frames || !frames.length || !isFinite(k) || k <= 0) return [];
  var sorted = frames.slice().sort(function (a, b) { return b.score - a.score; });
  return sorted.slice(0, Math.min(k, sorted.length));
}

/* ================= 5. 导出命名 ================= */

/* buildFileName(stem, t, ext)：如 video_frame_01-02-03-456.png */
function buildFileName(stem, t, ext) {
  ext = String(ext || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  return cleanStem(stem) + "_frame_" + formatFileTimestamp(t) + "." + ext;
}

/* buildExportList(frames, stem, ext)：frames=[{t,score?}] → [{fileName, t, score}] */
function buildExportList(frames, stem, ext) {
  var out = [];
  for (var i = 0; i < (frames || []).length; i++) {
    var f = frames[i];
    out.push({ fileName: buildFileName(stem, f.t, ext), t: f.t, score: f.score });
  }
  return out;
}

/* ================= 6. 浏览器：抓帧引擎 ================= */
function hasDOM() {
  return typeof document !== "undefined" && typeof window !== "undefined";
}

var S = null; /* 页面状态，init 时创建 */

function toast(msg) {
  var el = document.getElementById("vfe-toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(function () { el.classList.remove("show"); }, 2600);
}

function setProgress(cur, total, label) {
  var wrap = document.getElementById("vfe-progress-wrap");
  var bar = document.getElementById("vfe-progress-bar");
  var txt = document.getElementById("vfe-progress-text");
  if (!wrap || !bar) return;
  if (total <= 0) { wrap.style.display = "none"; return; }
  wrap.style.display = "block";
  var pct = Math.min(100, Math.round(cur / total * 100));
  bar.style.width = pct + "%";
  if (txt) txt.textContent = (label || "抓帧中") + " " + cur + " / " + total + "（" + pct + "%）";
}

/* seek 到 t 秒后 resolve(video)，超时/异常 reject */
function seekTo(video, t) {
  return new Promise(function (resolve, reject) {
    var done = false;
    var timer = setTimeout(function () {
      if (done) return;
      done = true;
      video.removeEventListener("seeked", onSeeked);
      reject(new Error("seek 超时（" + t.toFixed(2) + "s），视频可能损坏或编码异常"));
    }, SEEK_TIMEOUT);
    function onSeeked() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      video.removeEventListener("seeked", onSeeked);
      resolve(video);
    }
    video.addEventListener("seeked", onSeeked);
    try {
      video.currentTime = Math.max(0, t);
    } catch (e) {
      done = true;
      clearTimeout(timer);
      video.removeEventListener("seeked", onSeeked);
      reject(e);
    }
  });
}

/* 从当前 video 帧抓取：返回 Promise<{blob, dataUrl, width, height, t}> */
function captureFrame(video, mime, quality) {
  return new Promise(function (resolve, reject) {
    try {
      var vw = video.videoWidth, vh = video.videoHeight;
      if (!vw || !vh) { reject(new Error("视频尺寸不可用")); return; }
      var scale = Math.min(1, MAX_OUT_EDGE / Math.max(vw, vh));
      var w = Math.max(2, Math.round(vw * scale));
      var h = Math.max(2, Math.round(vh * scale));
      var canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      var ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(video, 0, 0, w, h);
      var done = function (blob) {
        if (!blob) { reject(new Error("帧编码失败")); return; }
        resolve({
          blob: blob,
          url: URL.createObjectURL(blob),
          dataUrl: canvas.toDataURL(mime, quality),
          imageData: ctx.getImageData(0, 0, w, h),
          width: w, height: h,
          t: video.currentTime
        });
      };
      if (canvas.toBlob) canvas.toBlob(done, mime, quality);
      else {
        /* 极老浏览器兜底：dataURL → blob */
        var du = canvas.toDataURL(mime, quality);
        var bin = atob(du.split(",")[1]);
        var arr = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        done(new Blob([arr], { type: mime }));
      }
    } catch (e) { reject(e); }
  });
}

/* 批量抓帧：points 时间点数组 → [{t, blob, url, dataUrl, imageData, width, height, score?}] */
function captureBatch(video, points, mime, quality, onStep) {
  var out = [];
  var chain = Promise.resolve();
  points.forEach(function (pt, idx) {
    chain = chain.then(function () {
      return seekTo(video, pt).then(function () {
        return captureFrame(video, mime, quality);
      }).then(function (fr) {
        fr.t = video.currentTime; /* 实际抓到的时间戳 */
        out.push(fr);
        if (onStep) onStep(idx + 1, points.length);
      });
    });
  });
  return chain.then(function () { return out; });
}

function fmtMime() {
  var fmt = document.querySelector('input[name="vfe-format"]:checked');
  return (fmt && fmt.value === "jpeg") ? "image/jpeg" : "image/png";
}
function fmtExt() { return fmtMime() === "image/jpeg" ? "jpeg" : "png"; }
function jpegQuality() {
  var q = document.getElementById("vfe-quality");
  return q ? clampNum(q.value, 0.92, 0.5, 1) : 0.92;
}

/* ================= 7. 浏览器：UI ================= */

function setModeTab(name) {
  var tabs = document.querySelectorAll(".vfe-tab");
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].classList.toggle("active", tabs[i].getAttribute("data-tab") === name);
  }
  var panes = document.querySelectorAll(".vfe-pane");
  for (var j = 0; j < panes.length; j++) {
    panes[j].style.display = panes[j].getAttribute("data-pane") === name ? "block" : "none";
  }
  S.mode = name;
}

function updateVideoInfo() {
  var info = document.getElementById("vfe-video-info");
  if (!info || !S.file) return;
  var v = S.video;
  info.innerHTML =
    "<b>" + esc(S.file.name) + "</b> · " +
    esc((S.file.size / 1048576).toFixed(2) + " MB") + " · " +
    "时长 <b>" + esc(formatTimestamp(v.duration)) + "</b> · " +
    "分辨率 " + v.videoWidth + "×" + v.videoHeight;
}

function clearFrames() {
  if (!S) return;
  for (var i = 0; i < S.frames.length; i++) {
    try { URL.revokeObjectURL(S.frames[i].url); } catch (e) {}
  }
  S.frames = [];
  var grid = document.getElementById("vfe-grid");
  if (grid) grid.innerHTML = '<div class="vfe-empty">暂无帧 —— 选择视频并执行提取后，缩略图将显示在这里</div>';
  var bar = document.getElementById("vfe-result-bar");
  if (bar) bar.style.display = "none";
  setProgress(0, 0);
}

function downloadBlob(url, fileName) {
  var a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { document.body.removeChild(a); }, 400);
}

/* 渲染缩略图网格 */
function renderGrid() {
  var grid = document.getElementById("vfe-grid");
  var bar = document.getElementById("vfe-result-bar");
  var cnt = document.getElementById("vfe-result-count");
  if (!grid) return;
  if (!S.frames.length) { clearFrames(); return; }
  var html = "";
  for (var i = 0; i < S.frames.length; i++) {
    (function (f, idx) {
      var scoreHtml = (S.mode === "scan" && isFinite(f.score))
        ? '<span class="vfe-score">差异度 ' + (f.score * 100).toFixed(1) + "%</span>" : "";
      html += '<div class="vfe-card" data-idx="' + idx + '">' +
        '<label class="vfe-check"><input type="checkbox" data-sel="' + idx + '" checked></label>' +
        '<img src="' + f.url + '" alt="帧 ' + esc(formatTimestamp(f.t)) + '" loading="lazy">' +
        '<div class="vfe-meta"><span class="vfe-ts">' + esc(formatTimestamp(f.t)) + "</span>" + scoreHtml + "</div>" +
        '<div class="vfe-card-actions">' +
        '<button type="button" class="vfe-mini" data-dl="' + idx + '">下载</button>' +
        "</div></div>";
    })(S.frames[i], i);
  }
  grid.innerHTML = html;
  if (bar) bar.style.display = "flex";
  if (cnt) cnt.textContent = "共 " + S.frames.length + " 帧";

  /* 事件委托：点击卡片预览 / 下载按钮 */
  grid.onclick = function (ev) {
    var t = ev.target;
    if (t.getAttribute("data-dl") != null) {
      ev.stopPropagation();
      var f = S.frames[+t.getAttribute("data-dl")];
      downloadBlob(f.url, buildFileName(S.file.name, f.t, fmtExt()));
      return;
    }
    if (t.getAttribute("data-sel") != null) { ev.stopPropagation(); return; }
    var card = t.closest ? t.closest(".vfe-card") : null;
    if (card) openPreview(+card.getAttribute("data-idx"));
  };
}

function openPreview(idx) {
  var f = S.frames[idx];
  if (!f) return;
  var ov = document.getElementById("vfe-preview-ov");
  var img = document.getElementById("vfe-preview-img");
  var cap = document.getElementById("vfe-preview-cap");
  var dl = document.getElementById("vfe-preview-dl");
  if (!ov || !img) return;
  img.src = f.dataUrl || f.url;
  if (cap) cap.textContent = formatTimestamp(f.t) + " · " + f.width + "×" + f.height +
    (isFinite(f.score) ? " · 差异度 " + (f.score * 100).toFixed(1) + "%" : "");
  if (dl) dl.onclick = function () { downloadBlob(f.url, buildFileName(S.file.name, f.t, fmtExt())); };
  ov.style.display = "flex";
}
function closePreview() {
  var ov = document.getElementById("vfe-preview-ov");
  if (ov) { ov.style.display = "none"; var img = document.getElementById("vfe-preview-img"); if (img) img.src = ""; }
}

function setBusy(busy) {
  var btns = document.querySelectorAll("[data-vfe-run]");
  for (var i = 0; i < btns.length; i++) btns[i].disabled = !!busy;
  var drop = document.getElementById("vfe-drop");
  if (drop) drop.classList.toggle("busy", !!busy);
}

/* 三种提取流程 */
function runEven() {
  var n, pts;
  var useInterval = document.getElementById("vfe-even-mode-interval").checked;
  if (useInterval) {
    var everyX = clampNum(document.getElementById("vfe-every-x").value, 5, 0.5, 3600);
    pts = intervalTimepoints(S.video.duration, everyX);
    if (!pts.length) { toast("按该间隔无可提取帧（视频太短），请调小间隔"); return; }
  } else {
    n = Math.floor(clampNum(document.getElementById("vfe-even-n").value, 12, 1, 200));
    pts = evenTimepoints(S.video.duration, n);
  }
  doExtract(pts, "等间隔抽帧");
}

function runExact() {
  var parsed = parseTimestampList(document.getElementById("vfe-exact-list").value);
  if (parsed.bad.length) {
    toast("以下时间点格式无法识别，已跳过：" + parsed.bad.slice(0, 3).join("、") +
      (parsed.bad.length > 3 ? " 等" + parsed.bad.length + "个" : ""));
  }
  var dur = S.video.duration;
  var pts = [];
  for (var i = 0; i < parsed.points.length; i++) {
    var p = parsed.points[i];
    if (p < 0 || p > dur) { toast("时间点 " + formatTimestamp(p) + " 超出视频时长，已跳过"); continue; }
    pts.push(p);
  }
  if (!pts.length) { toast("没有有效的时间点可提取"); return; }
  doExtract(pts, "精确抓帧");
}

function runScan() {
  var step = clampNum(document.getElementById("vfe-scan-step").value, 1, 0.2, 60);
  var k = Math.floor(clampNum(document.getElementById("vfe-scan-k").value, 12, 1, 200));
  var pts = scanTimepoints(S.video.duration, step);
  if (pts.length > MAX_SCAN_SAMPLES) {
    toast("采样点过多（" + pts.length + "），请增大采样间隔（建议 ≥ " +
      Math.ceil(S.video.duration / MAX_SCAN_SAMPLES) + " 秒）");
    return;
  }
  if (pts.length < 3) { toast("视频太短，无法做差异度扫描"); return; }
  doExtract(pts, "差异度扫描", function (frames) {
    /* 计算相邻帧差异度，取 Top K 降序 */
    for (var i = 0; i < frames.length; i++) {
      frames[i].score = i === 0 ? 0 :
        frameDiffScore(frames[i - 1].imageData.data, frames[i].imageData.data, DIFF_STRIDE);
    }
    return topKByDiff(frames, k);
  });
}

function doExtract(points, label, postProcess) {
  if (!S.file) { toast("请先选择视频文件"); return; }
  if (!isFinite(S.video.duration) || S.video.duration <= 0) { toast("视频时长不可用，无法提取"); return; }
  clearFrames();
  setBusy(true);
  setProgress(0, points.length, label);
  var mime = fmtMime(), quality = jpegQuality();
  captureBatch(S.video, points, mime, quality, function (cur, total) {
    setProgress(cur, total, label);
  }).then(function (frames) {
    if (postProcess) frames = postProcess(frames) || frames;
    S.frames = frames;
    setBusy(false);
    setProgress(0, 0);
    if (!frames.length) { toast("未能提取到任何帧"); return; }
    renderGrid();
    toast(label + "完成：共 " + frames.length + " 帧");
  }).catch(function (e) {
    setBusy(false);
    setProgress(0, 0);
    toast("提取失败：" + (e && e.message ? e.message : e));
  });
}

/* 文件载入 */
function loadFile(file) {
  if (!file) return;
  if (!/^video\//.test(file.type) && !/\.(mp4|webm|mov|m4v|ogv|avi|mkv)$/i.test(file.name)) {
    toast("请选择视频文件（mp4 / webm / mov 等浏览器可解码格式）");
    return;
  }
  if (S.objectUrl) { try { URL.revokeObjectURL(S.objectUrl); } catch (e) {} }
  clearFrames();
  S.file = file;
  S.objectUrl = URL.createObjectURL(file);
  var v = S.video;
  v.removeAttribute("src");
  v.load();
  v.src = S.objectUrl;
  var info = document.getElementById("vfe-video-info");
  if (info) info.innerHTML = "正在读取视频信息…";
  document.getElementById("vfe-player-wrap").style.display = "block";
}

function init() {
  S = {
    mode: "even",
    file: null,
    objectUrl: null,
    video: document.getElementById("vfe-video"),
    frames: []
  };

  /* 标签页 */
  var tabs = document.querySelectorAll(".vfe-tab");
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].addEventListener("click", function () { setModeTab(this.getAttribute("data-tab")); });
  }

  /* 拖拽＋文件选择 */
  var drop = document.getElementById("vfe-drop");
  var input = document.getElementById("vfe-file");
  drop.addEventListener("click", function () { if (!drop.classList.contains("busy")) input.click(); });
  input.addEventListener("change", function () { if (input.files[0]) loadFile(input.files[0]); input.value = ""; });
  ["dragenter", "dragover"].forEach(function (ev) {
    drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("over"); });
  });
  ["dragleave", "drop"].forEach(function (ev) {
    drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("over"); });
  });
  drop.addEventListener("drop", function (e) {
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) loadFile(f);
  });

  /* 视频元数据 */
  var v = S.video;
  v.addEventListener("loadedmetadata", function () {
    if (!isFinite(v.duration) || v.duration <= 0) {
      document.getElementById("vfe-video-info").innerHTML =
        '<span style="color:#b91c1c">无法读取视频时长，文件可能损坏或编码不受支持</span>';
      return;
    }
    updateVideoInfo();
    /* 精确抓帧示例时间点提示 */
    var hint = document.getElementById("vfe-exact-hint");
    if (hint) hint.textContent = "视频时长 " + formatTimestamp(v.duration) +
      "，每行/逗号/分号分隔一个时间点，如 00:01:23.500、01:23、83.5";
  });
  v.addEventListener("error", function () {
    document.getElementById("vfe-video-info").innerHTML =
      '<span style="color:#b91c1c">视频解码失败：浏览器不支持该编码，请换 mp4（H.264）/webm 格式重试</span>';
  });

  /* 三模式执行按钮 */
  document.getElementById("vfe-run-even").addEventListener("click", runEven);
  document.getElementById("vfe-run-exact").addEventListener("click", runExact);
  document.getElementById("vfe-run-scan").addEventListener("click", runScan);

  /* 等间隔子模式切换 */
  var rCount = document.getElementById("vfe-even-mode-count");
  var rInt = document.getElementById("vfe-even-mode-interval");
  function syncEvenMode() {
    document.getElementById("vfe-even-count-row").style.display = rCount.checked ? "flex" : "none";
    document.getElementById("vfe-even-interval-row").style.display = rInt.checked ? "flex" : "none";
  }
  rCount.addEventListener("change", syncEvenMode);
  rInt.addEventListener("change", syncEvenMode);
  syncEvenMode();

  /* 结果栏：全选 / 下载所选 / 清空 */
  document.getElementById("vfe-select-all").addEventListener("click", function () {
    var boxes = document.querySelectorAll("[data-sel]");
    for (var i = 0; i < boxes.length; i++) boxes[i].checked = true;
  });
  document.getElementById("vfe-select-none").addEventListener("click", function () {
    var boxes = document.querySelectorAll("[data-sel]");
    for (var j = 0; j < boxes.length; j++) boxes[j].checked = false;
  });
  document.getElementById("vfe-download-sel").addEventListener("click", function () {
    var boxes = document.querySelectorAll("[data-sel]:checked");
    if (!boxes.length) { toast("请先勾选要下载的帧"); return; }
    var ext = fmtExt();
    var list = [];
    for (var i = 0; i < boxes.length; i++) {
      var f = S.frames[+boxes[i].getAttribute("data-sel")];
      if (f) list.push({ f: f, name: buildFileName(S.file.name, f.t, ext) });
    }
    /* 逐个触发 a[download]，间隔 350ms 防浏览器拦截 */
    var idx = 0;
    toast("开始逐个下载 " + list.length + " 张，请勿关闭页面");
    (function next() {
      if (idx >= list.length) { toast("下载完成（" + list.length + " 张）"); return; }
      downloadBlob(list[idx].f.url, list[idx].name);
      idx++;
      setTimeout(next, 350);
    })();
  });
  document.getElementById("vfe-clear").addEventListener("click", function () {
    clearFrames();
    toast("已清空，可重新选择视频或调整参数再提取");
  });

  /* 预览浮层 */
  document.getElementById("vfe-preview-ov").addEventListener("click", function (e) {
    if (e.target.id === "vfe-preview-ov" || e.target.id === "vfe-preview-close") closePreview();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closePreview();
  });

  /* JPEG 质量行显隐 */
  var fmtRadios = document.querySelectorAll('input[name="vfe-format"]');
  function syncQ() {
    var show = fmtMime() === "image/jpeg";
    document.getElementById("vfe-quality-row").style.display = show ? "flex" : "none";
  }
  for (var k = 0; k < fmtRadios.length; k++) fmtRadios[k].addEventListener("change", syncQ);
  syncQ();

  setModeTab("even");
}

if (hasDOM()) {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    LS_KEY: LS_KEY, MAX_OUT_EDGE: MAX_OUT_EDGE, DIFF_STRIDE: DIFF_STRIDE,
    clampNum: clampNum, esc: esc, cleanStem: cleanStem,
    parseTimestamp: parseTimestamp, formatTimestamp: formatTimestamp,
    formatFileTimestamp: formatFileTimestamp, parseTimestampList: parseTimestampList,
    evenTimepoints: evenTimepoints, intervalTimepoints: intervalTimepoints,
    scanTimepoints: scanTimepoints,
    frameDiffScore: frameDiffScore, topKByDiff: topKByDiff,
    buildFileName: buildFileName, buildExportList: buildExportList
  };
}
})();
