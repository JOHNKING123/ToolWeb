/* 复古文字特效生成器纯逻辑单元测试（零依赖）：node tests/retro_text_fx.test.js
 * 覆盖：预设列表与取预设向量、字号自适应向量、文件名清洗向量、
 * 颜色插值向量、绘制计划向量、注册与零网络请求静态检查。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/retro_text_fx.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function throws(fn, field, name) {
  try { fn(); ok(false, name + "（应抛错却未抛）"); }
  catch (e) { ok(!field || e.field === field, name + "（err.field 期望 " + field + "，实得 " + e.field + "）"); }
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "retro_text_fx.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "retro_text_fx.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

function passTypes(plan) {
  return plan.passes.map(function (p) { return p.type; }).join(",");
}

/* ---------- 1. presetList：8 预设与展示顺序 ---------- */
var list = M.presetList();
eq(list.length, 8, "presetList 8 个预设");
var names = list.map(function (p) { return p.name; });
ok(names.indexOf("rainbow") !== -1, "presetList 含 rainbow");
ok(names.indexOf("neon") !== -1, "presetList 含 neon");
ok(names.indexOf("outline") !== -1, "presetList 含 outline");
eq(new Set(names).size, 8, "presetList name 唯一");
ok(list.every(function (p) { return typeof p.label === "string" && p.label.length > 0; }),
  "presetList 每个预设 label 非空");
ok(list.every(function (p) { return typeof p.description === "string" && p.description.length > 0; }),
  "presetList 每个预设 description 非空");
eq(M.PRESET_ORDER.length, 8, "PRESET_ORDER 8 个");
eq(M.PRESET_ORDER[0], "rainbow", "PRESET_ORDER 首个为 rainbow");
ok(M.PRESET_ORDER.indexOf("misprint") !== -1, "PRESET_ORDER 含 misprint");

/* ---------- 2. getPreset：精确值与深拷贝 ---------- */
var rainbow = M.getPreset("rainbow");
eq(rainbow.fill.kind, "gradient", "rainbow 填充为渐变");
eq(rainbow.fill.stops.length, 6, "rainbow 渐变 6 色标");
eq(rainbow.fill.stops.map(function (s) { return s.offset; }).join(","),
  "0,0.2,0.4,0.6,0.8,1", "rainbow 色标位置精确值");
eq(rainbow.fill.stops.map(function (s) { return s.color; }).join(","),
  "#ff2d55,#ff9500,#ffcc00,#34c759,#0a84ff,#bf5af2", "rainbow 色标颜色精确值");
eq(rainbow.stroke.width, 4, "rainbow 描边宽度 4");
eq(rainbow.stroke.color, "#1c1c1e", "rainbow 描边颜色");
var neon = M.getPreset("neon");
eq(neon.glow.strength, 80, "neon 辉光强度 80");
eq(neon.glow.color, "#ff2bd1", "neon 辉光颜色");
eq(neon.glow.blur, 30, "neon 辉光模糊 30");
var chrome = M.getPreset("chrome");
eq(chrome.fill.stops.length, 6, "chrome 渐变 6 色标");
eq(chrome.fill.angle, 90, "chrome 渐变角度 90");
var d3 = M.getPreset("3d");
eq(d3.shadow.kind, "extrude", "3d 阴影为挤出");
eq(d3.shadow.from, "#b25f00", "3d 挤出起始色");
eq(d3.shadow.to, "#5c2d00", "3d 挤出结束色");
var mutated = M.getPreset("rainbow");
mutated.fill.stops[0].color = "#000000";
eq(M.getPreset("rainbow").fill.stops[0].color, "#ff2d55", "getPreset 返回深拷贝不影响内置定义");
throws(function () { M.getPreset("nope"); }, "name", "getPreset 未知预设抛错");
throws(function () { M.getPreset(123); }, "name", "getPreset 非字符串 name 抛错");

/* ---------- 3. fitFontSize：自适应向量 ---------- */
eq(M.fitFontSize("ab", 300, 100, function (s) { return s * 0.5; }), 100,
  "fitFontSize 短文本不超基线");
eq(M.fitFontSize(new Array(101).join("x"), 300, 100, function (s) { return s * 4; }), 75,
  "fitFontSize 长文本缩小到刚好 fit（75px）");
eq(M.fitFontSize("ab", 300, 100, function (s) { return s * 3; }), 100,
  "fitFontSize 边界恰好 fit 返回基线");
eq(M.fitFontSize("ab", 300, 100, function () { return 100000; }), 1,
  "fitFontSize 极端超宽最小缩到 1px");
eq(M.fitFontSize("ab", 300, 100.9, function (s) { return s * 0.5; }), 100,
  "fitFontSize 基线向下取整");
throws(function () { M.fitFontSize("", 300, 100, function (s) { return s; }); }, "text", "fitFontSize 空文本失败");
throws(function () { M.fitFontSize("ab", 0, 100, function (s) { return s; }); }, "maxWidth", "fitFontSize maxWidth 为 0 失败");
throws(function () { M.fitFontSize("ab", -5, 100, function (s) { return s; }); }, "maxWidth", "fitFontSize maxWidth 负值失败");
throws(function () { M.fitFontSize("ab", 300, 0, function (s) { return s; }); }, "baseSize", "fitFontSize baseSize 为 0 失败");
throws(function () { M.fitFontSize("ab", 300, 100, null); }, "measureWidth", "fitFontSize 无测量函数失败");

/* ---------- 4. sanitizeFileName：清洗与回退 ---------- */
eq(M.sanitizeFileName("Hello: 世界?"), "Hello-世界", "sanitizeFileName 冒号问号清理、空格折横线");
eq(M.sanitizeFileName("a/b\\c*d?e\"f<g>h|i"), "abcdefghi", "sanitizeFileName 非法字符全清");
eq(M.sanitizeFileName("   "), "retro-text", "sanitizeFileName 纯空白回退");
eq(M.sanitizeFileName(""), "retro-text", "sanitizeFileName 空串回退");
eq(M.sanitizeFileName("  复古 文字  "), "复古-文字", "sanitizeFileName 首尾空白清、中间折横线");
eq(M.sanitizeFileName(null), "retro-text", "sanitizeFileName null 回退");
eq(M.sanitizeFileName(new Array(101).join("a")).length, 60, "sanitizeFileName 超长截 60");
eq(M.sanitizeFileName("...dots..."), "dots", "sanitizeFileName 首尾点清掉");
eq(M.sanitizeFileName("RETRO 90s"), "RETRO-90s", "sanitizeFileName 大小写保留");

/* ---------- 5. lerpColor：精确插值 ---------- */
eq(M.lerpColor("#000000", "#ffffff", 0.5), "#808080", "lerpColor 中点插值");
eq(M.lerpColor("#ff0000", "#0000ff", 0), "#ff0000", "lerpColor t=0 取首色");
eq(M.lerpColor("#ff0000", "#0000ff", 1), "#0000ff", "lerpColor t=1 取尾色");
throws(function () { M.lerpColor("#000000", "#ffffff", 1.5); }, "t", "lerpColor 系数越界失败");

/* ---------- 6. buildDrawPlan：绘制计划向量 ---------- */
var pRainbow = M.buildDrawPlan("Hi", "rainbow", {});
eq(passTypes(pRainbow), "shadow,fill,stroke", "rainbow 默认 pass 顺序：阴影→填充→描边");
eq(pRainbow.passes[0].dx, 4.24, "rainbow 阴影 dx=6·cos45° 精确值");
eq(pRainbow.passes[0].dy, 4.24, "rainbow 阴影 dy=6·sin45° 精确值");
eq(pRainbow.passes[1].style.kind, "gradient", "rainbow 填充为渐变");
eq(pRainbow.passes[1].style.angle, 0, "rainbow 渐变默认角度 0");
eq(pRainbow.passes[2].width, 4, "rainbow 描边宽度 4");
var pAngle = M.buildDrawPlan("Hi", "rainbow", { gradientAngle: 45 });
eq(pAngle.passes[1].style.angle, 45, "buildDrawPlan 渐变方向覆盖生效");
var pLong = M.buildDrawPlan("Hi", "longshadow", {});
eq(pLong.passes[0].type, "longshadow", "longshadow 首 pass 为长阴影");
eq(pLong.passes[0].count, 40, "longshadow 默认 40 层");
var pLong20 = M.buildDrawPlan("Hi", "longshadow", { shadowDistance: 20 });
eq(pLong20.passes[0].count, 20, "buildDrawPlan 阴影距离覆盖长阴影层数");
var pNeon = M.buildDrawPlan("Hi", "neon", {});
var glowPass = pNeon.passes.filter(function (p) { return p.type === "glow"; })[0];
eq(glowPass.blur, 24, "neon 辉光 blur=30·80/100 精确值");
eq(glowPass.color, "#ff2bd1", "neon 辉光颜色");
var pMis = M.buildDrawPlan("Hi", "misprint", {});
eq(pMis.passes.filter(function (p) { return p.type === "layer"; }).length, 2,
  "misprint 两层叠印");
eq(pMis.passes[0].dx, -6, "misprint 首层 dx=-6");
eq(pMis.passes[1].dx, 6, "misprint 次层 dx=6");
ok(!pMis.passes.some(function (p) { return p.type === "fill"; }), "misprint 无主填充 pass");
var pVintage = M.buildDrawPlan("Hi", "vintage", {});
var overlayPass = pVintage.passes.filter(function (p) { return p.type === "overlay"; })[0];
eq(overlayPass.color, "#f4ead5", "vintage 罩染颜色");
eq(overlayPass.alpha, 0.35, "vintage 罩染不透明度");
var p3d = M.buildDrawPlan("Hi", "3d", {});
eq(p3d.passes[0].type, "extrude", "3d 首 pass 为挤出");
eq(p3d.passes[0].count, 12, "3d 默认挤出 12 层");
eq(p3d.passes[0].from + "/" + p3d.passes[0].to, "#b25f00/#5c2d00", "3d 挤出起止色精确值");
var pOutline0 = M.buildDrawPlan("Hi", "outline", { strokeWidth: 0 });
eq(passTypes(pOutline0), "fill", "buildDrawPlan 描边宽度 0 时去掉描边 pass");
throws(function () { M.buildDrawPlan("", "rainbow", {}); }, "text", "buildDrawPlan 空文本失败");
throws(function () { M.buildDrawPlan("Hi", "nope", {}); }, "name", "buildDrawPlan 未知预设失败");
throws(function () { M.buildDrawPlan("Hi", "rainbow", { fontSize: 10 }); }, "fontSize", "buildDrawPlan 字号过小失败");
throws(function () { M.buildDrawPlan("Hi", "rainbow", { gradientAngle: 400 }); }, "gradientAngle", "buildDrawPlan 渐变方向越界失败");

/* ---------- 7. 注册与零网络请求静态检查 ---------- */
ok(GO_SRC.indexOf('"retro_text_fx"') !== -1, "categories.go 注册 ID");
ok(GO_SRC.indexOf('"/tools/retro-text-fx"') !== -1, "categories.go 注册 Path");
var regBlock = GO_SRC.split('"retro_text_fx"')[1].split("},")[0];
ok(regBlock.indexOf('Category:    "图片处理"') !== -1, "categories.go 注册 Category 图片处理");
ok(regBlock.indexOf("New:         true") !== -1, "categories.go 注册 New true");
ok(regBlock.indexOf('Icon:        "auto_fix"') !== -1, "categories.go 注册 Icon auto_fix");
var iconHits = (GO_SRC.match(/Icon:\s+"auto_fix"/g) || []).length;
eq(iconHits, 1, "Icon auto_fix 精确值复测锁定：全库唯一 1 处");
var pathCount = {};
GO_SRC.replace(/"(\/tools\/[^"]+)"/g, function (_, p) { pathCount[p] = 1; return p; });
eq(Object.keys(pathCount).length, 299, "注册总数 291→295 Path");
ok(JS_SRC.indexOf("fetch(") === -1 && JS_SRC.indexOf("XMLHttpRequest") === -1,
  "JS 零 fetch/XHR");
ok(TPL_SRC.indexOf('src="http') === -1 && TPL_SRC.indexOf("cdn.") === -1,
  "模板零 CDN 外链");
ok(TPL_SRC.indexOf("/tools/static/js/retro_text_fx.js") !== -1, "模板引入 retro_text_fx.js");
ok(TPL_SRC.indexOf("canvas渲染浏览器差异") !== -1, "模板真限制：canvas渲染浏览器差异");
ok(TPL_SRC.indexOf("中文字体依赖系统") !== -1, "模板真限制：中文字体依赖系统");
ok(TPL_SRC.indexOf("PNG本地生成不上传") !== -1, "模板真限制：PNG本地生成不上传");
ok(TPL_SRC.indexOf("/tools/css-text-shadow-generator") !== -1, "模板互链 CSS 文字阴影生成器");
ok(TPL_SRC.indexOf("/tools/css-gradient-generator") !== -1, "模板互链 CSS 渐变生成器");
ok(TPL_SRC.indexOf("/tools/avatar-generator") !== -1, "模板互链头像生成器");

console.log("PASS: " + pass + "  FAIL: " + fail);
process.exit(fail ? 1 : 0);
