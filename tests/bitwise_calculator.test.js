/* 位运算计算器纯逻辑单元测试（零依赖）：node tests/bitwise_calculator.test.js
 * 覆盖：规格确定性向量逐字命中、进制解析正反例、64 位 BigInt、移位量取模、
 * 补码格式化、非法输入抛 Error（含 err.field）、注册与零网络请求静态检查、
 * 真限制四条明示、嵌入式簇三工具互链合规。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/bitwise_calculator.js");

var pass = 0, fail = 0;
function sval(v) { return typeof v === "bigint" ? v.toString() + "n" : JSON.stringify(v); }
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + sval(b) + "，实得 " + sval(a) + "）"); }
function throwsWithField(fn, field, name) {
  try { fn(); } catch (e) {
    ok(e instanceof Error, name + "：抛出 Error 类型");
    eq(e.field, field, name + "：err.field");
    return;
  }
  fail++; console.error("FAIL:", name + "：未抛出异常");
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "bitwise_calculator.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "bitwise_calculator.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

function P(s, base, field) { return M.parseOperand(s, base, field); }
var B = BigInt;

/* ---------- 1. 规格确定性向量（逐字命中） ---------- */
eq(M.formatHex(M.bitwiseAnd(P("0xFF00", "hex"), P("0x0F0F", "hex"), 16), 16),
  "0x0F00", "向量：0xFF00 AND 0x0F0F(16)=0x0F00");
eq(M.formatHex(M.bitwiseXor(P("0xFF00", "hex"), P("0x0F0F", "hex"), 16), 16),
  "0xF00F", "向量：0xFF00 XOR 0x0F0F(16)=0xF00F");
eq(M.formatHex(M.bitwiseNot(P("0x00", "hex"), B(0), 8), 8),
  "0xFF", "向量：NOT 0x00(8)=0xFF");
eq(M.formatHex(M.shiftLeft(P("0xDEADBEEF", "hex"), B(4), 32), 32),
  "0xEADBEEF0", "向量：0xDEADBEEF<<4(32)=0xEADBEEF0");
eq(M.formatHex(M.shiftLeft(P("0x81", "hex"), B(1), 8), 8),
  "0x02", "向量：0x81<<1(8)=0x02（溢出丢弃）");
eq(M.formatHex(M.rotateLeft(P("0x81", "hex"), B(1), 8), 8),
  "0x03", "向量：ROL 0x81,1(8)=0x03");
eq(M.formatBin(B("0xA5"), 8), "0b1010 0101", "向量：formatBin(0xA5,8)='0b1010 0101'");
eq(M.formatSigned(B("0xFFFFFFFF"), 32), "-1", "向量：formatSigned(0xFFFFFFFF,32)='-1'");
throwsWithField(function () { P("zz", "hex"); }, "op1", "向量：parseOperand('zz','hex') 抛 Error");
throwsWithField(function () { P("", "dec"); }, "op1", "向量：parseOperand('','dec') 抛 Error");

/* ---------- 2. 进制解析：前缀容忍与正反例 ---------- */
eq(P("0xFF00", "hex"), B("0xFF00"), "解析：0x 前缀十六进制");
eq(P("FF00", "hex"), B("0xFF00"), "解析：无前缀十六进制");
eq(P("0Xff", "hex"), B(255), "解析：0X 大写前缀 + 小写");
eq(P("0b1010", "bin"), B(10), "解析：0b 前缀二进制");
eq(P("1010", "bin"), B(10), "解析：无前缀二进制");
eq(P("0B11", "bin"), B(3), "解析：0B 大写前缀二进制");
eq(P("255", "dec"), B(255), "解析：十进制");
eq(P("  0x1A  ", "hex"), B(26), "解析：首尾空白容忍");
eq(P("-1", "dec", "op2"), B(-1), "解析：十进制负号");
eq(M.normalize(P("-1", "dec"), 32), B("0xFFFFFFFF"), "解析：-1 按 32 位补码归一化为 0xFFFFFFFF");
throwsWithField(function () { P("0b", "bin", "op2"); }, "op2", "非法：仅 0b 前缀");
throwsWithField(function () { P("0x", "hex"); }, "op1", "非法：仅 0x 前缀");
throwsWithField(function () { P("12", "bin"); }, "op1", "非法：二进制含 2");
throwsWithField(function () { P("1.5", "dec"); }, "op1", "非法：十进制小数点");
throwsWithField(function () { P("0x12", "dec"); }, "op1", "非法：十进制带 0x");
throwsWithField(function () { P("  ", "hex"); }, "op1", "非法：纯空白");
throwsWithField(function () { P(null, "hex"); }, "op1", "非法：null 输入");

/* ---------- 3. 运算符全覆盖 ---------- */
eq(M.formatHex(M.bitwiseOr(B("0xF0"), B("0x0F"), 8), 8), "0xFF", "OR：0xF0|0x0F=0xFF");
eq(M.formatHex(M.computeOp("and", B("0xFF00"), B("0x0F0F"), 16), 16), "0x0F00", "computeOp：and");
eq(M.formatHex(M.computeOp("or", B("0xF0"), B("0x0F"), 8), 8), "0xFF", "computeOp：or");
eq(M.formatHex(M.computeOp("xor", B("0xFF"), B("0x0F"), 8), 8), "0xF0", "computeOp：xor");
eq(M.formatHex(M.computeOp("not", B("0x0F"), B(0), 8), 8), "0xF0", "computeOp：not（忽略 b）");
eq(M.formatHex(M.computeOp("shl", B(1), B(3), 8), 8), "0x08", "computeOp：shl");
eq(M.formatHex(M.computeOp("shr", B("0x80"), B(1), 8), 8), "0x40", "computeOp：shr 逻辑右移");
eq(M.formatHex(M.computeOp("rol", B("0x81"), B(1), 8), 8), "0x03", "computeOp：rol");
eq(M.formatHex(M.computeOp("ror", B("0x81"), B(1), 8), 8), "0xC0", "computeOp：ror 0x81 右旋 1=0xC0");
throwsWithField(function () { M.computeOp("nand", B(1), B(1), 8); }, "op", "非法运算符 err.field='op'");

/* ---------- 4. 移位量按位宽取模（n%w） ---------- */
eq(M.formatHex(M.shiftLeft(B(1), B(40), 32), 32), "0x00000100", "取模：1<<40(32) 等价于 1<<8");
eq(M.formatHex(M.shiftLeft(B(1), B(32), 32), 32), "0x00000001", "取模：1<<32(32) 等价于 1<<0");
eq(M.formatHex(M.rotateLeft(B("0x81"), B(9), 8), 8), "0x03", "取模：ROL 9(8) 等价于 ROL 1");
eq(M.formatHex(M.rotateRight(B("0x81"), B(0), 8), 8), "0x81", "取模：ROR 0 原值返回");
eq(M.formatHex(M.shiftRightLogical(B("0xFF"), B(16), 8), 8), "0xFF", "取模：shr 16(8) 等价于 shr 0");

/* ---------- 5. 64 位 BigInt 精确计算 ---------- */
var big = B("0xFFFFFFFFFFFFFFFF");
eq(M.formatHex(M.bitwiseAnd(big, B("0x0F0F0F0F0F0F0F0F"), 64), 64),
  "0x0F0F0F0F0F0F0F0F", "64 位：AND 不丢精度");
eq(M.formatHex(M.bitwiseNot(B(0), B(0), 64), 64),
  "0xFFFFFFFFFFFFFFFF", "64 位：NOT 0 = 全 1");
eq(M.formatDec(big, 64), "18446744073709551615", "64 位：无符号十进制满值");
eq(M.formatSigned(big, 64), "-1", "64 位：补码 -1");
eq(M.formatHex(M.shiftLeft(B(1), B(63), 64), 64),
  "0x8000000000000000", "64 位：1<<63 精确");

/* ---------- 6. 格式化函数 ---------- */
eq(M.formatHex(B("0xA5"), 8), "0xA5", "formatHex：8 位补零");
eq(M.formatHex(B(0), 32), "0x00000000", "formatHex：零值 32 位");
eq(M.formatHex(B("0xabcdef"), 32), "0x00ABCDEF", "formatHex：大写 + 补零");
eq(M.formatDec(B(255), 8), "255", "formatDec：无符号");
eq(M.formatSigned(B("0x80000000"), 32), "-2147483648", "formatSigned：最小负数");
eq(M.formatSigned(B("0x7FFFFFFF"), 32), "2147483647", "formatSigned：最大正数");
eq(M.formatSigned(B(5), 8), "5", "formatSigned：正数原样");
eq(M.formatBin(B("0xFF00"), 16), "0b1111 1111 0000 0000", "formatBin：16 位两组");
eq(M.formatBin(B(0), 8), "0b0000 0000", "formatBin：零值分组");
eq(M.formatBin(B("0xDEADBEEF"), 32), "0b1101 1110 1010 1101 1011 1110 1110 1111", "formatBin：32 位四组");

/* ---------- 7. 归一化：溢出截断与负数 ---------- */
eq(M.normalize(B("0x1FF"), 8), B("0xFF"), "归一化：超位宽截断");
eq(M.normalize(B(-2), 8), B("0xFE"), "归一化：负数补码");

/* ---------- 8. 表达式回显 ---------- */
eq(M.buildExpression("and", "0xFF00", "0x0F0F", "0x0F00"),
  "0xFF00 AND 0x0F0F = 0x0F00", "表达式：AND 回显");
eq(M.buildExpression("not", "0x00", "", "0xFF"),
  "NOT 0x00 = 0xFF", "表达式：NOT 单操作数回显");
eq(M.buildExpression("rol", "0x81", "1", "0x03"),
  "0x81 ROL 1 = 0x03", "表达式：ROL 回显");

/* ---------- 9. 注册与静态检查 ---------- */
ok(GO_SRC.indexOf('"bitwise_calculator"') >= 0, "categories.go 注册 ID");
ok(GO_SRC.indexOf('"/tools/bitwise-calculator"') >= 0, "categories.go 注册 Path");
var idx = GO_SRC.indexOf('"bitwise_calculator"');
ok(GO_SRC.slice(idx, idx + 900).indexOf('Category:    "开发工具"') >= 0, "注册 Category 为开发工具");
ok(GO_SRC.slice(idx, idx + 900).indexOf("New:         true") >= 0, "注册 New 为 true");
ok(GO_SRC.slice(idx, idx + 900).indexOf('Icon:        "engineering"') >= 0, "注册 Icon 为 engineering");
var pathCount = 0;
var m;
var re = /"\/tools\/[^"]+"/g;
var seen = {};
while ((m = re.exec(GO_SRC)) !== null) { if (!seen[m[0]]) { seen[m[0]] = true; pathCount++; } }
eq(pathCount, 241, "注册 Path 总数 240→241");
ok(JS_SRC.indexOf("fetch(") < 0 && JS_SRC.indexOf("XMLHttpRequest") < 0, "JS 零 fetch/XHR");
ok(!/src="https?:\/\//.test(TPL_SRC), "模板无外部脚本/样式引用");
ok(!/href="https?:\/\/(?!www\.johnkingzcq123\.xyz)/.test(TPL_SRC), "模板无外部超链接");

/* ---------- 10. 真限制四条页面明示 ---------- */
ok(TPL_SRC.indexOf("64 位走 BigInt") >= 0, "模板含真限制：64 位走 BigInt");
ok(TPL_SRC.indexOf("移位量按位宽取模") >= 0, "模板含真限制：移位量按位宽取模");
ok(TPL_SRC.indexOf("负数按补码显示") >= 0, "模板含真限制：负数按补码显示");
ok(TPL_SRC.indexOf("全程本地计算、零上传") >= 0, "模板含真限制：全程本地计算、零上传");

/* ---------- 11. 互链合规：嵌入式簇三工具 ---------- */
ok(TPL_SRC.indexOf("/tools/register-bitfield") >= 0, "互链寄存器位域查看与编辑器");
ok(TPL_SRC.indexOf("/tools/hex-c-array") >= 0, "互链 HEX ↔ C 数组互转器");
ok(TPL_SRC.indexOf("/tools/crc-checksum-calculator") >= 0, "互链 CRC 校验和计算器");
/* 模板内所有 /tools/xxx 外链必须已在 categories.go 注册（不链未交付工具）。 */
var hrefRe = /href="(\/tools\/[a-z0-9\-\/]+)"/g;
var hm, bad = [];
while ((hm = hrefRe.exec(TPL_SRC)) !== null) {
  if (hm[1] === "/tools/static") continue;
  if (GO_SRC.indexOf('"' + hm[1] + '"') < 0) bad.push(hm[1]);
}
eq(bad.length, 0, "模板外链全部已注册（实得未注册：" + JSON.stringify(bad) + "）");

console.log("bitwise_calculator: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
