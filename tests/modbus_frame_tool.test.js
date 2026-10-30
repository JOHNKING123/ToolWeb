/* Modbus RTU 帧生成与校验器纯逻辑单元测试（零依赖）：node tests/modbus_frame_tool.test.js
 * 覆盖：校验向量（CRC16/MODBUS 标准值＋非法参数抛错 err.field）、
 * 生成向量（固定示例、10 功能字节数、formatHex 双格式、suggestExportName）、
 * 解析向量（正确帧、CRC 改一位、异常帧、未知功能码）、注册与零网络请求静态检查。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/modbus_frame_tool.js");

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

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "modbus_frame_tool.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "modbus_frame_tool.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. 校验向量 ---------- */
var crc = M.crc16Modbus([0x01, 0x03, 0x00, 0x00, 0x00, 0x02]);
eq(crc.lo, 0xC4, "crc16Modbus 向量：低字节 0xC4");
eq(crc.hi, 0x0B, "crc16Modbus 向量：高字节 0x0B");
eq(crc.hex, "0BC4", "crc16Modbus 向量：hex 0BC4");
eq(M.crc16Modbus([]).hex, "FFFF", "crc16Modbus 空输入标准值 FFFF");

throwsField(function () { M.buildReadFrame({ slaveAddr: 0, function: 3, address: 0, quantity: 2 }); },
  "slaveAddr", "buildReadFrame 非法 slaveAddr=0 抛错");
throwsField(function () { M.buildReadFrame({ slaveAddr: 248, function: 3, address: 0, quantity: 2 }); },
  "slaveAddr", "buildReadFrame 非法 slaveAddr=248 抛错");
throwsField(function () { M.buildReadFrame({ slaveAddr: 1, function: 3, address: 0, quantity: 126 }); },
  "quantity", "buildReadFrame 03 功能数量 126 抛错");
throwsField(function () { M.buildReadFrame({ slaveAddr: 1, function: 1, address: 0, quantity: 2001 }); },
  "quantity", "buildReadFrame 01 功能数量 2001 抛错");
throwsField(function () { M.buildReadFrame({ slaveAddr: 1, function: 7, address: 0, quantity: 2 }); },
  "function", "buildReadFrame 非法功能码 07 抛错");
throwsField(function () { M.buildWriteSingle({ slaveAddr: 1, function: 5, address: 0, value: 0x1234 }); },
  "value", "05 写线圈 value=0x1234 抛错");
throwsField(function () { M.buildWriteSingle({ slaveAddr: 1, function: 6, address: 0, value: 65536 }); },
  "value", "06 写寄存器 value=65536 抛错");
throwsField(function () { M.buildWriteMultiple({ slaveAddr: 1, function: 15, address: 0, quantity: 1969, dataBytes: [0xFF] }); },
  "quantity", "0F 数量 1969 抛错");
throwsField(function () { M.buildWriteMultiple({ slaveAddr: 1, function: 16, address: 0, dataBytes: [0x01] }); },
  "dataBytes", "10 奇数长度 dataBytes 抛错");
throwsField(function () { M.parseFrame("ZZZZ"); }, "hexStr", "parseFrame 非十六进制抛错");
throwsField(function () { M.parseFrame("0103"); }, "hexStr", "parseFrame 字节不足抛错");

/* ---------- 2. 生成向量 ---------- */
var ex = M.generateExample();
eq(ex.hex, "01 03 00 00 00 02 C4 0B", "generateExample 输出固定示例帧");
eq(ex.compact, "010300000002C40B", "generateExample 紧凑格式");

var r1 = M.buildReadFrame({ slaveAddr: 1, function: 3, address: 0, quantity: 2 });
eq(r1.hex, "01 03 00 00 00 02 C4 0B", "buildReadFrame 03/2 寄存器");
eq(r1.bytes.length, 8, "读请求帧 8 字节");

var w5 = M.buildWriteSingle({ slaveAddr: 1, function: 5, address: 0x13, value: 0xFF00 });
eq(w5.hex.slice(0, 11), "01 05 00 13", "buildWriteSingle 05 头部");
eq(w5.hex.slice(12, 17), "FF 00", "buildWriteSingle 05 值 FF00");
var w6 = M.buildWriteSingle({ slaveAddr: 2, function: 6, address: 1, value: 0x0003 });
eq(w6.hex.split(" ").slice(0, 6).join(" "), "02 06 00 01 00 03", "buildWriteSingle 06 头部");

var w10 = M.buildWriteMultiple({ slaveAddr: 1, function: 16, address: 0, dataBytes: [0x00, 0x0A, 0x01, 0x02] });
eq(w10.hex, "01 10 00 00 00 02 04 00 0A 01 02 " +
  M.crc16Modbus([0x01, 0x10, 0x00, 0x00, 0x00, 0x02, 0x04, 0x00, 0x0A, 0x01, 0x02]).hex.split(/(..)/).filter(function (s) { return s; }).reverse().join(" "),
  "buildWriteMultiple 10 功能完整帧");
eq(w10.byteCount, 4, "10 功能字节数 = 数量×2");
eq(w10.quantity, 2, "10 功能数量 = dataBytes/2");

var w0f = M.buildWriteMultiple({ slaveAddr: 1, function: 15, address: 0, quantity: 10, dataBytes: [0x55, 0x02] });
eq(w0f.byteCount, 2, "0F 功能 10 个线圈字节数 = 2");
eq(w0f.hex.split(" ").slice(0, 8).join(" "), "01 0F 00 00 00 0A 02 55", "0F 功能帧头部");

eq(M.formatHex([0x01, 0x03, 0xC4, 0x0B]), "01 03 C4 0B", "formatHex 默认空格分隔");
eq(M.formatHex([0x01, 0x03, 0xC4, 0x0B], { spaced: false }), "0103C40B", "formatHex 紧凑格式");

eq(M.suggestExportName("txt"), "modbus-frame.txt", "suggestExportName txt");
eq(M.suggestExportName("json"), "modbus-frame.json", "suggestExportName json");
throwsField(function () { M.suggestExportName("csv"); }, "kind", "suggestExportName 其他 kind 失败");
throwsField(function () { M.suggestExportName("c"); }, "kind", "suggestExportName c 数组 kind 失败");

/* ---------- 3. 解析向量 ---------- */
var p1 = M.parseFrame("01 03 00 00 00 02 C4 0B");
eq(p1.crcOk, true, "解析正确帧 crcOk=true");
eq(p1.slaveAddr, 1, "解析从站地址");
eq(p1.function, 0x03, "解析功能码 0x03");
eq(p1.isException, false, "非异常帧");
ok(p1.fields.length >= 6, "字段分解表含地址/功能码/数据/CRC");

var p2 = M.parseFrame("01 03 00 00 00 02 C4 0C");
eq(p2.crcOk, false, "CRC 改一位 crcOk=false");
eq(p2.crcExpected.hex, "0BC4", "CRC 失败时标出期望值");
eq(p2.crcActual.hex, "0CC4", "CRC 失败时标出实际值");

/* 异常帧 01 83 02：先算出正确 CRC 再组帧 */
var excBody = [0x01, 0x83, 0x02];
var excCrc = M.crc16Modbus(excBody);
var excHex = M.formatHex(excBody.concat([excCrc.lo, excCrc.hi]));
var pe = M.parseFrame(excHex);
eq(pe.crcOk, true, "异常帧 CRC 通过");
eq(pe.isException, true, "识别异常响应帧");
eq(pe.exceptionCode, 2, "异常码 02");
ok((pe.exceptionName || "").indexOf("非法数据地址") >= 0, "异常码 02 说明为非法数据地址");

var pu = M.parseFrame(M.formatHex((function () {
  var b = [0x01, 0x40, 0x00, 0x00];
  var c = M.crc16Modbus(b);
  return b.concat([c.lo, c.hi]);
})()));
eq(pu.crcOk, true, "未知功能码帧 CRC 通过");
eq(pu.functionName, null, "未知功能码无语义名");
ok((pu.fields[1].note || "").indexOf("未知功能码") >= 0, "未知功能码标注");

/* 容错格式 */
var pf = M.parseFrame("0x01,0x03,0x00,0x00,0x00,0x02,0xC4,0x0B");
eq(pf.crcOk, true, "容错格式：0x 前缀+逗号解析通过");

/* 读响应帧拆解 */
var rspBody = [0x01, 0x03, 0x04, 0x00, 0x0A, 0x01, 0x02];
var rspCrc = M.crc16Modbus(rspBody);
var pr = M.parseFrame(M.formatHex(rspBody.concat([rspCrc.lo, rspCrc.hi])));
eq(pr.crcOk, true, "读响应帧 CRC 通过");
ok(pr.note.indexOf("读响应帧") >= 0, "读响应帧被识别");

/* ---------- 4. 注册与静态检查 ---------- */
ok(GO_SRC.indexOf('"modbus_frame_tool"') >= 0, "categories.go 注册 ID");
ok(GO_SRC.indexOf('"/tools/modbus-frame"') >= 0, "categories.go 注册 Path");
var idx = GO_SRC.indexOf('"modbus_frame_tool"');
ok(GO_SRC.slice(idx, idx + 900).indexOf('Category:    "开发工具"') >= 0, "注册 Category 为开发工具");
ok(GO_SRC.slice(idx, idx + 900).indexOf("New:         true") >= 0, "注册 New 为 true");
var pathCount = 0, m, re = /"\/tools\/[^"]+"/g, seen = {};
while ((m = re.exec(GO_SRC)) !== null) { if (!seen[m[0]]) { seen[m[0]] = true; pathCount++; } }
eq(pathCount, 229, "注册 Path 总数 228→229");
ok(JS_SRC.indexOf("fetch(") < 0 && JS_SRC.indexOf("XMLHttpRequest") < 0, "JS 零 fetch/XHR");
ok(!/src="https?:\/\//.test(TPL_SRC), "模板无外部脚本/样式引用");
ok(TPL_SRC.indexOf("只做 RTU 帧组装与解析") >= 0, "模板含真限制：只做 RTU 组装/解析");
ok(TPL_SRC.indexOf("功能码范围 01/02/03/04/05/06/0F/10") >= 0, "模板含真限制：功能码范围");
ok(TPL_SRC.indexOf("不做 ASCII 编码") >= 0, "模板含真限制：不做 ASCII/串口收发");
ok(TPL_SRC.indexOf("不收集、不上传") >= 0, "模板含真限制：不收集、不上传");
ok(TPL_SRC.indexOf("/tools/crc-checksum-calculator") >= 0, "互链 CRC 校验和计算器");
ok(TPL_SRC.indexOf("bitfield") < 0 && TPL_SRC.indexOf("gif") < 0, "模板不含未交付工具硬凑互链");

console.log("modbus_frame_tool: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
