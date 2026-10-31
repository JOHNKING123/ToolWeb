/* CSS 阴影与圆角生成器纯逻辑单元测试（零依赖）：node tests/css_shadow_radius_generator.test.js
 * 覆盖：rgba 合成、box-shadow 拼接、inset 位置、负偏移、零值完整四值、
 * border-radius 单值/四值/斜杠、联动/独立模式、预设静态检查、注册与零网络请求。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/css_shadow_radius_generator.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "css_shadow_radius_generator.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "css_shadow_radius_generator.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. rgba 合成 ---------- */
eq(M.fmtAlpha(15), "0.15", "透明度 15% → 0.15");
eq(M.fmtAlpha(100), "1", "透明度 100% → 1（不写 1.00）");
eq(M.fmtAlpha(0), "0", "透明度 0% → 0");
eq(M.fmtAlpha(50), "0.5", "透明度 50% → 0.5（去尾零）");
eq(M.fmtAlpha(33), "0.33", "透明度 33% → 0.33（两位内）");
eq(JSON.stringify(M.hexToRgb("#1e293b")), JSON.stringify({ r: 30, g: 41, b: 59 }), "hex #1e293b 解析");
ok(M.hexToRgb("red") === null, "非法颜色返回 null");
ok(M.hexToRgb("#fff") === null, "三位 hex 不接受（仅 #RRGGBB）");

/* ---------- 2. box-shadow 拼接 ---------- */
var base = { offsetX: 0, offsetY: 8, blur: 24, spread: 0, color: "#000000", opacity: 15, inset: false };
eq(M.buildBoxShadow(base), "0px 8px 24px 0px rgba(0, 0, 0, 0.15)", "默认阴影：完整四值");
eq(M.buildBoxShadow(Object.assign({}, base, { inset: true })),
  "inset 0px 8px 24px 0px rgba(0, 0, 0, 0.15)", "inset 在最前");
eq(M.buildBoxShadow(Object.assign({}, base, { offsetX: -20, offsetY: -10 })),
  "-20px -10px 24px 0px rgba(0, 0, 0, 0.15)", "负偏移正确输出");
eq(M.buildBoxShadow({ offsetX: 0, offsetY: 0, blur: 0, spread: 0, color: "#ffffff", opacity: 100, inset: false }),
  "0px 0px 0px 0px rgba(255, 255, 255, 1)", "全零仍完整四值、不省略");
eq(M.buildBoxShadow(Object.assign({}, base, { spread: -50 })),
  "0px 8px 24px -50px rgba(0, 0, 0, 0.15)", "负扩散正确输出");
eq(M.buildBoxShadow(Object.assign({}, base, { color: "#1e293b", opacity: 20 })),
  "0px 8px 24px 0px rgba(30, 41, 59, 0.2)", "彩色阴影 rgba 合成");
eq(M.buildBoxShadow(Object.assign({}, base, { color: "bad" })),
  "0px 8px 24px 0px rgba(0, 0, 0, 0.15)", "非法颜色回退纯黑");

/* ---------- 3. border-radius：联动/单值 ---------- */
var linked = { linked: true, tl: 12, tr: 12, br: 12, bl: 12, ellipse: false, vtl: 12, vtr: 12, vbr: 12, vbl: 12 };
eq(M.buildBorderRadius(linked), "12px", "联动 12px 出单值");
eq(M.buildBorderRadius(Object.assign({}, linked, { tl: 0 })), "0px", "联动 0px 出单值");
eq(M.buildBorderRadius({ linked: false, tl: 8, tr: 8, br: 8, bl: 8, ellipse: false, vtl: 8, vtr: 8, vbr: 8, vbl: 8 }),
  "8px", "独立但四角相等仍出单值");

/* ---------- 4. border-radius：独立四值（顺时针） ---------- */
eq(M.buildBorderRadius({ linked: false, tl: 48, tr: 16, br: 32, bl: 8, ellipse: false, vtl: 0, vtr: 0, vbr: 0, vbl: 0 }),
  "48px 16px 32px 8px", "独立四角不等：左上→右上→右下→左下顺时针");
eq(M.cornersToString([10, 20, 30, 40]), "10px 20px 30px 40px", "cornersToString 四值顺序");

/* ---------- 5. border-radius：椭圆斜杠 ---------- */
eq(M.buildBorderRadius({ linked: false, tl: 48, tr: 16, br: 32, bl: 8, ellipse: true, vtl: 16, vtr: 32, vbr: 8, vbl: 24 }),
  "48px 16px 32px 8px / 16px 32px 8px 24px", "椭圆水平≠垂直出斜杠");
eq(M.buildBorderRadius({ linked: false, tl: 48, tr: 16, br: 32, bl: 8, ellipse: true, vtl: 48, vtr: 16, vbr: 32, vbl: 8 }),
  "48px 16px 32px 8px", "椭圆水平＝垂直不写斜杠");
eq(M.buildBorderRadius({ linked: true, tl: 16, tr: 16, br: 16, bl: 16, ellipse: true, vtl: 16, vtr: 16, vbr: 16, vbl: 16 }),
  "16px", "联动＋椭圆且相等出单值无斜杠");
eq(M.buildBorderRadius({ linked: true, tl: 16, tr: 16, br: 16, bl: 16, ellipse: true, vtl: 8, vtr: 8, vbr: 8, vbl: 8 }),
  "16px / 8px", "联动＋椭圆水平≠垂直出斜杠单值对");
eq(M.buildBorderRadius({ linked: false, tl: 48, tr: 16, br: 32, bl: 8, ellipse: false, vtl: 99, vtr: 99, vbr: 99, vbl: 99 }),
  "48px 16px 32px 8px", "非椭圆模式忽略垂直半径");

/* ---------- 6. 合并输出 ---------- */
var out = M.buildCss({ shadow: base, radius: linked });
eq(out.boxShadow, "0px 8px 24px 0px rgba(0, 0, 0, 0.15)", "buildCss.boxShadow");
eq(out.borderRadius, "12px", "buildCss.borderRadius");
ok(out.cssText.indexOf("box-shadow: 0px 8px 24px 0px rgba(0, 0, 0, 0.15);") >= 0, "cssText 含 box-shadow 行");
ok(out.cssText.indexOf("border-radius: 12px;") >= 0, "cssText 含 border-radius 行");
ok(out.cssText.indexOf(".shadow-radius-box") === 0, "cssText 以选择器开头");

/* ---------- 7. 默认与预设静态检查 ---------- */
var d = M.defaultState();
eq(M.buildCss(d).boxShadow, "0px 8px 24px 0px rgba(0, 0, 0, 0.15)", "默认状态阴影");
eq(M.buildCss(d).borderRadius, "12px", "默认状态圆角");
eq(M.PRESETS.length, 4, "预设共 4 组");
eq(M.PRESETS[0].name, "柔和卡片", "预设 1 柔和卡片");
eq(M.PRESETS[1].name, "悬浮抬升", "预设 2 悬浮抬升");
eq(M.PRESETS[2].name, "内阴影凹陷", "预设 3 内阴影凹陷");
eq(M.PRESETS[3].name, "不等圆角椭圆", "预设 4 不等圆角椭圆");
ok(M.PRESETS[2].shadow.inset === true, "预设 3 为 inset 内阴影");
M.PRESETS.forEach(function (p, i) {
  var o = M.buildCss(p);
  ok(o.boxShadow.length > 0 && o.borderRadius.length > 0, "预设 " + (i + 1) + " 阴影与圆角均有内容");
});
ok(M.buildCss(M.PRESETS[3]).borderRadius.indexOf(" / ") >= 0, "预设 4 含斜杠椭圆语法");

/* ---------- 8. 注册、模板与零网络 ---------- */
ok(GO_SRC.indexOf('"css_shadow_radius_generator"') >= 0, "categories.go 注册 ID");
ok(GO_SRC.indexOf('"/tools/css-shadow-radius-generator"') >= 0, "categories.go 注册 Path");
ok(GO_SRC.indexOf('Category:    "开发工具"') >= 0, "开发工具品类存在");
var paths = GO_SRC.match(/"\/tools\/[^"]+"/g) || [];
var uniq = {};
paths.forEach(function (p) { uniq[p] = true; });
eq(Object.keys(uniq).length, 246, "注册 Path 总数→246（历史遗留陈旧断言同步）");
ok(TPL_SRC.indexOf('css-shadow-radius-generator') >= 0, "模板 canonical 含新 Path");
ok(TPL_SRC.indexOf("请按需改写") >= 0, "模板含请按需改写提示");
ok(TPL_SRC.indexOf("预览以当前浏览器渲染为准") >= 0, "真限制：预览以当前浏览器渲染为准");
ok(TPL_SRC.indexOf("仅生成静态 CSS，不做动画") >= 0, "真限制：仅静态 CSS");
ok(TPL_SRC.indexOf("颜色只出 rgba()") >= 0, "真限制：颜色只出 rgba()");
ok(TPL_SRC.indexOf("不做浏览器前缀补全") >= 0, "真限制：不做前缀补全");
ok(TPL_SRC.indexOf("文本不出浏览器") >= 0, "真限制：文本不出浏览器");
ok(TPL_SRC.indexOf("/tools/css-gradient-generator") >= 0, "互链：CSS 渐变生成器");
ok(TPL_SRC.indexOf("/tools/css-to-tailwind") >= 0, "互链：CSS→Tailwind");
ok(TPL_SRC.indexOf("/tools/color-palette-generator") >= 0, "互链：配色方案生成器");
ok(TPL_SRC.indexOf("shadow-radius.css") >= 0, "模板含下载文件名 shadow-radius.css");
ok(JS_SRC.indexOf("fetch(") < 0 && JS_SRC.indexOf("XMLHttpRequest") < 0, "JS 零 fetch/XHR");
ok(TPL_SRC.indexOf("http://") < 0 || TPL_SRC.indexOf("http://www.w3.org") < 0, "模板无外部 http 资源引用");

console.log("PASS " + pass + " / FAIL " + fail);
if (fail > 0) process.exit(1);
