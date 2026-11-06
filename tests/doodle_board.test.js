/* 网页涂鸦画板纯逻辑单元测试（零依赖）：node tests/doodle_board.test.js
 * 覆盖：hexToRgb / rectFromPoints / radiusFrom / arrowGeometry /
 * clampBrushSize / pushHistory / serializeDoc↔parseDoc / sanitizeFileName
 * 精确值向量与 err.field 全覆盖，以及注册与零网络请求静态检查。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/doodle_board.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function jeq(a, b, name) { eq(JSON.stringify(a), JSON.stringify(b), name); }
function throws(fn, field, name) {
  try { fn(); ok(false, name + "（应抛错却未抛）"); }
  catch (e) { ok(!field || e.field === field, name + "（err.field 期望 " + field + "，实得 " + e.field + "）"); }
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "doodle_board.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "doodle_board.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. hexToRgb：精确值与非法 ---------- */
jeq(M.hexToRgb("#ff0000"), { r: 255, g: 0, b: 0 }, "hexToRgb #ff0000 精确值");
jeq(M.hexToRgb("#00ff00"), { r: 0, g: 255, b: 0 }, "hexToRgb #00ff00 精确值");
jeq(M.hexToRgb("#0000FF"), { r: 0, g: 0, b: 255 }, "hexToRgb 大写 #0000FF");
jeq(M.hexToRgb("#f00"), { r: 255, g: 0, b: 0 }, "hexToRgb 3 位简写 #f00");
jeq(M.hexToRgb("#0F0"), { r: 0, g: 255, b: 0 }, "hexToRgb 3 位简写大写 #0F0");
jeq(M.hexToRgb(" #abc "), { r: 170, g: 187, b: 204 }, "hexToRgb 首尾空白容忍");
throws(function () { M.hexToRgb("red"); }, "color", "hexToRgb 颜色名非法");
throws(function () { M.hexToRgb("#ff"); }, "color", "hexToRgb 2 位非法");
throws(function () { M.hexToRgb("#ffff"); }, "color", "hexToRgb 4 位非法");
throws(function () { M.hexToRgb("#gggggg"); }, "color", "hexToRgb 非法字符");
throws(function () { M.hexToRgb("ff0000"); }, "color", "hexToRgb 缺 # 非法");
throws(function () { M.hexToRgb(""); }, "color", "hexToRgb 空串非法");
throws(function () { M.hexToRgb(123); }, "color", "hexToRgb 非字符串非法");
throws(function () { M.hexToRgb(null); }, "color", "hexToRgb null 非法");

/* ---------- 2. rectFromPoints：任意拖拽方向归一化 ---------- */
jeq(M.rectFromPoints({ x: 10, y: 20 }, { x: 50, y: 80 }),
  { x: 10, y: 20, w: 40, h: 60 }, "rectFromPoints 左上→右下");
jeq(M.rectFromPoints({ x: 50, y: 80 }, { x: 10, y: 20 }),
  { x: 10, y: 20, w: 40, h: 60 }, "rectFromPoints 右下→左上反向拖拽");
jeq(M.rectFromPoints({ x: 50, y: 20 }, { x: 10, y: 80 }),
  { x: 10, y: 20, w: 40, h: 60 }, "rectFromPoints 右上→左下对角");
jeq(M.rectFromPoints({ x: 10, y: 80 }, { x: 50, y: 20 }),
  { x: 10, y: 20, w: 40, h: 60 }, "rectFromPoints 左下→右上对角");
jeq(M.rectFromPoints({ x: 5, y: 5 }, { x: 5, y: 5 }),
  { x: 5, y: 5, w: 0, h: 0 }, "rectFromPoints 零尺寸点");
jeq(M.rectFromPoints({ x: -10, y: -5 }, { x: 10, y: 15 }),
  { x: -10, y: -5, w: 20, h: 20 }, "rectFromPoints 负坐标");
throws(function () { M.rectFromPoints({ x: "a", y: 0 }, { x: 1, y: 1 }); }, "point", "rectFromPoints 非数字坐标");
throws(function () { M.rectFromPoints(null, { x: 1, y: 1 }); }, "point", "rectFromPoints null 点");

/* ---------- 3. radiusFrom ---------- */
eq(M.radiusFrom({ x: 0, y: 0 }, { x: 3, y: 4 }), 5, "radiusFrom 3-4-5 三角形");
eq(M.radiusFrom({ x: 1, y: 1 }, { x: 1, y: 1 }), 0, "radiusFrom 同点半径 0");
eq(M.radiusFrom({ x: -1, y: -1 }, { x: 2, y: 3 }), 5, "radiusFrom 负坐标");
throws(function () { M.radiusFrom({ x: 0, y: 0 }, { x: "a", y: 0 }); }, "point", "radiusFrom 非数字抛错");
throws(function () { M.radiusFrom({ x: NaN, y: 0 }, { x: 1, y: 1 }); }, "point", "radiusFrom NaN 抛错");
throws(function () { M.radiusFrom(null, { x: 1, y: 1 }); }, "point", "radiusFrom null 点抛错");

/* ---------- 4. arrowGeometry：双翼坐标精确值与非法全覆盖 ---------- */
var t0 = { x: 0, y: 0 };
jeq(M.arrowGeometry(t0, { x: 100, y: 0 }, 15, Math.PI / 6),
  { wing1: { x: 87.01, y: 7.5 }, wing2: { x: 87.01, y: -7.5 } },
  "arrowGeometry 水平箭头双翼精确值");
jeq(M.arrowGeometry(t0, { x: 0, y: 100 }, 10, Math.PI / 4),
  { wing1: { x: -7.07, y: 92.93 }, wing2: { x: 7.07, y: 92.93 } },
  "arrowGeometry 垂直箭头双翼精确值");
throws(function () { M.arrowGeometry(t0, { x: 1, y: 1 }, 0, Math.PI / 6); }, "headLen", "arrowGeometry headLen=0");
throws(function () { M.arrowGeometry(t0, { x: 1, y: 1 }, -5, Math.PI / 6); }, "headLen", "arrowGeometry headLen 负值");
throws(function () { M.arrowGeometry(t0, { x: 1, y: 1 }, "10", Math.PI / 6); }, "headLen", "arrowGeometry headLen 非数字");
throws(function () { M.arrowGeometry(t0, { x: 1, y: 1 }, NaN, Math.PI / 6); }, "headLen", "arrowGeometry headLen NaN");
throws(function () { M.arrowGeometry(t0, { x: 1, y: 1 }, 10, 0); }, "headAngle", "arrowGeometry headAngle=0");
throws(function () { M.arrowGeometry(t0, { x: 1, y: 1 }, 10, Math.PI / 2); }, "headAngle", "arrowGeometry headAngle=π/2");
throws(function () { M.arrowGeometry(t0, { x: 1, y: 1 }, 10, -0.1); }, "headAngle", "arrowGeometry headAngle 负值");
throws(function () { M.arrowGeometry(t0, { x: 1, y: 1 }, 10, Math.PI); }, "headAngle", "arrowGeometry headAngle=π");
throws(function () { M.arrowGeometry(t0, { x: 1, y: 1 }, 10, "x"); }, "headAngle", "arrowGeometry headAngle 非数字");
throws(function () { M.arrowGeometry({ x: "a", y: 0 }, { x: 1, y: 1 }, 10, 0.5); }, "point", "arrowGeometry 非法起点");

/* ---------- 5. clampBrushSize：钳制边界与非数字 ---------- */
eq(M.clampBrushSize(0), 1, "clampBrushSize 0→1");
eq(M.clampBrushSize(-5), 1, "clampBrushSize 负值→1");
eq(M.clampBrushSize(1), 1, "clampBrushSize 下界 1 保持");
eq(M.clampBrushSize(100), 100, "clampBrushSize 上界 100 保持");
eq(M.clampBrushSize(150), 100, "clampBrushSize 150→100");
eq(M.clampBrushSize(1000), 100, "clampBrushSize 1000→100");
eq(M.clampBrushSize(25), 25, "clampBrushSize 区间内保持");
eq(M.clampBrushSize(2.5), 2.5, "clampBrushSize 小数保持");
throws(function () { M.clampBrushSize("20"); }, "size", "clampBrushSize 字符串抛错");
throws(function () { M.clampBrushSize(NaN); }, "size", "clampBrushSize NaN 抛错");
throws(function () { M.clampBrushSize(Infinity); }, "size", "clampBrushSize Infinity 抛错");
throws(function () { M.clampBrushSize(null); }, "size", "clampBrushSize null 抛错");
throws(function () { M.clampBrushSize(undefined); }, "size", "clampBrushSize undefined 抛错");

/* ---------- 6. pushHistory：追加/截断/非法 ---------- */
jeq(M.pushHistory([], { a: 1 }, 20), [{ a: 1 }], "pushHistory 空栈追加");
jeq(M.pushHistory([{ a: 1 }, { a: 2 }], { a: 3 }, 5),
  [{ a: 1 }, { a: 2 }, { a: 3 }], "pushHistory 未超限追加");
jeq(M.pushHistory([{ a: 1 }, { a: 2 }, { a: 3 }], { a: 4 }, 3),
  [{ a: 2 }, { a: 3 }, { a: 4 }], "pushHistory 超限截断头部精确值");
jeq(M.pushHistory([{ a: 1 }], [{ b: 2 }], 5),
  [{ a: 1 }, [{ b: 2 }]], "pushHistory 快照可为数组对象");
var h0 = [{ a: 1 }];
M.pushHistory(h0, { a: 2 }, 5);
eq(h0.length, 1, "pushHistory 不改原数组");
throws(function () { M.pushHistory([], null, 5); }, "snapshot", "pushHistory null 快照");
throws(function () { M.pushHistory([], 42, 5); }, "snapshot", "pushHistory 数字快照");
throws(function () { M.pushHistory([], "x", 5); }, "snapshot", "pushHistory 字符串快照");
throws(function () { M.pushHistory([], { a: 1 }, 0); }, "maxLen", "pushHistory maxLen=0");
throws(function () { M.pushHistory([], { a: 1 }, -1); }, "maxLen", "pushHistory maxLen 负值");
throws(function () { M.pushHistory([], { a: 1 }, 2.5); }, "maxLen", "pushHistory maxLen 小数");
throws(function () { M.pushHistory([], { a: 1 }, "5"); }, "maxLen", "pushHistory maxLen 字符串");

/* ---------- 7. serializeDoc↔parseDoc：往返一致与非法 ---------- */
var doc = {
  v: 1,
  savedAt: "2026-11-04T19:00:00.000Z",
  bg: "dark",
  bgImage: "data:image/png;base64,iVBORw0KGgo=",
  items: [{ type: "line", x1: 0, y1: 0, x2: 10, y2: 10, color: "#ff0000", size: 4 }]
};
var s = M.serializeDoc(doc);
ok(typeof s === "string" && s.indexOf('"v":1') !== -1, "serializeDoc 输出 JSON 字符串含 v:1");
jeq(M.parseDoc(s), doc, "serializeDoc↔parseDoc 往返一致");
var docNull = { v: 1, savedAt: "2026-11-04T19:00:00.000Z", bg: "light", bgImage: null, items: [] };
jeq(M.parseDoc(M.serializeDoc(docNull)), docNull, "serializeDoc↔parseDoc bgImage null 往返");
throws(function () { M.parseDoc("not json"); }, "doc", "parseDoc 非法 JSON");
throws(function () { M.parseDoc('{"v":2,"savedAt":"x","bg":"light","bgImage":null,"items":[]}'); }, "doc", "parseDoc 版本非法");
throws(function () { M.parseDoc("[]"); }, "doc", "parseDoc 数组非法");
throws(function () { M.serializeDoc({ v: 2, savedAt: "x", bg: "light", bgImage: null, items: [] }); }, "doc", "serializeDoc 版本非法");
throws(function () { M.serializeDoc("x"); }, "doc", "serializeDoc 字符串非法");
throws(function () { M.serializeDoc({ v: 1, savedAt: "x", bg: "nope", bgImage: null, items: [] }); }, "doc", "serializeDoc bg 非法");

/* ---------- 8. sanitizeFileName：清洗与回退 ---------- */
eq(M.sanitizeFileName("Hello: 世界?"), "Hello-世界", "sanitizeFileName 冒号问号清理、空格折横线");
eq(M.sanitizeFileName("a/b\\c*d?e\"f<g>h|i"), "abcdefghi", "sanitizeFileName 非法字符全清");
eq(M.sanitizeFileName("   "), "doodle-board", "sanitizeFileName 纯空白回退 doodle-board");
eq(M.sanitizeFileName(""), "doodle-board", "sanitizeFileName 空串回退 doodle-board");
eq(M.sanitizeFileName("  我的 涂鸦 1  "), "我的-涂鸦-1", "sanitizeFileName 首尾空白清、中间折横线");
eq(M.sanitizeFileName(null), "doodle-board", "sanitizeFileName null 回退");
eq(M.sanitizeFileName(new Array(101).join("a")).length, 60, "sanitizeFileName 超长截 60");

/* ---------- 9. 注册与零网络请求静态检查 ---------- */
ok(GO_SRC.indexOf('"doodle_board"') !== -1, "categories.go 注册 ID");
ok(GO_SRC.indexOf('"/tools/doodle-board"') !== -1, "categories.go 注册 Path");
var regBlock = GO_SRC.split('"doodle_board"')[1].split("},")[0];
ok(regBlock.indexOf('Category:    "图片处理"') !== -1, "categories.go 注册 Category 图片处理");
ok(regBlock.indexOf("New:         true") !== -1, "categories.go 注册 New true");
ok(regBlock.indexOf('Icon:        "brush"') !== -1, "categories.go 注册 Icon brush");
var iconHits = (GO_SRC.match(/Icon:\s+"brush"/g) || []).length;
eq(iconHits, 1, "Icon brush 精确值复测锁定：全库唯一 1 处");
var pathCount = {};
GO_SRC.replace(/"(\/tools\/[^"]+)"/g, function (_, p) { pathCount[p] = 1; return p; });
eq(Object.keys(pathCount).length, 323, "注册总数 295→295 Path");
ok(JS_SRC.indexOf("fetch(") === -1 && JS_SRC.indexOf("XMLHttpRequest") === -1,
  "JS 零 fetch/XHR");
ok(TPL_SRC.indexOf('src="http') === -1 && TPL_SRC.indexOf("cdn.") === -1,
  "模板零 CDN 外链");
ok(TPL_SRC.indexOf("/tools/static/js/doodle_board.js") !== -1, "模板引入 doodle_board.js");
ok(TPL_SRC.indexOf("localStorage") !== -1, "模板明示 localStorage 暂存");
ok(TPL_SRC.indexOf("5MB") !== -1, "模板明示 5MB 配额真限制");
ok(TPL_SRC.indexOf("canvas") !== -1 && TPL_SRC.indexOf("浏览器") !== -1, "模板明示 canvas 渲染差异真限制");
ok(TPL_SRC.indexOf("在线画板") !== -1 && TPL_SRC.indexOf("截图画标注") !== -1, "模板含 SEO 关键词");

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail === 0 ? 0 : 1);
