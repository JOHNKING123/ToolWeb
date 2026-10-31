/* HEX ↔ C 数组互转器纯逻辑单元测试（零依赖）：node tests/hex_c_array.test.js
 * 覆盖：确定性向量（规格逐字命中）、错误约定（err.field="input"）、
 * round-trip 不变式、选项校验、注册与零网络请求静态检查。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/hex_c_array.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function throwsField(fn, field, name) {
  try { fn(); } catch (e) {
    ok(e instanceof Error && e.field === field,
      name + "（期望抛 Error 且 err.field=" + JSON.stringify(field) + "，实得 " +
      (e instanceof Error ? "Error field=" + JSON.stringify(e.field) : typeof e) + "）");
    return;
  }
  fail++; console.error("FAIL:", name + "（未抛出异常）");
}
function eqBytes(a, arr, name) {
  ok(a instanceof Uint8Array && a.length === arr.length &&
    Array.prototype.every.call(a, function (v, i) { return v === arr[i]; }),
    name + "（期望 [" + arr.join(",") + "]，实得 " + JSON.stringify(Array.from(a || [])) + "）");
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "hex_c_array.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "hex_c_array.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. parseHex 确定性向量 ---------- */
eqBytes(M.parseHex("A1 B2, 0xc3\nD4"), [0xA1, 0xB2, 0xC3, 0xD4], "parseHex 规格向量");
eqBytes(M.parseHex("A1B2C3"), [0xA1, 0xB2, 0xC3], "parseHex 连续写法");
eqBytes(M.parseHex("0xa1,0XB2"), [0xA1, 0xB2], "parseHex 0x 前缀大小写混写");
throwsField(function () { M.parseHex("zz"); }, "input", "parseHex 非法字符 zz 抛错");
throwsField(function () { M.parseHex(""); }, "input", "parseHex 空输入抛错");
throwsField(function () { M.parseHex("   \n,"); }, "input", "parseHex 纯分隔符抛错");
throwsField(function () { M.parseHex("A1B"); }, "input", "parseHex 奇数位抛错");
throwsField(function () { M.parseHex("A1:G2"); }, "input", "parseHex 冒号分隔符抛错");

/* ---------- 2. parseByteList ---------- */
eqBytes(M.parseByteList("161, 178, 195"), [161, 178, 195], "parseByteList 基本向量");
eqBytes(M.parseByteList("0,255"), [0, 255], "parseByteList 边界 0/255");
throwsField(function () { M.parseByteList("256"); }, "input", "parseByteList 256 抛错");
throwsField(function () { M.parseByteList("12, abc"); }, "input", "parseByteList 非数字抛错");
throwsField(function () { M.parseByteList(""); }, "input", "parseByteList 空输入抛错");

/* ---------- 3. parseCArray 确定性向量 ---------- */
var pc = M.parseCArray("const uint8_t data[4] = { 0xA1, 0xB2, 195, 0xD4 };");
eqBytes(pc.bytes, [0xA1, 0xB2, 0xC3, 0xD4], "parseCArray 规格向量 bytes");
eq(pc.name, "data", "parseCArray 规格向量 name");
var pc2 = M.parseCArray("unsigned char buf[] = { A1h, 0xB2, 12 };");
eqBytes(pc2.bytes, [0xA1, 0xB2, 12], "parseCArray unsigned char＋h 后缀＋十进制");
eq(pc2.name, "buf", "parseCArray 无 const 仍取数组名");
var pc3 = M.parseCArray("char c[2]={0x01,0x02}");
eqBytes(pc3.bytes, [1, 2], "parseCArray char 紧凑写法");
throwsField(function () { M.parseCArray("int x[] = { 1 };"); }, "input", "parseCArray 非法类型抛错");
throwsField(function () { M.parseCArray("const uint8_t d[] = { 0x1FF };"); }, "input", "parseCArray 元素超限抛错");
throwsField(function () { M.parseCArray("hello world"); }, "input", "parseCArray 非 C 数组抛错");

/* ---------- 4. toCArray 确定性向量 ---------- */
eq(M.toCArray(new Uint8Array([0xA1, 0xB2, 0xC3, 0xD4]),
  { name: "buf", type: "uint8_t", perLine: 8, prefix: "0x", uppercase: true }),
  "const uint8_t buf[4] = {\n    0xA1, 0xB2, 0xC3, 0xD4\n};",
  "toCArray 规格向量逐字命中");
eq(M.toCArray(new Uint8Array([0xA1, 0xB2]),
  { name: "d", type: "unsigned char", perLine: 1, prefix: "h", uppercase: false }),
  "const unsigned char d[2] = {\n    a1h,\n    b2h\n};",
  "toCArray h 后缀＋小写＋每行1字节");
throwsField(function () { M.toCArray(new Uint8Array([1]), { name: "1bad" }); }, "name", "toCArray 非法数组名抛错");
throwsField(function () { M.toCArray(new Uint8Array([1]), { type: "uint16_t" }); }, "type", "toCArray 非法类型抛错");
throwsField(function () { M.toCArray(new Uint8Array([1]), { perLine: 0 }); }, "perLine", "toCArray 非法每行数抛错");
throwsField(function () { M.toCArray(new Uint8Array([1]), { prefix: "$" }); }, "prefix", "toCArray 非法前缀抛错");
throwsField(function () { M.toCArray([300]); }, "bytes", "toCArray 非法字节不静默钳制");

/* ---------- 5. toHexString round-trip ---------- */
var raw = new Uint8Array([0xA1, 0xB2, 0xC3, 0xD4, 0x00, 0xFF]);
["plain", "spaced", "0x"].forEach(function (fmt) {
  var s = M.toHexString(raw, { format: fmt, uppercase: true });
  eqBytes(M.parseHex(s), [0xA1, 0xB2, 0xC3, 0xD4, 0x00, 0xFF],
    "toHexString(" + fmt + ")→parseHex round-trip 字节一致");
});
eq(M.toHexString(raw, { format: "plain", uppercase: false }), "a1b2c3d400ff", "toHexString plain 小写");
eq(M.toHexString(raw.slice(0, 2), { format: "0x", uppercase: true }), "0xA1, 0xB2", "toHexString 0x 格式");
throwsField(function () { M.toHexString(raw, { format: "bin" }); }, "format", "toHexString 非法格式抛错");

/* ---------- 6. toByteList / toBase64 / formatBytes ---------- */
eq(M.toByteList(new Uint8Array([0xA1, 0xB2, 0xC3, 0xD4])), "161, 178, 195, 212", "toByteList 向量");
eq(M.toBase64(new Uint8Array([0xA1, 0xB2, 0xC3, 0xD4])), "obLD1A==", "toBase64 向量");
eqBytes(M.parseHex(M.toHexString(raw, { format: "spaced", uppercase: false })), Array.from(raw), "toHexString 小写 round-trip");
eq(M.formatBytes(1536), "1.5 KB", "formatBytes(1536)");
eq(M.formatBytes(500), "500 B", "formatBytes(500)");
eq(M.formatBytes(1048576), "1.00 MB", "formatBytes(1MB)");

/* ---------- 7. 双模式导出 ---------- */
["parseHex", "parseByteList", "parseCArray", "toCArray", "toHexString", "toByteList", "toBase64", "formatBytes"]
  .forEach(function (k) { ok(typeof M[k] === "function", "导出函数 " + k); });

/* ---------- 8. 注册 ---------- */
ok(/ID:\s*"hex_c_array"/.test(GO_SRC), "categories.go 注册 ID hex_c_array");
ok(/Path:\s*"\/tools\/hex-c-array"/.test(GO_SRC), "categories.go 注册 Path /tools/hex-c-array");
ok(/ID:\s*"hex_c_array"[\s\S]{0,800}?Category:\s*"开发工具"/.test(GO_SRC), "hex_c_array 归属开发工具品类");
ok(/ID:\s*"hex_c_array"[\s\S]{0,800}?New:\s*true/.test(GO_SRC), "hex_c_array New:true");
ok(/{{define "hex_c_array"}}/.test(TPL_SRC), "模板 define hex_c_array");
ok(/https:\/\/www\.johnkingzcq123\.xyz\/tools\/hex-c-array/.test(TPL_SRC), "模板 canonical");
var paths = GO_SRC.match(/"\/tools\/[^"]+"/g) || [];
ok(new Set(paths).size === 243, "全量 Path 数 243（实得 " + new Set(paths).size + "）");

/* ---------- 9. 零网络请求静态检查 ---------- */
ok(!/fetch\s*\(/.test(JS_SRC), "JS 无 fetch");
ok(!/XMLHttpRequest/.test(JS_SRC), "JS 无 XMLHttpRequest");
ok(!/WebSocket/.test(JS_SRC), "JS 无 WebSocket");
ok(!/<script[^>]*src\s*=\s*"https?:\/\//.test(TPL_SRC), "模板无外部 script");
ok(!/<link[^>]*rel\s*=\s*"stylesheet"[^>]*href\s*=\s*"https?:\/\//.test(TPL_SRC), "模板无外部样式");
ok(!/fetch\s*\(|XMLHttpRequest/.test(TPL_SRC), "模板无 fetch/XHR");
ok(/只做格式互转/.test(TPL_SRC), "页面明示只做格式互转");
ok(/\/tools\/modbus-frame/.test(TPL_SRC), "模板互链 Modbus");
ok(/\/tools\/crc-checksum-calculator/.test(TPL_SRC), "模板互链 CRC");
ok(/\/tools\/register-bitfield/.test(TPL_SRC), "模板互链寄存器位域");
ok(!/(?<![\w"'])fetch\s*\(/.test(TPL_SRC), "模板无 fetch 调用");

console.log("hex_c_array: pass=" + pass + " fail=" + fail);
process.exit(fail ? 1 : 0);
