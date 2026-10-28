/* CSS 动画关键帧生成器纯逻辑单元测试（零依赖）：node tests/css_keyframe_generator.test.js
 * 覆盖：停靠点与单帧向量、帧集合向量、组合与预设向量、代码生成向量、
 * 注册与零网络请求静态检查。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/css_keyframe_generator.js");

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
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "css_keyframe_generator.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "css_keyframe_generator.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. parseStop：已知值与非法 ---------- */
eq(M.parseStop("from"), 0, "parseStop from→0");
eq(M.parseStop("to"), 100, "parseStop to→100");
eq(M.parseStop("50%"), 50, "parseStop 50%→50");
eq(M.parseStop("33.50%"), 33.5, "parseStop 33.50%→33.5 去尾零");
eq(M.parseStop("0%"), 0, "parseStop 0%→0");
eq(M.parseStop("100.00%"), 100, "parseStop 100.00%→100");
throws(function () { M.parseStop("50"); }, "stop", "parseStop 裸数字失败");
throws(function () { M.parseStop("-10%"); }, "stop", "parseStop 负值失败");
throws(function () { M.parseStop("101%"); }, "stop", "parseStop >100% 失败");
throws(function () { M.parseStop(""); }, "stop", "parseStop 空串失败");
throws(function () { M.parseStop("10em"); }, "stop", "parseStop em 单位失败");
throws(function () { M.parseStop("33.555%"); }, "stop", "parseStop 3 位小数失败");

/* ---------- 2. validateFrame：已知值与非法 ---------- */
var good = M.validateFrame({ stop: "50%", opacity: 0.5, translateX: -200,
  translateY: 30, scale: 1.2, rotate: 45, backgroundColor: "#ff8800",
  easing: "ease-out" });
eq(good.stop, 50, "validateFrame 停靠点规范化");
eq(good.opacity, 0.5, "validateFrame opacity 通过");
eq(good.backgroundColor, "#ff8800", "validateFrame 颜色通过");
eq(M.validateFrame({ stop: 0 }).opacity, 1, "validateFrame 缺省 opacity 为 1");
eq(M.validateFrame({ stop: 0 }).easing, "", "validateFrame 缺省 easing 为空");
eq(M.validateFrame({ stop: 0, backgroundColor: "#ABC" }).backgroundColor, "#ABC",
  "validateFrame #RGB 通过");
throws(function () { M.validateFrame({ stop: 0, opacity: 1.5 }); }, "opacity", "validateFrame opacity 越界失败");
throws(function () { M.validateFrame({ stop: 0, translateX: 2001 }); }, "translateX", "validateFrame 位移越界失败");
throws(function () { M.validateFrame({ stop: 0, scale: 11 }); }, "scale", "validateFrame 缩放越界失败");
throws(function () { M.validateFrame({ stop: 0, rotate: 721 }); }, "rotate", "validateFrame 旋转越界失败");
throws(function () { M.validateFrame({ stop: 0, backgroundColor: "red" }); }, "backgroundColor", "validateFrame 非十六进制颜色失败");
throws(function () { M.validateFrame({ stop: 0, backgroundColor: "#12345" }); }, "backgroundColor", "validateFrame 5 位颜色失败");
throws(function () { M.validateFrame({ stop: 0, easing: "steps(2)" }); }, "easing", "validateFrame steps() 缓动失败");
throws(function () { M.validateFrame({ stop: 0, easing: "bounce" }); }, "easing", "validateFrame 未知缓动失败");
throws(function () { M.validateFrame({ stop: 0, easing: "cubic-bezier(1.5, 0, 0.5, 1)" }); }, "easing", "validateFrame cubic x1 越界失败");
eq(M.validateFrame({ stop: 0, easing: "cubic-bezier(0.25, 0.1, 0.25, 1)" }).easing,
  "cubic-bezier(0.25, 0.1, 0.25, 1)", "validateFrame cubic-bezier 通过");

/* ---------- 3. 帧集合：排序、增删 ---------- */
var unsorted = [{ stop: 100, opacity: 1 }, { stop: 0, opacity: 0 }, { stop: 50, opacity: 0.5 }];
var sorted = M.sortFrames(unsorted);
eq(sorted.map(function (f) { return f.stop; }).join(","), "0,50,100", "sortFrames 升序");
eq(unsorted[0].stop, 100, "sortFrames 不改原数组");
throws(function () { M.sortFrames([{ stop: 0 }, { stop: 0 }]); }, "frames", "sortFrames 重复停靠点失败");
var ten = [];
for (var i = 0; i < 10; i++) ten.push({ stop: i * 10, opacity: 1 });
ten[9].stop = 100;
throws(function () { M.addFrame(ten, { stop: 55 }); }, "frames", "addFrame 超 10 帧失败");
var added = M.addFrame([{ stop: 0 }, { stop: 100 }], { stop: 50, opacity: 0.5 });
eq(added.map(function (f) { return f.stop; }).join(","), "0,50,100", "addFrame 插入后升序");
throws(function () { M.addFrame([{ stop: 0 }, { stop: 100 }], { stop: 0 }); }, "frames", "addFrame 重复停靠点失败");
throws(function () { M.removeFrame([{ stop: 0 }, { stop: 100 }], 0); }, "frames", "removeFrame 删至低于 2 帧失败");
throws(function () { M.removeFrame([{ stop: 0 }, { stop: 50 }, { stop: 100 }], 25); }, "stop", "removeFrame 不存在停靠点失败");
eq(M.removeFrame([{ stop: 0 }, { stop: 50 }, { stop: 100 }], 50).length, 2, "removeFrame 正常删除");

/* ---------- 4. 组合：声明顺序、transform 合成、默认值省略 ---------- */
var css = M.buildKeyframesCss("fadeIn", [
  { stop: 100, opacity: 1, backgroundColor: "#ff0000", easing: "ease-out" },
  { stop: 0, opacity: 0, translateX: -200, translateY: 10, rotate: 45, scale: 2 }
]);
ok(css.indexOf("@keyframes fadeIn {") === 0, "buildKeyframesCss 块头正确");
ok(css.indexOf("0% { opacity: 0; transform: translate(-200px, 10px) rotate(45deg) scale(2); }") !== -1,
  "buildKeyframesCss transform 按 translate→rotate→scale 合成");
ok(css.indexOf("100% { opacity: 1; background-color: #ff0000; animation-timing-function: ease-out; }") !== -1,
  "buildKeyframesCss 声明顺序 opacity→background-color→easing");
var plain = M.buildKeyframesCss("plain", [{ stop: 0 }, { stop: 100 }]);
ok(plain.indexOf("transform") === -1, "buildKeyframesCss 全默认值时省略 transform");
ok(plain.indexOf("0% { opacity: 1; }") !== -1, "buildKeyframesCss 默认帧只输出 opacity");
throws(function () { M.buildKeyframesCss("fadeIn", [{ stop: 50 }, { stop: 100 }]); }, "frames", "buildKeyframesCss 缺 0% 失败");
throws(function () { M.buildKeyframesCss("fadeIn", [{ stop: 0 }, { stop: 50 }]); }, "frames", "buildKeyframesCss 缺 100% 失败");
throws(function () { M.buildKeyframesCss("1bad", [{ stop: 0 }, { stop: 100 }]); }, "name", "buildKeyframesCss 数字开头动画名失败");
throws(function () { M.buildKeyframesCss("bad name", [{ stop: 0 }, { stop: 100 }]); }, "name", "buildKeyframesCss 含空格动画名失败");

/* ---------- 5. validateAnimation：非法字段 ---------- */
throws(function () { M.validateAnimation({ duration: 0 }); }, "duration", "validateAnimation 时长过小失败");
throws(function () { M.validateAnimation({ duration: 61 }); }, "duration", "validateAnimation 时长过大失败");
throws(function () { M.validateAnimation({ iteration: 0 }); }, "iteration", "validateAnimation 循环 0 失败");
throws(function () { M.validateAnimation({ iteration: 1.5 }); }, "iteration", "validateAnimation 循环非整数失败");
throws(function () { M.validateAnimation({ direction: "up" }); }, "direction", "validateAnimation 方向非法失败");
throws(function () { M.validateAnimation({ fillMode: "all" }); }, "fillMode", "validateAnimation 填充非法失败");
throws(function () { M.validateAnimation({ timingFunction: "steps(3)" }); }, "timingFunction", "validateAnimation steps 缓动失败");
eq(M.validateAnimation({ iteration: "infinite" }).iteration, "infinite", "validateAnimation infinite 通过");

/* ---------- 6. 预设：五组配置与驼峰名 ---------- */
var presets = {
  "fade-in": { name: "fadeIn", n: 2 },
  "slide-in-left": { name: "slideInLeft", n: 2 },
  "bounce": { name: "bounce", n: 3 },
  "rotate": { name: "rotate", n: 2 },
  "pulse": { name: "pulse", n: 3 }
};
Object.keys(presets).forEach(function (k) {
  var p = M.generatePreset(k);
  eq(p.name, presets[k].name, "generatePreset " + k + " 驼峰名");
  eq(p.frames.length, presets[k].n, "generatePreset " + k + " 帧数");
});
eq(M.generatePreset("fade-in").frames[0].opacity, 0, "fade-in 首帧 opacity 0");
eq(M.generatePreset("fade-in").opts.duration, 1, "fade-in 时长 1s");
eq(M.generatePreset("slide-in-left").frames[0].translateX, -200, "slide-in-left 首帧 -200px");
eq(M.generatePreset("slide-in-left").opts.timingFunction, "ease-out", "slide-in-left ease-out");
eq(M.generatePreset("bounce").frames[1].translateY, -60, "bounce 中帧 -60px");
eq(M.generatePreset("bounce").opts.iteration, 2, "bounce 循环 2 次");
eq(M.generatePreset("rotate").frames[1].rotate, 360, "rotate 末帧 360deg");
eq(M.generatePreset("rotate").opts.iteration, "infinite", "rotate 无限循环");
eq(M.generatePreset("rotate").opts.duration, 2, "rotate 时长 2s");
eq(M.generatePreset("pulse").frames[1].scale, 1.2, "pulse 中帧 scale 1.2");
eq(M.generatePreset("pulse").opts.iteration, "infinite", "pulse 无限循环");
throws(function () { M.generatePreset("zoom-in"); }, "preset", "generatePreset 未知预设失败");

/* ---------- 7. 代码生成：完整 CSS 与 HTML 片段 ---------- */
var full = M.buildAnimationCss("fadeIn",
  [{ stop: 0, opacity: 0 }, { stop: 100, opacity: 1 }],
  { duration: 1, delay: 0, iteration: 1, direction: "normal",
    fillMode: "none", timingFunction: "ease" });
ok(full.indexOf("@keyframes fadeIn {") !== -1, "buildAnimationCss 含关键帧块");
ok(full.indexOf(".animated-element {") !== -1, "buildAnimationCss 含 .animated-element 块");
ok(full.indexOf("animation: fadeIn 1s ease 0s 1 normal none;") !== -1,
  "buildAnimationCss 缩写行正确");
var html = M.buildHtmlSnippet("fadeIn",
  [{ stop: 0, opacity: 0 }, { stop: 100, opacity: 1 }],
  { duration: 1, timingFunction: "ease" });
ok(html.indexOf("<style>") !== -1 && html.indexOf("@keyframes fadeIn") !== -1,
  "buildHtmlSnippet 含 <style> 内嵌 CSS");
ok(html.indexOf('<div class="animated-element">fadeIn</div>') !== -1,
  "buildHtmlSnippet 含预览元素且内容为动画名");
ok(html.indexOf("<script") === -1, "buildHtmlSnippet 无 <script>");
throws(function () { M.buildAnimationCss("fadeIn", [{ stop: 0 }], {}); }, "frames",
  "buildAnimationCss 非法帧集失败");
eq(M.suggestExportName("css"), "animation.css", "suggestExportName css");
eq(M.suggestExportName("html"), "animation-demo.html", "suggestExportName html");
throws(function () { M.suggestExportName("js"); }, "kind", "suggestExportName 其它 kind 失败");

/* ---------- 8. 注册与零网络请求静态检查 ---------- */
ok(GO_SRC.indexOf('"css_keyframe_generator"') !== -1, "categories.go 注册 ID");
ok(GO_SRC.indexOf('"/tools/css-keyframe-generator"') !== -1, "categories.go 注册 Path");
var regBlock = GO_SRC.split('"css_keyframe_generator"')[1].split("},")[0];
ok(regBlock.indexOf('Category:    "开发工具"') !== -1, "categories.go 注册 Category 开发工具");
ok(regBlock.indexOf("New:         true") !== -1, "categories.go 注册 New true");
var pathCount = {};
GO_SRC.replace(/"(\/tools\/[^"]+)"/g, function (_, p) { pathCount[p] = 1; return p; });
eq(Object.keys(pathCount).length, 213, "注册总数 212→213 Path");
ok(JS_SRC.indexOf("fetch(") === -1 && JS_SRC.indexOf("XMLHttpRequest") === -1,
  "JS 零 fetch/XHR");
ok(TPL_SRC.indexOf('src="http') === -1 && TPL_SRC.indexOf("cdn.") === -1,
  "模板零 CDN 外链");
ok(TPL_SRC.indexOf("/tools/css-easing-generator") !== -1, "模板互链 CSS 缓动生成器");
ok(TPL_SRC.indexOf("/tools/css-gradient-generator") !== -1, "模板互链 CSS 渐变生成器");
ok(TPL_SRC.indexOf("/tools/css-shadow-radius-generator") !== -1, "模板互链 CSS 阴影与圆角生成器");
ok(TPL_SRC.indexOf("text-shadow") === -1 || TPL_SRC.indexOf("/tools/css-text-shadow") === -1,
  "模板不硬凑未交付的文字阴影生成器");
ok(TPL_SRC.indexOf("只做单元素单动画") !== -1, "模板真限制：单元素单动画");
ok(TPL_SRC.indexOf("不做 JS 驱动动画") !== -1 || TPL_SRC.indexOf("不做 JS 驱动") !== -1, "模板真限制：无 JS 动画");
ok(TPL_SRC.indexOf("steps()") !== -1, "模板真限制：缓动范围含 steps() 说明");
ok(TPL_SRC.indexOf("不收集") !== -1 && TPL_SRC.indexOf("不上传") !== -1, "模板真限制：不收集不上传");

console.log("PASS: " + pass + "  FAIL: " + fail);
process.exit(fail ? 1 : 0);
