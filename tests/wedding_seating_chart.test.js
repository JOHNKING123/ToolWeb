/* 婚宴座位表生成器纯逻辑单元测试（零依赖）：node tests/wedding_seating_chart.test.js
* 覆盖：
* 1. 名单解析（分隔符兼容/去空行/去重计数/组别统计）
* 2. 自动分桌（组别聚类/容量钳制/主桌预留/蛇形均衡/超额溢出/空名单）
* 3. 拖拽调桌 moveGuest（成功/满桌拒绝/主桌容量/异常）
* 4. 尺寸预设与基础函数
*/
"use strict";
var M = require("../static/js/wedding_seating_chart.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function deepEq(a, b, name) { ok(JSON.stringify(a) === JSON.stringify(b), name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }

/* ---------- 1. 名单解析 ---------- */
var p1 = M.parseGuests("张三,男方亲友\n李四，女方亲友\n王五\n\n赵六\t同事\n钱七 同学");
eq(p1.count, 5, "解析 5 人（空行跳过）");
eq(p1.skipped, 1, "空行计 1");
eq(p1.guests[0].name, "张三", "半角逗号姓名");
eq(p1.guests[0].group, "男方亲友", "半角逗号组别");
eq(p1.guests[1].group, "女方亲友", "全角逗号组别");
eq(p1.guests[2].group, "", "无组别为空串");
eq(p1.guests[3].group, "同事", "Tab 分隔（Excel 粘贴）");
eq(p1.guests[4].group, "同学", "空格分隔");

var p2 = M.parseGuests("张三,男方\n张三,女方\n张三\n李四,男方");
eq(p2.count, 2, "重名去重后 2 人");
eq(p2.dup, 2, "重复计数 2");
eq(p2.guests[0].group, "男方", "去重保留首次出现的组别");

var p3 = M.parseGuests("   \n\t");
eq(p3.count, 0, "全空行 0 人");
eq(p3.skipped, 2, "全空行 skipped 2");

var p4 = M.parseGuests("");
eq(p4.count, 0, "空输入 0 人");

var gb = M.countByGroup(M.parseGuests("A,男方\nB,男方\nC,女方\nD").guests);
eq(gb.length, 3, "组别统计 3 组（含未分组）");
eq(gb[0].count, 2, "男方 2 人");

/* ---------- 2. 自动分桌 ---------- */
/* 2.1 空名单 */
var e0 = M.autoSeat([], {tables: 5, perTable: 10, reserved: 2});
eq(e0.tables.length, 5, "空名单仍建 5 桌");
eq(e0.unseated.length, 0, "空名单无溢出");
ok(e0.tables.every(function (t) { return t.guests.length === 0; }), "空名单各桌 0 人");

/* 2.2 40 人 4 组别（每组 10 人）：同组同桌 */
function forty() {
  var groups = ["男方亲友", "女方亲友", "大学同学", "同事好友"], lines = [];
  groups.forEach(function (g, gi) {
    for (var i = 0; i < 10; i++) lines.push("宾客" + gi + "-" + i + "," + g);
  });
  return M.parseGuests(lines.join("\n")).guests;
}
var e1 = M.autoSeat(forty(), {tables: 5, perTable: 10, reserved: 2});
eq(e1.unseated.length, 0, "40 人 5 桌×10（主桌预留 2）无溢出");
ok(e1.tables.every(function (t) { return t.guests.length <= t.capacity; }), "每桌不超额（容量钳制）");
eq(e1.tables[0].capacity, 8, "主桌容量 = 10 - 预留 2 = 8");
eq(e1.tables[0].reserved, 2, "主桌预留 2 席记录");
eq(e1.tables[0].label, "主桌", "1 号桌 label 为主桌");
eq(e1.tables[1].label, "2号桌", "2 号桌 label");
var pure = e1.tables.every(function (t) {
  if (!t.guests.length) return true;
  var g0 = t.guests[0].group;
  return t.guests.every(function (x) { return x.group === g0; });
});
ok(pure, "每桌宾客同组（组别聚类，整组 best-fit）");
var total = 0;
e1.tables.forEach(function (t) { total += t.guests.length; });
eq(total, 40, "40 人全部安排");

/* 2.3 主桌预留钳制：预留 ≥ 每桌人数 → 主桌容量 0 */
var e2 = M.autoSeat(M.parseGuests("A\nB").guests, {tables: 2, perTable: 10, reserved: 99});
eq(e2.tables[0].capacity, 0, "预留超限钳制到每桌人数，主桌容量 0");
eq(e2.tables[0].guests.length, 0, "主桌容量 0 不安排宾客");
eq(e2.unseated.length, 0, "2 人仍可安排在其余桌");

/* 2.4 超大组别拆分：12 人组在每桌 10 人时拆分，但每桌不超额 */
var big = [];
for (var i = 0; i < 12; i++) big.push("大" + i + ",大家族");
var e3 = M.autoSeat(M.parseGuests(big.join("\n")).guests, {tables: 3, perTable: 10, reserved: 0});
ok(e3.tables.every(function (t) { return t.guests.length <= t.capacity; }), "超大组拆分后仍不超额");
var seated3 = 0;
e3.tables.forEach(function (t) { seated3 += t.guests.length; });
eq(seated3, 12, "12 人全部安排（拆分到多桌）");
eq(e3.unseated.length, 0, "容量充足无溢出");

/* 2.5 溢出：人数超过总容量 → unseated */
var many = [];
for (var k = 0; k < 25; k++) many.push("客" + k + ",亲友");
var e4 = M.autoSeat(M.parseGuests(many.join("\n")).guests, {tables: 2, perTable: 10, reserved: 0});
eq(e4.unseated.length, 5, "25 人 / 2 桌×10 → 5 人溢出");
ok(e4.tables.every(function (t) { return t.guests.length <= 10; }), "溢出时已安排桌仍不超额");

/* 2.6 蛇形均衡：9 个无组别宾客，3 桌 → 3/3/3 */
var singles = [];
for (var s = 0; s < 9; s++) singles.push("散客" + s);
var e5 = M.autoSeat(M.parseGuests(singles.join("\n")).guests, {tables: 3, perTable: 10, reserved: 0});
deepEq(e5.tables.map(function (t) { return t.guests.length; }), [3, 3, 3], "无组别 9 人蛇形均衡 3/3/3");

/* 2.7 蛇形均衡奇数：7 个散客 3 桌 → 3/2/2（蛇形轮次） */
var singles7 = [];
for (var s7 = 0; s7 < 7; s7++) singles7.push("客" + s7);
var e6 = M.autoSeat(M.parseGuests(singles7.join("\n")).guests, {tables: 3, perTable: 10, reserved: 0});
deepEq(e6.tables.map(function (t) { return t.guests.length; }), [3, 2, 2], "无组别 7 人蛇形 3/2/2");

/* 2.8 小组整组同桌：5 人组 4 桌×10 → 整组进剩余空间最小的桌（主桌容量 8→剩 3） */
var five = [];
for (var f = 0; f < 5; f++) five.push("小" + f + ",小家庭");
var e7 = M.autoSeat(M.parseGuests(five.join("\n")).guests, {tables: 4, perTable: 10, reserved: 2});
var nonEmpty = e7.tables.filter(function (t) { return t.guests.length > 0; });
eq(nonEmpty.length, 1, "5 人小组只占一桌（整组 best-fit）");
eq(nonEmpty[0].index, 0, "5 人小组进主桌（best-fit：主桌剩 3 最小）");

/* 2.9 参数钳制 */
var e8 = M.autoSeat(M.parseGuests("A").guests, {tables: 0, perTable: 0, reserved: -5});
eq(e8.tables.length, 1, "桌数 0 → 钳制为 1");
eq(e8.tables[0].capacity, 1, "每桌人数 0 → 钳制为 1，主桌预留钳制 0 后容量 1");

/* ---------- 3. 拖拽调桌 ---------- */
function tables2() {
  return M.autoSeat(M.parseGuests("A,男方\nB,男方\nC,女方").guests, {tables: 2, perTable: 2, reserved: 0}).tables;
}
var t1 = tables2();
/* 初始：男方组 2 人 best-fit 进 1 号桌（index 0），女方 1 人进 2 号桌 */
var mv1 = M.moveGuest(t1, "A", 1);
eq(mv1.ok, true, "移动 A 到 2 号桌成功");
eq(t1[0].guests.length, 1, "原桌剩 1 人");
eq(t1[1].guests.length, 2, "目标桌 2 人（满）");

var mv2 = M.moveGuest(t1, "B", 1);
eq(mv2.ok, false, "目标桌已满拒绝移动");
eq(mv2.reason, "full", "满桌 reason=full");
eq(t1[0].guests.length, 1, "拒绝后原桌人数不变");

var mv3 = M.moveGuest(t1, "不存在", 1);
eq(mv3.ok, false, "查无此人移动失败");
eq(mv3.reason, "not_found", "reason=not_found");

var mv4 = M.moveGuest(t1, "B", 0);
eq(mv4.ok, true, "同桌移动视为成功");

var mv5 = M.moveGuest(t1, "B", 9);
eq(mv5.ok, false, "非法桌号拒绝");

/* 主桌容量钳制：主桌预留后已满则拒绝 */
var tm = M.autoSeat(M.parseGuests("A\nB").guests, {tables: 2, perTable: 2, reserved: 1}).tables;
eq(tm[0].capacity, 1, "主桌容量 1（2-1）");
var mv6 = M.moveGuest(tm, "B", 0);
eq(mv6.ok, false, "主桌已满拒绝（容量钳制）");

/* ---------- 4. 尺寸预设与基础 ---------- */
eq(M.TABLE_SIZES.length, 4, "4 种海报尺寸预设");
eq(M.getSize("a3").page, "A3 portrait", "A3 打印 page");
eq(M.getSize("poster6090").pxW, 2267.7, "60×90cm 像素宽");
eq(M.getSize("screen169").page, "1920px 1080px", "16:9 电子屏 page");
eq(M.getSize("不存在").id, "a3", "未知尺寸回退 A3");
eq(M.clampInt("abc", 8, 1, 200), 8, "非法输入取默认");
eq(M.clampInt(999, 8, 1, 200), 200, "超限取上界");
eq(M.esc('<b>&"'), "&lt;b&gt;&amp;&quot;", "HTML 转义");
eq(M.LS_KEY, "tw_seating_v1", "localStorage key");
var ds = M.defaultSettings();
eq(ds.tables, 8, "默认 8 桌");
eq(ds.perTable, 10, "默认每桌 10 人");
eq(ds.reserved, 2, "默认主桌预留 2 席");
eq(ds.sizePreset, "a3", "默认 A3");

console.log("通过 " + pass + " / 失败 " + fail);
process.exit(fail === 0 ? 0 : 1);
