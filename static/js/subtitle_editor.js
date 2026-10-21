/* SRT 字幕编辑器（subtitle_editor）：本地 SRT/VTT 字幕编辑 / 整体时间平移 / SRT↔VTT 互转导出
*
* 功能：
*  1) 输入：拖拽/选择上传 .srt/.vtt/.txt（FileReader 本地解析），粘贴字幕文本导入，自动识别格式。
*  2) 条目编辑：条目列表（序号＋起止时间＋文本）；起止时间文本框毫秒级编辑；
*     新增条目/删除条目/拆分（按条目时长中点拆成两条）/合并（与下一条合并）。
*  3) 时间平移：全局一键 ±毫秒整体平移（字幕与视频对不上痛点）；
*     单条 ±0.5s / ±1s 快捷微调（整条起止时间同步移动）。
*  4) 导出：SRT ↔ VTT 互转本地下载（Blob，零上传）。
*  5) localStorage 自动暂存（tw_subtitle_editor_v1），刷新不丢。
* 纯函数全部经 module.exports 暴露，node tests/subtitle_editor.test.js 自测；
* 浏览器内 init 挂 DOMContentLoaded；无 fetch/XHR（零上传）。
*/
(function () {
"use strict";

/* ---------- 1. 常量与基础 ---------- */
var LS_KEY = "tw_subtitle_editor_v1";
var DEFAULT_ITEM_MS = 2000;   /* 新增条目默认时长 */
var MIN_ITEM_MS = 1;          /* 条目最短时长钳制 */

/* 时间戳：接受 HH:MM:SS,mmm / HH:MM:SS.mmm / MM:SS,mmm（毫秒 1-3 位） */
var TS_RE = /^(?:(\d{1,3}):)?([0-5]?\d):([0-5]\d)[,.](\d{1,3})$/;

function clampMs(v) {
  var x = parseInt(v, 10);
  if (!isFinite(x)) return 0;
  if (x < 0) x = 0;
  return x;
}

/** 解析时间戳为毫秒，非法返回 null */
function parseTimestamp(ts) {
  if (ts == null) return null;
  var m = String(ts).trim().match(TS_RE);
  if (!m) return null;
  var h = m[1] ? parseInt(m[1], 10) : 0;
  var min = parseInt(m[2], 10);
  var sec = parseInt(m[3], 10);
  var ms = m[4];
  while (ms.length < 3) ms += "0";
  return ((h * 60 + min) * 60 + sec) * 1000 + parseInt(ms, 10);
}

/** 毫秒格式化为时间戳；fmt: "srt"（逗号）/ "vtt"（点） */
function formatTimestamp(ms, fmt) {
  var v = clampMs(Math.round(ms));
  var h = Math.floor(v / 3600000);
  var min = Math.floor((v % 3600000) / 60000);
  var sec = Math.floor((v % 60000) / 1000);
  var mss = v % 1000;
  function p2(n) { return (n < 10 ? "0" : "") + n; }
  function p3(n) { return (n < 100 ? (n < 10 ? "00" : "0") : "") + n; }
  var sep = fmt === "vtt" ? "." : ",";
  return p2(h) + ":" + p2(min) + ":" + p2(sec) + sep + p3(mss);
}

/** HTML 转义 */
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function makeItem(start, end, text) {
  var s = clampMs(start);
  var e = clampMs(end);
  if (e < s + MIN_ITEM_MS) e = s + MIN_ITEM_MS;
  return {start: s, end: e, text: String(text == null ? "" : text)};
}

function normalizeText(t) {
  return String(t == null ? "" : t).replace(/\r\n?/g, "\n").replace(/^\uFEFF/, "");
}

/* ---------- 2. 解析 ---------- */

/** 解析 SRT 文本 → [{start,end,text}]（毫秒） */
function parseSRT(text) {
  var blocks = normalizeText(text).split(/\n[ \t]*\n/);
  var out = [];
  for (var i = 0; i < blocks.length; i++) {
    var lines = blocks[i].split("\n");
    var ai = -1;
    for (var j = 0; j < lines.length; j++) {
      if (lines[j].indexOf("-->") >= 0) { ai = j; break; }
    }
    if (ai < 0) continue;
    var m = lines[ai].match(/^\s*(.+?)\s*-->\s*(.+?)\s*$/);
    if (!m) continue;
    var s = parseTimestamp(m[1]);
    var e = parseTimestamp(m[2].split(/\s+/)[0]);
    if (s == null || e == null || e <= s) continue;
    var txt = lines.slice(ai + 1).join("\n").replace(/^[ \t\n]+|[ \t\n]+$/g, "");
    out.push({start: s, end: e, text: txt});
  }
  return out;
}

/** 解析 VTT 文本 → [{start,end,text}]（毫秒）；跳过 WEBVTT 头与 NOTE 块 */
function parseVTT(text) {
  var t = normalizeText(text).replace(/^\s*WEBVTT[^\n]*\n/, "");
  var blocks = t.split(/\n[ \t]*\n/);
  var out = [];
  for (var i = 0; i < blocks.length; i++) {
    var lines = [];
    var raw = blocks[i].split("\n");
    for (var k = 0; k < raw.length; k++) {
      var tl = raw[k].replace(/^[ \t]+|[ \t]+$/g, "");
      if (tl) lines.push(tl);
    }
    if (!lines.length) continue;
    if (/^NOTE(\s|$)/.test(lines[0])) continue;
    var ai = -1;
    for (var j = 0; j < lines.length; j++) {
      if (lines[j].indexOf("-->") >= 0) { ai = j; break; }
    }
    if (ai < 0) continue;
    var m = lines[ai].match(/^\s*(.+?)\s*-->\s*(.+?)\s*$/);
    if (!m) continue;
    var s = parseTimestamp(m[1]);
    var e = parseTimestamp(m[2].split(/\s+/)[0]);
    if (s == null || e == null || e <= s) continue;
    var txt = lines.slice(ai + 1).join("\n");
    if (!txt) continue;
    out.push({start: s, end: e, text: txt});
  }
  return out;
}

/** 粗略识别字幕文本格式： "srt" | "vtt" | null */
function detectFormat(text) {
  var t = normalizeText(text);
  if (/^\s*WEBVTT(\s|$)/m.test(t)) return "vtt";
  if (t.indexOf("-->") >= 0) {
    /* VTT 时间戳用点，SRT 用逗号；点也可能是 SRT 宽松写法 */
    var arrow = t.match(/\d[,.]\d{3}\s*-->\s*[\d:,.\s]+/);
    if (arrow && arrow[0].indexOf(".") >= 0 && arrow[0].indexOf(",") < 0) return "vtt";
    return "srt";
  }
  return null;
}

/* ---------- 3. 导出 ---------- */

/** 导出 SRT（含自动重编号，块间空行分隔） */
function exportSRT(items) {
  var parts = [];
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    parts.push((i + 1) + "\n" +
      formatTimestamp(it.start, "srt") + " --> " + formatTimestamp(it.end, "srt") + "\n" +
      String(it.text == null ? "" : it.text).replace(/^\s+|\s+$/g, ""));
  }
  return parts.join("\n\n") + (parts.length ? "\n" : "");
}

/** 导出 VTT（含 WEBVTT 头） */
function exportVTT(items) {
  var parts = ["WEBVTT"];
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    parts.push(formatTimestamp(it.start, "vtt") + " --> " + formatTimestamp(it.end, "vtt") + "\n" +
      String(it.text == null ? "" : it.text).replace(/^\s+|\s+$/g, ""));
  }
  return parts.join("\n\n") + "\n";
}

/* ---------- 4. 时间平移与条目操作 ---------- */

/** 全局整体平移：返回新数组（不修改原数组）；起点钳制 ≥0，文本不变 */
function shiftAll(items, deltaMs) {
  var d = parseInt(deltaMs, 10);
  if (!isFinite(d)) d = 0;
  var out = [];
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var s = it.start + d;
    if (s < 0) s = 0;
    var e = it.end + d;
    if (e < s + MIN_ITEM_MS) e = s + MIN_ITEM_MS;
    out.push({start: s, end: e, text: it.text});
  }
  return out;
}

/** 单条微调（整条起止时间同步移动 deltaMs），返回新条目 */
function nudgeTimes(item, deltaMs) {
  var d = parseInt(deltaMs, 10);
  if (!isFinite(d)) d = 0;
  var s = item.start + d;
  if (s < 0) s = 0;
  var e = item.end + d;
  if (e < s + MIN_ITEM_MS) e = s + MIN_ITEM_MS;
  return {start: s, end: e, text: item.text};
}

/** 拆分条目：按 splitMs 切成两条，文本按时间比例切分；非法返回 null */
function splitItem(item, splitMs) {
  var s = item.start, e = item.end;
  var cut = parseInt(splitMs, 10);
  if (!isFinite(cut) || cut <= s || cut >= e) return null;
  var text = String(item.text == null ? "" : item.text);
  var ratio = (cut - s) / (e - s);
  var pos = Math.round(text.length * ratio);
  if (pos < 0) pos = 0;
  if (pos > text.length) pos = text.length;
  return [
    {start: s, end: cut, text: text.slice(0, pos)},
    {start: cut, end: e, text: text.slice(pos)}
  ];
}

/** 合并两条：时间取并集（早的起点、晚的终点），文本按时间顺序拼接 */
function mergeItems(a, b) {
  var first = a, second = b;
  if (b.start < a.start || (b.start === a.start && b.end < a.end)) {
    first = b; second = a;
  }
  var t1 = String(first.text == null ? "" : first.text);
  var t2 = String(second.text == null ? "" : second.text);
  var text = t1 && t2 ? t1 + "\n" + t2 : (t1 || t2);
  return {start: Math.min(a.start, b.start), end: Math.max(a.end, b.end), text: text};
}

/** 按开始时间排序（稳定） */
function sortByStart(items) {
  var out = items.slice();
  out.sort(function (a, b) { return a.start - b.start; });
  return out;
}

/** 计算统计：条目数、总时长（末条终点） */
function calcStats(items) {
  var count = items.length;
  var dur = 0;
  for (var i = 0; i < items.length; i++) {
    if (items[i].end > dur) dur = items[i].end;
  }
  return {count: count, durationMs: dur};
}

/** 时长格式化 "MM:SS"（供统计显示） */
function formatDurShort(ms) {
  var s = Math.round(ms / 1000);
  var m = Math.floor(s / 60);
  s = s % 60;
  return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
}

/** 导出文件名：根据源名与格式生成 */
function exportFilename(srcName, fmt) {
  var base = String(srcName || "subtitle").replace(/\.(srt|vtt|txt)$/i, "");
  if (!base) base = "subtitle";
  return base + "." + (fmt === "vtt" ? "vtt" : "srt");
}

/* ---------- 5. 浏览器界面 ---------- */
function initBrowser() {
  var $ = function (id) { return document.getElementById(id); };
  var items = [];            /* [{start,end,text}] */
  var srcName = "";
  var srcFmt = "srt";

  var els = {
    drop: $("se-drop"), file: $("se-file"), paste: $("se-paste"),
    btnPaste: $("se-btn-paste"), btnSample: $("se-btn-sample"), btnClear: $("se-btn-clear"),
    srcInfo: $("se-srcinfo"), stats: $("se-stats"),
    shiftInput: $("se-shift"), btnShiftNeg: $("se-shift-neg"), btnShiftPos: $("se-shift-pos"),
    btnAdd: $("se-add"), btnSort: $("se-sort"),
    list: $("se-list"), empty: $("se-empty"),
    outName: $("se-outname"), btnSrt: $("se-export-srt"), btnVtt: $("se-export-vtt"),
    toast: $("se-toast")
  };

  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { els.toast.classList.remove("show"); }, 2200);
  }

  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify({items: items, srcName: srcName, srcFmt: srcFmt})); } catch (e) {}
  }
  function load() {
    try {
      var d = JSON.parse(localStorage.getItem(LS_KEY) || "null");
      if (d && Array.isArray(d.items)) {
        items = d.items.filter(function (it) {
          return it && isFinite(it.start) && isFinite(it.end) && it.end > it.start;
        }).map(function (it) { return {start: it.start | 0, end: it.end | 0, text: String(it.text || "")}; });
        srcName = d.srcName || ""; srcFmt = d.srcFmt || "srt";
      }
    } catch (e) {}
  }

  function render() {
    var st = calcStats(items);
    els.stats.textContent = "共 " + st.count + " 条 · 总时长 " + formatDurShort(st.durationMs);
    els.srcInfo.textContent = srcName ? ("来源：" + srcName + "（" + srcFmt.toUpperCase() + "）") : "尚未导入字幕";
    if (!els.outName.dataset.touched) els.outName.value = exportFilename(srcName, srcFmt);
    els.list.innerHTML = "";
    els.empty.style.display = items.length ? "none" : "flex";
    for (var i = 0; i < items.length; i++) {
      els.list.appendChild(itemCard(items[i], i));
    }
    save();
  }

  function itemCard(it, idx) {
    var card = document.createElement("div");
    card.className = "se-item";
    card.innerHTML =
      '<div class="se-item-head">' +
        '<span class="se-idx">' + (idx + 1) + '</span>' +
        '<label>开始 <input type="text" class="se-ts" data-k="start" value="' + esc(formatTimestamp(it.start, "srt")) + '" title="格式 00:00:05,000"></label>' +
        '<label>结束 <input type="text" class="se-ts" data-k="end" value="' + esc(formatTimestamp(it.end, "srt")) + '" title="格式 00:00:10,000"></label>' +
        '<span class="se-nudge">' +
          '<button type="button" data-act="n-1000" title="整条 −1s">−1s</button>' +
          '<button type="button" data-act="n-500" title="整条 −0.5s">−0.5s</button>' +
          '<button type="button" data-act="n500" title="整条 +0.5s">+0.5s</button>' +
          '<button type="button" data-act="n1000" title="整条 +1s">+1s</button>' +
        '</span>' +
        '<span class="se-ops">' +
          '<button type="button" data-act="split" title="按时长中点拆成两条">拆分</button>' +
          '<button type="button" data-act="merge" title="与下一条合并"' + (idx >= items.length - 1 ? " disabled" : "") + '>合并↓</button>' +
          '<button type="button" data-act="del" title="删除本条">删除</button>' +
        '</span>' +
      '</div>' +
      '<textarea class="se-text" rows="2" placeholder="字幕文本…">' + esc(it.text) + '</textarea>';

    card.querySelectorAll("input.se-ts").forEach(function (inp) {
      inp.addEventListener("change", function () {
        var ms = parseTimestamp(inp.value);
        if (ms == null) { toast("时间格式无效，应为 00:00:05,000"); inp.value = formatTimestamp(it[inp.dataset.k], "srt"); return; }
        it[inp.dataset.k] = ms;
        if (it.end <= it.start) {
          if (inp.dataset.k === "start") it.end = it.start + MIN_ITEM_MS; else it.start = Math.max(0, it.end - MIN_ITEM_MS);
        }
        render();
      });
    });
    card.querySelector(".se-text").addEventListener("input", function (e) {
      it.text = e.target.value;
      save();
    });
    card.querySelectorAll("button[data-act]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var act = btn.dataset.act;
        if (act === "del") { items.splice(idx, 1); toast("已删除第 " + (idx + 1) + " 条"); }
        else if (act === "split") {
          var sp = splitItem(it, Math.round((it.start + it.end) / 2));
          if (!sp) { toast("该条无法拆分"); return; }
          items.splice(idx, 1, sp[0], sp[1]);
          toast("已拆分为两条");
        }
        else if (act === "merge") {
          if (idx >= items.length - 1) return;
          items.splice(idx, 2, mergeItems(it, items[idx + 1]));
          toast("已合并");
        }
        else if (act.charAt(0) === "n") {
          var d = parseInt(act.slice(1), 10);
          var n = nudgeTimes(it, d);
          it.start = n.start; it.end = n.end;
        }
        render();
      });
    });
    return card;
  }

  function importText(text, name) {
    var fmt = detectFormat(text) || (name && /\.vtt$/i.test(name) ? "vtt" : "srt");
    var parsed = fmt === "vtt" ? parseVTT(text) : parseSRT(text);
    if (!parsed.length) { toast("未解析到有效字幕条目，请检查格式"); return; }
    items = sortByStart(parsed);
    srcName = name || "粘贴导入";
    srcFmt = fmt;
    render();
    toast("已导入 " + parsed.length + " 条（" + fmt.toUpperCase() + "）");
  }

  function readFile(f) {
    if (!f) return;
    var r = new FileReader();
    r.onload = function () { importText(String(r.result || ""), f.name); };
    r.onerror = function () { toast("文件读取失败"); };
    r.readAsText(f, "utf-8");
  }

  /* 拖拽 / 选择上传 */
  els.drop.addEventListener("click", function () { els.file.click(); });
  els.file.addEventListener("change", function () { readFile(els.file.files[0]); els.file.value = ""; });
  ["dragover", "dragenter"].forEach(function (ev) {
    els.drop.addEventListener(ev, function (e) { e.preventDefault(); els.drop.classList.add("drag"); });
  });
  ["dragleave", "drop"].forEach(function (ev) {
    els.drop.addEventListener(ev, function (e) { e.preventDefault(); els.drop.classList.remove("drag"); });
  });
  els.drop.addEventListener("drop", function (e) {
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    readFile(f);
  });

  /* 粘贴导入 / 示例 / 清空 */
  els.btnPaste.addEventListener("click", function () {
    var t = els.paste.value;
    if (!t.trim()) { toast("请先粘贴字幕文本"); return; }
    importText(t, "粘贴导入");
  });
  var SAMPLE = "1\n00:00:01,000 --> 00:00:04,000\n欢迎使用 SRT 字幕编辑器\n\n" +
    "2\n00:00:05,500 --> 00:00:08,000\n拖拽上传或粘贴字幕文本导入\n\n" +
    "3\n00:00:09,000 --> 00:00:12,500\n支持整体平移与 SRT/VTT 互转导出";
  els.btnSample.addEventListener("click", function () { importText(SAMPLE, "示例字幕.srt"); });
  els.btnClear.addEventListener("click", function () {
    if (!items.length) return;
    items = []; srcName = ""; render(); toast("已清空");
  });

  /* 全局平移 */
  function globalShift(sign) {
    var d = parseInt(els.shiftInput.value, 10);
    if (!isFinite(d) || d <= 0) { toast("请输入有效的毫秒数（正整数）"); return; }
    items = shiftAll(items, sign * d);
    render();
    toast("全部条目已" + (sign < 0 ? "提前" : "延后") + " " + d + "ms");
  }
  els.btnShiftNeg.addEventListener("click", function () { globalShift(-1); });
  els.btnShiftPos.addEventListener("click", function () { globalShift(1); });
  document.querySelectorAll("[data-shift]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var d = parseInt(btn.dataset.shift, 10);
      items = shiftAll(items, d);
      render();
      toast("全部条目已" + (d < 0 ? "提前" : "延后") + " " + Math.abs(d) + "ms");
    });
  });

  /* 新增 / 排序 */
  els.btnAdd.addEventListener("click", function () {
    var lastEnd = items.length ? items[items.length - 1].end : 0;
    items.push(makeItem(lastEnd, lastEnd + DEFAULT_ITEM_MS, ""));
    render();
  });
  els.btnSort.addEventListener("click", function () { items = sortByStart(items); render(); toast("已按开始时间排序"); });

  /* 导出 */
  els.outName.addEventListener("input", function () { els.outName.dataset.touched = "1"; });
  function download(content, filename, mime) {
    var blob = new Blob([content], {type: mime + ";charset=utf-8"});
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  els.btnSrt.addEventListener("click", function () {
    if (!items.length) { toast("没有可导出的条目"); return; }
    var name = (els.outName.value || "subtitle").replace(/\.(srt|vtt)$/i, "") + ".srt";
    download(exportSRT(items), name, "text/plain");
    toast("SRT 已导出");
  });
  els.btnVtt.addEventListener("click", function () {
    if (!items.length) { toast("没有可导出的条目"); return; }
    var name = (els.outName.value || "subtitle").replace(/\.(srt|vtt)$/i, "") + ".vtt";
    download(exportVTT(items), name, "text/vtt");
    toast("VTT 已导出");
  });

  load();
  render();
}

if (typeof document !== "undefined" && document.getElementById) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initBrowser);
  } else {
    initBrowser();
  }
}

/* ---------- 6. node 导出 ---------- */
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    LS_KEY: LS_KEY,
    DEFAULT_ITEM_MS: DEFAULT_ITEM_MS,
    clampMs: clampMs,
    parseTimestamp: parseTimestamp,
    formatTimestamp: formatTimestamp,
    esc: esc,
    makeItem: makeItem,
    normalizeText: normalizeText,
    parseSRT: parseSRT,
    parseVTT: parseVTT,
    detectFormat: detectFormat,
    exportSRT: exportSRT,
    exportVTT: exportVTT,
    shiftAll: shiftAll,
    nudgeTimes: nudgeTimes,
    splitItem: splitItem,
    mergeItems: mergeItems,
    sortByStart: sortByStart,
    calcStats: calcStats,
    formatDurShort: formatDurShort,
    exportFilename: exportFilename
  };
}
})();
