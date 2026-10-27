/* 色盲模拟检查器（colorblind_simulator）：常见色盲类型眼里的颜色呈现与模拟后对比度
*
* 功能：
*  1) 单色模拟：一个 HEX 颜色在红色盲 Protanopia / 绿色盲 Deuteranopia /
*     蓝色盲 Tritanopia 下的呈现（Machado 等 2009 年模拟矩阵，sRGB 直接变换）。
*  2) 配色模拟：粘贴配色文本解析为颜色列表，原色与三类型模拟各一行色带，
*     模拟后 HEX 完全相等的颜色对单独警告（不引入近似距离阈值）。
*  3) 对比度模拟：前景 / 背景色对按 WCAG 2.x 相对亮度公式算原色与三类型
*     模拟后对比度及正常字 / 大号字 AA 判定，原色达标、模拟后不达标单独标红。
* 纯函数全部经 module.exports 暴露，node tests/colorblind_simulator.test.js 自测；
* 浏览器内 init 挂 DOMContentLoaded；无网络请求（零上传、零 fetch/XHR、零 CDN）。
*/
(function () {
"use strict";

var TYPES = [
  { key: "protanopia", name: "红色盲", en: "Protanopia" },
  { key: "deuteranopia", name: "绿色盲", en: "Deuteranopia" },
  { key: "tritanopia", name: "蓝色盲", en: "Tritanopia" }
];

/* Machado 等 2009 年模拟矩阵：行对应输出 R / G / B，列对应输入 R / G / B。 */
var MATRICES = {
  protanopia: [[0.567, 0.433, 0], [0.558, 0.442, 0], [0, 0.242, 0.758]],
  deuteranopia: [[0.625, 0.375, 0], [0.7, 0.3, 0], [0, 0.3, 0.7]],
  tritanopia: [[0.95, 0.05, 0], [0, 0.433, 0.567], [0, 0.475, 0.525]]
};

var HEX_RE = /^#?[0-9a-fA-F]{6}$/;
var MAX_COLORS = 12;

function clamp255(v) {
  if (v < 0) return 0;
  if (v > 255) return 255;
  return v;
}

function trim(s) {
  return String(s == null ? "" : s).replace(/^\s+|\s+$/g, "");
}

/* parseHex：接受带或不带 # 的 6 位 HEX（大小写不限），其余格式返回 null。 */
function parseHex(hex) {
  var s = trim(hex);
  if (!HEX_RE.test(s)) return null;
  if (s.charAt(0) === "#") s = s.slice(1);
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16)
  };
}

function toHex(r, g, b) {
  function ch(v) {
    var h = clamp255(Math.round(v)).toString(16).toUpperCase();
    return h.length === 1 ? "0" + h : h;
  }
  return "#" + ch(r) + ch(g) + ch(b);
}

function rgbToHex(rgb) {
  if (!rgb || typeof rgb.r !== "number") return null;
  return toHex(rgb.r, rgb.g, rgb.b);
}

/* simulateRgb：矩阵直接作用于 sRGB 三通道，逐通道 Math.round 并 clamp 0–255。 */
function simulateRgb(rgb, type) {
  var m = MATRICES[type];
  if (!m || !rgb || typeof rgb.r !== "number" ||
      typeof rgb.g !== "number" || typeof rgb.b !== "number") return null;
  return {
    r: clamp255(Math.round(m[0][0] * rgb.r + m[0][1] * rgb.g + m[0][2] * rgb.b)),
    g: clamp255(Math.round(m[1][0] * rgb.r + m[1][1] * rgb.g + m[1][2] * rgb.b)),
    b: clamp255(Math.round(m[2][0] * rgb.r + m[2][1] * rgb.g + m[2][2] * rgb.b))
  };
}

function simulateColor(hex, type) {
  var rgb = parseHex(hex);
  if (!rgb) return null;
  return rgbToHex(simulateRgb(rgb, type));
}

/* parsePalette：按逗号 / 分号 / 空白 / 换行切分；有效项归一化大写 HEX 后
* 按出现顺序去重，最多取前 12 个（超出忽略，truncated 置 true）；
* invalid 为原样无效 token 列表，不静默丢弃。 */
function parsePalette(text) {
  var tokens = trim(text).split(/[,;\s]+/);
  var colors = [];
  var seen = {};
  var invalid = [];
  var truncated = false;
  for (var i = 0; i < tokens.length; i++) {
    var tok = tokens[i];
    if (tok === "") continue;
    var rgb = parseHex(tok);
    if (!rgb) { invalid.push(tok); continue; }
    var hex = rgbToHex(rgb);
    if (seen[hex]) continue;
    seen[hex] = true;
    if (colors.length >= MAX_COLORS) { truncated = true; continue; }
    colors.push(hex);
  }
  return { colors: colors, invalid: invalid, truncated: truncated };
}

/* WCAG 2.x 相对亮度：sRGB 通道线性化后 L = 0.2126R + 0.7152G + 0.0722B。 */
function linearize(channel) {
  var c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(rgb) {
  if (!rgb) return null;
  return 0.2126 * linearize(rgb.r) + 0.7152 * linearize(rgb.g) + 0.0722 * linearize(rgb.b);
}

/* contrastRatio：(L亮 + 0.05) / (L暗 + 0.05)，保留 2 位小数。 */
function contrastRatio(fgRgb, bgRgb) {
  var l1 = relativeLuminance(fgRgb);
  var l2 = relativeLuminance(bgRgb);
  if (l1 === null || l2 === null) return null;
  var ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  return Math.round(ratio * 100) / 100;
}

function evaluatePair(fgHex, bgHex) {
  var fg = parseHex(fgHex);
  var bg = parseHex(bgHex);
  if (!fg || !bg) return null;
  var ratio = contrastRatio(fg, bg);
  return {
    fg: rgbToHex(fg), bg: rgbToHex(bg), ratio: ratio,
    aaNormal: ratio >= 4.5, aaLarge: ratio >= 3.0,
    aaaNormal: ratio >= 7.0, aaaLarge: ratio >= 4.5
  };
}

/* simulateContrastPair：原色对与三类型模拟色对的对比度与 AA 判定；
* fallen 为原色正常字 AA 通过、模拟后不通过的类型 key 列表。 */
function simulateContrastPair(fgHex, bgHex) {
  var original = evaluatePair(fgHex, bgHex);
  if (!original) return null;
  var types = {};
  var fallen = [];
  for (var i = 0; i < TYPES.length; i++) {
    var key = TYPES[i].key;
    var row = evaluatePair(simulateColor(fgHex, key), simulateColor(bgHex, key));
    types[key] = row;
    if (original.aaNormal && !row.aaNormal) fallen.push(key);
  }
  return { original: original, types: types, fallen: fallen };
}

/* findConfusablePairs：配色中两两颜色在该类型模拟后 HEX 完全相等者记为一对。 */
function findConfusablePairs(colors, type) {
  var pairs = [];
  var sims = [];
  for (var i = 0; i < colors.length; i++) {
    sims.push(simulateColor(colors[i], type));
  }
  for (var a = 0; a < colors.length; a++) {
    for (var b = a + 1; b < colors.length; b++) {
      if (sims[a] !== null && sims[a] === sims[b]) {
        pairs.push({ a: colors[a], b: colors[b], simulated: sims[a] });
      }
    }
  }
  return pairs;
}

function formatRatio(ratio) {
  return ratio.toFixed(2);
}

function typeName(key) {
  for (var i = 0; i < TYPES.length; i++) {
    if (TYPES[i].key === key) return TYPES[i].name;
  }
  return key;
}

/* buildContrastSummary：对比度摘要文本，与界面表格逐字一致。 */
function buildContrastSummary(result) {
  if (!result) return "";
  var lines = [];
  function line(label, row) {
    lines.push(label + "：" + row.fg + " / " + row.bg + "，对比度 " +
      formatRatio(row.ratio) + "，正常字 AA " + (row.aaNormal ? "通过" : "不通过") +
      "，大号字 AA " + (row.aaLarge ? "通过" : "不通过"));
  }
  line("原色", result.original);
  for (var i = 0; i < TYPES.length; i++) {
    var key = TYPES[i].key;
    line(TYPES[i].name + "（" + TYPES[i].en + "）", result.types[key]);
  }
  if (result.fallen.length > 0) {
    var names = [];
    for (var j = 0; j < result.fallen.length; j++) names.push(typeName(result.fallen[j]));
    lines.push("跌落提示：原色正常字 AA 通过，模拟后不通过——" + names.join("、"));
  }
  return lines.join("\n");
}

var api = {
  TYPES: TYPES,
  MAX_COLORS: MAX_COLORS,
  parseHex: parseHex,
  toHex: toHex,
  rgbToHex: rgbToHex,
  simulateRgb: simulateRgb,
  simulateColor: simulateColor,
  parsePalette: parsePalette,
  relativeLuminance: relativeLuminance,
  contrastRatio: contrastRatio,
  evaluatePair: evaluatePair,
  simulateContrastPair: simulateContrastPair,
  findConfusablePairs: findConfusablePairs,
  formatRatio: formatRatio,
  typeName: typeName,
  buildContrastSummary: buildContrastSummary
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
} else if (typeof window !== "undefined") {
  window.ColorblindSimulator = api;
}

/* ---------------- 浏览器 UI ---------------- */
if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", function () {
    function $(id) { return document.getElementById(id); }
    function toast(msg) {
      var t = $("cb-toast");
      if (!t) return;
      t.textContent = msg;
      t.className = "cb-toast show";
      clearTimeout(t._timer);
      t._timer = setTimeout(function () { t.className = "cb-toast"; }, 2600);
    }
    function copyText(text, okMsg) {
      function fallback() {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); toast(okMsg); }
        catch (e) { toast("复制失败，请手动复制"); }
        document.body.removeChild(ta);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { toast(okMsg); }, fallback);
      } else { fallback(); }
    }
    function esc(s) {
      return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
    function swatch(hex, label) {
      return '<span class="cb-chip" data-hex="' + esc(hex) + '" title="点击复制 ' + esc(hex) + '">' +
        '<i style="background:' + esc(hex) + '"></i><b>' + esc(label) + '</b><code>' + esc(hex) + '</code></span>';
    }

    /* ---- 单色区 ---- */
    var singlePicker = $("cb-single-picker"), singleText = $("cb-single-text"),
        singleErr = $("cb-single-error"), singleCards = $("cb-single-cards");
    function renderSingle() {
      var rgb = parseHex(singleText.value);
      if (!rgb) {
        singleErr.textContent = "HEX 无效：请输入 6 位 HEX，例如 #FF0000 或 FF0000（不支持 #f00 等缩写）。";
        singleCards.innerHTML = "";
        return;
      }
      singleErr.textContent = "";
      var hex = rgbToHex(rgb);
      var html = '<div class="cb-cards">' + swatch(hex, "原色") ;
      for (var i = 0; i < TYPES.length; i++) {
        html += swatch(simulateColor(hex, TYPES[i].key), TYPES[i].name);
      }
      html += "</div>";
      singleCards.innerHTML = html;
      bindChips(singleCards);
    }
    if (singlePicker) {
      singlePicker.addEventListener("input", function () {
        singleText.value = singlePicker.value.toUpperCase();
        renderSingle();
      });
      singleText.addEventListener("input", function () {
        var rgb = parseHex(singleText.value);
        if (rgb) singlePicker.value = rgbToHex(rgb);
        renderSingle();
      });
      renderSingle();
    }

    function bindChips(root) {
      var chips = root.querySelectorAll(".cb-chip");
      for (var i = 0; i < chips.length; i++) {
        chips[i].addEventListener("click", (function (el) {
          return function () { copyText(el.getAttribute("data-hex"), "已复制 " + el.getAttribute("data-hex")); };
        })(chips[i]));
      }
    }

    /* ---- 配色区 ---- */
    var paletteText = $("cb-palette-text"), paletteOut = $("cb-palette-out"),
        paletteNote = $("cb-palette-note");
    function renderPalette() {
      var parsed = parsePalette(paletteText.value);
      var notes = [];
      if (parsed.truncated) notes.push("配色超过 12 个，仅取前 12 个。");
      if (parsed.invalid.length > 0) notes.push("无效 token（已跳过）：" + parsed.invalid.join("、"));
      paletteNote.innerHTML = notes.length > 0 ? esc(notes.join(" ")) : "";
      if (parsed.colors.length === 0) {
        paletteOut.innerHTML = '<p class="cb-empty">暂无有效颜色：输入 6 位 HEX，以逗号、空格或换行分隔。</p>';
        return;
      }
      var rows = [{ key: "original", label: "原色" }];
      for (var i = 0; i < TYPES.length; i++) rows.push(TYPES[i]);
      var html = "";
      for (var r = 0; r < rows.length; r++) {
        var row = rows[r];
        var list = row.key === "original" ? parsed.colors : parsed.colors.map(function (c) {
          return simulateColor(c, row.key);
        });
        html += '<div class="cb-row"><div class="cb-row-head"><b>' + esc(row.label) + '</b>' +
          '<button type="button" class="cb-btn cb-btn-secondary cb-copy-row" data-row="' + r + '">复制该行 HEX 列表</button></div>' +
          '<div class="cb-strip">';
        for (var j = 0; j < list.length; j++) {
          html += swatch(list[j], list[j]);
        }
        html += "</div>";
        if (row.key !== "original") {
          var pairs = findConfusablePairs(parsed.colors, row.key);
          if (pairs.length > 0) {
            var warns = pairs.map(function (p) {
              return esc(p.a) + " 与 " + esc(p.b) + " 在该类型下均为 " + esc(p.simulated);
            });
            html += '<p class="cb-warn">⚠ ' + esc(row.label) + "下完全相同：" + warns.join("；") + "</p>";
          }
        }
        html += "</div>";
      }
      paletteOut.innerHTML = html;
      paletteOut._rows = rows.map(function (row) {
        return row.key === "original" ? parsed.colors : parsed.colors.map(function (c) {
          return simulateColor(c, row.key);
        });
      });
      bindChips(paletteOut);
      var btns = paletteOut.querySelectorAll(".cb-copy-row");
      for (var k = 0; k < btns.length; k++) {
        btns[k].addEventListener("click", (function (idx) {
          return function () {
            copyText(paletteOut._rows[idx].join(", "), "已复制该行 HEX 列表");
          };
        })(parseInt(btns[k].getAttribute("data-row"), 10)));
      }
    }
    if (paletteText) {
      paletteText.addEventListener("input", renderPalette);
      var loadBtn = $("cb-palette-sample"), clearBtn = $("cb-palette-clear");
      if (loadBtn) loadBtn.addEventListener("click", function () {
        paletteText.value = "#E53935, #43A047, #1E88E5, #FDD835, #8E24AA, #FF7043";
        renderPalette();
      });
      if (clearBtn) clearBtn.addEventListener("click", function () {
        paletteText.value = "";
        renderPalette();
      });
      renderPalette();
    }

    /* ---- 对比度区 ---- */
    var fgPicker = $("cb-fg-picker"), fgText = $("cb-fg-text"),
        bgPicker = $("cb-bg-picker"), bgText = $("cb-bg-text"),
        contrastOut = $("cb-contrast-out"), contrastPreview = $("cb-contrast-preview"),
        contrastSummary = $("cb-contrast-summary");
    function renderContrast() {
      var result = simulateContrastPair(fgText.value, bgText.value);
      if (!result) {
        contrastOut.innerHTML = '<p class="cb-empty">前景或背景 HEX 无效，请输入 6 位 HEX。</p>';
        contrastPreview.innerHTML = "";
        contrastSummary.value = "";
        return;
      }
      contrastPreview.innerHTML =
        '<div class="cb-preview" style="background:' + esc(result.original.bg) + ';color:' + esc(result.original.fg) + '">' +
        '<span style="font-size:1.4rem;font-weight:700;">原色样例：正常字大小预览 Aa</span><br>' +
        '<span style="font-size:1rem;">原色样例：大号字大小预览 Aa</span></div>';
      function badge(ok) {
        return ok ? '<span class="cb-pass">通过</span>' : '<span class="cb-fail">不通过</span>';
      }
      function rowHtml(label, row, fallen) {
        var cls = fallen ? ' class="cb-fallen"' : "";
        return "<tr" + cls + "><td>" + esc(label) + "</td><td>" + esc(row.fg) + " / " + esc(row.bg) +
          "</td><td>" + formatRatio(row.ratio) + "</td><td>" + badge(row.aaNormal) +
          "</td><td>" + badge(row.aaLarge) + "</td><td>" +
          (fallen ? '<span class="cb-fallen-text">原色达标、模拟后不达标</span>' : "—") + "</td></tr>";
      }
      var html = '<table class="cb-table"><thead><tr><th>视角</th><th>前景 / 背景</th><th>对比度</th>' +
        "<th>正常字 AA ≥ 4.5</th><th>大号字 AA ≥ 3.0</th><th>跌落提示</th></tr></thead><tbody>";
      html += rowHtml("原色", result.original, false);
      for (var i = 0; i < TYPES.length; i++) {
        var key = TYPES[i].key;
        html += rowHtml(TYPES[i].name + "（" + TYPES[i].en + "）", result.types[key],
          result.fallen.indexOf(key) !== -1);
      }
      html += "</tbody></table>";
      contrastOut.innerHTML = html;
      contrastSummary.value = buildContrastSummary(result);
    }
    function syncPair(picker, text) {
      var rgb = parseHex(text.value);
      if (rgb) picker.value = rgbToHex(rgb);
      renderContrast();
    }
    if (fgPicker) {
      fgPicker.addEventListener("input", function () { fgText.value = fgPicker.value.toUpperCase(); renderContrast(); });
      bgPicker.addEventListener("input", function () { bgText.value = bgPicker.value.toUpperCase(); renderContrast(); });
      fgText.addEventListener("input", function () { syncPair(fgPicker, fgText); });
      bgText.addEventListener("input", function () { syncPair(bgPicker, bgText); });
      var sampleBtn = $("cb-contrast-sample");
      if (sampleBtn) sampleBtn.addEventListener("click", function () {
        fgText.value = "#FF0000"; fgPicker.value = "#FF0000";
        bgText.value = "#FFFFFF"; bgPicker.value = "#FFFFFF";
        renderContrast();
      });
      var copyBtn = $("cb-contrast-copy");
      if (copyBtn) copyBtn.addEventListener("click", function () {
        copyText(contrastSummary.value, "已复制对比度摘要");
      });
      renderContrast();
    }
  });
}
})();
