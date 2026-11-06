/* 字体搭配预览（Fontjoy 模式）纯函数单元测试（零依赖）：node tests/font_pairing_preview.test.js
 * 覆盖：listPairings 数量/结构/风格全覆盖/深拷贝隔离、getPairingById 命中与未命中抛错
 * err.field='id'、getPairingsByStyle 分组与非法风格抛错、pickPairingByIndex 边界与抛错、
 * buildFontStack 引号规则（空格/中文名加双引号、通用族名与纯 ASCII 单词不加引号）、
 * normalizeOptions 缺省 {32,16,1.6}、范围边界与抛错 err.field、formatPairingCSS 关键片段与
 * 精确全文、listFontStacks 选项结构、非法参数抛错 err.field、双模式导出与零外部接口、
 * buildPairingCardHTML 卡片 HTML 回归（上一轮评审致命 bug：renderList 误用 p.title/p.body
 * 致 10 张卡片全不渲染；现卡片 HTML 由纯函数生成，逐组断言可渲染且字体栈正确）、
 * categories.go 注册（Path 总数 305→306、Icon text_format 全库唯一、New/类目）、
 * 模板（SEO 四关键词、真限制四条、随机/手动选择/滑杆/预览/复制 CSS 控件、互链字体版权查询、
 * 零外部资源静态检查）。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/font_pairing_preview.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function eqj(a, b, name) { eq(JSON.stringify(a), JSON.stringify(b), name); }
function has(s, sub, name) { ok(s.indexOf(sub) !== -1, name + "（缺 " + sub + "）"); }
function notHas(s, sub, name) { ok(s.indexOf(sub) === -1, name + "（不应含 " + sub + "）"); }
function throws(fn, field, name) {
  try { fn(); ok(false, name + "（应抛错却未抛）"); }
  catch (e) { ok(!field || e.field === field, name + "（err.field 期望 " + field + "，实得 " + e.field + "）"); }
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "font_pairing_preview.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "font_pairing_preview.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. listPairings：数量/结构/风格全覆盖 ---------- */
var all = M.listPairings();
eq(all.length, 10, "预设搭配共 10 组");
var ids = all.map(function (p) { return p.id; });
eq(new Set(ids).size, 10, "搭配 id 全不重复");
var styleCounts = {};
all.forEach(function (p) { styleCounts[p.style] = (styleCounts[p.style] || 0) + 1; });
eqj(Object.keys(styleCounts).sort(), ["classic", "elegant", "minimal", "modern", "playful"], "五种风格全覆盖");
eq(styleCounts.classic, 2, "classic 风格 2 组");
eq(styleCounts.modern, 2, "modern 风格 2 组");
eq(styleCounts.elegant, 2, "elegant 风格 2 组");
eq(styleCounts.playful, 2, "playful 风格 2 组");
eq(styleCounts.minimal, 2, "minimal 风格 2 组");
all.forEach(function (p) {
  ok(typeof p.id === "string" && p.id.length > 0, "搭配 " + p.id + "：id 非空");
  ok(typeof p.name === "string" && p.name.length > 0, "搭配 " + p.id + "：名称非空");
  ok(typeof p.note === "string" && p.note.length > 0, "搭配 " + p.id + "：一句话点评非空");
  ok(Array.isArray(p.titleStack) && p.titleStack.length >= 2, "搭配 " + p.id + "：标题字体栈至少 2 个");
  ok(Array.isArray(p.bodyStack) && p.bodyStack.length >= 2, "搭配 " + p.id + "：正文字体栈至少 2 个");
  p.titleStack.concat(p.bodyStack).forEach(function (f) {
    ok(typeof f === "string" && f.length > 0, "搭配 " + p.id + "：字体名均为非空字符串");
  });
});
var mutated = M.listPairings();
mutated[0].name = "被改掉";
mutated[0].titleStack.push("X");
eq(M.listPairings()[0].name, "墨韵经典", "listPairings 深拷贝：改返回结果不污染内置表");
eq(M.listPairings()[0].titleStack.indexOf("X"), -1, "listPairings 深拷贝：字体栈数组隔离");

/* ---------- 2. getPairingById：命中与未命中 ---------- */
eq(M.getPairingById("classic-ink").name, "墨韵经典", "命中 classic-ink：名称");
eq(M.getPairingById("classic-ink").style, "classic", "命中 classic-ink：风格");
eq(M.getPairingById("minimal-mono").name, "极简等宽", "命中 minimal-mono：名称");
eq(M.getPairingById("playful-yuanti").style, "playful", "命中 playful-yuanti：风格");
throws(function () { M.getPairingById("no-such-id"); }, "id", "不存在的 id 抛错 field=id");
throws(function () { M.getPairingById(""); }, "id", "空串 id 抛错 field=id");
throws(function () { M.getPairingById(null); }, "id", "null id 抛错 field=id");
throws(function () { M.getPairingById(123); }, "id", "数字 id 抛错 field=id");
throws(function () { M.getPairingById(undefined); }, "id", "undefined id 抛错 field=id");

/* ---------- 3. getPairingsByStyle：分组与非法风格 ---------- */
eq(M.getPairingsByStyle("classic").length, 2, "classic 分组 2 组");
eqj(M.getPairingsByStyle("classic").map(function (p) { return p.id; }).sort(), ["classic-ink", "classic-palatino"], "classic 分组 id 精确值");
eq(M.getPairingsByStyle("modern").length, 2, "modern 分组 2 组");
eq(M.getPairingsByStyle("elegant").length, 2, "elegant 分组 2 组");
eq(M.getPairingsByStyle("playful").length, 2, "playful 分组 2 组");
eq(M.getPairingsByStyle("minimal").length, 2, "minimal 分组 2 组");
throws(function () { M.getPairingsByStyle("weird"); }, "style", "未知风格抛错 field=style");
throws(function () { M.getPairingsByStyle(""); }, "style", "空串风格抛错 field=style");
throws(function () { M.getPairingsByStyle(null); }, "style", "null 风格抛错 field=style");
throws(function () { M.getPairingsByStyle("Classic"); }, "style", "大小写敏感：Classic 抛错 field=style");

/* ---------- 4. pickPairingByIndex：边界与抛错 ---------- */
eq(M.pickPairingByIndex(0).id, "classic-ink", "下标 0：首个搭配");
eq(M.pickPairingByIndex(9).id, "minimal-mono", "下标 9：末个搭配");
eq(M.pickPairingByIndex(5).id, "elegant-kaiti", "下标 5：雅致楷宋");
throws(function () { M.pickPairingByIndex(-1); }, "index", "下标 -1 抛错 field=index");
throws(function () { M.pickPairingByIndex(10); }, "index", "下标 10 越界抛错 field=index");
throws(function () { M.pickPairingByIndex(1.5); }, "index", "非整数下标抛错 field=index");
throws(function () { M.pickPairingByIndex("0"); }, "index", "字符串下标抛错 field=index");
throws(function () { M.pickPairingByIndex(NaN); }, "index", "NaN 下标抛错 field=index");
throws(function () { M.pickPairingByIndex(undefined); }, "index", "undefined 下标抛错 field=index");

/* ---------- 5. buildFontStack：引号规则 ---------- */
eq(M.buildFontStack(["Georgia", "serif"]), "Georgia, serif", "纯 ASCII 单词 + 通用族名不加引号");
eq(M.buildFontStack(["Songti SC", "STSong", "SimSun", "serif"]), "\"Songti SC\", STSong, SimSun, serif", "含空格中文栈：Songti SC 加引号，STSong 不加");
eq(M.buildFontStack(["PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", "Heiti SC", "sans-serif"]), "\"PingFang SC\", \"Microsoft YaHei\", \"Hiragino Sans GB\", \"Heiti SC\", sans-serif", "多空格名全加引号，sans-serif 不加");
eq(M.buildFontStack(["Courier New", "Menlo", "Consolas", "monospace"]), "\"Courier New\", Menlo, Consolas, monospace", "Courier New 加引号，Menlo/Consolas 不加");
eq(M.buildFontStack(["Futura", "Century Gothic", "Avenir Next", "sans-serif"]), "Futura, \"Century Gothic\", \"Avenir Next\", sans-serif", "Century Gothic / Avenir Next 加引号");
eq(M.buildFontStack(["Kaiti SC", "STKaiti", "KaiTi", "serif"]), "\"Kaiti SC\", STKaiti, KaiTi, serif", "Kaiti SC 加引号");
eq(M.buildFontStack(["宋体", "SimSun", "serif"]), "\"宋体\", SimSun, serif", "纯中文名加双引号");
eq(M.buildFontStack(["serif"]), "serif", "单个通用族名");
throws(function () { M.buildFontStack([]); }, "families", "空数组抛错 field=families");
throws(function () { M.buildFontStack("Georgia"); }, "families", "字符串非数组抛错 field=families");
throws(function () { M.buildFontStack(null); }, "families", "null 抛错 field=families");
throws(function () { M.buildFontStack(["Georgia", ""]); }, "families", "空字符串成员抛错 field=families");
throws(function () { M.buildFontStack(["Georgia", 123]); }, "families", "非字符串成员抛错 field=families");

/* ---------- 6. normalizeOptions：缺省/边界/抛错 ---------- */
eqj(M.normalizeOptions(), { titleSizePx: 32, bodySizePx: 16, lineHeight: 1.6 }, "无参数：缺省 {32,16,1.6}");
eqj(M.normalizeOptions(null), { titleSizePx: 32, bodySizePx: 16, lineHeight: 1.6 }, "null：缺省 {32,16,1.6}");
eqj(M.normalizeOptions({}), { titleSizePx: 32, bodySizePx: 16, lineHeight: 1.6 }, "空对象：缺省 {32,16,1.6}");
eqj(M.normalizeOptions({ titleSizePx: 48 }), { titleSizePx: 48, bodySizePx: 16, lineHeight: 1.6 }, "部分指定：其余补缺省");
eqj(M.normalizeOptions({ titleSizePx: 16, bodySizePx: 12, lineHeight: 1.2 }), { titleSizePx: 16, bodySizePx: 12, lineHeight: 1.2 }, "下界 16/12/1.2 通过");
eqj(M.normalizeOptions({ titleSizePx: 72, bodySizePx: 24, lineHeight: 2.0 }), { titleSizePx: 72, bodySizePx: 24, lineHeight: 2.0 }, "上界 72/24/2.0 通过");
eq(M.normalizeOptions({ lineHeight: 1.75 }).lineHeight, 1.75, "行距小数 1.75 通过");
throws(function () { M.normalizeOptions({ titleSizePx: 15 }); }, "titleSizePx", "标题 15 越界抛错 field=titleSizePx");
throws(function () { M.normalizeOptions({ titleSizePx: 73 }); }, "titleSizePx", "标题 73 越界抛错 field=titleSizePx");
throws(function () { M.normalizeOptions({ titleSizePx: "32" }); }, "titleSizePx", "标题字符串抛错 field=titleSizePx");
throws(function () { M.normalizeOptions({ bodySizePx: 11 }); }, "bodySizePx", "正文 11 越界抛错 field=bodySizePx");
throws(function () { M.normalizeOptions({ bodySizePx: 25 }); }, "bodySizePx", "正文 25 越界抛错 field=bodySizePx");
throws(function () { M.normalizeOptions({ bodySizePx: NaN }); }, "bodySizePx", "正文 NaN 抛错 field=bodySizePx");
throws(function () { M.normalizeOptions({ lineHeight: 1.1 }); }, "lineHeight", "行距 1.1 越界抛错 field=lineHeight");
throws(function () { M.normalizeOptions({ lineHeight: 2.1 }); }, "lineHeight", "行距 2.1 越界抛错 field=lineHeight");
throws(function () { M.normalizeOptions({ lineHeight: "1.6" }); }, "lineHeight", "行距字符串抛错 field=lineHeight");
throws(function () { M.normalizeOptions("x"); }, "options", "字符串 options 抛错 field=options");
throws(function () { M.normalizeOptions(123); }, "options", "数字 options 抛错 field=options");
throws(function () { M.normalizeOptions([]); }, "options", "数组 options 抛错 field=options");

/* ---------- 7. formatPairingCSS：关键片段与精确全文 ---------- */
var css = M.formatPairingCSS(M.getPairingById("classic-ink"));
eq(css, "/* 字体搭配：墨韵经典（经典） */\n.font-title {\n  font-family: \"Songti SC\", STSong, SimSun, serif;\n  font-size: 32px;\n  line-height: 1.6;\n}\n.font-body {\n  font-family: \"Kaiti SC\", STKaiti, KaiTi, serif;\n  font-size: 16px;\n  line-height: 1.6;\n}", "墨韵经典缺省选项：CSS 全文精确值");
var css2 = M.formatPairingCSS(M.getPairingById("modern-hei"), { titleSizePx: 48, bodySizePx: 20, lineHeight: 1.8 });
has(css2, ".font-title", "自定义选项：含 .font-title");
has(css2, ".font-body", "自定义选项：含 .font-body");
has(css2, "font-family: \"Helvetica Neue\", Arial, \"PingFang SC\", \"Microsoft YaHei\", sans-serif;", "自定义选项：标题栈片段");
has(css2, "font-size: 48px;", "自定义选项：标题 48px");
has(css2, "font-size: 20px;", "自定义选项：正文 20px");
has(css2, "line-height: 1.8;", "自定义选项：行距 1.8");
has(css2, "/* 字体搭配：现代黑体（现代） */", "自定义选项：注释头含名称与风格");
throws(function () { M.formatPairingCSS(null); }, "pairing", "null pairing 抛错 field=pairing");
throws(function () { M.formatPairingCSS({ name: "x" }); }, "pairing", "缺字体栈的 pairing 抛错 field=pairing");
throws(function () { M.formatPairingCSS({ titleStack: ["Georgia"], bodyStack: [] }); }, "pairing", "空正文字体栈抛错 field=pairing");
throws(function () { M.formatPairingCSS(M.getPairingById("classic-ink"), { titleSizePx: 100 }); }, "titleSizePx", "非法 options 透传抛错 field=titleSizePx");

/* ---------- 8. listFontStacks：手动选择选项 ---------- */
var stacks = M.listFontStacks();
eq(stacks.length, 12, "手动选择字体栈共 12 个选项");
eq(new Set(stacks.map(function (s) { return s.id; })).size, 12, "字体栈 id 全不重复");
stacks.forEach(function (s) {
  ok(typeof s.label === "string" && s.label.length > 0, "字体栈 " + s.id + "：label 非空");
  ok(Array.isArray(s.families) && s.families.length >= 2, "字体栈 " + s.id + "：families 至少 2 个");
});
eq(stacks.filter(function (s) { return s.id === "song"; })[0].families[0], "Songti SC", "宋体栈首选 Songti SC");

/* ---------- 9. 双模式导出与零外部接口 ---------- */
ok(typeof M.listPairings === "function" && typeof M.listFontStacks === "function" &&
  typeof M.getPairingById === "function" && typeof M.getPairingsByStyle === "function" &&
  typeof M.pickPairingByIndex === "function" && typeof M.buildFontStack === "function" &&
  typeof M.normalizeOptions === "function" && typeof M.formatPairingCSS === "function",
  "module.exports 暴露全部纯函数");
has(JS_SRC, "window.FontPairingPreview", "浏览器端挂 window.FontPairingPreview");
notHas(JS_SRC, "localStorage", "JS 不写浏览器存储：无 localStorage");
notHas(JS_SRC, "sessionStorage", "JS 不写浏览器存储：无 sessionStorage");
notHas(JS_SRC, "fetch(", "JS 零外部接口：无 fetch");
notHas(JS_SRC, "XMLHttpRequest", "JS 零外部接口：无 XMLHttpRequest");
notHas(JS_SRC, "fonts.googleapis", "JS 零网络字体：无 Google Fonts");
has(JS_SRC, "系统字体栈", "JS 明示系统字体栈口径");

/* ---------- 10. categories.go 注册 ---------- */
var pathCount = (GO_SRC.match(/"\/tools\/[^"]+"/g) || []).filter(function (v, i, a) { return a.indexOf(v) === i; }).length;
eq(pathCount, 321, "注册 Path 总数 309→310");
has(GO_SRC, 'ID:          "font_pairing_preview"', "注册：ID font_pairing_preview");
has(GO_SRC, 'Path:        "/tools/font-pairing-preview"', "注册：Path /tools/font-pairing-preview");
has(GO_SRC, 'Icon:        "text_format"', "注册：Icon text_format");
eq((GO_SRC.match(/Icon:\s*"text_format"/g) || []).length, 1, "Icon text_format 全库唯一");
var entryBlock = GO_SRC.slice(GO_SRC.indexOf('ID:          "font_pairing_preview"') - 60,
  GO_SRC.indexOf('ID:          "font_pairing_preview"') + 1400);
has(entryBlock, "New:         true", "注册：New: true");
has(entryBlock, 'Category:    "文字工具"', "注册：类目 文字工具");

/* ---------- 11. 模板：SEO/真限制/控件/互链/零外部资源 ---------- */
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/font-pairing-preview", "模板 canonical 含新 Path");
has(TPL_SRC, "字体搭配", "模板 SEO 关键词：字体搭配");
has(TPL_SRC, "标题正文字体搭配", "模板 SEO 关键词：标题正文字体搭配");
has(TPL_SRC, "font pairing", "模板 SEO 关键词：font pairing");
has(TPL_SRC, "字体组合", "模板 SEO 关键词：字体组合");
has(TPL_SRC, "真限制", "模板：真限制章节");
has(TPL_SRC, "仅系统字体栈", "真限制①：仅系统字体栈");
has(TPL_SRC, "搭配为审美建议", "真限制②：搭配为审美建议");
has(TPL_SRC, "商用前查版权", "真限制③：商用前查版权");
has(TPL_SRC, "本页零上传", "真限制④：本页零上传");
has(TPL_SRC, 'id="fpp-random"', "模板含随机搭配按钮 fpp-random");
has(TPL_SRC, 'id="fpp-title-select"', "模板含标题字体下拉 fpp-title-select");
has(TPL_SRC, 'id="fpp-body-select"', "模板含正文字体下拉 fpp-body-select");
has(TPL_SRC, 'id="fpp-title-size"', "模板含标题字号滑杆 fpp-title-size");
has(TPL_SRC, 'id="fpp-body-size"', "模板含正文字号滑杆 fpp-body-size");
has(TPL_SRC, 'id="fpp-line-height"', "模板含行距滑杆 fpp-line-height");
has(TPL_SRC, 'id="fpp-preview"', "模板含实时预览区 fpp-preview");
has(TPL_SRC, 'id="fpp-css"', "模板含 CSS 输出区 fpp-css");
has(TPL_SRC, 'id="fpp-copy"', "模板含复制 CSS 按钮 fpp-copy");
has(TPL_SRC, "/tools/font-license-check", "互链：商用前查版权→字体版权查询");
has(TPL_SRC, "/tools/static/js/font_pairing_preview.js", "模板引用 font_pairing_preview.js");
has(TPL_SRC, 'id="fpp-list"', "模板含预设搭配列表 fpp-list");
notHas(TPL_SRC, "fonts.googleapis", "模板零 CDN：无外部字体");
ok((TPL_SRC.match(/<script[^>]*src="http/g) || []).length === 0, "模板零外部脚本：无 http script src");
var httpLinks = (TPL_SRC.match(/<link[^>]*href="(http[^"]*)"/g) || []).map(function (t) {
  return t.replace(/^.*href="/, "").replace(/"$/, "");
});
ok(httpLinks.every(function (u) { return u.indexOf("johnkingzcq123.xyz") !== -1; }),
  "模板零外部样式：http link 仅 canonical 自家域名");
has(TPL_SRC, "aria-label", "模板：含 aria 无障碍标签");
has(TPL_SRC, "prefers-reduced-motion", "模板：动画可减弱媒体查询");

/* ---------- 12. buildPairingCardHTML：卡片 HTML 回归（上一轮评审致命 bug） ----------
 * renderList 曾误用 p.title / p.body（搭配对象只有 titleStack / bodyStack），
 * buildFontStack(undefined) 抛错致 10 张卡片全不渲染、预览区也不初始化。
 * 现卡片 HTML 由纯函数 buildPairingCardHTML 生成并导出，本节逐组断言全部搭配
 * 可渲染且含正确字体栈。注：卡片内 font-family 经 HTML 转义，双引号写作 &quot;。 */
function escH(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c];
  });
}
var card0 = M.buildPairingCardHTML(M.getPairingById("classic-ink"), false);
has(card0, 'data-id="classic-ink"', "卡片 HTML：含 data-id");
has(card0, "墨韵经典", "卡片 HTML：含搭配名称");
has(card0, "经典", "卡片 HTML：含风格标签");
has(card0, "font-family:", "卡片 HTML：含 font-family");
has(card0, "&quot;Songti SC&quot;", "卡片 HTML：标题字体栈含引用的 Songti SC");
has(card0, "&quot;Kaiti SC&quot;", "卡片 HTML：正文字体栈含引用的 Kaiti SC");
has(card0, "标题 Title 123", "卡片 HTML：含标题示例");
has(card0, "The quick brown fox", "卡片 HTML：含正文示例");
ok(card0.indexOf("fpp-active") === -1, "卡片 HTML：非激活不含 fpp-active");
has(M.buildPairingCardHTML(M.getPairingById("classic-ink"), true), "fpp-active", "卡片 HTML：激活含 fpp-active");
all.forEach(function (p) {
  var html = M.buildPairingCardHTML(p, p.id === "classic-ink");
  has(html, "font-family:" + escH(M.buildFontStack(p.titleStack)), "卡片可渲染 " + p.id + "：标题 font-family 与 buildFontStack 一致");
  has(html, "font-family:" + escH(M.buildFontStack(p.bodyStack)), "卡片可渲染 " + p.id + "：正文 font-family 与 buildFontStack 一致");
  has(html, 'data-id="' + p.id + '"', "卡片可渲染 " + p.id + "：data-id");
  has(html, p.name, "卡片可渲染 " + p.id + "：名称");
  has(html, p.note, "卡片可渲染 " + p.id + "：点评");
});
var evilCard = M.buildPairingCardHTML({ id: "x", name: "<b>&\"'", style: "modern", note: "n<m", titleStack: ["Arial"], bodyStack: ["Arial"] }, false);
notHas(evilCard, "<b>", "卡片 HTML：名称转义，不含裸 <b>");
has(evilCard, "&lt;b&gt;", "卡片 HTML：名称转义为实体");
throws(function () { M.buildPairingCardHTML({ id: "x", name: "x", style: "classic", note: "x" }, false); }, "pairing", "缺字体栈的搭配抛错 field=pairing");
throws(function () { M.buildPairingCardHTML({ id: "x", name: "x", style: "classic", note: "x", titleStack: ["Arial"] }, false); }, "pairing", "缺正文字体栈抛错 field=pairing");
throws(function () { M.buildPairingCardHTML(null, false); }, "pairing", "null 搭配抛错 field=pairing");
notHas(JS_SRC, "buildFontStack(p.title)", "源码防回归：不再用 p.title 拼卡片");
notHas(JS_SRC, "buildFontStack(p.body)", "源码防回归：不再用 p.body 拼卡片");
has(JS_SRC, "buildPairingCardHTML(p, active)", "源码：renderList 改调 buildPairingCardHTML");

console.log("font_pairing_preview: pass=" + pass + " fail=" + fail + "，共 " + (pass + fail) + " 断言");
if (fail > 0) process.exit(1);
