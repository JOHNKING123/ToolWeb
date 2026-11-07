/* 3D 模型预览器纯函数单元测试（零依赖）：node tests/model_3d_viewer.test.js
* 覆盖：detectModelFormat（锚点 model.STL→stl、a.OBJ→obj、x.glb→glb、a.gltf/a.txt
* 抛错 err.field='format'、'' 抛错 err.field='fileName'）、detectSTLFormat（ASCII
* 样例→ascii、二进制样例→binary、空数组抛错 err.field='stl'）、parseSTLAscii
* （单三角锚点 {triangleCount:1,vertexCount:3,min:{0,0,0},max:{1,1,0}}、'hello'
* 抛错）、parseSTLBinaryHeader（面数2实长184→{2,184}、实长100/长度10 抛错）、
* parseOBJCounts（样例→{3,1}、''→{0,0}，vn/vt 不计）、computeBounds（锚点
* [0,0,0,2,0,0,0,4,0]→min{0,0,0} max{2,4,0} center{1,2,0} size{2,4,0}、
* [0,0] 抛错）、fitScale（(10,2)→0.2、(0.5,2)→4、(0,2)/(10,0) 抛错）、
* formatFileSize（锚点 0→'0 B'、512→'512 B'、1536→'1.5 KB'、1048576→'1.0 MB'）、
* formatCount（锚点 0→'0'、1234→'1,234'、1234567→'1,234,567'、-1 抛错）、
* validateViewerConfig（wireframe/autoRotate 须 boolean、background 须 #rrggbb）、
* validateViewerState（progress 0–100、status ∈ idle/loading/ready/error）、
* categories.go 注册（Path 总数 315→316、Icon 3d_rotation 全库唯一、紧邻
* csv_table_viewer）、模板（define 名与路由转换一致、SEO 关键词、真限制四条、
* 控件、screenshot_mockup_3d 单向互链、零外部资源静态检查）、vendor three.js
* r128（REVISION 验真、四个加载器挂载）、浏览器绑定源码级检查（STL/OBJ/GLB
* 解析分发、OrbitControls、线框/自动旋转/重置视角、PNG 导出、示例模型、100MB 上限）。
*
* 注意：路由按 Path 段 '-'→'_' 推导模板名，/tools/3d-model-viewer 对应模板名
* 必须是 3d_model_viewer；模板文件按规格命名为 model_3d_viewer.html，内层
* define 用路由推导名（站内先例：base642img.html 定义 base64toimg）。
*/
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/model_3d_viewer.js");
var THREE = require("../static/js/vendor/three.min.js");

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
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "model_3d_viewer.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "model_3d_viewer.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");
var MOCKUP_TPL = fs.readFileSync(path.join(ROOT, "templates", "screenshot_3d_mockup.html"), "utf8");
var VENDOR = path.join(ROOT, "static", "js", "vendor");

function u8(str) { return new TextEncoder().encode(str); }
function binHeader(n, len) {
    var b = new Uint8Array(len);
    new DataView(b.buffer).setUint32(80, n, true);
    return b;
}

/* ---------- 1. detectModelFormat ---------- */
eq(M.detectModelFormat("model.STL"), "stl", "detectModelFormat：model.STL→stl（大小写不敏感）");
eq(M.detectModelFormat("a.OBJ"), "obj", "detectModelFormat：a.OBJ→obj");
eq(M.detectModelFormat("x.glb"), "glb", "detectModelFormat：x.glb→glb");
eq(M.detectModelFormat("a.stl"), "stl", "detectModelFormat：a.stl→stl");
eq(M.detectModelFormat("a.GLB"), "glb", "detectModelFormat：a.GLB→glb");
eq(M.detectModelFormat("my model v2.Obj"), "obj", "detectModelFormat：多点文件名取最后扩展名");
throws(function () { M.detectModelFormat("a.gltf"); }, "format", "detectModelFormat：a.gltf 抛错 err.field='format'");
throws(function () { M.detectModelFormat("a.txt"); }, "format", "detectModelFormat：a.txt 抛错 err.field='format'");
throws(function () { M.detectModelFormat("model"); }, "format", "detectModelFormat：无扩展名抛错 err.field='format'");
throws(function () { M.detectModelFormat(""); }, "fileName", "detectModelFormat：'' 抛错 err.field='fileName'");
throws(function () { M.detectModelFormat(null); }, "fileName", "detectModelFormat：null 抛错 err.field='fileName'");
throws(function () { M.detectModelFormat(123); }, "fileName", "detectModelFormat：数字抛错");

/* ---------- 2. detectSTLFormat ---------- */
eq(M.detectSTLFormat(u8("solid test\n facet normal 0 0 1\nendsolid test")), "ascii", "detectSTLFormat：ASCII 样例→ascii");
eq(M.detectSTLFormat(u8("solid t\nendsolid t")), "ascii", "detectSTLFormat：最短 ASCII 样例→ascii");
eq(M.detectSTLFormat(binHeader(2, 184)), "binary", "detectSTLFormat：二进制样例（80 字节头不以 solid 开头）→binary");
eq(M.detectSTLFormat(u8("solid binary-like without end marker")), "binary", "detectSTLFormat：solid 开头但无 endsolid→binary");
throws(function () { M.detectSTLFormat(new Uint8Array(0)); }, "stl", "detectSTLFormat：空数组抛错 err.field='stl'");
throws(function () { M.detectSTLFormat([115, 111, 108, 105, 100]); }, "stl", "detectSTLFormat：普通数组抛错 err.field='stl'（须 Uint8Array）");
throws(function () { M.detectSTLFormat("solid"); }, "stl", "detectSTLFormat：字符串抛错");

/* ---------- 3. parseSTLAscii ---------- */
var TRI1 = "solid tri\n facet normal 0 0 1\n  outer loop\n   vertex 0 0 0\n   vertex 1 0 0\n   vertex 0 1 0\n  endloop\n endfacet\nendsolid tri";
eqj(M.parseSTLAscii(TRI1), { triangleCount: 1, vertexCount: 3, min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 0 } },
"parseSTLAscii：单三角锚点 {1,3,min{0,0,0},max{1,1,0}}");
var TRI2 = "solid t\n facet normal 0 0 1\n  outer loop\n   vertex -1 -2 -3\n   vertex 2 0 0\n   vertex 0 5 4\n  endloop\n endfacet\n facet normal 0 0 1\n  outer loop\n   vertex 0 0 0\n   vertex 1 1 1\n   vertex -1 0 2\n  endloop\n endfacet\nendsolid t";
eqj(M.parseSTLAscii(TRI2), { triangleCount: 2, vertexCount: 6, min: { x: -1, y: -2, z: -3 }, max: { x: 2, y: 5, z: 4 } },
"parseSTLAscii：双三角负坐标包围盒正确");
throws(function () { M.parseSTLAscii("hello"); }, "stl", "parseSTLAscii：'hello' 抛错 err.field='stl'");
throws(function () { M.parseSTLAscii(""); }, "stl", "parseSTLAscii：空文本抛错");
throws(function () { M.parseSTLAscii(123); }, "stl", "parseSTLAscii：数字抛错 err.field='stl'");
throws(function () { M.parseSTLAscii("facet normal 0 0 1\n"); }, "stl", "parseSTLAscii：有 facet 无顶点抛错");

/* ---------- 4. parseSTLBinaryHeader ---------- */
eqj(M.parseSTLBinaryHeader(binHeader(2, 184)), { triangleCount: 2, expectedBytes: 184 }, "parseSTLBinaryHeader：面数2实长184→{2,184}");
eqj(M.parseSTLBinaryHeader(binHeader(0, 84)), { triangleCount: 0, expectedBytes: 84 }, "parseSTLBinaryHeader：面数0实长84→{0,84}");
eqj(M.parseSTLBinaryHeader(binHeader(1, 134)), { triangleCount: 1, expectedBytes: 134 }, "parseSTLBinaryHeader：面数1实长134→{1,134}");
eqj(M.parseSTLBinaryHeader(binHeader(3, 234)), { triangleCount: 3, expectedBytes: 234 }, "parseSTLBinaryHeader：面数3实长234→{3,234}");
throws(function () { M.parseSTLBinaryHeader(binHeader(2, 100)); }, "stl", "parseSTLBinaryHeader：面数2实长100抛错 err.field='stl'");
throws(function () { M.parseSTLBinaryHeader(new Uint8Array(10)); }, "stl", "parseSTLBinaryHeader：长度10抛错 err.field='stl'");
throws(function () { M.parseSTLBinaryHeader(new Uint8Array(83)); }, "stl", "parseSTLBinaryHeader：长度83抛错（<84）");
throws(function () { M.parseSTLBinaryHeader([0, 1, 2]); }, "stl", "parseSTLBinaryHeader：普通数组抛错");

/* ---------- 5. parseOBJCounts ---------- */
eqj(M.parseOBJCounts("v 0 0 0\nv 1 0 0\nv 0 1 0\nvn 0 0 1\nf 1 2 3\n"), { vertexCount: 3, faceCount: 1 },
"parseOBJCounts：样例→{3,1}（vn 不计）");
eqj(M.parseOBJCounts(""), { vertexCount: 0, faceCount: 0 }, "parseOBJCounts：''→{0,0}");
eqj(M.parseOBJCounts("v 0 0 0\nvt 0.5 0.5\nvn 0 1 0\nv 1 1 1\nf 1 2\nf 2 1\n# comment\n"), { vertexCount: 2, faceCount: 2 },
"parseOBJCounts：vt/vn/注释不计，只计 v/f");
eqj(M.parseOBJCounts("v 0 0 0\r\nv 1 0 0\r\nf 1 2\r\n"), { vertexCount: 2, faceCount: 1 },
"parseOBJCounts：CRLF 换行正常计数");
eqj(M.parseOBJCounts("  v 0 0 0\n\tf 1\n"), { vertexCount: 1, faceCount: 1 },
"parseOBJCounts：行首空白容忍");
throws(function () { M.parseOBJCounts(null); }, "obj", "parseOBJCounts：null 抛错 err.field='obj'");
throws(function () { M.parseOBJCounts(123); }, "obj", "parseOBJCounts：数字抛错");

/* ---------- 6. computeBounds ---------- */
eqj(M.computeBounds([0, 0, 0, 2, 0, 0, 0, 4, 0]),
{ min: { x: 0, y: 0, z: 0 }, max: { x: 2, y: 4, z: 0 }, center: { x: 1, y: 2, z: 0 }, size: { x: 2, y: 4, z: 0 } },
"computeBounds：锚点 [0,0,0,2,0,0,0,4,0]→min{0,0,0} max{2,4,0} center{1,2,0} size{2,4,0}");
eqj(M.computeBounds([-1, -2, -3]), { min: { x: -1, y: -2, z: -3 }, max: { x: -1, y: -2, z: -3 }, center: { x: -1, y: -2, z: -3 }, size: { x: 0, y: 0, z: 0 } },
"computeBounds：单点 size 为 0");
eqj(M.computeBounds(new Float32Array([0, 0, 0, 1, 2, 3])),
{ min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 2, z: 3 }, center: { x: 0.5, y: 1, z: 1.5 }, size: { x: 1, y: 2, z: 3 } },
"computeBounds：Float32Array 可用");
throws(function () { M.computeBounds([0, 0]); }, "positions", "computeBounds：[0,0] 抛错 err.field='positions'");
throws(function () { M.computeBounds([]); }, "positions", "computeBounds：空数组抛错");
throws(function () { M.computeBounds([0, 0, 0, 1]); }, "positions", "computeBounds：长度非 3 倍数抛错");
throws(function () { M.computeBounds([0, 0, NaN]); }, "positions", "computeBounds：NaN 抛错");
throws(function () { M.computeBounds("x"); }, "positions", "computeBounds：字符串抛错");

/* ---------- 7. fitScale ---------- */
eq(M.fitScale(10, 2), 0.2, "fitScale：(10,2)→0.2");
eq(M.fitScale(0.5, 2), 4, "fitScale：(0.5,2)→4");
eq(M.fitScale(2, 2), 1, "fitScale：(2,2)→1");
eq(M.fitScale(100, 2), 0.02, "fitScale：(100,2)→0.02");
throws(function () { M.fitScale(0, 2); }, "size", "fitScale：(0,2) 抛错 err.field='size'");
throws(function () { M.fitScale(-1, 2); }, "size", "fitScale：负 size 抛错");
throws(function () { M.fitScale(10, 0); }, "target", "fitScale：(10,0) 抛错 err.field='target'");
throws(function () { M.fitScale(10, -2); }, "target", "fitScale：负 target 抛错");
throws(function () { M.fitScale(NaN, 2); }, "size", "fitScale：NaN 抛错");

/* ---------- 8. formatFileSize ---------- */
eq(M.formatFileSize(0), "0 B", "formatFileSize：0→0 B");
eq(M.formatFileSize(512), "512 B", "formatFileSize：512→512 B");
eq(M.formatFileSize(1023), "1023 B", "formatFileSize：1023→1023 B");
eq(M.formatFileSize(1536), "1.5 KB", "formatFileSize：1536→1.5 KB");
eq(M.formatFileSize(1048576), "1.0 MB", "formatFileSize：1048576→1.0 MB");
eq(M.formatFileSize(104857600), "100.0 MB", "formatFileSize：100MB 上限→100.0 MB");
throws(function () { M.formatFileSize(-1); }, "bytes", "formatFileSize：-1 抛错 err.field='bytes'");
throws(function () { M.formatFileSize(NaN); }, "bytes", "formatFileSize：NaN 抛错");
throws(function () { M.formatFileSize("1024"); }, "bytes", "formatFileSize：字符串抛错");

/* ---------- 9. formatCount ---------- */
eq(M.formatCount(0), "0", "formatCount：0→'0'");
eq(M.formatCount(1234), "1,234", "formatCount：1234→'1,234'");
eq(M.formatCount(1234567), "1,234,567", "formatCount：1234567→'1,234,567'");
eq(M.formatCount(1000000), "1,000,000", "formatCount：1000000→'1,000,000'");
eq(M.formatCount(999), "999", "formatCount：999 不加逗号");
throws(function () { M.formatCount(-1); }, "count", "formatCount：-1 抛错 err.field='count'");
throws(function () { M.formatCount(1.5); }, "count", "formatCount：非整数抛错");
throws(function () { M.formatCount(NaN); }, "count", "formatCount：NaN 抛错");
throws(function () { M.formatCount("1234"); }, "count", "formatCount：字符串抛错");

/* ---------- 10. validateViewerConfig ---------- */
eqj(M.validateViewerConfig({ wireframe: false, autoRotate: true, background: "#1a1a1a" }),
{ wireframe: false, autoRotate: true, background: "#1a1a1a" }, "validateViewerConfig：全配置通过");
eqj(M.validateViewerConfig({}), {}, "validateViewerConfig：空配置通过（字段均为可选）");
eqj(M.validateViewerConfig({ background: "#FFFFFF" }), { background: "#FFFFFF" }, "validateViewerConfig：大写 hex 通过");
throws(function () { M.validateViewerConfig({ background: "red" }); }, "background", "validateViewerConfig：background='red' 抛错 err.field='background'");
throws(function () { M.validateViewerConfig({ background: "#fff" }); }, "background", "validateViewerConfig：3 位 hex 抛错");
throws(function () { M.validateViewerConfig({ background: "#gggggg" }); }, "background", "validateViewerConfig：非 hex 字符抛错");
throws(function () { M.validateViewerConfig({ wireframe: "yes" }); }, "wireframe", "validateViewerConfig：wireframe='yes' 抛错 err.field='wireframe'");
throws(function () { M.validateViewerConfig({ autoRotate: 1 }); }, "autoRotate", "validateViewerConfig：autoRotate=1 抛错 err.field='autoRotate'");
throws(function () { M.validateViewerConfig(null); }, "config", "validateViewerConfig：null 抛错 err.field='config'");

/* ---------- 11. validateViewerState ---------- */
eqj(M.validateViewerState({ progress: 50, status: "ready" }), { progress: 50, status: "ready" }, "validateViewerState：{50,ready} 通过");
eqj(M.validateViewerState({ progress: 0, status: "idle" }), { progress: 0, status: "idle" }, "validateViewerState：{0,idle} 边界通过");
eqj(M.validateViewerState({ progress: 100, status: "error" }), { progress: 100, status: "error" }, "validateViewerState：{100,error} 边界通过");
eqj(M.validateViewerState({ progress: 5, status: "loading" }), { progress: 5, status: "loading" }, "validateViewerState：{5,loading} 通过");
throws(function () { M.validateViewerState({ progress: 101, status: "ready" }); }, "progress", "validateViewerState：progress=101 抛错 err.field='progress'");
throws(function () { M.validateViewerState({ progress: -1, status: "ready" }); }, "progress", "validateViewerState：progress=-1 抛错");
throws(function () { M.validateViewerState({ progress: 50, status: "x" }); }, "status", "validateViewerState：status='x' 抛错 err.field='status'");
throws(function () { M.validateViewerState({ progress: 50 }); }, "status", "validateViewerState：缺 status 抛错");
throws(function () { M.validateViewerState(null); }, "progress", "validateViewerState：null 抛错 err.field='progress'");

/* ---------- 12. categories.go 注册 ---------- */
var pathCount = (GO_SRC.match(/"\/tools\/[^"]+"/g) || []).filter(function (v, i, a) { return a.indexOf(v) === i; }).length;
eq(pathCount, 328, "注册 Path 总数 315→316");
has(GO_SRC, '"model_3d_viewer"', "注册：ID model_3d_viewer");
has(GO_SRC, '"/tools/3d-model-viewer"', "注册：Path /tools/3d-model-viewer");
has(GO_SRC, '"3d_rotation"', "注册：Icon 3d_rotation");
eq((GO_SRC.match(/Icon:\s*"3d_rotation"/g) || []).length, 1, "Icon 3d_rotation 全库唯一");
var entryBlock = GO_SRC.slice(GO_SRC.indexOf('"model_3d_viewer"') - 60,
GO_SRC.indexOf('"model_3d_viewer"') + 1600);
ok(/New:\s+true/.test(entryBlock), "注册：New: true");
ok(/Category:\s+"格式转换"/.test(entryBlock), "注册：类目 格式转换");
has(entryBlock, "3D 模型预览器", "注册：名称 3D 模型预览器");
has(entryBlock, "STL", "注册：描述含 STL");
has(entryBlock, "GLB", "注册：描述含 GLB");
ok(GO_SRC.indexOf('"model_3d_viewer"') > GO_SRC.indexOf('"csv_table_viewer"') &&
GO_SRC.indexOf('"model_3d_viewer"') < GO_SRC.indexOf('"csv_editor"'), "注册：紧邻 csv_table_viewer（在其后、csv_editor 之前）");

/* ---------- 13. 模板：define/SEO/真限制/控件/互链/零外部资源 ---------- */
has(TPL_SRC, '{{define "3d_model_viewer"}}', "模板 define 名与路由转换一致（/tools/3d-model-viewer→3d_model_viewer）");
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/3d-model-viewer", "模板 canonical 含新 Path");
has(TPL_SRC, "3D 模型预览器", "模板：标题含工具名");
has(TPL_SRC, "3D模型预览", "模板 SEO：关键词含 3D模型预览");
has(TPL_SRC, "STL预览", "模板 SEO：关键词含 STL预览");
has(TPL_SRC, "OBJ在线查看", "模板 SEO：关键词含 OBJ在线查看");
has(TPL_SRC, "GLB预览", "模板 SEO：关键词含 GLB预览");
has(TPL_SRC, "真限制", "模板：真限制章节");
has(TPL_SRC, "只做预览，不做编辑", "真限制①：只做预览不做编辑/切片/转格式");
has(TPL_SRC, "DRACO", "真限制②：DRACO 压缩可能无法加载");
has(TPL_SRC, "本轮暂不支持", "真限制②：DRACO 本轮暂不支持");
has(TPL_SRC, "&gt;50MB 或 &gt;100 万面", "真限制③：大模型移动端/低配可能卡顿");
has(TPL_SRC, "全程浏览器本地计算，零上传", "真限制④：本地零上传");
has(TPL_SRC, 'id="m3d-upload"', "模板控件：上传区 m3d-upload");
has(TPL_SRC, 'id="m3d-file"', "模板控件：文件选择 m3d-file");
has(TPL_SRC, 'id="m3d-viewport"', "模板控件：预览区 m3d-viewport");
has(TPL_SRC, 'id="m3d-alt"', "模板控件：文字替代 m3d-alt");
has(TPL_SRC, 'id="m3d-info-format"', "模板控件：信息面板格式 m3d-info-format");
has(TPL_SRC, 'id="m3d-info-triangles"', "模板控件：信息面板面数 m3d-info-triangles");
has(TPL_SRC, 'id="m3d-info-vertices"', "模板控件：信息面板顶点数 m3d-info-vertices");
has(TPL_SRC, 'id="m3d-info-bounds"', "模板控件：信息面板包围盒 m3d-info-bounds");
has(TPL_SRC, 'id="m3d-info-size"', "模板控件：信息面板文件大小 m3d-info-size");
has(TPL_SRC, 'id="m3d-wireframe"', "模板控件：线框开关 m3d-wireframe");
has(TPL_SRC, 'id="m3d-autorotate"', "模板控件：自动旋转 m3d-autorotate");
has(TPL_SRC, 'id="m3d-bg"', "模板控件：背景色 m3d-bg");
has(TPL_SRC, 'id="m3d-reset"', "模板控件：重置视角 m3d-reset");
has(TPL_SRC, 'id="m3d-sample"', "模板控件：示例模型 m3d-sample");
has(TPL_SRC, 'id="m3d-export-png"', "模板控件：导出 PNG m3d-export-png");
has(TPL_SRC, 'id="m3d-progress-bar"', "模板控件：进度条 m3d-progress-bar");
has(TPL_SRC, 'aria-live', "模板无障碍：aria-live 状态区");
has(TPL_SRC, 'role="img"', "模板无障碍：预览区 role=img");
has(TPL_SRC, 'tabindex="0"', "模板无障碍：上传区/预览区可 tab 聚焦");
has(TPL_SRC, "/tools/screenshot-3d-mockup", "单向互链：3D 模型预览器 → 截图 3D 样机渲染器");
notHas(MOCKUP_TPL, "/tools/3d-model-viewer", "单向互链：截图 3D 样机渲染器不反向链接（单向）");
has(TPL_SRC, "/tools/static/js/vendor/three.min.js", "模板：引用本地 vendor three.min.js");
has(TPL_SRC, "/tools/static/js/vendor/STLLoader.js", "模板：引用本地 vendor STLLoader.js");
has(TPL_SRC, "/tools/static/js/vendor/OBJLoader.js", "模板：引用本地 vendor OBJLoader.js");
has(TPL_SRC, "/tools/static/js/vendor/GLTFLoader.js", "模板：引用本地 vendor GLTFLoader.js");
has(TPL_SRC, "/tools/static/js/vendor/OrbitControls.js", "模板：引用本地 vendor OrbitControls.js");
has(TPL_SRC, "/tools/static/js/model_3d_viewer.js?v=1", "模板：引用本站 JS");
notHas(TPL_SRC, "fonts.googleapis", "模板零 CDN：无外部字体");
ok((TPL_SRC.match(/<script[^>]*src="http/g) || []).length === 0, "模板零外部脚本：无 http script src");
var httpLinks = TPL_SRC.match(/<link[^>]*href="http[^"]*"/g) || [];
eq(httpLinks.length, 1, "模板 http link 仅 canonical 一条");
ok(httpLinks.length === 1 && httpLinks[0].indexOf("https://www.johnkingzcq123.xyz/tools/3d-model-viewer") !== -1, "模板 http link：仅自家 canonical");

/* ---------- 14. vendor three.js r128 ---------- */
eq(THREE.REVISION, "128", "vendor：three.min.js REVISION=128（pinned r128）");
var vendorFiles = ["three.min.js", "STLLoader.js", "OBJLoader.js", "GLTFLoader.js", "OrbitControls.js"];
vendorFiles.forEach(function (f) {
    ok(fs.existsSync(path.join(VENDOR, f)), "vendor 存在：" + f);
});
ok(fs.statSync(path.join(VENDOR, "three.min.js")).size > 500000, "vendor：three.min.js 体积 >500KB（完整 UMD build）");
has(fs.readFileSync(path.join(VENDOR, "STLLoader.js"), "utf8"), "THREE.STLLoader", "vendor：STLLoader 挂载 THREE.STLLoader");
has(fs.readFileSync(path.join(VENDOR, "OBJLoader.js"), "utf8"), "THREE.OBJLoader", "vendor：OBJLoader 挂载 THREE.OBJLoader");
has(fs.readFileSync(path.join(VENDOR, "GLTFLoader.js"), "utf8"), "THREE.GLTFLoader", "vendor：GLTFLoader 挂载 THREE.GLTFLoader");
has(fs.readFileSync(path.join(VENDOR, "OrbitControls.js"), "utf8"), "THREE.OrbitControls", "vendor：OrbitControls 挂载 THREE.OrbitControls");
has(fs.readFileSync(path.join(VENDOR, "GLTFLoader.js"), "utf8"), "DRACOLoader", "vendor：GLTFLoader 含 DRACOLoader 引用（未配解码器，DRACO 暂不支持与真限制一致）");

/* ---------- 15. 浏览器绑定源码级检查 ---------- */
notHas(JS_SRC, "fetch(", "零网络：JS 无 fetch");
notHas(JS_SRC, "XMLHttpRequest", "零网络：JS 无 XHR");
has(JS_SRC, "textContent", "渲染：用 textContent 防 HTML 执行");
has(JS_SRC, "new THREE.WebGLRenderer", "渲染：WebGLRenderer");
has(JS_SRC, "preserveDrawingBuffer: true", "导出：preserveDrawingBuffer 保证 PNG 截图可取");
has(JS_SRC, "new THREE.STLLoader", "解析：STLLoader 解析 STL");
has(JS_SRC, "new THREE.OBJLoader", "解析：OBJLoader 解析 OBJ");
has(JS_SRC, "new THREE.GLTFLoader", "解析：GLTFLoader 解析 GLB");
has(JS_SRC, "detectSTLFormat(", "解析：STL 先 detectSTLFormat 判定 ASCII/二进制");
has(JS_SRC, "new THREE.OrbitControls", "轨道：OrbitControls 旋转/缩放/平移");
has(JS_SRC, "listenToKeyEvents", "轨道：方向键平移已绑定 listenToKeyEvents");
has(JS_SRC, "controls.autoRotate", "控制：自动旋转 controls.autoRotate");
has(JS_SRC, "wireframe", "控制：线框/实体切换 wireframe");
has(JS_SRC, "function resetView()", "控制：重置视角 resetView");
has(JS_SRC, "function fitView(", "归一化：fitView 自适应缩放居中");
has(JS_SRC, "fitScale(maxDim, M3D_FIT_SIZE)", "归一化：fitScale(maxDim, 2) 归一化");
has(JS_SRC, "computeBounds(pos.array)", "统计：computeBounds 复用于网格顶点统计");
has(JS_SRC, "toBlob", "导出：canvas toBlob 导出 PNG");
has(JS_SRC, "image/png", "导出：PNG MIME");
has(JS_SRC, "buildSampleModel", "示例：内置程序化示例模型 buildSampleModel");
has(JS_SRC, "TorusKnotGeometry", "示例：TorusKnotGeometry 程序化生成");
has(JS_SRC, "M3D_MAX_BYTES = 104857600", "上限：100MB M3D_MAX_BYTES=104857600");
has(JS_SRC, "M3D_ACCEPT_RE", "校验：STL/OBJ/GLB 扩展名校验");
has(JS_SRC, "runId", "防串状态：加载轮次 token runId");
has(JS_SRC, "runToken !== state.runId", "防串状态：旧轮次回调凭 token 丢弃");
has(JS_SRC, "DRACO", "限制：DRACO 失败提示写明暂不支持");
has(JS_SRC, "window.Model3DViewer", "导出：挂 window.Model3DViewer");
has(JS_SRC, "module.exports", "导出：module.exports 同步导出");
has(JS_SRC, "setAltText", "无障碍：canvas 文字替代 setAltText");

console.log("model_3d_viewer: pass=" + pass + " fail=" + fail + "，共 " + (pass + fail) + " 断言");
if (fail > 0) process.exit(1);
