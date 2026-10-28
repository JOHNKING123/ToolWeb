/* 截图美化器纯逻辑单元测试（零依赖）：node tests/screenshot_beautifier.test.js
* 覆盖：
* 1. 几何向量（画布尺寸、图位置、圆角钳制、非法值失败）
* 2. 背景向量（solid/gradient/transparent、HEX 归一化、非法判错）
* 3. 文件校验与导出命名（格式接受/拒绝、20MB 上限、-beautified.png）
* 4. 注册与零网络静态检查（205 Path、互链两件近邻、不硬凑未交付工具）
*/
"use strict";
var fs = require("fs");
var M = require("../static/js/screenshot_beautifier.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function has(s, sub, name) { ok(String(s).indexOf(sub) !== -1, name + "（应包含 " + JSON.stringify(sub) + "）"); }
function notHas(s, sub, name) { ok(String(s).indexOf(sub) === -1, name + "（不应包含 " + JSON.stringify(sub) + "）"); }

/* ---------- 1. 几何向量 ---------- */
var l1 = M.computeLayout(800, 600, { padding: 40, radius: 24, shadowBlur: 10, shadowOffsetX: 0, shadowOffsetY: 8 });
eq(l1.ok, true, "800×600 padding 40 成功");
eq(l1.canvasW, 880, "800×600 padding 40 → 画布宽 880");
eq(l1.canvasH, 680, "800×600 padding 40 → 画布高 680");
eq(l1.imgX, 40, "图位于 x=40");
eq(l1.imgY, 40, "图位于 y=40");
eq(l1.radius, 24, "圆角 24 不变");
var l0 = M.computeLayout(800, 600, { padding: 0, radius: 0, shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0 });
eq(l0.canvasW, 800, "padding 0 → 画布宽等于原图");
eq(l0.canvasH, 600, "padding 0 → 画布高等于原图");
eq(l0.imgX, 0, "padding 0 → 图位于 x=0");
var lR = M.computeLayout(800, 600, { padding: 40, radius: 999, shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0 });
eq(lR.radius, 300, "radius 999 在 800×600 上钳制为 300");
var lNegR = M.computeLayout(800, 600, { padding: 10, radius: -5, shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0 });
eq(lNegR.radius, 0, "负圆角钳制为 0");
eq(M.computeLayout(800, 600, { padding: -1, radius: 0, shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0 }).ok, false, "负 padding 返回失败");
eq(M.computeLayout(800, 600, { padding: 40, radius: 0, shadowBlur: -1, shadowOffsetX: 0, shadowOffsetY: 0 }).ok, false, "负 shadowBlur 返回失败");
eq(M.computeLayout(800, 600, { padding: 40, radius: 0, shadowBlur: 0, shadowOffsetX: NaN, shadowOffsetY: 0 }).ok, false, "NaN 偏移返回失败");
eq(M.computeLayout(800, 600, { padding: "40", radius: 0, shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0 }).ok, false, "字符串 padding 返回失败");

/* ---------- 2. 背景向量 ---------- */
var b1 = M.parseBackground("solid", "#ff8800");
eq(b1.ok, true, "solid 合法成功");
eq(b1.color, "#FF8800", "solid 小写归一化大写");
eq(M.parseBackground("solid", "ff8800").color, "#FF8800", "solid 无 # 等价");
eq(M.parseBackground("solid", "#f80").ok, false, "solid 3 位缩写判失败");
eq(M.parseBackground("solid", "#gggggg").ok, false, "solid 非 HEX 判失败");
eq(M.parseBackground("solid", "#12345").ok, false, "solid 长度不对判失败");
var b2 = M.parseBackground("gradient", { color1: "2563eb", color2: "#f59e0b" });
eq(b2.ok, true, "gradient 合法成功");
eq(b2.color1, "#2563EB", "gradient 起色归一化");
eq(b2.color2, "#F59E0B", "gradient 止色归一化");
eq(M.parseBackground("gradient", { color1: "#FF0000", color2: "#FF0000" }).ok, true, "gradient 起止同色合法");
eq(M.parseBackground("gradient", { color1: "#FF0000", color2: "#f00" }).ok, false, "gradient 止色非法判失败");
var b3 = M.parseBackground("transparent", { color: "#FF0000" });
eq(b3.ok, true, "transparent 不依赖颜色值");
eq(b3.mode, "transparent", "transparent 模式名");
eq(M.parseBackground("unknown", {}).ok, false, "未知背景模式判失败");

/* ---------- 3. 文件校验与命名 ---------- */
eq(M.validateImageFile({ type: "image/png", size: 100 }).ok, true, "png 接受");
eq(M.validateImageFile({ type: "image/jpeg", size: 100 }).ok, true, "jpeg 接受");
eq(M.validateImageFile({ type: "image/webp", size: 100 }).ok, true, "webp 接受");
eq(M.validateImageFile({ type: "image/gif", size: 100 }).ok, false, "gif 拒绝");
eq(M.validateImageFile({ type: "image/svg+xml", size: 100 }).ok, false, "svg 拒绝");
eq(M.validateImageFile({ type: "text/plain", size: 100 }).ok, false, "txt 拒绝");
eq(M.validateImageFile({ type: "", name: "a.jpg", size: 100 }).ok, true, "type 为空时 jpg 后缀兜底接受");
eq(M.validateImageFile({ type: "", name: "a.gif", size: 100 }).ok, false, "type 为空时 gif 后缀拒绝");
eq(M.validateImageFile({ type: "image/png", size: 20 * 1024 * 1024 }).ok, true, "恰 20MB 接受");
eq(M.validateImageFile({ type: "image/png", size: 20 * 1024 * 1024 + 1 }).ok, false, "超 20MB 拒绝");
eq(M.suggestExportName("shot.png"), "shot-beautified.png", "shot.png → shot-beautified.png");
eq(M.suggestExportName("my.shot.jpeg"), "my.shot-beautified.png", "多点文件名仅去最后扩展名");
eq(M.suggestExportName("shot"), "shot-beautified.png", "无扩展名直接加后缀");
eq(M.suggestExportName(""), "beautified.png", "空名兜底");

/* ---------- 4. 注册与零网络静态检查 ---------- */
var cats = fs.readFileSync("tools/categories.go", "utf8");
has(cats, '"screenshot_beautifier"', "categories.go 注册 ID");
has(cats, '"/tools/screenshot-beautifier"', "categories.go 注册 Path");
var pathCount = (cats.match(/Path:\s+"\/tools\/[^"]+"/g) || []).length;
eq(pathCount, 205, "注册 Path 总数 204→205");
var html = fs.readFileSync("templates/screenshot_beautifier.html", "utf8");
has(html, "只加画框", "页面可见：只加画框");
has(html, "不改图片内容一像素", "页面可见：不改图片内容一像素");
has(html, "不做标注", "页面可见：不做标注");
has(html, "不处理代码文本", "页面可见：不处理代码文本");
has(html, "只导出 PNG", "页面可见：只导出 PNG");
has(html, "/tools/image-annotator", "互链图片标注");
has(html, "/tools/code-screenshot-beautifier", "互链代码截图美化器");
has(html, "https://www.johnkingzcq123.xyz/tools/screenshot-beautifier", "canonical 正确");
notHas(html, "gzip", "不硬凑未交付 Gzip 解码器");
notHas(html, "电台", "不硬凑未交付在线电台");
var js = fs.readFileSync("static/js/screenshot_beautifier.js", "utf8");
notHas(js, "fetch(", "JS 零 fetch");
notHas(js, "XMLHttpRequest", "JS 零 XHR");
notHas(html, "http://", "HTML 无 http 外链");
notHas(html, "https://cdn", "HTML 零 CDN");

console.log("PASS: " + pass + ", FAIL: " + fail);
process.exit(fail === 0 ? 0 : 1);
