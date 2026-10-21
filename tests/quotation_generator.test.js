/* 报价单生成器纯逻辑单元测试（零依赖）：node tests/quotation_generator.test.js
* 覆盖：
* 1. 人民币金额大写（零/整/角分/万亿兆进位/连续零/负数/浮点舍入）
* 2. 行项目计算（数量×单价、保留到分、异常输入钳制）
* 3. 整单折扣＋税率合计口径（折前/不含税/税额/价税合计）
* 4. 字段校验（必填/数值区间/有效期/空数据）
* 5. 草稿持久化（localStorage 内存垫片：多草稿存取删、自动暂存往返）
* 6. 示例报价单与默认数据结构
*/
"use strict";

/* localStorage 内存垫片（模块在调用时才检查 localStorage，可直接替换） */
(function installShim() {
  var store = {};
  global.localStorage = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function (k, v) { store[k] = String(v); },
    removeItem: function (k) { delete store[k]; },
    clear: function () { store = {}; }
  };
})();

var M = require("../static/js/quotation_generator.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }

/* ---------- 1. 金额大写 ---------- */
eq(M.moneyToChinese(0), "零圆整", "0 → 零圆整");
eq(M.moneyToChinese(100), "壹佰圆整", "100 → 壹佰圆整");
eq(M.moneyToChinese(1234.56), "壹仟贰佰叁拾肆圆伍角陆分", "1234.56 全位");
eq(M.moneyToChinese(1.01), "壹圆零壹分", "1.01 角位补零");
eq(M.moneyToChinese(0.05), "零圆伍分", "0.05 零元不双重零");
eq(M.moneyToChinese(10.20), "壹拾圆贰角", "10.20 分为零不写分");
eq(M.moneyToChinese(101), "壹佰零壹圆整", "101 节内补零");
eq(M.moneyToChinese(10010.05), "壹万零壹拾圆零伍分", "万位零补");
eq(M.moneyToChinese(100001), "壹拾万零壹圆整", "100001");
eq(M.moneyToChinese(100000001), "壹亿零壹圆整", "亿位零补");
eq(M.moneyToChinese(100000000), "壹亿圆整", "一亿");
eq(M.moneyToChinese(-123.45), "负壹佰贰拾叁圆肆角伍分", "负数冠负");
eq(M.moneyToChinese(1.005), "壹圆零壹分", "1.005 四舍五入进位");
eq(M.moneyToChinese(9999.99), "玖仟玖佰玖拾玖圆玖角玖分", "9999.99");
eq(M.moneyToChinese(2000000.04), "贰佰万圆零肆分", "2000000.04");
eq(M.moneyToChinese("abc"), "零圆整", "非法输入按 0 处理（与发票生成器同口径）");
eq(M.moneyToChinese(NaN), "零圆整", "NaN 按 0 处理（与发票生成器同口径）");
eq(M.moneyToChinese(0.07), "零圆柒分", "0.07");

/* ---------- 2. 行项目计算 ---------- */
var r1 = M.calcQuoteRow({qty: 2, price: 100});
eq(r1.qty, 2, "行1 数量");
eq(r1.price, 100, "行1 单价");
eq(r1.amount, 200, "行1 小计＝200");

var r2 = M.calcQuoteRow({qty: 3, price: 33.333});
eq(r2.amount, 100, "3×33.333 舍入到分 → 100.00");

var r3 = M.calcQuoteRow({qty: 1, price: 999.995});
eq(r3.amount, 1000, "999.995 四舍五入 → 1000.00");

var r4 = M.calcQuoteRow({qty: "abc", price: null});
eq(r4.qty, 0, "异常数量钳制 → 0");
eq(r4.price, 0, "异常单价钳制 → 0");
eq(r4.amount, 0, "异常输入小计 0");

var r5 = M.calcQuoteRow({qty: -5, price: 100});
eq(r5.qty, 0, "负数量钳制 → 0");
eq(r5.amount, 0, "负数量小计 0");

var r6 = M.calcQuoteRow({qty: 2, price: -50});
eq(r6.price, 0, "负单价钳制 → 0");
eq(r6.amount, 0, "负单价小计 0");

/* ---------- 3. 整单折扣＋税率合计 ---------- */
var rows = [
  {name: "内存条", spec: "DDR4 16G", unit: "条", qty: 20, price: 268},   // 5360
  {name: "固态硬盘", spec: "1TB", unit: "块", qty: 10, price: 459},      // 4590
  {name: "散热器", spec: "", unit: "个", qty: 30, price: 89}             // 2670
]; // 折前合计 12620

var t1 = M.calcQuoteTotals(rows, 0, 0);
eq(t1.gross, 12620, "无折扣无税：折前合计 12620");
eq(t1.base, 12620, "无折扣无税：不含税 12620");
eq(t1.tax, 0, "无折扣无税：税额 0");
eq(t1.total, 12620, "无折扣无税：价税合计 12620");

var t2 = M.calcQuoteTotals(rows, 0, 13);
eq(t2.gross, 12620, "税13%：折前合计");
eq(t2.base, 12620, "税13%：不含税");
eq(t2.tax, 1640.6, "税13%：税额 12620×13%=1640.60");
eq(t2.total, 14260.6, "税13%：价税合计");
eq(M.moneyToChinese(t2.total), "壹万零肆仟贰佰陆拾圆陆角", "14260.60 大写（与发票生成器算法同口径）");

var t3 = M.calcQuoteTotals(rows, 5, 13);
eq(t3.gross, 12620, "整折5%+税13%：折前合计不变");
eq(t3.base, 11989, "整折5% 后不含税 12620×95%");
eq(t3.tax, 1558.57, "税额 11989×13%=1558.57");
eq(t3.total, 13547.57, "价税合计 13547.57");

var t4 = M.calcQuoteTotals(rows, 150, 13);
eq(t4.base, 0, "折扣>100% 钳制 → 不含税 0");
eq(t4.tax, 0, "折扣>100% → 税额 0");
eq(t4.total, 0, "折扣>100% → 价税合计 0");

var t5 = M.calcQuoteTotals(rows, 0, 200);
eq(t5.tax, 12620, "税率>100% 钳制 → 12620×100%");
eq(M.calcQuoteTotals(rows, 0, 200).total, 25240, "税率>100% 价税合计");

var t0 = M.calcQuoteTotals([], 5, 13);
eq(t0.gross, 0, "空行：折前合计 0");
eq(t0.total, 0, "空行：价税合计 0");
eq(M.moneyToChinese(t0.total), "零圆整", "空行大写");

var t6 = M.calcQuoteTotals([{qty: 1, price: 0.03}], 0, 0);
eq(t6.gross, 0.03, "小额舍入：0.03");

/* ---------- 4. 字段校验 ---------- */
function goodData() {
  return {
    quoteNo: "QT-001", quoteDate: "2026-10-21", validUntil: "2026-11-20",
    seller: {company: "深圳市腾云科技有限公司", contact: "李工", phone: "13800138000", address: "深圳南山"},
    buyer: {company: "广州市白云实业有限公司", contact: "张经理", phone: "13900139000", address: "广州白云"},
    rows: [{name: "内存条", spec: "DDR4", unit: "条", qty: 20, price: 268}],
    discount: 5, taxRate: 13, remark: "", signer: "李工"
  };
}

var v0 = M.validateQuote(goodData());
eq(v0.ok, true, "完整合法数据校验通过");
eq(v0.errors.length, 0, "合法数据无错误");

var v1 = M.validateQuote(null);
eq(v1.ok, false, "空数据校验不通过");
eq(v1.errors[0].code, "EMPTY", "空数据错误码 EMPTY");

var d2 = goodData(); d2.seller.company = "  ";
var v2 = M.validateQuote(d2);
eq(v2.ok, false, "报价方公司为空不通过");
ok(v2.errors.some(function (e) { return e.code === "SELLER_COMPANY"; }), "错误码 SELLER_COMPANY");

var d3 = goodData(); d3.buyer.company = "";
var v3 = M.validateQuote(d3);
eq(v3.ok, false, "客户公司为空不通过");
ok(v3.errors.some(function (e) { return e.code === "BUYER_COMPANY"; }), "错误码 BUYER_COMPANY");

var d4 = goodData(); d4.rows = [];
var v4 = M.validateQuote(d4);
eq(v4.ok, false, "无行项目不通过");
ok(v4.errors.some(function (e) { return e.code === "ROWS_EMPTY"; }), "错误码 ROWS_EMPTY");

var d5 = goodData(); d5.rows = [{name: "", qty: 1, price: 10}];
var v5 = M.validateQuote(d5);
eq(v5.ok, false, "行品名为空不通过");
ok(v5.errors.some(function (e) { return e.code === "ROW_NAME_1"; }), "错误码 ROW_NAME_1");

var d6 = goodData(); d6.rows = [{name: "硬盘", qty: 0, price: 10}];
var v6 = M.validateQuote(d6);
eq(v6.ok, false, "数量为 0 不通过");
ok(v6.errors.some(function (e) { return e.code === "ROW_QTY_1"; }), "错误码 ROW_QTY_1");

var d7 = goodData(); d7.rows = [{name: "硬盘", qty: 1, price: -1}];
var v7 = M.validateQuote(d7);
eq(v7.ok, false, "负单价不通过");
ok(v7.errors.some(function (e) { return e.code === "ROW_PRICE_1"; }), "错误码 ROW_PRICE_1");

var d8 = goodData(); d8.discount = 120;
var v8 = M.validateQuote(d8);
eq(v8.ok, false, "折扣率>100 不通过");
ok(v8.errors.some(function (e) { return e.code === "DISCOUNT"; }), "错误码 DISCOUNT");

var d9 = goodData(); d9.taxRate = -5;
var v9 = M.validateQuote(d9);
eq(v9.ok, false, "负税率不通过");
ok(v9.errors.some(function (e) { return e.code === "TAXRATE"; }), "错误码 TAXRATE");

var d10 = goodData(); d10.validUntil = "2026-10-01";
var v10 = M.validateQuote(d10);
eq(v10.ok, false, "有效期早于报价日期不通过");
ok(v10.errors.some(function (e) { return e.code === "VALIDITY"; }), "错误码 VALIDITY");

var d11 = goodData(); d11.rows = [{name: "a", qty: 1, price: 1}, {name: "", qty: 2, price: 2}];
var v11 = M.validateQuote(d11);
eq(v11.ok, false, "第二行品名为空不通过");
ok(v11.errors.some(function (e) { return e.code === "ROW_NAME_2"; }), "第二行错误码带行号");

var d12 = goodData(); d12.discount = 100;
eq(M.validateQuote(d12).ok, true, "折扣率 100 边界合法");
var d13 = goodData(); d13.taxRate = 0;
eq(M.validateQuote(d13).ok, true, "税率 0 边界合法");

/* ---------- 5. 草稿持久化 ---------- */
global.localStorage.clear();
eq(M.loadDrafts().length, 0, "初始无草稿");
eq(M.saveDrafts([{name: "草稿A", updatedAt: 1, data: goodData()}]), true, "保存草稿 A 返回 true");
eq(M.loadDrafts().length, 1, "保存后载入 1 条");
eq(M.loadDrafts()[0].name, "草稿A", "草稿名称往返一致");

M.saveDrafts([{name: "草稿B", updatedAt: 2, data: goodData()}, {name: "草稿A", updatedAt: 1, data: goodData()}]);
eq(M.loadDrafts().length, 2, "两条草稿往返");
eq(M.loadDrafts()[0].name, "草稿B", "草稿顺序保持");

var two = M.loadDrafts();
two.splice(0, 1);
M.saveDrafts(two);
eq(M.loadDrafts().length, 1, "删除一条后剩 1 条");
eq(M.loadDrafts()[0].name, "草稿A", "删除后剩余草稿正确");

eq(M.readAutosave(), null, "自动暂存初始为 null");
var auto = goodData(); auto.rows.push({name: "散热器", spec: "", unit: "个", qty: 30, price: 89});
M.writeAutosave(auto);
var back = M.readAutosave();
eq(back.seller.company, "深圳市腾云科技有限公司", "自动暂存：报价方往返");
eq(back.rows.length, 2, "自动暂存：行数往返");
eq(back.rows[1].price, 89, "自动暂存：行单价往返");

M.saveDrafts("not-an-array");
eq(M.loadDrafts().length, 0, "非法数据保存后载入为空");

/* ---------- 6. 示例与默认数据 ---------- */
var sample = M.sampleQuote();
eq(sample.seller.company, "深圳市腾云科技有限公司", "示例：报价方虚构公司");
eq(sample.buyer.company, "广州市白云实业有限公司", "示例：客户虚构公司");
eq(sample.rows.length, 5, "示例：5 行项目");
var st = M.calcQuoteTotals(sample.rows, sample.discount, sample.taxRate);
eq(st.gross, 16160, "示例：折前合计 5360+4590+2670+1500+2040=16160");
eq(st.base, 15352, "示例：整折5% 后不含税 16160×95%");
eq(st.tax, 1995.76, "示例：税额 15352×13%=1995.76");
eq(st.total, 17347.76, "示例：价税合计 17347.76");
eq(M.validateQuote(sample).ok, true, "示例报价单自身校验通过");

var nd = M.newQuoteData();
eq(Array.isArray(nd.rows), true, "默认数据 rows 为数组");
eq(nd.rows.length, 1, "默认数据 1 行");
eq(nd.discount, 0, "默认折扣 0");
eq(nd.taxRate, 13, "默认税率 13");
eq(typeof nd.quoteDate, "string", "默认报价日期为字符串");

eq(M.fmtMoney(117.9), "117.90", "金额格式化两位");
eq(M.round2(0.1 + 0.2), 0.3, "浮点 0.1+0.2 舍入");
eq(M.TAX_PRESETS.indexOf(13) !== -1, true, "税率预设含 13%");

console.log("通过 " + pass + " / 失败 " + fail);
process.exit(fail === 0 ? 0 : 1);
