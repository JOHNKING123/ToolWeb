/* 色盲模拟检查器纯逻辑单元测试（零依赖）：node tests/colorblind_simulator.test.js
* 覆盖：
* 1. Machado 2009 模拟矩阵向量（三原色 × 三类型、黑白不变）
* 2. HEX 解析（带/不带 # 等价、缩写与非法格式判错）
* 3. 配色解析（去重保序、超 12 个截断提示、无效 token 逐项列出）
* 4. WCAG 相对亮度与对比度向量（黑白 21.00、红白 4.00 与模拟后 3.46/2.35/4.40）
* 5. AA 判定（正常字 4.5 / 大号字 3.0）与跌落判定（原色通过、模拟不通过才标红）
* 6. 混淆对判定（模拟 HEX 完全相等才警告、其余类型不误报）
* 7. 对比度摘要文本与注册、零网络请求静态检查
*/
"use strict";
var fs = require("fs");
var M = require("../static/js/colorblind_simulator.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function has(s, sub, name) { ok(String(s).indexOf(sub) !== -1, name + "（应包含 " + JSON.stringify(sub) + "）"); }
function notHas(s, sub, name) { ok(String(s).indexOf(sub) === -1, name + "（不应包含 " + JSON.stringify(sub) + "）"); }

/* ---------- 1. 模拟矩阵向量 ---------- */
eq(M.simulateColor("#FF0000", "protanopia"), "#918E00", "纯红→红色盲");
eq(M.simulateColor("#FF0000", "deuteranopia"), "#9FB300", "纯红→绿色盲");
eq(M.simulateColor("#FF0000", "tritanopia"), "#F20000", "纯红→蓝色盲");
eq(M.simulateColor("#00FF00", "protanopia"), "#6E713E", "纯绿→红色盲");
eq(M.simulateColor("#00FF00", "deuteranopia"), "#604D4D", "纯绿→绿色盲");
eq(M.simulateColor("#00FF00", "tritanopia"), "#0D6E79", "纯绿→蓝色盲");
eq(M.simulateColor("#0000FF", "protanopia"), "#0000C1", "纯蓝→红色盲");
eq(M.simulateColor("#0000FF", "deuteranopia"), "#0000B3", "纯蓝→绿色盲");
eq(M.simulateColor("#0000FF", "tritanopia"), "#009186", "纯蓝→蓝色盲");
eq(M.simulateColor("#FFFFFF", "protanopia"), "#FFFFFF", "纯白红色盲不变");
eq(M.simulateColor("#FFFFFF", "deuteranopia"), "#FFFFFF", "纯白绿色盲不变");
eq(M.simulateColor("#FFFFFF", "tritanopia"), "#FFFFFF", "纯白蓝色盲不变");
eq(M.simulateColor("#000000", "protanopia"), "#000000", "纯黑红色盲不变");
eq(M.simulateColor("#000000", "deuteranopia"), "#000000", "纯黑绿色盲不变");
eq(M.simulateColor("#000000", "tritanopia"), "#000000", "纯黑蓝色盲不变");
eq(M.simulateColor("#FF0000", "unknown"), null, "未知类型返回 null");
eq(M.simulateColor("#f00", "protanopia"), null, "缩写输入模拟返回 null");

/* ---------- 2. HEX 解析 ---------- */
eq(JSON.stringify(M.parseHex("#ff0000")), JSON.stringify(M.parseHex("FF0000")), "#ff0000 与 FF0000 等价");
eq(M.rgbToHex(M.parseHex("#ff0000")), "#FF0000", "解析后归一化大写 HEX");
eq(M.parseHex("#f00"), null, "#f00 缩写判无效");
eq(M.parseHex("#gggggg"), null, "非 HEX 字符判无效");
eq(M.parseHex("#12345"), null, "长度不对判无效");
eq(M.parseHex(""), null, "空串判无效");
eq(M.toHex(255, 0, 0), "#FF0000", "toHex 输出大写 #RRGGBB");

/* ---------- 3. 配色解析 ---------- */
var p1 = M.parsePalette("#FF0000, ff0000  #00FF00;#0000FF #00ff00");
eq(p1.colors.join(","), "#FF0000,#00FF00,#0000FF", "配色去重保序（大小写/# 归一）");
eq(p1.invalid.length, 0, "全有效 token 无无效项");
eq(p1.truncated, false, "未超 12 个不截断");
var many = [];
for (var i = 0; i < 14; i++) many.push(M.toHex(i * 16, i * 16, i * 16));
var p2 = M.parsePalette(many.join(","));
eq(p2.colors.length, 12, "超 12 个仅取前 12 个");
eq(p2.truncated, true, "超 12 个截断提示为真");
var p3 = M.parsePalette("#FF0000, #f00, hello, #00FF00, 12345");
eq(p3.colors.join(","), "#FF0000,#00FF00", "无效 token 跳过后有效项保留");
eq(p3.invalid.join(","), "#f00,hello,12345", "无效 token 逐项列出不静默丢弃");

/* ---------- 4. WCAG 对比度向量 ---------- */
eq(M.contrastRatio(M.parseHex("#000000"), M.parseHex("#FFFFFF")), 21, "黑白对比度 21.00");
var redWhite = M.simulateContrastPair("#FF0000", "#FFFFFF");
eq(redWhite.original.ratio, 4, "红字白底原色对比度 4.00");
eq(redWhite.types.protanopia.ratio, 3.46, "红字白底红色盲模拟后 3.46");
eq(redWhite.types.deuteranopia.ratio, 2.35, "红字白底绿色盲模拟后 2.35");
eq(redWhite.types.tritanopia.ratio, 4.4, "红字白底蓝色盲模拟后 4.40");
eq(redWhite.original.aaNormal, false, "红白原色正常字 AA 不通过（4.00 < 4.5）");
eq(redWhite.original.aaLarge, true, "红白原色大号字 AA 通过（4.00 ≥ 3.0）");
eq(redWhite.types.tritanopia.aaLarge, true, "红白蓝色盲模拟大号字 AA 通过");
var bw = M.simulateContrastPair("#000000", "#FFFFFF");
eq(bw.original.ratio, 21, "黑白原色对比度 21.00");
eq(bw.types.protanopia.ratio, 21, "黑白红色盲模拟后不变");
eq(bw.types.deuteranopia.ratio, 21, "黑白绿色盲模拟后不变");
eq(bw.types.tritanopia.ratio, 21, "黑白蓝色盲模拟后不变");
eq(bw.fallen.length, 0, "黑白无跌落");

/* ---------- 5. 跌落判定 ---------- */
eq(redWhite.fallen.length, 0, "红白原色本身未通过正常字 AA，不谎称模拟后跌落");
var fall = M.simulateContrastPair("#7D7378", "#FFFFFF");
eq(fall.original.aaNormal, true, "跌落用例原色正常字 AA 通过（4.57）");
eq(fall.types.protanopia.aaNormal, false, "跌落用例红色盲模拟后不通过（4.36）");
ok(fall.fallen.indexOf("protanopia") !== -1, "跌落用例 fallen 含红色盲");
eq(M.simulateContrastPair("#f00", "#FFFFFF"), null, "非法前景对比度返回 null");

/* ---------- 6. 混淆对判定 ---------- */
var conf = M.findConfusablePairs(["#C80002", "#C80003"], "protanopia");
eq(conf.length, 1, "红色盲下 #C80002/#C80003 完全相同记一对");
eq(conf[0].simulated, "#717002", "混淆对模拟值 #717002");
eq(M.findConfusablePairs(["#C80002", "#C80003"], "deuteranopia").length, 0, "绿色盲下该对不误报");
eq(M.findConfusablePairs(["#C80002", "#C80003"], "tritanopia").length, 0, "蓝色盲下该对不误报");
eq(M.findConfusablePairs(["#FF0000", "#00FF00"], "protanopia").length, 0, "模拟值不相等不警告");

/* ---------- 7. 摘要文本与注册、零网络静态检查 ---------- */
var summary = M.buildContrastSummary(redWhite);
has(summary, "原色：#FF0000 / #FFFFFF，对比度 4.00", "摘要含原色行");
has(summary, "红色盲（Protanopia）：#918E00 / #FFFFFF，对比度 3.46", "摘要含红色盲行");
has(summary, "绿色盲（Deuteranopia）：#9FB300 / #FFFFFF，对比度 2.35", "摘要含绿色盲行");
has(summary, "蓝色盲（Tritanopia）：#F20000 / #FFFFFF，对比度 4.40", "摘要含蓝色盲行");
notHas(summary, "跌落提示", "红白摘要无跌落提示");

var cats = fs.readFileSync("tools/categories.go", "utf8");
has(cats, '"colorblind_simulator"', "categories.go 注册 ID");
has(cats, '"/tools/colorblind-simulator"', "categories.go 注册 Path");
has(cats, 'Category:    "开发工具"', "注册 Category 开发工具");
var pathCount = (cats.match(/Path:\s+"\/tools\/[^"]+"/g) || []).length;
eq(pathCount, 203, "注册 Path 总数 202→203");

var html = fs.readFileSync("templates/colorblind_simulator.html", "utf8");
has(html, "只做模拟示意、不做医学诊断", "页面可见：不做医学诊断");
has(html, "不是无障碍合规认证", "页面可见：不是合规认证");
has(html, "只覆盖三种常见类型", "页面可见：只覆盖三种类型");
has(html, "sRGB 简化模拟", "页面可见：sRGB 简化模拟");
has(html, "/tools/color-palette-generator", "互链配色方案生成器");
has(html, "/tools/wcag-contrast-checker", "互链 WCAG 对比度检查器");
has(html, "/tools/accessibility-scanner", "互链网站无障碍检查器");
notHas(html, "mp3", "不硬凑未交付 MP3 标签编辑器");
notHas(html, "截图美化器（通用）", "不硬凑未交付截图美化器（通用）");
var js = fs.readFileSync("static/js/colorblind_simulator.js", "utf8");
notHas(js, "fetch(", "JS 零 fetch");
notHas(js, "XMLHttpRequest", "JS 零 XHR");
notHas(html, "http://", "HTML 无 http 外链");
notHas(html, "https://cdn", "HTML 零 CDN");

console.log("PASS: " + pass + ", FAIL: " + fail);
process.exit(fail === 0 ? 0 : 1);
