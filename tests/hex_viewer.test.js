/* 文件十六进制查看器纯逻辑单元测试（零依赖）：node tests/hex_viewer.test.js
 * 覆盖：确定性向量（规格逐字命中）、错误约定（err.field）、
 * 搜索/查找逻辑、注册、互链、真限制四条、零网络请求静态检查。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/hex_viewer.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function eqArr(a, b, name) {
  ok(Array.isArray(a) && a.length === b.length && a.every(function (v, i) { return v === b[i]; }),
    name + "（期望 [" + b.join(",") + "]，实得 " + JSON.stringify(a) + "）");
}
function eqBytes(a, arr, name) {
  ok(a instanceof Uint8Array && a.length === arr.length &&
    Array.prototype.every.call(a, function (v, i) { return v === arr[i]; }),
    name + "（期望 [" + arr.join(",") + "]，实得 " + JSON.stringify(Array.from(a || [])) + "）");
}
function throwsField(fn, field, name) {
  try { fn(); } catch (e) {
    ok(e instanceof Error && e.field === field,
      name + "（期望抛 Error 且 err.field=" + JSON.stringify(field) + "，实得 " +
      (e instanceof Error ? "Error field=" + JSON.stringify(e.field) : typeof e) + "）");
    return;
  }
  fail++; console.error("FAIL:", name + "（未抛出异常）");
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "hex_viewer.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "hex_viewer.html"), "utf8");
var HX_TPL = fs.readFileSync(path.join(ROOT, "templates", "hex_c_array.html"), "utf8");
var BW_TPL = fs.readFileSync(path.join(ROOT, "templates", "bitwise_calculator.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. formatHexRow 确定性向量 ---------- */
var r = M.formatHexRow([0x41, 0x42, 0x00, 0x7F], 0);
eq(r.offset, "00000000", "formatHexRow 规格向量 offset");
eqArr(r.hex, ["41", "42", "00", "7F"], "formatHexRow 规格向量 hex");
eq(r.ascii, "AB..", "formatHexRow 规格向量 ascii");
eq(M.formatHexRow([0x41], 0x1234).offset, "00001234", "formatHexRow 偏移 0x1234 补零");
eq(M.formatHexRow(new Uint8Array([0xFF, 0x0A]), 16).ascii, "..", "formatHexRow Uint8Array 输入");
eq(M.formatHexRow([0x20, 0x7E, 0x1F, 0x80], 0).ascii, " ~..", "formatHexRow 可打印边界 0x20/0x7E");
throwsField(function () { M.formatHexRow([300], 0); }, "bytes", "formatHexRow 非法字节 300 抛错");
throwsField(function () { M.formatHexRow("nope", 0); }, "bytes", "formatHexRow 非数组抛错");
throwsField(function () { M.formatHexRow([0x41], -1); }, "offset", "formatHexRow 负偏移抛错");
throwsField(function () { M.formatHexRow([0x41], 1.5); }, "offset", "formatHexRow 小数偏移抛错");
throwsField(function () { M.formatHexRow([0x41], "x"); }, "offset", "formatHexRow 非数字偏移抛错");

/* ---------- 2. isPrintable ---------- */
ok(M.isPrintable(0x41) === true, "isPrintable(0x41)");
ok(M.isPrintable(0x20) === true, "isPrintable(0x20) 下界");
ok(M.isPrintable(0x7E) === true, "isPrintable(0x7E) 上界");
ok(M.isPrintable(0x00) === false, "isPrintable(0x00)");
ok(M.isPrintable(0x1F) === false, "isPrintable(0x1F)");
ok(M.isPrintable(0x7F) === false, "isPrintable(0x7F)");
ok(M.isPrintable(0x80) === false, "isPrintable(0x80)");
ok(M.isPrintable(0xFF) === false, "isPrintable(0xFF)");
throwsField(function () { M.isPrintable(256); }, "byte", "isPrintable(256) 抛错");
throwsField(function () { M.isPrintable(-1); }, "byte", "isPrintable(-1) 抛错");
throwsField(function () { M.isPrintable("a"); }, "byte", "isPrintable 非数字抛错");

/* ---------- 3. byteInspector 确定性向量 ---------- */
var bi = M.byteInspector(0x41, 16);
eq(bi.offsetHex, "00000010", "byteInspector 规格向量 offsetHex");
eq(bi.hex, "41", "byteInspector 规格向量 hex");
eq(bi.decimal, 65, "byteInspector 规格向量 decimal");
eq(bi.binary, "01000001", "byteInspector 规格向量 binary");
eq(bi.char, "A", "byteInspector 规格向量 char");
var bi2 = M.byteInspector(0x00, 0);
eq(bi2.char, ".", "byteInspector 不可打印字符显示 .");
eq(bi2.binary, "00000000", "byteInspector(0) binary");
eq(bi2.offsetHex, "00000000", "byteInspector(0) offsetHex");
throwsField(function () { M.byteInspector(256, 0); }, "byte", "byteInspector 非法字节抛错");
throwsField(function () { M.byteInspector(0x41, -1); }, "offset", "byteInspector 非法偏移抛错");

/* ---------- 4. parseHexSearch 确定性向量 ---------- */
eqBytes(M.parseHexSearch("0x41, 42"), [0x41, 0x42], "parseHexSearch 规格向量 '0x41, 42'");
eqBytes(M.parseHexSearch("41 42 43"), [0x41, 0x42, 0x43], "parseHexSearch 空格分隔");
eqBytes(M.parseHexSearch("A1,b2"), [0xA1, 0xB2], "parseHexSearch 逗号分隔大小写混写");
eqBytes(M.parseHexSearch("0Xff"), [0xFF], "parseHexSearch 大写 0X 前缀");
throwsField(function () { M.parseHexSearch("zz"); }, "query", "parseHexSearch 'zz' 抛错 field=query");
throwsField(function () { M.parseHexSearch(""); }, "query", "parseHexSearch 空输入抛错");
throwsField(function () { M.parseHexSearch("   ,"); }, "query", "parseHexSearch 纯分隔符抛错");
throwsField(function () { M.parseHexSearch("A1B"); }, "query", "parseHexSearch 奇数位抛错");
throwsField(function () { M.parseHexSearch("A1:G2"); }, "query", "parseHexSearch 冒号分隔抛错");
throwsField(function () { M.parseHexSearch(123); }, "query", "parseHexSearch 非字符串抛错");

/* ---------- 5. parseAsciiSearch ---------- */
eqBytes(M.parseAsciiSearch("AB"), [65, 66], "parseAsciiSearch 'AB'");
eqBytes(M.parseAsciiSearch("~"), [0x7E], "parseAsciiSearch '~'");
throwsField(function () { M.parseAsciiSearch(""); }, "query", "parseAsciiSearch 空输入抛错");

/* ---------- 6. findBytes 确定性向量 ---------- */
eqArr(M.findBytes([0x41, 0x42, 0x41, 0x42], [0x41, 0x42]), [0, 2], "findBytes 规格向量 [0,2]");
eqArr(M.findBytes([0x41, 0x41, 0x41], [0x41, 0x41]), [0, 1], "findBytes 重叠匹配");
eqArr(M.findBytes([0x01, 0x02], [0x03]), [], "findBytes 无匹配为空数组");
eqArr(M.findBytes([0x01], [0x01, 0x02]), [], "findBytes 针比干草长为空数组");
eqArr(M.findBytes(new Uint8Array([1, 2, 1, 2]), new Uint8Array([1, 2])), [0, 2], "findBytes Uint8Array 输入");
throwsField(function () { M.findBytes([1, 2], []); }, "needle", "findBytes 空针抛错 field=needle");
throwsField(function () { M.findBytes("x", [1]); }, "haystack", "findBytes 非法干草堆 field=haystack");
throwsField(function () { M.findBytes([1], [300]); }, "needle", "findBytes 非法针字节 field=needle");

/* ---------- 7. 双模式导出 ---------- */
["formatHexRow", "isPrintable", "byteInspector", "parseHexSearch", "parseAsciiSearch", "findBytes"]
  .forEach(function (k) { ok(typeof M[k] === "function", "导出函数 " + k); });

/* ---------- 8. 注册 ---------- */
ok(/ID:\s*"hex_viewer"/.test(GO_SRC), "categories.go 注册 ID hex_viewer");
ok(/Name:\s*"文件十六进制查看器"/.test(GO_SRC), "categories.go 注册 Name 文件十六进制查看器");
ok(/Path:\s*"\/tools\/hex-viewer"/.test(GO_SRC), "categories.go 注册 Path /tools/hex-viewer");
ok(/ID:\s*"hex_viewer"[\s\S]{0,2000}?Category:\s*"开发工具"/.test(GO_SRC), "hex_viewer 归属开发工具品类");
ok(/ID:\s*"hex_viewer"[\s\S]{0,2000}?New:\s*true/.test(GO_SRC), "hex_viewer New:true");
ok(/ID:\s*"hex_viewer"[\s\S]{0,2000}?Icon:\s*"binary_info"/.test(GO_SRC), "hex_viewer Icon:binary_info");
var regBlock = GO_SRC.split('"hex_viewer"')[1].split("},")[0];
ok(/Hex viewer/i.test(regBlock), "Description 中英文双语（含英文）");
ok(regBlock.indexOf("零上传") !== -1, "Description 含零上传声明");
ok(/{{define "hex_viewer"}}/.test(TPL_SRC), "模板 define hex_viewer");
ok(/https:\/\/www\.johnkingzcq123\.xyz\/tools\/hex-viewer/.test(TPL_SRC), "模板 canonical");
var paths = GO_SRC.match(/"\/tools\/[^"]+"/g) || [];
ok(new Set(paths).size === 236, "全量 Path 数 236（实得 " + new Set(paths).size + "）");

/* ---------- 9. 互链（查看 vs 互转 vs 运算） ---------- */
ok(TPL_SRC.indexOf("/tools/hex-c-array") !== -1, "hex_viewer 互链 HEX ↔ C 数组互转器");
ok(TPL_SRC.indexOf("/tools/bitwise-calculator") !== -1, "hex_viewer 互链位运算计算器");
ok(TPL_SRC.indexOf("查看 vs 互转 vs 运算") !== -1, "hex_viewer 互链文案：查看 vs 互转 vs 运算");
ok(HX_TPL.indexOf("/tools/hex-viewer") !== -1, "hex_c_array 回链文件十六进制查看器");
ok(BW_TPL.indexOf("/tools/hex-viewer") !== -1, "bitwise_calculator 回链文件十六进制查看器");
var hrefRe = /href="(\/tools\/[a-z0-9\-\/]+)"/g;
var hm, bad = [];
while ((hm = hrefRe.exec(TPL_SRC)) !== null) {
  if (hm[1] === "/tools/static") continue;
  if (GO_SRC.indexOf('"' + hm[1] + '"') < 0) bad.push(hm[1]);
}
eq(bad.length, 0, "模板外链全部已注册（实得未注册：" + JSON.stringify(bad) + "）");

/* ---------- 10. 真限制四条页面明示 ---------- */
ok(TPL_SRC.indexOf("256MB") !== -1 && TPL_SRC.indexOf("分片") !== -1, "真限制①：>256MB 级大文件仅分片读取/分页预览");
ok(TPL_SRC.indexOf("只读") !== -1, "真限制②：只读查看无编辑");
ok(TPL_SRC.indexOf("Latin-1") !== -1 && TPL_SRC.indexOf("多字节") !== -1, "真限制③：ASCII 列按 Latin-1，多字节字符显示字节序列");
ok(TPL_SRC.indexOf("零上传") !== -1 && TPL_SRC.indexOf("本地") !== -1, "真限制④：全程本地零上传");

/* ---------- 11. 零网络请求静态检查 ---------- */
ok(!/fetch\s*\(/.test(JS_SRC), "JS 无 fetch");
ok(!/XMLHttpRequest/.test(JS_SRC), "JS 无 XMLHttpRequest");
ok(!/WebSocket/.test(JS_SRC), "JS 无 WebSocket");
ok(!/<script[^>]*src\s*=\s*"https?:\/\//.test(TPL_SRC), "模板无外部 script");
ok(!/<link[^>]*rel\s*=\s*"stylesheet"[^>]*href\s*=\s*"https?:\/\//.test(TPL_SRC), "模板无外部样式");
ok(!/fetch\s*\(|XMLHttpRequest/.test(TPL_SRC), "模板无 fetch/XHR");

console.log("\n通过 " + pass + "，失败 " + fail);
process.exit(fail === 0 ? 0 : 1);
