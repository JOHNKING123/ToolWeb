/* CSS 缓动曲线生成器纯逻辑单元测试（零依赖）：node tests/css_easing_generator.test.js
 * 覆盖：四值钳制正反例、10 组预设四值、代码生成三段、时长同步、
 * 贝塞尔点与画布映射、注册与零网络请求静态检查。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/css_easing_generator.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "css_easing_generator.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "css_easing_generator.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. x 钳制：正反例 ---------- */
eq(M.clampX(0.5), 0.5, "x 0.5 不变");
eq(M.clampX(0), 0, "x 下界 0 不变");
eq(M.clampX(1), 1, "x 上界 1 不变");
eq(M.clampX(-0.2), 0, "x -0.2 钳制到 0");
eq(M.clampX(1.5), 1, "x 1.5 钳制到 1");
eq(M.clampX(NaN), 0, "x 非数字钳制到下界 0");

/* ---------- 2. y 钳制：正反例（回弹区间合法） ---------- */
eq(M.clampY(0.5), 0.5, "y 0.5 不变");
eq(M.clampY(-0.5), -0.5, "y -0.5 回弹值合法不变");
eq(M.clampY(1.5), 1.5, "y 1.5 回弹值合法不变");
eq(M.clampY(-1), -1, "y 下界 -1 不变");
eq(M.clampY(2), 2, "y 上界 2 不变");
eq(M.clampY(-1.5), -1, "y -1.5 钳制到 -1");
eq(M.clampY(2.5), 2, "y 2.5 钳制到 2");

/* ---------- 3. 时长钳制 ---------- */
eq(M.clampDuration(1), 1, "时长 1 不变");
eq(M.clampDuration(0.2), 0.2, "时长下界 0.2 不变");
eq(M.clampDuration(3), 3, "时长上界 3 不变");
eq(M.clampDuration(0.1), 0.2, "时长 0.1 钳制到 0.2");
eq(M.clampDuration(5), 3, "时长 5 钳制到 3");

/* ---------- 4. validateField：提示指明项 ---------- */
eq(M.validateField("x1", 1.5).value, 1, "validate x1 超限值");
ok(M.validateField("x1", 1.5).message.indexOf("x1") >= 0, "validate x1 提示指明 x1");
ok(M.validateField("y2", 3).message.indexOf("y2") >= 0, "validate y2 提示指明 y2");
ok(M.validateField("duration", 9).message.indexOf("动画时长") >= 0, "validate 时长提示指明动画时长");
eq(M.validateField("x2", 0.5).message, null, "validate 合法值无提示");
eq(M.validateField("y1", "abc").value, -1, "validate y1 非数字钳制到下界");
ok(M.validateField("y1", "abc").message.indexOf("y1") >= 0, "validate 非数字提示指明项");

/* ---------- 5. 10 组预设四值 ---------- */
var expected = {
  "linear": [0, 0, 1, 1], "ease": [0.25, 0.10, 0.25, 1],
  "ease-in": [0.42, 0, 1, 1], "ease-out": [0, 0, 0.58, 1],
  "ease-in-out": [0.42, 0, 0.58, 1], "easeInQuad": [0.11, 0, 0.50, 0],
  "easeOutQuad": [0.50, 1, 0.89, 1], "easeInOutQuad": [0.45, 0, 0.55, 1],
  "easeInCubic": [0.32, 0, 0.67, 0], "easeOutCubic": [0.33, 1, 0.68, 1]
};
eq(M.PRESET_ORDER.length, 10, "预设共 10 组");
M.PRESET_ORDER.forEach(function (name) {
  var p = M.presetValues(name);
  eq(JSON.stringify([p.x1, p.y1, p.x2, p.y2]), JSON.stringify(expected[name]), "预设 " + name + " 四值");
});
eq(M.presetValues("nope"), null, "未知预设返回 null");

/* ---------- 6. 代码生成三段 ---------- */
var d = M.defaultState();
eq(d.x1, 0.25, "默认 x1 为 ease 的 0.25");
eq(d.y2, 1, "默认 y2 为 ease 的 1");
eq(d.duration, 1, "默认时长 1 秒");
var codes = M.buildCodes(d);
eq(codes.bezier, "cubic-bezier(0.25, 0.10, 0.25, 1.00)", "默认 cubic-bezier() 2 位小数");
eq(codes.transition, "transition: all 1.00s cubic-bezier(0.25, 0.10, 0.25, 1.00);", "默认 transition 含时长与曲线");
eq(codes.timingFunction, "transition-timing-function: cubic-bezier(0.25, 0.10, 0.25, 1.00);", "默认 timing-function 行");
ok(codes.cssText.indexOf(".easing-box") === 0, "cssText 以选择器开头");
ok(codes.cssText.indexOf(codes.transition) >= 0, "cssText 含 transition 行");
ok(codes.cssText.indexOf(codes.timingFunction) >= 0, "cssText 含 timing 行");

/* ---------- 7. 时长同步 ---------- */
var c2 = M.buildCodes({ x1: 0, y1: 0, x2: 1, y2: 1, duration: 2.5 });
eq(c2.transition, "transition: all 2.50s cubic-bezier(0.00, 0.00, 1.00, 1.00);", "时长 2.5 同步到 transition");
var c3 = M.buildCodes({ x1: 0.42, y1: 0, x2: 0.58, y2: 1, duration: 0.2 });
ok(c3.transition.indexOf("0.20s") >= 0, "时长 0.2 同步到 transition");
eq(M.fmt2(0.256), "0.26", "fmt2 四舍五入到 2 位");
eq(M.fmt2(-0.001), "0.00", "fmt2 -0 归零不输出 -0.00");

/* ---------- 8. 贝塞尔点与画布映射 ---------- */
var p0 = M.bezierPoint(0, 0.25, 0.1, 0.25, 1);
eq(JSON.stringify([p0.x, p0.y]), JSON.stringify([0, 0]), "贝塞尔 t=0 为起点");
var p1 = M.bezierPoint(1, 0.25, 0.1, 0.25, 1);
eq(JSON.stringify([p1.x, p1.y]), JSON.stringify([1, 1]), "贝塞尔 t=1 为终点");
eq(M.mapY(0), 200, "映射 y=0 → 200（主区间下沿）");
eq(M.mapY(1), 100, "映射 y=1 → 100（主区间上沿）");
eq(M.mapY(-1), 300, "映射 y=-1 → 300（画布底）");
eq(M.mapY(2), 0, "映射 y=2 → 0（画布顶）");
eq(M.buildCurvePath(0.25, 0.1, 0.25, 1), "M 0 200 C 75 190, 75 100, 300 100", "默认曲线 path");

/* ---------- 9. 注册与静态检查 ---------- */
ok(GO_SRC.indexOf('"css_easing_generator"') >= 0, "categories.go 注册 ID");
ok(GO_SRC.indexOf('"/tools/css-easing-generator"') >= 0, "categories.go 注册 Path");
var idx = GO_SRC.indexOf('"css_easing_generator"');
ok(GO_SRC.slice(idx, idx + 800).indexOf('Category:    "开发工具"') >= 0, "注册 Category 为开发工具");
ok(GO_SRC.slice(idx, idx + 800).indexOf("New:         true") >= 0, "注册 New 为 true");
var pathCount = 0;
var m;
var re = /"\/tools\/[^"]+"/g;
var seen = {};
while ((m = re.exec(GO_SRC)) !== null) { if (!seen[m[0]]) { seen[m[0]] = true; pathCount++; } }
eq(pathCount, 188, "注册 Path 总数 187→188");
ok(TPL_SRC.indexOf("只做曲线预览与代码生成、不做整页动效编排") >= 0, "模板含真限制：不做整页动效编排");
ok(TPL_SRC.indexOf("预览动画仅示意") >= 0, "模板含真限制：预览动画仅示意");
ok(TPL_SRC.indexOf("y超出0–1为合法回弹区间") >= 0 || TPL_SRC.indexOf("y 超出 0–1 为合法回弹区间") >= 0, "模板含真限制：y 回弹区间");
ok(TPL_SRC.indexOf("/tools/css-gradient-generator") >= 0, "互链 CSS 渐变生成器");
ok(TPL_SRC.indexOf("/tools/css-shadow-radius-generator") >= 0, "互链 CSS 阴影与圆角生成器");
ok(JS_SRC.indexOf("fetch(") < 0 && JS_SRC.indexOf("XMLHttpRequest") < 0, "JS 零 fetch/XHR");
ok(TPL_SRC.indexOf("http://") < 0 || TPL_SRC.indexOf("https://www.johnkingzcq123.xyz") >= 0, "模板无外部 CDN 链接（仅 canonical/OG 自有域）");
ok(!/src="https?:\/\//.test(TPL_SRC), "模板无外部脚本/样式引用");

console.log("css_easing_generator: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
