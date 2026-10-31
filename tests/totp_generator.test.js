/* TOTP 一次性密码生成器纯逻辑单元测试（零依赖）：node tests/totp_generator.test.js
 * 覆盖：RFC 6238 标准向量 6 组×双位数、Base32 解码（大小写／空格／连字符／填充）、
 * 非法字符定位、计数器与动态截断、倒计时公式、otpauth 提取、注册与零网络／零存储静态检查。 */
"use strict";
var fs = require("fs");
var path = require("path");
var nodeCrypto = require("crypto");
var M = require("../static/js/totp_generator.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function has(str, needle, name) { ok(str.indexOf(needle) >= 0, name + "（应含「" + needle + "」）"); }
function notHas(str, needle, name) { ok(str.indexOf(needle) < 0, name + "（不应含「" + needle + "」）"); }

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "totp_generator.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "totp_generator.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

function hmacSha1(keyBytes, counterBytes) {
  var d = nodeCrypto.createHmac("sha1", Buffer.from(keyBytes)).update(Buffer.from(counterBytes)).digest();
  var out = [];
  for (var i = 0; i < d.length; i++) out.push(d[i]);
  return out;
}
function totp(secret, unixSeconds, digits) {
  var v = M.validateSecret(secret);
  if (!v.ok) throw new Error("测试密钥应合法，实为：" + v.error);
  return M.generateTOTPWithHmac(v.bytes, unixSeconds, digits, hmacSha1);
}

/* ---------- 1. RFC 6238 标准向量（示例密钥，6 组×双位数） ---------- */
eq(M.SAMPLE_SECRET, "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", "示例密钥：RFC 6238 公开测试向量");
var vectors = [
  [59, "94287082", "287082"],
  [1111111109, "07081804", "081804"],
  [1111111111, "14050471", "050471"],
  [1234567890, "89005924", "005924"],
  [2000000000, "69279037", "279037"],
  [20000000000, "65353130", "353130"]
];
vectors.forEach(function (v) {
  eq(totp(M.SAMPLE_SECRET, v[0], 8), v[1], "RFC 向量 T=" + v[0] + " 8 位");
  eq(totp(M.SAMPLE_SECRET, v[0], 6), v[2], "RFC 向量 T=" + v[0] + " 6 位（8 位后 6 位）");
});

/* ---------- 2. Base32 解码：大小写／空格／连字符／填充 ---------- */
var ascii = "12345678901234567890";
function decodedText(secret) {
  var v = M.validateSecret(secret);
  if (!v.ok) throw new Error("应合法，实为：" + v.error);
  return Buffer.from(v.bytes).toString("ascii");
}
eq(decodedText(M.SAMPLE_SECRET), ascii, "Base32 解码：示例密钥解出 ASCII 12345678901234567890");
eq(decodedText(M.SAMPLE_SECRET.toLowerCase()), ascii, "Base32 解码：小写密钥可算码");
eq(decodedText("GEZD GNBV GY3T QOJQ GEZD GNBV GY3T QOJQ"), ascii, "Base32 解码：带空格密钥可算码");
eq(decodedText("GEZD-GNBV-GY3T-QOJQ-GEZD-GNBV-GY3T-QOJQ"), ascii, "Base32 解码：带连字符密钥可算码");
eq(decodedText("MY======"), "f", "Base32 解码：带填充 = 的密钥可算码（MY====== 解出 f）");
eq(decodedText("MZXW6==="), "foo", "Base32 解码：带填充 = 的密钥可算码（MZXW6=== 解出 foo）");
eq(totp("gezdgnbvgy3tqojqgezdgnbvgy3tqojq", 59, 6), "287082", "算码：小写示例密钥 T=59 得 287082");
/* 半段密钥说明：前半 16 字符解出 10 字节，与整段 20 字节的 HMAC 不同，
 * 此处仅断言它能算码且为 6 位数字，不与整段向量等同。 */
ok(/^\d{6}$/.test(totp("GEZD GNBV GY3T QOJQ", 59, 6)), "算码：带空格的半段密钥输出为 6 位数字");

/* ---------- 3. 校验：空输入／非法字符定位／解码为空 ---------- */
eq(M.validateSecret("").error, "请输入 Base32 密钥", "校验：空输入提示「请输入 Base32 密钥」");
eq(M.validateSecret("   ").error, "请输入 Base32 密钥", "校验：纯空白输入同样提示空输入");
var bad1 = M.validateSecret("GEZDGNB1GY3TQOJQ");
eq(bad1.ok, false, "校验：含 1 的密钥不合法");
has(bad1.error, "「1」", "校验：非法字符报错指明字符 1");
has(bad1.error, "第8位", "校验：非法字符报错指明位置第 8 位");
var bad0 = M.validateSecret("GEZ0");
has(bad0.error, "第4位", "校验：含 0 时指明位置第 4 位");
var bad8 = M.validateSecret("GEZ8");
has(bad8.error, "第4位", "校验：含 8 时指明位置第 4 位");
var bad9 = M.validateSecret("AB9C");
has(bad9.error, "「9」", "校验：含 9 时指明字符 9");
var badPad = M.decodeBase32("MY=ABC");
eq(badPad.ok, false, "校验：填充符出现在中间不合法");
has(badPad.error, "填充符只能出现在密钥末尾", "校验：中间填充符中文原因");
var emptyDec = M.validateSecret("====");
eq(emptyDec.ok, false, "校验：纯填充符解码为空不合法");
has(emptyDec.error, "解码结果为空", "校验：解码为空中文提示与非法字符区分");
var emptyDec2 = M.decodeBase32("========");
eq(emptyDec2.ok, false, "解码：纯填充符直接解码为空");
var singleChar = M.decodeBase32("M");
eq(singleChar.ok, false, "解码：单字符剩余不足一字节时解码为空");

/* ---------- 4. 计数器与动态截断 ---------- */
eq(M.counterFor(59), 1, "计数器：T=59 时计数器为 1");
eq(M.counterFor(29), 0, "计数器：T=29 时计数器为 0");
eq(M.counterFor(30), 1, "计数器：T=30 时计数器为 1");
eq(M.counterFor(60), 2, "计数器：T=60 时计数器为 2");
var cb = M.counterToBytes(1);
eq(cb.length, 8, "计数器字节：8 字节大端");
eq(cb[7], 1, "计数器字节：计数器 1 的末字节为 1");
eq(cb[0], 0, "计数器字节：计数器 1 的首字节为 0");
eq(M.counterToBytes(256)[6], 1, "计数器字节：计数器 256 的倒数第二字节为 1");
var crafted = [0x7f, 0xff, 0xff, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x00];
eq(M.truncateCode(crafted, 6), "483647", "动态截断：偏移 0、31 位最大值取模 6 位");
eq(M.truncateCode(crafted, 8), "47483647", "动态截断：偏移 0、31 位最大值取模 8 位");
var crafted2 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x12, 0x34, 0x56, 0x78, 0x0f];
eq(M.truncateCode(crafted2, 6), "419896", "动态截断：末字节低 4 位为偏移 15 时取 15-18 字节");
eq(M.truncateCode([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 6), "000000", "动态截断：全零 HMAC 输出补零 000000");

/* ---------- 5. 倒计时公式 ---------- */
eq(M.PERIOD, 30, "倒计时：周期固定 30 秒");
eq(M.remainingSeconds(59), 1, "倒计时：Unix 秒 59 时剩余 1 秒");
eq(M.remainingSeconds(60), 30, "倒计时：Unix 秒 60 整周期时剩余 30 秒");
eq(M.remainingSeconds(0), 30, "倒计时：Unix 秒 0 时剩余 30 秒");
eq(M.remainingSeconds(89), 1, "倒计时：Unix 秒 89 时剩余 1 秒");
eq(M.remainingSeconds(90), 30, "倒计时：Unix 秒 90 整周期时剩余 30 秒");
eq(M.remainingSeconds(75), 15, "倒计时：Unix 秒 75 时剩余 15 秒");
eq(M.progressPercent(60), 100, "进度条：整周期时 100%");
eq(M.progressPercent(75), 50, "进度条：剩余 15 秒时 50%");
eq(M.progressPercent(89), 3, "进度条：剩余 1 秒时约 3%");

/* ---------- 6. otpauth 链接提取 ---------- */
var link = "otpauth://totp/Example:user@example.com?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Example";
var ext = M.extractSecretFromOtpauth(link);
eq(ext.extracted, true, "otpauth 提取：标准链接提取成功");
eq(ext.secret, M.SAMPLE_SECRET, "otpauth 提取：提取的 secret 与示例密钥一致");
eq(totp(link, 59, 6), "287082", "otpauth 提取：整条链接直接算码与示例密钥一致");
var ext2 = M.extractSecretFromOtpauth("otpauth://totp/X?issuer=Example&secret=MY======&digits=6");
eq(ext2.extracted, true, "otpauth 提取：secret 非首个参数时仍能提取");
eq(ext2.secret, "MY======", "otpauth 提取：非首个参数的 secret 值正确");
eq(M.extractSecretFromOtpauth("GEZDGNBVGY3TQOJQ").extracted, false, "otpauth 提取：裸密钥不误判为链接");
eq(M.extractSecretFromOtpauth("otpauth://totp/X?issuer=Example").extracted, false, "otpauth 提取：无 secret 参数的链接不误判提取成功");
eq(M.normalizeSecret("gezd gnbv-gy3tqojq").cleaned, "GEZDGNBVGY3TQOJQ", "归一化：小写＋空格＋连字符去并转大写");
eq(M.validateSecret(link).extracted, true, "校验：otpauth 链接校验结果标记已提取");

/* ---------- 7. 注册与页面静态检查 ---------- */
has(GO_SRC, '"totp_generator"', "注册：categories.go 含 ID totp_generator");
has(GO_SRC, '"/tools/totp-generator"', "注册：categories.go 含 Path /tools/totp-generator");
has(GO_SRC, "TOTP 一次性密码生成器", "注册：categories.go 含名称 TOTP 一次性密码生成器");
has(GO_SRC, '"key"', "注册：图标 key 存在");
var paths = GO_SRC.match(/"\/tools\/[^"]+"/g) || [];
var uniq = paths.filter(function (p, i) { return paths.indexOf(p) === i; });
eq(uniq.length, 247, "注册总数：→247 Path（历史遗留陈旧断言同步）");
var goEntry = GO_SRC.slice(GO_SRC.indexOf('"totp_generator"'), GO_SRC.indexOf('"totp_generator"') + 700);
has(goEntry, "加密解密", "注册：totp_generator 归属加密解密品类");
has(goEntry, "New:", "注册：totp_generator 标记 New");
has(TPL_SRC, "tp-secret", "页面：含密钥输入框");
has(TPL_SRC, 'type="password"', "页面：密钥输入框为 password 型");
has(TPL_SRC, "tp-toggle", "页面：含显示／隐藏切换");
has(TPL_SRC, "tp-sample", "页面：含载入示例");
has(TPL_SRC, "tp-wipe", "页面：含清除密钥");
has(TPL_SRC, "tp-code", "页面：含大字动态码区");
has(TPL_SRC, "tp-remain", "页面：含剩余秒数字");
has(TPL_SRC, "tp-bar", "页面：含倒计时进度条");
has(TPL_SRC, "tp-copy", "页面：含复制当前码按钮");
has(TPL_SRC, "/tools/password-generator", "互链：相关工具含随机密码生成器");
notHas(TPL_SRC, "http-header-analyzer", "互链：不含未交付 HTTP 响应头分析器");
notHas(TPL_SRC, "json-string-escaper", "互链：不含未交付 JSON 字符串转义器");
has(TPL_SRC, "只做本地算码", "真限制：页面可见只做本地算码");
has(TPL_SRC, "不保存密钥", "真限制：页面可见不保存密钥");
has(TPL_SRC, "不做账号绑定与扫码", "真限制：页面可见不做账号绑定与扫码");
has(TPL_SRC, "仅支持 HMAC-SHA1 与 30 秒周期", "真限制：页面可见仅 HMAC-SHA1 与 30 秒周期");
has(TPL_SRC, "设备时间不准则码不对", "真限制：页面可见设备时间不准则码不对");
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/totp-generator", "SEO：canonical 为 totp-generator 地址");
notHas(JS_SRC, "fetch(", "零网络：JS 无 fetch 调用");
notHas(TPL_SRC, "fetch(", "零网络：页面无 fetch 调用");
notHas(JS_SRC, "XMLHttpRequest", "零网络：JS 无 XHR");
notHas(JS_SRC, "localStorage", "零存储：JS 无浏览器存储写入");
notHas(JS_SRC, "sessionStorage", "零存储：JS 无会话存储写入");
notHas(TPL_SRC, "localStorage", "零存储：页面无浏览器存储写入");
notHas(TPL_SRC, "sessionStorage", "零存储：页面无会话存储写入");
notHas(JS_SRC, "document.cookie", "零存储：JS 无 cookie 写入");

console.log("PASS " + pass + " FAIL " + fail + "（共 " + (pass + fail) + " 断言）");
if (fail > 0) process.exit(1);
