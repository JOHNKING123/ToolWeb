/* CRC 校验和计算器纯逻辑单元测试（零依赖）：node tests/crc_checksum_calculator.test.js
 * 覆盖：6 组标准向量、空输入、文本与文件字节一致性、分片增量一致性、
 * 十六进制格式化、期望值比对正反例、注册与零网络请求静态检查。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/crc_checksum_calculator.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "crc_checksum_calculator.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "crc_checksum_calculator.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

function hexOf(results, id) {
  var i;
  for (i = 0; i < results.length; i++) {
    if (results[i].id === id) return results[i].hex;
  }
  return null;
}
function resultOf(results, id) {
  var i;
  for (i = 0; i < results.length; i++) {
    if (results[i].id === id) return results[i];
  }
  return null;
}

var VEC = M.computeAll(M.encodeUtf8("123456789"));
eq(VEC.length, 6, "标准向量：共 6 组结果");

/* ---------- 1. 6 组标准向量（十六进制 + 十进制） ---------- */
eq(hexOf(VEC, "crc32"), "CBF43926", "标准向量 CRC32");
eq(hexOf(VEC, "crc32c"), "E3069283", "标准向量 CRC32C");
eq(hexOf(VEC, "crc16-modbus"), "4B37", "标准向量 CRC16/MODBUS");
eq(hexOf(VEC, "crc16-ccitt-false"), "29B1", "标准向量 CRC16/CCITT-FALSE");
eq(hexOf(VEC, "crc16-xmodem"), "31C3", "标准向量 CRC16/XMODEM");
eq(hexOf(VEC, "crc16-arc"), "BB3D", "标准向量 CRC16/ARC");
eq(resultOf(VEC, "crc32").dec, 3421780262, "标准向量 CRC32 十进制");
eq(resultOf(VEC, "crc16-modbus").dec, 19255, "标准向量 CRC16/MODBUS 十进制");

/* ---------- 2. 空输入标准值 ---------- */
var EMPTY = M.computeAll(new Uint8Array(0));
eq(hexOf(EMPTY, "crc32"), "00000000", "空输入 CRC32");
eq(hexOf(EMPTY, "crc32c"), "00000000", "空输入 CRC32C");
eq(hexOf(EMPTY, "crc16-modbus"), "FFFF", "空输入 CRC16/MODBUS");
eq(hexOf(EMPTY, "crc16-ccitt-false"), "FFFF", "空输入 CRC16/CCITT-FALSE");
eq(hexOf(EMPTY, "crc16-xmodem"), "0000", "空输入 CRC16/XMODEM");
eq(hexOf(EMPTY, "crc16-arc"), "0000", "空输入 CRC16/ARC");

/* ---------- 3. 文本与文件字节一致性 + 分片增量一致性 ---------- */
var textBytes = M.encodeUtf8("123456789");
var fileBytes = new Uint8Array([0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39]);
eq(JSON.stringify(M.computeAll(fileBytes).map(function (r) { return r.hex; })),
  JSON.stringify(VEC.map(function (r) { return r.hex; })),
  "同一内容：文本输入与文件原始字节结果一致");
var chunked = M.createAllStates();
chunked.update(M.encodeUtf8("1234"));
chunked.update(M.encodeUtf8("56789"));
eq(JSON.stringify(chunked.results().map(function (r) { return r.hex; })),
  JSON.stringify(VEC.map(function (r) { return r.hex; })),
  "分片增量计算与一次性计算结果一致");
var chinese = M.encodeUtf8("你好");
eq(chinese.length, 6, "中文文本按 UTF-8 编码为 6 字节");
eq(JSON.stringify(M.computeAll(chinese).map(function (r) { return r.hex; })),
  JSON.stringify(M.computeAll(new Uint8Array([0xE4, 0xBD, 0xA0, 0xE5, 0xA5, 0xBD])).map(function (r) { return r.hex; })),
  "中文文本 UTF-8 字节与手动构造字节结果一致");

/* ---------- 4. 十六进制格式化 ---------- */
eq(M.formatHex(0xCBF43926, 32), "CBF43926", "格式化 CRC32 8 位大写");
eq(M.formatHex(0x4B37, 16), "4B37", "格式化 CRC16 4 位大写");
eq(M.formatHex(0xAB, 16), "00AB", "格式化 CRC16 前导补零");
eq(M.formatHex(0, 32), "00000000", "格式化零值 8 位");
eq(M.formatHex(0, 16), "0000", "格式化零值 4 位");

/* ---------- 5. 期望值比对：正反例 ---------- */
var crc32 = resultOf(VEC, "crc32");
eq(M.compareOne(crc32, "CBF43926").state, "match", "比对：完全一致");
eq(M.compareOne(crc32, "0xCBF43926").state, "match", "比对：0x 前缀剥离后一致");
eq(M.compareOne(crc32, "cbf43926").state, "match", "比对：小写一致（大小写不敏感）");
eq(M.compareOne(crc32, "0xcbf43926").state, "match", "比对：0x 前缀 + 小写一致");
eq(M.compareOne(crc32, "CBF43927").state, "mismatch", "比对：末位不同为不一致");
eq(M.compareOne(crc32, "").state, "empty", "比对：空期望值未填写");
eq(M.compareOne(crc32, "ZZZ").state, "invalid", "比对：非十六进制为非法");
eq(M.compareOne(crc32, "0x").state, "invalid", "比对：仅 0x 前缀为非法");
eq(M.parseExpected("0x4B37").value, 0x4B37, "期望值解析：0x 前缀剥离取值");
eq(M.parseExpected("  29b1  ").value, 0x29B1, "期望值解析：空白与小写容忍");

/* ---------- 6. 变体元数据 ---------- */
eq(M.VARIANT_IDS.length, 6, "变体共 6 组");
eq(M.variantById("crc16-modbus").bits, 16, "变体元数据 MODBUS 为 16 位");
eq(M.variantById("crc32c").bits, 32, "变体元数据 CRC32C 为 32 位");
ok(M.variantById("crc16-ccitt-false").params.indexOf("0x1021") >= 0, "变体参数 CCITT-FALSE 含多项式 0x1021");
ok(M.variantById("crc16-modbus").params.indexOf("0xFFFF") >= 0, "变体参数 MODBUS 含初值 0xFFFF");

/* ---------- 7. 复制全部 / 下载文本与页面输出一致 ---------- */
var allText = M.buildAllText(VEC);
ok(allText.indexOf("CBF43926") >= 0, "复制全部含 CRC32 值");
ok(allText.indexOf("E3069283") >= 0, "复制全部含 CRC32C 值");
ok(allText.indexOf("4B37") >= 0, "复制全部含 MODBUS 值");
ok(allText.indexOf("BB3D") >= 0, "复制全部含 ARC 值");
eq(allText.split("\n").length, 6, "复制全部共 6 行");

/* ---------- 8. 注册与静态检查 ---------- */
ok(GO_SRC.indexOf('"crc_checksum_calculator"') >= 0, "categories.go 注册 ID");
ok(GO_SRC.indexOf('"/tools/crc-checksum-calculator"') >= 0, "categories.go 注册 Path");
var idx = GO_SRC.indexOf('"crc_checksum_calculator"');
ok(GO_SRC.slice(idx, idx + 800).indexOf('Category:    "加密解密"') >= 0, "注册 Category 为加密解密");
ok(GO_SRC.slice(idx, idx + 800).indexOf("New:         true") >= 0, "注册 New 为 true");
var pathCount = 0;
var m;
var re = /"\/tools\/[^"]+"/g;
var seen = {};
while ((m = re.exec(GO_SRC)) !== null) { if (!seen[m[0]]) { seen[m[0]] = true; pathCount++; } }
eq(pathCount, 189, "注册 Path 总数 188→189");
ok(JS_SRC.indexOf("fetch(") < 0 && JS_SRC.indexOf("XMLHttpRequest") < 0, "JS 零 fetch/XHR");
ok(!/src="https?:\/\//.test(TPL_SRC), "模板无外部脚本/样式引用");
ok(TPL_SRC.indexOf("只算校验值、不做文件修复") >= 0, "模板含真限制：只算校验值、不做文件修复");
ok(TPL_SRC.indexOf("CRC不是加密哈希、不防篡改") >= 0, "模板含真限制：CRC不是加密哈希、不防篡改");
ok(TPL_SRC.indexOf("变体结果不可混用") >= 0, "模板含真限制：变体结果不可混用");
ok(TPL_SRC.indexOf("文本按UTF-8编码计算") >= 0, "模板含真限制：文本按UTF-8编码计算");
ok(TPL_SRC.indexOf("/tools/file-checksum") >= 0, "互链文件校验和计算器");
ok(TPL_SRC.indexOf("/tools/sha256") >= 0, "互链 SHA256 摘要");
ok(TPL_SRC.indexOf("jsonpath") < 0 && TPL_SRC.indexOf("toml") < 0, "模板不含未交付工具硬凑互链");

console.log("crc_checksum_calculator: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
