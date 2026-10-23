/* 年会大屏抽奖（annual_lottery）：纯前端年会抽奖大屏工具
 *
 * 功能：
 *  1) 名单导入：大文本框粘贴（每行一人），支持「姓名-工号」格式，自动去重并报告去重计数
 *  2) 奖项配置：预设一/二/三等奖（奖项名＋名额），支持增删改、自定义奖项、设为当前奖项
 *  3) 抽奖轮次：按奖项逐轮抽；点击「开始」即用 crypto.getRandomValues 预抽中奖者（均匀、
 *     不可预测），姓名跑马灯高速滚动 → 点击「停止」后 easeOutQuart 缓动减速 3 秒逐个定格
 *  4) 中奖公示：按奖项分组展示，一键复制 / 下载 txt（含奖项＋姓名）
 *  5) 全屏大屏模式：深色高对比、超大字体（clamp/vw），Esc 退出；大屏内可直接开始/停止
 *  6) 防重复：默认开启，已中奖者自动移出候选池；可关闭
 *  7) localStorage 持久化：名单 / 奖项 / 中奖记录 / 防重复开关 / 当前奖项，刷新不丢；
 *     「重置本轮」清空中奖记录回候选池，「全部清空」恢复初始态
 * 零广告、零水印、零登录；不引第三方库；零 fetch/XHR；脚本内不做任何网络请求。
 * 纯函数经 module.exports 暴露，node tests/annual_lottery.test.js 自测；
 * 浏览器内 init 挂 DOMContentLoaded。
 */
(function () {
"use strict";

function hasDOM() { return typeof document !== "undefined"; }

/* ================= 0. 常量与小工具 ================= */
var STORE_KEY = "annual_lottery_v1";
var SETTLE_MS = 3200; /* 单个中奖者减速定格时长（3.2 秒） */

function trim(s) { return String(s == null ? "" : s).replace(/^\s+|\s+$/g, ""); }
function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function pad2(n) { return (n < 10 ? "0" : "") + n; }
function fmtDateTime(d) {
  d = d || new Date();
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) +
    " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds());
}

/* ================= 1. 名单解析 ================= */
/* 支持「姓名-工号」格式：按第一个 - / — / ：/ : / | 分隔，前段为姓名，后段为附加信息 */
var NAME_SEP_RE = /^(.+?)\s*[-—：:|／\/]\s*(.+)$/;

function parseOneName(raw) {
  raw = trim(raw);
  var m = raw.match(NAME_SEP_RE);
  if (m && trim(m[1])) return { name: trim(m[1]), extra: trim(m[2]), raw: raw };
  return { name: raw, extra: "", raw: raw };
}

/* parseNames(text) -> {people:[{name,extra,raw}], total:有效行数, dup:去重数}
 * 去重键为 trim 后的整行原文，保留首次出现顺序，空行跳过。 */
function parseNames(text) {
  var lines = String(text == null ? "" : text).split(/\r\n|\r|\n/);
  var seen = {}, people = [], dup = 0, total = 0, i, raw;
  for (i = 0; i < lines.length; i++) {
    raw = trim(lines[i]);
    if (!raw) continue;
    total++;
    if (seen[raw]) { dup++; continue; }
    seen[raw] = 1;
    people.push(parseOneName(raw));
  }
  return { people: people, total: total, dup: dup };
}

/* ================= 2. 奖项配置 ================= */
function defaultAwards() {
  return [
    { id: "a1", name: "一等奖", count: 1 },
    { id: "a2", name: "二等奖", count: 2 },
    { id: "a3", name: "三等奖", count: 3 }
  ];
}

var _awardSeq = 0;
function newAwardId() {
  _awardSeq++;
  return "a" + Date.now().toString(36) + "_" + _awardSeq;
}

/* validateAward(name, count) -> "" 合法，否则返回中文错误信息 */
function validateAward(name, count) {
  name = trim(name);
  if (!name) return "奖项名不能为空";
  if (name.length > 30) return "奖项名过长（上限 30 字）";
  var n = Number(count);
  if (!isFinite(n) || Math.floor(n) !== n || n < 1) return "名额必须为正整数";
  if (n > 1000) return "名额过大（上限 1000）";
  return "";
}

function normAward(a) {
  return { id: String(a.id || newAwardId()), name: trim(a.name), count: Math.max(1, Math.floor(Number(a.count) || 1)) };
}

/* ================= 3. 安全随机抽取 ================= */
/* secureRandInt(n, randFn?) -> [0, n) 均匀整数。
 * 默认走 crypto.getRandomValues（拒绝采样消除模偏差）；randFn 仅供测试注入确定性序列。 */
function secureRandInt(n, randFn) {
  n = Math.floor(n);
  if (!(n > 0)) return 0;
  if (typeof randFn === "function") {
    var r = Math.floor(randFn(n));
    if (r < 0) return 0;
    if (r >= n) return n - 1;
    return r;
  }
  var gCrypto = (typeof crypto !== "undefined" && crypto && crypto.getRandomValues) ? crypto :
    (typeof window !== "undefined" && window.crypto && window.crypto.getRandomValues ? window.crypto : null);
  if (gCrypto) {
    var arr = new Uint32Array(1);
    var range = 4294967296, limit = range - (range % n), x;
    do { gCrypto.getRandomValues(arr); x = arr[0]; } while (x >= limit);
    return x % n;
  }
  return Math.floor(Math.random() * n); /* 极旧环境兜底 */
}

/* drawWinners(pool, count, randFn?) -> 从 pool 不放回均匀抽取 count 个（不足则全取） */
function drawWinners(pool, count, randFn) {
  var bag = pool.slice(), out = [], i, j;
  var k = Math.max(0, Math.min(Math.floor(count) || 0, bag.length));
  for (i = 0; i < k; i++) {
    j = secureRandInt(bag.length, randFn);
    out.push(bag.splice(j, 1)[0]);
  }
  return out;
}

/* ================= 4. 候选池 ================= */
/* noRepeat 开启时，已中奖者（按 raw 去重键）自动移出候选池；关闭时全量可抽 */
function buildPool(people, winners, noRepeat) {
  if (!noRepeat) return people.slice();
  var won = {}, i;
  for (i = 0; i < winners.length; i++) won[winners[i].raw] = 1;
  return people.filter(function (p) { return !won[p.raw]; });
}

/* ================= 5. 中奖导出文本 ================= */
function exportWinnersText(winners, when) {
  var groups = [], map = {}, i, w;
  for (i = 0; i < winners.length; i++) {
    w = winners[i];
    var key = w.awardName || "未命名奖项";
    if (!map[key]) { map[key] = []; groups.push(key); }
    map[key].push(w);
  }
  var lines = ["年会抽奖中奖名单", "导出时间：" + fmtDateTime(when || new Date()), ""];
  if (!groups.length) lines.push("（暂无中奖记录）");
  for (i = 0; i < groups.length; i++) {
    var ws = map[groups[i]];
    lines.push(groups[i] + "（" + ws.length + "名）：");
    for (var k = 0; k < ws.length; k++) {
      lines.push((k + 1) + ". " + ws[k].name + (ws[k].extra ? "（" + ws[k].extra + "）" : ""));
    }
    lines.push("");
  }
  lines.push("—— 年会大屏抽奖 · 纯前端本地抽奖");
  return lines.join("\n");
}

/* ================= 6. 缓动 ================= */
function easeOutQuart(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return 1 - Math.pow(1 - t, 4);
}

/* ================= 7. 持久化 ================= */
function memStorage() {
  var d = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; },
    setItem: function (k, v) { d[k] = String(v); },
    removeItem: function (k) { delete d[k]; }
  };
}

function createStore(storage) {
  function load() {
    try {
      var raw = storage.getItem(STORE_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || !Array.isArray(s.people) || !Array.isArray(s.awards) || !Array.isArray(s.winners)) return null;
      return s;
    } catch (e) { return null; }
  }
  function save(s) { try { storage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) { /* 配额满等直接忽略 */ } }
  function clear() { try { storage.removeItem(STORE_KEY); } catch (e) {} }
  return { load: load, save: save, clear: clear, key: STORE_KEY };
}

function defaultState() {
  return { people: [], awards: defaultAwards(), winners: [], noRepeat: true, currentAwardId: "a1" };
}

function validPerson(p) {
  return p && typeof p.name === "string" && trim(p.name) &&
    { name: trim(p.name), extra: trim(p.extra || ""), raw: String(p.raw || trim(p.name)) };
}

function normalizeState(s) {
  var st = defaultState();
  if (s && Array.isArray(s.people)) {
    st.people = s.people.map(validPerson).filter(Boolean);
  }
  if (s && Array.isArray(s.awards) && s.awards.length) {
    var as = s.awards.map(normAward).filter(function (a) { return a.name && !validateAward(a.name, a.count); });
    if (as.length) st.awards = as;
  }
  if (s && Array.isArray(s.winners)) {
    st.winners = s.winners.filter(function (w) {
      return w && trim(w.name);
    }).map(function (w) {
      return { awardId: String(w.awardId || ""), awardName: trim(w.awardName || "未命名奖项"),
               name: trim(w.name), extra: trim(w.extra || ""), raw: String(w.raw || trim(w.name)),
               ts: Number(w.ts) || 0 };
    });
  }
  st.noRepeat = !s || s.noRepeat !== false;
  var ids = {}, i;
  for (i = 0; i < st.awards.length; i++) ids[st.awards[i].id] = 1;
  st.currentAwardId = (s && ids[s.currentAwardId]) ? s.currentAwardId : st.awards[0].id;
  return st;
}

/* ================= 8. 内置示例名单（50 人，供一键体验） ================= */
function buildSamplePeople() {
  var surnames = ["张", "王", "李", "赵", "陈", "刘", "杨", "黄", "周", "吴",
                  "徐", "孙", "马", "朱", "胡", "郭", "何", "罗", "梁", "宋"];
  var givens = ["伟", "芳", "娜", "敏", "静", "磊", "洋", "艳", "勇", "杰",
                "涛", "明", "超", "雪", "晨", "欣怡", "浩然", "一诺", "思远", "子涵"];
  var out = [], i, code;
  for (i = 0; i < 50; i++) {
    code = (i < 9 ? "00" : "0") + (i + 1);
    out.push(surnames[i % 20] + givens[(i * 7 + 3) % 20] + "-" + code);
  }
  return parseNames(out.join("\n")).people;
}

/* ================= 9. 浏览器 UI ================= */
if (hasDOM()) (function () {

var store = createStore((typeof localStorage !== "undefined") ? localStorage : memStorage());
var state = normalizeState(store.load());
var draw = null; /* 当前抽奖会话 {award, pool, picked, revealed, phase, t0, lastSwap, displayPool} */

function $(id) { return document.getElementById(id); }
function persist() { store.save(state); }

var toastTimer = null;
function toast(msg) {
  var el = $("al-toast");
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.style.display = "none"; }, 2600);
}

/* ---------- 奖项 ---------- */
function getAward(id) {
  for (var i = 0; i < state.awards.length; i++) if (state.awards[i].id === id) return state.awards[i];
  return null;
}
function awardWinners(awardId) {
  return state.winners.filter(function (w) { return w.awardId === awardId; });
}
function nextAwardId() {
  for (var i = 0; i < state.awards.length; i++) {
    if (awardWinners(state.awards[i].id).length === 0) return state.awards[i].id;
  }
  return state.awards.length ? state.awards[0].id : null;
}

function renderAwards() {
  var box = $("al-awards");
  if (!box) return;
  var html = "";
  for (var i = 0; i < state.awards.length; i++) {
    (function (a, idx) {
      var cur = a.id === state.currentAwardId;
      var done = awardWinners(a.id).length > 0;
      html += '<div class="al-awardrow' + (cur ? " al-cur" : "") + '">' +
        '<input type="text" class="al-awardname" data-id="' + esc(a.id) + '" value="' + esc(a.name) + '" maxlength="30" aria-label="奖项名">' +
        '<input type="number" class="al-awardcount" data-id="' + esc(a.id) + '" value="' + a.count + '" min="1" max="1000" aria-label="名额">' +
        '<span class="al-awardunit">名</span>' +
        (done ? '<span class="al-done">已抽</span>' : "") +
        '<button class="al-btn al-btn-sm' + (cur ? " al-btn-primary" : "") + '" data-act="cur" data-id="' + esc(a.id) + '">' +
        (cur ? "当前" : "设为当前") + "</button>" +
        '<button class="al-btn al-btn-sm al-btn-danger" data-act="del" data-id="' + esc(a.id) + '" aria-label="删除奖项">✕</button>' +
        "</div>";
    })(state.awards[i], i);
  }
  box.innerHTML = html || '<div class="al-empty">暂无奖项，请添加</div>';
  var names = box.querySelectorAll(".al-awardname");
  for (var n = 0; n < names.length; n++) {
    names[n].addEventListener("change", function () {
      var a = getAward(this.getAttribute("data-id"));
      if (!a) return;
      var err = validateAward(this.value, a.count);
      if (err) { toast(err); this.value = a.name; return; }
      a.name = trim(this.value); persist(); renderRoundHead(); renderWinners();
    });
  }
  var counts = box.querySelectorAll(".al-awardcount");
  for (var c = 0; c < counts.length; c++) {
    counts[c].addEventListener("change", function () {
      var a = getAward(this.getAttribute("data-id"));
      if (!a) return;
      var err = validateAward(a.name, this.value);
      if (err) { toast(err); this.value = a.count; return; }
      a.count = Math.floor(Number(this.value)); persist(); renderRoundHead();
    });
  }
  var btns = box.querySelectorAll("button[data-act]");
  for (var b = 0; b < btns.length; b++) {
    btns[b].addEventListener("click", function () {
      var id = this.getAttribute("data-id"), act = this.getAttribute("data-act");
      if (act === "cur") { state.currentAwardId = id; persist(); renderAwards(); renderRoundHead(); }
      else if (act === "del") {
        if (state.awards.length <= 1) { toast("至少保留一个奖项"); return; }
        state.awards = state.awards.filter(function (a) { return a.id !== id; });
        if (state.currentAwardId === id) state.currentAwardId = state.awards[0].id;
        persist(); renderAwards(); renderRoundHead(); renderWinners();
      }
    });
  }
}

function addAward() {
  var a = { id: newAwardId(), name: "自定义奖", count: 1 };
  state.awards.push(a);
  state.currentAwardId = a.id;
  persist(); renderAwards(); renderRoundHead();
  toast("已添加奖项，可修改名称与名额");
}

/* ---------- 名单 / 候选池 ---------- */
function poolNow() { return buildPool(state.people, state.winners, state.noRepeat); }

function renderPool() {
  var pool = poolNow();
  var stat = $("al-pool-stat");
  if (stat) stat.textContent = "候选池 " + pool.length + " 人 · 已中奖 " + state.winners.length + " 人" +
    (state.noRepeat ? "（防重复开）" : "（防重复关）");
  var box = $("al-pool-list");
  if (!box) return;
  if (!pool.length) { box.innerHTML = '<div class="al-empty">候选池为空，请先导入名单</div>'; return; }
  var show = pool.slice(0, 120), html = "";
  for (var i = 0; i < show.length; i++) {
    html += '<span class="al-chip">' + esc(show[i].name) +
      (show[i].extra ? '<small>' + esc(show[i].extra) + "</small>" : "") + "</span>";
  }
  if (pool.length > 120) html += '<span class="al-chip al-more">…等共 ' + pool.length + " 人</span>";
  box.innerHTML = html;
}

function doImport(append) {
  var r = parseNames($("al-input").value);
  if (!r.total) { toast("输入为空：请每行粘贴一个姓名"); return; }
  if (append) {
    var seen = {}, i;
    for (i = 0; i < state.people.length; i++) seen[state.people[i].raw] = 1;
    var added = 0;
    for (i = 0; i < r.people.length; i++) {
      if (!seen[r.people[i].raw]) { seen[r.people[i].raw] = 1; state.people.push(r.people[i]); added++; }
    }
    toast("追加导入 " + added + " 人（新增文本内去重 " + r.dup + " 人），候选池共 " + state.people.length + " 人");
  } else {
    state.people = r.people;
    toast("导入 " + r.total + " 行，去重 " + r.dup + " 人，候选池共 " + r.people.length + " 人");
  }
  var st = $("al-import-stat");
  if (st) st.textContent = "最近一次：输入 " + r.total + " 行 · 去重 " + r.dup + " 人 · 实得 " + r.people.length + " 人";
  persist(); renderPool();
}

function loadSample() {
  /* 与 buildSamplePeople 同源的 50 人中文名单，一键体验 */
  var real = buildSamplePeople().map(function (p) { return p.raw; });
  $("al-input").value = real.join("\n");
  doImport(false);
}

/* ---------- 中奖公示 ---------- */
function renderWinners() {
  var box = $("al-winners");
  if (!box) return;
  if (!state.winners.length) { box.innerHTML = '<div class="al-empty">暂无中奖记录，抽奖后将在此公示</div>'; return; }
  var order = [], map = {}, i, w;
  for (i = 0; i < state.awards.length; i++) order.push(state.awards[i]);
  for (i = 0; i < state.winners.length; i++) {
    w = state.winners[i];
    var key = w.awardId || w.awardName;
    if (!map[key]) map[key] = [];
    map[key].push(w);
  }
  var html = "";
  function groupCard(title, ws, awardId) {
    var h = '<div class="al-wgroup"><div class="al-whead"><b>' + esc(title) + "</b>" +
      '<span class="al-wcount">' + ws.length + "名</span>" +
      (awardId ? '<button class="al-btn al-btn-sm" data-undo="' + esc(awardId) + '">撤销本奖项</button>' : "") + "</div>" +
      '<div class="al-wlist">';
    for (var k = 0; k < ws.length; k++) {
      h += '<span class="al-wchip">' + esc(ws[k].name) +
        (ws[k].extra ? "<small>" + esc(ws[k].extra) + "</small>" : "") + "</span>";
    }
    return h + "</div></div>";
  }
  for (i = 0; i < order.length; i++) {
    var ws = map[order[i].id];
    if (ws && ws.length) html += groupCard(order[i].name, ws, order[i].id);
  }
  /* 奖项被删后仍保留记录的，按奖项名兜底展示 */
  var seenIds = {};
  for (i = 0; i < order.length; i++) seenIds[order[i].id] = 1;
  var rest = {};
  for (i = 0; i < state.winners.length; i++) {
    w = state.winners[i];
    if (!seenIds[w.awardId]) {
      var rk = "x:" + (w.awardName || "未命名奖项");
      if (!rest[rk]) rest[rk] = { title: w.awardName || "未命名奖项", ws: [] };
      rest[rk].ws.push(w);
    }
  }
  for (var rk2 in rest) if (Object.prototype.hasOwnProperty.call(rest, rk2)) html += groupCard(rest[rk2].title, rest[rk2].ws, null);
  box.innerHTML = html;
  var undos = box.querySelectorAll("[data-undo]");
  for (var u = 0; u < undos.length; u++) {
    undos[u].addEventListener("click", function () {
      var id = this.getAttribute("data-undo");
      var n = 0;
      state.winners = state.winners.filter(function (x) { if (x.awardId === id) { n++; return false; } return true; });
      persist(); renderWinners(); renderPool(); renderAwards(); renderRoundHead();
      toast("已撤销该奖项 " + n + " 位中奖者，已放回候选池");
    });
  }
}

/* ---------- 抽奖舞台 ---------- */
function showName(txt, sub) {
  var el = $("al-stage-name");
  if (el) el.textContent = txt;
  var ss = $("al-stage-sub");
  if (ss) ss.textContent = sub || "";
  var fs = $("al-fs-name");
  if (fs) fs.textContent = txt;
  var fss = $("al-fs-sub");
  if (fss) fss.textContent = sub || "";
}

function renderRoundHead() {
  var a = getAward(state.currentAwardId);
  var t = $("al-round-title"), ft = $("al-fs-award");
  var label = a ? (a.name + " · " + a.count + "名") : "未选择奖项";
  if (t) t.textContent = label;
  if (ft) ft.textContent = label;
  var rw = $("al-round-winners");
  if (rw && !draw) rw.innerHTML = "";
}

function setDrawButtons(running, settling) {
  var s = $("al-start"), st = $("al-stop"), c = $("al-cancel");
  var fs = $("al-fs-start"), fst = $("al-fs-stop");
  if (s) s.disabled = running;
  if (fs) fs.disabled = running;
  if (st) st.disabled = !running || !!settling;
  if (fst) fst.disabled = !running || !!settling;
  if (c) c.style.display = running ? "" : "none";
}

function pickVisualName(d) {
  var p = d.displayPool, i;
  if (!p.length) return "—";
  /* 滚动展示时避开已预抽的中奖者，保持悬念 */
  for (var t = 0; t < 8; t++) {
    i = secureRandInt(p.length);
    if (!p[i]._picked) return p[i].name;
  }
  return p[secureRandInt(p.length)].name;
}

function startDraw() {
  if (draw) return;
  var award = getAward(state.currentAwardId);
  if (!award) { toast("请先添加奖项"); return; }
  var err = validateAward(award.name, award.count);
  if (err) { toast("当前奖项配置无效：" + err); return; }
  if (!state.people.length) { toast("请先导入抽奖名单"); return; }
  var pool = poolNow();
  if (!pool.length) { toast("候选池已空：全部已中奖，可「重置本轮」或关闭防重复"); return; }
  if (pool.length < award.count) {
    toast("候选池仅剩 " + pool.length + " 人，少于「" + award.name + "」名额 " + award.count + " 人，请补充名单或调小名额");
    return;
  }
  /* 公平性：点击开始瞬间即用 crypto 均匀预抽，动画只做展示，停止时机不影响结果 */
  var picked = drawWinners(pool, award.count);
  var flag = {}, i;
  for (i = 0; i < picked.length; i++) flag[picked[i].raw] = 1;
  var displayPool = pool.map(function (p) {
    var c = { name: p.name, _picked: !!flag[p.raw] };
    return c;
  });
  draw = { award: award, pool: pool, picked: picked, revealed: 0,
           phase: "rolling", t0: 0, lastSwap: 0, displayPool: displayPool };
  $("al-round-winners").innerHTML = "";
  var fw = $("al-fs-winners");
  if (fw) fw.innerHTML = "";
  setDrawButtons(true, false);
  setStatus("滚动中…点击「停止」开始减速定格（结果已在开始瞬间随机确定）");
  requestAnimationFrame(tick);
}

function setStatus(msg) {
  var el = $("al-round-status");
  if (el) el.textContent = msg;
  var fs = $("al-fs-hint");
  if (fs) fs.textContent = msg;
}

function tick(now) {
  if (!draw) return;
  var d = draw;
  if (d.phase === "rolling") {
    if (now - d.lastSwap >= 80) { d.lastSwap = now; showName(pickVisualName(d)); }
    d.raf = requestAnimationFrame(tick);
    return;
  }
  /* settling：easeOutQuart 缓动，换名间隔从 70ms 指数拉长到 900ms */
  var t = (now - d.t0) / SETTLE_MS;
  if (t >= 1) { settleOne(d); return; }
  var interval = 70 + (900 - 70) * easeOutQuart(t);
  if (now - d.lastSwap >= interval) { d.lastSwap = now; showName(pickVisualName(d)); }
  d.raf = requestAnimationFrame(tick);
}

function stopDraw() {
  if (!draw || draw.phase !== "rolling") return;
  draw.phase = "settling";
  draw.t0 = performance.now();
  draw.lastSwap = 0;
  setDrawButtons(true, true);
  setStatus("减速中…即将揭晓第 " + (draw.revealed + 1) + " 位中奖者");
}

function settleOne(d) {
  var w = d.picked[d.revealed];
  showName(w.name, w.extra ? ("工号 " + w.extra) : "");
  flashStage();
  d.revealed++;
  appendRoundWinner(w, d.revealed);
  if (d.revealed < d.picked.length) {
    /* 下一位：短暂滚动态势后继续减速 */
    d.phase = "rolling";
    d.t0 = 0; d.lastSwap = 0;
    setStatus("已揭晓 " + d.revealed + " 位，继续滚动…点击「停止」揭晓下一位");
    setDrawButtons(true, false);
    d.raf = requestAnimationFrame(tick);
  } else {
    finishDraw();
  }
}

function appendRoundWinner(w, idx) {
  var rw = $("al-round-winners");
  if (rw) {
    var s = document.createElement("span");
    s.className = "al-hit";
    s.innerHTML = "<b>" + idx + "</b>" + esc(w.name) + (w.extra ? "<small>" + esc(w.extra) + "</small>" : "");
    rw.appendChild(s);
  }
  var fw = $("al-fs-winners");
  if (fw) {
    var f = document.createElement("span");
    f.className = "al-hit";
    f.textContent = w.name;
    fw.appendChild(f);
  }
}

function flashStage() {
  var el = $("al-stage");
  if (!el) return;
  el.classList.remove("al-flash");
  void el.offsetWidth;
  el.classList.add("al-flash");
}

function finishDraw() {
  var d = draw;
  var ts = Date.now(), i;
  for (i = 0; i < d.picked.length; i++) {
    var w = d.picked[i];
    state.winners.push({ awardId: d.award.id, awardName: d.award.name,
      name: w.name, extra: w.extra, raw: w.raw, ts: ts });
  }
  draw = null;
  setDrawButtons(false, false);
  setStatus("本轮完成：「" + d.award.name + "」" + d.picked.length + " 位中奖者已公示" +
    (state.noRepeat ? "（已移出候选池）" : ""));
  var nid = nextAwardId();
  if (nid && nid !== state.currentAwardId) {
    state.currentAwardId = nid;
    var na = getAward(nid);
    if (na && awardWinners(nid).length === 0) setStatus("本轮完成，已自动切换到下一奖项「" + na.name + "」");
  }
  persist(); renderWinners(); renderPool(); renderAwards(); renderRoundHead();
  toast("抽奖完成，中奖名单已公示");
}

function cancelDraw() {
  if (!draw) return;
  draw = null;
  setDrawButtons(false, false);
  showName("待抽奖", "");
  $("al-round-winners").innerHTML = "";
  var fw = $("al-fs-winners");
  if (fw) fw.innerHTML = "";
  setStatus("已取消本轮，结果未记录");
}

/* ---------- 导出 ---------- */
function fallbackCopy(t) {
  var ta = document.createElement("textarea");
  ta.value = t;
  ta.style.position = "fixed"; ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); } catch (e) {}
  document.body.removeChild(ta);
}
function copyWinners() {
  if (!state.winners.length) { toast("暂无中奖记录可复制"); return; }
  var txt = exportWinnersText(state.winners);
  function done() { toast("中奖名单已复制到剪贴板"); }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).then(done, function () { fallbackCopy(txt); done(); });
  } else { fallbackCopy(txt); done(); }
}
function downloadWinners() {
  if (!state.winners.length) { toast("暂无中奖记录可下载"); return; }
  var txt = exportWinnersText(state.winners);
  var blob = new Blob(["﻿" + txt], { type: "text/plain;charset=utf-8" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "年会中奖名单.txt";
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  toast("已下载「年会中奖名单.txt」");
}

/* ---------- 全屏大屏 ---------- */
function enterFS() {
  var el = $("al-fs");
  if (!el) return;
  el.style.display = "flex";
  renderRoundHead();
  try {
    var de = document.documentElement;
    if (de.requestFullscreen) { var p = de.requestFullscreen(); if (p && p.catch) p.catch(function () {}); }
  } catch (e) {}
}
function exitFS() {
  var el = $("al-fs");
  if (el) el.style.display = "none";
  try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen(); } catch (e) {}
}

/* ---------- 设置 ---------- */
function resetRound() {
  if (!state.winners.length) { toast("暂无中奖记录可重置"); return; }
  if (!window.confirm("确定清空全部中奖记录？中奖者将放回候选池。")) return;
  state.winners = [];
  state.currentAwardId = state.awards.length ? state.awards[0].id : null;
  persist(); renderWinners(); renderPool(); renderAwards(); renderRoundHead();
  showName("待抽奖", "");
  toast("已重置：中奖记录清空，候选池恢复");
}
function clearAll() {
  if (!window.confirm("确定全部清空？名单、奖项、中奖记录与开关将恢复初始状态。")) return;
  state = defaultState();
  store.clear(); persist();
  draw = null;
  setDrawButtons(false, false);
  $("al-input").value = "";
  var st = $("al-import-stat");
  if (st) st.textContent = "";
  $("al-round-winners").innerHTML = "";
  var nr = $("al-norepeat");
  if (nr) nr.checked = true;
  showName("待抽奖", "");
  setStatus("就绪：导入名单 → 配置奖项 → 开始抽奖");
  renderAwards(); renderPool(); renderWinners(); renderRoundHead();
  toast("已全部清空，恢复初始状态");
}

/* ---------- init ---------- */
function init() {
  var nr = $("al-norepeat");
  if (nr) {
    nr.checked = state.noRepeat !== false;
    nr.addEventListener("change", function () {
      state.noRepeat = nr.checked; persist(); renderPool();
      toast(state.noRepeat ? "防重复已开启：已中奖者移出候选池" : "防重复已关闭：已中奖者可重复中奖");
    });
  }
  if ($("al-import")) $("al-import").addEventListener("click", function () { doImport(false); });
  if ($("al-append")) $("al-append").addEventListener("click", function () { doImport(true); });
  if ($("al-sample")) $("al-sample").addEventListener("click", loadSample);
  if ($("al-add-award")) $("al-add-award").addEventListener("click", addAward);
  if ($("al-start")) $("al-start").addEventListener("click", startDraw);
  if ($("al-stop")) $("al-stop").addEventListener("click", stopDraw);
  if ($("al-cancel")) $("al-cancel").addEventListener("click", cancelDraw);
  if ($("al-fs-start")) $("al-fs-start").addEventListener("click", startDraw);
  if ($("al-fs-stop")) $("al-fs-stop").addEventListener("click", stopDraw);
  if ($("al-fullscreen")) $("al-fullscreen").addEventListener("click", enterFS);
  if ($("al-fs-exit")) $("al-fs-exit").addEventListener("click", exitFS);
  if ($("al-copy")) $("al-copy").addEventListener("click", copyWinners);
  if ($("al-download")) $("al-download").addEventListener("click", downloadWinners);
  if ($("al-reset-round")) $("al-reset-round").addEventListener("click", resetRound);
  if ($("al-clear-all")) $("al-clear-all").addEventListener("click", clearAll);

  document.addEventListener("fullscreenchange", function () {
    var el = $("al-fs");
    if (!document.fullscreenElement && el) el.style.display = "none";
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { var el = $("al-fs"); if (el && el.style.display === "flex") exitFS(); }
    /* 空格键：开始/停止（输入框内不触发，防误触） */
    if (e.code === "Space" && !draw) {
      var t = e.target;
      var typing = t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT" || t.isContentEditable);
      if (!typing && $("al-fs") && $("al-fs").style.display === "flex") { e.preventDefault(); startDraw(); }
    } else if (e.code === "Space" && draw && draw.phase === "rolling") {
      var t2 = e.target;
      var typing2 = t2 && (t2.tagName === "TEXTAREA" || t2.tagName === "INPUT" || t2.isContentEditable);
      if (!typing2) { e.preventDefault(); stopDraw(); }
    }
  });

  renderAwards(); renderPool(); renderWinners(); renderRoundHead();
  showName("待抽奖", "");
  setStatus("就绪：导入名单 → 配置奖项 → 开始抽奖");
  setDrawButtons(false, false);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();

})();

/* ================= 10. node 测试导出 ================= */
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    STORE_KEY: STORE_KEY, SETTLE_MS: SETTLE_MS,
    parseOneName: parseOneName, parseNames: parseNames,
    defaultAwards: defaultAwards, newAwardId: newAwardId,
    validateAward: validateAward, normAward: normAward,
    secureRandInt: secureRandInt, drawWinners: drawWinners,
    buildPool: buildPool,
    exportWinnersText: exportWinnersText,
    easeOutQuart: easeOutQuart,
    memStorage: memStorage, createStore: createStore,
    defaultState: defaultState, normalizeState: normalizeState,
    buildSamplePeople: buildSamplePeople,
    fmtDateTime: fmtDateTime, esc: esc, trim: trim
  };
}
})();
