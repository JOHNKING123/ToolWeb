/* 婚宴座位表生成器：名单解析 / 自动分桌算法 / 拖拽调桌 / localStorage 暂存 / 打印级海报
*
* 自动分桌口径（确定性算法）：
*  1) 名单解析：每行「姓名」或「姓名,组别」（兼容半角/全角逗号、分号、Tab、空格分隔），
*     自动去空行、按姓名去重（保留首次出现），实时计数。
*  2) 主桌（1 号桌）容量 = 每桌人数 - 主桌预留席位（钳制 0..每桌人数），预留席位在海报中明示。
*  3) 组别聚类：非空组别按人数降序（人数相同按首次出现顺序），整组优先放入
*     剩余空间最小的单桌（best-fit）；整组放不下时按剩余空间降序拆分到多桌。
*  4) 蛇形均衡：无组别宾客按 1→N→1→N 蛇形轮次逐桌落座，保证各桌人数均衡。
*  5) 容量钳制：任何桌人数永不超额；超出总容量者进入 unseated（UI 提示补桌）。
* 纯函数全部经 module.exports 暴露，node tests/wedding_seating_chart.test.js 自测；
* 浏览器内 init 挂 DOMContentLoaded；无网络请求（零上传）。
*/
(function () {
"use strict";

/* ---------- 1. 基础 ---------- */
function clampInt(v, def, min, max) {
  var x = parseInt(v, 10);
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

/* ---------- 2. 名单解析 ---------- */
/* text: 多行文本；返回 {guests:[{name,group}], dup 去重数, skipped 空行/无效行数} */
function parseGuests(text) {
  var lines = String(text == null ? "" : text).split(/\r?\n/);
  var guests = [], seen = {}, dup = 0, skipped = 0;
  for (var i = 0; i < lines.length; i++) {
    var t = lines[i].trim();
    if (!t) { skipped++; continue; }
    var name = "", group = "";
    var parts = t.split(/[,，;\t]/);
    if (parts.length >= 2) {
      name = parts[0].trim();
      group = parts.slice(1).join(" ").trim();
    } else {
      var sp = t.split(/\s+/);
      if (sp.length >= 2) { name = sp[0]; group = sp.slice(1).join(" "); }
      else { name = t; }
    }
    if (!name) { skipped++; continue; }
    if (seen[name]) { dup++; continue; }
    seen[name] = 1;
    guests.push({name: name, group: group});
  }
  return {guests: guests, dup: dup, skipped: skipped, count: guests.length};
}

/* 组别统计：返回 [{group, count}]（按首次出现顺序） */
function countByGroup(guests) {
  var order = [], map = {};
  guests.forEach(function (g) {
    var k = g.group || "（未分组）";
    if (!(k in map)) { map[k] = 0; order.push(k); }
    map[k]++;
  });
  return order.map(function (k) { return {group: k, count: map[k]}; });
}

/* ---------- 3. 自动分桌 ---------- */
/* guests: [{name, group}]；opts: {tables 桌数, perTable 每桌人数, reserved 主桌预留}
* 返回 {tables:[{index,label,isMain,capacity,reserved,guests:[{name,group}]}], unseated:[...]} */
function autoSeat(guests, opts) {
  opts = opts || {};
  var T = clampInt(opts.tables, 8, 1, 200);
  var C = clampInt(opts.perTable, 10, 1, 60);
  var R = clampInt(opts.reserved, 2, 0, C);
  var mainCap = C - R;

  var tables = [];
  for (var i = 0; i < T; i++) {
    tables.push({
      index: i,
      label: i === 0 ? "主桌" : (i + 1) + "号桌",
      isMain: i === 0,
      capacity: i === 0 ? mainCap : C,
      reserved: i === 0 ? R : 0,
      guests: []
    });
  }
  function free(t) { return t.capacity - t.guests.length; }

  var unseated = [];
  var order = [], byGroup = {};
  guests.forEach(function (g) {
    var k = g.group || "";
    if (!(k in byGroup)) { byGroup[k] = []; order.push(k); }
    byGroup[k].push({name: g.name, group: g.group});
  });

  /* 非空组别：人数降序（相同按首次出现），整组 best-fit，装不下则拆分 */
  var groups = order.filter(function (k) { return k !== ""; }).map(function (k) {
    return {group: k, members: byGroup[k], first: order.indexOf(k)};
  });
  groups.sort(function (a, b) {
    return (b.members.length - a.members.length) || (a.first - b.first);
  });

  groups.forEach(function (g) {
    var remaining = g.members.slice();
    var cands = tables.filter(function (t) { return free(t) >= remaining.length; });
    if (cands.length > 0) {
      var best = cands[0];
      cands.forEach(function (t) {
        if (free(t) < free(best) || (free(t) === free(best) && t.index < best.index)) best = t;
      });
      while (remaining.length) best.guests.push(remaining.shift());
    } else {
      /* 拆分：按剩余空间降序逐桌填充 */
      var byFree = tables.slice().sort(function (a, b) {
        return (free(b) - free(a)) || (a.index - b.index);
      });
      byFree.forEach(function (t) {
        while (remaining.length && free(t) > 0) t.guests.push(remaining.shift());
      });
      while (remaining.length) unseated.push(remaining.shift());
    }
  });

  /* 无组别宾客：蛇形轮次均衡落座（1→N→1→N…，每轮每桌至多 1 人） */
  var singles = (byGroup[""] || []).slice();
  var guard = 0;
  while (singles.length && guard++ < 100000) {
    var fwd = (guard % 2) === 1;
    var placed = false;
    for (var p = 0; p < T; p++) {
      var ti = fwd ? p : (T - 1 - p);
      if (singles.length && free(tables[ti]) > 0) {
        tables[ti].guests.push(singles.shift());
        placed = true;
      }
    }
    if (!placed) break;
  }
  while (singles.length) unseated.push(singles.shift());

  return {tables: tables, unseated: unseated};
}

/* ---------- 4. 拖拽调桌（纯函数） ---------- */
/* 把 guestName 从所在桌移到 toIndex 桌；返回 {ok, reason}（tables 原地修改） */
function moveGuest(tables, guestName, toIndex) {
  var from = -1, gi = -1, g = null;
  for (var i = 0; i < tables.length; i++) {
    for (var j = 0; j < tables[i].guests.length; j++) {
      if (tables[i].guests[j].name === guestName) { from = i; gi = j; g = tables[i].guests[j]; break; }
    }
    if (g) break;
  }
  if (!g) return {ok: false, reason: "not_found"};
  if (toIndex < 0 || toIndex >= tables.length) return {ok: false, reason: "bad_table"};
  if (from === toIndex) return {ok: true, reason: "same"};
  var target = tables[toIndex];
  if (target.guests.length >= target.capacity) return {ok: false, reason: "full"};
  tables[from].guests.splice(gi, 1);
  target.guests.push(g);
  return {ok: true, reason: ""};
}

/* ---------- 5. 海报尺寸预设 ---------- */
/* w/h 为 CSS 尺寸；pxPerMm 按 96dpi 换算（1mm = 3.7795275591px） */
var TABLE_SIZES = [
  {id: "a3",         name: "A3 竖版",        w: "297mm",  h: "420mm",  pxW: 1122.5, pxH: 1587.4, baseFont: 15, page: "A3 portrait"},
  {id: "a2",         name: "A2 竖版",        w: "420mm",  h: "594mm",  pxW: 1587.4, pxH: 2245.3, baseFont: 20, page: "A2 portrait"},
  {id: "poster6090", name: "竖版海报 60×90cm", w: "600mm", h: "900mm", pxW: 2267.7, pxH: 3401.6, baseFont: 30, page: "600mm 900mm"},
  {id: "screen169",  name: "16:9 电子屏",    w: "1920px", h: "1080px", pxW: 1920,   pxH: 1080,   baseFont: 22, page: "1920px 1080px"}
];
function getSize(id) {
  for (var i = 0; i < TABLE_SIZES.length; i++) if (TABLE_SIZES[i].id === id) return TABLE_SIZES[i];
  return TABLE_SIZES[0];
}

function defaultSettings() {
  return {
    couple1: "", couple2: "", date: "", venue: "",
    guestsText: "",
    tables: 8, perTable: 10, reserved: 2,
    sizePreset: "a3",
    assignments: null /* autoSeat() 结果的 JSON 快照 */
  };
}

/* ---------- 6. 浏览器 UI ---------- */
var LS_KEY = "tw_seating_v1";
var state = defaultSettings();
var saveTimer = null;

function $(id) { return document.getElementById(id); }
function hasDOM() { return typeof document !== "undefined" && typeof window !== "undefined"; }

function saveState() {
  if (!hasDOM()) return;
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
}
function saveSoon() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveState, 400);
}
function loadState() {
  try {
    var raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    var s = JSON.parse(raw);
    if (s && typeof s === "object") {
      ["couple1","couple2","date","venue","guestsText","sizePreset"].forEach(function (k) {
        if (typeof s[k] === "string") state[k] = s[k];
      });
      state.tables = clampInt(s.tables, 8, 1, 200);
      state.perTable = clampInt(s.perTable, 10, 1, 60);
      state.reserved = clampInt(s.reserved, 2, 0, state.perTable);
      if (s.assignments && s.assignments.tables) state.assignments = s.assignments;
    }
  } catch (e) {}
}

function toast(msg) {
  var el = $("seat-toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(function () { el.classList.remove("show"); }, 2200);
}

function sampleGuests() {
  var groups = [["男方亲友", 12], ["女方亲友", 12], ["大学同学", 8], ["同事好友", 8]];
  var surnames = ["王","李","张","刘","陈","杨","黄","赵","吴","周","徐","孙","马","朱","胡","郭","何","罗","梁","宋"];
  var given = ["伟","芳","娜","敏","静","磊","洋","艳","勇","杰","涛","明","超","雪","晨","子涵","欣怡","浩然","一诺","思远"];
  var lines = [], n = 0;
  groups.forEach(function (gp, gi) {
    for (var i = 0; i < gp[1]; i++) {
      n++;
      lines.push(surnames[(n * 7 + gi * 3) % surnames.length] + given[(n * 13 + i) % given.length] + "," + gp[0]);
    }
  });
  return lines.join("\n");
}

function readForm() {
  state.couple1 = $("seat-couple1").value.trim();
  state.couple2 = $("seat-couple2").value.trim();
  state.date = $("seat-date").value;
  state.venue = $("seat-venue").value.trim();
  state.guestsText = $("seat-guests").value;
  state.tables = clampInt($("seat-tables").value, 8, 1, 200);
  state.perTable = clampInt($("seat-pertable").value, 10, 1, 60);
  state.reserved = clampInt($("seat-reserved").value, 2, 0, state.perTable);
}

function renderCounts() {
  var r = parseGuests(state.guestsText);
  var gb = countByGroup(r.guests);
  var ngroup = gb.filter(function (x) { return x.group !== "（未分组）"; }).length;
  $("seat-count").innerHTML =
    "共 <b>" + r.count + "</b> 位宾客" +
    (r.dup ? "（已去重 <b>" + r.dup + "</b> 条重复）" : "") +
    " · <b>" + ngroup + "</b> 个组别" +
    (r.count ? " · " + gb.map(function (x) { return esc(x.group) + " " + x.count + "人"; }).join("，") : "");
  return r;
}

/* ---------- 7. 分桌结果渲染（左侧编辑区） ---------- */
function renderTables() {
  var box = $("seat-tables-result");
  if (!state.assignments) {
    box.innerHTML = '<div class="seat-empty">尚未分桌：在左侧粘贴宾客名单，设置桌数 / 每桌人数 / 主桌预留后，点「一键自动分桌」。分桌后可把宾客拖到任意桌手动调整。</div>';
    return;
  }
  var html = "";
  state.assignments.tables.forEach(function (t) {
    html += '<div class="seat-table" data-table="' + t.index + '">'
      + '<div class="seat-table-hd"><b>' + esc(t.label) + '</b>'
      + '<span>' + t.guests.length + '/' + t.capacity + '人'
      + (t.isMain && t.reserved ? '（预留' + t.reserved + '席）' : '') + '</span></div>'
      + '<div class="seat-drop" data-drop="' + t.index + '">';
    if (!t.guests.length) html += '<span class="seat-drop-hint">空桌（可把宾客拖进来）</span>';
    t.guests.forEach(function (g) {
      html += '<span class="seat-chip" draggable="true" data-guest="' + esc(g.name) + '" data-from="' + t.index + '" title="拖到其他桌调整">'
        + esc(g.name) + (g.group ? '<em>' + esc(g.group) + '</em>' : '') + '</span>';
    });
    html += '</div></div>';
  });
  if (state.assignments.unseated && state.assignments.unseated.length) {
    html += '<div class="seat-warn"><i class="material-icons">warning</i><div>另有 <b>'
      + state.assignments.unseated.length + '</b> 位宾客超出总容量未安排：'
      + esc(state.assignments.unseated.map(function (g) { return g.name; }).join("、"))
      + '。请增加桌数或每桌人数后重新自动分桌。</div></div>';
  }
  box.innerHTML = html;
  bindDrag();
}

function bindDrag() {
  var chips = document.querySelectorAll(".seat-chip");
  chips.forEach(function (chip) {
    chip.addEventListener("dragstart", function (ev) {
      ev.dataTransfer.setData("text/plain", JSON.stringify({
        guest: chip.getAttribute("data-guest"),
        from: parseInt(chip.getAttribute("data-from"), 10)
      }));
      ev.dataTransfer.effectAllowed = "move";
    });
  });
  var drops = document.querySelectorAll(".seat-drop");
  drops.forEach(function (zone) {
    zone.addEventListener("dragover", function (ev) {
      ev.preventDefault();
      ev.dataTransfer.dropEffect = "move";
      zone.classList.add("over");
    });
    zone.addEventListener("dragleave", function () { zone.classList.remove("over"); });
    zone.addEventListener("drop", function (ev) {
      ev.preventDefault();
      zone.classList.remove("over");
      var data;
      try { data = JSON.parse(ev.dataTransfer.getData("text/plain")); } catch (e) { return; }
      var to = parseInt(zone.getAttribute("data-drop"), 10);
      var r = moveGuest(state.assignments.tables, data.guest, to);
      if (!r.ok && r.reason === "full") { toast("该桌已满（容量钳制），换一桌试试"); return; }
      if (!r.ok) { toast("移动失败"); return; }
      saveState();
      renderTables();
      renderPoster();
    });
  });
}

function doAutoSeat() {
  readForm();
  var r = parseGuests(state.guestsText);
  if (!r.count) { toast("请先粘贴宾客名单"); return; }
  state.assignments = autoSeat(r.guests, {tables: state.tables, perTable: state.perTable, reserved: state.reserved});
  saveState();
  renderTables();
  renderPoster();
  var seated = r.count - state.assignments.unseated.length;
  toast("已分桌：共 " + r.count + " 人，安排 " + seated + " 人" +
    (state.assignments.unseated.length ? "，" + state.assignments.unseated.length + " 人超出容量" : ""));
}

/* ---------- 8. 海报渲染（右侧打印级预览） ---------- */
function posterTitle() {
  var c1 = state.couple1, c2 = state.couple2;
  var names = (c1 && c2) ? (c1 + " ♥ " + c2) : (c1 || c2 || "新郎 ♥ 新娘");
  var date = state.date || "____年__月__日";
  var venue = state.venue ? " · " + state.venue : "";
  return {names: names, date: date, venue: venue};
}

function renderPoster() {
  var size = getSize(state.sizePreset);
  var poster = $("seat-poster");
  poster.style.width = size.pxW + "px";
  poster.style.height = size.pxH + "px";
  poster.style.fontSize = size.baseFont + "px";
  var t = posterTitle();
  var html = '<div class="seat-poster-hd">'
    + '<div class="seat-poster-xi">囍</div>'
    + '<h2>' + esc(t.names) + '</h2>'
    + '<p>婚宴座位表 · ' + esc(t.date) + esc(t.venue) + '</p></div>';
  if (!state.assignments) {
    html += '<div class="seat-poster-empty">左侧完成「一键自动分桌」后，这里生成打印级座位表海报</div>';
  } else {
    html += '<div class="seat-poster-grid">';
    state.assignments.tables.forEach(function (tb) {
      html += '<div class="seat-poster-card' + (tb.isMain ? " main" : "") + '">'
        + '<div class="seat-poster-card-hd">' + esc(tb.label)
        + (tb.isMain && tb.reserved ? '<span>预留' + tb.reserved + '席</span>' : "")
        + '</div><div class="seat-poster-names">';
      tb.guests.forEach(function (g) {
        html += '<span>' + esc(g.name) + '</span>';
      });
      for (var k = tb.guests.length; k < tb.capacity; k++) html += '<span class="empty-seat">·</span>';
      html += '</div><div class="seat-poster-card-ft">' + tb.guests.length + '/' + tb.capacity + '人</div></div>';
    });
    html += '</div>';
    if (state.assignments.unseated && state.assignments.unseated.length) {
      html += '<div class="seat-poster-note">注：另有 ' + state.assignments.unseated.length
        + ' 位宾客超出容量未列入本表（' + esc(state.assignments.unseated.map(function (g) { return g.name; }).join("、")) + '）</div>';
    }
  }
  /* 出血裁切标记（3mm 出血，标记画在裁切线外） */
  html += '<i class="cm h tl-h"></i><i class="cm v tl-v"></i>'
    + '<i class="cm h tr-h"></i><i class="cm v tr-v"></i>'
    + '<i class="cm h bl-h"></i><i class="cm v bl-v"></i>'
    + '<i class="cm h br-h"></i><i class="cm v br-v"></i>';
  poster.innerHTML = html;
  fitPreview();
}

function fitPreview() {
  var size = getSize(state.sizePreset);
  var wrap = $("seat-preview");
  var scaler = $("seat-poster-scaler");
  var avail = wrap.clientWidth || 600;
  var s = Math.min(1, (avail - 4) / size.pxW);
  scaler.style.transform = "scale(" + s + ")";
  scaler.style.width = size.pxW + "px";
  scaler.style.height = size.pxH + "px";
  wrap.style.height = Math.ceil(size.pxH * s) + 24 + "px";
}

function updatePageSize() {
  var size = getSize(state.sizePreset);
  var el = $("seat-pagesize");
  if (el) el.textContent = "@page{size:" + size.page + ";margin:0}";
}

/* ---------- 9. 事件绑定与初始化 ---------- */
function fillForm() {
  $("seat-couple1").value = state.couple1;
  $("seat-couple2").value = state.couple2;
  $("seat-date").value = state.date;
  $("seat-venue").value = state.venue;
  $("seat-guests").value = state.guestsText;
  $("seat-tables").value = state.tables;
  $("seat-pertable").value = state.perTable;
  $("seat-reserved").value = state.reserved;
  var sel = $("seat-size");
  for (var i = 0; i < sel.options.length; i++) {
    if (sel.options[i].value === state.sizePreset) { sel.selectedIndex = i; break; }
  }
}

function init() {
  loadState();
  fillForm();
  renderCounts();
  renderTables();
  renderPoster();
  updatePageSize();

  $("seat-guests").addEventListener("input", function () {
    state.guestsText = $("seat-guests").value;
    renderCounts();
    saveSoon();
  });
  ["seat-couple1", "seat-couple2", "seat-date", "seat-venue"].forEach(function (id) {
    $(id).addEventListener("input", function () { readForm(); renderPoster(); saveSoon(); });
  });
  ["seat-tables", "seat-pertable", "seat-reserved"].forEach(function (id) {
    $(id).addEventListener("input", function () {
      readForm();
      if (state.assignments) { /* 参数变了提示重分，避免静默失配 */ }
      saveSoon();
    });
    $(id).addEventListener("change", function () { readForm(); saveState(); });
  });
  $("seat-size").addEventListener("change", function () {
    state.sizePreset = $("seat-size").value;
    updatePageSize();
    renderPoster();
    saveState();
  });
  $("seat-auto").addEventListener("click", doAutoSeat);
  $("seat-sample").addEventListener("click", function () {
    if ($("seat-guests").value.trim() && !confirm("将用 40 人示例名单（4 个组别）替换当前名单，继续？")) return;
    $("seat-guests").value = sampleGuests();
    state.guestsText = $("seat-guests").value;
    if (!state.couple1 && !state.couple2) {
      $("seat-couple1").value = "陈子涵"; $("seat-couple2").value = "林欣怡";
      $("seat-date").value = "2026-12-26";
    }
    readForm(); renderCounts(); saveState();
    toast("已载入 40 人示例名单，可直接点「一键自动分桌」");
  });
  $("seat-clear").addEventListener("click", function () {
    if (!confirm("清空名单与分桌结果？（设置保留）")) return;
    $("seat-guests").value = "";
    state.guestsText = "";
    state.assignments = null;
    renderCounts(); renderTables(); renderPoster(); saveState();
  });
  $("seat-reset-all").addEventListener("click", function () {
    if (!confirm("清空全部内容（含设置），恢复初始状态？")) return;
    try { localStorage.removeItem(LS_KEY); } catch (e) {}
    state = defaultSettings();
    fillForm(); renderCounts(); renderTables(); renderPoster(); updatePageSize();
  });
  $("seat-print").addEventListener("click", function () {
    readForm();
    if (!state.assignments) { toast("请先完成自动分桌再打印"); return; }
    renderPoster();
    setTimeout(function () { window.print(); }, 60);
  });
  window.addEventListener("resize", fitPreview);
}

if (hasDOM()) {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    clampInt: clampInt, esc: esc,
    parseGuests: parseGuests, countByGroup: countByGroup,
    autoSeat: autoSeat, moveGuest: moveGuest,
    TABLE_SIZES: TABLE_SIZES, getSize: getSize,
    defaultSettings: defaultSettings, LS_KEY: LS_KEY
  };
}
})();
