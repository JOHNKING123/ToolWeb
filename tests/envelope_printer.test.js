/* 信封打印助手纯逻辑单元测试（零依赖）：node tests/envelope_printer.test.js
 * 覆盖：7 个预设尺寸表、自定义校验边界、毫米坐标、偏移叠加与步进收敛、
 * 边界收敛、竖版提示、打印样式字符串、测试页网格、空收件人、超长提示、
 * 示例静态检查、注册总数 169→170、模板静态检查、零网络请求。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/envelope_printer.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function has(s, sub, name) { ok(String(s).indexOf(sub) !== -1, name + "（应包含 " + JSON.stringify(sub) + "，实得 " + JSON.stringify(s) + "）"); }
function notHas(s, sub, name) { ok(String(s).indexOf(sub) === -1, name + "（不应包含 " + JSON.stringify(sub) + "）"); }
function hasWarn(list, sub, name) {
  ok(list.some(function (w) { return w.indexOf(sub) !== -1; }), name + "（提示应含 " + JSON.stringify(sub) + "，实得 " + JSON.stringify(list) + "）");
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "envelope_printer.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "envelope_printer.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

function base(over) {
  var input = { preset: "DL",
    recipient: { name: "王小明", address: "广东省深圳市南山区科技园科苑路88号", postcode: "518057" },
    sender: { name: "李华", address: "广东省深圳市福田区福华路123号", postcode: "518000" },
    globalOffset: { x: 0, y: 0 }, recipientOffset: { x: 0, y: 0 } };
  if (over) for (var k in over) input[k] = over[k];
  return input;
}

/* ---------- 1. 预设尺寸表（宽×高，毫米） ---------- */
eq(M.PRESETS.length, 7, "预设共 7 个");
var expectSize = { "#10": [105, 241], DL: [110, 220], C5: [162, 229], C6: [114, 162],
  A2: [111, 146], A6: [121, 165], A7: [133, 184] };
M.PRESETS.forEach(function (p) {
  eq(p.width, expectSize[p.id][0], "预设 " + p.id + " 宽");
  eq(p.height, expectSize[p.id][1], "预设 " + p.id + " 高");
});

/* ---------- 2. 自定义尺寸校验边界 ---------- */
var cOk = M.resolveSize("custom", 80, 60);
ok(cOk.valid, "自定义下限 80×60 合法");
var cOk2 = M.resolveSize("custom", 400, 300);
ok(cOk2.valid, "自定义上限 400×300 合法");
ok(!M.resolveSize("custom", 79, 100).valid, "自定义宽 79 报错");
ok(!M.resolveSize("custom", 401, 100).valid, "自定义宽 401 报错");
ok(!M.resolveSize("custom", 100, 59).valid, "自定义高 59 报错");
ok(!M.resolveSize("custom", 100, 301).valid, "自定义高 301 报错");
ok(!M.resolveSize("custom", "abc", 100).valid, "自定义非数字报错");
ok(!M.resolveSize("NOPE", 0, 0).valid, "未知预设报错");

/* ---------- 3. DL 默认毫米坐标（手工复算） ---------- */
var DL = M.computeLayout(base());
ok(DL.valid, "DL 默认布局合法");
eq(DL.zones.sender.x, 12, "DL 寄件人区左 12mm");
eq(DL.zones.sender.y, 10, "DL 寄件人区上 10mm");
eq(DL.zones.recipient.x, 49.5, "DL 收件人区左＝110×0.45＝49.5mm");
eq(DL.zones.recipient.y, 110, "DL 收件人区上＝220×0.50＝110mm");
eq(DL.zones.stamp.x, 75, "DL 邮票框左＝110−10−25＝75mm");
eq(DL.zones.stamp.y, 10, "DL 邮票框上 10mm");
eq(DL.zones.stamp.width, 25, "邮票框宽 25mm");
eq(DL.zones.stamp.height, 20, "邮票框高 20mm");
ok(DL.zones.recipient.x + DL.zones.recipient.width <= 110, "DL 收件人区不越右界");

/* ---------- 4. C5 默认坐标（手工复算） ---------- */
var C5 = M.computeLayout(base({ preset: "C5" }));
eq(C5.zones.recipient.x, 72.9, "C5 收件人区左＝162×0.45＝72.9mm");
eq(C5.zones.recipient.y, 114.5, "C5 收件人区上＝229×0.50＝114.5mm");
eq(C5.zones.stamp.x, 127, "C5 邮票框左＝162−10−25＝127mm");
eq(C5.zones.sender.x, 12, "C5 寄件人区左仍 12mm");

/* ---------- 5. 偏移叠加：全局＋收件人独立 ---------- */
var OFF = M.computeLayout(base({
  globalOffset: { x: 2, y: -1.5 }, recipientOffset: { x: 1, y: 2 } }));
eq(OFF.zones.sender.x, 14, "全局偏移 X 作用于寄件人区（12＋2）");
eq(OFF.zones.sender.y, 8.5, "全局偏移 Y 作用于寄件人区（10−1.5）");
eq(OFF.zones.recipient.x, 52.5, "收件人区 X＝49.5＋全局 2＋独立 1");
eq(OFF.zones.recipient.y, 110.5, "收件人区 Y＝110−1.5＋2");
eq(OFF.zones.stamp.x, 77, "邮票框只受全局偏移影响（75＋2）");
eq(OFF.zones.stamp.y, 8.5, "邮票框 Y 只受全局偏移影响（10−1.5）");

/* ---------- 6. 偏移为 0 时坐标即基准，无多余偏移 ---------- */
eq(DL.offsets.globalX, 0, "默认全局偏移 X 为 0");
eq(DL.offsets.recipientY, 0, "默认收件人偏移 Y 为 0");
eq(DL.zones.sender.x, 12, "偏移 0 时寄件人区坐标即基准");

/* ---------- 7. 偏移步进对齐与范围收敛 ---------- */
var STEP = M.computeLayout(base({ globalOffset: { x: 1.3, y: 0 } }));
eq(STEP.offsets.globalX, 1.5, "偏移 1.3mm 步进对齐到 1.5mm");
var BIG = M.computeLayout(base({ globalOffset: { x: 30, y: -30 } }));
eq(BIG.offsets.globalX, 20, "全局偏移 X 超 20 收敛到 20");
eq(BIG.offsets.globalY, -20, "全局偏移 Y 超 −20 收敛到 −20");
hasWarn(BIG.warnings, "收敛", "偏移超范围有收敛提示");

/* ---------- 8. 边界收敛：小尺寸＋大偏移 ---------- */
var SMALL = M.computeLayout(base({ preset: "custom", customWidth: 80, customHeight: 60,
  globalOffset: { x: 20, y: 20 }, recipientOffset: { x: 20, y: 20 } }));
ok(SMALL.valid, "小尺寸大偏移仍合法（收敛不拦截）");
ok(SMALL.zones.sender.x + SMALL.zones.sender.width <= 80, "寄件人区收敛后不越右界");
ok(SMALL.zones.recipient.x + SMALL.zones.recipient.width <= 80, "收件人区收敛后不越右界");
ok(SMALL.zones.stamp.x + SMALL.zones.stamp.width <= 80, "邮票框收敛后不越右界");
ok(SMALL.zones.recipient.y + SMALL.zones.recipient.height <= 60, "收件人区收敛后不越下界");
hasWarn(SMALL.warnings, "收敛到边界内", "超边界有收敛提示");

/* ---------- 9. 竖版提示 ---------- */
hasWarn(DL.warnings, "竖版信封", "DL（110＜220）有竖版提示");
var LAND = M.computeLayout(base({ preset: "custom", customWidth: 200, customHeight: 100 }));
ok(!LAND.warnings.some(function (w) { return w.indexOf("竖版") !== -1; }), "宽＞高时无竖版提示");
hasWarn(M.computeLayout(base({ preset: "A6" })).warnings, "竖版信封", "A6（121＜165）有竖版提示");

/* ---------- 10. 打印样式字符串 ---------- */
eq(M.buildPrintCSS(110, 220), "@page { size: 110mm 220mm; margin: 0; }", "DL @page 样式精确");
eq(DL.printCSS, "@page { size: 110mm 220mm; margin: 0; }", "布局输出的打印样式与尺寸同步");
eq(M.buildPrintCSS(162, 229), "@page { size: 162mm 229mm; margin: 0; }", "C5 @page 样式随尺寸变化");

/* ---------- 11. 测试页网格（DL 手工复算） ---------- */
var G = DL.testGrid;
eq(G.vLines.length, 12, "DL 测试页竖线 0–110 每 10mm 共 12 条");
eq(G.hLines.length, 23, "DL 测试页横线 0–220 每 10mm 共 23 条");
eq(G.vLines[0], 0, "网格竖线起于 0");
eq(G.vLines[11], 110, "网格竖线止于宽");
eq(G.centerX, 55, "中心十字 X＝宽／2");
eq(G.centerY, 110, "中心十字 Y＝高／2");
eq(G.cropMarks.length, 8, "四角裁切标记共 8 段");
eq(G.centerCross.length, 2, "中心十字共 2 段");
var G2 = M.buildTestGrid(121, 165);
eq(G2.vLines.length, 13, "A6 测试页竖线随尺寸变化（0–120＋121 边界外不取，实为 13 条 0–120）");

/* ---------- 12. 空收件人 ---------- */
var EMPTY = M.computeLayout(base({
  recipient: { name: "", address: "", postcode: "" } }));
ok(!EMPTY.valid && EMPTY.errors.length > 0, "收件人全空返回错误");
eq(EMPTY.zones, null, "收件人全空不输出空白布局");
has(EMPTY.errors.join(" "), "收件人姓名与地址均为空", "空收件人错误文案明确");
var NAME_ONLY = M.computeLayout(base({
  recipient: { name: "王小明", address: "", postcode: "" } }));
ok(NAME_ONLY.valid, "仅姓名无地址时合法（只在姓名与地址均空时报错）");

/* ---------- 13. 超长提示不拦截 ---------- */
var LONGN = M.computeLayout(base({
  recipient: { name: new Array(52).join("王"), address: "地址", postcode: "" } }));
ok(LONGN.valid, "姓名超 50 字仍合法");
hasWarn(LONGN.warnings, "超过 50 字", "姓名超长有提示");
var LONGA = M.computeLayout(base({
  recipient: { name: "王小明", address: new Array(102).join("长"), postcode: "" } }));
ok(LONGA.valid, "地址单行超 100 字仍合法");
hasWarn(LONGA.warnings, "超过 100 字", "地址超长有提示");

/* ---------- 14. 预览缩放 ---------- */
eq(M.previewScale(110, 220, 640, 520), 2.36, "预览缩放取宽／高较小比例（520／220＝2.36）");
eq(M.previewScale(162, 229, 640, 520), 2.27, "C5 预览缩放随尺寸变化");

/* ---------- 15. 示例静态检查 ---------- */
eq(M.EXAMPLES.length, 3, "示例共 3 组");
eq(M.EXAMPLES[0].preset, "DL", "示例 1 为 DL 个人寄信");
eq(M.EXAMPLES[1].preset, "C5", "示例 2 为 C5 企业寄件");
eq(M.EXAMPLES[2].preset, "A6", "示例 3 为 A6 自定义小尺寸");
ok(M.EXAMPLES[2].globalOffset.x !== 0 || M.EXAMPLES[2].recipientOffset.x !== 0, "示例 3 含非零偏移");
M.EXAMPLES.forEach(function (ex, i) {
  var r = M.computeLayout({ preset: ex.preset, recipient: ex.recipient, sender: ex.sender,
    globalOffset: ex.globalOffset, recipientOffset: ex.recipientOffset });
  ok(r.valid, "示例 " + i + "（" + ex.name + "）布局合法");
  ok(r.zones.recipient.x > 0 && r.zones.recipient.y > 0, "示例 " + i + " 收件人区有坐标");
});

/* ---------- 16. 注册与模板静态检查 ---------- */
has(GO_SRC, '"envelope_printer"', "注册 ID");
has(GO_SRC, '"/tools/envelope-printer"', "注册 Path");
ok(/ID:\s+"envelope_printer"[\s\S]{0,1500}?Category:\s+"生活工具"/.test(GO_SRC), "注册品类为生活工具");
ok(/ID:\s+"envelope_printer"[\s\S]{0,1500}?New:\s+true/.test(GO_SRC), "注册 New: true");
eq((GO_SRC.match(/Path:\s+"/g) || []).length, 170, "注册总数 169→170 Path");
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/envelope-printer", "模板 canonical");
has(TPL_SRC, "application/ld+json", "模板 JSON-LD");
has(TPL_SRC, "请按需改写", "模板含请按需改写提示");
has(TPL_SRC, 'data-example="0"', "模板示例按钮 0");
has(TPL_SRC, 'data-example="2"', "模板示例按钮 2");
has(TPL_SRC, 'id="ep-envelope"', "模板预览信封容器");
has(TPL_SRC, "width:calc(var(--ew", "信封框宽由 --ew×--pxmm 决定（不塌陷）");
has(TPL_SRC, "height:calc(var(--eh", "信封框高由 --eh×--pxmm 决定（不塌陷）");
has(TPL_SRC, ".ep-envelope{position:relative;background:#fff;border:calc(var(--pxmm,2px)*0.4) solid #111827;margin:0 auto;overflow:hidden;box-sizing:border-box", "信封框用 border-box，边框不撑大 @page 尺寸");
notHas(TPL_SRC, "自定义小尺寸＋偏移（A6）", "示例 3 文案不再谎称自定义模式（实为 A6 预设）");
has(TPL_SRC, 'id="ep-print"', "模板打印按钮");
has(TPL_SRC, "@media print", "模板含打印样式");
has(TPL_SRC, "--pxmm:1mm", "模板打印时毫米变量为 1mm");
has(TPL_SRC, "先打测试页", "模板含先打测试页文案");
has(TPL_SRC, "无边距", "模板含无边距文案");
has(TPL_SRC, "实际大小", "模板含实际大小文案");
has(TPL_SRC, "屏幕预览仅示意", "模板含屏幕预览仅示意文案");
has(TPL_SRC, "不校验地址与邮编", "模板含不校验地址与邮编文案");
has(TPL_SRC, "文本不出浏览器", "模板含文本不出浏览器文案");
has(TPL_SRC, "/tools/big-sign-display", "互链大字标牌展示器");
has(TPL_SRC, "/tools/nine-grid", "互链九宫格切图");
has(TPL_SRC, 'id="ep-preset"', "模板尺寸预设选择器");
has(TPL_SRC, 'id="ep-mode-test"', "模板测试页切换按钮");

/* ---------- 17. 零网络请求与打印守卫 ---------- */
notHas(JS_SRC, "fetch(", "JS 无 fetch 调用");
notHas(JS_SRC, "XMLHttpRequest", "JS 无 XHR 调用");
has(JS_SRC, "window.print()", "JS 含打印调用");
has(JS_SRC, "if (!current || !current.valid) return;", "打印前校验守卫：未通过不弹打印对话框");

console.log("envelope_printer: " + pass + " passed, " + fail + " failed");
if (fail > 0) process.exit(1);
