/* ULID／NanoID 生成器（ulid_nanoid_generator）纯逻辑单元测试（零依赖）：
 * node tests/ulid_nanoid_generator.test.js
 * 覆盖：ULID 编解码精确向量与往返、非法解码 null、NanoID 长度与字母表向量、
 * 批量行数、钳制与中文提示、超 48 位时间戳拒绝、复制／下载内容一致、
 * 注册（→248 Path，历史遗留陈旧断言同步）与零网络请求静态检查、真限制文案与互链
 * （含 UUID 生成器，不含未交付的 .env 解析器、摩斯码翻译器）。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var U = require("../static/js/ulid_nanoid_generator.js");
var SRC = fs.readFileSync(path.join(__dirname, "..", "static", "js", "ulid_nanoid_generator.js"), "utf8");
var TPL = fs.readFileSync(path.join(__dirname, "..", "templates", "ulid_nanoid_generator.html"), "utf8");
var GO = fs.readFileSync(path.join(__dirname, "..", "tools", "categories.go"), "utf8");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function has(s, sub, name) { ok(s.indexOf(sub) !== -1, name); }
function notHas(s, sub, name) { ok(s.indexOf(sub) === -1, name); }
function throws(fn, name) {
    try { fn(); ok(false, name + "（应抛错却未抛）"); }
    catch (e) { ok(true, name); }
}
function seqRand(seed) {
    var s = seed;
    return function (n) {
        var out = [];
        for (var i = 0; i < n; i++) { s = (s * 1103515245 + 12345) % 256; out.push(s); }
        return out;
    };
}
function zeros(n) { var a = []; for (var i = 0; i < n; i++) { a.push(0); } return a; }
function allIn(str, alphabet) {
    for (var i = 0; i < str.length; i++) { if (alphabet.indexOf(str.charAt(i)) === -1) { return false; } }
    return true;
}

/* ---------- 1. ULID 编码精确向量 ---------- */
eq(U.encodeULID(0, zeros(16)), "00000000000000000000000000", "ULID 向量：时间戳 0 + 全 0 随机 → 26 个 0");
eq(U.encodeULID(0, zeros(16)).length, 26, "ULID 向量：长度 26");
ok(allIn(U.encodeULID(123456789, seqRand(7)(16)), U.CROCKFORD), "ULID 向量：字符全部属于 Crockford 字符集");
ok(U.CROCKFORD.indexOf("I") === -1 && U.CROCKFORD.indexOf("L") === -1 &&
    U.CROCKFORD.indexOf("O") === -1 && U.CROCKFORD.indexOf("U") === -1, "ULID 字符集：不含 I／L／O／U");

/* ---------- 2. ULID 解码往返 ---------- */
[0, 1, 123456789, 1700000000000, Date.now(), 281474976710655].forEach(function (t) {
    eq(U.decodeULID(U.encodeULID(t, seqRand(t % 251 + 1)(16))), t, "ULID 往返：decode(encode(" + t + ")) === " + t);
});
eq(U.decodeULID("00000000000000000000000000"), 0, "ULID 解码：26 个 0 → 时间戳 0");

/* ---------- 3. 非法 ULID 解码返回 null ---------- */
eq(U.decodeULID("0000000000000000000000000"), null, "非法解码：长度 25 → null");
eq(U.decodeULID("000000000000000000000000000"), null, "非法解码：长度 27 → null");
eq(U.decodeULID("0000000000000000000000000I"), null, "非法解码：含 I → null");
eq(U.decodeULID("0000000000000000000000000L"), null, "非法解码：含 L → null");
eq(U.decodeULID("0000000000000000000000000O"), null, "非法解码：含 O → null");
eq(U.decodeULID("0000000000000000000000000U"), null, "非法解码：含 U → null");
eq(U.decodeULID("0000000000000000000000000a"), null, "非法解码：含小写 → null");
eq(U.decodeULID(""), null, "非法解码：空串 → null");
eq(U.decodeULID("0000000000000000000000000-"), null, "非法解码：含连字符 → null");

/* ---------- 4. NanoID 长度与字母表 ---------- */
[8, 21, 64].forEach(function (len) {
    var id = U.generateNanoID(len, U.ALPHABETS.urlsafe, seqRand(len)(len));
    eq(id.length, len, "NanoID 长度：" + len + " 精确");
    ok(allIn(id, U.ALPHABETS.urlsafe), "NanoID 字符：长度 " + len + " 属于 URL 安全字母表");
});
var digits = U.generateNanoID(21, U.ALPHABETS.digits, seqRand(3)(21));
ok(/^[0-9]+$/.test(digits), "NanoID 纯数字预设：结果全为数字");
var lower = U.generateNanoID(21, U.ALPHABETS.lower, seqRand(5)(21));
ok(/^[a-z]+$/.test(lower), "NanoID 小写预设：结果全为小写字母");
eq(U.ALPHABETS.urlsafe.length, 64, "NanoID 字母表：URL 安全集 64 字符");

/* ---------- 5. 批量行数 ---------- */
eq(U.generateBatch("ulid", { count: 1, timestampMs: 1700000000000 }, seqRand(1)).length, 1, "批量：ULID 数量 1 → 1 行");
eq(U.generateBatch("ulid", { count: 10, timestampMs: 1700000000000 }, seqRand(2)).length, 10, "批量：ULID 数量 10 → 10 行");
eq(U.generateBatch("nanoid", { count: 100, length: 21, alphabet: "urlsafe" }, seqRand(3)).length, 100, "批量：NanoID 数量 100 → 100 行");
var batch = U.generateBatch("ulid", { count: 3, timestampMs: 1700000000000 }, seqRand(9));
ok(batch.every(function (id) { return U.decodeULID(id) === 1700000000000; }), "批量：同时间戳 ULID 每行解码时间一致");

/* ---------- 6. 钳制 ---------- */
eq(U.clampNanoLength(5).value, 8, "钳制：长度 5 → 8");
has(U.clampNanoLength(5).message, "钳制", "钳制：长度 5 提示含中文钳制");
eq(U.clampNanoLength(100).value, 64, "钳制：长度 100 → 64");
has(U.clampNanoLength(100).message, "64", "钳制：长度 100 提示含 64");
eq(U.clampCount(0).value, 1, "钳制：数量 0 → 1");
eq(U.clampCount(200).value, 100, "钳制：数量 200 → 100");
has(U.clampCount(200).message, "钳制", "钳制：数量 200 提示含中文钳制");
eq(U.clampNanoLength(21).value, 21, "钳制：长度 21 不变");
eq(U.clampCount(10).value, 10, "钳制：数量 10 不变");

/* ---------- 7. 超 48 位时间戳拒绝 ---------- */
throws(function () { U.encodeULID(281474976710656, zeros(16)); }, "拒绝：时间戳超 48 位编码抛错");
throws(function () { U.encodeULID(-1, zeros(16)); }, "拒绝：负时间戳编码抛错");
throws(function () { U.generateBatch("ulid", { count: 1, timestampMs: 281474976710656 }, seqRand(1)); }, "拒绝：批量超 48 位时间戳抛错");

/* ---------- 8. 本地时间格式与复制／下载内容 ---------- */
eq(U.formatLocalTime(0).length, 19, "本地时间：格式长度 19（YYYY-MM-DD HH:mm:ss）");
ok(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(U.formatLocalTime(1700000000000)), "本地时间：格式符合 YYYY-MM-DD HH:mm:ss");
var ids = ["AAA", "BBB"];
eq(U.buildIdsText(ids), "AAA\nBBB", "复制／下载：内容为结果列表换行分隔、逐字一致");

/* ---------- 9. 注册与静态检查 ---------- */
has(GO, '"ulid_nanoid_generator"', "注册：categories.go 含 ID ulid_nanoid_generator");
has(GO, '"/tools/ulid-nanoid-generator"', "注册：categories.go 含 Path /tools/ulid-nanoid-generator");
eq((GO.match(/Path:\s*"/g) || []).length, 248, "注册：Path 总数→248（历史遗留陈旧断言同步）");
has(TPL, "/tools/uuid-generator", "互链：页面含 UUID 生成器互链");
has(TPL, "要时间可排序用本工具 ULID", "互链：文案写清 ULID 与 UUID 格式区分");
notHas(TPL, "env-parser", "无硬凑互链：页面不含未交付 .env 解析器");
notHas(TPL, "morse-code", "无硬凑互链：页面不含未交付摩斯码翻译器");
has(TPL, "不做分布式 ID 唯一性保证", "真限制：页面明示不做分布式唯一性保证");
has(TPL, "取自本机时钟", "真限制：页面明示时间戳取自本机时钟");
has(TPL, "不存、不查、不上传", "真限制：页面明示不存不查不上传");
notHas(SRC, "fetch(", "零网络：JS 无网络请求调用");
notHas(SRC, "XMLHttpRequest", "零网络：JS 无 XHR");
notHas(SRC, "http://", "零网络：JS 无 http 链接");
notHas(TPL, "fonts.googleapis", "零 CDN：模板无 Google Fonts 外链");
notHas(TPL, "cdn.", "零 CDN：模板无 CDN 域名");
notHas(TPL, '<script src="http', "零 CDN：模板无外链脚本");
has(TPL, "ulid_nanoid_generator.js", "模板：引用本工具 JS");
has(TPL, "ids.txt", "模板：含下载 ids.txt 入口");

console.log("PASS " + pass + " / FAIL " + fail + "（共 " + (pass + fail) + " 断言）");
if (fail > 0) { process.exit(1); }
