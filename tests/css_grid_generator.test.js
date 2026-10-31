/* CSS Grid 可视化生成器纯逻辑单元测试（零依赖）：node tests/css_grid_generator.test.js
 * 覆盖：轨道解析向量、区域编辑与矩形校验向量、组合与预设向量、
 * 代码生成向量、注册、真限制文案、互链与零网络请求。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/css_grid_generator.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function throws(fn, name, fieldPart) {
  try { fn(); ok(false, name + "（应抛错却未抛）"); }
  catch (e) {
    var good = e instanceof Error && typeof e.field === "string" && e.field.length > 0;
    if (fieldPart) good = good && e.field.indexOf(fieldPart) >= 0;
    ok(good, name + "（抛错且带 err.field" + (fieldPart ? " " + fieldPart : "") + "，实得 field=" + (e && e.field) + " msg=" + (e && e.message) + "）");
  }
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "css_grid_generator.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "css_grid_generator.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. 轨道解析向量 ---------- */
eq(M.parseTrackSize("1fr"), "1fr", "parseTrackSize 1fr");
eq(M.parseTrackSize("200px"), "200px", "parseTrackSize 200px");
eq(M.parseTrackSize("30%"), "30%", "parseTrackSize 30%");
eq(M.parseTrackSize("auto"), "auto", "parseTrackSize auto");
eq(M.parseTrackSize("minmax(200px, 1fr)"), "minmax(200px, 1fr)", "parseTrackSize minmax(200px, 1fr)");
eq(M.parseTrackSize("200.50px"), "200.5px", "parseTrackSize 去尾零 200.50px→200.5px");
eq(M.parseTrackSize("1.50fr"), "1.5fr", "parseTrackSize 去尾零 1.50fr→1.5fr");
eq(M.parseTrackSize("  1fr  "), "1fr", "parseTrackSize 两端空格容忍");
eq(M.parseTrackSize("minmax(200.50px,1fr)"), "minmax(200.5px, 1fr)", "parseTrackSize minmax 内去尾零并统一逗号空格");
eq(M.parseTrackSize("0px"), "0px", "parseTrackSize 0px 通过");
eq(M.parseTrackSize("100%"), "100%", "parseTrackSize 100% 通过");
eq(M.parseTrackSize("12fr"), "12fr", "parseTrackSize 12fr 上限通过");
throws(function () { M.parseTrackSize("10em"); }, "parseTrackSize em 单位失败", "track");
throws(function () { M.parseTrackSize("0fr"); }, "parseTrackSize fr 为 0 失败", "track");
throws(function () { M.parseTrackSize("13fr"); }, "parseTrackSize fr 越界 13 失败", "track");
throws(function () { M.parseTrackSize("1001px"); }, "parseTrackSize px 越界失败", "track");
throws(function () { M.parseTrackSize("101%"); }, "parseTrackSize % 越界失败", "track");
throws(function () { M.parseTrackSize("minmax(minmax(100px, 1fr), 1fr)"); }, "parseTrackSize 嵌套 minmax 失败", "track");
throws(function () { M.parseTrackSize(""); }, "parseTrackSize 空串失败", "track");
throws(function () { M.parseTrackSize("   "); }, "parseTrackSize 纯空格失败", "track");
throws(function () { M.parseTrackSize("1.234fr"); }, "parseTrackSize 3 位小数失败", "track");
throws(function () { M.parseTrackSize("minmax(200px)"); }, "parseTrackSize minmax 缺一元失败", "track");
throws(function () { M.parseTrackSize("minmax(10em, 1fr)"); }, "parseTrackSize minmax 内 em 失败", "track");
eq(JSON.stringify(M.parseTrackList("200px 1fr 200px")), JSON.stringify(["200px", "1fr", "200px"]), "parseTrackList 三轨道切分");
eq(JSON.stringify(M.parseTrackList("minmax(200px, 1fr) 1fr")), JSON.stringify(["minmax(200px, 1fr)", "1fr"]), "parseTrackList 含 minmax 多轨道切分正确");
eq(JSON.stringify(M.parseTrackList("60px  1fr\t60px")), JSON.stringify(["60px", "1fr", "60px"]), "parseTrackList 多空白切分");
throws(function () { M.parseTrackList(""); }, "parseTrackList 空串失败", "tracks");
throws(function () { M.parseTrackList("1fr 10em"); }, "parseTrackList 任一轨道非法失败");
throws(function () { M.parseTrackList("minmax(200px, 1fr"); }, "parseTrackList 括号不匹配失败", "tracks");

/* ---------- 2. 区域编辑与矩形校验向量 ---------- */
var empty = M.createEmptyAreas(3, 2);
eq(empty.length, 2, "createEmptyAreas 行数 2");
eq(empty[0].length, 3, "createEmptyAreas 列数 3");
eq(empty[1][2], ".", "createEmptyAreas 全 '.'");
throws(function () { M.createEmptyAreas(0, 2); }, "createEmptyAreas 列数 0 失败", "columns");
throws(function () { M.createEmptyAreas(13, 2); }, "createEmptyAreas 列数 13 失败", "columns");
throws(function () { M.createEmptyAreas(3, 2.5); }, "createEmptyAreas 行数非整数失败", "rows");

var base = M.createEmptyAreas(3, 3);
var withHeader = M.setArea(base, "header", 0, 0, 0, 2);
eq(base[0][0], ".", "setArea 不改原数组");
eq(withHeader[0][0], "header", "setArea 矩形写入");
eq(withHeader[0][2], "header", "setArea 矩形通栏写入");
eq(withHeader[1][0], ".", "setArea 矩形外不受影响");
var again = M.setArea(withHeader, "header", 0, 0, 0, 2);
eq(again[0][1], "header", "setArea 同名覆盖通过");
throws(function () { M.setArea(withHeader, "main", 0, 1, 1, 1); }, "setArea 覆盖其它区域名失败", "areas");
throws(function () { M.setArea(base, "main", 0, 0, 3, 1); }, "setArea 下标越界失败", "areas");
throws(function () { M.setArea(base, "main", 1, 0, 0, 1); }, "setArea 行下标倒置失败", "areas");
throws(function () { M.setArea(base, "main", 0, 2, 0, 1); }, "setArea 列下标倒置失败", "areas");
throws(function () { M.setArea(base, "1main", 0, 0, 0, 0); }, "setArea 数字开头非法名失败", "name");
throws(function () { M.setArea(base, "main area", 0, 0, 0, 0); }, "setArea 含空格非法名失败", "name");
throws(function () { M.setArea(base, "", 0, 0, 0, 0); }, "setArea 空名失败", "name");
ok(M.setArea(base, "main-area_1", 0, 0, 0, 0)[0][0] === "main-area_1", "setArea 连字符下划线名通过");

var cleared = M.clearArea(withHeader, "header");
eq(cleared[0][0], ".", "clearArea 置 '.'");
throws(function () { M.clearArea(base, "ghost"); }, "clearArea 未知名失败", "areas");

var lShape = [
  ["a", "a", "."],
  ["a", ".", "."],
  [".", ".", "."]
];
throws(function () { M.validateAreas(lShape, 3, 3); }, "validateAreas L 形判失败", "areas");
var rectOk = [
  ["a", "a", "."],
  ["a", "a", "."],
  [".", ".", "."]
];
eq(M.validateAreas(rectOk, 3, 3), true, "validateAreas 完整矩形通过");
throws(function () { M.validateAreas(rectOk, 3, 2); }, "validateAreas 尺寸不一致失败", "areas");

var resizedBig = M.resizeAreas([["a", "b"]], 3, 2);
eq(JSON.stringify(resizedBig), JSON.stringify([["a", "b", "."], [".", ".", "."]]), "resizeAreas 补 '.' 正确");
var resizedSmall = M.resizeAreas([["a", "a", "b"], ["a", "a", "b"]], 2, 1);
eq(JSON.stringify(resizedSmall), JSON.stringify([["a", "a"]]), "resizeAreas 裁剪正确");
throws(function () { M.resizeAreas([["a"]], 0, 1); }, "resizeAreas 列数 0 失败", "columns");

/* ---------- 3. 组合与预设向量 ---------- */
var GRID = {
  columns: ["200px", "1fr", "200px"],
  rows: ["60px", "1fr", "60px"],
  columnGap: 16,
  rowGap: 16,
  areas: [
    ["header", "header", "header"],
    ["sidebar", "main", "aside"],
    ["footer", "footer", "footer"]
  ]
};
eq(M.buildContainerCss(GRID),
  ".grid-container {\n  display: grid;\n  grid-template-columns: 200px 1fr 200px;\n  grid-template-rows: 60px 1fr 60px;\n  column-gap: 16px;\n  row-gap: 16px;\n  grid-template-areas:\n    \"header header header\"\n    \"sidebar main aside\"\n    \"footer footer footer\";\n}",
  "buildContainerCss 已知值拼串");
ok(M.buildContainerCss(GRID).split("\n")[1].trim() === "display: grid;", "容器首行声明为 display: grid;");
ok(M.buildContainerCss({ columns: ["1fr"], rows: ["1fr"], columnGap: 0, rowGap: 0 }).indexOf("grid-template-areas") < 0, "无区域时不输出 grid-template-areas");
throws(function () { M.buildContainerCss({ columns: [], rows: ["1fr"], columnGap: 0, rowGap: 0 }); }, "列数 0 失败", "columns");
throws(function () {
  var cols = [];
  for (var i = 0; i < 13; i++) cols.push("1fr");
  M.buildContainerCss({ columns: cols, rows: ["1fr"], columnGap: 0, rowGap: 0 });
}, "列数 13 失败", "columns");
throws(function () { M.buildContainerCss({ columns: ["1fr"], rows: [], columnGap: 0, rowGap: 0 }); }, "行数 0 失败", "rows");
throws(function () { M.buildContainerCss({ columns: ["1fr"], rows: ["1fr"], columnGap: 16.5, rowGap: 0 }); }, "columnGap 非整数失败", "columnGap");
throws(function () { M.buildContainerCss({ columns: ["1fr"], rows: ["1fr"], columnGap: 65, rowGap: 0 }); }, "columnGap 越界 65 失败", "columnGap");
throws(function () { M.buildContainerCss({ columns: ["1fr"], rows: ["1fr"], columnGap: 0, rowGap: -1 }); }, "rowGap 负数失败", "rowGap");
throws(function () { M.buildContainerCss({ columns: ["10em"], rows: ["1fr"], columnGap: 0, rowGap: 0 }); }, "容器轨道 em 失败", "track");
throws(function () { M.buildContainerCss({ columns: ["1fr"], rows: ["1fr"], columnGap: 0, rowGap: 0, areas: lShape }); }, "容器 areas 非矩形失败", "areas");

var holy = M.generatePreset("holy-grail");
eq(JSON.stringify(holy.columns), JSON.stringify(["200px", "1fr", "200px"]), "预设 holy-grail 列配置");
eq(JSON.stringify(holy.rows), JSON.stringify(["60px", "1fr", "60px"]), "预设 holy-grail 行配置");
eq(holy.columnGap, 16, "预设 holy-grail gap 16");
eq(M.areaNames(holy.areas).length, 5, "预设 holy-grail 5 区域");
eq(M.validateAreas(holy.areas, 3, 3), true, "预设 holy-grail 各区域均为矩形");
var dash = M.generatePreset("dashboard");
eq(JSON.stringify(dash.columns), JSON.stringify(["220px", "1fr", "1fr"]), "预设 dashboard 列配置");
eq(JSON.stringify(dash.rows), JSON.stringify(["60px", "1fr", "1fr"]), "预设 dashboard 行配置");
eq(M.areaNames(dash.areas).length, 5, "预设 dashboard 5 区域");
eq(M.validateAreas(dash.areas, 3, 3), true, "预设 dashboard 各区域均为矩形");
eq(dash.areas[1][0], "sidebar", "预设 dashboard sidebar 左列下两行通占");
eq(dash.areas[2][0], "sidebar", "预设 dashboard sidebar 第三行仍为 sidebar");
var three = M.generatePreset("three-column");
eq(JSON.stringify(three.columns), JSON.stringify(["1fr", "1fr", "1fr"]), "预设 three-column 列 1fr 三栏");
eq(M.areaNames(three.areas).length, 3, "预设 three-column 3 区域");
eq(M.validateAreas(three.areas, 3, 1), true, "预设 three-column 各区域均为矩形");
throws(function () { M.generatePreset("masonry"); }, "未知预设失败", "preset");

/* ---------- 4. 代码生成向量 ---------- */
var areasCss = M.buildAreasCss(GRID.areas);
eq(areasCss,
  ".grid-area-header {\n  grid-area: header;\n}\n\n.grid-area-sidebar {\n  grid-area: sidebar;\n}\n\n.grid-area-main {\n  grid-area: main;\n}\n\n.grid-area-aside {\n  grid-area: aside;\n}\n\n.grid-area-footer {\n  grid-area: footer;\n}",
  "buildAreasCss 按首次出现顺序输出区域类");
eq(M.buildAreasCss([[".", "."], [".", "."]]), "", "buildAreasCss 无命名区域返回空串");
var full = M.buildGridCss(GRID);
ok(full.indexOf(".grid-container {") === 0, "buildGridCss 以容器块开头");
ok(full.indexOf(".grid-area-header {") >= 0 && full.indexOf(".grid-area-footer {") >= 0, "buildGridCss 含区域块");
var html = M.buildHtmlSnippet(GRID);
ok(html.indexOf("<style>") >= 0 && html.indexOf("</style>") >= 0, "buildHtmlSnippet 含 <style> 内嵌 CSS");
ok(html.indexOf('class="grid-container"') >= 0, "buildHtmlSnippet 含 grid-container 容器 div");
eq((html.match(/<div class="grid-area grid-area-[a-zA-Z0-9_-]+">/g) || []).length, 5, "buildHtmlSnippet 含 5 个区域 div");
ok(html.indexOf("display: grid;") >= 0, "buildHtmlSnippet 内嵌 CSS 含 display: grid;");
var htmlEmpty = M.buildHtmlSnippet({ columns: ["1fr"], rows: ["1fr"], columnGap: 0, rowGap: 0, areas: [["."]] });
ok(htmlEmpty.indexOf("grid-placeholder") >= 0, "buildHtmlSnippet 无命名区域放占位 div");
throws(function () { M.buildHtmlSnippet({ columns: ["1fr"], rows: ["1fr"], columnGap: 0, rowGap: 0, areas: lShape }); }, "buildHtmlSnippet 非矩形失败", "areas");
eq(M.suggestExportName("css"), "grid.css", "suggestExportName css");
eq(M.suggestExportName("html"), "grid-demo.html", "suggestExportName html");
throws(function () { M.suggestExportName("png"); }, "suggestExportName 其它 kind 失败", "kind");

/* ---------- 5. 注册、模板、互链与零网络 ---------- */
ok(GO_SRC.indexOf('"css_grid_generator"') >= 0, "categories.go 注册 ID");
ok(GO_SRC.indexOf('"/tools/css-grid-generator"') >= 0, "categories.go 注册 Path");
ok(GO_SRC.indexOf('Category:    "开发工具"') >= 0, "categories.go 含开发工具品类");
var paths = GO_SRC.match(/"\/tools\/[^"]+"/g) || [];
var uniq = {};
paths.forEach(function (p) { uniq[p] = true; });
eq(Object.keys(uniq).length, 246, "注册 Path 总数→246（历史遗留陈旧断言同步）");
ok(TPL_SRC.indexOf("css-grid-generator") >= 0, "模板 canonical 含新 Path");
ok(TPL_SRC.indexOf("只做单层显式网格、不做嵌套子网格／subgrid") >= 0, "真限制 1：单层显式网格、不做子网格");
ok(TPL_SRC.indexOf("不做多断点批量导出") >= 0, "真限制 2：不做多断点批量导出");
ok(TPL_SRC.indexOf("列数／行数各上限 12") >= 0, "真限制 3：列行各上限 12");
ok(TPL_SRC.indexOf("轨道只认 fr／px／%／auto／minmax") >= 0, "真限制 4：轨道单位");
ok(TPL_SRC.indexOf("区域名须字母开头＋字母数字下划线连字符、每个区域须为完整矩形") >= 0, "真限制 5：区域名规则与完整矩形");
ok(TPL_SRC.indexOf("不收集、不上传") >= 0, "真限制 6：不收集、不上传");
ok(TPL_SRC.indexOf("/tools/css-flexbox-generator") >= 0, "互链：CSS Flexbox 可视化生成器");
ok(TPL_SRC.indexOf("/tools/css-to-tailwind") >= 0, "互链：CSS 转 Tailwind");
ok(TPL_SRC.indexOf("/tools/css-gradient-generator") >= 0, "互链：CSS 渐变生成器");
ok(TPL_SRC.indexOf("/tools/css-shadow-radius-generator") >= 0, "互链：CSS 阴影／圆角生成器");
ok(TPL_SRC.indexOf("keyframe") < 0 && TPL_SRC.indexOf("text-shadow-generator") < 0, "不链未交付的动画关键帧／文字阴影工具");
ok(TPL_SRC.indexOf("grid.css") >= 0 && TPL_SRC.indexOf("grid-demo.html") >= 0, "模板含两下载文件名");
ok(TPL_SRC.indexOf("载入示例") >= 0, "模板含载入示例按钮");
ok(TPL_SRC.indexOf("cgd-canvas") >= 0 && TPL_SRC.indexOf("cgd-area-list") >= 0, "模板含画布圈选区与区域侧栏");
ok(TPL_SRC.indexOf("cgd-col-tracks") >= 0 && TPL_SRC.indexOf("cgd-row-tracks") >= 0, "模板含轨道编辑区");
ok(TPL_SRC.indexOf("cgd-preset-holy-grail") >= 0 && TPL_SRC.indexOf("cgd-preset-dashboard") >= 0 && TPL_SRC.indexOf("cgd-preset-three-column") >= 0, "模板含三预设按钮");
ok(TPL_SRC.indexOf("cgd-preview") >= 0, "模板含预览区");
ok(JS_SRC.indexOf("fetch(") < 0 && JS_SRC.indexOf("XMLHttpRequest") < 0, "JS 零网络请求调用");
var tplNoCanonical = TPL_SRC.split("\n").filter(function (l) { return l.indexOf("johnkingzcq123.xyz") < 0; }).join("\n");
ok(tplNoCanonical.indexOf('src="http') < 0 && tplNoCanonical.indexOf('href="http') < 0, "模板零 CDN 外链（canonical／OG 自身域名除外）");
ok(JS_SRC.indexOf("parseTrackSize") >= 0 && JS_SRC.indexOf("parseTrackList") >= 0 && JS_SRC.indexOf("createEmptyAreas") >= 0 && JS_SRC.indexOf("setArea") >= 0 && JS_SRC.indexOf("clearArea") >= 0 && JS_SRC.indexOf("validateAreas") >= 0 && JS_SRC.indexOf("resizeAreas") >= 0 && JS_SRC.indexOf("buildContainerCss") >= 0 && JS_SRC.indexOf("buildAreasCss") >= 0 && JS_SRC.indexOf("buildGridCss") >= 0 && JS_SRC.indexOf("buildHtmlSnippet") >= 0 && JS_SRC.indexOf("generatePreset") >= 0 && JS_SRC.indexOf("suggestExportName") >= 0, "JS 含全部核心纯函数");

console.log("PASS " + pass + " / FAIL " + fail);
if (fail > 0) process.exit(1);
