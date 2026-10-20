/* 文件校验和计算器纯逻辑单元测试（零依赖）：node tests/file_checksum.test.js
 * 覆盖：
 *  1. SHA-256 / SHA-512 / SHA-1 标准测试向量（含空串、"abc"、跨块边界、多块长串）
 *  2. 增量喂数据：任意分片尺寸（模拟 File.slice 分片）与一次性结果一致
 *  3. 官方值归一化：大小写/空格/换行/sha*sum "哈希 文件名" 形态
 *  4. 比对逻辑：一致/不一致/空值
 *  5. 工厂函数：未知算法抛错；hashBytes 便捷函数
 */
"use strict";
var FC = require("../static/js/file_checksum_core.js");
var crypto = require("crypto");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + b + "，实得 " + a + ")"); }
function bytes(s) { return Buffer.from(s, "utf8"); }

/* 与 node:crypto 交叉验证（独立实现对照） */
function ref(algo, buf) { return crypto.createHash(algo).update(buf).digest("hex"); }

/* ---------- 1. 标准测试向量 ---------- */
eq(FC.hashBytes("sha256", bytes("")), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", "SHA-256 空串");
eq(FC.hashBytes("sha256", bytes("abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", "SHA-256 abc");
eq(FC.hashBytes("sha1", bytes("")), "da39a3ee5e6b4b0d3255bfef95601890afd80709", "SHA-1 空串");
eq(FC.hashBytes("sha1", bytes("abc")), "a9993e364706816aba3e25717850c26c9cd0d89d", "SHA-1 abc");
eq(FC.hashBytes("sha512", bytes("")), "cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e", "SHA-512 空串");
eq(FC.hashBytes("sha512", bytes("abc")), "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f", "SHA-512 abc");
/* 标准多块向量 "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"（448 bits，SHA-256/512/1 官方向量） */
var std = "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq";
eq(FC.hashBytes("sha256", bytes(std)), "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1", "SHA-256 标准多块向量");
eq(FC.hashBytes("sha1", bytes(std)), "84983e441c3bd26ebaae4aa1f95129e5e54670f1", "SHA-1 56 字节向量");
eq(FC.hashBytes("sha512", bytes(std)), "204a8fc6dda82f0a0ced7beb8e08a41657c16ef468b228a8279be331a703c33596fd15c13b1b07f9aa1d3bea57789ca031ad85c7a71dd70354ec631238ca3445", "SHA-512 56 字节向量");
/* 恰好 55/56/64/128 字节边界（填充逻辑临界） */
["", "a", "abc", std].forEach(function (s) {
    [55, 56, 57, 63, 64, 65, 111, 112, 119, 120, 127, 128, 129, 200].forEach(function (n) {
        var b = bytes(new Array(n + 1).join("x") + s);
        ["sha256", "sha512", "sha1"].forEach(function (algo) {
            eq(FC.hashBytes(algo, new Uint8Array(b)), ref(algo, b), algo + " 长度 " + b.length + " 与 node:crypto 一致");
        });
    });
});

/* ---------- 2. 增量分片：任意切分与一次性一致 ---------- */
function chunked(algo, buf, sizes) {
    var h = FC.create(algo), off = 0, si = 0;
    while (off < buf.length) {
        var n = sizes[si % sizes.length]; si++;
        h.update(new Uint8Array(buf.subarray(off, Math.min(off + n, buf.length))));
        off += n;
    }
    return h.digest();
}
var rnd = crypto.randomBytes(300000); /* 300KB 随机数据 */
[["sha256", [1]], ["sha256", [3, 7, 64, 65, 4096]], ["sha512", [1, 127, 128, 129, 5000]],
 ["sha1", [2, 63, 64, 100000]], ["sha256", [FC.CHUNK_SIZE]]].forEach(function (c) {
    eq(chunked(c[0], rnd, c[1]), ref(c[0], rnd), c[0] + " 分片 " + JSON.stringify(c[1]) + " 增量一致");
});
/* update 链式调用返回自身 */
ok(FC.create("sha256").update(bytes("a")).update(bytes("b")) instanceof Object, "update 链式调用");

/* ---------- 3. 官方值归一化 ---------- */
eq(FC.normalizeHash("BA7816bf8F01cfea414140DE5dae2223b00361a396177a9cb410ff61f20015AD"),
   "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", "归一化：大小写");
eq(FC.normalizeHash("ba78 16bf\n8f01\tcfea"), "ba7816bf8f01cfea", "归一化：空格/换行/制表");
eq(FC.normalizeHash("  ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad  ubuntu-24.04.iso\n"),
   "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", "归一化：sha256sum 行形态取哈希");
eq(FC.normalizeHash("d41d8cd98f00b204e9800998ecf8427e  *C:\\path\\file.zip\r\n"),
   "d41d8cd98f00b204e9800998ecf8427e", "归一化：sha*sum 二进制标记与 CRLF");
eq(FC.normalizeHash(""), "", "归一化：空串");
eq(FC.normalizeHash(null), "", "归一化：null");

/* ---------- 4. 比对逻辑 ---------- */
var good = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
ok(FC.compareHash(good, good.toUpperCase()).match, "比对：大小写不同仍一致");
ok(FC.compareHash(good, "  " + good.slice(0, 32) + "\n" + good.slice(32) + "  ").match, "比对：空白不同仍一致");
ok(FC.compareHash(good, good + "  ubuntu.iso").match, "比对：sha256sum 行粘贴一致");
ok(!FC.compareHash(good, good.slice(0, 63) + "0").match, "比对：末位不同判不一致");
ok(!FC.compareHash(good, "").match, "比对：官方值为空判不一致");
ok(!FC.compareHash("", good).match, "比对：计算值为空判不一致");

/* ---------- 5. 工厂与元信息 ---------- */
var threw = false;
try { FC.create("md5"); } catch (e) { threw = true; }
ok(threw, "未知算法抛错");
eq(FC.ALGORITHMS.length, 3, "算法 3 个");
eq(FC.CHUNK_SIZE, 4 * 1024 * 1024, "分片 4MB");
eq(typeof FC.formatSize(1536), "string", "formatSize 返回字符串");
ok(FC.formatSize(5 * 1024 * 1024 * 1024).indexOf("GB") !== -1, "formatSize GB");

console.log("\n通过 " + pass + "，失败 " + fail);
process.exit(fail ? 1 : 0);
