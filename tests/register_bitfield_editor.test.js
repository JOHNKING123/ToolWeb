/* 寄存器位域查看与编辑器纯逻辑单元测试（零依赖）：node tests/register_bitfield_editor.test.js
 * 覆盖：输入解析向量（hex/dec/bin/auto、非法抛错 err.field、超 32 位抛错）、
 * 位操作向量（setBit/clearBit/toggleBit、bit 字段抛错）、输出向量（toHex/toDec/toBin/setBitsList）、
 * 宏生成向量（降序宏行、掩码、自定义前缀、非法前缀）、示例与导出命名向量、
 * 注册与零网络请求静态检查。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/register_bitfield_editor.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function deepEq(a, b, name) { ok(JSON.stringify(a) === JSON.stringify(b), name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
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
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "register_bitfield_editor.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "register_bitfield_editor.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. 输入解析向量 ---------- */
eq(M.parseRegisterInput("0xDEADBEEF"), 3735928559, "parseRegisterInput 0xDEADBEEF");
eq(M.parseRegisterInput("3735928559"), 3735928559, "parseRegisterInput 十进制同值");
eq(M.parseRegisterInput("0b101"), 5, "parseRegisterInput 0b101");
eq(M.parseRegisterInput("DEADBEEF"), 3735928559, "parseRegisterInput 裸 hex 自动识别");
eq(M.parseRegisterInput("FF", "hex"), 255, "parseRegisterInput 显式 hex");
eq(M.parseRegisterInput("0b0000 0101", "bin"), 5, "parseRegisterInput bin 容忍空格");
throwsField(function () { M.parseRegisterInput("xyz"); }, "value", "parseRegisterInput 非法输入 xyz 抛错");
throwsField(function () { M.parseRegisterInput("0x100000000"); }, "value", "parseRegisterInput 超 32 位抛错");
throwsField(function () { M.parseRegisterInput("4294967296"); }, "value", "parseRegisterInput 十进制溢出抛错");
throwsField(function () { M.parseRegisterInput(""); }, "value", "parseRegisterInput 空输入抛错");
throwsField(function () { M.parseRegisterInput("0x", "hex"); }, "value", "parseRegisterInput 只有前缀抛错");
throwsField(function () { M.parseRegisterInput("FF", "oct"); }, "format", "parseRegisterInput 非法格式抛错");

/* ---------- 2. 位操作向量 ---------- */
eq(M.toggleBit(0, 31), 2147483648, "toggleBit(0,31)=0x80000000");
eq(M.setBit(0, 0), 1, "setBit(0,0)=1");
eq(M.clearBit(0x80, 7), 0, "clearBit(0x80,7)=0（单置位位清零）");
eq(M.clearBit(0xFF, 7), 0x7F, "clearBit(0xFF,7)=0x7F（其余位保持）");
eq(M.toggleBit(0x80000001, 31), 1, "toggleBit(0x80000001,31)=1");
eq(M.setBit(4294967295, 31), 4294967295, "setBit 全 1 保持");
throwsField(function () { M.toggleBit(0, 32); }, "bit", "toggleBit bit=32 抛错");
throwsField(function () { M.toggleBit(0, -1); }, "bit", "toggleBit bit=-1 抛错");
throwsField(function () { M.setBit(0, 2.5); }, "bit", "setBit 非整数位号抛错");
throwsField(function () { M.clearBit(-1, 0); }, "value", "clearBit 非法 value 抛错");

/* ---------- 3. 输出向量 ---------- */
eq(M.toHex(0xDEADBEEF), "0xDEADBEEF", "toHex(0xDEADBEEF)");
eq(M.toHex(0), "0x00000000", "toHex(0) 补零");
eq(M.toDec(3735928559), "3735928559", "toDec(3735928559)");
eq(M.toBin(5), "0000 0000 0000 0000 0000 0000 0000 0101", "toBin(5) 4 位分组");
eq(M.toBin(4294967295), "1111 1111 1111 1111 1111 1111 1111 1111", "toBin 全 1");
deepEq(M.setBitsList(0xA5), [0, 2, 5, 7], "setBitsList(0xA5) 升序");
deepEq(M.setBitsList(0), [], "setBitsList(0) 空数组");
throwsField(function () { M.toHex(-1); }, "value", "toHex 非法 value 抛错");

/* ---------- 4. 宏生成向量 ---------- */
var mac = M.generateMacros(0x80000001, "REG");
ok(mac.indexOf("#define REG_BIT31 (1u << 31)") >= 0, "宏含 REG_BIT31");
ok(mac.indexOf("#define REG_BIT0 (1u << 0)") >= 0, "宏含 REG_BIT0");
ok(mac.indexOf("#define REG_VAL 0x80000001u") >= 0, "宏含 REG_VAL");
ok(mac.indexOf("#define REG_SET_MASK 0x80000001u") >= 0, "宏含 REG_SET_MASK");
ok(mac.indexOf("#define REG_CLR_MASK 0x7FFFFFFEu") >= 0, "宏含 REG_CLR_MASK");
ok(mac.indexOf("#define REG_BIT31 (1u << 31)") < mac.indexOf("#define REG_BIT0 (1u << 0)"),
  "置位位宏按位号降序排列");
ok(M.generateMacros(0, "REG").indexOf("_BIT") < 0, "value=0 时不输出置位位宏行");
ok(M.generateMacros(5, "GPIOA").indexOf("#define GPIOA_BIT2 (1u << 2)") >= 0, "自定义前缀 GPIOA");
ok(M.generateMacros(1, "").indexOf("#define REG_BIT0 (1u << 0)") >= 0, "空前缀回退为 REG");
throwsField(function () { M.generateMacros(1, "9X"); }, "prefix", "非法前缀 9X 抛错");

/* ---------- 5. 示例与导出命名 ---------- */
eq(M.generateExample(), 0xDEADBEEF, "generateExample()=0xDEADBEEF");
eq(M.suggestExportName("txt"), "register-bitfield.txt", "suggestExportName txt");
eq(M.suggestExportName("h"), "register-bitfield.h", "suggestExportName h");
throwsField(function () { M.suggestExportName("csv"); }, "kind", "suggestExportName 其他 kind 失败");
throwsField(function () { M.suggestExportName("json"); }, "kind", "suggestExportName json kind 失败");
ok(M.buildExportH(0xDEADBEEF, "REG").indexOf("#ifndef REGISTER_BITFIELD_H") >= 0, "buildExportH 含头文件卫士");
ok(M.buildExportTxt(0xDEADBEEF, "REG").indexOf("HEX：0xDEADBEEF") >= 0, "buildExportTxt 含 HEX 行");

/* ---------- 6. 注册与静态检查 ---------- */
ok(GO_SRC.indexOf('"register_bitfield_editor"') >= 0, "categories.go 注册 ID");
ok(GO_SRC.indexOf('"/tools/register-bitfield"') >= 0, "categories.go 注册 Path");
var idx = GO_SRC.indexOf('"register_bitfield_editor"');
ok(GO_SRC.slice(idx, idx + 900).indexOf('Category:    "开发工具"') >= 0, "注册 Category 为开发工具");
ok(GO_SRC.slice(idx, idx + 900).indexOf("New:         true") >= 0, "注册 New 为 true");
ok(GO_SRC.slice(idx, idx + 900).indexOf('Icon:        "code"') >= 0, "注册 Icon 为 code（tune 在同品类已用）");
var pathCount = 0, m, re = /"\/tools\/[^"]+"/g, seen = {};
while ((m = re.exec(GO_SRC)) !== null) { if (!seen[m[0]]) { seen[m[0]] = true; pathCount++; } }
eq(pathCount, 248, "注册 Path 总数 248→248");
ok(JS_SRC.indexOf("fetch(") < 0 && JS_SRC.indexOf("XMLHttpRequest") < 0, "JS 零 fetch/XHR");
ok(!/src="https?:\/\//.test(TPL_SRC), "模板无外部脚本/样式引用");
ok(TPL_SRC.indexOf("只做 32 位寄存器位级可视化编辑与宏生成") >= 0, "模板含真限制：只做 32 位位级编辑");
ok(TPL_SRC.indexOf("不做实际硬件读写") >= 0, "模板含真限制：不做硬件读写");
ok(TPL_SRC.indexOf("不收集、不上传") >= 0, "模板含真限制：不收集、不上传");
ok(TPL_SRC.indexOf("/tools/modbus-frame") >= 0, "互链 Modbus RTU 帧生成与校验器");
ok(TPL_SRC.indexOf("/tools/crc-checksum-calculator") >= 0, "互链 CRC 校验和计算器");
ok(TPL_SRC.indexOf("bookmark") < 0 && TPL_SRC.indexOf("gif") < 0, "模板不含未交付工具硬凑互链");
ok(TPL_SRC.indexOf('{{define "register_bitfield"}}') >= 0, "模板 define 名与路由 register-bitfield 对应");

console.log("register_bitfield_editor: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
