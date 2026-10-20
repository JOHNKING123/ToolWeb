/* 发票生成器：行项目计算 / 人民币金额大写 / 整单折扣 / 税额口径（纯函数，零依赖）
* 口径：先行折、后整折；税额按「行折后×整折后」的不含税金额计；行金额保留到分（四舍五入）
*
* 纯函数全部经 module.exports 暴露，node tests/invoice_generator.test.js 自测；
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

/* ---------- 2. 行项目计算 ---------- */
/* item: {qty 数量, price 单价, discount 行折扣率 0-100, taxRate 税率 0-100}
* 返回 {gross 折前行金额, net 行折后金额, base 不含税金额, tax 税额, total 价税合计}
* invoiceDiscount: 整单折扣率 0-100（先行折后整折，税额按折后计） */
function calcRow(item, invoiceDiscount) {
  var qty = Math.max(0, num(item.qty));
  var price = Math.max(0, num(item.price));
  var d = Math.min(100, Math.max(0, num(item.discount)));
  var t = Math.min(100, Math.max(0, num(item.taxRate)));
  var id = Math.min(100, Math.max(0, num(invoiceDiscount)));

  var gross = round2(qty * price);                    // 折前行金额
  var net = round2(gross * (1 - d / 100));            // 行折后
  var base = round2(net * (1 - id / 100));            // 整折后（不含税）
  var tax = round2(base * (t / 100));                 // 税额按折后计
  return {gross: gross, net: net, base: base, tax: tax, total: round2(base + tax)};
}

/* rows: 行项目数组；invoiceDiscount: 整单折扣率
* 返回 {gross 折前合计, net 行折后合计, base 不含税合计, tax 税额合计, total 价税合计} */
function calcTotals(rows, invoiceDiscount) {
  var out = {gross: 0, net: 0, base: 0, tax: 0, total: 0};
  var list = rows || [];
  for (var i = 0; i < list.length; i++) {
    var r = calcRow(list[i], invoiceDiscount);
    out.gross = round2(out.gross + r.gross);
    out.net = round2(out.net + r.net);
    out.base = round2(out.base + r.base);
    out.tax = round2(out.tax + r.tax);
    out.total = round2(out.total + r.total);
  }
  return out;
}

/* ---------- 3. 人民币金额大写 ---------- */
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
      /* 节间补零：跳过全零节，或低位节最高位不足仟（如 10010→壹万「零」壹拾、100001→壹拾万「零」壹） */
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
  var x = round2(num(n));
  return x.toFixed(2);
}

/* ---------- 5. 草稿（浏览器层） ---------- */
var LS_DRAFTS = "tw_invoice_drafts_v1";
var LS_AUTO = "tw_invoice_autosave_v1";

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

function newInvoiceData() {
  var today = "";
  try {
    var d = new Date();
    today = d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  } catch (e) {}
  return {
    invNo: "", invDate: today,
    seller: {name: "", taxNo: "", addrTel: "", bank: "", drawer: ""},
    buyer: {name: "", taxNo: ""},
    rows: [{name: "", spec: "", unit: "", qty: 1, price: 0, discount: 0, taxRate: 13}],
    invoiceDiscount: 0,
    remark: ""
  };
}

/* ---------- 6. 浏览器交互 ---------- */
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
  var t = $("inv-toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(function () { t.classList.remove("show"); }, 2200);
}

function defaultName(data) {
  var who = (data.buyer && data.buyer.name) || (data.seller && data.seller.name) || "";
  var when = data.invDate || "";
  return ("发票草稿" + (who ? "-" + who : "") + (when ? "-" + when : "")).replace(/[<>&"]/g, "");
}

function autosave() {
  if (!state) return;
  state.updatedAt = Date.now();
  writeAutosave(state);
}

function collectFromForm() {
  var d = newInvoiceData();
  d.invNo = $("inv-no").value;
  d.invDate = $("inv-date").value;
  d.seller.name = $("inv-seller-name").value;
  d.seller.taxNo = $("inv-seller-tax").value;
  d.seller.addrTel = $("inv-seller-addr").value;
  d.seller.bank = $("inv-seller-bank").value;
  d.seller.drawer = $("inv-seller-drawer").value;
  d.buyer.name = $("inv-buyer-name").value;
  d.buyer.taxNo = $("inv-buyer-tax").value;
  d.invoiceDiscount = num($("inv-discount").value);
  d.remark = $("inv-remark").value;
  d.rows = [];
  var tb = $("inv-rows");
  var trs = tb.querySelectorAll("tr[data-row]");
  for (var i = 0; i < trs.length; i++) {
    var tr = trs[i];
    d.rows.push({
      name: tr.querySelector(".r-name").value,
      spec: tr.querySelector(".r-spec").value,
      unit: tr.querySelector(".r-unit").value,
      qty: num(tr.querySelector(".r-qty").value),
      price: num(tr.querySelector(".r-price").value),
      discount: num(tr.querySelector(".r-discount").value),
      taxRate: num(tr.querySelector(".r-tax").value)
    });
  }
  if (d.rows.length === 0) d.rows = newInvoiceData().rows;
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
    '<td><input class="r-discount" type="number" min="0" max="100" step="any" value="' + esc(r.discount) + '" title="行折扣率%"></td>' +
    '<td><select class="r-tax">' + taxOptions(r.taxRate) + "</select></td>" +
    '<td class="r-amt">0.00</td>' +
    '<td><button type="button" class="inv-del" data-del="' + idx + '" title="删除本行">×</button></td>';
  return tr;
}

function bindRows() {
  var tb = $("inv-rows");
  tb.innerHTML = "";
  for (var i = 0; i < state.rows.length; i++) tb.appendChild(renderRowEditor(state.rows[i], i));
}

function fillForm() {
  $("inv-no").value = state.invNo || "";
  $("inv-date").value = state.invDate || "";
  $("inv-seller-name").value = state.seller.name || "";
  $("inv-seller-tax").value = state.seller.taxNo || "";
  $("inv-seller-addr").value = state.seller.addrTel || "";
  $("inv-seller-bank").value = state.seller.bank || "";
  $("inv-seller-drawer").value = state.seller.drawer || "";
  $("inv-buyer-name").value = state.buyer.name || "";
  $("inv-buyer-tax").value = state.buyer.taxNo || "";
  $("inv-discount").value = state.invoiceDiscount || 0;
  $("inv-remark").value = state.remark || "";
  bindRows();
  renderPreview();
}

function rowToCell(r, c) {
  if (c === "discount") return r.discount ? r.discount + "%" : "—";
  if (c === "taxRate") return r.taxRate + "%";
  return esc(r[c] == null ? "" : r[c]);
}

function renderPreview() {
  var data = collectFromForm();
  state = data; // 以表单为准
  var t = calcTotals(data.rows, data.invoiceDiscount);

  /* 编辑区行金额 */
  var tb = $("inv-rows");
  var trs = tb.querySelectorAll("tr[data-row]");
  for (var i = 0; i < trs.length; i++) {
    var r = calcRow(data.rows[i], data.invoiceDiscount);
    trs[i].querySelector(".r-amt").textContent = fmtMoney(r.base);
  }

  /* 预览区 */
  var h = "";
  for (var k = 0; k < data.rows.length; k++) {
    var it = data.rows[k], cr = calcRow(it, data.invoiceDiscount);
    h += "<tr><td>" + (k + 1) + "</td><td>" + rowToCell(it, "name") + "</td>" +
      "<td>" + rowToCell(it, "spec") + "</td><td>" + rowToCell(it, "unit") + "</td>" +
      "<td class=num>" + esc(it.qty) + "</td><td class=num>" + fmtMoney(it.price) + "</td>" +
      "<td class=num>" + rowToCell(it, "discount") + "</td><td class=num>" + rowToCell(it, "taxRate") + "</td>" +
      "<td class=num>" + fmtMoney(cr.base) + "</td><td class=num>" + fmtMoney(cr.tax) + "</td>" +
      "<td class=num>" + fmtMoney(cr.total) + "</td></tr>";
  }
  $("inv-pv-rows").innerHTML = h;

  $("inv-pv-no").textContent = data.invNo || "—";
  $("inv-pv-date").textContent = data.invDate || "—";
  $("inv-pv-seller").innerHTML =
    "名　称：" + esc(data.seller.name || "—") + "<br>" +
    "税　号：" + esc(data.seller.taxNo || "—") + "<br>" +
    "地址电话：" + esc(data.seller.addrTel || "—") + "<br>" +
    "开户行账号：" + esc(data.seller.bank || "—");
  $("inv-pv-buyer").innerHTML =
    "名　称：" + esc(data.buyer.name || "—") + "<br>" +
    "税　号：" + esc(data.buyer.taxNo || "—");
  $("inv-pv-gross").textContent = fmtMoney(t.gross);
  $("inv-pv-net").textContent = fmtMoney(t.net);
  $("inv-pv-id").textContent = data.invoiceDiscount ? data.invoiceDiscount + "%" : "无";
  $("inv-pv-base").textContent = fmtMoney(t.base);
  $("inv-pv-tax").textContent = fmtMoney(t.tax);
  $("inv-pv-total").textContent = fmtMoney(t.total);
  $("inv-pv-total-cn").textContent = moneyToChinese(t.total);
  $("inv-pv-remark").textContent = data.remark || "—";
  $("inv-pv-drawer").textContent = data.seller.drawer || "—";

  renderDraftList();
  autosave();
}

function renderDraftList() {
  var box = $("inv-draft-list");
  if (!box) return;
  var drafts = loadDrafts();
  var h = "";
  if (drafts.length === 0) {
    h = '<span class="inv-draft-empty">暂无草稿，填写后点「保存草稿」</span>';
  } else {
    for (var i = 0; i < drafts.length; i++) {
      var d = drafts[i];
      var dt = "";
      try { dt = new Date(d.updatedAt).toLocaleString("zh-CN", {hour12: false}); } catch (e) {}
      h += '<span class="inv-draft-chip" data-load="' + i + '" title="点击载入">' +
        esc(d.name) + '<em>' + esc(dt) + "</em>" +
        '<button type="button" data-del-draft="' + i + '" title="删除草稿">×</button></span>';
    }
  }
  box.innerHTML = h;
}

function saveDraft() {
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
  state.rows.push({name: "", spec: "", unit: "", qty: 1, price: 0, discount: 0, taxRate: 13});
  fillForm();
}

function delRow(idx) {
  state = collectFromForm();
  if (state.rows.length <= 1) { toast("至少保留一行"); return; }
  state.rows.splice(idx, 1);
  fillForm();
}

function doPrint() {
  state = collectFromForm();
  try { window.print(); } catch (e) { toast("浏览器不支持打印"); }
}

function init() {
  var auto = readAutosave();
  state = (auto && auto.rows) ? auto : newInvoiceData();
  fillForm();

  /* 表单输入即时预览（事件委托） */
  var form = $("inv-form");
  form.addEventListener("input", function () { renderPreview(); });
  form.addEventListener("change", function () { renderPreview(); });

  $("inv-rows").addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-del]");
    if (b) delRow(Number(b.getAttribute("data-del")));
  });
  $("inv-draft-list").addEventListener("click", function (ev) {
    var dd = ev.target.closest("[data-del-draft]");
    if (dd) { delDraft(Number(dd.getAttribute("data-del-draft")), ev); return; }
    var ld = ev.target.closest("[data-load]");
    if (ld) loadDraft(Number(ld.getAttribute("data-load")));
  });
  $("inv-add-row").addEventListener("click", addRow);
  $("inv-save-draft").addEventListener("click", saveDraft);
  $("inv-new").addEventListener("click", function () {
    if (!confirm("清空当前表单，新建一张空白发票？")) return;
    state = newInvoiceData();
    fillForm();
    toast("已新建空白发票");
  });
  $("inv-print").addEventListener("click", doPrint);
}

if (hasDOM()) {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    round2: round2, num: num,
    calcRow: calcRow, calcTotals: calcTotals,
    moneyToChinese: moneyToChinese, fmtMoney: fmtMoney,
    TAX_PRESETS: TAX_PRESETS, newInvoiceData: newInvoiceData
  };
}
})();
