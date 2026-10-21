/* 报价单生成器：行项目计算 / 整单折扣 / 税率 / 人民币金额大写 / 字段校验（纯函数，零依赖）
* 口径：行小计＝数量×单价（保留到分、四舍五入）；折前合计＝各行小计和；
* 整单折扣后不含税金额＝折前合计×(1-折扣率)；税额＝不含税金额×税率；价税合计＝不含税＋税额
*
* 纯函数全部经 module.exports 暴露，node tests/quotation_generator.test.js 自测；
* 浏览器内 init 挂 DOMContentLoaded；无网络请求（零上传）。
*/
(function () {
"use strict";

/* ---------- 1. 基础 ---------- */
function round2(n) {
  var x = Number(n);
  if (!isFinite(x)) return 0;
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

function num(v) {
  var x = Number(v);
  return isFinite(x) ? x : 0;
}

function clamp(n, lo, hi) {
  var x = num(n);
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}

/* ---------- 2. 行项目计算 ---------- */
/* item: {qty 数量, price 单价}
* 返回 {qty 数量, price 单价, amount 行小计} */
function calcQuoteRow(item) {
  var qty = Math.max(0, num(item && item.qty));
  var price = Math.max(0, num(item && item.price));
  return {qty: qty, price: price, amount: round2(qty * price)};
}

/* rows: 行项目数组；discount: 整单折扣率 0-100；taxRate: 税率 0-100
* 返回 {gross 折前合计, base 整单折扣后不含税, tax 税额, total 价税合计} */
function calcQuoteTotals(rows, discount, taxRate) {
  var gross = 0;
  var list = rows || [];
  for (var i = 0; i < list.length; i++) gross = round2(gross + calcQuoteRow(list[i]).amount);
  var d = clamp(discount, 0, 100);
  var t = clamp(taxRate, 0, 100);
  var base = round2(gross * (1 - d / 100));
  var tax = round2(base * (t / 100));
  return {gross: gross, base: base, tax: tax, total: round2(base + tax)};
}

/* ---------- 3. 人民币金额大写（与发票生成器同口径） ---------- */
var CN_NUM = ["零", "壹", "贰", "叁", "肆", "伍", "陆", "柒", "捌", "玖"];
var CN_UNIT = ["", "拾", "佰", "仟"];
var CN_BIG = ["", "万", "亿", "兆"];

/* 四位一节转大写（0<d<10000） */
function sectionToChinese(n) {
  var s = "", zero = false, hasOut = false;
  for (var i = 3; i >= 0; i--) {
    var d = Math.floor(n / Math.pow(10, i)) % 10;
    if (d !== 0) {
      if (zero && hasOut) s += "零";
      s += CN_NUM[d] + CN_UNIT[i];
      zero = false; hasOut = true;
    } else {
      if (hasOut) zero = true;
    }
  }
  return s;
}

function intToChinese(n) {
  if (n === 0) return "零";
  var s = "", big = 0, needZero = false;
  while (n > 0) {
    var sec = n % 10000;
    if (sec !== 0) {
      var cur = sectionToChinese(sec) + CN_BIG[big];
      if (s !== "" && (needZero || sec < 1000)) s = cur + "零" + s;
      else s = cur + s;
      needZero = false;
    } else {
      if (s !== "") needZero = true;
    }
    n = Math.floor(n / 10000);
    big++;
  }
  return s;
}

/* 金额（元）→ 人民币大写，如 1234.56 → 壹仟贰佰叁拾肆圆伍角陆分；
* 边界：负数取绝对值前冠「负」，角/分为 0 时写「整」 */
function moneyToChinese(amount) {
  var x = num(amount);
  if (!isFinite(x)) return "";
  var neg = x < 0;
  x = Math.abs(round2(x));
  var yuan = Math.floor(x);
  var jiao = Math.floor((x - yuan) * 10 + 1e-9);
  var fen = Math.round((x - yuan) * 100) - jiao * 10;
  if (fen < 0) fen = 0; if (fen > 9) fen = 9;

  var s = (neg ? "负" : "") + intToChinese(yuan) + "圆";
  if (jiao === 0 && fen === 0) {
    s += "整";
  } else {
    if (jiao > 0) s += CN_NUM[jiao] + "角";
    else if (yuan > 0) s += "零";
    if (fen > 0) s += CN_NUM[fen] + "分";
  }
  return s;
}

/* ---------- 4. 格式化 ---------- */
function fmtMoney(n) {
  return round2(num(n)).toFixed(2);
}

function fmtDate(d) {
  if (!d || typeof d.getFullYear !== "function") return "";
  return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
}

function todayStr() {
  try { return fmtDate(new Date()); } catch (e) { return ""; }
}

function plusDaysStr(base, days) {
  try {
    var d = base ? new Date(base + "T00:00:00") : new Date();
    if (isNaN(d.getTime())) d = new Date();
    d.setDate(d.getDate() + days);
    return fmtDate(d);
  } catch (e) { return ""; }
}

/* ---------- 5. 字段校验 ---------- */
/* data: newQuoteData() 结构
* 返回 {ok: bool, errors: [{code, message}]}；code 供调用方定位字段 */
function validateQuote(data) {
  var errors = [];
  function push(code, message) { errors.push({code: code, message: message}); }
  if (!data || typeof data !== "object") {
    push("EMPTY", "报价单数据为空");
    return {ok: false, errors: errors};
  }
  if (!data.seller || !String(data.seller.company).trim()) push("SELLER_COMPANY", "报价方公司名称必填");
  if (!data.buyer || !String(data.buyer.company).trim()) push("BUYER_COMPANY", "客户公司名称必填");
  var rows = Array.isArray(data.rows) ? data.rows : [];
  if (rows.length === 0) {
    push("ROWS_EMPTY", "至少需要一行报价项目");
  } else {
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i] || {};
      var no = "第 " + (i + 1) + " 行";
      if (!String(r.name).trim()) push("ROW_NAME_" + (i + 1), no + "：品名必填");
      if (!isFinite(Number(r.qty)) || Number(r.qty) <= 0) push("ROW_QTY_" + (i + 1), no + "：数量须大于 0");
      if (!isFinite(Number(r.price)) || Number(r.price) < 0) push("ROW_PRICE_" + (i + 1), no + "：单价不能为负数");
    }
  }
  var disc = Number(data.discount);
  if (!isFinite(disc) || disc < 0 || disc > 100) push("DISCOUNT", "整单折扣率须在 0–100 之间");
  var tax = Number(data.taxRate);
  if (!isFinite(tax) || tax < 0 || tax > 100) push("TAXRATE", "税率须在 0–100 之间");
  if (data.quoteDate && data.validUntil && data.validUntil < data.quoteDate)
    push("VALIDITY", "报价有效期至不能早于报价日期");
  return {ok: errors.length === 0, errors: errors};
}

/* ---------- 6. 草稿（浏览器层） ---------- */
var LS_DRAFTS = "tw_quotation_drafts_v1";
var LS_AUTO = "tw_quotation_autosave_v1";

function hasLS() {
  try { return typeof localStorage !== "undefined"; } catch (e) { return false; }
}

function loadDrafts() {
  if (!hasLS()) return [];
  try {
    var raw = localStorage.getItem(LS_DRAFTS);
    if (!raw) return [];
    var arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}

function saveDrafts(arr) {
  if (!hasLS()) return false;
  try {
    localStorage.setItem(LS_DRAFTS, JSON.stringify(arr || []));
    return true;
  } catch (e) { return false; }
}

function readAutosave() {
  if (!hasLS()) return null;
  try {
    var raw = localStorage.getItem(LS_AUTO);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function writeAutosave(data) {
  if (!hasLS()) return;
  try { localStorage.setItem(LS_AUTO, JSON.stringify(data)); } catch (e) {}
}

function newQuoteData() {
  var today = todayStr();
  return {
    quoteNo: "", quoteDate: today, validUntil: plusDaysStr(today, 30),
    seller: {company: "", contact: "", phone: "", address: ""},
    buyer: {company: "", contact: "", phone: "", address: ""},
    rows: [{name: "", spec: "", unit: "", qty: 1, price: 0}],
    discount: 0, taxRate: 13,
    remark: "",
    signer: "",
    updatedAt: Date.now()
  };
}

/* 虚构公司示例报价单（一键载入用） */
function sampleQuote() {
  var d = newQuoteData();
  d.quoteNo = "QT-2026-1021-001";
  d.quoteDate = "2026-10-21";
  d.validUntil = "2026-11-20";
  d.seller = {
    company: "深圳市腾云科技有限公司",
    contact: "李工",
    phone: "13800138000",
    address: "深圳市南山区科技园南区8栋302室"
  };
  d.buyer = {
    company: "广州市白云实业有限公司",
    contact: "张经理",
    phone: "13900139000",
    address: "广州市白云区黄石东路88号"
  };
  d.rows = [
    {name: "笔记本内存条 16GB DDR4", spec: "DDR4 3200MHz", unit: "条", qty: 20, price: 268},
    {name: "固态硬盘 1TB", spec: "M.2 NVMe PCIe4.0", unit: "块", qty: 10, price: 459},
    {name: "笔记本散热器", spec: "双风扇可调速", unit: "个", qty: 30, price: 89},
    {name: "上门安装调试服务", spec: "含系统迁移", unit: "次", qty: 5, price: 300},
    {name: "延保服务一年", spec: "主要部件", unit: "份", qty: 30, price: 68}
  ];
  d.discount = 5;
  d.taxRate = 13;
  d.remark = "报价含税、含运费；付款方式：预付30%，验收后付清余款。";
  d.signer = "李工";
  return d;
}

/* ---------- 7. 浏览器交互 ---------- */
var TAX_PRESETS = [0, 1, 3, 6, 9, 13];
var state = null;

function hasDOM() {
  return typeof document !== "undefined" && typeof document.getElementById === "function";
}

function $(id) { return document.getElementById(id); }

function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function toast(msg) {
  var t = $("qt-toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(function () { t.classList.remove("show"); }, 2200);
}

function defaultName(data) {
  var who = (data.buyer && data.buyer.company) || (data.seller && data.seller.company) || "";
  var when = data.quoteDate || "";
  return ("报价单" + (who ? "-" + who : "") + (when ? "-" + when : "")).replace(/[<>&"]/g, "");
}

function autosave() {
  if (!state) return;
  state.updatedAt = Date.now();
  writeAutosave(state);
}

function collectFromForm() {
  var d = newQuoteData();
  d.quoteNo = $("qt-no").value;
  d.quoteDate = $("qt-date").value;
  d.validUntil = $("qt-valid").value;
  d.seller.company = $("qt-seller-company").value;
  d.seller.contact = $("qt-seller-contact").value;
  d.seller.phone = $("qt-seller-phone").value;
  d.seller.address = $("qt-seller-address").value;
  d.buyer.company = $("qt-buyer-company").value;
  d.buyer.contact = $("qt-buyer-contact").value;
  d.buyer.phone = $("qt-buyer-phone").value;
  d.buyer.address = $("qt-buyer-address").value;
  d.discount = num($("qt-discount").value);
  d.taxRate = num($("qt-tax").value);
  d.remark = $("qt-remark").value;
  d.signer = $("qt-signer").value;
  d.rows = [];
  var trs = $("qt-rows").querySelectorAll("tr[data-row]");
  for (var i = 0; i < trs.length; i++) {
    var tr = trs[i];
    d.rows.push({
      name: tr.querySelector(".r-name").value,
      spec: tr.querySelector(".r-spec").value,
      unit: tr.querySelector(".r-unit").value,
      qty: num(tr.querySelector(".r-qty").value),
      price: num(tr.querySelector(".r-price").value)
    });
  }
  if (d.rows.length === 0) d.rows = newQuoteData().rows;
  return d;
}

function taxOptions(sel) {
  var h = "";
  for (var i = 0; i < TAX_PRESETS.length; i++) {
    h += '<option value="' + TAX_PRESETS[i] + '"' + (Number(sel) === TAX_PRESETS[i] ? " selected" : "") + ">" + TAX_PRESETS[i] + "%</option>";
  }
  if (TAX_PRESETS.indexOf(Number(sel)) === -1) {
    h += '<option value="' + esc(sel) + '" selected>自定义 ' + esc(sel) + "%</option>";
  }
  return h;
}

function renderRowEditor(r, idx) {
  var tr = document.createElement("tr");
  tr.setAttribute("data-row", idx);
  tr.innerHTML =
    '<td><input class="r-name" value="' + esc(r.name) + '" placeholder="品名"></td>' +
    '<td><input class="r-spec" value="' + esc(r.spec) + '" placeholder="规格型号"></td>' +
    '<td><input class="r-unit" value="' + esc(r.unit) + '" placeholder="单位" style="width:3.2em"></td>' +
    '<td><input class="r-qty" type="number" min="0" step="any" value="' + esc(r.qty) + '"></td>' +
    '<td><input class="r-price" type="number" min="0" step="any" value="' + esc(r.price) + '"></td>' +
    '<td class="r-amt">0.00</td>' +
    '<td><button type="button" class="qt-del" data-del="' + idx + '" title="删除本行">×</button></td>';
  return tr;
}

function bindRows() {
  var tb = $("qt-rows");
  tb.innerHTML = "";
  for (var i = 0; i < state.rows.length; i++) tb.appendChild(renderRowEditor(state.rows[i], i));
}

function fillForm() {
  $("qt-no").value = state.quoteNo || "";
  $("qt-date").value = state.quoteDate || "";
  $("qt-valid").value = state.validUntil || "";
  $("qt-seller-company").value = state.seller.company || "";
  $("qt-seller-contact").value = state.seller.contact || "";
  $("qt-seller-phone").value = state.seller.phone || "";
  $("qt-seller-address").value = state.seller.address || "";
  $("qt-buyer-company").value = state.buyer.company || "";
  $("qt-buyer-contact").value = state.buyer.contact || "";
  $("qt-buyer-phone").value = state.buyer.phone || "";
  $("qt-buyer-address").value = state.buyer.address || "";
  $("qt-discount").value = state.discount || 0;
  $("qt-tax").innerHTML = taxOptions(state.taxRate);
  $("qt-remark").value = state.remark || "";
  $("qt-signer").value = state.signer || "";
  bindRows();
  renderPreview();
}

function rowToCell(r, c) { return esc(r[c] == null ? "" : r[c]); }

function partyLine(label, v) { return label + "：" + (v ? esc(v) : "—") + "<br>"; }

function renderPreview() {
  var data = collectFromForm();
  state = data; // 以表单为准
  var t = calcQuoteTotals(data.rows, data.discount, data.taxRate);

  /* 编辑区行小计 */
  var trs = $("qt-rows").querySelectorAll("tr[data-row]");
  for (var i = 0; i < trs.length; i++) {
    trs[i].querySelector(".r-amt").textContent = fmtMoney(calcQuoteRow(data.rows[i]).amount);
  }

  /* 预览区 */
  var h = "";
  for (var k = 0; k < data.rows.length; k++) {
    var it = data.rows[k], cr = calcQuoteRow(it);
    h += "<tr><td>" + (k + 1) + "</td><td>" + rowToCell(it, "name") + "</td>" +
      "<td>" + rowToCell(it, "spec") + "</td><td>" + rowToCell(it, "unit") + "</td>" +
      "<td class=num>" + esc(it.qty) + "</td><td class=num>" + fmtMoney(it.price) + "</td>" +
      "<td class=num>" + fmtMoney(cr.amount) + "</td></tr>";
  }
  $("qt-pv-rows").innerHTML = h;

  $("qt-pv-no").textContent = data.quoteNo || "—";
  $("qt-pv-date").textContent = data.quoteDate || "—";
  $("qt-pv-valid").textContent = data.validUntil || "—";
  $("qt-pv-seller").innerHTML =
    "<b>报价方</b><br>" +
    partyLine("公司", data.seller.company) +
    partyLine("联系人", data.seller.contact) +
    partyLine("电话", data.seller.phone) +
    partyLine("地址", data.seller.address);
  $("qt-pv-buyer").innerHTML =
    "<b>客户方</b><br>" +
    partyLine("公司", data.buyer.company) +
    partyLine("联系人", data.buyer.contact) +
    partyLine("电话", data.buyer.phone) +
    partyLine("地址", data.buyer.address);
  $("qt-pv-gross").textContent = fmtMoney(t.gross);
  $("qt-pv-discount").textContent = data.discount ? data.discount + "%" : "无";
  $("qt-pv-base").textContent = fmtMoney(t.base);
  $("qt-pv-taxrate").textContent = data.taxRate + "%";
  $("qt-pv-tax").textContent = fmtMoney(t.tax);
  $("qt-pv-total").textContent = fmtMoney(t.total);
  $("qt-pv-total-cn").textContent = moneyToChinese(t.total);
  $("qt-pv-remark").textContent = data.remark || "—";
  $("qt-pv-signer").textContent = data.signer || "";

  renderDraftList();
  autosave();
}

function renderDraftList() {
  var box = $("qt-draft-list");
  if (!box) return;
  var drafts = loadDrafts();
  var h = "";
  if (drafts.length === 0) {
    h = '<span class="qt-draft-empty">暂无草稿，填写后点「保存草稿」</span>';
  } else {
    for (var i = 0; i < drafts.length; i++) {
      var d = drafts[i];
      var dt = "";
      try { dt = new Date(d.updatedAt).toLocaleString("zh-CN", {hour12: false}); } catch (e) {}
      h += '<span class="qt-draft-chip" data-load="' + i + '" title="点击载入">' +
        esc(d.name) + '<em>' + esc(dt) + "</em>" +
        '<button type="button" data-del-draft="' + i + '" title="删除草稿">×</button></span>';
    }
  }
  box.innerHTML = h;
}

function saveDraft() {
  var v = validateQuote(collectFromForm());
  if (!v.ok) { toast("校验未通过：" + v.errors[0].message); return; }
  var data = collectFromForm();
  var drafts = loadDrafts();
  var name = prompt("草稿名称：", defaultName(data));
  if (name === null) return;
  name = String(name).trim() || defaultName(data);
  drafts.unshift({name: name, updatedAt: Date.now(), data: data});
  if (saveDrafts(drafts)) toast("草稿已保存：" + name);
  else toast("保存失败：浏览器存储不可用");
  renderDraftList();
}

function loadDraft(idx) {
  var drafts = loadDrafts();
  var d = drafts[idx];
  if (!d) return;
  state = d.data;
  fillForm();
  toast("已载入草稿：" + d.name);
}

function delDraft(idx, ev) {
  if (ev) ev.stopPropagation();
  var drafts = loadDrafts();
  var d = drafts[idx];
  if (!d) return;
  if (!confirm("删除草稿「" + d.name + "」？")) return;
  drafts.splice(idx, 1);
  saveDrafts(drafts);
  renderDraftList();
  toast("草稿已删除");
}

function addRow() {
  state = collectFromForm();
  state.rows.push({name: "", spec: "", unit: "", qty: 1, price: 0});
  fillForm();
}

function delRow(idx) {
  state = collectFromForm();
  if (state.rows.length <= 1) { toast("至少保留一行"); return; }
  state.rows.splice(idx, 1);
  fillForm();
}

function loadSample() {
  if (state && !confirm("载入示例报价单将覆盖当前表单内容，继续吗？")) return;
  state = sampleQuote();
  fillForm();
  toast("已载入示例报价单（虚构数据，仅供参考）");
}

function doPrint() {
  state = collectFromForm();
  var v = validateQuote(state);
  if (!v.ok) { toast("校验未通过：" + v.errors[0].message); return; }
  try { window.print(); } catch (e) { toast("浏览器不支持打印"); }
}

function init() {
  var auto = readAutosave();
  state = (auto && auto.rows) ? auto : newQuoteData();
  fillForm();

  /* 表单输入即时预览（事件委托） */
  var form = $("qt-form");
  form.addEventListener("input", function () { renderPreview(); });
  form.addEventListener("change", function () { renderPreview(); });

  $("qt-rows").addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-del]");
    if (b) delRow(Number(b.getAttribute("data-del")));
  });
  $("qt-draft-list").addEventListener("click", function (ev) {
    var dd = ev.target.closest("[data-del-draft]");
    if (dd) { delDraft(Number(dd.getAttribute("data-del-draft")), ev); return; }
    var ld = ev.target.closest("[data-load]");
    if (ld) loadDraft(Number(ld.getAttribute("data-load")));
  });
  $("qt-add-row").addEventListener("click", addRow);
  $("qt-save-draft").addEventListener("click", saveDraft);
  $("qt-sample").addEventListener("click", loadSample);
  $("qt-new").addEventListener("click", function () {
    if (!confirm("清空当前表单，新建一张空白报价单？")) return;
    state = newQuoteData();
    fillForm();
    toast("已新建空白报价单");
  });
  $("qt-print").addEventListener("click", doPrint);
}

if (hasDOM()) {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    round2: round2, num: num,
    calcQuoteRow: calcQuoteRow, calcQuoteTotals: calcQuoteTotals,
    moneyToChinese: moneyToChinese, fmtMoney: fmtMoney,
    validateQuote: validateQuote,
    TAX_PRESETS: TAX_PRESETS, newQuoteData: newQuoteData, sampleQuote: sampleQuote,
    loadDrafts: loadDrafts, saveDrafts: saveDrafts,
    readAutosave: readAutosave, writeAutosave: writeAutosave
  };
}
})();
