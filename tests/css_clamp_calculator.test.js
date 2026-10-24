/* CSS clamp 流体尺寸计算器纯逻辑单元测试（零依赖）：node tests/css_clamp_calculator.test.js
 * 覆盖：数值格式化、整数视口、含小数斜率、rem 换算、断点取值、边界钳制、
 * 非法输入、8 组预设静态检查、注册与零网络请求。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/css_clamp_calculator.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "css_clamp_calculator.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "css_clamp_calculator.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. 数值格式化 ---------- */
eq(M.fmt(2.5), "2.5", "fmt 去尾零：2.5");
eq(M.fmt(16), "16", "fmt 整数不带小数点");
eq(M.fmt(0.8333333), "0.8333", "fmt 四舍五入到 4 位小数");
eq(M.fmt(0), "0", "fmt 零");
eq(M.fmt(-0), "0", "fmt 负零归零");
eq(M.fmt(1200), "1200", "fmt 大整数");

/* ---------- 2. 整数视口用例：320→1280，16→24px ---------- */
/* 手工推导：斜率 = 8/960×100 = 0.8333；截距 = 16 − 0.8333×3.2 = 13.3333 */
var A = M.compute({ minVp: 320, maxVp: 1280, minSize: 16, maxSize: 24, unit: "px", root: 16 });
ok(A.valid, "用例 A 合法");
eq(M.fmt(A.slope), "0.8333", "用例 A 斜率");
eq(M.fmt(A.interceptPx), "13.3333", "用例 A 截距 px");
eq(A.clampPx, "clamp(16px, 13.3333px + 0.8333vw, 24px)", "用例 A px 版 clamp()");
eq(A.clampRem, "clamp(1rem, 0.8333rem + 0.8333vw, 1.5rem)", "用例 A rem 版 clamp()");

/* ---------- 3. 含小数斜率用例：375→1440，18→42px ---------- */
/* 手工推导：斜率 = 24/1065×100 = 2.2535；截距 = 18 − 2.2535×3.75 = 9.5493 */
var B = M.compute({ minVp: 375, maxVp: 1440, minSize: 18, maxSize: 42, unit: "px", root: 16 });
ok(B.valid, "用例 B 合法");
eq(M.fmt(B.slope), "2.2535", "用例 B 斜率");
eq(M.fmt(B.interceptPx), "9.5493", "用例 B 截距");
eq(B.clampPx, "clamp(18px, 9.5493px + 2.2535vw, 42px)", "用例 B px 版 clamp()");
eq(B.clampRem, "clamp(1.125rem, 0.5968rem + 2.2535vw, 2.625rem)", "用例 B rem 版 clamp()");

/* ---------- 4. rem 输入换算：1→1.5rem，320→1200，根字号 16 ---------- */
/* 手工推导：换算 16→24px；斜率 = 8/880×100 = 0.9091；截距 = 16 − 0.9091×3.2 = 13.0909 */
var C = M.compute({ minVp: 320, maxVp: 1200, minSize: 1, maxSize: 1.5, unit: "rem", root: 16 });
ok(C.valid, "用例 C 合法");
eq(C.minPx, 16, "用例 C 最小尺寸换算为 16px");
eq(C.maxPx, 24, "用例 C 最大尺寸换算为 24px");
eq(M.fmt(C.slope), "0.9091", "用例 C 斜率");
eq(M.fmt(C.interceptPx), "13.0909", "用例 C 截距 px");
eq(M.fmt(C.interceptRem), "0.8182", "用例 C 截距 rem");
eq(C.clampPx, "clamp(16px, 13.0909px + 0.9091vw, 24px)", "用例 C px 版 clamp()");
eq(C.clampRem, "clamp(1rem, 0.8182rem + 0.9091vw, 1.5rem)", "用例 C rem 版 clamp()");

/* ---------- 5. 根字号 20 的 px 输入换算 ---------- */
/* 手工推导：斜率 = 20/1000×100 = 2；截距 = 20 − 2×3.2 = 13.6；rem 版除以 20 */
var D = M.compute({ minVp: 320, maxVp: 1320, minSize: 20, maxSize: 40, unit: "px", root: 20 });
ok(D.valid, "用例 D 合法");
eq(M.fmt(D.slope), "2", "用例 D 斜率");
eq(M.fmt(D.interceptPx), "13.6", "用例 D 截距");
eq(D.clampRem, "clamp(1rem, 0.68rem + 2vw, 2rem)", "用例 D rem 版 clamp()（根字号 20）");

/* ---------- 6. 断点取值与钳制（用例 A） ---------- */
var vMin = M.valueAt(A, 320);
eq(vMin.value, 16, "取值：最小视口取最小值");
eq(vMin.clamped, "min", "取值：最小视口标注 min 钳制");
var vMax = M.valueAt(A, 1280);
eq(vMax.value, 24, "取值：最大视口取最大值");
eq(vMax.clamped, "max", "取值：最大视口标注 max 钳制");
var vBelow = M.valueAt(A, 200);
eq(vBelow.value, 16, "取值：断点外下方钳制为最小值");
eq(vBelow.clamped, "min", "取值：断点外下方标注 min");
var vAbove = M.valueAt(A, 1600);
eq(vAbove.value, 24, "取值：断点外上方钳制为最大值");
eq(vAbove.clamped, "max", "取值：断点外上方标注 max");
var vMid = M.valueAt(A, 800);
eq(M.fmt(vMid.value), "20", "取值：区间内插值 800px → 20px");
eq(vMid.clamped, null, "取值：区间内无钳制标注");
ok(M.valueAt(A, "abc") === null, "取值：非数字视口返回 null");
ok(M.valueAt({ valid: false }, 800) === null, "取值：非法结果返回 null");

/* ---------- 7. 断点取值表 ---------- */
eq(JSON.stringify(M.BREAKPOINTS), JSON.stringify([320, 375, 768, 1024, 1440]), "断点表固定为 320/375/768/1024/1440");
var table = M.breakpointTable(A);
eq(table.length, 5, "断点表 5 行");
eq(M.fmt(table[1].valuePx), "16.4583", "断点表：375px 插值");
eq(M.fmt(table[1].valueRem), "1.0286", "断点表：375px rem 值");
eq(table[1].clamped, null, "断点表：375px 无钳制");
eq(table[2].clamped, null, "断点表：768px 无钳制");
eq(M.fmt(table[2].valuePx), "19.7333", "断点表：768px 插值");
eq(table[4].valuePx, 24, "断点表：1440px 超出最大视口钳制为最大值");
eq(table[4].clamped, "max", "断点表：1440px 标注 max");
eq(M.clampLabel("min"), "钳制为最小值", "钳制文案 min");
eq(M.clampLabel("max"), "钳制为最大值", "钳制文案 max");
eq(M.clampLabel(null), "区间内插值", "钳制文案区间内");
ok(M.breakpointTable({ valid: false }).length === 0, "断点表：非法结果为空表");

/* ---------- 8. 非法输入 ---------- */
function invalid(input, name) {
  var r = M.compute(input);
  ok(!r.valid && r.errors.length > 0 && !r.clampPx, name);
}
invalid({ minVp: 1440, maxVp: 320, minSize: 16, maxSize: 24, unit: "px", root: 16 }, "非法：最大视口小于最小视口");
invalid({ minVp: 320, maxVp: 320, minSize: 16, maxSize: 24, unit: "px", root: 16 }, "非法：最大视口等于最小视口");
invalid({ minVp: 320, maxVp: 1440, minSize: 24, maxSize: 16, unit: "px", root: 16 }, "非法：最大尺寸小于最小尺寸");
invalid({ minVp: 320, maxVp: 1440, minSize: 16, maxSize: 16, unit: "px", root: 16 }, "非法：最大尺寸等于最小尺寸");
invalid({ minVp: 0, maxVp: 1440, minSize: 16, maxSize: 24, unit: "px", root: 16 }, "非法：最小视口为 0");
invalid({ minVp: 320, maxVp: 1440, minSize: -1, maxSize: 24, unit: "px", root: 16 }, "非法：最小尺寸为负");
invalid({ minVp: 320, maxVp: 1440, minSize: 16, maxSize: 24, unit: "px", root: 0 }, "非法：根字号为 0");
invalid({ minVp: "", maxVp: 1440, minSize: 16, maxSize: 24, unit: "px", root: 16 }, "非法：最小视口为空");
var badVp = M.compute({ minVp: 1440, maxVp: 320, minSize: 16, maxSize: 24, unit: "px", root: 16 });
ok(badVp.errors.join("").indexOf("最大视口须大于最小视口") >= 0, "非法提示文案：视口大小关系");
var badSize = M.compute({ minVp: 320, maxVp: 1440, minSize: 24, maxSize: 16, unit: "px", root: 16 });
ok(badSize.errors.join("").indexOf("最大尺寸须大于最小尺寸") >= 0, "非法提示文案：尺寸大小关系");

/* ---------- 9. 8 组预设静态检查 ---------- */
eq(M.PRESETS.length, 8, "预设共 8 组");
eq(M.PRESETS.map(function (p) { return p.name; }).join("、"), "H1 标题、H2 标题、正文、按钮内边距、区块间距、卡片间距、容器最大宽度、段落行高", "预设名称齐全");
M.PRESETS.forEach(function (p, i) {
  var r = M.compute({ minVp: p.minVp, maxVp: p.maxVp, minSize: p.minSize, maxSize: p.maxSize, unit: p.unit, root: 16 });
  ok(r.valid, "预设 " + i + "（" + p.name + "）可算出合法公式");
  ok(p.note && p.note.length > 0, "预设 " + i + " 有说明");
});

/* ---------- 10. 注册、SEO、互链与零网络请求 ---------- */
ok(GO_SRC.indexOf('"css_clamp_calculator"') >= 0, "注册：categories.go 含 ID");
ok(GO_SRC.indexOf('"/tools/css-clamp-calculator"') >= 0, "注册：categories.go 含 Path");
ok(GO_SRC.indexOf('"format_size"') >= 0, "注册：Icon format_size");
var pathMatches = GO_SRC.match(/"\/tools\/[^"]+"/g) || [];
var uniquePaths = {};
pathMatches.forEach(function (p) { uniquePaths[p] = true; });
eq(Object.keys(uniquePaths).length, 166, "注册总数 165→166 Path");
ok(TPL_SRC.indexOf("https://www.johnkingzcq123.xyz/tools/css-clamp-calculator") >= 0, "SEO：canonical 正确");
ok(TPL_SRC.indexOf("/tools/css-gradient-generator") >= 0, "互链：CSS 渐变生成器");
ok(TPL_SRC.indexOf("/tools/css-to-tailwind") >= 0, "互链：CSS 转 Tailwind 转换器");
ok(TPL_SRC.indexOf("只在两断点间线性插值") >= 0, "真限制：断点间插值、断点外钳制");
ok(TPL_SRC.indexOf("rem 换算依赖根字号") >= 0, "真限制：rem 依赖根字号");
ok(TPL_SRC.indexOf("文本不出浏览器") >= 0, "真限制：文本不出浏览器");
ok(TPL_SRC.indexOf("请按需改写") >= 0, "预设提示：请按需改写");
eq((TPL_SRC.match(/data-preset="/g) || []).length, 8, "模板含 8 个预设按钮");
ok(JS_SRC.indexOf("fetch(") < 0, "零网络请求：JS 无 fetch");
ok(JS_SRC.indexOf("XMLHttpRequest") < 0, "零网络请求：JS 无 XHR");
ok(TPL_SRC.indexOf("ccc-slider") >= 0 && TPL_SRC.indexOf("ccc-preview-val") >= 0, "模板含视口滑杆与当前值展示");

console.log("css_clamp_calculator: " + pass + " 通过, " + fail + " 失败");
process.exit(fail ? 1 : 0);
