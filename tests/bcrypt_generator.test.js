/* Bcrypt 生成与验证器纯逻辑单元测试（含真实 bcryptjs 生成/验证断言）：
 * node tests/bcrypt_generator.test.js
 * 覆盖：成本格式化与范围、固定盐校验、哈希解析与报错文案、拆解四段与
 * 拼接还原、随机盐差异性、固定盐复现性、生成格式与成本段一致性、
 * 验证匹配/不匹配/非法报错/空口令、示例静态检查、注册与零网络请求。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/bcrypt_generator.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function throws(fn, name) {
  try { fn(); ok(false, name + "（应抛错却未抛）"); }
  catch (e) { ok(true, name); return e; }
  return null;
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "bcrypt_generator.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "bcrypt_generator.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");
var VENDOR_SRC = fs.readFileSync(path.join(ROOT, "static", "vendor", "bcrypt.min.js"), "utf8");

/* ---------- 1. 成本格式化与范围 ---------- */
eq(M.padCost(4), "04", "成本 4 补零为 04");
eq(M.padCost(10), "10", "成本 10 不补零");
eq(M.padCost(15), "15", "成本 15 不补零");
ok(M.isGenerateCost(4), "生成成本下限 4 合法");
ok(M.isGenerateCost(15), "生成成本上限 15 合法");
ok(M.isGenerateCost(10), "生成成本默认 10 合法");
ok(!M.isGenerateCost(3), "生成成本 3 非法");
ok(!M.isGenerateCost(16), "生成成本 16 非法");
ok(!M.isGenerateCost(10.5), "生成成本非整数非法");
eq(M.MIN_COST, 4, "MIN_COST 为 4");
eq(M.MAX_COST, 15, "MAX_COST 为 15");

/* ---------- 2. 固定盐校验 ---------- */
ok(M.isValidSalt22("abcdefghijklmnopqrstuv"), "22 字符合法盐通过");
ok(M.isValidSalt22("./ABCDEFGHIJKLMNOPQRST"), "含 ./ 的合法盐通过");
ok(!M.isValidSalt22("abcdefghijklmnopqrstu"), "21 字符盐非法");
ok(!M.isValidSalt22("abcdefghijklmnopqrstuvw"), "23 字符盐非法");
ok(!M.isValidSalt22("abcdefghijklmnopqrstu*"), "含 * 的盐非法（不在 bcrypt 字母表）");
ok(!M.isValidSalt22(""), "空盐非法");
ok(M.BCRYPT_B64.indexOf(".") === 0 && M.BCRYPT_B64.indexOf("/") === 1, "bcrypt 字母表顺序：. 为 0、/ 为 1");

/* ---------- 3. 哈希解析与报错 ---------- */
var GOOD = "$2b$10$abcdefghijklmnopqrstuug6DiuB7U1GMAQeSYEnwZG6uqcCKNidK";
var p = M.parseHash(GOOD);
ok(!!p, "合法 $2b$ 哈希可解析");
eq(p.version, "2b", "解析：版本 2b");
eq(p.cost, 10, "解析：成本 10");
eq(p.salt, "abcdefghijklmnopqrstuu", "解析：盐 22 字符（末字符按 bcrypt 16 字节编码规范化，v→u）");
eq(p.body.length, 31, "解析：哈希体 31 字符");
eq(M.joinParts(p), GOOD, "四段拼接还原等于原哈希");
eq(M.hashError(GOOD), null, "合法哈希无报错");
ok(M.hashError("") !== null, "空哈希报错");
ok(M.hashError("$2a$10$abcdefghijklmnopqrstuug6DiuB7U1GMAQeSYEnwZG6uqcCKNidK") !== null, "非 $2b$ 版本报错");
ok(M.hashError("$2b$10$abcdefghijklmnopqrstuu") !== null, "长度不足报错");
ok(M.hashError("$2b$03$abcdefghijklmnopqrstuug6DiuB7U1GMAQeSYEnwZG6uqcCKNidK") !== null, "成本 03 非法报错");
ok(M.hashError("$2b$10$abcdefghijklmnopqrstu*g6DiuB7U1GMAQeSYEnwZG6uqcCKNidK") !== null, "盐含非法字符报错");
throws(function () { M.dissectHash("$2b$10$short"); }, "非法哈希拆解抛错、不展示残段");

/* ---------- 4. 盐拼装 ---------- */
eq(M.makeSalt(10, "abcdefghijklmnopqrstuv"), "$2b$10$abcdefghijklmnopqrstuv", "固定盐拼装格式");
ok(M.makeSalt(10, null).indexOf("$2b$10$") === 0, "随机盐以 $2b$10$ 开头");
ok(M.makeSalt(4, null).indexOf("$2b$04$") === 0, "随机盐成本 4 段一致");
ok(M.makeSalt(15, null).indexOf("$2b$15$") === 0, "随机盐成本 15 段一致（只拼盐不哈希）");
throws(function () { M.makeSalt(10, "short"); }, "非法固定盐拼装抛错");
throws(function () { M.makeSalt(3, null); }, "非法成本拼装抛错");

/* ---------- 5. 生成闭环（真实 bcryptjs） ---------- */
var g10 = M.generateHashSync("demo1234", 10, null);
ok(g10.hash.indexOf("$2b$10$") === 0, "demo1234 成本 10 生成哈希以 $2b$10$ 开头");
eq(g10.hash.length, 60, "生成哈希总长 60 字符");
ok(typeof g10.elapsedMs === "number" && g10.elapsedMs >= 0, "生成耗时为实测毫秒数");
eq(g10.cost, 10, "生成返回成本 10");
var g10b = M.generateHashSync("demo1234", 10, null);
ok(g10.hash !== g10b.hash, "同口令两次生成因随机盐不同");
var g4 = M.generateHashSync("demo1234", 4, null);
ok(g4.hash.indexOf("$2b$04$") === 0, "成本 4 生成哈希成本段一致");
var g12 = M.generateHashSync("demo1234", 12, null);
ok(g12.hash.indexOf("$2b$12$") === 0, "成本 12 生成哈希成本段一致");
var f1 = M.generateHashSync("demo1234", 10, "abcdefghijklmnopqrstuv");
var f2 = M.generateHashSync("demo1234", 10, "abcdefghijklmnopqrstuv");
eq(f1.hash, f2.hash, "固定盐复现逐字相同");
eq(f1.hash, "$2b$10$abcdefghijklmnopqrstuubAuHEKkstfFTty6XLHR2tswEb0slScC", "固定盐复现值与已知向量一致");
throws(function () { M.generateHashSync("", 10, null); }, "空口令不生成");
throws(function () { M.generateHashSync("demo1234", 16, null); }, "非法成本不生成");

/* ---------- 6. 验证闭环（真实 bcryptjs） ---------- */
var v = M.verifyHashSync("demo1234", g10.hash);
ok(v.match === true, "原口令验证匹配");
eq(v.cost, 10, "验证返回成本 10");
ok(typeof v.elapsedMs === "number" && v.elapsedMs >= 0, "验证耗时为实测毫秒数");
ok(M.verifyHashSync("demo1235", g10.hash).match === false, "改一字口令验证不匹配");
ok(M.verifyHashSync("demo-verify", GOOD).match === true, "示例 2 已知口令＋哈希对验证匹配");
throws(function () { M.verifyHashSync("demo1234", "$2b$10$short"); }, "非法哈希验证抛错、不判不匹配");
throws(function () { M.verifyHashSync("demo1234", "$2a$10$abcdefghijklmnopqrstuug6DiuB7U1GMAQeSYEnwZG6uqcCKNidK"); }, "非 $2b$ 哈希验证抛错");
throws(function () { M.verifyHashSync("", GOOD); }, "空口令不验证");

/* ---------- 7. 拆解闭环 ---------- */
var d = M.dissectHash(g10.hash);
eq(d.salt.length, 22, "拆解：盐 22 字符");
eq(d.body.length, 31, "拆解：哈希体 31 字符");
eq(M.joinParts(d), g10.hash, "拆解四段拼接还原等于生成哈希");

/* ---------- 8. 示例静态检查 ---------- */
ok(Array.isArray(M.EXAMPLES) && M.EXAMPLES.length >= 2, "示例不少于 2 组");
eq(M.EXAMPLES[0].password, "demo1234", "示例 1 口令 demo1234");
eq(M.EXAMPLES[0].cost, 10, "示例 1 成本 10");
eq(M.EXAMPLES[1].password, "demo-verify", "示例 2 口令 demo-verify");
ok(TPL_SRC.indexOf("请按需改写") !== -1, "模板含“请按需改写”提示");
ok(TPL_SRC.indexOf("demo1234") !== -1 && TPL_SRC.indexOf("demo-verify") !== -1, "模板含两组示例内容");

/* ---------- 9. 注册静态检查 ---------- */
ok(GO_SRC.indexOf('"bcrypt_generator"') !== -1, "注册 ID bcrypt_generator");
ok(GO_SRC.indexOf('"/tools/bcrypt-generator"') !== -1, "注册 Path /tools/bcrypt-generator");
ok(GO_SRC.indexOf('"lock"') !== -1, "注册 Icon lock");
var pathCount = (GO_SRC.match(/Path:\s*"/g) || []).length;
eq(pathCount, 173, "注册总数 172→173 Path");
ok(TPL_SRC.indexOf('{{define "bcrypt_generator"}}') !== -1, "模板 define 名与路由转换一致");

/* ---------- 10. 真限制与零网络请求静态检查 ---------- */
ok(TPL_SRC.indexOf("仅供测试") !== -1 && TPL_SRC.indexOf("勿贴真实生产口令") !== -1, "真限制：仅测试＋勿贴真实生产口令可见");
ok(TPL_SRC.indexOf("只做") !== -1 && TPL_SRC.indexOf("$2b$") !== -1, "真限制：只做 $2b$ 口径可见");
ok(TPL_SRC.indexOf("不可逆") !== -1, "真限制：bcrypt 不可逆可见");
ok(TPL_SRC.indexOf("不出浏览器") !== -1, "真限制：不出浏览器可见");
ok(TPL_SRC.indexOf("https://www.johnkingzcq123.xyz/tools/bcrypt-generator") !== -1, "SEO canonical 形如家族标准");
ok(JS_SRC.indexOf("fetch(") === -1 && JS_SRC.indexOf("XMLHttpRequest") === -1, "JS 零 fetch/XHR");
ok(!/src="https?:\/\//.test(TPL_SRC), "模板零外部脚本（无 CDN）");
ok(TPL_SRC.indexOf("/tools/static/vendor/bcrypt.min.js") !== -1, "模板加载本地 vendor bcrypt");
ok(TPL_SRC.indexOf("/tools/static/js/bcrypt_generator.js") !== -1, "模板加载本地逻辑脚本");
ok(VENDOR_SRC.length > 10000 && VENDOR_SRC.indexOf("bcrypt") !== -1, "vendor 文件为真实 bcryptjs 体量");
ok(TPL_SRC.indexOf("/tools/password-generator") !== -1 && TPL_SRC.indexOf("/tools/jwt-signer-verifier") !== -1 && TPL_SRC.indexOf("/tools/file-checksum") !== -1, "相关工具互链三项齐全");
ok(TPL_SRC.indexOf('min="4"') !== -1 && TPL_SRC.indexOf('max="15"') !== -1, "成本滑杆 4–15");
ok(TPL_SRC.indexOf("overflow-x:auto") !== -1, "长哈希横向滚动不撑破");

console.log("bcrypt_generator: " + pass + " passed, " + fail + " failed");
if (fail > 0) process.exit(1);
