/* 滚动字幕生成器（scrolling_subtitle_generator）：可嵌入网页/直播叠加层/门店屏的滚动字幕 HTML/CSS 代码生成器
*
* 功能：
*  1) 文案输入：水平方向空白归一为单空格；垂直方向按行保留、去空行。
*  2) 方向四档：向左 / 向右 / 向上 / 向下；速度 20-500px/s（默认 100）；字号 16-120px（默认 48）。
*  3) 文字 / 背景 HEX 颜色（非法回落白字 #ffffff / 黑底 #111111）；粗体、悬停暂停两开关。
*  4) 实时预览：动画时长由 JS 实测内容像素尺寸除以速度得出，与生成代码时长一致。
*  5) 生成代码区：<style> + HTML 组合片段，两份相同内容无缝循环、文案转义插值、无外部引用、无 JS。
*  6) 复制代码、下载演示 HTML、统计条。
* 纯函数全部经 module.exports 暴露，node tests/scrolling_subtitle_generator.test.js 自测；
* 浏览器内 init 挂 DOMContentLoaded；无网络请求（零上传、零 fetch/XHR、零 CDN）。
*/
(function () {
"use strict";

var DEFAULT_SPEED = 100;
var DEFAULT_FONT_SIZE = 48;
var DEFAULT_TEXT_COLOR = "#ffffff";
var DEFAULT_BG_COLOR = "#111111";
var ANIM_NAME = "scroll-subtitle-marquee";
var HEX_RE = /^#[0-9a-fA-F]{6}$/;

function clampNum(v, def, min, max) {
  var x = parseFloat(v);
  if (!isFinite(x)) return def;
  if (x < min) return min;
  if (x > max) return max;
  return x;
}

function isHorizontal(direction) {
  return direction === "left" || direction === "right";
}

function escapeHtml(text) {
  return String(text == null ? "" : text)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/* normalizeText：水平方向全部空白（含换行）归一为单空格；
* 垂直方向按行切分、每行去首尾空白、空行丢弃、其余行保留换行分隔；空输入返回空串。 */
function normalizeText(text, direction) {
  var s = String(text == null ? "" : text);
  if (isHorizontal(direction)) {
    return s.replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
  }
  var lines = s.split(/\r\n|\r|\n/);
  var out = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].replace(/^\s+|\s+$/g, "");
    if (line !== "") out.push(line);
  }
  return out.join("\n");
}

function validHexColor(value, fallback) {
  var s = String(value == null ? "" : value).replace(/^\s+|\s+$/g, "");
  return HEX_RE.test(s) ? s : fallback;
}

function directionLabel(direction) {
  if (direction === "right") return "向右";
  if (direction === "up") return "向上";
  if (direction === "down") return "向下";
  return "向左";
}

/* buildKeyframes：四方向起止与规格逐字一致；反向时起止互换。 */
function buildKeyframes(direction) {
  var from, to;
  if (direction === "right") { from = "translateX(-50%)"; to = "translateX(0)"; }
  else if (direction === "up") { from = "translateY(0)"; to = "translateY(-50%)"; }
  else if (direction === "down") { from = "translateY(-50%)"; to = "translateY(0)"; }
  else { from = "translateX(0)"; to = "translateX(-50%)"; }
  var css = "@keyframes " + ANIM_NAME + " { from { transform: " + from + "; } to { transform: " + to + "; } }";
  return { name: ANIM_NAME, from: from, to: to, css: css };
}

function durationSecOf(measuredPx, speed) {
  var m = parseFloat(measuredPx);
  var s = clampNum(speed, DEFAULT_SPEED, 20, 500);
  if (!isFinite(m) || m <= 0) return 0;
  return Math.round((m / s) * 10) / 10;
}

function formatDuration(durationSec) {
  return (Math.round(durationSec * 10) / 10).toFixed(1) + "s";
}

/* buildSnippet(config, measuredPx)：返回 {html, css, full, durationSec, ...}。
* config: {text, direction, speed, fontSize, textColor, bgColor, bold, pauseOnHover}
* text 应为已归一化文案（函数内仍会再归一化一次，保证直接传原始文案也正确）。 */
function buildSnippet(config, measuredPx) {
  var cfg = config || {};
  var direction = cfg.direction === "right" || cfg.direction === "up" || cfg.direction === "down" ? cfg.direction : "left";
  var text = normalizeText(cfg.text, direction);
  var speed = clampNum(cfg.speed, DEFAULT_SPEED, 20, 500);
  var fontSize = clampNum(cfg.fontSize, DEFAULT_FONT_SIZE, 16, 120);
  var textColor = validHexColor(cfg.textColor, DEFAULT_TEXT_COLOR);
  var bgColor = validHexColor(cfg.bgColor, DEFAULT_BG_COLOR);
  var bold = cfg.bold !== false;
  var pauseOnHover = cfg.pauseOnHover !== false;
  var durationSec = durationSecOf(measuredPx, speed);
  var duration = formatDuration(durationSec);
  var horizontal = isHorizontal(direction);
  /* 垂直无缝循环关键：容器高度必须等于单份内容高度（measuredPx），否则容器高为两份
  * 之和，动画到 -50% 时下半份为空白、回环跳变。measuredPx<=0 或非法时不写高度、保持旧行为。 */
  var measuredVal = parseFloat(measuredPx);
  var containerHeight = (!horizontal && isFinite(measuredVal) && measuredVal > 0) ? " height: " + measuredVal + "px;" : "";
  var kf = buildKeyframes(direction);
  var escaped = escapeHtml(text);
  var itemHtml;
  if (horizontal) {
    itemHtml = "<span>" + escaped + "</span>";
  } else {
    itemHtml = "<div>" + escaped.replace(/\n/g, "<br>") + "</div>";
  }
  var html = '<div class="scroll-subtitle"><div class="scroll-subtitle-track">' + itemHtml + itemHtml + "</div></div>";
  var trackDir = horizontal ? "row" : "column";
  var itemStyle = horizontal ? "white-space:nowrap;" : "";
  var css = ".scroll-subtitle { overflow: hidden; background: " + bgColor + "; color: " + textColor +
    "; font-size: " + fontSize + "px; font-weight: " + (bold ? "700" : "400") +
    "; line-height: 1.4; width: 100%;" + containerHeight + " }\n" +
    ".scroll-subtitle-track { display: flex; flex-direction: " + trackDir +
    "; animation: " + ANIM_NAME + " " + duration + " linear infinite; will-change: transform; }\n" +
    ".scroll-subtitle-track > * { " + itemStyle + " flex: none; }\n" +
    kf.css +
    (pauseOnHover ? "\n.scroll-subtitle:hover .scroll-subtitle-track { animation-play-state: paused; }" : "");
  var full = "<style>\n" + css + "\n</style>\n" + html;
  return {
    html: html, css: css, full: full, durationSec: durationSec, duration: duration,
    text: text, direction: direction, speed: speed, fontSize: fontSize,
    textColor: textColor, bgColor: bgColor, bold: bold, pauseOnHover: pauseOnHover
  };
}

/* buildDemoPage(snippet)：把 full 包进完整 HTML 文档；snippet 可为字符串（full 全文）或 buildSnippet 返回对象。 */
function buildDemoPage(snippet) {
  var full = typeof snippet === "string" ? snippet : (snippet && snippet.full ? snippet.full : "");
  var bg = snippet && snippet.bgColor ? snippet.bgColor : DEFAULT_BG_COLOR;
  return "<!DOCTYPE html>\n<html lang=\"zh-CN\">\n<head>\n<meta charset=\"UTF-8\">\n" +
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n" +
    "<title>滚动字幕演示</title>\n<style>body { margin: 0; background: " + bg + "; }</style>\n</head>\n<body>\n" +
    full + "\n</body>\n</html>\n";
}

function statsOf(normalizedText, direction) {
  var text = normalizedText == null ? "" : normalizedText;
  var chars = text.replace(/\s/g, "").length;
  var lines = text === "" ? 0 : text.split("\n").length;
  return { chars: chars, lines: lines, direction: directionLabel(direction) };
}

var api = {
  normalizeText: normalizeText, escapeHtml: escapeHtml, buildKeyframes: buildKeyframes,
  buildSnippet: buildSnippet, buildDemoPage: buildDemoPage, isHorizontal: isHorizontal,
  validHexColor: validHexColor, clampNum: clampNum, durationSecOf: durationSecOf,
  formatDuration: formatDuration, statsOf: statsOf, directionLabel: directionLabel,
  DEFAULT_SPEED: DEFAULT_SPEED, DEFAULT_FONT_SIZE: DEFAULT_FONT_SIZE,
  DEFAULT_TEXT_COLOR: DEFAULT_TEXT_COLOR, DEFAULT_BG_COLOR: DEFAULT_BG_COLOR,
  ANIM_NAME: ANIM_NAME
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
} else if (typeof window !== "undefined") {
  window.ScrollingSubtitle = api;
}

/* ---------- 浏览器 UI ---------- */
if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", function () {
    var $ = function (id) { return document.getElementById(id); };
    var textEl = $("ssg-text"), codeEl = $("ssg-code"), previewEl = $("ssg-preview"),
      styleEl = $("ssg-preview-style"), statsEl = $("ssg-stats"), hintEl = $("ssg-hint"),
      toastEl = $("ssg-toast");
    if (!textEl || !codeEl || !previewEl) return;

    var SAMPLE = "欢迎光临 · 今日特价全场八折 · 新品上市";
    var currentSnippet = null;
    var paused = false;

    function toast(msg) {
      if (!toastEl) return;
      toastEl.textContent = msg;
      toastEl.className = "ssg-toast show";
      setTimeout(function () { toastEl.className = "ssg-toast"; }, 2600);
    }

    function readConfig() {
      var dirEl = document.querySelector('input[name="ssg-direction"]:checked');
      return {
        text: textEl.value,
        direction: dirEl ? dirEl.value : "left",
        speed: $("ssg-speed") ? $("ssg-speed").value : DEFAULT_SPEED,
        fontSize: $("ssg-fontsize") ? $("ssg-fontsize").value : DEFAULT_FONT_SIZE,
        textColor: $("ssg-textcolor-text") ? $("ssg-textcolor-text").value : DEFAULT_TEXT_COLOR,
        bgColor: $("ssg-bgcolor-text") ? $("ssg-bgcolor-text").value : DEFAULT_BG_COLOR,
        bold: $("ssg-bold") ? $("ssg-bold").checked : true,
        pauseOnHover: $("ssg-pause") ? $("ssg-pause").checked : true
      };
    }

    function syncLabels(cfg) {
      if ($("ssg-speed-val")) $("ssg-speed-val").textContent = clampNum(cfg.speed, DEFAULT_SPEED, 20, 500) + " px/s";
      if ($("ssg-fontsize-val")) $("ssg-fontsize-val").textContent = clampNum(cfg.fontSize, DEFAULT_FONT_SIZE, 16, 120) + " px";
      if ($("ssg-textcolor") && HEX_RE.test(String(cfg.textColor))) $("ssg-textcolor").value = cfg.textColor;
      if ($("ssg-bgcolor") && HEX_RE.test(String(cfg.bgColor))) $("ssg-bgcolor").value = cfg.bgColor;
    }

    function render() {
      var cfg = readConfig();
      syncLabels(cfg);
      var normalized = normalizeText(cfg.text, cfg.direction);
      if (normalized === "") {
        if (hintEl) hintEl.style.display = "block";
        codeEl.value = "";
        previewEl.innerHTML = '<div class="ssg-preview-empty">在上方输入文案后，这里会实时滚动预览。</div>';
        if (styleEl) styleEl.textContent = "";
        if (statsEl) statsEl.textContent = "尚未输入文案";
        currentSnippet = null;
        if ($("ssg-copy")) $("ssg-copy").disabled = true;
        if ($("ssg-download")) $("ssg-download").disabled = true;
        if ($("ssg-pause-btn")) $("ssg-pause-btn").disabled = true;
        return;
      }
      if (hintEl) hintEl.style.display = "none";
      /* 先用占位时长渲染一次以实测内容像素尺寸，再按实测尺寸换算最终时长。 */
      var draft = buildSnippet(cfg, 1000);
      previewEl.innerHTML = draft.html;
      previewEl.style.height = isHorizontal(cfg.direction) ? "auto" : "240px";
      if (styleEl) styleEl.textContent = draft.css;
      var track = previewEl.querySelector(".scroll-subtitle-track");
      var measured = 0;
      if (track && track.children.length > 0) {
        var first = track.children[0];
        measured = isHorizontal(cfg.direction) ? first.offsetWidth : first.offsetHeight;
      }
      /* 预览视口与生成代码视口一致：垂直方向外框高度改为实测单份高度，测不到时保留 240px 兜底。 */
      if (!isHorizontal(cfg.direction)) {
        previewEl.style.height = measured > 0 ? measured + "px" : "240px";
      }
      var snippet = buildSnippet(cfg, measured);
      currentSnippet = snippet;
      if (styleEl) styleEl.textContent = snippet.css;
      if (track) {
        track.style.animationDuration = snippet.duration;
        track.style.animationPlayState = paused ? "paused" : "";
      }
      codeEl.value = snippet.full;
      var st = statsOf(snippet.text, snippet.direction);
      if (statsEl) {
        statsEl.textContent = "归一化后 " + st.chars + " 字 · " + st.lines + " 行 · 方向 " + st.direction +
          " · 速度 " + snippet.speed + " px/s · 实测 " + measured + " px · 时长 " + snippet.duration;
      }
      if ($("ssg-copy")) $("ssg-copy").disabled = false;
      if ($("ssg-download")) $("ssg-download").disabled = false;
      if ($("ssg-pause-btn")) { $("ssg-pause-btn").disabled = false; $("ssg-pause-btn").textContent = paused ? "继续" : "暂停"; }
    }

    function copyCode() {
      if (!currentSnippet) return;
      var text = codeEl.value;
      function fallback() {
        try {
          codeEl.focus(); codeEl.select();
          if (document.execCommand("copy")) { toast("已复制到剪贴板"); return; }
        } catch (e) { /* 忽略，走降级提示 */ }
        toast("复制失败，请手动全选代码区复制");
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { toast("已复制到剪贴板"); }, fallback);
      } else { fallback(); }
    }

    function downloadDemo() {
      if (!currentSnippet) return;
      var blob = new Blob([buildDemoPage(currentSnippet)], { type: "text/html;charset=utf-8" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "scrolling-subtitle-demo.html";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 500);
      toast("演示 HTML 已下载");
    }

    ["input", "change"].forEach(function (ev) {
      textEl.addEventListener(ev, render);
      ["ssg-speed", "ssg-fontsize", "ssg-textcolor", "ssg-textcolor-text", "ssg-bgcolor", "ssg-bgcolor-text", "ssg-bold", "ssg-pause"].forEach(function (id) {
        var el = $(id); if (el) el.addEventListener(ev, render);
      });
      var radios = document.querySelectorAll('input[name="ssg-direction"]');
      for (var i = 0; i < radios.length; i++) radios[i].addEventListener(ev, render);
    });
    if ($("ssg-generate")) $("ssg-generate").addEventListener("click", render);
    if ($("ssg-sample")) $("ssg-sample").addEventListener("click", function () { textEl.value = SAMPLE; render(); });
    if ($("ssg-clear")) $("ssg-clear").addEventListener("click", function () { textEl.value = ""; render(); });
    if ($("ssg-copy")) $("ssg-copy").addEventListener("click", copyCode);
    if ($("ssg-download")) $("ssg-download").addEventListener("click", downloadDemo);
    if ($("ssg-pause-btn")) $("ssg-pause-btn").addEventListener("click", function () {
      paused = !paused;
      var track = previewEl.querySelector(".scroll-subtitle-track");
      if (track) track.style.animationPlayState = paused ? "paused" : "";
      $("ssg-pause-btn").textContent = paused ? "继续" : "暂停";
    });
    render();
  });
}
})();
