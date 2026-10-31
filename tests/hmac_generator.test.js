/* HMAC 生成器纯逻辑单元测试（零依赖）：node tests/hmac_generator.test.js
 * 覆盖：RFC 4231 SHA-256 向量、SHA-384/512 长度与确定性、密钥/消息敏感性、
 * 三种密钥口径解析与一致性、非法十六进制与空密钥报错、前缀剥离与大小写
 * 归一化、Hex⇄Base64 互转、比对二值结论、示例载入、注册与零网络请求静态检查。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/hmac_generator.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function throws(fn, substr, name) {
  try { fn(); ok(false, name + "（应抛错未抛）"); }
  catch (e) { ok(String(e.message).indexOf(substr) >= 0, name + "（报错应含「" + substr + "」，实得「" + e.message + "」）"); }
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "hmac_generator.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "hmac_generator.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

async function main() {
  /* ---------- 1. RFC 4231 向量 ---------- */
  var rfc = await M.computeOutputs(M.EXAMPLES.rfc4231.key, "hex", "Hi There", "SHA-256");
  eq(rfc.hex, "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7", "RFC 4231：HMAC-SHA256 向量");
  eq(rfc.hex.length, 64, "RFC 4231：SHA-256 十六进制 64 字符");
  eq(rfc.prefixed, "sha256=b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7", "RFC 4231：带 sha256= 前缀");
  eq(rfc.base64, M.hexToBase64(rfc.hex), "RFC 4231：Hex 与 Base64 互转一致");

  /* ---------- 2. SHA-384/512 长度、确定性、敏感性 ---------- */
  var h384a = await M.computeOutputs(M.EXAMPLES.rfc4231.key, "hex", "Hi There", "SHA-384");
  var h384b = await M.computeOutputs(M.EXAMPLES.rfc4231.key, "hex", "Hi There", "SHA-384");
  eq(h384a.hex.length, 96, "SHA-384：十六进制 96 字符");
  eq(h384a.hex, h384b.hex, "SHA-384：同输入同输出（确定性）");
  eq(h384a.prefix, "sha384=", "SHA-384：前缀 sha384=");
  var h512a = await M.computeOutputs(M.EXAMPLES.rfc4231.key, "hex", "Hi There", "SHA-512");
  var h512b = await M.computeOutputs(M.EXAMPLES.rfc4231.key, "hex", "Hi There", "SHA-512");
  eq(h512a.hex.length, 128, "SHA-512：十六进制 128 字符");
  eq(h512a.hex, h512b.hex, "SHA-512：同输入同输出（确定性）");
  eq(h512a.prefix, "sha512=", "SHA-512：前缀 sha512=");
  var diffKey = await M.computeOutputs(M.EXAMPLES.rfc4231.key, "hex", "Hi There!", "SHA-256");
  ok(diffKey.hex !== rfc.hex, "敏感性：改消息输出变化");
  var diffMsg = await M.computeOutputs("0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c", "hex", "Hi There", "SHA-256");
  ok(diffMsg.hex !== rfc.hex, "敏感性：改密钥输出变化");

  /* ---------- 3. 三种密钥口径一致 ---------- */
  var byText = await M.computeOutputs("key", "text", "The quick brown fox jumps over the lazy dog", "SHA-256");
  var byHex = await M.computeOutputs("6b6579", "hex", "The quick brown fox jumps over the lazy dog", "SHA-256");
  var byB64 = await M.computeOutputs("a2V5", "base64", "The quick brown fox jumps over the lazy dog", "SHA-256");
  eq(byText.hex, byHex.hex, "口径一致：文本 key 与十六进制 6b6579 结果相同");
  eq(byText.hex, byB64.hex, "口径一致：文本 key 与 Base64 a2V5 结果相同");
  eq(M.keyModeLabel("text"), "文本（UTF-8）", "口径标注：文本");
  eq(M.keyModeLabel("hex"), "十六进制", "口径标注：十六进制");
  eq(M.keyModeLabel("base64"), "Base64", "口径标注：Base64");
  eq(M.parseKey("key", "text").length, 3, "文本口径：key 为 3 字节");
  eq(M.bytesToHex(M.parseKey("6B6579", "hex")), "6b6579", "十六进制口径：大写可解析并归一化小写");

  /* ---------- 4. 非法输入报错 ---------- */
  throws(function () { M.parseKey("abc", "hex"); }, "偶数", "非法十六进制：奇数位报错");
  throws(function () { M.parseKey("zz", "hex"); }, "非法字符", "非法十六进制：非法字符报错");
  throws(function () { M.parseKey("", "text"); }, "不能为空", "空密钥：文本口径报错");
  throws(function () { M.parseKey("   ", "hex"); }, "不能为空", "空密钥：十六进制口径报错");
  throws(function () { M.parseKey("", "base64"); }, "不能为空", "空密钥：Base64 口径报错");
  throws(function () { M.parseKey("!!!", "base64"); }, "Base64", "非法 Base64 报错");
  throws(function () { M.algorithmInfo("SHA-999"); }, "不支持", "不支持的算法报错");

  /* ---------- 5. Hex⇄Base64 互转 ---------- */
  eq(M.hexToBase64("00ff10"), "AP8Q", "Hex→Base64：00ff10");
  eq(M.base64ToHex("AP8Q"), "00ff10", "Base64→Hex：AP8Q");
  eq(M.base64ToHex(M.hexToBase64(rfc.hex)), rfc.hex, "互转往返：RFC 向量 Hex→Base64→Hex 不变");

  /* ---------- 6. 前缀剥离与比对 ---------- */
  eq(M.stripPrefix("sha256=ABCDEF").stripped, "ABCDEF", "前缀剥离：sha256=");
  eq(M.stripPrefix("SHA384=xyz").prefix, "sha384=", "前缀剥离：大小写不敏感且归一化小写");
  eq(M.stripPrefix("abcdef").prefix, null, "前缀剥离：无前缀时 prefix 为 null");
  var cmp1 = M.compareSignatures(rfc.hex, "SHA256=" + rfc.hex.toUpperCase());
  ok(cmp1.match, "比对：含 sha256= 前缀＋大写十六进制判一致");
  eq(cmp1.expectedHex, rfc.hex, "比对：归一化后期望摘要与实际一致");
  var tampered = (rfc.hex[0] === "b" ? "c" : "b") + rfc.hex.slice(1);
  ok(!M.compareSignatures(rfc.hex, tampered).match, "比对：改一位判不一致");
  var cmpB64 = M.compareSignatures(rfc.hex, rfc.base64);
  ok(cmpB64.match, "比对：Base64 期望签名判一致");
  eq(cmpB64.expectedFormat, "base64", "比对：Base64 口径识别正确");
  throws(function () { M.compareSignatures(rfc.hex, ""); }, "不能为空", "比对：空期望签名报错");

  /* ---------- 7. 示例 ---------- */
  eq(M.EXAMPLES.webhook.keyMode, "text", "示例一：Webhook 密钥口径为文本");
  ok(M.EXAMPLES.webhook.message.indexOf("order.paid") >= 0, "示例一：Webhook 消息含 JSON 负载");
  eq(M.EXAMPLES.rfc4231.message, "Hi There", "示例二：RFC 向量消息为 Hi There");
  eq(M.EXAMPLES.rfc4231.keyMode, "hex", "示例二：RFC 向量密钥口径为十六进制");
  var web = await M.computeOutputs(M.EXAMPLES.webhook.key, M.EXAMPLES.webhook.keyMode, M.EXAMPLES.webhook.message, "SHA-256");
  eq(web.hex.length, 64, "示例一：载入后可计算，SHA-256 长度 64");

  /* ---------- 8. 注册与零网络静态检查 ---------- */
  ok(GO_SRC.indexOf('"hmac_generator"') >= 0, "注册：ID hmac_generator 已注册");
  ok(GO_SRC.indexOf('"/tools/hmac-generator"') >= 0, "注册：Path /tools/hmac-generator 已注册");
  ok(GO_SRC.indexOf('Category:    "开发工具"') >= 0, "注册：开发工具品类存在");
  var paths = GO_SRC.match(/"\/tools\/[^"]+"/g) || [];
  eq(new Set(paths).size, 248, "注册：Path 总数→248（历史遗留陈旧断言同步）");
  ok(TPL_SRC.indexOf("仅调试用") >= 0 && TPL_SRC.indexOf("勿贴真实生产密钥") >= 0, "真限制：仅调试用、勿贴真实生产密钥页面可见");
  ok(TPL_SRC.indexOf("HMAC 不是加密") >= 0, "真限制：HMAC 不是加密页面可见");
  ok(TPL_SRC.indexOf("不做文件 HMAC") >= 0, "真限制：不做文件 HMAC 页面可见");
  ok(TPL_SRC.indexOf("安全上下文") >= 0, "真限制：需安全上下文页面可见");
  ok(TPL_SRC.indexOf("编码口径") >= 0, "真限制：编码口径页面可见");
  ok(JS_SRC.indexOf("fetch(") < 0 && JS_SRC.indexOf("XMLHttpRequest") < 0, "零网络：JS 无 fetch/XHR");
  ok(TPL_SRC.indexOf("fetch(") < 0 && TPL_SRC.indexOf("XMLHttpRequest") < 0, "零网络：模板无 fetch/XHR");
  ok(TPL_SRC.indexOf('src="http') < 0 && TPL_SRC.indexOf("cdn.") < 0, "零网络：模板无外部脚本/CDN");
  ok(TPL_SRC.indexOf("hmac_generator.js") >= 0, "模板：引用 hmac_generator.js");
  ok(TPL_SRC.indexOf('id="hmg-key"') >= 0 && TPL_SRC.indexOf('id="hmg-message"') >= 0, "模板：密钥与消息输入区存在");
  ok(TPL_SRC.indexOf('id="hmg-expected"') >= 0, "模板：期望签名比对区存在");

  console.log("PASS " + pass + " FAIL " + fail);
  if (fail > 0) process.exit(1);
}

main().catch(function (e) { console.error("ERROR:", e && e.stack || e); process.exit(1); });
