/* 头像生成器纯逻辑单元测试（零依赖）：node tests/avatar_generator.test.js
 * 覆盖：
 * 1. mulberry32 确定性
 * 2. seedFromString 稳定性
 * 3. 描述子范围与确定性（种子->JSON 可复现）
 * 4. 描述 JSON 序列化/反序列化往返（含种子输入、非法输入）
 * 5. 图层表（8 层变体数/命名/id 唯一）
 * 6. 颜色表有效性
 * 7. 导出尺寸表
 * 8. buildSVG 确定性（同描述同串、异描述异串、透明底）
 * 9. 导出文件名规范
 * 10. 模板静态检查（SEO 面板/脚本引用/控件）
 * 11. 零网络请求（无 fetch/XHR）
 * 12. clampIndex 边界
 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/avatar_generator.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function deepEq(a, b, name) { eq(JSON.stringify(a), JSON.stringify(b), name); }

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "avatar_generator.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "avatar_generator.html"), "utf8");

/* ---------- 1. mulberry32 确定性 ---------- */
var r1 = M.mulberry32(12345), r2 = M.mulberry32(12345);
var seq1 = [r1(), r1(), r1(), r1(), r1()], seq2 = [r2(), r2(), r2(), r2(), r2()];
deepEq(seq1, seq2, "同一种子 PRNG 序列完全一致");
var r3 = M.mulberry32(12345);
eq(r3(), seq1[0], "mulberry32 首值可复现");
var r4 = M.mulberry32(54321);
ok(r4() !== seq1[0], "不同种子首值不同");
ok(seq1.every(function (v) { return v >= 0 && v < 1; }), "PRNG 输出落在 [0,1)");
var r5 = M.mulberry32(0);
ok(typeof r5() === "number", "种子 0 可用");
var r6 = M.mulberry32(4294967295);
ok(r6() >= 0 && r6() < 1, "种子 2^32-1 可用");

/* ---------- 2. seedFromString ---------- */
eq(M.seedFromString("hello"), M.seedFromString("hello"), "seedFromString 稳定");
ok(M.seedFromString("hello") !== M.seedFromString("world"), "不同文本种子不同");
var hs = M.seedFromString("头像");
ok(hs >= 0 && hs <= 4294967295 && Math.floor(hs) === hs, "seedFromString 输出为 uint32");

/* ---------- 3. 描述子范围与确定性 ---------- */
var d1 = M.descriptorFromSeed(20261024);
var d2 = M.descriptorFromSeed(20261024);
deepEq(d1, d2, "同一种子两次描述子完全一致");
eq(d1.s, 20261024, "描述子保留种子");
var LAYERS = [["bg", M.BG_LIST], ["sk", M.SKIN_LIST], ["fa", M.FACE_LIST],
  ["ha", M.HAIR_LIST], ["hc", M.HAIR_COLORS], ["ey", M.EYE_LIST],
  ["br", M.BROW_LIST], ["mo", M.MOUTH_LIST], ["ac", M.ACC_LIST]];
LAYERS.forEach(function (L) {
  ok(d1[L[0]] >= 0 && d1[L[0]] < L[1].length, "描述子字段 " + L[0] + " 在范围内");
});
var d3 = M.descriptorFromSeed(999);
ok(JSON.stringify(d1) !== JSON.stringify(d3), "不同种子描述子不同");
ok(M.validDescriptor(d1), "validDescriptor 认可合法描述子");
ok(!M.validDescriptor({ s: 1, bg: 99, sk: 0, fa: 0, ha: 0, hc: 0, ey: 0, br: 0, mo: 0, ac: 0 }),
  "validDescriptor 拒绝越界下标");
ok(!M.validDescriptor(null), "validDescriptor 拒绝 null");
ok(!M.validDescriptor({ s: 1 }), "validDescriptor 拒绝缺字段");

/* ---------- 4. 序列化往返 ---------- */
var json = M.serializeDescriptor(d1);
var back = M.parseDescriptor(json);
ok(back.ok, "JSON 描述可解析");
deepEq(back.desc, M.normalizeDescriptor(d1), "JSON 往返描述子一致");
eq(back.seed, d1.s, "JSON 往返种子一致");
ok(json.indexOf('"s":') >= 0 && json.indexOf('"bg":') >= 0 && json.indexOf('"ac":') >= 0,
  "短 JSON 含关键字段");
ok(json.length < 120, "短 JSON 足够紧凑（<120 字符），实得 " + json.length);
var numParse = M.parseDescriptor("20261024");
ok(numParse.ok && numParse.seed === 20261024, "纯数字输入按种子解析");
deepEq(numParse.desc, d1, "数字种子还原与直接生成一致");
var txtParse = M.parseDescriptor("我的头像");
ok(txtParse.ok && txtParse.seed === M.seedFromString("我的头像"), "任意文本按字符串种子解析");
var bad1 = M.parseDescriptor("");
ok(!bad1.ok, "空输入解析失败");
var bad2 = M.parseDescriptor("{not json");
ok(bad2.ok && bad2.seed === M.seedFromString("{not json"), "非 JSON 文本回退为字符串种子");
var bad3 = M.parseDescriptor('{"s":1,"bg":99,"sk":0,"fa":0,"ha":0,"hc":0,"ey":0,"br":0,"mo":0,"ac":0}');
ok(!bad3.ok, "越界 JSON 解析失败并给出 error");

/* ---------- 5. 图层表 ---------- */
var EXPECT = [["BG_LIST", 8], ["SKIN_LIST", 6], ["FACE_LIST", 4], ["HAIR_LIST", 8],
  ["EYE_LIST", 8], ["BROW_LIST", 6], ["MOUTH_LIST", 8], ["ACC_LIST", 6], ["HAIR_COLORS", 6]];
EXPECT.forEach(function (E) {
  var list = M[E[0]];
  ok(list.length >= E[1], E[0] + " 变体数 ≥" + E[1] + "（实得 " + list.length + "）");
  var ids = {};
  var allNamed = list.every(function (v) {
    ids[v.id] = (ids[v.id] || 0) + 1;
    return v.id && v.name;
  });
  ok(allNamed, E[0] + " 每项有 id＋中文名");
  ok(Object.keys(ids).length === list.length, E[0] + " id 唯一");
});
ok(M.ACC_LIST[0].id === "none", "配饰首项为「无」");
ok(M.BG_LIST.some(function (b) { return b.type === "gradient"; }), "背景含渐变款");
ok(M.BG_LIST.some(function (b) { return b.type === "solid"; }), "背景含纯色款");

/* ---------- 6. 颜色表有效性 ---------- */
[M.SKIN_LIST, M.HAIR_COLORS].forEach(function (list) {
  ok(list.every(function (v) { return M.isHexColor(v.color); }), "色表全为合法 #rrggbb");
});
ok(M.BG_LIST.every(function (b) {
  return b.type === "solid" ? M.isHexColor(b.color) : (M.isHexColor(b.from) && M.isHexColor(b.to));
}), "背景色/渐变色合法");
ok(!M.isHexColor("red") && !M.isHexColor("#fff") && !M.isHexColor("#gggggg"), "isHexColor 拒绝非法值");

/* ---------- 7. 导出尺寸表 ---------- */
deepEq(M.EXPORT_SIZES, [64, 128, 256, 512], "导出四档为 64/128/256/512");
ok(M.EXPORT_SIZES.every(function (s) { return s >= 16 && s <= 2048; }), "导出尺寸在合理范围");

/* ---------- 8. buildSVG 确定性 ---------- */
var svgA1 = M.buildSVG(d1, { transparent: false });
var svgA2 = M.buildSVG(d1, { transparent: false });
eq(svgA1, svgA2, "同一描述两次 SVG 字符串完全一致");
var svgB = M.buildSVG(d3, { transparent: false });
ok(svgA1 !== svgB, "不同描述 SVG 字符串不同");
ok(svgA1.indexOf('width="200"') >= 0 && svgA1.indexOf('viewBox="0 0 200 200"') >= 0,
  "SVG 含显式宽高＋viewBox（跨浏览器光栅化）");
ok(svgA1.indexOf(M.SKIN_LIST[d1.sk].color) >= 0, "SVG 使用所选肤色");
ok(svgA1.indexOf(M.HAIR_COLORS[d1.hc].color) >= 0, "SVG 使用所选发色");
ok(svgA1.indexOf("<text") < 0, "SVG 无 <text>（字体跨浏览器风险）");
var svgT = M.buildSVG(d1, { transparent: true });
ok(svgT.indexOf("<rect x=\"0\" y=\"0\" width=\"200\" height=\"200\"") < 0,
  "透明底 SVG 不含背景矩形");
ok(svgA1.indexOf('xmlns="http://www.w3.org/2000/svg"') >= 0, "SVG 含 xmlns（Image 光栅化必需）");
/* 各图层绘制函数对全部变体不抛错 */
["bg", "sk", "fa", "ha", "hc", "ey", "br", "mo", "ac"].forEach(function (k) {
  var list = { bg: M.BG_LIST, sk: M.SKIN_LIST, fa: M.FACE_LIST, ha: M.HAIR_LIST, hc: M.HAIR_COLORS,
    ey: M.EYE_LIST, br: M.BROW_LIST, mo: M.MOUTH_LIST, ac: M.ACC_LIST }[k];
  for (var i = 0; i < list.length; i++) {
    var dd = M.normalizeDescriptor(d1);
    dd[k] = i;
    var s = M.buildSVG(dd, {});
    ok(typeof s === "string" && s.length > 500, "图层 " + k + " 变体 " + i + " 可绘制");
  }
});

/* ---------- 9. 导出文件名 ---------- */
eq(M.buildExportFilename(12345678, 256), "avatar-12345678-256px.png", "文件名格式 avatar-<种子>-<尺寸>px.png");
M.EXPORT_SIZES.forEach(function (s) {
  ok(/^avatar-\d+-64px\.png$|^avatar-\d+-(128|256|512)px\.png$/.test(M.buildExportFilename(7, s)),
    "尺寸 " + s + " 文件名含种子＋尺寸");
});

/* ---------- 10. 模板静态检查 ---------- */
ok(TPL_SRC.indexOf("<title>") >= 0 && TPL_SRC.indexOf("头像生成器") >= 0, "模板 title 含头像生成器");
ok(TPL_SRC.indexOf('name="description"') >= 0, "模板有 meta description");
ok(TPL_SRC.indexOf('name="keywords"') >= 0 && TPL_SRC.indexOf("avatar generator") >= 0, "模板 keywords 含中英关键词");
ok(TPL_SRC.indexOf('rel="canonical"') >= 0 && TPL_SRC.indexOf("/tools/avatar-generator") >= 0,
  "模板 canonical 指向 /tools/avatar-generator");
ok(TPL_SRC.indexOf("og:title") >= 0 && TPL_SRC.indexOf("og:description") >= 0, "模板有 OG 标签");
ok(TPL_SRC.indexOf("application/ld+json") >= 0 && TPL_SRC.indexOf("SoftwareApplication") >= 0,
  "模板有 JSON-LD SoftwareApplication");
ok(TPL_SRC.indexOf('/tools/static/js/avatar_generator.js') >= 0, "模板引用 avatar_generator.js");
["ag-random", "ag-shuffle", "ag-seed-input", "ag-restore", "ag-copy-json", "ag-grid",
 "ag-main-canvas", "ag-transparent", "ag-download", "ag-copy", "ag-status"].forEach(function (id) {
  ok(TPL_SRC.indexOf('id="' + id + '"') >= 0, "模板含控件 #" + id);
});
["ag-bg", "ag-skin", "ag-face", "ag-hair", "ag-hc", "ag-eyes", "ag-brows", "ag-mouth", "ag-acc"]
  .forEach(function (id) {
    ok(TPL_SRC.indexOf('id="' + id + '"') >= 0, "模板含图层下拉 #" + id);
  });
ok(TPL_SRC.indexOf('name="ag-size"') >= 0, "模板有导出尺寸选择");
ok(TPL_SRC.indexOf("{{define \"avatar_generator\"}}") >= 0, "模板 define 名为 avatar_generator");
ok(TPL_SRC.indexOf("使用说明") >= 0 && TPL_SRC.indexOf("常见问题") >= 0 && TPL_SRC.indexOf("相关工具") >= 0,
  "模板 SEO 面板含使用说明/FAQ/相关工具");

/* ---------- 11. 零网络请求 ---------- */
ok(JS_SRC.indexOf("fetch(") < 0, "JS 无 fetch(");
ok(JS_SRC.indexOf("XMLHttpRequest") < 0, "JS 无 XMLHttpRequest");
ok(!/https?:\/\/(?!www\.w3\.org)/.test(JS_SRC), "JS 无外部 http(s) 请求（xmlns 除外）");
ok(JS_SRC.indexOf("foreignObject") < 0, "JS 无 foreignObject");

/* ---------- 12. clampIndex ---------- */
eq(M.clampIndex(3, 8), 3, "clampIndex 正常值");
eq(M.clampIndex(-1, 8), 0, "clampIndex 负数钳到 0");
eq(M.clampIndex(99, 8), 7, "clampIndex 越界钳到末尾");
eq(M.clampIndex("abc", 8), 0, "clampIndex 非数字回 0");

console.log("\n头像生成器测试：通过 " + pass + "，失败 " + fail);
process.exit(fail ? 1 : 0);
