/* 截图 3D 样机渲染器纯逻辑单元测试（零依赖）：node tests/screenshot_mockup_3d.test.js
 * 覆盖：
 * 1. mockupScenes()：4 项固定顺序 browser-frame → phone-frame → float-3d → flat-shadow
 * 2. buildTransform()：逐字命中 'perspective(900px) rotateX(-12deg) rotateY(24deg) scale(0.9)'
 * 3. buildCanvasDrawPlan()：phone-frame 下 imgRect 宽高比与输入一致（误差<1%）；超大图降采样
 * 4. 非法向量：rotateX=99 → Error(err.field='param')；未知 scene → Error(err.field='scene')；imgW=0 → Error(err.field='param')
 * 5. defaultMockupParams / exportFileName / validateImageFile / normalizeHex
 * 6. 注册与零网络静态检查：234 Path、ID/Path 双注册、Icon view_in_ar、互链三件近邻、不链未交付工具
 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/screenshot_mockup_3d.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function has(s, sub, name) { ok(String(s).indexOf(sub) !== -1, name + "（应包含 " + JSON.stringify(sub) + "）"); }
function notHas(s, sub, name) { ok(String(s).indexOf(sub) === -1, name + "（不应包含 " + JSON.stringify(sub) + "）"); }
function throwsField(fn, field, name) {
  try { fn(); ok(false, name + "（未抛错）"); }
  catch (e) { ok(e instanceof Error && e.field === field, name + "（field=" + (e && e.field) + "）"); }
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "screenshot_mockup_3d.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "screenshot_3d_mockup.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. mockupScenes：4 项固定顺序 ---------- */
var scenes = M.mockupScenes();
eq(scenes.length, 4, "mockupScenes() 返回 4 项");
eq(scenes.map(function (s) { return s.id; }).join(","),
  "browser-frame,phone-frame,float-3d,flat-shadow", "4 场景固定顺序");
ok(scenes.every(function (s) { return s.name && s.desc; }), "每项含 name/desc");

/* ---------- 2. buildTransform 逐字命中 ---------- */
eq(M.buildTransform({ rotateX: -12, rotateY: 24, perspective: 900, scale: 0.9 }),
  "perspective(900px) rotateX(-12deg) rotateY(24deg) scale(0.9)",
  "buildTransform 逐字命中");
eq(M.buildTransform({ rotateX: 0, rotateY: 0, perspective: 1200, scale: 1 }),
  "perspective(1200px) rotateX(0deg) rotateY(0deg) scale(1)",
  "buildTransform 零值与整数 scale");
/* 各场景默认参数可顺利生成 transform */
M.mockupScenes().forEach(function (sc) {
  var t = M.buildTransform(M.defaultMockupParams(sc.id));
  ok(/^perspective\(\d+px\) rotateX\(-?\d+deg\) rotateY\(-?\d+deg\) scale\(.+\)$/.test(t),
    "默认参数生成 transform：" + sc.id + " → " + t);
});

/* ---------- 3. buildCanvasDrawPlan ---------- */
var plan = M.buildCanvasDrawPlan(M.defaultMockupParams("phone-frame"), 1200, 800);
eq(plan.imgRect.w, 1140, "phone-frame 1200×800 → imgRect.w=1140");
eq(plan.imgRect.h, 760, "phone-frame 1200×800 → imgRect.h=760");
var ratioErr = Math.abs((plan.imgRect.w / plan.imgRect.h) - (1200 / 800)) / (1200 / 800);
ok(ratioErr < 0.01, "phone-frame imgRect 宽高比与输入一致（误差 " + (ratioErr * 100).toFixed(4) + "% < 1%）");
ok(plan.outW > 0 && plan.outH > 0, "outW/outH 为正");
ok(plan.framePad && plan.framePad.top > 0, "framePad 非空");
ok(plan.shadow && plan.shadow.blur > 0 && plan.shadow.alpha > 0, "shadow 非空");
eq(plan.reflection.enabled, true, "默认反射开启");
ok(plan.reflection.height > 0, "反射高度为正");
eq(plan.downscaled, false, "常规尺寸不降采样");
/* 场景差异：browser-frame 顶部内边距大于底部（标题栏） */
var pb = M.buildCanvasDrawPlan(M.defaultMockupParams("browser-frame"), 800, 600);
ok(pb.framePad.top > pb.framePad.bottom, "browser-frame 顶部内边距大于底部（标题栏）");
/* 超大图降采样：长边上限 4096 */
var big = M.buildCanvasDrawPlan(M.defaultMockupParams("flat-shadow"), 8000, 6000);
eq(big.downscaled, true, "8000×6000 触发降采样");
ok(Math.max(big.outW, big.outH) === 4096, "降采样后长边=4096（实得 " + big.outW + "×" + big.outH + "）");
var bigRatioErr = Math.abs((big.imgRect.w / big.imgRect.h) - (8000 / 6000)) / (8000 / 6000);
ok(bigRatioErr < 0.01, "降采样后宽高比仍一致");

/* ---------- 4. 非法向量（err.field） ---------- */
throwsField(function () {
  M.buildTransform({ rotateX: 99, rotateY: 0, perspective: 900, scale: 1 });
}, "param", "rotateX=99 抛 Error(err.field='param')");
throwsField(function () {
  M.buildTransform({ rotateX: 0, rotateY: -31, perspective: 900, scale: 1 });
}, "param", "rotateY=-31 抛 param");
throwsField(function () {
  M.buildTransform({ rotateX: 0, rotateY: 0, perspective: 300, scale: 1 });
}, "param", "perspective=300 抛 param");
throwsField(function () {
  M.buildTransform({ rotateX: 0, rotateY: 0, perspective: 900, scale: 2 });
}, "param", "scale=2 抛 param");
throwsField(function () { M.defaultMockupParams("nope"); }, "scene", "未知 scene 默认参数抛 scene");
throwsField(function () { M.exportFileName("nope"); }, "scene", "未知 scene 导出命名抛 scene");
throwsField(function () {
  M.buildCanvasDrawPlan(M.defaultMockupParams("nope"), 100, 100);
}, "scene", "未知 scene 绘制计划抛 scene");
throwsField(function () {
  M.buildCanvasDrawPlan(M.defaultMockupParams("browser-frame"), 0, 600);
}, "param", "imgW=0 抛 Error(err.field='param')");
throwsField(function () {
  M.buildCanvasDrawPlan(M.defaultMockupParams("browser-frame"), 800, -5);
}, "param", "imgH 为负抛 param");
throwsField(function () { M.normalizeHex("#gggggg"); }, "param", "非法颜色抛 param");

/* ---------- 5. 命名 / 校验 ---------- */
eq(M.exportFileName("browser-frame"), "mockup-browser-frame.png", "browser-frame 导出命名");
eq(M.exportFileName("phone-frame"), "mockup-phone-frame.png", "phone-frame 导出命名");
eq(M.exportFileName("float-3d"), "mockup-float-3d.png", "float-3d 导出命名");
eq(M.exportFileName("flat-shadow"), "mockup-flat-shadow.png", "flat-shadow 导出命名");
eq(M.validateImageFile({ type: "image/png", size: 100 }).ok, true, "png 接受");
eq(M.validateImageFile({ type: "image/jpeg", size: 100 }).ok, true, "jpeg 接受");
eq(M.validateImageFile({ type: "image/webp", size: 100 }).ok, true, "webp 接受");
eq(M.validateImageFile({ type: "image/gif", size: 100 }).ok, false, "gif 拒绝");
eq(M.validateImageFile({ type: "image/png", size: 20 * 1024 * 1024 + 1 }).ok, false, "超 20MB 拒绝");
eq(M.normalizeHex("#ff8800"), "#FF8800", "颜色归一化大写");
eq(M.normalizeHex("1f2937"), "#1F2937", "无 # 前缀等价");

/* ---------- 6. 注册与零网络静态检查 ---------- */
ok(GO_SRC.indexOf('"screenshot_mockup_3d"') >= 0, "categories.go 注册 ID");
ok(GO_SRC.indexOf('"/tools/screenshot-3d-mockup"') >= 0, "categories.go 注册 Path");
var idx = GO_SRC.indexOf('"screenshot_mockup_3d"');
ok(GO_SRC.slice(idx, idx + 1200).indexOf('Category:    "图片处理"') >= 0, "注册 Category 为图片处理");
ok(GO_SRC.slice(idx, idx + 1200).indexOf("New:         true") >= 0, "注册 New 为 true");
ok(GO_SRC.slice(idx, idx + 1200).indexOf('Icon:        "view_in_ar"') >= 0, "注册 Icon 为 view_in_ar");
var pathCount = 0, seen = {}, m;
var re = /"\/tools\/[^"]+"/g;
while ((m = re.exec(GO_SRC)) !== null) { if (!seen[m[0]]) { seen[m[0]] = true; pathCount++; } }
eq(pathCount, 236, "注册 Path 总数 235→236");
ok(JS_SRC.indexOf("fetch(") < 0 && JS_SRC.indexOf("XMLHttpRequest") < 0, "JS 零 fetch/XHR");
ok(!/src="https?:\/\//.test(TPL_SRC), "模板无外部脚本引用");
ok(!/href="https?:\/\/(?!www\.johnkingzcq123\.xyz)/.test(TPL_SRC), "模板无外部超链接（canonical 除外）");
has(TPL_SRC, 'https://www.johnkingzcq123.xyz/tools/screenshot-3d-mockup', "canonical 标准地址");

/* ---------- 7. 真限制四条页面明示 ---------- */
has(TPL_SRC, "非真实设备照片级还原", "模板含真限制①：机身框非照片级还原");
has(TPL_SRC, "长边 4096px", "模板含真限制②：导出分辨率上限与降采样");
has(TPL_SRC, "无损导出、体积较大", "模板含真限制③：PNG 体积大");
has(TPL_SRC, "全程浏览器本地处理，图片零上传", "模板含真限制④：全程本地零上传");

/* ---------- 8. 互链合规 ---------- */
has(TPL_SRC, "/tools/img-mosaic", "互链图片打码（先打码再做展示图）");
has(TPL_SRC, "/tools/img-compress", "互链图片压缩（PNG 体积大可去压缩）");
has(TPL_SRC, "/tools/img-convert", "互链图片格式转换");
notHas(TPL_SRC, "llms", "不链未交付工具：llms.txt 生成器");
notHas(TPL_SRC, "手写签名", "不链未交付工具：手写签名数字化仪");
/* 模板内所有 /tools/xxx 外链必须已在 categories.go 注册（不链未交付工具）。 */
var hrefRe = /href="(\/tools\/[a-z0-9\-\/]+)"/g;
var hm, bad = [];
while ((hm = hrefRe.exec(TPL_SRC)) !== null) {
  if (hm[1] === "/tools/static") continue;
  if (GO_SRC.indexOf('"' + hm[1] + '"') < 0) bad.push(hm[1]);
}
eq(bad.length, 0, "模板外链全部已注册（实得未注册：" + JSON.stringify(bad) + "）");

console.log("screenshot_mockup_3d: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
