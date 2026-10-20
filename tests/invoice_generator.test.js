/* 发票生成器纯逻辑单元测试（零依赖）：node tests/invoice_generator.test.js
* 覆盖：
* 1. 人民币金额大写（零/整/角分/万亿兆进位/连续零/负数/浮点舍入）
* 2. 行项目计算口径（先行折后整折、税额按折后计、行四舍五入到分、超限钳制）
* 3. 典型三行项目（折扣＋不同税率）合计/税额/价税合计＋大写
* 4. 整单折扣组合口径
*/
"use strict";
var M = require("../static/js/invoice_generator.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }

/* ---------- 1. 金额大写 ---------- */
eq(M.moneyToChinese(0), "零圆整", "0 → 零圆整");
eq(M.moneyToChinese(100), "壹佰圆整", "100 → 壹佰圆整");
eq(M.moneyToChinese(1000), "壹仟圆整", "1000 → 壹仟圆整");
eq(M.moneyToChinese(1234.56), "壹仟贰佰叁拾肆圆伍角陆分", "1234.56 全位");
eq(M.moneyToChinese(1.01), "壹圆零壹分", "1.01 角位补零");
eq(M.moneyToChinese(0.05), "零圆伍分", "0.05 零元不双重零");
eq(M.moneyToChinese(10.20), "壹拾圆贰角", "10.20 分为零不写分");
eq(M.moneyToChinese(101), "壹佰零壹圆整", "101 节内补零");
eq(M.moneyToChinese(110), "壹佰壹拾圆整", "110");
eq(M.moneyToChinese(10010.05), "壹万零壹拾圆零伍分", "万位零补");
eq(M.moneyToChinese(100001), "壹拾万零壹圆整", "100001");
eq(M.moneyToChinese(100000001), "壹亿零壹圆整", "亿位零补");
eq(M.moneyToChinese(100000000), "壹亿圆整", "一亿");
eq(M.moneyToChinese(1000000000000), "壹兆圆整", "一兆");
eq(M.moneyToChinese(-123.45), "负壹佰贰拾叁圆肆角伍分", "负数冠负");
eq(M.moneyToChinese(1.005), "壹圆零壹分", "1.005 四舍五入进位");
eq(M.moneyToChinese(9999.99), "玖仟玖佰玖拾玖圆玖角玖分", "9999.99");
eq(M.moneyToChinese(2000000.04), "贰佰万圆零肆分", "2000000.04");

/* ---------- 2. 行计算口径 ---------- */
var r1 = M.calcRow({qty: 2, price: 100, discount: 10, taxRate: 13}, 0);
eq(r1.gross, 200, "行1 折前金额");
eq(r1.net, 180, "行1 行折后");
eq(r1.base, 180, "行1 整折后不含税");
eq(r1.tax, 23.4, "行1 税额按折后计（180×13%）");
eq(r1.total, 203.4, "行1 价税合计");

/* 先行折后整折组合 */
var r2 = M.calcRow({qty: 1, price: 1000, discount: 20, taxRate: 13}, 10);
eq(r2.net, 800, "先行折 20% → 800");
eq(r2.base, 720, "后整折 10% → 720");
eq(r2.tax, 93.6, "税额 720×13%=93.6（按折后计）");
eq(r2.total, 813.6, "价税合计 813.6");

/* 行四舍五入到分 */
var r3 = M.calcRow({qty: 1, price: 999.99, discount: 5, taxRate: 9}, 0);
eq(r3.net, 949.99, "949.9905 舍入到分 → 949.99");
eq(r3.tax, 85.5, "85.4991 舍入 → 85.50");
eq(r3.total, 1035.49, "行价税合计");

/* 超限钳制与异常输入 */
var r4 = M.calcRow({qty: 2, price: 100, discount: 150, taxRate: 200}, 200);
eq(r4.net, 0, "行折扣>100% 钳制 → 0");
eq(r4.base, 0, "整单折扣>100% 钳制 → 0");
eq(r4.tax, 0, "税额 0");
var r5 = M.calcRow({qty: "abc", price: null, discount: NaN, taxRate: undefined}, 0);
eq(r5.gross, 0, "异常输入全部归零");
eq(r5.total, 0, "异常输入价税合计 0");

/* 零税率 */
var r6 = M.calcRow({qty: 5, price: 20, discount: 0, taxRate: 0}, 0);
eq(r6.tax, 0, "税率 0 税额为 0");
eq(r6.total, 100, "零税率价税合计=不含税");

/* ---------- 3. 典型三行项目（折扣＋不同税率） ---------- */
var rows = [
  {name: "设计服务", qty: 2, price: 100, discount: 10, taxRate: 13},
  {name: "打印耗材", qty: 3, price: 50, discount: 0, taxRate: 6},
  {name: "软件授权", qty: 1, price: 999.99, discount: 5, taxRate: 9}
];
var t = M.calcTotals(rows, 0);
eq(t.gross, 1349.99, "折前合计 200+150+999.99");
eq(t.net, 1279.99, "行折后合计 180+150+949.99");
eq(t.base, 1279.99, "不含税合计（无整单折扣）");
eq(t.tax, 117.9, "税额合计 23.40+9.00+85.50");
eq(t.total, 1397.89, "价税合计");
eq(M.moneyToChinese(t.total), "壹仟叁佰玖拾柒圆捌角玖分", "1397.89 大写");

/* ---------- 4. 整单折扣组合口径 ---------- */
var t2 = M.calcTotals(rows, 10);
eq(t2.base, 1151.99, "整折 10% 后不含税合计 162+135+854.99");
eq(t2.tax, 106.11, "税额合计 21.06+8.10+76.95");
eq(t2.total, 1258.1, "整折后价税合计");
eq(M.moneyToChinese(t2.total), "壹仟贰佰伍拾捌圆壹角", "1258.10 大写");

/* 空行 */
var t0 = M.calcTotals([], 0);
eq(t0.total, 0, "空行价税合计 0");
eq(M.moneyToChinese(t0.total), "零圆整", "空行大写");

/* fmtMoney / round2 */
eq(M.fmtMoney(117.9), "117.90", "金额格式化两位");
eq(M.round2(0.1 + 0.2), 0.3, "浮点 0.1+0.2 舍入");

console.log("通过 " + pass + " / 失败 " + fail);
process.exit(fail === 0 ? 0 : 1);
