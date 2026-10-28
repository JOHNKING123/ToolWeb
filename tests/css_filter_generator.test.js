/* CSS 滤镜生成器纯逻辑单元测试（零依赖）：node tests/css_filter_generator.test.js
 * 覆盖：单项校验向量、集合与顺序向量、合成与预设向量、代码生成向量、
 * 注册与零网络请求静态检查。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/css_filter_generator.js");

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
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "css_filter_generator.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "css_filter_generator.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

function item(fn, enabled, value) { return { fn: fn, enabled: enabled, value: value }; }

/* ---------- 1. validateFilterItem：九函数边界通过 ---------- */
eq(M.validateFilterItem(item("blur", true, 20)).value, 20, "validate blur 上界 20px 通过");
eq(M.validateFilterItem(item("blur", true, 0)).value, 0, "validate blur 下界 0 通过");
eq(M.validateFilterItem(item("brightness", true, 200)).value, 200, "validate brightness 上界 200% 通过");
eq(M.validateFilterItem(item("contrast", true, 0)).value, 0, "validate contrast 下界 0 通过");
eq(M.validateFilterItem(item("grayscale", true, 100)).value, 100, "validate grayscale 上界 100% 通过");
eq(M.validateFilterItem(item("hue-rotate", true, -360)).value, -360, "validate hue-rotate 下界 -360deg 通过");
eq(M.validateFilterItem(item("hue-rotate", true, 360)).value, 360, "validate hue-rotate 上界 360deg 通过");
eq(M.validateFilterItem(item("invert", true, 100)).value, 100, "validate invert 上界通过");
eq(M.validateFilterItem(item("opacity", true, 100)).value, 100, "validate opacity 上界通过");
eq(M.validateFilterItem(item("saturate", true, 200)).value, 200, "validate saturate 上界通过");
eq(M.validateFilterItem(item("sepia", true, 0)).value, 0, "validate sepia 下界通过");
eq(M.validateFilterItem(item("brightness", false, 110.5)).value, 110.5, "validate 2 位小数通过");
throws(function () { M.validateFilterItem(item("drop-shadow", true, 5)); }, "fn", "validate 非法函数名 drop-shadow 失败");
throws(function () { M.validateFilterItem(item("blur", "yes", 5)); }, "enabled", "validate 非布尔 enabled 失败");
throws(function () { M.validateFilterItem(item("blur", true, 20.01)); }, "value", "validate blur 越界失败");
throws(function () { M.validateFilterItem(item("brightness", true, -1)); }, "value", "validate brightness 负值失败");
throws(function () { M.validateFilterItem(item("sepia", true, 10.555)); }, "value", "validate 超 2 位小数失败");
throws(function () { M.validateFilterItem(item("hue-rotate", true, 361)); }, "value", "validate hue-rotate 越界失败");
throws(function () { M.validateFilterItem(null); }, "item", "validate 非对象失败");

/* ---------- 2. isDefaultValue ---------- */
eq(M.isDefaultValue("blur", 0), true, "isDefaultValue blur 0 为默认");
eq(M.isDefaultValue("brightness", 100), true, "isDefaultValue brightness 100 为默认");
eq(M.isDefaultValue("sepia", 0), true, "isDefaultValue sepia 0 为默认");
eq(M.isDefaultValue("opacity", 100), true, "isDefaultValue opacity 100 为默认");
eq(M.isDefaultValue("brightness", 120), false, "isDefaultValue brightness 120 非默认");
eq(M.isDefaultValue("hue-rotate", -10), false, "isDefaultValue hue-rotate -10 非默认");
throws(function () { M.isDefaultValue("drop-shadow", 5); }, "fn", "isDefaultValue 非法函数名失败");
throws(function () { M.isDefaultValue("blur", 21); }, "value", "isDefaultValue 越界失败");

/* ---------- 3. 集合与顺序：move / setEnabled ---------- */
var base = [item("blur", true, 5), item("brightness", true, 120), item("sepia", false, 30)];
var moved = M.moveFilterItem(base, 1, "up");
eq(moved[0].fn, "brightness", "move up 换位到首位");
eq(moved[1].fn, "blur", "move up 原首位后移");
eq(moved[0].value, 120, "move up 只改顺序不改数值");
eq(moved[2].enabled, false, "move up 只改顺序不改启用状态");
eq(base[0].fn, "blur", "move up 不改原数组");
var movedDown = M.moveFilterItem(base, 0, "down");
eq(movedDown[1].fn, "blur", "move down 换位");
throws(function () { M.moveFilterItem(base, 0, "up"); }, "index", "move 首位上移端点失败");
throws(function () { M.moveFilterItem(base, 2, "down"); }, "index", "move 末位下移端点失败");
throws(function () { M.moveFilterItem(base, 0, "left"); }, "direction", "move 非法方向失败");
throws(function () { M.moveFilterItem(base, 5, "up"); }, "index", "move 下标越界失败");
var toggled = M.setFilterEnabled(base, 2, true);
eq(toggled[2].enabled, true, "setEnabled 切换为 true");
eq(base[2].enabled, false, "setEnabled 不改原数组");
eq(toggled[2].value, 30, "setEnabled 不改数值");
throws(function () { M.setFilterEnabled(base, 3, true); }, "index", "setEnabled 下标越界失败");
throws(function () { M.setFilterEnabled(base, 0, 1); }, "enabled", "setEnabled 非布尔失败");

/* ---------- 4. 合成：buildFilterCss ---------- */
eq(M.buildFilterCss([item("brightness", true, 110), item("sepia", true, 60)]),
  "brightness(110%) sepia(60%)", "buildFilterCss 多函数空格连接");
eq(M.buildFilterCss([item("brightness", true, 110.5), item("blur", true, 5)]),
  "brightness(110.5%) blur(5px)", "buildFilterCss 数值去尾零与顺序跟随数组");
eq(M.buildFilterCss([item("brightness", true, 100), item("sepia", true, 60)]),
  "sepia(60%)", "buildFilterCss 默认值省略");
eq(M.buildFilterCss([item("brightness", false, 120), item("sepia", true, 60)]),
  "sepia(60%)", "buildFilterCss 禁用项省略");
eq(M.buildFilterCss([item("brightness", true, 100), item("blur", false, 5)]),
  "none", "buildFilterCss 无有效项返回 none");
throws(function () { M.buildFilterCss([]); }, "items", "buildFilterCss 空数组失败");
throws(function () { M.buildFilterCss([item("blur", true, 99)]); }, "value", "buildFilterCss 非法项失败");

/* ---------- 5. 预设：generatePreset ---------- */
var vintage = M.generatePreset("vintage");
eq(vintage.name, "vintage", "preset vintage 名称");
eq(vintage.items.map(function (i) { return i.fn; }).join(","),
  "brightness,contrast,saturate,sepia", "preset vintage 函数与典范顺序");
eq(vintage.items[0].value, 110, "preset vintage brightness 110");
eq(vintage.items[3].value, 60, "preset vintage sepia 60");
ok(vintage.items.every(function (i) { return i.enabled === true; }), "preset 各项 enabled 均为 true");
var warm = M.generatePreset("warm");
eq(warm.items.map(function (i) { return i.fn + "=" + i.value; }).join(","),
  "brightness=105,hue-rotate=-10,saturate=130,sepia=30", "preset warm 函数与数值");
var cool = M.generatePreset("cool");
eq(cool.items.map(function (i) { return i.fn + "=" + i.value; }).join(","),
  "brightness=105,contrast=105,hue-rotate=15,saturate=110", "preset cool 函数与数值");
var bw = M.generatePreset("black-white");
eq(bw.items.map(function (i) { return i.fn + "=" + i.value; }).join(","),
  "contrast=110,grayscale=100", "preset black-white 函数与数值");
var vivid = M.generatePreset("vivid");
eq(vivid.items.map(function (i) { return i.fn + "=" + i.value; }).join(","),
  "brightness=105,contrast=115,saturate=160", "preset vivid 函数与数值");
throws(function () { M.generatePreset("glass"); }, "preset", "preset 未知预设失败");
eq(M.buildFilterCss(vintage.items), "brightness(110%) contrast(90%) saturate(80%) sepia(60%)",
  "preset vintage 合成为 filter 串");

/* ---------- 6. 代码生成：CSS / HTML / 导出命名 ---------- */
var css = M.buildCssSnippet([item("brightness", true, 110), item("sepia", true, 60)]);
ok(css.indexOf(".filtered {") === 0, "buildCssSnippet 以 .filtered 块开头");
ok(css.indexOf("-webkit-filter: brightness(110%) sepia(60%);") !== -1, "buildCssSnippet 含 -webkit-filter 行");
ok(css.indexOf("filter: brightness(110%) sepia(60%);") !== -1, "buildCssSnippet 含 filter 行");
throws(function () { M.buildCssSnippet([]); }, "items", "buildCssSnippet 空数组失败");
var html = M.buildHtmlSnippet([item("sepia", true, 60)]);
ok(html.indexOf("<style>") !== -1, "buildHtmlSnippet 含 <style>");
ok(html.indexOf("filter: sepia(60%);") !== -1, "buildHtmlSnippet 内嵌生成的 CSS");
ok(html.indexOf('class="filtered"') !== -1, "buildHtmlSnippet 含 class filtered");
ok(html.indexOf("<script") === -1, "buildHtmlSnippet 无 <script>");
eq(M.suggestExportName("css"), "filter.css", "suggestExportName css");
eq(M.suggestExportName("html"), "filter-demo.html", "suggestExportName html");
throws(function () { M.suggestExportName("png"); }, "kind", "suggestExportName 其它 kind 失败");

/* ---------- 7. 注册与零网络静态检查 ---------- */
ok(GO_SRC.indexOf('"css_filter_generator"') !== -1, "categories.go 注册 ID");
ok(GO_SRC.indexOf('"/tools/css-filter-generator"') !== -1, "categories.go 注册 Path");
ok(GO_SRC.indexOf('Category:    "开发工具"') !== -1, "categories.go 含开发工具品类");
var pathCount = (GO_SRC.match(/"\/tools\/[^"]+"/g) || []).filter(function (v, i, a) { return a.indexOf(v) === i; }).length;
eq(pathCount, 215, "注册总数 214→215 Path");
ok(JS_SRC.indexOf("fetch(") === -1 && JS_SRC.indexOf("XMLHttpRequest") === -1, "JS 零 fetch/XHR");
ok(TPL_SRC.indexOf("fetch(") === -1 && TPL_SRC.indexOf("XMLHttpRequest") === -1, "模板零 fetch/XHR");
ok(!/https?:\/\/(cdn|unpkg|cdnjs)/.test(JS_SRC + TPL_SRC), "JS 与模板零 CDN");
ok(TPL_SRC.indexOf("/tools/css-text-shadow-generator") !== -1, "互链含文字阴影生成器");
ok(TPL_SRC.indexOf("/tools/css-shadow-radius-generator") !== -1, "互链含阴影圆角生成器");
ok(TPL_SRC.indexOf("/tools/img-retro-filter") !== -1, "互链含图片复古做旧");
ok(TPL_SRC.indexOf("glass") === -1 || TPL_SRC.indexOf("/tools/") === -1, "互链不含毛玻璃硬凑（模板无毛玻璃工具链接）");
ok(TPL_SRC.indexOf("只做 filter、不做 backdrop-filter 与图片处理") !== -1, "真限制文案可见：只做 filter");
ok(TPL_SRC.indexOf("不含 drop-shadow") !== -1, "真限制文案可见：不含 drop-shadow");
ok(TPL_SRC.indexOf("默认值不输出") !== -1, "真限制文案可见：默认值不输出");
ok(TPL_SRC.indexOf("不收集、不上传") !== -1, "真限制文案可见：不收集不上传");
ok(TPL_SRC.indexOf('src="/tools/static/js/css_filter_generator.js') !== -1, "模板挂载本工具 JS");

console.log("css_filter_generator: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
