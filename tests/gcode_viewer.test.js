/* G-code 预览器纯函数单元测试（零依赖）：node tests/gcode_viewer.test.js
 * 覆盖：规范 8 行样例锚点精确值（totalLines 8、totalLayers 2、
 * layers[0].z 0.2、layers[1].z 0.4、totalExtrudeMm ≈44.14、
 * totalTravelMm 0、estimatedSeconds ∈ (1.7, 1.8)）、层划分（Z-only
 * 移动只切层不产生 move、Z 回落新建层）、挤出／空走区分（E 增为挤
 * 出、E 减／无 E／G0 为空走）、预估时长（F 沿用、默认 1500）、耗材
 * 重量（filamentWeight(1000,1.75,1.24)≈2.98）、formatDuration 四锚
 * 点、clampLayer 三锚点、非法参数 err.field（text/parsed/index/
 * layer/seconds/extrudeMm/diameterMm/density/total/id）、解析边缘
 * （注释、CRLF、G92 E0、G2/G3 与 M 指令忽略、小写指令）、3 组预设、
 * categories.go 注册（Path 总数 327→328、Icon layers 全库唯一、紧邻
 * model_3d_viewer）、模板（SEO 关键词、真限制五条、控件、互链、零外
 * 部资源静态检查）、浏览器绑定源码级检查（window.GcodeViewer、层滑
 * 杆／播放／复制／清空）。
 * Icon 说明：规格首选 precision 经查不在官方 Material Icons
 * codepoints（2235 条，无 precision；manufacturing 亦无，仅
 * precision_manufacturing f049 存在）；备选 layers 在 codepoints 内
 * 为 e53b，且 Icon "layers" 精确值全库 0 命中，锁定 layers。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/gcode_viewer.js");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function eqj(a, b, name) { eq(JSON.stringify(a), JSON.stringify(b), name); }
function has(s, sub, name) { ok(s.indexOf(sub) !== -1, name + "（缺 " + sub + "）"); }
function notHas(s, sub, name) { ok(s.indexOf(sub) === -1, name + "（不应含 " + sub + "）"); }
function near(a, b, tol, name) { ok(Math.abs(a - b) <= tol, name + "（期望 ≈" + b + "±" + tol + "，实得 " + a + "）"); }
function throws(fn, field, name) {
    try { fn(); ok(false, name + "（应抛错却未抛）"); }
    catch (e) { ok(!field || e.field === field, name + "（err.field 期望 " + field + "，实得 " + e.field + "）"); }
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "gcode_viewer.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "gcode_viewer.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. 规范 8 行样例锚点 ---------- */
var S = M.parseGcode(M.SAMPLE_TEXT);
eq(S.stats.totalLines, 8, "样例 totalLines→8");
eq(S.stats.totalLayers, 2, "样例 totalLayers→2");
eq(S.layers[0].z, 0.2, "样例 layers[0].z→0.2");
eq(S.layers[1].z, 0.4, "样例 layers[1].z→0.4");
near(S.stats.totalExtrudeMm, 44.14, 0.01, "样例 totalExtrudeMm≈44.14");
eq(S.stats.totalTravelMm, 0, "样例 totalTravelMm→0");
ok(S.stats.estimatedSeconds > 1.7 && S.stats.estimatedSeconds < 1.8,
    "样例 estimatedSeconds∈(1.7,1.8)（实得 " + S.stats.estimatedSeconds + "）");
eq(S.layers[0].moves.length, 4, "样例第 1 层 4 段移动");
eq(S.layers[1].moves.length, 0, "样例第 2 层 0 段移动（Z-only 只切层）");
eq(S.layers[0].moves[0].x0, 0, "样例首段起点 x0=0");
eq(S.layers[0].moves[0].y0, 0, "样例首段起点 y0=0");
eq(S.layers[0].moves[0].x1, 10, "样例首段终点 x1=10");
eq(S.layers[0].moves[0].y1, 10, "样例首段终点 y1=10");
eq(S.layers[0].moves[0].extrude, true, "样例首段为挤出");
eq(S.layers[0].moves[0].feed, 1500, "样例首段进给 1500");
eq(S.layers[0].moves[3].x1, 10, "样例第 1 层末段终点 x1=10");
eq(S.layers[0].moves[3].y1, 20, "样例第 1 层末段终点 y1=20");
eq(S.stats.filamentMm, 2, "样例耗材长度 2mm（E 累计 0.5×4）");
near(S.stats.filamentGrams, 0.006, 0.001, "样例耗材重量 ≈0.006g");
eq(S.stats.layerHeightMedianMm, 0.2, "样例层高中位数 0.2");
eq(S.stats.filamentMeters, 0.002, "样例耗材米数 0.002m");

/* ---------- 2. 层划分 ---------- */
var L = M.parseGcode('G1 Z0.2\nG1 X10 Y0 E1\nG1 Z0.4\nG1 X20 Y0 E2\nG1 Z0.2\nG1 X20 Y10 E3\n');
eq(L.stats.totalLayers, 3, "层划分：Z 0.2→0.4→0.2 回落得 3 层（同 Z 重现仍新建层）");
eq(L.layers[0].moves.length, 1, "层划分：第 1 层 1 段");
eq(L.layers[1].moves.length, 1, "层划分：第 2 层 1 段（Z 抬升新层）");
eq(L.layers[2].moves.length, 1, "层划分：第 3 层 1 段（Z 回落新层）");
eq(L.layers[2].z, 0.2, "层划分：第 3 层 z 回落到 0.2");
var LZ = M.parseGcode('G1 Z0.3\nG1 Z0.6\nG1 Z0.9\n');
eq(LZ.stats.totalLayers, 3, "层划分：连续 Z-only 得 3 层");
eq(LZ.layers[2].z, 0.9, "层划分：连续 Z-only 第 3 层 z=0.9");
eq(LZ.stats.totalExtrudeMm, 0, "层划分：纯 Z 移动挤出为 0");
var L0 = M.parseGcode('G1 X5 Y5 E1\n');
eq(L0.stats.totalLayers, 1, "层划分：无 Z 指令时首段移动建默认层");
eq(L0.layers[0].z, 0, "层划分：默认层 z=0");
var LE = M.parseGcode('');
eq(LE.stats.totalLines, 0, "空文本 totalLines 0");
eq(LE.stats.totalLayers, 0, "空文本 totalLayers 0");
eq(LE.layers.length, 0, "空文本 layers 为空");
var LB = M.parseGcode('\n\n; 只有注释与空行\n');
eq(LB.stats.totalLines, 3, "注释／空行计入总行数");
eq(LB.stats.totalLayers, 0, "无移动则无层");

/* ---------- 3. 挤出／空走区分 ---------- */
var X = M.parseGcode('G1 Z0.2 F1500\nG0 X10 Y0\nG1 X10 Y10 E1\nG1 X0 Y10 E0.5\nG1 X0 Y0\nG1 X5 Y5 E0.5\n');
eq(X.layers[0].moves.length, 5, "挤出／空走：共 5 段移动");
eq(X.layers[0].moves[0].extrude, false, "挤出／空走：G0 无 E 为空走");
eq(X.layers[0].moves[1].extrude, true, "挤出／空走：E 增加为挤出");
eq(X.layers[0].moves[2].extrude, false, "挤出／空走：E 减少（回抽）为空走");
eq(X.layers[0].moves[3].extrude, false, "挤出／空走：无 E 为空走");
eq(X.layers[0].moves[4].extrude, false, "挤出／空走：E 不变为 travel（退回起点）");
near(X.stats.totalExtrudeMm, 10, 0.001, "挤出／空走：总挤出 10mm");
near(X.stats.totalTravelMm, 10 + 10 + 10 + Math.sqrt(50), 0.001, "挤出／空走：总空走 G0 10＋回抽 10＋无 E 10＋√50");
var XS = M.layerStats(X.layers[0]);
eq(XS.extrudeCount, 1, "layerStats：挤出段数 1");
eq(XS.travelCount, 4, "layerStats：空走段数 4");
eq(XS.moveCount, 5, "layerStats：总段数 5");
near(XS.extrudeMm, 10, 0.001, "layerStats：挤出 10mm");
var XR = M.parseGcode('G1 X10 Y0 E2\nG1 X20 Y0 E1\nG1 X30 Y0 E3\n');
eq(XR.stats.filamentMm, 4, "耗材长度：E 增 2＋回抽不计＋再增 2＝4mm");
eq(XR.layers[0].moves[1].extrude, false, "耗材长度：回抽段不挤出");

/* ---------- 4. 预估时长（进给） ---------- */
var T = M.parseGcode('G1 Z0.2 F3000\nG1 X10 Y0 E1\nG1 X10 Y10 E2\nG1 F600\nG1 X0 Y10 E3\n');
near(T.stats.estimatedSeconds, 10 / 50 + 10 / 50 + 10 / 10, 0.001,
    "预估时长：F3000 两段各 0.2s＋F600 一段 1s＝1.4s");
eq(M.estimateTime(T), T.stats.estimatedSeconds, "estimateTime 与 stats.estimatedSeconds 一致");
var TD = M.parseGcode('G1 X60 Y0 E1\n');
near(TD.stats.estimatedSeconds, 2.4, 0.001, "预估时长：无 F 时默认 1500mm/min（25mm/s），60mm＝2.4s");
var TF = M.parseGcode('G1 F3000\nG1 X10 Y0 E1\n');
near(TF.stats.estimatedSeconds, 0.2, 0.001, "预估时长：纯 F 行只改进给不产生移动");
eq(TF.layers[0].moves.length, 1, "预估时长：纯 F 行不计入移动段数");

/* ---------- 5. 耗材重量 ---------- */
near(M.filamentWeight(1000, 1.75, 1.24), 2.98, 0.01, "filamentWeight(1000,1.75,1.24)≈2.98");
near(M.filamentWeight(1000), 2.98, 0.01, "filamentWeight 默认参数与显式一致");
eq(M.filamentWeight(0), 0, "filamentWeight(0)→0");
near(M.filamentWeight(1000, 2.85, 1.24), 7.91, 0.01, "filamentWeight 2.85mm 丝径 ≈7.91g");
near(M.filamentWeight(500, 1.75, 1.04), 1.25, 0.01, "filamentWeight ABS 密度 1.04 ≈1.25g");

/* ---------- 6. formatDuration ---------- */
eq(M.formatDuration(3661), "1小时1分1秒", "formatDuration(3661)→1小时1分1秒");
eq(M.formatDuration(90), "1分30秒", "formatDuration(90)→1分30秒");
eq(M.formatDuration(45), "45秒", "formatDuration(45)→45秒");
eq(M.formatDuration(0), "0秒", "formatDuration(0)→0秒");
eq(M.formatDuration(3600), "1小时0分0秒", "formatDuration(3600)→1小时0分0秒");
eq(M.formatDuration(61), "1分1秒", "formatDuration(61)→1分1秒");
eq(M.formatDuration(59.9), "59秒", "formatDuration 小数向下取整");
eq(M.formatDuration(7261), "2小时1分1秒", "formatDuration(7261)→2小时1分1秒");

/* ---------- 7. clampLayer ---------- */
eq(M.clampLayer(99, 3), 2, "clampLayer(99,3)→2");
eq(M.clampLayer(-1, 3), 0, "clampLayer(-1,3)→0");
eq(M.clampLayer(0, 0), -1, "clampLayer(0,0)→-1");
eq(M.clampLayer(1, 3), 1, "clampLayer(1,3)→1");
eq(M.clampLayer(2, 3), 2, "clampLayer(2,3)→2");
eq(M.clampLayer(0, 1), 0, "clampLayer(0,1)→0");
eq(M.clampLayer(5, 0), -1, "clampLayer(5,0)→-1");

/* ---------- 8. getLayer ---------- */
eq(M.getLayer(S, 0).z, 0.2, "getLayer(parsed,0)→第 1 层");
eq(M.getLayer(S, 1).z, 0.4, "getLayer(parsed,1)→第 2 层");
eq(M.getLayer(S, 99).z, 0.4, "getLayer 越界上钳制到末层");
eq(M.getLayer(S, -5).z, 0.2, "getLayer 越界下钳制到首层");
eq(M.getLayer(LE, 0), null, "getLayer 空解析返回 null");
eq(M.getLayer(S, 0), S.layers[0], "getLayer 返回同一层对象");

/* ---------- 9. layerStats ---------- */
var LS = M.layerStats(S.layers[0]);
eq(LS.z, 0.2, "layerStats z");
eq(LS.moveCount, 4, "layerStats moveCount");
eq(LS.extrudeCount, 4, "layerStats extrudeCount");
eq(LS.travelCount, 0, "layerStats travelCount");
near(LS.extrudeMm, 44.14, 0.01, "layerStats extrudeMm");
eq(LS.travelMm, 0, "layerStats travelMm");
ok(LS.seconds > 1.7 && LS.seconds < 1.8, "layerStats seconds∈(1.7,1.8)");
var LS1 = M.layerStats(S.layers[1]);
eq(LS1.moveCount, 0, "layerStats 空层 moveCount 0");
eq(LS1.seconds, 0, "layerStats 空层 seconds 0");

/* ---------- 10. estimateTime ---------- */
near(M.estimateTime(S), S.stats.estimatedSeconds, 1e-9, "estimateTime 样例与 stats 一致");
eq(M.estimateTime(LE), 0, "estimateTime 空解析为 0");

/* ---------- 11. 非法参数 err.field ---------- */
throws(function () { M.parseGcode(null); }, "text", "parseGcode(null) err.field=text");
throws(function () { M.parseGcode(123); }, "text", "parseGcode(123) err.field=text");
throws(function () { M.parseGcode(undefined); }, "text", "parseGcode(undefined) err.field=text");
throws(function () { M.getLayer(null, 0); }, "parsed", "getLayer(null,0) err.field=parsed");
throws(function () { M.getLayer({}, 0); }, "parsed", "getLayer({},0) err.field=parsed");
throws(function () { M.getLayer(S, "0"); }, "index", "getLayer 索引非整数 err.field=index");
throws(function () { M.getLayer(S, 1.5); }, "index", "getLayer 索引小数 err.field=index");
throws(function () { M.layerStats(null); }, "layer", "layerStats(null) err.field=layer");
throws(function () { M.layerStats({ z: 0.2 }); }, "layer", "layerStats 缺 moves err.field=layer");
throws(function () { M.estimateTime(null); }, "parsed", "estimateTime(null) err.field=parsed");
throws(function () { M.formatDuration(-1); }, "seconds", "formatDuration(-1) err.field=seconds");
throws(function () { M.formatDuration("90"); }, "seconds", "formatDuration('90') err.field=seconds");
throws(function () { M.formatDuration(NaN); }, "seconds", "formatDuration(NaN) err.field=seconds");
throws(function () { M.filamentWeight(-1); }, "extrudeMm", "filamentWeight(-1) err.field=extrudeMm");
throws(function () { M.filamentWeight(100, 0); }, "diameterMm", "filamentWeight 直径 0 err.field=diameterMm");
throws(function () { M.filamentWeight(100, 1.75, -1); }, "density", "filamentWeight 密度负值 err.field=density");
throws(function () { M.clampLayer(1.5, 3); }, "index", "clampLayer 小数索引 err.field=index");
throws(function () { M.clampLayer(0, -1); }, "total", "clampLayer 负总数 err.field=total");
throws(function () { M.clampLayer(0, "3"); }, "total", "clampLayer 总数非数字 err.field=total");
throws(function () { M.getPreset(""); }, "id", "getPreset('') err.field=id");
throws(function () { M.getPreset("nope"); }, "id", "getPreset 未知 id err.field=id");

/* ---------- 12. 解析边缘 ---------- */
var C = M.parseGcode('; 整行注释\nG1 X10 Y0 E1 ; 行尾注释 (括号注释)\nG1 X10 Y10 E2 ; comment\n');
eq(C.stats.totalLines, 3, "注释：总行数含注释行");
eq(C.layers[0].moves.length, 2, "注释：注释剥离后 2 段移动");
var CRLF = M.parseGcode('G1 Z0.2\r\nG1 X10 Y0 E1\r\nG1 X0 Y0 E2\r\n');
eq(CRLF.stats.totalLines, 3, "CRLF：行数 3");
eq(CRLF.layers[0].moves.length, 2, "CRLF：移动 2 段");
var G92 = M.parseGcode('G1 X10 Y0 E5\nG92 E0\nG1 X20 Y0 E1\n');
eq(G92.stats.filamentMm, 6, "G92 E0：耗材 5＋1＝6mm");
eq(G92.layers[0].moves.length, 2, "G92 E0：不产生移动段");
var IGN = M.parseGcode('G21\nG90\nM104 S200\nM109 S200\nG2 X10 Y10 I5 J0 E1\nG3 X0 Y0 I-5 J0 E2\nG1 X10 Y0 E1\nM84\n');
eq(IGN.layers[0].moves.length, 1, "忽略：G2/G3 与 M 指令不产生移动");
eq(IGN.stats.totalExtrudeMm, 10, "忽略：仅 G1 一段挤出 10mm");
var LOW = M.parseGcode('g1 z0.2 f1500\ng1 x10 y0 e1\n');
eq(LOW.stats.totalLayers, 1, "小写指令：可解析");
eq(LOW.layers[0].moves.length, 1, "小写指令：移动 1 段");
var NEG = M.parseGcode('G1 X-10 Y-5 E1\nG1 X0 Y0 E2\n');
near(NEG.stats.totalExtrudeMm, Math.sqrt(125) + Math.sqrt(125), 0.001, "负坐标：距离按绝对差计算");
var DEC = M.parseGcode('G1 X10.5 Y0.25 E0.1234\n');
eq(DEC.layers[0].moves[0].x1, 10.5, "小数坐标：X 10.5");
eq(DEC.layers[0].moves[0].y1, 0.25, "小数坐标：Y 0.25");
var TRAIL = M.parseGcode('G1 X10 Y0 E1\n');
eq(TRAIL.stats.totalLines, 1, "末尾换行：不计多余空行");
var TRAIL2 = M.parseGcode('G1 X10 Y0 E1\n\n');
eq(TRAIL2.stats.totalLines, 2, "中间空行计入总行数");

/* ---------- 13. 预设示例 ---------- */
var presets = M.getPresets();
eq(presets.length, 3, "预设：共 3 组");
eq(presets[0].id, "sample", "预设 1 id sample");
eq(presets[1].id, "cube", "预设 2 id cube");
eq(presets[2].id, "circle", "预设 3 id circle");
eq(M.getPreset("sample"), M.SAMPLE_TEXT, "getPreset(sample) 即规范样例");
var PC = M.parseGcode(M.getPreset("cube"));
eq(PC.stats.totalLayers, 4, "预设方框：4 层");
eq(PC.stats.totalLines, 23, "预设方框：23 行");
near(PC.stats.totalExtrudeMm, 320, 0.01, "预设方框：总挤出 320mm");
var PR = M.parseGcode(M.getPreset("circle"));
eq(PR.stats.totalLayers, 3, "预设圆环：3 层");
ok(PR.stats.totalTravelMm > 0, "预设圆环：含 G0 空走");
near(PR.stats.totalExtrudeMm, 279.5, 0.5, "预设圆环：总挤出 ≈279.5mm");
eq(M.MAX_FILE_BYTES, 20 * 1024 * 1024, "文件上限 20MB");
eq(M.DEFAULT_FEED, 1500, "默认进给 1500mm/min");

/* ---------- 14. categories.go 注册 ---------- */
var pathCount = (GO_SRC.match(/"\/tools\/[^"]+"/g) || []).filter(function (v, i, a) { return a.indexOf(v) === i; }).length;
eq(pathCount, 328, "注册 Path 总数 327→328");
has(GO_SRC, "\"gcode_viewer\"", "注册：ID gcode_viewer");
has(GO_SRC, "\"/tools/gcode-viewer\"", "注册：Path /tools/gcode-viewer");
has(GO_SRC, "\"layers\"", "注册：Icon layers");
eq((GO_SRC.match(/Icon:\s*"layers"/g) || []).length, 1, "Icon layers 全库唯一（官方 codepoints e53b、精确值 0 命中）");
var entryBlock = GO_SRC.slice(GO_SRC.indexOf("\"gcode_viewer\"") - 60,
    GO_SRC.indexOf("\"gcode_viewer\"") + 1800);
ok(/New:\s+true/.test(entryBlock), "注册：New: true");
ok(/Category:\s+"格式转换"/.test(entryBlock), "注册：类目 格式转换");
has(entryBlock, "G-code 预览器", "注册：名称 G-code 预览器");
has(entryBlock, "G-code 预览", "注册：描述含 SEO 关键词 G-code 预览");
ok(GO_SRC.indexOf("\"gcode_viewer\"") > GO_SRC.indexOf("\"model_3d_viewer\"") &&
    GO_SRC.indexOf("\"gcode_viewer\"") < GO_SRC.indexOf("\"csv_editor\""),
    "注册：紧邻 model_3d_viewer（在其后、csv_editor 之前）");

/* ---------- 15. 模板：SEO/真限制/控件/互链/零外部资源 ---------- */
has(TPL_SRC, "{{define \"gcode_viewer\"}}", "模板：define gcode_viewer");
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/gcode-viewer", "模板 canonical 含新 Path");
has(TPL_SRC, "G-code 预览器", "模板：标题含工具名");
has(TPL_SRC, "G-code 预览", "模板：SEO 关键词 G-code 预览");
has(TPL_SRC, "3D 打印刀路", "模板：SEO 关键词 3D 打印刀路");
has(TPL_SRC, "G-code 查看器", "模板：SEO 关键词 G-code 查看器");
has(TPL_SRC, "G-code 在线预览", "模板：SEO 关键词 G-code 在线预览");
has(TPL_SRC, "五条真限制", "模板：五条真限制标题");
has(TPL_SRC, "预估时长未计加减速", "模板：真限制 1 预估时长");
has(TPL_SRC, "耗材为 PLA 估算", "模板：真限制 2 耗材 PLA 估算");
has(TPL_SRC, "仅解析 Marlin", "模板：真限制 3 仅解析 Marlin");
has(TPL_SRC, "Z 回退", "模板：真限制 4 Z 回退");
has(TPL_SRC, "只做切片后刀路预览", "模板：真限制 5 只做刀路预览");
has(TPL_SRC, "不做模型预览", "模板：真限制 5 不做模型预览");
has(TPL_SRC, "不替代切片软件", "模板：真限制 5 不替代切片软件");
has(TPL_SRC, "id=\"gc-upload\"", "模板：上传区 gc-upload");
has(TPL_SRC, "id=\"gc-file\"", "模板：文件输入 gc-file");
has(TPL_SRC, "id=\"gc-canvas\"", "模板：画布 gc-canvas");
has(TPL_SRC, "id=\"gc-layer-slider\"", "模板：层滑杆 gc-layer-slider");
has(TPL_SRC, "id=\"gc-prev\"", "模板：上一层 gc-prev");
has(TPL_SRC, "id=\"gc-next\"", "模板：下一层 gc-next");
has(TPL_SRC, "id=\"gc-play\"", "模板：播放 gc-play");
has(TPL_SRC, "id=\"gc-speed\"", "模板：播放速度 gc-speed");
has(TPL_SRC, "id=\"gc-zoom\"", "模板：缩放滑杆 gc-zoom");
has(TPL_SRC, "id=\"gc-layer-info\"", "模板：层信息 gc-layer-info");
has(TPL_SRC, "id=\"gc-stats\"", "模板：统计面板 gc-stats");
has(TPL_SRC, "id=\"gc-presets\"", "模板：预设示例 gc-presets");
has(TPL_SRC, "id=\"gc-copy-btn\"", "模板：复制统计摘要 gc-copy-btn");
has(TPL_SRC, "id=\"gc-clear\"", "模板：清空 gc-clear");
has(TPL_SRC, "挤出", "模板：图例 挤出常驻");
has(TPL_SRC, "空走", "模板：图例 空走常驻");
has(TPL_SRC, "/tools/3d-model-viewer", "模板：互链 3D 模型预览器");
has(TPL_SRC, "3D 模型预览器", "模板：互链 3D 模型预览器名称");
has(TPL_SRC, "只做切片后刀路预览，不做模型预览、不做切片", "模板：互链明示分工");
has(TPL_SRC, "不上传服务器", "模板：隐私声明 不上传服务器");
notHas(TPL_SRC, "fonts.googleapis", "模板零 CDN：无外部字体");
notHas(TPL_SRC, "cdnjs", "模板零 CDN：无 cdnjs");
notHas(TPL_SRC, "three", "模板零外部静态资源：不引 Three.js");
ok((TPL_SRC.match(/<script[^>]*src="http/g) || []).length === 0, "模板零外部脚本：无 http script src");
var httpLinks = TPL_SRC.match(/<link[^>]*href="http[^"]*"/g) || [];
eq(httpLinks.length, 1, "模板 http link 仅 canonical 一条");
ok(httpLinks.length === 1 && httpLinks[0].indexOf("https://www.johnkingzcq123.xyz/tools/gcode-viewer") !== -1, "模板 http link：仅自家 canonical");

/* ---------- 16. 浏览器绑定源码级检查 ---------- */
has(JS_SRC, "window.GcodeViewer", "绑定：window.GcodeViewer");
has(JS_SRC, "parseGcode", "绑定：parseGcode");
has(JS_SRC, "getLayer", "绑定：getLayer");
has(JS_SRC, "layerStats", "绑定：layerStats");
has(JS_SRC, "estimateTime", "绑定：estimateTime");
has(JS_SRC, "formatDuration", "绑定：formatDuration");
has(JS_SRC, "filamentWeight", "绑定：filamentWeight");
has(JS_SRC, "clampLayer", "绑定：clampLayer");
has(JS_SRC, "gc-layer-slider", "绑定：层滑杆");
has(JS_SRC, "gc-play", "绑定：播放按钮");
has(JS_SRC, "gc-speed", "绑定：播放速度");
has(JS_SRC, "gc-zoom", "绑定：缩放滑杆");
has(JS_SRC, "gc-presets", "绑定：预设示例");
has(JS_SRC, "gc-copy-btn", "绑定：复制统计摘要");
has(JS_SRC, "gc-clear", "绑定：清空");
has(JS_SRC, "setLineDash", "绑定：空走虚线绘制");
has(JS_SRC, "getContext('2d')", "绑定：Canvas 2D 渲染");
notHas(JS_SRC, "http://", "JS 零外部请求：无 http 链接");
notHas(JS_SRC, "https://", "JS 零外部请求：无 https 链接");
notHas(JS_SRC, "fetch(", "JS 零外部请求：无 fetch");

console.log("通过 " + pass + "，失败 " + fail + "，共 " + (pass + fail) + " 断言");
if (fail > 0) process.exit(1);
