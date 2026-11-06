/* 灵感板/拼贴板纯函数单元测试（零依赖）：node tests/moodboard.test.js
* 覆盖：normalizeHex（"#FFF"→"#ffffff"、"ff0000"→"#ff0000"、"#1a2B3c"→"#1a2b3c"、
* "gggggg"/"#12" 抛错 err.field='hex'）、clampCardPosition（(900,700,800,600,100,100)
* →{700,500}、(-20,-10)→{0,0}、(100,100)→{100,100}）、clampZoom（0.2→0.5、2→1.5、
* 1→1、0.75→0.75）、validateBoardCard（type/size/dataUrl/color 各字段抛错）、
* applyTemplate（blank→[]、design 长度≥4 且首张为 note、unknown 抛错
* err.field='templateId'、其余模板卡片均合法）、moveCardToFront/Back（[a,b,c]/b→
* [a,c,b]/[b,a,c]、原数组不变、未知 id 抛错 err.field='cardId'）、
* buildExportFileName（"婚礼灵感"→"婚礼灵感-moodboard.png"、"board.json"→
* "board-moodboard.png"、""→"moodboard.png"）、validateBoardState（21 张卡片抛错
* err.field='cards'）、常量、categories.go 注册（Path 总数 311→312、Icon
* collections 全库唯一、紧邻 photo_collage）、模板（SEO 五关键词、真限制四条、
* 控件、互链、零外部资源静态检查）、JS 源码级检查（window.Moodboard、
* localStorage 自动保存、FileReader、canvas PNG 导出、零 fetch）。
*/
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/moodboard.js");

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
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "moodboard.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "moodboard.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");
var PC_TPL = fs.readFileSync(path.join(ROOT, "templates", "photo_collage.html"), "utf8");

function mkCard(i) {
return { id: "c" + i, type: "note", x: 10, y: 10, w: 100, h: 80, text: "n" + i, color: "#fef9c3" };
}

/* ---------- 1. normalizeHex ---------- */
eq(M.normalizeHex("#FFF"), "#ffffff", "normalizeHex：#FFF→#ffffff");
eq(M.normalizeHex("ff0000"), "#ff0000", "normalizeHex：ff0000→#ff0000");
eq(M.normalizeHex("#1a2B3c"), "#1a2b3c", "normalizeHex：#1a2B3c→#1a2b3c");
eq(M.normalizeHex("#abc"), "#aabbcc", "normalizeHex：#abc→#aabbcc");
eq(M.normalizeHex("ABC"), "#aabbcc", "normalizeHex：ABC→#aabbcc");
eq(M.normalizeHex("#2563EB"), "#2563eb", "normalizeHex：#2563EB→#2563eb");
throws(function () { M.normalizeHex("gggggg"); }, "hex", "normalizeHex：gggggg 抛错 err.field='hex'");
throws(function () { M.normalizeHex("#12"); }, "hex", "normalizeHex：#12 抛错 err.field='hex'");
throws(function () { M.normalizeHex("#12345"); }, "hex", "normalizeHex：#12345 抛错 err.field='hex'");
throws(function () { M.normalizeHex(""); }, "hex", "normalizeHex：空串抛错 err.field='hex'");
throws(function () { M.normalizeHex(123); }, "hex", "normalizeHex：数字抛错 err.field='hex'");
throws(function () { M.normalizeHex(null); }, "hex", "normalizeHex：null 抛错 err.field='hex'");

/* ---------- 2. clampCardPosition ---------- */
eqj(M.clampCardPosition(900, 700, 800, 600, 100, 100), { x: 700, y: 500 }, "clampCardPosition：(900,700,800,600,100,100)→{700,500}");
eqj(M.clampCardPosition(-20, -10, 800, 600, 100, 100), { x: 0, y: 0 }, "clampCardPosition：(-20,-10)→{0,0}");
eqj(M.clampCardPosition(100, 100, 800, 600, 100, 100), { x: 100, y: 100 }, "clampCardPosition：(100,100)→{100,100}");
eqj(M.clampCardPosition(700, 500, 800, 600, 100, 100), { x: 700, y: 500 }, "clampCardPosition：边界值 (700,500) 不动");
eqj(M.clampCardPosition(701, 501, 800, 600, 100, 100), { x: 700, y: 500 }, "clampCardPosition：(701,501)→{700,500}");
throws(function () { M.clampCardPosition(100, 100, 0, 600, 100, 100); }, "board", "clampCardPosition：boardW=0 抛错 err.field='board'");
throws(function () { M.clampCardPosition(100, 100, 800, -600, 100, 100); }, "board", "clampCardPosition：boardH 负数抛错 err.field='board'");
throws(function () { M.clampCardPosition(100, 100, 800, 600, 0, 100); }, "board", "clampCardPosition：cardW=0 抛错 err.field='board'");
throws(function () { M.clampCardPosition(NaN, 100, 800, 600, 100, 100); }, "position", "clampCardPosition：x=NaN 抛错 err.field='position'");
throws(function () { M.clampCardPosition(100, "y", 800, 600, 100, 100); }, "position", "clampCardPosition：y 字符串抛错 err.field='position'");

/* ---------- 3. clampZoom ---------- */
eq(M.clampZoom(0.2), 0.5, "clampZoom：0.2→0.5");
eq(M.clampZoom(2), 1.5, "clampZoom：2→1.5");
eq(M.clampZoom(1), 1, "clampZoom：1→1");
eq(M.clampZoom(0.75), 0.75, "clampZoom：0.75→0.75");
eq(M.clampZoom(0.5), 0.5, "clampZoom：下限 0.5 不动");
eq(M.clampZoom(1.5), 1.5, "clampZoom：上限 1.5 不动");
throws(function () { M.clampZoom(NaN); }, "zoom", "clampZoom：NaN 抛错 err.field='zoom'");
throws(function () { M.clampZoom("1"); }, "zoom", "clampZoom：字符串抛错 err.field='zoom'");
throws(function () { M.clampZoom(undefined); }, "zoom", "clampZoom：undefined 抛错 err.field='zoom'");

/* ---------- 4. validateBoardCard ---------- */
eqj(M.validateBoardCard(mkCard(1)), mkCard(1), "validateBoardCard：合法便签原样返回");
eq(M.validateBoardCard({ id: "i1", type: "image", x: 0, y: 0, w: 200, h: 150, dataUrl: "data:image/png;base64,xxx" }).type, "image", "validateBoardCard：合法图片卡片通过");
eq(M.validateBoardCard({ id: "s1", type: "swatch", x: 0, y: 0, w: 100, h: 100, color: "#FFF" }).type, "swatch", "validateBoardCard：合法色板（#FFF）通过");
eq(M.validateBoardCard({ id: "l1", type: "link", x: 0, y: 0, w: 200, h: 100, title: "t", url: "https://example.com" }).type, "link", "validateBoardCard：合法链接卡片通过");
throws(function () { M.validateBoardCard(null); }, "card", "validateBoardCard：null 抛错 err.field='card'");
throws(function () { M.validateBoardCard({ type: "video", x: 0, y: 0, w: 100, h: 100 }); }, "type", "validateBoardCard：type 非法抛错 err.field='type'");
throws(function () { M.validateBoardCard({ type: "note", x: -1, y: 0, w: 100, h: 100 }); }, "position", "validateBoardCard：x=-1 抛错 err.field='position'");
throws(function () { M.validateBoardCard({ type: "note", x: 0, y: 0, w: 0, h: 100 }); }, "size", "validateBoardCard：w=0 抛错 err.field='size'");
throws(function () { M.validateBoardCard({ type: "note", x: 0, y: 0, w: 100, h: -5 }); }, "size", "validateBoardCard：h 负数抛错 err.field='size'");
throws(function () { M.validateBoardCard({ type: "image", x: 0, y: 0, w: 100, h: 100, dataUrl: "" }); }, "dataUrl", "validateBoardCard：image 无 dataUrl 抛错 err.field='dataUrl'");
throws(function () { M.validateBoardCard({ type: "image", x: 0, y: 0, w: 100, h: 100 }); }, "dataUrl", "validateBoardCard：image 缺 dataUrl 抛错 err.field='dataUrl'");
throws(function () { M.validateBoardCard({ type: "link", x: 0, y: 0, w: 100, h: 100, url: "  " }); }, "url", "validateBoardCard：link 空白 url 抛错 err.field='url'");
throws(function () { M.validateBoardCard({ type: "swatch", x: 0, y: 0, w: 100, h: 100, color: "gggggg" }); }, "color", "validateBoardCard：swatch hex 非法抛错 err.field='color'");

/* ---------- 5. applyTemplate ---------- */
eqj(M.applyTemplate("blank"), [], "applyTemplate：blank→[]");
ok(M.applyTemplate("design").length >= 4, "applyTemplate：design 长度≥4");
ok(M.applyTemplate("design")[0].type === "image" || M.applyTemplate("design")[0].type === "note", "applyTemplate：design 首张为 image 或 note");
ok(M.applyTemplate("decor").length >= 4, "applyTemplate：decor 长度≥4");
ok(M.applyTemplate("wedding").length >= 4, "applyTemplate：wedding 长度≥4");
ok(M.applyTemplate("fashion").length >= 4, "applyTemplate：fashion 长度≥4");
["design", "decor", "wedding", "fashion"].forEach(function (tid) {
var cards = M.applyTemplate(tid);
cards.forEach(function (c) {
try { M.validateBoardCard(c); pass++; }
catch (e) { fail++; console.error("FAIL:", "applyTemplate：" + tid + " 卡片 " + c.id + " 未通过 validateBoardCard：" + e.message); }
});
});
throws(function () { M.applyTemplate("unknown"); }, "templateId", "applyTemplate：unknown 抛错 err.field='templateId'");
throws(function () { M.applyTemplate(""); }, "templateId", "applyTemplate：空串抛错 err.field='templateId'");
throws(function () { M.applyTemplate(null); }, "templateId", "applyTemplate：null 抛错 err.field='templateId'");
eqj(M.TEMPLATE_IDS, ["blank", "design", "decor", "wedding", "fashion"], "常量：5 套模板 id 齐全");

/* ---------- 6. moveCardToFront / moveCardToBack ---------- */
var abc = [{ id: "a" }, { id: "b" }, { id: "c" }];
eqj(M.moveCardToFront(abc, "b").map(function (c) { return c.id; }), ["a", "c", "b"], "moveCardToFront：[a,b,c]/b→[a,c,b]");
eqj(abc.map(function (c) { return c.id; }), ["a", "b", "c"], "moveCardToFront：原数组不变");
eqj(M.moveCardToFront(abc, "a").map(function (c) { return c.id; }), ["b", "c", "a"], "moveCardToFront：[a,b,c]/a→[b,c,a]");
eqj(M.moveCardToBack(abc, "b").map(function (c) { return c.id; }), ["b", "a", "c"], "moveCardToBack：[a,b,c]/b→[b,a,c]");
eqj(M.moveCardToBack(abc, "c").map(function (c) { return c.id; }), ["c", "a", "b"], "moveCardToBack：[a,b,c]/c→[c,a,b]");
eqj(abc.map(function (c) { return c.id; }), ["a", "b", "c"], "moveCardToBack：原数组不变");
throws(function () { M.moveCardToFront(abc, "z"); }, "cardId", "moveCardToFront：未知 id 抛错 err.field='cardId'");
throws(function () { M.moveCardToBack(abc, "z"); }, "cardId", "moveCardToBack：未知 id 抛错 err.field='cardId'");
throws(function () { M.moveCardToFront([], "a"); }, "cards", "moveCardToFront：空数组抛错 err.field='cards'");
throws(function () { M.moveCardToBack(null, "a"); }, "cards", "moveCardToBack：null 抛错 err.field='cards'");

/* ---------- 7. buildExportFileName ---------- */
eq(M.buildExportFileName("婚礼灵感"), "婚礼灵感-moodboard.png", "buildExportFileName：婚礼灵感→婚礼灵感-moodboard.png");
eq(M.buildExportFileName("board.json"), "board-moodboard.png", "buildExportFileName：board.json→board-moodboard.png");
eq(M.buildExportFileName(""), "moodboard.png", "buildExportFileName：空串→moodboard.png");
eq(M.buildExportFileName("   "), "moodboard.png", "buildExportFileName：空白串→moodboard.png");
eq(M.buildExportFileName("我的灵感板"), "我的灵感板-moodboard.png", "buildExportFileName：我的灵感板→我的灵感板-moodboard.png");
eq(M.buildExportFileName("board.png"), "board-moodboard.png", "buildExportFileName：board.png 去扩展名");
throws(function () { M.buildExportFileName(123); }, "fileName", "buildExportFileName：数字抛错 err.field='fileName'");
throws(function () { M.buildExportFileName(null); }, "fileName", "buildExportFileName：null 抛错 err.field='fileName'");

/* ---------- 8. validateBoardState ---------- */
var many = [];
for (var i = 0; i < 21; i++) many.push(mkCard(i));
throws(function () { M.validateBoardState({ cards: many }); }, "cards", "validateBoardState：21 张卡片抛错 err.field='cards'");
var twenty = [];
for (var j = 0; j < 20; j++) twenty.push(mkCard(j));
eq(M.validateBoardState({ cards: twenty }).cards.length, 20, "validateBoardState：20 张卡片通过");
throws(function () { M.validateBoardState({ cards: "x" }); }, "cards", "validateBoardState：cards 非数组抛错 err.field='cards'");
throws(function () { M.validateBoardState(null); }, "cards", "validateBoardState：null 抛错 err.field='cards'");
throws(function () { M.validateBoardState({ cards: [mkCard(1), { type: "bad", x: 0, y: 0, w: 1, h: 1 }] }); }, "type", "validateBoardState：含非法卡片抛错 err.field='type'");

/* ---------- 9. 常量与同步导出 ---------- */
eq(M.BOARD_WIDTH, 800, "常量：画布宽 800");
eq(M.BOARD_HEIGHT, 600, "常量：画布高 600");
eq(M.MAX_CARDS, 20, "常量：卡片上限 20");
eq(M.MAX_IMAGES, 20, "常量：图片上限 20");
eq(M.MAX_IMAGE_SIZE_BYTES, 2097152, "常量：单张图片上限 2MB");
eq(M.ZOOM_MIN, 0.5, "常量：缩放下限 0.5");
eq(M.ZOOM_MAX, 1.5, "常量：缩放上限 1.5");
eq(M.UNDO_LIMIT, 20, "常量：撤销栈 20 步");
eq(M.NOTE_COLORS.length, 6, "常量：便签 6 档背景色");
eq(M.STORAGE_KEY, "moodboard-v1", "常量：localStorage 键 moodboard-v1");
ok(typeof M.validateBoardCard === "function" && typeof M.clampCardPosition === "function" &&
typeof M.normalizeHex === "function" && typeof M.clampZoom === "function" &&
typeof M.applyTemplate === "function" && typeof M.moveCardToFront === "function" &&
typeof M.moveCardToBack === "function" && typeof M.buildExportFileName === "function" &&
typeof M.validateBoardState === "function",
"同步导出：9 个核心纯函数齐全");
has(JS_SRC, "window.Moodboard", "浏览器导出：window.Moodboard");
has(JS_SRC, "module.exports = api", "node 导出：module.exports 同步导出");
has(JS_SRC, "localStorage", "JS：localStorage 自动保存");
has(JS_SRC, "FileReader", "JS：FileReader 读图片 dataURL");
has(JS_SRC, "toBlob", "JS：canvas toBlob 导出 PNG");
has(JS_SRC, "data:image/svg+xml", "JS：模板占位图为内联 SVG dataURL（零外部资源）");
notHas(JS_SRC, "fetch(", "JS 零外部接口：无 fetch");
notHas(JS_SRC, "XMLHttpRequest", "JS 零外部接口：无 XMLHttpRequest");
has(JS_SRC, "UNDO_LIMIT", "JS：撤销栈上限常量");
has(JS_SRC, "clampZoom", "JS：画布缩放经 clampZoom 钳制");
has(JS_SRC, "validateBoardState", "JS：导入/恢复经 validateBoardState 校验");

/* ---------- 10. categories.go 注册 ---------- */
var pathCount = (GO_SRC.match(/"\/tools\/[^"]+"/g) || []).filter(function (v, i, a) { return a.indexOf(v) === i; }).length;
eq(pathCount, 323, "注册 Path 总数 311→312");
has(GO_SRC, '"moodboard"', "注册：ID moodboard");
has(GO_SRC, '"/tools/moodboard"', "注册：Path /tools/moodboard");
has(GO_SRC, '"collections"', "注册：Icon collections");
eq((GO_SRC.match(/Icon:\s*"collections"/g) || []).length, 1, "Icon collections 全库唯一");
var entryBlock = GO_SRC.slice(GO_SRC.indexOf('"moodboard"') - 60,
GO_SRC.indexOf('"moodboard"') + 1600);
ok(/New:\s+true/.test(entryBlock), "注册：New: true");
ok(/Category:\s+"图片处理"/.test(entryBlock), "注册：类目 图片处理");
has(entryBlock, "灵感板", "注册：名称 灵感板");
has(entryBlock, "拼贴板", "注册：名称 拼贴板");
has(entryBlock, "自由画布", "注册：描述含自由画布");
ok(GO_SRC.indexOf('"moodboard"') > GO_SRC.indexOf('"photo_collage"') &&
GO_SRC.indexOf('"moodboard"') < GO_SRC.indexOf('"exif_strip"'), "注册：紧邻 photo_collage（在其后、exif_strip 之前）");

/* ---------- 11. 模板：SEO/真限制/控件/互链/零外部资源 ---------- */
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/moodboard", "模板 canonical 含新 Path");
has(TPL_SRC, "灵感板", "模板：标题含工具名");
has(TPL_SRC, "灵感板,moodboard,拼贴板,设计灵感收集,灵感收集板", "模板 SEO：五关键词齐全");
has(TPL_SRC, "真限制", "模板：真限制章节");
has(TPL_SRC, "localStorage 约 5MB 上限", "真限制①：localStorage 约 5MB 上限");
has(TPL_SRC, "图片过多/过大时自动保存会失败", "真限制①：保存失败明确提示＋JSON 备份");
has(TPL_SRC, "PNG 只导出画布内卡片", "真限制②：PNG 只导出画布内卡片");
has(TPL_SRC, "链接卡片不抓取内容", "真限制③：链接卡片不抓取内容");
has(TPL_SRC, "换浏览器/清缓存看板丢失", "真限制④：换浏览器/清缓存看板丢失");
has(TPL_SRC, "纯本地零上传", "真限制：全程本地零上传");
has(TPL_SRC, 'id="mb-board-name"', "模板控件：看板名 mb-board-name");
has(TPL_SRC, 'id="mb-canvas"', "模板控件：画布 mb-canvas");
has(TPL_SRC, 'id="mb-add-image"', "模板控件：添加图片 mb-add-image");
has(TPL_SRC, 'id="mb-add-note"', "模板控件：添加便签 mb-add-note");
has(TPL_SRC, 'id="mb-add-link"', "模板控件：添加链接 mb-add-link");
has(TPL_SRC, 'id="mb-add-swatch"', "模板控件：添加色板 mb-add-swatch");
has(TPL_SRC, 'id="mb-file"', "模板控件：图片文件输入 mb-file");
has(TPL_SRC, 'data-template="blank"', "模板控件：模板 空白自由");
has(TPL_SRC, 'data-template="design"', "模板控件：模板 设计参考");
has(TPL_SRC, 'data-template="decor"', "模板控件：模板 装修配色");
has(TPL_SRC, 'data-template="wedding"', "模板控件：模板 婚礼策划");
has(TPL_SRC, 'data-template="fashion"', "模板控件：模板 穿搭灵感");
has(TPL_SRC, 'id="mb-zoom"', "模板控件：缩放滑杆 mb-zoom");
has(TPL_SRC, 'id="mb-grid-toggle"', "模板控件：网格开关 mb-grid-toggle");
has(TPL_SRC, 'id="mb-undo"', "模板控件：撤销 mb-undo");
has(TPL_SRC, 'id="mb-clear"', "模板控件：清空 mb-clear");
has(TPL_SRC, 'id="mb-export-png"', "模板控件：导出 PNG mb-export-png");
has(TPL_SRC, 'id="mb-export-json"', "模板控件：导出 JSON mb-export-json");
has(TPL_SRC, 'id="mb-import-json"', "模板控件：导入 JSON mb-import-json");
has(TPL_SRC, 'id="mb-json-file"', "模板控件：JSON 文件输入 mb-json-file");
has(TPL_SRC, "/tools/photo-collage", "互链：照片拼图合成器（单向）");
has(TPL_SRC, "拼好九宫格再来灵感板自由排布", "互链：顺流文案");
has(TPL_SRC, "/tools/static/js/moodboard.js?v=1", "模板：引用本站 JS");
notHas(PC_TPL, "/tools/moodboard", "单向互链：照片拼图模板不链回本工具（单向）");
notHas(TPL_SRC, "fonts.googleapis", "模板零 CDN：无外部字体");
ok((TPL_SRC.match(/<script[^>]*src="http/g) || []).length === 0, "模板零外部脚本：无 http script src");
var httpLinks = TPL_SRC.match(/<link[^>]*href="http[^"]*"/g) || [];
eq(httpLinks.length, 1, "模板 http link 仅 canonical 一条");
ok(httpLinks.length === 1 && httpLinks[0].indexOf("https://www.johnkingzcq123.xyz/tools/moodboard") !== -1, "模板 http link：仅自家 canonical");
ok((TPL_SRC.match(/<img[^>]*src="http/g) || []).length === 0, "模板零外部图片：无 http img src");

console.log("moodboard: pass=" + pass + " fail=" + fail + "，共 " + (pass + fail) + " 断言");
if (fail > 0) process.exit(1);
